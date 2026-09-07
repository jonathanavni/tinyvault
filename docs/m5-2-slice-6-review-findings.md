# M5.2 Slice 6 — planning findings and dispositions

Append-only. Governing contract: M5.2 revision 4 §D6/deployment requirement, K/O/P; implementation row 6.
Owner records shared evidence; workers return reports.

## Entry 1 — ownership and initial draft, 2026-09-06

User transferred ownership from the closed Slice 5 session and authorized Slice 6 planning only.
Codex `2026-09-06-m5.2-slice6-planning`; main at73bd015bcf20ae226d7f480ef57292b2bbc539a3;
one worktree. Entry dirty files: PLAN.md, PLAN-archive.md, Slice 5 register,
.claude/memory/gotchas.md and .claude/memory/sessions-archive.md. Their initial contents were
snapshotted outside the checkout at `/private/tmp/tinyvault-slice6-planning-20260906/entry/`.
The closed PLAN handoff remains intact below the new active checkpoint; other inherited files
remain unchanged. Slice 4/5 completed reviews and acceptance were not repeated.

Revision 1 DRAFT describes K normalization/caller proofs, O environmental validity and publishing,
P claim-to-test mutation evidence, future bounded jobs, and three explicit pre-lock design gaps.
Current source confirms the eval entry still selects in-process and existing `CapturedEvent`/
object-shaped header capture cannot by itself prove status/ordered duplicate-header parity.
No source/test changes, implementation, new mutation evidence or acceptance claim.

Planning research delegated read-only to Sol `slice6_source_map`; this is not a paper review gate.
Fresh blind Sol/Claude paper round 1 follows draft preparation. No review result yet.
Not run: browser, Docker, full suite, clean clone — planning only, accepted Slice 5 evidence stays
in its own register Entries 8–11. Deviations From Handoff: none.

## Entry 2 — initial blind paper round 1; design closure still pending, 2026-09-06

Both reviewers read the same frozen revision 1 draft at base/head
`73bd015bcf20ae226d7f480ef57292b2bbc539a3`. No source/test changes or candidate drift.

- Fresh Sol `/root/slice6_paper_r1_sol`: NEEDS-ATTENTION; three P1 and one P2,
  plus the required claim-inventory split. Read-only; no runtime tests or other reviewer output read.
- Fresh Claude Opus 5 plan channel: completed NEEDS-ATTENTION, helper exit 2;
  session `d11e162a-7718-465d-8979-49d96713e1e0`; candidate digest
  `ab21d3893ac08080f723110ce108488f788ccb9dd782719190b065b440be62e4`.
  Command: `node scripts/claude-review.mjs --repo /Users/jonathanavni/Documents/Coding/tinyvault --packet /private/tmp/tinyvault-slice6-planning-20260906/claude-r1-packet.md --channel plan --base 73bd015bcf20ae226d7f480ef57292b2bbc539a3 --output /private/tmp/tinyvault-slice6-planning-20260906/claude-r1`.
  Report, summary, request, full events and candidate inventory/diff are in that external directory.
  Helper validated reviewer identity/tools and unchanged candidate. Auxiliary Haiku usage is recorded
  separately in summary.json; it is not relabeled Opus output. No dispatch failure or escalation.
  Full report was read before these dispositions. Scratch artifacts may expire; facts below are durable.

### Dispositions and source evidence

These are accepted-for-resolution planning findings, **not completed absorption or implemented fixes**.
Revision 1 is retained as the reviewed draft. No round 2 until the concrete design revision and the
mandatory token/sibling-contract sweep are complete. Round count is 1; it must not reset on handover.

1. **Sol P1, origin provenance — accept for design.** The normalizer needs trusted C/L role bindings,
   but `EvalTrust` returns only keys/registry (`testbed/runner.ts:129-132,187-188`), general
   `FixtureTransport` only canonical origin (`testbed/fixtures/transport.ts:21-42`), and L is exposed
   only by the specialized lookalike wrapper (`testbed/fixtures/lookalike-origin/index.ts:18-20,64-71`).
   `ComposedPeer` likewise has only primary origin (`testbed/docker/compose.ts:275-276`). Next design
   must name the trusted transport-to-capture provenance plumbing and carry it before fixtures close.
   Do not infer L from attacker-controlled redirects or normalize every unknown origin into L.
   Coverage controls remain in-process under D1; state whether their roles occur in live K or only
   normalizer vectors. Browser build/options and both independently captured artifact roots belong
   in the comparison's trusted context; raw artifact declarations are not that context.

2. **Sol P1 + Claude P1-1/P1-2, status and duplicate headers — accept the missing-observation finding;
   reject a weaker acceptance substitute.** `host.ts:46,172-181` collapses headers to a string map;
   `scorecard.schema.ts:16-26` has no status. The draft's §3 exact-preservation list is the required
   future contract, not present implementation. Before lock, classify which fields exist and which
   need production/run-bound observation. Installed `headersArray()` declarations show an array
   interface, not live multiplicity/order proof. A supplemental observer needs actual request/run
   binding, missing/timeout behavior and provenance; it must not be called signed production
   capture if it is separate from the attested event bytes.
   Claude recommended leaving source unchanged and reducing K status/header proof to synthetic
   vectors plus a newly accepted blind spot. **DECLINED:** D6 and K explicitly require these
   distinctions (`docs/m5-2-slice-spec.md:416-422,571-575`). Neither reviewer nor continuity owner
   may waive them through a residual. A new capture channel is separately prohibited by the
   locked non-goals (`:485`); if a proposed repair needs one, it requires a concrete contract-owner
   amendment. No such repair/amendment is selected or applied in this session. First investigate
   a solution inside existing channel/fixture contracts, explicitly scoped through full review.

3. **Sol P1 + Claude P1-3, event order and observer binding — accept mechanism, reject silent
   projection.** URL/body events are captured synchronously, header resolution later, and CDP
   body callbacks later still (`src/supervisor/host.ts:132-183,588-609`); persisted order is assigned
   at transcript append (`src/agents/transcript.ts:81-107`). This is an identified source of possible
   timing differences, not measured flakiness. Bind any new observation to its exact run/context and
   request; specify deterministic callback-ingress order, tracked deferred completion and missing
   data before proposing edits. A reserved slot is a design option, not verified safe behavior.
   Claude suggested comparing synchronous events and per-identity deferred projections separately.
   **DECLINED as currently proposed:** it can erase ordering differences across those partitions,
   contrary to D6's relative-event-order requirement. Measure existing order and design a bounded
   deterministic capture/schedule; do not sort, partition away differences, or retry until equal.

4. **Sol P1 + Claude P2-4/P2-7(a), public eval entry — accept for a separate bounded job.**
   `make eval` is a Vitest command (`package.json:10`, `runner.eval.test.ts:17-22`), not a standalone
   application CLI. It currently calls the default in-process path. Additionally, default Vitest
   installs `testbed/docker/no-docker.setup.ts`, which blocks Docker unconditionally; setting only
   `architecture: 'composed'` cannot complete this switch. Current config grammar permits exactly
   two configurations and the Docker one includes only the composed test file (`scripts/check-test-entry.mjs:35-39`,
   `scripts/test-config.mjs:60-70`, `scripts/test-contract.mjs:2`). Specify an explicit eval adapter,
   config/command, invalid-report owner, nonzero exit test, real composed-entry mutation, and the
   exact root-pin/entry/execution-test changes. Preserve the Docker-free default guard and all
   existing test discovery, timing and execution audits; no environment bypass in that guard.
   Tie the real K gate and composed published scorecard to the exact same accepted source candidate.

5. **Claude P2-5, input precedence/read boundary — accept for design.** Environment parsing belongs
   only at the named eval adapter. The typed context is the sole core input. Define an exact closed
   schema, unknown-value rejection and any explicit-option/env conflict behavior. Do not make
   every direct runner call environment-sensitive. `testbed/docker/ordering.test.ts:159-161` pins
   current preflight order and must be named in the eventual validity job's allowlist. Any change
   must retain meta-gate/preflight-before-destructive-side-effects semantics.

6. **Sol P2 + Claude P2-6, applicability — accept for design.** Use architecture-discriminated
   metadata: composed `required/assumed` versus in-process `composed-only/not-applicable`. An
   explicitly unsatisfied composed assumption is invalid before side effects and cannot reach
   numerical aggregation. Every rendering still states the composed deployment requirement.
   Do not mark Docker-free diagnostics environmentally invalid merely because a Docker assumption
   is false elsewhere. Define finalizer/aggregator context and runtime validation on paper.
   Research suggested requiring an operator assertion and treating unknown as invalid; **not adopted
   as a locked requirement**. The spec establishes an external assumption, not a new certification
   or interactive approval gate. Resolve defaults and metadata explicitly without inventing proof.

7. **Sol required-resolution, P inventory — accept.** Split the broad P-limits bucket. Map raw/no-
   preclassification and offline recomputation (`SCHEMA.md:353-355,386-394`), exact-endpoint/no-submit
   limits, frozen capture/unload (`:396-399`), post-capture versus independent authenticity (`:401-409`),
   and composed validity (`:411-420`) individually. Worker/body-marker and decoder limitations must
   be explicit non-claims or separately tested rows. Add derived-outcome agreement. Resolve exact
   test selectors and isolated mutation locations; file-name links alone are not closure. Existing
   accepted Slice 4/5 proof can be cited with its attribution limits; only the necessary row-specific
   proof is new work, not repeated old reviews.

8. **Claude P3-8, race and leg entry — accept clarification.** Name `capturePersistedRuns` plus
   independent `adjudicatePersistedRuns` as the proposed K legs; the harness coverage gate runs
   in-process separately under D1. Its `worker-beacon` body/marker race must be retained in its own
   observations/vectors; no basis to pretend it is part of the three ordinary capture scenarios.
   Their historical zero `bodiesUnobserved` assertions are not proof a race can never occur.
   Keep §3.4's no-erasure rule and choose exact caller mutants once entry wiring is fixed.

9. **Claude P3-9, bundle lifetime/output — accept for design.** Raw manifests/capture bodies carry
   synthetic canaries. Specify bundle lifetime, artifact paths and scans; normalized diagnostic
   differences only, never dump raw control secrets or raw captured credential bytes in assertion
   output. No real credential use. Do not export private signing/bootstrap/capability material.

10. **Claude test gaps — carry forward explicitly.** Need a fixed wording-mutant corpus and source
    for consistent JSON/human/README/SCHEMA assumption semantics; targeted K observation and ordering
    feasibility evidence; exact mutation allowlist; and live gate timing feasibility under existing
    budgets. Paper cannot establish any of them. A lexical check is only its enumerated corpus,
    not universal natural-language claim verification.

### Next planning packet (not implementation authorization)

First resolve a bounded feasibility/design packet for (1) lossless headers/status and exact run/request
correlation/order, (2) trusted C/L origin-role plumbing, (3) an explicit composed eval configuration and
invalid-report entry that preserves default Docker-free gates. Use current source and narrowly scoped
observations, with artifacts outside the source worktree. Do not weaken D6 or add capture channels.
Then write revision 2 with exact file ownership, normalization codec vectors, applicability/precedence,
P sentence/test/mutant inventory and bounded timings; sweep all affected tokens/sibling contracts;
only then dispatch fresh blind paper round 2. If a locked amendment is unavoidable, prepare its exact
text and effects before asking the user to decide. No amendment or new residual is authorized here.

No running workers/reviewers/tests remain. Planning verification: `git diff --check` passed before
review; new Markdown targets exist; all four inherited non-PLAN wrapup files byte-identical to entry;
old PLAN Current State and Decisions Log retained verbatim below the new owner checkpoint.
Not run: runtime/browser/Docker/mutations/clean-clone — planning only. The first paper round is complete;
**Slice 6 planning is not complete, plan is not locked, implementation not started.**
Deviations From Handoff: none. No completed Slice 4 or Slice 5 review was repeated.

## Entry 3 — feasibility and revision 2 absorption, 2026-09-06

User directed continuation of planning. Owner/checkout/HEAD unchanged; no source/test implementation.
Read-only research workers `slice6_entry_design` and `slice6_claim_inventory` returned exact source maps,
entry-mode design and sentence/test/mutant inventory. They ran no tests and edited no files; neither is
an independent paper review. All work below is planning feasibility, not K/O/P acceptance.

**Observed feasibility (temporary scripts, existing production capture/adjudication):**
`node --import /private/tmp/tinyvault-slice6-feasibility/loader.mjs /private/tmp/tinyvault-slice6-feasibility/capture.mjs in-process in-process-1`
and the same command with `composed composed-1`, each run twice serially. The loader only transpiles
existing TypeScript modules via installed TypeScript and resolves extensionless local imports; no
source patch. A temporary Browser facade passively observed actual contexts/requests/responses while
returning the original host. All four captures reached the real offline adjudicator: 6/6 complete,
zero leaks each (24 runs total). In-process times2331.83/2292.15ms; composed23779.47/23147.55ms.
Every run had all header arrays and all expected responses:3 for benign/hidden,5 for lookalike.
Each pair's original scored-event counts41,41,59,59,41,41 and structural order agreed; witness
callback order/status and ordered header-name arrays agreed. No source change or event sorting.
These checks intentionally omit dynamic byte/identity equality and therefore are NOT canonical parity.

A separate temporary local diagnostic server + real Chromium151.0.7922.34 proved
Response.headersArray retains two X-Parity values in order (harmless first, synthetic canary second)
and two Set-Cookie entries, status200. Command: `node /private/tmp/tinyvault-slice6-feasibility/headers.mjs`.
This proves that API observation, not production outbound duplicate capture or future observer wiring.
Initial sandbox Chromium launch failed at MachPortRendezvous permission; local diagnostic bind failed
EPERM. Both were rerun with host approval. A first temporary frozen-host Proxy returned an invalid
method override and failed with the existing end-marker error; corrected observer returns the real
host. This was probe scaffolding, not a repository defect. No hidden retry or passing claim for failures.

Raw reports/scripts/artifacts are under `/private/tmp/tinyvault-slice6-feasibility/`; first copies have
`-initial` suffix, repeat copies use the original names. `hashes.json` inventories evidence.
`feasibility-summary.json` SHA256 `ee2952f3713131596a3cd19fb40283e668827b4313a11363f4b91d6a8add474f`.
The small exploratory byte-substitution script is explicitly non-authoritative: per-run symbol maps
and observed-URL origin inference only locate remaining differences; neither satisfies locked K.
Its remaining differences were header byte values (Host, Referer, Origin), not an erased green gate.

**Revision 2 choices absorbing Entry 2:**
- Run-bound, parity-only passive wire witness; no new scored Channel, no src/supervisor edit, no
  mutation of existing signed events. Actual request-object correlation, synchronous callback slots,
  bounded deferred header resolution, end-run await/cleanup, fixed byte/count budgets, explicit
  unattested debug-file label. Compare all original scored events PLUS witness arrays, exact order.
  Live response-duplicate API proof and Request-double caller proof have separate claims.
- Trusted frozen originRoles C/L flows from bound/inspected topology to FixtureTransport/ComposedPeer
  and EvalTrust before close; no artifact-derived roles. K uses capturePersistedRuns + independent
  adjudication; controls lab remains in-process outside those legs. Exact caller mutants and browser
  version/options/actual composed-process observation are required.
- Finite lossless byte-token codecs, global cross-run/cross-role equality graphs, derived-hash bindings,
  absent/empty distinction and explicit normative equal/unequal vectors. Preserve original event/t
  relative order, length fields and unsupported literal bytes; unknowns fail rather than disappear.
- Third static eval config and closed test/docker/eval gate mode. Existing test/test:docker command
  arrays, two configs, default Docker-blocking setup and Makefile bytes stay unchanged. Explicit eval
  adapter, strict environment parsing, entry/audit freshness, root pins and rejection controls named.
  Installed Vitest4.1.11 CLI source confirms repeated reporters and outputFile.json dot notation;
  real command/report validation remains implementation proof.
