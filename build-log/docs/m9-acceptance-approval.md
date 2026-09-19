# M9 candidate and V1 approval packages — 2026-09-14

Status: PREPARATION ONLY. Neither package is approved or executed. Entry71 is the handoff;
revision7 of m9-onepassword-packet.md remains the locked implementation contract. This document
adds operational preparation, not a new parser contract or a reopened implementation review.

## A. Exact candidate commit and independent clean clone

### Candidate and proposed commit boundary

Integration checkout: `/Users/jonathanavni/Documents/Coding/tinyvault`, sole worktree, branch
`main`, base/HEAD `87e81b8168703e5b76e0b1659543a4b4ec80f988`. The previous owner closed Entry71;
current owner is Codex, session `2026-09-14-m9-approval-prep`.

Entry verification matched all474 tracked/non-ignored-untracked files, their content hashes and
modes, and the complete dirty status against the saved final wrapup inventory. Its final digest is
`adb3eb907c18ec20b30e7a9c71c4cf60bee66c5959deb33462e900d4ef9dafbe`; Entry71's
`967652...` names the earlier wrapup-entry snapshot, not that final inventory. No unexplained drift.
All quoted inventory digests use `scripts/claude-review.mjs` candidate(): paths sorted by JS
`.sort()`, entries `{path, mode: lstat.mode, sha256: SHA256(file bytes)}`, then SHA256 of UTF8
`JSON.stringify(files)` (compact array, ordered object keys, no newline). Base/head/status are
separate fields outside the digest. This is not the SHA256 of the pretty-printed manifest file.
`edd16b6e...` in owned-candidate.json differs from the final wrapup because PLAN content changed
to stamp the new owner; it is not a serialization discrepancy. Both artifacts contain474paths
but their file bytes differ. Ignored artifacts, private state and Git internals are outside that inventory. Process-name inspection
found no TinyVault/Vitest/ms-playwright match; unrelated Claude processes exist. No machine-wide
idle claim; the executing owner must coordinate the browser/timing window before a future gate.

Propose ONE atomic commit on existing main, with message:
`Implement reviewed M9 offline adapter and scoped M5 marker-wait repair`.
This intentionally groups the already reviewed S1–S4 implementation and the separately approved M5
repair with the complete incoming documentation, history and approval preparation. It avoids a
capability-permission-only intermediate commit and makes the passing final default gate applicable
to the committed source/test candidate. It does not merge a branch or declare M9 complete. No staging,
commit, branch switch or Git object construction has occurred in preparation.

The explicit path list below is exhaustive (35 inherited dirty paths plus this new document).
All current content of each path is proposed, including historical incoming changes; no partial
staging or `git add .`. The exact proposal is the475-file inventory at
`/private/tmp/tinyvault-m9-approval-prep-20260914/final-candidate.json` and complete36-path
`/private/tmp/tinyvault-m9-approval-prep-20260914/final-candidate.patch`. Their SHA256 values,
file/dirty counts and the reviewed package hash are recorded in the external
`/private/tmp/tinyvault-m9-approval-prep-20260914/approval-index.md` after final dispositions.
Do not approve until that index exists and matches. Its location outside the candidate avoids
a self-referential manifest hash embedded in a file that the manifest itself hashes.
A later source/test/gate change invalidates the corresponding evidence and requires disposition;
document-only changes are listed separately and are never described as historically reviewed bytes.

