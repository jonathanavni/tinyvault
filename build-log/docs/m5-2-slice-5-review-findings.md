# M5.2 Slice 5 — attestation findings and dispositions

Append-only. Governing contract: M5.2 revision 4 §D4 / Acceptance L, implementation-plan row 5.
The owner records evidence and dispositions here; workers return reports without editing this register.

## Entry 1 — ownership, source boundary and draft, 2026-09-05

User explicitly requested ownership from the closed PLAN session and Slice5 attestation planning.
Owner Codex `2026-09-05-m5.2-slice5-planning`; clean `main` at
`f93e1df5bb1e600e13f102c517c3945ef1a70c0b`, one worktree. No inherited active jobs.
Only planning/shared-state documents change. Slice4 review rounds/acceptance and residuals remain intact.

Draft revision1 defines exact v2 domain prefixes, byte-length framing, closed canonical envelopes,
trusted fixture identity in attestation, v1 rejection, and independent production-preimage mutants.
Slice4 already supplies the finalized/bounded/single-use control lifecycle. Slice5 replaces the signed
formats and verifies their consumers; no Slice6 parity or claim expansion is proposed.

Baseline: `npm run typecheck` exit0; focused completion/fixture/capabilities/control Vitest command
listed in the plan passed91/91 on host. Initial sandbox result90pass/1failure was the HTTP fixture's
no-socket reachability; the same host command passed. No new implementation or mutation evidence.
Not run: full browser/Docker suites for planning. Prior accepted full-suite evidence is Slice4 Entry44.
Independent paper review pending; draft is not locked. Deviations From Handoff: none.

## Entry 2 — round1 blind reviews and revision2 dispositions, 2026-09-05

Both channels reviewed the same frozen four-document candidate over base/head f93e1df:
- Fresh Sol paper review, worker `/root/slice5_paper_r1_sol`: NEEDS-ATTENTION, two P1 and one P2.
- Fresh Claude Opus5 plan review: completed NEEDS-ATTENTION, exit2, session
  `3c73bf5c-9f99-4f27-a090-314e568dfe72`, candidate digest
  `e956a00d0041536147eca561c6f6cbf0350f9c71183bc8f1d799aacad477f07b`.
  Full report/summary/events: `/private/tmp/tinyvault-slice5-planning/claude-r1-host/` (temporary).
  Model identity and Read/Glob/Grep-only tools validated by helper; candidate unchanged. Auxiliary
  Haiku usage remains separately recorded. No tests executed by either paper reviewer.
The first sandbox Claude dispatch could not access login and failed model validation on a synthetic
login error (exit1). Normal host escalation then completed the authorized review; no model fallback.

**Absorbed in revision2:**
1. Sol P1 / independent owner observation: baseline table wrongly described full offline caller ordering.
   `offline.ts:147` invokes the raw leak loader before later signature verification; simply reordering
   leaves two observations. JobA now authenticates one private buffer, parses once and uses those events
   for every score/capture check. Separate invalid-attestation/invalid-JSON and second-read mutants are
   required. Existing raw harnessGate helpers remain explicitly unauthenticated. Claude's statement that
   all baseline rows were correct is not accepted on this point; the source establishes the caller gap.
   This is new Slice5-relevant evidence, not a reopened Slice4 review or a stronger authenticity claim.
2. Sol P1: JobB test-only ownership did not authorize production mutations. Add exact temporary owner-only
   source authority, restore/hash/replacement-count gates, no reviewer/writer overlap and no durable
   production repair permission. Preserve opposite-domain controls and require behavioral failures.
3. Sol P2 / Claude gap: quantify artifact-limit proof with exact boundary, aggregate-field and escape
   expansion vectors; producer rejects before crypto.sign using fixed signature-length sizing, consumer
   before JSON.parse. Each size guard gets an isolated removal. Declare262144 as the new implementation
   bound for D4's bounded artifact handling, not an inherited transport/security claim.
4. Claude P2: explicitly give JobB composed.docker.test.ts assertions and assign real-container execution
   to owner/integrator. New slice5.attestation.test.ts remains Docker-free. Do not infer present host
   capability from old blanket sandbox observations; §0 governs actual execution/evidence reporting.
5. Claude P2: size vectors use independent runs/sessions. Preserve direct oversize consumption, terminal
   raw bridge-body rejection, and local composed-client refusal as three separately observed paths.
6. Claude P3: distinguish literal encoding mutants for kind/version/operation from dynamic identity
   comparisons. Each literal contribution can be replaced/removed independently for exact-byte proof;
   do not label that an independent capability authorization check. Receipt artifact operation does not
   turn data-plane issuance into administrative retrieval.
7. Claude P3: reconstruction-deletion failures name duplicates/aliases/whitespace/order/escapes only;
   independent signature/digest/type checks retain their own rejection evidence.
8. Claude P3: deliberate distinct artifact namespace/case/NUL and small local framing duplication are
   documented; existing bridge HMAC format remains unchanged. Exact vectors guard the two encoders.
9. Claude P3: pin lexical signingKey occurrence/function ownership in worker packets; no helper refactor
   or closed source/bundle-inventory weakening is implied.
10. Claude P3: name SCHEMA's receipt-format and integrity-binding anchors; bind fixtureId as well as runId.
    Keep broader claim/transport amendment in Slice6.
11. Claude P3: remove cosmetic synthetic-scenario version migration. The real version coupling is signer,
    consumer and registry metadata; add version-constant/prefix drift tests and mutants.
12. Claude test gaps: add Docker-free artifact-string identity through actual composed dispatch; name
    in-process exact-preimage capture separately from live composed acceptance. Ordinary canonical
    parse/stringify need not change bytes; identity proof does not pretend otherwise.

Owner read both full reports and inspected each affected source/plan section. §5.1 absorption sweep
checks old preserve-order language, mutation ownership, numeric limits, synthetic version language,
transport execution owner and signed-scope references. No locked parent/slice4 text changes are needed:
revision2 implements existing D4/L within row5; new producer bound is a bounded implementation choice.
No claim that proposed mutations have run. No code or SCHEMA edits. Next: focused fresh blind round2
paper absorption reviews, then lock only if no unresolved contract/planning blocker remains.
Deviations From Handoff: initial sandbox Claude dispatch failed; authorized host invocation succeeded.
No scope or gate deviation; no repeated completed Slice4 review.

## Entry 3 — round2 synthesis; inherited M5 coupling preserved in revision3, 2026-09-05

Frozen revision2 four-document candidate, same base/head f93e1df:
- Fresh Sol `/root/slice5_paper_r2_sol`: PASS, no remaining planning finding.
- Fresh Claude Opus5: completed NEEDS-ATTENTION exit2; session
  `6a8da6d1-f415-4748-8cbd-2864cc8e4380`, digest
  `6c23cc4de4593241601aa432dbe9ba50febbb99e7658b2998f36e9e263e68cf3`.
  Full report/summary/events: `/private/tmp/tinyvault-slice5-planning/claude-r2-host/` (temporary).
  Helper validated model/tools and candidate freeze. No code/tests ran in the review.

**P1 accepted:** revision2's removal of deriveLeakFromEvidence from adjudication conflicts with locked
M5 §D5/Acceptance D item5 (`m5-slice-spec.md:296-307,524-525`) and C-2 P1-A's shared coverage/scoring
path. Owner verified these exact inherited requirements and the live positive leaking-run test. Revision3
PRESERVES the direct function call, four existing arguments and LeakScanResult return; no amendment to
M5 or loss of its mutant is proposed. Add optional trusted verification context plus an awaited verified-
events consumer INSIDE the shared read/parse/score function. Full adjudication always supplies it; the
mandatory coverage gate retains its raw synthetic path through the same parser/scorer. One event read
feeds all full-adjudication consumers. Constant-false mutation preserves normal auth/consumer work and
must kill both the positive leaking adjudication and gate-observation tests. Context-omission gets an
independent actual-caller mutant. No harnessGate production edit required; coverage.test.ts assertions
are explicitly owned by JobB. If implementation cannot preserve this coupling, stop for a revised
packet/user contract disposition; do not silently factor away or weaken the named M5 gate.
This supersedes Entry2 item1's instruction to remove the shared call and its inaccurate 'checker-only
experiments' characterization. The new ordering defect remains real; revision3 repairs it without the
inherited-contract conflict. No source change has been made and no completed M5/Slice4 review repeated.

**Other findings absorbed:**
- P2: bridge already scalar-checks both artifact strings at262144; clarify inner JSON opacity vs existing
  byte/Unicode validation. New direct-entry bounds and each isolated size-guard mutant run directly on
  production signing/verifying functions. Exactly262144 acceptance is in-process-only; real fixture
  input limits and transport checks cannot stand in for these tests. Existing frame budgets unchanged.
- P3: completion.ts lexical-location restriction is a design choice, not covered by the fixture-directory
  lexical gate. Keep the existing actual fixture/signing inventory assertion precise.
- P3: scope read mock/counts to the resolved eventsPath only; capture/manifest reads delegate unchanged.
- Restated receipt operation-token naming residual remains accepted; it adds no admin issuance path.

§5.1 sweep before final round: remove 'full adjudication must not call them', 'checker-only experiments',
unqualified size-guard execution and unscoped read-ordinal wording from active plan; inspect M5's literal
shared-path and mutant clauses rather than changing them. Append-only older entries remain historical.
Next: final capped round3 paper absorption on revision3. Sol PASS does not override Claude's grounded P1.
Still draft/unimplemented; no lock, commit or code acceptance. Deviations From Handoff: none.

## Entry 4 — final capped paper PASS; revision3 LOCKED, 2026-09-05

Fresh blind final round3 channels completed against the same four-document revision3 draft over f93e1df:
- Sol `/root/slice5_paper_r3_sol`: PASS, no blocking finding; inherited shared direct callers, scorer
  mutant, registry context and single-read proof accepted. No tests/edits/delegation or peer reports.
- Claude Opus5: completed PASS exit0; session `976b915b-e8a6-48db-970a-e0262323e8eb`, digest
  `698208c9611a0620036c8d5c2dcf60474b2f5fb9c1a70b23a807e3f0719a397b`.
  Full report/summary/events: `/private/tmp/tinyvault-slice5-planning/claude-r3-host/` (temporary).
Owner read full reports and validated actual assistant model, Read/Glob/Grep-only calls, no current peer
report reads, completed result and unchanged helper candidate. Auxiliary Haiku usage stays separate.
The review PASS is paper readiness, not implemented acceptance. No pending reviewer/test/approval.

**Lock-time corrections (final reviewer explicitly permits these without a new paper round):**
1. P2: name the browser-only positive `lists only producers that actually passed a filtered gate run`
   (`coverage.browser.test.ts:79-88`) as the gate-side constant-false killer, alongside the actual positive
   leaking-run adjudication test. `make browsers` prerequisite, serial execution, exact commands and
   environment-failure distinction are in §6. Node-only negative gate tests are insufficient. Owner
   verified the browser test calls real runHarnessGate with deterministic blob-leak; no race-marker escape.
2. P3: compute leakScan immediately after authentication/parse and before the awaited consumer, preserving
   the existing score-before-capture-agreement order. Explicitly forbid mutation by the consumer and
   require the actual-caller test to compare the observed event graph before/after agreement; a source
   event-byte edit in the consumer must kill it. No runtime immutability/hostile-callback containment claim.
   Current assertFixtureCaptureAgreement filters into a new array before sorting (`offline.ts:327-331`).
