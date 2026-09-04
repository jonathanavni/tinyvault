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

describe('eval runner artifact lifecycle', () => {
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
    const runDirectory = join(directory, 'runs', 'benign-login-control-stub-00');
    const files = await readdir(runDirectory);
    const vaultPath = join(runDirectory, files.find((file) => file.endsWith('.json')
      && file.startsWith('vault-'))!);
    const keyPath = join(runDirectory, files.find((file) => file.endsWith('.key'))!);

    expect((await stat(vaultPath)).mode & 0o777).toBe(0o600);
    expect((await stat(keyPath)).mode & 0o777).toBe(0o600);
    expect(result.runs).toHaveLength(1);
  });
});

describe('eval runner plaintext artifact inventory', () => {
  it('enumerates every canary-bearing or canary-unlocking artifact class', async () => {
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
      const relativePath = relative(directory, path);
      if ((await readFile(path)).includes(canary)
        || relativePath.endsWith('.unauthorized.requests')
        || /(?:^|\/)vault-[A-Za-z0-9_-]+\.(?:json|key)$/u.test(relativePath)) {
        bearing.push(relativePath.replace(/vault-[A-Za-z0-9_-]+\.(json|key)$/u, 'vault-*.$1'));
      }
    }

    expect(bearing.sort()).toEqual([
      'fixture-captures/benign-login-control-stub-00.requests',
      'fixture-captures/benign-login-control-stub-00.unauthorized.requests',
      'offline-evidence.json',
      'runs/benign-login-control-stub-00/events.json',
      'runs/benign-login-control-stub-00/vault-*.json',
      'runs/benign-login-control-stub-00/vault-*.key',
    ]);
    expect(await readFile(result.runs[0].transcriptPath, 'utf8')).not.toContain(canary);
    expect(await readFile(result.scorecardPath, 'utf8')).not.toContain(canary);
  });

  // The Acceptance J runtime-result gate must stay wired into `npm test` AND keep its fail-closed composition.
  // Position alone is not enough: `|| true`, a bare `;`, an `echo` sharing the string, a command substitution, or
  // replacement by `node -e` all keep the command present and early while making its exit status inert — each was
  // demonstrated against the previous position-only pin. The adjacency assertion below pins the CURRENT fail-closed
  // `&&` composition. It does NOT prove exit propagation under arbitrary future shell rewrites: a trailing
  // whole-command `|| true`, removal of the enclosing invocation, or coordinated edits to both the package script
  // and this test remain outside what an in-band test can establish. The package/build entry point is a reviewed
  // root of trust, and that is recorded as a declared residual in `docs/m5-2-review-findings.md` §C-S2.
  it('keeps the Acceptance J result gate wired ahead of the suite in a fail-closed && composition', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts: { test: string };
    };
    const testScript = packageJson.scripts.test;
    expect(testScript).toContain('&& node scripts/check-acceptance-j-results.mjs &&');
    expect(testScript.indexOf('node scripts/check-acceptance-j-results.mjs'))
      .toBeLessThan(testScript.indexOf('vitest run'));
  });

  // Every wall-clock gate runs in its own serial vitest invocation after the parallel suite (M4 convention;
  // M5 slice A added the decoder timing file, A-Q1). Mutant killed: a timing file left in the parallel run, or the
  // host timing family no longer last.
  it('runs every timing file only in a serial test invocation, the host timing family last', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts: { test: string };
    };
    const testScript = packageJson.scripts.test;
    const invocations = testScript.match(/vitest run[^&]*/gu) ?? [];
    expect(invocations).toHaveLength(3);
    expect(invocations[0]).toContain("--exclude 'src/supervisor/host.timing.browser.test.ts'");
    expect(invocations[0]).toContain("--exclude 'testbed/checkers/leakDecoders.timing.test.ts'");
    expect(invocations[1].trim()).toBe('vitest run testbed/checkers/leakDecoders.timing.test.ts');
    expect(invocations[2].trim()).toBe('vitest run src/supervisor/host.timing.browser.test.ts');
  });

  it('preserves an existing artifact bundle when the checker meta-gate fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-meta-gate-preserve-'));
    const prior = join(directory, 'runs.json');
    await writeFile(prior, 'previous bundle');

    await expect(runEval({
      artifactDirectory: directory,
      runMetaGate: () => ({
        passed: false, failures: ['forced failure'], plantedCases: 0, negativeControls: 0,
      }),
    })).rejects.toThrow('Checker meta-gate failed');
    expect(await readFile(prior, 'utf8')).toBe('previous bundle');
  });
});
