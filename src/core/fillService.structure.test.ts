import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

describe('A/K fill-service structural confinement', () => {
  it('kills extra consume/expose sites, Secret.prototype access, and redaction importer expansion', async () => {
    const files = await sourceFiles('src');
    const production = files.filter((file) => !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file));
    const texts = await Promise.all(production.map(async (file) => [file, await readFile(file, 'utf8')] as const));
    const valueSites = texts.flatMap(([file, source]) => inspectSecretValueSites(source, file));
    expect(valueSites).toEqual([
      'src/browser/session.ts:.consume()',
      'src/core/redaction.ts:.expose()',
    ]);
    expect(texts.flatMap(([file, source]) => source.includes('Secret.prototype') ? [file] : []))
      .toEqual([]);

    const importers = texts.flatMap(([file, source]) =>
      /from\s+['"][^'"]*redaction['"]/u.test(source) ? [file] : []);
    expect(importers).toEqual([
      'src/backends/backend.ts',
      'src/backends/localFile.ts',
      'src/browser/session.ts',
      'src/core/browserPort.ts',
      'src/core/fillService.ts',
    ]);
  });

  it('kills computed or aliased access to a Secret object with an AST assertion', async () => {
    const file = 'src/browser/session.ts';
    const source = await readFile(file, 'utf8');
    const mutant = source.replace(
      '  const value = secret.consume();',
      "  const value = (secret as unknown as Record<string, () => string>)['expo' + 'se']();",
    );
    expect(inspectSecretValueSites(mutant, file)).toContain(`${file}:computed-secret-access`);
    expect(inspectComputedSecretAccesses(mutant, file)).toContain(`${file}:computed-secret-access`);
  });

  it('pins every sensitive module importer and computed Secret access across the src import graph', async () => {
    const files = (await sourceFiles('src'))
      .filter((file) => !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file));
    const sources = new Map(await Promise.all(files.map(async (file) =>
      [file, await readFile(file, 'utf8')] as const)));
    const fileSet = new Set([
      ...files,
      ...await sourceFiles('testbed'),
      ...await sourceFiles('scripts'),
    ]);
    const unresolved: string[] = [];
    const sensitiveRoots = new Set([
      'src/core/redaction.ts',
      'src/backends/localFileSodium.ts',
      'src/backends/localFileFormat.ts',
    ]);
    const importers: string[] = [];
    for (const [file, source] of sources) {
      const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const targets = relativeModuleSpecifiers(parsed).map((specifier) => {
        const target = resolveSourceModule(file, specifier, fileSet);
        if (target === undefined) unresolved.push(`${file}:${specifier}`);
        return target;
      }).filter((target): target is string => target !== undefined);
      if (targets.some((target) => sensitiveRoots.has(target)) || importsNamedSecret(parsed)) {
        importers.push(file);
      }
    }
    expect(unresolved).toEqual([]);
    expect(importers.sort()).toEqual([
      'src/backends/backend.ts',
      'src/backends/localFile.ts',
      'src/backends/localFileFormat.ts',
      'src/backends/localFileWriter.ts',
      'src/browser/session.ts',
      'src/core/browserPort.ts',
      'src/core/fillService.ts',
    ]);
    const fixedSixPlusKnownConsumers = new Set([
      'src/browser/session.ts',
      'src/core/fillService.ts',
      'src/backends/localFile.ts',
      'src/backends/localFileSodium.ts',
      'src/backends/localFileFormat.ts',
      'src/core/redaction.ts',
      'src/backends/backend.ts',
      'src/backends/localFileWriter.ts',
      'src/core/browserPort.ts',
    ]);
    expect(importers.every((file) => fixedSixPlusKnownConsumers.has(file))).toBe(true);
    expect([...sources].flatMap(([file, source]) => inspectComputedSecretAccesses(source, file))).toEqual([]);
    for (const variant of [
      "import { Secret as Hidden } from './redaction'; class Derived extends Hidden {}",
      "async function load() { return import('./redaction'); }",
      "export { Secret as Hidden } from './redaction';",
    ]) {
      const parsed = ts.createSourceFile('src/core/probe.ts', variant,
        ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      expect(relativeModuleSpecifiers(parsed)).toEqual(['./redaction']);
      expect(resolveSourceModule('src/core/probe.ts', './redaction', fileSet))
        .toBe('src/core/redaction.ts');
    }
    const relayed = ts.createSourceFile('src/core/probe.ts',
      "import { Secret as Hidden } from '../backends/backend'; class Derived extends Hidden {}",
      ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    expect(importsNamedSecret(relayed)).toBe(true);
  });

  it('kills a core-to-browser edge and a value import of redaction in fillService.ts', async () => {
    const source = await readFile('src/core/fillService.ts', 'utf8');
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:\/|^)browser(?:\/|['"])/u);
    expect(source).toMatch(/import\s+type\s+\{\s*Secret\s*\}\s+from\s+['"]\.\/redaction['"]/u);
    expect(source).not.toMatch(/import\s+\{[^}]*Secret[^}]*\}\s+from\s+['"]\.\/redaction['"]/u);
    expect(source).toContain('observation.unobserved && observation.topOrigin !== null');
  });

  it('kills source growth beyond the locked auditability limits', async () => {
    for (const file of [
      'src/core/fillService.ts',
      'src/supervisor/host.ts',
      'src/core/fillService.test.ts',
      'src/core/fillService.browser.test.ts',
      'src/supervisor/host.test.ts',
      'src/supervisor/host.browser.test.ts',
      'src/supervisor/host.timing.browser.test.ts',
      'testbed/runner.ts',
      'testbed/checkers/leakDecoders.ts',
      'scripts/retention/rules.ts',
    ]) {
      const lines = (await readFile(file, 'utf8')).split('\n').length;
      expect(lines, `${file} must remain under 800 lines`).toBeLessThan(800);
    }
  });
});

async function sourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(target));
    else if (/\.[cm]?[jt]sx?$/u.test(entry.name)) files.push(target);
  }
  return files.sort();
}

