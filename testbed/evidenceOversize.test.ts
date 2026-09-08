import { expect, it } from 'vitest';
import { EvidenceOversizedError, EvaluationTerminatedError, isEvidenceOversized,
  isClosedProjectError, isEvaluationTerminated, markClosedProject } from './evidenceOversize';

it('WeakSets reject shape, message and prototype forgeries and ignore non-object marks', () => {
  const error = new EvidenceOversizedError({ runId: 'A', byteLength: 131073, cap: 131072 });
  expect(isEvidenceOversized(error)).toBe(true); expect(isClosedProjectError(error)).toBe(false);
  for (const forged of [{ ...error }, Object.create(EvidenceOversizedError.prototype),
    new Error('evidence-oversized'), null, undefined, 'evidence-oversized', 1]) {
    expect(isEvidenceOversized(forged)).toBe(false); expect(isClosedProjectError(forged)).toBe(false);
    expect(isEvaluationTerminated(forged)).toBe(false);
  }
  for (const value of [null, undefined, 1, 'closed', true, Symbol('closed')]) {
    expect(() => markClosedProject(value as never)).not.toThrow(); expect(isClosedProjectError(value)).toBe(false);
  }
  markClosedProject(error); expect(isClosedProjectError(error)).toBe(true);
  expect(isClosedProjectError({ ...error })).toBe(false);
  expect(Object.isFrozen(EvidenceOversizedError.prototype)).toBe(true);
  expect(Object.isFrozen(error)).toBe(false);
  error.teardownCode = 'compose-down'; expect(error.teardownCode).toBe('compose-down');
});
it('termination carries trusted data and cause with a frozen prototype and unforgeable predicate', () => {
  const cause = new Error('initiator');
  const row = { scenario: 's', agent: 'a', runIndex: 0, runId: 'A',
    artifacts: { eventsPath: 'events', transcriptPath: 'transcript', fixtureCapturePath: 'capture' },
    status: 'execution-failed' as const, reason: 'evidence-oversized' as const, acceptedOutcome: null };
  const error = new EvaluationTerminatedError({ kind: 'evidence-oversized', runId: 'A', attempted: 1,
    expected: 6, row, sidecarWriteFailed: true }, cause);
  expect(isEvaluationTerminated(error)).toBe(true); expect(error.row).toBe(row); expect(error.cause).toBe(cause);
  for (const forged of [{ ...error }, Object.create(EvaluationTerminatedError.prototype)]) expect(isEvaluationTerminated(forged)).toBe(false);
  expect(Object.isFrozen(EvaluationTerminatedError.prototype)).toBe(true); expect(Object.isFrozen(error)).toBe(false);
  error.persistFailed = { name: 'Error', message: 'disk' }; expect(error.persistFailed.message).toBe('disk');
});
