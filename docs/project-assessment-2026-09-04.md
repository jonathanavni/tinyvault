# TinyVault project assessment — discussion brief for Claude Code

**Assessment date:** 2026-09-04  
**Reviewed implementation:** `main` at `f161f1b29f81aac5cb720f669d45828d02fd7fd8`  
> **Integrator note (2026-09-04, added when this was committed).** Reviewed at `f161f1b`; the tree has since
> moved — M5.2 slices 1 and 2 are merged (`ab52f8e`, `8133495`), so this document's "M5.2 … slice 1 of 6" state is
> **superseded**. Its `runner.ts` line references are stale where slice 2 split execution into
> `testbed/runnerExecution.ts`; the underlying findings were re-verified against the current tree and stand. Its
> "workflow changes … including adding a native Codex instruction layer are deferred" line is also superseded —
> `AGENTS.md` was added afterwards. Dispositions for A1–A7 are recorded in `PLAN.md`'s Decisions Log; A5 and A7's
> doc half are the two that produced immediate action.

**Purpose:** Summarize the read-only project assessment, verified results, remaining issues, and recommendations. This is an assessment for synthesis, not an implementation packet or a change to locked requirements.

**User decision:** Workflow changes discussed afterward—including changing the Claude/Codex role split or adding a native Codex instruction layer—are deferred. Preserve the current orchestration and review ladder.

**Overall assessment: strong security foundation, working measurement infrastructure, substantial product work remaining.**

TinyVault's supported fill path has clear trust boundaries and extensive verification. The main uncertainty is whether real agents can use it successfully under hostile prompting. The current evaluation proves the scripted path; it does not establish real-agent safety or launch readiness.

The earlier test-gate defects have been repaired. Docker/spec reconciliation has an explicit implementation decision, but the required Docker path is still incomplete. Continue the agreed M5.2 work, then prioritize the smallest credible reference-agent versus naive-baseline comparison.

This report updates the current-state conclusions of the [2026-09-03 assessment](project-assessment-2026-09-03.md). Do not carry forward its two closed gate defects as current blockers. Its M0–M3 milestone descriptions were inaccurate; the mapping below follows the canonical phase plan.

**Shipped state and remaining work**

| Milestone | State at the reviewed revision |
|---|---|
| M0 | Contracts, scaffold, and threat model implemented |
| M1 | Evaluation spine, checker meta-gates, completion oracle, offline adjudication, and scorecard implemented |
| M2 | Secret lifecycle, origin validation, lockdown, mutex, closed results, tripwire primitives, and dependency boundary implemented |
| M3 | Backend interface and policy-bound libsodium local-file backend implemented |
| M4 | Browser fill service and integration security gates implemented |
| M5 | Two hostile fixtures, expanded evidence capture, and bounded decoder inventory implemented |
| M5.1 | Timing-test repair and generated-corpus replacement implemented; clean-clone acceptance recorded |
| M5.2 | Revision 4 locked; slice 1 of 6 merged: transport seam and runtime agent-tool boundary |
| M6 | Real reference agent and naive baseline remain |
| M7 | Additional hostile fixtures remain |
| M8–M10 | MCP adapter, 1Password backend, final audit gate, published instructions/results, and demo remain |

M5.2 still requires daemon preflight, containers and bridge, control capabilities and capture transfer, attestation, and parity/reporting. It is substantial implementation work. See the [six-slice implementation plan](m5-2-implementation-plan.md).

At document creation, concurrent project-state updates mark slice 2 in progress. This report describes the reviewed implementation, not the outcome of that ongoing work.

**Verification performed during the assessment**

These checks ran earlier in this conversation on 2026-09-04 against the revision above. Their logs were checked again when preparing this document; the suites were not rerun merely to write the summary.

