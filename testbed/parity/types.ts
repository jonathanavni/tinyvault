import type { Browser } from '../../src/browser/playwright';
import type { FixtureArchitecture, FixtureReachability, UnauthorizedRequest } from '../fixtures/transport';
import type { FixtureId } from '../scenarios/types';

/** Structural observations; object identity, never URL matching, binds callbacks. */
export interface RequestObservation {
  url(): string;
  method(): string;
  redirectedFrom(): RequestObservation | null;
  headersArray(): Promise<{ name: string; value: string }[] | null>;
}
export interface ResponseObservation {
  request(): RequestObservation;
  status(): number;
  headersArray(): Promise<{ name: string; value: string }[] | null>;
}
export type ParityRunIdentity = Readonly<{ scenario: string; agent: string; runIndex: number }>;
export type ParityRunDescriptor = ParityRunIdentity & Readonly<{
  runId: string; canary: string; canaryId: string; nonce: string;
  vaultPath: string; keyPath: string; transcriptPath: string; eventsPath: string;
}>;
export type HeaderObservation = Readonly<{ state: 'present'; entries: readonly Readonly<{ name: string; value: string }>[] }>
  | Readonly<{ state: 'missing' | 'timeout' | 'closed' }>;
type WireIdentity = Readonly<{ eventIndex: number; contextId: number; requestId: number }>;
export type WireEvent = WireIdentity & (
  Readonly<{ kind: 'request'; url: string; method: string; redirectedFrom: number | null; headers: HeaderObservation }>
  | Readonly<{ kind: 'response'; status: number; headers: HeaderObservation }>
  | Readonly<{ kind: 'failure'; category: 'request-failed' }>);
export type ParityRunSnapshot = Readonly<{
  descriptor: ParityRunDescriptor;
  /** Absent only for the explicit wire-disabled collector. */
  wire?: readonly WireEvent[];
  unauthorizedRequests: readonly UnauthorizedRequest[];
}>;
export type FixtureProvenance = Readonly<{
  fixtureId: FixtureId; architecture: FixtureArchitecture; reachability: FixtureReachability;
  originRoles: Readonly<{ C: string; L?: string }>;
}>;
export type ParityProvenance = Readonly<Partial<Record<FixtureId, FixtureProvenance>>>;
export interface ParityCollector {
  /** Trusted capture interval excludes fixture construction and teardown. */
  captureStarted?(): void;
  captureCompleted?(): void;
  beginRun(descriptor: ParityRunDescriptor, browser: Browser): Browser;
  endRun(descriptor: ParityRunDescriptor): Promise<void>;
  collectUnauthorized(descriptor: ParityRunDescriptor, requests: readonly UnauthorizedRequest[]): void;
  snapshots(): readonly ParityRunSnapshot[];
}
