---
description: QA review from fresh context — spawns a reviewer subagent that defaults to rejection
---

# /review

Spawn a QA reviewer subagent with fresh context to review recent implementation work. The reviewer defaults to "NEEDS WORK" — it must be convinced the code is solid, not the other way around.

This is the **same-model** review channel. For high-risk code, pair it with a **cross-model** Codex pass (step 5) — the two catch largely disjoint issues. See [`docs/handoff-pattern.md`](../../docs/handoff-pattern.md) §7.

## When to Use

- After completing a milestone or multi-step feature
- Before committing a significant batch of changes
- When you want a second opinion on architectural choices
- For payment/security code: run the full flow (Claude reviewer → Codex cross-model review)

## Steps

1. **Determine review scope** — `git diff --stat` and `git diff --name-only` for the changed files; read `PLAN.md` for the current milestone's requirements and verification checklist.

2. **Scale review depth** by change magnitude:
   - Under 200 lines: full detail review of every line
   - 200–1000 lines: focused review on critical areas (security, API design, error handling)
   - Over 1000 lines: architectural-level review + spot-check critical paths

3. **Spawn reviewer subagent** (Agent tool) with a strong reasoning model and the prompt template below.

4. **Process the report:**
   - PASS → proceed to step 5 or commit/wrapup
   - NEEDS WORK → fix critical issues, then re-review
   - Don't argue with the reviewer — fix the issues, or explain to the user why you disagree.

5. **Cross-model review** — for gating / correctness / security / payment code, run a Codex `adversarial-review` pass on the same diff. Mandatory for payment and security code, recommended for API-contract changes, skip for internal refactors/tests/config. See [`docs/handoff-pattern.md`](../../docs/handoff-pattern.md).

## Reviewer Prompt Template

Fill in `{{SCOPE}}`, `{{FILES}}`, `{{REQUIREMENTS}}`, and `{{VERIFICATION_CHECKLIST}}`.

```
You are a QA Reviewer for <project>. Review recent implementation work with fresh eyes. Default to "NEEDS WORK" — only pass if everything is genuinely solid.

## Context
{{SCOPE}}

## Files to Review
{{FILES}}

## Requirements & Design Decisions
{{REQUIREMENTS}}

## Your Task

1. Read all files listed above — every new and modified file.
2. Check for these specific issues:

### Security (CRITICAL)
- Injection (SQL / command / XSS), missing input validation at system boundaries
- Credential exposure (hardcoded keys, secrets in logs)
- Auth / authorization bypasses, rate-limit bypass vectors

### Correctness (CRITICAL)
- Does the implementation match the requirements?
- Edge cases: empty inputs, missing fields, malformed data, boundary values
- Error handling: uncaught rejections, missing error cases
- Resource leaks: unclosed connections, unbounded caches, missing cleanup

### API Design (HIGH — if there are consumers)
- Response schema consistency, error response quality, correct status codes
- Token efficiency (no unnecessary data in responses)

### Code Quality (MEDIUM)
- Dead code, unused imports, duplicated logic that should be shared
- Oversized functions/files, deep nesting, inconsistent naming, weak type safety

### Performance (MEDIUM)
- N+1 queries, missing indexes, unbounded collections, blocking operations in the request path

### Contract / Schema Docs (CRITICAL when relevant)
- If the diff changes a schema, migration, or public wire-shape, verify the corresponding contract/schema doc was updated in the same commit. Flag drift as CRITICAL.

3. If it's a running service, start it and exercise it yourself:
{{VERIFICATION_CHECKLIST}}

4. Return a structured report:

## Status: PASS | NEEDS WORK

## Critical Issues (must fix before shipping)
- [file:line] Description. Why it matters. How to fix.

## Warnings (should fix, not blocking)
- [file:line] Description. Why it matters.

## Observations (nice to fix, low priority)
- [file:line] Description.

## What Works Well
- Positive observations.

Be thorough. Be harsh. The implementer wants to ship quality code, not hear that everything looks good.
```

## Rules

- Always use a strong reasoning model for the reviewer — it needs the horsepower to find subtle issues.
- Never skip the review for milestone completions, even when you're confident.
- The reviewer's report is advisory — the user makes the final call on what to fix.
- After fixing critical issues, consider re-running `/review` to verify the fixes.
- Cross-model review (step 5) is mandatory for payment and security code.
