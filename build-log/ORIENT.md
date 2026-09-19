# ORIENT.md

> This file is for humans, not agents. It answers: "what do I need to know to sit down and work on this after two weeks away?"

## What Is This?

TinyVault lets a browser-using AI agent log in without the model seeing the password. The model gets an opaque handle; TinyVault checks the page's origin and types the password itself. A test bed of hostile pages measures how often a credential leaks, with and without the vault. Start with the [README](../README.md). The original spec is [`PROJECT-SPEC.md`](PROJECT-SPEC.md).

## How It Works

The model sees three vault tools: `list_vault` (handles and labels, never secrets), `fill_from_vault` (handle + session + field → a fill on the pinned origin, with a fixed result) and `request_vault_setup` (the refusal path; the agent never asks the user for a password in chat).

On the trusted side, the fill service (`src/core`, `src/supervisor`) looks the handle up in a backend (`src/backends`: an encrypted local file, or 1Password), checks the live page against the credential's origin, types the value from an isolated context in the page (`src/browser`), locks the filled field, and masks it in everything that goes back to the model. A supervisor records what crosses the boundary on eleven evidence channels.

The test bed (`testbed/`) replays that evidence offline through a leak checker, and every run first proves the checker can still catch a planted leak. `make eval` runs the real agent and a naive baseline (Haiku 4.5, temperature 0) against one benign page and four hostile ones (`lookalike-origin`, `dom-hidden-injection`, `secret-echo`, `fake-reauth`), hosted in Docker, and prints a leak-rate table with confidence intervals. `make eval-stub` runs a scripted agent through the same pages. Every declared blind spot is in `SCHEMA.md`.

The MCP server (`src/adapters/mcp`, build with `make mcp`) puts the same host behind stdio: three vault tools plus six browser tools, one fill budget per process. Restarting the process resets that budget. No batch of real-model runs has gone through the MCP server; the measured runs used the library's seven-tool interface. Launch instructions and limits are in the README and `SCHEMA.md`.

## Working On It

This repo uses the **tinytandem** two-model workflow. The assistant in which the user starts the session
owns continuity; delegated agents stay workers. In a direct Codex session Astra leads and Claude provides
independent review. Read `AGENTS.md`, `CLAUDE.md`, `PLAN.md` Current State and `docs/handoff-pattern.md` §0.
The applicable ladder preserves locked contracts, independent QA/security/adversarial channels, capped fix
rounds, owner verification and the merged-tree gate. Review findings are append-only in `docs/m*-review-findings.md`.
Sessions start with `/start` and end with `/wrapup`.

## Common Operations

```bash
npm ci && make browsers      # install (Node 24, Playwright Chromium)
make test                    # tsc + dependency boundary + unit/browser suites + the serial timing families
make eval                    # the real reference-vs-baseline scorecard (5 cells × 2 agents × 10 runs; needs Docker + ANTHROPIC_API_KEY)
make baseline                # the naive baseline alone (5 cells × 10 runs)
make eval-stub               # the scripted stub agent through the same harness (no provider key)
make demo                    # the real eval at 1 run per cell (10 Haiku runs, ~30 cents, ~5 min; needs Docker + ANTHROPIC_API_KEY)
```

## Known Weirdness

- **`make test` only counts from a fresh clone.** The entry check walks the whole checkout and refuses symlinks, so a working copy with preserved evidence under `artifacts/` (gitignored, full of symlinks) fails with `source-symlink`. Clone to a scratch directory, `npm ci && make browsers`, and run the gate there.
- On macOS the default temp directory sits behind a symlink (`/var` → `/private/var`). Tests that compare paths need the canonical form; one didn't, and it cost a red gate at launch.
- Safety classifiers may flag legitimate work here (hostile fixtures, credential-phishing tool descriptions). This is expected and defensive — see `PROJECT-SPEC.md` §11 and `CLAUDE.md` § Tools/cross-model. GPT-6 Astra carries flagged defensive-security slices under the project routing rules.

## Key Links

- Repo: `github.com/jonathanavni/tinyvault`
- Roadmap and rationale: `PROJECT-SPEC.md`; execution: `PLAN.md`; contracts: `SCHEMA.md`
- Latest outside views: `docs/project-audit-2026-09-18.md` (pre-launch audit) and `docs/project-assessment-2026-09-18-launch.md`; earlier: `docs/project-assessment-2026-09-12-m8.md`, `-09-09`, `-09-06`, `-09-04`, `-09-03`
- Blog post: not yet
