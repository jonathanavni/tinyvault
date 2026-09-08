# S6 companion packet — explicit `evidence-oversized` diagnostic at trusted run finalization (v4.3 — as implemented through fix round 2)

Status: **v4 implementation handoff (owner, 2026-09-08, session `2026-09-08-s6`) — pre-implementation paper ladder CLOSED at the
three-round cap.** v1: Sol R1 NO-SHIP (5 P1 / 4 P2); v2: Sol R2 NO-SHIP (4 P1 / 3 P2 / 1 P3); v3: Sol R3 (cap) NO-SHIP on one P1
(`…/oversize-packet-sol-r3.md`: the shared fixture's public `attestEvents` is also the container control path, so a guard there
would change the raw wire result). v4 resolves it by **narrowing** — one trusted guard in the runner, no transport touched —
per the convention "when a channel beats the same invariant three rounds running, narrow the claim before adding code"; the R3
residuals are recorded in §12. No fourth paper round; the post-implementation ladder is the check. Ladder from here: Astra implementation in an
isolated worktree (full ladder: admission/diagnostic surface) → owner `make test` + owner mutant reproductions → post-impl Codex
adversarial review, fresh Claude QA, fresh Claude security pass → three-round fix cap. Sequenced **before** the AM12 cap
implementation (`docs/m6-am12-implementation-packet.md`) and before any post-AM12 pilot (user-approved 2026-09-08).

## 1. Task

When the trusted runner cannot attest a real run because its raw events file exceeds the cap, record the failure with a fixed,
non-inferred reason — `evidence-oversized` — on the run's sidecar, on the persisted failed-run record (as runner-authored
diagnostic annotation), in the trusted diagnostic written at termination, and in the cohort's qualification reasons; and stop
the capture loop before any further run is registered once the composed project has been torn down, so the cohort-level reason
is the initiating failure, never a later `bridge-closed`. **What is admitted does not change**: an oversized run stays
unqualified with `acceptedOutcome: null`, never credits a cell, never enters aggregation; expected N is retained. Cap values are
AM12's and are **not** touched here.

## 2. Why (evidence, verified against code by three reviewers)

S6 pilot attempt 1 (`…/e9-step3-pilot/`): a 132,056-byte events file against the 131,072 cap. Path: the public composed
transport rejects locally inside `administrative` (`testbed/docker/composedFixtures.ts:89-95`, `BridgeError('control-limit')`) →
`administrative` maps every non-`bridge-closed` `BridgeError` to `ComposedConstructionError('bridge-protocol')`, awaits project
teardown, throws (`:22-37`) → `runOnce` catches, clears the attestation, sets `capture-failed`, writes the generic sidecar
`{execution-failed, unclassified}` (`testbed/runnerExecution.ts:104-110`) and returns the failed row **in memory only** → the loop
starts the next run (`testbed/runner.ts:282-301`) → its `registerRun` (`runnerExecution.ts:176-178`) hits the closed project and
throws `bridge-closed` (`composedFixtures.ts:22-29`) → the outer catch (`runner.ts:158-166`) formats that later exception as the
cohort reason and writes a diagnostic with `runs: []`; because the loop never finished, `persistOfflineInputs` (`runner.ts:303`)
never ran, so attempt 1 has no `runs.captured.json` / `offline-evidence.json`. `bridge-closed` at cohort level is produced by any
project-closing administrative failure and cannot distinguish an oversize from a transport fault.

## 3. Design (owner-fixed; Astra implements exactly this, STOP on any need to deviate)

