import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import {
  assertProbeFamily,
  assertProbeHardClause,
  runProbeP,
  wilcoxonSignedRank,
  type ProbePResult,
} from './probeP';

type GoldenVector = Readonly<{
  differences: readonly number[];
  nonZero: number;
  wPlus: number;
  wMinus: number;
  variance: number;
  z: number;
  pValue: number;
  effectSize: number;
  medianDiffMs: number;
  scipyPValue: number;
  scipyZ: number;
}>;

type HolmVector = Readonly<{
  alpha: number;
  pValues: Readonly<Record<string, number>>;
  thresholdsInOrder?: readonly number[];
  rejected: readonly string[];
}>;

type GoldenFile = Readonly<{
  vectors: Readonly<Record<string, GoldenVector>>;
  holm: readonly HolmVector[];
}>;

const GOLDEN = JSON.parse(readFileSync(
  new URL('../../docs/m4-probe-p-golden.json', import.meta.url),
  'utf8',
)) as GoldenFile;
const FAMILY_NAMES = Object.freeze(Object.keys(GOLDEN.holm[0]!.pValues));

/*
 * D10 mutant map (the quoted text is the named assertion below):
 * - one-sided tail, zero retention, and constant p: "matches every independently computed paired golden vector"
 * - unpaired MWU restored: "uses paired differences rather than pooled samples in the runner"
 * - missing tie correction / continuity correction: the same assertion's ties/plain cases
 * - wrong d sign: "detects a synthetic five-millisecond shift with the hard clause"
 * - AB-only and A/B/A/B-block ordering: "counterbalances four pairs as ABBAABBA exactly"
 * - pairs != 500 / warmup != 20: the two "keeps the ... default" assertions
 * - family alpha != 0.01: "keeps the family alpha default at 0.01"
 * - per-probe uncorrected alpha: "stops when the smallest p is above alpha/6"
 * - missing/extra/duplicate tolerance: "rejects an inexact family name set"
 */
describe('probe P paired statistic', () => {
  it.each(Object.entries(GOLDEN.vectors))(
    'matches every independently computed paired golden vector: %s',
    (_name, vector) => {
      const result = wilcoxonSignedRank(vector.differences);
      expect(result.nonZero).toBe(vector.nonZero);
      expectWithin1e9(result.wPlus, vector.wPlus);
      expectWithin1e9(result.wMinus, vector.wMinus);
      expectWithin1e9(result.variance, vector.variance);
      expectWithin1e9(result.z, vector.z);
      expectWithin1e9(result.pValue, vector.pValue);
      expectWithin1e9(result.effectSize, vector.effectSize);
      expectWithin1e9(result.medianDiffMs, vector.medianDiffMs);
      expectWithin1e9(result.pValue, vector.scipyPValue);
      expectWithin1e9(Math.abs(result.z), Math.abs(vector.scipyZ));
    },
  );

  it('returns the pinned neutral result when every paired difference is zero', () => {
    expect(wilcoxonSignedRank([0, -0, 0])).toEqual({
      nonZero: 0,
      wPlus: 0,
      wMinus: 0,
      variance: 0,
      z: 0,
      pValue: 1,
      effectSize: 0,
      medianDiffMs: 0,
    });
  });

  it.each([
    ['just below positive limit', 1.999, false],
    ['at positive limit', 2, false],
    ['at negative limit', -2, false],
    ['just beyond negative limit', -2.001, true],
  ] as const)('keeps the two-millisecond hard clause: %s', (_name, medianDiffMs, rejects) => {
    const assertion = () => assertProbeHardClause({ medianDiffMs });
    if (rejects) expect(assertion).toThrow('Probe P hard clause detected a timing difference');
    else expect(assertion).not.toThrow();
  });

  it('detects a synthetic five-millisecond shift with the hard clause', async () => {
    const result = await runWithDifferences(Array.from({ length: 12 }, () => 5));
    expect(result.medianDiffMs).toBe(5);
    expect(() => assertProbeHardClause(result)).toThrow('Probe P hard clause detected a timing difference');
  });

  it('uses paired differences rather than pooled samples in the runner', async () => {
    const vector = GOLDEN.vectors.plain!;
    const result = await runWithDifferences(vector.differences);
    expectWithin1e9(result.z, vector.z);
    expectWithin1e9(result.pValue, vector.pValue);
    expectWithin1e9(result.effectSize, vector.effectSize);
    expectWithin1e9(result.medianDiffMs, vector.medianDiffMs);
  });
});