| Proposed path | Purpose / evidence family |
|---|---|
| `.claude/memory/decisions_product.md` | Approved local decision reconciliation, S4 |
| `.claude/memory/gotchas_runtime.md` | M5 bounded marker diagnosis/repair limits |
| `.claude/memory/sessions-archive.md` | Prior session closure index |
| `BACKLOG.md` | Recorded residuals, including pre-existing comment drift |
| `PLAN-archive.md` | Incoming history and verbatim archived Current State |
| `PLAN.md` | Decisions preserved; current ownership/preparation status |
| `README.md` | M9 status, D8 limitation and existing evidence distinctions |
| `SCHEMA.md` | Approved backend/timing/lifetime contract reconciliation |
| `docs/README.md` | Existing M9 document index/status |
| `docs/phase-0-plan.md` | Approved contract and build-status reconciliation |
| `docs/m9-onepassword-packet.md` (new) | Locked revision7, all approved scope/proof conditions |
| `docs/m9-review-findings.md` (new) | Entire append-only Entries1–71 plus preparation dispositions |
| `docs/onepassword-setup.md` (new) | Operator setup and explicit support/claim limits |
| `docs/m9-acceptance-approval.md` (new) | These two proposed approval packages |
| `scripts/docker-invocation.mjs` | Narrow M9 capability profile with shape/presence confinement |
| `scripts/docker-invocation.selftest.mjs` | Profile positive/negative production-path proofs |
| `src/adapters/mcp/main.ts` | Explicit backend selection and disposal, no fallback |
| `src/adapters/mcp/main.backend.test.ts` (new) | Selection/startup tests |
| `src/adapters/mcp/server.onepassword.stdio.test.ts` (new) | Built MCP real-host/fake-CLI integration and lifecycle |
| `src/backends/backend.ts` | Backend contract comment |
| `src/backends/onepassword.ts` (new) | Frozen discovery, identity, policy, resolution, disposal |
| `src/backends/onepasswordConfig.ts` (new) | Closed config and private token validation |
| `src/backends/onepasswordMetadata.ts` (new) | D9 bounded closed parser |
| `src/backends/onepasswordProcess.ts` (new) | Sole confined CLI subprocess/lifetime authority |
| `src/backends/onepassword.test.ts` (new) | Backend behavior/identity/error tests |
| `src/backends/onepassword.testSupport.ts` (new) | Synthetic CLI/fixture helper, excluded from production |
| `src/backends/onepassword.identity.test.ts` (new) | R20/frozen snapshot tests |
| `src/backends/onepassword.policy.test.ts` (new) | Real fill-path policy/rotation/D8 controls |
| `src/backends/onepassword.structure.test.ts` (new) | Confinement/retention/source-presence gates |
| `src/backends/onepasswordConfig.test.ts` (new) | Config/token validation tests |
| `src/backends/onepasswordProcess.test.ts` (new) | Process/deadline/cleanup tests |
| `src/browser/playwright.signals.test.ts` | Relocated authority-inspector consumer |
| `src/browser/retention.test.ts` | Exact named Secret constructor allowance |
| `src/core/fillService.structure.test.ts` | Existing inspector extraction, no blanket exception |
| `src/core/fillService.authority.structure.test.ts` (new) | Moved authority gate, mandatory stale-inspector proof |
| `testbed/coverage.browser.test.ts` | Exact separately approved M5 marker-wait patch |

### Evidence disposition and preservation

Entry65 retains the closed M9 three-round ladder: Astra PASS, Claude QA PASS, security literal
NEEDS-ATTENTION from its earlier gate snapshot. Entry70 separately retains M5 round1/maximum2:
QA/security/Astra PASS, typecheck, focused10/10, three deterministic assertion-killed/restored
mutants, full default3761/0/1, timing5/5 and26/26 and final execution PASS. The default candidate
was474files, digest `9a22d24790974e221f063c737f5d8f2761dbe3a6a0b70f6d76ece0e928d6f71f`.
Later continuity-only differences are reconciled in the external manifest. Prior Docker7/7,
stub1/1 and MCP37/37 are unchanged-runtime evidence from Entry65, not reruns after the M5 repair.
No current preparation check substitutes for those tests or re-certifies all historic mutation receipts.

Preserve original reports, receipts, failure logs, reviewed inventories and the approved-input snapshot
under `/private/tmp/tinyvault-m9-implementation-20260913/`; no cleanup now. Preparation evidence is
`/private/tmp/tinyvault-m9-approval-prep-20260914/`: entry/final inventories, exact full candidate
patch including untracked files, source identity reconciliation, native report hash verification and
independent package review. These are temporary external locations, not a permanent archive.
Before later execution, verify availability/hashes and retain the source evidence until audit/closure;
loss of evidence is a blocker to carrying its claim. Do not copy private V0 directories or raw provider
material. The final manifest excludes itself and all ignored state; final artifact hashes are reported
outside the candidate to avoid self-referential hashes.

Historical reds remain preserved and uncaused; M5 evidence supplies neither universal liveness nor
M9 causation. Entry7 stale-inspector absence, separate positive/negative handleSignals mutants and
relocation title inventory remain mandatory recorded proofs, not waived conditions. The independent
preparation fact-check is a packaging/evidence check, not a fourth M9 review.

### Proposed commands, run separately after approval

