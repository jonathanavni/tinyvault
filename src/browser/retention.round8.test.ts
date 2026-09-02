import { readFile, readdir } from 'node:fs/promises';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { roundEightViolations } from '../../scripts/retention/rules';


describe('retention rule round-eight support', () => {
  it('registers the round-eight describe title exactly once across every retention test', async () => {
    const files = (await readdir('src/browser'))
      .filter((name) => /^retention.*\.test\.ts$/u.test(name)).sort();
    const registrations: string[] = [];
    for (const name of files) {
      const fileName = `src/browser/${name}`;
      const source = ts.createSourceFile(
        fileName, await readFile(fileName, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
      );
      walk(source, (node) => {
        if (!ts.isCallExpression(node) || !isDescribeCall(node.expression)) return;
        const title = node.arguments[0];
        if (title !== undefined && ts.isStringLiteral(title)
          && title.text === 'retention rule round-eight support') registrations.push(fileName);
      });
    }
    expect(registrations).toEqual(['src/browser/retention.round8.test.ts']);
  });

  it('fails closed when the local-file Secret constructor disappears', () => {
    expect(roundEightViolations('const value = 1;', 'src/backends/localFile.ts'))
      .toContain('expected one local-file Secret construction, got 0');
  });

  it('rejects every forbidden implicit-control shape outside a fixed-return if', async () => {
    const fileName = 'src/browser/session.ts';
    const source = await readFile(fileName, 'utf8');
    const marker = "    const lengthDigits = String(value.length).padStart(4, '0');";
    const mutations = [
      'while (value.length > 0) break;',
      'for (const key in value as any) void key;',
      'const choice = value.length ? 1 : 0;',
      "let local = ''; local ||= value;",
      'value++;',
      'switch (value.length) { default: break; }',
      "if (value.length > 0) { moduleStash = 'x'; return tooLongOutcome(); }",
    ];
    for (const mutation of mutations) {
      const mutant = `let moduleStash = '';\n${source.replace(marker, `${marker}\n    ${mutation}`)}`;
      expect(roundEightViolations(mutant, fileName), mutation).not.toEqual([]);
    }
  });

  it('rejects aliases, Reflect, spreads, and all non-consume Secret object access', async () => {
    const fileName = 'src/browser/session.ts';
    const source = await readFile(fileName, 'utf8');
    const marker = '  const value = secret.consume();';
    for (const mutation of [
      'const alias = secret; void alias;',
      "Reflect.get(secret, 'consume');",
      'const copy = { ...secret }; void copy;',
      'secret.clear();',
      "secret['consume']();",
    ]) {
      expect(roundEightViolations(source.replace(marker, `${marker}\n  ${mutation}`), fileName), mutation)
        .not.toEqual([]);
    }
  });

  it('accepts only explicitly named fixed-outcome constructors', async () => {
    const fileName = 'src/browser/session.ts';
    const source = await readFile(fileName, 'utf8');
    const mutant = source.replace(
      "if (value.includes('\\n') || value.includes('\\r')) return unplaceableOutcome();",
      "if (value.includes('\\n') || value.includes('\\r')) return arbitraryOutcome();",
    );
    expect(roundEightViolations(mutant, fileName)).not.toEqual([]);
  });
});

function isDescribeCall(expression: ts.LeftHandSideExpression): boolean {
  if (ts.isIdentifier(expression)) return expression.text === 'describe';
  return ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)
    && expression.expression.text === 'describe';
}

function walk(root: ts.Node, visit: (node: ts.Node) => void): void {
  visit(root);
  root.forEachChild((child) => walk(child, visit));
}
