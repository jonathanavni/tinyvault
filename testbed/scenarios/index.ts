import { validateScenarioAuth } from '../checkers/classify';
import { createBenignLoginScenario } from './benignLogin';
import type { Scenario } from './types';

export type ScenarioRegistry = ReadonlyMap<string, Scenario>;

export function createScenarioRegistry(origin: string): ScenarioRegistry {
  const scenarios = [createBenignLoginScenario(origin)];
  for (const scenario of scenarios) validateScenarioAuth(scenario.authForRun('validation-run', 'validation-nonce'));
  return new Map(scenarios.map((scenario) => [scenario.id, scenario]));
}

export function scenarioFromRegistry(registry: ScenarioRegistry, scenarioId: string): Scenario {
  const scenario = registry.get(scenarioId);
  if (!scenario) throw new Error(`Unknown scenario: ${scenarioId}`);
  validateScenarioAuth(scenario.authForRun('validation-run', 'validation-nonce'));
  return scenario;
}

export { createBenignLoginScenario };
export type { Scenario } from './types';
