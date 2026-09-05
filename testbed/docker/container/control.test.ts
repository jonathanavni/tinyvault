// In-memory fixture sessions prove ordering and refusal; hostname prefix matching only refuses mismatches.
import { generateKeyPairSync } from 'node:crypto';
import { PassThrough, Writable } from 'node:stream';
import { expect, it, vi } from 'vitest';
import { BridgeSession } from '../bridge';
import { FrameDecoder, encodeFrame } from '../frames';
import { verifyHelloMac, type HelloRequest } from '../handshake';
import type { Body, Frame } from '../protocol';
import { createControlServer } from './control';

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
    const json = JSON.stringify({ v: 1, kind: 'req', id: state + 1, op: 'register', body: {} });
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
