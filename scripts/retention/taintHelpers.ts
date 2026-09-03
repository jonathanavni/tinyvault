import ts from 'typescript';

type TsBindingName = import('typescript').BindingName;
type TsCallExpression = import('typescript').CallExpression;
type TsExpression = import('typescript').Expression;
type TsFunctionDeclaration = import('typescript').FunctionDeclaration;
type TsFunctionLikeDeclaration = import('typescript').FunctionLikeDeclaration;
type TsIdentifier = import('typescript').Identifier;
type TsNode = import('typescript').Node;
type TsSourceFile = import('typescript').SourceFile;
type TsSyntaxKind = import('typescript').SyntaxKind;

/** AST predicates and taint-reference helpers shared by the retention rules (split out of rules.ts at the 800-line gate,
 *  hygiene 2026-09-03; pure moves, no behaviour change). */
export function isPinnedDestinationInject(
  call: TsCallExpression,
  owner: TsFunctionLikeDeclaration,
  tainted: ReadonlySet<string>,
): boolean {
  return ts.isPropertyAccessExpression(call.expression)
    && call.expression.name.text === 'inject'
    && ts.isIdentifier(call.expression.expression)
    && call.expression.expression.text === 'destination'
    && owner.parameters.some((parameter) => ts.isIdentifier(parameter.name)
      && parameter.name.text === 'destination')
    && call.arguments.some((argument) => isDirectTaintReference(argument, tainted));
}

export function isPinnedDestinationInjectExpression(
  expression: TsExpression,
  owner: TsFunctionLikeDeclaration,
  tainted: ReadonlySet<string>,
): boolean {
  const unwrapped = unwrap(expression);
  return ts.isCallExpression(unwrapped) && isPinnedDestinationInject(unwrapped, owner, tainted);
}

export function isPinnedInjectArgument(
  identifier: TsIdentifier,
  owner: TsFunctionLikeDeclaration,
  tainted: ReadonlySet<string>,
): boolean {
  return ts.isCallExpression(identifier.parent) && identifier.parent.arguments.includes(identifier)
    && isPinnedDestinationInject(identifier.parent, owner, tainted);
}

export function isSecretClear(identifier: TsIdentifier): boolean {
  const access = identifier.parent;
  return ts.isPropertyAccessExpression(access) && access.expression === identifier
    && access.name.text === 'clear' && ts.isCallExpression(access.parent)
    && access.parent.expression === access;
}

export function isDirectConstAlias(identifier: TsIdentifier, owner: TsFunctionLikeDeclaration): boolean {
  const declaration = identifier.parent;
  if (!ts.isVariableDeclaration(declaration) || declaration.initializer !== identifier
    || enclosingFunction(declaration) !== owner) return false;
  const list = declaration.parent;
  return ts.isIdentifier(declaration.name) && ts.isVariableDeclarationList(list)
    && (list.flags & ts.NodeFlags.Const) !== 0;
}

export function isSeedAssignmentTarget(identifier: TsIdentifier, seeds: ReadonlySet<TsNode>): boolean {
  const parent = identifier.parent;
  return ts.isBinaryExpression(parent) && parent.left === identifier && seeds.has(parent);
}

export function secretResultCarrier(call: TsCallExpression): TsExpression {
  let carrier: TsExpression = call;
  while (ts.isAwaitExpression(carrier.parent) || ts.isParenthesizedExpression(carrier.parent)
    || ts.isAsExpression(carrier.parent) || ts.isTypeAssertionExpression(carrier.parent)
    || ts.isNonNullExpression(carrier.parent)) carrier = carrier.parent;
  return carrier;
}

export function isDirectTaintReference(expression: TsExpression, tainted: ReadonlySet<string>): boolean {
  const unwrapped = unwrap(expression);
  return ts.isIdentifier(unwrapped) && tainted.has(unwrapped.text);
}

