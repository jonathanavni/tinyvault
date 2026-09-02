import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const RETENTION_SOURCE_FILES = ['src/browser/session.ts', 'src/core/fillService.ts'] as const;
const PURE_TAINT_HELPERS = new Set(['String', 'toFixedHex']);

describe('positive secret-retention structure', () => {
  it('keeps the fixed source set non-vacuous and clean', async () => {
    expect(RETENTION_SOURCE_FILES).toEqual(['src/browser/session.ts', 'src/core/fillService.ts']);
    for (const file of RETENTION_SOURCE_FILES) {
      expect(retentionViolations(await readFile(resolve(file), 'utf8'), file)).toEqual([]);
    }
  });

  it('allows tainted strings only in const locals, analysed pure helpers, and the one local CDP sink', async () => {
    const fileName = 'src/browser/session.ts';
    const source = await readFile(resolve(fileName), 'utf8');
    const marker = "    const lengthDigits = String(value.length).padStart(4, '0');";
    expect(source).toContain(marker);
    const namedMutants = [
      ['original property', source.replace(marker, `${marker}\n    this.#lastPadded = hex;`)],
      ['original helper call', source.replace(marker, `${marker}\n    retain(hex);`)],
      ['original derived length', source.replace(marker, `${marker}\n    this.#lastLen = value.length;`)],
      ['original destructuring', source.replace(marker,
        `${marker}\n    const { length } = value;\n    moduleStash = length;`)],
      ['original module let', `let moduleStash;\n${source.replace(marker,
        `${marker}\n    moduleStash = hex;`)}`],
      ['template propagation', source.replace(marker, `${marker}\n    retain(\`${'${value}'}\`);`)],
      ['spread propagation', source.replace(marker, `${marker}\n    retain([...value]);`)],
      ['arguments propagation', source.replace(marker, `${marker}\n    retain(arguments);`)],
      ['M-A taint entry property', source.replace(
        'state.taint.push({ identity, backendNodeId, epoch: state.epoch });',
        'state.taint.push({ identity, backendNodeId, epoch: state.epoch, keep: value });',
      )],
      ['M-B non-allowlisted encoder', `let moduleStash;\nfunction leakEncode(input: string) {\n`
        + `  moduleStash = input;\n  return toFixedHex(input);\n}\n${source.replace(
          'const hex = toFixedHex(value);', 'const hex = leakEncode(value);',
        )}`],
      ['M-C toFixedHex stash', `let moduleStash;\n${source.replace(
        'function toFixedHex(value: string): string {',
        'function toFixedHex(value: string): string {\n  moduleStash = value;',
      )}`],
      ['computed assignment key', source.replace(marker,
        `${marker}\n    const retainedByKey: Record<string, boolean> = {};\n`
          + '    retainedByKey[value] = true;')],
      ['receiver-agnostic String sink', source.replace(marker,
        `${marker}\n    (globalThis as any).sink.String(value);`)],
      ['receiver-agnostic callFunctionOn sink', source.replace(marker,
        `${marker}\n    (globalThis as any).sink.callFunctionOn(value);`)],
      ['receiver-agnostic toFixedHex sink', source.replace(marker,
        `${marker}\n    (globalThis as any).sink.toFixedHex(value);`)],
    ] as const;
    for (const [name, mutant] of namedMutants) {
      expect(retentionViolations(mutant, fileName), name).not.toEqual([]);
    }
  });

  it('rejects taint in Map and Set keys or values, including constructor entries', async () => {
    const fileName = 'src/browser/session.ts';
    const source = await readFile(resolve(fileName), 'utf8');
    const marker = "    const lengthDigits = String(value.length).padStart(4, '0');";
    const mutants = [
      source.replace(marker, `${marker}\n    new Map().set(value, true);`),
      source.replace(marker, `${marker}\n    new Map().set('key', value);`),
      source.replace(marker, `${marker}\n    new Map([[value, true]]);`),
      source.replace(marker, `${marker}\n    new Map([['key', value]]);`),
      source.replace(marker, `${marker}\n    new Set([value]);`),
      source.replace(marker, `${marker}\n    new Set().add(value);`),
    ];
    for (const mutant of mutants) expect(retentionViolations(mutant, fileName)).not.toEqual([]);
  });

  it('keys the Secret rule on every resolveSecret result, including inferred bindings', () => {
    const safe = `
      async function fill(destination: PinnedDestination, backend: Backend) {
        let secret: Secret;
        secret = await backend.resolveSecret();
        try { await destination.inject(secret); }
        finally { secret.clear(); }
      }
      async function inferred(destination: PinnedDestination, backend: Backend) {
        const secret = await backend.resolveSecret();
        try { await destination.inject(secret); }
        finally { secret.clear(); }
      }
    `;
    expect(retentionViolations(safe, 'fake.ts')).toEqual([]);
    const marker = 'secret = await backend.resolveSecret();';
    const mutants = [
      safe.replace(marker, `${marker}\n        retain(secret);`),
      safe.replace(marker, `${marker}\n        const alias = secret; void alias;`),
      `let moduleSecret;\n${safe.replace(marker, `${marker}\n        moduleSecret = secret;`)}`,
      safe.replace(marker, `${marker}\n        state.secret = secret;`),
      safe.replace(marker, `${marker}\n        const closure = () => secret; void closure;`),
      safe.replace('await destination.inject(secret);', 'return secret;'),
      safe.replace('await destination.inject(secret);',
        'await (globalThis as any).exfil.inject(secret);'),
    ];
    for (const mutant of mutants) expect(retentionViolations(mutant, 'fake.ts')).not.toEqual([]);
  });

  it('kills arbitrary-inject, inferred-type retention, and duplicate-resolution mutants in fillService', async () => {
    const fileName = 'src/core/fillService.ts';
    const source = await readFile(resolve(fileName), 'utf8');
    const marker = '    secret = await options.backend.resolveSecret(request.handle, policy);';
    const inject = '      const injected = await destination.inject(secret, canonicalOrigin);';
    expect(source).toContain(marker);
    expect(source).toContain(inject);
    const inferredRetention = `const retainedSecrets: Secret[] = [];\n${source.replace(marker,
      '    const stashed = await options.backend.resolveSecret(request.handle, policy);\n'
        + '    retainedSecrets.push(stashed);\n    secret = stashed;',
    )}`;
    const namedMutants = [
      ['Secret passed to arbitrary inject', source.replace(inject,
        '      const injected = await (globalThis as any).exfil.inject(secret, canonicalOrigin);')],
      ['inferred resolveSecret result retained', inferredRetention],
      ['duplicate resolveSecret call', source.replace(marker,
        `${marker}\n    await options.backend.resolveSecret(request.handle, policy);`)],
    ] as const;
    for (const [name, mutant] of namedMutants) {
      expect(retentionViolations(mutant, fileName), name).not.toEqual([]);
    }
  });

  it('asserts the module-local callFunctionOn sink assigns to no non-local state', async () => {
    const fileName = 'src/browser/session.ts';
    const source = await readFile(resolve(fileName), 'utf8');
    const file = parse(source, fileName);
    const declaration = moduleFunction(file, 'callFunctionOn');
    expect(declaration).toBeDefined();
    expect(nonLocalAssignments(declaration!)).toEqual([]);
    const consumeOwner = enclosingFunction(descendants(file).find(isConsumeCall)!);
    expect(descendants(consumeOwner!).filter((node) => ts.isCallExpression(node)
      && ts.isIdentifier(node.expression) && node.expression.text === 'callFunctionOn')).toHaveLength(1);
  });
});