| Check | Observed result |
|---|---|
| `make test` | Exit 0: 995 main tests, 5 decoder timing tests, and 10 browser timing tests passed |
| Main-suite skip | One intentionally gated evaluator test; separately executed by `make eval` |
| Typechecking | Passed as part of `make test` |
| Dependency boundary | Passed: 73 production modules, 65 data-plane roots |
| Boundary self-tests | Passed, including real CLI mutations and the 11-fixture / 48-resolution-outcome matrix |
| Acceptance J runtime-result gate | All 10 named tests executed and passed; also included in the main suite, not 10 additional unique tests |
| `make eval` | Exit 0: 30/30 completed scripted-stub runs, zero detected leaks |
| Capture coverage | 10/11 declared channels observed through 16 producers; screenshot text uninstrumented; no marker-only producer in this run |
| Per-cell observation health | `unobserved=0`, `bodiesUnobserved=0`, `scanTruncated=0` in all three cells |
| Authorized live `npm audit` | Zero known vulnerabilities across 77 dependencies |
| Clean-clone installation | Not repeated in this assessment; prior acceptance is recorded in the M5 register C-Q and current project state |

The initial sandboxed test attempt encountered Chromium/localhost permission failures. The approved unrestricted rerun passed. Those initial failures were environmental, not evidence of a product regression.

The scorecard displayed pooled Wilson 95% bounds of 0–11.4%, and 0–27.8% for each 0/10 scenario cell. These are the tool's displayed intervals; repeated scripted runs do not estimate an LLM's failure probability. Keep every current result labelled **deterministic-harness evidence**.

Temporary logs on the assessment machine: `/private/tmp/tinyvault-assessment-test-unsandboxed.log`, `/private/tmp/tinyvault-assessment-eval.log`, and `/private/tmp/tinyvault-assessment-audit.json`. These are ephemeral; the verification summary above is retained here. Generated scorecards under `artifacts/eval/` may be replaced by subsequent evaluations.

**Codebase quality**

The strongest choices are trusted-side origin policy, one-shot secret handling, isolated-realm assignment, pre-fill locking, serialized browser operations, closed results, and offline outcome recomputation. Tests exercise refusal paths, real Chromium behavior, mutation sensitivity, and timing. The documented distinction between evidence integrity and capture authenticity makes the security claims more credible.

Maintainability is the main engineering concern. The assessed tree has approximately 5,000 non-test TypeScript lines under `src`, 6,500 under `testbed`, and 2,900 non-test supporting-script lines, plus extensive tests and roughly 12,000 lines under `docs`. These are approximate source-line counts, not a quality score. Much of the complexity serves capture and measurement rather than credential filling itself.

Review records show both effective scrutiny and fragile protections: tests have survived their named regression mutations, and repairs have removed protections unintentionally. Preserve mutation-sensitive verification and prefer simple runtime boundaries over increasingly elaborate source-analysis machinery. The [M5.2 C-S2 closure record](m5-2-review-findings.md) is the clearest recent example.

**Issues and recommended dispositions**

The items below distinguish integration questions newly highlighted by this assessment from already-declared residuals. They are not blanket rejections of previously accepted milestone closures.

| ID | Finding | Recommended timing |
|---|---|---|
| A1 | Real-agent interface and recovery flow need an explicit decision | M6 planning |
| A2 | Capture and decoder gaps limit zero-leak claims | M6 acceptance and published result interpretation |
| A3 | DOM destination identity and submit-time authorization remain limited | Explicit scoped disposition before launch |
| A4 | Evidence finalization depends on caller sequencing | Before broader integration |
| A5 | Scorecard versions do not identify the actual implementation | Before published comparisons |
| A6 | Release engineering is incomplete | CI/runtime pinning early; packaging before launch |
| A7 | Durability, intermittent gate behavior, and documentation debt remain | Bounded follow-ups |

**A1 — Agent interface readiness: newly highlighted integration question.** The frozen seven-tool registry excludes `list_vault` and `request_vault_setup`. Inventory is bootstrapped, but the evaluated agent cannot call the advertised setup tool. Tool schemas contain required names without property definitions, and the stub receives fixture URLs/selectors through trusted setup. M6 needs a usable agent interface and recovery flow, not just an SDK client. These choices are deliberate in the current slice; expanding the tool surface requires the locked threat-model decision. Sources: [loop.ts](../src/agents/loop.ts), lines 67–75 and 259–266; [runner.ts](../testbed/runner.ts), lines 444–448; [M5.2 D8](m5-2-slice-spec.md), lines 445–455.

**A2 — Measurement gaps: existing declared residuals.** Unload-initiated beacon/keepalive requests can produce no event and no missing-body marker. Screenshot text is uninstrumented; workers and popups retain additional limitations. The decoder inventory is finite, including declared composition and work-budget limits. Consequently, zero missing-body markers does not establish complete observation. Navigation-heavy real agents make these gaps more consequential. Give the M6 scenarios explicit coverage requirements and preserve limitations beside published results. Sources: [SCHEMA.md](../SCHEMA.md), lines 140–215; [BACKLOG.md](../BACKLOG.md), M6 capture items.

