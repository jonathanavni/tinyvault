import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DIAGNOSTICS, PROBE_NAMES, SENSITIVITY_FLOOR, SYNTHETIC_CONTROL, TRIPWIRE_PROBES,
  analyzeCampaign as analyzeCampaignStrict, main, outcomePatterns, renderMarkdown,
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

function familyRecord(entries: Record<string, any>, alpha = 0.01) {
  const ordered = PROBE_NAMES.map((name) => ({ name, pValue: entries[name].result.pValue }))
    .sort((a, b) => a.pValue - b.pValue)
    .map((entry, index) => ({
      ...entry, threshold: alpha / (PROBE_NAMES.length - index), rank: index + 1,
    }));
  const rejected = [];
  for (const entry of ordered) {
    if (entry.pValue > entry.threshold) break;
    rejected.push(entry);
  }
  return rejected.length === 0
    ? { status: 'accept' }
    : { status: 'reject', details: { alpha, rejected, ordered } };
}

function makeDirectory(runs = 20, synthetic = true) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-p-campaign-test-'));
  temporaryDirectories.push(directory);
  writeJson(path.join(directory, 'campaign.json'), {
    schema: 'probe-p-campaign/1', candidate: 'candidate', runs,
    labels: Array.from({ length: runs }, (_, index) => `run-${String(index + 1).padStart(2, '0')}`),
    startedLabels: [], synthetic,
  });
  return directory;
}

type Configure = (entries: Record<string, any>, index: number) => void;

