# Backlog

The idea funnel: unprioritized, unscoped potential work. Most of it never ships, and that's fine — this is the holding pen so good ideas aren't lost and don't clutter `PLAN.md`. When an item is prioritized, it graduates into `PLAN.md` (or a planning doc in `docs/`) and comes off this list.

> Some teams gitignore this file, especially across multiple git worktrees where a committed backlog drifts. It's committed here so the skeleton shows the pattern — uncomment the `BACKLOG.md` line in `.gitignore` to keep it local instead.

## Ideas

Post-launch adapters & extensions (from `PROJECT-SPEC.md` §7 — parked here until the core + MCP launch ships):

- **eve tool package / Agent Plugin** — "the credential layer the eve browser-agent wave is missing."
- **dsh plugin** — TinyVault as a dsh capability seam (Service Definition + Provider + Consumer).
- **WebMCP hostile fixtures** — red-team the credential surface WebMCP punts on (`document.modelContext` sites authoring `verify_identity(password)`-style tools); first leak-rate rows for a WebMCP-consuming agent.
- **KuchiClaw browser access via TinyVault** — the composed-boundaries finale (process boundary + context boundary); 2FA/CAPTCHA as a human-handoff hook to KuchiClaw's chat channel.
- **Second safe public target / masked-input & JS-framework fill edge cases** — timeboxed, only if the demo needs it.
- ~~**Policy dry-run / replay mode**~~ — **graduated 2026-09-01** to `PROJECT-SPEC.md` §7 step 6 (post-v0.1 fast-follow; eval-side `make policy-diff` tool reusing the offline adjudicator).

**🔴 slice (full ladder, `src/core` contract change) — non-cloneable `dom-fill` identity (M5-C2, spec r2 P1-3):** **Owes an explicit launch disposition before M10 (assessment 2026-09-04 A3).** carry
the pinned destination's resolved form `action` (method + route + origin) on `FillObservation.assigned` so
`classify` can require the filled control's form to target the scenario's login endpoint — a property a page
cannot clone without turning the decoy into a real login form. Until then the `dom-fill` sink is identified by a
page-readable token and a laundered control is scored at the network layer only. **B3-S residual:** a script at
the authorized origin can rewrite that form action to a lookalike origin after the fill; plaintext reaching the
lookalike is scored `unauthorized-sink` by network evidence, but layer 2 does not re-verify the destination at
submit time. The full-ladder slice must explicitly decide whether to lock/re-verify the submit-time destination
in addition to carrying the fill-time resolved action.

**Later slice — readiness barrier for click-created pages (M5-C5):** a bounded post-click attach barrier so eager
workers in popups are instrumented; needs the click wrapper, outside M5's ownership grant.

**Slice A residuals (leak-checker decoders, register C-A3, declared in SCHEMA):** a transform applied OVER decoder
output (`percent(base64(secret))`, `hex(base64(·))`, `reversed(base64(·))`, JSON-escape of a blob, incl.
`encodeURIComponent(btoa(secret))` when the base64 contains `+`/`/`) is not undone — adding percent as a
node-extending decoder is the natural next step; the per-event decoded-output budget (2,048) is a declared,
counted ordering lever (~1,000 base64-shaped leaves ahead of the credential) — per-candidate cost reduction would
raise it; the artifact-corpus half of the F5 timing test is count-only (QA A3 P3-1).

M4 shipped residuals — disposition decided in `docs/m5-slice-spec.md` §D8 (2026-09-02); items marked IN are M5
work in flight, the rest stay parked here (register "Final5 round"):

