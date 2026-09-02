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

## M3 session (2026-09-01)

- **The Bash tool runs zsh, which does not word-split an unquoted `$VAR`.** `C="node x.mjs"; $C status`
  runs a command literally named "node x.mjs" (exit 127). Three poll monitors sat silent for 40+ minutes.
  Write the command inline (or `${=C}`), and make poll loops exit loudly on an unreadable status — a
  monitor whose failure mode is silence is the same bug as a leak checker that cannot go red. (2026-09-01)
- **The Codex sandbox cannot write `.git`** (index.lock EPERM) and usually **cannot `mkdtemp`** (its
  `npm test` then runs zero vitest/selftest tests while `tsc` and the gate pass). It stops correctly at a
  commit boundary. Pre-authorize "leave the work uncommitted; the integrator commits with explicit paths"
  in every packet, and never trust its test counts — run the suite yourself. (2026-09-01)
- **A Codex job marked `failed` can mean a model-capacity error AFTER the work is done.** Inspect the tree
  and run the suite before assuming lost work; its break/restore mutation experiments can leave a mutation
  applied if the turn dies mid-way, so check the load-bearing line explicitly. Retry a review or report
  turn once; capacity errors cluster. (2026-09-01)
- **Branch-scoped Codex reviews read `base..HEAD` at run time.** Committing anything while one runs drifts
  its basis. Pin base *and* head in the prompt and hold commits. (2026-09-01)
- **`import.meta.resolve(spec, parent)` silently ignores `parent` without
  `--experimental-import-meta-resolve`** and resolves relative to the calling script — which happens to be
  right for a repo-root gate, so a missing flag is invisible until a nested `node_modules` case. The gate now
  refuses to run unflagged; keep the flag on both `package.json` invocations. (2026-09-01)
- **`typescript`'s runtime JS contains a non-literal `require` and an unresolved optional
  `source-map-support` edge.** Any gate that follows real runtime modules fails closed on it; that is why the
  scripts-rooted tolerance exists and why it must stay keyed on the entry root. (2026-09-01)

## M4 session (2026-09-01)

- **`codex-companion.mjs status <job> --json` nests the state under `.job`** (`{workspaceRoot, job: {status, phase, …}}`),
  not at the top level. A poll loop reading `.status` at the root printed the whole JSON as its "unknown"
  fallback and reported a job that had died at 53 s as still running for ten minutes. Parse `job.status`,
  treat anything not in the known-running set as terminal, and print the raw status on parse failure. Same
  class as the zsh word-splitting monitor bug from M3: a monitor whose failure mode is silence. (2026-09-01)
- **`gpt-5.6-sol` returns "Selected model is at capacity" within a minute of dispatch, sometimes.** The job
  shows `failed` with the review never started. Retry once with the same arguments before changing anything.
  (2026-09-01)
- **The authoring hazard recurred: a NUL pad character written as a JS escape inside a spec code block landed as
  a literal NUL byte.** `file(1)` said `data` and every `grep` over the doc went silent (binary), so the §5.1
  stale-token sweep looked clean. Run `file -b <doc>` after every authored write and before any grep sweep; the
  model's own tool calls render escape sequences into raw bytes, so spell the escape out (backslash, u, four
  zeros) or use `perl` to insert it. (2026-09-01)