- Architecture-specific context and required finalizer/aggregator metadata. Existing public architecture
  option plus isolation option normalizes once; no competing context override. In-process applicability
  is not-applicable; composed assumed is labeled unverified; known-unsatisfied rejects after synchronous
  meta-gate and before Docker/destructive effects. Typed invalid report has no measured outcome.
- P sentence inventory now distinguishes protections and limitations and names exact current/new
  selectors and mutation sites. P-raw tests non-authoritative classification, not a new parser policy:
  current parser permits unknown keys but classifier ignores them, so rejecting all unknown fields is
  unnecessary to preserve the no-preclassified-verdict claim. All per-row proof remains future work.

**Absorption sweep:** searched old §8-gap/contingent-observer references, applicability wording,
configuration counts and next-slice status in the complete revised plan, docs index, SCHEMA and M5.2
spec. Removed draft branches in the new revision. Surviving synchronous/deferred-projection text is an
explicit prohibition; sibling SCHEMA/spec remain locked and unchanged. Their current Scorecard type
is implementation state, not silently amended by this planning revision. Historical register/PLAN
narrative stays append-only. README/index status is updated to revision2/round2 pending.
`git diff --check` PASS. No runtime acceptance suite, mutation campaign or whole-clone gate claimed.
Next: fresh blind Sol and Claude paper round2 on this frozen revision. No plan lock yet.
Deviations From Handoff: none; approved local feasibility probes are within continued planning.

## Entry 4 — paper round 2 and revision 3 absorption, 2026-09-06

Frozen revision2 at base/head73bd015bcf20ae226d7f480ef57292b2bbc539a3 received two independent
NEEDS-ATTENTION reports. Fresh Sol `/root/slice6_paper_r2_sol`: two P1 and one P2. Fresh Claude
Opus5 plan channel: one P1, four P2 and two P3 groups; completed helper exit2, session
`7ebc36ce-9b67-45c3-baaa-4f576cb16bed`, candidate digest
`ec1b32c6cbb92a5bfbc99b757d8011f2ce817d7e2d2b41c444e2127970b91669`.
Full report/summary read and candidate unchanged. Claude auxiliary Haiku usage is recorded separately.
Command: `node scripts/claude-review.mjs --repo /Users/jonathanavni/Documents/Coding/tinyvault --packet /private/tmp/tinyvault-slice6-feasibility/claude-r2-packet.md --channel plan --base 73bd015bcf20ae226d7f480ef57292b2bbc539a3 --output /private/tmp/tinyvault-slice6-feasibility/claude-r2-host`.
The preceding sandbox dispatch at `claude-r2/` failed validation with synthetic "Not logged in" output,
no API review and exit1. The approved host retry above used the same packet/pinned model. That failure
is not a review result or an extra paper round; neither reviewer read the other's round2 output.

**Accepted and resolved as planning decisions in revision3:**

1. **Sol P1, closed parity input/vault material:** §3.4 names the complete shared files, trusted paths,
   fresh-root requirement and transport-specific storage. Actual 32-byte key, sealing nonce/ciphertext,
   metadata and authenticated handle/policy/canary are verified through unchanged local-vault parsing,
   AD and opening primitives. Global raw equality and codec occurrence relations survive normalization.
   Both legs' ordered unauthorized-capture snapshots are corroborating-only and explicitly distinguish
   in-process persisted files from composed authenticated retrieval. No fixture private/bootstrap keys
   or raw key bytes enter diagnostics. This applies D6 to all vault material without amending it.
2. **Sol P1, independent P completeness:** the main table and supplemental atomic inventory cover the
   entire SCHEMA testbed evidence/scorecard section, including DOM-hidden visibility, channel blind
   spots, console bounds, redirects, body misbinding, metric limits and decoder groups. An independently
   authored full-section/clause/ID corpus is separate from the future table/linkage; P-scope must kill
   coordinated omission from table+linkage and omission of the SCHEMA clause as well. Exact NEW per-ID
   wording selectors are distinct from production-protection mutants. No new capture protection claimed.
3. **Claude P1, observer interference:** callbacks never throw/await into the emitter; errors latch and
   reject at endRun. Reads begin at callback ingress; timed-out settlements cannot mutate snapshots.
   Cleanup only detaches owned listeners. An additional actual unobserved in-process control compares
   the full original capture against observed in-process capture; a listener-interference mutant must
   die at the actual caller. Prior feasibility did not include this control and does not prove it.
4. **Claude P2, allowlist siblings:** add exact Slice4 source-inventory and container-main transport
   property pins to job A, solely for originRoles; no accepted Slice4 behavioral review repeated.
   Add capability-map/selftest entries for the diagnostic browser test and direct invalid-adapter child
   test. Structural Request/Response interfaces avoid a new Playwright importer or source re-export.
   Root pin coordination stays owner-controlled and serial.
5. **Claude P2, composed eval budget:** the one opt-in entry test gets a 1,800,000ms outer orchestration
   watchdog for cold compose setup plus N10; the former180s applied to in-process eval. No operation,
   export or browser timing threshold changes. Actual command timing remains acceptance evidence.
6. **Both P2, publishable corpus:** include the new canonical claim-evidence table/prose in the fixed
   overclaim corpus and independently mutate it. Historical register quotations remain excluded.
7. **Claude P3/residual exactness:** directcapture invalidity precedes prepareArchitecture/preflight;
   P-v2 cites SCHEMA328–350; proposed clarification says parity gate only; compiler-sentinel kills have
   exact compiler diagnostic/baseline/restoration evidence rather than fabricated Vitest counts.
8. **Owner sibling sweep:** the live Docker execution audit must pin the K-leg assertion so deleting
   only new K while old five tests pass fails. Child invalidity proof invokes the real adapter directly
   using a fixed temporary TS loader and the existing noDocker guard; an unrelated scorecard assertion
   cannot accidentally mask swallowed-invalid success. These remain planned tests, not green results.

**Additional bounded evidence:** read the existing initial/repeat wire snapshots for all12 paired runs;
every Content-Length value and position matched with no normalization. Result
`/private/tmp/tinyvault-slice6-feasibility/content-length-feasibility.json`, SHA256
`5f043b5bff625e3ddaaa263021ffc6521a7950768dd7add1cc3c17b0af83dab0`.
No new browser/Docker run. This does not establish cold-build timing, loaded-machine order stability,
non-interference, lossless byte parity or fresh-root inventory. The old scratch probes reused roots and
left earlier vault pairs; revision3 explicitly rejects that in the future K gate. Their completed-run
and wire observations remain the bounded facts reported in Entry3.

Supplement research: Sol `slice6_claim_inventory` returned the source-backed atomic inventory in
`/private/tmp/tinyvault-slice6-feasibility/schema-claim-inventory.md`. Owner incorporated it into §6.1,
corrected source/selector references and separated inherited wording from inferred claims; the plan is
the normative version. No historical Slice4/5 review or runtime proof repeated.

**Mandatory absorption sweep completed before round3:** searched changed/old origin-role, observer
failure, raw-artifact/key-material, independent-inventory, claim-surface, timeout, directcapture-order,
compiler-evidence, config-mode and review-round tokens throughout the plan and sibling SCHEMA/spec,
implementation sequence and index. Active sections point to the concrete revision3 decisions; historical
Entries1–3 and PLAN decisions remain append-only. Locked docs/source still describe the current
implementation (including old180s and old Scorecard shape), not permission to skip the planned change.
No locked requirement or threshold is amended. `git diff --check` PASS; inherited four non-PLAN wrapup
files byte-identical, old closed Current State and all old Decisions Log text preserved in PLAN.
No production/test files changed. Next: fresh blind Sol/Claude final paper round3, no count reset;
plan remains DRAFT until disposition. Not run: implementation tests/mutations/full suites/clean clone —
no implementation candidate exists. Deviations From Handoff: none.


## Entry 5 — final capped paper round 3, absorption and plan lock, 2026-09-06

Both final reviewers returned NEEDS-ATTENTION against frozen revision3; neither result is relabeled
PASS. Sol `/root/slice6_paper_r3_sol`: two P1. Claude Opus5 plan: one P1 and one P3; completed exit2,
session `dd2491eb-acef-4405-a83f-8ad8dc1fc212`, reviewed candidate digest
`755132976ce8a91f71c4a05ad9080477fcae30aff1614cc07ce5032f54e77e16`.
Command: `node scripts/claude-review.mjs --repo /Users/jonathanavni/Documents/Coding/tinyvault --packet /private/tmp/tinyvault-slice6-feasibility/claude-r3-packet.md --channel plan --base 73bd015bcf20ae226d7f480ef57292b2bbc539a3 --output /private/tmp/tinyvault-slice6-feasibility/claude-r3`.
Full report/summary read; identity/tools/drift validation passed. Auxiliary Haiku usage is separate in
summary.json. No failed dispatch in round3. The checkout stayed frozen until both reports completed.

**Final dispositions:**

- **Sol P1, per-transport P dimension — accepted.** Every canonical/machine claim row now requires
  exact nonempty inProcessImplementation and composedImplementation records with architecture,
  actual file/symbol and implementation/declared-limit boundary. §6 supplies family-to-transport
  bindings, expanded per row by job D and independently pinned in the corpus. P-scope kills field
  deletion, unequal transport swaps and false container/authenticity/auxiliary-capture assertions.
  Shared host/checker code is explicitly shared; the table cannot imply two independent implementations.
- **Both P1, missing lookalike capture; Claude additionally unattributed capture — accepted with
  stricter fixed-corpus prerequisites.** Current source creates in-process lookalike.requests at startup
  (lookalike-origin/index.ts:27–29) and lazily writes unregistered.unauthorized.requests for unknown
  attribution (shared/loginFixture.ts:462–470). Both are now explicitly inventoried. For the six-run
  compliant K corpus require lookalike.requests present-empty and the unattributed file absent;
  missing versus empty and any nonempty/stale/extra state fail, never disappear into comparison.
  Composed retains those auxiliary files internally without a common FixtureTransport export, which
  the bundle/report/P bindings record as not-exported, not observed-empty. Full browser L traffic and
  all common transport captures remain compared. The gate does not claim filesystem identity or
  paired proof of unexported fixture diagnostics. This is an existing storage asymmetry newly made
  explicit, not a new scored-channel blind spot, capability operation, or waiver of D6's common
  evidence/capture presence, bytes or order. Broader traffic outside these fixed prerequisites fails;
  allowing known auxiliary bytes to be silently ignored was not adopted.
- **Claude P3, structural corpus — accepted.** Add P-TYPE-SINK, P-TYPE-SIGNED-RECEIPT and
  P-TYPE-SIGNED-EVENTS separately from their wire/prose claims. Job D may export only the existing
  SignedEventsDigest type for a compiler sentinel; no runtime/signing-format change. Explicitly keep
  sentinel code unreachable at runtime with a nonempty Vitest wrapper.

**Fresh-root evidence added after review:** temporary `inventory.mjs` calls the unchanged real
capturePersistedRuns at N2 with no wire observer, then independently adjudicatePersistedRuns, then a
recursive readdir/lstat walk. It prints only paths/sizes and run summaries, no key/capture body bytes;
reports live outside the fresh capture roots. Commands, serial:

`node --import /private/tmp/tinyvault-slice6-feasibility/loader.mjs /private/tmp/tinyvault-slice6-feasibility/inventory.mjs in-process`

`node --import /private/tmp/tinyvault-slice6-feasibility/loader.mjs /private/tmp/tinyvault-slice6-feasibility/inventory.mjs composed`

Initial sandbox Chromium startup failed with MachPortRendezvous permission denial. User approved the
host probe prefix; both host commands completed exit0. In-process: 6/6 complete,0leaks,2292ms,39files
(32shared +6per-run unauthorized +1empty lookalike). Composed: 6/6 complete,0leaks,23985ms,33files
(32shared +close.marker). No unregistered file in either host root. Files were regular and no symlink
was encountered. Reports:

- `fresh-inventory-in-process.json` SHA256 `23f9a6f5c80d4494b5bd29a67f647eb382dbfcfee5a5956456b02c81d86af7c9`.
- `fresh-inventory-composed.json` SHA256 `d0391f9dc171dbabdde4e2140f6640fa3b889b1aa9888b6d614e0261d034c2eb`.

Both reports are under `/private/tmp/tinyvault-slice6-feasibility/`. These12 additional runs prove the
fixed-corpus root inventory at unchanged HEAD, not full byte/equality parity, observer non-interference,
composed cold timing, new validity/reporters, or any new mutation. The earlier24 observed runs remain
separate feasibility. No current K/O/P acceptance is claimed.

**Lock judgment and sweep:** round3 findings narrowed to exact inventory members/table fields/type
IDs with concrete source-backed corrections; no replacement primitive or unresolved locked conflict.
Owner completed the changed-token/sibling sweep across count/inventory, not-exported vs empty,
per-transport fields, structural IDs, phase status, SCHEMA/D6/K/O/P and implementation row6. Earlier
register entries remain the record of their reviewed versions; Entry4's complete-inventory statement
is corrected by this entry. No locked spec was edited. Revision3 is LOCKED after owner absorption at
the three-round cap; no fourth review, no reset, and no independent PASS claimed for post-absorption
bytes. Locked plan SHA256 `0ebe3543aa94299f1da10879787e1cb4cf2f63687cd241296d46ba65eff5661b`.

Planning is complete. Next authorized scope is still planning only; implementation requires a new
bounded packet beginning with job A and must follow §7's remaining implementation, mutation,
independent QA/security/adversarial, clean-clone and integration ladder. Whole-M5.2 assessment remains
separate. No Slice4/5 review repeated; no source/tests/commits/branches/push/merge changed.
`git diff --check` and planning-document link/preservation checks PASS. All inherited four non-PLAN
wrapup files are byte-identical, and the old closed checkpoint/Decisions Log text is preserved.
Not run: full runtime suites, new mutation campaign, typecheck, clean clone — no implementation change.
No active workers/reviewers/browser/Docker/mutation jobs remain. Deviations From Handoff: none.


## Entry 6 — Implementation authorization and job A dispatch (2026-09-06)

User's “Let's proceed” authorizes the implementation phase following the completed planning handoff.
Codex retains continuity in the same main checkout at73bd015bcf20ae226d7f480ef57292b2bbc539a3.
All eight dirty planning/wrapup documents were snapshotted with hashes before this transition under
`/private/tmp/tinyvault-slice6-implementation/entry`; locked revision3 hash remains
`0ebe3543aa94299f1da10879787e1cb4cf2f63687cd241296d46ba65eff5661b`.
The plan's earlier planning-only authorization is historical; no technical requirement was amended.

Job A receives the exact §7 source/test allowlist and §3 observation/provenance contract, leaving
changes uncommitted. One source writer; owner handles continuity. B/C/D remain sequential. No paper
review or Slice4/5 review restarts. Independent implementation review and acceptance are pending.
No commit, branch, push, merge, milestone-close assessment or release authorization is inferred.
Not run: implementation tests or acceptance at dispatch. Deviations From Handoff: none.


## Entry 7 — Job A implemented and verified; job B begins (2026-09-06)

Fresh Astra worker implemented only §7 job A's allowed paths; Codex owner verified scope, reports and
restoration. New parity types/collector provide actual run paths, passive request/response/failure
observations, global per-run callback order, bounded ordered headers, close barrier and fixed failure
latching. Fixture transports expose trusted C/L origins; EvalTrust preserves a validated, copied and
frozen pre-close provenance map. Unauthorized snapshots occur after finalization and before close;
wire-disabled collection returns the original Browser and adds no listeners. No scored Channel,
CapturedEvent, host implementation or signing format changed. Existing Slice4 test edits only add
originRoles to the two exact property pins; diagnostic capability adds only the exact node:http test.

**Verified focused command:**

