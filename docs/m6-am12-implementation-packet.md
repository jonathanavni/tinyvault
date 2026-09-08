# M6-AM12 implementation packet (v4 — paper ladder closed at the cap; awaiting base SHA) — raw cap 1 MiB, frame ceiling 2 MiB, explicit bridge scalar bounds

Status: **DRAFT v3 implementation handoff (owner, 2026-09-08, session `2026-09-08-s6`)** for the ADOPTED amendment
`docs/m6-am12-events-cap-amendment.md` (v4, relocked 2026-09-08). v1: Sol R1 NO-SHIP (9 P1 / 3 P2, `…/am12-impl-packet-sol-r1.md`);
v2: Sol R2 NO-SHIP (4 P1 / 3 P2 / 1 P3, `…/am12-impl-packet-sol-r2.md`); v3: Sol R3 (cap) NO-SHIP on two ownership P1s
(`…/am12-impl-packet-sol-r3.md`), corrected in this v4 with the residuals recorded in §13; **the pre-implementation paper ladder is
closed at the three-round cap**. **NOT DISPATCHABLE until §2's base SHA is pinned** (the companion slice must land first). Ladder
from here: Astra implementation in an isolated worktree (full ladder: signing,
bridge, admission) → owner `make test` + owner mutant reproductions → post-impl Codex adversarial review, fresh Claude QA, fresh
Claude security pass → three-round fix cap. **Sequenced after** the companion `evidence-oversized` packet
(`docs/m6-s6-oversize-diagnostic-packet.md`) has landed on main (both touch `testbed/docker/composedFixtures.ts` and its test);
the dispatch prompt pins that post-companion base SHA.

## 1. Task

Implement AM12 exactly: raise the raw signed-events cap and the outer bridge frame ceiling; bound every bridge scalar that today
inherits the frame ceiling explicitly and exactly; flip the sizing-suite expectations per the amended AM11 item 3; add the
certifying 16-turn witnesses, the exact-cap Docker attest gate, the offline retained-snapshot bound and the decoder near-cap
observation; carry the s104 prose change and the plan §4.3 gate-text amendment in the same change; re-kill the recorded deletion
mutants at the new values and kill one new mutant per new bound with masking-resistant observations. No other behaviour changes.

## 2. Branch / worktree

`codex/m6-am12-caps`, base = **`<POST-COMPANION SHA — TO BE PINNED BY THE OWNER; STOP if this placeholder is still present>`**
(main after `docs/m6-s6-oversize-diagnostic-packet.md` has landed and passed its acceptance ladder). The same SHA is repeated in
the dispatch prompt. Separate worktree; no other write job in it.

## 3. Required reading (in order)

1. `CLAUDE.md`; `PLAN.md` Current State; `.claude/memory/conventions.md` (append-only registers; legitimate-traffic controls).
2. `docs/m6-am12-events-cap-amendment.md` v4 (§4 values and scalar rows, §5 gates, §6 inventory, §9 decisions, §12 residuals).
   Where this packet is more specific, this packet governs; where they conflict, STOP and report.
3. `docs/m6-implementation-plan.md` §4.3 (240–258), §4.3.1 items 1–4 (~380–405), amendments table rows AM11/AM12.
4. Source: `testbed/docker/protocol.ts` (whole), `frames.ts` (whole), `handshake.ts` (whole — note `decodeBase64url`'s `size`
   is **equality**, `:37-42`, and `importAnnouncedKey` accepts only byte-identical Ed25519 SPKI DER, `:48-55`), `bridge.ts:38-47,
   57-65,86-110`, `composedFixtures.ts:85-96`, `container/control.ts:54-80,110-165`, `container/main.ts:35-55`,
   `container/bridge.ts:7-31`, `testbed/fixtures/shared/eventsDigest.ts`, `loginFixture.ts:210-225`, `testbed/completion.ts:40-50,
   200-250`, `testbed/parity/observe.ts:5-12`, `testbed/checkers/offline.ts:120-240` (real-profile preload at `:129-163`),
   `testbed/checkers/leakDecoders.ts:20-60`, `testbed/checkers/leakScan.ts:20-30,75-120,225-250`.
