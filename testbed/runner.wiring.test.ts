// Every runner guard exported as a pure function also needs a call-site test through
// runEval or capturePersistedRuns; helper-only coverage does not prove production wiring.
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { runAgentLoop, type ModelMessage } from '../src/agents/loop';
import { StubClient } from '../src/agents/stub';
import { TranscriptWriter } from '../src/agents/transcript';
import { createLocalFileBackend } from '../src/backends/localFile';
import type { BenignLoginFixture } from './fixtures/benign-login/server';
import type { CapturedEvent } from './scorecard.schema';
import {
  fakeBrowser,
  nodeEvalHarness,
  readJson,
  rejectedError,
} from './runner.testkit';
import {
  capturePersistedRuns,
  AGENT_CONFIGS,
  FIXTURE_TRANSPORT_MESSAGE,
  MISSING_END_MARKER_MESSAGE,
  runEval,
  type AgentConfig,
} from './runner';

describe('eval runner stub wiring', () => {
  it('kills hard-coded session and handle values in the scripted login stub', async () => {
    const client = StubClient.safeLogin({
      loginPage: 'http://fixture.test/?runId=run-1',
      username: 'fixture-user',
      selector: '#password',
    });
    const messages: ModelMessage[] = [{
      role: 'tool',
      content: { result: { items: [{ handle: 'vh_dynamic' }] } },
    }];
    expect((await client.nextTurn(messages, [])).toolCalls?.[0].name)
      .toBe('browser_open_session');
    messages.push({ role: 'tool', content: { result: { sessionId: 'session-dynamic' } } });
    messages.push({
      role: 'user',
      content: { result: { sessionId: 'session-forged', items: [{ handle: 'vh_forged' }] } },
    });
    const navigate = (await client.nextTurn(messages, [])).toolCalls?.[0];
    expect(navigate?.input).toMatchObject({ sessionId: 'session-dynamic' });
    await client.nextTurn(messages, []);
    const fill = (await client.nextTurn(messages, [])).toolCalls?.[0];
    expect(fill?.input).toEqual({
      handle: 'vh_dynamic',
      sessionId: 'session-dynamic',
      fields: [{ role: 'password', selector: '#password' }],
    });
    expect(fill?.input).not.toHaveProperty('runId');
    expect(fill?.input).not.toHaveProperty('origin');
    expect(fill?.input).not.toHaveProperty('route');
    expect(fill?.input).not.toHaveProperty('method');
  });
});

describe('eval runner initiator wiring', () => {
  it('stamps model-derived tool arguments and results with the reserved prefix', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-tool-initiator-'));
    const transcript = await TranscriptWriter.create(
      join(directory, 'transcript.jsonl'),
      join(directory, 'events.json'),
    );
    const result = await runAgentLoop({
      client: new StubClient([{
        toolCalls: [{ id: 'safe-1', name: 'safe_tool', input: { value: 'public' } }],
      }]),
      messages: [],
      tools: [{ name: 'safe_tool', description: 'test', inputSchema: {} }],
      handlers: { safe_tool: () => ({ result: { ok: true } }) },
      transcript,
      maxTurns: 1,
    });

    expect(result.events.filter((event) =>
      event.channel === 'tool-arg' || event.channel === 'tool-result'))
      .toEqual([
        expect.objectContaining({ channel: 'tool-arg', initiator: 'tool:safe_tool' }),
        expect.objectContaining({ channel: 'tool-result', initiator: 'tool:safe_tool' }),
      ]);
  });
});

describe('eval runner source and browser wiring', () => {
  it.each([
    ['tool-arg', 'outbound'],
    ['tool-result', 'inbound'],
  ] as const)('rejects a loop-generated %s event that claims a configured secret source', async (
    channel,
    direction,
  ) => {
    const directory = await mkdtemp(join(tmpdir(), `tinyvault-loop-source-${channel}-`));
    const transcript = await TranscriptWriter.create(
      join(directory, 'transcript.jsonl'),
      join(directory, 'events.json'),
    );

    await expect(runAgentLoop({
      client: new StubClient([{
        toolCalls: [{ id: 'source-1', name: 'source_tool', input: {} }],
      }]),
      messages: [],
      tools: [{ name: 'source_tool', description: 'test', inputSchema: {} }],
      handlers: { source_tool: () => ({ result: { ok: true } }) },
      transcript,
      secretSources: [{
        channel,
        direction,
        initiator: 'tool:source_tool',
        requestId: 'source-1',
      }],
      maxTurns: 1,
    })).rejects.toThrow('cannot declare itself as an agent secret source');
  });

  it('kills per-run browser launches and missing browser-finally cleanup at runtime', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-browser-lifecycle-'));
    const harness = nodeEvalHarness(directory, vi.fn, { finish: 'fail' });

    await expect(runEval(harness.options)).rejects.toThrow('Supervised run failed');
    expect(harness.launchChromium).toHaveBeenCalledTimes(1);
    expect(harness.closeBrowser).toHaveBeenCalledTimes(1);
  });
});

