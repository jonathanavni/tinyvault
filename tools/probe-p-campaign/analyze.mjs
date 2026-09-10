#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { competingJobs } from './predicate.mjs';

const MODULE_FILE = decodeURIComponent(new URL(import.meta.url).pathname);

export const PROBE_NAMES = [
  'fill-short-vs-long',
  'queued-short-vs-long',
  'reflection-equal-length',
  'tripwire-match-vs-no-match',
  'tripwire-real-click-match-vs-no-match',
  'real-listener-click',
];
export const TRIPWIRE_PROBES = [
  'tripwire-match-vs-no-match',
  'tripwire-real-click-match-vs-no-match',
];
export const SYNTHETIC_CONTROL = 'tripwire-batched-injected-bias-control';
export const SENSITIVITY_FLOOR = 'sensitivity-floor';
export const DIAGNOSTICS = Object.freeze({
  'tripwire-match-vs-no-match': {
    aa: 'tripwire-match-vs-no-match-aa',
    sham: 'tripwire-match-vs-no-match-sham',
  },
  'tripwire-real-click-match-vs-no-match': {
    aa: 'tripwire-real-click-match-vs-no-match-aa',
    sham: 'tripwire-real-click-match-vs-no-match-sham',
    control250: 'tripwire-real-click-bias-250us',
    control1000: 'tripwire-real-click-bias-1000us',
  },
});
const BAR = 0.01 / 6;
const EXPECTED_ENTRIES = Object.freeze([
  ...PROBE_NAMES.map((name) => [name, 'gated']),
  [SYNTHETIC_CONTROL, 'control-synthetic'],
  [SENSITIVITY_FLOOR, 'sensitivity-floor'],
  ['tripwire-match-vs-no-match-aa', 'twin-aa'],
  ['tripwire-match-vs-no-match-sham', 'twin-sham'],
  ['tripwire-real-click-match-vs-no-match-aa', 'twin-aa'],
  ['tripwire-real-click-match-vs-no-match-sham', 'twin-sham'],
  ['tripwire-real-click-bias-250us', 'control-real-click'],
  ['tripwire-real-click-bias-1000us', 'control-real-click'],
]);
const RESULT_NUMBERS = ['pValue', 'z', 'effectSize', 'medianDiffMs', 'p95AMs', 'p95BMs'];
const RESULT_ARRAYS = ['aSamplesMs', 'bSamplesMs', 'differencesMs'];
const FAMILY_VALUES = new Set(['accept', 'reject', 'not-evaluated']);
const SINGLE_FAMILY_VALUES = new Set(['accept', 'reject']);

