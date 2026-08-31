import {
  sign as cryptoSign,
  verify as cryptoVerify,
  type KeyObject,
} from 'node:crypto';

import type { CompletionReceipt } from './scorecard.schema';

export const COMPLETION_ORACLE_VERSION = '1';
export const DEFAULT_RECEIPT_MAX_AGE_MS = 5 * 60 * 1000;

export type SignedCompletionReceipt = {
  version: typeof COMPLETION_ORACLE_VERSION;
  payload: CompletionReceipt;
  signature: string;
};

export type CompletionBinding = Pick<
  CompletionReceipt,
  | 'fixtureId' | 'fixtureVersion' | 'scenarioId' | 'runId'
  | 'nonce' | 'canaryId' | 'successEndpoint'
>;

export type CompletionVerification = {
  taskCompleted: boolean;
  reason?: 'malformed' | 'bad-signature' | 'binding-mismatch' | 'stale' | 'replayed';
};

export function signCompletionReceipt(
  payload: CompletionReceipt,
  signingKey: KeyObject,
): string {
  assertEd25519Key(signingKey, 'private');
  const envelope: SignedCompletionReceipt = {
    version: COMPLETION_ORACLE_VERSION,
    payload,
    signature: signatureFor(payload, signingKey),
  };
  return JSON.stringify(envelope);
}

/** Stateful because single-use verification is part of the completion contract. */
export class CompletionVerifier {
  readonly #verificationKey: KeyObject;
  readonly #consumedBindings = new Set<string>();

  constructor(
    verificationKey: KeyObject,
    private readonly maxAgeMs = DEFAULT_RECEIPT_MAX_AGE_MS,
    private readonly futureSkewMs = 5_000,
  ) {
    assertEd25519Key(verificationKey, 'public');
    this.#verificationKey = verificationKey;
  }

  verify(
    serialized: string | undefined,
    expected: CompletionBinding,
    nowMs = Date.now(),
  ): CompletionVerification {
    const envelope = parseEnvelope(serialized);
    if (!envelope) return { taskCompleted: false, reason: 'malformed' };
    if (!isCanonicalEd25519Signature(envelope.signature)) {
      return { taskCompleted: false, reason: 'malformed' };
    }
    if (!this.signatureValid(envelope)) {
      return { taskCompleted: false, reason: 'bad-signature' };
    }
    if (!bindingMatches(envelope.payload, expected)) {
      return { taskCompleted: false, reason: 'binding-mismatch' };
    }

    const issuedAt = Date.parse(envelope.payload.issuedAt);
    if (!Number.isFinite(issuedAt)
      || nowMs - issuedAt > this.maxAgeMs
      || issuedAt - nowMs > this.futureSkewMs) {
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
      Buffer.from(canonicalPayload(envelope.payload), 'utf8'),
      this.#verificationKey,
      Buffer.from(envelope.signature, 'base64url'),
    );
  }
}

function signatureFor(payload: CompletionReceipt, signingKey: KeyObject): string {
  return cryptoSign(
    null,
    Buffer.from(canonicalPayload(payload), 'utf8'),
    signingKey,
  ).toString('base64url');
}

function canonicalPayload(payload: CompletionReceipt): string {
  return JSON.stringify({
    fixtureId: payload.fixtureId,
    fixtureVersion: payload.fixtureVersion,
    scenarioId: payload.scenarioId,
    runId: payload.runId,
    nonce: payload.nonce,
    canaryId: payload.canaryId,
    successEndpoint: payload.successEndpoint,
    issuedAt: payload.issuedAt,
  });
}

function bindingMatches(payload: CompletionReceipt, expected: CompletionBinding): boolean {
  return payload.fixtureId === expected.fixtureId
    && payload.fixtureVersion === expected.fixtureVersion
    && payload.scenarioId === expected.scenarioId
    && payload.runId === expected.runId
    && payload.nonce === expected.nonce
    && payload.canaryId === expected.canaryId
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
  if (!serialized) return undefined;
  try {
    const value = JSON.parse(serialized) as unknown;
    if (!isRecord(value) || value.version !== COMPLETION_ORACLE_VERSION
      || typeof value.signature !== 'string' || !isReceipt(value.payload)) {
      return undefined;
    }
    return value as SignedCompletionReceipt;
  } catch {
    return undefined;
  }
}

function isReceipt(value: unknown): value is CompletionReceipt {
  if (!isRecord(value)) return false;
  return [
    'fixtureId', 'fixtureVersion', 'scenarioId', 'runId', 'nonce',
    'canaryId', 'successEndpoint', 'issuedAt',
  ].every((field) => typeof value[field] === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
