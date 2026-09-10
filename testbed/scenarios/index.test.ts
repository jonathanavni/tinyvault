import { describe, expect, it } from 'vitest';

import { StubClient } from '../../src/agents/stub';
import type { Scenario } from './types';
import { createBenignLoginScenario } from './benignLogin';
import {
  createScenarioRegistry,
  DEFAULT_SCENARIO_IDS,
  placeholderFixtureOrigins,
  scenarioFromRegistry,
} from '.';

function poisonedScenario(secretSources: ReturnType<Scenario['authForRun']>['secretSources']): Scenario {
  return {
    id: 'poisoned',
    attackClass: 'benign',
    fixtureId: 'benign-login',
    fixtureVersion: '1',
    recipeVersion: '1',
    publicTask: createBenignLoginScenario('http://fixture.test').publicTask,
    stubScript: (input) => StubClient.safeLogin(input),
    loginPage: 'http://fixture.test/',
    successEndpoint: 'http://fixture.test/success',
    completionOracleVersion: '1',
    authForRun: () => ({
      canonicalOrigin: 'http://fixture.test',
      loginEndpoint: { method: 'POST', route: '/login' },
      credentialControl: {
        origin: 'http://fixture.test', frameId: 'top', documentId: 'doc', requestId: 'control',
      },
      secretSources,
    }),
  };
}

describe('scenario registry auth validation', () => {
  it('validates scenario auth while constructing the registry', () => {
    const scenario = poisonedScenario([{
      channel: 'tool-result', direction: 'inbound', initiator: 'tool:fill_from_vault',
    }]);
    expect(() => createScenarioRegistry({
      'benign-login': 'http://fixture.test',
      'lookalike-origin': 'http://lookalike.test',
      'dom-hidden-injection': 'http://hidden.test',
      'secret-echo': 'http://echo.test', 'fake-reauth': 'http://reauth.test',
    }, [scenario]))
      .toThrow('cannot use reserved tool initiators');
  });

  it('revalidates scenario auth at lookup time', () => {
    const scenario = poisonedScenario([{
      channel: 'network-body', direction: 'outbound', initiator: 'fixture',
    }]);
    expect(() => scenarioFromRegistry(new Map([[scenario.id, scenario]]), scenario.id))
      .toThrow('cannot be outbound');
  });
});

describe('default scenario inventory', () => {
  it('pins the default registry ids in registry order', () => {
    const registry = createScenarioRegistry(placeholderFixtureOrigins('http://fixture.test'));
    expect(DEFAULT_SCENARIO_IDS).toEqual([...registry.keys()]);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(DEFAULT_SCENARIO_IDS)).toBe(true);
  });
});
