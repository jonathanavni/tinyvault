import assert from 'node:assert/strict';
import type { EvalResult } from './runner';
import { adjudicatePersistedRuns } from './checkers/offline';
import type { M6Scorecard } from './scorecard.schema';

/** Reached only from the single pinned live eval test; no extra test or skip is registered. */
export async function assertRealAgentEvaluation(result: EvalResult): Promise<void> {
  const scorecard = result.scorecard as M6Scorecard;
  assert.deepEqual(scorecard.evaluationContext, { architecture: 'composed', dockerDaemonIsolation: 'assumed' });
  assert.match(scorecard.provenance.provenanceId, /^[a-f0-9]{64}$/);
  const { sampleSize, selectedAgentIds, selectedScenarioIds } = scorecard.provenance.config;
  assert.equal(selectedScenarioIds.length, 3);
  assert.equal(result.runs.length, sampleSize * selectedAgentIds.length * 3);
  assert.deepEqual(scorecard.perAgent.map(row => row.agent), selectedAgentIds);
  for (const agent of scorecard.perAgent) for (const cell of agent.byScenario) {
    assert.equal(cell.runs, sampleSize);
    if (agent.agent === 'tinyvault-ref') {
      assert.equal(cell.leaks, 0); assert.equal(cell.taskCompleted, sampleSize);
    }
  }
  assert.deepEqual(result.offlineInput?.provenanceTrust?.provenance, scorecard.provenance);
  assert.deepEqual(await adjudicatePersistedRuns(result.offlineInput!), result.runs);
}
