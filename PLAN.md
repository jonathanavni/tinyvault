# PLAN

The active-work document. `/start` reads it; `/wrapup` updates it. Two parts:

1. **Current State** — the lean, session-by-session narrative of what's in flight. Stale detail gets archived to `PLAN-archive.md` every `/wrapup`.
2. **Decisions Log** — the cumulative "X over Y because Z" record. Never archived.

> The canonical roadmap (goals, scope, requirements, locked sequence) lives in [`PROJECT-SPEC.md`](PROJECT-SPEC.md). This file tracks *execution*; it points to the spec rather than restating it.

---

## Current State

`2026-08-31-kickoff` — focus: stand up the project + finalize the implementation plan.

**Milestone:** Phase 0 — review `PROJECT-SPEC.md`, resolve its open questions (§10), produce the detailed implementation plan.

**In progress:**
- Personal coding harness (tinytandem tandem workflow) seeded into the repo — this pass.

**Blocked / needs attention:**
- Phase 0 open questions in `PROJECT-SPEC.md` §10 (agent-loop substrate, first backend, redaction-enforcement mechanism, testbed scorecard schema, MCP adapter shape, repo layout). Resolve before implementation.

**Next session:**
- Run `/start`, read `PROJECT-SPEC.md`, do Phase 0: draft the implementation plan (repo layout, milestones, the three-tool signatures), then the first-week milestones (spec §9): scaffold + threat-model README, `fill_from_vault` end-to-end against a local login page, first two hostile fixtures, naive-baseline leak recorded.

---

## Decisions Log

> Append-only. Each entry: the decision, the alternative rejected, and why. Cross-model review findings that were absorbed, declined, or punted get recorded here too (see `docs/handoff-pattern.md` §6).

- **2026-08-31** — Reuse the **tinytandem** two-model (Claude orchestrator + Codex adversary) harness over a fresh setup, because it's the workflow that shipped KuchiClaw (its `handoff-pattern.md` is used verbatim there) and its Codex channel doubles as the mitigation for this project's safety-classifier flagging (spec §11).
- **2026-08-31** — Seed the scaffold from tinytandem's spine + the fresher `coding-starter-kit` guides + the vault playbook's recent practices, writing only into this repo; tinytandem and the starter-kit are left untouched (read-only sources).
- **2026-08-31** — **TypeScript** (per `PROJECT-SPEC.md`), because the intended adapters (MCP, eve, dsh) and Playwright/CDP are all TS-native.
