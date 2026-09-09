import { mkdir, readFile } from 'node:fs/promises';

import ts from 'typescript';
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
import { classifyFamilyError, composeFloor, composeTimingSidecar, readTimingCommit,
  writeTimingSidecar, writeIncompleteTimingSidecar, type DiagnosticResult, type FamilyVerdict,
  type FloorResult, type LedgerRow, type LedgerFailure } from '../../testbed/probe/timing2Sidecar';
import { SECRET_TRANSFORM_NAMES } from '../shared/secretTransforms';
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
const NONMATCH2 = flatCopy(rotateFinalCharacter(NONMATCH));
const NO_HOOK = () => undefined;
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
const ENTRY_NAMES = [
  'fill-short-vs-long',
  'queued-short-vs-long',
  'reflection-equal-length',
  'tripwire-match-vs-no-match',
  'tripwire-real-click-match-vs-no-match',
  'real-listener-click',
  'tripwire-batched-injected-bias-control',
  'sensitivity-floor',
  'tripwire-match-vs-no-match-aa',
  'tripwire-match-vs-no-match-sham',
  'tripwire-real-click-match-vs-no-match-aa',
  'tripwire-real-click-match-vs-no-match-sham',
  'tripwire-real-click-bias-250us',
  'tripwire-real-click-bias-1000us',
] as const;
const TASK_TITLE_TO_ENTRY: Readonly<Record<string, string>> = {
  'kills secret-length-dependent fill latency after asserting exact result equality': 'fill-short-vs-long',
  'kills secret-length-dependent mutex occupancy with an immediately queued control': 'queued-short-vs-long',
  'kills a content-dependent reflection oracle with equal-length caller traffic': 'reflection-equal-length',
  'kills match-dependent tripwire timing through composeSupervisedHost': 'tripwire-match-vs-no-match',
  'kills match-dependent tripwire timing on a real supervised browser fill call': 'tripwire-real-click-match-vs-no-match',
  'kills content-dependent request-listener work on the real supervised click path': 'real-listener-click',
  'reports a path-specific 2us-per-call injected-bias control rejected by the family gate': 'tripwire-batched-injected-bias-control',
  'reports the length-proportional fill-wrapper sensitivity floor': 'sensitivity-floor',
};
const diagnosticResults = new Map<string, DiagnosticResult>();
const ledger: LedgerRow[] = [];
const ledgerFailures: LedgerFailure[] = [];
let ledgerSequence = 0;
let startedAt = '';
const SIDECAR_PATH = '.vitest/timing-2-probes.json';
const floorResults: FloorResult[] = [];
let sensitivityFloor: ReturnType<typeof composeFloor> | undefined;
const probeResults = new Map<string, ProbePResult>();
let browser: Browser;
let lab: ControlsLab;
let activeSessions: BrowserSessionHost[] = [];
let activeHosts: SupervisedHost[] = [];

beforeAll(async () => {
  startedAt = new Date().toISOString();
  await mkdir('.vitest', { recursive: true });
  await writeTimingSidecar(SIDECAR_PATH, { schema: 'timing-2-probes/1', complete: false, startedAt });
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

afterEach(({ task }) => {
  try {
    const sequence = ++ledgerSequence;
    try { ledger.push({ task, sequence }); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try { ledgerFailures.push({ task, sequence, message }); }
      catch (failure) { console.error(failure); }
      console.error(error);
    }
  } catch (error) { try { console.error(error); } catch {} }
});

afterAll(async () => {
  try {
    const chromium = browser.version();
    const record = composeTimingSidecar({
      startedAt, writtenAt: new Date().toISOString(), commit: await readTimingCommit(process.cwd()),
      node: process.version, chromium, names: ENTRY_NAMES, titleToEntry: TASK_TITLE_TO_ENTRY,
      ledger, ledgerFailures, probeResults,
      diagnosticResults, floor: sensitivityFloor, family: timingFamily(),
    });
    await writeTimingSidecar(SIDECAR_PATH, record);
  } catch (error) { await writeIncompleteTimingSidecar(SIDECAR_PATH, startedAt, error); }
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
    // Anchor on the executing statement (a whole line), not on this test's quoted fixture text.
    const executingCall = new RegExp('^(\\s*)assertProbeFamily\\(' + 'probe' + 'Results, \\{ alpha: 0\\.01, expected: PROBE_NAMES \\}\\);$', 'mu');
    expect(source.match(executingCall)).not.toBeNull();
    const wrapped = source.replace(executingCall, (_line, indent: string) => `${indent}${[
      'expect(() => assertProbeFamily', '(' + 'probe' + 'Results, { alpha: 0.01, expected: PROBE_NAMES })).not.toThrow();',
    ].join('')}`);
    expect(hasDirectFamilyGate(wrapped)).toBe(false);
    expect(hasWrappedFamilyGate(wrapped)).toBe(true);
    for (const [pin, passed] of Object.entries(timingSourceChecks(source))) expect(passed, pin).toBe(true);
    for (const [pin, mutant, changed] of timingSourceMutations(source)) {
      expect(changed, mutant).not.toBe(source);
      expect(timingSourceChecks(changed!)[pin!], mutant).toBe(false);
    }
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
    expect(NONMATCH).not.toBe(CANARY);
    const result = await tripwireTimingProbe(CANARY, NONMATCH);
    report('tripwire-match-vs-no-match', result);
    expect(() => assertProbeHardClause(result)).not.toThrow();
  }, 180_000);

  it('kills match-dependent tripwire timing on a real supervised browser fill call', async () => {
    expect(NONMATCH).not.toBe(CANARY);
    const result = await realClickTripwireTimingProbe(CANARY, NONMATCH);
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
    recordDiagnostic(name, result, rejection);
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
      recordSensitivityFloor(microseconds, result, rejected.includes(microseconds));
      console.info(`probe-p-sensitivity-${microseconds}us: p=${result.pValue}`);
    }
    console.info(`probe-p-sensitivity-floor-us=${Math.min(...rejected)}`);
  }, 180_000);
  it('tripwire-match-vs-no-match-aa', async () => {
    const name = 'tripwire-match-vs-no-match-aa';
    const result = await tripwireTimingProbe(CANARY, CANARY);
    recordDiagnostic(name, result);
    assertFiniteProbeStatistics(result);
    expect(diagnosticResults.has(name)).toBe(true);
  }, 180_000);

  it('tripwire-match-vs-no-match-sham', async () => {
    const name = 'tripwire-match-vs-no-match-sham';
    expect(NONMATCH2).not.toBe(NONMATCH);
    expect(NONMATCH2).not.toBe(CANARY);
    for (const payload of [NONMATCH, NONMATCH2]) {
      for (const bytes of [JSON.stringify(timingVaultResult(payload)), JSON.stringify(timingFillOutcome(payload).result)]) {
        expect(secretMatcher.firstMatchingSecretTransform(bytes, CANARY, new Set(SECRET_TRANSFORM_NAMES))).toBeNull();
      }
    }
    const result = await tripwireTimingProbe(NONMATCH, NONMATCH2);
    recordDiagnostic(name, result);
    assertFiniteProbeStatistics(result);
    expect(diagnosticResults.has(name)).toBe(true);
  }, 180_000);

  it('tripwire-real-click-match-vs-no-match-aa', async () => {
    const name = 'tripwire-real-click-match-vs-no-match-aa';
    const result = await realClickTripwireTimingProbe(CANARY, CANARY);
    recordDiagnostic(name, result);
    assertFiniteProbeStatistics(result);
    expect(diagnosticResults.has(name)).toBe(true);
  }, 180_000);

  it('tripwire-real-click-match-vs-no-match-sham', async () => {
    const name = 'tripwire-real-click-match-vs-no-match-sham';
    expect(NONMATCH2).not.toBe(NONMATCH);
    expect(NONMATCH2).not.toBe(CANARY);
    for (const payload of [NONMATCH, NONMATCH2]) {
      for (const bytes of [JSON.stringify(timingVaultResult(payload)), JSON.stringify(timingFillOutcome(payload).result)]) {
        expect(secretMatcher.firstMatchingSecretTransform(bytes, CANARY, new Set(SECRET_TRANSFORM_NAMES))).toBeNull();
      }
    }
    const result = await realClickTripwireTimingProbe(NONMATCH, NONMATCH2);
    recordDiagnostic(name, result);
    assertFiniteProbeStatistics(result);
    expect(diagnosticResults.has(name)).toBe(true);
  }, 180_000);

  it('tripwire-real-click-bias-250us', async () => {
    const name = 'tripwire-real-click-bias-250us';
    const result = await realClickTripwireTimingProbe(NONMATCH, NONMATCH, {
      afterB: () => spinForMicroseconds(250),
    });
    recordDiagnostic(name, result);
    assertFiniteProbeStatistics(result);
    expect(diagnosticResults.has(name)).toBe(true);
  }, 180_000);

  it('tripwire-real-click-bias-1000us', async () => {
    const name = 'tripwire-real-click-bias-1000us';
    const result = await realClickTripwireTimingProbe(NONMATCH, NONMATCH, {
      afterB: () => spinForMicroseconds(1000),
    });
    recordDiagnostic(name, result);
    assertFiniteProbeStatistics(result);
    expect(diagnosticResults.has(name)).toBe(true);
  }, 180_000);

});


