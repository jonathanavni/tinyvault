import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const ACCEPTANCE_J_TEST = 'src/agents/loop.acceptance-j.test.ts';
const OPTION_COMPILE_FIXTURE = 'src/agents/loop.options.negative.ts';
const REQUIRED_ACCEPTANCE_J_ASSERTIONS = [
  'expect(offeredNames).toEqual(APPROVED_TOOL_NAMES);',
  'expect(offeredTools.every(isDeeplyFrozenDefinition)).toBe(true);',
  'expect(pushError).toBeInstanceOf(TypeError);',
  'expect(executeTool).not.toHaveBeenCalled();',
  'expect(capableExecutor).not.toHaveBeenCalled();',
  'expect(new Set(executedNames)).toEqual(new Set(APPROVED_TOOL_NAMES));',
  'expect(nameReads).toBe(1);',
  'expect(executedCall).toEqual(expectedCall);',
  'expect(JSON.parse(toolArg.bytes)).toEqual(expectedCall);',
  'expect(idReads).toEqual([1, 1]);',
];
const REQUIRED_COMPILE_FIXTURE_TEXT = [
  '// @ts-expect-error The evaluated tool registry is runtime-owned',
  '// @ts-expect-error Callers provide one executor',
  'tools: [],',
  'handlers: {},',
];

describe('Acceptance J source-text integrity pin', () => {
  // This proves source-text presence only. scripts/check-acceptance-j-results.mjs separately
  // proves that the exact required runtime tests executed and passed without skip or todo.
  it('pins required Acceptance J assertions and negative compile fixtures by source text', async () => {
    const [acceptanceSource, compileSource] = await Promise.all([
      readFile(ACCEPTANCE_J_TEST, 'utf8'),
      readFile(OPTION_COMPILE_FIXTURE, 'utf8'),
    ]);
    for (const assertion of REQUIRED_ACCEPTANCE_J_ASSERTIONS) {
      expect(acceptanceSource).toContain(assertion);
    }
    for (const fixtureText of REQUIRED_COMPILE_FIXTURE_TEXT) {
      expect(compileSource).toContain(fixtureText);
    }
  });
});
