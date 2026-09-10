# Probe P timing-2 gate policy — decision and pre-registered characterization (v2.1, ADOPTED 2026-09-09)

Owner: Claude, session `2026-09-09-m7-entry`. Status: **ADOPTED by the user on 2026-09-09 as the
observability-first direction, with the clarifications folded into §2 (v2.1).** Execution status (2026-09-09 evening):
C1 merged and pushed (`4909ba8`/`ca43cd9`); **C2 implemented through the full ladder** on `codex/probe-p-c2`
(`16d455a`), three green exact-candidate clean-clone gates on the integration head `1de4ad3` (timing-1 + timing-2 ≈
249 s ≤ 600 s; the 1,000 µs stop rule never triggered), **D-1..D-4 accepted by the user and merged into main as `92d2bbe`** (`docs/probe-p-c2-packet.md` rev 3.1; register
"C2 merged"); D-1's recorded limit: the twins are not phase-matched, and quiet twins cannot by themselves clear the
harness or distinguish a real channel from an order/environment effect; the **campaign harness** (`tools/probe-p-campaign/`) is on the same
integration head at its review cap; the campaign is **authorized** (user, 2026-09-09) to run once the host has its full idle window, with identities frozen before run 1. Register: `docs/m7-review-findings.md`. The user's framing governs: *the
existing gate remains unchanged; this is authorization to characterize the problem, not to relax or reinterpret
the gate.* Nothing here changes a threshold, a sample size, the gated probe set, the hard clause, or what
`make test` certifies. The locked specification stays: **D10** in [`docs/m4-slice-spec.md`](m4-slice-spec.md)
("Probe P is a shared, pinned, tested statistic"; the six-probe Holm family; 180 s per test, ≤ 10 min for the
partition — both time limits kept) and the Decisions Log entries of 2026-09-02 (paired, counterbalanced,
family-corrected gate) and 2026-09-08 (policy change DEFERRED; the gate stays; every failure preserved; no
retry-to-pass; later green runs do not resolve earlier rejections). v2 (the reviewed proposal) is preserved in the
git history at `d3f8064`; the two blind paper reviews and their dispositions are in the M7 register.

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

## 2. Decision (adopted; the user's clarifications are the normative text where they differ from v2)

1. **The gate is unchanged.** No rerun-to-pass rule, no threshold or alpha change, no idle-host clause in the gate
   contract, no reinterpretation. An owner gate whose only red is a timing-2 family rejection is recorded as red
   with its report preserved, never rerun to green, never graded green. The three recorded reds stay red. A later
   gate failure — during C2, during the campaign, or at M7 — is never erased or cleared by retrying.