function timingFamily(): FamilyVerdict {
  try {
    assertProbeFamily(new Map(probeResults), { alpha: 0.01, expected: PROBE_NAMES });
    return { status: 'accept' };
  } catch (error) { return classifyFamilyError(error); }
}

function assertFiniteProbeStatistics(result: ProbePResult): void {
  for (const value of [result.pValue, result.z, result.effectSize, result.medianDiffMs, result.p95AMs, result.p95BMs]) {
    expect(Number.isFinite(value)).toBe(true);
  }
  for (const samples of [result.aSamplesMs, result.bSamplesMs, result.differencesMs]) {
    expect(samples.length === 500).toBe(true);
    expect(samples.every(Number.isFinite)).toBe(true);
  }
}

function recordDiagnosticOutcomes(name: string, result: ProbePResult): void {
  let hardClause: 'pass' | 'fail' = 'pass';
  let singleProbeFamily: 'accept' | 'reject' = 'accept';
  try { assertProbeHardClause(result); } catch { hardClause = 'fail'; }
  try {
    assertProbeFamily(new Map([[name, result]]), { alpha: 0.01, expected: [name] });
  } catch { singleProbeFamily = 'reject'; }
  diagnosticResults.set(name, { result, hardClause, singleProbeFamily });
}

function recordDiagnostic(name: string, result: ProbePResult, rejection?: string): void {
  try {
    recordDiagnosticOutcomes(name, result);
    if (rejection !== undefined) {
      diagnosticResults.set(name, { ...diagnosticResults.get(name)!, singleProbeFamily: rejection ? 'reject' : 'accept' });
    }
  } catch (error) { console.error(error); }
}

function recordSensitivityFloor(microseconds: number, result: ProbePResult, rejected: boolean): void {
  try {
    floorResults.push({ microseconds, pValue: result.pValue, medianDiffMs: result.medianDiffMs,
      singleProbeFamily: rejected ? 'reject' : 'accept' });
    sensitivityFloor = composeFloor(floorResults);
  } catch (error) { try { console.error(error); } catch {} }
}

async function tripwireTimingProbe(payloadA: string, payloadB: string): Promise<ProbePResult> {
  const match = vi.spyOn(secretMatcher, 'firstMatchingSecretTransform');
  const mint = vi.spyOn(TripwireRun.prototype, 'mint');
  const adjudicate = vi.spyOn(TripwireRun.prototype, 'adjudicate');
  const timedCallDeltas: number[][] = [];
  let hostA!: SupervisedHost; let hostB!: SupervisedHost;
  let currentHost: SupervisedHost | undefined;
  const bytesA = JSON.stringify(timingVaultResult(payloadA));
  const bytesB = JSON.stringify(timingVaultResult(payloadB));
  expect(bytesA.length).toBe(bytesB.length);
  expect(payloadB).toHaveLength(payloadA.length);
  expect(characterClassShape(payloadB)).toBe(characterClassShape(payloadA));
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
    pairs: 500, warmup: 20,
    setupA: () => { hostA = setupHost(payloadA); },
    setupB: () => { hostB = setupHost(payloadB); },
    a: () => timedToolCall(hostA),
    b: () => timedToolCall(hostB),
  });
  currentHost?.drainEvidence(); currentHost?.finish();
  expect(timedCallDeltas.length).toBeGreaterThan(0);
  expect(timedCallDeltas.every((delta) => delta.every((calls) => calls === 0))).toBe(true);
  return result;
}

async function realClickTripwireTimingProbe(
  payloadA: string, payloadB: string,
  { afterA = NO_HOOK, afterB = NO_HOOK }: { afterA?: () => void; afterB?: () => void } = {},
): Promise<ProbePResult> {
  const domain = createLockdownDomain();
  const sessions = createBrowserSessionHost({ newContext: () => browser.newContext(), ...domain });
  activeSessions.push(sessions);
  const controls = createBrowserControls(sessions);
  const session = await controls.browser_open_session();
  expect(await controls.browser_navigate({
    sessionId: session.sessionId, url: `${lab.primaryOrigin}/controls`,
  })).toEqual({ ok: true });
  let hostA!: SupervisedHost; let hostB!: SupervisedHost;
  let currentHost: SupervisedHost | undefined;
  const hostsToFinish: SupervisedHost[] = [];
  const resultA = JSON.stringify(timingFillOutcome(payloadA).result);
  const resultB = JSON.stringify(timingFillOutcome(payloadB).result);
  expect(resultA.length).toBe(resultB.length);
  expect(payloadB).toHaveLength(payloadA.length);
  expect(characterClassShape(payloadB)).toBe(characterClassShape(payloadA));
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
    pairs: 500, warmup: 20,
    setupA: () => { hostA = setupHost(payloadA); },
    setupB: () => { hostB = setupHost(payloadB); },
    a: () => hostA.tools.fill_from_vault(request).then(afterA),
    b: () => hostB.tools.fill_from_vault(request).then(afterB),
  });
  await sessions.closeAll();
  for (const pending of hostsToFinish) {
    await pending.settleEvidence(); pending.drainEvidence(); pending.finish();
  }
  return result;
}


