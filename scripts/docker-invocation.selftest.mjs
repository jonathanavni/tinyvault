#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDockerInvocation, DOCKER_CAPABILITY_ALLOWLIST, CAPABILITY_RULES } from './docker-invocation.mjs';
import { gateCliSelftest } from './gate-cli.selftest.mjs';
const cli = fileURLToPath(new URL('./check-docker-invocation.mjs', import.meta.url));
function withFixture(source, run, relative = 'src/probe.ts') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tinyvault-docker-gate-'));
  try {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, source); run(root);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function assertCli(root, status) {
  const result = spawnSync(process.execPath, [cli, '--root', root], { encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error); assert.equal(result.status, status, `${result.stdout}\n${result.stderr}`);
  assert.match(status ? result.stderr : result.stdout, /docker invocation (?:PASS|FAIL)/);
}
function rejected(source, code, relative = 'src/probe.ts') {
  withFixture(source, (root) => {
    assert.deepEqual(checkDockerInvocation(root).map((v) => v.code), [code]); assertCli(root, 1);
    fs.writeFileSync(path.join(root, relative), 'export const clean = true;');
    assert.deepEqual(checkDockerInvocation(root), []); assertCli(root, 0);
  }, relative);
}
const script = 'scripts/check-acceptance-j-results.mjs';
const mutants = [
  ['capability-import', "import 'node:child_process';", 'testbed/docker/container/control.ts'],
  ['computed-import', "const cp = await import('node:' + 'child_process');", 'testbed/probe.cts'],
  ['spawn-import-shape', "import cp from 'node:child_process';", script],
  ['spawn-reference', "import {spawnSync} from 'node:child_process'; const escape = spawnSync;", script],
  ['spawn-executable', "import {spawnSync} from 'node:child_process'; spawnSync('docker', []);", script],
  ['source-syntax', 'const =;', 'src/probe.ts'],
];
assert.deepEqual([...mutants.map(([code]) => code), 'source-symlink', 'source-empty'].sort(), [...CAPABILITY_RULES].sort());
for (const [code, source, relative] of mutants) rejected(source, code, relative);
const forms = [(s) => `import '${s}';`, (s) => `export * from '${s}';`, (s) => `const cp = require('${s}');`,
  (s) => `const cp = await import('${s}');`, (s) => `import cp = require('${s}');`];
for (const capability of ['child_process', 'net', 'http', 'https', 'tls', 'http2', 'process']) {
  for (const prefix of ['', 'node:']) for (const form of forms) {
    rejected(form(prefix + capability), 'capability-import');
  }
}
for (const extension of ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs']) {
  rejected("import 'node:child_process';", 'capability-import', `nested/probe.${extension}`);
}
for (const [relative, specs] of Object.entries(DOCKER_CAPABILITY_ALLOWLIST)) {
  const source = specs.map((spec) => relative.startsWith('scripts/') && spec === 'node:child_process'
    ? "import { spawnSync } from 'node:child_process'; spawnSync(process.execPath, []);" : `import '${spec}';`).join('\n');
  withFixture(source, (root) => { assert.deepEqual(checkDockerInvocation(root), []); assertCli(root, 0); }, relative);
}
for (const relative of Object.keys(DOCKER_CAPABILITY_ALLOWLIST).filter((f) => f.startsWith('scripts/')
  && DOCKER_CAPABILITY_ALLOWLIST[f].includes('node:child_process'))) {
  rejected("import {spawnSync} from 'node:child_process'; spawnSync('docker', []);", 'spawn-executable', relative);
  for (const arg of ['exe', "process['execPath']", 'process.execPath + ""']) {
    rejected(`import {spawnSync} from 'node:child_process'; spawnSync(${arg}, []);`, 'spawn-executable', relative);
  }
}
for (const source of ["require('node:' + 'net')", 'import(target)', 'require()', 'module.require(target)']) {
  rejected(source, 'computed-import');
}
for (const relative of ['scripts/unlisted.mjs', 'src/testbed/docker/exec.ts', 'scripts/check-test-entry.mjs',
  'scripts/check-test-execution.mjs', 'scripts/check-compose.mjs', 'scripts/compose-lint.mjs']) {
  rejected("import 'node:child_process';", 'capability-import', relative);
}
withFixture("import 'node:fs'; // import 'node:net';\nconst text = \"require('http')\";", (root) => assertCli(root, 0));
for (const directory of ['node_modules', 'dist', 'artifacts']) {
  withFixture('export const clean = true;', (root) => {
    fs.mkdirSync(path.join(root, directory)); fs.writeFileSync(path.join(root, directory, 'ignored.ts'), "import 'net';"); assertCli(root, 0);
  });
}
withFixture('export const clean = true;', (root) => {
  fs.symlinkSync('probe.ts', path.join(root, 'src/alias.ts'));
  assert.throws(() => checkDockerInvocation(root), { message: 'source-symlink' }); assertCli(root, 1);
  fs.rmSync(path.join(root, 'src/alias.ts')); assertCli(root, 0);
  fs.rmSync(path.join(root, 'src'), { recursive: true });
  assert.throws(() => checkDockerInvocation(root), { message: 'source-empty' }); assertCli(root, 1);
  fs.writeFileSync(path.join(root, 'restored.ts'), ''); assertCli(root, 0);
  assertCli(path.join(root, 'missing'), 1);
});
console.log('docker invocation selftest PASS (8 rules; all import forms, extensions and script spawn pins red then green)');
gateCliSelftest((script, root, status, extra = []) => {
  const result = spawnSync(process.execPath, [path.join(root, script), '--root', root, ...extra], { encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error);
  assert.equal(result.status, status, `${script}: ${result.stdout}\n${result.stderr}`);
  assert.match(status ? result.stderr : result.stdout, status ? /gate FAIL/ : /PASS/);
});
console.log('B2 production CLI selftest PASS (three caller-deletion mutants red, restored callers green)');
