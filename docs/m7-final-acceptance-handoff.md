# M7 final-acceptance handoff (execution-ready; written at the 2026-09-10 wrapup of session `2026-09-10-m7-packets`)

**Purpose.** A fresh Claude Code session finishes M7's acceptance work under the user's decisions of 2026-09-10 (recorded
verbatim in substance in §2) and returns the final candidate for **merge approval**. Nothing here re-opens a settled paper
review, an accepted decision, or a locked contract beyond the one amendment authorized in §2.2. Owner: Claude
(continuity). Implementer for the one code amendment: Codex `gpt-6-astra` (gate-adjacent, locked constant).

## 1. State to verify first (read-only)

- **Integration checkout:** `/Users/jonathanavni/Documents/Coding/tinyvault`, branch `main`. Expected `main` tip: the
  wrapup commit that added this file (its parent is `4181914`, "M7 implementation cycle recorded"). `origin/main` = `ca43cd9`;
  **everything after is local and unpushed; no push is authorized.** Working tree must be clean apart from untracked
  `artifacts/`, `.vitest/` (both gitignored).
- **Candidate:** branch `codex/m7-fixtures` at **`9a826e5`** (merge base with main `8c871e0`; code identical to `07030b6`,
  the main tip after the inventory-pin merge `c49e9ad`). Commits on the branch, oldest first: `d0572d7` (Astra delivery),
  `10173bd` (owner: helper asserts with `node:assert`), `1fa29bc` (owner: qualification comparison minus `outcome`; the D-6
  byte pin 519 → 513), `0980452` (Astra fix round 1: control-token rebinding + five inventory pins), `828c769` (owner: E5
  selector), `9a826e5` (owner: five carve-outs — `compose.boundaries.test.ts` history loop `[0..4]`,
  `composed.docker.test.ts` `extraPort = 47160`, `secret-echo/index.html` derived emitted count, `m7.browser.testkit.ts`
  failure surfacing, `scenarioCoverage.ts` join guard). **No uncommitted changes on the branch.**