function retentionViolations(source: string, fileName: string): string[] {
  const file = parse(source, fileName);
  const consumeCalls = descendants(file).filter(isConsumeCall);
  const violations: string[] = [];
  if (fileName.endsWith('src/core/fillService.ts')) {
    const resolveCalls = descendants(file).filter(isResolveSecretCall);
    if (resolveCalls.length !== 1) violations.push(`expected one resolveSecret call, got ${resolveCalls.length}`);
  }
  if (consumeCalls.length === 0) return unique([...violations, ...inspectSecretObjectUses(file)]);
  if (consumeCalls.length !== 1) return unique([
    ...violations, `expected one consume call, got ${consumeCalls.length}`,
  ]);
  const owner = enclosingFunction(consumeCalls[0]!);
  if (owner === undefined) return unique([...violations, 'consume call has no function owner']);
  const tainted = collectTaintedBindings(owner, consumeCalls[0]!, new Set(['arguments']));
  const cdpSinks = descendants(owner).filter((node): node is ts.CallExpression =>
    ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === 'callFunctionOn'
      && node.arguments.some((argument) => referencesTaint(argument, tainted)));
  if (cdpSinks.length !== 1) violations.push(`expected one tainted callFunctionOn sink, got ${cdpSinks.length}`);
  return unique([...violations, ...inspectTaintedUses(file, owner, tainted, false, false, 0)]);
}

