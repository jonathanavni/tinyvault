# Gotchas — Chromium, Playwright, CDP, Docker and Node

Runtime quirks of the harness's substrate: Chromium/Playwright/CDP behaviour, Docker Desktop on macOS, and Node module resolution.

<!-- One entry per gotcha: `- **<short title>** — <the trap>, <how to detect it>, <the fix>. (<date>)`. Entries were moved here verbatim in the 2026-09-09 consolidation; add new ones under the matching heading. -->

## Chromium, Playwright and CDP

- **Chromium refuses port 1 as `net::ERR_UNSAFE_PORT`, and any failed `page.goto` commits an error page as a
  pending main-frame navigation that interrupts the next `goto`** ("interrupted by another navigation to
  chrome-error://chromewebdata/"). `waitForLoadState('load')` does not observe it (the old document is already
  loaded); waiting for the main-frame `framenavigated` event (or `waitForURL(/chrome-error/)`) does. Use a bound,
  then released, loopback port for "connection refused" tests. (2026-09-02)
- **Chromium worker targets through Playwright's client `CDPSession`:** a page session accepts
  `Target.setAutoAttach({ flatten: false })` and then `Target.sendMessageToTarget` / `Target.receivedMessageFromTarget`
  reach the page's dedicated workers (Network events and `getRequestPostData` included). Shared and service workers
  are browser-level targets; the browser session (`newBrowserCDPSession`) accepts only `flatten: true`, whose child
  sessions the client API cannot route, and `context.newCDPSession(worker)` is rejected. Probed on 1.62.1. (2026-09-02)
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
- **2026-09-13 M5 marker-wait clarification (M9 register Entries67–69):** the separately approved
  two-run diagnosis reproduced a candidate timeout despite one valid `not-attached` marker on the target
  route; base produced `target-detached` and passed. The old wait recognized only the latter, while the
  existing classifier/SCHEMA declare both. A poll timeout proves absence of a matching event, not absence
  of every declared marker. This does **not** explain the historical 2026-09-04 or full-test03 timeout,
  whose original traces remain unavailable, or establish M9 causation or universal race liveness.
  The user-approved test-only repair accepts either exact declared marker on the exact slow-worker route;
  it preserves `bodiesUnobserved(events) === 1`, zero completed endpoint receipts and the10s deadline.
  It no longer requires this browser case to observe the child-session-specific `target-detached` path.
  The prohibition on a body-or-marker substitution and the historical cause-unknown status above remain.
- **`ps | grep chrom` misses Chromium (`Chromium`/`Chrome for Testing`, capital C) and a 20 s sampling interval misses
  every short-lived Docker CLI call.** Half an hour of slice-3 hang diagnosis was spent on the false conclusion "no
  Chromium, no exec processes" before the instrumented-copy technique found the real stall in ~1 minute. When a test
  hangs, do not sample processes — copy the test into the scratchpad with absolute imports, add timestamped stage
  logs and a per-step `Promise.race` bound, and run that copy with its own Vitest config outside the repo tree.
  (2026-09-05)
- **Chromium makes cross-origin HTML unobservable to a page-level oracle.** An `<img>` of an HTML document fails with
  `net::ERR_BLOCKED_BY_ORB`, a cross-origin `fetch` without CORS headers with `net::ERR_FAILED`; Playwright emits
  `requestfailed` and no `response` event even though the server answered. A status-keyed oracle is blind to exactly
  the reachable case; classify by `requestfailed` text (refused/timed out/unresolved = no route; ORB/CORS = a server
  answered; ABORTED/RESET/CLOSED = cancellation, not a verdict). Also: a form's iframe `load` fires synchronously on
  insertion — install the handler before `append`, or `form.submit()` never runs. (2026-09-05)
