import { readFile } from 'node:fs/promises';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { CredentialBackend } from '../backends/backend';
import { createBrowserControls } from '../browser/controls';
import { launchChromium, type Browser, type BrowserContext, type CDPSession, type Page } from '../browser/playwright';
import { createBrowserSessionHost, type BrowserSessionHost, type SessionPage } from '../browser/session';
import type { FillDestinationPort } from '../core/browserPort';
import { createFillService, type FillOutcome, type FillService } from '../core/fillService';
import { Secret } from '../core/redaction';
import type { BrowserControls, Origin } from '../core/types';
import {
  assertProbeFamily,
  assertProbeHardClause,
  runProbeP,
  type ProbePResult,
} from '../../testbed/probe/probeP';
import { startControlsLab, type ControlsLab } from '../../testbed/fixtures/controls-lab';
import { createLockdownDomain } from './lockdownDomain';
import { EvidenceLease, composeSupervisedHost, createSupervisedHost, CAPTURE_FAILED_MESSAGE,
  inspectSupervisedHostCaptureFailedForTest, type SupervisedHost } from './host';
import * as secretMatcher from './secretMatcher';
import { TripwireRun } from './tripwireSeam';

// Both payloads pass through one constructor so V8 holds them in the same string representation
// (C-F1 evidence: the literal-vs-concatenated pair produced a consistent ~1 ns bias on this ~2 µs op).
const CANARY = flatCopy('TVC_timing_probe_7B32');
const NONMATCH = flatCopy(rotateFinalCharacter(CANARY));
const TIMING_PREFIX = 'timing-prefix:';
const TIMING_SUFFIX = ':timing-suffix';
const TRIPWIRE_BATCH = 64;
const PROBE_NAMES = [
  'fill-short-vs-long',
  'queued-short-vs-long',
  'reflection-equal-length',
  'tripwire-match-vs-no-match',
  'tripwire-real-click-match-vs-no-match',
  'real-listener-click',
] as const;
const probeResults = new Map<string, ProbePResult>();
let browser: Browser;
let lab: ControlsLab;
let activeSessions: BrowserSessionHost[] = [];
let activeHosts: SupervisedHost[] = [];

beforeAll(async () => {
  probeResults.clear();
  browser = await launchChromium();
  lab = await startControlsLab();
});

afterEach(async () => {
  for (const host of activeHosts.splice(0)) host.abort();
  await Promise.all(activeSessions.splice(0).map((sessions) => sessions.closeAll()));
  vi.restoreAllMocks();
});

afterAll(async () => {
  await lab?.close();
  await browser?.close();
});

async function timedFillHarness() {
  let current = 'x'.repeat(16);
  const origin = lab.primaryOrigin as Origin;
  const backend: CredentialBackend = {
    probeAvailability: async () => ({ available: true }),
    listItems: async () => [],
    resolvePolicy: async () => ({ canonicalOrigin: origin, fieldRecipe: ['password'] }),
    resolveSecret: async () => new Secret(current),
    dispose: async () => undefined,
  };
  const domain = createLockdownDomain();
  const sessions = createBrowserSessionHost({ newContext: () => browser.newContext(), ...domain });
  activeSessions.push(sessions);
  const controls = createBrowserControls(sessions);
  const session = await controls.browser_open_session();
  const service = createFillService({ backend, sessions, registry: domain.registry });
  const request = {
    handle: 'vh_timing', sessionId: session.sessionId,
    fields: [{ role: 'password' as const, selector: '#password' }],
  };
  const setup = async (secret: string) => {
    current = secret;
    expect(await controls.browser_navigate({
      sessionId: session.sessionId, url: `${origin}/password-basic`,
    })).toEqual({ ok: true });
  };
  return { controls, request, service, session, sessions, setup };
}

