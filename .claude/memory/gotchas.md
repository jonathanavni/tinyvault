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
- **The Codex companion does NOT serialize `--write` jobs.** `status` listed a second job as `queued` while its log
  was advancing; the commit-1 fix slice ran concurrently with commit 2 in the same worktree and commit 2's agent
  noticed commit-1 files changing under it. Never dispatch two `--write` jobs against one worktree; read-only
  review jobs may overlap a write job because they review a pinned range. Trust a job's log mtime over the list.
  (2026-09-02)
- **The Codex sandbox cannot launch Chromium (`Permission denied (1100)` on Mach-port registration) or bind
  loopback (`listen EPERM 127.0.0.1`).** Every browser suite and live-server test is integrator-run only; a
  Codex report's "passed" never covers them. Commit 2 shipped six browser-suite failures that only the
  integrator's run found (three fixture bugs, three product bugs). Budget an integrator run + one fix cycle per
  browser-heavy commit. (2026-09-02)
- **Chromium refuses port 1 as `net::ERR_UNSAFE_PORT`, and any failed `page.goto` commits an error page as a
  pending main-frame navigation that interrupts the next `goto`** ("interrupted by another navigation to
  chrome-error://chromewebdata/"). `waitForLoadState('load')` does not observe it (the old document is already
  loaded); waiting for the main-frame `framenavigated` event (or `waitForURL(/chrome-error/)`) does. Use a bound,
  then released, loopback port for "connection refused" tests. (2026-09-02)
- **Same machine, same commit, different verdicts on probe P.** The final M4 security channel saw `npm test` red in
  2 of 3 runs (three timing rejections at |Δ| ≤ 0.17 ms) while the QA channel, minutes apart, saw 10/10 gate
  observations pass. Three reviews and a Codex job were running concurrently — the serial-last invocation quiets the
  test process, not the machine. Report every number with its load context; never treat one channel's red as a code
  defect without the other channel's numbers. (2026-09-02)
- **Never gate a commit on a hard-coded test count.** A `grep -q "7 passed"` guard silently skipped the fix-final3
  commit when the slice added an eighth timing test; the worktrees, review packets and a Codex review were then
  built on the wrong (docs-only) range and had to be cancelled. Gate on the exit code, and print the resulting
  HEAD hash before anything downstream uses it. (2026-09-02)
- **Every integrator edit re-runs `tsc` before the commit, and the run stanza is measured on the final tree.**
  A one-line test narrowing after the integrator run dereferenced an optional field; vitest ran green (no
  typecheck), the commit stanza said "tsc OK" from the earlier run, and `make test` was red on the reviewed commit.
  The `tsc && test` chain must be the last thing before `git commit`. (2026-09-02)

## M5 session (2026-09-02)

- **`codex-companion.mjs adversarial-review --background` can block the calling shell for minutes while the shared
  runtime starts, and the Bash tool kills it at its timeout — the job is still created.** Symptom: exit 143 with
  no job id printed; `status --all --json` (run from the REPO root — status is workspace-scoped, and a `cd` to the
  scratchpad earlier in the session made it report "No jobs recorded") shows the job `running`. Dispatch with the
  Bash tool's `run_in_background`, then read the id from `status`, rather than waiting on the dispatch call. (2026-09-02)
- **Chromium worker targets through Playwright's client `CDPSession`:** a page session accepts
  `Target.setAutoAttach({ flatten: false })` and then `Target.sendMessageToTarget` / `Target.receivedMessageFromTarget`
  reach the page's dedicated workers (Network events and `getRequestPostData` included). Shared and service workers
  are browser-level targets; the browser session (`newBrowserCDPSession`) accepts only `flatten: true`, whose child
  sessions the client API cannot route, and `context.newCDPSession(worker)` is rejected. Probed on 1.62.1. (2026-09-02)
- **A Codex review job can die silently and stay `running` forever.** The pre-impl M5 review's process (pid in the
  job JSON) vanished ~95 s in with no error line; `status` reported `running` for 43 minutes and the job JSON
  never updated. Detect with `ps -p <pid>` (gone) plus the log's mtime (stale > 5 min while "running"); then
  `cancel` and re-dispatch once with identical arguments. A poll loop must check the pid and log mtime, not
  only the status string. (2026-09-02)
- **Failed sync zlib calls pin their streams until the event loop turns.** `inflateRawSync` on garbage (~16 KB of
  native state each) is released on `process.nextTick`; inside one synchronous whole-run scan that never happens,
  so 20,000 failed trials retained gigabytes and a 14 MB events corpus hit a V8 heap OOM. Gate speculative trials
  (size, BTYPE, once per buffer) and budget them per event; the meta-gate's "never throws" control cannot see an
  OOM. (2026-09-03)
- **A wall-clock budget inside an offline checker breaks the recompute invariant.** A 100 ms per-event deadline made
  `leakScan` load-dependent: the same `events.json` scored `truncated` under a loaded parallel suite and clean
  alone, and the adjudicator's stored-vs-recomputed agreement check would then reject runs nondeterministically.
  Bound checker work in deterministic units (decoded outputs, bytes, trials per event), never time. (2026-09-03)
- **Playwright resumes every new worker itself (`runIfWaitingForDebugger`, fire-and-forget) before a second CDP
  session's `Network.enable` round trip lands**, so `waitForDebuggerOnStart` on our page-level auto-attach does NOT
  close the race for immediately-fetching workers (73–91 of 200 Blob bodies lost under load). Treat client-API
  worker-body capture as best-effort and count every miss (correlate Playwright's own request event with the
  absent child body → marker). (2026-09-03)

- **Playwright's `request.allHeaders()` is unreliable for a target that closed before the network layer reported
  (a self-closing popup's keepalive POST):** it either resolves with the PROVISIONAL set as if final (no
  `content-length`, indistinguishable by content) or rejects with `Target page, context or browser has been
  closed` — timing decides which. Detect the first by identity (resolved sets always add to `request.headers()`)
  and treat the second like the timeout fallback, never as a capture failure (register C-B2f2). (2026-09-04)
- **A `cd <worktree> && …` chain leaves later commands in that worktree** — the C-B2f2 register commit landed on the
  fixtures branch instead of main and had to be reset and redone. Run each git write from an explicit `git -C <path>`
  or start the command with the intended `cd`. (2026-09-04)
- **`src/supervisor/host.test.ts` sits at the 800-line auditability gate (`fillService.structure.test.ts`)**; new
  lease-level tests go in `host.evidence.test.ts` (bare `new EvidenceLease(CANARY)` + fake requests). (2026-09-04)
- **A long-lived Codex branch drifts behind main's merges** — `codex/m5-hostile-fixtures` forked before slice A's merge
  and the `scanTruncated` amendment, so its `make test`/`make eval` never certify the merged tree; run the merge gate
  on the merged tree and `git merge-tree --write-tree main <branch>` for conflicts before the merge. (2026-09-04)
- **This shell's `grep` is `ugrep` and rejects wide bounded quantifiers on UTF-8 (`{0,400}` → "exceeds complexity
  limits"); use `command grep` or python for transcript/JSONL mining.** Two more zsh traps met the same night: `$T:testbed/…`
  applies the `:t` modifier (path tail) — write `${T}:…`; and `set -- $VAR` does NOT word-split in zsh — use
  `read A B C <<< "$VAR"` (a status monitor misparsed "running" as terminal until fixed). (2026-09-03)
