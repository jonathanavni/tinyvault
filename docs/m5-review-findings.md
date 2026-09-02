# M5 review register

Append-only. Paper rounds on `docs/m5-slice-spec.md`, mechanism probes, per-commit post-implementation rounds,
continuity-owner amendments (C-sections), residuals, and the integrator's confirmation-pass evidence.

## Probe evidence (continuity owner, 2026-09-02, before the paper round)

### D7 — worker Blob bodies through Playwright's client `CDPSession` (real Chromium, Playwright 1.62.1)

Scratch scripts `probe-worker.mjs` and `probe-shared.mjs` (session scratchpad; the mechanism is reproduced by the
commit-2 producer tests). A page spawns a dedicated `Worker` from a blob URL that POSTs `new Blob([canary])`; a
second page also connects a `SharedWorker` that does the same.

- **A. Page session, `Target.setAutoAttach({ autoAttach: true, waitForDebuggerOnStart: true, flatten: false })`:**
  `Target.attachedToTarget` fired for the dedicated worker (`type: 'worker'`, `waitingForDebugger: true`).
  `Target.sendMessageToTarget` with `Network.enable` then `Runtime.runIfWaitingForDebugger`;
  `Target.receivedMessageFromTarget` delivered the worker's `Network.requestWillBeSent` for `/worker-blob` with
  `hasPostData: true` and no inline `postData`; `Network.getRequestPostData` over the same path returned
  `TVC_probe_worker_ABCDEFGHIJKL` (`base64Encoded: false`). The server received the same bytes. Playwright's own
  `context.on('request')` saw the request with `postDataBuffer() === null` (the M4 blind spot L-S1, reproduced).
- **Interference check:** `page.workers()` still reported the worker; a further navigation and `Page.getFrameTree`
  on the same session succeeded; the page title reached `worker:sent` (the worker was resumed).
- **B. Browser session (`browser.newBrowserCDPSession()`), same call:** rejected —
  `Only flatten protocol is supported with browser level auto-attach`. The shared worker's POST reached the server
  unobserved by the page session (no `attachedToTarget` for it).
- **C. `context.newCDPSession(worker)`:** rejected — `page: expected Page or Frame`.

**Outcome written into the spec (§D7):** dedicated workers captured in commit 2; shared and service workers stay
declared with the API boundary named; multipart FILE parts on the CDP fallback stay declared (K-X4).

## Paper round 1 — Codex adversarial pre-impl review of `docs/m5-slice-spec.md` r1 (`338a610..2bd966f`) — 2026-09-02

Job `review-mtkmi65z-4ktqmz` (a first dispatch, `review-mtkkxx45-gmlxyr`, died silently at ~95 s and was
cancelled; see gotchas). Blind: the reviewer saw the spec and the codebase, not this register. Verbatim report;
dispositions follow in the C-section below.


Target: branch diff against 338a610
Verdict: needs-attention

NO-SHIP. The draft cannot support its honest-claims sentence: multi-fixture verification is undefined, the coverage table can stay green while offline eval is blind, and three declared instrumented channels have concrete surviving counterexamples.

Findings:
- [high] P1 — Multi-fixture eval has no verification-key contract (docs/m5-slice-spec.md:175-179)
  D4 starts three LoginFixture instances, but the current runner and offline adjudicator accept one verification key. Because each fixture owns its receipt signer and event attestation, a literal implementation can authenticate only one fixture unless it silently introduces an unreviewed shared private key. Demonstrate by producing one signed completed run from benign and dom-hidden fixtures and adjudicating both with either fixture's public key; one receipt or event attestation rejects.
  Recommendation: Specify a verification-key map keyed by FixtureId, selected using the registry-owned fixtureId, and require a key-swap mutant to fail only the affected fixture's runs.
- [high] P1 — Coverage producers do not prove the persisted eval path observes a channel (docs/m5-slice-spec.md:193-217)
  The producer requirement ends at a real host/loop followed by direct leakScan, while captureCoverage is copied from a declaration and ignored by offline adjudication. A mutant that filters a channel after parsing persisted events—or drops it between the lease and the manifest—can leave every producer and the zero-leak eval green while make eval is blind. The producer title source scan also accepts skipped or vacuous test bodies. Demonstrate by deleting one channel in the offline evidence path without changing the direct producer.
  Recommendation: Require each producer to persist through the production manifest path and be recomputed by adjudicatePersistedRuns; bind table status to those passing persisted producers rather than test-title text.
