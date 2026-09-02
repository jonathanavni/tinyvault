import ts from 'typescript';

type TsBindingName = import('typescript').BindingName;
type TsCallExpression = import('typescript').CallExpression;
type TsClassFunctionMember =
  | import('typescript').ConstructorDeclaration
  | import('typescript').GetAccessorDeclaration
  | import('typescript').MethodDeclaration
  | import('typescript').SetAccessorDeclaration;
type TsExpression = import('typescript').Expression;
type TsFunctionLikeDeclaration = import('typescript').FunctionLikeDeclaration;
type TsIdentifier = import('typescript').Identifier;
type TsNode = import('typescript').Node;
type TsSourceFile = import('typescript').SourceFile;

const PINNED_NON_LOCAL_OCCURRENCES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'src/browser/session.ts': [
    'constructor:assignment:this.#options=options',
    "initializeCdp:assignment:state.frameId=String(frame.id ?? '')",
    "initializeCdp:assignment:state.loaderId=String(frame.loaderId ?? '')",
    'isMainFrame:assignment:state.frameId=id',
    "resetDocument:assignment:state.loaderId=String(frame.loaderId ?? '')",
    'pinDestination:call:state.pinnedObjects<=objectId',
    'injectDestination:call:state.taint<={ identity, backendNodeId, epoch: state.epoch }',
    'removeTaint:assignment:state.taint=state.taint.filter((entry) => entry.identity !== identity)',
    'isolatedWorld:assignment:state.world={ epoch, executionContextId }',
  ],
  'src/core/fillService.ts': [
    'continueWithPolicy:assignment:observation.assertedMismatch=request.assertedOrigin',
    'completeInjection:assignment:observation.assigned=Object.freeze({ observedOrigin: injected.observedOrigin, controlToken: injected.controlToken, documentToken: injected.documentToken, })',
    'staleOutcome:assignment:observation.reobservedOrigin=current.origin',
    'refusedInjection:assignment:observation.reobservedOrigin=injected.observedOrigin',
  ],
  'src/backends/localFile.ts': [],
  'src/backends/localFileSodium.ts': [],
  'src/backends/localFileFormat.ts': [
    'validateRecord:call:handles<=input.handle',
  ],
  'src/core/redaction.ts': [
    'constructor:assignment:this.#value=value',
  ],
});

const REDACTION_MEMBER_OCCURRENCES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  constructor: ['write:this.#value', 'read:value'],
  expose: ['read:this.#value', 'read:this.#value'],
  consume: ['call:this.expose', 'write:this.#value', 'return:value'],
  clear: ['write:this.#value'],
  toString: [],
  toJSON: [],
  'inspect.custom': [],
});

export function inspectNonLocalAssignments(file: TsSourceFile, fileName: string): string[] {
  const expected = PINNED_NON_LOCAL_OCCURRENCES[fileName];
  if (expected === undefined) return [];
  const functions = descendants(file).filter(isExecutableFunction);
  const actual = functions.flatMap((owner) => taintedNonLocalWrites(owner)
    .map((occurrence) => `${functionLabel(owner)}:${occurrence}`));
  const violations = JSON.stringify(actual) === JSON.stringify(expected)
    ? [] : [`non-local assignment occurrences changed in ${fileName}: ${actual.join(',')}`];
  if (fileName === 'src/core/redaction.ts') violations.push(...inspectRedactionMembers(file));
  return violations;
}

function taintedNonLocalWrites(owner: TsFunctionLikeDeclaration): string[] {
  const tainted = collectDerivedLocals(owner);
  const occurrences: string[] = [];
  for (const node of directDescendants(owner)) {
    if (ts.isBinaryExpression(node) && isAssignment(node.operatorToken.kind)
      && !isLocalTarget(node.left, owner) && referencesSensitive(node.right, tainted)) {
      occurrences.push(`assignment:${compact(node.left)}=${compact(node.right)}`);
    }
    if (!ts.isCallExpression(node)) continue;
    const mutation = mutationParts(node);
    if (mutation !== undefined && !isLocallyOwnedTarget(mutation.target, owner)
      && mutation.values.some((value) => referencesSensitive(value, tainted))) {
      occurrences.push(`call:${compact(mutation.target)}<=${mutation.values.map(compact).join(',')}`);
    }
  }
  return occurrences;
}

