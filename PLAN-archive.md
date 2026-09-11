# PLAN Archive

Full detail of completed or no-longer-load-bearing work, moved out of `PLAN.md` so its Current State stays lean. Reviewed every `/wrapup`: anything no longer needed to understand current/next work lands here as a short, dated summary.

This file is for historical context. It is never read at `/start`.

---


## Archived 2026-09-11 (runtime-fill-control) — the m7-final-acceptance Current State paragraph and the runtime-fill-control focus stamp (verbatim)

`2026-09-10-m7-final-acceptance` — **closed 2026-09-10** (one calendar day; continuity relinquished). State checkout `/Users/jonathanavni/Documents/Coding/tinyvault`, branch `main` at this wrapup commit; `origin/main` = `ca43cd9` (**everything after is local and unpushed — no push authorized**). **Shipped:** the M7 final acceptance per `docs/m7-final-acceptance-handoff.md` — owner mutant table on `9a826e5` (16 + 7b + 9c; row 7 equivalent, recorded), Docker 240 s per-export deadline via Astra (`2aead00`, no deviations), focused reviews of `828c769..2aead00` (Codex NEEDS-ATTENTION 1 P1/1 P2; blind Opus QA NEEDS-ATTENTION 0 P1/2 P2/1 P3 + gap; all dispositioned, the 579 → 965 pin fixed as `b7889d3`), gates green on `b7889d3` → **user approved → M7 MERGED `4e86933`**, E10 integration `29f704a`, merged-tree `make test` / `test-docker` 7/7 / `eval-stub` and a literal clean clone green; register "M7 final acceptance" and "M7 MERGED" entries; the merged `codex/m7-fixtures` and `codex/timing2-inventory-pin` branches and the candidate worktree deleted at wrapup. **Accepted residuals:** the diagnostic DOM count reports executed increments (the observer establishes emission; mutant 9c); the `828c769` Probe P rejection stays unadjudicated; scanner throughput and the `initialSnapshotJoin` guard in BACKLOG. **Next session (user-decided 2026-09-10, Decisions Log):** `main` pushed at this wrapup (private remote). (1) **E8b live cohort** — one pre-declared cohort, 5 × 2 × 10 = 100 runs; first write the pre-registration (exact candidate SHA and configuration incl. `SKILL.md` `0dc375cd…` 513 bytes, expected cost, spend ceiling, run-accounting/stop rules) and **bring the proposed dollar cap to the user before any spend** (no ceiling is authorized yet); quiet host, no concurrent development or review workloads; preserve every outcome, no replacement runs. (2) **M8 MCP stdio adapter** — draft the plan-mode packet from `docs/phase-0-plan.md` §8 (🔴 full ladder) and run the paper reviews; return the reviewed packet before implementation. (3) Public flip deferred; keep the E8b evidence-status sentences current. No worktrees, jobs, reviews or campaigns running. Verbatim narrative in `PLAN-archive.md` ("Archived 2026-09-10 (m7-final-acceptance)").

`2026-09-11-runtime-fill-control` — focus: the user-authorized runtime fill-control design packet (`docs/m7-runtime-fill-control-packet.md`, per `docs/m7-e8b-runtime-control-handoff.md`) through the paper ladder (Sol read-only + blind Opus per round, security-framed blind third channel, cap three, round-3 P1 criteria stated up front) and the reviewed proposal returned to the user; **paper only** — no `src/` code, no `SKILL.md` change, no `make eval`, no provider spend, no push, no public flip; cohort `ODMFYbwH` untouched (no rerun, replacement or rescoring); M8 implementation waits; owner: claude; state: active; state checkout: `/Users/jonathanavni/Documents/Coding/tinyvault`; worktree: none (read-only reviews run from the checkout); branch `main` at `b501d7e`. **Update 2026-09-11:** paper ladder complete (rounds 1–3; cap QA PASS / security PASS / Sol NEEDS-ATTENTION absorbed), rev 3 returned, **user decisions recorded (Decisions Log) — design A approved, implementation authorized through the Astra ladder (packet §13), not yet dispatched**; state files committed with explicit paths; next: Astra implementation slice on `codex/runtime-fill-control` (recommended in a fresh session), candidate back with review and gate evidence before merge approval.

## 2026-09-04-m5.2-slice2 — M5.2 slice 2 (archived 2026-09-05 at slice 3's merge)

Collapsed from `PLAN.md` Current State once slice 3 merged (`8afce07`) and re-declared or resolved every residual
slice 2 had carried. Verbatim block as it stood in Current State:

**M5.2 slice 2 ✅ MERGED** — the harness now resolves, validates and **pins** its Docker endpoint, invokes Docker
through one choke point, and fails closed on composed construction. Session tests 995 → 1182.

Ladder actually run: **2 pre-impl plan rounds** (C-T1 NEEDS-ATTENTION, C-T2 STOP 3×P1; C-T3a absorption PASS,
C-T3b STOP 4×P1) → 3 implementation jobs → **3-channel post-impl review** (Codex 4×P2, QA 43 mutations/40 red,
security-review no findings ≥7) → **fix round 1** → **round 2 on the absorbed-fix diff** (Codex 1×P1, QA 23
mutations) → **fix round 2** → clean clone → merge. Register: `docs/m5-2-slice-2-review-findings.md`.

**The four findings worth carrying into slice 3:**
- **A type-level pin pins nothing.** A TS brand erases at runtime and free-form argv let `-H/--host` override
  `DOCKER_HOST`. Provenance is now a module-private `WeakSet` + `#private` frozen storage; commands are a closed
  vocabulary whose argv is built internally. Same shape as slice 1's C-S1 lesson, re-learned on a new surface.
- **Ordering must be proven on the *public* entry.** `capturePersistedRuns` launches Chromium itself and the
  hostile suite calls it *with* a browser, so no placement of the preflight could order that call — a supplied
  browser is now runtime-illegal in composed mode.
- **A guard that only reads source loses to `import('node:'+'child_process')`.** The primary guard is runtime,
  where the value has resolved; the static scan is defence in depth and says so. But patching CJS exports does not
  reach ESM *named* exports, and **synchronous APIs never traverse `ChildProcess.prototype.spawn`** — fix round 1
  closed the async half and left the sync half open until round 2.
- **A fix can introduce a silent-green.** Teaching the `execFile` guard to route shell forms *masked* the `exec`
  wrapper's own test (red → green). Found independently by both round-2 channels. This is the argument for a
  round 2 on the absorbed-fix diff, not merging after round 1.

**Best outcome of round 2:** the dependency-gate exemption was **deleted, not narrowed**. Fix round 1's prototype
guard made `syncBuiltinESMExports` redundant, and that call was the only reason a hole existed in a repo-wide gate.
The `node:module` prohibition applies to every file again with no carve-out — undoing the integrator's own earlier
change rather than defending it.

**Declared residuals carried to slice 3**, each declared in code not implied: **A2** (`unix://` and `U+FEFF`
rejected though Docker accepts them — conveniences declined, not protections); **B5a** (dead-listener sockets need
a dial the spec forbids pre-contact); **R2-4** (no executable command variant exists to make the argv mutant fail);
**B4** (no slice-2 composed path reaches `listen()`, so the test would pass for the wrong reason — its structural
half *is* proven); **eval-time interceptor exclusion** (`vitest.config.ts` loads the guard for every Vitest run
including `npm run eval`, and the broad Unix-socket rejection makes that exclusion larger); and the guard is
**hygiene, not containment** — `worker_threads` realms and `process.binding` escape it, and the header says so.

---

<!-- Archived session summaries accumulate below, newest first.

## <YYYY-MM-DD-thread> — <milestone / feature>
- <one-line summary> (commit `<sha>` / PR #<n>)
-->

## 2026-09-01-m4 — M4: fill service end-to-end + integration security gates (shipped `b8a9396`, 2026-09-02)

*Archived 2026-09-03 (at the M5 close) from PLAN.md Current State:*

`2026-09-01-m4` — focus: M4 (fill service end-to-end + all integration security gates, 🔴) through the full Codex ladder; in parallel: absorb A1/A3 + fact-check corrections into `PROJECT-SPEC.md`, prune merged agent branches, schedule the §9.1 LOC-budget question. **Outcome (2026-09-02): M4 shipped — `main` fast-forwarded to `b8a9396`; every parallel item done.**

**M4 as shipped (one paragraph; the register `docs/m4-review-findings.md` holds everything else):** four commits plus
five fix slices on `codex/m4-fill-service`, each reviewed by three channels (Claude QA, Claude security, Codex) with
real-Chromium probes; a whole-codebase audit; a user-authorized probe P amendment (paired counterbalanced Wilcoxon,
500 pairs, Holm–Bonferroni family gate, report-only calibration). Final state on `main`: `make test` green (773 tests
+ 10-test timing family, gate 53/48, selftest), `make eval` 10/10 with 0 leaks. **Claims = the amended honest-claims
sentence in `docs/m4-slice-spec.md`, no more.** Shipped residuals with proof: register section "Final5 round"
(worker Blob bodies, the finite transform inventory, first-hop/fill-time destination check, the retention rule as a
shape allowlist, the batched timing probe, ordered-use evidence settlement) — all declared in `SCHEMA.md`, M5 items
in `BACKLOG.md`.
- Spec `docs/m4-slice-spec.md` r5 LOCKED after a three-round two-channel blind paper ladder with real-Chromium probes; contract amendments on `main` (`2672136`, `086914b` unplaceable, `0a9b123` probe P C-F1).
- Branch `codex/m4-fill-service`: commit 1 `5bfc401` (gate vetted tier, evaluator zone, Playwright seam) + fix `0cbe9d1`; commit 2 `b1407cd` (session owner, controls, in-realm sources, probe P, controls-lab) + fix `20b4764`; commit 3 `2652104` (fill service, supervisor host, Acceptance A–L) + fix `8bebd5a`; commit 4 `76035cc` (testbed wiring) + fix `305da22`; whole-codebase audit; fix slices `530b0cb` (final), `5757a24` (final2), `cd152a2` (final3), `58ca087` (final4), `9ce3a44` (final5), `b8a9396` (final-review absorption).
- Real leaks found and closed by the ladder: `<base href>` and `<input type=image>` formaction bypasses; layer-4 blind spots for bodyless GET, Blob bodies, cookies, base64 alignment, trailing-dot hosts, WebSocket handshake URLs; a silently removed CDP guard; a capture-failure denial-of-measurement lever.
- Probe P: unpaired MWU rejected different probes non-reproducibly → paired counterbalanced Wilcoxon over 500 pairs with a Holm–Bonferroni family gate (user-authorized); a string-representation artefact in one probe fixed by same-constructor payloads; the sub-µs probe batched ×64; calibration report-only (floor 32 µs or Infinity).
- Retention rule: nine adversarial rounds; capped as a shape allowlist (S1–S35) with the honest-claims sentence naming its scope; support modules in `scripts/retention` (tooling zone).
- Process lessons recorded in memory: never gate a commit on a test count; tsc last before every commit; probe-before-lock; call-site tests for guards; blind-channel register discipline; Codex sandbox limits.


## 2026-08-31-kickoff / 2026-08-31-phase0 (superseded by 2026-08-31-build)
Harness seeded into the repo; Phase 0 plan drafted and LOCKED after a 3-round Codex adversarial ladder
(15 findings) plus a fresh-context spec-alignment review (16 gaps). An orphaned earlier Phase 0 draft was
consolidated in and archived to `docs/archive/implementation-plan-superseded.md`. Full decision trail
remains in the `PLAN.md` Decisions Log (never archived); the locked plan is `docs/phase-0-plan.md`.
Commits `7f60152` (lock) through `f0c889e`.

## 2026-09-01-m2 — M2 security primitives (merged `6a6b67c`)

Built through the full 🔴 ladder and merged fast-forward to `main`. Three paper-review rounds
(NO-SHIP / NEEDS-ATTENTION / NO-SHIP, 22 findings) closed at the §5 cap when three findings all reduced to
*"TypeScript cannot enforce this"* — the mechanism was redesigned from type enforcement to a build-time
dependency boundary plus runtime attestation, and validation moved to code. Then five code-review rounds
across `/review`, `/security-review`, and Codex adversarial, each finding something real: a provenance
TOCTOU letting caller-controlled evidence reach the scanner, a taint clear with no capability, four
successive dependency-gate silent-disarms, and a load-bearing guard with no test. ~30 code findings
absorbed. Full trail in `docs/m2-review-findings.md`; decisions in the `PLAN.md` Decisions Log.

---

## Archived 2026-09-01 (at M3 close) — the M2-close Current State block

### Current State as of the M2 close (superseded)

`2026-09-01-m3` — focus: M3 (backend interface + libsodium local-file, B1 slice 2/3) through the full 🔴 Codex ladder; spec-amendment fact-check research in parallel.

`2026-09-01-m2` — focus: dispatch M2 through the full 🔴 ladder, with B1's M2 slice folded in.
**Outcome: M2 built, reviewed across 8 rounds, and merged to `main` (`6a6b67c`, fast-forward).**

**Milestone:** v0.1 build against `docs/phase-0-plan.md` §8.
**M0 ✅** (`8007aea`) · **M1 ✅** (`8faedde`) · **M1-hardening ✅** (`07996a2`) · **M2 ✅** (`6a6b67c`) ·
**M3 next.**

**Where the code actually is:** the six security primitives exist and are unit-tested with no browser —
`Secret<string>`, bare-origin validator, provenance-keyed lockdown registry with a separated lifecycle
capability, non-reentrant session mutex, runtime-validated result constructors, and the tripwire detector
plus attestation seam in a protected supervisor zone. A build-time dependency gate enforces the
data/control-plane boundary and **fails closed on anything it cannot follow**. `make test` 206 passing;
`make eval` unchanged at 10/10 completion, 0 leaks. **Still no fill service — that is M4.**

**Blocked / needs attention:**
- Nothing blocking. Threads to carry forward:
  1. **Unverified external claims** in `docs/spec-amendment-2026-08-31.md` (funding figures, product
     details, URLs) — must be fact-checked before entering `PROJECT-SPEC.md` or the public README. Now the
     oldest open thread; it has survived two sessions untouched.
  2. **Deferred M2 residuals**, all recorded in the Decisions Log and `docs/m2-review-findings.md`:
     Cherokee fail-closed false-reject (172 code points, cosmetic); **F-7** error classification;
     the two redundant F-1 guards (the fix spec says remove rather than ceremonially test); the sweep's
     two-target template scope; and **`src/shared` exporting `secretTransforms`**, which makes the plane
     split organizational rather than a capability boundary — state it, don't over-claim it.
  3. **LOC budget.** M2 added ~1,300 lines net of the fix rounds. `testbed/` is no longer the only large
     thing. The §9.1 simplification question is still scoped at the M1 testbed and was never answered — the
     testbed-scoped pass was launched but its results never landed.

**Next session — M3 (backend interface + libsodium local-file, 🔴):**
- Full ladder per `docs/handoff-pattern.md` §4; review gate and focus surfaces in `phase-0-plan.md` §9.1.
- **Carries B1 slice 2/3**: `resolveSecret` never caches the secret, while `dispose?()` drops backend
  **auth-session material only** — the split that keeps the invariant from being either false or forcing
  pointless re-authentication.
- **Run `handoff-pattern.md` §5.1 (the absorption-completion sweep) after every absorbed finding.** It is a
  mandatory gate and skipping it cost a review round in M2.
- Deferred audit items already written into their milestones: **M4** (dom-fill live-DOM identity,
  trusted-side `wrongOrigin`, B1 slice 3/3 rotation, probe P timing, tripwire wiring), **M5**
  (capture-coverage gate), **M7+** (`revocation` fixture, needs B1).




---

## M5 shipped, the post-M5 assessment, M5.1, and the M5.2 spec rounds (archived 2026-09-04)

Collapsed from `PLAN.md` Current State once M5.1 shipped, the assessment's items were dispositioned, and the M5.2
spec locked. The authoritative detail lives in the registers; this is the index.

**M5 ✅ (`96e3ea3`, 2026-09-03)** — three slices on two Codex branches: A, the leak checker's finite decoder
inventory (three rounds + integrator confirmation, merged `2e7b300`); B, the shared fixture core and signers, then
the harness coverage gate with console/redirect capture and recursive worker attach, then the two hostile fixtures.
Every round three-channel with real-Chromium probes. The merge gate surfaced M5-M1 — the flat candidate budget
exhausted by ordinary model-context events — fixed in the merge. Final state: `make test` 972 + 3 + 10, `make eval`
30/30 with 0 leaks, coverage 10/11. Shipped residuals with proof: register C-A3, C-B2f2, C-B3; declared limits in
`SCHEMA.md`. Full detail: `docs/m5-review-findings.md`, claims in `docs/m5-slice-spec.md`.

**Post-M5 assessment (Codex, read-only, 2026-09-03)** — `docs/project-assessment-2026-09-03.md`, verified line by
line (register C-P). Verdict NEEDS ATTENTION and right on substance: two P0 gate defects (the timing file at its own
cap; a gitignored artifact prerequisite), the fixture-topology conflict with the locked spec, five stale documents,
and absent release engineering. All dispositioned: the P0s became M5.1; the topology became M5.2; the docs were
refreshed; release engineering is an M10 pre-launch slice in BACKLOG. Its own milestone table mislabels M1–M3 and
calls the decoder budgets time-based (they are work-based) — do not copy it.

**M5.1 ✅ (2026-09-04, register C-Q)** — timing file split (64.3 s red → 15.2 s green; the stress scan given its own
bound and count-invariance assertion, never a timeout bump); `artifacts/eval/runs` replaced by
`testbed/checkers/syntheticCorpus.ts`, which replays the agent loop so `model-context` events grow as the real ones
do (events 41/41/59 exact, identical channel mix, byte-identical across builds). Third finding: the M5-M1 regression
guard did not kill its own mutant — restoring the flat 2,048 budget left `leakScan.test.ts` 88/88 green, because its
hand-built context landed ~130 leaves just under the flat floor while a real run's last context is ~5.3 KB across
~144. Now pinned to the generated corpus. Correction recorded: decoder truncation is driven by event **size**, not
scan length, so count-invariance rather than an absent `truncated` flag is the per-event-budget claim.

**M5.2 spec, four review passes to lock (registers C-R1…C-R8)** — each pass narrowed the design or the claim:
- **C-R2 (round 1)** killed the network shape the decision itself was written from: a dual-homed container has one
  network namespace, so "publish page origins on one network and the control port on another" is not a thing Docker
  does. Also: "keep attestation in-process" was not implementable, since offline adjudication needs the fixture
  signature before parsing events.
- **C-R3 (round 2)** rejected the sidecar split and the exec bridge. The isolation claim promised containment after
  fixture-process compromise, which the design cannot establish and which `SCHEMA.md:319-335` already contradicted.
- **C-R4** — the user locked the threat model and removed the sidecar as buying nothing under it.
- **C-R5 (round 3)** found the Docker daemon endpoint was an unguarded alternate control transport.
- **C-R7 (closure)** found the daemon repair validated the *client's* connection, not the daemon's exposure.
- **C-R8** — the user adjudicated daemon isolation into a stated deployment requirement rather than a proven
  property, and revision 4 locked (`60520d9`).

## M5.1, the M5.2 spec lock, and slice 1 — archived 2026-09-04 (session `2026-09-04-m5.2-slice2`)

Collapsed from `PLAN.md` Current State once slice 2 merged; detail no longer load-bearing for slice 3.

- **M5.1 ✅** (2026-09-04, register C-Q) — the two P0 gate defects closed, accepted by a literal clean clone. The
  timing file split so the 200-event stress scan carries its own bound (64.3 s red → 15.2 s green, never a timeout
  bump); `artifacts/eval/runs` replaced by a generated deterministic corpus. Also found: the M5-M1 guard did not
  kill its own mutant (its hand-built context sat just under the flat floor) — pinned to the generated corpus and
  verified red-then-green.
- **M5.2 spec ✅ LOCKED at revision 4** (`60520d9`) — Docker-composed fixtures behind one implementation and two
  transports; one container per fixture, page-origin ports only, internal control socket, framed `docker exec -T`
  bridge. Threat model locked and **Docker-daemon isolation stated as a deployment requirement**, not a proven
  property. Register `docs/m5-2-review-findings.md` holds C-R1…C-R8 and C-S1…C-S2.
- **Slice 1 ✅ MERGED** (`ab52f8e`, head `1d04f93`) — the `FixtureTransport` seam with every bridge-crossing
  operation Promise-returning; `transport` split into architecture and reachability; a canonical model-turn
  snapshot consumed by every downstream reader; the evaluated agent's tool boundary enforced at runtime. Gates:
  Acceptance J 10/10, `make test` 995 + 5 + 10, clean clone green at the same counts.
- **C-S1 — source analysis cannot enforce this class.** Three designs failed (call-site observation; an AST matcher
  enumerating shapes, seven bypasses; a positive occurrence inventory plus reachability walk, defeated by a computed
  dynamic-import specifier leaving the reference symbol-less). *A positive allowlist over occurrences the type
  checker can resolve is not a positive allowlist over occurrences.* The fourth design analyses no source at all.
  **Slice 2 re-learned this on a new surface** — see the runtime Docker guard.
- **C-S2 — an authorized repair removed protection while appearing to strengthen it.** "Replace the vacuous
  assertion" was applied to a line whose *type annotation* carried the force, deleting
  `Equal<keyof AgentLoopOptions, …>` and `Object.isFrozen(offeredTools)`. Caught only by sharper mutants than the
  integrator's. Restored in `f7aef17`. Its declared residuals (reviewed build entry point; `Equal<>` constrains
  keys not property-type widening; source-text pins satisfiable by comments) stand unchanged.