// The two length probes are equal-work by constant-size transport construction and stay in the
// six-probe family to detect any length-dependent work.
describe.sequential('H Probe P timing bounds', () => {
  it('pins same-constructor timing payloads against the bare-rotation mutant', async () => {
    const source = await readFile(new URL('./host.timing.browser.test.ts', import.meta.url), 'utf8');
    expect(source).toContain("const CANARY = flatCopy('TVC_timing_probe_7B32');");
    expect(source).toContain('const NONMATCH = flatCopy(rotateFinalCharacter(CANARY));');
    expect(source).not.toMatch(/const\s+NONMATCH\s*=\s*rotateFinalCharacter\(CANARY\)/u);
    expect(flatCopy.toString()).toContain('String.fromCharCode(...Array.from(');
    expect(flatCopy.toString()).not.toContain('return value;');
    const sliced = 'x' + 'TVC_timing_probe_7B32'.slice(1);
    expect(flatCopy(sliced)).toBe(sliced);
    expect(isFlatCopyBody(flatCopy.toString())).toBe(true);
    expect(isFlatCopyBody('function flatCopy(value) { return value; }')).toBe(false);
    expect(hasPinnedTripwireBatch(source)).toBe(true);
    expect(hasPinnedTripwireBatch(source.replace(
      /^const TRIPWIRE_BATCH = 64;$/mu, 'const TRIPWIRE_BATCH = 1;',
    ))).toBe(false);
    expect(hasDirectFamilyGate(source)).toBe(true);
    expect(hasWrappedFamilyGate(source)).toBe(false);
    expect(hasWrappedFamilyGate(source.replace(
      'assertProbeFamily(probeResults, { alpha: 0.01, expected: PROBE_NAMES });',
      ['expect(() => assertProbeFamily', '(probeResults, { alpha: 0.01, expected: PROBE_NAMES })).not.toThrow();'].join(''),
    ))).toBe(true);
  });
  it('kills secret-length-dependent fill latency after asserting exact result equality', async () => {
    const setup = await timedFillHarness();
    const short = 's'.repeat(16);
    const long = 'l'.repeat(4096);
    await setup.setup(short);
    const shortResult = await setup.service.fill(setup.request);
    await setup.setup(long);
    const longResult = await setup.service.fill(setup.request);
    expect(JSON.stringify(shortResult.result)).toBe(JSON.stringify(longResult.result));
    expect(JSON.stringify(shortResult.observation)).toBe(JSON.stringify(longResult.observation));

    const result = await runProbeP({
      pairs: 500,
      warmup: 20,
      setupA: () => setup.setup(short),
      setupB: () => setup.setup(long),
      a: () => setup.service.fill(setup.request).then(() => undefined),
      b: () => setup.service.fill(setup.request).then(() => undefined),
    });
    report('fill-short-vs-long', result);
    expect(() => assertProbeHardClause(result)).not.toThrow();
  }, 180_000);

  it('kills secret-length-dependent mutex occupancy with an immediately queued control', async () => {
    const setup = await timedFillHarness();
    const short = 's'.repeat(16);
    const long = 'l'.repeat(4096);
    const queuedFill = async () => {
      const filling = setup.service.fill(setup.request);
      const queued = setup.sessions.runControl(setup.session.sessionId, async () => undefined);
      await queued;
      await filling;
    };
    await setup.setup(short);
    const shortResult = await setup.service.fill(setup.request);
    await setup.setup(long);
    const longResult = await setup.service.fill(setup.request);
    expect(JSON.stringify(shortResult.result)).toBe(JSON.stringify(longResult.result));

    const result = await runProbeP({
      pairs: 500,
      warmup: 20,
      setupA: () => setup.setup(short),
      setupB: () => setup.setup(long),
      a: queuedFill,
      b: queuedFill,
    });
    report('queued-short-vs-long', result);
    expect(() => assertProbeHardClause(result)).not.toThrow();
  }, 180_000);

  it('kills a content-dependent reflection oracle with equal-length caller traffic', async () => {
    const domain = createLockdownDomain();
    const sessions = createBrowserSessionHost({ newContext: () => browser.newContext(), ...domain });
    activeSessions.push(sessions);
    const controls = createBrowserControls(sessions);
    const session = await controls.browser_open_session();
    const prepare = async (text: string) => {
      await controls.browser_navigate({ sessionId: session.sessionId, url: `${lab.primaryOrigin}/echo-field` });
      await controls.browser_type({ sessionId: session.sessionId, selector: '#echo', text });
    };
    await prepare(CANARY);
    const equal = await controls.browser_snapshot(session);
    await prepare(NONMATCH);
    const unequal = await controls.browser_snapshot(session);
    expect(JSON.stringify(equal).length).toBe(JSON.stringify(unequal).length);

    const result = await runProbeP({
      pairs: 500,
      warmup: 20,
      setupA: () => prepare(CANARY),
      setupB: () => prepare(NONMATCH),
      a: () => controls.browser_snapshot(session).then(() => undefined),
      b: () => controls.browser_snapshot(session).then(() => undefined),
    });
    report('reflection-equal-length', result);
    expect(() => assertProbeHardClause(result)).not.toThrow();
  }, 180_000);

  it('kills match-dependent tripwire timing through composeSupervisedHost', async () => {
    const match = vi.spyOn(secretMatcher, 'firstMatchingSecretTransform');
    const mint = vi.spyOn(TripwireRun.prototype, 'mint');
    const adjudicate = vi.spyOn(TripwireRun.prototype, 'adjudicate');
    const timedCallDeltas: number[][] = [];
    let hostA!: SupervisedHost;
    let hostB!: SupervisedHost;
    let currentHost: SupervisedHost | undefined;
    const bytesA = JSON.stringify(timingVaultResult(CANARY));
    const bytesB = JSON.stringify(timingVaultResult(NONMATCH));
    expect(bytesA.length).toBe(bytesB.length);
    // Rotate one same-class character so both conditions use the same mixed-character construction.
    expect(NONMATCH).toHaveLength(CANARY.length);
    expect(NONMATCH).not.toBe(CANARY);
    expect(characterClassShape(NONMATCH)).toBe(characterClassShape(CANARY));
    const setupHost = (payload: string) => {
      currentHost?.drainEvidence(); currentHost?.finish();
      const service = timingService(payload);
      currentHost = composeSupervisedHost({
        fillService: service,
        sessions: new TimingSessions(),
        lease: new EvidenceLease(CANARY),
      });
      activeHosts.push(currentHost);
      return currentHost;
    };
    const timedToolCall = async (host: SupervisedHost) => {
      const before = [match.mock.calls.length, mint.mock.calls.length, adjudicate.mock.calls.length];
      await runTripwireBatch(host);
      timedCallDeltas.push([
        match.mock.calls.length - before[0]!,
        mint.mock.calls.length - before[1]!,
        adjudicate.mock.calls.length - before[2]!,
      ]);
    };
    const result = await runProbeP({
      pairs: 500,
      warmup: 20,
      setupA: () => { hostA = setupHost(CANARY); },
      setupB: () => { hostB = setupHost(NONMATCH); },
      a: () => timedToolCall(hostA),
      b: () => timedToolCall(hostB),
    });
    currentHost?.drainEvidence(); currentHost?.finish();
    expect(timedCallDeltas.length).toBeGreaterThan(0);
    expect(timedCallDeltas.every((delta) => delta.every((calls) => calls === 0))).toBe(true);
    report('tripwire-match-vs-no-match', result);
    expect(() => assertProbeHardClause(result)).not.toThrow();
  }, 180_000);

  it('kills match-dependent tripwire timing on a real supervised browser fill call', async () => {
    const domain = createLockdownDomain();
    const sessions = createBrowserSessionHost({ newContext: () => browser.newContext(), ...domain });
    activeSessions.push(sessions);
    const controls = createBrowserControls(sessions);
    const session = await controls.browser_open_session();
    expect(await controls.browser_navigate({
      sessionId: session.sessionId, url: `${lab.primaryOrigin}/controls`,
    })).toEqual({ ok: true });
    let hostA!: SupervisedHost;
    let hostB!: SupervisedHost;
    let currentHost: SupervisedHost | undefined;
    const hostsToFinish: SupervisedHost[] = [];
    const resultA = JSON.stringify(timingFillOutcome(CANARY).result);
    const resultB = JSON.stringify(timingFillOutcome(NONMATCH).result);
    expect(resultA.length).toBe(resultB.length);
    const setupHost = (payload: string) => {
      // A/B arms remain symmetric: both finalize after the shared live producer closes, outside measurement.
      currentHost = composeSupervisedHost({
        fillService: browserClickTimingService(controls, session.sessionId, payload),
        sessions,
        lease: new EvidenceLease(CANARY),
      });
      activeHosts.push(currentHost);
      hostsToFinish.push(currentHost);
      return currentHost;
    };
    const request = {
      handle: 'vh_timing', sessionId: session.sessionId,
      fields: [{ role: 'password' as const, selector: '#password' }],
    };
    const result = await runProbeP({
      pairs: 500,
      warmup: 20,
      setupA: () => { hostA = setupHost(CANARY); },
      setupB: () => { hostB = setupHost(NONMATCH); },
      a: () => hostA.tools.fill_from_vault(request).then(() => undefined),
      b: () => hostB.tools.fill_from_vault(request).then(() => undefined),
    });
    await sessions.closeAll();
    for (const pending of hostsToFinish) {
      await pending.settleEvidence(); pending.drainEvidence(); pending.finish();
    }
    report('tripwire-real-click-match-vs-no-match', result);
    expect(() => assertProbeHardClause(result)).not.toThrow();
  }, 180_000);

  it('kills content-dependent request-listener work on the real supervised click path', async () => {
    const backend = timingBackend(lab.primaryOrigin as Origin);
    const host = await import('./host').then(({ createSupervisedHost }) =>
      createSupervisedHost({ backend, canary: CANARY, browser }));
    activeHosts.push(host);
    const session = await host.tools.browser_open_session();
    const prepare = async (text: string) => {
      host.drainEvidence();
      await host.tools.browser_navigate({ sessionId: session.sessionId, url: `${lab.primaryOrigin}/post-body` });
      await host.tools.browser_type({ sessionId: session.sessionId, selector: '#payload', text });
    };
    await prepare(CANARY);
    const first = await host.tools.browser_click({ sessionId: session.sessionId, selector: 'button' });
    await prepare(NONMATCH);
    const second = await host.tools.browser_click({ sessionId: session.sessionId, selector: 'button' });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));

    const result = await runProbeP({
      pairs: 500,
      warmup: 20,
      setupA: () => prepare(CANARY),
      setupB: () => prepare(NONMATCH),
      a: () => host.tools.browser_click({ sessionId: session.sessionId, selector: 'button' }).then(() => undefined),
      b: () => host.tools.browser_click({ sessionId: session.sessionId, selector: 'button' }).then(() => undefined),
    });
    report('real-listener-click', result);
    expect(() => assertProbeHardClause(result)).not.toThrow();
  }, 180_000);

  it('applies the Holm–Bonferroni family gate over the six probes', () => {
    // Called directly so a rejection's full message (probe, p-value, Holm threshold, rank) reaches the
    // JSON report; the expect(...).not.toThrow() wrapper truncated it to 'tripw…' (M6 close gate 2).
    assertProbeFamily(probeResults, { alpha: 0.01, expected: PROBE_NAMES });
    const biased = new Map(probeResults);
    const name = 'reflection-equal-length';
    biased.set(name, { ...biased.get(name)!, pValue: 0 });
    expect(() => assertProbeFamily(biased, { alpha: 0.01, expected: PROBE_NAMES }))
      .toThrow(`Probe P family rejected: ${name}`);
  }, 180_000);

  it('reports a path-specific 2us-per-call injected-bias control rejected by the family gate', async () => {
    let hostA!: SupervisedHost;
    let hostB!: SupervisedHost;
    let currentHost: SupervisedHost | undefined;
    const setupHost = () => {
      currentHost?.drainEvidence(); currentHost?.finish();
      currentHost = composeSupervisedHost({
        fillService: timingService(NONMATCH),
        sessions: new TimingSessions(),
        lease: new EvidenceLease(CANARY),
      });
      activeHosts.push(currentHost);
      return currentHost;
    };
    const name = 'tripwire-batched-injected-bias-control';
    const result = await runProbeP({
      pairs: 500,
      warmup: 20,
      setupA: () => { hostA = setupHost(); },
      setupB: () => { hostB = setupHost(); },
      a: () => runTripwireBatch(hostA),
      b: () => runTripwireBatch(hostB, () => spinForMicroseconds(2)),
    });
    currentHost?.drainEvidence(); currentHost?.finish();
    let rejection = '';
    try {
      assertProbeFamily(new Map([[name, result]]), { alpha: 0.01, expected: [name] });
    } catch (error) {
      rejection = error instanceof Error ? error.message : String(error);
    }
    console.info(`${name}: p=${result.pValue} aggregateBiasUs=${2 * TRIPWIRE_BATCH} rejected=${rejection}`);
    expect(rejection).toBe(`Probe P family rejected: ${name} (p=${result.pValue} <= 0.01 at rank 1 of 1)`);
  }, 180_000);

  it('reports the length-proportional fill-wrapper sensitivity floor', async () => {
    const setup = await timedFillHarness();
    const short = 's'.repeat(16);
    const long = 'l'.repeat(4096);
    const rejected: number[] = [];
    for (const microseconds of [4, 8, 16, 32]) {
      const wrappedFill = async (secret: string) => {
        await setup.service.fill(setup.request);
        spinForMicroseconds(microseconds * secret.length / 4096);
      };
      const result = await runProbeP({
        pairs: 500,
        warmup: 20,
        setupA: () => setup.setup(short),
        setupB: () => setup.setup(long),
        a: () => wrappedFill(short),
        b: () => wrappedFill(long),
      });
      try {
        assertProbeFamily(new Map([['sensitivity', result]]), { alpha: 0.01, expected: ['sensitivity'] });
      } catch {
        rejected.push(microseconds);
      }
      console.info(`probe-p-sensitivity-${microseconds}us: p=${result.pValue}`);
    }
    console.info(`probe-p-sensitivity-floor-us=${Math.min(...rejected)}`);
  }, 180_000);
});