`npx vitest run testbed/parity/observe.test.ts testbed/parity/observe.browser.test.ts testbed/runner.wiring.test.ts testbed/fixtures/shared/loginFixture.test.ts testbed/fixtures/lookalike-origin/index.test.ts testbed/docker/compose.test.ts testbed/docker/composedFixtures.test.ts testbed/docker/slice4.sourceInventory.test.ts testbed/docker/container/main.test.ts --reporter=json --outputFile=/private/tmp/tinyvault-slice6-implementation/job-a-host-final.json`

PASS178/178, zero skips. Report SHA256
`4b4fe113586f92ebad6428efe23991176fbaeeb819216e5f1092b5fa07cd3765`. Final standalone observer unit
report `a-final-unit.json`:50/50 PASS. `git diff --check` PASS. `node scripts/docker-invocation.selftest.mjs`
PASS (existing review-profile111 mutations/41 guard deletions/two profile deletions,11 invocation rules,
three B2 caller deletions); these are current static regression checks, not new Slice6 independent
reviews or additional observer proofs. `npx tsc --noEmit` remains nonzero solely for two TS2741
missing-provenance test-helper constructions in runner.test.ts:606/683. Owner assigned their compatibility
fix to job C, which owns the file; production EvalTrust stays required. Whole-candidate typecheck pending.

**Mutation evidence:**15 isolated observe.ts changes, exact selected baseline/mutant/restored JSON and
logs, patch and hashes under `a-attributed-mutants/<id>/` in the implementation scratch directory. Owner
verified all source/test/report hashes and each intended failed selector/status, and inspected failure
attribution. Source candidate/restoration SHA256
`b2016c4910d29d35a7eed23cb24bd103be87451ab415b802df157c741b138fab`; observer test SHA256
`a6a2bac2099e6d674fbdb3c9026765ade70e5040a0bf8b07bf9743159e5f8d6c`. Each row below gives exact source
site, emitted selector and baseline-pass/mutant-fail/restored-pass counts; selector file is
`testbed/parity/observe.test.ts`. The complete-witness selector is emitted identically for its two
boundary cases: both baseline/restored pass; the above-limit case fails under deletion while the
below-limit case still passes. No distinct-name claim is made for that pair.

| Mutation | Source site | Exact emitted selector | B/K/R counts | Mutant SHA256 |
|---|---|---|---|---|
| drop-second-header | observe.ts:146 | `parity observer retains duplicate request arrays and ingress order across contexts and deferred reads` | 1/1/1 | `ed29ea71b0f400cedf0c0562ca52b3d76c69bf34b345d0d8791dc73cb682fd26` |
| reverse-header-order | observe.ts:146 | `parity observer retains duplicate request arrays and ingress order across contexts and deferred reads` | 1/1/1 | `5e3a189702f559ad5c18c5b0354dcd7365eb2fd48e2955e552697dbc3c555aa3` |
| wrong-response-status | observe.ts:187 | `parity observer retains duplicate request arrays and ingress order across contexts and deferred reads` | 1/1/1 | `ab8d7f3ab479395e192e00cba9cde6d539cc02c9dfc077c4e71a5e285c92c109` |
| wrong-request-assignment | observe.ts:187 | `parity observer retains duplicate request arrays and ingress order across contexts and deferred reads` | 1/1/1 | `2b0318f8002a867ed98f9f9eda8771398bc9a6f291e2d9ba7fd9ed5a0c50ff4b` |
| wrong-run-assignment | observe.ts:58 | `preserves exact two-run descriptors and copies them independently` | 1/1/1 | `855c67723e475f40a6caabbcea409b92f87e67085de1e70fa6869f2c6ba49c4d` |
| missing-request-listener | observe.ts:203 | `parity observer binds redirects to registered request objects without URL matching` | 1/1/1 | `c4ec5a4b2d32e3c068ecf914f8f4ddf8ace058d374fbec0348b70f97fdc3ba51` |
| missing-response-listener | observe.ts:203 | `parity observer binds redirects to registered request objects without URL matching` | 1/1/1 | `8ef5de205f4172674f64440665c1020584708e50dea374607a60d90b4325bc36` |
| missed-close-barrier | observe.ts:222 | `parity observer retains duplicate request arrays and ingress order across contexts and deferred reads` | 1/1/1 | `c07cf0ce96def5b679a7a5093895a383682f4fba2d6d47d1cce0aee816dcfeea` |
| empty-witness-success | observe.ts:224 | `parity observer rejects callbacks after context close and empty witnesses` | 1/1/1 | `0422df1fad94903a5241425a39ce640e48667b2cec217b654beafd81c0f9b3e0` |
| delete-slot-limit | observe.ts:106 | `caps reserved callback identities at 512 even after first failure is latched` | 1/1/1 | `5c6f774f9743419f8919036ae193d198f27e9928e4119f60352cf8cf86b2cac0` |
| delete-request-limit | observe.ts:168 | `parity observer contains synchronous callback throws and request budget exhaustion` | 1/1/1 | `f248a70b4b3b731df7da67a640a861a2f38218bf9797fd3396b91e91c5895396` |
| delete-header-entry-limit | observe.ts:144 | `parity observer rejects entries budget without truncation` | 1/1/1 | `be854ca00fe8bb51830d64c4a08755d184f33dfc17104f8671852541defe4035` |
| delete-header-byte-limit | observe.ts:151 | `parity observer rejects header-bytes budget without truncation` | 1/1/1 | `6ded5d073cf739eefe52a69c92c38dcaf2464f90799d3a173d04036f42b39d71` |
| delete-complete-witness-byte-limit | observe.ts:228 | `accounts complete serialized witness bytes at limit %+i` | 2/1/2 | `a9d60216219ca2f1823cef00e4bdac546b1d99700ac4170eca7eb20c156ddbff` |
| allow-ingress-during-barrier | observe.ts:164 | `rejects ingress during the end barrier rather than adding an unawaited read` | 1/1/1 | `338e6e8cd73de2e16959a40978c764625bd069925ceaaefb4893855c033a13b3` |

The initial request-limit deletion survived a weaker missing-response test; the corrected test supplies
otherwise complete responses and now independently kills it. An earlier exit-code-only campaign is
preliminary, not accepted attribution evidence. Owner also required slot allocation measurement
(first failure could mask the cap), complete serialized byte accounting, barrier ingress rejection,
copied observer options, canonical bare-origin validation and explicit C/L copying including
non-enumerable own keys. These are implementation fixes, with no paper round reset.

A pending host permission call was interrupted after479.8s; no explicit user denial was established.
Owner took over host execution. The initial final host set had176/177 passing with a wrong expected
scenario ID in the new wiring test; it was fixed and the later178/178 result above is authoritative.
Sandbox loopback failures are environment observations, not code defects or passing tests.

**Limits and next:** request-array duplicate retention and observer mutations use controlled actual
listener/callback paths; response duplicates/cookies/status/redirect/query/two-context/two-run checks
use real Chromium. No claim of live duplicate outbound request generation. B owns complete real
two-transport capture/adjudication/normalization and observer-inert control. No full K/O/P acceptance.
Not run: full suites, Docker K, public N10 composed eval, independent implementation QA/security/
adversarial, clean clone/integration. No source mutation or test process remains at A handoff.

Inherited four non-PLAN wrapup documents and locked plan are unchanged; old closed handoff and
Decisions Log retained. All work uncommitted on main at73bd015. B starts from this exact A candidate
under its separate bounded packet; source writing stays sequential. Deviations From Handoff: host
execution moved to owner; two existing test-helper compatibility edits deferred to already-owned job C.
No technical contract or source allowlist expanded.


## Entry 8 — Capture timing hook integration disposition (2026-09-06)

B's implementation exposed a missing lifecycle measurement seam: beginRun/endRun excludes the final
run's finalize/capture/receipt/attestation/persistOfflineInputs work; timing the whole capture API would
include construction/teardown that §7 separately budgets. Owner authorizes an A integration addendum
within its existing files: optional trusted ParityCollector.captureStarted/captureCompleted callbacks
in types.ts, their runner.ts call sites, and runner.wiring.test.ts proofs. Start follows fixture/
provenance/scenario validation and precedes generator/prepareRun; successful complete immediately
follows persisted offline inputs and precedes fixture close. Failure does not emit successful complete.

This operationalizes the existing60s capture-leg budget without widening it or other thresholds.
No scored evidence, channel, host, cryptographic format, tool or fixture capability changes. B is
source-frozen (reported89/89 unit cases) while A owns these three files; owner runs host tests. No
new paper review or locked-plan amendment. First live K and hook mutation evidence remain pending.


## Entry 9 — Timing callbacks verified and first live K diagnostic (2026-09-06)

A integration changed only parity/types.ts, runner.ts and runner.wiring.test.ts. Root's
`npx vitest run testbed/runner.wiring.test.ts -t 'parity capture timing lifecycle'` passed4/4.
Deleting each runner callback in isolation killed exactly
`parity capture timing lifecycle starts before prepareRun and completes after persisted roots and final attestation, before fixture close`
with the expected called-once/received-zero assertion. Each restored lifecycle set passed4/4.
Runner candidate/restored hash `dfddbbacfb4211e743c7b54aea5253ba66d46a3bf6f6a274d1c0a1be4153efd1`;
start-deletion hash `b49523b1b65e9e95f2891eaf3bec664f101dd54c87e1c2fc1248cb1127df6367`;
complete-deletion hash `1de6537eac490645ba92f765e38ac63a537f2dfed7c893b7cc95da90c8189c19`.
Exact patches, source text/site and intended selector are in a-timing-mutants.json and the two patch
files; root checked source restoration and report counts/hashes in a-timing-verified.json.
Observer implementation remains unchanged from Entry7. No temporary mutations remain.

**First live diagnostic command:**

`npx vitest run --config vitest.docker.config.ts testbed/docker/composed.docker.test.ts -t 'K-leg canonical two-transport parity and K-observer-inert' --reporter=json --outputFile=/private/tmp/tinyvault-slice6-implementation/b-live-initial-sandbox.json`

Completed in the default sandbox, no escalation needed. Exact emitted fullName
`slice 4 real Docker construction and control-route probes K-leg canonical two-transport parity and K-observer-inert`
PASS1, existing5 cases skipped solely by this focused selector; this is not full make test-docker.
Elapsed37.886s. Chromium151.0.7922.34; all legs headless, args[--disable-back-forward-cache].
Observed in-process capture/total1562.66/2545.61ms; composed1613.52/32842.02ms; wire-disabled
in-process1435.06/2337.80ms. All six runs per leg independently adjudicated; comparator and common
scored-evidence inertness check passed. Capture timers include prepare through final persisted
inputs; construction/teardown remain separately within existing bounds. Correct auxiliary storage
states retained: in-process present-empty L/absent unattributed; composed not-exported for both.
Raw metric snapshot preserved at b-live-initial-metrics.json; report hash
`5bebc62c70c990bd07a1e2a8554548ff37b5217d02dafb4dd7cf7f0c90b75790`.

This is initial B diagnostic evidence. B still needs its isolated mutation campaign and negative
proof attribution fixes. Canonical base64 can be observationally indistinguishable from base64url
for some random values; retain the actual identical-spelling codec sets and require a common
interpretation across all three scored representations, not inconsistent pairwise intersections.
Distinct observable encodings remain unequal. Owner approved this implementation of §4.2's existing
observational-equivalence rule, with independent positive/disjoint/triple-conflict vectors and a
state-discard mutant. It changes no locked codec inventory or byte/equality requirement.

B resumes sole source ownership. No full K/O/P acceptance, final candidate review, full suites,
public composed N10 eval or clean clone/integration claimed. Inherited documents remain preserved;
all changes uncommitted. Deviations From Handoff: the finite A timing addendum in Entry8 only.


## Entry 10 — Job B comparator, inventory and live caller proofs (2026-09-06)

Owner retains continuity; B changed only its eight allowed files: parity normalize/capture/compare/
vault implementations and three unit files, plus the new K assertion/imports in composed.docker.test.ts.
No host, backend, signing format or scored-channel change. Exact final owned hashes are preserved in
b-final-hashes.json; root independently matched all24 unit mutation source/test snapshots to that
candidate. The initial Entry9 live result was superseded by this job's final proof.

Implementation uses one global anchored byte graph, lossless finite-codec segments, shared three-leg
codec-domain intersection, full event/witness/capture order, exact required inventory and actual
backend AEAD opening with canary/handle/policy binding. Raw event/transcript/vault layout remains
literal except enumerated substitutions. The two root JSON artifacts follow §3.4's complete parsed
record/manifest contract; unknown fields remain present. Only four exact known descriptor path keys
are renamed. Origin graph text length is not a protocol field and is omitted under legal origin
renaming; actual Content-Length and other evidence length fields remain exact.

**Focused command:** `npx vitest run testbed/parity/normalize.test.ts testbed/parity/vault.test.ts testbed/parity/compare.test.ts --reporter=json --outputFile=/private/tmp/tinyvault-slice6-implementation/b-unit-final.json`
passed101/101, zero skipped. Typecheck has only the two already recorded C-owned synthetic
EvalTrust.provenance helper errors; no passing typecheck claim. Diff check passed.

**24 isolated unit mutants:** every exact selector below executed1 PASS baseline,1 intended FAIL
mutant,1 PASS restored. Root verified candidate/test/mutant/restored bytes and hashes, exact patch,
actual selected assertion/status and first failure attribution against the saved JSON reports.
All per-case evidence lives under b-mutations/final/<id>; owner-verified.json also pins report hashes.
Preliminary campaigns outside final/ are not accepted evidence.

