import { FUNCTION_ALLOWLISTS } from './allowlists';
import { inspectNonLocalAssignments } from './nonLocalAssignments';
import { isRoundEightConditionOccurrence, roundEightViolations } from './round8.rules';
import ts from 'typescript';
import {
  isPinnedDestinationInject,
  isPinnedDestinationInjectExpression,
  isPinnedInjectArgument,
  isSecretClear,
  isDirectConstAlias,
  isSeedAssignmentTarget,
  secretResultCarrier,
  isDirectTaintReference,
  unwrap,
  isIdentifierCall,
  containsIdentifierCall,
  isWithinCallArgument,
  moduleFunction,
  isResolveSecretCall,
  addBindings,
  isFunctionLocal,
  referencesTaint,
  isReference,
  bindingNames,
  descendants,
  containsNode,
  isConsumeCall,
  enclosingFunction,
  isExecutableFunction,
  isAssignment,
  parse,
  unique,
} from './taintHelpers';

type TsCallExpression = import('typescript').CallExpression;
type TsExpression = import('typescript').Expression;
type TsFunctionLikeDeclaration = import('typescript').FunctionLikeDeclaration;
type TsIdentifier = import('typescript').Identifier;
type TsNode = import('typescript').Node;
type TsSourceFile = import('typescript').SourceFile;

export { roundEightViolations } from './round8.rules';

/**
 * Definitive M4 scope: direct syntactic data, object, property, control, try/finally, constructor,
 * CDP-return, and non-local write shapes in the fixed source set below. Every function in every fixed
 * file is analysed; non-local writes are tainted from parameters, this.#value/this.value, locals derived
 * from either, and sodium decrypt/open results, plus the named S1-S35 mutant corpus. Not covered:
 * interprocedural flows outside the file set, eval/Function, dynamic property names, or in-realm source
 * strings. The permitted CDP guard is a name allowlist; a look-alike guard that performs work inside its
 * condition is not detected. No further shape classes are added in M4.
 */
export const RETENTION_SOURCE_FILES = [
  'src/browser/session.ts',
  'src/core/fillService.ts',
  'src/backends/localFile.ts',
  'src/backends/localFileSodium.ts',
  'src/backends/localFileFormat.ts',
  'src/core/redaction.ts',
] as const;

const PURE_TAINT_HELPERS = new Set(['String', 'toFixedHex']);

export function retentionViolations(source: string, fileName: string): string[] {
  const file = parse(source, fileName);
  const roundEight = roundEightViolations(source, fileName);
  const inventory = inspectFunctionAllowlist(file, fileName);
  const nonLocal = inspectNonLocalAssignments(file, fileName);
  if (fileName.endsWith('src/backends/localFile.ts')) {
    return unique([...inventory, ...nonLocal, ...roundEight, ...inspectLocalFileKey(file)]);
  }
  if (fileName.endsWith('src/backends/localFileSodium.ts')) {
    return unique([...inventory, ...nonLocal, ...roundEight, ...inspectSodiumOpen(file)]);
  }
  if (fileName.endsWith('src/core/redaction.ts')) {
    return unique([...inventory, ...nonLocal, ...roundEight, ...inspectSecretConsume(file)]);
  }
  if (fileName.endsWith('src/backends/localFileFormat.ts')) {
    return unique([...inventory, ...nonLocal, ...roundEight]);
  }
  const consumeCalls = descendants(file).filter(isConsumeCall);
  const violations: string[] = [...inventory, ...nonLocal];
  if (fileName.endsWith('src/core/fillService.ts')) {
    const resolveCalls = descendants(file).filter(isResolveSecretCall);
    if (resolveCalls.length !== 1) violations.push(`expected one resolveSecret call, got ${resolveCalls.length}`);
  }
  if (consumeCalls.length === 0) return unique([
    ...violations, ...inspectSecretObjectUses(file), ...roundEight,
  ]);
  if (consumeCalls.length !== 1) return unique([
    ...violations, `expected one consume call, got ${consumeCalls.length}`,
  ]);
  const owner = enclosingFunction(consumeCalls[0]!);
  if (owner === undefined) return unique([...violations, 'consume call has no function owner']);
  const tainted = collectTaintedBindings(owner, consumeCalls[0]!, new Set(['arguments']));
  const cdpSinks = descendants(owner).filter((node): node is TsCallExpression =>
    ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === 'callFunctionOn'
      && node.arguments.some((argument) => referencesTaint(argument, tainted)));
  if (cdpSinks.length !== 1) violations.push(`expected one tainted callFunctionOn sink, got ${cdpSinks.length}`);
  return unique([
    ...violations, ...inspectTaintedUses(file, owner, tainted, false, false, 0), ...roundEight,
  ]);
}

