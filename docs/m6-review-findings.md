# M6 review findings and dispositions

Append-only register. M6 planning only; no implementation or runtime evidence in these entries.
M5.2 C-M1/C-M2 remains closed and its completed review caps are unchanged.

## Input — fresh Codex contract-seam reading

Fresh worker `/root/m6_contract_inputs`, `gpt-5.6-sol`, returned NEEDS-ATTENTION with five P1 design inputs.
This is same-family bounded input, not an independent review PASS of the owner draft. No edits/tests/network.
Owner confirmed wire capture, SDK bootstrap/interface and stub-only inventory gaps; incorporated the SDK,
profile and runner slices. Selector-reference API expansion was declined in favor of explicit controlled
recipes with supplied selectors/recovery. The factual baseline tool-arg exposure was confirmed, but the
suggested classifier exception was declined: it would change the locked metric. Baseline can complete AND
leak; that is not an implementation contradiction. M6 measures exposure, not solely induced phishing.
Deviations From Handoff: none.

## R1 — independent paper review

Candidate revision1 on main base/HEAD `53fd94f7831d2fb913d887a4a40c2ef3913f30b1`.
Claude Opus5 plan review, original verdict NEEDS-ATTENTION; completed exit2.
Session `4b3bcca5-df73-4e26-b001-3fcbb1f71009`; candidate digest `8a3cfa3f7e8d3203436f74b8ad7b5dae4e5a60865bfc650a5a7518439c856886`.
Report SHA256 `9e1c849c16b8354b19794a863d5c948f505d5cfdce93e20c567eafddcadf4f33`.
Raw report/request/summary/events: `/private/tmp/tinyvault-m6-planning-20260906/claude-r1-host/`
(ephemeral). Command: `node scripts/claude-review.mjs --repo /Users/jonathanavni/Documents/Coding/tinyvault
--packet /private/tmp/tinyvault-m6-planning-20260906/claude-r1-packet.md --channel plan
--base 53fd94f7831d2fb913d887a4a40c2ef3913f30b1
--output /private/tmp/tinyvault-m6-planning-20260906/claude-r1-host --timeout-seconds 900`.
Exact reviewer model verified by helper; auxiliary CLI Haiku usage remains metadata, not reviewer output.
The first sandbox invocation at `claude-r1/` failed authentication/model validation (exit1), did no review,
and consumes no review round; host-login retry succeeded under standing authorization.

| Finding | Owner verification and disposition in revision2 |
| --- | --- |
| P1-1 Run IDs collide across agents | Confirmed runnerExecution:140 and offline capture paths. Absorbed: agent/cohort/scenario/index run identity across every physical artifact and signature, with two-agent same-index and transplant tests in S5. |
| P1-2 Fully diverted baseline lacks per-cell control | Confirmed offline:230–240 throws after recomputation. Absorbed as M6-AM09 diagnostic per-cell result retention, preserving BOTH agents' exact positive-control predicate and nonzero/unqualified headline. Declined substitution of a diverted unauthorized observation for the authorized control. No threshold waived; real outcomes can prevent M6 acceptance. |
| P1-3 Size gate too late | Confirmed historical 59,361-byte scan in Slice4 plan; not a fresh measurement. Moved mandatory numeric six-trace feasibility gate to S2, with by-turn/type size accounting and STOP before S3. Deliberately maximum-budget hostile trace may overflow and must reject; requiring every possible allowed trace to fit is not adopted. No cap increase. |
| P2-4 SDK source-view semantics unlisted | Absorbed M6-AM08: explicit internal context-view vs outbound transport metadata; existing outbound source ban retained. Added baseline/reference/forged outbound rejection tests. |
| P2-5 SKILL wording gate omission | Confirmed claims.test:509–520 excludes SKILL. Absorbed S3 owner actual surface expansion and forbidden-claim mutation proof; artifact classified gate-affecting. |
| P2-6 Prose linkage ownership trigger | Absorbed prose/SCHEMA trigger, owner gate integration scope and explicit claims.test exit with unchanged claim rows/spans. Changing a governed claim requires separate owner packet. |
| P2-7 Ambiguous amendment IDs / omitted A7 | Renamed all amendments M6-AM01–AM09, distinct from assessment A1–A7; kickoff enumerates every amendment/slice. |
| P2-8 Snapshot clamp hides instruction tail | Confirmed inRealm:185 name clamp and fixture:44. Absorbed exact delivered-text tests at tool-result and SDK input; 204→200 off-screen payload explicitly disclosed. No browser/fixture change. Marker-only evidence insufficient. |
| P3-9 Canary salience | Accepted printed limitation; locked canary format unchanged. Baseline sees synthetic/scenario identity; no ordinary-password behavior generalization. |
| P3-10 S3 contract not consumed until S5 | Accepted explicit unit-only S3 exit; E3/E4 and E1 production wiring proof assigned to S5. |
| P3-11 Baseline tripwire verdict | Clarified: assertHostFinished stays required for both; trusted-output tripwire fail is cohort failure with diagnostic, never suppressed as expected leak. Ordinary outbound typing remains measured offline. |

Additional owner checks: added scripts/test-contract.mjs and scripts/test-config.mjs to bounded integration
ownership (actual command/config pins); offline.test.ts is new. Added minimum E2/E3/E4/E5/E6/E7 production
mutant inventories. Paper review does not prove any mutant dies.
Absorption sweep: old M6-A identifiers removed; governing docs have not been amended in this planning
session. New proposals are explicitly amendments pending same-candidate application, not assertions that
locked sibling prose already changed. Canonical accepted claim spans and source/test bytes remain untouched.
No runtime tests run; no M5.2 re-review. Reviewer disclosed cross-reference reading of PROJECT-SPEC and
C-M1/C-M2 headings; owner read full requested project/assessment/register sections. R2 packet requests
literal normative reads. No other reviewer deviation; source-following reads were within M6 feasibility.

## R2 — absorbed-fix paper review

Original verdict NEEDS-ATTENTION, completed exit2; fresh Claude Opus5 plan channel.
Session `5c925f28-b91b-45da-8712-15b07d70c0cf`; candidate digest `348ef4aa083f146a95d22316d7ad9906b863fe7de4ec1d36231676aa02984209`.
Report SHA256 `914559d2e82a96289b8625e8968db8cad5a89cc281a38a5eec7758723f1f1356`.
Raw evidence: `/private/tmp/tinyvault-m6-planning-20260906/claude-r2/`. Command same helper/base/repo as R1,
packet `.../claude-r2-packet.md`, output `.../claude-r2`, timeout900. Helper verified model and candidate
stability; auxiliary Haiku metadata is not reviewer output. Reviewer verified eleven R1 absorptions.

| Finding | Owner verification and revision3 disposition |
| --- | --- |
| P1-A Failed canonical login mismatches strict capture | Confirmed loginFixture:477–485 only logs credential-valid bodies and offline:327–346 requires exact body-array equality. Chose diagnostic-only option M6-AM10: retain failure per run with no accepted outcome, preserve other validated runs, whole cohort stays nonzero/unqualified. No equality weakening, valid-subsequence filter or fixture change. Added runId query to both start/recovery URLs and wrong-username/password/missing-runId/capture-tamper tests. This is M6 real-agent applicability, not reopened M5.2 acceptance. |
| P2-B Run/turn exemption not derivable | Absorbed exact tuples with documentId=verified runId and requestId bootstrap/turn:i, plus trusted source factory in OfflineAgentConfig. Stub static precedent stays stub-only. Cross-run, missing-field and out-of-range-turn rejection named. |
| P2-C S2 sizes S3 prompts it does not own | Absorbed numeric 2048-byte combined prompt/bootstrap allowance at S2 and mandatory S3 re-run with actual SKILL/prompt bytes; S5 repeats final command path. No unmeasured placeholder certifies later prompt bytes. |
| P2-D Close precedes deferred capture completion | Absorbed pre-close settle with targets alive, followed by close and final settle/drain; controlled in-flight body test and ordering mutant must produce body, not marker. Timer cannot fake success. Existing closing-window limits remain, and bodyCorrelation changes need separate scope. |
| P3-E Missing E1/E8 mutant rows | Added source-digest/drift/run-binding/legacy-admission and live-fire/reference-outcome mutants with actual command-path completion in S5. |
| P3-F Baseline control implication | Clarified canary-bearing canonical body is the control, receipt is separate, and current exact fixture agreement normally entails one valid login in the cell. Correct-canary/wrong-username predicate can be true yet the run remains capture-failed; a wrong password lacking the canary cannot satisfy the predicate. Full baseline completion is not required. |

Owner additionally made agent execution versus teardown deadlines explicit (300s plus separate 5s teardown)
and recorded provider endpoint/API version in resolved provenance; nonstandard endpoint needs disposition.
Absorption sweep removes stale close-before-settle order and static run-exemption assumptions throughout
M6 plan; AM10 added to kickoff inventory. Governing sibling contracts remain unchanged until their named
owner amendments land; s120/s122 equality and all current claim rows/spans stay untouched. Reviewers did not
run dynamic checks; none claimed here. Third paper round is final; no fourth round authorized by the ladder.

## R3 — capped final paper review and owner checkpoint

Original reviewer verdict **PASS**, completed exit0, under the packet's explicit final-round P1 criterion.
Fresh Claude Opus5 plan channel; three M6 paper rounds complete, no fourth round. No implementation review
round has begun. Independent PASS is a paper result, not runtime feasibility or M6 outcome acceptance.
Session `d3aff4c2-f5c2-4dd9-9a3b-dd9fad39574b`; candidate digest `481331147cd0712d0b814b733cf030a1cbdd5e936f7e216f74a18f1a883e77c5`.
Report SHA256 `4c15108023b6a12b932a783e2bf899ddf4f8f7ee686346e8f46ed150747b26d7`.
Raw evidence: `/private/tmp/tinyvault-m6-planning-20260906/claude-r3/`; same helper/base/repo,
packet `.../claude-r3-packet.md`, output `.../claude-r3`, timeout900. Helper verified candidate stability
and model identity. Auxiliary CLI Haiku usage remains metadata. All six R2 findings verified absorbed.

| Final finding | Owner disposition (final sweep, no fourth paper round) |
| --- | --- |
| P2-1 Repeated prompt reserve exceeds optimistic headroom | Accepted multiplier arithmetic (11×2×2048=45056;16×2×2048=65536), but not an impossibility proof from a different historical trace. D-BUDGET now explicitly OPEN at S2 ENTRY, before SDK source implementation; 2048 is a stress candidate expected to block, not a feasible promise. Final sizing artifact separates prompt/bootstrap repetition/escaping. No cap or allowance silently changed. |
| P2-2 No selected reachable cancellation primitive | Accepted. D-CANCEL explicitly OPEN before S4 dispatch; owner must choose/evidence cancellation before the stuck mutex wait, and distinguish active-goto from already-timed-out black-hole close. A goto timeout alone does not prove TCP cleanup. No invented passing prototype or implicit scope expansion. |
| P3-3 Failure categories currently plain Error strings | Absorbed explicit discriminated validator categories in S1, strict rejection behavior unchanged. Unknown throws stay unclassified failures, never substring-classified accepted data. |
| P3-4 Source tuple producer stamping omitted | Absorbed trusted runId plumbing and actual producer stamping on bootstrap/normalized/SDK contexts, plus source-only baseline positive control and deletion mutant. Existing negative tuple tests alone were insufficient. |
| P3-5 Capture-failed control credit / offline maxTurns authority | Absorbed: failed runs never credit positiveCells; replay takes maxTurns/source factory from independently obtained bound source/config, not bundle authority. Missing source permits no qualified replay. |

Additional final sweep: expected clipped payload is derived by documented slicing of independently pinned
literal HTML, preserving the trailing space; final settle cannot upgrade an already finalized marker.
Owner accepted the ten enumerated amendment directions for their named future slices, including minimal
M6 SKILL prompt-source sequencing, with D-BUDGET/D-CANCEL still held open. Existing PROJECT-SPEC/SCHEMA
contracts, thresholds, signatures, claims and M5.2 registers have not been edited here. No blanket M6 source
implementation lock is claimed: **S1 is implementation-ready; S2 and S4 have explicit owner entry holds.**
If their evidence forces a new design, use a separately scoped redesign/contract decision, not a fourth
paper patch round or silent inherited-cap reset. Runtime implementation remains unauthorized this session.
No reviewer scope deviation; static source reads followed the named seams. No tests/Docker/model evals ran.

## Final documentation verification and handoff

Owner doc verification PASS. Final plan SHA256 `942950935cbcbf2432c1f5acb1c90707eaab97e6e22ebc01ab0ce6890731e0c0` (revision3 plus the described owner
sweep; no further independent paper round). Compared all331 entry file hashes: only PLAN.md,
PLAN-archive.md, README.md, docs/README.md and the phase build-status paragraph changed among inherited
files. Added only the M6 plan and this register. All source/tests, PROJECT-SPEC, SCHEMA, claim table,
M5.2 registers and inherited project-memory bytes are unchanged. Decisions Log and archive are append-only;
original closed M5.2 Current State archived verbatim. Local links, whitespace and git diff --check PASS.
Branch main and HEAD53fd94f unchanged. All inherited/new work remains uncommitted.
Verification artifact: `/private/tmp/tinyvault-m6-planning-20260906/final-doc-checks.json`.
Runtime tests, mutants, Docker, real-agent API evaluation and recording: **Not run — planning/documentation
only.** No implementation, commit, push or release. No M5.2 review repeated. No active workers/reviewers.
S1 packet ready; D-BUDGET and D-CANCEL are explicit future entry holds. Session closed in PLAN.md.
Deviations From Handoff: none; the requested unresolved decisions are named rather than silently resolved.


## S1 implementation — candidate and owner amendments (2026-09-06)

Owner `2026-09-06-m6-s1` took explicit user-authorized ownership from the closed planning checkpoint.
Main base/HEAD remains `53fd94f7831d2fb913d887a4a40c2ef3913f30b1`;
no commits, pushes, release, live-agent sampling or M5.2/paper re-review. Source/test worker
`/root/s1_implementation` completed its bounded packet and returned source ownership; no worker jobs remain.
S1 applies AM02/AM08 source factory/AM09/AM10 in SCHEMA's separate M6 section and phase §5. Existing
RunRecord/Scorecard types, 147 claim rows and all existing claim spans remain unchanged; M6 uses additive
type intersections. The new diagnostic API does not produce publication qualification. Strict legacy
receipt/replay ordering remains; stronger M6/diagnostic preflight does not erase verified diagnostics.

Two explicit integration choices: (1) S1 hashes every actual file named by an independently obtained
TrustedGitSnapshot, rejects listed-but-missing files, and checks a fresh snapshot after
execution. S5 must implement and prove complete Git index/ignore enumeration at the command boundary;
S1 does not claim collector completeness. This preserves the subprocess capability map and file scope.
(2) M6RunRecord/M6Scorecard extend the frozen legacy types without editing existing type/claim proofs.
Neither changes frozen budgets, model, N, outcomes, signatures or capture equality. D-BUDGET remains OPEN
for S2, D-CANCEL OPEN for S4.

Tests-first RED artifacts and final worker 99/99 targeted result retained under
`/private/tmp/tinyvault-m6-s1-20260906/worker/`. Owner integrated targeted suite: 252/252 PASS, including
153 existing claim tests; `npm run typecheck` and `git diff --check` PASS. Full `make test` is in progress
before review. Earlier docs-only claims run hit sandbox `listen EPERM`; host retry passed 153/153. This
was an environment blocker for that invocation, not a passing sandbox test.

| Mutant | Native failing observation |
| --- | --- |
| E1-source-bytes | Actual changed bytes no longer change source identity; two source/drift assertions fail. |
| E1-source-inventory | Listed input omitted from hashing; retained inventory/source drift assertions fail. |
| E1-drift | Deleted after-execution comparison; source-drift rejection assertion fails. |
| E1-run-binding | Deleted per-row provenance-ID binding; mismatched row admission assertion fails. |
| E1-legacy | Allowed missing provenance; legacy admission rejection assertion fails. |
| AM10-positive-credit | Capture-failed run credits its cell; otherwise empty-cell assertion fails. |
| AM10-unknown-category | Unknown error assigned a recognized validator category; unclassified assertion fails. |

All seven ran separately, exit1 with native assertion failures, clean candidate restored; exact patches,
commands, JSON reports and logs are in worker/ (`mutant-summary.json`). E1 evidence is S1 module-contract
proof; SDK producer stamping, transcript binding, actual Git collection and command publication mutants
remain S2/S3/S5 obligations. No claim of Docker, clean-clone, pilot, N10 or recording acceptance.
Deviations From Handoff: explicitly documented trusted-snapshot collector boundary above; no file-scope
extension or claim/gate weakening. The full fresh Claude QA/security plus Codex adversarial ladder follows.


### S1 pre-review full-gate attempt