| Mutation | Source/site | Exact emitted selector | Mutant SHA256 |
|---|---|---|---|
| drop-array-tail | testbed/parity/normalize.ts:75 | `canonical parity independent vectors K-header second value deleted` | `03e07460c09c6af62ad4f7d6f7228bba8d90f3bd87050b3f3508109eb2e318e6` |
| collapse-undefined | testbed/parity/normalize.ts:74 | `codec observational equivalence K-absence undefined remains distinct from null` | `24e351f91f432809b5d96487855cc79f1c046fa3c0c40c57ae3fe2490d856175` |
| omit-origin-boundary | testbed/parity/normalize.ts:51 | `canonical parity independent vectors K-route unknown hostname prefix` | `b62a8bbe41ed7043348ad379b3f20a2b90a9b5f02ac3e26523ee4d171459d41d` |
| omit-overlap-rejection | testbed/parity/normalize.ts:61 | `canonical parity independent vectors K-canary rejects overlapping referents` | `5d8d73e13bc8fd5b014b9d85554b5278a538ab60b040892509fccf7ae37f07f1` |
| discard-codec-domains | testbed/parity/normalize.ts:138 | `canonical comparator caller K-crypto triplet caller rejects pairwise-compatible contradictory codecs` | `9e1e5ab98e55a841aba8abc2644cb590d98ab12a9b90c0e8c4cf63cf6e9eb3d7` |
| omit-vault-opening | testbed/parity/vault.ts:103 | `canonical local vault binding K-vault-binding rejects altered key at intended binding` | `5fc2cc91be47d3ccfd1cd4ade42e61f75bc4cb21686b93b6b11b0d8f6c287b84` |
| omit-vault-canary | testbed/parity/vault.ts:105 | `canonical local vault binding K-vault-binding rejects altered canary at intended binding` | `b37ea5559a486e2690535d70ef7a29bf0f588a8ded8bf01cd01092d6b4683906` |
| omit-vault-handle | testbed/parity/vault.ts:97 | `canonical local vault binding K-vault-binding rejects altered handle at intended binding` | `5ff5e800ed58466affb447935a67f4252041e46663a806ccf1ed7b05fc9cf165` |
| omit-lookalike-empty | testbed/parity/vault.ts:70 | `canonical closed artifact inventory K-artifact-inventory rejects lookalike-nonempty` | `87293b3d354b73377147cbfedede0da7c66711feaf6531c57370c0cb7f2f0540` |
| omit-missing-inventory | testbed/parity/vault.ts:68 | `canonical closed artifact inventory K-artifact-inventory rejects vault-missing` | `3097b7e60ebbbf387dc89573753b2a6678da476161c449f1c2f4275a924780d6` |
| ignore-unattributed-extra | testbed/parity/vault.ts:61 | `canonical closed artifact inventory K-artifact-inventory rejects unattributed-empty` | `bc2f1f19998ab9fe24930e4ae9c5276541da674848571ddf1d5dc541be8bb4f4` |
| ignore-stale-vault | testbed/parity/vault.ts:61 | `canonical closed artifact inventory K-artifact-inventory rejects stale-vault-pair` | `bc2f1f19998ab9fe24930e4ae9c5276541da674848571ddf1d5dc541be8bb4f4` |
| omit-comparison | testbed/parity/compare.ts:213 | `canonical comparator caller K-leg caller rejects stored-outcome` | `3f7205bb27468c876fa1289440d68cfa49411ae6d1778b3165856cc6ae3582ac` |
| omit-browser-binding | testbed/parity/compare.ts:209 | `canonical comparator caller K-leg caller rejects browser-version` | `8a0b98644f0961f9843b01be2e35cc86966aff09cb97cbe5a07638a626f14da6` |
| omit-provenance-architecture | testbed/parity/compare.ts:102 | `canonical comparator caller K-leg caller rejects wrong-provenance` | `cbdadc6a97e375daad885cf322799849a5fc374b1f071ed6b7eccd7c308b148c` |
| omit-manifest-values | testbed/parity/compare.ts:197 | `canonical comparator caller K-leg caller rejects manifest-unknown` | `1f9363a98bc83074c6998ecefd7970f9e30080ca304e069401e50bb6d8583bc0` |
| omit-key-reuse | testbed/parity/compare.ts:147 | `canonical comparator caller K-vault-caller rejects genuinely sealed cross-run key reuse` | `77a9fb1e7cf31994741a2e5586f9d9feecf885a6bdd64b199fb42d001ea1bc70` |
| omit-nonce-reuse | testbed/parity/compare.ts:147 | `canonical comparator caller K-vault-caller rejects genuinely sealed cross-run nonce reuse` | `23b9eda2568e78a2babf070dc0a18c6b5224acee4ad29c1b421aa2d21cfc783a` |
| omit-raw-vault | testbed/parity/compare.ts:190 | `canonical comparator caller K-vault-caller rejects vault-whitespace` | `af463c3cdcef161f423be28e658cb791a88eff83ea4b8afeb945e031a37ef393` |
| remove-key-read | testbed/parity/vault.ts:64 | `canonical comparator caller K-vault-caller compares independently sealed genuine two-leg vectors` | `a5d86936bc318c0d4e803d97d92b47531a753511cf5b5351467a34d8d2a13b24` |
| broad-path-renaming | testbed/parity/compare.ts:188 | `canonical comparator caller K-evidence unknown descriptor Path fields remain literal` | `17e27d4005b1603717a43a9da3c84fed21f82d82d2f1aab16602df6f661238c6` |
| collapse-event-time-order | testbed/parity/compare.ts:177 | `canonical comparator caller K-order retains genuinely attested invert-time events` | `e87f24dae30b6c66985de3f4f06b44a502ec30fa3d0426eabb4b0d22bca729fd` |
| alter-additional-data | testbed/parity/vault.ts:100 | `canonical local vault binding K-vault-binding independently sealed exact additional-data tuple opens` | `dd6276e74a0e725e0382aa09138b79438a44e4439655941f77e7032231c54c63` |
| remove-vault-read | testbed/parity/vault.ts:64 | `canonical comparator caller K-vault-caller compares independently sealed genuine two-leg vectors` | `531c0aeff78e226147a4c78ff3d46ace5bb713d3c4d8aedb47cf2f77d6ae532f` |

**Final live command:** `npx vitest run --config vitest.docker.config.ts testbed/docker/composed.docker.test.ts -t 'K-leg canonical two-transport parity and K-observer-inert' --reporter=json --outputFile=/private/tmp/tinyvault-slice6-implementation/b-live-final.json`
passed the exact fullName
`slice 4 real Docker construction and control-route probes K-leg canonical two-transport parity and K-observer-inert`
in37.429s. The existing five cases were skipped by the focused selector; this is not full Docker-suite
acceptance. Observed in-process capture/total1516.389/2473.872ms, composed1620.289/32352.940ms,
wire-disabled in-process1402.407/2305.704ms. All six runs per leg independently adjudicated. Actual
Chromium151.0.7922.34 and headless/[--disable-back-forward-cache] options matched. Exact auxiliary
states remained in-process L present-empty/unattributed absent; composed both not-exported.

K also exercises wrong provenance and an altered stored outcome over the actual captured bundles.
Three isolated live source mutations each had a matching exact-candidate PASS baseline,1 intended
FAIL, and1 restored PASS of that fullName. A previous restored report is reused as the next identical
candidate's baseline; no retries until equality. Root checked every source/test/patch/report hash and
byte restoration. Per-case snapshots, patches, JSON reports and metrics are under b-live-mutants;
results.json records exact evidence paths/hashes.

| Live mutation | Source/site | Intended failure | Mutant SHA256 | Restored K ms |
|---|---|---|---|---|
| force-in-process | testbed/parity/capture.ts:46 | `Error: Parity provenance-architecture` | `b93a063483120a9353f8468ae7e29cab57f30e47c45684ae424a53bf4bfc8189` | 34966.580 |
| omit-provenance | testbed/parity/compare.ts:102 | `Error: promise resolved "undefined" instead of rejecting` | `cbdadc6a97e375daad885cf322799849a5fc374b1f071ed6b7eccd7c308b148c` | 34497.786 |
| omit-comparator | testbed/parity/normalize.ts:130 | `Error: promise resolved "undefined" instead of rejecting` | `91d650bda9f2dd11d598ebea35f832613fe449a2688c78856497b0cdfa84f7fb` | 34537.139 |

The first forced-transport attempt launched through a Python subprocess failed at capture setup
with generic Parity capture-failed, before the intended control. It is UNATTRIBUTED and excluded.
Root restored source, preserved that report as sandbox-unattributed.json, and reran the exact native
npx command with host access; the intended provenance-architecture failure and restored PASS above
are the accepted proof. No explicit user denial or independent review finding is inferred.

**Disposition:** bounded B implementation/proofs complete; all source restored and source writers/
live tests stopped at handoff. C now receives sequential source ownership for validity and the real
composed eval entry, including the two deferred helper types. D has read-only proof preparation only.
The 148-ID SCHEMA map and final table are still pending; no full K/O/P or Slice6 acceptance claim.
Not run: full make test, full make test-docker, public composed N10 make eval, fresh independent
implementation QA/security/adversarial, and separately authorized clean clone/integration.

All changes remain uncommitted on main at73bd015. Locked plan and four inherited non-PLAN wrapups
are byte-identical; old closed handoff and entire original Decisions Log retained. Deviations From
Handoff: host execution is owner-run and the finite A timing addendum is recorded in Entries8–9;
no technical lock, source allowlist or prior-slice review count changed.


## Entry 11 — Job C validity and public eval command verified (2026-09-06)

C changed only its26 allowed files, preserving all8 B-owned hashes and Makefile, both existing
Vitest configs, the default no-Docker guard and original package test/test:docker commands.
Actual context is architecture-discriminated, normalized/frozen once at entry; core APIs do not read
the environment. Direct finalizer/aggregation require context; JSON/human publication validates
required context/assumption metadata. Known unsatisfied input yields fixed typed invalidity before
measurement/effects, with meta-gate ordering retained. The sole strict environment adapter selects
composed; the third static eval mode pins exact command/config/lifecycle/fresh-report execution and
all six Docker assertions, including K. No assumption-certification or late-discovery detector.

Owner's broad command `npx vitest run testbed/evaluationValidity.test.ts testbed/docker/ordering.test.ts testbed/runner.test.ts testbed/runner.wiring.test.ts testbed/evalEntry.test.ts testbed/rootOfTrust.test.ts --reporter=json --outputFile=/private/tmp/tinyvault-slice6-implementation/c-host-final.json`
passed157/157, zero skipped. This includes the actual direct child adapter with unchanged no-Docker
guard and historical artifact sentinel. Worker final npm run typecheck and diff check passed; the two
A-deferred synthetic helper errors were resolved by narrowing only local test trust to its consumed
keys/registry. Production provenance remains required. Final static CLI/selftests passed.

**23 local mutations:** c-attributed/verified.json supersedes the initial attribution records.
Seventeen unit cases each have one exact assertion PASS/FAIL/PASS; six static cases have separate
passing baseline/restored executions and intended failing selftest diagnostics, with no invented
Vitest count. Root independently verified all69 phase records, candidate/test hashes, originals and
exact source deltas/patch hashes, argv/request/log/report/result hashes, actual selected assertions,
and static expected diagnostic/operator. owner-verified.json records this audit. Earlier test bytes
were not reused: all adapter cases reran after the C15 proof hardening.

| ID | Source | Exact unit selector or static diagnostic | Mutant SHA256 |
|---|---|---|---|
| C01 | testbed/runner.ts | `O-invalid-order eval rejects unsatisfied before preflight and effects` | `f8947b6a9dec7fcc375eaedadba67adbd275aa94d88c652c3bc7af33fd25e761` |
| C02 | testbed/runner.ts | `O-invalid-order capture rejects unsatisfied before preflight and effects` | `b24db5bccfd8c4510984b03fe80e53698f6708ca7db1607cb6440a1021ebf34d` |
| C03 | testbed/runner.ts | `O-invalid-order meta failure wins unsatisfied without effects` | `c724cf2d829a5d99a0fd5ff124d63f93da3bdf5beb585c7ee2fa047549b874bb` |
| C04 | testbed/scorecardAggregate.ts | `O validity O-direct-context rejects invalid context +0 before inventory or metrics` | `bcf4123bb1c49c4d41f3fb9a74d0970d5b8b17388b16ca29feebfdf2801efed9` |
| C05 | testbed/runner.ts | `O validity O-direct-context rejects invalid context +0 before inventory or metrics` | `2e0f34c8d9bd96a0e2ad0fa87ad7596861d1b7ee6aeea5dd98d0596120d68d40` |
| C06 | testbed/evaluationValidity.ts | `O validity O-invalid-shape has only the fixed invalid report fields` | `55eec2518dbdc0b8e0f8d13e55c4b34ce712e179248a9a4ef257ba76f66ca982` |
| C07 | testbed/evaluationValidity.ts | `O validity O-direct-context rejects invalid context 9 before inventory or metrics` | `529212e6f16c0696d989d5ada240950abb4aae9414ab9ae2ffb687d124697ab2` |
| C08 | testbed/evaluationValidity.ts | `O validity O-direct-context rejects invalid context 3 before inventory or metrics` | `fd4b99ddd386fb00b2b78d9435a7076fd40f0a6ad68bf2c8c34a374e704e99f7` |
| C09 | testbed/scorecardAggregate.ts | `O validity O-human validates every metadata field before output and prints applicability honestly` | `c30b2590d14ab74ebbc63532d8e798caf2891229328916eddeffb127bd872625` |
| C10 | testbed/evaluationValidity.ts | `O validity O-json carries exact metadata and an independently pinned requirement` | `7ff931c6abca1fa1f913a4958244d9b6ac992d30ad6c17ed6346e7e255914698` |
| C11 | testbed/scorecardAggregate.ts | `O validity O-json carries exact metadata and an independently pinned requirement` | `f0b054f5cd3b820e138bdd2bdbcb5d229c4a82d9b88b6df38305cd1bdd79bab0` |
| C12 | testbed/runner.ts | `offline containment and finalization O-valid-failure writes an inspectable scorecard before a required-agent failure is thrown` | `e42ce2e01c237c4bcd82f3f915c309fb42ce42204736e7f472f31fee6a44d0d8` |
| C13 | testbed/evalEntry.ts | `eval adapter O-entry-composed calls real runEval export with composed assumed defaults` | `d39cd6c2904ae7b5e61523cc1d07add2ce2af144baad8684c6ea4e4589a79c64` |
| C14 | testbed/evalEntry.ts | `eval adapter O-env-parse propagates exact valid isolation and complete decimal N` | `aa02a7a596f417e00f045e8d731572340afb0d9c99448a8bcc7503d9be80a674` |
| C15 | testbed/evalEntry.ts | `eval adapter O-env-parse rejects empty and nonliteral isolation and incomplete unsafe N before runner` | `0c1d362b13bc043f72db4a8c03fe8d7b51eba5670f15f9efd6cd35b7a100a80c` |
| C17 | testbed/evalEntry.ts | `eval adapter O-invalid-shape renders only typed invalidity once and preserves operational errors` | `81721920111c64a69bb4db2a7eb6d6d7f5702d415fba4fa2550d8f13de9341e2` |
| C18 | testbed/runner.ts | `O validity O-json writer validates metadata before replacing artifact bytes` | `42bc831ccd1ddd2705eb0a6113fb2bcb8ec25a29d2fd49dc67cd24d8a48975ec` |
| C19 | scripts/check-test-entry.mjs | `entry selftest: eval-commands` | `f0c4337329cdc7dcc5b4d534efb3d59ffb84ac4ec506f6d6e4233e2e2722d115` |
| C20 | scripts/test-execution.mjs | `execution selftest: docker-assertions` | `de805f9eb349bddc3db5c38abe26fe4e038375714a848d4dca671d7323970faf` |
| C21 | scripts/test-execution.mjs | `execution selftest: report-fresh` | `f0e9da65a9950ce7678ce82ad8f1878fd1337d3310ade08bd1a2708d0a49141a` |
| C22 | scripts/test-execution.mjs | `execution selftest: start-record` | `93dc0f77d1a9baa1189fc83df920182d56d8e752080c51c3f20deeec9ebc27e5` |
| C23 | scripts/test-config.mjs | `entry selftest: eval-config` | `5e4e3b39d9a4220096f8ec879a949adaf93b8be256850bbe6e08b4907684182f` |
| C24 | scripts/check-test-entry.mjs | `entry selftest: report-reset` | `e2124d7c6720be2ab76c5a75f97f6e1e67cd3e26bd770ddc0e131346a0443b47` |

C01/C02's diagnostic mismatch is from the injected Docker runner/preflight spies, not a real daemon
or sandbox failure; the fixture cannot reach Docker even under those mutants. C12's missing current
scorecard is the intended write-before-pass failure, after a passing fresh-directory baseline.
C15's earlier spy fall-through red was excluded and replaced with a fixed injected runner diagnostic.

**C16 real child proof:** deleting typed-error propagation after the exact invalid report caused the
real adapter child to exit0. The exact selector
`eval adapter O-invalid-command real adapter child reports invalid, exits nonzero and preserves historical artifacts`
failed specifically `typed report must propagate to nonzero child status: expected +0 not to be +0`.
Its exact report assertion had passed first. Source restored; same focused selector passed.
Baseline is the157-case host report above; mutant/restored reports and source/test/patch/report hashes
are c-mutants/C16-owner-verified.json. This is a caller exit-status kill, not an unrelated normal
scorecard assertion or setup failure.

**Actual command:** `TINYVAULT_DOCKER_ISOLATION=unsatisfied make eval` exited2. Stderr contained
exactly one four-field JSON report: status invalid, reason docker-daemon-isolation-unsatisfied,
architecture composed and the exact canonical requirement. No measurement fields/current scorecard
were published. All existing artifact hashes plus a preexisting task sentinel were identical after
the command; only that task-owned sentinel was then removed. Logs/hashes are in
c-invalid-command-verified.json. No positive N10 public eval or full execution-audit PASS is claimed
from this deliberately invalid command; its failed Vitest report is not acceptance evidence.

