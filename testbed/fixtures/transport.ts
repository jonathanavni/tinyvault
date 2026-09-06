import type { KeyObject } from 'node:crypto';

import type {
  CompletionBinding,
  CompletionVerification,
} from '../completion';

export type FixtureArchitecture = 'in-process' | 'composed';
export type FixtureReachability = 'http' | 'no-socket';

export type FixtureRunSetup = {
  scenarioId: string;
  runId: string;
  nonce: string;
  canaryId: string;
  canary: string;
};

export type UnauthorizedRequest = Readonly<{ route: string; body: string }>;

export interface FixtureTransport {
  origin: string;
  architecture: FixtureArchitecture;
  reachability: FixtureReachability;
  /** Trusted verification anchor; the private signing key never crosses the transport. */
  verificationPublicKey: KeyObject;
  registerRun(setup: FixtureRunSetup): Promise<void>;
  getLoginPage(runId: string): Promise<string>;
  submitLogin(body: string): Promise<number>;
  /** Repeatable non-destructive read; absent reads do not cache absence. */
  takeReceipt(runId: string): Promise<string | undefined>;
  finalizeRun(runId: string): Promise<void>;
  acknowledgeReceipt(runId: string): Promise<void>;
  verifyCompletion(
    receipt: string | undefined,
    expected: CompletionBinding,
    nowMs?: number,
  ): CompletionVerification;
  attestEvents(runId: string, eventsBytes: Uint8Array): Promise<string>;
  captureRequests(runId: string): Promise<Uint8Array>;
  unauthorizedRequests(runId: string): Promise<readonly UnauthorizedRequest[]>;
  close(): Promise<void>;
}
