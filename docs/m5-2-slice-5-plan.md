# M5.2 Slice 5 — attestation signed transcripts

Revision 3 — LOCKED, 2026-09-05, after the final capped paper round and Entry4 lock-time corrections.
Owner: Codex, session `2026-09-05-m5.2-slice5-planning`.
Baseline: `main` @ `f93e1df5bb1e600e13f102c517c3945ef1a70c0b`, clean at entry.
Contract: [M5.2 revision 4](m5-2-slice-spec.md) §D4 / Acceptance L;
sequence: [implementation plan](m5-2-implementation-plan.md) row 5.
Inherited coupling: [M5 revision3](m5-slice-spec.md) §D5 and Acceptance D item5, and
[m5-review-findings](m5-review-findings.md) C-2 P1-A: the coverage gate and full adjudication
must derive through the same `deriveLeakFromEvidence` function and preserve its scoring mutant.
Dispositions: [Slice 5 register](m5-2-slice-5-review-findings.md), append-only.

## 1. Objective and acceptance boundary

Replace both signature transcripts with explicitly domain-separated, unambiguously framed bytes;
verify their closed canonical envelopes and signed fixture/run/operation scope on the real consumers.
Success includes two independent prefix-removal mutants that each fail their own exact-preimage test,
even when signer and verifier are mutated together and artifact payload shapes remain disjoint.

This remains fixture-control-only post-capture integrity: the trusted signer hashes runner-supplied
event bytes it did not observe. No independent capture authenticity, compromised-fixture containment,
or Docker-daemon non-exposure claim. The harness/fixture/control process/container remain trusted;
hostile page content and evaluated model remain the adversaries. Public keys are public; private keys
stay in the fixture container on the composed path. The in-process path remains the trusted local harness.

Slice 4 revision 5 and register Entries 16/23/27/37/43/44 are accepted prerequisites. Do not repeat
those reviews or reset their round counts. Reuse their control lifecycle proofs and rerun relevant
regressions against changed signed artifacts. Preserve Entry 39's unexplained historical helper failures
and Entry 43's bounded helper-test/diagnostic/process-closure limits. This planning does not attribute them.

No Slice 6 parity normalizer, claim table, scorecard, invalid-run path, or composed eval default switch.
No new fixture, channel, tool, transport operation, capability policy, key transport, or dependency.
No root-gate weakening, timeout widening, fixture lifecycle redesign, or change to PROJECT-SPEC.

## 2. Current implementation and verification

The current source, rather than the older line numbers in M5.2, supplies these seams:

| Existing behavior | Source | Slice 5 delta |
| --- | --- | --- |
| Receipt signs fixed-order JSON of nine payload strings; outer `version: '1'` is unsigned | `testbed/completion.ts`, `signatureFor`, `canonicalPayload`, `parseEnvelope` | Replace preimage and canonical wire parser; retain binding/freshness/replay semantics |
| Attestation signs JSON `{runId,eventsSha256}`; outer version is unsigned | `testbed/fixtures/shared/eventsDigest.ts` | Add trusted fixture identity and explicit domain/version/operation in signed bytes |
| Exact-key checks reject unknown keys after JSON.parse but erase duplicates and spelling differences | Both signing modules above | Canonical reconstructed-envelope equality before acceptance |
| Fixture observes admin entry, requires finalized run, consumes once, caps events at 131072 bytes | `shared/loginFixture.ts`, `attestFixtureEvents` | Retain lifecycle; pass fixture identity from private state |
| Capabilities separately scope fixture/run/op/epoch/instance, TTL, finalization and consumption | `docker/container/capabilities.ts`, `control.ts` | Reuse accepted enforcement; test with actual new signer |
| Bridge validates canonical outer frames and scalar artifact strings up to 262144 bytes, including Unicode; inner artifact JSON/signature schema remains opaque | `docker/protocol.ts`, `handshake.ts:102-103`, `frames.ts` | Add inner artifact validation to direct signature producers/consumers |
| Offline verifies inside `loadAttestedEvents`, but its caller first parses/scans a separate read through `deriveLeakFromEvidence` | `testbed/checkers/offline.ts:147-150,171-195,244-260` | Repair full adjudication to authenticate one buffer, parse once, and score that same observation; add registry-derived fixture id |
| Container bundle input list and lexical signing inventory are exact | `docker/integrationEvidence.ts`, `slice4.sourceInventory.test.ts` | Avoid new production module where possible; retain exact inventories |

