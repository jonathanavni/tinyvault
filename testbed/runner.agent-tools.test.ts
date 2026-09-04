import { readdir } from 'node:fs/promises';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOTS = ['src', 'testbed'] as const;
const RUNNER = 'testbed/runner.ts';
const TARGET_NAME = ['run', 'Agent', 'Loop'].join('');
const SOURCE_EXTENSION = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/u;

type OccurrenceRole =
  | 'alias-binding'
  | 'alias-source'
  | 'definition'
  | 'direct-call'
  | 'dynamic-import'
  | 'element-access'
  | 'import'
  | 'property-access'
  | 'property-receiver'
  | 're-export'
  | 'reference'
  | 'type-reference';

type TargetOccurrence = Readonly<{
  file: string;
  line: number;
  column: number;
  role: OccurrenceRole;
}>;

type Analysis = Readonly<{
  checker: ts.TypeChecker;
  options: ts.CompilerOptions;
  program: ts.Program;
  sourcePaths: ReadonlySet<string>;
  targetSymbols: ReadonlySet<ts.Symbol>;
}>;

// This is the complete positive inventory. A new import, export, reference, alias, property access,
// element access, dynamic import, or call must be added here with its exact structural role.
const ALLOWED_OCCURRENCES: readonly TargetOccurrence[] = [
  { file: 'src/agents/loop.test.ts', line: 10, column: 3, role: 'import' },
  { file: 'src/agents/loop.test.ts', line: 36, column: 26, role: 'direct-call' },
  { file: 'src/agents/loop.test.ts', line: 73, column: 26, role: 'direct-call' },
  { file: 'src/agents/loop.test.ts', line: 101, column: 26, role: 'direct-call' },
  { file: 'src/agents/loop.test.ts', line: 116, column: 26, role: 'direct-call' },
  { file: 'src/agents/loop.test.ts', line: 139, column: 26, role: 'direct-call' },
  { file: 'src/agents/loop.test.ts', line: 162, column: 18, role: 'direct-call' },
  { file: 'src/agents/loop.test.ts', line: 183, column: 26, role: 'direct-call' },
  { file: 'src/agents/loop.test.ts', line: 206, column: 18, role: 'direct-call' },
  { file: 'src/agents/loop.test.ts', line: 227, column: 18, role: 'direct-call' },
  { file: 'src/agents/loop.test.ts', line: 249, column: 18, role: 'direct-call' },
  { file: 'src/agents/loop.test.ts', line: 271, column: 18, role: 'direct-call' },
  { file: 'src/agents/loop.ts', line: 72, column: 1, role: 'definition' },
  { file: 'src/supervisor/host.test.ts', line: 6, column: 10, role: 'import' },
  { file: 'src/supervisor/host.test.ts', line: 174, column: 26, role: 'direct-call' },
  { file: 'testbed/runner.ts', line: 6, column: 3, role: 'import' },
  { file: 'testbed/runner.ts', line: 442, column: 45, role: 'type-reference' },
  { file: 'testbed/runner.ts', line: 480, column: 29, role: 'type-reference' },
  { file: 'testbed/runner.ts', line: 484, column: 37, role: 'type-reference' },
  { file: 'testbed/runner.ts', line: 492, column: 10, role: 'direct-call' },
  { file: 'testbed/runner.wiring.test.ts', line: 9, column: 10, role: 'import' },
  { file: 'testbed/runner.wiring.test.ts', line: 361, column: 26, role: 'direct-call' },
  { file: 'testbed/runner.wiring.test.ts', line: 395, column: 18, role: 'direct-call' },
];