describe('probe P Holm-Bonferroni family gate', () => {
  it.each(GOLDEN.holm)('rejects exactly the pinned Holm vector %#', (vector) => {
    const entries = Object.entries(vector.pValues).map(([name, pValue]) => ({ name, pValue }));
    const message = familyError(entries, { alpha: vector.alpha, expected: Object.keys(vector.pValues) });
    expect(message).toBe(`Probe P family rejected: ${vector.rejected.join(', ')}`);
    vector.thresholdsInOrder?.forEach((threshold, index) => {
      expectWithin1e9(vector.alpha / (entries.length - index), threshold);
    });
  });

  it('keeps the family alpha default at 0.01', () => {
    const vector = GOLDEN.holm[0]!;
    const entries = Object.entries(vector.pValues).map(([name, pValue]) => ({ name, pValue }));
    expect(familyError(entries, { expected: Object.keys(vector.pValues) }))
      .toBe(`Probe P family rejected: ${vector.rejected.join(', ')}`);
  });

  it('passes a seeded identical-condition null control for all six probes', () => {
    const random = seededRandom(0x5eedc0de);
    const entries = FAMILY_NAMES.map((name) => {
      const differences: number[] = [];
      for (let index = 0; index < 250; index += 1) {
        const a = random();
        const b = random();
        differences.push(b - a, a - b);
      }
      return { name, pValue: wilcoxonSignedRank(differences).pValue };
    });
    expect(entries.every(({ pValue }) => pValue === 1)).toBe(true);
    expect(() => assertProbeFamily(entries, { alpha: 0.01, expected: FAMILY_NAMES })).not.toThrow();
  });

  it('deterministically rejects 500 seeded +0.25 ms differences with ±0.5 ms noise', async () => {
    const random = seededRandom(0x25b1a5ed);
    const result = await runWithDifferences(Array.from(
      { length: 500 }, () => 0.25 + (random() - 0.5),
    ));
    expect(result.medianDiffMs).toBeGreaterThan(0);
    expect(familyError(new Map([['biased-operation', result]]), {
      alpha: 0.01,
      expected: ['biased-operation'],
    })).toBe('Probe P family rejected: biased-operation');
  });

  it('still rejects the real-timing +0.25 ms spin-loop control at 500 pairs', async () => {
    const result = await runProbeP({
      pairs: 500,
      warmup: 4,
      a: () => busyWait(1),
      b: () => busyWait(1.25),
    });
    expect(result.medianDiffMs).toBeGreaterThan(0);
    expect(familyError(new Map([['biased-operation', result]]), {
      alpha: 0.01,
      expected: ['biased-operation'],
    })).toBe('Probe P family rejected: biased-operation');
  });

  it.each([
    ['below', 0.01 / 6 - 1e-8],
    ['equal to', 0.01 / 6],
  ] as const)('rejects one p %s alpha/6', (_name, pValue) => {
    const results = familyMap({ [FAMILY_NAMES[0]!]: pValue });
    expect(familyError(results, { alpha: 0.01, expected: FAMILY_NAMES }))
      .toBe(`Probe P family rejected: ${FAMILY_NAMES[0]}`);
  });

  it.each(Array.from({ length: 6 }, (_, index) => index))(
    'pins Holm equality and just-above boundaries at step %i',
    (step) => {
      const atBoundary = new Map(FAMILY_NAMES.map((name, index) => [
        name,
        probeResult(index <= step ? 0.01 / (6 - index) : 1),
      ]));
      expect(familyError(atBoundary, { alpha: 0.01, expected: FAMILY_NAMES }))
        .toBe(`Probe P family rejected: ${FAMILY_NAMES.slice(0, step + 1).join(', ')}`);

      const justAbove = new Map(FAMILY_NAMES.map((name, index) => [
        name,
        probeResult(index < step ? 0.01 / (6 - index)
          : index === step ? 0.01 / (6 - index) + 1e-8 : 1),
      ]));
      const expected = step === 0
        ? undefined
        : `Probe P family rejected: ${FAMILY_NAMES.slice(0, step).join(', ')}`;
      expect(familyError(justAbove, { alpha: 0.01, expected: FAMILY_NAMES })).toBe(expected);
    },
  );

  it('stops when the smallest p is above alpha/6 even though it is below alpha/5', () => {
    const between = (0.01 / 6 + 0.01 / 5) / 2;
    const results = familyMap({ [FAMILY_NAMES[0]!]: between });
    expect(() => assertProbeFamily(results, { alpha: 0.01, expected: FAMILY_NAMES })).not.toThrow();
  });

  it.each([
    ['missing', FAMILY_NAMES.slice(0, 5)],
    ['extra', [...FAMILY_NAMES, 'unexpected-probe']],
    ['duplicate', [...FAMILY_NAMES, FAMILY_NAMES[0]!]],
  ] as const)('rejects an inexact family name set: %s', (_name, names) => {
    const entries = names.map((name) => ({ name, pValue: 1 }));
    expect(() => assertProbeFamily(entries, { alpha: 0.01, expected: FAMILY_NAMES }))
      .toThrow('Probe P family names mismatch');
  });
});

