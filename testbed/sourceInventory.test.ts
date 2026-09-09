import { expectPilot } from './pilot.testkit';
import { expect, it } from 'vitest';
import { enumerateSource } from './sourceInventory';
import { captureSourceIdentity } from './evaluationProvenance';

it('S5 enumerates tracked and nonignored untracked inputs through trusted Git', async () => {
  const root = process.cwd();
  const snapshot = await enumerateSource(root);
  expect(snapshot.paths).toContain('SKILL.md');
  expect(snapshot.paths).toContain('package-lock.json');
  expect(snapshot.paths).toContain('testbed/sourceInventory.test.ts');
  expect(snapshot.paths.some(path => /^(artifacts|node_modules|dist|\.vitest)\//.test(path))).toBe(false);
  expect((await captureSourceIdentity(root, snapshot)).inventory).toHaveLength(snapshot.paths.length);
});

import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, vi } from 'vitest';
import * as composed from './docker/composedFixtures';
import { s5ComposedHarness } from './runner.testkit';
import { runEvalEntry } from './evalEntry';

import { UnqualifiedComparisonError } from './runner';
vi.mock('./docker/composedFixtures', async original => ({ ...await original<typeof composed>(), startComposedFixtureSet: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

it('E1 one-byte root instruction edit changes every reference binding through the actual command', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'tinyvault-s5-source-'));
  // Copy read-only checkout metadata; all mutations are confined to this disposable test-controlled root.
  await cp(join(process.cwd(), '.git'), join(scratch, '.git'), { recursive: true });
  const snapshot = await enumerateSource(process.cwd());
  for (const path of snapshot.paths) {
    await mkdir(dirname(join(scratch, path)), { recursive: true }); await cp(join(process.cwd(), path), join(scratch, path));
  }
  await writeFile(join(scratch, 'new-source-input.txt'), 'nonignored source input');
  await mkdir(join(scratch, 'artifacts'), { recursive: true });
  await writeFile(join(scratch, 'artifacts', 'excluded.txt'), 'generated');
  const inventory = await enumerateSource(scratch);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const run = async () => {
    const h = await s5ComposedHarness(join(scratch, 'artifacts', 'eval'));
    h.options.sourceRoot = scratch;
    let directory = '';
    vi.mocked(composed.startComposedFixtureSet).mockImplementation(input => { directory = input.artifactRoot; return h.startComposed(input); });
    return expectPilot(runEvalEntry({ TINYVAULT_N: '1', ANTHROPIC_API_KEY: 'synthetic-key' }, h.options), () => directory);
  };
  const before = await run();
  expect(before.provenance.source.inventory.some(row => row.path === 'new-source-input.txt')).toBe(true);
  expect(before.provenance.source.inventory.some(row => row.path === 'artifacts/excluded.txt')).toBe(false);
  expect(before.provenance.source.dirty).toBe(true);
  expect(before.provenance.inputs.agentPromptSha256ById['naive-baseline'])
    .toBe('62ba8ba466139d3a40f591fec9f3454b4590d87960bcf434542e4b58dbcbb2a3');
  await writeFile(join(scratch, 'SKILL.md'), `${await readFile(join(scratch, 'SKILL.md'), 'utf8')}\n`);
  const after = await run();
  expect(after.provenance.source.filesSha256).not.toBe(before.provenance.source.filesSha256);
  expect(after.provenance.inputs.skillSha256).not.toBe(before.provenance.inputs.skillSha256);
  expect(after.provenance.inputs.agentPromptSha256ById['tinyvault-ref']).not.toBe(before.provenance.inputs.agentPromptSha256ById['tinyvault-ref']);
  expect(after.provenance.inputs.agentPromptSha256ById['naive-baseline']).toBe(before.provenance.inputs.agentPromptSha256ById['naive-baseline']);
  expect(after.provenance.provenanceId).not.toBe(before.provenance.provenanceId);
  expect(after.provenance.source.inventory.some(row => row.path === 'new-source-input.txt')).toBe(true);
  const h = await s5ComposedHarness(join(scratch, 'artifacts', 'eval')); h.options.sourceRoot = scratch;
  vi.mocked(composed.startComposedFixtureSet).mockImplementation(h.startComposed);
  const delegate = h.options.providerFetch; let changed = false;
  h.options.providerFetch = async (...args) => {
    if (!changed) { changed = true; await writeFile(join(scratch, 'new-source-input.txt'), 'changed during execution'); }
    return delegate(...args);
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await expect(runEvalEntry({ TINYVAULT_N: '1', ANTHROPIC_API_KEY: 'synthetic-key' }, h.options)).rejects.toBeInstanceOf(UnqualifiedComparisonError);
}, 60_000);

it('F9 hashes runtime declarations without scraping source text', async () => {
  const source = await readFile(new URL('./sourceInventory.ts', import.meta.url), 'utf8');
  expect(source).toContain('JSON.stringify(EVALUATED_AGENT_TOOLS)');
  expect(source).not.toContain('loopSource.match');
});
