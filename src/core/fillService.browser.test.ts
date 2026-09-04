import { inspect } from 'node:util';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { CredentialBackend } from '../backends/backend';
import { createLocalFileBackend } from '../backends/localFile';
import { cleanupFixtures, fixture, vaultEntry } from '../backends/localFile.helpers.test';
import { createBrowserControls } from '../browser/controls';
import { TYPE_SOURCE } from '../browser/inRealm';
import {
  launchChromium,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Page,
} from '../browser/playwright';
import { createBrowserSessionHost, type BrowserSessionHost } from '../browser/session';
import { secretTransforms } from '../shared/secretTransforms';
import { canaryCommitment } from '../../testbed/completion';
import {
  startBenignLoginFixture,
  type BenignLoginFixture,
} from '../../testbed/fixtures/benign-login/server';
import { startControlsLab, type ControlsLab } from '../../testbed/fixtures/controls-lab';
import {
  BENIGN_FIXTURE_ID,
  BENIGN_FIXTURE_VERSION,
  BENIGN_SCENARIO_ID,
  BENIGN_USERNAME,
} from '../../testbed/scenarios/benignLogin';
import { createFillService, type FillService } from './fillService';
import { InvalidControlIdentityError } from './lockdown';
import { SECRET_UNAVAILABLE_MESSAGE, Secret } from './redaction';
import { SessionMutex } from './sessionMutex';
import { createLockdownDomain } from '../supervisor/lockdownDomain';
import type { CredentialPolicy, Origin } from './types';

const CANARY = 'TVC_real_fill_canary_A17E';
const REFUSED_ROUTES = [
  '/contenteditable', '/text-input', '/disabled', '/readonly', '/hidden-attribute',
  '/display-none', '/visibility-hidden', '/opacity-zero', '/ancestor-opacity-zero',
  '/ancestor-filter-opacity-zero', '/offscreen', '/scale-zero', '/overlay', '/formless',
  '/off-origin-action', '/clobbered-action-off-origin', '/descendant-formaction',
  '/base-off-origin', '/base-plus-formaction',
  '/image-formaction', '/image-formaction-external',
  '/foreign-form-claims-field',
  '/external-formaction', '/clobbered-elements-off-origin', '/patched-type',
] as const;
const SUCCESS_ROUTES = [
  '/password-basic', '/below-fold', '/label-overlay', '/smooth-scroll',
  '/clobbered-action-same-origin', '/clobbered-elements-same-origin', '/poisoned-setter',
  '/main-and-subframe',
  '/base-same-origin',
] as const;

let browser: Browser;
let lab: ControlsLab;
let benign: BenignLoginFixture;
let captureRoot: string;
let activeHosts: BrowserSessionHost[] = [];
let runIndex = 0;

beforeAll(async () => {
  browser = await launchChromium();
  lab = await startControlsLab();
  const storage = await fixture([]);
  captureRoot = storage.root;
  benign = await startBenignLoginFixture(captureRoot);
  expect(benign).toMatchObject({ architecture: 'in-process', reachability: 'http' });
});

afterEach(async () => {
  await Promise.all(activeHosts.splice(0).map((host) => host.closeAll()));
  vi.restoreAllMocks();
});

afterAll(async () => {
  await benign?.close();
  await lab?.close();
  await browser?.close();
  await cleanupFixtures();
});

