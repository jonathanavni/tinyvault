// One reviewed command list; check-test-entry re-exports it for the in-suite equality pin.
export const DOCKER_TEST = 'testbed/docker/composed.docker.test.ts';
export const TIMING_TESTS = ['testbed/checkers/leakDecoders.timing.test.ts', 'src/supervisor/host.timing.browser.test.ts'];
export const REPORTS = ['.vitest/main.json', '.vitest/timing-1.json', '.vitest/timing-2.json'];
export const DOCKER_REPORT = '.vitest/docker.json';
export const START_FILE = '.vitest/test-start.json';
export const DOCKER_START_FILE = '.vitest/docker-start.json';
export const EXPECTED_TEST_COMMANDS = Object.freeze([
  'node scripts/check-test-entry.mjs',
  'tsc --noEmit',
  'node --experimental-import-meta-resolve scripts/check-dependency-boundary.mjs',
  'node --experimental-import-meta-resolve scripts/dependency-boundary.selftest.mjs',
  'node scripts/check-docker-invocation.mjs',
  'node scripts/docker-invocation.selftest.mjs',
  'node scripts/check-compose.mjs',
  'node scripts/compose-lint.selftest.mjs',
  'node scripts/check-acceptance-j-results.mjs',
  `vitest run --exclude '${TIMING_TESTS[1]}' --exclude '${TIMING_TESTS[0]}' --reporter=json --outputFile=${REPORTS[0]}`,
  `vitest run ${TIMING_TESTS[0]} --reporter=json --outputFile=${REPORTS[1]}`,
  `vitest run ${TIMING_TESTS[1]} --reporter=json --outputFile=${REPORTS[2]}`,
  'node scripts/check-test-execution.mjs',
]);
export const EXPECTED_DOCKER_COMMANDS = Object.freeze([
  'node scripts/check-test-entry.mjs --docker',
  `vitest run --config vitest.docker.config.ts --reporter=json --outputFile=${DOCKER_REPORT}`,
  'node scripts/check-test-execution.mjs --docker',
]);

export const EVAL_TEST = 'testbed/runner.eval.test.ts';
export const EVAL_REPORT = '.vitest/eval.json';
export const EVAL_START_FILE = '.vitest/eval-start.json';
export const EXPECTED_EVAL_COMMAND = 'node scripts/check-test-entry.mjs --eval && TINYVAULT_EVAL=1 vitest run --config vitest.eval.config.ts --reporter=verbose --reporter=json --outputFile.json=.vitest/eval.json && node scripts/check-test-execution.mjs --eval';
export const EXPECTED_BASELINE_COMMAND = 'node scripts/check-test-entry.mjs --eval && TINYVAULT_PROFILE=real-baseline TINYVAULT_EVAL=1 vitest run --config vitest.eval.config.ts --reporter=verbose --reporter=json --outputFile.json=.vitest/eval.json && node scripts/check-test-execution.mjs --eval';
export const EXPECTED_EVAL_STUB_COMMAND = 'node scripts/check-test-entry.mjs --eval && TINYVAULT_PROFILE=stub TINYVAULT_EVAL=1 vitest run --config vitest.eval.config.ts --reporter=verbose --reporter=json --outputFile.json=.vitest/eval.json && node scripts/check-test-execution.mjs --eval';
