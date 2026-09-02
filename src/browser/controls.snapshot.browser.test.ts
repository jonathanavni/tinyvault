import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Secret } from '../core/redaction';
import { createLockdownDomain } from '../supervisor/lockdownDomain';
import { startControlsLab, type ControlsLab } from '../../testbed/fixtures/controls-lab';
import { createBrowserControls } from './controls';
import { launchChromium, type Browser, type BrowserContext } from './playwright';
import { createBrowserSessionHost, type BrowserSessionHost } from './session';

let browser: Browser;
let lab: ControlsLab;
let host: BrowserSessionHost | undefined;
let context: BrowserContext;

beforeAll(async () => {
  browser = await launchChromium();
  lab = await startControlsLab();
});

afterEach(async () => {
  await host?.closeAll();
  host = undefined;
});

afterAll(async () => {
  await lab?.close();
  await browser?.close();
});

async function openAt(route: string) {
  const domain = createLockdownDomain();
  host = createBrowserSessionHost({
    newContext: async () => { context = await browser.newContext(); return context; },
    ...domain,
  });
  const controls = createBrowserControls(host);
  const session = await controls.browser_open_session();
  expect(await controls.browser_navigate({
    sessionId: session.sessionId, url: `${lab.primaryOrigin}${route}?ignored=secret`,
  })).toEqual({ ok: true });
  return { controls, domain, session };
}

async function inject(sessionId: string, value: string) {
  return host!.runExclusive(sessionId, async (port) => {
    const outcome = await port.pinPasswordDestination('#password');
    if (outcome.kind !== 'pinned') throw new Error('test fixture did not pin');
    return outcome.destination.inject(new Secret(value), lab.primaryOrigin);
  });
}

describe('provenance-masked browser snapshots', () => {
  it('kills value-based password masking and query retention with visible username traffic', async () => {
    const { controls, session } = await openAt('/static-token-login');
    const result = await controls.browser_snapshot(session);
    expect(result).toMatchObject({
      ok: true,
      snapshot: {
        url: `${lab.primaryOrigin}/static-token-login`,
        nodes: expect.arrayContaining([
          { tag: 'input', masked: true },
          { tag: 'input', masked: false, value: 'fixture-user' },
        ]),
      },
    });
    if (result.ok) {
      const masked = result.snapshot.nodes.find((node) => node.masked);
      expect(masked).toEqual({ tag: 'input', masked: true });
      expect(Reflect.ownKeys(masked!)).toEqual(['tag', 'masked']);
    }
  });

  it('kills type-based-only taint by masking a mutated, removed, and reinserted filled node', async () => {
    const { controls, session } = await openAt('/static-token-login');
    const secret = 'provenance-secret';
    expect(await inject(session.sessionId, secret)).toMatchObject({ assigned: true });
    await context.pages()[0]!.evaluate(() => {
      const input = document.querySelector('#password') as HTMLInputElement;
      input.type = 'text';
      input.remove();
      document.querySelector('form')!.prepend(input);
    });
    const result = await controls.browser_snapshot(session);
    expect(result).toMatchObject({
      ok: true, snapshot: { nodes: expect.arrayContaining([{ tag: 'input', masked: true }]) },
    });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('kills over-broad masking by leaving caller-typed echo text visible', async () => {
    const { controls, session } = await openAt('/echo-field');
    const text = 'caller-visible-echo';
    expect(await controls.browser_type({ sessionId: session.sessionId, selector: '#echo', text }))
      .toEqual({ ok: true });
    const result = await controls.browser_snapshot(session);
    expect(result).toMatchObject({
      ok: true,
      snapshot: { nodes: expect.arrayContaining([
        expect.objectContaining({ tag: 'input', masked: false, value: text }),
      ]) },
    });
    if (result.ok) {
      expect(result.snapshot.nodes.find((node) => node.tag === 'p'))
        .toEqual({ tag: 'p', masked: false, name: 'echo page' });
    }
  });

  it('kills a false mirror-prevention claim by retaining authorized page-derived span text', async () => {
    const { controls, session } = await openAt('/mirror-span');
    const secret = 'page-mirror-secret';
    expect(await inject(session.sessionId, secret)).toMatchObject({ assigned: true });
    const result = await controls.browser_snapshot(session);
    expect(result).toMatchObject({
      ok: true,
      snapshot: { nodes: expect.arrayContaining([
        expect.objectContaining({ tag: 'span', masked: false, name: secret }),
      ]) },
    });
    if (result.ok) {
      expect(result.snapshot.nodes.find((node) => node.tag === 'span'))
        .toEqual({ tag: 'span', masked: false, name: secret });
    }
  });
});