The approval is for the exact manifest/patch, one local commit, one independent local clone,
locked npm dependency installation and Chromium installation in that clone, then one full default
gate. No provider CLI, real token, existing node_modules symlink, generated eval artifacts or paid
client is a prerequisite. Do not run `make eval` (its default is paid real-comparison).

1. Recheck ownership, branch/HEAD, complete final manifest, external approval-index.md and exact path list. Require the
   Git staging index empty at entry; any drift stops for reconciliation. Read the entire candidate diff. Only then
   stage the explicit36 paths, inspect `git diff --cached --stat`, `git diff --cached --check` and the
   full staged patch, verify the staged path set equals the approved list and staged contents equal
   the approved hashes. Run `git commit -m 'Implement reviewed M9 offline adapter and scoped M5 marker-wait repair'`
   as its own action. Record the resulting SHA and tree; verify each committed blob/mode against the
   approved manifest (compare Git100644/100755 to the filesystem executable bit, not raw stat modes) and require a clean source checkout. No amend, hook bypass or automatic retry.
2. Use the new, absent root `/private/tmp/tinyvault-m9-clean-clone-20260914-01` with child `repo`.
   Execute `git clone --no-local --no-hardlinks /Users/jonathanavni/Documents/Coding/tinyvault /private/tmp/tinyvault-m9-clean-clone-20260914-01/repo`.
   Resolve its HEAD and assert it equals the new approved commit SHA before installation. No overlay,
   shared objects, source-copy substitution or branch/worktree switch of the original checkout.
