// Session-private authority. No runtime entropy or clock configuration; tests mock Node modules.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { decodeBase64url } from '../handshake';
import { BridgeError, CAPABILITY_OPS, type CapabilityOp, type FixtureId } from '../protocol';

export type CapabilityScope = { epoch: string; fixtureId: FixtureId; runId: string };
export type Capabilities = Record<CapabilityOp, string>;
type Token = CapabilityScope & { operation: CapabilityOp; instance: Buffer; bytes: Buffer; consumed: boolean };
type Run = { issued: number; finalized: boolean; tokens: Record<CapabilityOp, Token> };
const TTL_MS = 60000;
const MAX_RUNS = 32;
export class CapabilityRegistry {
  readonly #instance = randomBytes(32);
  readonly #runs = new Map<string, Run>();
  readonly #issued: Buffer[] = [];
  #closed = false;
  constructor(readonly fixtureId: FixtureId, readonly epoch: string) {
    if (this.#instance.length !== 32) throw new BridgeError('control-limit');
  }
  register(scope: CapabilityScope): Capabilities {
    this.#checkScope(scope);
    if (this.#runs.has(scope.runId)) throw new BridgeError('run-state');
    if (this.#runs.size >= MAX_RUNS) throw new BridgeError('control-limit');
    const issued = performance.now();
    const tokens = {} as Record<CapabilityOp, Token>;
    const result = {} as Capabilities;
    try {
      for (const operation of CAPABILITY_OPS) {
        const bytes = randomBytes(32);
        if (bytes.length !== 32 || this.#issued.some((issued) => issued.equals(bytes))) {
          bytes.fill(0);
          throw new BridgeError('control-limit');
        }
        this.#issued.push(bytes);
        tokens[operation] = { ...scope, operation, instance: this.#instance, bytes, consumed: false };
        result[operation] = bytes.toString('base64url');
      }
      this.#runs.set(scope.runId, { issued, finalized: false, tokens });
      return result;
    } catch (error) { this.close(); throw error; }
  }
  authorize(scope: CapabilityScope, operation: CapabilityOp, capability: string): void {
    if (this.#closed) throw new BridgeError('capability-refused');
    const bytes = decodeBase64url(capability, 32, 'capability-refused');
    try {
      // Search by capability first so explicit scope checks cannot be replaced by run existence.
      const token = [...this.#runs.values()].flatMap((run) => Object.values(run.tokens))
        .find((candidate) => timingSafeEqual(candidate.bytes, bytes));
      if (!token || token.fixtureId !== scope.fixtureId || token.epoch !== scope.epoch
        || token.runId !== scope.runId || token.operation !== operation || token.instance !== this.#instance
        || token.consumed) throw new BridgeError('capability-refused');
      const run = this.#runs.get(scope.runId);
      if (!run || performance.now() >= run.issued + TTL_MS) throw new BridgeError('capability-refused');
      if ((operation === 'capture' || operation === 'attest' || operation === 'ack') && !run.finalized) {
        throw new BridgeError('run-state');
      }
      if (operation === 'finalize' || operation === 'ack' || operation === 'attest') token.consumed = true;
      if (operation === 'ack') run.tokens.receipt.consumed = true;
    } finally { bytes.fill(0); }
  }
  markFinalized(runId: string): void {
    const run = this.#runs.get(runId);
    if (this.#closed || !run || !run.tokens.finalize.consumed) throw new BridgeError('run-state');
    run.finalized = true;
  }
  #checkScope(scope: CapabilityScope): void {
    if (this.#closed || scope.epoch !== this.epoch || scope.fixtureId !== this.fixtureId) {
      throw new BridgeError('capability-refused');
    }
  }
  close(): void {
    this.#closed = true;
    for (const bytes of this.#issued) bytes.fill(0);
    this.#issued.length = 0;
    this.#instance.fill(0);
    this.#runs.clear();
  }
}