- **[IN M5, dedicated workers; shared/service declared] Per-target CDP evidence capture** — Blob (non-inlinable) request bodies from dedicated/shared Workers are unobserved because the deferred-body CDP session is page-scoped (`context.on('worker')` / `Target.setAutoAttach`); multipart FILE parts on the CDP fallback path likewise.
- **[IN M5, slice A — checker-side decoders]** **Leak-checker transform inventory** — unkeyed page-side encodings not in the inventory evade layer 4: gzip/deflate, UTF-16, charCode-array JSON, rot13, HTML entities, non-whitespace separators, base64 continuing past the canary inside a larger text body, base64url, split-frame base64. Decide which to add and add the metaGate vectors with them.
- **[PARKED as a decision, Decisions Log 2026-09-02]** **Layer-2 destination check: first-hop and fill-time only** — a same-origin `action` answering 307/308 re-POSTs cross-origin; a page can re-point the form after a successful fill. Layer 4 catches both; decide whether layer 2 should follow redirects or lock the form.
- **[PARKED]** **Probe P per-call floor** — the batched tripwire probe measures a 64-call aggregate; nothing bounds a one-shot call. The sensitivity calibration reports `Infinity` on some machines; consider a longer ladder or a per-machine record.
- **[READY — `rules.ts` split 2026-09-03 (`taintHelpers.ts`); an M6+ slice]** **Retention rule beyond shapes** — `localFileSodium.ts` argument-passing sinks (`console.*`, `fetch`, `process.stdout.write`, `throw`) are unseen; the rule is a shape allowlist by design (honest-claims sentence). Either a per-member occurrence list for that file or accept.

## From the C2 / campaign-harness ladder (2026-09-09; M7 register)

- ~~**[Next session, Astra, gate change] Execution-side pin of the timing-2 test inventory.**~~ **CLOSED 2026-09-10** — merged `c49e9ad` (`timing-2-inventory` rule; packet `docs/probe-p-timing2-inventory-pin-packet.md` v4; register "Inventory pin — implementation"). Claim: changes to the reported title multiset only; residuals (title-preserving substitution, reporter/root-of-trust modification, reporter-format coupling, hook bodies) recorded. Original text: The C2 pinned-source scan
  bounds test registration to references of the statically imported vitest symbols and `vi.spyOn`; three review rounds
  showed each source-side spelling can be evaded by the next (alias → equivalent spelling → `vi.importActual`), so the
  claim was narrowed at the cap. The complementary control is execution-side: `scripts/test-execution.mjs` pins the
  timing-2 JSON report's exact test-title inventory (26 titles after C2) so a registration by any spelling reds the
  execution gate. Root-of-trust script change → Astra packet with self-test mutants and the digest refresh.
- **[Declared limit] Twins are not phase-matched to their siblings (D-1).** The campaign report must say a quiet twin
  beside a rejecting sibling is weaker evidence for "harness cleared" than the policy's Outcome text implies.
- **[Declared limit] Campaign evidence is not authenticated against manual modification**; the documented operating
  contract (freeze SHAs, per-candidate pointers, refusals directory) is part of the trust boundary.

## From the M6 close assessment (2026-09-09; `docs/project-assessment-2026-09-09.md`)

