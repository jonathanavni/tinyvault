# Gotchas — Codex and review channels

Codex dispatch, sandbox limits, job monitoring, model routing, the safety classifier, and the Claude review helper (`scripts/claude-review.mjs`). Each one is a debugging session a future agent doesn't have to repeat.

<!-- One entry per gotcha: `- **<short title>** — <the trap>, <how to detect it>, <the fix>. (<date>)`. Entries were moved here verbatim in the 2026-09-09 consolidation; add new ones under the matching heading. -->

## Dispatch invocation and packet rules

- **Codex dispatch invocation (this machine)** — companion script: `node /Users/jonathanavni/.claude/plugins/cache/openai-codex/codex/1.0.4/scripts/codex-companion.mjs <mode>`. Modes: `task [--background] [--write] [--model <m>] [--effort <e>] [prompt]`, `adversarial-review [--wait|--background] [--base <ref>] [--scope <auto|working-tree|branch>] [focus text]`, `review`, `status`, `result [job-id]`, `cancel`. **Models: route by stakes — `gpt-6-astra` for security-core code and adversarial review *of code*, `gpt-5.6-sol` for docs, mechanical refactors, fact-checks and probes (see CLAUDE.md). Astra requires codex-cli >= 0.153.3.** Note `adversarial-review`/`review` accept **no** `--model` flag and always run the built-in default, so routing a review to Sol means `task --fresh --model gpt-5.6-sol` with a READ-ONLY preamble and an explicit output format. Verified 2026-09-04: codex-cli 0.153.3, `adversarial-review` and `task --model gpt-6-astra` both green (`ASTRA_TASK_OK`); Sol carried both pre-impl plan-review rounds and found 7 P1s across them. Path drifts on plugin update — re-`find ~/.claude/plugins/cache -name codex-companion.mjs` if it 404s. (2026-08-31)
- **Codex stops rather than amending a frozen contract — pre-authorize expected amendments in the handoff.**
  It halted twice on genuine contract gaps (`AttackClass: 'benign'`, per-scenario `leakRateCI95`); the second
  was a gap in my packet, not its error. It can also run out of turn mid-slice: verify completion by running
  the tests, not by reading its report. (2026-08-31)
- **Two blind channels per paper round pays for itself on this project.** Round 1: Codex found the gating gaps
  (E surfaces, correlation branches), Claude found the two facts that would have burned the integrator's Docker fix
  cycle (`docker exec` has no `-T`; `"type": "module"` is present). Round 2: Codex found the reorder-blind canonical
  check and the `instanceof Error` vacuity; Claude verified process-env interpolation and the npm lifecycle-script
  hole on the host. Dispatch Sol (`task --fresh --model gpt-5.6-sol`) and a `Plan` subagent on the same packet, in
  parallel, and write the register only when both are in. (2026-09-05)

- **A TypeScript test that imports a symbol from a gate `.mjs` module needs a sibling `.d.mts`, and that file belongs in the
  packet's ownership list.** The pin slice asked for an in-suite hygiene test over a production literal in `scripts/test-execution.mjs`;
  `tsconfig` (`moduleResolution: Bundler`, no `allowJs`) then needs `scripts/test-execution.d.mts`, which the packet had not assigned,
  so Astra STOPped correctly at TS7016 and a one-file Extension was needed. When a packet puts a `.ts` test over an `.mjs` export,
  list the declaration file up front. Also: a worktree with a symlinked `node_modules` cannot run the owner `make test` (provenance
  suites red on the symlink) — Codex works there, the owner gate runs in the real checkout detached at the candidate. (2026-09-10)

## Sandbox limits (what a Codex report can never prove)

- **The Codex sandbox cannot write `.git`** (index.lock EPERM) and usually **cannot `mkdtemp`** (its
  `npm test` then runs zero vitest/selftest tests while `tsc` and the gate pass). It stops correctly at a
  commit boundary. Pre-authorize "leave the work uncommitted; the integrator commits with explicit paths"
  in every packet, and never trust its test counts — run the suite yourself. (2026-09-01)
