import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DIAGNOSTICS, PROBE_NAMES, SYNTHETIC_CONTROL, TRIPWIRE_PROBES,
  analyzeCampaign, main, outcomePatterns, renderMarkdown,
} from './analyze.mjs';

const temporaryDirectories: string[] = [];
const high = 0.5;
const low = 0.001;

function writeJson(file: string, value: unknown) {
  fs.writeFileSync(file, `${JSON.stringify(value)}\n`);
}

function result(pValue = high, medianDiffMs = 1) {
  return {
    aSamplesMs: [1, 2, 3, 4], bSamplesMs: [2, 3, 4, 5], differencesMs: [1, 1, 1, 1],
    pValue, z: 0, effectSize: 0, medianDiffMs, p95AMs: 4, p95BMs: 5,
  };
}

function measured(pValue = high, extra = {}) {
  return { status: 'measured', result: result(pValue), ...extra };
}

function defaultEntries() {
  const entries = Object.fromEntries(PROBE_NAMES.map((name) => [name, measured(high, { kind: 'gated' })]));
  for (const probe of TRIPWIRE_PROBES) {
    entries[DIAGNOSTICS[probe].aa] = measured(high, { kind: 'twin-aa' });
    entries[DIAGNOSTICS[probe].sham] = measured(high, { kind: 'twin-sham' });
  }
  entries[SYNTHETIC_CONTROL] = measured(high, { kind: 'control-synthetic', singleProbeFamily: 'reject' });
  const real = DIAGNOSTICS['tripwire-real-click-match-vs-no-match'];
  entries[real.control250] = measured(high, { kind: 'control-real-click', singleProbeFamily: 'reject' });
  entries[real.control1000] = measured(high, { kind: 'control-real-click', singleProbeFamily: 'reject' });
  return entries;
}

function makeDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-p-campaign-test-'));
  temporaryDirectories.push(directory);
  writeJson(path.join(directory, 'campaign.json'), { schema: 'probe-p-campaign/1', runs: 20 });
  return directory;
}

type Configure = (entries: Record<string, any>, index: number) => void;

function addRun(directory: string, index: number, configure: Configure = () => undefined, options: any = {}) {
  const label = String(index).padStart(2, '0');
  const runDirectory = path.join(directory, `run-${label}`);
  fs.mkdirSync(runDirectory);
  writeJson(path.join(runDirectory, 'started.json'), { run: label, startedAt: '2026-09-09T10:00:00Z' });
  if (options.ended !== false) writeJson(path.join(runDirectory, 'ended.json'), {});
  writeJson(path.join(runDirectory, 'exit.json'), { code: options.exitCode ?? 0, signal: null, durationMs: 1 });
  writeJson(path.join(runDirectory, 'competing.json'), {
    competing: options.excluded ? [{ pid: 7, command: 'vitest' }] : [], observed: [],
  });
  const report = { numFailedTests: 0, numTotalTests: 1, testResults: [] };
  for (const name of ['main.json', 'timing-1.json', 'timing-2.json']) writeJson(path.join(runDirectory, name), report);
  const entries = defaultEntries();
  configure(entries, index);
  writeJson(path.join(runDirectory, 'timing-2-probes.json'), {
    schema: 'timing-2-probes/1', complete: true, startedAt: '2026-09-09T10:00:01Z',
    writtenAt: '2026-09-09T10:10:00Z', family: { status: 'accept' },
    entries: Object.entries(entries).map(([name, entry]) => ({ name, ...entry })),
  });
}

function fixture(count: number, configure: Configure = () => undefined, options: any = {}) {
  const directory = makeDirectory();
  for (let index = 1; index <= count; index += 1) addRun(directory, index, configure, options[index] ?? {});
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true });
});