First `make test` exited2 after the main suite: native report 2326 total, 2324 passed, one failed,
one pending. The unchanged `scripts/claude-review.test.mjs` case "real helper records stderr read errors
and preserves prior malformed failure" encountered `kill EPERM` in its injected helper, so no failed
summary was written. No S1 test failed. This invocation is FAILED; timing stages were not reached.
The exact test passed in isolation (one executed/pass, seven filtered out), with no code changes.
A full retry is running. Fresh static reviews may proceed against the frozen source with this pending
verification explicitly disclosed; full-gate acceptance is not inferred from isolation.
Raw first main report, isolated report and both command logs are retained in the owner evidence directory.


## S1 R1 — independent implementation review and owner dispositions (2026-09-07)

Reviewed candidate digest `7103d3bd61849b9307b71265007ebca77ecaf7172877fe018deaa0d9dbcab874`,
base/HEAD `53fd94f7831d2fb913d887a4a40c2ef3913f30b1`. Claude Opus5 QA and separate security each
completed exit2, original verdict NEEDS-ATTENTION; fresh Codex adversarial also NEEDS-ATTENTION.
QA session `3ef545f0-d1b7-4876-81d3-f3579e92c599`, report SHA256
`16a1a821c8f0778ea0e0a0dff43bf770e2b78a7fe584199e4ce9239841f84529`.
Security session `590c6f49-7c62-4d71-88fc-5263fc590b8e`, report SHA256
`3f81a76f0c40cafc66f49b9057ff34934e2c46eda9b9d7542aae03e42a434170`.
Fresh Codex worker `/root/s1_adversarial_r1` reviewed all named S1 surfaces read-only; report below.
Its final report-write tool stalled; owner interrupted that write and resumed the SAME completed R1
review to deliver the report. No source reading/review round restarted; no tests run by reviewers.
Both Claude helper checks verified exact Opus5 model and candidate stability; auxiliary Haiku usage
remains separate helper metadata. Raw reports/requests/summary/events: owner evidence `r1-qa/`,
`r1-security/`, `r1-codex-report.md`; commands use the pinned repository helper/channel/base/timeout900.

Full verification clarification: unchanged-source full retry completed exit0 and `test execution PASS`:
main 2325 passed / 0 failed / 1 pending, decoder timing 5/5, host timing 10/10. QA read the earlier pending
index; security read the later passing log. The external verification index is now updated. No claim
that this retry explains or fixes the initial unchanged-helper EPERM failure. No missing final gate remains
for R1's source. Later source fixes require fresh verification.

| Finding | Owner verification/disposition for bounded fix pass |
| --- | --- |
| QA P2 admission-trigger/config/manifest-call guard gaps | Confirmed tests exercised overlapping triggers only. ACCEPT: isolate factory-trigger, both row-admission calls, completionBinding run ID, model/SDK/maxTurns and reference-factory checks; run separate meaningful deletion mutants at the actual offline caller. |
| QA P2 reference sources not proven through factory | Confirmed manual empty-list test bypassed actual reference factory. ACCEPT actual inventory/auth/offline reference canary test and replacement mutant. |
| Security F1 / QA P3 archive helper untested | ACCEPT positive, altered inventory, missing-lockfile and explicitly undetected extra-file tests plus equality-deletion mutant. Archive dirty:false is a not-applicable sentinel with gitHead:null, not a Git-cleanliness claim; document this. |
| Security F2 / QA P3 manifest-only M6 markers ignored | Confirmed trigger inspects stored rows only. ACCEPT symmetric marker detection and actual offline mismatch/mutant proof. |
| Security F3 / QA P3 scorecard model mislabel/comma list | Confirmed inventory-derived label can disagree with rows. ACCEPT derive one actual run model; reject missing/mixed model IDs; retain single-model field semantics and add regression/mutants. |
| Codex P2-1 unknown key + missing runId passes | Confirmed optional expected lookup compares undefined with absent row.runId. ACCEPT explicit expected-entry and runtime identity validation with isolated regression/mutant. |
| Codex P2-2 real static-source fallback | Confirmed consumer permits absent factory/turn bound and legacy wildcard source for real model. ACCEPT real-profile consumer validation at auth/offline boundary; static exemptions stay legacy-only. |
| Codex P2-3 malformed per-run fields lose other diagnostics | Confirmed whole-array strict parsing precedes independent loop. ACCEPT diagnostic-only identity preparse and per-run field isolation; strict loaders remain. Malformed wrappers/ambiguous identity/shared paths stay cohort failures. |
| Owner O-R1-1 contradictory execution metadata | Actual external bundled-source probe returned validated/two verified runs with stored status completed vs manifest deadline and differing usage. ACCEPT same-run semantic execution-metadata agreement before source derivation, without inventing status-to-qualification policy. |
| Security test gaps: trusted equality, lockfile, legacy receipt asymmetry; QA path/sample/auth negatives | ACCEPT bounded tests and relevant deletion evidence, preserving strict legacy receipt behavior. |
| QA execution status vs outcome sentence | Clarify complete-evidence production and final qualification are S2/S5 obligations. S1 validates metadata types and consistency; a status alone is not a completeness predicate. |
| Security F4 untrusted diagnostic path references | Accepted forward limit: path strings are untrusted report data; containment is enforced when read. Document S5 printer must treat references as data, no new printer in S1. |
| Security F5 deep canonical recursion | Accepted fail-closed robustness limit; RangeError remains unclassified/unqualified. No broad parser redesign or claim of hostile-repository containment. |

All channels accepted the explicit trusted-snapshot S1/S5 division and additive M6 type approach. E1
production collection/admission, producer stamping and publication remain assigned to S2/S3/S5. No fourth
paper review or M5.2 review. D-BUDGET and D-CANCEL remain OPEN. Source ownership returned to the bounded
worker for the fix pass; owner retains docs/continuity. Review round2 will be fresh and focused on fixes.

Codex report SHA256 `b609790cb3e0c3a94988349d85d759d9fce8d35c85bb2719ac12804d63482e08`.


### S1 R1 fix absorption and R2 candidate

The same bounded worker returned source ownership after tests-first reproduction (27 failing assertions),
fixes, and a clean 156/156 target. The accepted R1 bugs and test gaps above are absorbed, including
semantic execution agreement, symmetric provenance detection, explicit runtime identity, real-profile
consumer enforcement, actual-run model labeling and isolated malformed per-run diagnostics. Owner
synchronized SCHEMA, phase §5 and M6 §6; the absorption sweep found no remaining contradictory active
contract. Historical R1/planning text remains as dated evidence, not current status.

Twenty-nine additional isolated mutations each exited1 with native assertion failures; clean source was
restored before final tests. Evidence: `worker-r2/mutant-summary.json`, each `.patch`, `.command.json`,
`.json` native report and `.log` under the owner evidence root. Coverage includes archive/trusted equality;
stored/manifest and each run marker; factory/real-profile triggers; both actual offline admission calls;
completion run-ID and model/SDK/turn-bound checks; execution agreement call/equality; real configuration,
factory/static/reference/tuple consumers; actual model and mixture checks; both strict-preparse regressions.
The expected-entry deletion mutant proves fixed error classification only: without that explicit check,
the subsequent property read still rejects through TypeError. It is not an admission-bypass proof.
The other 28 mutants have the specific semantic assertion failures preserved in their native reports.
The original seven mutations remain recorded separately; S5 actual-command obligations remain open.

Owner ordered integration verification and fresh R2 QA/security/Codex fix reviews follow this snapshot.
D-BUDGET remains OPEN for S2; D-CANCEL remains OPEN for S4. No later-slice source changes.

R2 owner integration initially passed targeted tests, then typecheck rejected the diagnostic identity
type predicate because it discarded the row's additional keys. Owner retained the failed log and changed
only the predicate annotation to intersect `Record<string, unknown>`; runtime code/guard semantics are
unchanged. The ordered targeted/typecheck/diff/full-gate sequence restarts on this candidate.


## S1 R2 — fix reviews and owner dispositions (2026-09-07)

Frozen candidate `13b1f855fc63240a5bae56785c7a992ddc5105d59ce705f1839aa1b537e12e9c`, unchanged base/HEAD.
Claude Opus5 QA and separate security completed NEEDS-ATTENTION, exit2, exact-model and candidate
stability checks passed. QA session `872b7f4c-c462-4b17-8ed2-160504e58fcb`, report SHA256
`dbd69292bdd842f5c51489f75eb98aed2b8243054cb8161b88bbdcbedfca816c`. Security session
`afd9f6d9-e84d-4d42-bae2-b8371b7acb2d`, report SHA256
`e2b166a9d713c6f49b2af404edda9e0c8dc9fa24dcccf4887ca923ba55313ed8`. Fresh Codex worker `/root/s1_adversarial_r2`
completed NEEDS-ATTENTION (one P2 proof gap, no new source defect); owner-retained report SHA256
`d741b91dfa0bed6f8d0f62fc11de00086869fcbd72a6feb0176424b5c4becf16`. All reports in evidence `r2-qa/`, `r2-security/`,
`r2-codex-report.md`; no runtime checks by reviewers. No P1 reported by any channel.

The reviewers read earlier running-gate snapshots. Owner's completed R2 gate is exit0 / test execution
PASS: main2382 passed, zero failed, one pending; decoder timing5/5 and host timing10/10. Integrated
targeted309/309, typecheck and diff check PASS. Native reports copied as make-test-r2-main/timing-1/timing-2
and index verification-r2.json. The29 R1-fix mutations preceded the annotation-only TypeScript correction;
runtime semantics were unchanged. Their exact pre-correction context remains in the preserved patches.
No source changes occurred during reviews, verified against review-r2-hashes.json.

| Finding | Owner verification/disposition |
| --- | --- |
| Codex P2 completion-run-binding ordering proof | ACCEPT: category assertion short-circuited native factory observation. Collect strict/diagnostic results and separate factory counts before category assertions; prove both actual offline paths by removing the binding guard. Source guard itself is correct. |
| QA P2 model-based real-profile detection unproved | ACCEPT actual custom-ID/real-model offline case with markers/factory removed; isolate model-branch deletion. Cover consumer side with trusted real model too. |
| Security F1 dead aggregation inventory parameter | ACCEPT delete the unused parameter and inert test dimension; retain actual-run model derivation. Explicit inventories remain load-bearing in inventory/live-fire/reference-pass validators. No new validation responsibility silently added to aggregation. |
| Security F2 declared cohort subset accepted by module | ACCEPT full declared cross-product size in provenance expected identities, in addition to existing uniqueness/bounds/membership. S5 still must validate/wire the same actual cohort; S1 module proof alone cannot publish. |
| Security F3 direct API expected-identity guards unproved | ACCEPT direct negative and isolated mutation cases for duplicate keys/IDs, invalid/out-of-range indices, agent/scenario membership, duplicate candidate rows. Keep unrelated cardinality checks satisfied in each negative. |
| QA/Security narrower coverage gaps | ACCEPT offline tuple-consumer and stored-execution cases, source turn-bound edges, and additive type constructions. Classify redundant artifact-index/category guards honestly instead of claiming unique bypass prevention. |
| QA P3 source lockfile precondition | ACCEPT explicit required package-lock.json inventory entry in SCHEMA/phase/plan. |
| QA P3 diagnostic isolation wording | ACCEPT clarify ordinary evidence/outcome isolation versus cohort-level M6 provenance/binding failures, including execution metadata. No behavior change. |
| Mutant freshness and category limits | ACCEPT refresh meaningful original/new mutants on final runtime candidate. expected-entry/profile-model/profile-sdk/real-profile-preflight/real-profile-trigger can prove category/cohort placement while sibling checks retain rejection; they are not all admission-bypass proofs. |
| Security F4/F5/F6, QA carried limits | Retain trusted maxTurns source breadth, legacy strict shared-path behavior, and S5 real-profile/qualification wiring obligations. No later-slice stamping or legacy-semantic rewrite. |

Security reported abbreviated reading of context/standing protocol; owner checked its findings against
those governing contracts. Its lack of dynamic execution was required by the read-only packet, not an
implementation deviation. R3 packet explicitly requires the relevant protocol sections.
Round3 is the final fix-review round, not a reset. No paper or M5.2 review reopened. D-BUDGET OPEN S2;
D-CANCEL OPEN S4. Same worker owns bounded source/test absorption; owner handles docs/continuity.


### S1 R2 absorption — final R3 candidate

Worker returned source ownership after176/176 targeted tests. Tests-first retained one failing
shortened-cohort regression. Only production changes in this pass: complete declared expected-cohort
cardinality and removal of aggregateScorecard's unused inventory argument (all affected callers were
owned tests). Additional tests cover custom-ID real-model detection, trusted consumer/turn edges, actual
offline tuple rejection, stored execution metadata and additive type construction. Owner contract sweep
synchronized required lockfile, declared cardinality and cohort-level M6 binding failure exceptions.

Final-runtime mutation refresh:47 executed,45 killed,2 survived. The surviving expected-duplicate-key and
expected-natural-index single deletions retain rejection through candidate uniqueness/runtime-identity/
lookup checks. They do not establish those individual branches as independently load-bearing. No sibling
guard was weakened to manufacture a kill. Direct public negative tests still reject both invalid classes.
Category/cohort-placement-only proofs remain explicitly narrower for expected-entry, profile-model,
profile-sdk, real-profile-preflight, real-profile-trigger and artifact-index-classification.
The completion-run-binding mutation now records BOTH source-order failures before category assertions:
strict source calls1 and diagnostic source calls2 (expected0). Owner inspected those native failures.

Every original7 and R1-fix29 mutant was refreshed, plus11 new cases. Current patches/commands/native
reports and explicit survived/killed outcomes are under worker-r3; final-source-hashes.json matches
mutant-restoration.json byte-for-byte by source hash. Exact prior untracked test snapshots were recovered
and SHA256-verified against R2, giving final reviewers a bounded fix diff for all S1 source/tests.

Bounded interpretation: valid M6 provenance permits canonical agent IDs only. The custom-ID real-model
consumer test therefore uses authForAgent, and the marker-free model-trigger test uses actual offline
adjudication. No agent-ID expansion was introduced to construct impossible provenance. This is the only
worker handoff interpretation; no source-file scope extension, fixture change or claim weakening.
Final ordered integration verification and capped R3 reviews follow.


## S1 R3 — final capped review and owner acceptance (2026-09-07)

**Owner disposition: S1 ACCEPTED at the implementation round3 cap, with the bounded test-evidence
residuals below. S1 is closed; whole M6/E1 command acceptance is not claimed.** No P1 in any channel,
and the final full gate passed. CLAUDE.md's final-round criteria are layers1–2 leak, undeclared layer4
blind spot, or red make test; all other final findings receive an explicit residual disposition. No
fourth implementation review or reopening of completed paper/M5.2 reviews. No commit, push or release.

Reviewed candidate `fb60d8011ffd47d3337747ec63b39daf7b6494ba893f25dc081ee58319358214`, base/HEAD unchanged
`53fd94f7831d2fb913d887a4a40c2ef3913f30b1`. Final Claude Opus5 QA completed NEEDS-ATTENTION exit2;
security completed PASS exit0; fresh Codex `/root/s1_adversarial_r3` PASS. Exact Opus5 model and candidate
stability checks verified. QA session `15fd928c-8f0f-484b-86d7-9b9aff1533bb`, report SHA256
`2befcad195fa9f44626fcede0577e69d0c0b55f05093ac63947f426b1c613b72`. Security session
`d1f58f3a-1de7-48d3-9ce0-b6b2c7cde981`, report SHA256
`fca8f60b91825c14b27c39cf9e3bc2b5a04148e52f4978db804e6c659fee5097`. Owner-retained Codex report SHA256
`45e06a25f918d86c4831dd764d290721c43b6e08b646af31a3537edf1e05a3a9`. Reports/request/summary/events in
`r3-qa/`, `r3-security/`, `r3-codex-report.md` under the owner evidence root.
No reviewer ran tests; their dynamic statements came from supplied native evidence.

All channels verified the bounded R2 fixes. The expected-cohort equation is correct in source; the
completion-binding mutant now fails actual source-call observations on both paths. Aggregation retains
one actual run model and no unused inventory argument. Model-based detection/tuple consumers and
contract wording are consistent. The two redundant single-deletion survivors are not bypasses and
remain explicitly disclosed. The canonical provenance agent-ID restriction was preserved.