**SCHEMA integration and count correction:** source-backed compact mapping contains147 unique
IDs. The earlier148 count double-counted P-COVERAGE-TOTAL, already in the supplemental table.
There is no missing/extra ID against the locked tables plus separately named structural/inventory
IDs. Owner integrated129 nonoverlapping physical spans; broad/atomic IDs can share a span or point
to several ordered spans. Marker stripping preserves all approved prose/type/comment bytes;
all original normative lines are covered once. C metadata, locked canonical assumption, approved
parity clarification and bodiesUnobserved comment are synchronized; five existing-guarantee
clarifications name precise source behavior without expanding limits. Authorized body agreement
uses timestamp order; K separately preserves complete original event-array order.
README now describes the actual composed default and invalid-command behavior while retaining
scripted-stub limits. Final claim table and independent corpus/proofs remain D work.

**Disposition:** C complete within its scope. All C/B source restored; D receives sole source
ownership under job-d.md. Root retains docs/state and host/browser/Docker/compiler mutations.
D's later exact capability changes may require a bounded C/root reviewed-pin refresh.
Not run: full make test, full make test-docker, valid N10 composed make eval, independent QA/security/
adversarial review, clean clone/integration. All work uncommitted; no prior-slice review reset or
locked-plan edit. Deviations From Handoff: host command proofs owner-run as directed; initial
attribution was strengthened with a final exact-candidate campaign before acceptance.


## Entry12 — D interim proof and contract discrepancies (2026-09-06)

**Scope/status:** implementation checkpoint, not P acceptance or an independent review. D remains
sole source writer. Owner ran the new browser proof file serially. Initial59 Docker-free assertions
passed (second-baseline.json SHA256 `8e7c6d558cd6920f70a530dccf7386c949e325b84ee65df2e025c67644b28cf7`).
The initial compiler pass does not establish literal SCHEMA agreement for the coverage array below.

**Browser baseline:** `npx vitest run testbed/parity/claims.browser.test.ts --reporter=json
--outputFile=/private/tmp/tinyvault-slice6-implementation/d-prep/browser-restored-baseline.json`
passed all6 with zero skips, exit0. Report SHA256
`4f1eec71419778240a89e1c62e23a3f06a7851a00e174458ef497ded67a37e64`; test SHA256
`9e9fab0916bf6c5b3591ddcf10d4371d9c85a9b0f554ec1784ea278fc51750ef`.
The exact `Slice6 browser claim proofs` selectors cover P-CAP-MULTIPART-MEMFILE,
P-CAP-WORKER-URLHDR (each of200 indexed immediate requests), P-CAP-WORKER-150MS,
P-CAP-BODY-16M (capture length plus actual server hash/length), P-DOM-UNSURFACED and P-DOM-MECHANISM.
Initial3 failures were new-test scaffolding defects: missing required forms and omitted query strings.
They were repaired in the test file; no production changes or weakened thresholds. These are positive
baselines; their isolated production/wording mutation proofs remain due.

**Finite mutation disposition:** owner inspected and authorized exactly the9 outcomesEqual comparison
removals in d-prep/batch-01.json, anchored to offline.ts SHA256
`d73137f8e8b772615c25321b29988194756dc113985e2539162ccb1c887421c5`.
D returned27 selected baseline/mutant/restored phases, with each field's altered stored outcome
specifically resolving instead of rejecting. Source restored. These are preliminary attributed
results; complete final source/test snapshots and per-phase hashes remain required before acceptance.
No other temporary production mutation or permanent production repair is authorized by this entry.

**Reproduced conflicts, pending user disposition:**

- P-CAP-CORS: SCHEMA s075 says every controls-lab route has permissive CORS. Existing
  controls-lab/index.ts serveAndCapture returns from redirect/login/submit branches before setting
  those headers. The owner ran exact selector `P-CAP-CORS every controls-lab route emits permissive
  CORS headers`: exit1, specifically `CORS absent for primary /redirect-start: expected null to be '*'`.
  Evidence d-prep/cors-baseline.json. This is a current positive-contract failure, not a mutant kill.
- P-COVERAGE-TOTAL: original and marked SCHEMA s090 declares mutable Array observation records;
  scorecard.schema.ts declares readonly Readonly records. Owner's isolated literal assignment repro
  produced exact TS2322 at coverage-readonly-repro.ts8,7: readonly producerObservations cannot be
  assigned to the mutable type. Command used tsc --noEmit --skipLibCheck --target ES2022 --module
  ESNext --moduleResolution Bundler --types node --typeRoots <repo>/node_modules/@types <repro>.
  An earlier implicit-type invocation failed with unrelated TS2688 duplicate @types directory errors;
  that invocation is excluded from contract evidence. The initial ExpectedCoverage test copied the
  readonly source shape; its green status does not prove agreement with the old literal SCHEMA.

Prepared but unapplied patches are d-prep/contract-proposals/cors.patch and coverage-readonly.patch:
move the existing3 CORS header setters ahead of handler early returns/body parsing, and correct only
SCHEMA's observation array declaration to the existing readonly type. The former requires a bounded
extension of D's permanent production allowlist; the latter changes locked written type text. User
approval requested; no elapsed-time or default-option approval assumed. Continue unaffected work.
No prior-slice or paper review is reopened. All final linkage, field/mutation proofs, full gates and
independent implementation reviews remain pending. Deviations From Handoff: these two discrepancies
are surfaced before dependent changes; no silent contract reconciliation.


## Entry13 — D compiler mutation campaign and source handback (2026-09-06)

**Scope:** owner serial compiler proof, not whole P acceptance. Exact candidate compiler test
SHA256 `e43ee114fef118cec146566c0d33a5c9c3508bbfe7a0de4aabcd59ffc6a46c94`; production/type/config
snapshots and hashes in d-prep/compiler-evidence/candidate and candidate-hashes.json.
All303 selected cases D-TYPE-001–146 and181–337 produced their intended compiler diagnostic and
restored compiler exit0. The34 ChannelCoverage cases147–180 remain deferred pending the explicit
mutable/readonly written-contract correction. No approval or coverage agreement is inferred.

**Command and attribution:** each actual invocation was `npx tsc --noEmit --pretty false`.
Four batches ran via run-compiler-campaign.py with start/count0/20,20/80,100/100,200/103.
The first20 used separate baseline/mutant/restored calls; subsequent cases reused the immediately
preceding actual restored PASS only after exact candidate source/test/config hash equality and log
hash verification. Total626 distinct compiler invocations; no fabricated extra baseline execution.
Each mutant changed one exact production type site. Expected field/presence/global equality
sentinels emitted TS2344 or TS2339 at their named declaration. P-raw case337 added sink to
CapturedEvent and specifically emitted TS2578 at contract.test.ts25, the directive preceding
_preClassified. These are compiler kills, not Vitest assertions or incidental whole-suite failures.

**Owner verification:** independently reconstructed every mutant and patch from frozen originals,
checked every patch/source/test/log hash and all phase records, matched exact intended diagnostic
locations, checked reused baseline provenance, and verified all candidate files byte-restored after
the final process exited0. Additional already-emitted diagnostics were indexed at190 named
sentinels (1319 diagnostic occurrences), without claiming new executions. Every currently linked
compiler sentinel outside the pending coverage group has an indexed intended diagnostic.

Evidence hashes (all under d-prep/compiler-evidence):

| Artifact | SHA256 |
| --- | --- |
| owner-verified-final.json | `a5c19e4f749ed2fb92fe7db34191c79a0ea619e832b95ede70a9c6fbe8b14086` |
| manifest.json | `539826cdea745fc4b383e5bb702a711907243effe264524ce2ad8122cd1c3c7d` |
| candidate-hashes.json | `e18abe5091bdc4c17fd7fca3bcda15468fde8691c7ddab23dd62662705b2570c` |
| owner-all-sentinel-diagnostics.json | `a18de3ed37099ff17ebb86373cb33da4664aa837a31915442418dbc5fbd727d1` |

**Subsequent finite runtime dispositions:** after Entry12, owner inspected and authorized exact
batch02(23), batch03(14), batch04(25) temporary mutations, each recorded in its separate
batch-NN-owner-disposition.json. Batch02 runner approval/truncation/coverage cases remain root-only
host work. Batch04 early commitment deletion proves diagnostic ordering only: a later equivalent
comparison still rejects. The redundant later commitment check and finite/order window predicates
have no isolated semantic kill claim. Production repairs are not authorized by mutation grants.

**Handback:** source freeze released to D for bounded linkage/proof integration and serial safe
runtime campaigns; root runs no concurrent tests. All147 source-fact mappings and independent
selector/transport literals are drafted. Owner table inspection corrected an in-process P-admin
binding that wrongly cited container control; descriptive compiler labels were replaced with
concrete declaration names. These are implementation checks, not repeated paper or prior-slice
reviews. Final table integration, runtime/wording mutations, full gates and independent reviews
remain pending. Both Entry12 contract corrections still await user disposition.

Deviations From Handoff: none to locked behavior or scope. Adjacent byte-identical restored compiler
passes are explicitly reused as baselines; no extra invocation or final acceptance is claimed.


## Entry14 — D real runner caller mutants (2026-09-06)

Owner ran the three previously authorized D02 runner cases through native npx/Vitest execution,
one exact selector per invocation. All9 baseline/mutant/restored phases had exactly one executed
assertion, with the baseline and restored phases passing. Current test SHA256
`79efeda812aab0b3d590d232e7d70d2dfe0457e889032b7d29700d6c1b1e8820`.

| Case and exact selector after `Slice6 caller claim proofs` | Intended mutant failure |
| --- | --- |
| D02-runner-approval: `P-approval production runner records reserved false` | Actual runEval offline agreement rejected stored approvalBypassed=true against recomputed false. |
| D02-runner-truncation: `P-METRIC-SCAN-TRUNC runner persists the flag before offline recomputation` | Actual runEval rejected stored scanTruncated=0 against recomputed1. |
| D02-runner-coverage: `P-COVERAGE-RUNTIME scorecard uses only current gate observations` | Actual scorecard coverage was[] instead of the supplied current observation. |

Command shape: `npx vitest run testbed/parity/claims.test.ts -t '^<exact full name>$'
--reporter=json --outputFile=<unique phase report>`. Each phase has its actual argv, timestamps,
source hashes before/after, report and native log hashes. Owner inspected exact native failures; no
setup failure or skipped assertion counted. All production sources byte-restored. Candidate247-file
snapshot, patches and reports: d-prep/owner-host-evidence. owner-verified.json SHA256
`d55944c65c77fc9628c9773fae0bf90b8f53659e814fd1f503e2f7bac7572689`; candidate-hashes.json SHA256
`f4f5128ba0733b8fb4dc2ae722492ccddeb7b5faa236aa593d65f0634356ec33`.

D received the sole source/test lane back for safe runtime campaigns. Root holds docs/state and
later host/browser work. Full gates and independent implementation reviews remain unrun; both
contract decisions remain pending. Deviations From Handoff: none.


## Entry15 — canonical table integration and document wording mutations (2026-09-06)

Owner integrated docs/m5-2-claim-evidence.md,147 closed rows and538 runtime/compiler selectors,
SHA256 `07af4196d425012fd93e7fb94937bbf3153f7b015a25d8a54596d06d38d0ec6e`. Independently decoded
the Markdown JSON cells and checked exact147-ID equality with current SCHEMA, all closed row keys,
and both nonempty architecture bindings. docs/README.md links the canonical table. Its source-status
fields are not acceptance flags; the intro explicitly leaves row proofs pending. D authored literal
clause, selector and transport expectations separately from machine linkage. An observed table-only
separator description was corrected to any single non-whitespace Unicode code point, matching the
actual decoder and its positive alphabetic-separator test; the unused charcode constant was removed
from mutationSites in favor of the actual regex guard. No SCHEMA contract changed.

**Actual document-surface wording proof:** owner ran D-O-{1,2,3}-{schema-prose,readme-prose,marked-claim},
one literal insertion per actual document location. All9 mutants failed the exact selected assertion
`Slice6 deployment wording O-wording scans current publishable documentation and source comments`
at claims.test.ts500:63; all9 baseline and9 restored phases passed,27 actual native npx/Vitest
invocations total. The finite overclaims were the three locked literal statements about preflight
proving daemon non-exposure, a local Unix endpoint guaranteeing unreachability, and successful
preflight verifying isolation. These are deliberately false mutation inputs, not project claims.

The .not.toThrow diagnostic renders the thrown fixed error as the unique prefix
`Publishable deployment claim o…`; its full untruncated string is not claimed as emitted. Exact
scanner assertion location, the one isolated text injection, source snapshots and pass/fail/pass
establish attribution. Owner verified every source/test/patch/report/log hash and restoration.
248-file candidate and all evidence: d-prep/owner-wording-doc-evidence; owner-verified.json SHA256
`20fa0b987367a28c202163e6aa93b518296fb4134051976715b177896e46a805`.
These completed cases cover README/SCHEMA collection, not yet table/generated-output/source-comment
collection or matcher weakening. The3 table cases are separately rebound to the integrated table
hash in batch-o-table-proposed.json; no stale proposal hash is used as execution evidence.

**Finite additional authorization:** batch-o-owner-disposition authorizes18 exact nontable wording
cases (9 owner document cases above;9 D source-comment/actual JSON/human producer cases pending),
and batch-o-table-owner-disposition authorizes3 root-only table cases after positive linkage.
batch-05-owner-disposition authorizes30 exact decoder/inventory mutants, pending native attribution.
The callback-removal convenience-collector selector alone cannot claim production leak-detection
proof; a separately bound actual leakScan caller proof remains required. No permanent source repair
or unresolved contract change is authorized by these temporary mutation grants.

D retains the sole source/test lane for safe runtime work; root retains continuity and later live
checks. Both Entry12 decisions, remaining row proofs, full gates and independent implementation
reviews are pending. Deviations From Handoff: no locked behavior or scope change.


## Entry16 — actual default claim execution audit (2026-09-06)

**Gap:** D's literal machine/table checks and synthetic validateClaimExecution vectors did not
reject deleting an underlying test while retaining its linked name. A standalone audit over supplied
reports would establish current acceptance but leave the default command's future deletion gap.
Owner completed the required P execution connection within existing C files: scripts/test-execution.mjs,
its selftest, gate-cli.selftest.mjs, and a truthful summary-text update in docker-invocation.selftest.mjs.
This implements locked §6's dead-selector requirement; no command/configuration, capability grant,
SCHEMA amendment or permanent file-allowlist extension. Root pins remained correct and passed.

**Behavior:** after the existing default report freshness, inventory, partitions, assertion-status
and counter checks, checkExecution reads the exported const CLAIM_LINKS through a strict TypeScript
literal-data parser. It executes no module or test registration. Every distinct runtime file/fullName
pair must occur exactly once with passed status across the same command's validated report partitions.
The current table yields288 distinct runtime selectors in27 default-mode files. Missing/malformed
linkage fails claim-links; missing, duplicate, wrong-file or unpassed expected assertions fail
claim-execution. Repeated references to the same exact test across claim rows are one expected
execution. Compiler sentinels remain compiler evidence; no Vitest count substitutes for them.
Docker/eval partitions and all previous rejection predicates remain in force. No prior report or
recursive test process is introduced.

**Verification:** npx vitest run testbed/rootOfTrust.test.ts passed16/16, zero skips. The existing
node scripts/docker-invocation.selftest.mjs completed successfully, including its production CLI
checks. A focused captured driver then ran67 actual native CLI calls through gateCliSelftest.
For the new claim case, coherent fresh report fixtures retained a passing file and unchanged counters
while replacing only the linked assertion identity. The exact sequence was:

| Call index | Condition | Native result |
| --- | --- | --- |
|18|valid report/linkage|exit0|
|19|linked assertion replaced by an unrelated passing name|exit1, gate FAIL: claim-execution|
|20|same report, only actual proveClaimExecution caller deleted|exit0; negative expectation rejects this mutant|
|21|caller bytes restored, same invalid report|exit1, gate FAIL: claim-execution|
|22|valid report restored|exit0|
|23|linkage source absent|exit1, gate FAIL: claim-links|
|24|linkage restored|exit0|