const PROPOSALS = Object.freeze({
  insufficient: 'Inconclusive. No inference about calibration.',
  'diagnostic-incompleteness': 'Inconclusive for the affected probe; the incompleteness itself is the finding (a harness defect to fix before re-running a *new* campaign, which would need new authorization).',
  'calibration-concern': 'Proposal: a D10 amendment packet changing the *statistic* for the affected probe(s) to one that respects the measured dependence (block permutation on the interleaved pairs with the block length derived from the retained series, or a declared false-rejection rate measured rather than assumed), keeping α, pairs and the hard clause.',
  'harness-audit-then-security-investigation': 'Proposal: first an Astra audit of the probe construction in the timing file (host accumulation, setup asymmetry, warm-up order, the stationarity diagnostic); if the audit clears the harness, an Astra investigation of the tripwire path in `src/supervisor`.',
  mixed: 'Inconclusive; the pattern is reported in full; it is **not** evidence that the statistic is calibrated.',
  quiet: 'Inconclusive; the gate and the 2026-09-08 deferral stand; the historical reds remain unresolved. **A quiet campaign does not prove the absence of a timing channel, does not reclassify any historical red, and adopts no convention.**',
});
const OUTCOME_ORDER = [
  'insufficient', 'diagnostic-incompleteness', 'calibration-concern',
  'harness-audit-then-security-investigation', 'mixed', 'quiet',
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function optionalJson(file) {
  try { return readJson(file); } catch { return null; }
}

function partition(runDirectory, name) {
  const file = path.join(runDirectory, name);
  if (!fs.existsSync(file)) {
    return { present: false, numFailedTests: null, numTotalTests: null, verdict: 'missing' };
  }
  let value;
  try { value = readJson(file); } catch {
    return { present: false, numFailedTests: null, numTotalTests: null, verdict: 'malformed' };
  }
  const counters = ['numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests']
    .map((counter) => value?.[counter]);
  const usable = counters.every((counter) => Number.isInteger(counter) && counter >= 0)
    && value.numTotalTests === value.numPassedTests + value.numFailedTests + value.numPendingTests;
  if (!usable) {
    return { present: false, numFailedTests: null, numTotalTests: null, verdict: 'malformed' };
  }
  return {
    present: true, numFailedTests: value.numFailedTests, numTotalTests: value.numTotalTests,
    verdict: value.numFailedTests === 0 ? 'pass' : 'fail',
  };
}

function resultOf(entry) {
  return entry?.result ?? entry?.probe ?? entry?.measurement ?? null;
}

function singleFamily(entry) {
  const value = entry?.singleProbeFamily ?? null;
  return typeof value === 'string' ? value : value?.verdict ?? value?.status ?? null;
}

function familyVerdict(sidecar) {
  const family = sidecar?.family ?? null;
  if (!family) return { verdict: 'missing', details: [] };
  if (typeof family === 'string') return { verdict: family, details: [] };
  return { verdict: family.status ?? 'missing', details: family.details ?? [], reason: family.reason ?? null };
}

function finiteArray(value, length) {
  return Array.isArray(value) && value.length === length && value.every(Number.isFinite);
}

function resultViolation(entry) {
  const result = entry?.result;
  if (!result || RESULT_NUMBERS.some((name) => !Number.isFinite(result[name]))) return 'result-finite-numbers';
  if (result.pValue < 0 || result.pValue > 1) return 'result-p-value';
  if (RESULT_ARRAYS.some((name) => !finiteArray(result[name], 500))) return 'result-sample-length';
  return null;
}

function floorViolation(entry) {
  if (!(entry.floorMicroseconds === null || Number.isFinite(entry.floorMicroseconds))) return 'floor-microseconds';
  if (JSON.stringify(entry.magnitudes) !== JSON.stringify([4, 8, 16, 32])) return 'floor-magnitudes';
  if (!Array.isArray(entry.results) || entry.results.length !== 4) return 'floor-results';
  for (let index = 0; index < 4; index += 1) {
    const result = entry.results[index];
    if (result?.microseconds !== entry.magnitudes[index] || !Number.isFinite(result?.pValue)
      || !Number.isFinite(result?.medianDiffMs) || !SINGLE_FAMILY_VALUES.has(result?.singleProbeFamily)) {
      return 'floor-results';
    }
  }
  return null;
}

function specialEntryViolation(entry) {
  if (entry.name === SYNTHETIC_CONTROL
    && (!SINGLE_FAMILY_VALUES.has(entry.singleProbeFamily) || !['pass', 'fail'].includes(entry.hardClause)
      || entry.biasMicroseconds !== 2 || entry.biasPlacement !== 'per-call' || entry.batch !== 64)) {
    return 'synthetic-control-fields';
  }
  const realBias = entry.name === DIAGNOSTICS['tripwire-real-click-match-vs-no-match'].control250 ? 250
    : entry.name === DIAGNOSTICS['tripwire-real-click-match-vs-no-match'].control1000 ? 1000 : null;
  if (realBias !== null && entry.status === 'measured'
    && (entry.biasMicroseconds !== realBias || entry.biasPlacement !== 'per-sample'
      || !SINGLE_FAMILY_VALUES.has(entry.singleProbeFamily))) return 'real-control-fields';
  return null;
}

function entriesViolation(entries) {
  if (!Array.isArray(entries)) return 'entries-not-array';
  const names = entries.map((entry) => entry?.name);
  const duplicate = names.find((name, index) => names.indexOf(name) !== index);
  if (duplicate) return `duplicate-entry:${duplicate}`;
  const expectedNames = EXPECTED_ENTRIES.map(([name]) => name);
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) return 'entry-names';
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const [name, kind] = EXPECTED_ENTRIES[index];
    if (entry.kind !== kind) return `entry-kind:${name}`;
    if (!['measured', 'missing', 'error'].includes(entry.status)) return `entry-status:${name}`;
    if (entry.status !== 'measured' && typeof entry.reason !== 'string') return `entry-reason:${name}`;
    if (!(Number.isInteger(entry.sequence) && entry.sequence > 0)
      && !(entry.status === 'missing' && entry.sequence === null)) return `entry-sequence:${name}`;
    if (entry.status === 'measured') {
      const violation = name === SENSITIVITY_FLOOR ? floorViolation(entry) : resultViolation(entry);
      if (violation) return `${violation}:${name}`;
    }
    const special = specialEntryViolation(entry);
    if (special) return `${special}:${name}`;
  }
  return null;
}

