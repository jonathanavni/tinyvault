// Serial trusted-fixture control over supplied streams. Possession binds the announced key and session;
// hostname matching is refuse-only and does not authenticate provenance. No listener is created here.
import type { KeyObject } from 'node:crypto';
import type { Readable, Writable } from 'node:stream';
import { FrameDecoder, encodeFrame } from '../frames';
import { computeHelloMac, decodeBase64url, validateBody } from '../handshake';
import { BridgeError, errorCode, type Body, type BridgeCode, type FixtureId, type Frame } from '../protocol';

export type ControlStreams = { input: Readable; output: Writable };
export type ControlConfig = {
  fixtureId: FixtureId; epoch: string; hostname: string;
  keyPairProvider: () => { publicKey: KeyObject } | Promise<{ publicKey: KeyObject }>;
  diagnostics: (code: BridgeCode) => void;
};
export class ControlSession {
  #state: 'awaiting-bootstrap' | 'awaiting-hello' | 'established' | 'closed' = 'awaiting-bootstrap';
  #inFlight = false;
  #lastId = 0;
  #secret: Buffer | undefined;
  readonly #decoder: FrameDecoder;
  readonly #write: Writable['write'];
  readonly #streams: ControlStreams;
  readonly #config: ControlConfig;
  constructor(streams: ControlStreams, config: ControlConfig) {
    this.#streams = streams;
    this.#config = config;
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
    if (!bootstrap && !hello) throw new BridgeError('protocol-order');
  }
  async #respond(frame: Frame & { body: Body }): Promise<void> {
    try {
      const body = frame.op === 'bootstrap' ? this.#bootstrap(frame.body) : await this.#hello(frame.body);
      // Always defer writing: even synchronous fake writers must detect coalesced requests as pipelined.
      await Promise.resolve();
      if (this.closed) return;
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
    const mac = computeHelloMac(this.#secret, {
      challenge: decodeBase64url(body.challenge as string, 32, 'challenge-shape'),
      epoch: body.epoch as string, fixtureId: body.fixtureId as string,
      containerId: body.containerId as string, publicKeyDer,
    });
    return { publicKey: publicKeyDer.toString('base64url'), mac: mac.toString('base64url') };
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
