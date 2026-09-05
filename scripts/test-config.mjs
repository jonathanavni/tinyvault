// Parse a deliberately small data grammar; never execute a candidate Vitest configuration.
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { equal, requireRule } from './gate-common.mjs';
import { DOCKER_TEST } from './test-contract.mjs';
export const FORBIDDEN_CONFIG_KEYS = ['projects', 'workspace', 'root', 'dir', 'globalSetup', 'include',
  'passWithNoTests', 'reporters', 'outputFile'];
function defaultExcludes() {
  // Read the installed package's data without importing Vite's executable module-loader graph.
  const file = new URL('../node_modules/vitest/dist/config.cjs', import.meta.url);
  const source = ts.createSourceFile('config.cjs', readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const declarations = source.statements.filter(ts.isVariableStatement)
    .flatMap((s) => [...s.declarationList.declarations]);
  const value = declarations.find((d) => ts.isIdentifier(d.name) && d.name.text === 'defaultExclude')?.initializer;
  requireRule(value && ts.isArrayLiteralExpression(value) && value.elements.every(ts.isStringLiteral), 'config-shape');
  return value.elements.map((s) => s.text);
}
const DEFAULT_EXCLUDES = defaultExcludes();
function literal(node) {
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return ts.isStringLiteral(node) ? node.text : Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap((entry) => {
    if (!ts.isSpreadElement(entry)) return [literal(entry)];
    requireRule(entry.expression.getText() === 'configDefaults.exclude', 'config-shape');
    return [...DEFAULT_EXCLUDES];
  });
  requireRule(ts.isObjectLiteralExpression(node), 'config-shape');
  const result = {};
  for (const prop of node.properties) {
    requireRule(ts.isPropertyAssignment(prop) && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)), 'config-shape');
    requireRule(!Object.hasOwn(result, prop.name.text), 'config-shape');
    result[prop.name.text] = literal(prop.initializer);
  }
  return result;
}
function forbiddenKeys(source, docker) {
  function visit(node) {
    if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))) {
      const key = node.name.text;
      requireRule(!FORBIDDEN_CONFIG_KEYS.includes(key) || (docker && key === 'include'), `config-${key}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
export function checkConfig(text, docker = false) {
  const source = ts.createSourceFile('vitest.config.ts', text, ts.ScriptTarget.Latest, true);
  requireRule(source.parseDiagnostics.length === 0, 'config-shape');
  forbiddenKeys(source, docker);
  const exports = source.statements.filter(ts.isExportAssignment);
  requireRule(exports.length === 1 && !exports[0].isExportEquals, 'config-shape');
  for (const statement of source.statements.filter((s) => !ts.isExportAssignment(s))) {
    requireRule(!docker && ts.isImportDeclaration(statement)
      && statement.moduleSpecifier.text === 'vitest/config'
      && statement.importClause?.namedBindings?.getText() === '{ configDefaults }'
      && !statement.importClause.name && !statement.importClause.isTypeOnly, 'config-shape');
  }
  const config = literal(exports[0].expression);
  requireRule(equal(Object.keys(config), ['test']) && config.test && !Array.isArray(config.test), 'config-shape');
  const test = config.test;
  if (docker) {
    requireRule(equal(Object.keys(test), ['include']) && equal(test.include, [DOCKER_TEST]), 'docker-config');
  } else {
    requireRule(equal(test.setupFiles, ['./testbed/docker/no-docker.setup.ts']), 'config-guard');
    requireRule(equal(test.exclude, [...DEFAULT_EXCLUDES, DOCKER_TEST]), 'config-exclude');
    requireRule(equal(Object.keys(test).sort(), ['exclude', 'setupFiles']), 'config-shape');
    requireRule(source.statements.filter(ts.isImportDeclaration).length === 1, 'config-shape');
  }
}