5. Tests: `testbed/agentEvidenceBudget.test.ts` (whole; witnesses at `:32-38`, `trace` at `:40-193`, serial schedule at `:99-110`,
   16-turn maximum-output builder at `:282-303`, boundaries at `:306-347`), `testbed/docker/handshake.test.ts` (whole; the fixed
   44-byte key vector at `:11-19`, `:89-93`), `composedFixtures.test.ts:154-175` **and** `:325-350`, `slice5.attestation.test.ts:200-245`,
   `eventsDigest.test.ts:165-210`, `runner.realAgent.test.ts:90-155`, `realAgentRun.test.ts:420-455`, `container/control.test.ts:375-390`,
   `frames.test.ts:70-90`, `leakDecoders.timing.test.ts:20-110`, `syntheticCorpus.test.ts:30-60`, `completion.test.ts:295-310`,
   `parity/observe.test.ts:118-135`, `composed.docker.test.ts:155-210`.
6. Claim surfaces: `SCHEMA.md:924-930` (s104 / `P-v2`), `testbed/parity/claims.test.ts:60-70,300-314,428,883-910,1209-1235,1692`
   (the independent `EXPECTED_SECTION` copy, the per-span line-count layout, the P-v2 boundary test), `docs/m5-2-claim-evidence.md:154`,
   `testbed/parity/claims.ts:292`; `docs/m6-s6-claims-amendment.md` and commit `dfb8ddb` as the worked precedent.

## 4. Values and bounds (V1–V2)

**V1 values.** `MAX_EVENTS_BYTES` 131,072 → **1,048,576** at every enforcement site: `protocol.ts:36`, `composedFixtures.ts:91`,
`handshake.ts:93`, `eventsDigest.ts:18,34`, `loginFixture.ts:220` (today `128 * 1024` — replace with the shared constant; leave no
second definition). `MAX_PAYLOAD_BYTES` 262,144 → **2,097,152**, used ONLY as the outer frame ceiling (`frames.ts:46,72`).
**Unchanged:** signed-artifact bounds (`eventsDigest.ts:37,49,88`, `completion.ts:44,206,246`), parity `headerBytes: 262144`
and `witnessBytes: 2097152` (`observe.ts:9`, `observe.test.ts:122-131`), `MAX_CAPTURE_BYTES`, `MAX_CHUNK_BYTES`, the 5,000 ms
bridge timer (`bridge.ts:43`). **Leave-alone list (report each literal as untouched):** `observe.ts:9` (both values);
`claims.test.ts:790` (`128 * 1024` decoder-corpus filler, unrelated); `docs/m5-2-slice-6-plan.md:114-116` (parity observer
limits); `docs/m6-implementation-plan.md:338-359` (historical AM11 measurements at 131,072 — never rewritten); every
`262144` in `completion.ts` / `eventsDigest.ts` / their tests / `claims.test.ts:899-904`.

**V2 explicit bounds for the five `handshake.ts` scalars, with codes, precedence and no-reach observations** (Sol P1-03, P1-07):