- **The Codex sandbox cannot launch Chromium (`Permission denied (1100)` on Mach-port registration) or bind
  loopback (`listen EPERM 127.0.0.1`).** Every browser suite and live-server test is integrator-run only; a
  Codex report's "passed" never covers them. Commit 2 shipped six browser-suite failures that only the
  integrator's run found (three fixture bugs, three product bugs). Budget an integrator run + one fix cycle per
  browser-heavy commit. (2026-09-02)
- **Codex-sandbox `make test` on this repo reliably shows ~70 failures** (loopback `listen EPERM`, Chromium mach-port denial,
  occasionally a container-startup readiness `vi.waitFor`) — all host-only; the owner rerun is the gate. (2026-09-08)

- **Codex `task --write` CAN write under `/private/tmp` and run the pinned Node there** (probed 2026-09-15 with a Sol task before dispatching Astra: mkdir 0700, file write, `node -e` write — all exit 0). Read-only `task` runs cannot: a shell heredoc that needs a temp file is denied and Git launcher cache writes fail; tell read-only reviewers to use `python3 -c` for parsing. External candidate roots under `/private/tmp` are therefore fine for `--write` implementation slices; cheap Sol probe first when in doubt. (2026-09-15)
- **The Codex companion's `result --json` puts the final message in `storedJob.result.rawOutput`**, not in `job.summary` (which is only the first line). Save `rawOutput` to a report file and copy the job log from `~/.claude/plugins/data/codex-openai-codex/state/<ws>/jobs/<id>.log` into the evidence directory before the plugin rotates it. (2026-09-15)

## Job monitoring — silence is the failure mode

- **A Codex job marked `failed` can mean a model-capacity error AFTER the work is done.** Inspect the tree
  and run the suite before assuming lost work; its break/restore mutation experiments can leave a mutation
  applied if the turn dies mid-way, so check the load-bearing line explicitly. Retry a review or report
  turn once; capacity errors cluster. (2026-09-01)
- **The Codex companion does NOT serialize `--write` jobs.** `status` listed a second job as `queued` while its log
  was advancing; the commit-1 fix slice ran concurrently with commit 2 in the same worktree and commit 2's agent
  noticed commit-1 files changing under it. Never dispatch two `--write` jobs against one worktree; read-only
  review jobs may overlap a write job because they review a pinned range. Trust a job's log mtime over the list.
  (2026-09-02)
- **A Codex job that used subagents can keep writing to the worktree after its status says `completed`.** The
  first slice-3 B1 job's log ended with "subagent work drained", and two later dispatches in the same worktree each
  stopped on "another writer is editing these files" — the subagents' edits landing late. No foreign process was
  involved (`lsof -d cwd` showed only Codex's own `node_repl` helpers). Before dispatching the next `--write` job or
  running an integrator `make test`, require **60 s of quiescence** (`touch marker; find … -newer marker` empty), and
  tell the implementer "single writer: no subagent edits". (2026-09-05)
- **A long-lived Codex branch drifts behind main's merges** — `codex/m5-hostile-fixtures` forked before slice A's merge
  and the `scanTruncated` amendment, so its `make test`/`make eval` never certify the merged tree; run the merge gate
  on the merged tree and `git merge-tree --write-tree main <branch>` for conflicts before the merge. (2026-09-04)
- **Branch-scoped Codex reviews read `base..HEAD` at run time.** Committing anything while one runs drifts
  its basis. Pin base *and* head in the prompt and hold commits. (2026-09-01)
- **`codex-companion.mjs adversarial-review --background` can block the calling shell for minutes while the shared
  runtime starts, and the Bash tool kills it at its timeout — the job is still created.** Symptom: exit 143 with
  no job id printed; `status --all --json` (run from the REPO root — status is workspace-scoped, and a `cd` to the
  scratchpad earlier in the session made it report "No jobs recorded") shows the job `running`. Dispatch with the
  Bash tool's `run_in_background`, then read the id from `status`, rather than waiting on the dispatch call. (2026-09-02)
- **A Codex review job can die silently and stay `running` forever.** The pre-impl M5 review's process (pid in the
  job JSON) vanished ~95 s in with no error line; `status` reported `running` for 43 minutes and the job JSON
  never updated. Detect with `ps -p <pid>` (gone) plus the log's mtime (stale > 5 min while "running"); then
  `cancel` and re-dispatch once with identical arguments. A poll loop must check the pid and log mtime, not
  only the status string. (2026-09-02)