function inspectSecretObjectUses(file: TsSourceFile): string[] {
  const calls = descendants(file).filter(isResolveSecretCall);
  if (calls.length === 0) return ['file without consume must resolve a Secret'];
  const violations: string[] = [];
  const owners = new Map<TsFunctionLikeDeclaration, { tainted: Set<string>; seedAssignments: Set<TsNode> }>();
  for (const call of calls) {
    const owner = enclosingFunction(call);
    if (owner === undefined) {
      violations.push('resolveSecret result must be function-local');
      continue;
    }
    const analysis = owners.get(owner) ?? { tainted: new Set<string>(), seedAssignments: new Set<TsNode>() };
    owners.set(owner, analysis);
    const carrier = secretResultCarrier(call);
    if (ts.isVariableDeclaration(carrier.parent) && carrier.parent.initializer === carrier) {
      const list = carrier.parent.parent;
      if (!ts.isVariableDeclarationList(list) || (list.flags & ts.NodeFlags.Const) === 0) {
        violations.push('an inferred resolveSecret result must initialise a const local');
      }
      addBindings(analysis.tainted, carrier.parent.name);
      analysis.seedAssignments.add(carrier.parent);
    } else if (ts.isBinaryExpression(carrier.parent) && carrier.parent.right === carrier
      && isAssignment(carrier.parent.operatorToken.kind) && ts.isIdentifier(carrier.parent.left)) {
      if (!isFunctionLocal(carrier.parent.left.text, owner)) {
        violations.push('resolveSecret result must not initialise non-local state');
      }
      analysis.tainted.add(carrier.parent.left.text);
      analysis.seedAssignments.add(carrier.parent);
    } else {
      violations.push('resolveSecret result must initialise a function-local binding');
    }
  }
  for (const [owner, analysis] of owners) {
    propagateSecretAliases(owner, analysis.tainted);
    violations.push(...inspectSecretUses(owner, analysis.tainted, analysis.seedAssignments));
  }
  return unique(violations);
}

function propagateSecretAliases(owner: TsFunctionLikeDeclaration, tainted: Set<string>): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of descendants(owner)) {
      if (ts.isVariableDeclaration(node) && node.initializer !== undefined
        && referencesTaint(node.initializer, tainted)
        && !isPinnedDestinationInjectExpression(node.initializer, owner, tainted)) {
        changed = addBindings(tainted, node.name) || changed;
      }
      if (ts.isBinaryExpression(node) && isAssignment(node.operatorToken.kind)
        && ts.isIdentifier(node.left) && referencesTaint(node.right, tainted)
        && !tainted.has(node.left.text)) {
        tainted.add(node.left.text);
        changed = true;
      }
    }
  }
}