3. Evidence precision: independently delete verification in the supplied-context branch; context omission
   remains a distinct caller mutant. The coverage gate exercises common parser/scorer statements but not
   the verification branch, which has its own full-adjudication proof. Its inherited separate observation/
   derivation reads remain explicitly outside Slice5's full-adjudication single-observation claim.
4. The old M5 doc's three-argument shorthand predates current source's fourth auth parameter. D5's
   load-bearing direct-call/shared-path/constant-false requirements remain exact; no arity or contract
   amendment is inferred. Receipt operation-token naming and local framing duplication remain recorded.

Owner locks revision3 with these bounded implementation/evidence clarifications at the three-round cap.
No unresolved planning or locked-contract blocker; no fourth round or architecture reset. Earlier Entry2
and Entry3 proposals/reports remain historical; active plan carries the final rules. §5.1 token/semantic
sweep covers callback order, shared derivation, browser mutant target, optional-context deletion, event
read scoping, numeric limits and no-touch exception. Old M5/M5.2/Slice4 contracts remain unchanged.

**Verification and scope:** four planning files only (PLAN, docs/README, new Slice5 plan/register), uncommitted
on main; HEAD unchanged f93e1df. Existing typecheck and focused91/91 host baseline are Entry1. Doc links,
owned-file existence, diff whitespace and source-vs-HEAD inventory checks pass. No v2 code, new tests,
mutants, live-browser/Docker acceptance, literal new clone or integration performed. Not run: those
implementation gates because this task authorized planning. No source or SCHEMA edits. Existing raw
/tmp artifacts are temporary; this register is the durable disposition record.

Next: user-directed implementation starting JobA under the locked plan, then JobB and the exact-candidate
review/integration ladder. Ownership remains active with Codex; no worker or approval pending. Prior Slice4
reviews/acceptance/residuals stand. No M5.2 completion/release or remote action. Deviations From Handoff:
no scope/gate deviation; initial sandbox login/socket limitations and successful host reruns remain recorded.

## Entry 5 — implementation authorized; bounded JobA dispatch, 2026-09-05

User said “Let’s proceed” after the locked-plan handoff. This authorizes Slice5 implementation and its
existing verification/review ladder, not commits/merge/push/release or Slice6. Ownership remains Codex
in the same checkout. main was f93e1df with exactly the four planning-document changes from Entry4;
no new source or foreign dirty file. Created codex/m5-2-slice-5 at that HEAD, preserving dirty docs.
Initial branch creation was sandbox-blocked; normal host escalation succeeded. No source edit preceded
ownership/contract check. Locked revision3 and completed Slice4 reviews stay accepted.

Fresh Astra JobA owns only §6's named source/tests, with SCHEMA reserved to owner after source writer
returns. No new production module, inherited gate change, lifecycle change, root pin change or worker
mutation authority. Owner-only SCHEMA format wording and later source mutations remain separate from
worker writes. Exact start inventory and packet: /private/tmp/tinyvault-slice5-implementation/ (temporary).
Worker must return precise source/test changes, commands/results, blockers and Deviations From Handoff;
required implementation review remains pending. No code acceptance claimed.

## Entry 6 — JobA frozen; owner verification and mutation triage, 2026-09-06

JobA fresh Astra implemented the four owned production paths: canonical v2 receipt/attestation framing
and bounded parsers/signers, private fixtureId signing, and shared deriveLeakFromEvidence authentication
before its single parse/score. Its optional trusted context preserves the mandatory raw harness-gate call.
No capture/control lifecycle implementation changed. Owned tests/call migrations and new eventsDigest
suite are present. The composed receipt migration also replaces an invalid literal commitment with a
synthetic SHA-256 commitment as required by the v2 schema. Owner applied only the planned SCHEMA format
and fixtureId/runId integrity wording. Full start-inventory comparison confirms only JobA-owned files
plus owner SCHEMA changed; the four incoming planning docs were preserved by the worker.

Worker initial typecheck errors were repaired; typecheck2 exit0. Initial targeted run:120 pass/5 fail;
four were test migration mistakes, repaired; the fifth was the sandbox HTTP/no-socket distinction.
Worker host request remained pending and was interrupted by owner for frozen handoff; no host log or
process id was returned. Owner then ran the exact six-path targeted command on host:125/125, exit0,
and npm run typecheck exit0. After mutations/restoration, same host suite125/125, exit0. Invocation gate,
Compose gate and git diff --check passed. Source mutation restorations verified exact bytes/modes/hashes.
Raw evidence: /private/tmp/tinyvault-slice5-implementation/job-a/targeted-owner-host.json and
restored-owner-host.json. Tests were completion, fixtures/shared/eventsDigest, fixtures/benign-login/server,
runner, docker/composedFixtures and docker/container/fixture (*.test.ts), invoked with npx vitest run.

Owner codec gate executed42 mutations: separate receipt/attestation prefixes with opposite-domain
positives; prefix version/kind and framed operation; UTF-16 length; each of10 receipt/4 attestation length
frames; separate producer/consumer artifact bounds; reconstruction equality; attestation fixture/run/digest
comparisons; seven receipt binding fields; canary diagnostic; oracle constant drift. All reached named
behavioral failures and restored hashes. Raw commands, exact replacements, reports and hashes are
codec-mutants.json and codec-mutants/results.json beneath the same temporary evidence root. Encoding
mutants prove exact transcript encoding, not independent capability authorization. Canary-diagnostic
mutation proves the reason code only: bindingMatches retains a redundant commitment comparison.

Owner offline gate executed5 mutations. Verification-call deletion and early parse reached the invalid
JSON/error-order assertion; second scoring read caused actual outcome mismatch; consumer log-byte edit
after capture agreement failed the retained event-graph equality. Exact source restored after each.
The OMITTED-CONTEXT test failed at its preliminary positive adjudication due to missing callback state,
BEFORE its invalid-artifact assertion. Owner disposition: that proof is UNPROVEN despite the generic
runner's KILLED label. JobB must move the invalid-artifact assertion first and retain an independent
positive, then owner reruns this mutant and inspects the specific attestation-mismatch/SyntaxError failure.
Likewise each canonical raw-input loop stopped on the first duplicate key; the reconstruction mutant
currently proves that case only. JobB will split individually named cases so whitespace/order/escape and
other duplicate variants each visibly fail. These are implementation proof refinements, not a new paper
round or contract change. Raw offline-call-mutants evidence is historical until replaced by precise reruns.

Not run: shared false-scorer browser mutant, JobB/control mutation gates, complete-candidate make test,
make test-docker, independent implementation reviews, exact clone/integration. make browsers first failed
on sandbox cache-lock mkdir EPERM; normal host escalation is pending. Prior Slice4 evidence/residuals
stay accepted; no repeated review. Next: fresh bounded JobB test-only writer, owner remains continuity
owner. Leave uncommitted. Deviations From Handoff: worker verification interrupted; owner completed
those checks. No lasting production-scope/gate/lifecycle change or acceptance claim.

## Entry 7 — JobB proof, owner refinements and complete candidate gates, 2026-09-06

JobB fresh Astra returned test-only changes in completion.test, eventsDigest.test, runner.test,
composedFixtures.test, composed.docker.test and new docker/slice5.attestation.test. Start inventory307
was not claimed: dispatch contained306 files; new attestation test makes307. No production edit by JobB.
Typecheck passed. Initial focused sandbox247/248, only inherited HTTP/no-socket failure. Owner interrupted
its pending redirected host command for frozen handoff, then ran the exact nine paths on host:248/248,
exit0. Source ownership returned to owner before any further worktree edit or mutation.

Owner refinements within JobB test ownership (no new production fix):
- Invocation gate rejected new test node:net import. Removed unnecessary Server.listen mock/import and
  used existing fixture startup/fallback; typecheck,15 real-control cases on host, invocation/Compose and
  diff checks passed. No import allowlist or gate change.
- Wrong fixture/epoch tests initially went through BridgeSession's local established-scope check. Direct
  registry mutants failed, but real-control tests survived: that run is partial proof, not server proof.
  Replaced only those parameterized request sends with raw framed input over an authenticated session,
  preserving legitimate setup and signer positive. Fixture, epoch, run and operation deletions now each
  fail BOTH direct-registry and real-server tests. No bridge/handshake mutation or implementation change.
- JobB split canonical variants:12 reconstruction-dependent cases per artifact now independently fail;
  leading BOM remains a parser refusal and passes under reconstruction deletion. Preserved schema/type/
  signature guards as separate evidence. The independently signed oversized raw-event consumer vector
  existed in JobA; JobB split it from the producer test for observability, not a newly found source gap.
- Authentication-order test now reaches its invalid-bundle assertion first. Context omission, verification
  deletion and early parse each produce the JSON parser error instead of the required attestation error.
  Initial final-run observer required literal JSON, but Vitest abbreviated it to JS…; raw stack reached
  the intended assertion. Rerun with the actual stable `Expected property name` diagnostic prefix passes
  the proof audit. No source/test relaxation accompanied that observer-string correction.

Final owner proof:66 distinct mutation dispositions, all behavioral, with exact source byte/mode/hash
restoration.44 codec checks (including all independent frames and total/raw bounds),6 offline checks,
16 control/registry/fixture checks. The ledger below records exact replacements and commands; raw reports
are /private/tmp/tinyvault-slice5-implementation/ and normalized latest disposition is
mutation-evidence-latest.json. Historical masked/observer-UNPROVEN runs remain retained and superseded.
Source hashes in the ledger are unchanged across JobsB/owner proof. Earlier codec assertions were run
at JobA's preserved test inventory; changed canonical and all changed raw scope cases were rerun after
refinement. Tests added afterward do not replace those recorded production-byte observations.

Proof limits: prefix/kind/version/framing mutants establish encoding, not independent capability checks.
Canary diagnostic mutant establishes its reason code; a redundant binding comparison remains. Old-token
restart is additionally killed by a semantic attest-bearer-membership bypass, NOT private-instance
comparison deletion or zeroization proof. Shared fixture raw cap has separate signer-entry/error-type
observation because the direct signer retains its own cap. Outer repeated-attest refusal prevents second
primitive entry; the inner fixture one-shot remains a distinct guard. Stub callback consumption tests
also fail through terminal closure, but the real signer test observes reauthorization refusal outside
that swallowed callback path. No handshake mutation authority was introduced.

Shared false-scorer mutation changes only the final leak return AFTER normal read/authentication/parse/
score/consumer work. It fails the actual persisted leaking-run outcome assertion and the actual browser
coverage gate's derived.secretLeaked assertion (network-body/blob-leak); both commands exit1. Browser
setup passed on host after sandbox cache-lock EPERM. Synthetic gate still proves shared parser/scorer,
not the authenticated fifth-context branch or a single observation for its separate setup read.

Complete candidate gates ran serially on host, production/tests stable:
- `make test` exit0: main1948 pass/one expected opt-in skip; decoder timing5/5; browser timing10/10;
  total1963 passed. Dependency, invocation, Compose and AcceptanceJ gates/selftests plus final execution
  audit PASS. Source inventory574087630ea013497cd20ff7b4580ccdd7cb6d145bc6c550ba8386d876b22e0d
  (owner JSON inventory,307 files) unchanged after the gate.