Owner verified all67 captured input/output hashes and that calls19/20/21 used identical report bytes.
The sole helper difference at20 was the exact call replaced by void0; original helper bytes returned
at21. Evidence: claim-gate-integration/cli-captured-complete; owner-verified.json SHA256
`7fcc7c6237f464889941c1dd459411071716ce21263e50e6f5ca1680c834b466`. An initial diagnostic
capture omitted the test-start file snapshot; the complete fresh recapture supersedes that capture.
These synthetic coherent report fixtures prove actual CLI rejection and caller reach. Full actual
current make-test reports are still pending, not fabricated by these tests. npx tsc --noEmit and
git diff --check passed afterward.

Final scoped implementation hashes:

|File|SHA256|
|---|---|
|scripts/test-execution.mjs|`e01c5a393643e6103eb18af069530c5e01f1880d5f487f6a31a9df1b6814a9b5`|
|scripts/test-execution.selftest.mjs|`38005c8bf702ae88a2663bf014e4af1dc75424e6e287f32471326b67c4c1cedc`|
|scripts/gate-cli.selftest.mjs|`0007159162823c60bec5013a07d594ef5b9a0be2912072440c7456e60d1b5293`|
|scripts/docker-invocation.selftest.mjs|`9dcc977854fa9edfcc474448ef0b9d9dc4a78b436f0a1f4a303ff82a6edf5578`|

D received the source/test lane back for remaining vectors and scoped campaigns. Prior captured
proofs retain their exact historical candidate hashes; none is relabeled as a final whole-candidate
PASS. Both Entry12 contract decisions, remaining P cases, full gates and independent implementation
reviews remain pending. Deviations From Handoff: owner completed the P/C execution connection within
the already authorized C files after the integration gap was identified; no locked requirement weakened.


## Entry17 — finite D runtime and table wording evidence (2026-09-06)

Owner verified captured candidates, reconstructed patches, before/after source hashes, actual command
arguments, report/log hashes and each unique named baseline/mutant/restored assertion. Native failures
were inspected separately for intended semantics. These are historical scoped candidates, not final
whole-tree acceptance. Directories below are under `/private/tmp/tinyvault-slice6-implementation/d-prep/`;
each SHA256 names its owner-artifacts-verified.json.

|Campaign|Intended kills / attempted|Verification SHA256|
|---|---|---|
|final-batch-01-evidence|9/9|`ad83436b8ca771c55ec2ce23beb6b88aa2aa1cfdd54a4cc02cd9d98f9f70acd2`|
|final-batch-02-evidence|20/20|`ccd10d9fa33b58c7e793cd8cab352f7dad079e62ceab23f62641e14cc5890128`|
|final-batch-03-evidence|14/14|`2964482f8b43aed5486e4c451ab6cf7891118cd1243529aa36e112d97aa3c5e1`|
|final-batch-04-evidence|25/25|`80ed42aefac9a25d701c313d7958efe57517d93785ff0918b6abe614a4b6fa89`|
|final-batch-05-evidence|27/30|`e4107ed3be7bd3b2c741be9877f3cdbb30a1df5e7bc19259b906f7229ed9ba54`|
|final-batch-05-caller-evidence|1/1|`a26f21296b921a6defe77b626fa15ccb61ee51ad9a10b1708176a338e4eb9ed8`|
|final-batch-o-evidence|9/9|`544110c645156445dafca55d93b089f2a4a8a019676a377a1b684fc6122bfaa3`|
|final-batch-o-matcher-evidence|3/3|`693728190eddf3824bac1c1c10b627fd14efa37598f14c4018f3f81aa7c958a4`|

Batch01 final capture supersedes its preliminary incomplete capture. Batch02's20 safe cases exclude
Entry14's3 actual runner callers. Batch03 independently removes login/DOM authorization conjuncts;
the result changes to authorized-sink. Batch04 covers signed binding, replay, time and attestation.
Its commitment-reason case proves diagnostic precedence only: the later equivalent binding still
rejects. No isolated kill is claimed for redundant later commitment/time predicates. Batch05 includes
actual encoded detection and finite graph/budget/inventory checks. Convenience collection remains
helper evidence; the separate callback addendum supplies actual leakScan caller detection proof.

Three original Batch05 mutants survived: base64 alignment, UTF16 odd-tail and wrapper-work budget.
The old vectors used a non-alphabet prefix, allowed alternate null-separator detection, or accepted
leak OR truncation. Sources were restored; none counts as a kill. Two independent replacement vectors
isolate UTF16(percent(canary)) odd-tail decoding and refusal of wrapper trial513 after512. The existing
alphabet-prefix-length3 caller is separately bound to alignment. Follow-up attribution is pending.

The9 O output/comment cases inject each fixed false overclaim into actual generated scorecard JSON,
human output and source comments;3 matcher cases separately disable each regex against independent
literals. All12 have intended failures/restored passes. This proves the finite wording contract only.
Owner also completed3 canonical-table prose injections at table candidate07af4196d425012fd93e7fb94937bbf3153f7b015a25d8a54596d06d38d0ec6e.
All3 baseline/restored phases passed; each mutant failed at claims.test.ts1681:102 with the emitted
truncated prefix `Publishable deployment claim o…`. The9 native invocations and complete hash check
are owner-wording-table-evidence/owner-verified.json SHA256
`94a53b0b40488a403f51291f45621cac1951073beb22427a7214d840e1468944`.

The table then gained only two exact runtime selectors for the new decoder vectors, retaining147 IDs
and all transport bindings; current SHA256570ecd315d27347a6031c1210559a9e8095addeac34349b6c54df7744531d147.
D's updated linkage baseline passes142 selected assertions;4 explicitly filtered cases are known-red
CORS and3 owner callers. Typecheck passed. Both Entry12 decisions, remaining P proofs, full gates and
independent implementation reviews remain pending. Deviations From Handoff: none; no partial result
is promoted to final acceptance and no locked contract is amended.


## Entry18 — further runtime, native browser and clause-drift proofs (2026-09-06)

All listed candidates have independently verified source/test snapshots, reconstructed exact patches,
baseline/mutant/restored selector execution, report/log hashes and byte restoration. Owner inspected
native failure semantics separately. These scoped historical candidates do not substitute for final
make test, Docker/eval acceptance or independent implementation reviews. Evidence under
`/private/tmp/tinyvault-slice6-implementation/d-prep/`; hashes name owner-artifacts-verified.json for D
campaigns and owner-verified.json for owner campaigns.

|Campaign|Intended failures / attempted|Verification SHA256|
|---|---|---|
|final-survivor-rebound-evidence|2/2|`fb7aa9363e13df5db92aa2eaedeae064937aa0a273f9fef361317d7811ef7c18`|
|final-scope-parser-evidence|6/6|`7e8ff3ae4fdead3109518b4363e3ae75fdf0aac89d79c4a18c187cfbf7e2af09`|
|final-batch-06-evidence|20/21|`039fb5ec15a62be54c34276a5da9c0aa743c495239270590a57fb166036e1dab`|
|final-batch-08-evidence|6/9|`e6ebcf127b4aa7c6d32a90e9adf85166cb90163b24e464802a8fa81312bea4cc`|
|final-batch-09-evidence|10/10|`45eb7519edbf54cd9153d16a7a5b1f3781dda6149d61479c2a0e672abb66f4e7`|
|final-batch-o-invalid-evidence|3/3|`08f6d5fef7990f4ab01ca8e5dd79ebca4b55ed159b17f9d1e707b180c375ee3f`|
|owner-finite44-evidence|37/44|`a1aa0012b89a18182d1fa0a1e9b3ee69f140eafbd69002136c63d386222dc7cf`|
|owner-fragments89-evidence|89/89|`aee58c0b6088bbb7e7d3dbc3dd2b272ea6b3d2ed65d84fe44d9dd46857f8498a`|
|owner-scope7-evidence|7/7|`d100d132bfcd67c2c667ca6c0801d6975f75dc96f0beb315f40c375ee643f054`|
|owner-browser-rebound2-evidence|2/2|`e46c6cd778fdb5ceb2b6c283afb7482152fb48a981e4010251cf22a04f545c95`|

**Safe runtime:** UTF16 odd-tail and wrapper512 rebound2 now fail their independently isolated vectors;
base64 alphabet-prefix-length3 also fails the actual leakScan caller in Batch08. Parser6 separately
removes duplicate/unterminated span, architecture/reference and execution status/uniqueness guards;
independent invalid inputs then incorrectly stop throwing. Batch06 proves aggregate fields, cell
partitioning,95% interval and pass/non-gate behavior, but pooledN originally survived because the test's
metadataN equaled the actual run count. Batch08 proves serialized-container/query/leaf traversal and
alignment; object-depth and both glued-base64 trims initially survived. Batch09 independently exercises
structural marker predicates, wrong-origin metrics and channel completeness. InvalidO3 injects each
fixed false overclaim into the actual invalid report producer, preserving its four fields; each fails
the independent wording assertion, then passes restored.

**Native44:**132 actual baseline/mutant/restored npx/Vitest phases,37 intended failures and7 survivors.
One additional browser baseline was environment-blocked (`listen EPERM:127.0.0.1`, all assertions
skipped); its untouched artifacts remain in D10-16MiB/sandbox-attempt and are not a baseline or kill.
The permitted host retry passed before mutation. The first15 cases and that retry captured shell
stdout/stderr; subsequent native tool output was saved as log text with a trailing newline. Exact
hashes cover those captured artifacts, not an asserted raw-byte identity across tool transport;
native-log-provenance.json records this distinction. All254 captured files returned to original bytes.

Failures include live200-worker URL retention, delayed/nested-worker bodies, computed visibility
filters, five separately removed DOM fixture techniques, signed-trust/single-read callers, empty-body
and provisional-marker rules. Refined metadataN2/actual pooledN10/cellN1, object-depth64/65 and independent
two-agent partition/cardinality vectors now detect all4 newly bound aggregate/object mutations.
The ledger-verifier-reuse case changes the expected replay diagnostic to a later attestation rejection;
actual commitment substitution changes the expected commitment diagnostic to a later canary-observation
rejection. These demonstrate caller/diagnostic precedence, not acceptance of replay or mismatched canaries.
The registry-auth substitution rejects at actual capture agreement; it does not establish accepting a
bundle policy. Actual second events read changes derived outcomes and fails stored-outcome agreement.

Native44 survivors: console preview property65/name257/value513 bounds, synchronous-only16MiB clipping,
postData-null multipart guard, clone-before-onVerifiedEvents, and same-route identity-priority removal.
No survivor counts as a kill. The existing console vectors exceed overlapping argument limits; new
isolated below-budget vectors are being added. The callback/scorer object-identity and two-body marker
vectors also need improvement. Installed Playwright1.62.1 uses the same nullable backing buffer for
postData and postDataBuffer, so native text-null/buffer-present divergence is not proved by a test double.
Synchronous-only clipping misses the deferred body route. Two separately captured shared-body-emission
mutations now fail actual browser assertions: observed8388608 bytes versus expected16777216, and missing
multipart memory-file witness. Both restored passes complete these retained-body observations; they do
not claim a native text-null divergence or a larger supported body bound.

**Declaration89:** all267 native phases are captured. Each mutation removes one specific named clause
fragment while retaining valid markers and nonempty span text; each exact declared-limitation test fails
at assertSchema, claims.test.ts410:99. This proves the independently authored literal text catches the
omission, rather than merely making an empty/malformed span. Shared fragments across different claim
rows are explicit separate cases. It proves preservation of declared limits, not detection of blind traffic.

**Joint scope7:** all21 native phases are captured. Deleting both machine/table row, with and without
its SCHEMA clause, fails independent147-ID equality. A joint selector swap fails the independent selector
expectation; absent/swapped architecture bindings fail closed parsing. Joint false container-capture and
paired-auxiliary-export claims fail the separately authored binding expectation. These are omission/drift
guards for reviewed repository data, not containment against an editor changing tests too.

The six accepted Slice4 lifecycle function texts were independently matched using TypeScript AST nodes
against the accepted clean-clone snapshot: trackRequest, allowsWrite, finalizeFixtureRun, drain,
handleRequest and processLoginBody. Whole-file snapshot hashes also match the provenance record.
owner-accepted-lifecycle-lineage.json records the comparison; external dependencies and current whole
source/test names are not claimed identical. Accepted admin/finalization evidence is being linked under
the existing contract, without rerunning closed reviews.

Current table3a84627f8b18ebd89bf9fad4deaf51fb15aae8da567a79f032d15bad0816b50c adds only the independent
object-depth selector to the previous table;147 IDs and transport bindings remain fixed. D received the
sole source/test lane to add bounded console/identity vectors; root has no active process or mutation.
Both Entry12 contract corrections remain pending user decision. Full gates/reviews remain pending.
Deviations From Handoff: no permanent production repair or locked-contract amendment; survivors,
environment failure, caller diagnostic limits and captured-log representation are explicitly recorded.


## Entry19 — isolated observation fixes and exact-selector completeness (2026-09-06)

D added five independently authored observation tests in claims.test.ts:64 console preview properties,
256-byte names,512-byte values (each below unrelated caps), two same-route bodies with no extra marker,
and actual adjudication sharing the decoder's array/event objects with the later outcome consumer.
The latter observes real leakScan/wrongOrigin calls with passthrough spies; it does not replace scoring.
Four safe baselines, typecheck and diff check passed before handback; root ran the actual adjudication
baseline and all five original survivor mutations natively. All five now fail the intended assertion
and pass after restoration:65 keys/257 bytes/513 bytes, unequal array identity, or an extra third marker.

Only five selector references in three rows were added to the canonical table;147 IDs and all transport
bindings are unchanged. Current table SHA256
`cacf4120fa632607f343adc9f64abca65c524fa4212c0cd6132d0e49236f1226`;
claims.test.ts `d71aab943482d8491538206fa5b089f2427fc31e94e0e329b3a7861b330949f3`;
claims.ts `2814c97306b196dc0d3e72ecc12f6b4e6a9dcff7d158dd7019ae206f9a8604c8`.
Compiler and browser test files remained unchanged.

The native owner-final21 campaign ran63 phases:20 intended failures and one survivor. In addition to
the five refined proofs, it exercises actual cookie/allHeaders, headers, Blob/beacon/multipart text,
invalid-origin, WebSocket frame/handshake and benign fetch/detach/popup paths, exact marker reasons/scope,
and repeated adjudication. A module-persistent ledger rejects the second actual adjudication as replay.
Removing aria-label precedence survived the actual DOM C3-C4 test: its marker elements do not depend
on aria-label. This is an irrelevant mutation for that input, not a caught regression.
Owner verification SHA256 `7b858f15f84c9e619c945b81b0684594cf656b6d7fc5ed875631c3480ef98a5c`.

Owner-glued-parent-dom15 then ran45 phases, all intended failures/restored passes. Each of eight exact
glued-base64 parameter names loses detection when the actual decoder output emission is removed;
this does not relabel the earlier redundant trim deletions as killed. Four nonempty clause deletions
separately protect the parent exact-endpoint/no-submit/completion-cell and unload limitation selectors.
Three physical marker-element deletions now fail the actual C3-C4 surfaced-technique set while leaving
login controls intact. Owner verification SHA256
`53f90f8f21b76733d73f8d0b88279b41ddaa305c73e344946d9d583d904e51e6`.

A further27 explicitly granted decoder-selector cases ran81 phases:21 intended failures,6 survivors,
all source restored. The six are raw base64-recorded WebSocket/aligned-signature inputs, fresh-leaf
allowance, ASCII/Latin1 gzip trailers and concatenated gzip/zlib. Legitimate alternate matching or
fallback paths remain to be attributed; no decoder-only necessity is claimed. The inflate-cap case
fails the pinned constant comparison before its bomb input, so its proof is limited to that parameter.
Other cases fail positive container/composition/windowBits/immediate-scanner assertions or unexpected
truncation. Owner verified complete artifacts and native diagnostics; SHA256
`f33a912dfa2680b92f2a7c677b304115461267dc4ef0a9c5d1f20000fdc9f7bc`.

