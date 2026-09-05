#!/usr/bin/env node
// The runtime interceptor, the capability map and the execution proof catch Docker reach from code
// modules reachable from make test — source and test files, spawn sites, plain-node gate scripts.
// Entry-point files (package scripts, Makefile, both Vitest configs and scripts/check-*.mjs) are the
// reviewed root of trust, hash-pinned in-suite. A hostile root edit is outside the locked threat model:
// page content and the evaluated model do not edit the repository. No static gate is complete.
// Makefile parse-time execution precedes this gate and is part of that declared root of trust.
import fs from 'node:fs';
import path from 'node:path';
import { cliOptions, equal, readJson, requireRule, runCli, walk } from './gate-common.mjs';
import { checkConfig, FORBIDDEN_CONFIG_KEYS } from './test-config.mjs';
import { EXPECTED_TEST_COMMANDS, EXPECTED_DOCKER_COMMANDS, REPORTS, DOCKER_REPORT,
  START_FILE, DOCKER_START_FILE } from './test-contract.mjs';
import { entrySelftest } from './test-entry.selftest.mjs';
import { executionSelftest } from './test-execution.selftest.mjs';
export { EXPECTED_TEST_COMMANDS } from './test-contract.mjs';
export const ENTRY_RULES = Object.freeze(['lifecycle', 'test-tokens', 'test-commands', 'docker-commands',
  'make-test', 'config-files', ...FORBIDDEN_CONFIG_KEYS.map((k) => `config-${k}`),
  'config-shape', 'config-guard', 'config-exclude', 'docker-config', 'report-reset']);
export function checkEntryDocuments({ scripts, makefile, configs }) {
  requireRule(scripts && !Object.hasOwn(scripts, 'pretest') && !Object.hasOwn(scripts, 'posttest'), 'lifecycle');
  requireRule(typeof scripts.test === 'string' && !/[;|<>\n\r`$()]|(?<!&)&(?!&)|\bexit\b|(?:^|\s)(?:--config|-c|--root|-r|--dir|--project)(?:[=\s]|$)/.test(scripts.test), 'test-tokens');
  requireRule(equal(scripts.test.split('&&').map((s) => s.trim()), EXPECTED_TEST_COMMANDS), 'test-commands');
  requireRule(scripts['test:docker'] === EXPECTED_DOCKER_COMMANDS.join(' && ')
    && !Object.hasOwn(scripts, 'pretest:docker') && !Object.hasOwn(scripts, 'posttest:docker'), 'docker-commands');
  const lines = makefile.split(/\r?\n/);
  const targets = lines.map((s, i) => !s.startsWith('\t') && !s.trimStart().startsWith('#')
    && s.includes(':') && s.split(':')[0].trim().split(/\s+/).includes('test') ? i : -1).filter((i) => i >= 0);
  requireRule(targets.length === 1 && lines[targets[0]] === 'test:', 'make-test');
  const recipe = [];
  for (const line of lines.slice(targets[0] + 1)) {
    if (line && !/^\s|#/.test(line)) break;
    if (line.trim() && !line.startsWith('#')) recipe.push(line);
  }
  requireRule(equal(recipe, ['\tnpm run test']), 'make-test');
  requireRule(equal(Object.keys(configs).sort(), ['vitest.config.ts', 'vitest.docker.config.ts']), 'config-files');
  checkConfig(configs['vitest.config.ts']);
  checkConfig(configs['vitest.docker.config.ts'], true);
}
export function readEntryDocuments(root) {
  const configs = walk(root).filter((file) => /(?:^|\/)(?:vite|vitest)(?:\.[^/]+)?\.config\.[cm]?[jt]s$/.test(file));
  return { scripts: readJson(path.join(root, 'package.json')).scripts,
    makefile: fs.readFileSync(path.join(root, 'Makefile'), 'utf8'),
    configs: Object.fromEntries(configs.map((file) => [path.relative(root, file), fs.readFileSync(file, 'utf8')])) };
}
export function resetReports(root, docker = false) {
  const reports = docker ? [DOCKER_REPORT] : REPORTS;
  const startFile = docker ? DOCKER_START_FILE : START_FILE;
  for (const report of reports) fs.rmSync(path.join(root, report), { force: true });
  fs.mkdirSync(path.dirname(path.join(root, startFile)), { recursive: true });
  fs.writeFileSync(path.join(root, startFile), JSON.stringify({ started: Date.now(), mode: docker ? 'docker' : 'test' }));
  requireRule(reports.every((report) => !fs.existsSync(path.join(root, report))), 'report-reset');
}
runCli(import.meta.url, () => {
  const { root, docker } = cliOptions(true);
  entrySelftest(checkEntryDocuments, resetReports, ENTRY_RULES);
  executionSelftest();
  checkEntryDocuments(readEntryDocuments(root));
  resetReports(root, docker);
  console.log('test entry PASS');
});
