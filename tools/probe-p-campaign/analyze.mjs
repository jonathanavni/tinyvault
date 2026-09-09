#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

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

const PROPOSALS = Object.freeze({
  insufficient: 'Inconclusive. No inference about calibration.',
  'diagnostic-incompleteness': 'Inconclusive for the affected probe; the incompleteness itself is the finding (a harness defect to fix before re-running a *new* campaign, which would need new authorization).',
  'calibration-concern': 'Proposal: a D10 amendment packet changing the *statistic* for the affected probe(s) to one that respects the measured dependence (block permutation on the interleaved pairs with the block length derived from the retained series, or a declared false-rejection rate measured rather than assumed), keeping α, pairs and the hard clause.',
  'harness-audit-then-security-investigation': 'Proposal: first an Astra audit of the probe construction in the timing file (host accumulation, setup asymmetry, warm-up order, the stationarity diagnostic); if the audit clears the harness, an Astra investigation of the tripwire path in `src/supervisor`. A consistent primary sign (same sign in ≥ 80 % of valid runs, count printed) strengthens this outcome but does not skip the audit.',
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
  const value = optionalJson(path.join(runDirectory, name));
  if (!value) return { present: false, numFailedTests: null, numTotalTests: null, verdict: 'missing' };
  const failed = Number(value.numFailedTests);
  const total = Number(value.numTotalTests);
  const usable = Number.isInteger(failed) && Number.isInteger(total);
  return {
    present: true, numFailedTests: usable ? failed : null, numTotalTests: usable ? total : null,
    verdict: usable ? failed === 0 ? 'pass' : 'fail' : 'unknown',
  };
}

function normalizedEntries(sidecar) {
  const source = sidecar?.entries ?? sidecar?.probes ?? {};
  if (!Array.isArray(source)) return source;
  return Object.fromEntries(source.filter((entry) => entry?.name).map((entry) => [entry.name, entry]));
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

function sidecarForRun(runDirectory, started) {
  const sidecar = optionalJson(path.join(runDirectory, 'timing-2-probes.json'));
  if (!sidecar) return { sidecar: null, reason: 'no-sidecar-for-this-run:absent' };
  if (sidecar.schema !== 'timing-2-probes/1' || sidecar.complete !== true) {
    return { sidecar: null, reason: 'no-sidecar-for-this-run:incomplete' };
  }
  const written = Date.parse(sidecar.writtenAt);
  const runStarted = Date.parse(started?.startedAt);
  if (!Number.isFinite(written) || !Number.isFinite(runStarted) || written < runStarted) {
    return { sidecar: null, reason: 'no-sidecar-for-this-run:stale' };
  }
  return { sidecar, reason: null };
}

function validity(partitions, sidecarState, entries, excluded, predicateAvailable) {
  const reasons = [];
  if (!predicateAvailable) reasons.push('missing-competing-verdict');
  if (excluded) reasons.push('competing-process');
  for (const [name, report] of Object.entries(partitions)) {
    if (!report.present) reasons.push(`missing-partition:${name}`);
  }
  if (sidecarState.reason) reasons.push(sidecarState.reason);
  for (const name of PROBE_NAMES) {
    if (entries[name]?.status !== 'measured') reasons.push(`probe-not-measured:${name}`);
  }
  const control = entries[SYNTHETIC_CONTROL];
  if (control?.kind !== 'control-synthetic' || control.status !== 'measured') reasons.push(`probe-not-measured:${SYNTHETIC_CONTROL}`);
  else if (singleFamily(control) === 'reject') return { valid: reasons.length === 0, reasons, controlSource: 'sidecar' };
  else reasons.push('synthetic-control-did-not-reject');
  return { valid: reasons.length === 0, reasons, controlSource: 'sidecar' };
}

function analyzeRun(runDirectory, label) {
  const startedRecord = optionalJson(path.join(runDirectory, 'started.json'));
  const started = startedRecord !== null;
  const ended = fs.existsSync(path.join(runDirectory, 'ended.json'));
  const exit = optionalJson(path.join(runDirectory, 'exit.json'));
  const competing = optionalJson(path.join(runDirectory, 'competing.json'));
  const partitions = {
    main: partition(runDirectory, 'main.json'),
    timing1: partition(runDirectory, 'timing-1.json'),
    timing2: partition(runDirectory, 'timing-2.json'),
  };
  const sidecarState = sidecarForRun(runDirectory, startedRecord);
  const sidecar = sidecarState.sidecar;
  const entries = normalizedEntries(sidecar);
  const predicateAvailable = Array.isArray(competing?.competing);
  const excluded = predicateAvailable && competing.competing.length > 0;
  const check = validity(partitions, sidecarState, entries, excluded, predicateAvailable);
  if (!ended) check.reasons.push('run-not-ended');
  return {
    run: label, started, ended, exit, partitions, excluded,
    competing: competing?.competing ?? [], valid: started && ended && check.valid,
    invalidReasons: check.reasons, controlSource: check.controlSource,
    family: familyVerdict(sidecar), entries,
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
  const names = new Set();
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
  return { primary: ordered[0], applicable: ordered, proposals: Object.fromEntries(ordered.map((name) => [name, PROPOSALS[name]])) };
}

export function analyzeCampaign(directory) {
  const campaign = readJson(path.join(directory, 'campaign.json'));
  const names = fs.readdirSync(directory).filter((name) => /^run-\d{2}$/u.test(name)).sort();
  const runs = names.map((name) => analyzeRun(path.join(directory, name), name));
  const startedRuns = runs.filter((run) => run.started);
  const validRuns = startedRuns.filter((run) => run.valid);
  const diagnoses = TRIPWIRE_PROBES.map((probe) => probeDiagnosis(validRuns, probe));
  const missingCounts = diagnosticMissingCounts(validRuns);
  const controls = realControlCounts(validRuns);
  const outcome = outcomePatterns({ V: validRuns.length, diagnoses, missingCounts, controls });
  return {
    schema: 'probe-p-campaign-report/1', generatedAt: new Date().toISOString(), campaign,
    counts: { started: startedRuns.length, excluded: startedRuns.filter((run) => run.excluded).length, valid: validRuns.length },
    actualGateOutcomes: startedRuns, diagnosis: { V: validRuns.length, probes: diagnoses, controls, missingCounts }, outcome,
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
    return `| ${run.run} | ${run.ended} | ${make} | ${run.partitions.main.verdict}/${run.partitions.timing1.verdict}/${run.partitions.timing2.verdict} | ${run.family.verdict} | ${run.excluded} | ${run.valid} | ${reasons} | ${familyEvidence} |`;
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
    `- Primary sign series: ${probe.signs.join(' ') || '(none)'}; majority ${probe.majoritySign} count=${probe.majorityCount} of V=${probe.V}.`,
    `- OLS arm-A slope per pair with normal 95% interval: ${slopes || '(none)'}.`,
    `- Stationarity summary: ${JSON.stringify(probe.stationaritySummary)}.`,
  ];
}

export function renderMarkdown(report) {
  const lines = [
    '# Probe P campaign report', '',
    `Power: ${report.power}`, '',
    `Counts: started=${report.counts.started}, excluded=${report.counts.excluded}, valid V=${report.counts.valid}.`, '',
    'Diagnostic limitation: the twins run after the family gate and are not phase-matched to their siblings. A quiet twin beside a rejecting sibling is weaker evidence than a phase-matched null.', '',
    'Sham limitation: k_sham=0 with k_AB>=2 does not prove a branch-dependent channel; the sham removes only byte content equal to the canary.', '',
    '## (a) Actual gate outcomes', '',
    '| Run | ended | make test code/signal | main/timing-1/timing-2 | family | excluded | valid | reasons | family details |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...actualRows(report), '',
    '## (b) Matched per-probe diagnosis', '',
  ];
  for (const probe of report.diagnosis.probes) lines.push(...probeMarkdown(probe), '');
  const controls = report.diagnosis.controls;
  lines.push(`Real-click controls: 250 us rejected ${controls.microseconds250} of V=${controls.V}; 1,000 us rejected ${controls.microseconds1000} of V=${controls.V}.`, '');
  lines.push(`Diagnostic missing/error counts: ${JSON.stringify(report.diagnosis.missingCounts)}.`, '');
  lines.push('## Outcome', '', `Primary: ${report.outcome.primary}.`, '');
  for (const name of report.outcome.applicable) lines.push(`- ${name}: ${report.outcome.proposals[name]}`);
  lines.push('', report.closing, '');
  return lines.join('\n');
}

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== '--dir') throw new Error('usage: analyze.mjs --dir <campaign-dir>');
  return path.resolve(argv[1]);
}

export function main(argv = process.argv.slice(2)) {
  const directory = parseArguments(argv);
  const jsonFile = path.join(directory, 'report.json');
  const markdownFile = path.join(directory, 'report.md');
  if (fs.existsSync(jsonFile) || fs.existsSync(markdownFile)) throw new Error('analysis output already exists');
  const report = analyzeCampaign(directory);
  fs.writeFileSync(jsonFile, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  fs.writeFileSync(markdownFile, renderMarkdown(report), { flag: 'wx' });
}

if (process.argv[1]
  && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(MODULE_FILE)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