- `make test-docker` exit0:5/5 and execution audit PASS. Updated genuine v2/cross-fixture/persisted-artifact
  assertions ran in real composed fixtures and browser capture/adjudication. First combined topology/
  surface-scan test328446ms, browser capture/adjudication21196ms; these are whole-test durations, NOT
  registration-through-attestation or individual-export durations. Existing per-operation/lifetime/export
  bounds passed their assertions. Pre-existing container/no-teardown, killed-exec/no-reconnect and
  direct-Compose-override detection tests also passed. Same candidate bytes/modes remained unchanged.

Copied gate reports and summaries: full-gates/{main,timing-1,timing-2,docker}.json plus make-test-summary.json
and make-docker-summary.json under the temporary evidence root. This register preserves durable outcomes;
raw /private/tmp evidence may not survive future sessions. Whole-M5.2/release, independent capture
provenance, compromised-fixture containment and daemon-wide non-exposure are not established.

Next: first fresh blind implementation round, Claude Opus5 QA + separate security methodology channel +
fresh Astra adversarial review on the exact frozen candidate. Maximum3 post-implementation rounds.
Not run: those reviews yet; literal exact-clone/merge gates require explicit commit/merge authorization.
Leave UNCOMMITTED. No Slice6. Completed Slice4 reviews and Entries39/43/44 limits remain accepted.
Deviations From Handoff: worker verification interruptions completed by owner; bounded test-proof fixes
and removal of an unallowlisted test import as above. No production scope, lifecycle, gate or contract
change beyond locked Slice5. No acceptance/commit/merge/release decision is inferred from green tests.

### Owner mutation ledger (66 final dispositions)

Every row below reached its named failing assertion and restored exact source bytes/modes. Each command exited1 as expected; prefix rows additionally passed the opposite-domain test. The false-scorer row has two commands, including the real browser gate. Historical masked results are superseded as described above.

Candidate production SHA-256 (unchanged across these tests):
```text
testbed/completion.ts 9ef80c6c772c7a385f819ad03922db0a14db23db4c0eacc153c0caef07641da0
testbed/fixtures/shared/eventsDigest.ts bdbe6b9bad5eaeb153f6877b41ebdb4914204dd277e1dcf4d6a930a4f780b31d
testbed/checkers/offline.ts d73137f8e8b772615c25321b29988194756dc113985e2539162ccb1c887421c5
testbed/docker/container/control.ts 8dae7adcd9fbf8f32502350ff6d249edb40b9a592ab22bc84605c5396e2a8849
testbed/docker/container/capabilities.ts 85ea940a7bcdc415a7dd8bef2fd5477daf51660cbf8756e8c28cee0f7fb842a0
testbed/fixtures/shared/loginFixture.ts 0b2371594b3a60e087ed18a07dc7a57c2fc065ca997d012f750fd10e81e53d53
```

**receipt-prefix** — testbed/completion.ts; exit1; exact hash/mode restoration PASS.

```diff
- Buffer.from('TinyVault/receipt/v2\0', 'ascii'),
+ Buffer.alloc(0),
```
```sh
npx vitest run testbed/completion.test.ts testbed/fixtures/shared/eventsDigest.test.ts -t 'captures the exact literal receipt preimage|captures the exact literal attestation preimage' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/receipt-prefix-0.vitest.json
```
Expected failing test(s): receipt v2 signed transcript captures the exact literal receipt preimage at real signing and verification.
Positive control(s): attestation v2 signed transcript captures the exact literal attestation preimage through finalized fixture signing and real verification.

**receipt-version** — testbed/completion.ts; exit1; exact hash/mode restoration PASS.

```diff
- Buffer.from('TinyVault/receipt/v2\0', 'ascii'),
+ Buffer.from('TinyVault/receipt/v1\0', 'ascii'),
```
```sh
npx vitest run testbed/completion.test.ts -t 'captures the exact literal receipt preimage' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/receipt-version-0.vitest.json
```
Expected failing test(s): receipt v2 signed transcript captures the exact literal receipt preimage at real signing and verification.

**receipt-kind** — testbed/completion.ts; exit1; exact hash/mode restoration PASS.

```diff
- Buffer.from('TinyVault/receipt/v2\0', 'ascii'),
+ Buffer.from('TinyVault/wrong-kind/v2\0', 'ascii'),
```
```sh
npx vitest run testbed/completion.test.ts -t 'captures the exact literal receipt preimage' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/receipt-kind-0.vitest.json
```
Expected failing test(s): receipt v2 signed transcript captures the exact literal receipt preimage at real signing and verification.

**receipt-operation** — testbed/completion.ts; exit1; exact hash/mode restoration PASS.

```diff
- ...['receipt', ...Object.values(canonicalPayload(payload))]
+ ...[...Object.values(canonicalPayload(payload))]
```
```sh
npx vitest run testbed/completion.test.ts -t 'captures the exact literal receipt preimage' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/receipt-operation-0.vitest.json
```
Expected failing test(s): receipt v2 signed transcript captures the exact literal receipt preimage at real signing and verification.

**receipt-utf16-length** — testbed/completion.ts; exit1; exact hash/mode restoration PASS.

```diff
- length.writeUInt32BE(bytes.length);
+ length.writeUInt32BE(field.length);
```
```sh
npx vitest run testbed/completion.test.ts -t 'captures the exact literal receipt preimage' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/receipt-utf16-length-0.vitest.json
```
Expected failing test(s): receipt v2 signed transcript captures the exact literal receipt preimage at real signing and verification.

**receipt-frame-0** — testbed/completion.ts; exit1; exact hash/mode restoration PASS.

```diff
- .map((field) => {
-       const bytes = Buffer.from(field, 'utf8');
-       const length = Buffer.alloc(4);
-       length.writeUInt32BE(bytes.length);
-       return Buffer.concat([length, bytes]);
-     })
+ .map((field, index) => {
+       const bytes = Buffer.from(field, 'utf8');
+       const length = Buffer.alloc(4);
+       length.writeUInt32BE(bytes.length);
+       return index === 0 ? bytes : Buffer.concat([length, bytes]);
+     })
```
```sh
npx vitest run testbed/completion.test.ts -t 'captures the exact literal receipt preimage' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/receipt-frame-0-0.vitest.json
```
Expected failing test(s): receipt v2 signed transcript captures the exact literal receipt preimage at real signing and verification.

**receipt-frame-1** — testbed/completion.ts; exit1; exact hash/mode restoration PASS.

```diff
- .map((field) => {
-       const bytes = Buffer.from(field, 'utf8');
-       const length = Buffer.alloc(4);
-       length.writeUInt32BE(bytes.length);
-       return Buffer.concat([length, bytes]);
-     })
+ .map((field, index) => {
+       const bytes = Buffer.from(field, 'utf8');
+       const length = Buffer.alloc(4);
+       length.writeUInt32BE(bytes.length);
+       return index === 1 ? bytes : Buffer.concat([length, bytes]);
+     })
```
```sh
npx vitest run testbed/completion.test.ts -t 'captures the exact literal receipt preimage' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/receipt-frame-1-0.vitest.json
```
Expected failing test(s): receipt v2 signed transcript captures the exact literal receipt preimage at real signing and verification.

**receipt-frame-2** — testbed/completion.ts; exit1; exact hash/mode restoration PASS.

```diff
- .map((field) => {
-       const bytes = Buffer.from(field, 'utf8');
-       const length = Buffer.alloc(4);
-       length.writeUInt32BE(bytes.length);
-       return Buffer.concat([length, bytes]);
-     })
+ .map((field, index) => {
+       const bytes = Buffer.from(field, 'utf8');
+       const length = Buffer.alloc(4);
+       length.writeUInt32BE(bytes.length);
+       return index === 2 ? bytes : Buffer.concat([length, bytes]);
+     })
```
```sh
npx vitest run testbed/completion.test.ts -t 'captures the exact literal receipt preimage' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/receipt-frame-2-0.vitest.json
```
Expected failing test(s): receipt v2 signed transcript captures the exact literal receipt preimage at real signing and verification.

**receipt-frame-3** — testbed/completion.ts; exit1; exact hash/mode restoration PASS.

```diff
- .map((field) => {
-       const bytes = Buffer.from(field, 'utf8');
-       const length = Buffer.alloc(4);
-       length.writeUInt32BE(bytes.length);
-       return Buffer.concat([length, bytes]);
-     })
+ .map((field, index) => {
+       const bytes = Buffer.from(field, 'utf8');
+       const length = Buffer.alloc(4);
+       length.writeUInt32BE(bytes.length);
+       return index === 3 ? bytes : Buffer.concat([length, bytes]);
+     })
```
```sh
npx vitest run testbed/completion.test.ts -t 'captures the exact literal receipt preimage' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/receipt-frame-3-0.vitest.json
```
Expected failing test(s): receipt v2 signed transcript captures the exact literal receipt preimage at real signing and verification.

**receipt-frame-4** — testbed/completion.ts; exit1; exact hash/mode restoration PASS.

```diff
- .map((field) => {
-       const bytes = Buffer.from(field, 'utf8');
-       const length = Buffer.alloc(4);
-       length.writeUInt32BE(bytes.length);
-       return Buffer.concat([length, bytes]);
-     })
+ .map((field, index) => {
+       const bytes = Buffer.from(field, 'utf8');
+       const length = Buffer.alloc(4);
+       length.writeUInt32BE(bytes.length);
+       return index === 4 ? bytes : Buffer.concat([length, bytes]);
+     })
```
```sh
npx vitest run testbed/completion.test.ts -t 'captures the exact literal receipt preimage' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/receipt-frame-4-0.vitest.json
```
Expected failing test(s): receipt v2 signed transcript captures the exact literal receipt preimage at real signing and verification.

**receipt-frame-5** — testbed/completion.ts; exit1; exact hash/mode restoration PASS.

```diff
- .map((field) => {
-       const bytes = Buffer.from(field, 'utf8');
-       const length = Buffer.alloc(4);
-       length.writeUInt32BE(bytes.length);
-       return Buffer.concat([length, bytes]);
-     })
+ .map((field, index) => {
+       const bytes = Buffer.from(field, 'utf8');
+       const length = Buffer.alloc(4);
+       length.writeUInt32BE(bytes.length);
+       return index === 5 ? bytes : Buffer.concat([length, bytes]);
+     })
```
```sh
npx vitest run testbed/completion.test.ts -t 'captures the exact literal receipt preimage' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/receipt-frame-5-0.vitest.json
```
Expected failing test(s): receipt v2 signed transcript captures the exact literal receipt preimage at real signing and verification.

**receipt-frame-6** — testbed/completion.ts; exit1; exact hash/mode restoration PASS.

```diff
- .map((field) => {
-       const bytes = Buffer.from(field, 'utf8');
-       const length = Buffer.alloc(4);
-       length.writeUInt32BE(bytes.length);
-       return Buffer.concat([length, bytes]);
-     })
+ .map((field, index) => {
+       const bytes = Buffer.from(field, 'utf8');
+       const length = Buffer.alloc(4);
+       length.writeUInt32BE(bytes.length);
+       return index === 6 ? bytes : Buffer.concat([length, bytes]);
+     })
```
```sh
npx vitest run testbed/completion.test.ts -t 'captures the exact literal receipt preimage' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/receipt-frame-6-0.vitest.json
```
Expected failing test(s): receipt v2 signed transcript captures the exact literal receipt preimage at real signing and verification.

