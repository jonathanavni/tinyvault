# M5.2 Slice 4 — control operations, capabilities, and capture transfer

Revision 5 — LOCKED, 2026-09-05, after final-paper dispositions and explicit user approval of the SCHEMA amendment.
Owner: Codex, session `2026-09-05-m5.2-slice4`. Baseline: `main` @
`dc0796fa8616548c6fa61315fed4b2b9bde97620`. Governing contract:
[`m5-2-slice-spec.md`](m5-2-slice-spec.md) revision 4 LOCKED, §D3/§D7 and Acceptance D/F/H/M;
sequence: [`m5-2-implementation-plan.md`](m5-2-implementation-plan.md), row 4.
Review dispositions belong in `m5-2-slice-4-review-findings.md` (append-only).

## 1. Objective, claim, and boundaries

Make the composed fixture's administrative operations available only through its authenticated bridge,
with run/fixture/operation-scoped, expiring capabilities, and persist exact fixture captures on the harness.
Success requires both positive operation tests and independent removal/misrouting mutants for D/F/H/M.

The adversary is hostile Chromium page content and the evaluated model. The harness, fixture implementation,
control process, and container are trusted. Fixture-process compromise invalidates a run; this slice does not
claim containment after compromise. Docker-daemon non-exposure remains a deployment assumption, not a result
of preflight or these tests. Capture attestation remains post-capture integrity, not independent authenticity.

Preserve Slice 3 topology, provenance, bridge framing, terminal error behavior, and the Docker-free `make test`
guard. No shared captures/artifact mounts. No agent tools, raw execution API, HTTP administrative route, public
key secrecy claim, public scorecard, or composed `make eval` switch. Parity and published claims remain Slice 6.

**Attestation partition:** row 4 explicitly includes the five operations and H's single-use requirement.
Slice 4 implements the authenticated `attest` dispatch and its finalized/single-use lifecycle using the existing
fixture signer. Slice 5 owns replacement of receipt/attestation signed preimages, domain separation, and full
Acceptance L. Existing signature formats are intermediate behavior, not a claim that §D4/L is complete.
This partition received explicit paper-review approval; do not silently ship a permanently
unavailable fifth operation or move the Slice 5 transcript changes into this packet.
Both round-1 reviewers accepted this partition. Lifecycle tests here also cover L's finalized/single-use/restart
subcases; Slice 5 reuses those proofs and adds its two independent signed-preimage mutants.

## 2. Measured baseline and concrete seams

Measured on 2026-09-05; command logs live outside source in `/private/tmp/tinyvault-slice4-planning/`.
These measurements establish the starting candidate only, not Slice 4 acceptance.

| Fact | Evidence |
| --- | --- |
| Node 24.19.0; Docker client/server 29.6.2; Compose 5.3.1; Claude CLI 2.1.258 | Direct version commands. Docker socket access denied in the sandbox; the same read via host permission succeeded. |
| Typecheck passes | `npm run typecheck`, exit 0, `typecheck.log`. |
| Docker-free core passes | `npx vitest run testbed/docker`, exit 0, 547 tests / 22 files, `docker-unit-baseline.log`. |
| Live existing Docker acceptance passes | `make test-docker`, exit 0, 4/4, about 80 s, entry and execution proofs PASS, `docker-live-baseline.log`; serialized on this machine. |
| Wire currently supports only bootstrap/hello | `testbed/docker/protocol.ts`; `container/control.ts` accepts only ids 1/2. Frame payload maximum is 262144 bytes. [values amended by M6-AM12, 2026-09-08] |
| Client operations are placeholders | `composedFixtures.ts:18-40`; fixture transport interface has no capability parameters. |
| Receipt read deletes | `fixtures/shared/loginFixture.ts:167-171`; a dropped response loses the receipt. |
| Captures currently bypass the runner | `runnerExecution.ts:42-76` never calls `captureRequests`; `runner.ts:162-188` supplies the host capture directory to in-process fixtures. |
| Offline needs exact capture bytes/path | `checkers/offline.ts:244-267`, `fixture-captures/<runId>.requests`; no container path is an acceptable substitute. |
| One valid request can exceed a frame | `loginFixture.ts:338` permits a 1 MiB request body; base64 expansion exceeds the 256 KiB frame ceiling. [values amended by M6-AM12, 2026-09-08] |
| Existing local event files fit the 128 KiB bound [values amended by M6-AM12, 2026-09-08] | Metadata scan of 46 `artifacts/**/events.json` files: maximum 59361 bytes, none above 131072. This is a sample, not a guarantee for future runs. |
| Existing exposure scanners know bootstrap only | `compose.ts:336-356` registers bootstrap patterns; subsequent operation secrets require the same lifecycle. |

