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
      'src/supervisor/evidenceLease.ts',
      'src/browser/session.ts',
      'src/supervisor/host.evidence.test.ts',
      'testbed/runner.finalization.browser.test.ts',
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

const AUTHORITY_NAMES = ['FillAuthorizationLifecycle', 'onFillAuthorization', 'createFillAuthorizationDomain', 'FillAuthorization'];
const AUTHORITY_FILES = ['src/core/fillAuthorization.ts', 'src/core/fillService.ts',
  'src/supervisor/fillAuthorizationDomain.ts', 'src/supervisor/host.ts'];
const HOST_KEYS = ['tools', 'drainEvidence', 'setupReasonFor', 'abortedEvidence', 'settleEvidence',
  'quiesceEvidenceProducers', 'finish', 'abort', 'closeAll'];
const TOOL_KEYS = ['list_vault', 'request_vault_setup', 'browser_open_session', 'browser_close_session',
  'browser_navigate', 'browser_click', 'browser_type', 'browser_snapshot', 'fill_from_vault'];

import { createSupervisedHost } from '../supervisor/host';
import type { CredentialBackend } from '../backends/backend';
import type { Browser } from '../browser/playwright';

describe('T-RC-10 Unreachability pin', () => {
  it('a/c/d/e/f confines authority and resolves composition calls through the AST', async () => {
    const graph = await authorityGraph();
    assertAuthorityGraph(graph);
  });
  it('a rejects computed keys, aliases and spreads of computed keys', async () => {
    for (const access of [
      "const key = 'on' + 'FillAuthorization'; options[key]?.(() => {});",
      "const { onFillAuthorization: alias } = options; alias?.(() => {});",
      "const copied = lifecycle;",
      "const { renew: copied } = lifecycle;",
      "const key = 'on' + 'FillAuthorization'; const extra = { [key]: () => {} }; const spread = { ...extra };",
    ]) {
      const graph = await authorityGraph({ 'src/supervisor/host.ts':
        (await readFile('src/supervisor/host.ts', 'utf8')).replace('  const launchedHere', `${access}\n  const launchedHere`) });
      expect(inspectAuthorityAccess(graph)).not.toEqual([]);
    }
  });
  it('b exposes no renewal through the host, tools or safe accessor results', async () => {
    for (const withOption of [false, true]) {
      let calls = 0;
      const host = await createSupervisedHost({ backend: unusedBackend(), canary: 'TVC_rc_shape_A123456789',
        browser: {} as Browser, ...(withOption ? { onFillAuthorization: () => { calls += 1; } } : {}) });
      try {
        expect(calls).toBe(withOption ? 1 : 0);
        expect(Reflect.ownKeys(host)).toEqual(HOST_KEYS);
        expect(Reflect.ownKeys(host.tools)).toEqual(TOOL_KEYS);
        expect(Object.isFrozen(host)).toBe(true); expect(Object.isFrozen(host.tools)).toBe(true);
        for (const value of [host, host.tools, host.abortedEvidence(), host.drainEvidence()]) assertNoRenew(value);
      } finally { host.abort(); await host.closeAll(); }
    }
  });
  it('g references the composer lifecycle exactly once, only as the hook argument', async () => {
    const graph = await authorityGraph();
    const file = graph.program.getSourceFile('src/supervisor/host.ts')!;
    const calls: ts.CallExpression[] = [];
    walk(file, node => {
      if (ts.isCallExpression(node) && resolvedName(graph.checker, node.expression) === 'createFillAuthorizationDomain') calls.push(node);
    });
    expect(calls).toHaveLength(1);
    const declaration = calls[0]!.parent;
    expect(ts.isVariableDeclaration(declaration)).toBe(true);
    const binding = (declaration as ts.VariableDeclaration).name;
    expect(ts.isObjectBindingPattern(binding)).toBe(true);
    const lifecycle = (binding as ts.ObjectBindingPattern).elements.find(element =>
      (element.propertyName ?? element.name).getText() === 'lifecycle')!;
    expect(ts.isIdentifier(lifecycle.name)).toBe(true);
    const symbol = graph.checker.getSymbolAtLocation(lifecycle.name);
    expect(symbol).toBeDefined();
    const references: ts.Identifier[] = [];
    walk(file, node => {
      if (ts.isIdentifier(node) && node !== lifecycle.name && graph.checker.getSymbolAtLocation(node) === symbol) references.push(node);
    });
    expect(references).toHaveLength(1);
    const call = references[0]!.parent;
    expect(ts.isCallExpression(call)).toBe(true);
    expect((call as ts.CallExpression).arguments).toHaveLength(1);
    expect((call as ts.CallExpression).arguments[0]).toBe(references[0]);
    expect((call as ts.CallExpression).expression.getText()).toBe('options.onFillAuthorization');
  });
});

