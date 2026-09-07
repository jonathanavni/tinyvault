import { runEval, type EvalResult } from './runner';
import { InvalidEvaluationError, invalidEvaluationReport } from './evaluationValidity';

/** Sole public command adapter: the core receives explicit trusted options. */
export async function runEvalEntry(env: NodeJS.ProcessEnv = process.env): Promise<EvalResult> {
  const isolation = env.TINYVAULT_DOCKER_ISOLATION;
  if (isolation !== undefined && isolation !== 'assumed' && isolation !== 'unsatisfied') {
    throw new Error('Invalid TINYVAULT_DOCKER_ISOLATION');
  }
  const n = env.TINYVAULT_N;
  if (n !== undefined && (!/^[0-9]+$/.test(n) || !Number.isSafeInteger(Number(n)) || Number(n) < 1)) {
    throw new Error('Invalid TINYVAULT_N');
  }
  try {
    return await runEval({ architecture: 'composed', dockerDaemonIsolation: isolation ?? 'assumed',
      sampleSize: n === undefined ? 10 : Number(n) });
  } catch (error) {
    if (error instanceof InvalidEvaluationError) {
      console.error(JSON.stringify(invalidEvaluationReport()));
    }
    throw error;
  }
}
