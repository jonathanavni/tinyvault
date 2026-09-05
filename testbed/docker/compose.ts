// Creation/inspect checks are code-enforced hygiene for a trusted boundary. The MAC binds possession
// after provenance checks; fixture-process compromise invalidates the run. Docker liveness is not preflight proof.
// Nonzero up is classified by a post-hoc ps query, never Compose text: empty means container-create,
// existing containers mean container-unhealthy. Both are terminal Acceptance A reds; query failure is
// container-create with the query's closed code in teardownCode.
import { createHash, randomBytes, type KeyObject } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BridgeSession, type BridgeClock } from './bridge';
import { BridgeError, FIXTURE_IDS, type FixtureId } from './protocol';
import { assertPinned, type PinnedDockerEndpoint } from './preflight';
import { bounded, buildDockerSpawn, containerId, ComposedConstructionError, createDockerProcessRunner,
  COMMAND_TIMEOUT_MS, KILL_TIMEOUT_MS, ID_PATTERN, IMAGE_ID_PATTERN, runDockerCommand, systemClock,
  type ContainerId, type ConstructionCode, type DockerCommand, type DockerHandle, type DockerProcessRunner,
  type DockerResult, type DockerSpawn, type ProcessHandle } from './exec';
import { observeStderr, scanArtifactTree, scanSpawns, scanStream, SecretScanner } from './secretScan';
export { ComposedConstructionError, COMPOSE_FILE, WAIT_TIMEOUT_SECONDS, STOP_TIMEOUT_SECONDS } from './exec';
export const PORTS = { 'benign-login': [47110], 'lookalike-origin': [47120, 47121], 'dom-hidden-injection': [47130] } as const;
export const CREATED_TOLERANCE_MS = 60_000;
export const ARTIFACT_MARKER = 'tinyvault-artifact-scan-close-v1';
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
  const values = PORTS[expected.service];
  return !!ports && Object.keys(ports).length === values.length && values.every((port, index) =>
    Array.isArray(ports[`${8080 + index}/tcp`]) && ports[`${8080 + index}/tcp`].length === 1
    && ports[`${8080 + index}/tcp`][0]?.HostIp === '127.0.0.1'
    && ports[`${8080 + index}/tcp`][0]?.HostPort === String(port)
    && Object.keys(ports[`${8080 + index}/tcp`][0]).length === 2);
}
const INSPECT_RULES: readonly [string, ConstructionCode, (d: Doc, e: Expected) => boolean][] = [
  ['.State.Running', 'not-running', (d) => d.State?.Running === true],
  ['.State.Health.Status', 'not-healthy', (d) => d.State?.Health?.Status === 'healthy'],
  ['.Image', 'image-mismatch', (d, e) => IMAGE_ID_PATTERN.test(d.Image) && d.Image === e.image.Id],
  ['.Created', 'created-before-epoch', (d, e) => typeof d.Created === 'string' && Date.parse(d.Created) >= e.epochMs - CREATED_TOLERANCE_MS],
  [".Config.Labels['com.tinyvault.fixture']", 'label-fixture', (d, e) => d.Config?.Labels?.['com.tinyvault.fixture'] === e.service],
  [".Config.Labels['com.tinyvault.epoch']", 'label-epoch', (d, e) => d.Config?.Labels?.['com.tinyvault.epoch'] === e.epoch],
  [".Config.Labels['com.tinyvault.project']", 'label-project', (d, e) => d.Config?.Labels?.['com.tinyvault.project'] === e.project],
  [".Config.Labels['com.docker.compose.project']", 'label-compose-project', (d, e) => d.Config?.Labels?.['com.docker.compose.project'] === e.project],
  [".Config.Labels['com.docker.compose.service']", 'label-compose-service', (d, e) => d.Config?.Labels?.['com.docker.compose.service'] === e.service],
  ['.Config.Hostname', 'hostname-mismatch', (d, e) => /^[0-9a-f]{12}$/.test(d.Config?.Hostname) && e.id.startsWith(d.Config.Hostname)],
  ['.Config.User', 'user-mismatch', (d) => d.Config?.User === 'node'],
  ['.Config.Env', 'env-unexpected', validEnv],
  ['.Config.Cmd,.Config.Entrypoint', 'command-overridden', (d, e) => same(d.Config?.Cmd, e.image.Config.Cmd) && same(d.Config?.Entrypoint, e.image.Config.Entrypoint)],
  ['.HostConfig.NetworkMode', 'network-mode', (d, e) => d.HostConfig?.NetworkMode === `${e.project}_default`],
  ['.HostConfig.Privileged', 'privileged', (d) => d.HostConfig?.Privileged === false],
  ['.HostConfig.PidMode,.HostConfig.IpcMode', 'namespace-shared', (d) => d.HostConfig?.PidMode === '' && d.HostConfig?.IpcMode === ''],
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
  spawns: typeof scanSpawns; artifacts: typeof scanArtifactTree; stream: typeof scanStream;
};
export type ProjectOptions = {
  pin: PinnedDockerEndpoint; runner?: DockerProcessRunner; clock?: ComposeClock;
  probeOrigin: ProbeOrigin; artifactRoot: string; diagnostics?: (code: ConstructionCode) => void;
  scanners?: Partial<ScanDependencies>;
};
type Context = Identity & {
  pin: PinnedDockerEndpoint; runner: DockerProcessRunner; clock: ComposeClock; registry: HandleRegistry;
  spawns: DockerSpawn[]; surfaces: string[]; secrets: SecretScanner[]; ids: ContainerId[];
  stderr: ReturnType<typeof observeStderr>[]; options: ProjectOptions;
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
function composeCommand(ctx: Identity, kind: 'compose-ps-all' | 'compose-build' | 'compose-up' | 'compose-stop' | 'compose-down'): DockerCommand {
  return { kind, project: ctx.project, epoch: ctx.epoch };
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
      catch (error) { failure ??= error instanceof ComposedConstructionError ? error : new ComposedConstructionError(code); }
    };
    await attempt(() => ctx.registry.close(ctx.clock), 'handle-timeout');
    await attempt(() => run(ctx, composeCommand(ctx, 'compose-stop'), 'compose-stop'), 'compose-stop');
    await attempt(() => this.#scan(), 'scan-failed');
    await attempt(() => run(ctx, composeCommand(ctx, 'compose-down'), 'compose-down'), 'compose-down');
    await attempt(() => this.#artifacts(true), 'scan-failed');
    await attempt(async () => this.#scanDescriptions(), 'scan-failed');
    for (const h of ctx.stderr) h.destroy();
    for (const secret of ctx.secrets) secret.destroy();
    if (failure) throw failure;
  }
  async #artifacts(marker = false): Promise<void> {
    const ctx = this.ctx;
    const root = ctx.options.artifactRoot;
    await mkdir(join(root, 'composed-scan'), { recursive: true });
    if (marker) await writeFile(join(root, 'composed-scan', 'close.marker'), ARTIFACT_MARKER);
    const scan = ctx.options.scanners?.artifacts ?? scanArtifactTree;
    const check = (secrets: SecretScanner[]) => bounded(scan(root, secrets), COMMAND_TIMEOUT_MS,
      ctx.clock, new ComposedConstructionError('scan-failed'));
    if (await check(ctx.secrets)) throw new ComposedConstructionError('secret-exposed');
    if (marker) {
      const control = new SecretScanner(Buffer.from(ARTIFACT_MARKER));
      try { if (!await check([control])) throw new ComposedConstructionError('scan-failed'); }
      finally { control.destroy(); }
    }
  }
  async #scan(): Promise<void> {
    const ctx = this.ctx;
    let failure: unknown;
    const attempt = async (work: () => unknown) => {
      try { await work(); } catch (error) { failure ??= error; }
    };
    // The locked §7 vocabulary omits history; its §11 E scan needs continuity-owner adjudication.
    for (const id of ctx.ids) {
      await attempt(() => run(ctx, { kind: 'logs', id }, 'scan-failed'));
      await attempt(() => this.#export(id));
    }
    await attempt(() => this.#scanDescriptions());
    if (ctx.stderr.some((s) => s.failed())) failure ??= new ComposedConstructionError('scan-failed');
    if (ctx.stderr.some((s) => s.exposed())) failure ??= new ComposedConstructionError('secret-exposed');
    await attempt(() => this.#artifacts());
    if (failure) throw failure;
  }
  async #export(id: ContainerId): Promise<void> {
    const ctx = this.ctx;
    const description = buildDockerSpawn(ctx.pin, { kind: 'export', id });
    ctx.spawns.push(description);
    const handle = ctx.runner.spawnLongLived(description);
    ctx.registry.register(handle);
    const stderr = observeStderr(handle.stderr, ctx.secrets);
    try {
      handle.stdin.end();
      const [exposed, exit] = await bounded(Promise.all([
        (ctx.options.scanners?.stream ?? scanStream)(handle.stdout, ctx.secrets), handle.exited,
      ]), COMMAND_TIMEOUT_MS, ctx.clock, new ComposedConstructionError('command-timeout', 'export'));
      if (exposed || stderr.exposed()) throw new ComposedConstructionError('secret-exposed');
      if (exit !== 0 || stderr.failed()) throw new ComposedConstructionError('scan-failed');
    } finally {
      ctx.registry.kill(handle); handle.stdout.destroy(); handle.stderr.destroy(); stderr.destroy();
    }
  }
  #scanDescriptions(): void {
    const ctx = this.ctx;
    if (ctx.secrets.some((secret) => (ctx.options.scanners?.spawns ?? scanSpawns)(ctx.spawns, secret)
      || ctx.surfaces.some((surface) => secret.scan(surface)))) throw new ComposedConstructionError('secret-exposed');
  }
}
export type ComposedPeer = { fixtureId: FixtureId; origin: string; publicKey: KeyObject; bridge: BridgeSession };
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
    || !Object.hasOwn(image.Config, 'Cmd') || !Object.hasOwn(image.Config, 'Entrypoint')
    || !envKeys(image.Config.Env) || !Object.hasOwn(image.Config, 'Labels')) throw new ComposedConstructionError('image-inspect');
  await up(ctx);
  return image;
}
async function up(ctx: Context): Promise<void> {
  try { await run(ctx, composeCommand(ctx, 'compose-up'), 'container-create'); }
  catch (error) {
    if (!(error instanceof ComposedConstructionError) || error.code !== 'container-create') throw error;
    let remaining: DockerResult;
    try { remaining = await run(ctx, composeCommand(ctx, 'compose-ps-all'), 'daemon-unreachable'); }
    catch (queryError) {
      error.teardownCode = queryError instanceof ComposedConstructionError ? queryError.code : 'daemon-unreachable';
      throw error;
    }
    throw new ComposedConstructionError(remaining.stdout === '' ? 'container-create' : 'container-unhealthy');
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
  ctx.stderr.push(observeStderr(handle.stderr, ctx.secrets));
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
  return { fixtureId, origin, publicKey, bridge };
}
export async function createComposedProject(options: ProjectOptions): Promise<ComposedProject> {
  assertPinned(options.pin);
  const ctx = context(options);
  // Failed absence checks must never stop/down a project that is not proven ours (including B5a).
  const absent = await run(ctx, composeCommand(ctx, 'compose-ps-all'), 'daemon-unreachable');
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
    catch (teardown) { cause.teardownCode ??= teardown instanceof ComposedConstructionError ? teardown.code : 'compose-down'; }
    try { options.diagnostics?.(cause.code); } catch { /* Preserve original cause. */ }
    throw cause;
  }
}