function hasExactKeys(value, keys) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function rankedEntryViolation(entry) {
  if (!hasExactKeys(entry, ['name', 'pValue', 'threshold', 'rank'])) return 'shape';
  if (!PROBE_NAMES.includes(entry.name)) return 'name';
  if (!Number.isFinite(entry.pValue) || entry.pValue < 0 || entry.pValue > 1) return 'p-value';
  if (!Number.isFinite(entry.threshold)) return 'threshold';
  if (!Number.isInteger(entry.rank) || entry.rank < 1) return 'rank';
  return null;
}

function sameRankedEntry(left, right) {
  return ['name', 'pValue', 'threshold', 'rank'].every((name) => left[name] === right[name]);
}

function holmVerdict(entries, alpha) {
  if (PROBE_NAMES.some((name) => entries[name]?.status !== 'measured')) return null;
  const ordered = PROBE_NAMES.map((name) => resultOf(entries[name])?.pValue).sort((a, b) => a - b);
  let rejected = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    if (ordered[index] > alpha / (ordered.length - index)) break;
    rejected += 1;
  }
  return rejected > 0 ? 'reject' : 'accept';
}

function familyViolation(family, entries, alpha) {
  if (typeof family !== 'object' || family === null || Array.isArray(family)
    || !FAMILY_VALUES.has(family.status)) return 'family-status';
  if (family.status === 'not-evaluated' && typeof family.reason !== 'string') return 'family-reason';
  if (family.status === 'accept') {
    return holmVerdict(entries, alpha) === family.status ? null : 'family-verdict-mismatch';
  }
  if (family.status !== 'reject') return null;
  const details = family.details;
  if (typeof details !== 'object' || details === null || Array.isArray(details)) return 'family-details';
  if (!hasExactKeys(details, ['alpha', 'rejected', 'ordered']) || !Number.isFinite(details.alpha)
    || Math.abs(details.alpha - alpha) > 1e-12) {
    return 'family-details-alpha';
  }
  if (!Array.isArray(details.rejected) || !Array.isArray(details.ordered)) return 'family-details-arrays';
  for (const ranked of [...details.rejected, ...details.ordered]) {
    const violation = rankedEntryViolation(ranked);
    if (violation) return `family-details-ranked-${violation}`;
  }
  if (details.rejected.length === 0) return 'family-details-rejected-empty';
  if (details.ordered.length !== PROBE_NAMES.length
    || new Set(details.ordered.map((ranked) => ranked.name)).size !== PROBE_NAMES.length
    || details.ordered.some((ranked) => !PROBE_NAMES.includes(ranked.name))) {
    return 'family-details-ordered-names';
  }
  for (let index = 0; index < details.ordered.length; index += 1) {
    const ranked = details.ordered[index];
    if (ranked.rank !== index + 1) return 'family-details-ordered-rank';
    const threshold = alpha / (PROBE_NAMES.length - index);
    if (Math.abs(ranked.threshold - threshold) > 1e-12) return 'family-details-ordered-threshold';
    if (index > 0 && ranked.pValue < details.ordered[index - 1].pValue) {
      return 'family-details-ordered-p-values';
    }
  }
  if (details.rejected.length > details.ordered.length
    || details.rejected.some((ranked, index) =>
      !sameRankedEntry(ranked, details.ordered[index]))) {
    return 'family-details-rejected-prefix';
  }
  for (const ranked of [...details.rejected, ...details.ordered]) {
    if (ranked.pValue !== resultOf(entries[ranked.name])?.pValue) {
      return 'family-details-p-value-mismatch';
    }
  }
  const recomputed = holmVerdict(entries, alpha);
  return recomputed === null || recomputed === family.status ? null : 'family-verdict-mismatch';
}

