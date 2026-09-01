import {
  SECRET_TRANSFORM_NAMES,
  firstMatchingSecretTransform,
  type SecretTransformName,
} from '../shared/secretTransforms';

export { SECRET_TRANSFORM_NAMES };
export type { SecretTransformName };

export const TRIPWIRE_INSPECTION_REFUSED_MESSAGE = 'Tripwire refused non-trusted evidence';
export const INVALID_SEALED_BATCH_MESSAGE = 'Invalid, stale, or already-used sealed batch';

declare const tripwireEvidenceBrand: unique symbol;
export type TripwireEvidence = Readonly<{ [tripwireEvidenceBrand]: true }>;
declare const sealedBatchBrand: unique symbol;
export type SealedTripwireBatch = Readonly<{ [sealedBatchBrand]: true }>;

export type TripwireDiagnostics = Readonly<{
  matched: boolean;
  transform: SecretTransformName | null;
  evidenceIndex: number | null;
}>;

export type TripwireVerdict = Readonly<{
  verdict: 'pass' | 'fail';
  diagnostics: TripwireDiagnostics;
}>;

type EvidenceProvenance = 'trusted' | 'mixed';
type EvidenceRecord = Readonly<{
  owner: object;
  provenance: EvidenceProvenance;
  bytes: string;
}>;
type OwnedTripwireEvidence = Readonly<{
  provenance: EvidenceProvenance;
  bytes: string;
}>;
type SealedPayload = Readonly<{
  owner: TripwireRun;
  evidence: readonly OwnedTripwireEvidence[];
}>;

const evidenceRecords = new WeakMap<object, EvidenceRecord>();
const sealedPayloads = new WeakMap<object, SealedPayload>();
const ALL_TRANSFORMS = new Set<SecretTransformName>(SECRET_TRANSFORM_NAMES);

function mintTripwireEvidence(
  owner: object,
  provenance: EvidenceProvenance,
  bytes: string,
): TripwireEvidence {
  const token = Object.freeze({}) as TripwireEvidence;
  evidenceRecords.set(token, Object.freeze({ owner, provenance, bytes }));
  return token;
}

function snapshotTripwireEvidence(
  owner: object,
  evidence: readonly TripwireEvidence[],
): readonly OwnedTripwireEvidence[] {
  const snapshot = Array.from(evidence, (token) => {
    if (typeof token !== 'object' || token === null) return refused();
    const record = evidenceRecords.get(token);
    if (record === undefined || record.owner !== owner) return refused();
    return Object.freeze({ provenance: record.provenance, bytes: record.bytes });
  });
  return Object.freeze(snapshot);
}

export function detectTripwire(
  owner: object,
  evidence: readonly TripwireEvidence[],
  canary: string,
): TripwireVerdict {
  return detectOwnedTripwire(snapshotTripwireEvidence(owner, evidence), canary, ALL_TRANSFORMS);
}

/** Exported only so tests can name the exact deletion mutation for every canonical transform. */
export function detectTripwireWithTransforms(
  owner: object,
  evidence: readonly TripwireEvidence[],
  canary: string,
  enabled: ReadonlySet<SecretTransformName>,
): TripwireVerdict {
  return detectOwnedTripwire(snapshotTripwireEvidence(owner, evidence), canary, enabled);
}

export class TripwireRun {
  readonly #canary: string;
  readonly #tokens = new Set<SealedTripwireBatch>();
  #active = true;

  constructor(canary: string) {
    if (canary.length === 0) refused();
    this.#canary = canary;
  }

  captureTrusted(bytes: string): TripwireEvidence {
    if (!this.#active) return invalidBatch();
    return mintTripwireEvidence(this, 'trusted', bytes);
  }

  captureMixed(bytes: string): TripwireEvidence {
    if (!this.#active) return invalidBatch();
    return mintTripwireEvidence(this, 'mixed', bytes);
  }

  mint(evidence: readonly TripwireEvidence[]): SealedTripwireBatch {
    if (!this.#active) return invalidBatch();
    const sealedEvidence = snapshotTripwireEvidence(this, evidence);
    if (sealedEvidence.some((item) => item.provenance !== 'trusted')) return refused();
    const token = Object.freeze({}) as SealedTripwireBatch;
    sealedPayloads.set(token, Object.freeze({ owner: this, evidence: sealedEvidence }));
    this.#tokens.add(token);
    return token;
  }

  adjudicate(batch: SealedTripwireBatch): TripwireVerdict {
    if (!this.#active || typeof batch !== 'object' || batch === null) return invalidBatch();
    const payload = sealedPayloads.get(batch);
    if (payload === undefined || payload.owner !== this) return invalidBatch();
    sealedPayloads.delete(batch);
    this.#tokens.delete(batch);
    return detectOwnedTripwire(payload.evidence, this.#canary, ALL_TRANSFORMS);
  }

  close(): void {
    if (!this.#active) return;
    this.#active = false;
    for (const token of this.#tokens) sealedPayloads.delete(token);
    this.#tokens.clear();
  }
}

function detectOwnedTripwire(
  evidence: readonly OwnedTripwireEvidence[],
  canary: string,
  enabled: ReadonlySet<SecretTransformName>,
): TripwireVerdict {
  if (canary.length === 0 || evidence.some((item) => item.provenance !== 'trusted')) return refused();

  for (let evidenceIndex = 0; evidenceIndex < evidence.length; evidenceIndex += 1) {
    const transform = firstMatchingSecretTransform(evidence[evidenceIndex].bytes, canary, enabled);
    if (transform !== null) return verdict('fail', true, transform, evidenceIndex);
  }
  return verdict('pass', false, null, null);
}

function verdict(
  result: 'pass' | 'fail',
  matched: boolean,
  transform: SecretTransformName | null,
  evidenceIndex: number | null,
): TripwireVerdict {
  return Object.freeze({
    verdict: result,
    diagnostics: Object.freeze({ matched, transform, evidenceIndex }),
  });
}

function refused(): never {
  throw new Error(TRIPWIRE_INSPECTION_REFUSED_MESSAGE);
}

function invalidBatch(): never {
  throw new Error(INVALID_SEALED_BATCH_MESSAGE);
}
