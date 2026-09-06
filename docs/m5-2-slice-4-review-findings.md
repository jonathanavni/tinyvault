# M5.2 Slice 4 — append-only findings and dispositions

## Entry 1 — planning ownership and baseline, 2026-09-05

Owner: Codex `2026-09-05-m5.2-slice4`, explicitly assigned by user, who confirmed no other active Claude sessions.
Baseline `main` @ `dc0796fa8616548c6fa61315fed4b2b9bde97620`. Only a pre-existing PLAN focus stamp was dirty;
owner extended it. Source/implementation remains unchanged. No branch, commit, merge, or worker implementation.

Measured: Node 24.19.0; Docker client/server 29.6.2; Compose 5.3.1; Claude CLI 2.1.258. Docker sandbox denied
socket access; authorized host invocation worked. Typecheck PASS; `npx vitest run testbed/docker` PASS 547/22;
`make test-docker` PASS 4/4, ~80 s, entry/execution proofs PASS. Baseline only, not Slice 4 acceptance.
Evidence directory: `/private/tmp/tinyvault-slice4-planning/` (temporary local artifacts).

**Baseline blockers, independently reproduced:**

1. `make test` exits 2 at Docker invocation gate: `scripts/claude-review.mjs:3` and
   `scripts/claude-review.test.mjs:4` import `node:child_process` outside the existing profiles. Both are tracked
   at baseline. Logs: `make-test-baseline.log`. The gate failure is correct, not a sandbox defect.
2. `npx vitest run scripts/claude-review.test.mjs` exits 1: the Node test file has zero Vitest tests,
   "No test suite found". Log: `review-helper-vitest-probe.log`. Allowlisting imports alone cannot restore green.

## Entry 2 — independent blind paper round 1, revision 1

Candidate: baseline HEAD above plus PLAN checkpoint and untracked plan revision 1; file digest
`0b6e9ca6938597529a9dbdfc674a44e5dbc76c475a090ac4097ce5f9ad542e68`.
Inventory: `revision1-candidate.json`; Claude saved the same digest before/after. No source writes during review.

| Channel | Result / evidence |
| --- | --- |
| Fresh Codex GPT-5.6 Sol, worker `slice4_paper_r1` | NEEDS-ATTENTION, 2 P1 / 2 P2; read-only, no tests or workers. Recorded report `sol-round1.md`; full report in worker transcript. |
| Fresh Claude Opus 5, plan channel | NEEDS-ATTENTION, 1 P1 / 7 P2 / 5 P3; read-only, no tests or workers. Session `5ebef537-a8fc-4beb-a69e-1c874df29128`; `claude-round1-host/report.md` and `summary.json`. Actual assistant model exclusively claude-opus-5, candidate unchanged. |

Claude dispatch: `node scripts/claude-review.mjs --repo /Users/jonathanavni/Documents/Coding/tinyvault
--packet /private/tmp/tinyvault-slice4-planning/paper-round1.md --channel plan
--base dc0796fa8616548c6fa61315fed4b2b9bde97620
--output /private/tmp/tinyvault-slice4-planning/claude-round1-host` (host permission).
The initial sandbox attempt failed authentication and returned a synthetic login message; it was not a review
and did not consume a paper round. Its failed summary remains under `claude-round1/`. Host retry completed exit 2.
CLI auxiliary Haiku usage is preserved in summary metadata; it is not relabeled as reviewer output.

### Owner dispositions in revision 2 — not yet re-reviewed

| Finding | Disposition |
| --- | --- |
| Both: ack after aggregate persistence outlives early-run 60-second capability | ABSORB: runner omits optional ack and retains receipts until teardown. Explicit ack API stays single-use/expiry-tested. No extra checkpoint format or swallowed failure. |
| Both: finalize and ack missing from D routing mutants | ABSORB: all seven operations, including fire-and-discard and ignored reads, require positive counters and negative page-path mutants. |
| Claude: wire-only observation misses direct shared-fixture calls | ABSORB: observation at actual administrative primitive; direct HTTP-handler bypass of ControlSession must redden D. |
| Both: 5000ms drain masked by 5000ms bridge deadline | ABSORB: 3000ms drain, 5000ms bridge; independent deadline-deletion/code tests. |
| Both: private-key Docker/constructor cells unproven | ABSORB design: fake-runner ProjectCloser tests with known-key patterns for actual readers; explicit structural generation/return/bundle boundary inventory; actual startup wiring tests. Executability and deletion sensitivity remain pending. Never claim live unknown-key scanning. |
| Claude: new uncaptured post-finalization 409 contradicts accepted limits | ABSORB design: late refusals invalidate the run, normal path zero; no new successful-run SCHEMA exclusion. Terminal signal through shutdown still needs precise implementation/review. |
| Claude: no existing injectable crypto generator | ABSORB: Vitest module mock only; no production key-provider/test-mode parameter. |
| Claude: rendered-token mutant rejected by shape instead of scanner | ABSORB: canonical capability encoding of the rendered token's 32 UTF-8 bytes; require secret-exposed. |
| Claude: 60-second interval unmeasured; scanner growth | OPEN measurement: registration through transfer/attest and ~183 scanners / 120-second export budget. Historical stub artifact times do not establish composed timing. |
| Claude: raw duplicate-token lifetime | ABSORB clarification: duplicate registry shares session lifetime and clears on close, no immortal raw-token set. Existing scanner retention through teardown remains deliberate. No new token digest derivative introduced. |
| Claude: capture-write is harness-only | ABSORB: keep it out of wire codes; scope harness error vocabulary to job C. |
| Claude: response hook crosses job ownership | ABSORB: job C consumes registration response and registers patterns before exposing completion. Owner additionally flags pre-registration stderr as an OPEN observation window requiring executable proof. |
| Claude: L lifecycle overlap and placeholder removal | ABSORB: explicitly reuse lifecycle subcase proofs at Slice 5; remove both error class and test placeholders. |
| Sol: chunk repeatability test absent | ABSORB: explicit same-offset reread after discarding a response; actual EOF/timeout remains terminal. |

Both channels explicitly accepted bootstrap-session registration and the attestation partition: Slice 4 carries
authenticated/finalized/single-use dispatch using the existing signer; Slice 5 owns both domain-separated signed
preimages and full L. Numeric byte/time bounds are implementation parameters, not automatically locked conflicts.
No finding was closed merely because the reviewer proposed it; revision 2 records design changes, not executed proof.

## Entry 3 — prerequisite decision packet; no amendment applied

Current rule: `docs/m5-2-slice-3-plan.md:620-628` pins script subprocesses to literal `process.execPath`.
That paragraph's four-file measured inventory supersedes the obsolete "exactly one" introductory sentence.
The later independent-review helper inherently invokes literal `git` and `claude`; it cannot meet this rule as
written. Slice 4's draft also excludes static-gate policy changes without a separate scope disposition.

**Proposed narrow contract change for user disposition:** retain existing default profiles; permit only direct
`execFileSync('git', ...)` and `spawn('claude', ..., {shell:false})` in `scripts/claude-review.mjs`, and only direct
`execFileSync('git', ...)` / `spawn(process.execPath, ...)` in its test. Pin exact imported bindings, four call
sites, literal executable expressions and shell-disabled options. Reject aliases, computed targets, wrapper
launchers, spreads/overrides, other APIs/executables and extra calls. No path exclusion or broad child_process grant.

Prerequisite file scope: `scripts/docker-invocation.mjs`, `scripts/docker-invocation.selftest.mjs`,
`scripts/claude-review.test.mjs` (migrate to Vitest with equivalent cleanup/assertions; do not hide it from test
discovery), and only the corresponding review-tool verification-command documentation in `docs/handoff-pattern.md`.
Append the approved policy disposition to the Slice 3 register/plan canonical paragraph, preserving history.
Package scripts, Makefile, Vitest configs, evaluated tools and root pins stay unchanged unless a new demonstrated
conflict requires its own disposition. The standalone Node test command will be replaced by the targeted Vitest
command after migration; existing actual test cases must remain present and counted.

Required independent reds through the production gate CLI: delete each profile; change each of the four
executables to docker; introduce env/shell wrappers, alias/reference escapes, computed targets/options,
extra imports/call sites; remove shell:false or override it true. Preserve every existing gate mutant and
positive production-call inventory. Test migration must preserve all completion/model/tool/timeout/drift cases.
Run gate CLI, invocation selftests, targeted Vitest helper tests, full make test, diff check. Independent review
of the exact prerequisite is mandatory because it changes a security gate. No code for this packet is written.

## Current status

**NEEDS-ATTENTION.** Paper round 1 complete; revision 2 NOT LOCKED. Remaining: prerequisite contract decision,
bounded timing/scanner measurements, terminal late-request propagation and pre-registration stderr observation,
then revised paper review. No Slice 4 implementation dispatched; no ongoing review jobs. Changes uncommitted.

Deviations From Handoff: no unauthorized scope or source changes. Planning exposed two pre-existing baseline
failures, so the full security-core ladder has not advanced to implementation. Required checks are not waived.

## Entry 4 — user approved prerequisite repair, 2026-09-05

User: "I agree with your recommendations - please proceed." This authorizes Entry 3's narrow policy amendment
and repair, including equivalent Vitest migration. The owner applied the contract disposition in the Slice 3
plan/register and changed the verification command documentation. `prerequisite_impl` owns the three code/test
files. `execFileSync` may use its reviewed implicit shell-disabled default; explicit shell values must be false.
Spawn remains explicitly shell:false. No source outside the approved scope, commits or merges authorized.
Next: required CLI/mutation/targeted/full checks, independent exact-candidate review, then resume Slice 4 planning.

### Prerequisite scope refinement, owner disposition

The expanded invocation selftest exposed a further baseline fixture mismatch: `gate-cli.selftest.mjs` copies
all scripts (including the newly tracked helper test) but its synthetic execution report omits that file, causing
`check-test-execution.mjs` to fail `report-files`. Owner inspected `prepare`/`evidence` and extended the worker's
allowlist to **`scripts/gate-cli.selftest.mjs` only for this synthetic report inventory/count repair**. Production
inventory rules and caller-deletion checks remain unchanged; no exclusion or broader gate policy was authorized.
This is necessary to verify the approved prerequisite through the real CLI, not a Slice 4 feature expansion.

## Entry 5 — prerequisite round-1 evidence and dispositions, 2026-09-05

Candidate base/HEAD `dc0796fa8616548c6fa61315fed4b2b9bde97620`, uncommitted inventory digest
`e8e848aea217e375c965eafb1b69e75e6a9001f0d0a10e007b7cd572b18a7d95`. Evidence root:
`/private/tmp/tinyvault-slice4-prerequisite/`. Worker CLI, invocation selftest (84 source mutants, 18 isolated
guard deletions), targeted Vitest (6/6), and diff check passed. Owner full host `make test` completed exit 0:
1574 main, 5 + 10 serial timing, one expected pending eval, final execution proof PASS (`make-test.log`).

Independent reviews held this candidate stable:
- Fresh Astra `prerequisite_review`: NEEDS-ATTENTION, concrete P2 argv-overload escape; owner saved summary
  `astra-round1.md`. All four actual call sites accept both second-argument `{shell:true}` and call-level spread
  moving malicious options into the effective third position. Eight static-gate probes pass unexpectedly.
- Claude Opus 5 QA: completed NEEDS-ATTENTION, session `cefb6e62-8ea8-4101-808c-21ff0a0a2c35`,
  `claude-qa/report.md`; P2 default 5-second Vitest timeout, P2 missing completion evidence, P3 isolated
  duplicate-key/optional-call/type-only mutants and stale fourth-file scope record.
- Separate Claude Opus 5 security: completed PASS with notes, session `c1a84fc2-1e2c-4487-babf-b8ded71861d3`,
  `claude-security/report.md`; timeout concern, concrete forbidden-env test and genuine shell-enabled deletion
  mutants requested. Static PASS does not override Astra's demonstrated escape.

Owner dispositions: ABSORB argv-array/call-spread correction, explicit per-test timeouts, and missing isolated
mutants. The helper's `claudeArgs()` producer requires a pinned array return and protection against rebindings
or shadowed producers. Inner array spreads remain valid argv construction. Full-suite missing-evidence finding
is resolved by the completed owner's command above (packet was dispatched while it ran); repeat after fixes.
Correct the fourth-file scope record by append-only Slice 3 entry. Argv content/PATH/config program identity is
an inherited static-containment limit, now stated explicitly in the canonical paragraph; no claim of sandboxing
trusted operator/repository configuration. Cleanup migration retains Vitest's per-test onTestFinished cleanup.
Acceptance remains pending fix round 2 and fresh Astra/Claude QA review. Source freeze released only after both
Claude runs completed. No Slice 4 feature code or commit is authorized by this prerequisite completion evidence.

## Entry 6 — measured budgets and revision-3 planning dispositions, 2026-09-05

Owner ran external probes under `/private/tmp/tinyvault-slice4-prerequisite/`, with no fixture-source edits:
real Chromium `capturePersistedRuns`, one sample per existing scenario, passed with registration-through-attest
262/115/92 ms. This is the in-process path only. Production stream scanning of an actual 249409024-byte stopped
fixture-image export passed with 183 synthetic secrets in 13355 ms and 579 in 41667 ms; the existing export
positive control was observed in each pass, and the exact temporary containers were removed. Logs:
`browser-timing-host.log`, `browser-timing-results.json`, `export-benchmark.log`, `export-budget.log`.

Revision 3 replaces the unmeasured 1024-record proposal with 32 runs per fixture (579 project-wide secret needles
at the three-fixture maximum), retains the 120-second export deadline, and adds a 64 MiB per-fixture retained
capture payload limit. N=10 for the present scenario inventory remains supported; larger evaluations can fail
explicitly at the limit. These bounds are proposed implementation parameters, not a measured worst-case guarantee.
New composed operation timing and maximum-budget teardown must be measured after the protocol exists.

