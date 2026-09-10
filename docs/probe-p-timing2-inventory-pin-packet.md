# Timing-2 inventory-pin packet (v3 — user decisions folded; candidate for paper round 2) — pin the timing-2 report's exact test-title inventory in the execution gate

**Status:** **v3, 2026-09-10 — the user's decisions folded in; a stable candidate file for paper round 2; nothing here is
authorized for implementation.** **User decisions (2026-09-10): D-1 = Option A** — pin `scripts/test-execution.mjs` and
`scripts/test-contract.mjs`, with the four digest rows of §5; the claim stays limited to detecting changes in the
reported title multiset, and title-preserving substitutions and reporter/root-of-trust modifications remain explicit
residuals (§0). **O-1: no** timing-1 inventory twin in this packet. **O-2: no** additional security-specialized channel —
Codex adversarial review, Claude `/review` and owner gates as specified. Round 1:
Sol (`task --fresh --model gpt-5.6-sol`, read-only) NEEDS-ATTENTION 2 P1 / 1 P3; blind Opus 5 NEEDS-ATTENTION 2 P1 /
3 P2 / 4 P3; the two channels converged on both P1s (digest accounting; mutant M-T7 reds an earlier rule). Every finding
was owner-verified against the source and absorbed in §12; no mechanism changed. Evidence
`artifacts/review-evidence/tinyvault-m7-packets-20260910/` (`review-pin-packet-{sol,opus}-r1-report.md`). The user
receives this packet and the dispositions before any dispatch.
**Trigger:** the C2 cap-round disposition (register `docs/m7-review-findings.md`, "C2 — Sol R3 (cap)": the source-side
registration-isolation claim was beaten three rounds running — alias → equivalent spelling → `vi.importActual` — and
was narrowed; the complementary control is execution-side) and the BACKLOG item "From the C2 / campaign-harness ladder
→ Execution-side pin of the timing-2 test inventory". **Owner:** Claude (session `2026-09-10-m7-packets`).
**Implementer after the paper cap:** Codex GPT-6 Astra on `codex/timing2-inventory-pin`, base pinned at dispatch,
uncommitted (the owner commits with explicit paths). **Post-implementation:** Codex adversarial review of the code +
Claude `/review`; owner gates. The security third channel is **not** proposed (no credential handling is touched;
O-2, both channels concur). Paper rounds capped at three; §10 states the cap round's P1 criteria.

## 0. What this is and is not

- **Is:** one new execution-gate rule, `timing-2-inventory`: the timing-2 JSON report (`.vitest/timing-2.json`, the
  partition that runs `src/supervisor/host.timing.browser.test.ts` alone) must contain **exactly** the 26 pinned test
  titles as a multiset, each `passed` — so **any registration that changes the timing-2 title multiset** (adds,
  removes, renames or duplicates a report title), by any spelling, turns `make test` red at
  `node scripts/check-test-execution.mjs`, independently of the C2 source scan.
- **Is not:** any change to the six gated probes, the sidecar, the source-side pins in `testbed/probe/*`, the partitions,
  the pinned commands (`scripts/test-contract.mjs`), the entry grammar (`check-test-entry.mjs` logic), the docker/eval
  modes' rules, the main partition's inventory (a different instrument; not proposed), or timing-1 (O-1).
- **Claim, stated narrowly, with its two residuals.** (1) A registration that *runs* in the timing-2 partition and
  reaches the JSON report with a title not already on the list is red. **A title-preserving substitution** — a body
  registered under a pinned title with the original registration removed — keeps the multiset and is **outside this
  rule**; the rule pins titles, not title→body. (The source side pins all sixteen `H Probe P timing bounds` titles and
  the lifecycle `it.each` statement, `testbed/probe/timingSourceContracts.ts:81-105`; the other nine lifecycle titles
  have no body pin on either side. No `CLAIM_LINKS` selector names the timing file, so `claim-execution` does not
  help.) (2) A registration hidden from the reporter — a reporter or runner substitution — is a root-of-trust edit
  (`vitest.config.ts` is hash-pinned; `--reporter=json --outputFile` is in the pinned command list) and outside the
  claim. (3) **Reporter-format coupling, recorded:** the 26 strings encode Vitest's `fullName` join (`<describe> <it>`,
  one space) and its `it.each` `%s` expansion; `package.json` ranges `vitest` at `^4.1.0`, the committed lock pins
  4.1.11 and the clean-clone path is `npm ci` (`README.md:72`), so the gate is deterministic today; a lock refresh that
  changes the join would false-red `make test` with no source change, and the refresh must then re-pin the literal.
  The source scan and this rule are complementary; neither is universal registration isolation.

