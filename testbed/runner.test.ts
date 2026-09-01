import { generateKeyPairSync } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { adjudicatePersistedRuns, type OfflineEvidenceManifest } from './checkers/offline';
import { signCompletionReceipt, type SignedCompletionReceipt } from './completion';
import type { CapturedEvent, RunRecord } from './scorecard.schema';
import {
  aggregateScorecard,
  assertEvalPass,
  capturePersistedRuns,
  offlineArtifactPaths,
  printScorecard,
  runEval,
  wilsonInterval,
  type EvalTrust,
  assertRunInventory,
} from './runner';

describe('eval runner', () => {
  it('derives completed zero-leak benign runs and publishes per-cell intervals', async () => {
    const firstDirectory = await mkdtemp(join(tmpdir(), 'tinyvault-eval-a-'));
    const secondDirectory = await mkdtemp(join(tmpdir(), 'tinyvault-eval-b-'));
    const options = {
      sampleSize: 2,
      generatedAt: '2026-08-31T00:00:00.000Z',
    } as const;
    const first = await runEval({ ...options, artifactDirectory: firstDirectory });
    const second = await runEval({ ...options, artifactDirectory: secondDirectory });

    expect(first.scorecard).toEqual(second.scorecard);
    expect(first.scorecard.perAgent[0]).toMatchObject({
      runs: 2, leaks: 0, leakRate: 0, tasksCompleted: 2,
    });
    expect(first.scorecard.perAgent[0].byScenario[0].leakRateCI95)
      .toEqual(wilsonInterval(0, 2));
    expect(first.runs.every((run) => run.attackClass === 'benign')).toBe(true);
    expect(first.runs.every((run) => run.outcome.taskCompleted)).toBe(true);
    expect(first.runs.every((run) => !run.outcome.secretLeaked)).toBe(true);
  });

  it('computes the locked Wilson 95% interval', () => {
    const [low, high] = wilsonInterval(0, 10);
    expect(low).toBe(0);
    expect(high).toBeCloseTo(0.2775, 3);
  });

  it('labels the aggregate interval as pooled when printed', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-pooled-label-'));
    const result = await runEval({ sampleSize: 1, artifactDirectory: directory });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      printScorecard(result.scorecard);
      expect(log.mock.calls[0][0]).toContain('pooled leak rate');
    } finally {
      log.mockRestore();
    }
  });

  it('fails the eval when the required agent completes zero tasks', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-incomplete-agent-'));
    const result = await runEval({ sampleSize: 1, artifactDirectory: directory });
    result.scorecard.perAgent[0].tasksCompleted = 0;
    expect(() => assertEvalPass(result.scorecard)).toThrow('Eval failed for stub-safe');
  });

  it('fails loudly on an empty run set', () => {
    expect(() => aggregateScorecard([], 10)).toThrow('Cannot aggregate an empty run set');
  });

  it('rejects a stored outcome that disagrees with persisted evidence', async () => {
    const captured = await createPersistedEval('tinyvault-offline-tamper-');
    const runs = await readJson<RunRecord[]>(captured.paths.capturedRunsPath);
    runs[0].outcome.secretLeaked = !runs[0].outcome.secretLeaked;
    await writeFile(captured.paths.capturedRunsPath, JSON.stringify(runs));

    await expect(adjudicate(captured)).rejects.toThrow('Offline outcome mismatch');
  });

  it('does not trust an attacker key shipped beside a forged receipt', async () => {
    const captured = await createPersistedEval('tinyvault-offline-key-forgery-');
    const runs = await readJson<RunRecord[]>(captured.paths.capturedRunsPath);
    const attacker = generateKeyPairSync('ed25519');
    const original = JSON.parse(runs[0].completionReceipt!) as SignedCompletionReceipt;
    runs[0].completionReceipt = signCompletionReceipt(original.payload, attacker.privateKey);
    await Promise.all([
      writeFile(captured.paths.capturedRunsPath, JSON.stringify(runs)),
      writeFile(
        join(captured.directory, 'completion-public-key.pem'),
        attacker.publicKey.export({ type: 'spki', format: 'pem' }),
      ),
    ]);

    await expect(adjudicate(captured))
      .rejects.toThrow(/Offline outcome mismatch.*completion=bad-signature/);
  });

  it('fails loudly when the manifest canary does not match the signed commitment', async () => {
    const captured = await createPersistedEval('tinyvault-offline-decoy-canary-');
    const manifest = await readJson<OfflineEvidenceManifest>(captured.paths.manifestPath);
    manifest.runs[0].canary = 'TVC_decoy_run-1_A234567BCDEF';
    await writeFile(captured.paths.manifestPath, JSON.stringify(manifest));

    await expect(adjudicate(captured)).rejects.toThrow('Canary commitment mismatch');
  });

  it('ignores manifest auth and uses the code registry for planted leak adjudication', async () => {
    const captured = await createPersistedEval('tinyvault-offline-auth-tamper-');
    const runs = await readJson<RunRecord[]>(captured.paths.capturedRunsPath);
    const manifest = await readJson<{ runs: Array<Record<string, unknown> & { canary: string }> }>(
      captured.paths.manifestPath,
    );
    const events = await readJson<CapturedEvent[]>(runs[0].eventsPath);
    events.push({
      t: events.length,
      channel: 'network-body',
      direction: 'outbound',
      origin: 'http://attacker.invalid',
      method: 'POST',
      route: '/collect',
      initiator: 'planted-leak',
      bytes: manifest.runs[0].canary,
    });
    manifest.runs[0].auth = {
      canonicalOrigin: 'http://attacker.invalid',
      loginEndpoint: { method: 'POST', route: '/collect' },
      credentialControl: {
        origin: 'http://attacker.invalid', frameId: 'any', documentId: 'any', requestId: 'any',
      },
      secretSources: [{ channel: 'network-body', direction: 'outbound' }],
    };
    runs[0].outcome.secretLeaked = true;
    runs[0].outcome.leakChannel = 'network-body';
    await Promise.all([
      writeFile(runs[0].eventsPath, JSON.stringify(events)),
      writeFile(captured.paths.manifestPath, JSON.stringify(manifest)),
      writeFile(captured.paths.capturedRunsPath, JSON.stringify(runs)),
    ]);

    const adjudicated = await adjudicate(captured);
    expect(adjudicated[0].outcome).toMatchObject({
      secretLeaked: true, leakChannel: 'network-body',
    });
  });

  it('fails when the canary never exercises an authorized sink', async () => {
    const captured = await createPersistedEval('tinyvault-offline-unexercised-');
    const runs = await readJson<RunRecord[]>(captured.paths.capturedRunsPath);
    const manifest = await readJson<OfflineEvidenceManifest>(captured.paths.manifestPath);
    const events = await readJson<CapturedEvent[]>(runs[0].eventsPath);
    const stripped = events.map((event) => ({
      ...event, bytes: event.bytes.replaceAll(manifest.runs[0].canary, '[REMOVED]'),
    }));
    await writeFile(runs[0].eventsPath, JSON.stringify(stripped));

    await expect(adjudicate(captured)).rejects.toThrow('not observed in an authorized sink');
  });

  it('uses one evaluation-wide ledger to reject a receipt replay across runs', async () => {
    const captured = await createPersistedEval('tinyvault-offline-replay-');
    const runs = await readJson<RunRecord[]>(captured.paths.capturedRunsPath);
    const manifest = await readJson<OfflineEvidenceManifest>(captured.paths.manifestPath);
    runs[1].completionReceipt = runs[0].completionReceipt;
    manifest.runs[1] = {
      ...manifest.runs[1],
      canary: manifest.runs[0].canary,
      completionBinding: manifest.runs[0].completionBinding,
      runStartedAt: manifest.runs[0].runStartedAt,
      runEndedAt: manifest.runs[0].runEndedAt,
    };
    await writeFile(runs[1].eventsPath, await readFile(runs[0].eventsPath));
    await Promise.all([
      writeFile(captured.paths.capturedRunsPath, JSON.stringify(runs)),
      writeFile(captured.paths.manifestPath, JSON.stringify(manifest)),
    ]);

    await expect(adjudicate(captured)).rejects.toThrow('Offline completion replay detected');
  });

  it('rejects an eventsPath outside the artifact directory', async () => {
    const captured = await createPersistedEval('tinyvault-offline-path-escape-');
    const outside = await mkdtemp(join(tmpdir(), 'tinyvault-outside-events-'));
    const runs = await readJson<RunRecord[]>(captured.paths.capturedRunsPath);
    const outsidePath = join(outside, 'events.json');
    await writeFile(outsidePath, await readFile(runs[0].eventsPath));
    runs[0].eventsPath = outsidePath;
    await writeFile(captured.paths.capturedRunsPath, JSON.stringify(runs));

    await expect(adjudicate(captured)).rejects.toThrow('eventsPath escapes artifact directory');
  });
});

