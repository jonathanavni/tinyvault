#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { checkDependencyBoundary, formatViolations } from './dependency-boundary.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDirectory, '..');
const rootIndex = process.argv.indexOf('--root');
const root = rootIndex < 0 ? defaultRoot : path.resolve(process.argv[rootIndex + 1]);
const result = checkDependencyBoundary(root);

if (result.violations.length > 0) {
  console.error('dependency boundary FAIL');
  for (const violation of formatViolations(root, result.violations)) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log(
    `dependency boundary PASS (${result.files} production modules, ${result.roots} data-plane roots checked)`,
  );
}
