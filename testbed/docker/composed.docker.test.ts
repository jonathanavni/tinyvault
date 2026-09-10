import { MAX_EVENTS_BYTES } from './protocol';
// Integrator-run only. The deployment requirement is assumed; these tests do not verify daemon
// non-exposure or containment after fixture-process compromise. make test excludes this exact file.
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect } from 'node:util';
import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { Browser } from '../../src/browser/playwright';
import { BridgeSession } from './bridge';
import { startComposedFixtureSet, probeHttpOrigin } from './composedFixtures';
import { buildDockerSpawn, bounded, COMMAND_TIMEOUT_MS, EXPORT_TIMEOUT_MS, ComposedConstructionError, systemClock,
  type DockerSpawn, type DockerResult } from './exec';
import { canaryCommitment, CompletionVerifier } from '../completion';
import type { RunRecord } from '../scorecard.schema';
import { BENIGN_USERNAME } from '../scenarios/benignLoginConstants';
import { verifyEventsDigest } from '../fixtures/shared/loginFixture';
import { persistFixtureCapture } from './captureTransfer';
import { capturePersistedRuns, offlineArtifactPaths } from '../runner';
import { captureParityBundle, type ParityBundle } from '../parity/capture';
import { compareParityBundles, compareParityTriplet } from '../parity/compare';
import { adjudicatePersistedRuns, type OfflineEvidenceManifest } from '../checkers/offline';
import { AGENT_CONFIGS } from '../evalAgents';
import { IntegrationEvidence, localPin, commandKind, assertClean, assertMarker, checkStoppedSurfaces, checkArtifacts, adminCounts, assertProbeWindow, checkTerminalProbe } from './integrationEvidence';
import { matrix, targets, probeBrowser, detectedRoute, coverageGaps, classifyProbe, reachedServer, supervisedMatrix } from './integrationProbes';
import topology from './topology.json';