function inspectSecretUses(owner: TsFunctionLikeDeclaration, tainted: ReadonlySet<string>,
  seedAssignments: ReadonlySet<TsNode>): string[] {
  const violations: string[] = [];
  for (const node of descendants(owner)) {
    if (isExecutableFunction(node) && node !== owner && referencesTaint(node, tainted)) {
      violations.push('Secret binding is captured by a closure');
      continue;
    }
    if (ts.isVariableDeclaration(node) && node.initializer !== undefined
      && referencesTaint(node.initializer, tainted)) {
      const list = node.parent;
      if (!seedAssignments.has(node) && !isPinnedDestinationInjectExpression(node.initializer, owner, tainted)
        && (!ts.isIdentifier(node.name) || !ts.isVariableDeclarationList(list)
          || (list.flags & ts.NodeFlags.Const) === 0 || !isDirectTaintReference(node.initializer, tainted))) {
        violations.push(`Secret aliases may only be direct const initialisers: ${node.getText()}`);
      }
    }
    if (ts.isBinaryExpression(node) && isAssignment(node.operatorToken.kind)
      && (referencesTaint(node.left, tainted) || referencesTaint(node.right, tainted))
      && !seedAssignments.has(node)) {
      violations.push('Secret reaches an assignment outside its initial binding');
    }
    if (ts.isCallExpression(node) && node.arguments.some((argument) => referencesTaint(argument, tainted))
      && !isPinnedDestinationInject(node, owner, tainted)) {
      violations.push('Secret reaches a call other than pinned destination.inject');
    }
    if (ts.isNewExpression(node) && node.arguments?.some((argument) => referencesTaint(argument, tainted))) {
      violations.push('Secret reaches a constructor');
    }
    if (ts.isReturnStatement(node) && node.expression !== undefined
      && referencesTaint(node.expression, tainted)) violations.push('Secret is returned');
    if (ts.isThrowStatement(node) && node.expression !== undefined
      && referencesTaint(node.expression, tainted)) violations.push('Secret is thrown');
    if ((ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node))
      && referencesTaint(node, tainted)) violations.push('Secret reaches a template');
    if (ts.isSpreadElement(node) && referencesTaint(node.expression, tainted)) {
      violations.push('Secret is spread');
    }
    if ((ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node))
      && referencesTaint(node, tainted)) violations.push('Secret reaches an object property');
  }
  for (const node of descendants(owner)) {
    if (!ts.isIdentifier(node) || !tainted.has(node.text) || !isReference(node)) continue;
    if (isSeedAssignmentTarget(node, seedAssignments) || isDirectConstAlias(node, owner)
      || isSecretClear(node) || isPinnedInjectArgument(node, owner, tainted)) continue;
    violations.push('Secret occurrence is outside the positive sink allowlist');
  }
  return unique(violations);
}

function inspectTaintedUses(
  file: TsSourceFile,
  owner: TsFunctionLikeDeclaration,
  tainted: ReadonlySet<string>,
  allowReturn: boolean,
  allowLocalWrites: boolean,
  helperDepth: number,
): string[] {
  return unique([
    ...inspectTaintedFlow(file, owner, tainted, allowReturn, allowLocalWrites, helperDepth),
    ...inspectTaintedContainers(owner, tainted),
    ...inspectTaintedOccurrences(file, owner, tainted, allowReturn, allowLocalWrites),
  ]);
}

function inspectTaintedFlow(
  file: TsSourceFile,
  owner: TsFunctionLikeDeclaration,
  tainted: ReadonlySet<string>,
  allowReturn: boolean,
  allowLocalWrites: boolean,
  helperDepth: number,
): string[] {
  const violations: string[] = [];
  for (const node of descendants(owner)) {
    if (ts.isVariableDeclaration(node) && node.initializer !== undefined
      && referencesTaint(node.initializer, tainted)) {
      const list = node.parent;
      if (!ts.isIdentifier(node.name) || !ts.isVariableDeclarationList(list)
        || (list.flags & ts.NodeFlags.Const) === 0) {
        violations.push('secret-derived bindings must be identifier const locals');
      }
    }
    if (ts.isBinaryExpression(node) && isAssignment(node.operatorToken.kind)) {
      if (referencesTaint(node.left, tainted)
        && !(allowLocalWrites && ts.isIdentifier(node.left) && isFunctionLocal(node.left.text, owner))) {
        violations.push('secret-derived value reaches an assignment target or computed key');
      }
      if (referencesTaint(node.right, tainted)
        && !isIdentifierCall(node.right, 'callFunctionOn')
        && !(allowLocalWrites && ts.isIdentifier(node.left) && isFunctionLocal(node.left.text, owner))) {
        violations.push(`secret-derived assignment is outside an analysed pure helper local: ${node.getText()}`);
      }
    }
    if (!allowReturn && ts.isReturnStatement(node) && node.expression !== undefined
      && referencesTaint(node.expression, tainted)) {
      violations.push('secret-derived expression is returned');
    }
    if (ts.isThrowStatement(node) && node.expression !== undefined
      && referencesTaint(node.expression, tainted)) {
      violations.push('secret-derived expression is thrown');
    }
    if (ts.isCallExpression(node) && node.arguments.some((argument) => referencesTaint(argument, tainted))) {
      violations.push(...inspectTaintedCall(file, node, tainted, helperDepth));
    }
    if (ts.isNewExpression(node) && node.arguments?.some((argument) => referencesTaint(argument, tainted))) {
      violations.push('secret-derived expression reaches a Map, Set, or other constructor');
    }
  }
  return violations;
}