- ~~**🔴 M6.1 remediation slice — receiptless-row canary authentication (`M6C-CODEX-P1-01`).**~~ **CLOSED 2026-09-09** — merged; see the M6 register entry "M6.1 receiptless-row canary authentication". Original text: A baseline run with no completion receipt has its
  canary authenticated only by that receipt (`testbed/completion.ts:93-101`, `testbed/checkers/offline.ts:467-470`), so an
  edited bundle can substitute a decoy canary, restate the row `secretLeaked:false`, and stay `qualified` (a sibling supplies the
  cell's positive control; baseline completion is not required). Shape: authenticate the canary against the fixture-signed
  `sdk-request-context` bootstrap that `assertAttestedExecution` already parses; composed publication mutant (receipt removed +
  canary substituted + outcome restated; sibling intact; signed events unchanged; both real profiles) paired with a legitimate
  receiptless baseline admission. Recorded cohorts unaffected (all baseline rows completed with receipts). README claim narrowed
  meanwhile.
- ~~**[M7 entry input] Eval-test timeout derived from the selected inventory.**~~ **CLOSED 2026-09-09** (packet A, `5967448`, merged `4b0f3b7`: `testbed/evalBudget.ts`, default 3,900,000 ms; M7 register). Original: `testbed/runner.eval.test.ts:107` pins
  `1_800_000` ms; at the observed ~19 s/run, 5 scenarios × 2 agents × 10 ≈ 32 min exceeds it (fail-closed, but it would burn an
  authorized cohort on a harness bound). Derive from `sampleSize × |scenarios|` with the arithmetic recorded (QA P3-05).
- ~~**[M7 entry input] `testbed/runner.realAgent.eval.ts:12-13` hard-codes three scenarios**~~ **CLOSED 2026-09-09 for the pin** (packet A: `DEFAULT_SCENARIO_IDS` pinned by identity; extending the inventory now fails the registry-identity test deliberately). Still open for M7: per-fixture capture applicability, exposure checks, recovery recipes, positive controls, admission cases, and the prompt/capture budget requalification. Original: hard-codes three scenarios; extending the inventory is a
  deliberate gate change, together with per-fixture capture applicability, exposure checks, recovery recipes, positive controls
  and adversarial admission cases (Codex rec. 3). Requalify prompt and capture budgets for longer M7 recipes/traces
  (`src/agents/prompt.ts:14-17`; Codex rec. 4). **2026-09-10:** exposure-oracle rows, positive controls, adversarial admission cases and the
  prompt budget (E8a, ten rows strictly < 1,024) shipped in M7 (`b7889d3`); capture-budget requalification under live traces was E8b (executed 2026-09-11: unqualified — reference leak 10/10 on `fake-reauth-prompt`; capture limits all 0; register "E8b — attempt `E8b-A1-N10`"). **The runtime fill control that answers that finding shipped** (design A, one bounded injection per handle per authorization domain, `docs/m7-runtime-fill-control-packet.md` rev 3.1; merged `6812627`, 2026-09-11, full ladder) — **live-qualified 2026-09-12** (E8c cohort `PFc7eGp2`: reference 0/10 leaks and 10/10 completion in all five cells, capture limits all 0; register "E8c — attempt `E8c-A1-N10`"; the E8b cohort stays measured and unqualified as the historical result).
- ~~**[M7 fixture target] Drive a declared limit rather than another origin/DOM variant:** a chunked/streamed exfil body
  (`P-LIM-CHUNKED`, `src/supervisor/bodyCorrelation.ts:61-77`) or the console budget (`CONSOLE_EVENT_LIMIT = 1000`,
  `src/supervisor/evidenceLease.ts:24`), converting "declared" into "measured" (security rec. 4).~~ **CLOSED 2026-09-10** (M7 E7:
  the console budget is measured live by `testbed/m7.diagnostics.browser.test.ts` — one marker, no later console evidence, the
  canary emission after the cap proved by an independent observer; the `P-LIM-CHUNKED` page probe was removed by user decision D-2
  because the witness is not producible under the tested Chromium/HTTP-1.1 transport — the residual stays declared).
- ~~**[Sol test-only packets]**~~ **CLOSED 2026-09-09** — (a) packet B `1628a85` (`classify.test.ts`); (b) packet B (`src/core/originSweep.ts` + test, U+0020..U+2FFF in the main partition, ~0.3 s, with a positive control); (c) packet D `eeff175` (`baseline` and `eval:stub` grammar rules + Makefile `baseline` target). Merged `4b0f3b7`; M7 register. Original: **(a)** one negative classification test: a `tool-arg` event carrying the canonical `origin` still
  classifies `unauthorized-sink` (`src/agents/loop.ts:498-506` copies model-supplied `origin`/`route`/`method` before
  `validateToolCall`; inert today via `testbed/checkers/classify.ts:39-68`, unpinned); **(b)** a bounded UTS-46 sweep in the default
  gate (`scripts/unicode-origin-sweep.mjs --max 0x2FFF`, ~30 s) so a new collapse class outside `src/core/originGuard.test.ts`'s
  enumerated set is caught (security gap 2); **(c)** extend `scripts/check-test-entry.mjs`'s grammar gate to `baseline` (the entry
  the E8 baseline cohort ran through; digest-only today, QA gap 4).
