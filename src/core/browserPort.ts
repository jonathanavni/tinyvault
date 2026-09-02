// The browser-side port the fill service drives. Owned by the core so that `src/core` never imports
// `src/browser` (M4 amendment, register Y2-12): the session owner in `src/browser` implements these types;
// the fill service only consumes them. No type here can carry a secret value.

import type { ControlIdentity } from './lockdown';
import type { Secret } from './redaction';
import type { Origin } from './types';

/** The ONE home for the secret-length bound. A conforming backend never holds a longer secret (local-file enforces it). */
export const MAX_SECRET_CODE_UNITS = 4096;

export type InjectOutcome =
  | Readonly<{ assigned: true; observedOrigin: Origin; controlToken: string | null; documentToken: string | null }>
  | Readonly<{ assigned: false; reason: 'origin'; observedOrigin: Origin | null }>   // the origin the realm saw at decision time
  | Readonly<{ assigned: false; reason: 'identity' | 'too-long' | 'transport' }>;  // 'transport': the call rejected; node stays tainted

export type PinnedDestination = Readonly<{
  identity: ControlIdentity;
  /** The single consume() site lives behind this. Never rejects. */
  inject(secret: Secret, expectedOrigin: Origin): Promise<InjectOutcome>;
}>;

export type PinOutcome =
  | Readonly<{ kind: 'pinned'; destination: PinnedDestination }>
  | Readonly<{ kind: 'no-password-control' }>
  | Readonly<{ kind: 'cross-origin-frame' }>;

/** `path` is origin + pathname only. Both null when the top-level document has no bare HTTP(S) origin. */
export type TopObservation = Readonly<{ origin: Origin | null; path: string | null }>;

export type FillDestinationPort = Readonly<{
  documentEpoch(): number;
  /** TOTAL: never rejects; `{ origin: null, path: null }` on any failure. */
  observeTop(): Promise<TopObservation>;
  /** Never rejects; any internal failure is `no-password-control`. */
  pinPasswordDestination(selector: string): Promise<PinOutcome>;
}>;

export type SessionHostErrorKind = 'unknown-session' | 'closing' | 'reentrant';

const SESSION_HOST_MESSAGES = Object.freeze({
  'unknown-session': 'Session is unknown or closed',
  closing: 'Session is closing',
  reentrant: 'Session operation re-entered its own mutex',
} satisfies Record<SessionHostErrorKind, string>);

/** Closed session-host failure; fixed message per kind, no free text. */
export class SessionHostError extends Error {
  readonly kind: SessionHostErrorKind;

  constructor(kind: SessionHostErrorKind) {
    super(SESSION_HOST_MESSAGES[kind]);
    this.name = 'SessionHostError';
    this.kind = kind;
  }
}

export interface SessionHost {
  /**
   * Runs `op` under the session's mutex and hands it a FROZEN object whose own keys are exactly the three
   * FillDestinationPort methods (never the wider browser-control surface). Throws SessionHostError.
   */
  runExclusive<T>(sessionId: string, op: (port: FillDestinationPort) => Promise<T>): Promise<T>;
}
