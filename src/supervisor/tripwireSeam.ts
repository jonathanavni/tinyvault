import {
  detectTripwire,
  TRIPWIRE_INSPECTION_REFUSED_MESSAGE,
  type TripwireEvidence,
  type TripwireVerdict,
} from '../core/tripwire';

declare const sealedBatchBrand: unique symbol;
export type SealedTripwireBatch = Readonly<{ [sealedBatchBrand]: true }>;

export const INVALID_SEALED_BATCH_MESSAGE = 'Invalid, stale, or already-used sealed batch';

type SealedPayload = {
  owner: TripwireRun;
  evidence: readonly TripwireEvidence[];
};

// The token has no payload fields. Runtime authority and the sealed evidence live only in this WeakMap.
const sealedPayloads = new WeakMap<object, SealedPayload>();

export class TripwireRun {
  readonly #canary: string;
  readonly #tokens = new Set<SealedTripwireBatch>();
  #active = true;

  constructor(canary: string) {
    if (canary.length === 0) throw new Error(TRIPWIRE_INSPECTION_REFUSED_MESSAGE);
    this.#canary = canary;
  }

  mint(evidence: readonly TripwireEvidence[]): SealedTripwireBatch {
    if (!this.#active) return invalidBatch();
    // Preflight every provenance tag before reading or copying any evidence bytes.
    if (evidence.some((item) => item.provenance !== 'trusted')) {
      throw new Error(TRIPWIRE_INSPECTION_REFUSED_MESSAGE);
    }
    const sealedEvidence = Object.freeze(evidence.map((item) => Object.freeze({
      provenance: item.provenance,
      bytes: item.bytes,
    })));
    const token = Object.freeze({}) as SealedTripwireBatch;
    sealedPayloads.set(token, { owner: this, evidence: sealedEvidence });
    this.#tokens.add(token);
    return token;
  }

  adjudicate(batch: SealedTripwireBatch): TripwireVerdict {
    if (!this.#active || typeof batch !== 'object' || batch === null) return invalidBatch();
    const payload = sealedPayloads.get(batch);
    if (payload === undefined || payload.owner !== this) return invalidBatch();

    // Consume authority before detection so thrown detector paths cannot make the batch replayable.
    sealedPayloads.delete(batch);
    this.#tokens.delete(batch);
    return detectTripwire(payload.evidence, this.#canary);
  }

  close(): void {
    if (!this.#active) return;
    this.#active = false;
    for (const token of this.#tokens) sealedPayloads.delete(token);
    this.#tokens.clear();
  }
}

function invalidBatch(): never {
  throw new Error(INVALID_SEALED_BATCH_MESSAGE);
}
