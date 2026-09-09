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
