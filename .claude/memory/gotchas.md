# Gotchas

Sharp edges and footguns discovered the hard way — environment quirks, library traps, tooling surprises. Each one here is a debugging session a future agent doesn't have to repeat.

Pin the **working Codex dispatch invocation for this machine** here (companion-script path, flag set, model-availability notes), since that's owned by the plugin and drifts across versions — see `docs/handoff-pattern.md` §1.

- **Codex dispatch invocation (this machine)** — companion script: `node /Users/jonathanavni/.claude/plugins/cache/openai-codex/codex/1.0.4/scripts/codex-companion.mjs <mode>`. Modes: `task [--background] [--write] [--model <m>] [--effort <e>] [prompt]`, `adversarial-review [--wait|--background] [--base <ref>] [--scope <auto|working-tree|branch>] [focus text]`, `review`, `status`, `result [job-id]`, `cancel`. **Models: route by stakes — `gpt-6-astra` for security-core code and adversarial review *of code*, `gpt-5.6-sol` for docs, mechanical refactors, fact-checks and probes (see CLAUDE.md). Astra requires codex-cli >= 0.153.3.** Note `adversarial-review`/`review` accept **no** `--model` flag and always run the built-in default, so routing a review to Sol means `task --fresh --model gpt-5.6-sol` with a READ-ONLY preamble and an explicit output format. Verified 2026-09-04: codex-cli 0.153.3, `adversarial-review` and `task --model gpt-6-astra` both green (`ASTRA_TASK_OK`); Sol carried both pre-impl plan-review rounds and found 7 P1s across them. Path drifts on plugin update — re-`find ~/.claude/plugins/cache -name codex-companion.mjs` if it 404s. (2026-08-31)

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
- **(Routine-tier model since 2026-09-04, not merely a fallback — see the routing rule in CLAUDE.md.) `gpt-5.6-sol` returns "Selected model is at capacity" within a minute of dispatch, sometimes.** The job
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
- **A stress scan sharing a test with a benchmark assertion hides its own regression.** After M5-M1 the 200-event junk scan in
  `leakDecoders.timing.test.ts` runs ~60 s — under the 60 s cap on some runs, over on others (65.8 s alone). The merge and
  hygiene gates were green by variance. Benchmarks assert a bound on a small corpus; stress scans get their own test and
  their own bound. Found by the post-M5 assessment, not by the ladder. (2026-09-03)
- **A bind-mounted, container-created Unix socket is not connectable from the macOS host (Docker Desktop).** The
  socket file *appears* on the host side of the bind mount, but `connect()` from the host returns `ECONNREFUSED` —
  Docker Desktop's file-sharing layer does not proxy `AF_UNIX` across the VM boundary. Verified by the user
  2026-09-04 while choosing the M5.2 control-plane transport; it killed the "UDS instead of a published port"
  option outright, not just weakened it. The working substitute is a long-lived, framed `docker compose exec -T`
  stdio bridge into a control process inside the container (`-T` is required; a TTY mangles and echoes the byte
  stream). See `docs/m5-2-slice-spec.md` §D2.1. (2026-09-04)
- **Docker networks scope routes, not listening ports.** A container has ONE network namespace, so a listener bound
  to `0.0.0.0` is reachable on *every* network the container joins. "Publish the page origins on one network and
  the control port on another" is not a thing Compose can do, and `internal: true` prevents external routing, not
  access by a member or a dual-homed member. Isolating a control plane from a hostile page needs **privilege
  separation** (a separate sidecar the page process cannot address), never network labelling. Found by Codex paper
  round 1 against a design that was about to be built (register C-R2). (2026-09-04)
