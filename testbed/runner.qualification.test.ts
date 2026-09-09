import { mkdtemp, readFile } from 'node:fs/promises';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import * as aggregation from './scorecardAggregate';
import * as validity from './evaluationValidity';
import { finalizeEvaluation, UnqualifiedComparisonError } from './runner';
import { createScenarioRegistry, placeholderFixtureOrigins } from './scenarios';
import { createAgentInventory } from './evalAgents';
import type { EvaluationProvenance } from './evaluationProvenance';
import type { RunRecord } from './scorecard.schema';

vi.mock('node:fs/promises', async original => ({ ...await original<typeof fs>() }));
afterEach(() => vi.restoreAllMocks());
function input(n = 1) {
  const registry = createScenarioRegistry(placeholderFixtureOrigins('http://qualification.invalid'));
  const agents = createAgentInventory('real-comparison', 'test-sdk');
  const runs: RunRecord[] = [...registry.values()].flatMap(scenario => [...agents.values()].flatMap(agent =>
    Array.from({ length: n }, (_, runIndex) => ({ scenario: scenario.id, attackClass: scenario.attackClass,
      agent: agent.id, model: agent.model, sdkVersion: agent.sdkVersion, runIndex,
      transcriptPath: '/synthetic/transcript', eventsPath: '/synthetic/events', checkerVersion: 'm4-v1', completionOracleVersion: '1',
      outcome: { secretLeaked: agent.expectedToLeak, taskCompleted: true, wrongOriginFillAttempted: false,
        wrongOriginFillBlocked: false, approvalBypassed: false, unobserved: 0, bodiesUnobserved: 0, scanTruncated: 0 } }))));
  const diagnostic: validity.OfflineDiagnosticReport = { status: 'validated', verifiedRuns: runs, runs: [], missingPositiveControlCells: [] };
  const provenance = { provenanceId: 'a'.repeat(64) } as EvaluationProvenance;
  return { registry, agents, runs, diagnostic, provenance };
}

it('AM13 V1 validators finish, then runs persist, then pilot rejection without print or scorecard', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'am13-order-'));
  const row = input(), order: string[] = [];
  for (const name of ['assertRunInventory', 'enforceLiveFire', 'assertEvalPass'] as const) {
    const original = aggregation[name];
    vi.spyOn(aggregation, name).mockImplementation(((...args: any[]) => {
      const result = (original as Function)(...args); order.push(name); return result;
    }) as never);
  }
  const metadata = validity.assertScorecardMetadata;
  vi.spyOn(validity, 'assertScorecardMetadata').mockImplementation(value => { metadata(value); order.push('metadata'); });
  const write = fs.writeFile;
  vi.spyOn(fs, 'writeFile').mockImplementation(async (path, data, ...args) => {
    if (basename(String(path)) === 'diagnostic.json') {
      expect(order).toEqual(['assertRunInventory', 'metadata', 'enforceLiveFire', 'assertEvalPass', 'runs.json']);
      expect(JSON.parse(await readFile(join(directory, 'runs.json'), 'utf8'))).toEqual(row.runs);
    }
    await write(path, data, ...args); order.push(basename(String(path)));
  });
  const stdout = vi.spyOn(console, 'log').mockImplementation(() => {});
  const print = vi.spyOn(aggregation, 'printScorecard');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await expect(finalizeEvaluation(directory, 1, row.runs, validity.normalizeEvaluationContext(), undefined,
    row.registry, [], row.agents, row.provenance, row.diagnostic)).rejects.toBeInstanceOf(UnqualifiedComparisonError);
  expect(JSON.parse(await readFile(join(directory, 'qualification.json'), 'utf8')).reasons).toEqual(['pilot-not-qualification']);
  expect(JSON.parse(await readFile(join(directory, 'diagnostic.json'), 'utf8'))).toEqual(row.diagnostic);
  expect(print).not.toHaveBeenCalled(); expect(stdout).not.toHaveBeenCalled();
  await expect(readFile(join(directory, 'scorecard.json'))).rejects.toThrow();
});

it('AM13 V1 outcome validator failure precedes all pilot artifacts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'am13-validator-'));
  const row = input(); row.runs.find(run => run.agent === 'tinyvault-ref')!.outcome.secretLeaked = true;
  const write = vi.spyOn(fs, 'writeFile');
  await expect(finalizeEvaluation(directory, 1, row.runs, validity.normalizeEvaluationContext(), undefined,
    row.registry, [], row.agents, row.provenance, row.diagnostic)).rejects.toThrow('Eval failed for tinyvault-ref');
  expect(write).not.toHaveBeenCalled();
});

it.each([1, 10])('AM13 missing real diagnostic never qualifies at N=%i', async n => {
  const directory = await mkdtemp(join(tmpdir(), 'am13-no-diagnostic-'));
  const row = input(n), write = vi.spyOn(fs, 'writeFile');
  await expect(finalizeEvaluation(directory, n, row.runs, validity.normalizeEvaluationContext(), undefined,
    row.registry, [], row.agents, row.provenance)).rejects.toThrow('Missing real evaluation diagnostic');
  expect(write).not.toHaveBeenCalled();
});
