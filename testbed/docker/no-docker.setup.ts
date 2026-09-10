// The runtime interceptor, the capability map and the execution proof catch Docker reach from code
// modules reachable from make test — source and test files, spawn sites, plain-node gate scripts.
// Entry-point files are the reviewed root of trust: package.json (scripts block), Makefile, three
// Vitest configs and every scripts/check-*.mjs, plus scripts/test-contract.mjs and scripts/test-execution.mjs. Their exact content is hash-pinned in-suite.
// Hostile root-of-trust edits are outside the locked threat model: page content and the evaluated
// model do not edit the repository. Makefile parse-time execution precedes the in-recipe gates.
// No static gate is complete. This runtime guard covers default-config Vitest, including in-process
// eval; the Docker config is the deliberate exception and is never on make test's path. Bare-node
// steps and separate children run outside it. Wrapper launchers (xargs, nohup, script, PATH shims),
// worker_threads realms and process.binding escape this hygiene guard; it is not containment.
import childProcess from 'node:child_process';
import net from 'node:net';
import { basename } from 'node:path';

function reject(target: string): never {
  throw new Error(`Docker access forbidden during tests: ${target}`);
}

function checkExecutable(value: unknown, argv: readonly unknown[] = []): void {
  if (typeof value !== 'string') return;
  const name = basename(value);
  if (name === 'docker' || name === 'docker-compose') reject(name);
  if (name === 'env') {
    const first = argv.find((arg) => typeof arg === 'string' && !arg.startsWith('-'));
    // The cheap first-non-option case only; this is not an env/shell interpreter.
    if (typeof first === 'string' && ['docker', 'docker-compose'].includes(basename(first))) reject(basename(first));
  }
}

function checkShellCommand(value: unknown): void {
  if (typeof value !== 'string') return;
  // exec/execSync receive a shell command, not an executable path. Recognize its
  // initial quoted/unquoted executable; this is deliberately not a shell interpreter.
  const first = value.trimStart().match(/^(?:"([^"]*)"|'([^']*)'|([^\s;|&]+))/);
  const tail = first ? value.trimStart().slice(first[0].length).trim().split(/\s+/) : [];
  checkExecutable(first?.[1] ?? first?.[2] ?? first?.[3], tail.map((s) => s.replace(/^['"]|['"]$/g, '')));
}

function checkProcessCall(args: readonly unknown[]): void {
  const options = (Array.isArray(args[1]) || args[1] == null ? args[2] : args[1]) as { shell?: unknown } | undefined;
  if (options?.shell) {
    checkExecutable(options.shell);
    // Node joins file + argv before invoking the shell; sync APIs never reach checkSpawn.
    const command = Array.isArray(args[1]) ? [args[0], ...args[1]].join(' ') : args[0];
    checkShellCommand(command);
  } else checkExecutable(args[0], Array.isArray(args[1]) ? args[1] : []);
}

function checkShellCall(args: readonly unknown[]): void {
  const options = args[1] as { shell?: unknown } | undefined;
  checkExecutable(options?.shell);
  checkShellCommand(args[0]);
}

function checkSpawn(args: readonly unknown[]): void {
  const options = args[0] as { file?: unknown; args?: unknown[]; shell?: unknown } | undefined;
  checkExecutable(options?.file, options?.args?.slice(1));
  // Node normalizes shell:true/custom-shell calls to [argv0, '-c', command]
  // (or [argv0, '/d', '/s', '/c', command] for cmd.exe) before this boundary.
  if (options?.shell && Array.isArray(options.args)) {
    checkShellCommand(options.args[options.args.length - 1]);
  }
}

function checkConnection(args: readonly unknown[]): void {
  // Node's HTTP client also calls Socket.connect with a normalized argument array.
  const target = Array.isArray(args[0]) ? args[0][0] : args[0];
  const options = typeof target === 'object' && target !== null
    ? target as { path?: unknown; port?: unknown } : undefined;
  // Numeric strings use Node's TCP port overload; other strings select Unix sockets.
  const path = options?.path ?? (typeof target === 'string' && !(Number(target) >= 0) ? target : undefined);
  const port = options?.port ?? target;
  // Preflight accepts any socket basename. No existing tests need Unix-socket exceptions.
  if (typeof path === 'string') throw new Error('Unix socket access forbidden during Docker-free tests.');
  if (typeof port === 'number' || typeof port === 'string') {
    if (Number(port) === 2375 || Number(port) === 2376) reject(`port ${port}`);
  }
}

function wrap<T extends object, K extends keyof T>(
  owner: T, key: K, check: (args: readonly unknown[]) => void,
): void {
  const original = owner[key];
  if (typeof original !== 'function') throw new Error(`Cannot guard ${String(key)}`);
  // A Proxy preserves function properties (including Node's promisify hooks), receiver,
  // overload behaviour and return values. Its apply trap checks direct calls; preserved
  // promisify hooks can bypass it, so async calls are also checked at the shared spawn boundary.
  owner[key] = new Proxy(original, {
    apply(target, receiver, args) {
      check(args);
      return Reflect.apply(target, receiver, args);
    },
  });
}

for (const key of ['spawn', 'spawnSync', 'execFile', 'execFileSync'] as const) {
  wrap(childProcess, key, checkProcessCall);
}
// Node exposes this downstream method at runtime but omits it from its public types.
const spawnPrototype = childProcess.ChildProcess.prototype as unknown as { spawn(options: unknown): unknown };
wrap(spawnPrototype, 'spawn', checkSpawn);
for (const key of ['exec', 'execSync'] as const) {
  wrap(childProcess, key, checkShellCall);
}
wrap(net, 'connect', checkConnection);
wrap(net, 'createConnection', checkConnection);
// http.request uses this path internally, bypassing the exported net.connect function.
wrap(net.Socket.prototype, 'connect', checkConnection);