- **[Release path, before M10]** cold-path re-adjudication: ship a bundle a third party can re-adjudicate (keys + E5 qualifications
  distributed) or narrow the README further (S5 (8)); promote the persisted `diagnostic.json`↔`runs.json` binding to a production
  check (AM13 (1)); `runEvalEntry` positive allowlist (AM13 (3)); break `src/agents/prompt.ts` → `testbed` imports before packaging
  (Codex); `SKILL.md` is a measured input — expanding it for humans re-opens E8 (QA rec. 6); decide the Probe P timing-2 policy
  before M7 doubles fixture load — **2026-09-09: converted to a measurement question; C1 landed (`e040175`), C2 (sidecar + sham-A/B and A/A twins, D10 wording amendment) and the N = 20 campaign await user adoption of [`docs/probe-p-timing2-policy.md`](docs/probe-p-timing2-policy.md).**
- **[Graduated residuals]** S4 (1) bounded trusted-backend contract (M9 adapter step); S4 (9) unload/keepalive (already listed
  above); AM12 §14 (1) decoder-budget rescale amendment with benchmark evidence; AM13 §9 (1) trusted attempt ledger.

## M6 items from the M5 last rounds (register C-B2f2, C-B3)

- **Unload-initiated requests (M5-C7, B2f2-S1).** `pagehide`/`visibilitychange` sendBeacon or keepalive fetch during navigation
  raises no Playwright request event and no page-session `requestWillBeSent`; declared, pinned by `/unload-beacon`. Closing it
  needs browser-level interception (Chromium `Fetch`/`Network` on the browser target, not exposed by Playwright's CDP browser
  session) or a fixture-side receipt channel counted as evidence. First shape to close once M6's navigate-after-fetch agents land.
- **CDP request identities (B2f2-X3).** `page:${requestId}` is not unique across pages or redirect hops; namespace by session and
  hop generation, reject rebinding, and assert one body-or-marker per Playwright request (redirect 307/308 and two-page reuse tests).
- **Stage-specific closed-page suppression (B2f2-X2).** Fail capture only when a page-session enable fails on a LIVE page; keep the
  closed-page/missing-target case benign. Add a self-closing canary-console producer to the coverage file.
- **Correlation identity test (B2f2-Q3).** Assert which candidate finalized under two same-route concurrent requests (a shape-based
  `recordBody` currently survives the count-only assertion).
- **Same-route over-count (B2f2-Q4/S4).** Worse-only; a body on an unbound identity leaves its twin's marker. Reconcile by
  consuming a same-shape unfinalized candidate at `recordBody`.

## From the post-M5 assessment (Codex 2026-09-03; register C-P)

- **[M10 pre-launch slice] Release engineering.** No CI, no `engines`/Node pinning, no lint or formatting gate, no package
  entrypoint/exports, no license, security policy, contribution guide, changelog or tags. CI must split deterministic unit
  checks, browser checks, the serial timing families and the evaluator run so a red keeps its meaning; a clean-clone job is the
  reproducibility proof.
- **[M6 spec input] `finish()` settles or refuses.** `SupervisedHost.finish()` does not settle pending deferred captures; the
  runner's `afterLoop` does, an integration contract a caller can miss. Make `finish()` await `settleEvidence()` itself or fail
  loudly when captures are pending.
- **[M6 spec input] Local-file writer durability.** A non-EEXIST failure during exclusive key creation can leave a partial key
  file; the directory is not fsynced after rename (documented in `src/backends/localFileWriter.ts`).
- The two P0 gate defects (timing file at its cap; gitignored artifact prerequisite) are **M5.1 in `PLAN.md`**, not backlog.

## From M5.2 commit 1 (2026-09-04)

