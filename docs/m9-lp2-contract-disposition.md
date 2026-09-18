# LP2 prerequisite disposition: MCP admission and continuous coordination

> **Current disposition — 2026-09-18:** The user's final [M9 Entry156](m9-review-findings.md#entry156--2026-09-18-user-directed-abandonment-and-claude-handoff) supersedes pending calibration/continuity and broad V1 launch obligations below. LP2-CONTINUITY, LP3, AM/AP/AS and normal route N are abandoned residuals, with no further work. Prior contracts, counts, caps and failures remain historical evidence. V1 is now the [manual operator smoke](onepassword-setup.md#v1-manual-operator-smoke-test); natural expiry, Linux and denial-format classification are limitations. Claude owns the next session. The historical text below is not authorization to resume abandoned work.

Status: **LP2-MCP ACCEPTED_FAKE_ONLY 2026-09-17 (Entry98); LP2-CONTINUITY pending.**
Current owner acceptance is conditional on `/private/tmp/tinyvault-m9-lp2-mcp-20260916/owner/fake-only-acceptance-20260917/final-verification.json` PASS. Original adopted split and requirements below remain authoritative; historical paper preparation text is preserved.
Owner: `2026-09-16-lp2-contract-codex` (Codex GPT-6 Astra). Repository base/head:
`54fd025ec1d0f17dba8f440dc862711e5b829ce5`. Entry77 preparation, after Entries90/90a/90b.
The user approved this scope/admission disposition and the full ladder ("yes, please proceed").
Implementation remains gated on a complete bounded packet and its fresh independent paper review. Old candidates, contracts, findings and caps stay closed.

## 1. Objective and success criterion for this paper step

Select an honest admission contract for testing the built MCP path and identify precisely which
continuous-coordination claim remains unavailable. Success is a reviewed, explicit decision about
scope and admission, with a finite next implementation packet possible without silently modifying
FA1 or claiming permission success. This document does not claim that an implementation packet,
new executable, new failure-accounting proof or new live qualification already exists.

## 2. Verified conflict

LP1 contract §9.1 defers MCP because its card sequence stops at the blocked negative controls and
none of its accounting-unit cases reaches MCP. FA1 has exactly106 rows,25 admin identities and27
cases; its contract hash, schema and sequence are pinned. Its only scopes are `card-prefix` and
`accounting-unit`. Unit preregistration is not observed execution and does not create new cases.
Its in-memory MCP projection witness is explicitly not an admitted normal launch.

The underlying foundation `schedule.mjs` supports an exact contiguous `isolated-segment`; that
API does not grant the FA1 recorder a third scope. The eight MCP rows are contiguous:
`MCP.list`, `MCP.C`, `MCP.C-exhausted`, `MCP.setup`,
`MCP.C-still-exhausted`, `MCP.repeat-list`, `MCP.masked-snapshot`, `MCP.eof`.
The first two reserve2 CLI invocations each; the remaining six reserve0, for4 total reservations.
MCP observations must retain `observedCli:null`; backend policy/secret/probe counts are invisible.
FA1's MCP-specific predicate enforces null `observedCli` only: a CONFIRMED completion may carry a
scalar `observedMethods` integer0–8. **New LP2 requirement:** the new scope's accounting projection imposes
`observedMethods:null` as well, with a new predicate and mutant. The new scope uses these two null
scalar fields plus a separately named `publicRequests` map keyed by literal MCP tool name and an
explicit EOF fact. It does not adopt the foundation's `actualMethods` map or call public requests
backend observations. Canonical MCP ordinals are66–73.
The public request/EOF counts and source-derived reservation bounds are different evidence.

The older driver already exercises a fake-only nonnegative schedule, skipping both blocked rows.
That is historical offline driver evidence, not FA1's durable failure-accounting integration or
continuous execution of an accepted full card. Copying its skip into FA1 would change the contract.

Existing work is substantial: `src/mcp-domain.mjs` already binds the eight rows to the real built
MCP process, generated fake CLI, public browser controls, protocol checks, ingress scanner, EOF
and cleanup observations; `src/driver.mjs` supplies its dispatcher. Entry76 records the accepted
narrow successful synthetic-path checkpoint: candidate `efb425221b0c7c08019b462b418fa47972ce8b4544a800017c6a00622fe8ea4f`,
65/65 focused tests including4 MCP tests, the17-domain fake rehearsal,31 mutants, and final Astra,
Opus QA and Opus security PASS at their closed round3 cap. These are recorded historical results,
not fresh execution or inherited LP2 acceptance. Entry76 explicitly lacks MCP scanner-call deletion,
actual child-output injection and overlap witnesses; its scanner proof was direct to a shared
helper. Failure provenance and cleanup/TOCTOU limits remain. The new work is durable admission,
reservation, replay and report integration around that existing transport, plus the identified
actual-path proofs and new per-row fixture accounting, not building MCP transport from scratch.