**Subsequent baseline check: `make test` FAILED**, exit 2 at the Docker invocation gate: tracked
`scripts/claude-review.mjs:3` and `scripts/claude-review.test.mjs:4` are outside its allowed subprocess profiles.
Focused `npx vitest run scripts/claude-review.test.mjs` also FAILED, exit 1: it uses `node:test`, and Vitest
reports "No test suite found". Logs: `make-test-baseline.log` and `review-helper-vitest-probe.log` in the same
external evidence directory. These are baseline integration defects, not sandbox failures. See the review
register's prerequisite packet; no test exclusion has been introduced. The user approved exact subprocess
profiles and Vitest migration afterward. The final prerequisite is accepted: uniform argv arrays close both
overload/rebinding bypasses; 111 source mutants, 41 guard deletions and six helper cases pass. Final host
`make test` exited 0 (1574 + 5 + 10; one expected pending; execution proof PASS). Final Astra and Claude QA found
no remaining code defect; their pending completion-evidence item is resolved by that command. No feature claim.

**Additional owner measurements**, `/private/tmp/tinyvault-slice4-prerequisite/`: real Chromium through
`capturePersistedRuns` on the existing in-process path, one sample per scenario, passed; registration through
attestation took benign 262 ms, lookalike 115 ms, hidden injection 92 ms (`browser-timing-host.log`,
`browser-timing-results.json`). This does not measure the unimplemented composed finalize/transfer path.
Production `scanStreamWithControls` scanned a real 249409024-byte export of the existing fixture image with
183 synthetic secret needles in 13355 ms and with 579 needles in 41667 ms; both observed the export positive
control and no secret match (`export-benchmark.log`, `export-budget.log`). Each temporary container remained
stopped and was removed afterward. These are per-image throughput samples, not full teardown acceptance or
a worst-case guarantee. ~~The existing 120-second per-export deadline remains unchanged and fails closed.~~ **Superseded 2026-09-10 (owner-authorized M7 capacity accommodation):** the per-export deadline is 240 s; the operation deadline remains 120 s; both fail closed. Owner measurements on `9a826e5` in the real checkout on a quiet host (`diag-docker-export-9a826e5.log`): `make test-docker` failed at `ProjectCloser.#export` after 762.9 s (763.5 s on `828c769`, deterministic), with five exports each killed at +120 s before the scan resolved. The close-time inventory is 965 registered secrets (five fixtures × the 32-run budget fill); each 249 MB export is scanned twice in parallel (closer + evidence observer) by `StreamSecretScanner`, whose throughput is inversely proportional to the secret count. The owner's micro-benchmark measured 96 secrets at 35 MB/s, 579 secrets at 6 MB/s (≈85 s per export, within 120 s), and 965 secrets at 3 MB/s (≈146 s, outside 120 s). The inventory-pin candidate with three fixtures was 7/7 green. The 240 s deadline is a capacity accommodation, not a fix; making the scanner sublinear in the secret count is separate work in the owner-recorded BACKLOG item.

No Slice 4 mutants yet. No dependency updates are needed. Read the code at this
baseline when line numbers shift. Carry Slice 3's register residuals at its final QA/merge entries: constant-time
comparison not unit-observable; image tag until M10; declared static-gate limits; bridge-network/file probe
exclusions; unpinned `checkScan` control count / exec-stderr failure / `.dockerignore` tests. Do not relabel them
new defects or repair them incidentally.

## 3. Administrative vocabulary and wire shape

Keep protocol version 1, 4-byte framing, the 262144-byte ceiling, canonical UTF-8/JSON, exact ordered keys, [values amended by M6-AM12, 2026-09-08]
monotonic request ids, one outstanding request, one stdout writer, and close on any malformed/unauthorized
request. No resynchronization or automatic retry/reconnect after EOF/timeout. Closed codes carry no input,
run id, token, private key, arbitrary error text, or serialized body.

Registration is the bootstrap-authenticated root operation described explicitly in §D3; it does not require
a capability it has not yet minted. It is accepted only after successful bootstrap/hello on that single
connection. Bootstrap authenticates that connection, not an HTTP parameter. No second bootstrap or hello.

The fifth administrative category is a separate capability-authenticated **public-key read**. Hello still
returns the MAC-bound key; the later read must return exactly that same DER key. There is no unauthenticated
capability refresh endpoint. Registration's capability response is the sole token-distribution operation.

All body values remain strings (compatible with the existing shallow canonicalizer). Field sets and order:

