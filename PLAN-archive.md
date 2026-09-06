# PLAN Archive

Full detail of completed or no-longer-load-bearing work, moved out of `PLAN.md` so its Current State stays lean. Reviewed every `/wrapup`: anything no longer needed to understand current/next work lands here as a short, dated summary.

This file is for historical context. It is never read at `/start`.

---

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