function strictSidecarViolation(sidecar) {
  const rootTypes = {
    schema: (value) => typeof value === 'string',
    complete: (value) => typeof value === 'boolean',
    startedAt: (value) => typeof value === 'string',
    writtenAt: (value) => typeof value === 'string',
    partitionDurationMs: (value) => Number.isFinite(value),
    otherTests: (value) => Number.isInteger(value) && value >= 0,
    commit: (value) => value === null || typeof value === 'string',
    node: (value) => typeof value === 'string',
    chromium: (value) => typeof value === 'string',
    pairs: (value) => typeof value === 'number',
    warmup: (value) => typeof value === 'number',
    alpha: (value) => typeof value === 'number',
    entries: () => true,
    family: () => true,
  };
  for (const [name, valid] of Object.entries(rootTypes)) {
    if (!Object.hasOwn(sidecar, name) || !valid(sidecar[name])) return `root-field:${name}`;
  }
  if (sidecar.pairs !== 500 || sidecar.warmup !== 20 || sidecar.alpha !== 0.01) return 'root-constants';
  const entries = entriesViolation(sidecar.entries);
  if (entries) return entries;
  const entriesByName = Object.fromEntries(sidecar.entries.map((entry) => [entry.name, entry]));
  return familyViolation(sidecar.family, entriesByName, sidecar.alpha);
}

function sidecarForRun(runDirectory, started) {
  const sidecar = optionalJson(path.join(runDirectory, 'timing-2-probes.json'));
  if (!sidecar) return { sidecar: null, reason: 'no-sidecar-for-this-run:absent' };
  if (sidecar.schema !== 'timing-2-probes/1') return { sidecar: null, reason: 'sidecar-invalid:schema' };
  if (sidecar.complete !== true) {
    return { sidecar: null, reason: 'no-sidecar-for-this-run:incomplete' };
  }
  const violation = strictSidecarViolation(sidecar);
  if (violation) return { sidecar: null, reason: `sidecar-invalid:${violation}` };
  const written = Date.parse(sidecar.writtenAt);
  const runStarted = Date.parse(started?.startedAt);
  if (!Number.isFinite(written) || !Number.isFinite(runStarted) || written < runStarted) {
    return { sidecar: null, reason: 'no-sidecar-for-this-run:stale' };
  }
  return { sidecar, reason: null };
}

function validity(partitions, sidecarState, entries, excluded, predicateAvailable, runEvidence) {
  const reasons = [];
  if (!predicateAvailable) reasons.push('predicate-evidence-unavailable');
  if (excluded) reasons.push('competing-process');
  reasons.push(...runEvidence);
  for (const [name, report] of Object.entries(partitions)) {
    if (report.verdict === 'malformed') reasons.push(`partition-report-malformed:${name}`);
    else if (!report.present) reasons.push(`missing-partition:${name}`);
  }
  if (sidecarState.reason) reasons.push(sidecarState.reason);
  if (sidecarState.sidecar) {
    for (const name of PROBE_NAMES) {
      if (entries[name]?.status !== 'measured') reasons.push(`probe-not-measured:${name}`);
    }
    const control = entries[SYNTHETIC_CONTROL];
    if (control?.status !== 'measured') reasons.push(`probe-not-measured:${SYNTHETIC_CONTROL}`);
    else if (singleFamily(control) !== 'reject') reasons.push('synthetic-control-did-not-reject');
  }
  return { valid: reasons.length === 0, reasons, controlSource: 'sidecar' };
}

function runEvidenceReasons(startedRecord, label, hostState, campaign) {
  const reasons = [];
  if (startedRecord && startedRecord.run !== label) reasons.push('started-run-label-mismatch');
  if (!hostState) reasons.push('host-state-missing');
  else {
    if (hostState.git?.head !== campaign.candidate) reasons.push('candidate-head-mismatch');
    if (hostState.git?.dirty !== false || hostState.git?.status !== '') reasons.push('dirty-checkout-at-start');
  }
  return reasons;
}

