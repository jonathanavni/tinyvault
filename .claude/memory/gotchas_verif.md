# Gotchas — verification, gates and mutants

Owner gate discipline, verification blind spots, mutant hygiene, evidence handling and measurement claims. The rule behind most of these: a checker whose failure mode is silence is the same bug as a leak checker that cannot go red.

<!-- One entry per gotcha: `- **<short title>** — <the trap>, <how to detect it>, <the fix>. (<date>)`. Entries were moved here verbatim in the 2026-09-09 consolidation; add new ones under the matching heading. -->

## Verification blind spots (learned the hard way in M2, 2026-09-01)

- **A leak checker's own test fixtures must not come from the code under test.** The meta-gate originally
  generated its planted encodings by calling production `secretTransforms` — so deleting an encoding deleted
  its own test and the gate stayed green. Fixtures are now independently constructed with per-transform
  mutation tests. Detect: ask "would this test fail if I broke the thing it tests?" (2026-08-31)
- **Gap-tolerant substring matching is unusable on real transcripts.** An in-order character-subsequence scan
  for a leaked secret hits ~78% false positives at 6KB and 100% at 16KB+ of ordinary mixed-case agent
  chatter. Use contiguous-chunk reassembly with a minimum chunk length instead. (2026-08-31)
- **A validator's verification must cover every branch the validator has, not every branch its tests
  have.** I verified an origin-guard fix with ASCII-only probes — mirroring the test suite's own blind spot
  — and reported it closed. A reviewer probing the IDN branch found `０x7f000001` (fullwidth zero) still
  normalizing to `127.0.0.1`. Probing the same inputs the tests use confirms nothing.
- **Fix the class, not the instance.** The C3 control-character guard shipped with no test that could kill
  it, because every control vector used an ASCII host where an earlier check rejects first — *verbatim the
  finding from the previous round*. The fix slice had already worked out that the IPv6 authority is the
  right region for trailing junk and wrote exactly that test for the backslash guard three lines away,
  without extending the reasoning.
- **A fix can move a hole instead of closing it.** Deleting the gate's filename exemption so `isProtected`
  would be "the directory rule alone" created a third directory with no rule — and the secret matcher
  ended up in it. Ask what the fix *creates*, not just what it removes.
- **"Not exploitable today" is the wrong test for a stated boundary.** It either holds or it does not.
- **My own tooling is not exempt.** A sweep script written to retire an unverifiable prose claim shipped
  with a structurally unreachable collision oracle — a permanently green metric. Every checker needs its
  own absence-detection signal: mutate the thing it watches and confirm it goes red.

## Owner gates and commit chains

- **Never gate a commit on a hard-coded test count.** A `grep -q "7 passed"` guard silently skipped the fix-final3
  commit when the slice added an eighth timing test; the worktrees, review packets and a Codex review were then
  built on the wrong (docs-only) range and had to be cancelled. Gate on the exit code, and print the resulting
  HEAD hash before anything downstream uses it. (2026-09-02)
- **Every integrator edit re-runs `tsc` before the commit, and the run stanza is measured on the final tree.**
  A one-line test narrowing after the integrator run dereferenced an optional field; vitest ran green (no
  typecheck), the commit stanza said "tsc OK" from the earlier run, and `make test` was red on the reviewed commit.
  The `tsc && test` chain must be the last thing before `git commit`. (2026-09-02)
