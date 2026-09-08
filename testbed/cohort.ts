import { randomBytes } from 'node:crypto';
import type { AgentConfig, EvaluationProfile } from './evalAgents';
import type { ExpectedRunIdentity } from './evaluationProvenance';
import type { ScenarioRegistry } from './scenarios';

export type Cohort = ReturnType<typeof createCohort>;

function mintToken(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  while (token.length < 8) {
    for (const byte of randomBytes(16)) {
      // 248 is the largest multiple of 62 below 256; rejection avoids modulo bias.
      if (byte < 248) token += alphabet[byte % alphabet.length];
      if (token.length === 8) break;
    }
  }
  return token;
}

export function createCohort(profile: Exclude<EvaluationProfile, 'stub'>, sampleSize: number,
  agents: ReadonlyMap<string, AgentConfig>, scenarios: ScenarioRegistry) {
  if (!Number.isSafeInteger(sampleSize) || sampleSize < 1) throw new Error('Invalid cohort sample size');
  const cohortId = mintToken();
  let executionId = mintToken();
  while (executionId === cohortId) executionId = mintToken();
  const expectedRuns: ExpectedRunIdentity[] = [];
  for (const scenario of scenarios.values()) for (const agent of agents.values()) {
    if (!/^[A-Za-z0-9-]+$/.test(scenario.id) || !['tinyvault-ref', 'naive-baseline'].includes(agent.id)) {
      throw new Error('Invalid trusted cohort inventory');
    }
    for (let runIndex = 0; runIndex < sampleSize; runIndex++) expectedRuns.push(Object.freeze({
      scenario: scenario.id, agent: agent.id, runIndex,
      runId: `${cohortId}-${scenario.id}-${agent.id}-${String(runIndex).padStart(2, '0')}`,
    }));
  }
  return Object.freeze({ profile, cohortId, executionId, sampleSize,
    selectedAgentIds: [...agents.keys()], selectedScenarioIds: [...scenarios.keys()],
    startedAt: new Date().toISOString(), expectedRuns: Object.freeze(expectedRuns) });
}
