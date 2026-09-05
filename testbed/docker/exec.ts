// Closed Docker argv and a pinned child environment enforce harness-channel hygiene for a trusted
// boundary. Only the injected production runner spawns; this does not establish daemon non-exposure.
import { spawn } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { validateTopology } from './topology.mjs';
import { assertPinned, DockerPreflightError, type PinnedDockerEndpoint } from './preflight';
import type { BridgeClock } from './bridge';

const topology = validateTopology(JSON.parse(readFileSync(new URL('./topology.json', import.meta.url), 'utf8')));
export const COMPOSE_FILE = fileURLToPath(new URL(`../../${topology.composePath}`, import.meta.url));
export const IMAGE_NAME = topology.imageName;
export const COMMAND_TIMEOUT_MS = 120_000;
export const WAIT_TIMEOUT_SECONDS = 60;
export const STOP_TIMEOUT_SECONDS = 10;
export const KILL_TIMEOUT_MS = 5_000;
export const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
export const ID_PATTERN = /^[0-9a-f]{64}$/;
export const IMAGE_ID_PATTERN = /^sha256:[0-9a-f]{64}$/;
export const CONSTRUCTION_CODES = [
  'daemon-unreachable', 'project-not-fresh', 'image-build', 'image-inspect', 'container-create',
  'container-unhealthy', 'command-timeout', 'command-invalid', 'resolution-count', 'resolution-shape',
  'inspect-shape', 'not-running', 'not-healthy', 'image-mismatch', 'created-before-epoch',
  'label-fixture', 'label-epoch', 'label-compose-project', 'label-compose-service',
  'hostname-mismatch', 'user-mismatch', 'env-unexpected', 'command-overridden', 'network-mode',
  'privileged', 'namespace-shared', 'capability-added', 'device-added', 'bind-present', 'mount-present',
  'network-membership', 'port-mismatch', 'exec-spawn', 'handshake-rejected', 'mac-invalid',
  'bridge-protocol', 'bridge-closed', 'origin-unreachable', 'secret-exposed', 'scan-failed',
  'history-parse', 'scan-control-missing',
  'compose-stop', 'compose-down', 'handle-timeout',
] as const;
export type ConstructionCode = typeof CONSTRUCTION_CODES[number];
const safeCode = (code: ConstructionCode): ConstructionCode =>
  CONSTRUCTION_CODES.includes(code) ? code : 'command-invalid';
export class ComposedConstructionError extends Error {
  readonly code: ConstructionCode;
  #teardownCode?: ConstructionCode;
  get teardownCode(): ConstructionCode | undefined { return this.#teardownCode; }
  set teardownCode(code: ConstructionCode | undefined) { this.#teardownCode = code === undefined ? undefined : safeCode(code); }
  readonly command?: DockerCommand['kind'];
  readonly project?: string;
  readonly surface?: 'history';
  constructor(code: ConstructionCode, command?: DockerCommand['kind'], project?: string, surface?: 'history') {
    super(safeCode(code));
    this.name = 'ComposedConstructionError';
    this.code = safeCode(code);
    this.project = typeof project === 'string' && NAME_PATTERN.exec(project)?.[0] === project ? project : undefined;
    this.command = COMMAND_KINDS.includes(command as DockerCommand['kind']) ? command : undefined;
    this.surface = surface === 'history' ? surface : undefined;
  }
}
export const COMMAND_KINDS = ['compose-ps-all', 'compose-build', 'compose-up', 'compose-ps',
  'compose-stop', 'compose-down', 'image-inspect', 'image-history', 'inspect', 'logs', 'export', 'exec-bridge'] as const;
declare const containerIdBrand: unique symbol;
export type ContainerId = string & { readonly [containerIdBrand]: true };
export function containerId(value: string): ContainerId {
  requirePattern(value, ID_PATTERN);
  return value as ContainerId;
}
type ComposeContext = { project: string; epoch: string };
export type DockerCommand =
  | (ComposeContext & { kind: 'compose-ps-all' | 'compose-build' | 'compose-up' | 'compose-stop' | 'compose-down' })
  | (ComposeContext & { kind: 'compose-ps'; service: string })
  | { kind: 'image-inspect' }
  | { kind: 'image-history'; id: string }
  | { kind: 'inspect' | 'logs' | 'export' | 'exec-bridge'; id: ContainerId };
export type DockerSpawn = Readonly<{
  file: string; args: readonly string[]; env: Readonly<Record<string, string>>;
}>;
export type ProcessHandle = { kill(): void; exited: Promise<number | null> };
export type DockerHandle = ProcessHandle & { stdin: Writable; stdout: Readable; stderr: Readable };
export type DockerResult = { stdout: string; stderr: string; exitCode: number | null };
export interface DockerProcessRunner {
  run(spawn: DockerSpawn): Promise<DockerResult>;
  spawnLongLived(spawn: DockerSpawn): DockerHandle;
}
export interface ProcessRegistry { register(handle: ProcessHandle): void }
export const systemClock: BridgeClock & { now(): number } = {
  now: () => Date.now(), setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};
export async function bounded<T>(work: Promise<T>, ms: number, clock: BridgeClock,
  error: ComposedConstructionError, cancel: () => void = () => {}): Promise<T> {
  let timer: unknown;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = clock.setTimeout(() => { try { cancel(); } finally { reject(error); } }, ms);
    })]);
  } finally { clock.clearTimeout(timer); }
}
function requirePattern(value: unknown, pattern: RegExp): asserts value is string {
  if (typeof value !== 'string' || pattern.exec(value)?.[0] !== value) throw new ComposedConstructionError('command-invalid');
}
function commandArgs(command: DockerCommand): string[] {
  if (!command || !COMMAND_KINDS.includes(command.kind)) throw new ComposedConstructionError('command-invalid');
  if ('project' in command) return composeArgs(command);
  if (command.kind === 'image-inspect') return ['image', 'inspect', IMAGE_NAME];
  if (command.kind === 'image-history') {
    const id = command.id;
    requirePattern(id, IMAGE_ID_PATTERN);
    return ['history', '--no-trunc', '--format', '{{json .}}', id];
  }
  if (!('id' in command)) throw new ComposedConstructionError('command-invalid');
  requirePattern(command.id, ID_PATTERN);
  switch (command.kind) {
    case 'inspect': return ['inspect', '--type', 'container', command.id];
    case 'exec-bridge': return ['exec', '-i', command.id, 'node', '/app/bridge.mjs'];
    case 'logs': case 'export': return [command.kind, command.id];
    default: throw new ComposedConstructionError('command-invalid');
  }
}
function composeArgs(command: DockerCommand & ComposeContext): string[] {
  requirePattern(command.project, NAME_PATTERN);
  requirePattern(command.epoch, /^(0|[1-9][0-9]*)-[0-9a-f]{32}$/);
  const prefix = ['compose', '--env-file', '/dev/null', '--progress', 'quiet', '--ansi', 'never',
    '-f', COMPOSE_FILE, '-p', command.project];
  switch (command.kind) {
    case 'compose-ps-all': return [...prefix, 'ps', '-aq'];
    case 'compose-build': return [...prefix, 'build'];
    case 'compose-up': return [...prefix, 'up', '-d', '--wait', '--wait-timeout', String(WAIT_TIMEOUT_SECONDS), '--no-build'];
    case 'compose-stop': return [...prefix, 'stop', '--timeout', String(STOP_TIMEOUT_SECONDS)];
    case 'compose-down': return [...prefix, 'down', '--remove-orphans'];
    case 'compose-ps': requirePattern(command.service, NAME_PATTERN); return [...prefix, 'ps', '-q', command.service];
    default: throw new ComposedConstructionError('command-invalid');
  }
}
export function buildDockerSpawn(pin: PinnedDockerEndpoint, command: DockerCommand): DockerSpawn {
  assertPinned(pin);
  const args = commandArgs(command);
  const env: Record<string, string> = { DOCKER_HOST: pin.dockerHost };
  for (const key of ['PATH', 'HOME', 'TMPDIR']) {
    if (process.env[key] !== undefined) env[key] = process.env[key]!;
  }
  if ('epoch' in command) env.TV_EVAL_EPOCH = command.epoch;
  if (args.some((arg) => /^(?:-H|-c|--host(?:=|$)|--context(?:=|$))/.test(arg))) {
    throw new DockerPreflightError('endpoint-argument', 'Docker argv cannot select an endpoint.');
  }
  return Object.freeze({ file: 'docker', args: Object.freeze(args), env: Object.freeze(env) });
}
export function runDockerCommand(pin: PinnedDockerEndpoint,
  command: DockerCommand & { kind: 'export' | 'exec-bridge' }, runner: DockerProcessRunner): Promise<DockerHandle>;