function timingFunctionText(source: string, name: string): string {
  return source.match(new RegExp('^(?:async )?function ' + name + '\\([\\s\\S]*?^\\}', 'mu'))?.[0] ?? '';
}

function timingConstantText(source: string, name: string, ending: string): string {
  return source.match(new RegExp('^const ' + name + '[\\s\\S]*?^' + ending, 'mu'))?.[0] ?? '';
}

function timingSourceProbeSection(source: string): string {
  const file = ts.createSourceFile('timing.ts', source, ts.ScriptTarget.Latest, true);
  const sections = file.statements.filter((node) => ts.isExpressionStatement(node)
    && ts.isCallExpression(node.expression) && node.expression.expression.getText(file) === 'describe.sequential'
    && node.expression.arguments[0] && ts.isStringLiteral(node.expression.arguments[0])
    && node.expression.arguments[0].text === 'H Probe P timing bounds');
  if (sections.length !== 1) return '';
  const section = sections[0]! as ts.ExpressionStatement & { expression: ts.CallExpression };
  const callback = section.expression.arguments[1];
  return callback && ts.isArrowFunction(callback) && ts.isBlock(callback.body) ? callback.body.getText(file) : '';
}

function timingSourceTestCases(source: string): { title: string; body: string }[] {
  const file = ts.createSourceFile('timing.ts', source, ts.ScriptTarget.Latest, true);
  const tests: { title: string; body: string }[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      let callee = node.expression;
      while (ts.isPropertyAccessExpression(callee) || ts.isCallExpression(callee)) callee = callee.expression;
      if (ts.isIdentifier(callee) && callee.text === 'it') {
        const title = node.arguments[0]; const callback = node.arguments[1];
        tests.push({
          title: title && ts.isStringLiteral(title) ? title.text : '',
          body: callback && ts.isArrowFunction(callback) && ts.isBlock(callback.body)
            ? source.slice(callback.body.getStart(file) + 1, callback.body.end - 1) : '',
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return tests;
}

function timingSourceTitles(source: string): string[] {
  return timingSourceTestCases(source).map(({ title }) => title);
}

function timingSourceNonDiagnosticTitles(): string[] {
  return [
    "pins same-constructor timing payloads against the bare-rotation mutant",
    "kills secret-length-dependent fill latency after asserting exact result equality",
    "kills secret-length-dependent mutex occupancy with an immediately queued control",
    "kills a content-dependent reflection oracle with equal-length caller traffic",
    "kills match-dependent tripwire timing through composeSupervisedHost",
    "kills match-dependent tripwire timing on a real supervised browser fill call",
    "kills content-dependent request-listener work on the real supervised click path",
    "applies the Holm–Bonferroni family gate over the six probes",
    "reports a path-specific 2us-per-call injected-bias control rejected by the family gate",
    "reports the length-proportional fill-wrapper sensitivity floor",
  ];
}

function timingSourceDiagnosticTitles(): string[] {
  return [
    "tripwire-match-vs-no-match-aa",
    "tripwire-match-vs-no-match-sham",
    "tripwire-real-click-match-vs-no-match-aa",
    "tripwire-real-click-match-vs-no-match-sham",
    "tripwire-real-click-bias-250us",
    "tripwire-real-click-bias-1000us",
  ];
}

function pinsDiagnosticTitles(source: string): boolean {
  const section = timingSourceProbeSection(source);
  const titles = timingSourceTitles(section);
  const excluded = timingSourceNonDiagnosticTitles();
  const expected = timingSourceDiagnosticTitles();
  const diagnostics = titles.filter((title) => !excluded.includes(title));
  return titles.length === excluded.length + expected.length
    && new Set(titles).size === titles.length
    && excluded.every((title) => titles.includes(title))
    && diagnostics.length === expected.length && expected.every((title) => diagnostics.includes(title));
}

function timingDiagnosticBodies(source: string): Map<string, string> {
  const section = timingSourceProbeSection(source);
  const excluded = new Set(timingSourceNonDiagnosticTitles());
  return new Map(timingSourceTestCases(section).filter(({ title }) => !excluded.has(title))
    .map(({ title, body }) => [title, body]));
}

function pinsDiagnosticStatistics(source: string): boolean {
  const calls: Record<string, string> = {
    "tripwire-match-vs-no-match-aa": "tripwireTimingProbe(CANARY, CANARY);",
    "tripwire-match-vs-no-match-sham": "tripwireTimingProbe(NONMATCH, NONMATCH2);",
    "tripwire-real-click-match-vs-no-match-aa": "realClickTripwireTimingProbe(CANARY, CANARY);",
    "tripwire-real-click-match-vs-no-match-sham": "realClickTripwireTimingProbe(NONMATCH, NONMATCH2);",
    "tripwire-real-click-bias-250us": "realClickTripwireTimingProbe(NONMATCH, NONMATCH, {\n      afterB: () => spinForMicroseconds(250),\n    });",
    "tripwire-real-click-bias-1000us": "realClickTripwireTimingProbe(NONMATCH, NONMATCH, {\n      afterB: () => spinForMicroseconds(1000),\n    });",
  };
  const sham = [
    "    expect(NONMATCH2).not.toBe(NONMATCH);",
    "    expect(NONMATCH2).not.toBe(CANARY);",
    "    for (const payload of [NONMATCH, NONMATCH2]) {",
    "      for (const bytes of [JSON.stringify(timingVaultResult(payload)), JSON.stringify(timingFillOutcome(payload).result)]) {",
    "        expect(secretMatcher.firstMatchingSecretTransform(bytes, CANARY, new Set(SECRET_TRANSFORM_NAMES))).toBeNull();",
    "      }",
    "    }",
  ];
  const bodies = timingDiagnosticBodies(source);
  return pinsDiagnosticTitles(source) && bodies.size === 6 && [...bodies].every(([name, body]) => {
    const lines = [
      `    const name = '${name}';`,
      ...(name.endsWith('-sham') ? sham : []),
      '    const result = await ' + calls[name],
      '    recordDiagnostic(name, result);',
      '    assertFiniteProbeStatistics(result);',
      '    expect(' + 'diagnostic' + 'Results.has(name)).toBe(true);',
    ];
    return body === '\n' + lines.join('\n') + '\n  ';
  });
}

function pinsDiagnosticConstruction(source: string): boolean {
  const bodies = timingDiagnosticBodies(source);
  return ['tripwire-match-vs-no-match', 'tripwire-real-click-match-vs-no-match'].every((sibling) => {
    const helper = sibling.includes('real-click') ? 'realClickTripwireTimingProbe' : 'tripwireTimingProbe';
    const aa = bodies.get(sibling + '-aa') ?? ''; const sham = bodies.get(sibling + '-sham') ?? '';
    return aa.includes(`await ${helper}(CANARY, CANARY);`)
      && sham.includes(`await ${helper}(NONMATCH, NONMATCH2);`)
      && sham.includes('expect(NONMATCH2).not.toBe(NONMATCH);')
      && sham.includes('expect(NONMATCH2).not.toBe(CANARY);')
      && sham.includes('for (const payload of [NONMATCH, NONMATCH2])')
      && sham.includes('[JSON.stringify(timingVaultResult(payload)), JSON.stringify(timingFillOutcome(payload).result)]')
      && sham.includes('expect(secretMatcher.firstMatchingSecretTransform(bytes, CANARY, new Set(SECRET_TRANSFORM_NAMES))).toBeNull();');
  }) && [250, 1000].every((bias) => (bodies.get(`tripwire-real-click-bias-${bias}us`) ?? '').includes(
    `await realClickTripwireTimingProbe(NONMATCH, NONMATCH, {\n      afterB: () => spinForMicroseconds(${bias}),\n    });`,
  ));
}

function pinsProbeIsolation(source: string): Record<string, boolean> {
  const reporter = ['report', '('].join('');
  const calls = source.split('\n').map((line) => line.trim()).filter((line) => line.startsWith(reporter));
  const names = timingConstantText(source, 'PROBE_NAMES', '\\] as const;');
  const write = ['probe' + 'Results', '.set('].join('');
  const family = ['assertProbeFamily', '(' + 'probe' + 'Results' + ','].join('');
  const options = '{ alpha: 0.01, expected: PROBE_NAMES }';
  const diagnosticMap = ['diagnostic', 'Results'].join('');
  return {
    reportCalls: source.split(reporter).length - 1 === 7 && calls.length === 6
      && calls.every((line) => {
        const name = line.match(new RegExp("^report" + "\\('([^']+)', result\\);$", 'u'))?.[1];
        return name !== undefined && names.includes(`'${name}'`);
      }),
    probeWrites: source.split(write).length - 1 === 1
      && timingFunctionText(source, 'report').includes(write),
    gatedFamily: source.split(family).length - 1 === 1
      && source.split('\n').some((line) => line.trim() === family + ' ' + options + ');'),
    recomputedFamily: source.split('\n').some((line) => line.trim()
      === 'assertProbeFamily(new Map(' + 'probe' + 'Results' + '), ' + options + ');'),
    separateMaps: source.split('\n').every((line) => !line.includes(diagnosticMap)
      || !new RegExp('assertProbeFamily|' + 'probe' + 'Results', 'u').test(line)),
    diagnosticNamesExcluded: !/-(?:aa|sham|250us|1000us)'/u.test(names),
  };
}

function pinsMapReferences(source: string): Record<string, boolean> {
  const gateMap = 'probe' + 'Results';
  const diagnosticMap = 'diagnostic' + 'Results';
  const declarations = [
    'const ' + gateMap + ' = new Map<string, ProbePResult>();',
    'const ' + diagnosticMap + ' = new Map<string, DiagnosticResult>();',
  ];
  const sourceLines = source.split('\n');
  const lines = sourceLines.map((line) => line.trim());
  // User-authorized exemption: the pre-existing measurement helper remains byte-identical.
  const existingCast = "    result: { ok: true, filled: [timingLabel(payload)] } as " + "unknown as FillOutcome['result'],";
  const allowed = new Set([
    ...declarations,
    gateMap + '.clear();',
    gateMap + '.set(name, result);',
    'assertProbeFamily(' + gateMap + ', { alpha: 0.01, expected: PROBE_NAMES });',
    'const biased = new Map(' + gateMap + ');',
    'assertProbeFamily(new Map(' + gateMap + '), { alpha: 0.01, expected: PROBE_NAMES });',
    diagnosticMap + '.set(name, { result, hardClause, singleProbeFamily });',
    diagnosticMap + '.set(name, { ...' + diagnosticMap + ".get(name)!, singleProbeFamily: rejection ? 'reject' : 'accept' });",
    'expect(' + diagnosticMap + '.has(name)).toBe(true);',
    'ledger, ledgerFailures, ' + gateMap + ',',
    diagnosticMap + ', floor: sensitivityFloor, family: timingFamily(),',
  ]);
  const identifiers = new RegExp('\\b(?:' + gateMap + '|' + diagnosticMap + ')\\b', 'u');
  const alias = new RegExp('=\\s*(?:' + gateMap + '|' + diagnosticMap + ')\\b', 'u');
  return {
    mapDeclarations: declarations.every((declaration) => sourceLines.filter((line) => line === declaration).length === 1),
    mapReferences: lines.every((line) => !identifiers.test(line) || allowed.has(line))
      && lines.every((line) => !alias.test(line) || declarations.includes(line)),
    unknownCastExemption: sourceLines.filter((line) => line.includes('as ' + 'unknown')).length === 1
      && sourceLines.includes(existingCast)
      && timingFunctionText(source, 'timingFillOutcome').split('\n').includes(existingCast),
  };
}

function pinsTripwireHelpers(source: string): Record<string, boolean> {
  const synthetic = timingFunctionText(source, 'tripwireTimingProbe');
  const real = timingFunctionText(source, 'realClickTripwireTimingProbe');
  return {
    helperBoundary: [synthetic, real].every((body) => body.length > 0
      && !/\b(?:assertProbeHardClause|assertProbeFamily|catch|gated|throw)\b/u.test(body)),
    realWrapper: real.includes('a: () => hostA.tools.fill_from_vault(request).then(afterA),')
      && real.includes('b: () => hostB.tools.fill_from_vault(request).then(afterB),')
      && real.includes('{ afterA = NO_HOOK, afterB = NO_HOOK }')
      && /^const NO_HOOK = \(\) => undefined;$/mu.test(source)
      && !/then\(\(\) =>/u.test(real),
    helperCalls: synthetic.split('runTripwireBatch(').length - 1 === 1
      && real.split('fill_from_vault(').length - 1 === 2 && !real.includes('spyOn')
      && !/afterA|afterB|afterCall/u.test(synthetic),
    helperSampling: [synthetic, real].every((body) => body.includes('pairs: 500, warmup: 20,')),
    gatedRealClick: pinsGatedTripwireCaller(source, 'realClickTripwireTimingProbe',
      'kills match-dependent tripwire timing on a real supervised browser fill call'),
    gatedSynthetic: pinsGatedTripwireCaller(source, 'tripwireTimingProbe',
      'kills match-dependent tripwire timing through composeSupervisedHost'),
    nonmatch2: /^const NONMATCH2 = flatCopy\(rotateFinalCharacter\(NONMATCH\)\);$/mu.test(source)
      && !/const\s+NONMATCH2\s*=\s*rotateFinalCharacter\(NONMATCH\)/u.test(source),
  };
}

function pinsGatedTripwireCaller(source: string, helper: string, title: string): boolean {
  const section = timingSourceProbeSection(source);
  const body = timingSourceTestCases(section).find((test) => test.title === title)?.body ?? '';
  return body.split('\n').includes('    const result = await ' + helper + '(CANARY, NONMATCH);');
}

function pinsEntryNames(source: string): boolean {
  return timingConstantText(source, "ENTRY_NAMES", "\\] as const;") === [
    "const ENTRY_NAMES = [",
    "  'fill-short-vs-long',",
    "  'queued-short-vs-long',",
    "  'reflection-equal-length',",
    "  'tripwire-match-vs-no-match',",
    "  'tripwire-real-click-match-vs-no-match',",
    "  'real-listener-click',",
    "  'tripwire-batched-injected-bias-control',",
    "  'sensitivity-floor',",
    "  'tripwire-match-vs-no-match-aa',",
    "  'tripwire-match-vs-no-match-sham',",
    "  'tripwire-real-click-match-vs-no-match-aa',",
    "  'tripwire-real-click-match-vs-no-match-sham',",
    "  'tripwire-real-click-bias-250us',",
    "  'tripwire-real-click-bias-1000us',",
    "] as const;",
  ].join('\n');
}

function pinsTaskTitles(source: string): boolean {
  const entries = [...timingConstantText(source, 'TASK_TITLE_TO_ENTRY', '\\};')
    .matchAll(/^  '([^']+)': '([^']+)',$/gmu)].map(([, title, name]) => [title!, name!] as const);
  const names = [...timingConstantText(source, 'ENTRY_NAMES', '\\] as const;')
    .matchAll(/^  '([^']+)',$/gmu)].map(([, name]) => name!);
  const titles = timingSourceTitles(source);
  const expected = timingSourceNonDiagnosticTitles().filter((title) => title.startsWith('kills ') || title.startsWith('reports '));
  return entries.length === 8 && expected.length === 8
    && entries.every(([title, name]) => expected.includes(title) && names.includes(name)
      && titles.filter((actual) => actual === title).length === 1)
    && expected.every((title) => entries.some(([key]) => key === title))
    && timingConstantText(source, "TASK_TITLE_TO_ENTRY", "\\};") === [
    "const TASK_TITLE_TO_ENTRY: Readonly<Record<string, string>> = {",
    "  'kills secret-length-dependent fill latency after asserting exact result equality': 'fill-short-vs-long',",
    "  'kills secret-length-dependent mutex occupancy with an immediately queued control': 'queued-short-vs-long',",
    "  'kills a content-dependent reflection oracle with equal-length caller traffic': 'reflection-equal-length',",
    "  'kills match-dependent tripwire timing through composeSupervisedHost': 'tripwire-match-vs-no-match',",
    "  'kills match-dependent tripwire timing on a real supervised browser fill call': 'tripwire-real-click-match-vs-no-match',",
    "  'kills content-dependent request-listener work on the real supervised click path': 'real-listener-click',",
    "  'reports a path-specific 2us-per-call injected-bias control rejected by the family gate': 'tripwire-batched-injected-bias-control',",
    "  'reports the length-proportional fill-wrapper sensitivity floor': 'sensitivity-floor',",
    "};",
  ].join('\n');
}

function pinsProbeNames(source: string): boolean {
  return timingConstantText(source, "PROBE_NAMES", "\\] as const;") === [
    "const PROBE_NAMES = [",
    "  'fill-short-vs-long',",
    "  'queued-short-vs-long',",
    "  'reflection-equal-length',",
    "  'tripwire-match-vs-no-match',",
    "  'tripwire-real-click-match-vs-no-match',",
    "  'real-listener-click',",
    "] as const;",
  ].join('\n');
}

function pinsAssertFiniteProbeStatistics(source: string): boolean {
  return timingFunctionText(source, "assertFiniteProbeStatistics") === [
    "function assertFiniteProbeStatistics(result: ProbePResult): void {",
    "  for (const value of [result.pValue, result.z, result.effectSize, result.medianDiffMs, result.p95AMs, result.p95BMs]) {",
    "    expect(Number.isFinite(value)).toBe(true);",
    "  }",
    "  for (const samples of [result.aSamplesMs, result.bSamplesMs, result.differencesMs]) {",
    "    expect(samples.length === 500).toBe(true);",
    "    expect(samples.every(Number.isFinite)).toBe(true);",
    "  }",
    "}",
  ].join('\n');
}

function pinsRecordDiagnosticOutcomes(source: string): boolean {
  return timingFunctionText(source, "recordDiagnosticOutcomes") === [
    "function recordDiagnosticOutcomes(name: string, result: ProbePResult): void {",
    "  let hardClause: 'pass' | 'fail' = 'pass';",
    "  let singleProbeFamily: 'accept' | 'reject' = 'accept';",
    "  try { assertProbeHardClause(result); } catch { hardClause = 'fail'; }",
    "  try {",
    "    assertProbeFamily(new Map([[name, result]]), { alpha: 0.01, expected: [name] });",
    "  } catch { singleProbeFamily = 'reject'; }",
    "  " + "diagnostic" + "Results" + ".set(name, { result, hardClause, singleProbeFamily });",
    "}",
  ].join('\n');
}

function pinsRecordDiagnostic(source: string): boolean {
  return timingFunctionText(source, "recordDiagnostic") === [
    "function recordDiagnostic(name: string, result: ProbePResult, rejection?: string): void {",
    "  try {",
    "    recordDiagnosticOutcomes(name, result);",
    "    if (rejection !== undefined) {",
    "      " + "diagnostic" + "Results" + ".set(name, { ..." + "diagnostic" + "Results" + ".get(name)!, singleProbeFamily: rejection ? 'reject' : 'accept' });",
    "    }",
    "  } catch (error) { console.error(error); }",
    "}",
  ].join('\n');
}

function pinsSyntheticHelperSource(source: string): boolean {
  return timingFunctionText(source, "tripwireTimingProbe") === [
    "async function tripwireTimingProbe(payloadA: string, payloadB: string): Promise<ProbePResult> {",
    "  const match = vi.spyOn(secretMatcher, 'firstMatchingSecretTransform');",
    "  const mint = vi.spyOn(TripwireRun.prototype, 'mint');",
    "  const adjudicate = vi.spyOn(TripwireRun.prototype, 'adjudicate');",
    "  const timedCallDeltas: number[][] = [];",
    "  let hostA!: SupervisedHost; let hostB!: SupervisedHost;",
    "  let currentHost: SupervisedHost | undefined;",
    "  const bytesA = JSON.stringify(timingVaultResult(payloadA));",
    "  const bytesB = JSON.stringify(timingVaultResult(payloadB));",
    "  expect(bytesA.length).toBe(bytesB.length);",
    "  expect(payloadB).toHaveLength(payloadA.length);",
    "  expect(characterClassShape(payloadB)).toBe(characterClassShape(payloadA));",
    "  const setupHost = (payload: string) => {",
    "    currentHost?.drainEvidence(); currentHost?.finish();",
    "    const service = timingService(payload);",
    "    currentHost = composeSupervisedHost({",
    "      fillService: service,",
    "      sessions: new TimingSessions(),",
    "      lease: new EvidenceLease(CANARY),",
    "    });",
    "    activeHosts.push(currentHost);",
    "    return currentHost;",
    "  };",
    "  const timedToolCall = async (host: SupervisedHost) => {",
    "    const before = [match.mock.calls.length, mint.mock.calls.length, adjudicate.mock.calls.length];",
    "    await runTripwireBatch(host);",
    "    timedCallDeltas.push([",
    "      match.mock.calls.length - before[0]!,",
    "      mint.mock.calls.length - before[1]!,",
    "      adjudicate.mock.calls.length - before[2]!,",
    "    ]);",
    "  };",
    "  const result = await runProbeP({",
    "    pairs: 500, warmup: 20,",
    "    setupA: () => { hostA = setupHost(payloadA); },",
    "    setupB: () => { hostB = setupHost(payloadB); },",
    "    a: () => timedToolCall(hostA),",
    "    b: () => timedToolCall(hostB),",
    "  });",
    "  currentHost?.drainEvidence(); currentHost?.finish();",
    "  expect(timedCallDeltas.length).toBeGreaterThan(0);",
    "  expect(timedCallDeltas.every((delta) => delta.every((calls) => calls === 0))).toBe(true);",
    "  return result;",
    "}",
  ].join('\n');
}

function pinsRealClickHelperSource(source: string): boolean {
  return timingFunctionText(source, "realClickTripwireTimingProbe") === [
    "async function realClickTripwireTimingProbe(",
    "  payloadA: string, payloadB: string,",
    "  { afterA = NO_HOOK, afterB = NO_HOOK }: { afterA?: () => void; afterB?: () => void } = {},",
    "): Promise<ProbePResult> {",
    "  const domain = createLockdownDomain();",
    "  const sessions = createBrowserSessionHost({ newContext: () => browser.newContext(), ...domain });",
    "  activeSessions.push(sessions);",
    "  const controls = createBrowserControls(sessions);",
    "  const session = await controls.browser_open_session();",
    "  expect(await controls.browser_navigate({",
    "    sessionId: session.sessionId, url: `${lab.primaryOrigin}/controls`,",
    "  })).toEqual({ ok: true });",
    "  let hostA!: SupervisedHost; let hostB!: SupervisedHost;",
    "  let currentHost: SupervisedHost | undefined;",
    "  const hostsToFinish: SupervisedHost[] = [];",
    "  const resultA = JSON.stringify(timingFillOutcome(payloadA).result);",
    "  const resultB = JSON.stringify(timingFillOutcome(payloadB).result);",
    "  expect(resultA.length).toBe(resultB.length);",
    "  expect(payloadB).toHaveLength(payloadA.length);",
    "  expect(characterClassShape(payloadB)).toBe(characterClassShape(payloadA));",
    "  const setupHost = (payload: string) => {",
    "    // A/B arms remain symmetric: both finalize after the shared live producer closes, outside measurement.",
    "    currentHost = composeSupervisedHost({",
    "      fillService: browserClickTimingService(controls, session.sessionId, payload),",
    "      sessions,",
    "      lease: new EvidenceLease(CANARY),",
    "    });",
    "    activeHosts.push(currentHost);",
    "    hostsToFinish.push(currentHost);",
    "    return currentHost;",
    "  };",
    "  const request = {",
    "    handle: 'vh_timing', sessionId: session.sessionId,",
    "    fields: [{ role: 'password' as const, selector: '#password' }],",
    "  };",
    "  const result = await runProbeP({",
    "    pairs: 500, warmup: 20,",
    "    setupA: () => { hostA = setupHost(payloadA); },",
    "    setupB: () => { hostB = setupHost(payloadB); },",
    "    a: () => hostA.tools.fill_from_vault(request).then(afterA),",
    "    b: () => hostB.tools.fill_from_vault(request).then(afterB),",
    "  });",
    "  await sessions.closeAll();",
    "  for (const pending of hostsToFinish) {",
    "    await pending.settleEvidence(); pending.drainEvidence(); pending.finish();",
    "  }",
    "  return result;",
    "}",
  ].join('\n');
}

function pinsFloorRecording(source: string): boolean {
  return timingFunctionText(source, "recordSensitivityFloor") === [
    "function recordSensitivityFloor(microseconds: number, result: ProbePResult, rejected: boolean): void {",
    "  try {",
    "    floorResults.push({ microseconds, pValue: result.pValue, medianDiffMs: result.medianDiffMs,",
    "      singleProbeFamily: rejected ? 'reject' : 'accept' });",
    "    sensitivityFloor = composeFloor(floorResults);",
    "  } catch (error) { try { console.error(error); } catch {} }",
    "}",
  ].join('\n')
    && source.split('\n').filter((line) => line === '      recordSensitivityFloor(microseconds, result, rejected.includes(microseconds));').length === 1;
}

function pinsLedgerRecording(source: string): boolean {
  return source.match(/^afterEach\(\(\{ task \}\) => \{[\s\S]*?^\}\);/mu)?.[0] === [
    "afterEach(({ task }) => {",
    "  try {",
    "    const sequence = ++ledgerSequence;",
    "    try { ledger.push({ task, sequence }); }",
    "    catch (error) {",
    "      const message = error instanceof Error ? error.message : String(error);",
    "      try { ledgerFailures.push({ task, sequence, message }); }",
    "      catch (failure) { console.error(failure); }",
    "      console.error(error);",
    "    }",
    "  } catch (error) { try { console.error(error); } catch {} }",
    "});",
  ].join('\n');
}

function timingSourceChecks(source: string): Record<string, boolean> {
  return {
    ...pinsProbeIsolation(source), ...pinsTripwireHelpers(source), ...pinsMapReferences(source),
    diagnosticTitles: pinsDiagnosticTitles(source),
    syntheticHelperSource: pinsSyntheticHelperSource(source), realClickHelperSource: pinsRealClickHelperSource(source),
    entryNames: pinsEntryNames(source), taskTitles: pinsTaskTitles(source), probeNames: pinsProbeNames(source),
    diagnosticStatistics: pinsDiagnosticStatistics(source), diagnosticConstruction: pinsDiagnosticConstruction(source),
    finiteHelper: pinsAssertFiniteProbeStatistics(source), outcomesHelper: pinsRecordDiagnosticOutcomes(source),
    recordingHelper: pinsRecordDiagnostic(source),
    syntheticRecording: pinsSyntheticRecording(source),
    floorRecording: pinsFloorRecording(source), ledgerRecording: pinsLedgerRecording(source),
  };
}

function pinsSyntheticRecording(source: string): boolean {
  const body = source.match(/^  it\('reports a path-specific[\s\S]*?^  \}, 180_000\);/mu)?.[0] ?? '';
  return body.includes(['    }', '    recordDiagnostic(name, result, rejection);',
    '    console.info(`${name}: p=${result.pValue} aggregateBiasUs=${2 * TRIPWIRE_BATCH} rejected=${rejection}`);',
    '    expect(rejection).toBe(`Probe P family rejected: ${name} (p=${result.pValue} <= 0.01 at rank 1 of 1)`);',
  ].join('\n'));
}

function timingSourceMutations(source: string) {
  const reporter = ['report', '('].join('');
  const family = ['assertProbeFamily', '(' + 'probe' + 'Results' + ','].join('');
  const diagnostic = "  it('tripwire-match-vs-no-match-aa', async () => {";
  const options = '{ alpha: 0.01, expected: PROBE_NAMES }';
  const mutations: [string, string, string][] = [
    ['reportCalls', 'twin reported as gated', source.replace(reporter + "'fill-short-vs-long'", reporter + "'tripwire-match-vs-no-match-aa'")],
    ['probeWrites', 'diagnostic writes gate map', source.replace(diagnostic, diagnostic + '\n    ' + ['probe' + 'Results', '.set(name, result);'].join(''))],
    ['gatedFamily', 'gate derives expected names', source.replace(family + ' ' + options, family + ' { alpha: 0.01, expected: [...map.keys()] }')],
    ['recomputedFamily', 'recompute derives expected names', source.replace('assertProbeFamily(new Map(' + 'probe' + 'Results' + '), ' + options,
      'assertProbeFamily(new Map(' + 'probe' + 'Results' + '), { alpha: 0.01, expected: [...map.keys()] }')],
    ['separateMaps', 'diagnostics merged into gate', source.replace(family, 'assertProbeFamily(new Map([...' + 'probe' + 'Results' + ', '
      + '...' + 'diagnostic' + 'Results' + ']),')],
    ['diagnosticNamesExcluded', 'twin inserted in family', source.replace('const PROBE_NAMES = [', "const PROBE_NAMES = [\n  'tripwire-match-vs-no-match-aa',")],
    ['probeNames', 'gated name removed', source.replace("  'fill-short-vs-long',", '')],
    ['entryNames', 'entry order swapped', source.replace("const ENTRY_NAMES = [\n  'fill-short-vs-long',\n  'queued-short-vs-long',",
      "const ENTRY_NAMES = [\n  'queued-short-vs-long',\n  'fill-short-vs-long',")],
    ['taskTitles', 'gated title changed', source.replace("  'kills secret-length-dependent fill latency after asserting exact result equality':", "  'wrong title':")],
    ['nonmatch2', 'bare rotation', source.replace(/^const NONMATCH2 = .*;$/mu,
      ['const NONMATCH2 = ', 'rotateFinalCharacter(NONMATCH);'].join(''))],
    ['diagnosticConstruction', 'sham arm B duplicates A', source.replace('await tripwireTimingProbe(NONMATCH, NONMATCH2);', 'await tripwireTimingProbe(NONMATCH, NONMATCH);')],
    ['realWrapper', 'extra promise hook layer', source.replace('.then(afterB),', '.then(() => afterB()),')],
    ['realWrapper', 'arm B loses hook', source.replace('.then(afterB),', '.then(NO_HOOK),')],
    ['helperCalls', 'second synthetic batch', source.replace('await runTripwireBatch(host);', 'await runTripwireBatch(host); await runTripwireBatch(host);')],
    ['finiteHelper', 'finite helper adds threshold', source.replace('function assertFiniteProbeStatistics(result: ProbePResult): void {',
      'function assertFiniteProbeStatistics(result: ProbePResult): void {\n  expect(result.pValue).toBeGreaterThan(0.01);')],
    ['recordingHelper', 'recording catch removed', source.replace(timingFunctionText(source, 'recordDiagnostic'),
      'function recordDiagnostic(name: string, result: ProbePResult): void {\n  recordDiagnosticOutcomes(name, result);\n}')],
    ['outcomesHelper', 'outcome catch removed', source.replace("try { assertProbeHardClause(result); } catch { hardClause = 'fail'; }", 'assertProbeHardClause(result);')],
  ];
  for (const statement of ['expect(result.pValue > 0.01).toBe(true);', 'assertAnotherStatistic(result);',
    "expect(result.hardClause).toBe('pass');", "expect(result.singleProbeFamily).toBe('accept');"]) {
    mutations.push(['diagnosticStatistics', statement, source.replace(diagnostic, diagnostic + '\n    ' + statement)
      + '\nfunction assertAnotherStatistic(result: ProbePResult) { expect(result.pValue).toBeGreaterThan(0.01); }']);
  }
  for (const token of ['assertProbeHardClause(result);', 'assertProbeFamily(new Map(), { expected: [] });', 'try {} catch {}']) {
    mutations.push(['helperBoundary', token, source.replace('async function tripwireTimingProbe(payloadA: string, payloadB: string): Promise<ProbePResult> {',
      'async function tripwireTimingProbe(payloadA: string, payloadB: string): Promise<ProbePResult> {\n  ' + token)]);
  }
  return [...mutations, ...timingConstructionMutations(source), ...timingHardeningMutations(source)];
}

function timingHardeningMutations(source: string): [string, string, string][] {
  const diagnostic = "  it('tripwire-match-vs-no-match-aa', async () => {";
  const gateMap = 'probe' + 'Results';
  const diagnosticMap = 'diagnostic' + 'Results';
  const mutations: [string, string, string][] = [];
  for (const statement of [
    '{ const expect = assertProbeHardClause; expect(result); }',
    'expect(result.p95BMs > result.p95AMs).toBe(true);',
    'expect(result.aSamplesMs[0] > result.bSamplesMs[0]).toBe(true);',
    '// expect(',
  ]) mutations.push(['diagnosticStatistics', statement, source.replace(diagnostic, diagnostic + '\n    ' + statement)]);
  mutations.push(['mapDeclarations', 'diagnostic map aliases the gated map through sharedResults', source.replace(
    'const ' + diagnosticMap + ' = new Map<string, DiagnosticResult>();',
    'const sharedResults = ' + gateMap + ';\nconst ' + diagnosticMap + ' = sharedResults as ' + 'unknown as Map<string, DiagnosticResult>;',
  )]);
  mutations.push(['mapReferences', 'helper aliases the gated map', source.replace(
    '  const match = vi.spyOn(', '  const gate = ' + gateMap + ';\n  const match = vi.spyOn(',
  )]);
  mutations.push(['mapDeclarations', 'gated map declaration changed', source.replace(
    'const ' + gateMap + ' = new Map<string, ProbePResult>();',
    'const ' + gateMap + ' = new Map<string, ProbePResult>([]);',
  )]);
  mutations.push(['mapReferences', 'helper aliases the diagnostic map', source.replace(
    '  const match = vi.spyOn(', '  const records = ' + diagnosticMap + ';\n  const match = vi.spyOn(',
  )]);
  mutations.push(['mapReferences', 'unlisted map reference without an assignment', source.replace(
    '  const match = vi.spyOn(', '  consume(' + gateMap + ');\n  const match = vi.spyOn(',
  )]);
  mutations.push(['unknownCastExemption', 'second unknown cast outside the exemption', source + '\nconst cast = {} as ' + 'unknown;\n']);
  const existingCast = "    result: { ok: true, filled: [timingLabel(payload)] } as " + "unknown as FillOutcome['result'],";
  mutations.push(['unknownCastExemption', 'existing exempt line changed', source.replace(existingCast,
    existingCast.replace('timingLabel(payload)', "timingLabel(payload + '')"))]);
  mutations.push(['unknownCastExemption', 'existing exempt line duplicated', source + '\n' + existingCast + '\n']);
  mutations.push(['unknownCastExemption', 'existing exempt line removed', source.replace(existingCast, '')]);
  mutations.push(['diagnosticTitles', 'seventh diagnostic has an unrecognized suffix', source.replace(diagnostic,
    "  it('tripwire-real-click-bias-2000us', async () => {\n"
    + '    const result = await realClickTripwireTimingProbe(NONMATCH, NONMATCH);\n'
    + '    expect(result.pValue).toBeLessThan(0.01);\n  }, 180_000);\n\n' + diagnostic)]);
  mutations.push(['diagnosticTitles', 'seventh diagnostic is inline', source.replace(diagnostic,
    "  void 0; it('another diagnostic', async () => {});\n" + diagnostic)]);
  mutations.push(['diagnosticTitles', 'duplicate diagnostic title', source.replace(diagnostic,
    "  it('tripwire-match-vs-no-match-aa', async () => {});\n" + diagnostic)]);
  for (const [helper, pin] of [['tripwireTimingProbe', 'syntheticHelperSource'],
    ['realClickTripwireTimingProbe', 'realClickHelperSource']] as const) {
    for (const statement of ['if (payloadA === payloadB) expect(result.pValue).toBeGreaterThan(0.01);',
      'const gate = ' + gateMap + "; gate.set('tripwire-match-vs-no-match', result);"]) {
      const body = timingFunctionText(source, helper);
      mutations.push([pin, helper + ': ' + statement, source.replace(body,
        body.replace('  return result;', '  ' + statement + '\n  return result;'))]);
    }
  }
  for (const args of ['NONMATCH, NONMATCH', 'CANARY, NONMATCH2', 'NONMATCH, CANARY']) {
    mutations.push(['gatedSynthetic', 'synthetic gated arms: ' + args, source.replace(
      '    const result = await tripwireTimingProbe(CANARY, NONMATCH);',
      '    const result = await tripwireTimingProbe(' + args + ');',
    )]);
  }
  mutations.push(['taskTitles', 'actual gated it title renamed', source.replace(
    "  it('kills secret-length-dependent fill latency after asserting exact result equality',",
    "  it('renamed gated probe',",
  )]);
  const floor = timingFunctionText(source, 'recordSensitivityFloor');
  mutations.push(['floorRecording', 'floor recording catch removed', source.replace(floor,
    floor.replace('  try {\n', '').replace('  } catch (error) { try { console.error(error); } catch {} }\n', ''))]);
  mutations.push(['floorRecording', 'floor recording call omitted', source.replace(
    '      recordSensitivityFloor(microseconds, result, rejected.includes(microseconds));', '',
  )]);
  const ledgerHook = source.match(/^afterEach\(\(\{ task \}\) => \{[\s\S]*?^\}\);/mu)?.[0] ?? '';
  mutations.push(['ledgerRecording', 'ledger outer catch removed', source.replace(ledgerHook,
    ledgerHook.replace('  try {\n', '').replace('  } catch (error) { try { console.error(error); } catch {} }\n', ''))]);
  mutations.push(['ledgerRecording', 'ledger console outside guard', source.replace(ledgerHook,
    ledgerHook.replace('\n});', '\n  console.error("unguarded");\n});'))]);
  return mutations;
}

function timingConstructionMutations(source: string): [string, string, string][] {
  return [
    ['helperSampling', '499 pairs', source.replace('pairs: 500, warmup: 20,', 'pairs: 499, warmup: 20,')],
    ['helperSampling', '19 warmups', source.replace('pairs: 500, warmup: 20,', 'pairs: 500, warmup: 19,')],
    ['gatedRealClick', 'gated caller adds bias', source.replace('await realClickTripwireTimingProbe(CANARY, NONMATCH);',
      'await realClickTripwireTimingProbe(CANARY, NONMATCH, { afterB: () => spinForMicroseconds(2) });')],
    ['syntheticRecording', 'synthetic raw recording omitted', source.replace('    recordDiagnostic(name, result, rejection);', '')],
    ['diagnosticStatistics', 'diagnostic recording omitted', source.replace('    recordDiagnostic(name, result);', '')],
    ['diagnosticStatistics', 'structural check omitted', source.replace('    assertFiniteProbeStatistics(result);', '')],
    ['diagnosticStatistics', 'entry check omitted', source.replace('    expect(' + 'diagnostic' + 'Results' + '.has(name)).toBe(true);', '')],
    ['diagnosticStatistics', 'title and recording name differ', source.replace("    const name = 'tripwire-match-vs-no-match-aa';", "    const name = 'wrong-entry';")],
    ['diagnosticConstruction', 'sham uses empty transform set', source.replace('new Set(SECRET_TRANSFORM_NAMES)', 'new Set([])')],
  ];
}

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
  const direct = ['assertProbeFamily', '(' + 'probe' + 'Results' + ', { alpha: 0.01, expected: PROBE_NAMES })', ';'].join('');
  return source.split('\n').some((line) => line.trim() === direct);
}

function hasWrappedFamilyGate(source: string): boolean {
  return source.includes(['expect(() => assertProbeFamily', '(' + 'probe' + 'Results'].join(''));
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