function inspectTaintedContainers(
  owner: TsFunctionLikeDeclaration,
  tainted: ReadonlySet<string>,
): string[] {
  const violations: string[] = [];
  for (const node of descendants(owner)) {
    if ((ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node))
      && referencesTaint(node, tainted) && !isWithinCallArgument(node, 'callFunctionOn')) {
      violations.push('secret-derived expression reaches an object property');
    }
    if (ts.isVariableDeclaration(node) && !ts.isIdentifier(node.name)
      && node.initializer !== undefined && referencesTaint(node.initializer, tainted)) {
      violations.push('secret-derived expression is destructured');
    }
    if ((ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node))
      && referencesTaint(node, tainted)) violations.push('secret-derived expression reaches a template');
    if (ts.isSpreadElement(node) && referencesTaint(node.expression, tainted)) {
      violations.push('secret-derived expression is spread');
    }
    if (isExecutableFunction(node) && node !== owner && referencesTaint(node, tainted)) {
      violations.push('secret-derived binding is captured by a closure');
    }
  }
  return unique(violations);
}

function inspectTaintedOccurrences(
  file: TsSourceFile,
  owner: TsFunctionLikeDeclaration,
  tainted: ReadonlySet<string>,
  allowReturn: boolean,
  allowLocalWrites: boolean,
): string[] {
  const violations: string[] = [];
  for (const node of descendants(owner)) {
    if (!ts.isIdentifier(node) || !tainted.has(node.text) || !isReference(node)) continue;
    const callSink = allowedTaintedCallSink(file, node, owner);
    const allowedContext = callSink !== undefined
      || isAllowedHelperReturn(node, owner, allowReturn)
      || isAllowedLocalWrite(node, owner, allowLocalWrites)
      || isWhitelistedPropertyRead(node) || isConstInitializerOccurrence(node, owner)
      || isRoundEightConditionOccurrence(node, owner);
    if (allowedContext
      && !hasForbiddenTaintedContext(node, owner, allowReturn, allowLocalWrites, callSink)) continue;
    violations.push(`secret-derived occurrence is outside the positive sink allowlist: ${node.text}`);
  }
  return violations;
}

function allowedTaintedCallSink(
  file: TsSourceFile,
  identifier: TsIdentifier,
  owner: TsFunctionLikeDeclaration,
): string | undefined {
  let allowed: string | undefined;
  for (let current: TsNode = identifier; current.parent && current.parent !== owner; current = current.parent) {
    const parent = current.parent;
    if (isExecutableFunction(parent)) return undefined;
    if (!ts.isCallExpression(parent) || !containsNode(parent, identifier)) continue;
    if (!parent.arguments.some((argument) => containsNode(argument, identifier))
      || !ts.isIdentifier(parent.expression)) return undefined;
    const name = parent.expression.text;
    if (name === 'String' && resolvesGlobalString(file)) allowed = name;
    else if (name === 'toFixedHex' && resolvesModuleFunction(file, parent, name)) allowed = name;
    else if (name === 'callFunctionOn' && resolvesModuleFunction(file, parent, name)) return name;
    else return undefined;
  }
  return allowed;
}

