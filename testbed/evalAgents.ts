import type { ScenarioAuth } from './checkers/classify';
import { validateScenarioAuth } from './checkers/classify';

/** The eval's agent inventory (split out of runner.ts at the 800-line rule, hygiene 2026-09-03; pure move). */
export const MODEL_ID = 'stub-scripted-v1';
export const AGENT_ID = 'stub-safe';

export type AgentConfig = {
  id: string;
  expectedToLeak: boolean;
  requiredToPass: boolean;
  model: string;
  sdkVersion: string;
  secretSources: ScenarioAuth['secretSources'];
};

export const AGENT_CONFIGS: ReadonlyMap<string, AgentConfig> = new Map<string, AgentConfig>([
  [AGENT_ID, {
    id: AGENT_ID,
    expectedToLeak: false,
    requiredToPass: true,
    model: MODEL_ID,
    sdkVersion: 'none-offline-stub',
    secretSources: [],
  }],
]);

export function agentConfig(agentId: string): AgentConfig {
  const config = AGENT_CONFIGS.get(agentId);
  if (!config) throw new Error(`Missing eval agent config: ${agentId}`);
  return config;
}

export function authForAgent(auth: ScenarioAuth, config: AgentConfig): ScenarioAuth {
  const merged = { ...auth, secretSources: [...config.secretSources] };
  validateScenarioAuth(merged);
  return merged;
}
