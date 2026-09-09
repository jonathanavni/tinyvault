# M6 milestone-close assessment — 2026-09-09

Candidate: `main` at `50e96e999360c2e7b3c8b3c98e2823af42a55a85` (frozen clone read by every channel); accepted executable source `3072e0b` — byte-identical under `src`, `testbed`, `scripts`, `Makefile`, `package.json`, `package-lock.json`, `tsconfig.json` and every `vitest*.config.ts` (`git diff --stat 3072e0b..50e96e9 -- <those paths>` is empty; every commit since is documentation).
> **Integrator note (2026-09-09, same session):** the M6.1 remediation this assessment owes **landed** — packet v4 at the Sol paper cap, Astra slice + Extension 1, three-channel review, owner gates green, merged `7ae23be`; the README narrowing below was lifted in `352e465`. Register entry "M6.1 receiptless-row canary authentication". Everything else here stands as written at the close.

Continuity owner: Claude, session `2026-09-09-m6-close`. This is the read-only cross-model project assessment CLAUDE.md requires after a milestone close: whole-M6 synthesis after S6 acceptance, not another slice round. No M7 implementation, no release, and no change to a locked requirement, threshold, gate, claim row or accepted residual is authorized by it.

**Owner VERDICT: M6 CLOSED — with one P1 remediation owed.** The E1–E10 acceptance stands on the retained evidence: all three blind channels grade E1–E6 and E8 met (with declared limits), E9 met with the declared cold-path limit, and E10 recorded, and none found a defect in the fill service, origin pinning, post-fill lockdown, redaction or the gate root of trust. The Codex channel found one **verified P1 cross-slice admission gap** (`M6C-CODEX-P1-01`, below): a baseline run that earned no completion receipt has its canary authenticated only by that receipt, so an edited bundle can under-report *baseline* leaks while staying `qualified`. It does not touch the reference's 0/30 (a receiptless reference row fails `assertEvalPass`), and it did not touch the recorded cohorts (every baseline row completed, so every canary was authenticated by a fixture-signed commitment). It becomes the **M6.1 remediation slice** — full ladder, Astra-implemented, security channel — owed before M7's first live cohort and before any bundle is published; the README evidence claim is narrowed now. All three channels' original verdicts were NEEDS-ATTENTION; the P2 (the README described `make eval` as the scripted stub) and every P3 status-drift item were verified and corrected in this session. No M7 implementation, no release, and no locked requirement, threshold, gate, claim row or accepted residual changed.

## What M6 delivered

M6 put real agents in front of the M5 fixtures behind the M5.2 Docker-composed path: provenance and profile contracts (S1), the real SDK wire capture with exact seven-schema boundary (S2), the controlled reference and naive-baseline profiles and recipes (S3), trusted quiescence, cancellation and finalization (S4), the composed real-agent command path with offline re-adjudication (S5), and the acceptance ladder (S6): three literal clean-clone gates on `3072e0b`, a six-cell pilot READY under the fail-closed readiness rule (`cY3Deep4`), and one pre-declared N10 sequence `E9-A3-N10` — baseline `z22Kn2eT` (30/30 leaks, 30/30 completed) then comparison `y9WmFqoL` (reference 0/30 leaks, 30/30 completed; baseline 30/30 leaks, 30/30 completed) — both QUALIFIED, with the E10 trace recorded from the lookalike cell. Three user-adopted amendments (AM12 evidence caps, AM13 pilot readiness vs. N10 qualification, F1 `assertedOrigin` schema description) and one companion slice (`evidence-oversized`) ran the full ladder in between; attempts 1–2 are preserved as unqualified under the v1 protocol and are not comparable to attempt 3.

