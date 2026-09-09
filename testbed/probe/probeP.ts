export type WilcoxonResult = Readonly<{
  nonZero: number;
  wPlus: number;
  wMinus: number;
  variance: number;
  z: number;
  pValue: number;
  effectSize: number;
  medianDiffMs: number;
}>;

export type ProbePResult = Readonly<{
  pValue: number;
  z: number;
  effectSize: number;
  medianDiffMs: number;
  p95AMs: number;
  p95BMs: number;
  differencesMs: readonly number[];
  aSamplesMs: readonly number[];
  bSamplesMs: readonly number[];
}>;

export type ProbePOptions = Readonly<{
  pairs?: number;
  warmup?: number;
  a: () => void | Promise<void>;
  b: () => void | Promise<void>;
  setupA?: () => void | Promise<void>;
  setupB?: () => void | Promise<void>;
}>;

type FamilyEntry = Readonly<{ name: string; pValue: number }>;
type RankedFamilyEntry = Readonly<{
  name: string;
  pValue: number;
  threshold: number;
  rank: number;
}>;
type ProbeFamilyDetails = Readonly<{
  alpha: number;
  rejected: readonly RankedFamilyEntry[];
  ordered: readonly RankedFamilyEntry[];
}>;
type RankedDifference = Readonly<{ difference: number; absolute: number; rank: number }>;

class ProbeFamilyError extends Error {
  readonly details: ProbeFamilyDetails;

  constructor(details: ProbeFamilyDetails) {
    const rejected = details.rejected.map(({ name, pValue, threshold, rank }) =>
      `${name} (p=${pValue} <= ${threshold} at rank ${rank} of ${details.ordered.length})`);
    super(`Probe P family rejected: ${rejected.join(', ')}`);
    this.name = 'ProbeFamilyError';
    this.details = details;
  }
}

export function wilcoxonSignedRank(differences: readonly number[]): WilcoxonResult {
  if (differences.some((difference) => !Number.isFinite(difference))) {
    throw new Error('Probe P differences must be finite');
  }
  const { ranked, tieCorrection } = rankAbsoluteDifferences(differences);
  const nonZero = ranked.length;
  const wPlus = ranked.reduce(
    (sum, entry) => sum + (entry.difference > 0 ? entry.rank : 0),
    0,
  );
  const rankTotal = nonZero * (nonZero + 1) / 2;
  const wMinus = rankTotal - wPlus;
  const variance = nonZero * (nonZero + 1) * (2 * nonZero + 1) / 24 - tieCorrection / 48;
  const mean = rankTotal / 2;
  const z = variance === 0 ? 0 : continuityCorrectedZ(wPlus - mean, Math.sqrt(variance));
  const pValue = Math.min(1, 2 * (1 - normalCdf(Math.abs(z))));
  return Object.freeze({
    nonZero,
    wPlus,
    wMinus,
    variance,
    z,
    pValue: nonZero === 0 ? 1 : pValue,
    effectSize: rankTotal === 0 ? 0 : (wPlus - wMinus) / rankTotal,
    medianDiffMs: median(differences),
  });
}

export async function runProbeP(options: ProbePOptions): Promise<ProbePResult> {
  const pairs = options.pairs ?? 500;
  const warmup = options.warmup ?? 20;
  assertCount('pairs', pairs);
  assertCount('warmup', warmup);
  await warmUp(warmup, options);
  const aSamplesMs: number[] = [];
  const bSamplesMs: number[] = [];
  await collectPairs(pairs, options, aSamplesMs, bSamplesMs);
  const differencesMs = bSamplesMs.map((sample, index) => sample - aSamplesMs[index]!);
  const statistic = wilcoxonSignedRank(differencesMs);
  return Object.freeze({
    pValue: statistic.pValue,
    z: statistic.z,
    effectSize: statistic.effectSize,
    medianDiffMs: statistic.medianDiffMs,
    p95AMs: percentile95(aSamplesMs),
    p95BMs: percentile95(bSamplesMs),
    differencesMs: Object.freeze(differencesMs),
    aSamplesMs: Object.freeze(aSamplesMs),
    bSamplesMs: Object.freeze(bSamplesMs),
  });
}

export function assertProbeHardClause(result: Pick<ProbePResult, 'medianDiffMs'>): void {
  if (Math.abs(result.medianDiffMs) > 2) {
    throw new Error('Probe P hard clause detected a timing difference');
  }
}

