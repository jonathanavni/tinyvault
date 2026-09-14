import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { launchChromium, type Browser } from './playwright';

describe('M8-C5 browser signal ownership', () => {
  it('preserves the exact default launch options for existing callers', async () => {
    const browser = {} as Browser; const launch = vi.fn(async () => browser);
    expect(await launchChromium({ launch }, ['--test-argument'])).toBe(browser);
    expect(launch).toHaveBeenCalledExactlyOnceWith({
      headless: true, args: ['--disable-back-forward-cache', '--test-argument'],
    });
  });
  it('disables all three Playwright handlers only for explicit false', async () => {
    const browser = {} as Browser; const launch = vi.fn(async () => browser);
    expect(await launchChromium({ launch }, [], false)).toBe(browser);
    expect(launch).toHaveBeenCalledExactlyOnceWith({
      headless: true, args: ['--disable-back-forward-cache'],
      handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
    });
  });
});

// Execute the actual private pin and its actual key/wrapper helpers, without importing
// the core test module (which would register its entire suite a second time). Source is
// trusted repository code, never model/page data; no guard implementation is copied.
it('M8-C5 permits only the literal signal option at the MCP callsite', () => {
  const file = 'src/core/fillService.authority.structure.test.ts';
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const names = ['unwrap', 'staticKey', 'propertyText', 'inspectHostShape'];
  const functions = source.statements.filter(ts.isFunctionDeclaration).filter(node => names.includes(node.name?.text ?? ''));
  expect(functions.map(node => node.name!.text).sort()).toEqual([...names].sort());
  const javascript = ts.transpileModule(functions.map(node => node.getText(source)).join('\n'),
    { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.None } }).outputText;
  const pin = new Function('ts', javascript + '; return inspectHostShape;')(ts) as
    (graph: { checker: ts.TypeChecker }, call: ts.CallExpression) => string[];
  const graph = { checker: ts.createProgram([], {}).getTypeChecker() };
  const inspect = (filename: string, argument: string) => {
    const parsed = ts.createSourceFile(filename, `createSupervisedHost(${argument});`, ts.ScriptTarget.Latest, true);
    return pin(graph, (parsed.statements[0] as ts.ExpressionStatement).expression as ts.CallExpression);
  };
  const mcp = 'src/adapters/mcp/main.ts';
  expect(inspect(mcp, '{ backend, canary, handleSignals: false }')).toEqual([]);
  for (const option of ['handleSignals: true', 'handleSignals: false && false',
    "['handleSignals']: false", "'handleSignals': false", 'handleSignals', '...{ handleSignals: false }']) {
    expect(inspect(mcp, `{ backend, canary, ${option} }`).length).toBeGreaterThan(0);
  }
  expect(inspect('testbed/runnerExecution.ts', '{ backend, canary }')).toEqual([]);
  expect(inspect('testbed/runnerExecution.ts', '{ backend, canary, handleSignals: false }'))
    .toEqual(['host-argument-key:handleSignals']);
});