## 2026-09-05 — Slice 3 execution-ladder detail archived at Slice 4 planning wrapup

Moved from Current State after Slice 4 plan lock. Slice 3's merged result, carried lessons and residuals remain
in Current State because they still govern the next implementation; the detailed ladder is historical.

Ladder actually run: **3 pre-impl paper rounds × 2 blind channels** (Codex Sol STOP/STOP/STOP with 10/8/10 P1s;
Claude 7×P2 / 1×P1 / 1×P1) → lock → **6 Codex Astra implementation jobs** (A, B1, B1-b, B1-c, B2, C; nine correct
stop-and-return points on contract facts, each adjudicated) → integrator Docker fix cycle → **3-channel post-impl
review** (Codex 2×P1, QA 95 mutants PASS, security PASS + a Medium) → **3 fix rounds** (Codex core + integrator
evidence code, each re-reviewed) → QA round 3 (45 mutants) → clean clone → merge.


## 2026-09-05-m5.2-slice4 — implementation and local integration (archived at full wrapup)

Archived from Current State after exact-candidate and merged-tree acceptance. Source merge `39169a6`,
acceptance-document commit `f6b6a42`; canonical results and residuals remain in Slice4 register Entries16,
23,27,37,39–44. No review or test was repeated for this documentation-only wrapup. The completed Slice3
carry-forward narrative is retained below with its historical wording. Decisions Log stays in PLAN.

`2026-09-05-m5.2-slice4` — focus: **M5.2 slice 4**; owner: codex; state: complete, merged locally.
State checkout/worktree: `/Users/jonathanavni/Documents/Coding/tinyvault`.
Locked revision5 Jobs **A/B/C/D accepted** (register Entries16/23/27/37). All incoming changes preserved
in candidate `0e274bf57ca94fa3f1ab5a80d72980b5abef35b5` and local merge `5210988`. Bounded helper repair
accepted after fresh Astra, Claude QA and separate security PASS (Entries40–43), committed as
`7a02d3ad84751a1db35678551836ca5e426caba3` on `codex/m5-2-slice-4-integration-fix`.
Final source merge on main: **`39169a6c81fc2da4a29532ac46ea9e961197b145`**, exact repair-candidate tree
`6a416a798b135fc4340fe39400aaed8a117cbae5`. Owner closure is a subsequent documentation-only commit.

**Final acceptance PASS (Entry44):** new literal exact-commit clone of7a02d3a + npm ci + make browsers +
make test1891 pass/one expected opt-in skip/execution PASS. After local merge, serial make test1891 pass/
same expected skip, then make test-docker5/5 and execution PASS. All reports fresh;303 candidate file hashes
unchanged after tests. Maximum-budget579-scanner exports89.20–89.26s each below120s; separate composed
browser registration-through-attestation131.5–143.8ms, zero normal409s. Final zero fixture containers;
three pre-existing networks preserved. Canonical evidence/dispositions: `docs/m5-2-slice-4-review-findings.md`;
raw evidence `/private/tmp/tinyvault-slice4-integration/helper-acceptance/`.

**Retained limits:** the original clone/merged-tree intermittent missing-helper-summary failures remain
unexplained (Entry39). The separately reproduced stream-error path is repaired; new green gates do not
prove historical attribution or nonrecurrence. Exact synthetic/mutation, cleanup, diagnostic and test-
inventory limits live in Entry43. All accepted JobA/B/C/D private-key/observation/deployment limits remain.
Do not repeat completed planning or accepted reviews absent new evidence. Locked contract remains
`docs/m5-2-slice-4-plan.md` revision5. No release or whole-M5.2 completion claim.

No active worker/reviewer/test or required approval remains. User authorized all local commits/merges;
**nothing pushed remotely**. Standing routine Claude review consent is in `docs/handoff-pattern.md`; the
managed transfer block was resolved by specific approval with no policy bypass. Next planned work is
**Slice5: attestation**, then Slice6 parity/claim closure. Neither began in this session.