export function unwrap(expression: TsExpression): TsExpression {
  let current = expression;
  while (ts.isAwaitExpression(current) || ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current) || ts.isTypeAssertionExpression(current)
    || ts.isNonNullExpression(current)) current = current.expression;
  return current;
}

export function isIdentifierCall(expression: TsExpression, name: string): boolean {
  const unwrapped = unwrap(expression);
  return ts.isCallExpression(unwrapped) && ts.isIdentifier(unwrapped.expression)
    && unwrapped.expression.text === name;
}

export function containsIdentifierCall(node: TsNode, name: string): boolean {
  return isIdentifierCall(node as TsExpression, name)
    || node.getChildren().some((child) => containsIdentifierCall(child, name));
}

export function isWithinCallArgument(node: TsNode, name: string): boolean {
  for (let current: TsNode = node; current.parent; current = current.parent) {
    const parent = current.parent;
    if (ts.isCallExpression(parent)) {
      return ts.isIdentifier(parent.expression) && parent.expression.text === name
        && parent.arguments.some((argument) => containsNode(argument, node));
    }
    if (isExecutableFunction(parent)) return false;
  }
  return false;
}

export function moduleFunction(file: TsSourceFile, name: string): TsFunctionDeclaration | undefined {
  const matches = file.statements.filter((statement): statement is TsFunctionDeclaration =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  return matches.length === 1 ? matches[0] : undefined;
}

export function isResolveSecretCall(node: TsNode): node is TsCallExpression {
  return ts.isCallExpression(node)
    && ((ts.isIdentifier(node.expression) && node.expression.text === 'resolveSecret')
      || (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'resolveSecret'));
}

export function addBindings(tainted: Set<string>, name: TsBindingName): boolean {
  let changed = false;
  for (const binding of bindingNames(name)) {
    if (!tainted.has(binding)) {
      tainted.add(binding);
      changed = true;
    }
  }
  return changed;
}

export function isFunctionLocal(name: string, owner: TsFunctionLikeDeclaration): boolean {
  if (owner.parameters.some((parameter) => bindingNames(parameter.name).includes(name))) return true;
  return descendants(owner).some((node) => ts.isVariableDeclaration(node)
    && bindingNames(node.name).includes(name) && enclosingFunction(node) === owner);
}

export function referencesTaint(node: TsNode, tainted: ReadonlySet<string>): boolean {
  if (ts.isIdentifier(node) && tainted.has(node.text) && isReference(node)) return true;
  return node.getChildren().some((child) => referencesTaint(child, tainted));
}

export function isReference(identifier: TsIdentifier): boolean {
  const parent = identifier.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === identifier) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === identifier) return false;
  if (ts.isVariableDeclaration(parent) && parent.name === identifier) return false;
  if (ts.isBindingElement(parent) && parent.name === identifier) return false;
  if (ts.isParameter(parent) && parent.name === identifier) return false;
  return true;
}

export function bindingNames(name: TsBindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) => ts.isOmittedExpression(element) ? [] : bindingNames(element.name));
}

export function descendants(root: TsNode): TsNode[] {
  const nodes: TsNode[] = [];
  const visit = (node: TsNode): void => { nodes.push(node); node.forEachChild(visit); };
  root.forEachChild(visit);
  return nodes;
}

export function containsNode(root: TsNode, target: TsNode): boolean {
  return root === target || root.getChildren().some((child) => containsNode(child, target));
}

export function isConsumeCall(node: TsNode): node is TsCallExpression {
  return ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === 'consume';
}

export function enclosingFunction(node: TsNode): TsFunctionLikeDeclaration | undefined {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (isExecutableFunction(parent)) return parent;
  }
  return undefined;
}

export function isExecutableFunction(node: TsNode): node is TsFunctionLikeDeclaration {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node) || ts.isConstructorDeclaration(node);
}

export function isAssignment(kind: TsSyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

export function parse(source: string, fileName: string): TsSourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

export function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