function inspectSecretObjectUses(file: ts.SourceFile): string[] {
  const calls = descendants(file).filter(isResolveSecretCall);
  if (calls.length === 0) return ['file without consume must resolve a Secret'];
  const violations: string[] = [];
  const owners = new Map<ts.FunctionLikeDeclaration, { tainted: Set<string>; seedAssignments: Set<ts.Node> }>();
  for (const call of calls) {
    const owner = enclosingFunction(call);
    if (owner === undefined) {
      violations.push('resolveSecret result must be function-local');
      continue;
    }
    const analysis = owners.get(owner) ?? { tainted: new Set<string>(), seedAssignments: new Set<ts.Node>() };
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

function propagateSecretAliases(owner: ts.FunctionLikeDeclaration, tainted: Set<string>): void {
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

function inspectSecretUses(
  owner: ts.FunctionLikeDeclaration,
  tainted: ReadonlySet<string>,
  seedAssignments: ReadonlySet<ts.Node>,
): string[] {
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
  file: ts.SourceFile,
  owner: ts.FunctionLikeDeclaration,
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
    if (ts.isCallExpression(node) && node.arguments.some((argument) => referencesTaint(argument, tainted))) {
      violations.push(...inspectTaintedCall(file, node, tainted, helperDepth));
    }
    if (ts.isNewExpression(node) && node.arguments?.some((argument) => referencesTaint(argument, tainted))) {
      violations.push('secret-derived expression reaches a Map, Set, or other constructor');
    }
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

function inspectTaintedCall(
  file: ts.SourceFile,
  call: ts.CallExpression,
  tainted: ReadonlySet<string>,
  helperDepth: number,
): string[] {
  if (!ts.isIdentifier(call.expression)) {
    return ['secret-derived expression reaches a non-Identifier call sink'];
  }
  const name = call.expression.text;
  if (name === 'callFunctionOn') {
    return moduleFunction(file, name) === undefined
      ? ['callFunctionOn sink is not module-local']
      : [];
  }
  if (name === 'String') return [];
  if (name !== 'toFixedHex' || !PURE_TAINT_HELPERS.has(name) || helperDepth !== 0) {
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

function collectTaintedBindings(
  owner: ts.FunctionLikeDeclaration,
  seedNode: ts.Node | undefined,
  initial: Set<string>,
): Set<string> {
  const tainted = new Set(initial);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of descendants(owner)) {
      if (ts.isVariableDeclaration(node) && node.initializer !== undefined
        && !isIdentifierCall(node.initializer, 'callFunctionOn')
        && (seedNode !== undefined && containsNode(node.initializer, seedNode)
          || referencesTaint(node.initializer, tainted))) {
        changed = addBindings(tainted, node.name) || changed;
      }
      if (ts.isBinaryExpression(node) && isAssignment(node.operatorToken.kind)
        && ts.isIdentifier(node.left) && isFunctionLocal(node.left.text, owner)
        && !isIdentifierCall(node.right, 'callFunctionOn')
        && referencesTaint(node.right, tainted) && !tainted.has(node.left.text)) {
        tainted.add(node.left.text);
        changed = true;
      }
    }
  }
  return tainted;
}

function nonLocalAssignments(owner: ts.FunctionLikeDeclaration): string[] {
  const violations: string[] = [];
  for (const node of descendants(owner)) {
    if (ts.isBinaryExpression(node) && isAssignment(node.operatorToken.kind)) {
      if (!ts.isIdentifier(node.left) || !isFunctionLocal(node.left.text, owner)) {
        violations.push(node.left.getText());
      }
    }
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
      && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)
      && (!ts.isIdentifier(node.operand) || !isFunctionLocal(node.operand.text, owner))) {
      violations.push(node.operand.getText());
    }
  }
  return violations;
}

function isPinnedDestinationInject(
  call: ts.CallExpression,
  owner: ts.FunctionLikeDeclaration,
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

function isPinnedDestinationInjectExpression(
  expression: ts.Expression,
  owner: ts.FunctionLikeDeclaration,
  tainted: ReadonlySet<string>,
): boolean {
  const unwrapped = unwrap(expression);
  return ts.isCallExpression(unwrapped) && isPinnedDestinationInject(unwrapped, owner, tainted);
}

function isPinnedInjectArgument(
  identifier: ts.Identifier,
  owner: ts.FunctionLikeDeclaration,
  tainted: ReadonlySet<string>,
): boolean {
  return ts.isCallExpression(identifier.parent) && identifier.parent.arguments.includes(identifier)
    && isPinnedDestinationInject(identifier.parent, owner, tainted);
}

function isSecretClear(identifier: ts.Identifier): boolean {
  const access = identifier.parent;
  return ts.isPropertyAccessExpression(access) && access.expression === identifier
    && access.name.text === 'clear' && ts.isCallExpression(access.parent)
    && access.parent.expression === access;
}

function isDirectConstAlias(identifier: ts.Identifier, owner: ts.FunctionLikeDeclaration): boolean {
  const declaration = identifier.parent;
  if (!ts.isVariableDeclaration(declaration) || declaration.initializer !== identifier
    || enclosingFunction(declaration) !== owner) return false;
  const list = declaration.parent;
  return ts.isIdentifier(declaration.name) && ts.isVariableDeclarationList(list)
    && (list.flags & ts.NodeFlags.Const) !== 0;
}

function isSeedAssignmentTarget(identifier: ts.Identifier, seeds: ReadonlySet<ts.Node>): boolean {
  const parent = identifier.parent;
  return ts.isBinaryExpression(parent) && parent.left === identifier && seeds.has(parent);
}

function secretResultCarrier(call: ts.CallExpression): ts.Expression {
  let carrier: ts.Expression = call;
  while (ts.isAwaitExpression(carrier.parent) || ts.isParenthesizedExpression(carrier.parent)
    || ts.isAsExpression(carrier.parent) || ts.isTypeAssertionExpression(carrier.parent)
    || ts.isNonNullExpression(carrier.parent)) carrier = carrier.parent;
  return carrier;
}

function isDirectTaintReference(expression: ts.Expression, tainted: ReadonlySet<string>): boolean {
  const unwrapped = unwrap(expression);
  return ts.isIdentifier(unwrapped) && tainted.has(unwrapped.text);
}

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isAwaitExpression(current) || ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current) || ts.isTypeAssertionExpression(current)
    || ts.isNonNullExpression(current)) current = current.expression;
  return current;
}