- **A verification chain that commits must fail closed at every step — `cmd; next` after a failing `tsc` still
  commits.** The slice-3 fix-round-2 chain used `;` between typecheck and the rest, so a test file with a syntax error
  was committed (`1507ef7`) and even got a green `make test-docker` (that file is on the `make test` path, not the
  Docker suite's). Caught by tsc and by the next review round. Use `|| exit 1` after every gate in a chain, and never
  put a commit after a step whose failure the chain can skip. Related: a `while … [ x ] && { …; }` loop's exit status
  is the last test's — with `&&` after it, the quiet path silently skips the rest; use `if`. (2026-09-05)
- **Reading a stale `.vitest/*.json` report as a result.** After a chain aborted before Vitest ran, the report files from
  the previous run were still there and read as "green". The execution proof deletes them first for exactly this
  reason; do the same in ad-hoc chains (`rm -f .vitest/*.json` before Vitest) or print the report mtime. (2026-09-05)
- **Do not commit on `main` while a background chain is merging or testing on `main`.** The memory/docs-index commit
  landed while the slice-3 merge chain was running in the same checkout; the merge is atomic and tests do not read
  docs, so nothing broke, but a code edit at that moment would have tested a tree that was not the one committed.
  One writer per checkout applies to the integrator too. (2026-09-05)
- **A worker's targeted vitest run is not the gate.** The S4 candidate's 422-test targeted suite was green while `make test`
  was red on three files it never ran (controls matrix, the 800-line structural pin, the wall-clock meta-gate). Always run
  the full `make test` yourself before starting a review round, and copy `.vitest/*.json` into the evidence archive.
  The retention allowlist and the Docker capability map are also gates a worker cannot edit: expect a STOP on the first
  new function in `session.ts` or the first `node:http`/`node:net` import in a new test, and pre-authorize additions-only.
  (2026-09-07)
- **Three-round review ladders find different things each round; budget for it.** S4: R1 7 P1 across channels (drain
  convergence, deadline armed too late, stop-failure semantics), R2 3 P1 (child targets destroyed before the drain,
  quiesce budget over-subscribed), R3 one evidence-gap P1. Each round's fixes created the next round's findings; the
  cap with stated P1 criteria is what ended it. (2026-09-07)
- **Run `make test` after EVERY owner commit to `main`, not only at slice integration — and never add a wall-clock
  assertion outside the two serial timing files.** The S4 residual-(8) test-only commit (`46ae3df`) added a
  `performance.now()` bound to a non-serial browser test; the checker meta-gate forbids exactly that (it lists the
  offending file), and the failure only surfaced two commits later inside the S5 candidate's gate run, where it
  was briefly indistinguishable from a worker defect. If a bound is needed, it belongs in
  `src/supervisor/host.timing.browser.test.ts` / `testbed/checkers/leakDecoders.timing.test.ts`; check whether the
  timing family already asserts it (here it did). Also: `testbed/rootOfTrust.test.ts` pins SHA-256 of
  `package.json#scripts` and `Makefile`; any approved script/target change needs an owner-reviewed pin update in
  the same commit. (2026-09-08)
- **Measurement runs (gate cost, timing partitions) must have the host to themselves.** A Codex `task` that runs `make test` in its sandbox, an Opus review helper, or an owner gate running concurrently contaminates wall/RSS numbers and pushes the statistical timing-2 partition toward rejection. Sequence: measure first on an idle host, then dispatch. Preserve every `.vitest/*.json` after each run — a later run overwrites them and a red becomes unattributable (happened once: V13 candidate run 2, 2026-09-08).
- **A test at >90% of Vitest's 5,000 ms default timeout is a latent clean-clone red.** Check `.vitest/main.json` durations after a slice lands (W6 in `runner.realAgent.test.ts` ran 4.83–4.94 s with no explicit timeout while every neighbour had `30_000`); the implementer's sandbox timeout was the early warning.
- **Never chain a commit or a review dispatch behind a gate in one script.** On 2026-09-08 an owner script ran `make test-docker`, then committed and dispatched a Codex review regardless of the Docker exit code, and told the reviewer "Docker green" while the gate had failed (`K-leg` parity). Gate → read the result → decide → commit/dispatch as separate steps, and quote gate results only from the log you just read.
- **Never edit a tracked file while `make test` is running — the pilot-path test reds as `source-drift`.**
  `testbed/realAgentRun.test.ts` ("F8 … completed", via `expectPilot`) runs the real command path, which snapshots the
  source inventory at invocation start and re-enumerates at the end (`testbed/runner.ts:188`); the inventory covers
  docs, so a README or `docs/*.md` edit landing mid-run turns the exact reason list `['pilot-not-qualification']` into
  `['source-drift']` and the main partition goes red (timing partitions then never run). Seen 2026-09-09 during the M6
  close-out while applying assessment-driven docs fixes in parallel with the gate. Rule: apply every edit, *then* run
  the gate, and do nothing in the worktree until it exits; preserve the red, never delete it. (2026-09-09)
- **Same machine, same commit, different verdicts on probe P.** The final M4 security channel saw `npm test` red in
  2 of 3 runs (three timing rejections at |Δ| ≤ 0.17 ms) while the QA channel, minutes apart, saw 10/10 gate
  observations pass. Three reviews and a Codex job were running concurrently — the serial-last invocation quiets the
  test process, not the machine. Report every number with its load context; never treat one channel's red as a code
  defect without the other channel's numbers. (2026-09-02)
- **A stress scan sharing a test with a benchmark assertion hides its own regression.** After M5-M1 the 200-event junk scan in
  `leakDecoders.timing.test.ts` runs ~60 s — under the 60 s cap on some runs, over on others (65.8 s alone). The merge and
  hygiene gates were green by variance. Benchmarks assert a bound on a small corpus; stress scans get their own test and
  their own bound. Found by the post-M5 assessment, not by the ladder. (2026-09-03)
- **A wall-clock budget inside an offline checker breaks the recompute invariant.** A 100 ms per-event deadline made
  `leakScan` load-dependent: the same `events.json` scored `truncated` under a loaded parallel suite and clean
  alone, and the adjudicator's stored-vs-recomputed agreement check would then reject runs nondeterministically.
  Bound checker work in deterministic units (decoded outputs, bytes, trials per event), never time. (2026-09-03)
- **`src/supervisor/host.test.ts` sits at the 800-line auditability gate (`fillService.structure.test.ts`)**; new
  lease-level tests go in `host.evidence.test.ts` (bare `new EvidenceLease(CANARY)` + fake requests). (2026-09-04)

## Mutants and evidence

- **A symlinked `node_modules` in a mutant workspace produces false reds.** A reviewer's `git archive` copy that
  symlinked `node_modules` back into the real repo started failing with "Worker exited unexpectedly" **on pristine
  source** after several parallel vitest runs. They discarded the results and rebuilt with a real copy. If you build
  throwaway trees to test mutants, copy `node_modules` or accept that a red may be the workspace, not the code.
  (2026-09-04)
- **A malformed mutant looks exactly like a passing gate.** Verifying the Acceptance J wiring pin, a `node -e`
  mutant reported "no tests" — which reads as "the gate didn't fire". It was invalid JSON written by the mutant
  script, not the assertion failing; rewritten through Python's `json` module it failed cleanly on the intended
  assertion. **Always confirm a mutant produced a valid tree before recording it as red or green.** (2026-09-04)
- **An owner mutant "kill" must record the failing test NAME, never just a nonzero exit — and the Bash tool's shell
  is zsh.** Two pitfalls produced six false kills in one S5 spot-check run: (1) `PIPESTATUS` is bash-only (zsh:
  `pipestatus`), so under `set -u` the loop died after the first iteration; (2) zsh does not word-split an unquoted
  `$FILES`, so vitest received five paths as ONE argument, printed "No test files found" and exited 1 — which looks
  exactly like a kill. Pass file names inline (or `${=FILES}`), write vitest output to a per-mutant file, and grep
  the `Tests N failed` line plus the failing title into the log before calling anything killed. (2026-09-08)
- **A write spy must snapshot bytes at invocation.** Retaining a Buffer reference lets production zero
  or reuse its backing memory before the test scans it, making an actual write look empty. Copy bytes
  synchronously in the observer; prove it with a write/erase mutant. Slice4 JobD round3 exposed this
  test-observer defect; the accepted key-proof partition remains in register Entries34–37. (2026-09-05)
- **A rejection-category assertion can hide the ordering observation a mutant is meant to prove.**
  Collect strict and diagnostic results plus independent source-factory counts before asserting the
  expected error category. M6 S1's completion-binding deletion then natively exposed one strict and
  two diagnostic source calls; the earlier test stopped at the category mismatch before either spy
  check. Detached/replaced spies prove no ordering, and redundant-guard/category-only mutations must
  remain labelled narrowly. Canonical limits: M6 register S1 R3. (2026-09-07)
- **Never archive `*.test.ts` copies under `artifacts/` — vitest's include glob picks up gitignored paths** (plain `.ts`/`.mjs`
  archives are inert: tsconfig includes only `src/**` and `testbed/**`). Astra's M6.1 mutant evidence carried `base/testbed/parity/claims.test.ts`; copied into
  `artifacts/review-evidence/…`, it ran as a fourth test file in the next vitest invocation and failed on an unresolvable
  relative import (a full `make test` on that tree would have gone red too). Rename archived test copies with a
  `.snapshot` suffix at archive time, and check `find artifacts -name '*.test.ts'` is empty before any gate. (2026-09-09)