The revised plan makes late-write failure sticky through drained fixture close; in-process close rejection and
container fixed failure marker/stopped-log reader reach the production runner's finally-close before successful
publication. It also retains and rescans bounded stderr after token registration, with sticky overflow failure.
Both writer/reader and rescan/overflow deletion mutants are required. These are concrete planning dispositions,
not implemented behavior or accepted security evidence. Revision 3 remains NOT LOCKED pending paper review.

## Entry 7 — prerequisite round 2 and final simplification, 2026-09-05

Stable candidate digest `9d5fafc6494cd4f56da0ea5931108e451c27dc5346c83b91b9c6bd12ca54df49`, same base/HEAD.
Worker CLI/selftest PASS: 126 source mutants, 56 isolated guard deletions, 11 rules, three caller deletions;
targeted Vitest 6/6, diff check PASS. Owner `make test` host exit 0, 1574 + 5 + 10 passed, one expected pending;
main reporter contains all six helper cases, final execution proof PASS. Evidence `make-test-round2.log` and
`make-test-round2-result.json` under the existing external evidence root.

Claude Opus 5 QA PASS, session `37a0aec9-d5f7-41d9-8228-c128aaee0d72`, `claude-qa-round2/report.md`.
Fresh Astra via installed Codex companion, thread `01a0726e-5405-7241-879c-04aa8328a624`, NEEDS-ATTENTION:
direct eval rebinds `claudeArgs` to return `{shell:true}` without an AST identifier reference, reopening overload.
Owner measured the static acceptance and JavaScript rebinding with `argv-eval-probe.mjs`; no real subprocess.
QA declared dynamic eval outside the static gate, but owner chooses a simpler construction that closes this
specific load-bearing dependency: `[...claudeArgs()]` at production spawn, uniform inline-array check everywhere.

Explicit owner scope extension: `scripts/claude-review.mjs` solely for that argv wrapper; retain four prior
files. Remove special producer-reference/shape analysis, add real helper fake-CLI mutation evidence and isolated
wrapper deletion. This preserves approved executable/options policy and reduces special-case code. Final-round
P1 criteria: concrete shell/executable policy escape, lost CLI/caller/execution proof, or red make test. Existing
syntax-vs-runtime-content limits remain declared. QA's diagnostic wording and non-isolated legacy mutant families
are recorded residuals; their broad repair/root-pin edits are outside this prerequisite. The indirect-producer
documentation concern disappears with uniform array syntax. No further source changes while final reviewers run.

## Entry 8 — paper round 2, owner disposition and unresolved contract decision, 2026-09-05

Revision 3 reviewed at digest `9d5fafc6494cd4f56da0ea5931108e451c27dc5346c83b91b9c6bd12ca54df49`.
Sol absorption channel `slice4_paper_r1` NEEDS-ATTENTION (P1 attribution conflict). Separate Claude Opus 5 plan
review completed NEEDS-ATTENTION, session `6b007536-ee83-4f6a-99b7-31cf11d01105`,
`/private/tmp/tinyvault-slice4-prerequisite/claude-plan-round2/report.md` (2 P1, 3 P2, 4 P3).
This was blind paper round 2; Sol was reused for absorption because the session's agent-thread limit prevented
a fresh spawn. It remained a non-author, read-only independent paper channel. Claude was fresh.

Owner dispositions in revision 4 (NOT LOCKED):
- **OPEN, contract-owner decision:** Sol demonstrated that revision 3 promoted page-supplied unauthorized-run
  attribution into a verdict gate, conflicting with SCHEMA's corroborating-only statement and D3. Owner confirmed
  both source statements. Proposed replacement: immutable post-finalization snapshot, page-attribution
  noninterference, fixed 409 for later writes, and explicit SCHEMA declaration of that additional capture boundary.
  Preserve authoritative network evidence and the existing unload blind spot. SCHEMA is untouched; the plan
  marks this paragraph pending approval. Sol checked the bounded proposal and recommended approval with clarified
  capture-bookkeeping-only use of runId. No change to locked D3 is proposed.
- Claude's missing shutdown-marker ownership and fail-open post-drain absence issues are **superseded in the
  proposal**, because page-driven invalidity and its new verdict marker are withdrawn. No topology/main-source
  marker change is planned. This is not a claim that a flawed marker mechanism was tested or closed.
- ABSORB independent F observer gap: job D must harvest all real response-minted capabilities independently and
  plant them through the actual artifact/stopped-surface readers; deletion of either production or observer token
  registration is separately red. Bootstrap-only inventory cannot close capability exposure.
- ABSORB probe invariant gap: replace absolute bootstrap/hello request inventory with settled probe-window deltas
  over frames/ids and underlying operation counts; a dispatch inside the window must fail.
- ABSORB admission/GET/duplicate-409 ambiguity in the proposed lifecycle: handler-entry admission high-water mark,
  drain already admitted bodies, read-only GET unchanged, active-run duplicate receipt 409 non-terminal. Proposed
  late attribution never mutates receipt/capability/verdict. Production browser-close-before-finalize is a gate.
- ABSORB constant-only `ttlMs` field removal; server's fixed 60000 ms authorization remains. Apply 128-character
  run-id validation in both transports through the shared validator. Declare composed unauthorized debug-file
  parity delta as a Slice 6 input. Refresh prerequisite status in the draft.
- Private-key startup/control writer test ownership now explicitly includes `container/main.test.ts`; no claim
  of unknown-key live scanning. Any sink whose actual writer cannot be exercised remains a pending F cell.

No feature implementation before contract decision and capped final paper review. All baseline and supplied
measurements retain their stated limits. Reviewers ran no tests; dynamic results belong to the owner/worker logs.

## Entry 9 — prerequisite accepted, final candidate evidence, 2026-09-05

Reviewed code at candidate digest `7f3990748749c7a4d45afaf79b92985b4a7d41035bdf8bded345f89a95c8944d`, same
base/HEAD, five source files uncommitted. Final worker ordered checks: invocation CLI PASS; 111 source mutants,
41 isolated guard deletions, both profile-removal proofs and three original CLI caller deletions PASS; targeted
Vitest 6/6 in 3.64 s; diff check PASS. Actual helper runtime proof: identical eval rebinding with wrapper present
(no fake CLI launch), wrapper deleted (fake CLI launched), restored (no launch), ordinary helper (success).

Fresh Astra final thread `01a07281-876e-7132-bf33-153d69ff3c62`: no actionable code finding, formal
NEEDS-ATTENTION solely for host-suite evidence still pending when read (`astra-final-report.md`). Fresh Claude
Opus 5 QA final session `84b986b4-d3ff-471e-9d91-062d60303c86`: same outcome, no remaining in-scope bypass,
NEEDS-ATTENTION solely for pending host-suite completion (`claude-qa-final/report.md`). Earlier separate security
channel completed as recorded in Entry 5; later fixes received both required absorption channels.

Owner subsequently collected **actual `make test` exit 0**: main 1574 pass / 0 fail / one expected pending,
all six helper cases present and passed; serial timing suites 5 + 10 passed; final execution proof PASS.
`make-test-final.log` and `make-test-final-result.json` under `/private/tmp/tinyvault-slice4-prerequisite/`.
Both reviewers' completion-evidence conditions are therefore resolved without relabeling their original reports.
The final prerequisite is ACCEPTED within its reviewed regression claim. No commits/merges or feature acceptance.

Residuals: argv contents/PATH/program behavior and inherited process identity remain outside syntax policy;
exact mutation anchors and V8 diagnostic wording fail loudly on maintenance drift; independently computed
manifest argv could diverge under hostile source/runtime rebinding, outside the approved trusted-code claim.
Not run: new Slice 4 live acceptance (feature unimplemented), exact-commit clean clone/merged-tree gates (work is
uncommitted and no commit/merge authorized). Existing Docker baseline is not transferred to new feature claims.
Deviations From Handoff: owner documented two necessary prerequisite scope refinements — synthetic report fixture
and the one production argv-wrapper expression; workers stayed inside those revised packets.

## Entry 10 — capped final paper round, approval-ready revision 5, 2026-09-05

Fresh Sol final paper via companion, thread `01a07284-eb77-7b10-bfaf-670779e56092`, NEEDS-ATTENTION; fresh Claude
Opus 5 final plan, session `ce0d83b2-d47e-4355-948c-a920d9c805b2`, NEEDS-ATTENTION. Reports:
`sol-final-paper-report.md`, `claude-plan-final/report.md` in the external prerequisite evidence root. Same frozen
candidate digest as Entry 9; Sol's per-plan SHA256 was `59142b641feda5432bcf7b835d12d38f70f786b901ca73ddf91c2f065f78d7c2`.
The reused Sol absorption worker supplied a supplementary pre-boundary receipt clarification; the required final
paper channel was fresh through the installed companion after the in-session thread limit blocked fresh spawn.

Both fresh channels conditionally accept the freeze/noninterference mechanism. Revision 5 absorbs their exact
bounded clarifications at the cap, without another incremental review round:
- Earlier admissions complete full capture AND receipt semantics; only post-high-water mutations are refused.
  Two-sided body race and admission-position/comparison deletion proofs apply to HTTP and direct no-socket entry.
- 409 is qualified by successful body parsing and attributable finalized run; 413/408 retain precedence, active B
  and unknown/unregistered captures remain unchanged when A finalizes. GET and existing active duplicate 409
  remain unchanged. Refusal preempts route effects; byte-invariance, not status alone, catches fake freezing via
  `state.issued`. These requirements resolve Sol's two P1s and Claude's first two P2s on paper.
- The approval text now covers BOTH unauthorized corroborating capture and the authorized `.requests` boundary.
  An authoritative network-observed authorized body absent from the snapshot must fail the real offline exact
  agreement check, aborting evaluation verification; that existing predicate is not weakened. Add caller deletion
  and actual adjudicator proof. This resolves Claude's additional amendment-scope requirement.
- Explicitly state overlap with the existing network unload blind spot; some traffic can be in neither observed
  surface. Add the missing unregistered debug artifact to Slice 6 parity inputs. Name runOnce/executeStubRun/
  host.closeAll as the production ordering assertion. No private-key unknown-needle scan claim is added.
- Claude's final residual calling the prerequisite still red is stale: Entry 9 records the actual final exit 0.

The exact proposed SCHEMA text is in revision 5 section 5. **SCHEMA is still unchanged.** Locked D3 remains
unchanged; user approval of these measurement declarations is required before applying them and locking the plan.
This concludes the capped three paper rounds; no fourth patch loop is initiated. Implementation-specific proof
remains future work, not something the paper reviews executed. No review jobs remain running.

## Entry 11 — user approval applied; revision 5 locked, 2026-09-05

User: "I approve", in direct response to the exact revision-5 SCHEMA amendment and plan-lock decision.
Owner applied both proposed paragraphs verbatim to SCHEMA: the qualified post-finalization 409 boundary in the
unauthorized-capture limitations, and the authorized `.requests` boundary with the existing fail-closed network
capture-agreement consequence. The text preserves 413/408 precedence, active/unknown-run behavior, corroborating
attribution, and explicit overlap with the existing unobserved unload window. Locked D3 and the offline checker
predicate are unchanged.

Revision 5 is now LOCKED. Updated active plan wording, index and ownership checkpoint; canonical amendment text
lives in SCHEMA rather than a duplicated proposal. Historical findings/dispositions above remain append-only.
No fourth paper round or new behavior was introduced: this applies the exact approval-ready text and activates
the completed three-round paper dispositions. Feature implementation and its live/mutation acceptance remain
separate work; no implementation completion claim, branch switch, commit or merge.

Verification: exact comparison with the previously proposed paragraphs; stale pending/proposal wording sweep in
active plan/state/index; `git diff --check`. Not run: code tests, because this turn changes documentation only.
Prior prerequisite test results remain recorded in Entry 9 and are not represented as new executions.
Deviations From Handoff: none; only the approved SCHEMA statements and plan/state/register activation changed.


## Entry 12 — Job A implementation and first independent review, 2026-09-05

The user assigned the fresh direct Codex session ownership from the closed checkpoint and authorized beginning
Job A of locked revision 5, preserving all uncommitted changes and the implementation/review ladder without
repeating completed planning reviews. Owner created `codex/m5-2-slice-4` in the same checkout with the full dirty
candidate; base/HEAD remains `dc0796fa8616548c6fa61315fed4b2b9bde97620`. No commit, push or merge.
Incoming inventory/diff and all Job A evidence: `/private/tmp/tinyvault-slice4-job-a/`.

Fresh bounded worker `job_a_impl` implemented only Job A's protocol/handshake/bridge/control files and named
tests, adding `container/capabilities.ts` and its tests. Seven established-state operations now use exact closed
schemas and real registry authorization: six independent 32-byte operation capabilities, 60000-ms monotonic
expiry, explicit fixture/run/operation/epoch/instance scope, 32-run bound, synchronous single-use consumption,
finalized lifecycle authorization, same-key reads and bounded canonical chunk/event validation. Exact-end
validation rejects trailing line terminators without changing the valid grammar. The seven trusted callbacks
are the Job B seam; absent pre-B adapters fail closed. Actual shared lifecycle, adapter/runner/scanner wiring
and complete acceptance remain Jobs B-D. Existing signer formats remain Slice 5's responsibility.

Actual worker ordered verification PASS: typecheck; 203 tests in six named files; invocation CLI and selftest
(111 source mutants, 41 isolated guard deletions, both profile deletions, three caller deletions); Compose CLI
and selftest; final diff check. Owner independently ran typecheck, the entire Docker-free `testbed/docker` tree
(**650 tests / 23 files**, exit 0), invocation/Compose CLIs and diff check, all PASS. See `report.md`, raw logs
and `owner-evidence.md`. These paired-stream proofs exercise the real BridgeSession/ControlSession/registry
and trusted callbacks; they do not prove the future shared HTTP lifecycle or live composed acceptance.