| Command / stage (owner-run, register-recorded) | Result |
| --- | --- |
| Literal clone → `npm ci` → `make browsers` → `make test` ×3 on `3072e0b` | 2896 tests / 2895 passed / 0 failed / 1 expected opt-in skip in each run; timing-1 5/5, timing-2 20/20, execution PASS; no Probe P rejection |
| `make test-docker` on `3072e0b` | 7/7, execution PASS |
| Pilot (`cY3Deep4`, N=1 × 6 cells) | READY: reasons exactly `['pilot-not-qualification']`, all six runs verified, E5 counts zero |
| `TINYVAULT_N=10 make baseline` (`z22Kn2eT`) | 30 runs, exit 0, `qualified`; 10/10 leaks and 10/10 completed in each cell |
| `TINYVAULT_N=10 make eval` (`y9WmFqoL`) | 60 runs, exit 0, `qualified`; reference 0/10 leaks 10/10 completed per cell (pooled 0/30, Wilson 95% CI 0.0–11.4%); baseline 10/10 leaks per cell (pooled 30/30, 88.6–100.0%); in-command no-provider re-adjudication deep-equal |

Not run by this assessment: a new clean-clone installation, the runtime/browser/Docker/eval suites, a new mutation campaign, a new cohort, external vulnerability scanning. No executable byte changed since the retained gates ran, so they were verified against the register rather than repeated. The cohort evidence archive (`artifacts/review-evidence/tinyvault-m6-s6-acceptance-20260908/`, tarball + sha256 manifest) is owner-held and gitignored; the reviewers could not read it and say so.

## Channels

Three blind, read-only channels read the same frozen clone and the same packet (`artifacts/review-evidence/tinyvault-m6-close-20260909/m6-close-assessment-packet.md`, SHA-256 `8ec0bfe66ff4b003134299196327ccc1ac9ed3daef15a637171eccf4fb27876d`). None could execute anything or read the gitignored `artifacts/`; every count they quote is the register's. Raw reports, prompts, event streams and request manifests are archived (local) under `artifacts/review-evidence/tinyvault-m6-close-20260909/`.

| Channel | Dispatch | Original verdict | Report | SHA-256 |
| --- | --- | --- | --- | --- |
| Codex GPT-6 Astra | `codex-companion.mjs task --fresh --model gpt-6-astra`, read-only sandbox, cwd = frozen clone; thread `01a0866c-55fd-7660-aedf-7eb7b86cd430` | NEEDS-ATTENTION (1 P1, 1 P2, 1 P3) | `astra-report.md` | `511f5a8c61461e2df021f6cf92019676830248872294553a4111d9e7aa733eaf` |
| Claude Opus 5 QA | `scripts/claude-review.mjs --channel qa --base 50e96e9`, tools Read/Glob/Grep; session `bb959de7-3adf-4c87-9a65-7c4f7c46aa20` | NEEDS-ATTENTION (0 P1, 1 P2, 4 P3) | `claude-qa/report.md` | `40cc30c6feac4341f3fd5d6923ccf2283ec312c6b9d802e7eddbf090761c266d` |
| Claude Opus 5 security | `scripts/claude-review.mjs --channel security --base 50e96e9`, methodology `templates/claude-security-review.md`; session `bb117fc3-e462-4f0d-902b-647feceaef85` | NEEDS-ATTENTION (0 P1, 1 P2, 3 P3) | `claude-security/report.md` | `cece17a115b464ea940b3293b6c8e3903214e89387d4a56cd0e667202708e785` |

The two Claude channels are same-family review of a tree whose security core was Codex-implemented; the Codex channel is the different-family look at the same tree. Both Claude reports' `candidate.json` record base = head = `50e96e9`; the Codex log shows only read commands (`cat`, `nl`, `sed`, `rg`) and no writes. The frozen clone's status was clean before and after.

## Findings verified line by line and dispositioned

Every finding was re-read at its cited lines in the candidate before disposition. "Fixed" means corrected in this session's docs pass on `main` (the frozen candidate is unchanged).

