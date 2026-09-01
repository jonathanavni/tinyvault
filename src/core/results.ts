import type { FieldRole, FillResult, SetupReason } from './types';

export type FillFailureReason = Extract<FillResult, { ok: false }>['reason'];
export type FilledResult = Extract<FillResult, { ok: true }>;
export type FailedResult = Extract<FillResult, { ok: false }>;

export type FilledResultProvenance = Readonly<{ requestedRoles: readonly FieldRole[] }>;
export type FailedResultProvenance = Readonly<{ reason: FillFailureReason }>;
export type SetupResultProvenance = Readonly<{ reason: SetupReason }>;

const SETUP_INSTRUCTIONS: Readonly<Record<SetupReason, string>> = Object.freeze({
  missing_item: 'Set up the requested credential in TinyVault, then retry.',
  backend_locked: 'Unlock the TinyVault credential backend, then retry.',
  backend_unavailable: 'Restore the TinyVault credential backend, then retry.',
});

/** `filled` preserves first-requested order and removes duplicates; no trusted policy is accepted. */
export function createFilledResult({ requestedRoles }: FilledResultProvenance): FilledResult {
  const filled = [...new Set(requestedRoles)];
  return Object.freeze({ ok: true, filled: Object.freeze(filled) }) as FilledResult;
}

export function createFailedResult({ reason }: FailedResultProvenance): FailedResult {
  return Object.freeze({ ok: false, reason });
}

export function createSetupResult({ reason }: SetupResultProvenance): Readonly<{ instruction: string }> {
  return Object.freeze({ instruction: SETUP_INSTRUCTIONS[reason] });
}
