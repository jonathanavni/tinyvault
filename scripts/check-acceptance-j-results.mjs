import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ACCEPTANCE_J_TESTS = [
  'src/agents/loop.acceptance-j.test.ts',
  'testbed/acceptance-j.integrity.test.ts',
];
const EXPECTED_TEST_NAMES = [
  'Acceptance J runtime tool boundary offers exactly the seven runtime-owned, deeply frozen definitions',
  'Acceptance J runtime tool boundary rejects mutation of the offered array and preserves exactly seven tools',
  'Acceptance J runtime rejection rejects an unoffered run_shell call before invoking the executor',
  'Acceptance J runtime rejection cannot reach an executor that is capable of handling run_shell',
  'Acceptance J runtime rejection lets approved names reach the executor and rejects representative forbidden names',
  'Acceptance J canonical model-turn snapshot reads an accessor-backed call once before passing a frozen call to the executor',
  'Acceptance J canonical model-turn snapshot keeps changing call fields coherent across evidence execution result and history',
  'Acceptance J canonical model-turn snapshot detects duplicate accessor-backed ids from the same canonical snapshot',
  'Acceptance J source pin pins gate and compile-fixture source-text presence while runtime results prove execution',
  'Acceptance J source-text integrity pin pins required Acceptance J assertions and negative compile fixtures by source text',
];

const reportDirectory = await mkdtemp(join(tmpdir(), 'tinyvault-acceptance-j-gate-'));
const reportPath = join(reportDirectory, 'vitest-report.json');
try {
  const run = runAcceptanceJ(reportPath);
  const report = await readReport(reportPath, run);
  const issues = inspectReport(report, run);
  if (issues.length > 0) failGate(issues, run);
  console.log(`Acceptance J runtime-result gate: ${EXPECTED_TEST_NAMES.length} tests executed and passed`);
} finally {
  await rm(reportDirectory, { recursive: true, force: true });
}

function runAcceptanceJ(reportPath) {
  return spawnSync(process.execPath, [
    resolve('node_modules/vitest/vitest.mjs'),
    'run', ...ACCEPTANCE_J_TESTS, '--reporter=json', `--outputFile=${reportPath}`,
  ], { cwd: process.cwd(), encoding: 'utf8' });
}

async function readReport(reportPath, run) {
  try {
    return JSON.parse(await readFile(reportPath, 'utf8'));
  } catch (error) {
    failGate([
      `machine-readable result is absent or invalid: ${error instanceof Error ? error.message : error}`,
    ], run);
  }
}

function inspectReport(report, run) {
  const assertions = report.testResults?.flatMap((result) => result.assertionResults ?? []) ?? [];
  const actualNames = assertions.map((assertion) => assertion.fullName);
  const issues = [];
  if (run.error) issues.push(`test process failed to start: ${run.error.message}`);
  if (run.status !== 0) issues.push(`test process exited ${String(run.status)}`);
  if (report.success !== true) issues.push('report success was not true');
  checkCount(issues, 'total', report.numTotalTests, EXPECTED_TEST_NAMES.length);
  checkCount(issues, 'passed', report.numPassedTests, EXPECTED_TEST_NAMES.length);
  checkCount(issues, 'failed', report.numFailedTests, 0);
  checkCount(issues, 'skipped/pending', report.numPendingTests, 0);
  checkCount(issues, 'todo', report.numTodoTests, 0);
  if (new Set(actualNames).size !== actualNames.length) issues.push('duplicate test names were reported');
  const absent = EXPECTED_TEST_NAMES.filter((name) => !actualNames.includes(name));
  const unexpected = actualNames.filter((name) => !EXPECTED_TEST_NAMES.includes(name));
  if (absent.length > 0) issues.push(`absent tests: ${absent.join(' | ')}`);
  if (unexpected.length > 0) issues.push(`unexpected tests: ${unexpected.join(' | ')}`);
  const notPassed = assertions.filter(({ status }) => status !== 'passed');
  if (notPassed.length > 0) {
    issues.push(`tests not passed: ${notPassed.map(({ fullName, status }) => `${fullName} (${status})`).join(' | ')}`);
  }
  return issues;
}

function checkCount(issues, label, actual, expected) {
  if (actual !== expected) issues.push(`${label} test count was ${String(actual)}; expected ${expected}`);
}

function failGate(issues, run) {
  console.error(`Acceptance J runtime-result gate failed:\n- ${issues.join('\n- ')}`);
  if (run.stdout) process.stderr.write(run.stdout);
  if (run.stderr) process.stderr.write(run.stderr);
  process.exitCode = 1;
  throw new Error('Acceptance J runtime-result gate failed');
}