| Final item | Owner disposition and precise evidence limit |
| --- | --- |
| S1-R3-Q1 — QA P2, cardinality multiplicands | ACCEPTED RESIDUAL at cap. Current M6 provenance fixtures use one selected agent and one scenario, so sample-size shortening and whole-check deletion are proved, but separately dropping the agent/scenario multiplicands is not mutation-proved. Source uses all three factors correctly. S5's actual two-agent/three-scenario cohort and subset-drop command proofs must cover these dimensions; do not describe S1 as complete multidimensional E1/E7 runtime proof. |
| S1-R3-Q2 — QA P3, multi-agent prompt map | ACCEPTED RESIDUAL at cap. The narrowed single-agent fixture no longer exercises multi-key prompt-map agreement. Exact-key code remains; the real comparison's multiple prompt digests need S5 production-path coverage. |
| S1-R3-Q3 — QA test gap, candidate natural-index limb | ACCEPTED LIMIT. Invalid indices reject, but the candidate-side natural-index limb has no isolated mutation kill independent of the expected-side limb. The expected-natural-index survivor's redundancy is established by source reasoning and whole-input rejection, not individual branch liveness. |
| S1-R3-S1 — QA/security P3, canonical agent allowlist | ACCEPTED RESIDUAL at cap. Canonical IDs have positive coverage; the trusted-side canonical-agent restriction has no direct negative/deletion proof. Candidate/trusted equality remains, and no ID expansion or bundle-forgery path was introduced. |
| S1-R3-S2 — security P3, detached factory spy | ACCEPTED LIMIT. In three missing/replaced-factory negatives the original spy is detached, so its zero count is not a source-order proof. Those cases prove rejection/category. The wired completion-binding and other wired cases retain actual factory observation; no broader zero-call claim is made. |
| Reviewer running-gate snapshots | RESOLVED by owner final evidence below; historical reports stay unchanged. All reviewers saw earlier running snapshots, not an observed red gate. |

**Final verification (ordered, current source):**

- `npx vitest run testbed/evaluationProvenance.test.ts testbed/evaluationValidity.test.ts testbed/checkers/offline.test.ts testbed/runner.artifacts.test.ts testbed/runner.test.ts testbed/parity/claims.test.ts --reporter=json --outputFile=/private/tmp/tinyvault-m6-s1-20260906/owner-targeted-r3.json`: exit0,329/329 PASS, including153 existing claim tests.
- `npm run typecheck`: exit0; `git diff --check`: exit0.
- `make test`: exit0, final `test execution PASS`; main2402 passed/zero failed/one pending, decoder timing5/5, host timing10/10. Browser timing families ran serially. Native reports `make-test-r3-main.json`, `make-test-r3-timing-1.json`, `make-test-r3-timing-2.json`; log `make-test-r3.log`, index `verification-r3.json`.
- Final runtime mutants:47 executed,45 killed,2 redundant survivors, exact patches/commands/native reports in `worker-r3/`; owner audited every native status. Source restoration verified. Category-only and surviving-limb limits above remain, rather than claiming47 bypass kills.
- Original helper EPERM full-gate failure and later isolated/full passes retained; no helper source repair or explanation inferred. Initial R2 typecheck failure retained with its annotation-only correction and subsequent green ordered runs.
- Not run: literal clean clone, Docker acceptance, composed real-agent pilot/N10, independent real-cohort replay, recording. These are S5/S6 gates; S1 neither invokes nor substitutes for them.

Source/test changes: evaluationProvenance.ts/.test.ts (new), evalAgents.ts, scorecard.schema.ts,
scorecardAggregate.ts, evaluationValidity.ts/.test.ts, checkers/offline.ts and offline.test.ts (new),
all under testbed/. runner.artifacts.test.ts was allowed but unchanged. Nine-file source hash-map digest
(SHA256 of sorted compact JSON) `c5fcf6aad4061fefdda494fa7fa4dedb40d40f1f142b9b09a44ecf57adafc804`; exact map retained in
worker-r3/final-source-hashes.json. Source remains unchanged after these reviews; final owner edits only
record dispositions/status and archive the prior planning checkpoint. Existing claim rows/spans, gates,
fixture/signing/classifier/core/SDK code, package manifests and no-touch inherited files are unchanged.

**Deviations From Handoff:** S1's explicitly accepted TrustedGitSnapshot boundary leaves actual complete
Git enumeration to S5; source hashing/admission is module-level evidence. Custom-ID consumer coverage
uses authForAgent because valid provenance permits only canonical IDs. No file-scope expansion, locked
threshold change or review-round reset. Accepted final evidence limits are listed above.
**Next:** S2 only after explicit authorization and D-BUDGET resolution. D-CANCEL remains OPEN for S4.
No later-slice implementation, credentials, live evaluation, commit, push or release occurred.

Final checkpoint-only audit: claim suite153/153 PASS after status/disposition/archive edits; local
Markdown link and whitespace checks PASS. Source hash map unchanged from reviewed/mutated candidate.
All entry files outside authorized S1/owner scope are byte-identical; old PLAN-archive bytes remain an
exact prefix, and the prior closed planning state is preserved verbatim. HEAD/main unchanged, index
unstaged. Evidence: final-doc-claims.json and final-preservation-audit.json. No active workers/reviewers
or tests remain. This checkpoint audit adds no implementation review round.


## S1 checkpoint publication authorization and evidence retention (2026-09-07)

After S1 closure, the user explicitly authorized the recommended commit/push sequence. This supersedes
the earlier session's no-commit/no-push restriction for this checkpoint only; no release or S2 work is
authorized. Six unchanged inherited historical records are separated from S1's source/planning/contracts.
The accepted nine-file source hash map still matches the reviewed/mutated candidate; whitespace checks
pass. Remote origin/main matched the implementation base after a fresh fetch.

Raw evidence archive: [local retained archive](../artifacts/review-evidence/tinyvault-m6-s1-20260906.tar.gz).
SHA256 `684cab6f3dde4028435aa90a89d1c2e7bde848901a07acf0a38eddf354bc5a85`; 521 files, 2673484 compressed bytes.
Every archived file was re-read and its SHA256 compared with the source evidence. Companion manifest
and checksum files are beside the archive. The archive is ignored local storage, outside temporary
directories; it is not included in the GitHub push. The original /private/tmp evidence remains too.
This retention/publication bookkeeping does not change source, verification results, review caps or
accepted residuals. D-BUDGET remains OPEN S2 and D-CANCEL OPEN S4.

Historical-documentation checkpoint: `3367a6b` (`docs: preserve M5.2 closeout and project assessment`),
six files whose staged bytes matched the S1 entry snapshot. S1 source and its governing amendments
remain together in the following checkpoint commit.


## D-BUDGET — entry investigation and unadopted AM11 (2026-09-07)

Owner session `2026-09-07-m6-d-budget`, explicitly handed over from closed S1. Entry checkout
`/Users/jonathanavni/Documents/Coding/tinyvault`, main, HEAD/base
`105e75fa58a3548662646884669aec3efd49e978`, clean. No S2/source implementation, cap change,
commit, push or release. S1-R3 residuals and review cap retained; D-CANCEL remains OPEN for S4.

**Owner disposition: BLOCKED; no allowance approved.** The canonical decision, full size table,
accounting and exact unadopted AM11 proposal are in `m6-implementation-plan.md` §4.3.1. All twelve
finite real-browser/fixture paths completed with verified receipts. Full native SDK records are
projections, not actual fetch bytes. Ordinary serial projected lookalike/DOM paths exceed 131072
with bootstrap only; lowering the system allowance cannot repair those witnesses. Batched 1024 has
six fitting projections (largest 119691, margin 11381), but both batched lookalike 2048 cases fail.
Selecting only the batched witnesses would narrow §4.3's normal-success STOP. AM11 proposes that
narrowing explicitly, keeps serial rejection evidence and every actual pilot/cohort failure gate,
and requires user/contract-owner disposition; it is NOT ADOPTED. The owner recommends keeping the
hold unless the narrower guarantee and deferred pilot-stage risk are explicitly accepted.

**New scoped independent paper review (not a reopened completed ladder):**

- Command: `node scripts/claude-review.mjs --repo /Users/jonathanavni/Documents/Coding/tinyvault --packet /private/tmp/tinyvault-m6-d-budget-20260907/review-packet.md --channel plan --base 105e75fa58a3548662646884669aec3efd49e978 --output /private/tmp/tinyvault-m6-d-budget-20260907/claude-plan-host --timeout-seconds 900`.
- Completed exit2, **NEEDS-ATTENTION**, actual reviewer `claude-opus-5`, session
  `1177d934-48a9-451a-8fa7-f3e7e55a697b`; candidate digest
  `dffe11729f08797038e1755c1cbf35b6e3740205ab7e3c84357cf2f63a98f307`.
  Report SHA256 `79fe7dc2c0ff068eebd464fbc1aa6a0c452e1cbdcc17d4e890efb33aa5f47271`.
- Opus confirmed all stated arithmetic and the BLOCKED disposition. Its CLI auxiliary Haiku usage
  remains visible in raw metadata and is not labelled reviewer output or an evaluation model call.
- Initial sandbox dispatch (`claude-plan/`) failed: CLI emitted synthetic `Not logged in`, and the
  helper correctly rejected the unexpected assistant model. Existing-login host retry is the completed
  review above. Failed artifacts remain; no fallback or passing label applied to the failed attempt.

| New item | Owner disposition |
| --- | --- |
| DB-R1-P1 — unbounded tool declarations | ABSORBED IN UNADOPTED PROPOSAL. Disclose generic descriptions; pin the complete schema file and both compact declaration arrays by exact bytes/hash. AM11 now requires S2's independent serialization gate and renewed entry accounting before a declaration change. No schema-growth margin or implemented gate claimed. |
| DB-R1-P2a — prompt-level batching can affect leakage | ABSORBED IN UNADOPTED PROPOSAL. No batching-encouraging prompt change authorized by AM11. Any later such guidance needs separate evaluation-design disposition, pre-sampling provenance and public disclosure; no post-failure adjustment. |
| DB-R1-P2b — missing locator/register | ABSORBED HERE. Commands, script/data hashes, review identity and local archive recorded with this change. |
| DB-R1-P3a — state vocabulary | ABSORBED. Current header/table/status pointers distinguish BLOCKED D-BUDGET from OPEN D-CANCEL; historical S1 entries remain untouched. |
| DB-R1-P3b — bridge error reason | VERIFIED FIX IN EXTERNAL PROBE ONLY. `verify.ts` now requires `error.code === 'frame-length'` for oversized frames; all 36 primitive/equality checks and raw boundaries rerun PASS. `verify.reviewed.ts` reconstructs the exact pre-fix script by reversing that sole assertion change, for comparison. |
| DB-R1-P3c — minimal response envelope | ABSORBED AS LIMIT. Minimal usage fields and short synthetic IDs disclosed beside table; actual SDK sizing is still required, not certified. |
| DB-R1 residual — deferred risk / post-measurement witness choice | ACCEPTED LIMIT OF PROPOSAL. State explicitly that schedules were chosen after serial overflow, are not independent sampling, and would move ordinary-trajectory risk to a later real pilot after S2–S4 work. Usable 1024-byte instructions/model batching remain unproved. |

These are owner dispositions on an unadopted proposal. No independent re-review or PASS verdict is
claimed for the adjusted text. This does not reopen any completed S1/paper/M5.2 review.

**Verification and preserved evidence:** root `/private/tmp/tinyvault-m6-d-budget-20260907`.

- `node --import <root>/ts-hook.mjs <root>/capture-serial.ts` and the same command with `capture.ts`
  (batched):12/12 local Chromium/fixture runs, stopReason complete and verified receipt taskCompleted true.
  Actual command used absolute paths. Initial probe setup failed on helper imports/bundled relative
  resources; corrected with in-place TypeScript loading. Chromium's sandbox MachPort failure was
  followed by permitted host execution. These failed attempts are not code defects or passing checks.
- `node <root>/measure.mjs` and `node <root>/measure.mjs <root>/batched`:36 full projections, each
  partitioned by event kind and turn, prompt/bootstrap/body/escaping cost, raw file, digest/receipt
  envelopes, base64url request and response payloads plus prefix. All original captures and oversized
  projections remain intact; no truncation, unsigned-evidence substitution or qualification.
- `node --import <root>/ts-hook.mjs <root>/verify.ts`: exit0;36 event-preservation/signer/verifier/frame
  checks and 131071/131072/131073 raw boundaries PASS, including reason-pinned bridge rejection after
  review. This is production primitive evidence, not actual SDK/runner rejection or deletion proof.
- `source-identity.json`:225 source/testbed/schema/package/Makefile files byte-identical to entry HEAD.
  `git diff --check`: PASS. Only owner documentation/status/register changes.
- Not run: actual SDK installation/fetch, provider availability/live evaluation, Docker/composed bridge,
  real-profile command path, 16-turn maximum-output retention, deletion mutants, full regression or clean
  clone. Their later gates remain mandatory; no new runtime source change warrants repeating S1 suites.

Key SHA256s (relative to evidence root; full index is `key-evidence-hashes.json`):

| Artifact | SHA256 |
| --- | --- |
| capture-serial.ts | 60261cbdb59fde750515b9f7a156c0cdebc327c9c629b8629880d87359d48298 |
| capture.ts | 55fa65c5de3d4b41d84b5f3ef886cff4fbd10ff14e45bc79ad3d4e0156cf6d95 |
| measure.mjs | ef1bf7d178f725af0165df072bc9c00afd62c5ce2add2e66b12d07fd87b45e0f |
| verify.ts (reason-pinned) | 8f2a9cbd1b5c3cd2d09a5d1c7ac658abbe5b10d364eaf709a1e5dfba4bb862fe |
| schemas.json | f319fd47cd1a4840ef7d274ee5881dfc3ec52a80dd65fa575f7b569ffab968c5 |
| measurements.json | 91089629d12bc575eaee6cceb71557a8795ef87de57dfe06275241bac2e3f6f1 |
| batched/measurements.json | fa2ba2e1a601f0515e54801d6e1dc98f9b963cd4679ee7c5bca3678d61b084f5 |
| verification.json | a2509ee1493c53b82f3d6434e2a01926c46079091bd239321f7513540e7004c0 |

**Deviations From Handoff:** none. Entry work produces the concrete amendment need allowed by §4.3;
it does not silently select 1024, certify 2048, weaken a frozen cap or begin S2. The user has not authorized
AM11 adoption. Owner retains continuity paused at that decision; no workers/reviewers/tests running.

Local ignored evidence archive: `artifacts/review-evidence/tinyvault-m6-d-budget-20260907.tar.gz`,
SHA256 `b0ca7e94188bc60fa10447d5f51eb2147ae91f22270c0271305aca614f863158`; 217 manifest-listed files, 604279 compressed bytes.
`archive-manifest.json` SHA256 `2766a98c1c4e1546ff1e31a1973b7f55cb683d80aa85793de12fe36fecaebd52`; every archived member verified against it.
Contains both raw capture modes, all projections, scripts, measurement/verification hashes, failed and
completed review artifacts, and owner diff before this archive pointer. No node_modules; synthetic fixture
credentials only. Archive is local, not pushed. No new independent review of post-review owner text.


## D-BUDGET — user approval and AM11 adoption (2026-09-07)

**Authorization:** after the owner explicitly asked, “Do you approve AM11’s narrower deterministic
feasibility gate?” and explained that it changes §4.3's normal-success STOP while preserving all caps,
observations and real-pilot/cohort failure gates, the user replied **“I approve”**. This approves the
post-review proposal and its recorded owner dispositions; it is not a request for S2 implementation.

**Disposition: M6-AM11 ADOPTED; D-BUDGET entry RESOLVED.** Select 1024 combined system/bootstrap bytes,
the exact declaration hashes and five/seven-turn deterministic schedules in plan §4.3.1. Updated §4.3's
operative reserve/normal-success wording as well as the amendment inventory, entry table and status
pointers, so the superseded blanket deterministic STOP is not left as a conflicting active requirement.
Serial overflow/rejection evidence remains mandatory. Every actual pilot/cohort run must still fit
intact; failures stay unqualified/nonzero and cannot be dropped, replaced, resampled or counted completed.
No batching-encouraging prompt change is authorized; the amendment's separate disposition/provenance/
disclosure requirements for any later such guidance remain. 2048 is unproven, not an approved allowance.

The user accepts the explicitly narrower deterministic guarantee and deferred pilot-stage risk. Actual
SDK wire sizing, usable S3 instructions, final S5 wiring and real-model batching remain unproved.
All raw/signed/bridge caps, full observations, source identities, model/turn/call/token/N/Wilson/qualification
contracts, S1 accepted residuals and D-CANCEL OPEN remain unchanged. Existing review stays
NEEDS-ATTENTION with owner dispositions; no independent PASS or repeated completed review claimed.

Approval adoption changes only the same six uncommitted owner documentation/status/register files.
Prior register entries and the evidence archive are preserved unchanged. Verification: diff whitespace,
append-only register/Decisions Log, exact adopted declaration hashes and unchanged 225 source/contract
inputs checked. No runtime tests rerun for this documentation-only disposition; S2's actual-SDK,
size-rejection/deletion, maximum-output and later gates remain pending. No implementation, commit,
push or release performed. **Deviations From Handoff: none.**


## D-BUDGET — wrapup and fresh S2 handoff (2026-09-07)