describe('evaluated-agent construction confinement', () => {
  it('classifies every loop entry-point occurrence in runtime source', async () => {
    const analysis = await analyzeSources();
    expect(collectOccurrences(analysis)).toEqual(ALLOWED_OCCURRENCES);
  });

  it('keeps exactly one reachable direct construction with wholly validated options', async () => {
    const analysis = await analyzeSources();
    const reachable = reachableSourceFiles(analysis, RUNNER);
    const constructions = reachable.flatMap((sourceFile) =>
      findConstructions(sourceFile, analysis));
    expect(constructions.map(({ sourceFile, call }) => location(sourceFile, call)))
      .toEqual([`${RUNNER}:492:10`]);

    const [{ call, sourceFile }] = constructions;
    expect(containingFunctionName(call)).toBe('runHostAdapter');
    expect(isDirectTargetCall(call, analysis)).toBe(true);
    validateBlessedOptions(call, sourceFile);
  });
});

async function analyzeSources(): Promise<Analysis> {
  const sourcePaths = new Set((await Promise.all(ROOTS.map(sourceFiles))).flat()
    .map((file) => path.resolve(file)));
  const config = ts.readConfigFile(path.resolve('tsconfig.json'), ts.sys.readFile);
  if (config.error !== undefined) throw new Error(formatDiagnostic(config.error));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.resolve('.'));
  const options = { ...parsed.options, allowJs: true, checkJs: false, noEmit: true };
  const program = ts.createProgram({ rootNames: [...sourcePaths], options });
  const checker = program.getTypeChecker();
  const declarationFile = program.getSourceFile(path.resolve('src/agents/loop.ts'));
  if (declarationFile === undefined) throw new Error('Missing evaluated loop module');
  const declaration = declarationFile.statements.find((statement): statement is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === TARGET_NAME);
  const target = declaration?.name && checker.getSymbolAtLocation(declaration.name);
  if (target === undefined) throw new Error('Missing evaluated loop entry point');
  const analysis = { checker, options, program, sourcePaths, targetSymbols: new Set([target]) };
  return { ...analysis, targetSymbols: discoverAliases(analysis) };
}

function discoverAliases(analysis: Analysis): ReadonlySet<ts.Symbol> {
  const symbols = new Set(analysis.targetSymbols);
  let changed = true;
  while (changed) {
    changed = false;
    for (const sourceFile of runtimeSourceFiles(analysis)) {
      walk(sourceFile, (node) => {
        let binding: ts.BindingName | ts.Expression | undefined;
        let value: ts.Expression | undefined;
        if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
          binding = node.name;
          value = node.initializer;
        } else if (ts.isBinaryExpression(node)
          && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
          binding = node.left;
          value = node.right;
        } else if (ts.isBindingElement(node) && node.propertyName !== undefined
          && node.name !== undefined && node.propertyName !== undefined
          && nodeRefersToTarget(node.propertyName, analysis, symbols)) {
          binding = node.name;
        }
        if (binding === undefined || (value !== undefined && !isTargetValue(value, analysis, symbols))) return;
        for (const identifier of bindingIdentifiers(binding)) {
          const symbol = analysis.checker.getSymbolAtLocation(identifier);
          if (symbol !== undefined && !symbols.has(symbol)) {
            symbols.add(symbol);
            changed = true;
          }
        }
      });
    }
  }
  return symbols;
}