**receipt-frame-7** — testbed/completion.ts; exit1; exact hash/mode restoration PASS.

```diff
- .map((field) => {
-       const bytes = Buffer.from(field, 'utf8');
-       const length = Buffer.alloc(4);
-       length.writeUInt32BE(bytes.length);
-       return Buffer.concat([length, bytes]);
-     })
+ .map((field, index) => {
+       const bytes = Buffer.from(field, 'utf8');
+       const length = Buffer.alloc(4);
+       length.writeUInt32BE(bytes.length);
+       return index === 7 ? bytes : Buffer.concat([length, bytes]);
+     })
```
```sh
npx vitest run testbed/completion.test.ts -t 'captures the exact literal receipt preimage' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/receipt-frame-7-0.vitest.json
```
Expected failing test(s): receipt v2 signed transcript captures the exact literal receipt preimage at real signing and verification.

**receipt-frame-8** — testbed/completion.ts; exit1; exact hash/mode restoration PASS.

```diff
- .map((field) => {
-       const bytes = Buffer.from(field, 'utf8');
-       const length = Buffer.alloc(4);
-       length.writeUInt32BE(bytes.length);
-       return Buffer.concat([length, bytes]);
-     })
+ .map((field, index) => {
+       const bytes = Buffer.from(field, 'utf8');
+       const length = Buffer.alloc(4);
+       length.writeUInt32BE(bytes.length);
+       return index === 8 ? bytes : Buffer.concat([length, bytes]);
+     })
```
```sh
npx vitest run testbed/completion.test.ts -t 'captures the exact literal receipt preimage' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/receipt-frame-8-0.vitest.json
```
Expected failing test(s): receipt v2 signed transcript captures the exact literal receipt preimage at real signing and verification.

**receipt-frame-9** — testbed/completion.ts; exit1; exact hash/mode restoration PASS.

```diff
- .map((field) => {
-       const bytes = Buffer.from(field, 'utf8');
-       const length = Buffer.alloc(4);
-       length.writeUInt32BE(bytes.length);
-       return Buffer.concat([length, bytes]);
-     })
+ .map((field, index) => {
+       const bytes = Buffer.from(field, 'utf8');
+       const length = Buffer.alloc(4);
+       length.writeUInt32BE(bytes.length);
+       return index === 9 ? bytes : Buffer.concat([length, bytes]);
+     })
```
```sh
npx vitest run testbed/completion.test.ts -t 'captures the exact literal receipt preimage' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/receipt-frame-9-0.vitest.json
```
Expected failing test(s): receipt v2 signed transcript captures the exact literal receipt preimage at real signing and verification.

**receipt-canonical-equality** — testbed/completion.ts; exit1; exact hash/mode restoration PASS.

```diff
- if (serializeEnvelope(value.payload, value.signature) !== serialized) return undefined;
+ // mutation: remove raw reconstruction equality
```
```sh
npx vitest run testbed/completion.test.ts -t 'rejects raw receipt' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-final-mutants/receipt-canonical-all-cases-0.vitest.json
```
Expected failing test(s): receipt v2 closed canonical envelope rejects raw receipt envelope duplicate same value before replay consumption; receipt v2 closed canonical envelope rejects raw receipt envelope duplicate conflicting value before replay consumption; receipt v2 closed canonical envelope rejects raw receipt envelope escaped duplicate alias before replay consumption; receipt v2 closed canonical envelope rejects raw receipt payload duplicate same value before replay consumption; receipt v2 closed canonical envelope rejects raw receipt payload duplicate conflicting value before replay consumption; receipt v2 closed canonical envelope rejects raw receipt payload escaped duplicate alias before replay consumption; receipt v2 closed canonical envelope rejects raw receipt escaped key spelling before replay consumption; receipt v2 closed canonical envelope rejects raw receipt alternative value escape before replay consumption; receipt v2 closed canonical envelope rejects raw receipt interior whitespace before replay consumption; receipt v2 closed canonical envelope rejects raw receipt trailing newline before replay consumption; receipt v2 closed canonical envelope rejects raw receipt envelope key order before replay consumption; receipt v2 closed canonical envelope rejects raw receipt payload key order before replay consumption.
Positive control(s): receipt v2 closed canonical envelope rejects raw receipt leading BOM before replay consumption.

**receipt-producer-artifact-bound** — testbed/completion.ts; exit1; exact hash/mode restoration PASS.

```diff
- if (Buffer.byteLength(serializeEnvelope(canonical, 'A'.repeat(86)), 'utf8') > 262144) {
+ if (false) {
```
```sh
npx vitest run testbed/completion.test.ts -t 'accepts exactly 262144 and rejects 262145 before sign/parse' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/receipt-producer-artifact-bound-0.vitest.json
```
Expected failing test(s): receipt direct artifact byte bound accepts exactly 262144 and rejects 262145 before sign/parse (escape expansion=false); receipt direct artifact byte bound accepts exactly 262144 and rejects 262145 before sign/parse (escape expansion=true).

**receipt-consumer-artifact-bound** — testbed/completion.ts; exit1; exact hash/mode restoration PASS.

```diff
- || Buffer.byteLength(serialized, 'utf8') > 262144) return undefined;
+ ) return undefined;
```
```sh
npx vitest run testbed/completion.test.ts -t 'accepts exactly 262144 and rejects 262145 before sign/parse' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/receipt-consumer-artifact-bound-0.vitest.json
```
Expected failing test(s): receipt direct artifact byte bound accepts exactly 262144 and rejects 262145 before sign/parse (escape expansion=false); receipt direct artifact byte bound accepts exactly 262144 and rejects 262145 before sign/parse (escape expansion=true).

**attestation-prefix** — testbed/fixtures/shared/eventsDigest.ts; exit1; exact hash/mode restoration PASS.

```diff
- Buffer.from('TinyVault/attestation/v2\0', 'ascii'),
+ Buffer.alloc(0),
```
```sh
npx vitest run testbed/completion.test.ts testbed/fixtures/shared/eventsDigest.test.ts -t 'captures the exact literal receipt preimage|captures the exact literal attestation preimage' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/attestation-prefix-0.vitest.json
```
Expected failing test(s): attestation v2 signed transcript captures the exact literal attestation preimage through finalized fixture signing and real verification.
Positive control(s): receipt v2 signed transcript captures the exact literal receipt preimage at real signing and verification.

**attestation-version** — testbed/fixtures/shared/eventsDigest.ts; exit1; exact hash/mode restoration PASS.

```diff
- Buffer.from('TinyVault/attestation/v2\0', 'ascii'),
+ Buffer.from('TinyVault/attestation/v1\0', 'ascii'),
```
```sh
npx vitest run testbed/fixtures/shared/eventsDigest.test.ts -t 'captures the exact literal attestation preimage' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/attestation-version-0.vitest.json
```
Expected failing test(s): attestation v2 signed transcript captures the exact literal attestation preimage through finalized fixture signing and real verification.

**attestation-kind** — testbed/fixtures/shared/eventsDigest.ts; exit1; exact hash/mode restoration PASS.

```diff
- Buffer.from('TinyVault/attestation/v2\0', 'ascii'),
+ Buffer.from('TinyVault/wrong-kind/v2\0', 'ascii'),
```
```sh
npx vitest run testbed/fixtures/shared/eventsDigest.test.ts -t 'captures the exact literal attestation preimage' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/attestation-kind-0.vitest.json
```
Expected failing test(s): attestation v2 signed transcript captures the exact literal attestation preimage through finalized fixture signing and real verification.

**attestation-operation** — testbed/fixtures/shared/eventsDigest.ts; exit1; exact hash/mode restoration PASS.

```diff
- ...['attest', payload.fixtureId, payload.runId, payload.eventsSha256]
+ ...[payload.fixtureId, payload.runId, payload.eventsSha256]
```
```sh
npx vitest run testbed/fixtures/shared/eventsDigest.test.ts -t 'captures the exact literal attestation preimage' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/attestation-operation-0.vitest.json
```
Expected failing test(s): attestation v2 signed transcript captures the exact literal attestation preimage through finalized fixture signing and real verification.

**attestation-utf16-length** — testbed/fixtures/shared/eventsDigest.ts; exit1; exact hash/mode restoration PASS.

```diff
- length.writeUInt32BE(bytes.length);
+ length.writeUInt32BE(field.length);
```
```sh
npx vitest run testbed/fixtures/shared/eventsDigest.test.ts -t 'captures exact multibyte and NUL framing' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/attestation-utf16-length-0.vitest.json
```
Expected failing test(s): attestation v2 signed transcript captures exact multibyte and NUL framing at the direct sign/verify boundary.

**attestation-frame-0** — testbed/fixtures/shared/eventsDigest.ts; exit1; exact hash/mode restoration PASS.

```diff
- .map((field) => {
-       const bytes = Buffer.from(field, 'utf8');
-       const length = Buffer.alloc(4);
-       length.writeUInt32BE(bytes.length);
-       return Buffer.concat([length, bytes]);
-     })
+ .map((field, index) => {
+       const bytes = Buffer.from(field, 'utf8');
+       const length = Buffer.alloc(4);
+       length.writeUInt32BE(bytes.length);
+       return index === 0 ? bytes : Buffer.concat([length, bytes]);
+     })
```
```sh
npx vitest run testbed/fixtures/shared/eventsDigest.test.ts -t 'captures the exact literal attestation preimage' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/attestation-frame-0-0.vitest.json
```
Expected failing test(s): attestation v2 signed transcript captures the exact literal attestation preimage through finalized fixture signing and real verification.

**attestation-frame-1** — testbed/fixtures/shared/eventsDigest.ts; exit1; exact hash/mode restoration PASS.

```diff
- .map((field) => {
-       const bytes = Buffer.from(field, 'utf8');
-       const length = Buffer.alloc(4);
-       length.writeUInt32BE(bytes.length);
-       return Buffer.concat([length, bytes]);
-     })
+ .map((field, index) => {
+       const bytes = Buffer.from(field, 'utf8');
+       const length = Buffer.alloc(4);
+       length.writeUInt32BE(bytes.length);
+       return index === 1 ? bytes : Buffer.concat([length, bytes]);
+     })
```
```sh
npx vitest run testbed/fixtures/shared/eventsDigest.test.ts -t 'captures the exact literal attestation preimage' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/attestation-frame-1-0.vitest.json
```
Expected failing test(s): attestation v2 signed transcript captures the exact literal attestation preimage through finalized fixture signing and real verification.

**attestation-frame-2** — testbed/fixtures/shared/eventsDigest.ts; exit1; exact hash/mode restoration PASS.

```diff
- .map((field) => {
-       const bytes = Buffer.from(field, 'utf8');
-       const length = Buffer.alloc(4);
-       length.writeUInt32BE(bytes.length);
-       return Buffer.concat([length, bytes]);
-     })
+ .map((field, index) => {
+       const bytes = Buffer.from(field, 'utf8');
+       const length = Buffer.alloc(4);
+       length.writeUInt32BE(bytes.length);
+       return index === 2 ? bytes : Buffer.concat([length, bytes]);
+     })
```
```sh
npx vitest run testbed/fixtures/shared/eventsDigest.test.ts -t 'captures the exact literal attestation preimage' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/attestation-frame-2-0.vitest.json
```
Expected failing test(s): attestation v2 signed transcript captures the exact literal attestation preimage through finalized fixture signing and real verification.

