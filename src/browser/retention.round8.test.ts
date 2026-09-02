import { readFile } from 'node:fs/promises';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const LOCAL_FILE_PLAINTEXT_OCCURRENCES = [
  'open-assignment', 'secret-argument', 'undefined-guard', 'memzero',
] as const;

export function roundEightViolations(source: string, fileName: string): string[] {
  const file = parse(source, fileName);
  if (fileName.endsWith('src/backends/localFile.ts')) return inspectLocalFile(file);
  const violations = inspectSecretTypedBindings(file, fileName);
  const consume = descendants(file).find(isConsumeCall);
  if (consume === undefined) return violations;
  const owner = enclosingFunction(consume);
  if (owner === undefined) return [...violations, 'consume call has no function owner'];
  const value = consumeResultBinding(consume);
  if (value === undefined) return [...violations, 'consume result must initialise a const'];
  const tainted = collectTaint(owner, new Set([value]), true);
  violations.push(...inspectControlAndProperties(owner, tainted));
  const helper = moduleFunction(file, 'toFixedHex');
  if (helper === undefined) violations.push('toFixedHex must be one analysed module function');
  else {
    const helperTaint = collectTaint(
      helper,
      new Set(helper.parameters.flatMap((parameter) => bindingNames(parameter.name))),
    );
    violations.push(...inspectControlAndProperties(helper, helperTaint));
  }
  const sink = moduleFunction(file, 'callFunctionOn');
  if (sink === undefined) violations.push('callFunctionOn must be one module function');
  else violations.push(...inspectCdpSink(sink));
  return unique(violations);
}

export function isRoundEightConditionOccurrence(
  identifier: ts.Identifier,
  owner: ts.FunctionLikeDeclaration,
): boolean {
  const statement = containingIfCondition(identifier, owner);
  return statement !== undefined && isFixedReturnConsequent(statement);
}

function inspectControlAndProperties(
  owner: ts.FunctionLikeDeclaration,
  tainted: ReadonlySet<string>,
): string[] {
  const violations: string[] = [];
  for (const node of descendants(owner)) {
    if (!ts.isIdentifier(node) || !tainted.has(node.text) || !isReference(node)) continue;
    if (hasForbiddenControlContext(node, owner)) {
      violations.push(`secret-derived control flow is not a fixed-return if: ${node.text}`);
    }
    const access = node.parent;
    if (!ts.isPropertyAccessExpression(access) || access.expression !== node) continue;
    if (!propertyReadAllowed(access, node, owner)) {
      violations.push(`secret-derived property read is not allowlisted: ${access.name.text}`);
    }
  }
  return violations;
}

function hasForbiddenControlContext(
  identifier: ts.Identifier,
  owner: ts.FunctionLikeDeclaration,
): boolean {
  for (let current: ts.Node = identifier; current.parent && current.parent !== owner; current = current.parent) {
    const parent = current.parent;
    if (isExecutableFunction(parent)) return true;
    if (ts.isIfStatement(parent) && containsNode(parent.expression, identifier)) {
      return !isFixedReturnConsequent(parent);
    }
    if ((ts.isWhileStatement(parent) || ts.isDoStatement(parent))
      && containsNode(parent.expression, identifier)) return true;
    if (ts.isForStatement(parent) && parent.condition !== undefined
      && containsNode(parent.condition, identifier)) return true;
    if ((ts.isForOfStatement(parent) || ts.isForInStatement(parent))
      && containsNode(parent.expression, identifier)) return true;
    if (ts.isConditionalExpression(parent) && containsNode(parent.condition, identifier)) return true;
    if (ts.isSwitchStatement(parent) && containsNode(parent.expression, identifier)) return true;
    if (ts.isBinaryExpression(parent) && isLogicalAssignment(parent.operatorToken.kind)) return true;
    if (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) {
      if (parent.operator === ts.SyntaxKind.PlusPlusToken
        || parent.operator === ts.SyntaxKind.MinusMinusToken) return true;
    }
  }
  return false;
}

