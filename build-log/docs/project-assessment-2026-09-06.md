# M5.2 milestone-close assessment — 2026-09-06

Candidate: `main` at `53fd94f7831d2fb913d887a4a40c2ef3913f30b1`; accepted executable source `8103c4729e729d6a08e569e8aa5abe68cb535fa3`.
Continuity owner: Codex, `2026-09-06-m5.2-milestone-close`. User authorized taking ownership from the closed Slice6 session, preserving uncommitted wrapup documents, and assessing whole-M5.2 closure. No M6 implementation or release.

**Owner VERDICT: PASS — M5.2 closed.** Independent fresh Codex and separate Claude Opus5 QA/security
assessments found no new technical acceptance blocker. Their original verdicts were NEEDS-ATTENTION
for status documentation; the owner verified and corrected README status, phase-plan build status and
the index's ambiguous A5 wording. All findings, original severities, reviewer identities/report hashes,
coverage deviations and owner evidence adjudications are preserved in the canonical
[M5.2 register C-M1](../../docs/m5-2-review-findings.md#c-m1--whole-m52-milestone-close-assessment-2026-09-06).
This assessment supersedes the September4 report's M5.2 current-state conclusions; its open A1–A7
follow-ups retain their canonical dispositions.

M5.2 delivers the Docker-composed acceptance path behind the same fixture implementation as the in-process test harness. It includes the pinned local daemon channel, authenticated exec bridge, scoped capabilities, fixture-control signing, capture transfer, canonical parity, claim/test crosswalk and invalid-evaluation reporting. The milestone boundary is the locked revision4 Acceptance A–P, not the v0.1 launch checklist.

| Criterion | Accepted implementation and evidence home | Closure evidence / limit |
| --- | --- | --- |
| A — fail closed | Slice2 preflight; Slice3 construction; Slice4 control | Failure-class tests retained in final default gate; real composed runner in Docker/eval gates. No silent fallback. |
| B — resolve, validate, pin daemon channel | Slice2 register final dispositions; Slice3 gates | Validated local channel only; daemon non-exposure remains an environmental assumption. |
| C — page cannot address control transport | Slice3 probes/lint, extended in Slice4 JobD | Integrated live Docker control-route matrix and Compose mutation detection; finite declared probe boundary. |
| D — no indirect admin invocation | Slice4 JobsA/D, Entries37/44 | Actual dispatcher observation, retained default/live Docker gates; legitimate data-plane capture and receipt issuance remain allowed. |
| E — stdin-only bootstrap | Slice3 scanning; Slice4 JobD | Inspect/log/history/artifact scans with controls in integrated live Docker evidence; accepted scanner and surface limits remain. |
| F — secret control material unobservable | Slice3 scanners; Slice4 capabilities and JobD | Shared secret/control scan evidence retained; public verification keys are explicitly public. |
| G — authenticated bridge provenance | Slice3 trust anchor | Container creation/identity plus injective MAC; bridge-death/no-reconnect live gate. MAC binds previously established provenance. |
| H — scoped capabilities | Slice4 JobB, Entry23 | Entropy, bounded expiry, operation/run/fixture/epoch and restart/single-use checks retained. |
| I — framing | Slice3 bridge; Slice4 control transfer | Correlation, malformed/oversize/partial/late frame and stdout checks retained. |
| J — exact seven tools | Slice1, whole-M5.2 register C-S2 closure | Exact runtime registry and ten-name execution guard; source-pin/coordinated-edit limitations remain accepted. |
| K — canonical parity | Slice6 JobsA/B, Entries24–28 | Integrated Docker gate compares three fresh legs: in-process, composed, observer-disabled in-process. Finite codec/wire/timing limits remain. |
| L — attestation | Slice5 Entry10; Entry8 proof limits | Exact signed-preimage/domain-separation, canonical schema, operation/finalization/restart checks retained. Post-capture integrity only. |
| M — retrieval isolation | Slice4 JobsB/C/D, Entries37/44 | Capability-scoped caller-visible retrieval; fixture-process compromise excluded. |
| N — Docker-free clean clone | Slices1–6; Slice6 Entry28 final source | Literal clone, install, browsers and default gate passed; static/runtime guards and entry-point root-of-trust limits retained. |
| O — deployment and invalidity | Slice6 JobC, Entries24–28 | README/SCHEMA/scorecard assumption and typed invalid path; assumed is explicitly unverified, unsatisfied yields no current measurement. |
| P — claim evidence | Slice6 JobD, Entries24–28 | 147 canonical rows, 299 runtime selectors, 337 compiler mutants / 695 invocations recorded. Both final default report joins reverified exactly once passed; accepted attribution limits retained. |

The final integrated gates exercise the earlier slices together; completed slice audits and capped review rounds are inherited unchanged. This assessment did not author another mutation campaign.

Verification revalidated in this session: all eight retained native report SHA-256 values against canonical Slice6 Entry28; their assertion records and all four captured command-log hashes against the acceptance summary; scorecard SHA-256; current source/test identity against source `8103c47`; all 147 canonical claim rows unchanged; both 299-selector joins against native default report partitions. These checks validate retained evidence and lineage, not a fresh runtime execution.

| Accepted command/stage | Native result revalidated |
| --- | --- |
| Exact-source literal clean clone → npm ci → make browsers → make test | 2317 passed, 0 failed, 1 expected opt-in eval skip |
| Integrated make test | 2317 passed, 0 failed, 1 expected opt-in eval skip |
| Integrated make test-docker | 6 passed, 0 failed/skipped; parity and control metrics complete |
| Integrated make eval | 1 passed; composed N10, 30/30 complete, 0 observed leaks |

The eval used `stub-scripted-v1`, with one benign scenario and two hostile scenarios. It does not measure an LLM's failure probability. Docker isolation was assumed (unverified). The ≥3-hostile-fixture launch requirement, real reference/naive comparison, MCP and 1Password adapters, and release artifacts remain later milestones.

Existing follow-ups remain in their canonical homes. A5 source/configuration provenance is still required before M6 publishes comparisons: `scorecardAggregate.ts` still emits `0.0.0-m1`. A1 agent interface/recovery, A2 coverage, A4 supervisor finalization, black-hole connection behavior, writer durability, dom-fill destination launch disposition, and unexplained timeout/helper observations are retained with their existing scope. A1's exact seven-tool boundary cannot be widened implicitly. Known unsatisfied Docker isolation invalidates the run; no assessment here verifies daemon non-exposure.

Maintainability: current approximate non-test line counts are `src` 4,995, `testbed` 10,967 and `scripts` 4,549, excluding `.test.`/`.selftest.` files. These counts are not a quality score. The capture/control/parity machinery is now the largest support surface; any simplification must preserve the named production-path and mutation-sensitive gates. No refactor is authorized by this assessment.

Not run: new clean-clone installation, runtime/browser/Docker/eval suites, new mutation campaigns, external vulnerability scanning, real-agent eval, M6 implementation or release. The required exact-source clone/integrated gates already passed; no executable bytes changed, so they were verified rather than repeated. Final documentation-only diff hygiene, preservation and local-link checks passed; details are in C-M1.

Deviations From Handoff: no owner scope deviation; the security reviewer disclosed targeted reading, recorded and bounded in C-M1. No completed Slice1–6 review repeated; no locked requirement, threshold, source/test, claim row, or accepted residual changed. All inherited wrapup documents remain uncommitted.
