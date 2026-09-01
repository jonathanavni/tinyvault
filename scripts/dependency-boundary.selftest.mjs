#!/usr/bin/env node
// Executed explicitly by make test; the non-.test name keeps Vitest from treating it as a suite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkDependencyBoundary } from './dependency-boundary.mjs';

const cases = [
  ['static import', "import '../supervisor/evaluator';"],
  ['re-export', "export { evaluate } from '../supervisor/evaluator';"],
  ['dynamic import()', "export const load = () => import('../supervisor/evaluator');"],
  ['require-style access', "const evaluator = require('../supervisor/evaluator'); void evaluator;"],
  ['module.require-style access', "const evaluator = module.require('../supervisor/evaluator'); void evaluator;"],
];

for (const [name, source] of cases) {
  withFixture(source, (root) => {
    const result = checkDependencyBoundary(root);
    assert.notEqual(result.violations.length, 0, `${name} mutation did not fail the dependency gate`);
    assert.equal(result.violations[0].syntax, name.replace('module.', ''));
  });
}

withFixture("export { helper } from './helper';", (root) => {
  fs.writeFileSync(path.join(root, 'src/core/helper.ts'),
    "export { evaluate as helper } from '../supervisor/evaluator';\n");
  const result = checkDependencyBoundary(root);
  assert.notEqual(result.violations.length, 0, 'transitive dependency mutation did not fail the gate');
  assert.equal(result.violations.some((violation) => violation.path.length === 3), true,
    'gate did not report the transitive probe -> helper -> evaluator path');
});

withFixture("export const safe = 'data-plane only';", (root) => {
  assert.deepEqual(checkDependencyBoundary(root).violations, [], 'clean data-plane graph was rejected');
});

console.log('dependency boundary mutation tests PASS (static, re-export, dynamic, require, transitive)');

function withFixture(probeSource, assertion) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tinyvault-dependency-gate-'));
  try {
    fs.mkdirSync(path.join(root, 'src/core'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/supervisor'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/core/probe.ts'), `${probeSource}\n`);
    fs.writeFileSync(path.join(root, 'src/supervisor/evaluator.ts'),
      "export const evaluate = () => 'protected';\n");
    assertion(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