- **A pending main-frame navigation wedges the page-level CDP session; a Playwright goto timeout does not end it.**
  While Chromium has a navigation in flight (e.g. a TCP connect to a black-hole address, 75 s on macOS), every query on a
  `context.newCDPSession(page)` session — `Runtime.evaluate`, `DOM.getDocument`, `Page.getFrameTree`, and
  `cdp.detach()` (it sends `Runtime.runIfWaitingForDebugger` first) — hangs until the navigation ends; Playwright's own
  `page.evaluate` hangs too. `page.goto({timeout})` rejecting does NOT cancel the navigation. `Page.stopLoading` is browser-
  handled, answers in ms on the wedged session and aborts the navigation; only context disposal releases the sockets. A hostile
  page can cause this with `location.href = <black hole>` and no agent navigate. Detect: control ops or close stalling for
  ~75 s after any navigation to an unreachable host. Evidence: D-CANCEL archive 2026-09-07. (2026-09-07)
- **`Page.stopLoading` after a FAST navigation failure cancels the committing error page and breaks the next goto.**
  Stop is right only while a navigation is still pending (Playwright `TimeoutError`); after `ERR_CONNECTION_REFUSED` /
  unsafe-port failures Chromium is already committing its error page, and stopping it leaves the frame in a state that
  interrupts the following navigation (`controls.browser.test.ts` closed-exception matrix went red). Detect: the next
  `browser_navigate` after a fast failure returns `navigation-failed`. Fix: gate the stop on `error.name === 'TimeoutError'`
  and keep the `framenavigated` settle for fast failures. (2026-09-07)
- **A cohort-level `bridge-closed` from the composed transport is not a root cause.** The public client rejects an oversized
  events buffer LOCALLY (`composedFixtures.ts:89-95` → `control-limit` → mapped to `bridge-protocol`) and closes the whole
  project; `runOnce` swallows the first run's error into `execution-failed / unclassified`; the NEXT run's `registerRun` hits the
  closed fixture and throws `bridge-closed`, which is what `qualification.json` records. Diagnose from the first run's sidecar and
  the raw `events.json` byte size against `MAX_EVENTS_BYTES`, not from the cohort reason. (S6 pilot, 2026-09-08)

## Docker (Desktop on macOS)

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
- **Docker 29 `image inspect` omits `Config.Cmd` (and `Entrypoint`) entirely when the image does not set it**, so a
  strict `Object.hasOwn` parser rejects every `ENTRYPOINT`-only image; treat absent as `null` and require at least one
  of the two. `docker image inspect --format '{{.Config.Cmd}}'` errors with "map has no entry for key" on such an
  image, which is the quickest confirmation. (2026-09-05)
- **`docker compose ps -aq -p <project>` lists only containers Compose itself created.** A bare `docker create`d
  container with the project/service labels is invisible to it; a "project is empty" check must use
  `docker ps -aq --filter label=com.docker.compose.project=<p>`. Also on Docker 29: `image inspect` omits
  `Config.Cmd` entirely for an `ENTRYPOINT`-only image; an unspecified IPC mode inspects as `private`; the lookalike
  canonical `/` is a 302, so a healthcheck must accept 3xx. (2026-09-05)
- **Docker bridge-network addresses are unroutable from a Docker Desktop host; a probe to them can only time out.**
  From the harness this means (a) `browser_close_session` hangs after a navigation to such an address (BACKLOG, M6
  spec input) and (b) no page-level probe can produce a verdict there within its deadline — measure coverage over
  host-routable targets and declare the exclusion. (2026-09-05)

## Node and encoding

- **`import.meta.resolve(spec, parent)` silently ignores `parent` without
  `--experimental-import-meta-resolve`** and resolves relative to the calling script — which happens to be
  right for a repo-root gate, so a missing flag is invisible until a nested `node_modules` case. The gate now
  refuses to run unflagged; keep the flag on both `package.json` invocations. (2026-09-01)
- **`typescript`'s runtime JS contains a non-literal `require` and an unresolved optional
  `source-map-support` edge.** Any gate that follows real runtime modules fails closed on it; that is why the
  scripts-rooted tolerance exists and why it must stay keyed on the entry root. (2026-09-01)
- **Failed sync zlib calls pin their streams until the event loop turns.** `inflateRawSync` on garbage (~16 KB of
  native state each) is released on `process.nextTick`; inside one synchronous whole-run scan that never happens,
  so 20,000 failed trials retained gigabytes and a 14 MB events corpus hit a V8 heap OOM. Gate speculative trials
  (size, BTYPE, once per buffer) and budget them per event; the meta-gate's "never throws" control cannot see an
  OOM. (2026-09-03)
