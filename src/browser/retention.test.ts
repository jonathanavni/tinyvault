import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const RETENTION_SOURCE_FILES = ['src/browser/session.ts', 'src/core/fillService.ts'] as const;
const ALLOWED_TAINTED_HELPERS = new Set(['String', 'toFixedHex']);

describe('secret-derived local retention structure', () => {
  it('keeps the fixed source set non-vacuous and clean', async () => {
    expect(RETENTION_SOURCE_FILES).toEqual(['src/browser/session.ts', 'src/core/fillService.ts']);
    for (const file of RETENTION_SOURCE_FILES) {
      expect(retentionViolations(await readFile(resolve(file), 'utf8'), file)).toEqual([]);
    }
  });

  it('kills the original five plus M-A, M-B, and M-C retention mutants', async () => {
    const fileName = 'src/browser/session.ts';
    const source = await readFile(resolve(fileName), 'utf8');
    const marker = "  const lengthDigits = String(value.length).padStart(4, '0');";
    expect(source).toContain(marker);
    const namedMutants = [
      ['original property', source.replace(marker, `${marker}\n  this.#lastPadded = hex;`)],
      ['original helper call', source.replace(marker, `${marker}\n  retain(hex);`)],
      ['original derived length', source.replace(marker, `${marker}\n  this.#lastLen = value.length;`)],
      ['original destructuring', source.replace(marker, `${marker}\n  const { length } = value;\n  moduleStash = length;`)],
      ['original module let', `let moduleStash;\n${source.replace(marker, `${marker}\n  moduleStash = hex;`)}`],
      ['template propagation', source.replace(marker, `${marker}\n  retain(\`${'${value}'}\`);`)],
      ['spread propagation', source.replace(marker, `${marker}\n  retain([...value]);`)],
      ['arguments propagation', source.replace(marker, `${marker}\n  retain(arguments);`)],
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
    ] as const;
    for (const [name, mutant] of namedMutants) {
      expect(retentionViolations(mutant, fileName), name).not.toEqual([]);
    }
  });

  it('applies the Secret-object rule to a fake source without consume()', () => {
    const safe = `
      async function fill(destination: { inject(secret: Secret): Promise<void> }, backend: Backend) {
        let secret: Secret;
        secret = await backend.resolveSecret();
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
    ];
    for (const mutant of mutants) expect(retentionViolations(mutant, 'fake.ts')).not.toEqual([]);
  });

  it('kills Secret-object retention mutants in the shipped fill service', async () => {
    const fileName = 'src/core/fillService.ts';
    const source = await readFile(resolve(fileName), 'utf8');
    const marker = '    secret = await options.backend.resolveSecret(request.handle, policy);';
    expect(source).toContain(marker);
    const mutants = [
      source.replace(marker, `${marker}\n    retain(secret);`),
      source.replace(marker, `${marker}\n    const retained = secret;\n    void retained;`),
      `let retainedSecret;\n${source.replace(marker, `${marker}\n    retainedSecret = secret;`)}`,
      source.replace(marker, `${marker}\n    state.secret = secret;`),
      source.replace(marker, `${marker}\n    const closure = () => secret;\n    void closure;`),
      source.replace('      const injected = await destination.inject(secret, policy.canonicalOrigin);',
        '      return secret;'),
    ];
    for (const mutant of mutants) expect(retentionViolations(mutant, fileName)).not.toEqual([]);
  });
});

function retentionViolations(source: string, fileName: string): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const consumeCalls = descendants(file).filter(isConsumeCall);
  if (consumeCalls.length === 0) return inspectSecretObjectUses(file);
  if (consumeCalls.length !== 1) return [`expected one consume call, got ${consumeCalls.length}`];
  const owner = enclosingFunction(consumeCalls[0]!);
  if (owner === undefined) return ['consume call has no function owner'];
  const tainted = collectTaintedBindings(owner, consumeCalls[0]!, new Set(['arguments']));
  return inspectTaintedUses(file, owner, tainted, false, 0);
}

function inspectSecretObjectUses(file: ts.SourceFile): string[] {
  const bindings = descendants(file).filter((node): node is ts.VariableDeclaration | ts.ParameterDeclaration =>
    (ts.isVariableDeclaration(node) || ts.isParameter(node))
      && ts.isIdentifier(node.name)
      && isSecretType(node.type));
  if (bindings.length === 0) return ['file without consume must declare a Secret binding'];
  const violations: string[] = [];
  for (const binding of bindings) {
    const owner = enclosingFunction(binding);
    if (owner === undefined) {
      violations.push('Secret binding must be function-local');
      continue;
    }
    const name = (binding.name as ts.Identifier).text;
    for (const node of descendants(owner)) {
      if (!ts.isIdentifier(node) || node.text !== name || !isReference(node)) continue;
      if (isDirectAssignmentTarget(node) || isAllowedSecretCall(node)) continue;
      violations.push('Secret object reaches retained or non-inject state');
    }
  }
  return [...new Set(violations)];
}

function isSecretType(type: ts.TypeNode | undefined): boolean {
  return type !== undefined && ts.isTypeReferenceNode(type)
    && ts.isIdentifier(type.typeName) && type.typeName.text === 'Secret';
}

function isDirectAssignmentTarget(identifier: ts.Identifier): boolean {
  const parent = identifier.parent;
  return ts.isBinaryExpression(parent) && parent.left === identifier && isAssignment(parent.operatorToken.kind);
}

function isAllowedSecretCall(identifier: ts.Identifier): boolean {
  const parent = identifier.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.expression === identifier
    && ['consume', 'clear'].includes(parent.name.text)
    && ts.isCallExpression(parent.parent) && parent.parent.expression === parent) return true;
  return ts.isCallExpression(parent) && parent.arguments.includes(identifier)
    && callName(parent) === 'inject';
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
        && !isCallFunctionOn(node.initializer)
        && (seedNode !== undefined && containsNode(node.initializer, seedNode)
          || referencesTaint(node.initializer, tainted))) {
        changed = addBindings(tainted, node.name) || changed;
      }
      if (ts.isBinaryExpression(node) && isAssignment(node.operatorToken.kind)
        && ts.isIdentifier(node.left) && isFunctionLocal(node.left.text, owner)
        && !isCallFunctionOn(node.right)
        && referencesTaint(node.right, tainted) && !tainted.has(node.left.text)) {
        tainted.add(node.left.text);
        changed = true;
      }
    }
  }
  return tainted;
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

function inspectTaintedUses(
  file: ts.SourceFile,
  owner: ts.FunctionLikeDeclaration,
  tainted: ReadonlySet<string>,
  allowReturn: boolean,
  helperDepth: number,
): string[] {
  const violations: string[] = [];
  for (const node of descendants(owner)) {
    if (ts.isVariableDeclaration(node) && node.initializer && referencesTaint(node.initializer, tainted)) {
      const list = node.parent;
      if (!ts.isVariableDeclarationList(list) || (list.flags & ts.NodeFlags.Const) === 0) {
        violations.push('secret-derived bindings must be const locals');
      }
    }
    if (ts.isBinaryExpression(node) && isAssignment(node.operatorToken.kind)
      && referencesTaint(node.right, tainted)
      && !(ts.isIdentifier(node.left) && isFunctionLocal(node.left.text, owner))) {
      violations.push('secret-derived assignment escapes function-local state');
    }
    if (!allowReturn && ts.isReturnStatement(node) && node.expression
      && referencesTaint(node.expression, tainted)) {
      violations.push('secret-derived expression is returned');
    }
    if (ts.isCallExpression(node) && node.arguments.some((argument) => referencesTaint(argument, tainted))) {
      violations.push(...inspectTaintedCall(file, node, tainted, helperDepth));
    }
    if (isExecutableFunction(node) && node !== owner && referencesTaint(node, tainted)) {
      violations.push('secret-derived binding is captured by a closure');
    }
  }
  return [...new Set(violations)];
}

function inspectTaintedCall(
  file: ts.SourceFile,
  call: ts.CallExpression,
  tainted: ReadonlySet<string>,
  helperDepth: number,
): string[] {
  const name = callName(call);
  if (name === 'callFunctionOn' || name === 'String') return [];
  if (name !== 'toFixedHex' || !ALLOWED_TAINTED_HELPERS.has(name) || helperDepth !== 0) {
    return ['secret-derived expression reaches a non-whitelisted call'];
  }
  const declaration = file.statements.find((statement): statement is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  if (declaration === undefined) return ['whitelisted local helper has no module-level body'];
  const helperTaint = new Set<string>(['arguments']);
  for (let index = 0; index < declaration.parameters.length; index += 1) {
    const argument = call.arguments[index];
    if (argument !== undefined && referencesTaint(argument, tainted)) {
      addBindings(helperTaint, declaration.parameters[index]!.name);
    }
  }
  const propagated = collectTaintedBindings(declaration, undefined, helperTaint);
  return inspectTaintedUses(file, declaration, propagated, true, helperDepth + 1);
}

function isCallFunctionOn(expression: ts.Expression): boolean {
  const unwrapped = ts.isAwaitExpression(expression) ? expression.expression : expression;
  return ts.isCallExpression(unwrapped) && callName(unwrapped) === 'callFunctionOn';
}

function callName(call: ts.CallExpression): string | undefined {
  if (ts.isIdentifier(call.expression)) return call.expression.text;
  if (ts.isPropertyAccessExpression(call.expression)) return call.expression.name.text;
  return undefined;
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