## Measurement claims and model-facing text

- **Aggregate consumer bounds do not automatically dominate producer validation.** Slice5 producers
  validate scalar strings before serializing the envelope. Their per-field byte cap bounds the subsequent
  `[...value]` allocation, even where consumer parsing already has a total artifact cap. Evaluate each
  caller's order before removing apparently redundant guards. Boolean rejection vectors do not prove
  each redundant schema limb: distinguish input vectors from guard-specific deletion proof. Slice5
  register Entry8 records that measurement limit without a stronger security claim. (2026-09-06)
- **Exact prompt headroom belongs to a source/input snapshot.** AM11 counts the whole root SKILL plus
  serialized bootstrap; safe ASCII run IDs occur in both URLs, so extra characters cost twice. Labels,
  handles, inventory count, URL widths and JSON escaping also matter. S3's finite witness margins are
  historical measurements, not a reserve for S5. Remeasure actual cohort identities/metadata without
  truncation or weaker uniqueness. Canonical measurements and limits: M6 register S3 R2. (2026-09-07)
- **Available metadata is not backend availability.** S3 reference preparation requires a fresh trusted
  availability probe as well as list-once metadata; discovery, probe, setup mapping and filling must
  share one backend at S5 construction. Injected callbacks cannot detect a mismatched binding. Preserve
  the shallow-bootstrap/trusted-caller and probe-count/throw-arm proof limits in the M6 register. (2026-09-07)
- **Example values in model-facing text must never be live or fixed fixture origins.** The composed topology pins fixtures at `http://127.0.0.1:47110/47120/47121/47130` (`testbed/docker/compose.ts` PORTS) and the K-leg parity normalizer symbolizes anchored origins wherever they occur in text, so a literal that matches one leg's origin breaks two-transport parity. Use RFC 2606 names (`https://vault.example`). A regression witness now pins this in `src/agents/anthropicClient.test.ts`.
- **Do not edit the working tree while a blind review of a pinned range is running, even without committing.** The 2026-09-09
  M7-entry Opus QA review consulted the tree mid-run, saw four reviewed files change under it, and filed a P1 process finding
  ("the green gate on `4b0f3b7` no longer describes the tree"). "Hold commits while a review runs" is not enough: reviewers
  read the tree, not only the range. Draft fixes in the evidence directory or a separate worktree and apply them after every
  channel has reported. (2026-09-09)
