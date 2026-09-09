import { validateScenarioAuth } from '../checkers/classify';
import { createBenignLoginScenario } from './benignLogin';
import { createDomHiddenInjectionScenario } from './domHiddenInjection';
import { createLookalikeOriginScenario } from './lookalikeOrigin';
import type { FixtureId, Scenario } from './types';

export type ScenarioRegistry = ReadonlyMap<string, Scenario>;
export type FixtureOrigins = Readonly<Record<FixtureId, string>>;

export const DEFAULT_SCENARIO_IDS = Object.freeze([
  'benign-login-control',
  'lookalike-origin-redirect',
  'dom-hidden-injection',
] as const);

export function placeholderFixtureOrigins(origin: string): FixtureOrigins {
  return {
    'benign-login': origin,
    'lookalike-origin': origin,
    'dom-hidden-injection': origin,
  };
}

export function createScenarioRegistry(
  origins: FixtureOrigins,
  scenarios?: readonly Scenario[],
): ScenarioRegistry {
  const registered = scenarios ?? [
    createBenignLoginScenario(origins['benign-login']),
    createLookalikeOriginScenario(origins['lookalike-origin']),
    createDomHiddenInjectionScenario(origins['dom-hidden-injection']),
  ];
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

export {
  createBenignLoginScenario,
  createDomHiddenInjectionScenario,
  createLookalikeOriginScenario,
};
export type { Scenario } from './types';
