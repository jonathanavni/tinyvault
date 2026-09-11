import type { Handle } from './types';

/** Data-plane authority; reserving never suspends between checking and claiming a unit. */
export type FillAuthorization = Readonly<{
  reserve(handle: Handle): FillReservation | null;
}>;

/** Total, one-shot settlement: the first call wins; all subsequent calls do nothing. */
export type FillReservation = Readonly<{
  commit(): void;
  release(): void;
}>;

/** Trusted composer only. Never carried by a host or its tools. */
export type FillAuthorizationLifecycle = Readonly<{
  renew(handle: Handle): void;
}>;
