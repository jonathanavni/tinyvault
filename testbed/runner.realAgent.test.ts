import { sha256 } from './evaluationProvenance';
import { createScenarioRegistry } from './scenarios';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as composed from './docker/composedFixtures';
import { runEvalEntry } from './evalEntry';
import { s5ComposedHarness, assertS5Custody } from './runner.testkit';
import { ANTHROPIC_CLIENT_CONFIG } from '../src/agents/anthropicClient';
import type { M6Scorecard } from './scorecard.schema';
import { assertRealAgentEvaluation } from './runner.realAgent.eval';

vi.mock('./docker/composedFixtures', async original => ({ ...await original<typeof composed>(), startComposedFixtureSet: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
describe('S5 actual command composition', () => {
  it.each([['real-comparison', 1, 6], ['real-comparison', 2, 12], ['real-baseline', 1, 3], ['real-baseline', 10, 30]] as const)(
    'qualifies %s N=%i with the exact %i-run inventory through the SDK', async (profile, n, count) => {
      const root = await mkdtemp(join(tmpdir(), 'tinyvault-s5-command-'));
      const harness = await s5ComposedHarness(root);
      vi.mocked(composed.startComposedFixtureSet).mockImplementation(harness.startComposed);
      const stdout = vi.spyOn(console, 'log').mockImplementation(() => {});
      const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
      const key = 'S5_KEY_CUSTODY_SENTINEL_never_persist_938749';
      const result = await runEvalEntry({ TINYVAULT_PROFILE: profile, TINYVAULT_N: String(n), ANTHROPIC_API_KEY: key }, harness.options);
      expect(result.runs).toHaveLength(count);
      const providerRequests = harness.requests.length;
      await assertRealAgentEvaluation(result);
      expect(harness.requests).toHaveLength(providerRequests);
      const scorecard = result.scorecard as M6Scorecard;
      expect(scorecard.provenance.config.selectedAgentIds).toEqual(profile === 'real-comparison' ? ['tinyvault-ref', 'naive-baseline'] : ['naive-baseline']);
      expect(harness.setups.size).toBe(count);
      expect(new Set([...harness.setups.values()].map(row => row.canary)).size).toBe(count);
      const registry = createScenarioRegistry(Object.fromEntries(Object.entries(harness.fixtures).map(([id, fixture]) => [id, fixture.origin])) as never);
      for (const request of harness.requests) {
        const task = JSON.parse(request.body.messages[0].content);
        const setup = harness.setups.get(request.runId)!;
        const expectedTask = registry.get(setup.scenarioId)!.publicTask(request.runId);
        for (const [key, value] of Object.entries(expectedTask)) expect(task[key]).toEqual(value);
        expect(sha256(request.body.system)).toBe(scorecard.provenance.inputs.agentPromptSha256ById[task.inventory ? 'tinyvault-ref' : 'naive-baseline']);
        if (task.inventory) expect(task).not.toHaveProperty('password');
        expect(sha256(JSON.stringify(request.body.tools.map(({ input_schema, ...tool }: any) => ({ ...tool, inputSchema: input_schema }))))).toBe(scorecard.provenance.inputs.toolRegistrySha256);
        expect(request.url).toBe(ANTHROPIC_CLIENT_CONFIG.providerEndpoint);
        expect(request.headers.get('anthropic-version')).toBe(ANTHROPIC_CLIENT_CONFIG.apiVersion);
        expect(request.body).toMatchObject({ model: ANTHROPIC_CLIENT_CONFIG.model, temperature: ANTHROPIC_CLIENT_CONFIG.temperature,
          max_tokens: ANTHROPIC_CLIENT_CONFIG.maxTokens });
      }
      for (const run of result.runs) {
        if (run.agent === 'naive-baseline') {
          const files = await readdir(dirname(run.eventsPath));
          const vault = files.find(path => /^vault-.*\.json$/u.test(path))!;
          expect(JSON.parse(await readFile(join(dirname(run.eventsPath), vault), 'utf8')).records).toEqual([]);
        }
        const events = JSON.parse(await readFile(run.eventsPath, 'utf8'));
        const contextEvents = events.filter((event: any) => ['model-context', 'sdk-request-context'].includes(event.initiator));
        for (const event of contextEvents) {
          expect(event.documentId).toBe((run as any).runId);
          expect(event.requestId).toMatch(/^turn:[0-9]+$/);
        }
        const lastRequest = harness.requests.filter(request => request.runId === (run as any).runId).at(-1)!;
        const requestedCalls = lastRequest.body.messages.filter((message: any) => message.role === 'assistant')
          .flatMap((message: any) => message.content.filter((block: any) => block.type === 'tool_use').map((block: any) => block.name));
        expect(harness.operations.filter(operation => operation.runId === (run as any).runId).map(operation => operation.name)).toEqual(requestedCalls);
        for (const event of events.filter((event: any) => event.initiator === 'tool:browser_snapshot' && event.channel === 'tool-result')) {
          const nodes = JSON.parse(event.bytes).snapshot?.nodes ?? [];
          for (const node of nodes.filter((node: any) => node.name === 'runId')) expect(node.value).toBe((run as any).runId);
        }
        const bootstrap = events.find((event: any) => ['reference-bootstrap', 'baseline-bootstrap'].includes(event.initiator));
        const firstRequest = harness.requests.find(request => request.runId === (run as any).runId)!;
        expect(JSON.parse(bootstrap.bytes)).toEqual(JSON.parse(firstRequest.body.messages[0].content));
        if (run.scenario === 'lookalike-origin-redirect' && run.agent === 'tinyvault-ref') {
          expect(run.outcome.wrongOriginFillBlocked).toBe(true);
          const fills = events.filter((event: any) => event.initiator === 'tool:fill_from_vault' && event.channel === 'tool-result');
          expect(fills).toHaveLength(2);
        }
        const transcript = (await readFile(run.transcriptPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
        expect(await readFile(`${run.eventsPath}.initial-snapshot.json`, 'utf8')).toContain('"sdkObserved":true');
        if (run.agent === 'tinyvault-ref') {
          const discovery = transcript.filter(row => row.kind === 'meta' && JSON.parse(row.bytes).event === 'vault-discovery');
          expect(discovery).toHaveLength(1);
          expect(discovery[0].sequence).toBeLessThan(transcript.find(row => row.kind === 'sdk-request').sequence);
        }
      }
      for (const path of await allFiles(dirname(result.scorecardPath))) expect(await readFile(path, 'utf8')).not.toContain(key);
      expect(JSON.stringify([...stdout.mock.calls, ...stderr.mock.calls])).not.toContain(key);
      await assertS5Custody(dirname(result.scorecardPath), harness, key, [...stdout.mock.calls, ...stderr.mock.calls]);
    }, 30_000);
});
async function allFiles(root: string): Promise<string[]> {
  return (await Promise.all((await readdir(root, { withFileTypes: true })).map(entry => entry.isDirectory()
    ? allFiles(join(root, entry.name)) : [join(root, entry.name)]))).flat();
}

import { writeFile } from 'node:fs/promises';
import { encodeFrame } from './docker/frames';
import type { CapturedEvent } from './scorecard.schema';
it('H remeasures all six composed witnesses with the production identities at index 09', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tinyvault-s5-headroom-'));
  const harness = await s5ComposedHarness(root);
  vi.mocked(composed.startComposedFixtureSet).mockImplementation(harness.startComposed);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const result = await runEvalEntry({ TINYVAULT_N: '10', ANTHROPIC_API_KEY: 'synthetic-budget-key' }, harness.options);
  const directory = dirname(result.scorecardPath);
  const manifest = JSON.parse(await readFile(join(directory, 'offline-evidence.json'), 'utf8'));
  const measurements = [];
  for (const run of result.runs.filter(row => row.runIndex === 9)) {
    const row = manifest.runs.find((entry: any) => entry.scenario === run.scenario && entry.agent === run.agent && entry.runIndex === 9);
    const raw = await readFile(run.eventsPath);
    const events: CapturedEvent[] = JSON.parse(raw.toString());
    const request = harness.requests.find(request => request.runId === row.runId)!;
    const task = JSON.parse(request.body.messages[0].content);
    const promptBytes = Buffer.byteLength(request.body.system) + Buffer.byteLength(JSON.stringify(task));
    const byTurn: Record<string, number> = {}; const byKind: Record<string, number> = {};
    let turn = -1, repeatedPromptBytes = 0, escapedPromptBytes = 0;
    for (const event of events) {
      if (event.initiator === 'model-context') turn++;
      const bytes = Buffer.byteLength(JSON.stringify(event, null, 2).split('\n').map(line => `  ${line}`).join('\n')) + 2;
      byTurn[turn] = (byTurn[turn] ?? 0) + bytes;
      const kind = event.initiator ?? event.channel; byKind[kind] = (byKind[kind] ?? 0) + bytes;
      if (['model-context', 'sdk-request-context'].includes(kind)) {
        const context = JSON.parse(event.bytes);
        const reduced = JSON.stringify({ ...context, system: '', messages: context.messages.map((m: any, i: number) => i ? m : { ...m, content: '' }) });
        repeatedPromptBytes += Buffer.byteLength(event.bytes) - Buffer.byteLength(reduced);
        escapedPromptBytes += Buffer.byteLength(JSON.stringify(event.bytes)) - Buffer.byteLength(JSON.stringify(reduced));
      }
    }
    const requestFrameBytes = encodeFrame({ v: 1, kind: 'req', id: Number.MAX_SAFE_INTEGER, op: 'attest', body: {
      epoch: `0-${'0'.repeat(32)}`, fixtureId: row.completionBinding.fixtureId, runId: row.runId,
      capability: 'A'.repeat(43), events: raw.toString('base64url') } }).length;
    const signedBytes = Buffer.byteLength(row.eventsAttestation);
    const bootstrap = events.find(event => ['reference-bootstrap', 'baseline-bootstrap'].includes(event.initiator ?? ''))!;
    const responseFrameBytes = encodeFrame({ v: 1, kind: 'res', id: Number.MAX_SAFE_INTEGER, op: 'attest', ok: true,
      body: { attestation: row.eventsAttestation } }).length;
    measurements.push({ agent: run.agent, scenario: run.scenario, runId: row.runId, promptBytes,
      rawBytes: raw.length, signedBytes, requestFrameBytes, responseFrameBytes, bridgePayloadBytes: requestFrameBytes - 4,
      receiptBytes: Buffer.byteLength(row.completionReceipt ?? run.completionReceipt ?? ''),
      systemBytes: Buffer.byteLength(request.body.system), bootstrapBytes: Buffer.byteLength(JSON.stringify(task)),
      bootstrapBodyBytes: Buffer.byteLength(bootstrap.bytes), bootstrapEscapedBytes: Buffer.byteLength(JSON.stringify(bootstrap.bytes)) - 2, byTurn, byKind,
      repeatedPromptBytes, escapedPromptBytes, escapingOverhead: escapedPromptBytes - repeatedPromptBytes });
  }
  const artifact = join(directory, 'H-budget.json');
  await writeFile(artifact, `${JSON.stringify(measurements, null, 2)}\n`);
  await writeFile('/private/tmp/tinyvault-s5-H-budget-path.txt', `${artifact}\n`);
  expect(measurements).toHaveLength(6);
  for (const row of measurements) {
    expect(row.promptBytes).toBeLessThanOrEqual(1024);
    expect(row.rawBytes).toBeLessThanOrEqual(131072);
    expect(row.signedBytes).toBeLessThanOrEqual(262144);
    expect(row.bridgePayloadBytes).toBeLessThanOrEqual(262144);
    expect(row.responseFrameBytes).toBeLessThanOrEqual(262148);
    expect(row.runId).toMatch(/^[A-Za-z0-9]{8}-[A-Za-z0-9-]+-09$/);
  }
}, 90_000);

it('B physical identities remain fresh across cohorts sharing the same fixture registrations', async () => {
  const h = await s5ComposedHarness(await mkdtemp(join(tmpdir(), 'tinyvault-s5-repeat-')));
  vi.mocked(composed.startComposedFixtureSet).mockImplementation(h.startComposed);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const first = await runEvalEntry({ TINYVAULT_N: '1', ANTHROPIC_API_KEY: 'synthetic-key' }, h.options);
  const second = await runEvalEntry({ TINYVAULT_N: '1', ANTHROPIC_API_KEY: 'synthetic-key' }, h.options);
  expect(h.setups.size).toBe(12);
  expect(dirname(first.scorecardPath)).not.toBe(dirname(second.scorecardPath));
  const paths = [...first.runs, ...second.runs].flatMap(row => [row.eventsPath, row.transcriptPath]);
  expect(new Set(paths).size).toBe(24);
  expect(await readFile(first.scorecardPath, 'utf8')).toContain((first.scorecard as M6Scorecard).provenance.provenanceId);
}, 30_000);

it('C3 discovery, availability, setup mapping and fill reach the same backend on the command path', async () => {
  const { createLocalFileBackend } = await import('../src/backends/localFile');
  const { createFillService } = await import('../src/core/fillService');
  const { createLockdownDomain } = await import('../src/supervisor/lockdownDomain');
  const { composeSupervisedHost, EvidenceLease } = await import('../src/supervisor/host');
  const h = await s5ComposedHarness(await mkdtemp(join(tmpdir(), 'tinyvault-s5-backend-')));
  vi.mocked(composed.startComposedFixtureSet).mockImplementation(h.startComposed);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const instances: any[] = [];
  h.options.createBackend = options => {
    const backend = createLocalFileBackend(options);
    const wrapped = { ...backend, listItems: vi.fn(() => backend.listItems()),
      probeAvailability: vi.fn(() => backend.probeAvailability()),
      resolveSecret: vi.fn((...args: Parameters<typeof backend.resolveSecret>) => backend.resolveSecret(...args)) };
    instances.push(wrapped); return wrapped;
  };
  const createHost = h.options.createHost!;
  h.options.createHost = async input => {
    const historical = await createHost(input);
    const setup = [...h.setups.values()].at(-1)!;
    const domain = createLockdownDomain();
    const lease = new EvidenceLease(input.canary!);
    let currentSession = '', currentOrigin = '';
    const sessions = {
      runExclusive: async (_id: string, op: Function) => op({ documentEpoch: () => 0,
        observeTop: async () => ({ origin: currentOrigin, path: `${currentOrigin}/login` }),
        pinPasswordDestination: async () => ({ kind: 'pinned', destination: {
          identity: domain.authority.mint({ sessionId: currentSession, documentId: setup.runId, frameId: 'top', elementId: 'password' }),
          inject: async (secret: import('../src/core/redaction').Secret) => {
            secret.consume(); return { assigned: true, observedOrigin: currentOrigin, controlToken: 'control', documentToken: setup.runId };
          } } }) }),
      openSessionCount: () => 0, closeAll: async () => undefined,
      quiesceControls: async () => undefined, abortSessions: async () => undefined,
    };
    const fillService = createFillService({ backend: input.backend, sessions: sessions as never, registry: domain.registry });
    const trusted = composeSupervisedHost({ fillService, sessions: sessions as never, lease });
    if (setup.runId.includes('-naive-baseline-')) {
      currentSession = 'baseline-custody-probe'; currentOrigin = h.fixtures[createScenarioRegistry(Object.fromEntries(Object.entries(h.fixtures).map(([id, fixture]) => [id, fixture.origin])) as never).get(setup.scenarioId)!.fixtureId]!.origin;
      for (const handle of ['lv_' + 'a'.repeat(32), 'unknown-handle']) {
        expect(await trusted.tools.fill_from_vault({ sessionId: currentSession, handle, fields: [{ role: 'password', selector: '#password' }] }))
          .toEqual({ ok: false, reason: 'handle-unavailable' });
      }
    }
    // Exercise the trusted member as well as the ready-profile path; it must probe this very instance.
    await trusted.setupReasonFor({ ok: false, reason: 'backend-error' });
    return { ...historical, setupReasonFor: trusted.setupReasonFor,
      tools: { ...historical.tools, list_vault: trusted.tools.list_vault,
        fill_from_vault: async request => {
          const state = h.hosts.get(setup.runId)!;
          const expected = state.witness!.calls[state.executed];
          currentSession = request.sessionId;
          currentOrigin = expected.events.find(event => event.channel === 'url' && event.initiator === 'fill-service')!.origin!;
          const actual = await trusted.tools.fill_from_vault(request);
          const observed = await historical.tools.fill_from_vault(request);
          expect(actual).toEqual(observed);
          return actual;
        } }, closeAll: async () => { trusted.abort(); await trusted.closeAll(); await historical.closeAll(); } };
  };
  await runEvalEntry({ TINYVAULT_N: '1', ANTHROPIC_API_KEY: 'synthetic-key' }, h.options);
  expect(instances).toHaveLength(6);
  for (const [index, backend] of instances.entries()) {
    expect(backend.listItems).toHaveBeenCalledTimes(index % 2 === 0 ? 1 : 0);
    expect(backend.probeAvailability).toHaveBeenCalledTimes(index % 2 === 0 ? 2 : 1);
    expect(backend.resolveSecret).toHaveBeenCalledTimes(index % 2 === 0 ? 1 : 0);
  }
}, 30_000);

it('command rejects a missing loop end marker even when the receipt and remaining captures are intact', async () => {
  const h = await s5ComposedHarness(await mkdtemp(join(tmpdir(), 'tinyvault-s5-marker-')));
  vi.mocked(composed.startComposedFixtureSet).mockImplementation(h.startComposed);
  const { TranscriptWriter } = await import('../src/agents/transcript');
  const append = TranscriptWriter.prototype.append;
  vi.spyOn(TranscriptWriter.prototype, 'append').mockImplementation(function (this: import('../src/agents/transcript').TranscriptWriter, kind, value, captured) {
    if (kind === 'meta' && (value as any).event === 'loop-complete') return Promise.resolve('');
    return append.call(this, kind, value, captured);
  });
  vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
  await expect(runEvalEntry({ TINYVAULT_N: '1', ANTHROPIC_API_KEY: 'synthetic-key' }, h.options)).rejects.toThrow('Real evaluation is unqualified');
}, 30_000);

it('command admission compares execution metadata independently of JSON key ordering', async () => {
  const h = await s5ComposedHarness(await mkdtemp(join(tmpdir(), 'tinyvault-s5-key-order-')));
  let directory = '';
  vi.mocked(composed.startComposedFixtureSet).mockImplementation(input => { directory = input.artifactRoot; return h.startComposed(input); });
  h.fixtures['benign-login']!.close = async () => {
    const path = join(directory, 'offline-evidence.json'), manifest = JSON.parse(await readFile(path, 'utf8'));
    for (const row of manifest.runs) {
      row.execution = Object.fromEntries(Object.entries(row.execution).reverse());
      row.execution.usage = Object.fromEntries(Object.entries(row.execution.usage).reverse());
    }
    await writeFile(path, JSON.stringify(manifest));
  };
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const result = await runEvalEntry({ TINYVAULT_N: '1', ANTHROPIC_API_KEY: 'synthetic-key' }, h.options);
  expect(result.runs).toHaveLength(6);
}, 30_000);

  it('S5 retains a frozen pre-abort snapshot without reopening the lease', async () => {
    const { EvidenceLease, composeSupervisedHost } = await import('../src/supervisor/host');
    const lease = new EvidenceLease('TVC_snapshot_unit_A234567BCDEF');
    const host = composeSupervisedHost({ lease,
      sessions: { abortSessions: async () => undefined, closeAll: async () => undefined, openSessionCount: () => 0 } as never,
      fillService: { disposeBackend: async () => undefined, setupReasonFor: async () => null } as never });
    const setup = { lease, host };
    setup.lease.recordDeferredBody('https://example.test/before-abort', 'POST', 'retained evidence', false);
    setup.host.abort();
    const snapshot = setup.host.abortedEvidence();
    expect(snapshot).toContainEqual(expect.objectContaining({ bytes: 'retained evidence' }));
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot.every(Object.isFrozen)).toBe(true);
    expect(() => setup.host.drainEvidence()).toThrow('Evidence capture failed');
    expect(() => setup.host.finish()).toThrow('Evidence capture failed');
    setup.host.abort();
    expect(setup.host.abortedEvidence()).toEqual(snapshot);
    expect(setup.host.tools).not.toHaveProperty('abortedEvidence');
    expect(setup.host.tools).not.toHaveProperty('setupReasonFor');
    await setup.host.closeAll();
  });
