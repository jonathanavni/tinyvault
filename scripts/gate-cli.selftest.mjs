// Production CLI proof driven by the existing, process.execPath-pinned selftest launcher.
// This module has no process or network capability. Fixtures and CLI mutants stay in a temp tree.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './gate-common.mjs';
import { canonicalCompose, canonicalDockerfile, TOPOLOGY } from './compose-schema.mjs';
import { entryFixture } from './test-entry.selftest.mjs';
import { executionFixture } from './test-execution.selftest.mjs';
import { REPORTS, START_FILE } from './test-contract.mjs';
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
  const d = executionFixture(root);
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
    callerDeletion(root, run, 'scripts/check-test-execution.mjs', 'checkExecution(root, docker)', REPORTS[0], '{}');
    evidence(root); run('scripts/check-test-execution.mjs', root, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
