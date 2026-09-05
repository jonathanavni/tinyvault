#!/usr/bin/env node
// The runtime interceptor, capability map and execution proof catch Docker reach from code modules
// reachable from make test. Entry-point files are the reviewed root of trust, hash-pinned in-suite.
// Hostile root-of-trust edits are outside the locked threat model; no static gate is complete.
import { cliOptions, runCli } from './gate-common.mjs';
import { checkCompose } from './compose-lint.mjs';
runCli(import.meta.url, () => { checkCompose(cliOptions().root); console.log('compose lint PASS'); });