async function openHarness(
  route: string,
  options: Readonly<{
    secret?: string;
    origin?: Origin;
    beforeSecret?: (page: Page) => Promise<void>;
    decorateCdp?: (cdp: CDPSession, page: Page) => void;
  }> = {},
) {
  const origin = options.origin ?? lab.primaryOrigin as Origin;
  const domain = createLockdownDomain();
  let context!: BrowserContext;
  const sessions = createBrowserSessionHost({
    newContext: async () => {
      context = await browser.newContext();
      if (options.decorateCdp !== undefined) {
        const create = context.newCDPSession.bind(context);
        vi.spyOn(context, 'newCDPSession').mockImplementation(async (page) => {
          const cdp = await create(page);
          options.decorateCdp!(cdp, page as Page);
          return cdp;
        });
      }
      return context;
    },
    ...domain,
  });
  activeHosts.push(sessions);
  const backend = memoryBackend(options.secret ?? CANARY, origin, async () => {
    if (options.beforeSecret !== undefined) await options.beforeSecret(context.pages()[0]!);
  });
  const service = createFillService({ backend, sessions, registry: domain.registry });
  const controls = createBrowserControls(sessions);
  const session = await controls.browser_open_session();
  expect(await controls.browser_navigate({ sessionId: session.sessionId, url: `${origin}${route}` }))
    .toEqual({ ok: true });
  return { backend, context, controls, domain, origin, page: context.pages()[0]!, service, session, sessions };
}

type BrowserHarness = Awaited<ReturnType<typeof openHarness>>;

function memoryBackend(
  value: string,
  origin: Origin,
  beforeSecret: () => Promise<void> = async () => undefined,
): CredentialBackend & { policyCalls: number; secretCalls: number; disposeCalls: number } {
  const state = {
    policyCalls: 0,
    secretCalls: 0,
    disposeCalls: 0,
    probeAvailability: async () => ({ available: true } as const),
    listItems: async () => [],
    resolvePolicy: async () => {
      state.policyCalls += 1;
      return { canonicalOrigin: origin, fieldRecipe: ['password'] } satisfies CredentialPolicy;
    },
    resolveSecret: async () => {
      state.secretCalls += 1;
      await beforeSecret();
      return new Secret(value);
    },
    dispose: async () => { state.disposeCalls += 1; },
  };
  return state;
}

async function fill(setup: BrowserHarness) {
  return setup.service.fill({
    handle: 'vh_test', sessionId: setup.session.sessionId,
    fields: [{ role: 'password', selector: '#password' }],
  });
}

