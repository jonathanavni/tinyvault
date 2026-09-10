# docs

Project documentation lives here. Two kinds:

- **Methodology (permanent):** [`handoff-pattern.md`](handoff-pattern.md) — §0 selects Claude-led or Codex-led sessions and defines shared ownership, kickoff, and wrapup; §§1–13 retain the Claude-led handoff ladder. Read it before session coordination or any cross-model handoff. Codex entry point: [`AGENTS.md`](../AGENTS.md).
- **Planning docs and draft specs (per-project):** the detailed design for an in-flight workstream, draft specifications, and design records — where the "how" for a planned piece of work lives, before and during implementation.

When a planning doc or spec is superseded or shipped, move it to [`archive/`](archive/) rather than deleting it. The history is useful, and a stale doc at the root is more confusing than an archived one. `/wrapup`'s doc-hygiene check surfaces docs that look superseded but haven't been moved.

Active planning docs:
- [`probe-p-timing2-policy.md`](probe-p-timing2-policy.md) — Probe P timing-2 gate policy, **v2.1 ADOPTED** (gate unchanged; observability first: C1 + C2 merged; one pre-registered campaign executed 2026-09-10 — V = 9, inconclusive, **P-1 accepted**; nothing adopted, deferral and historical reds unchanged).
- [`probe-p-c2-packet.md`](probe-p-c2-packet.md) — the C2 implementation contract (rev 3.1) with the accepted deviations D-1..D-4; **shipped** (`16d455a`, merged `92d2bbe`).
- [`m7-final-acceptance-handoff.md`](m7-final-acceptance-handoff.md) — **execution-ready handoff (2026-09-10)** for the fresh session finishing M7 acceptance: candidate `9a826e5`, the user's five decisions (Probe P red preserved; 240 s per-export deadline; D-6 pin accepted; mutant table; final gates), evidence paths, boundaries. **Executed 2026-09-10; candidate `b7889d3` merged `4e86933`.**
- [`m7-implementation-packet.md`](m7-implementation-packet.md) — the M7 implementation contract, **v4 accepted 2026-09-10** (two paper rounds; §11 user decisions D-2..D-6/O-3/O-M7-1; §12 dispositions); **merged `4e86933` 2026-09-10**; implemented on `codex/m7-fixtures`, candidate `9a826e5` awaiting final acceptance.
- [`probe-p-timing2-inventory-pin-packet.md`](probe-p-timing2-inventory-pin-packet.md) — the execution-side timing-2 inventory pin, **v4 accepted and shipped** (merged `c49e9ad`; rule `timing-2-inventory`; four recorded residuals).
- [`m7-slice-spec.md`](m7-slice-spec.md) — M7 hostile fixtures #3–#4 slice spec, **rev 4 LOCKED** (amend-and-relock 2026-09-10 on D-2/D-3/D-6/O-3; round-2 corrections); implementation and live spend not authorized. **Implemented and merged 2026-09-10.**
- [`m7-review-findings.md`](m7-review-findings.md) — append-only M7 register: the four Sol entry-input packets (A eval budget, B entry tests, C1 probe observability, D grammar gate), their owner verification, the policy-note paper reviews, and the integration gate/review evidence.
- [`m6-implementation-plan.md`](m6-implementation-plan.md) — evaluation-first M6 plan and sequential S1–S6 handoffs; three Opus5 paper rounds complete (final PASS), ten original scoped amendments plus approved AM11, S1 provenance/profile contracts complete at implementation round3 cap with recorded test-proof limits; D-BUDGET entry resolved by user-approved AM11; S2 SDK accepted with recorded residuals; bounded helper repair verified at final round3 with all three review channels PASS; S3 module profiles/recipes and exact sizing complete after R2 with recorded P3 limits, checkpoint `db78a1c` pushed; D-CANCEL RESOLVED 2026-09-07 (`2bcfbbd`) with the mechanism in §7 and evidence in the register; S4 implemented and accepted at the round-3 cap (2026-09-07); S5 implemented and accepted at the round-3 cap with the integrator confirmation pass (2026-09-08, `1d32657`); S6 (E9/E10) accepted 2026-09-09 — clean clone ×3 on `3072e0b`, pilot `cY3Deep4` READY, N10 sequence `E9-A3-N10` QUALIFIED, E8/E9 met, E10 recorded; **M6 closed** ([assessment](project-assessment-2026-09-09.md)).
- [`m6-review-findings.md`](m6-review-findings.md) — append-only M6 paper and implementation review evidence, dispositions and entry holds; M5.2 closure/caps unchanged.
- [`m6-s4-handoff.md`](m6-s4-handoff.md) — the S4 implementation packet (quiescence + E5 qualification) as dispatched; fix-round packets and all review evidence live in the local ignored archive named in the M6 register entry.
- [`m6-s5-handoff.md`](m6-s5-handoff.md) — the S5 implementation packet (composed real-agent command path, E7/E8) — dispatched 2026-09-07 and ACCEPTED 2026-09-08 at the round-3 cap (candidate + two fix rounds + cap-round integrator fix; all reviews, packets and worker evidence in the local archive); evidence in `artifacts/review-evidence/tinyvault-m6-s5-packet-20260907/` (local, ignored).
- `project-assessment-2026-09-06.md` — whole-M5.2 milestone-close assessment at `53fd94f` / executable source `8103c47`: Acceptance A–P closed after independent Codex and separate Claude Opus5 QA/security assessments, owner evidence verification and documentation corrections. Existing residuals and M6/release boundaries remain. Canonical disposition: `m5-2-review-findings.md` C-M1.
- `m5-2-slice-6-plan.md` — Slice 6 parity/claim/validity plan, revision 3 LOCKED after three paper rounds and owner absorption; jobs A–D, all three independent implementation round2 reviews, exact-clone and integrated-tree acceptance PASS (register Entries5–28). Source commit `8103c47` is pushed; whole-M5.2 assessment complete; see `project-assessment-2026-09-06.md`.
- `m5-2-slice-6-review-findings.md` — append-only Slice 6 planning/implementation evidence and dispositions.
- `m5-2-claim-evidence.md` — canonical147-row claim/selector/mutation/transport crosswalk;299 runtime selectors, accepted proof limits and integration evidence recorded through Slice6 register Entry28.
- `m5-2-slice-5-plan.md` — Slice 5 attestation implementation plan, revision 3 **LOCKED** after capped Sol/Claude paper reviews;
  v2 implementation, reviews, exact-clone and merged-tree gates PASS; merged as `02929e5`
  (final acceptance register Entry10). No Slice6 work.
