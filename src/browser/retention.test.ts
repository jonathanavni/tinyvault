import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const RETENTION_SOURCE_FILES = ['src/browser/session.ts'] as const;

describe('secret-derived local retention structure', () => {
  it('kills property, helper-call, length, destructuring, and module-let retention mutants', async () => {
    for (const file of RETENTION_SOURCE_FILES) {
      const source = await readFile(resolve(file), 'utf8');
      expect(retentionViolations(source, file)).toEqual([]);
      const marker = "    const lengthDigits = String(value.length).padStart(4, '0');";
      expect(source).toContain(marker);
      const mutants = [
        // Mutant: this.#lastPadded = padded (property retention).
        source.replace(marker, `${marker}\n    this.#lastPadded = hex;`),
        // Mutant: retain(hex) (helper-call escape).
        source.replace(marker, `${marker}\n    retain(hex);`),
        // Mutant: this.#lastLen = value.length (derived length retention).
        source.replace(marker, `${marker}\n    this.#lastLen = value.length;`),
        // Mutant: destructured length stored outside the local.
        source.replace(marker, `${marker}\n    const { length } = value;\n    moduleStash = length;`),
        // Mutant: module-level let receives a secret-derived local.
        `let moduleStash;\n${source.replace(marker, `${marker}\n    moduleStash = hex;`)}`,
      ];
      for (const mutant of mutants) expect(retentionViolations(mutant, file)).not.toEqual([]);
    }
  });
});

function retentionViolations(source: string, fileName: string): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const consumeCalls = descendants(file).filter(isConsumeCall);
  if (consumeCalls.length !== 1) return [`expected one consume call, got ${consumeCalls.length}`];
  const owner = enclosingFunction(consumeCalls[0]!);
  if (owner === undefined) return ['consume call has no function owner'];
  const tainted = collectTaintedBindings(owner, consumeCalls[0]!);
  return inspectTaintedUses(owner, tainted);
}

function collectTaintedBindings(owner: ts.FunctionLikeDeclaration, consume: ts.CallExpression): Set<string> {
  const tainted = new Set<string>(['arguments']);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of descendants(owner)) {
      if (!ts.isVariableDeclaration(node) || node.initializer === undefined) continue;
      if (isWhitelistedSink(node.initializer)) continue;
      if (!containsNode(node.initializer, consume) && !referencesTaint(node.initializer, tainted)) continue;
      for (const name of bindingNames(node.name)) {
        if (!tainted.has(name)) { tainted.add(name); changed = true; }
      }
    }
  }
  return tainted;
}

function inspectTaintedUses(owner: ts.FunctionLikeDeclaration, tainted: ReadonlySet<string>): string[] {
  const violations: string[] = [];
  for (const node of descendants(owner)) {
    if (ts.isVariableDeclaration(node) && node.initializer && referencesTaint(node.initializer, tainted)) {
      const list = node.parent;
      if (!ts.isVariableDeclarationList(list) || (list.flags & ts.NodeFlags.Const) === 0) {
        violations.push('secret-derived bindings must be const locals');
      }
    }
    if (ts.isBinaryExpression(node) && isAssignment(node.operatorToken.kind)
      && referencesTaint(node.right, tainted)) violations.push('secret-derived assignment escapes a const local');
    if (ts.isReturnStatement(node) && node.expression && referencesTaint(node.expression, tainted)) {
      violations.push('secret-derived expression is returned');
    }
    if (ts.isCallExpression(node) && node.arguments.some((argument) => referencesTaint(argument, tainted))
      && !allowedTaintedCall(node)) violations.push('secret-derived expression reaches a non-whitelisted call');
    if (isExecutableFunction(node) && node !== owner && referencesTaint(node, tainted)) {
      violations.push('secret-derived binding is captured by a closure');
    }
  }
  return [...new Set(violations)];
}

function allowedTaintedCall(call: ts.CallExpression): boolean {
  if (callName(call) === 'callFunctionOn') return true;
  const declaration = enclosingVariableDeclaration(call);
  return declaration !== undefined && declaration.initializer !== undefined
    && containsNode(declaration.initializer, call);
}

function isWhitelistedSink(expression: ts.Expression): boolean {
  const unwrapped = ts.isAwaitExpression(expression) ? expression.expression : expression;
  return ts.isCallExpression(unwrapped) && callName(unwrapped) === 'callFunctionOn';
}

function callName(call: ts.CallExpression): string | undefined {
  if (ts.isIdentifier(call.expression)) return call.expression.text;
  if (ts.isPropertyAccessExpression(call.expression)) return call.expression.name.text;
  return undefined;
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

function enclosingVariableDeclaration(node: ts.Node): ts.VariableDeclaration | undefined {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isVariableDeclaration(parent)) return parent;
    if (ts.isStatement(parent)) return undefined;
  }
  return undefined;
}

function isAssignment(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}
