# Gotchas

Sharp edges and footguns discovered the hard way — environment quirks, library traps, tooling surprises. Each one here is a debugging session a future agent doesn't have to repeat.

Pin the **working Codex dispatch invocation for this machine** here (companion-script path, flag set, model-availability notes), since that's owned by the plugin and drifts across versions — see `docs/handoff-pattern.md` §1.

- **Codex dispatch invocation (this machine)** — companion script: `node /Users/jonathanavni/.claude/plugins/cache/openai-codex/codex/1.0.4/scripts/codex-companion.mjs <mode>`. Modes: `task [--background] [--write] [--model <m>] [--effort <e>] [prompt]`, `adversarial-review [--wait|--background] [--base <ref>] [--scope <auto|working-tree|branch>] [focus text]`, `review`, `status`, `result [job-id]`, `cancel`. Verified ready 2026-08-31: codex-cli 0.144.5, ChatGPT login active, advanced runtime available. Path drifts on plugin update — re-`find ~/.claude/plugins/cache -name codex-companion.mjs` if it 404s. (2026-08-31)

<!-- One entry per gotcha. Format:
- **<short title>** — <the trap>, <how to detect it>, <the fix>. (<date>)

Example:
- **Rate limit is per-IP, not per-token** — using app auth, the upstream API rate-limits by IP, so parallel workers on one host share a budget. Detect: 429s that don't track token count. Fix: shard workers across hosts. (2026-02-03)
-->
- **A leak checker's own test fixtures must not come from the code under test.** The meta-gate originally
  generated its planted encodings by calling production `secretTransforms` — so deleting an encoding deleted
  its own test and the gate stayed green. Fixtures are now independently constructed with per-transform
  mutation tests. Detect: ask "would this test fail if I broke the thing it tests?" (2026-08-31)
- **Gap-tolerant substring matching is unusable on real transcripts.** An in-order character-subsequence scan
  for a leaked secret hits ~78% false positives at 6KB and 100% at 16KB+ of ordinary mixed-case agent
  chatter. Use contiguous-chunk reassembly with a minimum chunk length instead. (2026-08-31)
- **`git add -A` in a worktree shared with a delegated agent stages work you have not reviewed.** A
  planning-side doc was swept into an unrelated Codex commit this way. Stage explicit paths. (2026-08-31)
- **Codex stops rather than amending a frozen contract — pre-authorize expected amendments in the handoff.**
  It halted twice on genuine contract gaps (`AttackClass: 'benign'`, per-scenario `leakRateCI95`); the second
  was a gap in my packet, not its error. It can also run out of turn mid-slice: verify completion by running
  the tests, not by reading its report. (2026-08-31)

