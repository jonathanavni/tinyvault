import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { createSupervisedHost } from '../supervisor/host';
import type { CredentialBackend } from '../backends/backend';
import type { Browser } from '../browser/playwright';
describe('A/K fill-service structural confinement', () => {
  it('kills extra consume/expose sites, Secret.prototype access, and redaction importer expansion', async () => {
    const files = await sourceFiles('src');
    const production = files.filter((file) => !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file));
    const texts = await Promise.all(production.map(async (file) => [file, await readFile(file, 'utf8')] as const));
    const valueSites = texts.flatMap(([file, source]) => inspectSecretValueSites(source, file));
    expect(valueSites).toEqual(['src/browser/session.ts:.consume()', 'src/core/redaction.ts:.expose()']);
    expect(texts.flatMap(([file, source]) => source.includes('Secret.prototype') ? [file] : [])).toEqual([]);
    const importers = texts.flatMap(([file, source]) =>
      /from\s+['"][^'"]*redaction['"]/u.test(source) ? [file] : []);
    expect(importers).toEqual(['src/backends/backend.ts', 'src/backends/localFile.ts', 'src/browser/session.ts',
      'src/core/browserPort.ts', 'src/core/fillService.ts']);
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
    const fileSet = new Set([...files, ...await sourceFiles('testbed'), ...await sourceFiles('scripts')]);
    const unresolved: string[] = [];
    const sensitiveRoots = new Set(['src/core/redaction.ts', 'src/backends/localFileSodium.ts', 'src/backends/localFileFormat.ts']);
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
      'src/backends/backend.ts', 'src/backends/localFile.ts', 'src/backends/localFileFormat.ts',
      'src/backends/localFileWriter.ts', 'src/browser/session.ts', 'src/core/browserPort.ts',
      'src/core/fillService.ts',
    ]);
    const fixedSixPlusKnownConsumers = new Set([
      'src/browser/session.ts', 'src/core/fillService.ts', 'src/backends/localFile.ts',
      'src/backends/localFileSodium.ts', 'src/backends/localFileFormat.ts', 'src/core/redaction.ts',
      'src/backends/backend.ts', 'src/backends/localFileWriter.ts', 'src/core/browserPort.ts',
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
      'src/core/fillService.structure.test.ts', 'src/core/fillService.ts', 'src/supervisor/host.ts', 'src/supervisor/evidenceLease.ts',
      'src/browser/session.ts', 'src/supervisor/host.evidence.test.ts',
      'testbed/runner.finalization.browser.test.ts', 'src/core/fillService.test.ts',
      'src/core/fillService.browser.test.ts', 'src/supervisor/host.test.ts', 'src/supervisor/host.browser.test.ts',
      'src/supervisor/host.timing.browser.test.ts', 'testbed/runner.ts', 'testbed/checkers/leakDecoders.ts',
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
  return [unresolved, `${unresolved}.ts`, `${unresolved}.tsx`, `${unresolved}/index.ts`, `${unresolved}/index.tsx`]
    .find((candidate) => files.has(candidate));
}
function inspectComputedSecretAccesses(source: string, fileName: string): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const secretTypes = secretTypeNames(file);
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
function secretTypeNames(file: ts.SourceFile): Set<string> {
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
  return secretTypes;
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
    || ts.isTypeAssertionExpression(current) || ts.isSatisfiesExpression(current) || ts.isNonNullExpression(current)) {
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
    || ts.isTypeAssertionExpression(current) || ts.isSatisfiesExpression(current) || ts.isNonNullExpression(current)) {
    current = current.expression;
  }
  return current;
}
function walk(root: ts.Node, visit: (node: ts.Node) => void): void {
  visit(root);
  root.forEachChild((child) => walk(child, visit));
}
const AUTHORITY_NAMES = ['FillAuthorizationLifecycle', 'onFillAuthorization', 'createFillAuthorizationDomain', 'FillAuthorization', 'renew'];
const AUTHORITY_FILES = ['src/core/fillAuthorization.ts', 'src/core/fillService.ts',
  'src/supervisor/fillAuthorizationDomain.ts', 'src/supervisor/host.ts'];
const HOST_KEYS = ['tools', 'drainEvidence', 'setupReasonFor', 'abortedEvidence', 'settleEvidence',
  'quiesceEvidenceProducers', 'finish', 'abort', 'closeAll'];
const TOOL_KEYS = ['list_vault', 'request_vault_setup', 'browser_open_session', 'browser_close_session',
  'browser_navigate', 'browser_click', 'browser_type', 'browser_snapshot', 'fill_from_vault'];
const PLANTED_KEY = "['on','Fill','Authorization'].join('')";
const CAPTURE = '(hook: any) => { (globalThis as any).__grant = Object.values(hook)[0]; }';
const BASE_OPTIONS = '{ backend, canary: run.canary, browser: input.browser }';
const SAVED_HOOK = 'const saved = { ...options };';
const FORWARD_HOOK = '(value: { renew(handle: string): void }) => { Object.assign(globalThis, { __rc: value }); saved.onFillAuthorization?.(value); }';
const R3_CASES: [string, string, string, string[]][] = [
  ['unresolved receiver', 'runner', `Object.create(null)[String('key')] = 1; host = await input.createHost(${BASE_OPTIONS});`, ['unresolved-receiver']],
  ['assign separate options', 'runner', `const hostOptions = ${BASE_OPTIONS}; Object.assign(hostOptions, { [${PLANTED_KEY}]: ${CAPTURE} });
    host = await input.createHost(hostOptions as never);`, ['host-argument-shape']],
  ['defineProperty and assign', 'runner', `const planted = {}; Object.defineProperty(planted, ${PLANTED_KEY}, { value: ${CAPTURE}, enumerable: true });
    host = await input.createHost(Object.assign(${BASE_OPTIONS}, planted));`, ['host-argument-shape']],
  ['Proxy', 'runner', `host = await input.createHost(new Proxy(${BASE_OPTIONS}, {
    get(target, key, receiver) { return key === ${PLANTED_KEY} ? ${CAPTURE} : Reflect.get(target, key, receiver); } }));`, ['host-argument-shape']],
  ['helper parameter', 'agent', `function decorateOptions(t: object, v: unknown) { (t as Record<string, unknown>)[${PLANTED_KEY}] = v; }
    const hostOptions = { backend, canary: input.canary, browser: input.browser }; decorateOptions(hostOptions, ${CAPTURE});
    host = await input.createHost(hostOptions as never);`, ['host-argument-shape']],
  ['index signature', 'runner', `const hostOptions: Record<string, unknown> = ${BASE_OPTIONS};
    hostOptions['authorization'] = { reserve() { return { commit() {}, release() {} }; } };
    host = await input.createHost(hostOptions as never);`, ['host-argument-shape']],
  ['wrapped createHost', 'agent', `const inner = input.createHost; host = await inner(Object.assign(
    { backend, canary: input.canary, browser: input.browser }, { [${PLANTED_KEY}]: ${CAPTURE} }));
    if (!host) { host = await input.createHost({ backend, canary: input.canary, browser: input.browser }); }`, ['host-argument-shape']],
  ['S1', 'host', `${SAVED_HOOK} Reflect.set(options, 'onFillAuthorization', ${FORWARD_HOOK});`, ['options-escape:src/supervisor/host.ts:CallExpression']],
  ['S2', 'host', `${SAVED_HOOK} Object.assign(options, { onFillAuthorization: ${FORWARD_HOOK} });`, ['options-escape:src/supervisor/host.ts:CallExpression']],
  ['S3', 'host', `${SAVED_HOOK} Object.defineProperty(options, 'onFillAuthorization', { value: ${FORWARD_HOOK} });`, ['options-escape:src/supervisor/host.ts:CallExpression']],
  ['S4', 'runner', `const args = ${BASE_OPTIONS}; Reflect.set(args, ${PLANTED_KEY}, (value: unknown) => { (globalThis as any).__rc = value; });
    host = await input.createHost(args);`, ['host-argument-shape']],
  ['S5', 'runner', `const args = ${BASE_OPTIONS}; host = await input.createHost(new Proxy(args, {
    get(target, key, receiver) { return key === ${PLANTED_KEY} ? (value: unknown) => { (globalThis as any).__rc = value; }
      : Reflect.get(target, key, receiver); } }));`, ['host-argument-shape']],
  ['S6', 'host', `${SAVED_HOOK} function install(hook = (value: unknown) => { Object.assign(globalThis, { __rc: value }); }) {
    Object.assign(options, { onFillAuthorization(value: FillAuthorizationLifecycle) { hook(value); saved.onFillAuthorization?.(value); } }); }
    install();`, ['options-escape:src/supervisor/host.ts:CallExpression']],
  ['S7', 'host', `${SAVED_HOOK} function install(hook = saved.onFillAuthorization) { Object.assign(options, {
    onFillAuthorization(value: FillAuthorizationLifecycle) { Object.assign(globalThis, { __rc: value }); hook?.(value); } }); } install();`,
    ['options-escape:src/supervisor/host.ts:CallExpression', 'aliased-authority']],
  ['S8', 'host', `function capture(...args: unknown[]) { (globalThis as any).__rc = arguments[0]; }
    ${SAVED_HOOK} Object.assign(options, { onFillAuthorization(value: { renew(handle: string): void }) { capture(value); saved.onFillAuthorization?.(value); } });`,
    ['options-escape:src/supervisor/host.ts:CallExpression', 'arguments-capture']],
  ['S9', 'fill', `Reflect.set(options, 'authorization', { reserve() { return { commit() {}, release() {} }; } });`, ['options-escape:src/core/fillService.ts:CallExpression']],
  ['S10', 'fill', `const extra = createFillAuthorizationDomain(); Object.assign(globalThis, { __rc: extra.lifecycle });
    options = { ...options, authorization: extra.authorization };`, ['options-escape:src/core/fillService.ts:BinaryExpression', 'global-domain-call-inventory', 'core-supervisor-import']],
];
describe('T-RC-10 Unreachability pin', () => {
  // Each authorityGraph() builds a full TypeScript program over src + testbed; a cold clean clone took > 5 s for the
  // five-variant test below (gate 4 on 12a4a08), so the program-building tests carry an explicit timeout.
  it('a/c/d/e/f confines authority and resolves composition calls through the AST', { timeout: 60_000 }, async () => {
    const graph = await authorityGraph();
    assertAuthorityGraph(graph);
  });
  it('a rejects computed keys, aliases and spreads of computed keys', { timeout: 60_000 }, async () => {
    for (const [access, reason] of [
      ["const key = 'on' + 'FillAuthorization'; options[key]?.(() => {});", "computed-authority"],
      ["const { onFillAuthorization: alias } = options; alias?.(() => {});", "aliased-hook"],
      ["const copied = lifecycle;", "aliased-authority"],
      ["const { renew: copied } = lifecycle;", "aliased-hook"],
      ["const key = 'on' + 'FillAuthorization'; const extra = { [key]: () => {} }; const spread = { ...extra };", "computed-authority"],
    ] as const) {
      const graph = await authorityGraph({ 'src/supervisor/host.ts':
        (await readFile('src/supervisor/host.ts', 'utf8')).replace('  const launchedHere', `${access}\n  const launchedHere`) });
      expect(inspectAuthorityAccess(graph)).toContain(`src/supervisor/host.ts:${reason}`);
    }
  });
  it('g rejects G1 duplicate lifecycle bindings and wrapped authorization', { timeout: 60_000 }, async () => {
    const file = 'src/supervisor/host.ts', source = await readFile(file, 'utf8');
    expect(inspectDomainComposition(await authorityGraph())).toEqual([]);
    const mutated = source.replace('{ authorization, lifecycle } = createFillAuthorizationDomain()',
      '{ authorization, lifecycle, lifecycle: renewal } = createFillAuthorizationDomain()')
      .replace('registry: domain.registry, authorization });',
        'registry: domain.registry, authorization: { reserve(handle) { renewal.renew(handle); return authorization.reserve(handle); } } });');
    expect(mutated).not.toBe(source);
    const violations = inspectDomainComposition(await authorityGraph({ [file]: mutated }));
    expect(violations).toContain('binding-element-count');
    expect(violations).toContain('non-shorthand-binding');
    expect(violations).toContain('authorization-not-forwarded-as-shorthand');
  });
  it('a/f reject G2 quoted hook names syntactically and by type', { timeout: 60_000 }, async () => {
    const clean = await authorityGraph();
    expect(authorityInventory(clean)).toEqual(AUTHORITY_FILES);
    expect(inspectHostConstructions(clean)).toEqual([]);
    const graph = await runnerMutation(`let grantMore: ((handle: string) => void) | undefined;
      host = await input.createHost({ backend, canary: run.canary, browser: input.browser,
        'onFillAuthorization': hook => { grantMore = handle => hook.renew(handle); } });
      for (const item of await backend.listItems()) grantMore?.(item.handle);`);
    expect(authorityInventory(graph)).toContain('testbed/runnerExecution.ts');
    expect(inspectHostConstructions(graph)).toContain('testbed/runnerExecution.ts:syntactic-host-authority');
    expect(inspectHostConstructions(graph)).toContain('testbed/runnerExecution.ts:typed-host-authority');
    expect(inspectHostConstructions(graph)).toContain('testbed/runnerExecution.ts:host-argument-key:onFillAuthorization');
  });
  it.each(["['on','Fill','Authorization'].join('')", "`on${String('Fill')}Authorization`"])(
    'a/f reject G2-prime non-foldable key %s and opaque spread', { timeout: 60_000 }, async key => {
      const clean = await authorityGraph();
      expect(inspectAuthorityAccess(clean)).toEqual([]);
      expect(inspectHostConstructions(clean)).toEqual([]);
      const graph = await runnerMutation(`const hookKey = ${key};
        const extra: Record<string, unknown> = {}; extra[hookKey] = (value: unknown) => { (globalThis as any).__probe = value; };
        host = await input.createHost({ backend, canary: run.canary, browser: input.browser, ...extra } as never);`);
      expect(inspectAuthorityAccess(graph)).toContain('testbed/runnerExecution.ts:unknown-host-key');
      expect(inspectHostConstructions(graph)).toContain('testbed/runnerExecution.ts:opaque-host-spread');
      expect(inspectHostConstructions(graph)).toContain('testbed/runnerExecution.ts:host-argument-key:SpreadAssignment');
      const computed = await runnerMutation(`const hookKey = ${key};
        const extra = { [hookKey]: (value: unknown) => { (globalThis as any).__probe = value; } };
        const alias = extra; let forwarded: Record<string, unknown>; forwarded = alias;
        host = await input.createHost({ backend, canary: run.canary, browser: input.browser, ...forwarded } as never);`);
      expect(inspectAuthorityAccess(computed)).toContain('testbed/runnerExecution.ts:unknown-host-key');
      expect(inspectHostConstructions(computed)).toContain('testbed/runnerExecution.ts:opaque-host-spread');
    });
  it('f rejects G3 authorization under casts and other wrappers', { timeout: 60_000 }, async () => {
    expect(inspectHostConstructions(await authorityGraph())).toEqual([]);
    for (const argument of [
      '({ backend, canary: run.canary, browser: input.browser, authorization: {} } as never)',
      '(<never>({ backend, authorization: {} }))',
      '({ backend, authorization: {} } satisfies Record<string, unknown>)',
      '({ backend, ...({ onFillAuthorization() {} } as never) } as never)',
    ]) {
      const graph = await runnerMutation(`host = await input.createHost(${argument});`);
      expect(inspectHostConstructions(graph)).toContain('testbed/runnerExecution.ts:syntactic-host-authority');
      expect(inspectHostConstructions(graph)).toContain(`testbed/runnerExecution.ts:host-argument-key:${argument.includes('...') ? 'SpreadAssignment' : 'authorization'}`);
      expect(inspectHostConstructions(graph)).toContain(argument.includes('...')
        ? 'testbed/runnerExecution.ts:spread-host-authority' : 'testbed/runnerExecution.ts:typed-host-authority');
    }
  });
  it.each(R3_CASES)('h rejects %s', { timeout: 60_000 }, async (_id, target, code, reasons) => {
    const clean = await authorityGraph();
    assertAuthorityGraph(clean); expect(inspectDomainComposition(clean)).toEqual([]);
    const graph = await ({ runner: runnerMutation, agent: realAgentMutation, host: hostMutation, fill: fillMutation }[target]!(code));
    const file = { runner: 'testbed/runnerExecution.ts', agent: 'testbed/realAgentRun.ts', host: 'src/supervisor/host.ts' }[target];
    for (const reason of reasons) {
      const actual = reason.startsWith('options-escape:') ? inspectOptionsEscapes(graph)
        : reason.startsWith('host-argument-') ? inspectHostConstructions(graph)
        : ['aliased-authority', 'arguments-capture', 'unresolved-receiver'].includes(reason) ? inspectAuthorityAccess(graph) : inspectGlobalComposition(graph);
      expect(actual).toContain(reason.startsWith('host-argument-') || ['aliased-authority', 'arguments-capture', 'unresolved-receiver'].includes(reason) ? `${file}:${reason}` : reason);
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
  it('g references the composer lifecycle exactly once, only as the hook argument', { timeout: 60_000 }, async () => {
    const graph = await authorityGraph();
    expect(inspectDomainComposition(graph)).toEqual([]);
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
async function runnerMutation(replacement: string): Promise<AuthorityGraph> {
  return sourceMutation('testbed/runnerExecution.ts',
    'host = await input.createHost({ backend, canary: run.canary, browser: input.browser });', replacement);
}
async function realAgentMutation(replacement: string): Promise<AuthorityGraph> {
  return sourceMutation('testbed/realAgentRun.ts',
    'host = await input.createHost({ backend, canary: input.canary, browser: input.browser });', replacement);
}
async function hostMutation(insertion: string): Promise<AuthorityGraph> {
  return sourceMutation('src/supervisor/host.ts', '  const browser = options.browser', `${insertion}\n  const browser = options.browser`);
}
async function fillMutation(insertion: string): Promise<AuthorityGraph> {
  return sourceMutation('src/core/fillService.ts', '  const service: FillService', `${insertion}\n  const service: FillService`,
    insertion.includes('createFillAuthorizationDomain') ? "import { createFillAuthorizationDomain } from '../supervisor/fillAuthorizationDomain';\n" : '');
}
async function sourceMutation(file: string, original: string, replacement: string, prefix = ''): Promise<AuthorityGraph> {
  const source = await readFile(file, 'utf8');
  expect(source).toContain(original);
  return authorityGraph({ [file]: prefix + source.replace(original, replacement) });
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
  const composeCalls: string[] = [], composeImports: string[] = [], fillCalls: string[] = [];
  const hostAuthorizations: string[] = [], kitImporters: string[] = [];
  for (const name of graph.files) {
    const file = graph.program.getSourceFile(name)!;
    if (relativeModuleSpecifiers(file).some(specifier => specifier.endsWith('/m7.browser.testkit'))) kitImporters.push(name);
    if (!graph.production.includes(name)) continue;
    walk(file, node => {
      inspectCompositionNode(graph, node, name, { composeCalls, composeImports, fillCalls, hostAuthorizations });
    });
  }
  expect(inspectOptionsEscapes(graph)).toEqual([]);
  expect(inspectGlobalComposition(graph)).toEqual([]);
  expect([...new Set(callSites(graph, ['createSupervisedHost', 'createHost']))].sort()).toEqual(HOST_CALL_FILES);
  expect(authorityInventory(graph)).toEqual(AUTHORITY_FILES);
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
  lists.hostAuthorizations.push(...inspectHostShape(graph, node).map(reason => `${file}:${reason}`));
  for (const arg of node.arguments) {
    lists.hostAuthorizations.push(...inspectHostArgument(graph, arg).map(reason => `${file}:${reason}`));
  }
}
function staticKey(node: ts.Node, checker: ts.TypeChecker, seen = new Set<ts.Symbol>()): string | undefined {
  if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return node.text;
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
  const hostInputs = hostArgumentFlow(graph), hostFiles = new Set(callSites(graph, ['createSupervisedHost', 'createHost']));
  for (const name of graph.production) walk(graph.program.getSourceFile(name)!, node => {
    if (ts.isElementAccessExpression(node) || ts.isComputedPropertyName(node)) {
      const key = staticKey(ts.isElementAccessExpression(node) ? node.argumentExpression : node.expression, graph.checker);
      const sensitiveReceiver = ts.isElementAccessExpression(node)
        && graph.checker.getTypeAtLocation(node.expression).getProperties().some(symbol =>
          symbol.name === 'onFillAuthorization' || symbol.name === 'renew');
      const receiver = ts.isElementAccessExpression(node) ? graph.checker.getSymbolAtLocation(unwrap(node.expression)) : undefined;
      if (key === undefined && ts.isElementAccessExpression(node) && isElementWrite(node)
        && receiver === undefined && hostFiles.has(name)) violations.push(`${name}:unresolved-receiver`);
      if (key === undefined && (hostInputs.has(node) || (ts.isElementAccessExpression(node)
        && isElementWrite(node) && receiver !== undefined && hostInputs.has(receiver)))) {
        violations.push(`${name}:unknown-host-key`);
      }
      if (key === 'onFillAuthorization' || key === 'renew' || sensitiveReceiver) violations.push(`${name}:computed-authority`);
    }
    if (ts.isBindingElement(node) && ['onFillAuthorization', 'renew'].includes((node.propertyName ?? node.name).getText())) violations.push(`${name}:aliased-hook`);
    if (ts.isIdentifier(node) && node.text === 'arguments'
      && ['src/supervisor/host.ts', 'src/core/fillService.ts'].includes(name)) violations.push(`${name}:arguments-capture`);
    const value = ts.isVariableDeclaration(node) || ts.isParameter(node) ? node.initializer
      : ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken ? node.right : undefined;
    if (value && (ts.isIdentifier(unwrap(value)) || ts.isPropertyAccessExpression(unwrap(value)))) {
      const source = unwrap(value), type = graph.checker.getTypeAtLocation(source);
      const member = ts.isPropertyAccessExpression(source) ? source.name.text : source.getText();
      if (member === 'onFillAuthorization' || member === 'renew' || type.getProperty('renew')) {
        violations.push(`${name}:aliased-authority`);
      }
    }
  });
  return violations;
}
function propertyText(name: ts.PropertyName, checker: ts.TypeChecker): string | undefined {
  return ts.isIdentifier(name) || ts.isPrivateIdentifier(name) ? name.text : staticKey(name, checker);
}
function authorityInventory(graph: AuthorityGraph): string[] {
  return graph.production.filter(name => {
    let found = false;
    walk(graph.program.getSourceFile(name)!, node => {
      const text = ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isPrivateIdentifier(node)
        ? node.text : ts.isComputedPropertyName(node) ? staticKey(node, graph.checker) : undefined;
      if (text !== undefined && AUTHORITY_NAMES.includes(text)) found = true;
    });
    return found;
  });
}
const HOST_AUTHORITY_KEYS = ['authorization', 'onFillAuthorization'];
function carriesHostAuthority(type: ts.Type): boolean {
  return HOST_AUTHORITY_KEYS.some(key => type.getProperty(key) !== undefined);
}
function opaqueSpread(type: ts.Type, checker: ts.TypeChecker): boolean {
  if (type.isUnionOrIntersection()) return type.types.some(part => opaqueSpread(part, checker));
  return (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never)) !== 0
    || (type.getProperties().length === 0 && checker.getIndexInfosOfType(type).length > 0);
}
const HOST_CALL_FILES = ['testbed/docker/integrationProbes.ts', 'testbed/harnessGate.ts',
  'testbed/realAgentRun.ts', 'testbed/runnerExecution.ts'];
function callSites(graph: AuthorityGraph, names: string[]): string[] {
  const sites: string[] = [];
  for (const file of graph.production) walk(graph.program.getSourceFile(file)!, node => {
    if (ts.isCallExpression(node) && names.includes(resolvedName(graph.checker, node.expression) ?? '')) sites.push(file);
  });
  return sites;
}
function inspectHostShape(graph: AuthorityGraph, call: ts.CallExpression): string[] {
  const arg = call.arguments[0] && unwrap(call.arguments[0]);
  if (call.arguments.length !== 1 || !arg || !ts.isObjectLiteralExpression(arg)) return ['host-argument-shape'];
  return arg.properties.flatMap(property => {
    const key = property.name && propertyText(property.name, graph.checker);
    return (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))
      && key !== undefined && ['backend', 'canary', 'browser', 'launcher'].includes(key)
      ? [] : [`host-argument-key:${key ?? ts.SyntaxKind[property.kind]}`];
  });
}
function inspectGlobalComposition(graph: AuthorityGraph): string[] {
  const violations = callSites(graph, ['createFillAuthorizationDomain']).join(',') === 'src/supervisor/host.ts'
    ? [] : ['global-domain-call-inventory'];
  const file = graph.program.getSourceFile('src/core/fillService.ts')!;
  walk(file, node => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteralLike(node.moduleSpecifier)) return;
    const resolved = ts.resolveModuleName(node.moduleSpecifier.text, file.fileName, graph.program.getCompilerOptions(), ts.sys).resolvedModule;
    if (resolved && path.resolve(resolved.resolvedFileName).startsWith(path.resolve('src/supervisor') + path.sep)) {
      violations.push('core-supervisor-import');
    }
  });
  return violations;
}
function optionsReferenceKind(graph: AuthorityGraph, reference: ts.Identifier, file: ts.SourceFile): string | undefined {
  let context: ts.Node = reference;
  while (context !== file) {
    if (ts.isParameter(context) && context.initializer) return 'ParameterInitializer';
    context = context.parent;
  }
  const parent = reference.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.expression === reference && !isElementWrite(parent)) return;
  if (file.fileName.endsWith('src/core/fillService.ts') && ts.isCallExpression(parent)
    && parent.arguments.some(arg => arg === reference)) {
    const declaration = graph.checker.getResolvedSignature(parent)?.getDeclaration();
    if (declaration && (ts.isFunctionDeclaration(declaration) || ts.isFunctionExpression(declaration) || ts.isArrowFunction(declaration))
      && declaration.getSourceFile() === file) return;
  }
  return ts.SyntaxKind[parent.kind];
}
function inspectOptionsEscapes(graph: AuthorityGraph): string[] {
  const violations: string[] = [];
  for (const [name, factory] of [['src/supervisor/host.ts', 'createSupervisedHost'], ['src/core/fillService.ts', 'createFillService']]) {
    const file = graph.program.getSourceFile(name!)!;
    const fn = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === factory) as ts.FunctionDeclaration;
    const parameter = fn.parameters[0]!.name;
    expect(ts.isIdentifier(parameter)).toBe(true);
    for (const reference of bindingReferences(graph, file, parameter as ts.Identifier)) {
      const kind = optionsReferenceKind(graph, reference, file);
      if (kind) violations.push(`options-escape:${name}:${kind}`);
    }
  }
  return violations;
}
function inspectHostArgument(graph: AuthorityGraph, argument: ts.Expression): string[] {
  const violations: string[] = [], arg = unwrap(argument), checker = graph.checker;
  if (carriesHostAuthority(checker.getTypeAtLocation(argument))
    || carriesHostAuthority(checker.getTypeAtLocation(arg))) violations.push('typed-host-authority');
  walk(arg, node => {
    if ((ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node) || ts.isMethodDeclaration(node))
      && HOST_AUTHORITY_KEYS.includes(propertyText(node.name, checker) ?? '')) violations.push('syntactic-host-authority');
    if (!ts.isSpreadAssignment(node)) return;
    const types = [checker.getTypeAtLocation(node.expression), checker.getTypeAtLocation(unwrap(node.expression))];
    if (types.some(carriesHostAuthority)) violations.push('spread-host-authority');
    if (types.some(type => opaqueSpread(type, checker))) violations.push('opaque-host-spread');
  });
  return violations;
}
function inspectHostConstructions(graph: AuthorityGraph): string[] {
  const lists = { composeCalls: [], composeImports: [], fillCalls: [], hostAuthorizations: [] };
  for (const name of graph.production) walk(graph.program.getSourceFile(name)!, node => {
    inspectCompositionNode(graph, node, name, lists);
  });
  return lists.hostAuthorizations;
}
function isElementWrite(node: ts.ElementAccessExpression | ts.PropertyAccessExpression): boolean {
  let target: ts.Node = node;
  while (ts.isParenthesizedExpression(target.parent) || ts.isAsExpression(target.parent)
    || ts.isTypeAssertionExpression(target.parent) || ts.isSatisfiesExpression(target.parent)
    || ts.isNonNullExpression(target.parent) || ts.isArrayLiteralExpression(target.parent)
    || ts.isObjectLiteralExpression(target.parent) || ts.isSpreadAssignment(target.parent) || ts.isSpreadElement(target.parent)
    || (ts.isPropertyAssignment(target.parent) && target.parent.initializer === target)
    || ((ts.isPropertyAccessExpression(target.parent) || ts.isElementAccessExpression(target.parent))
      && target.parent.expression === target)) target = target.parent;
  const parent = target.parent;
  return (ts.isBinaryExpression(parent) && parent.left === target
    && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment)
    || ((ts.isForInStatement(parent) || ts.isForOfStatement(parent)) && parent.initializer === target)
    || ts.isDeleteExpression(parent) || ts.isPostfixUnaryExpression(parent)
    || (ts.isPrefixUnaryExpression(parent) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(parent.operator));
}
// Follow arguments back through local aliases, initializers and assignments, including spread sources.
function hostArgumentFlow(graph: AuthorityGraph): Set<ts.Node | ts.Symbol> {
  const reached = new Set<ts.Node | ts.Symbol>(), assignments = new Map<ts.Symbol, ts.Expression[]>();
  const roots: ts.Expression[] = [], checker = graph.checker;
  for (const name of graph.production) walk(graph.program.getSourceFile(name)!, node => {
    if (ts.isCallExpression(node) && ['createSupervisedHost', 'createHost'].includes(resolvedName(checker, node.expression) ?? '')) {
      roots.push(...node.arguments);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const symbol = checker.getSymbolAtLocation(unwrap(node.left));
      if (symbol) assignments.set(symbol, [...assignments.get(symbol) ?? [], node.right]);
    }
  });
  const visit = (expression: ts.Expression): void => {
    walk(unwrap(expression), node => {
      if (reached.has(node)) return;
      reached.add(node);
      if (!ts.isIdentifier(node)) return;
      const symbol = ts.isShorthandPropertyAssignment(node.parent)
        ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node);
      if (!symbol || reached.has(symbol)) return;
      reached.add(symbol);
      for (const declaration of symbol.declarations ?? []) {
        if (ts.isVariableDeclaration(declaration) && declaration.initializer) visit(declaration.initializer);
      }
      for (const value of assignments.get(symbol) ?? []) visit(value);
    });
  };
  roots.forEach(visit);
  return reached;
}
function bindingReferences(graph: AuthorityGraph, file: ts.SourceFile, name: ts.Identifier): ts.Identifier[] {
  const symbol = graph.checker.getSymbolAtLocation(name), references: ts.Identifier[] = [];
  expect(symbol).toBeDefined();
  walk(file, node => {
    if (!ts.isIdentifier(node) || node === name) return;
    const resolved = ts.isShorthandPropertyAssignment(node.parent)
      ? graph.checker.getShorthandAssignmentValueSymbol(node.parent) : graph.checker.getSymbolAtLocation(node);
    if (resolved === symbol) references.push(node);
  });
  return references;
}
function forwardedAuthorization(graph: AuthorityGraph, references: ts.Identifier[]): boolean {
  if (references.length !== 1) return false;
  const property = references[0]!.parent, object = property.parent, call = object.parent;
  return ts.isShorthandPropertyAssignment(property) && property.name.text === 'authorization'
    && ts.isObjectLiteralExpression(object) && ts.isCallExpression(call) && call.arguments[0] === object
    && resolvedName(graph.checker, call.expression) === 'createFillService';
}
function inspectDomainComposition(graph: AuthorityGraph): string[] {
  const file = graph.program.getSourceFile('src/supervisor/host.ts')!, calls: ts.CallExpression[] = [];
  walk(file, node => {
    if (ts.isCallExpression(node) && resolvedName(graph.checker, node.expression) === 'createFillAuthorizationDomain') calls.push(node);
  });
  if (calls.length !== 1) return ['domain-call-count'];
  const declaration = calls[0]!.parent;
  if (!ts.isVariableDeclaration(declaration) || declaration.initializer !== calls[0]
    || !ts.isObjectBindingPattern(declaration.name)) return ['domain-only-consumer'];
  const elements = declaration.name.elements, violations: string[] = [];
  if (elements.length !== 2) violations.push('binding-element-count');
  if (elements.some(element => element.propertyName || element.dotDotDotToken || element.initializer
    || !ts.isIdentifier(element.name))) violations.push('non-shorthand-binding');
  if (elements.map(element => element.name.getText()).sort().join(',') !== 'authorization,lifecycle') violations.push('binding-names');
  for (const key of ['lifecycle', 'authorization']) {
    const element = elements.find(element => element.name.getText() === key);
    if (!element || !ts.isIdentifier(element.name)) { violations.push(`missing-${key}`); continue; }
    const references = bindingReferences(graph, file, element.name);
    if (key === 'authorization') {
      if (!forwardedAuthorization(graph, references)) violations.push('authorization-not-forwarded-as-shorthand');
    } else {
      const call = references[0]?.parent;
      if (references.length !== 1 || !call || !ts.isCallExpression(call) || call.arguments.length !== 1
        || call.arguments[0] !== references[0] || call.expression.getText() !== 'options.onFillAuthorization') {
        violations.push('lifecycle-not-sole-hook-argument');
      }
    }
  }
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
