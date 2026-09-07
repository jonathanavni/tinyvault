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
and context evidence may not fit the frozen131072-byte cap; 2048 prompt/bootstrap bytes is a stress
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