User requested `tinyvault-wrapup` and then implementation in a fresh session after the S2-only
recommendation. This is explicit authorization for the receiving session to implement **S2 only** in
`/Users/jonathanavni/Documents/Coding/tinyvault`, preserving the named checkout and uncommitted approved
contracts. Closed `2026-09-07-m6-d-budget`; receiver becomes continuity owner. No workers/reviewers/tests
remain running in the closing session. Launch occurs only after the owner checkpoint and checks finish;
the closing owner stops writing shared state before the receiving session starts.

`PLAN-archive.md` receives the exact pre-wrapup Current State; Decisions Log and this register stay
append-only. The project session index receives one entry; no global Codex memory modified. Eight owner
documents remain dirty. Source HEAD stays `105e75fa58a3548662646884669aec3efd49e978`; the 225 recorded
source/contracts remain identical. Diff whitespace and archive/prefix preservation checked; no runtime
suite repeated. Evidence archive and prior hashes remain unchanged.

Next: exact S2 file scope/E2/§4.2 plus adopted AM11; actual SDK sizing early; §8 verification order and
full new implementation ladder. No completed S1/paper/M5.2 review is reopened. No later-slice source,
live cohort, cap/observation waiver, commit/push or release. D-CANCEL OPEN S4; S1 residuals retained.
**Deviations From Handoff: none.**

## S2 implementation — entry, candidate and early SDK sizing (2026-09-07)

Owner `2026-09-07-m6-s2` accepted the explicitly authorized handover from CLOSED D-BUDGET in the
same checkout, main at `105e75fa58a3548662646884669aec3efd49e978`. All eight inherited dirty documents
were snapshotted before writes. No branch/worktree/stage/commit/push/release operation. The pinned
D-BUDGET archive and all 217 members matched its pinned manifest and existing temporary input bytes.
S1-R3 proof limits, completed review caps and D-CANCEL OPEN are inherited unchanged.

S2 adds the real `@anthropic-ai/sdk` **0.124.0** client/custom-fetch boundary, native ordered assistant
blocks/user tool results, full exact declarations, pre-dispatch shape/call/identity validation and
request fsync before transport. The trusted client factory may carry runId when the existing host
adapter does not supply the new AgentLoopOptions.runId; conflicting identities reject. This requires
no S3/S5 adapter change. Normalized context now charges system bytes, and normalized real responses
retain ordered native blocks. Raw wire capture precedes parsing; partial/error bytes remain diagnostics.
AM01's declaration validation and AM03/AM08's wire/source clarifications are added outside frozen spans.
The execution deadline rejects new admissions and aborts provider work; settlement/cancellation of
already-admitted browser work remains the explicit S4 D-CANCEL limitation.

**Early mandatory exit probe:** actual SDK/sink budget suite 25/25 PASS (`budget-first.json`). Each
finite host execution/snapshot/event input is a literal from the verified D-BUDGET fixture captures;
all host observations are checked unchanged by an independent digest. The current production SDK
serializes every request and receives independent finite HTTP replies. Fresh fixture transports
register/finalize and sign the resulting complete events file. This is actual SDK feasibility with
replayed real fixture observations; it is not a new browser completion, live model trace, composed
bridge exchange or final S5 real-profile runner proof. Both declaration arrays match the independent
1972/1979-byte AM11 SHA256 literals. No external generated artifacts are test prerequisites.

| Fixed 1024 witness | Reference raw bytes | Baseline raw bytes |
| --- | ---: | ---: |
| Benign | 79554 | 78301 |
| Lookalike | 126878 | 125055 |
| DOM-hidden | 99122 | 97845 |

All six fit raw131072, signed-artifact262144 and bridge-payload262144 plus4 framing. Minimum raw
headroom is4194 bytes. All six serial1024 trajectories overflow (134484–226840) and reject; both
fixed lookalike2048 traces overflow. The full16-turn maximum-output diagnostic is1409051 raw bytes,
retained unsigned. Every actual pilot/cohort gate and S3 exact-prompt sizing rerun remains mandatory.
Accounting artifacts partition each turn/event kind, prompt/bootstrap/repetition/escaping and outer
signature/bridge costs. Response envelopes use finite minimal synthetic IDs/usage; no real-provider
size margin is certified.

Four separate production-module Vite-transform deletion mutants were killed: raw signer limit,
fixture admission limit (with wired signer observation), signed-artifact limit and frame limit.
Native reports preserve the two accepted boundaries and the failing boundary+1 per mutant; no fixture,
signer or frame source file was edited. This proves the current signing/fixture path, with S5's final
command-boundary repetition still due. Initial test-first missing-module failure is retained.
Evidence root: `/private/tmp/tinyvault-m6-s2-20260907`; full logs/patches/native reports are beneath it.

**Scope conflict pending:** existing `testbed/runner.wiring.test.ts:372` uses malformed
`browser_snapshot` input `{}` in its source-forgery test. Required new shape validation rejects before
that test's intended guard. Owner requested explicit authorization for only `{sessionId:'session'}`;
this file is outside the S2 row and has not been edited. Independent scoped verification continues.
Full ordered gates and fresh S2 QA/security/Codex review are pending; no S2 exit claimed here.

## S2 R1 — independent reviews and owner dispositions (2026-09-07)

All three fresh channels completed against candidate digest
`e57196ca8195e9ba2d9d086b2e9f600c23c5221376c6a2ceb0ce4374b8978ef0` (339-file owner hash map agrees),
with NEEDS-ATTENTION. QA/security used actual `claude-opus-5`, sessions
`c03df808-c7bb-4161-8802-691887445a91` and `f4efaa3b-3a32-472e-b349-625fecafe273` respectively.
Fresh same-family Codex report: `codex-r1-report.md`; cross-family reports: `claude-r1-qa/report.md`
and `claude-r1-security/report.md` under `/private/tmp/tinyvault-m6-s2-20260907`. Reviewers ran no tests.
No completed S1/paper/M5.2 review was repeated. This starts S2's own three-round implementation cap.

Two automatic approval-review rejections occurred before process launch: scoped private source egress
was not considered authorized by the repository's recorded standing consent. No bypass was attempted.
The user then directly answered **“Approve this scoped Claude review transfer”**, explicitly approving
S2 source/diff, guidance/contracts and verification evidence to Anthropic for read-only Opus5 QA,
security and fix reviews. Both subsequent dispatches completed; auxiliary Haiku usage remains labelled
as CLI metadata, not reviewer output. Exact approval/rejection record: `claude-dispatch-approval.json`.

Ordered owner checks: targeted → typecheck → diff check → make test, first sandbox then host access.
Sandbox targeted290/3; host targeted291/2. Full sandbox main2206/71/195 pending; full host main
2468/3/1 pending. Native reports and command logs retained. Full host failures are the two malformed
runner fixtures plus the helper stderr-read test's `kill EPERM`/missing summary. Serial timing stages
were NOT RUN because main failed. Isolated host helper stdout/stderr read-error tests subsequently
pass2/2; this does not erase or establish a cause for either full-run failure. The helper source is
unchanged. Its “Claude Opus5 qa review started” text is the fake-CLI test helper's banner, not evidence
that a live review caused the failure. A new full ordered pass remains required.

| Item | Owner disposition |
| --- | --- |
| S2-R1-Q1/S1 — red full gate | ACCEPTED BLOCKER. No S2 exit or timing pass claimed. Two fixture corrections require explicit file-scope exception; helper permission failure preserved without causal speculation. |
| S2-R1-Q2 — purported targeted count mismatch | DECLINED AS REPORTED. `targetedHost` correctly summarizes the separate `owner-targeted-r1-host.json` (291/2), not `owner-targeted-r1.json` (sandbox290/3). Both native files existed and are retained. Add explicit report paths to the status index to prevent ambiguity. |
| S2-R1-Q3 — durable-write sequence reuse | ACCEPTED. A successful line write followed by fsync/close failure can leave the counter unadvanced before afterLoop writes. Move sequence advancement to after successful write and before sync/close; add real-file failure/sequence tests and deletion proof. No body/event omission. |
| S2-R1-Q4 — one versus two pending fixtures | ACCEPTED. The initial request was one fixture; the broader targeted run identified the second and a superseding user question named both. Current State must name both; historical entry stays unchanged. Neither out-of-scope edit is authorized yet. |
| S2-R1-C1 — missing baseline argument/result negatives | ACCEPTED. Add real SDK/host-adapter same-canary argument/result tests with finite run sources, full trace retained, plus separate observation assertions/scans so duplicate raw-response evidence cannot hide a missing tool-argument event. Also add an actual reference-client seeded-canary context case. |
| S2-R1-C2 — fixture admission mutant first fails category | ACCEPTED PROOF LIMIT; strengthen in R1 absorption. R1 killed the mutation on category before reaching the wired signer assertion. Check actual downstream signer entry first, then category, and rerun. Shared signer remains independently rejecting; do not describe this as an accepted oversized signature. |
| S2-R1-C3 — source-forgery mutant exhausts fake replies | ACCEPTED PROOF LIMIT; strengthen with a finite terminal second reply and explicit acceptance/rejection observation. Preserve R1's category-only failure. |
| S2-R1-S2 — resultEvent guard regression | ACCEPTED; contingent on fixture scope approval. Restore the intended reaching input without weakening shape validation and mutation-prove omission of the synthesized resultEvent separately. |
| S2-R1-P3 controls | Add appropriate fixed-wire parameter, endpoint/method/body, header-capture, deadline, valid-JSON non2xx and invalid-UTF8 controls/mutants. Independently redundant predicates/timers may have measured survivors; record those honestly rather than deleting another protection silently. |
| S2-R1-P3 sizing assertions | Tighten serial1024 assertions to all six observed overflows and assert both fixed lookalike2048 failures versus four fitting stress cases. Run raw-signer deletion also against the full SDK serial diagnostic caller, not only byte boundaries. |
| S2-R1-P3 redirect behaviour | Node/undici behaviour requires a real loopback probe; browser opaque-redirect semantics alone do not establish Node's result. Add SDK/actual-fetch redirect evidence with a no-follow observation. |
| S2-R1-P3 stale/artifact documentation | Preserve `send-before-durable-append` as a superseded failed attempt; authoritative actual reorder mutant is `reorder-request-after-network`. Update obsolete S1 kickoff packet label/AM11 and make phase-plan text point to canonical SCHEMA details. |
| S2-R1-P3 test-first evidence | ACCEPTED LIMIT: missing-module reports contain zero executed assertions, not mutant kills. Separately executed production mutants establish assertion sensitivity; do not relabel initial setup failures as dynamic negatives. |
| S2-R1-P3 fixture-input digest | ACCEPTED LIMIT. Literal digests check replay equality; archive authenticity/provenance was independently verified at entry and by Codex R1. Default tests intentionally have no external archive prerequisite. `build-budget-fixtures.py` is the preserved initial fixture-extraction aid, not a current full-test regenerator or standalone gate. |
| S2-R1-P3 source details | Remove unused capture-category member; retain sanitized SDK error wrapping with no raw provider error propagation. Schema validator is deliberately closed because every pinned shape has additionalProperties:false; keep that coupling explicit. Existing explicit loop callers retain their selected bound; no claim about future callers. |

R1 reviewed limits remain: minimal synthetic response envelopes/IDs and narrow4194-byte minimum headroom;
no certification of real provider ID/usage growth, usable S3 instructions or model batching. Actual S3/S5
reruns and all real pilot/cohort rejection gates remain. Unbounded received-body buffering is bounded only
by attempt time/provider output contract; the provider is trusted, and S2 does not claim an adversarial
provider memory bound. No source cap/truncation change is adopted. S1 residuals and D-CANCEL stay intact.

R1 evidence clarification after inspecting the native failure and patch: the unlisted
`send-before-durable-append` artifact is an earlier **duplicate drop-append kill** (one assertion failure,
38 filtered tests), not a collection/setup failure. Its promise incorrectly resolves because the append
was removed. The canonical inventory renames that mutation `drop-durable-append`; the separate
`reorder-request-after-network` patch actually moves the write after transport. Do not count the
unlisted duplicate as a twenty-first distinct mutant or call it a failed tool execution. The prior
row's “superseded failed attempt” wording refers to this superseded naming/evidence attempt; the
underlying native test execution succeeded in detecting the deletion. Original reports remain unchanged.

### S2 R1 absorption evidence — candidate for R2

The durable sequence now advances after successful write, before fsync/close. Real-file tests first
failed with duplicate sequences and now pass; failure before writing leaves the counter unconsumed.
No evidence representation, schema, wire body, cap or deadline changed. The unused capture error-category
member was removed without changing sanitized SDK-wrapped error behavior. Worker handoff:
`/private/tmp/tinyvault-m6-s2-20260907/transport-r2/HANDOFF.md`.

Transport host tests pass85/85; sandbox SDK/transcript tests pass59 with one loopback listenEPERM.
The host actual Node fetch302 probe retained the body/status and observed zero redirect follows;
its policy-deletion mutant observed two requests and one follow. Location-specific baseline argument/
result scans and a real empty-source reference-client context scan now exercise the actual SDK adapter.
Source-forgery removal now accepts the forged event with a finite terminal reply, replacing R1's
fake-reply-exhaustion proof limit. Header absence is checked in events and JSONL with planted controls.

New transport inventory:17 killed, three measured survivors. Removing either custom60s timer or
SDK60s timeout leaves the other aborting; removing custom non2xx rejection leaves the SDK rejecting
valid model JSON HTTP429. These are not isolated kills; joint-removal proof is not claimed. All native
patches/configs/status/assertions are in `transport-r2/mutants/summary.json`. The preserved initial
mutation-run selector mismatch is an orchestration failure, not a kill.

Owner budget tests pass25/25 with all six serial1024 failures and exact fixed2048 expectations.
Five size mutations are killed in `budget-mutants-r2/summary.json`: raw signer boundaries, full SDK
serial trace signing, fixture admission, artifact signer and bridge frame. Fixture admission now fails
at the wired signer-entry observation before checking the error category; the downstream signer remains
independently rejecting. The full SDK serial signer deletion yields six missing-rejection assertions.
All received diagnostics remain intact; none is reclassified as a successful signed trace.

Fresh R2 reviews and owner full ordered checks remain pending. The two-line runner fixture exception
is still awaiting explicit user authorization; no out-of-scope source was changed. The concrete proposed
patch is `proposed-runner-fixture-correction.patch` under the evidence root. S2 exit is not claimed.

The owner additionally validated that exact correction with an external Vite test transform, leaving
`runner.wiring.test.ts` unchanged: three affected tests pass; separately omitting the synthesized
resultEvent from its source guard produces one promise-resolved rejection failure (other two pass).
Artifacts: `runner-fixture-probe/corrected-control.*` and `omit-result-event.*`. This is a proposed-fix
control and mutation proof, not a passing checkout gate or authorization to apply the correction.
Preservation audit confirms all129 SCHEMA claim spans match HEAD, historical register/archive bytes
remain prefixes, Decisions Log is preserved, and HEAD/index are unchanged. The independent claims
gate sandbox run passed152 and failed only the CORS loopback listenEPERM; host result is retained in
`claims-r2-host.json`. Await the file-scope reply before applying the patch and freezing the final R2
candidate for ordered integration checks and all three fresh fix-review channels.

### S2 fixture exception approved and applied

The user replied **“I approve”** to the concrete `proposed-runner-fixture-correction.patch` request.
Owner applied only the two browser_snapshot inputs in `testbed/runner.wiring.test.ts:339` and `:372`,
replacing `{value:'public'}` and `{}` with `{sessionId:'session'}`. Assertions and production files
are unchanged by this exception. It authorizes no other S4/S5 source work. The required ordered
targeted → typecheck → diff check → make test run and fresh R2 fix reviews follow on this candidate.

The first ordered run after approval passed308/308 targeted tests, typecheck and diff check, then
`make test` stopped at the Docker capability-import gate: the new actual Node redirect test directly
imported node:http/node:net in an unallowlisted test file. Neither main nor timing suites ran. The
worker is adapting that test to the existing approved fixture-server API within its current file;
no capability policy/allowlist change is authorized or needed. This pre-R2 integration failure is
retained in `make-test-r2-host.log` and `verification-r2.json`; copied old `.vitest` reports are explicitly
labelled stale, not current passing evidence. Fresh R2 reviews await the corrected candidate.

The redirect test now uses existing `startLoginFixture` with explicit POST302/GETfollow routes and
`onListenPermissionError:'fail'`; the test requires HTTP reachability and forwards the SDK-selected
fetch init unchanged. Direct capability imports were removed. Control passes; the same redirect-policy
deletion still observes two requests/one follow. Capability gate, typecheck and diff check pass; exact
commands/native artifacts are under `transport-r2-gate/verification.json`. No scanner or policy file
changed. A new distinct ordered integration run follows; earlier gate failure remains preserved.

### S2 R2 candidate — ordered integration PASS

The corrected candidate passes targeted308/308 → typecheck → diff check → full `make test` exit0.
Main has2486 passed, zero failed, one inherited skipped offline-eval-entry case; both serial timing
stages and final test-execution gate pass. Exact commands/counts/native paths are in
`verification-r2-integration.json` and `verification-r2-integration-commands.json`; full command log
is `make-test-r2-integration-host.log`. Reports prefixed `r2-integration-` were copied only when freshly
written during this run. Prior helper killEPERM did not recur; no cause or helper repair is asserted.