export function runDockerCommand(pin: PinnedDockerEndpoint,
  command: DockerCommand, runner: DockerProcessRunner, clock?: BridgeClock): Promise<DockerResult>;
export async function runDockerCommand(pin: PinnedDockerEndpoint, command: DockerCommand,
  runner: DockerProcessRunner, clock: BridgeClock = systemClock): Promise<DockerResult | DockerHandle> {
  const description = buildDockerSpawn(pin, command);
  if (command.kind === 'export' || command.kind === 'exec-bridge') return runner.spawnLongLived(description);
  try {
    return await bounded(Promise.resolve().then(() => runner.run(description)), COMMAND_TIMEOUT_MS, clock,
      new ComposedConstructionError('command-timeout', command.kind));
  } catch (error) {
    if (error instanceof ComposedConstructionError) {
      if (error.code === 'command-timeout') throw new ComposedConstructionError(error.code, command.kind);
      throw error;
    }
    throw new ComposedConstructionError('daemon-unreachable', command.kind);
  }
}
// Every native child is synchronously registered, including short-lived commands. No shell is used.
export function createDockerProcessRunner(registry: ProcessRegistry): DockerProcessRunner {
  const spawnLongLived = (description: DockerSpawn): DockerHandle => {
    const child = spawn(description.file, [...description.args], { env: { ...description.env }, stdio: 'pipe' });
    const exited = new Promise<number | null>((resolve, reject) => {
      child.once('error', () => reject(new ComposedConstructionError('daemon-unreachable'))); child.once('close', resolve);
    });
    void exited.catch(() => {}); // Long-lived callers attach their terminal observer after registration.
    const handle = { stdin: child.stdin, stdout: child.stdout, stderr: child.stderr,
      kill: () => { child.kill('SIGKILL'); }, exited };
    registry.register(handle);
    return handle;
  };
  return { spawnLongLived, run: async (description) => {
    const handle = spawnLongLived(description);
    const stdout: Buffer[] = []; const stderr: Buffer[] = [];
    handle.stdout.on('data', (b: Buffer) => stdout.push(b));
    handle.stderr.on('data', (b: Buffer) => stderr.push(b));
    handle.stdin.end();
    const exitCode = await bounded(handle.exited, COMMAND_TIMEOUT_MS, systemClock,
      new ComposedConstructionError('command-timeout'), handle.kill);
    return { stdout: Buffer.concat(stdout).toString('latin1'), stderr: Buffer.concat(stderr).toString('latin1'), exitCode };
  } };
}