| ID | Independent finding | Owner evidence and disposition |
| --- | --- | --- |
| **M6C-CODEX-P1-01** | **Receiptless baseline rows carry an unauthenticated canary; an edited bundle can under-report baseline leaks and stay `qualified`.** `verifyFresh` returns `malformed` for a missing receipt before the `canaryCommitment` comparison (`testbed/completion.ts:93-101`); `verifyRunCompletion` rejects a *present* invalid receipt only (`testbed/checkers/offline.ts:467-470`); the events signature binds fixture ID, run ID and event bytes only (`testbed/fixtures/shared/eventsDigest.ts:4`); `assertAttestedExecution` compares the bootstrap to the *public* task facts, never the seeded password to `evidence.canary` (`offline.ts:246-253`); `leakScan` and the positive control then search for the manifest canary (`offline.ts:353,402`); `assertOutcomeAgreement` is plain equality against the runner-authored `runs.json` (`offline.ts:548-556`); baseline completion is not required by `assertEvalPass` (`testbed/evalAgents.ts:52`, `testbed/scorecardAggregate.ts:158-171`) and AM13 permits baseline noncompletion. The M5 register declared the shape and relied on `assertEvalPass` as the mitigation (`docs/m5-review-findings.md:266`); M6's baseline policy removed that mitigation without anyone re-deriving the consequence. | **CONFIRMED by owner reading of every cited line; no source-canary binding exists anywhere in the offline path (`grep` for a canary↔source check: none).** Reach today: the cold path does not exist (verification keys and E5 qualifications are invocation-held), and the live command re-adjudicates its in-memory input; the reaching input is an adjudication run with the fixture keys over an *edited on-disk* bundle — exactly what a published bundle (M10) would invite. The reference's 0/30 is unaffected (a receiptless reference row fails `assertEvalPass`). **The recorded cohorts are unaffected:** `z22Kn2eT` and `y9WmFqoL` baseline rows completed 30/30 and 30/30, so every canary was authenticated by a fixture-signed commitment. **Disposition: P1 agreed → M6.1 remediation slice** (full ladder; Astra; security channel): authenticate a receiptless row's canary against the fixture-signed events — the baseline's seeded bootstrap password sits in the signed `sdk-request-context` event that `assertAttestedExecution` already parses — and add the composed publication mutant Codex specifies (receipt removed + canary substituted + outcome restated, positive-control sibling intact, signed events unchanged; `real-baseline` and `real-comparison`), paired with a legitimate receiptless baseline row that still admits. The README claim is narrowed now (`README.md` "What a green scorecard does and does not prove"). E7 is graded **met-with-recorded-P1-residual**, not "not-supported": exact inventory, independent paths, capture agreement and per-cell controls are evidenced; the gap is one authentication composition for receiptless baseline rows. |
| M6C-CODEX-P2-01 / M6C-QA-P2-01 / M6C-SEC-P2-01 | README described `make eval` as driving a scripted stub and named it as the reproduce command; the profile default is `real-comparison`, which requires `ANTHROPIC_API_KEY` and spends 60 live runs (`testbed/evalEntry.ts:11,17`; `package.json` `eval` vs `eval:stub`) | **Confirmed by all three channels independently; fixed** — the eval paragraph now states the real comparison, Docker and key prerequisites, `make baseline`, and `make eval-stub` as the deterministic path; the reproduce block names the key. |
| M6C-CODEX-P3-01 / M6C-QA-P3-03 / M6C-SEC-P3-03 | Post-acceptance status drift: `docs/m6-implementation-plan.md` header (S3-era; D-CANCEL "OPEN" at :6, :101) and :104 "S6 remains due"; `docs/README.md:11` "S6 next"; `docs/phase-0-plan.md:537-543` build status through S3 and :371 stale 2791 count; QA also cited `docs/phase-0-plan.md:161` | **Confirmed; fixed** (owner note atop the M6 plan, D-CANCEL lines annotated, :104 rewritten, index and phase-plan refreshed with M6 ✅). The QA citation of `phase-0-plan.md:161` is **misattributed** — that sentence is `SCHEMA.md:161`, corrected before the report arrived. |
| M6C-SEC-P3-02 | `docs/m6-implementation-plan.md` AM12 row ended "Not yet implemented" although AM12 merged `623a8b7` and the N10 evidence was gated under it | **Confirmed; fixed** (row cites the merge). Off by one line in the report (:119 → :120) because of the owner note inserted above it. |
| M6C-QA-P3-02 / M6C-SEC-P3-04 | `docs/README.md:122` opened "DRAFT v4, NOT ADOPTED" for AM13 | **Confirmed; fixed** ("v5, ADOPTED 2026-09-09"). |
| M6C-QA-P3-04 | The canned `7/10` figure E10 forbids stands unannotated in `PROJECT-SPEC.md:36,155` | **Confirmed; annotated** as illustrative pre-measurement figures beside the measured result (annotation, not a spec amendment). |
| M6C-QA-P3-05 | `testbed/runner.eval.test.ts:107` pins `1_800_000` ms; an M7-sized cohort (5 × 2 × 10 ≈ 32 min at ~19 s/run) exceeds it | **Confirmed** (literal present; `vitest.eval.config.ts` sets no `testTimeout`). Fail-closed. → `BACKLOG.md` M7 entry input. |
| QA test gap 3 / SEC "checked and found sound" | `eventLocation` copies model-supplied `origin`/`route`/`method` onto `tool-arg` events before `validateToolCall` (`src/agents/loop.ts:316,329,498-506`); inert because `classify` grants `authorized-sink` only to `network-body`/`browser` or `dom-fill`/`fill-service` (`testbed/checkers/classify.ts:39-68`); nothing pins the inertness | **Confirmed.** → `BACKLOG.md`: one negative classification test (Sol test-only packet). |
| QA test gap 4 | `scripts.baseline` / `eval:stub` have no grammar gate (`scripts/check-test-entry.mjs` pins `test`, `test:docker`, `eval`; Makefile loop pins `test`, `eval`); digest-only protection | **Confirmed**; inside the declared reviewed-root-of-trust residual. → `BACKLOG.md`: extend the grammar gate to `baseline`. |
| SEC test gap 2 | `scripts/unicode-origin-sweep.mjs` is not in `EXPECTED_TEST_COMMANDS`; the named collapse classes are pinned in `src/core/originGuard.test.ts`, a *new* class would not be | **Confirmed** (script present; absent from the test contract). → `BACKLOG.md`: bounded sweep in the default gate before M7. |
| SEC test gap 4 / rec. 4; CODEX rec. 3–4 | No fixture drives the console budget (`CONSOLE_EVENT_LIMIT = 1000`) or `P-LIM-CHUNKED`; `testbed/runner.realAgent.eval.ts:12-13` hard-codes three scenarios; prompt/capture budgets need requalifying for M7 recipes | **Confirmed as M7 inputs** → `BACKLOG.md`. |
| SEC rec. 7 / QA & CODEX "not verified" | `50e96e9` ≡ `3072e0b` executable identity was an owner statement | **Made machine-checkable:** the exact `git diff --stat` command and its empty output are archived as `source-identity-3072e0b-50e96e9.txt` in the evidence directory and quoted in the register entry. |
| SEC residual note | A top-level `blob:` document inherits the creating origin, so a fill into `blob:http://<canonical>/…` would succeed; `TopObservation.path` is null for non-http(s) schemes | Inside the declared compromised-authorized-origin exclusion; recorded here, no change. |
| CODEX maintainability | `src/agents/prompt.ts:2,4` imports runtime inventory behaviour and a type from `testbed` — packaging coupling for M10 | **Confirmed** → `BACKLOG.md` release-path input. |

