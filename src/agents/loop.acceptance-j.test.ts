import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  DUPLICATE_TOOL_CALL_ID_MESSAGE,
  runAgentLoop,
  type ModelTurn,
  type ToolCall,
  type ToolDefinition,
} from './loop';
import { StubClient } from './stub';
import { TranscriptWriter, type TranscriptRecord } from './transcript';

const APPROVED_TOOL_NAMES = [
  'browser_open_session',
  'browser_navigate',
  'browser_type',
  'fill_from_vault',
  'browser_click',
  'browser_snapshot',
  'browser_close_session',
];

// Representative forbidden names only — a finite list cannot prove anything about the whole string namespace.
// The universal claim is carried by the literal exact-seven `offeredNames` assertion, which catches an eighth
// registry entry under ANY name. `list_vault` is here because it is the forbidden name a real model is likeliest
// to try: it is a genuine host tool supplied through the bootstrap context, and is deliberately not one of the
// seven the loop offers.
const CANDIDATE_TOOL_NAMES = [
  ...APPROVED_TOOL_NAMES,
  'run_shell',
  'send_debug_log',
  'browser_download',
  'constructor',
  'list_vault',
];

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

  it('rejects mutation of the offered array and preserves exactly seven tools', async () => {
    let pushError: unknown;
    let observedNames: string[] = [];
    const client = {
      nextTurn: async (_messages: unknown, tools: readonly ToolDefinition[]) => {
        try {
          (tools as ToolDefinition[]).push(fakeToolDefinition());
        } catch (error) {
          pushError = error;
        }
        observedNames = tools.map(({ name }) => name);
        return { text: 'Mutation attempted.' };
      },
    } as never;

    await runAgentLoop({
      client,
      messages: [],
      executeTool: vi.fn(),
      transcript: await transcript('frozen-tools-array'),
    });

    expect(pushError).toBeInstanceOf(TypeError);
    expect(observedNames).toEqual(APPROVED_TOOL_NAMES);
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

  it('lets approved names reach the executor and rejects representative forbidden names', async () => {
    const executedNames: string[] = [];
    for (const name of CANDIDATE_TOOL_NAMES) {
      const run = runAgentLoop({
        client: new StubClient([{ toolCalls: [{ id: `candidate-${name}`, name, input: {} }] }]),
        messages: [],
        executeTool: (call) => {
          executedNames.push(call.name);
          return { result: { ok: true } };
        },
        transcript: await transcript(`candidate-${name}`),
        maxTurns: 1,
      });
      if (APPROVED_TOOL_NAMES.includes(name)) await expect(run).resolves.toBeDefined();
      else await expect(run).rejects.toHaveProperty(
        'message', `No handler registered for tool: ${name}`,
      );
    }

    expect(new Set(executedNames)).toEqual(new Set(APPROVED_TOOL_NAMES));
    expect(executedNames).toHaveLength(APPROVED_TOOL_NAMES.length);
  });
});

