# Probe P campaign harness

This directory records the single authorized campaign of exactly 20 started `make test` runs. It does not change or reinterpret the gate. `run.sh` is the only file that spawns processes; the JavaScript modules only parse, classify, hash, and read or write evidence.

## Freeze and plan

Commit the candidate, this complete directory, and `docs/probe-p-timing2-policy.md` before starting. Cite that commit SHA in the campaign record. The two-run CLI acceptance probe uses a disposable output directory and launches no `make test` or host-state commands:

```sh
tools/probe-p-campaign/run.sh --out /absolute/evidence/probe-p-campaign --runs 2 --plan
```

To freeze the real campaign for review before starting it, run the same command with `--runs 20 --plan`; after reviewing `campaign.json`, start it by repeating the command with `--runs 20 --resume` and without `--plan`. A real, non-plan invocation rejects any run count other than 20. Alternatively, omitting `--plan` on a new output directory freezes and immediately begins the campaign. The output directory should be empty and outside the checkout. `campaign.json` pins the candidate SHA, a deterministic SHA-256 over every regular file below this directory, the policy-note SHA-256, run count, predicate version, and cooldown.

The command refuses any output from `git status --short --untracked-files=all`. In the Codex worker worktree, `node_modules` is an untracked symlink because `.gitignore`'s `node_modules/` pattern matches directories only, so the plan command correctly refuses that worktree. The campaign runs in the owner's clean checkout, where `node_modules` is a directory. Do not special-case or ignore the symlink.

The real 20-run freeze records the exact `run-01` through `run-20` label set and an initially empty `startedLabels` ledger. Candidate claims are independent, one pointer per candidate SHA at `.vitest/probe-p-campaign/pointers/<candidate-sha>.json`; each pointer contains only `{ out, createdAt }`. The disposable two-run `--plan` acceptance does not claim a pointer. Alternating candidates cannot erase either claim. A second output directory for a candidate is refused while that candidate's pointed-to campaign is incomplete. The fail-closed write order is `campaign.json` first and then the candidate pointer; repeating freeze on a directory left in the intervening crash window re-creates its pointer and refuses the incomplete campaign instead of creating a replacement.

Completion does not itself authorize another campaign. Only after new user authorization, pass `--new-campaign` while freezing the new output directory:

```sh
tools/probe-p-campaign/run.sh --out /absolute/evidence/new-probe-p-campaign --runs 20 --plan --new-campaign
```

The flag is refused for resume and cannot supersede an incomplete campaign.

## Run and resume

Predicate v2.3 (`predicateVersion: 5`) replaces predicate v2.2 before any campaign was frozen. V1 classified 239 processes as competing on the reference macOS desktop, including idle `cua_node`, Codex app-server and broker, VS Code/Claude-extension, MCP, sandbox-host, and crashpad processes at zero CPU. V2 narrowed the CPU fallback but omitted several explicit policy clauses and exempted the harness's ancestors from that fallback. V2.1 added the omitted clauses, but its broad browser and `playwright` shapes treated the user's own Google Chrome helpers and the desktop app's Playwright MCP helpers as competing load. V2.2 narrowed those two Rule A shapes to their intended objects. V2.3 makes three further corrections: incidental `mcp` text can no longer suppress Rule A; the named `npm`/`npx` test, eval, baseline, and Docker-test lifecycle commands are Rule A at any CPU without requiring a checkout path; and `%CPU` accepts only unsigned decimal notation. The user's own browser and MCP helpers are not competing load unless they meet Rule B's CPU threshold. V2.3 uses these two rules:

- **Rule A, known workloads at any CPU:** `vitest` as a path or argv component; the test-runner shapes `playwright test`, `@playwright/test`, Playwright Core CLI/test processes, and `node .../playwright/cli.js test|run`; `make` with the exact target argument `test`, `eval`, `baseline`, or `test-docker`; `npm test`, `npm run test|eval|baseline|test:docker`, and the corresponding `npx` forms; direct `tsc` or `esbuild`, `npx tsc` or `npx esbuild`, and the interpreter shapes `node .../typescript/bin/tsc` or `node .../esbuild/bin/esbuild`; an invocation component whose basename begins with `codex` and whose following argv contains `task`, `exec`, `review`, or `adversarial-review`; `claude-review.mjs`; `docker build`, `docker buildx build`, `docker compose`, or `docker-compose`; and an unrelated Playwright-managed browser whose executable path contains `ms-playwright`, `Chrome for Testing`, or `chrome-headless-shell` (including a `Chromium.app` below the Playwright cache and excluding crashpad). Rule A is evaluated first, so incidental `mcp` text elsewhere in the command never exempts one of these workloads. MCP identity is limited to the executable/package identity: an executable basename or `npm exec`/`npx` package spec matching `@playwright/mcp`, `playwright-mcp`, `chrome-devtools-mcp`, or `@modelcontextprotocol/*`, or a `node` main-script path below a `<pkg>-mcp` directory. A `node`, `npm`, `npx`, or `make` command is also a Rule A workload when its command line references an absolute path outside `checkoutRoot` whose path contains the repository directory token `tinyvault`; this includes encoded scratch/worktree paths such as `...-Users-jonathanavni-Documents-Coding-tinyvault...`, but not an unrelated desktop app's `node` helper. The harness shell and all of its descendants are exempt from both rules. Its ancestor chain is exempt only from Rule A because those processes can legitimately carry the harness command text.
- **Rule B, CPU fallback:** every process not in the harness descendant tree, including ancestors, ordinary user browsers, MCP helpers, and other idle daemons, is competing at `pcpu >= 10.0`. Regular Google Chrome, Safari, Arc, Firefox, Microsoft Edge, and their helpers are therefore observed below the threshold. The 10.0 boundary is inclusive and applies per process; it is not aggregate CPU and is not `load1 / cpus`. A 0%-CPU MCP helper remains observed, while the same helper at 10.0% is competing. Codex app-server, broker and sandbox hosts remain under Rule B unless they carry a Rule A task argv.

