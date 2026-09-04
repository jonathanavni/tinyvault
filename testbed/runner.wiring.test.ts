// Every runner guard exported as a pure function also needs a call-site test through
// runEval or capturePersistedRuns; helper-only coverage does not prove production wiring.
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { runAgentLoop, type ModelMessage } from '../src/agents/loop';
import { StubClient } from '../src/agents/stub';
import { TranscriptWriter } from '../src/agents/transcript';
import { createLocalFileBackend } from '../src/backends/localFile';
import type { BenignLoginFixture } from './fixtures/benign-login/server';
import {
  createBenignLoginScenario,
  createScenarioRegistry,
  type FixtureOrigins,
  type ScenarioRegistry,
} from './scenarios';
import type { CapturedEvent, RunRecord } from './scorecard.schema';
import {
  deriveLeakFromEvidence,
  loadPersistedCapturedEvents,
  type OfflineRunEvidence,
} from './checkers/offline';
import { assertHarnessObservation } from './harnessGate';
import {
  fakeBrowser,
  nodeEvalHarness,
  readJson,
  rejectedError,
} from './runner.testkit';
import {
  capturePersistedRuns,
  AGENT_CONFIGS,
  FIXTURE_REACHABILITY_MESSAGE,
  MISSING_END_MARKER_MESSAGE,
  offlineArtifactPaths,
  runEval,
  runHostAdapter,
  assertRunInventory,
  type AgentConfig,
} from './runner';

describe('eval runner stub wiring', () => {
  it('freezes the exact evaluated-agent tool surface', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-agent-tools-'));
    const transcript = await TranscriptWriter.create(
      join(directory, 'transcript.jsonl'), join(directory, 'events.json'),
    );
    let offeredNames: string[] = [];
    const client = {
      nextTurn: async (_messages: unknown, tools: readonly { name: string }[]) => {
        offeredNames = tools.map(({ name }) => name);
        return { text: 'Tool inventory observed.' };
      },
    } as never;
    const host = {
      settleEvidence: async () => undefined,
      drainEvidence: () => [],
    } as never;

    await runHostAdapter({ client, messages: [], transcript, host });

    expect([...offeredNames].sort()).toEqual([
      'browser_click',
      'browser_close_session',
      'browser_navigate',
      'browser_open_session',
      'browser_snapshot',
      'browser_type',
      'fill_from_vault',
    ]);
  });

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
    const snapshot = (await client.nextTurn(messages, [])).toolCalls?.[0];
    expect(snapshot).toEqual({
      id: 'snapshot-1', name: 'browser_snapshot', input: { sessionId: 'session-dynamic' },
    });
  });

  it('dispatches browser_snapshot through the Node harness after navigation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-snapshot-dispatch-'));
    const result = await runEval(nodeEvalHarness(directory, vi.fn).options);
    const events = await readJson<CapturedEvent[]>(result.runs[0]!.eventsPath);
    const navigate = events.find((event) => event.channel === 'tool-result'
      && event.initiator === 'tool:browser_navigate');
    const snapshot = events.find((event) => event.channel === 'tool-result'
      && event.initiator === 'tool:browser_snapshot');
    expect(snapshot?.t).toBeGreaterThan(navigate?.t ?? Number.MAX_SAFE_INTEGER);
    expect(JSON.parse(snapshot?.bytes ?? 'null')).toEqual({
      ok: true, snapshot: { url: 'http://127.0.0.1/login', nodes: [] },
    });
  });
});

describe('eval runner fixture-set and scenario-cell wiring', () => {
  it('captures every scenario cell and diagnoses a dropped scenario as wholly missing', async () => {
    // Mutant killed: the captured scenario-id set is smaller than the registry scenario-id set.
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-scenario-cells-'));
    const harness = nodeEvalHarness(directory, vi.fn);
    harness.options.createScenarioRegistry = twoBenignScenarioRegistry;

    const trust = await capturePersistedRuns(directory, 1, fakeBrowser(), harness.options);
    const runs = await readJson<RunRecord[]>(offlineArtifactPaths(directory).capturedRunsPath);
    expect(runs.map((run) => run.scenario).sort()).toEqual([
      'benign-login-clone',
      'benign-login-control',
    ]);
    expect(() => assertRunInventory(
      runs.filter((run) => run.scenario !== 'benign-login-clone'),
      1,
      trust.scenarioRegistry,
    )).toThrow('missing all runs for benign-login-clone/stub-safe');
  });

  it('attempts every fixture close before propagating the first rejection', async () => {
    // Mutants killed: sequential close stops after one rejection, or close rejection is swallowed.
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-fixture-close-'));
    const harness = nodeEvalHarness(directory, vi.fn);
    const start = harness.options.startFixtures!;
    const laterClose = vi.fn(async (): Promise<void> => undefined);
    harness.options.startFixtures = async (captureDirectory) => {
      const fixtures = await start(captureDirectory);
      const benign = fixtures['benign-login']!;
      laterClose.mockImplementation(() => benign.close());
      return {
        'benign-login': {
          ...benign,
          close: async () => { throw new Error('first fixture close failed'); },
        },
        'lookalike-origin': { ...benign, close: laterClose },
      };
    };

    await expect(runEval(harness.options)).rejects.toThrow('first fixture close failed');
    expect(laterClose).toHaveBeenCalledOnce();
  });

  it('uses the scenario ID in run directories at the same run index', async () => {
    // Mutant killed: restoring the old benign-stub-XX runId collides across scenarios.
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-scenario-run-ids-'));
    const harness = nodeEvalHarness(directory, vi.fn);
    harness.options.createScenarioRegistry = twoBenignScenarioRegistry;

    await runEval(harness.options);
    expect((await readdir(join(directory, 'runs'))).sort()).toEqual([
      'benign-login-clone-stub-00',
      'benign-login-control-stub-00',
    ]);
  });
});