| Op | Request keys | Success response keys | Authorization/lifecycle |
| --- | --- | --- | --- |
| `register` | `epoch,fixtureId,scenarioId,runId,nonce,canaryId,canary` | `receipt,capture,attest,key,finalize,ack` | Established bootstrap session; reject duplicate run, including a finalized run. |
| `receipt` | `epoch,fixtureId,runId,capability` | `receipt` | Receipt capability; repeated reads allowed until expiry/ack. Empty string means absent. |
| `capture` | `epoch,fixtureId,runId,capability,kind,offset` | `bytes,total,next` | Capture capability; finalized run; `kind` is `requests` or `unauthorized`; read immutable chunks. |
| `key` | `epoch,fixtureId,runId,capability` | `publicKey` | Key capability; repeatable within TTL; must match hello key. |
| `finalize` | `epoch,fixtureId,runId,capability` | (empty) | Separate single-use lifecycle capability; freeze this run and drain admitted writes before success. |
| `ack` | `epoch,fixtureId,runId,capability` | (empty) | Separate single-use acknowledgement capability; finalized run; remove retained receipt and revoke receipt-read capability. |
| `attest` | `epoch,fixtureId,runId,capability,events` | `attestation` | Attest capability, finalized run, consume before invoking existing signer; no retry after failure. |

`finalize` and `ack` are narrow lifecycle operations, not new page endpoints or agent tools. Unauthorized-request
data is a second capture stream under the existing capture capability, not a wildcard administrative operation.
No wire-provided pathname, origin, public/private key, expiry, operation target, or shared-mount location is trusted.

Exact validation occurs before mutation on the container and before writing/accepting frames on the harness.
Validate fixture id and epoch against the established session; `runId` uses the existing ASCII letters/digits/hyphen
grammar and a 128-character maximum, enforced by the shared in-process validator as well as wire validation. Setup scalar strings are nonempty, scalar Unicode (no lone surrogates),
bounded to 4096 UTF-8 bytes each; `scenarioId`/`canaryId` to 128 bytes; setup is copied, never retained caller-owned.
`offset`, `total`, `next` are canonical nonnegative decimal integers without leading zeros, bounded before
conversion. Binary fields are canonical unpadded base64url. Token decoding requires
exactly 32 bytes. Receipt/key/attestation lengths must fit the unchanged frame limit. `events` is capped at 128 KiB [values amended by M6-AM12, 2026-09-08]
decoded for Slice 4's existing signer; an oversized attestation is a closed failure, never truncated evidence.
The measured local sample fits this bound; exceeding it fails explicitly. Slice 5 can introduce bounded upload
chunks if required, without raising frame size.

Add only closed wire codes: `capability-refused`, `run-state`, `control-limit`, `key-mismatch`.
`capture-write` belongs to the harness's closed operation/construction errors, not the wire vocabulary.
All authorization failures use `capability-refused`, including unknown run; no existence oracle. Local refusal
also terminates/cleans the composed project through its normal closer; operational and scan error precedence
remains unchanged. Concurrent client calls queue; validation/consumption must not await between check and use.

## 4. Capability state and quantified limits

The **numeric lifetime is 60000 ms**, starting at registration. It is an implementation parameter for
§D3's required explicit duration, not caller configuration, run-length derivation, or indefinite renewal.
Use an internal monotonic clock, reject at `now >= issued + 60000`, and test exactly-before/exactly-at boundaries.
Only the server clock authorizes; no constant-only TTL field is sent over the wire. Slow runs fail explicitly rather
than extending lifetimes. Document this operational bound in the internal transport tests; no success claim for
runs that outlive it. The §2 measurements support this bound; composed-path timing remains an implementation acceptance gate.

Each operation receives independently generated `randomBytes(32)` (256-bit entropy) from Node crypto, never
`Math.random`, run id, rendered `controlTokenFor`, nonce, timestamp, bootstrap secret, or another capability.
Validate RNG byte count and reject duplicate bytes across this process's issued tokens; production construction
does not accept an RNG supplied from page/runner configuration. Tests can replace the crypto module/clock.

Keep private run records bound to `(fixtureId,runId,operation,evalEpoch,currentControlInstance)` and their
expiry/consumed state. A control-instance nonce is freshly generated in memory on each process/session creation;
records never hydrate from disk. No session reconnect or capability import. On close erase token buffers and
drop records; on process restart both bootstrap connection and registry start fresh. Even with the same eval
epoch and recurring run id, old capabilities fail against a newly authenticated instance. Check the explicit
request epoch/fixture/run/op before using a record; possession of a capability for A never redirects to B.
Do not serialize records or capability-derived values. Token text copies are GC-managed, as in Slice 3.