- **`coverage.browser.test.ts`'s `terminate-before-delivery` produced one unexplained full-suite timeout
  (2026-09-04, M5.2 slice 1).** One red in a full `make test`; **not reproduced in three subsequent runs** — green
  1/1 in isolation on the branch, 2/2 in isolation on `main`, and green in a later full unloaded run. **Cause
  unknown.** An earlier version of this entry attributed it to concurrent load; the timestamps do not support that
  (the Codex job's report was written before the red run began, and nothing else was running), so the attribution
  was removed rather than softened.
  The failure shape is a 10 s `expect.poll` timeout — "Matcher did not succeed in time", not a wrong value — waiting
  for a `harness-marker` in a real-Chromium worker-terminate race. Note what that means: `SCHEMA.md:140-155`
  declares the immediate-worker race nondeterministic between **body and marker**, but a timeout is *neither*
  branch, so the declared race does not explain this red. What is unproven is a **liveness bound**, which SCHEMA
  does not govern.
  **Do not "fix" this by weakening the test.** A run producing neither the required body nor the marker is
  **correctly red**; `bodiesUnobserved(events) === 1` is the meaningful assertion for the slow case, and asserting
  "a body **or** a marker" — the shape of the sibling fast-case test — would drop it, because a harness-observed
  body would make the count 0. The current evidence does not authorize changing that assertion. Treat a lone red
  here the way the probe-P entry above requires: not as a code defect **without the other channel's numbers**, and
  not as a load report either. (2026-09-04)
- **A symlinked `node_modules` in a mutant workspace produces false reds.** A reviewer's `git archive` copy that
  symlinked `node_modules` back into the real repo started failing with "Worker exited unexpectedly" **on pristine
  source** after several parallel vitest runs. They discarded the results and rebuilt with a real copy. If you build
  throwaway trees to test mutants, copy `node_modules` or accept that a red may be the workspace, not the code.
  (2026-09-04)
- **A malformed mutant looks exactly like a passing gate.** Verifying the Acceptance J wiring pin, a `node -e`
  mutant reported "no tests" — which reads as "the gate didn't fire". It was invalid JSON written by the mutant
  script, not the assertion failing; rewritten through Python's `json` module it failed cleanly on the intended
  assertion. **Always confirm a mutant produced a valid tree before recording it as red or green.** (2026-09-04)
- **`git merge` with no branch argument silently merges the upstream, not your branch.** `git checkout main && git
  merge --no-ff -m "…"` reported "Already up to date" because the branch name was omitted; it tried `origin/main`.
  Caught only by reading the log afterwards. Name the branch, and verify the merge commit exists. (2026-09-04)
- **Codex's safety classifier can flag an attack-framed review packet, and Codex is this project's mitigation for
  exactly that.** A packet dense with attack vocabulary (`run_shell`, prototype pollution, exploit, bypass,
  adversary) was refused mid-review with "flagged for possible cybersecurity risk" and produced no findings.
  Re-dispatched with accurate defensive framing — stating what the code is, why the harness exists, and asking the
  same substantive questions, nothing obscured — it completed normally. Write review packets in defensive framing
  from the start; per `PROJECT-SPEC.md` §11 the mitigation is accurate framing plus model choice, never
  obfuscation. (2026-09-04)

## M5.2 slice-2 session (2026-09-04)

- **RESOLVED 2026-09-04, but the failure shape is the durable lesson: a Codex CLI upgrade does NOT take effect
  until the shared runtime broker is restarted, and the symptom is an error telling you to upgrade what you just
  upgraded.** `gpt-6-astra` (now the default for `adversarial-review` / `review`) returned
  `400 invalid_request_error — "The 'gpt-6-astra' model requires a newer version of Codex"` on codex-cli 0.144.5.
  Upgrading to 0.153.3 (`npm install -g @openai/codex@latest`; installs to `~/.npm-global`, no sudo) **did not fix
  it** — the identical 400 persisted, because `scripts/app-server-broker.mjs` was still running from before the
  upgrade and holding a stale `codex app-server`. **Fix: kill the broker and its `codex app-server` children
  (`ps -Ao pid,lstart,command | grep app-server-broker`), then redispatch; they respawn automatically.** Astra
  answered immediately afterwards. Check the broker's `lstart` against the upgrade time before believing a
  version-related error. Also: only `task` accepts `--model`, so when a *mode's* default model is unrunnable there
  is no in-mode workaround — `task --fresh --model <id>` is the escape hatch that keeps the cross-model channel
  alive. (2026-09-04)
- **`status` reports dead Codex jobs as `running` indefinitely — trust log mtime, never the status list.** A job
  whose pid was gone and whose log had been frozen for 33 minutes was still listed `running` with a live-looking
  `elapsed: 36m 52s`, and `result <id>` answered "No job found" for that same id. Monitors must key on
  `stat -f %m <jobdir>/<job-id>.log` with a stale timeout AND grep the log for `Turn failed|Codex error`; a poll
  loop keyed on the running-set never terminates. Same silence-as-failure-mode class as the M3/M4 monitor bugs.
  Job logs live at `~/.claude/plugins/data/codex-openai-codex/state/tinyvault-<hash>/jobs/<job-id>.log`.
  (2026-09-04)
- **Long, tool-heavy Codex turns die silently mid-work; short ones succeed.** Two full-scope review turns died
  after ~4 min and ~2.5 min of real work (file reads, `docker context show` probing) with NO error line in the
  log — a clean stop. A trivial same-model turn returned `DIAGNOSTIC_OK` immediately. **Split a large review into
  two or three narrowly-scoped parallel `task` jobs** rather than one long one; read-only reviews may overlap
  safely (only `--write` jobs must never share a worktree). (2026-09-04)
- **macOS has no `timeout(1)`.** `timeout 180 node …` dies with `command not found`, and inside a backgrounded
  compound command that failure is easy to miss. Use a bounded poll loop instead. (2026-09-04)

## M5.2 slice-3 session (2026-09-05)

- **`codex-companion.mjs status <job-id> --json` does not resolve a job id — it returns the workspace summary with
  no `.job`, and `result <id>` says "No job found" while the job is still running.** A monitor keyed on the
  single-job form breaks immediately (status reads empty → "not running"). Poll `status --all --json` and filter the
  `running` list by `id`; the log mtime rule from 2026-09-04 still applies. (2026-09-05)
- **Two blind channels per paper round pays for itself on this project.** Round 1: Codex found the gating gaps
  (E surfaces, correlation branches), Claude found the two facts that would have burned the integrator's Docker fix
  cycle (`docker exec` has no `-T`; `"type": "module"` is present). Round 2: Codex found the reorder-blind canonical
  check and the `instanceof Error` vacuity; Claude verified process-env interpolation and the npm lifecycle-script
  hole on the host. Dispatch Sol (`task --fresh --model gpt-5.6-sol`) and a `Plan` subagent on the same packet, in
  parallel, and write the register only when both are in. (2026-09-05)
- **A Codex job that used subagents can keep writing to the worktree after its status says `completed`.** The
  first slice-3 B1 job's log ended with "subagent work drained", and two later dispatches in the same worktree each
  stopped on "another writer is editing these files" — the subagents' edits landing late. No foreign process was
  involved (`lsof -d cwd` showed only Codex's own `node_repl` helpers). Before dispatching the next `--write` job or
  running an integrator `make test`, require **60 s of quiescence** (`touch marker; find … -newer marker` empty), and
  tell the implementer "single writer: no subagent edits". (2026-09-05)
- **`ps | grep chrom` misses Chromium (`Chromium`/`Chrome for Testing`, capital C) and a 20 s sampling interval misses
  every short-lived Docker CLI call.** Half an hour of slice-3 hang diagnosis was spent on the false conclusion "no
  Chromium, no exec processes" before the instrumented-copy technique found the real stall in ~1 minute. When a test
  hangs, do not sample processes — copy the test into the scratchpad with absolute imports, add timestamped stage
  logs and a per-step `Promise.race` bound, and run that copy with its own Vitest config outside the repo tree.
  (2026-09-05)
- **Docker 29 `image inspect` omits `Config.Cmd` (and `Entrypoint`) entirely when the image does not set it**, so a
  strict `Object.hasOwn` parser rejects every `ENTRYPOINT`-only image; treat absent as `null` and require at least one
  of the two. `docker image inspect --format '{{.Config.Cmd}}'` errors with "map has no entry for key" on such an
  image, which is the quickest confirmation. (2026-09-05)
- **A verification chain that commits must fail closed at every step — `cmd; next` after a failing `tsc` still
  commits.** The slice-3 fix-round-2 chain used `;` between typecheck and the rest, so a test file with a syntax error
  was committed (`1507ef7`) and even got a green `make test-docker` (that file is on the `make test` path, not the
  Docker suite's). Caught by tsc and by the next review round. Use `|| exit 1` after every gate in a chain, and never
  put a commit after a step whose failure the chain can skip. Related: a `while … [ x ] && { …; }` loop's exit status
  is the last test's — with `&&` after it, the quiet path silently skips the rest; use `if`. (2026-09-05)
- **Reading a stale `.vitest/*.json` report as a result.** After a chain aborted before Vitest ran, the report files from
  the previous run were still there and read as "green". The execution proof deletes them first for exactly this
  reason; do the same in ad-hoc chains (`rm -f .vitest/*.json` before Vitest) or print the report mtime. (2026-09-05)
- **Chromium makes cross-origin HTML unobservable to a page-level oracle.** An `<img>` of an HTML document fails with
  `net::ERR_BLOCKED_BY_ORB`, a cross-origin `fetch` without CORS headers with `net::ERR_FAILED`; Playwright emits
  `requestfailed` and no `response` event even though the server answered. A status-keyed oracle is blind to exactly
  the reachable case; classify by `requestfailed` text (refused/timed out/unresolved = no route; ORB/CORS = a server
  answered; ABORTED/RESET/CLOSED = cancellation, not a verdict). Also: a form's iframe `load` fires synchronously on
  insertion — install the handler before `append`, or `form.submit()` never runs. (2026-09-05)
- **`docker compose ps -aq -p <project>` lists only containers Compose itself created.** A bare `docker create`d
  container with the project/service labels is invisible to it; a "project is empty" check must use
  `docker ps -aq --filter label=com.docker.compose.project=<p>`. Also on Docker 29: `image inspect` omits
  `Config.Cmd` entirely for an `ENTRYPOINT`-only image; an unspecified IPC mode inspects as `private`; the lookalike
  canonical `/` is a 302, so a healthcheck must accept 3xx. (2026-09-05)
- **Docker bridge-network addresses are unroutable from a Docker Desktop host; a probe to them can only time out.**
  From the harness this means (a) `browser_close_session` hangs after a navigation to such an address (BACKLOG, M6
  spec input) and (b) no page-level probe can produce a verdict there within its deadline — measure coverage over
  host-routable targets and declare the exclusion. (2026-09-05)
- **Do not commit on `main` while a background chain is merging or testing on `main`.** The memory/docs-index commit
  landed while the slice-3 merge chain was running in the same checkout; the merge is atomic and tests do not read
  docs, so nothing broke, but a code edit at that moment would have tested a tree that was not the one committed.
  One writer per checkout applies to the integrator too. (2026-09-05)

