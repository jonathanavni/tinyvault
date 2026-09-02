import ts from 'typescript';

type TsBindingName = import('typescript').BindingName;
type TsCallExpression = import('typescript').CallExpression;
type TsExpression = import('typescript').Expression;
type TsFunctionDeclaration = import('typescript').FunctionDeclaration;
type TsFunctionLikeDeclaration = import('typescript').FunctionLikeDeclaration;
type TsIdentifier = import('typescript').Identifier;
type TsIfStatement = import('typescript').IfStatement;
type TsNewExpression = import('typescript').NewExpression;
type TsNode = import('typescript').Node;
type TsParameterDeclaration = import('typescript').ParameterDeclaration;
type TsPropertyAccessExpression = import('typescript').PropertyAccessExpression;
type TsSourceFile = import('typescript').SourceFile;
type TsStatement = import('typescript').Statement;
type TsSyntaxKind = import('typescript').SyntaxKind;
type TsTryStatement = import('typescript').TryStatement;
type TsVariableDeclaration = import('typescript').VariableDeclaration;

const LOCAL_FILE_PLAINTEXT_OCCURRENCES = [
  'open-assignment', 'secret-argument', 'undefined-guard', 'memzero',
] as const;
const FIXED_OUTCOME_CONSTRUCTORS = new Set([
  'tooLongOutcome', 'unplaceableOutcome', 'transportOutcome',
]);

export function roundEightViolations(source: string, fileName: string): string[] {
  const file = parse(source, fileName);
  const violations = inspectSecretMutations(file);
  if (fileName.endsWith('src/backends/localFile.ts')) return [...violations, ...inspectLocalFile(file)];
  violations.push(...inspectSecretTypedBindings(file, fileName));
  const consume = descendants(file).find(isConsumeCall);
  if (consume === undefined) return violations;
  const owner = enclosingFunction(consume);
  if (owner === undefined) return [...violations, 'consume call has no function owner'];
  const value = consumeResultBinding(consume);
  if (value === undefined) return [...violations, 'consume result must initialise a const'];
  const tainted = collectTaint(owner, new Set([value]), true);
  violations.push(...inspectControlAndProperties(owner, tainted));
  violations.push(...inspectTaintedTryStatements(owner, tainted));
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
  identifier: TsIdentifier,
  owner: TsFunctionLikeDeclaration,
): boolean {
  const statement = containingIfCondition(identifier, owner);
  return statement !== undefined && isFixedReturnConsequent(statement);
}