**D1 — Carrier and guard site: one trusted guard in the runner; transports untouched (R3 P1-01).** New module
`testbed/evidenceOversize.ts` exporting `class EvidenceOversizedError extends Error { readonly runId: string; readonly byteLength:
number; readonly cap: number; teardownCode?: ConstructionCode }` (constructor `new EvidenceOversizedError({ runId, byteLength, cap },
message = 'evidence-oversized')`, the optional message for W7 only), `isEvidenceOversized(value: unknown)`, plus
`markClosedProject(error: object): void` / `isClosedProjectError(value: unknown): boolean`; both predicates are backed by
module-private `WeakSet`s exactly like `BridgeError` (`testbed/docker/protocol.ts:50-70`) so shape or message cannot forge them;
prototypes frozen, instances mutable. **The guard lives in `runOnce` only:** at the two attest sites (`runnerExecution.ts:98` and
`:101-103`) the runner already reads the events bytes; it reads them **once**, and if `bytes.byteLength > MAX_EVENTS_BYTES`
(imported from `testbed/docker/protocol.ts`) it throws `EvidenceOversizedError` **instead of calling `fixture.attestEvents`** —
inside the same `try`, so the existing catch classifies it (D2). Finalize, receipt and capture have already succeeded at that
point, exactly as today, so evidence is preserved. This is transport-agnostic: composed, in-process and any test transport are
guarded identically without being changed.
- `testbed/docker/composedFixtures.ts:89-95` (the public composed pre-dispatch guard) and `testbed/fixtures/shared/loginFixture.ts:220`
  (the shared signer's `control-limit`) are **untouched** and remain defence-in-depth backstops with today's behaviour and today's
  pins (`composedFixtures.test.ts:330-341` still expects `bridge-protocol`; `slice5.attestation.test.ts:207-244` byte-for-byte
  unchanged, including the raw container refusal). The runner never reaches them with an oversized file.
- **Closed-project discriminator:** the composed `administrative` wrapper (`composedFixtures.ts:22-37`) calls
  `markClosedProject(cause)` on the error it is about to throw **after** its `close()` attempt (resolved or rejected;
  `teardownCode` retained exactly as today), for every administrative failure. Nothing else may mark. Existing pins stay green
  because the same object with the same `code` is thrown. Local errors such as `persistFixtureCapture`'s
  `ComposedConstructionError('capture-write')` (`captureTransfer.ts:80`) are never marked and stay non-terminal.
- Stub (non-real) runs: today `runOnce` rethrows any finalization error for `!realResult` (`runnerExecution.ts:105`); that stays —
  the typed error propagates to the cohort catch like any other stub failure (stub traces never approach the cap).
- `BRIDGE_CODES`, `CONSTRUCTION_CODES`, `protocol.ts`, `exec.ts`, `bridge.ts`, `handshake.ts`, `frames.ts`, container code,
  `loginFixture.ts`, `runner.testkit.ts`: **untouched**.

**D2 — Typed terminal signal; stop; persist the partial bundle as-is; trusted diagnostic.**
- `runOnce` (`runnerExecution.ts:104-110`) classifies the caught finalization error by **predicates only**:
  `isEvidenceOversized(error)` → sidecar `{status: 'execution-failed', reason: 'evidence-oversized', acceptedOutcome: null,
  byteLength, cap}`, terminal kind `evidence-oversized` (composed or in-process); else `isClosedProjectError(error)` → sidecar
  unchanged (`unclassified`), terminal kind `project-closed` with the initiating `code`; else (including `capture-write` and any
  unmarked error) → today's non-terminal behaviour. `runOnce` **constructs** the trusted diagnostic row itself (it owns identity
  and artifact paths): `RunOnceResult` gains `terminal?: { kind: 'evidence-oversized' | 'project-closed'; runId: string;
  code?: ConstructionCode; teardownCode?: ConstructionCode; row: RunDiagnostic; sidecarWriteFailed: boolean }` (R2 P1-03).
  The failed record (`FailedRunRecord`, `:50`) gains `failureReason?: 'evidence-oversized'` — **runner-authored diagnostic
  annotation, not attested** (§9 residual).