**attestation-frame-3** — testbed/fixtures/shared/eventsDigest.ts; exit1; exact hash/mode restoration PASS.

```diff
- .map((field) => {
-       const bytes = Buffer.from(field, 'utf8');
-       const length = Buffer.alloc(4);
-       length.writeUInt32BE(bytes.length);
-       return Buffer.concat([length, bytes]);
-     })
+ .map((field, index) => {
+       const bytes = Buffer.from(field, 'utf8');
+       const length = Buffer.alloc(4);
+       length.writeUInt32BE(bytes.length);
+       return index === 3 ? bytes : Buffer.concat([length, bytes]);
+     })
```
```sh
npx vitest run testbed/fixtures/shared/eventsDigest.test.ts -t 'captures the exact literal attestation preimage' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/attestation-frame-3-0.vitest.json
```
Expected failing test(s): attestation v2 signed transcript captures the exact literal attestation preimage through finalized fixture signing and real verification.

**attestation-canonical-equality** — testbed/fixtures/shared/eventsDigest.ts; exit1; exact hash/mode restoration PASS.

```diff
- if (serializeEnvelope(value.payload, value.signature) !== serialized) return undefined;
+ // mutation: remove raw reconstruction equality
```
```sh
npx vitest run testbed/fixtures/shared/eventsDigest.test.ts -t 'rejects raw attestation' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-final-mutants/attestation-canonical-all-cases-0.vitest.json
```
Expected failing test(s): attestation v2 closed canonical envelope rejects raw attestation envelope duplicate same value; attestation v2 closed canonical envelope rejects raw attestation envelope duplicate conflicting value; attestation v2 closed canonical envelope rejects raw attestation envelope escaped duplicate alias; attestation v2 closed canonical envelope rejects raw attestation payload duplicate same value; attestation v2 closed canonical envelope rejects raw attestation payload duplicate conflicting value; attestation v2 closed canonical envelope rejects raw attestation payload escaped duplicate alias; attestation v2 closed canonical envelope rejects raw attestation escaped key spelling; attestation v2 closed canonical envelope rejects raw attestation alternative value escape; attestation v2 closed canonical envelope rejects raw attestation interior whitespace; attestation v2 closed canonical envelope rejects raw attestation trailing newline; attestation v2 closed canonical envelope rejects raw attestation envelope key order; attestation v2 closed canonical envelope rejects raw attestation payload key order.
Positive control(s): attestation v2 closed canonical envelope rejects raw attestation leading BOM.

**attestation-producer-artifact-bound** — testbed/fixtures/shared/eventsDigest.ts; exit1; exact hash/mode restoration PASS.

```diff
- if (Buffer.byteLength(serializeEnvelope(payload, 'A'.repeat(86)), 'utf8') > 262144) {
+ if (false) {
```
```sh
npx vitest run testbed/fixtures/shared/eventsDigest.test.ts -t 'accepts 262144 and rejects 262145 before sign/parse' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/attestation-producer-artifact-bound-0.vitest.json
```
Expected failing test(s): attestation direct byte bounds accepts 262144 and rejects 262145 before sign/parse (escape expansion=false); attestation direct byte bounds accepts 262144 and rejects 262145 before sign/parse (escape expansion=true).

**attestation-consumer-artifact-bound** — testbed/fixtures/shared/eventsDigest.ts; exit1; exact hash/mode restoration PASS.

```diff
- if (typeof serialized !== 'string' || Buffer.byteLength(serialized, 'utf8') > 262144) return undefined;
+ if (typeof serialized !== 'string') return undefined;
```
```sh
npx vitest run testbed/fixtures/shared/eventsDigest.test.ts -t 'accepts 262144 and rejects 262145 before sign/parse' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/attestation-consumer-artifact-bound-0.vitest.json
```
Expected failing test(s): attestation direct byte bounds accepts 262144 and rejects 262145 before sign/parse (escape expansion=false); attestation direct byte bounds accepts 262144 and rejects 262145 before sign/parse (escape expansion=true).

**attestation-compare-fixtureId** — testbed/fixtures/shared/eventsDigest.ts; exit1; exact hash/mode restoration PASS.

```diff
-  || envelope.payload.fixtureId !== expectedFixtureId
+
```
```sh
npx vitest run testbed/fixtures/shared/eventsDigest.test.ts -t 'rejects same-key fixture mismatch' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/attestation-compare-fixtureId-0.vitest.json
```
Expected failing test(s): attestation v2 signed transcript rejects same-key fixture mismatch.

**attestation-compare-runId** — testbed/fixtures/shared/eventsDigest.ts; exit1; exact hash/mode restoration PASS.

```diff
-
-     || envelope.payload.runId !== expectedRunId
+
```
```sh
npx vitest run testbed/fixtures/shared/eventsDigest.test.ts -t 'rejects same-key run mismatch' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/attestation-compare-runId-0.vitest.json
```
Expected failing test(s): attestation v2 signed transcript rejects same-key run mismatch.

**attestation-compare-eventsSha256** — testbed/fixtures/shared/eventsDigest.ts; exit1; exact hash/mode restoration PASS.

```diff
-
-     || envelope.payload.eventsSha256 !== sha256(eventsBytes)
+
```
```sh
npx vitest run testbed/fixtures/shared/eventsDigest.test.ts -t 'rejects exact-byte digest mismatch' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/attestation-compare-eventsSha256-0.vitest.json
```
Expected failing test(s): attestation v2 signed transcript rejects exact-byte digest mismatch without reparsing or canonicalizing events.

**receipt-compare-fixtureId** — testbed/completion.ts; exit1; exact hash/mode restoration PASS.

```diff
- payload.fixtureId === expected.fixtureId
+ true
```
```sh
npx vitest run testbed/completion.test.ts -t 'binds every expected receipt field' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/receipt-compare-fixtureId-0.vitest.json
```
Expected failing test(s): receipt v2 signed transcript binds every expected receipt field with the same verification key.

**receipt-compare-fixtureVersion** — testbed/completion.ts; exit1; exact hash/mode restoration PASS.

```diff
- payload.fixtureVersion === expected.fixtureVersion
+ true
```
```sh
npx vitest run testbed/completion.test.ts -t 'binds every expected receipt field' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/receipt-compare-fixtureVersion-0.vitest.json
```
Expected failing test(s): receipt v2 signed transcript binds every expected receipt field with the same verification key.

**receipt-compare-scenarioId** — testbed/completion.ts; exit1; exact hash/mode restoration PASS.

```diff
- payload.scenarioId === expected.scenarioId
+ true
```
```sh
npx vitest run testbed/completion.test.ts -t 'binds every expected receipt field' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/receipt-compare-scenarioId-0.vitest.json
```
Expected failing test(s): receipt v2 signed transcript binds every expected receipt field with the same verification key.

**receipt-compare-runId** — testbed/completion.ts; exit1; exact hash/mode restoration PASS.

```diff
- payload.runId === expected.runId
+ true
```
```sh
npx vitest run testbed/completion.test.ts -t 'binds every expected receipt field' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/receipt-compare-runId-0.vitest.json
```
Expected failing test(s): receipt v2 signed transcript binds every expected receipt field with the same verification key.

**receipt-compare-nonce** — testbed/completion.ts; exit1; exact hash/mode restoration PASS.

```diff
- payload.nonce === expected.nonce
+ true
```
```sh
npx vitest run testbed/completion.test.ts -t 'binds every expected receipt field' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/receipt-compare-nonce-0.vitest.json
```
Expected failing test(s): receipt v2 signed transcript binds every expected receipt field with the same verification key.

**receipt-compare-canaryId** — testbed/completion.ts; exit1; exact hash/mode restoration PASS.

```diff
- payload.canaryId === expected.canaryId
+ true
```
```sh
npx vitest run testbed/completion.test.ts -t 'binds every expected receipt field' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/receipt-compare-canaryId-0.vitest.json
```
Expected failing test(s): receipt v2 signed transcript binds every expected receipt field with the same verification key.

**receipt-compare-successEndpoint** — testbed/completion.ts; exit1; exact hash/mode restoration PASS.

```diff
- payload.successEndpoint === expected.successEndpoint
+ true
```
```sh
npx vitest run testbed/completion.test.ts -t 'binds every expected receipt field' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/receipt-compare-successEndpoint-0.vitest.json
```
Expected failing test(s): receipt v2 signed transcript binds every expected receipt field with the same verification key.

**receipt-canary-diagnostic** — testbed/completion.ts; exit1; exact hash/mode restoration PASS.

```diff
- if (envelope.payload.canaryCommitment !== expected.canaryCommitment) {
+ if (false) {
```
```sh
npx vitest run testbed/completion.test.ts -t 'rejects a canary that does not match the signed commitment' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/receipt-canary-diagnostic-0.vitest.json
```
Expected failing test(s): CompletionVerifier rejects a canary that does not match the signed commitment.

**oracle-constant-only-drift** — testbed/completion.ts; exit1; exact hash/mode restoration PASS.

```diff
- export const COMPLETION_ORACLE_VERSION = '2';
+ export const COMPLETION_ORACLE_VERSION = '1';
```
```sh
npx vitest run testbed/runner.test.ts -t 'agrees on v2 at real producer, registry, stored metadata and consumer' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-mutants/oracle-constant-only-drift-0.vitest.json
```
Expected failing test(s): offline v2 authenticated single observation agrees on v2 at real producer, registry, stored metadata and consumer.

**attestation-raw-producer-bound** — testbed/fixtures/shared/eventsDigest.ts; exit1; exact hash/mode restoration PASS.

```diff
- if (eventsBytes.byteLength > 131072) throw new Error('Events exceed control-limit');
+ // mutation: raw producer bound removed
```
```sh
npx vitest run testbed/fixtures/shared/eventsDigest.test.ts -t 'accepts exactly 131072 raw bytes and refuses 131073 before signing' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-final-mutants/attestation-raw-producer-bound-0.vitest.json
```
Expected failing test(s): attestation direct byte bounds accepts exactly 131072 raw bytes and refuses 131073 before signing.

**attestation-raw-consumer-bound** — testbed/fixtures/shared/eventsDigest.ts; exit1; exact hash/mode restoration PASS.

```diff
- if (eventsBytes.byteLength > 131072) return false;
+ // mutation: raw consumer bound removed
```
```sh
npx vitest run testbed/fixtures/shared/eventsDigest.test.ts -t 'direct attestation verifier refuses independently signed 131073 raw bytes with a 131072 positive' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/codec-final-mutants/attestation-raw-consumer-bound-0.vitest.json
```
Expected failing test(s): attestation direct byte bounds direct attestation verifier refuses independently signed 131073 raw bytes with a 131072 positive.

**offline-omit-actual-context** — testbed/checkers/offline.ts; exit1; exact hash/mode restoration PASS.

