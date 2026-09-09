import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

import { assertProbeHardClause, type ProbePResult } from './probeP';

export type TimingTask = {
  name: string;
  result?: { state: string; startTime?: number; duration?: number; errors?: readonly { message?: string }[] };
};
export type LedgerRow = { task: TimingTask; sequence: number };
export type LedgerFailure = LedgerRow & { message: string };
export type DiagnosticResult = {
  result: ProbePResult;
  hardClause: 'pass' | 'fail';
  singleProbeFamily: 'accept' | 'reject';
};
export type FloorResult = {
  microseconds: number; pValue: number; medianDiffMs: number; singleProbeFamily: 'accept' | 'reject';
};
export type FamilyVerdict =
  | { status: 'accept' }
  | { status: 'reject'; details: { alpha: number; rejected: readonly unknown[]; ordered: readonly unknown[] } }
  | { status: 'not-evaluated'; reason: string };
type Composition = {
  startedAt: string; writtenAt: string; commit: string | null; node: string; chromium: string;
  names: readonly string[]; titleToEntry: Readonly<Record<string, string>>;
  ledger: readonly LedgerRow[]; ledgerFailures: readonly LedgerFailure[];
  probeResults: ReadonlyMap<string, ProbePResult>;
  diagnosticResults: ReadonlyMap<string, DiagnosticResult>;
  floor?: ReturnType<typeof composeFloor>;
  family: FamilyVerdict;
};
type TimingEntry = {
  name: string; kind: string; sequence: number | null;
  status: 'measured' | 'missing' | 'error'; reason?: string;
  startedAt?: string; endedAt?: string; durationMs?: number;
  result?: ProbePResult; hardClause?: 'pass' | 'fail'; singleProbeFamily?: 'accept' | 'reject';
  biasMicroseconds?: number; biasPlacement?: string; batch?: number;
} & Partial<ReturnType<typeof composeFloor>>;

export function classifyFamilyError(error: unknown): FamilyVerdict {
  if (error instanceof Error && error.name === 'ProbeFamilyError' && 'details' in error) {
    const details = error.details;
    if (typeof details === 'object' && details !== null && 'alpha' in details
      && typeof details.alpha === 'number' && Number.isFinite(details.alpha)
      && 'rejected' in details && Array.isArray(details.rejected)
      && 'ordered' in details && Array.isArray(details.ordered)) {
      return { status: 'reject', details: { alpha: details.alpha,
        rejected: details.rejected, ordered: details.ordered } };
    }
  }
  return { status: 'not-evaluated', reason: errorMessage(error) };
}

export function composeFloor(results: readonly FloorResult[]) {
  const rejected = results.filter((result) => result.singleProbeFamily === 'reject');
  return {
    floorMicroseconds: rejected.length ? Math.min(...rejected.map((result) => result.microseconds)) : null,
    magnitudes: [4, 8, 16, 32],
    results: results.map(({ microseconds, pValue, medianDiffMs, singleProbeFamily }) =>
      ({ microseconds, pValue, medianDiffMs, singleProbeFamily })),
  };
}

export function composeTimingSidecar(input: Composition) {
  const otherTests = [...input.ledger, ...input.ledgerFailures]
    .filter(({ task }) => !input.names.includes(entryName(task, input))).length;
  return {
    schema: 'timing-2-probes/1', complete: true, startedAt: input.startedAt, writtenAt: input.writtenAt,
    partitionDurationMs: Date.parse(input.writtenAt) - Date.parse(input.startedAt), otherTests,
    commit: input.commit, node: input.node, chromium: input.chromium, pairs: 500, warmup: 20, alpha: 0.01,
    entries: input.names.map((name) => composeEntry(name, input)), family: input.family,
  };
}

function entryName(task: TimingTask, input: Composition): string {
  return input.titleToEntry[task.name] ?? task.name;
}

function composeEntry(name: string, input: Composition): TimingEntry {
  const row = input.ledger.find(({ task }) => entryName(task, input) === name);
  const failure = row ? undefined : input.ledgerFailures.find(({ task }) => entryName(task, input) === name);
  const recorded = input.diagnosticResults.get(name);
  const result = input.probeResults.get(name) ?? recorded?.result;
  const task = row?.task ?? failure?.task;
  const payload = name === 'sensitivity-floor' ? input.floor
    : result ? { result: rawResult(result), hardClause: recorded?.hardClause ?? hardClause(result),
      ...(recorded ? { singleProbeFamily: recorded.singleProbeFamily } : {}) } : {};
  return {
    name, ...entryMetadata(name), sequence: row?.sequence ?? failure?.sequence ?? null,
    ...taskTiming(task), ...payload,
    ...entryStatus(row, failure, name === 'sensitivity-floor' ? input.floor !== undefined : result !== undefined),
  };
}