function sidecar(entries: Record<string, any>) {
  return {
    schema: 'timing-2-probes/1', complete: true, startedAt: '2026-09-09T10:00:01Z',
    writtenAt: '2026-09-09T10:10:00Z', partitionDurationMs: 600_000, otherTests: 12,
    commit: null, node: 'v24.19.0', chromium: 'Chrome/140', pairs: 500, warmup: 20, alpha: 0.01,
    family: familyRecord(entries),
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
  const ownProcess = { pid: 99, ppid: 1, pcpu: 0, etimes: 1, command: '/bin/bash run.sh' };
  const competingProcess = { pid: 7, ppid: 1, pcpu: 2, etimes: 1, command: 'npx vitest run' };
  writeJson(path.join(runDirectory, 'host-state.json'), {
    processCapture: { status: options.processStatus ?? 'ok', exit: 0, bytes: 10 },
    processes: options.processes ?? (options.excluded ? [ownProcess, competingProcess] : [ownProcess]),
    load1: options.load1 ?? 1, cpus: options.cpus ?? 12,
    ownPid: 99, checkoutRoot: '/checkout',
    git: { head: options.head ?? 'candidate', dirty: options.dirty ?? false, status: options.status ?? '' },
  });
  writeJson(path.join(runDirectory, 'competing.json'), {
    ownPid: options.ownPid ?? 99, checkoutRoot: options.checkoutRoot ?? '/checkout',
    predicateEvidence: options.predicateEvidence ?? 'available',
    competing: options.recordedExcluded ?? options.excluded ? [competingProcess] : [],
    observed: [ownProcess],
  });
  const report = {
    numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, numPendingTests: 0, testResults: [],
  };
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

const analyzeCampaign = (directory: string) => analyzeCampaignStrict(directory, { allowPartial: true });

function mutateSidecar(directory: string, mutation: (value: any) => void) {
  const file = path.join(directory, 'run-01/timing-2-probes.json');
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  mutation(value);
  writeJson(file, value);
}

function mutatePartition(directory: string, mutation: (value: any) => void) {
  const file = path.join(directory, 'run-01/main.json');
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  mutation(value);
  writeJson(file, value);
}

function setRejectFamily(value: any) {
  value.entries[0].result.pValue = low;
  const ordered = value.entries.slice(0, PROBE_NAMES.length)
    .map((entry: any) => ({ name: entry.name, pValue: entry.result.pValue }))
    .sort((a: any, b: any) => a.pValue - b.pValue)
    .map((entry: any, index: number) => ({
      ...entry, threshold: value.alpha / (PROBE_NAMES.length - index), rank: index + 1,
    }));
  value.family = { status: 'reject', details: { alpha: value.alpha, rejected: ordered.slice(0, 1), ordered } };
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

  it('requires host-state evidence even when competing.json claims predicate availability', () => {
    const directory = fixture(1);
    fs.rmSync(path.join(directory, 'run-01/host-state.json'));
    const run = analyzeCampaign(directory).actualGateOutcomes[0];
    expect(run.valid).toBe(false);
    expect(run.invalidReasons).toContain('host-state-missing');
  });

  it('requires a successful non-empty process capture despite recorded predicate evidence', () => {
    const run = analyzeCampaign(fixture(1, undefined, { 1: { processStatus: 'failed' } }))
      .actualGateOutcomes[0];
    expect(run.valid).toBe(false);
    expect(run.invalidReasons).toContain('predicate-evidence-unavailable');
  });

  it('requires a non-empty captured process list', () => {
    const run = analyzeCampaign(fixture(1, undefined, { 1: { processes: [] } })).actualGateOutcomes[0];
    expect(run.valid).toBe(false);
    expect(run.invalidReasons).toContain('predicate-evidence-unavailable');
  });

  it('invalidates disagreement between the recorded and recomputed predicate verdicts', () => {
    const run = analyzeCampaign(fixture(1, undefined, { 1: { recordedExcluded: true } }))
      .actualGateOutcomes[0];
    expect(run.valid).toBe(false);
    expect(run.invalidReasons).toContain('predicate-verdict-mismatch');
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

  it('refuses a prefix of 15 started runs and writes no report', () => {
    const directory = fixture(15);
    expect(() => analyzeCampaignStrict(directory)).toThrow('analysis requires all 20 labels started');
    expect(() => main(['--dir', directory])).toThrow('analysis requires all 20 labels started');
    expect(fs.existsSync(path.join(directory, 'report.json'))).toBe(false);
    expect(fs.existsSync(path.join(directory, 'report.md'))).toBe(false);
  });

  it('analyzes 20 started runs with three interrupted runs as invalid', () => {
    const directory = fixture(20, undefined, {
      18: { ended: false }, 19: { ended: false }, 20: { ended: false },
    });
    const report = analyzeCampaignStrict(directory);
    expect(report.counts).toEqual({ started: 20, excluded: 0, valid: 17 });
    expect(report.actualGateOutcomes.slice(-3).every((run: any) =>
      run.invalidReasons.includes('run-not-ended'))).toBe(true);
  });

  it('refuses a two-run campaign unless it is a synthetic plan analyzed explicitly as partial', () => {
    const directory = makeDirectory(2, true);
    addRun(directory, 1);
    addRun(directory, 2);
    expect(() => analyzeCampaignStrict(directory)).toThrow('analysis requires a 20-run campaign');
    expect(analyzeCampaignStrict(directory, { allowPartial: true }).counts.started).toBe(2);
    const nonPlan = makeDirectory(2, false);
    addRun(nonPlan, 1);
    addRun(nonPlan, 2);
    expect(() => analyzeCampaignStrict(nonPlan, { allowPartial: true }))
      .toThrow('--allow-partial requires a synthetic --plan campaign');
  });

  it('reports refusal attempts as context rather than runs', () => {
    const directory = fixture(20);
    const refusals = path.join(directory, 'run-01/refusals');
    fs.mkdirSync(refusals);
    writeJson(path.join(refusals, '2026-09-09T10-00-00-000Z.json'), {
      refusedAt: '2026-09-09T10:00:00Z', reasons: ['checkout-dirty'],
    });
    const report = analyzeCampaignStrict(directory);
    expect(report.counts.started).toBe(20);
    expect(report.actualGateOutcomes[0].refusals)
      .toEqual({ count: 1, reasons: ['checkout-dirty'] });
  });

  it.each([
    ['null counters', (value: any) => { value.numPassedTests = null; }],
    ['missing counters', (value: any) => { delete value.numPendingTests; }],
    ['non-numeric counters', (value: any) => { value.numFailedTests = '0'; }],
    ['inconsistent totals', (value: any) => { value.numTotalTests = 2; }],
  ])('invalidates a partition report with %s', (_name, mutation) => {
    const directory = fixture(1);
    mutatePartition(directory, mutation);
    const run = analyzeCampaign(directory).actualGateOutcomes[0];
    expect(run.partitions.main).toMatchObject({ present: false, verdict: 'malformed' });
    expect(run.invalidReasons).toContain('partition-report-malformed:main');
  });

  it('invalidates a partition report that does not parse', () => {
    const directory = fixture(1);
    fs.writeFileSync(path.join(directory, 'run-01/main.json'), '{');
    const run = analyzeCampaign(directory).actualGateOutcomes[0];
    expect(run.partitions.main).toMatchObject({ present: false, verdict: 'malformed' });
    expect(run.invalidReasons).toContain('partition-report-malformed:main');
  });
});

describe('strict rev 3.1 sidecar validation', () => {
  const cases: [string, string, (value: any) => void][] = [
    ['wrong schema', 'sidecar-invalid:schema', (value) => { value.schema = 'timing-2-probes/0'; }],
    ['incomplete', 'no-sidecar-for-this-run:incomplete', (value) => { value.complete = false; }],
    ['stale', 'no-sidecar-for-this-run:stale', (value) => { value.writtenAt = '2026-09-09T09:00:00Z'; }],
    ['root constants', 'sidecar-invalid:root-constants', (value) => { value.pairs = 499; }],
    ['missing partition duration', 'sidecar-invalid:root-field:partitionDurationMs', (value) => { delete value.partitionDurationMs; }],
    ['missing chromium', 'sidecar-invalid:root-field:chromium', (value) => { delete value.chromium; }],
    ['non-array entries', 'sidecar-invalid:entries-not-array', (value) => { value.entries = {}; }],
    ['duplicate name', `sidecar-invalid:duplicate-entry:${PROBE_NAMES[0]}`, (value) => { value.entries[1].name = PROBE_NAMES[0]; }],
    ['alias or missing name', 'sidecar-invalid:entry-names', (value) => { value.entries[0].name = 'alias'; }],
    ['wrong kind', `sidecar-invalid:entry-kind:${PROBE_NAMES[0]}`, (value) => { value.entries[0].kind = 'twin-aa'; }],
    ['invalid status', `sidecar-invalid:entry-status:${PROBE_NAMES[0]}`, (value) => { value.entries[0].status = 'quiet'; }],
    ['missing error reason', `sidecar-invalid:entry-reason:${PROBE_NAMES[0]}`, (value) => {
      value.entries[0] = { name: PROBE_NAMES[0], kind: 'gated', status: 'error' };
    }],
    ['missing sequence', `sidecar-invalid:entry-sequence:${PROBE_NAMES[0]}`, (value) => { delete value.entries[0].sequence; }],
    ['null sequence on measured entry', `sidecar-invalid:entry-sequence:${PROBE_NAMES[0]}`, (value) => { value.entries[0].sequence = null; }],
    ['negative p-value', `sidecar-invalid:result-p-value:${PROBE_NAMES[0]}`, (value) => { value.entries[0].result.pValue = -0.1; }],
    ['p-value above one', `sidecar-invalid:result-p-value:${PROBE_NAMES[0]}`, (value) => { value.entries[0].result.pValue = 1.5; }],
    ['non-finite result', `sidecar-invalid:result-finite-numbers:${PROBE_NAMES[0]}`, (value) => { value.entries[0].result.pValue = null; }],
    ['wrong sample length', `sidecar-invalid:result-sample-length:${PROBE_NAMES[0]}`, (value) => { value.entries[0].result.aSamplesMs.pop(); }],
    ['invalid sensitivity floor', `sidecar-invalid:floor-magnitudes:${SENSITIVITY_FLOOR}`, (value) => { value.entries[7].magnitudes = [4, 8, 16, 31]; }],
    ['invalid sensitivity result', `sidecar-invalid:floor-results:${SENSITIVITY_FLOOR}`, (value) => { value.entries[7].results.pop(); }],
    ['invalid synthetic fields', `sidecar-invalid:synthetic-control-fields:${SYNTHETIC_CONTROL}`, (value) => { delete value.entries[6].hardClause; }],
    ['invalid real control fields', `sidecar-invalid:real-control-fields:${DIAGNOSTICS[TRIPWIRE_PROBES[1]].control250}`, (value) => { value.entries[12].biasMicroseconds = 251; }],
    ['invalid family status', 'sidecar-invalid:family-status', (value) => { value.family.status = 'quiet'; }],
    ['reject without details', 'sidecar-invalid:family-details', (value) => { value.family = { status: 'reject' }; }],
    ['array family details', 'sidecar-invalid:family-details', (value) => { value.family = { status: 'reject', details: [] }; }],
    ['empty family details', 'sidecar-invalid:family-details-alpha', (value) => { value.family = { status: 'reject', details: {} }; }],
    ['non-gated rejected name', 'sidecar-invalid:family-details-ranked-name', (value) => {
      value.family = { status: 'reject', details: {
        alpha: 0.01,
        rejected: [{ name: 'not-gated', pValue: 0.001, threshold: 0.001, rank: 1 }],
        ordered: [{ name: 'not-gated', pValue: 0.001, threshold: 0.001, rank: 1 }],
      } };
    }],
    ['zero rank', 'sidecar-invalid:family-details-ranked-rank', (value) => {
      value.family = { status: 'reject', details: {
        alpha: 0.01,
        rejected: [{ name: PROBE_NAMES[0], pValue: 0.001, threshold: 0.001, rank: 0 }],
        ordered: [{ name: PROBE_NAMES[0], pValue: 0.001, threshold: 0.001, rank: 0 }],
      } };
    }],
    ['reject with no rejected entries', 'sidecar-invalid:family-details-rejected-empty', (value) => {
      setRejectFamily(value);
      value.family.details.rejected = [];
    }],
    ['reject with only five ordered names', 'sidecar-invalid:family-details-ordered-names', (value) => {
      setRejectFamily(value);
      value.family.details.ordered.pop();
    }],
    ['reject with a duplicate ordered name', 'sidecar-invalid:family-details-ordered-names', (value) => {
      setRejectFamily(value);
      value.family.details.ordered[5].name = value.family.details.ordered[4].name;
    }],
    ['reject with a wrong ordered rank', 'sidecar-invalid:family-details-ordered-rank', (value) => {
      setRejectFamily(value);
      value.family.details.ordered[1].rank = 3;
    }],
    ['reject with a wrong ordered threshold', 'sidecar-invalid:family-details-ordered-threshold', (value) => {
      setRejectFamily(value);
      value.family.details.ordered[1].threshold += 2e-12;
    }],
    ['reject with decreasing ordered p-values', 'sidecar-invalid:family-details-ordered-p-values', (value) => {
      setRejectFamily(value);
      const [first, second] = value.family.details.ordered;
      first.pValue = 0.4;
      second.pValue = 0.3;
      value.family.details.rejected[0].pValue = 0.4;
      value.entries.find((entry: any) => entry.name === first.name).result.pValue = 0.4;
      value.entries.find((entry: any) => entry.name === second.name).result.pValue = 0.3;
    }],
    ['reject whose rejected list is not a prefix', 'sidecar-invalid:family-details-rejected-prefix', (value) => {
      setRejectFamily(value);
      value.family.details.rejected = [value.family.details.ordered[1]];
    }],
    ['accept inconsistent with measured p-values', 'sidecar-invalid:family-verdict-mismatch', (value) => {
      value.entries[0].result.pValue = low;
    }],
    ['reject details disagree with measured entries', 'sidecar-invalid:family-details-p-value-mismatch', (value) => {
      setRejectFamily(value);
      value.family.details.rejected[0].pValue = 0.0015;
      value.family.details.ordered[0].pValue = 0.0015;
    }],
    ['reject inconsistent with measured p-values', 'sidecar-invalid:family-verdict-mismatch', (value) => {
      setRejectFamily(value);
      value.entries[0].result.pValue = high;
      value.family.details.rejected[0].pValue = high;
      value.family.details.ordered[0].pValue = high;
    }],
    ['not-evaluated without reason', 'sidecar-invalid:family-reason', (value) => {
      value.family = { status: 'not-evaluated' };
    }],
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

  it('accepts a null sequence only for a missing entry', () => {
    const directory = fixture(1);
    mutateSidecar(directory, (value) => {
      const entry = value.entries.find((item: any) => item.name === DIAGNOSTICS[TRIPWIRE_PROBES[0]].aa);
      entry.status = 'missing';
      entry.reason = 'fixture';
      entry.sequence = null;
      delete entry.result;
    });
    expect(analyzeCampaign(directory).actualGateOutcomes[0].valid).toBe(true);
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
    main(['--dir', directory, '--allow-partial']);
    const report = JSON.parse(fs.readFileSync(path.join(directory, 'report.json'), 'utf8'));
    expect(report.outcome.primary).toBe(expected);
    expect(fs.readFileSync(path.join(directory, 'report.md'), 'utf8')).toContain(`Primary: ${expected}.`);
  });

  it('regenerates report.md for a full 20-run quiet campaign', () => {
    const directory = fixture(20);
    main(['--dir', directory]);
    const markdown = fs.readFileSync(path.join(directory, 'report.md'), 'utf8');
    expect(markdown).toContain('Counts: started=20, excluded=0, valid V=20.');
    expect(markdown).toContain('## Outcome\n\nPrimary: quiet.');
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

  it('prints load1 divided by cpus per run as non-gating context', () => {
    const report = analyzeCampaign(fixture(1, undefined, { 1: { load1: 12.5, cpus: 8 } }));
    expect(report.actualGateOutcomes[0]).toMatchObject({ excluded: false, load1: 12.5, cpus: 8 });
    const markdown = renderMarkdown(report);
    expect(markdown).toContain('| load1 / cpus |');
    expect(markdown).toContain('| 12.5 / 8 |');
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
