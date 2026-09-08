// The MAC proves possession of the delivered secret and binds session and key to the already-resolved
// container. It does not establish provenance. Buffer zeroing cannot erase GC-managed JSON copies.
// timingSafeEqual is a reviewed invariant, not unit-observable: a Buffer.equals mutant survives.
import { createHmac, createPublicKey, timingSafeEqual, type KeyObject } from 'node:crypto';
import {
  BODY_SCHEMAS, BridgeError, CONTAINER_ID_PATTERN, EPOCH_PATTERN, FIXTURE_IDS, HELLO_PREFIX, OPS,
  CAPABILITY_OPS, MAX_CAPTURE_BYTES, MAX_CHUNK_BYTES, MAX_EVENTS_BYTES, MAX_ARTIFACT_STRING_BYTES, RUN_ID_PATTERN,
  exactKeys, isBody, type Body, type BridgeCode, type BridgeOp, type FixtureId,
} from './protocol';

export type HelloFields = {
  challenge: Buffer; epoch: string; fixtureId: string; containerId: string; publicKeyDer: Buffer;
};
export type HelloRequest = { challenge: string; epoch: string; fixtureId: FixtureId; containerId: string };

function field(bytes: Buffer): Buffer {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length);
  return Buffer.concat([size, bytes]);
}
export function buildHelloTranscript(fields: HelloFields): Buffer {
  return Buffer.concat([
    Buffer.from(HELLO_PREFIX, 'ascii'), field(fields.challenge), field(Buffer.from(fields.epoch, 'utf8')),
    field(Buffer.from(fields.fixtureId, 'utf8')), field(Buffer.from(fields.containerId, 'utf8')),
    field(fields.publicKeyDer),
  ]);
}
export function computeHelloMac(secret: Buffer, fields: HelloFields): Buffer {
  if (secret.length !== 32) throw new BridgeError('secret-shape');
  if (fields.challenge.length !== 32) throw new BridgeError('challenge-shape');
  return createHmac('sha256', secret).update(buildHelloTranscript(fields)).digest();
}
export function verifyHelloMac(secret: Buffer, fields: HelloFields, mac: Buffer): void {
  if (mac.length !== 32) throw new BridgeError('mac-shape');
  if (!timingSafeEqual(computeHelloMac(secret, fields), mac)) throw new BridgeError('mac-invalid');
}
export function decodeBase64url(value: string, size: number | undefined, code: BridgeCode): Buffer {
  if (size !== undefined && value.length !== Math.ceil(size * 4 / 3)) throw new BridgeError(code);
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value || (size !== undefined && bytes.length !== size)) {
    throw new BridgeError(code);
  }
  return bytes;
}
export function encodeBase64url(bytes: Buffer, size: number, code: BridgeCode): string {
  if (bytes.length !== size) throw new BridgeError(code);
  return bytes.toString('base64url');
}
export function importAnnouncedKey(der: Buffer): KeyObject {
  try {
    const key = createPublicKey({ key: der, format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'ed25519'
      || !key.export({ format: 'der', type: 'spki' }).equals(der)) throw new BridgeError('key-shape');
    return key;
  } catch { throw new BridgeError('key-shape'); }
}
export function validateBody(op: BridgeOp, kind: 'req' | 'res', body: unknown): asserts body is Body {
  if (!(OPS as readonly string[]).includes(op)) throw new BridgeError('unknown-op');
  const keys = BODY_SCHEMAS[op][kind];
  if (!isBody(body) || !exactKeys(body, keys) || !keys.every((key) => typeof body[key] === 'string')) {
    throw new BridgeError('body-shape');
  }
  if (op === 'bootstrap' && kind === 'req') decodeBase64url(body.secret as string, 32, 'secret-shape');
  if (op === 'hello' && kind === 'req') validateHelloRequest(body);
  if (op === 'hello' && kind === 'res') validateHelloResponse(body);
  if (op !== 'bootstrap' && op !== 'hello') validateOperation(op, kind, body);
}
export function canonicalInteger(value: string, max = MAX_CAPTURE_BYTES): number {
  if (!/^(0|[1-9][0-9]*)(?![\s\S])/.test(value) || value.length > String(max).length
    || Number(value) > max) throw new BridgeError('body-shape');
  return Number(value);
}
function scalar(value: string, max: number, empty = false): void {
  if ((!empty && !value.length) || Buffer.byteLength(value) > max
    || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) {
    throw new BridgeError('body-shape');
  }
}
function validateOperation(op: BridgeOp, kind: 'req' | 'res', body: Body): void {
  if (kind === 'req') {
    if (!EPOCH_PATTERN.test(body.epoch as string) || Buffer.byteLength(body.epoch as string) > 4096
      || !(FIXTURE_IDS as readonly string[]).includes(body.fixtureId as string)
      || !RUN_ID_PATTERN.test(body.runId as string)) throw new BridgeError('body-shape');
    if (op === 'register') {
      for (const field of ['scenarioId', 'nonce', 'canaryId', 'canary']) {
        scalar(body[field] as string, field === 'scenarioId' || field === 'canaryId' ? 128 : 4096);
      }
    } else decodeBase64url(body.capability as string, 32, 'capability-refused');
    if (op === 'capture') {
      if (body.kind !== 'requests' && body.kind !== 'unauthorized') throw new BridgeError('body-shape');
      canonicalInteger(body.offset as string);
    }
    if (op === 'attest' && (body.events as string).length > Math.ceil(MAX_EVENTS_BYTES * 4 / 3)) {
      throw new BridgeError('control-limit');
    }
    if (op === 'attest'
      && decodeBase64url(body.events as string, undefined, 'body-shape').length > MAX_EVENTS_BYTES) {
      throw new BridgeError('control-limit');
    }
  } else {
    if (op === 'register') {
      for (const field of CAPABILITY_OPS) decodeBase64url(body[field] as string, 32, 'capability-refused');
      if (new Set(CAPABILITY_OPS.map((field) => body[field])).size !== 6) throw new BridgeError('capability-refused');
    }
    if (op === 'key') {
      importAnnouncedKey(decodeBase64url(body.publicKey as string, 44, 'key-shape'));
    }
    if (op === 'receipt') scalar(body.receipt as string, MAX_ARTIFACT_STRING_BYTES, true);
    if (op === 'attest') scalar(body.attestation as string, MAX_ARTIFACT_STRING_BYTES);
    if (op === 'capture') {
      if ((body.bytes as string).length > Math.ceil(MAX_CHUNK_BYTES * 4 / 3)) throw new BridgeError('body-shape');
      const bytes = decodeBase64url(body.bytes as string, undefined, 'body-shape');
      const total = canonicalInteger(body.total as string);
      const next = canonicalInteger(body.next as string);
      if (bytes.length > MAX_CHUNK_BYTES || next > total || bytes.length > next
        || (bytes.length === 0 && next !== total)) throw new BridgeError('body-shape');
    }
  }
}
function validateHelloRequest(body: Body): void {
  if (Buffer.byteLength(body.epoch as string) > 4096) throw new BridgeError('body-shape');
  if (!CONTAINER_ID_PATTERN.test(body.containerId as string) || !EPOCH_PATTERN.test(body.epoch as string)
    || !(FIXTURE_IDS as readonly string[]).includes(body.fixtureId as string)) throw new BridgeError('body-shape');
  decodeBase64url(body.challenge as string, 32, 'challenge-shape');
}
function validateHelloResponse(body: Body): void {
  // Closed schema first; key import/re-export precedes MAC decoding and verification.
  importAnnouncedKey(decodeBase64url(body.publicKey as string, 44, 'key-shape'));
  decodeBase64url(body.mac as string, 32, 'mac-shape');
}
