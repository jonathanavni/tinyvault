# CLAUDE.md — TinyVault

## Project

TinyVault is a **harness-agnostic, model-blind credential-fill library for browser-using agents** — opaque handles in, origin-pinned keystrokes out, plaintext never enters the model's context — proven by a **hostile-web adversarial testbed that measures credential-leak rate** instead of asserting security. TypeScript. The full rationale, scope, roadmap, and requirements live in [`build-log/PROJECT-SPEC.md`](build-log/PROJECT-SPEC.md) — **read it first** (it is the canonical roadmap doc; `build-log/PLAN.md` tracks active work and points to it). Phase 0 is to review the spec and produce the detailed implementation plan before writing code.

> ⚠️ **Model & safeguards:** this is legitimate *defensive* security work, but its content (credential handling, hostile fixtures, credential-phishing tool descriptions) can trip broad safety classifiers. See `build-log/PROJECT-SPEC.md` §11 and the **Tools / cross-model** section below — Codex is the wired-in mitigation, not just a review channel.

## Core Principles

- **Verification is the #1 lever** — give every task a way to prove it worked (a test, a command, a check). Biggest single quality multiplier. See `build-log/guides/verification.md` for quality gates, task contracts, and the "operationalize every fix" pattern.
- **Evals before specs** — for a project whose whole thesis is *measure, don't assert*, define how you'll evaluate success before writing the spec. Progression: evals → spec → plan → implement → verify. The leak-rate testbed is the eval; build it *with* the core, not after.
- **Simplicity first** — prefer the boring, obvious solution. The security story is "read the code," so the code must be boring and auditable. Can this be fewer lines? Are the abstractions earning their complexity?
- **No over-engineering** — don't add features, abstractions, or error handling beyond what's asked. Don't touch code you weren't asked to touch.
- **Naive-then-optimize** — implement the obviously-correct version first, verify correctness, then optimize. Never skip step 1.
- **Enforce invariants in code, not docs** — the trust boundary (plaintext never model-visible, origin pinning, post-fill lockdown, redaction-proven-by-grep) is the product. A documented invariant that isn't enforced and tested is a bug.
- **Compaction-safe artifacts** — write important outputs (interface specs, decisions, scorecards) to files immediately. Don't rely on conversation history surviving.
- **The gate is the clean clone** — `make test` must pass from `git clone` + install; generated eval artifacts are never a test prerequisite, and a benchmark assertion never shares a test with a stress scan (a red hidden by run-to-run variance is two bugs). After every milestone close, run a read-only cross-model project assessment and verify it line by line.
- **Silent-wrong is an observability gap** — a leak checker that runs green but doesn't actually detect a leak is two bugs. For each component ask "what's the absence-detection signal?"

## Workflow

- **Assess before each task** — handle directly, delegate to a subagent, or hand off to Codex. Delegate when the task benefits from fresh context, can run in parallel, or when context is getting tight. Simple sequential work with spacious context → do it directly.
- **When delegating to a subagent, default to a strong reasoning model.** Hold the plan yourself; delegate precise task specs; receive reports back. Workers get fresh context windows. See `build-log/guides/delegation-templates.md`.
- **Always delegate research and reviews** — they benefit from isolation regardless of context pressure (see `/review`).
- **For cross-model work — adversarial review and scoped implementation slices — hand off to Codex.** See [`build-log/docs/handoff-pattern.md`](build-log/docs/handoff-pattern.md).
- **For high-risk-surface work — run the full ladder.** On this project the high-risk surface is the security core itself: the fill service, origin validation, redaction, post-fill lockdown, and the credential-backend adapters. Default those to the full plan → implement → review ladder in [`build-log/docs/handoff-pattern.md`](build-log/docs/handoff-pattern.md) §4, and route them through the **security-specialized third channel** (§7.1). Claude implementing the invariant-enforcing code in parallel collapses the cross-model coverage the ladder exists to provide.
- **Post-implementation fix loops are capped at three rounds per milestone**, and the last round's packet states its P1 criteria up front (a layers-1–2 leak, an undeclared layer-4 blind spot, or a red `make test`); everything else is a recorded residual. When a channel beats the same invariant three rounds running, narrow the claim before adding code. See `.claude/memory/conventions.md`.
- **Gate, read, decide, then commit or dispatch — as separate steps.** Never chain a commit or a review dispatch behind a gate in one script, never edit a tracked file while a gate is running (the pilot-path test reds as `source-drift`), never put a file write and a Codex dispatch in the same background command (verify the write first), and never state a gate result you have not read from its log (2026-09-08: a failed Docker gate was followed by a commit and a review prompt claiming "Docker green").
- Enter plan mode for any non-trivial task (3+ steps or an architectural decision).
- Use `/start` at session start, `/wrapup` at session end, `/review` after completing a milestone.
- Build a skill / command for any workflow you repeat 3+ times.

