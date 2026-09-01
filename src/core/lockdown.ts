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
  isSameIdentity(left: ControlIdentity, right: ControlIdentity): boolean;
}>;

export const INVALID_CONTROL_IDENTITY_MESSAGE = 'Invalid or stale control identity';
