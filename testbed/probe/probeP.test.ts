import { describe, expect, it } from 'vitest';

import { assertProbeP, mannWhitneyU, runProbeP } from './probeP';

const GOLDEN_VECTORS = [
  {
    a: [1, 2, 3], b: [4, 5, 6],
    expected: { u: 0, z: -1.7457431218879391, pValue: 0.08085559837005224, effectSize: 1 },
  },
  {
    a: [1, 2, 5, 7], b: [3, 4, 6, 8],
    expected: { u: 5, z: -0.7216878364870323, pValue: 0.47048642205878966, effectSize: 0.375 },
  },
  {
    a: [1, 1, 2, 3], b: [1, 2, 2, 4],
    expected: { u: 6, z: -0.455232734000163, pValue: 0.6489418131874136, effectSize: 0.25 },
  },
] as const;

describe('probe P statistic', () => {
  it.each([
    ['p just below 0.01', { pValue: 0.009_999, medianDiffMs: 0 }, true],
    ['p exactly 0.01', { pValue: 0.01, medianDiffMs: 0 }, false],
    ['p just above 0.01', { pValue: 0.010_001, medianDiffMs: 0 }, false],
    ['median delta just below 2 ms', { pValue: 1, medianDiffMs: 1.999 }, false],
    ['median delta exactly 2 ms', { pValue: 1, medianDiffMs: 2 }, false],
    ['median delta just above 2 ms', { pValue: 1, medianDiffMs: -2.001 }, true],
  ] as const)('kills assertProbeP cutoff mutations at %s', (_name, result, rejects) => {
    const assertion = () => assertProbeP(result);
    if (rejects) expect(assertion).toThrow('Probe P detected a timing difference');
    else expect(assertion).not.toThrow();
  });

  it.each(GOLDEN_VECTORS)(
    'kills constant-p, one-sided-tail, and U/effect-size mutations for vector %#',
    ({ a, b, expected }) => {
      // Golden U/z/p values were independently computed with scipy.stats and the stated variance formula.
      const result = mannWhitneyU(a, b);
      expect(result.u).toBe(expected.u);
      expect(result.z).toBeCloseTo(expected.z, 12);
      expect(result.pValue).toBeCloseTo(expected.pValue, 6);
      expect(result.effectSize).toBeCloseTo(expected.effectSize, 12);
    },
  );

  it('kills the no-tie-correction mutant with the independently computed tied vector', () => {
    const result = mannWhitneyU([1, 1, 2, 3], [1, 2, 2, 4]);
    expect(result.z).toBeCloseTo(-0.455232734000163, 12);
    expect(result.pValue).toBeCloseTo(0.6489418131874136, 6);
  });

  it('retains identical-distribution traffic while rejecting a five-millisecond shift', () => {
    const identical = Array.from({ length: 200 }, (_, index) => index / 10);
    const same = mannWhitneyU(identical, identical);
    expect(() => assertProbeP({ ...same, medianDiffMs: 0 })).not.toThrow();

    const shifted = identical.map((value) => value + 5);
    const different = mannWhitneyU(identical, shifted);
    expect(() => assertProbeP({ ...different, medianDiffMs: 5 }))
      .toThrow('Probe P detected a timing difference');
  });

  it('kills ABBA/random ordering and wrong sample-count defaults with A/B/A/B and 200 each', async () => {
    const order: string[] = [];
    const result = await runProbeP({
      warmup: 0,
      a: () => { order.push('A'); },
      b: () => { order.push('B'); },
    });
    expect(result.aSamplesMs).toHaveLength(200);
    expect(result.bSamplesMs).toHaveLength(200);
    for (let index = 0; index < order.length; index += 4) {
      expect(order.slice(index, index + 4)).toEqual(['A', 'B', 'A', 'B']);
    }
  });

  it('kills setup-inside-the-window and missing-warmup mutations', async () => {
    const order: string[] = [];
    await runProbeP({
      samplesPerCondition: 2,
      warmup: 2,
      setupA: () => { order.push('setupA'); },
      setupB: () => { order.push('setupB'); },
      a: () => { order.push('A'); },
      b: () => { order.push('B'); },
    });
    const phase = [
      'setupA', 'A', 'setupB', 'B', 'setupA', 'A', 'setupB', 'B',
    ];
    expect(order).toEqual([...phase, ...phase]);
  });
});