function timingLabel(payload: string): string {
  const shaped = `${TIMING_PREFIX}${payload}${TIMING_SUFFIX}`;
  return JSON.parse(JSON.stringify(shaped)) as string;
}

function flatCopy(value: string): string {
  return String.fromCharCode(...Array.from(value, (character) => character.charCodeAt(0)));
}

function isFlatCopyBody(source: string): boolean {
  return source.includes('String.fromCharCode(...Array.from(') && !source.includes('return value;');
}

function hasPinnedTripwireBatch(source: string): boolean {
  // Anchored to a whole line: the quoted mutant text inside this file must not satisfy the pin.
  return /^const TRIPWIRE_BATCH = 64;$/mu.test(source)
    && source.includes('index < TRIPWIRE_BATCH; index += 1');
}

function hasDirectFamilyGate(source: string): boolean {
  const direct = ['assertProbeFamily', '(probeResults, { alpha: 0.01, expected: PROBE_NAMES })', ';'].join('');
  return source.split('\n').some((line) => line.trim() === direct);
}

function hasWrappedFamilyGate(source: string): boolean {
  return source.includes(['expect(() => assertProbeFamily', '(probeResults'].join(''));
}

async function runTripwireBatch(host: SupervisedHost, afterCall: () => void = () => undefined): Promise<void> {
  for (let index = 0; index < TRIPWIRE_BATCH; index += 1) {
    await host.tools.list_vault();
    afterCall();
  }
}