export function assertProbeFamily(
  results: ReadonlyMap<string, ProbePResult> | readonly FamilyEntry[],
  options: Readonly<{ alpha?: number; expected: readonly string[] }>,
): void {
  const alpha = options.alpha ?? 0.01;
  if (!(alpha > 0 && alpha <= 1)) throw new Error('Probe P family alpha must be in (0, 1]');
  const entries = Array.isArray(results)
    ? [...results] as FamilyEntry[]
    : Array.from(
      results as ReadonlyMap<string, ProbePResult>,
      ([name, result]) => ({ name, pValue: result.pValue }),
    );
  assertExpectedNames(entries, options.expected);
  if (entries.some(({ pValue }) => !Number.isFinite(pValue) || pValue < 0 || pValue > 1)) {
    throw new Error('Probe P family p-values must be finite values in [0, 1]');
  }
  const ordered = [...entries]
    .sort((left, right) => left.pValue - right.pValue || left.name.localeCompare(right.name))
    .map((entry, index) => Object.freeze({
      ...entry,
      threshold: alpha / (entries.length - index),
      rank: index + 1,
    }));
  const rejected: RankedFamilyEntry[] = [];
  for (let index = 0; index < ordered.length; index += 1) {
    if (ordered[index]!.pValue > ordered[index]!.threshold) break;
    rejected.push(ordered[index]!);
  }
  if (rejected.length > 0) {
    throw new ProbeFamilyError(Object.freeze({
      alpha,
      rejected: Object.freeze(rejected),
      ordered: Object.freeze(ordered),
    }));
  }
}

function assertExpectedNames(entries: readonly FamilyEntry[], expected: readonly string[]): void {
  const actualNames = entries.map(({ name }) => name);
  const actualSet = new Set(actualNames);
  const expectedSet = new Set(expected);
  const exact = actualNames.length === expected.length
    && actualSet.size === actualNames.length
    && expectedSet.size === expected.length
    && expected.every((name) => actualSet.has(name));
  if (!exact) {
    throw new Error(`Probe P family names mismatch: expected [${expected.join(', ')}], got [${actualNames.join(', ')}]`);
  }
}

function rankAbsoluteDifferences(
  differences: readonly number[],
): Readonly<{ ranked: readonly RankedDifference[]; tieCorrection: number }> {
  const ranked = differences
    .filter((difference) => difference !== 0)
    .map((difference) => ({ difference, absolute: Math.abs(difference), rank: 0 }))
    .sort((left, right) => left.absolute - right.absolute);
  let tieCorrection = 0;
  for (let start = 0; start < ranked.length;) {
    let end = start + 1;
    while (end < ranked.length && ranked[end]!.absolute === ranked[start]!.absolute) end += 1;
    const rank = (start + 1 + end) / 2;
    const tieSize = end - start;
    tieCorrection += tieSize ** 3 - tieSize;
    for (let index = start; index < end; index += 1) ranked[index]!.rank = rank;
    start = end;
  }
  return { ranked, tieCorrection };
}

async function warmUp(count: number, options: ProbePOptions): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await measure(options.setupA, options.a);
    await measure(options.setupB, options.b);
  }
}

async function collectPairs(
  pairs: number,
  options: ProbePOptions,
  aSamplesMs: number[],
  bSamplesMs: number[],
): Promise<void> {
  for (let index = 0; index < pairs; index += 1) {
    if (index % 2 === 0) {
      aSamplesMs.push(await measure(options.setupA, options.a));
      bSamplesMs.push(await measure(options.setupB, options.b));
    } else {
      bSamplesMs.push(await measure(options.setupB, options.b));
      aSamplesMs.push(await measure(options.setupA, options.a));
    }
  }
}

async function measure(
  setup: (() => void | Promise<void>) | undefined,
  operation: () => void | Promise<void>,
): Promise<number> {
  await setup?.();
  const start = performance.now();
  await operation();
  return performance.now() - start;
}

function continuityCorrectedZ(difference: number, standardDeviation: number): number {
  if (difference === 0) return 0;
  return (difference - Math.sign(difference) * 0.5) / standardDeviation;
}

function normalCdf(value: number): number {
  const upperTail = standardNormalUpperTail(Math.abs(value));
  return value < 0 ? upperTail : 1 - upperTail;
}

function standardNormalUpperTail(value: number): number {
  if (value > 37) return 0;
  const exponential = Math.exp(-value * value / 2);
  if (value >= 7.07106781186547) {
    return exponential / (value + 1 / (value + 2 / (value + 3 / (value + 4 / (value + 0.65)))));
  }
  let numerator = 0.0352624965998911 * value + 0.700383064443688;
  for (const coefficient of [6.37396220353165, 33.912866078383, 112.079291497871,
    221.213596169931, 220.206867912376]) numerator = numerator * value + coefficient;
  let denominator = 0.0883883476483184 * value + 1.75566716318264;
  for (const coefficient of [16.064177579207, 86.7807322029461, 296.564248779674,
    637.333633378831, 793.826512519948, 440.413735824752]) denominator = denominator * value + coefficient;
  return exponential * numerator / denominator;
}

function assertCount(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Probe P ${name} must be a non-negative integer`);
  }
}

function percentile95(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1]!;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const result = sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
  return result === 0 ? 0 : result;
}