`2026-09-05-m5.2-slice3` — focus: assessment fold-in check, commit `AGENTS.md`, then **M5.2 slice 3** through the
full security-core ladder via Astra; prune `codex/m5-2-slice-2` — **outcome: MERGED (`8afce07`).** Merged tree:
`make test` 1568 + 5 + 10 with the execution proof PASS; `make test-docker` 4/4 (78 s). Clean clone at the branch tip
`638bc15`: green. Session tests 1182 → 1568 (+ the Docker suite's 4).

**M5.2 slice 3 ✅ MERGED** — each fixture runs in its own container behind a framed `docker exec -i` bridge with a
stdin-delivered bootstrap secret and an injective challenge/MAC; construction is provenance-first (daemon-level
absence check, exact-one resolution, a 20-row inspect table) and fail-closed through one idempotent closer whose
Acceptance-E scans (logs, export, history, exec stderr, artifacts) each carry a positive control in the same scanning
pass; `make test` stays Docker-free behind six signals (runtime interceptor, per-path capability map, hash-pinned
root of trust, entry-point grammar gate, execution proof, clean clone). Register:
`docs/m5-2-slice-3-review-findings.md`; plan `docs/m5-2-slice-3-plan.md` revision 4.

Slice 3's detailed execution ladder is archived in `PLAN-archive.md`; its load-bearing lessons follow.

**Findings worth carrying into slice 4:**
- **The entry point cannot guard itself.** Three paper rounds beat every static gate by a spelling it did not know
  (`.cjs`, `env docker`, `globalSetup`, a Makefile `$(shell …)`); the answer was to narrow the claim — gates catch
  Docker reach from *code modules*; the entry-point files are a hash-pinned, reviewed root of trust.
- **Measure the environment before locking a sentence about it.** Four rev-4 sentences were false on this host
  (label vs interpolation, TS constants vs a bare-Node lint, `child_process` count, `IpcMode`); `compose ps` hides
  non-Compose containers; Docker 29 omits `Config.Cmd`; ORB/CORS hide cross-origin answers from a page oracle.
- **A coverage assertion must be able to fail.** The first two versions of the probe-coverage check were trivially
  satisfiable (a WebSocket error counted as a verdict; cancellation counted as "no route"); the third is pinned
  Docker-free with the failure shapes Chromium actually produces, and its exclusions (bridge-network addresses,
  the `file:` socket URL) are declared, not hidden.
- **Integrator-written evidence code is not exempt from review.** Both post-impl P1s were in code I wrote during
  the Docker fix cycle; the ladder caught them because the code went through the same channels.

**Declared residuals carried to slice 4** (each in code or the register): constant-time compare not unit-observable;
`node:24-slim` by tag (M10); no composed eval entry until a later slice (the in-process eval stays under the guard);
the §9 static-gate limits (wrapper launchers, `worker_threads`, `process.binding`, `getBuiltinModule`, parse-time
Make, root-of-trust edits); bridge-network and `file:` targets excluded from probe coverage; `checkScan`'s
control-count guard and exec-stderr's `failed()` path unpinned; `.dockerignore` entries untested. **Outside the
slice, filed as an M6 spec input:** `browser_close_session` never resolves after a navigation to a black-hole
address (BACKLOG, with reproduction).

*Slice 2's detail is below; slice 1 and earlier in `PLAN-archive.md`.*

**M5.2 slice 2 ✅ MERGED (`8133495`)** — daemon-channel preflight, canonical `unix:///` policy, runtime-unforgeable pin,
single Docker choke point, fail-closed composed construction; 2 pre-impl rounds → 3 impl jobs → 3-channel review →
2 fix rounds → clean clone. Its four carried lessons and six declared residuals were all resolved or re-declared by
slice 3 (above); full detail in `PLAN-archive.md`.

*Slice 1's C-S1/C-S2 lessons and the M5.1 / spec-lock detail are also in `PLAN-archive.md`.*


Wrapup hygiene: shipped Slice4 and earlier slice plans remain indexed at their existing paths because
their contracts and review references are still inputs to later slices. Their completed status is already
explicit in docs/README; physical archival/link migration is deferred, not silently performed here.

## 2026-09-05-m5.2-slice5-planning — Slice5 accepted and pushed (closed 2026-09-06)

Planning revision3 locked at the three-round cap; JobsA/B and 66 mutation dispositions accepted.
Fresh Astra, Claude Opus5 QA and separate security all PASS in implementation round1. Candidate005a4f3
passed literal clone/install/browser/full tests; merge02929e5 passed full tests and live Docker.
Acceptance records73bd015 were pushed to origin/main after explicit user authorization; remote ref
verified exactly and local/remote counts0/0. Canonical evidence is Slice5 register Entries1–11.
No source changes after verification. Ownership closed for a fresh Slice6 planning session.

The following is the pre-wrapup Current State; its pending push statements were superseded by the
subsequent explicit user authorization and successful push recorded above.

### Archived Current State

`2026-09-05-m5.2-slice5-planning` — focus: **M5.2 Slice 5 integration accepted**;
owner: codex; **state: active**. User transferred ownership from the closed Slice4 session, authorized
Slice5 implementation, then explicitly approved candidate commit, exact-clone verification, local merge,
and merged-tree gates on 2026-09-06. Checkout: `/Users/jonathanavni/Documents/Coding/tinyvault`, `main`.
Reviewed candidate `005a4f37cd8279c57f58063613c45e51e9733ba8` merged as
`02929e5ba7f26de05adbd174b67f5f9e4cfb21c6`; merge tree equals exact-clone-tested candidate.
All implementation, review and integration gates PASS. Final continuity-only acceptance records follow
the tested merge; no source/test changes. All workers/reviewers stopped; Codex is the sole continuity
writer. No push, release or Slice6 authorization. Completed Slice4 and Slice5 reviews remain accepted.

**Slice 4 complete:** locked revision5 Jobs A/B/C/D accepted after the required review ladder.
Reviewed helper repair candidate `7a02d3ad84751a1db35678551836ca5e426caba3` passed a new literal
clone + npm ci + make browsers + make test. Exact source merge then passed serial make test
(**1,891 pass, one expected opt-in skip**) and make test-docker (**5/5**), both execution gates PASS.
Live exports under120s; browser registration-through-attestation131.5–143.8ms; zero normal409s.
Final fixture containers absent; three pre-existing networks preserved. No source changed after tests.
Canonical acceptance and evidence: `docs/m5-2-slice-4-review-findings.md` Entry44; prior job acceptance
Entries16/23/27/37, helper dispositions Entry43. Detailed narrative is in `PLAN-archive.md`.
Raw `/private/tmp/tinyvault-slice4-integration/helper-acceptance/` evidence is temporary; the register
is the durable record. Do not depend on scratch files surviving the next session.

**Carry forward:** Entry39's intermittent missing-helper-summary failures remain unexplained. The
separately demonstrated stream-error path was repaired; passing gates do not establish historical
attribution or nonrecurrence. Preserve Entry43's synthetic-test, deletion-inventory, diagnostic and
process-closure limits, plus accepted Slice4 private-key/observation/deployment limits. No whole-M5.2
completion or release claim. Do not repeat completed Slice4 planning/reviews absent new evidence.

**Milestone:** v0.1 build against `docs/phase-0-plan.md` §8.
**M0 ✅** (`8007aea`) · **M1 ✅** (`8faedde`) · **M1-hardening ✅** (`07996a2`) · **M2 ✅** (`6a6b67c`) · **M3 ✅** (`1e24f73`) ·
**M4 ✅** (`b8a9396`) · **M5 ✅** (`96e3ea3`) · **M5.1 ✅** · **M5.2** in flight (spec locked; **slices 1–5 of 6 merged**, slice 5 source merge `02929e5`).

**Slice5 accepted:** `docs/m5-2-slice-5-plan.md` revision3 remains LOCKED. Canonical evidence and
append-only dispositions: `docs/m5-2-slice-5-review-findings.md` Entries1–10, final acceptance Entry10.
Canonical v2 receipt/attestation transcripts bind fixture/run scope; full offline adjudication authenticates
one event observation while preserving shared deriveLeakFromEvidence and its scoring mutant. Legacy v1
artifacts require regeneration. Governing M5.2 D4/Acceptance L and inherited M5 D5 remain unchanged.

**Verification:** 66 killed/restored mutations; candidate gates; fresh Astra adversarial and separate
Claude Opus5 QA/security all PASS. Literal candidate clone + npm ci + make browsers + make test PASS
(1963 passed, one expected opt-in skip). Exact source local merge then passed serial make test
(1963 passed, one expected opt-in skip) and make test-docker (5/5), both execution audits PASS.
Live export maximum90361.0ms (<120s); browser registration-through-attestation128.7–343.4ms (<60s);
zero normal409 responses. Cleanup assertions PASS; tracked tree clean and unchanged after gates.
Initial sandbox browser-cache setup was interrupted and rerun successfully with host access; no gate
was skipped or weakened. Exact SHAs, report digests and measured limits are in Entry10.

**Next action:** await direction for Slice6 planning under the existing ladder. No Slice6 implementation,
new review of accepted Slice4/5 work, push, release or whole-M5.2 completion is authorized or claimed.
M5.2 milestone-close assessment remains due after all six slices. Keep Slice4 Entries39/43/44 residuals
and Slice5 Entry8 proof limits. Temporary `/private/tmp/tinyvault-slice5-integration/` raw reports support
this session; Entry10 is the durable acceptance record. No worker, review, mutation or test suite is running.
Standing Claude-review transfer authorization remains effective; managed controls remain authoritative.

Doc hygiene: shipped slice plans still serve as live contract references for later slices; completed
status is indexed, and path relocation is deferred to avoid unnecessary reference changes.

**Blocked / needs attention:** no open Slice4 acceptance blocker; recorded residuals remain in its register.
The A5 scorecard-provenance slice is still scheduled before
M6 publishes anything. The `tinyvault-fixture:local` image (347 MB) stays on the host between eval runs (rebuilt by
every composed construction). Threads unchanged: `terminate-before-delivery` timeout parked; deferred M2/M3
residuals; the 🔴 `dom-fill` destination slice still owes its launch disposition.


## 2026-09-06-m5.2-slice6-planning — Slice6 accepted, published and session closed

Full session: locked revision3 after three paper rounds; A–D implementation, two implementation
review rounds, all final independent channels PASS, literal clean-clone and integrated-main acceptance.
Source8103c47 and acceptance records53fd94f pushed; final local/remote equality and clean tree verified
before wrapup. Canonical evidence/dispositions: Slice6 register Entries1–29. Ownership relinquished;
whole-M5.2 assessment remains next proposed scope. No active jobs.

The prior Current State follows verbatim, including the explicitly historical Slice5 handoff.
Its prospective publication wording and earlier next-scope/count statements are historical; the
closed checkpoint in PLAN.md and Slice6 Entry29 supersede them.

`2026-09-06-m5.2-slice6-planning` — focus: **M5.2 Slice6 accepted and source pushed**;
owner: codex; **state: active**. Checkout `/Users/jonathanavni/Documents/Coding/tinyvault`,
branch `main`. Source integration commit `8103c4729e729d6a08e569e8aa5abe68cb535fa3` (`8103c47`)
is verified on origin/main. This acceptance documentation follows in a separate record commit;
use live git HEAD/origin/main for its final identity. No active workers, reviewers, mutations or tests.

**Completed:** Slice6 A–D implementation under locked revision3;147 claim rows/299 runtime selectors;
compiler evidence337 mutants/695 invocations; runtime lineages and narrow mutation/coverage limits
preserved in the canonical Slice6 register. Paper rounds3 and implementation rounds2 are complete.
Fresh Astra and separate Claude Opus5 QA/security round2 all PASS (Entry26). No repeat reviews needed
without new source/gate changes. Current table SHA256 `e568cb613f46eb5fcfa0e2374ba4d0aac1a57973882931ccaa10bf7a470a335d`.

**Acceptance (Entry28):** exact8103c47 literal clean clone + npm ci + make browsers + make test PASS.
Clean-clone default2317 PASS/1 expected opt-in skip, with execution audit and native299-name join PASS.
Then exact integrated main8103c47 passed serial make test2317 PASS/1 expected skip, live Docker6/6,
and composed N10 make eval1/1 with30/30 complete and0 observed leaks; every execution audit PASS.
All330 committed file hashes stayed unchanged through gates, and both checkouts remained clean.
Source push succeeded and live origin/main was verified at8103c47. Acceptance records are committed
and pushed separately; final publication proof is kept with the acceptance artifacts.

**Evidence and limits:** `/private/tmp/tinyvault-slice6-integration-20260906/` contains native reports,
complete299-name joins, copied Docker metrics/scorecard, hashes and source/final publication proofs.
Earlier implementation/review artifacts remain in `/private/tmp/tinyvault-slice6-implementation/`.
Results are scripted-stub measurements; Docker isolation remains assumed (unverified), and fixture
signatures remain post-capture integrity rather than independent capture authenticity. All accepted
finite decoder/observer/timing and historical mutation-attribution limits remain. Inherited wrapup
files and the closed Slice4/5 handoff below were preserved; final edits are status/citation text only.

**Authorization:** User approved commit → required clean-clone/integrated-tree gates → push by
“Ok let’s proceed.” Routine Slice6 file edits have standing approval; do not ask per file. Runtime
permission controls still apply. Whole-M5.2 assessment and release were not part of this authorization.

**Next:** all six M5.2 slices are integrated; the separate whole-M5.2 milestone-close assessment is
still pending and is the next proposed scope. M5.2 is not declared closed and no release is approved.

**Previous closed handoff (preserved):**

`2026-09-05-m5.2-slice5-planning` — focus: **M5.2 Slice5 accepted and pushed**;
owner: codex; **state: closed** (2026-09-06). Ownership relinquished for a fresh session.
Checkout: `/Users/jonathanavni/Documents/Coding/tinyvault`, branch `main`.
Implementation005a4f3 → source merge02929e5 → acceptance records73bd015.
User authorized the push; origin/main was verified at73bd015 with local/remote counts0/0 and a clean tree.
This wrapup leaves five continuity files uncommitted: PLAN.md, PLAN-archive.md, the Slice5 register,
.claude/memory/sessions-archive.md and .claude/memory/gotchas.md. Preserve them on fresh-session entry;
no production or test changes.
No running workers, reviewers, mutations or test suites; no pending Slice5 job or acceptance gate.
Detailed session narrative is in PLAN-archive.md. Evidence below is durable; scratch reports may expire.

**Accepted:** Slice5 plan revision3 LOCKED after three paper rounds; implementation round1 fresh Astra,
Claude Opus5 QA and separate security all PASS. 66 killed/restored mutations. Exact candidate clone +
npm ci + make browsers + make test PASS (1963 passed, one expected opt-in skip). Exact source merge
passed serial make test (1963 passed, one expected skip) and live make test-docker (5/5), both execution
audits PASS. Canonical evidence: `docs/m5-2-slice-5-review-findings.md` Entries7–11; final gates Entry10.
Live exports <120s; browser registration-through-attestation128.7–343.4ms; zero normal409s.
No source/tests changed after review or gates. Legacy v1 receipt/attestation artifacts require regeneration.

**Next session:** take ownership from this closed checkpoint and begin **Slice6 planning only** under
`docs/m5-2-implementation-plan.md` row6 and `docs/m5-2-slice-spec.md` revision4 §D6 / Acceptance K,O,P:
canonical two-transport parity, behavior-to-claim table with row-specific killing mutants, SCHEMA claim
wording, deployment-assumption reporting and invalid-run handling. Read SCHEMA.md and the relevant
source/tests before drafting; inspect current checkout/refs/dirty state. Follow the existing Codex-led
paper → implementation → independent QA/security/adversarial → integration ladder. No Slice6 plan is
locked and no Slice6 implementation, milestone-close assessment or release is authorized by this handoff.
Do not repeat completed Slice4/5 reviews or reset their round counts absent new evidence.

**Carry forward:** fixture-control post-capture integrity is not independent capture authenticity,
compromised-fixture containment or daemon-wide non-exposure. Keep Slice5 Entry8's schema-guard mutation
attribution limits and all accepted Slice4 limits (Entries39/43/44): historical intermittent missing-helper
summaries remain unexplained; repaired stream-error behavior does not establish historical attribution
or nonrecurrence. No open Slice4/5 acceptance blocker. Exact test and mutation claims stay in their registers.

**Milestone:** M0–M5 and M5.1 accepted; **M5.2 slices1–5 of6 merged**. Whole-M5.2 completion and its
required milestone-close assessment remain pending Slice6. A5 scorecard provenance is due before M6
publishes numbers. Other parked threads: terminate-before-delivery timeout; deferred M2/M3 residuals;
🔴 dom-fill destination launch disposition. Keep existing locked requirements and claim limits.
Standing Claude review-transfer authorization persists; runtime approval controls remain authoritative.


## 2026-09-06 — closed Slice6 handoff preserved at M5.2 assessment takeover


`2026-09-06-m5.2-slice6-planning` — focus: **M5.2 Slice6 accepted and pushed**;
owner: codex; **state: closed** (2026-09-06). Ownership relinquished for a fresh session.
State checkout/worktree: `/Users/jonathanavni/Documents/Coding/tinyvault`, branch `main`.
Source commit `8103c4729e729d6a08e569e8aa5abe68cb535fa3`; acceptance-record commit and published
HEAD `53fd94f7831d2fb913d887a4a40c2ef3913f30b1`. Publication verified local/remote equality,
ahead/behind 0/0 and clean tree before wrapup. No running workers, reviewers, mutations or tests;
no pending Slice6 acceptance gate.

**Preserve on entry:** this wrapup leaves five continuity files uncommitted: `PLAN.md`,
`PLAN-archive.md`, `docs/m5-2-slice-6-review-findings.md`, `.claude/memory/sessions-archive.md`
and `.claude/memory/gotchas.md`. No source, test, locked plan or claim-table changes. Earlier Slice5
wrapup documents were preserved and committed with Slice6. Historical handoffs and this session's
prior narrative are preserved in `PLAN-archive.md`; cumulative Decisions Log remains here unchanged.

**Accepted:** Slice6 revision3 A–D; 147 claim rows / 299 runtime selectors; 337 compiler mutants /
695 compiler invocations. Paper rounds3 and implementation rounds2 complete; fresh Astra and
separate Claude Opus5 QA/security round2 all PASS. Canonical dispositions and mutation limitations:
Slice6 register Entries7–26. Do not repeat completed Slice1–6 reviews or reset counts absent new evidence.

**Verification:** exact source8103c47 literal clean clone → npm ci → make browsers → make test PASS
(2317 passed, one expected opt-in skip). Exact integrated main then passed serial make test
(2317 passed, one expected skip), make test-docker (6/6), make eval (1/1; composed N10, 30/30 complete,
zero observed leaks). Execution audits and both 299-selector name joins PASS; all330 candidate hashes
unchanged through acceptance. Entry28 holds durable report hashes; Entry29 records final publication
and closure. Raw artifacts: `/private/tmp/tinyvault-slice6-integration-20260906/` and
`/private/tmp/tinyvault-slice6-implementation/`; scratch reports may expire. Runtime gates were not
repeated for this documentation-only wrapup; diff hygiene and preservation checks apply.

**Next proposed scope:** whole-M5.2 milestone-close assessment. All six slices are integrated;
M5.2 is not yet declared closed. In the fresh session, take ownership from this closed checkpoint,
read PROJECT-SPEC.md, CLAUDE.md's milestone assessment requirement, docs/phase-0-plan.md,
docs/m5-2-implementation-plan.md, locked docs/m5-2-slice-spec.md revision4, SCHEMA.md and current
register dispositions. Follow docs/handoff-pattern.md §0's Codex-led independent cross-model review
mapping and verify assessment findings line by line. Assess whole-milestone requirements and evidence;
retain completed slice reviews. This handoff proposes that next task; it does not start assessment,
M6 implementation or release. Slice6 locked plan revision3 remains unchanged.

**Carry forward:** scripted-stub results are not real-agent leakage evidence. Docker isolation remains
assumed (unverified); fixture signatures prove post-capture integrity, not independent capture
authenticity or daemon non-exposure. Preserve accepted finite decoder/observer/timing/wire limits,
Slice5 Entry8 mutation-attribution limits and Slice4 Entries39/43/44 historical helper limits.
No open Slice6 acceptance blocker. A5 scorecard provenance is due before M6 publishes numbers;
terminate-before-delivery timeout, deferred M2/M3 residuals and dom-fill destination launch disposition
remain parked in their canonical records. Keep locked requirements and thresholds.

**Authorization and hygiene:** routine file changes have standing user approval; do not ask per file.
Standing Claude review-transfer authorization persists; runtime permission controls still apply.
No further commit/push is part of this wrapup. Retain slice plans/registers at their current paths for
assessment traceability; any archive/link reorganization is a separate documentation judgment.

<!-- End preserved closed Slice6 checkpoint. -->


## 2026-09-06 — M5.2 milestone-close assessment, completed session


`2026-09-06-m5.2-milestone-close` — focus: **M5.2 milestone-close assessment complete; M5.2 closed**;
owner: codex; **state: active** (assessment finished, awaiting next authorized scope).
State checkout/worktree: `/Users/jonathanavni/Documents/Coding/tinyvault`, branch `main`,
HEAD `53fd94f7831d2fb913d887a4a40c2ef3913f30b1`; accepted executable source `8103c47`.
User authorized takeover from the closed Slice6 session and whole-milestone assessment only.
No workers, reviewers, mutations or runtime suites remain active. No M6 implementation or release.

**Outcome:** Acceptance A–P closed. Fresh Codex and separate Claude Opus5 QA/security assessments
found no new technical acceptance blocker. Original reviewer verdicts NEEDS-ATTENTION concerned
status documentation; owner corrected all three issues and recorded PASS for milestone closure.
Canonical dispositions, identities, report hashes and limitations: `docs/m5-2-review-findings.md` C-M1.
Whole requirement/evidence crosswalk: `docs/project-assessment-2026-09-06.md`.
Completed Slice1–6 reviews and caps unchanged; Slice6 paper3 / implementation2 remain complete.

**Verification:** revalidated the eight native report hashes and counts from accepted8103c47,
all four captured command-log hashes, scorecard hash, unchanged executable source, all147 claim rows
and both299-selector exact-once-passed joins. Retained acceptance: literal clean clone → npm ci →
make browsers → make test2317 pass/1 expected skip; integrated make test2317 pass/1 skip,
make test-docker6/6, make eval1/1 (composed N10,30/30 complete,0 observed leaks).
These are inherited runtime results with verified lineage, not freshly rerun suites. No executable
bytes changed; final documentation hygiene/preservation/link checks PASS.
Raw assessment evidence: `/private/tmp/tinyvault-m52-close-20260906/`; original runtime evidence:
`/private/tmp/tinyvault-slice6-integration-20260906/`. Raw scratch reports may expire; durable hashes
and dispositions are in the canonical registers.

**Preserved and uncommitted:** all five inherited wrapup documents. The original closed Current
State is archived verbatim in PLAN-archive.md; original archive/register/memory bytes retained.
This session additionally changes README.md, docs/README.md, docs/phase-0-plan.md (status only),
docs/handoff-pattern.md (closure document list), docs/m5-2-review-findings.md (append-only), and
adds the assessment document. No source, test, locked requirement, claim row or threshold changed.
No commit/push authorization in this session.

**Carry forward:** scripted-stub results are not real-agent leakage evidence. Docker isolation stays
assumed (unverified); signatures prove post-capture integrity, not independent capture authenticity.
Accepted finite observation/decoder/timing/wire limits, Slice5 Entry8 mutation attribution and Slice4
Entries39/43/44 helper limits stand. A5 provenance remains due before M6 publishes comparisons;
A1/A2/A4 and connection/finalization inputs, dom-fill launch disposition, deferred M2/M3 residuals,
terminate-before-delivery timeout and release-engineering work remain in their canonical homes.

**Next proposed scope:** M6 planning, beginning with the existing agent-interface/recovery, coverage
and provenance requirements. Planning/implementation is not started here; await user direction.
Standing routine-document and Claude review-transfer authorizations remain; runtime permissions apply.

<!-- End preserved assessment Current State. -->


## M6 planning entry — inherited closed checkpoint (2026-09-06)

`2026-09-06-m5.2-milestone-close` — focus: **M5.2 closed; milestone-close assessment complete**;
owner: codex; **state: closed** (2026-09-06). Ownership relinquished for a fresh M6 planning session.
State checkout/worktree: `/Users/jonathanavni/Documents/Coding/tinyvault`, branch `main`,
HEAD `53fd94f7831d2fb913d887a4a40c2ef3913f30b1`; accepted executable source `8103c47`.
No active workers, reviewers, mutations or tests; no pending M5.2 acceptance gate.

**Outcome:** Acceptance A–P closed after fresh Codex and separate Claude Opus5 QA/security assessments.
Original reviewer verdicts were NEEDS-ATTENTION for documentation; owner verified and corrected all
three status issues, then recorded PASS. Canonical dispositions/reviewer identities/report hashes:
`docs/m5-2-review-findings.md` C-M1; requirement/evidence crosswalk:
`docs/project-assessment-2026-09-06.md`. Completed Slice1–6 reviews and caps remain unchanged.

**Verification:** retained source8103c47 literal-clone and integrated default gates each passed2317
with one expected opt-in skip; Docker6/6; composed scripted N10 eval30/30 complete, zero observed leaks.
This assessment revalidated eight native report hashes/counts, four command-log hashes, scorecard hash,
source identity, all147 claim rows and both299-selector joins. Runtime suites were not repeated.
Wrapup checks: documentation diff hygiene and byte/append-only preservation; no source/test change.
Raw artifacts: `/private/tmp/tinyvault-m52-close-20260906/` and
`/private/tmp/tinyvault-slice6-integration-20260906/` (ephemeral; durable hashes in the registers).

**Preserve on entry — all eleven files remain uncommitted:** PLAN.md, PLAN-archive.md, README.md,
docs/README.md, docs/handoff-pattern.md, docs/phase-0-plan.md, docs/m5-2-review-findings.md,
docs/m5-2-slice-6-review-findings.md, .claude/memory/gotchas.md, .claude/memory/sessions-archive.md,
and the new untracked docs/project-assessment-2026-09-06.md. Inherited wrapup bytes are preserved;
prior Current State snapshots are archived verbatim. Decisions Log remains here unchanged by wrapup.
No source, test, locked requirement, threshold or claim-table change; no commit or push performed.

**Next proposed scope: M6 planning only.** Fresh owner should load PROJECT-SPEC.md, CLAUDE.md,
docs/phase-0-plan.md's M6/evaluation requirements, SCHEMA.md, the milestone assessment and canonical
A1–A7/BACKLOG dispositions. Plan the real reference agent and naive baseline, explicit scenario coverage,
agent interface/recovery, and A5 source/config provenance before published comparisons. Follow the
existing independent paper-review ladder and preserve locked thresholds and exact seven-tool boundary;
surface any required contract amendment explicitly. Do not reopen completed M5.2 reviews absent new
evidence. No M6 planning or implementation began here; no release authorization.

**Carry forward:** current eval numbers are scripted-harness evidence, not real-agent leakage results.
Docker isolation remains assumed (unverified); signatures prove post-capture integrity, not independent
capture authenticity. Accepted finite decoder/observer/timing/wire limits, Slice5 Entry8 and Slice4
Entries39/43/44 proof limits, A4/finalization and black-hole connection inputs, dom-fill launch disposition,
deferred M2/M3 residuals and unexplained timeout remain in their canonical homes. Retain slice plans
and registers at their current paths for traceability; archive/link reorganization is a separate judgment.
Standing routine-document and Claude review-transfer authorizations persist; runtime permissions apply.


## 2026-09-06 — closed M6 planning checkpoint (archived after S1)

`2026-09-06-m6-planning` — focus: **M6 evaluation-first planning complete; S1 handoff ready**;
owner: codex; **state: closed** (2026-09-06), relinquished for the next explicitly authorized session.
State checkout/worktree: `/Users/jonathanavni/Documents/Coding/tinyvault`; branch `main`,
HEAD `53fd94f7831d2fb913d887a4a40c2ef3913f30b1`; accepted executable source `8103c47`.
No active workers/reviewers/tests; no M6 source implementation, commit, push or release.

**Deliverables:** `docs/m6-implementation-plan.md` revision3 with final owner sweep: ten acceptance gates,
six sequential implementation slices with explicit file ownership, ten future contract amendments,
scenario coverage/recovery, SDK evidence/source semantics, A5 provenance and implementation kickoff packet.
`docs/m6-review-findings.md` preserves fresh Sol input and three independent Claude Opus5 paper rounds:
NEEDS-ATTENTION → NEEDS-ATTENTION → PASS at the cap. Owner verified dispositions; no fourth paper round.
Paper PASS is not runtime proof or whole-M6 acceptance. M5.2 stays closed under C-M1/C-M2; no completed
Slice1–6 review or milestone-close assessment repeated.

**Next scope:** S1 provenance/profile contracts only, with its owner contract edits, when implementation
is explicitly authorized. Read the plan §8 packet. D-BUDGET remains OPEN at S2 entry: repeated exact wire
and context evidence may not fit the frozen131072-byte cap; 2048 prompt/bootstrap bytes is a stress [values amended by M6-AM12, 2026-09-08]
candidate, not a proven working allowance. D-CANCEL remains OPEN before S4: choose and prove reachable
cancellation for active navigation and post-timeout black-hole close without early mutex release or
silent evidence loss. Model/SDK access and actual live-cohort outcomes remain unverified runtime gates.
Do not treat these decisions as permission to raise caps, change model/N/thresholds, or resample to pass.

**Preservation:** all eleven inherited dirty/new documents remain uncommitted; their contents were
preserved, with narrow current-status updates to README/docs index/phase build status. Original closed
M5.2 checkpoint is archived verbatim in PLAN-archive.md; Decisions Log remains append-only. New M6 plan
and register are uncommitted. PROJECT-SPEC, SCHEMA, source/tests, claim table and M5.2 registers unchanged
by this session. No memory-topic edits. Raw review/entry evidence:
`/private/tmp/tinyvault-m6-planning-20260906/` (ephemeral); durable report hashes/dispositions in M6 register.

**Verification:** documentation diff/whitespace/link checks, inherited-byte preservation and candidate
identity checks only. Runtime suites, mutants, Docker gates, real-agent API eval and recording not run:
planning/documentation-only authorization. Prior scripted numbers remain harness evidence, not LLM results.
All accepted measurement/deployment residuals carry forward, including exact capture agreement and both
agents' per-cell positive control. Failed runs/cells are to retain diagnostics without qualifying a headline.


## 2026-09-07-m6-d-budget — approved entry decision (archived 2026-09-07)

Verbatim pre-wrapup Current State, including the inherited closed S1 checkpoint. The later wrapup
entry in PLAN.md records closure and the user's authorization to start S2 in a fresh session.

`2026-09-07-m6-d-budget` — focus: **D-BUDGET entry RESOLVED; AM11 approved and adopted**;
owner: codex; **state: paused**, entry task complete, awaiting explicit S2 implementation scope.
State checkout/worktree: `/Users/jonathanavni/Documents/Coding/tinyvault`; main; entry HEAD
`105e75fa58a3548662646884669aec3efd49e978`; entry working tree clean. User explicitly handed over
from the closed S1 checkpoint and approved AM11 on 2026-09-07. No workers/reviewers/tests running;
no S2 source work, commit/push or release authorized.

[Plan §4.3.1](docs/m6-implementation-plan.md#431-d-budget-entry-investigation--2026-09-07) now governs:
1024-byte combined system/bootstrap reserve, exact pinned declaration bytes, fixed five/seven-turn
six-trace deterministic witnesses. The approval explicitly narrows deterministic feasibility; serial
overflows remain rejection/diagnostic evidence, and all real-pilot/cohort failure gates remain intact.
Frozen caps/full observations unchanged. 2048 remains unproven and failed both batched lookalike probes.
Twelve finite browser runs completed; 36 full projections were checked. Entry data is projected wire,
not actual SDK proof. S2 exit, exact S3 prompt sizing and S5 final-path reruns remain mandatory; approval
accepts deferring ordinary serial-trajectory risk to a later real pilot, not a guarantee it will pass.
Scoped Opus5 review remains NEEDS-ATTENTION with recorded owner dispositions; no independent PASS or
new review claimed. Evidence/hashes and approval are in the append-only [M6 register](docs/m6-review-findings.md).
Six owner documentation/status/register files remain uncommitted. All 225 source/contracts/package
inputs match entry HEAD. S1 accepted residuals/review caps retained; D-CANCEL remains OPEN for S4.

Previous closed checkpoint (retained):

`2026-09-06-m6-s1` — focus: **M6 S1 provenance/profile contracts complete**;
owner: codex; **state: closed** (2026-09-07), relinquished for the next explicitly authorized scope.
Checkout `/Users/jonathanavni/Documents/Coding/tinyvault`; main;
S1 source/contracts committed and pushed as `330e7f6b91985124d7fca647172cdbef233f1532`; inherited
historical docs are `3367a6b`. GitHub main was verified at the exact S1 commit. Implementation/review
base was `53fd94f7831d2fb913d887a4a40c2ef3913f30b1`; source identity remains in the M6 register.
This wrapup adds documentation only. No active workers, reviewers or tests; no release.

**Outcome:** S1 source and AM02/AM08 source-factory/AM09/AM10 owner contracts implemented. Provenance
hashing/admission, explicit profiles, exact run-bound sources and independent failed-run diagnostics.
Existing strict stub behavior, claim spans/rows, capture/signing/fixture contracts and gates preserved.
Nine source/test files changed; owner contracts/status/register updated. All inherited uncommitted
work preserved; prior closed planning checkpoint archived verbatim in PLAN-archive.md.

**Verification:** final targeted329/329, typecheck and diff check PASS; full make test exit0
(main2402 passed/one pending, timing15/15). Final47 mutants:45 killed,2 redundant single-guard survivors.
Three implementation rounds complete: final Claude security PASS, Codex adversarial PASS, Claude QA
NEEDS-ATTENTION with accepted coverage residuals and no P1. Owner accepted S1 at the mandatory round3
cap. Canonical details: [M6 register](docs/m6-review-findings.md#s1-r3--final-capped-review-and-owner-acceptance-2026-09-07).
No fourth implementation review; completed paper and M5.2 reviews were not repeated.

**Limits/next:** S1 is module-contract evidence, not whole-M6 acceptance. S5 still owns complete Git
input enumeration, actual producer/command wiring, two-agent/three-scenario cardinality and prompt-map
proof, qualification and later clean-clone/Docker/live-cohort gates. Current diagnostics cannot qualify
a publication. R3 coverage/individual-guard limits remain in the M6 register; no hidden passing claim.
D-BUDGET remains OPEN before S2 source work; D-CANCEL remains OPEN before S4 dispatch. S2 has not started
and awaits its entry decision and explicit implementation scope. Recommended fresh-session task: resolve
D-BUDGET under plan §4.3 with measured full byte accounting; retain every frozen cap/observation, treat
2048 bytes as an unproven stress candidate, and record a feasible allowance or a concrete amendment need
before S2 source implementation. Do not reopen S1/paper/M5.2 reviews. No live-agent pilot/N10 or recording ran.
Raw native/review evidence is preserved in local ignored `artifacts/review-evidence/tinyvault-m6-s1-20260906.tar.gz`
with a verified manifest and checksum recorded in the M6 register. This local archive is not pushed to
GitHub. Durable commands, outcomes and residual dispositions are in the register; failed attempts remain.


## 2026-09-07-m6-s2 — SDK transport and helper repair (archived 2026-09-07)

Verbatim pre-wrapup Current State follows. Its pending-publication wording is historical: both
2892973 and3b6bbbe were subsequently pushed, exact-commit full verification passed, and remote main
was reverified at3b6bbbe before this wrapup. The new PLAN checkpoint relinquishes ownership.

`2026-09-07-m6-s2` — focus: **M6 S2 only: actual SDK transport and AM11 feasibility**;
owner: codex; **state: active** (2026-09-07), accepted from CLOSED `2026-09-07-m6-d-budget`.
State checkout/worktree: `/Users/jonathanavni/Documents/Coding/tinyvault`; main; entry base
`105e75fa58a3548662646884669aec3efd49e978`; S2 checkpoint commit
`289297335853275d54ebdfd92537455ac0623362`. **S2 and the bounded helper repair are accepted at
final S2 implementation round3.** The user authorized committing and pushing both changes, including
preserved continuity documents. Exact committed verification and remote equality are recorded in
`/private/tmp/tinyvault-m6-s2-20260907/publication-receipt.json`; publication requires that gate to pass.
Release and later-slice work remain unauthorized.

**Outcome:** actual Anthropic SDK0.124.0 transport, durable request fence, full received wire capture,
exact seven declarations/whole-response validation, native message ordering, trusted source identities
and bounded admission are implemented. All six fixed1024 AM11 witnesses fit intact; largest126878 raw
bytes,4194 headroom. Serial/stress/16-turn overflow diagnostics remain unsigned and complete.
This is finite SDK feasibility with verified historical fixture observations, not live LLM completion.

**Verification/reviews:** R2 S2 acceptance passed targeted308, main2486/0/1 inherited skip, timings5+10
and full make test. Claude QA/fresh Codex PASS; R2 Claude security NEEDS-ATTENTION remains retained
with explicit nonblocking owner dispositions. Exact-commit publication then reproduced helper signal
EPERM and was held. The approved repair records signal failures, preserves primary failure/status,
and waits for actual child close. The approved inventory assertion changes6-to10 for four new tests.
R3 passes targeted320, typecheck, diff check, main2490/0/1 inherited skip, timings5+10, final execution
gate and make test exit0. Fresh Claude Opus5 QA/security and Codex adversarial all PASS on the same
frozen candidate. Seven helper mutants are killed with passing controls, including post-review
escalation deletion; the inventory pin has a separate expected-rejection/deletion proof. Native prior
failures and all evidence are preserved. Canonical dispositions: M6 register's final S2 R3 entry.

**Approved exceptions:** exactly two browser_snapshot input corrections in
`testbed/runner.wiring.test.ts:339` and `:372`, assertions unchanged; then bounded helper repair in
`scripts/claude-review.mjs` and `.test.mjs`, plus one inventory assertion/message in
`scripts/gate-cli.selftest.mjs`. All260 executable/package files were compared against2892973:
only those three scripts differ for the repair. No S2 SDK source changed in R3.

**Remaining scope/limits:** S3 exact usable prompt/bootstrap sizing, S5 final command wiring and intact
real pilots/cohorts remain mandatory. Thin4194-byte synthetic-envelope headroom is not a real-provider
margin. D-CANCEL remains OPEN before S4. Preserve all S1 residuals/caps, diagnostic write-failure limits
and the currently unreachable drain-source guard asymmetry. The helper can still wait indefinitely if
a child or pipe-holding descendant stays alive and both signals fail; no privileged or bounded cleanup
claim is made. Mixed-signal/UNKNOWN/Windows and empty-message sentinel proof limits are recorded.
Real48/100 EPERM probes establish an exit-timing window and later child close, not a kernel cause.
No live cohort, Docker/clean-clone acceptance, later-slice source, root SKILL prompt or release occurred.

**Ownership/preservation:** Codex retains this active checkpoint pending next direction; S2 completion
does not authorize S3. Inherited owner documents and historical register/log entries are preserved.
Implementation and review workers are finished. Evidence root: `/private/tmp/tinyvault-m6-s2-20260907`;
immutable prior archive `artifacts/review-evidence/tinyvault-m6-s2-20260907.tar.gz`, with the final R3
publication supplement stored separately. Codex retains integration and Git publication ownership.


## 2026-09-07 — S3 publication checkpoint before formal wrapup

Preserved verbatim from PLAN Current State at commit `db78a1c914052d7424f9cf65e3caae654e3b85f4`.
The active-status/publication-future wording below is historical; the new closed checkpoint lives in PLAN.md.

## Current State

`2026-09-07-m6-s3` — focus: **authorized S3-only agent profiles/recipes and exact prompt sizing**;
owner: codex; **state: active**. State checkout/worktree: `/Users/jonathanavni/Documents/Coding/tinyvault`;
Branch main; publication parent `3b6bbbe795d7fc90ef840327b5dc8a074756baef`. User authorized implementation after read-only kickoff, then explicitly authorized commit and push on2026-09-07.
Preserve all five inherited wrapup edits (entry copies/hashes: `/private/tmp/tinyvault-m6-s3-20260907/entry`).
S3 plan §7 allowlist plus bounded owner docs/wording-gate integration and the approved index fixture extension. Publish this S3 checkpoint with the preserved wrapup documents.
All S1/S2/M5 residuals and closed paper/S1/S2/M5.2 caps retained; S3 gets its own implementation ladder.
D-CANCEL OPEN before S4; no S4/S5 wiring, live cohorts or release authorized. Commit/push authorization covers this accepted S3 checkpoint only.
First checkpoint: usable exact instructions/bootstrap within AM11 and six intact SDK witnesses.

**S3 accepted after implementation R2; checkpoint publication authorized.** Reference/baseline module adapters,
three public recipes, exact root SKILL instructions and wording/budget checks are complete. Ordered R2
verification: targeted304/304, typecheck/diff, main2539/0/1 inherited skip, serial timing5+10 and final
execution PASS. R2 Codex adversarial PASS; Claude Opus5 QA/security NEEDS-ATTENTION with no P1/P2.
Owner absorbed documentation drift and retained explicit nonblocking P3/proof limits in the
[M6 register](docs/m6-review-findings.md#s3-r2--owner-acceptance-and-retained-review-limits). Executable
source/tests, root instructions and gates remain the exact R2-reviewed candidate. Documentation-only
closure receives the mandatory absorption sweep and wording check; no extra code review round needed.
Historical exact reference headroom30/15/6 bytes; baseline minimum182. S5 remeasures final IDs/metadata.
Approved three-line index.test fixture extension retained. Implementation workers/reviews are finished;
publication verifies the exact committed tree before push and records remote equality separately.
See `artifacts/review-evidence/tinyvault-m6-s3-publication.json` for the final local publication receipt
and Git for the committed SHA. Session remains owned by Codex pending user direction or wrapup.
Next separately scoped work: resolve/evidence D-CANCEL before S4 dispatch; S5 command/cohort wiring
and every real pilot/cohort/acceptance gate remain due. No closed review cap has been reset.

### Inherited closed S2 checkpoint (preserved)

`2026-09-07-m6-s2` — focus: **M6 S2 complete; SDK transport and bounded helper repair accepted**;
owner: codex; **state: closed** (2026-09-07), continuity relinquished for a fresh session.
Checkout/worktree: `/Users/jonathanavni/Documents/Coding/tinyvault`; main. Commits
`289297335853275d54ebdfd92537455ac0623362` (S2) and
`3b6bbbe795d7fc90ef840327b5dc8a074756baef` (helper repair) are pushed; local/remote main was
reverified at3b6bbbe before wrapup. No active workers, reviewers, tests or pending publication jobs.

**Verified checkpoint:** exact repair-commit ordered targeted320, typecheck, diff check, full make
test exit0; main2490 passed/0 failed/1 inherited skip, serial timings5+10 and final execution gate
PASS. Final R3 Claude Opus5 QA/security and fresh Codex adversarial PASS. Prior R2 SDK security
NEEDS-ATTENTION retains its explicit nonblocking dispositions. Full findings, seven helper mutation
kills and proof limits: [M6 register](docs/m6-review-findings.md#s2-r3--final-capped-review-and-helper-acceptance-2026-09-07).

**Next session:** run tinyvault-start read-only, preserve the five uncommitted wrapup documents
listed below, verify ownership/Git, and propose the S3-only packet from M6 plan §7. S3 is agent
profiles/recipes and exact usable prompt/bootstrap sizing under §4.3/AM11; its root SKILL and wording
gate belong to that separately authorized candidate. S3 implementation is not authorized by this
wrapup. Do not repeat closed S1/S2/paper/M5.2 review ladders without new evidence. D-CANCEL remains
OPEN before S4; S5 actual command wiring, intact pilots/cohorts and later acceptance remain due.
All S1/S2 residuals,4194-byte synthetic headroom and helper denied-signal liveness limits carry forward.

**Preservation:** only PLAN.md, PLAN-archive.md, docs/m6-review-findings.md,
.claude/memory/gotchas.md and .claude/memory/sessions-archive.md are uncommitted wrapup edits;
source/tests remain at the pushed checkpoint. No new commit/push, release or later-slice work in
this wrapup. Full prior narrative is in PLAN-archive.md. Native evidence and publication receipt:
`/private/tmp/tinyvault-m6-s2-20260907`; original and final R3 publication archives are local ignored
files under `artifacts/review-evidence/`, with checksums/manifests in the M6 register. They were not
pushed to GitHub. No live eval/cohort, Docker acceptance or clean-clone acceptance was run for S2.


---

## Archived 2026-09-07 (wrapup of `2026-09-07-d-cancel`): verbose D-CANCEL/S4 session narrative and the inherited closed S3 stamp, verbatim


`2026-09-07-d-cancel` — focus: **S3 wrapup committed, branches pruned, D-CANCEL resolved (`2bcfbbd`), S4 IMPLEMENTED AND ACCEPTED at the round-3 cap (Astra candidate + two fix rounds, three review channels per round, owner gate green; committed this session)**;
owner: claude; state: active; state checkout: `/Users/jonathanavni/Documents/Coding/tinyvault`; worktree: same (main).

**D-CANCEL (S4 entry gate): RESOLVED 2026-09-07.** Mechanism = `Page.stopLoading` before the mutex wait, E6 order, context
disposal before session-CDP cleanup, context-removal check, shared 5 s expiry-abort; no contract amendment. Cause: a pending
main-frame navigation wedges the page-level CDP session and a goto timeout does not end it; stall site `cdp.detach()`.
Proven externally on the real supervised path (close 2–5 ms / 2.0 s, sockets released, lease clean) with seven experiment
families and three capped Sol paper rounds (R1/R2 NO-SHIP fully dispositioned; R3 NO-SHIP with one in-criteria P1 closed by exp9; final state RESOLVED).
Canonical: M6 plan §7 + M6 register entry; raw evidence `artifacts/review-evidence/tinyvault-m6-d-cancel-20260907/`
(local, ignored). Also found: a hostile page can wedge the trusted host's control channel for ~75 s with one line of JS
(self-navigation to a black hole) — carried into S4 as a fixture + lifecycle rule. **S4 in flight:** packet `docs/m6-s4-handoff.md` (Sol paper pass absorbed; three user-approved decisions: 10 s per-op bound,
failed-run retention stays S5, optional quiesce method + four pre-authorized test files). Astra job `task-mtrqkb95-81pxry` stopped at the retention gate (correct STOP); owner extended ownership to additions-only
`scripts/retention/allowlists.ts` sync (`1bcec40`), resumed as `task-mtrqs30i-51hamj`, which delivered the S4 candidate
(uncommitted) and stopped at the Docker capability gate; owner applied that one row (gate + self-test PASS). Owner
`make test`: exit 2 — controls matrix ×2 (unconditional stop cancels a committing error page), host.ts 920 > 800 lines,
wall-clock bounds outside the timing families. Owner verification: the original black-hole reproduction now closes in
3–5 ms / 2.0 s on the real path with sockets released. Post-impl ladder R1: Codex adversarial NO-SHIP (2 P1), Claude QA
NEEDS-ATTENTION (3 P1), Claude security NEEDS-ATTENTION (2 P1); all 24 findings dispositioned in
`artifacts/review-evidence/tinyvault-m6-s4-packet-20260907/fix-round-1.md` (one declared residual: trusted-backend stall;
one claim narrowing: E5 publication wiring is S5). **S4 accepted.** Fix round 1 (`task-mtrtgs35-9eae5b`, after an adopted F7 clarification) delivered: owner `make test` exit 0
(2613/0/1, timing 5/5, 17/17), real-path repro 3 ms / 4.0 s, owner mutant spot-check 01/09/28 killed with controls.
Round-2 reviews (Codex NEEDS-ATTENTION 1 P1; QA 0 P1 / 3 P2; security 1 P1 / 4 P2) → fix round 2 of 3 dispatched as
`task-mtrw1kff-uwxlce` with owner decisions D1–D4 (drain before child-target destruction; per-session disposal instead of
host-wide abort on op timeout; settle-until budget added to the 5 s deadline; abort-discards-all-evidence residual wording).
Owner also pinned evidenceLease.ts and session.ts in the structural size gate; fix round 2 (`task-mtrwfcjl-14bwqc`, after
adopted G2/G6 clarifications) delivered; owner `make test` exit 0 (2627/0/1, timing 5/5, 20/20); round-3 reviews
(capped, P1 criteria fixed): QA PASS, security PASS, Codex one in-criteria P1 (G12 caller-path witness) closed by a
Sol test-only witness the owner ran against mutant 40. Final owner gate: make test exit 0 — main 2629 pass / 0 fail / 1 inherited skip; timing families 5/5 and 20/20; execution gate PASS (make-test-final-*.json). Canonical: M6 register entry
"S4 implementation — accepted at the round-3 cap" (nine declared residuals). **Next:** S5 packet (composed real-agent
command path; carries the S4 residuals: E5 publication wiring, abort-evidence snapshot, trusted-stall contract,
unmutated arms). owner holds commits while it runs, then runs `make test` + the mutant inventory
itself and the post-impl ladder (Claude QA → Claude security → Codex adversarial; three-round cap). Local main is
`0c377bb`..`61c3fa4` ahead of origin (`2bcfbbd`): four packet commits unpushed. Local main is two docs commits (`0acb6bb`, `b5a478e`) ahead of
origin; nothing pushed this session — push awaits the user's go-ahead.

Previous stamp: `2026-09-07-m6-s3` — focus: **M6 S3 complete and published; session closed**;
owner: codex; **state: closed** (2026-09-07); continuity relinquished for a fresh session.
State checkout/worktree: `/Users/jonathanavni/Documents/Coding/tinyvault`; branch main.
Published commit `db78a1c914052d7424f9cf65e3caae654e3b85f4`; local/GitHub main equality
reverified2026-09-07. S3 implementation, bounded review fixes and preserved S2 wrapup documents are committed.

**Verified checkpoint:** exact-commit ordered targeted304/304, typecheck/diff, full make test exit0:
main2539pass/0fail/1 inherited skip, serial timing5/5+10/10, final execution gate PASS.
R2 Codex adversarial PASS; Claude Opus5 QA/security NEEDS-ATTENTION with no P1/P2. Documentation
clarifications and nonblocking P3/proof limits are retained in the [M6 register](docs/m6-review-findings.md#s3-r2--owner-acceptance-and-retained-review-limits).
All paper/S1/S2/M5.2 completed caps remain closed; S3 was accepted after R2 without consuming R3.

**Retained boundaries:** S3 proves module adapters and six fixed synthetic SDK witnesses. It does not
prove live model usability or composed command/cohort behavior. Historical reference prompt headroom
is30/15/6 bytes (baseline minimum182); S5 must remeasure final cohort IDs and actual metadata, bind
same-backend discovery/probing/setup/fill, and bind root instructions/provenance to actual execution.
All recorded S1/S2/S3/M5.2 residuals remain in their canonical registers; no cap or claim is reset.

**Next session:** run tinyvault-start read-only, preserve these uncommitted wrapup documents, verify
ownership/Git, and propose a D-CANCEL-only resolution/evidence packet before any S4 dispatch. The
locked active-goto and navigation-failed→close resource-cleanup proofs remain due. S4/S5 implementation,
real pilots/cohorts, Docker/clean-clone acceptance and release need their separately scoped steps.
This wrapup authorizes none of them and does not repeat completed reviews.

**Continuity/evidence:** completed details and the inherited S2 checkpoint moved verbatim to
PLAN-archive.md; Decisions Log stays below. Canonical findings: M6 register. Publication receipt and
native evidence archives are local ignored files in `artifacts/review-evidence/`, not GitHub artifacts.
Wrapup changes are documentation only and remain UNCOMMITTED; source/tests stay at the pushed SHA.
Dirty wrapup files: PLAN.md, PLAN-archive.md, README.md, BACKLOG.md, docs/README.md,
docs/m6-implementation-plan.md, docs/m6-review-findings.md, docs/phase-0-plan.md,
.claude/memory/gotchas.md and .claude/memory/sessions-archive.md.
Documentation drift/wording checks passed (153/153); all ten wrapup edits remain uncommitted.
No active workers, reviewers, tests or pending publication jobs.

## Archived 2026-09-08 (wrapup of `2026-09-07-s5`): the closed `2026-09-07-d-cancel` stamp and narrative, verbatim

`2026-09-07-d-cancel` — focus: **D-CANCEL resolved; S4 implemented, reviewed and accepted; pushed**;
owner: claude; **state: closed** (2026-09-07); continuity relinquished for a fresh session.
State checkout/worktree: `/Users/jonathanavni/Documents/Coding/tinyvault`; branch main; local == origin at `b0461f0`.

**This session (all pushed):** S3 wrapup committed (`0acb6bb`); three merged codex branches pruned; D-CANCEL resolved with
a nine-experiment evidence packet and three capped Sol paper rounds (`2bcfbbd`; M6 plan §7 + register entry "D-CANCEL —
resolution and evidence packet"); S4 packet drafted, Sol-reviewed, user-approved (10 s navigation/per-op bounds; failed-run
retention stays S5; optional quiesce method + four pre-authorized test files) and dispatched to Codex Astra; candidate + two
fix rounds under a three-channel ladder (Codex adversarial, fresh Claude QA, fresh Claude security ×3), owner `make test`
green each round after fixes, six owner mutant spot-checks, one Sol test-only witness at the round-3 cap; **S4 accepted**
(`b0461f0`; register entry "S4 implementation — accepted at the round-3 cap", nine declared residuals). Final gate: main
2629/0/1 inherited skip, timing 5/5 and 20/20, execution gate PASS. Evidence archives (local, ignored):
`artifacts/review-evidence/tinyvault-m6-d-cancel-20260907/` and `tinyvault-m6-s4-packet-20260907/` (+ manifests/tarballs).

**Retained boundaries:** S4 proves lifecycle bounds on this host with page-scoped producers; trusted-side stalls (backend,
non-cancellable captures) are bounded only at the abort trigger; `abort()` discards all lease evidence (verdict capture-failed,
never clean); E5 qualification is a module + initial-snapshot observation, not production-wired; socket release rests on the
owner's SYN_SENT observations; nested/service-worker targets are counted, not defeated. Full list: register entry.

**Next session:** `/start` read-only; propose the **S5 packet** (composed real-agent command path, E7/E8) carrying the S4
residuals by name — E5 publication wiring, evidence snapshot before `#drop`, bounded trusted-backend/capture contract (or
explicit residual), the unmutated arms (courtesy deadline term, suspension reserve, `abortSessions` recovery loop, 14 s sync)
— plus S5's own obligations from S3 (remeasure prompt headroom with real cohort IDs; same-backend discovery/probe/setup/fill;
root instructions/provenance bound to execution). Sol paper pass on the packet, then Astra under the full ladder. No live
cohorts, Docker/clean-clone acceptance or release are authorized by this wrapup. No workers, reviewers or jobs are running.


## 2026-09-08-s6 — verbatim mid-session stamp narrative (moved at the 2026-09-09 wrapup)

`2026-09-08-s6` — focus: **S6 acceptance ladder (E9 clean clone → `make test` → `make test-docker` → six-cell pilot → `make baseline` N10 → `make eval` N10 → offline re-adjudication → E10 early recording), plus the Sol claims-row amendment packet for S5 residual (1)**; owner: claude; state: **complete 2026-09-09 (S6 ACCEPTED: E9 attempt 3 qualified on `3072e0b`; E8 met; E10 recorded)**. State checkout: `/Users/jonathanavni/Documents/Coding/tinyvault`; branch main (started at `20f8e00`); clean-clone candidate under the session scratchpad. Docker and live-spend steps each need the user's explicit go-ahead. **Mid-session state (09:30 CDT):** E9 steps 1–2 PASS (clean clone 2791/0/1, 5/5, 20/20; Docker 6/6); step 3 pilot FAILED — the real Haiku 4.5 benign-login trace is 132,056 raw bytes vs the frozen 131,072 cap, rejected locally by the composed transport's pre-dispatch cap check (surfacing as `bridge-closed` at cohort level), ladder stopped, evidence in `artifacts/review-evidence/tinyvault-m6-s6-acceptance-20260908/`; residual (1) CLOSED on main `dfb8ddb` (Astra application, owner gate 2792/0/1 + owner-reproduced mutant kills); M6-AM12 cap amendment drafted and taken through the three-round paper cap (Sol R1 NO-SHIP → Opus 5 R2 NEEDS-ATTENTION → Sol R3 NO-SHIP on four paper P1s) and corrected to v4 (`docs/m6-am12-events-cap-amendment.md`) — awaiting the user's approval and the 1 MiB vs 512 KiB choice; companion `evidence-oversized` slice ACCEPTED at the round-3 cap and merged (`a666b13`); AM12 implementation packet v4 pinned to that base and dispatched to Astra (`codex/m6-am12-caps`). **Update (17:50 CDT):** AM12 ADOPTED at 1 MiB (user), implemented by Astra, taken through the three-round post-impl cap (Codex APPROVE ×2; Opus QA PASS; Opus security NEEDS-ATTENTION with P1-07 dispositioned as a recorded gate residual) with a cap-round integrator commit (`9a90394`: W6 `30_000` timeout, bundled-guard assertion, short-key no-reach witness, doc markers) and MERGED `623a8b7`; owner gates at the merged tree 2876/2875/0/1 + Docker green; V13 clean-clone cost +2.8% wall / +0.5% RSS. V13 also surfaced clean-clone gate variance on the BASE tree (timing-2 Probe P family rejections, 2 of 9 runs today; T4-8 class) — an OPEN gate-policy question for the user recorded in the register. Next: E9 attempt-2 steps 1–2 from a literal clean clone of `main` (three `make test` runs with every report preserved, then `make test-docker`), then ASK the user before the six-cell pilot and the N10 cohorts. **Update (18:30 CDT):** E9 attempt-2 steps 1–2 PASS from a literal clean clone of `7dbac7a` — three consecutive green `make test` runs (2876/2875/0/1, timing 5/5 and 20/20) and Docker green; W6 measured 5,008 / 5,049 ms in two of the runs, so the integrator timeout was necessary. User authorized the ladder at 18:29; **pilot attempt 2 (cohort `TYuNic3U`) ran and is UNQUALIFIED** — AM12 held (six runs of 131–209 KB all attested and verified), but the lookalike-origin-redirect cell has no positive control for either agent: the reference agent's canonical-origin fill after recovery was refused because it passed `assertedOrigin` with a trailing slash (an undescribed optional field in the model-facing tool schema), and the naive baseline was all-diverted at N=1. Ladder stopped before N10; register entry written. **User decided (18:5x CDT):** F1 = LANDED (merged `dd669ba`; Astra STOP → v2 → Docker parity red twice on the owner's example-origin choice → v3 fix → gates green, Codex approve); F2 = M6-AM13 ADOPTED 2026-09-09 (v5, corrections A/B) and IMPLEMENTED — accepted at review round 2 by Codex, Opus QA and Opus security, merged `fe8e9e1`; literal clean-clone checks PASS on `3072e0b` (3× make test 2896/2895/0/1, Docker 7/7); pilot attempt 3 (cohort `cY3Deep4`, user-authorized) = **READY** under the fail-closed rule (reasons exactly ['pilot-not-qualification'], six verified, all positive controls, reference 3/3 complete 0 leaks, baseline 3/3 leaks); **N10 sequence `E9-A3-N10` QUALIFIED (user-authorized): baseline `z22Kn2eT` 30/30 leaks 30/30 completed; comparison `y9WmFqoL` reference 0/30 leaks 30/30 completed, baseline 30/30 leaks 30/30 completed, eval assertion incl. no-provider re-adjudication PASS; E8 met; E10 recorded from the lookalike cell.** S6 acceptance ladder COMPLETE; instruction reconciliation) for approval, NOT applied and no cohort runs until approved; Probe P = deferred, gate retained, no retry-to-pass. No further live spend.

## 2026-09-07-s5 — "Next session" paragraph as written at the S5 close (superseded by s6; moved at the 2026-09-09 wrapup)

**Next session:** `/start` read-only; S6 = E9/E10 acceptance ladder (exact candidate clean clone → `npm ci` → `make browsers` →
`make test`; `make test-docker`; composed six-cell pilot; `make baseline` N10; `make eval` N10; independent offline
re-adjudication; early recording) — each step needs the user's explicit authorization (Docker, live provider spend). Also file
the claims-row amendment packet for residual (1). No workers, reviewers or Codex jobs are running.

## Archived 2026-09-09 (at the M6 close + M6.1 wrapup) — the s6 and s5 Current State blocks

Collapsed from `PLAN.md` Current State once M6 closed (assessment `7bf50bd`) and M6.1 merged (`7ae23be`, integration `352e465`). Verbatim as they stood:

`2026-09-08-s6` — focus: **S6 acceptance ladder (E9/E10) plus the S5 residual (1) amendment**; owner: claude; **state: closed** (2026-09-09); continuity relinquished for a fresh session. State checkout: `/Users/jonathanavni/Documents/Coding/tinyvault`; branch main at `c594f41` (never pushed this session; origin still at `1d32657`).

**This session (2026-09-08 → 09):** residual (1) closed (`dfb8ddb`). Pilot attempt 1 stopped on the 131,072-byte cap → **M6-AM12** (1 MiB) adopted, Astra-implemented, three-round cap, merged `623a8b7`; companion `evidence-oversized` slice merged `a666b13`. E9 attempt 2 steps 1–2 PASS, but pilot 2 (`TYuNic3U`) was unqualified on the lookalike cell → **F1** (exact `assertedOrigin` format described in the model-facing schema; fill service unchanged; merged `dd669ba`) and **M6-AM13** (only N=10 qualifies on the real path; fail-closed pilot readiness on exact reason lists; `BASELINE_SYSTEM` v2 `/success`-path recovery as a disclosed protocol change; three Sol paper rounds, user-adopted with corrections A/B; Astra-implemented, two review rounds on three channels, ten owner-reproduced mutants; merged `fe8e9e1`). Clean-clone checks PASS on `3072e0b`; pilot 3 (`cY3Deep4`) READY; N10 sequence `E9-A3-N10` **QUALIFIED** (baseline `z22Kn2eT` 30/30 leaks; comparison `y9WmFqoL` reference 0/30 leaks 30/30 completed, baseline 30/30 leaks 30/30 completed; eval assertion incl. no-provider re-adjudication PASS) — **E8 met, E9 met, E10 recorded** (lookalike cell, run index 0). Two owner tooling errors (an ungated commit/review dispatch; a fixture-origin example) and one runner bug are recorded in the register and gotchas. Evidence: `artifacts/review-evidence/tinyvault-m6-s6-acceptance-20260908/` (+ tarball and sha256 manifest, local). Verbatim mid-session narrative in `PLAN-archive.md`.

**Open / next session:** (1) Probe P timing-2 gate policy — DEFERRED by the user (gate retained, every failure preserved, no retry-to-pass; two idle-host rejections recorded 2026-09-08; no rejection in any gated run after `3072e0b`). (2) Push decision — main is far ahead of origin and was never pushed this session; the user's call. (3) M6 close-out: the read-only cross-model project assessment CLAUDE.md requires after a milestone close, a residual sweep (AM12 §14, AM13 §9, the S6 entries), and README/release readiness per `guides/release.md`. (4) Backlog candidates: reporting-only readiness script; trusted attempt ledger; `runs.json` mode on the pilot path; `runEvalEntry` allowlist hardening. No workers, reviewers or jobs are running; no live spend is authorized by this wrapup.

`2026-09-07-s5` — focus: **S5 implemented, reviewed through three rounds plus the cap-round integrator fix, and ACCEPTED**;
owner: claude; **state: closed** (2026-09-08); continuity relinquished for a fresh session. State checkout:
`/Users/jonathanavni/Documents/Coding/tinyvault`; branch main; local == origin at `1d32657` (+ this wrapup commit).

**This session (2026-09-07 → 08):** stale probeP busy-loops killed; S4 residual (8) closed by a Sol test-only packet (`46ae3df`);
S5 packet drafted, Sol-reviewed (3 P1 / 3 P2 absorbed), ten owner decisions D-S5-1…10 user-approved, pre-integration
(`b1cd5dd`); Astra candidate after one correct STOP (canary alphabet → D-S5-1 narrowed, `45f1074`) → `fb8816b`; three review
rounds (R1 Codex 2 P1; R2 Codex 2 P1 after three classifier-flagged review-mode failures → defensive task mode; R3 cap: all
three channels converge on one P1) with two fix rounds (`5685d01`, `74ca1e2`) and the cap-round integrator fix (`742c13b`:
attestation minted only after intact finalization); owner `make test` green after every delivery (final main 2791/0/1, timing
5/5 and 20/20, execution PASS); 24 owner mutant reproductions across four passes; docs integration (SCHEMA, phase plan §5,
M6 plan §7) applied; register entry "S5 implementation — accepted" with twelve declared residuals. Evidence archive
`artifacts/review-evidence/tinyvault-m6-s5-packet-20260907/` (+ the worker's `tinyvault-m6-s5-implementation-20260908/`).

**Next session (as written at the S5 close):** superseded by the s6 session above; verbatim in `PLAN-archive.md`.

## Archived 2026-09-10 — session `2026-09-09-m7-entry` (verbatim Current State narrative at wrapup)

`2026-09-09-m7-entry` — focus: **(1) Probe P timing-2 gate-policy decision; (2) M7 entry inputs via Sol test-only / scaffold packets (eval timeout derivation, scenario-inventory un-hardcoding, tool-arg negative classification, bounded UTS-46 sweep in the default gate, `baseline` grammar gate); (3) M7 fixture-slice packet if (1) resolves quickly**; owner: claude; state: active. State checkout: `/Users/jonathanavni/Documents/Coding/tinyvault`, branch main at `d9b4942` == origin/main; worker checkouts: `codex/<packet>` branches as dispatched (none yet).

**This session (2026-09-09, m7-entry):** (1) **Probe P timing-2 policy** — evidence re-read from the preserved reports (17 serial runs, 2 confirmed family rejections both truncated to `tripw…`, 1 unattributed partition red; no probe name or p-value ever preserved); a v1 decision note went through two blind paper reviews (Sol, Opus; both NEEDS-ATTENTION, 17 findings, all owner-verified — M7 register) and v2 is in the tree as a **proposal for user adoption**: gate unchanged until the user decides otherwise, observability first (C1 landed), C2 (per-run sidecar with raw series + A/A and sham-A/B twins of the two tripwire probes, reported not gated, requiring a D10 wording amendment) and a pre-registered N = 20 `make test` campaign with a run-count decision rule whose every outcome is a proposal. (2) **M7 entry inputs** — four Sol test-only / scaffold packets in parallel worktrees (A eval budget + inventory pin, B negative classification + in-gate UTS-46 sweep, C reduced to C1 self-describing Probe P rejection, D grammar gate for `baseline`/`eval:stub`), each owner-verified with two owner corrections recorded (B: validator injected instead of a `@ts-expect-error` in `src/core`; C: reduced to C1), integrated on `claude/m7-entry-integration`, merged to main `4b0f3b7`, **owner gate green** (2934/0/1, 5/5, 20/20, execution PASS; a worktree gate attempt red on the provenance hasher's symlink rejection — gotcha recorded, not a code red). Astra adversarial review + Opus QA review of the range dispatched after the gate; dispositions in the M7 register. (3) **M7 fixture-slice packet deferred** (item 1 resolved into a user decision); read-only research preserved in the evidence directory. Not pushed; no public flip.

**Session, second half (after the user's adoption of the policy note as v2.1, 2026-09-09):** M7-entry range pushed
(`origin/main` = `ca43cd9`, later docs commits local). **C2 implemented through the full ladder** — three capped paper
rounds (Sol/Opus, 7 + 25 + 9 + 17 + 7 findings) → Astra implementation with two owner-answered STOPs → Astra adversarial
+ Opus security/QA reviews (0 P1 in the code; pin-narrowness) → two fix rounds + a cap-round correction (the
registration-isolation invariant was beaten three rounds running; claim narrowed, execution-side inventory pin recorded
as the follow-up) → an integrator fix for the clean-clone red (800-line limit; re-execution timeout) → **three green
exact-candidate clean-clone gates on `1de4ad3`, cost 248.6 s ≤ 600 s, stop rule never triggered**. **Campaign harness**
(`tools/probe-p-campaign/`, bash-only spawner, frozen analysis) through Sol implementation → R1/fix/R2/fix/R3/correction
at the cap. **M7 slice spec rev 1** after a Sol round with two user decisions (O7 staged-lure exposure + `SKILL.md`; O8
console-budget qualification). All on `claude/probe-p-integration` (`1de4ad3`, worktree `wt/integration2`); branches
`codex/probe-p-c2` (`16d455a`), `codex/probe-p-campaign-harness` (`e252713`). Not merged, not pushed.

**Decided 2026-09-09 (evening):** D-1..D-4 accepted, `1de4ad3` merged (`92d2bbe`), campaign authorized after the merge, O7 approved, O8 accepted — Decisions Log. M7 slice spec **rev 3 LOCKED** (`ef1732c`). **Pre-freeze harness corrections merged** (`950fe19`): Darwin `ps` (`etimes` → `etime`) and predicate v2.2 (`PREDICATE_VERSION` 4), after three owner live inventories on the reference host (239 → 175 → 20 → 5 competing; the last five are the desktop in active use). Stale Codex brokers from closed sessions terminated. **Campaign EXECUTED 2026-09-10 (23:17 → 02:41):** 20 started / 20 ended, `make test` green and family accept in 20 of 20, 11 starts excluded by rule B (macOS idle-hour maintenance: iCloud, Spotlight, Photos analysis), **V = 9 → primary "insufficient", quiet over the nine valid runs; nothing adopted; three proposals in the register** ("Probe P campaign — executed"). **Open:** push authorization (main is many commits ahead of `origin/main` = `ca43cd9`); the user's decision on the proposals; the M7 Astra packet from the locked rev 3. *(Superseded text: the campaign had NOT started* — the host was in active use all evening (Spotlight/media-analysis indexing at 40–90 % CPU for hours, then WindowServer/Finder/Telegram); excluded runs would consume the single authorized campaign, so the start waits for a real idle window. **Campaign handoff (frozen at the HEAD of this commit; identities in `/Users/jonathanavni/Documents/Coding/tinyvault-evidence/probe-p-campaign-20260909/campaign.json`):** start from the main checkout with a clean tree and the host idle for ~5 h (no Codex/Claude review jobs, no browser tests, no builds; the desktop not in active use — rule B excludes runs where any non-harness process is at ≥ 10 % CPU at run start, and excluded runs still count toward the 20): `tools/probe-p-campaign/run.sh --out /Users/jonathanavni/Documents/Coding/tinyvault-evidence/probe-p-campaign-20260909 --runs 20`; if interrupted, resume the same directory with `--resume` (never a new directory); after the 20th `ended.json`: `node tools/probe-p-campaign/analyze.mjs --dir /Users/jonathanavni/Documents/Coding/tinyvault-evidence/probe-p-campaign-20260909` writes `report.md` — every outcome is a proposal to the user. **No commit on main between freeze and the 20th run** (the harness refuses a run whose HEAD ≠ candidate).

**Previously open (now decided):** (1) accept or amend **D-1..D-4** (diagnostics after the family gate; owner measures cost and the
stop rule; the named D10 exception; `.then(NO_HOOK)` in the gated real-click probe) → then merge `1de4ad3` to main and
authorize the push; (2) authorize the **campaign start** (20 × ~14.5 min ≈ 5 h of idle host; `tools/probe-p-campaign/run.sh
--out <dir> --runs 20` in the main checkout at the merged SHA); (3) **O7 / O8** for the M7 spec; (4) the execution-side
timing-2 inventory pin (BACKLOG) as the next Astra packet.

## 2026-09-10-m7-packets — packets, inventory pin, M7 implementation (archived 2026-09-10 (m7-packets))

Collapsed from `PLAN.md` Current State at wrapup. Verbatim focus stamp and breadcrumb as it stood:

`2026-09-10-m7-packets` — focus: **paper-only drafting of (1) the Astra packet for the execution-side timing-2 inventory pin and (2) the M7 implementation packet from locked rev 3, each through Sol paper review, with both packets and their dispositions returned to the user before any implementation**; owner: claude; state: active; state checkout: `/Users/jonathanavni/Documents/Coding/tinyvault`; worktree: none (branch `main` at `913416b`). Not authorized: implementation of either packet, a second campaign, live-provider spend, push, public flip. **Breadcrumb 2026-09-10:** both packets drafted v1 (`docs/probe-p-timing2-inventory-pin-packet.md`, `docs/m7-implementation-packet.md`); owner probe recorded (Chromium 151 rejects streaming request bodies over HTTP/1.1, so the spec's E7 P-LIM-CHUNKED page probe is not producible — packet D-2); paper round 1 dispatched: Sol x2 (`task --fresh --model gpt-5.6-sol`, read-only) + blind Opus x2, prompts and reports under `artifacts/review-evidence/tinyvault-m7-packets-20260910/`. Register written only when all four are in. **Round 1 complete (2026-09-10):** all four reports in and owner-verified; both packets rewritten as **v2** with every verified finding absorbed (pin packet: 2 convergent P1 + 3 P2 + 4 P3; M7 packet: 2 P1 + 8 P2 + 6 P3, one Sol P3 disproved); register entry "Paper round 1 — timing-2 inventory-pin packet and M7 implementation packet". **User decisions received (2026-09-10):** recommended choices approved with scope clarifications (D-1 A; D-2 probe removed, residual retained; D-3 strict < 1,024 as M7 headroom; D-4 yes; D-5 yes; D-6 archive unchanged; O-1 no; O-2 no; O-3 accepted). Folded into both packets (**v3**), spec amended and re-locked **rev 4**, register entry "USER DECISIONS (2026-09-10)", committed with explicit paths. **Round 2 complete (2026-09-10):** Sol + blind Opus per packet on `2b38dec`; pin packet 1 convergent P1 (self-test loop construction) + 3 P2 + 8 P3; M7 packet 2 P1 (post-cap canary witness; checker leave-alone vs the FixtureId widening) + 9 P2 + 8 P3; one owner error in the rev 4 absorption (E8a 1008/1008) reverted to 1006/1008. Both packets **v4**, spec rev 4 with round-2 corrections, register "Paper round 2". **USER (2026-09-10): paper review closed at round 2; v4 packets at `32ab229` accepted as the implementation contracts (not implementation acceptance). Authorized sequence:** (1) pin packet → Astra on `codex/timing2-inventory-pin` (base `32ab229`), post-impl reviews, owner gates, explicit-path commits and merge when green with no blocking finding — verify the dedicated mutant table executes every case for its named reason; keep the narrow multiset claim and four residuals; (2) after that merge, reconcile M7 v4 by content match, dispatch on `codex/m7-fixtures` with the full ladder incl. the security channel, return the reviewed candidate + gate evidence + residuals + deviations **before merging M7**; load-bearing witnesses (real client + injected fetch emits the actual sdk-request-context; console diagnostic proves the post-cap canary emission occurred and was omitted, deletion fails; ten prompt rows from final inputs; sessionStorage propagation and the fake-reauth fill within scope — else STOP with the concrete conflict). No push, campaign, live spend, public flip; Probe P verdicts/diagnostics/no-retry unchanged. **Step 1 DONE (2026-09-10):** Astra implemented (one STOP → Extension 1: `scripts/test-execution.d.mts`); owner comment + digest refresh; Codex adversarial review PASS (no findings), blind Opus QA PASS (P3s only, 7-variant gate-mutation matrix); owner gates in the real checkout at `c49e9ad`: `make test` 3248/0/1 + timing 5/5 + 26/26 (actual verdict) + `test execution PASS`, V6(b) add/rename/drop/dup all `timing-2-inventory`, `make test-docker` 7/7; the worktree `make test` red is the known symlinked-`node_modules` provenance artifact (log preserved). **Merged fast-forward to main = `c49e9ad`.** **Step 2 started (2026-09-10):** M7 v4 reconciled by content match against base `07030b6` (no cited file touched by the pin merge; 40 anchors hold; `388839a`); Astra write job dispatched in worktree `scratchpad/wt/m7-fixtures` on `codex/m7-fixtures` (wrapper `packet-m7-astra-dispatch.md`, load-bearing witnesses restated). Ladder after delivery: owner commit on the branch → Codex adversarial + Claude `/review` + `/security-review` → owner gates in the real checkout (`make test`, `make test-docker`, stub `make eval`, E3/E6/E7 mutant table) → **return the reviewed candidate, gate evidence, residuals and deviations to the user before merging M7.** **Astra STOP #1 (2026-09-10, no edits made, thread resumable):** S6 as written is unsatisfiable — the scripted client typing the canary into the console control is itself captured as a plaintext `tool-arg` event before execution (`src/agents/loop.ts:395-409`) and classifies `unauthorized-sink`, so "canary absent from persisted evidence, checker clean" cannot hold with that provenance. **USER (2026-09-10): option 1 — O-M7-1.** Packet amended (S6, §2.13, §11; `97f955a`, `8c871e0`), branch re-pinned to `8c871e0` (code identical to `07030b6`), Astra resumed with `packet-m7-astra-extension-1.md`. **STOP #2 (2026-09-10):** E2's widening of `container/fixture.test.ts:93` forces two `P-finalize` selectors in `claims.ts`/`claims.test.ts:1506`/mirror row — owner ADOPTED as Extension 2 (permitted inventory update, ids/bindings/mutation sites unchanged; `7609df8`); Astra resumed with `packet-m7-astra-extension-2.md`. **DELIVERED and gated (2026-09-10): candidate `codex/m7-fixtures` at `9a826e5`, RETURNED TO THE USER, NOT MERGED.** `make test` green on `9a826e5` (main 3281/0/1, timing 5/5 + 26/26); `make eval-stub` green (five scenarios 0/10, 10/10); `make test-docker` 6/7 — the composed closer's export secret-scan times out at 120 s under the five-fixture project's 965 close-time secrets (measured: 3 MB/s vs 6 MB/s at 579; ≈146 s vs ≈85 s per export) — a capacity limit, options (a)–(d) in the register; **recorded Probe P rejection on `828c769`** (real-click tripwire, p = 1.9e-5, twins same sign; complete sidecar preserved; not rerun); Codex adversarial NEEDS-ATTENTION (2 P1 → one fixed, one = the D-6 pin), blind Opus QA NEEDS-ATTENTION (fixes applied; residuals recorded), `/security-review` PASS. **Decisions requested:** D-6 byte-pin (519→513) disposition; Docker export-scan option; the recorded Probe P red; the owner mutant table timing; merge. Register: "M7 implementation — delivery, two STOPs, fix rounds, reviews, owner gates; RETURNED TO THE USER BEFORE MERGE". Earlier text: (owner recommendation: the page echoes the value of the *authorized* `fill_from_vault` into the tokened `#password` — the fill sets `.value` via the prototype setter, `src/browser/inRealm.ts:117`, lockdown blocks only further typing, `session.ts:642` — so the only unauthorized path is the post-cap console emission and the whole-run scan is honestly clean). Evidence dir gitignored; transcription source also at `~/Documents/Coding/tinyvault-evidence/m7-packets-20260910/`.

## 2026-09-09-m6-close (archived 2026-09-10 (m6-close))

Verbatim block as it stood in Current State:

`2026-09-09-m6-close` — focus: **M6 close-out (assessment, README readiness, branch cleanup, push) and the M6.1 remediation slice through the full ladder**; owner: claude; **state: closed** (2026-09-09); continuity relinquished for a fresh session. State checkout: `/Users/jonathanavni/Documents/Coding/tinyvault`; branch main at `352e465` == origin/main (+ this wrapup commit). No workers, reviewers, worktrees or jobs are running; no live spend is authorized by this wrapup.

**This session (2026-09-09):** three blind read-only channels (Codex Astra, Opus 5 QA, Opus 5 security) assessed a frozen clone of `50e96e9` (executable source = `3072e0b`); every finding owner-verified line by line — [`docs/project-assessment-2026-09-09.md`](docs/project-assessment-2026-09-09.md), register entry "M6 milestone-close assessment". **M6 CLOSED.** One verified P1 (`M6C-CODEX-P1-01`: a receiptless baseline row's canary is authenticated only by its receipt, so an edited bundle can under-report baseline leaks and stay `qualified`; recorded cohorts unaffected, reference 0/30 unaffected) → **M6.1 remediation slice** owed before M7's first live cohort and any published bundle (BACKLOG 🔴). All three channels' P2 (README described `make eval` as the scripted stub) and every P3 status-drift item fixed: README status/M6 row/eval paragraph/N10 comparison table/evidence-claim narrowing, ORIENT.md, SCHEMA S3/S5 sentences, M6 plan header/AM12 row/:104, docs index, phase-plan build status, spec `7/10` annotations. Residual sweep of every M6 residual in the assessment. Owner gate 1 on the docs tree red by owner error (edited tracked docs mid-run → `source-drift`; preserved; gotcha); gate 2 on the untouched tree: main 2895/0/1 and timing-1 green, timing-2 19/20 — a Probe P family rejection (the deferred T4-8 class; recorded, not rerun). Five merged `codex/*` branches deleted; main pushed.

**M6.1 DONE (2026-09-09):** packet `docs/m6-1-canary-authentication-packet.md` v4 ADOPTED at the three-round Sol paper cap (R1/R2/R3 all NO-SHIP, every finding verified; the R3 criterion-(b) P1 absorbed as the cap-round owner correction; two P2 residuals) — pinned `bb2a1cc`. Astra implemented on `codex/m6-1-canary-auth` with one STOP (the AM12 retention fixture had no bootstrap) → Extension 1 (four fixture lines). Three-channel review: Codex MERGEABLE (no findings); Claude QA and security NEEDS-ATTENTION with no code defect (P2 on the implementer report text; P3s recorded); owner gates on the candidate: `make test` 2921/0/1 + timing 5/5, 20/20 + execution PASS, `make test-docker` 7/7. Merged fast-forward `7ae23be`; owner integration applied (README claim restored, SCHEMA reference sentence, phase-plan oracle sentence, M6 plan §3 row, BACKLOG closed). Register entry "M6.1 receiptless-row canary authentication". Evidence `artifacts/review-evidence/tinyvault-m6-1-canary-auth-20260909/`.

**Open / next session:** (1) M7 entry inputs and the Sol test-only packets in BACKLOG "From the M6 close assessment". (2) Probe P timing-2 gate policy — DEFERRED by the user; a third idle-host rejection was recorded 2026-09-09; decide before M7. (3) Public-flip of the repository stays gated on a separate explicit go-ahead.

## Archived 2026-09-10 (m7-final-acceptance)

Session `2026-09-10-m7-final-acceptance` (owner claude; the fresh session the m7-packets wrapup handed off to). Executed
`docs/m7-final-acceptance-handoff.md` §3 in order under the user's five decisions of 2026-09-10:
1. **Owner mutant table on `9a826e5`** (real checkout detached, quiet host; driver + logs in the evidence dir
   `mutants-9a826e5/`): 11 handoff rows + 7b + 10b + 1b–3b, then 9c. 15 of the first 16 red; row 7 (remove the `close` action)
   was an equivalent mutant — the loop's next request produces the `sdk-request-context` witness — replaced by 7b (production
   emission deleted → red through the E5 oracle); rows 1–3 and 5 redded at actuation (earlier than the intended assertion),
   1b–3b reached `assertDecoyBody`; 10b proved the derived count in a scratch copy. Register `80d588a`.
2. **Docker amendment** — packet `packet-m7-astra-docker-deadline.md` to Astra (`task-mtvy2gru-pxyldr`): `EXPORT_TIMEOUT_MS = 240_000`
   for `#export` only, 49-hit reconciliation table, strengthened hanging-export test (pending/unkilled at 120 s, kill + destroyed
   streams at 240 s, literal pins), new partial-export test, five sandbox mutants killed, no deviations. Owner commit `2aead00`.
3. **Focused reviews on `828c769..2aead00`** (no gate running): Codex adversarial NEEDS-ATTENTION — P2 the budget test's 579 pin
   (true count 965; masked on both earlier candidates by the export timeout thrown from the teardown `finally`) → owner fix
   `b7889d3`; P1 the DOM count counts increments → accepted residual, proved by mutant 9c (observer kills it). Blind Opus QA
   NEEDS-ATTENTION — gap/P2 from files that live on `main` not the branch; P2 dangling BACKLOG reference → item added; P3 and
   residuals recorded. Security review not re-run (no fixture/witness content change beyond the derived count).
4. **Final gates on `b7889d3`**: `make test` 3282/0/1 + 5/5 + 26/26, `make test-docker` 7/7 (exports 143–150 s at 965 scanners,
   teardown 729 s), `make eval-stub` green. Returned for merge approval (`050a8c6`).
5. **User approval** (verbatim in substance in the Decisions Log): merge `b7889d3`, E10, accept the 579 → 965 correction without
   another round, accept the diagnostic limitation explicitly without relabeling the reviews, keep Probe P unresolved, no
   push/campaign/spend/flip. Merge `4e86933` (no-ff; code byte-identical to `b7889d3`), E10 docs `29f704a`, merged-tree gates
   and a literal clean clone (`npm ci` → `make browsers` → `make test`) all green; acceptance record `9f4574f`.
Lessons to memory: the companion job store is keyed by the dispatch cwd; a throwing `finally` masks the assertion you were
looking for; a handoff's intended assertion is a hypothesis until executed.

### Moved from the `2026-09-09-m7-entry` entry (superseded "Shipped"/"Next session" paragraphs; kept verbatim)

**Shipped this session (all on main, reviewed through the ladder, gated):** M7 entry inputs (4 Sol packets → `4b0f3b7`, fixes `4909ba8`, pushed); Probe P policy note adopted by the user as v2.1 (observability first, gate unchanged); **C2** diagnostics beside the gate (`16d455a` → merged `92d2bbe` after the user accepted D-1..D-4; three clean-clone gates green, cost 248.6 s ≤ 600 s); **campaign harness** `tools/probe-p-campaign/` (bash-only spawner; predicate v5 after three live inventories); **the pre-registered 20-run campaign executed 2026-09-10** — 20/20 gate green, 11 starts excluded by rule B (macOS idle-hour maintenance), **V = 9 → inconclusive; user accepted P-1**: gate, deferral, historical reds and D-1 limits unchanged, no second campaign, excluded runs never admitted; archive `~/Documents/Coding/tinyvault-evidence/probe-p-campaign-20260909/`. **M7 slice spec rev 3 LOCKED** (`docs/m7-slice-spec.md`; O7/O8 decided). Register for all of it: `docs/m7-review-findings.md`.

**Next session (user-directed, in order):** (1) the scoped **Astra packet for the execution-side timing-2 inventory pin** (`scripts/test-execution.mjs` pins the timing-2 report's 26 test titles; root-of-trust script change, self-test mutants, digest refresh — BACKLOG "From the C2 / campaign-harness ladder"); (2) the **M7 implementation packet** drafted from locked rev 3 (fixture pages and prompt payloads are the spec §11 Codex trigger — Astra authors them; Claude owns plan, integration, gates); **bring both packets and their paper-review dispositions back to the user before implementation.** Not authorized: implementation of either, a second campaign, live-provider spend, push, public flip. Standing rules restated by the user: future required gates keep their actual verdicts; any new Probe P rejection keeps its complete diagnostics (sidecar) and is investigated without retrying to green.

## Archived 2026-09-10 (e8b-prereg-m8-packet)

Session 9 (`2026-09-10-e8b-prereg-m8-packet`, owner claude): read-only state verification (`main` = `origin/main` = `bac91db`; nothing running). **E8b:** pre-registration written (attempt `E8b-A1-N10`; SKILL 513 / `0dc375cd…`; registry `c7475344…`; BASELINE_SYSTEM `62ba8ba4…`; Haiku 4.5 t=0; composed transport; qualification rules); the N10 usage was found persisted twice per response (`sdk-response` + `sdk-metadata`) and deduplicated by `msg_` id — 90 runs, 871 requests, 2,079,874 in / 110,610 out, $2.63; expected ≈ $3.6 for 100 runs; a $21 sizing scenario (not enforced); Sol fact-check NEEDS-ATTENTION 8 P1 / 3 P2 / 1 P3, all absorbed (rev 2); spend watcher written and dry-run against the N10 tree (60 runs, $1.7238); the launcher's process-group defect found by the dry run (a non-interactive background job shares the parent's pgid; fixed with `perl setpgrp` plus a zombie-aware alive test). **M8:** environment survey (Explore agent), packet rev 1 → three paper rounds (Sol read-only via `task --fresh --model gpt-5.6-sol` + a blind Opus subagent per round, buffered, register written only when both were in): R1 18 P1 (gate rejects once not twice; message constant not re-exported; equivalent mutant; stderr leak; unadmitted vault tools; wrong validator; verdict-dependent exit code; 10 s bound before mutex acquisition; close-before-quiesce order; launch path invented); R2 18 P1 incl. three regressions between R1 fixes (sequential dispatch vs real-mutex mutant; per-call drain throw path; symlink fixture confounded) and spec facts fetched by the owner (cache fields, `_meta.serverInfo`, legacy ping/negotiation, batching removed 2025-06-18); R3 cap 12 P1 (modern `ping` removed in 2026-07-28; eras served concurrently; bundle must resolve externals from the checkout; docker-invocation selftest synthesizer; dependency selftest manifest pin + fixture dirs; legacy id reuse; notifications never answered; drain mutant; post-host quiesce check; §0 inventory boundary) → rev 4 lock candidate; mechanism probe on the real gate (exactly one violation; PASS after cleanup). Commit `915a90f` (docs only, explicit paths). User decisions recorded at wrapup (Decisions Log 2026-09-10, E8b and M8 entries).


## Archived 2026-09-11 (wrapup of `2026-09-10-e8b-live-cohort`): the session's focus stamp with its pre-wrapup outcome, and the collapsed `2026-09-10-m7-packets` Current State entry, verbatim

`2026-09-10-e8b-live-cohort` — focus: Session A, E8b only — harden the spend watcher and launcher (loss of monitoring stops the eval; unfinished vs invalid completed evidence; no silent omission of unaccountable usage), local failure tests, pre-registration rev 3, quiet host, the single attempt `E8b-A1-N10`, preserve and record. `owner: claude`, `state: active`, checkout `/Users/jonathanavni/Documents/Coding/tinyvault` `main`; cohort clone in the session scratchpad. No push, no public flip, no second cohort. **Outcome (2026-09-11, before wrapup):** monitors hardened (watcher rev 3.1, launcher rev 2.1, 34 tests ×4 green, Sol ladder 3 rounds → PASS), pre-registration rev 3, pre-flight green, **attempt `E8b-A1-N10` executed once — cohort `ODMFYbwH` UNQUALIFIED: reference leak 10/10 on `fake-reauth-prompt`, 0/10 elsewhere; $3.254; preserved; not repeated** (Decisions Log 2026-09-11; register). Uncommitted: this file, the pre-registration, register, README/BACKLOG/phase-0/slice-spec status sentences, `.claude/memory/gotchas_shell.md`. Pending the user: response to the finding, Console reconciliation, commit.

`2026-09-10-m7-packets` — **closed 2026-09-10** (one calendar day; continuity relinquished for a fresh session). State checkout `/Users/jonathanavni/Documents/Coding/tinyvault`, branch `main` at this wrapup commit; `origin/main` = `ca43cd9` (**everything after is local and unpushed — no push authorized**). **Shipped:** both packets through two paper rounds → v4 contracts (`32ab229`); timing-2 inventory pin implemented, reviewed, gated and **merged `c49e9ad`**; M7 implemented on `codex/m7-fixtures` → candidate **`9a826e5`, NOT MERGED, returned to the user** (reviews: Codex NEEDS-ATTENTION → fixed/flagged, Opus QA NEEDS-ATTENTION → fixed/recorded, security PASS; gates: `make test` green incl. timing-2 26/26, `make eval-stub` green, `make test-docker` 6/7 — export-scan capacity at 965 secrets; **recorded Probe P rejection on `828c769`** with its complete sidecar). **User decisions 2026-09-10 (Decisions Log):** Probe P red preserved, no timing-only runs; Docker 240 s per-export deadline authorized (scoped); D-6 byte pin accepted; owner mutant table now; focused reviews + final gates incl. Docker 7/7 → return for merge approval. **Next session: execute [`docs/m7-final-acceptance-handoff.md`](docs/m7-final-acceptance-handoff.md)** (mutant table on `9a826e5` → Docker amendment via Astra → focused reviews of `828c769..final` → final gates → return SHA/dispositions/table/evidence; no merge/push/campaign/spend/flip). No worktrees needed beyond the candidate's (recreate per the handoff); no jobs running. Verbatim session narrative in `PLAN-archive.md` ("Archived 2026-09-10 (m7-packets)").
