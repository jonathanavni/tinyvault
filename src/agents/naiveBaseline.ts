import type { PublicTaskRecipe } from '../../testbed/scenarios/types';
import { BASELINE_SYSTEM, prepareProfile, projectTask } from './prompt';

export type BaselineBootstrap = PublicTaskRecipe & { password: string };

/** The evaluator supplies its freshly minted synthetic per-run password; no vault capability enters here. */
export function createNaiveBaselineProfile(options: { runId: string; task: PublicTaskRecipe; password: string }) {
  if (typeof options.password !== 'string' || !options.password) throw new Error('Missing synthetic baseline credential');
  const bootstrapTask: BaselineBootstrap = { ...projectTask(options.task, options.runId), password: options.password };
  return prepareProfile('naive-baseline', options.runId, BASELINE_SYSTEM, bootstrapTask);
}