3. A future clean runner creates private empty `home`, `tmp`, `npm-cache`, `browsers` and `evidence`
   siblings under that root. Launch commands with a constructed allowlisted environment only:
   `HOME=<root>/home`, `TMPDIR=<root>/tmp`, `PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
   `LANG=C.UTF-8`, `NO_COLOR=1`, `npm_config_cache=<root>/npm-cache`,
   `PLAYWRIGHT_BROWSERS_PATH=<root>/browsers`. These are child environment values, not changes to
   the user's environment. No inherited OP, ANTHROPIC, OPENAI, TINYVAULT, dotenv or npm credentials.
   Pin the read-only observed host to macOS15.6.1/build24G90 arm64, Node24.19.0, npm11.17.0;
   resolve executables and record their version/file identities before running. A changed host/runtime
   needs an explicit evidence note, not silent equivalence. The clone contains the committed npm lock.
4. From the clone cwd, run `npm ci` once; preserve exit/log and read it. This installs locked packages
   with their normal install scripts and registry downloads (including native esbuild setup), local to
   the isolated environment. Then run `npm run browsers` once, which installs locked Playwright1.62.1
   Chromium into that isolated browser directory. Read the result before proceeding. No global op or
   Node installation and no installation in the integration checkout. Missing tools/OS dependencies,
   attempted credential prompt or install failure STOP; no sudo or fallback install.
5. Run `make test` once, serially on a coordinated host. The checked-in script includes typecheck,
   all structural/capability/checker gates, main partition, both timing partitions and final execution
   verification. Preserve full logs and native `.vitest` reports outside the clone before any cleanup.
   Expect3761passed/0failed/1intentional skip in main,5/5 and26/26 timing, final execution PASS;
   exact fresh observed counts/verdicts govern. Preserve a red and its complete diagnostics; do not
   retry to green, waive or widen thresholds. No separate new mutation campaign is part of A.
6. Verify committed tracked files/modes and clean Git status after the gate; record generated/ignored
   outputs separately. The clone may contain fresh generated test artifacts but receives none as an
   input. Read logs and decide separately. A pass clears only literal independent clean-clone default
   verification. Docker/stub/MCP are earlier candidate evidence; exact integrated-tree default,
   Docker/stub, whole-codebase audit and milestone assessment remain later authorized gates.

Retain clone, installed dependencies/browser cache and all evidence after success or failure until
user-directed cleanup/evidence transfer. No automatic `rm -rf`, removal of existing caches or cleanup
of unrelated V0 private state. A includes no push, merge, release, V1 or broader supported-OS claim.

**Concrete approval A wording:** “Approve the exact final36-path manifest and patch, one atomic
local commit on main, and one literal independent clean clone at the named path with isolated
npm ci/Chromium installation and one make test under the commands, stop rules and retention above.”
This is proposed wording, not a request to approve unseen future bytes.

## B. V1-M9-DARWIN-01 — bounded real-adapter run card

### Approval scope and readiness boundary

One Darwin attempt only, synthetic data, real pinned CLI and real TinyVault backend/host, local
fixture browser fills and a scripted built MCP client. No paid agent or MCP-client subscription calls.
Prepare and independently review this card before clone execution; execution requires A to pass and
its own explicit B authorization. A never implies B. No replacement V0 run or existing-token reuse.

The executable V1 observer does not yet exist in the reviewed candidate. This is a concrete run-card
and observer-preparation approval package, not a falsely executable launch instruction. A separate offline preparation step still needs to produce an external observer implementing exactly
this schedule (no production edits), its fake-CLI failure/sanitizer/reservation tests and scoped
independent review. This package-only turn authors no executable observer. Before any
private setup or provider execution, return the exact observer source/bundle/config-template hashes,
finite schedule, review results and a launch command for an explicit execution release. No provider execution approval is requested until those artifacts exist. A material observer/card
change or new operation needs a scoped review/disposition; no general M9/M8 review restart.

### Fixed environment and human prerequisites

Proposed supported sample: Darwin arm64, macOS15.6.1/build24G90; Node24.19.0, npm11.17.0;
Playwright1.62.1 Chromium from A (record installed revision/executable digest at execution preflight).
CLI2.39.0 absolute path `/Users/jonathanavni/.tinyvault-v0/cli-2.39.0/op`, 41,016,304bytes,
SHA256 `f48b97df4dfdccc67483587b40a596f70881eac05a576de7b7775d267375757a`.
This pin is recorded in approved setup/Entry17; it was NOT re-read or executed during this preparation.
A later local preflight checks binary hash/size before any authenticated work. Mismatch stops without
installing a replacement. Runtime exact version check is not executable authentication.

The operator, after execution release, creates two new disposable synthetic-only custom vaults:
GRANTED and DENIED. Exactly two new service accounts, PRIMARY and CONTROL, each get Read Items on GRANTED only, no write,
share, Environments, vault-creation or other vault grants. The operator privately inspects the actual
grant screen and plan/quota; no screenshot, account ID or token is shared with the agent. Actual grants
remain unverified until that check; application item filtering is not a vendor item ACL.

GRANTED has9minimal standard Login records: C(short password), L(long password), R(rotation),
O(origin drift), A(archive after discovery), X(archive before discovery), D(delete), M(move), T(token
removal). DENIED has1minimal control Login U. The operator generates only disposable synthetic
passwords privately, with C16 and L256 UTF-16 code units, no CR/LF; other passwords16units.
All records initially use `http://127.0.0.1:48191/login` (one canonical origin); observer owns loopback
ports48191 and48192 only, refuses an occupied port, and never submits a credential to a remote site.
Only synthetic IDs/private mapping enter local config, never the repository/card/report. Keep the
minimal D9 schema with no tags/custom fields/files/sections. X is archived before discovery.

Use a new0700 private root `~/.tinyvault-v1/V1-M9-DARWIN-01` and0600 new files for the two separate tokens/configs
and private oracle mapping. Never swap tokens in an existing backend; each domain has one immutable
authentication identity. No reading/reuse/cleanup of old private V0 files. Token creation/save
is operator-owned using a hidden local prompt; never chat, clipboard automation or shell argv/env
at the parent level. The source backend (or the separately reviewed negative-control launcher) alone reads its assigned
token file and supplies it to the child; the model never reads either file.
Observer child environments are constructed allowlists, no OP_CONNECT/desktop/session inheritance,
no local-file vault/key variables, no auth fallback, and no persistent MCP client configuration.