- `m5-2-slice-5-review-findings.md` — append-only Slice 5 planning/implementation findings, evidence and dispositions.
- `m5-2-slice-4-plan.md` — Slice 4 revision 5, **LOCKED**, after capped final paper review and the user-approved SCHEMA amendment.
  Control operations, capabilities and capture transfer accepted and merged locally (`39169a6`); exact clone and final gates PASS (register Entry44).
- `m5-2-slice-4-review-findings.md` — append-only Slice 4 findings/dispositions and exact baseline prerequisite
  decision packet, Jobs A–D acceptance, helper integration repair, reviews and exact clone/merge verification through Entry44.
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
  never on the `make test` path. **Slices1–6 integrated (Slice6 source `8103c47`, acceptance in its register Entry28); whole-M5.2 milestone-close assessment complete; canonical disposition in the M5.2 register C-M1.**
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
  rounds under the cap. **Shipped** (`8afce07`).
- `project-assessment-2026-09-03.md` — Codex's read-only project teardown at `e69259d` (post-M5): two P0 gate defects, the
  fixture-topology conflict, stale docs, missing release engineering. Verified by Claude the same day; dispositions in
  `m5-review-findings.md` §C-P and the M5.1 slice in `PLAN.md`. Its milestone table is inaccurate for M1–M3 — read `PLAN.md` for those.
- `project-assessment-2026-09-04.md` — a read-only cross-model project assessment the user commissioned
  separately, reviewing `main` at `f161f1b`. Supersedes the current-state conclusions of the 09-03 assessment
  (its two gate defects are closed). Seven findings A1–A7; **A5** (scorecard provenance) has S1 module contracts implemented; S5 still owes
  trusted Git enumeration, composed collection/admission and command-path proof before published comparisons; **A7**'s doc half was corrected at that assessment. The rest
  were dispositioned as M6 planning inputs or existing declared residuals. Carries an
  integrator note recording what in it is superseded. **Append-only.**
