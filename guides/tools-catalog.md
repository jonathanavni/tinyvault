# Tools & Skills Catalog

Tiered recommendations for what to install and when. Start minimal — add tools only when you hit the ceiling they solve.

## Tier 1 — Every Project

These earn their place on day one. Minimal setup, high impact.

| Tool | What It Does | Install |
|------|-------------|---------|
| **Superpowers** (cherry-pick 3) | Methodology skills: `systematic-debugging`, `writing-plans`, `subagent-driven-development` | Copy individual skill files to `.claude/skills/` |
| **Codex CLI** | Independent code review from a different model (GPT-5.4). Use as read-only second opinion to catch bugs Claude misses | `npm i -g @openai/codex` |
| **Auto-format hook** | Prettier/ESLint after every edit — catches style drift automatically | Wire in `.claude/settings.json` hooks |
| **Type-check hook** | `tsc --noEmit` after TS/JS edits — catches type errors before they compound | Wire in `.claude/settings.json` hooks |

### Hook Setup (Tier 1)

Add to `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "command": "npx prettier --write $FILE_PATH 2>/dev/null || true",
        "description": "Auto-format after edits"
      },
      {
        "matcher": "Edit|Write",
        "command": "npx tsc --noEmit 2>&1 | head -20 || true",
        "description": "Type-check after edits"
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "command": "echo \"$TOOL_INPUT\" | grep -q '\\-\\-no-verify' && echo 'BLOCK: --no-verify is not allowed' && exit 1 || true",
        "description": "Block skipping pre-commit hooks"
      }
    ]
  }
}
```

## Tier 2 — Per Project Need

Install when you hit the specific limitation each tool solves.

| Tool | Install When | What It Does | Install |
|------|-------------|-------------|---------|
| **codebase-memory-mcp** | Codebase >10K LOC | AST-based knowledge graph. Query architecture, call graphs, dependencies without loading files into context. 99% token savings on structural queries | MCP server config |
| **gstack** (cherry-pick) | Want structured planning + release pipeline | `/office-hours` (argumentative planning), `/ship` + `/canary` (release pipeline), `/cso` (security audit with OWASP Top 10 + STRIDE) | `git clone ~/.claude/skills/gstack && ./setup` |
| **claude-mem** | Multi-session projects | Auto-captures every tool call, AI-compresses, injects relevant history into future sessions | Plugin install (requires Bun, SQLite) |
| **Playwright MCP** | Web project needing browser testing | Form filling, navigation, screenshot verification, visual regression | MCP server config |
| **Compound Engineering** | Production apps where quality should compound over time | Plan → Work → Review → Compound loop. 14+ parallel reviewers. `/ce:compound` captures learnings per task, building codebase-specific knowledge library | `/plugin marketplace add EveryInc/compound-engineering-plugin` |
| **GSD** | Greenfield, complex features | Spec-driven pipeline: interview → research → discuss → plan → execute. Fresh context per executor | `npx get-shit-done-cc@latest` |
| **frontend-design plugin** | Consumer-facing web, no design system | Forces bold aesthetic choices, avoids generic AI aesthetics (Inter font, purple gradients) | Anthropic plugin |

## Tier 3 — Large / Complex Projects

For multi-session builds, team projects, or when you need deep diagnostics.

| Tool | Install When | What It Does | Install |
|------|-------------|-------------|---------|
| **everything-claude-code** | Full multi-agent orchestration + hooks framework | 28 agents, 116+ skills, session persistence hooks, 23 MCP configs. Heavy but comprehensive | GitHub clone |
| **Claude Inspector** | Debugging token costs or context bloat | macOS proxy that visualizes API traffic, token costs, context accumulation per turn | macOS Electron app |
| **rendergit** | Onboarding to unfamiliar repos | Flattens a repo into one browsable, LLM-ready page | CLI tool |

## MCP Servers

Keep fewer than 10 MCPs enabled — each adds to always-loaded context.

| Server | When | Tools |
|--------|------|-------|
| **codebase-memory-mcp** | Large codebases | `index_repository`, `search_graph`, `trace_call_path`, `get_architecture` |
| **Playwright** | Browser testing | Navigate, click, fill, screenshot, evaluate |
| **Chrome DevTools** | Network/console debugging | Network requests, console logs, performance profiling |

## Anti-Pattern: Tool Bloat

Every tool you install adds context, complexity, and potential contradictions. Before installing anything:

1. **What ceiling am I hitting?** If you can't name the specific limitation, you don't need the tool
2. **Is it already built-in?** Skills, memory, subagents, planning — these are now native Claude Code features
3. **Will the next model update solve this?** External harnesses lock you into solutions for problems that may disappear

The minimal setup (CLAUDE.md + rules + a few skills + Tier 1 hooks) handles 80% of projects. Add tools when the remaining 20% becomes a real bottleneck, not a theoretical one.

## Plugin Combinations

These plugins solve different layers of the same problem. Two validated combos:

### gstack + Compound Engineering (speed + compounding)

gstack handles planning/shipping/QA, CE handles review and knowledge capture. A combined workflow:

1. `/office-hours` (gstack) → validate the idea
2. `/plan-ceo-review` + `/plan-eng-review` (gstack) → lock product and architecture
3. `/ce:work` (CE) → systematic execution with tracking
4. `/review` (gstack) or `/ce:review` (CE) → pick based on depth needed
5. `/qa` (gstack) → real browser, staging URL, diff-aware
6. `/ce:compound` (CE) → capture what was solved for future compounding
7. `/ship` (gstack) → deploy

**Best for:** solo founders / small teams who want fast shipping AND quality that improves over time.

### everything-claude-code + Compound Engineering (guardrails + learning)

everything-claude-code provides automated hook-based enforcement (type checking, formatting, security scanning after every edit). CE adds systematic review and post-task knowledge capture. Use everything-claude-code's orchestrator and hooks for planning/execution/guardrails, and CE's review + compound steps for quality and learning.

- Skip CE's planning/work phases — everything-claude-code's orchestrator covers that
- Use `/ce:review` for deeper multi-agent review on complex PRs (14 parallel reviewers vs hook-level checks)
- Use `/ce:compound` after every task to build the knowledge library

**Best for:** larger or longer-running projects where both automated enforcement AND systematic improvement matter.
