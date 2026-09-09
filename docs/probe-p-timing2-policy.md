# Probe P timing-2 gate policy — decision and pre-registered characterization (v2, 2026-09-09)

Owner: Claude, session `2026-09-09-m7-entry`. Status: **v2 after two blind paper reviews (Codex Sol R1, Opus 5 R1;
both NEEDS-ATTENTION, every finding owner-verified or dispositioned in the register), for user adoption.** Nothing
here changes a threshold, a sample size, the gated probe set, the hard clause, or what `make test` certifies. The
locked specification stays: **D10** in [`docs/m4-slice-spec.md`](m4-slice-spec.md) ("Probe P is a shared, pinned,
tested statistic"; the six-probe Holm family; 180 s per test, ≤ 10 min for the partition) and the Decisions Log
entries of 2026-09-02 (paired, counterbalanced, family-corrected gate) and 2026-09-08 (policy change DEFERRED; the
gate stays; every failure preserved; no retry-to-pass; later green runs do not resolve earlier rejections).

## 1. What the record shows

Every preserved timing-2 report on this host since the serial-run convention, enumerated. "Family rejection" means
the Holm–Bonferroni test in `host.timing.browser.test.ts` failed; the same partition also holds ten lifecycle
wall-clock assertions, so a partition red is not automatically a Probe P red.

| Run | Source | Result |
|---|---|---|
| 2026-09-08 owner worktree 14:44, 15:30, 16:15 CDT | owner record only (`am12-slice/v13/owner-v13.md:18`) | 20/20 ×3 |
| 2026-09-08 E9 step-1 clean clone (`20f8e00`) | owner record | 20/20 |
| 2026-09-08 AM12 base run 1 | exit code only; report overwritten before capture | **partition red, unattributed** |
| 2026-09-08 AM12 base run 2 | owner record | 20/20 |
| 2026-09-08 AM12 base run 3 | `am12-slice/v13/base-run3-timing-2.json` | **family rejection**, message truncated to `tripw…` |
| 2026-09-08 AM12 candidate runs 1, 3 | owner record | 20/20 ×2 |
| 2026-09-08 E9 attempt-2 clean clone runs 1–3 | `e9-attempt2-steps1-2/vitest-run{1,2,3}/timing-2.json` | 20/20 ×3 |
| 2026-09-09 AM13 clean clone runs 1–3 | `tinyvault-m6-close-20260909` assessment table | 20/20 ×3 |
| 2026-09-09 M6-close owner gate 2 | `owner-gate-2-timing2-probeP-rejection/timing-2.json` | **family rejection**, message truncated to `tripw…` |
| 2026-09-09 M6.1 candidate gate | `tinyvault-m6-1-canary-auth-20260909/owner-gate-1-candidate-make-test/` | 20/20 — **not idle**: three review helpers ran concurrently (`concurrency-note.txt`) |

Totals: **17 timing-2 runs; 2 confirmed family rejections; 1 unattributed partition red.** Both confirmed rejections
name a probe whose name begins `tripw` — one of `tripwire-match-vs-no-match` (synthetic `TimingSessions`, no
browser) or `tripwire-real-click-match-vs-no-match` (real Chromium click). Neither preserved the probe's full name,
p-value or Holm threshold: the JSON reporter keeps only the assertion text, which the assertion library truncates
because the family test wraps the call in `expect(fn).not.toThrow()`, and the per-probe `console.info` lines are not
captured by that reporter. **No preserved rejection identifies a non-tripwire probe; one red is unattributed.** The
three recorded reds stay red permanently; nothing below adjudicates them.

Prior evidence, kept separate because it was produced by a different statistic: the M4 register's T4-8 (35 µs median
difference at p = 0.0078, 3 of 4 runs) and the "signs in both directions" observation were under the *pre-amendment*
unpaired Mann–Whitney gate at 200 samples under parallel load, and the identical-payload null passed 9/9 there. The
current gate is 500 pairs (1,000 timed arm executions) with a paired Wilcoxon signed-rank and Holm over six probes,
adopted 2026-09-02 specifically to retire that class; the replacement statistic is now rejecting on serial runs, which
is a stronger fact than "the same class". The probe's own measured sensitivity floor is ~32 µs (M4 register), so the
effects in question sit at the detection limit.

