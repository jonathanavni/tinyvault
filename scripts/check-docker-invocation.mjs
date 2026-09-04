#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { checkDockerInvocation } from './docker-invocation.mjs';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  const rootIndex = process.argv.indexOf('--root');
  if (rootIndex >= 0 && !process.argv[rootIndex + 1]) throw new Error('--root requires a path');
  const root = rootIndex < 0 ? defaultRoot : path.resolve(process.argv[rootIndex + 1]);
  const violations = checkDockerInvocation(root);
  if (violations.length > 0) {
    console.error('docker invocation FAIL');
    for (const { file, line, specifier } of violations) {
      console.error(`- ${file}:${line}: capability import ${specifier} is not allowlisted`);
    }
    process.exitCode = 1;
  } else {
    console.log('docker invocation PASS');
  }
} catch (error) {
  console.error(`docker invocation FAIL: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
