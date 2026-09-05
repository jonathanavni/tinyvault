import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXPECTED_TEST_COMMANDS, EXPECTED_DOCKER_COMMANDS, REPORTS, DOCKER_REPORT, START_FILE } from './test-contract.mjs';
// Independent rule inventory: equality in both directions is checked by rootOfTrust.test.ts too.
export const ENTRY_MUTANTS = [
  ['lifecycle', (d) => { d.scripts.pretest = 'echo bypass'; }],
  ['test-tokens', (d) => { d.scripts.test += '; exit 0'; }],
  ['test-commands', (d) => { d.scripts.test = d.scripts.test.split(' && ').slice(1).join(' && '); }],
  ['docker-commands', (d) => { d.scripts['test:docker'] += ' --passWithNoTests'; }],
  ['make-test', (d) => { d.makefile = 'test: bypass\n\tnpm run test\n'; }],
  ['config-files', (d) => { d.configs['nested/vite.config.cjs'] = 'module.exports = {}'; }],
  ...['projects', 'workspace', 'root', 'dir', 'globalSetup', 'include', 'passWithNoTests', 'reporters', 'outputFile']
    .map((key) => [`config-${key}`, (d) => { d.configs['vitest.config.ts'] = d.configs['vitest.config.ts'].replace('test: {', `test: { ${key}: [],`); }]),
  ['config-shape', (d) => { d.configs['vitest.config.ts'] += '\nconsole.log("executed");'; }],
  ['config-guard', (d) => { d.configs['vitest.config.ts'] = d.configs['vitest.config.ts'].replace('./testbed/docker/no-docker.setup.ts', './unguarded.ts'); }],
  ['config-exclude', (d) => { d.configs['vitest.config.ts'] = d.configs['vitest.config.ts'].replace('...configDefaults.exclude, ', ''); }],
  ['docker-config', (d) => { d.configs['vitest.docker.config.ts'] = d.configs['vitest.docker.config.ts'].replace('include:', 'setupFiles: [], include:'); }],
];
export const ENTRY_MUTANT_CODES = [...ENTRY_MUTANTS.map(([code]) => code), 'report-reset'];
export function entryFixture() {
  return { scripts: { test: EXPECTED_TEST_COMMANDS.join(' && '), 'test:docker': EXPECTED_DOCKER_COMMANDS.join(' && ') },
    makefile: 'test:\n\tnpm run test\n', configs: {
      'vitest.config.ts': "import { configDefaults } from 'vitest/config'; export default { test: { setupFiles: ['./testbed/docker/no-docker.setup.ts'], exclude: [...configDefaults.exclude, 'testbed/docker/composed.docker.test.ts'] } };",
      'vitest.docker.config.ts': "export default { test: { include: ['testbed/docker/composed.docker.test.ts'] } };",
    } };
}
export function entrySelftest(check, reset, rules) {
  assert.deepEqual([...ENTRY_MUTANT_CODES].sort(), [...rules].sort());
  for (const [code, mutate] of ENTRY_MUTANTS) {
    const document = entryFixture(); mutate(document);
    assert.throws(() => check(document), { message: code }, code);
    check(entryFixture());
  }
  for (const token of ['|| true', '| cat', '> report', '$(echo bypass)', '`echo bypass`', '& echo bypass',
    '--config x', '-c x', '--root x', '-r x', '--dir x', '--project x']) {
    const document = entryFixture(); document.scripts.test += ` ${token}`;
    assert.throws(() => check(document), { message: 'test-tokens' });
  }
  for (const makefile of ['test:\n\tnpm run test\n\techo bypass\n', 'test::\n\tnpm run test\n',
    'test:\n\tnpm run test\n\ntest:\n\tnpm run test\n', 'test: ; npm run test\n']) {
    const document = entryFixture(); document.makefile = makefile;
    assert.throws(() => check(document), { message: 'make-test' });
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tinyvault-entry-'));
  try {
    fs.mkdirSync(path.join(root, '.vitest'));
    for (const report of [...REPORTS, DOCKER_REPORT]) fs.writeFileSync(path.join(root, report), 'stale');
    const assertAbsent = () => assert(REPORTS.every((r) => !fs.existsSync(path.join(root, r))), 'report-reset');
    assert.throws(assertAbsent, /report-reset/); // reset deletion mutant is observably red
    reset(root); assertAbsent();
    assert.equal(fs.existsSync(path.join(root, DOCKER_REPORT)), true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, START_FILE))).mode, 'test');
    reset(root, true); assert.equal(fs.existsSync(path.join(root, DOCKER_REPORT)), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
