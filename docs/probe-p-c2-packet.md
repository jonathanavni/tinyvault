# C2 packet — Probe P diagnostics: raw-series sidecar, twins, per-probe injected-bias controls, scoped D10 wording (rev 3.1, 2026-09-09 — cap-round owner corrections + the ledger-sequence fix after Astra's STOP)

Owner: Claude (continuity). Authorization: the user's 2026-09-09 adoption of
[`docs/probe-p-timing2-policy.md`](probe-p-timing2-policy.md) v2.1 §2.2 (C2), the normative text; this packet is its
implementation contract. **Rev 3** = rev 2 + the capped round-3 owner corrections (Sol R3: 4 P1 wording defects, 3 P2; register "C2 packet —
paper round 3 (cap)"); earlier revisions are in git history. Ladder: **Astra implementation** on
`codex/probe-p-c2` → Astra adversarial review + Claude QA/security review → owner gates → merge. Rounds capped at three.

**Deviations from v2.1 §2.2 that need the user's explicit acceptance before merge (each reasoned; none changes what
the gate certifies):**
- **D-1 (placement):** the diagnostic probes run **after** the family gate and the two existing controls, not
  "immediately after their siblings". Reason: pair-adjacency buys nothing for the paired statistic (every probe is
  its own `runProbeP` call); it *does* buy environment matching, and D-1 gives that up deliberately so that no
  diagnostic `runProbeP` runs before or between the six gated measurements. **Cost, recorded for the campaign:** the
  twins are not phase-matched to their siblings; a quiet twin beside a rejecting sibling is weaker evidence for
  "harness cleared" than the policy's Outcome text implies, and the campaign report must say so.
- **D-2 (who measures):** the cost measurement and the 1,000 µs stop rule are **owner gates before merge**, not
  implementer delivery conditions, because the Codex sandbox cannot launch Chromium.
- **D-3 (D10 exception):** the amended D10 sentence names `tripwire-batched-injected-bias-control` as the one
  existing diagnostic-shaped probe that *is* an acceptance criterion through its statistic (it already is, at
  `host.timing.browser.test.ts:369`), so the new sentence is true of the tree it lands on.
- **D-4 (one token in the gated real-click probe's timed window):** the real-click helper's arms are
  `…fill_from_vault(request).then(afterX)` where, for the gated probe and the twins, `afterA = afterB = NO_HOOK`
  (`const NO_HOOK = () => undefined`, file scope). The gated probe today measures `.then(() => undefined)`; after
  extraction it measures `.then(NO_HOOK)` — the same no-op arrow, referenced instead of literal, no extra call
  layer (Sol R3-2 rejected the `() => hook()` layer; this is the minimal form). Recorded here because "construction
  unchanged" would otherwise be one token false; A5 covers it and the owner's three pre-merge timing runs are the
  empirical check.

## 0. What this is and is not

- **Is:** diagnostics added *beside* the certified Probe P gate so that a rejection — and every quiet run — leaves a
  complete, raw, re-analysable record, plus the null and bias twins the campaign needs.
- **Is not:** any change to the six gated probes' construction (except D-4's referenced no-op), `runProbeP`, the Wilcoxon/Holm arithmetic, α, pair
  counts, the hard clause, the existing synthetic control's assertion, or the sensitivity-floor probe. The gate's
  assertions, statistic, thresholds and probe set are unchanged, and no diagnostic `runProbeP` precedes or
  interleaves the six gated measurements. **What does change:** module initialization (`beforeAll` gains one
  `mkdir` and one small stub write), a ledger `afterEach` that only stores a reference, and a longer pinned-source
  test; pre-C2 timing-2 runs are therefore context, not a comparable baseline — the campaign reports its own
  denominator.
- **No diagnostic can red `make test` through a statistic, and no diagnostic can mask a gated red.** Every
  mechanism below is written to those two rules; §2.6 lists the mutants that prove each.

## 1. Required reading