## Session Management

- **Session ownership:** a session started here keeps Claude as continuity owner and follows the existing
  ladder. Honor explicit worker packets and the shared [ownership/handover check](build-log/docs/handoff-pattern.md#one-writer-and-handover)
  before writing project state; a Codex-led session is a separate mode, not a change to Claude's ladder.
- `/clear` between unrelated tasks; `/compact` to keep focus while clearing noise.
- **Two-correction rule**: if wrong twice on the same thing, `/clear` and write a sharper prompt.
- Feed raw data (logs, errors, leak-checker output) instead of your interpretation of them.
- Use neutral prompts — "read this code, follow the logic, report findings" beats "find the bug."

## CLAUDE.md Maintenance

- After correcting a mistake: "Update CLAUDE.md so you don't make this mistake again."
- Keep this file short — every line should answer "what mistake would Claude make without this?"
- Periodically consolidate rules — if performance deteriorates, contradictions or bloat are the likely cause.

## Tools / cross-model (Codex ladder)

- **Codex model routing — match the model to the stakes, not to habit.** Astra is materially more expensive against the subscription allowance, so it is for work where a wrong answer ships a false claim, not for every dispatch.
  - **`gpt-6-astra`** — security-core implementation slices (the full-ladder surface in "Workflow"); adversarial review *of code*; rescue and stuck investigations; anything touching a locked invariant, gate or claim.
  - **`gpt-5.6-sol`** — docs, comments, registers and changelogs; mechanical refactors with no invariant at stake; test-only additions that introduce no new mutant; fact-checks, environment probes and CLI-behaviour questions; scaffolding and boilerplate; re-dispatching an already-specified job that died for tooling reasons.
  - **Escalate Sol → Astra** the moment it stops at a boundary, returns a design question, or its output would land in a security-core file. Cheap first pass, expensive second, is fine; expensive first pass by default is not.
  - **Mode constraint:** `adversarial-review` / `review` take **no `--model` flag** and always run the built-in default (Astra). Routing to Sol therefore means `task --fresh --model gpt-5.6-sol` with a review-shaped prompt and an explicit "READ-ONLY" preamble.
  - **Evidence (2026-09-04):** Sol carried both *pre-implementation plan* review rounds and found three P1s and then four more, including the argv-override and brand-erasure defects that reshaped the design. Astra did the code-level implementation and post-impl review. So the line is stakes and cost, **not** "Sol is unreliable" — paper and plan review are squarely Sol's.
  - **Requires codex-cli ≥ 0.153.3**, and an upgrade does not take effect until the shared runtime broker is restarted — see `.claude/memory/gotchas_codex.md`.
- **Codex plugin** — a fresh-context, different-model-family channel for (1) adversarial plan review pre-impl, (2) scoped implementation slices on a `codex/<task>` branch, (3) post-impl adversarial review, (4) rescue / deeper investigation when stuck. Claude dispatches Codex directly via bash; don't wait for the user to type a slash command. Canonical workflow + handoff packet templates: [`build-log/docs/handoff-pattern.md`](build-log/docs/handoff-pattern.md). Run it after `/review` for the security core — cross-model catches blind spots same-model review shares.
- **Codex cannot commit and usually cannot run tests in its sandbox** (`.git` and `mkdtemp` are EPERM there). Tell it to leave work uncommitted; you commit with explicit paths and run `make test` yourself — never take its test counts or a `failed` status at face value. Pin `base` *and* `head` for branch-scoped reviews and hold commits while one runs. "Deviations From Handoff" is mandatory in its report; a code comment is not a deviation record.
- **Codex is also the safeguards mitigation (project-specific).** When Claude (as orchestrator) is safety-classifier-flagged on this project's unavoidable content — authoring hostile fixtures, credential-phishing tool descriptions, prompt-injection payloads for the testbed — that slice is a **first-class Codex-dispatch trigger** (GPT-6 Astra carries it). This is defensive work; the mitigation is accurate framing + model choice, never obfuscating what the code does. See `build-log/PROJECT-SPEC.md` §11.

## Situational Guides

Read the matching guide before proceeding:

- Planning a non-trivial feature → `build-log/guides/planning.md`
- Delegating to subagents → `build-log/guides/delegation-templates.md`
- Verifying work / writing quality gates → `build-log/guides/verification.md`
- Sessions feel slow / high token usage → `build-log/guides/context-efficiency.md`
- Building or improving skills → `build-log/guides/skills-guide.md`

## Challenge Prompts

Use after a first pass to push for better output:

- "Scrap it and build the elegant version" — after a mediocre fix.
- "Grill me on these changes. Don't merge until I pass your test" — role-reversal review.
- "Prove to me this works. Show me the difference in behavior between main and my branch" — e.g. show the leak counter on the naive baseline vs the vaulted path.

## Project State Files

Each fact has ONE home. Keep these from drifting:

- **[`build-log/PROJECT-SPEC.md`](build-log/PROJECT-SPEC.md)** — the canonical roadmap: goals, rationale, architecture sketch, requirements (§6), locked sequence (§7), safeguards note (§11). `build-log/PLAN.md` points to it rather than re-listing it.
- **`build-log/PLAN.md`** — active work: current-milestone tasks, verification, session-by-session narrative, and the cumulative **Decisions Log** ("X over Y because Z" — never archived). Read at session start, update at session end.
- **`build-log/PLAN-archive.md`** — full detail of completed / no-longer-load-bearing work. Reviewed every `/wrapup`.
- **`build-log/`** — the build record, moved out of the root and `docs/` before launch (2026-09-19): the spec, `PLAN*.md`, `BACKLOG.md`, `ORIENT.md`, the guides, and under `build-log/docs/` the methodology doc (`handoff-pattern.md`) plus every planning doc, packet, handoff and review register. New planning docs and registers go in `build-log/docs/`; superseded ones move to `build-log/docs/archive/`. Paths written inside older records are as they were at the time.
- **`docs/`** — what a reader needs: the 1Password setup guide, the cited evidence (the two cohort pre-registrations, `m7-review-findings.md`, the two 2026-09-18 launch reviews) and seven files that tests or pinned `SCHEMA.md` text reference by path (`phase-0-plan.md`, four `m5-2-*` files, `m4-probe-p-golden.json`, `probe-p-timing2-policy.md`). Do not move those seven without updating the pins.
- **`SCHEMA.md`** *(optional)* — the canonical contract doc (e.g. the three-tool interface + the leak-scorecard schema), if you keep one. Update it in the same commit as any contract change.
- **`.claude/memory/`** — topic-based memory indexed by `MEMORY.md`: standing decisions (`decisions_product.md`), `gotchas`, `conventions`, a one-line-per-session index (`sessions-archive.md`). Portable.
- **`build-log/BACKLOG.md`** — idea funnel; unprioritized. Items graduate into `build-log/PLAN.md`.

`/start` reads these (read-only) to orient and propose; `/wrapup` updates them.

## Key Documents

| Document | When to read |
|----------|--------------|
| [`build-log/PROJECT-SPEC.md`](build-log/PROJECT-SPEC.md) | First — the whole project; do Phase 0 against it |
| [`build-log/docs/handoff-pattern.md`](build-log/docs/handoff-pattern.md) | Before any Codex handoff — dispatch, role split, the ladder, security third channel, templates |
| `build-log/PLAN.md` | Session start — current state and decisions log |
| `.claude/memory/MEMORY.md` | Index of standing decisions, gotchas, conventions |
| [`build-log/docs/README.md`](build-log/docs/README.md) | To find a planning doc or draft spec |