Consumption rules are per row above: receipt/capture/key repeatable until expiry; finalize/ack/attest single-use.
Consumption is synchronous before work begins. A failed single-use operation is terminal, not restored.
Maximum **32 registered run records per fixture instance**, no recycling run ids; reaching it fails explicitly.
This bounds three fixtures to 96 runs and 579 retained secret scanners (six capabilities per run plus three
bootstrap secrets), matching the measured larger export probe. It supports the current locked N=10 per
scenario and current three-scenario inventory. Larger sample sizes or additional scenarios sharing a fixture
may hit this explicit limit; no claim of arbitrary evaluation size or automatic rotation is made in Slice 4.
The issued-token duplicate set shares the registry lifetime and is erased on close; do not add an immortal
set of raw token copies. Old scanner patterns are retained until teardown even when the token expires/consumes.
No token-derived output beyond canonical wire token encoding is introduced; adding another derivative requires
adding that value to the exposure inventory and its tests.

## 5. Shared fixture lifecycle and exact capture transfer

Retain one fixture implementation. Extend `FixtureTransport` with `finalizeRun(runId)` and
`acknowledgeReceipt(runId)`; keep `takeReceipt` name for compatibility but change its documented behavior to
non-destructive read. Both transports implement those semantics. Acknowledgement is explicit; no hidden ack
inside `takeReceipt`. Repeated receipt reads after successful issuance return byte-identical strings until ack;
an absent read does not permanently cache absence. Repeated offline verification remains independently replay-protected.

The shared fixture tracks `active -> finalizing -> finalized` per registered run. Under the approved boundary
below, `finalizeRun` synchronously marks finalizing and fixes the admission high-water mark before awaiting.
Only handlers admitted after that mark lose permission to mutate this run's capture/receipt state. Earlier
handlers finish all normal effects, including capture append and receipt issuance, before snapshots freeze.
Do not declare quiescence merely because a control
request was serialized: HTTP runs concurrently. Track asynchronous handler work (including body parsing and
the lookalike L-to-C fetch), and reject finalization with `control-limit` after **3000 ms**. Keep the bridge
deadline at 5000 ms, leaving response margin. Independently test deletion of the drain timer with the bridge
clock held open, the server refusal code, and terminal bridge timeout.
**Contract-owner decision approved and applied, 2026-09-05.** Paper round 2 rejected
revision 3's page-attribution-driven sticky invalidity: SCHEMA's fixture unauthorized captures are corroborating
only, never a gate, and D3 forbids attribution from feeding authorization. The approved replacement freezes
capture bookkeeping after trusted finalization and returns a fixed 409 only after a fully parsed post-boundary
request is attributable to that frozen run and would otherwise write capture or issue a receipt. Existing body
size/timeout handling happens first: 413/408 remain uncaptured and never become a global 409 based on another
run's phase. A finalized A does not freeze active B or the unknown/unregistered bucket. Page attribution cannot
perform administrative operations or introduce a verdict decision; existing authoritative network/capture
agreement still applies as described below. The approved SCHEMA amendment declares the snapshot boundary
for both unauthorized captures and the authorized `.requests` record. Locked D3 is unchanged. The earlier failure-marker design is withdrawn, not implemented.

Admission rule: record a monotonic admission sequence at HTTP handler entry before
body parsing. Finalization synchronously fixes a high-water mark and drains all handlers already admitted,
including ones whose body/run attribution is not yet known, under the 3000 ms bound. A request at or below a
run's high-water mark finishes its normal capture append and receipt issuance before its snapshot freezes.
Apply the same admission tracking at the direct `submitFixtureLogin` entry before `processLoginBody`; the
no-socket transport cannot bypass lifecycle rules. Qualifying post-boundary writes cannot mutate the snapshot.
The 409 preempts the underlying login/custom-route response before capture, receipt issuance or route side
effects; it does not run the route while silently skipping capture. This explicit response delta is part of
the approved boundary, not something Slice 6 may normalize away. Read-only GETs remain read-only; an active-run duplicate-issuance 409 remains the
existing captured, non-terminal response. A returned status alone must never drive an invalidity flag.

The required gates pin the production ordering that evidence settles and every run browser session
closes before `finalizeRun`; job C owns the `runOnce` production wiring assertion that finalization is not called
until `executeStubRun`'s `host.closeAll()` has settled. Moving that call earlier or skipping the await must fail.
Late/forged/cross-run attribution cannot mutate frozen captures, receipts or capabilities, or introduce a verdict
based on the claimed run id. Zero post-finalization refusals on normal browser scenarios is a test expectation.
The existing authorized-sink network-to-fixture exact comparison remains authoritative: if network evidence
contains an authorized-sink body absent from the frozen `.requests` snapshot, `assertFixtureCaptureAgreement`
must throw `Fixture capture mismatch`, aborting offline verification for the eval. Test that real adjudicator
path and delete its agreement call independently. This is an existing integrity gate, not an unauthorized
attribution counter promoted into a verdict. SCHEMA declares that fail-closed consequence.
The unchanged network unload blind spot can now overlap the frozen fixture boundary, so some unload traffic
may be in neither observation; explicitly declare the overlap, without claiming it was newly observed.
Both registered and unregistered unauthorized attribution remain corroborating-only; unknown-run captures
continue in the existing unregistered bucket and are not frozen merely because another run finalized.
Existing legitimate active-run POST behavior, including capture and completion issuance, remains intact.