function propertyReadAllowed(
  access: ts.PropertyAccessExpression,
  identifier: ts.Identifier,
  owner: ts.FunctionLikeDeclaration,
): boolean {
  if (access.name.text === 'includes') {
    const call = access.parent;
    const argument = ts.isCallExpression(call) ? call.arguments[0] : undefined;
    return ts.isCallExpression(call) && call.expression === access
      && argument !== undefined && ts.isStringLiteral(argument)
      && (argument.text === '\n' || argument.text === '\r')
      && isRoundEightConditionOccurrence(identifier, owner);
  }
  if (access.name.text === 'length') {
    return isRoundEightConditionOccurrence(identifier, owner) || isStringConstInitializer(access, owner);
  }
  if (!['padStart', 'padEnd', 'charCodeAt'].includes(access.name.text)
    || !isNamedFunction(owner, 'toFixedHex')) return false;
  const call = access.parent;
  if (!ts.isCallExpression(call) || call.expression !== access) return false;
  return isInsideConstInitializer(call, owner) || isInsideReturnedLocalAccumulator(call, owner);
}

function isStringConstInitializer(node: ts.Node, owner: ts.FunctionLikeDeclaration): boolean {
  for (let current = node; current.parent && current.parent !== owner; current = current.parent) {
    const parent = current.parent;
    if (isExecutableFunction(parent)) return false;
    if (ts.isCallExpression(parent) && ts.isIdentifier(parent.expression)
      && parent.expression.text === 'String' && parent.arguments.some((argument) => containsNode(argument, node))) {
      return isInsideConstInitializer(parent, owner);
    }
  }
  return false;
}

function isInsideConstInitializer(node: ts.Node, owner: ts.FunctionLikeDeclaration): boolean {
  for (let current = node; current.parent && current.parent !== owner; current = current.parent) {
    const parent = current.parent;
    if (isExecutableFunction(parent)) return false;
    if (!ts.isVariableDeclaration(parent) || parent.initializer === undefined
      || !containsNode(parent.initializer, node)) continue;
    const list = parent.parent;
    return ts.isIdentifier(parent.name) && ts.isVariableDeclarationList(list)
      && (list.flags & ts.NodeFlags.Const) !== 0;
  }
  return false;
}

function isInsideReturnedLocalAccumulator(node: ts.Node, owner: ts.FunctionLikeDeclaration): boolean {
  for (let current = node; current.parent && current.parent !== owner; current = current.parent) {
    const parent = current.parent;
    if (!ts.isBinaryExpression(parent) || !isAssignment(parent.operatorToken.kind)
      || !ts.isIdentifier(parent.left) || !isFunctionLocal(parent.left.text, owner)) continue;
    const accumulatorName = parent.left.text;
    return descendants(owner).some((candidate) => {
      if (!ts.isReturnStatement(candidate) || candidate.expression === undefined) return false;
      const returned = unwrap(candidate.expression);
      return ts.isIdentifier(returned) && returned.text === accumulatorName;
    });
  }
  return false;
}

