import { access, readFile, writeFile } from 'node:fs/promises';
import * as files from 'node:fs/promises';
import { inspect } from 'node:util';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOnePasswordBackend } from './onepassword';
import { createOnePasswordProcess } from './onepasswordProcess';
import { parseVersion } from './onepasswordMetadata';
import * as tokenModule from './onepasswordConfig';
import { createOnePasswordFixture } from './onepassword.testSupport';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rm: vi.fn(actual.rm) };
});

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.mocked(files.rm).mockReset();
  vi.unstubAllEnvs();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function fixture() {
  const f = await createOnePasswordFixture();
  const backend = createOnePasswordBackend(f.config);
  cleanups.push(f.cleanup, async () => {
    // Failed mutation proofs may deliberately strand only this fixture's recorded children.
    for (const record of await f.readRecords()) {
      for (const pid of [record.pid, record.descendantPid]) {
        if (pid !== undefined) { try { process.kill(pid, 'SIGKILL'); } catch { /* Already reaped. */ } }
      }
      if (dirname(record.cwd) !== await files.realpath(tmpdir()) || !basename(record.cwd).startsWith('tinyvault-op-')) {
        throw new Error('Unexpected synthetic runtime directory');
      }
      await files.rm(record.cwd, { recursive: true, force: true });
    }
  }, async () => {
    try { await backend.dispose(); } catch (error) { expect(error).toMatchObject({ kind: 'unavailable' }); }
  });
  return { ...f, backend };
}
async function prepared() {
  const f = await fixture();
  const [item] = await f.backend.listItems();
  const policy = await f.backend.resolvePolicy(item.handle);
  return { ...f, handle: item.handle, policy };
}
function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