type AuthorityGraph = Awaited<ReturnType<typeof authorityGraph>>;
async function authorityGraph(overrides: Record<string, string> = {}) {
  const files = [...await sourceFiles('src'), ...await sourceFiles('testbed')].sort();
  const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, '.').options;
  const host = ts.createCompilerHost(options);
  const read = host.readFile;
  host.readFile = file => overrides[path.relative(process.cwd(), path.resolve(file))] ?? read(file);
  const program = ts.createProgram(files, { ...options, allowJs: true }, host);
  return { files, production: files.filter(file => !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file)),
    program, checker: program.getTypeChecker() };
}
function unusedBackend(): CredentialBackend {
  return { probeAvailability: async () => ({ available: true }), listItems: async () => [],
    resolvePolicy: async () => { throw new Error('unused'); },
    resolveSecret: async () => { throw new Error('unused'); }, dispose: async () => undefined };
}
function assertNoRenew(value: unknown, seen = new Set<unknown>()): void {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function') || seen.has(value)) return;
  seen.add(value);
  expect(Reflect.ownKeys(value)).not.toContain('renew');
  for (const key of Reflect.ownKeys(value)) {
    if (Object.prototype.propertyIsEnumerable.call(value, key)) assertNoRenew(Reflect.get(value as object, key), seen);
  }
}
function resolvedName(checker: ts.TypeChecker, expression: ts.Node, seen = new Set<ts.Symbol>()): string | undefined {
  for (const signature of checker.getTypeAtLocation(expression).getCallSignatures()) {
    const declaration = signature.getDeclaration();
    if (declaration && ts.isFunctionDeclaration(declaration)) return declaration.name?.text;
  }
  if (ts.isPropertyAccessExpression(expression)) expression = expression.name;
  let symbol = checker.getSymbolAtLocation(expression);
  if (symbol === undefined || seen.has(symbol)) return undefined;
  seen.add(symbol);
  if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  for (const declaration of symbol.declarations ?? []) {
    if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
      const name = resolvedName(checker, unwrap(declaration.initializer), seen);
      if (name !== undefined) return name;
    }
  }
  return symbol.name;
}
function assertAuthorityGraph(graph: AuthorityGraph): void {
  const inventory: string[] = [], composeCalls: string[] = [], composeImports: string[] = [], fillCalls: string[] = [];
  const hostAuthorizations: string[] = [], kitImporters: string[] = [];
  for (const name of graph.files) {
    const file = graph.program.getSourceFile(name)!;
    if (relativeModuleSpecifiers(file).some(specifier => specifier.endsWith('/m7.browser.testkit'))) kitImporters.push(name);
    if (!graph.production.includes(name)) continue;
    const named = new Set<string>();
    walk(file, node => {
      if (ts.isIdentifier(node)) named.add(node.text);
      inspectCompositionNode(graph, node, name, { composeCalls, composeImports, fillCalls, hostAuthorizations });
    });
    if (AUTHORITY_NAMES.some(key => named.has(key))) inventory.push(name);
  }
  expect(inventory).toEqual(AUTHORITY_FILES);
  expect(inspectAuthorityAccess(graph)).toEqual([]);
  expect([...new Set(composeCalls)]).toEqual([]); expect([...new Set(composeImports)]).toEqual([]);
  expect([...new Set(fillCalls)]).toEqual(['src/supervisor/host.ts']);
  expect(hostAuthorizations).toEqual([]);
  expect(kitImporters.sort()).toEqual(['testbed/m7.diagnostics.browser.test.ts', 'testbed/m7.hostile.browser.test.ts']);
  const host = graph.program.getSourceFile('src/supervisor/host.ts')!;
  const factory = host.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'createSupervisedHost') as ts.FunctionDeclaration;
  const optionType = graph.checker.getTypeAtLocation(factory.parameters[0]!);
  expect(optionType.getProperties().map(symbol => symbol.name)).toEqual(['backend', 'canary', 'browser', 'launcher', 'onFillAuthorization']);
}
function inspectCompositionNode(graph: AuthorityGraph, node: ts.Node, file: string,
  lists: { composeCalls: string[]; composeImports: string[]; fillCalls: string[]; hostAuthorizations: string[] }): void {
  if (ts.isImportSpecifier(node) && resolvedName(graph.checker, node.name) === 'composeSupervisedHost') lists.composeImports.push(file);
  if (ts.isNamespaceImport(node)) {
    const type = graph.checker.getTypeAtLocation(node.name);
    if (type.getProperty('composeSupervisedHost')) lists.composeImports.push(file);
  }
  if (!ts.isCallExpression(node)) return;
  const callee = resolvedName(graph.checker, node.expression);
  if (callee === 'composeSupervisedHost') lists.composeCalls.push(file);
  if (callee === 'createFillService') lists.fillCalls.push(file);
  if (callee !== 'createSupervisedHost' && callee !== 'createHost') return;
  for (const arg of node.arguments) {
    if (graph.checker.getTypeAtLocation(arg).getProperty('authorization')) lists.hostAuthorizations.push(file);
  }
}
function staticKey(node: ts.Node, checker: ts.TypeChecker, seen = new Set<ts.Symbol>()): string | undefined {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isComputedPropertyName(node)) return staticKey(node.expression, checker, seen);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticKey(node.left, checker, seen), right = staticKey(node.right, checker, seen);
    return left === undefined || right === undefined ? undefined : left + right;
  }
  if (!ts.isIdentifier(node)) return undefined;
  const symbol = checker.getSymbolAtLocation(node);
  if (symbol === undefined || seen.has(symbol)) return undefined;
  seen.add(symbol);
  const declaration = symbol.valueDeclaration;
  return declaration && ts.isVariableDeclaration(declaration) && declaration.initializer
    ? staticKey(declaration.initializer, checker, seen) : undefined;
}
function inspectAuthorityAccess(graph: AuthorityGraph): string[] {
  const violations: string[] = [];
  for (const name of graph.production) walk(graph.program.getSourceFile(name)!, node => {
    if (ts.isElementAccessExpression(node) || ts.isComputedPropertyName(node)) {
      const key = staticKey(ts.isElementAccessExpression(node) ? node.argumentExpression : node.expression, graph.checker);
      const sensitiveReceiver = ts.isElementAccessExpression(node)
        && graph.checker.getTypeAtLocation(node.expression).getProperties().some(symbol =>
          symbol.name === 'onFillAuthorization' || symbol.name === 'renew');
      if (key === 'onFillAuthorization' || key === 'renew' || sensitiveReceiver) violations.push(`${name}:computed-authority`);
    }
    if (ts.isBindingElement(node) && ['onFillAuthorization', 'renew'].includes((node.propertyName ?? node.name).getText())) violations.push(`${name}:aliased-hook`);
    const value = ts.isVariableDeclaration(node) ? node.initializer
      : ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken ? node.right : undefined;
    if (value && (ts.isIdentifier(unwrap(value)) || ts.isPropertyAccessExpression(unwrap(value)))) {
      const source = unwrap(value), type = graph.checker.getTypeAtLocation(source);
      const member = ts.isPropertyAccessExpression(source) ? source.name.text : undefined;
      if (member === 'onFillAuthorization' || member === 'renew' || type.getProperty('renew')) {
        violations.push(`${name}:aliased-authority`);
      }
    }
  });
  return violations;
}