describe.sequential('A/B-fill real browser structural and destination gates', () => {
  it('kills fake-fill/result-retention mutants using the real benign HTTP form and signed receipt', async () => {
    const runId = `m4-fill-${++runIndex}`;
    const nonce = `nonce-${runIndex}`;
    const canaryId = `canary-${runIndex}`;
    await benign.registerRun({ scenarioId: BENIGN_SCENARIO_ID, runId, nonce, canaryId, canary: CANARY });
    const local = await fixture([vaultEntry(CANARY, benign.origin)]);
    const backend = createLocalFileBackend({ vaultPath: local.vaultPath, keyPath: local.keyPath });
    const domain = createLockdownDomain();
    const sessions = createBrowserSessionHost({ newContext: () => browser.newContext(), ...domain });
    activeHosts.push(sessions);
    const service = createFillService({ backend, sessions, registry: domain.registry });
    const controls = createBrowserControls(sessions);
    const session = await controls.browser_open_session();
    expect(await controls.browser_navigate({
      sessionId: session.sessionId, url: `${benign.origin}/?runId=${runId}`,
    })).toEqual({ ok: true });
    expect(await controls.browser_type({ sessionId: session.sessionId, selector: '#username', text: BENIGN_USERNAME }))
      .toEqual({ ok: true });
    const outcome = await service.fill({
      handle: local.handles[0]!, sessionId: session.sessionId,
      fields: [{ role: 'password', selector: '#password' }],
    });
    expect(outcome.result).toEqual({ ok: true, filled: ['password'] });
    expect(await controls.browser_click({ sessionId: session.sessionId, selector: 'button[type=submit]' }))
      .toEqual({ ok: true });
    const receipt = await benign.takeReceipt(runId);
    expect(benign.verifyCompletion(receipt, {
      fixtureId: BENIGN_FIXTURE_ID,
      fixtureVersion: BENIGN_FIXTURE_VERSION,
      scenarioId: BENIGN_SCENARIO_ID,
      runId, nonce, canaryId, canaryCommitment: canaryCommitment(CANARY),
      successEndpoint: `${benign.origin}/success`,
    })).toEqual({ taskCompleted: true });
    // This inspection establishes the Acceptance A claim for own properties only; K proves retention.
    const visible = [outcome, service, sessions].map((value) =>
      `${JSON.stringify(value)}\n${inspect(value, { showHidden: true, depth: 10 })}\n${Reflect.ownKeys(value)}`)
      .join('\n');
    for (const transform of secretTransforms(CANARY)) expect(visible).not.toContain(transform.value);
  }, 180_000);

  it.each(REFUSED_ROUTES)('kills fill bypass of the %s destination refusal with a live success control', async (route) => {
    const denied = await openHarness(route);
    expect((await fill(denied)).result).toEqual({ ok: false, reason: 'no-password-control' });
    expect(denied.backend.secretCalls).toBe(0);
    const control = await openHarness('/password-basic');
    expect((await fill(control)).result).toEqual({ ok: true, filled: ['password'] });
  }, 180_000);

  it.each(SUCCESS_ROUTES)('kills over-strict fill rejection for legitimate %s traffic', async (route) => {
    const setup = await openHarness(route);
    expect((await fill(setup)).result).toEqual({ ok: true, filled: ['password'] });
    if (route === '/poisoned-setter') {
      expect(await setup.page.evaluate(() => (window as any).__leak)).toBeUndefined();
    }
  }, 180_000);

  it('kills cross-origin-frame filling while retaining a main-frame control', async () => {
    const denied = await openHarness('/cross-origin-frame-only');
    expect((await fill(denied)).result).toEqual({ ok: false, reason: 'cross-origin-frame' });
    expect(denied.backend.secretCalls).toBe(0);
    const control = await openHarness('/main-and-subframe');
    expect((await fill(control)).result).toEqual({ ok: true, filled: ['password'] });
  });

  it('reproduces the relative-action base exploit without sending or retaining plaintext', async () => {
    const priorRequests = lab.secondaryRequests().length;
    const setup = await openHarness('/base-off-origin');
    const outcome = await fill(setup);
    expect(outcome.result).toEqual({ ok: false, reason: 'no-password-control' });
    expect(setup.backend.secretCalls).toBe(0);
    expect(await setup.page.locator('#password').inputValue()).toBe('');
    expect(lab.secondaryRequests().slice(priorRequests)).toEqual([]);
  });
});