The exact committed production/runtime tree must match A. External observer bundles the actual
source imports for the in-process real-host trials and launches `dist/tinyvault-mcp.mjs` for MCP;
before execution release run `make mcp` from the authorized clone cwd, hash its dist output and
record complete bundler input hashes; reject fixture-helper imports, fake op, a wrapped opPath,
or patched production modules. It may wrap public backend methods solely to enforce the schedule,
reserve before delegation and record closed error kinds/durations; no altered results or retries.
For the in-process trials, an external observer-only Node spawn tap, installed before production
module loading, must delegate once to the original builtin with unchanged args/options and return
the exact original ChildProcess. Record only operation ID, fixed command class, actual spawn/close,
exit/signal/timeout flags, byte-count-cap booleans, config/executable-match and cleanup booleans.
Do not retain env/token/argv/raw chunks. This instrumentation changes the observation harness,
not production source; disclose its trust/observer-effect limitation. Independently test exact
delegation, missing/duplicate receipt rejection and no native-output retention before execution.
Include a positive receipt through the actual production onepassword backend and its static ESM
spawn import using only a fake CLI in offline readiness tests. A helper-only tap test is insufficient.
A tap-installed-but-never-invoked mutant and a target-denial/failed-control mutant must fail their
intended assertions. Verify import ordering and builtin/ESM synchronization on pinned Node24;
installability is an unverified assumption until this production-path evidence exists.
The built MCP block stays uninstrumented: method/source-derived bounds there are not a dynamic
CLI trace. No claim of an actual provider attempt from a method-entry log alone.
No private response or Secret is exposed to the model/observer report. Local fixture equality checks
run in trusted code and emit only booleans/assignment counts; disable tracing, screenshots, console,
request-body logs, raw JSON, shell tracing and native-error serialization.

### Finite reservation ledger and exact commands

Production commands are the existing fixed argv after
`--cache=false --config <new owned runtime directory> --format json --no-color`:
VERSION=`--version`; LIST=`item list --vault <GRANTED-ID> --categories Login`;
DETAIL=`item get <one configured fixed ID> --vault <GRANTED-ID>`;
PROBE=`user get --me`. No search, op read, names, aliases, freeform field lookup or retries.

One cold list reserves2CLI invocations (VERSION+LIST). A fill with an admissible unconsumed handle
reserves2 (DETAIL and at most1explicit observer-requested PROBE); a successful fill
normally uses only DETAIL. The host/MCP do not automatically call setupReasonFor. Only the
in-process observer calls setupReasonFor exactly once after a provider-eligible fill returns
backend-error, and never after another result, list failure or zero-provider control. This uses
that fill's reserved second slot; absent probes stay unused, never recycled. Cached list/policy and setup/exhaustion/wrong-origin controls reserve0;
the observer forbids an unexpected delegated secret/probe method in those controls. Reservations
are charged before delegation, remain charged after failure/early stop, and unused capacity cannot
fund another call. Every instance stays below the production64-spawn cap. This is a cap on controlled
CLI invocations, NOT HTTP requests, provider-internal retries, rate limits, charges or billing.
Quota acceptance must use that limitation; no dollars, subscription upgrade or paid agent call.

| Ordered block | Instances / operations | CLI reservations |
|---|---|---:|
| P1–P3 | Three fresh real-backend/host domains. Each cold initial list, cached policy, then one real fill (C,L,C respectively), dispose. Measure3cold version+list and3warm detail fetch trials; no pre-probe warms them. | 12 |
| Q | One separate qualification domain: list and positive D,M,T fills before any move/delete/revoke. These handles are intentionally consumed here; removal domains use different previously discovered, unconsumed handles. | 8 |
| F | One domain: initial list; Cpositive; Cfresh-control exhausted; setup then Cstill exhausted; Owrong-origin on48192; rotate R then Rpositive; change Owebsite to48192 then Oon48191 denies; archive A then Apositive; restore A then repeat list and Astill exhausted; Xabsent throughout. Exactly4provider-eligible fill attempts, zero-provider controls stay zero. | 10 |
| K | One deliberately new domain: list and Cpositive after restart; Xstill excluded. This explicitly measures renewed authority, never renewal isolation. | 4 |
| MOVE | One domain: list and Cpositive control, preserve Munconsumed; operator moves M to DENIED; one Mfill after acknowledgement denies, zero assignment, then untouched Lpositive in the same domain. No rediscovery/new ID adoption. | 8 |
| DELETE | Three separate live domains: each list and Cpositive control, preserving its previously discovered Dhandle unused. Operator deletes D once; three post-ack Dfills at +0,+15,+30seconds, each on its own prepared domain, immediately followed by an untouched Lpositive in that same domain. | 24 |
| MCP | One real built MCP process: list, Cpositive, fresh-control Cexhausted, setup/Cstill exhausted, repeat list, masked snapshot, normal EOF. Exactly one provider-eligible fill. | 4 |
| REVOKE | Three PRIMARY domains AND three CONTROL domains prepared before ack; each list and Cpositive, leaving Tunused. Operator revokes PRIMARY once; PRIMARY Tfills at +0,+15,+30seconds, each immediately followed by CONTROL Tpositive in its paired domain. Both token files stay unchanged. | 36 |
| Post-revoke availability | On the last existing warm PRIMARY domain, exactly one explicit probe (expected fixed error, interpretation below); no secret/retry. | 1 |
| **Total** | **17domains/processes; 17initial lists; 3performance detail trials included, not extra** | **107** |

