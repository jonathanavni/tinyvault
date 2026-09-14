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

const INVALID_BACKEND_ERROR_KIND_MESSAGE = 'Invalid backend error kind';

/** A closed backend error with no caller-controlled or native exception text. */
export class BackendError extends Error {
  readonly kind: BackendErrorKind;

  constructor(kind: BackendErrorKind) {
    if (typeof kind !== 'string' || !Object.hasOwn(ERROR_MESSAGES, kind)) {
      throw new Error(INVALID_BACKEND_ERROR_KIND_MESSAGE);
    }
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
  /** Resolves only the policy the caller already authorized.
   * Local-file checks current policy before decryption. Approved M9/D2 permits 1Password's
   * trusted CLI to decrypt a full item after admission, then checks identity/current policy
   * before Secret construction. Neither that fetch nor two separate reads prove an atomic
   * vendor snapshot. No credential plaintext is cached between calls.
   */
  resolveSecret(handle: Handle, authorizedPolicy: CredentialPolicy): Promise<Secret>;
  /** Drops owned auth/lifecycle state; backends must not retain credential plaintext.
   * 1Password additionally cancels its bounded children and removes its owned runtime tree.
   */
  dispose(): Promise<void>;
}