Mutation evidence: `mutations.json` and `mutations.md` record 47 independent source edits, **45 reds and two
survivors**, with exact edits, commands, failing assertions and matching original/restored hashes. Owner checked
all restoration pairs and all ten Job A source hashes. The surviving current-instance reference comparison is
structurally redundant in the no-import registry; real restarted-session/new-epoch replay is rejected, but
comparison deletion is not observed. The explicit server offset guard is independently backed by response
validation, which still refuses before success; its isolated deletion is not detected. Neither survivor is
relabeled red or used to claim an independently deletion-protected guard.

Frozen full candidate digest `75bbea76d0f936c98922d4ea075dc906136568dd15f6c7e4ed5d106ee18c476e`:
fresh Astra adversarial worker `job_a_review_r1` returned **PASS**, no actionable P1/P2/P3, in
`astra-round1.md`. The reviewer checked all 294 candidate hashes, all 47 mutation logs and supplied execution
evidence. Owner verified the same full digest after review. This is fresh same-family review, not cross-family
coverage. No source writes occurred during review; this append-only disposition and the PLAN checkpoint follow
that verified freeze. All incoming files except owner PLAN changes remained byte-identical through review.

**Review gate pending:** automatic approval review rejected the attempted Claude Opus 5 QA dispatch before
execution because candidate diff/project guidance/implementation details would be transmitted to the external
Claude service without user approval specific to that transfer. The security invocation also did not run.
Owner did not bypass the rejection; an explicit approval request for both read-only Claude reviews is pending.
Prepared concrete packet: `review-round1.md`; helper command and source remain the accepted prerequisite.
No Claude review result is claimed. Once authorized, freeze an updated full inventory (only owner disposition
changes since Astra review), run fresh QA and separate security, then synthesize under the existing three-round
post-implementation cap. Do not repeat completed prerequisite or paper reviews.

Not run: complete-candidate `make test` and serial `make test-docker`, live composed timing/budget/sink matrix
(Jobs B-D unimplemented); exact-commit clone and merged-tree checks (no commit/merge authorization). No full
Slice 4 or completed Job A review-ladder acceptance is claimed. No workers or CLI reviews remain running.
Deviations From Handoff: source/file scope unchanged; required cross-family reviews remain pending the explicit
external-transfer approval after automatic review rejection. All changes remain uncommitted.


## Entry 13 — explicit Claude approval and standing workflow authorization, 2026-09-05

User: "I approve both Claude reviews. Can we set up the workflow so that my approval is not required for this?
I trust your judgement and I don't want to be a bottleneck". This explicitly authorizes the prepared source/context
transfer to Claude for QA/security and records standing consent for routine restricted TinyVault review dispatch.
The owner documented its precise scope in `docs/handoff-pattern.md` beside the canonical Claude dispatch
procedure; no helper code, model/tool restrictions, managed approval policy or source implementation changed.
This supersedes Entry 12's pending user-consent condition. Runtime approval controls are not bypassed or disabled.
Job A source remains byte-identical to the reviewed inventory; an updated full state/docs inventory will be frozen
for both Claude channels. Review outcomes remain pending and will be appended after actual completion.


## Entry 14 — Claude security PASS, invalid QA dispatch, bounded proof absorption, 2026-09-05

Both approved Claude dispatches ran against full candidate digest
`31d9cf58740eaab199c6e7d8343162b8d0afcd42f4f30110496c34ebfac27a63`; Job A source hashes unchanged from
Entry 12. Owner verified the same full digest after both stopped. Evidence remains under
`/private/tmp/tinyvault-slice4-job-a/`, with separate `claude-qa-round1-approved` and
`claude-security-round1-approved` outputs. Both used the restricted helper and explicit standing authorization.

Separate Claude Opus 5 security **PASS**, completed exit 0, session
`59d2af03-386e-4f82-a52e-a3542ecf1498`; no demonstrated in-scope defect. Actual assistant output was exclusively
Opus 5; auxiliary Haiku usage is retained in summary metadata, not relabeled. The report's snapshot immutability,
shared validation and live-budget notes remain explicit Job B/C/D obligations, not Job A completion claims.

Claude QA **executionStatus failed**, helper exit 1: session `1b18442e-edef-41ea-a67c-6035aaaebb66` attempted
`Bash` for `wc -l docs/m5-2-slice-4-review-findings.md`. The CLI tool result says Bash was disabled and unavailable;
the command did not run. The helper correctly rejected this unexpected tool attempt. Its terminal
NEEDS-ATTENTION text is retained in `claude-qa-round1-invalid-report.md` as diagnostic input only, not a valid QA
gate. No restrictions are relaxed and no failed dispatch is relabeled completed.

Owner confirmed two actionable P3 proof gaps from that diagnostic input: registration-time `#checkScope`
fixture/epoch checks lacked their own raw-wire negatives and isolated mutants; register-response per-token
shape and duplicate checks lacked negative caller tests/deletion evidence. The existing production code has
these checks. **ABSORB** bounded test-only additions and four separately targeted mutants, correcting the
report's overbroad "each scope check" wording. No production or locked-contract change is needed. Fresh worker
fix packet owns only existing `container/control.test.ts`, `bridge.test.ts`, `handshake.test.ts`, and if needed
`container/capabilities.test.ts` for these proofs, with reports/mutants external. Round 2 will use fresh Claude QA
and fresh Astra absorption review after ordered checks; the completed security channel remains applicable to
unchanged production source. No fourth paper/prerequisite review is opened.

Workflow configuration: user standing source/context-transfer authorization is saved in the canonical handoff
procedure. Owner prepared and locally validated an exact-helper/fixed-repository execution allow rule, but
automatic approval review rejected installing it because mutable helper behavior and variable trailing
packet/output arguments exceeded the specifically approved policy scope. The rule was **not installed**;
existing user/managed rules and sandbox settings are untouched. No workaround attempted. Standing consent
removes repeated project consent requests; it does not override managed controls or guarantee every escalation.
No additional approval is required for the already authorized reviews/fix-absorption workflow.


## Entry 15 — Job A round-2 proof additions verified, 2026-09-05

Worker retained changes only in `container/control.test.ts`, `bridge.test.ts` and the registry test-name
correction in `container/capabilities.test.ts`. Owner independently verified that every production source hash
still matches `job-a-inventory.json`. Raw registration negatives now bypass the client and test both foreign
fixture/epoch refusal before RNG minting or fixture registration; a raw positive control observes six real RNG
calls. Fake-peer registration responses test short/noncanonical/duplicate values in each of six token fields
through BridgeSession, refusal before resolution, terminal rejection and a valid distinct-token control.

Four added source mutants are individually RED: each registration scope comparison, response token decoding,
and response distinctness. Every original/restored hash pair matches. Evidence is separately retained in
`round2-report.md`, `round2-mutations.json/md`, `round2-source-inventory.json` and raw logs under the existing
Job A evidence root; the original report/mutation evidence remains unchanged. The report explicitly corrects
round 1's authorization-only scope proof wording. Original two redundant-defense survivors remain declared.

Worker ordered checks PASS: typecheck, 225 tests/6 files, invocation/Compose CLIs, diff check. Owner actual
sequential checks PASS: typecheck; entire Docker-free tree **672 tests/23 files**; invocation/Compose CLIs;
diff check, with per-command exit codes/logs in `owner-round2-verification.json`. No production predicates,
helper tools, gate policy or locked contracts changed. Full make test/test-docker/live/clone stages remain as
previously scoped. Source writer stopped; freeze updated candidate for fresh QA/Astra round-2 review.
Deviations From Handoff: none in the bounded test-proof absorption.


## Entry 16 — Job A accepted after round-2 QA/Astra, 2026-09-05

Frozen full candidate `396f9d1163b63791cd5ea6e08d033ca9d8579b2851c688e5164b964f6d17a72d`, base/HEAD
`dc0796fa8616548c6fa61315fed4b2b9bde97620`, branch `codex/m5-2-slice-4`:
- Fresh Astra `job_a_review_r2` **PASS**, no actionable P1/P2/P3. `astra-round2.md` verifies all 294 candidate
  file hashes/modes/path inventory, the three-test-only delta, and each new mutant's actual named failure.
- Fresh Claude Opus 5 QA **PASS**, completed helper exit 0, session `3dc8f59f-9356-4602-9f7e-7b2e31ebb8ac`,
  `claude-qa-round2/report.md` and `summary.json`. Read/Glob/Grep only; no unexpected tool attempt. Actual
  assistant model exclusively Opus 5; auxiliary usage preserved in summary metadata.
- Separate Claude Opus 5 security **PASS** from Entry 14 remains applicable: all five Job A production files
  are byte-identical; round 2 changed tests only. Both rounds preserve the source/verification claim partition.

Owner read both full reports, confirmed the helper's valid completion, and recomputed the identical full
candidate digest after reviews. The two P3 proof gaps are **CLOSED** by real raw-wire/caller tests and the four
independent reds in Entry 15. The invalid first QA dispatch remains failed; it is not counted as a valid gate.
No review output was overwritten or relabeled, no tool restrictions weakened, and no completed paper reviews
repeated. Production source was unchanged by absorption. No workers/review processes remain running.

Owner disposition: **Job A ACCEPTED within its bounded protocol/capability scope.** Actual latest checks:
`npm run typecheck` exit 0; Docker-free `npx vitest run testbed/docker` 672 tests/23 files exit 0; invocation and
Compose CLIs PASS; diff check PASS. Worker focused 225/6 PASS. Original mutation evidence is 45 red/47 with two
declared redundant-check survivors; four later targeted mutants are all red with restored hashes. These are
separate recorded executions, not a claim of generalized deletion proof or a newly executed combined sweep.

Accepted QA breadth residuals: register-response negatives exercise noncanonical padding, while final-character
pad-bit normalization is tested in the shared decoder rather than repeated on that caller path; the server's
own minted registration-response validator has no forced-invalid producer test, with token shape/distinctness
already enforced by the registry and caller negatives. Both are non-blocking breadth/redundant-defense notes,
not missing load-bearing guards. Existing instance-reference and server-offset survivors remain unchanged.

Next bounded implementation stage is Job B under locked revision 5: actual shared admission/drain/freeze,
non-destructive reads/ack, immutable snapshots and the seven administrative primitive callbacks/observation.
Carry the shared in-process run-id maximum/exact-end validation and equal-length snapshot immutability tests.
Jobs C/D retain persistence, scanner lifecycle, runner ordering and live acceptance. No Job B dispatch is made
by this Job A acceptance. Full make test then serial make test-docker, live registration/transfer and maximum
budget teardown remain complete-candidate gates; exact-commit clone/merged-tree checks need authorized committed
state. No full Slice 4 acceptance, commit, push, merge or release claim.

Standing user authorization for routine restricted Claude source/context review dispatch is recorded in the
canonical handoff procedure. The successful round-2 invocation reused it without another user approval request.
The optional persistent allow rule remains uninstalled after automatic-review rejection (Entry 14); standing
consent does not override managed controls. No additional user action is required for the completed reviews.
Deviations From Handoff: none in final absorption/review. The first invalid QA dispatch and rejected optional
policy installation are recorded explicitly above; required valid review channels are now satisfied.


## Entry 17 — Job B authorized and bounded dispatch, 2026-09-05

User: "Let's proceed then", in response to the concrete Job B shared-lifecycle description. The existing
Codex continuity owner begins Job B on `codex/m5-2-slice-4`, same base/HEAD, preserving the entire incoming
uncommitted candidate. Snapshot/evidence root `/private/tmp/tinyvault-slice4-job-b/`. Job A remains accepted;
locked revision 5 and completed paper/prerequisite reviews remain authoritative.

Job B owns `testbed/fixtures/transport.ts`, `shared/loginFixture.ts`, `lookalike-origin/index.ts`, existing
corresponding fixture tests and new narrowly named shared lifecycle tests, plus `docker/container/fixture.ts`
and its tests. Deliver actual non-destructive reads/ack, handler-entry admission/drain/finalization, immutable
snapshots and bounded storage, shared exact run-id validation and seven underlying administrative primitives.
Preserve approved per-run capture-boundary/noninterference and error precedence; never introduce attribution
verdicts or revive the withdrawn sticky-invalidity marker.

Explicit packet refinement for type compatibility only: `testbed/docker/composedFixtures.ts` may add the two
new required `finalizeRun`/`acknowledgeReceipt` members pointing at its existing fail-closed `unavailable` function.
Making the interface optional or implementing Job C's client/runner prematurely is not authorized. Job C still
owns replacing every placeholder and wiring runner finalization/persistence. Any additional required file or
production behavior outside this packet must be returned for an owner scope disposition before editing.
No worker edits shared state, contract/signature formats, core/supervisor, static gates/configs or topology.
Review real HTTP and no-socket paths, independent race/budget/drain mutants and paired stream->real fixture
operations; browser timing suites remain serial and full-candidate live/clone gates retain their staged scope.

## Entry 18 — Job B test capability scope refinement, 2026-09-05

The restored Job B candidate passed typecheck and 719 fixture/Docker-free tests across 32 files, then the
required invocation gate correctly rejected network imports in its two new dedicated tests. No production
failure or gate bypass is inferred from that refusal. Lifecycle testing uses `node:http` for a real paused-body
HTTP request/handler admission proof and `node:net` for the existing no-socket bind primitive; storage-limit
testing uses `node:net` for that same bind primitive. These tests were named in the Job B packet before dispatch.

Owner disposition under locked section 8: retain the coherent dedicated test files. Refine worker scope to
`scripts/docker-invocation.mjs` ONLY for two exact per-file capability entries:
`testbed/fixtures/shared/loginFixture.lifecycle.test.ts`: `node:http`, `node:net`;
`testbed/fixtures/shared/loginFixture.limits.test.ts`: `node:net`.
Also permit `scripts/docker-invocation.selftest.mjs` ONLY for narrow positive/negative coverage of those entries:
exact paths/capabilities accepted; subprocess imports, extra capabilities and neighboring-path imports refused.
Existing prerequisite edits in both files are preserved; pre-refinement copies are external evidence.
No directory exemption, new executable permission, changed rule, runtime interception change, threshold, root
pin or entry-point change is authorized. Moving tests into unrelated files or hiding network imports behind
re-exports solely to avoid the capability gate was rejected. This explicit scope refinement is included in
Job B's independent implementation reviews; completed prerequisite/paper reviews are not repeated.

