import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Bounded source-shape proof, not whole-program escape analysis or OS containment.
const RUNTIME = ['src/backends/onepassword.ts', 'src/backends/onepasswordConfig.ts',
  'src/backends/onepasswordMetadata.ts', 'src/backends/onepasswordProcess.ts'] as const;
const HELPER = 'src/backends/onepassword.testSupport.ts';
const MAIN = 'src/adapters/mcp/main.ts';
const MCP_TEST = 'src/adapters/mcp/server.onepassword.stdio.test.ts';
type Sources = Map<string, ts.SourceFile>;
const options: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler, allowJs: true, noEmit: true };
function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node); node.forEachChild(child => walk(child, visit));
}
function nodes<T extends ts.Node>(root: ts.Node, guard: (node: ts.Node) => node is T): T[] {
  const result: T[] = []; walk(root, node => { if (guard(node)) result.push(node); }); return result;
}
async function sourceFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = `${root}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await sourceFiles(file));
    else if (/\.[cm]?[jt]sx?$/u.test(file)) result.push(file);
  }
  return result.sort();
}
async function sources(): Promise<Sources> {
  const files = (await sourceFiles('src')).filter(file => !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file));
  return new Map(await Promise.all(files.map(async file => [file,
    ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true)] as const)));
}
function moduleLoads(file: ts.SourceFile): { node: ts.Node; specifier: string | undefined }[] {
  const result: { node: ts.Node; specifier: string | undefined }[] = [];
  walk(file, node => {
    let argument: ts.Node | undefined;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) argument = node.moduleSpecifier;
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      argument = node.moduleReference.expression;
    } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || (ts.isIdentifier(node.expression) && node.expression.text === 'require')
      || (ts.isPropertyAccessExpression(node.expression) && ['require', 'getBuiltinModule'].includes(node.expression.name.text)))) {
      argument = node.arguments[0];
      if (!argument) { result.push({ node, specifier: undefined }); return; }
    }
    if (argument) result.push({ node, specifier: ts.isStringLiteralLike(argument) ? argument.text : undefined });
  });
  return result;
}
function localTarget(from: string, specifier: string, files: Sources): string | undefined {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  const stem = base.replace(/\.[cm]?[jt]sx?$/u, '');
  const choices = [base, ...['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']
    .flatMap(extension => [stem + extension, `${base}/index${extension}`])];
  const internal = choices.find(file => files.has(file));
  if (internal) return internal;
  const resolved = ts.resolveModuleName(specifier, path.resolve(from), options, ts.sys).resolvedModule;
  return resolved ? path.relative(process.cwd(), resolved.resolvedFileName).split(path.sep).join('/') : undefined;
}
function helperReachViolations(files: Sources): string[] {
  const violations: string[] = [], edges = new Map<string, string[]>();
  for (const [file, source] of files) {
    const targets: string[] = [];
    for (const load of moduleLoads(source)) {
      if (!load.specifier) {
        if ([...RUNTIME, HELPER].includes(file)) violations.push(`${file}:nonliteral-module-load`);
        continue;
      }
      if (!load.specifier.startsWith('.')) continue;
      const target = localTarget(file, load.specifier, files);
      if (!target) violations.push(`${file}:unresolved-local-edge:${load.specifier}`);
      else targets.push(target);
    }
    edges.set(file, targets);
  }
  for (const file of files.keys()) {
    if (file === HELPER) continue;
    const pending = [...edges.get(file) ?? []], visited = new Set<string>();
    while (pending.length) {
      const target = pending.pop()!;
      if (target === HELPER) { violations.push(`${file}:helper-production-reach`); break; }
      if (visited.has(target)) continue;
      visited.add(target); pending.push(...edges.get(target) ?? []);
    }
  }
  return violations.sort();
}
function directCalls(file: ts.SourceFile, name: string): ts.CallExpression[] {
  return nodes(file, ts.isCallExpression).filter(node => ts.isIdentifier(node.expression) && node.expression.text === name);
}
function enclosingFunction(node: ts.Node): ts.Node | undefined {
  let parent: ts.Node | undefined = node.parent;
  while (parent && !ts.isFunctionLike(parent)) parent = parent.parent;
  return parent;
}
function property(object: ts.Node | undefined, name: string): ts.Expression | undefined {
  if (!object || !ts.isObjectLiteralExpression(object)) return undefined;
  const member = object.properties.find(node => ts.isPropertyAssignment(node) && node.name.getText() === name);
  return member && ts.isPropertyAssignment(member) ? member.initializer : undefined;
}

describe('M9 structural production gate', () => {
  it('helper-production-reach', async () => {
    expect(helperReachViolations(await sources()), 'helper-production-reach').toEqual([]);
  });
  it('pins the sole production child-process import, direct spawn and references', async () => {
    const files = await sources(), imports: string[] = [], spawns: string[] = [];
    for (const [file, source] of files) {
      for (const load of moduleLoads(source)) if (load.specifier?.replace(/^node:/u, '') === 'child_process') {
        imports.push(`${file}:${load.node.getText()}`);
      }
      for (const call of nodes(source, ts.isCallExpression)) {
        if (/^(?:spawn|spawnSync|exec|execSync|execFile|execFileSync)$/u.test(call.expression.getText())
          || (ts.isPropertyAccessExpression(call.expression) && call.expression.name.text !== 'exec'
            && /^(?:spawn|spawnSync|execSync|execFile|execFileSync)$/u.test(call.expression.name.text))) {
          spawns.push(`${file}:${call.expression.getText()}`);
        }
      }
    }
    expect(imports, 'production-subprocess-import').toEqual([
      "src/backends/onepasswordProcess.ts:import { spawn } from 'node:child_process';",
    ]);
    expect(spawns, 'production-subprocess-sites').toEqual(['src/backends/onepasswordProcess.ts:spawn']);
    const runner = files.get(RUNTIME[3])!;
    const references = nodes(runner, ts.isIdentifier).filter(node => node.text === 'spawn');
    expect(references, 'spawn-reference-count').toHaveLength(2);
    expect(references.filter(node => ts.isImportSpecifier(node.parent))).toHaveLength(1);
    expect(references.filter(node => ts.isCallExpression(node.parent) && node.parent.expression === node)).toHaveLength(1);
  });
  it('mcp-test-env-value', async () => {
    const file = ts.createSourceFile(MCP_TEST, await readFile(MCP_TEST, 'utf8'), ts.ScriptTarget.Latest, true);
    const calls = directCalls(file, 'spawn');
    expect(calls).toHaveLength(1);
    expect(property(calls[0]!.arguments[2], 'env')?.getText(), 'mcp-test-env-value').toBe('env');
  });
  it('mcp-test-stdio-value', async () => {
    const file = ts.createSourceFile(MCP_TEST, await readFile(MCP_TEST, 'utf8'), ts.ScriptTarget.Latest, true);
    const calls = directCalls(file, 'spawn');
    expect(calls).toHaveLength(1);
    const value = property(calls[0]!.arguments[2], 'stdio');
    expect(value && ts.isStringLiteral(value) ? value.text : undefined, 'mcp-test-stdio-value').toBe('pipe');
  });
  it('pins backend selection and construction once in MCP start', async () => {
    const files = await sources(), file = files.get(MAIN)!;
    const starts = file.statements.filter(ts.isFunctionDeclaration).filter(node => node.name?.text === 'start');
    expect(starts).toHaveLength(1);
    for (const factory of ['createLocalFileBackend', 'createOnePasswordBackend', 'createSupervisedHost', 'createServer']) {
      const calls = directCalls(file, factory);
      expect(calls, factory).toHaveLength(1);
      expect(enclosingFunction(calls[0]!), factory).toBe(starts[0]);
    }
    const branch = nodes(starts[0]!, ts.isIfStatement).filter(node => node.expression.getText() === "selected === 'local-file'");
    expect(branch).toHaveLength(1);
    expect(branch[0]!.getText()).toBe(`if (selected === 'local-file') {
      if (!vaultPath || !keyPath || configPath !== undefined) throw new Error('tinyvault-mcp: internal error');
      backend = createLocalFileBackend({ vaultPath, keyPath });
    } else if (selected === 'onepassword') {
      if (!configPath || !isAbsolute(configPath) || vaultPath !== undefined || keyPath !== undefined ||
        runtime.env.OP_SERVICE_ACCOUNT_TOKEN !== undefined) throw new Error('tinyvault-mcp: internal error');
      backend = createOnePasswordBackend(JSON.parse(readFileSync(configPath, 'utf8')));
    } else throw new Error('tinyvault-mcp: internal error');`);
    expect(directCalls(file, 'createSupervisedHost')[0]!.getText())
      .toBe('createSupervisedHost({ backend, canary, handleSignals: false })');
    expect(directCalls(file, 'createServer')[0]!.arguments[0]!.getText()).toBe('host');
    const backendSites: string[] = [];
    for (const [name, source] of files) for (const node of nodes(source, ts.isIdentifier)) {
      if (node.text === 'createOnePasswordBackend') backendSites.push(`${name}:${ts.SyntaxKind[node.parent.kind]}`);
    }
    expect(backendSites).toEqual([`${MAIN}:ImportSpecifier`, `${MAIN}:CallExpression`, `${RUNTIME[0]}:FunctionDeclaration`]);
  });
});

function inside(node: ts.Node, ancestor: ts.Node): boolean {
  let current: ts.Node | undefined = node;
  while (current) { if (current === ancestor) return true; current = current.parent; }
  return false;
}
// Preserve literal values and expression structure. Omit function bodies here because captures,
// assignments, constructor arguments and cache writes are separately enumerated below.
function expressionShape(node: ts.Node | undefined): string {
  if (!node) return '-';
  const transformer: ts.TransformerFactory<ts.Node> = context => root => {
    const visit: ts.Visitor = value => {
      if (ts.isArrowFunction(value)) return ts.factory.updateArrowFunction(value, value.modifiers,
        value.typeParameters, value.parameters, value.type, value.equalsGreaterThanToken, ts.factory.createBlock([]));
      if (ts.isFunctionExpression(value)) return ts.factory.updateFunctionExpression(value, value.modifiers,
        value.asteriskToken, value.name, value.typeParameters, value.parameters, value.type, ts.factory.createBlock([]));
      if (ts.isMethodDeclaration(value)) return ts.factory.updateMethodDeclaration(value, value.modifiers,
        value.asteriskToken, value.name, value.questionToken, value.typeParameters, value.parameters, value.type,
        ts.factory.createBlock([]));
      return ts.visitEachChild(value, visit, context);
    };
    return ts.visitNode(root, visit) as ts.Node;
  };
  const result = ts.transform(node, [transformer]);
  try { return ts.createPrinter({ removeComments: true }).printNode(ts.EmitHint.Unspecified,
    result.transformed[0]!, node.getSourceFile()).replace(/\s+/gu, ' ').trim(); }
  finally { result.dispose(); }
}
function retentionShape(file: ts.SourceFile, checker: ts.TypeChecker): string[] {
  const result: string[] = [];
  const functions = nodes(file, (node): node is ts.FunctionLikeDeclaration =>
    ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node));
  function scope(node: ts.Node): string {
    const owner = functions.filter(fn => fn !== node && inside(node, fn)).at(-1);
    return owner ? `f${functions.indexOf(owner)}` : 'module';
  }
  function covered(node: ts.Node): boolean {
    let parent: ts.Node | undefined = node.parent;
    while (parent && !ts.isFunctionLike(parent)) {
      if (ts.isVariableDeclaration(parent) || ts.isBinaryExpression(parent)
        && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment
        || ts.isNewExpression(parent) || ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression)
        && ['set', 'add', 'push', 'unshift', 'splice', 'assign', 'defineProperty', 'defineProperties', 'setPrototypeOf', 'freeze'].includes(parent.expression.name.text)) return true;
      parent = parent.parent;
    }
    return false;
  }
  walk(file, node => {
    if (ts.isVariableDeclaration(node)) {
      result.push(`var:${scope(node)}:${node.name.getText()}:${node.type?.getText() ?? '-'}=${expressionShape(node.initializer)}`);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) result.push(`assign:${scope(node)}:${expressionShape(node)}`);
    if (ts.isPrefixUnaryExpression(node) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)
      || ts.isPostfixUnaryExpression(node) || ts.isDeleteExpression(node)) result.push(`write:${scope(node)}:${expressionShape(node)}`);
    if (ts.isNewExpression(node) && !covered(node)) result.push(`new:${scope(node)}:${expressionShape(node)}`);
    if (ts.isCallExpression(node) && !covered(node) && ts.isPropertyAccessExpression(node.expression)
      && ['set', 'add', 'push', 'unshift', 'splice', 'assign', 'defineProperty', 'defineProperties', 'setPrototypeOf', 'freeze']
        .includes(node.expression.name.text)) result.push(`store:${scope(node)}:${expressionShape(node)}`);
  });
  functions.forEach((fn, index) => {
    if (ts.isFunctionDeclaration(fn) && ts.isSourceFile(fn.parent)) return; // Module bindings/imports are pinned above.
    const captures = new Set<string>();
    walk(fn, node => {
      if (!ts.isIdentifier(node)) return;
      const symbol = checker.getSymbolAtLocation(node);
      if (!symbol || !(symbol.flags & (ts.SymbolFlags.Value | ts.SymbolFlags.Alias))) return;
      const declarations = symbol.declarations ?? [];
      if (declarations.some(declaration => declaration.getSourceFile() === file && !inside(declaration, fn))) {
        captures.add(symbol.name);
      }
    });
    result.push(`capture:f${index}:${fn.name?.getText() ?? '-'}(${fn.parameters.map(p => p.getText()).join(',')}):${[...captures].sort().join(',')}`);
  });
  return result;
}

// Explicit reviewed retention inventory; every row names a binding, write, capture or stored expression.
const RETENTION_SHAPES: Record<string, readonly string[]> = {
  "src/backends/onepassword.ts": [
    "new:f0:new BackendError('unavailable')",
    "var:f0:config:-=validateOnePasswordConfig(options)",
    "var:f0:runner:-=createOnePasswordProcess(config)",
    "var:f0:entries:-=new Map<Handle, Entry>()",
    "var:f0:item:-=-",
    "var:f0:handle:Handle=-",
    "assign:f0:handle = `vh_${randomBytes(24).toString('base64url')}`",
    "store:f0:entries.set(handle, Object.freeze({ ...item, handle }))",
    "var:f0:fingerprint:string | undefined=-",
    "var:f0:authChanged:-=false",
    "var:f0:versionChecked:-=false",
    "var:f0:versionPending:Promise<void> | undefined=-",
    "var:f0:discoveryPending:Promise<void> | undefined=-",
    "var:f0:snapshot:Snapshot | undefined=-",
    "var:f0:closed:-=false",
    "assign:f1:versionPending = (async () => { })()",
    "var:f2:bytes:Buffer | undefined=-",
    "assign:f2:bytes = await runner.run(operation, 'version')",
    "assign:f2:versionChecked = true",
    "assign:f1:versionPending = undefined",
    "new:f3:new BackendError('locked')",
    "var:f3:authentication:Awaited<ReturnType<typeof readServiceToken>> | undefined=-",
    "var:f3:bytes:Buffer | undefined=-",
    "assign:f3:authentication = await readServiceToken(config.tokenPath)",
    "new:f3:new BackendError('locked')",
    "assign:f3:fingerprint = authentication.fingerprint",
    "assign:f3:authChanged = true",
    "new:f3:new BackendError('locked')",
    "assign:f3:bytes = await runner.run(operation, command, authentication.token, itemId)",
    "assign:f3:bytes = undefined",
    "assign:f3:authentication = undefined",
    "assign:f4:discoveryPending = authenticated(operation, 'list', (bytes) => { })",
    "var:f5:origins:-=parseList(bytes, config.vaultId, config.items.map((item) => { }))",
    "var:f5:policies:-=new Map<Handle, CredentialPolicy>()",
    "var:f5:items:ItemMeta[]=[]",
    "var:f5:entry:-=-",
    "var:f5:canonicalOrigin:-=origins.get(entry.itemId)",
    "var:f5:fieldRecipe:CredentialPolicy['fieldRecipe']=['password']",
    "store:f5:Object.freeze(fieldRecipe)",
    "store:f5:policies.set(entry.handle, Object.freeze({ canonicalOrigin, fieldRecipe }))",
    "store:f5:items.push(Object.freeze({ handle: entry.handle, label: entry.label, kind: 'password', available: true }))",
    "assign:f5:snapshot = Object.freeze({ items: Object.freeze(items), policies })",
    "assign:f4:discoveryPending = undefined",
    "var:f7:entry:-=entries.get(handle)",
    "new:f7:new BackendError('not-found')",
    "var:f8:policy:-=snapshot?.policies.get(handle)",
    "new:f8:new BackendError('not-found')",
    "store:f10:Object.freeze({ available: false, reason: 'not_installed' })",
    "store:f10:Object.freeze({ available: true })",
    "var:f9:error:-=-",
    "store:f9:Object.freeze({ available: false, reason: error instanceof BackendError && error.kind === 'locked' ? 'not_authenticated' : 'error' })",
    "var:f16:entry:-=entryFor(handle)",
    "var:f16:policy:-=policyFor(handle)",
    "new:f16:new BackendError('integrity')",
    "var:f17:value:string | undefined=-",
    "assign:f17:value = parseDetail(bytes, config.vaultId, entry.itemId, policy)",
    "new:f17:new Secret(value)",
    "assign:f17:value = undefined",
    "assign:f18:closed = true",
    "assign:f18:snapshot = undefined",
    "assign:f18:fingerprint = undefined",
    "assign:f18:discoveryPending = undefined",
    "assign:f18:versionPending = undefined",
    "store:f0:Object.freeze({ probeAvailability, listItems, resolvePolicy, resolveSecret, dispose })",
    "capture:f1:version(operation: Operation):Operation,parseVersion,runner,versionChecked,versionPending",
    "capture:f2:-():operation,parseVersion,runner,versionChecked",
    "capture:f3:authenticated(operation: Operation,command: Command,use: (bytes: Buffer) => T,itemId?: string):BackendError,Command,Operation,authChanged,config,fingerprint,readServiceToken,runner,version",
    "capture:f4:discover(operation: Operation):CredentialPolicy,Handle,ItemMeta,Operation,authenticated,config,discoveryPending,entries,handle,itemId,label,parseList,snapshot",
    "capture:f5:-(bytes):CredentialPolicy,Handle,ItemMeta,config,entries,handle,itemId,label,operation,parseList,snapshot",
    "capture:f6:-(item):",
    "capture:f7:entryFor(handle: Handle):BackendError,Handle,entries",
    "capture:f8:policyFor(handle: Handle):BackendError,CredentialPolicy,Handle,policies,snapshot",
    "capture:f9:probeAvailability():BackendError,BackendStatus,authenticated,parseProbe,runner",
    "capture:f10:-(operation):authenticated,parseProbe,runner",
    "capture:f11:listItems():ItemMeta,discover,items,runner,snapshot",
    "capture:f12:-(operation):discover,items,snapshot",
    "capture:f13:resolvePolicy(handle: Handle):CredentialPolicy,Handle,discover,entryFor,policyFor,runner",
    "capture:f14:-(operation):discover,entryFor,handle,policyFor",
    "capture:f15:resolveSecret(handle: Handle,authorizedPolicy: CredentialPolicy):BackendError,CredentialPolicy,Handle,Secret,authenticated,config,entryFor,itemId,parseDetail,policyFor,runner,samePolicy",
    "capture:f16:-(operation):BackendError,Secret,authenticated,authorizedPolicy,config,entryFor,handle,itemId,parseDetail,policyFor,samePolicy",
    "capture:f17:-(bytes):Secret,config,entry,itemId,operation,parseDetail,policy",
    "capture:f18:dispose():closed,discoveryPending,entries,fingerprint,runner,snapshot,versionPending",
  ],
  "src/backends/onepasswordConfig.ts": [
    "new:f3:new Error()",
    "var:f3:{ opPath, tokenPath, vaultId, items }:-=value",
    "new:f3:new Error()",
    "var:f3:seen:-=new Set<string>()",
    "var:f3:entries:-=items.map((item: unknown) => { })",
    "new:f4:new Error()",
    "store:f4:seen.add(item.itemId)",
    "store:f4:Object.freeze({ itemId: item.itemId, label: item.label })",
    "store:f3:Object.freeze({ opPath, tokenPath, vaultId, items: Object.freeze(entries) })",
    "new:f3:new BackendError('unavailable')",
    "var:f5:bytes:Buffer | undefined=-",
    "var:f5:descriptor:Awaited<ReturnType<typeof open>> | undefined=-",
    "assign:f5:descriptor = await open(tokenPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)",
    "var:f5:error:-=-",
    "new:f5:new BackendError('locked')",
    "new:f5:new BackendError('unavailable')",
    "var:f5:info:-=await descriptor.stat()",
    "new:f5:new BackendError('unavailable')",
    "assign:f5:bytes = Buffer.alloc(16385)",
    "var:f5:used:-=0",
    "var:f5:{ bytesRead }:-=await descriptor.read(bytes, used, bytes.length - used, null)",
    "assign:f5:used += bytesRead",
    "new:f5:new BackendError('locked')",
    "new:f5:new BackendError('unavailable')",
    "new:f5:new BackendError('unavailable')",
    "var:f5:token:-=new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, used))",
    "assign:f5:token = token.slice(0, -1)",
    "new:f5:new BackendError('locked')",
    "new:f5:new BackendError('unavailable')",
    "var:f5:error:-=-",
    "new:f5:new BackendError('unavailable')",
    "new:f5:new BackendError('unavailable')",
    "capture:f2:-(key):value",
    "capture:f4:-(item: unknown):exactKeys,isRecordId,seen",
  ],
  "src/backends/onepasswordMetadata.ts": [
    "var:module:bad:-=(): never => { }",
    "new:f0:new BackendError('integrity')",
    "var:module:overflow:-=(): never => { }",
    "new:f1:new BackendError('unavailable')",
    "var:f2:source:string=-",
    "assign:f2:source = new TextDecoder('utf-8', { fatal: true }).decode(bytes)",
    "var:f2:at:-=0",
    "var:f2:nodes:-=0",
    "write:f3:at++",
    "var:f4:start:-=at++",
    "write:f4:at++",
    "var:f4:code:-=source.charCodeAt(at++)",
    "write:f4:at++",
    "var:f4:escape:-=source[at++]",
    "write:f4:at++",
    "assign:f4:at += 4",
    "write:f5:++nodes",
    "var:f5:head:-=source[at]",
    "var:f5:object:-=head === '{'",
    "var:f5:end:-=object ? '}' : ']'",
    "var:f5:keys:-=new Set<string>()",
    "write:f5:at++",
    "write:f5:at++",
    "var:f5:key:-=string()",
    "store:f5:keys.add(key)",
    "write:f5:at++",
    "write:f5:at++",
    "write:f5:at++",
    "var:f5:literal:-=-",
    "assign:f5:at += literal.length",
    "var:f5:number:-=/^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u.exec(source.slice(at))",
    "assign:f5:at += number[0].length",
    "var:f9:key:-=-",
    "var:f12:url:-=object(entry, ['href'], ['label', 'primary'])",
    "var:f13:ids:-=new Set<string>()",
    "var:f13:purposes:-=new Set<string>()",
    "var:f14:field:-=object(entry, ['id', 'type'], ['purpose', 'label', 'value', 'reference', 'entropy', 'password_details'])",
    "store:f14:ids.add(field.id as string)",
    "store:f14:purposes.add(field.purpose as string)",
    "var:f14:details:-=object(field.password_details, ['entropy', 'generated', 'strength'])",
    "var:f15:optional:-=['title', 'version', 'last_edited_by', 'created_at', 'updated_at', 'additional_information', 'urls']",
    "var:f15:result:-=object(value, ['id', 'vault', 'category'], detail ? [...optional, 'state', 'fields'] : optional)",
    "var:f15:vault:-=object(result.vault, ['id'], ['name'])",
    "var:f16:vault:-=value.vault as ObjectValue",
    "var:f17:origin:string | undefined=-",
    "var:f17:entry:-=-",
    "var:f17:href:-=(entry as ObjectValue).href",
    "var:f17:authorityEnd:-=href.slice(href.indexOf('://') + 3).search(/[/?#]/u)",
    "var:f17:raw:-=authorityEnd < 0 ? href : href.slice(0, href.indexOf('://') + 3 + authorityEnd)",
    "var:f17:current:-=validateBareOrigin(raw)",
    "new:f17:new URL(href)",
    "assign:f17:origin = current",
    "var:f18:parsed:-=parseProviderJson(bytes, 1048576)",
    "var:f18:rows:-=parsed.map((entry) => { })",
    "var:f18:seen:-=new Set<string>()",
    "var:f18:eligible:-=new Map<string, string>()",
    "var:f18:entry:-=-",
    "var:f18:id:-=entry.id as string",
    "store:f18:seen.add(id)",
    "var:f18:origin:-=websiteOrigin(entry.urls)",
    "store:f18:eligible.set(id, origin)",
    "var:f20:detail:-=row(parseProviderJson(bytes, 1048576), true)",
    "new:f20:new BackendError('not-found')",
    "var:f20:candidates:-=((detail.fields ?? []) as ObjectValue[]) .filter((field) => { })",
    "new:f20:new BackendError('not-found')",
    "var:f20:selected:-=candidates[0]",
    "new:f20:new BackendError('not-found')",
    "var:f20:value:-=selected.value as string",
    "var:f22:keys:-=['id', 'name', 'email', 'type', 'state', 'created_at', 'updated_at', 'last_auth_at']",
    "var:f22:probe:-=object(parseProviderJson(bytes, 16384), keys)",
    "var:f23:text:-=new TextDecoder('utf-8', { fatal: true }).decode(bytes)",
    "new:f23:new BackendError('unavailable')",
    "capture:f0:-():BackendError",
    "capture:f1:-():BackendError",
    "capture:f3:space():at,source",
    "capture:f4:string():at,bad,source",
    "capture:f5:value(depth: number):at,bad,nodes,overflow,source,space,string",
    "capture:f7:-(key):value",
    "capture:f8:-(key):optional,required",
    "capture:f12:-(entry):bad,object,strings",
    "capture:f14:-(entry):bad,ids,number,object,purposes,strings",
    "capture:f19:-(entry):row",
    "capture:f21:-(field):",
  ],
  "src/backends/onepasswordProcess.ts": [
    "var:f0:closed:-=false",
    "var:f0:poisoned:-=false",
    "var:f0:attempts:-=0",
    "var:f0:disposal:Promise<void> | undefined=-",
    "var:f0:active:-=new Set<ActiveOperation>()",
    "new:f1:new BackendError('unavailable')",
    "new:f2:new BackendError('unavailable')",
    "var:f2:cancelled:-=false",
    "var:f2:callbacks:-=new Set<() => void>()",
    "var:f2:cancel:-=() => { }",
    "assign:f3:cancelled = true",
    "var:f3:callback:-=-",
    "var:f2:operation:Operation={ check() { }, onCancel(callback) { }, }",
    "new:f4:new BackendError('unavailable')",
    "store:f5:callbacks.add(callback)",
    "var:f2:complete:() => void=-",
    "var:f2:entry:-={ cancel, done: new Promise<void>((resolve) => { }) }",
    "assign:f7:complete = resolve",
    "store:f2:active.add(entry)",
    "var:f2:deadline:-=setTimeout(cancel, 3000)",
    "var:f2:finalTimer:ReturnType<typeof setTimeout> | undefined=-",
    "var:f2:finalBound:-=new Promise<never>((_, reject) => { })",
    "assign:f8:finalTimer = setTimeout(() => { }, 3900)",
    "assign:f9:poisoned = true",
    "new:f9:new BackendError('unavailable')",
    "var:f2:error:-=-",
    "new:f2:new BackendError('unavailable')",
    "new:f10:new BackendError('unavailable')",
    "var:f10:info:-=await stat(config.opPath)",
    "new:f10:new BackendError('unavailable')",
    "var:f10:error:-=-",
    "new:f10:new BackendError('unavailable')",
    "new:f11:new BackendError('unavailable')",
    "var:f11:directory:string | undefined=-",
    "var:f11:result:Buffer | undefined=-",
    "var:f11:detachResult:-=operation.onCancel(() => { })",
    "assign:f11:directory = await mkdtemp(join(tmpdir(), 'tinyvault-op-'))",
    "var:f11:argv:-=['--cache=false', '--config', directory, '--format', 'json', '--no-color']",
    "store:f11:argv.push('--version')",
    "store:f11:argv.push('user', 'get', '--me')",
    "store:f11:argv.push('item', 'list', '--vault', config.vaultId, '--categories', 'Login')",
    "new:f11:new BackendError('unavailable')",
    "store:f11:argv.push('item', 'get', itemId!, '--vault', config.vaultId)",
    "var:f11:env:NodeJS.ProcessEnv | undefined={ OP_CACHE: 'false', OP_BIOMETRIC_UNLOCK_ENABLED: 'false', OP_DEBUG: 'false', OP_INCLUDE_ARCHIVE: 'false', OP_FORMAT: 'json', HOME: directory, OP_CONFIG_DIR: directory, TMPDIR: directory, PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', }",
    "new:f11:new BackendError('locked')",
    "assign:f11:env.OP_SERVICE_ACCOUNT_TOKEN = token",
    "new:f11:new BackendError('unavailable')",
    "write:f11:attempts++",
    "assign:f11:result = await new Promise<Buffer>((resolve, reject) => { })",
    "var:f14:child:-=spawn(config.opPath, argv, { shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'], cwd: directory, env, })",
    "assign:f14:env = undefined",
    "assign:f14:token = undefined",
    "var:f14:cap:-=command === 'version' || command === 'probe' ? 16384 : 1048576",
    "var:f14:output:Buffer | undefined=Buffer.alloc(cap)",
    "var:f14:size:-=0",
    "var:f14:errors:-=0",
    "var:f14:stopping:-=false",
    "var:f14:settled:-=false",
    "var:f14:didClose:-=false",
    "var:f14:success:-=false",
    "var:f14:killTimer:ReturnType<typeof setTimeout> | undefined=-",
    "var:f14:endTimer:ReturnType<typeof setTimeout> | undefined=-",
    "var:f14:detach:-=() => { }",
    "var:f16:error:-=-",
    "assign:f18:settled = true",
    "assign:f18:poisoned = true",
    "var:f18:result:Buffer | undefined=-",
    "new:f18:new BackendError('unavailable')",
    "assign:f18:result = output!.subarray(0, size)",
    "assign:f18:output = undefined",
    "new:f18:new BackendError('unavailable')",
    "assign:f18:output = undefined",
    "assign:f18:result = undefined",
    "assign:f19:stopping = true",
    "assign:f19:output = undefined",
    "assign:f19:killTimer = setTimeout(() => { }, 250)",
    "assign:f20:endTimer = setTimeout(() => { }, 250)",
    "assign:f22:size += chunk.length",
    "assign:f23:errors += chunk.length",
    "assign:f24:didClose = true",
    "assign:f24:success = code === 0",
    "assign:f14:detach = operation.onCancel(stop)",
    "assign:f11:env = undefined",
    "assign:f11:token = undefined",
    "var:f11:error:-=-",
    "assign:f11:result = undefined",
    "assign:f11:poisoned = true",
    "new:f11:new BackendError('unavailable')",
    "new:f11:new BackendError('unavailable')",
    "assign:f25:closed = true",
    "var:f25:pending:-=[...active]",
    "var:f25:operation:-=-",
    "assign:f25:disposal = Promise.all(pending.map((operation) => { })).then(() => { })",
    "new:f27:new BackendError('unavailable')",
    "store:f0:Object.freeze({ method, executable, run, dispose, check })",
    "capture:f1:check():BackendError,closed,poisoned",
    "capture:f2:method(work: (operation: Operation) => Promise<T>):BackendError,active,check,closed,poisoned",
    "capture:f3:-():callbacks,cancelled",
    "capture:f4:check():BackendError,cancelled,check",
    "capture:f5:onCancel(callback):callbacks,cancelled,closed,poisoned",
    "capture:f6:-():callback,callbacks",
    "capture:f7:-(resolve):complete",
    "capture:f8:-(_,reject):BackendError,cancel,finalTimer,poisoned",
    "capture:f9:-():BackendError,cancel,poisoned,reject",
    "capture:f10:executable():BackendError,config,stat",
    "capture:f11:run(operation: Operation,command: Command,token?: string,itemId?: string):BackendError,attempts,check,chmod,config,executable,join,mkdtemp,onCancel,poisoned,rm,spawn,tmpdir",
    "capture:f12:-():result",
    "capture:f13:-(item):itemId",
    "capture:f14:-(resolve,reject):BackendError,argv,check,command,config,directory,env,onCancel,operation,poisoned,spawn,token",
    "capture:f15:-():",
    "capture:f16:groupAlive():child",
    "capture:f17:signal(signalName: 'SIGTERM' | 'SIGKILL'):child",
    "capture:f18:finish(clean: boolean):BackendError,check,child,detach,endTimer,killTimer,operation,output,poisoned,reject,resolve,settled,size,stderr,stdout,stopping,success",
    "capture:f19:stop():didClose,endTimer,finish,groupAlive,killTimer,output,settled,signal,stopping",
    "capture:f20:-():didClose,endTimer,finish,groupAlive,signal",
    "capture:f21:-():didClose,finish,groupAlive",
    "capture:f22:stdout(chunk: Buffer):cap,output,settled,size,stop,stopping",
    "capture:f23:stderr(chunk: Buffer):errors,stop",
    "capture:f24:-(code):didClose,finish,groupAlive,stop,success",
    "capture:f25:dispose():BackendError,active,cancel,closed,disposal,done,poisoned",
    "capture:f26:-(operation):done",
    "capture:f27:-():BackendError,poisoned",
  ],
};

function boundaryCalls(file: ts.SourceFile): string[] {
  const names = new Set(['spawn', 'mkdtemp', 'chmod', 'rm', 'stat', 'open', 'setTimeout', 'clearTimeout',
    'readServiceToken', 'createOnePasswordProcess', 'validateOnePasswordConfig']);
  const methods = new Set(['check', 'run', 'onCancel', 'on', 'removeListener', 'destroy', 'unref', 'fill', 'clear',
    'read', 'close', 'stat', 'kill', 'concat', 'copy']);
  return nodes(file, ts.isCallExpression).filter(call => names.has(call.expression.getText())
    || ts.isPropertyAccessExpression(call.expression) && methods.has(call.expression.name.text))
    .map(call => expressionShape(call));
}

describe('M9 state, retention and operation confinement', () => {
  it('M9 retention shape gate', () => {
    const program = ts.createProgram([...RUNTIME], options);
    for (const name of RUNTIME) {
      const source = program.getSourceFile(name);
      expect(source, `${name}: source exists`).toBeDefined();
      expect(retentionShape(source!, program.getTypeChecker()), `${name}: M9 retention shape gate`)
        .toEqual(RETENTION_SHAPES[name]);
    }
  });
  it('pins runtime imports, filesystem sites, buffer clearing and cancellation boundaries', async () => {
    const files = await sources();
    for (const name of RUNTIME) {
      const file = files.get(name)!;
      expect(moduleLoads(file).map(load => load.node.getText()), `${name}: closed-runtime-imports`).toEqual(IMPORT_SHAPES[name]);
      expect(boundaryCalls(file), `${name}: operation-boundary-calls`).toEqual(BOUNDARY_CALLS[name]);
      const guards = nodes(file, ts.isIfStatement).map(node => expressionShape(node.expression));
      for (const guard of REQUIRED_GUARDS[name] ?? []) expect(guards.filter(value => value === guard), `${name}: ${guard}`)
        .toHaveLength(REQUIRED_GUARDS[name]!.filter(value => value === guard).length);
      for (const guard of nodes(file, ts.isIfStatement).filter(node => expressionShape(node.expression)
        === 'bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf')) {
        const decode = nodes(enclosingFunction(guard)!, ts.isCallExpression).find(node => node.expression.getText().endsWith('.decode'))!;
        expect(guard.end, `${name}: raw-bom-before-decode`).toBeLessThan(decode.getStart());
      }
      const forbidden: string[] = [];
      walk(file, node => {
        if ((ts.isIdentifier(node) || ts.isStringLiteralLike(node)) && /^(?:console|logger|log|eval|Function|globalThis|Reflect|constructor|binding|getBuiltinModule|createWriteStream|writeFile|writeFileSync|appendFile|appendFileSync|Writable)$/u.test(node.text)) {
          forbidden.push(node.text);
        }
        if (ts.isElementAccessExpression(node) && node.expression.getText() === 'process') forbidden.push(node.getText());
        if (ts.isPropertyAccessExpression(node) && node.expression.getText() === 'process'
          && ['stdout', 'stderr'].includes(node.name.text)) forbidden.push(node.getText());
      });
      expect(forbidden, `${name}: runtime-output-ban`).toEqual([]);
    }
  });
  it('pins admitted detail validation before the sole Secret construction', async () => {
    const file = (await sources()).get(RUNTIME[0])!;
    const resolve = nodes(file, ts.isFunctionDeclaration).filter(node => node.name?.text === 'resolveSecret');
    expect(resolve).toHaveLength(1);
    expect(resolve[0]!.body!.getText()).toBe(`{
    return runner.method(async (operation) => {
      const entry = entryFor(handle);
      const policy = policyFor(handle);
      if (!samePolicy(policy, authorizedPolicy)) throw new BackendError('integrity');
      return authenticated(operation, 'detail', (bytes) => {
        let value: string | undefined;
        try {
          value = parseDetail(bytes, config.vaultId, entry.itemId, policy);
          operation.check();
          return new Secret(value);
        } finally { value = undefined; }
      }, entry.itemId);
    });
  }`);
  });
});

const IMPORT_SHAPES: Record<string, readonly string[]> = {
  "src/backends/onepassword.ts": [
    "import { randomBytes } from 'node:crypto';",
    "import { Secret } from '../core/redaction';",
    "import type { CredentialPolicy, Handle, ItemMeta } from '../core/types';",
    "import { BackendError, type BackendStatus, type CredentialBackend } from './backend';",
    "import { readServiceToken, validateOnePasswordConfig } from './onepasswordConfig';",
    "import { parseDetail, parseList, parseProbe, parseVersion } from './onepasswordMetadata';",
    "import { createOnePasswordProcess, type Operation, type Command } from './onepasswordProcess';",
  ],
  "src/backends/onepasswordConfig.ts": [
    "import { createHash } from 'node:crypto';",
    "import { constants } from 'node:fs';",
    "import { open } from 'node:fs/promises';",
    "import { isAbsolute } from 'node:path';",
    "import { BackendError } from './backend';",
  ],
  "src/backends/onepasswordMetadata.ts": [
    "import { validateBareOrigin } from '../core/originGuard';",
    "import type { CredentialPolicy } from '../core/types';",
    "import { BackendError } from './backend';",
    "import { isRecordId } from './onepasswordConfig';",
  ],
  "src/backends/onepasswordProcess.ts": [
    "import { spawn } from 'node:child_process';",
    "import { chmod, mkdtemp, rm, stat } from 'node:fs/promises';",
    "import { tmpdir } from 'node:os';",
    "import { join } from 'node:path';",
    "import { BackendError } from './backend';",
    "import type { OnePasswordConfig } from './onepasswordConfig';",
  ],
};

const BOUNDARY_CALLS: Record<string, readonly string[]> = {
  "src/backends/onepassword.ts": [
    "validateOnePasswordConfig(options)",
    "createOnePasswordProcess(config)",
    "runner.run(operation, 'version')",
    "operation.check()",
    "bytes?.fill(0)",
    "operation.check()",
    "operation.check()",
    "readServiceToken(config.tokenPath)",
    "operation.check()",
    "operation.check()",
    "runner.run(operation, command, authentication.token, itemId)",
    "operation.check()",
    "bytes?.fill(0)",
    "operation.check()",
    "operation.check()",
    "operation.check()",
    "operation.check()",
    "operation.check()",
    "operation.check()",
    "entries.clear()",
  ],
  "src/backends/onepasswordConfig.ts": [
    "open(tokenPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)",
    "descriptor.stat()",
    "descriptor.read(bytes, used, bytes.length - used, null)",
    "bytes?.fill(0)",
    "descriptor.close()",
  ],
  "src/backends/onepasswordMetadata.ts": [
  ],
  "src/backends/onepasswordProcess.ts": [
    "setTimeout(cancel, 3000)",
    "setTimeout(() => { }, 3900)",
    "clearTimeout(deadline)",
    "clearTimeout(finalTimer)",
    "callbacks.clear()",
    "stat(config.opPath)",
    "operation.check()",
    "operation.check()",
    "operation.onCancel(() => { })",
    "result?.fill(0)",
    "mkdtemp(join(tmpdir(), 'tinyvault-op-'))",
    "chmod(directory, 0o700)",
    "operation.check()",
    "operation.check()",
    "spawn(config.opPath, argv, { shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'], cwd: directory, env, })",
    "process.kill(-child.pid, 0)",
    "process.kill(-child.pid, signalName)",
    "clearTimeout(killTimer)",
    "clearTimeout(endTimer)",
    "child.stdout?.removeListener('data', stdout)",
    "child.stderr?.removeListener('data', stderr)",
    "child.stdout?.destroy()",
    "child.stderr?.destroy()",
    "child.unref()",
    "operation.check()",
    "output?.fill(0)",
    "output?.fill(0)",
    "setTimeout(() => { }, 250)",
    "setTimeout(() => { }, 250)",
    "chunk.copy(output!, size - chunk.length)",
    "chunk.fill(0)",
    "chunk.fill(0)",
    "child.stdout?.on('data', stdout)",
    "child.stderr?.on('data', stderr)",
    "child.on('error', stop)",
    "child.on('close', (code) => { })",
    "operation.onCancel(stop)",
    "result?.fill(0)",
    "rm(directory, { recursive: true, force: true })",
    "result?.fill(0)",
    "operation.check()",
    "result?.fill(0)",
  ],
};

const REQUIRED_GUARDS: Record<string, readonly string[]> = {
  "src/backends/onepassword.ts": [
    "Object.hasOwn(process.env, 'OP_SERVICE_ACCOUNT_TOKEN')",
    "authChanged",
    "authChanged",
    "fingerprint === undefined",
    "fingerprint !== authentication.fingerprint",
    "snapshot !== undefined",
    "!samePolicy(policy, authorizedPolicy)",
  ],
  "src/backends/onepasswordConfig.ts": [
    "!exactKeys(value, ['opPath', 'tokenPath', 'vaultId', 'items'])",
    "typeof opPath !== 'string' || !isAbsolute(opPath) || opPath.includes('\\0') || typeof tokenPath !== 'string' || !isAbsolute(tokenPath) || tokenPath.includes('\\0') || !isRecordId(vaultId) || !Array.isArray(items) || items.length < 1 || items.length > 64",
    "!exactKeys(item, ['itemId', 'label']) || !isRecordId(item.itemId) || typeof item.label !== 'string' || item.label.length < 1 || item.label.length > 128 || /[\\u0000-\\u001f\\u007f-\\u009f]/u.test(item.label) || seen.has(item.itemId)",
    "!info.isFile() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0 || info.size > 16384",
    "used > 16384",
    "bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf",
    "/\\s|\\p{Cc}/u.test(token)",
  ],
  "src/backends/onepasswordMetadata.ts": [
    "bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf",
  ],
  "src/backends/onepasswordProcess.ts": [
    "closed || poisoned",
    "active.size >= 4",
    "cancelled",
    "cancelled || closed || poisoned",
    "attempts >= 64",
    "settled",
    "!clean || stopping || !success",
    "settled || stopping",
    "!settled && !stopping",
    "size > cap",
    "errors > 16384",
  ],
};
