import {
  timingSourceCompiler, TIMING_SOURCE_PATH, type TimingSymbol, ts, type TimingIdentifier,
  type TimingExpression, type TimingBlock, pinsTimingImports, type TimingCallExpression,
  type TimingArrowFunction, type TimingNode, SIDECAR_SOURCE, type TimingFunctionDeclaration,
} from './timingSourceCompiler';
import {
  timingSourceLifecyclePins, PINNED_ROOT_HOOKS, timingSourceNonDiagnosticTitles,
  PINNED_START_SIDECAR_SOURCE, PINNED_FINISH_SIDECAR_SOURCE, timingSourceFamilyBody,
  timingSourceDiagnosticTitles,
} from './timingSourceContracts';
import { timingFunctionText } from './timingSourcePins';

export function timingSourceResolve(source: string, compile: ReturnType<typeof timingSourceCompiler>) {
  const program = compile(source);
  const file = program.getSourceFile(TIMING_SOURCE_PATH)!;
  const checker = program.getTypeChecker();
  const unalias = (symbol: TimingSymbol | undefined): TimingSymbol | undefined =>
    symbol && (symbol.flags & ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(symbol) : symbol;
  const symbolAt = (node: TimingIdentifier): TimingSymbol | undefined => unalias(
    ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node
      ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node),
  );
  const imports = file.statements.filter(ts.isImportDeclaration);
  const vitest = imports.find((node) => ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === 'vitest');
  const module = vitest && checker.getSymbolAtLocation(vitest.moduleSpecifier);
  const exports = module ? checker.getExportsOfModule(module) : [];
  const registrationSymbols = new Map<TimingSymbol, string>();
  for (const name of ['it', 'test', 'describe', 'beforeAll', 'afterEach', 'afterAll']) {
    const symbol = unalias(exports.find((symbol) => symbol.name === name));
    if (symbol) registrationSymbols.set(symbol, name);
  }
  const isReference = (node: TimingExpression, name: string): node is TimingIdentifier =>
    ts.isIdentifier(node) && registrationSymbols.get(symbolAt(node)!) === name && node.getText(file) === name;
  const allowedRegistrations = new Set<TimingIdentifier>();
  const suites = new Map<string, TimingBlock>();
  const hooks = new Map<string, TimingBlock[]>();
  const tests: { title: string; body: string; block: TimingBlock; suite: string }[] = [];
  // This scan bounds test registration to references of the statically imported vitest symbols (`it`, `test`, `describe`, hooks) and `vi.spyOn`, with synchronous suite factories. Obtaining a registration function through Vitest internals, globals, or a module loader other than the static import is outside the scan; the complementary control is the execution gate's per-file test inventory (the execution gate's `timing-2-inventory` rule pins the report's exact 26 titles).
  // Fourth pinned exception: vi.restoreAllMocks() only at its existing site in
  // the byte-pinned root afterEach cleanup hook (alongside the three existing exceptions).
  let registrationsResolved = registrationSymbols.size === 6 && pinsTimingImports(file)
    && program.getSyntacticDiagnostics(file).length === 0;
  const viSymbol = unalias(exports.find((symbol) => symbol.name === 'vi'));
  registrationsResolved &&= viSymbol !== undefined;
  let cleanupRestore: TimingIdentifier | undefined;
  const titles = ['H Probe P timing bounds', 'M6 S4 lifecycle timing bounds'];
  const lifecyclePins = timingSourceLifecyclePins();
  let rootAfterEach = 0; let lifecycleEach = 0; let lifecycleHook = 0;
  const bodyOf = (call: TimingCallExpression): TimingBlock | undefined => {
    const callback = call.arguments[1];
    return callback && ts.isArrowFunction(callback) && ts.isBlock(callback.body) ? callback.body : undefined;
  };
  for (const statement of file.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
    const call = statement.expression; const callee = call.expression; const title = call.arguments[0];
    if (ts.isPropertyAccessExpression(callee) && isReference(callee.expression, 'describe')
      && callee.name.getText(file) === 'sequential' && title && ts.isStringLiteral(title)
      && titles.includes(title.text) && bodyOf(call) && !suites.has(title.text)) {
      const factory = call.arguments[1] as TimingArrowFunction;
      if (factory.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)) {
        registrationsResolved = false;
      }
      const scanFactory = (node: TimingNode): void => {
        // A nested function owns its awaits, including the existing it/hook callbacks.
        if (ts.isFunctionLike(node)) return;
        if (ts.isAwaitExpression(node)) registrationsResolved = false;
        ts.forEachChild(node, scanFactory);
      };
      scanFactory(factory.body);
      suites.set(title.text, bodyOf(call)!); allowedRegistrations.add(callee.expression);
    }
    for (const name of ['beforeAll', 'afterEach', 'afterAll']) {
      const callback = call.arguments[0];
      if (isReference(callee, name) && callback && ts.isArrowFunction(callback) && ts.isBlock(callback.body)) {
        hooks.set(name, [...(hooks.get(name) ?? []), callback.body]);
        if (name !== 'afterEach' || statement.getText(file) === lifecyclePins.rootHooks[rootAfterEach++]) {
          allowedRegistrations.add(callee);
          if (name === 'afterEach' && statement.getText(file) === lifecyclePins.rootHooks[0]) {
            const restore = callback.body.statements[2];
            if (restore && ts.isExpressionStatement(restore) && ts.isCallExpression(restore.expression)
              && ts.isPropertyAccessExpression(restore.expression.expression)
              && ts.isIdentifier(restore.expression.expression.expression)) {
              cleanupRestore = restore.expression.expression.expression;
            }
          }
        }
      }
    }
  }
  const rootHooks = file.statements.filter((node) => ts.isExpressionStatement(node)
    && ts.isCallExpression(node.expression) && ts.isIdentifier(node.expression.expression)
    && ['beforeAll', 'afterEach', 'afterAll'].includes(node.expression.expression.text));
  registrationsResolved &&= suites.size === 2 && rootHooks.length === PINNED_ROOT_HOOKS.length
    && rootHooks.every((node, index) => node.getText(file) === PINNED_ROOT_HOOKS[index]);
  for (const [suite, block] of suites) {
    for (const statement of block.statements) {
      if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
      const call = statement.expression; const title = call.arguments[0]; const body = bodyOf(call);
      if (suite === titles[1]) {
        if (statement === block.statements[0] && statement.getText(file) === lifecyclePins.hook
          && isReference(call.expression, 'afterEach')) {
          allowedRegistrations.add(call.expression); lifecycleHook++;
        }
        const each = call.expression;
        if (statement === block.statements[2] && statement.getText(file) === lifecyclePins.each
          && ts.isCallExpression(each) && ts.isPropertyAccessExpression(each.expression)
          && isReference(each.expression.expression, 'it')) {
          allowedRegistrations.add(each.expression.expression); lifecycleEach++;
        }
      }
      if (isReference(call.expression, 'it') && title && ts.isStringLiteral(title) && body) {
        allowedRegistrations.add(call.expression);
        tests.push({ title: title.text, suite, block: body, body: source.slice(body.getStart(file) + 1, body.end - 1) });
      }
    }
  }
  registrationsResolved &&= rootAfterEach === lifecyclePins.rootHooks.length && lifecycleEach === 1 && lifecycleHook === 1;
  const pinnedBody = tests.find(({ suite, title }) => suite === titles[0]
    && title === timingSourceNonDiagnosticTitles()[0])?.block;
  const forbidden = new Set(['Function', 'eval', 'Reflect', 'Proxy', 'globalThis'].map((name) =>
    checker.resolveName(name, undefined, ts.SymbolFlags.Value, false)));
  registrationsResolved &&= !forbidden.has(undefined);
  const hostImport = tests.find(({ suite, title }) => suite === titles[0]
    && title === 'kills content-dependent request-listener work on the real supervised click path')?.block.statements.filter(
    (node) => node.getText(file) === "const host = await import('./host').then(({ createSupervisedHost }) =>\n"
      + '      createSupervisedHost({ backend, canary: CANARY, browser }));',
  ) ?? [];
  registrationsResolved &&= hostImport.length === 1;
  const references: { node: TimingIdentifier; symbol: TimingSymbol | undefined }[] = [];
  const visit = (node: TimingNode): void => {
    if (ts.isImportDeclaration(node)) return; // Exact import text is pinned, including aliases and namespaces.
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && !(hostImport[0] && node.pos >= hostImport[0].pos && node.end <= hostImport[0].end)) registrationsResolved = false;
    if (ts.isImportEqualsDeclaration(node) || ts.isExportDeclaration(node)) registrationsResolved = false;
    if (ts.isIdentifier(node)) {
      const symbol = symbolAt(node); references.push({ node, symbol });
      if (symbol && symbol === viSymbol && node !== cleanupRestore) {
        const property = node.parent;
        if (!ts.isPropertyAccessExpression(property) || property.expression !== node
          || property.name.getText(file) !== 'spyOn' || !ts.isCallExpression(property.parent)
          || property.parent.expression !== property) registrationsResolved = false;
      }
      if (symbol && registrationSymbols.has(symbol) && !allowedRegistrations.has(node)) registrationsResolved = false;
      if (symbol && forbidden.has(symbol) && !(pinnedBody && node.pos >= pinnedBody.pos && node.end <= pinnedBody.end)) {
        registrationsResolved = false;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { file, checker, symbolAt, references, tests, hooks,
    // Run semantic diagnostics only when this predicate is read, after structural rejection.
    // Map-only mutants do not need a second, unrelated check of their program's types.
    get registrationsResolved() {
      if (!registrationsResolved) return false;
      return program.getSemanticDiagnostics(file).length === 0;
    },
  };
}

export function pinsResolvedMapReferences(
  resolved: ReturnType<typeof timingSourceResolve>, sidecarSource = SIDECAR_SOURCE,
): boolean {
  if (timingFunctionText(sidecarSource, 'startTimingSidecar') !== PINNED_START_SIDECAR_SOURCE
    || timingFunctionText(sidecarSource, 'finishTimingSidecar') !== PINNED_FINISH_SIDECAR_SOURCE) return false;
  const { file, symbolAt, references, tests, hooks } = resolved;
  const gateMap = 'probe' + 'Results'; const diagnosticMap = 'diagnostic' + 'Results';
  const declarations = file.statements.filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations]);
  const bindings = [gateMap, diagnosticMap].map((name) => declarations.filter((node) =>
    ts.isIdentifier(node.name) && node.name.text === name));
  if (bindings.some((nodes) => nodes.length !== 1)) return false;
  const names = bindings.map((nodes) => nodes[0]!.name as TimingIdentifier);
  const symbols = new Set(names.map(symbolAt));
  if (symbols.has(undefined) || symbols.size !== 2) return false;
  const allowed = new Set<TimingIdentifier>(names);
  let valid = true;
  const allow = (block: TimingBlock | undefined, text: string): void => {
    const statements = block?.statements.filter((node) => node.getText(file) === text) ?? [];
    if (statements.length !== 1) { valid = false; return; }
    const statement = statements[0]!;
    for (const { node, symbol } of references) {
      if (symbols.has(symbol) && node.pos >= statement.pos && node.end <= statement.end) allowed.add(node);
    }
  };
  const functionBody = (name: string): TimingBlock | undefined => {
    const functions = file.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
    return functions.length === 1 ? (functions[0] as TimingFunctionDeclaration).body : undefined;
  };
  const tryBody = (block: TimingBlock | undefined): TimingBlock | undefined => {
    const first = block?.statements[0];
    return first && ts.isTryStatement(first) ? first.tryBlock : undefined;
  };
  allow(hooks.get('beforeAll')?.[0], gateMap + '.clear();');
  allow(functionBody('report'), gateMap + '.set(name, result);');
  const families = tests.filter(({ title, suite }) => suite === 'H Probe P timing bounds'
    && title === 'applies the Holm–Bonferroni family gate over the six probes');
  const family = families.length === 1 ? families[0]!.block : undefined;
  const directGate = 'assertProbeFamily(' + gateMap + ', { alpha: 0.01, expected: PROBE_NAMES });';
  const biasedCopy = 'const biased = new Map(' + gateMap + ');';
  // Third user-authorized exception: the existing copy immediately after the direct gate.
  // The entire family body is pinned, so this grants no additional statement or reordered use.
  valid &&= family?.getText(file) === timingSourceFamilyBody()
    && family.statements[0]?.getText(file) === directGate && family.statements[1]?.getText(file) === biasedCopy;
  allow(family, directGate);
  allow(family, biasedCopy);
  allow(tryBody(functionBody('timingFamily')),
    'assertProbeFamily(new Map(' + gateMap + '), { alpha: 0.01, expected: PROBE_NAMES });');
  allow(hooks.get('afterAll')?.[1],
    'await finishTimingSidecar(SIDECAR_PATH, startedAt, browser, ledger, ledgerFailures, ' + gateMap + ',\n'
      + '  ' + diagnosticMap + ', sensitivityFloor, timingFamily);');
  allow(functionBody('recordDiagnosticOutcomes'), diagnosticMap + '.set(name, { result, hardClause, singleProbeFamily });');
  const conditional = tryBody(functionBody('recordDiagnostic'))?.statements[1];
  allow(conditional && ts.isIfStatement(conditional) && ts.isBlock(conditional.thenStatement) ? conditional.thenStatement : undefined,
    diagnosticMap + '.set(name, { ...' + diagnosticMap + ".get(name)!, singleProbeFamily: rejection ? 'reject' : 'accept' });");
  for (const { suite, title, block } of tests) {
    if (suite === 'H Probe P timing bounds' && !timingSourceNonDiagnosticTitles().includes(title)) {
      allow(block, 'expect(' + diagnosticMap + '.has(name)).toBe(true);');
    }
  }
  for (const { node, symbol } of references) {
    if (!symbols.has(symbol)) continue;
    if (!allowed.has(node)) valid = false; // Reject alias creation before an alias can carry the map elsewhere.
    if (ts.isElementAccessExpression(node.parent) && node.parent.expression === node) valid = false;
    if (ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node
      && (!['set', 'get', 'has', 'clear'].includes(node.parent.name.text)
        || !ts.isCallExpression(node.parent.parent) || node.parent.parent.expression !== node.parent)) valid = false;
  }
  return valid;
}