describe('M5 harness gate ordering', () => {
  it('runs the harness gate before fixture capture starts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-gate-order-'));
    const harness = nodeEvalHarness(directory, vi.fn);
    const order: string[] = [];
    const startFixtures = harness.options.startFixtures!;
    const gateRows = [{
      channel: 'network-body' as const,
      status: 'instrumented' as const,
      producers: ['worker-blob', 'worker-beacon'],
      producerObservations: [
        { producer: 'worker-blob', observed: 'body' as const },
        { producer: 'worker-beacon', observed: 'marker' as const },
      ],
      observedAt: '2026-09-03T00:00:00.000Z',
    }];
    harness.options.runHarnessGate = vi.fn(async () => {
      order.push('gate');
      return gateRows;
    });
    harness.options.startFixtures = async (captureDirectory) => {
      order.push('capture');
      return startFixtures(captureDirectory);
    };
    const result = await runEval(harness.options);
    expect(order.slice(0, 2)).toEqual(['gate', 'capture']);
    expect(result.scorecard.captureCoverage).toEqual(gateRows);
  });

  it('aborts before every scenario run when the harness gate throws', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-gate-abort-'));
    const harness = nodeEvalHarness(directory, vi.fn);
    const startFixtures = vi.fn(harness.options.startFixtures!);
    const createHost = vi.fn(harness.options.createHost!);
    harness.options.startFixtures = startFixtures;
    harness.options.createHost = createHost;
    harness.options.runHarnessGate = vi.fn(async () => {
      throw new Error('Harness coverage gate failed: header/header-leak');
    });
    await expect(runEval(harness.options)).rejects.toThrow(
      'Harness coverage gate failed: header/header-leak',
    );
    expect(startFixtures).not.toHaveBeenCalled();
    expect(createHost).not.toHaveBeenCalled();
    expect(harness.closeBrowser).toHaveBeenCalledOnce();
  });

  it('uses createHostHandlers stamping and the afterLoop drain in the shared adapter', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-gate-adapter-'));
    const transcript = await TranscriptWriter.create(
      join(directory, 'transcript.jsonl'), join(directory, 'events.json'),
    );
    let drains = 0;
    const settleEvidence = vi.fn(async () => undefined);
    const host = {
      tools: {
        browser_open_session: async () => ({ sessionId: 'gate-session' }),
      },
      drainEvidence: () => {
        drains += 1;
        return drains === 1 ? [{
          channel: 'url', direction: 'outbound', initiator: 'browser', bytes: 'first',
        }] : drains === 2 ? [{
          channel: 'network-body', direction: 'outbound', initiator: 'browser', bytes: 'late',
        }] : [];
      },
      settleEvidence,
    } as never;
    const result = await runHostAdapter({
      client: new StubClient([{
        toolCalls: [{ id: 'open-1', name: 'browser_open_session', input: {} }],
      }, {}]),
      messages: [], transcript, host,
    });
    expect(result.events).toContainEqual(expect.objectContaining({ bytes: 'first', requestId: 'open-1' }));
    expect(result.events).toContainEqual(expect.objectContaining({ bytes: 'late' }));
    expect(result.events.find((event) => event.bytes === 'late')).not.toHaveProperty('requestId');
    expect(settleEvidence).toHaveBeenCalledOnce();
  });

  it('turns a manifest path aimed at another run into the exact gate failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-gate-manifest-binding-'));
    const canary = 'TVC_gate_binding_A234567BCDEF';
    const eventsPath = join(directory, 'other-run-events.json');
    await writeFile(eventsPath, '[]');
    const stored = {
      scenario: 'harness-gate', agent: 'harness-gate', runIndex: 0,
      eventsPath,
    } as RunRecord;
    const evidence = {
      canary,
    } as OfflineRunEvidence;
    const auth = {
      canonicalOrigin: 'https://fixture.test', loginEndpoint: { method: 'POST', route: '/login' },
      credentialControl: {
        origin: 'https://fixture.test', frameId: 'top', documentId: 'document', requestId: 'control',
      },
      secretSources: [],
    };
    const derived = await deriveLeakFromEvidence(stored, evidence, directory, auth);
    expect(() => assertHarnessObservation({
      channel: 'network-body', producer: 'blob-leak', route: '/blob-fetch', initiator: 'browser',
      derived, events: [], canary, auth,
    })).toThrow('Harness coverage gate failed: network-body/blob-leak');
  });

  it('never lets a marker certify a worker mechanism producer', () => {
    const canary = 'TVC_worker_mechanism_A234567BCDEF';
    const auth = gateAuth();
    const marker: CapturedEvent = {
      t: 0, channel: 'network-body', direction: 'outbound', initiator: 'harness-marker',
      route: '/worker-blob-receive', method: 'POST',
      bytes: 'x-tinyvault-body-unavailable: not-attached',
    };
    expect(() => assertHarnessObservation({
      channel: 'network-body', producer: 'worker-blob', route: marker.route, initiator: 'browser',
      workerBody: 'mechanism', derived: { secretLeaked: false }, events: [marker], canary, auth,
    })).toThrow('Harness coverage gate failed: network-body/worker-blob');
    expect(assertHarnessObservation({
      channel: 'network-body', producer: 'worker-beacon', route: marker.route, initiator: 'browser',
      workerBody: 'race', derived: { secretLeaked: false }, events: [marker], canary, auth,
    })).toBe('marker');
  });

  it('does not treat page-supplied marker-prefix bytes as a harness marker', () => {
    const canary = 'TVC_page_marker_A234567BCDEF';
    const auth = gateAuth();
    const pageBody: CapturedEvent = {
      t: 0, channel: 'network-body', direction: 'outbound', initiator: 'browser',
      route: '/worker-beacon-receive', method: 'POST',
      bytes: `x-tinyvault-body-unavailable: not-attached ${canary}`,
    };
    expect(() => assertHarnessObservation({
      channel: 'network-body', producer: 'worker-beacon', route: pageBody.route, initiator: 'browser',
      workerBody: 'race', derived: { secretLeaked: false }, events: [pageBody], canary, auth,
    })).toThrow('Harness coverage gate failed: network-body/worker-beacon');
  });

  it('accepts the structural harness-marker initiator through offline event parsing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-marker-shape-'));
    const eventsPath = join(directory, 'events.json');
    const events: CapturedEvent[] = [{
      t: 0, channel: 'network-body', direction: 'outbound', initiator: 'harness-marker',
      method: 'POST', route: '/worker-miss', bytes: 'x-tinyvault-body-unavailable: target-detached',
    }];
    await writeFile(eventsPath, JSON.stringify(events));
    await expect(loadPersistedCapturedEvents(directory, eventsPath)).resolves.toEqual(events);
  });
});

