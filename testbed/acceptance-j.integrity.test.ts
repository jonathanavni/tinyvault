import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const ACCEPTANCE_J_TEST = 'src/agents/loop.acceptance-j.test.ts';
const REQUIRED_ACCEPTANCE_J_ASSERTIONS = [
  'expect(offeredNames).toEqual(APPROVED_TOOL_NAMES);',
  'expect(offeredTools.every(isDeeplyFrozenDefinition)).toBe(true);',
  'expect(executeTool).not.toHaveBeenCalled();',
  'expect(capableExecutor).not.toHaveBeenCalled();',
  "expect(executedName).toBe('browser_snapshot');",
  'expect(PUBLIC_OPTION_KEYS_ARE_EXACT).toBe(true);',
];

describe('Acceptance J gate integrity', () => {
  // This pins test presence only; it does not independently prove the security property.
  it('pins the Acceptance J test file and its required assertions', async () => {
    const acceptanceSource = await readFile(ACCEPTANCE_J_TEST, 'utf8');
    for (const assertion of REQUIRED_ACCEPTANCE_J_ASSERTIONS) {
      expect(acceptanceSource).toContain(assertion);
    }
  });
});