## 1. Facts verified on `main` at `913416b` (2026-09-10)

1. **The inventory.** `.vitest/timing-2.json` from the 2026-09-10 02:31 gate lists one file
   (`src/supervisor/host.timing.browser.test.ts`) and 26 `fullName`s, `numTotalTests: 26`, all `passed`, in this order:
   sixteen under `H Probe P timing bounds` — `pins same-constructor timing payloads against the bare-rotation mutant`,
   `kills secret-length-dependent fill latency after asserting exact result equality`,
   `kills secret-length-dependent mutex occupancy with an immediately queued control`,
   `kills a content-dependent reflection oracle with equal-length caller traffic`,
   `kills match-dependent tripwire timing through composeSupervisedHost`,
   `kills match-dependent tripwire timing on a real supervised browser fill call`,
   `kills content-dependent request-listener work on the real supervised click path`,
   `applies the Holm–Bonferroni family gate over the six probes`,
   `reports a path-specific 2us-per-call injected-bias control rejected by the family gate`,
   `reports the length-proportional fill-wrapper sensitivity floor`,
   `tripwire-match-vs-no-match-aa`, `tripwire-match-vs-no-match-sham`, `tripwire-real-click-match-vs-no-match-aa`,
   `tripwire-real-click-match-vs-no-match-sham`, `tripwire-real-click-bias-250us`, `tripwire-real-click-bias-1000us`;
   ten under `M6 S4 lifecycle timing bounds` —
   `never-loading subresource plus three-second beforeClose stays within the combined eight-second budget`,
   `busy-renderer suspension cutoff permits successful quiesce within the hard five-second budget (pending CDP=false)`,
   `busy-renderer suspension cutoff permits successful quiesce within the hard five-second budget (pending CDP=true)`
   (one `it.each([false, true])`, two report rows),
   `black-hole failed navigation then close stays within the five-second close bound`,
   `active goto then close includes the courtesy wait within the five-second close bound`,
   `hostile self-navigation snapshot expires within ten seconds plus settlement`,
   `deadline expiry disposes a genuinely pending CDP holder within five seconds plus settlement`,
   `continuous page beacons quiesce successfully within the five-second bound`,
   `successful strict drain and finalization stay within the shared five-second bound`,
   `busy renderer snapshot fails within ten seconds plus the three-second disposal grace`.
   The `fullName` is `<describe title> <it title>` with a single space; the Holm–Bonferroni title carries U+2013. Both
   round-1 channels byte-compared this list to the report: exact ordered match. All 26 registrations are unconditional
   string literals under two top-level suites (`host.timing.browser.test.ts:127-745`; no `skipIf`/`runIf`, no computed
   titles), so there is no run-to-run title variance. **Transcription source (both `.vitest/` and `artifacts/` are
   gitignored):** the green report is copied to
   `artifacts/review-evidence/tinyvault-m7-packets-20260910/timing-2-green-20260910-0241.json`
   (SHA-256 `027d8453998d0e68bc72a140d22256bea3d9b3ef68408c102429d73117aec636`); the dispatch names that absolute
   path; the implementer transcribes the literal **from that report** (a `python3 -c` over `assertionResults[].fullName`),
   never from the test source, and STOPs if the file is absent or its digest differs (§8).
2. **What the gate checks today.** `proveExecution` (`scripts/test-execution.mjs:54-65`) → `inspectReport` (`:38-52`)
   pins freshness, `success` (`:42`), the file set (`report-files`, `:45`), per-assertion status (`assertion-status`:
   `passed` or `skipped`), the skip identity (`skip-identity`: a `skipped` row is legal only in test mode, only in
   `testbed/runner.eval.test.ts`, only the one pinned title), and the counters. Title rules that exist today:
   `docker-assertions` (`:47-48`, six names each exactly once `passed`, docker mode only — the only **closed-set
   inventory** rule), `skip-identity` (one exact title) and `claim-execution` (`:148-157`, every `CLAIM_LINKS` runtime
   `fullName`, none of which names the timing file). In test mode a timing-2 report with 27 passing titles is green.
