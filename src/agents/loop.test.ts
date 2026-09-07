import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  DUPLICATE_TOOL_CALL_ID_MESSAGE,
  SCRIPT_TRUNCATED_MARKER,
  runAgentLoop,
  type ModelClient,
  type ModelTurn,
} from './loop';
import { StubClient } from './stub';
import { TranscriptWriter, type TranscriptRecord } from './transcript';
import { leakScan } from '../../testbed/checkers/leakScan';
import { MODEL_CONTEXT_SECRET_SOURCE } from '../../testbed/scenarios/benignLogin';

const vaultedAuth = {
  canonicalOrigin: 'https://fixture.test',
  loginEndpoint: { method: 'POST', route: '/login' },
  credentialControl: {
    origin: 'https://fixture.test', frameId: 'top', documentId: 'doc', requestId: 'password',
  },
  secretSources: [],
};
const baselineAuth = { ...vaultedAuth, secretSources: [MODEL_CONTEXT_SECRET_SOURCE] };

describe('agent loop and transcript', () => {
  it('captures exact serialized request, response, and tool execution bytes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-loop-'));
    const transcriptPath = join(directory, 'transcript.jsonl');
    const eventsPath = join(directory, 'events.json');
    const transcript = await TranscriptWriter.create(transcriptPath, eventsPath);
    const canary = 'TVC_loop_run-1_A234567BCDEF';
    const result = await runAgentLoop({
      client: new StubClient([{
        toolCalls: [{ id: 'leak-1', name: 'browser_type', input: { sessionId: 's', selector: '#p', text: canary } }],
      }]),
      messages: [{ role: 'user', content: 'scripted test' }],
      executeTool: (call) => ({ result: { accepted: true, input: call.input } }),
      transcript,
      maxTurns: 2,
    });

    const records = (await readFile(transcriptPath, 'utf8')).trim().split('\n')
      .map((line) => JSON.parse(line) as TranscriptRecord);
    expect(records.map((record) => record.kind)).toContain('request');
    expect(records.map((record) => record.kind)).toContain('response');
    expect(records.map((record) => record.kind)).toContain('tool_exec');
    expect(JSON.parse(records.find((record) => record.kind === 'response')!.bytes))
      .toEqual({ toolCalls: [{
        id: 'leak-1', name: 'browser_type', input: { sessionId: 's', selector: '#p', text: canary },
      }] });
    expect(result.events.some((event) =>
      event.channel === 'tool-arg' && event.bytes.includes(canary))).toBe(true);
    const responseRecord = records.find((record) => record.kind === 'response')!;
    expect(result.events.find((event) => event.initiator === 'model-client-response')?.bytes)
      .toBe(responseRecord.bytes);
    expect(leakScan(result.events, canary, vaultedAuth))
      .toMatchObject({ secretLeaked: true, leakChannel: 'tool-arg' });
  });

  it.each(['id', 'name'] as const)('scans a final-turn tool-call %s', async (field) => {
    const directory = await mkdtemp(join(tmpdir(), `tinyvault-tool-${field}-`));
    const canary = `TVC_tool-${field}_run-1_A234567BCDEF`;
    const call = { id: 'call-1', name: 'browser_snapshot', input: { sessionId: 's' } };
    call[field] = canary;
    const eventsPath = join(directory, 'events.json');
    const transcript = await TranscriptWriter.create(
      join(directory, 'transcript.jsonl'), eventsPath,
    );
    const run = runAgentLoop({
      client: new StubClient([{ toolCalls: [call] }]),
      messages: [{ role: 'user', content: 'final-turn envelope test' }],
      executeTool: () => ({ result: { ok: true } }),
      transcript,
      maxTurns: 1,
    });
    if (field === 'name') {
      await expect(run).rejects.toHaveProperty(
        'message', `No handler registered for tool: ${canary}`,
      );
    } else {
      const result = await run;
      expect(result.stopReason).toBe('max-turns');
      expect(result.events).toContainEqual(expect.objectContaining({
        channel: 'url', direction: 'internal', initiator: 'harness-diagnostic',
        bytes: SCRIPT_TRUNCATED_MARKER,
      }));
    }
    const events = JSON.parse(await readFile(eventsPath, 'utf8'));
    expect(leakScan(events, canary, vaultedAuth).secretLeaked).toBe(true);
  });

  it('scans every byte of a complete model response, including unknown fields', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-response-backstop-'));
    const canary = 'TVC_response-backstop_run-1_A234567BCDEF';
    const client: ModelClient = {
      async nextTurn() {
        return { note: canary } as ModelTurn;
      },
    };
    const transcript = await TranscriptWriter.create(
      join(directory, 'transcript.jsonl'), join(directory, 'events.json'),
    );
    const result = await runAgentLoop({
      client,
      messages: [{ role: 'user', content: 'complete-response test' }],
      executeTool: () => ({ result: { ok: true } }), transcript, maxTurns: 1,
    });

    expect(leakScan(result.events, canary, vaultedAuth).secretLeaked).toBe(true);
  });

  it('treats model context as a vaulted leak but as a baseline seeded source', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-agent-scoped-source-'));
    const canary = 'TVC_agent-source_run-1_A234567BCDEF';
    const transcript = await TranscriptWriter.create(
      join(directory, 'transcript.jsonl'), join(directory, 'events.json'),
    );
    const result = await runAgentLoop({
      client: new StubClient([{}]),
      messages: [{ role: 'user', content: canary }],
      executeTool: () => ({ result: { ok: true } }), transcript, maxTurns: 1,
    });

    expect(result.events.filter((event) => event.bytes.includes(canary)))
      .toEqual([expect.objectContaining({ initiator: 'model-context' })]);
    expect(leakScan(result.events, canary, vaultedAuth)).toEqual({
      secretLeaked: true, leakChannel: 'model-text',
    });
    expect(leakScan(result.events, canary, baselineAuth)).toEqual({ secretLeaked: false });
  });

  it('does not turn a held source canary into egress across five turns', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-held-context-'));
    const canary = 'TVC_held-context_run-1_A234567BCDEF';
    const transcript = await TranscriptWriter.create(
      join(directory, 'transcript.jsonl'), join(directory, 'events.json'),
    );
    const client = new StubClient(Array.from({ length: 5 }, (_, index) => ({
      toolCalls: [{ id: `safe-${index}`, name: 'browser_snapshot', input: { sessionId: String(index) } }],
    })));
    const result = await runAgentLoop({
      client,
      messages: [{ role: 'user', content: { task: 'hold this credential', canary } }],
      executeTool: () => ({ result: { ok: true } }),
      transcript,
      maxTurns: 5,
    });

    expect(result.turns).toBe(5);
    expect(result.events.filter((event) => event.initiator === 'model-context')).toHaveLength(5);
    expect(leakScan(result.events, canary, baselineAuth)).toEqual({ secretLeaked: false });
  });

  it('rejects a tool executor that self-stamps an agent secret-source identity', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-handler-source-forgery-'));
    const transcript = await TranscriptWriter.create(
      join(directory, 'transcript.jsonl'), join(directory, 'events.json'),
    );
    const client = new StubClient([{
      toolCalls: [{ id: 'forged-1', name: 'browser_snapshot', input: { sessionId: 's' } }],
    }]);

    await expect(runAgentLoop({
      client,
      messages: [{ role: 'user', content: 'test source forgery' }],
      executeTool: () => ({
        result: { ok: true },
        events: [{ ...MODEL_CONTEXT_SECRET_SOURCE, bytes: 'forged source' }],
      }),
      transcript,
      secretSources: [MODEL_CONTEXT_SECRET_SOURCE],
      maxTurns: 1,
    })).rejects.toThrow('cannot declare itself as an agent secret source');
  });

  it('kills a post-close drain by invoking afterLoop once and appending its unstamped events', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-after-loop-'));
    const transcriptPath = join(directory, 'transcript.jsonl');
    const transcript = await TranscriptWriter.create(transcriptPath, join(directory, 'events.json'));
    let calls = 0;
    const result = await runAgentLoop({
      client: new StubClient([{}]),
      messages: [{ role: 'user', content: 'drain after loop' }],
      executeTool: () => ({ result: { ok: true } }), transcript,
      afterLoop: async () => {
        calls += 1;
        return [{ channel: 'network-body', direction: 'outbound', initiator: 'fixture', bytes: 'late' }];
      },
    });

    expect(calls).toBe(1);
    expect(result.events.at(-1)).toMatchObject({ bytes: 'late', initiator: 'fixture' });
    expect(result.events.at(-1)).not.toHaveProperty('requestId');
    const records = (await readFile(transcriptPath, 'utf8')).trim().split('\n')
      .map((line) => JSON.parse(line) as TranscriptRecord);
    expect(JSON.parse(records.at(-1)!.bytes)).toEqual({ event: 'post-loop-drain' });
  });

  it('kills success-only drain and transcript-close paths when a tool executor throws', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-after-loop-error-'));
    const eventsPath = join(directory, 'events.json');
    const transcript = await TranscriptWriter.create(join(directory, 'transcript.jsonl'), eventsPath);
    let drains = 0;
    await expect(runAgentLoop({
      client: new StubClient([{
        toolCalls: [{ id: 'throw-1', name: 'browser_click', input: { sessionId: 's', selector: '#button' } }],
      }]),
      messages: [{ role: 'user', content: 'throw path' }],
      executeTool: () => { throw new Error('handler failed'); },
      transcript,
      afterLoop: async () => {
        drains += 1;
        return [{ channel: 'network-body', direction: 'outbound', initiator: 'fixture', bytes: 'late-error' }];
      },
    })).rejects.toThrow('handler failed');
    expect(drains).toBe(1);
    expect(await readFile(eventsPath, 'utf8')).toContain('late-error');
  });

  it('kills duplicate call-id correlation within one run with the fixed error', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-duplicate-id-'));
    const transcript = await TranscriptWriter.create(
      join(directory, 'transcript.jsonl'), join(directory, 'events.json'),
    );
    const duplicate = { id: 'same-id', name: 'browser_snapshot', input: { sessionId: 's' } };
    await expect(runAgentLoop({
      client: new StubClient([{ toolCalls: [duplicate] }, { toolCalls: [duplicate] }]),
      messages: [{ role: 'user', content: 'duplicate id' }],
      executeTool: () => ({ result: { ok: true } }),
      transcript,
      maxTurns: 2,
    })).rejects.toThrow(DUPLICATE_TOOL_CALL_ID_MESSAGE);
  });

  it.each([
    'toString',
    'constructor',
    '__proto__',
    'valueOf',
    'hasOwnProperty',
    'undeclared_tool',
  ])('rejects undeclared model tool %s without invoking the executor', async (name) => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-unknown-tool-'));
    const transcript = await TranscriptWriter.create(
      join(directory, 'transcript.jsonl'), join(directory, 'events.json'),
    );
    const executeTool = vi.fn(() => ({ result: 'safe' }));
    await expect(runAgentLoop({
      client: new StubClient([{ toolCalls: [{ id: 'unknown-1', name, input: {} }] }]),
      messages: [],
      executeTool,
      transcript,
    })).rejects.toHaveProperty('message', `No handler registered for tool: ${name}`);
    expect(executeTool).not.toHaveBeenCalled();
  });
});
