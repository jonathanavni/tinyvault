// File inventory plus the six required Docker assertion identities are pinned below.
// The Acceptance J gate separately pins its ten names. Inventory copies Vitest's default glob;
// it does not consume an include pattern from a candidate configuration.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { assertMode, equal, readJson, requireRule, sorted, walk } from './gate-common.mjs';
import { DOCKER_TEST, TIMING_TESTS, REPORTS, DOCKER_REPORT, START_FILE, DOCKER_START_FILE, EVAL_TEST, EVAL_REPORT, EVAL_START_FILE } from './test-contract.mjs';
export const DEFAULT_TEST_PATTERN = '**/*.{test,spec}.?(c|m)[jt]s?(x)';
export const SKIPPED_TEST = 'offline eval entry kills the fake fill and missing post-loop drain with the real meta-gated browser scorecard';
export const EXECUTION_RULES = Object.freeze(['inventory', 'partition-disjoint', 'partition-union', 'report-count',
  'report-fresh', 'report-shape', 'report-success', 'report-files', 'file-tests', 'file-status',
  'assertion-status', 'skip-identity', 'skip-count', 'report-counters', 'report-json', 'report-missing', 'start-record', 'docker-assertions', 'mode', 'claim-links', 'claim-execution']);
export function inventory(root) {
  return walk(root).map((file) => path.relative(root, file)).filter((file) => path.matchesGlob(file, DEFAULT_TEST_PATTERN));
}
export function partitions(files, mode = 'test') {
  assertMode(mode);
  if (mode === 'docker') return [[DOCKER_TEST]];
  if (mode === 'eval') return [[EVAL_TEST]];
  return [files.filter((file) => file !== DOCKER_TEST && !TIMING_TESTS.includes(file)), ...TIMING_TESTS.map((f) => [f])];
}
export function checkPartitions(files, groups) {
  const all = groups.flat();
  requireRule(new Set(all).size === all.length, 'partition-disjoint');
  requireRule(equal(sorted(all), sorted(files)), 'partition-union');
}
function assertionsFor(result, mode) {
  requireRule(Array.isArray(result.assertionResults) && result.assertionResults.length > 0, 'file-tests');
  requireRule(result.status === 'passed', 'file-status');
  for (const test of result.assertionResults) {
    requireRule(test && typeof test.fullName === 'string' && ['passed', 'skipped'].includes(test.status), 'assertion-status');
    if (test.status === 'skipped') requireRule(mode === 'test' && result.relative === 'testbed/runner.eval.test.ts'
      && test.fullName === SKIPPED_TEST, 'skip-identity');
  }
  return result.assertionResults;
}
function inspectReport(bundle, expected, root, started, mode) {
  requireRule(Number.isFinite(bundle.mtime) && bundle.mtime > started, 'report-fresh');
  const report = bundle.report;
  requireRule(report && Array.isArray(report.testResults), 'report-shape');
  requireRule(report.success === true, 'report-success');
  const results = report.testResults.map((r) => ({ ...r,
    relative: typeof r?.name === 'string' ? path.relative(root, path.resolve(root, r.name)) : undefined }));
  requireRule(equal(sorted(results.map((r) => r.relative)), sorted(expected)), 'report-files');
  const assertions = results.flatMap((r) => assertionsFor(r, mode));
  if (mode === 'docker') requireRule(REQUIRED_DOCKER_ASSERTIONS.every((name) =>
    assertions.filter((a) => a.fullName === name && a.status === 'passed').length === 1), 'docker-assertions');
  const pending = assertions.filter((a) => a.status === 'skipped').length;
  requireRule(report.numTotalTests === assertions.length && report.numPassedTests === assertions.length - pending
    && report.numPendingTests === pending && report.numFailedTests === 0 && report.numTodoTests === 0, 'report-counters');
  return pending;
}
export function proveExecution({ files, bundles, root, started, mode = 'test' }) {
  assertMode(mode);
  requireRule(Number.isFinite(started) && started > 0, 'start-record');
  requireRule(Array.isArray(files) && files.length > 0 && new Set(files).size === files.length
    && (mode === 'docker' ? files.includes(DOCKER_TEST) : mode === 'eval' ? files.includes(EVAL_TEST) : TIMING_TESTS.every((f) => files.includes(f))), 'inventory');
  const expected = partitions(files, mode);
  checkPartitions(mode === 'docker' ? [DOCKER_TEST] : mode === 'eval' ? [EVAL_TEST] : files.filter((f) => f !== DOCKER_TEST), expected);
  requireRule(Array.isArray(bundles) && bundles.length === expected.length, 'report-count');
  const actualFiles = bundles.flatMap((b) => b.report?.testResults?.map((r) => r.name) ?? []);
  requireRule(new Set(actualFiles).size === actualFiles.length, 'partition-disjoint');
  const skipped = bundles.reduce((count, bundle, i) => count + inspectReport(bundle, expected[i], root, started, mode), 0);
  requireRule(skipped === (mode === 'test' ? 1 : 0), 'skip-count');
}
export function checkExecution(root, mode = 'test') {
  assertMode(mode);
  let start;
  try { start = readJson(path.join(root, mode === 'eval' ? EVAL_START_FILE : mode === 'docker' ? DOCKER_START_FILE : START_FILE)); }
  catch { requireRule(false, 'start-record'); }
  requireRule(start?.mode === mode, 'start-record');
  const bundles = (mode === 'eval' ? [EVAL_REPORT] : mode === 'docker' ? [DOCKER_REPORT] : REPORTS).map((relative) => {
    const file = path.join(root, relative);
    requireRule(fs.existsSync(file), 'report-missing');
    let report;
    try { report = readJson(file); } catch { requireRule(false, 'report-json'); }
    return { report, mtime: fs.statSync(file).mtimeMs };
  });
  proveExecution({ files: inventory(root), bundles, root, started: start.started, mode });
  if (mode === 'test') proveClaimExecution(readClaimSelectors(root), bundles, root);
}

