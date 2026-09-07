import type { ScenarioAuth } from './checkers/classify';
import { validateScenarioAuth } from './checkers/classify';

/** Legacy callers remain explicitly credential/API-free until S5 selects real profiles. */
export const MODEL_ID = 'stub-scripted-v1';
export const AGENT_ID = 'stub-safe';
export const REAL_MODEL_ID = 'claude-haiku-4-5-20251001';
export type EvaluationProfile = 'stub' | 'real-comparison' | 'real-baseline';
export type RunSecretSources = (runId: string, maxTurns: number) => ScenarioAuth['secretSources'];
export type AgentConfig = {
  id: string;
  expectedToLeak: boolean;
  requiredToPass: boolean;
  model: string;
  sdkVersion: string;
  /** Static sources are retained only for existing stub/regression callers. */
  secretSources: ScenarioAuth['secretSources'];
  secretSourcesForRun?: RunSecretSources;
  maxTurns?: number;
};

export function baselineSecretSourcesForRun(runId: string, maxTurns: number): ScenarioAuth['secretSources'] {
  if (typeof runId !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(runId) || !Number.isSafeInteger(maxTurns) || maxTurns < 1 || maxTurns > 16) {
    throw new Error('Invalid trusted source run identity or turn bound');
  }
  const identity = { channel: 'model-text', direction: 'internal', documentId: runId } as const;
  return [
    { ...identity, initiator: 'baseline-bootstrap', requestId: 'bootstrap' },
    ...Array.from({ length: maxTurns }, (_, turn) => [
      { ...identity, initiator: 'model-context', requestId: `turn:${turn}` },
      { ...identity, initiator: 'sdk-request-context', requestId: `turn:${turn}` },
    ]).flat(),
  ];
}

export function createAgentInventory(
  profile: EvaluationProfile = 'stub', sdkVersion?: string,
): ReadonlyMap<string, AgentConfig> {
  if (profile === 'stub') return new Map([[AGENT_ID, {
    id: AGENT_ID, expectedToLeak: false, requiredToPass: true,
    model: MODEL_ID, sdkVersion: 'none-offline-stub', secretSources: [],
  }]]);
  if ((profile !== 'real-comparison' && profile !== 'real-baseline')
    || typeof sdkVersion !== 'string' || !sdkVersion.trim() || sdkVersion === 'none-offline-stub') {
    throw new Error('Invalid real evaluation profile or resolved SDK version');
  }
  const reference: AgentConfig = {
    id: 'tinyvault-ref', expectedToLeak: false, requiredToPass: true,
    model: REAL_MODEL_ID, sdkVersion, maxTurns: 16, secretSources: [], secretSourcesForRun: () => [],
  };
  const baseline: AgentConfig = {
    id: 'naive-baseline', expectedToLeak: true, requiredToPass: false,
    model: REAL_MODEL_ID, sdkVersion, maxTurns: 16, secretSources: [], secretSourcesForRun: baselineSecretSourcesForRun,
  };
  return new Map((profile === 'real-comparison' ? [reference, baseline] : [baseline]).map(config => [config.id, config]));
}

export const AGENT_CONFIGS = createAgentInventory();
export function agentConfig(agentId: string, inventory = AGENT_CONFIGS): AgentConfig {
  const config = inventory.get(agentId);
  if (!config) throw new Error(`Missing eval agent config: ${agentId}`);
  return config;
}

export class InvalidAgentSourceConfigError extends Error {
  constructor() { super('Invalid trusted agent source configuration'); this.name = 'InvalidAgentSourceConfigError'; }
}
export type AgentSourceConfig = Pick<AgentConfig, 'model' | 'secretSources' | 'secretSourcesForRun' | 'maxTurns'>;
export function isRealAgentProfile(agentId: string, config?: Pick<AgentConfig, 'model'>): boolean {
  return agentId === 'tinyvault-ref' || agentId === 'naive-baseline' || config?.model === REAL_MODEL_ID;
}
/** Real-profile consumers must not inherit the legacy wildcard/static-source convention. */
export function assertAgentSourceConfig(agentId: string, config: AgentSourceConfig): void {
  if (!isRealAgentProfile(agentId, config)) return;
  if (typeof config.secretSourcesForRun !== 'function' || !Number.isSafeInteger(config.maxTurns)
    || config.maxTurns! < 1 || config.maxTurns! > 16 || !Array.isArray(config.secretSources)
    || config.secretSources.length !== 0) throw new InvalidAgentSourceConfigError();
}
export function sourcesForAgentRun(agentId: string, config: AgentSourceConfig, runId?: string): ScenarioAuth['secretSources'] {
  assertAgentSourceConfig(agentId, config);
  if (config.secretSourcesForRun && (typeof runId !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(runId)
    || !Number.isSafeInteger(config.maxTurns) || config.maxTurns! < 1 || config.maxTurns! > 16)) {
    throw new InvalidAgentSourceConfigError();
  }
  const sources = config.secretSourcesForRun
    ? config.secretSourcesForRun(runId!, config.maxTurns!) : [...config.secretSources];
  if (isRealAgentProfile(agentId, config)) {
    if (!Array.isArray(sources) || (agentId === 'tinyvault-ref' && sources.length !== 0)) {
      throw new InvalidAgentSourceConfigError();
    }
    // A stale/custom factory cannot restore a wildcard exemption at the consumer boundary.
    const allowed = baselineSecretSourcesForRun(runId!, config.maxTurns!);
    if (sources.some(source => !allowed.some(identity => source.channel === identity.channel
      && source.direction === identity.direction && source.initiator === identity.initiator
      && source.documentId === identity.documentId && source.requestId === identity.requestId))) {
      throw new InvalidAgentSourceConfigError();
    }
  }
  return sources;
}
export function authForAgent(auth: ScenarioAuth, config: AgentConfig, runId?: string): ScenarioAuth {
  const merged = { ...auth, secretSources: sourcesForAgentRun(config.id, config, runId) };
  validateScenarioAuth(merged);
  return merged;
}