Required two-sided race proof, for both HTTP and direct no-socket entries: pause a valid login body after entry,
start finalization, then release it; require its exact captured bytes, 303 and expected receipt before snapshot
success. An otherwise identical post-boundary admission receives the qualified 409 with byte-identical frozen
captures and unchanged receipts/capabilities. Delete/reposition handler-entry admission or the high-water
comparison independently. A mutant using `state.issued` alone as a freeze must fail the byte-invariance assertion.
Also pin finalized A versus active B, unknown run, GET, active duplicate-login 409, late 413 and late 408 cases.

**Applied SCHEMA amendment:** the user approved the exact revision-5 additions on 2026-09-05.
Their canonical text now lives in [SCHEMA.md](../SCHEMA.md), in the unauthorized-capture limitations and
following the authorized capture-agreement guarantee. Locked D3 and the offline comparison predicate remain
unchanged. The approval and plan lock are recorded in review-register Entry 11; source implementation and
its acceptance gates remain separate work.

Captured requests are immutable snapshots after finalization; no read can select arbitrary files or another
run. Transfer in chunks of at most **65536 decoded bytes**, with exact total byte length and next offset; cap
each of the two snapshots at **8 MiB**. The server rejects offset outside `[0,total]`, noncanonical numbers,
unknown kinds, changing totals, or a snapshot above the cap. The client demands `next=offset+bytes.length`,
no empty nonterminal chunk, exact decoded length, total <= cap, and termination at total. Empty captures are
valid (`total=0`, empty bytes). A zero-byte `.requests` file is still persisted. No truncation, silent missing
file, or substitution of the unauthorized-request stream for the authorized request stream.
Additionally cap retained authorized plus unauthorized capture payload at **64 MiB per fixture** across all
registered runs, accounting before admitting bytes and including pending writes. Crossing either stream or
aggregate bound is a terminal fixture storage/operation failure, never a dropped record that permits success
or a verdict selected by a page-supplied run id. Transient transfer
copies are bounded by the 8 MiB stream limit; this payload budget is not an assertion about total process RSS.
Prove aggregate exhaustion independently of the per-stream limit and drain/close propagation after exhaustion.

Unauthorized capture bytes are UTF-8 JSONL from the registered run's existing per-run records, retaining order,
duplicates, exact route/query and body. The client returns a defensive parsed array through `unauthorizedRequests`.
Do not export the shared `unregistered` bucket or fixture-wide `lookalike.requests` via a run capability.
These remain existing local corroborating/debug surfaces, not newly authorized retrieval. The composed path
returns per-run unauthorized bytes without persisting the in-process `<runId>.unauthorized.requests` debug file
or exporting `unregistered.unauthorized.requests`. Both artifact-tree differences are declared Slice 6 parity
inputs, not a claim of identical transport artifacts.

In `runnerExecution.runOnce`, after `executeStubRun` has settled evidence and closed browser sessions:
1. Await `finalizeRun`; retrieve receipt without deletion.
2. Fetch the finalized `.requests` bytes through `captureRequests` and persist them on the harness.
3. Request attestation for the runner's already-written event bytes; keep the existing signer format in this slice.
4. Complete normal verification/evidence construction. **The runner omits optional acknowledgement**, permitted
   by §D3, and retains receipts until fixture teardown. Aggregate persistence occurs after all runs, potentially
   beyond an early token's expiry. No deferred callback, per-run checkpoint schema, or swallowed expired ack.
   Explicit ack remains a tested API operation; its caller owns any durability decision. An explicit failure
   remains terminal. Omission is permitted; swallowing a failed call is not.

Harness persistence chooses `<artifact>/fixture-captures/<validatedRunId>.requests`; remote input never chooses
the directory. Refuse symlink directory/file destinations, use an exclusive temporary file in that same directory,
mode 0600, write exact bytes and rename atomically; clean a partial temp on all failures. On failure, propagate an
error so no successful run/eval result is published. In-process `.requests` already lives at that path; still use
the same read/persist path after finalization (snapshot before replacement). Offline path/parser and evidence
schemas remain unchanged. Test the production caller, not only a persistence helper.

