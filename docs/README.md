# docs

Project documentation lives here. Two kinds:

- **Methodology (permanent):** [`handoff-pattern.md`](handoff-pattern.md) — how the orchestrator hands work off to the adversary. Read it before any Codex handoff.
- **Planning docs and draft specs (per-project):** the detailed design for an in-flight workstream, draft specifications, and design records — where the "how" for a planned piece of work lives, before and during implementation.

When a planning doc or spec is superseded or shipped, move it to [`archive/`](archive/) rather than deleting it. The history is useful, and a stale doc at the root is more confusing than an archived one. `/wrapup`'s doc-hygiene check surfaces docs that look superseded but haven't been moved.

Active planning docs:
- `phase-0-plan.md` — the canonical Phase 0 implementation plan. **LOCKED** after a 3-round Codex
  adversarial ladder + a fresh-context alignment review; carries the §8 milestone ladder, the §5
  eval contract, and the §10 residual risks. Amended post-lock where recorded in `PLAN.md`.
- `spec-amendment-2026-08-31.md` — planning-side proposal (external intelligence since kickoff).
  **Triaged 2026-08-31** — all 8 outcomes in the `PLAN.md` Decisions Log. **Fact-checked 2026-09-01**
  (`0876589`). **A1 and A3 absorbed into `PROJECT-SPEC.md` 2026-09-01** (§2, §3, §7, §8); the remaining
  outcomes stay where triage put them (**A2 and D1's spec halves written 2026-09-03** — §3 non-goals, §4 item 5,
  §7 step 5; A4 at M10, B1 shipped in M2/M3, C1 at M7+, D1's implementation at roadmap step 5).
- `spec-amendment-factcheck.md` — verification of every external claim in the amendment: 27 confirmed,
  7 partial, 3 wrong, 3 unverifiable, with sources and replacement wording. Its corrections are applied
  in the absorbed A1/A3 text; apply them again to anything else lifted into the spec or the README.
- `audit-opus5-m0-m1.md` — independent Opus 5 blind audit of M0+M1. **Resolved** (`07996a2`);
  deferred items live in the M4/M5 gate lists.
- `m2-slice-spec.md` — the M2 implementation contract (revision 4). **Shipped** (`6a6b67c`); carries
  Appendix A (normative origin table) and Appendix B (transform corpus), both still load-bearing for M4.
- `m2-fix-slice-spec.md` — the M2 repair contract written against the three-channel findings register.
  **Shipped** (`6a6b67c`).
- `m2-review-findings.md` — the authoritative M2 review register: three paper rounds, five code rounds,
  and the appended closure sections. **Append-only** — historical sections are never rewritten. Addenda
  G-1 (gate scanned `.d.ts`, fixed in M3) and G-2 (`createRequire` ban is heuristic, open) appended 2026-09-01.
- `m3-slice-spec.md` — the M3 implementation contract (revision 4, **LOCKED** after three Codex paper
  rounds; two sentences amended post-implementation, annotated in place). **Shipped** (`9e212da`).
  Carries D1–D6 (libsodium choice, per-record AEAD policy binding, no key cache, interface shape, writer)
  and §7 (the gate resolver rules and 11-fixture matrix).
- `m3-fix-slice-spec.md` — the M3 repair contracts for post-implementation rounds 2 and 3, written against
  the register. **Shipped** (`9e212da`).
- `m3-review-findings.md` — the authoritative M3 review register: three channels in parallel, three
  rounds, the continuity-owner amendments (§C), residuals (§D), and the integrator's confirmation-pass
  evidence. **Append-only.**
- `m4-slice-spec.md` — the M4 implementation contract (revision 5, **LOCKED** after a three-round two-channel
  blind paper ladder; amended post-lock where the register's C-sections say so). Carries D1–D10 (CDP isolated world,
  `backendNodeId` identity, epoch signals, constant-size hex transport, the single `consume()` site, probe P, the
  four-zone dependency gate with the vetted Playwright tier) and Acceptance A–N. **Shipped** (`b8a9396`);
  amended post-lock (C-F1 probe P, J-S7, the honest-claims sentence) where the register says so.
- `m4-review-findings.md` — the authoritative M4 review register: three paper rounds, the real-Chromium probe
  evidence, per-commit three-channel post-implementation rounds (commits 1–4 and their fix slices), the
  post-M4 whole-codebase audit (§9.2 + the §9.1 answer), and the five final rounds ending with M4's shipped residuals. **Append-only.**
- `m5-slice-spec.md` — the M5 implementation contract (revision 3, **LOCKED** at the two-round Codex paper cap).
  Carries D1–D9 (shared fixture core with per-fixture signers, the two hostile fixtures, the harness coverage gate,
  console-preview and redirect capture, recursive worker attach, the M4 residual fold-in table) and Acceptance A–G.
  **Shipped (M5, `96e3ea3`).**
- `m5-review-findings.md` — the M5 review register: D7 probe evidence (four rounds), paper rounds 1–2 verbatim,
  the continuity-owner dispositions (C-1, C-2) and the lock; then per-slice three-channel rounds (A: C-A1–C-A3; B: C-B1, C-B2, C-B2f1, C-B2f2, C-B3) with the capped fix rounds and the integrator confirmation passes. **Append-only.**
- `m5-2-slice-spec.md` — the M5.2 implementation contract (**revision 4, LOCKED** 2026-09-04): Docker-composed
  fixtures behind one implementation and two transports. Carries the **locked threat model**, the **Docker-daemon
  isolation deployment requirement**, D1–D8 (the transport seam; one container per fixture with an internal control
  Unix socket; the `docker exec -T` bridge, its provenance chain and framing; per-operation capabilities;
  fixture-control-only attestation; the daemon-channel preflight and fail-closed construction; the canonical parity
  gate; capture transfer without shared mounts; the frozen agent tool surface) and Acceptance A–P.
- `m5-2-implementation-plan.md` — how the locked M5.2 contract is sequenced: six independently-green commits, the
  Codex/integrator ownership split, and which Acceptance criteria each commit gates. Docker enters at commit 3 and
  never on the `make test` path. **Slices 1–3 merged (`ab52f8e`, `8133495`, slice 3 — see `PLAN.md`); slice 4 next.**
- `m5-2-review-findings.md` — the M5.2 register: C-R1 (seam recon), C-R2/C-R3/C-R5 (three adversarial paper rounds,
  which killed the original network shape, then the sidecar split and exec bridge, then found the Docker daemon was
  an unguarded alternate control transport), C-R4 and C-R6 (the user's threat-model lock and bounded cap
  extension), C-R7 (the focused closure review, **preserved as the reason daemon exclusivity became an explicit
  deployment assumption**) and C-R8 (the continuity-owner adjudication that locked revision 4). **Append-only.**
- `m5-2-slice-2-plan.md` — the slice-2 implementation contract (**revision 3**): the daemon-channel preflight,
  the canonical `unix:///` endpoint policy and the C-R7 P2 decision it owns, source resolution and the ambiguity
  rule (AP-1/AP-2/AP-3), pinning enforced at a runtime choke point, preflight ordering on the public capture
  entry, and fail-closed composed construction. Absorbs two pre-implementation review rounds. **Shipped**
  (`8133495`).
- `m5-2-slice-2-review-findings.md` — the slice-2 register, **append-only**: pre-impl rounds C-T1/C-T2 and
  C-T3a/C-T3b; the three-channel post-implementation review (Codex, fresh-context QA, security-review) with F1–F6
  and the P3 dispositions; round 2 on the absorbed-fix diff; and the adjudications, including why the broad
  Unix-socket rejection is a recorded compatibility restriction rather than an isolation claim.
- `m5-2-slice-3-plan.md` — the slice-3 implementation contract (**revision 3**, three pre-implementation rounds):
  one image / three services on fixed loopback ports, harness-controlled creation with a pre-up absence check and a
  full inspect table, the framed `docker exec -i` bridge (canonical frames, ordered high-water-mark correlation,
  close-never-resync, a runtime stdout tripwire), bootstrap-over-stdin and the injective challenge/MAC, the
  closed-schema Compose + Dockerfile lint, the entry-point grammar gate and execution proof that pin `make test`,
  and the narrowed claim for static scans. Resolves slice 2's B4, R2-4 and eval-time-interceptor residuals.
- `m5-2-slice-3-review-findings.md` — the slice-3 register, **append-only**: C-U1/C-U1b (round 1: Codex Sol STOP
  10×P1, Claude 7×P2), C-U2/C-U2b (round 2: Codex STOP 8×P1, Claude 1×P1 — the round that beat every static scan
  and forced the claim narrowing), C-U3/C-U3b (round 3, the lock: the entry-point files become a hash-pinned root
  of trust), the implementation log (every adjudicated Codex stop and integrator amendment, the first real Docker
  runs, the `browser_close_session` finding), and the three-channel post-implementation review with three fix
  rounds under the cap. **Shipped** — see `PLAN.md` for the merge commit.
- `project-assessment-2026-09-03.md` — Codex's read-only project teardown at `e69259d` (post-M5): two P0 gate defects, the
  fixture-topology conflict, stale docs, missing release engineering. Verified by Claude the same day; dispositions in
  `m5-review-findings.md` §C-P and the M5.1 slice in `PLAN.md`. Its milestone table is inaccurate for M1–M3 — read `PLAN.md` for those.
- `project-assessment-2026-09-04.md` — a read-only cross-model project assessment the user commissioned
  separately, reviewing `main` at `f161f1b`. Supersedes the current-state conclusions of the 09-03 assessment
  (its two gate defects are closed). Seven findings A1–A7; **A5** (scorecard provenance) and **A7**'s doc half
  were actioned, the rest dispositioned as M6 planning inputs or existing declared residuals. Carries an
  integrator note recording what in it is superseded. **Append-only.**
- `archive/implementation-plan-superseded.md` — earlier orphaned Phase 0 draft, consolidated into
  `phase-0-plan.md` (provenance only)