function inspectCdpSink(owner: ts.FunctionDeclaration): string[] {
  const violations: string[] = [];
  const parameterNames = new Set(owner.parameters.flatMap((parameter) => bindingNames(parameter.name)));
  const derived = collectTaint(owner, parameterNames);
  const calls = descendants(owner).filter((node): node is ts.CallExpression => ts.isCallExpression(node));
  const sends = calls.filter(isCdpSend);
  if (sends.length !== 1) violations.push(`expected one cdp.send call, got ${sends.length}`);
  for (const call of calls) {
    if (isCdpSend(call)) continue;
    if (referencesTaint(call.expression, derived)
      || call.arguments.some((argument) => referencesTaint(argument, derived))) {
      violations.push('callFunctionOn parameter-derived data reaches another call');
    }
  }
  for (const node of descendants(owner)) {
    if (ts.isBinaryExpression(node) && isAssignment(node.operatorToken.kind)
      && (!ts.isIdentifier(node.left) || !isFunctionLocal(node.left.text, owner))) {
      violations.push('callFunctionOn writes member or non-local state');
    }
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
      && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)
      && (!ts.isIdentifier(node.operand) || !isFunctionLocal(node.operand.text, owner))) {
      violations.push('callFunctionOn updates member or non-local state');
    }
    if (ts.isDeleteExpression(node) && (ts.isPropertyAccessExpression(node.expression)
      || ts.isElementAccessExpression(node.expression))) {
      violations.push('callFunctionOn deletes member state');
    }
  }
  const statements = owner.body?.statements ?? [];
  for (const statement of statements) {
    if (ts.isReturnStatement(statement)) continue;
    if (!ts.isVariableStatement(statement)
      || (statement.declarationList.flags & ts.NodeFlags.Const) === 0) {
      violations.push('callFunctionOn contains a statement outside const initialisers and return');
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.initializer === undefined || !referencesTaint(declaration.initializer, derived)) {
        violations.push('callFunctionOn const initialiser must derive from its parameters');
      }
    }
  }
  const returns: ts.ReturnStatement[] = [];
  for (const statement of statements) if (ts.isReturnStatement(statement)) returns.push(statement);
  const returned = returns[0]?.expression;
  if (returns.length !== 1 || returned === undefined || !referencesTaint(returned, derived)) {
    violations.push('callFunctionOn must return its send result or a derived const');
  }
  return violations;
}

function inspectSecretTypedBindings(file: ts.SourceFile, fileName: string): string[] {
  if (!fileName.endsWith('src/browser/session.ts')) return [];
  const violations: string[] = [];
  for (const declaration of descendants(file).filter(isSecretTypedBinding)) {
    for (const name of bindingNames(declaration.name)) {
      const owner = enclosingFunction(declaration);
      if (owner === undefined) {
        violations.push('Secret binding must be function-local');
        continue;
      }
      let consumes = 0;
      for (const node of descendants(owner)) {
        if (!ts.isIdentifier(node) || node.text !== name || !isReference(node)) continue;
        if (isDirectConsumeConst(node, owner)) consumes += 1;
        else violations.push(`Secret object occurrence is outside direct consume: ${name}`);
      }
      if (consumes !== 1) violations.push(`Secret binding ${name} must have exactly one direct consume`);
    }
  }
  return violations;
}