vi.setConfig({ testTimeout: 1_800_000, hookTimeout: 180_000 });
const markers = topology.markers;
const PROBE_METRICS_PATH = join(process.cwd(), '.vitest', 'slice4-probe-metrics.json');
const RUNNER_METRICS_PATH = join(process.cwd(), '.vitest', 'slice4-runner-metrics.json');
function surfaceMetrics(e: IntegrationEvidence) {
  return {
    scanners: e.secrets.length,
    execStderr: e.bridges.map((b) => ({ bytes: b.stderrBytes, headroom: 65536 - b.stderrBytes })),
    exports: e.exports.map((x) => ({ bytes: x.bytes, elapsedMs: x.elapsedMs,
      stderrBytes: x.stderrBytes, stderrHeadroom: 65536 - x.stderrBytes })),
  };
}
async function resetMetrics(path: typeof PROBE_METRICS_PATH): Promise<void> {
  await mkdir(join(process.cwd(), '.vitest'), { recursive: true });
  await writeFile(path, JSON.stringify({ complete: false }) + '\n');
}
type Pin = Awaited<ReturnType<typeof localPin>>;
function testSpawn(pin: Pin, args: string[], epoch?: string): DockerSpawn {
  const base = buildDockerSpawn(pin, { kind: 'image-inspect' });
  return { ...base, args, env: { ...base.env, ...(epoch ? { TV_EVAL_EPOCH: epoch } : {}) } };
}
async function checked(e: IntegrationEvidence, spawn: DockerSpawn): Promise<DockerResult> {
  const result = await e.native.run(spawn);
  expect(result.exitCode, 'test setup/cleanup Docker command').toBe(0);
  return result;
}
async function noProjectLeft(e: IntegrationEvidence, pin: Pin, project = e.project): Promise<void> {
  for (const kind of ['container', 'network']) {
    const result = await checked(e, testSpawn(pin, [kind, 'ls', '-q', '--filter',
      `label=com.docker.compose.project=${project}`]));
    expect(result.stdout.trim(), `${kind} left after teardown`).toBe('');
  }
  expect(e.bridges.every((b) => b.exited()), 'exec process left after teardown').toBe(true);
  // Includes short-lived CLI children, all synchronously registered by the real runner.
  await bounded(Promise.all(e.handles.map((h) => h.exited)), 5000, systemClock,
    new ComposedConstructionError('handle-timeout'));
}
function wireSnapshot(e: IntegrationEvidence, bridges: BridgeSession[]) {
  expect(bridges).toHaveLength(5);
  for (const bridge of bridges) expect(bridge.closed).toBe(false);
  return { completed: bridges.map((b) => b.completedRequests), frames: e.bridges.map((b) => {
    expect(b.exited()).toBe(false); expect(b.errors).toEqual([]);
    expect(b.responses.every((f) => f.kind === 'res' && f.ok)).toBe(true);
    return { requests: [...b.requests], responses: b.responses.map((f) => `${f.id}:${f.kind}:${f.op}`) };
  }) };
}
async function primitiveSnapshot(e: IntegrationEvidence, pin: Pin) {
  const counts = [];
  for (const bridge of e.bridges) {
    const logs = await checked(e, testSpawn(pin, ['logs', bridge.id]));
    assertClean(logs.stdout + logs.stderr, e.secrets);
    counts.push(adminCounts(logs.stdout + logs.stderr));
  }
  return counts;
}
function inspected(e: IntegrationEvidence): Record<string, any>[] {
  return e.results.filter(({ spawn }) => commandKind(spawn) === 'inspect').map(({ result }) => JSON.parse(result.stdout)[0]);
}
function checkDescriptionSurfaces(e: IntegrationEvidence): void {
  for (const spawn of e.spawns) assertClean(JSON.stringify(spawn), e.secrets);
  for (const { result } of e.results) { assertClean(result.stdout, e.secrets); assertClean(result.stderr, e.secrets); }
  for (const doc of inspected(e)) {
    assertMarker(JSON.stringify(doc.Config.Env), 'TV_FIXTURE_ID');
    assertMarker(JSON.stringify(doc.Config.Labels), e.epoch);
    assertMarker(JSON.stringify([doc.Config.Cmd, doc.Args]), markers.ARGV_MARKER);
  }
  const image = JSON.parse(e.results.find(({ spawn }) => commandKind(spawn) === 'image')!.result.stdout)[0];
  assertMarker(JSON.stringify(image.Config.Env), 'NODE_VERSION');
  assertMarker(Object.entries(image.Config.Labels).map(([k, v]) => `${k}=${v}`).join('\n'), markers.HISTORY_MARKER);
  const history = e.results.find(({ spawn }) => commandKind(spawn) === 'history')!;
  expect(history.spawn.args).toContain('--no-trunc');
  expect(history.spawn.args).toContain('{{json .}}');
  const decoded = history.result.stdout.trim().split('\n').map((line) => JSON.parse(line));
  assertMarker(JSON.stringify(decoded), markers.HISTORY_MARKER);
  assertClean(JSON.stringify(decoded), e.secrets);
}
function teardownOrder(e: IntegrationEvidence): void {
  const kinds = e.spawns.map(commandKind);
  expect(kinds.filter((k) => k === 'stop')).toHaveLength(1);
  expect(kinds.filter((k) => k === 'down')).toHaveLength(1);
  for (const kind of ['logs', 'export', 'history']) {
    expect(kinds.indexOf(kind)).toBeGreaterThan(kinds.indexOf('stop'));
    expect(kinds.lastIndexOf(kind)).toBeLessThan(kinds.indexOf('down'));
  }
}