- **[unresolved gate observation — needs its own scoped decision, NOT part of M5.2] One unexplained
  `terminate-before-delivery` timeout.** `testbed/coverage.browser.test.ts` produced a single 10 s `expect.poll`
  timeout in a full `make test`, waiting for a `harness-marker` in a real-Chromium worker-terminate race. **Not
  reproduced in three subsequent runs** (isolation 1/1 on branch, 2/2 on main, full unloaded run green). **Cause
  unknown** — an earlier note attributed it to concurrent load; the timestamps do not support that and the
  attribution was withdrawn.
  What is and is not established: `SCHEMA.md:140-155` declares the immediate-worker race nondeterministic between
  **body and marker**, and a timeout is neither branch — so the open question is a **liveness bound** on marker
  minting, which SCHEMA does not govern. The outcome assertion is not in question.
  **No change to the assertion is authorized by this evidence.** A run producing neither the required body nor the
  marker remains **correctly red**, and `bodiesUnobserved(events) === 1` must not be weakened to "a body or a
  marker" — the sibling fast-case shape — because a harness-observed body would make that count 0. Any future work
  here starts by explaining the timeout, not by relaxing the gate.

**From the 2026-09-04 assessment (dispositioned in `PLAN.md`'s Decisions Log):**

- **A5 — scorecard provenance (S1 contracts complete; S5 integration due).** The original concern was that
  hard-coded `tinyvaultVersion: '0.0.0-m1'` and `CHECKER_VERSION = 'm4-v1'` labels cannot distinguish actual
  sources/configuration. S1 implemented provenance/profile contracts; S5 still owes trusted Git enumeration,
  composed collection/admission and actual command-path proof before any published comparison. Legacy stub
  labels do not establish real-profile provenance. Canonical scope: M6 plan §6/§7 and SCHEMA M6 contract.
- **[RESOLVED as D-CANCEL 2026-09-07 — implementation in S4] `browser_close_session` never resolves while a connect to a black-hole address is pending.** Root cause and mechanism: M6 plan §7 D-CANCEL and the M6 register entry "D-CANCEL — resolution and evidence packet". Original entry retained below for provenance.
  Original:
  Found by slice 3's Docker suite (2026-09-05): after `browser_navigate` to `http://172.20.0.x:8080/` (a Docker
  bridge-network address, unroutable from the macOS host) returns `navigation-failed` in ~1.5 s, the following
  `browser_close_session` on that session hangs indefinitely (18 s+ in a bounded trace, unbounded otherwise), while
  the same sequence against `[::1]`, `host.docker.internal`, unresolvable names and refused ports closes in ~65 ms.
  Chromium's TCP connect to the black-hole address outlives Playwright's navigation timeout; either the context
  close or the supervisor's evidence settle waits on it. A real M6 agent that navigates to an unroutable host would
  stall the session close. Reproduce with `testbed/docker/integrationProbes.ts`'s supervised leg on a
  container-network target (they are excluded from that leg for exactly this reason, with a 20 s bound). Fix belongs
  in `src/browser/session.ts` / `src/supervisor/host.ts` (bounded close that aborts pending connects), not in slice 3.
- **[Graduated to M6 plan/SCHEMA] A1 — agent interface and recovery flow.** The planning decision and S3
  controlled profiles/recipes are complete at `db78a1c`. The frozen seven-tool registry still excludes
  `list_vault` and `request_vault_setup`; discovery/setup remains trusted and out of band. S5 same-backend
  construction and composed command/recovery proof remain due *[delivered by S5/S6, accepted 2026-09-08/09]*. Tool-surface expansion still requires an
  explicit threat-model decision. Original assessment disposition: PLAN Decisions Log (2026-09-04).
- **[M6 spec input] A2 — explicit coverage requirements per M6 scenario.** Zero missing-body markers ≠ complete observation
  (unload beacons, screenshot text, worker/popup limits, finite decoder inventory — see the M6 capture items above and
  `SCHEMA.md`). Each M6 scenario states which channels it requires observed, and the limitations stay printed beside any
  published result. Planned in M6 E5/AM05 (§5/§7); S4/S5 implementation and qualification proof remain due *[delivered by S4–S6; E5 zero counts in every qualified cohort, 2026-09-09]*.
