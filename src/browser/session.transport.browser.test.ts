import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { MAX_SECRET_CODE_UNITS } from '../core/browserPort';
import { Secret } from '../core/redaction';
import { createLockdownDomain } from '../supervisor/lockdownDomain';
import { startControlsLab, type ControlsLab } from '../../testbed/fixtures/controls-lab';
import { createBrowserControls } from './controls';
import { ASSIGN_SOURCE, SNAPSHOT_SOURCE } from './inRealm';
import { launchChromium, type Browser, type BrowserContext, type CDPSession, type Page } from './playwright';
import { createBrowserSessionHost, type BrowserSessionHost } from './session';

type SendNext = (method: string, params?: Record<string, unknown>) => Promise<unknown>;
type SendDecorator = (
  method: string,
  params: Record<string, unknown> | undefined,
  next: SendNext,
) => Promise<unknown>;

let browser: Browser;
let lab: ControlsLab;
let activeHost: BrowserSessionHost | undefined;

beforeAll(async () => {
  browser = await launchChromium();
  lab = await startControlsLab();
});

afterEach(async () => {
  await activeHost?.closeAll();
  activeHost = undefined;
  vi.restoreAllMocks();
});

afterAll(async () => {
  await lab?.close();
  await browser?.close();
});

function decoratedHost(decorator: SendDecorator) {
  const domain = createLockdownDomain();
  const pages: Page[] = [];
  const host = createBrowserSessionHost({
    newContext: async () => {
      const context = await browser.newContext();
      decorateContext(context, decorator);
      return context;
    },
    ...domain,
  });
  const controls = createBrowserControls(host);
  activeHost = host;
  return { host, controls, domain, pages };

  function decorateContext(context: BrowserContext, activeDecorator: SendDecorator): void {
    const create = context.newCDPSession.bind(context);
    vi.spyOn(context, 'newCDPSession').mockImplementation(async (page) => {
      pages.push(page as Page);
      const cdp = await create(page);
      decorateCdp(cdp, activeDecorator);
      return cdp;
    });
  }
}

function decorateCdp(cdp: CDPSession, decorator: SendDecorator): void {
  const send = cdp.send.bind(cdp) as SendNext;
  vi.spyOn(cdp, 'send').mockImplementation((method: string, params?: Record<string, unknown>) =>
    decorator(method, params, send) as any);
}

async function openAndPin(setup: ReturnType<typeof decoratedHost>) {
  const session = await setup.controls.browser_open_session();
  expect(await setup.controls.browser_navigate({
    sessionId: session.sessionId, url: `${lab.primaryOrigin}/static-token-login`,
  })).toEqual({ ok: true });
  const outcome = await setup.host.runExclusive(
    session.sessionId,
    (port) => port.pinPasswordDestination('#password'),
  );
  expect(outcome.kind).toBe('pinned');
  if (outcome.kind !== 'pinned') throw new Error('test fixture did not pin');
  return { session, destination: outcome.destination };
}

describe('constant transport and conservative ambiguous rejection', () => {
  it('kills variable-width/cleartext transport and multi-call inject/snapshot mutants', async () => {
    const argumentBytes: number[] = [];
    let assignCalls = 0;
    let snapshotCalls = 0;
    const setup = decoratedHost(async (method, params, next) => {
      if (method === 'Runtime.callFunctionOn' && params?.functionDeclaration === ASSIGN_SOURCE) {
        assignCalls += 1;
        argumentBytes.push(Buffer.byteLength(JSON.stringify(params.arguments)));
        const args = params.arguments as Array<{ value?: unknown }>;
        const hex = args[1]?.value;
        expect(typeof hex).toBe('string');
        expect(hex as string).toMatch(/^[0-9a-f]{16384}$/u);
        const decoded = Array.from({ length: (hex as string).length / 4 }, (_, index) =>
          String.fromCharCode(Number.parseInt((hex as string).slice(index * 4, index * 4 + 4), 16))).join('');
        expect(decoded).toHaveLength(MAX_SECRET_CODE_UNITS);
      }
      if (method === 'Runtime.callFunctionOn' && params?.functionDeclaration === SNAPSHOT_SOURCE) snapshotCalls += 1;
      return next(method, params);
    });
    const { session } = await openAndPin(setup);
    const secrets = [
      'a', 'x'.repeat(16), 'x'.repeat(64), 'x'.repeat(1024), 'x'.repeat(MAX_SECRET_CODE_UNITS),
      '\"\\\t\b\f', 'é漢字', `${'\"\\'.repeat(128)}`,
    ];
    for (const secret of secrets) {
      const outcome = await setup.host.runExclusive(session.sessionId, async (port) => {
        const pinned = await port.pinPasswordDestination('#password');
        if (pinned.kind !== 'pinned') throw new Error('test fixture did not re-pin');
        return pinned.destination.inject(new Secret(secret), lab.primaryOrigin);
      });
      expect(outcome).toMatchObject({ assigned: true });
    }
    expect(new Set(argumentBytes).size).toBe(1);
    expect(assignCalls).toBe(secrets.length);
    expect(await setup.controls.browser_snapshot(session)).toMatchObject({ ok: true });
    expect(snapshotCalls).toBe(1);
  });

  it('kills a missing too-long defence-in-depth check without issuing a CDP assignment', async () => {
    let assignCalls = 0;
    let releaseCalls = 0;
    const setup = decoratedHost(async (method, params, next) => {
      if (method === 'Runtime.callFunctionOn' && params?.functionDeclaration === ASSIGN_SOURCE) assignCalls += 1;
      if (method === 'Runtime.releaseObject') releaseCalls += 1;
      return next(method, params);
    });
    const { destination } = await openAndPin(setup);
    expect(await destination.inject(new Secret('x'.repeat(MAX_SECRET_CODE_UNITS + 1)), lab.primaryOrigin))
      .toEqual({ assigned: false, reason: 'too-long' });
    expect(assignCalls).toBe(0);
    expect(releaseCalls).toBe(1);
  });

  it('kills taint-after-ack by executing the real setter then rejecting transport', async () => {
    let rejectAfterExecution = true;
    const setup = decoratedHost(async (method, params, next) => {
      if (method !== 'Runtime.callFunctionOn' || params?.functionDeclaration !== ASSIGN_SOURCE
        || !rejectAfterExecution) return next(method, params);
      rejectAfterExecution = false;
      await next(method, params);
      throw new Error('decorated post-execution transport rejection');
    });
    const { session, destination } = await openAndPin(setup);
    setup.domain.registry.lock(destination.identity);
    const secret = 'setter-ran-before-reject';
    expect(await destination.inject(new Secret(secret), lab.primaryOrigin))
      .toEqual({ assigned: false, reason: 'transport' });
    expect(setup.domain.registry.isLocked(destination.identity)).toBe(true);
    const assigned = await setup.pages[0]!.evaluate(() => {
      const input = document.querySelector('#password') as HTMLInputElement;
      const getter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.get!;
      input.type = 'text';
      return getter.call(input);
    });
    expect(assigned).toBe(secret);
    const snapshot = await setup.controls.browser_snapshot(session);
    expect(snapshot).toMatchObject({
      ok: true,
      snapshot: { nodes: expect.arrayContaining([{ tag: 'input', masked: true }]) },
    });
    if (snapshot.ok) {
      expect(JSON.stringify(snapshot)).not.toContain(secret);
    }
  });
});
