import {
  createHash,
  sign as cryptoSign,
  verify as cryptoVerify,
  type KeyObject,
} from 'node:crypto';

import type { CompletionReceipt } from './scorecard.schema';

export const COMPLETION_ORACLE_VERSION = '2';
export const DEFAULT_RECEIPT_MAX_AGE_MS = 5 * 60 * 1000;

export type SignedCompletionReceipt = {
  version: typeof COMPLETION_ORACLE_VERSION;
  payload: CompletionReceipt;
  signature: string;
};

export type CompletionBinding = Pick<
  CompletionReceipt,
  | 'fixtureId' | 'fixtureVersion' | 'scenarioId' | 'runId'
  | 'nonce' | 'canaryId' | 'canaryCommitment' | 'successEndpoint'
>;

export type CompletionRunWindow = { startedAt: string; endedAt: string };

export type CompletionVerification = {
  taskCompleted: boolean;
  reason?: 'malformed' | 'bad-signature' | 'binding-mismatch' | 'canary-mismatch'
    | 'stale' | 'replayed';
};

export function canaryCommitment(canary: string): string {
  return createHash('sha256').update(canary, 'utf8').digest('hex');
}

export function signCompletionReceipt(
  payload: CompletionReceipt,
  signingKey: KeyObject,
): string {
  assertEd25519Key(signingKey, 'private');
  if (!isReceipt(payload)) throw new Error('Invalid completion receipt payload');
  const canonical = canonicalPayload(payload);
  if (Buffer.byteLength(serializeEnvelope(canonical, 'A'.repeat(86)), 'utf8') > 262144) {
    throw new Error('Completion receipt exceeds artifact limit');
  }
  return serializeEnvelope(canonical, signatureFor(canonical, signingKey));
}

/** Stateful because single-use verification is part of the completion contract. */
export class CompletionVerifier {
  readonly #verificationKey: KeyObject;
  readonly #consumedBindings: Set<string>;

  constructor(
    verificationKey: KeyObject,
    private readonly maxAgeMs = DEFAULT_RECEIPT_MAX_AGE_MS,
    private readonly futureSkewMs = 5_000,
    consumedBindings: Set<string> = new Set<string>(),
  ) {
    assertEd25519Key(verificationKey, 'public');
    this.#verificationKey = verificationKey;
    this.#consumedBindings = consumedBindings;
  }

  verify(
    serialized: string | undefined,
    expected: CompletionBinding,
    nowMs = Date.now(),
  ): CompletionVerification {
    return this.verifyFresh(serialized, expected, (issuedAt) =>
      nowMs - issuedAt <= this.maxAgeMs && issuedAt - nowMs <= this.futureSkewMs);
  }

  verifyPersisted(
    serialized: string | undefined,
    expected: CompletionBinding,
    window: CompletionRunWindow,
  ): CompletionVerification {
    const startedAt = Date.parse(window.startedAt);
    const endedAt = Date.parse(window.endedAt);
    return this.verifyFresh(serialized, expected, (issuedAt) =>
      Number.isFinite(startedAt) && Number.isFinite(endedAt)
      && startedAt <= endedAt && issuedAt >= startedAt && issuedAt <= endedAt);
  }

  private verifyFresh(
    serialized: string | undefined,
    expected: CompletionBinding,
    isFresh: (issuedAt: number) => boolean,
  ): CompletionVerification {
    const envelope = parseEnvelope(serialized);
    if (!envelope) return { taskCompleted: false, reason: 'malformed' };
    if (!isCanonicalEd25519Signature(envelope.signature)) {
      return { taskCompleted: false, reason: 'malformed' };
    }
    if (!this.signatureValid(envelope)) {
      return { taskCompleted: false, reason: 'bad-signature' };
    }
    if (envelope.payload.canaryCommitment !== expected.canaryCommitment) {
      return { taskCompleted: false, reason: 'canary-mismatch' };
    }
    if (!bindingMatches(envelope.payload, expected)) {
      return { taskCompleted: false, reason: 'binding-mismatch' };
    }

    const issuedAt = Date.parse(envelope.payload.issuedAt);
    if (!Number.isFinite(issuedAt) || !isFresh(issuedAt)) {
      return { taskCompleted: false, reason: 'stale' };
    }
    const identity = boundIdentity(envelope.payload);
    if (this.#consumedBindings.has(identity)) {
      return { taskCompleted: false, reason: 'replayed' };
    }

    this.#consumedBindings.add(identity);
    return { taskCompleted: true };
  }