| Site | Field | Bound | Code on violation | Precedence | Mutant observation (M-V2-n) |
| --- | --- | --- | --- | --- | --- |
| `:102` receipt response | `receipt` string | new `MAX_ARTIFACT_STRING_BYTES = 262144` (UTF-8 bytes) | `body-shape` (as today) | unchanged | delete the bound → a 262,145-byte string is accepted by `validateBody` (accept/reject is sufficient here) |
| `:103` attest response | `attestation` string | `MAX_ARTIFACT_STRING_BYTES` | `body-shape` | unchanged | same |
| `:101` key response | `publicKey` | **exact 44 decoded bytes** (Ed25519 SPKI DER; `decodeBase64url(value, 44, 'key-shape')`) — the canonical unpadded encoding is exactly 59 characters; add `if (value.length !== 59) throw new BridgeError('key-shape')` before decoding | `key-shape` | length check → decode → `importAnnouncedKey` | delete the pre-decode length check → a 1.5 MiB base64url string reaches `Buffer.from(…, 'base64url')`; assert via a spy/seam that decoding was **not** reached in the green build and **is** reached in the mutant |
| `:120` hello response | `publicKey` | same as `:101` | `key-shape` | same | same, separately mutated |
| `:105` capture response | `bytes` | encoded length ≤ **87,382** (= ⌈65,536 × 4/3⌉) checked **before** decoding; the existing decoded `> MAX_CHUNK_BYTES` check stays | `body-shape` | encoded-length → decode → existing checks | delete the pre-decode check → an oversized encoded string reaches `Buffer.from`; assert decode not reached in green |
| `:92-95` attest **request** | `events` | encoded length ≤ **1,398,102** (= ⌈1,048,576 × 4/3⌉) checked before decoding; the existing decoded `> MAX_EVENTS_BYTES` check stays | canonical over-cap: `control-limit` (as today); non-canonical/invalid base64url: `body-shape` (as today) — **precedence: encoded-length check first, and it throws `control-limit`**, so an oversized *invalid* string reports `control-limit` (disclosed diagnostic change; the old order decoded first) | encoded-length → decode/canonicality → decoded check | delete the pre-decode check → assert `Buffer.from` reached |

Positive controls (legitimate traffic, per conventions): the real 59-character / 44-byte fixture key accepted at both key sites;
a 65,536-byte capture chunk (87,382 chars) accepted; an exact-cap events request (1,398,102 chars) accepted and attested;
262,144-byte receipt and attestation strings accepted. Container side needs **no** constant change (`container/main.ts`,
`container/bridge.ts` pipe bytes; `control.ts:62` applies the shared `validateBody` before its own decode at `:131-132`).

## 5. Gates and witnesses (V3–V9)

- **V3 sizing-suite flips** (`agentEvidenceBudget.test.ts`): six batched, six serial-1024 and the fixed/serial-2048 traces now fit
  and attest (`qualifiedDeterministicWitness: true`; `:197-212` expectations flipped). The 16-turn maximum-output trace
  (`:282-303`, 1,409,051 raw bytes) is **raw-rejected** (`control-limit` from the fixture and `'Events exceed control-limit'`
  from the signer), retained unsigned, **and its frame now encodes**: base64url = 1,878,735 chars, payload 1,878,963 B, framed
  1,878,967 B, under the 2,097,152 ceiling by 218,189 B (Sol P1-02) — flip the frame assertion to `encodeFrame(frame).length ===
  payload + 4`. Raw boundaries `it.each([1048575,1048576,1048577])`; frame boundaries `it.each([2097151,2097152,2097153])`
  (the frame rejection proof); signed-artifact boundaries 262,143/262,144/262,145 unchanged.
- **V4 certifying witnesses — pinned schedule** (Sol P1-04): for **all six** scenario/profile cells in `witnesses` (`:32-38`),
  build a **serial, 1024-allowance, 16-response** trace through the existing actual-SDK helper (`trace`, `:40-193`, fake fetch +
  real `AnthropicModelClient` serialization + in-process fixture registration/finalization/signing) with a **legal session
  lifecycle** (Sol R2 P1-01 — every witness's last call is `browser_close_session`): responses 1…k−1 replay the witness's own
  ordered `calls` up to but excluding its final `browser_close_session` (k = 8 for benign/DOM-hidden, 12 for lookalike), one call
  per response, each returning the witness's own captured `result`/`events`; responses k…14 are `browser_snapshot` calls, each
  returning a byte-identical copy of **the witness's own last captured snapshot result** (index 5 for benign/DOM, 9 for
  lookalike), with unique tool-call IDs and the witness's original session ID; response 15 replays the witness's original
  `browser_close_session`; response 16 is the terminal assistant response (`stop_reason: 'end_turn'`, `stopReason: 'complete'`). Assert every cell fits ≤ 1,048,576 raw bytes and attests; write `<runId>-max16-1024.measurement.json`.
  This certifies **exactly this schedule and payload set** (AM12 §12 P2-02), not a universal maximum; report each cell's raw bytes.
