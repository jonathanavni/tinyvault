# M5.2 Slice 6 — parity, claim evidence and invalid evaluations

Revision 3 — LOCKED AFTER CAPPED PAPER ABSORPTION, 2026-09-06. Planning only; no implementation authorization.
Owner: Codex `2026-09-06-m5.2-slice6-planning`; entry base/head `main` at
`73bd015bcf20ae226d7f480ef57292b2bbc539a3`.
Contract: [M5.2 revision 4](m5-2-slice-spec.md) D1/D6, deployment requirement, K/O/P;
[implementation order](m5-2-implementation-plan.md) row 6.
History and evidence: [Slice 6 register](m5-2-slice-6-review-findings.md).

## 1. Objective and fixed boundary

Compare real in-process and composed scenario captures without erasing security-relevant differences;
publish composed measurements with their environmental assumption and report known-invalid evaluations
without measured outcomes. K, O and every P row require their own targeted killing mutant.

This session changes planning documents only. Preserve the five inherited wrapup documents, closed
handoff and completed Slice 4/5 review counts/acceptance. No implementation, commits, branch change,
merge, push, milestone-close assessment, M6 real-agent work or release is authorized.

Locked D6 wins. No synthetic-only substitute for live status/header observation, partitioned event-
order comparison, change to accepted scored-capture blind spots, new scored capture channel, new hostile fixture,
cryptographic format, capability operation or tool. The harness and fixtures remain trusted; fixture
compromise invalidates a run. Endpoint pinning is not daemon non-exposure. Fixture-control attestation
is post-capture integrity, not independent capture authenticity. Preserve M5-C2, worker/body-marker,
unload and decoder limits and Slice 4/5 evidence-attribution limits.

Revision 3 absorbs all three capped paper rounds with a **parity-only wire witness**, explicit trusted origin
plumbing, a third static eval configuration, architecture-specific validity, and an independently anchored P claim inventory.
The witness is not a new `Channel`, is not scored by `leakScan`, and is not described as signed event
capture. Existing `CapturedEvent`, production header capture and its event order remain unchanged.
K compares both the complete existing event stream and the complete run-bound wire witness.

## 2. Source-backed feasibility and limits

Two real six-run captures (three existing scenarios, two runs per cell) per transport were observed
through the existing `capturePersistedRuns` and `adjudicatePersistedRuns` with a temporary browser facade.
Both pairs completed 6/6 per leg, zero leaks. In-process elapsed times were 2.33s/2.29s; composed
elapsed times were 23.78s/23.15s.
Each run observed 3 requests/responses (benign and hidden) or 5 (lookalike), with no missing header arrays.
Original event counts were 41/41/59/59/41/41; structural event order, wire callback order, response status
and header-name arrays matched across that pair. This is feasibility, not an implemented canonical gate
or evidence all byte/equality invariants pass. Header values still differ by physical host/origin. A follow-up read of all 12 paired runs found every
observed Content-Length equal without normalization (`content-length-feasibility.json` in the same
scratch directory). No fixed-width port assumption or length normalization is required by this sample;
future mismatches still fail. The repeated probes reused scratch directories and retained old vault
files; they never proved the fresh-root artifact inventory required in §3.4.

A separate real Chromium 151.0.7922.34 diagnostic server returned two `X-Parity` entries, the second
containing a synthetic canary, and two `Set-Cookie` entries. `Response.headersArray()` retained both
individual values in order and status 200. This is browser API feasibility, not proof the existing
production outbound header map retains duplicates. The future observer must be tested at its own caller.

Artifacts/scripts: `/private/tmp/tinyvault-slice6-feasibility/`; durable results and limitations in the
register. Initial sandbox browser/loopback failures were followed by approved host runs. A temporary
observer initially proxied a frozen host and failed; the corrected probe returns the original host
and observes only the Browser context factory. No repository source was edited. Exploratory token
substitution is not an accepted normalizer: it inferred role mappings and used per-run maps solely to
locate differences, and cannot satisfy K's trust/global-equality requirements.

After final paper review, one additional genuinely fresh N=2 root per transport was captured without
wire observation and independently adjudicated: 6/6 complete, zero leaks each; 2.292s in-process and
23.985s composed. A recursive lstat/readdir inventory found 39 in-process files (32 shared, six per-run
unauthorized records, one empty lookalike.requests) and 33 composed files (32 shared plus close.marker).
No unattributed capture file occurred. These are `fresh-inventory-in-process.json` and
`fresh-inventory-composed.json` in the scratch directory; Entry5 records hashes and commands. They
verify the fixed-corpus filesystem list, not the new normalizer/observer or general capture symmetry.

No absolute non-flakiness claim: full event order is still a strict acceptance condition. A future real
mismatch fails with preserved evidence; no retries-until-equal, event sorting, timing widening, or
synchronous/deferred projection exception. Current source has deferred headers/bodies, so targeted
order-inversion and missing-observation tests remain mandatory despite this small feasible sample.

## 3. K input, trusted provenance and wire observation

### 3.1 Exact entry and origin map

`captureParityBundle` calls real `capturePersistedRuns` once per leg into distinct fresh artifact roots,
then independently calls `adjudicatePersistedRuns` using each leg's returned keys and registry. Both
legs use the current three scenarios, current scripted agent, N=2 and the same browser build/options.
Do not call `runEval` for these legs: D1's harness coverage lab remains independently in-process.
Controls-primary/secondary are normalizer-vector roles only, not falsely labeled composed observations.
Default public composed eval remains N=10 and is a separate acceptance run on the same candidate.

Add `FixtureTransport.originRoles: Readonly<{C:string;L?:string}>`, leaving `origin` unchanged.
In-process C comes from the server just bound; the lookalike wrapper uses its own canonical and
lookalike server origins. Composed `openPeer` builds C/L from the already inspected/pinned topology
ports, never redirects, events or manifests, and copies them through `ComposedPeer` to the transport.
`EvalTrust` gains a deeply copied/frozen provenance map captured before fixture close, with each
fixture's identity, architecture, reachability and roles. Validate exact role keys, C===origin, C!=L,
L present iff lookalike, bare HTTP(S) origin syntax, and selected architecture/HTTP reachability.
The parity caller records browser version/options and exact requested cell/run inventory separately.
Unknown observed origins stay literal; missing expected roles reject. No private/control key is added.

The live test uses `IntegrationEvidence` on the composed process runner to prove real bridge/container
creation and teardown on that leg. Require one in-process leg and one composed leg; count and verify
both capture invocations and their independent artifact roots. A caller-provided label alone is
insufficient. Substitute-in-process, omitted leg, reused artifact root, missing provenance, swapped
C/L, C=L, missing L and ignored comparator mutants each fail their named caller proof.

### 3.2 Run-bound parity wire witness (no new scored channel)

New `testbed/parity/observe.ts` supplies a trusted, optional testbed-only observer to the shared runner.
`runOnce` calls `beginRun` once with the actual scenario/agent/index/runId/canary/nonce and Browser,
before creating the supervised host. The observer returns a Browser facade; only `newContext` is
wrapped, every other method is bound to the real browser. It returns the original real context and
adds passive listeners before returning it to the host. Do not proxy/replace the frozen supervised
host, expose the observer through tools, or intercept/route network traffic. Normal eval has no observer.

