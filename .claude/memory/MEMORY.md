# Memory Index

<!-- Topic-based memory files. Starter types: product decisions, gotchas, conventions.
     Detailed dated "X over Y because Z" decisions belong in PLAN.md's Decisions Log;
     this folder holds the durable, standing facts an agent needs mid-task.
     Add new topic files as domains emerge (e.g. gotchas_<area>.md). Prune when stale.
     The whole folder is portable — copy it to onboard another agent with full context. -->

- [Product & Architecture Decisions](decisions_product.md) — standing product/architecture decisions and their current rationale
- [Gotchas — index](gotchas.md) — four topic files, consolidated 2026-09-09; the repeat offenders in one paragraph
  - [Codex and review channels](gotchas_codex.md) — pinned dispatch invocation, model routing, sandbox limits (no listen/browser), job monitoring (`status --all --json` → `running`), classifier, review helper, LP1 ladder lessons (contract implementability pass, owner host rerun as the gate, spec reporter, literal launch commands)
  - [Verification, gates and mutants](gotchas_verif.md) — blind-spot lessons, owner-gate and commit-chain discipline, mutant hygiene, exact-SHA evidence carry, timeout-kill precision, measurement claims
  - [Chromium / Docker / Node runtime](gotchas_runtime.md) — Playwright/CDP quirks, Docker Desktop on macOS, Node resolution and encoding, renderer-promise finalization witness
  - [Shell, git and authoring](gotchas_shell.md) — zsh traps, git in shared checkouts, control characters in authored docs
- [Conventions](conventions.md) — naming, structure, and workflow conventions established for this project
- [Sessions Archive](sessions-archive.md) — one-line-per-session history index (not day-to-day memory)
