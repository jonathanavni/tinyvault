import type { FieldRole, FillResult, SetupReason } from './types';

export type FillFailureReason = Extract<FillResult, { ok: false }>['reason'];
export type FilledResult = Extract<FillResult, { ok: true }>;
export type FailedResult = Extract<FillResult, { ok: false }>;

export type FilledResultProvenance = Readonly<{ requestedRoles: readonly FieldRole[] }>;
export type FailedResultProvenance = Readonly<{ reason: FillFailureReason }>;
export type SetupResultProvenance = Readonly<{ reason: SetupReason }>;

export const INVALID_RESULT_PROVENANCE_MESSAGE = 'Invalid result provenance';

const FIELD_ROLES: ReadonlySet<string> = Object.freeze(new Set<FieldRole>([
  'username',
  'password',
  'totp',
]));

const FAILURE_REASONS: ReadonlySet<string> = Object.freeze(new Set<FillFailureReason>([
  'origin-not-authorized',
  'handle-unavailable',
  'handle-exhausted',
  'locked-field',
  'no-password-control',
  'cross-origin-frame',
  'session-unknown',
  'backend-error',
]));

const SETUP_INSTRUCTIONS = Object.freeze(Object.assign(Object.create(null) as Record<SetupReason, string>, {
  missing_item: 'Set up the requested credential in TinyVault, then retry.',
  backend_locked: 'Unlock the TinyVault credential backend, then retry.',
  backend_unavailable: 'Restore the TinyVault credential backend, then retry.',
} satisfies Record<SetupReason, string>));

/** `filled` preserves first-requested order and removes duplicates; no trusted policy is accepted. */
export function createFilledResult({ requestedRoles }: FilledResultProvenance): FilledResult {
  const filled = [...new Set(
    Array.isArray(requestedRoles)
      ? requestedRoles.filter((role): role is FieldRole => typeof role === 'string' && FIELD_ROLES.has(role))
      : [],
  )];
  return Object.freeze({ ok: true, filled: Object.freeze(filled) }) as FilledResult;
}

export function createFailedResult({ reason }: FailedResultProvenance): FailedResult {
  if (typeof reason !== 'string' || !FAILURE_REASONS.has(reason)) return invalidProvenance();
  return Object.freeze({ ok: false, reason });
}

export function createSetupResult({ reason }: SetupResultProvenance): Readonly<{ instruction: string }> {
  if (typeof reason !== 'string' || !Object.hasOwn(SETUP_INSTRUCTIONS, reason)) {
    return invalidProvenance();
  }
  return Object.freeze({ instruction: SETUP_INSTRUCTIONS[reason] });
}

function invalidProvenance(): never {
  throw new Error(INVALID_RESULT_PROVENANCE_MESSAGE);
}