Evidence roots (read-only):

- LP1: `/private/tmp/tinyvault-m9-lp1-caller-binding-20260915/owner/lp1-contract-final.md` §9.
- FA1: `/private/tmp/tinyvault-m9-lp4-operator-qualification-20260916/fa1/candidate/`
  (`accounting.mjs`, `contract.json`, `README.md`), package `319dccff13d4eb6d04d5551477731ea8643f265aa76c932cf1936b6708ab368c`.
- Foundation: `/private/tmp/tinyvault-m9-v1-readiness-20260914/src/schedule.mjs`.
- Driver: `/private/tmp/tinyvault-m9-v1-next-20260914/src/{driver,mcp-domain}.mjs`.
- Canonical card: `docs/m9-acceptance-approval.md`, built MCP and finite reservation sections.

## 3. Recommended disposition D-LP2-MCP

**Split LP2 into LP2-MCP first and LP2-CONTINUITY still pending.** Authorize designing a new,
separately identified fake-only isolated MCP accounting package. Do not mutate FA1, add a hidden
FA1 case, forge prerequisite completion, skip blocked rows in a card attempt, or splice reports.
The new package may reuse reviewed algorithms by copying with provenance; any changed admission,
replay, report or scanner behavior receives its own proofs and independent review. It must never
present itself as the unchanged FA1 artifact or inherit FA1 acceptance merely through copied code.

The sole positive normal scenario is the exact eight-row MCP segment above. Fixture construction
is synthetic setup, not 15 observed operator actions or completed prior card rows. All preceding
and following canonical rows remain outside this segment. Both negative controls remain BLOCKED.
No provider operation, operator receipt under the account home, real account root, installed `op`,
private configuration or actual administrative command is needed or authorized by this design.

Affirmative prerequisites are the existing bundle at
`/private/tmp/tinyvault-m9-clean-clone-20260914-01/repo/dist/tinyvault-mcp.mjs`, the existing
Playwright/Playwright-core tree in that clone's `node_modules`, the existing Chromium/headless-shell
revision1234 tree under the sibling `browsers/`, and pinned Node24.19.0. The owner computed SHA256
from the on-disk bundle bytes on2026-09-16, independently matching source pin
`fbf0101772bf31d389767afba1173936d34debe864295ceb80536db4f295d4d7`; this is not fresh build or
runtime qualification. Read-only hash evidence: `/private/tmp/tinyvault-m9-lp2-contract-20260916/owner/mcp-bundle-read-hash.json`.
Before implementation, reverify the full selected dependency/source pins.
This disposition requests no installation, rebuild or preservation copy. If any required input is
missing or drifts, stop and report the concrete replacement/preservation need for separate
authorization; do not silently download, rebuild, repin or treat a temp-path copy as qualified.

The new scope is `offline-mcp-segment`, with its own contract/package/schema identities and
durable journal, inspector and failure report. Proposed fixed normal command mode: `--offline-mcp`;
no arbitrary segment selector, row list, executable/config path, callback or fault via CLI/env.
Exact launch bytes, new external root, file allowlist and executable/config/browser/source pins
must be locked in the implementation packet after this disposition. This scope decision alone
does not dispatch an implementation worker.

Why this cut: it integrates the existing MCP caller with new durable accounting without depending
on permission classification, and keeps the new admission/replay proof finite. Existing transport
reduces the work for both alternatives; actual-ingress, per-row accounting and cleanup proofs
still need the later package's evidence. It does **not** close LP2.

## 4. Mandatory constraints on the later LP2-MCP packet

1. **Identity and prerequisites.** Pin all executable inputs and exact generated fixture/config
   grammar; positive execution is the real built `tinyvault-mcp.mjs` behind the real backend and
   the package-owned fake CLI. A fresh synthetic fixture is declared seeded, not an observation
   of Q/F/removal/permission/admin prerequisites. Preserve canonical row IDs and ordinals. Reports
   contain no real tokens, account identifiers, native raw output or token-derived fingerprint.
2. **Reserve before delegation.** Persist/fsync the exact row reservation before its first public
   request. One row and request at a time; no retries, refunds, replacement domains or recycled
   capacity. Charges survive failures. The segment cap is4 CLI reservations (2+2+six zero rows),
   not4 dynamically observed spawns and not a new allowance for a future card. Verification
   campaigns are separately counted, never concatenated into one attempt. The segment has no FA1
   admin transition: fixture setup/teardown is outside card administrative accounting; no four
   full-card cleanup acknowledgements are run. Report segment admin charges as0/out-of-scope,
   never as observed provisioning or revocation. Any `wholeRunConsumedReservations` field is null;
   segment reservation lower bounds are separately named and cannot become whole-card totals.
