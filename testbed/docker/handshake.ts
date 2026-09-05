// The MAC proves possession of the delivered secret and binds session and key to the already-resolved
// container. It does not establish provenance. Buffer zeroing cannot erase GC-managed JSON copies.
// timingSafeEqual is a reviewed invariant, not unit-observable: a Buffer.equals mutant survives.
import { createHmac, createPublicKey, timingSafeEqual, type KeyObject } from 'node:crypto';
import {
  BODY_SCHEMAS, BridgeError, CONTAINER_ID_PATTERN, EPOCH_PATTERN, FIXTURE_IDS, HELLO_PREFIX, OPS,
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
}
function validateHelloRequest(body: Body): void {
  if (!CONTAINER_ID_PATTERN.test(body.containerId as string) || !EPOCH_PATTERN.test(body.epoch as string)
    || !(FIXTURE_IDS as readonly string[]).includes(body.fixtureId as string)) throw new BridgeError('body-shape');
  decodeBase64url(body.challenge as string, 32, 'challenge-shape');
}
function validateHelloResponse(body: Body): void {
  // Closed schema first; key import/re-export precedes MAC decoding and verification.
  importAnnouncedKey(decodeBase64url(body.publicKey as string, undefined, 'key-shape'));
  decodeBase64url(body.mac as string, 32, 'mac-shape');
}