function spinForMicroseconds(microseconds: number): void {
  const end = performance.now() + microseconds / 1_000;
  while (performance.now() < end) { /* test-side calibration spin */ }
}

function rotateFinalCharacter(value: string): string {
  const final = value.at(-1);
  if (final === undefined) throw new Error('Timing canary must not be empty');
  const rotated = final === '9' ? '0' : String.fromCharCode(final.charCodeAt(0) + 1);
  return `${value.slice(0, -1)}${rotated}`;
}

function characterClassShape(value: string): string {
  return [...value].map((character) => {
    if (/[A-Z]/u.test(character)) return 'U';
    if (/[a-z]/u.test(character)) return 'L';
    if (/[0-9]/u.test(character)) return 'D';
    return 'P';
  }).join('');
}

function report(name: string, result: ProbePResult): void {
  probeResults.set(name, result);
  console.info(
    `${name}: p=${result.pValue} z=${result.z} effect=${result.effectSize} `
    + `medianDiffMs=${result.medianDiffMs} p95A=${result.p95AMs} p95B=${result.p95BMs}`,
  );
}

function timingBackend(origin: Origin): CredentialBackend {
  return {
    probeAvailability: async () => ({ available: true }),
    listItems: async () => [],
    resolvePolicy: async () => ({ canonicalOrigin: origin, fieldRecipe: ['password'] }),
    resolveSecret: async () => new Secret(CANARY),
    dispose: async () => undefined,
  };
}