- `captureWithBrowser` (`runner.ts:284-301`): on a terminal result, push the record, **break out of all three loops**, call
  `persistOfflineInputs` with the rows captured so far (evidence is never discarded), then throw
  `EvaluationTerminatedError { kind, runId, attempted, expected, code?, teardownCode?, row: RunDiagnostic, sidecarWriteFailed,
  fixtureCloseFailure?: bounded details, cause }` (typed, WeakSet-registered like the other two, in the new module). **Teardown
  precedence (R2 P1-04):** on the terminal path `captureWithBrowser` closes the fixtures itself inside a `try/catch` **before**
  throwing, records any rejection as `fixtureCloseFailure` (bounded `executionErrorDetails`) on the terminal error, and sets a
  flag so the `finally` (`runner.ts:307-308`) does not call `closeFixtures` again (the composed close is cached and would
  re-reject); the typed terminal error therefore always reaches the cohort catch. **Persistence precedence (R3 P2-02):** the
  terminal-path `persistOfflineInputs` call is likewise wrapped; on rejection set `persistFailed: bounded details` on the terminal
  error and still throw it (evidence on disk is whatever was written; the reason is never replaced). Non-terminal paths keep today's `finally`
  rethrow unchanged. The cohort catch uses **only the payload** — no filesystem re-derivation. Offline replay of that partial bundle remains a **cohort-level inventory failure exactly as today**
  (`evaluationProvenance.ts:190-225`, `SCHEMA.md:360-370`) — this packet does **not** make offline adjudication emit per-run
  reasons for partial cohorts, and `offline.ts:212` is **not** changed.
- The cohort catch (`runner.ts:158-166`): when the error is `EvaluationTerminatedError`, write `diagnostic.json` from the
  trusted in-memory result — `status: 'unqualified'`, `verifiedRuns: []`, `runs: [<the terminal row as RunDiagnostic>]`
  (`{status: 'execution-failed', reason: 'evidence-oversized', acceptedOutcome: null}` for oversize; for `project-closed` the
  existing `{execution-failed, unclassified}`), `missingPositiveControlCells`: every expected cell, `cohortFailure: 'unclassified'`
  (**not widened**, Sol C1) — and `qualification.reasons` = `['evidence-oversized: <runId>', 'cohort-incomplete: <attempted> of
  <expected> runs attempted']` (for `project-closed`: `['execution-failed: ComposedConstructionError: <initiating code>',
  'cohort-incomplete: …']`), plus `sidecar-write-failed: <runId>` when `sidecarWriteFailed`, plus `teardown-failed: <code-or-name>` (the `ConstructionCode`
  when the rejection carries one, else its bounded `name`; R3 P3-01) when `fixtureCloseFailure` is present, plus
  `persist-failed: <name>` when `persistFailed` is present. All other errors keep today's formatting.
- `RunDiagnostic` (`evaluationValidity.ts:90`) widens to `{ status: 'execution-failed'; reason: 'unclassified' | 'evidence-oversized' }`.
  `RunExecutionStatus` (`evaluationProvenance.ts:31`) and `OfflineValidationFailure` are **unchanged**.

