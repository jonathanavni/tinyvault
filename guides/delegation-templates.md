# Delegation Templates

## The Orchestrator Pattern

The session agent is a **manager, not a worker**. It doesn't write code — it holds the plan, delegates precise task specs to workers, and synthesizes results. Each worker gets a fresh context window, which is the key advantage: workers aren't carrying the orchestrator's accumulated context, decisions, and false starts.

**The hardest part is the handoff format.** Too little context and workers make wrong assumptions. Too much and you've recreated the single-session problem. Each subagent should receive:
1. What to change (the specific goal)
2. Which files they own (explicit scope)
3. What not to touch (boundaries)
4. How to verify results (self-check before returning)

**Context discipline:** Paste relevant context into the prompt — don't say "read CLAUDE.md." The subagent can't see your conversation history. Give it only what it needs for its specific task.

### Session Strategy

Two valid approaches — choose based on project duration:

- **Long-lived orchestrator thread** — one session that learns over time. Write an ORCHESTRATOR.md to survive compaction. Best for ongoing repos where accumulated context is valuable
- **Per-contract sessions** — one fresh session per task contract. Prevents context drift. Best for batch work or when tasks are independent

### The Delegation Loop

This is the core orchestration flow — delegate, evaluate, accept or reject:

```
ORCHESTRATOR (main session — holds plan, doesn't code)
     │
     │ 1. Write task spec (goal, files owned, boundaries, how to verify)
     │
     ├──► IMPLEMENTER (fresh context)
     │         │
     │         │ Returns: status + summary + concerns + files changed
     │         │
     │    3. Validate report — sections present? Status DONE or BLOCKED?
     │         │
     │         │ if BLOCKED → unblock and re-dispatch
     │         │ if DONE ──►
     │
     ├──► REVIEWER (fresh context — doesn't share implementer's assumptions)
     │         │
     │         │ Returns: PASS / PASS_WITH_CONCERNS / NEEDS_WORK
     │         │
     │    5. Act on review
     │         │
     │         │ NEEDS_WORK → back to implementer with reviewer's issues
     │         │ PASS → integrate and move to next task
     │
     └── Next task
```

**For higher stakes** (complex features, pre-launch):
- Write tests *before* dispatching to the implementer (tests-as-handoff-contracts — gives the reviewer objective criteria)
- Replace the manual reviewer with the **Reality Checker** pattern from `guides/verification.md` (dedicated QA subagent that defaults to rejection, runs tests + app)

**Keep it simple for small tasks.** Not everything needs the full loop. A bug fix might just be: dispatch implementer → check the report yourself → done. Scale the loop to match the task.

## When to Delegate vs Handle Directly

- **Handle directly** — simple task, context already loaded, <5 min of work
- **Delegate to subagent** — complex, benefits from fresh context, or would bloat the orchestrator's window with intermediate results
- **Route to MCP** — external system interaction where only the result matters

## Structural Discipline (All Agents)

Every subagent prompt includes:

1. **Mandatory report format** — empty fields are visible signals. Validate before accepting
2. **Assumed verification** — "Your output will be reviewed by a separate agent." Knowing you'll be checked changes behavior
3. **Escalation as safe default** — BLOCKED is always better than wrong. Reporting uncertainty is success

## Model Selection

| Favor Sonnet | Favor Opus | Favor Haiku |
|-------------|------------|-------------|
| Well-specified tasks | Judgment / discretion required | High volume, structured I/O |
| High volume / parallel | Novel connections needed | Mechanical transforms |
| Follow spec without deviation | Evaluating another agent's work | Classification / tagging |

---

## 1. Implementer

**When:** Task has a clear spec — write code, build a script, refactor a module.
**Model:** Sonnet (Opus for multi-file integration or architectural complexity)

```xml
<task>
[What to build/change — specific deliverable]
</task>

<context>
[Relevant code, conventions, schema, constraints.
Paste what the agent needs — don't reference files it can't see.]
</context>

<rules>
1. Implement exactly what is described. Do not add features or refactor surrounding code.
2. If the spec is ambiguous, report NEEDS_CONTEXT with specific questions.
3. BLOCKED is always better than wrong.
4. Your output will be reviewed by a separate agent.
</rules>

<report-format>
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Summary: [What was accomplished in 2-3 sentences]
Concerns: [Anything the reviewer should look at, or "None"]
Files changed: [List with one-line descriptions]
</report-format>
```

## 2. Researcher

**When:** Need to investigate, explore, or gather information. Returns findings — never makes changes.
**Model:** Opus (judgment about relevance, depth, when to stop)

