// One in-memory request at a time, with atomic terminal failure. This session neither creates peers nor
// proves provenance; MAC acceptance binds possession to the harness's expected session and announced key.
import type { KeyObject } from 'node:crypto';
import type { Readable, Writable } from 'node:stream';
import { FrameDecoder, encodeFrame } from './frames';
import {
  decodeBase64url, encodeBase64url, importAnnouncedKey, validateBody, verifyHelloMac, type HelloRequest,
} from './handshake';
import { BridgeError, errorCode, type Body, type BridgeCode, type BridgeOp, type Frame } from './protocol';

export interface BridgeClock {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
const systemClock: BridgeClock = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
export type BridgeStreams = { stdin: Writable; stdout: Readable };
type Waiter = {
  op: BridgeOp; body: Body; resolve: (body: Body) => void; reject: (error: BridgeError) => void;
};
type Pending = Waiter & { id: number; timer?: unknown };

export class BridgeSession {
  #closed = false;
  #closingCode: BridgeCode | undefined;
  #completedHighWater = 0;
  #nextId = 1;
  #outstanding: Pending | undefined;
  #settlingResponse = false;
  #queue: Waiter[] = [];
  #secret: Buffer | undefined;
  readonly #decoder: FrameDecoder;
  readonly #write: Writable['write'];
  readonly #clock: BridgeClock;
  readonly #timeoutMs: number;
  readonly #kill: () => void;
  constructor(streams: BridgeStreams, options: { kill: () => void; clock?: BridgeClock; timeoutMs?: number }) {
    this.#clock = options.clock ?? systemClock;
    this.#timeoutMs = options.timeoutMs ?? 5000;
    this.#kill = options.kill;
    this.#write = streams.stdin.write.bind(streams.stdin);
    this.#decoder = new FrameDecoder((frame) => this.#receive(frame), (code) => this.close(code));
    streams.stdout.on('data', (chunk: Buffer) => this.#decoder.feed(chunk));
    streams.stdout.on('end', () => { this.#decoder.end(); this.close(); });
    streams.stdout.on('close', () => { this.#decoder.end(); this.close(); });
    streams.stdout.on('error', () => this.close());
    streams.stdin.on('error', () => this.close());
    streams.stdin.on('close', () => this.close());
  }
  get completedRequests(): number { return this.#completedHighWater; }
  get closed(): boolean { return this.#closed; }
  get closingCode(): BridgeCode | undefined { return this.#closingCode; }
  request(op: BridgeOp, body: Body): Promise<Body> {
    if (this.#closed) return Promise.reject(new BridgeError('bridge-closed'));
    return new Promise((resolve, reject) => {
      try {
        validateBody(op, 'req', body);
        const snapshot = JSON.parse(JSON.stringify(body)) as Body;
        this.#queue.push({ op, body: snapshot, resolve, reject });
        this.#pump();
      } catch (error) {
        const code = errorCode(error);
        reject(new BridgeError(code));
        this.close(code);
      }
    });
  }
  async sendBootstrap(secret: Buffer): Promise<void> {
    if (this.#closed) throw new BridgeError('bridge-closed');
    if (this.#nextId !== 1 || this.#secret) { this.close('protocol-order'); throw new BridgeError('protocol-order'); }
    this.#secret = secret;
    try { await this.request('bootstrap', { secret: encodeBase64url(secret, 32, 'secret-shape') }); }
    catch (error) { this.close(errorCode(error)); throw new BridgeError(errorCode(error)); }
  }
  async hello(body: HelloRequest): Promise<KeyObject> {
    if (this.#closed) throw new BridgeError('bridge-closed');
    if (this.#nextId !== 2) { this.close('protocol-order'); throw new BridgeError('protocol-order'); }
    const response = await this.request('hello', body);
    return importAnnouncedKey(decodeBase64url(response.publicKey as string, undefined, 'key-shape'));
  }
  #pump(): void {
    if (this.#closed || this.#outstanding || this.#settlingResponse || this.#queue.length === 0) return;
    const pending: Pending = { ...this.#queue.shift()!, id: this.#nextId++ };
    this.#outstanding = pending;
    try {
      if ((pending.op === 'bootstrap' && pending.id !== 1) || (pending.op === 'hello' && pending.id !== 2)) {
        throw new BridgeError('protocol-order');
      }
      if (pending.op === 'bootstrap' && !this.#secret) {
        this.#secret = decodeBase64url(pending.body.secret as string, 32, 'secret-shape');
      }
      pending.timer = this.#clock.setTimeout(() => this.close('bridge-timeout'), this.#timeoutMs);
      this.#write(encodeFrame({ v: 1, kind: 'req', id: pending.id, op: pending.op, body: pending.body }),
        (error) => { if (error) this.close(); });
    } catch (error) { this.close(errorCode(error)); }
  }
  #correlate(frame: Frame): Pending {
    if (frame.id <= this.#completedHighWater) throw new BridgeError('duplicate-id');
    if (!this.#outstanding) throw new BridgeError('unsolicited');
    if (frame.id > this.#outstanding.id) throw new BridgeError('id-mismatch');
    if (frame.op !== this.#outstanding.op) throw new BridgeError('op-mismatch');
    return this.#outstanding;
  }
  #receive(frame: Frame): void {
    if (this.#closed) return;
    try {
      if (frame.kind !== 'res') throw new BridgeError('frame-kind');
      const pending = this.#correlate(frame);
      if (!frame.ok) throw new BridgeError(frame.code);
      validateBody(frame.op, 'res', frame.body);
      if (frame.op === 'hello') this.#verifyHello(pending.body, frame.body);
      this.#completedHighWater = frame.id;
      this.#clock.clearTimeout(pending.timer);
      this.#complete(pending, frame.body);
    } catch (error) { this.close(errorCode(error)); }
  }
  #complete(pending: Pending, body: Body): void {
    // Acceptance clears correlation immediately. Delay only the next write: paired in-memory streams
    // can deliver response data before their write callbacks finish.
    this.#outstanding = undefined;
    this.#settlingResponse = true;
    pending.resolve(body);
    setImmediate(() => {
      this.#settlingResponse = false;
      this.#pump();
    });
  }
  #verifyHello(expected: Body, body: Body): void {
    if (!this.#secret) throw new BridgeError('protocol-order');
    verifyHelloMac(this.#secret, {
      challenge: decodeBase64url(expected.challenge as string, 32, 'challenge-shape'),
      epoch: expected.epoch as string, fixtureId: expected.fixtureId as string,
      containerId: expected.containerId as string,
      publicKeyDer: decodeBase64url(body.publicKey as string, undefined, 'key-shape'),
    }, decodeBase64url(body.mac as string, 32, 'mac-shape'));
  }
  close(code: BridgeCode = 'bridge-closed'): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#closingCode = code;
    const pending = this.#outstanding;
    pending?.reject(new BridgeError(code));
    this.#outstanding = undefined;
    for (const waiter of this.#queue.splice(0)) waiter.reject(new BridgeError('bridge-closed'));
    this.#decoder.stop();
    this.#secret?.fill(0);
    this.#secret = undefined;
    if (pending) this.#clock.clearTimeout(pending.timer);
    try { this.#kill(); } catch { /* The terminal state survives a failing injected cleanup. */ }
  }
}