Run the full invocation selftest for the changed map and its guards, then rerun the final ordered Job B checks.
Preserve all initial mutant results, including the direct-entry test-proof gap that was strengthened before
review; the final mutant batch is separately identified. No bounded Job B acceptance is claimed yet.

## Entry 19 — Job B round-1 Astra findings and Claude dispatch block, 2026-09-05

Frozen candidate `add79209f0d2d2dd610c02fe52700ad839aeb43198374b8bc74cdb19b626d166`, same branch/base/HEAD.
Worker released source after all five ordered checks passed: typecheck, host 719 tests/32 files, invocation,
Compose and diff gates. Full invocation selftest passed with Entry18's exact additions and inherited deletion
proofs. Owner independently checked all 50 final mutation logs for named failures and restoration hashes
matching current source. Earlier 44/46 batch (two survivors), strengthened direct admission proof, 49-mutant
sweep and initial gate refusal remain preserved. Artifacts: `/private/tmp/tinyvault-slice4-job-b/report.md`,
`verification.json`, `final-refined-mutations/`, `owner-evidence-check.json`, `import-refinement.diff`.
All incoming hashes are unchanged except owner PLAN/register and the exact Entry18 script refinement.

Fresh Astra `job_b_review_r1` returned NEEDS-ATTENTION with two P2s, both accepted for round-2 absorption:
1. `shared/loginFixture.ts:450`: absent attribution becomes the literal `unregistered`, aliases a legal
registered run and differs from write-boundary attribution. Preserve missing attribution as the unknown bucket;
keep explicit registered `runId=unregistered` valid. Add before/after-finalization absent-ID proofs.
2. `shared/loginFixture.ts:363`: close fixes its drain high-water while admission remains open. A later accepted
write can outlive successful close and report storage failure too late. Stop new admission synchronously at
close entry, drain accepted work under the existing bound and prove the two-request race independently.
Report `/private/tmp/tinyvault-slice4-job-b/astra-round1.md`; reviewer recomputed all 296 candidate file modes/hashes
and 50 restoration records. No source edits or tests by reviewer. No other independent reviewer is running.

Claude QA dispatch was rejected by managed automatic approval review before execution. An unchanged retry
with the user's exact standing-authorization wording and verified packet/helper scope was also rejected:
reviewer requires specific Job B source/evidence-to-Anthropic approval and does not accept the recorded general
consent. Neither invocation started or transmitted the review; no Claude verdict exists. No bypass, helper,
managed-policy or permission-rule change was attempted. An asynchronous explicit approval prompt covering
Job B QA, security and resulting fix reviews is pending; unaffected implementation/review work continues.
The standing workflow remains documented in handoff-pattern.md, but cannot override the managed control.

Round-2 repair stays in existing Job B source/test ownership; no new gate/contract scope. Preserve snapshots
and raw reviews outside source. Release freeze only now that the Astra reviewer has stopped; fix and retest,
then freeze a new candidate for fresh independent review. Job B acceptance, C/D integration and all complete-
candidate/live/clone acceptance remain pending. Deviations From Handoff: Entry18's explicit scoped refinement;
Claude gate pending due to the specific managed approval rejection, not a failed code review.

## Entry 20 — Job B round-2 Astra PASS; Claude approval remains pending, 2026-09-05

Round-2 reviewed candidate `81b40a2c634731d6308c6f0631ca607e312d41172054e3fdc2102bcbefde567c`, unchanged
branch/base/HEAD. Both Entry19 P2s repaired in four owned files: shared lifecycle, lookalike wrapper, lifecycle
and limits tests. Missing attribution now retains a separate unknown identity shared by write admission and
capture; explicit registered `unregistered` is preserved. Close stops admission synchronously, drains already
accepted work before marking closed, and applies that ordering to the lookalike wrapper.

Final ordered checks all exit0: typecheck; actual host HTTP fixture/Docker-free subset **726 tests/32 files**;
invocation CLI; Compose CLI; diff check. **14 isolated mutations red/restored**: eight fix proofs and six affected
prior proofs. Owner checked every named-failure log and current source restoration hash; fresh reviewer
independently checked all 296 candidate file hashes/modes, the four-file scope delta and all 14 mutation records.
The original 50-mutant round and unchanged exact-import selftest remain dated evidence, not newly rerun claims.
Report/log inventory `/private/tmp/tinyvault-slice4-job-b/round2/report.md`, `verification.json`, `mutations.json`,
`owner-evidence-check.json`, `preservation.json`. No gate or other incoming source changed in round2.

Fresh Astra `job_b_review_r2`: **PASS**, no actionable P1/P2/P3; both P2s absorbed. Full report:
`/private/tmp/tinyvault-slice4-job-b/astra-round2.md`. Owner read the report and recomputed the unchanged full
candidate digest before recording this disposition. Reviewer ran no tests and did not edit source/shared state.
All workers/reviewers have stopped; all changes remain uncommitted.

**Job B acceptance is still pending the required Claude QA and separate security channels.** Entry19's two
managed approval rejections remain unresolved; the specific Job B source/diff/guidance/contracts/test-evidence
upload to Anthropic approval prompt has no response yet. No upload, successful dispatch or Claude verdict is
claimed. Prepared review packets are external `round2-qa-packet.md` and `round2-security-packet.md`; on explicit
approval, recheck source against the reviewed inventory and refresh the full candidate inventory/digest for
owner disposition-document changes, then run the unchanged restricted helper under normal managed controls.
Do not repeat completed planning reviews or the passed Astra fixes absent a new source change/finding.

No Job C dispatch or full Slice 4 acceptance is authorized by this checkpoint. C/D retain runner/persistence/
scanner and live evidence work. Complete `make test`, `make test-docker`, maximum-budget teardown and authorized
literal clean-clone/merged-tree gates remain pending their stages. Deviations From Handoff: only Entry18's
explicit test-import refinement and the recorded managed Claude dispatch block. No contract or gate weakening.

## Entry 21 — specific Job B Claude upload approval, 2026-09-05

After the owner explicitly requested approval to send Job B source/diff, guidance, contracts and test evidence
to Anthropic for Claude QA, security and resulting fix reviews, the user asked whether approval was needed.
The owner explained the managed rejection and precise transfer scope; the user replied **"I approve"**.
This is the specific post-rejection authorization for both channels and their fix reviews. Prior rejections
remain recorded; no managed policy, rule, helper restriction or destination changes are authorized.

Before dispatch, owner rechecked every file from the Astra round2 inventory: only owner PLAN/register
disposition documents differ; reviewed production and tests are unchanged. Refresh the full candidate digest
and retain a stable source/owner-document checkout while both separate Opus5 read-only reviews run.
No Claude verdict or bounded Job B acceptance is claimed by this approval entry.

## Entry 22 — valid Claude QA/security PASS; final bounded proof absorption, 2026-09-05

Specific Entry21 user consent allowed both normal restricted helper invocations. Both completed exit0, Opus5
assistant events exclusively, only Read/Glob/Grep, stable candidate digest
`69626cf14ad9ca7d3cf35926c82e8088d7f7ec6a7b039e5fe2812c3720bd9a1f`. No permission-rule, managed-policy or
helper restriction change. The helper preserved auxiliary model-usage metadata separately; auxiliary Haiku
bookkeeping is not relabeled as reviewer output. No reviewer executed tests or independently recomputed hashes.
Owner read both full reports and recomputed unchanged digest after both processes stopped.

- QA: **PASS**, no P1/P2; session `1d146290-7558-4fea-8e83-3e31e2e1d524`;
  `/private/tmp/tinyvault-slice4-job-b/claude-qa-approved/{summary.json,report.md,events.jsonl}`.
- Separate security: **PASS**, no P1/P2; session `a2e00851-eec6-420a-a4db-334983a7c384`;
  `/private/tmp/tinyvault-slice4-job-b/claude-security-approved/{summary.json,report.md,events.jsonl}`.
Both verified the two P2 repairs in current source; the Astra round2 PASS covers identical production/tests.
This is independent static review, not certification or full/live Slice4 acceptance.

P3 dispositions:
1. Both channels: legal run `unregistered` still shares a local debug-file path with the unknown bucket.
   **Retain as explicit pre-existing debug/artifact residual.** Registered memory snapshots/capability exports
   are independently separated and proven clean; the runner generates `<scenario>-stub-<index>` IDs. The
   locked limits bound registered retained payload, not the unregistered debug surface. Do not silently rename
   existing artifact paths or prohibit a legal run ID to obscure this residual. It is not a clean on-disk
   separation claim; later artifact/parity work must retain that limitation.
2. QA: unknown-bucket disk/list retention bypasses registered-run budgets. **Re-declare accepted scope limit**:
   plan section5 scopes the bounds to registered payload; M5 register already declares unbounded corroborating
   lists. No new cap/authorization/verdict rule is introduced here.
3. Both channels: lookalike second-listener drain-before-close ordering lacks an independent mutation proof;
   QA additionally notes lookalike-listener late admission and nested L-to-C close behavior unpinned.
   **Absorb in a final test-only round3.** Prove an actual lookalike-listener request already awaiting forwarded
   response bytes completes before listener teardown; independently reorder second-listener closure and require
   a named failure. Pin post-close listener refusal and nested canonical admission after closing (500/error
   rather than a successful render), without treating teardown response status as a verdict or changing code.
   If these tests expose an actual locked behavior conflict, return evidence before any production change.
4. QA: after close starts, a new admission returns run-state before a pre-existing storage control-limit.
   **Retain cosmetic teardown error precedence**: accepted work/close still propagates the sticky control-limit;
   the late rejected caller cannot publish success. No control wire/status contract requires another ordering.
5. Security: administrative register-write/close concurrency is untested. **Retain trusted serial-control limit**;
   no new production concurrency guarantee is claimed. Full C/D/live/private-key/sink/clone stages remain pending.

Final round3 packet owns only existing/newly owned Job B test files; no production, map, gate or root changes.
It adds new mutation evidence and reruns the required ordered checks. Fresh Astra and Claude QA review the
proof additions; the valid separate security PASS remains applicable if all production source stays identical.
Final-round P1 criteria: layers1/2 leak, undeclared layer4/control-boundary blind spot, violated D/F/H/M gate,
or red make test. Round cap cannot override a locked requirement. No completed planning review is repeated.

## Entry 23 — Job B accepted after capped final proof review, 2026-09-05

Final frozen candidate `5ea93435614a1ab227198ceb07d5439b4e94c6b110aaee65dd88c332ff582b06`, branch
`codex/m5-2-slice-4`, base/HEAD `dc0796fa8616548c6fa61315fed4b2b9bde97620`. Only
`testbed/fixtures/shared/loginFixture.lifecycle.test.ts` changed in round3: three deterministic actual-HTTP
listener/forwarding/close tests. All production, gates, configuration and earlier test files match the
security-reviewed source; owner and fresh Astra independently checked modes/hashes across all 296 files.

Final required checks, in order, all exit0: npm run typecheck; host `npx vitest run testbed/fixtures testbed/docker`
**729 tests/32 files PASS**; invocation CLI PASS; Compose CLI PASS; git diff --check PASS. Four isolated mutant
executions each failed a named behavioral assertion and restored the exact current production hashes:
concurrent second-listener closure; shared admission guard deletion separately against late lookalike and
late nested canonical requests; replacing propagated error status with success. These are four executions,
not four distinct defenses. Previous 50-mutant initial and 14-mutant repair rounds stay separately identified;
no broad sweep or unchanged gate selftest is claimed newly rerun. Final evidence:
`/private/tmp/tinyvault-slice4-job-b/round3/{report.md,verification.json,mutations.json,preservation.json,owner-evidence-check.json}`.

Fresh final review results:
- Astra `job_b_review_r3`: **PASS**, no new P1/P2/P3 or locked conflict; exact candidate/test delta and all four
  named-assertion mutation logs checked. `/private/tmp/tinyvault-slice4-job-b/astra-round3.md`.
- Claude Opus5 QA: **PASS**, exit0, session `63d2ebcb-c1e3-41d1-9a54-b2192a0900a7`, same frozen digest;
  `/private/tmp/tinyvault-slice4-job-b/claude-qa-round3/{summary.json,report.md,events.jsonl}`. Read/Glob/Grep only,
  no denied or unavailable tool attempts; user-approved fix-review transfer succeeded without another prompt.
- Separate Claude security **PASS** remains applicable to byte-identical production/gates, with session and
  report in Entry22. Initial valid QA and Astra round2 likewise remain historical review evidence.

Owner read the full final reports and recomputed the unchanged digest after both reviewers stopped. These
static reviewers did not run tests; actual worker execution logs and owner/Astra hash checks are distinguished.
Entry22 item3 is **absorbed**: pre-close forwarded response reaches the client before the second listener is
closed, late real-listener admission refuses, and nested canonical admission after closing returns its actual
500 and settles. No production, signature, authorization, gate or verdict-semantics change was needed.

Final test-evidence limits retained (not new blocking defects or a fourth-round request): the guard-deletion
mutant reaches the status assertion before the no-capture/no-administration assertions, so it does not prove
those later assertions independently. Existing seven-primitive observer proofs remain valid; Job D still owns
the complete hostile-page absence/caller-deletion matrix. A lookalike-listener pre-close POST with delayed
capture append and closeServer's listening/connection-order internals have no dedicated new mutant; shared
canonical accepted-I/O tests and the new real forwarded-response close test prove their stated narrower paths.
The terse suite log has no per-test listing; targeted-host.log separately records the three new tests. Full
browser/Docker topology/timing/maximum-budget and clean-clone evidence is not inferred from these tests.
Entry22's pre-existing debug-file alias, unregistered retention outside registered budgets, teardown error
precedence and trusted serial register/close concurrency limits are unchanged and explicitly retained.