3. **Transport and browser operations.** Define every public call, including browser open/navigate
   controls inside each row, its ordering and failure attribution. Use a fresh unlocked control
   for exhaustion. Snapshot occurs after repeat-list, on the filled session. The client accepts
   only the pinned protocol envelope/IDs and one complete result per request; reject duplicates,
   unsolicited replies, trailing/incomplete bytes, oversize frames, wrong metadata and unexpected
   stderr. Instrumentation must not change production behavior or expose hidden backend methods.
4. **Replay and failure accounting.** The inspector independently reconstructs the exact segment
   from bounded canonical journal events. Durable reservation without a completion stays UNKNOWN;
   malformed, missing or contradictory evidence never means zero work. Reject reordered/duplicate
   rows, completion before reservation, zeroed charges, forged scope/prerequisites, observed MCP
   counters and out-of-segment actions. A journal-storage failure closes admission before another
   request; preserve valid prefix lower bounds where justified, otherwise null/unknown.
   The new null-scalar-methods predicate requires a named hostile completion carrying numeric
   `observedMethods` and a predicate-deletion mutant; copied FA1 code does not supply this rule.
5. **Privacy at actual ingress.** All complete and partial stdout/stderr bytes, parsed results,
   JSON-escaped values, failed-run artifacts and retained logs belong to a closed surface inventory.
   Bound buffers; never emit raw offending bytes. Require actual child-output positive controls
   and scanner-call deletion mutants, including split chunks, missing newline and malformed JSON.
   A pure direct call of a scanner helper is not the MCP ingress proof. Synthetic fixture secrets
   remain trusted local inputs; release surfaces contain only closed booleans/counts/enums/digests.
6. **Lifecycle and publication.** Define startup, per-request, EOF and outer deadlines and their
   effect on admission separately from cleanup completion; no timeout-only bounded-return claim.
   Track owned child/group exit, browser closure, backend temporary-directory removal and fixture
   shutdown independently. Publish success only after normal EOF, required cleanup and scans.
   If cleanup/terminal-write itself fails, emit only a fixed bounded failure status, never success.
   No killing arbitrary PIDs or walking account home. Same-UID hostile filesystem handling must
   have an explicit threat model; inheriting LP4 names does not inherit its closure proof.
7. **Mandatory offline corroboration; no promotion to live evidence.** The new package must bind
   fake-CLI records to each admitted row and prove recorded invocations do not exceed that row's
   reservation, including zero invocations for every zero-reservation row. The positive run must
   have exactly VERSION+LIST at `MCP.list`, DETAIL at `MCP.C`, and none elsewhere; no PROBE is
   issued by the normal MCP block. Missing/duplicate/unattributable records or out-of-row activity
   are unknown/invalid evidence and prevent success. Name a real-child extra-call positive control
   and a bound-check deletion mutant in the packet; check through EOF/cleanup, not just at reply
   arrival. The packet must specify record completeness, trustworthy attribution, quiescence and
   missing-record detection; an empty file is not proof of zero calls. A violation stops further
   admission and rejects the attempt; it cannot undo a call already made. This is a mandatory
   fake-only corroboration gate, not runtime prevention or a live provider observation. The4 CLI
   reservations remain source-derived bounds; this fixture detector does not silently carry into
   any future live card. Per-row corroboration is a distinct canonical journal/report fact named
   `fixtureCliCorroboration`, carrying row identity, closed invocation-class counts and a closed
   integrity/quiescence verdict. The inspector replays and validates those facts against row bounds
   and the pinned positive command distribution before segment success; missing/invalid facts
   force UNKNOWN/invalidity, never implicit zero. The packet must define exact schemas and prove
   that those facts bind the actual record evidence; a caller-supplied PASS boolean is insufficient.
   Records never populate MCP's null dynamic counters. Keep private
   browser equality evidence separate from an MCP success response. Pin how the actual assignment
   witness is collected without exporting a secret or adding uncounted public operations.
