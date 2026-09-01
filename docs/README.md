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
  **Triaged 2026-08-31** — all 8 outcomes in the `PLAN.md` Decisions Log. Open caveat: its external
  claims are unverified and must be fact-checked before they reach `PROJECT-SPEC.md` or the README.
- `audit-opus5-m0-m1.md` — independent Opus 5 blind audit of M0+M1. **Resolved** (`07996a2`);
  deferred items live in the M4/M5 gate lists.
- `m2-slice-spec.md` — the M2 implementation contract (revision 4). **Shipped** (`6a6b67c`); carries
  Appendix A (normative origin table) and Appendix B (transform corpus), both still load-bearing for M4.
- `m2-fix-slice-spec.md` — the M2 repair contract written against the three-channel findings register.
  **Shipped** (`6a6b67c`).
- `m2-review-findings.md` — the authoritative M2 review register: three paper rounds, five code rounds,
  and the appended closure sections. **Append-only** — historical sections are never rewritten.
- `archive/implementation-plan-superseded.md` — earlier orphaned Phase 0 draft, consolidated into
  `phase-0-plan.md` (provenance only)