**Bounded Job B ACCEPTED.** Mandatory lifecycle/ack semantics, shared admission/drain/freeze, retained-payload
limits, immutable authorized/unauthorized snapshots and actual seven-operation adapter/observation are accepted
with the evidence and limits above. No approval or review remains pending for Job B. No workers/reviewers remain
running. All incoming uncommitted work is preserved; no commit/push/merge or branch/worktree change occurred.

Next bounded stage is Job C under locked rev5: real composed private-capability client, exact harness capture
persistence, dynamic scanner lifecycle and runner browser-close-before-finalize ordering. The runner's current
missing finalization and the composed placeholders remain expressly C-owned; no Job C dispatch is made here.
Job D and full make test/make test-docker, live registration/transfer/maximum-budget teardown and authorized
literal clean-clone/merged-tree checks remain pending. This is not full Slice4 acceptance.
Deviations From Handoff: Entry18's documented exact test-import refinement; no deviation in final test-only
absorption. Prior managed review rejections are historical and resolved by the specific Entry21 user approval.

## Entry 24 — Job C authorized and bounded dispatch, 2026-09-05

User: "Let's proceed", in response to the completed Job B report and concrete Job C composed-client/capture-
persistence next step. Codex retains continuity on the same branch/base/HEAD. Jobs A/B and completed planning
reviews remain accepted; no uncommitted incoming change may be reset. Incoming full candidate, diff and owner
state snapshots are in `/private/tmp/tinyvault-slice4-job-c/`. No other worker/reviewer is running before dispatch.

Fresh bounded worker `job_c_impl` owns locked C source: `testbed/docker/composedFixtures.ts`, `compose.ts`,
new `captureTransfer.ts`, narrow `secretScan.ts` dynamic registry/retained stderr changes and `exec.ts` closed
harness capture-write errors; `testbed/runnerExecution.ts` and `runner.ts` for finalization/persistence wiring.
Named tests/support: docker `composedFixtures.test.ts`, `compose.test.ts`, `compose.testkit.ts`,
`secretScan.test.ts`, `exec.test.ts`, new `captureTransfer.test.ts`; runner `runner.test.ts`, `runner.wiring.test.ts`,
`runner.testkit.ts`, `runner.inProcess.test.ts`, `runner.eval.test.ts`, `runner.artifacts.test.ts`,
`runner.browser.test.ts`, and new `runnerExecution.test.ts` if needed. New test files receive no implicit network
capability-map exemption. Any other necessary edit requires an explicit owner disposition before source writes.

The agreed behavior is in locked sections3/5/6/7: privately retained per-run capabilities, terminal local/remote
failures through the normal closer; exact bounded chunk transfer and defensive JSONL parsing; safe harness-
chosen 0600 exclusive-temp/rename capture persistence including empty files and all failure cleanup; runner
waits for executeStubRun/host.closeAll before finalize, then receipt/capture-persist/attest and normal verification.
Runner intentionally omits optional ack. Dynamic token registration is synchronous before registerRun resolves,
including patterns/overlap for existing scanners. Retain the full bounded65536-byte exec-stderr window, rescan
with final tokens and fail sticky on overflow; preserve scan-error precedence and perform post-operation inspect.
No private-key export or runtime test option. Job D retains independent token/private-key/live acceptance inventory.

One explicit mutation-only exception: temporarily delete the existing `assertFixtureCaptureAgreement` call in
`testbed/checkers/offline.ts` for the locked production-adjudicator rejection proof, then immediately restore
its exact incoming hash. No lasting checker/predicate edit, signature/schema change or new authority is allowed.
Docker-suite placeholder migration remains Job D's file, so report that stage boundary rather than editing it.
No core/supervisor, agent registry, Dockerfile/topology, package/Make/Vitest, root-pin or static-gate changes.
Worker does not edit PLAN, shared memory or registers. Final ordered narrow checks and independent mutations
precede frozen fresh Astra/ClaudeQA/separate-security review. Browser work remains serial across the machine;
full make test/make test-docker and authorized clean-clone/merge remain complete-candidate stages.


## Entry 25 — Job C implementation complete; independent reviews pending, 2026-09-05

Worker `job_c_impl` released its source lock after implementing the private queued composed capability client,
authenticated key read, synchronous six-token exposure registration, bounded capture transfer/strict JSONL,
safe atomic capture persistence, runner close/finalize/persist/attest ordering, retained-stderr final rescan and
sticky overflow, and post-operation inspect scanning. Fourteen owned source/test files changed; no new gate
or contract refinement. Accepted incoming A/B/prerequisite files are preserved outside exact C ownership;
only owner PLAN/register differ outside that ownership, and no incoming file is missing.

Final ordered checks all exit0: npm run typecheck; host relevant Docker/fixtures/runner Vitest including real
fixture HTTP and serial runner.browser, **897 tests/38 files PASS**, plus one existing opt-in eval skip because
TINYVAULT_EVAL is unset; invocation CLI; Compose CLI; git diff --check. Earlier sandbox loopback EPERM is
recorded separately and superseded for the affected narrow tests by actual host execution. No browser or
Docker test process remains active. Full make test/make test-docker remain the complete C/D candidate stage.

**37 isolated mutant executions red, restored**: 31 initial and six caller refinements. Owner inspected named
failure logs, including six separate token-registration deletions; registry consumer; retained stderr rescan,
overflow stickiness/propagation and live feed; post-operation inspect; capture kind/shape/offset/total; JSONL;
symlink/exclusive-temp/mode/exact-write/cleanup; runner finalize/execute/close awaits and order; persistence
omission/redirection/await/failure/cleanup; actual offline capture-agreement caller deletion; local project cleanup;
client serialization; authenticated key read. The serialization mutant produces a named expected-success
operation rejection; the others include named assertion failures. This is bounded C evidence, not D's independent
response-token inventory, private-key proof, hostile-page matrix or live Acceptance D/F/H/M completion.

Evidence root `/private/tmp/tinyvault-slice4-job-c/`: final ordered logs, mutants/results.json and
mutants/refinement-results.json with exact edits/commands/restoration hashes, preservation.json, worker report
and candidate inventory. Owner freezes a helper-algorithm candidate after this checkpoint for fresh blind
Astra adversarial, Claude QA and separate Claude security review. No verdict or Job C acceptance is claimed yet.
Standing review transfer authorization in handoff-pattern section0 applies; managed runtime controls remain
authoritative. All changes uncommitted. Deviations From Handoff: none; full/live/clone stages still pending.


## Entry 26 — Job C independent reviews; disclosure correction and proof limits, 2026-09-05

All round-1 channels saw unchanged 298-file helper candidate
`ffc1b59f929a774a1f7910cc5858a52a59aba521282d548276c753eef6eaa54c`, base/HEAD unchanged.
Fresh Astra `job_c_review_r1` **PASS**, no actionable findings; independently checked all candidate files,
preservation boundaries and all37 restoration hashes/named failures. Valid fresh Claude Opus5 QA **PASS**,
session `970dfb26-15c4-4832-b330-489b9ab864a0`, output `claude-qa-round1-retry`. Separate Claude Opus5
security **NEEDS-ATTENTION**, session `f073c36f-1161-4759-ad67-0e50c25815a7`, output `claude-security-round1`: no
production security defect, one P2 reporting/stage-boundary finding and three P3 proof limits. Owner read all
reports and recomputed the unchanged full candidate before this documentation-only disposition.

Initial Claude QA output `claude-qa-round1` is **invalid dispatch**, exit1: attempted unavailable Bash to tail a
mutant log. The tool returned disabled/no-such-tool and did not execute. Its final text is retained only as
`invalid-diagnostic-report.md`, never a qualifying PASS. A fresh retry used compact log excerpts and explicit
Read offset/limit instructions; helper validated only allowed tools and Opus5 reviewer events. Both initial
channels and the retry ran normally under standing user transfer authorization without another user prompt.
No helper, sandbox, approval policy or permission-rule change. All reports are below
`/private/tmp/tinyvault-slice4-job-c/`; auxiliary model usage is preserved separately in helper summaries.

**Security P2 absorbed — live Docker gate known incompatible, not merely unrun.** The existing C-only
candidate is **known to fail the old live-suite placeholder assertion when reached**: `composed.docker.test.ts:147`
expects `slice-4` from `takeReceipt('unregistered')`; that code was removed, and the implemented refusal returns
`bridge-protocol` while closing the entire project. The assertion cannot hold and later browser/hostile/surface
checks cannot finish on that closed project. C did not execute `make test-docker`, so no measured red command
exit is claimed; the incompatibility is established from the actual call path and assertion. QA additionally
identified `assertEstablished`'s fixed two-request inventory at lines45/48-49, already assigned by locked §7
to Job D's probe-window-delta migration. **Complete-candidate/live acceptance is blocked until Job D migrates
these assertions and re-verifies the entire remaining test body.** Merely changing the expected error and
continuing on the closed project is insufficient. C's no-touch boundary stands; no inherited gate is waived.

**Security P3 dispositions — explicit bounded proof limits, no C production repair:**
- `composedFixtures.ts:21` runs.clear() and line75 decoded token.fill(0) are implemented but are not independently
  deletion-proven. Trusted-memory cleanup is not advertised as observable erasure; token strings remain GC-managed.
- A malformed registration response is rejected before consumer scanner registration. That branch is terminal
  with project cleanup/no successful eval; complete minted-token exposure observation on rejected responses is
  not established. Accepted valid-response consumption remains synchronous and separately mutant-proven for
  all six tokens. No A protocol validation is weakened to extract fields from rejected frames.

**Valid QA P3 dispositions — retain rather than add redundant defenses or change the locked scope:**
- Client key equality at composedFixtures.ts:80-82 duplicates accepted BridgeSession mismatch rejection. The
  actual key dispatch is mutant-proven; deletion of the redundant client comparison is not.
- Post-operation inspect is fed to inherited command-description scanning and its caller deletion is proven;
  it has no dedicated nonempty positive control in that description pass. No new same-pass inspect-control
  claim is made. Existing logs/export/history/stderr/artifact control passes remain required and unchanged.
- The persistence helper's oversized-input guard is present but lacks its own oversize-buffer test; composed
  production bytes are already bounded by server and bridge. No broader guard-deletion claim.
- In-process runner now imports captureTransfer and hence exec/topology module initialization; no spawn occurs.
  Invocation gate passes. The pending literal clean-clone/in-process path must confirm packaged topology resolution.
- Malformed composed capture tests also trigger accepted bridge guards; transfer-helper guard mutants separately
  prove their own layer. Client run/scanner bounds are inherited from the server's32-run refusal, not a second cap.

**Required Job D carry-forward and unchanged residuals:** the live IntegrationEvidence observer uses the changed
bounded-prefix observeStderr and must consume sticky failure rather than assert only snapshot marker presence;
measure real exec/export stderr headroom, including export overflow, under unchanged65536-byte bounds. C's
composed-client and actual runner caller tests are separate; combined composed-runner evidence, independent
response-token/private-key inventory, hostile seven-operation matrix, probe-window deltas, registration-through-
attestation timing and maximum-budget579-scanner teardown remain pending. Tiny-chunk slowdown from a compromised
fixture is outside process-containment claims, with bounded payload and individual operations. No proof is made
for future longer needle classes; current bootstrap/capabilities share32-byte patterns, with final retained-window
rescan. Inherited mid-teardown artifact control staging, unknown/debug buckets, GC copies, trusted filesystem
assumptions and unload/finalization observation limits are not newly closed by C.

Only PLAN/register change in this absorption; all14 C source/test hashes remain identical to the reviewed,
tested and mutant-restored candidate. Full tests/live/clone stages have not been rerun for documentation.
A focused fresh Claude security absorption review will check the concrete canonical P2 correction and P3
dispositions; Job C final acceptance awaits that result. Deviations From Handoff: initial QA dispatch invalid
and retried; no source/contract/gate deviation or repeated planning review.


## Entry 27 — Job C accepted; complete C/D acceptance remains pending, 2026-09-05

Fresh focused Claude Opus5 security absorption **PASS**, session
`3b39854a-b15f-4018-8303-3bf2afb88488`, output
`/private/tmp/tinyvault-slice4-job-c/claude-security-disclosure`. The reviewer confirmed Entry26/PLAN resolve
the prior P2 disclosure and preserve the no-touch boundary, known incompatible live assertions, complete D
migration and unmeasured live status. P3s remain explicit proof limits; no production repair or stronger claim.
Helper validated allowed tools, actual Opus5 events, completed result and unchanged candidate
`4168e48b09299b1c263811a60ca51ede61dafae39e540a90833663fa6cbfb0ae`; owner read the full report and independently
recomputed that digest before this acceptance-document update. No reviewer or worker remains active.

**Bounded Job C is complete and accepted.** Fresh Astra and valid Claude QA PASS cover unchanged production
and tests; initial security found no production defect, and its P2 disclosure is now independently absorbed.
The invalid initial QA dispatch remains diagnostic only, followed by the valid fresh retry. No completed
planning reviews repeated. Final execution evidence remains **897 host tests/38 files PASS**, one existing
opt-in eval skip, typecheck, invocation/Compose CLIs and diff check; **37 isolated mutant executions red/restored**.
Only owner PLAN/register changed after that evidence. All14 C source/test files and incoming preservation
boundaries remain exact; all work stays uncommitted, with no branch/worktree/commit/push/merge action.

**Next is Job D, not completed Slice4/live acceptance.** The live suite is known incompatible with C's implemented
operations and has not been executed for this candidate. D must migrate the old placeholder and fixed handshake
inventory, re-verify all subsequent fixture-loop/browser/hostile/surface checks, and preserve the locked probe-
window/absence-detection requirements. Its stderr observer must consume sticky failure; export-consumer overflow
and live exec/export headroom need evidence. Independent received-token/private-key inventory, combined composed
runner path, seven-operation hostile matrix, composed TTL/key-read timing and579-scanner maximum-budget teardown
remain pending. Full make test then serial make test-docker belong to that complete candidate. Literal clean-clone
and merged-tree acceptance require the owning authorized committed state; none is claimed now.