function inspectControlAndProperties(
  owner: TsFunctionLikeDeclaration,
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
  identifier: TsIdentifier,
  owner: TsFunctionLikeDeclaration,
): boolean {
  for (let current: TsNode = identifier; current.parent && current.parent !== owner; current = current.parent) {
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
  access: TsPropertyAccessExpression,
  identifier: TsIdentifier,
  owner: TsFunctionLikeDeclaration,
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

function isStringConstInitializer(node: TsNode, owner: TsFunctionLikeDeclaration): boolean {
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

function isInsideConstInitializer(node: TsNode, owner: TsFunctionLikeDeclaration): boolean {
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

function isInsideReturnedLocalAccumulator(node: TsNode, owner: TsFunctionLikeDeclaration): boolean {
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

function inspectCdpSink(owner: TsFunctionDeclaration): string[] {
  const violations: string[] = [];
  const parameterNames = new Set(owner.parameters.flatMap((parameter) => bindingNames(parameter.name)));
  const derived = collectTaint(owner, parameterNames);
  const calls = descendants(owner).filter((node): node is TsCallExpression => ts.isCallExpression(node));
  const sends = calls.filter(isCdpSend);
  if (sends.length !== 1) violations.push(`expected one cdp.send call, got ${sends.length}`);
  for (const call of calls) {
    if (isCdpSend(call) || isCdpGuardCall(call, owner)) continue;
    if (referencesTaint(call.expression, derived)
      || call.arguments.some((argument) => referencesTaint(argument, derived))) {
      violations.push('callFunctionOn parameter-derived data reaches another call');
    }
  }
  violations.push(...inspectCdpWrites(owner));
  const statements = owner.body?.statements ?? [];
  for (const statement of statements) violations.push(...classifyCdpStatement(statement, owner, derived));
  if (statements.filter(ts.isIfStatement).length !== 1) {
    violations.push('callFunctionOn must have exactly one fail-closed guard');
  }
  if (statements.filter(ts.isReturnStatement).length !== 1) {
    violations.push('callFunctionOn must have exactly one direct return');
  }
  return violations;
}

function classifyCdpStatement(
  statement: TsStatement,
  owner: TsFunctionDeclaration,
  derived: ReadonlySet<string>,
): string[] {
  if (ts.isIfStatement(statement)) {
    return isAllowedCdpGuard(statement) ? [] : ['callFunctionOn contains a non-allowlisted guard'];
  }
  if (ts.isReturnStatement(statement)) {
    return statement.expression !== undefined && isCdpResultReturn(statement.expression, owner)
      ? [] : ['callFunctionOn must return only its send result value or a const bound to it'];
  }
  if (!ts.isVariableStatement(statement)
    || (statement.declarationList.flags & ts.NodeFlags.Const) === 0) {
    return ['callFunctionOn contains a statement outside const initialisers, the guard, and return'];
  }
  return statement.declarationList.declarations.flatMap((declaration) =>
    declaration.initializer !== undefined && referencesTaint(declaration.initializer, derived)
      ? [] : ['callFunctionOn const initialiser must derive from its parameters']);
}

function inspectCdpWrites(owner: TsFunctionDeclaration): string[] {
  const violations: string[] = [];
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
      || ts.isElementAccessExpression(node.expression))) violations.push('callFunctionOn deletes member state');
  }
  return violations;
}

function isAllowedCdpGuard(statement: TsIfStatement): boolean {
  if (statement.elseStatement !== undefined) return false;
  const consequent = ts.isBlock(statement.thenStatement)
    ? statement.thenStatement.statements.length === 1 ? statement.thenStatement.statements[0] : undefined
    : statement.thenStatement;
  if (!consequent || !ts.isThrowStatement(consequent) || consequent.expression === undefined) return false;
  const thrown = unwrap(consequent.expression);
  if (!ts.isNewExpression(thrown) || !ts.isIdentifier(thrown.expression)
    || thrown.expression.text !== 'Error' || thrown.arguments?.length !== 1
    || !ts.isStringLiteral(thrown.arguments[0]!)) return false;
  const references = descendants(statement.expression).filter((node): node is TsIdentifier =>
    ts.isIdentifier(node) && isReference(node)).map((node) => node.text);
  return references.includes('response')
    && references.every((name) => ['response', 'Object', 'undefined'].includes(name));
}

function isCdpGuardCall(call: TsCallExpression, owner: TsFunctionDeclaration): boolean {
  const statement = owner.body?.statements.find((candidate): candidate is TsIfStatement =>
    ts.isIfStatement(candidate) && containsNode(candidate.expression, call));
  return statement !== undefined && isAllowedCdpGuard(statement);
}

function isCdpResultReturn(expression: TsExpression, owner: TsFunctionDeclaration): boolean {
  const value = unwrap(expression);
  if (ts.isObjectLiteralExpression(value) || isExecutableFunction(value)) return false;
  if (expressionRootName(value) === 'response') return true;
  if (!ts.isIdentifier(value)) return false;
  const declaration = descendants(owner).find((node): node is TsVariableDeclaration =>
    ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === value.text);
  return declaration?.initializer !== undefined && expressionRootName(unwrap(declaration.initializer)) === 'response';
}

function inspectTaintedTryStatements(
  owner: TsFunctionLikeDeclaration,
  tainted: ReadonlySet<string>,
): string[] {
  const tries = descendants(owner).filter((node): node is TsTryStatement =>
    ts.isTryStatement(node) && referencesTaint(node, tainted));
  if (tries.length !== 1 || !isNamedFunction(owner, 'injectDestination')) {
    return tries.length === 0 ? [] : ['taint appears in a non-allowlisted try statement'];
  }
  const statement = tries[0]!;
  if (statement.catchClause !== undefined || statement.finallyBlock === undefined) {
    return ['the tainted inject try must have only a cleanup finally'];
  }
  const allowed = new Set(['clear', 'disposePinnedObject', 'releaseObject']);
  const calls = descendants(statement.finallyBlock).filter((node): node is TsCallExpression =>
    ts.isCallExpression(node));
  if (calls.length === 0 || calls.some((call) => {
    const name = ts.isIdentifier(call.expression) ? call.expression.text
      : ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : '';
    return !allowed.has(name) || call.arguments.some((argument) => referencesTaint(argument, tainted));
  })) return ['the tainted inject finally contains non-cleanup work'];
  return [];
}

function inspectSecretMutations(file: TsSourceFile): string[] {
  const secretBindings = new Set<string>();
  for (const node of descendants(file)) {
    if (isSecretTypedBinding(node)) for (const name of bindingNames(node.name)) secretBindings.add(name);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
      && node.initializer !== undefined && isSecretConstruction(unwrap(node.initializer))) {
      secretBindings.add(node.name.text);
    }
  }
  const violations: string[] = [];
  for (const node of descendants(file)) {
    if (ts.isBinaryExpression(node) && isAssignment(node.operatorToken.kind)
      && isSecretPropertyTarget(node.left, secretBindings)) {
      violations.push('Secret instance property write is forbidden');
    }
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)
      || !['defineProperty', 'assign'].includes(node.expression.name.text)
      || node.arguments.length === 0) continue;
    if (isSecretExpression(unwrap(node.arguments[0]!), secretBindings)) {
      violations.push('Secret instance property definition is forbidden');
    }
  }
  return unique(violations);
}