- **`status` reports dead Codex jobs as `running` indefinitely — trust log mtime, never the status list.** A job
  whose pid was gone and whose log had been frozen for 33 minutes was still listed `running` with a live-looking
  `elapsed: 36m 52s`, and `result <id>` answered "No job found" for that same id. Monitors must key on
  `stat -f %m <jobdir>/<job-id>.log` with a stale timeout AND grep the log for `Turn failed|Codex error`; a poll
  loop keyed on the running-set never terminates. Same silence-as-failure-mode class as the M3/M4 monitor bugs.
  Job logs live at `~/.claude/plugins/data/codex-openai-codex/state/tinyvault-<hash>/jobs/<job-id>.log`.
  (2026-09-04)
- **`codex-companion.mjs status <job-id> --json` does not resolve a job id — it returns the workspace summary with
  no `.job`, and `result <id>` says "No job found" while the job is still running.** A monitor keyed on the
  single-job form breaks immediately (status reads empty → "not running"). Poll `status --all --json` and filter the
  `running` list by `id`; the log mtime rule from 2026-09-04 still applies. (2026-09-05)
- **`status --all --json` has no `completed`/`failed` buckets: keys are `running`, `latestFinished` (one object) and `recent`
  (a count), and a job can also vanish with no record at all.** D-CANCEL R3: the first dispatch (`task-mtrodla8-wv8fkf`)
  left the running list within a minute and `result <id>` said "No job found" — a genuine silent loss; the identical
  re-dispatch ran 8 min and completed, but a monitor that looked for it in a `completed` bucket reported "absent" for that
  one too. Monitor on `running` only; on leaving `running`, call `result <id>`: a report means done, "No job found"
  means lost → re-dispatch once. (2026-09-07)
- **`codex-companion.mjs status <job> --json` nests the state under `.job`** (`{workspaceRoot, job: {status, phase, …}}`),
  not at the top level. A poll loop reading `.status` at the root printed the whole JSON as its "unknown"
  fallback and reported a job that had died at 53 s as still running for ten minutes. Parse `job.status`,
  treat anything not in the known-running set as terminal, and print the raw status on parse failure. Same
  class as the zsh word-splitting monitor bug from M3: a monitor whose failure mode is silence. (2026-09-01)

## Model routing, upgrades and the safety classifier

- **(Routine-tier model since 2026-09-04, not merely a fallback — see the routing rule in CLAUDE.md.) `gpt-5.6-sol` returns "Selected model is at capacity" within a minute of dispatch, sometimes.** The job
  shows `failed` with the review never started. Retry once with the same arguments before changing anything.
  (2026-09-01)
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
- **Long, tool-heavy Codex turns die silently mid-work; short ones succeed.** Two full-scope review turns died
  after ~4 min and ~2.5 min of real work (file reads, `docker context show` probing) with NO error line in the
  log — a clean stop. A trivial same-model turn returned `DIAGNOSTIC_OK` immediately. **Split a large review into
  two or three narrowly-scoped parallel `task` jobs** rather than one long one; read-only reviews may overlap
  safely (only `--write` jobs must never share a worktree). (2026-09-04)