function inspectLocalFile(file: ts.SourceFile): string[] {
  const violations: string[] = [];
  const constructions = descendants(file).filter((node): node is ts.NewExpression =>
    ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Secret');
  if (constructions.length !== 1) return [`expected one local-file Secret construction, got ${constructions.length}`];
  const names = new Set(descendants(constructions[0]!).filter((node): node is ts.Identifier =>
    ts.isIdentifier(node) && isReference(node) && isFunctionLocal(node.text, enclosingFunction(node)!))
    .map((node) => node.text));
  if (!names.has('plaintext') || names.size !== 1) {
    violations.push(`unexpected local-file plaintext binding set: ${[...names].join(',')}`);
  }
  const occurrences: string[] = [];
  const owner = enclosingFunction(constructions[0]!);
  if (owner === undefined) return [...violations, 'local-file Secret construction must be function-local'];
  for (const node of descendants(owner)) {
    if (!ts.isIdentifier(node) || !names.has(node.text) || !isReference(node)) continue;
    occurrences.push(localFileOccurrence(node, constructions[0]!));
  }
  if (JSON.stringify(occurrences) !== JSON.stringify(LOCAL_FILE_PLAINTEXT_OCCURRENCES)) {
    violations.push(`local-file plaintext occurrences changed: ${occurrences.join(',')}`);
  }
  return violations;
}

function localFileOccurrence(identifier: ts.Identifier, construction: ts.NewExpression): string {
  if (construction.arguments?.some((argument) => containsNode(argument, identifier))) return 'secret-argument';
  const parent = identifier.parent;
  if (ts.isBinaryExpression(parent) && parent.left === identifier
    && ts.isAwaitExpression(parent.right) && ts.isCallExpression(parent.right.expression)
    && ts.isPropertyAccessExpression(parent.right.expression.expression)
    && parent.right.expression.expression.name.text === 'open') return 'open-assignment';
  if (ts.isBinaryExpression(parent) && parent.left === identifier
    && parent.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken
    && ts.isIdentifier(parent.right) && parent.right.text === 'undefined') return 'undefined-guard';
  if (ts.isCallExpression(parent) && parent.arguments.includes(identifier)
    && ts.isPropertyAccessExpression(parent.expression)
    && parent.expression.name.text === 'memzero') return 'memzero';
  if (isInsideConstInitializer(identifier, enclosingFunction(identifier)!)) return 'const-initializer';
  return `forbidden:${parent.getText()}`;
}

function isDirectConsumeConst(identifier: ts.Identifier, owner: ts.FunctionLikeDeclaration): boolean {
  const access = identifier.parent;
  if (!ts.isPropertyAccessExpression(access) || access.expression !== identifier
    || access.name.text !== 'consume' || !ts.isCallExpression(access.parent)
    || access.parent.expression !== access) return false;
  return isInsideConstInitializer(access.parent, owner);
}

function containingIfCondition(
  identifier: ts.Identifier,
  owner: ts.FunctionLikeDeclaration,
): ts.IfStatement | undefined {
  for (let current: ts.Node = identifier; current.parent && current.parent !== owner; current = current.parent) {
    if (isExecutableFunction(current.parent)) return undefined;
    if (ts.isIfStatement(current.parent) && containsNode(current.parent.expression, identifier)) {
      return current.parent;
    }
  }
  return undefined;
}

function isFixedReturnConsequent(statement: ts.IfStatement): boolean {
  if (statement.elseStatement !== undefined) return false;
  const consequent = ts.isBlock(statement.thenStatement)
    ? statement.thenStatement.statements.length === 1 ? statement.thenStatement.statements[0] : undefined
    : statement.thenStatement;
  if (!consequent || !ts.isReturnStatement(consequent) || consequent.expression === undefined) return false;
  const expression = unwrap(consequent.expression);
  return ts.isCallExpression(expression)
    ? ts.isIdentifier(expression.expression) && expression.arguments.length === 0
    : ts.isLiteralExpression(expression) || expression.kind === ts.SyntaxKind.TrueKeyword
      || expression.kind === ts.SyntaxKind.FalseKeyword || ts.isObjectLiteralExpression(expression);
}

function consumeResultBinding(call: ts.CallExpression): string | undefined {
  const declaration = call.parent;
  if (!ts.isVariableDeclaration(declaration) || declaration.initializer !== call
    || !ts.isIdentifier(declaration.name)) return undefined;
  const list = declaration.parent;
  return ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.Const) !== 0
    ? declaration.name.text : undefined;
}

function collectTaint(
  owner: ts.FunctionLikeDeclaration,
  initial: Set<string>,
  stopAtCdpSink = false,
): Set<string> {
  const tainted = new Set(initial);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of descendants(owner)) {
      if (ts.isVariableDeclaration(node) && node.initializer !== undefined
        && referencesTaint(node.initializer, tainted)
        && !(stopAtCdpSink && containsIdentifierCall(node.initializer, 'callFunctionOn'))) {
        changed = addBindings(tainted, node.name) || changed;
      }
      if (ts.isBinaryExpression(node) && isAssignment(node.operatorToken.kind)
        && ts.isIdentifier(node.left) && referencesTaint(node.right, tainted)
        && !(stopAtCdpSink && containsIdentifierCall(node.right, 'callFunctionOn'))
        && !tainted.has(node.left.text)) {
        tainted.add(node.left.text);
        changed = true;
      }
    }
  }
  return tainted;
}

function containsIdentifierCall(node: ts.Node, name: string): boolean {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name
    || node.getChildren().some((child) => containsIdentifierCall(child, name));
}