function predicateForRun(hostState, recorded) {
  const captureAvailable = hostState?.processCapture?.status === 'ok'
    && Array.isArray(hostState?.processes) && hostState.processes.length > 0;
  const metadataAvailable = Number.isInteger(recorded?.ownPid)
    && typeof recorded?.checkoutRoot === 'string' && recorded.checkoutRoot !== '';
  const recordedAvailable = recorded?.predicateEvidence === 'available'
    && Array.isArray(recorded?.competing) && Array.isArray(recorded?.observed);
  if (!captureAvailable || !metadataAvailable || !recordedAvailable) {
    return { available: false, excluded: false, mismatch: false, competing: [] };
  }
  let recomputed;
  try {
    recomputed = competingJobs(hostState, {
      ownPid: recorded.ownPid,
      checkoutRoot: recorded.checkoutRoot,
    });
  } catch {
    return { available: false, excluded: false, mismatch: false, competing: [] };
  }
  const metadataMismatch = hostState.ownPid !== recorded.ownPid
    || hostState.checkoutRoot !== recorded.checkoutRoot;
  const mismatch = metadataMismatch
    || JSON.stringify(recomputed.competing) !== JSON.stringify(recorded.competing)
    || JSON.stringify(recomputed.observed) !== JSON.stringify(recorded.observed);
  return {
    available: true,
    excluded: recomputed.competing.length > 0,
    mismatch,
    competing: recomputed.competing,
  };
}

function refusalContext(runDirectory) {
  const directory = path.join(runDirectory, 'refusals');
  if (!fs.existsSync(directory)) return { count: 0, reasons: [] };
  const reasons = [];
  const files = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json')).map((entry) => entry.name).sort();
  for (const file of files) {
    const record = optionalJson(path.join(directory, file));
    if (Array.isArray(record?.reasons)) reasons.push(...record.reasons.filter((reason) => typeof reason === 'string'));
  }
  return { count: files.length, reasons };
}

function analyzeRun(runDirectory, label, campaign) {
  const startedRecord = optionalJson(path.join(runDirectory, 'started.json'));
  const started = startedRecord !== null;
  const ended = fs.existsSync(path.join(runDirectory, 'ended.json'));
  const exit = optionalJson(path.join(runDirectory, 'exit.json'));
  const competing = optionalJson(path.join(runDirectory, 'competing.json'));
  const hostState = optionalJson(path.join(runDirectory, 'host-state.json'));
  const partitions = {
    main: partition(runDirectory, 'main.json'),
    timing1: partition(runDirectory, 'timing-1.json'),
    timing2: partition(runDirectory, 'timing-2.json'),
  };
  const sidecarState = sidecarForRun(runDirectory, startedRecord);
  const sidecar = sidecarState.sidecar;
  const entries = sidecar ? Object.fromEntries(sidecar.entries.map((entry) => [entry.name, entry])) : {};
  const predicate = predicateForRun(hostState, competing);
  const evidenceReasons = runEvidenceReasons(startedRecord, label, hostState, campaign);
  if (predicate.mismatch) evidenceReasons.push('predicate-verdict-mismatch');
  const check = validity(partitions, sidecarState, entries, predicate.excluded, predicate.available,
    evidenceReasons);
  if (!ended) check.reasons.push('run-not-ended');
  return {
    run: label, started, ended, exit, partitions, excluded: predicate.excluded,
    competing: predicate.competing, refusals: refusalContext(runDirectory), valid: started && ended && check.valid,
    invalidReasons: check.reasons, controlSource: check.controlSource,
    family: familyVerdict(sidecar), entries,
    load1: Number.isFinite(hostState?.load1) ? hostState.load1 : null,
    cpus: Number.isInteger(hostState?.cpus) ? hostState.cpus : null,
  };
}

function slopeInterval(samples) {
  if (!Array.isArray(samples) || samples.length < 3) return null;
  const xMean = (samples.length - 1) / 2;
  const yMean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  let sxx = 0; let sxy = 0;
  samples.forEach((value, index) => {
    sxx += (index - xMean) ** 2;
    sxy += (index - xMean) * (value - yMean);
  });
  const slope = sxy / sxx;
  const rss = samples.reduce((sum, value, index) => {
    const fitted = yMean + slope * (index - xMean);
    return sum + (value - fitted) ** 2;
  }, 0);
  const margin = 1.96 * Math.sqrt((rss / (samples.length - 2)) / sxx);
  return { slope, low95: slope - margin, high95: slope + margin, pairs: samples.length };
}