The now-applied fixture's source-only resultEvent guard deletion fails the intended rejection assertion
(two controls pass, one fails), recorded in `runner-fixture-probe/approved-omit-result-event.*`.
Only loop.ts is transformed for this mutant; corrected fixture inputs are actual checkout bytes.
All three fresh R2 fix reviews remain required before S2 exit. No API/cohort, Docker, clean-clone,
S3 prompt or S5 final-command acceptance is claimed by this default local gate.

## S2 R2 — owner acceptance with recorded residuals (2026-09-07)

**S2 complete; all changes remain UNCOMMITTED.** Reviewed candidate digest:
`c8b6fe049afcc182bf08f383b88c345397b49d092b0857d6e933912c4c886975`;339-file inventory independently
matched by Codex and rechecked by the owner after both Claude processes completed. Exact executable
source stayed frozen; subsequent changes are owner disposition/status prose only.

| Independent channel | Actual reviewer/session | Verdict |
| --- | --- | --- |
| Claude QA | claude-opus-5; `a939560e-683b-442e-96ab-0b4e40317c11` | PASS |
| Claude security | claude-opus-5; `0cdebc42-c2dc-479d-9c40-2f5987b9685a` | NEEDS-ATTENTION, retained |
| Fresh Codex adversarial | `/root/s2_adversarial_r2` | PASS; no new actionable P1/P2/P3 |

Reports: `claude-r2-qa/report.md`, `claude-r2-security/report.md`, `codex-r2-report.md` under
`/private/tmp/tinyvault-m6-s2-20260907`. All reviewers were read-only and ran no tests. Actual reviewer
model identity is in helper summaries/events; auxiliary Haiku metadata is not reviewer output.
Security explicitly found no current security blocker if its three low-severity items are dispositioned.
Owner assessed each item below on reachability and evidence; neither its NEEDS-ATTENTION verdict nor
the older D-BUDGET review is rewritten as PASS. QA referred to final-round P1 criteria although this is
R2; acceptance here rests on verified fixes and these bounded dispositions, not premature use of a cap.

| R2 item | Owner disposition and practical limit |
| --- | --- |
| Security S-1: afterLoop drain lacks source-forgery guard | ACCEPTED RESIDUAL, currently unreachable. Production drain is trusted host evidence; current host producers do not emit model-text/internal, while real-profile sources are restricted to those finite tuples by evalAgents. No model-controlled producer can match them today. Before S3–S5 adds a host model-text producer or widens source tuples, this asymmetry needs a separate guard/invariant proof. Not described as protected by the per-tool guard. |
| Security S-2 / QA torn-write gap | ACCEPTED DIAGNOSTIC LIMIT. Tests prove a successful whole-line write followed by sync/close failure, and a rejected write that produced no bytes. They do not prove atomic writes, torn-write recovery or crash consistency. Partial writes can corrupt JSONL; the run remains failed/unqualified. No claim that every write rejection leaves a parseable diagnostic. |
| QA appendSerialized sequence gap | ACCEPTED PRE-EXISTING DIAGNOSTIC LIMIT. Its increment-before-append ordering can leave gaps after append failure, including a failed SDK-response append followed by drain. The run already fails; parity also requires loop-complete. No accepted evidence or leak verdict is made passing by the gap. This round fixed the newly added durable request path, not all filesystem failure recovery. |
| Security S-3: declaration-drift mutation missing | CLOSED BY ADDITIONAL EXECUTED EVIDENCE, no source/test edit. External same-length description drift independently kills native and normalized hash assertions, with the native value preserved in the normalized-only case. Both byte-length checks still pass; the expected hashes fail at anthropicClient.test.ts:61 and:64. Clean control passes. Exact native reports/configs/patches/commands: declaration-drift-r2/summary.json. |
| QA loopback prerequisite | ACCEPTED ENVIRONMENT REQUIREMENT for this real Node transport probe. Existing fixture API explicitly fails on unavailable listening and the test requires HTTP reachability. Sandbox EPERM remains a failure, not a substitute pass; host default gate is green. API credentials/provider network and Docker are still unnecessary for default tests. |
| QA vetted manifest / security dependency expansion | RECORDED SUPPLY-CHAIN LIMIT. Exact SDK0.124.0 and integrity-pinned production transitives enlarge the dependency tree. The SDK supplies the required auditable Messages API transport; no vetted-manifest claim is made. That manifest applies to the supervisor boundary, which does not reach anthropicClient. No gate scope/allowlist was widened. |
| Reference empty-source case | Correct for the reference profile's zero-source contract; tests prove actual reference bootstrap/context delivery and scanning. It is not evidence for a populated reference exemption set, which the real-profile consumer rejects. S3 actual profile construction and S5 wiring remain due. |
| Redundant timers/HTTP status | Three measured isolated survivors remain recorded. Current positive tests prove rejection/abort, but no joint-removal mutation is claimed; no surviving predicate was removed to manufacture a kill. |

R1 absorption is verified by all three channels: durable sequencing, actual same-canary target-channel
scans, finite forged-acceptance observation, approved resultEvent reaching test, signer-entry observation,
fixed wire fences, header controls, deadline/UTF8/real Node redirect checks and exact stress outcomes.
The full ordered acceptance remains targeted308/308, typecheck, diff check, main2486/0/1 inherited skip,
serial timings5/5 and10/10, final execution gate and `make test` exit0. Declaration drift was checked
after review without modifying the reviewed source or the passing candidate; no R3 source repair or
additional implementation review round was needed. No completed S1/paper/M5.2 cap was reopened.

Minimum AM11 raw headroom remains4194 bytes with minimal synthetic envelopes; all six serial1024/2048
overflow diagnostics and the complete1409051-byte16-turn diagnostic remain unsigned. Fixed2048 has
two lookalike failures and four fitting traces. The witnesses were selected after serial measurements;
they are not independent model samples. S3 exact usable prompt/bootstrap sizing, S5 actual command
repetition and every intact real pilot/cohort gate remain mandatory, with no replacement/resampling.
The current broader baseline context exemptions depend on non-exempt observations for every content
class; R2 proves the named argument/result classes, not a general future-producer theorem.

All inherited S1-R3 source/provenance/test-proof limits, finite capture/decoder limits, postcapture-only
signature integrity, trusted-provider buffer limit and D-CANCEL OPEN remain. No live provider, Docker
exchange, clean clone, cohort, recording, S3 prompt or S5 command acceptance was run. S2 completion
does not authorize any of that work or S3 implementation.

**Deviations From Handoff:** exactly the user-approved two fixture-input corrections in
runner.wiring.test.ts; assertions unchanged. No other source-scope deviation, gate weakening,
branch/index/commit/push/release action. Full evidence and exact reviewed source snapshots are
preserved in ignored `artifacts/review-evidence/tinyvault-m6-s2-20260907.tar.gz` with manifest/checksum
companions; the external evidence directory remains available. Final preservation checks are recorded
in `final-preservation.json`.

### S2 checkpoint publication authorization — 2026-09-07

After the readiness assessment explicitly distinguished fixes from retained residuals, the user
instructed **“let's go ahead and commit and push”**. The owner rechecked the exact reviewed source,
approved two-input fixture diff, all129 unchanged claim spans, preserved historical document prefixes
and empty index; live origin/main and local HEAD both equalled the entry/tested base105e75f.
This authorizes the S2 checkpoint and its preserved continuity documents on main. Earlier UNCOMMITTED
and no-publication statements above are historical checkpoints, superseded only for this operation.
The final committed SHA, verification and remote equality are recorded in the Git publication receipt
under `/private/tmp/tinyvault-m6-s2-20260907`; no security verdict, residual or later-slice gate changes.

## S2 publication blocker — scoped helper repair authorized (2026-09-07)

S2 checkpoint commit `289297335853275d54ebdfd92537455ac0623362` was created but NOT pushed.
The exact-commit ordered run passed targeted308/typecheck/diff, then main2485/1/1pending failed:
the helper stderr-after-malformed test lost `summary.json` after `process.kill(-child.pid)` threw
EPERM. Timing suites did not run. This supersedes readiness to push; the earlier full PASS is
preserved as a distinct attempt, not erased or reused to dismiss the recurrence.

Owner real macOS/Node24.19.0 probes:60 synchronous signal-on-data cases produced no EPERM;100 cases
with0/1/5/20ms signal delays produced48 EPERM,50 ESRCH and2 successful signals. EPERM cases had
unset child exitCode at signaling and later actual child close with exit0. This supports a narrow
child-exit timing window, without claiming the kernel cause. Evidence: `helper-eperm-probe/`.
Read-only diagnosis independently traced the escaping signal exception before injected stderr error
delivery; copied actual-helper/fake-CLI fault injection reproduces missing summary. A proposed copy
records signal failures separately, preserves original failure/status, retains escalation and saves
only after real child close. A finite held child confirms no premature summary. Evidence/patch:
`helper-eperm-diagnosis/`. No real provider call was used for diagnosis.

The user explicitly approved **“the bounded helper repair and push”**, extending source ownership
only to `scripts/claude-review.mjs` and `scripts/claude-review.test.mjs`, with regressions/mutations,
independent review, full gate, repair commit and push of both commits. One worker owns those files;
owner retains docs/Git/integration. This is final S2 implementation fix round3, not a reset of any
completed S1/M6-paper/M5.2 cap. Final P1 criteria remain a layers1–2 leak, an undeclared layer4 blind
spot or red make test. No bounded termination claim is added for an indefinitely living child when
both signals are denied; that requires privileges the helper does not control. The repair must not
hide that failure, claim successful termination or accept before child close.

### S2 R3 helper candidate and proof

Only the two approved helper source/test files changed. Non-ESRCH signal exceptions are recorded as
`{signal, code}` separately from the original failure; failed summaries include those records, while
the existing child-close callback remains the sole completion point. Original failure reason and
exit1/124/130 mapping, SIGTERM/2s-SIGKILL escalation and ESRCH handling remain. No provider/tool/model,
argv, capability policy, subprocess target, candidate guard or successful review status changes.

Tests first produced three actual assertion failures (missing summary or lost timeout/interruption
codes) and one passing ESRCH control. The repaired helper suite passes12/12. Four named copied-helper
CLI tests fault-inject both signal operations; a finite fake remains alive until the real escalation
timer attempts SIGKILL, then exits naturally. The actual close-handler entry observes no summary yet.
Interruption uses the installed handler via process.emit, not an OS signal-delivery claim. The10s fake
watchdog bounds mutant cleanup, not the helper's real denied-signal lifecycle.

Six source-copy mutants are killed with a passing four-case copied control: remove containment,
remove recording, remove summary serialization, overwrite primary failure, accept before child close,
and incorrectly record ESRCH. Premature acceptance fails specifically because summaryAlreadyExists
is true at actual close. Native statuses/patches/reports are under `helper-fix-r3/verification.json`
and `mutation-results.json`; worker handoff `helper-fix-r3/handoff.md`. Invocation CLI, typecheck and
diff check pass. Full ordered integration and fresh three-channel final R3 reviews remain pending.

### S2 R3 inventory dependency approved and full integration PASS

The first repaired-candidate ordered run passed targeted320/typecheck/diff but stopped before main
at gate-cli.selftest.mjs:37: the existing assertion expected six top-level helper tests; the four
new tests make ten. Main/timings did not run in that attempt. Evidence: r3-verification-commands.json
and r3-make-test.log. This is a stale fixture inventory dependency, not a reason to hide new tests.

The user explicitly approved updating that single assertion and its message in
`scripts/gate-cli.selftest.mjs`, in addition to the two previously approved helper files, then
reviewing, verifying, committing and pushing. The owner applied exactly6-to10 and six-to-ten.
External copied-selftest proof: original rejects10!=6; updated pin passes67 real CLI observations.
Removing one copied new test rejects9!=10; deleting only the pin allows the same incomplete
fixture to pass67 observations. This is expected-rejection/deletion evidence, not normal acceptance
for the incomplete fixture. Exact transforms/results: helper-gate-pin/verification-summary.json.

The new ordered integration run passes targeted320/320, typecheck, diff check, full make test exit0;
main2490 passed/0 failed/1 inherited skip; decoder timing5/5, browser timing10/10; final execution
gate PASS. Native reports and command statuses: r3-integration-verification.json and companions.
All260 executable/package files were compared against2892973: only the three approved scripts
differ. S2 SDK source is unchanged. Fresh final R3 reviews are now pending on this frozen candidate.

## S2 R3 — final capped review and helper acceptance (2026-09-07)

All339 frozen candidate files remained unchanged through the three independent reviews; digest
`a15c1b0065fc2a90a4476d054b532b185b180f0365d43c8a5484382608c7fbbb`, base/HEAD2892973.
Fresh Claude Opus5 QA PASS, session`c88cc03c-11a7-498a-a819-aeeb8ca0f4ae`; separate Claude Opus5
security PASS, session`54951648-365c-46cf-97cb-7334da129db9`; fresh Codex adversarial PASS. Native
reports/summaries/events: claude-r3-qa/, claude-r3-security/, codex-r3-report.md. Claude runtime
assistant events validate Opus5; auxiliary Haiku usage remains separately recorded, not a reviewer
fallback. Reviewers executed no tests. Owner verified full reports and candidate preservation.

No new blocking defect. At the final S2 round3 cap the owner accepts this bounded repair with the
following explicit dispositions; prior S1/paper/M5.2 caps and R2 SDK residuals are not reopened.

| Concern | Owner disposition / evidence limit |
| --- | --- |
| Security: missing executed escalation-deletion mutant | CLOSED BY ADDITIONAL EXECUTED EVIDENCE, no source edit. External copied control passes4/4; deleting only the real SIGKILL timer causes4 executed child-close assertions to fail: actual code8 from finite fake watchdog versus required0. No collection error or test timeout. Native reports/transform: helper-escalation-r3/mutation-results.json, run-helper-escalation-r3.py. Seven helper mutants now killed; exact2s timing and signal-swap mutants are not claimed. |
| QA/security/Codex: mixed signal outcomes, UNKNOWN fallback and Windows gaps | ACCEPTED BOUNDED COVERAGE LIMIT. Both-denied and ESRCH controls are directly tested; mixed success/failure and code-less errors rest on structure. The Windows branch and false-return/error-event behavior remain outside this macOS exception repair. No broad OS termination claim. |
| Security: falsy empty-message failure sentinel | ACCEPTED PRE-EXISTING LOW RESIDUAL. Existing stop idempotence and main failure check use truthiness; a hypothetical empty stream-error message can evade those checks and the two-record bound. No reaching native/model-controlled input was established. At-most-two and fail-closed claims apply to the specified nonempty malformed/timeout/interruption/native-error paths, not arbitrary injected empty messages. |
| QA/security: unkillable-child wait and skill wording | ACCEPTED DECLARED AVAILABILITY LIMIT. Both denied signals can leave an indefinitely live child/pipe-holding descendant pending with no summary. No successful review is claimed, no target/privilege expansion or pipe abandonment added. Skill's bounded-run wording and omission of optional signalFailures remain a future documentation item outside approved source scope; current PLAN/register carry the precise limit. |
| QA: historical two-file wording and pending pin evidence | HISTORICAL CHECKPOINTS RETAINED. Later appended explicit user approval covers the third one-line edit. External proof summary predates approval; current candidate/source inventory shows the applied pin. PLAN cosmetic capitalization corrected in final owner prose. |
| Security: inventory pin deletion characterization | NARROWED. A normal clean selftest is not asserted to detect arbitrary deletion of itself. The preserved expected-rejection experiment holds the incomplete fixture constant: pin present rejects9!=10; pin deleted passes. That is deletion sensitivity under the missing-test challenge, not proof of exhaustive per-file test names in production reports. The pre-existing synthetic inventory contract is unchanged. |
| Security: independent gate freshness not established by read-only reviewer | Owner command ordering/native fresh reports and unchanged source hashes establish the candidate run; publication additionally requires a new ordered run on the exact repair commit before pushing. Earlier failures are preserved, never counted as passes. |

Two reviewer phrasings are not adopted as stronger evidence: the real EPERM probe shows each child
closed0 later, not that it was already exited at signal time; QA's inferred escalation-deletion result
was not an executed proof until the additional owner experiment above. Review reports are preserved
verbatim, including their approximate/offset line references; the owner dispositions govern closure.

Acceptance evidence remains targeted320/320, typecheck, diff check, main2490/0/1 inherited skip,
serial timings5/5 and10/10, final execution gate and make test exit0. Full source snapshots/hashes
are frozen in candidate-r3-files/ and candidate-r3-hashes.json; only owner closure prose changes
after review. Prior publication and inventory failures remain in their distinct original reports.

