# M6 S4 implementation handoff — quiescence and coverage qualification (DISPATCHED and ACCEPTED 2026-09-07 — `b0461f0`; fix-round packets and reviews in the local evidence archive named in the M6 register)

Status: drafted 2026-09-07 by the continuity owner after D-CANCEL resolved (`2bcfbbd`). Dispatch target:
Codex `task --write --model gpt-6-astra` (security-core lifecycle code; full ladder). Before dispatch: one
read-only Sol paper pass over this packet, then owner absorption. This file is the dispatch artifact; the
canonical scope is `docs/m6-implementation-plan.md` §7 (S4 row, D-CANCEL paragraph, S4 lifecycle target) and
§8 (E5/E6 mutant rows). Where this packet and the plan disagree, stop and cite both.

## Task

Implement M6 slice S4: trusted quiescence with real navigation cancellation (E6) and per-scenario capture
qualification (E5), exactly as scoped in the plan, using the D-CANCEL mechanism recorded in §7.

## Branch / worktree

Work in this checkout on `main`. Base commit is pinned AT DISPATCH by the owner in the dispatch message (the
packet text alone is not the pin); require `git rev-parse HEAD` to equal that pin and a clean tree before writing. Leave every change UNCOMMITTED; the owner commits with explicit paths after verification. Do
not stage, reset, switch branches, or touch inherited documents. `.git` and `mkdtemp` are EPERM in the Codex
sandbox: report tests you could not run as NOT RUN, never as passed or failed.

## Required reading (in this order)

- `CLAUDE.md`; `PLAN.md` Current State only.
- `docs/m6-implementation-plan.md`: §1 invariants, §5 (capture requirements table and residual table), §7 S4
  row + "D-CANCEL — RESOLVED" paragraph + "S4 lifecycle target" paragraphs, §8 verification order and the E5/E6
  mutant rows, amendments M6-AM04 and M6-AM05.
- `docs/m6-review-findings.md`: entry "D-CANCEL — resolution and evidence packet" (the numbers and the S4
  requirement list); nothing else is required.
- `src/browser/session.ts`, `src/core/sessionMutex.ts`, `src/supervisor/host.ts`, `src/supervisor/bodyCorrelation.ts`
  (read-only), `testbed/runnerExecution.ts`, `testbed/harnessGate.ts`, `testbed/coverage.ts`.
- Tests: `src/browser/session.test.ts`, `src/browser/session.transport.browser.test.ts`,
  `src/supervisor/host.test.ts`, `src/supervisor/host.evidence.test.ts`, `src/supervisor/host.browser.test.ts`,
  `testbed/runner.wiring.test.ts`, `testbed/coverage.test.ts`, `testbed/coverage.browser.test.ts`.
- `SCHEMA.md` M6 contract section (qualification output shape; read, do not edit).
- `.claude/memory/gotchas.md`: the two 2026-09-07 entries "A pending main-frame navigation wedges the page-level
  CDP session" and "A failed termination signal must not erase the original review failure"; the 2026-09-06
  entry on `ignoreBOM`. Do not load the rest of memory.
- Evidence scripts you may copy from as regression seeds (local ignored archive; ask the owner to place them in
  the checkout if absent): `artifacts/review-evidence/tinyvault-m6-d-cancel-20260907/exp6-supervised-stop.ts`,
  `exp7-post-blackhole.ts`, `exp8-hostile-variants.ts`, `exp9-deadline-abort.ts`.

## Context

- Observed defect: after a navigation to an unreachable (black-hole) host, `browser_close_session` stalls for
  the OS connect timeout (75 s on macOS) and any later control op on that session stalls too.
- Cause (proven): while a main-frame navigation is pending, Chromium stops answering the page-level CDP session
  (`Runtime`/`DOM`/`Page` queries and `cdp.detach()`, which sends `Runtime.runIfWaitingForDebugger` first). A
  Playwright goto timeout does not end the navigation. The stall site is `state.cdp.detach()` in `disposeState`.
  `Page.stopLoading` is browser-handled, answers in ≤ 9 ms on a wedged session, aborts the navigation
  (`ERR_ABORTED`) and un-wedges the channel; only context disposal (`Target.disposeBrowserContext`) releases the
  sockets and it returns in ≤ 10 ms even with a detach pending.