describe('Acceptance J canonical model-turn snapshot', () => {
  it('reads an accessor-backed call once before passing a frozen call to the executor', async () => {
    let nameReads = 0;
    const call = {
      id: 'stable-name-1',
      get name() {
        nameReads += 1;
        return nameReads === 1 ? 'browser_snapshot' : 'run_shell';
      },
      input: {},
    };
    let executedCall: ToolCall | undefined;

    await runAgentLoop({
      client: { nextTurn: async () => ({ toolCalls: [call] }) },
      messages: [],
      executeTool: (validatedCall) => {
        executedCall = validatedCall;
        return { result: { ok: true } };
      },
      transcript: await transcript('stable-call-name'),
      maxTurns: 1,
    });

    // Accessors model defensive robustness only; model output cannot execute JavaScript here.
    expect(nameReads).toBe(1);
    expect(executedCall).toEqual({ id: 'stable-name-1', name: 'browser_snapshot', input: {} });
    expect(Object.isFrozen(executedCall)).toBe(true);
  });

  it('keeps changing call fields coherent across evidence execution result and history', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-coherent-turn-'));
    const transcriptPath = join(directory, 'transcript.jsonl');
    const writer = await TranscriptWriter.create(transcriptPath, join(directory, 'events.json'));
    const canary = 'TVC_coherent-turn_run-1_A234567BCDEF';
    const call = changingCall(canary);
    let executedCall: ToolCall | undefined;
    const result = await runAgentLoop({
      client: { nextTurn: async () => ({ extra: { preserved: true }, toolCalls: [call] } as ModelTurn) },
      messages: [],
      executeTool: (snapshot) => {
        executedCall = snapshot;
        return { result: { accepted: snapshot.input } };
      },
      transcript: writer,
      maxTurns: 1,
    });

    const expectedCall = { id: 'coherent-1', name: 'browser_type', input: { text: canary } };
    expect(executedCall).toEqual(expectedCall);
    const toolArg = result.events.find(({ channel }) => channel === 'tool-arg')!;
    expect(JSON.parse(toolArg.bytes)).toEqual(expectedCall);
    expect(coherentEvents(result.events, canary)).toEqual([
      ['tool-arg', 'tool:browser_type', 'coherent-1'],
      ['model-text', 'model-client-response', undefined],
      ['tool-result', 'tool:browser_type', 'coherent-1'],
    ]);
    expect(result.events).toContainEqual(expect.objectContaining({
      channel: 'tool-result', initiator: 'tool:browser_type', requestId: 'coherent-1',
    }));
    expect(result.messages).toEqual([
      { role: 'assistant', content: { extra: { preserved: true }, toolCalls: [expectedCall] } },
      { role: 'tool', content: {
        toolCallId: 'coherent-1', name: 'browser_type', result: { accepted: { text: canary } },
      } },
    ]);

    const records = await transcriptRecords(transcriptPath);
    const response = records.find(({ kind }) => kind === 'response')!;
    const execution = records.find(({ kind }) => kind === 'tool_exec')!;
    expect(JSON.parse(response.bytes)).toEqual({ extra: { preserved: true }, toolCalls: [expectedCall] });
    expect(result.events.find(({ initiator }) => initiator === 'model-client-response')?.bytes)
      .toBe(response.bytes);
    expect(JSON.parse(execution.bytes).toolCall).toEqual(expectedCall);
  });

  it('detects duplicate accessor-backed ids from the same canonical snapshot', async () => {
    const idReads = [0, 0];
    const calls = idReads.map((_unused, index) => changingIdCall(idReads, index));
    const executeTool = vi.fn(() => ({ result: { ok: true } }));

    await expect(runAgentLoop({
      client: { nextTurn: async () => ({ toolCalls: calls }) },
      messages: [],
      executeTool,
      transcript: await transcript('duplicate-snapshot-id'),
      maxTurns: 1,
    })).rejects.toThrow(DUPLICATE_TOOL_CALL_ID_MESSAGE);

    expect(idReads).toEqual([1, 1]);
    expect(executeTool).toHaveBeenCalledTimes(1);
  });
});

describe('Acceptance J source pin', () => {
  it('pins gate and compile-fixture source-text presence while runtime results prove execution', async () => {
    const [integritySource, compileFixture] = await Promise.all([
      readFile(new URL('../../testbed/acceptance-j.integrity.test.ts', import.meta.url), 'utf8'),
      readFile(new URL('./loop.options.negative.ts', import.meta.url), 'utf8'),
    ]);
    expect(integritySource).toContain(
      "const ACCEPTANCE_J_TEST = 'src/agents/loop.acceptance-j.test.ts';",
    );
    expect(integritySource).toContain('expect(acceptanceSource).toContain(assertion);');
    expect(compileFixture).toContain('// @ts-expect-error');
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

function fakeToolDefinition(): ToolDefinition {
  return { name: 'run_shell', description: 'mutant', inputSchema: {} };
}

function changingCall(canary: string): ToolCall {
  let idReads = 0;
  let nameReads = 0;
  let inputReads = 0;
  return {
    get id() { idReads += 1; return idReads === 1 ? 'coherent-1' : 'wrong-id'; },
    get name() { nameReads += 1; return nameReads === 1 ? 'browser_type' : 'browser_click'; },
    get input() {
      inputReads += 1;
      return inputReads === 1 ? { text: canary } : { text: 'canary-was-lost' };
    },
  };
}

function changingIdCall(reads: number[], index: number): ToolCall {
  return {
    get id() {
      reads[index] += 1;
      return reads[index] === 1 ? 'duplicate-id' : `later-unique-${index}`;
    },
    name: 'browser_snapshot',
    input: {},
  };
}

function coherentEvents(
  events: readonly { channel: string; initiator?: string; requestId?: string; bytes: string }[],
  canary: string,
): Array<[string, string | undefined, string | undefined]> {
  return events.filter(({ bytes }) => bytes.includes(canary))
    .map(({ channel, initiator, requestId }) => [channel, initiator, requestId]);
}

async function transcriptRecords(path: string): Promise<TranscriptRecord[]> {
  return (await readFile(path, 'utf8')).trim().split('\n')
    .map((line) => JSON.parse(line) as TranscriptRecord);
}
