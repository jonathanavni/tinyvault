import { describe, expect, it } from 'vitest';

import { secretTransforms } from '../../testbed/checkers/leakScan';
import { TripwireRun, type SealedTripwireBatch } from '../supervisor/tripwireSeam';
import {
  SECRET_TRANSFORM_NAMES,
  TRIPWIRE_INSPECTION_REFUSED_MESSAGE,
  detectTripwire,
  detectTripwireWithTransforms,
  type SecretTransformName,
  type TripwireEvidence,
} from './tripwire';

const canary = 'TVC_~~~';

// Independently pinned: Ruby bit-string base32 plus system encoders, never the detector under test.
const expectedVectors: Readonly<Record<SecretTransformName, string>> = {
  raw: 'TVC_~~~',
  base64: 'VFZDX35+fg==',
  'base64url-unpadded': 'VFZDX35-fg',
  base32: 'KRLEGX36PZ7A',
  hex: '5456435f7e7e7e',
  percent: '%54%56%43%5F%7E%7E%7E',
  'json-escape': '\\u0054\\u0056\\u0043\\u005f\\u007e\\u007e\\u007e',
  reversed: '~~~_CVT',
  'whitespace-split': 'T V C _ ~ ~ ~',
};

function trusted(bytes: string): TripwireEvidence {
  return { provenance: 'trusted', bytes };
}

describe('pure transform-aware tripwire detector', () => {
  it('catches canonical-inventory drift against independently pinned vectors and the checker', () => {
    expect(SECRET_TRANSFORM_NAMES).toEqual(Object.keys(expectedVectors));
    expect(Object.fromEntries(secretTransforms(canary).map(({ name, value }) => [name, value])))
      .toEqual(expectedVectors);
  });

  it.each(SECRET_TRANSFORM_NAMES)(
    'catches exact protection mutation deleting the %s transform',
    (name) => {
      const enabled = new Set<SecretTransformName>(
        SECRET_TRANSFORM_NAMES.filter((candidate) => candidate !== name),
      );
      expect(detectTripwire([trusted(expectedVectors[name])], canary).verdict).toBe('fail');
      expect(detectTripwireWithTransforms([trusted(expectedVectors[name])], canary, enabled).verdict)
        .toBe('pass');
    },
  );

  it('catches mutation that misses selective/lowercase percent or selective/uppercase JSON escapes', () => {
    const variants = [
      'TVC%5f~~~',
      '%54%56%43%5f%7e%7e%7e',
      'TVC\\u005F~~~',
      '\\u0054\\u0056\\u0043\\u005F\\u007E\\u007E\\u007E',
    ];
    for (const bytes of variants) expect(detectTripwire([trusted(bytes)], canary).verdict).toBe('fail');
  });

  it('catches mutation that scans mixed provenance or reads its bytes before refusal', () => {
    const mixed = {
      provenance: 'mixed' as const,
      get bytes(): string { throw new Error('bytes were inspected'); },
    };
    expect(() => detectTripwire([mixed], canary)).toThrow(TRIPWIRE_INSPECTION_REFUSED_MESSAGE);
    const run = new TripwireRun(canary);
    expect(() => run.mint([mixed])).toThrow(TRIPWIRE_INSPECTION_REFUSED_MESSAGE);
  });

  it('catches false-positive mutations and fragment reassembly that belongs only to the checker', () => {
    expect(detectTripwire([trusted('ordinary caller-visible text')], canary)).toEqual({
      verdict: 'pass',
      diagnostics: { matched: false, transform: null, evidenceIndex: null },
    });
    expect(detectTripwire([trusted('TVC_'), trusted('~~~')], canary).verdict).toBe('pass');
    expect(detectTripwire([trusted('VFZDX35-fg=')], canary).verdict).toBe('pass');
  });
});

describe('module-private sealed-batch attestation', () => {
  it('catches mutation that puts sealed payload on the token or changes fixed diagnostic shape', () => {
    const run = new TripwireRun(canary);
    const batch = run.mint([trusted(expectedVectors.hex)]);
    expect(Reflect.ownKeys(batch)).toEqual([]);
    expect(JSON.stringify(batch)).toBe('{}');
    const result = run.adjudicate(batch);
    expect(Reflect.ownKeys(result)).toEqual(['verdict', 'diagnostics']);
    expect(Reflect.ownKeys(result.diagnostics)).toEqual(['matched', 'transform', 'evidenceIndex']);
    expect(JSON.stringify(result)).toBe(
      '{"verdict":"fail","diagnostics":{"matched":true,"transform":"hex","evidenceIndex":0}}',
    );
  });

  it('catches runtime attestation mutation accepting plain, laundered, cloned, or serialized batches', () => {
    const run = new TripwireRun(canary);
    const real = run.mint([trusted('safe')]);
    const candidates: unknown[] = [
      {},
      { ...real },
      JSON.parse(JSON.stringify(real)),
    ];
    for (const candidate of candidates) {
      expect(() => run.adjudicate(candidate as SealedTripwireBatch))
        .toThrow('Invalid, stale, or already-used sealed batch');
      expect(() => run.adjudicate(candidate as unknown as SealedTripwireBatch))
        .toThrow('Invalid, stale, or already-used sealed batch');
    }
    expect(run.adjudicate(real).verdict).toBe('pass');
  });

  it('catches mutation accepting cross-run, replayed, or stale batches', () => {
    const runA = new TripwireRun(canary);
    const runB = new TripwireRun(canary);
    const crossRun = runA.mint([trusted('safe')]);
    expect(() => runB.adjudicate(crossRun)).toThrow('Invalid, stale, or already-used sealed batch');
    expect(runA.adjudicate(crossRun).verdict).toBe('pass');
    expect(() => runA.adjudicate(crossRun)).toThrow('Invalid, stale, or already-used sealed batch');

    const stale = runA.mint([trusted('safe')]);
    runA.close();
    runA.close();
    expect(() => runA.adjudicate(stale)).toThrow('Invalid, stale, or already-used sealed batch');
    expect(() => runA.mint([trusted('safe')])).toThrow('Invalid, stale, or already-used sealed batch');
  });

  it('states the structural seam claim without claiming universal TypeScript uncallability', () => {
    // Under the checked production graph, data-plane modules have no path to this evaluator/mint authority;
    // runtime attestation rejects forged/stale/cross-run/replayed tokens. Types alone do not make the seam
    // universally uncallable, and hostile code already executing in the trusted host is outside scope.
    const run = new TripwireRun(canary);
    expect(run.adjudicate(run.mint([trusted('safe')])).verdict).toBe('pass');
  });
});
