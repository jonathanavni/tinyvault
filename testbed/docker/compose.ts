// Creation/inspect checks are code-enforced hygiene for a trusted boundary. The MAC binds possession
// after provenance checks; fixture-process compromise invalidates the run. Docker liveness is not preflight proof.
// Daemon-level ps-project checks pre-up absence and classifies nonzero up: empty means container-create,
// existing containers mean container-unhealthy. Both are terminal Acceptance A reds; query failure is
// container-create with the query's closed code in teardownCode. Malformed ids mean resolution-shape.
// Positive controls: history, logs (boot + shutdown on stderr), export, exec stderr, and artifacts.
// Each control shares its surface's secret-scanning pass and result; streams have one scan consumer.
// E scans: spawn args/env, command output (including ps-project), history, logs, export, exec stderr, and artifacts.
import { createHash, randomBytes, type KeyObject } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BridgeSession, type BridgeClock } from './bridge';
import { BridgeError, FIXTURE_IDS, type FixtureId } from './protocol';
import { assertPinned, type PinnedDockerEndpoint } from './preflight';
import { bounded, buildDockerSpawn, containerId, ComposedConstructionError, createDockerProcessRunner,
  COMMAND_TIMEOUT_MS, KILL_TIMEOUT_MS, ID_PATTERN, IMAGE_ID_PATTERN, runDockerCommand, systemClock,
  type ContainerId, type ConstructionCode, type DockerCommand, type DockerHandle, type DockerProcessRunner,
  type DockerResult, type DockerSpawn, type ProcessHandle } from './exec';
import { observeStderr, scanArtifactsWithControls, scanSpawns, scanStreamWithControls, scanSurface,
  SecretScanner, type ScanResult } from './secretScan';
import { validateTopology } from './topology.mjs';
const topology = validateTopology(JSON.parse(readFileSync(new URL('./topology.json', import.meta.url), 'utf8')));
export { ComposedConstructionError, COMPOSE_FILE, IMAGE_NAME, WAIT_TIMEOUT_SECONDS, STOP_TIMEOUT_SECONDS } from './exec';
export const PORTS = {
  'benign-login': topology.services['benign-login'].map((p) => p.host),
  'lookalike-origin': topology.services['lookalike-origin'].map((p) => p.host),
  'dom-hidden-injection': topology.services['dom-hidden-injection'].map((p) => p.host),
} as const;
export const CREATED_TOLERANCE_MS = 60_000;
export const { ARTIFACT_MARKER, HISTORY_MARKER } = topology.markers;
export type ProbeOrigin = (origin: string) => Promise<boolean>;
export type ComposeClock = BridgeClock & { now(): number };
type Doc = Record<string, any>;
type Identity = { project: string; epoch: string; epochMs: number };
type Expected = Identity & { service: FixtureId; id: string; image: Doc };
const empty = (v: unknown) => v === null || (Array.isArray(v) && v.length === 0);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const envKeys = (v: unknown): string[] | undefined => Array.isArray(v)
  && v.every((s) => typeof s === 'string' && s.includes('=')) ? v.map((s: string) => s.slice(0, s.indexOf('='))) : undefined;