export function pinsDiagnosticTitles(resolved: ReturnType<typeof timingSourceResolve>): boolean {
  const titles = resolved.tests.filter(({ suite }) => suite === 'H Probe P timing bounds').map(({ title }) => title);
  const excluded = timingSourceNonDiagnosticTitles();
  const expected = timingSourceDiagnosticTitles();
  const diagnostics = titles.filter((title) => !excluded.includes(title));
  return titles.length === excluded.length + expected.length
    && new Set(titles).size === titles.length
    && excluded.every((title) => titles.includes(title))
    && diagnostics.length === expected.length && expected.every((title) => diagnostics.includes(title));
}

export function timingDiagnosticBodies(resolved: ReturnType<typeof timingSourceResolve>): Map<string, string> {
  const excluded = new Set(timingSourceNonDiagnosticTitles());
  return new Map(resolved.tests.filter(({ suite, title }) => suite === 'H Probe P timing bounds' && !excluded.has(title))
    .map(({ title, body }) => [title, body]));
}

export function pinsDiagnosticStatistics(resolved: ReturnType<typeof timingSourceResolve>): boolean {
  const calls: Record<string, string> = {
    "tripwire-match-vs-no-match-aa": "tripwireTimingProbe(CANARY, CANARY);",
    "tripwire-match-vs-no-match-sham": "tripwireTimingProbe(NONMATCH, NONMATCH2);",
    "tripwire-real-click-match-vs-no-match-aa": "realClickTripwireTimingProbe(CANARY, CANARY);",
    "tripwire-real-click-match-vs-no-match-sham": "realClickTripwireTimingProbe(NONMATCH, NONMATCH2);",
    "tripwire-real-click-bias-250us": "realClickTripwireTimingProbe(NONMATCH, NONMATCH, {\n      afterB: () => spinForMicroseconds(250),\n    });",
    "tripwire-real-click-bias-1000us": "realClickTripwireTimingProbe(NONMATCH, NONMATCH, {\n      afterB: () => spinForMicroseconds(1000),\n    });",
  };
  const sham = [
    "    expect(NONMATCH2).not.toBe(NONMATCH);",
    "    expect(NONMATCH2).not.toBe(CANARY);",
    "    for (const payload of [NONMATCH, NONMATCH2]) {",
    "      for (const bytes of [JSON.stringify(timingVaultResult(payload)), JSON.stringify(timingFillOutcome(payload).result)]) {",
    "        expect(secretMatcher.firstMatchingSecretTransform(bytes, CANARY, new Set(SECRET_TRANSFORM_NAMES))).toBeNull();",
    "      }",
    "    }",
  ];
  const bodies = timingDiagnosticBodies(resolved);
  return pinsDiagnosticTitles(resolved) && bodies.size === 6 && [...bodies].every(([name, body]) => {
    const lines = [
      `    const name = '${name}';`,
      ...(name.endsWith('-sham') ? sham : []),
      '    const result = await ' + calls[name],
      '    recordDiagnostic(name, result);',
      '    assertFiniteProbeStatistics(result);',
      '    expect(' + 'diagnostic' + 'Results.has(name)).toBe(true);',
    ];
    return body === '\n' + lines.join('\n') + '\n  ';
  });
}

