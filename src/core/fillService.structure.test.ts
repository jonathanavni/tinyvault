import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

describe('A/K fill-service structural confinement', () => {
  it('kills extra consume/expose sites, Secret.prototype access, and redaction importer expansion', async () => {
    const files = await sourceFiles('src');
    const production = files.filter((file) => !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file));
    const texts = await Promise.all(production.map(async (file) => [file, await readFile(file, 'utf8')] as const));
    const valueSites = texts.filter(([file]) => file !== 'src/core/redaction.ts').flatMap(([file, source]) =>
      inspectSecretValueSites(source, file));
    expect(valueSites).toEqual(['src/browser/session.ts:.consume()']);
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
  });

  it('kills a core-to-browser edge and a value import of redaction in fillService.ts', async () => {
    const source = await readFile('src/core/fillService.ts', 'utf8');
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:\/|^)browser(?:\/|['"])/u);
    expect(source).toMatch(/import\s+type\s+\{\s*Secret\s*\}\s+from\s+['"]\.\/redaction['"]/u);
    expect(source).not.toMatch(/import\s+\{[^}]*Secret[^}]*\}\s+from\s+['"]\.\/redaction['"]/u);
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
    else sites.push(`${fileName}:forbidden-${node.expression.name.text}()`);
  });
  return sites;
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
