// Standalone defence in depth; no module graph and no dependency-boundary imports.
// CANNOT follow computed specifiers such as import('node:' + 'child_process').
// The runtime interceptor is the PRIMARY guard. Neither half is complete alone.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Exact repo-relative module paths, never directory-wide exemptions.
export const DOCKER_CAPABILITY_ALLOWLIST = Object.freeze([
  'testbed/docker/exec.ts',
  'testbed/docker/no-docker.setup.ts',
  'testbed/docker/exec.test.ts',
  'scripts/check-acceptance-j-results.mjs',
  'scripts/dependency-boundary.selftest-fixtures.mjs',
  'scripts/dependency-boundary.selftest.mjs',
  'scripts/docker-invocation.selftest.mjs',
  'src/browser/playwright.test.ts',
  'src/browser/controls.browser.test.ts',
  'testbed/fixtures/controls-lab/index.test.ts',
  'testbed/fixtures/controls-lab/index.ts',
  'testbed/fixtures/shared/loginFixture.ts',
  'testbed/fixtures/lookalike-origin/index.ts',
]);

const capabilities = new Set(['child_process', 'net', 'http', 'https']);
const skipped = new Set(['node_modules', 'dist', 'artifacts', '.git']);

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    // Fail closed on symlinks instead of silently skipping source or following cycles.
    if (entry.isSymbolicLink()) throw new Error(`Source scan cannot follow symlink: ${target}`);
    if (entry.isDirectory()) files.push(...walk(target));
    else if (/\.(?:ts|mts|js|mjs)$/.test(entry.name)) files.push(target);
  }
  return files.sort();
}

function literalSpecifier(node) {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return node.moduleSpecifier;
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    return node.moduleReference.expression;
  }
  if (!ts.isCallExpression(node)) return undefined;
  const callee = node.expression;
  if (callee.kind === ts.SyntaxKind.ImportKeyword
    || (ts.isIdentifier(callee) && callee.text === 'require')) return node.arguments[0];
  return undefined;
}

function inspect(file, relative) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const violations = [];
  function visit(node) {
    const literal = literalSpecifier(node);
    if (literal && ts.isStringLiteral(literal) && capabilities.has(literal.text.replace(/^node:/, ''))) {
      const { line } = source.getLineAndCharacterOfPosition(literal.getStart(source));
      violations.push({ file: relative, line: line + 1, specifier: literal.text });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return violations;
}

export function checkDockerInvocation(root) {
  const absoluteRoot = path.resolve(root);
  const files = walk(absoluteRoot);
  if (files.length === 0) throw new Error('Docker invocation scan found no source files.');
  return files.flatMap((file) => {
    const relative = path.relative(absoluteRoot, file).split(path.sep).join('/');
    return DOCKER_CAPABILITY_ALLOWLIST.includes(relative) ? [] : inspect(file, relative);
  });
}