function summarizeStationarity(rows) {
  const available = rows.filter((row) => Number.isFinite(row.slope));
  if (available.length === 0) return { available: 0, meanSlope: null, minimumSlope: null, maximumSlope: null, intervalsExcludingZero: 0 };
  const slopes = available.map((row) => row.slope);
  return {
    available: available.length,
    meanSlope: slopes.reduce((sum, slope) => sum + slope, 0) / slopes.length,
    minimumSlope: Math.min(...slopes), maximumSlope: Math.max(...slopes),
    intervalsExcludingZero: available.filter((row) => row.low95 > 0 || row.high95 < 0).length,
  };
}

function diagnosticEntry(run, probe, kind) {
  const name = DIAGNOSTICS[probe][kind];
  return name ? run.entries[name] : null;
}

function rejection(entry) {
  const pValue = resultOf(entry)?.pValue;
  return entry?.status === 'measured' && Number.isFinite(pValue) && pValue <= BAR;
}

function probeDiagnosis(validRuns, probe) {
  const signs = [];
  const stationarity = [];
  let kAB = 0; let kAA = 0; let kSham = 0;
  for (const run of validRuns) {
    const ab = run.entries[probe];
    if (rejection(ab)) kAB += 1;
    if (rejection(diagnosticEntry(run, probe, 'aa'))) kAA += 1;
    if (rejection(diagnosticEntry(run, probe, 'sham'))) kSham += 1;
    const median = resultOf(ab)?.medianDiffMs;
    signs.push(median > 0 ? '+' : median < 0 ? '-' : '0');
    stationarity.push({ run: run.run, ...slopeInterval(resultOf(ab)?.aSamplesMs) });
  }
  const positive = signs.filter((sign) => sign === '+').length;
  const negative = signs.filter((sign) => sign === '-').length;
  const majoritySign = positive === negative ? 'tie' : positive > negative ? '+' : '-';
  return {
    probe, k_AB: kAB, k_AA: kAA, k_sham: kSham, bar: BAR,
    signs, majoritySign,
    majorityCount: Math.max(positive, negative), V: validRuns.length, stationarity,
    stationaritySummary: summarizeStationarity(stationarity),
  };
}

function diagnosticMissingCounts(validRuns) {
  const names = new Set([SENSITIVITY_FLOOR]);
  for (const probe of TRIPWIRE_PROBES) Object.values(DIAGNOSTICS[probe]).forEach((name) => names.add(name));
  const counts = {};
  for (const name of names) {
    counts[name] = validRuns.filter((run) => !['measured'].includes(run.entries[name]?.status)).length;
  }
  return counts;
}

function realControlCounts(validRuns) {
  const names = DIAGNOSTICS['tripwire-real-click-match-vs-no-match'];
  const count = (name) => validRuns.filter((run) => singleFamily(run.entries[name]) === 'reject').length;
  return { microseconds250: count(names.control250), microseconds1000: count(names.control1000), V: validRuns.length };
}

function perProbeClass(diagnosis) {
  if (diagnosis.k_AA >= 2 || diagnosis.k_sham >= 2) return 'calibration';
  if (diagnosis.k_AB >= 2 && diagnosis.k_AA === 0 && diagnosis.k_sham === 0) return 'audit';
  if (diagnosis.k_AB >= 2) return 'mixed';
  return 'quiet';
}

export function outcomePatterns({ V, diagnoses, missingCounts, controls }) {
  const classes = diagnoses.map(perProbeClass);
  const applicable = new Set();
  if (V < 15) applicable.add('insufficient');
  if (Object.values(missingCounts).some((count) => count >= 2)) applicable.add('diagnostic-incompleteness');
  if (classes.includes('calibration')) applicable.add('calibration-concern');
  if (classes.includes('audit')) applicable.add('harness-audit-then-security-investigation');
  const different = new Set(classes).size > 1;
  if (classes.includes('mixed') || different || controls.microseconds1000 < V) applicable.add('mixed');
  if (classes.every((value) => value === 'quiet')) applicable.add('quiet');
  const ordered = OUTCOME_ORDER.filter((name) => applicable.has(name));
  if (ordered.length === 0) throw new Error('decision rule is not exhaustive');
  const proposalOrder = [...ordered];
  if (applicable.has('calibration-concern') && applicable.has('harness-audit-then-security-investigation')) {
    const calibration = proposalOrder.indexOf('calibration-concern');
    const audit = proposalOrder.indexOf('harness-audit-then-security-investigation');
    [proposalOrder[calibration], proposalOrder[audit]] = [proposalOrder[audit], proposalOrder[calibration]];
  }
  return {
    primary: ordered[0], applicable: ordered, proposalOrder,
    proposals: Object.fromEntries(ordered.map((name) => [name, PROPOSALS[name]])),
  };
}

