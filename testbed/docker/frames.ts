// Canonical bounded frames stop at the first anomaly; stream framing does not authenticate a peer.
import {
  BODY_SCHEMAS, BridgeError, FRAME_KEYS, MAX_PAYLOAD_BYTES, OPS, PREFIX_BYTES,
  errorCode, exactKeys, isBody, isBridgeCode, type Body, type BridgeCode, type BridgeOp, type Frame,
} from './protocol';

function ordered(value: Body, keys: readonly string[]): Body {
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}
function rebuild(value: unknown): Body {
  if (!isBody(value)) throw new BridgeError('frame-canonical');
  const keys = value.kind === 'req' ? FRAME_KEYS.req
    : value.ok === false ? FRAME_KEYS.failure : FRAME_KEYS.success;
  const result = ordered(value, keys);
  const schema = BODY_SCHEMAS[value.op as BridgeOp];
  const bodyKeys = schema && (value.kind === 'req' ? schema.req : schema.res);
  // Missing/extra body fields belong to the later closed-body-schema step.
  if (bodyKeys && isBody(value.body) && exactKeys(value.body, bodyKeys)) {
    result.body = ordered(value.body, bodyKeys);
  }
  return result;
}
function validateTypes(value: Body): Frame {
  const valid = value.v === 1 && Number.isSafeInteger(value.id) && (value.id as number) >= 1
    && (value.kind === 'req' || value.kind === 'res') && typeof value.op === 'string'
    && (value.kind === 'req' || typeof value.ok === 'boolean')
    && (value.kind === 'res' && value.ok === false ? isBridgeCode(value.code) : isBody(value.body));
  if (!valid) throw new BridgeError('frame-type');
  if (!(OPS as readonly string[]).includes(value.op as string)) throw new BridgeError('unknown-op');
  return value as Frame;
}
function decodePayload(payload: Buffer): Frame {
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(payload); }
  catch { throw new BridgeError('frame-utf8'); }
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new BridgeError('frame-canonical'); }
  const rebuilt = rebuild(value);
  if (!payload.equals(Buffer.from(JSON.stringify(rebuilt)))) throw new BridgeError('frame-canonical');
  return validateTypes(rebuilt);
}
export function encodeFrame(value: unknown): Buffer {
  try {
    const payload = Buffer.from(JSON.stringify(rebuild(value)));
    if (payload.length === 0 || payload.length > MAX_PAYLOAD_BYTES) throw new BridgeError('frame-length');
    decodePayload(payload);
    const header = Buffer.alloc(PREFIX_BYTES);
    header.writeUInt32BE(payload.length);
    return Buffer.concat([header, payload]);
  } catch (error) { throw new BridgeError(errorCode(error)); }
}

export class FrameDecoder {
  #buffer: Buffer = Buffer.alloc(0);
  #stopped = false;
  #failure: BridgeCode | undefined;
  constructor(readonly onFrame: (frame: Frame) => void, readonly onError: (code: BridgeCode) => void) {}
  get failure(): BridgeCode | undefined { return this.#failure; }
  get stopped(): boolean { return this.#stopped; }
  stop(): void { this.#stopped = true; this.#buffer = Buffer.alloc(0); }
  #fail(code: BridgeCode): void {
    this.#failure = code;
    this.stop();
    this.onError(code);
  }
  feed(chunk: Uint8Array): void {
    if (this.#stopped) return;
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    while (!this.#stopped && this.#buffer.length >= PREFIX_BYTES) {
      const size = this.#buffer.readUInt32BE(0);
      if (size === 0 || size > MAX_PAYLOAD_BYTES) { this.#fail('frame-length'); return; }
      if (this.#buffer.length < PREFIX_BYTES + size) return;
      const payload = this.#buffer.subarray(PREFIX_BYTES, PREFIX_BYTES + size);
      this.#buffer = this.#buffer.subarray(PREFIX_BYTES + size);
      let frame: Frame;
      try { frame = decodePayload(payload); }
      catch (error) { this.#fail(errorCode(error)); return; }
      this.onFrame(frame);
    }
  }
  end(): void {
    if (this.#stopped) return;
    if (this.#buffer.length > 0) this.#fail('frame-partial');
    else this.stop();
  }
}