2. **Observability first, in two separately reviewed pieces.**
   - **C1 (landed `e040175`, reviewed in the M7-entry round, fix `4909ba8`):** the family error names each rejected
     probe with its p-value, Holm threshold and rank (`ProbeFamilyError.details`, frozen); the gated family test
     calls `assertProbeFamily` directly so the full message reaches the JSON report; source pin.
   - **C2 (approved through the full ladder: Sol paper review → Astra implementation → Astra + Claude review):**
     1. **D10 wording amendment, scoped:** "the six probes of `host.timing.browser.test.ts`" becomes "the six
        probes named in `PROBE_NAMES` in `host.timing.browser.test.ts`; further probes in that file are diagnostic:
        reported in the sidecar, never part of the family, never an acceptance criterion through their statistical
        outcome". D10's time limits (180 s per test, ≤ 10 min for the partition) are **kept**; the implementer
        reports the measured C2 cost on the reference machine and **stops for a decision if it cannot fit**.
     2. **Raw-series sidecar** `.vitest/timing-2-probes.json`, written atomically **on failing runs as well as
        passing runs**: for every gated probe, twin and control the full `ProbePResult` (`aSamplesMs`, `bSamplesMs`,
        `differencesMs`, p-value, z, effect size, median difference, both p95s), the family verdict with the full
        `ProbeFamilyError.details` when it rejects, and a **completeness record**: every expected entry is present
        with `status: 'measured'`, or present with `status: 'missing' | 'error'` and the reason. **A missing or
        incomplete diagnostic is recorded as such and is never mistaken for a quiet probe.**
     3. **Twins of the two tripwire probes, diagnostic:** for `tripwire-match-vs-no-match` (synthetic, batched) and
        `tripwire-real-click-match-vs-no-match` (real Chromium), an **A/A twin** (both arms `CANARY`) and a
        **sham-A/B twin** (two *different* non-matching payloads of identical length and character-class shape, so
        content alternates pair by pair without the tripwire branch alternating). Same `pairs`, `warmup` and
        per-test timeout as the siblings, placed immediately after them. **"Reported, not gated" resolved:** a twin's
        test asserts only that the twin ran to completion (500 pairs, finite statistics, entry written) — a
        structural absence-detection criterion; it asserts **nothing** about the twin's p-value or hard clause.
        Twin hard-clause outcomes are recorded in the sidecar as diagnostics. Every existing assertion on the six
        gated probes and the existing controls is preserved unchanged.
     4. **Injected-bias controls, specified per probe; sensitivity is not assumed to transfer:**
        - *Synthetic batched control (existing, gated, unchanged):* `spinForMicroseconds(2)` after **each call** of
          the 64-call `runTripwireBatch`, i.e. 2 µs per call × 64 calls = **128 µs per timed sample**, on arm B
          only; must be rejected by the family machinery (`assertProbeFamily` over the single-probe family) —
          this existing assertion stays.
        - *Real-click control (new, diagnostic):* the real-click tripwire path with one `spinForMicroseconds(X)`
          **per timed sample** (one spin after each `fill_from_vault` call on arm B; no batching), at two declared
          magnitudes **X = 250 µs and X = 1,000 µs**, each its own probe, each recorded in the sidecar with its
          p-value and whether the single-probe family would have rejected it. Reported, not gated: whether the
          real-click path detects a per-sample bias of that size is a campaign measurement, not an assumption.
          If the implementer's development runs show the 1,000 µs control failing to reject three times running,
          **stop for a decision** before delivery.
        - The length-proportional sensitivity floor probe (existing) stays and its value is written to the sidecar.
     5. Cost: the implementer measures the whole partition three times on the reference machine and reports
        wall time per new probe; the packet is delivered only if the partition stays ≤ 10 min, else it stops.
3. **One pre-registered campaign, authorized: 20 started `make test` runs after C2 is implemented and reviewed.**
   - **Frozen before run 1, by commit SHA cited in the campaign directory:** the candidate tree, the analysis
     script, the host conditions, the exclusion predicate, and the decision rule below.
   - **Every started run counts toward the 20.** No replacements, no extensions, no restart of the campaign to
     improve the result. Every report is preserved, including failures and excluded runs.
   - **Run as the gate is run:** `make test` in the main checkout (the timing partition starts after the
     saturated main partition, as in every recorded observation), not the timing file alone.
   - **Per-run capture, created before the run starts:** `run-NN/host-state.json` (load averages, the process
     list, power source and thermal state where readable), the three partition reports, the sidecar, the exit
     status, the commit SHA and dirty state, Node and Chromium versions, timestamps.
   - **"Competing job", defined objectively before run 1:** at run start, any process in the captured list whose
     command line matches the frozen predicate (Codex CLI or companion, `claude-review.mjs`, another `vitest`,
     `node`/`make` from another checkout, Docker build or compose, a browser launched by anything but this run).
     A run is **excluded** only when its `host-state.json` matches that predicate; the exclusion, its evidence and
     the run's results are all reported. Excluded runs still count toward the 20 started.
   - **Valid run:** not excluded, all three partitions produced reports, the sidecar is complete for the six
     gated probes and the existing synthetic control, and the synthetic injected-bias control rejected. A run
     that is red for a non-Probe-P reason is preserved and reported, and counts as started; its validity is
     decided by the same predicate. **The actual valid denominator is reported; no "16 of 20" sentence is
     applied when fewer than 20 are valid — thresholds below are stated as fractions of the valid count with the
     count printed.**
