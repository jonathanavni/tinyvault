import type { CredentialPolicy, Handle, ItemMeta } from '../core/types';
import type { Secret } from '../core/redaction';

export type BackendStatus =
  | Readonly<{ available: true }>
  | Readonly<{
    available: false;
    reason: 'not_installed' | 'not_authenticated' | 'locked' | 'error';
  }>;

export type BackendErrorKind =
  | 'not-found'
  | 'locked'
  | 'auth-expired'
  | 'unavailable'
  | 'integrity';

const ERROR_MESSAGES = Object.freeze({
  'not-found': 'Credential was not found',
  locked: 'Credential backend is locked',
  'auth-expired': 'Credential backend authentication expired',
  unavailable: 'Credential backend is unavailable',
  integrity: 'Credential integrity check failed',
} satisfies Record<BackendErrorKind, string>);

/** A closed backend error with no caller-controlled or native exception text. */
export class BackendError extends Error {
  readonly kind: BackendErrorKind;

  constructor(kind: BackendErrorKind) {
    super(ERROR_MESSAGES[kind]);
    this.name = 'BackendError';
    this.kind = kind;
  }
}

export interface CredentialBackend {
  /** Returns availability without rejecting and without resolving any secret. */
  probeAvailability(): Promise<BackendStatus>;
  /** Returns metadata only. */
  listItems(): Promise<readonly ItemMeta[]>;
  /** Returns trusted-side policy metadata, deeply frozen. */
  resolvePolicy(handle: Handle): Promise<CredentialPolicy>;
  /** Resolves only the policy the caller already authorized. */
  resolveSecret(handle: Handle, authorizedPolicy: CredentialPolicy): Promise<Secret>;
  /** Drops backend auth-session material only; conforming backends never retain a secret. */
  dispose(): Promise<void>;
}
