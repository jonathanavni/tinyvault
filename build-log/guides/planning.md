# Planning Guide

Read this before starting any non-trivial feature (3+ steps or architectural decisions).

## The Planning Protocol

1. **State the objective** clearly — one sentence
2. **Define success criteria** — with concrete examples. How will you know it worked?
3. **Decompose** into sub-tasks. Identify what can run in parallel
4. **Assign agent types** — research agents plan, implementation agents execute. Never both
5. Use neutral prompting — don't lead the plan toward a predetermined conclusion

## Be Precise About Implementation

Vague prompts force agents to research options, polluting context with alternatives before implementation begins.

- **Bad:** "Build an auth system" → agent researches all options, context bloated, confused
- **Good:** "Implement JWT with bcrypt-12, refresh token rotation, 7-day expiry" → focused

If you don't know the implementation details: research task → decision → fresh-context implementation agent. This is the foundation of the orchestrator pattern.

## Scope Discipline

Push back on ambitious "tackle the whole thing at once" plans:

- **Suggest smaller increments.** "This is a 3-session project. Want to start with just X?"
- **Flag scope creep.** If a request balloons during implementation, pause and note it
- **Reference repos.** "Know any repos that do something similar? I can clone to /tmp/ to learn patterns"
- A working smaller thing beats a half-finished grand vision
- For parallel workstreams, use **git worktrees** — one session builds, another reviews or writes tests. No context bleed between branches

## Multi-Step Planning Pipeline (for important features)

For features that will take significant effort, challenge the plan before building:

| Step | What | Persona |
|------|------|---------|
| 1. Scope challenge | Is this the right thing to build? Right scope? | Argumentative — actively tries to poke holes |
| 2. Design review | Does the architecture make sense? Edge cases? | Engineering — ASCII diagrams, data flow, test plans |
| 3. Plan stress-test | Red/Yellow/Green findings against the plan | Critical — assumes the plan has problems |

**Argumentative personas are more useful than agreeable ones.** A persona that tells you your idea has problems and explains why, then helps find a better approach, produces dramatically better plans than one that agrees and builds what you asked for.

You don't need all three steps for every feature. Use judgment:
- Bug fix → skip all three, just plan and implement
- New API endpoint → scope challenge is enough
- New system/service → all three

## Pre-Write Skills for Scary Problems

If you're nervous about how the agent might approach a problem:

1. Ask it to research the approach
2. Have it write the approach as a skill (`.claude/commands/`)
3. Review and correct the skill before it encounters the problem in production

This turns an unknown into a reviewable recipe.

## Plan Quality Bar

A good plan is detailed enough for "a junior engineer with no context" to execute. Each sub-task should include:

- What to change (the specific goal)
- Which files are involved (explicit scope)
- What not to touch (boundaries)
- How to verify it worked (test, command, or check)
- Estimated complexity (trivial / moderate / complex)

## After-Action Reviews

After completing a project or significant phase, run a structured reflection:

1. What were you trying to accomplish?
2. What moments stood out?
3. What surprised you?
4. What worked? What didn't? Root causes?
5. Distill into 3-6 concrete, reusable lessons — citing specific files and commits, not generic platitudes

Encode actionable lessons into CLAUDE.md or guides so they persist.