Each run has a separate observer instance and exact expected identity descriptor. Each created context
gets an ordinal, and each actual Playwright Request object gets an ordinal in a WeakMap. Attach
`request`, `response`, `requestfailed` and context-close listeners. At callback ingress append an
immutable-identity slot to one run-wide event sequence (across that run's contexts); increment its
ordinal synchronously. Deferred field resolution fills that slot, never appends a replacement event
or moves it. Budget each run at 128 requests, 512 callback slots, 128 header entries per request/response,
262144 UTF-8 header bytes per slot and 2097152 total witness bytes. Exceeding any budget latches failure for `endRun`
without accepting a truncated witness. These are parity-observer limits, not changes to scored capture limits.
A response binds using `response.request()` object identity. Redirect links use
`request.redirectedFrom()` identity, with predecessor registration required. Unknown/missing identity
fails the witness; URL matching is not an identity substitute.

Request slots retain exact URL, method, context/request IDs, redirect predecessor presence and the
`Request.headersArray()` ordered `{name,value}[]`. Response slots retain request ID, `status()` and
`Response.headersArray()` in returned order. Failure slots retain request ID and a closed category
`request-failed`; do not export arbitrary error text. Header resolution has a 2,000ms bound per call;
record `missing`/`timeout`/`closed` distinctly rather than fabricating an empty array. Normal live K
requires every expected request to have headers and a response with headers/status; any failed,
unresolved or missing required observation fails that leg. This narrower completeness condition is
for the three current K scenarios, not a new claim that every browser target is observable.

`endRun` executes after `executeStubRun` closes the host, awaits the observer's pending bounded reads,
then detaches listeners and freezes its snapshot. Always perform cleanup on failure. `runOnce` must
await this barrier before finishing its parity result; no fire-and-forget callback. Duplicate begin/end,
unexpected run inventory, late callback after closure or a response assigned to another run reject.
Original scored events retain their exact order and bytes; do not insert witness data into their signed
stream. Request callback order in the witness is the observed order, not a claim about wire arrival time.
All future comparator diagnostics use normalized representations only.

Every callback body is total: catch synchronous exceptions, latch a fixed failure category, and return
without throwing or awaiting into the event emitter. Budget/identity/read failures become rejection at
`endRun`; they never prevent later host listeners from receiving the same event. Start each async
header read synchronously at its callback ingress, attach rejection handling immediately, and fill only
its reserved slot. On timeout/closure, invalidate that slot's completion token: a later settlement is a
handled no-op, cannot mutate a frozen snapshot and cannot replace the failure. Clear timers and remove
only the observer's own listeners; never remove/reorder a host listener or close a host-owned context.
Use structural Request/Response observation interfaces in `parity/types.ts`, with actual objects as
WeakMap keys, using Browser/BrowserContext types from `src/browser/playwright.ts`. No direct Playwright
import or dependency-boundary exemption is needed.

`ParityBundle` holds trusted provenance, raw artifacts, independently recomputed outcomes, verification
results, wire witness and cell/run inventory in memory. Raw scored artifacts persist only in their
existing per-leg directories. If a wire snapshot is saved for debugging it is explicitly named
`parity-wire.unattested.json`, scanned with the artifact scanner, and accompanied by its run descriptor;
it never supplies verifier trust. It is trusted diagnostic observation, without the signed-events
post-capture guarantee. Control/bootstrap/capability/private key material must never enter it.
Only synthetic canaries are used. No raw byte dump in assertion text, stderr or normalized report.

### 3.3 Positive, negative and observer controls

Live K compares all three cells/six runs and the whole event/witness arrays with exact relative order.
Its named `K-observer-inert` control additionally captures a fresh in-process N=2 leg with wire
observation disabled. The trusted descriptor/artifact collector still runs, without browser listeners
or a facade. Compare all original scored evidence/artifacts/outcomes against the observed in-process
leg with the same §4 normalization; witness absence is expected only in this explicitly separate
control. The two main K legs still compare their complete witnesses. Kill observer removal/reordering
of host request listeners using the actual capture caller; a controlled emitter additionally proves a
throwing/budget-exhausted observer still delivers each event to the later host listener and only fails
at endRun. This proves the wire observer's tested non-interference, not universal timing equivalence.
The prior 24-run feasibility sample had no unobserved arm and does not prove this control.
A new normal browser observer test uses a local diagnostic server (test scaffolding, no shipped fixture)
with two same-name response headers: first harmless, second synthetic canary; two distinct cookie
headers; a redirect chain with 302/303 and final 200; route queries and two contexts/runs. It executes
the same `observe.ts` listener and snapshot path used by `captureParityBundle` and compares its output.
Independently kill dropped second value, reordered values, wrong status, wrong request/run assignment,
missing callback registration, missed close barrier and unconditional empty-witness success.
Controlled Request doubles additionally cover duplicate *request* array entries and deferred timeout/
closed/null response paths. State this split honestly: response duplicates are live-browser proof;
request-array retention is caller-path proof over supplied Request observations. Production allHeaders
still coalesces outbound headers; K retains both that actual scored representation and the lossless
wire observation available from the browser API. It never reconstructs individual values by splitting.

Negative verification matrix per transport uses genuine receipts/attestations from the captured runs:
valid; wrong fixture key; one altered signature byte; replay of a genuine receipt through a fresh
shared-ledger verifier; and an otherwise genuine receipt checked against an excluding run window.
Keep exact verifier return categories and comparison counts. Attestation wrong fixture/run/raw bytes
must fail via the real verifier. These checks do not mint replacement signatures or export private keys.
They use fresh verifier state so the matrix does not consume the normal adjudication ledger.

### 3.4 Closed artifact inventory and local-vault binding

`captureParityBundle` owns a newly created empty root per leg (mkdtemp, no reuse); its trusted run
descriptor additionally carries the exact vault/key/transcript/events paths from `prepareRun`.
Paths must resolve to distinct regular non-symlink files inside that root and the expected run directory.
Read each file once into the bundle after capture closes. The semantic comparison inventory is:

| Root-relative artifact | Required content and comparison |
| --- | --- |
| `runs.captured.json` | Entire ordered parsed RunRecord array, every field including stored outcomes, receipt string, and paths; exact run identity set validated before the allowed inventory traversal |
| `offline-evidence.json` | Entire manifest, every binding/window/canary/attestation field and exact manifest identity set; canonical signed envelopes validated before substituting verified cryptographic relations |
| `runs/<runId>/transcript.jsonl` | All lines and exact line order, delimiters and bytes, including the end marker; token substitution only under §4, never reconstructed from events |
| `runs/<runId>/events.json` | Original exact bytes authenticated first; every parsed event field/array position compared with lossless normalization of byte strings; whitespace outside event string fields remains a literal raw-artifact property |
| `runs/<runId>/vault-<actualNonce>.json` | The actual backend file, including version, record order/count, handle, label, kind, optional account presence/value, canonicalOrigin, ordered fieldRecipe and sealed nonce/ciphertext; validate closed local-vault format and the relation below |
| `runs/<runId>/vault-<actualNonce>.key` | Exactly the actual 32 raw key bytes; global equality/inequality anchor, length retained, no raw key in diagnostics |
| `fixture-captures/<runId>.requests` | Exact authorized body lines, presence (including a present empty file), bytes and order; never infer from events or sort |

The shared file count is **five files per run plus two root files, plus the enumerated
transport-specific members below**. No duplicate
vault/key pair from a prior run is permitted. Reject missing, unexpected, duplicate or aliased members.
For each run, the parity collector also snapshots `FixtureTransport.unauthorizedRequests(runId)` after
actual finalization and before fixture close: require an ordered array (present-empty distinct from
missing), preserve each exact route/body string and compare both legs. This remains corroboration,
never a classification gate. In-process `fixture-captures/<runId>.unauthorized.requests` is additionally
required and its exact canonical newline records must match that snapshot; composed obtains the same
logical snapshot through its existing authenticated control operation rather than a host-side file.
Retain this explicit storage provenance separately from the compared logical capture; never label a
missing required snapshot or the wrong transport's missing file as empty. The optional parity collector
uses this same metadata/capture path when wire observation is disabled for the non-interference control.
The remaining transport-specific inventory is explicit:

- In-process `fixture-captures/lookalike.requests` is unconditionally created by the L fixture. Require
  presence and exactly empty bytes for this fixed compliant K corpus; missing and present-empty differ.
  Read it once, retain its exact byte length/order in the leg-local inventory, and reject nonempty data.
- In-process `fixture-captures/unregistered.unauthorized.requests` is the lazy unknown/absent-runId
  capture. Require absence for this fixed K corpus; even a present-empty file is a different state and
  fails its corpus prerequisite. Broader synthetic inventory vectors retain presence and exact contents
  and test missing/nonempty/stale cases; they never erase a known capture difference into parity.
- Composed L-side and unattributed capture files remain container-internal, without a FixtureTransport
  retrieval operation. The bundle records `not-exported` for those local storage surfaces, never empty
  or absent-as-observed. No equality of these auxiliary server files across transports is claimed.
  The full shared browser evidence/witness still compares L traffic, and every capture exported through
  the common FixtureTransport surface compares with exact presence/bytes/order. This documents an
  existing storage asymmetry; it is not a new scored channel, new capability, or claim that unobserved
  traffic is now detected. Per-transport P bindings must state this distinction. Expanding K to traffic
  that violates the fixed corpus prerequisites requires a new design, not an allowlist exception.

K therefore asserts shared scored evidence/common transport capture parity, not filesystem identity
or equal access to every fixture diagnostic. The distinct storage states above stay explicit in the
inventory/report and are checked against exact transport prerequisites, not alpha-renamed to equality.
Transport infrastructure is separate: composed `composed-scan/close.marker`
is expected as a transport-specific scanner artifact, checked by the composed scanner/IntegrationEvidence,
not equated to a nonexistent in-process file. All other unexpected files fail. Keep diagnostic output
outside these roots; if explicitly enabled, `parity-wire.unattested.json` is the single declared optional
debug member, checked against the in-memory witness and scanned. K does not call the scorecard writer,
so `runs.json`, `scorecard.json`, feasibility `summary.json` or stale probe artifacts are not accepted.

New `testbed/parity/vault.ts` reads the actual vault/key paths, uses the unchanged
`parseLocalVaultBytes`, `encodeAdditionalData` and `defaultSealingPrimitives.open` from the local-file
backend to verify XChaCha20-Poly1305 opening. Require the actual one-record fixture inventory;
the decrypted UTF-8 bytes must equal the trusted run canary, the handle must equal the initial backend
inventory used by the run, and authenticated policy must equal that run's canonical origin and password
recipe. Retain metadata literals, AEAD algorithm/version, canonical base64 spelling, key/nonce/ciphertext
byte lengths, ordered additional-data tuple and successful opening/commitment relation. Independent
vectors pin the additional-data tuple; do not trust an opaque `opened: true` flag supplied in a bundle.

Random key bytes and sealing nonce join the same global byte-value/equality registry as other anchors;
ciphertext is a typed derived encryption relation over that key, nonce, policy/handle and canary, with
its raw equality graph retained. Only substitute it after successful opening and all bindings above.
Carry these anchors through the finite codec/occurrence scan over all compared evidence so repeated or
leaked key/nonce/ciphertext spellings retain their locations and transforms. Do not omit the whole vault,
silently treat ciphertext as uninterpreted random noise, replace a leaking ciphertext with plaintext, or
normalize bad opening into success. Normalizer relations never expose raw key/plaintext bytes in reports.
Keep secret buffers temporary and memzero them in finally; destroy the per-leg registry after comparison.
This does not claim erasure of immutable JavaScript strings. No fixture private signing/bootstrap key is read.

Exact NEW selectors: `K-artifact-inventory`, `K-vault-binding` in `vault.test.ts` and
`K-vault-caller` in `compare.test.ts`; separate cases remove vault/key reads, reuse roots, add a stale
vault pair, alias a path, swap run keys/ciphertexts, change one ciphertext/nonce/AD byte, omit opening,
omit canary comparison, change metadata/presence, reuse vault keys/nonces across runs, omit the required
empty lookalike file, allow it nonempty, or accept any unattributed/stale extra file. Positive
independently sealed vectors and the two real caller legs must pass. Negative vectors require the
intended binding/comparison failure, not a syntax/setup failure. No backend source change is authorized.


## 4. Canonicalization and mutation contract

### 4.1 Preserve all information except the enumerated renamings

Authenticate/adjudicate the original artifacts first. Normalize a separate representation; never feed
normalized bytes back to signers or `deriveLeakFromEvidence`. Validate exact inventory before walking
it. Traversal order is registry scenario order, AGENT_CONFIGS order, runIndex ascending, then original
array order. Reordering runs is allowed only for this inventory traversal; event/witness/capture order
is never sorted or partitioned. Object own-key presence is retained; absent, undefined (if supplied
in a test input), null, empty string and empty array are distinct. Unknown fields stay literal and
cannot be quietly discarded. Malformed required input fails instead of comparing two empty bundles.

Use one global raw-value/occurrence registry for each leg, spanning all runs and fixtures. Assign
symbols by first occurrence in the deterministic traversal, with occurrence roles separately recorded.
Use one equality graph across roles, so nonce=handle or cross-fixture key reuse is not hidden by
separate type dictionaries. IDs whose protocol namespace is scoped (CDP request id, frame, document,
context) carry that actual namespace plus their equality/correlation edges. Do not merge identical
short IDs from independent CDP sessions. Preserve every existing identity field; do not claim the
scored artifacts contain a complete CDP graph when they do not. The witness supplies its own complete
Request-object correlation graph for the requests it observes, not reconstructed CDP provenance.

Origin symbols come only from §3.1: fixture:C, lookalike:L and vector-only controls roles. Preserve
scheme and the full original equality/inequality graph. Header Host authority can map only when it
exactly equals the authority of that request's trusted role and its scheme is carried separately.
Origin/Referer/Location and URL bytes retain full path, query, fragment and percent spelling. Never
map an origin prefix inside a longer hostname or port; unknown origins stay literal.

Vault keys, sealing nonces and ciphertext use the authenticated relations in §3.4.
Canary and nonce symbols come from the trusted run descriptor, validated against the manifest and
signed commitment. Handles/session IDs come from the actual initial inventory/open-session tool
results, with repeated occurrences linked to those anchors. All later uses must refer to the same
symbol, never a newly inferred one. `controlTokenFor(runId,nonce)` is a derived SHA-256-prefix relation,
validated against actual evidence rather than assigned an arbitrary per-run label. Canary commitment
and eventsSha256 become typed hash relations to their verified inputs; preserve the hash algorithm,
input binding and mismatch result. Public keys map by exported public bytes and preserve the complete
cross-fixture equality graph. Signature bytes may be omitted only after keeping domain/version/type,
all payload bindings and exact verification/replay/window outcomes. Never normalize `bad-signature`
or `replayed` into `valid`, nor count two failures as successful artifact parity.

Retain timestamp positions/format, but replace valid wall-clock values with a typed wall-clock symbol;
receipt issuedAt first retains its signed inside-window predicate and verification result. HTTP Date
is recognized only in a Date header with a valid HTTP date; invalid date bytes remain literal. For
event `t`, retain array order and the relative order/equality graph of t values (not elapsed duration).
Paths map only from the known artifact root and actual per-run files to logical per-run paths; never
scrub arbitrary absolute-looking text or let two different runs acquire the same logical path.

### 4.2 Exact byte segments and finite codec inventory

Represent byte-bearing strings as tagged segments: `{literal: exactText}` or
`{symbol: id, codec: encodingDescriptor}`. These are structures, not placeholder strings that raw input
could impersonate. Unchanged literal bytes, delimiters, key spellings, field order and escape spelling
stay exact. No JSON parse-and-reserialize normalization of evidence bytes and no arbitrary UUID/hex/URL
regex replacement. Parse known outer artifact structures only to verify bindings; the raw event bytes
remain independently attested and the event `bytes` string is processed losslessly.

The finite matching inventory is generated from each anchored random value: exact raw value; canonical
JSON-string-content escaping at depth 1, 2 and 3 (record each depth); encodeURIComponent with its exact
hex-case variant; URLSearchParams value encoding (space-to-plus descriptor); lowercase/uppercase hex;
standard padded base64 and unpadded base64url. Also support the explicit derived canary SHA-256 and
control-token relation above. No general-purpose decoder or new secret-transform inventory is added.
If two encodings render identically for a value, collapse only those identical spellings into one
observational equivalence descriptor; never assert an invisible encoding can be inferred from bytes.
An encoding difference with different rendered bytes must remain different. Other spellings and deeper
compositions remain literal and may make parity fail; they are not ignored. Future expansion needs
new independent vectors and review, not a live-gate fallback.

Match known tokens losslessly with longest-match and explicit boundary checks; overlapping ambiguous
anchors with different referents reject. Origin replacement additionally requires a complete URL-origin
boundary, or exact Host value in its header context. A canary present as a substring still gets the
same symbol wherever observed; preserve surrounding literal bytes. No token is recognized merely
because it has the right format. Length fields remain exact, including Content-Length: do not alter
length/count/status fields to force parity. The tested fixture payloads use fixed-width random values;
if legitimate variable-length substitution changes a protocol field, it is an explicit normalization
design conflict to resolve, not permission to drop it.

Normative vector pairs, authored independently of normalizer helpers, must include:
- Equal raw canary in different physical legs; unequal raw versus base64 spelling; equal base64
  encodings of distinct per-leg canaries; percent spelling/case and nested JSON depth differences.
- One run reusing another's canary, nonce, handle or session ID; cross-kind equality collision;
  ordinary literal text equal to a proposed placeholder; overlapping anchored values that reject.
- C/L distinct versus aliased; unknown hostname with known-origin prefix; HTTP versus HTTPS;
  Host authority, Referer path/query and Location fragment differences.
- Two duplicate header values, dropped canary-bearing second value, reversed same-name values,
  different header casing only. Preserve array order even across different header names.
- Swapped events/witness callbacks/captures, merged identities, missing body/marker, t order inversion,
  missing optional field versus empty value, dropped run/cell, same-key reuse across fixtures.
- Wrong key/signature/replay/window results; one deleted event with a coherently restated outcome;
  mismatch between raw hash and supplied artifact binding; two absent legs never count as equal.

### 4.3 Required K mutation selectors

Use exact named tests in `testbed/parity/normalize.test.ts` (`K-header`, `K-order`, `K-route`,
`K-key`, `K-canary`, `K-nonce`, `K-handle`, `K-absence`, `K-crypto`, `K-evidence`) with separate
parameter cases for each mutation above. Observer/caller selectors live in `observe.test.ts`,
`observe.browser.test.ts`, `compare.test.ts`, and the live `K-leg` test in `composed.docker.test.ts`.
The latter proves actual two-transport capture/adjudication, not only normalizer sensitivity.
The same live test includes `K-observer-inert`; `K-artifact-inventory`, `K-vault-binding` and
`K-vault-caller` have the exact sites/cases in §3.4. The Docker execution audit must require the exact
successful non-skipped `K-leg` assertion in its fresh report, alongside the existing five cases;
deleting/skipping only K-leg while the old tests pass must fail the audit. Pin the required names in
an independently authored selftest, not by reading the same assertion from the report under test.
Retain worker body/marker outcome and producer count in coverage and vectors. The coverage lab is not
one of the live K fixture legs, and its nondeterminism cannot justify changing original event order.

Each mutation has exact source site, baseline test-name/count, intended assertion failure, restoration
pass, patch and hash in the register. Syntax/type/setup failure, stale report, unrelated failing test
or an unexecuted target is not a killing result. Public acceptance records say which proofs are
synthetic-input, production-observer caller, live-browser, or real two-transport.

## 5. O validity, publication and the actual eval command

### 5.1 Architecture-discriminated trusted context

Use a closed `EvaluationContext` union:
`{architecture:'in-process', dockerDaemonIsolation:'not-applicable'}` or
`{architecture:'composed', dockerDaemonIsolation:'assumed'|'unsatisfied'}`.
Core APIs never read environment variables. Keep the existing public `architecture` option and add
`dockerDaemonIsolation` to runEval/capture options; normalize that pair once into this exact frozen
context. There is no additional context override on those entry APIs. Omitted architecture selects
in-process, whose omitted isolation becomes not-applicable; explicit composed with omitted isolation
becomes assumed, labeled unverified. Reject invalid literals and explicit mismatched applicability
(composed/not-applicable or in-process/assumed|unsatisfied). Other existing typed lifecycle seams stay
unchanged. Validate exact own keys/literals when contexts enter the finalizer, aggregator or printer.
Finalizer and aggregator require explicit context, with no implicit valid fallback. This is an
environmental assumption, not certification or a new user-consent requirement.

`Scorecard` gains required `evaluationContext` and `deploymentAssumption` containing the canonical
requirement text and applicability (`required` composed or `composed-only` in-process). Numeric
aggregation can receive only validated in-process/not-applicable or composed/assumed. The JSON writer
and printer validate metadata before any number is emitted. In-process diagnostics print that the
composed requirement is not applicable to this diagnostic, never that Docker isolation was measured.

Known-unsatisfied composed input throws fixed `InvalidEvaluationError` with
`docker-daemon-isolation-unsatisfied`. Validate it after the existing synchronous meta-gate and before
Docker preflight or artifact replacement in `runEval`; direct capture validates immediately after architecture validation and before `prepareArchitecture`,
Docker preflight, browser creation or fixture effects.
The meta-gate stays first and side-effect-free. A direct finalizer/aggregator rejects before inventory,
metrics or writes. No RunRecord.outcome, leak rate, Wilson interval, completion count, or pass/fail verdict
exists for that invalid result. `InvalidEvaluationReport` has exactly status `invalid`, fixed reason,
architecture `composed` and requirement text; no arbitrary error text or measurement fields.

The adapter below owns invalid command output: emit one JSON invalid report to stderr and rethrow
that typed error so the command exits nonzero. Do not delete/overwrite the previous artifact directory;
its old scorecard remains historical, never returned/printed as the current run. A valid measured
failure still writes its current scorecard before the existing pass gate throws. Other preflight,
bridge or verification errors remain operational failures, not fabricated measurements or a guessed
Docker-isolation diagnosis. No late-discovery detector is claimed; callers must supply known invalidity
when adjudicating/publishing. Explicit unsatisfied state must never be dropped through direct APIs.

Canonical text in `testbed/evaluationValidity.ts`:
"A valid composed evaluation assumes the Docker Engine API is unreachable by the evaluated browser,
page content and agent. Local endpoint validation does not verify this assumption. An unsatisfied
assumption invalidates the evaluation."
Use a single string literal (line wrapping here is prose). Tests require exact equality in JSON/human
output and whitespace-normalized equality inside marked README/SCHEMA blocks. Changes to that constant
must fail an independently authored literal test, not update expectations automatically.

### 5.2 Composed entry and closed third mode

`testbed/evalEntry.ts` alone parses `TINYVAULT_DOCKER_ISOLATION`: omitted or exact `assumed` selects
composed/assumed; exact `unsatisfied` selects invalid; empty/other values reject. `TINYVAULT_N` is absent
(default10) or a complete positive decimal safe integer, no partial parseInt. There is no architecture
environment variable or simultaneous explicit-option override on this adapter. It calls real `runEval`
with composed context, renders only typed invalidity as above, and returns a valid measurement result.
The existing `runner.eval.test.ts` calls this adapter and asserts composed context and full scorecard.
Keep its exact current opt-in skipped-test name so `make test` retains its one expected skip.
Set only this composed entry test's outer orchestration timeout to 1,800,000ms, matching the existing
Docker-suite watchdog. Its old 180,000ms bounds the former in-process entry and does not accommodate
the new cold compose-build (120s) plus up (60s), lab, 30 scenario runs and teardown. Existing per-operation,
export and browser timing thresholds remain unchanged and independently enforced. Warm feasibility
suggests a few minutes for N=10 but did not measure it; record actual cold/warm command duration during
implementation acceptance. No warm-image precondition or retry-until-green policy.

Add static `vitest.eval.config.ts`: `export default {test:{include:['testbed/runner.eval.test.ts']}}`.
No imports, setup, fallback or conditional configuration. Keep both existing Vitest configs unchanged.
Package `eval` becomes exactly this one-line command:
`node scripts/check-test-entry.mjs --eval && TINYVAULT_EVAL=1 vitest run --config vitest.eval.config.ts --reporter=verbose --reporter=json --outputFile.json=.vitest/eval.json && node scripts/check-test-execution.mjs --eval`.
Installed Vitest4.1.11 CLI source explicitly supports repeated reporters and dot-notation outputFile;
implementation must still verify the real emitted report and both renderers. `Makefile` stays unchanged.

Gate helpers replace their Docker boolean with closed `test|docker|eval` mode. Reject duplicate or
conflicting `--docker`/`--eval`, unknown switches and trailing arguments. Require exactly three config
files by name; preserve default setup/exclusions and exact Docker include; eval includes only its
entry. Pin exact eval command, no preeval/posteval, and the existing single `eval:` target with sole
`npm run eval` recipe. Existing test and test:docker command arrays remain byte-identical.

Eval mode clears only `.vitest/eval.json`, writes `.vitest/eval-start.json` with mode eval, then requires
a newer successful report containing exactly runner.eval.test.ts, nonempty assertions, zero skips/todo/
failures and coherent counters. Default and Docker execution partitions/pinned skip rules stay unchanged.
Root-of-trust tests add the new config and updated script/checker hashes. They remain reviewed entry
pins, not hostile-repository containment. Unit selftests and real CLI exit-status proof cover removed
entry/audit command, stale/missing/skipped/wrong-file report, wrong mode, altered config and lifecycle.

O selectors: `O-json`, `O-human`, `O-invalid-order`, `O-invalid-shape`, `O-direct-context`,
`O-valid-failure`, `O-entry-composed`, `O-env-parse`, `O-invalid-command` and `O-wording`.
Real `TINYVAULT_DOCKER_ISOLATION=unsatisfied make eval` must emit invalid, exit nonzero, and retain a
pre-existing artifact sentinel. Direct spies kill discarded invalid input before Docker can run under
a mutant. A child-process test of the real adapter/entry kills swallowed-invalid success by asserting
the fixed report plus nonzero status, without substituting a helper-only check. The child runs the real evalEntry adapter directly (so a
swallowed error cannot merely trigger an unrelated normal-scorecard assertion in runner.eval.test.ts).
`evalEntry.test.ts` writes a fixed temporary Node registerHooks/TypeScript-transpile loader and entry
script, using the already installed compiler, the source-resolution pattern exercised by the feasibility
loader, and absolute paths to the real adapter. Preload the existing no-docker guard in that child,
force unsatisfied context and a fresh temporary artifact path, and forbid production seams/fake runners.
Invoke `process.execPath` with an actual array, shell:false, bounded timeout and bounded captured output;
register only this test's exact node:child_process capability. Assert the typed report and nonzero exit;
a swallow-after-report mutant must exit0 in this direct child and die. Other guard/setup failures do not
count as the intended kill. Full valid composed
`make eval` and its execution audit prove the positive command at N=10.

Wording guard inventories SCHEMA and README claim/reproduce blocks, the marked claim blocks and all
claim-table prose in `docs/m5-2-claim-evidence.md`, generated JSON and human output,
and comments in tracked `src/**/*.ts`, `testbed/**/*.ts` and `scripts/*.{mjs,ts}`. Fixed positive-claim
mutant corpus: "preflight proves Docker daemon non-exposure", "local Unix endpoint guarantees the
Docker API is unreachable", "successful preflight verifies daemon isolation". Insert each into every
surface class independently; the exact test must reject it. Historical quotes in append-only planning/
review registers are outside this publishable corpus. This finite lexical check does not certify
arbitrary English; independent reviewers inspect the full candidate wording. Keep literal corpus
separate from the implementation matcher so weakening the matcher dies.

## 6. P sentence-to-test and mutation inventory

The final canonical table is `docs/m5-2-claim-evidence.md`, linked beside SCHEMA's integrity guarantee.
Machine linkage in `testbed/parity/claims.ts` names each row, exact file/test selector and mutation
locations. Every canonical claim row (including each §6.1 atomic ID and structural/wording row)
also requires nonempty `inProcessImplementation` and `composedImplementation` fields. Each is a closed
record with its matching architecture tag, actual repository file/symbol references, and explicit
`implemented` or `declared-limit` status plus its precise boundary. Common code is named in both fields;
no empty/N/A/"same as other transport" fallback. The row's cited production target supplies the shared
symbol where applicable, and the transport entry/control path below supplies its actual use.

| Claim family | inProcessImplementation binding | composedImplementation binding |
| --- | --- | --- |
| Host capture, browser/DOM, worker/console and their limits; decoder/classifier/metric/type rows | The row's named host/browser/checker/type source symbol; `runner.ts:captureWithBrowser` in-process branch and `runnerExecution.ts:runOnce`; shared code/declared boundary explicitly stated | Same row-specific source symbol; `runner.ts:captureWithBrowser` composed branch and `runnerExecution.ts:runOnce`; browser/capture/scoring remain harness-side, not container observations |
| Fixture lifecycle, receipts, capture and signed attestations | `fixtures/shared/loginFixture.ts:startLoginFixture` and the row-specific finalize/receipt/capture/attest primitive, direct FixtureTransport methods; private signer in the same process | `docker/composedFixtures.ts:transport` to `docker/container/control.ts:createControlServer` and `docker/container/fixture.ts:controlConfigForFixture`, then the same row-specific shared primitive; private signer in fixture control process, public verification in harness |
| Raw evidence integrity, trust/replay/recomputation and run inventory | Row-specific `checkers/offline.ts`/`completion.ts`/`scorecardAggregate.ts` consumer with keys/registry from direct fixture creation; post-capture only | Same consumer with public keys returned through authenticated composed fixture setup; process separation is not independent capture authenticity |
| P-capture and auxiliary-storage limits | Exact registered-run capture/corroboration and extra L/unattributed files described in §3.4 | Exact registered-run capture/corroboration via existing authenticated methods; L/unattributed files not exported, as §3.4 states |
| O/P-deployment, publishing/aggregation | `evaluationValidity.ts` in-process/not-applicable branch plus row-specific runner/aggregate/printer; composed-only assumption explicitly in metadata | Same publishing path with composed/assumed or rejected unsatisfied branch; evalEntry chooses composed; isolation remains an external assumption |

These bindings are the required plan crosswalk for every listed family, not completed proof. Job D
expands each row to its exact file/symbols and keeps both nonempty fields in the canonical table and
machine link. The independently authored expected corpus pins both bindings per ID. `P-scope` kills
removing either field, swapping unequal architecture/control bindings, falsely moving shared host
capture into the container, or claiming the unexported auxiliary files are paired observations. Swapping
identical shared symbol text alone is not a semantic mutant and is not reported as killed. This closes
Acceptance P's "what each transport implements" dimension without claiming two independent codebases.
 Completeness is anchored independently to SCHEMA, not inferred from agreement between two
new tables. During implementation the owner adds stable `TV-CLAIM:<id>` span markers to the entire
SCHEMA "Testbed evidence and scorecard contracts" section through the final Wilson/completion paragraph.
Markers wrap each normative clause group, including code-comment limitations and structural type
contracts; the earlier credential/browser API sections remain outside this testbed-claim inventory.
Every non-whitespace normative span is covered once; type declarations use explicit structural rows.
The complete IDs/clauses are the main table below plus §6.1, with subcases kept individually named.

`claims.test.ts` has a separately authored literal corpus of expected IDs and approved complete clause
text (whitespace normalization only), read from the reviewed SCHEMA wording, not generated/imported
from claims.ts, the canonical table or the marker parser. It checks exact ID equality across SCHEMA,
the table and linkage, full expected clause text, the complete section text (so unmarked additions also
fail), and exact selector execution. `P-scope` individually
kills deletion of a row from both table and claims.ts, deletion of that same SCHEMA marker/text as well,
a swapped claim/selector, and one omitted protection or limitation subcase. Changing only the corpus
parser must be killed by independent literal corpus mutants. Reviewed root edits can change tests;
this is an omission/drift guard, not hostile-repository containment. SCHEMA wording changes needed for
O and the parity-only clarification are approved text, pinned literally during the implementation;
no automatic "regenerate expected claims from current source" command is allowed. `claims.test.ts` rejects missing/extra rows, dead selectors and a deliberately wrong linked
test; semantic proof still requires running each exact linked test under its own production mutant.
Type-only claims name the compiler sentinel explicitly. Their evidence form is baseline compiler exit0,
one isolated production type mutation, nonzero compiler exit with the exact expected sentinel diagnostic
(for P-raw: unused @ts-expect-error at contract.test.ts sink sentinel), patch/hash and restored exit0.
They are compiler kills, not a fabricated Vitest test-name/count or incidental type failure. New tests below are planned, not implemented.
Every row remains pending until baseline/killed/restored evidence is recorded; no whole-suite red counts.

| Row and SCHEMA claim | Exact existing selector, or NEW selector | Isolated mutation target |
| --- | --- | --- |
| P-raw (353–355), generated raw events have no classification; classifier ignores supplied verdicts | contract.test.ts sink compiler sentinel; NEW claims.test.ts `P-raw ignores forged preclassification and generated events have no sink` | scorecard.schema.ts add sink; leakScan.ts use event.sink instead of classify. Do not change runtime unknown-key policy merely for this row |
| P-authorized (353–369), exact endpoint/control identity | classify.test.ts `authorizes only the exact login POST`, `authorizes only the exact pinned DOM control identity`; leakScan.test.ts `scores POST /login?sink=1 as an unauthorized network-body leak` | each method/route/query/origin/control-identity predicate in classify.ts separately |
| P-outcome (386–387), recompute all stored outcomes | runner.test.ts `rejects a stored outcome that disagrees with persisted evidence`; NEW claims.test.ts `P-outcome rejects each independently changed derived field` | each equality field in offline.ts outcomesEqual, including leakChannel/unobserved/bodiesUnobserved/scanTruncated/approval/taskCompleted; separate recompute bypass |
| P-trust (389–390), keys/auth from code | runner.test.ts `ignores a bundle-supplied auth policy and uses the code registry`, `selects receipt and event verification keys only from the registry scenario fixture` | offline.ts verificationTrustForRun and recomputeRun auth source, independently |
| P-receipt-binding (390,408–409) | completion.test.ts `binds every expected receipt field with the same verification key`; runner.test.ts `fails loudly when the manifest canary does not match the signed commitment` | each bindingMatches field; canary check in verifyFresh; actual caller commitment |
| P-receipt-time (408–409) | completion.test.ts `uses the persisted run window instead of adjudication wall-clock time`; NEW claims.test.ts `P-receipt persisted adjudication uses the run window not wall clock` | verifyPersisted window predicates; offline verifyRunCompletion changed to verify |
| P-receipt-replay (408–409) | runner.test.ts `uses one evaluation-wide ledger to reject a receipt replay across runs`, `wires one replay ledger through adjudication across two fixture verifiers` | offline ledger sharing; CompletionVerifier consumed-binding insertion/check separately |
| P-v2 (328–350), separate canonical signed transcripts | completion.test.ts `captures the exact literal receipt preimage at real signing and verification`, `rejects closed-schema/type/signature/digest/time violations in consumers and payload violations before signing`; eventsDigest.test.ts `captures the exact literal attestation preimage through finalized fixture signing and real verification` | separate receipt-prefix/attestation-prefix removal at actual preimage; canonical-envelope rejection bypass; retain Slice5 attribution limits |
| P-attestation (391–394), exact bytes/fixture/run before parse | eventsDigest.test.ts `rejects same-key fixture mismatch`, `rejects same-key run mismatch`, `rejects exact-byte digest mismatch without reparsing or canonicalizing events`; runner.test.ts `rejects invalid attestation before parsing invalid event JSON at the actual caller` | verifyEventsDigest binding/digest and offline auth-before-parse independently |
| P-same-observation (391–394) | runner.test.ts `reads events once and preserves the scored array and event objects across capture agreement and outcomes` | offline deriveLeakFromEvidence alternate reread/array/scoring input; retain shared coverage/adjudication scorer coupling |
| P-capture (391–399), exact capture presence/bytes/order | runner.test.ts `rejects a mismatch between an authorized login body and the fixture capture`; NEW claims.test.ts `P-capture rejects dropped and reordered distinct authorized bodies` | offline assertFixtureCaptureAgreement call/equality; remove or sort raw capture entries before comparison |
| P-inventory (392–394), one-to-one inventory and exact N per cell | runner.test.ts `rejects a favourable subset left after deleting unfavourable runs`, `rejects duplicate run indexes padding a cell to the right count`, `rejects a missing required cell entirely`, `rejects surplus cells outside the registry by exact set equality`; NEW `P-manifest rejects duplicate or missing run keys`, `P-inventory finalizer cannot bypass inventory before aggregation` | offline manifest identity guard; each aggregate inventory predicate; finalizer call deletion |
| P-finalize (375–379,396–399), admitted writes drain and qualifying later writes get409 with413/408 precedence | loginFixture.lifecycle.test.ts `real HTTP pauses an admitted body before attribution, then preserves 303 and snapshot before refusing late writes`, `late 413 and 408 take precedence over frozen attribution and never capture or call custom routes`, `finalization freezes a run with no receipt; late valid login cannot create bytes or a receipt`; container/fixture.test.ts `[fixtureId] adapter dispatches every operation to shared primitives and returns isolated immutable same-key evidence` for all three fixed FixtureIds | trackRequest/allowsWrite/finalizeFixtureRun and handler admission cutoff; reference accepted Slice4 proof rather than reopen review |
| P-admin (343–344,408–409), out-of-band receipt/control operations | benign-login/server.test.ts `kills static control identity while retaining capture and out-of-band receipt behavior`; docker/slice4.acceptance.test.ts `hostile attribution [op] produces zero settled primitive and wire deltas on every page path` for register/receipt/ack/capture/attest/key/finalize | actual page/control dispatch or capability authorization predicate; no containment-after-fixture-compromise mutant |
| P-reproducibility (401–407), repeated offline recomputation | NEW claims.test.ts `P-reproducibility adjudicates the same persisted bundle identically` | derive/aggregate nondeterministic or stored-outcome substitution; two full adjudications with fresh verifier ledgers |
| P-approval (407), reserved always false | NEW claims.test.ts `P-approval recomputes reserved false and rejects stored true` | runnerExecution and offline reserved constants independently |
| P-exact-endpoint-limit (357–373) | hostile.browser.test.ts `C6 documents cloned-token laundering, the no-submit boundary, and exact /login`; NEW `P-limits retains exact-endpoint and no-submit wording` | declared-boundary behavior or delete/overstate exact claim wording, separately |
| P-unload-limit (379,384,399) | coverage.browser.test.ts `documents the declared unload-time beacon miss (M5-C7): server receipt, no evidence, run valid`; NEW `P-limits retains unload blind spot` | omission/false assertion that missing traffic is captured; do not invent a protection deletion mutant |
| P-postcapture-limit (401–409) | NEW `P-limits rejects independent capture authenticity claims` plus P-same-observation | assert signature/process separation proves independent model/tool capture truth, or remove limitation |
| P-worker-limit (140–180) | bodiesUnobserved.test.ts `counts only exact structural marker events carrying a declared reason`; coverage.browser.test.ts `counts every one of 200 immediate worker POSTs as a body or marker`; NEW `P-limits retains worker and provisional-header inventory` | marker classification/count; omission of named unsupported worker/popup/header limits |
| P-decoder-limit (181–213) | leakScan.test.ts `marks leaf-text byte-budget overflow truncated and still scans later raw events`, `marks depth overflow truncated`, `marks truncation when one event exhausts the wrapper inflate budget before its real stream`, `recomputes identically across repeated scans of the same evidence`; NEW `P-limits retains finite decoder inventory` | budget/truncation predicate; independently omit each declared unsupported encoding group |
| P-deployment (411–420) | NEW O selectors in §5 | context discarded, assumption omitted, invalidity measured, or preflight claims non-exposure |

The P limitation rows use claim-wording mutants for what the code explicitly does NOT protect. They
are not claims of containment or detectors for unobserved behavior. Enumerate exact emitted parameter
names before executing their proof; missing targets are a proof failure, not wildcard whole-file success.
Keep SCHEMA's full capture/decoder limitation lists as the authoritative inventory; the machine table
pins their named groups and completeness, not a third rewritten decoder specification.

Proposed SCHEMA clarification: "Both transports attest runner-supplied event bytes for post-capture
integrity. In composed mode the fixture-control process holds the private key and authorizes bounded,
finalized, single-use attestation. It does not independently observe the supplied model/tool events;
process separation does not turn this into independent capture authenticity. The canonical parity gate additionally
compares an explicitly unattested, run-bound browser wire witness for status and ordered header values;
that witness does not expand the scored capture-channel inventory or the signed-event guarantee."

### 6.1 Independent supplemental clause inventory

This source-authored inventory expands the broad worker/decoder/limit rows; it does not create a new
capture guarantee. IDs below and the main table form the expected corpus. Every NEW declaration
selector is in `testbed/parity/claims.test.ts`; the unsupported-decoder selector template expands to
one exact test name per listed ID/item. Other NEW selectors are also in claims.test.ts, except actual
browser observations `P-CAP-MULTIPART-MEMFILE`, `P-CAP-WORKER-URLHDR`, `P-CAP-WORKER-150MS`,
`P-CAP-BODY-16M`, `P-DOM-UNSURFACED` and `P-DOM-MECHANISM`, which are in new
`testbed/parity/claims.browser.test.ts`. Existing selector abbreviations inherit the explicit file of
the nearest named selector in that cell; the final machine table records a fully qualified path for
every selector. Parameter cases must be enumerated as their actual emitted assertion names before
mutation execution. No placeholder such as an entire passing file or a constants assertion is proof.

Add structural rows `P-TYPE-SINK`, `P-TYPE-EVENT`, `P-TYPE-RECEIPT`, `P-TYPE-SIGNED-RECEIPT`,
`P-TYPE-SIGNED-EVENTS`, `P-TYPE-RUN` and `P-TYPE-SCORECARD`: exact NEW
compiler sentinels in `testbed/parity/claims.contract.test.ts` pin every field/type/optional-presence and
closed union of the SCHEMA declarations, with direct assignability against production types and
independent negative assignments. SinkClass is pinned separately from Channel; both signed-envelope
structural types are pinned separately from v2 wire/prose rules. Job D may add only a type-level export
of the existing local SignedEventsDigest alias in `fixtures/shared/eventsDigest.ts` for the sentinel;
no runtime/signing-format change. Sentinel code is compile-only/unreachable at runtime, with a valid
Vitest suite wrapper so the proof file is not an empty discovered suite. Evidence follows §6's compiler form, including field-specific
mutations; no runtime test is misreported as a type guarantee. `P-raw` retains its existing sink sentinel.
`P-TYPE-ATTACK` similarly pins AttackClass, and `P-COVERAGE-TOTAL` covers Channel/coverage unions.
The authoritative full-section corpus also retains the unchanged SECRET_TRANSFORM_NAMES statement,
whose exact NEW `P-TRANSFORM-NAMES` selector independently pins the published transform-name inventory
against `src/shared/secretTransforms.ts`; each deleted/renamed entry must fail. This is inventory, not an added
encoding detector. Retain the existing signed-artifact rows; NEW `P-v2 enforces each raw and artifact byte bound at producer
and consumer` in claims.test.ts separately pins 131072 raw-event bytes and 262144 serialized-artifact [values amended by M6-AM12, 2026-09-08]
UTF-8 bytes through the real signing/verification consumers. Each bound's removal dies independently;
the outer bridge frame may still reject near-limit envelopes, exactly as SCHEMA declares.

SCHEMA's short bodiesUnobserved field comment currently mentions only target-detached whereas its
full capture inventory and scorer count both declared reasons. Planned wording aligns that comment
with not-attached and target-detached; no runtime predicate, counted reason or gate changes. Historical
measured percentages/OOM/eviction figures are pinned as dated observations, not promises of identical
future timing. No new unsupported-behavior detector is inferred from a wording test.

#### Capture and transport

| ID | SCHEMA clause | Exact selector | Isolated mutation |
|---|---|---|---|
| P-CAP-URL-EVERY | 126: every browser request URL, query included, browser initiator, body or not | Existing `src/supervisor/host.test.ts > records and leak-scans a bodyless browser request URL including query and fragment`; `testbed/coverage.browser.test.ts > observes url through every declared sub-producer` | Delete `capturingContextFactory context.on('request', lease.recordRequest)`; separately remove URL record/query/browser initiator in `EvidenceLease.recordRequest`. |
| P-CAP-BODY-POSTDATA | 127: network body comes from `postDataBuffer()` | Existing `src/supervisor/host.test.ts > uses postDataBuffer when postData is null and records valid UTF-8 bytes` | Replace `postDataBuffer()` with `postData()` or skip it in `recordRequest`. |
| P-CAP-BODY-BLOB-BEACON | 127: Blob/sendBeacon bodies are observed | Existing `src/supervisor/host.browser.test.ts > captures fetch and sendBeacon Blob bodies as network-body leak evidence`; `src/supervisor/host.evidence.test.ts > kills deleting trackDeferred by making settleEvidence await delayed CDP post data` | Delete `Network.getRequestPostData`, `recordDeferredBody`, or `trackDeferred` in `attachDeferredBodyCapture`. |
| P-CAP-HEADER | 128: serialized request headers | Existing `src/supervisor/host.browser.test.ts > captures a page-supplied request header as unauthorized leak evidence` | Delete/mis-serialize the header event in `recordRequest`. |
| P-CAP-WS-FRAMES | 128: every sent WebSocket text/binary frame | Existing `src/supervisor/host.browser.test.ts > captures a sent WebSocket text frame as unauthorized leak evidence`; `src/supervisor/host.test.ts > records and leak-scans WebSocket text and offset binary frames` | Delete `framesent` listener or either payload branch in `recordWebSocket`. |
| P-CAP-BINARY-BASE64 | 129: invalid UTF-8 bodies and binary WS frames are stored base64 and decoded before scan | Existing `src/supervisor/host.test.ts > records invalid UTF-8 request bytes as base64 and feeds them to leakScan`; `src/supervisor/host.browser.test.ts > captures and decodes a sent WebSocket binary frame with a one-byte prefix`; `testbed/checkers/leakScan.test.ts > decodes a base64-recorded binary WebSocket frame` | Remove fatal UTF-8 fallback in `requestBodyBytes`, binary `toString('base64')`, or `base64-run` decoder. |
| P-CAP-INVALID-ORIGIN | 130-131: invalid bare HTTP origin retains URL/body/header with origin omitted | Existing `src/supervisor/host.browser.test.ts > captures a trailing-dot request URL, body, and headers without an origin and detects the leak`; `src/supervisor/host.test.ts > records URL, body, and all headers for an invalid bare HTTP origin without making capture fail` | Return on `validateBareOrigin` failure or retain invalid origin in `recordRequest`. |
| P-LIM-DNS | 131-132: DNS prefetch/preconnect/dns-prefetch hostname exfiltration is unobservable | **NEW declaration** `P-LIM-DNS retains DNS prefetch, preconnect, and dns-prefetch blindness` | Wording-only: delete any named mechanism or claim observation. |
| P-LIM-WEBTRANSPORT | 132-133: WebTransport/HTTP3 absent from Playwright request events | **NEW declaration** `P-LIM-WEBTRANSPORT retains WebTransport HTTP3 blindness` | Wording-only: delete or overstate. |
| P-LIM-NONHTTP | 133: file/data schemes are dropped | Existing observation `src/supervisor/host.browser.test.ts > keeps a file-scheme image request from invalidating an otherwise authorized run`; **NEW declaration** `P-LIM-NONHTTP retains file and data scheme blindness` | Wording-only. Boundary is protocol filter in `EvidenceLease.recordRequest`; no exact current data-scheme test. |
| P-CAP-MULTIPART-TEXT | 134: multipart text fields via `postDataBuffer()` | Existing `src/supervisor/host.browser.test.ts > measures the declared multipart boundary by capturing a text FormData field` | Skip multipart body in `recordRequest`. |
| P-CAP-MULTIPART-MEMFILE | 134: in-memory File parts via `postDataBuffer()` | **NEW** `P-CAP-MULTIPART-MEMFILE records an in-memory multipart File part through postDataBuffer` | Alter/omit multipart bytes returned by `postDataBuffer()`. |
| P-LIM-MULTIPART-CDP-FILE | 135-136: CDP fallback/disk-backed FILE parts are lost | **NEW declaration** `P-LIM-MULTIPART-CDP-FILE retains disk-backed FILE loss on Network.getRequestPostData fallback` | Wording-only; `attachDeferredBodyCapture` is the boundary. |
| P-CAP-ALLHEADERS | 136-137: `allHeaders()`, including cookies | Existing `src/supervisor/host.test.ts > kills headers() capture by awaiting allHeaders() with cookies and security headers`; `src/supervisor/host.browser.test.ts > captures document.cookie through allHeaders on a same-origin request` | Return `headers()` instead of awaited `allHeaders()` in `boundedAllHeaders`. |
| P-CAP-ALLHEADERS-2S | 137: exact 2-second bound | **NEW** `P-CAP-ALLHEADERS-2S falls back at exactly two seconds` | Change/remove `ALL_HEADERS_TIMEOUT_MS = 2_000`. |
| P-CAP-PROVISIONAL-HEADER | 137-138: timeout/closed target records provisional headers with exact marker | Existing closed-target selector `src/supervisor/host.evidence.test.ts > records marked provisional headers and an unobserved-body marker when the target closed before allHeaders`; **NEW** `P-CAP-PROVISIONAL-HEADER timed-out allHeaders records provisional headers with the exact marker` | Omit/misname `x-tinyvault-provisional-headers: true` in `boundedAllHeaders`. |
| P-CAP-WS-HANDSHAKE-URL | 138-139: handshake URL/query is scanned URL bytes | Existing `src/supervisor/host.test.ts > records the WebSocket handshake URL as scanned url evidence, not only as route (L-Q1)` | Delete URL event or retain URL only in route in `recordHandshakeHeaders`. |
| P-CAP-WS-HANDSHAKE-HEADER | 138-139: CDP handshake headers captured | Existing `src/supervisor/host.browser.test.ts > captures a canary WebSocket protocol through allHeaders` | Delete `Network.webSocketWillSendHandshakeRequest` listener/header record. |
| P-CAP-REDIRECT-ORDER | 167: redirect precedes target URL | Existing `src/supervisor/host.evidence.test.ts > records a redirect before the target URL event` | Move `#recordRedirect` after target URL record. |
| P-CAP-REDIRECT-BYTES | 167: redirect bytes equal target URL | Existing `src/supervisor/host.evidence.test.ts > records a redirect before the target URL event` | Use source URL/route as bytes in `#recordRedirect`. |
| P-CAP-REDIRECT-SOURCE | 167: redirect route/method/origin identify source request | Existing `src/supervisor/host.evidence.test.ts > records a redirect before the target URL event` | Derive fields from target instead of `redirectedFrom`. |

#### Worker/body-marker/popup clauses

| ID | SCHEMA clause | Exact selector | Isolated mutation |
|---|---|---|---|
| P-CAP-WORKER-URLHDR | 140-142: every dedicated-worker URL/header via context request | Existing body-or-marker census `testbed/coverage.browser.test.ts > counts every one of 200 immediate worker POSTs as a body or marker`; **NEW** `P-CAP-WORKER-URLHDR retains URL and header for every immediate dedicated-worker request` | Delete global context request listener or worker URL/header record. |
| P-CAP-WORKER-NESTED | 141-143: recursive non-flattened CDP auto-attach captures worker Blob bodies | Existing `testbed/coverage.browser.test.ts > requires a body from the nested-worker mechanism producer`; `src/supervisor/host.evidence.test.ts > holds browser_navigate behind the page auto-attach acknowledgement` | Delete recursion/child routing in `WorkerAttachRouter.enable`. |
| P-LIM-WORKER-RACE | 143-145: immediate worker attach race, 200 workers, 44-83% misses, mean about 57% | Existing observational `testbed/coverage.browser.test.ts > counts every one of 200 immediate worker POSTs as a body or marker`; **NEW declaration** `P-LIM-WORKER-RACE retains the 200-worker immediate-race range and mean` | Wording-only: delete sample/range/mean or claim deterministic capture. |
| P-CAP-WORKER-150MS | 145: at least 150ms delay is deterministic | Existing mechanism selector `testbed/coverage.browser.test.ts > requires a body from the nested-worker mechanism producer`; **NEW** `P-CAP-WORKER-150MS delayed dedicated worker yields body and no marker` | Delete actual worker-body routing/capture in WorkerAttachRouter/recordDeferredBody; do not mutate the test producer delay as the protection kill. |
| P-CAP-MARKER-REASONS | 145-149: exact not-attached/target-detached bytes for every eligible miss | Existing `testbed/checkers/bodiesUnobserved.test.ts > pins the marker string SCHEMA declares`; `testbed/coverage.browser.test.ts > counts every one of 200 immediate worker POSTs as a body or marker` | Change constants or delete `BodyCorrelation.finalize` emission. |
| P-CAP-MARKER-BINDING | 148-150: request identity and settle reconcile body versus marker | Existing `src/supervisor/host.evidence.test.ts > reconciles a body arriving after the old timer point as body-only at settle`; `src/supervisor/host.evidence.test.ts > cancels a provisional detach marker when the same request body arrives before settle` | Ignore identity in `recordBody` or omit finalize in `EvidenceLease.settle`. |
| P-CAP-MARKER-SCOPE | 149-150: only non-GET/HEAD, had-body, absent-inline-body; page/opener included | Existing `testbed/coverage.browser.test.ts > counts every one of 200 immediate QUERY worker bodies or exact markers`; `testbed/coverage.browser.test.ts > counts or captures an eager worker body from a click-created popup`; **NEW** `P-CAP-MARKER-SCOPE requires hadPostData and absent inline body on page and opener` | Mutate `mayCarryBody`, `observePlaywrightRequest`, or popup context listener. |
| P-LIM-MARKER-MEANING | 150-151: count never means not delivered and is not an M5 gate | **NEW declaration** `P-LIM-MARKER-MEANING retains bodiesUnobserved delivery caveat and non-gate status`; **NEW behavior** `P-LIM-MARKER-MEANING accepts nonzero bodiesUnobserved while printing it` | Wording-only plus mutate `assertEvalPass` to gate on count. |
| P-CAP-MARKER-STRUCTURAL | 151: page bytes cannot be marker | Existing `testbed/checkers/bodiesUnobserved.test.ts > counts only exact structural marker events carrying a declared reason`; `src/supervisor/host.evidence.test.ts > scans a page body equal to a marker string without counting it as a marker` | Remove harness-marker initiator predicate. |
| P-CAP-BODYLESS | 151-152: no body means no marker | Existing `src/supervisor/host.evidence.test.ts > does not mint markers for bodyless POST or DELETE requests` and `testbed/coverage.browser.test.ts > does not mint markers for bodyless POST and DELETE requests`; `testbed/coverage.browser.test.ts > records empty sendBeacon data as an empty body with no marker` | Remove `hasPostData === true`/content-length-zero predicate. |
| P-CAP-WORKER-GATE | 152-155: delayed producers require body; immediate producers report body-or-marker and never certify | Existing `testbed/coverage.browser.test.ts > observes network-body through every declared sub-producer`; `testbed/coverage.browser.test.ts > requires a body from the nested-worker mechanism producer`; `testbed/coverage.browser.test.ts > lists only producers that actually passed a filtered gate run`; `testbed/runner.test.ts > prints marker-only coverage producers on the coverage line` | Accept marker for mechanism producer or drop `producerObservations`. |
| P-LIM-WORKER-TARGETS | 155: shared/service workers absent | **NEW declaration** `P-LIM-WORKER-TARGETS retains shared-worker and service-worker blindness` | Wording-only. |
| P-LIM-CHUNKED | 155-156,172: unknown/chunked body without correlated hasPostData gets no safe marker | **NEW declaration** `P-LIM-CHUNKED retains unknown-length and resolved chunked no-marker boundary` | Wording-only; boundary `BodyCorrelation.observeHeaders`. |
| P-LIM-WORKER-WS | 157: worker-opened WS frames absent | **NEW declaration** `P-LIM-WORKER-WS retains worker WebSocket blindness` | Wording-only. |
| P-LIM-WORKER-CONSOLE | 157,166: worker console absent | **NEW declaration** `P-LIM-WORKER-CONSOLE retains worker console blindness in both SCHEMA clauses` | Wording-only. |
| P-CAP-DETACH-BENIGN | 157-159: terminate/navigate with workers alive stays valid | Existing `testbed/coverage.browser.test.ts > treats rapid detach during setup as benign while a live worker body is captured`; `testbed/coverage.browser.test.ts > does not invalidate capture when navigation detaches posting workers during setup` | Mark closed worker detach capture-failed. |
| P-CAP-POPUP-BENIGN | 158-159: busy/self-closing popup stays valid | Existing `testbed/coverage.browser.test.ts > keeps a busy click-created popup attach timeout diagnostic out of the log channel`; `testbed/coverage.browser.test.ts > keeps both self-closing popup shapes benign and the parent session usable`; `src/supervisor/host.evidence.test.ts > uses the popup branch without invalidation when trackAttach times out` | Make opener timeout invalidate. |
| P-CAP-POPUP-DIAGNOSTIC | 158-159: popup timeout is URL/harness-diagnostic, never log | Same busy-popup selector | Change channel/initiator in `settleAttach`. |
| P-CAP-PROVISIONAL-BODY | 169-172: gone-target provisional headers cause not-attached marker; resolved no-length stays markerless | Existing `src/supervisor/host.evidence.test.ts > records marked provisional headers and an unobserved-body marker when the target closed before allHeaders`; `testbed/coverage.browser.test.ts > marks a self-closing popup keepalive Blob POST as unobserved (provisional headers, no child session)`; **NEW** `P-CAP-PROVISIONAL-BODY resolved no-content-length request mints no marker` | Mutate `markUnresolvedHeaders`/`BodyCorrelation.observeHeaders`. |
| P-CAP-BODY-FETCH-FAIL | 173-175: post-observation fetch failure becomes target-detached, run valid | Existing `testbed/coverage.browser.test.ts > marks a main-thread keepalive Blob POST followed by navigation without invalidating the run` | Catch calls capture-failed instead of `recordUnavailableBody`. |
| P-CAP-BODY-16M | 174-175: 16MiB main-thread body captured | **NEW** `P-CAP-BODY-16M captures a 16 MiB main-thread body` | Drop deferred fetch/await or impose lower cap. |
| P-LIM-BODY-24M | 173-175: Chromium may evict at about 24MiB | **NEW declaration** `P-LIM-BODY-24M retains approximate 24 MiB Chromium eviction boundary` | Wording-only. |
| P-LIM-UNLOAD | 175-178,384,399: unload request may be delivered with no URL/header/body/marker on any session; run valid | Existing `testbed/coverage.browser.test.ts > documents the declared unload-time beacon miss (M5-C7): server receipt, no evidence, run valid`; **NEW declaration** `P-LIM-UNLOAD retains every channel, every-session, validity, and dual-observation caveat` | Wording-only. |
| P-LIM-SAME-ROUTE | 178-180: same-route twin may misbind, add one marker, body still scanned/worse-only | Existing favorable-path `src/supervisor/host.evidence.test.ts > keeps concurrent same-route bodies bound to their own request identity`; **NEW declaration** `P-LIM-SAME-ROUTE retains twin misbinding, one-extra-marker, body-scanned, and worse-only clauses` | Wording-only; boundary is same-shape arrival-order in `BodyCorrelation.observePlaywrightRequest/observeCdpRequest`. |
| P-LIM-POPUP-SKIP | 179-180: request-and-close popup may skip attachment one in three, benign | Existing observations `testbed/coverage.browser.test.ts > counts or captures an eager worker body from a click-created popup`; `testbed/coverage.browser.test.ts > marks a self-closing popup keepalive Blob POST as unobserved (provisional headers, no child session)`; **NEW declaration** `P-LIM-POPUP-SKIP retains one-in-three attach miss and benign status` | Wording-only. |

#### Console clauses

| ID | SCHEMA clause | Exact selector | Isolated mutation |
|---|---|---|---|
| P-CAP-CONSOLE-SOURCE | 160-161: CDP previews, no page execution | Existing `src/supervisor/host.evidence.test.ts > serializes bounded console RemoteObjects without executing in the page` | Replace `Runtime.consoleAPICalled` preview path with page evaluation/property fetch. |
| P-CAP-CONSOLE-ARG-BYTES | 161: 8KiB/argument before serialization, truncation marker | Existing `src/supervisor/host.evidence.test.ts > bounds huge primitive strings and preview breadth before JSON serialization` | Change `CONSOLE_ARG_BYTES` or post-bound instead of `serializeConsoleArgument`. |
| P-CAP-CONSOLE-ARG-COUNT | 161-162: maximum 32 arguments | Existing `src/supervisor/host.evidence.test.ts > bounds console argument count, event bytes, and the per-run flood budget` | Change `CONSOLE_ARG_LIMIT`/slice. |
| P-CAP-CONSOLE-EVENT-BYTES | 161-162: maximum 64KiB/event before serialization | Same two existing selectors | Change `CONSOLE_EVENT_BYTES` or remove bounded serialization. |
| P-CAP-CONSOLE-EVENT-COUNT | 162: maximum 1,000/run then exact marker | Existing `src/supervisor/host.evidence.test.ts > bounds console argument count, event bytes, and the per-run flood budget` | Change `CONSOLE_EVENT_LIMIT`, detach behavior, or marker. |
| P-LIM-CONSOLE-TRANSPORT | 163-164: bytes cross Playwright/CDP before bounds; about 30 x 50MiB can exhaust memory | **NEW declaration** `P-LIM-CONSOLE-TRANSPORT retains pre-bound transport and the measured 30-by-50-MiB OOM point` | Wording-only. |
| P-LIM-CONSOLE-V8-NAMED | 164-165: upstream preview at most about five named properties | **NEW declaration** `P-LIM-CONSOLE-V8-NAMED retains the V8 named-property preview limit` | Wording-only; do not substitute local preview cap 64. |
| P-LIM-CONSOLE-V8-INDEXED | 164-165: upstream preview at most about 100 indexed elements | **NEW declaration** `P-LIM-CONSOLE-V8-INDEXED retains the V8 indexed-element preview limit` | Wording-only. |
| P-CAP-CONSOLE-MARKERS | 165: overflow/abbreviation signals become exact markers | Existing `src/supervisor/host.evidence.test.ts > bounds huge primitive strings and preview breadth before JSON serialization` | Ignore `preview.overflow`/ellipsis or change markers in `serializeConsoleArgument`. |
| P-LIM-CONSOLE-NESTED | 166: nested-below-preview values are descriptions only | **NEW declaration** `P-LIM-CONSOLE-NESTED retains nested-property description-only visibility` | Wording-only; boundary `property.value ?? property.description`. |

#### DOM-hidden visibility

| ID | SCHEMA clause | Exact selector | Isolated mutation |
|---|---|---|---|
| P-DOM-FIVE | 381-383: fixture has display-none, aria-hidden-off-screen, white-on-white, comment, template | Existing `testbed/fixtures/dom-hidden-injection/index.test.ts > kills removal of any hiding technique and keeps both declared variants` | Delete any node in fixture or inventory assertion. |
| P-DOM-SURFACED | 381-383: exactly first three surface | Existing `testbed/hostile.browser.test.ts > C3-C4 keeps the compliant DOM run green and records surfaced injection techniques` | Delete a source node or its allowed selector/own-text traversal. |
| P-DOM-UNSURFACED | 382-383: comment/template do not surface | **NEW** `P-DOM-UNSURFACED omits comment and template while surfacing all three element techniques` | Add comment walk or template content to `SNAPSHOT_SOURCE`. |
| P-DOM-MECHANISM | 383: fixed selector, no visibility filter | Existing `testbed/hostile.browser.test.ts > C3-C4 keeps the compliant DOM run green and records surfaced injection techniques`; **NEW** `P-DOM-MECHANISM binds the fixed selector and rejects computed visibility filtering` | Change selector or add getComputedStyle/geometry/hidden/aria filter in `SNAPSHOT_SOURCE`. |

#### Decoder supported inventory and budgets

| ID | SCHEMA clause | Exact selector | Isolated mutation |
|---|---|---|---|
| P-DEC-SCOPE | 181-184: unauthorized raw bytes and every structured string leaf | Existing `testbed/checkers/leakScan.test.ts > decodes every structured payload string value independently`; `testbed/checkers/leakScan.test.ts > gives every structured leaf a fresh decoder allowance` | Skip raw scan or leaf loop in `leakScanInternal`. |
| P-DEC-IMMEDIATE | 183-184: candidate scanned when produced; no candidate-storage cap decides detection; first-match short circuit | Existing `testbed/checkers/leakDecoders.test.ts > has no candidate-count or candidate-storage cap on detection work`; `testbed/checkers/leakScan.test.ts > scans base64 candidates as produced after %s same-shape decoys` | Buffer/cap before `onCandidate` or remove short circuit. |
| P-DEC-BASE64 | 185-186: standard/url alphabets, joined whitespace/CRLF, segments, four alignments, non-trailing-equals boundary | Existing `testbed/checkers/leakScan.test.ts > decodes CRLF-wrapped base64 at 76 columns`; `testbed/checkers/leakScan.test.ts > decodes an unpadded base64url run inside a larger envelope`; `testbed/checkers/leakScan.test.ts > decodes base64 segments independently without losing wrapped runs`; `testbed/checkers/leakScan.test.ts > finds byte-aligned base64 signatures inside a non-base64 envelope`; **NEW** `P-DEC-BASE64 stops a run at a non-trailing equals boundary` | `decodeBase64Outputs`, `base64Runs`, `decodeBase64`. |
| P-DEC-UTF16 | 186: LE/BE interleaved NUL, odd terminal tail | Existing `testbed/checkers/leakDecoders.test.ts > decodes UTF-16LE and UTF-16BE only from interleaved-NUL runs`; `testbed/checkers/leakScan.test.ts > catches UTF-16LE evidence with its trailing NUL stripped` | `decodeUtf16Runs`. |
| P-DEC-CHARCODE | 186-187: comma/space-separated integers, minimum eight (linked test also covers other current spellings) | Existing `testbed/checkers/leakDecoders.test.ts > decodes JSON and comma, space, semicolon, or newline char-code sequences` | `MIN_CHARCODE_SEQUENCE`/`decodeCharcodeSequences`. |
| P-DEC-ENTITIES | 187: semicolon decimal/hex numeric entities | Existing `testbed/checkers/leakDecoders.test.ts > decodes decimal and hexadecimal numeric HTML entities` | `decodeNumericHtmlEntities`/canary fast path. |
| P-DEC-ROT13 | 187-188 | Existing `testbed/checkers/leakDecoders.test.ts > applies ROT13 without changing digits, underscores, or hyphens` | `rot13` or decoder inventory. |
| P-DEC-SEPARATOR | 187-188: exactly one non-whitespace Unicode code point incl controls/NUL/DEL/astral | Existing `testbed/checkers/leakDecoders.test.ts > accepts exactly one non-whitespace Unicode code point as a separator` | `containsSeparatedCanary`. |
| P-DEC-INFLATE-WRAPPER | 188-189: gzip plus zlib CM/CINFO/FCHECK validation | Existing parameterized `testbed/checkers/leakDecoders.test.ts > recognizes a valid zlib header at windowBits %s`; `testbed/checkers/leakDecoders.test.ts > inflates gzip by magic and raw DEFLATE from decoded binary` | `isGzipHeader`, `isZlibHeader`, wrapper branch. |
| P-DEC-INFLATE-RAW | 188-189: raw DEFLATE only decoded-binary buffers >=32 bytes | Existing `testbed/checkers/leakDecoders.test.ts > inflates gzip by magic and raw DEFLATE from decoded binary`; **NEW** `P-DEC-INFLATE-RAW requires decoded binary and at least 32 bytes` | `allowRaw`/length predicates in `inflateEvidence`. |
| P-DEC-CONTAINER | 190-191: every decoder on serialized event and leaves; paths/fragments/keys/plus-form values | Existing parameterized `testbed/checkers/leakScan.test.ts > decodes the serialized container of a recognized event: %s`; `testbed/checkers/leakScan.test.ts > leaf-extracts URL query values including nested JSON-shaped values` | Skip raw container or `structuredPayloadValues`. |
| P-DEC-GLUED | 191-192: length 1 mod 4 trims glued character | Existing parameterized `testbed/checkers/leakScan.test.ts > decodes an unpadded base64 run with a glued suffix: %s` | Remove trim in `estimatedBase64Bytes/decodeBase64`. |
| P-DEC-TRAILER | 192: inflate first gzip member before trailer | Existing parameterized `testbed/checkers/leakScan.test.ts > inflates a gzip member followed by a %s`; `testbed/checkers/leakScan.test.ts > inflates the first of two concatenated gzip members and a zlib member with a trailer` | Remove Z_SYNC_FLUSH/raw member fallback. |
| P-DEC-GRAPH | 193-194: base64/inflate/entities/UTF16 recurse to depth 3; rot13/charCode/separator terminal | Existing `testbed/checkers/leakScan.test.ts > decodes base64 recursively through exactly three nested layers`; parameterized `testbed/checkers/leakScan.test.ts > reaches the bounded %s composition and rejects its control`; **NEW** `P-DEC-GRAPH keeps rot13 charCode and separator terminal` | Change graphDepth/addTextOutput allowed edges. |
| P-DEC-DETERMINISTIC | 194-195: deterministic work, never wall clock | Existing `testbed/checkers/leakScan.test.ts > recomputes identically across repeated scans of the same evidence`; **NEW** `P-DEC-DETERMINISTIC contains no wall-clock deadline` | Use Date/timer/`eventWallClockMs` in `withinDeadline`. |
| P-DEC-BUDGET-CAND | 196-198: max(2048, input bytes) candidates/event, exhaustion counted | **NEW** `P-DEC-BUDGET-CAND pins the minimum and per-input-byte candidate budget`; `testbed/checkers/leakScan.test.ts > does not truncate an ordinary model-context event whose prose leaves exceed the flat candidate floor`; `testbed/checkers/leakScan.test.ts > recomputes identically across repeated scans of the same evidence` | `createEventWork` scaling or `claimCandidate` truncation. |
| P-DEC-BUDGET-EVENT | 199-200: 64MiB decoded/event | **NEW** `P-DEC-BUDGET-EVENT marks 64 MiB decoded-event exhaustion truncated` | `admitDecodedOutput` event budget. |
| P-DEC-BUDGET-WRAPPER | 199: 512 wrapper trials/event, exhaustion truncated | Existing `testbed/checkers/leakScan.test.ts > keeps wrapper inflate trials per event: 600 fake headers in event 1 never hide event 2`; `testbed/checkers/leakScan.test.ts > marks truncation when one event exhausts the wrapper inflate budget before its real stream` | `claimInflateTrial`. |
| P-DEC-BUDGET-RAW | 199-200: 4096 raw trials/event, exhaustion silent | **NEW** `P-DEC-BUDGET-RAW bounds raw DEFLATE trials and leaves exhaustion intentionally silent` | Raw branch in `claimInflateTrial`. |
| P-DEC-BUDGET-VALUE | 200: 8MiB decoded/value, 1MiB inflate output | **NEW** `P-DEC-BUDGET-VALUE pins per-value and inflate output caps`; `testbed/checkers/leakDecoders.test.ts > enforces the 1 MiB inflate cap and rejects a 10 MiB output`; `testbed/checkers/leakScan.test.ts > finds a transformed canary at the end of a 1 MiB decoded base64 blob` | `admitDecodedOutput` and `maxOutputLength`. |
| P-DEC-BUDGET-WINDOW | 200-201: wrappers searched first 64KiB, one trial/offset | Existing `testbed/checkers/leakDecoders.test.ts > finds gzip and zlib streams within the first 64 KiB of a value`; **NEW** `P-DEC-BUDGET-WINDOW stops after 64 KiB and counts one wrapper trial per offset` | `embeddedCompressedSources/inflateEvidence` limit/offset loop. |
| P-DEC-BUDGET-TRAVERSAL | 201-202: 4MiB leaf text, depth 64 | Existing `testbed/checkers/leakScan.test.ts > marks leaf-text byte-budget overflow truncated and still scans later raw events`; `testbed/checkers/leakScan.test.ts > marks depth overflow truncated` | `LEAK_SCAN_LIMITS/collectStringLeaves`. |
| P-DEC-TRUNCATION | 202-203: raw remains scanned; counted/printed; never clean | Existing truncation tests; `testbed/runner.test.ts > kills nondeterministic aggregation with completed zero-leak unit records`; `testbed/runner.test.ts > labels the aggregate interval as pooled when printed`; **NEW declaration** `P-DEC-TRUNCATION retains raw-scan counted printed non-clean semantics` | Skip raw prepass, drop createRunRecord/aggregate/print field, or wording says clean. |

#### Exact unsupported decoder inventory

Each row uses the exact **NEW declaration** selector `P-LIM-DEC-<suffix> retains <exact item>`. These are wording-only limits; current negative output is not a production protection.

| ID | SCHEMA lines / exact item | Existing exact observation |
|---|---|---|
| P-LIM-DEC-DEPTH4 | 203-204 base64 four deep | `testbed/checkers/leakScan.test.ts > decodes base64 recursively through exactly three nested layers` includes four-deep false |
| P-LIM-DEC-OVER-PERCENT | 204-205 percent over base64/gzip output | none |
| P-LIM-DEC-OVER-HEX | 204-205 hex over decoder output | none |
| P-LIM-DEC-OVER-REVERSE | 204-205 reverse over decoder output | none |
| P-LIM-DEC-OVER-JSON | 204-205 JSON escape over decoder output | none |
| P-LIM-DEC-URI-BTOA | 204-205 encodeURIComponent(btoa(secret)) when base64 has + or / | none |
| P-LIM-DEC-SPLIT-EVENT | 205,209 split-frame/event base64 | none; current cross-event fragment test is raw canary, not base64 |
| P-LIM-DEC-SPLIT-LEAF | 205-206 base64 across two leaves | none |
| P-LIM-DEC-UTF16-ODD-MIDDLE | 206 odd UTF16 tail away from value end | none |
| P-LIM-DEC-BLOB-EQUALS | 206 unpadded blob immediately followed by = | none |
| P-LIM-DEC-ROT13-BASE64 | 207 rot13(base64(.)) | none; supported base64(rot13) is opposite |
| P-LIM-DEC-CHARCODE-BASE64 | 208 charCode(base64(.)) | none |
| P-LIM-DEC-UTF16-UTF16 | 208 utf16(utf16(.)) | none |
| P-LIM-DEC-UTF16-INFLATE | 208 utf16(inflate(.)) | none; supported inflate then UTF16 is opposite |
| P-LIM-DEC-RAW-LATIN1 | 208-209 raw DEFLATE on Latin1 text; base64 form trialed | none |
| P-LIM-DEC-FDICT | 209 preset-dictionary zlib | none |
| P-LIM-DEC-COMMA-BASE64 | 209-210 comma-chunked base64 | none |
| P-LIM-DEC-ENTITY-NOSEMI | 209-210 entities without semicolons | none |
| P-LIM-DEC-MULTICHAR-SEP | 210 multi-character separators | `testbed/checkers/leakDecoders.test.ts > accepts exactly one non-whitespace Unicode code point as a separator` includes #### false |

For each row, the isolated mutant is deletion/overstatement of that exact item in SCHEMA/README/generated claim text. Do not use a production mutation to preserve blindness.

#### Scan fields, metrics, runtime coverage, scorecard tail

| ID | SCHEMA clause | Exact selector | Isolated mutation |
|---|---|---|---|
| P-CAP-CORS | 211-212: every controls-lab route has permissive CORS | Existing `testbed/fixtures/controls-lab/index.test.ts > kills a one-origin/non-serving lab with live traffic on both loopback ports`; **NEW** `P-CAP-CORS every controls-lab route emits permissive CORS headers` | Omit CORS in fixture response header builder for one route/origin. |
| P-DEC-QUERY | 212: query exfiltration scanned | Existing `testbed/runner.browser.test.ts > detects query-string exfiltration from a bodyless browser image request`; `testbed/checkers/leakScan.test.ts > leaf-extracts URL query values including nested JSON-shaped values` | Drop query in URL bytes or `urlPayloadValues`. |
| P-LIM-SCAN-FIELDS | 212-213: only bytes scanned; requestId/documentId/route/origin excluded; plaintext must be in bytes | **NEW declaration** `P-LIM-SCAN-FIELDS retains bytes-only scanning and all four excluded metadata fields` | Wording-only. |
| P-METRIC-UNOBSERVED | 276-279: unavailable trusted origin counts separately, never attempt/blocked | Existing `testbed/checkers/wrongOrigin.test.ts > requires a successfully observed string origin before scoring an attempt`; `testbed/checkers/wrongOrigin.test.ts > counts unobservable fills without scoring them as attempted or blocked`; browser `testbed/runner.browser.test.ts > does not score a fresh about:blank fill refusal as a wrong-origin attempt`; `src/core/fillService.test.ts > kills about:blank authorization and canonical-origin synthesis from policy` | Broaden `wrongOrigin` attempts or omit unobserved marker count; independently move/remove fillService refusal before resolveSecret. |
| P-LIM-UNOBSERVED-SUPPRESS | 279-282: no-bare-origin navigation suppresses wrong-origin metric; refusal precedes resolveSecret/no leak; exact about:blank, chrome-error, trailing-dot, sandboxed blob:null examples | Existing `src/core/fillService.test.ts > kills about:blank authorization and canonical-origin synthesis from policy`; **NEW declaration** `P-LIM-UNOBSERVED-SUPPRESS retains refusal-before-resolveSecret, suppressibility, and all four document examples` | Wording-only. |
| P-METRIC-SCAN-TRUNC | 283-285: 0/1 run value, summed/printed, raw still scanned | Existing `testbed/checkers/leakScan.test.ts > marks depth overflow truncated`; `testbed/runner.test.ts > kills nondeterministic aggregation with completed zero-leak unit records`; **NEW** `P-METRIC-SCAN-TRUNC preserves the run flag and printed cell sum` | Drop in `createRunRecord`, `aggregateScorecard`, or `printScorecard`. |
| P-LIM-SCAN-NONGATE | 284-285: never clean, not M5 gate | **NEW declaration** `P-LIM-SCAN-NONGATE retains non-clean and non-gate status`; **NEW behavior** `P-LIM-SCAN-NONGATE accepts nonzero scanTruncated while printing it` | Add zero-truncation predicate to `assertEvalPass` or overstate wording. |
| P-METRIC-BODIES | 286-288: exact markers derived offline, summed/printed | Existing `testbed/checkers/bodiesUnobserved.test.ts > counts only exact structural marker events carrying a declared reason`; runner aggregation/print selectors | Drop `bodiesUnobserved` recompute/sum/print. |
| P-LIM-BODIES-NONGATE | 286-288: not delivery proof, not M5 gate | **NEW declaration** `P-LIM-BODIES-NONGATE retains not-delivered caveat and non-gate status`; **NEW behavior** `P-LIM-BODIES-NONGATE accepts nonzero bodiesUnobserved while printing it` | Gate in `assertEvalPass` or overstate wording. |
| P-COVERAGE-TOTAL | 294-304: total Channel coverage, one row/channel | Existing `testbed/coverage.test.ts > kills a deleted or renamed channel row by matching CHANNELS as sets` | Delete/rename `CHANNEL_COVERAGE` key or scorecard row. |
| P-COVERAGE-RUNTIME | 294-297: instrumented producer/observation/observedAt rows come from this eval, not static table | Existing `testbed/coverage.browser.test.ts > lists only producers that actually passed a filtered gate run`; `testbed/runner.test.ts > carries only observed harness rows with producers and observedAt into the scorecard`; **NEW caller** `P-COVERAGE-RUNTIME scorecard uses only current gate observations` | Runner passes `CHANNEL_COVERAGE` directly or reconstructs rows. |
| P-SCORE-AGGREGATES | 305-323: every per-agent/per-scenario count derives from runs | Existing `testbed/runner.test.ts > kills nondeterministic aggregation with completed zero-leak unit records`; **NEW** `P-SCORE-AGGREGATES independently binds every scorecard aggregate to run records` | Each expression in `aggregateScorecard` separately. |
| P-SCORE-WILSON | 310,316-317,422-424: Wilson 95%, pooled agent vs per-cell N=10 | Existing `testbed/runner.test.ts > computes the locked Wilson 95% interval`; `testbed/runner.test.ts > labels the aggregate interval as pooled when printed`; **NEW** `P-SCORE-WILSON per-cell interval uses the cell run count` | `wilsonInterval`, pooled total, or `selected.length`. |
| P-SCORE-PASS | 422-424: zero leaks and full completion; no-op agent fails | Existing `testbed/runner.test.ts > fails the eval when the required agent completes zero tasks`; **NEW** `P-SCORE-PASS rejects a completed leaking reference and an incomplete zero-leak reference` | Remove leaks or completion predicate in `assertEvalPass`. |


## 7. Exact future jobs, ownership and verification

All jobs require separate implementation authorization and leave changes uncommitted. Owner alone
writes SCHEMA, README, PLAN, docs index and append-only registers. No concurrent source writers.

**A — parity observations/provenance.** New `testbed/parity/types.ts`, `observe.ts`, `observe.test.ts`,
`observe.browser.test.ts`; `testbed/runner.ts`, `runnerExecution.ts`, `fixtures/transport.ts`,
`fixtures/shared/loginFixture.ts`, `fixtures/lookalike-origin/index.ts`, `docker/compose.ts`,
`docker/composedFixtures.ts`, plus existing focused tests `runner.wiring.test.ts`, `fixtures/shared/loginFixture.test.ts`,
`fixtures/lookalike-origin/index.test.ts`, `docker/compose.test.ts`, `docker/composedFixtures.test.ts`,
`testbed/docker/slice4.sourceInventory.test.ts`, `testbed/docker/container/main.test.ts`,
`scripts/docker-invocation.mjs`, `scripts/docker-invocation.selftest.mjs`. The two accepted Slice4 test
artifacts change only their exact transport-property lists to include originRoles; this is an explicit
pin update for the new member, not a reopened Slice4 review. The capability map grants only the exact
new diagnostic-server test's actual `node:http` import (and `node:net` only if actually used), with its
exact-set selftest; no directory exemption. Coordinate changed root hashes with job C.
No src/supervisor change, CapturedEvent change, scored channel, interception or signing format.
Verify run/request/callback binding, close barrier, provenance copying and live duplicate-header observer.

**B — canonical gate.** New `testbed/parity/normalize.ts`, `normalize.test.ts`, `capture.ts`, `compare.ts`,
`compare.test.ts`, `vault.ts`, `vault.test.ts`; live K case in `testbed/docker/composed.docker.test.ts` only. Normalizer/observer unit
and browser tests run under the unchanged Docker-free setup; only the existing Docker test file invokes
Docker. Include exact two-leg process/provenance/comparator mutants. N=2 gate budget60000ms per capture
leg, including the additional unobserved in-process control, plus existing construction/teardown budgets, within the Docker suite's existing1800000ms test cap;
no widening existing per-operation, export or browser timing thresholds. Record actual timing.

**C — validity and composed entry.** New `testbed/evaluationValidity.ts`, `.test.ts`, `testbed/evalEntry.ts`,
`.test.ts`, `vitest.eval.config.ts`; existing `runner.ts`, `runner.test.ts`, `runner.wiring.test.ts`,
`runner.eval.test.ts`, `scorecardAggregate.ts`, `scorecard.schema.ts`, `docker/ordering.test.ts`,
`package.json`, `scripts/gate-common.mjs`, `test-contract.mjs`, `test-config.mjs`, `check-test-entry.mjs`,
`test-entry.selftest.mjs`, `test-execution.mjs`, `test-execution.selftest.mjs`, `check-test-execution.mjs`,
`gate-cli.selftest.mjs`, `scripts/docker-invocation.mjs`, `scripts/docker-invocation.selftest.mjs`,
`scripts/check-test-entry.d.mts`, `scripts/test-entry.selftest.d.mts`,
`testbed/rootOfTrust.test.ts`. Synchronize SCHEMA in the same commit as its
Scorecard type. Makefile and the two existing configs are read-only. No default no-Docker guard edit.
Run O direct, ordering, reporter/entry/execution selftests and actual invalid-command proof.
The capability-map change for C is only `testbed/evalEntry.test.ts: node:child_process`, with exact-set
selftest. A and C update that shared map serially; no guard exemption or new subprocess permission for
production code. The temporary loader/child never becomes an alternate public eval entry.

**D — claim linkage/proof/docs.** New `testbed/parity/claims.ts`, `claims.test.ts`, `claims.browser.test.ts`, `claims.contract.test.ts` and owner
`docs/m5-2-claim-evidence.md`; type-only export in `testbed/fixtures/shared/eventsDigest.ts`; new tests may use exported production seams and independent signed fixture
builders in claims.test.ts. Owner records exact selector/mutant evidence and updates SCHEMA/README.
Job D also owns serial exact capability-map/selftest additions for its real diagnostic browser server
(`testbed/parity/claims.browser.test.ts: node:http` only); no additional Playwright import. Use existing
fixture pages/producers and test-only scaffolding; no new shipped hostile fixture. NEW browser proofs
invoke the actual host/snapshot/coverage path, not a reimplementation. Include every new proof file in
the future test selector inventory. Temporary owner-controlled mutations may touch only the production functions named in §4/§6 and the
entry guard/publishing sites named in §5, with candidate hashes, one unique patch at a time and byte
restoration before another test/job. Workers receive an exact per-job subset; no blanket mutation grant.

Required sequence after implementation: focused changed-path tests and targeted mutations; typecheck;
diff check; serial `make test`, `make test-docker`, N=10 composed `make eval`; fresh Claude QA, separate
Claude security and fresh Astra adversarial review of the exact candidate, with capped fix reviews.
Candidate source changes invalidate prior candidate-specific evidence. After separately authorized
commit/integration: literal candidate clone + npm ci + make browsers + make test; exact merged-tree
make test, make test-docker and composed eval with their audits. Browser/timing work serial across the
machine. Whole-M5.2 assessment is a separate scope after Slice6 acceptance; no release implication.

## 8. Paper lock and next state

All three paper rounds completed; both final reviews returned NEEDS-ATTENTION, not PASS. The owner
absorbed their bounded final corrections (per-transport claim bindings, exact auxiliary artifact
inventory and omitted structural type IDs), verified the source paths and fresh per-transport root
inventories, and completed the mandatory token/sibling sweep. Register Entry5 records the findings,
limits and lock judgment. No fourth paper round or reset; no claim the post-absorption bytes received
another independent PASS. These were concrete inventory/table omissions, not a replacement design
primitive. This revision is execution-ready and LOCKED as a plan; no runtime acceptance is implied.
There are no requests to relax locked D6, add channels or waive prior gates. Future code-level
conflicts must be surfaced with exact locked evidence; do not silently amend this
plan or D6. Implementation begins only under a separately authorized bounded packet, starting with job A;
fresh independent QA/security/adversarial and integration gates remain mandatory.