## E1–E10 crosswalk (three channels, owner synthesis)

| Criterion | Codex | QA | Security | Owner |
| --- | --- | --- | --- | --- |
| E1 identity and provenance | met-with-limits | met | met-with-limits | **met** (S1 R3, S5 command wiring; `source-drift` fail-closed at `testbed/runner.ts:188`) |
| E2 real SDK, exact boundary | met-with-limits | met | met-with-limits | **met** (S2 final R3; frozen seven-tool registry, pre-executor rejection) |
| E3 comparable interface | met-with-limits | met-with-limits | met | **met-with-declared-limits** (AM13's v2 baseline recovery is a disclosed asymmetry; attempts 1–2 non-comparable) |
| E4 recovery, real decisions | met-with-limits | met | met | **met** (production-adapter recovery rows; real decisions observed in pilot 3 and N10) |
| E5 capture applicability | met-with-limits | met | met-with-limits | **met** (zero `unobserved`/`bodiesUnobserved`/`scanTruncated` in every pilot and cohort run; `screenshot-text` declared) |
| E6 end/close correctness | met-with-limits | met-with-limits | met-with-limits | **met-with-declared-limits** (S4 residuals 1, 3, 4, 6, 7, 9) |
| E7 offline measurement | **not-supported** | met | met | **met-with-recorded-P1-residual** — `M6C-CODEX-P1-01` → M6.1 |
| E8 outcome and alarm | met-with-limits | met | met | **met** (reference 0/10 and 10/10 per cell; every baseline cell leaks with its positive control; gates run in code before `qualification.json`) |
| E9 reproduce and evidence | met-with-limits | met-with-limits | met-with-limits | **met-with-declared-limits** (cold-path re-adjudication not runnable by design — S5 (8); Probe P policy deferred) |
| E10 early demo | met-with-limits | recorded | recorded | **recorded** (same cohort, same cell, run IDs, provenance, event indices, checker results) |

No criterion rests on a pointerless owner statement; every row traces to a register entry that names its local evidence directory.

## Residual sweep at M6 close (owner, 2026-09-09)

Every residual declared during M6 (S4 → E9 attempt 3), with its disposition at milestone close. Status values: **carried** (declared limit, unchanged, stays in its register entry), **closed** (with the closing commit), **superseded** (overtaken by a later event, recorded), **→ backlog** (graduated to `BACKLOG.md` as an explicit M7+/release input). Nothing here re-opens a capped round.

| Source | # | Residual (short) | Disposition at M6 close |
| --- | --- | --- | --- |
| S4 | 1 | Stalled TRUSTED backend / non-cancellable trusted capture bounded only at the abort trigger | carried → backlog (bounded backend contract for the 1Password/Bitwarden adapter step, M9) |
| S4 | 2 | `abort()` discards pre-abort lease evidence | closed in S5 (array snapshotted before `#drop`) |
| S4 | 3 | Page-scoped producers suspended; nested/service-worker targets counted, gen 4+ markers | carried (declared in SCHEMA) |
| S4 | 4 | Socket release proven by owner SYN_SENT observation, not a test assertion | carried; test-gap candidate for M7 |
| S4 | 5 | E5 publication rejection not production-wired | closed in S5 |
| S4 | 6 | G16: no round-1 timing distribution retained for the tripwire real-click family | carried (measurement record only) |
| S4 | 7 | `browser_open_session` outside the per-op bound (not page-reachable) | carried |
| S4 | 8 | Unmutated arms (courtesy deadline, suspension reserve, G3 14 s, recovery-loop guard) | closed by the Sol test-only packet `46ae3df`, with the 2026-09-08 correction (Arm D killed by the timing family, not the finalization case) |
| S4 | 9 | M5-C7 unload/keepalive limits unchanged | carried → backlog (already listed: unload-initiated requests) |
| S5 | 1 | Claims-table mutation sites named `deriveLeakFromEvidence` instead of `readVerifiedRunEvents` | closed `dfb8ddb` (S6 claims amendment) |
| S5 | 2 | `G5-disk-snapshot` killed off the command path | carried |
| S5 | 3 | `tool-rejected` never produced by the runtime; offline rule unexercised | carried; test-gap candidate |
| S5 | 4 | Bootstrap comparison is projection-equality (digest pinned separately) | carried |
| S5 | 5 | `execution.sdkVersion` provenance-bound, not recomputed from attested bytes | carried |
| S5 | 6 | At N>1 a cell can be credited by a qualified sibling while another run is E5-unqualified (publication still all-qualified-gated) | carried |
| S5 | 7 | `source.dirty` recorded, byte-bound, not blocking | carried (per SCHEMA) |
| S5 | 8 | Live re-adjudication is same-process; the cold path is E9's offline re-adjudication | carried; see E9-A3 (1): the cold path is not runnable post-teardown by design — the in-command no-provider re-adjudication is the evidence |
| S5 | 9 | Transcript not attested; completeness folded into the attest decision | carried |
| S5 | 10 | Node composed harness substitutes the host for most families | carried |
| S5 | 11 | Model-controlled text can reach bounded `error.message` via the unknown-tool path (not model-visible) | carried |
| S5 | 12 | S4 residuals 1,3,4,6,7,9 unchanged; 2,5,8 closed | meta — see S4 rows |
| S6 companion | 1 | `failureReason`/sidecars runner-authored, unattested diagnostics | carried |
| S6 companion | 2 | Early-terminated partial bundle replays as cohort-level inventory failure | carried |
| S6 companion | 3 | `project-closed` reports a possibly non-unique initiating code | carried |
| S6 companion | 4 | `capturePersistedRuns` propagates the raw terminal error | carried (fail-closed) |
| S6 companion | 5 | Evidence inflated past the cap halts the cohort at that run | carried (bounded) |
| S6 companion | 6 | Partial-bundle persistence guaranteed only for the two terminal kinds | carried |
| S6 companion | 7 | Non-terminal `rejectComparison` callers keep write-first ordering | carried |
| S6 companion | 8 | Real-run body read (`realAgentRun.ts`) unbounded at F8 time | superseded by AM12 (bounded with the 1 MiB cap; see AM12 inventory §4.1a) |
| S6 companion | 9 | M6 killed by an incidental crash; W9 discriminating regardless | carried |
| S6 companion | 10 | Raw host `error.name` in secondary reasons; single-marking-site rule is a convention (W3d) | carried |
| AM12 §14 | 1 | Decoder budgets not rescaled with the 8× cap (≤ ~984 KiB never header-scanned) | carried → backlog (decoder-budget amendment with its own benchmark evidence) |
| AM12 §14 | 2 | Inventory completeness (fixed by fix round 1, §4.1a) | closed within AM12 |
| AM12 §14 | 3 | Redundant 44-byte key argument | carried (defence in depth) |
| AM12 §14 | 4 | Leave-alone synthetic pair in `evidenceOversize.test.ts` | carried (intentional) |
| AM12 §14 | 5 | V13 gate cost owner-measured | closed (measured, recorded in the register) |
| AM12 reg. | 5 | W6 test without explicit timeout at 4.8–4.9 s vs 5 s default | closed `9a90394` (30 000 ms, integrator commit) |
| AM12 reg. | 6 | Probe P timing-2 family rejections on the base tree (2 of 9 that day) | superseded by the user's DEFERRED decision (gate retained, failures preserved, no retry-to-pass); no rejection in any gated run after `3072e0b` |
| AM12 reg. | 7 | V13 run-2 main-partition red with the failing assertion not preserved | closed as tooling (runner now copies every partition report per run); the red itself attributed to (5) |
| AM12 reg. | 8 | Branch copy of the amendment lacked §14 | closed by the merge (main's copy governs) |
| AM12 reg. | 1–4, 9, 10 | decoder limits, redundant clauses, witness schedule, V6/V7 measurement-only, F1 formula witness, round-3 status line | carried |
| F1 | 1 | Declaration-bytes re-freeze is a disclosed AM11 amendment | carried (disclosed) |
| F1 | 2 | Description string's effect on model behaviour observed, not proven | superseded by pilot 3 / N10: observed resolved (reference completed the lookalike cell 10/10) — still an observation, never a proof |
| F1 | 3 | Owner tooling: no commit/review dispatch chained on an ungated result | closed (CLAUDE.md rule + gotcha, `d4307f3`) |
| AM13 §9 | 1 | One-attempt restriction is an owner record, not a trusted ledger | carried → backlog (trusted attempt ledger) |
| AM13 §9 | 2 | O2′ may change baseline distribution; v1/v2 protocols non-comparable | carried (attempts 1–2 preserved as unqualified, non-comparable) |
| AM13 §9 | 3 | Shape B would leave N=10 administrative | moot — Shape A adopted (code-enforced) |
| AM13 §9 | 4 | Transient non-`/success` snapshot can cause a second canonical login | carried; pilot 3 and N10 recorded no duplicate-login anomaly affecting adjudication (complete ordered lists compared) |
| AM13 §9 | 5 | Nothing implemented or run | superseded (implemented `fe8e9e1`; pilot 3 READY; N10 QUALIFIED) |
| AM13 reg. | 1 | Diagnostic↔runs binding guard reflexive on its sole caller; persisted binding test-enforced | carried |
| AM13 reg. | 2 | `runs.json` presence never a readiness signal | carried (by design) |
| AM13 reg. | 3 | `runEvalEntry` allowlist does not reject caller-supplied `realInvocation` | carried → backlog (allowlist hardening) |
| AM13 reg. | 4 | Owner gate/mutant logs bound by digests, not commit labels | closed as tooling (digests recorded) |
| AM13 reg. | 5 | `expectPilot` stdout spy optional | carried |
| AM13 reg. | 6 | O2′ effect observable in pilot 3, not provable | superseded by pilot 3 / N10 observation (see AM13 §9 (2)) |
| E9-A3 | 1 | Post-teardown cold-path re-adjudication not runnable by design | carried (S5 (8)); the in-command no-provider re-adjudication is the evidence |
| E9-A3 | 2 | Owner runner aborted after execution 1 (zsh `status`) | closed (gotcha recorded; cohort unaffected) |
| E9-A3 | 3 | Attempts 1–2 unqualified and non-comparable | carried (preserved as history) |
| E9-A3 | 4 | Baseline `leakChannel` reported as `model-text` (first channel) while the unauthorized network sink is also present | carried; reporting-only — a first-channel label, not an adjudication defect |
| E9-A3 | 5 | Probe P timing-2 gate policy deferred | carried (user decision) |

## Recommendations for M7 and the release path (owner-ranked; each tied to a finding or a declared residual)

1. **M6.1 first** (`M6C-CODEX-P1-01`): authenticate receiptless rows' canaries against the fixture-signed events, with the composed publication mutant and the legitimate-noncompletion counter-case, through the full ladder. Nothing M7 measures should be admitted by an adjudicator with this gap.
2. **Derive the eval-test timeout from the selected inventory** before M7's first live cohort (QA P3-05); at five scenarios the current literal is exceeded by the observed rate.
3. **Decide the Probe P timing-2 policy before M7 doubles the fixture load** (user-deferred; both QA and the S6 register name the T4-8 class as load-sensitive).
4. **Give M7 fixture #3 a declared-limit target** (SEC rec. 4): a chunked/streamed exfil body (`P-LIM-CHUNKED`) or the console budget converts "declared" into "measured".
5. **Add the bounded UTS-46 sweep to the default gate** (SEC gap 2) and the `tool-arg` negative classification test (QA gap 3) as Sol test-only packets; extend the entry grammar gate to `baseline` (QA gap 4).
6. **Before any published bundle (M10):** either ship a bundle a third party can re-adjudicate (keys and E5 qualifications distributed with it) or narrow `README.md` further — the cold-path gap (S5 (8)) is the largest distance between the README's "evidence you can re-derive" and what the artifacts support today; promote the persisted `diagnostic.json`↔`runs.json` binding to a production check (AM13 (1)); harden `runEvalEntry` to a positive allowlist; break the `src/agents/prompt.ts` → `testbed` import before packaging.
7. **Keep `SKILL.md` a measured input:** if M10 expands it for humans, the reference prompt changes and E8 must be re-measured (QA rec. 6).

## Deviations From Handoff

- **Owner gate contamination (tooling, recorded, red preserved).** The owner's first `make test` on the working tree (`artifacts/review-evidence/tinyvault-m6-close-20260909/owner-gate-1-RED-source-drift/`) went red in the main partition: `testbed/realAgentRun.test.ts` "F8 … completed" expected `['pilot-not-qualification']` and got `['source-drift']`, because the owner edited tracked documentation while the pilot-path test held its start-of-invocation source snapshot. The red is not a defect in the candidate; it is the gate doing its job against an owner who edited the tree mid-run. Recorded in `.claude/memory/gotchas.md`; the gate was rerun on a tree left untouched for its duration (result in the register entry).
- The QA channel misattributed one drift sentence to `docs/phase-0-plan.md:161` (it is `SCHEMA.md:161`); the security channel's `:119` is `:120` after the owner note was inserted. Neither changes a disposition.
- No channel modified the frozen clone; the Codex log shows read commands only. No review round was repeated; no locked requirement, threshold, source, claim row or accepted residual changed; M7 and release remain unauthorized.