- **Fatal UTF-8 decoding still strips an initial BOM by default.** Byte-sensitive parity decoding
  needs `ignoreBOM: true` to retain U+FEFF for explicit rejection or literal comparison. Slice6's
  transcript/capture/anchor regressions and isolated mutations prove their distinct paths; they do
  not extend artifact-map tests into disk-ingress proof. Slice6 register Entry24. (2026-09-06)
- **Compiler AST helpers can accidentally enter the production dependency graph.** Slice6's
  source-comment reader pulled TypeScript into production-reachable claims.ts; moving the unchanged
  helper/import to its sole test consumer preserved the dependency gate without a new exception.
  Keep compiler tooling in test-only consumers. Slice6 register Entry22. (2026-09-06)
- **A worktree with a symlinked `node_modules` cannot pass the provenance-dependent suites.** `testbed/evaluationProvenance.ts`
  `hashFiles` rejects any symlink component on an enumerated source path (the SDK version file lives under `node_modules`), so
  `make test` in such a worktree reds ~170 tests with `Source input must be a regular file without symlinks` across
  `evalEntry`, `realAgentRun`, `runner.browser`, `runner.realAgent` and `sourceInventory` — an environment artifact, not a
  code red. Worktrees are fine for Codex workers and single-file runs; the owner gate runs in a real checkout (or a clean
  clone). (2026-09-09)
- **macOS runs Spotlight (`mds_stores`), Photos analysis (`mediaanalysisd`) and iCloud (`fileproviderd`) at 10–95 % CPU exactly
  during idle hours, and after a restart the software-update service joins them.** An objective per-process CPU predicate
  therefore excludes most "idle window" run starts (11 of 20 in the 2026-09-10 campaign). Check `ps -axo pcpu,comm | awk '$1>=10'`
  before any measurement campaign; treat these daemons explicitly in the pre-registration rather than discovering them in
  the report. (2026-09-10)