`CLAUDE.md`; `docs/probe-p-timing2-policy.md` §2.2–2.4; `docs/m4-slice-spec.md` D10 (418–448);
`testbed/probe/probeP.ts` (`ProbePResult` carries `aSamplesMs`, `bSamplesMs`, `differencesMs`; `assertProbeFamily`
is a pure function of a name→p map with `expected` names and throws a **non-exported** `ProbeFamilyError` whose
`.name === 'ProbeFamilyError'` and whose frozen `.details` has `alpha`, `rejected[]`, `ordered[]`);
`testbed/probe/probeP.test.ts`; `src/supervisor/host.timing.browser.test.ts` **at `4909ba8` (identical at
`ca43cd9`)**: constants 26–41, hooks 53–62, pinned-source test 96–120, six gated probes 122–325, family gate
327–336, synthetic injected-bias control 338–370, sensitivity floor 372–398, helpers 401–548 (`runTripwireBatch`
429, `spinForMicroseconds` 436, `report` 457), `TimingSessions` 523, ten lifecycle tests 590–734;
`src/supervisor/secretMatcher.ts:8-20` (`firstMatchingSecretTransform(bytes, canary, enabled)`),
`src/supervisor/tripwire.ts:163-174`, `src/shared/secretTransforms.ts` (`SECRET_TRANSFORM_NAMES`);
`src/supervisor/host.ts:469-479` (the real-click capture serializes `timingFillOutcome(payload).result`);
`testbed/docker/composed.docker.test.ts:32-45,277`; `scripts/test-execution.mjs:73-80`; `scripts/test-contract.mjs`.
Vitest 4.1.11 facts the design relies on (verified in `node_modules/@vitest/runner/dist/chunk-artifact.js`):
`afterEach` receives `{ task }`; the test's `result.state` is provisional when `afterEach` runs and final only after
all hooks; an exception in *any* `afterEach` fails the test it follows; root hooks run for nested suites; `sequence.hooks`
defaults to `stack`, so a later-registered `afterAll` runs earlier. The owner copies
`artifacts/review-evidence/tinyvault-m7-entry-20260909/packet-C-full-delivery.patch` into the worktree root as
`C2-prior-delivery.patch` (reusable material, not a contract).

## 2. Scope — implement

