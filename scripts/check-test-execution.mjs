#!/usr/bin/env node
// The runtime interceptor, the capability map and the execution proof catch Docker reach from code
// modules reachable from make test — source and test files, spawn sites, plain-node gate scripts.
// The entry-point files are the reviewed root of trust, hash-pinned in-suite (package scripts,
// Makefile, three Vitest configs and scripts/check-*.mjs). Hostile edits of that root are outside the
// locked threat model; page content and the evaluated model do not edit the repository.
// No static gate is complete. File inventory and six required Docker names are pinned.
// Reads reports; never spawns Vitest.
import { cliOptions, runCli } from './gate-common.mjs';
import { checkExecution } from './test-execution.mjs';
runCli(import.meta.url, () => {
  const { root, mode } = cliOptions(true);
  checkExecution(root, mode);
  console.log('test execution PASS');
});
