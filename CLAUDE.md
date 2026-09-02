# CLAUDE.md — TinyVault

## Project

TinyVault is a **harness-agnostic, model-blind credential-fill library for browser-using agents** — opaque handles in, origin-pinned keystrokes out, plaintext never enters the model's context — proven by a **hostile-web adversarial testbed that measures credential-leak rate** instead of asserting security. TypeScript. The full rationale, scope, roadmap, and requirements live in [`PROJECT-SPEC.md`](PROJECT-SPEC.md) — **read it first** (it is the canonical roadmap doc; `PLAN.md` tracks active work and points to it). Phase 0 is to review the spec and produce the detailed implementation plan before writing code.

> ⚠️ **Model & safeguards:** this is legitimate *defensive* security work, but its content (credential handling, hostile fixtures, credential-phishing tool descriptions) can trip broad safety classifiers. See `PROJECT-SPEC.md` §11 and the **Tools / cross-model** section below — Codex is the wired-in mitigation, not just a review channel.

## Core Principles

- **Verification is the #1 lever** — give every task a way to prove it worked (a test, a command, a check). Biggest single quality multiplier. See `guides/verification.md` for quality gates, task contracts, and the "operationalize every fix" pattern.
- **Evals before specs** — for a project whose whole thesis is *measure, don't assert*, define how you'll evaluate success before writing the spec. Progression: evals → spec → plan → implement → verify. The leak-rate testbed is the eval; build it *with* the core, not after.
- **Simplicity first** — prefer the boring, obvious solution. The security story is "read the code," so the code must be boring and auditable. Can this be fewer lines? Are the abstractions earning their complexity?
- **No over-engineering** — don't add features, abstractions, or error handling beyond what's asked. Don't touch code you weren't asked to touch.
- **Naive-then-optimize** — implement the obviously-correct version first, verify correctness, then optimize. Never skip step 1.
- **Enforce invariants in code, not docs** — the trust boundary (plaintext never model-visible, origin pinning, post-fill lockdown, redaction-proven-by-grep) is the product. A documented invariant that isn't enforced and tested is a bug.
- **Compaction-safe artifacts** — write important outputs (interface specs, decisions, scorecards) to files immediately. Don't rely on conversation history surviving.
- **Silent-wrong is an observability gap** — a leak checker that runs green but doesn't actually detect a leak is two bugs. For each component ask "what's the absence-detection signal?"

## Workflow

- **Assess before each task** — handle directly, delegate to a subagent, or hand off to Codex. Delegate when the task benefits from fresh context, can run in parallel, or when context is getting tight. Simple sequential work with spacious context → do it directly.
- **When delegating to a subagent, default to a strong reasoning model.** Hold the plan yourself; delegate precise task specs; receive reports back. Workers get fresh context windows. See `guides/delegation-templates.md`.
- **Always delegate research and reviews** — they benefit from isolation regardless of context pressure (see `/review`).
- **For cross-model work — adversarial review and scoped implementation slices — hand off to Codex.** See [`docs/handoff-pattern.md`](docs/handoff-pattern.md).
- **For high-risk-surface work — run the full ladder.** On this project the high-risk surface is the security core itself: the fill service, origin validation, redaction, post-fill lockdown, and the credential-backend adapters. Default those to the full plan → implement → review ladder in [`docs/handoff-pattern.md`](docs/handoff-pattern.md) §4, and route them through the **security-specialized third channel** (§7.1). Claude implementing the invariant-enforcing code in parallel collapses the cross-model coverage the ladder exists to provide.
- Enter plan mode for any non-trivial task (3+ steps or an architectural decision).
- Use `/start` at session start, `/wrapup` at session end, `/review` after completing a milestone.
- Build a skill / command for any workflow you repeat 3+ times.

## Session Management

- `/clear` between unrelated tasks; `/compact` to keep focus while clearing noise.
- **Two-correction rule**: if wrong twice on the same thing, `/clear` and write a sharper prompt.
- Feed raw data (logs, errors, leak-checker output) instead of your interpretation of them.
- Use neutral prompts — "read this code, follow the logic, report findings" beats "find the bug."

## CLAUDE.md Maintenance

- After correcting a mistake: "Update CLAUDE.md so you don't make this mistake again."
- Keep this file short — every line should answer "what mistake would Claude make without this?"
- Periodically consolidate rules — if performance deteriorates, contradictions or bloat are the likely cause.

