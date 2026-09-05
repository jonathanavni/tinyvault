// Acceptance A/G via the public capture path and real in-memory protocol peers; no subprocess or dial.
import { afterEach, expect, it, vi } from 'vitest';
import { capturePersistedRuns } from '../runner';
import * as fixtures from '../fixtures';
import { createComposedProject, HandleRegistry } from './compose';
import { BridgeError } from './protocol';
import { COMMAND_TIMEOUT_MS, KILL_TIMEOUT_MS, ComposedConstructionError, CONSTRUCTION_CODES, runDockerCommand, systemClock } from './exec';
import { fakeProject, ids, kindOf, mintPin } from './compose.testkit';

const disposals: (() => Promise<void>)[] = [];
afterEach(async () => { for (const dispose of disposals.splice(0)) await dispose(); vi.restoreAllMocks(); vi.useRealTimers(); });
function track<T extends Awaited<ReturnType<typeof fakeProject>>>(h: T): T { disposals.push(h.dispose); return h; }
async function capture(h: Awaited<ReturnType<typeof fakeProject>>) {
  const fallback = vi.spyOn(fixtures, 'startFixtures').mockRejectedValue(new Error('fallback'));
  const injectedFallback = vi.fn();
  try {
    return await capturePersistedRuns(h.root, 1, undefined, { architecture: 'composed',
      dockerPreflight: async () => h.options.pin, dockerRunner: h.runner, probeOrigin: h.options.probeOrigin,
      launchChromium: async () => ({ close: vi.fn() }) as never, startFixtures: injectedFallback,
    });
  } finally { expect(fallback).not.toHaveBeenCalled(); expect(injectedFallback).not.toHaveBeenCalled(); }
}
const failureRows = [
  ['daemon-unreachable', 'ps-project', 1, ''],
  ['project-not-fresh', 'ps-project', 0, ids[0]],
  ['image-build', 'compose-build', 1, ''],
  ['image-inspect', 'image-inspect', 0, '[{}]'],
  ['container-create', 'compose-up', 1, ''],
  ['resolution-count', 'compose-ps', 0, ''],
  ['resolution-count', 'compose-ps', 0, `${ids[0]}\n${ids[1]}\n`],
  ['resolution-shape', 'compose-ps', 0, 'benign-login\n'],
  ['inspect-shape', 'inspect', 0, 'not-json'],
] as const;
it.each(failureRows)('public capture: %s at %s returns no transport and never falls back', async (code, kind, exitCode, stdout) => {
  const h = track(await fakeProject(vi.fn, { result: (k) => k === kind ? { exitCode, stdout, stderr: '' } : undefined }));
  const fallback = vi.spyOn(fixtures, 'startFixtures').mockRejectedValue(new Error('fallback'));
  const injectedFallback = vi.fn();
  const close = vi.fn();
  await expect(capturePersistedRuns(h.root, 1, undefined, { architecture: 'composed', dockerRunner: h.runner,
    dockerPreflight: async () => h.options.pin, probeOrigin: h.options.probeOrigin,
    launchChromium: async () => ({ close }) as never, startFixtures: injectedFallback,
  })).rejects.toMatchObject({ code });
  expect(fallback).not.toHaveBeenCalled(); expect(injectedFallback).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
  expect(h.spawns.filter((s) => kindOf(s) === 'compose-down')).toHaveLength(kind === 'ps-project' ? 0 : 1);
  expect(h.spawns.filter((s) => kindOf(s) === 'compose-stop')).toHaveLength(kind === 'ps-project' ? 0 : 1);
});
it.each(['ENOENT', 'ECONNREFUSED'])('B5a first-command exception %s is daemon-unreachable with zero teardown', async (code) => {
  const h = track(await fakeProject(vi.fn, { result: () => { throw Object.assign(new Error('untrusted'), { code }); } }));
  await expect(createComposedProject(h.options)).rejects.toMatchObject({ code: 'daemon-unreachable' });
  expect(h.spawns.map(kindOf)).toEqual(['ps-project']);
});
it('maps an up spawn rejection to daemon-unreachable', async () => {
  const h = track(await fakeProject(vi.fn, { result: (k) => { if (k === 'compose-up') throw new Error('untrusted'); return undefined; } }));
  await expect(capture(h)).rejects.toMatchObject({ code: 'daemon-unreachable' });
  expect(h.spawns.filter((s) => kindOf(s) === 'compose-down')).toHaveLength(1);
});
it.each([
  ['', 'container-create'], [ids[0] + '\n', 'container-unhealthy'],
  [ids[0].slice(0, 12) + '\n', 'container-unhealthy'],
  [`${ids[0]}\n${ids[1].slice(0, 12)}\n`, 'container-unhealthy'],
] as const)('nonzero up queries project state once more (%j → %s)', async (stdout, code) => {
  let queries = 0;
  const h = track(await fakeProject(vi.fn, { result: (kind) => {
    if (kind === 'compose-up') return { exitCode: 17, stdout: 'untrusted', stderr: 'unhealthy text' };
    if (kind === 'ps-project' && ++queries === 2) return { exitCode: 0, stdout, stderr: '' };
    return undefined;
  } }));
  await expect(capture(h)).rejects.toMatchObject({ code });
  expect(queries).toBe(2);
  expect(h.spawns.map(kindOf)).toEqual(['ps-project', 'compose-build', 'image-inspect',
    'compose-up', 'ps-project', 'compose-stop', 'image-history', 'compose-down']);
});
it.each(['exit', 'reject'] as const)('failed up follow-up query (%s) preserves container-create and query code', async (mode) => {
  let queries = 0;
  const h = track(await fakeProject(vi.fn, { result: (kind) => {
    if (kind === 'compose-up' || kind === 'compose-down') return { exitCode: 1, stdout: '', stderr: '' };
    if (kind === 'ps-project' && ++queries === 2) {
      if (mode === 'reject') throw new Error('untrusted');
      return { exitCode: 1, stdout: '', stderr: '' };
    }
    return undefined;
  } }));
  await expect(capture(h)).rejects.toMatchObject({ code: 'container-create', teardownCode: 'daemon-unreachable' });
  expect(queries).toBe(2);
  expect(h.spawns.filter((s) => kindOf(s) === 'compose-down')).toHaveLength(1);
  expect(h.spawns.filter((s) => kindOf(s) === 'compose-stop')).toHaveLength(1);
});
it('kills both established bridges AND the third service on failed probe, preserving cause over teardown', async () => {
  const h = track(await fakeProject(vi.fn, { result: (k) => k === 'compose-down' ? { exitCode: 1, stdout: '', stderr: '' } : undefined }));
  h.options.probeOrigin = vi.fn(async (origin) => !origin.endsWith('47130'));
  await expect(capture(h)).rejects.toMatchObject({ code: 'origin-unreachable', teardownCode: 'compose-down' });
  expect(h.handles).toHaveLength(3);
  for (const handle of h.handles) expect(handle.kill).toHaveBeenCalledOnce();
  expect(h.spawns.filter((s) => kindOf(s) === 'compose-down')).toHaveLength(1);
});
it('shared closer is idempotent and scans after kill and stop, before down and again afterward', async () => {
  const h = track(await fakeProject(vi.fn)); const events: string[] = [];
  h.options.scanners = { artifacts: async (_root, scanners) => {
    events.push('scan'); return scanners.length === 1; // the dedicated marker check
  } };
  const p = await createComposedProject(h.options);
  for (const handle of h.handles) {
    const kill = handle.kill; handle.kill = () => { events.push('kill'); kill(); };
  }
  const run = h.runner.run.getMockImplementation()!;
  h.runner.run.mockImplementation(async (spawn) => { events.push(kindOf(spawn)); return run(spawn); });
  const a = p.closer.close(); const b = p.closer.close(); expect(a).toBe(b); await a;
  expect(events.slice(0, 4)).toEqual(['kill', 'kill', 'kill', 'compose-stop']);
  expect(events.indexOf('scan')).toBeLessThan(events.indexOf('compose-down'));
  expect(events.lastIndexOf('scan')).toBeGreaterThan(events.indexOf('compose-down'));
  await p.closer.close(); expect(events.filter((e) => e === 'compose-down')).toHaveLength(1);
});
it('bounds each teardown command without letting an aggregate timeout race scans against down', async () => {
  const h = track(await fakeProject(vi.fn));
  const p = await createComposedProject(h.options);
  const run = h.runner.run.getMockImplementation()!;
  h.runner.run.mockImplementation(async (spawn) => {
    if (kindOf(spawn) === 'logs') await new Promise((resolve) => setTimeout(resolve, 60000));
    return run(spawn);
  });
  vi.useFakeTimers();
  const close = p.closer.close();
  const assertion = expect(close).resolves.toBeUndefined();
  await vi.advanceTimersByTimeAsync(180000); await assertion;
  expect(h.spawns.map(kindOf).slice(-9)).toEqual(['compose-stop', 'image-history', 'logs', 'export', 'logs', 'export',
    'logs', 'export', 'compose-down']);
});
it('a hanging export is killed on its own bound and remaining scans precede down', async () => {
  const h = track(await fakeProject(vi.fn));
  const p = await createComposedProject(h.options);
  const spawn = h.runner.spawnLongLived.getMockImplementation()!;
  let exported = 0;
  let killed: (() => void) | undefined;
  h.runner.spawnLongLived.mockImplementation((description) => {
    const handle = spawn(description);
    if (kindOf(description) === 'export' && ++exported === 1) {
      handle.exited = new Promise(() => {}); killed = handle.kill;
    }
    return handle;
  });
  vi.useFakeTimers();
  const assertion = expect(p.closer.close()).rejects.toMatchObject({ code: 'command-timeout', command: 'export' });
  await vi.advanceTimersByTimeAsync(COMMAND_TIMEOUT_MS); await assertion;
  expect(killed).toHaveBeenCalledOnce(); expect(exported).toBe(3);
  expect(kindOf(h.spawns.at(-1)!)).toBe('compose-down');
});
it('a hanging injected run is bounded with the variant in command-timeout', async () => {
  const pin = await mintPin(); vi.useFakeTimers();
  const runner = { run: vi.fn(() => new Promise<never>(() => {})), spawnLongLived: vi.fn() };
  const result = runDockerCommand(pin, { kind: 'image-inspect' }, runner);
  const assertion = expect(result).rejects.toMatchObject({ code: 'command-timeout', command: 'image-inspect' });
  await vi.advanceTimersByTimeAsync(COMMAND_TIMEOUT_MS); await assertion;
});
it('the registry kills every registered handle even if one kill throws, and bounds the wait', async () => {
  const registry = new HandleRegistry();
  const first = { kill: vi.fn(() => { throw new Error('untrusted'); }), exited: new Promise<null>(() => {}) };
  const second = { kill: vi.fn(), exited: Promise.resolve(0) };
  registry.register(first); registry.register(first); registry.register(second);
  vi.useFakeTimers();
  const assertion = expect(registry.close(systemClock)).rejects.toMatchObject({ code: 'handle-timeout' });
  await vi.advanceTimersByTimeAsync(KILL_TIMEOUT_MS); await assertion;
  expect(first.kill).toHaveBeenCalledOnce(); expect(second.kill).toHaveBeenCalledOnce();
});
it.each(['compose-stop', 'compose-down'] as const)('closer preserves %s failure, attempts all scans, and remains idempotent', async (code) => {
  const h = track(await fakeProject(vi.fn, { result: (kind) => kind === code
    ? { exitCode: 1, stdout: '', stderr: 'untrusted' } : undefined }));
  const p = await createComposedProject(h.options);
  const closing = p.closer.close();
  await expect(closing).rejects.toMatchObject({ code });
  expect(p.closer.close()).toBe(closing);
  expect(h.spawns.filter((s) => kindOf(s) === 'compose-stop')).toHaveLength(1);
  expect(h.spawns.filter((s) => kindOf(s) === 'compose-down')).toHaveLength(1);
  expect(h.spawns.filter((s) => kindOf(s) === 'export')).toHaveLength(3);
});
it('construction command-timeout invokes the closer exactly once', async () => {
  const h = track(await fakeProject(vi.fn));
  const run = h.runner.run.getMockImplementation()!;
  h.runner.run.mockImplementation((spawn) => kindOf(spawn) === 'compose-up' ? new Promise(() => {}) : run(spawn));
  const timers: (() => void)[] = [];
  h.options.clock = { now: () => 1788600000000, setTimeout: (cb) => { timers.push(cb); return cb; }, clearTimeout: () => {} };
  const p = createComposedProject(h.options);
  const assertion = expect(p).rejects.toMatchObject({ code: 'command-timeout' });
  while (h.runner.run.mock.calls.length < 4) await new Promise<void>((r) => setImmediate(r));
  timers.at(-1)!(); await assertion;
  expect(h.runner.run.mock.calls.map(([s]) => kindOf(s)).filter((k) => k === 'compose-down')).toHaveLength(1);
});
it('bridge death rejects its outstanding request and never reconnects', async () => {
  const h = track(await fakeProject(vi.fn, { peer(handle) {
    handle.stdout.removeAllListeners('data');
    handle.stdin.once('data', () => queueMicrotask(() => handle.stdout.end()));
  } }));
  await expect(capture(h)).rejects.toMatchObject({ code: 'bridge-closed' });
  expect(h.runner.spawnLongLived.mock.calls.filter(([s]) => kindOf(s) === 'exec-bridge')).toHaveLength(1);
});
it('immediately exited exec is exec-spawn and its registered handle is killed once', async () => {
  const h = track(await fakeProject(vi.fn, { peer(handle) { handle.exited = Promise.resolve(1); } }));
  await expect(capture(h)).rejects.toMatchObject({ code: 'exec-spawn' });
  expect(h.handles[0].kill).toHaveBeenCalledOnce();
  expect(h.spawns.filter((s) => kindOf(s) === 'compose-down')).toHaveLength(1);
});
it.each(['exec-spawn', 'handshake-rejected', 'mac-invalid', 'bridge-protocol'] as const)('construction maps %s and closes once', async (code) => {
  const h = track(await fakeProject(vi.fn, { peer(handle) {
    if (code === 'exec-spawn') throw new Error('untrusted');
    const write = handle.stdout.write;
    handle.stdout.write = new Proxy(write, { apply(target, receiver, args) {
      const chunk = args[0] as Buffer;
      let output = chunk;
      if (code === 'bridge-protocol') output = Buffer.from('bad!');
      else {
        const frame = JSON.parse(chunk.subarray(4).toString());
        if (code === 'handshake-rejected') {
          delete frame.body; frame.ok = false; frame.code = 'hello-mismatch';
        } else if (frame.op === 'hello') frame.body.mac = Buffer.alloc(32, 7).toString('base64url');
        const body = Buffer.from(JSON.stringify(frame)); const size = Buffer.alloc(4); size.writeUInt32BE(body.length);
        output = Buffer.concat([size, body]);
      }
      return Reflect.apply(target, receiver, [output, ...args.slice(1)]);
    } });
  } }));
  await expect(capture(h)).rejects.toMatchObject({ code });
  expect(h.spawns.filter((s) => kindOf(s) === 'compose-down')).toHaveLength(1);
});
it('closed-code error constructors cannot interpolate injected secret text', () => {
  const secret = Buffer.from(Array.from({ length: 32 }, (_, i) => 0x80 + i));
  for (const code of [...CONSTRUCTION_CODES, secret.toString('base64url')]) {
    const error = new ComposedConstructionError(code as never, secret.toString('hex') as never,
      undefined, secret.toString('hex') as never);
    expect(String(error)).not.toContain(secret.toString('base64url'));
    expect(JSON.stringify(error)).not.toContain(secret.toString('hex'));
  }
  expect(String(new BridgeError(secret.toString('hex') as never))).toBe('BridgeError: bridge-closed');
});

it('final peer-set check rejects an earlier bridge dying during the third peer handshake', async () => {
  const h = track(await fakeProject(vi.fn, { peer(_handle, index) {
    if (index === 2) h.handles[0].kill();
  } }));
  await expect(createComposedProject(h.options)).rejects.toMatchObject({ code: 'bridge-closed' });
  expect(h.handles).toHaveLength(3);
  expect(h.spawns.filter((s) => kindOf(s) === 'compose-down')).toHaveLength(1);
});