function inspectSecretValueSites(source: string, fileName: string): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const secretBindings = new Set<string>();
  walk(file, (node) => {
    if ((ts.isParameter(node) || ts.isVariableDeclaration(node))
      && ts.isIdentifier(node.name) && node.type?.getText() === 'Secret') secretBindings.add(node.name.text);
  });
  const sites: string[] = [];
  walk(file, (node) => {
    if (ts.isElementAccessExpression(node)) {
      const receiver = unwrap(node.expression);
      if (ts.isIdentifier(receiver) && secretBindings.has(receiver.text)) {
        sites.push(`${fileName}:computed-secret-access`);
      }
    }
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)
      || !['consume', 'expose'].includes(node.expression.name.text)) return;
    const receiver = unwrap(node.expression.expression);
    const declaration = node.parent;
    const list = ts.isVariableDeclaration(declaration) ? declaration.parent : undefined;
    if (fileName === 'src/browser/session.ts' && node.expression.name.text === 'consume'
      && ts.isIdentifier(receiver) && secretBindings.has(receiver.text)
      && ts.isVariableDeclaration(declaration) && declaration.initializer === node
      && list !== undefined && ts.isVariableDeclarationList(list)
      && (list.flags & ts.NodeFlags.Const) !== 0) sites.push(`${fileName}:.consume()`);
    else if (fileName === 'src/core/redaction.ts' && node.expression.name.text === 'expose'
      && receiver.kind === ts.SyntaxKind.ThisKeyword) sites.push(`${fileName}:.expose()`);
    else sites.push(`${fileName}:forbidden-${node.expression.name.text}()`);
  });
  return sites;
}

function relativeModuleSpecifiers(file: ts.SourceFile): string[] {
  const specifiers = new Set<string>();
  walk(file, (node) => {
    let literal: ts.StringLiteralLike | undefined;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier !== undefined && ts.isStringLiteralLike(node.moduleSpecifier)) {
      literal = node.moduleSpecifier;
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0]!)) {
      literal = node.arguments[0];
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
      && ts.isStringLiteralLike(node.argument.literal)) {
      literal = node.argument.literal;
    }
    if (literal?.text.startsWith('.')) specifiers.add(literal.text);
  });
  return [...specifiers];
}

