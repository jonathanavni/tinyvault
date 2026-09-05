// Files, not test names: removal of a test from a file that retains tests is outside this proof.
// The Acceptance J gate separately pins its ten names. Inventory copies Vitest's default glob;
// it does not consume an include pattern from a candidate configuration.
import fs from 'node:fs';
import path from 'node:path';
import { equal, readJson, requireRule, sorted, walk } from './gate-common.mjs';
import { DOCKER_TEST, TIMING_TESTS, REPORTS, DOCKER_REPORT, START_FILE, DOCKER_START_FILE } from './test-contract.mjs';
export const DEFAULT_TEST_PATTERN = '**/*.{test,spec}.?(c|m)[jt]s?(x)';
export const SKIPPED_TEST = 'offline eval entry kills the fake fill and missing post-loop drain with the real meta-gated browser scorecard';
export const EXECUTION_RULES = Object.freeze(['inventory', 'partition-disjoint', 'partition-union', 'report-count',
  'report-fresh', 'report-shape', 'report-success', 'report-files', 'file-tests', 'file-status',
  'assertion-status', 'skip-identity', 'skip-count', 'report-counters', 'report-json', 'report-missing', 'start-record']);
export function inventory(root) {
  return walk(root).map((file) => path.relative(root, file)).filter((file) => path.matchesGlob(file, DEFAULT_TEST_PATTERN));
}
export function partitions(files, docker = false) {
  if (docker) return [[DOCKER_TEST]];
  return [files.filter((file) => file !== DOCKER_TEST && !TIMING_TESTS.includes(file)), ...TIMING_TESTS.map((f) => [f])];
}
export function checkPartitions(files, groups) {
  const all = groups.flat();
  requireRule(new Set(all).size === all.length, 'partition-disjoint');
  requireRule(equal(sorted(all), sorted(files)), 'partition-union');
}
function assertionsFor(result, docker) {
  requireRule(Array.isArray(result.assertionResults) && result.assertionResults.length > 0, 'file-tests');
  requireRule(result.status === 'passed', 'file-status');
  for (const test of result.assertionResults) {
    requireRule(test && typeof test.fullName === 'string' && ['passed', 'skipped'].includes(test.status), 'assertion-status');
    if (test.status === 'skipped') requireRule(!docker && result.relative === 'testbed/runner.eval.test.ts'
      && test.fullName === SKIPPED_TEST, 'skip-identity');
  }
  return result.assertionResults;
}
function inspectReport(bundle, expected, root, started, docker) {
  requireRule(Number.isFinite(bundle.mtime) && bundle.mtime > started, 'report-fresh');
  const report = bundle.report;
  requireRule(report && Array.isArray(report.testResults), 'report-shape');
  requireRule(report.success === true, 'report-success');
  const results = report.testResults.map((r) => ({ ...r,
    relative: typeof r?.name === 'string' ? path.relative(root, path.resolve(root, r.name)) : undefined }));
  requireRule(equal(sorted(results.map((r) => r.relative)), sorted(expected)), 'report-files');
  const assertions = results.flatMap((r) => assertionsFor(r, docker));
  const pending = assertions.filter((a) => a.status === 'skipped').length;
  requireRule(report.numTotalTests === assertions.length && report.numPassedTests === assertions.length - pending
    && report.numPendingTests === pending && report.numFailedTests === 0 && report.numTodoTests === 0, 'report-counters');
  return pending;
}
export function proveExecution({ files, bundles, root, started, docker = false }) {
  requireRule(Number.isFinite(started) && started > 0, 'start-record');
  requireRule(Array.isArray(files) && files.length > 0 && new Set(files).size === files.length
    && (docker ? files.includes(DOCKER_TEST) : TIMING_TESTS.every((f) => files.includes(f))), 'inventory');
  const expected = partitions(files, docker);
  checkPartitions(docker ? [DOCKER_TEST] : files.filter((f) => f !== DOCKER_TEST), expected);
  requireRule(Array.isArray(bundles) && bundles.length === expected.length, 'report-count');
  const actualFiles = bundles.flatMap((b) => b.report?.testResults?.map((r) => r.name) ?? []);
  requireRule(new Set(actualFiles).size === actualFiles.length, 'partition-disjoint');
  const skipped = bundles.reduce((count, bundle, i) => count + inspectReport(bundle, expected[i], root, started, docker), 0);
  requireRule(skipped === (docker ? 0 : 1), 'skip-count');
}
export function checkExecution(root, docker = false) {
  let start;
  try { start = readJson(path.join(root, docker ? DOCKER_START_FILE : START_FILE)); }
  catch { requireRule(false, 'start-record'); }
  requireRule(start?.mode === (docker ? 'docker' : 'test'), 'start-record');
  const bundles = (docker ? [DOCKER_REPORT] : REPORTS).map((relative) => {
    const file = path.join(root, relative);
    requireRule(fs.existsSync(file), 'report-missing');
    let report;
    try { report = readJson(file); } catch { requireRule(false, 'report-json'); }
    return { report, mtime: fs.statSync(file).mtimeMs };
  });
  proveExecution({ files: inventory(root), bundles, root, started: start.started, docker });
}
