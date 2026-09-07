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
const run = { agent: 'probe', scenario: 'probe', outcome: { secretLeaked: false, taskCompleted: true,
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