- A hostile page wedges the channel with `location.href = <black hole>` and no agent navigate call
  (`browser_snapshot` stalled > 8 s; 12 ms after a stop). This is an availability stall of the trusted host.
- The mechanism was proven on the real `createSupervisedHost` path with the stop issued from a test-owned
  second CDP session: close 2–5 ms after a failed navigation, 2.0 s during an active goto, sockets released,
  evidence lease clean, POST bodies of 200,002 and 34 bytes to the black hole captured before cancellation.
- Deadline-abort behaviour today (exp9): after `browser.close()` at the 5 s deadline, navigate/snapshot/click/type
  holders settle within ~30 ms, BUT the pending close resolves `{ok:true}`, `finish()` returns `verdict: pass`
  with `captureFailed=false`, and the snapshot holder returns a successful EMPTY snapshot. An aborted run can
  currently look clean. Closing that silent-wrong path is a P1 exit criterion of this slice.
- Three Codex paper rounds and the Sol research are dispositioned in the register; their still-open items are
  the S4 requirements below. No contract amendment was needed: the 5 s quiesce bound and its expiry-abort rule
  are the plan's own text.

## Scope — implement

### A. Session close path (`src/browser/session.ts`)

1. In `closeSession`, after setting `closing`: send `Page.stopLoading` on the session's own CDP session and
   await it. An immediate rejection is an infrastructure failure, not an ordinary `{ok:false}`: report it through a
   new trusted, non-model-visible callback on `BrowserSessionHostOptions` (e.g. `onSessionFailure(sessionId,
   kind)`), which the supervisor wires to `lease.markCaptureFailed()` + the abort path (the existing control
   boundary collapses infrastructure failure into `closed`/`{ok:false}` — `capturedControl` in host.ts — and must
   not be relied on). Unknown-session closure stays an ordinary `false`. Then proceed to disposal. No
   `Promise.race` that abandons the stop.
2. Wait for the mutex holder exactly as today (`mutex.close`). Do not release early. Do not add a goto timeout
   inside the close path.
3. Dispose the context BEFORE the session's own page-channel cleanup: call `context.close()` first; then
   treat `releasePinnedObjects` and `cdp.detach()` as best-effort (errors swallowed, but they must be awaited or
   provably settled — no live cleanup promise after `closeSession` resolves). Clear `pinnedObjects` locally
   before disposal.
4. Suppress the page `close` listener's fire-and-forget `releasePinnedObjects()` during owner-initiated disposal
   (a `disposing` flag on the state or equivalent); the listener still runs for page-initiated closes.
5. `closeSession` resolves `true` only after the context is observed gone from `browser.contexts()`. Capture
   `context.browser()` at `openSession` time into the session state; if it is null, the close cannot be qualified
   and is reported through the A.1 failure callback. A missing context after disposal is the success condition;
   anything else is a failure through the same callback, never a swallowed `true`.