function isSecretPropertyTarget(node: TsExpression, bindings: ReadonlySet<string>): boolean {
  const target = unwrap(node);
  return (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target))
    && isSecretExpression(unwrap(target.expression), bindings);
}

function isSecretExpression(expression: TsExpression, bindings: ReadonlySet<string>): boolean {
  return ts.isIdentifier(expression) && bindings.has(expression.text) || isSecretConstruction(expression);
}

function isSecretConstruction(expression: TsExpression): boolean {
  return ts.isNewExpression(expression) && ts.isIdentifier(expression.expression)
    && expression.expression.text === 'Secret';
}

function expressionRootName(expression: TsExpression): string | undefined {
  let current = expression;
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)
    || ts.isNonNullExpression(current)) current = current.expression;
  return ts.isIdentifier(current) ? current.text : undefined;
}

function inspectSecretTypedBindings(file: TsSourceFile, fileName: string): string[] {
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

function inspectLocalFile(file: TsSourceFile): string[] {
  const violations: string[] = [];
  const constructions = descendants(file).filter((node): node is TsNewExpression =>
    ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Secret');
  if (constructions.length !== 1) return [`expected one local-file Secret construction, got ${constructions.length}`];
  const names = new Set(descendants(constructions[0]!).filter((node): node is TsIdentifier =>
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

function localFileOccurrence(identifier: TsIdentifier, construction: TsNewExpression): string {
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

function isDirectConsumeConst(identifier: TsIdentifier, owner: TsFunctionLikeDeclaration): boolean {
  const access = identifier.parent;
  if (!ts.isPropertyAccessExpression(access) || access.expression !== identifier
    || access.name.text !== 'consume' || !ts.isCallExpression(access.parent)
    || access.parent.expression !== access) return false;
  return isInsideConstInitializer(access.parent, owner);
}

function containingIfCondition(
  identifier: TsIdentifier,
  owner: TsFunctionLikeDeclaration,
): TsIfStatement | undefined {
  for (let current: TsNode = identifier; current.parent && current.parent !== owner; current = current.parent) {
    if (isExecutableFunction(current.parent)) return undefined;
    if (ts.isIfStatement(current.parent) && containsNode(current.parent.expression, identifier)) {
      return current.parent;
    }
  }
  return undefined;
}

function isFixedReturnConsequent(statement: TsIfStatement): boolean {
  if (statement.elseStatement !== undefined) return false;
  const consequent = ts.isBlock(statement.thenStatement)
    ? statement.thenStatement.statements.length === 1 ? statement.thenStatement.statements[0] : undefined
    : statement.thenStatement;
  if (!consequent || !ts.isReturnStatement(consequent) || consequent.expression === undefined) return false;
  const expression = unwrap(consequent.expression);
  return ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)
    && expression.arguments.length === 0
    && FIXED_OUTCOME_CONSTRUCTORS.has(expression.expression.text);
}

function consumeResultBinding(call: TsCallExpression): string | undefined {
  const declaration = call.parent;
  if (!ts.isVariableDeclaration(declaration) || declaration.initializer !== call
    || !ts.isIdentifier(declaration.name)) return undefined;
  const list = declaration.parent;
  return ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.Const) !== 0
    ? declaration.name.text : undefined;
}

function collectTaint(
  owner: TsFunctionLikeDeclaration,
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

function containsIdentifierCall(node: TsNode, name: string): boolean {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name
    || node.getChildren().some((child) => containsIdentifierCall(child, name));
}

function isCdpSend(call: TsCallExpression): boolean {
  if (!ts.isPropertyAccessExpression(call.expression) || call.expression.name.text !== 'send') return false;
  const receiver = call.expression.expression;
  return ts.isIdentifier(receiver) && receiver.text === 'cdp'
    || ts.isPropertyAccessExpression(receiver) && ts.isIdentifier(receiver.expression)
      && receiver.expression.text === 'state' && receiver.name.text === 'cdp';
}

function isSecretTypedBinding(
  node: TsNode,
): node is TsParameterDeclaration | TsVariableDeclaration {
  return (ts.isParameter(node) || ts.isVariableDeclaration(node))
    && node.type !== undefined && node.type.getText() === 'Secret';
}

function moduleFunction(file: TsSourceFile, name: string): TsFunctionDeclaration | undefined {
  const found = file.statements.filter((node): node is TsFunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === name);
  return found.length === 1 ? found[0] : undefined;
}

function isNamedFunction(owner: TsFunctionLikeDeclaration, name: string): boolean {
  return ts.isFunctionDeclaration(owner) && owner.name?.text === name;
}

function isFunctionLocal(name: string, owner: TsFunctionLikeDeclaration): boolean {
  return owner.parameters.some((parameter) => bindingNames(parameter.name).includes(name))
    || descendants(owner).some((node) => ts.isVariableDeclaration(node)
      && bindingNames(node.name).includes(name) && enclosingFunction(node) === owner);
}

function referencesTaint(node: TsNode, tainted: ReadonlySet<string>): boolean {
  return ts.isIdentifier(node) && tainted.has(node.text) && isReference(node)
    || node.getChildren().some((child) => referencesTaint(child, tainted));
}

function isReference(identifier: TsIdentifier): boolean {
  const parent = identifier.parent;
  return !(ts.isPropertyAccessExpression(parent) && parent.name === identifier)
    && !(ts.isPropertyAssignment(parent) && parent.name === identifier)
    && !(ts.isVariableDeclaration(parent) && parent.name === identifier)
    && !(ts.isBindingElement(parent) && parent.name === identifier)
    && !(ts.isParameter(parent) && parent.name === identifier);
}

function addBindings(tainted: Set<string>, name: TsBindingName): boolean {
  let changed = false;
  for (const binding of bindingNames(name)) {
    if (!tainted.has(binding)) {
      tainted.add(binding);
      changed = true;
    }
  }
  return changed;
}

function bindingNames(name: TsBindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) => ts.isOmittedExpression(element) ? [] : bindingNames(element.name));
}

function unwrap(expression: TsExpression): TsExpression {
  let current = expression;
  while (ts.isAwaitExpression(current) || ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current) || ts.isTypeAssertionExpression(current)
    || ts.isNonNullExpression(current)) current = current.expression;
  return current;
}

function containsNode(root: TsNode, target: TsNode): boolean {
  return root === target || root.getChildren().some((child) => containsNode(child, target));
}

function descendants(root: TsNode): TsNode[] {
  const nodes: TsNode[] = [];
  const visit = (node: TsNode): void => { nodes.push(node); node.forEachChild(visit); };
  root.forEachChild(visit);
  return nodes;
}

function enclosingFunction(node: TsNode): TsFunctionLikeDeclaration | undefined {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (isExecutableFunction(parent)) return parent;
  }
  return undefined;
}

function isExecutableFunction(node: TsNode): node is TsFunctionLikeDeclaration {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node) || ts.isConstructorDeclaration(node);
}

function isConsumeCall(node: TsNode): node is TsCallExpression {
  return ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === 'consume';
}

function isAssignment(kind: TsSyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

function isLogicalAssignment(kind: TsSyntaxKind): boolean {
  return kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken
    || kind === ts.SyntaxKind.BarBarEqualsToken || kind === ts.SyntaxKind.QuestionQuestionEqualsToken;
}

function parse(source: string, fileName: string): TsSourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