- **Codex's safety classifier can flag an attack-framed review packet, and Codex is this project's mitigation for
  exactly that.** A packet dense with attack vocabulary (`run_shell`, prototype pollution, exploit, bypass,
  adversary) was refused mid-review with "flagged for possible cybersecurity risk" and produced no findings.
  Re-dispatched with accurate defensive framing — stating what the code is, why the harness exists, and asking the
  same substantive questions, nothing obscured — it completed normally. Write review packets in defensive framing
  from the start; per `PROJECT-SPEC.md` §11 the mitigation is accurate framing plus model choice, never
  obfuscation. (2026-09-04)
- **The safety-classifier flag also hits `adversarial-review` MODE, and there it looks like a tooling failure.** Three
  S5 round-2 review attempts "failed" with "Codex did not return valid structured JSON" and a progress note as the
  final message; only the job LOG showed `Codex error: This content was flagged for possible cybersecurity risk …
  Turn failed.` The focus text carried forgery/tamper/promote/attack vocabulary. Check the job log for that line
  before retrying identical arguments; then re-dispatch in defensive framing (what the harness is, what the validator
  must reject) via `task --fresh --model gpt-6-astra`, which needs no structured output. (2026-09-08)

## Dispatch hygiene

- **Never put a file write and a Codex dispatch in the same background Bash command.** A `run_in_background` compound
  command (`python3 - <<'EOF' … EOF; …; node codex-companion.mjs task …`) had its heredoc re-quoted by the harness
  wrapper, a `${…}` inside the document text became a shell substitution, the write silently did not happen, and the
  dispatch ran against the stale file — a full Sol round against the wrong packet version (2026-09-09, M6.1 R3; killed,
  quarantined as `packet-sol-r3-INVALID-ran-against-v2.md`). `set -e` did not stop it. Rule: write in the foreground,
  verify a marker (`head -1`, a `grep -c`), then dispatch in a separate background call. (2026-09-09)

## The Claude review helper

- **Long review helpers must be detached from the Bash tool.** Background Bash calls die at the 10-minute ceiling; `setsid` does
  not exist on macOS. Launch `scripts/claude-review.mjs` (Opus 5 reviews run 10–30 min) with `nohup node … > log 2>&1 & disown`
  and poll `<output>/summary.json` with a re-arming watcher. (2026-09-08)
- **`scripts/claude-review.mjs` needs an unambiguous first status line.** A reviewer that writes `## Status: PASS | NEEDS-ATTENTION` followed by the verdict makes the helper report `Missing or ambiguous review status` and skip `report.md`; the full text is still in `events.jsonl` (last assistant text block) — recover it rather than re-dispatching.
- **Subprocess argv must be an array at the call, not merely look array-valued through a producer.** Node's
  child_process overload can promote a non-array second argument to options and ignore the reviewed third
  argument. Call-level spreads can also shift the effective slots. The review helper now constructs
  `[...claudeArgs()]`; its profile uniformly pins inline arrays. This closes the options-overload dependency
  even after producer rebinding, without claiming to constrain argv contents or PATH. Preserve the real-helper
  wrapper present/deleted/restored proof and the isolated CLI mutants. Canonical policy: Slice 3 plan §9;
  evidence: Slice 4 register Entries 7–9. (2026-09-05)
- **Temporary copies of the review helper need canonical entry paths on macOS.** Node resolves import.meta.url
  through `/var` symlinks; a noncanonical argv entry can miss the helper's direct-execution check and silently
  skip the intended probe. `claude-review.test.mjs` uses `realpathSync` for its temporary helper entry and proves
  fake-CLI launch when the wrapper is deleted. Exit status alone was insufficient. (2026-09-05)
