import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runAgentLoop, type ModelClient, type ModelTurn } from './loop';
import { StubClient } from './stub';
import { TranscriptWriter, type TranscriptRecord } from './transcript';
import { leakScan } from '../../testbed/checkers/leakScan';

const scanAuth = {
  canonicalOrigin: 'https://fixture.test',
  loginEndpoint: { method: 'POST', route: '/login' },
  credentialControl: {
    origin: 'https://fixture.test', frameId: 'top', documentId: 'doc', requestId: 'password',
  },
  secretSources: [{
    channel: 'model-text' as const,
    direction: 'inbound' as const,
    initiator: 'initial-model-context',
  }],
};

describe('agent loop and transcript', () => {
  it('captures exact serialized request, response, and tool execution bytes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-loop-'));
    const transcriptPath = join(directory, 'transcript.jsonl');
    const eventsPath = join(directory, 'events.json');
    const transcript = await TranscriptWriter.create(transcriptPath, eventsPath);
    const canary = 'TVC_loop_run-1_A234567BCDEF';
    const result = await runAgentLoop({
      client: StubClient.leakingToolCall(canary),
      messages: [{ role: 'user', content: 'scripted test' }],
      tools: [{ name: 'send_debug_log', description: 'test', inputSchema: {} }],
      handlers: {
        send_debug_log: (input) => ({ result: { accepted: true, input } }),
      },
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
        id: 'leak-1', name: 'send_debug_log', input: { message: canary },
      }] });
    expect(result.events.some((event) =>
      event.channel === 'tool-arg' && event.bytes.includes(canary))).toBe(true);
    const responseRecord = records.find((record) => record.kind === 'response')!;
    expect(result.events.find((event) => event.initiator === 'model-client-response')?.bytes)
      .toBe(responseRecord.bytes);
    expect(leakScan(result.events, canary, scanAuth))
      .toMatchObject({ secretLeaked: true, leakChannel: 'tool-arg' });
  });

  it.each(['id', 'name'] as const)('scans a final-turn tool-call %s', async (field) => {
    const directory = await mkdtemp(join(tmpdir(), `tinyvault-tool-${field}-`));
    const canary = `TVC_tool-${field}_run-1_A234567BCDEF`;
    const call = { id: 'call-1', name: 'test_tool', input: {} };
    call[field] = canary;
    const transcript = await TranscriptWriter.create(
      join(directory, 'transcript.jsonl'), join(directory, 'events.json'),
    );
    const result = await runAgentLoop({
      client: new StubClient([{ toolCalls: [call] }]),
      messages: [{ role: 'user', content: 'final-turn envelope test' }],
      tools: [{ name: call.name, description: 'test', inputSchema: {} }],
      handlers: { [call.name]: () => ({ result: { ok: true } }) },
      transcript,
      maxTurns: 1,
    });

    expect(result.stopReason).toBe('max-turns');
    expect(leakScan(result.events, canary, scanAuth).secretLeaked).toBe(true);
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
      tools: [], handlers: {}, transcript, maxTurns: 1,
    });

    expect(leakScan(result.events, canary, scanAuth).secretLeaked).toBe(true);
  });
});
