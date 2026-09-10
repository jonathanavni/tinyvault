import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanaryGenerator } from './canary';
import { createCohort } from './cohort';
import { createAgentInventory } from './evalAgents';
import { createScenarioRegistry, placeholderFixtureOrigins } from './scenarios';

vi.mock('node:crypto', async original => { const actual = await original<typeof import('node:crypto')>(); return { ...actual, randomBytes: vi.fn(actual.randomBytes) }; });
afterEach(() => vi.restoreAllMocks());

describe('S5 trusted cohort identities', () => {
  it('mints an independent exact five by two by N inventory without parsing run IDs', () => {
    const agents = createAgentInventory('real-comparison', '0.124.0');
    const scenarios = createScenarioRegistry(placeholderFixtureOrigins('http://127.0.0.1:55494'));
    const first = createCohort('real-comparison', 2, agents, scenarios);
    const second = createCohort('real-comparison', 2, agents, scenarios);
    expect(first.cohortId).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(first.executionId).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(first.expectedRuns).toHaveLength(20);
    expect(new Set(first.expectedRuns.map(row => row.runId)).size).toBe(20);
    const generator = new CanaryGenerator();
    for (const row of first.expectedRuns) {
      expect(generator.mint(row.scenario, row.runId)).toContain(row.runId);
      expect(row.runId).toBe(`${first.cohortId}-${row.scenario}-${row.agent}-${String(row.runIndex).padStart(2, '0')}`);
      expect(second.expectedRuns.some(other => other.runId === row.runId)).toBe(false);
    }
  });
});

it('rejects the eight high byte values instead of introducing modulo bias', () => {
  vi.mocked(randomBytes).mockReturnValueOnce(Buffer.from([248, 249, 250, 251, 252, 253, 254, 255, 0, 61, 62, 123, 124, 185, 186, 247]) as never);
  vi.mocked(randomBytes).mockReturnValueOnce(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]) as never);
  const cohort = createCohort('real-comparison', 1, createAgentInventory('real-comparison', '0.124.0'),
    createScenarioRegistry(placeholderFixtureOrigins('http://127.0.0.1:55494')));
  expect(cohort.cohortId).toBe('A9A9A9A9'); expect(cohort.executionId).toBe('BCDEFGHI');
});
