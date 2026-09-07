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