describe.sequential('slice 4 real Docker construction and control-route probes', () => {
  it('K-leg canonical two-transport parity and K-observer-inert', async () => {
    const metricsPath = join(process.cwd(), '.vitest', 'slice6-parity-metrics.json');
    await resetMetrics(metricsPath);
    const e = new IntegrationEvidence(); const bundles: ParityBundle[] = [];
    let complete = false; let failedArtifactRoot: string | undefined;
    try {
      const inProcess = await captureParityBundle('in-process'); bundles.push(inProcess);
      const pin = await localPin();
      const composed = await captureParityBundle('composed', { dockerPin: pin, dockerRunner: e.runner }); bundles.push(composed);
      const unobserved = await captureParityBundle('in-process', { wire: false }); bundles.push(unobserved);
      // These assertions use only fixed labels/counts, never raw evidence in Vitest diffs.
      expect(new Set(bundles.map((bundle) => bundle.root)).size).toBe(3);
      expect(bundles.map((bundle) => bundle.runs.length)).toEqual([10, 10, 10]);
      for (const bundle of bundles) expect(bundle.timing.captureMs).toBeLessThanOrEqual(60000);
      const wrongProvenance: ParityBundle = { ...composed, trust: { ...composed.trust, provenance: {
        ...composed.trust.provenance, 'benign-login': { ...composed.trust.provenance['benign-login']!, architecture: 'in-process' },
      } } };
      await expect(compareParityBundles(inProcess, wrongProvenance)).rejects.toThrow('Parity provenance');
      const altered: ParityBundle = { ...composed, runs: composed.runs.map((run, index) => index === 0
        ? { ...run, outcome: { ...run.outcome, bodiesUnobserved: run.outcome.bodiesUnobserved + 1 } } : run) };
      await expect(compareParityTriplet(inProcess, altered, unobserved)).rejects.toThrow('Parity difference');
      await compareParityTriplet(inProcess, composed, unobserved);
      expect(e.bridges).toHaveLength(5);
      checkDescriptionSurfaces(e); checkStoppedSurfaces(e);
      await checkArtifacts(e, composed.root); await noProjectLeft(e, pin);
      expect(e.bridges.every((bridge) => bridge.errors.length === 0)).toBe(true);
      for (const exported of e.exports) expect(exported.elapsedMs).toBeLessThan(EXPORT_TIMEOUT_MS);
      complete = true;
    } catch (error) {
      if (error instanceof Error && 'artifactRoot' in error && typeof error.artifactRoot === 'string') failedArtifactRoot = error.artifactRoot;
      throw error;
    } finally {
      await e.finish();
      await writeFile(metricsPath, JSON.stringify({ complete, ...(failedArtifactRoot ? { failedArtifactRoot } : {}),
        legs: bundles.map((bundle) => ({ architecture: bundle.architecture, observed: bundle.observed,
          ...bundle.timing, browser: bundle.browser, auxiliary: bundle.artifacts.auxiliary,
          ...(complete ? {} : { artifactRoot: bundle.root }) })) }) + '\n');
      // Failed roots remain for owner diagnosis; success releases secret byte buffers and files.
      if (complete) for (const bundle of bundles) await bundle.destroy();
      else for (const bundle of bundles) for (const bytes of bundle.artifacts.files.values()) bytes.fill(0);
    }
  });

  it('authenticates all fixtures, probes page and supervised routes, then scans every stopped surface', async () => {
    await resetMetrics(PROBE_METRICS_PATH);
    const registrationThroughAttestationMs: number[] = [];
    let metrics!: ReturnType<typeof surfaceMetrics> & { teardownMs: number };
    const pin = await localPin();
    const root = await mkdtemp(join(tmpdir(), 'tinyvault-docker-evidence-'));
    const e = new IntegrationEvidence(); const bridges: BridgeSession[] = [];
    const hello = BridgeSession.prototype.hello;
    const spy = vi.spyOn(BridgeSession.prototype, 'hello').mockImplementation(async function (this: BridgeSession, body) {
      const key = await hello.call(this, body); bridges.push(this); return key;
    });
    let browser: Browser | undefined;
    let fixtures: Awaited<ReturnType<typeof startComposedFixtureSet>> | undefined;
    try {
      fixtures = await startComposedFixtureSet({ pin, artifactRoot: root, runner: e.runner, probeOrigin: probeHttpOrigin });
      expect(Object.keys(fixtures).sort()).toEqual(Object.keys(topology.services).sort());
      expect(e.secrets).toHaveLength(5);
      for (const [id, fixture] of Object.entries(fixtures)) {
        expect(fixture.architecture).toBe('composed'); expect(fixture.reachability).toBe('http');
        expect(await probeHttpOrigin(fixture.origin)).toBe(true);
        const index = Object.keys(topology.services).indexOf(id);
        const frame = e.bridges[index].responses[1];
        expect(frame.kind === 'res' && frame.ok).toBe(true);
        if (frame.kind !== 'res' || !frame.ok) throw new Error('hello-response');
        expect(fixture.verificationPublicKey.export({ format: 'der', type: 'spki' }).toString('base64url')).toBe(frame.body.publicKey);
        const start = performance.now();
        const setup = { scenarioId: id, runId: `integration-${id}`, nonce: `nonce-${id}`, canaryId: `canary-${id}`, canary: `synthetic-${id}` };
        await fixture.registerRun(setup);
        const page = await fixture.getLoginPage(setup.runId); assertClean(page, e.secrets);
        const body = new URLSearchParams({ runId: setup.runId, username: BENIGN_USERNAME, password: setup.canary }).toString();
        expect(await fixture.submitLogin(body)).toBe(303);
        await fixture.finalizeRun(setup.runId);
        const receipt = await fixture.takeReceipt(setup.runId); expect(receipt).toBeDefined();
        expect(await fixture.takeReceipt(setup.runId)).toBe(receipt);
        expect(JSON.parse(receipt!)).toMatchObject({ version: '2', payload: { fixtureId: id, runId: setup.runId } });
        const [otherId, otherFixture] = Object.entries(fixtures).find(([candidate]) => candidate !== id)!;
        const binding = { fixtureId: otherId, fixtureVersion: id === 'benign-login' ? '2' : '1', ...setup,
          canaryCommitment: canaryCommitment(setup.canary), successEndpoint: `${fixture.origin}/success` };
        expect(new CompletionVerifier(fixture.verificationPublicKey).verify(receipt, binding))
          .toMatchObject({ taskCompleted: false, reason: 'binding-mismatch' });
        expect(new CompletionVerifier(otherFixture.verificationPublicKey).verify(receipt, binding).taskCompleted).toBe(false);
        expect(fixture.verifyCompletion(receipt, { fixtureId: id, fixtureVersion: id === 'benign-login' ? '2' : '1', ...setup,
          canaryCommitment: canaryCommitment(setup.canary), successEndpoint: `${fixture.origin}/success` })).toEqual({ taskCompleted: true });
        const capture = await fixture.captureRequests(setup.runId); expect(Buffer.from(capture).toString()).toBe(body + '\n');
        await persistFixtureCapture(root, setup.runId, capture);
        const events = Buffer.from('[]'); const attest = await fixture.attestEvents(setup.runId, events);
        const elapsedMs = performance.now() - start; expect(elapsedMs).toBeLessThan(60000);
        registrationThroughAttestationMs.push(elapsedMs);
        expect(JSON.parse(attest)).toMatchObject({ version: '2', payload: { fixtureId: id, runId: setup.runId } });
        expect(verifyEventsDigest(attest, id, setup.runId, events, fixture.verificationPublicKey)).toBe(true);
        expect(verifyEventsDigest(attest, otherId, setup.runId, events, fixture.verificationPublicKey)).toBe(false);
        expect(verifyEventsDigest(attest, otherId, setup.runId, events, otherFixture.verificationPublicKey)).toBe(false);
        await fixture.acknowledgeReceipt(setup.runId);

      }
      let beforeWire = wireSnapshot(e, bridges);
      let beforeAdmin = await primitiveSnapshot(e, pin);
      for (const counts of beforeAdmin) for (const operation of ['register', 'key', 'receipt', 'capture', 'attest', 'finalize', 'ack'] as const) expect(counts[operation]).toBeGreaterThan(0);
      const invariant = () => assertProbeWindow(beforeWire, wireSnapshot(e, bridges));
      const administrativeInvariant = async () => assertProbeWindow(beforeAdmin, await primitiveSnapshot(e, pin));
      // Actual idempotent control read is the absence oracle's positive control. Its result is ignored;
      // both the wire consumer and independent primitive log consumer must detect the settled delta.
      const registered = e.bridges[0].responses.find((frame) => frame.op === 'register')!;
      if (registered.kind !== 'res' || !registered.ok) throw new Error('register-response');
      await bridges[0].request('key', { epoch: e.epoch, fixtureId: 'benign-login', runId: 'integration-benign-login', capability: registered.body.key });
      expect(invariant).toThrow('underlying administration');
      await expect(administrativeInvariant()).rejects.toThrow('underlying administration');
      beforeWire = wireSnapshot(e, bridges); beforeAdmin = await primitiveSnapshot(e, pin);
      invariant(); browser = await probeBrowser();
      const destinations = targets(inspected(e));
      for (const hostile of [`http://127.0.0.1:${topology.services['lookalike-origin'][1].host}`,
        fixtures['dom-hidden-injection']!.origin, fixtures['secret-echo']!.origin, fixtures['fake-reauth']!.origin]) {
        const probes = await matrix(browser, hostile, destinations, invariant);
        expect(probes.filter(detectedRoute)).toEqual([]);
        expect(coverageGaps(probes)).toEqual([]); // the suite pins coverage itself, not only through matrix()
        // Oracle positive control: the lookalike origin answers 200 to any POST /login, and a form navigation
        // response is observable without CORS — so the route oracle must fire here, or it is blind.
        const positive = await matrix(browser, hostile,
          [{ url: `http://127.0.0.1:${topology.services['lookalike-origin'][1].host}/login`, label: 'positive-control-login', routable: true }], invariant);
        expect(positive.filter((p) => p.method === 'form').map(classifyProbe)).toEqual(['route']);
        expect(positive.some(detectedRoute)).toBe(true);
        await supervisedMatrix(browser, hostile, destinations, invariant);
      }
      await browser.close(); browser = undefined;
      invariant(); await administrativeInvariant();
      // Fill the locked 32-run budget only after slow probes. No expired early token is consumed.
      for (const [id, fixture] of Object.entries(fixtures)) for (let run = 1; run < 32; run++) {
        await fixture.registerRun({ scenarioId: id, runId: `budget-${run}`, nonce: `nonce-${run}`, canaryId: `canary-${run}`, canary: `synthetic-${run}` });
      }
      expect(e.secrets).toHaveLength(965); // 5 bootstrap secrets + 5 fixtures x 32 runs x 6 capability tokens (was 579 at three fixtures)
      await mkdir(join(root, 'nested', 'last'), { recursive: true });
      await writeFile(join(root, 'nested', 'last', 'nonsecret'), 'artifact traversal control');
      const teardownStart = performance.now();
      await expect(fixtures['benign-login']!.registerRun({ scenarioId: 'overflow', runId: 'overflow', nonce: 'overflow', canaryId: 'overflow', canary: 'synthetic' })).rejects.toMatchObject({ code: 'bridge-protocol' });
      await fixtures['benign-login']!.close();
      await fixtures['lookalike-origin']!.close(); // The shared closer must be idempotent.
      // stop drains admitted work; these immutable stopped logs close the early daemon-log race.
      const terminalInvariant = () => checkTerminalProbe(e, beforeAdmin, beforeWire, bridges.map((b) => b.completedRequests));
      terminalInvariant();
      const stoppedLog = e.results.find(({ spawn }) => commandKind(spawn) === 'logs')!.result;
      const originalLog = stoppedLog.stderr;
      try {
        stoppedLog.stderr += '\nfixture-admin:receipt\n';
        expect(terminalInvariant, 'final stopped consumer positive control').toThrow('final stopped administration changed');
      } finally { stoppedLog.stderr = originalLog; }
      terminalInvariant();
      checkDescriptionSurfaces(e); checkStoppedSurfaces(e); teardownOrder(e);
      await checkArtifacts(e, root); await noProjectLeft(e, pin);
      expect(e.bridges.every((b) => b.errors.length === 0)).toBe(true);
      for (const exported of e.exports) { expect(exported.elapsedMs).toBeGreaterThan(0); expect(exported.elapsedMs).toBeLessThan(EXPORT_TIMEOUT_MS); }
      metrics = { ...surfaceMetrics(e), teardownMs: performance.now() - teardownStart };
    } finally {
      await browser?.close();
      try { await fixtures?.['benign-login']?.close(); }
      finally { spy.mockRestore(); await e.finish(); await rm(root, { recursive: true, force: true }); }
    }
    // Fixed numeric schema only; complete is written after every assertion and cleanup succeeds.
    await writeFile(PROBE_METRICS_PATH, JSON.stringify({ complete: true, registrationThroughAttestationMs, ...metrics }) + '\n');
  });

  it('composed real browser captures persist exactly and adjudicate offline within the capability lifetime', async () => {
    await resetMetrics(RUNNER_METRICS_PATH);
    let metrics!: ReturnType<typeof surfaceMetrics>;
    const pin = await localPin(); const e = new IntegrationEvidence();
    const root = await mkdtemp(join(tmpdir(), 'tinyvault-docker-runner-'));
    const started = new Map<string, number>(); const timings: number[] = [];
    const request = BridgeSession.prototype.request;
    const spy = vi.spyOn(BridgeSession.prototype, 'request').mockImplementation(async function (this: BridgeSession, op, body) {
      const key = `${body.fixtureId}:${body.runId}`;
      if (op === 'register') started.set(key, performance.now());
      const result = await request.call(this, op, body);
      if (op === 'attest') timings.push(performance.now() - started.get(key)!);
      return result;
    });
    let refusals = 0;
    try {
      const trust = await capturePersistedRuns(root, 1, undefined, { architecture: 'composed', dockerPreflight: async () => pin,
        dockerRunner: e.runner, probeOrigin: probeHttpOrigin, launchChromium: async () => {
          const browser = await probeBrowser(); const newContext = browser.newContext.bind(browser);
          vi.spyOn(browser, 'newContext').mockImplementation(async (...args) => {
            const context = await newContext(...args); context.on('response', (response) => { if (response.status() === 409) refusals++; }); return context;
          }); return browser;
        } });
      expect(refusals).toBe(0); expect(timings).toHaveLength(5); for (const ms of timings) expect(ms).toBeLessThan(60000);
      const paths = offlineArtifactPaths(root);
      const persisted = JSON.parse(await readFile(paths.capturedRunsPath, 'utf8')) as RunRecord[];
      const manifest = JSON.parse(await readFile(paths.manifestPath, 'utf8')) as OfflineEvidenceManifest;
      expect(persisted).toHaveLength(5); expect(manifest.runs).toHaveLength(5);
      for (const record of persisted) {
        expect(record.completionOracleVersion).toBe('2');
        expect(JSON.parse(record.completionReceipt!).version).toBe('2');
      }
      for (const evidence of manifest.runs) {
        expect(JSON.parse(evidence.eventsAttestation)).toMatchObject({ version: '2', payload: {
          fixtureId: evidence.completionBinding.fixtureId, runId: evidence.completionBinding.runId,
        } });
      }
      const runs = await adjudicatePersistedRuns({ runsPath: paths.capturedRunsPath, manifestPath: paths.manifestPath, artifactDirectory: root,
        verificationKeys: trust.verificationKeys, scenarioRegistry: trust.scenarioRegistry, agentConfigs: AGENT_CONFIGS });
      expect(runs).toHaveLength(5); expect(runs.every((r) => r.outcome.taskCompleted && !r.outcome.secretLeaked)).toBe(true);
      expect(e.bridges.flatMap((b) => b.requests).some((s) => s.endsWith(':ack'))).toBe(false);
      expect(e.secrets).toHaveLength(35); checkDescriptionSurfaces(e); checkStoppedSurfaces(e); await checkArtifacts(e, root); await noProjectLeft(e, pin);
      metrics = surfaceMetrics(e);
    } finally { spy.mockRestore(); await e.finish(); await rm(root, { recursive: true, force: true }); }
    await writeFile(RUNNER_METRICS_PATH, JSON.stringify({ complete: true,
      registrationThroughAttestationMs: timings, normal409Responses: refusals, ...metrics }) + '\n');
  });

  it('same-image same-label pre-existing container is project-not-fresh with zero teardown', async () => {
    const pin = await localPin(); const e = new IntegrationEvidence();
    const root = await mkdtemp(join(tmpdir(), 'tinyvault-docker-stale-'));
    let staleId = '';
    const run = e.runner.run;
    e.runner.run = async (description) => {
      if (commandKind(description) === 'ps-project' && !staleId) {
        const project = description.args[description.args.indexOf('--filter') + 1].slice('label=com.docker.compose.project='.length);
        const labels = { 'com.docker.compose.project': project, 'com.docker.compose.service': 'benign-login',
          'com.tinyvault.fixture': 'benign-login', 'com.tinyvault.epoch': description.env.TV_EVAL_EPOCH,
          'com.docker.compose.oneoff': 'False' };
        const result = await checked(e, testSpawn(pin, ['create', ...Object.entries(labels).flatMap(([k, v]) => ['--label', `${k}=${v}`]),
          topology.imageName]));
        staleId = result.stdout.trim();
      }
      return run(description);
    };
    try {
      await expect(startComposedFixtureSet({ pin, artifactRoot: root, runner: e.runner,
        probeOrigin: probeHttpOrigin })).rejects.toMatchObject({ code: 'project-not-fresh' });
      expect(e.spawns.map(commandKind)).toEqual(['ps-project']);
      const stillThere = await checked(e, testSpawn(pin, ['inspect', staleId]));
      const doc = JSON.parse(stillThere.stdout)[0];
      expect(doc.Config.Labels['com.tinyvault.epoch']).toBe(e.epoch);
      const image = JSON.parse((await checked(e, testSpawn(pin, ['image', 'inspect', topology.imageName]))).stdout)[0];
      expect(doc.Image).toBe(image.Id);
    } finally {
      try { if (staleId) await checked(e, testSpawn(pin, ['rm', '-f', staleId])); }
      finally { await e.finish(); await rm(root, { recursive: true, force: true }); }
    }
  });

  it('killing the first authenticated exec is bridge-closed with one bridge spawn and no reconnect', async () => {
    const pin = await localPin(); const e = new IntegrationEvidence();
    const root = await mkdtemp(join(tmpdir(), 'tinyvault-docker-death-'));
    try {
      await expect(startComposedFixtureSet({ pin, artifactRoot: root, runner: e.runner, probeOrigin: async (origin) => {
        expect(await probeHttpOrigin(origin)).toBe(true);
        e.bridges[0].handle.kill(); await e.bridges[0].handle.exited;
        return true;
      } })).rejects.toMatchObject({ code: 'bridge-closed' });
      expect(e.bridges).toHaveLength(1);
      expect(e.spawns.filter((s) => commandKind(s) === 'exec')).toHaveLength(1);
      expect(e.bridges[0].requests).toEqual(['1:bootstrap', '2:hello']);
      teardownOrder(e); await noProjectLeft(e, pin);
    } finally { await e.finish(); await rm(root, { recursive: true, force: true }); }
  });

  it('the dynamic matrix detects an extra published page port after a direct Compose override reaches Docker', async () => {
    const pin = await localPin(); const e = new IntegrationEvidence();
    const root = await mkdtemp(join(tmpdir(), 'tinyvault-docker-override-'));
    const epoch = `${Date.now()}-${randomBytes(16).toString('hex')}`;
    const project = `tinyvault-mutant-${randomBytes(8).toString('hex')}`;
    const extraPort = 47160; // outside every topology tuple (47140/47150 are now secret-echo/fake-reauth)
    const override = join(root, 'override.json');
    await writeFile(override, JSON.stringify({ services: { 'benign-login': {
      ports: [`127.0.0.1:${extraPort}:${topology.services['benign-login'][0].container}`],
    } } }));
    const base = buildDockerSpawn(pin, { kind: 'compose-up', project, epoch });
    const args = [...base.args]; args.splice(args.indexOf('-p'), 0, '-f', override);
    let browser: Browser | undefined;
    try {
      // This deliberate bypass reaches the dynamic probe; neither lint nor verifyInspect rejects it first.
      await directCompose(e, { ...base, args });
      const ps = await checked(e, buildDockerSpawn(pin, { kind: 'compose-ps', project, epoch, service: 'benign-login' }));
      const doc = JSON.parse((await checked(e, testSpawn(pin, ['inspect', ps.stdout.trim()]))).stdout)[0];
      expect(doc.NetworkSettings.Ports['8080/tcp'].some((p: { HostPort: string }) => p.HostPort === String(extraPort))).toBe(true);
      browser = await probeBrowser();
      const hostile = `http://127.0.0.1:${topology.services['dom-hidden-injection'][0].host}`;
      // The extra publication serves a page, not a /control endpoint. Probe its known page route as
      // the reachability control; /control remains 404 even in this mutant, so it cannot be its oracle.
      const mutant = await matrix(browser, hostile, [{ url: `http://127.0.0.1:${extraPort}/`, label: 'extra-publication' , routable: true}], () => {});
      // Reachability, not a control route: the extra publication serves a page, and Chromium reports the
      // cross-origin HTML as an ORB/CORS failure rather than a response — that failure is the proof a server answered.
      expect(mutant.some(reachedServer)).toBe(true);
      expect(() => expect(mutant.filter(reachedServer)).toEqual([])).toThrow();
      await directCompose(e, base); // Reconcile the same project against the canonical file, removing the extra port.
      const restored = await matrix(browser, hostile, [{ url: `http://127.0.0.1:${extraPort}/`, label: 'extra-publication' , routable: true}], () => {});
      expect(restored.filter(reachedServer)).toEqual([]);
    } finally {
      await browser?.close();
      try {
        await checked(e, buildDockerSpawn(pin, { kind: 'compose-down', project, epoch }));
        await noProjectLeft(e, pin, project);
      }
      finally { await e.finish(); await rm(root, { recursive: true, force: true }); }
    }
  });
});

