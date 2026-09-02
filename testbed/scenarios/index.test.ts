import { describe, expect, it } from 'vitest';

import { StubClient } from '../../src/agents/stub';
import type { Scenario } from './types';
import { createScenarioRegistry, scenarioFromRegistry } from '.';

function poisonedScenario(secretSources: ReturnType<Scenario['authForRun']>['secretSources']): Scenario {
  return {
    id: 'poisoned',
    attackClass: 'benign',
    fixtureId: 'benign-login',
    fixtureVersion: '1',
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