- **V5 Docker exact-cap attest gate** (`composed.docker.test.ts`): three distinct finalized runs, each attesting exactly
  1,048,576 bytes through the real public transport on real Docker; time the **complete** `fixture.attestEvents(runId, buf)` call
  from immediately before invocation to resolution (Sol P2-02); assert each < 5,000 ms; record all three values and the maximum
  headroom; assert the bridge timer constant is still 5,000 (`bridge.ts:43`); a 1,048,577-byte attempt is rejected with no
  `attest` request observed (spy `BridgeSession.prototype.request`).
- **V6 offline retained-snapshot bound — pinned** (Sol P1-05): new `testbed/checkers/offline.retention.test.ts` (in `make test`)
  building a **real-profile** cohort of 60 runs (6 cells × N=10) with valid signed cap-sized (1,048,576-byte) events files and
  provenance trust, so that `collectPersistedRuns` takes the preload branch (`offline.ts:129-163`) and `eventSnapshots` holds 60
  parsed arrays simultaneously. **Branch oracle from owned code only** (Sol R2 P1-02; `readVerifiedRunEvents` and `recomputeRun`
  are module-private): spy `node:fs/promises.readFile` (the `realAgentRun.test.ts:681-700` precedent) and use the existing
  `completionVerifierFactory` seam (`offline.ts:62-66`); assert that all 60 distinct `eventsPath` reads have completed **before the
  first `completionVerifierFactory` invocation**, that no `eventsPath` is read again afterwards (total event-path reads = 60 at
  the end), and that adjudication returns 60 verified runs. **Measurement in a dedicated child process** (Sol R2 P2): the test
  spawns `node` running the adjudication script with a baseline `process.memoryUsage()` sample, interval samples every 50 ms,
  and `process.resourceUsage().maxRSS` at exit; records `{wallMs, baselineRss, peakRss, peakHeapUsed, sampleCount, intervalMs,
  platform, node}` to a measurement JSON. Measurement-only (no fail threshold) in this slice; the numbers go into the report.
- **V7 decoder near-cap observation — test-only instrumentation** (Sol P2-03, R2 P2): new file
  `testbed/checkers/leakDecoders.nearcap.test.ts` (stress/observation, separate from the benchmark file): a run-shaped ~1 MiB
  events case built by `syntheticCorpus`; observe per-event `EventWork` counters through a **partial module mock** of
  `./leakDecoders` that wraps the exported `createEventWork` (`leakDecoders.ts:50`, called once per unauthorized event at
  `leakScan.ts:93`) to record each created object; after `leakScan` returns, report per event `candidates`/`candidateBudget`,
  `wrapperInflateTrials`, `rawInflateTrials` and whether each hit its limit, plus the run-level `truncated`; write a measurement
  JSON. The benchmark file gets no near-cap assertion. **Forbidden:** adding these counters to `LeakScanResult`, `RunRecord`,
  scorecards or any claim span.
- **V8 mutant parity:** re-kill the four recorded deletion mutants (raw signer limit, fixture admission limit, signed-artifact
  limit, frame limit — `m6-review-findings.md:592-596`) at the new values, plus M-V2-1…6 from §4 with their no-reach observations.
- **V9a post-companion oversize witness repin** (Sol R2 P1-03): the companion packet's W1a (`realAgentRun.test.ts`, loop-produced
  16-turn shape from `:423-448`, which today is only asserted > 131,072) no longer overflows a 1 MiB cap. Repin it in this slice:
  make the loop-produced trace deterministically exceed the **imported** `MAX_EVENTS_BYTES` (e.g. 4,096-character text blocks per
  response as the sizing builder does at `agentEvidenceBudget.test.ts:288`, still loop-produced, no post-write editing) and assert
  `raw.length > MAX_EVENTS_BYTES`; retain every companion assertion (reason, persistence, one registration, no scorecard, no
  credit). Keep it distinct from V3's separate sizing trace. `testbed/realAgentRun.test.ts` is owned for this purpose.
