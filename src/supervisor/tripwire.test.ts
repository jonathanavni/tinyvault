import { describe, expect, it } from 'vitest';

import { secretTransforms } from '../shared/secretTransforms';
import {
  TripwireRun,
  INVALID_SEALED_BATCH_MESSAGE,
  SECRET_TRANSFORM_NAMES,
  TRIPWIRE_INSPECTION_REFUSED_MESSAGE,
  detectTripwire,
  detectTripwireWithTransforms,
  type SealedTripwireBatch,
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

function trusted(run: TripwireRun, bytes: string): TripwireEvidence {
  return run.captureTrusted(bytes);
}

function detect(run: TripwireRun, evidence: readonly TripwireEvidence[]) {
  return detectTripwire(run, evidence, canary);
}

describe('supervisor transform-aware tripwire detector', () => {
  it('catches canonical-inventory drift against independently pinned vectors and the checker', () => {
    expect(SECRET_TRANSFORM_NAMES).toEqual(Object.keys(expectedVectors));
    expect(Object.fromEntries(secretTransforms(canary).map(({ name, value }) => [name, value])))
      .toEqual(expectedVectors);
  });

  it.each(SECRET_TRANSFORM_NAMES)(
    'catches exact protection mutation deleting the %s transform',
    (name) => {
      const run = new TripwireRun(canary);
      const evidence = [trusted(run, expectedVectors[name])];
      const enabled = new Set<SecretTransformName>(
        SECRET_TRANSFORM_NAMES.filter((candidate) => candidate !== name),
      );
      expect(detectTripwire(run, evidence, canary).verdict).toBe('fail');
      expect(detectTripwireWithTransforms(
        run,
        [trusted(run, expectedVectors[name])],
        canary,
        enabled,
      ).verdict).toBe('pass');
    },
  );

  it('catches mutation that misses selective/lowercase percent or selective/uppercase JSON escapes', () => {
    const run = new TripwireRun(canary);
    const variants = [
      'TVC%5f~~~',
      '%54%56%43%5f%7e%7e%7e',
      'TVC\\u005F~~~',
      '\\u0054\\u0056\\u0043\\u005F\\u007E\\u007E\\u007E',
    ];
    for (const bytes of variants) expect(detect(run, [trusted(run, bytes)]).verdict).toBe('fail');
  });

  it('catches exact direct provenance-getter mutation that scans caller-constructed evidence', () => {
    const run = new TripwireRun(canary);
    let propertyReads = 0;
    const forged = Object.defineProperties({}, {
      provenance: { get: () => { propertyReads += 1; return 'trusted'; } },
      bytes: { get: () => { propertyReads += 1; return canary; } },
    }) as TripwireEvidence;
    expect(() => detectTripwire(run, [forged], canary)).toThrow(TRIPWIRE_INSPECTION_REFUSED_MESSAGE);
    expect(() => run.mint([forged])).toThrow(TRIPWIRE_INSPECTION_REFUSED_MESSAGE);
    expect(propertyReads).toBe(0);
  });

  it('catches exact proxy-evidence mutation without invoking caller traps', () => {
    const run = new TripwireRun(canary);
    let traps = 0;
    const forged = new Proxy({}, {
      get() { traps += 1; return canary; },
      ownKeys() { traps += 1; return ['provenance', 'bytes']; },
    }) as TripwireEvidence;
    expect(() => detectTripwire(run, [forged], canary))
      .toThrow(TRIPWIRE_INSPECTION_REFUSED_MESSAGE);
    expect(() => run.mint([forged])).toThrow(TRIPWIRE_INSPECTION_REFUSED_MESSAGE);
    expect(traps).toBe(0);
  });

  it('catches exact cross-record provenance relabel mutation before sealing or scanning bytes', () => {
    const run = new TripwireRun(canary);
    let secondProvenance = 'mixed';
    const first = Object.defineProperty({}, 'provenance', {
      get: () => { secondProvenance = 'trusted'; return 'trusted'; },
    }) as TripwireEvidence;
    const second = Object.defineProperties({}, {
      provenance: { get: () => secondProvenance },
      bytes: { get: () => canary },
    }) as TripwireEvidence;
    expect(() => run.mint([first, second])).toThrow(TRIPWIRE_INSPECTION_REFUSED_MESSAGE);
    expect(secondProvenance).toBe('mixed');
  });

  it('catches mutation that inspects mixed-provenance bytes instead of refusing the owned snapshot', () => {
    const run = new TripwireRun(canary);
    expect(() => detect(run, [run.captureMixed(canary)]))
      .toThrow(TRIPWIRE_INSPECTION_REFUSED_MESSAGE);
    expect(() => run.mint([run.captureMixed(canary)]))
      .toThrow(TRIPWIRE_INSPECTION_REFUSED_MESSAGE);
  });

  it('catches false-positive mutations and fragment reassembly that belongs only to the checker', () => {
    const run = new TripwireRun(canary);
    expect(detect(run, [trusted(run, 'ordinary caller-visible text')])).toEqual({
      verdict: 'pass',
      diagnostics: { matched: false, transform: null, evidenceIndex: null },
    });
    expect(detect(run, [trusted(run, 'TVC_'), trusted(run, '~~~')]).verdict).toBe('pass');
    expect(detect(run, [trusted(run, 'VFZDX35-fg=')]).verdict).toBe('pass');
  });
});

describe('module-private sealed-batch attestation', () => {
  it('catches mutation that puts evidence bytes or provenance on capture and batch tokens', () => {
    const run = new TripwireRun(canary);
    const evidence = trusted(run, expectedVectors.hex);
    const batch = run.mint([evidence]);
    expect(Reflect.ownKeys(evidence)).toEqual([]);
    expect(Reflect.ownKeys(batch)).toEqual([]);
    expect(JSON.stringify(evidence)).toBe('{}');
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
    const real = run.mint([trusted(run, 'safe')]);
    const candidates: unknown[] = [
      {},
      { ...real },
      structuredClone(real),
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

  it('catches mutation accepting cross-run evidence, batches, replayed batches, or stale batches', () => {
    const runA = new TripwireRun(canary);
    const runB = new TripwireRun(canary);
    expect(() => runB.mint([trusted(runA, 'safe')])).toThrow(TRIPWIRE_INSPECTION_REFUSED_MESSAGE);
    const crossRun = runA.mint([trusted(runA, 'safe')]);
    expect(() => runB.adjudicate(crossRun)).toThrow('Invalid, stale, or already-used sealed batch');
    expect(runA.adjudicate(crossRun).verdict).toBe('pass');
    expect(() => runA.adjudicate(crossRun)).toThrow('Invalid, stale, or already-used sealed batch');

    const stale = runA.mint([trusted(runA, 'safe')]);
    runA.close();
    runA.close();
    expect(() => runA.adjudicate(stale)).toThrow('Invalid, stale, or already-used sealed batch');
    expect(() => runA.mint([trusted(runB, 'safe')])).toThrow('Invalid, stale, or already-used sealed batch');
  });

  it('consumes evidence on direct detection and sealing so evidence cannot replay', () => {
    const run = new TripwireRun(canary);
    const directlyDetected = trusted(run, canary);
    expect(detectTripwire(run, [directlyDetected], canary).verdict).toBe('fail');
    expect(() => detectTripwire(run, [directlyDetected], canary))
      .toThrow(TRIPWIRE_INSPECTION_REFUSED_MESSAGE);

    const sealed = trusted(run, 'safe');
    const batch = run.mint([sealed]);
    expect(() => run.mint([sealed])).toThrow(TRIPWIRE_INSPECTION_REFUSED_MESSAGE);
    expect(run.adjudicate(batch).verdict).toBe('pass');
  });

  it('revokes evidence and sealed batches when close finalizes the run', () => {
    const run = new TripwireRun(canary);
    const evidence = trusted(run, canary);
    const staleBatch = run.mint([trusted(run, 'safe')]);

    run.close();
    run.close();

    expect(() => detectTripwire(run, [evidence], canary))
      .toThrow(TRIPWIRE_INSPECTION_REFUSED_MESSAGE);
    expect(() => run.adjudicate(staleBatch)).toThrow(INVALID_SEALED_BATCH_MESSAGE);
    expect(() => run.captureTrusted('late')).toThrow(INVALID_SEALED_BATCH_MESSAGE);
    expect(() => run.captureMixed('late')).toThrow(INVALID_SEALED_BATCH_MESSAGE);
  });

  it('states the structural seam claim without claiming universal TypeScript uncallability', () => {
    // Under the checked production graph, data-plane modules have no path to this evaluator/mint authority;
    // runtime attestation rejects forged/stale/cross-run/replayed tokens. Types alone do not make the seam
    // universally uncallable, and hostile code already executing in the trusted host is outside scope.
    const run = new TripwireRun(canary);
    expect(run.adjudicate(run.mint([trusted(run, 'safe')])).verdict).toBe('pass');
  });
});