All findings/dispositions and accepted proof limits live in Entry26; no broad security certification is implied.
No approval is currently pending. Standing source/context transfer authorization successfully covered initial
QA/security, the invalid-dispatch retry and focused fix review without repeated consent or managed-policy changes.
Deviations From Handoff: invalid initial QA attempt preserved and retried; no lasting source/contract/gate deviation.


## Entry 28 — Job D authorized; bounded evidence implementation dispatch, 2026-09-05

User: "Let's proceed (if there are no concerns on your end)" after Job C acceptance/Job D next-stage report.
No implementation-start concern beyond the explicitly D-owned pending acceptance work. Owner confirmed
unchanged branch/HEAD, no active worker/reviewer and preserved the incoming298-file candidate
`c7274c3efd1028e5e5d92dd36a630a2eaaf95c73bacd90c8b317bc17b32e8718`, full diff and owner-state snapshots in
`/private/tmp/tinyvault-slice4-job-d/`. Jobs A/B/C and completed planning reviews remain accepted. All changes
remain uncommitted; no commit/push/merge/worktree change is authorized.

Fresh Astra worker `job_d_impl` receives sole source ownership of `testbed/docker/composed.docker.test.ts`,
`integrationEvidence.ts`, adjacent new `integrationEvidence.test.ts`; `container/main.test.ts`; new bounded
`slice4.acceptance.test.ts`, `slice4.privateKeys.test.ts`, `slice4.testkit.ts`, `slice4.sourceInventory.test.ts`;
narrow existing `compose.testkit.ts` test support if needed. The existing B shared-fixture observation seam
in `testbed/fixtures/shared/loginFixture.ts` may receive only narrowly required observation plumbing; no
lifecycle/authorization/signature change. Additional filenames require owner refinement before writes.

**Explicit startup-observation refinement:** locked §7 requires underlying administrative counters during
live probe windows; wire request counts alone cannot see a direct primitive call from a page handler. After
inspecting `container/main.ts` and B's `observeFixtureAdministration`, owner additionally authorizes only
narrow `container/main.ts` startup wiring from that existing trusted observer to fixed, secret-free operation
audit records on stderr. Each of seven primitive entries, including rejected/idempotent/discarded calls, must
be observable independently of wire dispatch. Use a closed operation vocabulary, no run ID/token/key/body or
page-derived text, no new HTTP route/wire operation/tool/test mode, and retain normal stdout framing/startup/
shutdown behavior. IntegrationEvidence may compare those records from actual fixture logs across the settled
probe window. This is bounded observability plumbing needed for the existing claim, not a weakened gate.
Its source, actual startup caller and log reader receive private-key sink/mutation/independent review coverage.

No static capability-map/root-pin changes are implied. If a new test requires a restricted Node import, return
the exact import/path and proof obligation for a separate documented refinement; never hide it in a helper
or widen an exemption. No other permanent A/B/C, core/supervisor, agent-tool, signature, SCHEMA, Dockerfile,
Compose/topology, package/Make/Vitest or gate change. Specific temporary deletion/misrouting/plant mutants in
existing production callers are permitted solely for required D/F/H/M proofs, with external exact edits/logs
and immediate hash restoration; no permanent repairs outside ownership without an owner disposition.

Implement every locked §6 private-key sink and seven-operation §7 observation cell; independent successful
register-response token inventory, including six actual minted values, stays separate from runtime scanners.
Fix the known-incompatible placeholder/fixed-frame assertions by real operation success outside settled
probe windows and no wire/underlying-admin deltas inside, never by merely accepting terminal cleanup. Migrate
all remaining fixture-loop/browser/hostile/surface assertions. Preserve Entry26 proof limits until measured;
add sticky-overflow evidence consumption/export tests, combined composed runner coverage, unchanged TTL/key-
read timing and maximum-budget teardown evidence. No live private-key scan claim for unknown container keys.

Worker runs ordered narrow typecheck/tests/invocation/Compose/diff checks and isolated named mutants. Owner
coordinates all browser/Docker work serially, then full make test and make test-docker at the complete candidate
before frozen fresh Astra/Claude QA/separate security reviews. Literal clean-clone/merged-tree checks remain
dependent on explicit committed-state authorization. Raw reports stay outside source; worker never edits PLAN,
register or memory. No completed planning review is repeated.
## Entry 29 — Job D full-suite findings and exact test-scope refinement, 2026-09-05

Job D's worker candidate changed11 owned files and passed typecheck,948 tests/42 files plus one existing
opt-in skip, invocation/Compose CLIs and diff checks.68 meaningful isolated mutant reds/70 executions;
two malformed plants were retained separately and corrected; all originals restored. No live run or review yet.
Evidence: `/private/tmp/tinyvault-slice4-job-d/`. All changes remain uncommitted.

Owner full `make test` attempt1 exited2 before Vitest: `slice4.testkit.ts` imported Vitest from a non-test
module, reaching Vite's unsupported dynamic import. Worker removed that dependency by injecting the test
spy factory from callers. The actual dependency-boundary CLI passed124 modules/116 roots; no gate changed.

Full attempt2 passed entry/typecheck/dependency and its mutants,111 source/41 guard/profile/caller selftests,
Compose58-rule selftest and AcceptanceJ. Main Vitest:1861 passed,3 failed,1 expected pending/1865 total.
Exact logs/report: `owner-make-test-attempt2.log`, `owner-main-attempt2.json`. Timing suites and execution proof
were not reached; live Docker remains unrun. Failures are code/test compatibility findings, not sandbox failures:

- `hostile.browser.test.ts` C5/C6 read captured/unauthorized data after `capturePersistedRuns` has closed the
  fixture. Locked B/C now deliberately reject those reads with `run-state`.
- `checkers/metaGate.test.ts` allows wall-clock upper-bound assertions only in the two Docker-free serial
  timing files. Locked Slice4§9 requires measured composed TTL/export bounds in the existing single Docker
  entry, which is separately excluded from main Vitest and runs serially via `make test-docker`.

**Exact owner scope refinement before repair:** add only `testbed/hostile.browser.test.ts` and
`testbed/checkers/metaGate.test.ts` to Job D's permanent test ownership. In the hostile helper, collect the
same real authorized finalized request/unauthorized snapshots before fixture shutdown, retaining them for
the existing C5/C6 assertions. Preserve actual runner, receipt/offline/browser behavior and assertions; no
production lifecycle reopening, bypass, fake evidence, or fixture-close suppression. Prove the new collection
caller with an isolated deletion and rerun the complete hostile-browser file serially.

The timing guard may add exactly `testbed/docker/composed.docker.test.ts` to its allowed file set, with a
comment/name identifying its existing Docker-only serial entry. This is an explicit narrow policy disposition
reconciling the new locked live measurement with inherited Docker-free timing isolation. Keep both existing
timing files and reject every other file; do not obfuscate timer/matcher syntax to evade the guard. Prove both
removal of this exact exception and a clock/upper-bound plant in an ordinary Docker-free test fail the real
meta-gate caller. No Make/package/Vitest/root pin, entry guard, runtime guard, timeout or threshold changes.

Worker receives the source/browser slot for this bounded repair and ordered checks including these two
files. Owner reruns full `make test`, then serial `make test-docker`, before independent implementation review.
The source freeze/review ladder remains unchanged; no completed planning review is repeated. No user approval
is pending for these authorized scoped implementation/test repairs. Full/live/clean-clone acceptance is pending.
## Entry 30 — Job D implementation and complete-candidate verification; independent review pending, 2026-09-05

Job D implementation now changes13 scoped files (eight existing, five new), including Entry28's fixed
seven-operation startup audit and Entry29's two exact test refinements. Incoming prerequisite/A/B/C work
is preserved. All source is uncommitted, branch/HEAD unchanged. Worker has released source/browser ownership;
owner is freezing the candidate for fresh Astra, Claude QA and separate Claude security review. No completed
planning reviews repeated. This entry is verification evidence, not independent acceptance or merge approval.

**Final ordered owner checks PASS:** `make test` —1864 main tests,5 decoder timing tests,10 serial browser
timing tests; one existing opt-in eval skip. Entry/typecheck/dependency boundary and its production-path
selftests,111 invocation source mutants/41 guard deletions/profile/caller proofs,58-rule Compose selftest,
AcceptanceJ and final execution proof all pass. Then serial `make test-docker` —5/5 tests and Docker execution
proof pass. Final logs/reports: `/private/tmp/tinyvault-slice4-job-d/owner-make-test-final.log`,
`owner-final-main.json`, `owner-final-timing-1.json`, `owner-final-timing-2.json`,
`owner-make-test-docker-final.log`, `owner-final-docker.json`. Entry29's three failures and the earlier helper
dependency defect are resolved; their original red reports remain. No environment failure is counted green.

**Actual live measurements retained:** the JSON reporter omitted console-info output, so the existing
Docker-only test now writes two fixed numeric-only `.vitest` metric files. They reset incomplete and become
complete only after assertions and cleanup succeed. No raw log, frame, identifier, token, key or body is saved.
Owner copies: `owner-final-slice4-probe-metrics.json` and `owner-final-slice4-runner-metrics.json` in the same
external root. Fixed fixture order is benign-login, lookalike-origin, dom-hidden-injection.

- Registration through attestation:16.323/23.267/11.838ms; actual composed runner/browser path:
  151.726/141.604/141.118ms. Each below unchanged60000ms TTL; operations retain5000ms deadlines.
- Full32-run-per-fixture scanner budget:579 needles; actual exports249467904/249469440/249467904 bytes
  in89702.968/89866.822/89820.428ms, below unchanged120000ms per-export bounds. Full teardown270750.645ms;
  this is not a120-second aggregate teardown claim or a maximum-payload/RSS bound.
- Exec stderr26 bytes per fixture,65510 bytes headroom. Export stderr0 bytes,65536 headroom. Sticky overflow
  and secret-exposed precedence remain independently tested. Actual runner has zero normal409 responses,
  exact persisted capture/offline agreement, and no implicit ack.
- Full hostile/browser/stopped/artifact and failure-case bodies execute. No new containers/networks remain.
  Three pre-existing unrelated TinyVault networks are preserved, not claimed as this run's leftovers.

**Mutation evidence:**78 meaningful independent reds across80 executions:68 initial valid Docker-free
proofs,5 Entry29 proofs and5 actual live caller proofs. Two malformed private-key writer plants are excluded
and their separately corrected reds retained. Every mutation restored exact original bytes; no valid survivor.
Live observer deletion, audit-writer deletion, wire-invariant deletion and primitive-invariant deletion each
fail their actual caller positive control. A direct ignored HTTP receipt-primitive bypass leaves wire traffic
unchanged but the final primitive comparison fails: receipt counts27/33/27 versus3/3/3. Every failed live
case leaves metrics incomplete and no new resources. Definitions, complete logs, named failure excerpts,
restoration hashes and cleanup inventories are under `mutants*`, `entry29/`, `live/` and `mutation-excerpts.md`.

**Identity:** all303 candidate entries are unchanged from the released worker candidate. The helper-canonical
tested digest is `809c78827df0a5b09641329e415e68b8f972727763d08ffd8a1371813366974f` before this owner document
update. Worker live snapshots use Python sorted-key JSON serialization; their digest differs for identical
file arrays, modes and bytes. `candidate-digest-normalization.json` explicitly maps both formats; the review
helper's canonical serialization is used for the freeze. `job-d-delta.diff` contains precisely these13 D files,
including new files; accepted incoming file hashes independently match the reconstructed baseline.

**Limits / review scope:** inherited Entries23/26 residuals remain. Private signing material is tested with
a fresh module mock at real HTTP/control/startup/writer paths and synthetic ProjectCloser sink readers;
there is no unknown-private-key live scanning claim or shipping key-provider mode. Source/bundle inventory
is bounded structural evidence, not general information-flow analysis. Deployment/daemon and unload limits
remain unchanged. Full working-tree and live verification now pass; literal clean clone/npm-ci/browser/test
and merged-tree acceptance still require authorized committed state. No commit/push/merge authorization.

Fresh independent reviews are pending. Routine Claude source/context transfer uses the user's standing
authorization in the shared protocol; no new review approval is requested. Deviations From Handoff: none
outside the explicitly recorded Entry28/29 refinements and the scoped numeric telemetry correction above.

## Entry 31 — Job D round1 review synthesis and bounded proof repairs, 2026-09-05

All three fresh reviews completed against frozen303-file candidate
`f927a525cd5972305479d1ce4e6aa60ec9beadf95459cb9e0afa993b4ccf6369`; owner rehashed the complete candidate
and status after both Claude processes exited: identical. Fresh Astra PASS, no actionable findings. Claude QA
and separate security both valid NEEDS-ATTENTION (exit2), actual assistant model only `claude-opus-5`, permitted
Read/Glob/Grep only, no cross-reviewer output reads or source changes. Auxiliary Haiku usage is preserved
separately in metadata, not reviewer output. QA session `647bfe2c-87df-41b0-abc0-11aaff0fc0e0`; security
`8689a302-5fbd-49b0-9429-26b33dd89b20`. Full reports/summaries/events: Job D evidence root
`claude-qa-round1/`, `claude-security-round1/`, `astra-round1.md`. No production leak was identified.
No planning review repeated. Owner releases the freeze for round2 repair; independent acceptance remains pending.

**Absorb QA P2:** private-key stdout/stderr and two HTTP collectors decoded bytes to text before scanning,
leaving raw DER/seed sink proofs incomplete. Preserve exact byte arguments/bodies, retain separate text only
for diagnostic-label assertions, and prove raw binary startup/stdout/stderr and HTTP-error writer plants.
This is a required F observation correction, not an accepted encoding exclusion.