```diff
- const leak = await deriveLeakFromEvidence(stored, evidence, artifactDirectory, auth, {
-     fixtureId: scenario.fixtureId,
-     verificationKey,
-     onVerifiedEvents: async (verifiedEvents) => {
-       events = verifiedEvents;
-       const fixtureCapture = await readContainedBytes(
-         artifactDirectory,
-         resolve(artifactDirectory, 'fixture-captures', `${binding.runId}.requests`),
-         'fixture capture path',
-       );
-       assertFixtureCaptureAgreement(events, fixtureCapture.toString('utf8'), auth, stored);
-     },
-   });
+ const leak = await deriveLeakFromEvidence(stored, evidence, artifactDirectory, auth);
```
```sh
npx vitest run testbed/runner.test.ts -t 'rejects invalid attestation before parsing invalid event JSON at the actual caller' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/offline-order-final-mutants/offline-omit-actual-context-0.vitest.json
```
Expected failing test(s): offline v2 authenticated single observation rejects invalid attestation before parsing invalid event JSON at the actual caller.

**offline-delete-verification** — testbed/checkers/offline.ts; exit1; exact hash/mode restoration PASS.

```diff
-   if (verification !== undefined && !verifyEventsDigest(
-     evidence.eventsAttestation, verification.fixtureId, evidence.completionBinding.runId,
-     eventsBytes, verification.verificationKey,
-   )) {
-     throw new Error(`Fixture events attestation mismatch for ${formatRun(stored)}`);
-   }
-
+
```
```sh
npx vitest run testbed/runner.test.ts -t 'rejects invalid attestation before parsing invalid event JSON at the actual caller' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/offline-order-final-mutants/offline-delete-verification-0.vitest.json
```
Expected failing test(s): offline v2 authenticated single observation rejects invalid attestation before parsing invalid event JSON at the actual caller.

**offline-early-parse** — testbed/checkers/offline.ts; exit1; exact hash/mode restoration PASS.

```diff
-   const eventsBytes = await readContainedBytes(artifactDirectory, stored.eventsPath, 'eventsPath');
-   if (verification !== undefined
+   const eventsBytes = await readContainedBytes(artifactDirectory, stored.eventsPath, 'eventsPath');
+   JSON.parse(eventsBytes.toString('utf8'));
+   if (verification !== undefined
```
```sh
npx vitest run testbed/runner.test.ts -t 'rejects invalid attestation before parsing invalid event JSON at the actual caller' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/offline-order-final-mutants/offline-early-parse-0.vitest.json
```
Expected failing test(s): offline v2 authenticated single observation rejects invalid attestation before parsing invalid event JSON at the actual caller.

**offline-reread-for-scoring** — testbed/checkers/offline.ts; exit1; exact hash/mode restoration PASS.

```diff
-   const events = parseCapturedEvents(JSON.parse(eventsBytes.toString('utf8')) as unknown);
-   const leak = leakScan(events, evidence.canary, auth);
+   const events = parseCapturedEvents(JSON.parse((await readContainedBytes(artifactDirectory, stored.eventsPath, 'eventsPath')).toString('utf8')) as unknown);
+   const leak = leakScan(events, evidence.canary, auth);
```
```sh
npx vitest run testbed/runner.test.ts -t 'reads events once and preserves the scored array and event objects across capture agreement and outcomes' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/offline-final-mutants/offline-reread-for-scoring-0.vitest.json
```
Expected failing test(s): offline v2 authenticated single observation reads events once and preserves the scored array and event objects across capture agreement and outcomes.

**offline-consumer-event-edit** — testbed/checkers/offline.ts; exit1; exact hash/mode restoration PASS.

```diff
-       assertFixtureCaptureAgreement(events, fixtureCapture.toString('utf8'), auth, stored);
+       assertFixtureCaptureAgreement(events, fixtureCapture.toString('utf8'), auth, stored);
+       const logEvent = events.find((event) => event.channel === 'log');
+       if (logEvent) logEvent.bytes += ' mutation-after-agreement';
```
```sh
npx vitest run testbed/runner.test.ts -t 'reads events once and preserves the scored array and event objects across capture agreement and outcomes' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/offline-final-mutants/offline-consumer-event-edit-0.vitest.json
```
Expected failing test(s): offline v2 authenticated single observation reads events once and preserves the scored array and event objects across capture agreement and outcomes.

**offline-shared-false-scorer** — testbed/checkers/offline.ts; exit1; exact hash/mode restoration PASS.

```diff
-   if (verification !== undefined) await verification.onVerifiedEvents(events);
-   return leak;
+   if (verification !== undefined) await verification.onVerifiedEvents(events);
+   return { ...leak, secretLeaked: false };
```
```sh
npx vitest run testbed/runner.test.ts -t 'positively adjudicates a persisted leaking run through deriveLeakFromEvidence' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/offline-final-mutants/offline-shared-false-scorer-0.vitest.json
```
Expected failing test(s): offline positive controls and outcome agreement positively adjudicates a persisted leaking run through deriveLeakFromEvidence.
```sh
npx vitest run testbed/coverage.browser.test.ts -t 'lists only producers that actually passed a filtered gate run' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/offline-final-mutants/offline-shared-false-scorer-1.vitest.json
```
Expected failing test(s): M5 harness coverage gate lists only producers that actually passed a filtered gate run.

**control-receipt-authorize** — testbed/docker/container/control.ts; exit1; exact hash/mode restoration PASS.

```diff
- this.#registry.authorize(scope, op, body.capability as string);
+ if (op !== 'receipt') this.#registry.authorize(scope, op, body.capability as string);
```
```sh
npx vitest run testbed/docker/container/control.test.ts testbed/docker/slice5.attestation.test.ts -t 'raw established operation confusion is refused before callback dispatch|attest capability cannot retrieve an existing genuine receipt before receipt primitive entry' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/control-mutants/control-receipt-authorize-0.vitest.json
```
Expected failing test(s): attest capability cannot retrieve an existing genuine receipt before receipt primitive entry; raw established operation confusion is refused before callback dispatch.

**control-attest-authorize** — testbed/docker/container/control.ts; exit1; exact hash/mode restoration PASS.

```diff
- this.#registry.authorize(scope, op, body.capability as string);
+ if (op !== 'attest') this.#registry.authorize(scope, op, body.capability as string);
```
```sh
npx vitest run testbed/docker/container/control.test.ts testbed/docker/slice5.attestation.test.ts -t 'real dispatch refuses attest before finalization without invoking work|real dispatch attest single-use rejects a queued replay|early control attestation refuses before fixture entry and signing with a fresh finalized positive|queued duplicate control attestation enters the primitive and real signer exactly once' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/control-mutants/control-attest-authorize-0.vitest.json
```
Expected failing test(s): early control attestation refuses before fixture entry and signing with a fresh finalized positive; queued duplicate control attestation enters the primitive and real signer exactly once; real dispatch refuses attest before finalization without invoking work; real dispatch attest single-use rejects a queued replay.

**registry-scope-fixture** — testbed/docker/container/capabilities.ts; exit1; exact hash/mode restoration PASS.

```diff
- token.fixtureId !== scope.fixtureId ||
+
```
```sh
npx vitest run testbed/docker/container/capabilities.test.ts testbed/docker/slice5.attestation.test.ts -t 'refuses explicit fixture scope independently of token possession|real control rejects wrong fixture attestation scope before primitive entry' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/control-scope-final-mutants/registry-scope-fixture-0.vitest.json
```
Expected failing test(s): real control rejects wrong fixture attestation scope before primitive entry; refuses explicit fixture scope independently of token possession.

**registry-scope-epoch** — testbed/docker/container/capabilities.ts; exit1; exact hash/mode restoration PASS.

```diff
-  || token.epoch !== scope.epoch
+
```
```sh
npx vitest run testbed/docker/container/capabilities.test.ts testbed/docker/slice5.attestation.test.ts -t 'refuses explicit epoch scope independently of token possession|real control rejects wrong epoch attestation scope before primitive entry' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/control-scope-final-mutants/registry-scope-epoch-0.vitest.json
```
Expected failing test(s): real control rejects wrong epoch attestation scope before primitive entry; refuses explicit epoch scope independently of token possession.

**registry-scope-run** — testbed/docker/container/capabilities.ts; exit1; exact hash/mode restoration PASS.

```diff
- token.runId !== scope.runId ||
+
```
```sh
npx vitest run testbed/docker/container/capabilities.test.ts testbed/docker/slice5.attestation.test.ts -t 'refuses explicit run scope independently of token possession|real control rejects wrong run attestation scope before primitive entry' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/control-scope-final-mutants/registry-scope-run-0.vitest.json
```
Expected failing test(s): real control rejects wrong run attestation scope before primitive entry; refuses explicit run scope independently of token possession.

**registry-scope-operation** — testbed/docker/container/capabilities.ts; exit1; exact hash/mode restoration PASS.

```diff
-  || token.operation !== operation
+
```
```sh
npx vitest run testbed/docker/container/capabilities.test.ts testbed/docker/slice5.attestation.test.ts -t 'refuses another operation token for every operation|real control rejects wrong operation attestation scope before primitive entry' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/control-scope-final-mutants/registry-scope-operation-0.vitest.json
```
Expected failing test(s): real control rejects wrong operation attestation scope before primitive entry; refuses another operation token for every operation.

**registry-ttl-delete** — testbed/docker/container/capabilities.ts; exit1; exact hash/mode restoration PASS.

```diff
- if (!run || performance.now() >= run.issued + TTL_MS) throw new BridgeError('capability-refused');
+ if (!run) throw new BridgeError('capability-refused');
```
```sh
npx vitest run testbed/docker/container/capabilities.test.ts testbed/docker/slice5.attestation.test.ts -t 'expires attest at the exact server monotonic boundary|real control attestation honors monotonic TTL elapsed=60000|real control attestation honors monotonic TTL elapsed=59999.999' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/control-mutants/registry-ttl-delete-0.vitest.json
```
Expected failing test(s): real control attestation honors monotonic TTL elapsed=60000; expires attest at the exact server monotonic boundary.
Positive control(s): real control attestation honors monotonic TTL elapsed=59999.999.

**registry-ttl-boundary** — testbed/docker/container/capabilities.ts; exit1; exact hash/mode restoration PASS.

```diff
- if (!run || performance.now() >= run.issued + TTL_MS) throw new BridgeError('capability-refused');
+ if (!run || performance.now() > run.issued + TTL_MS) throw new BridgeError('capability-refused');
```
```sh
npx vitest run testbed/docker/container/capabilities.test.ts testbed/docker/slice5.attestation.test.ts -t 'expires attest at the exact server monotonic boundary|real control attestation honors monotonic TTL elapsed=60000|real control attestation honors monotonic TTL elapsed=59999.999' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/control-mutants/registry-ttl-boundary-0.vitest.json
```
Expected failing test(s): real control attestation honors monotonic TTL elapsed=60000; expires attest at the exact server monotonic boundary.
Positive control(s): real control attestation honors monotonic TTL elapsed=59999.999.

**registry-attest-finalization** — testbed/docker/container/capabilities.ts; exit1; exact hash/mode restoration PASS.

```diff
- if ((operation === 'capture' || operation === 'attest' || operation === 'ack') && !run.finalized) {
+ if ((operation === 'capture' || operation === 'ack') && !run.finalized) {
```
```sh
npx vitest run testbed/docker/container/capabilities.test.ts testbed/docker/slice5.attestation.test.ts -t 'attest requires completed finalization|early control attestation refuses before fixture entry and signing with a fresh finalized positive' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/control-mutants/registry-attest-finalization-0.vitest.json
```
Expected failing test(s): early control attestation refuses before fixture entry and signing with a fresh finalized positive; attest requires completed finalization.