export function analyzeCampaign(directory, { allowPartial = false } = {}) {
  const campaign = readJson(path.join(directory, 'campaign.json'));
  if (allowPartial && campaign.synthetic !== true) {
    throw new Error('--allow-partial requires a synthetic --plan campaign');
  }
  if (!allowPartial && campaign.runs !== 20) throw new Error('analysis requires a 20-run campaign');
  if (!Array.isArray(campaign.labels)) throw new Error('campaign has no frozen label set');
  const expectedLabels = Array.from({ length: campaign.runs },
    (_, index) => `run-${String(index + 1).padStart(2, '0')}`);
  if (JSON.stringify(campaign.labels) !== JSON.stringify(expectedLabels)) {
    throw new Error('campaign frozen label set is invalid');
  }
  if (!Array.isArray(campaign.startedLabels) || new Set(campaign.startedLabels).size !== campaign.startedLabels.length
    || campaign.startedLabels.some((label) => !campaign.labels.includes(label))) {
    throw new Error('campaign started-label ledger is invalid');
  }
  if (!allowPartial && campaign.labels.some((label) => !campaign.startedLabels.includes(label))) {
    throw new Error('analysis requires all 20 labels started');
  }
  for (const label of campaign.startedLabels) {
    if (!fs.existsSync(path.join(directory, label, 'started.json'))) {
      throw new Error(`campaign is unresumable: missing started run ${label}`);
    }
  }
  const directories = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^run-/u.test(entry.name)).map((entry) => entry.name).sort();
  const unexpectedDirectories = directories.filter((name) => !campaign.labels.includes(name));
  const runs = campaign.labels.map((name) => analyzeRun(path.join(directory, name), name, campaign));
  const startedRuns = runs.filter((run) => run.started);
  const validRuns = startedRuns.filter((run) => run.valid);
  const diagnoses = TRIPWIRE_PROBES.map((probe) => probeDiagnosis(validRuns, probe));
  const missingCounts = diagnosticMissingCounts(validRuns);
  const controls = realControlCounts(validRuns);
  const outcome = outcomePatterns({ V: validRuns.length, diagnoses, missingCounts, controls });
  return {
    schema: 'probe-p-campaign-report/1', generatedAt: new Date().toISOString(), campaign,
    counts: { started: startedRuns.length, excluded: startedRuns.filter((run) => run.excluded).length, valid: validRuns.length },
    actualGateOutcomes: startedRuns, unexpectedDirectories,
    diagnosis: { V: validRuns.length, probes: diagnoses, controls, missingCounts }, outcome,
    power: '20 started runs resolve counts, not percentages; they separate a roughly 20 percent rate from roughly 0 percent but cannot separate 1 percent from 5 percent. Inconclusive is a likely and acceptable result.',
    closing: 'Every outcome is a proposal. A quiet campaign proves nothing about the absence of a timing channel.',
  };
}

function fmt(value) {
  return Number.isFinite(value) ? value.toPrecision(6) : 'unavailable';
}

function actualRows(report) {
  return report.actualGateOutcomes.map((run) => {
    const make = run.exit ? `${run.exit.code ?? 'null'}/${run.exit.signal ?? 'none'}` : 'missing';
    const familyEvidence = JSON.stringify({ details: run.family.details, reason: run.family.reason ?? null });
    const reasons = run.invalidReasons.join(', ') || 'none';
    const refusals = `${run.refusals.count}:${run.refusals.reasons.join(',') || 'none'}`;
    const load = `${run.load1 ?? 'unavailable'} / ${run.cpus ?? 'unavailable'}`;
    return `| ${run.run} | ${run.ended} | ${make} | ${load} | ${run.partitions.main.verdict}/${run.partitions.timing1.verdict}/${run.partitions.timing2.verdict} | ${run.family.verdict} | ${run.excluded} | ${run.valid} | ${reasons} | ${refusals} | ${familyEvidence} |`;
  });
}

