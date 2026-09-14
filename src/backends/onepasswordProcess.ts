import { spawn } from 'node:child_process';
import { chmod, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BackendError } from './backend';
import type { OnePasswordConfig } from './onepasswordConfig';

export type Command = 'version' | 'probe' | 'list' | 'detail';
export type Operation = {
  check(): void;
  onCancel(callback: () => void): () => void;
};
type ActiveOperation = { cancel(): void; done: Promise<void> };

/** Only this module owns subprocess authority. All commands use an owned POSIX group. */
export function createOnePasswordProcess(config: OnePasswordConfig) {
  let closed = false;
  let poisoned = false;
  let attempts = 0;
  let disposal: Promise<void> | undefined;
  const active = new Set<ActiveOperation>();
  function check(): void {
    if (closed || poisoned) throw new BackendError('unavailable');
  }
  async function method<T>(work: (operation: Operation) => Promise<T>): Promise<T> {
    check();
    if (active.size >= 4) throw new BackendError('unavailable');
    let cancelled = false;
    const callbacks = new Set<() => void>();
    const cancel = () => {
      cancelled = true;
      for (const callback of callbacks) callback();
    };
    const operation: Operation = {
      check() {
        check();
        if (cancelled) throw new BackendError('unavailable');
      },
      onCancel(callback) {
        callbacks.add(callback);
        if (cancelled || closed || poisoned) callback();
        return () => { callbacks.delete(callback); };
      },
    };
    let complete!: () => void;
    const entry = { cancel, done: new Promise<void>((resolve) => { complete = resolve; }) };
    active.add(entry);
    const deadline = setTimeout(cancel, 3000);
    let finalTimer: ReturnType<typeof setTimeout> | undefined;
    const finalBound = new Promise<never>((_, reject) => {
      finalTimer = setTimeout(() => {
        poisoned = true;
        cancel();
        reject(new BackendError('unavailable'));
      }, 3900);
    });
    try {
      return await Promise.race([work(operation), finalBound]);
    } catch (error) {
      if (error instanceof BackendError) throw error;
      throw new BackendError('unavailable');
    } finally {
      clearTimeout(deadline);
      clearTimeout(finalTimer);
      callbacks.clear();
      active.delete(entry);
      complete();
    }
  }
  async function executable(): Promise<'present' | 'missing'> {
    if ((process.platform !== 'darwin' && process.platform !== 'linux') || Number(process.versions.node.split('.')[0]) < 24) {
      throw new BackendError('unavailable');
    }
    try {
      const info = await stat(config.opPath);
      if (!info.isFile() || (info.mode & 0o111) === 0) throw new BackendError('unavailable');
      return 'present';
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return 'missing';
      throw new BackendError('unavailable');
    }
  }
  async function run(operation: Operation, command: Command, token?: string, itemId?: string): Promise<Buffer> {
    operation.check();
    if (await executable() === 'missing') throw new BackendError('unavailable');
    operation.check();
    let directory: string | undefined;
    let result: Buffer | undefined;
    const detachResult = operation.onCancel(() => { result?.fill(0); });
    try {
      directory = await mkdtemp(join(tmpdir(), 'tinyvault-op-'));
      await chmod(directory, 0o700);
      operation.check();
      const argv = ['--cache=false', '--config', directory, '--format', 'json', '--no-color'];
      if (command === 'version') argv.push('--version');
      else if (command === 'probe') argv.push('user', 'get', '--me');
      else if (command === 'list') argv.push('item', 'list', '--vault', config.vaultId, '--categories', 'Login');
      else {
        if (!config.items.some((item) => item.itemId === itemId)) throw new BackendError('unavailable');
        argv.push('item', 'get', itemId!, '--vault', config.vaultId);
      }
      let env: NodeJS.ProcessEnv | undefined = {
        OP_CACHE: 'false', OP_BIOMETRIC_UNLOCK_ENABLED: 'false', OP_DEBUG: 'false',
        OP_INCLUDE_ARCHIVE: 'false', OP_FORMAT: 'json', HOME: directory,
        OP_CONFIG_DIR: directory, TMPDIR: directory, PATH: '/usr/bin:/bin', LANG: 'C.UTF-8',
      };
      if (command !== 'version') {
        if (token === undefined) throw new BackendError('locked');
        env.OP_SERVICE_ACCOUNT_TOKEN = token;
      }
      operation.check();
      if (attempts >= 64) throw new BackendError('unavailable');
      attempts++;
      try {
        result = await new Promise<Buffer>((resolve, reject) => {
          const child = spawn(config.opPath, argv, {
            shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'], cwd: directory, env,
          });
          env = undefined;
          token = undefined;
          const cap = command === 'version' || command === 'probe' ? 16_384 : 1_048_576;
          let output: Buffer | undefined = Buffer.alloc(cap);
          let size = 0;
          let errors = 0;
          let stopping = false;
          let settled = false;
          let didClose = false;
          let success = false;
          let killTimer: ReturnType<typeof setTimeout> | undefined;
          let endTimer: ReturnType<typeof setTimeout> | undefined;
          let detach = () => {};
          function groupAlive(): boolean {
            if (child.pid === undefined) return false;
            try { process.kill(-child.pid, 0); return true; } catch (error) {
              return !(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ESRCH');
            }
          }
          function signal(signalName: 'SIGTERM' | 'SIGKILL'): void {
            if (child.pid !== undefined) {
              try { process.kill(-child.pid, signalName); } catch { /* Closure is checked independently. */ }
            }
          }
          function finish(clean: boolean): void {
            if (settled) return;
            settled = true;
            if (!clean) poisoned = true;
            clearTimeout(killTimer);
            clearTimeout(endTimer);
            detach();
            child.stdout?.removeListener('data', stdout);
            child.stderr?.removeListener('data', stderr);
            child.stdout?.destroy();
            child.stderr?.destroy();
            child.unref();
            let result: Buffer | undefined;
            try {
              operation.check();
              if (!clean || stopping || !success) throw new BackendError('unavailable');
              result = output!.subarray(0, size);
              output = undefined;
              resolve(result);
            } catch { reject(new BackendError('unavailable')); }
            finally {
              output?.fill(0);
              output = undefined;
              result = undefined;
            }
          }
          function stop(): void {
            if (settled || stopping) return;
            stopping = true;
            output?.fill(0);
            output = undefined;
            signal('SIGTERM');
            killTimer = setTimeout(() => {
              signal('SIGKILL');
              endTimer = setTimeout(() => finish(didClose && !groupAlive()), 250);
            }, 250);
          }
          function stdout(chunk: Buffer): void {
            if (!settled && !stopping) {
              size += chunk.length;
              if (size > cap) stop();
              else chunk.copy(output!, size - chunk.length);
            }
            chunk.fill(0);
          }
          function stderr(chunk: Buffer): void {
            errors += chunk.length;
            chunk.fill(0);
            if (errors > 16_384) stop();
          }
          child.stdout?.on('data', stdout);
          child.stderr?.on('data', stderr);
          child.on('error', stop);
          child.on('close', (code) => {
            didClose = true;
            success = code === 0;
            if (groupAlive()) stop();
            else finish(true);
          });
          detach = operation.onCancel(stop);
        });
      } finally { env = undefined; token = undefined; }
    } catch (error) {
      result?.fill(0);
      throw error;
    } finally {
      try {
        if (directory !== undefined) await rm(directory, { recursive: true, force: true });
      } catch {
        result?.fill(0);
        result = undefined;
        poisoned = true;
        throw new BackendError('unavailable');
      } finally { detachResult(); }
    }
    try { operation.check(); return result!; }
    catch { result?.fill(0); throw new BackendError('unavailable'); }
  }
  function dispose(): Promise<void> {
    if (disposal !== undefined) return disposal;
    closed = true;
    const pending = [...active];
    for (const operation of pending) operation.cancel();
    disposal = Promise.all(pending.map((operation) => operation.done)).then(() => {
      if (poisoned) throw new BackendError('unavailable');
    });
    return disposal;
  }
  return Object.freeze({ method, executable, run, dispose, check });
}