function collectOccurrences(analysis: Analysis): TargetOccurrence[] {
  const occurrences: TargetOccurrence[] = [];
  for (const sourceFile of runtimeSourceFiles(analysis)) {
    const visit = (node: ts.Node): void => {
      const containerRole = occurrenceContainerRole(node, analysis);
      if (containerRole !== undefined) {
        occurrences.push(occurrence(sourceFile, node, containerRole));
        return;
      }
      if ((ts.isIdentifier(node) || ts.isStringLiteral(node))
        && nodeRefersToTarget(node, analysis, analysis.targetSymbols)) {
        occurrences.push(occurrence(sourceFile, node, referenceRole(node, analysis)));
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return occurrences.sort(compareOccurrences);
}

function occurrenceContainerRole(node: ts.Node, analysis: Analysis): OccurrenceRole | undefined {
  if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
    && resolvesToTargetModule(node.moduleSpecifier.text, node, analysis)
    && (node.importClause === undefined || node.importClause.name !== undefined
      || (node.importClause.namedBindings !== undefined
        && ts.isNamespaceImport(node.importClause.namedBindings)))) return 'import';
  if (ts.isImportSpecifier(node)
    && [node.propertyName, node.name].some((name) => name !== undefined
      && nodeRefersToTarget(name, analysis, analysis.targetSymbols))) return 'import';
  if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined
    && ts.isStringLiteral(node.moduleSpecifier)
    && resolvesToTargetModule(node.moduleSpecifier.text, node, analysis)
    && (node.exportClause === undefined || ts.isNamespaceExport(node.exportClause))) return 're-export';
  if (ts.isExportSpecifier(node)
    && [node.propertyName, node.name].some((name) => name !== undefined
      && nodeRefersToTarget(name, analysis, analysis.targetSymbols))) return 're-export';
  if (ts.isFunctionDeclaration(node) && node.name !== undefined
    && nodeRefersToTarget(node.name, analysis, analysis.targetSymbols)) return 'definition';
  if (isStaticDynamicImport(node) && resolvesToTargetModule(node.arguments[0]!.text, node, analysis)) {
    return 'dynamic-import';
  }
  return undefined;
}

function referenceRole(node: ts.Identifier | ts.StringLiteral, analysis: Analysis): OccurrenceRole {
  const parent = node.parent;
  if (ts.isCallExpression(parent) && unwrap(parent.expression) === node) return 'direct-call';
  if (ts.isTypeQueryNode(parent)) return 'type-reference';
  if (ts.isVariableDeclaration(parent) && parent.name === node) return 'alias-binding';
  if (ts.isVariableDeclaration(parent) && parent.initializer !== undefined
    && isInside(node, parent.initializer)) return 'alias-source';
  if (ts.isPropertyAccessExpression(parent)) {
    return parent.expression === node ? 'property-receiver' : 'property-access';
  }
  if (ts.isElementAccessExpression(parent)) return 'element-access';
  if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return isInside(node, parent.left) ? 'alias-binding' : 'alias-source';
  }
  return 'reference';
}

function reachableSourceFiles(analysis: Analysis, root: string): ts.SourceFile[] {
  const pending = [path.resolve(root)];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const sourceFile = analysis.program.getSourceFile(current);
    if (sourceFile === undefined) throw new Error(`Missing reachable source: ${relative(current)}`);
    for (const specifier of runtimeModuleSpecifiers(sourceFile)) {
      const resolved = resolveModule(specifier, sourceFile.fileName, analysis);
      if (resolved !== undefined && analysis.sourcePaths.has(resolved) && !visited.has(resolved)) {
        pending.push(resolved);
      }
    }
  }
  return [...visited].sort().map((file) => analysis.program.getSourceFile(file)!);
}

function runtimeModuleSpecifiers(sourceFile: ts.SourceFile): string[] {
  const specifiers: string[] = [];
  walk(sourceFile, (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
      && importHasRuntimeValue(node)) specifiers.push(node.moduleSpecifier.text);
    else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined
      && ts.isStringLiteral(node.moduleSpecifier) && exportHasRuntimeValue(node)) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (isStaticDynamicImport(node)) specifiers.push(node.arguments[0]!.text);
    else if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly
      && ts.isExternalModuleReference(node.moduleReference)
      && ts.isStringLiteral(node.moduleReference.expression)) {
      specifiers.push(node.moduleReference.expression.text);
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === 'require' && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])) specifiers.push(node.arguments[0].text);
  });
  return specifiers;
}

function findConstructions(
  sourceFile: ts.SourceFile,
  analysis: Analysis,
): Array<{ sourceFile: ts.SourceFile; call: ts.CallExpression }> {
  const found: Array<{ sourceFile: ts.SourceFile; call: ts.CallExpression }> = [];
  walk(sourceFile, (node) => {
    if (!ts.isCallExpression(node)) return;
    const callee = unwrap(node.expression);
    if (isTargetValue(callee, analysis, analysis.targetSymbols)
      || isCallOrApplyOnTarget(callee, analysis)) found.push({ sourceFile, call: node });
  });
  return found;
}