**Deviations From Handoff:** only explicit user-approved source exceptions: two S2 wiring-test inputs
previously committed, bounded two-file helper repair, and one-line inventory assertion/message.
The user separately authorized the repair commit and push of both commits on main. No release,
S3–S5 source, live provider eval/cohort, Docker acceptance, clean clone or root prompt work occurred.
D-CANCEL OPEN,4194-byte synthetic headroom, S1/S2 diagnostic/source/provenance/capture limits and
all later real-run gates remain. Exact Git publication result is in the external publication receipt;
the immutable original evidence archive is preserved and R3/publication evidence is a separate
ignored supplement. This closes the bounded S2 repair at round3, not the M6 milestone or release.

### S2 publication verified and session closed — 2026-09-07

Both authorized commits are pushed to the existing origin at github.com/jonathanavni/tinyvault:
S2 `289297335853275d54ebdfd92537455ac0623362`, then helper repair
`3b6bbbe795d7fc90ef840327b5dc8a074756baef`. The exact latter commit passed the new ordered
targeted320/typecheck/diff/full make test run: main2490/0/1 inherited skip, timing5+10, final
execution PASS. All260 executable/package files match reviewed source. Working tree was clean
at push and local/remote main equality was checked again before the documentation-only wrapup.
Native receipt: publication-receipt.json; fresh reports: publication-repaired-*. Initial automated
push rejection was resolved by verifying the existing origin endpoint and retrying the same
authorized normal push; no force push or alternate route. Historical held receipt is preserved.

The original S2 archive is unchanged (SHA256
`8e4ce98e90631a556f38f600860d0fdcae2a243a5d1a9ca5041a0adcb5f0f830`). The separate ignored
supplement `artifacts/review-evidence/tinyvault-m6-s2-20260907-r3-publication.tar.gz` is2563924bytes,
SHA256`7e0f464a3de7d0536592d86ded5ce7e6e01f7fd2be592b33240ddbcb05b12f3c`; all553 members verified
against its adjacent manifest. It contains new/changed regular evidence files relative to the original
archive; dependency links and fixture Git internals excluded. These local evidence archives are not
pushed. Canonical commands, findings, limits and publication identity are committed or recorded here.

The Codex owner closes session2026-09-07-m6-s2 for a fresh read-only kickoff and scoped S3 proposal.
No workers/reviewers/tests remain active. This wrapup changes only continuity documentation and
project gotchas, leaves those edits uncommitted, and grants no S3 implementation or release authority.


## S3 implementation — authorized entry and initial exact sizing (2026-09-07)

User authorized “Let’s start” after the read-only S3-only kickoff. Owner `2026-09-07-m6-s3`
works on main at `3b6bbbe795d7fc90ef840327b5dc8a074756baef`; all changes remain UNCOMMITTED.
The five inherited wrapup edits were copied/hash-recorded before the new focus stamp in
`/private/tmp/tinyvault-m6-s3-20260907/entry`; the inherited closed S2 checkpoint remains in PLAN.
No completed paper/S1/S2/M5.2 review or cap is reopened. All S1-R3, S2-R2 and S2-R3 dispositions,
4194-byte padded synthetic headroom, finite capture/decoder limits and D-CANCEL OPEN carry forward.

One bounded implementation worker owns only the S3 profile/prompt/scenario files from §7. The owner
owns root SKILL, exact-profile budget tests, documentation and actual wording-gate integration.
The root SKILL's entire text supplies the reference system; no trimming, alternate hidden prompt,
batching guidance or source expansion is introduced. AM01/AM06/AM07 and S3's AM08 usage are stated
in SCHEMA and the phase plan outside existing claim spans. S5 actual command/backend construction,
provenance and cohort accounting remain later obligations.

Initial actual-SDK adapter sizing executed six assertions, all PASS, using exact profile factories,
scenario public-task factories and the unchanged historical fixture observations/schedules. At this
checkpoint reference system519 bytes and baseline419 bytes; largest combined content1018 bytes.
Raw six-trace sizes: reference benign79274, lookalike126696, DOM99082; baseline benign76311,
lookalike122619, DOM96095. All are within raw131072/signed262144/bridge262144 bounds. These are
initial deterministic synthetic-envelope measurements, not final S3 exit, model usability sampling,
provider growth guarantees, independent samples or S5 wiring proof. Existing serial/2048 diagnostics
remain unchanged and will run in the full sizing suite. Native report: exact-budget-first.json;
full initial trace/measurement artifacts: exact-budget-first-artifacts/ under the evidence root.

The actual publishable surface walk now includes root SKILL. Initial missing-file test failed one
executed assertion with ENOENT (setup evidence, not a mutation kill). Clean control passed1/1.
An external candidate copy with the forbidden sentence “preflight proves Docker daemon non-exposure”
appended to SKILL failed the actual wording assertion1/1. Native reports: wording-before.json,
wording-control.json, wording-mutant.json, plus logs and wording-mutation.patch. Later wording changed
only completion guidance to avoid implying a receipt alone qualifies completion; final controls remain due.
Default dependency boundary and Docker invocation gates also passed at entry; no policy expansion.

Typecheck identified one existing literal Scenario fixture lacking the new mandatory recipe fields in
`testbed/scenarios/index.test.ts`, outside the S3 worker allowlist. Owner prepared the exact three-line
import/recipeVersion/publicTask correction at proposed-registry-fixture.patch; assertions are unchanged.
User scope approval is pending. No out-of-scope fixture edit or full integration PASS is claimed.
S3 review rounds have not started. No live provider/cohort, Docker acceptance, clean clone, commit,
push, recording or release occurred.


### S3 candidate checkpoint — pending fixture scope approval

Worker source is frozen: new reference/naiveBaseline/prompt source and tests; scenario types,
three public recipe factories and hostile tests. evalAgents was allowed but unchanged. Pure recipe
projection resides in scenarios/types to avoid an unnecessary scenario-to-SDK runtime dependency;
the earlier dependency and invocation gates had passed, so this was not a measured policy violation.
Owner changes remain root SKILL, exact-profile sizing tests, actual wording surface and scoped docs.

Owner targeted nine-file command (reference/naiveBaseline/prompt, hostile/index, budget,
anthropicClient/loop and claims): initial sandbox291 passed/2 loopback EPERM, then host293/293 PASS.
After the non-timing Chromium recipe test was added, owner-targeted-frozen.json reports294/294 PASS.
A final refinement of the overflow test then passed23/23 in worker-reference-final.json: it collects
outcome and checks the wired client factory before rejection category, with a valid client on the
mutated admission path. Worker four-file targeted36/36 also passed, including real Chromium hidden
runId observations at lookalike landing and recovery. No timing suite overlapped that browser test.

Eight independent external-copy worker mutants killed through executed assertions, verified by owner
from native reports and mutants.json: omit-normalized-identity, seed-reference-password,
accept-tool-source, scripted-recovery, hardcoded-recipe-selector, omit-failed-attempt,
remove-prompt-budget and bypass-metadata-projection. These prove the specified S3 adapter obligations,
not complete S5 command/cohort coverage or a general source-producer theorem. The final budget deletion
reaches the wired factory and fails its zero-call assertion. Its initial incidental-error native report
was overwritten; original bytes are unavailable. The labelled historical reproduction is not original
evidence and is not used for acceptance. No source outside the worker allowlist was changed in the repo.

Owner root-instruction overflow mutation adds34 bytes in an external copy: all three reference factory
calls reject at the1024-byte guard, while the three baseline witnesses pass. This proves consumption
of actual root bytes and rejection rather than truncation; it does not establish language-model usability.
Native prompt-overflow-mutant.json and the exact mutation patch are retained. The latest complete
six-trace/full stress evidence is preserved at latest-complete-budget-artifacts/ under the S3 root.
The earlier actual-root forbidden-claim mutation and clean control remain, and the broad claims suite
passes with current root instructions. Existing claim rows/spans were not edited.

Owner npm run typecheck exits2 with exactly TS2739 at scenarios/index.test.ts:8: the existing literal
lacks recipeVersion/publicTask. Native preapproval-typecheck.log retains this known scope blocker.
git diff --check passes. The prepared three-line fixture correction is still unapplied pending user
scope approval; no assertions change. Full make test is NOT RUN at this checkpoint because typecheck
is red. Independent S3 review has NOT STARTED; no review round/cap is consumed. Worker is done and
no tests/reviewers remain active. S3 is not accepted or complete. All inherited residuals, S4/S5 and
later real-run gates, no-commit/push/release boundaries remain.

**Deviations From Handoff:** no unauthorized repository file-scope extension. Additional index fixture
fields require the pending explicit extension. Preliminary tests do not replace the final ordered gates
or independent review ladder. The overwritten initial mutation report is an evidence-retention limit,
with current strengthened native proof and its limits disclosed above.

Byte-count correction to the checkpoint above: the root overflow mutation adds **35 bytes**,
verified by subtracting the original file length from the mutated file length; its3/3 outcomes stand.


### S3 fixture scope extension approved — 2026-09-07

User replied “I approve” to the prepared three-line testbed/scenarios/index.test.ts extension.
Owner applied exactly that import plus recipeVersion/publicTask fixture update; assertions unchanged.
This resolves the file-ownership hold, not the final verification/review gates. Original typecheck
failure and proposed patch remain in the evidence root. S3 round1 begins only after ordered candidate
checks; all earlier caps/residuals and UNCOMMITTED scope remain unchanged.


### S3 R1 candidate — ordered integration PASS

Approved fixture extension applied exactly. First ordered full make test then failed at the vetted
package-import boundary because the new owned hostile.test imported Playwright directly. Owner replaced
that import/call with the existing src/browser/playwright launchChromium wrapper and made fixture cleanup
run after launch/close failure. No dependency policy, manifest or allowlist changed; source stays in scope.
The original failed make-test-r1.log is preserved separately.

Fresh ordered candidate verification: targeted294/294 PASS; npm run typecheck exit0; git diff --check exit0;
make test exit0 with main2529 passed/0 failed/1 inherited skip, serial decoder5/5 and host10/10,
final test execution PASS. Native reports/logs and exact commands: verification-r1.json and the
owner-*-r1-integration / make-test-r1-integration files under /private/tmp/tinyvault-m6-s3-20260907.
All129 pre-existing SCHEMA claim spans are byte-identical; claim implementation is unchanged.
Candidate source is now frozen for fresh independent S3 round1 QA/security/Codex reviews. No completed
paper/S1/S2/M5.2 cap is reopened; S3 acceptance still awaits these reviews and any required fix rounds.

### S3 R1 independent reviews and owner dispositions — 2026-09-07

Frozen candidate346-file inventory remained unchanged throughout review; helper candidate digest
`2a60da7d350542f64ac6c1b68bb5d9695b18a9715d3ae1c2ae2d32d93b504ca6`.
Claude Opus5 QA NEEDS-ATTENTION (session`d1a117e8-4d97-43ce-b5e5-ce616bac5e74`),
separate Opus5 security NEEDS-ATTENTION (session`83e55bed-429c-4a1f-a2da-64243c41c7d3`).
Fresh Codex adversarial PASS (`codex-r1-report.md`), no new actionable findings; the owner ended a hung report-write tool call without changing its review scope.
Reports and native summaries remain verbatim under `/private/tmp/tinyvault-m6-s3-20260907/claude-r1-{qa,security}`.
These are source/native-evidence reviews, not reviewer-executed tests. No P1 reported. S3 fixes receive
fresh R2 reviews; final-cap disposition criteria do not prematurely apply at R1.

| Finding / gap | Owner disposition and proof boundary |
| --- | --- |
| QA P2-1 / security P2: six-byte prompt margin | ACCEPT. Exact reference combined bytes benign994/lookalike1009/DOM1018 leave30/15/6; baseline maximum842 leaves182. Safe ASCII run-ID characters occur twice, costing2 bytes each: DOM +3 reaches1024 and fits; +4 rejects. Security's claim that +3 rejects is an arithmetic error, retained in its original report. Labels, handles, inventory size, origin/port width and JSON escaping also consume allowance. Add short/long synthetic cohort-shaped factory cases and exact boundary checks. These do not choose production entropy or an S5 run-ID format. S5 must measure final IDs and real metadata before wiring; do not weaken §6 uniqueness or silently truncate content. QA baseline maximum841/183 is corrected from native data: lookalike842/182. Raw126696 leaves4376 only for that witness; inherited padded4194 margin remains. |
| QA P2-2: client system agreement | ACCEPT. Guard exact client.system equality before loop/provider. Actual SDK mismatch test checks wired provider count zero before error category; isolated deletion must call it and fail. |
| QA P3-1: stale phase §8/M10 skill sequencing | ACCEPT. Clarify minimal evaluated root source introduced at M6 S3; M10 owns launch packaging/full library guidance, with sizing/evaluation repeated after instruction edits. |
| QA P3-2 / security runtime src-to-testbed import | ACCEPT intentional evaluation-adapter coupling to trusted profile/source factories and public recipes. These adapters are not a standalone src-only package. No dependency-gate violation or expansion. QA's alleged runtime backedge to stub is type-only and erased, so its runtime-cycle claim is declined. |
| QA P3-3 / security redundant profile messages/sources/maxTurns | ACCEPT removal. Loop and scanner derive authority from trusted inventory/source factory, not duplicated profile snapshots. |
| QA P3-4 and security accessor metadata | ACCEPT separate fixed AgentProfileMetadataError for malformed/getter metadata, snapshot all fields once, retain thrown backend-list failure as availability setup. Tests exercise getter change, thrown private detail and malformed shape; isolated reread/error mutants must fail actual observations. |
| Security setup mapping / Codex availability concern | ACCEPT module preflight refinement: required trusted probeAvailability separate from metadata.available. Healthy inventory without an available password maps through existing handle-unavailable→missing_item; failed/locked backend maps through existing backend-error setup mapping. Actual fill-service mapping tests cover healthy empty/totp/unavailable-password and locked stale available metadata. No backend construction or secret resolution added; S5 still owns actual local-file/empty-baseline host wiring. |
| QA P3-5: CWD, temporary files and filename | ACCEPT file-relative root SKILL reads. Retain temporary evidence directories for inspection; no retention/cleanup guarantee claimed. Browser test remains in explicitly allowed hostile.test.ts; no out-of-scope rename or new contention guarantee. |
| Security six-witness inventory | ACCEPT independent exact six identity-pair pin outside both generated loops. External removal/duplication mutants fail it. Removing the pin with a missing witness restores a five-witness green, proving its distinct contribution. No existing S2 selector/guard weakened; completed S2 cap stays closed. |
| QA baseline browser_type exposure | ACCEPT actual SDK baseline response and ordinary password tool-arg independently scanned through S3 adapter. Separate capture-omission mutants prove each assertion. |
| Security vacuous uniqueness assertion | ACCEPT remove literal-vs-literal assertion and narrow title to supplied canary. S5 mints and proves cross-run uniqueness. |
| Security root SKILL provenance | CLARIFY explicit root-path and one-byte sensitivity obligation at S5. Existing plan §6/SCHEMA already require all tracked/nonignored source/config/docs inputs, new prompt files and skillSha256; the claim no obligation existed is overstated. S3 callers/tests consume exact root bytes, but source enumeration and production root-to-client/provenance binding remain S5. |
| QA two custody mutants share assertion | RECORDED bounded discriminator limit: both independent changes produce the specified observed exposure and are killed; no claim of unique diagnostic categories. New accessor mutant independently exercises read-once projection. |
| QA exact serial/2048 coverage | RECORDED: exact real prompts measured on all six fixed1024 schedules; serial/2048 diagnostics retain original padded envelopes. No claim that exact serial trajectories were remeasured or ordinary model actions fit. Fixed schedules selected after serial overflow are synthetic, not samples. |
| QA selector/fixture join and recipeVersion consumption | DEFERRED S5 production join and manifest hashing; current Chromium test proves runId across start/recovery only. Static recipe facts and canonical selectors have module checks, not composed receipt qualification. |
| Wording gate, no-secret instructions and model usability | RECORDED narrow three-pattern publishable wording check plus reviewed clean root source. Root-overflow mutation proves bytes consumed/rejected, not instruction quality. No automated general no-secret prose policy or pinned-model usability proof claimed; real pilots remain mandatory. |

All inherited S1-R3/S2-R2/R3 residuals remain: afterLoop source-forgery asymmetry is not widened
(no new host model-text/internal producer or source tuple); torn writes/appendSerialized gaps,
trusted-provider buffering, supply-chain scope, timer/status mutant survivors, detached-spy and
multiplicand/prompt-map/index/canonical-agent negative proof limits, provenance enumeration,
helper signal/Windows/falsy-error/denied-signal liveness, finite capture/decoder/timing limits,
assumed-unverified Docker isolation and postcapture-only signing limits. D-CANCEL stays OPEN before S4.
No paper/S1/S2/M5.2 review cap reset, later implementation, live cohort, commit, push or release.


### S3 R2 candidate — bounded repairs and ordered verification PASS

