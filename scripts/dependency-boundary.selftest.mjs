#!/usr/bin/env node
// Executed explicitly by make test; the non-.test name keeps Vitest from treating it as a suite.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkDependencyBoundary } from './dependency-boundary.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(scriptDirectory, 'check-dependency-boundary.mjs');

const directCases = [
  ['static import', "import '../supervisor/evaluator';"],
  ['re-export', "export { evaluate } from '../supervisor/evaluator';"],
  ['dynamic import()', "export const load = () => import('../supervisor/evaluator');"],
  ['require-style access', "const evaluator = require('../supervisor/evaluator'); void evaluator;"],
  ['module.require-style access', "const evaluator = module.require('../supervisor/evaluator'); void evaluator;"],
  ['import = require()', "import evaluator = require('../supervisor/evaluator'); void evaluator;"],
  ['detector protected-directory arm', "import '../supervisor/tripwire';"],
];

for (const [name, source] of directCases) {
  withFixture(source, (root) => {
    assertViolation(root, name);
    assertCliStatus(root, 1, `${name} mutation did not fail the real dependency-gate CLI`);
  });
}

withFixture("import '@sup/evaluator';", (root) => {
  assertCliStatus(root, 1,
    'non-relative tsconfig paths alias silently disarmed the real dependency-gate CLI');
  assertViolation(root, 'non-relative tsconfig paths alias');
}, {
  baseUrl: '.',
  paths: { '@sup/*': ['src/supervisor/*'] },
});

const unsupportedCases = [
  ['computed dynamic import', "const target = '../supervisor/evaluator'; void import(target);"],
  ['aliased require', "const load = require; void load('../supervisor/evaluator');"],
  [
    'createRequire',
    "import { createRequire } from 'node:module'; void createRequire(import.meta.url)('../supervisor/evaluator');",
  ],
];

for (const [name, source] of unsupportedCases) {
  withFixture(source, (root) => {
    assertViolation(root, name);
    assertCliStatus(root, 1, `${name} mutation did not fail the real dependency-gate CLI`);
  });
}

withFixture("export { helper } from './helper';", (root) => {
  write(root, 'src/core/helper.ts', "export { evaluate as helper } from '../supervisor/evaluator';\n");
  const result = checkDependencyBoundary(root);
  assert.equal(result.violations.some((violation) => violation.path.length === 3), true,
    'transitive dependency mutation did not report probe -> helper -> evaluator');
  assertCliStatus(root, 1, 'transitive dependency mutation did not fail the real CLI');
});

withFixture("import { relay } from '../../testbed/relay'; void relay;", (root) => {
  write(root, 'testbed/relay.ts', "export { evaluate as relay } from '../src/supervisor/evaluator';\n");
  assertViolation(root, 'outside-src laundering');
  assertCliStatus(root, 1, 'outside-src laundering did not fail the real CLI');
});

withFixture("import './missing-relative-module';", (root) => {
  const result = checkDependencyBoundary(root);
  assert.equal(result.violations.some((violation) =>
    violation.syntax.startsWith('unresolved relative')), true,
  'unresolved relative import was silently dropped');
  assertCliStatus(root, 1, 'unresolved relative import did not fail the real CLI');
});

withFixture("export const safe = 'data-plane only';", (root) => {
  const result = checkDependencyBoundary(root);
  assert.equal(result.files > 0, true, 'clean fixture scanned zero files');
  assert.equal(result.roots > 0, true, 'clean fixture scanned zero data-plane roots');
  assert.deepEqual(result.violations, [], 'clean data-plane graph was rejected');
  assertCliStatus(root, 0, 'clean graph did not pass the real dependency-gate CLI');
});

withTemporaryRoot((root) => {
  assertCliStatus(root, 1, 'wrong/empty --root silently disarmed the real dependency-gate CLI');
});

withTemporaryRoot((root) => {
  writeConfig(root);
  write(root, 'src/core/probe.ts', "export const safe = true;\n");
  assertCliStatus(root, 1, 'missing protected directory silently disarmed the real CLI');
});

console.log(
  'dependency boundary mutation tests PASS '
  + '(real CLI exit 1 violations, exit 0 clean, protected arm, outside-src, unresolved, computed, aliases)',
);

function assertViolation(root, name) {
  const result = checkDependencyBoundary(root);
  assert.notEqual(result.violations.length, 0, `${name} mutation did not fail the dependency gate`);
}

function assertCliStatus(root, expected, message) {
  const result = spawnSync(process.execPath, [cli, '--root', root], { encoding: 'utf8' });
  assert.equal(result.status, expected,
    `${message}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
}

function withFixture(probeSource, assertion, compilerOptions = {}) {
  withTemporaryRoot((root) => {
    writeConfig(root, compilerOptions);
    write(root, 'src/core/probe.ts', `${probeSource}\n`);
    write(root, 'src/supervisor/evaluator.ts', "export const evaluate = () => 'protected';\n");
    write(root, 'src/supervisor/tripwire.ts', "export const detect = () => 'protected';\n");
    assertion(root);
  });
}

function withTemporaryRoot(assertion) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tinyvault-dependency-gate-'));
  try {
    assertion(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeConfig(root, compilerOptions = {}) {
  write(root, 'tsconfig.json', JSON.stringify({
    compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', ...compilerOptions },
    include: ['src/**/*.ts', 'testbed/**/*.ts'],
  }));
}

function write(root, relative, contents) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}
