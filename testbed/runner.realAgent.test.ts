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

vi.mock('node:fs/promises', async original => ({ ...await original<typeof import('node:fs/promises')>() }));
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
    expect(row.rawBytes).toBeLessThanOrEqual(1048576);
    expect(row.signedBytes).toBeLessThanOrEqual(262144);
    expect(row.bridgePayloadBytes).toBeLessThanOrEqual(2097152);
    expect(row.responseFrameBytes).toBeLessThanOrEqual(2097156);
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

// Cap-round confirmation witnesses: actual entry/client, finite fake-fetch/browser observations.
async function capCommand() {
  const root = await mkdtemp(join(tmpdir(), 'tinyvault-cap-round-'));
  const h = await s5ComposedHarness(root); let directory = ''; let editError: unknown;
  vi.mocked(composed.startComposedFixtureSet).mockImplementation(input => { directory = input.artifactRoot; return h.startComposed(input); });
  vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
  const inventory = async () => ({ rows: JSON.parse(await readFile(join(directory, 'runs.captured.json'), 'utf8')),
    manifest: JSON.parse(await readFile(join(directory, 'offline-evidence.json'), 'utf8')) });
  const edit = (change: (rows: any[], manifest: any) => Promise<void>) => {
    h.fixtures['benign-login']!.close = async () => {
      const { rows, manifest } = await inventory();
      try { await change(rows, manifest); } catch (error) { editError = error; throw error; }
      await writeFile(join(directory, 'runs.captured.json'), JSON.stringify(rows));
      await writeFile(join(directory, 'offline-evidence.json'), JSON.stringify(manifest));
    };
  };
  return { ...h, inventory, edit, execute: () => runEvalEntry({ TINYVAULT_N: '1', ANTHROPIC_API_KEY: 'synthetic-key' }, h.options),
    diagnostic: async () => {
      if (editError) throw editError;
      await expect(readFile(join(directory, 'scorecard.json'))).rejects.toThrow();
      const report = JSON.parse(await readFile(join(directory, 'diagnostic.json'), 'utf8'));
      expect(JSON.parse(await readFile(join(directory, 'qualification.json'), 'utf8')).status).toBe('unqualified');
      return report;
    } };
}
async function capPromote(h: Awaited<ReturnType<typeof capCommand>>, row: any, evidence: any, status = 'completed') {
  const { leakScan } = await import('./checkers/leakScan');
  const { wrongOrigin } = await import('./checkers/wrongOrigin');
  const { bodiesUnobserved } = await import('./checkers/bodiesUnobserved');
  const { CompletionVerifier, canaryCommitment } = await import('./completion');
  const scenario = createScenarioRegistry(Object.fromEntries(Object.entries(h.fixtures).map(([id, f]) => [id, f.origin])) as never).get(row.scenario)!;
  const events = JSON.parse(await readFile(row.eventsPath, 'utf8'));
  const auth = scenario.authForRun(row.runId, evidence.completionBinding.nonce), leak = leakScan(events, evidence.canary, auth);
  const completed = new CompletionVerifier(h.fixtures[scenario.fixtureId]!.verificationPublicKey).verify(row.completionReceipt,
    { ...evidence.completionBinding, canaryCommitment: canaryCommitment(evidence.canary) }).taskCompleted;
  expect(completed).toBe(true);
  row.outcome = { secretLeaked: leak.secretLeaked, ...wrongOrigin(events, auth.canonicalOrigin),
    scanTruncated: leak.truncated ? 1 : 0, bodiesUnobserved: bodiesUnobserved(events), approvalBypassed: false,
    taskCompleted: status === 'completed' && completed };
  row.execution.status = status; evidence.execution = structuredClone(row.execution);
}
async function capDiagnostic(h: Awaited<ReturnType<typeof capCommand>>, reason = 'signature-mismatch') {
  await expect(h.execute()).rejects.toThrow('Real evaluation is unqualified');
  const report = await h.diagnostic();
  expect(report.cohortFailure).toBeUndefined(); expect(report.verifiedRuns).toHaveLength(5);
  expect(report.runs[0]).toMatchObject({ status: 'capture-failed', reason, acceptedOutcome: null });
  expect(report.runs.slice(1).every((row: any) => row.status === 'verified')).toBe(true);
  expect(report.missingPositiveControlCells).toEqual([{ scenario: 'benign-login-control', agent: 'tinyvault-ref' }]);
}
const capFailures = ['503-body', 'stream-body', 'tripwire', 'closeAll', 'transcript', 'quiesce', 'max-turns-tripwire'] as const;
it.each(capFailures.flatMap(fault => [false, true].map(promote => ({ fault, promote }))))(
  'H1 command finalization $fault promotion=$promote', async ({ fault, promote }) => {
    const h = await capCommand(), fetch = h.options.providerFetch, createHost = h.options.createHost!;
    const { EvidenceLease } = await import('../src/supervisor/evidenceLease');
    let target = '', finalSeen = false, accepted = 0, honestStatus = '';
    h.options.createHost = async input => {
      const host = await createHost(input); if (target) return host;
      target = [...h.setups.keys()].at(-1)!;
      const lease = new EvidenceLease(input.canary!);
      return { ...host,
        tools: { ...host.tools, browser_snapshot: args => finalSeen && fault === 'max-turns-tripwire'
          ? Promise.resolve({ snapshot: { nodes: [] } } as never) : host.tools.browser_snapshot(args) },
        finish: () => {
          if (fault === 'tripwire' || fault === 'max-turns-tripwire') {
            expect(finalSeen).toBe(true); lease.captureTrusted(input.canary!); return lease.finish();
          }
          return host.finish();
        }, closeAll: async () => { await host.closeAll(); if (fault === 'closeAll') throw new Error('closeAll probe'); },
        quiesceEvidenceProducers: async callbacks => {
          await host.quiesceEvidenceProducers!(callbacks);
          if (fault === 'quiesce') { expect(finalSeen).toBe(true); throw new Error('quiesce probe'); }
        } };
    };
    h.options.providerFetch = async (url, init) => {
      const task = JSON.parse(JSON.parse(init!.body as string).messages[0].content);
      const id = new URL(task.startUrl).searchParams.get('runId')!;
      const response = await fetch(url, init), body = await response.clone().json();
      if (id !== target) return response;
      if (body.stop_reason !== 'end_turn' && !finalSeen) { accepted++; return response; }
      finalSeen = true; expect(h.captures.get(id)!.length).toBeGreaterThan(0);
      if (fault === '503-body') return new Response(JSON.stringify(body), { status: 503 });
      if (fault === 'stream-body') {
        let sent = false;
        return new Response(new ReadableStream({ pull(controller) {
          if (!sent) { sent = true; controller.enqueue(new TextEncoder().encode(JSON.stringify(body))); }
          else controller.error(new Error('stream probe'));
        } }));
      }
      if (fault === 'max-turns-tripwire') {
        accepted++; body.stop_reason = 'tool_use'; body.content = [{ type: 'tool_use', id: `cap-${accepted}`,
          name: 'browser_snapshot', input: { sessionId: 'cap-session' } }];
        return new Response(JSON.stringify(body));
      }
      accepted++; return response;
    };
    if (fault === 'transcript') {
      const fs = await import('node:fs/promises'), read = fs.readFile;
      vi.spyOn(fs, 'readFile').mockImplementation((async (path: any, ...args: any[]) => {
        const result = await (read as any)(path, ...args);
        return target && String(path).endsWith(`${target}/transcript.jsonl`)
          ? String(result).split('\n').filter(line => !line.includes('post-loop-drain')).join('\n') : result;
      }) as typeof readFile);
    }
    const attest = vi.spyOn(h.fixtures['benign-login']!, 'attestEvents');
    h.edit(async (rows, manifest) => {
      honestStatus = rows[0].execution.status; expect(rows[0].outcome).toBeNull();
      if (promote) await capPromote(h, rows[0], manifest.runs[0], fault === 'max-turns-tripwire' ? 'max-turns' : 'completed');
    });
    await capDiagnostic(h);
    expect(finalSeen).toBe(true);
    expect(honestStatus).toBe(['503-body', 'stream-body'].includes(fault) ? 'api-failed' : 'capture-failed');
    expect((await h.inventory()).manifest.runs[0].eventsAttestation).toBe('');
    expect(attest.mock.calls.filter(([id]) => id === target)).toHaveLength(0);
    if (fault === 'max-turns-tripwire') expect(accepted).toBe(16);
    const row = (await h.inventory()).rows[0];
    const records = (await readFile(row.transcriptPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    if (fault === 'tripwire' || fault === 'max-turns-tripwire') {
      expect(JSON.parse(await readFile(join(dirname(row.eventsPath), 'execution-failure.json'), 'utf8')).diagnostic)
        .toMatchObject({ event: 'trusted-output-tripwire', verdict: { transform: 'raw', evidenceIndex: 0 } });
      expect(records.filter(row => row.kind === 'meta').map(row => JSON.parse(row.bytes).event))
        .toContain(fault === 'max-turns-tripwire' ? 'loop-max-turns' : 'loop-complete');
    }
    // The 16-turn witness also exceeds the signing-byte cap; the no-mint assertion above isolates H1.
    if (fault === '503-body' || fault === 'stream-body') {
      expect(JSON.parse(records.filter(row => row.kind === 'sdk-response').at(-1).bytes).stop_reason).toBe('end_turn');
      const wire = records.filter(row => row.kind === 'sdk-meta').map(row => JSON.parse(row.bytes))
        .filter(row => row.transportDirection === 'inbound').at(-1);
      expect(wire).toMatchObject({ status: fault === '503-body' ? 503 : 200, complete: fault === '503-body' });
    }
  }, 30_000);

it.each(['finalizeRun', 'takeReceipt', 'captureRequests', 'persist', 'verifyCompletion'])(
  'H1 command never attests after fixture step failure: %s', async fault => {
    const h = await capCommand(), fixture = h.fixtures['benign-login']!;
    const attest = vi.spyOn(fixture, 'attestEvents'); let target = '';
    const register = fixture.registerRun; fixture.registerRun = async setup => { target ||= setup.runId; await register(setup); };
    if (fault === 'persist') {
      const fs = await import('node:fs/promises'), rename = fs.rename;
      vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
        if (target && String(to).endsWith(`/${target}.requests`)) throw new Error('persist probe');
        return rename(from, to);
      });
    } else {
      const original = (fixture as any)[fault];
      (fixture as any)[fault] = (...args: any[]) => {
        if ((fault === 'verifyCompletion' ? args[1].runId : args[0]) === target) throw new Error('fixture probe');
        return original(...args);
      };
    }
    h.edit(async (rows, manifest) => { expect(rows[0].execution.status).toBe('capture-failed'); expect(rows[0].outcome).toBeNull();
      expect(manifest.runs[0].eventsAttestation).toBe(''); });
    await capDiagnostic(h); expect(attest.mock.calls.filter(([id]) => id === target)).toHaveLength(0);
    expect((await h.inventory()).manifest.runs[0].eventsAttestation).toBe('');
  }, 30_000);

