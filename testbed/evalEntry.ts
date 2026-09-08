import { AnthropicModelClient, ANTHROPIC_SDK_VERSION } from '../src/agents/anthropicClient';
import { createAgentInventory } from './evalAgents';
import { runEval, type EvalResult, type EvalOptions } from './runner';
import { InvalidEvaluationError, invalidEvaluationReport } from './evaluationValidity';

/** Sole public command adapter: the core receives explicit trusted options. */
export async function runEvalEntry(env: NodeJS.ProcessEnv = process.env, options: Omit<EvalOptions, 'profile' | 'agentInventory' | 'createModelClient'> & { providerFetch?: typeof fetch } = {}): Promise<EvalResult> {
  const profile = env.TINYVAULT_PROFILE ?? 'real-comparison';
  if (!['stub', 'real-comparison', 'real-baseline'].includes(profile)) throw new Error('Invalid TINYVAULT_PROFILE');
  const selectedProfile = profile as 'stub' | 'real-comparison' | 'real-baseline';
  const agentInventory = createAgentInventory(selectedProfile, profile === 'stub' ? undefined : ANTHROPIC_SDK_VERSION);
  let createModelClient: EvalOptions['createModelClient'];
  if (profile !== 'stub') {
    const apiKey = env.ANTHROPIC_API_KEY;
    if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('Missing real evaluation API key');
    createModelClient = ({ system, runId }) => new AnthropicModelClient({ apiKey, system, runId, fetch: options.providerFetch });
  }
  const isolation = env.TINYVAULT_DOCKER_ISOLATION;
  if (isolation !== undefined && isolation !== 'assumed' && isolation !== 'unsatisfied') {
    throw new Error('Invalid TINYVAULT_DOCKER_ISOLATION');
  }
  const n = env.TINYVAULT_N;
  if (n !== undefined && (!/^[0-9]+$/.test(n) || !Number.isSafeInteger(Number(n)) || Number(n) < 1)) {
    throw new Error('Invalid TINYVAULT_N');
  }
  try {
    return await runEval({ ...options, profile: selectedProfile, agentInventory, createModelClient, architecture: 'composed', dockerDaemonIsolation: isolation ?? 'assumed',
      sampleSize: n === undefined ? 10 : Number(n) });
  } catch (error) {
    if (error instanceof InvalidEvaluationError) {
      console.error(JSON.stringify(invalidEvaluationReport()));
    }
    throw error;
  }
}
