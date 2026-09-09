import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DIAGNOSTICS, PROBE_NAMES, SENSITIVITY_FLOOR, SYNTHETIC_CONTROL, TRIPWIRE_PROBES,
  analyzeCampaign, main, outcomePatterns, renderMarkdown,
} from './analyze.mjs';

const temporaryDirectories: string[] = [];
const high = 0.5;
const low = 0.001;
const sample = Array.from({ length: 500 }, (_, index) => index / 100);
const entryNames = [
  ...PROBE_NAMES, SYNTHETIC_CONTROL, SENSITIVITY_FLOOR,
  DIAGNOSTICS[TRIPWIRE_PROBES[0]].aa, DIAGNOSTICS[TRIPWIRE_PROBES[0]].sham,
  DIAGNOSTICS[TRIPWIRE_PROBES[1]].aa, DIAGNOSTICS[TRIPWIRE_PROBES[1]].sham,
  DIAGNOSTICS[TRIPWIRE_PROBES[1]].control250, DIAGNOSTICS[TRIPWIRE_PROBES[1]].control1000,
];

function writeJson(file: string, value: unknown) {
  fs.writeFileSync(file, `${JSON.stringify(value)}\n`);
}

function result(pValue = high, medianDiffMs = 1) {
  return {
    aSamplesMs: sample, bSamplesMs: sample.map((value) => value + 1), differencesMs: sample.map(() => 1),
    pValue, z: 0, effectSize: 0, medianDiffMs, p95AMs: 4, p95BMs: 5,
  };
}

function measured(kind: string, pValue = high, medianDiffMs = 1, extra = {}) {
  return { kind, status: 'measured', result: result(pValue, medianDiffMs), ...extra };
}

function defaultEntries() {
  const entries: Record<string, any> = Object.fromEntries(PROBE_NAMES.map((name) => [name, measured('gated')]));
  entries[SYNTHETIC_CONTROL] = measured('control-synthetic', high, 1, {
    singleProbeFamily: 'reject', hardClause: 'pass', biasMicroseconds: 2,
    biasPlacement: 'per-call', batch: 64,
  });
  entries[SENSITIVITY_FLOOR] = {
    kind: 'sensitivity-floor', status: 'measured', floorMicroseconds: 8,
    magnitudes: [4, 8, 16, 32], results: [4, 8, 16, 32].map((microseconds) => ({
      microseconds, pValue: high, medianDiffMs: 1, singleProbeFamily: 'accept',
    })),
  };
  for (const probe of TRIPWIRE_PROBES) {
    entries[DIAGNOSTICS[probe].aa] = measured('twin-aa');
    entries[DIAGNOSTICS[probe].sham] = measured('twin-sham');
  }
  const real = DIAGNOSTICS['tripwire-real-click-match-vs-no-match'];
  entries[real.control250] = measured('control-real-click', high, 1, {
    biasMicroseconds: 250, biasPlacement: 'per-sample', singleProbeFamily: 'reject',
  });
  entries[real.control1000] = measured('control-real-click', high, 1, {
    biasMicroseconds: 1000, biasPlacement: 'per-sample', singleProbeFamily: 'reject',
  });
  return entries;
}

function setMeasured(entries: Record<string, any>, name: string, pValue: number, medianDiffMs = 1) {
  entries[name] = { ...entries[name], status: 'measured', result: result(pValue, medianDiffMs) };
}

function makeDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-p-campaign-test-'));
  temporaryDirectories.push(directory);
  writeJson(path.join(directory, 'campaign.json'), {
    schema: 'probe-p-campaign/1', candidate: 'candidate', runs: 20,
    labels: Array.from({ length: 20 }, (_, index) => `run-${String(index + 1).padStart(2, '0')}`),
    startedLabels: [],
  });
  return directory;
}

type Configure = (entries: Record<string, any>, index: number) => void;

function sidecar(entries: Record<string, any>) {
  return {
    schema: 'timing-2-probes/1', complete: true, startedAt: '2026-09-09T10:00:01Z',
    writtenAt: '2026-09-09T10:10:00Z', pairs: 500, warmup: 20, alpha: 0.01,
    family: { status: 'accept' },
    entries: entryNames.map((name, index) => ({ name, sequence: index + 1, ...entries[name] })),
  };
}

