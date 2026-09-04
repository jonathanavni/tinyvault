import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const ACCEPTANCE_J_TEST = 'src/agents/loop.acceptance-j.test.ts';
const OPTION_COMPILE_FIXTURE = 'src/agents/loop.options.negative.ts';
const REQUIRED_ACCEPTANCE_J_ASSERTIONS = [
  'expect(offeredNames).toEqual(APPROVED_TOOL_NAMES);',
  'expect(Object.isFrozen(offeredTools)).toBe(true);',
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
  'const PUBLIC_OPTION_KEYS_ARE_EXACT: Equal<keyof AgentLoopOptions, ExpectedOptionKeys> = true;',
  'tools: [],',
  'handlers: {},',
];

describe('Acceptance J source-text integrity pin', () => {
  // This proves source-text presence only: comments or coordinated edits to code and tests can satisfy it.
  // scripts/check-acceptance-j-results.mjs proves that the ten named runtime tests ran and passed,
  // not that every pinned assertion executed. This limitation is a declared residual.
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