3. **Consequence for the new rule's substance.** Because `assertion-status` + `skip-identity` already force every
   timing-2 row to be `passed`, the new rule's content is **multiset identity**; the "all passed" conjunct is restated in
   the rule for auditability but is **an unkillable equivalent mutant** — no timing-2 bundle can reach it with a
   non-`passed` status, and a skipped row reds as `skip-identity` first (§4, M-T5 is the precedence witness). Stated
   plainly so no reader takes that conjunct as tested.
4. **The pinned root.** `testbed/rootOfTrust.test.ts:11-24` pins `package.json#scripts`, `Makefile`, the three Vitest
   configs and every `scripts/check-*.mjs` by SHA-256. **`scripts/test-execution.mjs` and `scripts/test-contract.mjs`
   are not hash-pinned** (the only pin of the execution gate is the `check-test-execution.mjs` row, `:23`).
   `REQUIRED_DOCKER_ASSERTIONS` therefore lives in an unpinned module today (`test-execution.mjs:84`). Nuance (Opus):
   `test-contract.mjs`'s load-bearing identities (`TIMING_TESTS`, `REPORTS`, `DOCKER_TEST`, `DOCKER_REPORT`) are already
   pinned **transitively** — they are interpolated into `EXPECTED_TEST_COMMANDS`/`EXPECTED_DOCKER_COMMANDS`
   (`:18-27`), which `check-test-entry.mjs:25-27` compares to the hash-pinned `package.json#scripts`; only the three
   start-file names are genuinely unpinned there. The unpinned surface that matters is `test-execution.mjs`, which
   holds the rule bodies and both title literals. The BACKLOG's "digest refresh" follows only if the change lands in,
   or widens, the pinned set — D-1 (§3).
5. **Where the self-test runs.** `executionSelftest` (`scripts/test-execution.selftest.mjs`) runs in-suite
   (`rootOfTrust.test.ts:61`) **and** at the head of `npm test` (`scripts/check-test-entry.mjs:69`). It asserts the
   mutant-code set equals `EXECUTION_RULES` (`selftest:63`, `test-execution.mjs:11-13`), so a new rule without a named
   mutant is itself red. `filesystemCases` (`selftest:46,52`) and `scripts/gate-cli.selftest.mjs` (driven by
   `docker-invocation.selftest.mjs:270`; it copies the real `scripts/` into a temp tree and runs the real CLI against
   `executionFixture` reports, `gate-cli.selftest.mjs:29-45`) both execute the **production** `checkExecution` over the
   fixture on disk, so the fixture's timing-2 rows must satisfy the production literal exactly; today the fixture's
   timing-2 bundle carries one synthetic row `test <file>` (`selftest:7-15`) and must change with the rule.
6. **The motivating reaching input.** Sol R3 (`artifacts/review-evidence/tinyvault-m7-entry-20260909/review-c2-fix-sol-r3-report.md`)
   registered tests through `(await vi.importActual<typeof import('vitest')>('vitest'))['it'](…)`, a descriptor read
   and a computed destructuring, compile-clean, past all 32 source predicates; the cap correction closed those exact
   spellings and narrowed the claim. Any such registration, by construction, appears in the timing-2 report as a 27th
   `fullName` — which is what this rule pins.
7. **Rule precedence when the source scan is red.** The pinned-source test lives in the same file; if it reds, the
   report's `success` is `false` and `report-success` (`:42`) fires before any assertion is inspected. The execution
   pin is therefore the layer that matters **exactly when the source scan is evaded**, and its own proof is at the
   report level (V6), not through a spelling the scan already catches.

## 2. Rule R1 — `timing-2-inventory` (one behaviour change)

- **Literal.** `export const REQUIRED_TIMING_2_ASSERTIONS = Object.freeze([ …26 strings… ])` in
  `scripts/test-execution.mjs`, directly beside `REQUIRED_DOCKER_ASSERTIONS` (`:84`), one string per line, verbatim
  `fullName`s in report order. An **independent literal**: never imported from `testbed/probe/*` (the source-side title
  contracts), never computed from the test file or the report at check time, no template assembly from a suite prefix.
