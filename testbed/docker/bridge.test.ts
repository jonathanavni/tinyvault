// Fake-peer sessions prove host close/correlation and MAC checks; no process or endpoint is exercised.
import { generateKeyPairSync } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { expect, it, vi } from 'vitest';
import { BridgeSession, type BridgeClock } from './bridge';
import { FrameDecoder, encodeFrame } from './frames';
import { computeHelloMac, type HelloRequest } from './handshake';
import type { Body, BridgeCode, Frame } from './protocol';

const epoch = '1720000000000-' + 'a'.repeat(32);
const hello: HelloRequest = { challenge: Buffer.alloc(32, 2).toString('base64url'), epoch,
  fixtureId: 'benign-login', containerId: 'a'.repeat(64) };
const publicKeyDer = generateKeyPairSync('ed25519').publicKey.export({ format: 'der', type: 'spki' });
function setup() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const kill = vi.fn();
  const callbacks = new Set<() => void>();
  const clock: BridgeClock = {
    setTimeout: vi.fn((cb: () => void) => { callbacks.add(cb); return cb; }),
    clearTimeout: (handle) => { callbacks.delete(handle as () => void); },
  };
  const sent: Frame[] = [];
  const decoder = new FrameDecoder((frame) => sent.push(frame), () => { throw new Error('frame-type'); });
  stdin.on('data', (bytes) => decoder.feed(bytes));
  const bridge = new BridgeSession({ stdin, stdout }, { kill, clock });
  return { stdin, stdout, kill, clock, sent, bridge,
    tick: () => { for (const cb of [...callbacks]) cb(); } };
}
function success(id = 1, op = 'bootstrap', body: Body = {}): Buffer {
  return encodeFrame({ v: 1, kind: 'res', id, op, ok: true, body });
}
function announcement(secret: Buffer, expected = hello): Body {
  return { publicKey: publicKeyDer.toString('base64url'), mac: computeHelloMac(secret, {
    challenge: Buffer.from(expected.challenge, 'base64url'), epoch: expected.epoch,
    fixtureId: expected.fixtureId, containerId: expected.containerId, publicKeyDer,
  }).toString('base64url') };
}
async function boot(p: ReturnType<typeof setup>, secret = Buffer.alloc(32, 1)) {
  const request = p.bridge.sendBootstrap(secret);
  p.stdout.write(success());
  await request;
  await new Promise<void>((resolve) => setImmediate(resolve));
  return secret;
}
function expectClosed(p: ReturnType<typeof setup>, code: BridgeCode): void {
  expect(p.bridge.closingCode).toBe(code);
  expect(p.bridge.closed).toBe(true);
  expect(p.kill).toHaveBeenCalledTimes(1);
}
it('mutex serializes ids 1 and 2 and verifies a valid hello', async () => {
  const p = setup();
  const secret = Buffer.alloc(32, 1);
  const a = p.bridge.sendBootstrap(secret);
  const b = p.bridge.hello(hello);
  expect(p.sent.map((frame) => frame.id)).toEqual([1]);
  p.stdout.write(success());
  await a;
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(p.sent.map((frame) => frame.id)).toEqual([1, 2]);
  p.stdout.write(success(2, 'hello', announcement(secret)));
  expect((await b).asymmetricKeyType).toBe('ed25519');
  p.tick();
  expect(p.bridge.closed).toBe(false);
  p.bridge.close();
});
it('idle never-issued response is unsolicited', () => {
  const p = setup();
  p.stdout.write(success());
  expectClosed(p, 'unsolicited');
});
it('accepted response clears outstanding before coalesced never-issued response', async () => {
  const p = setup();
  const pending = p.bridge.sendBootstrap(Buffer.alloc(32, 1));
  p.stdout.write(Buffer.concat([success(), success(2)]));
  await pending;
  expectClosed(p, 'unsolicited');
});
it('idle duplicate precedes unsolicited in ordered classification', async () => {
  const p = setup();
  await boot(p);
  p.stdout.write(success());
  expectClosed(p, 'duplicate-id');
});
it('duplicate with an outstanding request is duplicate-id', async () => {
  const p = setup();
  await boot(p);
  const pending = p.bridge.hello(hello);
  const rejected = expect(pending).rejects.toMatchObject({ code: 'duplicate-id' });
  p.stdout.write(success());
  await rejected;
  expectClosed(p, 'duplicate-id');
});
it.each([
  ['future id', success(2), 'id-mismatch'],
  ['correlated wrong op', success(1, 'hello', { publicKey: 'x', mac: 'x' }), 'op-mismatch'],
  ['wrong kind host', encodeFrame({ v: 1, kind: 'req', id: 1, op: 'bootstrap', body: { secret: 'x' } }), 'frame-kind'],
  ['body shape after correlation', success(1, 'bootstrap', { extra: 'x' }), 'body-shape'],
  ['closed peer refusal', encodeFrame({ v: 1, kind: 'res', id: 1, op: 'bootstrap', ok: false, code: 'protocol-order' }), 'protocol-order'],
] as const)('%s closes with its own code', async (_name, bytes, code) => {
  const p = setup();
  const pending = p.bridge.sendBootstrap(Buffer.alloc(32, 1));
  const rejected = expect(pending).rejects.toMatchObject({ code });
  p.stdout.write(bytes);
  await rejected;
  expectClosed(p, code);
  await expect(p.bridge.request('bootstrap', {})).rejects.toMatchObject({ code: 'bridge-closed' });
});
it('timeout closes outstanding and queued second call then ignores late response', async () => {
  const p = setup();
  const first = p.bridge.sendBootstrap(Buffer.alloc(32, 1));
  const second = p.bridge.hello(hello);
  const a = expect(first).rejects.toMatchObject({ code: 'bridge-timeout' });
  const b = expect(second).rejects.toMatchObject({ code: 'bridge-closed' });
  expect(p.clock.setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);
  p.tick();
  await Promise.all([a, b]);
  expectClosed(p, 'bridge-timeout');
  p.stdout.write(success());
  await expect(p.bridge.hello(hello)).rejects.toMatchObject({ code: 'bridge-closed' });
  expect(p.sent).toHaveLength(1);
});
it('atomic close stops coalesced dispatch and kills only after draining queued waiters', async () => {
  const p = setup();
  const a = p.bridge.sendBootstrap(Buffer.alloc(32, 1));
  const b = p.bridge.hello(hello);
  const checks = [expect(a).rejects.toMatchObject({ code: 'id-mismatch' }),
    expect(b).rejects.toMatchObject({ code: 'bridge-closed' })];
  p.kill.mockImplementation(() => {
    expect(p.bridge.closed).toBe(true);
    p.stdout.write(success());
  });
  p.stdout.write(Buffer.concat([success(3), success()]));
  await Promise.all(checks);
  expectClosed(p, 'id-mismatch');
  expect(p.sent).toHaveLength(1);
});
it.each(['end', 'close', 'error'] as const)('bridge death via %s rejects outstanding without reconnect', async (event) => {
  const p = setup();
  const pending = p.bridge.sendBootstrap(Buffer.alloc(32, 1));
  const check = expect(pending).rejects.toMatchObject({ code: 'bridge-closed' });
  p.stdout.emit(event, new Error('synthetic peer error'));
  await check;
  expectClosed(p, 'bridge-closed');
  expect(p.sent).toHaveLength(1);
});
it('partial EOF closes with frame-partial before generic bridge death', async () => {
  const p = setup();
  const pending = p.bridge.sendBootstrap(Buffer.alloc(32, 1));
  const check = expect(pending).rejects.toMatchObject({ code: 'frame-partial' });
  p.stdout.write(Buffer.from([0, 0]));
  p.stdout.emit('end');
  await check;
  expectClosed(p, 'frame-partial');
});
it.each([
  ['zero length', Buffer.alloc(4), 'frame-length'],
  ['oversize', Buffer.from([0, 4, 0, 1]), 'frame-length'],
  ['stdout diagnostic', Buffer.from('diagnostic\n'), 'frame-length'],
  ['invalid utf8', Buffer.from([0, 0, 0, 1, 255]), 'frame-utf8'],
  ['malformed then valid', Buffer.concat([Buffer.from([0, 0, 0, 1, 123]), success()]), 'frame-canonical'],
] as const)('host decoder propagates %s and stops the session', async (_name, bytes, code) => {
  const p = setup();
  const pending = p.bridge.sendBootstrap(Buffer.alloc(32, 1));
  const check = expect(pending).rejects.toMatchObject({ code });
  p.stdout.write(bytes);
  await check;
  expectClosed(p, code);
});
it.each([
  ['missing MAC', (body: Body) => ({ publicKey: body.publicKey }), 'body-shape'],
  ['wrong MAC', (body: Body) => ({ ...body, mac: Buffer.alloc(32).toString('base64url') }), 'mac-invalid'],
  ['short MAC', (body: Body) => ({ ...body, mac: 'AA' }), 'mac-shape'],
  ['trailing key', (body: Body) => ({ ...body, publicKey: Buffer.concat([publicKeyDer, Buffer.from([0])]).toString('base64url') }), 'key-shape'],
  ['extra hello field', (body: Body) => ({ ...body, extra: '' }), 'body-shape'],
] as const)('fake peer %s fails host session verification', async (_name, mutate, code) => {
  const p = setup();
  const secret = await boot(p);
  const pending = p.bridge.hello(hello);
  const check = expect(pending).rejects.toMatchObject({ code });
  p.stdout.write(success(2, 'hello', mutate(announcement(secret))));
  await check;
  expectClosed(p, code);
});
it('fake peer replay fails against the hosts fresh challenge', async () => {
  const p = setup();
  const secret = await boot(p);
  const fresh = { ...hello, challenge: Buffer.alloc(32, 3).toString('base64url') };
  const pending = p.bridge.hello(fresh);
  const check = expect(pending).rejects.toMatchObject({ code: 'mac-invalid' });
  p.stdout.write(success(2, 'hello', announcement(secret)));
  await check;
});
it('close zeroes the actual caller secret holder even after bootstrap success', async () => {
  const p = setup();
  const holder = { secret: Buffer.alloc(32, 1) };
  await boot(p, holder.secret);
  p.bridge.close();
  expect(holder.secret).toEqual(Buffer.alloc(32));
  // This inspects the Buffer only, not the GC lifetime of the encoded bootstrap string.
});
it('host rejects repeated bootstrap and hello before bootstrap with protocol-order', async () => {
  const p = setup();
  await expect(p.bridge.hello(hello)).rejects.toMatchObject({ code: 'protocol-order' });
  const q = setup();
  await boot(q);
  await expect(q.bridge.sendBootstrap(Buffer.alloc(32))).rejects.toMatchObject({ code: 'protocol-order' });
});