The final explicit probe requires version already checked in the last PRIMARY domain. Its expected
result for untyped CLI refusal is `{available:false, reason:"error"}`; this is neither
`not_authenticated` nor revocation-attribution evidence. If an earlier stop leaves no warm domain,
record this row missing; never create a cold replacement (VERSION+PROBE would cost2).

Domains =3P+1Q+1F+1K+1MOVE+3DELETE+1MCP+6REVOKE =17; each has one initial list.
The authoritative budget is the sum107 above (34cold-list +72fill reservations +1final probe). Emit observed method counts alongside reserved CLI
upper bounds, keeping source-derived spawn counts distinct from dynamic observations. No hidden health
probe before discovery or after a failed command; at most the one already reserved error-path PROBE.

PRIMARY performs Q and both negative controls. CONTROL grants are operator-inspected; its
pre-ack Cpositive demonstrates a working account, while its paired post-ack Tpositive is its first
Tdetail retrieval. CONTROL has no separately budgeted negative permission tests or pre-ack Tfill.
Those are explicit qualification asymmetries, not evidence that the checks ran for both accounts.
A CONTROL Tfailure blocks attribution and stops; do not substitute/retry it or widen access.

Two additional least-privilege negative controls, after P3 and before Q/F, use a separately reviewed
trusted observer launcher with the same binary/token isolation and bounded process runner: one
LIST against DENIED and one attempted title-only edit of C in GRANTED
(`item edit <C-ID> --vault <GRANTED-ID> --title V1-DENY-CONTROL`). Both must refuse. The edit targets
only the disposable control; a success stops immediately, is retained as least-privilege failure and
operator deletes it with the already-budgeted vault cleanup; no unlisted restoration command. Exactly2additional authenticated CLI reservations, total109including
negative controls. These operations are outside the production adapter command vocabulary and must
never be added to production. The GRANTED edit must be refused despite successful reading there; the separate DENIED LIST
must be refused despite GRANTED access. Inspecting grants and these two finite controls does not
prove every provider capability. No other vault access tests. A nonzero/timeout/local error is INCONCLUSIVE, not a privilege pass.
The negative launcher needs a pinned, independently reviewed permission-denial classifier and
command-validity evidence for CLI2.39.0 before release; syntax/usage/network/rate-limit/auth errors
are not permission evidence. No classifier/source evidence currently exists. If exact documented
denial signals cannot be established without new provider work, hold this check for scoped
disposition instead of inventing a stderr heuristic or adding an unbudgeted live control.

### Policy, removal attribution and observation requirements

P1–P3 collect each method's start/end duration. The actual runner cancels at3,000ms, sends
TERM then KILL after250ms and waits a further250ms for closure; its independent3,900ms
hard bound poisons the instance. The locked4,000ms value is the settlement ceiling, not an
acceptance window for provider responses. A3.0–4.0s response after cancellation is a failure.
Record cancellation, hard-bound poison and settlement-ceiling violation separately; retain all
failures without deadline changes or restarts. Record short/long and queue durations descriptively (the schedule is
serial, so it makes no loaded/concurrent-queue claim). An unavailable/timeout, overflow or schema
mismatch is a retained failure, never a new parser optionality, cache enablement or longer deadline.
Finite timing samples establish only this environment's feasibility, not D5 timing noninterference.

F checks exact ItemMeta output and stable injective handles across cached lists, configured labels
only, rotation with same ID, admission/policy equality, archive discovery exclusion and D8's allowed
archive-after-discovery resolution with original budget. Wrong-origin rejects before secret resolution.
After O's provider-origin edit, the original local-origin fill must refuse current-policy drift with
zero assignment. Changing the caller origin to the new provider origin would be the wrong witness.
No copy/alias/new record enters the snapshot. Archive restoration never refreshes inventory or budget.

