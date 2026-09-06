// In-memory fixture sessions prove ordering and refusal; hostname prefix matching only refuses mismatches.
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { PassThrough, Writable } from 'node:stream';
import { expect, it, vi } from 'vitest';
import { BridgeSession } from '../bridge';
import { FrameDecoder, encodeFrame } from '../frames';
import { verifyHelloMac, type HelloRequest } from '../handshake';
import type { Body, Frame } from '../protocol';
import { createControlServer } from './control';
import { CapabilityRegistry } from './capabilities';

// Observe mint calls while preserving Node's real CSPRNG; no runtime entropy injection.
vi.mock('node:crypto', async (original) => {
  const crypto = await original<typeof import('node:crypto')>();
  return { ...crypto, randomBytes: vi.fn(crypto.randomBytes) };
});

const pair = generateKeyPairSync('ed25519');
const epoch = '1720000000000-' + 'a'.repeat(32);
const secret = Buffer.alloc(32, 1);
const hello: HelloRequest = { challenge: Buffer.alloc(32, 2).toString('base64url'), epoch,
  fixtureId: 'benign-login', containerId: 'a'.repeat(64) };
function request(id: number, op = 'bootstrap', body: Body = { secret: secret.toString('base64url') }) {
  return encodeFrame({ v: 1, kind: 'req', id, op, body });
}
async function settle() { await new Promise<void>((resolve) => setImmediate(resolve)); }
function setup() {
  const input = new PassThrough();
  const output = new PassThrough();
  const diagnostics = vi.fn();
  const keyPairProvider = vi.fn(() => pair);
  const accept = createControlServer({ fixtureId: 'benign-login', epoch, hostname: 'a'.repeat(12),
    keyPairProvider, diagnostics });
  const frames: Frame[] = [];
  const decoder = new FrameDecoder((frame) => frames.push(frame), (code) => { throw new Error(code); });
  output.on('data', (chunk) => decoder.feed(chunk));
  const session = accept({ input, output })!;
  return { input, output, diagnostics, keyPairProvider, accept, frames, session };
}
async function boot(p: ReturnType<typeof setup>) {
  p.input.write(request(1));
  await settle();
  expect(p.frames).toEqual([{ v: 1, kind: 'res', id: 1, op: 'bootstrap', ok: true, body: {} }]);
}
it('bootstrap then hello uses shared transcript and canonical responses', async () => {
  const p = setup();
  await boot(p);
  p.input.write(request(2, 'hello', hello));
  await settle();
  const response = p.frames[1];
  expect(response).toMatchObject({ id: 2, op: 'hello', ok: true });
  if (response.kind !== 'res' || !response.ok) throw new Error('body-shape');
  verifyHelloMac(secret, { challenge: Buffer.from(hello.challenge, 'base64url'), epoch,
    fixtureId: hello.fixtureId, containerId: hello.containerId,
    publicKeyDer: Buffer.from(response.body.publicKey as string, 'base64url') },
  Buffer.from(response.body.mac as string, 'base64url'));
  expect(p.keyPairProvider).toHaveBeenCalledTimes(1);
  p.session.close();
});
it('real host and control sessions complete over paired PassThrough streams', async () => {
  const p = setup();
  const host = new BridgeSession({ stdin: p.input, stdout: p.output }, { kill: () => p.session.close() });
  await host.sendBootstrap(Buffer.alloc(32, 1));
  expect((await host.hello(hello)).asymmetricKeyType).toBe('ed25519');
  host.close();
});
it('coalesced bootstrap plus hello is pipelined before either success response', async () => {
  const p = setup();
  p.input.write(Buffer.concat([request(1), request(2, 'hello', hello)]));
  await settle();
  expect(p.diagnostics).toHaveBeenCalledWith('pipelined');
  expect(p.session.closed).toBe(true);
  expect(p.frames).toEqual([{ v: 1, kind: 'res', id: 2, op: 'hello', ok: false, code: 'pipelined' }]);
  expect(p.keyPairProvider).not.toHaveBeenCalled();
});
it('inFlight lasts until response write callback even with a delayed writer', async () => {
  const input = new PassThrough();
  const diagnostics = vi.fn();
  let finish: (() => void) | undefined;
  const output = new Writable({ write(_chunk, _encoding, callback) { finish = callback; } });
  const accept = createControlServer({ fixtureId: 'benign-login', epoch, hostname: 'a'.repeat(12),
    keyPairProvider: () => pair, diagnostics });
  const session = accept({ input, output })!;
  input.write(request(1));
  await settle();
  input.write(request(2, 'hello', hello));
  expect(diagnostics).toHaveBeenCalledWith('pipelined');
  expect(session.closed).toBe(true);
  finish?.();
});
it('non-increasing request id closes independently of inFlight and op order', async () => {
  const p = setup();
  await boot(p);
  p.input.write(request(1, 'hello', hello));
  expect(p.diagnostics).toHaveBeenCalledWith('duplicate-id');
  expect(p.session.closed).toBe(true);
});
it('wrong kind container closes before correlation', () => {
  const p = setup();
  p.input.write(encodeFrame({ v: 1, kind: 'res', id: 1, op: 'bootstrap', ok: true, body: {} }));
  expect(p.diagnostics).toHaveBeenCalledWith('frame-kind');
});
it.each([
  ['hello before bootstrap', request(2, 'hello', hello)],
  ['bootstrap wrong id', request(2)],
])('%s is protocol-order', (_name, bytes) => {
  const p = setup();
  p.input.write(bytes);
  expect(p.diagnostics).toHaveBeenCalledWith('protocol-order');
  expect(p.session.closed).toBe(true);
});
it('second bootstrap is protocol-order after a completed first response', async () => {
  const p = setup();
  await boot(p);
  p.input.write(request(2));
  expect(p.diagnostics).toHaveBeenCalledWith('protocol-order');
});
it('unknown op closes with a closed diagnostic in every state', async () => {
  for (const state of [0, 1, 2]) {
    const p = setup();
    if (state > 0) await boot(p);
    if (state > 1) { p.input.write(request(2, 'hello', hello)); await settle(); }
    const json = JSON.stringify({ v: 1, kind: 'req', id: state + 1, op: 'unknown', body: {} });
    const size = Buffer.alloc(4);
    size.writeUInt32BE(Buffer.byteLength(json));
    p.input.write(Buffer.concat([size, Buffer.from(json)]));
    expect(p.diagnostics).toHaveBeenCalledWith('unknown-op');
    expect(p.session.closed).toBe(true);
  }
});
it.each([
  ['epoch mismatch', { ...hello, epoch: '1720000000001-' + 'a'.repeat(32) }, 'hello-mismatch'],
  ['fixtureId mismatch', { ...hello, fixtureId: 'lookalike-origin' }, 'hello-mismatch'],
  ['hostname not prefix', { ...hello, containerId: 'b'.repeat(64) }, 'hostname-mismatch'],
  ['nonhex containerId', { ...hello, containerId: 'service' }, 'body-shape'],
  ['extra hello field', { ...hello, extra: '' }, 'body-shape'],
  ['short challenge', { ...hello, challenge: 'AA' }, 'challenge-shape'],
] as const)('%s refuses before key retrieval', async (_name, body, code) => {
  const p = setup();
  await boot(p);
  p.input.write(request(2, 'hello', body));
  await settle();
  expect(p.diagnostics).toHaveBeenCalledWith(code);
  expect(p.frames[1]).toMatchObject({ ok: false, code });
  expect(p.keyPairProvider).not.toHaveBeenCalled();
});
it('malformed then valid never installs a bootstrap secret or sends success', async () => {
  const p = setup();
  p.input.write(Buffer.concat([Buffer.alloc(4), request(1)]));
  await settle();
  expect(p.diagnostics).toHaveBeenCalledExactlyOnceWith('frame-length');
  expect(p.frames).toEqual([]);
});
it('container partial EOF reports frame-partial', () => {
  const p = setup();
  p.input.write(Buffer.from([0]));
  p.input.emit('end');
  expect(p.diagnostics).toHaveBeenCalledExactlyOnceWith('frame-partial');
});
it('one connection slot remains consumed after session close', () => {
  const p = setup();
  for (const closed of [false, true]) {
    if (closed) p.session.close();
    const input = new PassThrough();
    const output = new PassThrough();
    expect(p.accept({ input, output })).toBeUndefined();
    expect(input.destroyed).toBe(true);
    expect(output.writableEnded).toBe(true);
  }
  expect(p.diagnostics).toHaveBeenCalledWith('bridge-closed');
});