describe('campaign accounting', () => {
  it('counts an excluded run as started but not valid', () => {
    const directory = fixture(15, undefined, { 1: { excluded: true } });
    expect(analyzeCampaign(directory).counts).toEqual({ started: 15, excluded: 1, valid: 14 });
  });

  it('counts a started run without ended.json as started and invalid', () => {
    const directory = fixture(15, undefined, { 15: { ended: false } });
    const report = analyzeCampaign(directory);
    expect(report.counts).toEqual({ started: 15, excluded: 0, valid: 14 });
    expect(report.actualGateOutcomes.at(-1)?.invalidReasons).toContain('run-not-ended');
  });

  it('rejects absent, incomplete, and stale sidecars as not belonging to the run', () => {
    const directory = fixture(3);
    fs.rmSync(path.join(directory, 'run-01/timing-2-probes.json'));
    const incompleteFile = path.join(directory, 'run-02/timing-2-probes.json');
    const incomplete = JSON.parse(fs.readFileSync(incompleteFile, 'utf8'));
    writeJson(incompleteFile, { ...incomplete, complete: false });
    const staleFile = path.join(directory, 'run-03/timing-2-probes.json');
    const stale = JSON.parse(fs.readFileSync(staleFile, 'utf8'));
    writeJson(staleFile, { ...stale, writtenAt: '2026-09-09T09:59:59Z' });
    const reasons = analyzeCampaign(directory).actualGateOutcomes.map((run) => run.invalidReasons[0]);
    expect(reasons).toEqual([
      'no-sidecar-for-this-run:absent',
      'no-sidecar-for-this-run:incomplete',
      'no-sidecar-for-this-run:stale',
    ]);
  });

  it('does not silently treat a missing predicate verdict as no competitors', () => {
    const directory = fixture(1);
    fs.rmSync(path.join(directory, 'run-01/competing.json'));
    const run = analyzeCampaign(directory).actualGateOutcomes[0];
    expect(run.valid).toBe(false);
    expect(run.invalidReasons).toContain('missing-competing-verdict');
  });
});

describe('exhaustive outcomes', () => {
  const branches: [string, number, Configure][] = [
    ['insufficient', 14, () => undefined],
    ['diagnostic-incompleteness', 15, (entries, index) => {
      if (index <= 2) entries[DIAGNOSTICS[TRIPWIRE_PROBES[0]].aa] = { status: 'missing', reason: 'fixture' };
    }],
    ['calibration-concern', 15, (entries, index) => {
      if (index <= 2) entries[DIAGNOSTICS[TRIPWIRE_PROBES[0]].aa] = measured(low);
    }],
    ['harness-audit-then-security-investigation', 15, (entries, index) => {
      if (index <= 2) entries[TRIPWIRE_PROBES[0]] = measured(low);
    }],
    ['mixed', 15, (entries, index) => {
      if (index <= 2) entries[TRIPWIRE_PROBES[0]] = measured(low);
      if (index === 1) entries[DIAGNOSTICS[TRIPWIRE_PROBES[0]].aa] = measured(low);
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

  it('makes V=14 insufficient even when calibration also applies', () => {
    const directory = fixture(14, (entries, index) => {
      if (index <= 2) entries[DIAGNOSTICS[TRIPWIRE_PROBES[0]].aa] = measured(low);
    });
    const report = analyzeCampaign(directory);
    expect(report.outcome.primary).toBe('insufficient');
    expect(report.outcome.applicable).toContain('calibration-concern');
  });

  it('reports mixed when the probes fall in different outcomes', () => {
    const directory = fixture(15, (entries, index) => {
      if (index <= 2) entries[TRIPWIRE_PROBES[0]] = measured(low);
      if (index <= 2) entries[DIAGNOSTICS[TRIPWIRE_PROBES[1]].aa] = measured(low);
    });
    expect(analyzeCampaign(directory).outcome.applicable).toEqual([
      'calibration-concern', 'harness-audit-then-security-investigation', 'mixed',
    ]);
  });

  it('never treats p-values between 0.01/6 and 0.01 as rejections', () => {
    const directory = fixture(15, (entries) => {
      entries[TRIPWIRE_PROBES[0]] = measured(0.005);
      entries[DIAGNOSTICS[TRIPWIRE_PROBES[0]].aa] = measured(0.005);
      entries[DIAGNOSTICS[TRIPWIRE_PROBES[0]].sham] = measured(0.005);
    });
    expect(analyzeCampaign(directory).outcome.primary).toBe('quiet');
  });

  it('reports integer counts with V rather than percentages', () => {
    const markdown = renderMarkdown(analyzeCampaign(fixture(15)));
    expect(markdown).toContain('k_AB=0, k_AA=0, k_sham=0; V=15');
    expect(markdown).toContain('250 us rejected 15 of V=15; 1,000 us rejected 15 of V=15');
  });

  it('always selects exactly one primary over random small summaries', () => {
    let seed = 17;
    const random = (limit: number) => { seed = (seed * 48271) % 2147483647; return seed % limit; };
    for (let index = 0; index < 500; index += 1) {
      const V = random(21);
      const diagnoses = TRIPWIRE_PROBES.map((probe) => ({
        probe, k_AB: random(V + 1), k_AA: random(V + 1), k_sham: random(V + 1),
      }));
      const outcome = outcomePatterns({
        V, diagnoses, missingCounts: { one: random(V + 1) },
        controls: { microseconds250: random(V + 1), microseconds1000: random(V + 1), V },
      });
      expect(typeof outcome.primary).toBe('string');
      expect(outcome.applicable.filter((name) => name === outcome.primary)).toHaveLength(1);
    }
  });
});
