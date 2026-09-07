/** Environmental assumption supplied by trusted evaluation callers, never a measured guarantee. */
export const DOCKER_DAEMON_ISOLATION_REQUIREMENT = 'A valid composed evaluation assumes the Docker Engine API is unreachable by the evaluated browser, page content and agent. Local endpoint validation does not verify this assumption. An unsatisfied assumption invalidates the evaluation.';
export type EvaluationContext = Readonly<
  | { architecture: 'in-process'; dockerDaemonIsolation: 'not-applicable' }
  | { architecture: 'composed'; dockerDaemonIsolation: 'assumed' | 'unsatisfied' }
>;
export type ValidEvaluationContext = Readonly<
  | { architecture: 'in-process'; dockerDaemonIsolation: 'not-applicable' }
  | { architecture: 'composed'; dockerDaemonIsolation: 'assumed' }
>;
export type DeploymentAssumption = Readonly<{
  requirement: typeof DOCKER_DAEMON_ISOLATION_REQUIREMENT;
  applicability: 'required' | 'composed-only';
}>;
export type InvalidEvaluationReport = Readonly<{
  status: 'invalid'; reason: 'docker-daemon-isolation-unsatisfied'; architecture: 'composed';
  requirement: typeof DOCKER_DAEMON_ISOLATION_REQUIREMENT;
}>;
export class InvalidEvaluationError extends Error {
  readonly reason = 'docker-daemon-isolation-unsatisfied' as const;
  constructor() { super('docker-daemon-isolation-unsatisfied'); this.name = 'InvalidEvaluationError'; }
}
export function invalidEvaluationReport(): InvalidEvaluationReport {
  return Object.freeze({ status: 'invalid', reason: 'docker-daemon-isolation-unsatisfied',
    architecture: 'composed', requirement: DOCKER_DAEMON_ISOLATION_REQUIREMENT });
}
function exactDataKeys(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Reflect.ownKeys(value).length !== keys.length
    || keys.some((key) => !Object.hasOwn(value, key)
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, 'value'))) {
    throw new Error('Invalid evaluation metadata');
  }
}
export function normalizeEvaluationContext(
  architecture: EvaluationContext['architecture'] = 'in-process',
  dockerDaemonIsolation?: EvaluationContext['dockerDaemonIsolation'],
): EvaluationContext {
  if (architecture !== 'in-process' && architecture !== 'composed') {
    throw new Error('Unknown fixture architecture');
  }
  const isolation = dockerDaemonIsolation === undefined ? (architecture === 'composed' ? 'assumed' : 'not-applicable') : dockerDaemonIsolation;
  if ((architecture === 'in-process' && isolation !== 'not-applicable')
    || (architecture === 'composed' && isolation !== 'assumed' && isolation !== 'unsatisfied')) {
    throw new Error('Invalid evaluation metadata');
  }
  return Object.freeze({ architecture, dockerDaemonIsolation: isolation }) as EvaluationContext;
}
export function assertValidEvaluationContext(value: unknown): asserts value is ValidEvaluationContext {
  exactDataKeys(value, ['architecture', 'dockerDaemonIsolation']);
  const context = normalizeEvaluationContext(value.architecture as EvaluationContext['architecture'],
    value.dockerDaemonIsolation as EvaluationContext['dockerDaemonIsolation']);
  // Explicit undefined literals are not defaults at a direct context boundary.
  if (value.architecture !== context.architecture || value.dockerDaemonIsolation !== context.dockerDaemonIsolation) {
    throw new Error('Invalid evaluation metadata');
  }
  if (context.dockerDaemonIsolation === 'unsatisfied') throw new InvalidEvaluationError();
}
export function deploymentAssumption(context: ValidEvaluationContext): DeploymentAssumption {
  return Object.freeze({ requirement: DOCKER_DAEMON_ISOLATION_REQUIREMENT,
    applicability: context.architecture === 'composed' ? 'required' : 'composed-only' });
}
export function assertScorecardMetadata(scorecard: {
  evaluationContext: unknown; deploymentAssumption: unknown;
}): void {
  assertValidEvaluationContext(scorecard.evaluationContext);
  exactDataKeys(scorecard.deploymentAssumption, ['requirement', 'applicability']);
  const expected = deploymentAssumption(scorecard.evaluationContext);
  if (scorecard.deploymentAssumption.requirement !== expected.requirement
    || scorecard.deploymentAssumption.applicability !== expected.applicability) {
    throw new Error('Invalid evaluation metadata');
  }
}