6. In `navigatePage`'s catch (goto failed or timed out): send `Page.stopLoading` before the `framenavigated`
   wait, so a failed navigation leaves a usable session (F1). Add an explicit `NAVIGATION_TIMEOUT_MS` constant
   passed to `page.goto` (value 10 000 ms, user-approved 2026-09-07; it is a caller-visible change, so state it
   in the report and return the plan's timing note as a proposed doc diff, not by editing the plan).
7. Keep `NAVIGATION_SETTLE_TIMEOUT_MS`, `CLICK_TIMEOUT_MS`, the lifecycle/taint reset rules and every result
   shape unchanged.

### B. Supervisor quiesce and finish (`src/supervisor/host.ts`)

1. Add the trusted `quiesceEvidenceProducers()` (M6-AM04) as an OPTIONAL member of `SupervisedHost`
   (`quiesceEvidenceProducers?(): Promise<void>`; `runHostAdapter`'s `afterLoop` calls it when present, so the
   runner fake in `testbed/runner.testkit.ts` stays valid until it opts in) with ONE shared 5 s deadline covering: reject new
   controls → stop (via A.1 per session) → let admitted mutex work settle → attach → deferred fixed-point loop
   while targets live → close sessions (A.3–A.5) → final settle/drain. The loop needs a quiesce-specific STRICT
   attach drain: today's `settleAttach()` races each attach against 2 s, deletes the entry and leaves the
   underlying promise running, so repeating it can report an empty map while attach work is live (a timer-only
   success). The strict drain retains the underlying promises until they settle or the shared 5 s expiry; on
   expiry, dispose/abort and then await their settlement. Keep the existing 2 s interactive barrier for the
   per-control path unchanged.
2. Deadline expiry: mark capture failure, abort the owned browser/run (`browser.close()` on an owned browser;
   for a caller-supplied browser, close every owned context and mark the lease failed), await holder settlement,
   and make the cohort/run fail. Never return a successful close while work lives.
3. `finish()` preconditions are state-based (M6-AM04): refuse with the existing lease-preserving path when any
   session is live, attach/deferred work is pending, or evidence is undrained; refusal mints no verdict and
   keeps the lease; `abort()` stays terminal; late callbacks after abort cannot resurrect state.
4. Post-abort results: a holder that settles because of the abort must NOT yield a successful result. Snapshot
   after abort must be `{ok:false}` with an existing reason (`session-unknown` is acceptable if the session is
   gone); close after abort must not report `{ok:true}`; `finish()` after abort must not return `pass` — the
   abort marks capture failure and the existing capture-failed path applies.
5. A pending `Network.getRequestPostData` rejected by stop/disposal must land in `recordUnavailableBody` (marker),
   never a silent drop and never a `captureFailed` the page can trigger; `settle()` must complete after disposal.
6. Trusted per-op bound (user-approved 2026-09-07): every browser control (`browser_navigate`, `browser_click`,
   `browser_type`, `browser_snapshot`) and the fill path run under a supervisor-side `OP_TIMEOUT_MS` = 10 000 ms.
   On expiry the supervisor issues `Page.stopLoading` on that session (through a trusted session-host entry point
   added for this purpose, not a model-visible tool), awaits the op's own settlement (no race that abandons it),
   and the op returns its EXISTING failure reason (`navigation-failed`; `no-such-element` for click/type; the
   existing snapshot and fill failure shapes). No new enum, no new field. A hostile self-navigation therefore
   costs at most ~10 s of a run, not ~75 s. Deletion mutant: remove the expiry trigger → the hostile
   self-navigation regression must fail.

### C. Runner wiring (`testbed/runnerExecution.ts`, `testbed/runner.wiring.test.ts`)

1. Quiesce must run BEFORE the transcript is sealed: `runAgentLoop` appends the post-loop drain from `afterLoop`
   and then calls `transcript.close()` (`src/agents/loop.ts`), so a quiesce after `runHostAdapter()` returns is
   too late. Place it inside `runHostAdapter`'s `afterLoop`: existing controlled settle-until → quiesce → final
   settle/drain → return the accumulated events. `finish()` then sees no live sessions/pending work; keep
   `closeAll()` as teardown after the verdict and keep the `missingEndMarker`/`CAPTURE_FAILED_MESSAGE` semantics.
   Add an omit/reorder mutant that runs through `runEval` (the actual caller path), not a helper test.
2. A run whose quiesce expires is a failed run: it surfaces through the existing `CAPTURE_FAILED_MESSAGE` /
   `missingEndMarker` throw path in `runOnce` and is never credited as complete or leak-free. Diagnostic
   retention and failed-run/cohort publication (AM09/AM10 wiring, `runner.ts`, aggregation, entrypoint) are S5
   scope and are NOT implemented here — do not add a success-shaped return for a failed run.

### D. E5 capture qualification (`testbed/scenarioCoverage.ts` + `.test.ts`, new)

1. Versioned scenario-requirements manifest per §5 table; qualification joins this execution's producer
   results; required missing channels reject publication; screenshot-text stays declared; missing-body and
   scan-truncation counts printed; a green lab producer cannot override a per-run limitation.
2. Exposure pinning per §5: independent expected full strings at fixture-version level, exact 200-character
   delivered prefix for the clamped name, original/delivered lengths and truncation recorded; the browser
   clamp and fixture version stay unchanged.
3. Record the initial-snapshot observation for every real run (§5): a model that never encountered the payload
   cannot be sold as resisting it. Tests: missing, late-only, truncated, and dropped-between-snapshot-and-SDK
   cases each leave the outcome intact but withhold the hostile-comparison qualification.

### E. Tests (write first, then implement)

Real-browser regressions (serial, `*.browser.test.ts`, no Docker, no API key), each with a clean control:

- `black-hole then close`: navigate to an unroutable IPv4 address (10.255.255.1). Do NOT skip: `make test` permits
  exactly one named skip (`scripts/test-execution.mjs`, skip-identity/skip-count) and no gate edit is in scope.
  The test first proves the address is a black hole (a raw `net.connect` still connecting after 2 s); if it is
  not, the test FAILS with that reason and S4 acceptance is BLOCKED on that host — never green, never skipped.
  Then assert `browser_close_session` resolves within 5 s, `browser.contexts()` excludes the session's context,
  and the cancelled request produced `Network.loadingFailed` with `ERR_ABORTED` (correlate on requestId).
- `active goto then close`: close requested during the goto; holder settles with `navigation-failed`; close within 5 s.
- `hostile self-navigation` (new fixture page under `testbed/fixtures/` with `location.href = <black hole>`):
  `browser_snapshot` after the page wedges itself returns within `OP_TIMEOUT_MS` + settle with its existing
  failure shape (B.6), a second snapshot after that succeeds (the session is usable again), and close within 5 s.
- `deadline expiry`: a holder that cannot settle (a hidden element click on a wedged page; the stop is defeated
  by a TEST-LOCAL `BrowserContext`/`CDPSession` decorator installed through `newContext`, exactly as
  `session.transport.browser.test.ts` already does — never a production flag or option) → quiesce expires at 5 s
  → run fails, holder result is not `ok`, `finish()` does not return `pass`, no unhandled rejection, no live
  context. The test must prove the holder owns the mutex before close is requested (an explicit barrier), so the
  close cannot win a race against an un-admitted holder.
- `delayed body under quiesce` (E6's controlled case): a body released after quiesce begins but before the bound
  must be captured as a body, not a marker; the pre-close marker limit in §7 stays.
- `pending attach under quiesce`: a popup/second target confirmed alive (assert `context.pages().length === 2`)
  with pending attach work; quiesce settles it or fails visibly — never a silently successful attach.
- `POST to black hole`: body captured (form path) AND the CDP deferred-body path forced by a test-local decorator
  on the real context/request/CDP listener path (a request whose Playwright `postData()` is null and whose CDP
  `requestWillBeSent` has `hasPostData` with no inline body) — not by calling `EvidenceLease` helpers directly —
  ending in the marker path with `settle()` completing.
- `per-holder concurrent close`: for click, type, snapshot and fill (fill via the existing lab fixture), the
  result observed with a concurrent close equals the result without one for the same page state, and the
  lockdown lifecycle clears exactly once.
- `finish() preconditions`: refuses with live session / pending attach / undrained evidence; lease preserved.
- E5: required-channel-missing rejects; truncation counts printed; lab-green-cannot-override.

Deletion-isolated mutants on the actual caller path (record the exact patch, the failing test name and the
native report for each; do not claim on paper): remove the stop; remove the context-removal check; make the
fixed-point loop single-pass; remove the listener suppression; close the context before the deferred settle;
return `ok:true` from close on deadline expiry; let `finish()` return `pass` after abort; drop the marker on
rejected `getRequestPostData`; each of the E5/E6 rows in plan §8.

## Do not implement

- No new model-visible tool, method, result reason or refusal enum. No change to `bodyCorrelation.ts` (if
  cancellation needs a correlation change, STOP and report). No change to `CLICK_TIMEOUT_MS`,
  `NAVIGATION_SETTLE_TIMEOUT_MS`, the mutex contract, fill/in-realm code, fixture control/signing code, decoders,
  gates, `SKILL.md`, `SCHEMA.md`, `PLAN.md`, `PLAN-archive.md`, memory files, or any file outside the allowlist.
- No `Promise.race` that abandons running work; no timer-only success; no early mutex release; no goto-timeout-
  only "fix"; no `page.close()` as the hard step (Playwright #42366); no Fetch-domain interception.
- No S5 work (composed command path, cohorts, run identity), no live model calls, no Docker, no release.

## File ownership

Codex owns (exact allowlist from plan §7 S4): `src/browser/session.ts`, `src/browser/session.test.ts`,
`src/browser/session.transport.browser.test.ts`, `src/supervisor/host.ts`, `src/supervisor/host.test.ts`,
`src/supervisor/host.evidence.test.ts`, `src/supervisor/host.browser.test.ts`, `testbed/runnerExecution.ts`,
`testbed/runner.wiring.test.ts`, `testbed/scenarioCoverage.ts` (new), `testbed/scenarioCoverage.test.ts` (new),
`testbed/runner.finalization.browser.test.ts` (new), plus one new hostile fixture page under
`testbed/fixtures/` named in the report. Pre-authorized fallout (user-approved 2026-09-07), TEST-ONLY edits under
the rule "no assertion weakened, no test deleted, no timing constant loosened": `testbed/coverage.browser.test.ts`,
`testbed/runner.browser.test.ts`, `src/supervisor/host.timing.browser.test.ts`, `testbed/runner.testkit.ts`
(the fake host may gain the optional method). List every such edit separately in the report.
Owner extension after the first Astra STOP (2026-09-07): `scripts/retention/allowlists.ts` — ADDITIONS ONLY to the
`src/browser/session.ts` function inventory, one entry per new function/callback the slice introduces, placed in
source order, each listed in the report with the function's purpose. No removals, no reordering of existing entries,
no change to `scripts/retention/rules.ts` or its self-tests; the retention rule must still pass over the new
functions (they are security-core code and are analysed like the rest). The owner re-reviews every added entry. Any other required edit (a caller/test fallout, a `check-test-entry`
inventory pin, `gate-cli.selftest` synthetic inventory) is a STOP: report the exact diff as a proposed
extension; do not apply it.

## Acceptance criteria

Behaviour: every real-browser regression above passes with its clean control; `make test` exit 0 from this
checkout (owner runs it — report what you ran); `npx vitest run testbed/parity/claims.test.ts` unchanged
(no claim-row or TV-CLAIM-SPAN edit); dependency-boundary, docker-invocation and compose gates unchanged.
Tests: the mutant inventory above, each killed by a named production-path test. Docs: proposed diffs only
(returned in the report) for SCHEMA qualification output, phase §3/§4 finalization preconditions (AM04),
qualification policy (AM05) and the `NAVIGATION_TIMEOUT_MS` note. Safety: post-abort results are failures;
deadline expiry fails the run; no live context or cleanup promise after close. Three separate claims, three
separate assertions: correlated `Network.loadingFailed` with `ERR_ABORTED` proves navigation cancellation;
`browser.contexts()` proves context removal; socket release is proven ONLY by the SYN_SENT observation
(netstat) and is reported as unverified where that observation is unavailable.

## Verification order

Named cases first → implement within ownership → targeted vitest files → `npm run typecheck` → `git diff --check`
→ `make test` (browser timing families serially, machine-wide). Report every command with its exit status; NOT RUN
is a valid status in the sandbox.

## Reporting back

Summary; Files Changed; Verification (commands, statuses, native report paths, mutant patches + killing tests);
Risks / Follow-ups; **Deviations From Handoff** (mandatory section, even if empty; a code comment is not a
deviation record). Stop and cite both contracts if anything here cannot be implemented as written.

## Resolved owner decisions (user-approved 2026-09-07, after the Sol paper pass)

1. Wedged non-navigation ops: trusted per-op bound of 10 s with stop-on-expiry and existing failure reasons (B.6).
2. Failed-run retention: an expired quiesce is a thrown failed run in S4; diagnostic retention and publication
   stay in S5 (C.2). No allowlist widening to the runner.
3. Fallout: `quiesceEvidenceProducers` is optional on the interface; four test files pre-authorized for test-only
   edits (File ownership).

## Owner dispatch sequence (not for the worker)

1. Sol read-only paper pass over this packet (P1 = contradiction with plan §7/§8 or an unimplementable step).
2. Absorb; dispatch Astra `task --write` with this file's contents; hold commits while it runs.
3. Owner runs `make test` and the mutant inventory; post-impl ladder: fresh Claude QA, Claude security pass on
   the lifecycle surface, Codex adversarial review; three-round fix cap with P1 criteria stated in round 3.