function entryStatus(
  row: LedgerRow | undefined, failure: LedgerFailure | undefined, recorded: boolean,
): Pick<TimingEntry, 'status' | 'reason'> {
  if (failure) return { status: 'error', reason: 'ledger-failed' };
  if (!row) return { status: 'missing', reason: 'not reached' };
  const result = row.task.result;
  if (result?.state === 'fail') return { status: 'error', reason: result.errors?.[0]?.message ?? '' };
  if (result?.state !== 'pass') return { status: 'missing', reason: result?.state ?? 'not reached' };
  return recorded ? { status: 'measured' } : { status: 'missing', reason: 'result not recorded' };
}

function taskTiming(task: TimingTask | undefined) {
  const start = task?.result?.startTime;
  const durationMs = task?.result?.duration;
  return {
    ...(start === undefined ? {} : { startedAt: new Date(start).toISOString() }),
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(start === undefined || durationMs === undefined ? {}
      : { endedAt: new Date(start + durationMs).toISOString() }),
  };
}

function rawResult(result: ProbePResult): ProbePResult {
  return {
    pValue: result.pValue, z: result.z, effectSize: result.effectSize, medianDiffMs: result.medianDiffMs,
    p95AMs: result.p95AMs, p95BMs: result.p95BMs,
    differencesMs: result.differencesMs, aSamplesMs: result.aSamplesMs, bSamplesMs: result.bSamplesMs,
  };
}

function hardClause(result: ProbePResult): 'pass' | 'fail' {
  try { assertProbeHardClause(result); return 'pass'; }
  catch { return 'fail'; }
}

function entryMetadata(name: string) {
  if (name === 'tripwire-batched-injected-bias-control') {
    return { kind: 'control-synthetic', biasMicroseconds: 2, biasPlacement: 'per-call', batch: 64 };
  }
  if (name === 'sensitivity-floor') return { kind: 'sensitivity-floor' };
  if (name.endsWith('-aa')) return { kind: 'twin-aa' };
  if (name.endsWith('-sham')) return { kind: 'twin-sham' };
  if (name === 'tripwire-real-click-bias-250us' || name === 'tripwire-real-click-bias-1000us') {
    return { kind: 'control-real-click', biasMicroseconds: name.endsWith('-250us') ? 250 : 1000,
      biasPlacement: 'per-sample' };
  }
  return { kind: 'gated' };
}

export async function readTimingCommit(root: string): Promise<string | null> {
  try {
    const git = join(root, '.git');
    const head = (await fs.readFile(join(git, 'HEAD'), 'utf8')).trim();
    if (/^[a-f0-9]{40}$/u.test(head)) return head;
    if (!/^ref: refs\/[\w/.-]+$/u.test(head)) return null;
    const ref = head.slice(5);
    try {
      const loose = (await fs.readFile(join(git, ref), 'utf8')).trim();
      return /^[a-f0-9]{40}$/u.test(loose) ? loose : null;
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') return null;
    }
    const packed = await fs.readFile(join(git, 'packed-refs'), 'utf8');
    const line = packed.split('\n').find((line) => line.split(' ')[1] === ref);
    const sha = line?.split(' ')[0];
    return sha && /^[a-f0-9]{40}$/u.test(sha) ? sha : null;
  } catch { return null; }
}

export async function writeTimingSidecar(path: string, record: { startedAt: string; [key: string]: unknown }): Promise<void> {
  const temporary = join(dirname(path), `.${process.pid}-${randomUUID()}.timing-2.tmp`);
  try {
    await fs.writeFile(temporary, JSON.stringify(record) + '\n');
    await fs.rename(temporary, path);
  } catch (error) {
    try { await fs.rm(temporary, { force: true }); }
    catch (cleanupError) { console.error(cleanupError); }
    await writeIncompleteTimingSidecar(path, record.startedAt, error);
  }
}

export async function writeIncompleteTimingSidecar(path: string, startedAt: string, error: unknown): Promise<void> {
  console.error(error);
  try {
    await fs.writeFile(path, JSON.stringify({ schema: 'timing-2-probes/1', complete: false,
      startedAt, writeError: errorMessage(error) }) + '\n');
  } catch (writeError) { console.error(writeError); }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