export function pinsDiagnosticConstruction(resolved: ReturnType<typeof timingSourceResolve>): boolean {
  const bodies = timingDiagnosticBodies(resolved);
  return ['tripwire-match-vs-no-match', 'tripwire-real-click-match-vs-no-match'].every((sibling) => {
    const helper = sibling.includes('real-click') ? 'realClickTripwireTimingProbe' : 'tripwireTimingProbe';
    const aa = bodies.get(sibling + '-aa') ?? ''; const sham = bodies.get(sibling + '-sham') ?? '';
    return aa.includes(`await ${helper}(CANARY, CANARY);`)
      && sham.includes(`await ${helper}(NONMATCH, NONMATCH2);`)
      && sham.includes('expect(NONMATCH2).not.toBe(NONMATCH);')
      && sham.includes('expect(NONMATCH2).not.toBe(CANARY);')
      && sham.includes('for (const payload of [NONMATCH, NONMATCH2])')
      && sham.includes('[JSON.stringify(timingVaultResult(payload)), JSON.stringify(timingFillOutcome(payload).result)]')
      && sham.includes('expect(secretMatcher.firstMatchingSecretTransform(bytes, CANARY, new Set(SECRET_TRANSFORM_NAMES))).toBeNull();');
  }) && [250, 1000].every((bias) => (bodies.get(`tripwire-real-click-bias-${bias}us`) ?? '').includes(
    `await realClickTripwireTimingProbe(NONMATCH, NONMATCH, {\n      afterB: () => spinForMicroseconds(${bias}),\n    });`,
  ));
}
