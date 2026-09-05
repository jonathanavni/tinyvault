import { createHash, sign as cryptoSign, verify as cryptoVerify, type KeyObject } from 'node:crypto';

type EventsDigestPayload = { runId: string; eventsSha256: string };

type SignedEventsDigest = {
  version: '1';
  payload: EventsDigestPayload;
  signature: string;
};

export function verifyEventsDigest(
  serialized: string,
  expectedRunId: string,
  eventsBytes: Uint8Array,
  verificationKey: KeyObject,
): boolean {
  const envelope = parseEventsDigest(serialized);
  if (!envelope || envelope.payload.runId !== expectedRunId
    || envelope.payload.eventsSha256 !== sha256(eventsBytes)) return false;
  return cryptoVerify(
    null,
    Buffer.from(canonicalEventsDigest(envelope.payload), 'utf8'),
    verificationKey,
    Buffer.from(envelope.signature, 'base64url'),
  );
}

export function signEventsDigest(runId: string, eventsBytes: Uint8Array, signingKey: KeyObject): string {
  const payload: EventsDigestPayload = { runId, eventsSha256: sha256(eventsBytes) };
  const signature = cryptoSign(
    null,
    Buffer.from(canonicalEventsDigest(payload), 'utf8'),
    signingKey,
  ).toString('base64url');
  const envelope: SignedEventsDigest = { version: '1', payload, signature };
  return JSON.stringify(envelope);
}

function parseEventsDigest(serialized: string): SignedEventsDigest | undefined {
  try {
    const value = JSON.parse(serialized) as unknown;
    if (!isRecord(value) || !hasExactKeys(value, ['version', 'payload', 'signature'])
      || value.version !== '1' || typeof value.signature !== 'string'
      || !isCanonicalSignature(value.signature) || !isRecord(value.payload)
      || !hasExactKeys(value.payload, ['runId', 'eventsSha256'])
      || typeof value.payload.runId !== 'string'
      || typeof value.payload.eventsSha256 !== 'string'
      || !/^[0-9a-f]{64}$/.test(value.payload.eventsSha256)) return undefined;
    return value as SignedEventsDigest;
  } catch {
    return undefined;
  }
}

function canonicalEventsDigest(payload: EventsDigestPayload): string {
  return JSON.stringify({ runId: payload.runId, eventsSha256: payload.eventsSha256 });
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

