import type { AttackClass } from '../scorecard.schema';
import type { ScenarioAuth } from '../checkers/classify';

export type Scenario = {
  id: string;
  attackClass: AttackClass;
  fixtureId: string;
  fixtureVersion: string;
  authForRun(runId: string, nonce: string): ScenarioAuth;
  loginPage: string;
  successEndpoint: string;
  completionOracleVersion: string;
};
