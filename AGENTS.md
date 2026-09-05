# TinyVault — Codex entry point

TinyVault is a model-blind credential-fill library with a hostile-web testbed that measures
credential leakage. This file supplies baseline context for Codex tasks; the existing
Claude-led workflow remains in force.

**Role and scope**

Claude Code owns continuity, planning synthesis, milestone sequencing, integration, and project
state. Codex implements or reviews the delegated scope. Follow the user's instructions and the
explicit handoff; this file does not authorize broader work. Claude-specific session commands
and dispatch duties in `CLAUDE.md` remain Claude's responsibilities.

**Load context before working**

1. Read [CLAUDE.md](CLAUDE.md), [PLAN.md](PLAN.md)'s **Current State**, and the handoff packet.
2. Read the relevant parts of [docs/handoff-pattern.md](docs/handoff-pattern.md), the governing
   slice spec, current findings/dispositions, and the source and tests in scope.
3. Consult the document map below and relevant project-memory topics as needed. Do not bulk-load
   the decisions history or all of `.claude/memory/` for every task.
4. Check the working directory, branch, HEAD, and `git status`. Honor the packet's base/head and
   worktree. Preserve unrelated changes. After compaction, reload Current State and the active
   contract before continuing; a resumed conversation is not evidence of current repository state.

**Document map**

| Source | Authority / purpose |
|---|---|
| [PROJECT-SPEC.md](PROJECT-SPEC.md) | Product goals, scope, launch requirements, and roadmap |
| [docs/phase-0-plan.md](docs/phase-0-plan.md) | Detailed implementation contracts, milestone gates, and audit schedule |
| [SCHEMA.md](SCHEMA.md) | API/evidence contracts and declared measurement limits; read for contract changes |
| [PLAN.md](PLAN.md) | Active execution state and dated decisions; Current State is the starting point |
| [docs/README.md](docs/README.md) | Index of slice specs and append-only review registers |
| [docs/handoff-pattern.md](docs/handoff-pattern.md) | Codex ladder, ownership, review discipline, and report formats |
| [.claude/memory/MEMORY.md](.claude/memory/MEMORY.md) | Index of standing conventions, decisions, and environment gotchas |
| [BACKLOG.md](BACKLOG.md) | Deferred ideas and residual work; presence here is not implementation authorization |

**Execution discipline**

- Keep to the packet's behavior, file ownership, non-goals, and no-touch boundaries. Reviews are
  read-only unless edits are explicitly requested. Do not turn an implementation task into another
  plan review, or a review into an unsolicited repair.
- Leave changes uncommitted unless explicitly authorized otherwise. Do not switch branches,
  create worktrees, push, or merge contrary to the packet's instructions.
- Leave `PLAN.md`, `.claude/memory/*`, roadmap documents, and shared registers to Claude unless
  the task explicitly authorizes those edits. Return proposed dispositions in the report.
- Preserve locked requirements and thresholds. A slice document or passing test is not permission
  to silently override the project spec. Surface unresolved contract conflicts before making the
  dependent change. Distinguish new defects from already-accepted residuals.
- Keep real credentials out of the repository and evidence. Preserve the model/trusted-code
  boundary and the documented limits of the security claim.

**Verification and reporting**

- Run the packet's required checks in its specified order. Standard entry points are
  `npm run typecheck`, `make test`, and `make eval`; [package.json](package.json) and
  [Makefile](Makefile) define their current behavior. Use checks appropriate to the change.
- For security and gate changes, follow the required rejection-path, mutation, and production-path
  proofs. Do not substitute a helper test for the caller or CLI path it is meant to protect.
- Keep browser timing suites serial across the machine. Treat historical sandbox failures as
  environment-specific observations: attempt permitted checks and report actual results. Never
  label an unrun or blocked browser, socket, or Docker check as passing, or weaken a gate to make
  it run. Integrator and merged-tree acceptance remain part of the existing ladder.
- Use [docs/handoff-pattern.md §13](docs/handoff-pattern.md#13-reporting-formats): report exact
  changes, commands/results, `Not run: <reason>`, risks, and **Deviations From Handoff**. Reviews
  include severity and precise `file:line` evidence. State what the evidence proves and its limits.