function isDirectTargetCall(call: ts.CallExpression, analysis: Analysis): boolean {
  const callee = unwrap(call.expression);
  return ts.isIdentifier(callee) && callee.text === TARGET_NAME
    && nodeRefersToTarget(callee, analysis, analysis.targetSymbols);
}

function isCallOrApplyOnTarget(expression: ts.Expression, analysis: Analysis): boolean {
  if (ts.isPropertyAccessExpression(expression)) {
    return (expression.name.text === 'call' || expression.name.text === 'apply')
      && isTargetValue(expression.expression, analysis, analysis.targetSymbols);
  }
  if (ts.isElementAccessExpression(expression) && ts.isStringLiteral(expression.argumentExpression)) {
    return (expression.argumentExpression.text === 'call' || expression.argumentExpression.text === 'apply')
      && isTargetValue(expression.expression, analysis, analysis.targetSymbols);
  }
  return false;
}

function validateBlessedOptions(call: ts.CallExpression, sourceFile: ts.SourceFile): void {
  expect(call.arguments).toHaveLength(1);
  const argument = call.arguments[0];
  expect(argument !== undefined && ts.isObjectLiteralExpression(argument)).toBe(true);
  if (argument === undefined || !ts.isObjectLiteralExpression(argument)) {
    throw new Error('Evaluated loop options must be one object literal');
  }
  const expectedInitializers: Readonly<Record<string, string>> = {
    client: 'input.client',
    messages: 'input.messages',
    maxTurns: 'input.maxTurns',
    tools: 'evaluatedAgentToolDefinitions()',
    handlers: 'createHostHandlers(input.host)',
    transcript: 'input.transcript',
    secretSources: 'input.secretSources',
  };
  const expectedKeys = [...Object.keys(expectedInitializers), 'afterLoop'];
  const seen = new Set<string>();
  const actualKeys: string[] = [];
  for (const property of argument.properties) {
    expect(ts.isPropertyAssignment(property)).toBe(true);
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) {
      throw new Error('Evaluated loop options permit only non-computed property assignments');
    }
    const key = property.name.text;
    expect(expectedKeys).toContain(key);
    expect(seen.has(key)).toBe(false);
    seen.add(key);
    actualKeys.push(key);
    if (key === 'afterLoop') {
      expect(ts.isArrowFunction(property.initializer)).toBe(true);
      if (!ts.isArrowFunction(property.initializer)) continue;
      expect(property.initializer.modifiers?.some((item) => item.kind === ts.SyntaxKind.AsyncKeyword)).toBe(true);
      expect(property.initializer.parameters).toHaveLength(0);
      expect(ts.isBlock(property.initializer.body)).toBe(true);
    } else {
      expect(property.initializer.getText(sourceFile)).toBe(expectedInitializers[key]);
    }
  }
  expect(actualKeys).toEqual(expectedKeys);
}

function isTargetValue(
  expression: ts.Expression,
  analysis: Analysis,
  targetSymbols: ReadonlySet<ts.Symbol>,
): boolean {
  const value = unwrap(expression);
  if (ts.isIdentifier(value)) return nodeRefersToTarget(value, analysis, targetSymbols);
  if (ts.isPropertyAccessExpression(value)) {
    return nodeRefersToTarget(value.name, analysis, targetSymbols);
  }
  return ts.isElementAccessExpression(value)
    && nodeRefersToTarget(value.argumentExpression, analysis, targetSymbols);
}