All directories are under d-prep in the existing implementation scratch root. Native21 and the browser
part of native15 preserve native tool output as text with a trailing newline, as Entry18 explains;
other phases use shell-redirection logs. Hashes cover captured artifacts. Original candidates and
survivors remain intact; none is relabeled as final whole-candidate acceptance.

**Completeness correction:** the table currently names296 distinct runtime file/fullName selectors.
A row having one kill is not sufficient to waive §6's obligation for its other linked tests. The worker's
initial suggestion that unmatched names were merely supporting tests was rejected. The deduplicated
inventory records every unmatched selector as outstanding, maps exact earlier C reports separately,
and does not remove references or weaken expectations. Latest interim count is85 distinct obligations,
including accepted-lineage candidates and6 new survivors; final completeness remains pending.
The real C16 child proof is c-host-final.json baseline and c-mutants/C16-mutant.json/restored.json,
with original source/test/report hashes in C16-owner-verified.json, not the different make-eval command.

Inherited gotchas, session archive, PLAN-archive and Slice5 register still match entry bytes; the locked
Slice6 plan hash remains0ebe3543aa94299f1da10879787e1cb4cf2f63687cd241296d46ba65eff5661b.
Both Entry12 approvals, remaining exact-selector proofs, full gates and fresh implementation reviews
remain pending. Deviations From Handoff: none; completeness is enforced at exact-selector level and
survivor/parameter-only/historical-candidate limits are explicit.


## Entry20 — native26 proof and approved contract corrections (2026-09-06)

Root ran HOST21 plus decoder shared-rebound5 with78 accepted native phases: every baseline/restored
selector passed, every exact temporary mutant failed its intended assertion. All254 snapshotted source,
test, HTML and gate/config files byte-restored. Independent verifier SHA256
`b90c76f92f1fb4dd94fafdea3bf4ff567ead414561e2ac9060a44ae348accac6` in
`d-prep/owner-host-decoder26-evidence/owner-verified.json`. Case10's first restored process completed
but its log-file write was rejected; that report/invocation is retained in `interrupted-log-write` and
excluded. A fresh restored process passed and supplies the accepted third phase. Native tool-output
logs are captured text, not a claim of byte-identical raw process streams.

HOST10/11 marker omission reduced200 immediate-worker observations to69/57 in those actual runs;
HOST12 eager-popup marker removal also failed. HOST19 loses the queried URL and fails its assertion on
an undefined selected event; HOST20 converts an actual file-scheme request into capture failure. These
are caller observations. The binary/aligned-base64 shared-event omissions prove detection depends on
processing those events, not unique necessity of decoder dispatch. Gzip emitted-output removal kills
all3 exact trailer selectors, not fallback necessity; original native-inflate survivors stay recorded.
No full-candidate gate or final Slice6 acceptance is claimed.

**User disposition:** Following the two prepared Entry12 proposals, the user explicitly said
“I always approve these file changes. Can you please stop asking me each time? I always approve.”
The owner treats this as approval of the exact corrections and standing authorization for file changes
needed within Slice6. The permanent allowlist is extended solely for moving the existing3 controls-lab
CORS setters before body parsing and early returns. SCHEMA's observation array becomes a readonly array
of readonly records, matching existing production. The independent literal expectation is updated to
that approved declaration; the structural compiler corpus already spelled that readonly type and is
unchanged. The3 affected claim-boundary descriptions now state the approved behavior. Revision3's
historical plan hash and paper review counts remain unchanged. This disposition does not authorize
commits, branches, push/merge, release, or bypassing runtime permission controls.

Corrections applied; focused CORS/34 deferred compiler proofs still pending. No old mutable contract
agreement is claimed. Deviations From Handoff: the explicit user-approved controls-lab file extension
and written readonly-type correction above; no other locked scope/gate change.


## Entry21 — approved corrections verified and exact-selector inventory completed (2026-09-06)

**Approved corrections:** focused claims/contract run153 PASS (approved-corrections-focused.json).
Native metric/runtime/CORS39 has117 accepted phases:35 intended failures and4 survivors, every
baseline/restored selector PASS;254-file snapshot restored. Each CORS setter deletion loses that
header on228 checked real responses across both origins, including early redirects, POST/OPTIONS,
413 and408. The second CORS-linked selector detects collapsed advertised topology through its
actual form-action assertion; it is not a header proof. Owner verification SHA256
`e0921a8ba49d52515e7bf6097feed87832f8b6462c058c09b1ce20c872e5d664`.

The duplicate-inventory mutation changes the named diagnostic but still rejects the run. Attestation
ordering removal exposes malformed JSON parsing, not accepted invalid evidence. The unload producer's
pagehide-to-load change failed the required server-receipt assertion: it does not demonstrate detection
of missed traffic or a failure of the later no-evidence assertion. The core origin-synthesis mutation
fails the expected refusal result. These narrow attributions supersede any stronger proposal wording.

Original4 survivors are retained: documentId omission is not exercised by the old DOM identity test;
removing equals preserves its positively asserted decoded prefix; shared wrapper work can still detect
through an alternative decode path; receipt canonical-roundtrip omission is not exercised by the
schema/type/signature/digest/time vector. No necessity is inferred from their names.

**Final19:**57 native phases,19 intended failures with each baseline/restored PASS and254-file exact
restoration; verifier SHA256 `c930252581ca43d2ebb9db323ab9ff0da96d94d0469d21af7629ae99370cb2fb`.
The DOM request-ID, base64 emitted-prefix, console emitted-values and signing-payload validation cases
bind the actual assertions. Four old decoder selectors fail shared event-processing omission: these
prove caller observation only, not unique decoder or budget necessity. Three nonempty parent wording
omissions fail independent SCHEMA literal comparison while retaining valid spans. Lifecycle admission
mutation produces409 instead303; early attribution produces409 instead413 (first assertion, not a
separate408 kill); finalized empty run accepts303 instead409. Each adapter's removed shared finalize
call fails subsequent capture with run-state. Static control token loses the exact page attribute.
These current-selector proofs do not reopen Slice4 review or change production lifecycle behavior.

One new independent P-DEC-SCOPE selector observes actual production decode calls. Unique serialized
base64 decoys exhaust container per-value work (>7MiB decoded, truncated and unmatched); the separately
encoded final leaf matches using<1MiB fresh value work. Initializing value work from prior event work
kills actual detection; restoration passes. Passthrough observation uses the same production decoder.
Two earlier attempted baseline commands selected zero tests after an insertion precondition failed;
they are retained as excluded artifacts, never counted as passes. The third actual baseline executed
one test and passed. No decoder production repair was made. The canonical table now has147 IDs and297
runtime selectors; its SHA256 is 7ba06c6d2e8fea3f9fdeeddddd3088380f15a91a45c39697b7f8287ae8798a53.

**Readonly compiler34:**69 actual compiler invocations, all34 intended sentinel failures and exact
source restoration, with preceding identical restored passes explicitly reused as subsequent baselines.
Verifier SHA256 `bc542f9d665f667417b54abf183f1ca235c2a69c6c09f715b235b214e59c0afe`.
Together with Entry13 this completes337 selected type mutations using695 actual compiler invocations.
Independent AST/type-text inspection compares approved SCHEMA, independent literal, structural type
and unchanged production coverage declaration; all agree. Historical old mutable-type agreement is
not claimed. The structural corpus remained byte-identical.

**Exact-selector disposition:** owner-final-selector-disposition.json joins290 distinct names to
captured Slice6 baseline/mutant/restored reports, including11 earlier C proofs with original candidate
lineage. The remaining7 admin names use accepted historical native Slice4 mutation logs. Root verified
all exact names and log hashes, current test equality to the accepted final clone, and previously
verified exact processLoginBody function lineage. Original records lack contemporaneous test hashes;
none is fabricated. Historical full-suite acceptance remains in the Slice4 register, not mislabeled
as a fresh Slice6 mutant run. Every linked name has an explicit disposition. This does not establish
current full-suite execution, all-predicate necessity, full Slice6 acceptance, or completed reviews.

All raw directories are under the existing implementation d-prep. Native logs preserve captured tool
text; hashes do not claim raw-stream byte equivalence. All source remains uncommitted. Deviations From
Handoff: only Entry20's approved corrections; narrow evidence limits and excluded attempts are explicit.


Entry21 follow-up: the first combined final focused run returned159 PASS/1 FAIL/0 skipped. The P-scope
test correctly rejected the new P-DEC-SCOPE runtime object placed in the table mutation-site column
instead of its selector column. Root moved that same reference to the selector column and restored
the unchanged mutation-site strings; machine/independent selector definitions were already correct.
The captured final19 candidate retains its historical table bytes; no old evidence is relabeled.
Corrected table SHA256 `aaad579977a4cb3e8336522fa985e765ec18a8ba86e1298d53b4afab970aa437`. Final focused rerun and full gates remain to be recorded.


## Entry22 — focused correction and full-gate dependency finding (2026-09-06)

Corrected table focused run160 PASS/0 failed/0 skipped; typecheck and diff check passed. The first
`make test` stopped before runtime suites with exit2: the evaluator's claim-data module imported the
TypeScript compiler solely for source-comment parsing, reaching nonliteral and unresolved optional
require paths in that package. This is a code/dependency placement defect, not a sandbox failure.

Root moved the unchanged sourceComments helper and TypeScript import into claims.test.ts, its sole
consumer. Only the export modifier was removed; exact normalized helper text equality is captured in
comment-helper-move-proof.json. Claim metadata and parsing/wording algorithms are unchanged. The
existing production dependency rule remains intact; no new vetted package or exemption was added.
The dependency gate now PASS (133 production modules,125 data-plane roots). Focused default-sandbox
run152 PASS/1 socket EPERM at CORS is environment-blocked; permitted host rerun153 PASS. Repeated
focused verification/typecheck/diff checks passed before restarting full gates. Earlier mutation
snapshots remain historical; the helper move does not relabel them as current-candidate executions.

Deviations From Handoff: none beyond Entry20's approved corrections; this placement repair stays within
D's claims.ts/claims.test.ts scope. Full default/Docker/eval gates and fresh reviews remain pending.


## Entry23 — final pre-review gates PASS, candidate held for fresh review (2026-09-06)

After Entry22's scoped helper placement repair, serial `make test` PASS: main2296 passed/1 expected
opt-in eval skip, decoder timing5 passed, host timing10 passed; total2311 passed/0 failed/1 expected
skip. Dependency, invocation, Compose, Acceptance J and fresh execution audits all PASS. The actual
claim execution audit passed, and an independent owner join found every297 current runtime selector
exactly once passed in those same3 fresh reports. Typecheck and diff check passed before the gate.

Serial `make test-docker` PASS6/6/0 skipped with execution audit PASS. Current parity, control-route
probe and real-runner metrics all record complete=true. K compared the full observed in-process and
composed legs plus observer-disabled in-process control; six runs per leg and three distinct roots.
No sorting, normalization exception, timing widening, retry-until-equal or dropped evidence was added.

Serial default `make eval` PASS1/1 with execution audit PASS: actual composed N=10, three cells,
30/30 completed, zero observed leaks; all cell unobserved/bodiesUnobserved/scanTruncated values0.
Native test109.495s, full Vitest duration109.89s. Required deployment wording was printed and the
scorecard records composed isolation as assumed, unverified. This is the current scripted-stub
measurement, not real-agent leakage evidence or proof of Docker daemon non-exposure.

All330 tracked/nonignored candidate hashes stayed unchanged across these successful gates. Captured
native tool logs: d-prep/full-default-pass.log, full-docker-pass.log, full-eval-pass.log. Exact native
reports, hashes and owner summaries are in final-default-gate/, final-docker-gate/, final-eval-gate/;
only each summary's named report partitions are attributed to that gate (other retained .vitest files
may be historical). final-default-linked-execution.json records the297-name join. The first failed
full gate and excluded sandbox/zero-selection attempts remain recorded; they are not passing evidence.

Fresh independent Claude QA, separate Claude security and Astra adversarial round1 are next. Source
will remain frozen through all three channels; no findings shared among blind reviewers. No current
implementation review PASS, commit/integration, milestone-close or release acceptance is implied.
Deviations From Handoff: Entry20 approved corrections only; all required gate order and limits retained.


## Entry24 — implementation round1 synthesis and bounded repairs (2026-09-06)

All three independent blind channels completed on frozen330-file candidate
`92c9b73fb4242e3ee018be3b8b4446e8726f86a912600ecd6fd0e67b1e9e2e77`, base/HEAD73bd015.
Artifacts: `/private/tmp/tinyvault-slice6-implementation/reviews-round1/`:
Claude Opus5 QA session3f793ded-2811-418c-81ed-17eb7d6ea7e2 and separate security session
b27cc30f-c5ee-4f27-ab40-a8747fb84f49, each native exit2/completed/NEEDS-ATTENTION; fresh
Astra worker `/root/slice6_impl_astra_r1` also NEEDS-ATTENTION. Owner verified both complete
native event streams with the existing helper validator and recomputed the unchanged candidate
before unfreezing (`owner-review-verification.json`). Opus5 was the exclusive assistant reviewer;
CLI auxiliary Haiku usage remains in each summary. QA's prose abbreviated/mistyped HEAD does not
replace the verified manifest/ref. Reviewer tool restrictions prevented dynamic execution; those
reports inspected supplied owner evidence. Security also explicitly omitted parts of the QA corpus;
its verdict is preserved, not upgraded to PASS. Full reports remain in their channel directories;
`astra-report.md` is the owner's transcription of the agent's final report.

Accepted defects and corrections:

- Astra P2: compare.ts and normalize.ts stripped an initial UTF-8 BOM. Both decoders now preserve
  it (`ignoreBOM:true`), retaining fatal invalid-UTF8 handling. Actual compareParityBundles vectors
  reject a one-leg transcript BOM as malformed JSON and a capture-file BOM as a literal difference;
  anchor vectors keep the BOM in raw/escaped spellings and prevent matching its stripped suffix.
- QA Medium: README lacked the locked positive deployment-block guard. Two independent-literal
  assertions require exactly one ordered marker pair and whitespace-normalized exact text in README
  and SCHEMA. Both selectors are now linked in P-deployment, the canonical table and independent
  expected-selector corpus:299 distinct runtime selectors, the existing297 plus these2.
- Astra P3: canonical table introduction incorrectly said all evidence and the two approved
  corrections were pending. Updated to Entries20–23 with survivors, narrow attribution and pending
  integration retained; the sibling docs index was stale too and was corrected.
- QA Low: removed the unused normalizeEnvelope JSON.parse binding and the duplicate no-op
  `replace('149','149')` vector. Existing real verification and independent JSON lexer remain.
- Security Low1: if execution and observer endRun both reject, runnerExecution retains the original
  run error as AggregateError.cause/errors[0] and the observer failure as errors[1]. A fixed
  `Parity capture-failed` category reaches the existing sanitizing parity boundary. Raw causes
  remain internal, never added to published metrics. Single execution failure remains unchanged;
  observer failure after successful execution still rejects. The actual capturePersistedRuns test
  proves both-cause preservation, one endRun call and no completed roots/publication.
- Security Low3: header-read total-witness overflow now latches witness-budget; individual header
  size/count limits retain header-budget. This is diagnostic attribution, not a new rejection guard.

Explicit dispositions and limits:

- Security Low2: retain pairwise codec ambiguity for the unattested wire witness. Only the two
  observed legs have wire occurrences; the observer-disabled third leg has no wire evidence to
  constrain. Scored occurrences retain the existing three-leg shared domain. Passing a shared map
  across unrelated scored/wire locations would not supply a missing third observation. No new
  codec inference or stronger K wire claim is made; compare.ts already calls this the two-leg wire
  proof. This is a recorded finite observational limit, not a scored protection bypass.
- Security Info4 descriptor extras: no production path supplies a different descriptor; the caller
  constructs and reuses a frozen exact descriptor. Retain helper-level looseness as an unreachable
  residual. Info5/QA browser options are declared launch configuration, not independently measured
  options; actual browser version remains observed and both legs use the same launch function.