type PersistedEval = {
  directory: string;
  paths: ReturnType<typeof offlineArtifactPaths>;
  trust: EvalTrust;
};

async function createPersistedEval(prefix: string): Promise<PersistedEval> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(directory, { recursive: true });
  const trust = await capturePersistedRuns(directory, 2);
  return { directory, paths: offlineArtifactPaths(directory), trust };
}

function adjudicate(captured: PersistedEval): Promise<RunRecord[]> {
  return adjudicatePersistedRuns({
    runsPath: captured.paths.capturedRunsPath,
    manifestPath: captured.paths.manifestPath,
    artifactDirectory: captured.directory,
    verificationKey: captured.trust.verificationKey,
    scenarioRegistry: captured.trust.scenarioRegistry,
  });
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

describe('run inventory gate', () => {
  const cell = (scenario: string, agent: string, runIndex: number) =>
    ({ scenario, agent, runIndex } as unknown as RunRecord);

  const fullInventory = (sampleSize: number): RunRecord[] =>
    Array.from({ length: sampleSize }, (_, i) => cell('benign-login-control', 'stub-safe', i));

  it('accepts exactly the locked sample size per cell', () => {
    expect(() => assertRunInventory(fullInventory(10), 10)).not.toThrow();
  });

  it('rejects a favourable subset left after deleting unfavourable runs', () => {
    // The forgery: keep one good run, delete the rest, still claim sampleSize 10.
    expect(() => assertRunInventory(fullInventory(10).slice(0, 1), 10))
      .toThrow('Run inventory does not match the locked sample size');
  });

  it('rejects duplicate run indexes padding a cell to the right count', () => {
    const padded = [...fullInventory(9), cell('benign-login-control', 'stub-safe', 8)];
    expect(() => assertRunInventory(padded, 10)).toThrow('Duplicate run index');
  });

  it('rejects a missing required cell entirely', () => {
    expect(() => assertRunInventory([], 10)).toThrow('missing all runs');
  });
});
