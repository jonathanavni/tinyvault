# PLAN Archive

Full detail of completed or no-longer-load-bearing work, moved out of `PLAN.md` so its Current State stays lean. Reviewed every `/wrapup`: anything no longer needed to understand current/next work lands here as a short, dated summary.

This file is for historical context. It is never read at `/start`.

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



