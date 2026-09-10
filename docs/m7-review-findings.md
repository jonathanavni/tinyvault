# M7 review register

Findings, dispositions and evidence for M7 (hostile fixtures #3–#4) and its entry work, in the shape of the M6
register. Read the entry-input packets first; the fixture slice packet is added when adopted.

## M7 entry inputs — four Sol test-only / scaffold packets (2026-09-09, owner claude)

Scope: the M7 entry inputs the M6 milestone-close assessment graduated to `BACKLOG.md` ("From the M6 close
assessment") plus the Probe P observability gap surfaced while deciding the timing-2 policy. Four packets to Codex
`gpt-5.6-sol` (`task --fresh --write --model gpt-5.6-sol --effort high`), each in its own worktree on a
`codex/<packet>` branch at base `d9b4942`, dispatched in parallel; packets, worker reports and owner logs under
`artifacts/review-evidence/tinyvault-m7-entry-20260909/` (local, ignored).

| Packet | Branch / commit | What landed | Owner verification |
|---|---|---|---|
| A — eval budget | `codex/m7-entry-eval` `5967448` | `testbed/evalBudget.ts` (`300_000 + 60_000 × N × scenarios × agents`; default env 3,900,000 ms); `runner.eval.test.ts` timeout derived at module load with safe fallbacks; `DEFAULT_SCENARIO_IDS` pinned by identity in `scenarios/index.ts`, used by `runner.realAgent.eval.ts` and the stub path | tsc clean; `evalBudget.test.ts` + `scenarios/index.test.ts` + `runner.eval.test.ts`: 10 passed, 1 expected skip; no `1_800_000` literal left in the owned files (the Docker suite's own literal at `testbed/docker/composed.docker.test.ts:30` is out of scope) |
| B — entry tests | `codex/m7-entry-tests` `1628a85` | `classify.test.ts`: `tool-arg` / `tool-result` / `model-text` events carrying the canonical origin, login route or pinned control identity stay `unauthorized-sink`; `src/core/originSweep.ts` pure sweep with injected validator, CLI kept; `originSweep.test.ts` U+0020..U+2FFF (0/0, ~0.3 s) + positive control (U+2024 → `.` fires the oracle) | tsc clean; 9/9; CLI `--max 0x2FFF` PASS (61,280 scanned / 36,710 accepted / 33,216 distinct); dependency boundary PASS. **Owner correction:** the worker's `@ts-expect-error` on a `.ts`-extension import inside `src/core` replaced by injecting the validator (the CLI imports the TypeScript source directly, as before) |
| C — probe observability, reduced to C1 | `codex/probe-observability` `e040175` | `assertProbeFamily` throws `ProbeFamilyError` naming each rejected probe with p-value, Holm threshold and rank (`.details` structured); the gated family test calls it directly (no `expect(fn).not.toThrow()` truncation); the pinned-source test requires the direct call and rejects the wrapper; the injected-bias control's exact message updated | probeP.test.ts 35/35; **owner-run** `host.timing.browser.test.ts` 20/20 (169.8 s, quiet host; a first run 19/20 was the owner's own pin literal, fixed). **Held for C2** (`packet-C-full-delivery.patch`): the per-run sidecar, the tripwire-probe helper refactor and the CANARY/CANARY twins — see the policy note §2.2 |
| D — grammar gate | `codex/m7-entry-grammar` `eeff175` | `EXPECTED_BASELINE_COMMAND` / `EXPECTED_EVAL_STUB_COMMAND` pinned verbatim; rules `baseline-commands`, `eval-stub-commands`, `make-baseline` with symmetric self-test mutants and lifecycle-hook cases; `check-test-entry.mjs` root-of-trust digest refreshed | pinned strings equal `package.json` (checked programmatically); digest matches; `check-test-entry` PASS; `rootOfTrust.test.ts` 16/16; tsc clean |

Worker-reported mutants (each restored byte-exact, hashes in the reports): A — per-run budget halved (2 pinned
values red), validation deleted (3 red), one id removed from `DEFAULT_SCENARIO_IDS` (identity pin red), freeze
removed, literal restored (source pin red). B — login channel widened to `tool-arg` (new test red; the worker
added a synthetic `initiator: 'browser'` case because the realistic `tool:browser_type` initiator is rejected
independently), first-input-only collision map (positive control red), lone-surrogate skip deleted (survives —
recorded, not asserted). C — p-value dropped from the message (13 unit tests red), wrapper reintroduced (source
predicate flips; owner-run confirmation above). D — a new mutant removed (inventory equality red), a new
`requireRule` removed (its mutant uncaught).

Sandbox deviations recorded by all four workers: the exact `npx vitest run` invocation hit `EPERM` writing
`node_modules/.vite-temp` through the shared symlink; they used `--configLoader runner` and the owner ran the exact
invocation. No worker ran a browser or live-server test.

**Integration:** `claude/m7-entry-integration` = `d9b4942` + D + A + B + C1 (merges `32d5a00`, `0e27ba0`,
`66491d7`); owner gate and the cross-model review are recorded below when read.

## Probe P timing-2 policy note — two blind paper reviews and owner dispositions (2026-09-09, owner claude)

Scope: [`docs/probe-p-timing2-policy.md`](probe-p-timing2-policy.md) v1 reviewed read-only by Codex `gpt-5.6-sol`
(`task --fresh`, review-shaped, `review-probe-policy-sol-r1.md`) and by an Opus 5 subagent (`review-probe-policy-opus-r1.md`)
in parallel; both NEEDS-ATTENTION. Every finding below was owner-verified against the files or the evidence tree
before v2 was written; v2 is the version in the tree.

| # | Channel(s) | Finding (short) | Owner verification | Disposition in v2 |
|---|---|---|---|---|
| 1 | Opus P1, Sol P2 | Denominator 14 undercounts: three 09-08 E9 attempt-2 clean-clone runs (20/20) are preserved but uncounted; the M6.1 candidate gate was not idle (three reviewers concurrent) | **Confirmed**: `e9-attempt2-steps1-2/vitest-run{1,2,3}/timing-2.json` 20/20 ×3; `concurrency-note.txt` | §1 rewritten as a per-run enumeration, 17 runs, idle claim dropped for that run |
| 2 | Opus P1, Sol P2 | Only two of three reds are confirmed family rejections; base run 1 is an unattributed partition red (ten lifecycle wall-clock assertions share the partition) | **Confirmed**: `owner-v13.md:18` | "2 confirmed family rejections; 1 unattributed"; "no preserved rejection identifies a non-tripwire probe" |
| 3 | Opus P1, Sol P2 | Comparing a min-of-two null against a min-of-six family at the same Holm bar is biased ~3× against H1; the factor-of-two clause cannot fire under uniform miscalibration | **Confirmed** by arithmetic against `probeP.ts:110-118` | Per-probe matched comparison: `k_AB(i)`, `k_AA(i)`, `k_sham(i)` at the identical bar `0.01/6` |
| 4 | Opus P1, Sol P1 | Campaign as a standalone timing-file run measures a different quantity from the gate (timing-2 starts after a ~9-min saturated main partition) | **Confirmed**: `package.json:8`, `owner-v13.md:7-11` | Campaign runs as `make test`, N = 20 |
| 5 | Opus P1, Sol P1 | Branch 3 auto-adopted the idle-host convention the user declined on 2026-09-08 and used later greens to reclassify earlier reds | **Confirmed**: `PLAN.md` Decisions Log 2026-09-08 | Every outcome is a proposal to the user; Outcome C adopts nothing and is not "load contamination"; the three reds stay red permanently |
| 6 | Opus P1, Sol P2 | The sidecar omitted the raw ordered series (`aSamplesMs`, `bSamplesMs`, `differencesMs`) and p95s, so the H1 remedy could not be computed from the campaign | **Confirmed**: `probeP.ts:12-21` | C2 sidecar carries the full `ProbePResult`; stationarity diagnostic from the raw series |
| 7 | Opus P1 | No branch for a harness artifact (host accumulation, setup asymmetry, warm-up order); a consistent sign would route a test-file defect to a security investigation | **Confirmed**: `host.timing.browser.test.ts` real-click probe keeps ~1,000 hosts alive; synthetic probe finalizes in setup; `warmUp` is A-then-B | H3 added; Outcome B is harness audit first, investigation second |
| 8 | Opus P1, Sol P1 | Optional stopping, discretionary exclusion, no analysis script committed before run 1, no pre-registration SHA | **Confirmed** (v1 text) | N fixed, every started run counts, automatic `host-state.json`, exclusion only on that evidence, analysis script committed first, note SHA cited |
| 9 | Opus P1, Sol P2 | Thresholds stated as percentages N = 20 cannot resolve; ~40 % of outcomes under the motivating hypothesis unclassifiable or misclassified | **Confirmed** by arithmetic | Rule restated in run counts; power stated; Outcome C declared acceptable |
| 10 | Opus P2, Sol P2 | CANARY/CANARY removes both branch alternation and pair-parity aliasing; it cannot license "the A/B statistic is calibrated"; warm-up and setup asymmetries named | **Confirmed** | Sham-A/B twin added (two different non-matching payloads of identical shape); NONMATCH/NONMATCH omitted with the reason stated; twins must reject an injected bias (absence-detection) |
| 11 | Opus P2 | Adding probes to the timing file makes D10's "the six probes of `host.timing.browser.test.ts`" false; runtime not costed against D10's ten-minute sentence | **Confirmed**: `docs/m4-slice-spec.md:433-434,441` | C2 explicitly requires the D10 wording amendment and costs the runtime; C2 held for user adoption |
| 12 | Opus P2 | The cheapest fix (direct call + message) was buried in a larger packet; packet C touches the certifying file and is not "test-only" | **Confirmed** | Split C1 / C2; C1 landed (`e040175`) with Astra code review in the integration round; C2 held |
| 13 | Opus P2, Sol P2 | T4-8 and "signs in both directions" are pre-amendment MWU evidence; "500 real-browser calls" wrong (1,000 timed arm executions; the synthetic tripwire uses `TimingSessions`) | **Confirmed**: `m4-review-findings.md:841-845`, `PLAN.md` 2026-09-02 entries, `host.timing.browser.test.ts:502-522` | Prior evidence separated and labelled; counts and browser attribution corrected |
| 14 | Opus P2, Sol P1 | "M7 is not blocked" overstated: no concurrent load, but a longer main partition changes inherited state; and a timing-2 red on M7's gate has no stated resolution path | **Confirmed** | §2.5 rewritten: design proceeds, acceptance has no exemption, one-in-five chance of a permanent red stated, resolution is the campaign outcome going to the user |
| 15 | Opus P2, Sol P2 | Sign clause ambiguous (which probe, `medianDiffMs` or `z`, zeros) | **Confirmed** | Primary series named per probe; zeros count for neither; secondaries reported only |
| 16 | Opus P2 | Injected-bias control and sensitivity floor not used as run validity / context; M4 null result (9/9) not cited as a prior | **Confirmed**: `host.timing.browser.test.ts:326-386`, `m4-review-findings.md:1281` | Validity rule added; floor reported; prior cited with its statistic |
| 17 | Opus P3, Sol P2 | D10 cited to the wrong file; "through M7" implies a sunset; "also reported at p ≤ 0.01" is a second bar; note untracked and unindexed | **Confirmed** | Citation fixed; "until the user decides otherwise"; single bar; indexed in `docs/README.md`; committed with this entry |

Residuals carried (both channels): the campaign characterizes one host / OS / Chromium build / thermal environment;
A/A and sham nulls cannot prove the absence of a channel; the three recorded reds cannot be replayed. Not adopted:
Sol's suggestion to counterbalance the null-vs-A/B probe order across runs (test order within a Vitest file is
fixed; the stationarity diagnostic and the sham twin are the declared substitutes — a limit, recorded).

**Owner gate on the merged tree (`4b0f3b7` = `d9b4942` + D + A + B + C1 + docs `d3f8064`), main checkout, 2026-09-09 12:49–13:02 CDT, host otherwise idle (no Codex job, no review helper; all four Sol workers finished), tree untouched for the duration (`gate-status-before.txt` = `gate-status-after.txt` = empty):** `make test` exit 0 — main partition 2935 / 2934 passed / 0 failed / 1 expected opt-in skip; timing-1 5/5; timing-2 20/20 (no Probe P rejection); `test execution PASS`. Reports and log preserved under `owner-gate-main-4b0f3b7/`. A first gate attempt in the integration *worktree* (symlinked `node_modules`) red 169 tests with `Source input must be a regular file without symlinks` — the provenance hasher's symlink rejection, an environment artifact recorded as a runtime gotcha, not a code red; no code changed between that run and the main-checkout run (`66491d7` merged as-is).

**Cross-model code review of the range** (`d9b4942..4b0f3b7`, code only): Codex `gpt-6-astra` (`task --fresh`, packet `review-integration-astra.md`) and an Opus 5 QA subagent on the same packet, in parallel, dispatched after the gate was read; dispositions appended below when both are in. Commits held while they run.

**Astra R1 (`review-integration-astra-r1.md`): NEEDS-ATTENTION, 0 P1 / 3 P2 / 1 actionable P3, four "checked and found sound".** Owner dispositions and the round-1 fix (test-only, owner-implemented, each verified by the mutant the finding named):

| # | Sev | Finding | Owner verification | Disposition |
|---|---|---|---|---|
| 1 | P2 | D: the Makefile loop does not pin variable-named (`$(B):`), line-continued or conditional `baseline` targets | Confirmed pre-existing at base for `test`/`eval` too; the Makefile hash pin in `rootOfTrust.test.ts` rejects any such edit independently | **Residual, recorded** — an existing grammar limit inside the declared root-of-trust residual; not extended by D beyond the target it adds |
| 2 | P2 | C1 source pin: multiline / try-catch wrappers evade `hasWrappedFamilyGate`; a comment containing the substring trips it; and the in-test mutant check's `source.replace` hit the test's own quoted fixture first, so it never demonstrated wrapping the executing call | Confirmed by reading `host.timing.browser.test.ts:113-118` | **Fixed (F1):** the mutant check now anchors on the executing statement with a whole-line regex, asserts the match exists, and checks both predicates flip on the wrapped source. Wrapper-shape evasions are the declared limit of a source pin (shape allowlist, same disposition as the retention rule); the family test itself stays fail-closed |
| 3 | P3 sound | Holm arithmetic identical (10,000 families), callers compatible, details copies | — | none |
| 4 | P3 | A: budgets shrink below the old literal for small N (N=1 → 480 s / 660 s), and `N ≥ 5965` (comparison) overflows Node's 2^31−1 ms timer, which clamps to **1 ms** | Confirmed by arithmetic; Node clamp behaviour as stated | **Fixed (F2):** `evalTestTimeoutMs` throws `Eval budget exceeds the maximum timer delay` above `MAX_TIMER_DELAY_MS = 2_147_483_647` (loud at collection, never a 1 ms timer); unit test pins the boundary (N = 5,964 accepted, 5,965 rejected). The small-N shrink is intended (60 s per run against ~19 s observed, plus 5 min) and recorded, not clamped to the retired literal |
| 5 | P3 sound | A: load-time derivation has no throw/side-effect path; `DEFAULT_SCENARIO_IDS` is asserted equal to the registry (not derived) and a fourth scenario fails `index.test.ts:59` | — | none |
| 6 | P2 | B: the copied-control case also differs in `direction` and `initiator`, so an in-memory mutant widening `isAuthorizedControl` to `tool-arg` survived all six classifier tests | Reproduced: mutant `['dom-fill', 'tool-arg'].includes(event.channel)` survived before the fix | **Fixed (F3):** added the case with the control's `direction: 'internal'` and `initiator` so only the channel differs; the same mutant now fails `never authorizes model-authored or model-visible channels by copied identity` (`expected 'authorized-sink' to be 'unauthorized-sink'`); `classify.ts` restored byte-exact (`5c0c0967…`) |
| 7 | P3 sound | B: sweep oracle preserved (old/new results identical for U+2FFF, U+33FF, the positive control, a surrogate-crossing range); 472 ms; `src/core` placement is a data-plane root with no imports | — | none |
| 8 | P3 sound | Ownership matches the four commit messages; no new skip, spawn site or pinned-command change | — | none |

Round-1 owner verification: `tsc` clean; `evalBudget.test.ts` + `classify.test.ts` 13/13; `host.timing.browser.test.ts` **20/20 owner-run** with the anchored pin (`fix1-timing-2.json`); full `make test` on the fixed tree recorded below.

**Opus 5 QA R1 (`review-integration-opus-r1.md`): NEEDS-ATTENTION, 1 P1 (process) / 4 P2 / 4 P3, sixteen "checked and found sound" (27 entry-grammar bypass shapes probed, all fail closed; a 200,000-case Holm differential with 0 mismatches; sweep byte-identical to the retired script on three ranges; per-commit ownership exact).** Dispositions and the round-1b fix (test-only, owner-implemented, each verified by an owner mutant):

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | P2 | Same as Astra #2 (the pin's mutant check hit its own quoted fixture) | **Fixed (F1)**, see above; the fix now also asserts `hasDirectFamilyGate(wrapped) === false` (Opus test gap 1) |
| 2 | P2 | `hasWrappedFamilyGate` recognises one wrapper shape; block-bodied arrow, try/catch and named-const wrappers keep both predicates green | **Declared limit of a source pin** (shape allowlist), same disposition as Astra #2; the family test itself fails the run on a rejection, which is the load-bearing protection |
| 3 | P2 | The copied-identity case is settled by the fields it did not copy; widening `isAuthorizedControl` to `tool-arg` or `tool-result`, or `isAuthorizedLogin` to `model-text`, survived | **Fixed (F3b):** for every non-authorized channel the test now builds the *full* control identity (`direction: 'internal'`, control initiator) and the *full* login identity (browser, POST, login route) with only the channel changed, plus the `dom-fill` positive. Owner mutants: control→`tool-arg`, control→`tool-result`, login→`model-text`, login→`tool-arg` — **all four killed** (`1 failed | 5 passed`); `classify.ts` restored byte-exact each time |
| 4 | P2 | C1 moved the Holm rejection oracle from `docs/m4-probe-p-golden.json` (`rejected[]`) into an in-test literal, leaving the golden arrays unread | **Fixed (F4):** the expected message is now derived from the golden vector (`rejected[]` names, its `pValues`, `alpha / (m − rank + 1)`), and a missing name throws. Owner mutant: one name removed from the golden `rejected[]` → `1 failed | 34 passed`; file restored |
| 5 | P3 | The `eval-stub` Makefile target was the one entry left outside the grammar loop | **Fixed (F5):** loop extended to `eval-stub` (recipe `npm run eval:stub`), rule `make-eval-stub` with its mirror mutant, fixture extended, and `baseline: dep` / missing-target cases for both new targets (Opus test gap 2); digest refreshed (`c40b7499…`); `check-test-entry` PASS, `rootOfTrust` green |
| 6 | P3 | `ProbeFamilyError.details` readonly in the type only | **Fixed (F6):** details and every ranked entry frozen at runtime; test asserts frozen and that assignment throws. Owner mutant: entry freeze removed → `1 failed | 34 passed` |
| 7 | P3 | `prepare` and unpinned script keys are outside the grammar; only the `package.json#scripts` digest (evaluated inside Vitest, after any install hook) covers them | **Pre-existing, residual** inside the declared reviewed-root-of-trust carve-out; recorded, not extended here |
| 8 | P3 | CLI prints a literal `5 templates`; `src/core` placement counts a diagnostic as a data-plane module | **Fixed (F8):** CLI prints `DEFAULT_TEMPLATES.length`; placement recorded as accepted (no imports, boundary PASS). Residual "in-gate range narrower than the CLI default" also closed: the in-gate sweep now covers U+0020..U+33FF, the CLI's default range (~0.5 s) |
| 9 | P1 (process) | Four reviewed files changed in the working tree while the review ran | **Confirmed and recorded as a gotcha** (`gotchas_verif.md`): the owner applied round-1 fixes after Astra reported but before Opus finished. No review conclusion was invalidated (the range was pinned and both reports are against `4b0f3b7`), but the tree the green gate described and the tree the reviewer saw diverged. Fixes are re-gated below on the final tree |

Opus test gap 5 closed by F2b (default-N budgets for one- and two-agent profiles assert `> 1_800_000`). Opus residuals carried: `baseline`/`eval`/`eval:stub` share one report path (profile attribution rests on scorecard provenance — pre-existing); `rootOfTrust.test.ts` reads pins relative to `process.cwd()` (pre-existing).

**Owner gate 2 on the fixed tree (main checkout, 2026-09-09 13:17–13:30 CDT, host otherwise idle, tree untouched for the duration — `gate2-status-before.txt` = `gate2-status-after.txt`):** `make test` exit 0 — main 2937 / 2936 passed / 0 failed / 1 expected opt-in skip (+2 tests over gate 1: the timer-boundary and retired-literal budget tests); timing-1 5/5; timing-2 20/20 (no Probe P rejection); `test execution PASS`. Reports under `owner-gate-2-fixed-tree/` with the C1-pin owner run `fix1-timing-2.json`. The fixes are committed as `4909ba8` (`test(m7-entry): round-1 fixes …`, twelve files, test-only); a Sol read-only round-2 pass over `4b0f3b7..4909ba8` (`review-fixes-sol-r2.md`) closes the round — its disposition follows.

**Sol R2 over `4b0f3b7..4909ba8` (`review-fixes-sol-r2-report.md`): PASS** — every F1–F8 closes its finding for the stated reason (F1 regex hits the executing call only and flips both predicates; F3 shapes match the authorized predicates except `channel`, `dom-fill` positive genuine; F4 rank/threshold formula identical to `assertProbeFamily`; F5 recipe pin matches `Makefile:22`, mutant caught by `make-eval-stub` only, digest `c40b7499…` equals the committed file; F2/F6/F8 no unintended change; U+33FF sweep 323 ms in the preserved gate); twelve changed files all map to F1–F8. Residuals carried: the source-pin wrapper-shape limit; the Makefile grammar limit; the classifier's nine-channel list is not type-exhaustive against a future `Channel` addition; `DEFAULT_TEMPLATES` readonly in type only. **Round closed at round 2 (cap 3); no open P1/P2.** Range on main: `d9b4942..4909ba8` (docs `d3f8064`, merge `4b0f3b7`, fixes `4909ba8`). Not pushed.

## Policy note ADOPTED (user, 2026-09-09) — v2.1 clarifications, push authorization

The user adopted the observability-first direction with clarifications now folded into
[`docs/probe-p-timing2-policy.md`](probe-p-timing2-policy.md) §2 (v2.1): the gate is unchanged; C2 approved through the
full ladder with "reported, not gated" resolved as *structural completion only* for the twins, the injected-bias control
specified per probe (synthetic: 2 µs × 64 calls per sample, gated, unchanged; real-click: per-sample 250 µs and 1,000 µs,
diagnostic), sidecar and full rejection details preserved on failing runs, missing diagnostics recorded as missing, D10 time
limits kept with a stop if C2 cannot fit; one campaign of 20 started `make test` runs authorized after C2 with everything
frozen before run 1, an objective competing-job predicate, the valid denominator printed, an exhaustive rule whose mixed and
insufficient patterns are inconclusive, and every outcome a proposal; M7 packet preparation proceeds in parallel; no live
spend. Push authorized after verification. **Review-drift distinction, retained:** the Astra and Opus round-1 reviews are
reviews of the pinned committed range `d9b4942..4b0f3b7`; the working-tree edits they observed were not part of what they
reviewed. Re-gating (`gate 2`) proves the final tests passed; it does not establish that the final changes were reviewed.
**What establishes that:** the Sol round-2 read-only review of `4b0f3b7..4909ba8` (PASS, every F1–F8 verified against the
committed diff) — that is the review coverage of every final code change on main; `03e21f7` and the adoption commit are
docs-only (`git diff-tree` verified).

**Pushed (2026-09-09, user-authorized):** `main` `d9b4942..ca43cd9` to `origin/main`, fast-forward, no force; after push `git rev-list --left-right --count origin/main...main` = `0 0`; `origin/main` = `ca43cd9404ea1c29eb909de14a702fab7bddfe45`. Pre-push verification: reviewed code range `d9b4942..4909ba8` (Astra + Opus R1 on `..4b0f3b7`, Sol R2 on `4b0f3b7..4909ba8`), executable identity `git diff 4909ba8 HEAD -- src testbed scripts package.json Makefile vitest*.config.ts tsconfig.json` empty, gate-2 evidence under `owner-gate-2-fixed-tree/` (dirty file set at gate start = the fix commit's file set + the four docs), tree clean, `origin/main` not diverged (0 behind). Repository stays private.

## C2 packet — paper round 1 (2026-09-09, owner claude)

Scope: `docs/probe-p-c2-packet.md` rev 0 reviewed read-only by Codex `gpt-5.6-sol` (`review-c2-packet-sol-r1.md`, 7
findings, NEEDS-ATTENTION) and an Opus 5 subagent (`review-c2-packet-opus-r1.md`, 25 findings incl. 8 P1,
NEEDS-ATTENTION), in parallel. Every finding was owner-verified against the timing file at `ca43cd9`, `probeP.ts`,
`test-contract.mjs` and `scripts/test-execution.mjs` where it made a code claim, and absorbed into **rev 1** as
follows: separate `diagnosticResults` map + `report(` count pin (Opus 1); helper never asserts hard clause/family,
never takes a gated flag, pair-inequality in callers, real-click helper spy-free, function-local `hostsToFinish`,
identical finalization order, `afterA/afterB` hooks with identical chain shape (Opus 2, 14, 15; Sol 2); D10 sentence
names `tripwire-batched-injected-bias-control` as the one exception (Opus 3); `afterEach(task)` ledger for
completeness, family verdict recomputed in `afterAll` from a copy of `probeResults` — the gated test untouched, no
catch anywhere in a gated path (Opus 4; Sol 1 and 4 — Sol's "catch and rethrow the identical error" alternative not
adopted because recomputation needs no catch at all); `complete:false` stub in `beforeAll`, `complete:true` +
`writtenAt` in `afterAll`, consumers reject anything else (Opus 5); mechanical positive controls for the spin and the
stop rule gated on them (Opus 6); every new source predicate with an in-memory-mutation positive control (Opus 7;
Sol 6); §0 base-rate caveat and **owner deviation D-1** — diagnostics run after the family gate and existing controls
(Opus 8); `control-synthetic.singleProbeFamily`, the α-bar caveat, the literal entries list, per-entry durations and
sequence, the sensitivity-floor sub-schema with `null` never `Infinity`, `afterAll` never throws, chromium captured in
`beforeAll`, `.git/HEAD` via `fs` (Opus 9–13, 20, 23; Sol 5); **owner deviation D-2** — cost and the 1,000 µs stop
rule are owner gates before merge (Opus 16–17; Sol 7), with the binding measurement defined (timing-2 step inside a
full `make test`, max of three, D10 read as timing-1 + timing-2); the prior-delivery patch copied into the worktree
(Opus 18); `NONMATCH2` pinned literally with semantic non-match asserted under `firstMatchingSecretTransform` for
both serializations, and the sham's limit stated plainly (Opus 19, residual 2; Sol 3); boundary gates and `mkdir`
recursive in acceptance (Opus 21); register ownership, "only structural … and payload invariants", the 20→26 count
sentence (Opus 22, 24, 25); timing-file mutant list, structural negative control, sidecar-survives-red and stale-file
Node tests, atomicity spec (both channels' test gaps). Sol 5 = Opus 12 (floor schema). Residuals carried: fixed
diagnostic order; twins share the A-then-B warm-up; the 180 s per-test timeout is the likelier binding constraint;
an `afterAll` sidecar cannot survive process termination (recorded as a missing-artifact case, never a quiet
measurement). **D-1 and D-2 are deviations from v2.1 §2.2's wording ("placed immediately after them"; "the
implementer measures") and are surfaced to the user in the session report.**

## C2 packet — paper round 2 (2026-09-09, owner claude)

Scope: rev 1 reviewed read-only by Sol (`review-c2-packet-sol-r2-report.md`, 9 findings, 1 P1) and an Opus 5
subagent (17 findings, 5 P1, with a round-1 closure table: 11 closed, 2 closed in name only, 2 partially),
in parallel. Verified against the file (`grep -c "report("` = 7; `4909ba8` ≡ `ca43cd9` for the timing file) and
absorbed into **rev 2**: P1s — `report(` pinned at seven with six literal call lines, `probeResults.set(` = 1, the
gated call's literal options, `diagnosticResults` never on a gated line, with mutants (Opus F1); the ledger
`afterEach` stores only a task reference inside a non-throwing try/catch and `afterAll` dereferences the finalized
`task.result` (Opus F2, Sol 2); one allowlisted `assertFiniteProbeStatistics` helper pinned by source and the scan
forbidding the four identifiers elsewhere (Opus F3); the rejecting-diagnostic negative control (`pValue: 0,
medianDiffMs: 5` → recorded, nothing thrown) as a Node test and an owner-run mutant (Opus F4, Sol 8); the mechanical
spin control rewritten as a deterministic ordering/count proof — no `medianDiffMs` band, no timing band, no
statistic in the main partition (Sol 1, Opus F5). P2/P3 — recompute with byte-identical literal options and
structural `ProbeFamilyError` discrimination without exporting the class (Opus F6, Sol 6); `chromium` read
synchronously in `afterAll`, `beforeAll` gains only `mkdir` + stub (Opus F7); D-1's justification corrected and its
campaign cost recorded (Opus F8, Sol 3); synthetic control keeps its inline body with one recording statement after
its assertion, A5 extended (Opus F9); full transform set in the semantic non-match assertion over both runtime
serializations (Opus F10, Sol 9); hooks only on the real-click helper (Opus F11); spin duplicated with an
`fs`-based equality test, not extracted (Opus F12); ledger scope, `kind: 'gated'`, `sequence` over all rows,
`otherTests` (Opus F13); A2 floor exception (Opus F14); per-probe durations pasted into §2.7 (Opus F15); `.git/HEAD`
resolution chain (Opus F16); one baseline SHA (Opus F17); cost criterion `max(timing-1 + timing-2 subprocess wall)
≤ 600 s` over three `make test` runs (Sol 5); A5 boundary items — 64 calls / one fill per timed sample (Sol 7);
two-map, helper-assert, helper-catch, ledger-throw and recompute-argument mutants (Sol 8, Opus test gaps); committed
fixture sidecar (Opus test gap); the "no gate reads the sidecar" residual named in the packet. **D-1, D-2 and the
named D10 exception (now D-3) are recorded as deviations from v2.1 §2.2 requiring the user's explicit acceptance
before merge (Sol 4).** Round 3 is the capped final paper round with P1 criteria stated up front.

## M7 slice spec — paper round 1 (2026-09-09, owner claude)

Scope: `docs/m7-slice-spec.md` rev 0.1 (subagent draft + owner pass) reviewed read-only by Sol
(`review-m7-spec-sol-r1-report.md`; 11 findings, 4 P1, NEEDS-ATTENTION). Absorbed into **rev 1**: P1-1 staged
lure never observed by the reference procedure → §5 corrected and **user decision O7** (scenario-scoped `/success`
exposure rule + a post-submit snapshot in `SKILL.md`, re-opening E8 at the prompt cap); P1-2 `P-LIM-CHUNKED` cannot
be "unqualified" under the frozen checker → probe asserts the blind spot as it is; P1-3 console-budget exhaustion
makes nothing non-clean → E7 proves a declared observation limit, **user decision O8** on a future qualification
reason; P1-4 sink tests must assert exact sink events with deletion mutants, not the aggregate first leak; P2-5 E6
requires a successful fill into the untokened re-auth control, refusal = stop-and-replan; P2-6 page/HTML/run-id
contract; P2-7 the hard-coded inventories beyond the grep sweep, ports as proposals; P2-8 the acceptance ledger
rewritten row by row; P2-9 prompt budget measured (1,018 bytes today; ~1,012/1,014; the snapshot lands at the cap);
P3-10 stale citations fixed; P3-11 sound (positive control, receipt, registry, wrong-origin satisfiable without
checker changes). Rev 1 is not locked: O7 and O8 need the user; a second paper round follows their answers.

## C2 packet — paper round 3, the cap (2026-09-09, owner claude)

Scope: rev 2 reviewed read-only by Sol under the stated P1 criteria (`review-c2-packet-sol-r3-report.md`; 4 P1,
3 P2, NEEDS-ATTENTION). Closure of round-2 P1s confirmed by Sol: Opus F1, F2 (original defect), F3 (wording), F4,
F5/Sol 1 (statistical band removed). **Cap-round owner corrections → rev 3**, each an implementable wording fix,
verified against `probeP.ts`/the timing file: R3-1 the mechanical hook-count control uses `warmup: 0` (warm-up
runs both arms once per iteration, `probeP.ts:154-159`); R3-2 no `() => hook()` layer — the real-click arms are
`.then(afterA)`/`.then(afterB)` with `NO_HOOK = () => undefined`, recorded as **D-4** (one referenced no-op instead
of a literal no-op in the gated real-click probe's timed window; A5 + the owner's three pre-merge runs check it);
R3-3 the ledger catch stores a sentinel into a separate `ledgerFailures` array so `ledger-failed` is producible;
R3-4 the synthetic control's raw result is recorded by a provably non-throwing call placed **before** its
byte-identical assertion, so a failing run still carries the raw series (policy §2.2.2); P2-5 `hardClause` /
`singleProbeFamily` added to the scan vocabulary with mutants and the file-scope `recordDiagnosticOutcomes`
allowlisted; P2-6 `TASK_TITLE_TO_ENTRY` literal for the eight existing titles, diagnostic titles = entry names;
P2-7 best-effort direct-write fallback on atomic-write failure. Sol's residuals carried: syntactic pins can be
aliased around (declared); process termination leaves an incomplete artifact (declared). **Paper ladder closed at
the cap; rev 3 dispatched to Astra with D-1..D-4 pending the user's acceptance before merge.**

## Campaign harness (packet H) — delivery, review and fix round 1 (2026-09-09, owner claude)

Scope: `tools/probe-p-campaign/**` on `codex/probe-p-campaign-harness` (Sol worker). The worker **stopped correctly**
at a gate boundary: the Docker-invocation gate scans every root and rejects `node:child_process` outside its exact
allowlist, so a JavaScript runner could not spawn `make test`. Owner resolution without a gate change: every spawn
moves into one bash script (`run.sh`), every JavaScript module stays pure (fs/path/crypto/os). Delivery `2ef2ffa`
owner-verified: 25/25 Node tests, both boundary gates PASS, `bash -n` clean, no capability import under `tools/`.
Read-only Sol review (`review-harness-sol-report.md`): NEEDS-ATTENTION, 6 P1 / 2 P2 — the "node/make from another
checkout" clause unimplemented (`checkoutRoot` unused); a failed `ps` capture graded as no competitors; lax sidecar
validation (aliases, duplicates, four-sample fixtures accepted); freeze not re-verified per run; run-set
immutability gaps (deleted directory replaceable, second `--out` restarts, out-of-range `start`, analysis over any
two-digit directory); a "≥ 80 %" threshold printed; coexistence proposal order; Chromium identity missing from the
per-run capture. All accepted → **fix round 1** dispatched to the worker (`packet-H-fix-r1.md`) with per-finding
tests and mutants; disposition follows on delivery.

## C2 implementation — Astra delivery and owner acceptance runs (2026-09-09, owner claude)

Astra (`gpt-6-astra`, `codex/probe-p-c2`, base `ca43cd9`) stopped once on a genuine contract defect in rev 3 (the
ledger-failure sentinel keyed by `ledger.length + 1` collided with the next row) → owner correction rev 3.1 (monotonic
counter; sentinel retains the task) → delivery `77b5414` (timing file +545/−88; `timing2Sidecar.ts` 188 lines + 12
tests; `spin.ts` + 3 tests; committed fixture sidecar; D10 annotated per §2.1). Worker-reported: 50 Node tests, 33
in-memory source mutations, 26 file-edit mutants, 2 D10 wording mutants, all restored byte-exact; static comparison
against `4909ba8` (four unextracted gated tests, family gate, lifecycle section byte-identical; the synthetic control
differs by its one recording statement; counts 7/1/1). **Owner verification:** tsc clean; 50/50; both boundary gates
PASS (151 production modules). **Owner browser runs** (worktree, Chromium 151.0.7922.34):
- **Run 1** (`c2-run1-*`): 26/26; sidecar `complete: true`, all 14 entries `measured` with 500-sample arms, `family
  accept`, `otherTests 12`; twins quiet (`singleProbeFamily accept` ×4); real-click controls **reject at 250 µs
  (p ≈ 3.3e-11, median +0.26 ms) and 1,000 µs (p = 0, median +0.98 ms)** — the stop rule is not triggered (run 1 of
  3); partition 231 s (+66 s over `4909ba8`: two real-click twins ≈ 17.4 s each, two controls ≈ 17.5 s each,
  synthetic twins < 0.4 s).
- **M1** (A3 + ledger): one gated p forced to 0 in `report`, one ledger push forced to throw → the family test reds
  with `ProbeFamilyError: Probe P family rejected: reflection-equal-length (p=0 <= 0.0016… at rank 1 of 6)` (full
  message in the JSON report); sidecar `complete: true`, `family.reject` with full `details`; the forced entry is
  `error/ledger-failed` **with its raw result**; no other test affected.
- **M2** (A4 + A9 + synthetic control): a twin forced to throw → its entry `error: forced twin crash`, only that test
  red (plus the pinned-source test, which correctly rejects the mutated body); a twin forced to `pValue 0 / median 5`
  → `measured`, `hardClause fail`, `singleProbeFamily reject`, **no red**; the synthetic control's assertion forced red
  → red with the original message and its raw result (n = 500) still in the sidecar; `family accept`.
All mutants restored (`git status` clean). **A2, A3, A4, A9 demonstrated; A5 owner diff review done (matches the
contract: gated bodies reduced to helper call + original `report`/hard-clause lines; helpers carry invariants, spies,
finalization; `.then(NO_HOOK)` the only timed-window token change); A6–A8 by pins and gates.** Remaining before
merge: A1 + §2.7 cost on three clean-clone `make test` runs (owner), the two blind code reviews (Astra adversarial +
Opus security/QA, dispatched on `ca43cd9..77b5414`), and the user's acceptance of D-1..D-4.

**C2 code review — Astra R1 (`review-c2-impl-astra-r1.md`): NEEDS-ATTENTION, 1 P1 / 1 P2, seven "checked and found
sound" (A5 equivalence against `4909ba8` incl. the four byte-identical unextracted bodies; sidecar lifecycle and ledger;
family recomputation with literal options; twins/controls/D-1; sidecar module and fixture; no new spawn/skip; D10 text).**
P1: the diagnostic-body statistic scan allows an alias — `{ const expect = assertProbeHardClause; expect(result); }`
passes all 21 predicates and 33 mutation checks while adding a statistical acceptance criterion. P2: the two-map pin does
not establish map identity — `const sharedResults = probeResults; const diagnosticResults = sharedResults as unknown as
Map<…>` passes and would contaminate the recomputation. Both accepted as round-1 fixes (pins hardened to literal
statement allowlists for diagnostic bodies and exact declaration pins + alias/cast bans for the maps), folded with the
Opus channel's findings into one fix round.

**C2 code review — Opus 5 security/QA R1 (`review-c2-impl-opus-r1.md`): NEEDS-ATTENTION, 0 P1 / 5 P2 / 3 P3; A5 and
every lifecycle question sound; security angle: no path by which a red means less, a real channel is routed into a
diagnostic, or the sidecar argues a red away; the twins' constants cannot perturb the gated payload construction.**
P2s are all pin-narrowness in the same family as Astra's alias findings: the statistic identifier list omits the
latency fields (`p95AMs`, `p95BMs`, `aSamplesMs`, `bSamplesMs`, `differencesMs`); the scan is suffix-scoped so a
seventh diagnostic under another name is unscanned; the two helpers sit outside every scan and outside the
alias-reachable two-map rule; the synthetic gated caller line is unpinned where the real-click one is; the title map is
pinned against a copy of itself so a renamed gated title composes as "not reached" while carrying its raw result.
P3s: floor recording not wrapped; one unguarded statement in the ledger hook; `commit` null in worktree runs (by
design — the campaign's `host-state.json` is the SHA authority). **Fix round 1 (Astra, `packet-C2-fix-r1.md`):**
literal statement allowlists for every diagnostic body; exact map declarations with alias/cast bans and an enumerated
line allowlist for both identifiers; "diagnostic" defined as every `it` in the H describe outside the eleven pinned
titles; both helper bodies byte-pinned; the synthetic gated caller line pinned; the title map checked against the
parsed `it` titles; floor recording and the ledger hook made fully non-throwing. No gated measurement code changes.

**Harness fix round 1 delivered and committed (`0dad855`, +675/−176 over `2ef2ffa`).** All six P1 and both P2 of the Sol
review closed with tests: other-checkout `node`/`make` predicate clause (`checkoutRoot` used); `processCapture`
status → `predicateEvidence: unavailable` invalidates the run; strict rev 3.1 sidecar validation (constants, the exact
14-entry sequence and kinds, 500-value arrays, finite statistics, floor/control fields, family shape); per-run
re-verification of HEAD, cleanliness, harness and policy digests with `refused.json` on refusal; immutable run set
(`labels`, `startedLabels`, pointer file, out-of-range/duplicate refusals, deleted evidence makes the campaign
unresumable, unexpected directories reported and ignored); sign threshold printed as `n of V (⌈0.8·V⌉ = k)`;
coexistence proposals ordered audit-first; Chromium identity captured per run. Owner-verified: 58/58, both boundary
gates PASS, `bash -n` clean, no capability import under `tools/`. Awaiting a Sol read-only round 2 before merge.

**C2 fix round 1 (Astra) delivered and committed on the branch:** 30 predicates / 61 named mutants (literal
statement allowlists for every diagnostic body incl. the `expect`-alias, latency-field and comment mutants; exact map
declarations with alias/cast bans and an enumerated reference allowlist, the pre-existing `timingFillOutcome`
`as unknown` cast exempted by exact line; diagnostics defined as every `it` in the H describe outside the ten pinned
non-diagnostic titles — the packet said eleven, the enumerated list is ten, corrected; both helper bodies byte-pinned;
the synthetic gated caller line pinned; the title map checked against the parsed `it` titles; floor and ledger
recording fully non-throwing). One implementer question answered by the owner (keep the helper untouched; exempt the
line). Owner-verified: tsc, 81/81, both boundary gates PASS; browser run 26/26, sidecar complete, 1,000 µs control
rejects (stop-rule run 2 of 3, both rejections). Sol round-2 read-only review dispatched on the fix range; the three
clean-clone `make test` cost gates follow on an idle host.

**C2 fix round 1 — Sol R2 read-only review (`review-c2-fix-sol-r2-report.md`): NEEDS-ATTENTION, 2 P1.** Diff audit
clean (six gated bodies, both helpers, `runTripwireBatch`, `report` byte-identical; only pin helpers and the two
recorders changed; the `as unknown` exemption pinned to the exact pre-existing line); all 30 predicates true, all 61
delivered mutants flip; the ten pinned non-diagnostic titles are the actual ten. The two P1s are the declared limit of
text-shaped pins made concrete: (1) equivalent registrations bypass the scan — `const hiddenIt = it`, a
template-literal title, a computed member `{ test: it }['test']`, a second `describe` of the same name; (2) map
isolation bypassed by unicode-escaped identifiers plus a computed `set`. **Owner disposition: cap round (3 of 3)
dispatched to Astra with P1 criteria up front — replace the load-bearing text pins with symbol-resolved scans over the
file's AST (registration references and map-binding references by symbol identity), keeping the literal pins as cheap
absence-detection; eleven named bypass mutants must flip. Anything found after that is a recorded residual.**

**Harness — Sol R2 (`review-harness-sol-r2-report.md`): NEEDS-ATTENTION, 4 P1 / 1 P2; 6 of 8 round-1 items closed.**
Open: analyzer trusts `predicateEvidence` without cross-checking the host capture; "strict" sidecar validation still
accepts malformed family details and missing root fields; analysis may run before all 20 labels started; the pointer
is a single overwritable slot across candidates; a legitimate per-run refusal strands the campaign. **Fix round 2
dispatched (Sol, `packet-H-fix-r2.md`)**: recompute the predicate from `host-state.json` and require agreement; full
rev 3.1 root/family/ranked-entry validation; analysis refuses until every one of the 20 labels has started;
per-candidate pointers with fail-closed write order and an explicit `--new-campaign` flag; refusals appended under
`run-NN/refusals/` and `start` re-entrant over a refusal-only directory.

**Harness fix round 2 delivered and committed (`429b80c`, +429/−59 over `0dad855`):** all four P1 and the P2 of Sol R2
closed with tests — the analyzer requires valid non-empty process evidence and recomputes the frozen predicate from
`host-state.json` (`predicate-verdict-mismatch` on disagreement); full rev 3.1 root, typed Holm `details` and
ranked-entry validation (gated names, p in [0,1], positive ranks, `rejected ⊆ ordered`); analysis refuses unless all
20 frozen labels have started (`--allow-partial` only for synthetic `--plan` records; the runner never passes it);
per-candidate `{ out, createdAt }` pointers written after `campaign.json` with fail-closed recovery and an explicit
`--new-campaign` flag the README ties to new user authorization; refusals appended under `run-NN/refusals/`, a
refusal-only directory resumable, stray content refused, refusal counts reported as context. Owner-verified: 79/79,
both boundary gates PASS, `bash -n` clean, no capability imports. Sol round 3 (cap) dispatched with P1 criteria up front.

**C2 fix round 2 (cap) delivered and committed on the branch:** the load-bearing text pins replaced by
TypeScript-checker-resolved scans — every reference to vitest's `it`/`test`/`describe`/hooks must be a direct
literal-titled registration at its pinned position (three exact positional exceptions approved by the owner during the
round: the lifecycle `it.each`, the lifecycle `afterEach`, the family test's pre-existing `const biased = new
Map(probeResults)`), and every reference to the two map bindings must be an enumerated usage site; aliases, computed
members, template titles, a second describe, unicode-escaped identifiers, destructuring, element access and
`Reflect.get` flip a predicate. 32 predicates, 123 named mutants, program + checker 271 ms, main-partition re-execution
8.2 s. Owner-verified: tsc; 143/143; both boundary gates PASS; `git diff 35ed844..` removes no line outside pin code;
browser run 26/26, sidecar complete, pin test 4.4 s in-browser; **the 1,000 µs control rejected in all three owner
runs (run 1, fix-1 run, fix-2 run) — the stop rule is not triggered.** Sol round 3 (cap) dispatched with P1 criteria.

**Harness Sol R3 (cap, `review-harness-sol-r3-report.md`): NEEDS-ATTENTION — 4 of 5 round-2 items closed; R2-P1-2
still open** (validator admits a missing `sequence`, out-of-range p-values, `rejected: []` under status reject, and Holm
details inconsistent with the measured entries) plus a P2 (partition counters coerced). **Cap-round owner correction
dispatched (`packet-H-cap-correction.md`)**: entry `sequence` required, p-values in [0, 1], Holm details validated
structurally and recomputed over the six measured gated p-values with a `family-verdict-mismatch` reason, partition
reports require consistent integer counters. Residuals recorded: candidate pointers are ignored checkout-local state;
campaign evidence is not authenticated against manual modification (the documented operating contract is part of the
trust boundary); a precisely timed interruption of the pointer temp write can wedge recovery (availability only).

**C2 — Sol R3 (cap, `review-c2-fix-sol-r3-report.md`): NEEDS-ATTENTION, 2 P1.** Criteria (b) map isolation and (c) no
line changed outside pin code: PASS (every requested and extra spelling flips `mapReferencesResolved`; the three
exceptions exact and positional). Criterion (a): `vi.importActual('vitest')` inside an `async` suite factory registers a
test past all 32 predicates (three spellings). Criterion (d): the predicates accept a program with a semantic build
error (only syntactic diagnostics were checked). **Owner disposition at the cap:** the registration-isolation invariant
has now been beaten three rounds running (alias → equivalent spellings → alternate module provenance), so the claim is
**narrowed** rather than patched again: the scan bounds registration to references of the statically imported vitest
symbols and `vi.spyOn` with synchronous suite factories; registration through Vitest internals, globals or another
module loader is outside the scan. A small cap-round owner correction (Astra, `packet-C2-cap-correction.md`) closes the
two concrete P1s (semantic diagnostics required; `vi` restricted to `spyOn`; non-async factories with no factory-level
`await`) and writes the narrowed claim into the code. **Follow-up recorded for the next session (BACKLOG):** the
complementary control is execution-side, not source-side — pin the timing-2 JSON report's exact test-title inventory
(26 titles) in `scripts/test-execution.mjs`, so any registration by any spelling reds the execution gate; that is a
root-of-trust gate change (Astra, its own packet). Residual: `tsc --noEmit` in `make test` already guarantees the
committed file compiles, so criterion (d) concerned mutant hygiene, not the gate on the committed tree.

**Harness — cap-round correction delivered and committed:** entry `sequence` required; p-values in [0, 1]; Holm details
validated (six gated names once each, rank = position, threshold = α/(6−rank+1) within 1e-12, non-decreasing p,
`rejected` a non-empty prefix, p-values equal to the measured gated entries) and the verdict recomputed over the six
measured p-values (`family-verdict-mismatch`); partition reports require four consistent non-negative integer counters.
Owner-verified: 99/99, both boundary gates PASS. **Harness post-implementation loop closed at the cap (R1 → fix → R2 →
fix → R3 → correction).** Residuals carried: pointers are ignored checkout-local state; evidence is not authenticated
against manual edits (operating contract); a precisely timed interruption of the pointer temp write can wedge recovery
(availability only, documented same-directory recovery).

**Integration gate run 1 — RED (recorded, never retried to green).** Clean clone `clone-c2` at integration head
`24675f6` (= main `550e9b3` + harness `e252713` + C2 `0424d8d`), `make test` 18:00–18:06 CDT, main partition 3162 /
3159 passed / **2 failed** / 1 expected skip; timing partitions not reached (`&&` chain). (1)
`src/core/fillService.structure.test.ts` — `host.timing.browser.test.ts` must remain under 800 lines: **2,063** (734 at
`4909ba8`; the C2 pin scanner ≈ 1,050 lines lives inside the certifying file). (2) `timing2Sidecar.test.ts` "runs every
source pin … without loading Chromium" timed out at 7.3 s under the saturated main partition (default 5 s). Neither is a
measurement defect; both are integration defects the worktree runs could not show (the worktree cannot run `make test`
— the provenance symlink rule). Evidence `owner-gate-integration-run1-RED/`. **Integrator fix dispatched to Astra
(`packet-C2-integration-fix.md`):** extract the scanner into `testbed/probe/timingSourcePins.ts`, move literals / hook
bodies / payload fixtures out as pure moves only as far as needed (STOP if still ≥ 800), explicit 180 s timeout and
program reuse for the re-execution test; then a Sol read-only pass on the moves and three fresh clean-clone gates.

**Integration fix (Astra, `16d455a`) and the three exact-candidate clean-clone gates — GREEN.** The pin scanner moved
into `testbed/probe/timingSource{Compiler 203, Resolve 296, Contracts 183, Pins 358, Mutations 268}.ts`, payload
fixtures into `src/supervisor/host.timing.fixtures.ts` (108), sidecar hook bodies into `timing2Sidecar.ts` (240);
the certifying file is **760 lines** (734 at `4909ba8`); the re-execution test has a 180 s timeout with program reuse;
69 declarations byte-identical under `--color-moved`; 32 predicates / 131 mutants unchanged; `CANARY`/`NONMATCH`/
`NONMATCH2` stay in the file. Owner-verified twice (before and after the module split): tsc, 166/166 incl.
`fillService.structure.test.ts`, both boundary gates PASS, browser run 26/26 with a complete sidecar. Integration head
**`1de4ad3`** = main `2947fc8`… (docs) + harness `e252713` + C2 `16d455a`. Clean clone (`git clone` → `npm ci` → `make
browsers`), host otherwise idle, tree clean before every run:

| Run | Head | `make test` | main | timing-1 | timing-2 | timing-1 + timing-2 subprocess wall | sidecar | 1,000 µs control |
|---|---|---|---|---|---|---|---|---|
| 1 | `24675f6` (pre-fix) | **RED** | 3162 / 3159 / 2 failed (structure limit; re-execution timeout) | — | — | — | — | — |
| 2 | `1de4ad3` | PASS | 3162 / 3161 / 0 / 1 skip | 5/5 | 26/26 | 14.3 s + 234.3 s = **248.6 s** | complete, 14/14, accept | reject |
| 3 | `1de4ad3` | PASS | 3162 / 3161 / 0 / 1 skip | 5/5 | 26/26 | 14.5 s + 233.6 s = **248.0 s** | complete, 14/14, accept | reject |
| 4 | `1de4ad3` | PASS | 3162 / 3161 / 0 / 1 skip | 5/5 | 26/26 | 14.3 s + 233.7 s = **248.0 s** | complete, 14/14, accept | reject |

**§2.7 cost criterion met: max(sum) = 248.6 s ≤ 600 s** (D10's ten-minute sentence, read as timing-1 + timing-2). The
1,000 µs real-click control rejected in every owner run (worktree runs 1, fix-1, fix-2, cap, integration, split; clean
runs 2–4) — **the stop rule was never triggered**; the 250 µs control likewise. Subprocess wall is approximated as the
JSON report's file end minus the run's `startTime` (Vitest startup included). Evidence `owner-gate-integration-run1-RED/`
and `owner-gate-integration-1de4ad3/run{2,3,4}/`. Run 1 stays recorded as red on its head. A Sol read-only pass on the
moves (`review-c2-integration-fix-sol.md`) is the last review; C2 then waits only on the user's acceptance of D-1..D-4.

**Integration fix — Sol read-only pass (`review-c2-integration-fix-sol-report.md`): NEEDS-ATTENTION on the rubric, not
on the code.** Verified: every payload function and `TimingSessions` byte-identical in `host.timing.fixtures.ts`; the
moved literals and hook bodies exact; `CANARY`/`NONMATCH`/`NONMATCH2` unchanged in the certifying file; `flatCopy`
imported with its `toString()` pin intact; both callers read the real browser source; 32 predicates and 131 mutants
run from both the browser pin and the Node suite; hook order exact-pinned and symbol-checked; the four exceptions at
their sites; all nine files < 800 lines; no new skip/spawn/capability import; no probe, gate, control, helper, recorder
or lifecycle hunk changed. Finding: 14 scanner functions are **retargeted, not byte-identical** (external-source
routing across the new modules, contract constants, moved-source mutants, and the requested program reuse). **Owner
disposition:** the "pure moves" contract in the integrator packet was over-strict for the scanner — a scanner that
reads several files must be retargeted; the property that matters, an unchanged measurement surface with every pin
and mutant still executing, is verified by the reviewer and by the owner's browser runs and three green clean-clone
gates. Recorded as accepted scanner retargeting, not as pure moves. No fourth round.
