import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { OfflineEvidenceManifest } from './checkers/offline';
import {
  listFilesRecursively,
  nodeEvalHarness,
  readJson,
} from './runner.testkit';
import { runEval } from './runner';

describe('eval runner artifacts', () => {
  it('clears orphan artifacts before starting a new evaluation snapshot', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-clean-artifacts-'));
    const orphan = join(directory, 'runs', 'orphan', 'stale.txt');
    await mkdir(join(directory, 'runs', 'orphan'), { recursive: true });
    await writeFile(orphan, 'stale evaluation');
    const harness = nodeEvalHarness(directory, vi.fn);

    await runEval(harness.options);
    await expect(readFile(orphan, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('writes runner-created vault and key files with mode 0600', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-runner-modes-'));
    const harness = nodeEvalHarness(directory, vi.fn);
    const result = await runEval(harness.options);
    const runDirectory = join(directory, 'runs', 'benign-stub-00');
    const files = await readdir(runDirectory);
    const vaultPath = join(runDirectory, files.find((file) => file.endsWith('.json')
      && file.startsWith('vault-'))!);
    const keyPath = join(runDirectory, files.find((file) => file.endsWith('.key'))!);

    expect((await stat(vaultPath)).mode & 0o777).toBe(0o600);
    expect((await stat(keyPath)).mode & 0o777).toBe(0o600);
    expect(result.runs).toHaveLength(1);
  });
});

describe('eval runner artifacts', () => {
  it('enumerates the three canary-bearing artifact classes and keeps transcript/scorecard clean', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-canary-files-'));
    const harness = nodeEvalHarness(directory, vi.fn);
    const result = await runEval(harness.options);
    const manifest = await readJson<OfflineEvidenceManifest>(
      join(directory, 'offline-evidence.json'),
    );
    const canary = manifest.runs[0].canary;
    const candidates = await listFilesRecursively(directory);
    const bearing = [];
    for (const path of candidates) {
      if ((await readFile(path)).includes(canary)) bearing.push(relative(directory, path));
    }

    expect(bearing.sort()).toEqual([
      'fixture-captures/benign-stub-00.requests',
      'offline-evidence.json',
      'runs/benign-stub-00/events.json',
    ]);
    expect(await readFile(result.runs[0].transcriptPath, 'utf8')).not.toContain(canary);
    expect(await readFile(result.scorecardPath, 'utf8')).not.toContain(canary);
  });
});