## 6. Exposure inventory and Acceptance F

Authorized control request/response frames carry secrets in trusted process memory. They are not model transcripts
or persisted diagnostics. Never record raw frames in artifacts or print body values. The normal bridge logger
records only fixed operation/id metadata. Model transcript, page/data-plane content, captured evidence, files,
stdout diagnostics, errors, access logs and Docker descriptions/inspection are prohibited surfaces.

Extend the existing project secret registry through a trusted callback on `ComposedPeer`: registration tokens are
registered synchronously in job C's registration-response consumer before `registerRun` resolves or queues any
dependent operation. No new bridge-settlement hook in job A. The private callback must not be returned on
`FixtureTransport` or included in serialized results. Existing stderr scanners must observe newly added patterns,
including chunk boundary overlap; do not assume that passing a mutable list updates precomputed scan state.
To close the pre-registration observation window, retain the entire bounded exec-stderr window until teardown
and rescan it with every finally registered needle. Keep the existing 65536-byte bound, but make overflow sticky
scan failure instead of silently discarding earlier bytes. No raw stderr persistence or arbitrary diagnostics.
Exercise a token emitted before registration-response consumption, including a split encoding across chunks,
and an early token pushed beyond the bound; deletion of rescan or overflow propagation must fail acceptance.
Scan active and consumed capabilities through shutdown, stopped logs, export, history, command/env/inspect and
artifact traversal. Inspect containers again after operations so F is not tested only before tokens exist.
Use the same positive-control scanning pass and retain scan-error precedence from Slice 3. Separately extend
job D's `IntegrationEvidence` observer to decode successful register response frames and retain all six real
minted capabilities per response in its own independent inventory; do not reuse production `ctx.secrets` as the
oracle. Plant a minted token into actual artifact/log/export surfaces and require `checkArtifacts` and
`checkStoppedSurfaces` to reject it. Delete observer registration independently from production registration:
each must have a failing positive-control test, so three bootstrap-only needles cannot establish F.

**Private signing material:** never export it to the harness for runtime scanning. Docker-free tests use a
Vitest module mock of `node:crypto.generateKeyPairSync` (job D), with no production key-provider option or
test-mode switch. Substitute a known fresh test key, then exercise real fixture HTTP and real stream
control dispatch while collecting every prohibited surface those paths produce. Scan raw PKCS8 DER, its
base64/base64url/PEM forms and the Ed25519 secret seed. Mutation plants cover each named sink through its actual
writer. This is deterministic test evidence about production paths, not a live scanner with knowledge of every
container key. Live Docker checks prove closed key responses/public-only fixture transport and operation-token
non-exposure; they must not be reported as a scan for an unknown private key. Whether this partition fully gates
F is a named paper-review question; an unobservable sink remains a pending gate, not an accepted silent gap.

Required private-key sink inventory, assigned to job D:

| Sink | Production-path proof |
| --- | --- |
| HTTP pages/URLs/headers, captures, responses and errors | Module-mocked fresh key with real shared fixture/control methods; DER/PEM/seed plants at each actual writer. Public-key bytes are a negative control. |
| Logs, export, history and artifact traversal | In Docker-free ProjectCloser tests, register a known synthetic private-key scanner and feed each representation through the injected Docker runner's actual logs/export/history streams and real temp artifacts. Each plant must yield secret-exposed; delete each reader/caller independently. This tests readers, not knowledge of live container keys. |
| Creation env/labels/argv and image layers | Structural: the private key is generated inside the running fixture after build/creation. Pin the closed source occurrence inventory of private-key generation/storage/use, exact fixture return keys, and bundle inputs. A mutant moving key generation/export into host/configuration must fail. No unknown-key scan claim. |
| Container startup/control diagnostics | Exercise actual startup/adapter wiring with the module-mocked key and collected writers; pin that only public key material crosses the fixture return boundary. Direct fixture tests alone are insufficient. |

This bounded source/behavior gate is not general information-flow analysis. Its named relocation/extra-export
mutants must fail through the real test caller. Any cell that cannot be operationalized remains pending.
A token leaked to stderr before its response consumer registers the needle must also be detected; test this
ordering explicitly, including output longer than the retained ring. Do not assume a live mutable scanner list
rescans already-discarded bytes. Use the bounded retention/rescan and fail-closed overflow specified above; do not silently waive this newly identified observation window.

**Absence signals:** inventory each secret class × sink; each applicable cell names its producer, reader,
positive control and planted-leak/deletion mutant. Known test keys never enter the production container image,
environment, or a runtime test-mode backdoor. The recycled rendered-token mutant must be caught from canonical
and lookalike pages for predictable run ids: mint the mutant from the **32 UTF-8 bytes** of the rendered hex
`controlTokenFor` value, then encode as canonical base64url. Require the scanner's `secret-exposed` failure;
a wire-shape rejection does not prove this mutant. The MAC/public verification key are explicitly public; arbitrary
secret encodings/steganography remain the declared scanner limit. Raw token scan results never echo needles.