- **V9 missed old-cap pin** (Sol P1-06): `composedFixtures.test.ts:154-175` `local-events` uses `128 * 1024 + 1` and could go
  silent-green via a later `run-state` refusal; change the vector to `MAX_EVENTS_BYTES + 1` and add the no-`attest`-dispatch /
  no-primitive-entry observation used at `:330-341`.

## 6. Claim-row packet for `P-v2` (V10) — exact result (Sol P1-08)

**s104 replacement prose (five normative lines, preserving the layout count `5 P-v2` at `claims.test.ts:1209-1235`):**

```
Raw events are bounded to 1048576 bytes and each serialized signed artifact to 262144 UTF-8 bytes;
producers check artifact size before signing, consumers before parsing the envelope. The bridge frame
limit (2097152 payload bytes plus framing) includes its outer envelope, and artifact strings carried on
the bridge are separately bounded to 262144 bytes (M6-AM12). Exact preimage and separate prefix-removal proof requirements are in
[`docs/m5-2-slice-5-plan.md` §3–§5](docs/m5-2-slice-5-plan.md#3-exact-version-2-transcript-and-envelope).
```

Apply identically to `SCHEMA.md:925-929` (inside the s104 markers) and to the independent copy in `claims.test.ts:310-314`
(`EXPECTED_SECTION`, a template literal — keep its existing backtick escaping, so "identically" means the rendered prose, not the raw
source bytes; Sol R2 P3); the whitespace-normalized equality at `:428` and the line-count layout at `:1209-1235` must stay green.
**Rows unchanged:** the canonical row `docs/m5-2-claim-evidence.md:154` and the machine row `claims.ts:292` are byte-for-byte
unchanged — their selector titles carry no number and their boundary text is value-agnostic; the P-v2 boundary test
(`claims.test.ts:883-910`) changes only its literals (`131072` → `1048576`, `131073` → `1048577`), not its title; no
`expectRuntime` / binding-row edits. No other span changes (s081/s082/s101–s103 describe unchanged types and preimages).

## 7. Docs in the same change (V11)

- **Normative, amended in place:** `docs/m6-implementation-plan.md:242` and `:272-273` and §4.3.1 item 4 (line ~401): new values
  + "amended by M6-AM12 (2026-09-08)"; the AM12 amendments-table row gets "implemented at <SHA>" at integration (owner).
- **Historical registers — APPEND ONLY** (Sol P1-09; conventions "registers are append-only"): do **not** edit existing lines in
  `docs/m6-review-findings.md` or `docs/m5-2-slice-5-review-findings.md`. Astra prepares an EOF addendum text for each
  (`docs/m5-2-slice-5-review-findings.md`: a mapping of the old mutant-kill commands at `:939-959,1207-1232` to the renamed
  titles/values; `docs/m6-review-findings.md`: a one-paragraph AM12 implementation note referencing lines 422, 468, 584–590,
  969–976) in the report; **the owner appends them at integration**.
- **Historical plan/handoff docs — annotate only:** `docs/m6-s5-handoff.md:343`, `docs/m5-2-slice-4-plan.md:45-51,83,118`,
  `docs/m5-2-slice-5-plan.md:44-46,99-109,197`, `docs/m5-2-slice-6-plan.md:611`, `PLAN-archive.md:657` — one bracketed
  "[values amended by M6-AM12, 2026-09-08]" note beside the old value; old measurements never rewritten.
- **V12 title-keyed selectors:** before renaming any test, audit `scripts/check-acceptance-j-results.mjs` and the review subprocess
  mutant profiles for title-based selectors; report; STOP if a gate keys on a title you must change.
- **V13 gate cost** (Sol R2 P2): on a literal clean clone of the base SHA and of the candidate, run `/usr/bin/time -l make test`
  three times each, alone on the host; report per run wall-clock and "maximum resident set size", and the median of each; assert
  timing-1 (5/5) and timing-2 (20/20) green in every run. Numbers are reported, not gated, in this slice.

