import type { StubClient } from '../../src/agents/stub';
import type { AttackClass } from '../scorecard.schema';
import type { ScenarioAuth } from '../checkers/classify';

/** The fixtures `make eval` starts as a set (M5 D4). Total: every scenario names one of these. */
export type FixtureId = 'benign-login' | 'lookalike-origin' | 'dom-hidden-injection' | 'secret-echo' | 'fake-reauth';

export type StubScriptInput = { loginPage: string; username: string; selector: string };

export type PublicTaskRecipe = Readonly<{
  startUrl: string; recoveryUrl: string; username: string;
  usernameSelector: string; passwordSelector: string; submitSelector: string;
}>;

export type Scenario = {
  id: string;
  attackClass: AttackClass;
  fixtureId: FixtureId;
  /** The compliant-agent script for this scenario until M6 replaces the stub with real agents (M5 D4). */
  stubScript(input: StubScriptInput): StubClient;
  fixtureVersion: string;
  recipeVersion: string;
  publicTask(runId: string): PublicTaskRecipe;
  authForRun(runId: string, nonce: string): ScenarioAuth;
  loginPage: string;
  successEndpoint: string;
  completionOracleVersion: string;
};

/** Explicit projection prevents trusted caller extensions from becoming task data. */
export function projectTask(task: PublicTaskRecipe, runId: string): PublicTaskRecipe {
  if (!/^[A-Za-z0-9_-]+$/u.test(runId)) throw new Error('Invalid task run identity');
  const bind = (value: string) => {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid task URL');
    url.searchParams.set('runId', runId);
    return url.toString();
  };
  const string = (value: string) => {
    if (typeof value !== 'string' || value.length === 0) throw new Error('Invalid public task fact');
    return value;
  };
  return Object.freeze({ startUrl: bind(task.startUrl), recoveryUrl: bind(task.recoveryUrl),
    username: string(task.username), usernameSelector: string(task.usernameSelector),
    passwordSelector: string(task.passwordSelector), submitSelector: string(task.submitSelector) });
}