## Tools / cross-model (Codex ladder)

- **Codex plugin** — a fresh-context, different-model-family channel for (1) adversarial plan review pre-impl, (2) scoped implementation slices on a `codex/<task>` branch, (3) post-impl adversarial review, (4) rescue / deeper investigation when stuck. Claude dispatches Codex directly via bash; don't wait for the user to type a slash command. Canonical workflow + handoff packet templates: [`docs/handoff-pattern.md`](docs/handoff-pattern.md). Run it after `/review` for the security core — cross-model catches blind spots same-model review shares.
- **Codex cannot commit and usually cannot run tests in its sandbox** (`.git` and `mkdtemp` are EPERM there). Tell it to leave work uncommitted; you commit with explicit paths and run `make test` yourself — never take its test counts or a `failed` status at face value. Pin `base` *and* `head` for branch-scoped reviews and hold commits while one runs. "Deviations From Handoff" is mandatory in its report; a code comment is not a deviation record.
- **Codex is also the safeguards mitigation (project-specific).** When Claude (as orchestrator) is safety-classifier-flagged on this project's unavoidable content — authoring hostile fixtures, credential-phishing tool descriptions, prompt-injection payloads for the testbed — that slice is a **first-class Codex-dispatch trigger** (Codex 5.6 Sol carries it). This is defensive work; the mitigation is accurate framing + model choice, never obfuscating what the code does. See `PROJECT-SPEC.md` §11.

## Situational Guides

Read the matching guide before proceeding:

- Planning a non-trivial feature → `guides/planning.md`
- Delegating to subagents → `guides/delegation-templates.md`
- Verifying work / writing quality gates → `guides/verification.md`
- Choosing tools or plugins to install → `guides/tools-catalog.md`
- Sessions feel slow / high token usage → `guides/context-efficiency.md`
- Building or improving skills → `guides/skills-guide.md`
- Shipping / releasing → `guides/release.md`

## Challenge Prompts

Use after a first pass to push for better output:

- "Scrap it and build the elegant version" — after a mediocre fix.
- "Grill me on these changes. Don't merge until I pass your test" — role-reversal review.
- "Prove to me this works. Show me the difference in behavior between main and my branch" — e.g. show the leak counter on the naive baseline vs the vaulted path.

## Project State Files

Each fact has ONE home. Keep these from drifting:

- **[`PROJECT-SPEC.md`](PROJECT-SPEC.md)** — the canonical roadmap: goals, rationale, architecture sketch, requirements (§6), locked sequence (§7), safeguards note (§11). `PLAN.md` points to it rather than re-listing it.
- **`PLAN.md`** — active work: current-milestone tasks, verification, session-by-session narrative, and the cumulative **Decisions Log** ("X over Y because Z" — never archived). Read at session start, update at session end.
- **`PLAN-archive.md`** — full detail of completed / no-longer-load-bearing work. Reviewed every `/wrapup`.
- **`docs/`** — the permanent methodology doc (`handoff-pattern.md`) plus planning docs and draft specs. Superseded docs move to `docs/archive/`.
- **`SCHEMA.md`** *(optional)* — the canonical contract doc (e.g. the three-tool interface + the leak-scorecard schema), if you keep one. Update it in the same commit as any contract change.
- **`.claude/memory/`** — topic-based memory indexed by `MEMORY.md`: standing decisions (`decisions_product.md`), `gotchas`, `conventions`, a one-line-per-session index (`sessions-archive.md`). Portable.
- **`BACKLOG.md`** — idea funnel; unprioritized. Items graduate into `PLAN.md`.

`/start` reads these (read-only) to orient and propose; `/wrapup` updates them.

## Key Documents

| Document | When to read |
|----------|--------------|
| [`PROJECT-SPEC.md`](PROJECT-SPEC.md) | First — the whole project; do Phase 0 against it |
| [`docs/handoff-pattern.md`](docs/handoff-pattern.md) | Before any Codex handoff — dispatch, role split, the ladder, security third channel, templates |
| `PLAN.md` | Session start — current state and decisions log |
| `.claude/memory/MEMORY.md` | Index of standing decisions, gotchas, conventions |
| [`docs/README.md`](docs/README.md) | To find a planning doc or draft spec |