export const REQUIRED_DOCKER_ASSERTIONS = Object.freeze([
  "slice 4 real Docker construction and control-route probes authenticates all fixtures, probes page and supervised routes, then scans every stopped surface",
  "slice 4 real Docker construction and control-route probes composed real browser captures persist exactly and adjudicate offline within the capability lifetime",
  "slice 4 real Docker construction and control-route probes same-image same-label pre-existing container is project-not-fresh with zero teardown",
  "slice 4 real Docker construction and control-route probes killing the first authenticated exec is bridge-closed with one bridge spawn and no reconnect",
  "slice 4 real Docker construction and control-route probes the dynamic matrix detects an extra published page port after a direct Compose override reaches Docker",
  "slice 4 real Docker construction and control-route probes K-leg canonical two-transport parity and K-observer-inert"
]);

/** Read the reviewed static linkage as data, without importing tests or executing the module. */
export function parseClaimSelectors(text) {
  const source = ts.createSourceFile('claims.ts', text, ts.ScriptTarget.Latest, true);
  requireRule(source.parseDiagnostics.length === 0, 'claim-links');
  const declarations = source.statements.filter(ts.isVariableStatement).flatMap((statement) =>
    statement.declarationList.declarations.map((declaration) => ({ statement, declaration })))
    .filter(({ declaration }) => ts.isIdentifier(declaration.name) && declaration.name.text === 'CLAIM_LINKS');
  requireRule(declarations.length === 1, 'claim-links');
  const { statement, declaration } = declarations[0];
  requireRule((statement.declarationList.flags & ts.NodeFlags.Const) !== 0
    && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword), 'claim-links');
  function literal(node) {
    requireRule(node !== undefined, 'claim-links');
    if (ts.isStringLiteral(node)) return node.text;
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
    requireRule(ts.isObjectLiteralExpression(node), 'claim-links');
    const record = Object.create(null);
    for (const property of node.properties) {
      requireRule(ts.isPropertyAssignment(property)
        && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)), 'claim-links');
      const key = property.name.text;
      requireRule(!Object.hasOwn(record, key), 'claim-links');
      record[key] = literal(property.initializer);
    }
    return record;
  }
  const rows = literal(declaration.initializer);
  requireRule(Array.isArray(rows) && rows.length > 0, 'claim-links');
  const ids = new Set(), selectors = new Map();
  for (const row of rows) {
    requireRule(row && typeof row === 'object' && typeof row.id === 'string'
      && /^P-[A-Za-z0-9-]+$/u.test(row.id) && !ids.has(row.id)
      && Array.isArray(row.selectors) && row.selectors.length > 0, 'claim-links');
    ids.add(row.id);
    for (const selector of row.selectors) {
      requireRule(selector && typeof selector === 'object'
        && ['runtime', 'compiler'].includes(selector.kind)
        && typeof selector.file === 'string' && /^(?:src|testbed)\/.+\.test\.ts$/u.test(selector.file), 'claim-links');
      const keys = selector.kind === 'runtime' ? ['kind', 'file', 'fullName'] : ['kind', 'file', 'sentinel'];
      requireRule(equal(sorted(Object.keys(selector)), sorted(keys)), 'claim-links');
      const name = selector.kind === 'runtime' ? selector.fullName : selector.sentinel;
      requireRule(typeof name === 'string' && name.trim().length > 0, 'claim-links');
      if (selector.kind === 'runtime') selectors.set(JSON.stringify([selector.file, name]), { file: selector.file, fullName: name });
    }
  }
  requireRule(selectors.size > 0, 'claim-links');
  return [...selectors.values()];
}
function readClaimSelectors(root) {
  let source;
  try { source = fs.readFileSync(path.join(root, 'testbed/parity/claims.ts'), 'utf8'); }
  catch { requireRule(false, 'claim-links'); }
  return parseClaimSelectors(source);
}
/** Uses only this command's already validated, fresh default report partitions. */
export function proveClaimExecution(selectors, bundles, root) {
  const actual = bundles.flatMap((bundle) => bundle.report.testResults.flatMap((result) =>
    result.assertionResults.map((assertion) => ({ file: path.relative(root, path.resolve(root, result.name)),
      fullName: assertion.fullName, status: assertion.status }))));
  requireRule(selectors.length > 0, 'claim-execution');
  for (const selector of selectors) {
    const matches = actual.filter((assertion) => assertion.file === selector.file && assertion.fullName === selector.fullName);
    requireRule(matches.length === 1 && matches[0].status === 'passed', 'claim-execution');
  }
}