describe('probe P paired runner', () => {
  it('counterbalances four pairs as ABBAABBA exactly', async () => {
    const order: string[] = [];
    await runProbeP({
      pairs: 4,
      warmup: 0,
      a: () => { order.push('A'); },
      b: () => { order.push('B'); },
    });
    expect(order.join('')).toBe('ABBAABBA');
  });

  it('keeps the pairs default at 500', async () => {
    const result = await runProbeP({ warmup: 0, a: () => undefined, b: () => undefined });
    expect(result.aSamplesMs).toHaveLength(500);
    expect(result.bSamplesMs).toHaveLength(500);
    expect(result.differencesMs).toHaveLength(500);
  });

  it('keeps the warmup default at 20 samples per side', async () => {
    const order: string[] = [];
    await runProbeP({
      pairs: 0,
      a: () => { order.push('A'); },
      b: () => { order.push('B'); },
    });
    expect(order).toEqual(Array.from({ length: 20 }, () => ['A', 'B']).flat());
  });

  it('keeps setup outside the timed window for warmup and measured pairs', async () => {
    const order: string[] = [];
    const now = vi.spyOn(performance, 'now').mockImplementation(() => {
      order.push('now');
      return 0;
    });
    try {
      await runProbeP({
        pairs: 1,
        warmup: 1,
        setupA: () => { order.push('setupA'); },
        setupB: () => { order.push('setupB'); },
        a: () => { order.push('A'); },
        b: () => { order.push('B'); },
      });
    } finally {
      now.mockRestore();
    }
    const phase = ['setupA', 'now', 'A', 'now', 'setupB', 'now', 'B', 'now'];
    expect(order).toEqual([...phase, ...phase]);
  });

  it('reports paired differences and nearest-rank p95 for both conditions', async () => {
    const result = await runWithDifferences([0, 1, 2, 3]);
    expect(result.aSamplesMs).toEqual([1, 1, 1, 1]);
    expect(result.bSamplesMs).toEqual([1, 2, 3, 4]);
    expect(result.differencesMs).toEqual([0, 1, 2, 3]);
    expect(result.p95AMs).toBe(1);
    expect(result.p95BMs).toBe(4);
  });
});

function expectWithin1e9(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1e-9);
}

function familyError(
  results: Parameters<typeof assertProbeFamily>[0],
  options: Parameters<typeof assertProbeFamily>[1],
): string | undefined {
  try {
    assertProbeFamily(results, options);
    return undefined;
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return error.message;
  }
}

function familyMap(overrides: Readonly<Record<string, number>>): Map<string, ProbePResult> {
  return new Map(FAMILY_NAMES.map((name) => [name, probeResult(overrides[name] ?? 1)]));
}

function probeResult(pValue: number): ProbePResult {
  return {
    pValue,
    z: 0,
    effectSize: 0,
    medianDiffMs: 0,
    p95AMs: 0,
    p95BMs: 0,
    differencesMs: [],
    aSamplesMs: [],
    bSamplesMs: [],
  };
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296;
  };
}

function busyWait(durationMs: number): void {
  const start = performance.now();
  while (performance.now() - start < durationMs) {
    // Deliberately occupy the measured operation for the synthetic positive control.
  }
}

async function runWithDifferences(differences: readonly number[]): Promise<ProbePResult> {
  const timings: number[] = [];
  differences.forEach((difference, index) => {
    const order = index % 2 === 0 ? [1, 1 + difference] : [1 + difference, 1];
    for (const duration of order) timings.push(0, duration);
  });
  const now = vi.spyOn(performance, 'now').mockImplementation(() => {
    const value = timings.shift();
    if (value === undefined) throw new Error('Synthetic timer exhausted');
    return value;
  });
  try {
    return await runProbeP({ pairs: differences.length, warmup: 0, a: () => undefined, b: () => undefined });
  } finally {
    now.mockRestore();
  }
}