## 8. Do not implement

Observation representation, prompts, batching, turns, `max_tokens`, model, N/Wilson/completion/leak gates, `assertEvalPass`,
E5, `MAX_CAPTURE_BYTES`, `MAX_CHUNK_BYTES`, the 5 s timer, any span other than s104, any row edit for `P-v2`, any register
line edit, compression/chunking/sidecar/partial attestation. No edits to `PLAN.md`, `.claude/`, or existing register lines.

## 9. File ownership, verification, report

Astra owns the files named in V1–V13 (source: `protocol.ts`, `handshake.ts`, `eventsDigest.ts`, `loginFixture.ts`,
`composedFixtures.ts` (constant use only); tests listed in §3.5 plus the new `testbed/checkers/offline.retention.test.ts` **and the
new `testbed/checkers/leakDecoders.nearcap.test.ts`** (Sol R3 P1-02); `SCHEMA.md:925-929`; `claims.test.ts:310-314` and the P-v2
boundary literals; `docs/m6-implementation-plan.md` normative lines; the annotate-only docs; **and `scripts/docker-invocation.mjs`
for exactly one additive `DOCKER_CAPABILITY_ALLOWLIST` row** — the V6 test's `node:child_process` import
(`scripts/docker-invocation.mjs:11-45,151-164` rejects any capability import whose exact file/specifier pair is absent; Sol R3
P1-01) — with the existing generic self-test (`scripts/docker-invocation.selftest.mjs`) run green; using the gate's documented
`process.getBuiltinModule` blind spot instead is forbidden).
STOP conditions: structural pin red; a second span; the 5 s timer not met at the exact cap on real Docker (report ms; never raise
the timer); V12 finds a title-keyed gate; any needed edit outside ownership.

```
npx vitest run testbed/agentEvidenceBudget.test.ts
npx vitest run testbed/docker/handshake.test.ts testbed/docker/frames.test.ts testbed/docker/composedFixtures.test.ts testbed/docker/slice5.attestation.test.ts testbed/docker/container/control.test.ts
npx vitest run testbed/fixtures/shared/eventsDigest.test.ts testbed/completion.test.ts testbed/parity/observe.test.ts testbed/checkers/offline.retention.test.ts
npx vitest run testbed/parity/claims.test.ts
npm run typecheck
make test
make test-docker      # owner runs; Docker step is user-authorized
```
Report `ASTRA-AM12-REPORT.md` at the worktree root: files changed; every bound with its exact value and positive control; V3 frame
numbers; V4 per-cell raw bytes; V5 three elapsed values; V6 numbers; V7 counters; every mutant's red assertion and restore; the
leave-alone literal list; prepared register addenda text; **Deviations From Handoff** mandatory; STOP conditions hit.

## 10. Residuals carried from AM12 §12

Key/hello bounds now exact (not delegated); the certifying witness certifies its pinned schedule only; V6 is a measurement, not a
proven heap bound; Docker latency unmeasured until V5 runs; the attest-request precedence change (`control-limit` before decode)
is a disclosed diagnostic change, not an admission change.

## 11. Sol pre-implementation R1 dispositions (owner, 2026-09-08)