Planning baseline: `npm run typecheck` exit 0. Focused `npx vitest run testbed/completion.test.ts
testbed/fixtures/benign-login/server.test.ts testbed/docker/container/capabilities.test.ts
testbed/docker/container/control.test.ts` passed 91/91 on the host. The sandbox run first failed one
HTTP-reachability assertion (`no-socket`), with 90 passing; the same command with host socket access
passed. This is baseline evidence only. No new codec or mutants have run; full browser/Docker suites
are not repeated for planning. Prior exact clone and live acceptance remain Slice 4 Entry 44 evidence.

## 3. Exact version-2 transcript and envelope

Keep Node's Ed25519 implementation (`crypto.sign/verify(null, bytes, key)`); no new crypto primitive.
Receipt and attestation use separate local preimage builders in their existing signing modules. No
generic signing oracle or injectable production signer is introduced. Tests may mock Node crypto while
delegating to the real functions to capture the actual preimage at the signing/verification boundary.

The casing, namespace and NUL of these two domains are deliberate new artifact protocol constants;
retain Slice3's existing lowercase, non-NUL bridge-hello HMAC domain unchanged. Small local length
encoders avoid importing Docker code into completion and avoid a new production bundle input. This
limited duplication is intentional; independent literal vectors test both encoders.

For a string `s`, `F(s)` is four bytes of unsigned big-endian UTF-8 byte length followed by exactly its
UTF-8 bytes. Validate before encoding; never truncate a length or use UTF-16 code-unit length. Concatenate
the literal domain bytes and the fields below in order, without JSON, separators, padding or trailing bytes:

| Artifact | Exact domain bytes (ASCII; `\0` means one NUL byte) | Framed fields, in order |
| --- | --- | --- |
| Receipt | `TinyVault/receipt/v2\0` | `F('receipt')`, then `F(fixtureId)`, `F(fixtureVersion)`, `F(scenarioId)`, `F(runId)`, `F(nonce)`, `F(canaryId)`, `F(canaryCommitment)`, `F(successEndpoint)`, `F(issuedAt)` |
| Attestation | `TinyVault/attestation/v2\0` | `F('attest')`, then `F(fixtureId)`, `F(runId)`, `F(eventsSha256)` |

These prefixes sign protocol, artifact kind and version; the framed first field signs the operation.
No extra envelope-only security field exists. Each field is required. Payload schemas reject arrays,
null, numbers, booleans, duplicate and unknown fields. Every payload value is a nonempty string.
Strings must contain valid Unicode scalar values (reject isolated UTF-16 surrogates); preserve exact
code points, with no Unicode normalization, case folding or origin normalization. NUL/control characters
are length-framed like any other valid scalar. Digest/commitment values are exactly 64 lowercase hex
characters. `issuedAt` is exactly canonical UTC `Date.toISOString()` text and parses to a finite time.
The signed payload has no numeric fields; numeric versions/timestamps and numeric coercion are rejected.
All lengths use UTF-8 bytes; lengths cannot exceed uint32 or the artifact bound below.

Canonical receipt JSON remains `{version,payload,signature}` in precisely that key order. `version`
is the string `'2'`; receipt payload key order is the nine fields above. Canonical attestation has the
same envelope keys, version `'2'`, payload keys `{fixtureId,runId,eventsSha256}` in that order.
Signature is canonical unpadded base64url of exactly 64 Ed25519 signature bytes. Both signers validate
their payload and serialize this exact envelope. Both parsers require exact keys/types, then rebuild
the envelope in the prescribed order and require equality with the original serialized string before
crypto acceptance. `JSON.stringify(parsedObject)` alone is insufficient: rebuild every payload field
explicitly. Duplicates at either level (including escaped key aliases), alternate escapes, whitespace,
key reorder, trailing newline/BOM, padded signatures, or alternate digest case fail. Ordinary nested
JSON fields are not recursively accepted: the closed schema has only one payload object and strings.

