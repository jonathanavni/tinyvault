// Primary Docker-free test guard: inspect resolved runtime values, including computed imports.
// This covers executed calls, not arbitrary shell programs or code in separate child processes.
import childProcess from 'node:child_process';
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';
import { basename } from 'node:path';

function reject(target: string): never {
  throw new Error(`Docker access forbidden during tests: ${target}`);
}

function checkExecutable(value: unknown): void {
  if (typeof value !== 'string') return;
  const name = basename(value);
  if (name === 'docker' || name === 'docker-compose') reject(name);
}

function checkShellCommand(value: unknown): void {
  if (typeof value !== 'string') return;
  // exec/execSync receive a shell command, not an executable path. Recognize its
  // initial quoted/unquoted executable; this is deliberately not a shell interpreter.
  const first = value.trimStart().match(/^(?:"([^"]*)"|'([^']*)'|([^\s;|&]+))/);
  checkExecutable(first?.[1] ?? first?.[2] ?? first?.[3]);
}

function checkConnection(args: readonly unknown[]): void {
  // Node's HTTP client also calls Socket.connect with a normalized argument array.
  const target = Array.isArray(args[0]) ? args[0][0] : args[0];
  const options = typeof target === 'object' && target !== null
    ? target as { path?: unknown; port?: unknown } : undefined;
  const path = options?.path ?? (typeof target === 'string' ? target : undefined);
  const port = options?.port ?? target;
  if (typeof path === 'string' && basename(path) === 'docker.sock') reject('docker.sock');
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
  // overload behaviour and return values. Every call is checked before the native API.
  owner[key] = new Proxy(original, {
    apply(target, receiver, args) {
      check(args);
      return Reflect.apply(target, receiver, args);
    },
  });
}

for (const key of ['spawn', 'spawnSync', 'execFile', 'execFileSync'] as const) {
  wrap(childProcess, key, (args) => checkExecutable(args[0]));
}
for (const key of ['exec', 'execSync'] as const) {
  wrap(childProcess, key, (args) => checkShellCommand(args[0]));
}
wrap(net, 'connect', checkConnection);
wrap(net, 'createConnection', checkConnection);
// http.request uses this path internally, bypassing the exported net.connect function.
wrap(net.Socket.prototype, 'connect', checkConnection);
syncBuiltinESMExports();