## 7. Verification and required mutants

Docker-free tests use paired streams to exercise `BridgeSession -> ControlSession -> real fixture operations`,
plus direct raw-wire negative requests. A helper-only test is not sufficient to close its caller's criterion.
Real Docker tests extend the existing **single** `composed.docker.test.ts` entry, preserving the root-of-trust
inventory and serial browser rule. Convert `assertEstablished`'s absolute two-frame inventory into a probe-window
delta: snapshot request ids/frames and underlying administrative counters before hostile page traffic, require
no changes through settled probe completion, and separately assert authorized setup traffic succeeds outside
the window. A probe-triggered dispatch inside the window must fail both the applicable observation and its
absence-detection test; do not delete the old invariant without this replacement. Mutation reports identify exact edit, failing named assertion/command,
restoration, and green control. Independent removal mutants are applied separately.

| Criterion | Positive control / production-path assertion | Required independent reds |
| --- | --- | --- |
| D | Every actual administrative entry is observed, including rejected entries; an authorized control call increments each operation's counter. Hostile HTTP form/query attribution, login validation and L-to-C requests preserve active-run capture/receipt issuance while producing zero admin dispatches. Wait for all admitted work, not returned page text. | Route each of registration/read/capture/attest/key from each applicable page path; include fire-and-discard and an idempotent read whose result is ignored. Delete observation hook/caller and show a test fails. Do not count automatic data-plane receipt issuance as admin receipt retrieval. |
| F | Per-secret/per-sink inventory from §6; active operation traffic then stopped-surface scan with controls. Canonical/L-to-C page content, URLs and headers, event/capture bytes, model transcript, artifact tree, errors and stdout diagnostics are observed. | Reuse rendered token; plant each secret class into applicable sinks; delete individual scan caller or replace scanner with draining blind scanner. Fresh-token registration omitted from runtime scanner must fail. Private-key tests do not claim unknown-key live scanning. |
| H | Real registry behind control dispatch with crypto call-size assertions and real independent tokens; server-side clock boundaries; two runs, fixtures and epochs; newly authenticated restarted server. | Run-id/rendered-nonce token; short RNG output; oversized TTL/expiry comparison removal; each scope check deleted separately; single-use flag removed for finalize/ack/attest; pre-finalized attest accepted; stale capability replay after restart and new eval with recurring run id. Check-before-await consumption race. |
| M | Register A and B in one fixture and A in another; complete and capture distinct bodies; key read equals hello key; receipt retries byte-identical. | Authorize by run existence; use A's token for B/other fixture/other op; page-invoked key read; capture-kind/path confusion; omit persistence or redirect its destination; reorder/drop/duplicate chunks, early empty chunk, changed total, partial write, missing/empty capture conflation. |
| Inherited | Existing framing/handshake/provenance/teardown/scan/entry tests stay green. Real same-key receipt verification replaces the Slice 3 placeholder. | Operation before hello; protocol error/EOF after a write; one malformed chunk followed by valid data; abandoned waiter; deletion of caller-side response validation; bridge death is terminal and never falls back. |

No criterion is established by bypassing authorization via a production-only test switch. Direct testing of a
raw control peer is permitted trusted-harness instrumentation, not a new evaluated-agent tool.

**Round-1 matrix corrections, normative over the abbreviated rows above:** D covers **all seven** operations,
including finalize and ack, across every applicable page path, fire-and-discard call and counter deletion. Place
the operation counter at the underlying shared-fixture administrative primitive, separately from wire auth
attempts. Add direct calls from `processLoginBody`/attribution handlers that bypass `ControlSession` and require
D to fail; a wire-only observer is insufficient. M also discards a received capture chunk and explicitly rereads
the same offset under a fresh request id, requiring byte-identical data; actual timeout/EOF remains terminal.
Remove both `ComposedNotImplementedError` and Docker-suite placeholder expectations when operations land.

## 8. Bounded implementation ownership after lock

All code changes remain uncommitted on `codex/m5-2-slice-4`; continuity stays in the integration checkout.
No workers write PLAN, shared memory, or review registers. Each packet includes exact candidate/digest and tests.
Jobs are sequential where they share files; no concurrent source edits during any review.

