import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { adjudicatePersistedRuns } from './checkers/offline';
import type { RunRecord } from './scorecard.schema';
import { offlineArtifactPaths, runEval, wilsonInterval } from './runner';

describe('eval runner', () => {
  it('derives completed zero-leak benign runs and is scorecard-deterministic', async () => {
    const firstDirectory = await mkdtemp(join(tmpdir(), 'tinyvault-eval-a-'));
    const secondDirectory = await mkdtemp(join(tmpdir(), 'tinyvault-eval-b-'));
    const options = {
      sampleSize: 2,
      seed: 'deterministic-seed',
      generatedAt: '2026-08-31T00:00:00.000Z',
    } as const;
    const first = await runEval({ ...options, artifactDirectory: firstDirectory });
    const second = await runEval({ ...options, artifactDirectory: secondDirectory });

    expect(first.scorecard).toEqual(second.scorecard);
    expect(first.scorecard.perAgent[0]).toMatchObject({
      runs: 2, leaks: 0, leakRate: 0, tasksCompleted: 2,
    });
    expect(first.runs.every((run) => run.attackClass === 'benign')).toBe(true);
    expect(first.runs.every((run) => run.outcome.taskCompleted)).toBe(true);
    expect(first.runs.every((run) => !run.outcome.secretLeaked)).toBe(true);
  });

  it('computes the locked Wilson 95% interval', () => {
    const [low, high] = wilsonInterval(0, 10);
    expect(low).toBe(0);
    expect(high).toBeCloseTo(0.2775, 3);
  });

  it('rejects a stored outcome that disagrees with persisted evidence', async () => {
    const directory = await createPersistedEval('tinyvault-offline-tamper-');
    const paths = offlineArtifactPaths(directory);
    const runs = await readJson<RunRecord[]>(paths.capturedRunsPath);
    runs[0].outcome.secretLeaked = !runs[0].outcome.secretLeaked;
    await writeFile(paths.capturedRunsPath, JSON.stringify(runs));

    await expect(adjudicatePersistedRuns({
      runsPath: paths.capturedRunsPath,
      manifestPath: paths.manifestPath,
      verificationPublicKeyPath: paths.verificationPublicKeyPath,
      nowMs: Date.now(),
    })).rejects.toThrow('Offline outcome mismatch');
  });

  it('uses one evaluation-wide ledger to reject a receipt replay across runs', async () => {
    const directory = await createPersistedEval('tinyvault-offline-replay-');
    const paths = offlineArtifactPaths(directory);
    const runs = await readJson<RunRecord[]>(paths.capturedRunsPath);
    const manifest = await readJson<{ runs: Array<{ completionBinding: unknown }> }>(
      paths.manifestPath,
    );
    runs[1].completionReceipt = runs[0].completionReceipt;
    manifest.runs[1].completionBinding = manifest.runs[0].completionBinding;
    await Promise.all([
      writeFile(paths.capturedRunsPath, JSON.stringify(runs)),
      writeFile(paths.manifestPath, JSON.stringify(manifest)),
    ]);

    await expect(adjudicatePersistedRuns({
      runsPath: paths.capturedRunsPath,
      manifestPath: paths.manifestPath,
      verificationPublicKeyPath: paths.verificationPublicKeyPath,
      nowMs: Date.now(),
    })).rejects.toThrow('Offline completion replay detected');
  });
});

async function createPersistedEval(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  await runEval({ sampleSize: 2, seed: prefix, artifactDirectory: directory });
  return directory;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}
