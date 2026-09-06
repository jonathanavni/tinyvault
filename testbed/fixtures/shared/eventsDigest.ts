import { createHash, sign as cryptoSign, verify as cryptoVerify, type KeyObject } from 'node:crypto';

type EventsDigestPayload = { fixtureId: string; runId: string; eventsSha256: string };

type SignedEventsDigest = {
  version: '2';
  payload: EventsDigestPayload;
  signature: string;
};

export function verifyEventsDigest(
  serialized: string,
  expectedFixtureId: string,
  expectedRunId: string,
  eventsBytes: Uint8Array,
  verificationKey: KeyObject,
): boolean {
  if (eventsBytes.byteLength > 131072) return false;
  const envelope = parseEventsDigest(serialized);
  if (!envelope || envelope.payload.fixtureId !== expectedFixtureId
    || envelope.payload.runId !== expectedRunId
    || envelope.payload.eventsSha256 !== sha256(eventsBytes)) return false;
  return cryptoVerify(
    null,
    attestationPreimage(envelope.payload),
    verificationKey,
    Buffer.from(envelope.signature, 'base64url'),
  );
}

export function signEventsDigest(
  fixtureId: string, runId: string, eventsBytes: Uint8Array, signingKey: KeyObject,
): string {
  if (eventsBytes.byteLength > 131072) throw new Error('Events exceed control-limit');
  const payload: EventsDigestPayload = { fixtureId, runId, eventsSha256: sha256(eventsBytes) };
  if (!isPayload(payload)) throw new Error('Invalid events digest payload');
  if (Buffer.byteLength(serializeEnvelope(payload, 'A'.repeat(86)), 'utf8') > 262144) {
    throw new Error('Events attestation exceeds artifact limit');
  }
  const signature = cryptoSign(
    null,
    attestationPreimage(payload),
    signingKey,
  ).toString('base64url');
  return serializeEnvelope(payload, signature);
}

function parseEventsDigest(serialized: string): SignedEventsDigest | undefined {
  if (typeof serialized !== 'string' || Buffer.byteLength(serialized, 'utf8') > 262144) return undefined;
  try {
    const value = JSON.parse(serialized) as unknown;
    if (!isRecord(value) || !hasExactKeys(value, ['version', 'payload', 'signature'])
      || value.version !== '2' || typeof value.signature !== 'string'
      || !isCanonicalSignature(value.signature) || !isPayload(value.payload)) return undefined;
    if (serializeEnvelope(value.payload, value.signature) !== serialized) return undefined;
    return value as SignedEventsDigest;
  } catch {
    return undefined;
  }
}

function isPayload(value: unknown): value is EventsDigestPayload {
  return isRecord(value) && hasExactKeys(value, ['fixtureId', 'runId', 'eventsSha256'])
    && isScalarString(value.fixtureId) && isScalarString(value.runId)
    && isScalarString(value.eventsSha256) && /^[0-9a-f]{64}$/.test(value.eventsSha256);
}

function serializeEnvelope(payload: EventsDigestPayload, signature: string): string {
  return JSON.stringify({ version: '2', payload: {
    fixtureId: payload.fixtureId, runId: payload.runId, eventsSha256: payload.eventsSha256,
  }, signature });
}

function attestationPreimage(payload: EventsDigestPayload): Buffer {
  return Buffer.concat([
    Buffer.from('TinyVault/attestation/v2\0', 'ascii'),
    ...['attest', payload.fixtureId, payload.runId, payload.eventsSha256].map((field) => {
      const bytes = Buffer.from(field, 'utf8');
      const length = Buffer.alloc(4);
      length.writeUInt32BE(bytes.length);
      return Buffer.concat([length, bytes]);
    }),
  ]);
}

function isScalarString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
    && Buffer.byteLength(value, 'utf8') <= 262144
    && [...value].every((scalar) => {
      const code = scalar.codePointAt(0)!;
      return code < 0xd800 || code > 0xdfff;
    });
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isCanonicalSignature(signature: string): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(signature)) return false;
  const decoded = Buffer.from(signature, 'base64url');
  return decoded.length === 64 && decoded.toString('base64url') === signature;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((field, index) => field === sortedExpected[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