Removal schedules are three independent domains prepared BEFORE each acknowledgement, not three
retries on one exhausted handle and not fresh post-removal discovery. For DELETE all service-account
grants/token and other records stay intact; for REVOKE Tstays active, same ID/origin/password, with
no token-file replacement/deletion. Q establishes target-specific successful detail/fill compatibility before destructive work.
The Cpositive in each removal domain demonstrates an operational fill path; its target handle
is separately checked present, correct policy, never attempted and unconsumed.
The10prepared domains (MOVE1, DELETE3, REVOKE6) each make one explicitly counted cached
resolvePolicy call for that unused target before acknowledgement. This is a cached backend
policy read after discovery, not a fill attempt; it does not consume the host handle. These
add10policyFor method observations and0CLI reservations; no extra secret/probe/discovery. The completed foundation
ledger has a narrower prepare schema; the full driver uses a separately reviewed schema that
records these calls, without changing the frozen foundation or hiding method activity.
The fixture uses a fresh unlocked password control, unchanged document/origin and valid session.
Before each target attempt validate these conditions; observer records the actual matching DETAIL spawn, close observed, signal=null, exit code in a fixed class
(zero/nonzero/absent), preserved capacity, no cancel/deadline/poison/overflow/cleanup fault,
and the fixed backend error kind. A native refusal normally has a nonzero exit with closure;
"clean closure" never means that a denial must exit0.
DELETE/MOVE require the immediate post-denial Lcontrol success in the same domain. REVOKE requires
the paired CONTROL-account Tsuccess after each PRIMARY denial; CONTROL remains unrevoked through
all three pairs. These bounded controls rule out the witnessed common-outage/record-shape/local
pre-spawn alternatives; they do not prove all unrelated account-specific refusals impossible.
If rate limiting or another cause cannot be distinguished, record INCONCLUSIVE. Native exit1
alone never becomes proof of removal. The observer and reviewed denial classifier must establish
these signals; currently this remains a design with no executable evidence. A refusal before provider retrieval, handle-exhausted,
locked-field, timeout, missing observation or unrelated policy denial is ambiguous, not a removal pass.
Untyped CLI refusal remains unavailable, never promoted to a typed deleted/revoked result.

Operator acknowledges the provider UI operation using a private local control, recording monotonic
ack receipt time; no remote screenshot. Observer records actual ack-to-start/end for each scheduled
attempt, including operator acknowledgement uncertainty. +0means the first feasible attempt after
receipt, not instantaneous provider revocation. +15/+30target offsets have a1s lateness allowance;
missing it records a schedule failure, not a replacement. Each row runs target fill, its explicitly
required setupReasonFor call if backend-error, then its paired positive control, in that order.
Pre-open/navigate every target/control session before acknowledgement. Apply a12s total row
observation deadline measured from target start; the15s spacing leaves3s between row budgets.
Each constituent backend method keeps its existing deadlines; the row limit never extends them.
Readiness must prove this ordering/deadline with the actual host path and worst-case synthetic
near-bound replies. A row that cannot complete within12s stops and records remaining rows missing;
no overlap, shifted acknowledgement clock or retry. The finite schedule tests these times only. No in-flight operation at destructive ack;
any unexpected in-flight work is retained separately and aborts the schedule. Each scheduled PRIMARY/removed-target fill
must deny because record/provider retrieval is unavailable with zero assignment. Any successful fill,
ambiguous denial or missing row blocks removal/M9 acceptance pending a scoped reviewed disposition
and user decision. Expected target denial is provisional until its explicitly scheduled positive control completes;
that control is part of the observation, not a retry. Stop further credential operations on an
unexpected target success, ambiguous outcome, failed control or other failure; retain unattempted schedule rows
as missing. No automatic retry, restoration-for-retry or README-only waiver.

A revoked-token sample does not prove natural expiry behavior, grant-removal propagation or another
OS. Packet§9 natural-expiry qualification remains pending, regardless of the outcome here. Obtain
a separate pinned expiry schedule/token lifetime and authorization, or an explicitly reviewed
user disposition, before claiming that requirement complete; no token renewal or waiting campaign
is implicit here. This card does not condition away that packet requirement.
The operator's acknowledgement and configured privilege facts are human-observed; backend outcomes,
method counts, output scans and fixture booleans are locally observed. Provider-side internal request
counts, global latency guarantees and universal schema/support behavior remain unverified assumptions.

### Evidence, cleanup and remaining gates