- `m6-1-canary-authentication-packet.md` — **M6.1** (v4, ADOPTED at the three-round Sol paper cap, 2026-09-09): every `naive-baseline` row's manifest canary must equal the `password` in its fixture-signed loop bootstrap event, checked before the receipt and any canary search (rule R1, tests T1–T4, mutants M1–M4, `P-receipt-binding` row + SCHEMA s115/s116). Astra-implemented with one STOP → Extension 1 (retention fixture); Codex MERGEABLE, Claude QA/security no code defect; merged `7ae23be`; register entry "M6.1 receiptless-row canary authentication".
- `project-assessment-2026-09-09.md` — the **M6 milestone-close assessment** (read-only, three blind channels: Codex GPT-6 Astra,
  Claude Opus 5 QA, Claude Opus 5 security; owner-verified line by line). M6 CLOSED; one verified P1 cross-slice admission gap
  (receiptless baseline rows carry an unauthenticated canary) becomes the **M6.1 remediation slice** — **landed the same day** (`7ae23be`, integration `352e465`); residual sweep of every
  M6 residual; E1–E10 crosswalk. Register entry in `m6-review-findings.md`.
- `m6-s6-claims-amendment.md` — S6 packet (Sol draft, owner-verified) closing S5 residual (1): `P-attestation` /
  `P-same-observation` name `readVerifiedRunEvents`; applied by Astra and landed as `dfb8ddb`.
- `m6-am12-events-cap-amendment.md` — M6-AM12 (v4, **ADOPTED 2026-09-08**): raw signed-events cap 131,072 → 1,048,576, frame
  ceiling 262,144 → 2,097,152, explicit bounds for five bridge scalars, AM11 item 3 amended; three-round paper cap (Sol R1,
  Opus 5 R2, Sol R3) with dispositions and residuals. Implemented on `codex/m6-am12-caps`, ACCEPTED at the round-3 cap and merged `623a8b7` (see `m6-review-findings.md`).
- `m6-s6-oversize-diagnostic-packet.md` — S6 companion slice (v4.3): explicit `evidence-oversized` reason at trusted run
  finalization and stop-before-next-run; three-round pre-implementation paper cap, Astra implementation, three-round
  post-implementation ladder; **landed** `a666b13` with ten declared residuals.
- `m6-am13-pilot-qualification-amendment.md` — M6-AM13 (v5, **ADOPTED 2026-09-09** by the user with corrections A/B; paper cap reached 2026-09-08): pilot readiness vs. N10 outcome qualification (real-path N=10 gate, Shape A/B), the one-time pilot-progression and post-failure exceptions, and the O2′ baseline recovery instruction (`/success` path check). Implemented via `m6-am13-implementation-packet.md` and merged `fe8e9e1` (see `m6-review-findings.md`).
- `m6-am13-implementation-packet.md` — Astra implementation handoff for the adopted M6-AM13 (Shape A gate, BASELINE_SYSTEM v2, readiness-safe test conversion). Delivered, accepted at round 2, merged `fe8e9e1`.
- `m6-f1-asserted-origin-schema-packet.md` — F1 (v3): `assertedOrigin` format description in the model-facing tool schema; AM11 declaration bytes re-frozen; example must not be a fixed fixture origin. Implemented and ACCEPTED, merged `dd669ba` (see `m6-review-findings.md`).
- `m6-am12-implementation-packet.md` — Astra implementation handoff for the adopted M6-AM12 (values, five bridge scalar bounds,
  item-3 flips, certifying witness, Docker exact-cap gate, P-v2 claim-row packet, plan §4.3 text). Sequenced after the
  oversize diagnostic packet. Sol pre-implementation review done (three rounds); implemented and merged `623a8b7`.
- `archive/implementation-plan-superseded.md` — earlier orphaned Phase 0 draft, consolidated into
  `phase-0-plan.md` (provenance only)
