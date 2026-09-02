import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { CredentialBackend } from '../backends/backend';
import { createBrowserControls } from '../browser/controls';
import { launchChromium, type Browser } from '../browser/playwright';
import { createBrowserSessionHost, type BrowserSessionHost, type SessionPage } from '../browser/session';
import type { FillDestinationPort } from '../core/browserPort';
import { createFillService, type FillOutcome, type FillService } from '../core/fillService';
import { Secret } from '../core/redaction';
import type { BrowserControls, Origin } from '../core/types';
import { assertProbeP, runProbeP, type ProbePResult } from '../../testbed/probe/probeP';
import { startControlsLab, type ControlsLab } from '../../testbed/fixtures/controls-lab';
import { createLockdownDomain } from './lockdownDomain';
import { EvidenceLease, composeSupervisedHost, type SupervisedHost } from './host';

const CANARY = 'TVC_timing_probe_7B32';
const NONMATCH = 'X'.repeat(CANARY.length);
const TIMING_PREFIX = 'timing-prefix:';
const TIMING_SUFFIX = ':timing-suffix';
let browser: Browser;
let lab: ControlsLab;
let activeSessions: BrowserSessionHost[] = [];
let activeHosts: SupervisedHost[] = [];

beforeAll(async () => {
  browser = await launchChromium();
  lab = await startControlsLab();
});

afterEach(async () => {
  for (const host of activeHosts.splice(0)) host.abort();
  await Promise.all(activeSessions.splice(0).map((sessions) => sessions.closeAll()));
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
      samplesPerCondition: 200,
      warmup: 20,
      setupA: () => setup.setup(short),
      setupB: () => setup.setup(long),
      a: () => setup.service.fill(setup.request).then(() => undefined),
      b: () => setup.service.fill(setup.request).then(() => undefined),
    });
    report('fill-short-vs-long', result);
    expect(() => assertProbeP(result)).not.toThrow();
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
      samplesPerCondition: 200,
      warmup: 20,
      setupA: () => setup.setup(short),
      setupB: () => setup.setup(long),
      a: queuedFill,
      b: queuedFill,
    });
    report('queued-short-vs-long', result);
    expect(() => assertProbeP(result)).not.toThrow();
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
      samplesPerCondition: 200,
      warmup: 20,
      setupA: () => prepare(CANARY),
      setupB: () => prepare(NONMATCH),
      a: () => controls.browser_snapshot(session).then(() => undefined),
      b: () => controls.browser_snapshot(session).then(() => undefined),
    });
    report('reflection-equal-length', result);
    expect(() => assertProbeP(result)).not.toThrow();
  }, 180_000);

  it('kills match-dependent tripwire timing through composeSupervisedHost', async () => {
    let hostA!: SupervisedHost;
    let hostB!: SupervisedHost;
    let currentHost: SupervisedHost | undefined;
    const bytesA = JSON.stringify(timingVaultResult(CANARY));
    const bytesB = JSON.stringify(timingVaultResult(NONMATCH));
    expect(bytesA.length).toBe(bytesB.length);
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
    const result = await runProbeP({
      samplesPerCondition: 200,
      warmup: 20,
      setupA: () => { hostA = setupHost(CANARY); },
      setupB: () => { hostB = setupHost(NONMATCH); },
      a: () => hostA.tools.list_vault().then(() => undefined),
      b: () => hostB.tools.list_vault().then(() => undefined),
    });
    currentHost?.finish();
    report('tripwire-match-vs-no-match', result);
    expect(() => assertProbeP(result)).not.toThrow();
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
      samplesPerCondition: 200,
      warmup: 20,
      setupA: () => { hostA = setupHost(CANARY); },
      setupB: () => { hostB = setupHost(NONMATCH); },
      a: () => hostA.tools.fill_from_vault(request).then(() => undefined),
      b: () => hostB.tools.fill_from_vault(request).then(() => undefined),
    });
    currentHost?.finish();
    report('tripwire-real-click-match-vs-no-match', result);
    expect(() => assertProbeP(result)).not.toThrow();
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
      samplesPerCondition: 200,
      warmup: 20,
      setupA: () => prepare(CANARY),
      setupB: () => prepare(NONMATCH),
      a: () => host.tools.browser_click({ sessionId: session.sessionId, selector: 'button' }).then(() => undefined),
      b: () => host.tools.browser_click({ sessionId: session.sessionId, selector: 'button' }).then(() => undefined),
    });
    report('real-listener-click', result);
    expect(() => assertProbeP(result)).not.toThrow();
  }, 180_000);
});

function timingLabel(payload: string): string {
  const shaped = `${TIMING_PREFIX}${payload}${TIMING_SUFFIX}`;
  return JSON.parse(JSON.stringify(shaped)) as string;
}

function report(name: string, result: ProbePResult): void {
  console.info(`${name}: p=${result.pValue} medianDiffMs=${result.medianDiffMs} effect=${result.effectSize}`);
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