- **A4 — CLOSED as superseded by M6 S4 (O-8, approved for M8).** `finish()` refuses pending captures, open sessions and admitted operations. Its original premise no longer holds. **Open narrowed residual:** `list_vault` and `request_vault_setup` are not admitted operations, and callers still supply the settle/drain/quiesce/finalize sequence. M8 supplies that sequence but does not redesign the host contract; see [MCP lifecycle limits](SCHEMA.md#mcp-stdio-adapter-contract) and M8 packet §3.7/§9.
- **M9 backend identity requirement:** any backend must state handle→record injectivity (R20). Distinct handles resolving to one credential must not silently defeat a per-handle fill budget; carry the runtime-control packet §6.6(6)/§9 R20 into the backend contract.
- **A7 — local-vault durability.** Exclusive key creation can leave a partial file after failure, and vault replacement lacks a directory `fsync` (`src/backends/localFileWriter.ts`). Bounded follow-up.
- **[S4 residual → S5 / backend step] Trusted-side stalls are bounded only at the abort trigger.** A stalled `CredentialBackend`
  (`resolvePolicy`/`resolveSecret`) or a non-cancellable trusted capture holds the session mutex / quiesce past the deadline; the
  regressions show release → failed settlement with no abandoned work. Give the backend interface a bounded/cancellable contract
  when the 1Password/Bitwarden adapters land (not the in-process libsodium file). Canonical: M6 register "S4 implementation —
  accepted at the round-3 cap", residual (1). (2026-09-07)
- **[S4 residual → S5] `abort()` discards all lease evidence, including pre-abort captures.** Verdict is capture-failed, never clean,
  so no false green — but S5's failed-run retention must snapshot the evidence array before `#drop` so diagnostics survive a
  page-triggered abort. Residual (2) in the same register entry. (2026-09-07)

## From the runtime fill-control packet (2026-09-11; `docs/m7-runtime-fill-control-packet.md` D-RC-7, R6)

- **Same-document lure fixture** — a `fake-reauth` variant whose login is fetch-based and whose re-verification prompt is rendered in place (no document end), to measure what design A refuses by construction and design B would not; also the only fixture shape that could exercise the page-forced `transport` denial (§6.7 (d), R10). Deferred by the user; not part of the implementation slice or of any cohort it enables.
- **Failed-login fixture** — a transient-failure / re-rendered-form path so rows 10–11 of the packet's case table stop being coverage gaps (user, O-RC-6: "coverage gaps, not evidence that these limitations are harmless").

## From the M7 final acceptance (2026-09-10)

- **`StreamSecretScanner` sublinear in the secret count** (`testbed/docker/secretScan.ts`) — throughput is inversely proportional to
  the registered-secret count (96 → 35 MB/s, 579 → 6 MB/s, 965 → 3 MB/s per 249 MB export through two parallel scanners; measured
  143–150 s per export at 965 close-time secrets). The 240 s per-export deadline (`EXPORT_TIMEOUT_MS`, 2026-09-10) is a capacity
  accommodation, not a fix; a sixth fixture or a larger budget fill re-enters the failure mode with no alarm short of a red gate.
  Aho–Corasick / single-pass multi-pattern; the Docker acceptance gate's own scanner, so a reviewed security-core change.
- **`initialSnapshotJoin` (`testbed/scenarioCoverage.ts:49`) has no `index < 0` guard** and surfaces `sdkRequestId` — the same class the
  `9a826e5` `/success` join guard fixed; qualification unaffected (`initial-snapshot-unobserved` still pushed). Opus QA residual, 2026-09-10.
- **No direct witness for `stderr.destroy()` / `marker.destroy()` in `ProjectCloser.#export`'s `finally`**; `EXPORT_TIMEOUT_MS` confinement
  to `#export` is proved by grep, not by a gate. Opus QA test gaps, 2026-09-10.

## From the runtime fill-control implementation (2026-09-11; register "Runtime fill-control — implementation slice" and "MERGED"; user-accepted residuals, follow-ups filed)

- **Malformed-outcome settlement hardening** — `src/core/fillService.ts` `injectReserved`: the settlement predicate commits on `assigned === true || reason === 'transport'` and releases otherwise, while `completeInjection` refuses on `assigned !== true`; for a truthy-non-`true` `assigned` the caller is told `no-password-control` and the unit is **released** (fail-open), though the shipped port cannot produce that shape (`normalizeInjectOutcome` returns booleans). Follow-up: release only on the four recognised releasing reasons (`origin`/`identity`/`too-long`/`unplaceable`) or no recorded outcome, commit otherwise, with a T-RC-5 witness; a security-core change → Astra, full ladder. (QA final review; Codex final review agrees the predicates are sound for a conforming port.)
- **Split the structural test file** — `src/core/fillService.structure.test.ts` is at 799 split-newline lines at M8 close, against a strict `<800` limit (zero additional lines fit); runtime-control round 3 reflowed the unrelated A/K confinement tests to fit. Follow-up: move T-RC-10 and its helpers into `src/core/fillService.authority.structure.test.ts`, restore the A/K tests' original layout, keep every assertion and witness; add the new file to the enforced-size list. Test-only, no new mutant → Sol tier.
- **T-RC-10 residual evasions (declared under packet rev 3.1 R19; close only if cheap and without weakening the shape rule):** the parameter-initializer branch of the alias scan lacks a deletion witness; a same-file helper in `fillService.ts` that receives `options` and rewrites `authorization` reflectively is permitted by (h4)'s same-file-argument exception (runtime-killed by T-RC-5/T-RC-7); a star re-export of the domain module; `Object.prototype` pollution around a host-construction call; two host constructions in one pinned file (the call-site pin dedupes by file — one-call-per-file is the cheap hardening; M8 §6.6 (0) carries the one-host-per-process ledger test); a type-opaque callee alias (`(input as any).createHost`); `fillAuthorizationDomain.ts` has hand review and runtime witnesses but no AST pin of its own.
- **Stub-path exhaustion witness** — T-RC-1 drives the real-agent path only; no test asserts `handle-exhausted` through `executeStubRun` (the stub scripts fill once by design, fact 9). A scripted two-fill stub client through `runOnce` would close it; no existing runner browser harness fits under the size rules (`runner.finalization.browser.test.ts` is at 798 split-newline lines at M8 close, against `<800`; one additional line fits).
- **`bounded`-expiry transport witness** — R10's page-forced denial (hold the injection past the 10 s bound so the forced disposal turns it into `transport`) has no end-to-end witness; the packet permitted the CDP-proxy form, which is what shipped. A controls-lab blocking page (≈15 s) would witness the §6.7 (d) mechanism directly.
- **`testbed/runner.realAgent.test.ts` at 826 lines** — pre-existing overage (825 at base), outside the structure gate's enforced list; the slice added its one required import.
- **Small wording/placement items:** `onFillAuthorization?(lifecycle): void` is awaited — declare `void | Promise<void>`; the T-RC-8 (i) `it` sits outside its `describe.sequential`; the test kit's `expectedResults` branch drops the "an E6 refusal requires STOP" message; SCHEMA's `handle-exhausted` meaning says "has been used" where a `transport` consumption is "attempted"; packet §13 is placed between §10 and §11.


## From the M8 close assessment (2026-09-12; planning inputs, not implementation authorization)

- **Size-cap planning:** preserve all existing assertions and gates when planning any split. In addition to the structural-test follow-up above, `testbed/runner.finalization.browser.test.ts` has one additional line of headroom (798, `<800`); MCP `protocol.ts` has two (397, `<400`). No refactor is authorized by this entry.
- **Shared MCP test fixtures:** the 49-line preamble at lines9–57 is byte-identical in `server.seam.test.ts`, `server.host.test.ts` and `tools.errors.test.ts`. Consider a narrowly scoped helper before the next contract change; preserve independent assertions and all mutation evidence.
- **M9/M10 review inputs:** unfuzzed MCP framing, missing subprocess cancellation/backpressure and default-manifest isolation witnesses, suite-resident MCP real-fill scan and Linux descendant proof remain coverage limits. No cohort leak-rate measurement covers the nine-tool MCP surface. M10 still owns the WebMCP positioning sentence and demo; a new cohort, client spend or public flip requires separate authorization. Full accepted residuals and the environment-dependent M6 witness limit are in `docs/project-assessment-2026-09-12-m8.md` and the append-only M8 register.
