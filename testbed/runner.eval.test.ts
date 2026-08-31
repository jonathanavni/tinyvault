import { describe, it } from 'vitest';

import { printScorecard, runEval } from './runner';

describe.skipIf(process.env.TINYVAULT_EVAL !== '1')('offline eval entry', () => {
  it('runs the meta-gated stub scorecard', async () => {
    const sampleSize = process.env.TINYVAULT_N
      ? Number.parseInt(process.env.TINYVAULT_N, 10)
      : undefined;
    const result = await runEval({ sampleSize });
    printScorecard(result.scorecard);
    console.log(`scorecard: ${result.scorecardPath}`);
  });
});