function validEnv(doc: Doc, expected: Expected): boolean {
  const inherited = envKeys(expected.image.Config?.Env) ?? [];
  const allowed = ['TV_FIXTURE_ID', 'TV_EVAL_EPOCH', 'TV_PUBLIC_ORIGIN', 'TV_LOOKALIKE_PUBLIC_ORIGIN',
    ...inherited.filter((key) => ['PATH', 'NODE_VERSION', 'YARN_VERSION'].includes(key))];
  return envKeys(doc.Config?.Env)?.every((key) => allowed.includes(key)) === true;
}
function validPorts(doc: Doc, expected: Expected): boolean {
  const ports = doc.NetworkSettings?.Ports;
  const values = topology.services[expected.service];
  return !!ports && Object.keys(ports).length === values.length && values.every((port) =>
    Array.isArray(ports[`${port.container}/tcp`]) && ports[`${port.container}/tcp`].length === 1
    && ports[`${port.container}/tcp`][0]?.HostIp === port.address
    && ports[`${port.container}/tcp`][0]?.HostPort === String(port.host)
    && Object.keys(ports[`${port.container}/tcp`][0]).length === 2);
}
const INSPECT_RULES: readonly [string, ConstructionCode, (d: Doc, e: Expected) => boolean][] = [
  ['.State.Running', 'not-running', (d) => d.State?.Running === true],
  ['.State.Health.Status', 'not-healthy', (d) => d.State?.Health?.Status === 'healthy'],
  ['.Image', 'image-mismatch', (d, e) => IMAGE_ID_PATTERN.test(d.Image) && d.Image === e.image.Id],
  ['.Created', 'created-before-epoch', (d, e) => typeof d.Created === 'string' && Date.parse(d.Created) >= e.epochMs - CREATED_TOLERANCE_MS],
  [".Config.Labels['com.tinyvault.fixture']", 'label-fixture', (d, e) => d.Config?.Labels?.['com.tinyvault.fixture'] === e.service],
  [".Config.Labels['com.tinyvault.epoch']", 'label-epoch', (d, e) => d.Config?.Labels?.['com.tinyvault.epoch'] === e.epoch],
  [".Config.Labels['com.docker.compose.project']", 'label-compose-project', (d, e) => d.Config?.Labels?.['com.docker.compose.project'] === e.project],
  [".Config.Labels['com.docker.compose.service']", 'label-compose-service', (d, e) => d.Config?.Labels?.['com.docker.compose.service'] === e.service],
  ['.Config.Hostname', 'hostname-mismatch', (d, e) => /^[0-9a-f]{12}$/.test(d.Config?.Hostname) && e.id.startsWith(d.Config.Hostname)],
  ['.Config.User', 'user-mismatch', (d) => d.Config?.User === 'node'],
  ['.Config.Env', 'env-unexpected', validEnv],
  ['.Config.Cmd,.Config.Entrypoint', 'command-overridden', (d, e) => same(d.Config?.Cmd ?? null, e.image.Config.Cmd ?? null) && same(d.Config?.Entrypoint ?? null, e.image.Config.Entrypoint ?? null)],
  ['.HostConfig.NetworkMode', 'network-mode', (d, e) => d.HostConfig?.NetworkMode === `${e.project}_default`],
  ['.HostConfig.Privileged', 'privileged', (d) => d.HostConfig?.Privileged === false],
  ['.HostConfig.PidMode,.HostConfig.IpcMode', 'namespace-shared', (d) => d.HostConfig?.PidMode === '' && ['', 'private'].includes(d.HostConfig?.IpcMode)],
  ['.HostConfig.CapAdd', 'capability-added', (d) => empty(d.HostConfig?.CapAdd)],
  ['.HostConfig.Devices', 'device-added', (d) => empty(d.HostConfig?.Devices)],
  ['.HostConfig.Binds', 'bind-present', (d) => empty(d.HostConfig?.Binds)],
  ['.Mounts', 'mount-present', (d) => Array.isArray(d.Mounts) && d.Mounts.length === 0],
  ['.NetworkSettings.Networks', 'network-membership', (d, e) => !!d.NetworkSettings?.Networks && same(Object.keys(d.NetworkSettings.Networks), [`${e.project}_default`])],
  ['.NetworkSettings.Ports', 'port-mismatch', validPorts],
];
export const INSPECT_FIELDS = Object.freeze(INSPECT_RULES.map(([field]) => field));
export function inspectDocument(stdout: string, code: ConstructionCode = 'inspect-shape'): Doc {
  try {
    const value: unknown = JSON.parse(stdout);
    if (Array.isArray(value) && value.length === 1 && value[0] && typeof value[0] === 'object'
      && !Array.isArray(value[0])) return value[0];
  } catch { /* Daemon text never enters error messages. */ }
  throw new ComposedConstructionError(code);
}
export function verifyInspect(doc: Doc, expected: Expected): void {
  for (const [, code, predicate] of INSPECT_RULES) {
    if (!predicate(doc, expected)) throw new ComposedConstructionError(code);
  }
}
export class HandleRegistry {
  readonly #handles = new Map<ProcessHandle, boolean>();
  readonly sessions: BridgeSession[] = [];
  register(handle: ProcessHandle): void { if (!this.#handles.has(handle)) this.#handles.set(handle, false); }
  kill(handle: ProcessHandle): void {
    if (this.#handles.get(handle)) return;
    this.#handles.set(handle, true);
    try { handle.kill(); } catch { /* Still wait and continue cleanup of all handles. */ }
  }
  async close(clock: BridgeClock): Promise<void> {
    for (const session of this.sessions) session.close();
    for (const handle of this.#handles.keys()) this.kill(handle);
    await bounded(Promise.allSettled([...this.#handles.keys()].map((h) => h.exited)), KILL_TIMEOUT_MS, clock,
      new ComposedConstructionError('handle-timeout'));
  }
}
export type ScanDependencies = {
  spawns: typeof scanSpawns; artifacts: typeof scanArtifactsWithControls; stream: typeof scanStreamWithControls;
  surface: typeof scanSurface; stderr: typeof observeStderr;
};
export type ProjectOptions = {
  pin: PinnedDockerEndpoint; runner?: DockerProcessRunner; clock?: ComposeClock;
  probeOrigin: ProbeOrigin; artifactRoot: string; diagnostics?: (code: ConstructionCode) => void;
  scanners?: Partial<ScanDependencies>;
};
type Context = Identity & {
  pin: PinnedDockerEndpoint; runner: DockerProcessRunner; clock: ComposeClock; registry: HandleRegistry;
  spawns: DockerSpawn[]; surfaces: string[]; secrets: SecretScanner[]; ids: ContainerId[];
  stderr: { scan: ReturnType<typeof observeStderr>; marker: SecretScanner }[];
  options: ProjectOptions;
  imageId?: string;
};
async function run(ctx: Context, command: DockerCommand, code: ConstructionCode): Promise<DockerResult> {
  ctx.spawns.push(buildDockerSpawn(ctx.pin, command));
  try {
    const result = await runDockerCommand(ctx.pin, command, ctx.runner, ctx.clock);
    ctx.surfaces.push(result.stdout, result.stderr);
    if (result.exitCode !== 0) throw new ComposedConstructionError(code);
    return result;
  } catch (error) {
    if (error instanceof ComposedConstructionError) throw error;
    throw new ComposedConstructionError('daemon-unreachable');
  }
}
function composeCommand(ctx: Identity, kind: 'ps-project' | 'compose-build' | 'compose-up' | 'compose-stop' | 'compose-down'): DockerCommand {
  return { kind, project: ctx.project, epoch: ctx.epoch };
}
// Security findings outrank operational failures; preserve the first within each rank.
export function preferConstructionCode(first: ConstructionCode | undefined, next: ConstructionCode): ConstructionCode {
  const rank = (code: ConstructionCode) => code === 'secret-exposed' ? 2 : code === 'scan-control-missing' ? 1 : 0;
  return first === undefined || rank(next) > rank(first) ? next : first;
}
function scanFailure(first: ComposedConstructionError | undefined, error: unknown, code: ConstructionCode): ComposedConstructionError {
  const next = error instanceof ComposedConstructionError ? error : new ComposedConstructionError(code);
  return first && preferConstructionCode(first.code, next.code) === first.code ? first : next;
}
function checkScan(result: ScanResult, surface: ComposedConstructionError['surface'], count = 1,
  command?: DockerCommand['kind']): void {
  if (result.exposed) throw new ComposedConstructionError('secret-exposed', command, undefined, surface);
  if (result.controls.length !== count || result.controls.some((hit) => hit !== true)) {
    throw new ComposedConstructionError('scan-control-missing', command, undefined, surface);
  }
}
export class ProjectCloser {
  #closing?: Promise<void>;
  constructor(readonly ctx: Context) {}
  close(): Promise<void> { return this.#closing ??= Promise.resolve().then(() => this.#close()); }
  async #close(): Promise<void> {
    const ctx = this.ctx;
    let failure: ComposedConstructionError | undefined;
    const attempt = async (work: () => Promise<unknown>, code: ConstructionCode) => {
      // Each operation owns its bound. Racing this whole sequence could let scans spawn after down.
      try { await work(); }
      catch (error) { failure = scanFailure(failure, error, code); }
    };
    await attempt(() => ctx.registry.close(ctx.clock), 'handle-timeout');
    await attempt(() => run(ctx, composeCommand(ctx, 'compose-stop'), 'compose-stop'), 'compose-stop');
    await attempt(() => this.#scan(), 'scan-failed');
    await attempt(() => run(ctx, composeCommand(ctx, 'compose-down'), 'compose-down'), 'compose-down');
    await attempt(() => this.#artifacts(true), 'scan-failed');
    await attempt(async () => this.#scanDescriptions(), 'scan-failed');
    for (const h of ctx.stderr) { h.scan.destroy(); h.marker.destroy(); }
    for (const secret of ctx.secrets) secret.destroy();
    if (failure) throw failure;
  }
  async #artifacts(marker = false): Promise<void> {
    const ctx = this.ctx;
    const root = ctx.options.artifactRoot;
    await mkdir(join(root, 'composed-scan'), { recursive: true });
    if (marker) await writeFile(join(root, 'composed-scan', 'close.marker'), ARTIFACT_MARKER);
    const scan = ctx.options.scanners?.artifacts ?? scanArtifactsWithControls;
    const controls = marker ? [new SecretScanner(Buffer.from(ARTIFACT_MARKER))] : [];
    try {
      const result = await bounded(scan(root, ctx.secrets, controls), COMMAND_TIMEOUT_MS,
        ctx.clock, new ComposedConstructionError('scan-failed'));
      checkScan(result, 'artifacts', controls.length);
    } finally { controls.forEach((control) => control.destroy()); }
  }
  async #scan(): Promise<void> {
    const ctx = this.ctx;
    let failure: ComposedConstructionError | undefined;
    const attempt = async (work: () => unknown) => {
      try { await work(); } catch (error) { failure = scanFailure(failure, error, 'scan-failed'); }
    };
    if (ctx.imageId) await attempt(() => this.#history(ctx.imageId!));
    for (const id of ctx.ids) {
      await attempt(() => run(ctx, { kind: 'inspect', id }, 'scan-failed'));
      await attempt(() => this.#logs(id));
      await attempt(() => this.#export(id));
    }
    await attempt(() => this.#scanDescriptions());
    for (const stderr of ctx.stderr) await attempt(() => {
      checkScan(stderr.scan.result(), 'exec-stderr', 1, 'exec-bridge');
      if (stderr.scan.failed()) throw new ComposedConstructionError('scan-failed');
    });
    await attempt(() => this.#artifacts());
    if (failure) throw failure;
  }
  async #logs(id: ContainerId): Promise<void> {
    const { stdout, stderr } = await run(this.ctx, { kind: 'logs', id }, 'scan-failed');
    const scan = this.ctx.options.scanners?.surface ?? scanSurface;
    const controls = [topology.markers.BOOT_MARKER, topology.markers.SHUTDOWN_MARKER]
      .map((marker) => new SecretScanner(Buffer.from(marker)));
    try {
      const result = scan(stderr, this.ctx.secrets, controls);
      result.exposed = scan(stdout, this.ctx.secrets).exposed || result.exposed;
      checkScan(result, 'logs', controls.length, 'logs');
    } finally { controls.forEach((control) => control.destroy()); }
  }
  async #history(id: string): Promise<void> {
    const { stdout, stderr } = await run(this.ctx, { kind: 'image-history', id }, 'scan-failed');
    const control = new SecretScanner(Buffer.from(HISTORY_MARKER));
    const scan = this.ctx.options.scanners?.surface ?? scanSurface;
    const result: ScanResult = { exposed: scan(stderr, this.ctx.secrets).exposed, controls: [false] };
    try {
      // Runner output is byte-preserving latin1; JSON text itself is strict UTF-8.
      const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(stdout, 'latin1'));
      const lines = text === '' ? [] : text.replace(/\n$/, '').split('\n');
      for (const line of lines) {
        const doc: unknown = JSON.parse(line);
        if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('history-parse');
        const pending: unknown[] = Object.values(doc);
        while (pending.length) {
          const value = pending.pop();
          if (typeof value === 'string') {
            const match = scan(value, this.ctx.secrets, [control]);
            result.exposed ||= match.exposed;
            result.controls[0] ||= match.controls[0];
          } else if (value && typeof value === 'object') pending.push(...Object.values(value));
        }
      }
    } catch { throw new ComposedConstructionError('history-parse', 'image-history', undefined, 'history'); }
    finally { control.destroy(); }
    checkScan(result, 'history', 1, 'image-history');
  }
  async #export(id: ContainerId): Promise<void> {
    const ctx = this.ctx;
    const description = buildDockerSpawn(ctx.pin, { kind: 'export', id });
    ctx.spawns.push(description);
    const handle = ctx.runner.spawnLongLived(description);
    ctx.registry.register(handle);
    const stderr = observeStderr(handle.stderr, ctx.secrets);
    const marker = new SecretScanner(Buffer.from(topology.markers.EXPORT_MARKER));
    try {
      handle.stdin.end();
      const [result, exit] = await bounded(Promise.all([
        (ctx.options.scanners?.stream ?? scanStreamWithControls)(handle.stdout, ctx.secrets, [marker]), handle.exited,
      ]), COMMAND_TIMEOUT_MS, ctx.clock, new ComposedConstructionError('command-timeout', 'export'));
      if (result.exposed || stderr.exposed()) throw new ComposedConstructionError('secret-exposed');
      if (exit !== 0 || stderr.failed()) throw new ComposedConstructionError('scan-failed');
      checkScan(result, 'export', 1, 'export');
    } finally {
      ctx.registry.kill(handle); handle.stdout.destroy(); handle.stderr.destroy(); stderr.destroy();
      marker.destroy();
    }
  }
  #scanDescriptions(): void {
    const ctx = this.ctx;
    if (ctx.secrets.some((secret) => (ctx.options.scanners?.spawns ?? scanSpawns)(ctx.spawns, secret)
      || ctx.surfaces.some((surface) => secret.scan(surface)))) throw new ComposedConstructionError('secret-exposed');
  }
}
export type ComposedPeer = { fixtureId: FixtureId; epoch: string; origin: string; publicKey: KeyObject;
  bridge: BridgeSession; registerSecret(secret: Uint8Array): void };
export type ComposedProject = { peers: ComposedPeer[]; closer: ProjectCloser; project: string; epoch: string };
function context(options: ProjectOptions): Context {
  const clock = options.clock ?? systemClock;
  const epochMs = clock.now();
  const epoch = `${epochMs}-${randomBytes(16).toString('hex')}`;
  const project = `tinyvault-${createHash('sha256').update(epoch).digest('hex').slice(0, 32)}`;
  const registry = new HandleRegistry();
  return { ...options, options, clock, epochMs, epoch, project, registry,
    runner: options.runner ?? createDockerProcessRunner(registry),
    spawns: [], surfaces: [], secrets: [], ids: [], stderr: [] };
}
async function build(ctx: Context): Promise<Doc> {
  await run(ctx, composeCommand(ctx, 'compose-build'), 'image-build');
  const result = await run(ctx, { kind: 'image-inspect' }, 'image-inspect');
  const image = inspectDocument(result.stdout, 'image-inspect');
  if (typeof image.Id !== 'string' || IMAGE_ID_PATTERN.exec(image.Id)?.[0] !== image.Id || !image.Config
    // Docker omits Config.Cmd (or Entrypoint) entirely when the image does not set it; absent means null.
    || !(Object.hasOwn(image.Config, 'Cmd') || Object.hasOwn(image.Config, 'Entrypoint'))
    || !envKeys(image.Config.Env) || !Object.hasOwn(image.Config, 'Labels')) throw new ComposedConstructionError('image-inspect');
  ctx.imageId = image.Id;
  await up(ctx);
  return image;
}
async function up(ctx: Context): Promise<void> {
  try { await run(ctx, composeCommand(ctx, 'compose-up'), 'container-create'); }
  catch (error) {
    if (!(error instanceof ComposedConstructionError) || error.code !== 'container-create') throw error;
    let remaining: DockerResult;
    try { remaining = await run(ctx, composeCommand(ctx, 'ps-project'), 'daemon-unreachable'); }
    catch (queryError) {
      error.teardownCode = queryError instanceof ComposedConstructionError ? queryError.code : 'daemon-unreachable';
      throw error;
    }
    validateProjectIds(remaining.stdout);
    throw new ComposedConstructionError(remaining.stdout === '' ? 'container-create' : 'container-unhealthy');
  }
}
function validateProjectIds(stdout: string): void {
  if (stdout.split('\n').some((line) => line !== '' && /^(?:[0-9a-f]{12}|[0-9a-f]{64})$/.exec(line)?.[0] !== line)) {
    throw new ComposedConstructionError('resolution-shape');
  }
}
async function resolveContainer(ctx: Context, service: FixtureId, image: Doc): Promise<ContainerId> {
  const result = await run(ctx, { kind: 'compose-ps', project: ctx.project, epoch: ctx.epoch, service }, 'resolution-count');
  const lines = result.stdout.replace(/\n$/, '').split('\n');
  if (result.stdout === '' || lines.length !== 1) throw new ComposedConstructionError('resolution-count');
  const id = lines[0];
  if (!ID_PATTERN.test(id)) throw new ComposedConstructionError('resolution-shape');
  const resolved = containerId(id);
  ctx.ids.push(resolved);
  const inspected = await run(ctx, { kind: 'inspect', id: resolved }, 'inspect-shape');
  verifyInspect(inspectDocument(inspected.stdout), { ...ctx, service, id, image });
  return resolved;
}
function handshakeError(error: unknown): ComposedConstructionError {
  if (!(error instanceof BridgeError)) return new ComposedConstructionError('handshake-rejected');
  if (error.code === 'mac-invalid') return new ComposedConstructionError('mac-invalid');
  if (error.code === 'bridge-closed') return new ComposedConstructionError('bridge-closed');
  if (['protocol-order', 'hello-mismatch', 'hostname-mismatch'].includes(error.code)) return new ComposedConstructionError('handshake-rejected');
  return new ComposedConstructionError('bridge-protocol');
}
async function openPeer(ctx: Context, fixtureId: FixtureId, id: ContainerId): Promise<ComposedPeer> {
  let handle: DockerHandle;
  try {
    const spawn = buildDockerSpawn(ctx.pin, { kind: 'exec-bridge', id });
    ctx.spawns.push(spawn); handle = ctx.runner.spawnLongLived(spawn); ctx.registry.register(handle);
  } catch { throw new ComposedConstructionError('exec-spawn'); }
  const secret = randomBytes(32);
  ctx.secrets.push(new SecretScanner(secret));
  const marker = new SecretScanner(Buffer.from(topology.markers.BRIDGE_MARKER));
  ctx.stderr.push({ scan: (ctx.options.scanners?.stderr ?? observeStderr)(handle.stderr, ctx.secrets, 65536, [marker]), marker });
  const bridge = new BridgeSession(handle, { kill: () => ctx.registry.kill(handle), clock: ctx.clock });
  ctx.registry.sessions.push(bridge);
  let exited = false;
  void handle.exited.then(() => { exited = true; bridge.close(); }, () => { exited = true; bridge.close(); });
  await Promise.resolve();
  if (exited) { secret.fill(0); throw new ComposedConstructionError('exec-spawn'); }
  let publicKey: KeyObject;
  try {
    await bridge.sendBootstrap(secret);
    publicKey = await bridge.hello({ challenge: randomBytes(32).toString('base64url'), epoch: ctx.epoch, fixtureId, containerId: id });
  } catch (error) { secret.fill(0); throw handshakeError(error); }
  const origin = `http://127.0.0.1:${PORTS[fixtureId][0]}`;
  try {
    if (!await bounded(ctx.options.probeOrigin(origin), 5000, ctx.clock, new ComposedConstructionError('origin-unreachable'))) {
      throw new ComposedConstructionError('origin-unreachable');
    }
  } catch { throw new ComposedConstructionError('origin-unreachable'); }
  if (bridge.closed) throw new ComposedConstructionError('bridge-closed');
  return { fixtureId, epoch: ctx.epoch, origin, publicKey, bridge,
    registerSecret: (token) => { ctx.secrets.push(new SecretScanner(token)); } };
}
export async function createComposedProject(options: ProjectOptions): Promise<ComposedProject> {
  assertPinned(options.pin);
  const ctx = context(options);
  // Failed absence checks must never stop/down a project that is not proven ours (including B5a).
  const absent = await run(ctx, composeCommand(ctx, 'ps-project'), 'daemon-unreachable');
  validateProjectIds(absent.stdout);
  if (absent.stdout !== '') throw new ComposedConstructionError('project-not-fresh', undefined, ctx.project);
  const closer = new ProjectCloser(ctx);
  try {
    const image = await build(ctx);
    const peers: ComposedPeer[] = [];
    for (const service of FIXTURE_IDS) peers.push(await openPeer(ctx, service, await resolveContainer(ctx, service, image)));
    if (peers.some((peer) => peer.bridge.closed)) throw new ComposedConstructionError('bridge-closed');
    return { peers, closer, project: ctx.project, epoch: ctx.epoch };
  } catch (error) {
    const cause = error instanceof ComposedConstructionError ? error : new ComposedConstructionError('container-create');
    try { await closer.close(); }
    catch (teardown) { cause.teardownCode = preferConstructionCode(cause.teardownCode,
      teardown instanceof ComposedConstructionError ? teardown.code : 'compose-down'); }
    try { options.diagnostics?.(cause.code); } catch { /* Preserve original cause. */ }
    throw cause;
  }
}