function hasForbiddenTaintedContext(
  identifier: TsIdentifier,
  owner: TsFunctionLikeDeclaration,
  allowReturn: boolean,
  allowLocalWrites: boolean,
  callSink: string | undefined,
): boolean {
  for (let current: TsNode = identifier; current.parent && current.parent !== owner; current = current.parent) {
    const parent = current.parent;
    if (isExecutableFunction(parent)) return true;
    if ((ts.isArrayLiteralExpression(parent) || ts.isObjectLiteralExpression(parent))
      && callSink !== 'callFunctionOn') return true;
    if (ts.isTemplateExpression(parent) || ts.isNoSubstitutionTemplateLiteral(parent)
      || ts.isThrowStatement(parent)
      || ts.isSpreadElement(parent)) return true;
    if (ts.isReturnStatement(parent)) return !allowReturn;
    if (ts.isForOfStatement(parent) && containsNode(parent.expression, identifier)) return true;
    if (ts.isElementAccessExpression(parent) && directExpressionContains(parent.expression, identifier)) return true;
    if (ts.isPropertyAccessExpression(parent) && directExpressionContains(parent.expression, identifier)) {
      const conditionRead = parent.name.text === 'includes'
        && isRoundEightConditionOccurrence(identifier, owner);
      if (!conditionRead
        && !['length', 'padStart', 'padEnd', 'charCodeAt'].includes(parent.name.text)) return true;
    }
    if (ts.isCallExpression(parent) && directExpressionContains(parent.expression, identifier)) return true;
    if (ts.isBinaryExpression(parent) && isAssignment(parent.operatorToken.kind)
      && (directExpressionContains(parent.left as TsExpression, identifier)
        || directExpressionContains(parent.right, identifier))) {
      const localWrite = allowLocalWrites && ts.isIdentifier(parent.left)
        && isFunctionLocal(parent.left.text, owner);
      if (!localWrite) return true;
    }
  }
  return false;
}

function isWhitelistedPropertyRead(identifier: TsIdentifier): boolean {
  const parent = identifier.parent;
  return ts.isPropertyAccessExpression(parent) && parent.expression === identifier
    && ['length', 'padStart', 'padEnd', 'charCodeAt'].includes(parent.name.text);
}

function isAllowedHelperReturn(
  identifier: TsIdentifier,
  owner: TsFunctionLikeDeclaration,
  allowReturn: boolean,
): boolean {
  if (!allowReturn) return false;
  for (let current: TsNode = identifier; current.parent && current.parent !== owner; current = current.parent) {
    if (isExecutableFunction(current.parent)) return false;
    if (ts.isReturnStatement(current.parent)) return true;
  }
  return false;
}

function isAllowedLocalWrite(
  identifier: TsIdentifier,
  owner: TsFunctionLikeDeclaration,
  allowLocalWrites: boolean,
): boolean {
  if (!allowLocalWrites) return false;
  for (let current: TsNode = identifier; current.parent && current.parent !== owner; current = current.parent) {
    const parent = current.parent;
    if (isExecutableFunction(parent)) return false;
    if (!ts.isBinaryExpression(parent) || !isAssignment(parent.operatorToken.kind)
      || !ts.isIdentifier(parent.left) || !isFunctionLocal(parent.left.text, owner)) continue;
    return containsNode(parent.left, identifier) || containsNode(parent.right, identifier);
  }
  return false;
}

function isConstInitializerOccurrence(
  identifier: TsIdentifier,
  owner: TsFunctionLikeDeclaration,
): boolean {
  for (let current: TsNode = identifier; current.parent && current.parent !== owner; current = current.parent) {
    const parent = current.parent;
    if (isExecutableFunction(parent)) return false;
    if (!ts.isVariableDeclaration(parent) || parent.initializer === undefined
      || !containsNode(parent.initializer, identifier)) continue;
    const list = parent.parent;
    return ts.isIdentifier(parent.name) && ts.isVariableDeclarationList(list)
      && (list.flags & ts.NodeFlags.Const) !== 0;
  }
  return false;
}