function addRun(directory: string, index: number, configure: Configure = () => undefined, options: any = {}) {
  const label = `run-${String(index).padStart(2, '0')}`;
  const runDirectory = path.join(directory, label);
  fs.mkdirSync(runDirectory);
  writeJson(path.join(runDirectory, 'started.json'), { run: options.recordedRun ?? label, startedAt: '2026-09-09T10:00:00Z' });
  if (options.ended !== false) writeJson(path.join(runDirectory, 'ended.json'), {});
  writeJson(path.join(runDirectory, 'exit.json'), { code: options.exitCode ?? 0, signal: null, durationMs: 1 });
  writeJson(path.join(runDirectory, 'host-state.json'), {
    git: { head: options.head ?? 'candidate', dirty: options.dirty ?? false, status: options.status ?? '' },
  });
  writeJson(path.join(runDirectory, 'competing.json'), {
    predicateEvidence: options.predicateEvidence ?? 'available',
    competing: options.excluded ? [{ pid: 7, command: 'vitest' }] : [], observed: [],
  });
  const report = { numFailedTests: 0, numTotalTests: 1, testResults: [] };
  for (const name of ['main.json', 'timing-1.json', 'timing-2.json']) writeJson(path.join(runDirectory, name), report);
  const entries = defaultEntries();
  configure(entries, index);
  writeJson(path.join(runDirectory, 'timing-2-probes.json'), sidecar(entries));
  const campaignFile = path.join(directory, 'campaign.json');
  const campaign = JSON.parse(fs.readFileSync(campaignFile, 'utf8'));
  campaign.startedLabels.push(label);
  writeJson(campaignFile, campaign);
}

function fixture(count: number, configure: Configure = () => undefined, options: any = {}) {
  const directory = makeDirectory();
  for (let index = 1; index <= count; index += 1) addRun(directory, index, configure, options[index] ?? {});
  return directory;
}

function mutateSidecar(directory: string, mutation: (value: any) => void) {
  const file = path.join(directory, 'run-01/timing-2-probes.json');
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  mutation(value);
  writeJson(file, value);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true });
});

describe('campaign accounting', () => {
  it('counts an excluded run as started but not valid', () => {
    expect(analyzeCampaign(fixture(15, undefined, { 1: { excluded: true } })).counts)
      .toEqual({ started: 15, excluded: 1, valid: 14 });
  });

  it('counts a started run without ended.json as started and invalid', () => {
    const report = analyzeCampaign(fixture(15, undefined, { 15: { ended: false } }));
    expect(report.counts).toEqual({ started: 15, excluded: 0, valid: 14 });
    expect(report.actualGateOutcomes.at(-1)?.invalidReasons).toContain('run-not-ended');
  });

  it('marks unavailable predicate evidence invalid, never excluded-as-clean', () => {
    const run = analyzeCampaign(fixture(1, undefined, { 1: { predicateEvidence: 'unavailable' } }))
      .actualGateOutcomes[0];
    expect(run).toMatchObject({ excluded: false, valid: false });
    expect(run.invalidReasons).toContain('predicate-evidence-unavailable');
  });

  it.each([
    ['candidate-head-mismatch', { head: 'changed' }],
    ['dirty-checkout-at-start', { dirty: true, status: ' M harness' }],
  ])('requires frozen clean host evidence: %s', (reason, options) => {
    const run = analyzeCampaign(fixture(1, undefined, { 1: options })).actualGateOutcomes[0];
    expect(run.invalidReasons).toContain(reason);
  });

  it('ignores and reports unexpected directories and validates the recorded run label', () => {
    const directory = fixture(1, undefined, { 1: { recordedRun: 'run-02' } });
    fs.mkdirSync(path.join(directory, 'run-99'));
    const report = analyzeCampaign(directory);
    expect(report.unexpectedDirectories).toEqual(['run-99']);
    expect(report.actualGateOutcomes[0].invalidReasons).toContain('started-run-label-mismatch');
  });

  it('refuses analysis when the started-label ledger points to deleted evidence', () => {
    const directory = fixture(1);
    fs.rmSync(path.join(directory, 'run-01'), { recursive: true });
    expect(() => analyzeCampaign(directory)).toThrow('campaign is unresumable: missing started run run-01');
  });
});

