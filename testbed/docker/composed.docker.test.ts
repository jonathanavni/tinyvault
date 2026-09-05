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
import { buildDockerSpawn, bounded, COMMAND_TIMEOUT_MS, ComposedConstructionError, systemClock,
  type DockerSpawn, type DockerResult } from './exec';
import { scanArtifactTree, SecretScanner } from './secretScan';
import { IntegrationEvidence, localPin, commandKind, assertClean, assertMarker } from './integrationEvidence';
import { matrix, targets, probeBrowser, detectedRoute, supervisedMatrix } from './integrationProbes';
import topology from './topology.json';

vi.setConfig({ testTimeout: 1_800_000, hookTimeout: 180_000 });
const markers = topology.markers;
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
function assertEstablished(e: IntegrationEvidence, bridges: BridgeSession[]): void {
  expect(bridges).toHaveLength(3);
  for (const bridge of bridges) { expect(bridge.closed).toBe(false); expect(bridge.completedRequests).toBe(2); }
  for (const bridge of e.bridges) {
    expect(bridge.exited()).toBe(false);
    expect(bridge.requests).toEqual(['1:bootstrap', '2:hello']);
    expect(bridge.responses.map((f) => `${f.id}:${f.kind}:${f.op}`)).toEqual(['1:res:bootstrap', '2:res:hello']);
    expect(bridge.responses.every((f) => f.kind === 'res' && f.ok)).toBe(true);
    expect(bridge.errors).toEqual([]);
  }
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
function checkStoppedSurfaces(e: IntegrationEvidence): void {
  const logs = e.results.filter(({ spawn }) => commandKind(spawn) === 'logs');
  expect(logs).toHaveLength(3);
  for (const { result } of logs) {
    const text = result.stdout + result.stderr;
    assertMarker(text, markers.BOOT_MARKER); assertMarker(text, markers.SHUTDOWN_MARKER);
    expect(text.includes('control-second-connection')).toBe(false);
    // Exact runtime-produced Buffer encodings, independently passed through the real decoder.
    const encodedBoot = inspect(Buffer.from(markers.BOOT_MARKER));
    const encodedStop = JSON.stringify(Buffer.from(markers.SHUTDOWN_MARKER));
    expect(text.includes(encodedBoot)).toBe(true); expect(text.includes(encodedStop)).toBe(true);
    assertMarker(encodedBoot, markers.BOOT_MARKER); assertMarker(encodedStop, markers.SHUTDOWN_MARKER);
  }
  for (const bridge of e.bridges) {
    const stderr = bridge.stderr.snapshot();
    assertClean(stderr, e.secrets); assertMarker(stderr, markers.BRIDGE_MARKER);
  }
  expect(e.exports).toHaveLength(3);
  for (const exported of e.exports) {
    expect(exported.marker.found, 'export marker absent').toBe(true);
    expect(exported.errors).toEqual([]);
    const meta = JSON.parse(exported.tar.text);
    const inputs: string[] = Object.keys(meta.inputs);
    expect(inputs.some((p) => /(?:src\/agents\/|testbed\/runner)/.test(p))).toBe(false);
    expect(inputs).toContain('testbed/scenarios/benignLoginConstants.ts');
    expect(inputs).toContain('testbed/docker/container/fixture.ts');
    expect(Object.keys(meta.outputs).map((p) => p.split('/').at(-1)).sort()).toEqual(['bridge.mjs', 'main.mjs']);
  }
}
async function checkArtifacts(e: IntegrationEvidence, root: string): Promise<void> {
  const secrets = e.secrets.map((secret) => new SecretScanner(secret));
  const marker = new SecretScanner(Buffer.from(markers.ARTIFACT_MARKER));
  try {
    expect(await scanArtifactTree(root, secrets)).toBe(false);
    expect(await scanArtifactTree(root, [marker])).toBe(true);
    assertMarker(await readFile(join(root, 'composed-scan', 'close.marker')), markers.ARTIFACT_MARKER);
  } finally { [...secrets, marker].forEach((s) => s.destroy()); }
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

describe.sequential('slice 3 real Docker construction and control-route probes', () => {
  it('authenticates all fixtures, probes page and supervised routes, then scans every stopped surface', async () => {
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
      expect(e.secrets).toHaveLength(3);
      for (const [id, fixture] of Object.entries(fixtures)) {
        expect(fixture.architecture).toBe('composed'); expect(fixture.reachability).toBe('http');
        expect(await probeHttpOrigin(fixture.origin)).toBe(true);
        const index = Object.keys(topology.services).indexOf(id);
        const frame = e.bridges[index].responses[1];
        expect(frame.kind === 'res' && frame.ok).toBe(true);
        if (frame.kind !== 'res' || !frame.ok) throw new Error('hello-response');
        expect(fixture.verificationPublicKey.export({ format: 'der', type: 'spki' }).toString('base64url')).toBe(frame.body.publicKey);
        // Receipt retrieval remains slice-4; fixture.test.ts proves actual receipt/key identity via the same provider.
        await expect(fixture.takeReceipt('unregistered')).rejects.toMatchObject({ code: 'slice-4' });
      }
      const invariant = () => assertEstablished(e, bridges);
      invariant(); browser = await probeBrowser();
      const destinations = targets(inspected(e));
      for (const hostile of [`http://127.0.0.1:${topology.services['lookalike-origin'][1].host}`,
        fixtures['dom-hidden-injection']!.origin]) {
        const probes = await matrix(browser, hostile, destinations, invariant);
        expect(probes.filter(detectedRoute)).toEqual([]);
        await supervisedMatrix(browser, hostile, destinations, invariant);
      }
      await browser.close(); browser = undefined;
      await mkdir(join(root, 'nested', 'last'), { recursive: true });
      await writeFile(join(root, 'nested', 'last', 'nonsecret'), 'artifact traversal control');
      await fixtures['benign-login']!.close();
      await fixtures['lookalike-origin']!.close(); // The shared closer must be idempotent.
      checkDescriptionSurfaces(e); checkStoppedSurfaces(e); teardownOrder(e);
      await checkArtifacts(e, root); await noProjectLeft(e, pin);
      expect(e.bridges.every((b) => b.errors.length === 0)).toBe(true);
    } finally {
      await browser?.close();
      try { await fixtures?.['benign-login']?.close(); }
      finally { spy.mockRestore(); await e.finish(); await rm(root, { recursive: true, force: true }); }
    }
  });

  it('same-image same-label pre-existing container is project-not-fresh with zero teardown', async () => {
    const pin = await localPin(); const e = new IntegrationEvidence();
    const root = await mkdtemp(join(tmpdir(), 'tinyvault-docker-stale-'));
    let staleId = '';
    const run = e.runner.run;
    e.runner.run = async (description) => {
      if (commandKind(description) === 'ps--aq' && !staleId) {
        const project = description.args[description.args.indexOf('-p') + 1];
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
      expect(e.spawns.map(commandKind)).toEqual(['ps--aq']);
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
    const extraPort = 47140;
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
      const mutant = await matrix(browser, hostile, [{ url: `http://127.0.0.1:${extraPort}/`, label: 'extra-publication' }], () => {});
      expect(mutant.some(detectedRoute)).toBe(true);
      expect(() => expect(mutant.filter(detectedRoute)).toEqual([])).toThrow();
      await directCompose(e, base); // Reconcile the same project against the canonical file, removing the extra port.
      const restored = await matrix(browser, hostile, [{ url: `http://127.0.0.1:${extraPort}/`, label: 'extra-publication' }], () => {});
      expect(restored.filter(detectedRoute)).toEqual([]);
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