function inspectTaintedCall(
  file: TsSourceFile,
  call: TsCallExpression,
  tainted: ReadonlySet<string>,
  helperDepth: number,
): string[] {
  if (!ts.isIdentifier(call.expression)) {
    return ['secret-derived expression reaches a non-Identifier call sink'];
  }
  const name = call.expression.text;
  if (name === 'callFunctionOn') {
    return !resolvesModuleFunction(file, call, name)
      ? ['callFunctionOn sink is not module-local']
      : [];
  }
  if (name === 'String') {
    return resolvesGlobalString(file)
      ? []
      : ['String sink is shadowed by a lexical binding'];
  }
  if (name !== 'toFixedHex' || !PURE_TAINT_HELPERS.has(name) || helperDepth !== 0
    || !resolvesModuleFunction(file, call, name)) {
    return ['secret-derived expression reaches a non-whitelisted call'];
  }
  const declaration = moduleFunction(file, name);
  if (declaration === undefined) return ['whitelisted local helper has no module-level body'];
  const helperTaint = new Set<string>(['arguments']);
  for (let index = 0; index < declaration.parameters.length; index += 1) {
    const argument = call.arguments[index];
    if (argument !== undefined && referencesTaint(argument, tainted)) {
      addBindings(helperTaint, declaration.parameters[index]!.name);
    }
  }
  const propagated = collectTaintedBindings(declaration, undefined, helperTaint);
  return inspectTaintedUses(file, declaration, propagated, true, true, helperDepth + 1);
}

function resolvesGlobalString(file: TsSourceFile): boolean {
  return !descendants(file).some((node) => declarationBindingNames(node).includes('String'));
}

function resolvesModuleFunction(file: TsSourceFile, call: TsCallExpression, name: string): boolean {
  const declaration = moduleFunction(file, name);
  if (declaration === undefined) return false;
  return !descendants(file).some((node) => node !== declaration
    && declarationBindingNames(node).includes(name)
    && scopeContains(bindingScope(node), call));
}

function declarationBindingNames(node: TsNode): string[] {
  if (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) {
    return bindingNames(node.name);
  }
  if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)
    || ts.isClassDeclaration(node) || ts.isClassExpression(node)) && node.name !== undefined) {
    return [node.name.text];
  }
  if (ts.isImportClause(node) && node.name !== undefined) return [node.name.text];
  if (ts.isImportSpecifier(node)) return [node.name.text];
  if (ts.isNamespaceImport(node) || ts.isImportEqualsDeclaration(node)) return [node.name.text];
  return [];
}

function bindingScope(node: TsNode): TsNode | undefined {
  if (ts.isParameter(node)) return enclosingFunction(node);
  if (ts.isVariableDeclaration(node)) {
    const list = node.parent;
    if (ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.BlockScoped) === 0) {
      return enclosingFunction(node) ?? node.getSourceFile();
    }
  }
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (isExecutableFunction(parent) || ts.isBlock(parent) || ts.isSourceFile(parent)) return parent;
  }
  return undefined;
}

function scopeContains(scope: TsNode | undefined, node: TsNode): boolean {
  if (scope === undefined) return false;
  for (let current: TsNode | undefined = node; current; current = current.parent) {
    if (current === scope) return true;
  }
  return false;
}

function directExpressionContains(expression: TsExpression, identifier: TsIdentifier): boolean {
  return unwrap(expression) === identifier;
}

function collectTaintedBindings(
  owner: TsFunctionLikeDeclaration,
  seedNode: TsNode | undefined,
  initial: Set<string>,
): Set<string> {
  const tainted = new Set(initial);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of descendants(owner)) {
      if (ts.isVariableDeclaration(node) && node.initializer !== undefined
        && !containsIdentifierCall(node.initializer, 'callFunctionOn')
        && (seedNode !== undefined && containsNode(node.initializer, seedNode)
          || referencesTaint(node.initializer, tainted))) {
        changed = addBindings(tainted, node.name) || changed;
      }
      if (ts.isBinaryExpression(node) && isAssignment(node.operatorToken.kind)
        && ts.isIdentifier(node.left) && isFunctionLocal(node.left.text, owner)
        && !containsIdentifierCall(node.right, 'callFunctionOn')
        && referencesTaint(node.right, tainted) && !tainted.has(node.left.text)) {
        tainted.add(node.left.text);
        changed = true;
      }
    }
  }
  return tainted;
}

