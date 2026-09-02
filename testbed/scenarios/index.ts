import { validateScenarioAuth } from '../checkers/classify';
import { createBenignLoginScenario } from './benignLogin';
import type { FixtureId, Scenario } from './types';

export type ScenarioRegistry = ReadonlyMap<string, Scenario>;
export type FixtureOrigins = Readonly<Record<FixtureId, string>>;

export function placeholderFixtureOrigins(origin: string): FixtureOrigins {
  return {
    'benign-login': origin,
    'lookalike-origin': origin,
    'dom-hidden-injection': origin,
  };
}

export function createScenarioRegistry(
  origins: FixtureOrigins | string,
  scenarios?: readonly Scenario[],
): ScenarioRegistry {
  // The string branch keeps untouched M4 checker call sites source-compatible during commit 1.
  const originMap = typeof origins === 'string' ? placeholderFixtureOrigins(origins) : origins;
  const registered = scenarios ?? [createBenignLoginScenario(originMap['benign-login'])];
  for (const scenario of registered) {
    validateScenarioAuth(scenario.authForRun('validation-run', 'validation-nonce'));
  }
  return new Map(registered.map((scenario) => [scenario.id, scenario]));
}

export function scenarioFromRegistry(registry: ScenarioRegistry, scenarioId: string): Scenario {
  const scenario = registry.get(scenarioId);
  if (!scenario) throw new Error(`Unknown scenario: ${scenarioId}`);
  validateScenarioAuth(scenario.authForRun('validation-run', 'validation-nonce'));
  return scenario;
}

export { createBenignLoginScenario };
export type { Scenario } from './types';
