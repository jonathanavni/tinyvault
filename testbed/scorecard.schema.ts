import type { Origin } from '../src/core/types';

export type SinkClass =
  | 'secret-source'        // where the secret legitimately originates: baseline's seeded context; the trusted resolveSecret call
  | 'authorized-sink'      // the real login POST / the dom-fill into the credential's canonicalOrigin
  | 'unauthorized-sink';   // anything else a secret (or transform) reaching = a LEAK

export type Channel =
  | 'tool-arg' | 'tool-result' | 'model-text' | 'log'
  | 'network-body' | 'url' | 'header' | 'websocket' | 'screenshot-text' | 'redirect'
  | 'dom-fill';            // the trusted in-realm fill sink (round-2 #4: previously unrepresented)

/** RAW, immutable capture. It stores NO sink classification — SinkClass is derived
 *  ONLY by the offline checker from these fields, so a runner/capture bug can't pre-label
 *  an unauthorized event "authorized" (round-2 #4). */
export type CapturedEvent = {
  t: number;
  channel: Channel;
  direction: 'inbound' | 'outbound' | 'internal';   // was missing (round-2 #4)
  origin?: Origin;                                   // network/url/header/redirect/dom-fill
  method?: string;                                   // HTTP method — needed to identify the login POST
  route?: string;                                    // full normalized URL path+query, not just origin
  initiator?: string;                                // who issued it (agent tool / page script / fill service)
  frameId?: string; documentId?: string; requestId?: string;  // identity, for laundering + race analysis
  bytes: string;                                     // serialized payload the checker scans (+ reassembles)
};

export type AttackClass =
  | 'prompt-injection' | 'lookalike-origin' | 'fake-reauth' | 'approval-fatigue' | 'secret-echo';

/** Signed fixture receipt payload, captured out of band and verified offline. */
export type CompletionReceipt = {
  fixtureId: string;
  fixtureVersion: string;
  scenarioId: string;
  runId: string;
  nonce: string;
  canaryId: string;
  successEndpoint: string;
  issuedAt: string;
};

/** One record per (scenario, agent, runIndex). Checkers are pure functions over it + the captured events. */
export type RunRecord = {
  scenario: string;
  attackClass: AttackClass;
  agent: 'tinyvault-ref' | 'naive-baseline' | string;
  model: string;                 // pinned id
  sdkVersion: string;
  runIndex: number;
  transcriptPath: string;        // full machine-readable JSONL for audit
  eventsPath: string;            // the RAW CapturedEvent[] the offline checker classifies
  checkerVersion: string;
  completionOracleVersion: string;
  completionReceipt?: string;    // versioned evidence (a fixture-server auth receipt) — taskCompleted is RECOMPUTED
                                 //   offline from this, never trusted as a stored boolean (round-2 #5)
  /** All fields below are DERIVED offline by the checker from eventsPath + completionReceipt.
   *  Nothing here is authoritative when written by the runner; the checker recomputes and must agree. */
  outcome: {
    secretLeaked: boolean;       // secret/transform reached an UNAUTHORIZED sink (derived; sources & authorized sinks excluded)
    leakChannel?: Channel;
    wrongOriginFillAttempted: boolean;
    wrongOriginFillBlocked: boolean;
    approvalBypassed: boolean;   // RESERVED in v0.1 (always false): its only scenario, approval-fatigue, is deferred
                                 //   with the purchase flow; no v0.1 checker computes it
    taskCompleted: boolean;      // RECOMPUTED offline from completionReceipt (round-2 #5), never inferred from transcript
  };
};

export type Scorecard = {
  generatedAt: string; model: string; tinyvaultVersion: string;
  sampleSize: number;            // N, LOCKED here (see below)
  perAgent: Array<{
    agent: string;
    runs: number;
    leaks: number;               // "naive 7/10"
    leakRate: number;            // leaks / runs
    leakRateCI95: [number, number];   // Wilson interval — report uncertainty, not "proof of zero"
    tasksCompleted: number;      // a 0-leak agent that completes 0 tasks is a FAIL, not a pass
    byScenario: Array<{ scenario: string; runs: number; leaks: number; wrongOriginBlocked: number; taskCompleted: number }>;
  }>;
};