8. **Closed claim schema.** `fullCardCompletion:false`, `continuousCardExecution:false`,
   `cardCompletion:"NOT_A_CARD_RUN"`, `liveCoverage:"NONE"`, `permission:"BLOCKED"`,
   `fullCard:"BLOCKED"`, `providerRelease:false`; all V1 readiness fields
   remain null and unsuperseded. Keep all four blocker IDs verbatim: `FAKE_ONLY_BINDINGS`,
   `LIVE_ADMIN_FAILURE_PROVENANCE_UNQUALIFIED`, `PERMISSION_CLASSIFIER_UNAVAILABLE`,
   `NATIVE_REMOVAL_ATTRIBUTION_UNQUALIFIED`. Only `FAKE_ONLY_BINDINGS`
   may be annotated as narrowed by this package after acceptance; no blocker is removed.
   LP4's HUMAN and INSTALLED_PROVIDER_BINARY exclusions remain unchanged. A complete isolated
   segment is never a complete V1 card or proof of live administrative failure provenance.
   The new manifest's blocker block is explicitly a **cumulative evidence ledger**, not a claim
   that this MCP segment exercised earlier packages. On acceptance only, it preserves
   `narrowedBy:["LP1","LP1b","LP4"]`, adds `"LP2-MCP"`, and references the prior package identities
   and Entries88–90b separately from the current run. Its note is: "Prior LP1/LP1b/LP4 evidence:
   host and admin callers real, CLI fake; unit cases through the same callers; receipt root resolved
   from the OS account record and receipts written by an external process (LP4). LP2-MCP evidence:
   isolated production MCP caller bound to durable offline accounting, CLI still fake. These are
   separate package qualifications; continuous card and live MCP/provider qualification absent."
   Current-run admin charges remain0/out-of-scope; historical receipt qualification never becomes
   a current-run admin observation or permission to recreate an account root.
   Only the new manifest removes `MCP_BINDING` from `notInPackage`, paired with the explicit
   `mcpBinding:{offline:"QUALIFIED_FAKE_ONLY",live:"UNQUALIFIED"}` limitation. It retains
   `CONTINUOUS_COORDINATION`, `UNIT_ZERO_CASE` and `EXECUTABLE_CONFIG_REPORT_BINDING` there.
   Frozen LP4/FA1 manifests remain unchanged; before acceptance no narrowing is claimed.
9. **Fresh ladder and proofs.** Lock exact file ownership, fixture grammar, journal/report schemas,
   resource caps and named behavioral mutants before coding; then fresh Claude paper review,
   bounded fresh-context Astra implementation, owner verification, Claude QA, separate Claude
   security and fresh Codex adversarial review. Fix loop maximum3, no reset of any old cap. Required
   witnesses execute the normal caller/child path; helper-only passes and environment refusals
   cannot count as mutation kills. Missing host/browser gates remain explicitly unrun/blocked.

## 5. Continuous coordination remains an explicit decision

After LP2-MCP, LP2-CONTINUITY still needs its own bounded contract. A candidate offline route is
one continuous Q-through-end suffix in a single synthetic world with declared seeded setup,
preserving actual Q-to-removal and F-to-K state identity. That has92 canonical rows,95 reserved CLI
invocations and14 domains, and includes MCP. These are schedule-derived candidate scope numbers,
not an approved attempt or an assertion that existing FA1 can admit it. It requires complete admin,
failure, timing, teardown and replay design, with exact cleanup accounting to be derived and reviewed.

Such a suffix would still omit the two blocked negative controls and P-to-Q continuity. It cannot
be merged with a prefix run into full-card evidence. Genuine continuous full-card admission stays
blocked until LP3's separately reviewed command/classifier requirements and the remaining live
prerequisites are satisfied. We do not call LP2 complete merely because the isolated MCP cut passes.

`EXECUTABLE_CONFIG_REPORT_BINDING` stays separately unassigned. Per-package pins required for safe
offline testing do not close that final release-package binding obligation. No current M9 acceptance,
provider, natural-expiry/Linux, live-cohort, accounting-follow-up or release gate is superseded.

## 6. Alternatives and decision requested

- **Recommended:** accept D-LP2-MCP's explicit split and new isolated admission identity; proceed
  next to the fully bounded implementation packet and its paper gate. Continuous coordination
  remains pending and visible. No source or frozen artifact changes are requested by this paper step.
- **Larger offline contract now:** design the continuous suffix first, including MCP and the complete
  admin/failure state machine. This is feasible in principle but requires a substantially broader
  new admission/replay contract; no present implementation or acceptance is implied.
- **Defer LP2:** retain the existing historical MCP transport evidence while deferring the new durable
  accounting integration until LP3 and a genuine full-card contract are ready. This preserves the
  current claims but leaves MCP caller/failure-accounting integration unqualified.

Do not choose a fourth implicit alternative of calling negative controls successful in a synthetic
full-card mode. That would require another expressly reviewed and approved claim and admission model.