- **Subprocess stream failures and historical flakes are different evidence claims.** A real helper can
  exit1 without a summary when a child stdout/stderr emits an unhandled error. Each stream needs a
  controlled failure path; test through the copied real helper and local fake CLI, with the listener
  independently deleted. Synthetic EventEmitter errors do not prove OS stream destruction, general
  process-tree cleanup, or the cause of an earlier intermittent missing summary. Preserve subprocess
  stderr/stdout in the missing-summary assertion before fixture cleanup. Slice4 register Entries39–43
  carries the exact observed defect and remaining limits. (2026-09-05)
- **A failed termination signal must not erase the original review failure.** On macOS, signaling an
  exiting detached child can throw EPERM while exitCode is still unset; a later close does not prove
  the child had already exited at signaling. Record non-ESRCH signal errors separately, preserve the
  original failure/status, retain escalation and wait for actual child close. If both signals fail
  while a child/pipe-holding descendant stays alive, no bounded cleanup or summary is guaranteed.
  This is distinct from the older stream-error defect. The committed helper repair is3b6bbbe;
  canonical real probes, regression/mutation proofs and coverage limits: M6 register final S2 R3.
  New top-level helper tests also require the explicit synthetic inventory pin in gate-cli.selftest
  to stay current; do not hide declarations to satisfy the old count. (2026-09-07)
- **`task --resume-last` resumes the most recent thread in that cwd, whatever it was — including a read-only review.**
  Twice on 2026-09-09 a follow-up implementation packet dispatched with `--resume-last` in a worktree attached to the
  Sol *review* session that had run there last, which then reported "writing is blocked by read-only sandbox" and did
  nothing. Rule: after any read-only review in a worktree, dispatch the next implementation as `--fresh --write` with a
  self-contained packet (prior packets and reports concatenated); reserve `--resume-last` for an immediate follow-up to
  the last *write* job in that cwd. (2026-09-09)

- **The companion's job store is keyed by the dispatch cwd.** `status`/`result <job-id>` run from another directory answer
  `No job found`; run them from the worktree the job was dispatched in (a `(cd <wt> && node … result <id>)` subshell). Also:
  `status --json` nests the state under `.job.status` (the top level has none — an empty parse looks like "finished"), and
  `adversarial-review --background` still blocks the calling shell until the review ends (~10 min) — run it as a background
  Bash call. (2026-09-10)

- **The review helper invalidates the whole run on any non-allowed tool call — even one denied `ls` through Bash.** `scripts/claude-review.mjs` exits 1 ("Unexpected tool call: Bash") after the reviewer has finished, and a PASS-labelled report inside `events.jsonl` is then NOT a verdict. Opus 5 reached for Bash once in a 38-turn security review despite the prompt's tool list. Put an explicit line in every packet: "you have ONLY Read, Glob and Grep; use Glob for listings; a single attempted call to any other tool invalidates this review." With that line, three later reviews made zero non-allowed calls. Preserve the invalid run's text as an extract and re-dispatch once as a tooling re-run (not verdict shopping). (2026-09-15)
- **Verify each Opus review's init event as soon as it starts** (`model claude-opus-5`, tools exactly Glob/Grep/Read, `dontAsk`, no MCP) and count non-allowed tool calls mid-run from `events.jsonl`; that catches a doomed run ~15 minutes and ~$4 early. (2026-09-15)

## Implementation-slice lessons from the runtime fill-control ladder (2026-09-11)

