import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { RETENTION_SOURCE_FILES, retentionViolations } from '../../scripts/retention/rules';


describe('positive secret-retention structure', () => {
  it('keeps the fixed source set non-vacuous and clean', async () => {
    expect(RETENTION_SOURCE_FILES).toEqual([
      'src/browser/session.ts',
      'src/core/fillService.ts',
      'src/backends/localFile.ts',
      'src/backends/localFileSodium.ts',
      'src/backends/localFileFormat.ts',
      'src/core/redaction.ts',
    ]);
    for (const file of RETENTION_SOURCE_FILES) {
      expect(retentionViolations(await readFile(resolve(file), 'utf8'), file), file).toEqual([]);
    }
  });

  it('rejects taint in Map and Set keys or values, including constructor entries', async () => {
    const fileName = 'src/browser/session.ts';
    const source = await readFile(resolve(fileName), 'utf8');
    const marker = "    const lengthDigits = String(value.length).padStart(4, '0');";
    const mutants = [
      source.replace(marker, `${marker}\n    new Map().set(value, true);`),
      source.replace(marker, `${marker}\n    new Map().set('key', value);`),
      source.replace(marker, `${marker}\n    new Map([[value, true]]);`),
      source.replace(marker, `${marker}\n    new Set([value]);`),
      source.replace(marker, `${marker}\n    new Set().add(value);`),
    ];
    for (const mutant of mutants) expect(retentionViolations(mutant, fileName)).not.toEqual([]);
  });

  it('keys the Secret rule on every resolveSecret result, including inferred bindings', () => {
    const safe = `
      async function fill(destination: PinnedDestination, backend: Backend) {
        let secret: Secret;
        secret = await backend.resolveSecret();
        try { await destination.inject(secret); }
        finally { secret.clear(); }
      }
      async function inferred(destination: PinnedDestination, backend: Backend) {
        const secret = await backend.resolveSecret();
        try { await destination.inject(secret); }
        finally { secret.clear(); }
      }
    `;
    expect(retentionViolations(safe, 'fake.ts')).toEqual([]);
    const marker = 'secret = await backend.resolveSecret();';
    const mutants = [
      safe.replace(marker, `${marker}\n        retain(secret);`),
      safe.replace(marker, `${marker}\n        const alias = secret; void alias;`),
      `let moduleSecret;\n${safe.replace(marker, `${marker}\n        moduleSecret = secret;`)}`,
      safe.replace(marker, `${marker}\n        state.secret = secret;`),
      safe.replace(marker, `${marker}\n        const closure = () => secret; void closure;`),
      safe.replace('await destination.inject(secret);', 'return secret;'),
      safe.replace('await destination.inject(secret);', 'await (globalThis as any).exfil.inject(secret);'),
    ];
    for (const mutant of mutants) expect(retentionViolations(mutant, 'fake.ts')).not.toEqual([]);
  });

  it('kills arbitrary-inject, inferred-type retention, and duplicate-resolution mutants', async () => {
    const fileName = 'src/core/fillService.ts';
    const source = await readFile(resolve(fileName), 'utf8');
    const marker = '    secret = await options.backend.resolveSecret(request.handle, policy);';
    const inject = '      const injected = await destination.inject(secret, canonicalOrigin);';
    const inferred = `const retainedSecrets: Secret[] = [];\n${source.replace(marker,
      '    const stashed = await options.backend.resolveSecret(request.handle, policy);\n'
        + '    retainedSecrets.push(stashed);\n    secret = stashed;',
    )}`;
    for (const [name, mutant] of [
      ['arbitrary inject', source.replace(inject,
        '      const injected = await (globalThis as any).exfil.inject(secret, canonicalOrigin);')],
      ['inferred retention', inferred],
      ['duplicate resolution', source.replace(marker,
        `${marker}\n    await options.backend.resolveSecret(request.handle, policy);`)],
      ['Secret throw', source.replace(marker, `${marker}\n    throw secret;`)],
    ] as const) expect(retentionViolations(mutant, fileName), name).not.toEqual([]);
  });

  it('asserts the module-local CDP sink has one direct caller', async () => {
    const source = await readFile('src/browser/session.ts', 'utf8');
    const file = ts.createSourceFile('session.ts', source, ts.ScriptTarget.Latest, true);
    const calls: ts.CallExpression[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        && node.expression.text === 'callFunctionOn') calls.push(node);
      node.forEachChild(visit);
    };
    visit(file);
    expect(calls).toHaveLength(4);
    expect(retentionViolations(source, 'src/browser/session.ts')).toEqual([]);
  });

  it('M9 retention gate file exists', async () => {
    expect((await readFile('src/backends/onepassword.structure.test.ts', 'utf8')).trim()).not.toBe('');
  });

  it('keeps every secret-opening primitive reference inside the fixed file set', async () => {
    const files = await sourceFiles('src');
    const outside = files.filter((file) => !RETENTION_SOURCE_FILES.includes(file as never));
    const references: string[] = [];
    for (const file of outside) {
      const source = await readFile(file, 'utf8');
      if (file === 'src/backends/onepassword.ts') {
        const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
        const constructors: ts.NewExpression[] = [];
        const imports: ts.ImportDeclaration[] = [];
        const visit = (node: ts.Node): void => {
          if (ts.isNewExpression(node) && node.expression.getText() === 'Secret') constructors.push(node);
          if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
            && node.moduleSpecifier.text === '../core/redaction') imports.push(node);
          node.forEachChild(visit);
        };
        visit(parsed);
        expect(constructors, 'M9 sole direct Secret constructor').toHaveLength(1);
        expect(imports.map(node => node.getText()), 'M9 direct Secret import')
          .toEqual(["import { Secret } from '../core/redaction';"]);
        expect(source.match(/new\s+Secret\s*\(/gu), 'M9 textual constructor inventory').toHaveLength(1);
        if (/\.consume\s*\(|\.expose\s*\(|\b(?:primitives|defaultSealingPrimitives)\.open\s*\(|crypto_aead_\w*decrypt/u
          .test(source)) references.push(file);
      } else if (/new\s+Secret\s*\(|\.consume\s*\(|\.expose\s*\(|\b(?:primitives|defaultSealingPrimitives)\.open\s*\(|crypto_aead_\w*decrypt/u
        .test(source)) references.push(file);
    }
    expect(references).toEqual([]);
  });
});

async function sourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = `${root}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await sourceFiles(target));
    else if (/\.[cm]?[jt]sx?$/u.test(entry.name) && !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(entry.name)) {
      files.push(target);
    }
  }
  return files.sort();
}
