import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  runAgentLoop,
  type AgentLoopOptions,
  type ToolDefinition,
} from './loop';
import { StubClient } from './stub';
import { TranscriptWriter } from './transcript';

const APPROVED_TOOL_NAMES = [
  'browser_open_session',
  'browser_navigate',
  'browser_type',
  'fill_from_vault',
  'browser_click',
  'browser_snapshot',
  'browser_close_session',
];

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? (<Value>() => Value extends Right ? 1 : 2) extends
      (<Value>() => Value extends Left ? 1 : 2) ? true : false
    : false;

type ExpectedOptionKeys =
  | 'afterLoop'
  | 'client'
  | 'executeTool'
  | 'maxTurns'
  | 'messages'
  | 'secretSources'
  | 'transcript';

const PUBLIC_OPTION_KEYS_ARE_EXACT: Equal<keyof AgentLoopOptions, ExpectedOptionKeys> = true;

describe('Acceptance J runtime tool boundary', () => {
  it('offers exactly the seven runtime-owned, deeply frozen definitions', async () => {
    let offeredTools: readonly ToolDefinition[] = [];
    const client = {
      nextTurn: async (_messages: unknown, tools: readonly ToolDefinition[]) => {
        offeredTools = tools;
        return { text: 'Tool inventory observed.' };
      },
    } as never;

    await runAgentLoop({
      client,
      messages: [],
      executeTool: vi.fn(),
      transcript: await transcript('exact-tools'),
    });

    const offeredNames = offeredTools.map(({ name }) => name);
    expect(offeredNames).toEqual(APPROVED_TOOL_NAMES);
    expect(Object.isFrozen(offeredTools)).toBe(true);
    expect(offeredTools.every(isDeeplyFrozenDefinition)).toBe(true);
  });
});

describe('Acceptance J runtime rejection', () => {
  it('rejects an unoffered run_shell call before invoking the executor', async () => {
    const executeTool = vi.fn(() => ({ result: { executed: true } }));
    await expect(runAgentLoop({
      client: runShellClient(),
      messages: [],
      executeTool,
      transcript: await transcript('reject-run-shell'),
    })).rejects.toHaveProperty('message', 'No handler registered for tool: run_shell');
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('cannot reach an executor that is capable of handling run_shell', async () => {
    const capableExecutor = vi.fn((call: { name: string }) => ({
      result: call.name === 'run_shell' ? { shellRan: true } : { shellRan: false },
    }));
    await expect(runAgentLoop({
      client: runShellClient(),
      messages: [],
      executeTool: capableExecutor,
      transcript: await transcript('capable-run-shell'),
    })).rejects.toHaveProperty('message', 'No handler registered for tool: run_shell');
    expect(capableExecutor).not.toHaveBeenCalled();
  });
});

describe('Acceptance J validated call snapshot', () => {
  it('passes the executor a frozen snapshot of the validated call name', async () => {
    let insideExecutor = false;
    const call = {
      id: 'stable-name-1',
      get name() { return insideExecutor ? 'run_shell' : 'browser_snapshot'; },
      input: {},
    };
    let executedName = '';
    await runAgentLoop({
      client: { nextTurn: async () => ({ toolCalls: [call] }) },
      messages: [],
      executeTool: (validatedCall) => {
        insideExecutor = true;
        executedName = validatedCall.name;
        expect(Object.isFrozen(validatedCall)).toBe(true);
        return { result: { ok: true } };
      },
      transcript: await transcript('stable-call-name'),
      maxTurns: 1,
    });
    expect(executedName).toBe('browser_snapshot');
  });

  it('exposes no caller option for supplying or extending tools or handlers', () => {
    expect(PUBLIC_OPTION_KEYS_ARE_EXACT).toBe(true);
  });
});

describe('Acceptance J gate pin', () => {
  it('pins the separate gate-integrity test presence, not the security property', async () => {
    const integritySource = await readFile(
      new URL('../../testbed/acceptance-j.integrity.test.ts', import.meta.url),
      'utf8',
    );
    expect(integritySource).toContain(
      "const ACCEPTANCE_J_TEST = 'src/agents/loop.acceptance-j.test.ts';",
    );
    expect(integritySource).toContain('expect(acceptanceSource).toContain(assertion);');
  });
});

function runShellClient(): StubClient {
  return new StubClient([{
    toolCalls: [{ id: 'shell-1', name: 'run_shell', input: { command: 'true' } }],
  }]);
}

async function transcript(label: string): Promise<TranscriptWriter> {
  const directory = await mkdtemp(join(tmpdir(), `tinyvault-${label}-`));
  return TranscriptWriter.create(
    join(directory, 'transcript.jsonl'),
    join(directory, 'events.json'),
  );
}

function isDeeplyFrozenDefinition(definition: ToolDefinition): boolean {
  return Object.isFrozen(definition)
    && Object.isFrozen(definition.inputSchema)
    && Array.isArray(definition.inputSchema.required)
    && Object.isFrozen(definition.inputSchema.required);
}
