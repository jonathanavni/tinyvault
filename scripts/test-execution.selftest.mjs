import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXECUTION_RULES, SKIPPED_TEST, proveExecution, checkExecution, checkPartitions, inventory, parseClaimSelectors, proveClaimExecution } from './test-execution.mjs';
import { TIMING_TESTS, DOCKER_TEST, REPORTS, START_FILE, EVAL_TEST, EVAL_REPORT, EVAL_START_FILE } from './test-contract.mjs';
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
export const EXECUTION_MUTANT_CODES = [...EXECUTION_MUTANTS.map(([code]) => code), 'partition-union', 'report-json', 'report-missing', 'docker-assertions', 'mode', 'claim-links', 'claim-execution'];
function filesystemCases(root) {
  const d = executionFixture(root);
  fs.mkdirSync(path.join(root, 'testbed/parity'), { recursive: true });
  fs.writeFileSync(path.join(root, 'testbed/parity/claims.ts'), CLAIM_LINKS_FIXTURE);
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
  evaluationCases();
  claimLinkageCases();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tinyvault-execution-'));
  try { filesystemCases(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

// Independent literal identities: do not build this fixture from the production required set.
const dockerNames = [
  'authenticates all fixtures, probes page and supervised routes, then scans every stopped surface',
  'composed real browser captures persist exactly and adjudicate offline within the capability lifetime',
  'same-image same-label pre-existing container is project-not-fresh with zero teardown',
  'killing the first authenticated exec is bridge-closed with one bridge spawn and no reconnect',
  'the dynamic matrix detects an extra published page port after a direct Compose override reaches Docker',
  'K-leg canonical two-transport parity and K-observer-inert',
].map((name) => `slice 4 real Docker construction and control-route probes ${name}`);
export function modeFixture(mode, root = '/fixture') {
  const file = mode === 'docker' ? DOCKER_TEST : EVAL_TEST;
  const names = mode === 'docker' ? dockerNames : [SKIPPED_TEST];
  return { root, files: [file], started: 1000, mode, bundles: [{ mtime: 2000, report: {
    success: true, numTotalTests: names.length, numPassedTests: names.length,
    numPendingTests: 0, numFailedTests: 0, numTodoTests: 0,
    testResults: [{ name: path.join(root, file), status: 'passed',
      assertionResults: names.map((fullName) => ({ fullName, status: 'passed' })) }],
  } }] };
}
function evaluationCases() {
  for (const mode of ['docker', 'eval']) {
    proveExecution(modeFixture(mode));
    const skip = modeFixture(mode); skip.bundles[0].report.testResults[0].assertionResults.at(-1).status = 'skipped';
    assert.throws(() => proveExecution(skip), { message: 'skip-identity' });
  }
  const missingK = modeFixture('docker'); const r = missingK.bundles[0].report;
  r.testResults[0].assertionResults.pop(); r.numTotalTests--; r.numPassedTests--;
  assert.throws(() => proveExecution(missingK), { message: 'docker-assertions' });
  assert.throws(() => proveExecution({ ...modeFixture('eval'), mode: true }), { message: 'mode' });
  for (const [code, mutate] of EXECUTION_MUTANTS.filter(([code]) =>
    ['report-fresh', 'report-count', 'report-shape', 'report-success', 'report-files', 'file-tests',
      'file-status', 'assertion-status', 'report-counters', 'start-record'].includes(code))) {
    const d = modeFixture('eval'); mutate(d);
    assert.throws(() => proveExecution(d), { message: code });
    proveExecution(modeFixture('eval'));
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tinyvault-eval-proof-'));
  try {
    fs.mkdirSync(path.join(root, 'testbed')); fs.writeFileSync(path.join(root, EVAL_TEST), '');
    fs.mkdirSync(path.join(root, '.vitest'));
    const d = modeFixture('eval', root);
    fs.writeFileSync(path.join(root, EVAL_REPORT), JSON.stringify(d.bundles[0].report));
    for (const mode of ['test', 'docker', 'unknown']) {
      fs.writeFileSync(path.join(root, EVAL_START_FILE), JSON.stringify({ started: 1000, mode }));
      assert.throws(() => checkExecution(root, 'eval'), { message: 'start-record' });
    }
    fs.writeFileSync(path.join(root, EVAL_START_FILE), JSON.stringify({ started: 1000, mode: 'eval' }));
    checkExecution(root, 'eval');
    fs.rmSync(path.join(root, EVAL_REPORT));
    assert.throws(() => checkExecution(root, 'eval'), { message: 'report-missing' });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

// Independent minimal registration/report fixture; never derived from the production claim table.
export const CLAIM_LINKS_FIXTURE = 'export const CLAIM_LINKS = [{id:"P-probe",selectors:[{kind:"runtime",file:"testbed/probe.test.ts",fullName:"test testbed/probe.test.ts"}]}];';
function claimLinkageCases() {
  const expected = [{ file: 'testbed/probe.test.ts', fullName: 'test testbed/probe.test.ts' }];
  assert.deepEqual(parseClaimSelectors(CLAIM_LINKS_FIXTURE), expected);
  for (const source of [
    '', CLAIM_LINKS_FIXTURE.replace('export ', ''), CLAIM_LINKS_FIXTURE.replace('const ', 'let '),
    CLAIM_LINKS_FIXTURE + CLAIM_LINKS_FIXTURE, 'export const CLAIM_LINKS = createLinks();',
    'export const CLAIM_LINKS = [];', 'export const CLAIM_LINKS = [...other];',
    CLAIM_LINKS_FIXTURE.replace('id:"P-probe"', 'get id(){return "P-probe";}'),
    CLAIM_LINKS_FIXTURE.replace('id:"P-probe"', 'id:"P-probe",id:"P-duplicate"'),
    CLAIM_LINKS_FIXTURE.replace('"runtime"', '"unknown"'),
    CLAIM_LINKS_FIXTURE.replace('fullName:"test testbed/probe.test.ts"', 'fullName:""'),
    CLAIM_LINKS_FIXTURE.replace('file:"testbed/probe.test.ts"', 'file:"../probe.test.ts"'),
    CLAIM_LINKS_FIXTURE.replace('fullName:"test testbed/probe.test.ts"', 'fullName:makeName()'),
  ]) assert.throws(() => parseClaimSelectors(source), { message: 'claim-links' });
  const fixture = executionFixture();
  proveClaimExecution(expected, fixture.bundles, fixture.root);
  for (const mutate of [
    (d) => { d.bundles[0].report.testResults[0].assertionResults[0].fullName = 'unrelated replacement'; },
    (d) => { d.bundles[0].report.testResults[0].assertionResults[0].status = 'skipped'; },
    (d) => { d.bundles[0].report.testResults[0].name = '/fixture/testbed/other.test.ts'; },
    (d) => { const tests = d.bundles[0].report.testResults[0].assertionResults; tests.push({ ...tests[0] }); },
  ]) {
    const changed = executionFixture(); mutate(changed);
    assert.throws(() => proveClaimExecution(expected, changed.bundles, changed.root), { message: 'claim-execution' });
    proveClaimExecution(expected, fixture.bundles, fixture.root);
  }
}
