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


## Verification blind spots (learned the hard way in M2, 2026-09-01)

- **A validator's verification must cover every branch the validator has, not every branch its tests
  have.** I verified an origin-guard fix with ASCII-only probes — mirroring the test suite's own blind spot
  — and reported it closed. A reviewer probing the IDN branch found `０x7f000001` (fullwidth zero) still
  normalizing to `127.0.0.1`. Probing the same inputs the tests use confirms nothing.
- **Fix the class, not the instance.** The C3 control-character guard shipped with no test that could kill
  it, because every control vector used an ASCII host where an earlier check rejects first — *verbatim the
  finding from the previous round*. The fix slice had already worked out that the IPv6 authority is the
  right region for trailing junk and wrote exactly that test for the backslash guard three lines away,
  without extending the reasoning.
- **A fix can move a hole instead of closing it.** Deleting the gate's filename exemption so `isProtected`
  would be "the directory rule alone" created a third directory with no rule — and the secret matcher
  ended up in it. Ask what the fix *creates*, not just what it removes.
- **"Not exploitable today" is the wrong test for a stated boundary.** It either holds or it does not.
- **My own tooling is not exempt.** A sweep script written to retire an unverifiable prose claim shipped
  with a structurally unreachable collision oracle — a permanently green metric. Every checker needs its
  own absence-detection signal: mutate the thing it watches and confirm it goes red.
- **`timeout` does not exist on macOS by default** — a `timeout`-wrapped check returns 127, which is easy
  to misread as a test result. Use `gtimeout`, or run directly and time it.
- **Authoring hazard: literal control characters and mojibake.** Twice in one session, content I authored
  carried corrupt bytes — UTF-8 `ä` read as MacRoman (`√§`) in a normative test vector, and literal C0
  controls in the findings register that made `file(1)` report `data` and hid the file from default
  `grep`. Write control characters as `U+XXXX` notation in docs, and annotate non-ASCII test vectors with
  their code point.