| Finding | Owner verification | Disposition |
| --- | --- | --- |
| P1-01 v4 not relocked | Confirmed. | ABSORBED — v4 relocked to ADOPTED (title, status, Option A, §9 decisions, stale gate sentence removed); `docs/README.md` reconciled. |
| P1-02 `frame-length` impossible at 1.41 MB | Confirmed by Sol's recomputation (1,878,967 framed < 2,097,152). | ABSORBED — V3. |
| P1-03 key bound undefined | Confirmed (`handshake.ts:37-42` equality; 44-byte DER at `handshake.test.ts:11-19`). | ABSORBED — exact 44 / 59, precedence, no-reach observation. |
| P1-04 V4 schedule unpinned | Confirmed (`:99-110`, `:282-303`). | ABSORBED — pinned schedule, all six cells. |
| P1-05 V6 unpinned | Confirmed (`offline.ts:129-163` preload branch is real-profile only). | ABSORBED — named file, real-profile provenance path, branch proof, peak sampling, in `make test`. |
| P1-06 `composedFixtures.test.ts:154-175` missed | Confirmed. | ABSORBED — V9. |
| P1-07 codes / precedence / masking | Confirmed. | ABSORBED — §4 table, positive controls, no-reach observations. |
| P1-08 V9 not exact | Confirmed (rows value-agnostic; layout `5 P-v2`). | ABSORBED — §6 exact prose, rows unchanged, literals only. |
| P1-09 register edits vs append-only | Confirmed (`conventions.md:45-47`). | ABSORBED — §7 addenda prepared by Astra, appended by the owner. |
| P2-01 leave-alone inventory | Confirmed. | ABSORBED — V1 leave-alone list. |
| P2-02 V5 timing scope | Accepted. | ABSORBED — complete-call timing, three runs, headroom. |
| P2-03 V7 counters not on the result surface | Confirmed (`leakScan.ts:23-29`). | ABSORBED — test-only instrumentation; forbidden surfaces named. |
| B docs/README stale | Confirmed. | ABSORBED — reconciled by the owner. |
| H10 base SHA after companion | Accepted. | PENDING — §2 carries an explicit STOP placeholder until the owner pins the post-companion SHA (Sol R2 P1-04). |

## 12. Sol pre-implementation R2 dispositions (owner, 2026-09-08)

| Finding | Owner verification | Disposition |
| --- | --- | --- |
| P1-01 V4 snapshots after close | Confirmed: every witness's final call is `browser_close_session` (k=8/12; snapshots at 2,5 / 2,6,9). | ABSORBED — V4 schedule keeps the original close at response 15. |
| P1-02 V6 private-function proof | Confirmed (`offline.ts:117,222,317` private; only `completionVerifierFactory` is a seam). | ABSORBED — external oracle (readFile spy + verifier-factory ordering); `offline.ts` stays unowned. |
| P1-03 companion W1a not repinned | Confirmed (`realAgentRun.test.ts:439-441` has no filler). | ABSORBED — V9a. |
| P1-04 base SHA placeholder | Confirmed. | PENDING by design — explicit STOP placeholder in §2; §11 H10 row corrected. |
| P2 V6 process-history-sensitive memory | Accepted. | ABSORBED — child process, baseline/peak/interval/sample count. |
| P2 V7 seam unnamed | Accepted; `createEventWork` is exported (`leakDecoders.ts:50`) and called per event (`leakScan.ts:93`). | ABSORBED — named file and partial module mock. |
| P2 V13 procedure | Accepted. | ABSORBED — `/usr/bin/time -l`, three runs, medians. |
| P3 s104 copy escaping | Accepted. | ABSORBED — rendered-prose wording. |

## 13. Sol pre-implementation R3 (cap) dispositions (owner, 2026-09-08) — ladder closed

| Finding | Owner verification | Disposition |
| --- | --- | --- |
| P1-01 V6 child process trips the Docker-capability allowlist (`scripts/docker-invocation.mjs`) | Confirmed. | CORRECTED — §9 owns exactly one additive allowlist row; blind-spot route forbidden. |
| P1-02 §9 omits the V7 file | Confirmed. | CORRECTED — §9 names `leakDecoders.nearcap.test.ts`. |
| P2 V4 certifies only its constructed schedule | Accepted. | RESIDUAL (already declared in AM12 §12). |
| P2 V6 is a measurement, not a heap bound | Accepted. | RESIDUAL. |
| P2 V5 latency unknown until the real-Docker gate runs | Accepted. | RESIDUAL — the gate is the evidence. |
| P2 adaptive admission change | Accepted. | RESIDUAL — disclosed in the amendment. |
| P3 attest-request precedence diagnostic change | Accepted. | RESIDUAL — disclosed in §4. |
| P3 stale ladder label | Accepted. | CORRECTED — status paragraph. |