function nodeRefersToTarget(
  node: ts.Node,
  analysis: Analysis,
  targetSymbols: ReadonlySet<ts.Symbol>,
): boolean {
  let symbol = analysis.checker.getSymbolAtLocation(node);
  if (symbol === undefined) return false;
  if (targetSymbols.has(symbol)) return true;
  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    symbol = analysis.checker.getAliasedSymbol(symbol);
  }
  return targetSymbols.has(symbol);
}

function resolvesToTargetModule(specifier: string, node: ts.Node, analysis: Analysis): boolean {
  const resolved = resolveModule(specifier, node.getSourceFile().fileName, analysis);
  if (resolved === undefined) return false;
  const module = analysis.program.getSourceFile(resolved);
  if (module === undefined) return false;
  const symbol = analysis.checker.getSymbolAtLocation(module);
  return symbol !== undefined && analysis.checker.getExportsOfModule(symbol)
    .some((item) => item.name === TARGET_NAME);
}

function resolveModule(specifier: string, containingFile: string, analysis: Analysis): string | undefined {
  const resolved = ts.resolveModuleName(specifier, containingFile, analysis.options, ts.sys)
    .resolvedModule?.resolvedFileName;
  return resolved === undefined ? undefined : path.resolve(resolved);
}

function importHasRuntimeValue(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (clause === undefined) return true;
  if (clause.isTypeOnly) return false;
  if (clause.name !== undefined || clause.namedBindings === undefined
    || ts.isNamespaceImport(clause.namedBindings)) return true;
  return clause.namedBindings.elements.some((element) => !element.isTypeOnly);
}

function exportHasRuntimeValue(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return false;
  return node.exportClause === undefined || ts.isNamespaceExport(node.exportClause)
    || node.exportClause.elements.some((element) => !element.isTypeOnly);
}

function isStaticDynamicImport(node: ts.Node): node is ts.CallExpression & { arguments: [ts.StringLiteral] } {
  return ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
    && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]);
}

function bindingIdentifiers(binding: ts.BindingName | ts.Expression): ts.Identifier[] {
  if (ts.isIdentifier(binding)) return [binding];
  if (ts.isObjectBindingPattern(binding) || ts.isArrayBindingPattern(binding)) {
    return binding.elements.flatMap((element) => ts.isOmittedExpression(element)
      ? [] : bindingIdentifiers(element.name));
  }
  return [];
}

function occurrence(sourceFile: ts.SourceFile, node: ts.Node, role: OccurrenceRole): TargetOccurrence {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { file: relative(sourceFile.fileName), line: position.line + 1, column: position.character + 1, role };
}

function location(sourceFile: ts.SourceFile, node: ts.Node): string {
  const item = occurrence(sourceFile, node, 'reference');
  return `${item.file}:${item.line}:${item.column}`;
}

function compareOccurrences(left: TargetOccurrence, right: TargetOccurrence): number {
  return left.file.localeCompare(right.file) || left.line - right.line || left.column - right.column
    || left.role.localeCompare(right.role);
}

function runtimeSourceFiles(analysis: Analysis): ts.SourceFile[] {
  return [...analysis.sourcePaths].sort().map((file) => analysis.program.getSourceFile(file)!);
}

function containingFunctionName(node: ts.Node): string {
  for (let parent = node.parent; parent !== undefined; parent = parent.parent) {
    if (ts.isFunctionDeclaration(parent) && parent.name !== undefined) return parent.name.text;
  }
  return '<module>';
}

function unwrap(expression: ts.Expression): ts.Expression {
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression) || ts.isNonNullExpression(expression)
    || ts.isSatisfiesExpression(expression)) return unwrap(expression.expression);
  return expression;
}

function isInside(node: ts.Node, parent: ts.Node): boolean {
  return node.pos >= parent.pos && node.end <= parent.end;
}

async function sourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(target));
    else if (SOURCE_EXTENSION.test(entry.name)) files.push(target);
  }
  return files;
}

function relative(file: string): string {
  return path.relative(path.resolve('.'), file).split(path.sep).join('/');
}

function formatDiagnostic(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}