describe('T-RC-5 Port contract structure', () => {
  it('pins consume before the protected CDP call and swallowing disposal', async () => {
    const source = await readFile('src/browser/session.ts', 'utf8');
    const file = ts.createSourceFile('session.ts', source, ts.ScriptTarget.Latest, true);
    const functions = file.statements.filter(ts.isFunctionDeclaration);
    const inject = functions.find(node => node.name?.text === 'injectDestination')!;
    expect(inject.body!.statements).toHaveLength(2);
    expect(inject.body!.statements[0]!.getText()).toBe('const value = secret.consume();');
    const guard = inject.body!.statements[1] as ts.TryStatement;
    expect(ts.isTryStatement(guard)).toBe(true);
    const calls: string[] = [], throws: string[] = [];
    walk(guard, node => {
      if (ts.isThrowStatement(node)) throws.push(node.getText());
      if (ts.isCallExpression(node)) calls.push(node.expression.getText());
    });
    expect(throws).toEqual([]);
    expect(guard.tryBlock.getText()).toContain(']).catch(() => undefined)');
    expect(calls).toContain('callFunctionOn');
    expect(guard.finallyBlock!.getText()).toBe('{\n    await disposePinnedObject(state, objectId);\n  }');
    expect(functions.find(node => node.name?.text === 'disposePinnedObject')!.body!.getText())
      .toBe('{\n  state.pinnedObjects.delete(objectId);\n  await releaseObject(state.cdp, objectId);\n}');
    expect(functions.find(node => node.name?.text === 'releaseObject')!.body!.getText())
      .toBe("{\n  await cdp.send('Runtime.releaseObject', { objectId }).catch(() => undefined);\n}");
  });
});