function inspectFunctionAllowlist(file: TsSourceFile, fileName: string): string[] {
  const expected = FUNCTION_ALLOWLISTS[fileName];
  if (expected === undefined) return [];
  const actual = [file, ...descendants(file)].filter((node): node is TsFunctionLikeDeclaration =>
    isExecutableFunction(node)).map(functionLabel);
  return JSON.stringify(actual) === JSON.stringify(expected)
    ? [] : [`function allowlist changed in ${fileName}: ${actual.join(',')}`];
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

function inspectLocalFileKey(file: TsSourceFile): string[] {
  const owner = moduleFunction(file, 'openRecordSecret');
  if (owner === undefined) return ['openRecordSecret must be one module function'];
  const occurrences = descendants(owner).filter((node): node is TsIdentifier =>
    ts.isIdentifier(node) && node.text === 'key' && isReference(node))
    .map(localFileKeyOccurrence);
  const expected = ['assignment', 'length-guard', 'decrypt-argument', 'undefined-guard', 'memzero'];
  return JSON.stringify(occurrences) === JSON.stringify(expected)
    ? [] : [`local-file key occurrences changed: ${occurrences.join(',')}`];
}

function localFileKeyOccurrence(identifier: TsIdentifier): string {
  const parent = identifier.parent;
  if (ts.isBinaryExpression(parent) && parent.left === identifier
    && parent.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken
    && ts.isIdentifier(parent.right) && parent.right.text === 'undefined') return 'undefined-guard';
  if (ts.isBinaryExpression(parent) && parent.left === identifier) return 'assignment';
  if (ts.isPropertyAccessExpression(parent) && parent.expression === identifier
    && parent.name.text === 'length') return 'length-guard';
  if (ts.isCallExpression(parent) && ts.isIdentifier(parent.expression)
    && parent.expression.text === 'decryptRecord' && parent.arguments.includes(identifier)) {
    return 'decrypt-argument';
  }
  if (ts.isCallExpression(parent) && parent.arguments.includes(identifier)
    && ts.isPropertyAccessExpression(parent.expression)
    && parent.expression.name.text === 'memzero') return 'memzero';
  return `forbidden:${parent.getText()}`;
}

function inspectSodiumOpen(file: TsSourceFile): string[] {
  const owners = descendants(file).filter((node): node is TsFunctionLikeDeclaration =>
    isExecutableFunction(node) && functionLabel(node) === 'open');
  if (owners.length !== 1) return [`expected one sodium open function, got ${owners.length}`];
  const owner = owners[0]!;
  const decrypts = descendants(owner).filter((node): node is TsCallExpression =>
    ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text.endsWith('_decrypt'));
  if (decrypts.length !== 1) return [`expected one sodium decrypt call, got ${decrypts.length}`];
  const tainted = collectTaintedBindings(owner, decrypts[0]!, new Set());
  return inspectTaintedUses(file, owner, tainted, true, false, 0);
}

function inspectSecretConsume(file: TsSourceFile): string[] {
  const owners = descendants(file).filter((node): node is TsFunctionLikeDeclaration =>
    isExecutableFunction(node) && functionLabel(node) === 'consume');
  if (owners.length !== 1) return [`expected one Secret.consume function, got ${owners.length}`];
  const occurrences = descendants(owners[0]!).filter((node): node is TsIdentifier =>
    ts.isIdentifier(node) && node.text === 'value' && isReference(node));
  return occurrences.length === 1 && ts.isReturnStatement(occurrences[0]!.parent)
    ? [] : [`Secret.consume value occurrences changed: ${occurrences.map((node) => node.parent.getText()).join(',')}`];
}