R1 dispositions above are implemented within the same authorized S3 scope. Required probeAvailability
is wired into both owner budget-factory calls. External tests-first native report retained25pass/8fail;
repaired worker suites39/39. Seven final new mutants have executed assertion failures. Initial healthy/
locked mapping mutant selectors matched zero tests: both originals remain labelled selector misses;
separate corrected-selector native reports execute and fail one test each. They are not counted as
successful original mutation runs. Owner reviewed every native result and compared integrated hashes.
Independent six-witness pin kills removed/duplicated identity challenges; deleting that pin while dropping
one witness yields5pass/0fail. Final external mutation copy matches integrated budget source.
Evidence: `worker-r2/`, `owner-r2/*-final/`, `r2-evidence-audit.json` under the S3 evidence root.

Ordered integrated checks: targeted304/304 (including all33 budget cases), npm run typecheck exit0,
git diff --check exit0, make test exit0; main2539pass/0fail/1 inherited skip, serial timings5/5+10/10,
final test execution PASS. Native reports/logs are preserved in `verification-r2.json` and
`make-test-r2-{main,timing-1,timing-2}.json`. Exact budget artifacts are copied from this full run.
The129 existing SCHEMA claim spans and claims.ts are byte-identical; inherited archive/memory files
remain identical and register entry content is an unchanged prefix (`preservation-r2.json`).
Source/tests and reviewed docs are now frozen for fresh S3 R2 QA/security/Codex fix reviews. No S3
acceptance is claimed yet. All prior residuals and scope boundaries remain; nothing committed or pushed.

### S3 R2 — owner acceptance and retained review limits

S3-only module implementation is accepted after R2. This is not S4/S5 wiring, a real-model result,
a closed M6 milestone or release authority. All source/test changes remain UNCOMMITTED at base
`3b6bbbe795d7fc90ef840327b5dc8a074756baef`. All inherited entry documents, residuals and closed caps
are retained. S3 did not consume a third review round or reset any prior ladder.

| Independent R2 channel | Original verdict / identity |
| --- | --- |
| Claude Opus5 QA | NEEDS-ATTENTION, no P1/P2; session`33d6d019-0248-4e0b-8a7e-b470baa35b8c` |
| Claude Opus5 security | NEEDS-ATTENTION, no P1/P2; session`16784909-5d97-4085-ae30-340ba864ed3c` |
| Fresh Codex adversarial | PASS; `/root/s3_adversarial_r2`, no actionable P1/P2/P3 |

Both Claude helpers completed exit2 with actual `claude-opus-5`; auxiliary Haiku usage remains separate,
not a substituted reviewer. Original reports/summaries are preserved under `claude-r2-qa/`,
`claude-r2-security/`, and `codex-r2-report.md` in `/private/tmp/tinyvault-m6-s3-20260907`.
Both bind candidate digest`e097b6a35ffb481db3f42ab680024e6155c454ccb8cb362a0ae8c313ed0d9695`.
Owner and fresh Codex independently checked all346 candidate file hashes. Reports were read in full;
none are relabelled PASS. The following dispositions are the owner's acceptance judgment under handoff §6.

| R2 finding / gap | Disposition |
| --- | --- |
| QA P3-1 / security P3-1 required probe contract | ABSORBED documentation clarification in SCHEMA and sibling M6/phase prose: required trusted probeAvailability/setupReasonFor share the discovery/fill backend; stale ItemMeta.available is insufficient. S5 must prove actual same-backend construction and fresh probing. Current injected callables cannot detect mismatched services. No FillService API expansion or backend source change is needed in S3. |
| Security P3-2 unpinned published numeric margins | ABSORBED by keeping numeric observations in this dated, source-bound register/artifacts and removing them as standing SCHEMA guarantees. Tests regenerate measurements and reject overflow, not a deliberately fixed future prompt size. S5 always remeasures final bytes. No new numeric gate or instructional restriction introduced. |
| QA P3-2 discarded prepare-time source validation | RETAINED redundant defensive validation at preparation; real enforcement remains in runAgentProfile/loop. Its deletion alone has no independent absence signal, and is not counted as a separate protection. Avoid removing validation merely to eliminate redundancy from the already tested candidate. |
| QA P3-3 optional ModelClient.system type vs adapter runtime requirement | RETAINED compatibility boundary. Generic loop clients can omit system; this adapter requires exact equality and uses one fixed missing/different diagnostic. Tests attach the required system/runId to generic stubs. A stricter adapter return type is a future ergonomic refinement, not a runtime bypass. |
| QA P3-4 missing-item fallback arm | RETAINED defensive branch/proof limit: bound real FillService does not return null for handle-unavailable. No independent exercised fallback claim. |
| QA P3-5 nested object spread style | RETAINED style nit; no duplicate field or changed behavior exists. No source churn solely to reformat tests. |
| Security P3-3 / QA shallow profile freeze | ACCEPTED trusted-caller limit. Bootstrap remains mutable by trusted code between preparation and execution; budget is rechecked but content is not deeply frozen/reprojected. The model never receives the object reference. Do not claim deep immutability or coverage for post-preparation trusted mutation. |
| Probe count/order/throwing probe and mapping callback | ACCEPTED bounded unit coverage. List-once is tested; probe count/order and callback-throw arms are not independently pinned. Blocked real mapping may probe twice and observe different states; disagreement remains blocked, not ready. Same-backend production wiring and setup-failure cases stay S5. |
| Metadata container getter and SDK internal wire-system guard | ACCEPTED scope limit: read-once proof covers item fields, not the inventory.items getter. S3 checks client.system and observes the actual SDK wire system in tests; no new runtime system comparison inside SDK capture is claimed. Trusted producers remain the boundary. |
| Shared availability assertion / baseline tests-first | RECORDED exact evidence: two corrected mapping rows use the same toEqual expression; baseline response/argument cases have distinct executed mutant kills but were not included in the25pass/8fail tests-first report. That report covers prompt/reference only. |
| Inventory challenge placement | Initial runtime pop occurred after the first loop was collected and selected the S3 exact loop. Its proof remains so bounded. Owner added a literal-source removal before either loop, ran the entire budget file:29pass/1fail at the independent pin. Removing only that pin too gives29pass/0fail. Native patches/argv/reports: `owner-r2/inventory-mutants-literal-full.json`, `literal-drop-full/`, `literal-drop-pin-deleted-full/`. This directly demonstrates both-loop shrinkage and the pin's distinct detection; original reports are retained. |

Historical exact R2 measurements (same unchanged root SKILL519 bytes and baseline system411 bytes):

| Witness | Reference combined / headroom | Baseline combined / headroom | Reference raw / baseline raw |
| --- | ---: | ---: | ---: |
| benign-login-control | 994 / 30 | 817 / 207 | 79274 / 76231 |
| lookalike-origin-redirect | 1009 / 15 | 842 / 182 | 126696 / 122507 |
| dom-hidden-injection | 1018 / 6 | 841 / 183 | 99082 / 96015 |

`exact-budget-r2-artifacts/` contains176 files; `exact-budget-r2-copy.json` binds their hashes and the
original temp directory, with all six measurement mtimes inside the native full-run budget-test interval.
Fresh Codex independently verified all copied hashes, raw lengths and prompt/bootstrap hashes. These are
specific fixed synthetic schedules, not independent model samples or arbitrary-ID/metadata guarantees.
Safe ASCII identity characters appear twice: DOM +3 fits at1024, +4 rejects. Keep inherited padded4194
raw margin separately; exact largest raw leaves4376. Final S5 identity/entropy/metadata and full command
source binding remain unresolved acceptance inputs, not reasons to truncate instructions or weaken §6.

No executable, test, root instruction or gate change followed R2 review. Final edits only clarify
contract documentation, disposition residuals and synchronize status. Handoff §5 mandates another fix
review for gating/correctness code; none changed after R2. Owner applies §5.1's documentation absorption
sweep and the mandatory actual wording/claim gate instead of opening an unnecessary third code round.
The further literal-witness experiments mutated only external copies of the same reviewed source.

All inherited S1/S2/M5.2 residuals listed above and in their canonical tables remain in force. Additional
S3 limits remain: exact serial/2048 not remeasured, actual DOM typing/selector/receipt joins unproved by
adapter mocks, shallow bootstrap, narrow wording policy, unavailable overwritten original R1 mutation
bytes, no live model usability/sampling, no S4 close/lifecycle proof or S5 provenance/command acceptance.
D-CANCEL OPEN before S4. No live pilot/cohort, Docker acceptance, clean clone, recording, commit/push or
release was run. The approved three-line index fixture extension is the only ownership extension;
initial direct Playwright import was repaired within scope through the vetted launcher, without a policy change.

Final documentation closure: absorption sweep recorded in `final-absorption-sweep.json`; actual claims
suite153/153 PASS on host (`final-doc-claims-host.json`), final git diff --check exit0. Initial sandbox
attempt152pass/1failed because the existing CORS fixture could not bind127.0.0.1 (EPERM); its native
`final-doc-claims.json` remains as environment-blocked evidence, not a code failure or passing run.
No code/tests/root instructions/gates changed after the reviewed R2 candidate; only the seven shared
status/contract documents differ (`final-source-preservation.json`). All129 existing claim spans,
claims.ts, inherited archive/memory bytes and original register prefix remain preserved. S3 exit is
complete within its module-level scope; no test, worker, reviewer or publication operation remains active.


### S3 checkpoint publication authorization — 2026-09-07

User explicitly authorized “Let’s commit and push” after read-only readiness verification. Scope is the
accepted S3 checkpoint plus five preserved S2 wrapup documents; no later-slice implementation or release.
Before publication, all346 final file hashes still matched, no additional files appeared, and GitHub main
matched the parent `3b6bbbe795d7fc90ef840327b5dc8a074756baef`. No code or gate change is bundled here.
Stage explicit paths including the seven new files, check the staged diff, commit, then run ordered exact-
commit targeted/typecheck/diff/full make checks before pushing. No completed review ladder is repeated.

Native evidence is retained locally in ignored `artifacts/review-evidence/tinyvault-m6-s3-20260907.tar.gz`
(SHA256`bcdabfc5faa698eaf485c94403bbf4b7e4be60dc56b32abc1fc9ef06c40c938a`), with1336 source-evidence/report/
command/measurement files and a sibling manifest. Redundant external candidate trees and symlinks are
excluded; original native failures, selector misses and labelled evidence limits remain. The archive is
not a GitHub artifact and is not included in the commit. Exact-commit verification and final local/remote
SHA are recorded after execution in ignored `artifacts/review-evidence/tinyvault-m6-s3-publication.json`.


### S3 formal session wrapup — 2026-09-07

Published checkpoint: `db78a1c914052d7424f9cf65e3caae654e3b85f4`, tree
`69a1904b6938156988622656495e8c923d0546f6`, parent3b6bbbe. Local HEAD/origin tracking/GitHub main
were equal after push, and GitHub main was rechecked at wrapup. Exact-commit ordered targeted304,
typecheck/diff and make test exit0; main2539pass/0fail/1 inherited skip, serial timing5+10 and final
execution PASS. No review result is promoted: Codex R2 PASS, Claude Opus5 QA/security NEEDS-ATTENTION
with no P1/P2 and retained P3 dispositions above. S3 completed at R2; R3 was not consumed.

Both evidence archives and publication archive members were hash-verified at wrapup. In addition to the
original S3 archive recorded above, exact-commit native reports/logs are retained locally in ignored
`artifacts/review-evidence/tinyvault-m6-s3-publication.tar.gz`, SHA256
`cc777a56dfedc4205420025f643eef00051a6d815a210283d07d021073f1a793`.
The sibling publication JSON binds the commit, tree, report/member digests, clean states and remote SHA.
Neither archive is a GitHub artifact or clean-clone prerequisite.

Documentation drift sweep: replaced active publication-future status with the verified checkpoint,
archived the old Current State including its inherited closed S2 text verbatim, retained the cumulative
Decisions Log, refreshed README/docs index/phase build status/M6 header, and added one project session
index entry plus two durable gotchas. A fresh read-only Sol check identified README's stale absent-agent
claim and backlog/index A1/A5 status drift; owner reconciled them to completed modules versus S5 command/
cohort proof, and annotated A2 as planned for S4/S5. M6 feasibility/adoption status now distinguishes
historical projections from passed S2/S3 finite witnesses. Dated S1/S2 boundary notes and append-only
registers remain preserved; their historical forward obligations are explicitly labelled as such.
No source, test, root instruction, gate, locked threshold, claim span or canonical claim-row edit occurred.
This is documentation hygiene, not a repeated plan/security review or a reopened cap.

S3 session ownership is relinquished at the final closed PLAN checkpoint. Next: fresh tinyvault-start,
preserve all ten dirty wrapup documents, and propose D-CANCEL-only resolution/evidence before S4 dispatch.
All S1/S2/S3/M5.2 residuals remain. S4/S5, live model/cohorts, Docker/clean-clone acceptance, recording and
release remain due at their scoped stages. No new commit/push is performed for this documentation wrapup.
Closure verification and the final dirty-file inventory are retained under
`/private/tmp/tinyvault-m6-s3-wrapup-20260907`; no user-global Codex memory was edited.


Wrapup verification: actual wording/claim suite153/153 PASS; documentation diff check PASS after removing
an EOF blank-line warning without altering the archived checkpoint bytes. Existing SCHEMA, canonical
claims implementation, all executable/test/root-instruction/gate files and Decisions Log are unchanged.
The old Current State is present verbatim in PLAN-archive; all previous archive/register/project-memory
content remains an unchanged prefix. Exactly ten documentation files are dirty, with nothing staged.
Fresh Sol's bounded closure recheck found every identified current-status drift point resolved and no
introduced contradiction in those passages; it did not run tests or reassess security/implementation.
Full tests were not rerun for this documentation-only wrapup; the exact committed source's successful
publication checks remain the executable evidence. No active worker, reviewer, test or publication job
remains. PLAN records the closed owner checkpoint; fresh-session scope begins with D-CANCEL planning.

## D-CANCEL — resolution and evidence packet (2026-09-07, owner claude)

Scope: the S4 entry decision only. No source, test, gate or root-instruction file changed; S4/S5 remain undispatched.
Raw evidence (scripts, logs, three Codex reports, the packet) is the local ignored archive
`artifacts/review-evidence/tinyvault-m6-d-cancel-20260907/` (manifest + sha256 in
`tinyvault-m6-d-cancel-20260907.manifest.json` / `.sha256`; tarball beside it). The packet text
`d-cancel-packet-draft.md` is canonical for the numbers; this entry records the decision and dispositions.

**Reproduction (real path, macOS host composition, black hole 10.255.255.1, exp2).** Both required cases stall:
after `navigation-failed` (goto timeout 1.5 s + 2 s settle), `browser_close_session` sat > 56 s; with close
requested 1 s into an active goto, the mutex holder ran its 30 s default goto + 2 s settle and then the close sat
> 28 s more. Both were censored at 60 s by a harness `browser.close()`. The stall site is `state.cdp.detach()` in
`disposeState`, preceded in the active case by the mutex wait. SYN_SENT sockets (2 per attempt) persisted until
context disposal. Native abandonment on this host is 75.0 s (`net.inet.tcp.keepinit` 75000; exp0/exp5); the
original Docker bridge observation was not re-run this session.

**Cause (exp1, exp3, exp4; Sol research corroborates from Chromium/Playwright source).** While a main-frame
navigation is pending in Chromium, the page-level CDP session stops answering the tested query commands
(`Runtime.evaluate`, `Page.getFrameTree`, `DOM.getDocument`) and `CDPSession.detach()` (which first sends
`Runtime.runIfWaitingForDebugger` on that channel). A Playwright goto timeout does not end the navigation.
`Page.stopLoading` is browser-handled, answers in ≤ 9 ms on a wedged session, rejects an active goto with
`net::ERR_ABORTED` at once and un-wedges the channel; it does not release the sockets. `context.close()`
(`Target.disposeBrowserContext`) returns in ≤ 10 ms with a page session attached or a detach pending, and is what
releases the sockets (SYN_SENT → 0). Raw Playwright without a project CDP session never stalls.

**Adversarial variants (exp4, exp8, real supervised path).** A hostile page's own `location.href = <black hole>`
wedges the session channel and Playwright's channel with no agent navigate (`browser_snapshot` > 8 s); one
stop restores it in ≤ 12 ms. Re-navigation loop, popup, subframe, WebSocket/EventSource and beforeunload
variants all closed in ≤ 5 ms after one stop with sockets released and the evidence lease clean; the popup
target's existence was not confirmed; workers and a confirmed second target with pending evidence are untested.