4. **Decision rule, fixed before the data; exhaustive.** Two separate reports:
   - **(a) Actual gate outcomes:** for each started run, the `make test` verdict, the timing-2 partition verdict,
     the family verdict with the full Holm details, and — for context only — the twins' and controls' recorded
     results. This is the record of what the gate did; nothing in (b) reinterprets it.
   - **(b) Matched per-probe diagnosis** over the **valid** runs (count `V`, printed), for each tripwire probe
     *i*: `k_AB(i)` = valid runs with the A/B probe's p ≤ 0.01/6; `k_AA(i)`, `k_sham(i)` the same event for its
     twins (identical bar, identical per-probe comparison); the primary sign series = the sign of the A/B probe's
     `medianDiffMs` per run (zero counts for neither side; `z` and the other probe are secondary, reported only);
     the real-click controls' rejection counts at 250 µs and 1,000 µs; the per-probe stationarity diagnostic
     (slope of arm-A sample on pair index, with its interval) from the raw series.
   - **Outcomes (evaluated in this order; the first that applies is reported, and every other applicable pattern
     is reported alongside it):**
     - **Insufficient:** `V < 15`. Inconclusive. No inference about calibration.
     - **Diagnostic incompleteness:** any twin or control missing or errored in ≥ 2 valid runs. Inconclusive for
       the affected probe; the incompleteness itself is the finding (a harness defect to fix before re-running
       a *new* campaign, which would need new authorization).
     - **Calibration concern:** `k_AA(i) ≥ 2` or `k_sham(i) ≥ 2` for any *i*. Proposal: a D10 amendment packet
       changing the *statistic* for the affected probe(s) to one that respects the measured dependence (block
       permutation on the interleaved pairs with the block length derived from the retained series, or a declared
       false-rejection rate measured rather than assumed), keeping α, pairs and the hard clause.
     - **Harness audit, then security investigation:** `k_AB(i) ≥ 2` with `k_AA(i) = k_sham(i) = 0` for that
       probe. Proposal: first an Astra audit of the probe construction in the timing file (host accumulation,
       setup asymmetry, warm-up order, the stationarity diagnostic); if the audit clears the harness, an Astra
       investigation of the tripwire path in `src/supervisor`. A consistent primary sign (same sign in ≥ 80 % of
       valid runs, count printed) strengthens this outcome but does not skip the audit.
     - **Mixed:** `k_AB(i) ≥ 2` together with `k_AA(i) ≥ 1` or `k_sham(i) ≥ 1` but below the calibration bar, or
       the two probes falling in different outcomes, or a real-click control that fails to reject at 1,000 µs.
       Inconclusive; the pattern is reported in full; it is **not** evidence that the statistic is calibrated.
     - **Quiet:** `k_AB(i) ≤ 1` for both probes and every twin quiet. Inconclusive; the gate and the 2026-09-08
       deferral stand; the historical reds remain unresolved. **A quiet campaign does not prove the absence of a
       timing channel, does not reclassify any historical red, and adopts no convention.**
   - **Coexistence:** calibration concern and harness/security can both hold; both are reported; the audit and
     investigation are proposed first, the amendment second.
   - **Power, stated up front:** 20 started runs resolve counts, not percentages; they separate a ~20 % rate from
     ~0 % but cannot separate 1 % from 5 %. Inconclusive is a likely and acceptable result.
   - **Every outcome returns to the user as a proposal.** No automatic gate change, no historical-red
     reclassification, no claim that a clean campaign proves no timing channel.
5. **M7.** Fixture design and packet preparation proceed independently and immediately. The campaign runs, and its
   findings go to the user, **before M7's first live cohort**; nothing here authorizes live-provider spend. M7
   acceptance receives no exemption: every required `make test` keeps its actual verdict and a timing-2 red stays
   red; M7's fixtures add no *concurrent* load during Probe P (the timing file runs in its own Vitest process) but
   lengthen the main partition that precedes it — one more reason the campaign runs as `make test`.

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
