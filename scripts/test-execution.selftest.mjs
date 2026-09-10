import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXECUTION_RULES, SKIPPED_TEST, proveExecution, checkExecution, checkPartitions, inventory, parseClaimSelectors, proveClaimExecution } from './test-execution.mjs';
import { TIMING_TESTS, DOCKER_TEST, REPORTS, START_FILE, EVAL_TEST, EVAL_REPORT, EVAL_START_FILE } from './test-contract.mjs';
// Independent report-title transcription; never derived from the production required set.
const timing2Names = [
  "H Probe P timing bounds pins same-constructor timing payloads against the bare-rotation mutant",
  "H Probe P timing bounds kills secret-length-dependent fill latency after asserting exact result equality",
  "H Probe P timing bounds kills secret-length-dependent mutex occupancy with an immediately queued control",
  "H Probe P timing bounds kills a content-dependent reflection oracle with equal-length caller traffic",
  "H Probe P timing bounds kills match-dependent tripwire timing through composeSupervisedHost",
  "H Probe P timing bounds kills match-dependent tripwire timing on a real supervised browser fill call",
  "H Probe P timing bounds kills content-dependent request-listener work on the real supervised click path",
  "H Probe P timing bounds applies the Holm–Bonferroni family gate over the six probes",
  "H Probe P timing bounds reports a path-specific 2us-per-call injected-bias control rejected by the family gate",
  "H Probe P timing bounds reports the length-proportional fill-wrapper sensitivity floor",
  "H Probe P timing bounds tripwire-match-vs-no-match-aa",
  "H Probe P timing bounds tripwire-match-vs-no-match-sham",
  "H Probe P timing bounds tripwire-real-click-match-vs-no-match-aa",
  "H Probe P timing bounds tripwire-real-click-match-vs-no-match-sham",
  "H Probe P timing bounds tripwire-real-click-bias-250us",
  "H Probe P timing bounds tripwire-real-click-bias-1000us",
  "M6 S4 lifecycle timing bounds never-loading subresource plus three-second beforeClose stays within the combined eight-second budget",
  "M6 S4 lifecycle timing bounds busy-renderer suspension cutoff permits successful quiesce within the hard five-second budget (pending CDP=false)",
  "M6 S4 lifecycle timing bounds busy-renderer suspension cutoff permits successful quiesce within the hard five-second budget (pending CDP=true)",
  "M6 S4 lifecycle timing bounds black-hole failed navigation then close stays within the five-second close bound",
  "M6 S4 lifecycle timing bounds active goto then close includes the courtesy wait within the five-second close bound",
  "M6 S4 lifecycle timing bounds hostile self-navigation snapshot expires within ten seconds plus settlement",
  "M6 S4 lifecycle timing bounds deadline expiry disposes a genuinely pending CDP holder within five seconds plus settlement",
  "M6 S4 lifecycle timing bounds continuous page beacons quiesce successfully within the five-second bound",
  "M6 S4 lifecycle timing bounds successful strict drain and finalization stay within the shared five-second bound",
  "M6 S4 lifecycle timing bounds busy renderer snapshot fails within ten seconds plus the three-second disposal grace",
];
function report(files, root) {
  const testResults = files.map((name) => ({ name: path.join(root, name), status: 'passed',
    assertionResults: name === TIMING_TESTS[1] ? timing2Names.map((fullName) => ({ fullName, status: 'passed' })) : [{
      fullName: name.includes('runner.eval') ? SKIPPED_TEST : `test ${name}`,
      status: name.includes('runner.eval') ? 'skipped' : 'passed',
    }] }));
  const assertions = testResults.flatMap((r) => r.assertionResults);
  const pending = assertions.filter((a) => a.status === 'skipped').length;
  return { success: true, testResults, numTotalTests: assertions.length, numPassedTests: assertions.length - pending,
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
  // M-T1: rename a timing-2 title; exactly one derived mutant code for R1.
  ['timing-2-inventory', (d) => { d.bundles[2].report.testResults[0].assertionResults[3].fullName += ' hidden'; }],
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
  timingInventoryCases();
  evaluationCases();
  claimLinkageCases();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tinyvault-execution-'));
  try { filesystemCases(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

function timingInventoryCases() {
  const cases = [
    ['M-T2', 'timing-2-inventory', (d, rows) => { rows.push({ fullName: 'hidden registration', status: 'passed' }); }],
    ['M-T3', 'timing-2-inventory', (d, rows) => { rows.pop(); }],
    ['M-T4', 'timing-2-inventory', (d, rows) => { rows.push({ ...rows[0] }); }],
    ['M-T5', 'skip-identity', (d, rows) => { rows[0].status = 'skipped'; }],
    ['M-T6', 'timing-2-inventory', (d, rows) => {
      for (const row of rows) row.fullName = row.fullName.replace(/^(H Probe P|M6 S4 lifecycle) timing bounds /, 'other suite ');
    }],
    ['M-T7', 'report-files', (d) => { [d.bundles[1], d.bundles[2]] = [d.bundles[2], d.bundles[1]]; }],
    ['M-T9', 'timing-2-inventory', (d, rows) => { rows.push({ fullName: 'hidden registration', status: 'passed' }); }],
    ['M-T10', 'partition-disjoint', (d) => { d.bundles[1] = structuredClone(d.bundles[2]); }],
  ];
  for (const [name, code, mutate] of cases) {
    const d = executionFixture(), r = d.bundles[2].report, rows = r.testResults[0].assertionResults;
    mutate(d, rows);
    if (name !== 'M-T9') {
      r.numTotalTests = rows.length; r.numPendingTests = rows.filter((a) => a.status === 'skipped').length;
      r.numPassedTests = rows.length - r.numPendingTests;
    }
    assert.throws(() => proveExecution(d), { message: code }, name);
    proveExecution(executionFixture());
  }
  // M-T8: a coherent 27-row timing-1 report stays green; only timing-2 is keyed.
  const d = executionFixture(), r = d.bundles[1].report;
  r.testResults[0].assertionResults = Array.from({ length: 27 }, (_, i) => ({ fullName: `timing-1 ${i}`, status: 'passed' }));
  r.numTotalTests = 27; r.numPassedTests = 27;
  proveExecution(d);
  proveExecution(executionFixture());
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
