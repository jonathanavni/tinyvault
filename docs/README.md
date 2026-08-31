# docs

Project documentation lives here. Two kinds:

- **Methodology (permanent):** [`handoff-pattern.md`](handoff-pattern.md) — how the orchestrator hands work off to the adversary. Read it before any Codex handoff.
- **Planning docs and draft specs (per-project):** the detailed design for an in-flight workstream, draft specifications, and design records — where the "how" for a planned piece of work lives, before and during implementation.

When a planning doc or spec is superseded or shipped, move it to [`archive/`](archive/) rather than deleting it. The history is useful, and a stale doc at the root is more confusing than an archived one. `/wrapup`'s doc-hygiene check surfaces docs that look superseded but haven't been moved.

Active planning docs:
- `phase-0-plan.md` — the canonical Phase 0 implementation plan (resolves spec §10; round-1 Codex review absorbed, round 2 pending)
- `audit-opus5-m0-m1.md` — independent Opus 5 blind audit of M0+M1 (findings + verification; drives the M1-hardening slice)
- `archive/implementation-plan-superseded.md` — earlier orphaned Phase 0 draft, consolidated into `phase-0-plan.md` (provenance only)