async function directCompose(e: IntegrationEvidence, description: DockerSpawn): Promise<void> {
  const child = spawn(description.file, [...description.args], { env: { ...description.env }, stdio: 'pipe' });
  const exited = new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  const handle = { exited, kill: () => { child.kill('SIGKILL'); } }; e.handles.push(handle);
  child.stdin.end(); child.stdout.resume(); child.stderr.resume();
  const code = await bounded(exited, COMMAND_TIMEOUT_MS, systemClock,
    new ComposedConstructionError('command-timeout'), handle.kill);
  expect(code, 'direct override must reach running Compose services').toBe(0);
}

// Owner-run on real Docker; the complete public call includes the host-side copies and queue.
it('AM12 exact-cap attest completes three finalized runs within the unchanged operation timer', async () => {
  expect(await readFile(new URL('./bridge.ts', import.meta.url), 'utf8'))
    .toContain('this.#timeoutMs = options.timeoutMs ?? 5000;');
  expect(MAX_EVENTS_BYTES).toBe(1048576);
  const pin = await localPin();
  const root = await mkdtemp(join(tmpdir(), 'tinyvault-am12-docker-'));
  const e = new IntegrationEvidence();
  const fixtures = await startComposedFixtureSet({ pin, artifactRoot: root, runner: e.runner, probeOrigin: probeHttpOrigin });
  const fixture = fixtures['benign-login']!;
  const elapsedMs: number[] = [];
  const calls = vi.spyOn(BridgeSession.prototype, 'request');
  try {
    for (let trial = 0; trial < 3; trial++) {
      const runId = `am12-exact-${trial}`;
      await fixture.registerRun({ runId, scenarioId: 'benign-login-control', nonce: `nonce-${trial}`,
        canaryId: `canary-${trial}`, canary: `synthetic-${trial}` });
      await fixture.finalizeRun(runId);
      const bytes = Buffer.alloc(MAX_EVENTS_BYTES, 0x61);
      const start = performance.now();
      const attestation = await fixture.attestEvents(runId, bytes);
      elapsedMs.push(performance.now() - start);
      expect(verifyEventsDigest(attestation, 'benign-login', runId, bytes, fixture.verificationPublicKey)).toBe(true);
    }
    const measurement = { elapsedMs, maximumMs: Math.max(...elapsedMs),
      minimumHeadroomMs: 5000 - Math.max(...elapsedMs), maximumHeadroomMs: 5000 - Math.min(...elapsedMs), cap: MAX_EVENTS_BYTES };
    await mkdir(join(process.cwd(), '.vitest'), { recursive: true });
    await writeFile(join(process.cwd(), '.vitest', 'am12-docker.measurement.json'), JSON.stringify(measurement, null, 2));
    for (const elapsed of elapsedMs) expect(elapsed).toBeLessThan(5000);
    await fixture.registerRun({ runId: 'am12-over', scenarioId: 'benign-login-control', nonce: 'over', canaryId: 'over', canary: 'synthetic' });
    await fixture.finalizeRun('am12-over');
    calls.mockClear();
    await expect(fixture.attestEvents('am12-over', Buffer.alloc(MAX_EVENTS_BYTES + 1)))
      .rejects.toMatchObject({ code: 'bridge-protocol' });
    expect(calls.mock.calls.filter(([op]) => op === 'attest')).toEqual([]);
  } finally {
    calls.mockRestore();
    await Promise.all(Object.values(fixtures).map(fixture => fixture.close()));
    await noProjectLeft(e, pin);
    await rm(root, { recursive: true, force: true });
  }
});