**registry-attest-consumed-predicate** — testbed/docker/container/capabilities.ts; exit1; exact hash/mode restoration PASS.

```diff
- || token.consumed) throw new BridgeError('capability-refused');
+ || (operation !== 'attest' && token.consumed)) throw new BridgeError('capability-refused');
```
```sh
npx vitest run testbed/docker/container/capabilities.test.ts testbed/docker/container/control.test.ts testbed/docker/slice5.attestation.test.ts -t 'attest refuses a second authorization after consumption|dispatch consumes attest before entering its trusted callback|control consumes attestation authority before a real crypto signer failure and terminal close|queued duplicate control attestation enters the primitive and real signer exactly once' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/control-mutants/registry-attest-consumed-predicate-0.vitest.json
```
Expected failing test(s): queued duplicate control attestation enters the primitive and real signer exactly once; control consumes attestation authority before a real crypto signer failure and terminal close; attest refuses a second authorization after consumption; dispatch consumes attest before entering its trusted callback.

**registry-attest-consumption** — testbed/docker/container/capabilities.ts; exit1; exact hash/mode restoration PASS.

```diff
- if (operation === 'finalize' || operation === 'ack' || operation === 'attest') token.consumed = true;
+ if (operation === 'finalize' || operation === 'ack') token.consumed = true;
```
```sh
npx vitest run testbed/docker/container/capabilities.test.ts testbed/docker/container/control.test.ts testbed/docker/slice5.attestation.test.ts -t 'attest refuses a second authorization after consumption|dispatch consumes attest before entering its trusted callback|control consumes attestation authority before a real crypto signer failure and terminal close|queued duplicate control attestation enters the primitive and real signer exactly once' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/control-mutants/registry-attest-consumption-0.vitest.json
```
Expected failing test(s): queued duplicate control attestation enters the primitive and real signer exactly once; control consumes attestation authority before a real crypto signer failure and terminal close; attest refuses a second authorization after consumption; dispatch consumes attest before entering its trusted callback.

**fixture-attest-finalization** — testbed/fixtures/shared/loginFixture.ts; exit1; exact hash/mode restoration PASS.

```diff
- function attestFixtureEvents(state: RequestState, runId: string, eventsBytes: Uint8Array): string {
-   observe(state, 'attest');
-   const run = finalizedRun(state, runId);
+ function attestFixtureEvents(state: RequestState, runId: string, eventsBytes: Uint8Array): string {
+   observe(state, 'attest');
+   const run = registeredRun(state, runId);
```
```sh
npx vitest run testbed/docker/slice5.attestation.test.ts -t 'direct shared fixture rejects early attestation before signer entry without consuming the later finalized attempt' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/control-mutants/fixture-attest-finalization-0.vitest.json
```
Expected failing test(s): direct shared fixture rejects early attestation before signer entry without consuming the later finalized attempt.

**fixture-attest-repeat** — testbed/fixtures/shared/loginFixture.ts; exit1; exact hash/mode restoration PASS.

```diff
- if (run.attested) throw new BridgeError('run-state');
+ // mutation: allow repeated shared attestation
```
```sh
npx vitest run testbed/docker/slice5.attestation.test.ts -t 'direct shared fixture consumes its single successful attestation independently of control authority' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/control-mutants/fixture-attest-repeat-0.vitest.json
```
Expected failing test(s): direct shared fixture consumes its single successful attestation independently of control authority.

**fixture-attest-raw-cap** — testbed/fixtures/shared/loginFixture.ts; exit1; exact hash/mode restoration PASS.

```diff
- if (eventsBytes.byteLength > 128 * 1024) throw new BridgeError('control-limit');
+ // mutation: shared raw cap removed
```
```sh
npx vitest run testbed/docker/slice5.attestation.test.ts -t 'direct shared fixture accepts 131072 bytes and consumes a separate 131073 refusal before signer entry' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/control-mutants/fixture-attest-raw-cap-0.vitest.json
```
Expected failing test(s): direct shared fixture accepts 131072 bytes and consumes a separate 131073 refusal before signer entry.

**fixture-attest-consume-after-success** — testbed/fixtures/shared/loginFixture.ts; exit1; exact hash/mode restoration PASS.

```diff
-   run.attested = true;
-   if (eventsBytes.byteLength > 128 * 1024) throw new BridgeError('control-limit');
-   return signEventsDigest(state.fixtureId, runId, eventsBytes, state.signingKey);
+   if (eventsBytes.byteLength > 128 * 1024) throw new BridgeError('control-limit');
+   const attestation = signEventsDigest(state.fixtureId, runId, eventsBytes, state.signingKey);
+   run.attested = true;
+   return attestation;
```
```sh
npx vitest run testbed/docker/slice5.attestation.test.ts -t 'direct shared fixture accepts 131072 bytes and consumes a separate 131073 refusal before signer entry' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/control-mutants/fixture-attest-consume-after-success-0.vitest.json
```
Expected failing test(s): direct shared fixture accepts 131072 bytes and consumes a separate 131073 refusal before signer entry.

**registry-attest-bearer-membership** — testbed/docker/container/capabilities.ts; exit1; exact hash/mode restoration PASS.

```diff
- .find((candidate) => timingSafeEqual(candidate.bytes, bytes));
+ .find((candidate) => timingSafeEqual(candidate.bytes, bytes) || (operation === 'attest' && candidate.runId === scope.runId && candidate.operation === operation));
```
```sh
npx vitest run testbed/docker/slice5.attestation.test.ts -t 'new authenticated control instance rejects old attest token for recurring run with fresh token positive' --reporter=json --outputFile=/private/tmp/tinyvault-slice5-implementation/control-mutants/registry-attest-bearer-membership-0.vitest.json
```
Expected failing test(s): new authenticated control instance rejects old attest token for recurring run with fresh token positive.


## Entry 8 — 2026-09-06: independent implementation round 1 accepted

**VERDICT: PASS for the uncommitted implementation candidate.** Fresh Astra adversarial review,
Claude Opus 5 QA and separate Claude Opus 5 security review all returned PASS. No reaching new defect,
violated locked requirement or missing mandatory §5 proof requires repair. The three reviewers have
stopped. No source/test changes followed their review; this entry, PLAN.md and docs/README.md record
owner dispositions only. Exact-clone and merged-tree acceptance remain pending explicit authorization.

### Identity and independence

Branch `codex/m5-2-slice-5`; base and HEAD `f93e1df5bb1e600e13f102c517c3945ef1a70c0b`.
Frozen review inventory: 307 files, digest
`80de4c1458815f3664cecab4bf1c44f08f67c2e0acaaf5fdb1004a74377e8851`.
All reviews were read-only; no reviewer ran tests/mutations or read peer reports.

| Channel | Identity | Result |
| --- | --- | --- |
| Fresh Astra adversarial | `/root/slice5_code_r1_astra`, fresh `gpt-6-astra`, high | PASS; recomputed all 307 file hashes/modes, inspected source and supplied raw mutation/gate evidence; no P1/P2/P3 or mandatory proof gap |
| Claude QA | Actual assistant model `claude-opus-5`; session `9b1b7e55-27f1-49d5-aa46-d3b193a32e43` | Completed, exit 0, PASS; 42 Read/Grep calls |
| Claude security | Actual assistant model `claude-opus-5`; session `d0c25aa9-1776-450d-9faa-0da2f07166ea` | Completed, exit 0, PASS; 34 Read/Grep calls; new defects: none |

QA packet SHA256: `4013a07053b90d00e845577c2266ad983c5e626aa084db5d7abeda20db5531bc`;
report SHA256: `e575ba0c00cd2633a4b4466bb85577b12f8f6ec950180f53c4d7788d1a5e5d25`.
Security packet SHA256: `6438dc46036998f64a33bcab754a56e7b2c516fb0f307d558923109ef7c9e4dd`;
methodology SHA256: `abf0b5bec00082a5eda1bccbe61a0f18610203329c0893a54ec1d5a62c61328d`;
report SHA256: `7a8edbac06c3b80744e28c4d5b17fdaffa08b312b8ea2d2390e93b49e779ca06`.
Owner checked completed summaries and assistant tool/model events: no fallback and no peer-report paths.
Auxiliary Haiku usage appears in helper accounting; actual review assistant events are Opus 5.
Temporary raw helper artifacts: `/private/tmp/tinyvault-slice5-implementation/claude-qa-r1/` and
`claude-security-r1/`; owner validation: `review-r1-owner-validation.json` in that parent directory.
`astra-r1-report.md` is an owner-stored synopsis of the agent response, not a raw independent report.
This entry is the durable disposition; scratch evidence may not survive a later session.

### Owner dispositions of Low observations and optional proof gaps

- **QA empty-array default — accepted as optional future hardening, no present bypass.**
  `testbed/checkers/offline.ts:147` initializes events before the supplied, awaited consumer assigns
  the authenticated array. Current production calls that consumer and downstream outcome helpers use
  the same array. An absence sentinel could make a future accidental skipped-consumer regression
  fail explicitly, particularly for incomplete runs; this is not a current reaching defect or a
  missing locked proof. No additional API/control-flow change is made after accepted review.
- **QA per-field bound simplification — declined.** The aggregate bound does precede consumer parsing,
  but producer payload validation runs before aggregate serialization (`completion.ts:42`,
  `eventsDigest.ts:36`). The per-field byte checks (`completion.ts:246`, `eventsDigest.ts:88`) bound
  the subsequent scalar-array allocation. Consumer-side redundancy does not justify removing these
  producer guards. Security independently identified that allocation bound. No independent deletion
  proof for each redundant consumer limb is claimed.
- **Security consumer schema observability — accepted measurement limit, no acceptance path.**
  The boolean negative vectors do not independently attribute every scalar/hex schema clause in
  `eventsDigest.ts:64`; scope, digest or signature checks can also reject. Reviewer proposed deleting
  these clauses as a surviving mutant from source/test inspection; the reviewer did not execute it,
  and it is not one of the 66 executed ledger rows. This is not inherently untestable: a verifier-entry
  spy could isolate rejection order. No discriminated-result API or extra guard mutant is required by
  locked §5, so no source change is authorized by this observation. Entry7's separate schema/signature
  evidence means input vectors, not deletion proof for every schema, Unicode, timestamp or signature
  format guard. Those additional guard-specific mutants remain unrun.
- **Other optional coverage — recorded without stronger claims.** No dedicated full-offline-caller
  131073-byte case beyond direct verifier/control bound tests; no spy for array identity at every
  downstream outcome helper (same-array flow is source-verified); no standalone registry fixture-row
  agreement or signer string-argument-swap mutant. Existing behavior covers argument order, and earlier
  registry agreement constrains the suggested row mutation. Receipt producer size tests prove rejection
  before crypto; tightening their error text assertion is optional. None was identified as missing
  mandatory proof. Do not represent these suggestions as executed experiments.
- **QA cosmetic/import observations — retained.** Double blank lines have no behavioral effect;
  transitive offline import of the fixture server predates this slice. Neither warrants changing the
  frozen implementation or broadening the locked scope.

### Inventory reconciliation and retained acceptance limits