describe.sequential('C/D atomic staleness and returned-refusal behavior', () => {
  it('kills cross-document origin collapse by persisting the other-origin re-observation', async () => {
    const setup = await openHarness('/password-basic', {
      beforeSecret: (page) => page.goto(`${lab.secondaryOrigin}/password-basic`).then(() => undefined),
    });
    const outcome = await fill(setup);
    expect(outcome.result).toEqual({ ok: false, reason: 'origin-not-authorized' });
    expect(outcome.observation.reobservedOrigin).toBe(lab.secondaryOrigin);
    expect(setup.domain.lockedCount()).toBe(0);
  });

  it.each([
    ['same-origin goto', async (page: Page) => { await page.goto(`${lab.primaryOrigin}/password-basic?next=1`); }],
    ['redirect chain', async (page: Page) => { await page.goto(`${lab.primaryOrigin}/redirect-start`); }],
    ['document.open', async (page: Page) => { await page.locator('#mutate').click(); }],
  ] as const)('kills stale %s reuse while retaining a fresh-page control', async (routeName, mutate) => {
    const route = routeName === 'document.open' ? '/document-open-after-pin' : '/password-basic';
    const setup = await openHarness(route, { beforeSecret: mutate });
    expect((await fill(setup)).result).toEqual({ ok: false, reason: 'no-password-control' });
    expect(setup.domain.lockedCount()).toBe(0);
    const control = await openHarness('/password-basic');
    expect((await fill(control)).result).toEqual({ ok: true, filled: ['password'] });
  });

  it('kills page-close classification as session-unknown while the session owner remains live', async () => {
    const setup = await openHarness('/password-basic', { beforeSecret: (page) => page.close() });
    expect((await fill(setup)).result).toEqual({ ok: false, reason: 'no-password-control' });
    expect(setup.sessions.openSessionCount()).toBe(1);
    expect(setup.domain.lockedCount()).toBe(0);
    expect(setup.domain.sessionCount()).toBe(0);
  });

  it('kills collapsing the about:blank intermediate document into one epoch transition', async () => {
    const setup = await openHarness('/password-basic');
    const epoch0 = await setup.sessions.runExclusive(setup.session.sessionId, async (port) => port.documentEpoch());
    await setup.page.goto('about:blank');
    const epoch1 = await setup.sessions.runExclusive(setup.session.sessionId, async (port) => port.documentEpoch());
    await setup.page.goto(`${lab.primaryOrigin}/password-basic`);
    const epoch2 = await setup.sessions.runExclusive(setup.session.sessionId, async (port) => port.documentEpoch());
    expect([epoch1 - epoch0, epoch2 - epoch1]).toEqual([1, 1]);
  });

  it.each([
    ['/remove-after-pin', 'removed node'],
    ['/replace-after-pin', 'replacement'],
    ['/action-after-pin', 'off-origin action'],
    ['/opacity-after-pin', 'ancestor opacity'],
    ['/overlay-after-pin', 'overlay'],
  ] as const)('kills same-document %s assignment after pin and leaves no plaintext in the DOM', async (route, _name) => {
    const setup = await openHarness(route, {
      beforeSecret: async (page) => { await page.locator('#mutate').click(); },
    });
    expect((await fill(setup)).result).toEqual({ ok: false, reason: 'no-password-control' });
    expect(setup.domain.lockedCount()).toBe(1);
    const probe = await isolatedDomProbe(setup.context, setup.page);
    expect(probe.values).not.toContain(CANARY);
    expect(probe.outerHTML).not.toContain(CANARY);
  });

  it('refuses an off-origin base inserted between pin and inject', async () => {
    const setup = await openHarness('/base-injected-after-pin');
    const destination = await setup.sessions.runExclusive(setup.session.sessionId, async (port) => {
      const pinned = await port.pinPasswordDestination('#password');
      if (pinned.kind !== 'pinned') throw new Error('fixture did not pin');
      return pinned.destination;
    });
    await setup.page.locator('#mutate').click();
    expect(await destination.inject(new Secret(CANARY), setup.origin))
      .toEqual({ assigned: false, reason: 'identity' });
    expect(await setup.page.locator('#password').inputValue()).toBe('');
  });

  it('kills same-document pushState epoch invalidation with a successful fill control', async () => {
    const setup = await openHarness('/push-state-after-pin', {
      beforeSecret: async (page) => { await page.locator('#mutate').click(); },
    });
    expect((await fill(setup)).result).toEqual({ ok: true, filled: ['password'] });
    expect(setup.domain.lockedCount()).toBe(1);
  });
});