// These callbacks deliberately model the Job B adapter only. The registry, dispatch, streams and
// validation are production code; HTTP admission/drain/capture storage acceptance remains Jobs B/D.
function operations() {
  const receipts = new Map<string, string>();
  return {
    registerRun: vi.fn(async (setup: { runId: string }) => { receipts.set(setup.runId, `receipt-${setup.runId}`); }),
    takeReceipt: vi.fn(async (runId: string) => receipts.get(runId)),
    capture: vi.fn(async (runId: string, kind: string) => Buffer.from(`${runId}:${kind}`)),
    finalizeRun: vi.fn(async (_runId: string) => {}),
    acknowledgeReceipt: vi.fn(async (runId: string) => { receipts.delete(runId); }),
    attestEvents: vi.fn(async (runId: string, bytes: Uint8Array) => `${runId}:${Buffer.from(bytes).toString()}`),
    readPublicKey: vi.fn(async (_runId: string) => pair.publicKey),
  };
}
async function connected(opts: { fixtureId?: HelloRequest['fixtureId']; epoch?: string } = {}) {
  const input = new PassThrough(), output = new PassThrough();
  const ops = operations(), diagnostics = vi.fn();
  const session = createControlServer({ fixtureId: opts.fixtureId ?? hello.fixtureId, epoch: opts.epoch ?? epoch,
    hostname: 'a'.repeat(12), keyPairProvider: () => pair, diagnostics, operations: ops })({ input, output })!;
  const host = new BridgeSession({ stdin: input, stdout: output }, { kill: () => session.close() });
  await host.sendBootstrap(Buffer.alloc(32, 1));
  await host.hello({ ...hello, ...opts });
  await settle();
  const context = { epoch: opts.epoch ?? epoch, fixtureId: opts.fixtureId ?? hello.fixtureId };
  const register = (runId = 'A') => host.request('register', { ...context, scenarioId: 'scenario', runId,
    nonce: 'nonce', canaryId: 'canary-id', canary: 'synthetic' });
  return { input, output, ops, diagnostics, session, host, register, context };
}
function auth(p: Awaited<ReturnType<typeof connected>>, tokens: Body, op: string, runId = 'A') {
  return { ...p.context, runId, capability: tokens[op] };
}
it('paired sessions dispatch all seven operations with exact run and capture-kind targets', async () => {
  const p = await connected();
  expect(p.host.completedRequests).toBe(2);
  const a = await p.register('A'), b = await p.register('B');
  expect(p.ops.registerRun.mock.calls[0][0]).toEqual({ scenarioId: 'scenario', runId: 'A', nonce: 'nonce', canaryId: 'canary-id', canary: 'synthetic' });
  expect(await p.host.request('receipt', auth(p, a, 'receipt'))).toEqual({ receipt: 'receipt-A' });
  expect(await p.host.request('receipt', auth(p, a, 'receipt'))).toEqual({ receipt: 'receipt-A' });
  expect(await p.host.request('receipt', auth(p, b, 'receipt', 'B'))).toEqual({ receipt: 'receipt-B' });
  for (const [tokens, runId] of [[a, 'A'], [b, 'B']] as const) {
    expect(await p.host.request('key', auth(p, tokens, 'key', runId))).toEqual({ publicKey: pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64url') });
    expect(await p.host.request('finalize', auth(p, tokens, 'finalize', runId))).toEqual({});
    for (const kind of ['requests', 'unauthorized']) {
      const query = { ...auth(p, tokens, 'capture', runId), kind, offset: '0' };
      const first = await p.host.request('capture', query);
      expect(Buffer.from(first.bytes as string, 'base64url').toString()).toBe(`${runId}:${kind}`);
      // Discard and reread the same offset under a new request id.
      expect(await p.host.request('capture', query)).toEqual(first);
    }
    expect(await p.host.request('attest', { ...auth(p, tokens, 'attest', runId), events: Buffer.from('events').toString('base64url') })).toEqual({ attestation: `${runId}:events` });
    await p.host.request('ack', auth(p, tokens, 'ack', runId));
  }
  expect(p.ops.finalizeRun.mock.calls).toEqual([['A'], ['B']]);
  expect(p.ops.acknowledgeReceipt.mock.calls).toEqual([['A'], ['B']]);
  expect(p.ops.readPublicKey.mock.calls).toEqual([['A'], ['B']]);
  p.host.close();
});
it('absent receipt does not cache absence and acknowledgement revokes its read token', async () => {
  const p = await connected(), a = await p.register();
  p.ops.takeReceipt.mockResolvedValueOnce(undefined);
  expect(await p.host.request('receipt', auth(p, a, 'receipt'))).toEqual({ receipt: '' });
  expect(await p.host.request('receipt', auth(p, a, 'receipt'))).toEqual({ receipt: 'receipt-A' });
  await p.host.request('finalize', auth(p, a, 'finalize'));
  await p.host.request('ack', auth(p, a, 'ack'));
  await expect(p.host.request('receipt', auth(p, a, 'receipt'))).rejects.toMatchObject({ code: 'capability-refused' });
  expect(p.ops.takeReceipt).toHaveBeenCalledTimes(2);
});
it.each(['capture', 'attest', 'ack'] as const)('real dispatch refuses %s before finalization without invoking work', async (op) => {
  const p = await connected(), a = await p.register();
  const body = { ...auth(p, a, op), ...(op === 'capture' ? { kind: 'requests', offset: '0' } : op === 'attest' ? { events: '' } : {}) };
  await expect(p.host.request(op, body)).rejects.toMatchObject({ code: 'run-state' });
  expect(p.ops.capture).not.toHaveBeenCalled(); expect(p.ops.attestEvents).not.toHaveBeenCalled();
  expect(p.ops.acknowledgeReceipt).not.toHaveBeenCalled();
});
it.each(['finalize', 'ack', 'attest'] as const)('real dispatch %s single-use rejects a queued replay', async (op) => {
  const p = await connected(), a = await p.register();
  if (op !== 'finalize') await p.host.request('finalize', auth(p, a, 'finalize'));
  const body = { ...auth(p, a, op), ...(op === 'attest' ? { events: '' } : {}) };
  const first = p.host.request(op, body), second = p.host.request(op, body);
  const rejection = expect(second).rejects.toMatchObject({ code: 'capability-refused' });
  await first; await rejection;
  expect(p.ops[op === 'finalize' ? 'finalizeRun' : op === 'ack' ? 'acknowledgeReceipt' : 'attestEvents']).toHaveBeenCalledTimes(1);
});
it('raw pipelining during an awaited operation closes without a second callback', async () => {
  const p = await connected(), a = await p.register();
  let release!: () => void;
  p.ops.finalizeRun.mockImplementation(() => new Promise<void>((resolve) => { release = resolve; }));
  const first = p.host.request('finalize', auth(p, a, 'finalize'));
  await settle(); await settle();
  expect(p.ops.finalizeRun).toHaveBeenCalledExactlyOnceWith('A');
  // Raw pipelining during the await is terminal, never a second callback.
  const wire: Frame[] = [];
  const decoder = new FrameDecoder((frame) => wire.push(frame), () => {});
  p.output.on('data', (chunk) => decoder.feed(chunk));
  const check = expect(first).rejects.toMatchObject({ code: 'id-mismatch' });
  p.input.write(request(5, 'finalize', auth(p, a, 'finalize')));
  await check; release(); await settle();
  expect(wire).toContainEqual({ v: 1, kind: 'res', id: 5, op: 'finalize', ok: false, code: 'pipelined' });
  expect(p.ops.finalizeRun).toHaveBeenCalledTimes(1);
  expect(p.session.closed).toBe(true);
});
it.each(['run', 'fixture', 'epoch', 'operation', 'unknown'] as const)('raw established %s confusion is refused before callback dispatch', async (which) => {
  const p = await connected(), a = await p.register(); await p.register('B'); await settle();
  p.output.removeAllListeners('data');
  const body = { ...auth(p, a, 'receipt'), ...(which === 'run' ? { runId: 'B' } : which === 'unknown' ? { runId: 'unknown' }
    : which === 'fixture' ? { fixtureId: 'lookalike-origin' } : which === 'epoch' ? { epoch: '2-' + 'b'.repeat(32) }
      : { capability: a.key }) };
  p.input.write(request(5, 'receipt', body)); await settle();
  expect(p.diagnostics).toHaveBeenCalledWith('capability-refused');
  expect(p.ops.takeReceipt).not.toHaveBeenCalled();
});
it('fresh authenticated control instances and evals reject old authority for the recurring run id', async () => {
  const old = await connected(), a = await old.register(); old.host.close();
  for (const opts of [{}, { epoch: '2-' + 'b'.repeat(32) }, { fixtureId: 'lookalike-origin' as const }]) {
    const p = await connected(opts); await p.register();
    await expect(p.host.request('receipt', auth(p, a, 'receipt'))).rejects.toMatchObject({ code: 'capability-refused' });
    expect(p.ops.takeReceipt).not.toHaveBeenCalled();
  }
});
it('registration limit is enforced in actual dispatch before the adapter', async () => {
  const p = await connected();
  for (let i = 0; i < 32; i++) await p.register(`run-${i}`);
  await expect(p.register('run-33')).rejects.toMatchObject({ code: 'control-limit' });
  expect(p.ops.registerRun).toHaveBeenCalledTimes(32);
});
it('duplicate finalized registration is refused before the adapter', async () => {
  const p = await connected(), a = await p.register();
  await p.host.request('finalize', auth(p, a, 'finalize'));
  await expect(p.register()).rejects.toMatchObject({ code: 'run-state' });
  expect(p.ops.registerRun).toHaveBeenCalledTimes(1);
});
it('key read invokes the trusted primitive and refuses a changed key', async () => {
  const p = await connected(), a = await p.register();
  p.ops.readPublicKey.mockResolvedValue(generateKeyPairSync('ed25519').publicKey);
  await expect(p.host.request('key', auth(p, a, 'key'))).rejects.toMatchObject({ code: 'key-mismatch' });
  expect(p.ops.readPublicKey).toHaveBeenCalledExactlyOnceWith('A');
});
it.each(['oversize', 'changed-total', 'past-end'] as const)('server rejects %s capture output', async (bad) => {
  const p = await connected(), a = await p.register();
  await p.host.request('finalize', auth(p, a, 'finalize'));
  const query = { ...auth(p, a, 'capture'), kind: 'requests', offset: '0' };
  if (bad === 'changed-total') {
    await p.host.request('capture', query); p.ops.capture.mockResolvedValue(Buffer.from('different'));
  }
  if (bad === 'oversize') p.ops.capture.mockResolvedValue(Buffer.alloc(8 * 1024 * 1024 + 1));
  if (bad === 'past-end') query.offset = '100';
  await expect(p.host.request('capture', query)).rejects.toMatchObject({ code: bad === 'oversize' ? 'control-limit' : bad === 'changed-total' ? 'run-state' : 'body-shape' });
});
it('capture chunks stop at 65536 bytes and empty streams remain distinguishable', async () => {
  const p = await connected(), a = await p.register();
  await p.host.request('finalize', auth(p, a, 'finalize'));
  p.ops.capture.mockImplementation(async (_run, kind) => kind === 'requests' ? Buffer.alloc(65537, 9) : Buffer.alloc(0));
  const query = { ...auth(p, a, 'capture'), kind: 'requests', offset: '0' };
  const first = await p.host.request('capture', query);
  expect(first).toEqual({ bytes: Buffer.alloc(65536, 9).toString('base64url'), total: '65537', next: '65536' });
  expect(await p.host.request('capture', { ...query, offset: '65536' })).toEqual({ bytes: 'CQ', total: '65537', next: '65537' });
  expect(await p.host.request('capture', { ...query, kind: 'unauthorized' })).toEqual({ bytes: '', total: '0', next: '0' });
  p.host.close();
});
it('adapter failure closes queued work with closed errors and never restores a failed operation', async () => {
  const p = await connected(), a = await p.register();
  p.ops.finalizeRun.mockRejectedValue(new Error('synthetic secret details'));
  const first = p.host.request('finalize', auth(p, a, 'finalize'));
  const queued = p.host.request('receipt', auth(p, a, 'receipt'));
  await Promise.all([expect(first).rejects.toMatchObject({ message: 'bridge-closed' }), expect(queued).rejects.toMatchObject({ message: 'bridge-closed' })]);
  expect(p.ops.takeReceipt).not.toHaveBeenCalled();
});
it('missing operation adapter retains both handshake frames and refuses administrative work', async () => {
  const p = setup();
  const host = new BridgeSession({ stdin: p.input, stdout: p.output }, { kill: () => p.session.close() });
  await host.sendBootstrap(Buffer.alloc(32, 1)); await host.hello(hello);
  await expect(host.request('register', { epoch, fixtureId: hello.fixtureId, scenarioId: 'scenario', runId: 'A', nonce: 'nonce', canaryId: 'id', canary: 'synthetic' })).rejects.toMatchObject({ code: 'run-state' });
});
it('raw malformed setup followed by valid setup never reaches the adapter', async () => {
  const p = await connected();
  p.output.removeAllListeners('data');
  p.input.write(Buffer.concat([request(3, 'register', { ...p.context, scenarioId: 's', runId: 'A\n', nonce: 'n', canaryId: 'i', canary: 'c' }),
    request(4, 'register', { ...p.context, scenarioId: 's', runId: 'A', nonce: 'n', canaryId: 'i', canary: 'c' })]));
  await settle(); expect(p.ops.registerRun).not.toHaveBeenCalled();
  expect(p.diagnostics).toHaveBeenCalledWith('body-shape');
});

it.each([59999, 60000])('actual server clock admits/refuses receipt at registration plus %i ms', async (elapsed) => {
  const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
  const p = await connected(), a = await p.register();
  try {
    clock.mockReturnValue(1000 + elapsed);
    if (elapsed < 60000) {
      expect(await p.host.request('receipt', auth(p, a, 'receipt'))).toEqual({ receipt: 'receipt-A' });
      expect(p.ops.takeReceipt).toHaveBeenCalledExactlyOnceWith('A');
    } else {
      await expect(p.host.request('receipt', auth(p, a, 'receipt'))).rejects.toMatchObject({ code: 'capability-refused' });
      expect(p.ops.takeReceipt).not.toHaveBeenCalled();
    }
  } finally { p.host.close(); clock.mockRestore(); }
});
it('server validates adapter response before writing a success frame', async () => {
  const p = await connected(), a = await p.register(); await settle();
  p.ops.takeReceipt.mockResolvedValue({ secret: 'synthetic' } as never);
  p.output.removeAllListeners('data');
  const frames: Frame[] = [];
  const decoder = new FrameDecoder((frame) => frames.push(frame), () => {});
  p.output.on('data', (bytes) => decoder.feed(bytes));
  p.input.write(request(4, 'receipt', auth(p, a, 'receipt'))); await settle();
  expect(frames).toEqual([{ v: 1, kind: 'res', id: 4, op: 'receipt', ok: false, code: 'body-shape' }]);
  expect(p.session.closed).toBe(true);
});
it('oversized signer output fails the unchanged frame ceiling without a truncated success', async () => {
  const p = await connected(), a = await p.register();
  await p.host.request('finalize', auth(p, a, 'finalize'));
  p.ops.attestEvents.mockResolvedValue('x'.repeat(262144));
  await expect(p.host.request('attest', { ...auth(p, a, 'attest'), events: '' })).rejects.toMatchObject({ code: 'frame-length' });
});

it.each(['finalize', 'ack', 'attest'] as const)('dispatch consumes %s before entering its trusted callback', async (op) => {
  const p = await connected(), a = await p.register();
  if (op !== 'finalize') await p.host.request('finalize', auth(p, a, 'finalize'));
  let current: CapabilityRegistry | undefined;
  const original = CapabilityRegistry.prototype.authorize;
  const observer = vi.spyOn(CapabilityRegistry.prototype, 'authorize').mockImplementation(function (this: CapabilityRegistry, ...args) {
    current = this;
    return original.apply(this, args);
  });
  const atEntry = vi.fn(() => {
    expect(current).toBeDefined();
    expect(() => original.call(current!, { ...p.context, runId: 'A' }, op, a[op] as string)).toThrow('capability-refused');
  });
  if (op === 'finalize') p.ops.finalizeRun.mockImplementation(async () => { atEntry(); });
  if (op === 'ack') p.ops.acknowledgeReceipt.mockImplementation(async () => { atEntry(); });
  if (op === 'attest') p.ops.attestEvents.mockImplementation(async () => { atEntry(); return 'attestation'; });
  try {
    await p.host.request(op, { ...auth(p, a, op), ...(op === 'attest' ? { events: '' } : {}) });
    expect(atEntry).toHaveBeenCalledOnce();
  } finally { observer.mockRestore(); p.host.close(); }
});
it('raw server rejects capture offset beyond total without relying on the BridgeSession client', async () => {
  const p = await connected(), a = await p.register();
  await p.host.request('finalize', auth(p, a, 'finalize')); await settle();
  p.output.removeAllListeners('data');
  const frames: Frame[] = [];
  const decoder = new FrameDecoder((frame) => frames.push(frame), () => {});
  p.output.on('data', (bytes) => decoder.feed(bytes));
  p.input.write(request(5, 'capture', { ...auth(p, a, 'capture'), kind: 'requests', offset: '100' })); await settle();
  expect(frames).toEqual([{ v: 1, kind: 'res', id: 5, op: 'capture', ok: false, code: 'body-shape' }]);
});

it.each(['epoch', 'fixtureId'] as const)('raw register refuses valid-but-wrong %s before token mint or adapter dispatch', async (field) => {
  const p = await connected();
  p.output.removeAllListeners('data');
  const frames: Frame[] = [];
  const decoder = new FrameDecoder((frame) => frames.push(frame), () => {});
  p.output.on('data', (bytes) => decoder.feed(bytes));
  vi.mocked(randomBytes).mockClear(); // Exclude the already-created control-instance nonce.
  try {
    p.input.write(request(3, 'register', { ...p.context, scenarioId: 'scenario', runId: 'A', nonce: 'nonce',
      canaryId: 'id', canary: 'synthetic', [field]: field === 'epoch' ? '2-' + 'b'.repeat(32) : 'lookalike-origin' }));
    await settle();
    // Failure diffs inspect only fixed metadata, never minted response tokens.
    expect(frames.map((frame) => frame.kind === 'res'
      ? { id: frame.id, op: frame.op, ok: frame.ok, code: frame.ok ? undefined : frame.code }
      : { kind: frame.kind })).toEqual([{ id: 3, op: 'register', ok: false, code: 'capability-refused' }]);
    expect(randomBytes).not.toHaveBeenCalled();
    expect(p.ops.registerRun).not.toHaveBeenCalled();
    expect(p.session.closed).toBe(true);
  } finally { p.host.close(); }
});
it('raw register with matching session scope mints six tokens and invokes the adapter', async () => {
  const p = await connected();
  p.output.removeAllListeners('data');
  const frames: Frame[] = [];
  const decoder = new FrameDecoder((frame) => frames.push(frame), () => {});
  p.output.on('data', (bytes) => decoder.feed(bytes));
  vi.mocked(randomBytes).mockClear();
  try {
    p.input.write(request(3, 'register', { ...p.context, scenarioId: 'scenario', runId: 'A', nonce: 'nonce',
      canaryId: 'id', canary: 'synthetic' }));
    await settle();
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ v: 1, kind: 'res', id: 3, op: 'register', ok: true });
    expect(vi.mocked(randomBytes).mock.calls).toEqual(Array.from({ length: 6 }, () => [32]));
    expect(p.ops.registerRun).toHaveBeenCalledExactlyOnceWith({ scenarioId: 'scenario', runId: 'A', nonce: 'nonce',
      canaryId: 'id', canary: 'synthetic' });
    expect(p.session.closed).toBe(false);
  } finally { p.host.close(); }
});