```xml
<task>
[What to investigate — frame as a question or set of questions]
</task>

<focal-questions>
[3-5 specific things to look for. Constraining the search enables depth.]
</focal-questions>

<rules>
1. Research only. Do not create, edit, or delete any files.
2. Distinguish findings (evidence) from interpretation (inference). Label each.
3. If the question has no clear answer, say so — don't manufacture certainty.
4. Stop when you have enough to answer the question.
</rules>

<report-format>
Status: DONE | DONE_WITH_CONCERNS | BLOCKED
Findings:
- [Finding 1 — with source/evidence]
Interpretation: [What the findings mean, labeled as inference]
Gaps: [What you couldn't determine and why]
</report-format>
```

## 3. Reviewer

**When:** QA from fresh context. The reviewer should NOT share the implementer's context — that's the point.
**Model:** Opus (catching what the implementer missed requires strong judgment)

```xml
<task>
[What to review — file paths, diff range, or output to evaluate]
</task>

<context>
[Success criteria from the plan. Project conventions.
Do NOT include the implementer's reasoning or conversation history.]
</context>

<rules>
1. Review only. Do not fix issues — report them.
2. Assume the implementer's work may be incomplete or optimistic. Verify by reading actual code.
3. Categorize: BLOCKER (must fix) | CONCERN (should fix) | NIT (could fix).
4. If everything looks correct, say so — don't manufacture issues.
</rules>

<report-format>
Status: PASS | PASS_WITH_CONCERNS | NEEDS_WORK
Issues:
- [BLOCKER/CONCERN/NIT] [file:line] [description]
Strengths: [What was done well — be specific]
Assessment: [1-2 sentence overall judgment]
</report-format>
```

## 4. Batch Worker

**When:** Same operation applied to many items — categorize, transform, tag.
**Model:** Haiku (high volume, structured I/O)

```xml
<task>
Process the following [N] items. For each, [describe the operation].
</task>

<items>
[Structured input — JSON array, CSV, or numbered list]
</items>

<rules>
1. Process every item. Do not skip or summarize.
2. Output must be valid JSON matching the format below.
3. If ambiguous, flag with "confidence": "low".
</rules>

<output-format>
[{"id": "...", "result": "...", "confidence": "high|medium|low"}]
</output-format>
```

## 5. Explorer

**When:** Understand a codebase, system, or domain. Broader than a targeted search.
**Model:** Opus (synthesis, not just search)

```xml
<task>
[What to understand — a subsystem, pattern, data flow, architecture question]
</task>

<starting-points>
[Known entry points — file paths, function names, module names]
</starting-points>

<rules>
1. Explore only. Do not create, edit, or delete any files.
2. Build a mental model, not a file listing. Explain how things connect.
3. Note surprises — anything unexpected is high-signal.
4. Prioritize depth over breadth.
5. You MUST include all four report sections — especially Surprises and Open Questions.
</rules>

<report-format>
Status: DONE | NEEDS_MORE_EXPLORATION
Mental model: [How the system works — structure, data flow, key abstractions]
Key files: [The 3-7 most important files and why]
Surprises: [Anything unexpected — naming issues, dead code, hidden coupling]
Open questions: [What needs deeper investigation]
</report-format>
```

---

## Orchestrator Checklist

**Before dispatching:**
- [ ] Task description is self-contained (agent doesn't need conversation history)
- [ ] Context is pasted, not referenced ("read CLAUDE.md" → paste the relevant sections)
- [ ] Model is appropriate (Sonnet for execution, Opus for judgment, Haiku for volume)
- [ ] Report format is included in the prompt

**After receiving the result:**
- [ ] All required report sections are present
- [ ] If sections are missing, push back — don't accept incomplete reports
- [ ] Surprises, Gaps, and Open Questions are often the highest-value outputs

## Advanced: Scored Adversarial Pattern (Bug-Finding)

For thorough bug-finding, use three agents that exploit sycophancy in opposite directions:

| Agent | Incentive | Role |
|-------|-----------|------|
| **Bug-finder** | +1 low impact, +5 medium, +10 critical | Finds the superset of all possible bugs (will over-report) |
| **Adversarial** | +score for disproving, -2x score if wrong | Finds the subset of real bugs (will aggressively disprove) |
| **Referee** | +1 correct, -1 wrong (told you have ground truth) | Synthesizes both into final judgment |

Use when: security review, pre-launch audit, or any time thoroughness matters more than speed.
