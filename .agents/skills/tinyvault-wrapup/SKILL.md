---
name: tinyvault-wrapup
description: Close or checkpoint a TinyVault session, preserving outcomes, verification, blockers, and next steps. Use when asked to wrap up or persist the session; delegated workers return a handoff instead of changing shared state.
---

# TinyVault session wrapup

This is a repository skill. Locate the TinyVault checkout containing this skill; do not apply it to
another project or rely on a fixed machine path.

Read the root [AGENTS.md](../../../AGENTS.md), then follow
[the canonical session protocol](../../../build-log/docs/handoff-pattern.md#0-session-entry-and-ownership),
especially **One writer and handover** and **Codex wrapup**. Those sections own the procedure.

Re-check ownership before writing. A delegated worker or former owner returns its report and proposed
state updates; it does not overwrite the current owner's documents. The current owner persists outcomes
in the existing shared files, distinguishes verified from blocked/unrun work, and records pending jobs
and closed/paused status. Do not manufacture a productive session or edit state after read-only orientation
alone. Summarize the outcome and next action; do not commit, push, or merge without authorization.