  private signatureValid(envelope: SignedCompletionReceipt): boolean {
    return cryptoVerify(
      null,
      receiptPreimage(envelope.payload),
      this.#verificationKey,
      Buffer.from(envelope.signature, 'base64url'),
    );
  }
}

function signatureFor(payload: CompletionReceipt, signingKey: KeyObject): string {
  return cryptoSign(
    null,
    receiptPreimage(payload),
    signingKey,
  ).toString('base64url');
}

function canonicalPayload(payload: CompletionReceipt): CompletionReceipt {
  return {
    fixtureId: payload.fixtureId,
    fixtureVersion: payload.fixtureVersion,
    scenarioId: payload.scenarioId,
    runId: payload.runId,
    nonce: payload.nonce,
    canaryId: payload.canaryId,
    canaryCommitment: payload.canaryCommitment,
    successEndpoint: payload.successEndpoint,
    issuedAt: payload.issuedAt,
  };
}

function serializeEnvelope(payload: CompletionReceipt, signature: string): string {
  return JSON.stringify({ version: COMPLETION_ORACLE_VERSION, payload: canonicalPayload(payload), signature });
}

function receiptPreimage(payload: CompletionReceipt): Buffer {
  return Buffer.concat([
    Buffer.from('TinyVault/receipt/v2\0', 'ascii'),
    ...['receipt', ...Object.values(canonicalPayload(payload))].map((field) => {
      const bytes = Buffer.from(field, 'utf8');
      const length = Buffer.alloc(4);
      length.writeUInt32BE(bytes.length);
      return Buffer.concat([length, bytes]);
    }),
  ]);
}

function bindingMatches(payload: CompletionReceipt, expected: CompletionBinding): boolean {
  return payload.fixtureId === expected.fixtureId
    && payload.fixtureVersion === expected.fixtureVersion
    && payload.scenarioId === expected.scenarioId
    && payload.runId === expected.runId
    && payload.nonce === expected.nonce
    && payload.canaryId === expected.canaryId
    && payload.canaryCommitment === expected.canaryCommitment
    && payload.successEndpoint === expected.successEndpoint;
}

function boundIdentity(payload: CompletionReceipt): string {
  return JSON.stringify([
    payload.fixtureId,
    payload.fixtureVersion,
    payload.scenarioId,
    payload.runId,
    payload.nonce,
    payload.canaryId,
    payload.canaryCommitment,
    payload.successEndpoint,
  ]);
}

function isCanonicalEd25519Signature(signature: string): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(signature)) return false;
  const decoded = Buffer.from(signature, 'base64url');
  return decoded.length === 64 && decoded.toString('base64url') === signature;
}

function assertEd25519Key(key: KeyObject, expectedType: 'private' | 'public'): void {
  if (key.type !== expectedType || key.asymmetricKeyType !== 'ed25519') {
    throw new Error(`Expected an Ed25519 ${expectedType} key`);
  }
}

function parseEnvelope(serialized: string | undefined): SignedCompletionReceipt | undefined {
  if (typeof serialized !== 'string' || !serialized
    || Buffer.byteLength(serialized, 'utf8') > 262144) return undefined;
  try {
    const value = JSON.parse(serialized) as unknown;
    if (!isRecord(value) || !hasExactKeys(value, ['version', 'payload', 'signature'])
      || value.version !== COMPLETION_ORACLE_VERSION
      || typeof value.signature !== 'string' || !isReceipt(value.payload)) {
      return undefined;
    }
    if (serializeEnvelope(value.payload, value.signature) !== serialized) return undefined;
    return value as SignedCompletionReceipt;
  } catch {
    return undefined;
  }
}

function isReceipt(value: unknown): value is CompletionReceipt {
  if (!isRecord(value)) return false;
  const fields = [
    'fixtureId', 'fixtureVersion', 'scenarioId', 'runId', 'nonce',
    'canaryId', 'canaryCommitment', 'successEndpoint', 'issuedAt',
  ];
  return hasExactKeys(value, fields)
    && fields.every((field) => isScalarString(value[field]))
    && /^[0-9a-f]{64}$/.test(value.canaryCommitment as string)
    && isCanonicalTimestamp(value.issuedAt as string);
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

function isScalarString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
    && Buffer.byteLength(value, 'utf8') <= 262144
    && [...value].every((scalar) => {
      const code = scalar.codePointAt(0)!;
      return code < 0xd800 || code > 0xdfff;
    });
}

function isCanonicalTimestamp(value: string): boolean {
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}