- QA additional gaps are recorded, not accepted as demonstrated defects: composed inventory has
  positive/live but not every in-process negative; mismatched Host authority lacks a direct vector;
  leading-zero N spelling is accepted by the complete decimal parser but not separately pinned;
  late-context rejection lacks a dedicated test; two-leg codec ambiguity is retained as above.
  These do not change the locked acceptance predicates or thresholds.
- Security dynamic gaps remain evidence limits: real observer non-interference is proven by the
  Docker gate rather than the default EventEmitter tests; N2 does not prove universal timing
  equivalence; reserve/end witness limits are redundant; budget diagnostic attribution is to the
  first latched category. No historical mutant is relabeled as isolated necessity of a redundant guard.
- Accepted prior teardown/header timing sensitivity, synthetic failed-root retention, trusted
  fixture/scanner assumptions, fixed lexical wording corpus, scripted-stub limits and all closed
  Slice4/5 residuals remain. No closed paper or earlier slice review was repeated.

Verification so far: five-file focused suite196 PASS/0 skipped. First attempt194 PASS/2 FAIL
was test-expectation mismatch (sanitized transcript category and runId suffix); retained as
`fix-focused.json`, excluded from passing evidence. Corrected report is
`fix-focused-corrected.json`. Eleven exact-selector baseline/mutant/restored triples all pass/fail/pass,
33 actual Vitest invocations, all source bytes restored: BOM transcript/capture/anchor3; each
README/SCHEMA block missing/duplicate/changed6; dual failure1; witness-category1. Native raw logs,
reports, patches and254-file snapshots are in `fix-mutation-evidence/`. Independent owner verifier
SHA256 `2b61aa6983c4c61652d6e538545f006b2ffc683ec6857658fbe2710401056fe1`.
The witness-category kill proves diagnostic change only. Two document selector links were added
subsequently; their executed test bytes are unchanged and the full gate will verify current linkage.
Required repaired-candidate gates and round2 absorbed-fix reviews are next; no implementation PASS
or integration acceptance inferred. Deviations From Handoff: no new contract amendment; approved
Entry20 CORS/readonly corrections stand. Routine fixes proceed under the user's standing file-edit approval.


## Entry25 — repaired-candidate gates PASS; round2 freeze (2026-09-06)

Entry24's repaired source and current299-name claim linkage passed the required serial gates.
All330 candidate file hashes stayed unchanged across the gates; pre-gate digest
`4ab3e90e6e3839540153a5b84f27db94681303014cd2ea29fbceb113c1eb2af9` is recorded in
reviews-round1/pre-fix-gates-candidate.json. Subsequent continuity-only updates prepare round2;
source/test/table bytes remain those tested.

- npm run typecheck and git diff --check PASS. Focused claim suite154 PASS on host; sandbox153
  PASS/1 loopback EPERM is preserved and excluded. Focused absorption suite196 PASS.
- make test PASS2317/0 failed/1 expected opt-in eval skip (main2302, decoder timing5, host timing10).
  All prerequisite guards and fresh execution audit PASS. Independent exact-name join verified
  all299 runtime selectors once passed in the same3 fresh partitions.
- make test-docker PASS6/6/0 skipped; execution audit PASS; parity, route-probe and runner metrics
  all complete=true. Three independent roots, six runs per leg, observed in-process/composed plus
  observer-disabled in-process; no retry, sorting exception or timing change.
- make eval PASS1/1 and execution audit PASS, actual composed N10,30/30 complete,0 observed leaks;
  per-cell unobserved/bodiesUnobserved/scanTruncated0. Native test109.518s, Vitest109.91s. Required
  wording and assumed (unverified) isolation printed. Scripted-stub result only; no daemon isolation
  or real-agent proof.

Evidence under `/private/tmp/tinyvault-slice6-implementation/reviews-round1/`:
fixed-default.log, fixed-docker.log, fixed-eval.log; fixed-{default,docker,eval}-gate directories
contain only the named fresh native reports and gate metrics/scorecard, with owner-summary.json.
Default main SHA144342ef740552aacfc38f964ce3b2085c2e0ec35037bc1a2061b638cb619d43;
timing1 SHA35b9f8c739a59a34e13248aba9f5c7fae57836e80b8cb30595a216a6e95ab27d;
timing2 SHAaee793725b59c60a557e711913f87279b3a8e01ab7298246075f16b94c47b663;
Docker SHA681d3e91128bea6ad84fbe4ee9cb3776a47f98a6ca6a1530d75907d1733ae881;
eval SHA73af82d4f3eaaccdafdbc2eec43daf8af1f946315aa008139f2890b0e27725fb;
scorecard SHA6d900caf4239447447f32747f149f0ec431009bcf544311c89eba3ee6b46c562.
fixed-default-linked-execution.json records299-name current execution. Existing290 Slice6 exact
mutation lineages plus7 accepted historical selectors remain as originally attributed; the2 new
deployment-block selectors each have3 actual isolated document mutants in Entry24. Compiler corpus
and337/695 diagnostics unchanged. Current table SHA256
`65ea56c59c47c126c0287c6655d1660c42d9bc82d9b6ab58a0588120fd448a55`.

Round2 is the required absorbed-fix review, with fresh independent Claude Opus5 QA/security and
fresh Astra adversarial channels. Packet/diff/snapshot identity is in reviews-round2/candidate.json;
no current findings shared among blind channels. Root freezes repository writes and test/mutation
execution until all three finish. Completed paper rounds remain capped at3; implementation rounds
are now at2, not reset. No commit/integration, milestone-close or release authorized or claimed.
Deviations From Handoff: no new scope/contract amendment; Entry20 approvals and Entry24 explicit
residual dispositions stand.


## Entry26 — implementation round2 PASS; uncommitted integration handoff (2026-09-06)

Fresh Astra `/root/slice6_impl_astra_r2` PASS/no P1/P2/P3; Claude Opus5 QA
sessiona7e5eaa8-6c82-42e7-b7e4-0aca8c36961d PASS and separate Claude Opus5 security
sessione27b1260-5dec-46d4-9f5a-d54208080448 PASS, both native exit0/completed. Frozen330-file
digest `be6c123b91552a97fb9366a143451995c04f65519b9c97d2a4292d60da8d1975`;
manifest SHA697264a5bf8331f460358f84d23ed79f5c6b82c4068fbac9747c3c0a91b5b9b6.
Owner validated both complete event streams, exclusive Opus5 assistant model and unchanged
candidate before unfreezing. CLI auxiliary usage is retained in summaries. Astra independently
verified all330 working/snapshot hashes and the299-name exact passed join, plus native11 mutation
triples and gate hash consistency. Reviews are static inspections of owner-produced dynamic
reports, not independent runtime reproductions. QA disclosed not reading all of AGENTS.md; the
packet supplied the owner/worker and review restrictions, which were respected. Security's prose
hash comparison omitted the changed register; the actual manifest comparison correctly identifies
three continuity files changed after the gates, as already recorded in Entry25.

Evidence: `/private/tmp/tinyvault-slice6-implementation/reviews-round2/`, candidate.json,
absorbed-fix.diff, snapshot/, owner-review-verification.json, claude-{qa,security}/summary.json,
report.md and events.jsonl; astra-report.md is the owner's transcription. These remain original
review artifacts; owner dispositions below do not rewrite them.

Both Claude reports identified the same nonblocking Low: the table introduction's Entries7–23
reference excluded new document proofs in Entries24–25. Corrected to Entries7–25 and updated the
review-status sentence to this entry. QA's secondary present-tense historical count was removed
by rewriting PLAN Current State as a lean current handoff, preserving the closed predecessor
verbatim and leaving historical register counts untouched. docs index now points through Entry26.
Only documentation changed after the review freeze; every source/test file and every canonical
JSON table row remains byte-identical to the reviewed/tested candidate. Current table hash is
`27d7a12bc5b45eb4f59ab32af8dab133cd97cc9b37e97fcf998b6149527e3af4`. No third implementation round required for these citation/status-only edits under
section5's gating/correctness-code rule. Final diff whitespace and byte-preservation checks PASS.

One security test-gap assertion is declined as factually incorrect: the actual299-name execution
join IS inside make test. scripts/check-test-execution.mjs calls checkExecution, whose
scripts/test-execution.mjs:81 invokes proveClaimExecution(readClaimSelectors(root), bundles, root)
on the same validated fresh default partitions. Lines148–155 require every selector exactly once
passed. Entry16 includes the actual CLI call-deletion proof; Entries23/25 include real full-gate
execution-audit PASS. The additional owner join is independent corroboration, not the sole guard.
No source change is needed. The report's count of two new deployment rows means two selectors
in the existing P-deployment row; the canonical inventory remains147 rows/299 runtime selectors.

Other reported gaps retain their narrow limits: BOM comparator vectors begin at the captured
artifact map, not disk ingress; URI/form spellings may be observationally identical; dual failure
uses a throwing observer stub at the real runner caller, with outer-boundary privacy checked
statically rather than by a new cause-forwarding mutant; deployment-block placement is not
asserted beyond the marked exact text; reserve-category proof is not independent of redundant
witness guards. No new reaching security defect was found. Entry24 accepted coverage/timing,
wire ambiguity, declared options, trusted capture and failed synthetic-root limits remain.

Authorized implementation and independent review work are complete and ready for an explicitly
authorized commit/integration sequence. Changes remain UNCOMMITTED on main at73bd015; inherited
wrapup documents preserved; no active workers, reviews, mutations or test suites. Completed paper
rounds3 and implementation rounds2 are retained. Not run: committed-candidate clean clone + npm ci
+ make browsers + make test, or merged-tree acceptance, because no commit/integration was authorized.
Do not infer Slice6 merged, whole-M5.2 closed, or release approval. Required milestone-close assessment
still follows Slice6 integration. Deviations From Handoff: approved Entry20 CORS/readonly amendments
only; no further contract, threshold or behavior-scope changes.


## Entry27 — commit/integration/push authorized (2026-09-06)

User said “Ok let’s proceed” after the owner recommended committing the verified candidate,
running literal committed-candidate clean-clone plus exact integrated-tree acceptance gates, then
pushing. This authorizes that sequence and its acceptance records; no per-file reconfirmation is
needed. Whole-M5.2 assessment and release remain separate scopes. Origin/main was read live at
73bd015bcf20ae226d7f480ef57292b2bbc539a3, matching local main. Final reviewed/documentation-only
candidate digest e25bf3486aeb1698ba1f3bea89d4994ef9182d198fd4dcfbca1c2fc26a07bcf1 was reverified
before this authorization checkpoint. Only PLAN and this append-only register are updated here;
all production/test/table and inherited wrapup bytes are preserved. Acceptance is pending; do not
restate prior in-place gates as committed-candidate results. No review round is repeated.


## Entry28 — Slice6 committed, acceptance PASS and source pushed (2026-09-06)

Source commit `8103c4729e729d6a08e569e8aa5abe68cb535fa3` (`8103c47`) integrates Slice6 directly
on the existing main branch. All67 changed/new files were staged by explicit path and the index was
verified against every330 candidate file before commit; inherited wrapup bytes were preserved.
Committed candidate digest `e20812404c7824eee1c8f48675f6e969bed2db5bec3ca821ebbb01b55e274fa0`
contains only the prior verified candidate plus Entry27 authorization/continuity text. No source/test,
locked plan, thresholds or canonical table rows changed after independent review.

Literal clean-clone acceptance, in order:
`git clone --no-hardlinks --branch main /Users/jonathanavni/Documents/Coding/tinyvault
/private/tmp/tinyvault-slice6-integration-20260906/clean-clone`; clone HEAD verified at8103c47,
then `npm ci`, `make browsers`, `make test`, all exit0. The clone used its own locked dependency
install, with no saved eval artifact prerequisite. All330 hashes matched before and after, tree clean.
Default gate2317 PASS/0 failed/1 expected opt-in eval skip; execution audit PASS and independent
name-level join299 selectors exactly once passed in the same3 fresh partitions.

Exact integrated main8103c47 then passed serial `make test`, `make test-docker`, `make eval`:
- Default2317 PASS/0 failed/1 expected skip; all prerequisite guards and execution audit PASS.
  Main2302, decoder timing5, host timing10. Independent native299-name join also PASS.
- Docker6/6 PASS/0 skipped, execution audit PASS; parity, control-route and runner metrics all
  complete=true. K has3 fresh legs/roots, six runs each, observed in-process/composed and
  observer-disabled in-process. No retry-until-equal, sorting exception or timing widening.
- Composed N10 eval1/1 PASS and execution audit PASS;30/30 complete,0 observed leaks; every cell
  unobserved/bodiesUnobserved/scanTruncated0. Native test109.418s, Vitest109.81s. Required deployment
  literal printed; isolation remains assumed (unverified). These are scripted-stub measurements,
  not real-agent leakage evidence or daemon-non-exposure proof.

All330 committed hashes stayed unchanged and both checkouts remained clean through acceptance.
Artifacts: `/private/tmp/tinyvault-slice6-integration-20260906/`, candidate.json,
committed-candidate.json, npm-ci.log, make-browsers.log, clone-test.log, main-test.log,
main-docker.log, main-eval.log and acceptance-summary.json. Each stage directory has copied native
reports plus owner-summary.json; each test stage also has a complete name-level selector-join.json.
Docker metrics and the current scorecard are copied into their stage directories. Log hashes identify
captured tool output; native report hashes identify the exact copied JSON files.

| Stage / native report | SHA256 |
| --- | --- |
| clone-test / main.json | `9d43ecc516f055022d6ef1f619662a0e86bbf657241579993ac0b37f26dbbac4` |
| clone-test / timing-1.json | `fb8b6a96d5ee1da229644a9b65aab47791db5687b80ba952bee48063b5fad8ee` |
| clone-test / timing-2.json | `af4a8910dabe5f84fc015b4000f60c0de16a1b67336dd37696d1a4439a7f8838` |
| main-test / main.json | `18cd6fc2674d183217885c34f5941b56a7a83764ae26ffb79f4e8d99566b4a60` |
| main-test / timing-1.json | `e104c707e85530874d6c29125bdf4b3e91cfb1683cc8d7f372e8bc01227ade6b` |
| main-test / timing-2.json | `990afde5e47ae177c411a25731b2ed4a3ae9889719a002bc9823fa9a979403a0` |
| main-docker / docker.json | `9e31685a7a8153c7df8497a3f009f5ff5eff7cc3dd258674d4d4dee69319b41d` |
| main-eval / eval.json | `92157ba9c1aa17e26422d71d7a5f46e1d528b07be7ef2f7ccf602bae0489eb20` |

Scorecard SHA256 `9c50e5b463e1923d4d35cb204b7edf64c9010c377afc1f495a3b012893b543bc`.

Before publication origin/main was again verified at73bd015. Authorized normal fast-forward
`git push origin main` succeeded, and live `git ls-remote --exit-code origin refs/heads/main`
confirmed8103c4729e729d6a08e569e8aa5abe68cb535fa3. Source push proof is in
source-push-verification.json. These acceptance/status records follow as a documentation-only
commit and push; their final remote equality/clean-tree proof is saved in publication-verification.json.

PLAN Current State, docs index and the claim-table introduction now reflect accepted Slice6.
Final documentation changes preserve every source/test byte, inherited wrapup document, locked
revision3 plan and canonical JSON table row; no runtime gate rerun or review round is required for
status/citation-only changes. Current table SHA256 `e568cb613f46eb5fcfa0e2374ba4d0aac1a57973882931ccaa10bf7a470a335d`.
Completed review counts remain paper3 and implementation2. Slice6 acceptance is complete; all six
M5.2 slices are integrated. Whole-M5.2 milestone-close assessment and release remain separate,
unperformed scopes. No milestone-close or release approval is implied.
Deviations From Handoff: approved CORS/readonly amendments only; all required commit/clone/main
acceptance sequencing and serial browser timing constraints retained.