**Absorb shared export-stderr P3:** add actual evidence-reader exposure and overflow inputs, independent
caller/deletion reds for both `checkStoppedSurfaces` branches, retaining exposure precedence. Existing closer
proof and zero-byte live stderr do not prove this second observer. Explicitly distinguish the lack of a
production marker on export stderr from the new planted-byte reader positive controls.

**Absorb bounded proof/maintenance observations:** operationalize startup-observer-before-control ordering;
pin exact adapter return keys structurally; remove the inert machine-specific esbuild output path and unused
closed fixture return field. Add snapshot-consumer blindness proof and make lookalike bypass plants enter
through tracked admitted work rather than relying on dynamic-import timing. Name fixed-port preconditions
and the mocked-key shared-identity test partition. Probe export elapsed time must be positive as well as below
its existing bound. No production key provider, timeout increase, gate expansion or A/B/C behavior change.

**Provenance correction:** earlier mutation campaigns preceded additive expansion of
`integrationEvidence.test.ts` from12 to22 cases and token-equality assertions. They are historical exact-edit
reds, not all executions against the later frozen test bytes. Final source/test candidate passed full checks;
the earlier line-number differences are not evidence of restoration drift. Rerun affected evidence-reader/
parser/window mutants on the repaired candidate and preserve old records, rather than silently relabeling them.

**Assess before acceptance:** both reviewers note the live administrative snapshot has no admitted-work/
daemon-log flush barrier, unlike Docker-free `settleFixtureObservation`. Owner requests a bounded independent
analysis and requires a definitive settled comparison or precise contract disposition before closure. Do not
add a production-only settle operation or waive §7. Candidate source inventory and tar-reader proof-depth
comments are also evaluated in the repair handoff; no blanket acceptance of undeclared required cells.

**Explicit limits carried forward:** `capture` covers both finalized snapshot and in-process debug read;
this still detects either entry for zero-delta absence, but not substitution solely from operation counts.
Content/adapter assertions own that distinction. Deliberate33rd-run refusal terminally fails the fixture,
can produce nonzero shutdown status not independently asserted here, and reaches Entry26's unobserved
rejected-registration token class; no successful-frame inventory claim is extended to those tokens. Export
measurements have about25 percent headroom on this host, not a slower-host guarantee. Lexical scanning is
bounded to its documented source set; actual bundle checks provide a separate boundary. Shared mocked keys
do not prove fixture-key independence. Existing GC, unknown/debug bucket, unload and deployment limits remain.

The released implementation worker may repair within the13 Entry28/29 D files and run exact reversible
mutants in the already authorized production callers, restoring bytes immediately. Owner retains PLAN/register,
all complete-candidate/live verification and review coordination. No concurrent source writer; no new no-touch
file edits. Round2 reviews follow final repair validation; cap remains three implementation rounds.

**Entry31 overflow-claim correction after caller trace:** the reviewers' asserted33rd-run path, repeated
in the preceding provisional limits paragraph, is incorrect for this live probe. Owner and independent
Astra traced `CapabilityRegistry.register`'s32-run check before any RNG/token creation and before
`ControlSession.#operate` calls `operations.registerRun`. Therefore this refusal mints zero extra tokens,
adds zero shared administrative entries, does not call `storageFailure`, and does not establish a nonzero
fixture exit. The failed wire register still occurs. Entry26's general rejected-response observation limit
remains, but this probe does not reach it. Post-window successful budget work adds exactly31 register and
31 authenticated key reads per fixture. Preserve original reviewer reports and this explicit disposition.

**Entry31 settled-observation disposition:** bounded Astra follow-up confirms the live pre-stop snapshot
does not settle admitted server work or establish Docker log retention. Its earlier PASS overlooked this
distinction from accepted unload/untracked-work limits. Repair within D: retain early liveness/window checks,
then compare actual ProjectCloser stopped logs against the original pre-hostile baseline plus exactly31
register/key entries per fixture. Terminal wire ledger permits exactly31 successful register/key pairs per
fixture and one benign-login failed register (`control-limit`), with no other post-window traffic. Failed
register does not advance completed-request high-water. Prove a delayed admitted handler released at actual
shutdown and the new consumer independently, without production settle operations or sleeps. The snapshot
blindness concern also requires controls through the same snapshot reader. Only the historical
`direct-lookalike-key` mutant used dynamic import; correct that specific plant, preserving the other valid
direct lookalike proofs. The follow-up is analysis/disposition, not a replacement independent review gate.

## Entry 32 — Job D round2 repairs and final verification; independent review pending, 2026-09-05

The continuity owner completed the bounded repairs after the implementation worker's cybersecurity screening
error stopped its turn. No mutation process remained; all three completed edits were independently verified
restored before owner takeover. Normal authorized local verification continued; no permission policy changed.
Nine D source/test files changed from round1, within Entries28/29/31. No additional A/B/C runtime change,
no key provider, wire operation, threshold increase or root-policy expansion. No active implementation worker.
Exact fix diff/hashes and reports: `/private/tmp/tinyvault-slice4-job-d/round2/`.

**Absorbed findings:** stdout/stderr writers preserve Buffer/typed-array bytes and string encodings; scans
join each byte stream to retain split-write matches. Direct HTTP bodies use arrayBuffer. Owner mutations
found the first startup repair fetched nonexistent `/login`; it now fetches actual `/`, asserts200 and scans
the raw body. Both raw DER/seed page plants now fail, as do stdout/stderr, HTTP error/rejection and split-write
plants. Startup tests observe real audit attachment before connection-handler registration/listen. The AST
checks exact adapter config and key-provider return properties. The lexical inventory now includes shipped
JS/MJS/CJS sources; a topology.mjs relocation plant fails. Portable inert esbuild output and closed-fixture
field cleanup are complete. This remains bounded structural evidence, not arbitrary alias/taint analysis.

Export-stderr exposure/overflow/precedence now reaches the independent evidence consumer, separately from
the closer's rejection. Tar-error and changed-metafile inputs reach their exact readers. Export stderr has no
production control marker; the new known-byte inputs prove its reader, not a live nonempty control. Snapshot
positive controls use the same primitive/request/response projections as absence checks, and admitted work
settles through the actual testkit caller. Each reader/caller/order/key-boundary deletion is independently red.
The corrected lookalike key plant uses a static import inside tracked work; no incidental import timing claim.

**Settled live proof:** early open-wire/administrative checks remain. After actual stop/drain,
`checkTerminalProbe` compares stopped logs by fixture ID against the original pre-hostile baseline plus exactly
31 register/key entries per fixture. It independently checks31 successful register/key wire pairs per fixture,
then exactly one benign control-limit registration refusal, matching request IDs and completed-request counts.
The final consumer's positive control is an added fixed receipt audit record, restored immediately. A temporary
HTTP handler sends normal404 then waits inside admitted work until actual shutdown releases it; the early
checks pass, but final stopped comparison fails receipt24 versus2. Independently removing the final live
consumer fails its named positive control. Both actual Docker mutants restore exact bytes, leave metrics
incomplete, and leave no new containers/networks. No permanent settle endpoint or timing sleep added.

**Mutation accounting:** round2 has46 distinct cases across59 executions:57 meaningful reds and two initial
raw-page survivors that exposed the nonexistent-route proof defect and were corrected/rerun red. These are
real resolved test defects, not malformed plants. Four historical runner signal-match fields are false because
Vitest reported `Error: promise resolved ... instead of rejecting` instead of `AssertionError`; owner inspected
the exact missing-rejection assertions and preserved raw metadata. All44 latest Docker-free cases match the
final test-file hashes; the two live cases have exact source restoration and full303-file equality. Eleven
affected earlier evidence mutants were rerun; earlier round1 logs remain historical, not relabeled current.
Repeated executions are not unique defenses. `mutation-adjudication.json`, `mutation-excerpts.md` and
`live-mutation-excerpts.md` link exact edits/commands/failures/hashes; original Entries29/30 counts stay distinct.

**Final ordered checks PASS:** typecheck; dependency boundary;992 scoped tests and one expected opt-in skip;
invocation/Compose/default-and-Docker entry gates; diff check. Then owner `make test`:1871 main +5 decoder
timing +10 serial browser timing tests, one expected opt-in skip; all static/selftest and execution gates PASS.
Then serial owner `make test-docker`:5/5 and execution gate PASS. Reports are fresh, with recorded start/end
times and exact commands in `owner-final-verification.json`; full logs and all JSONs are retained. No blocked
or unrun check is counted green. Source/test state after full verification matches all303 entries/status of
tested digest `404b0c41175dbd3b026795dd7e65a4a91bf9afcd0b5ec173126f4b250279d548`, before this owner doc update.

**Final live metrics**, fixed fixture order benign/lookalike/hidden: direct registration-to-attestation
15.347/23.274/11.322ms; actual composed browser runner135.099/130.766/123.493ms, zero normal409s. At579
scanners, exports249467904/249469440/249467904 bytes take89185.762/89341.064/89339.534ms, positive and below
unchanged120000ms each. Teardown269173.207ms is not a120-second aggregate bound. Exec stderr26 bytes each
(65510 headroom); export stderr0 (65536 headroom). Both metric records complete only after assertions/cleanup.
Final independent resource query: zero fixture containers; exactly the three pre-existing networks preserved.
No arbitrary-scale, maximum-payload/RSS or slower-host guarantee; about25 percent export headroom on this host.

**Disposition limits:** Entry31's caller-traced correction rejects the reviewers' erroneous run33 token-mint/
fixture-failure inference. The registry cap precedes minting and shared registration. Accepted Entries23/26
residuals remain separately scoped. Capture audit label covers two in-process primitives; zero-delta sees
either entry, while adapter/content tests own substitution. Fixed-port tests require free topology ports and
serial coordination; shared mocked signers prove absence, not key independence. Startup HTTP binds before
observer attachment but shipping data-plane handlers have no admin caller; the tested ordering is before
control acceptance. Source/bundle tests do not prove arbitrary Dockerfile/define semantic equivalence or
general information flow. Private keys remain known only in module-mocked/synthetic tests, not live unknown
container-key scans. Deployment/daemon, fixture compromise, GC strings and declared unload/debug limits remain.

Owner now freezes for fresh round2 Astra, Claude QA and separate security fix-absorption reviews. No completed
planning reviews repeated; maximum three implementation rounds retained. Full working-tree/live verification
is complete; independent acceptance, literal committed-state clean clone and merged-tree acceptance remain
separate. All changes uncommitted; no commit/push/merge authorization. No routine review approval requested.
Deviations From Handoff: owner finished the interrupted worker's authorized scope; no other scope deviation.

## Entry 33 — Job D round2 dispositions and final capped test repair, 2026-09-05

All round2 reviews completed on frozen303-file digest
`4528ee1af927f70f10f281a06cda22f0259fb11f4bf6015065d3e1303826b056`, unchanged at owner validation. Fresh Astra
PASS; valid Claude security PASS (session d03a5099-49e8-40e0-b822-f3055fef98dd); valid Claude QA
NEEDS-ATTENTION (771169f0-1c08-40c6-ac69-33e22809e2b7), one P3 test-claim gap. Actual assistant models Opus5;
Read/Glob/Grep only, no cross-reviewer output reads, separate auxiliary usage retained. Full reports remain
in `round2/claude-qa-round2/`, `claude-security-round2/` and `astra-round2.md`. No production leak identified.

**QA P3 disposition:** composed `containerConfig` pins `onListenPermissionError:'fail'`, selecting fixed
stderr request-error codes; the alternative in-process `console.error(error)` branch is unreachable here.
The two JSON-serialized empty-console spy surfaces were vacuous and their titles overbroad. Apply QA's
proportionate option(b): remove those unused spies/surfaces, name HTTP-error bodies and code-only container
diagnostics precisely, and explicitly exclude the alternative in-process console writer from this composed
proof. Add an actual containerConfig caller assertion/mutant pinning the option for every fixture/listener.
This does not waive an applicable F sink: actual composed errors remain covered via HTTP bodies, control
error frames and stderr. Error-object JSON loses message/stack; QA's broader Buffer-JSON no-match statement
is not adopted because the scanner also supports decimal-array representations.

**Additional owner/Astra read-only assessment:** write spies retain mutable argument references and copy
only during final collection. A write-then-erase can lose submitted bytes in the test observer. Validate a
focused caller plant, then snapshot each stdout/stderr argument synchronously inside its mock while preserving
encoding/stream order. This concerns test observation, not a demonstrated live delivery/leak; no OS-write
completion claim is inferred. Prove raw/split view writes followed by backing-buffer erasure.

Only `container/main.test.ts` and `slice4.privateKeys.test.ts` receive permanent round3 changes; all runtime,
live Docker tests, evidence observers, fixtures, entry/root gates and locked bounds remain fixed. Owner is sole
writer. Round3 is the existing maximum; no reset or repeated planning review. Final required verification and
fresh fix reviews follow. No routine permission, commit/push/merge or new provider/transport option authorized.

**Other review dispositions:** actual live final-caller proof controls the administrative branch; request/
response/completed branches have independent real-protocol Docker-free proofs. This precise split is accepted,
not every-branch live coverage. Header/URL collectors remain part of the known HTTP boundary without a new
dedicated plant for each subfield. Fixed counts/order fail closed if configuration drifts. Existing Entry32
limits persist. Security's phrase that an unknown-live-private-key scan is a pending cell is not adopted:
locked§6 explicitly forbids runtime private-key export and specifies the module-mocked/synthetic/structural
partition. No unknown-key runtime scanner is required or claimed; the named applicable cells must be proven.

## Entry 34 — Job D final round3 test repair and verification, 2026-09-05

Owner completed Entry33 in exactly two files: container/main.test.ts and slice4.privateKeys.test.ts.
No runtime/helper/live evidence/fixture/root-gate/locked-contract change. Full303-file comparison against
incoming round3 state confirms only those source changes before owner documentation updates.