function probeMarkdown(probe) {
  const slopes = probe.stationarity.map((item) => item.slope == null
    ? `${item.run}: unavailable`
    : `${item.run}: ${fmt(item.slope)} [${fmt(item.low95)}, ${fmt(item.high95)}]`).join('; ');
  return [
    `### ${probe.probe}`,
    '',
    `- Counts at p <= 0.01/6: k_AB=${probe.k_AB}, k_AA=${probe.k_AA}, k_sham=${probe.k_sham}; V=${probe.V}.`,
    `- Primary sign series: ${probe.signs.join(' ') || '(none)'}; majority ${probe.majoritySign}; same sign in ${probe.majorityCount} of ${probe.V} (threshold ⌈0.8·${probe.V}⌉ = ${Math.ceil(0.8 * probe.V)}).`,
    `- OLS arm-A slope per pair with normal 95% interval: ${slopes || '(none)'}.`,
    `- Stationarity summary: ${JSON.stringify(probe.stationaritySummary)}.`,
  ];
}

export function renderMarkdown(report) {
  const lines = [
    '# Probe P campaign report', '',
    `Power: ${report.power}`, '',
    `Counts: started=${report.counts.started}, excluded=${report.counts.excluded}, valid V=${report.counts.valid}.`, '',
    `Unexpected directories: ${report.unexpectedDirectories.join(', ') || 'none'}.`, '',
    'Diagnostic limitation: the twins run after the family gate and are not phase-matched to their siblings. A quiet twin beside a rejecting sibling is weaker evidence than a phase-matched null.', '',
    'Sham limitation: k_sham=0 with k_AB>=2 does not prove a branch-dependent channel; the sham removes only byte content equal to the canary.', '',
    '## (a) Actual gate outcomes', '',
    '| Run | ended | make test code/signal | load1 / cpus | main/timing-1/timing-2 | family | excluded | valid | reasons | refusal attempts | family details |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...actualRows(report), '',
    '## (b) Matched per-probe diagnosis', '',
  ];
  for (const probe of report.diagnosis.probes) lines.push(...probeMarkdown(probe), '');
  const controls = report.diagnosis.controls;
  lines.push(`Real-click controls: 250 us rejected ${controls.microseconds250} of V=${controls.V}; 1,000 us rejected ${controls.microseconds1000} of V=${controls.V}.`, '');
  lines.push(`Diagnostic missing/error counts: ${JSON.stringify(report.diagnosis.missingCounts)}.`, '');
  lines.push('## Outcome', '', `Primary: ${report.outcome.primary}.`, '');
  for (const name of report.outcome.proposalOrder) lines.push(`- ${name}: ${report.outcome.proposals[name]}`);
  lines.push('', report.closing, '');
  return lines.join('\n');
}

function parseArguments(argv) {
  let directory = null;
  let allowPartial = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--dir' && directory === null && argv[index + 1]) directory = path.resolve(argv[++index]);
    else if (argv[index] === '--allow-partial' && !allowPartial) allowPartial = true;
    else throw new Error('usage: analyze.mjs --dir <campaign-dir> [--allow-partial]');
  }
  if (directory === null) throw new Error('usage: analyze.mjs --dir <campaign-dir> [--allow-partial]');
  return { directory, allowPartial };
}

export function main(argv = process.argv.slice(2)) {
  const { directory, allowPartial } = parseArguments(argv);
  const jsonFile = path.join(directory, 'report.json');
  const markdownFile = path.join(directory, 'report.md');
  if (fs.existsSync(jsonFile) || fs.existsSync(markdownFile)) throw new Error('analysis output already exists');
  const report = analyzeCampaign(directory, { allowPartial });
  fs.writeFileSync(jsonFile, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  fs.writeFileSync(markdownFile, renderMarkdown(report), { flag: 'wx' });
}

if (process.argv[1]
  && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(MODULE_FILE)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