describe('strict rev 3.1 sidecar validation', () => {
  const cases: [string, string, (value: any) => void][] = [
    ['wrong schema', 'sidecar-invalid:schema', (value) => { value.schema = 'timing-2-probes/0'; }],
    ['incomplete', 'no-sidecar-for-this-run:incomplete', (value) => { value.complete = false; }],
    ['stale', 'no-sidecar-for-this-run:stale', (value) => { value.writtenAt = '2026-09-09T09:00:00Z'; }],
    ['root constants', 'sidecar-invalid:root-constants', (value) => { value.pairs = 499; }],
    ['non-array entries', 'sidecar-invalid:entries-not-array', (value) => { value.entries = {}; }],
    ['duplicate name', `sidecar-invalid:duplicate-entry:${PROBE_NAMES[0]}`, (value) => { value.entries[1].name = PROBE_NAMES[0]; }],
    ['alias or missing name', 'sidecar-invalid:entry-names', (value) => { value.entries[0].name = 'alias'; }],
    ['wrong kind', `sidecar-invalid:entry-kind:${PROBE_NAMES[0]}`, (value) => { value.entries[0].kind = 'twin-aa'; }],
    ['invalid status', `sidecar-invalid:entry-status:${PROBE_NAMES[0]}`, (value) => { value.entries[0].status = 'quiet'; }],
    ['missing error reason', `sidecar-invalid:entry-reason:${PROBE_NAMES[0]}`, (value) => {
      value.entries[0] = { name: PROBE_NAMES[0], kind: 'gated', status: 'error' };
    }],
    ['non-finite result', `sidecar-invalid:result-finite-numbers:${PROBE_NAMES[0]}`, (value) => { value.entries[0].result.pValue = null; }],
    ['wrong sample length', `sidecar-invalid:result-sample-length:${PROBE_NAMES[0]}`, (value) => { value.entries[0].result.aSamplesMs.pop(); }],
    ['invalid sensitivity floor', `sidecar-invalid:floor-magnitudes:${SENSITIVITY_FLOOR}`, (value) => { value.entries[7].magnitudes = [4, 8, 16, 31]; }],
    ['invalid sensitivity result', `sidecar-invalid:floor-results:${SENSITIVITY_FLOOR}`, (value) => { value.entries[7].results.pop(); }],
    ['invalid synthetic fields', `sidecar-invalid:synthetic-control-fields:${SYNTHETIC_CONTROL}`, (value) => { delete value.entries[6].hardClause; }],
    ['invalid real control fields', `sidecar-invalid:real-control-fields:${DIAGNOSTICS[TRIPWIRE_PROBES[1]].control250}`, (value) => { value.entries[12].biasMicroseconds = 251; }],
    ['invalid family status', 'sidecar-invalid:family-status', (value) => { value.family.status = 'quiet'; }],
    ['reject without details', 'sidecar-invalid:family-details', (value) => { value.family = { status: 'reject' }; }],
  ];

  it.each(cases)('invalidates %s with a precise reason', (_name, reason, mutation) => {
    const directory = fixture(1);
    mutateSidecar(directory, mutation);
    const run = analyzeCampaign(directory).actualGateOutcomes[0];
    expect(run.valid).toBe(false);
    expect(run.invalidReasons).toContain(reason);
  });

  it('accepts missing diagnostics as schema-valid and reports repeated incompleteness', () => {
    const directory = fixture(15, (entries, index) => {
      if (index <= 2) {
        entries[DIAGNOSTICS[TRIPWIRE_PROBES[0]].aa] = {
          ...entries[DIAGNOSTICS[TRIPWIRE_PROBES[0]].aa], status: 'missing', reason: 'fixture',
        };
        delete entries[DIAGNOSTICS[TRIPWIRE_PROBES[0]].aa].result;
      }
    });
    expect(analyzeCampaign(directory).outcome.primary).toBe('diagnostic-incompleteness');
  });
});