Under valid per-probe p-values the family gate rejects at most about 1 run in 100. Two confirmed rejections in 17 is
compatible with any of three readings, and the preserved evidence cannot separate them:

- **(H1) calibration** — the signed-rank test assumes exchangeable pair differences; 1,000 interleaved timed calls on
  a JIT-warmed process and a live browser may not satisfy that;
- **(H2) a real, sub-millisecond, content-dependent latency difference in the tripwire path** — a security finding
  in the core, not a flaky gate;
- **(H3) a harness artifact** — accumulation, setup asymmetry or order effect in how the probes are constructed
  (the real-click probe keeps ~1,000 hosts alive until measurement ends; the synthetic probe finalizes the previous
  host inside each untimed setup; the warm-up is always A-then-B), which is neither the statistic nor the product.

Deciding a gate policy before knowing which reading holds would be asserting, not measuring.

## 2. Decision (proposed for user adoption)

1. **The gate is unchanged until the user decides otherwise.** No rerun-to-pass rule, no threshold or alpha change,
   no idle-host clause in the gate contract. An owner gate whose only red is a timing-2 family rejection is recorded
   as red with its report preserved, never rerun to green, never graded green. The three recorded reds stay red.
2. **Observability first, in two separately reviewed pieces.**
   - **C1 (land now, before any campaign):** the family error names each rejected probe with its p-value, Holm
     threshold and rank; the gated family test calls `assertProbeFamily` directly so the full message reaches the
     JSON report. Touches `testbed/probe/probeP.ts` (the certified statistic's *message*, not its arithmetic), its
     unit test's exact-string pins, and the family line of the timing file. Adversarial code review by Astra because
     it edits the certifying file.
   - **C2 (adopted with this note, since it needs a D10 wording amendment):** a per-run sidecar
     `.vitest/timing-2-probes.json` carrying, for every probe, the full `ProbePResult` including the ordered
     `aSamplesMs`, `bSamplesMs` and `differencesMs`, the p95s D10 requires, and the family verdict; plus **null
     variants of the two tripwire probes, reported not gated**: for each, an A/A twin (both arms `CANARY`) and a
     **sham-A/B** twin (two *different* non-matching payloads of identical length and shape, so content alternates
     pair by pair without the tripwire branch alternating). `NONMATCH/NONMATCH` is omitted: the A/A twin covers the
     single-path null and the sham covers content alternation, which is the mechanism the A/B probes add on top.
     The twins run immediately after their siblings, use the siblings' `pairs`, `warmup` and timeout, assert only
     the hard clause and a finite p-value, and must be shown to reject an injected 2 µs bias like the gated family
     (absence-detection). **D10 amendment required:** "the six probes of `host.timing.browser.test.ts`" becomes
     "the six probes named in `PROBE_NAMES` in `host.timing.browser.test.ts`; further probes in that file are
     reported, not gated", and the four twins' runtime is costed against D10's ten-minute sentence in the
     implementer's report (today's partition: ~165 s).
3. **A pre-registered characterization campaign**, after C1 and C2 land, conducted as the gate is conducted:
   - **N = 20 `make test` runs**, fixed before run 1; not the timing file alone, because every recorded observation
     came from the timing partition starting immediately after a ~9-minute saturated main partition, and a
     standalone run measures a different quantity.
   - **Every started run counts.** Each run's directory `artifacts/review-evidence/probe-p-campaign-<date>/run-NN/`
     is created before the run starts and holds: `host-state.json` captured automatically at start (load average,
     process list, power source, thermal state where readable), the three partition reports, the sidecar, the
     `make test` exit status, the commit SHA and dirty state, Node and Chromium versions, timestamps. A run may be
     excluded only when its `host-state.json` shows a competing job at start; every exclusion is reported with its
     numbers. No replacement, restart or extension; a run that fails for a non-Probe-P reason is reported as such
     and still counts in the enumeration.
   - **Validity:** a run in which the injected-bias positive control does not reject is invalid for rate purposes
     (reported, listed, excluded from the counts below).
   - **Analysis script committed before run 1**, computing everything in §2.4 once, at N; this note's commit SHA is
     cited in the campaign directory. Reported alongside: per-probe stationarity diagnostic (slope of arm-A sample
     on pair index, with its interval) from the raw series, and the sensitivity-floor value per run.
