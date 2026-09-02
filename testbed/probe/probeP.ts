export type MannWhitneyResult = Readonly<{
  u: number;
  z: number;
  pValue: number;
  effectSize: number;
}>;

export type ProbePResult = MannWhitneyResult & Readonly<{
  medianDiffMs: number;
  aSamplesMs: readonly number[];
  bSamplesMs: readonly number[];
}>;

export type ProbePOptions = Readonly<{
  samplesPerCondition?: number;
  warmup?: number;
  a: () => void | Promise<void>;
  b: () => void | Promise<void>;
  setupA?: () => void | Promise<void>;
  setupB?: () => void | Promise<void>;
}>;

export function mannWhitneyU(a: readonly number[], b: readonly number[]): MannWhitneyResult {
  if (a.length === 0 || b.length === 0) throw new Error('Probe P requires two non-empty samples');
  const ranked = rankSamples(a, b);
  const rankSumA = ranked.filter((entry) => entry.sample === 'a')
    .reduce((sum, entry) => sum + entry.rank, 0);
  const n = a.length;
  const m = b.length;
  const u = rankSumA - n * (n + 1) / 2;
  const mean = n * m / 2;
  const variance = tieCorrectedVariance(n, m, ranked);
  const z = variance === 0 ? 0 : continuityCorrectedZ(u - mean, Math.sqrt(variance));
  const pValue = Math.min(1, 2 * (1 - normalCdf(Math.abs(z))));
  return Object.freeze({ u, z, pValue, effectSize: 1 - 2 * u / (n * m) });
}

export async function runProbeP(options: ProbePOptions): Promise<ProbePResult> {
  const samplesPerCondition = options.samplesPerCondition ?? 200;
  const warmup = options.warmup ?? 20;
  assertEvenCount(samplesPerCondition);
  assertEvenCount(warmup);
  await collectBlocks(warmup, options, undefined, undefined);
  const aSamples: number[] = [];
  const bSamples: number[] = [];
  await collectBlocks(samplesPerCondition, options, aSamples, bSamples);
  const statistic = mannWhitneyU(aSamples, bSamples);
  return Object.freeze({
    ...statistic,
    medianDiffMs: median(bSamples) - median(aSamples),
    aSamplesMs: Object.freeze(aSamples),
    bSamplesMs: Object.freeze(bSamples),
  });
}

export function assertProbeP(result: Pick<ProbePResult, 'pValue' | 'medianDiffMs'>): void {
  if (result.pValue < 0.01 || Math.abs(result.medianDiffMs) > 2) {
    throw new Error('Probe P detected a timing difference');
  }
}

type RankedEntry = { value: number; sample: 'a' | 'b'; rank: number; tieSize: number };

function rankSamples(a: readonly number[], b: readonly number[]): RankedEntry[] {
  const entries: RankedEntry[] = [
    ...a.map((value) => ({ value, sample: 'a' as const, rank: 0, tieSize: 0 })),
    ...b.map((value) => ({ value, sample: 'b' as const, rank: 0, tieSize: 0 })),
  ].sort((left, right) => left.value - right.value);
  for (let start = 0; start < entries.length;) {
    let end = start + 1;
    while (end < entries.length && entries[end]!.value === entries[start]!.value) end += 1;
    const rank = (start + 1 + end) / 2;
    for (let index = start; index < end; index += 1) {
      entries[index]!.rank = rank;
      entries[index]!.tieSize = end - start;
    }
    start = end;
  }
  return entries;
}

function tieCorrectedVariance(n: number, m: number, entries: readonly RankedEntry[]): number {
  const total = n + m;
  let correction = 0;
  for (let index = 0; index < entries.length;) {
    const size = entries[index]!.tieSize;
    correction += size ** 3 - size;
    index += size;
  }
  return n * m / 12 * (total + 1 - correction / (total * (total - 1)));
}

function continuityCorrectedZ(difference: number, standardDeviation: number): number {
  if (difference === 0) return 0;
  return (difference - Math.sign(difference) * 0.5) / standardDeviation;
}

function normalCdf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const coefficients = [1.061405429, -1.453152027, 1.421413741, -0.284496736, 0.254829592];
  let polynomial = coefficients[0]!;
  for (let index = 1; index < coefficients.length; index += 1) polynomial = polynomial * t + coefficients[index]!;
  const erf = sign * (1 - polynomial * t * Math.exp(-x * x));
  return (1 + erf) / 2;
}

async function collectBlocks(
  count: number,
  options: ProbePOptions,
  aSamples: number[] | undefined,
  bSamples: number[] | undefined,
): Promise<void> {
  for (let index = 0; index < count / 2; index += 1) {
    await measure(options.setupA, options.a, aSamples);
    await measure(options.setupB, options.b, bSamples);
    await measure(options.setupA, options.a, aSamples);
    await measure(options.setupB, options.b, bSamples);
  }
}

async function measure(
  setup: (() => void | Promise<void>) | undefined,
  operation: () => void | Promise<void>,
  samples: number[] | undefined,
): Promise<void> {
  await setup?.();
  const start = performance.now();
  await operation();
  if (samples !== undefined) samples.push(performance.now() - start);
}

function assertEvenCount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value % 2 !== 0) {
    throw new Error('Probe P sample counts must be non-negative even integers');
  }
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}