Observer output is a closed schema: run/card/commit/observer/binary identity; public OS/version;
phase and ordinal; reservation/actual method counts; elapsed timing; fixed result/error code;
policy/presence/budget/assignment/equality/masking/cleanup booleans; acknowledgement offsets and
stop category. No account/item/vault IDs, handles, paths containing private input, usernames, URLs
from provider records, field values/lengths, token-derived fingerprints, raw stdout/stderr/JSON,
password hashes or snippets. Synthetic expected length classes C/L belong to the preregistration;
never export measured secret lengths. Denial/output equality results are booleans only.

Before execution release, observer tests must demonstrate refusal on missing/duplicate/out-of-order
rows, reservation exhaustion, early stop, late/absent ack, positive-removal fill, unrelated refusal,
report truncation, wrong binary/tree, raw-error/secret sentinel and cleanup failure. Verify actual
production imports and real-bundle launch. A helper passing its own tests is not V1/provider evidence.
No observer script or executable hash exists yet; this readiness gap cannot be paper-reviewed away.

Operator inspects the complete sanitized local report for private data and explicitly releases only
that file to the model. The owner checks schema/counts/identities and records every outcome, including
missing rows, historical V0 INCONCLUSIVE labels and unchanged prior review verdicts. Never use a
success-only summary or infer release from elapsed time. Keep private inputs/reports outside Git.

On any stop, stop admission and dispose all owned domains/browser/CLI groups. Record process/group exit,
temp-directory removal and dispose result as separate facts. A3,900ms hard-bound poison can
make dispose reject even after successful exit/removal; record `hard-bound-poison` separately
from actual/unconfirmed containment or cleanup failure, never infer live children from rejection
alone. If the external observer cannot distinguish the cause without modifying production,
record `dispose-rejected-cause-unresolved`, keep exit/removal booleans independent and stop. Normal EOF in MCP and normal real-CLI
cleanup are observed; fake-CLI TERM/KILL/descendant proofs remain Entry65 evidence. No claim that
real CLI hangs/late chunks were induced or universal cleanup proved. Do not kill unrelated processes.
Operator revokes both new service accounts on early stop (or confirms already revoked), deletes both
disposable vaults and their records, and removes only this run's local token/config/oracle after
owned processes exit. Exactly two revoke operations total (PRIMARY in the schedule or on stop; CONTROL at cleanup),
two vault deletions, no V0 cleanup.
Provisioning/admin UI actions are separately counted:2vault creations,10Login creations,2service-
account creations,1prearchive X,1Rpassword edit,1Owebsite edit,1Aarchive+1restore,1Mmove,
1Ddelete,2revokes,2vault deletions; no retries/replacements or account upgrades. Browser/UI internal
network requests are not bounded by these logical action counts. Cleanup failure remains recorded;
operator cleanup authority continues on stop, without another run. Retain only human-released
sanitized evidence and nonprivate executable/review artifacts for acceptance/audit.

Darwin alone cannot qualify Linux; Windows stays unsupported. A Linux claim requires its own exact
OS/Node/CLI binary digest, real process/deadline/cleanup evidence and separately approved provider card.
Even a complete Bpass does not close M9: authorized integration, exact integrated-tree default/Docker/
stub gates, whole-codebase security audit under phase-plan§9.2 and milestone-close assessment remain.
Preserve exact M8 metadata/restart limitation, R20, D8/D9, accepted residuals and historical
E8cPFc7eGp2qualified/E8bODMFYbwHunqualified cohorts. MCP interoperability is not E8c qualification.

**Proposed eventual approval B wording (do not request until the executable readiness gate is met):**
“Approve one V1-M9-DARWIN-01 attempt on the exact released observer/card hashes after A passes,
including only the listed synthetic provisioning/mutations, two new read-only tokens,109CLI
reservations, finite removal schedule and operator cleanup. No retries or wider support claim.”
No execution approval is requested in this preparation turn; the executable preparation/readiness
step remains explicitly outstanding. No token is needed now.

## Preparation verification and deviations

Current verification is read-only Git/file/hash/native-report inspection plus documentation checks
and scoped independent package review. No tests, mutations, install, clone, provider or credential
operation, token creation, commit/stage, merge/push/release or paid cohort ran during preparation.
Deviations From Handoff: no execution-scope expansion. B distinguishes run-card approval from
executable release because no reviewed V1 observer exists; it cannot truthfully claim launch readiness.