function isCdpSend(call: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(call.expression) || call.expression.name.text !== 'send') return false;
  const receiver = call.expression.expression;
  return ts.isIdentifier(receiver) && receiver.text === 'cdp'
    || ts.isPropertyAccessExpression(receiver) && ts.isIdentifier(receiver.expression)
      && receiver.expression.text === 'state' && receiver.name.text === 'cdp';
}

function isSecretTypedBinding(
  node: ts.Node,
): node is ts.ParameterDeclaration | ts.VariableDeclaration {
  return (ts.isParameter(node) || ts.isVariableDeclaration(node))
    && node.type !== undefined && node.type.getText() === 'Secret';
}

function moduleFunction(file: ts.SourceFile, name: string): ts.FunctionDeclaration | undefined {
  const found = file.statements.filter((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === name);
  return found.length === 1 ? found[0] : undefined;
}

function isNamedFunction(owner: ts.FunctionLikeDeclaration, name: string): boolean {
  return ts.isFunctionDeclaration(owner) && owner.name?.text === name;
}

function isFunctionLocal(name: string, owner: ts.FunctionLikeDeclaration): boolean {
  return owner.parameters.some((parameter) => bindingNames(parameter.name).includes(name))
    || descendants(owner).some((node) => ts.isVariableDeclaration(node)
      && bindingNames(node.name).includes(name) && enclosingFunction(node) === owner);
}

function referencesTaint(node: ts.Node, tainted: ReadonlySet<string>): boolean {
  return ts.isIdentifier(node) && tainted.has(node.text) && isReference(node)
    || node.getChildren().some((child) => referencesTaint(child, tainted));
}

function isReference(identifier: ts.Identifier): boolean {
  const parent = identifier.parent;
  return !(ts.isPropertyAccessExpression(parent) && parent.name === identifier)
    && !(ts.isPropertyAssignment(parent) && parent.name === identifier)
    && !(ts.isVariableDeclaration(parent) && parent.name === identifier)
    && !(ts.isBindingElement(parent) && parent.name === identifier)
    && !(ts.isParameter(parent) && parent.name === identifier);
}

function addBindings(tainted: Set<string>, name: ts.BindingName): boolean {
  let changed = false;
  for (const binding of bindingNames(name)) {
    if (!tainted.has(binding)) {
      tainted.add(binding);
      changed = true;
    }
  }
  return changed;
}

function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) => ts.isOmittedExpression(element) ? [] : bindingNames(element.name));
}

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isAwaitExpression(current) || ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current) || ts.isTypeAssertionExpression(current)
    || ts.isNonNullExpression(current)) current = current.expression;
  return current;
}

function containsNode(root: ts.Node, target: ts.Node): boolean {
  return root === target || root.getChildren().some((child) => containsNode(child, target));
}

function descendants(root: ts.Node): ts.Node[] {
  const nodes: ts.Node[] = [];
  const visit = (node: ts.Node): void => { nodes.push(node); node.forEachChild(visit); };
  root.forEachChild(visit);
  return nodes;
}

function enclosingFunction(node: ts.Node): ts.FunctionLikeDeclaration | undefined {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (isExecutableFunction(parent)) return parent;
  }
  return undefined;
}

function isExecutableFunction(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node) || ts.isConstructorDeclaration(node);
}

function isConsumeCall(node: ts.Node): node is ts.CallExpression {
  return ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === 'consume';
}

function isAssignment(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

function isLogicalAssignment(kind: ts.SyntaxKind): boolean {
  return kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken
    || kind === ts.SyntaxKind.BarBarEqualsToken || kind === ts.SyntaxKind.QuestionQuestionEqualsToken;
}

function parse(source: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

describe('retention rule round-eight support', () => {
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
    const mutations = [
      'const alias = secret; void alias;',
      "Reflect.get(secret, 'consume');",
      'const copy = { ...secret }; void copy;',
      'secret.clear();',
      "secret['consume']();",
    ];
    for (const mutation of mutations) {
      expect(roundEightViolations(source.replace(marker, `${marker}\n  ${mutation}`), fileName), mutation)
        .not.toEqual([]);
    }
  });
});