describe('exhaustive outcomes', () => {
  const branches: [string, number, Configure][] = [
    ['insufficient', 14, () => undefined],
    ['diagnostic-incompleteness', 15, (entries, index) => {
      if (index <= 2) {
        entries[DIAGNOSTICS[TRIPWIRE_PROBES[0]].aa].status = 'missing';
        entries[DIAGNOSTICS[TRIPWIRE_PROBES[0]].aa].reason = 'fixture';
        delete entries[DIAGNOSTICS[TRIPWIRE_PROBES[0]].aa].result;
      }
    }],
    ['calibration-concern', 15, (entries, index) => {
      if (index <= 2) setMeasured(entries, DIAGNOSTICS[TRIPWIRE_PROBES[0]].aa, low);
    }],
    ['harness-audit-then-security-investigation', 15, (entries, index) => {
      if (index <= 2) setMeasured(entries, TRIPWIRE_PROBES[0], low);
    }],
    ['mixed', 15, (entries, index) => {
      if (index <= 2) setMeasured(entries, TRIPWIRE_PROBES[0], low);
      if (index === 1) setMeasured(entries, DIAGNOSTICS[TRIPWIRE_PROBES[0]].aa, low);
    }],
    ['quiet', 15, () => undefined],
  ];

  it.each(branches)('writes report.md for the %s branch', (expected, count, configure) => {
    const directory = fixture(count, configure);
    main(['--dir', directory]);
    const report = JSON.parse(fs.readFileSync(path.join(directory, 'report.json'), 'utf8'));
    expect(report.outcome.primary).toBe(expected);
    expect(fs.readFileSync(path.join(directory, 'report.md'), 'utf8')).toContain(`Primary: ${expected}.`);
  });

  it('keeps insufficient primary when calibration also applies', () => {
    const directory = fixture(14, (entries, index) => {
      if (index <= 2) setMeasured(entries, DIAGNOSTICS[TRIPWIRE_PROBES[0]].aa, low);
    });
    const report = analyzeCampaign(directory);
    expect(report.outcome.primary).toBe('insufficient');
    expect(report.outcome.applicable).toContain('calibration-concern');
  });

  it('reports mixed for different probe outcomes and prints audit before amendment', () => {
    const directory = fixture(15, (entries, index) => {
      if (index <= 2) setMeasured(entries, TRIPWIRE_PROBES[0], low);
      if (index <= 2) setMeasured(entries, DIAGNOSTICS[TRIPWIRE_PROBES[1]].aa, low);
    });
    const report = analyzeCampaign(directory);
    expect(report.outcome.applicable).toEqual([
      'calibration-concern', 'harness-audit-then-security-investigation', 'mixed',
    ]);
    expect(report.outcome.proposalOrder.slice(0, 2)).toEqual([
      'harness-audit-then-security-investigation', 'calibration-concern',
    ]);
  });

  it('uses a 1,000 microsecond control failure alone as mixed', () => {
    const directory = fixture(15, (entries) => {
      entries[DIAGNOSTICS[TRIPWIRE_PROBES[1]].control1000].singleProbeFamily = 'accept';
    });
    expect(analyzeCampaign(directory).outcome.primary).toBe('mixed');
  });

  it('counts p exactly equal to 0.01/6 and rejects values above that boundary', () => {
    const atBoundary = fixture(15, (entries, index) => {
      if (index <= 2) setMeasured(entries, TRIPWIRE_PROBES[0], 0.01 / 6);
    });
    expect(analyzeCampaign(atBoundary).diagnosis.probes[0].k_AB).toBe(2);
    const above = fixture(15, (entries) => setMeasured(entries, TRIPWIRE_PROBES[0], 0.01 / 6 + Number.EPSILON));
    expect(analyzeCampaign(above).diagnosis.probes[0].k_AB).toBe(0);
  });

  it('counts zero medians for neither sign', () => {
    const diagnosis = analyzeCampaign(fixture(15, (entries) => setMeasured(entries, TRIPWIRE_PROBES[0], high, 0)))
      .diagnosis.probes[0];
    expect(diagnosis.signs).toEqual(Array(15).fill('0'));
    expect(diagnosis.majorityCount).toBe(0);
  });

  it('prints only count thresholds and no percentage threshold', () => {
    const markdown = renderMarkdown(analyzeCampaign(fixture(15)));
    expect(markdown).toContain('same sign in 15 of 15 (threshold ⌈0.8·15⌉ = 12)');
    expect(markdown).not.toMatch(/(?:threshold[^\n]*\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*%\s+of valid runs)/u);
  });

  it('always selects one primary and reaches every class across random summaries', () => {
    let seed = 17;
    const seen = new Set<string>();
    let mixedInputs = 0;
    const random = (limit: number) => { seed = (seed * 48271) % 2147483647; return seed % limit; };
    for (let index = 0; index < 5000; index += 1) {
      const V = random(21);
      const diagnoses = TRIPWIRE_PROBES.map((probe) => ({
        probe, k_AB: random(V + 1), k_AA: random(V + 1), k_sham: random(V + 1),
      }));
      if (new Set(diagnoses.map((item) => item.k_AA >= 2 || item.k_sham >= 2 ? 'calibration'
        : item.k_AB >= 2 && item.k_AA === 0 && item.k_sham === 0 ? 'audit'
          : item.k_AB >= 2 ? 'mixed' : 'quiet')).size > 1) mixedInputs += 1;
      const outcome = outcomePatterns({
        V, diagnoses, missingCounts: { one: random(V + 1) },
        controls: { microseconds250: random(V + 1), microseconds1000: random(V + 1), V },
      });
      outcome.applicable.forEach((name) => seen.add(name));
      expect(outcome.applicable.filter((name) => name === outcome.primary)).toHaveLength(1);
    }
    expect(seen).toEqual(new Set([
      'insufficient', 'diagnostic-incompleteness', 'calibration-concern',
      'harness-audit-then-security-investigation', 'mixed', 'quiet',
    ]));
    expect(mixedInputs).toBeGreaterThan(0);
  });
});