Every parsed process row must contain a `%CPU` field matching `^\d+(?:\.\d+)?$`; hexadecimal, exponent, signed, and other JavaScript numeric forms are malformed. One malformed row makes the process capture `unparseable` and therefore makes predicate evidence unavailable. macOS `%CPU` is a decaying average over up to a minute, so recent work distributed across several processes that each remain below 10.0% can escape Rule B. The 10.0% bar was chosen operationally after a 1% draft flagged 13 ordinary background processes; it is not statistically calibrated. Each run also records the one-minute load average and `hw.ncpu`, but `load1 / cpus` is report context only and does not affect either rule.

Before freezing the campaign, the owner records a live dry-run inventory: every parsed process row and every competing PID, command and `%CPU`. The freeze record also includes the fixture-test inventory, with at least one 0%-CPU competing witness and its observed counterpart for every Rule A workload family. That inventory is review evidence, not a change to the frozen classifier.

Run the frozen campaign from the same clean commit:

```sh
tools/probe-p-campaign/run.sh --out /absolute/evidence/probe-p-campaign --runs 20
```

If the harness is interrupted, use only:

```sh
tools/probe-p-campaign/run.sh --out /absolute/evidence/probe-p-campaign --runs 20 --resume
```

Resume rechecks every frozen identity field and starts its scan at the first `run-NN` without `ended.json`. It refuses if any label in `startedLabels` has lost its run directory or `started.json`; nothing recreates deleted evidence. An existing incomplete run remains counted and is preserved without retry; later numbers continue in order. An optional `--cooldown-seconds N` must be supplied at creation and identically on resume. Its value is frozen in `campaign.json`.

Immediately before every start, the shell recaptures HEAD and the complete short status. `campaign.mjs start` rechecks those values plus the current harness and policy digests. A mismatch appends `run-NN/refusals/<timestamp>.json` and never writes `started.json`, then exits non-zero. A later `--resume` may use the same label when the run directory contains only `refusals/` and the checks now pass; any other pre-existing content is refused. Refusal attempts are report context (count and reasons), not started runs.

A successful new run directory receives `started.json` before any run evidence. Raw command output and exit status are retained under `raw/`; unavailable host commands do not abort the run. The normalized host state records process-capture status and the best available Playwright/Chromium cache identity. `competing.json` records `ownPid` and `checkoutRoot` with the capture-time verdict. The analyzer accepts predicate evidence only when `host-state.json` exists, capture status is `ok`, the process list is non-empty, and recomputing the frozen predicate from that list exactly matches the recorded verdict. Failed, empty, missing, or disagreeing evidence makes the run invalid, never clean-by-default. The objective competing-job result, complete `make test` log and exit, every available Vitest report, and explicit missing-report inventory are retained. No gate failure is retried.

## Analyze once

After the campaign ends, run the committed analyzer once:

```sh
node tools/probe-p-campaign/analyze.mjs --dir /absolute/evidence/probe-p-campaign
```

It creates `report.json` and `report.md` with exclusive writes and refuses to overwrite either file. Analysis requires `runs === 20`, the exact `run-01` through `run-20` labels, and all 20 labels started. An interrupted run with `started.json` but no `ended.json` remains started and is reported invalid; a label never started makes analysis refuse without writing a report. The analyzer validates every rev 3.1 `timing-2-probes/1` root field, the literal entry list and kinds, finite statistics, exact 500-sample arrays, controls, floor, and the complete typed Holm family record before using a sidecar. It considers only the frozen labels and reports other `run-*` directories as unexpected. Preserve both reports with the campaign evidence.

`--allow-partial` exists only for a disposable campaign frozen by the synthetic `--plan` path and for the harness's synthetic fixtures:

```sh
node tools/probe-p-campaign/analyze.mjs --dir /absolute/disposable-plan --allow-partial
```

A partial analysis is never a campaign result. `run.sh` never invokes the analyzer or passes `--allow-partial`.

## Forbidden

- Replacing, deleting, retrying, or manually excluding a started run.
- Extending beyond 20 started runs or restarting the campaign to improve its result.
- Starting another output directory for the same candidate without new authorization, even after completion.
- Retrying a failed gate and substituting the retry.
- Changing the candidate, predicate, policy note, harness, cooldown, or run count on resume.
- Editing the analysis after run 1 or rerunning it over the same evidence.
- Treating an excluded or incomplete run as absent; it stays in the actual gate-outcome report.