4. **Decision rule, in run counts, fixed before the data.** For each tripwire probe *i*, over the valid runs:
   `k_AB(i)` = runs with the A/B probe's p ≤ 0.01/6; `k_AA(i)` and `k_sham(i)` = the same event for its twins
   (identical bar, identical per-probe comparison — no family-size mismatch). Primary sign series: the sign of
   `medianDiffMs` of the A/B probe, per probe, zero counting for neither side; `z` and the other probe's sign are
   secondary and reported only.
   - **Outcome A — calibration concern:** `k_AA(i) ≥ 2` or `k_sham(i) ≥ 2` for any *i* (under valid p-values the
     expected count is ≈ 0.03 per twin over 20 runs). Proposal to the user: a D10 amendment packet changing the
     *statistic* for the affected probe(s) to one that respects the measured dependence (block permutation on the
     interleaved pairs with the block length derived from the retained series, or a declared false-rejection rate
     measured rather than assumed), keeping α, pairs and the hard clause; Sol paper review, Astra implementation
     and code review.
   - **Outcome B — harness audit, then security investigation:** `k_AB(i) ≥ 2` with `k_AA(i) = k_sham(i) = 0` for
     that probe. Proposal to the user: first an audit of the probe construction in the timing file (H3: host
     accumulation, setup asymmetry, warm-up order, the stationarity diagnostic), Astra, test-file only; if the audit
     clears the harness, an Astra investigation packet on the tripwire path in `src/supervisor`. A consistent
     primary sign (same sign in ≥ 16 of 20 valid runs) is reported as strengthening B but does not by itself skip
     the audit. The gate stays as it is throughout.
   - **Outcome C — inconclusive:** `k_AB(i) ≤ 1` for both probes and twins quiet. Proposal to the user: none; the
     gate and the 2026-09-08 deferral stand, the campaign directory is the evidence, and the historical reds remain
     unresolved. This is **not** "load contamination" and adopts no idle-host convention.
   - **Coexistence and precedence:** A and B can both hold (calibration can be off *and* a channel can exist).
     Report both; B's audit and investigation are proposed first, A's amendment second, because a statistic change
     must not be adopted while a channel is an open question.
   - **Power, stated up front:** N = 20 resolves counts, not percentages — it separates a ~20 % rate from ~0 % but
     cannot separate 1 % from 5 %. If the true family rate is the ~12 % the record suggests, roughly 4 in 10
     campaigns end in Outcome C. That is an acceptable result: it leaves the gate exactly where the user left it.
   - **Every outcome is a proposal.** Nothing in this rule adopts a gate change, a convention, or a
     reclassification; the user decides on the proposal, with the campaign directory as its evidence.
5. **M7.** M7 design work proceeds; M7 acceptance receives no exemption: every required `make test` keeps its actual
   verdict and a timing-2 red stays red. M7's fixtures add no *concurrent* load during Probe P (the timing file runs
   in its own Vitest process, third in the `&&` chain), but they lengthen the main partition that precedes it —
   one more reason the campaign runs as `make test`. At the recorded rate, M7's close gate has roughly a one-in-five
   chance of a permanent timing-2 red; the resolution path for that red is this campaign's outcome going to the user,
   not a rerun.

## 3. What this does not decide

- Whether the two tripwire probes stay in the gated family (the amendment's question, if Outcome A).
- Anything about the four other probes, of which no preserved rejection exists.
- The Docker partition, the timing-1 partition, or the eval entry.

## 4. Residual limits

The campaign characterizes these payloads, these operations, one host, one OS, one Chromium build and one thermal
environment, run by the owner who wrote the gate; its intervals will be wide. A/A and sham nulls can expose
calibration problems but cannot prove the absence of a real sub-millisecond channel; a stable directional bias can
come from payload processing, setup state or browser drift as well as from the core. The three recorded reds cannot
be replayed and are not explained by any campaign outcome.