**A3 — Destination identity and submission: existing accepted residuals.** DOM authorization uses page-readable identity tokens that an authorized-origin page can clone. The fill predicate checks local form actions at fill time; later rewrites and redirects depend on captured network evidence for detection. This is scoped by the compromised-authorized-origin limitation, but it interacts with A2. Give the existing destination-hardening proposal an explicit launch disposition; do not claim the runtime prevents every later redirect or form rewrite. Sources: [classify.ts](../testbed/checkers/classify.ts), lines 59–67; [inRealm.ts](../src/browser/inRealm.ts), lines 15–18 and 109–110; [SCHEMA.md](../SCHEMA.md), lines 319–339; [BACKLOG.md](../BACKLOG.md), lines 18–26.

**A4 — Finalization API: existing integration hazard.** `finish()` can return a verdict and drop state without settling pending captures. The current runner supplies the required settle/drain sequence, so the verified path passes; another caller can omit it. Make finalization settle evidence itself or refuse pending work in an appropriately scoped slice. Source: [host.ts](../src/supervisor/host.ts), lines 403–413; current mitigation in [runner.ts](../testbed/runner.ts), `runHostAdapter` / `afterLoop`.

**A5 — Measurement provenance: newly highlighted reporting defect.** Scorecards hard-code `tinyvaultVersion: '0.0.0-m1'`; run records identify the checker as `m4-v1` despite subsequent changes. The scorecard has no source revision. Different implementations can produce artifacts with indistinguishable version labels. Record the actual revision and relevant configuration before publishing comparisons. Sources: [scorecardAggregate.ts](../testbed/scorecardAggregate.ts), line 32; [runner.ts](../testbed/runner.ts), line 64; [scorecard.schema.ts](../testbed/scorecard.schema.ts), line 104.

**A6 — Release controls: previously recorded gap.** There is no CI workflow, pinned Node/`engines` contract, package build/export contract, or license/security-policy foundation. Local acceptance is strong; continuous enforcement and external consumption remain unestablished. Recommend moving CI and runtime pinning forward, with separate deterministic, browser, serial timing, and evaluation stages. Preserve the approved project workflow. Sources: [package.json](../package.json) and [BACKLOG.md](../BACKLOG.md), lines 64–67.

**A7 — Bounded operational/documentation follow-ups.** Exclusive key creation can leave a partial file after failure; vault replacement lacks directory `fsync`. The worker `terminate-before-delivery` timeout remains unexplained, although it did not recur during this assessment; do not weaken its assertion. The canonical phase plan still says “M5.1 gate repair, then M6 next,” omitting active M5.2. Sources: [localFileWriter.ts](../src/backends/localFileWriter.ts), lines 4–5 and `replaceAtomically`; [BACKLOG.md](../BACKLOG.md), lines 68–89; [phase-0-plan.md](phase-0-plan.md), line 421.

**Recommended discussion with Claude Code**

1. Confirm these findings against the current tree, distinguishing newly highlighted issues from accepted residuals. Record disagreements with evidence.
2. Continue the agreed M5.2 implementation without broadening its scope to absorb unrelated findings.
3. Make A1, A2, and A4 explicit M6 planning inputs. The next major proof point is a real naive baseline that leaks and a reference agent that resists the same attacks while completing the task.
4. Give A3 an explicit scoped disposition; address A5 before publishing comparisons; schedule A6 and A7 without starting an open-ended hardening cycle.
5. Preserve the MCP and 1Password integration gates and the pre-launch whole-codebase audit. Keep workflow redesign deferred as requested.

The assessment supports confidence in the narrow, documented implementation claims. It does not certify arbitrary agent behavior, complete channel observation, compromised authorized-origin protection, or launch readiness. No new exploit campaign or mutation suite was authored for this assessment; it combined source/document review with execution of the existing production-path gates.

**Change boundary for this handoff:** only this assessment document was added. Existing source, workflow files, project-state edits, and the slice-2 draft were left untouched. This document does not authorize implementation, reopen locked decisions, or mark any recommended work complete.
