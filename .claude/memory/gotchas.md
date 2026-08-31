# Gotchas

Sharp edges and footguns discovered the hard way — environment quirks, library traps, tooling surprises. Each one here is a debugging session a future agent doesn't have to repeat.

Pin the **working Codex dispatch invocation for this machine** here (companion-script path, flag set, model-availability notes), since that's owned by the plugin and drifts across versions — see `docs/handoff-pattern.md` §1.

<!-- One entry per gotcha. Format:
- **<short title>** — <the trap>, <how to detect it>, <the fix>. (<date>)

Example:
- **Rate limit is per-IP, not per-token** — using app auth, the upstream API rate-limits by IP, so parallel workers on one host share a budget. Detect: 429s that don't track token count. Fix: shard workers across hosts. (2026-02-03)
-->
