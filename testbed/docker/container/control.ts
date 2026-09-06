// Serial trusted-fixture control over supplied streams. Possession binds the announced key and session;
// hostname matching is refuse-only and does not authenticate provenance. No listener is created here.
import type { KeyObject } from 'node:crypto';
import type { Readable, Writable } from 'node:stream';
import { FrameDecoder, encodeFrame } from '../frames';
import { canonicalInteger, computeHelloMac, decodeBase64url, validateBody } from '../handshake';
import { BridgeError, MAX_CAPTURE_BYTES, MAX_CHUNK_BYTES, errorCode, type Body, type BridgeCode,
  type CapabilityOp, type CaptureKind, type FixtureId, type Frame } from '../protocol';
import { CapabilityRegistry, type CapabilityScope } from './capabilities';

export type ControlStreams = { input: Readable; output: Writable };
// Trusted adapter seam for Job B. No page-facing object receives these callbacks or capabilities.
export type ControlOperations = {
  registerRun(setup: { scenarioId: string; runId: string; nonce: string; canaryId: string; canary: string }): Promise<void>;
  takeReceipt(runId: string): Promise<string | undefined>;
  capture(runId: string, kind: CaptureKind): Promise<Uint8Array>;
  finalizeRun(runId: string): Promise<void>;
  acknowledgeReceipt(runId: string): Promise<void>;
  attestEvents(runId: string, events: Uint8Array): Promise<string>;
  readPublicKey(runId: string): Promise<KeyObject>;
};
export type ControlConfig = {
  fixtureId: FixtureId; epoch: string; hostname: string;
  keyPairProvider: () => { publicKey: KeyObject } | Promise<{ publicKey: KeyObject }>;
  diagnostics: (code: BridgeCode) => void;
  operations?: ControlOperations;
};
export class ControlSession {
  #state: 'awaiting-bootstrap' | 'awaiting-hello' | 'established' | 'closed' = 'awaiting-bootstrap';
  #inFlight = false;
  #lastId = 0;
  #secret: Buffer | undefined;
  #publicKey: string | undefined;
  readonly #registry: CapabilityRegistry;
  readonly #captureTotals = new Map<string, number>();
  readonly #decoder: FrameDecoder;
  readonly #write: Writable['write'];
  readonly #streams: ControlStreams;
  readonly #config: ControlConfig;
  constructor(streams: ControlStreams, config: ControlConfig) {
    this.#streams = streams;
    this.#config = { ...config, operations: config.operations ? { ...config.operations } : undefined };
    this.#registry = new CapabilityRegistry(config.fixtureId, config.epoch);
    this.#write = streams.output.write.bind(streams.output);
    this.#decoder = new FrameDecoder((frame) => this.#receive(frame), (code) => this.close(code));
    streams.input.on('data', (chunk: Buffer) => this.#decoder.feed(chunk));
    streams.input.on('end', () => { this.#decoder.end(); this.close(); });
    streams.input.on('close', () => { this.#decoder.end(); this.close(); });
    streams.input.on('error', () => this.close());
    streams.output.on('error', () => this.close());
    streams.output.on('close', () => this.close());
  }
  get closed(): boolean { return this.#state === 'closed'; }
  #receive(frame: Frame): void {
    try {
      if (frame.kind !== 'req') throw new BridgeError('frame-kind');
      if (frame.id <= this.#lastId) throw new BridgeError('duplicate-id');
      if (this.#inFlight) throw new BridgeError('pipelined');
      this.#inFlight = true;
      this.#lastId = frame.id;
      this.#checkOrder(frame);
      validateBody(frame.op, 'req', frame.body);
      void this.#respond(frame);
    } catch (error) { this.#refuse(frame, errorCode(error)); }
  }
  #checkOrder(frame: Frame): void {
    const bootstrap = frame.op === 'bootstrap' && frame.id === 1 && this.#state === 'awaiting-bootstrap';
    const hello = frame.op === 'hello' && frame.id === 2 && this.#state === 'awaiting-hello';
    const operation = frame.op !== 'bootstrap' && frame.op !== 'hello' && this.#state === 'established';
    if (!bootstrap && !hello && !operation) throw new BridgeError('protocol-order');
  }
  async #respond(frame: Frame & { body: Body }): Promise<void> {
    try {
      const body = frame.op === 'bootstrap' ? this.#bootstrap(frame.body)
        : frame.op === 'hello' ? await this.#hello(frame.body) : await this.#operate(frame.op, frame.body);
      // Always defer writing: even synchronous fake writers must detect coalesced requests as pipelined.
      await Promise.resolve();
      if (this.closed) return;
      validateBody(frame.op, 'res', body);
      this.#write(encodeFrame({ v: 1, kind: 'res', id: frame.id, op: frame.op, ok: true, body }), (error) => {
        if (error) { this.close(); return; }
        if (this.closed) return;
        this.#state = frame.op === 'bootstrap' ? 'awaiting-hello' : 'established';
        this.#inFlight = false;
      });
    } catch (error) { this.#refuse(frame, errorCode(error)); }
  }
  #bootstrap(body: Body): Body {
    this.#secret = decodeBase64url(body.secret as string, 32, 'secret-shape');
    return {};
  }
  async #hello(body: Body): Promise<Body> {
    if (body.epoch !== this.#config.epoch || body.fixtureId !== this.#config.fixtureId) {
      throw new BridgeError('hello-mismatch');
    }
    if (!this.#config.hostname || !(body.containerId as string).startsWith(this.#config.hostname)) {
      throw new BridgeError('hostname-mismatch');
    }
    const pair = await this.#config.keyPairProvider();
    if (this.closed || !this.#secret) throw new BridgeError('bridge-closed');
    const publicKeyDer = pair.publicKey.export({ format: 'der', type: 'spki' });
    this.#publicKey = publicKeyDer.toString('base64url');
    const mac = computeHelloMac(this.#secret, {
      challenge: decodeBase64url(body.challenge as string, 32, 'challenge-shape'),
      epoch: body.epoch as string, fixtureId: body.fixtureId as string,
      containerId: body.containerId as string, publicKeyDer,
    });
    return { publicKey: publicKeyDer.toString('base64url'), mac: mac.toString('base64url') };
  }
  async #operate(op: 'register' | CapabilityOp, body: Body): Promise<Body> {
    const operations = this.#config.operations;
    if (!operations) throw new BridgeError('run-state');
    const scope: CapabilityScope = { epoch: body.epoch as string, fixtureId: body.fixtureId as FixtureId,
      runId: body.runId as string };
    if (op === 'register') {
      const capabilities = this.#registry.register(scope);
      await operations.registerRun({ scenarioId: body.scenarioId as string, runId: scope.runId,
        nonce: body.nonce as string, canaryId: body.canaryId as string, canary: body.canary as string });
      return capabilities;
    }
    this.#registry.authorize(scope, op, body.capability as string);
    switch (op) {
      case 'key': {
        const key = await operations.readPublicKey(scope.runId);
        if (!this.#publicKey || key.export({ format: 'der', type: 'spki' }).toString('base64url') !== this.#publicKey) {
          throw new BridgeError('key-mismatch');
        }
        return { publicKey: this.#publicKey };
      }
      case 'receipt': return { receipt: await operations.takeReceipt(scope.runId) ?? '' };
      case 'attest': return { attestation: await operations.attestEvents(scope.runId,
        decodeBase64url(body.events as string, undefined, 'body-shape')) };
      case 'ack': await operations.acknowledgeReceipt(scope.runId); return {};
      case 'finalize':
        await operations.finalizeRun(scope.runId);
        this.#registry.markFinalized(scope.runId);
        return {};
      case 'capture': {
        const kind = body.kind as CaptureKind;
        const snapshot = await operations.capture(scope.runId, kind);
        if (this.closed) throw new BridgeError('bridge-closed');
        if (!(snapshot instanceof Uint8Array) || snapshot.byteLength > MAX_CAPTURE_BYTES) {
          throw new BridgeError('control-limit');
        }
        const total = snapshot.byteLength;
        const index = `${scope.runId}:${kind}`;
        const prior = this.#captureTotals.get(index);
        if (prior !== undefined && prior !== total) throw new BridgeError('run-state');
        this.#captureTotals.set(index, total);
        const offset = canonicalInteger(body.offset as string);
        if (offset > total) throw new BridgeError('body-shape');
        const bytes = Buffer.from(snapshot.subarray(offset, offset + MAX_CHUNK_BYTES));
        return { bytes: bytes.toString('base64url'), total: String(total), next: String(offset + bytes.length) };
      }
    }
  }
  #refuse(frame: Frame, code: BridgeCode): void {
    if (this.closed) return;
    try { this.#write(encodeFrame({ v: 1, kind: 'res', id: frame.id, op: frame.op, ok: false, code })); }
    catch { /* A broken output still terminates the session. */ }
    this.close(code);
  }
  close(code: BridgeCode = 'bridge-closed'): void {
    if (this.closed) return;
    this.#state = 'closed';
    this.#decoder.stop();
    this.#secret?.fill(0);
    this.#secret = undefined;
    this.#registry.close();
    this.#captureTotals.clear();
    this.#publicKey = undefined;
    try { this.#config.diagnostics(code); } catch { /* Diagnostics cannot prevent close. */ }
    this.#streams.input.destroy();
    this.#streams.output.end();
  }
}

// Create once per fixture lifetime; the returned acceptor permanently consumes its one connection slot.
export function createControlServer(config: ControlConfig): (streams: ControlStreams) => ControlSession | undefined {
  let accepted = false;
  return (streams) => {
    if (accepted) {
      try { config.diagnostics('bridge-closed'); }
      finally { streams.input.destroy(); streams.output.end(); }
      return undefined;
    }
    accepted = true;
    return new ControlSession(streams, config);
  };
}
