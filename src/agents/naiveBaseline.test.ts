import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createNaiveBaselineProfile } from './naiveBaseline';
import { runAgentProfile } from './prompt';
import { TranscriptWriter, eventIdentityMatches } from './transcript';
import { StubClient } from './stub';
import { createBenignLoginScenario } from '../../testbed/scenarios/benignLogin';
import { AnthropicModelClient, ANTHROPIC_MODEL, ANTHROPIC_SDK_VERSION } from './anthropicClient';
import { leakScan } from '../../testbed/checkers/leakScan';

import { createAgentInventory, sourcesForAgentRun } from '../../testbed/evalAgents';
const trustedSources = () => sourcesForAgentRun('naive-baseline', createAgentInventory('real-comparison', ANTHROPIC_SDK_VERSION).get('naive-baseline')!, 'run_A');

const task = createBenignLoginScenario('http://fixture.test').publicTask('run_A');
const password = 'TVC_SYNTHETIC_BASELINE_TEST_PASSWORD';
const profile = () => createNaiveBaselineProfile({ runId: 'run_A', task, password });
async function sink() { const dir = await mkdtemp(join(tmpdir(), 's3-naive-')); return TranscriptWriter.create(join(dir, 'transcript.jsonl'), join(dir, 'events.json')); }

describe('S3 baseline profile adapter', () => {
  it('rejects oversized complete baseline tasks without shortening credentials or run IDs', () => {
    expect(() => createNaiveBaselineProfile({ runId: 'run_A', task, password: 'complete_credential_'.repeat(100) })).toThrow('1024');
    expect(() => createNaiveBaselineProfile({ runId: 'long_run_'.repeat(100), task, password })).toThrow('1024');
  });
  it('seeds only the supplied synthetic password with the same public task and no vault handle', () => {
    const prepared = profile();
    expect(prepared.bootstrapTask).toEqual({ ...task, password });
    expect(prepared.system).toContain('browser_type');
    expect(JSON.stringify(prepared.bootstrapTask)).not.toContain('handle');
    expect(trustedSources()).toHaveLength(33);
    expect(trustedSources().every(source => source.documentId === 'run_A' && source.direction === 'internal')).toBe(true);
  });
  it('stamps finite producer identity while retaining newly emitted canary outside exemptions', async () => {
    const prepared = profile();
    const run = async (text: string) => runAgentProfile(prepared, {
      createClient: options => new AnthropicModelClient({ ...options, apiKey: 'synthetic-key', fetch: async () => new Response(JSON.stringify({
        id: 'message', type: 'message', role: 'assistant', model: ANTHROPIC_MODEL, content: [{ type: 'text', text }],
        stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
      }), { headers: { 'content-type': 'application/json' } }) }), executeTool: vi.fn(), transcript: await sink(),
    });
    const result = await run(password);
    const sources = result.events.filter(event => trustedSources().some(source => eventIdentityMatches(event, source)));
    expect(sources.map(event => [event.initiator, event.documentId, event.requestId])).toEqual([
      ['baseline-bootstrap', 'run_A', 'bootstrap'], ['model-context', 'run_A', 'turn:0'],
      ['sdk-request-context', 'run_A', 'turn:0'],
    ]);
    expect(sources.every(event => event.bytes.includes(password))).toBe(true);
    const emitted = result.events.filter(event => event.direction === 'outbound');
    expect(emitted.some(event => event.bytes.includes(password))).toBe(true);
    expect(emitted.some(event => trustedSources().some(source => eventIdentityMatches(event, source)))).toBe(false);
    const auth = { ...createBenignLoginScenario('http://fixture.test').authForRun('run_A', 'nonce'), secretSources: [...trustedSources()] };
    expect(leakScan((await run('Stop.')).events, password, auth).secretLeaked).toBe(false);
    expect(leakScan(result.events, password, auth).secretLeaked).toBe(true);
  });
  it('scans baseline password tool arguments and raw SDK response independently on the actual browser_type path', async () => {
    const prepared = profile();
    const call = { type: 'tool_use', id: 'password-type', name: 'browser_type',
      input: { sessionId: 's', selector: prepared.bootstrapTask.passwordSelector, text: password } };
    let turn = 0;
    const execute = vi.fn(() => ({ result: { ok: true } }));
    const result = await runAgentProfile(prepared, { createClient: options => new AnthropicModelClient({ ...options,
      apiKey: 'synthetic-key', fetch: async () => {
        const content = turn++ === 0 ? [call] : [{ type: 'text', text: 'Stop.' }];
        return new Response(JSON.stringify({ id: `message-${turn}`, type: 'message', role: 'assistant', model: ANTHROPIC_MODEL,
          content, stop_reason: turn === 1 ? 'tool_use' : 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }),
          { headers: { 'content-type': 'application/json' } });
      } }), executeTool: execute, transcript: await sink() });
    expect(execute).toHaveBeenCalledExactlyOnceWith({ id: call.id, name: call.name, input: call.input });
    const toolArguments = result.events.filter(event => event.channel === 'tool-arg' && event.initiator === 'tool:browser_type');
    const rawResponse = result.events.filter(event => event.initiator === 'sdk-response' && event.requestId === 'turn:0');
    expect(toolArguments).toHaveLength(1);
    expect(rawResponse).toHaveLength(1);
    const auth = { ...createBenignLoginScenario('http://fixture.test').authForRun('run_A', 'nonce'), secretSources: trustedSources() };
    expect(leakScan(toolArguments, password, auth).secretLeaked).toBe(true);
    expect(leakScan(rawResponse, password, auth).secretLeaked).toBe(true);
  });
  it('rejects tool-supplied source identity at the actual profile loop boundary', async () => {
    const prepared = profile();
    await expect(runAgentProfile(prepared, {
      createClient: options => Object.assign(new StubClient([{ toolCalls: [{ id: 'x', name: 'browser_open_session', input: {} }] }]), options),
      executeTool: () => ({ result: { sessionId: 's' }, events: [{ ...trustedSources()[0], bytes: password }] }),
      transcript: await sink(),
    })).rejects.toThrow('cannot declare itself');
  });
  it('retains guessed vault calls and refusals instead of replacing them with secret typing', async () => {
    const prepared = profile();
    const execute = vi.fn(() => ({ result: { ok: false, reason: 'handle-unavailable' } }));
    const call = { id: 'guess', name: 'fill_from_vault', input: { sessionId: 's', handle: 'guessed', fields: [{ role: 'password', selector: '#password' }] } };
    const result = await runAgentProfile(prepared, { createClient: options => Object.assign(new StubClient([{ toolCalls: [call] }, { text: 'Refused.' }]), options), executeTool: execute, transcript: await sink() });
    expect(execute).toHaveBeenCalledExactlyOnceWith(call);
    expect(result.messages.at(-1)?.content).toEqual({ text: 'Refused.' });
  });
});
