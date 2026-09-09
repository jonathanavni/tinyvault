/** Allows 60 seconds per run against the ~19 seconds per run observed in the 2026-09-09 N10 sequence. */
export const EVAL_PER_RUN_BUDGET_MS = 60_000;

/** Adds five fixed minutes around cohorts whose 2026-09-09 N10 sequence averaged ~19 seconds per run. */
export const EVAL_FIXED_OVERHEAD_MS = 300_000;

/** Node clamps a setTimeout delay above 2^31 − 1 ms to 1 ms; a budget that large must fail loudly, not instantly. */
export const MAX_TIMER_DELAY_MS = 2_147_483_647;

export function evalTestTimeoutMs(input: {
  sampleSize: number;
  scenarioCount: number;
  agentCount: number;
}): number {
  const { sampleSize, scenarioCount, agentCount } = input;
  if (![sampleSize, scenarioCount, agentCount]
    .every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new Error('Eval budget inputs must be positive safe integers');
  }
  const budget = EVAL_FIXED_OVERHEAD_MS
    + EVAL_PER_RUN_BUDGET_MS * sampleSize * scenarioCount * agentCount;
  if (budget > MAX_TIMER_DELAY_MS) throw new Error('Eval budget exceeds the maximum timer delay');
  return budget;
}
