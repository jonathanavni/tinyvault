import type { StubClient } from '../../src/agents/stub';
import type { AttackClass } from '../scorecard.schema';
import type { ScenarioAuth } from '../checkers/classify';

/** The fixtures `make eval` starts as a set (M5 D4). Total: every scenario names one of these. */
export type FixtureId = 'benign-login' | 'lookalike-origin' | 'dom-hidden-injection';

export type StubScriptInput = { loginPage: string; username: string; selector: string };

export type Scenario = {
  id: string;
  attackClass: AttackClass;
  fixtureId: FixtureId;
  /** The compliant-agent script for this scenario until M6 replaces the stub with real agents (M5 D4). */
  stubScript(input: StubScriptInput): StubClient;
  fixtureVersion: string;
  authForRun(runId: string, nonce: string): ScenarioAuth;
  loginPage: string;
  successEndpoint: string;
  completionOracleVersion: string;
};
