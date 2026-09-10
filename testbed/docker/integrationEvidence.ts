// Integrator-only observers. Bootstrap copies remain in test memory and are erased after all scans.
import { readFile, realpath, stat } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { FrameDecoder } from './frames';
import { dockerPreflight } from './preflight';
import { createDockerProcessRunner, type DockerHandle, type DockerResult, type DockerSpawn,
  type ProcessHandle, type DockerProcessRunner, ComposedConstructionError } from './exec';
import { observeStderr, SecretScanner, StreamSecretScanner, secretScan, scanArtifactsWithControls, scanSurface } from './secretScan';
import { CAPABILITY_OPS, type Frame } from './protocol';
import { validateTopology } from './topology.mjs';
const topology = validateTopology(JSON.parse(readFileSync(new URL('./topology.json', import.meta.url), 'utf8')));

export async function localPin() {
  return dockerPreflight({ env: process.env, realpath, stat, files: { readFile: async (path) => {
    try { return await readFile(path, 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  } } });
}
export function commandKind(s: DockerSpawn): string {
  if (s.args[0] === 'ps') return 'ps-project';
  if (s.args[0] !== 'compose') return s.args[0];
  const args = s.args.slice(s.args.indexOf('-p') + 2);
  return args[0] === 'ps' ? `ps-${args[1]}` : args[0];
}
export function assertClean(surface: string | Uint8Array, secrets: readonly Buffer[]): void {
  // Assertion failures contain booleans, never a bootstrap value or a possibly contaminated surface.
  assert.equal(secrets.some((secret) => secretScan(surface, secret)), false, 'secret-exposed');
}
export function assertMarker(surface: string | Uint8Array, marker: string): void {
  assert.equal(secretScan(surface, Buffer.from(marker)), true, `missing ${marker}`);
}
type ObservedBridge = {
  handle: DockerHandle; requests: string[]; responses: Frame[]; errors: string[];
  stderr: ReturnType<typeof observeStderr>; stderrBytes: number; id: string; exited(): boolean;
};
export class IntegrationEvidence {
  readonly handles: ProcessHandle[] = [];
  readonly spawns: DockerSpawn[] = [];
  readonly results: { spawn: DockerSpawn; result: DockerResult }[] = [];
  readonly bridges: ObservedBridge[] = [];
  readonly secrets: Buffer[] = [];
  readonly exports: { marker: StreamSecretScanner; tar: MetafileFromTar; errors: string[]; stderr: ReturnType<typeof observeStderr>; bytes: number; stderrBytes: number; elapsedMs: number }[] = [];
  readonly scanners: SecretScanner[] = [];
  readonly controls: SecretScanner[] = [];
  readonly native: DockerProcessRunner;
  constructor(native?: DockerProcessRunner) {
    this.native = native ?? createDockerProcessRunner({ register: (h) => this.handles.push(h) });
  }
  private retain(secret: Buffer): void { this.secrets.push(secret); this.scanners.push(new SecretScanner(secret)); }
  readonly runner: DockerProcessRunner = {
    run: async (spawn) => {
      this.spawns.push(spawn);
      const result = await this.native.run(spawn);
      this.results.push({ spawn, result });
      return result;
    },
    spawnLongLived: (spawn) => {
      this.spawns.push(spawn);
      const handle = this.native.spawnLongLived(spawn);
      if (spawn.args[0] === 'exec') return this.observeBridge(handle, spawn).handle;
      if (spawn.args[0] === 'export') this.observeExport(handle);
      return handle;
    },
  };
  observeBridge(handle: DockerHandle, spawn: DockerSpawn): ObservedBridge {
    const input = new PassThrough(); input.pipe(handle.stdin);
    const requests: string[] = []; const responses: Frame[] = []; const errors: string[] = [];
    const decoder = new FrameDecoder((frame) => {
      requests.push(`${frame.id}:${frame.op}`);
      if (frame.kind === 'req' && frame.op === 'bootstrap') {
        this.retain(Buffer.from(frame.body.secret as string, 'base64url'));
      }
    }, (code) => errors.push(code));
    input.on('data', (chunk: Buffer) => decoder.feed(chunk));
    const output = new FrameDecoder((frame) => {
      responses.push(frame);
      if (frame.kind === 'res' && frame.ok && frame.op === 'register') {
        for (const op of CAPABILITY_OPS) {
          const token = frame.body[op];
          if (typeof token !== 'string' || Buffer.from(token, 'base64url').length !== 32
            || Buffer.from(token, 'base64url').toString('base64url') !== token) { errors.push('evidence-token'); continue; }
          this.retain(Buffer.from(token, 'base64url'));
        }
      }
    }, (code) => errors.push(code));
    handle.stdout.on('data', (chunk: Buffer) => output.feed(chunk));
    handle.stdout.on('end', () => output.end());
    const control = new SecretScanner(Buffer.from(topology.markers.BRIDGE_MARKER)); this.controls.push(control);
    const stderr = observeStderr(handle.stderr, this.scanners, 65536, [control]);
    let stderrBytes = 0; handle.stderr.on('data', (chunk: Buffer) => { stderrBytes += chunk.length; });
    let exited = false;
    void handle.exited.finally(() => { exited = true; input.destroy(); }).catch(() => {});
    const result = { handle: { ...handle, stdin: input }, requests, responses, errors, stderr,
      id: spawn.args[2], get stderrBytes() { return stderrBytes; }, exited: () => exited };
    this.bridges.push(result);
    return result;
  }
  observeExport(handle: DockerHandle): void {
    const control = new SecretScanner(Buffer.from(topology.markers.EXPORT_MARKER));
    this.controls.push(control);
    const marker = new StreamSecretScanner(this.scanners, [control]);
    const tar = new MetafileFromTar();
    const errors: string[] = [];
    const started = performance.now();
    const observed = { marker, tar, errors, stderr: observeStderr(handle.stderr, this.scanners), bytes: 0, stderrBytes: 0, elapsedMs: 0 };
    handle.stderr.on('data', (chunk: Buffer) => { observed.stderrBytes += chunk.length; });
    void handle.exited.finally(() => { observed.elapsedMs = performance.now() - started; }).catch(() => {});
    handle.stdout.on('data', (chunk: Buffer) => {
      observed.bytes += chunk.length; marker.feed(chunk);
      try { if (!errors.length) tar.feed(chunk); } catch { errors.push('export-tar'); }
    });
    this.exports.push(observed);
  }
  get project(): string {
    const spawn = this.spawns.find((s) => s.args[0] === 'compose')!;
    return spawn.args[spawn.args.indexOf('-p') + 1];
  }
  get epoch(): string { return this.spawns.find((s) => s.env.TV_EVAL_EPOCH !== undefined)!.env.TV_EVAL_EPOCH; }
  async finish(): Promise<void> {
    this.handles.forEach((h) => h.kill());
    await Promise.allSettled(this.handles.map((h) => h.exited));
    this.secrets.forEach((secret) => secret.fill(0));
    this.secrets.length = 0;
    this.bridges.forEach((b) => b.stderr.destroy());
    this.exports.forEach((e) => { e.marker.destroy(); e.stderr.destroy(); });
    this.scanners.forEach((s) => s.destroy());
    this.bridges.forEach((b) => { b.responses.length = 0; });
    this.controls.forEach((c) => c.destroy());
  }
}

// Minimal streaming reader of one regular file in Docker's tar export. No extraction or path writes.
export class MetafileFromTar {
  #pending = Buffer.alloc(0);
  #remaining = 0;
  #padding = 0;
  #wanted = false;
  #parts: Buffer[] = [];
  text = '';
  feed(chunk: Buffer): void {
    this.#pending = Buffer.concat([this.#pending, chunk]);
    while (this.#pending.length) {
      if (this.#remaining) { this.#body(); continue; }
      if (this.#padding) {
        const count = Math.min(this.#padding, this.#pending.length);
        this.#padding -= count; this.#pending = this.#pending.subarray(count); continue;
      }
      if (this.#pending.length < 512) return;
      this.#header();
    }
  }
  #header(): void {
    const header = this.#pending.subarray(0, 512); this.#pending = this.#pending.subarray(512);
    const field = (start: number, end: number) => header.subarray(start, end).toString('utf8').split('\0')[0];
    const name = [field(345, 500), field(0, 100)].filter(Boolean).join('/').replace(/^\.\//, '');
    this.#remaining = Number.parseInt(field(124, 136).trim() || '0', 8);
    if (!Number.isSafeInteger(this.#remaining) || this.#remaining < 0) throw new Error('export-tar-size');
    this.#padding = (512 - this.#remaining % 512) % 512;
    this.#wanted = name === 'app/meta.json';
    if (this.#wanted && this.#remaining > 1024 * 1024) throw new Error('metafile-size');
  }
  #body(): void {
    const count = Math.min(this.#remaining, this.#pending.length);
    if (this.#wanted) this.#parts.push(Buffer.from(this.#pending.subarray(0, count)));
    this.#remaining -= count; this.#pending = this.#pending.subarray(count);
    if (!this.#remaining && this.#wanted) this.text = Buffer.concat(this.#parts).toString('utf8');
  }
}

export function checkStoppedSurfaces(e: IntegrationEvidence, expectedFixtures = 5): void {
  const logs = e.results.filter(({ spawn }) => commandKind(spawn) === 'logs');
  assert.equal(logs.length, expectedFixtures);
  for (const { result } of logs) {
    const text = result.stdout + result.stderr;
    const controls = [topology.markers.BOOT_MARKER, topology.markers.SHUTDOWN_MARKER].map((m) => new SecretScanner(Buffer.from(m)));
    try {
      const scan = scanSurface(text, e.scanners, controls);
      if (scan.exposed) throw new ComposedConstructionError('secret-exposed');
      assert.deepEqual(scan.controls, [true, true], 'stopped log controls absent');
    } finally { controls.forEach((c) => c.destroy()); }
    assert.equal(text.includes('control-second-connection'), false);
    // Exact runtime-produced Buffer encodings, independently passed through the real decoder.
    const encodedBoot = inspect(Buffer.from(topology.markers.BOOT_MARKER));
    const encodedStop = JSON.stringify(Buffer.from(topology.markers.SHUTDOWN_MARKER));
    assert.equal(text.includes(encodedBoot), true); assert.equal(text.includes(encodedStop), true);
    assertMarker(encodedBoot, topology.markers.BOOT_MARKER); assertMarker(encodedStop, topology.markers.SHUTDOWN_MARKER);
  }
  for (const bridge of e.bridges) {
    const stderr = bridge.stderr.snapshot();
    assertExecStderr(bridge, e.secrets);
    assert.deepEqual(bridge.stderr.result().controls, [true], 'exec stderr control absent'); assertMarker(stderr, topology.markers.BRIDGE_MARKER);
  }
  assert.equal(e.exports.length, expectedFixtures);
  for (const exported of e.exports) {
    if (exported.marker.result.exposed || exported.stderr.exposed()) throw new ComposedConstructionError('secret-exposed');
    if (exported.stderr.failed()) throw new ComposedConstructionError('scan-failed');
    assert.equal(exported.marker.result.controls[0], true, 'export marker absent');
    assert.deepEqual(exported.errors, [], 'export tar reader failed');
    const meta = JSON.parse(exported.tar.text);
    const inputs: string[] = Object.keys(meta.inputs);
    assert.deepEqual(inputs.sort(), [...FIXTURE_BUNDLE_INPUTS], 'fixture bundle inputs changed');
    assert.deepEqual(Object.keys(meta.outputs).map((p) => p.split('/').at(-1)).sort(), ['bridge.mjs', 'main.mjs']);
  }
}

export function assertExecStderr(bridge: Pick<ObservedBridge, 'stderr'>, secrets: readonly Buffer[]): void {
  assertClean(bridge.stderr.snapshot(), secrets);
  if (bridge.stderr.exposed()) throw new ComposedConstructionError('secret-exposed');
  if (bridge.stderr.failed()) throw new ComposedConstructionError('scan-failed');
}
export async function checkArtifacts(e: IntegrationEvidence, root: string): Promise<void> {
  const marker = new SecretScanner(Buffer.from(topology.markers.ARTIFACT_MARKER));
  try {
    const result = await scanArtifactsWithControls(root, e.scanners, [marker]);
    if (result.exposed) throw new ComposedConstructionError('secret-exposed');
    assert.deepEqual(result.controls, [true], 'artifact control absent');
    assertMarker(await readFile(join(root, 'composed-scan', 'close.marker')), topology.markers.ARTIFACT_MARKER);
  } finally { marker.destroy(); }
}
const ADMIN_OPS = ['register', 'receipt', 'capture', 'attest', 'key', 'finalize', 'ack'] as const;
export function adminCounts(logs: string): Record<typeof ADMIN_OPS[number], number> {
  const result = Object.fromEntries(ADMIN_OPS.map((op) => [op, 0])) as Record<typeof ADMIN_OPS[number], number>;
  for (const line of logs.split('\n')) {
    if (!line.startsWith('fixture-admin:')) continue;
    const op = line.slice('fixture-admin:'.length) as typeof ADMIN_OPS[number];
    assert.equal(ADMIN_OPS.includes(op), true, 'administration audit vocabulary');
    result[op] += 1;
  }
  return result;
}
export function assertProbeWindow(before: unknown, after: unknown): void {
  assert.deepEqual(after, before, 'hostile probe changed wire or underlying administration');
}

export const FIXTURE_BUNDLE_INPUTS = Object.freeze([
  '<define:TV_CONTAINER_TOPOLOGY>', 'testbed/completion.ts',
  'testbed/docker/container/bridge.ts', 'testbed/docker/container/capabilities.ts', 'testbed/docker/container/control.ts',
  'testbed/docker/container/fixture.ts', 'testbed/docker/container/main.ts', 'testbed/docker/container/stdoutTripwire.ts',
  'testbed/docker/container/topology.ts', 'testbed/docker/frames.ts', 'testbed/docker/handshake.ts',
  'testbed/docker/protocol.ts', 'testbed/docker/topology.mjs', 'testbed/fixtures/benign-login/server.ts',
  'testbed/fixtures/dom-hidden-injection/index.ts', 'testbed/fixtures/fake-reauth/index.ts',
  'testbed/fixtures/lookalike-origin/index.ts', 'testbed/fixtures/secret-echo/index.ts',
  'testbed/fixtures/shared/bindServer.ts', 'testbed/fixtures/shared/eventsDigest.ts',
  'testbed/fixtures/shared/loginFixture.ts', 'testbed/scenarios/benignLoginConstants.ts',
]);

// Terminal projection is separate from the early live/open wire oracle. The only admitted
// post-window control traffic is 31 register/key pairs per fixture, then one registry-cap refusal.
export type ProbeBaseline = { completed: number[]; frames: { requests: string[]; responses: string[] }[] };
export function checkTerminalProbe(e: IntegrationEvidence, beforeAdmin: ReturnType<typeof adminCounts>[],
  beforeWire: ProbeBaseline, completed: number[]): void {
  assert.equal(e.bridges.length, 5, 'terminal fixture inventory');
  assert.equal(beforeAdmin.length, 5); assert.equal(beforeWire.frames.length, 5);
  for (const [i, bridge] of e.bridges.entries()) {
    const logs = e.results.filter(({ spawn }) => commandKind(spawn) === 'logs' && spawn.args[1] === bridge.id);
    assert.equal(logs.length, 1, 'one actual stopped log per fixture');
    const observed = adminCounts(logs[0].result.stdout + logs[0].result.stderr);
    assert.deepEqual(observed, { ...beforeAdmin[i], register: beforeAdmin[i].register + 31, key: beforeAdmin[i].key + 31 },
      'final stopped administration changed');
    const ops = Array.from({ length: 31 }, () => ['register', 'key']).flat();
    if (i === 0) ops.push('register');
    const ids = ops.map((op, j) => `${beforeWire.completed[i] + j + 1}:${op}`);
    assert.deepEqual(bridge.requests, [...beforeWire.frames[i].requests, ...ids], 'terminal request ledger changed');
    assert.deepEqual(bridge.responses.slice(0, beforeWire.frames[i].responses.length).map((f) => `${f.id}:${f.kind}:${f.op}`),
      beforeWire.frames[i].responses, 'terminal response prefix changed');
    const responses = bridge.responses.slice(beforeWire.frames[i].responses.length).map((f) =>
      `${f.id}:${f.op}:${f.kind === 'res' ? f.ok ? 'ok' : f.code : 'request'}`);
    assert.deepEqual(responses, ids.map((id, j) => `${id}:${i === 0 && j === 62 ? 'control-limit' : 'ok'}`),
      'terminal response ledger changed');
    assert.deepEqual(bridge.errors, [], 'terminal decoder errors');
  }
  assert.deepEqual(completed, beforeWire.completed.map((n) => n + 62), 'terminal completed request ledger changed');
}
