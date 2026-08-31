# Skills Development Guide

Read this when building or improving skills, or when deciding between rules and skills.

## Rules vs Skills

| | Rules | Skills |
|--|-------|--------|
| **Encode** | Preferences — what to avoid or always do | Recipes — how to do specific things |
| **When to create** | You see behavior you disapprove of | You have a specific process you want followed |
| **How to activate** | Add rule to `.claude/rules/`, CLAUDE.md routes to it | Create in `.claude/commands/`, invoke with `/skill-name` |
| **Loading** | Always loaded (rules/) or routed on-demand (guides/) | Loaded on invocation only |

**Rules** change behavior passively. **Skills** are actively invoked. Use rules for "never do X" and skills for "when I say /foo, do X then Y then Z."

## The 9 Skill Categories

When deciding what skills to build, these are the categories that prove most useful:

| Category | Example | Value |
|----------|---------|-------|
| **Library/API reference** | How to use a specific SDK correctly | Prevents hallucinated API calls |
| **Product verification** | Check that feature X works end-to-end | Catches integration bugs |
| **Data fetching** | Pull data from external source in a specific format | Eliminates manual steps |
| **Business process automation** | Invoice generation, report creation | Saves repetitive work |
| **Code scaffolding** | Generate boilerplate for new feature/module | Ensures consistent structure |
| **Code quality/review** | Audit code against project standards | Consistent quality bar |
| **CI/CD** | Run tests, build, deploy | Reduces friction |
| **Runbooks** | Step-by-step incident response | Critical under pressure |
| **Infrastructure ops** | Spin up environments, manage configs | Reduces human error |

## Writing Effective Skills

**Gotchas section is the highest-signal content.** Build skills from common failure points and update the gotchas as you discover new ones. A skill that says "when doing X, watch out for Y because Z" is worth more than ten pages of happy-path instructions.

**Don't railroad Claude.** Give information and flexibility rather than rigid step-by-step scripts. Skills should provide context and constraints, not micromanage every tool call. Claude is good at figuring out the "how" — skills should focus on the "what" and "why."

**On-demand hooks.** Skills can include hooks that activate only when the skill is loaded — e.g., a database skill that adds a PostToolUse hook to verify queries. This keeps hooks out of global context until they're relevant.

**Measure usage.** Track which skills are popular and which are under-triggering via a PreToolUse hook that logs skill invocations. If a skill isn't being used, either the trigger conditions are too narrow or it's not useful enough.

## The Autoresearch Improvement Loop

Instead of manually refining skills, let an agent iteratively improve them:

1. Define a 3-6 item scoring checklist for what "good" looks like
2. Agent runs the skill, scores against the checklist
3. Agent proposes changes, re-tests, reverts losers
4. Repeat until hitting 95%+ pass rate
5. Track improvements in a changelog

This works for any skill, workflow, or prompt used repeatedly. The agent does the testing and iteration; you review the final result.

## When to Build vs Install

Before building a skill from scratch:

1. Check if Superpowers, gstack, or GSD already has something similar
2. Check if it's a built-in capability (subagents, memory, planning)
3. Check `guides/tools-catalog.md` for external tools

Build custom skills for:
- Project-specific workflows no external tool covers
- Domain knowledge unique to your project
- Processes that combine multiple tools in a specific sequence
