import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as aggregation from './scorecardAggregate';
import { normalizeClaimWhitespace } from './parity/claims';
import { createScenarioRegistry, placeholderFixtureOrigins } from './scenarios';
import { aggregateScorecard, printScorecard } from './scorecardAggregate';
import { finalizeEvaluation } from './runner';
import { normalizeEvaluationContext, assertValidEvaluationContext, invalidEvaluationReport,
  InvalidEvaluationError, DOCKER_DAEMON_ISOLATION_REQUIREMENT, type EvaluationContext } from './evaluationValidity';
import type { RunRecord, Scorecard } from './scorecard.schema';
const literal = 'A valid composed evaluation assumes the Docker Engine API is unreachable by the evaluated browser, page content and agent. Local endpoint validation does not verify this assumption. An unsatisfied assumption invalidates the evaluation.';
const invalid = { architecture: 'composed', dockerDaemonIsolation: 'unsatisfied' } as const;
const run = { agent: 'probe', scenario: 'probe', model: 'stub-scripted-v1', outcome: { secretLeaked: false, taskCompleted: true,
  wrongOriginFillBlocked: false, unobserved: 0, bodiesUnobserved: 0, scanTruncated: 0 } } as RunRecord;
describe('O validity', () => {
  it.each(['README.md', 'SCHEMA.md'])('O-docs pins exactly one marked deployment assumption in %s', async (file) => {
    const text = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    const start = '<!-- TV-DEPLOYMENT-ASSUMPTION:START -->';
    const end = '<!-- TV-DEPLOYMENT-ASSUMPTION:END -->';
    expect(text.split(start)).toHaveLength(2);
    expect(text.split(end)).toHaveLength(2);
    expect(text.indexOf(end)).toBeGreaterThan(text.indexOf(start));
    const block = text.slice(text.indexOf(start) + start.length, text.indexOf(end));
    expect(normalizeClaimWhitespace(block)).toBe(normalizeClaimWhitespace(literal));
  });
  it('O-json carries exact metadata and an independently pinned requirement', () => {
    expect(DOCKER_DAEMON_ISOLATION_REQUIREMENT).toBe(literal);
    for (const architecture of ['in-process', 'composed'] as const) {
      const context = normalizeEvaluationContext(architecture);
      const score = JSON.parse(JSON.stringify(aggregateScorecard([run], 1, context)));
      expect(score.evaluationContext).toEqual(context);
      expect(score.deploymentAssumption).toEqual({ requirement: literal,
        applicability: architecture === 'composed' ? 'required' : 'composed-only' });
      expect(Object.isFrozen(context)).toBe(true);
    }
  });
  it('O-invalid-shape has only the fixed invalid report fields', () => {
    expect(invalidEvaluationReport()).toEqual({ status: 'invalid', reason: 'docker-daemon-isolation-unsatisfied',
      architecture: 'composed', requirement: literal });
    expect(() => assertValidEvaluationContext(invalid)).toThrow(InvalidEvaluationError);
  });
  const bad = [undefined, null, {}, { ...invalid, dockerDaemonIsolation: 'not-applicable' },
    { architecture: 'in-process', dockerDaemonIsolation: 'assumed' },
    { architecture: 'in-process', dockerDaemonIsolation: 'unsatisfied' },
    { architecture: 'in-process', dockerDaemonIsolation: null },
    { architecture: undefined, dockerDaemonIsolation: undefined },
    { architecture: 'composed', dockerDaemonIsolation: 'unknown' },
    { architecture: 'in-process', dockerDaemonIsolation: 'not-applicable', extra: true },
    { architecture: 'in-process', dockerDaemonIsolation: 'not-applicable', [Symbol('extra')]: true },
    Object.create({ architecture: 'in-process', dockerDaemonIsolation: 'not-applicable' }),
    { get architecture() { throw new Error('accessor evaluated'); }, dockerDaemonIsolation: 'not-applicable' }, invalid];
  it.each(bad.map((context, i) => ({ context, i })))('O-direct-context rejects invalid context $i before inventory or metrics', async ({ context }) => {
    const runs = new Proxy([] as RunRecord[], { get() { throw new Error('metrics reached'); } });
    expect(() => aggregateScorecard(runs, 1, context as EvaluationContext)).toThrow(/Invalid evaluation metadata|docker-daemon-isolation-unsatisfied/);
    await expect(finalizeEvaluation('/unused', 1, runs, context as EvaluationContext, undefined))
      .rejects.toThrow(/Invalid evaluation metadata|docker-daemon-isolation-unsatisfied/);
  });
  it('O-direct-context invalid finalizer preserves prior artifact bytes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tinyvault-invalid-'));
    await writeFile(join(dir, 'scorecard.json'), 'historical');
    await expect(finalizeEvaluation(dir, 1, [], invalid, undefined)).rejects.toThrow(InvalidEvaluationError);
    expect(await readFile(join(dir, 'scorecard.json'), 'utf8')).toBe('historical');
  });
  it('O-json writer validates metadata before replacing artifact bytes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tinyvault-invalid-writer-'));
    await writeFile(join(dir, 'scorecard.json'), 'historical');
    const context = normalizeEvaluationContext();
    const fake = aggregateScorecard([run], 1, context);
    fake.deploymentAssumption = { ...fake.deploymentAssumption, requirement: 'altered' as typeof literal };
    const spy = vi.spyOn(aggregation, 'aggregateScorecard').mockReturnValue(fake);
    try {
      const registry = createScenarioRegistry(placeholderFixtureOrigins('http://fixture.invalid'), []);
      await expect(finalizeEvaluation(dir, 1, [], context, undefined, registry)).rejects.toThrow('Invalid evaluation metadata');
      expect(await readFile(join(dir, 'scorecard.json'), 'utf8')).toBe('historical');
    } finally { spy.mockRestore(); }
  });
  it('O-human validates every metadata field before output and prints applicability honestly', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      for (const architecture of ['in-process', 'composed'] as const) {
        const score = aggregateScorecard([run], 1, normalizeEvaluationContext(architecture));
        printScorecard(score);
        expect(log.mock.calls.flat()).toContain(literal);
        expect(log.mock.calls.flat()).toContain(architecture === 'composed'
          ? 'Docker daemon isolation: assumed (unverified).'
          : 'Composed requirement: not applicable to this in-process diagnostic.');
        for (const mutate of [
          (s: Scorecard) => { s.evaluationContext = invalid as unknown as Scorecard['evaluationContext']; },
          (s: Scorecard) => { s.deploymentAssumption = { ...s.deploymentAssumption, requirement: 'altered' as typeof literal }; },
          (s: Scorecard) => { s.deploymentAssumption = { ...s.deploymentAssumption, applicability: architecture === 'composed' ? 'composed-only' : 'required' }; },
          (s: Scorecard) => { Object.assign(s.deploymentAssumption, { extra: true }); },
        ]) {
          const changed = structuredClone(score); mutate(changed); log.mockClear();
          expect(() => printScorecard(changed)).toThrow(); expect(log).not.toHaveBeenCalled();
        }
      }
    } finally { log.mockRestore(); }
  });
});