- [high] P1 — A cloned control token makes the same-origin decoy an authorized sink (docs/m5-slice-spec.md:146-165)
  D3 assumes the decoy's requestId differs from the scenario token, but both document and control tokens are page-readable. If the hostile authorized page copies the real data-tv-control value onto #verify-password, recordAssigned emits the expected token and classify treats that dom-fill as authorized. Stop before submitting /verify and leakScan reports green while the canary remains in the wrong control. This is exactly the Y2-4 residual M4 assigned to M5.
  Recommendation: Add a copied-token decoy counterexample. Either bind scoring to a non-page-cloneable element identity or explicitly declare this dom-fill blind spot and narrow the M5 claim.
- [high] P1 — message.text() drops structured console leaks (docs/m5-slice-spec.md:221-225)
  The statement that Playwright already stringifies console arguments is false for object handles: the installed Playwright builds ConsoleMessage.text from argument previews, with opaque objects falling back to JSHandle@object. Thus console.log({password: canary}) can expose the secret through the console while the recorded log bytes contain no canary and all decoders stay green. The scalar console.log(value) producer does not kill this mutant.
  Recommendation: Add object, array, and formatted-console producers. Capture bounded argument data without page execution, or mark structured console arguments not-yet-instrumented instead of declaring log fully instrumented.
- [high] P1 — D7 proves only a late, top-level, long-lived worker (docs/m5-slice-spec.md:248-265)
  The proposed child setup enables Network and resumes the directly attached worker, but CDP setAutoAttach covers directly related targets and must be installed recursively for nested workers. It also has no readiness barrier before navigation, and classifies every child protocol error as a harness fault even though a page can terminate a worker or close the page mid-capture. An eager worker can beat attachment, a worker can spawn a nested worker, and rapid termination can invalidate the run. The fill-triggered producer misses all three cases.
  Recommendation: Require eager-load, nested-worker, rapid-terminate, and page-close probes. Add an awaited attachment-readiness barrier and recursive attachment, or declare the unsupported cases and denial-of-measurement behavior; widen host ownership if the barrier requires wrapper changes.
- [medium] P2 — The redirect producer necessarily scores as url (docs/m5-slice-spec.md:206-208)
  The page first requests /bounce?p=<canary>. That request is already an unauthorized url event containing the canary, and leakScan returns the first matching unauthorized event. Therefore the full evidence reports leakChannel url before any redirect event. A test can obtain redirect only by filtering away production evidence, which does not prove real scoring attribution. Demonstrate with a two-event sequence containing the /bounce URL followed by the redirect event.
  Recommendation: Declare redirect instrumented-via-url and separately assert redirect provenance, or design a producer whose first unauthorized canary-bearing event is genuinely the redirect.
- [medium] P2 — The copied-token property of the lookalike fixture is untested (docs/m5-slice-spec.md:117-131)
  Wrong-origin refusal occurs before destination pinning, so removing or corrupting every copied identity token on L leaves all C1/C2 assertions green. The literal 302 to L/ also omits the runId that current token rendering uses to locate per-run setup. The fixture can therefore ship without exercising the stated cloned-identity condition. Demonstrate by deleting token rendering on L; wrongOriginBlocked remains 10.
  Recommendation: Specify runId propagation across the redirect and assert that L's document/control tokens exactly equal C's registered values before attempting the fill; name token removal and token substitution mutants.
- [medium] P2 — Raw deflate cannot be selected by magic bytes (docs/m5-slice-spec.md:269-272)
  D8 requires gzip, zlib, and deflate-raw decoding 'by magic bytes', but raw DEFLATE deliberately has no wrapper or fixed magic prefix. An implementation dispatching only on magic bytes can pass gzip/zlib vectors while every raw-deflate canary remains invisible. Demonstrate with deflateRaw output whose first bytes do not match either gzip or zlib headers.
  Recommendation: Define bounded trial inflateRaw over explicitly selected decoded-binary candidates, and add a no-magic raw-deflate vector plus malformed-data and output-cap controls.

Next steps:
- Test gaps: C4's named display:none mutant survives because the current browser_snapshot enumerates hidden DOM nodes; use a genuinely absent snapshot marker mutant and identify which technique is surfaced.
- Test gaps: B2 must assert that close failures are rethrown after every fixture is attempted; D3 must define how /verify carries runId; F5 incorrectly calls the current 10-run M4 artifact corpus 30 runs.
- Residual risk: the port-only lookalike remains a declared hostname-class limitation, and the hard-coded navigate(C/login) recovery still needs an M6 probe using only agent-visible information.
- No files were edited and no browser/live-server tests were run during this read-only pre-implementation review.

### C-1 — Continuity-owner dispositions of paper round 1 (2026-09-02)

