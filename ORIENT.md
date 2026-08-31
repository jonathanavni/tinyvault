# ORIENT.md

> This file is for humans, not agents. It answers: "what do I need to know to sit down and work on this after two weeks away?"

## What Is This?

TinyVault is a harness-agnostic, model-blind credential-fill library for browser agents (opaque handles in, origin-pinned keystrokes out, plaintext never in model context), proven by a hostile-web testbed that *measures* credential-leak rate. It's a portfolio project — the tiny, legible, measured version of the mechanism OpenInstinct hand-rolled. Full context: [`PROJECT-SPEC.md`](PROJECT-SPEC.md).

## How It Works

*(To be filled in during/after Phase 0 — see `PROJECT-SPEC.md` §5 for the initial architecture sketch: untrusted caller → trusted fill service (origin validation, autofill, redaction) → browser (Playwright/CDP) + credential backend (`op`/`bw`/local-file). The hostile-web testbed drives a target agent through named attacks and emits a leak scorecard.)*

## Working On It

This repo uses the **tinytandem** two-model workflow: Claude orchestrates and holds continuity; Codex implements bounded slices and reviews adversarially. Read [`CLAUDE.md`](CLAUDE.md) and [`docs/handoff-pattern.md`](docs/handoff-pattern.md). Start a session with `/start`, end with `/wrapup`, review milestones with `/review`.

## Common Operations

```bash
# (fill in once the toolchain is scaffolded in Phase 0)
# Install:
# Run tests:
# Run the leak testbed / scorecard:
# Record the demo:
```

## Known Weirdness

- Safety classifiers may flag legitimate work here (hostile fixtures, credential-phishing tool descriptions). This is expected and defensive — see `PROJECT-SPEC.md` §11 and `CLAUDE.md` § Tools/cross-model. Codex 5.6 Sol is the fallback for flagged slices.

## Key Links

<!-- Repo, blog draft, demo GIF, the OpenInstinct / Instinct references from the spec -->