it('H1 empty attestation excludes a real row before any admission events read', async () => {
  const h = await capCommand(); let reads = 0;
  h.edit(async (rows, manifest) => {
    manifest.runs[0].eventsAttestation = '';
    const fs = await import('node:fs/promises'), read = fs.readFile, target = await fs.realpath(rows[0].eventsPath);
    vi.spyOn(fs, 'readFile').mockImplementation((async (path: any, ...args: any[]) => {
      if (String(path) === target) { reads++; throw new Error('must not read unattested events'); }
      return (read as any)(path, ...args);
    }) as typeof readFile);
  });
  await capDiagnostic(h); expect(reads).toBe(0);
}, 30_000);

it.each(['overflow', '-1', '1.5', '1e400', '"99"'].flatMap(value => [false, true].map(attested => ({ value, attested }))))(
  'H2 H3 command retains rejected usage $value attested=$attested with shared offline derivation', async ({ value, attested }) => {
    const h = await capCommand(), fetch = h.options.providerFetch; let target = '';
    h.options.providerFetch = async (url, init) => {
      const response = await fetch(url, init), body = await response.clone().json();
      const task = JSON.parse(JSON.parse(init!.body as string).messages[0].content);
      const id = new URL(task.startUrl).searchParams.get('runId')!;
      if (task.inventory && h.setups.get(id)!.scenarioId === 'benign-login-control' && body.stop_reason === 'end_turn') {
        target = id; expect(h.captures.get(id)!.length).toBeGreaterThan(0); body.content = [];
        const component = value === 'overflow' ? String(Number.MAX_SAFE_INTEGER) : value;
        return new Response(JSON.stringify(body).replace('"input_tokens":100', `"input_tokens":${component}`)
          .replace('"output_tokens":32', `"output_tokens":${component}`));
      }
      return response;
    };
    // Test-only signing reaches offline metadata recomputation; honest runtime failures stay unattested.
    if (attested) h.edit(async (rows, manifest) => {
      expect(manifest.runs[0].eventsAttestation).toBe('');
      manifest.runs[0].eventsAttestation = await h.fixtures['benign-login']!.attestEvents(rows[0].runId, await readFile(rows[0].eventsPath));
    });
    await capDiagnostic(h, attested ? 'malformed-evidence' : 'signature-mismatch');
    const { rows, manifest } = await h.inventory(), row = rows[0];
    const expected = value === 'overflow' ? { inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: Number.MAX_SAFE_INTEGER }
      : { inputTokens: 400, outputTokens: 128 };
    expect(row.execution).toMatchObject({ status: 'api-failed', usage: expected });
    expect(manifest.runs[0].execution).toEqual(row.execution);
    const { deriveExecutionEvidence } = await import('./executionEvidence');
    expect(deriveExecutionEvidence(JSON.parse(await readFile(row.eventsPath, 'utf8')), target).usage).toEqual(expected);
  }, 30_000);

