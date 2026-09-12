import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { EVALUATED_AGENT_TOOLS } from '../../agents/loop';
import { TOOLS } from './tools';
const names = ['list_vault', 'fill_from_vault', 'request_vault_setup', 'browser_open_session',
  'browser_close_session', 'browser_navigate', 'browser_click', 'browser_type', 'browser_snapshot'];
describe('T-SCHEMA fixed surface', () => {
  it('keeps nine definitions in order and the seven registry objects by reference', () => {
    expect(TOOLS.map(tool => tool.name)).toEqual(names);
    for (const original of EVALUATED_AGENT_TOOLS) expect(TOOLS.find(tool => tool.name === original.name)).toBe(original);
    expect(createHash('sha256').update(JSON.stringify(EVALUATED_AGENT_TOOLS)).digest('hex'))
      .toBe('c7475344b94ebcc4748970c168330a8e3d9106c24e2e9213000386ec16d27d12');
    const frozen = (value: unknown) => {
      if (value && typeof value === 'object') {
        expect(Object.isFrozen(value)).toBe(true); Object.values(value).forEach(frozen);
      }
    };
    frozen(TOOLS);
  });
  it('pins both handwritten definitions exactly', () => {
    expect(TOOLS[0]).toEqual({ name: 'list_vault', description: 'TinyVault supervised list_vault operation.',
      inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false } });
    expect(TOOLS[2]).toEqual({ name: 'request_vault_setup', description: 'TinyVault supervised request_vault_setup operation.',
      inputSchema: { type: 'object', properties: { reason: { type: 'string', enum: ['missing_item', 'backend_locked', 'backend_unavailable'] } },
        required: ['reason'], additionalProperties: false } });
  });
  it('pins the dispatch case clauses to the same nine names in order', () => {
    const source = ts.createSourceFile('tools.ts', readFileSync('src/adapters/mcp/tools.ts', 'utf8'), ts.ScriptTarget.Latest, true);
    const cases: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isCaseClause(node)) { expect(ts.isStringLiteral(node.expression)).toBe(true); cases.push((node.expression as ts.StringLiteral).text); }
      ts.forEachChild(node, visit);
    };
    visit(source); expect(cases).toEqual(names);
  });
});