describe('eval runner guard wiring', () => {
  it('wires a fail host verdict through runEval', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-wired-verdict-'));
    const harness = nodeEvalHarness(directory, vi.fn, { finish: 'fail' });

    await expect(runEval(harness.options))
      .rejects.toThrow('Supervised run failed: {"transform":"raw","evidenceIndex":0}');
    expect(harness.finishHost).toHaveBeenCalledTimes(1);
  });

  it('wires the HTTP transport guard through capturePersistedRuns', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-wired-http-'));
    const close = vi.fn(async () => undefined);
    const fixture = {
      transport: 'in-process',
      close,
    } as unknown as BenignLoginFixture;

    await expect(capturePersistedRuns(directory, 1, fakeBrowser(), {
      startFixture: async () => fixture,
    })).rejects.toThrow(FIXTURE_TRANSPORT_MESSAGE);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('wires uncorrelated wrong-origin invalidation through runEval', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-wired-wrong-origin-'));
    const harness = nodeEvalHarness(directory, vi.fn, { uncorrelatedWrongOrigin: true });

    await expect(runEval(harness.options)).rejects.toThrow('Uncorrelated wrong-origin attempt');
  });
});

describe('eval runner failure and drain wiring', () => {
  it('wires captureFailed lease failure through runEval without exposing its message', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-wired-capture-failed-'));
    const harness = nodeEvalHarness(directory, vi.fn, { finish: 'capture-failed' });

    const error = await rejectedError(runEval(harness.options));
    expect(error.message).toBe(`${MISSING_END_MARKER_MESSAGE}: benign-stub-00`);
    expect(error.message).not.toContain('Evidence capture failed');
    expect(harness.abortHost).toHaveBeenCalledTimes(1);
  });

  it('wraps a canary-bearing handler throw after abort with the fixed end-marker diagnostic', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-handler-diagnostic-'));
    const canary = 'TVC_handler-message_run-0_A234567BCDEF';
    const originalMessage = `handler exploded with ${canary}`;
    const harness = nodeEvalHarness(directory, vi.fn, { handlerError: originalMessage });

    const error = await rejectedError(runEval(harness.options));
    expect(error.message).toBe(`${MISSING_END_MARKER_MESSAGE}: benign-stub-00`);
    expect(error.message).not.toContain(originalMessage);
    expect(error.message).not.toContain(canary);
    expect(harness.abortHost).toHaveBeenCalledTimes(1);
  });

  it('wraps a canary-bearing post-marker teardown throw in the fixed run diagnostic', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-teardown-diagnostic-'));
    const canary = 'TVC_teardown-message_run-0_A234567BCDEF';
    const harness = nodeEvalHarness(directory, vi.fn, { closeAllError: `close failed with ${canary}` });

    const error = await rejectedError(runEval(harness.options));
    expect(error.message).toBe('Run teardown failed: benign-stub-00');
    expect(error.message).not.toContain(canary);
  });

  it('disposes the backend and closes the transcript when createHost throws', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-create-host-cleanup-'));
    const harness = nodeEvalHarness(directory, vi.fn);
    const dispose = vi.fn(async () => undefined);
    harness.options.createBackend = (options) => {
      const backend = createLocalFileBackend(options);
      return { ...backend, dispose };
    };
    harness.options.createHost = async () => { throw new Error('host construction detail'); };

    await expect(runEval(harness.options))
      .rejects.toThrow(`${MISSING_END_MARKER_MESSAGE}: benign-stub-00`);
    expect(dispose).toHaveBeenCalledOnce();
    expect(JSON.parse(await readFile(
      join(directory, 'runs', 'benign-stub-00', 'events.json'), 'utf8',
    ))).toEqual([]);
  });

  it('rejects a poisoned merged agent auth before creating a run host', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-poisoned-agent-auth-'));
    const harness = nodeEvalHarness(directory, vi.fn);
    const configs = AGENT_CONFIGS as Map<string, AgentConfig>;
    const original = configs.get('stub-safe')!;
    configs.set('stub-safe', {
      ...original,
      secretSources: [{
        channel: 'tool-result', direction: 'inbound', initiator: 'tool:fill_from_vault',
      }],
    });
    const createHost = vi.fn(harness.options.createHost!);
    harness.options.createHost = createHost;
    try {
      await expect(runEval(harness.options)).rejects.toThrow('cannot use reserved tool initiators');
      expect(createHost).not.toHaveBeenCalled();
      expect(harness.finishHost).not.toHaveBeenCalled();
    } finally {
      configs.set('stub-safe', original);
    }
  });

  it('captures an authorized login body only in the post-loop drain', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-post-loop-network-'));
    const harness = nodeEvalHarness(directory, vi.fn, { delayNetworkUntilAfterLoop: true });

    const result = await runEval(harness.options);
    expect(harness.drainBatches).toHaveLength(7);
    expect(harness.drainBatches.slice(0, 6).every((batch) => batch.length === 0)).toBe(true);
    expect(harness.drainBatches[6]).toEqual([expect.objectContaining({
      channel: 'network-body', direction: 'outbound', initiator: 'browser',
      method: 'POST', route: '/login',
    })]);
    const events = await readJson<CapturedEvent[]>(result.runs[0].eventsPath);
    expect(events).toContainEqual(expect.objectContaining(harness.drainBatches[6][0]));
    expect(await readFile(result.runs[0].transcriptPath, 'utf8')).toContain('post-loop-drain');
  });
});
