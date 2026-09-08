import type { ConstructionCode } from './docker/exec';
import type { RunDiagnostic } from './evaluationValidity';
import type { executionErrorDetails } from './realAgentRun';

const oversizedErrors = new WeakSet<object>();
const closedProjectErrors = new WeakSet<object>();
const terminatedErrors = new WeakSet<object>();
const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null;

export class EvidenceOversizedError extends Error {
  readonly runId: string;
  readonly byteLength: number;
  readonly cap: number;
  teardownCode?: ConstructionCode;
  constructor(input: { runId: string; byteLength: number; cap: number }, message = 'evidence-oversized') {
    super(message); this.name = 'EvidenceOversizedError';
    this.runId = input.runId; this.byteLength = input.byteLength; this.cap = input.cap;
    oversizedErrors.add(this);
  }
}
Object.freeze(EvidenceOversizedError.prototype);
export function isEvidenceOversized(value: unknown): value is EvidenceOversizedError {
  return isObject(value) && oversizedErrors.has(value);
}
export function markClosedProject(error: object): void {
  if (isObject(error)) closedProjectErrors.add(error);
}
export function isClosedProjectError(value: unknown): boolean {
  return isObject(value) && closedProjectErrors.has(value);
}

export type RunTerminal = {
  kind: 'evidence-oversized' | 'project-closed'; runId: string;
  code?: ConstructionCode; teardownCode?: ConstructionCode;
  row: RunDiagnostic; sidecarWriteFailed: boolean;
  scenarioCaptureWriteFailed?: boolean; causeName?: string;
};
type ErrorDetails = ReturnType<typeof executionErrorDetails>;
export class EvaluationTerminatedError extends Error {
  readonly kind: RunTerminal['kind'];
  readonly runId: string;
  readonly attempted: number;
  readonly expected: number;
  readonly code?: ConstructionCode;
  readonly teardownCode?: ConstructionCode;
  readonly row: RunDiagnostic;
  readonly sidecarWriteFailed: boolean;
  readonly scenarioCaptureWriteFailed?: boolean;
  readonly causeName?: string;
  fixtureCloseFailure?: ErrorDetails & { code?: ConstructionCode };
  persistFailed?: ErrorDetails;
  /** No `cause`: the run result would carry the plaintext canary into any inspected/printed form (security R3 P3-06). */
  constructor(input: RunTerminal & { attempted: number; expected: number }) {
    super(input.kind); this.name = 'EvaluationTerminatedError';
    this.kind = input.kind; this.runId = input.runId;
    this.attempted = input.attempted; this.expected = input.expected;
    this.code = input.code; this.teardownCode = input.teardownCode;
    this.row = input.row; this.sidecarWriteFailed = input.sidecarWriteFailed;
    this.scenarioCaptureWriteFailed = input.scenarioCaptureWriteFailed; this.causeName = input.causeName;
    terminatedErrors.add(this);
  }
}
Object.freeze(EvaluationTerminatedError.prototype);
export function isEvaluationTerminated(value: unknown): value is EvaluationTerminatedError {
  return isObject(value) && terminatedErrors.has(value);
}