**D3 — Sidecar-write failure is secondary** (Sol P1-04, R2 P2-02): wrap the `.fixture-failure.json` write; on failure keep the
terminal signal and the failed record, never register another run, never manufacture a record or outcome; set
`sidecarWriteFailed = true` on the terminal payload; best-effort write `${eventsPath}.fixture-failure-error.json` with
`{ sidecarError: executionErrorDetails(error) }` (mode 0o600, its own failure swallowed — the precedent is
`realAgentRun.ts:104-105`'s `.initial-snapshot-error.json`); the cohort catch adds `sidecar-write-failed: <runId>`.

**D4 — Closed-project rule** (Sol P1-05, R2 P1-01, R3 P2-01): D2's ordered classification governs — `isEvidenceOversized` first,
then `isClosedProjectError`; a non-oversize finalization error is terminal `project-closed` exactly when `isClosedProjectError(error)`,
i.e. it was thrown by the composed `administrative` wrapper after its teardown attempt. The
error class is never used as evidence of closure: `ComposedConstructionError('capture-write')` from `persistFixtureCapture`
(`captureTransfer.ts:80`), and any other unmarked error, stay non-terminal with today's behaviour. Oversize on any transport is
terminal via `isEvidenceOversized` (the runner guard). The retained reason is the initiating code; the run count is exactly the number attempted.

## 4. Locked requirements

- **R1** Reason is a fixed discriminated value produced at the byte-count site; never derived from a message (SCHEMA:355-358).
- **R2** Admission, credit, aggregation, expected N, `assertProvenanceAdmission`, strict adjudication, E5, `assertEvalPass`:
  unchanged. A forged `failureReason` / `reason` on any row cannot produce `verifiedRuns`, credit, a scorecard or aggregation.
- **R3** No `attest` frame is dispatched for an oversized file; the project is still torn down; exactly one `registerRun` in
  total (the terminal run's own) and none afterwards.
- **R4** The raw container refusal (`control-limit`, session closed) is unchanged and stays a separate witness.
- **R5** Wire vocabularies, `protocol.ts`, `exec.ts`, bridge/handshake/frames/container code: untouched.
- **R6** SCHEMA wording only, at `SCHEMA.md:372-375` (add `evidence-oversized` as an execution reason recorded by the trusted
  runner at termination; unknown errors stay `unclassified`) and `:360-370` (one sentence: a cohort terminated early persists
  its partial bundle, whose offline replay is an inventory failure; the trusted diagnostic written at termination carries the
  initiating reason). Both are outside every `TV-CLAIM-SPAN` (first span at `:471`); no claim row binds the reason set (Sol B).

## 5. Witnesses (each a named test; exact assertions)

- **W1a — command harness, loop-produced oversize** (`testbed/realAgentRun.test.ts`, top-level `it`, name
  `evidence-oversized command terminates after the first oversized real run without a second registration`): reuse the
  16-turn maximum-output shape of `:423-448` (loop-produced, no post-write editing) for the first real run; the synthetic
  transport in `runner.testkit.ts` is **unchanged** (it would sign anything — which is exactly why the runner guard, not the
  transport, is the witness). Assert: the synthetic `attestEvents` was **not called** for that run (spy); sidecar reason
  `evidence-oversized` with `byteLength` and `cap`; `runs.captured.json` exists with exactly one row carrying
  `failureReason: 'evidence-oversized'`, `outcome: null`, execution status `capture-failed`, empty attestation; `diagnostic.json`
  has that one run row with `reason: 'evidence-oversized'`, `verifiedRuns: []`, all six cells missing, `cohortFailure:
  'unclassified'`; `qualification.json` reasons equal `['evidence-oversized: <runId>', 'cohort-incomplete: 1 of 6 runs
  attempted']`; **`registerRun` called exactly once**; no `scorecard.json`; the command exits nonzero.
- **W1b — backstop pins untouched:** `composedFixtures.test.ts:330-341` and `slice5.attestation.test.ts:207-244` run green unchanged
  (they prove the transports still refuse an oversized direct call; the runner never makes one).
- **W2 — runner guard unit witness** (new `testbed/runnerExecution.oversize.test.ts`): drive `runOnce` with a minimal transport
  whose `attestEvents` is a spy: exact-cap events → `attestEvents` called once with those bytes and the run finalizes normally;
  cap+1 → `attestEvents` **never called**, result has `terminal.kind === 'evidence-oversized'` with the constructed `RunDiagnostic`
  row, the sidecar written, `failureReason` on the record. Both the stub path (`!realResult`: the typed error propagates) and the
  real path (terminal result) are covered.
- **W3 — closed-project rule** (`realAgentRun.test.ts`): a non-oversize composed finalization failure (synthetic transport throws
  a `ComposedConstructionError('bridge-protocol')` that the test has passed through `markClosedProject`, mirroring what
  `administrative` does) terminates with reasons
  `['execution-failed: ComposedConstructionError: bridge-protocol', 'cohort-incomplete: 1 of 6 runs attempted']` and one
  registration; the run's sidecar stays `unclassified`. **W3b:** the same error **unmarked** (e.g. a `capture-write`) is not
  terminal — the loop continues (six registrations, one close per fixture), the sidecar is `unclassified`, and the **offline
  diagnostic is today's**: `{status: 'capture-failed', reason: 'signature-mismatch'}` for the missing attestation
  (`offline.ts:154-155`) — do not assert `execution-failed/unclassified` there (Astra STOP 3, 2026-09-08). **W3c — teardown precedence:** the synthetic `close` rejects on the
  terminal path; the qualification still carries the initiating reason first and `teardown-failed: <code>`; no second close.
- **W4 — raw control refusal** (`slice5.attestation.test.ts:224-241`): untouched, run green.
- **W5 — sidecar-write precedence** (`realAgentRun.test.ts`): spy `writeFile` to fail only for the `.fixture-failure.json` path;
  terminal signal and reasons unchanged, `sidecar-write-failed: <runId>` added, one registration, no scorecard.
- **W6 — forged annotation, no credit** (`testbed/checkers/offline.test.ts` or `runner.realAgent.test.ts`): insert
  `failureReason: 'evidence-oversized'` into an otherwise valid/promotable persisted row and into a failed row; strict adjudication
  and diagnostics produce no `verifiedRuns`, no positive-control credit, no scorecard, no aggregation for the failed row, and
  the valid row's outcome is unaffected by the annotation (it is ignored on non-failed shapes). The failed row's offline
  diagnostic is whatever today's validators say (typically `capture-failed / signature-mismatch`); the annotation never changes it.
- **W7 — adversarial message negatives** (`offline.test.ts` / `realAgentRun.test.ts`): an unmarked `Error('evidence-oversized')`
  thrown from `attestEvents` is non-terminal (loop continues), its sidecar is `unclassified`, no `failureReason` annotation, and
  its offline diagnostic is today's `capture-failed / signature-mismatch` (missing attestation) — never `evidence-oversized`
  anywhere; a marked `EvidenceOversizedError` whose message is `'bridge-protocol'` yields `evidence-oversized` on every surface.

**Mutants (each an exact edit, red assertion named, restore byte-for-byte, green).** Restore proof: snapshot the uncommitted
implementation file before mutating (`cp` + sha256) and prove restoration with `cmp` / sha256 against that snapshot, not against
HEAD (the implementation itself is uncommitted).
M1 delete the runner guard (`runOnce` calls `attestEvents` regardless) → W1a red on the registration count (the synthetic
transport's `signEventsDigest` itself rejects > 131,072 with an unmarked `control-limit`, so the run becomes a non-terminal
`unclassified` failure and the loop continues to 6 registrations — Astra STOP 3 corrected the earlier "admitted / scorecard"
premise) and W2 red (`attestEvents` called at cap+1);
M1d delete the `markClosedProject` call in `administrative` → **W3d** red (W3 cannot see it: W3 mints its own mark — Astra STOP
2026-09-08). **W3d — production-administrative marking witness** (additive `it` in `testbed/docker/composedFixtures.test.ts`,
using its existing `realClient()` harness; no existing test in that file changes): after any administrative refusal (e.g. the
`local-events` case at `:161`, or a fresh `takeReceipt('../A')`), the rejected error satisfies `isClosedProjectError` and still
carries its original `code`; M1d makes that assertion red;
M1c in `runOnce`, replace `isEvidenceOversized(error)` with `false` → W1a red (sidecar `unclassified`);
M2 delete the loop `break` → W1a red (`registerRun` called twice);
M3 in `runOnce`, classify by `error.message === 'evidence-oversized'` instead of the predicate → W7 red (unmarked error becomes
oversized / marked error with another message stops being oversized);
M4 delete the `cohort-incomplete` reason → W1a red.

## 6. Scope — implement / do not implement

Implement D1–D4, W1a–W7, M1a–M4, R6 wording, and the docs sync in §8. Do **not**: change cap values; widen `RunExecutionStatus`,
`OfflineValidationFailure` or `cohortFailure`; alter `offline.ts:212` or any offline admission path; change `assertEvalPass`,
E5, scorecard, claim rows, any `TV-CLAIM-SPAN`; add retry/resample/continuation; touch `PLAN.md`, `docs/m6-review-findings.md`,
`.claude/`.

## 7. File ownership

Astra owns: `testbed/evidenceOversize.ts` (new) + `testbed/evidenceOversize.test.ts` (new: WeakSet forgery tests — a
shape-identical object is neither `isEvidenceOversized` nor `isClosedProjectError`; `markClosedProject` on a non-object is a no-op),
`testbed/docker/composedFixtures.ts` (the `markClosedProject` call in `administrative` only), `testbed/runnerExecution.ts`,
`testbed/runnerExecution.oversize.test.ts` (new), `testbed/runner.ts`, `testbed/evaluationValidity.ts` (+ its test if pins change),
`testbed/checkers/offline.test.ts` (W6/W7 only; not `offline.ts`), `testbed/realAgentRun.test.ts`, `testbed/runner.realAgent.test.ts`,
`SCHEMA.md:360-375` (wording), `docs/phase-0-plan.md:335-345` and `docs/m6-implementation-plan.md:506-523` (one synchronized
sentence each), `testbed/docker/composedFixtures.test.ts` (**additive only** — one new `it` for W3d; every existing test byte-for-byte
unchanged). **Untouched:** `loginFixture.ts`, `runner.testkit.ts`, `slice5.attestation.test.ts`,
`captureTransfer.ts`, `protocol.ts`, `exec.ts`, `bridge.ts`, `handshake.ts`, `frames.ts`, container code, `offline.ts`,
`evaluationProvenance.ts`.
STOP conditions: a structural pin (line counts, 800-line max, function-length) goes red — report, do not edit pins; a claim row or
`TV-CLAIM-SPAN` would need to change; any change to `protocol.ts`, `exec.ts`, `bridge.ts`, `handshake.ts`, `frames.ts`,
`offline.ts`, container code, or `evaluationProvenance.ts` seems necessary.

## 8. Verification (owner reruns all)

```
npx vitest run testbed/evidenceOversize.test.ts testbed/runnerExecution.oversize.test.ts
npx vitest run testbed/docker/composedFixtures.test.ts testbed/docker/slice5.attestation.test.ts
npx vitest run testbed/realAgentRun.test.ts testbed/runner.realAgent.test.ts testbed/checkers/offline.test.ts testbed/evaluationValidity.test.ts
npx vitest run testbed/parity/claims.test.ts
npm run typecheck
make test
```
Report `ASTRA-S6-OVERSIZE-REPORT.md` at the worktree root: files changed; W1a–W7 results; M1a–M4 red/green with the exact
assertion text and the byte-for-byte restore; `git diff --stat` limited to owned files; **Deviations From Handoff** mandatory;
STOP conditions hit.

## 9. Residuals (declared now)

- `failureReason` on a persisted failed row and the sidecar reason are runner-authored diagnostic data, not cryptographically
  attested (S5 residual 9 family): artifact tampering can change the displayed rejection label but cannot alter rejection,
  expected N, credit or aggregation (W6).
- Offline replay of an early-terminated partial bundle is a cohort-level inventory failure without per-run reasons; the
  initiating reason lives in the trusted diagnostic written at termination and in the retained sidecar/record.
- `project-closed` terminal for non-oversize composed failures reports the initiating code, which for transport faults may
  itself be non-unique (`bridge-protocol` covers several `BridgeError`s); finer transport classification is out of scope.
- (post-impl R1, recorded) `capturePersistedRuns` (`runner.ts:233-255`) propagates a raw `EvaluationTerminatedError` to external
  callers with `realInvocation` set — fail-closed, no trusted diagnostic written there (QA P3-02).
- (post-impl R1, recorded) A hostile page/model that inflates a run's evidence past the cap now halts the cohort at that run
  instead of failing one run and continuing; bounded — the cohort was unqualified either way, no credit/scorecard/N change —
  but later scenarios go unmeasured and the operator sees `cohort-incomplete: k of N` (security P3-02).
- (post-impl R1, recorded) Partial-bundle persistence is guaranteed only for the two terminal kinds; any other throw out of
  `runOnce` still leaves earlier rows unpersisted as before this slice (security P3-03).
- (post-impl R2, recorded) The two non-terminal `rejectComparison` callers (`runner.ts:205,213`) keep today's write-first ordering
  (diagnostic/qualification files before stderr emission); only the terminal path emits first and records a write failure as a
  secondary reason (fix round 2, F9). Pre-existing behaviour, out of this packet's scope.

## 10. Sol pre-implementation R1 dispositions (owner, 2026-09-08)

| Finding | Owner verification | Disposition |
| --- | --- | --- |
| P1-01 no legal carrier | Confirmed: `BRIDGE_CODES`/`CONSTRUCTION_CODES` closed and sanitized (`protocol.ts:2-10,50-70`; `exec.ts:21-48`). | ABSORBED — D1: trusted non-wire `EvidenceOversizedError` (WeakSet), thrown by both public transports before the signer; wire unchanged. |
| P1-02 early stop vs full-inventory gate | Confirmed (`runner.ts:282-305`, `evaluationProvenance.ts:190-225`, `offline.ts:83-89`). | ABSORBED — D2: persist partial bundle as-is; diagnostic from the trusted in-memory terminal result; offline replay stays an inventory failure; `offline.ts:212` untouched. |
| P1-03 W1 harness mocks the composed transport | Confirmed (`realAgentRun.test.ts:13-29`, `runner.testkit.ts:296-310`). | ABSORBED — W1a (command, with the D1 guard mirrored in the testkit) + W1b (real public client). |
| P1-04 sidecar write precedence | Confirmed (`runnerExecution.ts:104-110` has no secondary catch). | ABSORBED — D3, W5. |
| P1-05 contradictory closed-project policy | Confirmed. | ABSORBED — D4 single rule, W3 pins reason text and run count. |
| P2-01 persisted reason is not trusted authority | Accepted. | ABSORBED — wording, W6, §9 residual. |
| P2-02 W2 under-specified | Accepted. | ABSORBED — W2 file and assertions. |
| P2-03 mutants not isolated | Accepted. | ABSORBED — M1a–M4 exact edits; M3 as adversarial replacement with two-sided W7. |
| P2-04 ownership/docs incomplete | Accepted. | ABSORBED — §7, §8, R6 wording, docs sync lines. |
| C1 do not widen `cohortFailure` | Accepted. | ABSORBED — D2. |
| C2 record field over sidecar reread, not authority | Accepted. | ABSORBED — D2, §9. |
| C3 stop on any closed project | Accepted. | ABSORBED — D4. |

## 11. Sol pre-implementation R2 dispositions (owner, 2026-09-08)

| Finding | Owner verification | Disposition |
| --- | --- | --- |
| P1-01 `ComposedConstructionError` is not proof of closure (`capture-write` at `captureTransfer.ts:80`) | Confirmed. | ABSORBED — D1/D4: `markClosedProject` minted only in `administrative` after teardown; predicates only; W3b negative; M1d. |
| P1-02 `slice5.attestation.test.ts:207-220` necessarily changes | Confirmed. | ABSORBED — owned; W2 revised with non-consumption semantics; `:224-244` untouched. |
| P1-03 terminal payload cannot carry the row / sidecar bit | Confirmed (`runner.ts:159-166,253-305`). | ABSORBED — `runOnce` constructs the `RunDiagnostic`; payload carries row, `sidecarWriteFailed`, codes; no filesystem re-derivation. |
| P1-04 cached teardown rejection replaces the terminal error | Confirmed (`compose.ts:156-176`, `runner.ts:307-308,352-360`). | ABSORBED — D2 teardown precedence; `fixtureCloseFailure`; W3c. |
| P2-01 W7 message construction | Accepted. | ABSORBED — constructor message argument. |
| P2-02 secondary artifact unnamed | Accepted. | ABSORBED — D3 names `.fixture-failure-error.json`, shape, mode, best-effort. |
| P2-03 M1a shape-dependent | Accepted. | ABSORBED — guard/copy ordering pinned; M1a edit pinned. |
| P3-01 R3 wording | Accepted. | ABSORBED. |
| Unverified: grep pipeline excluded `testbed` | Accepted. | RECORDED — use `grep -v "\.test\."` in future prompts. |

## 12. Sol pre-implementation R3 (cap) dispositions (owner, 2026-09-08) — ladder closed

| Finding | Owner verification | Disposition |
| --- | --- | --- |
| P1-01 shared fixture guard also serves container control (`container/fixture.ts:36-48`, `control.ts:122-132`) | Confirmed. | RESOLVED BY NARROWING — the guard moves to `runOnce` (the runner already holds the bytes); no transport, testkit, container or pin changes; W1b/W2 restated; ownership shrunk. Recorded as the post-cap design change; the post-implementation ladder checks it. |
| P2-01 D4 `iff` vs D2 ordering | Accepted. | ABSORBED — D4 wording. |
| P2-02 partial-bundle persistence failure precedence | Accepted. | ABSORBED — D2 `persistFailed`, `persist-failed: <name>` reason. |
| P3-01 `teardown-failed: <code>` for non-coded rejections | Accepted. | ABSORBED — `<code-or-name>`. |

## 13. Post-implementation ladder — what shipped beyond §3–§5 (owner, 2026-09-08)

- **Fix round 1** (Codex R1 P1; QA/security R1 P3s): `RunTerminal` / `EvaluationTerminatedError` gained `scenarioCaptureWriteFailed?`
  and `causeName?`; the `.scenario-capture.txt` write is secondary only under a terminal result (best-effort
  `${eventsPath}.scenario-capture-error.json`, reason `scenario-capture-write-failed: <runId>`); the `.fixture-failure.json` write
  failure is swallowed only under a terminal result (non-terminal rethrows as at base); `code`/`teardownCode` are read only from a
  genuine `ComposedConstructionError`, and the `project-closed` reason is `execution-failed: <causeName>: <code | 'project-closed'>`;
  the guard `stat()`s before `readFile` (an oversized file is refused with zero event-path reads; the read buffer is re-checked
  and remains the single measured-and-signed buffer). Witnesses W8 (terminal + non-terminal scenario-capture write), W9 (generic
  sidecar failure loud), W10 (forged code on a marked plain Error), six W2 cases; mutants M5, M6 (retargeted at the F2 guard in
  round 2), M7.
- **Fix round 2** (Codex R2 P1; QA R2 P3s): terminal-path `rejectComparison` emits the stderr diagnostic first, then attempts both
  artifact writes independently, appends `diagnostic-write-failed: <file>: <name>` on rejection and re-emits, and always throws
  `UnqualifiedComparisonError`; non-terminal callers unchanged. Witnesses W11 (three write-rejection cases) and W11b (non-terminal
  path still loud); mutants M8, M9; W8-terminal pins the exact ordered reason list.
- Reason list order on the terminal path: initiating reason, `cohort-incomplete: k of N runs attempted`, then in order
  `scenario-capture-write-failed`, `sidecar-write-failed`, `teardown-failed: <code-or-name>`, `persist-failed: <name>`,
  `diagnostic-write-failed: <file>: <name>`.