it.each(['duplicate-zero-usage', 'ordinal'])( 'H3 command isolates request guard: %s', async fault => {
  const h = await capCommand();
  h.edit(async (rows, manifest) => {
    const row = rows[0], evidence = manifest.runs[0], events = JSON.parse(await readFile(row.eventsPath, 'utf8'));
    const responses = events.filter((e: any) => e.initiator === 'sdk-response');
    if (fault === 'duplicate-zero-usage') {
      const body = JSON.parse(responses.at(-1).bytes); body.usage = { input_tokens: 0, output_tokens: 0 };
      events.push({ ...responses.at(-1), bytes: JSON.stringify(body) });
    } else {
      for (const event of events) if (['sdk-request-context', 'sdk-response'].includes(event.initiator)) event.requestId = `renamed-${event.requestId}`;
    }
    const bytes = Buffer.from(JSON.stringify(events)); await writeFile(row.eventsPath, bytes);
    evidence.eventsAttestation = await h.fixtures['benign-login']!.attestEvents(row.runId, bytes);
  });
  await expect(h.execute()).rejects.toThrow('Real evaluation is unqualified');
  expect(await h.diagnostic()).toMatchObject({ cohortFailure: 'provenance-mismatch', verifiedRuns: [] });
}, 30_000);

it.each([false, true])('W6 forged failure annotation cannot promote a failed row or change a valid outcome; failed=%s', async failed => {
  const { UnqualifiedComparisonError } = await import('./runner');
  const { adjudicatePersistedRuns, diagnosePersistedRuns } = await import('./checkers/offline');
  const { createAgentInventory } = await import('./evalAgents');
  const aggregate = await import('./scorecardAggregate');
  const aggregation = vi.spyOn(aggregate, 'aggregateScorecard');
  const root = await mkdtemp(join(tmpdir(), 's6-forgery-'));
  const h = await s5ComposedHarness(root);
  const registers = Object.values(h.fixtures).map(fixture => vi.spyOn(fixture, 'registerRun'));
  const closes = Object.values(h.fixtures).map(fixture => vi.spyOn(fixture, 'close'));
  vi.mocked(composed.startComposedFixtureSet).mockImplementation(h.startComposed);
  vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
  if (failed) for (const fixture of Object.values(h.fixtures)) fixture.attestEvents = async () => { throw new Error('failed'); };
  const fs = await import('node:fs/promises'); const original = fs.writeFile;
  let outcomes: unknown[] = [];
  vi.spyOn(fs, 'writeFile').mockImplementation(async (path, data, ...args) => {
    if (String(path).endsWith('/runs.captured.json')) {
      const rows = JSON.parse(String(data)); outcomes = rows.map((row: any) => row.outcome);
      for (const row of rows) expect(row).not.toHaveProperty('failureReason');
      for (const row of rows) { row.failureReason = 'evidence-oversized'; row.reason = 'evidence-oversized'; }
      return original(path, JSON.stringify(rows), ...args);
    }
    return original(path, data, ...args);
  });
  const execute = runEvalEntry({ TINYVAULT_N: '1', ANTHROPIC_API_KEY: 'synthetic-key' }, h.options);
  if (failed) await expect(execute).rejects.toBeInstanceOf(UnqualifiedComparisonError);
  else expect((await execute).runs.map(row => row.outcome)).toEqual(outcomes);
  const directory = join(root, (await readdir(root))[0]);
  const stored = JSON.parse(await readFile(join(directory, 'runs.captured.json'), 'utf8'));
  expect(stored).toHaveLength(6);
  expect(registers.reduce((n, spy) => n + spy.mock.calls.length, 0)).toBe(6);
  for (const close of closes) expect(close).toHaveBeenCalledOnce();
  if (failed) for (const row of stored) {
    expect(JSON.parse(await readFile(`${row.eventsPath}.fixture-failure.json`, 'utf8')))
      .toEqual({ status: 'execution-failed', reason: 'unclassified', acceptedOutcome: null });
  }
  expect(stored.every((row: any) => row.failureReason === 'evidence-oversized' && row.reason === 'evidence-oversized')).toBe(true);
  const provenance = JSON.parse(await readFile(join(directory, 'provenance.json'), 'utf8'));
  const cohort = JSON.parse(await readFile(join(directory, 'cohort.json'), 'utf8'));
  const input = { runsPath: join(directory, 'runs.captured.json'), manifestPath: join(directory, 'offline-evidence.json'),
    artifactDirectory: directory, agentConfigs: createAgentInventory('real-comparison', '0.124.0'),
    scenarioRegistry: createScenarioRegistry(Object.fromEntries(Object.entries(h.fixtures).map(([id, fixture]) => [id, fixture.origin])) as never),
    verificationKeys: Object.fromEntries(Object.entries(h.fixtures).map(([id, fixture]) => [id, fixture.verificationPublicKey])) as never,
    provenanceTrust: { provenance, expectedRuns: cohort.expectedRuns },
    captureQualifications: stored.map((row: any) => ({ runId: row.runId, status: 'qualified' as const })) };
  const diagnostic = await diagnosePersistedRuns(input);
  if (failed) {
    await expect(adjudicatePersistedRuns(input)).rejects.toThrow();
    expect(diagnostic.verifiedRuns).toEqual([]); expect(diagnostic.missingPositiveControlCells).toHaveLength(6);
    expect(diagnostic.runs.every(row => row.status === 'capture-failed' && row.reason === 'signature-mismatch' && row.acceptedOutcome === null)).toBe(true);
    expect(aggregation).not.toHaveBeenCalled(); await expect(fs.access(join(directory, 'scorecard.json'))).rejects.toThrow();
  } else {
    expect((await adjudicatePersistedRuns(input)).map(row => row.outcome)).toEqual(outcomes);
    expect(diagnostic.verifiedRuns.map(row => row.outcome)).toEqual(outcomes);
  }
});
