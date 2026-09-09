import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { evalTestTimeoutMs, MAX_TIMER_DELAY_MS } from './evalBudget';

describe('eval test timeout budget', () => {
  it('pins the N10 three-scenario two-agent timeout', () => {
    expect(evalTestTimeoutMs({ sampleSize: 10, scenarioCount: 3, agentCount: 2 }))
      .toBe(3_900_000);
  });

  it('pins the N10 five-scenario two-agent timeout', () => {
    expect(evalTestTimeoutMs({ sampleSize: 10, scenarioCount: 5, agentCount: 2 }))
      .toBe(6_300_000);
  });

  it.each(['sampleSize', 'scenarioCount', 'agentCount'] as const)(
    'rejects invalid %s values',
    (field) => {
      for (const value of [1.5, 0, -1, Number.MAX_SAFE_INTEGER + 1]) {
        const input = { sampleSize: 1, scenarioCount: 1, agentCount: 1, [field]: value };
        expect(() => evalTestTimeoutMs(input)).toThrow('positive safe integers');
      }
    },
  );

  it('exceeds the retired 30-minute literal at the default N for one- and two-agent profiles', () => {
    for (const agentCount of [1, 2]) {
      expect(evalTestTimeoutMs({ sampleSize: 10, scenarioCount: 3, agentCount })).toBeGreaterThan(1_800_000);
    }
  });

  it('refuses a budget Node would clamp to a one-millisecond timer', () => {
    expect(evalTestTimeoutMs({ sampleSize: 5_964, scenarioCount: 3, agentCount: 2 })).toBe(2_147_340_000);
    expect(() => evalTestTimeoutMs({ sampleSize: 5_965, scenarioCount: 3, agentCount: 2 }))
      .toThrow('maximum timer delay');
    expect(MAX_TIMER_DELAY_MS).toBe(2 ** 31 - 1);
  });

  it('pins the eval test timeout argument to the budget derivation', () => {
    const source = readFileSync(new URL('./runner.eval.test.ts', import.meta.url), 'utf8');
    const retiredTimeout = ['1', '800', '000'].join('_');
    expect(source).toContain('}, evalTestTimeoutMs({');
    expect(source).not.toContain(retiredTimeout);
  });
});
