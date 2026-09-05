# TinyVault — Codex entry point

TinyVault is a model-blind credential-fill library with a hostile-web testbed that measures
credential leakage. The agent in which the user starts the session leads it; delegated agents
remain workers. The shared protocol is [docs/handoff-pattern.md §0](docs/handoff-pattern.md#0-session-entry-and-ownership).

**Role and scope**

- **Direct Codex session:** Codex owns planning synthesis, coordination, verification, integration
  within the user's authorization, and project-state updates for the agreed scope. With GPT-6
  Astra selected, Astra drives this work. Follow §0's Codex-led ladder; keep Claude as an independent
  review channel for high-risk work. This file cannot change the selected model.
- **Delegated implementation/review:** an explicit handoff or worker assignment takes precedence
  over the host/model. Implement or review only that scope; the named orchestrator retains continuity.
  A Claude-to-Codex dispatch follows the existing Claude-led ladder unchanged.
- **Resumed session:** retain the assigned role; compaction or opening another app does not transfer
  ownership. Check the shared ownership checkpoint before writing. Do not take over an active session
  merely because the user opened Codex.

**Session commands**

- When the user sends `/start` as a message, or asks to start/orient a TinyVault session, follow
  [§0's kickoff](docs/handoff-pattern.md#codex-kickoff): read-only status and proposals, then await
  direction unless the user already supplied a concrete task. The native skill is
  [tinyvault-start](.agents/skills/tinyvault-start/SKILL.md).
- `/wrapup` or a request to close/persist the session follows
  [§0's wrapup](docs/handoff-pattern.md#codex-wrapup), also available as
  [tinyvault-wrapup](.agents/skills/tinyvault-wrapup/SKILL.md).
- These message aliases do not register built-in slash commands. If the client intercepts them,
  select the named skill or say “start the TinyVault session” / “wrap up this TinyVault session.”
  A worker invoking either procedure remains a worker and returns a handoff, not a project-state edit.
- For an Astra-led session's independent Claude plan/QA/security gate, use
  [tinyvault-claude-review](.agents/skills/tinyvault-claude-review/SKILL.md). It dispatches a fresh
  read-only **Opus 5** reviewer through the local CLI and returns evidence to the Codex owner.

**Load context before working**

1. Read [CLAUDE.md](CLAUDE.md), [PLAN.md](PLAN.md)'s **Current State**, and any handoff packet.
   Apply §0's role mapping to Claude-specific orchestration rules in a direct Codex session;
   product principles, locked contracts, and mandatory gates still apply.
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
- **Workers:** leave `PLAN.md`, `.claude/memory/*`, roadmap documents, and shared registers to the
  continuity owner unless the packet explicitly authorizes those edits. Return proposed dispositions.
- **Codex continuity owner:** maintain those existing shared documents for the agreed work under §0.
  Keep registers append-only and each fact in its canonical home; do not create a parallel Codex plan
  or memory tree. Ownership does not authorize changing locked scope, gates, or the release decision.
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