function timingService(payload: string): FillService {
  const outcome: FillOutcome = {
    result: { ok: false, reason: 'no-password-control' },
    observation: {
      topOrigin: null, topPath: null, unobserved: false,
      reobservedOrigin: null, assertedMismatch: null, assigned: null,
    },
  };
  return {
    fill: async () => outcome,
    listVault: async () => timingVaultResult(payload),
    requestSetup: async () => ({ instruction: 'fixed' }),
    setupReasonFor: async () => null,
    disposeBackend: async () => undefined,
  };
}

function timingVaultResult(payload: string) {
  return {
    items: [{ handle: 'vh', label: timingLabel(payload), kind: 'password' as const, available: true }],
  };
}

function browserClickTimingService(
  controls: BrowserControls,
  sessionId: string,
  payload: string,
): FillService {
  return {
    ...timingService(payload),
    fill: async () => {
      const clicked = await controls.browser_click({ sessionId, selector: '#button' });
      if (!clicked.ok) throw new Error('Timing probe browser click failed');
      return timingFillOutcome(payload);
    },
  };
}

function timingFillOutcome(payload: string): FillOutcome {
  return {
    result: { ok: true, filled: [timingLabel(payload)] } as unknown as FillOutcome['result'],
    observation: {
      topOrigin: null, topPath: null, unobserved: false,
      reobservedOrigin: null, assertedMismatch: null, assigned: null,
    },
  };
}

