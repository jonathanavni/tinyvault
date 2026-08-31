# Skills Reference

The recommended workflow for a coding session. Start with the foundation loop; add situational skills as needed.

## Foundation Workflow

```
/start → /plan → /implement → /review → /wrapup
```

| Step | Skill | What It Does |
|------|-------|-------------|
| 1 | `/start` | Session kickoff — load PLAN.md, review current state, micro-plan the session |
| 2 | `/plan <description>` | Structured planning — objectives, success criteria, sub-tasks. No implementation until approved |
| 3 | `/implement <plan>` | Execute a pre-defined plan. Follows the plan as written, delegates to subagents for parallel work |
| 4 | `/review` | QA from fresh context — finds issues but doesn't fix them. Categorizes: BLOCKER / CONCERN / NIT |
| 5 | `/wrapup` | Session close — update MEMORY.md, record decisions, summarize what was done and what's next |

## Situational Skills (use when needed)

| Skill | When | What It Does |
|-------|------|-------------|
| `/research <topic>` | Need to investigate before deciding | Read-only exploration. Returns findings with evidence, interpretation labeled separately. No file changes |
| `/review-plan` | Before implementing anything non-trivial | Stress-tests a plan with expert critique. Red/Yellow/Green findings. Catches scope issues before you build |
| `/dialectic <focus>` | Important decision, choosing between approaches | Spawns opposing agents (FOR vs AGAINST) with a referee. 4 modes: `review`, `--ideate`, `--tradeoff`, `--premortem` |
| `/ship` | Ready to merge and deploy | Syncs main, runs tests, audits coverage, opens PR. Bootstraps test frameworks if missing |
| `/retro` | End of sprint or project phase | Structured retrospective — what worked, what didn't, patterns, actionable improvements |
| `/prune` | CLAUDE.md or MEMORY.md growing large | Audits always-loaded files for context bloat. Removes contradictions, consolidates, trims |

## When to Build New Skills

Build a skill when:
- You've repeated the same workflow 3+ times
- You're scared of how the agent might solve a problem (write the approach as a skill first, correct it before production)
- A process has more than 5 steps that must happen in order
- You want to encode a recipe so it's deterministic and reviewable

**Rules** encode preferences (what to avoid). **Skills** encode recipes (how to do things). Different purposes, different triggers.

## Extending with External Skills

These external skill collections can supplement the foundation workflow. Cherry-pick individual skills rather than installing entire frameworks:

| Source | Best Skills to Cherry-Pick | Install |
|--------|---------------------------|---------|
| **Superpowers** (obra) | `systematic-debugging`, `writing-plans`, `subagent-driven-development` | Copy to `.claude/skills/` |
| **gstack** (Garry Tan) | `/office-hours` (argumentative planning), `/cso` (security audit), `/canary` (post-deploy monitoring) | `git clone` to `.claude/skills/gstack` |
| **GSD** | Full spec-driven pipeline (interview → research → discuss → plan → execute) | `npx get-shit-done-cc@latest` |

See `guides/tools-catalog.md` for the full tiered tool/plugin recommendations.