describe('T6 exact argv, private environment and fixed process boundary', () => {
  it('executes metacharacter fixture path with restricted PATH, closed stdin and no hostile inheritance', async () => {
    const f = await fixture();
    for (const key of ['OP_CONNECT_HOST', 'OP_CONNECT_TOKEN', 'OP_SESSION_test', 'OP_ACCOUNT', 'HTTP_PROXY', 'HTTPS_PROXY', 'NODE_OPTIONS', 'DYLD_INSERT_LIBRARIES', 'LD_PRELOAD', 'UNRELATED_TOKEN']) {
      const value = key === 'NODE_OPTIONS' ? '--no-warnings'
        : key === 'DYLD_INSERT_LIBRARIES' || key === 'LD_PRELOAD' ? '' : `synthetic-${key}`;
      vi.stubEnv(key, value);
    }
    const listing = f.backend.listItems();
    await expect(listing).resolves.toHaveLength(2);
    const [item] = await listing;
    expect(await f.backend.probeAvailability()).toEqual({ available: true });
    const secret = await f.backend.resolveSecret(item.handle, await f.backend.resolvePolicy(item.handle));
    secret.clear();
    const records = await f.readRecords();
    expect(records.map((r) => r.command)).toEqual(['version', 'list', 'probe', 'detail']);
    for (const record of records) {
      // The adapter passes the directory as created; the child's cwd is its canonical form (macOS /var -> /private/var).
      const directory = record.argv[2]!;
      expect(join(await files.realpath(dirname(directory)), basename(directory))).toBe(record.cwd);
      const global = ['--cache=false', '--config', directory, '--format', 'json', '--no-color'];
      const suffix = record.command === 'version' ? ['--version'] : record.command === 'probe' ? ['user', 'get', '--me']
        : record.command === 'list' ? ['item', 'list', '--vault', f.config.vaultId, '--categories', 'Login']
          : ['item', 'get', f.recipe.ids.a, '--vault', f.config.vaultId];
      expect(record.argv).toEqual([...global, ...suffix]);
      const { PWD, SHLVL, __CF_USER_TEXT_ENCODING, ...childEnv } = record.env;
      expect(childEnv).toEqual({
        OP_CACHE: 'false', OP_BIOMETRIC_UNLOCK_ENABLED: 'false', OP_DEBUG: 'false', OP_INCLUDE_ARCHIVE: 'false',
        OP_FORMAT: 'json', HOME: directory, OP_CONFIG_DIR: directory, TMPDIR: directory,
        PATH: '/usr/bin:/bin', LANG: 'C.UTF-8',
      });
      // The required fixture exec trampoline adds these keys; it does not sanitize inheritance.
      expect(PWD).toBe(record.cwd);
      if (process.platform === 'darwin') {
        expect(SHLVL).toBe('0');
        expect(__CF_USER_TEXT_ENCODING).toMatch(/^0x[0-9a-f]+:0x[0-9a-f]+:0x[0-9a-f]+$/iu);
      } else {
        expect(SHLVL === undefined || SHLVL === '0').toBe(true);
        expect(__CF_USER_TEXT_ENCODING).toBeUndefined();
      }
      expect(record.tokenMatches).toBe(record.command !== 'version');
      expect(record.stdinEnded).toBe(true);
      expect(record.argv.join(' ')).not.toContain(f.token);
      await expect(access(record.cwd)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(alive(record.pid)).toBe(false);
    }
    expect(await readFile(f.config.tokenPath, 'utf8')).toBe(f.token);
  });
  it.each(['synthetic failure A', 'Different synthetic failure BBBBBBBB'])('does not expose stderr/native data %s', async (stderr) => {
    const f = await prepared();
    await f.setBehavior('detail', { exitCode: 1, stderr });
    const error = await f.backend.resolveSecret(f.handle, f.policy).catch((error: unknown) => error);
    expect(error).toMatchObject({ name: 'BackendError', kind: 'unavailable', message: 'Credential backend is unavailable' });
    expect(Object.hasOwn(error as object, 'cause')).toBe(false);
    expect(inspect(error)).not.toContain(stderr);
    expect(inspect(error)).not.toContain(f.token);
  });
});

describe('version and distinct uppercase account profile grammar', () => {
  it('enforces the version parser byte cap independently of process output admission', () => {
    const exact = Buffer.from('2.39.0' + ' '.repeat(16_384 - 6));
    const over = Buffer.from('2.39.0' + ' '.repeat(16_385 - 6));
    expect(exact.byteLength).toBe(16_384);
    expect(over.byteLength).toBe(16_385);
    expect(() => parseVersion(exact)).not.toThrow();
    expect(() => parseVersion(over)).toThrowError(expect.objectContaining({ kind: 'unavailable' }));
  });
  it('accepts exact 2.39.0 after ASCII whitespace trim', async () => {
    const f = await fixture();
    await f.setVersion(' \t\r\n\v\f2.39.0\t \n');
    expect(await f.backend.probeAvailability()).toEqual({ available: true });
  });
  it.each(['2.39.1', 'v2.39.0', '2.39.0-beta', '2.39.0 extra', '', '\u00a02.39.0'])('rejects version %j with zero authenticated spawns', async (version) => {
    const f = await fixture();
    await f.setVersion(version);
    expect(await f.backend.probeAvailability()).toEqual({ available: false, reason: 'error' });
    expect((await f.readRecords()).map((r) => r.command)).toEqual(['version']);
  });
  it.each([
    ['invalid UTF-8', Buffer.from([0x80])],
    ['leading UTF-8 BOM before exact version', Buffer.from([0xef, 0xbb, 0xbf, 0x32, 0x2e, 0x33, 0x39, 0x2e, 0x30])],
    ['valid version with oversized ASCII padding', Buffer.from(' '.repeat(16_384) + '2.39.0')],
  ])('rejects %s with zero authenticated spawns', async (_name, raw) => {
    const f = await fixture();
    await f.setRaw('version', raw);
    expect(await f.backend.probeAvailability()).toEqual({ available: false, reason: 'error' });
    expect((await f.readRecords()).map((r) => r.command)).toEqual(['version']);
  });
  it.each(['missing key', 'extra key', 'lowercase id', 'wrong type', 'inactive', 'null last auth'])('rejects malformed profile %s with generic error', async (mode) => {
    const f = await fixture();
    const probe: Record<string, unknown> = { ...f.recipe.probe };
    if (mode === 'missing key') delete probe.last_auth_at;
    else if (mode === 'extra key') probe.extra = 'value';
    else if (mode === 'lowercase id') probe.id = 'a'.repeat(26);
    else if (mode === 'wrong type') probe.type = 'USER';
    else if (mode === 'inactive') probe.state = 'SUSPENDED';
    else probe.last_auth_at = null;
    await f.setProbe(probe);
    expect(await f.backend.probeAvailability()).toEqual({ available: false, reason: 'error' });
  });
});

describe('T7/T8 bounded process and disposal lifetime', () => {
  it.each(['version', 'probe', 'list', 'detail'] as const)(
    'rejects cap-plus-one %s stdout through the production runner before any parser', async (command) => {
      const f = await fixture();
      const cap = command === 'version' || command === 'probe' ? 16_384 : 1_048_576;
      await f.setRaw(command, Buffer.alloc(cap + 1, 0x52));
      const runner = createOnePasswordProcess(f.config);
      cleanups.push(() => runner.dispose());
      await expect(runner.method((operation) => runner.run(operation, command, command === 'version' ? undefined : f.token, f.recipe.ids.a)))
        .rejects.toMatchObject({ kind: 'unavailable' });
      expect((await f.readRecords()).map((record) => record.command)).toEqual([command]);
    },
  );
  it.each(['version', 'probe', 'list', 'detail'] as const)(
    'transfers exact-cap %s stdout without retaining duplicate response bytes', async (command) => {
      const f = await fixture();
      const cap = command === 'version' || command === 'probe' ? 16_384 : 1_048_576;
      await f.setRaw(command, Buffer.alloc(cap, 0x52));
      const runner = createOnePasswordProcess(f.config);
      cleanups.push(() => runner.dispose());
      const retained = new Set<Buffer>();
      let peak = 0;
      const measure = () => {
        const live = [...retained].reduce((total, bytes) => total + (bytes.some((byte) => byte !== 0) ? bytes.byteLength : 0), 0);
        peak = Math.max(peak, live);
      };
      const allocation = Buffer.alloc;
      const from = Buffer.from;
      const concat = Buffer.concat;
      const copy = Buffer.prototype.copy;
      const allocSpy = vi.spyOn(Buffer, 'alloc').mockImplementation(((...args: Parameters<typeof Buffer.alloc>) => {
        const bytes = allocation(...args);
        if (bytes.length === cap) retained.add(bytes);
        measure();
        return bytes;
      }) as typeof Buffer.alloc);
      const fromSpy = vi.spyOn(Buffer, 'from').mockImplementation(((value: unknown, ...args: unknown[]) => {
        const bytes = Reflect.apply(from, Buffer, [value, ...args]) as Buffer;
        if (Buffer.isBuffer(value) && value.length > 0 && value.every((byte) => byte === 0x52)) retained.add(bytes);
        measure();
        return bytes;
      }) as typeof Buffer.from);
      const concatSpy = vi.spyOn(Buffer, 'concat').mockImplementation((list, length) => {
        const bytes = concat(list, length);
        if (list.some((part) => retained.has(part as Buffer))) retained.add(bytes);
        measure();
        return bytes;
      });
      const copySpy = vi.spyOn(Buffer.prototype, 'copy').mockImplementation(function (this: Buffer, ...args: unknown[]) {
        const count = Reflect.apply(copy, this, args) as number;
        if (retained.has(args[0] as Buffer)) measure();
        return count;
      });
      let result: Buffer | undefined;
      try {
        const pending = runner.method((operation) => runner.run(operation, command, command === 'version' ? undefined : f.token, f.recipe.ids.a));
        await expect(pending).resolves.toHaveLength(cap);
        result = await pending;
        expect(result.every((byte) => byte === 0x52)).toBe(true);
        expect(peak, 'combined retained stdout bytes never exceed the command cap').toBeLessThanOrEqual(cap);
        expect([...retained].some((bytes) => bytes.buffer === result!.buffer && bytes.byteOffset === result!.byteOffset)).toBe(true);
        result.fill(0);
        expect([...retained].every((bytes) => bytes.every((byte) => byte === 0))).toBe(true);
      } finally {
        result?.fill(0);
        allocSpy.mockRestore(); fromSpy.mockRestore(); concatSpy.mockRestore(); copySpy.mockRestore();
      }
    },
  );
  it.each(['hang', 'ignore-term', 'descendant', 'close-pipes', 'stdout-flood', 'stderr-flood'] as const)(
    '%s is bounded, drained and never returns a late Secret', async (mode) => {
      const f = await prepared();
      await f.setBehavior('detail', { mode });
      const start = Date.now();
      await expect(f.backend.resolveSecret(f.handle, f.policy)).rejects.toMatchObject({ kind: 'unavailable' });
      expect(Date.now() - start).toBeLessThan(mode === 'ignore-term' ? 3600 : 4000);
      const record = (await f.readRecords()).find((r) => r.command === 'detail')!;
      expect(record).toBeDefined();
      if (mode === 'ignore-term') expect(alive(record.pid)).toBe(false);
      if (alive(record.pid) || (record.descendantPid !== undefined && alive(record.descendantPid))) {
        // A responsive OS normally reaps both. A retained group is a fixed containment failure.
        await expect(f.backend.dispose()).rejects.toMatchObject({ kind: 'unavailable' });
      } else {
        expect(alive(record.pid)).toBe(false);
      }
      await expect(access(record.cwd)).rejects.toMatchObject({ code: 'ENOENT' });
    }, 10_000,
  );
  it('final method deadline poisons stalled local work without any child spawn', async () => {
    const f = await fixture();
    let release!: (value: Awaited<ReturnType<typeof tokenModule.readServiceToken>>) => void;
    const held = new Promise<Awaited<ReturnType<typeof tokenModule.readServiceToken>>>((resolve) => { release = resolve; });
    const read = vi.spyOn(tokenModule, 'readServiceToken').mockReturnValue(held);
    const start = Date.now();
    const pending = f.backend.probeAvailability();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sentinel = new Promise<'independent deadline sentinel'>((resolve) => {
      timer = setTimeout(() => resolve('independent deadline sentinel'), 4200);
    });
    try {
      expect(await Promise.race([pending, sentinel])).toEqual({ available: false, reason: 'error' });
      expect(Date.now() - start).toBeLessThan(4000);
      expect(read).toHaveBeenCalledTimes(1);
      const poisonedStart = Date.now();
      await expect(f.backend.listItems()).rejects.toMatchObject({ kind: 'unavailable' });
      expect(Date.now() - poisonedStart).toBeLessThan(100);
      expect(await f.readRecords()).toEqual([]);
    } finally {
      clearTimeout(timer);
      release({ token: f.token, fingerprint: 'synthetic-deferred-fingerprint' });
      await pending;
      await new Promise<void>((resolve) => { setImmediate(resolve); });
      read.mockRestore();
    }
  }, 6000);
  it('disposal before first method creates no child and remains idempotent', async () => {
    const f = await fixture();
    await Promise.all([f.backend.dispose(), f.backend.dispose()]);
    await expect(f.backend.listItems()).rejects.toMatchObject({ kind: 'unavailable' });
    expect(await f.backend.probeAvailability()).toEqual({ available: false, reason: 'error' });
    expect(await f.readRecords()).toEqual([]);
  });
  it('disposes a running delayed detail and rejects its late success without unhandled rejection', async () => {
    const f = await prepared();
    await f.setBehavior('detail', { delayMs: 1200 });
    const unhandled: unknown[] = [];
    const listen = (error: unknown) => { unhandled.push(error); };
    process.on('unhandledRejection', listen);
    try {
      const pending = f.backend.resolveSecret(f.handle, f.policy);
      const rejected = expect(pending).rejects.toMatchObject({ kind: 'unavailable' });
      await f.waitForCommand('detail');
      await f.backend.dispose();
      await rejected;
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandled).toEqual([]);
    } finally { process.removeListener('unhandledRejection', listen); }
  });
  it('rejects the fifth concurrent method immediately without an internal queue', async () => {
    const f = await prepared();
    await f.setBehavior('probe', { delayMs: 200 });
    const calls = Array.from({ length: 4 }, () => f.backend.probeAvailability());
    const before = Date.now();
    expect(await f.backend.probeAvailability()).toEqual({ available: false, reason: 'error' });
    expect(Date.now() - before).toBeLessThan(100);
    expect(await Promise.all(calls)).toEqual(Array(4).fill({ available: true }));
    expect((await f.readRecords()).filter((r) => r.command === 'probe')).toHaveLength(4);
  });
  it('reserves at most 64 lifetime spawns including version and repeated failures', async () => {
    const f = await fixture();
    await f.setBehavior('probe', { exitCode: 1 });
    for (let index = 0; index < 66; index++) {
      expect(await f.backend.probeAvailability()).toEqual({ available: false, reason: 'error' });
    }
    expect(await f.readRecords()).toHaveLength(64);
  }, 20_000);
  it('racing first real token reads bind exactly one winner before authenticated spawn', async () => {
    const f = await fixture();
    const realRead = tokenModule.readServiceToken;
    let firstReady!: () => void;
    const ready = new Promise<void>((resolve) => { firstReady = resolve; });
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    vi.spyOn(tokenModule, 'readServiceToken').mockImplementation(async (path) => {
      const result = await realRead(path);
      if (++calls === 1) { firstReady(); await barrier; }
      return result;
    });
    const original = f.backend.probeAvailability();
    await ready;
    await writeFile(f.config.tokenPath, 'synthetic-alternate-token');
    const replacement = f.backend.probeAvailability();
    await f.waitForCommand('version');
    release();
    const results = await Promise.all([original, replacement]);
    expect(results).toContainEqual({ available: false, reason: 'not_authenticated' });
    const authenticated = (await f.readRecords()).filter((r) => r.command !== 'version');
    expect(authenticated).toHaveLength(1);
    expect(authenticated[0].tokenMatches).toBe(false);
    await writeFile(f.config.tokenPath, f.token);
    expect(await f.backend.probeAvailability()).toEqual({ available: false, reason: 'not_authenticated' });
  });
  it('poisons cleanup failure and zeros the completed output before rejecting', async () => {
    const f = await prepared();
    const { rm: realRemove } = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    const realAllocate = Buffer.alloc;
    let ownedPath: string | undefined;
    const outputs: Buffer[] = [];
    vi.spyOn(Buffer, 'alloc').mockImplementation((size, fill, encoding) => {
      const output = realAllocate(size, fill, encoding);
      if (size === 1_048_576) outputs.push(output);
      return output;
    });
    vi.mocked(files.rm).mockImplementation(async (path, options) => {
      if (String(path).includes('tinyvault-op-') && ownedPath === undefined) {
        ownedPath = String(path);
        throw new Error('synthetic cleanup failure');
      }
      return realRemove(path, options);
    });
    try {
      await expect(f.backend.resolveSecret(f.handle, f.policy)).rejects.toMatchObject({ kind: 'unavailable' });
      expect(ownedPath).toBeDefined();
      expect(outputs.length).toBeGreaterThan(0);
      expect(outputs.every((output) => output.every((byte) => byte === 0))).toBe(true);
      await expect(f.backend.dispose()).rejects.toMatchObject({ kind: 'unavailable' });
    } finally {
      vi.restoreAllMocks();
      vi.mocked(files.rm).mockReset();
      if (ownedPath !== undefined) await realRemove(ownedPath, { recursive: true, force: true });
    }
  });
  it('disposes while a real token read is held before spawn', async () => {
    const f = await fixture();
    const realRead = tokenModule.readServiceToken;
    let ready!: () => void;
    const reached = new Promise<void>((resolve) => { ready = resolve; });
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(tokenModule, 'readServiceToken').mockImplementation(async (path) => {
      const result = await realRead(path);
      ready();
      await held;
      return result;
    });
    const pending = f.backend.listItems();
    const rejected = expect(pending).rejects.toMatchObject({ kind: 'unavailable' });
    await reached;
    const disposing = f.backend.dispose();
    release();
    await Promise.all([rejected, disposing]);
    expect(await f.readRecords()).toEqual([]);
  });
});