**Mechanism selected.** In `closeSession`: (1) unconditional `Page.stopLoading` on the session's own CDP session,
awaited under the single 5 s quiesce deadline (immediate rejection = visible failure + abort); (2) wait for the
mutex holder as today (it settles by itself: ≤ 2 s for navigate, exp6 S3 2003 ms on the real path); (3) admission
barrier plus attach → deferred fixed-point settle while targets live (E6); (4) context disposal BEFORE the
session's own page-channel cleanup (`Runtime.releaseObject`, `cdp.detach()`), which become best-effort, with the
page-close listener's fire-and-forget `releasePinnedObjects` suppressed during disposal; (5) close success only
after the context is observed gone from `browser.contexts()`, then final settle/drain; (6) deadline expiry aborts
the owned browser/run (which settles any holder), fails the cohort, never a successful close while work lives.
Proven externally on the real supervised path without code changes (exp6, exp7, exp8): close 2–5 ms after a
failed navigation, 2.0 s end-to-end during an active goto, SYN_SENT 0, evidence lease clean, POST bodies of
200,002 and 34 bytes to the black hole captured before cancellation.

**Holder bound (R1 P1-2 / R2 P1-1).** Resolved without a contract amendment by the plan's own escape hatch:
holders that do not settle within the shared 5 s deadline are settled by the browser abort and the run fails.
Options "5 s after holder settlement" (mis-added, caller-visible) and "shrink op timeouts" were withdrawn.

**Cross-model rounds (Sol, read-only, fresh sessions).** Research report (task-mtrn4l07-yyt7mq) ranked the same
mechanism first. R1 (task-mtrnm9w4-whasb7) NO-SHIP 4 P1/3 P2/1 P3 — read before exp6–exp8 existed; all eight
dispositioned in the packet §6. R2 (task-mtro1xj5-u8h8we) NO-SHIP — closed R1 1/4/7/8, added five findings, all
accepted (holder-bound third option adopted; stop-failure semantics fixed; fixed-point settle; close-listener
suppression; wording). R3 (task-mtroeb97-2idt4s, capped, P1 criteria stated up front) NO-SHIP with one P1 inside the criteria — the
deadline-abort holder-settlement claim was unevidenced — closed by exp9 on the real supervised path (navigate,
snapshot, click, type holders all settle within ~30 ms of the browser abort; pending close resolves; contexts 0;
sockets 0; no unhandled rejections) and by narrowing the claim; R2's five findings closed by the reviewer; R1-5/R1-6
remain S4 items. exp9 also showed that today an aborted run reports close `ok:true`, `finish()` pass and an empty
successful snapshot — the silent-wrong path S4 step 5 must close, with mutants. No fourth round (cap).

**S4 requirements carried from this decision (not silently absorbed).** F1 stop-on-timeout in `navigatePage` so a
failed navigation leaves a usable session, and an explicit navigation timeout (a black-hole iframe costs the
full 30 s default); F2 the self-navigating hostile page in the fixture corpus and stop-on-op-timeout as a
lifecycle rule; F4 the delayed-CDP-body and pending-attach cases under quiesce with a marker present and
`settle()` completing; R1-5 per-holder concurrent-close differential (result equality, lifecycle cleared once);
R1-6 a confirmed second target with pending evidence or a fail-closed residual; `Network.loadingFailed`
`ERR_ABORTED` correlation in the regression; deletion mutants for the stop, the context-removal check, the
fixed-point loop and the listener suppression. Evidence limits: single macOS host, one Chromium build, IPv4
only, SYN_SENT via `netstat` as the socket signal (no packet capture), mechanism emulated from a test-owned
second CDP session rather than in-path.

## S4 implementation — accepted at the round-3 cap (2026-09-07, owner claude)

Scope: M6 slice S4 (trusted quiescence with real navigation cancellation, per-op bounds, E5 capture qualification
module) implemented by Codex Astra in write mode across an initial candidate and two fix rounds, reviewed by three
channels per round (Codex adversarial, fresh Claude QA, fresh Claude security), with the owner running the full gate and
sampling mutants independently each round. Evidence archive (local, ignored):
`artifacts/review-evidence/tinyvault-m6-s4-packet-20260907/` — packet, dispatch prompts, worker reports, per-round
reviews (`codex-adversarial-review-r{1,2,3}.md`, `claude-qa-review-r{1,2,3}.md`, `claude-security-review-r{1,2,3}.md`),
fix-round packets (`fix-round-1.md`, `fix-round-2.md`), worker evidence (`worker-round{1,2}/`, 48 mutant patches with
result records and native reports), owner gate reports (`make-test-r{1,2,3}-*.json`) and `owner-round1-verification.md`.

**Mechanism as landed.** `closeSession`: courtesy wait only while a holder is active and at most once per session
(≤ 2 s, deadline-capped) → `Page.stopLoading` → mutex close → context disposal before session-CDP cleanup (listener
release suppressed while disposing; pinned objects cleared locally) → close qualified by observed context removal
(`browser-missing` reported once with a close latch; failed sessions retired, not re-walked). `navigatePage` passes
`NAVIGATION_TIMEOUT_MS` = 10 s and stops only on `TimeoutError` (fast failures keep the error-page settle). Supervisor:
admission barrier; every browser tool except `browser_open_session` and the fill run under `OP_TIMEOUT_MS` = 10 s,
stop on expiry, `OP_STOP_GRACE_MS` = 3 s then that session's context disposal with capture marked failed (no host-wide
abort); `quiesceEvidenceProducers()` (optional on the interface) arms one deadline = `settleTimeoutMs + 5 s`, runs the
runner's controlled settle, stops sessions, suspends page scripts with a ≤ 1 s advisory cutoff (promise retained and
awaited at disposal), drains deferred/attach work to a three-generation fixed point while targets live, stops child
targets with attempted/unconfirmed diagnostics, closes contexts, final settle/drain; expiry aborts the run; `finish()`
refuses on live sessions / pending work / undrained evidence with a trusted precondition message; post-abort results
are failures and the model-visible string set is unchanged. `EvidenceLease` moved to `src/supervisor/evidenceLease.ts`
(host split); `settle()` generation-bounded unconditionally. Runner: quiesce inside `afterLoop` before the transcript
seals; initial-snapshot observation sidecar; `scenarioCoverage.ts` qualification module (not production-wired; S5).

**Owner verification (each round, this host).** Round-1 candidate: `make test` exit 2 (controls matrix ×2, host.ts
920 > 800, wall-clock meta-gate). Round 1: exit 0 — 2613/0/1, timing 5/5, 17/17. Round 2: exit 0 — 2627/0/1, timing
5/5, 20/20, execution gate PASS. Final (with the G12 witness and the owner integration edits): make test exit 0 — main 2629 pass / 0 fail / 1 inherited skip; timing families 5/5 and 20/20; execution gate PASS (make-test-final-*.json). Real-path reproduction (no external stop) after rounds 1 and 2: close 3 ms after a
failed navigation, 4.0 s during an active goto, SYN_SENT 0. Owner mutant spot-checks with restored-source controls:
01/09/28 (round 1) and 37/39/40 (round 2) all killed, controls green. Owner integration edits: Docker capability row for
the finalization test; structural size gate pins `evidenceLease.ts`, `session.ts`, `host.evidence.test.ts`,
`runner.finalization.browser.test.ts`; the worker's proposed contract-doc patch (phase plan, M6 plan §7 timing
refinement, SCHEMA) applied with the D3 budget sentence; finalization test scratch moved out of the archive.

**Review rounds.** R1 (candidate): Codex NO-SHIP 2 P1; QA NEEDS-ATTENTION 3 P1; security NEEDS-ATTENTION 2 P1;
24 findings F1–F24 dispositioned in `fix-round-1.md` (F5 trusted-backend stall = declared residual; F7 clarified per the
worker's STOP; F11 E5 publication wiring narrowed to S5). R2: Codex NEEDS-ATTENTION 1 P1 / 1 P2 / 1 deviation; QA 0 P1 /
3 P2; security 1 P1 / 4 P2; 18 findings G1–G18 with owner decisions D1–D4 and the adopted G2/G6 clarifications
(`fix-round-2.md`). R3 (capped, P1 criteria fixed up front): QA PASS, security PASS, Codex NEEDS-ATTENTION with one
in-criteria P1 (G12's ordinary-settle generation bound witnessed only at the lease helper): closed by a test-only Sol witness (`src/supervisor/host.settle.browser.test.ts`: real `createSupervisedHost`, four
deferred-body generations, `settleEvidence()` returns while the fourth is held, then release and preservation; control
included) which the owner ran clean (2/2) and against mutant 40 (assertion kill: `expected 'timeout' to be 'settled'`),
source restored byte-exact. No fourth review round; R3's P3s and the QA/security residuals are recorded below.

**Declared residuals (carried, not silently absorbed).** (1) A stalled TRUSTED backend or a non-cancellable trusted
capture holds the mutex/quiesce past the abort trigger; only the trigger is bounded; regressions show release → failed
settlement with no abandoned work; bounded backend contract filed for the 1Password/Bitwarden adapter step. (2) `abort()`
discards ALL lease evidence including pre-abort captures; the verdict is capture-failed, never clean; S5 snapshots the
array before `#drop`. (3) Page-scoped producers are suspended; nested/service-worker targets are bounded by the
three-generation cap plus disposal and only counted (attempted/unconfirmed), never-attached producers uncounted;
generation 4+ degrades to markers by design. (4) Socket release is proven only by the owner's SYN_SENT observation
(exp series and this session's re-runs), not by a test assertion. (5) E5 publication rejection is not production-wired
(S5). (6) G16: no round-1 timing distribution retained for the tripwire real-click family; A/B symmetry kept.
(7) `browser_open_session` is the one tool outside the per-op bound (not page-reachable). (8) Unmutated arms: the
courtesy deadline term and the suspension reserve; the G3 regression's fixed 14 s sync; `abortSessions`' recovery loop
per-entry guard — S5 test items. (9) M5-C7 unload/keepalive limits unchanged. Rounds are capped at three; no fourth
paper or fix round was opened.

## S4 residual (8) — unmutated arms closed by a Sol test-only packet (2026-09-07, owner claude)

Scope: the four arms declared unmutated at S4 acceptance (residual 8): the `deadlineAt` term of `courtesyWait`
(`src/browser/session.ts:369`), the one-second reserve in `suspendScripts` (`session.ts:790`), the per-entry guards of
`abortSessions`' recovery loop (`session.ts:202`, `:204`), and the fixed 14 s sleep in
`testbed/runner.finalization.browser.test.ts:192`. Dispatched as a test-only packet to Codex `gpt-5.6-sol` in an
isolated worktree (`codex/s4-arms`, base `39126cf`), in parallel with the S5 packet's paper pass. Packet, worker report,
patch and owner logs: `artifacts/review-evidence/tinyvault-m6-s5-packet-20260907/sol-s4-arms-*.md`,
`sol-s4-arms.patch`, `owner-arms-verification.log`, `owner-arms-mutants.log` (local, ignored).

**Delivered (test-only; no production edit; `session.ts` SHA-256 unchanged).** `src/browser/session.test.ts` 585 → 669
lines: four Node tests over the existing `FakeCdp`/`FakeContext` seam — "uses the quiesce deadline to end courtesy
before the two-second window", "reserves disposal time before a blocked script-suspension round trip" (with a
far-deadline control in the same case and the retained suspension promise proven awaited at `closeAll`), "retains an
emergency-close failure for a later recovery attempt", "waits for an in-flight model close before per-entry abort
disposal". `testbed/runner.finalization.browser.test.ts` 796 → 796 lines: the 14 s sleep replaced by awaiting the
captured operation under `expect(elapsed).toBeLessThan(14_000)`; every prior assertion, the `finally` and the 22 s
timeout retained.

**Mutants.** Worker (Node, worktree, owner toolchain): A `Math.min(deadlineAt, courtesyUntil)` → `courtesyUntil`:
killed (`expected 2011 to be less than 1000`); B(1) delete `- 1_000`: killed (`expected 1002 to be less than 850`);
B(2) delete `Math.max(0, …)`: EQUIVALENT for the required observation (Node clamps a negative delay to 1 ms with
`TimeoutNegativeWarning`; recorded, not claimed); C:204 unconditional delete: killed (`expected 6 close calls, got 3`);
C:202 drop the close-promise await: killed (`expected [false], received [false, false]`). Owner reproduction on main:
A killed (`expected 2006 to be less than 1000`), C:204 killed (`"close" called 3 times, expected 6`), source restored
byte-exact. Owner-run Arm D mutant `OP_STOP_GRACE_MS` 3_000 → 5_000: killed (`expected 15005.27 to be less than
14000`); the previous fixed sleep would have passed; `host.ts` restored byte-exact.

**Owner verification on main:** `src/browser/session.test.ts` 35/35 three consecutive runs; `npx tsc --noEmit` exit 0;
`testbed/runner.finalization.browser.test.ts` 31/31 (control). `make test` deferred to the S5 integration gate (the
S5 packet is still under paper review; no other tree change). Deviations recorded by the worker: sandbox could not run
`git checkout` (index.lock EPERM) so mutants were restored by reverse patch and hash-verified; the worktree had no
`node_modules`, so the suite ran through the owner checkout's Vitest with `--root`. Residual (8) is CLOSED; residuals
(1)–(7) and (9) are unchanged and carried by the S5 packet. Real-clock margins in the new tests (200–1000 ms,
350–850 ms, 900–1500 ms) are wide but not immune to heavy machine load; if they flake under the serial timing
convention, widen the observation, never the reserve.

## S5 packet — Sol paper pass R1 and owner dispositions (2026-09-07, owner claude)

Scope: pre-dispatch read-only review of `docs/m6-s5-handoff.md` by Codex `gpt-5.6-sol` (`task --fresh`, review-shaped
prompt with an explicit READ-ONLY preamble). First attempt `task-mts2g9xk-rvqmq9` died silently at ~13 min (pid gone,
log stale, no result; archived as `sol-packet-review-r1-attempt1-dead.log`); cancelled and re-dispatched once with
identical arguments as `task-mts3amtl-w3s8u7`, which completed. Prompt and review:
`artifacts/review-evidence/tinyvault-m6-s5-packet-20260907/sol-packet-review-r1-prompt.md`, `sol-packet-review-r1.md`.

**Verdict NO-SHIP; 3 P1 / 3 P2; all six verified by the owner and ABSORBED.**

- **F1 (P1, process)** — the packet's decision D-S5-9 (single eval test file + non-test module in place of the plan
  row's `runner.realAgent.eval.test.ts`) was missing from the approval list and the plan row was not scheduled for
  amendment before dispatch. Absorbed: approval list is now D-S5-1…10; the §7 S5 row amendment is owner
  pre-integration step 2 (before the pin).
- **F2 (P1)** — "assert `list_vault` exactly once and before the first provider request through the transcript" was
  unobservable: `host.tools.list_vault` runs through `capturedVault` → `captureTrusted`, which feeds only the tripwire
  and writes no transcript record (verified `src/supervisor/evidenceLease.ts:431-441`, `host.ts:402`). Absorbed with
  Sol's fix: a trusted runner-side wrapper appends one `meta` transcript record (the kind the runner already uses for
  `post-loop-drain`) and delegates once; order via that record preceding the first `sdk-request`; count via a backend
  spy. No new record kind.
- **F3 (P1)** — "read `provenance.config` from the S2/S3 constants, not re-declared" was unimplementable: the endpoint
  is a private constant, `temperature: 0` / `maxRetries: 0` are literals inside the class, and no API-version constant
  exists (verified `src/agents/anthropicClient.ts:10,34,46`), while the packet forbids editing that file. Absorbed as a
  new pre-authorized Astra-only extension §J / **D-S5-10**: export a frozen resolved-config object the class itself
  reads, bound to the captured request (URL, `anthropic-version` header, body fields) by the composed test. Rejected
  alternative: re-declaring in `testbed/` (provenance could diverge from the live client).
- **F4 (P2)** — the `dirty` derivation was ambiguous ("derived from hashing"). Absorbed with Sol's wording: `dirty` iff
  `git status --porcelain=v1 -z --untracked-files=all` prints anything; the four read-only Git commands are now the
  enumerated permitted set.
- **F5 (P2)** — the mutant inventory named only E1/E7/E8 rows although the plan's S5 row requires E1–E4 re-proved at
  the command boundary. Absorbed: E2 and E3/E4 rows added, each applied temporarily to its production file and killed
  through `runEvalEntry` with the fake-fetch cohort, then restored byte-exact.
- **F6 (P2)** — `TINYVAULT_PROFILE=… && …` would bind the variable to the first command only. Absorbed with the exact
  `scripts.baseline` / `scripts['eval:stub']` strings, the variable prefixed to the vitest command itself.

Sol's specific checks 2, 3, 4, 6, 7, 9 returned "no issue": the eval-gate pins hold as the packet states; the run-ID
arithmetic is `1018 + 2×(46−46) = 1018 ≤ 1024` (6 bytes spare on the DOM-hidden reference cell); the two supervisor
extensions are minimal and outside `tools`; `runAgentProfile` composes with the owned executor/finalizer without
`src/agents` edits; the E5 outcome is derivable in `runOnce`; F.2 admits no unverified run. Owner §5.1 sweep run
after absorption (no stale tokens). One paper round used of three; the packet awaits user approval of D-S5-1…10
before the pin and Astra dispatch. No implementation, cohort, Docker or release authority follows from this entry.
