import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXECUTION_RULES, SKIPPED_TEST, proveExecution, checkExecution, checkPartitions, inventory } from './test-execution.mjs';
import { TIMING_TESTS, DOCKER_TEST, REPORTS, START_FILE } from './test-contract.mjs';
function report(files, root) {
  const testResults = files.map((name) => ({ name: path.join(root, name), status: 'passed', assertionResults: [{
    fullName: name.includes('runner.eval') ? SKIPPED_TEST : `test ${name}`,
    status: name.includes('runner.eval') ? 'skipped' : 'passed',
  }] }));
  const pending = testResults.filter((r) => r.assertionResults[0].status === 'skipped').length;
  return { success: true, testResults, numTotalTests: files.length, numPassedTests: files.length - pending,
    numPendingTests: pending, numFailedTests: 0, numTodoTests: 0 };
}
export function executionFixture(root = '/fixture') {
  const groups = [['testbed/probe.test.ts', 'testbed/runner.eval.test.ts'], ...TIMING_TESTS.map((f) => [f])];
  return { root, files: [...groups.flat(), DOCKER_TEST], started: 1000,
    bundles: groups.map((files) => ({ report: report(files, root), mtime: 2000 })) };
}
export const EXECUTION_MUTANTS = [
  ['inventory', (d) => { d.files = []; }],
  ['partition-disjoint', (d) => { d.bundles[1] = structuredClone(d.bundles[0]); }],
  ['report-count', (d) => { d.bundles.pop(); }],
  ['report-fresh', (d) => { d.bundles[0].mtime = d.started; }],
  ['report-shape', (d) => { d.bundles[0].report.testResults = undefined; }],
  ['report-success', (d) => { d.bundles[0].report.success = false; }],
  ['report-files', (d) => { d.bundles[0].report.testResults.pop(); }],
  ['file-tests', (d) => { d.bundles[0].report.testResults[0].assertionResults = []; }],
  ['file-status', (d) => { d.bundles[0].report.testResults[0].status = 'failed'; }],
  ['assertion-status', (d) => { d.bundles[0].report.testResults[0].assertionResults[0].status = 'todo'; }],
  ['skip-identity', (d) => { d.bundles[0].report.testResults[1].assertionResults[0].fullName += ' hidden'; }],
  ['skip-count', (d) => { const r = d.bundles[0].report; r.testResults[1].assertionResults[0].status = 'passed'; r.numPendingTests = 0; r.numPassedTests++; }],
  ['report-counters', (d) => { d.bundles[0].report.numTotalTests++; }],
  ['start-record', (d) => { d.started = NaN; }],
];
export const EXECUTION_MUTANT_CODES = [...EXECUTION_MUTANTS.map(([code]) => code), 'partition-union', 'report-json', 'report-missing'];
function filesystemCases(root) {
  const d = executionFixture(root);
  for (const file of d.files) { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), ''); }
  fs.mkdirSync(path.join(root, '.vitest'));
  fs.writeFileSync(path.join(root, START_FILE), JSON.stringify({ started: 1000, mode: 'test' }));
  d.bundles.forEach((b, i) => fs.writeFileSync(path.join(root, REPORTS[i]), JSON.stringify(b.report)));
  checkExecution(root);
  fs.writeFileSync(path.join(root, REPORTS[0]), '{');
  assert.throws(() => checkExecution(root), { message: 'report-json' });
  fs.rmSync(path.join(root, REPORTS[0]));
  assert.throws(() => checkExecution(root), { message: 'report-missing' });
  fs.writeFileSync(path.join(root, REPORTS[0]), JSON.stringify(d.bundles[0].report));
  checkExecution(root);
  // All extensions in the copied default pattern, plus an ordinary non-test negative.
  for (const ext of ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs', 'tsx', 'jsx', 'mtsx', 'cjsx']) {
    const file = `new.spec.${ext}`; fs.writeFileSync(path.join(root, file), '');
    assert(inventory(root).includes(file), file);
    assert.throws(() => checkExecution(root), { message: 'report-files' });
    fs.rmSync(path.join(root, file));
  }
  fs.writeFileSync(path.join(root, 'ordinary.ts'), ''); checkExecution(root);
}
export function executionSelftest() {
  assert.deepEqual([...EXECUTION_MUTANT_CODES].sort(), [...EXECUTION_RULES].sort());
  for (const [code, mutate] of EXECUTION_MUTANTS) {
    const fixture = executionFixture(); mutate(fixture);
    assert.throws(() => proveExecution(fixture), { message: code }, code);
    proveExecution(executionFixture());
  }
  assert.throws(() => checkPartitions(['a', 'b'], [['a']]), { message: 'partition-union' });
  checkPartitions(['a', 'b'], [['a'], ['b']]);
  const docker = { root: '/fixture', files: [DOCKER_TEST], started: 1000, docker: true,
    bundles: [{ report: report([DOCKER_TEST], '/fixture'), mtime: 2000 }] };
  proveExecution(docker);
  docker.bundles[0].report.testResults[0].assertionResults[0].status = 'skipped';
  assert.throws(() => proveExecution(docker), { message: 'skip-identity' });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tinyvault-execution-'));
  try { filesystemCases(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
