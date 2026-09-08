import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { runOnce } from './runnerExecution';
import { isEvidenceOversized, markClosedProject } from './evidenceOversize';
import { MAX_EVENTS_BYTES } from './docker/protocol';
import { CanaryGenerator } from './canary';
import { createBenignLoginScenario } from './scenarios';
import { createAgentInventory } from './evalAgents';
import { createLocalFileBackend } from '../src/backends/localFile';
import { runAgentLoop } from '../src/agents/loop';
import { executeRealAgentRun } from './realAgentRun';

vi.mock('node:fs/promises', async original => ({ ...await original<typeof import('node:fs/promises')>() }));
vi.mock('../src/agents/loop', async original => ({ ...await original<typeof import('../src/agents/loop')>(), runAgentLoop: vi.fn() }));
vi.mock('./realAgentRun', async original => ({ ...await original<typeof import('./realAgentRun')>(), executeRealAgentRun: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
async function guardHarness(mode: 'stub' | 'real', size: number, staleStat = false) {
  const directory = await mkdtemp(join(tmpdir(), 's6-guard-'));
  const bytes = Buffer.from('[]' + ' '.repeat(size - 2));
  vi.mocked(runAgentLoop).mockImplementation(async input => {
    await input.transcript.close(); await writeFile(input.transcript.eventsPath, bytes);
    return { events: [], stopReason: 'complete', turns: 1 } as never;
  });
  vi.mocked(executeRealAgentRun).mockImplementation(async input => {
    await writeFile(input.eventsPath, bytes);
    return { intact: true, events: [], execution: { status: 'completed', model: input.agent.model,
      sdkVersion: input.agent.sdkVersion, usage: { inputTokens: 1, outputTokens: 1 }, stopReason: 'end_turn',
      attemptCount: 1, taskFactsSha256: 'a'.repeat(64) } };
  });
  const attestEvents = vi.fn(async () => 'attestation');
  const fixture = { origin: 'http://fixture.invalid', registerRun: vi.fn(async (_setup: { runId: string }) => {}), finalizeRun: vi.fn(async () => {}),
    takeReceipt: vi.fn(async () => undefined), captureRequests: vi.fn(async () => Buffer.from('')),
    verifyCompletion: () => ({ taskCompleted: false }), attestEvents };
  const createHost = async ({ backend }: { backend: { dispose(): Promise<void> } }) => ({
    tools: { list_vault: async () => ({ items: [] }) }, closeAll: () => backend.dispose(),
    finish: () => ({ verdict: 'pass' }), abort: () => {} });
  const fs = await import('node:fs/promises');
  const reads = vi.spyOn(fs, 'readFile');
  const originalStat = fs.stat;
  const stats = vi.spyOn(fs, 'stat');
  if (staleStat) stats.mockImplementation(async (...args) => {
    const result = await originalStat(...args);
    return String(args[0]).endsWith('/events.json') ? { ...result, size: MAX_EVENTS_BYTES } as typeof result : result;
  });
  const execute = () => runOnce({ runIndex: 0, fixture: fixture as never, scenario: createBenignLoginScenario(fixture.origin),
    generator: new CanaryGenerator(), artifactDirectory: directory, browser: {} as never,
    createHost: createHost as never, createBackend: createLocalFileBackend, maxTurns: 16,
    ...(mode === 'real' ? { agent: createAgentInventory('real-comparison', '0.124.0').get('tinyvault-ref')!, real: {
      runId: 'benign-login-ref-00', executionId: 'execution', provenance: { provenanceId: 'p' } as never,
      skillText: '', createModelClient: vi.fn() as never, producers: { executionId: 'execution', coverage: [] } } } : {}) });
  return { directory, bytes, fixture, reads, stats, execute };
}
it.each([
  ['stub', MAX_EVENTS_BYTES, false], ['stub', MAX_EVENTS_BYTES + 1, false],
  ['real', MAX_EVENTS_BYTES, false], ['real', MAX_EVENTS_BYTES + 1, false],
  ['stub', MAX_EVENTS_BYTES + 1, true], ['real', MAX_EVENTS_BYTES + 1, true],
] as const)('W2 runner guard %s at %i bytes; stale stat=%s', async (mode, size, staleStat) => {
  const { directory, bytes, fixture, reads, stats, execute } = await guardHarness(mode, size, staleStat);
  const result = execute();
  if (size > MAX_EVENTS_BYTES && mode === 'stub') {
    const error = await result.catch(error => error);
    expect(fixture.attestEvents).not.toHaveBeenCalled();
    expect(isEvidenceOversized(error)).toBe(true);
    expect(error).toMatchObject({ byteLength: size, cap: MAX_EVENTS_BYTES });
  } else {
    const output = await result;
    if (size === MAX_EVENTS_BYTES) {
      expect(fixture.attestEvents).toHaveBeenCalledExactlyOnceWith(fixture.registerRun.mock.calls[0][0].runId, bytes);
      expect(output.terminal).toBeUndefined(); expect(output.record.outcome).not.toBeNull();
      expect(output.evidence.eventsAttestation).toBe('attestation');
    } else {
      expect(fixture.attestEvents).not.toHaveBeenCalled();
      expect(output.terminal).toMatchObject({ kind: 'evidence-oversized', runId: 'benign-login-ref-00', sidecarWriteFailed: false,
        row: { scenario: 'benign-login-control', agent: 'tinyvault-ref', runIndex: 0, runId: 'benign-login-ref-00',
          status: 'execution-failed', reason: 'evidence-oversized', acceptedOutcome: null,
          artifacts: { eventsPath: output.record.eventsPath, transcriptPath: output.record.transcriptPath,
            fixtureCapturePath: join(directory, 'fixture-captures', 'benign-login-ref-00.requests') } } });
      expect(output.record).toMatchObject({ outcome: null, failureReason: 'evidence-oversized', execution: { status: 'capture-failed' } });
      expect(output.evidence.eventsAttestation).toBe('');
      expect(JSON.parse(await readFile(`${output.record.eventsPath}.fixture-failure.json`, 'utf8'))).toEqual({
        status: 'execution-failed', reason: 'evidence-oversized', acceptedOutcome: null, byteLength: size, cap: MAX_EVENTS_BYTES });
    }
  }
  expect(stats.mock.calls.filter(([path]) => String(path).endsWith('/events.json'))).toHaveLength(1);
  expect(reads.mock.calls.filter(([path]) => String(path).endsWith('/events.json')))
    .toHaveLength(size > MAX_EVENTS_BYTES && !staleStat ? 0 : 1);
  expect(fixture.registerRun).toHaveBeenCalledOnce(); expect(fixture.finalizeRun).toHaveBeenCalledOnce();
  expect(fixture.takeReceipt).toHaveBeenCalledOnce(); expect(fixture.captureRequests).toHaveBeenCalledOnce();
});
it('W10 marked plain error cannot supply terminal construction codes', async () => {
  const h = await guardHarness('real', MAX_EVENTS_BYTES);
  const error = Object.assign(new Error('initiator'), { code: 'attacker-string', teardownCode: 'attacker-teardown' });
  markClosedProject(error);
  h.fixture.attestEvents.mockRejectedValue(error);
  const output = await h.execute();
  expect(output.terminal?.kind).toBe('project-closed');
  expect(output.terminal?.code).toBeUndefined(); expect(output.terminal?.teardownCode).toBeUndefined();
  expect(output.terminal?.causeName).toBe('Error');
  expect(JSON.stringify(output.terminal)).not.toContain('attacker');
});