### 2.1 D10 wording amendment (docs; applied by the implementer; the owner writes the register entry)
In `docs/m4-slice-spec.md` D10, annotate in place (strike + replace, dated "amended 2026-09-09, user-authorized via
`docs/probe-p-timing2-policy.md` v2.1 §2.2, deviation D-3"): "the six probes of `host.timing.browser.test.ts` are one
family" → "the six probes named in `PROBE_NAMES` in `host.timing.browser.test.ts` are one family; further probes in
that file are **diagnostic** — written to the sidecar, never part of the Holm family, never an acceptance criterion
through their statistical outcome — **with one named exception: `tripwire-batched-injected-bias-control`, a positive
control whose required single-probe rejection is deliberately an acceptance criterion, named here so no future probe
inherits the exemption by analogy**". "Timing tests: 180 s per-test timeout, ≤ 10 min total on the reference
machine" is **unchanged** and read as timing-1 + timing-2 together.

### 2.2 Sidecar `.vitest/timing-2-probes.json`
- **Lifecycle.** `beforeAll`: `mkdir('.vitest', { recursive: true })` and atomically write
  `{ schema: 'timing-2-probes/1', complete: false, startedAt }`, overwriting any previous file (this is the only
  workload added before the gated probes). Sidecar `afterAll`, registered **after** the existing browser-closing hook
  (so it runs **before** it under stack ordering): read `chromium = browser.version()` (synchronous), compose, and
  atomically write the full record with `complete: true`, `writtenAt`. **This hook never throws**: one try/catch,
  failures `console.error`ed; on an atomic-write failure the fallback is one best-effort direct `writeFile` of
  `{ schema, complete: false, startedAt, writeError }` to the target path, itself inside try/catch (if that fails too,
  only the `console.error` remains and the `beforeAll` stub is what survives). Consumers (packet H) treat
  `complete !== true`, an absent file, or `writtenAt` earlier than the run's own start as **no sidecar for this run**.
- **Two maps, pinned.** `probeResults` and `report()` are touched only by the six gated probes. Diagnostics record
  through `recordDiagnostic(name, result)` into a separate `diagnosticResults` map that no gate reads. Source pins
  (each with an in-memory-mutation control, §2.6): `report(` occurs exactly **seven** times (the declaration line
  plus six call lines, each first argument a string-literal member of `PROBE_NAMES`); `probeResults.set(` occurs
  exactly once (inside `report`); `assertProbeFamily(probeResults,` occurs exactly once (the gated line, with the
  literal options `{ alpha: 0.01, expected: PROBE_NAMES }`); the recompute uses `new Map(probeResults)` with the
  byte-identical options; the identifier `diagnosticResults` never appears on the same line as `assertProbeFamily`
  or `probeResults`.
- **Ledger, non-throwing, finalized in `afterAll`.** A root `afterEach(({ task }) => …)` first takes
  `const sequence = ++ledgerSequence` (a module-level monotonic counter, so a sequence number is consumed whether
  or not the push succeeds — rev 3.1 correction after Astra's STOP: keying the sentinel by `ledger.length + 1`
  collided with the next successful row), then inside a try/catch: `ledger.push({ task, sequence })` — no
  assertion, no I/O, no serialization, no `expect`; the catch does `ledgerFailures.push({ task, sequence,
  message })` (the sentinel **retains the task reference**) inside its own try/catch and then `console.error`s.
  Composition matches a name first to `ledger` and then to `ledgerFailures` by `task`; if neither holds it, the
  entry is `missing: 'not reached'`. **Title → entry mapping, pinned:** every diagnostic `it` title is
  its entry name verbatim; the six gated probes, the synthetic control and the sensitivity floor keep their current
  titles and are mapped by a file-scope literal `TASK_TITLE_TO_ENTRY` (the eight titles exactly as at `4909ba8`),
  pinned by the source test. `afterAll` dereferences each `task.result` (final by then) and composes
  `entries` from the pinned literal name list: no ledger row → `missing`, reason `'not reached'`; final state `fail`
  → `error` with `errors[0].message`, **preserving any recorded result**; final `pass` with a recorded result →
  `measured`; final `pass` without one → `missing`, reason `'result not recorded'`; `skip`/other → `missing` with
  the exact state; a `ledgerFailures` sentinel at that sequence → `error`, reason `'ledger-failed'`. `sequence` is the 1-based
  index over **all** ledger rows in execution order (so the six gated probes are 2–7 after the pinned-source test);
  rows with no entry name (the pinned-source test, the family gate, the ten lifecycle tests) are dropped and
  counted as `otherTests`. Per-entry `startedAt`/`endedAt`/`durationMs` come from `task.result` timing.
- **Family verdict, recomputed, gated test untouched.** The gated family test is byte-identical to `4909ba8`.
  `afterAll` calls `assertProbeFamily(new Map(probeResults), { alpha: 0.01, expected: PROBE_NAMES })` inside
  try/catch and classifies structurally (the class is not exported and `probeP.ts` is not edited — this is
  deliberate, not a STOP): `error instanceof Error && error.name === 'ProbeFamilyError' && 'details' in error` with
  validated `details` (finite `alpha`, arrays `rejected`/`ordered`) → `family = { status: 'reject', details }`;
  normal return → `{ status: 'accept' }`; anything else (e.g. names mismatch because a gated probe never reached
  `report`) → `{ status: 'not-evaluated', reason: <message verbatim> }`.
- **Schema** (numbers verbatim; consumers key by `name`, never by index):
```
{ schema: 'timing-2-probes/1', complete: true, startedAt, writtenAt, partitionDurationMs, otherTests,
  commit: <.git/HEAD → ref → .git/<ref> → packed-refs, via fs only; null on any failure incl. a worktree's .git file>,
  node: process.version, chromium, pairs: 500, warmup: 20, alpha: 0.01,
  entries: [ { name, kind, sequence, startedAt?, endedAt?, durationMs?,
               status: 'measured'|'missing'|'error', reason?,
               result?: { pValue, z, effectSize, medianDiffMs, p95AMs, p95BMs, differencesMs, aSamplesMs, bSamplesMs },
               hardClause?: 'pass'|'fail', singleProbeFamily?: 'reject'|'accept',
               biasMicroseconds?, biasPlacement?: 'per-call'|'per-sample', batch? } ... ],
  family: { status: 'accept'|'reject'|'not-evaluated', reason?, details? } }
```
  `entries` order is **this literal list**, pinned: the six `PROBE_NAMES` in file order (`kind: 'gated'`);
  `tripwire-batched-injected-bias-control` (`control-synthetic`; `singleProbeFamily`, `hardClause`;
  `biasMicroseconds: 2, biasPlacement: 'per-call', batch: 64`); `sensitivity-floor` (`floorMicroseconds: number |
  null` — null when nothing rejected, never `Infinity`; `magnitudes: [4, 8, 16, 32]`; `results: [{ microseconds,
  pValue, medianDiffMs, singleProbeFamily }]`; no raw arrays); `tripwire-match-vs-no-match-aa`, `-sham`,
  `tripwire-real-click-match-vs-no-match-aa`, `-sham` (`twin-aa`/`twin-sham`); `tripwire-real-click-bias-250us`,
  `-1000us` (`control-real-click`, `biasPlacement: 'per-sample'`). **`singleProbeFamily` is the α = 0.01
  rank-1-of-1 outcome, not the campaign's bar; every `k_*` count is computed from raw `pValue` against 0.01/6.**
- **Residual, named:** no gate reads the sidecar; a regression that stops writing it reds nothing — the campaign's
  validity predicate (policy §2.3) is the only detector.

### 2.3 Helper extraction (the six gated probes must not drift)
Extract `tripwireTimingProbe(payloadA, payloadB)` (synthetic; **no hooks**) and
`realClickTripwireTimingProbe(payloadA, payloadB, { afterA = () => undefined, afterB = () => undefined })`:
- The helper performs setup; **pair invariants that hold for any pair** (equal `length`, equal
  `characterClassShape`, equal serialized length of `timingVaultResult` / `timingFillOutcome(...).result`); the
  `runProbeP` call with identical arguments (`pairs: 500, warmup: 20`) and setup callbacks; **exactly one
  `runTripwireBatch` (64 `list_vault` calls) per timed sample on the synthetic path, exactly one `fill_from_vault`
  per timed sample on the real-click path**; host/session finalization at the same boundaries (**synthetic:** the
  previous host finalized inside the next setup, the last after measurement; **real click:** one shared session,
  function-local `hostsToFinish`, then `sessions.closeAll()` → per host `settleEvidence(); drainEvidence();
  finish()`, all after `runProbeP`, inside the `it`'s 180 s timeout); the synthetic path's three spies installed
  before measurement and the `timedCallDeltas` all-zero assertion (the real-click helper installs **no** spies).
- The helper **never** calls `assertProbeHardClause` or `assertProbeFamily`, never takes a `gated`/`throw` flag,
  never catches. Pair-**in**equality is asserted by the caller. Gated bodies keep their `expect(() =>
  assertProbeHardClause(result)).not.toThrow()` and `report()` after the helper returns.
- Real-click hooks (D-4): both arms are `…fill_from_vault(request).then(afterA)` / `.then(afterB)` with the literal
  wrapper pinned; `NO_HOOK` for the gated probe and twins; no `() => hook()` layer anywhere. The synthetic helper has
  no hook (its per-call spin stays in the existing control's own body).
- **The existing synthetic bias control keeps its inline body** (per-call bias through `runTripwireBatch(host,
  afterCall)`, not the helper). Its only added statement is one call `recordDiagnostic(name, result, rejection)`
  placed **immediately after `rejection` is computed and before** the existing `expect(rejection).toBe(...)`, so the
  raw result is preserved on a failing run (policy §2.2.2); `recordDiagnostic` is a file-scope function whose body is
  entirely inside try/catch and cannot throw or alter its arguments (pinned by source; mutant: the try/catch removed
  → the pin reds). The `expect(rejection).toBe(...)` line is byte-identical to `4909ba8`. A5 extends to this test.

### 2.4 Twins (four probes, diagnostic; after the family gate and existing controls — D-1)
- `const NONMATCH2 = flatCopy(rotateFinalCharacter(NONMATCH));` pinned by exact source line; the bare-rotation
  form's absence pinned for `NONMATCH2` as it is for `NONMATCH`.
- **A/A twin** `<sibling>-aa`: `helper(CANARY, CANARY)`. **Sham twin** `<sibling>-sham`: `helper(NONMATCH,
  NONMATCH2)`; body asserts `NONMATCH2 !== NONMATCH`, `NONMATCH2 !== CANARY`, and, before any spy is installed,
  `firstMatchingSecretTransform(bytes, CANARY, new Set(SECRET_TRANSFORM_NAMES)) === null` (the full set — stronger
  than any runtime-enabled subset; `firstMatchingSecretTransform` *is* the tripwire's whole match predicate) for
  `bytes ∈ { JSON.stringify(timingVaultResult(x)), JSON.stringify(timingFillOutcome(x).result) }`, `x ∈ { NONMATCH,
  NONMATCH2 }` — four `null`s. Import `SECRET_TRANSFORM_NAMES` from `src/shared/secretTransforms` and re-run both
  boundary gates. **What the sham nulls, stated plainly:** no canary comparison runs inside the timed window
  (matching is reached only through `finish()`/`adjudicate`), so the sham removes only *byte content equal to the
  canary*; the campaign must not read `k_sham = 0, k_AB ≥ 2` as proof of a branch-dependent channel.
- Each twin: `pairs: 500`, `warmup: 20`, timeout `180_000`. **Body asserts only structural completion and
  payload invariants** via one allowlisted helper `assertFiniteProbeStatistics(result)` defined once at file scope
  and pinned by literal source (it may contain only `Number.isFinite` checks and `=== 500` length checks; no
  comparison to any other numeric literal, no `toBeLessThan`/`toBeGreaterThan`/`toBeCloseTo`), plus
  `diagnosticResults.has(name)`. `hardClause` and `singleProbeFamily` are recorded via `assertProbeHardClause` /
  `assertProbeFamily` on a one-entry map **inside try/catch** — outcome stored, never thrown. The statistic scan
  (§2.6) forbids the identifiers `pValue|medianDiffMs|effectSize|z|hardClause|singleProbeFamily` anywhere in a
  diagnostic `it` body except as the single argument of `assertFiniteProbeStatistics` or inside the file-scope
  `recordDiagnosticOutcomes(name, result)` helper (which computes `hardClause`/`singleProbeFamily` in try/catch and
  stores them; allowlisted by literal source).

### 2.5 Injected-bias controls, per probe
- **Synthetic (existing, gated):** assertion unchanged; recorded as in §2.3 (`singleProbeFamily` expected
  `'reject'` — the campaign's validity predicate — and `hardClause`).
- **Real-click (new, diagnostic)** `tripwire-real-click-bias-250us` / `-1000us`: `helper(NONMATCH, NONMATCH, {
  afterB: () => spinForMicroseconds(X) })` — one spin per timed sample, arm B only, after `fill_from_vault` resolves
  and before the wrapper promise settles (inside `runProbeP`'s window by construction). Structural-only assertions;
  outcomes recorded.
- **Mechanical controls (Node-only, deterministic, no statistic asserted):** (i) `spinForMicroseconds(1000)`
  consumes ≥ 900 µs of wall time (`performance.now()` delta; mutant: spin body emptied → red); (ii) an **ordering
  proof** over the actual wrapper shape: with a fake `fill_from_vault` that records timestamps, the hook runs
  exactly once per sample, only after the fill's promise resolved, and before the wrapper promise settles; and a
  `runProbeP` over that fake with `pairs: 8, warmup: 0` records `hook` invocations = 8 on arm B and 0 on arm A
  (`warmUp` runs both arms once per warm-up iteration, `testbed/probe/probeP.ts:154-159`, so `warmup: 0` keeps the count exact)
  (counts, not timings). Mutant: the hook moved outside the awaited chain → the "before settle" assertion reds. **No
  `medianDiffMs` band, no p-value, no timing band** — any such assertion would be a statistic gating the main
  partition. The spin lives in `testbed/probe/spin.ts` whose body is byte-identical to the timing file's local
  `spinForMicroseconds` (the gated file keeps its own definition; `spin.test.ts` reads both files with `fs`, never
  imports the browser test, and asserts the extracted function texts are equal; mutant: one edited → red).
- **Owner stop rule (D-2):** after delivery the owner runs the timing file three times; if the 1,000 µs control's
  `singleProbeFamily` is `'accept'` three times **while both mechanical controls are green**, the branch is held and
  the decision returns to the user (no probabilistic claim; the runs are not independent).
- Sensitivity-floor probe: unchanged; recorded per §2.2.

### 2.6 Pins, tests, mutants (Node-only unless stated)
- `probeP.ts`: **no edit**, including no export of `ProbeFamilyError`.
- Pinned-source test (line 96): every new predicate exercised **true on the real source and false on a named
  in-memory mutation**: `report(` = 7 with six literal `PROBE_NAMES` call lines (mutant: a call with a twin name);
  `probeResults.set(` = 1 (mutant: a `probeResults.set(` in a diagnostic body); `assertProbeFamily(probeResults,`
  = 1 with the literal options (mutant: options changed to `[...map.keys()]`); `diagnosticResults` never on a line
  with `assertProbeFamily`/`probeResults` (mutant: a merged map passed to the gated call); the `entries` literal
  order (mutant: two names swapped); diagnostic names absent from `PROBE_NAMES` (mutant: one inserted); the
  statistic scan with the allowlisted helpers (mutants: a threshold comparison inserted directly; the same inserted
  inside `assertFiniteProbeStatistics`; a second helper introduced; an `expect(...hardClause)` and an
  `expect(...singleProbeFamily)` inserted into a diagnostic body); the gated real-click probe's arms are
  `.then(afterA)`/`.then(afterB)` with `NO_HOOK` and no `() => hook()` layer anywhere (mutant: a layer inserted);
  the `TASK_TITLE_TO_ENTRY` literal matches the eight current titles; the `NONMATCH2` line and bare-rotation absence; the arm-B wrapper
  literal; helper bodies contain no `assertProbeHardClause`, `assertProbeFamily`, `catch` (mutants: each inserted).
- `testbed/probe/timing2Sidecar.ts` (pure composer + family classifier + floor entry + atomic writer) and
  `timing2Sidecar.test.ts`: the exhaustive composition cases of §2.2 (not reached; fail-with-result preserved;
  pass-with-result; pass-without-result; skip; ledger-failed); family classification of a genuine
  `ProbeFamilyError` (build one by calling the real `assertProbeFamily` with a rejecting map) vs a names-mismatch
  error vs an unrelated error; **the rejecting-diagnostic negative control:** a synthetic `ProbePResult` with
  `pValue: 0, medianDiffMs: 5` fed through the diagnostic recording path returns normally with
  `singleProbeFamily: 'reject'`, `hardClause: 'fail'` and throws nothing (mutant: the try/catch removed → red); a
  truncated result (499 samples) fails `assertFiniteProbeStatistics`; the `beforeAll` stub overwrites a
  pre-existing `complete: true` file; atomic write = `rename` from a temp path in the same directory (spy on
  `fs.promises.rename`), temp removed on failure, failure reported not thrown; `floorMicroseconds` null never
  `Infinity`; `.git/HEAD` chain incl. the worktree-file case → `null`; a **committed fixture sidecar** produced by the
  composer from synthetic inputs, asserted against the literal schema, so the reviewer sees the exact shape without
  Chromium; JSON round-trip of `details`. Mutants: drop `missing` marking; direct `writeFile`; omit
  `differencesMs`; `Infinity` floor.
- Timing-file mutants (**owner-run**, recorded): delete a twin's `it` → `missing`; sham arm B set to `NONMATCH` →
  `NONMATCH2` pin reds; a twin forced to `pValue: 0, medianDiffMs: 5` in memory → partition stays green, sidecar
  records `reject`/`fail`; the ledger push made to throw for one name → partition stays green, entry `ledger-failed` via the sentinel;
  the synthetic control's assertion forced red in memory → its raw result is still in the sidecar and the run is red
  with the original message; one
  gated `report()` dropped → `family.status: 'not-evaluated'` with the names-mismatch message, never `accept`;
  `expect(result.pValue)` added to a twin → scan reds; twin name in `PROBE_NAMES` → scan reds; `report()` with a
  twin name → count pin reds; helper given a hard-clause call → pin reds.
- The execution gate's skip count (exactly one, in `runner.eval.test.ts`) must not change; no conditional tests;
  both boundary gates pass; `timing2Sidecar.test.ts` + `spin.test.ts` wall time reported (they run in the main
  partition).

### 2.7 Cost (owner gate, D-2)
For each of three exact-candidate `make test` runs on the reference machine (the owner's Mac, host of every recorded
gate), measure the wall duration of each of the two timing Vitest subprocesses named in `scripts/test-contract.mjs`
and sum them within the run; **acceptance: `max(sum) ≤ 600,000 ms`**; timing-2 alone and per-probe durations (from
the sidecar) reported separately; standalone runs are context. Current per-probe durations at `4909ba8`
(`owner-gate-2-fixed-tree/timing-2.json`, quoted here so the implementer need not read a report): fill 6.7 s,
queued 6.4 s, reflection 6.3 s, synthetic tripwire 0.2 s, **real-click tripwire 17.4 s**, real-listener click
44.9 s, family 0.0 s, synthetic bias control 0.4 s, sensitivity floor 26.1 s; timing-2 total ≈ 170 s; timing-1 ≈ 5 s.
Expected C2 addition ≈ 2 × 0.2 s + 4 × ~17 s ≈ 70 s. Likely binding constraint: the 180 s per-test timeout on each
real-click diagnostic. If the criterion fails, the branch is held and the decision returns to the user.

## 3. Do not implement
No change to `runProbeP`, the statistics, α, pairs, warm-up, `PROBE_NAMES`, the hard clause, the gated probes'
construction beyond §2.3, the existing synthetic control's assertion, the golden vectors, `probeP.ts`, gate scripts,
`package.json`, `Makefile`, vitest configs, `.gitignore`; no env-gated or skipped tests; no spawn sites; no
counterbalancing of diagnostic order across runs (declared limit; twins share the gated probes' A-then-B warm-up and
cannot null a warm-up-order artifact).

## 4. File ownership
Owns: `src/supervisor/host.timing.browser.test.ts`, `testbed/probe/timing2Sidecar.ts`, `testbed/probe/timing2Sidecar.test.ts`,
`testbed/probe/spin.ts`, `testbed/probe/spin.test.ts`, `testbed/probe/fixtures/timing-2-probes.fixture.json` (all new
except the first), `docs/m4-slice-spec.md` (the D10 sentence only). Must avoid: `testbed/probe/probeP.ts`, everything
else. Register entry and status sentences ("timing-2 20/20" → the new count) are the owner's at integration.

## 5. Sandbox and verification
Implementer: type-check; run the Node-only tests, both boundary gates and the Node-only mutants; report the browser
file as **owner-run, unrun**. Owner: timing file three times (sidecar; durations; stop rule); forced family rejection
(A3), forced twin crash (A4), forced rejecting twin and ledger throw (A9); three `make test` runs on the candidate
(§2.7); merge; `make test` on the merged SHA (A1).

## 6. Acceptance
- A1 `make test` green on the merged SHA; §2.7 criterion met on the candidate.
- A2 On a passing run: `complete: true`; every expected entry `measured` with raw arrays of length 500 per arm
  **except `sensitivity-floor`** (statistics only); `family.status: 'accept'`; durations and sequence present;
  the six gated entries have `sequence` 2–7.
- A3 Owner-forced family rejection: the run is red exactly as before (same test, same message); sidecar written with
  `family.status: 'reject'` and full `details`.
- A4 Owner-forced twin crash: entry `error` with the message; gated probes unaffected; the twin test reds for the
  structural reason only.
- A5 Owner diff review of the six gated probes **and the synthetic bias control** against `4909ba8`: identical
  `runProbeP` arguments and setup callbacks; exactly 64 synthetic calls / one real fill per timed sample; spies
  and zero-delta assertion retained; finalization at the same boundaries; caller-owned hard clause and `report()`
  after the helper returns; no catch, family/hard-clause call or gate flag in either helper; the control's single
  added non-throwing statement before its byte-identical assertion; D-4's `.then(NO_HOOK)` as the only token change.
- A6 No diagnostic body asserts a statistic (scan + mutants). A7 D10 annotated as §2.1; time-limit sentence unchanged.
- A8 Both boundary gates PASS; tsc clean. A9 A rejecting diagnostic and a throwing ledger both leave the partition green
  and are recorded.

## 7. Reporting
Handoff format with **Deviations From Handoff** mandatory; the browser file marked unrun; the committed fixture
sidecar path named; measured Node-only test wall times.
