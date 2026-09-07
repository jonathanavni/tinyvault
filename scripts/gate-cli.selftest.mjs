// Production CLI proof driven by the existing, process.execPath-pinned selftest launcher.
// This module has no process or network capability. Fixtures and CLI mutants stay in a temp tree.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './gate-common.mjs';
import { canonicalCompose, canonicalDockerfile, TOPOLOGY } from './compose-schema.mjs';
import { entryFixture } from './test-entry.selftest.mjs';
import { executionFixture, modeFixture, CLAIM_LINKS_FIXTURE } from './test-execution.selftest.mjs';
import { REPORTS, START_FILE, EVAL_REPORT, EVAL_START_FILE, EVAL_TEST } from './test-contract.mjs';
function write(root, file, value) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), value);
}
function prepare(root) {
  const entry = entryFixture();
  write(root, 'package.json', JSON.stringify({ type: 'module', scripts: entry.scripts }));
  write(root, 'Makefile', entry.makefile);
  for (const [file, contents] of Object.entries(entry.configs)) write(root, file, contents);
  write(root, TOPOLOGY.composePath, JSON.stringify(canonicalCompose()));
  write(root, TOPOLOGY.dockerfilePath, canonicalDockerfile());
  fs.cpSync(path.join(ROOT, 'scripts'), path.join(root, 'scripts'), { recursive: true });
  for (const file of ['topology.json', 'topology.mjs']) {
    fs.copyFileSync(path.join(ROOT, 'testbed/docker', file), path.join(root, 'testbed/docker', file));
  }
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(root, 'node_modules'));
}
function evidence(root) {
  write(root, 'testbed/parity/claims.ts', CLAIM_LINKS_FIXTURE);
  const d = executionFixture(root);
  // prepare copies this real test along with the gates. Its synthetic report must
  // account for that file too; otherwise the production inventory correctly rejects it.
  const helperTest = 'scripts/claude-review.test.mjs';
  const names = [...fs.readFileSync(path.join(root, helperTest), 'utf8').matchAll(/^test\('([^']+)'/gm)]
    .map((match) => match[1]);
  assert.equal(names.length, 6, 'review helper fixture must retain all six tests');
  const report = d.bundles[0].report;
  report.testResults.push({ name: path.join(root, helperTest), status: 'passed',
    assertionResults: names.map((fullName) => ({ fullName, status: 'passed' })) });
  report.numTotalTests += names.length; report.numPassedTests += names.length;
  for (const file of d.files) write(root, file, '');
  write(root, START_FILE, JSON.stringify({ started: d.started, mode: 'test' }));
  d.bundles.forEach((b, i) => write(root, REPORTS[i], JSON.stringify(b.report)));
}
function callerDeletion(root, run, script, needle, input, invalid) {
  const file = path.join(root, script); const original = fs.readFileSync(file, 'utf8');
  assert(original.includes(needle), 'caller mutation anchor missing');
  write(root, input, invalid);
  run(script, root, 1);
  fs.writeFileSync(file, original.replace(needle, 'void 0'));
  // Removing the actual caller must make the negative expectation red, proving CLI reach.
  assert.throws(() => run(script, root, 1));
  fs.writeFileSync(file, original); run(script, root, 1);
}
export function gateCliSelftest(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tinyvault-gate-cli-'));
  try {
    prepare(root);
    const entry = entryFixture();
    run('scripts/check-test-entry.mjs', root, 0);
    entry.scripts.test += ' || true';
    callerDeletion(root, run, 'scripts/check-test-entry.mjs', 'checkEntryDocuments(readEntryDocuments(root))',
      'package.json', JSON.stringify({ type: 'module', scripts: entry.scripts }));
    write(root, 'package.json', JSON.stringify({ type: 'module', scripts: entryFixture().scripts }));
    run('scripts/check-test-entry.mjs', root, 0);
    run('scripts/check-compose.mjs', root, 0);
    const compose = canonicalCompose(); compose.services['benign-login'].user = 'root';
    callerDeletion(root, run, 'scripts/check-compose.mjs', 'checkCompose(cliOptions().root)',
      TOPOLOGY.composePath, JSON.stringify(compose));
    write(root, TOPOLOGY.composePath, JSON.stringify(canonicalCompose())); run('scripts/check-compose.mjs', root, 0);
    evidence(root); run('scripts/check-test-execution.mjs', root, 0);
    for (const script of ['scripts/check-test-entry.mjs', 'scripts/check-compose.mjs', 'scripts/check-test-execution.mjs']) {
      run(script, root, 1, ['--invalid']);
    }
    callerDeletion(root, run, 'scripts/check-test-execution.mjs', 'checkExecution(root, mode)', REPORTS[0], '{}');
    evidence(root); run('scripts/check-test-execution.mjs', root, 0);
    claimCliCases(root, run);
    evalCliCases(root, run);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

function evalCliCases(root, run) {
  for (const script of ['scripts/check-test-entry.mjs', 'scripts/check-test-execution.mjs']) {
    for (const args of [['--eval', '--eval'], ['--docker', '--eval'], ['--eval', '--docker'], ['--eval', 'trailing']]) run(script, root, 1, args);
  }
  const entryScript = 'scripts/check-test-entry.mjs';
  const entrySource = fs.readFileSync(path.join(root, entryScript), 'utf8');
  const restoreEntry = () => {
    const d = entryFixture(); write(root, 'package.json', JSON.stringify({ type: 'module', scripts: d.scripts }));
    for (const [file, contents] of Object.entries(d.configs)) write(root, file, contents);
  };
  for (const mutate of [
    (d) => { d.scripts.eval = d.scripts.eval.split(' && ').slice(1).join(' && '); },
    (d) => { d.scripts.eval = d.scripts.eval.split(' && ').slice(0, -1).join(' && '); },
    (d) => { d.scripts.preeval = 'echo bypass'; },
    (d) => { d.scripts.posteval = 'echo bypass'; },
    (d) => { d.configs['vitest.eval.config.ts'] = "export default {test:{include:['wrong.test.ts']}}"; },
  ]) {
    restoreEntry(); const d = entryFixture(); mutate(d);
    write(root, 'package.json', JSON.stringify({ type: 'module', scripts: d.scripts }));
    for (const [file, contents] of Object.entries(d.configs)) write(root, file, contents);
    run(entryScript, root, 1, ['--eval']);
    write(root, entryScript, entrySource.replace('checkEntryDocuments(readEntryDocuments(root))', 'void 0'));
    assert.throws(() => run(entryScript, root, 1, ['--eval']));
    write(root, entryScript, entrySource); run(entryScript, root, 1, ['--eval']);
  }
  restoreEntry(); run(entryScript, root, 0, ['--eval']);
  const script = 'scripts/check-test-execution.mjs';
  const d = modeFixture('eval', root);
  const restore = () => {
    write(root, EVAL_TEST, '');
    write(root, EVAL_START_FILE, JSON.stringify({ started: 1000, mode: 'eval' }));
    write(root, EVAL_REPORT, JSON.stringify(d.bundles[0].report));
  };
  run('scripts/check-test-entry.mjs', root, 0, ['--eval']); restore(); run(script, root, 0, ['--eval']);
  const original = fs.readFileSync(path.join(root, script), 'utf8');
  for (const mutate of [
    () => fs.rmSync(path.join(root, EVAL_REPORT)),
    () => fs.utimesSync(path.join(root, EVAL_REPORT), 0, 0),
    () => write(root, EVAL_START_FILE, JSON.stringify({ started: 1000, mode: 'docker' })),
    () => { const r = structuredClone(d.bundles[0].report); r.testResults[0].assertionResults[0].status = 'skipped'; write(root, EVAL_REPORT, JSON.stringify(r)); },
    () => { const r = structuredClone(d.bundles[0].report); r.testResults[0].name = path.join(root, 'wrong.test.ts'); write(root, EVAL_REPORT, JSON.stringify(r)); },
  ]) {
    restore(); mutate(); run(script, root, 1, ['--eval']);
    write(root, script, original.replace('checkExecution(root, mode)', 'void 0'));
    assert.throws(() => run(script, root, 1, ['--eval']));
    write(root, script, original); run(script, root, 1, ['--eval']);
  }
  restore(); run(script, root, 0, ['--eval']);
}


function claimCliCases(root, run) {
  evidence(root); run('scripts/check-test-execution.mjs', root, 0);
  const reportPath = path.join(root, REPORTS[0]);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  // Keep a passing file and coherent counters: only the linked test identity disappears.
  report.testResults.find((result) => result.name === path.join(root, 'testbed/probe.test.ts'))
    .assertionResults[0].fullName = 'unrelated replacement';
  write(root, REPORTS[0], JSON.stringify(report));
  run('scripts/check-test-execution.mjs', root, 1);
  const helper = path.join(root, 'scripts/test-execution.mjs');
  const original = fs.readFileSync(helper, 'utf8');
  const needle = 'proveClaimExecution(readClaimSelectors(root), bundles, root)';
  assert.equal(original.split(needle).length, 2, 'exact claim caller anchor');
  try {
    fs.writeFileSync(helper, original.replace(needle, 'void 0'));
    assert.throws(() => run('scripts/check-test-execution.mjs', root, 1));
  } finally { fs.writeFileSync(helper, original); }
  run('scripts/check-test-execution.mjs', root, 1);
  evidence(root); run('scripts/check-test-execution.mjs', root, 0);
  fs.rmSync(path.join(root, 'testbed/parity/claims.ts'));
  run('scripts/check-test-execution.mjs', root, 1);
  evidence(root); run('scripts/check-test-execution.mjs', root, 0);
}