function collectDerivedLocals(owner: TsFunctionLikeDeclaration): Set<string> {
  const tainted = new Set(owner.parameters.flatMap((parameter) => bindingNames(parameter.name)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of directDescendants(owner)) {
      if (ts.isVariableDeclaration(node) && node.initializer !== undefined
        && referencesSensitive(node.initializer, tainted)) {
        changed = addBindings(tainted, node.name) || changed;
      }
      if (ts.isBinaryExpression(node) && isAssignment(node.operatorToken.kind)
        && ts.isIdentifier(node.left) && isFunctionLocal(node.left.text, owner)
        && referencesSensitive(node.right, tainted) && !tainted.has(node.left.text)) {
        tainted.add(node.left.text);
        changed = true;
      }
    }
  }
  return tainted;
}

function referencesSensitive(node: TsNode, tainted: ReadonlySet<string>): boolean {
  if (ts.isIdentifier(node) && tainted.has(node.text) && isReference(node)) return true;
  if (isThisValueAccess(node) || isSodiumResult(node)) return true;
  if (isExecutableFunction(node)) return false;
  return node.getChildren().some((child) => referencesSensitive(child, tainted));
}

function mutationParts(call: TsCallExpression): { target: TsExpression; values: readonly TsExpression[] } | undefined {
  const expression = call.expression;
  if (ts.isPropertyAccessExpression(expression)
    && ['push', 'set', 'add'].includes(expression.name.text)) {
    return { target: expression.expression, values: call.arguments };
  }
  const name = ts.isIdentifier(expression) ? expression.text
    : ts.isPropertyAccessExpression(expression) ? expression.name.text : '';
  if (!['assign', 'defineProperty'].includes(name) || call.arguments.length < 2) return undefined;
  return { target: call.arguments[0]!, values: call.arguments.slice(1) };
}

function isLocalTarget(target: TsExpression, owner: TsFunctionLikeDeclaration): boolean {
  const expression = unwrap(target);
  if (ts.isIdentifier(expression)) return isFunctionLocal(expression.text, owner);
  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
    return isLocallyOwnedTarget(expression.expression, owner);
  }
  return false;
}

function isLocallyOwnedTarget(target: TsExpression, owner: TsFunctionLikeDeclaration): boolean {
  const expression = unwrap(target);
  if (ts.isIdentifier(expression)) return isLocalVariable(expression.text, owner);
  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
    return isLocallyOwnedTarget(expression.expression, owner);
  }
  return false;
}

function isThisValueAccess(node: TsNode): boolean {
  if (ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword) {
    return node.name.text === '#value' || node.name.text === 'value';
  }
  return ts.isElementAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword
    && ts.isStringLiteral(node.argumentExpression) && node.argumentExpression.text === 'value';
}

function isSodiumResult(node: TsNode): boolean {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
  const name = node.expression.name.text;
  if (name.endsWith('_decrypt')) return true;
  if (name !== 'open') return false;
  const receiver = unwrap(node.expression.expression);
  return ts.isIdentifier(receiver) && ['primitives', 'defaultSealingPrimitives', 'sodium'].includes(receiver.text);
}

function inspectRedactionMembers(file: TsSourceFile): string[] {
  const classes = file.statements.filter((statement): statement is import('typescript').ClassDeclaration =>
    ts.isClassDeclaration(statement) && statement.name?.text === 'Secret');
  if (classes.length !== 1) return [`expected one Secret class, got ${classes.length}`];
  const members = classes[0]!.members.filter(isExecutableClassMember);
  const labels = members.map(functionLabel);
  if (JSON.stringify(labels) !== JSON.stringify(Object.keys(REDACTION_MEMBER_OCCURRENCES))) {
    return [`Secret member occurrence inventory changed: ${labels.join(',')}`];
  }
  return members.flatMap((member) => {
    const label = functionLabel(member);
    const actual = redactionOccurrences(member);
    const expected = REDACTION_MEMBER_OCCURRENCES[label]!;
    return JSON.stringify(actual) === JSON.stringify(expected)
      ? [] : [`Secret.${label} occurrences changed: ${actual.join(',')}`];
  });
}