describe('M6 explicit inventory aggregation', () => {
  it('keeps the selected baseline denominator and enforces the selected reference threshold', async () => {
    const { createAgentInventory } = await import('./evalAgents');
    const registry = createScenarioRegistry(placeholderFixtureOrigins('http://inventory.invalid'));
    const comparison = createAgentInventory('real-comparison', 'test-sdk');
    const rows: RunRecord[] = [...registry.values()].flatMap(scenario => [...comparison.values()].map(config => ({
      ...run, scenario: scenario.id, attackClass: scenario.attackClass, agent: config.id, model: config.model, sdkVersion: config.sdkVersion,
      runIndex: 0, outcome: { ...run.outcome, taskCompleted: config.requiredToPass, secretLeaked: config.expectedToLeak },
    })));
    expect(() => aggregation.assertRunInventory(rows, 1, registry, comparison)).not.toThrow();
    const score = aggregateScorecard(rows, 1, normalizeEvaluationContext(), undefined, []);
    expect(score.model).toBe('claude-haiku-4-5-20251001');
    expect(() => aggregation.assertEvalPass(score, comparison)).not.toThrow();
    expect(() => aggregation.enforceLiveFire(rows, score, comparison)).not.toThrow();
    score.perAgent.find(agent => agent.agent === 'tinyvault-ref')!.tasksCompleted = 0;
    expect(() => aggregation.assertEvalPass(score, comparison)).toThrow('Eval failed');
    const baseline = createAgentInventory('real-baseline', 'test-sdk');
    const baselineRows = rows.filter(row => row.agent === 'naive-baseline');
    expect(() => aggregation.assertRunInventory(baselineRows, 1, registry, baseline)).not.toThrow();
    expect(() => aggregation.assertRunInventory(baselineRows, 1, registry, comparison)).toThrow('missing');
  });
});


describe('R1 observed scorecard model and sample-size guards', () => {
  it('uses the actual runs model', () => {
    const actual = { ...run, model: 'claude-haiku-4-5-20251001' };
    expect(aggregateScorecard([actual], 1, normalizeEvaluationContext()).model).toBe(actual.model);
  });
  it('rejects mixed model IDs rather than emitting a list or silently using the first', () => {
    expect(() => aggregateScorecard([run, { ...run, model: 'other-model' }], 1, normalizeEvaluationContext())).toThrow();
  });
  it.each([undefined, null, '', 123])('rejects missing or nonstring model %j', model => {
    const row = { ...run, model } as RunRecord;
    if (model === undefined) delete (row as Partial<RunRecord>).model;
    expect(() => aggregateScorecard([row], 1, normalizeEvaluationContext())).toThrow();
  });
  it.each([0, -1, 1.5, NaN, Infinity])('rejects invalid sample size %j', sampleSize => {
    expect(() => aggregation.assertRunInventory([], sampleSize)).toThrow('Invalid sample size');
  });
});
