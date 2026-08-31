# Context Efficiency Guide

Read this when sessions feel slow, token usage seems high, or the project has large always-loaded context.

## Input Token Ratio

A healthy input-to-output ratio is 10:1 to 30:1. Above 100:1, you're paying to re-read context, not to think.

**Symptoms:**
- Sessions feel slow despite simple requests
- Compaction happening frequently
- Large files being loaded every turn

**Fixes:**
1. Move bulk context to on-demand search (semantic search, codebase-memory-mcp, or just Grep)
2. Enforce progressive disclosure — CLAUDE.md has pointers, not content
3. Use `/clear` aggressively between unrelated tasks

## Prompt Caching Architecture

Claude Code uses prompt caching (prefix matching). Understanding this changes how you structure context:

- **Static-first, dynamic-last** — system prompt, tools, and always-loaded rules should be stable at the top. Dynamic content (conversation, task-specific context) at the bottom. Changes in the middle invalidate everything after them
- **Tool search with deferred loading** — delay loading tool definitions until they're needed to preserve cache hits
- **Cache-safe forking for compaction** — when compacting, use the exact same system prompt/tools/history and append the summary instruction as a message (not a system prompt edit). Editing the system prompt breaks the cache
- **Treat cache hit rate as uptime** — if cache breaks start happening frequently, investigate what changed

## Compaction Best Practices

When conversation history gets compacted:

1. Re-read your task plan before continuing
2. Re-read relevant files — don't assume you remember them correctly
3. Write important outputs to files BEFORE they might get compacted
4. The "two-prompt separation" for compaction: separate "how to summarize" from "how to re-introduce the summary." The handoff prompt that helps the model understand the summary is as important as the summary itself

## Domain vs Procedural Knowledge

Track two types separately in project files:

| Type | What | Changes | Where |
|------|------|---------|-------|
| **Domain** | What things are — schemas, naming, API shapes, business rules | Rarely | CLAUDE.md (always relevant) |
| **Procedural** | How to do things — build commands, deploy steps, error fixes | When tools change | Guides (only when doing that procedure) |

In MEMORY.md, prefix entries with `[domain]` or `[procedural]` for faster retrieval.

## Context Window Hygiene

- **Separate contexts for review.** When reviewing your own work, spawn a fresh subagent. The reviewer shouldn't share the implementer's assumptions
- **Plan tokens are cheap.** 5 minutes in plan mode saves 50 minutes of implementation retries
- **Compaction-safe artifacts.** When producing important outputs (schemas, decisions, data), write to files immediately
- **Fewer than 10 MCPs.** Each MCP server adds tool definitions to always-loaded context
- **Avoid unnecessary screenshots** in workflows — images bloat every subsequent turn
- **Don't dump conversation history into sub-agents** — each agent gets only the context it needs (project files + task-specific inputs)

## The Memory Stack

For projects needing multiple memory layers:

| Layer | Tool | What It Handles |
|-------|------|-----------------|
| Structural knowledge | codebase-memory-mcp | Architecture, call graphs — queried on demand, never in-context |
| Session capture | claude-mem | Every tool call logged, compressed, searchable |
| Session persistence | Hooks (save at Stop, reload at SessionStart) | Auto-save/reload across sessions |
| Current state | `.claude/memory/MEMORY.md` | Active conventions, known risks. Prune regularly |
| Historical decisions | Separate `decisions.md` | Append-only "we chose X because Y." Rarely loaded |

**Key principle:** Separate what to remember from where to remember it. Only human decisions and active conventions belong in prose files.