class TimingSessions implements BrowserSessionHost {
  async disposeSession(): Promise<void> {}
  async stopLoading(): Promise<void> {}
  async quiesceControls(): Promise<void> {}
  async abortSessions(): Promise<void> {}
  async openSession(): Promise<{ sessionId: string }> { return { sessionId: 'session' }; }
  async closeSession(): Promise<boolean> { return true; }
  async runExclusive<T>(_id: string, op: (port: FillDestinationPort) => Promise<T>): Promise<T> {
    return op({} as FillDestinationPort);
  }
  async runControl<T>(_id: string, op: (page: SessionPage) => Promise<T>): Promise<T> {
    return op({
      navigate: async () => undefined,
      click: async () => undefined,
      type: async () => 'ok',
      snapshot: async () => ({ url: '', nodes: [] }),
    });
  }
  openSessionCount(): number { return 0; }
  async closeAll(): Promise<void> {}
}


const S4_BLACK_HOLE = 'http://10.255.255.1/';
let lifecycleHost: SupervisedHost | undefined;
let lifecycleBrowser: Browser | undefined;

async function lifecycleTimingHarness(decorate?: (context: BrowserContext) => void) {
  lifecycleBrowser = await launchChromium();
  const create = lifecycleBrowser.newContext.bind(lifecycleBrowser);
  vi.spyOn(lifecycleBrowser, 'newContext').mockImplementation(async (...args) => {
    const context = await create(...args); decorate?.(context); return context;
  });
  lifecycleHost = await createSupervisedHost({ browser: lifecycleBrowser,
    backend: timingBackend(lab.primaryOrigin as Origin), canary: CANARY });
  const host = lifecycleHost;
  const session = await host.tools.browser_open_session();
  const context = lifecycleBrowser.contexts()[0]!;
  const page = context.pages()[0]!;
  expect(await host.tools.browser_navigate({ ...session, url: `${lab.primaryOrigin}/controls` }))
    .toEqual({ ok: true });
  expect(await host.tools.browser_snapshot(session)).toMatchObject({ ok: true });
  return { host, session, context, page };
}

async function wedgeTimingPage(page: Page) {
  const requested = page.waitForEvent('request', (request) => request.url() === S4_BLACK_HOLE);
  await page.evaluate((url) => { setTimeout(() => { location.href = url; }, 0); }, S4_BLACK_HOLE);
  await requested;
}

function defeatTimingStop(context: BrowserContext, admitted: () => void, armed: () => boolean) {
  const create = context.newCDPSession.bind(context);
  vi.spyOn(context, 'newCDPSession').mockImplementation(async (target) => {
    const cdp = await create(target); const send = cdp.send.bind(cdp);
    vi.spyOn(cdp, 'send').mockImplementation(((method: string, params?: never) => {
      if (method === 'Page.stopLoading') return Promise.resolve({});
      const pending = send(method as never, params);
      if (armed() && (method === 'Page.createIsolatedWorld' || method === 'DOM.getDocument')) admitted();
      return pending;
    }) as CDPSession['send']);
    return cdp;
  });
}