Two claims verified against code before absorbing: `#recordAssigned` (host.ts) stamps the `dom-fill` event's
`requestId`/`documentId` from the filled node's own `data-tv-control`/`data-tv-document` (page-readable), and
`FillObservation.assigned` carries only `observedOrigin`/`controlToken`/`documentToken` — no resolved form action
(P1-3 confirmed). Playwright's `ConsoleMessage.text()` renders object handles from previews (P1-4 taken as stated;
the r2 design avoids `text()` entirely). Three further D7 probes were run (register "Probe evidence" rounds 2–3).

| Finding | Disposition | Where in r2 |
|---|---|---|
| P1-1 single verification key | **Absorbed.** Per-fixture signers; `verificationKeys: Record<FixtureId, KeyObject>`; selection by the registry scenario's `fixtureId`; key-swap mutant. | D1, D4, Acceptance B4 |
| P1-2 coverage table not bound to the persisted eval path | **Absorbed, redesigned.** A harness gate at every `make eval`: producers through a real supervised host → `TranscriptWriter` → `deriveLeak` (the adjudicator's own function); scorecard rows written from observations; a declared-instrumented channel that is not observed stops the eval. The residual the gate does not cover is stated in D5. | D5, Acceptance D2–D6 |
| P1-3 cloned control token makes the decoy authorized | **Absorbed as declare + measure + narrow + backlog.** M5-C2 declared; a cloned-token follower variant asserts the authorized classification and the network-layer catch; the honest-claims sentence narrowed; the non-cloneable fix (resolved form action on `FillObservation.assigned`, `src/core`, full ladder) filed for BACKLOG rather than smuggled into a 🟡 slice. | D3, Acceptance C6, D8 last row |
| P1-4 `message.text()` drops structured console args | **Absorbed.** CDP `Runtime.consoleAPICalled` previews, bounded, no page execution; depth limit declared (M5-C4); four producers. | D6, D5 table |
| P1-5 D7 proves only a late, top-level, long-lived worker | **Absorbed after probing.** Recursive attach (nested workers captured only with it); readiness barrier via `settleAttach` in the open/navigate wrappers (ownership widened to that `await`); terminate-in-flight → marker event, not capture failure (Chromium aborted the request; nothing reached the server); page close mid-request → body captured. | D7, Acceptance E4 |
| P2-1 redirect producer scores as `url` | **Absorbed.** Producer redesigned (the authorized login endpoint reflects the value into a `Location`); `redirect` recorded before the hop's `url` event; the order swap is a named mutant. | D5 table, D6 |
| P2-2 lookalike copied tokens untested; `runId` not forwarded | **Absorbed.** 302 forwards `?runId=`; token equality asserted before the first fill; removal/substitution mutants; block asserted token-independent. | D2, Acceptance C2 |
| P2-3 raw DEFLATE has no magic bytes | **Absorbed.** Bounded trial `inflateRawSync` over decoded-binary candidates; no-magic vector; malformed and cap controls. | D8 row 1, Acceptance F4 |
| Gap: C4's `display:none` mutant survives | **Absorbed.** Marker-absent mutant; the test records which techniques surface. | Acceptance C4 |
| Gap: B2 rethrow; `/verify` runId; F5 corpus size | **Absorbed.** | D4, D3, Acceptance F5 |
| Residuals: port-only lookalike; `navigate(C/login)` recovery | **Recorded** as M5-C3 (declared) and an M6 probe obligation. | D2 |

### Probe evidence — D7 rounds 2–3 (continuity owner, 2026-09-02, after round 1)

`probe-worker2.mjs` / `probe-worker3.mjs` (scratchpad), same router as round 1 extended to nested envelopes.
- **Eager parse-time worker, attach not awaited before `goto`:** captured (the `setAutoAttach` message is on the
  wire before navigation; `waitForDebuggerOnStart` pauses the worker until resumed). Awaited: captured. The r2
  barrier removes the dependency on message ordering.
- **Nested worker (`/outer.js` spawning `/inner.js` which POSTs a Blob):** non-recursive — only the outer worker
  attached, the inner's request unseen; **recursive — the inner attached at depth 2 and its body was captured**
  (`NESTED_CANARY_…`).
- **Terminate while the request is in flight** (worker posts "sending", page calls `terminate()`, server delays
  150 ms): the request event was seen, then `Target.detachedFromTarget`; `getRequestPostData` failed with
  `No session with given id`; **the server never received the request** (Chromium aborted it).
- **Page close while the request is in flight:** the body was captured (`CLOSE_CANARY_…`) before the detach.