- **`git worktree remove` from inside that worktree kills the rest of a chained command** ("Unable to read current working
  directory") — a later `git merge` in the same chain silently never ran. Run worktree removal from the main checkout with
  `git -C`. (2026-09-09)
- **The campaign harness refuses an output directory inside the checkout** (even under ignored `artifacts/`) and, after a
  `--plan` freeze, starts only with `--runs 20 --resume`; a bare start is refused as "candidate already has an incomplete
  campaign". Both are by design — read `tools/probe-p-campaign/README.md` before invoking. (2026-09-10)
- **The composed closer's export secret scan is linear in the number of registered secrets, and it has two consumers.** Each 249 MB
  container export is scanned by the closer (`scanStreamWithControls`) and again by `IntegrationEvidence.observeExport`; `StreamSecretScanner`
  throughput fell from 35 MB/s at 96 secrets to 6 MB/s at 579 and 3 MB/s at 965 (micro-benchmark), so a five-fixture project whose
  close-time inventory is 965 secrets needs ≈146 s per export and every export is killed at `COMMAND_TIMEOUT_MS` (120 s) — a
  deterministic 763 s red (`exited null` at +120 s, scan never resolves). Symptom to recognise: the runner metrics' `elapsedMs ≈ 6 s`
  for exports comes from a different test's closes; do not read it as "exports are fast". Diagnose with a temporary timestamped
  `#export`/`#scan` (single test, tree restored), not by re-running the gate. Authorized fix 2026-09-10: a 240 s per-export deadline;
  scanner optimization is separate work. (2026-09-10)
- **Never run the Docker gate while review agents or Codex jobs are working the host.** The first red on `828c769` was misread as
  load-induced because three reviewers ran concurrently; the true cause was the export-scan capacity above. Gates get the host to
  themselves (the timing partitions need it anyway); dispatch reviews before or after, never during. (2026-09-10)

## Standalone entry points and MCP (2026-09-10)

- **Node v24 strips TypeScript types by default but does not rewrite extensionless specifiers**, and this repository imports extensionlessly (`moduleResolution: Bundler`, `noEmit`), so `node src/x/main.ts` fails with `ERR_MODULE_NOT_FOUND` on the first relative import. A runnable entry needs an esbuild bundle (precedent: `testbed/docker/Dockerfile:6`, `slice4.sourceInventory.test.ts:94-102` API build). **A bundle built with `packages:'external'` resolves bare specifiers from its own directory upward**, so it must live under the repository root (a `mkdtemp` under `/var/folders` cannot find `playwright`); such a bundle is not relocatable. (2026-09-10)
- **The MCP specification's current revision is `2026-07-28` and it removed `initialize`/`initialized` and `ping`, made every request carry `_meta.io.modelcontextprotocol/{protocolVersion,clientCapabilities}`, requires `resultType` on every result and `ttlMs`/`cacheScope` on `server/discover` and `tools/list`, and serves legacy (`initialize`-based, 2025-11-25 and earlier) and modern eras concurrently.** Reviewers reasoning from training priors wrote modern `ping` into a packet twice; fetch `…/specification/2026-07-28/changelog` and the pinned pages before writing any wire sentence, and pin URLs in the packet. Legacy request ids may never be reused within a session; notifications never receive a response; batching was removed in 2025-06-18. (2026-09-10)
- **Claude Code 2.1.258 as an MCP stdio client (measured 2026-09-12, `-p` mode, throwaway logging server; evidence `artifacts/review-evidence/tinyvault-m8-rev5-20260911/probe/`):** opens **legacy `initialize` at `2025-11-25`** by default (bare `clientInfo` with five fields, id `0`, then `notifications/initialized`, then `tools/list`; never `server/discover`, never `ping`); modern `2026-07-28` only with `MCP_PROTOCOL_NEGOTIATION=auto` (+ `MCP_SDK_GENERATION=v2`), and then it spawns a **separate throwaway process** for `server/discover` and SIGTERMs it ≈ 5 ms after the answer, then runs the session on a second process with fully namespaced `_meta` on every request. `tools/call` `params._meta` carries `progressToken` and a vendor key `claudecode/toolUseId` in **both** eras — a strict params validator breaks the client. **Session teardown is SIGINT → SIGTERM (+100 ms), stdin still open at both, then — only if the process is still alive — an inferred SIGKILL (≈ 0.5–0.75 s after SIGINT); the discovery process instead gets SIGTERM + stdin EOF together** — a SIGTERM/EOF-only shutdown handler misses the first signal, and a slow shutdown may be truncated. **A stdio server that dies mid-session (exit 1 or SIGKILL) is respawned ≈ 240 ms later and the next tool call goes to the fresh process** (≈ 4.5 s when it dies right after `tools/list`), with no model-visible sign and no re-`tools/list` — although `code.claude.com/docs/en/mcp.md` says stdio servers are not reconnected automatically. Consequence for TinyVault: a per-process fill budget is renewed by any crash; M8 packet rev 5 §3.11 states it. (2026-09-12)
- **`claude -p` inside a Claude Code session:** unset `CLAUDECODE` (`env -u CLAUDECODE`), pass `</dev/null` (else "no stdin data received in 3s"), use `--strict-mcp-config` with a one-off `--mcp-config` so nothing else loads, `--allowedTools mcp__<server>__<tool>` or the model only asks for permission, and `perl -e 'alarm N; exec @ARGV' --` as the timeout (macOS has no `timeout`). ≈ $0.02 per Haiku 4.5 run. (2026-09-12)


## M8 integration / M6 finalization witness (2026-09-12)

- A real `Runtime.evaluate('0')` stalled behind navigation may settle before finalization: a50ms pending check and2s black-hole TCP preflight do not guarantee it stays pending for the test. The approved witness retains an unresolved promise on the renderer global and sends `awaitPromise:true`, preserving actual POST/native CDP work and the strict capture-failure/disposal/no-scorecard assertions. Global retention avoids collection, but a committed navigation can still destroy the execution context and produce a fail-closed red. Preserve that red; isolated diagnostic passes do not clear the full gate. See the M8 register's separate M6 repair and `docs/project-assessment-2026-09-12-m8.md`.