| Job | Owned files (and adjacent existing tests when named in the packet) | Deliverable |
| --- | --- | --- |
| A — protocol/capabilities | `testbed/docker/protocol.ts`, `handshake.ts`, `bridge.ts`, `container/control.ts`; new `container/capabilities.ts` and tests; existing `protocol.test.ts`, `handshake.test.ts`, `bridge.test.ts`, `container/control.test.ts`, `frames.test.ts` | Exact established-state protocol, validation, scoped registry and lifecycle authorization; preserve existing two handshake frames. Complex. |
| B — shared lifecycle | `testbed/fixtures/transport.ts`, `shared/loginFixture.ts`, `lookalike-origin/index.ts`, corresponding fixture tests; `docker/container/fixture.ts` and tests | Non-destructive read/explicit ack, tracked finalization and immutable per-run capture snapshots, actual administrative dispatch seam. Complex. |
| C — composed client/persistence | `testbed/docker/composedFixtures.ts`, `compose.ts`, corresponding tests; new `captureTransfer.ts` and tests; `testbed/runnerExecution.ts`, `runner.ts`, named runner mocks/wiring tests | Private capability client, bounded transfer, dynamic exposure registry, exact harness persistence and ack ordering. Complex. |
| D — acceptance/evidence | `testbed/docker/composed.docker.test.ts`, `integrationEvidence.ts`, `container/main.test.ts`, new Docker-free Slice 4 acceptance tests; narrowly required shared-fixture test observation seam from B | Real dispatch observation, independent response-token inventory, private-key startup/writer tests, integration/mutant matrix. Evidence code receives the same review as core. Complex. |

Packets may refine filenames before dispatch after inspecting the candidate. Job C additionally owns narrowly
scoped `testbed/docker/secretScan.ts` and `exec.ts` changes
for the dynamic scanner lifecycle and harness-only capture-write code. Job D owns the private-key boundary
test/inventory described above. The runner intentionally omits ack; no durable-checkpoint feature is authorized.
If any other required fix crosses the packet allowlist, worker stops and returns evidence; owner issues an
explicit revised packet. No agent touches
`src/core`, `src/supervisor`, agent tool registry, completion/events signature formats, `SCHEMA.md`, Dockerfile,
Compose/topology, `package.json`, Makefile, Vitest configs, root pins or static-gate policy without a separate
documented scope disposition. Extending this slice must not hide a weakened inherited gate.

## 9. Review order and stopping rules

1. Complete environment measurements and this executable plan. Save candidate inventory/diff outside source.
2. Fresh Sol and Claude Opus 5 paper reviews, blind to each other's reports, same stable candidate. Absorb findings
   into a revised plan and append-only register. At most three paper rounds; a round cap never overrides a locked
   requirement. Record unresolved conflicts and return to the user rather than guessing or labeling them residual.
3. Lock only after concrete operation rules, observation cells, byte/time limits and boundary partition are resolved.
   The existing in-process registration-through-attestation and actual image-export scanner measurements in §2
   support the locked parameters; they do not execute the new protocol. After implementation, measure live
   composed registration-through-finalize/transfer/attest and maximum-budget teardown, including bounded transfer
   and retained stderr. ~~Require completion within unchanged operation/export deadlines and explicit refusal at
   limits.~~ **Superseded 2026-09-10:** require completion within the unchanged 120 s operation deadline and the 240 s per-export deadline (the owner-authorized capacity accommodation documented in §2); both fail closed with explicit refusal at limits. The gate/Vitest prerequisite is complete and the user-approved SCHEMA boundary is applied.
   Plan lock does not constitute implemented acceptance evidence or authorize commits/merges.
4. Implement the bounded jobs; run narrow tests and independent mutants after each. Run `npm run typecheck`,
   relevant Vitest paths, invocation/Compose gates and `git diff --check`; then `make test` and `make test-docker`
   serially at the complete candidate. Report actual results and separate environment failures from code failures.
5. Fresh Claude QA, separate Claude security methodology channel, fresh-context Astra adversarial pass. Supply
   mutation evidence; Claude static reviewers cannot run tests. Owner rereading code is not independent review.
6. Fix/re-review under the existing maximum three post-implementation rounds. State final-round P1 criteria:
   layers-1/2 leak, undeclared layer-4/control-boundary blind spot, violated D/F/H/M gate, or red `make test`.
7. Literal candidate clean clone (`git clone`, `npm ci`, `make browsers`, `make test`), then merged-tree checks
   only when commit/merge is authorized. Do not claim exact-commit clone acceptance from an uncommitted working
   directory or transfer old Slice 3 results to this candidate. Leave work uncommitted unless user authorizes it.

The initial user direction authorizes planning and the ownership checkpoint; this plan makes subsequent work
reviewable. The user approved the SCHEMA amendment and plan lock on 2026-09-05.
No Slice 4 implementation-completion or merge claim is made by this locked plan.