**Observation repair:** the two focused real-writer plants initially survived: split DER on startup stdout,
and raw seed on actual HTTP-error stderr, each followed by backing-buffer erasure. This confirms a P2 test
observer defect: mock.calls retained mutable views until after erasure. Both spies now snapshot submitted
bytes synchronously through existing writerBytes; per-stream ordering/encoding is retained. This demonstrates
submitted writer bytes, not OS delivery or writable-completion behavior, and establishes no production leak.

**QA P3 absorption:** removed the two unused console.error collectors and narrowed the test/header claims to
actual composed HTTP/control errors and fixed-code stderr. The alternative in-process console.error(Error)
branch is explicitly outside this composed proof. An actual containerConfig factory test checks the option
for all three fixtures, including both lookalike listeners. No new runtime option or fallback is introduced.
Deleting the shared fixed-code binding independently fails all three named configuration assertions.

**Final mutation accounting:**30 cases/30 expected reds, all exact source restoration and current final test
hashes:12 write/view/erasure cases, one configuration-policy deletion,17 repeated raw binary/page/order cases.
The12 cases are startup stdout/stderr × DER/seed × whole/split(8) and HTTP-error stderr × DER/seed × whole/split(4).
Thus13 new distinct cases and17 regression repeats; including the two pre-fix survivors yields32 executions,
30 reds and two subsequently repaired/red observations. No malformed plant or survivor is counted as passing.
All secret writer plants fail secret-exposed, the ordering mutant its installation assertion, and config
mutation its fail-option assertion. Raw diffs/logs/reporter JSON/hash records live in round3/pre-fix and
final-mutants; mutation-excerpts.md indexes exact commands and failure traces. Round2 live/runtime sources
are unchanged, so its two isolated live reds retain applicability; they were not repeated to inflate counts.

Focused green11/11. Ordered narrow verification PASS: typecheck, dependency CLI,995 tests and one expected
opt-in skip, invocation/Compose/default/Docker entry gates, diff check. Full required verification PASS: make test1874+5+10 (1889 total), one expected opt-in skip,
then serial make test-docker5/5, both execution gates PASS. Fresh report timestamps verified; full logs and
JSON reports preserved in owner-final-verification.json. Tested/restored303-file digest
`70ff275711e121d282ee7fa9ff695f39bcb514d51990b8bb576a0b7e51ee5116` matches before/after full verification,
including modes/status. Only subsequent owner PLAN/register updates change the review digest. Evidence root /private/tmp/tinyvault-slice4-job-d/round3/.

Entry33 claim boundaries and Entries23/26/32 residuals remain. Known module-mocked/synthetic/structural private-key
partition is mandatory; runtime private-key export is forbidden and unknown-live-key scanning is not required or claimed. Live final caller
positive control covers administration, with separate real-protocol Docker-free request/response/completed
proofs. Fixed counts/order, header/URL plant granularity, source-analysis, GC/unload/debug and deployment limits
remain explicitly scoped. No source reading or old report is relabeled fresh execution.

Final live metrics complete:true. Direct register-to-attest16.053/22.797/10.470ms; composed browser
146.373/142.737/123.832ms; zero normal409s. At579 scanners, exports249467904/249469440/249467904bytes take
88275.916/88408.225/88090.121ms, positive and below unchanged120000ms each. Teardown266112.086ms is not a
120-second aggregate limit. Execstderr26bytes/headroom65510 each; exportstderr0/headroom65536 each.
No arbitrary-scale/max-payload/RSS guarantee. Final cleanup query: no fixture containers; exactly three
pre-existing networks preserved. Literal committed-state clone and merged-tree acceptance remain later,
unauthorized stages; no unrun check counted green.

Owner freezes for final capped round3 fresh Astra, Claude QA and separate Claude security reviews; no source
writer or test process remains. No planning reviews repeated, no approval pending, all work uncommitted.
Deviations From Handoff: none in round3; earlier owner completion of interrupted worker scope remains Entry32.

## Entry 35 — Job D final Astra PASS and managed Claude transfer block, 2026-09-05

Fresh independent Astra final round3 PASS, no new P1/P2/P3 finding. Full report:
`/private/tmp/tinyvault-slice4-job-d/round3/astra-round3.md`. Reviewer verified all303 hashes/modes/status,
exact two-file diff and baseline/current test hashes,30 intended mutant reds and supplied full ordered
reports. No tests/builds/browser/Docker/mutations or current peer-report reads; no source/shared edits.
Owner read the full report and independently rechecked unchanged frozen digest
`de318a1588e96f05aeb6fff19c8ea52df928d18ba6d74ff0a453bc9b7ce60d1b` before this checkpoint update.
No additional repair or new finding; Entry34 verification and existing explicit limits stand.

The normal final Claude QA helper invocation was rejected before process creation by automatic approval
review. Its reason: this exact repository-source/verification payload to the external Claude service lacked
specific authorization. Owner inspected the packet, helper payload and existing standing source-transfer
consent, then retried the SAME command with that evidence; it was rejected again, specifically requiring
new approval after the concrete transfer notice. No workaround, helper/policy/destination change, transport
substitution or permission bypass. Security dispatch did not start because the initial rejection stopped
the sequence. Neither channel has a round3 process or qualifying report; this is not a reviewer failure,
verdict, additional review round, or proof that source is defective.

User was asked specifically to approve sending the frozen TinyVault source/diff, project guidance, locked
contracts and Job D round3 verification evidence to Anthropic for both final read-only Claude QA/security
reviews. Standing workflow consent remains in handoff-pattern§0; this renewed prompt comes solely from the
managed runtime rejection. Pending that response, no further dispatch. External rejection note:
`round3/managed-review-block.md`. No routine project permission is being added and no gate waived.

No worker/reviewer/test process remains active. Preserve reviewed sources and all uncommitted incoming work.
This checkpoint changes only PLAN/register; refresh the full review inventory for those owner-doc changes
before authorized Claude dispatch, retain the same source hashes and existing final-round cap. Do not repeat
passed Astra/planning reviews or full tests for checkpoint-only changes. Final Job D acceptance remains
pending both Claude channels; literal committed-state clone/merged-tree stages remain separately unauthorized.
Deviations From Handoff: final Claude gates are blocked by managed approval review, not marked complete.

## Entry 36 — specific final Job D Claude transfer approval, 2026-09-05

The user replied **"I approve"** to the concrete notice authorizing transfer of frozen TinyVault source/diff,
project guidance, locked contracts and Job D round3 verification evidence to Anthropic for both final read-only
Claude QA/security reviews. This is the post-rejection approval requested by the managed runtime in Entry35.
Both normal helper invocations then started successfully; no policy, helper, model, destination or login change.
Owner first verified exact equality with the blocked checkpoint and unchanged tested source. Approved frozen
303-file digest `e1f2820f0fb4708751d67dae8a5050288e0709b3f9ed19860490b069fcaaa6c6`; only owner PLAN/register
checkpoint text differs from the final Astra digest. Source/test hashes and full verification are unchanged.
No passed Astra/planning review or code tests repeated for these checkpoint-only changes. Final channel
validation/disposition follows separately; successful dispatch alone is not a passing review.

## Entry 37 — Job D final reviews accepted; bounded implementation complete, 2026-09-05

**Job D ACCEPTED** within locked Slice4 revision5 and Entries28/29/31/33 ownership/refinements. Jobs A/B/C/D
are now implemented and independently accepted in the uncommitted working tree. This is not committed-state
clean-clone, merge, release or unknown-live-private-key scan acceptance.

Both approved normal Claude helper runs completed exit0/PASS on frozen303-file digest
`e1f2820f0fb4708751d67dae8a5050288e0709b3f9ed19860490b069fcaaa6c6`:
- QA Opus5 session `4f578d5b-6984-48a3-b857-a67449f6f6e3`, `round3/claude-qa-round3/report.md`.
- Separate security Opus5 session `bad747ca-653f-451a-b85d-89dd4a531677`, `round3/claude-security-round3/report.md`.
Fresh Astra final PASS is Entry35; its reviewed sources are identical. Owner read both full reports, validated
complete event streams/model/tool/terminal metadata, retained auxiliary Haiku usage separately, checked no
current peer-output reads, and recomputed exact inventory/modes/status equality after both runs. Evidence:
`round3/owner-review-validation.json`. Claude executed no tests or hashes; owner and Astra checks remain
separate evidence. No review or test process remains active. Prior managed rejections are resolved by Entry36,
not bypassed or erased; no additional approval is pending for these reviews.

**Final-round dispositions:** no reviewer identified a new P1/P2 defect or violated locked D/F/H/M gate in
this repair. Both Claude channels PASS; their narrower P3 proof observations are retained under the cap3
rule, without adding a fourth patch round or relabeling an unexecuted assertion as mutation-proven:
1. Both channels: nested lookalike option assertion has no isolated mutant. The shared binding deletion fails
   all three parametrized cases at the primary assertion first. The nested assertion is real and runs in the
   green control, but has source/behavior evidence only, not an independently demonstrated killing mutant.
   Entry34's three assertions means three named cases, not independently isolated assertion sites. The root
   option governs both canonical/lookalike request-error writers; the nested option also pins listener binding.
2. QA: the known-signer three-fixture loop's own stdout/stderr collector instances have no dedicated writer
   plant. Their synchronous-copy pattern is independently proven in the startup and actual HTTP-error tests;
   the loop's raw-rejection mutants prove response-body observation. Retain this instance-specific mutation
   limit; do not claim the loop's writers were individually planted. No new production or sink-class defect
   follows from the identical corrected collector, and the change improves the inherited observer.
3. Security: the configuration test enumerates FIXTURE_IDS without a local arity assertion/deletion mutant.
   Actual three fixture cases are present and executed. The closed topology/gates and coupled consumers remain
   separate protection, not proof of this test's own arity. Retain the drift-test gap; no production fixture
   inventory changed or silently removed in this candidate.
4. Security: no dedicated assertion/positive-control plant for the lookalike exception branch's fixed
   diagnostic vocabulary. The actual config pins the governing root option; the canonical HTTP-error writer
   has real failure/secret plants. Retain the sibling-branch granularity limit, not a claim that the lookalike
   exception was dynamically exercised. Do not broaden this into a new production leak or every-branch proof.
5. The option name couples bind failure behavior and error diagnostic style. This is existing design, not
   authorization to refactor the locked runtime. No new option, fallback, provider or configuration path.

**Claim discipline:** do not adopt security's blanket sentence that a test-only change cannot introduce a
leak-related defect: test/evidence changes can weaken a gate. Acceptance rests on inspected behavior, actual
mutation evidence and unchanged runtime, not file type. Both reviewers' observation that unmocked console
output would route through stderr is static reasoning, not additional dynamic coverage or necessary to close
the explicitly excluded in-process branch. Startup observation is the separate actual-main partition; the
realEvidence collectors start after harness construction. Stdout tripwire remains inert only in the declared
startup test and has separate existing coverage; no OS delivery/backpressure/write-callback claim.

QA notes that separate stdout/stderr scans do not reconstruct a key fragmented across different streams.
Retain this per-surface scope explicitly; no cross-sink reassembly guarantee is added or inferred. It is not
proof against arbitrary encoding/steganography. Existing Entries23/26/32/33/34 limits remain: known module-
mocked/synthetic/structural key partition; no runtime private-key export or unknown-live-key scan; shared
mocked signers do not prove independence; header/URL plant granularity; live final admin control plus separate
Docker-free wire/completion controls; bounded source inventory, fixed counts/order, GC/unload/debug, trusted
filesystem/serial lifecycle and deployment assumptions. No maximum-payload/RSS or slower-host guarantee.

**Final verification remains Entry34:** focused11/11;995 scoped plus one expected opt-in skip and all required
ordered gates; make test1874+5+10=1889 pass/one expected skip; then serial make test-docker5/5 and execution
proof PASS.30 final intended mutation reds/restored,13 new cases+17 regression repeats; two historical pre-fix
survivors repaired/red. Existing exact-source live mutants remain separately recorded. Full source remains
identical to tested digest70ff275711e121d282ee7fa9ff695f39bcb514d51990b8bb576a0b7e51ee5116 after excluding
only owner PLAN/register updates. No source/test checks rerun for this acceptance-document-only change;
owner git diff --check and exact-source comparison follow. No unrun/blocked test counted green.

Next authorized-work boundary: literal candidate git clone + npm ci + make browsers + make test, then
merged-tree checks only after user authorization for committed state/integration. No commit/push/merge or
branch/worktree action occurred. All original dirty/untracked work preserved. Do not repeat completed
planning or accepted Job A/B/C/D reviews on resume absent new source/evidence. Deviations From Handoff:
managed review dispatch delay (Entries35–36) resolved; earlier owner completion of interrupted worker scope
remains Entry32. No unresolved scope or gate deviation in accepted Job D.

## Entry 38 — authorized commit and integration sequence, 2026-09-05

After the owner explicitly listed committing the candidate, the required clean-clone check, merging and
verifying the merged tree, the user replied **"Sounds good- let's proceed"**. This supersedes the earlier
uncommitted/integration-not-authorized checkpoint for those named steps. No remote push or release requested.
Owner revalidated exact accepted303-file candidate digest d42a9ee7afc42164b540dc5bb1098cb1b73e1fe53d686091ac08aa1d96aa7d59,
branch codex/m5-2-slice-4, HEAD dc0796fa8616548c6fa61315fed4b2b9bde97620 and empty index. Read-only origin fetch
confirms main/origin-main remain at that same base. No new source, test, dependency or locked-contract change.
Stage the explicit accepted changed-file inventory, including preserved prerequisite/workflow/contract state,
then commit. Literal git clone + npm ci + make browsers + make test precedes local merge; merged-tree make test
then make test-docker remain serial. Record exact SHAs/reports/results, keeping unrun checks pending. Prior
reviews and final-round limits remain accepted; no repeat planning or implementation review for Git packaging.