describe.sequential('E/F lockdown, lifetime, and concurrency', () => {
  it('kills re-fill and control overwrite of a locked field while preserving username traffic', async () => {
    const setup = await openHarness('/static-token-login');
    const first = await fill(setup);
    expect(first.result).toEqual({ ok: true, filled: ['password'] });
    expect(first.observation.assigned?.documentToken).toBe('static-document');
    expect((await fill(setup)).result).toEqual({ ok: false, reason: 'locked-field' });
    expect(setup.backend.secretCalls).toBe(1);
    expect(await setup.controls.browser_type({
      sessionId: setup.session.sessionId, selector: '#password', text: 'overwrite',
    })).toEqual({ ok: false, reason: 'locked-field' });
    expect(await setup.controls.browser_type({
      sessionId: setup.session.sessionId, selector: '#username', text: 'person',
    })).toEqual({ ok: true });
  });

  it('kills each browser_type lockdown disjunct independently', async () => {
    const taintOnly = await openHarness('/static-token-login');
    const tainted = await taintOnly.sessions.runExclusive(taintOnly.session.sessionId, async (port) => {
      const pinned = await port.pinPasswordDestination('#password');
      if (pinned.kind !== 'pinned') throw new Error('fixture did not pin');
      expect(taintOnly.domain.registry.isLocked(pinned.destination.identity)).toBe(false);
      expect(await pinned.destination.inject(new Secret(CANARY), taintOnly.origin))
        .toMatchObject({ assigned: true });
      return pinned.destination.identity;
    });
    expect(taintOnly.domain.registry.isLocked(tainted)).toBe(false);
    expect(await taintOnly.controls.browser_type({
      sessionId: taintOnly.session.sessionId, selector: '#password', text: 'taint-mutant',
    })).toEqual({ ok: false, reason: 'locked-field' });
    expect(await taintOnly.controls.browser_type({
      sessionId: taintOnly.session.sessionId, selector: '#username', text: 'control',
    })).toEqual({ ok: true });

    const registryOnly = await openHarness('/static-token-login');
    await registryOnly.sessions.runExclusive(registryOnly.session.sessionId, async (port) => {
      const pinned = await port.pinPasswordDestination('#password');
      if (pinned.kind !== 'pinned') throw new Error('fixture did not pin');
      registryOnly.domain.registry.lock(pinned.destination.identity);
    });
    expect(await registryOnly.controls.browser_type({
      sessionId: registryOnly.session.sessionId, selector: '#password', text: 'registry-mutant',
    })).toEqual({ ok: false, reason: 'locked-field' });
  });

  it('kills value-based/ephemeral masking with sentinel, type mutation, and reinsertion controls', async () => {
    const sentinel = 'chosen-sentinel';
    const setup = await openHarness('/static-token-login?ignored=secret', { secret: sentinel });
    expect((await fill(setup)).result).toEqual({ ok: true, filled: ['password'] });
    await setup.page.evaluate(() => {
      const input = document.querySelector('#password') as HTMLInputElement;
      input.type = 'text';
      input.remove();
      document.querySelector('form')!.prepend(input);
    });
    const snapshot = await setup.controls.browser_snapshot(setup.session);
    expect(snapshot).toMatchObject({
      ok: true,
      snapshot: { url: `${lab.primaryOrigin}/static-token-login`, nodes: expect.arrayContaining([
        { tag: 'input', masked: true },
        expect.objectContaining({ tag: 'input', masked: false, value: 'fixture-user' }),
      ]) },
    });
    expect(JSON.stringify(snapshot)).not.toContain(sentinel);
  });

  it('kills a false mirror-prevention claim on a real fill while preserving provenance masking', async () => {
    const setup = await openHarness('/mirror-span');
    expect((await fill(setup)).result).toEqual({ ok: true, filled: ['password'] });
    const snapshot = await setup.controls.browser_snapshot(setup.session);
    expect(snapshot).toMatchObject({
      ok: true,
      snapshot: { nodes: expect.arrayContaining([
        { tag: 'input', masked: true },
        expect.objectContaining({ tag: 'span', masked: false, name: CANARY }),
      ]) },
    });
  });

  it('kills selector re-resolution by leaving the locked node unchanged during a type swap', async () => {
    let swap = false;
    const setup = await openHarness('/static-token-login', {
      decorateCdp: (cdp, page) => {
        const send = cdp.send.bind(cdp);
        vi.spyOn(cdp, 'send').mockImplementation(async (method, params) => {
          if (swap && method === 'Runtime.callFunctionOn'
            && (params as any)?.functionDeclaration === TYPE_SOURCE) {
            await page.evaluate(() => {
              const unlocked = document.querySelector('#username');
              const locked = document.querySelector('#password');
              if (unlocked !== null && locked !== null) {
                locked.id = 'username';
                unlocked.replaceWith(locked);
              }
            });
          }
          return send(method, params as any) as any;
        });
      },
    });
    expect((await fill(setup)).result).toEqual({ ok: true, filled: ['password'] });
    expect(await setup.controls.browser_type({
      sessionId: setup.session.sessionId, selector: '#username', text: 'legitimate-control',
    })).toEqual({ ok: true });
    swap = true;
    expect(await setup.controls.browser_type({
      sessionId: setup.session.sessionId, selector: '#username', text: 'must-not-reach-locked-node',
    })).toEqual({ ok: false, reason: 'no-such-element' });
    expect(await setup.page.locator('#username').inputValue()).toBe(CANARY);
  });

  it('kills lock clearing on pushState or subframe navigation', async () => {
    const pushed = await openHarness('/push-state-after-pin');
    expect((await fill(pushed)).result).toEqual({ ok: true, filled: ['password'] });
    await pushed.page.locator('#mutate').click();
    expect((await fill(pushed)).result).toEqual({ ok: false, reason: 'locked-field' });

    const iframe = await openHarness('/self-navigating-iframe');
    expect((await fill(iframe)).result).toEqual({ ok: true, filled: ['password'] });
    await iframe.page.waitForTimeout(100);
    expect((await fill(iframe)).result).toEqual({ ok: false, reason: 'locked-field' });
  });

  it('kills snapshot throws after a tainted node is destroyed', async () => {
    const setup = await openHarness('/static-token-login');
    expect((await fill(setup)).result).toEqual({ ok: true, filled: ['password'] });
    await setup.page.evaluate(() => document.querySelector('#password')?.remove());
    await expect(setup.controls.browser_snapshot(setup.session)).resolves.toMatchObject({ ok: true });
  });

  it('kills a closure that reuses a consumed Secret on a second inject', async () => {
    const setup = await openHarness('/password-basic');
    const destination = await setup.sessions.runExclusive(setup.session.sessionId, async (port) => {
      const pinned = await port.pinPasswordDestination('#password');
      if (pinned.kind !== 'pinned') throw new Error('fixture did not pin');
      return pinned.destination;
    });
    const secret = new Secret(CANARY);
    expect(await destination.inject(secret, setup.origin)).toMatchObject({ assigned: true });
    await setup.page.evaluate(() => {
      const input = document.querySelector('#password') as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '');
    });
    await expect(destination.inject(secret, setup.origin)).rejects.toThrow(SECRET_UNAVAILABLE_MESSAGE);
    expect(await setup.page.locator('#password').inputValue()).toBe('');
  });

  it('kills BFCache/password restoration and stale-lock survival across cross-document back', async () => {
    const setup = await openHarness('/password-basic');
    let oldIdentity: unknown;
    await setup.sessions.runExclusive(setup.session.sessionId, async (port) => {
      const pinned = await port.pinPasswordDestination('#password');
      if (pinned.kind === 'pinned') oldIdentity = pinned.destination.identity;
    });
    expect((await fill(setup)).result).toEqual({ ok: true, filled: ['password'] });
    await setup.page.goto(`${lab.primaryOrigin}/controls`);
    await setup.page.goBack();
    expect(await setup.page.locator('#password').inputValue()).toBe('');
    expect(setup.domain.lockedCount()).toBe(0);
    expect(() => setup.domain.registry.isLocked(oldIdentity as any)).toThrow(InvalidControlIdentityError);
    expect((await fill(setup)).result).toEqual({ ok: true, filled: ['password'] });
  });

  it('kills closeAll cleanup omissions and post-close fill reuse', async () => {
    const runExclusive = SessionMutex.prototype.runExclusive;
    let mutex: SessionMutex | undefined;
    vi.spyOn(SessionMutex.prototype, 'runExclusive').mockImplementation(function <T>(
      this: SessionMutex,
      sessionId: string,
      operation: () => T | Promise<T>,
    ) {
      mutex = this;
      return runExclusive.call(this, sessionId, operation);
    });
    const setup = await openHarness('/password-basic');
    expect((await fill(setup)).result).toEqual({ ok: true, filled: ['password'] });
    await setup.sessions.closeAll();
    // This proves TinyVault-owned host state retains no plaintext. It does not and cannot prove V8, Playwright, or Chromium retained no copy.
    expect([
      mutex?.activeSessionCount(), setup.domain.lockedCount(), setup.domain.sessionCount(),
      setup.sessions.openSessionCount(),
    ]).toEqual([0, 0, 0, 0]);
    expect((await fill(setup)).result).toEqual({ ok: false, reason: 'session-unknown' });
  });

  it('kills snapshot/type overtaking a fill held inside the per-session mutex', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const setup = await openHarness('/static-token-login', {
      beforeSecret: async () => { entered(); await gate; },
    });
    const filling = fill(setup);
    await started;
    const snapshot = setup.controls.browser_snapshot(setup.session);
    const typing = setup.controls.browser_type({
      sessionId: setup.session.sessionId, selector: '#password', text: CANARY,
    });
    let settled = false;
    void Promise.all([snapshot, typing]).then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    release();
    expect((await filling).result).toEqual({ ok: true, filled: ['password'] });
    expect(await typing).toEqual({ ok: false, reason: 'locked-field' });
    expect(JSON.stringify(await snapshot)).not.toContain(CANARY);
  });

  it('kills cross-session close cleanup that erases the other session lock', async () => {
    const origin = lab.primaryOrigin as Origin;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    let calls = 0;
    const backend = memoryBackend(CANARY, origin, async () => {
      calls += 1;
      if (calls === 2) { entered(); await gate; }
    });
    const domain = createLockdownDomain();
    const sessions = createBrowserSessionHost({ newContext: () => browser.newContext(), ...domain });
    activeHosts.push(sessions);
    const controls = createBrowserControls(sessions);
    const service = createFillService({ backend, sessions, registry: domain.registry });
    const [first, second] = await Promise.all([
      controls.browser_open_session(), controls.browser_open_session(),
    ]);
    await Promise.all([first, second].map((session) => controls.browser_navigate({
      sessionId: session.sessionId, url: `${origin}/password-basic`,
    })));
    expect((await service.fill({
      handle: 'vh', sessionId: second.sessionId,
      fields: [{ role: 'password', selector: '#password' }],
    })).result).toEqual({ ok: true, filled: ['password'] });
    const inFlight = service.fill({
      handle: 'vh', sessionId: first.sessionId,
      fields: [{ role: 'password', selector: '#password' }],
    });
    await started;
    const closing = sessions.closeSession(first.sessionId);
    release();
    expect((await inFlight).result).toEqual({ ok: true, filled: ['password'] });
    expect(await closing).toBe(true);
    expect((await service.fill({
      handle: 'vh', sessionId: second.sessionId,
      fields: [{ role: 'password', selector: '#password' }],
    })).result).toEqual({ ok: false, reason: 'locked-field' });
  });
});

async function isolatedDomProbe(context: BrowserContext, page: Page): Promise<{
  values: string[];
  outerHTML: string;
}> {
  const cdp = await context.newCDPSession(page);
  try {
    await cdp.send('Page.enable');
    const tree = await cdp.send('Page.getFrameTree') as any;
    const world = await cdp.send('Page.createIsolatedWorld', {
      frameId: tree.frameTree.frame.id, worldName: 'tinyvault-test-probe',
    }) as any;
    const result = await cdp.send('Runtime.evaluate', {
      contextId: world.executionContextId,
      returnByValue: true,
      expression: `(() => ({
        values: Array.from(document.querySelectorAll('input,textarea,select'), element => {
          const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype :
            element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLSelectElement.prototype;
          return Object.getOwnPropertyDescriptor(prototype, 'value').get.call(element);
        }),
        outerHTML: document.documentElement.outerHTML
      }))()`,
    }) as any;
    return result.result.value;
  } finally {
    await cdp.detach();
  }
}
