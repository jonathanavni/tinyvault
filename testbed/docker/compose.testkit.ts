// Deterministic daemon descriptions and real protocol peers over memory streams; no spawn or socket.
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { ControlSession } from './container/control';
import { dockerPreflight } from './preflight';
import { FIXTURE_IDS } from './protocol';
import { HISTORY_MARKER, type ProjectOptions } from './compose';
import { validateTopology } from './topology.mjs';
import { containerId, type DockerSpawn, type DockerResult, type DockerHandle } from './exec';

export const epochMs = 1788600000000;
const topology = validateTopology(JSON.parse(readFileSync(new URL('./topology.json', import.meta.url), 'utf8')));
export const imageId = 'sha256:' + 'f'.repeat(64);
export const ids = ['a', 'b', 'c'].map((c) => containerId(c.repeat(64)));
export const pair = generateKeyPairSync('ed25519');
export const imageDocument = { Id: imageId, Config: {
  Cmd: ['node', '/app/main.mjs'], Entrypoint: ['docker-entrypoint.sh'],
  Env: ['PATH=/usr/bin', 'NODE_VERSION=24.0.0', 'YARN_VERSION=1'], Labels: { marker: 'image-label' },
} };
export function validInspect(index: number, project: string, epoch: string) {
  const service = FIXTURE_IDS[index];
  return { State: { Running: true, Health: { Status: 'healthy' } }, Image: imageId,
    Created: new Date(Number(epoch.split('-')[0])).toISOString(), Config: { ...imageDocument.Config,
      Hostname: ids[index].slice(0, 12), User: 'node',
      Env: [...imageDocument.Config.Env, `TV_FIXTURE_ID=${service}`, `TV_EVAL_EPOCH=${epoch}`],
      Labels: { 'com.tinyvault.fixture': service, 'com.tinyvault.epoch': epoch,
        'com.docker.compose.project': project, 'com.docker.compose.service': service } },
    HostConfig: { NetworkMode: `${project}_default`, Privileged: false, PidMode: '', IpcMode: 'private', CapAdd: null, Devices: [], Binds: null },
    Mounts: [], NetworkSettings: { Networks: { [`${project}_default`]: {} },
      Ports: Object.fromEntries(topology.services[service].map((port) => [`${port.container}/tcp`,
        [{ HostIp: port.address, HostPort: String(port.host) }]])) },
  };
}
export function kindOf(spawn: DockerSpawn): string {
  const args = spawn.args;
  if (args[0] === 'ps') return 'ps-project';
  if (args[0] === 'history') return 'image-history';
  if (args[0] !== 'compose') return args[0] === 'image' ? 'image-inspect' : args[0] === 'exec' ? 'exec-bridge' : args[0];
  const tail = args.slice(args.indexOf('-p') + 2);
  return `compose-${tail[0]}`;
}
export async function mintPin() {
  return dockerPreflight({ env: {}, files: { readFile: async () => undefined },
    realpath: async () => '/injected/canonical.sock', stat: async () => ({ isSocket: () => true }) });
}
type Procedure = (...args: any[]) => any;
type Spy<T extends Procedure> = ((...args: Parameters<T>) => ReturnType<T>) & {
  mock: { calls: Parameters<T>[] }; getMockImplementation(): T | undefined;
  mockImplementation(implementation: T): unknown;
};
type SpyFactory = (implementation: Procedure) => unknown;
type FakeOptions = {
  omitMarker?: keyof typeof topology.markers;
  result?: (kind: string, spawn: DockerSpawn) => DockerResult | undefined;
  inspect?: (doc: ReturnType<typeof validInspect>, index: number) => void;
  peer?: (handle: DockerHandle & { stdout: PassThrough }, index: number) => void;
};
export async function fakeProject(spyFactory: SpyFactory, fake: FakeOptions = {}) {
  const spy = <T extends Procedure>(implementation: T) => spyFactory(implementation) as Spy<T>;
  const root = await mkdtemp(join(tmpdir(), 'tinyvault-compose-'));
  const spawns: DockerSpawn[] = []; const handles: DockerHandle[] = [];
  const secrets: Buffer[] = [];
  let project = ''; let epoch = '';
  const runner = {
    run: spy(async (spawn: DockerSpawn): Promise<DockerResult> => {
      spawns.push(spawn);
      const kind = kindOf(spawn);
      if (spawn.args[0] === 'compose') { project = spawn.args[spawn.args.indexOf('-p') + 1]; epoch = spawn.env.TV_EVAL_EPOCH; }
      const override = fake.result?.(kind, spawn);
      if (override) return override;
      let stdout = '';
      if (kind === 'image-inspect') stdout = JSON.stringify([imageDocument]);
      if (kind === 'image-history') stdout = JSON.stringify({ CreatedBy: `LABEL ${HISTORY_MARKER}` }) + '\n';
      if (kind === 'compose-ps') stdout = ids[FIXTURE_IDS.indexOf(spawn.args.at(-1) as typeof FIXTURE_IDS[number])] + '\n';
      if (kind === 'inspect') {
        const i = ids.indexOf(spawn.args.at(-1) as typeof ids[number]);
        const doc = validInspect(i, project, epoch); fake.inspect?.(doc, i); stdout = JSON.stringify([doc]);
      }
      const stderr = kind === 'logs' ? (['BOOT_MARKER', 'SHUTDOWN_MARKER'] as const)
        .filter((key) => key !== fake.omitMarker).map((key) => topology.markers[key]).join('\n') : '';
      return { stdout, stderr, exitCode: 0 };
    }),
    spawnLongLived: spy((spawn: DockerSpawn): DockerHandle => {
      spawns.push(spawn);
      const stdin = new PassThrough(); const stdout = new PassThrough(); const stderr = new PassThrough();
      let exit!: (code: number) => void;
      const exited = new Promise<number>((resolve) => { exit = resolve; });
      const handle = { stdin, stdout, stderr, exited, kill: spy(() => {
        stdin.destroy(); stdout.end(); stderr.end(); exit(0);
      }) };
      if (kindOf(spawn) === 'export') { queueMicrotask(() => { stdout.end(fake.omitMarker === 'EXPORT_MARKER' ? 'safe tar' : topology.markers.EXPORT_MARKER); stderr.end(); exit(0); }); return handle; }
      const i = ids.indexOf(spawn.args[2] as typeof ids[number]);
      handles.push(handle);
      queueMicrotask(() => { if (fake.omitMarker !== 'BRIDGE_MARKER') stderr.write(topology.markers.BRIDGE_MARKER); });
      // Capture the actual bootstrap bytes for the E spawn scan, not a marker masquerading as a secret.
      stdin.once('data', (frame: Buffer) => { secrets.push(Buffer.from(JSON.parse(frame.subarray(4).toString()).body.secret, 'base64url')); });
      fake.peer?.(handle, i);
      new ControlSession({ input: stdin, output: stdout }, {
        epoch, fixtureId: FIXTURE_IDS[i], hostname: ids[i].slice(0, 12), keyPairProvider: () => pair, diagnostics: () => {},
      });
      return handle;
    }),
  };
  const options: ProjectOptions = { pin: await mintPin(), runner, artifactRoot: root,
    clock: { now: () => epochMs, setTimeout: (cb, ms) => setTimeout(cb, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) },
    probeOrigin: spy(async () => true), diagnostics: spy(() => {}) };
  return { options, runner, spawns, handles, secrets, root,
    dispose: async () => { handles.forEach((h) => h.kill()); await rm(root, { recursive: true, force: true }); } };
}