- **Check.** In `inspectReport`, after `assertions` is collected and **before the counters rule**, when `mode === 'test'`
  and `expected` is exactly `[TIMING_TESTS[1]]` (the partition identity — `partitions` returns that constant as group 2,
  `:17-22`, and bundle order follows `REPORTS`; not a string match on report file names, which `report-files` pins):
  `requireRule(equal(sorted(assertions.map((a) => a.fullName)), sorted(REQUIRED_TIMING_2_ASSERTIONS))
  && assertions.every((a) => a.status === 'passed'), 'timing-2-inventory')`.
  Sorted-array equality is multiset equality: a missing, extra, renamed or duplicated title is red. `equal`/`sorted`
  are the existing `gate-common.mjs` helpers. Placement before `report-counters` is witnessed by M-T9.
- **Rule list.** `EXECUTION_RULES` gains `'timing-2-inventory'` (forced by the self-test's set equality).
- **Modes.** Test mode only. Docker and eval bundles never contain the timing-2 file, and the rule keys on `expected`,
  so no docker/eval behaviour changes; §4 asserts it.
- **Not changed:** `partitions`, `checkPartitions`, `assertionsFor`, the counters rule, `proveClaimExecution`,
  `REQUIRED_DOCKER_ASSERTIONS`, `scripts/test-contract.mjs` bytes, `check-test-entry.mjs` logic and command grammar,
  `package.json`, `Makefile`, the Vitest configs, `src/**`, `testbed/probe/*` (one comment line excepted, §6),
  `host.timing.browser.test.ts`.

## 3. D-1 — where the reviewed bytes live (DECIDED by the user 2026-09-10: Option A)

- **A (recommended; both channels concur).** Literal in `test-execution.mjs` beside the docker literal; **widen the
  pinned root by exactly two named files**, `scripts/test-execution.mjs` and `scripts/test-contract.mjs`.
  `currentPins()` (`rootOfTrust.test.ts:27-33`) lists them explicitly next to the `check-*.mjs` glob; two PINS rows are
  added; `verifyPins` compares key sets (`:35`) so the test stays balanced, `it.each(Object.keys(PINS))` (`:42`) picks
  up the content mutants, and the glob-drift test (`:48-54`) is unaffected. Every later edit of those two files then
  needs a deliberate digest refresh in the same diff. Cost: the declared-root sentence in `gate-common.mjs:1-6`,
  `check-test-entry.mjs:4-5`, `check-test-execution.mjs:4-5`, `testbed/docker/no-docker.setup.ts:3-4` and the PLAN
  Decisions Log entry of 2026-09-05 enumerate the pinned set and gain "plus `scripts/test-contract.mjs` and
  `scripts/test-execution.mjs`" (comments: Astra; PLAN: owner). Recorded limits: A pins two *named* files, not "every
  identity module" — a future `scripts/<x>-identities.mjs` would escape both — and the selftest modules stay unpinned.
- **A-minimal (variant for the user).** Pin `scripts/test-execution.mjs` alone. Per §1.4, `test-contract.mjs` is already
  mostly pinned transitively, so this captures nearly all of A's value with one added row. Not recommended only because
  the start-file names would stay unpinned and the "identity modules" sentence is cleaner with both.
- **B.** Literal in `check-test-execution.mjs` (already pinned), passed to `checkExecution(root, mode, titles)`. No
  root-set change; but `filesystemCases`/`evalCliCases` and `gate-cli.selftest.mjs:116` call `checkExecution` directly,
  so a titles parameter would default to undefined and the self-test would exercise a rule the CLI does not (or none) —
  the proof weakens.
- **C.** No pinning change: literal in `test-execution.mjs` only. Cheapest; the BACKLOG's "digest refresh" was then a
  mistaken assumption and is recorded as such; the rule (and today's docker names) can then be deleted by an unpinned
  two-file edit without a red — the bar it matches is low, and that is stated.

**Digest rows (corrected, round 1 P1):** the §6 header edit to `check-test-execution.mjs` happens under **every** option,
and A also edits `check-test-entry.mjs`; both are pinned. **A: two refreshed + two added (four rows). A-minimal: two
refreshed + one added. B: one refreshed. C: one refreshed.**

## 4. Self-test (`scripts/test-execution.selftest.mjs`)

- **Fixture.** `executionFixture` (`selftest:16-20`) keeps its groups; `report()` (`:7-15`) emits, for the
  `TIMING_TESTS[1]` file, the 26 rows of a **selftest-local constant `timing2Names`** — an *independently transcribed
  copy of the same 26 strings* (not derived from, not imported from, the production constant; docker precedent
  `selftest:78-85`). It **must be byte-identical** to `REQUIRED_TIMING_2_ASSERTIONS`, because `filesystemCases` and
  the CLI self-test run the production rule over this fixture; a divergence between the two copies is itself a red,
  which makes the self-test a second transcription check. Counters are computed from the rows. Every other file keeps
  one `test <file>` row.
- **Mutants** (each applied to a fresh fixture, expected to throw the named code, fixture then green again — the
  existing loop at `selftest:64-68`): **M-T1** rename one timing-2 title (`+ ' hidden'`) → `timing-2-inventory`;
  **M-T2** append a 27th passing row, counters coherent → `timing-2-inventory` (proves `report-counters` cannot mask
  it); **M-T3** remove one row, counters coherent → `timing-2-inventory`; **M-T4** duplicate one row, counters coherent
  → `timing-2-inventory` (the non-redundant multiset witness; a `Set` implementation survives it); **M-T6** the 26
  titles under a different suite prefix → `timing-2-inventory`; **M-T9** append a 27th passing row and leave the
  counters **stale** → `timing-2-inventory` (the placement witness: R1 precedes `report-counters`).
  **M-T5** (precedence witness, recorded, *not* a `timing-2-inventory` mutant): one timing-2 row `skipped`, counters
  coherent → `skip-identity`. **M-T7** (ordering witness, corrected in round 1): **swap** `bundles[1]` and `bundles[2]`
  so `actualFiles` stays unique → `report-files` (`:45`), which precedes R1; a plain copy would red `partition-disjoint`
  (`:62-63`) before `inspectReport` runs. **M-T8** (keying control, positive): a coherent **27-row timing-1 bundle**
  (`TIMING_TESTS[0]`, 27 distinct titles, counters coherent) stays **green** — R1 is keyed on the timing-2 partition, not
  on "any timing file"; the untouched fixture (one row for timing-1) already witnesses this at `selftest:67`, M-T8 makes
  it explicit.
- **Mode isolation.** `modeFixture('docker')` and `modeFixture('eval')` stay green unchanged (`evaluationCases`,
  `:96`), and the eval-mode mutant loop is unchanged. (A positive "docker bundle with 26 arbitrary titles is
  unaffected" case is optional; the `expected` keying makes it structural.)
- **Codes.** `EXECUTION_MUTANT_CODES` gains `'timing-2-inventory'`; the set-equality assertion at `:63` passes.
- **CLI self-test.** `gate-cli.selftest.mjs` inherits the fixture; `evidence()` mutates only `bundles[0]` (`:38-41`)
  and writes every bundle unchanged (`:44`), so it needs **no** edit given a byte-identical `timing2Names`. If it does,
  the edit is reported as a deviation with the reason.
- **Literal hygiene test (in-suite, `rootOfTrust.test.ts`).** `REQUIRED_TIMING_2_ASSERTIONS` has length 26, no
  duplicates, every entry a non-empty string with no leading/trailing whitespace. Correspondence to the **real** report
  is **owner-verified (V6), not gate-verified**: the timing-2 partition cannot run in-suite. Stated as such.

## 5. Digest refresh (`testbed/rootOfTrust.test.ts`, Astra-owned for this slice)

Compute with `shasum -a 256 <file>` on the final bytes; `package.json#scripts` is unchanged. Report a table
`file | old digest | new digest`. **Under A: `scripts/check-test-execution.mjs` and `scripts/check-test-entry.mjs`
refreshed; `scripts/test-execution.mjs` and `scripts/test-contract.mjs` added.** Under A-minimal: the same two
refreshed, `scripts/test-execution.mjs` added. Under B or C: `scripts/check-test-execution.mjs` refreshed only. Verify by
running V2 once red (stale digest) and once green (refreshed) and quoting both results.

## 6. Comments and docs

- `scripts/check-test-execution.mjs:1-8` header (**every option**): "File inventory and six required Docker names are
  pinned" → "…, six required Docker names and the 26 timing-2 test titles are pinned"; under A/A-minimal also add the
  new file(s) to the declared-root sentence (`:4-5`).
- Under A/A-minimal, the same declared-root sentence in `gate-common.mjs:1-6`, `check-test-entry.mjs:4-5` and
  `testbed/docker/no-docker.setup.ts:3-4` — and in that last file correct the pre-existing "both Vitest configs" to
  "three Vitest configs" while it is touched (round-1 P3, both channels). `scripts/docker-invocation.mjs:3` does not
  enumerate the set and is **not** edited.
- `scripts/test-execution.mjs:1-3` header: state the new pin in one clause.
- `testbed/probe/timingSourceResolve.ts:38`: the trailing "(follow-up: pin the timing-2 report's exact 26 titles in
  `scripts/test-execution.mjs`)" becomes "(the execution gate's `timing-2-inventory` rule pins the report's exact 26
  titles)". Both channels verified that no pinned-source predicate reads this file's bytes (the compiler reads the
  timing test, sidecar and fixture sources, `timingSourceCompiler.ts:43-47`), so the edit is safe; the STOP rule stays as
  belt-and-braces: edit only if `npx vitest run testbed/probe` stays green.
- Owner at integration: BACKLOG item closed; register entry; PLAN Decisions Log ("execution-side inventory pin over a
  fourth source-scan round because …" and, under A, the widened root); no SCHEMA/README text mentions the gate's title
  pins (grep verified), so no contract doc changes.

## 7. Verification (report each with command and result; owner reruns every one)

- **V1** `node scripts/check-test-entry.mjs` — runs `executionSelftest` at the head of the gate.
- **V2** `npx vitest run testbed/rootOfTrust.test.ts` — in-suite self-test + digest pins (plus the stale-digest red
  quoted per §5).
- **V3** `node scripts/docker-invocation.selftest.mjs` — the CLI self-test on the copied real scripts.
- V1–V3 are **sandbox-permitting**: all three route through `fs.mkdtempSync` (`selftest:73,113`,
  `gate-cli.selftest.mjs:57`), which the Codex sandbox usually refuses; if `mkdtemp` EPERMs, quote the error verbatim
  and mark the item owner-only. A sandbox PASS is never mistaken for proof; the owner reruns all three.
- **V4** `npx tsc --noEmit`: PASS.
- **V5** Astra: `make test` in the sandbox — list host-only failures verbatim (loopback `EPERM`, Chromium mach-port
  denial), do not repair; the sandbox cannot run timing-2 at all.
- **V6 (owner, real tree, after V1–V4 on the candidate):** (a) `make test` on the candidate: green, with the timing-2
  partition's actual verdict recorded (a Probe P rejection is recorded, never rerun to green — user rule of
  2026-09-10). (b) **Report-level mutants on the real report:** copy the green run's `.vitest/*.json` aside; edit
  `.vitest/timing-2.json` to (i) add a 27th `passed` row with counters adjusted, (ii) rename one title, (iii) drop one
  row with counters adjusted; after each, `node scripts/check-test-execution.mjs` must print
  `gate FAIL: timing-2-inventory`; restore the file; the CLI prints `test execution PASS`. This is the rule's proof on
  real file paths and real `fullName`s and the only check of literal↔report correspondence (§4), independent of the
  source scan (§1.7); `report-fresh` stays satisfied because the rewrite moves the mtime forward. (c) Optional: if a
  reviewer supplies a compile-clean registration that passes the current source scan, run the timing-2 partition with
  it on a quiet host once and record which rule fires; absence of such a spelling is not a gap in this packet.
- **V7** `make test-docker` unchanged expectations (7/7); docker mode is untouched (§2), so this is a regression check.

## 8. Ownership, leave-alone, STOP

Astra owns: `scripts/test-execution.mjs`, `scripts/test-execution.selftest.mjs`, `scripts/check-test-execution.mjs`
(header comment only), `testbed/rootOfTrust.test.ts` (PINS rows, `currentPins`, the §4 hygiene test), the §6 comment
lines, and — only if V3 requires it — `scripts/gate-cli.selftest.mjs`. Leave alone: everything else, in particular
`scripts/test-contract.mjs` bytes (pinned as-is under A), `check-test-entry.mjs` logic, `testbed/probe/*` beyond the one
comment, `host.timing.browser.test.ts`, `PLAN.md`, `BACKLOG.md`, the register, `.claude/memory/*`. Single writer, no
subagent edits; leave the work uncommitted. **STOP and report** if: the green report is not present at the path named
in the dispatch or its SHA-256 differs from §1.1; the report's 26 titles differ from §1.1 (drift); the rule cannot be
keyed on `expected` without touching `partitions`; V3 needs a change outside the owned list; the user's D-1 choice is
not stated in the dispatch; a pinned-source predicate is red after the §6 comment edit.

## 9. Reporting

The `docs/handoff-pattern.md` §13 implementation report, plus: the digest table (§5); the mutant table (`mutant |
rule code observed | restored green`) covering M-T1–M-T9; V1–V5 verbatim with the sandbox caveats; "Deviations From
Handoff" mandatory (a code comment is not a deviation record).

## 10. Paper rounds — cap-round criteria stated now

Three paper rounds at most (Sol `task --fresh --model gpt-5.6-sol`, READ-ONLY, plus a blind fresh-context Claude
reviewer each round; register written only when both are in). **P1 in the cap round means only:** (a) a report shape,
reachable from a registered-and-executed timing-2 test that changes the title multiset, that `checkExecution` still
accepts; (b) the current legitimate green report newly red under R1 (a false red); (c) a self-test that cannot kill one
of its named mutants or that breaks the CLI self-test; (d) an internal inconsistency in the chosen D-1 option.
Everything else is P2/P3 with a proof and is recorded. Every finding is verified by the owner line by line before
disposition.

## 11. Decisions (taken by the user 2026-09-10; recorded here verbatim in substance)

- **D-1 — Option A.** Pin `scripts/test-execution.mjs` and `scripts/test-contract.mjs`, with the four digest-row changes
  of §5. The claim is limited to detecting changes in the reported title multiset; title-preserving substitutions and
  reporter/root-of-trust modifications remain explicit residuals (§0). A-minimal, B and C are not taken.
- **O-1 — No.** No timing-1 (`testbed/checkers/leakDecoders.timing.test.ts`, five wall-clock budget titles, no source-side scan
  and no registration-isolation finding on record): include a `timing-1-inventory` twin now (same mechanism, one more
  literal) is **not** included in this packet. The asymmetry (timing-2 two controls, timing-1 zero) is recorded, not acted on.
- **O-2 — No.** No additional security-specialized channel for this packet; the specified Codex adversarial review of
  the code, Claude `/review` and owner gates are retained.
- **Not authorized by these decisions:** implementation, merge of implementation work, a second campaign, live-provider
  spend, push, public flip. Probe P's existing gate and historical-failure dispositions are unchanged.

## 12. Round 1 dispositions (owner, 2026-09-10; every finding verified against the source)

**Sol R1 — NEEDS-ATTENTION, 2 P1 / 1 P3.** P1-01 digest accounting (A touches both pinned check scripts; C still
touches `check-test-execution.mjs`) — absorbed in §3/§5 (four rows / one row). P1-02 M-T7 as written reds
`partition-disjoint` (`test-execution.mjs:62-63`) before `report-files` — absorbed: M-T7 is now the bundle swap, M-T8
the positive timing-1 control. P3-01 `no-docker.setup.ts:3-4` "both Vitest configs" — absorbed in §6. Q1–Q7 all PASS
with evidence (no accepted reaching shape within the claim; no false red; scope clean; V6(b) valid; recommend A; O-1/O-2
no).

**Opus R1 (blind) — NEEDS-ATTENTION, 2 P1 / 3 P2 / 4 P3.** P1-01 and P1-02 convergent with Sol (both absorbed as
above). P2-01 the §0 claim was broader than R1 (title-preserving substitution; no claim selector names the timing file;
the M6 half has no body pin on either side) — absorbed: claim narrowed to "changes the title multiset", substitution
recorded as a residual. P2-02 `timing2Names` must be byte-identical (the production rule runs over the fixture on disk)
— absorbed in §4. P2-03 the transcription source is gitignored and absent from the evidence directory — absorbed: green
report copied with its SHA-256 (§1.1), STOP added (§8). P3-01 §2 `check-test-entry.mjs` qualified as "logic and command
grammar". P3-02 `docker-invocation.mjs:3` does not enumerate the set (dropped from §6); "both" → "three". P3-03 citation
drift corrected (`:42`, `:17-22`, `selftest:63-68`, "only closed-set inventory rule"). P3-04 V1–V3 sandbox caveat added.
Test gaps: stale-counters mutant (M-T9, absorbed); unkillable second conjunct stated plainly (§1.3); literal↔report
correspondence owner-verified only (§4, §7). Residual risks recorded in §0/§3: title-preserving substitution;
reporter-format coupling; A pins named files only; `test-contract.mjs` largely pinned transitively (A-minimal variant
offered); under C the rule is deletable without a red, as the docker names are today.