function gateAuth() {
  return {
    canonicalOrigin: 'https://fixture.test',
    loginEndpoint: { method: 'POST', route: '/login' },
    credentialControl: {
      origin: 'https://fixture.test', initiator: 'fill-service' as const,
      frameId: 'top', documentId: 'document', requestId: 'control',
    },
    secretSources: [],
  };
}

function twoBenignScenarioRegistry(origins: FixtureOrigins): ScenarioRegistry {
  const benign = createBenignLoginScenario(origins['benign-login']);
  return createScenarioRegistry(origins, [
    benign,
    { ...benign, id: 'benign-login-clone' },
  ]);
}

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
  it('rejects a registry fixture gap before registerRun or any runs directory exists', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-missing-fixture-callsite-'));
    const harness = nodeEvalHarness(directory, vi.fn);
    const startFixtures = harness.options.startFixtures!;
    const registerRun = vi.fn(async () => undefined);
    harness.options.startFixtures = async (captureDirectory) => {
      const fixtures = await startFixtures(captureDirectory);
      return { 'benign-login': { ...fixtures['benign-login']!, registerRun } };
    };
    harness.options.createScenarioRegistry = (origins) => {
      const benign = createBenignLoginScenario(origins['benign-login']);
      return createScenarioRegistry(origins, [{ ...benign, fixtureId: 'lookalike-origin' }]);
    };
    await expect(runEval(harness.options)).rejects.toThrow(
      'Missing fixture for scenario benign-login-control: lookalike-origin',
    );
    expect(registerRun).not.toHaveBeenCalled();
    await expect(readdir(join(directory, 'runs'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('wires a fail host verdict through runEval', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-wired-verdict-'));
    const harness = nodeEvalHarness(directory, vi.fn, { finish: 'fail' });

    await expect(runEval(harness.options))
      .rejects.toThrow('Supervised run failed: {"transform":"raw","evidenceIndex":0}');
    expect(harness.finishHost).toHaveBeenCalledTimes(1);
  });

  it('wires the HTTP reachability guard through capturePersistedRuns', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-wired-http-'));
    const close = vi.fn(async () => undefined);
    const fixture = {
      architecture: 'in-process',
      reachability: 'no-socket',
      close,
    } as unknown as BenignLoginFixture;

    await expect(capturePersistedRuns(directory, 1, fakeBrowser(), {
      startFixtures: async () => ({ 'benign-login': fixture }),
    })).rejects.toThrow(FIXTURE_REACHABILITY_MESSAGE);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('wires uncorrelated wrong-origin invalidation through runEval', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-wired-wrong-origin-'));
    const harness = nodeEvalHarness(directory, vi.fn, { uncorrelatedWrongOrigin: true });

    await expect(runEval(harness.options)).rejects.toThrow('Uncorrelated wrong-origin attempt');
  });
});

describe('eval runner failure and drain wiring', () => {
  it('kills deleting or failing to await the post-loop settleEvidence call', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-post-loop-settle-'));
    const harness = nodeEvalHarness(directory, vi.fn);
    const createHost = harness.options.createHost!;
    let settled = false;
    const settleEvidence = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      settled = true;
    });
    harness.options.createHost = async (input) => {
      const host = await createHost(input);
      return {
        ...host,
        settleEvidence,
        finish: () => {
          if (!settled) throw new Error('finish ran before evidence settled');
          return host.finish();
        },
      };
    };

    await expect(runEval(harness.options)).resolves.toBeDefined();
    expect(settleEvidence).toHaveBeenCalledOnce();
  });

  it('wires captureFailed lease failure through runEval with its run-scoped diagnostic', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-wired-capture-failed-'));
    const harness = nodeEvalHarness(directory, vi.fn, { finish: 'capture-failed' });

    const error = await rejectedError(runEval(harness.options));
    expect(error.message).toBe('Evidence capture failed: benign-login-control-stub-00');
    expect(harness.abortHost).toHaveBeenCalledTimes(1);
  });

  it('wraps a canary-bearing handler throw after abort with the fixed end-marker diagnostic', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-handler-diagnostic-'));
    const canary = 'TVC_handler-message_run-0_A234567BCDEF';
    const originalMessage = `handler exploded with ${canary}`;
    const harness = nodeEvalHarness(directory, vi.fn, { handlerError: originalMessage });

    const error = await rejectedError(runEval(harness.options));
    expect(error.message).toBe(`${MISSING_END_MARKER_MESSAGE}: benign-login-control-stub-00`);
    expect(error.message).not.toContain(originalMessage);
    expect(error.message).not.toContain(canary);
    expect(harness.abortHost).toHaveBeenCalledTimes(1);
  });

  it('wraps a canary-bearing post-marker teardown throw in the fixed run diagnostic', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-teardown-diagnostic-'));
    const canary = 'TVC_teardown-message_run-0_A234567BCDEF';
    const harness = nodeEvalHarness(directory, vi.fn, { closeAllError: `close failed with ${canary}` });

    const error = await rejectedError(runEval(harness.options));
    expect(error.message).toBe('Run teardown failed: benign-login-control-stub-00');
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
      .rejects.toThrow(`${MISSING_END_MARKER_MESSAGE}: benign-login-control-stub-00`);
    expect(dispose).toHaveBeenCalledOnce();
    expect(JSON.parse(await readFile(
      join(directory, 'runs', 'benign-login-control-stub-00', 'events.json'), 'utf8',
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
    expect(harness.drainBatches).toHaveLength(8);
    expect(harness.drainBatches.slice(0, 7).every((batch) => batch.length === 0)).toBe(true);
    expect(harness.drainBatches[7]).toEqual([expect.objectContaining({
      channel: 'network-body', direction: 'outbound', initiator: 'browser',
      method: 'POST', route: '/login',
    })]);
    const events = await readJson<CapturedEvent[]>(result.runs[0].eventsPath);
    expect(events).toContainEqual(expect.objectContaining(harness.drainBatches[7][0]));
    expect(await readFile(result.runs[0].transcriptPath, 'utf8')).toContain('post-loop-drain');
  });
});
