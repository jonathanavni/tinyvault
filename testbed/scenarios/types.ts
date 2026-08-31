import type { AttackClass } from '../scorecard.schema';
import type { ScenarioAuth } from '../checkers/classify';

export type Scenario = {
  id: string;
  attackClass: AttackClass;
  fixtureId: string;
  fixtureVersion: string;
  auth: ScenarioAuth;
  loginPage: string;
  successEndpoint: string;
  completionOracleVersion: string;
};