- **Worktree (may not exist in a new session; it lived in the previous session's scratchpad):**
  `/private/tmp/claude-501/-Users-jonathanavni-Documents-Coding-tinyvault/da8683f6-249d-4dab-b398-22226211e70e/scratchpad/wt/m7-fixtures`,
  with a `node_modules` **symlink** to the integration checkout. If absent, recreate: `git worktree add <path> codex/m7-fixtures`
  and `ln -s /Users/jonathanavni/Documents/Coding/tinyvault/node_modules <path>/node_modules`. **A symlinked-`node_modules`
  worktree cannot run the owner `make test`** (provenance suites red on the symlink); Codex works there, **owner gates run in the
  integration checkout detached at the candidate** (`git checkout --detach <sha>`; return with `git checkout main`).
- **Merged and closed:** `codex/timing2-inventory-pin` (merged `c49e9ad`; the branch may be deleted). No Codex jobs, agents,
  monitors or campaigns are running. Docker Desktop was up at the end of the session.
- **Governing contracts (read before acting):** `docs/m7-implementation-packet.md` v4 (§11 user decisions D-2..D-6, O-3,
  O-M7-1; §12 dispositions), `docs/m7-slice-spec.md` rev 4, the register `docs/m7-review-findings.md` (entries from
  "Paper round 1 …" through "M7 implementation — delivery … RETURNED TO THE USER BEFORE MERGE"), and `PLAN.md` Decisions
  Log 2026-09-10. Evidence: `artifacts/review-evidence/tinyvault-m7-packets-20260910/` (§6).

## 2. The user's decisions (2026-09-10) — binding

1. **Probe P.** Preserve the rejection on `828c769` and its complete evidence (`timing-2-828c769-RED.json`,
   `timing-2-probes-828c769-RED.json`). **No additional timing-only runs.** The later candidate's green result does not clear
   the earlier rejection; the existing policy (v2.1) and D-1 diagnostic limitations stand.
2. **Docker — scoped amendment authorized:** introduce a **240-second per-export deadline**, rationale the measured ≈146 s
   per export at 965 close-time secrets (3 MB/s through the two scanners; `diag-docker-export-9a826e5.log`, the register entry).
   **Keep every other command deadline unchanged** (`COMMAND_TIMEOUT_MS = 120_000` for everything except the export bound);
   **retain both scans** (the closer's `scanStreamWithControls` and the evidence observer's `StreamSecretScanner`); **preserve
   all secrets, controls and the budget-fill coverage** (no test-shape change to reduce the secret inventory). **Reconcile the
   locked contract and affected timeout assertions explicitly** (§3.2). **Verify that timeout, incomplete-scan and cleanup
   paths still fail closed.** Scanner optimization is separate work (BACKLOG).
3. **D-6.** The narrow live `SKILL.md` byte-pin correction `519 → 513` at `testbed/agentEvidenceBudget.test.ts:302` (commit
   `1fa29bc`) is **accepted**. The six archived rows and their historical interpretation are preserved; this does **not**
   recertify them under the new evaluated configuration.
4. **Owner mutants.** Run the E3/E6/E7 table **now on the committed candidate** (§3.1); it need not wait for the Docker fix.
   Record which intended assertion rejects each mutant. Revalidate affected witnesses if later changes touch them.
5. **Final acceptance.** Obtain focused review of the Docker amendment and of any final owner fixes not already reviewed on
   their committed form (§3.3). Then complete the prescribed gates on the **exact final candidate**, including **Docker 7/7**,
   preserving every failure (§3.4). Return the candidate SHA, review dispositions, mutant table and gate evidence for merge
   approval (§3.5).

**Boundaries (absolute):** no merge, no push, no timing campaign or timing-only runs, no live-provider spend, no public flip.
Stub results remain separate from live qualification (E8b is separately authorized and not part of this work).

## 3. Remaining work, in order

### 3.1 Owner mutant table on `9a826e5` (real checkout, detached; quiet host; no other browser suite concurrently)
For each row: apply the mutation to the checked-out candidate, run the named file (`npx vitest run <file> -t "<title>"`),
expect red **at the intended assertion**, restore with `git checkout -- <file>`, verify `git status` clean, record
`mutant | intended assertion | observed failure message | restored green` in the register. A mutant that reds elsewhere
than intended is recorded as such (an equivalent or mis-targeted mutant is a finding, not a pass).

| # | Witness | Mutation (file) | Intended rejecting assertion |
|---|---|---|---|
| 1 | E3 `/support` | delete the support form (`testbed/fixtures/secret-echo/index.html`) | `m7.hostile.browser.test.ts` `/support` test: the exact finalized `network-body` decoy event is absent (`assertDecoyBody`) |
| 2 | E3 `/confirm` | delete the confirm form | same shape for `/confirm` |
| 3 | E3 `/q` | delete the query control | outbound canary-bearing `url` event absent |
| 4 | E3 console | delete the one-event console writer control | canary-bearing page-console `log` event absent |
| 5 | E3 `/reverify` | delete the re-auth form (`testbed/fixtures/fake-reauth/index.html`) | exact run-bound `/reverify` `network-body` absent |
| 6 | E5 browser | remove `snapshot('success')` from `loginActions()` (`testbed/m7.browser.testkit.ts`) | persisted `/success` snapshot / exposure assertion |
| 7 | E5 browser | remove the model turn after the snapshot (the `close` action) | actual `sdk-request-context` witness absent |
| 8 | E6 | delete the scripted re-auth fill action (`m7.hostile.browser.test.ts` O3 test) | `fills` length 2 / second `dom-fill` `unauthorized-sink` |
| 9 | E7 | delete the post-cap canary `console.log(#password.value)` (`secret-echo/index.html`) | the test-only observer's last-emission-carries-canary assertion (`m7.diagnostics.browser.test.ts`) |
| 10 | E7 | delete the flood loop | flood count / retained count / budget-marker assertions |
| 11 | run-id propagation | delete the `sessionStorage` write or read (`fake-reauth/index.html:28-36`) | `input[name=runId]` equals the run id; `/reverify` body binding |

The diagnostic's DOM count (witness (i)) is now derived (`9a826e5`); mutant 10 must also red the
`'Diagnostic emitted: 1051'` assertion. Both reviewers derived these kills by reading; nobody has executed them yet.

### 3.2 Docker amendment (Astra packet, small; then §3.3 review)
- **Code:** `testbed/docker/exec.ts` gains `EXPORT_TIMEOUT_MS = 240_000` beside `COMMAND_TIMEOUT_MS`; `testbed/docker/compose.ts`
  `#export` uses it for its single `bounded(...)`; nothing else changes its bound. Both scans stay. Kill/cleanup on timeout
  unchanged (`ctx.registry.kill(handle)`, stream destroys, marker destroy).
- **Reconcile explicitly (grep first, then list every hit in the packet):** `COMMAND_TIMEOUT_MS`, `120_000`, `120000`,
  `command-timeout`, "120 s" across `testbed/docker/**`, `scripts/**`, `SCHEMA.md`, `docs/phase-0-plan.md`,
  `docs/m5-2-slice-4-plan.md`, `docs/m5-2-claim-evidence.md`, `testbed/parity/claims.ts` (any row whose mutation sites or
  boundary text name the command bound), and the fake-clock timeout tests (`testbed/docker/compose.test.ts`,
  `exec.test.ts`, `compose.boundaries.test.ts`, `slice4.acceptance.test.ts`). Where a contract sentence states the
  bound, amend it in the same commit with the rationale (amend-and-relock; conventions: contract amendments touch their
  homes in one commit).
- **Fail-closed proofs (fake clock, Node-only):** export exceeding 240 s → `command-timeout` with the child killed and streams
  destroyed; export stream ending without the `EXPORT_MARKER` or with a partial/aborted stream → `scan-failed`; a secret in
  the export → `secret-exposed`; the other commands still bound at 120 s (a mutant that raises a non-export bound must red).
- **Rationale text to record:** the measured 763 s deterministic failure (five × 120 s kills), the 965-secret close-time
  inventory, the scanner throughput table (96 → 35 MB/s; 579 → 6 MB/s ≈ 85 s; 965 → 3 MB/s ≈ 146 s per export through two
  scanners), the pin candidate's green 7/7 at three fixtures. BACKLOG: scanner sublinear in the secret count (separate work).

### 3.3 Focused reviews on committed form
- Range **`828c769..<final>`** must be reviewed: it contains the five `9a826e5` owner carve-outs (never reviewed on committed
  form) and the Docker amendment. Channels: Codex adversarial (`adversarial-review --base 828c769 --scope branch`, defensive
  framing) + a blind fresh-context Claude QA review; re-run the security review only if fixture page or witness content
  changed beyond `9a826e5`'s derived count (the derived count itself should be covered by the QA review). Dispatch reviews
  **only when no gate is running**, and never run a gate while reviews are running (the 2026-09-10 Docker timeout was first
  misattributed to that overlap).
- Fix loops stay capped at three post-implementation rounds for M7 (two owner-fix commits and one Astra fix round have been
  used on this candidate; a further Astra round on the amendment counts).

### 3.4 Final gates on the exact final candidate (real checkout, detached; quiet host; preserve every log and report)
`make test` (record the actual verdicts of all three partitions; a Probe P rejection is recorded, never rerun),
`make test-docker` **7/7**, `make eval-stub` (E4 rows, five scenarios). Preserve `.vitest/*.json` per run into the evidence
dir. If the final candidate differs from `9a826e5` in any file a mutant of §3.1 touches, re-run those mutants.

### 3.5 Return for merge approval
Candidate SHA; review dispositions (Codex, QA, security); the mutant table; gate evidence paths; residuals (§5) and
deviations (§4). **Do not merge.** After approval, E10 owner integration applies at merge time: README/ORIENT/SCHEMA/
phase-plan sentences (five scenarios, four hostile cells, E8b pending), BACKLOG closures, Decisions Log, the register.

## 4. Deviations already recorded (do not re-litigate)
Extension 1 (O-M7-1, page-side echo of the authorized fill), Extension 2 (`P-finalize` selectors), the D-6 byte pin
(accepted), owner carve-outs (`10173bd`, `1fa29bc`, `828c769`, `9a826e5`), `/log-sink` hosting the console writer, the
Docker amendment of §2.2 once landed.

## 5. Accepted residuals
The `828c769` Probe P rejection (recorded, unadjudicated); D-2 (`P-LIM-CHUNKED` declared, page probe out); O8 (console budget as
a qualification reason — separate checker amendment); `/log-sink` serving a second tokened `#password` (same origin/run/token);
the labelled synthetic M7 schedules in a mixed `s5Witnesses()` corpus; no negative `sessionStorage` test; E8a is bytes only
(max row 1012, 12 bytes headroom); the three earlier scenarios not re-evaluated under the new `SKILL.md` (E8b); docs still
describe three scenarios until E10; `createThreeFixturePersistedEval` name; export-scan throughput linear in secrets (the
240 s deadline is a capacity accommodation, not a fix).

## 6. Evidence (all under `artifacts/review-evidence/tinyvault-m7-packets-20260910/` unless noted; the directory is gitignored)
Packets and wrappers: `packet-m7-astra-dispatch.md`, `packet-m7-astra-extension-{1,2}.md`, `packet-m7-astra-fix-r1.md`;
Astra reports `packet-m7-astra-report-{1,2,3}.md`, `packet-m7-astra-fix-r1-report.md`. Reviews: `review-m7-impl-focus.md`,
`review-m7-impl-codex-r1-report.md`, `review-m7-impl-opus-r1-report.md`, `review-m7-impl-security-r1-report.md`. Owner
dispositions: `owner-dispositions-m7-impl.md`, `owner-dispositions-pin-impl.md`. Gates: `owner-gate-m7-make-test-{d0572d7,10173bd,0980452,828c769}.log`,
`owner-gate-m7-failures-10173bd.md`, `owner-gate-m7-docker-evalstub-828c769.log`, `owner-gates-m7-9a826e5.log`,
`diag-docker-export-9a826e5.log`; reports `main-828c769.json`, `timing-1-828c769.json`, **`timing-2-828c769-RED.json`,
`timing-2-probes-828c769-RED.json`** (the preserved Probe P rejection), `docker-828c769.json`, `docker-9a826e5.json`,
`eval-stub-828c769.json`, `eval-stub-scorecard-828c769.json`, `{main,timing-1,timing-2,timing-2-probes}-9a826e5.json`.
Pin slice: `packet-pin-astra-*.md`, `review-pin-impl-*.md`, `owner-gate*-c49e9ad.log`, `owner-gates-pin-4229d66.log`,
`timing-2-green-20260910-0241.json` (also at `~/Documents/Coding/tinyvault-evidence/m7-packets-20260910/`).