function importsNamedSecret(file: ts.SourceFile): boolean {
  let found = false;
  walk(file, (node) => {
    if (ts.isImportSpecifier(node) || ts.isExportSpecifier(node)) {
      if ((node.propertyName ?? node.name).text === 'Secret') found = true;
    }
    if (ts.isImportTypeNode(node) && node.qualifier !== undefined
      && node.qualifier.getText().split('.').at(-1) === 'Secret') found = true;
  });
  return found;
}

function resolveSourceModule(from: string, specifier: string, files: ReadonlySet<string>): string | undefined {
  const unresolved = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier))
    .replace(/\.js$/u, '');
  return [
    unresolved,
    `${unresolved}.ts`,
    `${unresolved}.tsx`,
    `${unresolved}/index.ts`,
    `${unresolved}/index.tsx`,
  ].find((candidate) => files.has(candidate));
}

function inspectComputedSecretAccesses(source: string, fileName: string): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const secretTypes = new Set<string>(['Secret']);
  walk(file, (node) => {
    if (!ts.isImportDeclaration(node) || node.importClause === undefined) return;
    for (const binding of node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
      ? node.importClause.namedBindings.elements : []) {
      if ((binding.propertyName ?? binding.name).text === 'Secret') secretTypes.add(binding.name.text);
    }
  });
  let changed = true;
  while (changed) {
    changed = false;
    walk(file, (node) => {
      if (!ts.isClassDeclaration(node) || node.name === undefined || node.heritageClauses === undefined) return;
      const extendsSecret = node.heritageClauses.some((clause) => clause.types.some((type) => {
        const expression = unwrap(type.expression);
        return ts.isIdentifier(expression) && secretTypes.has(expression.text);
      }));
      if (extendsSecret && !secretTypes.has(node.name.text)) {
        secretTypes.add(node.name.text);
        changed = true;
      }
    });
  }
  const bindings = new Set<string>();
  const properties = new Set<string>();
  walk(file, (node) => {
    if ((ts.isParameter(node) || ts.isVariableDeclaration(node)) && ts.isIdentifier(node.name)
      && node.type !== undefined && typeNames(node.type).some((name) => secretTypes.has(name))) {
      bindings.add(node.name.text);
    }
    if (ts.isPropertyDeclaration(node) && ts.isIdentifier(node.name) && node.type !== undefined
      && typeNames(node.type).some((name) => secretTypes.has(name))) properties.add(node.name.text);
  });
  const violations: string[] = [];
  walk(file, (node) => {
    if (!ts.isElementAccessExpression(node)) return;
    const receiver = unwrap(node.expression);
    const secretBinding = ts.isIdentifier(receiver) && bindings.has(receiver.text);
    const secretProperty = ts.isPropertyAccessExpression(receiver)
      && receiver.expression.kind === ts.SyntaxKind.ThisKeyword && properties.has(receiver.name.text);
    const assertedSecret = typeAssertions(node.expression)
      .some((name) => secretTypes.has(name));
    if (secretBinding || secretProperty || assertedSecret) {
      violations.push(`${fileName}:computed-secret-access`);
    }
  });
  return violations;
}

function typeNames(type: ts.TypeNode): string[] {
  const names: string[] = [];
  walk(type, (node) => { if (ts.isIdentifier(node)) names.push(node.text); });
  return names;
}

function typeAssertions(expression: ts.Expression): string[] {
  const names: string[] = [];
  let current = expression;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current) || ts.isNonNullExpression(current)) {
    if (ts.isAsExpression(current) || ts.isTypeAssertionExpression(current)) {
      names.push(...typeNames(current.type));
    }
    current = current.expression;
  }
  return names;
}

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current) || ts.isNonNullExpression(current)) {
    current = current.expression;
  }
  return current;
}

function walk(root: ts.Node, visit: (node: ts.Node) => void): void {
  visit(root);
  root.forEachChild((child) => walk(child, visit));
}