// Functional cancellation/correlation and black-hole TCP preflight remain in the main
// finalization suite. This family contains only lifecycle latency measurements, never stress scans.
describe.sequential('M6 S4 lifecycle timing bounds', () => {
  afterEach(async () => {
    lifecycleHost?.abort();
    try { await lifecycleHost?.closeAll(); }
    finally {
      await lifecycleBrowser?.close(); lifecycleHost = undefined; lifecycleBrowser = undefined;
    }
  });

  it('never-loading subresource plus three-second beforeClose stays within the combined eight-second budget', async () => {
    const { host, context, page } = await lifecycleTimingHarness();
    await page.route('**/s4-never-document', (route) => route.fulfill({
      contentType: 'text/html', body: '<img src="/s4-never-image">',
    }));
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/s4-never-image', async (route) => { await held; await route.abort().catch(() => undefined); });
    context.once('close', () => release());
    await page.goto(`${lab.primaryOrigin}/s4-never-document`, { waitUntil: 'domcontentloaded' });
    const start = performance.now();
    await host.quiesceEvidenceProducers!({ settleTimeoutMs: 3_000,
      beforeClose: () => new Promise((resolve) => setTimeout(resolve, 3_000)) });
    expect(performance.now() - start).toBeLessThan(8_000);
    expect(inspectSupervisedHostCaptureFailedForTest(host)).toBe(false);
    host.drainEvidence(); expect(host.finish().verdict).toBe('pass');
  }, 12_000);

  it.each([false, true])('busy-renderer suspension cutoff permits successful quiesce within the hard five-second budget (pending CDP=%s)', async (pendingCdp) => {
    const { host, page } = await lifecycleTimingHarness((context) => {
      if (!pendingCdp) return;
      const create = context.newCDPSession.bind(context);
      vi.spyOn(context, 'newCDPSession').mockImplementation(async (target) => {
        const cdp = await create(target); const send = cdp.send.bind(cdp);
        vi.spyOn(cdp, 'send').mockImplementation((async (method: string, params?: never) => {
          if (method !== 'Emulation.setScriptExecutionDisabled') return send(method as never, params);
          const work = await Promise.allSettled([send('Runtime.evaluate', { expression: '1' }), send(method, params)]);
          for (const result of work) if (result.status === 'rejected') throw result.reason;
          return (work[1] as PromiseFulfilledResult<any>).value;
        }) as CDPSession['send']); return cdp;
      });
    });
    const entered = page.waitForEvent('console', (message) => message.text() === 's4-suspend-busy');
    await page.evaluate(() => { setTimeout(() => { console.log('s4-suspend-busy'); while (true) {} }, 0); });
    await entered;
    const start = performance.now(); await host.quiesceEvidenceProducers!();
    expect(performance.now() - start).toBeLessThan(5_000);
    expect(inspectSupervisedHostCaptureFailedForTest(host)).toBe(false);
    host.drainEvidence(); expect(host.finish().verdict).toBe('pass');
  }, 10_000);

  it('black-hole failed navigation then close stays within the five-second close bound', async () => {
    const { host, session } = await lifecycleTimingHarness();
    expect(await host.tools.browser_navigate({ ...session, url: S4_BLACK_HOLE }))
      .toEqual({ ok: false, reason: 'navigation-failed' });
    const start = performance.now();
    expect(await host.tools.browser_close_session(session)).toEqual({ ok: true });
    expect(performance.now() - start).toBeLessThan(5_000);
  }, 25_000);

  it('active goto then close includes the courtesy wait within the five-second close bound', async () => {
    const { host, session, page } = await lifecycleTimingHarness();
    const requested = page.waitForEvent('request', (request) => request.url() === S4_BLACK_HOLE);
    const navigation = host.tools.browser_navigate({ ...session, url: S4_BLACK_HOLE });
    await requested;
    const start = performance.now();
    expect(await host.tools.browser_close_session(session)).toEqual({ ok: true });
    expect(await navigation).toEqual({ ok: false, reason: 'navigation-failed' });
    expect(performance.now() - start).toBeLessThan(5_000);
  }, 15_000);

  it('hostile self-navigation snapshot expires within ten seconds plus settlement', async () => {
    const { host, session, page } = await lifecycleTimingHarness();
    await wedgeTimingPage(page);
    const start = performance.now();
    expect(await host.tools.browser_snapshot(session)).toEqual({ ok: false, reason: 'session-unknown' });
    expect(performance.now() - start).toBeLessThan(12_500);
    expect(await host.tools.browser_snapshot(session)).toMatchObject({ ok: true });
    const closeStart = performance.now();
    expect(await host.tools.browser_close_session(session)).toEqual({ ok: true });
    expect(performance.now() - closeStart).toBeLessThan(5_000);
  }, 20_000);

  it('deadline expiry disposes a genuinely pending CDP holder within five seconds plus settlement', async () => {
    let armed = false; let admit!: () => void;
    const admitted = new Promise<void>((resolve) => { admit = resolve; });
    const { host, session, page } = await lifecycleTimingHarness((context) =>
      defeatTimingStop(context, admit, () => armed));
    await wedgeTimingPage(page); armed = true;
    const holder = host.tools.browser_snapshot(session);
    await admitted;
    const close = host.tools.browser_close_session(session);
    const start = performance.now();
    await expect(host.quiesceEvidenceProducers!()).rejects.toThrow(CAPTURE_FAILED_MESSAGE);
    expect(performance.now() - start).toBeLessThan(6_000);
    expect(await holder).toMatchObject({ ok: false });
    expect(await close).toEqual({ ok: false });
  }, 15_000);

  it('continuous page beacons quiesce successfully within the five-second bound', async () => {
    const { host, page } = await lifecycleTimingHarness();
    const observed = page.waitForEvent('request', (request) => request.url().endsWith('/s4-beacon'));
    await page.evaluate(() => {
      setInterval(() => { void fetch('/s4-beacon', { method: 'POST', body: 'x' }); }, 100);
    });
    await observed;
    const start = performance.now();
    await host.quiesceEvidenceProducers!();
    expect(performance.now() - start).toBeLessThan(5_000);
    expect(inspectSupervisedHostCaptureFailedForTest(host)).toBe(false);
    expect(host.drainEvidence()).toContainEqual(expect.objectContaining({
      route: '/s4-beacon', channel: 'network-body', bytes: 'x',
    }));
    expect(host.finish().verdict).toBe('pass');
  }, 10_000);

  it('successful strict drain and finalization stay within the shared five-second bound', async () => {
    const { host, page } = await lifecycleTimingHarness();
    await page.evaluate(async () => { await fetch('/s4-drain', { method: 'POST', body: 'observed' }); });
    const start = performance.now();
    await host.quiesceEvidenceProducers!();
    expect(performance.now() - start).toBeLessThan(5_000);
    expect(host.drainEvidence()).toContainEqual(expect.objectContaining({
      route: '/s4-drain', channel: 'network-body', bytes: 'observed',
    }));
    expect(host.finish().verdict).toBe('pass');
  }, 10_000);

  it('busy renderer snapshot fails within ten seconds plus the three-second disposal grace', async () => {
    const { host, session, page } = await lifecycleTimingHarness();
    const busy = page.waitForEvent('console', (message) => message.text() === 's4-busy-entered');
    await page.evaluate(() => {
      document.querySelector('button')!.addEventListener('click', () => {
        console.log('s4-busy-entered'); while (true) { /* deliberately non-answering renderer */ }
      });
      setTimeout(() => document.querySelector<HTMLButtonElement>('button')!.click(), 0);
    });
    await busy;
    const start = performance.now();
    expect(await host.tools.browser_snapshot(session)).toEqual({ ok: false, reason: 'session-unknown' });
    expect(performance.now() - start).toBeLessThan(14_000);
    await host.settleEvidence(); host.drainEvidence();
    expect(inspectSupervisedHostCaptureFailedForTest(host)).toBe(true);
    expect(() => host.finish()).toThrow(CAPTURE_FAILED_MESSAGE);
  }, 20_000);
});