- **The companion has no `--help`: `task --help` dispatches a Codex task whose prompt is "--help".** It ran 22 s read-only and answered with the CLI's help. Read `gotchas_codex.md` "Dispatch invocation" for the flag set instead of probing. (2026-09-11)
- **A fresh Codex thread has no memory of a flagged or dead one.** After the classifier killed an `adversarial-review` mid-run (its log already listed "eleven mutations that pass the detectors"), a `task --fresh` re-dispatch that said "you previously reported eleven…" ended in two minutes asking for the list. State the mutation families to construct, never "your earlier findings". (2026-09-11)
- **The classifier flags a review of *pin evasions* even in defensive framing when the prompt enumerates evasion techniques** ("Reflect.set, Proxy, getter, arguments capture…" reads as attack tooling). The `task --fresh --model gpt-6-astra` route in "what the test-gate is, which source forms it must report" framing completed; state what the gate must detect rather than enumerating evasion techniques, and keep the report format explicit — accurate framing, never a reword to get past a filter (`PROJECT-SPEC.md` §11). (2026-09-11)
- **A blind Claude subagent ran its probe mutation in the owner's mutant worktree instead of its own**, despite "work only in the worktree it names" — the harness cwd it inherited was the owner's last `cd`. Harmless (the table had finished; the probe was found by the quiescence/status check and restored), but every review packet now says "never run commands in or modify any other worktree", and the owner never `cd`s into a reviewer's worktree for a read. (2026-09-11)
- **`git merge -F -` does not read the message from stdin** ("could not read file '-'"); write the message to a file. (2026-09-11)
- **Sol read-only fact-check jobs run 15–25 min; a `run_in_background` Bash monitor is capped at 10 min.** Loop on `status --all --json` `running` plus the job log's mtime, exit when the id leaves `running` and call `result <id>` into the evidence file, and simply re-arm the monitor when the window elapses — never treat a window timeout as a job failure. (2026-09-12)

## LP1 ladder lessons (2026-09-15)

- **`status --all --json` lists jobs under a top-level `running` array (each with `id`, `logFile`, `workspaceRoot`), not `jobs`.** A monitor that looks for `jobs` prints "notfound" and exits on the first tick; parse `d.running` and treat "id absent from running" as done, then call `result <id>` from the dispatch cwd. Re-arm the 10-minute window as many times as needed (an xhigh Astra implementation ran ~60 min; Sol paper reviews 15–25 min). (2026-09-15)
- **The Codex sandbox cannot `listen` on 127.0.0.1 (EPERM) and cannot launch a browser.** Any slice whose tests need a loopback listener or Chromium will be red or "blocked" in the worker's sandbox by construction; plan the owner host rerun as the load-bearing gate from the start, and tell the worker (hard rule) to record the exact sandbox error and continue with unit-level witnesses rather than fake results. Environment probes belong to the owner, not Sol. (2026-09-15)
- **`node --test` emits the spec reporter (`✔`/`✖`/`ℹ tests N`) even when piped.** Owner scripts that grep TAP (`# pass`, `not ok`) see empty summaries and false verdicts; parse the `✔ <name>`/`✖ <name>` lines and the `ℹ` counters. (2026-09-15)
- **Contract text written from review lists needs an implementability pass before dispatch.** Three Astra stops/questions in one slice were all owner text defects: a preflight rule the fixed module skeleton could not satisfy, a bridge negative that contradicted the AR1 protocol the same section mandated, and an expectation reserved for the owner (the manifest) that the worker needed to run its own launch. Astra stops correctly and cheaply on these (~6 min each), but after two stops do a full contradiction sweep before the next dispatch, and pre-authorize the arithmetic/count/boolean-vs-fact correction class explicitly so only boundary, claim, allowlist, surface, skeleton, mutant and manifest conflicts stop the thread. (2026-09-15)
- **Owner launchers must use the contract's literal command byte for byte.** A `CLONE + '/../browsers'` variant of `PLAYWRIGHT_BROWSERS_PATH` is refused by a value-exact guard; and `/tmp/...` versus `/private/tmp/...` argv paths change entry detection. Run the guard and preflight directly (import the module, call them) to get the failing check named before blaming the package. (2026-09-15)
- **`codex-companion.mjs task --help` is not a usage flag — it dispatches a real one-turn Codex task with the prompt "--help".** It started a thread, returned the TinyVault session-help text and cost a short turn. The companion has no `--help`; read the pinned invocation line at the top of this file instead of probing. (2026-09-15)

## LP4 ladder lessons (2026-09-16)

