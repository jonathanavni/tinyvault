declare const controlIdentityBrand: unique symbol;

export type ControlIdentity = Readonly<{ [controlIdentityBrand]: true }>;

export type ControlIdentityCoordinates = Readonly<{
  sessionId: string;
  documentId: string;
  frameId: string;
  elementId: string;
}>;

export type ControlIdentityMintAuthority = Readonly<{
  mint(coordinates: ControlIdentityCoordinates): ControlIdentity;
}>;

/** Data-plane capability: deliberately excludes every lifecycle clear operation. */
export type LockdownRegistry = Readonly<{
  lock(identity: ControlIdentity): void;
  isLocked(identity: ControlIdentity): boolean;
}>;

/**
 * Control-plane lifecycle for the registry. Lives in the core so the data-plane session owner can name the
 * type without an import edge into `src/supervisor` (M4 amendment, register R2-4); only the supervisor's
 * composition root ever holds an implementation.
 */
export type LockdownLifecycle = Readonly<{
  clearOnTrustedTopLevelNavigation(sessionId: string): void;
  clearOnSessionClose(sessionId: string): void;
}>;

export const INVALID_CONTROL_IDENTITY_MESSAGE = 'Invalid or stale control identity';

/** Thrown for a forged, cross-domain, stale, or closed-session identity. Fixed message, no free text. */
export class InvalidControlIdentityError extends Error {
  constructor() {
    super(INVALID_CONTROL_IDENTITY_MESSAGE);
    this.name = 'InvalidControlIdentityError';
  }
}
