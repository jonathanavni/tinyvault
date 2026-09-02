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
  outcomes stay where triage put them (A2 accepted but not yet written into the spec; A4 at M10, B1 at
  M2/M3, C1 at M7+, D1 at roadmap step 5).
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
- `archive/implementation-plan-superseded.md` — earlier orphaned Phase 0 draft, consolidated into
  `phase-0-plan.md` (provenance only)
