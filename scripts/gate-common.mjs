// The runtime interceptor, the capability map and the execution proof catch Docker reach from code
// modules reachable from make test — source and test files, spawn sites, plain-node gate scripts.
// The entry-point files are the reviewed root of trust: package.json (scripts block), Makefile,
// vitest.config.ts, vitest.docker.config.ts, vitest.eval.config.ts, and every scripts/check-*.mjs,
// plus scripts/test-contract.mjs and scripts/test-execution.mjs. Their exact content is
// hash-pinned by an in-suite test. A hostile edit of that root is outside the locked threat model
// (page content and the evaluated model do not edit the repository). No static gate is complete.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export function gateError(code) { throw new Error(code); }
export function requireRule(condition, code) { if (!condition) gateError(code); }
export const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const sorted = (items) => [...items].sort();
export function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
export function walk(root, skip = new Set(['node_modules', '.git'])) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (skip.has(entry.name)) return [];
    const file = path.join(root, entry.name);
    requireRule(!entry.isSymbolicLink(), 'source-symlink');
    return entry.isDirectory() ? walk(file, skip) : [file];
  }).sort();
}
export function runCli(url, run) {
  if (!process.argv[1] || fs.realpathSync(process.argv[1]) !== fileURLToPath(url)) return;
  try { run(); }
  catch (error) { console.error(`gate FAIL: ${error.message}`); process.exitCode = 1; }
}
export function cliOptions(allowMode = false) {
  const args = process.argv.slice(2); let root = ROOT; let mode = 'test';
  if (args[0] === '--root') {
    requireRule(typeof args[1] === 'string' && !args[1].startsWith('--'), 'arguments');
    root = path.resolve(args[1]); args.splice(0, 2);
  }
  if (allowMode && ['--docker', '--eval'].includes(args[0])) { mode = args.shift().slice(2); }
  requireRule(args.length === 0, 'arguments');
  return { root, mode };
}

export function assertMode(mode) { requireRule(['test', 'docker', 'eval'].includes(mode), 'mode'); }