function isExecutableClassMember(
  node: import('typescript').ClassElement,
): node is TsClassFunctionMember {
  return ts.isConstructorDeclaration(node)
    || ts.isMethodDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node);
}

function redactionOccurrences(owner: TsFunctionLikeDeclaration): string[] {
  const occurrences: string[] = [];
  for (const node of directDescendants(owner)) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.kind === ts.SyntaxKind.ThisKeyword
      && node.expression.name.text === 'expose') occurrences.push('call:this.expose');
    if (ts.isPropertyAccessExpression(node) && isThisValueAccess(node)) {
      const parent = node.parent;
      occurrences.push(ts.isBinaryExpression(parent) && parent.left === node
        && isAssignment(parent.operatorToken.kind) ? 'write:this.#value' : 'read:this.#value');
    }
    if (ts.isIdentifier(node) && node.text === 'value' && isReference(node)) {
      occurrences.push(ts.isReturnStatement(node.parent) ? 'return:value' : 'read:value');
    }
  }
  return occurrences;
}

function functionLabel(node: TsFunctionLikeDeclaration): string {
  if (node.name !== undefined && ts.isIdentifier(node.name)) return node.name.text;
  if (node.name !== undefined && ts.isComputedPropertyName(node.name)) return node.name.expression.getText();
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  const parent = node.parent;
  if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (ts.isCallExpression(parent)) {
    const index = parent.arguments.indexOf(node as TsExpression);
    const expression = parent.expression;
    const caller = ts.isPropertyAccessExpression(expression) ? expression.name.text
      : ts.isIdentifier(expression) ? expression.text : 'call';
    return `${caller}#callback${index}`;
  }
  return '<anonymous>';
}

function directDescendants(owner: TsFunctionLikeDeclaration): TsNode[] {
  const nodes: TsNode[] = [];
  const visit = (node: TsNode): void => {
    if (isExecutableFunction(node)) return;
    nodes.push(node);
    node.forEachChild(visit);
  };
  owner.forEachChild(visit);
  return nodes;
}

function descendants(root: TsNode): TsNode[] {
  const nodes: TsNode[] = [];
  const visit = (node: TsNode): void => { nodes.push(node); node.forEachChild(visit); };
  root.forEachChild(visit);
  return nodes;
}

function isFunctionLocal(name: string, owner: TsFunctionLikeDeclaration): boolean {
  if (owner.parameters.some((parameter) => bindingNames(parameter.name).includes(name))) return true;
  return isLocalVariable(name, owner);
}

function isLocalVariable(name: string, owner: TsFunctionLikeDeclaration): boolean {
  return directDescendants(owner).some((node) => ts.isVariableDeclaration(node)
    && bindingNames(node.name).includes(name));
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

function isReference(identifier: TsIdentifier): boolean {
  const parent = identifier.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === identifier) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === identifier) return false;
  if (ts.isVariableDeclaration(parent) && parent.name === identifier) return false;
  if (ts.isBindingElement(parent) && parent.name === identifier) return false;
  if (ts.isParameter(parent) && parent.name === identifier) return false;
  return true;
}

function unwrap(expression: TsExpression): TsExpression {
  let current = expression;
  while (ts.isAwaitExpression(current) || ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current) || ts.isTypeAssertionExpression(current)
    || ts.isNonNullExpression(current)) current = current.expression;
  return current;
}

function compact(node: TsNode): string {
  return node.getText().replace(/\s+/gu, ' ');
}

function isExecutableFunction(node: TsNode): node is TsFunctionLikeDeclaration {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node) || ts.isConstructorDeclaration(node);
}

function isAssignment(kind: import('typescript').SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}