function isIdentifierCall(expression: ts.Expression, name: string): boolean {
  const unwrapped = unwrap(expression);
  return ts.isCallExpression(unwrapped) && ts.isIdentifier(unwrapped.expression)
    && unwrapped.expression.text === name;
}

function isWithinCallArgument(node: ts.Node, name: string): boolean {
  for (let current: ts.Node = node; current.parent; current = current.parent) {
    const parent = current.parent;
    if (ts.isCallExpression(parent)) {
      return ts.isIdentifier(parent.expression) && parent.expression.text === name
        && parent.arguments.some((argument) => containsNode(argument, node));
    }
    if (isExecutableFunction(parent)) return false;
  }
  return false;
}

function moduleFunction(file: ts.SourceFile, name: string): ts.FunctionDeclaration | undefined {
  return file.statements.find((statement): statement is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === name);
}

function isResolveSecretCall(node: ts.Node): node is ts.CallExpression {
  return ts.isCallExpression(node)
    && ((ts.isIdentifier(node.expression) && node.expression.text === 'resolveSecret')
      || (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'resolveSecret'));
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

function isFunctionLocal(name: string, owner: ts.FunctionLikeDeclaration): boolean {
  if (owner.parameters.some((parameter) => bindingNames(parameter.name).includes(name))) return true;
  return descendants(owner).some((node) => ts.isVariableDeclaration(node)
    && bindingNames(node.name).includes(name) && enclosingFunction(node) === owner);
}

function referencesTaint(node: ts.Node, tainted: ReadonlySet<string>): boolean {
  if (ts.isIdentifier(node) && tainted.has(node.text) && isReference(node)) return true;
  return node.getChildren().some((child) => referencesTaint(child, tainted));
}

function isReference(identifier: ts.Identifier): boolean {
  const parent = identifier.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === identifier) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === identifier) return false;
  if (ts.isVariableDeclaration(parent) && parent.name === identifier) return false;
  if (ts.isBindingElement(parent) && parent.name === identifier) return false;
  if (ts.isParameter(parent) && parent.name === identifier) return false;
  return true;
}

function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) => ts.isOmittedExpression(element) ? [] : bindingNames(element.name));
}

function descendants(root: ts.Node): ts.Node[] {
  const nodes: ts.Node[] = [];
  const visit = (node: ts.Node): void => { nodes.push(node); node.forEachChild(visit); };
  root.forEachChild(visit);
  return nodes;
}

function containsNode(root: ts.Node, target: ts.Node): boolean {
  return root === target || root.getChildren().some((child) => containsNode(child, target));
}

function isConsumeCall(node: ts.Node): node is ts.CallExpression {
  return ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === 'consume';
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

function isAssignment(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

function parse(source: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
