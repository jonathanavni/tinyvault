# ORIENT.md

> This file is for humans, not agents. It answers: "what do I need to know to sit down and work on this after two weeks away?"

## What Is This?

TinyVault is a harness-agnostic, model-blind credential-fill library for browser agents (opaque handles in, origin-pinned keystrokes out, plaintext never in model context), proven by a hostile-web testbed that *measures* credential-leak rate. It's a portfolio project — the tiny, legible, measured version of the mechanism OpenInstinct hand-rolled. Full context: [`PROJECT-SPEC.md`](PROJECT-SPEC.md).

## How It Works

The vault interface has three tools: `list_vault` (opaque handles + labels, never secrets), `fill_from_vault`
(handle + session + field roles → origin-pinned fill, closed result), and `request_vault_setup` (the refusal path — never
"ask the user for the password in chat"). The trusted fill service (`src/core`, `src/supervisor`) resolves a handle at fill
time through a backend (`src/backends`, libsodium local file today), validates the live page against the credential's
canonical origin, injects the value atomically in an isolated realm (`src/browser`), locks the filled fields down, and
redacts everything that flows back. A supervisor captures every byte that crosses the boundary on eleven evidence
channels; the testbed (`testbed/`) replays that evidence offline through a leak checker with a finite decoder inventory
and a meta-gate that proves the checker can still catch planted leaks. `make eval` runs the real reference agent and the
naive baseline (Haiku 4.5, `temperature: 0`) against the benign fixture and the four hostile fixtures (`lookalike-origin`,
`dom-hidden-injection`, `secret-echo`, `fake-reauth` — the last two merged 2026-09-10; E8c qualified only in its evaluated fixture/configuration, E8b remains unqualified) in Docker-composed fixtures and prints a leak-rate table with Wilson intervals plus the
capture-coverage line; `make eval-stub` runs the scripted stub agent through the same harness. The claims are exactly the honest-claims sentences in
`docs/m4-slice-spec.md` and `docs/m5-slice-spec.md`; every declared blind spot is in `SCHEMA.md`.

M8 adds a stdio MCP adapter over the same supervised host: three vault tools plus six browser
controls, with one host and fill budget per process. It is complete, merged as `a40bbd65`,
with gates and capped independent reviews complete; accepted limits are in the M8 register. Build with `make mcp` and launch from the installed checkout; the
bundle resolves external dependencies there and is not relocatable. Process recreation grants
fresh fill authorization, so the tested Claude Code configuration does not provide renewal isolation.
The exact launch instructions and limitation are in README and SCHEMA. E8c's in-process evaluated
configuration is distinct from the adapter's scripted/client interoperability evidence. No cohort
leak-rate measurement covers the nine-tool MCP surface; the evaluated surface has seven tools.

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
make demo                    # M10: the 60-second demo (not implemented yet)
```

## Known Weirdness

- Safety classifiers may flag legitimate work here (hostile fixtures, credential-phishing tool descriptions). This is expected and defensive — see `PROJECT-SPEC.md` §11 and `CLAUDE.md` § Tools/cross-model. GPT-6 Astra carries flagged defensive-security slices under the project routing rules.

## Key Links

- Repo: `github.com/jonathanavni/tinyvault` (private until the README readiness pass)
- Roadmap and rationale: `PROJECT-SPEC.md`; execution: `PLAN.md`; contracts: `SCHEMA.md`
- Latest outside view: `docs/project-assessment-2026-09-12-m8.md` (M8 close); earlier: `docs/project-assessment-2026-09-09.md`, `docs/project-assessment-2026-09-06.md`, `-04`, `-03`
- Blog draft, demo GIF: not yet (M10)