## 7. Evidence limits and preparation record

This proposal derives from read-only source/contract inspection. No runtime, test, mutant, browser,
MCP, provider or calibration execution was performed to prepare it. Historical evidence remains
attached to its original candidates. Paper review of this disposition is not implementation approval
and does not substitute for reviewing the eventual complete packet. Current paper outcomes and
dispositions will be appended to the M9 register; earlier entries are preserved byte-for-byte.

Paper dispatch2026-09-16: both the sandbox attempt and normal host retry terminated before review.
The helper correctly rejected a synthetic assistant event (`Unexpected assistant model`); the
underlying CLI error in both was `Failed to authenticate: OAuth session expired and could not be
refreshed`. Neither attempt supplied a verdict or consumed a substantive paper-review round.
Evidence root: `/private/tmp/tinyvault-m9-lp2-contract-20260916/`, directories `claude-plan-r1`
and `claude-plan-r1-host`. All pinned draft/source inputs remained unchanged across both attempts.
After login restoration the fresh retry completed as pinned Claude Opus5, session
`1fe4a423-e102-4aa3-b1b6-10ab07293ab9`, candidate digest
`a81cb83ccff175a65d0dcd9f92e34faae424e014ccfb09795b467c05b721fc5a`, NEEDS-ATTENTION.
Round1 supported the split but raised F1–F6: existing transport/evidence, mandatory per-row fixture
bound checks, new null-method predicate/vocabulary, affirmative prerequisites, explicit manifest
dispositions and reservation-list wording. All are incorporated above; the literal verdict is
preserved. Focused round2 completed NEEDS-ATTENTION, session
`2eaaaacb-e038-46f9-8682-a0ac127cd217`, candidate digest
`8d9d47b5e4e6bbae2aafc7fd845545bf85730b2f0a0aaf0a58aaa78d976ffe76`.
It confirmed F1–F6 absorption and identified N1 cumulative-versus-current manifest provenance,
N2 the replay home for corroboration, N3 hash attribution, and N4 the pending append-only register
update. The owner corrected N1/N2 and the F3 pronoun; N3's assumption that only a source pin was
read is incorrect, so the direct byte-hash evidence is now explicit. Entry91a appends both verdicts,
resolving N4 without rewriting Entry91. Final scoped round3 completed **PASS**, session
`6dc046cc-67c1-42a4-97f3-511cafefc3ac`, checkout inventory digest
`98f75fb76952993fe58e448bea62c08c83a71149b8efe1a36eaaca75a7238cb1`.
All N1–N4 are closed at paper level; no new decision-level defect. Exact reviewed proposal SHA256
`2247fc54a6ccffdd4c60313c8051127158893fa46ff3576106a0ef8a8caf12f4` is retained in
`owner/proposal-r3.md`; these are different digest subjects, not conflicting identities.
The helper inventory binds that file hash, and the owner rechecked every pinned input unchanged.
Entry91b records the verdict, precision notes and deferred integrity proof. Only status/history
metadata changed after review; §§1–6 remain byte-identical. Read-only Sol research
remains supporting research, not an independent Claude verdict. No code or test execution follows
from paper review.

Deviations From Handoff: none in preparation authority. The LP2-MCP/LP2-CONTINUITY split is a
scope disposition explicitly adopted by the user on2026-09-16; earlier proposal/review snapshots remain preserved.


## 10. Isolated MCP package acceptance — 2026-09-17

Owner accepted the section5a fake-only ledger after completed execution evidence, complementary independent candidate reviews, M14 reaching supplement, helper corrections and fresh lineage audit. Source `f7a5674cf2fac3bcbfa2632023d62be1ead154060f1ae8597e3c79db5d7594ab`, inventory `5fff3fde91cce56d9e3073a82a89c2bf1362bd8568be0627aad44abe68ea9334`; optional `candidate/bindings.json` SHA256 `37a28e9b83c447668bfa82fc1334dd8632edea84893f2a203fedbfc7d4af6c5f`. Exact primary evidence and residuals: `owner/fake-only-acceptance-20260917/acceptance.json`, `lineage-index.json`, `lineage-audit.md`, `dispositions.md` and mandatory final-verification.json. See register Entry98. No historical report relabelled; no runtime/candidate source changed.

MCP_BINDING is qualified only for isolated production-MCP/fake-CLI scope. Continuous suffix needs its own newly reviewed contract and implementation; draft at `/private/tmp/tinyvault-m9-lp2-continuity-20260917/owner`. Four V1 blockers, null live fields, installed-provider/HUMAN exclusions and executable/config/report binding remain. LP2 as a whole and M9 are not complete.
