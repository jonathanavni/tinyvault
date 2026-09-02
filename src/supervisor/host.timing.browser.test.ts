import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { CredentialBackend } from '../backends/backend';
import { createBrowserControls } from '../browser/controls';
import { launchChromium, type Browser } from '../browser/playwright';
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
import { EvidenceLease, composeSupervisedHost, type SupervisedHost } from './host';
import * as secretMatcher from './secretMatcher';
import { TripwireRun } from './tripwireSeam';

const CANARY = 'TVC_timing_probe_7B32';
const NONMATCH = rotateFinalCharacter(CANARY);
const TIMING_PREFIX = 'timing-prefix:';
const TIMING_SUFFIX = ':timing-suffix';
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

// Honest timing claim: short/long fills differ in logical length beyond transport/decode (padEnd, slice, native assignment), so only the empirical probe-P claim is made.
describe.sequential('H Probe P timing bounds', () => {
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
      currentHost?.finish();
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
      await host.tools.list_vault();
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
    currentHost?.finish();
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
    const resultA = JSON.stringify(timingFillOutcome(CANARY).result);
    const resultB = JSON.stringify(timingFillOutcome(NONMATCH).result);
    expect(resultA.length).toBe(resultB.length);
    const setupHost = (payload: string) => {
      currentHost?.finish();
      currentHost = composeSupervisedHost({
        fillService: browserClickTimingService(controls, session.sessionId, payload),
        sessions,
        lease: new EvidenceLease(CANARY),
      });
      activeHosts.push(currentHost);
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
    currentHost?.finish();
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
    expect(() => assertProbeFamily(probeResults, { alpha: 0.01, expected: PROBE_NAMES })).not.toThrow();
  }, 180_000);
});

function timingLabel(payload: string): string {
  const shaped = `${TIMING_PREFIX}${payload}${TIMING_SUFFIX}`;
  return JSON.parse(JSON.stringify(shaped)) as string;
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
      topOrigin: null, topPath: null, reobservedOrigin: null, assertedMismatch: null, assigned: null,
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
      topOrigin: null, topPath: null, reobservedOrigin: null, assertedMismatch: null, assigned: null,
    },
  };
}

class TimingSessions implements BrowserSessionHost {
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