- **The Codex safety classifier can terminate a turn mid-run — a review *or* a write task — after real work is done.** LP4: one Astra adversarial review died mid-review (retried once with the same packet, succeeded) and one Astra fix turn died *after* implementing and resealing while its detached evidence runners kept executing. Handle a dead write turn by waiting for its orphaned runners (`pgrep` on the node processes + 60 s quiet), verifying the resealed candidate's identity yourself, then dispatching a **resume** worker whose packet says "verify and complete the evidence, do not re-implement" (`implementation-packet-fix-3b.md` shape). Never treat the runners' outputs as a pass without the resume worker's audit. (2026-09-16)
- **`scripts/claude-review.mjs` invalidates the whole run on a single Bash call, and Opus 5 will reach for Bash for trivial one-liners (`wc -c`, `echo test`) even with the tool line in the packet.** Two security runs in a row were lost that way. The fix that worked: a leading paragraph naming the two prior invalidations and saying "Do not call Bash for any reason; use Read for sizes/line counts". Keep the invalidated texts as `report-NOT-A-VERDICT.md` — never as verdicts. (2026-09-16)
- **A Codex write task may consult `~/.codex/memories/MEMORY.md` on its own** (two LP4 workers did once each, prompted by their session's memory instruction, despite the packet's home-directory rule). Record it as a worker deviation; it is not a packet defect and cannot be prevented from the packet alone. (2026-09-16)
- **Owner mutant reruns: execute inside each mutant's isolated bound package; never overlay its snapshot into the main candidate; the packages on disk are restored baselines, the mutated bytes live only under `Mxx/<round>/source/`.** Reuse the worker's own runner with three patches (own output tree, packages recreated, kill rule not gated on `needs:none`) and a preload whose `L` is pinned to the root. A kill needs the named marker failure with no `preflight-refusal` in the log and the restored control passing in the same package. See memory `mutant-rerun-isolated-packages`. (2026-09-16)
- **Owner file writes during a running Opus review must use absolute paths** — a `cd <repo>` for a dispatch moves the session cwd and a later append lands in the checkout, which the helper digests (tracked *and* untracked), marking the review stale. See memory `dispatch-cwd-drift`. (2026-09-16)


## LP2 review coverage lesson (2026-09-16)

- **Distinguish measured review timeout from a reviewer's claimed time limit.** LP2 recovery reports stopped with unread scope after 251.301s/230.969s despite 1200s limits; final all-source inline packets still timed out at 900s without valid reports. Use helper duration/exit receipts, keep incomplete coverage explicit, and do not credit partial transcripts or owner rebuttals as independent review completion. Supplying all source inline did not establish coverage. Fresh sessions preserve the cap; any further dispatch needs the recorded scope/cap/window disposition. Evidence: `/private/tmp/tinyvault-m9-lp2-mcp-20260916/owner/round-2/review-dispositions-final.md` and `completion.json`.


## Claude authentication visibility (2026-09-18)

- **Sandbox `claude auth status` can report signed out while the host reports authenticated.** In AR, sandbox returned loggedIn=false/authMethod=none; the same read-only status command through normal host approval returned loggedIn=true/authMethod=claude.ai, and the host-context Opus5 review completed PASS. Check this visibility difference before asking for repeated login; use the review skill's approved host mechanism, never read/copy credentials or bypass CLI restrictions. This observation does not establish the cause of older authentication failures. Evidence: M9 Entry153 and `/private/tmp/tinyvault-m9-calibration-registry-qa-resumption-20260918/owner/resumption-observation.json`.

- **2026-09-18 user-directed M9 closure:** Entry156 and PLAN's user decisions supersede earlier calibration/continuity follow-up instructions: LP2-CONTINUITY, LP3, AM/AP/AS and normal N are abandoned residuals, not launch gates. Do not resume them or reset their historical caps. Claude's next session starts with the manual operator smoke; see the current PLAN for the narrowed claim and remaining sequence.