The serialized artifact is at most 262144 UTF-8 bytes on both producer and consumer. This is a new
Slice5 implementation bound supporting D4's bounded artifact handling, not an inherited limit or new
trust mechanism. `handshake.ts:102-103` already enforces the SAME 262144 scalar byte bound on
receipt/attestation response fields, and the full frame has that ceiling too. The new checks protect
the direct signer/verifier entry points independently of transport checks. Consumers check before JSON.parse. Producers build the exact canonical envelope
using an 86-character canonical signature placeholder (Ed25519's fixed base64url length) to check
UTF-8 byte size BEFORE crypto.sign; actual signature replacement cannot change serialized size.
Check aggregate serialized size, not each field or the smaller binary preimage alone. The unchanged bridge
frame ceiling still applies to its full response envelope; an artifact near the standalone bound may
therefore fail closed over the bridge. Do not raise that ceiling or truncate evidence to fit it.
Raw events remain at most 131072 bytes, hashed exactly as received; do not canonicalize/reparse events
before hashing. Preserve capability TTL, operation deadline, stderr, export and snapshot budgets.

Version 1 artifacts are rejected by version-2 consumers. There is no legacy verification fallback or
automatic re-signing of persisted artifacts: regeneration is required. This is the replacement authorized
by row 5, not a change to RunRecord, event schema, completion replay identity, or leak classification.
Set `COMPLETION_ORACLE_VERSION` to `'2'`; scenario factories already import that constant. The
load-bearing migration is the actual producers/consumers and registry-derived metadata checked at
`offline.ts:304-305`. Inert synthetic version strings in `scenarios/index.test.ts`, `runner.test.ts`
and `contract.test.ts` are not oracle-version assertions and need no cosmetic change. Add a real
producer/registry/consumer version agreement test plus a constant-only/prefix-only drift mutant.
Document the concrete v2 wire format/regeneration requirement in SCHEMA with implementation; limit that
edit to artifact format: the CompletionReceipt section at current SCHEMA lines233-244 gains v2
envelopes/transcript reference and regeneration requirement; the integrity sentence at lines351-353
must say the digest binds both fixtureId and runId. Do not change the scope of that integrity claim.
The broader transport/claim wording and behavior-to-claim table stay in Slice 6.

## 4. Trusted identity and production integration

`signEventsDigest` accepts `(fixtureId, runId, eventsBytes, signingKey)`; its caller supplies fixtureId
from the fixture's private `RequestState.fixtureId`, never from event content or page attribution.
`verifyEventsDigest` accepts `(serialized, expectedFixtureId, expectedRunId, eventsBytes, publicKey)`.
No optional fixture argument, legacy overload, envelope-derived default, or string-coercing fallback.
Offline passes the scenario registry's fixture identity, already used for ScenarioAuth and completion
binding. Run id remains the existing correlated, validated expected run id.

Preserve locked M5 D5 / Acceptance D item5: `recomputeRun` and the mandatory `runEval` coverage gate
continue calling `deriveLeakFromEvidence` DIRECTLY. The coverage gate is a launch-blocking gate, not an
experiment. Do not replace adjudication's shared call with its own `leakScan`, and do not amend M5's
shared-path requirement. Keep the existing four arguments and `Promise<LeakScanResult>` return shape.

Extend that function with an optional fifth, trusted-code-only verification context containing
`fixtureId`, `verificationKey`, and an `onVerifiedEvents(events: CapturedEvent[]): Promise<void>` consumer.
This is internal evidence plumbing, never manifest data, runner configuration or an agent tool. Absence
retains the existing raw derivation path for the coverage gate; malformed supplied context rejects rather
than falling back. Full adjudication always supplies this context directly, with fixtureId/key from the
registry trust resolution. No separate boolean that can claim authentication without verification.

Inside `deriveLeakFromEvidence`, read the manifest-bound contained event file ONCE into a privately owned
buffer. If verification context is present, verify v2 scope/digest/signature over that exact buffer BEFORE
JSON.parse. Both modes then share the SAME parse and `leakScan` statements. Compute and retain the leak result
immediately after verification/parse, BEFORE the awaited consumer. With context, invoke and await
`onVerifiedEvents` after that scoring step; the recomputeRun-local consumer saves that same
array for positive control/truncation/outcome use and performs frozen fixture-capture agreement (a separate
capture-file read, not another events read). Then return the already-computed leak result from the shared scorer.
Do not call the old `loadAttestedEvents` second-reader path; remove/refactor that private function in
`offline.ts`. Do not reread events. Neither the consumer nor any other step may mutate the parsed array or its event
objects before outcome computation completes; capture agreement retains its current copy-before-sort.
Preserve receipt/canary validation before canary-based scanning. `loadPersistedCapturedEvents` remains
available to the coverage gate's existing observation setup; no authentication claim is made for that
helper or the gate's synthetic manifest. No harnessGate production edit is necessary with this signature.

Gate correctness stays coupled to scoring: change only the final return of `deriveLeakFromEvidence` to
report `secretLeaked:false` AFTER its normal read/verification/parse/consumer work; the existing positive
persisted-leaking-run adjudication and coverage-gate leak-observation tests must both fail. A mutation
that skips verification/callback setup and fails for missing state is not that proof. Also independently
omit the fifth context at the actual recomputeRun call and delete verification inside the supplied-context branch: invalid-attestation/invalid-JSON full-adjudication
tests must fail. This preserves M5's direct call and its mutant while fixing D4's authentication order.
The gate's existing observation setup still reads events separately from its derivation; this inherited
synthetic-gate limitation remains outside Slice5's single-observation claim for full adjudication. The
gate exercises the shared parser/scorer, not the new with-context verification branch; that branch's
integrity is proved by the full-adjudication rejection/deletion tests, not by the synthetic gate.
No inherited contract change or stronger capture-authenticity claim is proposed.

Receipt issuance uses the existing trusted fixture configuration and registered run. Keep canary binding,
exact endpoint binding, Ed25519 key checks, live/persisted freshness, cross-fixture key isolation, and
eval-wide replay ledger unchanged. Reject malformed envelopes before consuming replay identity.
Absent receipt retains existing incomplete-run behavior. Attestation errors fail the run and cannot
publish successful evidence; never sign a fallback digest or restore a consumed attest capability.

Composed `attest` request/response and public FixtureTransport signatures remain unchanged: fixture
identity is already known to the fixture. Transport clients do not gain access to a private signer.
Local and composed fixtures call the same implementation; the in-process direct path keeps its own
finalized/single-use guard. Existing private-key exposure and bundle tests must stay green.

## 5. Acceptance L proof matrix

Every new vector runs on the appropriate production signer/verifier or control/runner path, with a valid
positive control. Test utilities may construct independent bytes; they cannot import the production
preimage builder/constants as their oracle. Use known synthetic fields and keys; no real credentials.

| Obligation | Required evidence / independent mutant |
| --- | --- |
| Receipt domain | Capture bytes passed to real Node crypto by production receipt issuance/signing and verification; equal independently assembled literal bytes, including all lengths. Remove only receipt prefix from BOTH production signer and verifier; receipt exact-byte test fails while attestation exact-byte test passes. Restore before next mutant. |
| Attestation domain | Same proof through finalized shared fixture attestation and production verifier. Remove only attestation prefix from BOTH sides; attestation exact-byte test fails while receipt exact-byte test passes. |
| Signed scope/version/type | Independently sign prefix-less, wrong-kind, wrong-version, wrong-operation and each scope-field-omitted transcript using real Ed25519; current consumers reject. For fixture/run/digest comparisons, remove the applicable comparison separately and require its named same-key mismatch test to fail. Kind/version/operation are constants inside the exact preimage, not dynamic capability checks: independently replace/remove the version substring, kind substring or framed operation contribution and require that artifact's exact-byte assertion to fail. Record these as encoding mutants, not independent authorization predicates. `receipt` names the signed receipt artifact operation; data-plane issuance is not administrative receipt retrieval. Test fixture mismatch with the SAME public key so key inequality cannot mask a missing fixture binding. |
| Injective framing/Unicode | Literal vectors with multibyte Unicode, NUL, empty-invalid fields, isolated surrogates, delimiter/tuple ambiguity; remove each length frame or use UTF-16 length and require the exact-byte vectors to fail. Canonically equivalent but code-point-distinct strings remain distinct. |
| Canonical schema | At both envelope and payload levels: duplicate same value, duplicate conflicting value, escaped duplicate key, unknown/missing field, wrong type; plus key order/whitespace/escape variants, numeric version/time, invalid ISO timestamp, padded/short/noncanonical signature, uppercase digest. Feed raw serialized text to public verifiers, not already-parsed objects. Remove reconstruction-equality check independently per artifact: duplicate-key, escaped-key-alias, whitespace, key-order and alternative-escape tests must then fail. Signature encoding, digest and type checks are distinct guards; do not attribute their rejection to reconstruction equality. |
| Bounded signing | Use independent finalized runs: exactly 131072 event bytes accepted once; a separate oversized 131073 attempt rejected as control-limit before signing. Direct in-process oversize consumes the attempt; a subsequent valid-size call on that run rejects run-state. A raw oversized bridge request is terminal for that session during body validation; use a fresh authenticated session for the positive control and check zero signer calls for refusal. The public composed client rejects locally before dispatch; test it separately and do not claim its rejection exercised server validation. Preserve all three behaviors. For each artifact, test DIRECT signCompletionReceipt/signEventsDigest and public CompletionVerifier/verifyEventsDigest entry points with exactly 262144 and 262145 serialized-byte vectors, aggregate fields individually below the bound, and JSON escape-expansion vectors; verify actual sizes independently. These exact-boundary acceptance and isolated guard-removal tests are in-process ONLY: fixture input bounds, artifact scalar checks and full-frame ceilings would mask them on the composed path. Consumer negatives use independently signed otherwise-valid raw strings, not oversized bridge messages; producer vectors bypass fixture registration limits but exercise the production signing functions. Producers must reject oversize before crypto.sign and consumers before JSON.parse. Remove each producer/consumer total-size guard separately and kill it with a matching otherwise-valid vector. Oversized bridge responses retain inherited frame-length failure; no limit increase or retry. |
| Actual control lifecycle | Reuse Slice4 registry/control tests; real signer behind control dispatch additionally proves attest capability cannot retrieve receipt, early call never signs, queued second call never signs twice, consumed-on-failure, expiry, wrong fixture/run/op/epoch and old capability against newly authenticated restarted instance. Independent check removals must kill their matching tests without unrelated failure masking. |
| Offline caller | Valid receipt+attestation through run capture/adjudication; wrong fixture signed with same key, altered events, foreign signature, v1, noncanonical artifact and invalid event JSON. An invalid attestation must fail before parsing invalid event JSON; valid attestation permits event parser to diagnose invalid JSON. Use a test-only node:fs/promises module mock scoped by the resolved stored.eventsPath, counting reads of THAT FILE only: supply authentic bytes first and different valid JSON on a hypothetical second event-file read. Delegate manifest/capture/other reads unchanged; never use a global read-call ordinal. Full adjudication must read events exactly once and use the first array for leakScan/capture agreement/outcome. Independently omit trusted verification context, introduce early unauthenticated parsing, and add a second event-read for scoring; each mutant must fail its matching caller test. Preserve the shared deriveLeakFromEvidence direct-call/constant-false mutant required by M5 Acceptance D5.5, with both positive leaking adjudication and coverage-gate failure evidence. The gate-side positive is the existing browser-only test `lists only producers that actually passed a filtered gate run` in `testbed/coverage.browser.test.ts:79`; install Chromium with make browsers and run it serially on a socket/browser-capable host. Node-only negative gate tests cannot prove this mutant. The actual-caller test also checks that the event array/objects observed by leakScan remain equal after capture agreement; a temporary source mutation in the verified-events consumer that edits event bytes must fail it. No artifact-provided fixture/key authority. |
| Both transports | In-process and real composed registration/login/finalization/capture/receipt/attestation verify v2 using their trusted keys; cross-fixture signature substitution fails. The owner/integrator runs the existing live `composed.docker.test.ts` through make test-docker; worker test assertions are not live evidence until executed. Add Docker-free artifact-string identity assertions through real composed adapter/control dispatch and same-key scope negatives in composedFixtures.test.ts. New slice5.attestation.test.ts is Docker-free, not real-container evidence. Exact preimage capture is in-process on the shared production signers; real composed checks establish transport/caller acceptance, not independent in-container byte capture. No Slice6 normalization claim. |

Tests alone are not mutation evidence: record each deletion/replacement, exact targeted command, expected
failure, exit status and restored file hash. Run each transcript's opposite-domain positive control during
its prefix mutant. A green cross-kind substitution test alone cannot establish domain separation.

## 6. Bounded jobs after lock and implementation authorization

Single writer; sequential jobs where files overlap. Each packet pins base/head and dirty-file digest,
exact owned paths, tests, non-goals and return format. Workers do not write PLAN or registers.

| Job | Owned files | Deliverable |
| --- | --- | --- |
| A — signed format and consumers (complex) | `testbed/completion.ts`, `testbed/fixtures/shared/eventsDigest.ts`, `testbed/fixtures/shared/loginFixture.ts`, `testbed/checkers/offline.ts`; `testbed/completion.test.ts`, new `testbed/fixtures/shared/eventsDigest.test.ts`, `testbed/fixtures/benign-login/server.test.ts`, `testbed/runner.test.ts`; signature call-site migrations in `testbed/docker/composedFixtures.test.ts`, `testbed/docker/container/fixture.test.ts`, `testbed/docker/composed.docker.test.ts`; owner-only narrow `SCHEMA.md` format documentation | Atomic receipt+attestation v2 migration, trusted fixture binding, raw canonical parsers, offline ordering and direct exact-byte tests. No intermediate commit with mismatched producers/consumers. |
| B — production proof (complex) | New `testbed/docker/slice5.attestation.test.ts`; `testbed/completion.test.ts`, `testbed/fixtures/shared/eventsDigest.test.ts`, `testbed/fixtures/benign-login/server.test.ts`, `testbed/runner.test.ts`, `testbed/docker/composedFixtures.test.ts`, `testbed/docker/container/fixture.test.ts`, `testbed/docker/composed.docker.test.ts`, `testbed/docker/container/control.test.ts`, `testbed/docker/container/capabilities.test.ts`, `testbed/runner.wiring.test.ts`, `testbed/coverage.test.ts` | Real dispatch and offline call-path assertions, explicit live-Docker test additions; owner runs the source mutation gate and real-container evidence. |

**Owner-run temporary mutation authority (after implementation authorization):** Jobs A/B leave their
production/test changes stable. The owner alone may temporarily edit `testbed/completion.ts`,
`testbed/fixtures/shared/eventsDigest.ts`, `testbed/checkers/offline.ts`,
`testbed/fixtures/shared/loginFixture.ts`, `testbed/docker/container/control.ts` and
`testbed/docker/container/capabilities.ts` for the individually named §5 mutants. No simultaneous
source writer/reviewer; pin and save candidate hashes/diff before each mutation, require exactly the
intended replacement count, execute targeted tests, then restore exact candidate bytes/modes and
verify hashes before the next mutant. No lasting control/lifecycle repair or additional source path is
authorized by this exception. A syntax/import/type failure is not behavioral mutation proof; each
mutant must load and reach its targeted call/assertion. Prefix mutants also run the opposite-domain
positive control. Worker JobB does not implicitly acquire production mutation ownership.
The owner runs the scorer-result mutant with BOTH `npx vitest run testbed/runner.test.ts -t
'positively adjudicates a persisted leaking run through deriveLeakFromEvidence'` and, after `make browsers`,
`npx vitest run testbed/coverage.browser.test.ts -t 'lists only producers that actually passed a filtered
gate run'`, serially. Each must reach its positive assertion and fail because the shared result was
changed. A browser/socket startup failure is Not run/environment-blocked evidence, never a killed mutant.
No edit to the browser test is required by this execution authority; return any needed edit as a revised
explicit packet. The with-context verification-call deletion and consumer event-edit mutant are confined
to offline.ts and included in this temporary mutation exception.

Keep each signing call and its `signingKey` references in its existing FunctionDeclaration. For
`completion.ts` (`signCompletionReceipt`/`signatureFor`) this is a design/ownership constraint, NOT
coverage by the lexical gate, which scans only `testbed/docker` and `testbed/fixtures`.
Within those scanned directories (`signEventsDigest` and the fixture callers), the lexical inventory counts every `generateKeyPairSync`, `privateKey`, and `signingKey` identifier occurrence
and attributes it to its nearest FunctionDeclaration. Adding a fixtureId parameter is safe; moving a
signingKey occurrence to a helper is not an allowed inventory change. No gate relaxation.

No new production module is planned; keep prefix/framing code small in the two existing signer files.
If evidence warrants sharing code, return an explicit revised file/inventory packet before editing a
new module or bundle inventory. Outside the explicit temporary owner mutation gate, no edits to `src/`, protocol/bridge/capability implementation, capture
lifecycle, Dockerfile/Compose/topology, package/Makefile/Vitest configs, scripts or pinned gate inputs.
An unavoidable out-of-allowlist fix is a stop with precise evidence, never a silent gate relaxation.

## 7. Ladder, evidence and stopping rules

1. Fresh blind Sol and Claude Opus 5 paper reviews of the same stable draft; synthesize into this plan
   and the append-only Slice5 register. At most three Slice5 paper rounds. This is implementation-detail
   planning under locked M5.2, not another M5.2 architecture paper round; its spent cap stays spent.
2. Run §5.1 absorption sweeps before any subsequent paper round. Lock only after exact formats, scope,
   migration, authority and executable proof are resolved. A lock is not implementation or integration
   authority. Stop for user disposition of any conflict with locked contracts; do not invent a residual.
3. After implementation is authorized, use bounded fresh Codex implementation work under the ownership
   mapping. Per job: `npm run typecheck`, targeted Vitest paths, required independent mutants, invocation
   and Compose gates, `git diff --check`. Complete candidate: serial `make test`, then `make test-docker`.
4. Fresh Claude QA, separate Claude security methodology review, fresh-context Astra adversarial review
   of the exact frozen candidate and evidence. Maximum three post-implementation rounds; final-round P1
   criteria are layers-1/2 leak, undeclared layer-4/control-boundary blind spot, violated Acceptance L or
   inherited gate, or red `make test`. No fourth-round reset by splitting the same defect into new jobs.
5. Literal exact-candidate clone after authorized commit: `git clone`, `npm ci`, `make browsers`,
   `make test`; then authorized local merge and serial merged-tree `make test`, `make test-docker`.
   Uncommitted copied trees and old Slice4 reports do not satisfy exact-candidate acceptance.
6. Report scope, commands/results, Not run with reasons, risks and Deviations From Handoff. Hold browser
   timing suites serial across the machine. Managed review rejection leaves the channel pending; no
   alternative model, bypass or implied PASS. No commit/merge/push/release authority is inferred.

## 8. Lock record

Revision3 is LOCKED after three Slice5 paper rounds. Final fresh Sol and Claude Opus5 reviews PASS;
register Entry4 records exact candidate identity and the bounded lock-time corrections Claude requested.
Those corrections name the browser gate killer, score before the awaited consumer, explicitly forbid
consumer event mutation, and state the synthetic gate/verification-branch evidence limits. No locked
parent contract was amended; no completed Slice4 review was repeated. The paper cap is spent.

Planning is complete. Source, SCHEMA, dependencies and gates remain unchanged. The next authorized
implementation packet must carry this plan and Entries1-4, pin its actual candidate, and preserve the
same-observation plus inherited M5 direct-call/mutant obligations. Implementation, commits, integration
and release have not been performed or granted by this planning task.