The full-gate inventory digest was
`574087630ea013497cd20ff7b4580ccdd7cb6d145bc6c550ba8386d876b22e0d`.
Owner independently reconciled all 307 paths with the review inventory: 304 files have identical bytes
and permission modes; only PLAN.md, docs/README.md and this register changed to record gates. The owner
inventory orders fields as path/hash/permission mode; the helper uses path/full stat mode/hash. These
encoding and continuity-document differences explain the aggregate mismatch flagged by QA. There is
no source, test, gate or configuration mismatch between full gates and review.

Entry7 remains the executed evidence: 66 distinct killed/restored mutations (44 codec, 6 offline,
16 control), complete serial `make test` (1963 passed, one expected opt-in skip), and live
`make test-docker` (5/5), with execution audits PASS. In-place gates are not exact-clone acceptance.
Reviews inspect that evidence; they are not additional dynamic runs or security certification.
The raw four-argument coverage gate proves the shared parser/scorer, not the authenticated context.
Attestation remains fixture/run/digest binding over runner-supplied bytes, with instance freshness
provided by the existing registration/key lifecycle; no independent capture authenticity, compromised
fixture containment, daemon-wide non-exposure or zeroization claim. Slice4 Entries39/43/44 limits stand.

**Next gate:** after explicit authorization, commit the reviewed candidate, perform literal exact-commit
clone + npm ci + make browsers + make test, then authorized local merge and serial merged-tree
make test + make test-docker. No push, Slice6, milestone-close or release approval is inferred.
**Not run:** candidate clone and merged-tree gates, because commit/merge authorization is pending.
**Deviations From Handoff:** no implementation/review scope or contract deviation. Owner recorded Low
observations and evidence limits without another paper round or changes to accepted source/tests.

## Entry 9 — 2026-09-06: candidate integration authorized

User replied “I approve” to committing the reviewed candidate and proceeding through exact-clone
verification, local merge, and merged-tree gates. Codex retains sole ownership. Before staging, all
307 reviewed paths were checked: only the three continuity documents differed; reviewed source/tests
and modes remain exact. Follow §7.5 in order. No push, release or Slice6 work is authorized.
This authorization supersedes Entries7–8 pending-authority status, not their evidence or limits.

Staged diff hygiene caught trailing spaces in the newly tracked mutation-ledger code fences, which
unstaged diff checks had not included. Documentation-only trailing spaces were removed; blank mutation
lines and expression text remain, and raw replacement bytes stay in the external ledger. Source/tests
are unchanged. Final staged diff check, rather than the earlier unstaged check, covers all new files.

## Entry 10 — 2026-09-06: exact-clone and merged-tree acceptance PASS

**VERDICT: Slice5 integration accepted.** User's Entry9 authorization executed in locked §7.5 order.
No repeated paper, Slice4, or already-accepted implementation reviews. No source/test repair was needed.

- Reviewed implementation committed as `005a4f37cd8279c57f58063613c45e51e9733ba8`, with the 17 explicit
  candidate paths. Staged diff check PASS after Entry9's documentation whitespace correction.
- Literal fresh clone: `git clone --no-local --branch codex/m5-2-slice-5
  /Users/jonathanavni/Documents/Coding/tinyvault /private/tmp/tinyvault-slice5-integration/exact-clone`.
  Clone HEAD verified as exact candidate005a4f3; clean worktree. `--no-local` uses Git object transport,
  rather than copying an uncommitted working tree or relying on local object hardlinks.
- In that clone: `npm ci` exit0 (55 packages); `make browsers` exit0 with host cache access;
  `make test` exit0, 1963 passed plus one expected opt-in skip, final execution audit PASS.
  Initial sandbox `make browsers` stalled in cache-lock retries, was interrupted (exit130), and was
  rerun with host access. No browser-install success is attributed to the sandbox attempt. npm emitted
  install-script approval notices but returned0; full checks ran successfully without changing policy.
- `git switch main` then `git merge --no-ff 005a4f37cd8279c57f58063613c45e51e9733ba8
  -m "Merge reviewed Slice 5 attestation implementation"` produced
  `02929e5ba7f26de05adbd174b67f5f9e4cfb21c6`. `git diff --exit-code 005a4f3 HEAD` PASS:
  the merge tree exactly equals the clone-tested candidate. No conflict or source adjustment.
- On that merged tree, serial `make test` exit0 (1963 passed, one expected opt-in skip; execution audit
  PASS), then `make test-docker` exit0 (5/5, no skip; execution audit PASS). Browser suites ran serially.
  Both trees remained clean after execution; full candidate/merge diff still empty after Docker.

### Exact report identities

Raw reports copied outside the checkout into `/private/tmp/tinyvault-slice5-integration/` under the
stage directories below. Each JSON's success flag and counters checked; no failed assertion.
The sole main-partition skip is the gate's expected opt-in eval identity; the execution audit checked it.

| Stage / partition | Passed | Skipped | JSON SHA256 |
| --- | --- | --- | --- |
| clone-gate / main | 1948 | 1 | `4f997953e708cdf6db9299ccb828d64a2a31be25039082afdc54138151de6d71` |
| clone-gate / timing-1 | 5 | 0 | `aec346c823112ac4ca58d1b057d51c536b17ef93007de88b68cd00db539446c9` |
| clone-gate / timing-2 | 10 | 0 | `bb783b6053b96b4ef4e9515e902fb4a9b34b8b87012a5280c9aaa908d7732260` |
| merged-test / main | 1948 | 1 | `97e938eec619c199d74507224798765bbc7b5f47b239c76845bf674738b1df53` |
| merged-test / timing-1 | 5 | 0 | `7a29b37535ca4e1538e3f16ac28366fd40c9db65436c14e13b47a8388fb1f2af` |
| merged-test / timing-2 | 10 | 0 | `8355193a25cd13d9d57f3a288cf4b63f1837ed08a6f507cbd6a397241c25b19b` |
| merged-docker / docker | 5 | 0 | `1c8e0ebd350c189f80642efa9c9c20fae34314c579eb6d958db96fbdb099e025` |

Each `make test` also passed typecheck, dependency/invocation/Compose checks and their selftests,
Acceptance J and final execution audit. These are full command-path gates, not counts substituted from
worker summaries or prior candidate runs. Raw reports and summary.json files are temporary;
this entry preserves the durable results and identities.

### Live Docker evidence and limits

The same composed test exercised v2 artifacts across all fixtures, same-key cross-fixture rejection,
actual browser capture and persisted offline adjudication, plus pre-existing-container refusal without
teardown, killed-exec/no-reconnect, and Compose override detection. Project cleanup assertions passed.
Fresh `slice4-probe-metrics.json` and `slice4-runner-metrics.json` (legacy filenames) both had complete:true
and modification times after this Docker gate's start. Copies are in the merged-docker evidence directory.

| Measurement | Probe case | Persisted browser-run case |
| --- | --- | --- |
| Registration through attestation, ms | 14.2 / 23.6 / 11.5 | 343.4 / 159.6 / 128.7 |
| Export duration, ms | 90194.3 / 90344.0 / 90361.0 | 4070.3 / 4073.6 / 4036.4 |
| Exec stderr bytes per bridge | 26 / 26 / 26 | 26 / 26 / 26 |
| Export stderr bytes | 0 / 0 / 0 | 0 / 0 / 0 |
| Scanner count | 579 | 21 |

Each registration-through-attestation observation is below60s; each export is below120s.
The browser-run case recorded zero normal409 responses. Probe teardown totaled272368.5ms across its
work; that aggregate is not the per-export120s bound. Preserve this distinction when citing timings.
These checks establish the locked composed/caller behavior, not independent capture authenticity,
compromised-fixture containment, Docker-daemon non-exposure, or absence of every future timing failure.
Entry8's schema-guard attribution and prior Slice4 residuals remain unchanged.

### Continuity and disposition

After these gates, owner changed only PLAN.md, docs/README.md and this register to record acceptance.
No source/tests changed after independent review, exact-clone verification or merged-tree tests.
The final documentation commit records evidence over merge02929e5; it does not replace that tested SHA
or claim a separate full gate for documentation-only text. Final diff hygiene and source-tree comparison
cover the documentation checkpoint. All workers, reviewers and test commands have stopped.

**Not run:** Slice6, whole-M5.2 milestone-close assessment, push and release; outside this authorization.
No mandatory Slice5 integration gate remains pending.
**Deviations From Handoff:** none in scope, behavior or required gate order. Browser setup required host
cache access; documentation ledger whitespace was corrected before the candidate commit as Entry9 notes.

## Entry 11 — 2026-09-06: push verified and session closed

User explicitly requested “Let’s push.” `git push origin main` exited0, advancing origin/main from
`dc0796fa8616548c6fa61315fed4b2b9bde97620` to
`73bd015bcf20ae226d7f480ef57292b2bbc539a3` (accepted Slice4/5 work and continuity records).
`git ls-remote --exit-code origin refs/heads/main` independently returned that exact SHA;
`git rev-list --left-right --count origin/main...main` returned0/0; working tree clean.
This supersedes prior pending/no-push authority statements for the completed push only.

User then requested the full tinyvault-wrapup and a fresh-session continuation. Codex closes ownership,
archives the completed Current State, and leaves the next scope at Slice6 planning under row6 / D6 / K,O,P.
No Slice6 implementation or release is implied. All reviews and acceptance gates remain accepted;
no workers, reviewers, mutations or tests are running. Only continuity documents change at wrapup.

Not run during wrapup: repeated test/review gates, because source/tests are unchanged and their exact
accepted results are Entry10. Verification: documentation diff hygiene and source-diff exclusion.
Deviations From Handoff: none. No user-global memory was changed.


### M6-AM12 historical-command mapping (owner-appended 2026-09-08 at merge `623a8b7`; prepared by the AM12 implementer)

AM12 historical-command mapping (2026-09-08; existing evidence and lines 939–959, 1207–1232 retained): substitute these current selectors/guards when reproducing the old cap-bound mutations on the AM12 candidate. Historical logs continue to certify their historical values, not the AM12 candidate.

| Historical selector / mutant | Current selector / guard |
| --- | --- |
| `accepts exactly 131072 raw bytes and refuses 131073 before signing` (raw producer) | `accepts exactly 1048576 raw bytes and refuses 1048577 before signing`; remove `eventsBytes.byteLength > MAX_EVENTS_BYTES` producer guard |
| `direct attestation verifier refuses independently signed 131073 raw bytes with a 131072 positive` (raw consumer) | `direct attestation verifier refuses independently signed 1048577 raw bytes with a 1048576 positive`; remove the verifier's `eventsBytes.byteLength > MAX_EVENTS_BYTES` guard |
| `direct shared fixture accepts 131072 bytes and consumes a separate 131073 refusal before signer entry` (fixture cap; consume-after-success) | `direct shared fixture accepts 1048576 bytes and consumes a separate 1048577 refusal before signer entry`; fixture guard uses `MAX_EVENTS_BYTES`; the consume-after-success mutation must retain that imported-cap guard while moving only consumption |

Use `npx vitest run testbed/fixtures/shared/eventsDigest.test.ts -t '<current selector>'` for the two codec selectors and `npx vitest run testbed/docker/slice5.attestation.test.ts -t '<current selector>'` for the fixture selector. For each experiment retain the full native report, isolated mutation, uncommitted-file snapshot/hash, exact restoration and subsequent green result. No existing register claim or evidence file is overwritten.
