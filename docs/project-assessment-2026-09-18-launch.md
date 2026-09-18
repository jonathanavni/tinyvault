# Launch assessment — 2026-09-18

The single pre-launch, read-only, cross-model project assessment (user decision 2026-09-18, `PLAN.md`).
Assessed commit: **`5ebe7a9b6a707ad1a02d93a4b8e08a4ee91b5d85`** plus the untracked README draft
`docs/readme-draft-m10.md`. Assessor: Codex **GPT-6 Astra**, fresh session, job `task-mu74ndrs-ehcz76`,
read-only; the working tree was verified unchanged afterwards. Owner: Claude, session `2026-09-18-ship-path-claude`.

## Exact-tree clean-clone gate (owner-run, macOS 15.6.1 arm64, Node 24, default `TMPDIR`)

| Gate, literal `git clone` + `npm ci` + `make browsers` | Result |
|---|---|
| `make test` on `d8dcdb5` | **RED** — 1 of 3,762 failed: T6 in `src/backends/onepasswordProcess.test.ts` compared the adapter's runtime directory as created (`/var/folders/…`) with the fake CLI's canonical `process.cwd()` (`/private/var/…`). Timing suites and the execution check not reached. Preserved, not retried to green. |
| `make test` on `5ebe7a9` (test-only fix) | **PASS** — 3,761 passed, 0 failed, 1 intentional skip (`testbed/runner.eval.test.ts` offline eval entry); timing 5/5 and 26/26; execution check PASS. 15:06:43–15:20:13 UTC. |
| `make test-docker` on `5ebe7a9` | **PASS** — 7/7; entry and execution checks PASS; Docker 29.6.2. 15:20:39–15:38:25 UTC. |
| `make eval-stub` on `5ebe7a9`, no provider key | **PASS** — five scenarios, each 0/10 leaks and 10/10 completed; coverage 10/11 (`screenshot-text` declared); isolation printed as assumed (unverified). 15:38:42–15:41:54 UTC. |

Fix round 1 of 3 for this close. Earlier gates did not see the T6 defect because they ran with a canonical `TMPDIR`.

## Verdict

**READY-WITH-FIXES.** No real credential in the tree or in 467 commits of history; no concrete layers-1–2 leak path;
no further clean-clone defect; the T6 fix does not weaken the invariant; both results tables and both Wilson
intervals in the draft match the recorded E8c result. Every finding is a documentation statement.

## Owner verification and disposition

Each finding was checked by the owner against the cited code before disposition. All ten are **confirmed**.

| ID | Sev. | Finding | Verified against | Disposition |
|---|---|---|---|---|
| F1 | P1 (draft) | "No usernames" is false: local-file forwards the optional `account` hint | `src/backends/localFile.ts:93-102`, `localFile.test.ts:61-68`, `SCHEMA.md:22` | **Fixed in the draft** |
| F2 | P1 (draft) | "Every model-visible byte crosses one seam" overstates MCP: snapshots are `uncaptured()` | `src/supervisor/host.ts:442-443,496-502`, `server.seam.test.ts:86-90` | **Fixed in the draft** |
| F3 | P1 (draft) | `SKILL.md` is not hash-pinned by a test; the gate checks capture consistency only. Owner error, also corrected in the `PLAN.md` Decisions Log | `testbed/sourceInventory.ts:33-38`, `sourceInventory.test.ts:55-61`; current digest `0dc375cd…4652` equals the recorded one | **Fixed in the draft and PLAN** |
| F4 | P1 | `SCHEMA.md:1248` "the eval is offline and deterministic" is false for the default `make eval` | `testbed/evalEntry.ts:11-19`; `SCHEMA.md:196-198` already says it correctly | **Fixed, user-approved 2026-09-18.** The sentence sits in the claim section pinned verbatim, one line per span, by `testbed/parity/claims.test.ts`; SCHEMA span s124 and its pinned copy were edited in lockstep to "offline adjudication of a persisted bundle and the scripted stub are deterministic, and a fresh `make eval` (which needs the provider API and may take different trajectories) lets a third party re-run it and compare". This narrows the claim to what `P-reproducibility` actually tests. Claims and wording tests 186/186, typecheck clean; full gate rerun at M10 close |
| F5 | P1 (draft) | A retry on the filled control returns `locked-field` before the handle reservation, not `handle-exhausted` | `src/core/fillService.ts:174-183`, `fillService.browser.test.ts:317-323` | **Fixed in the draft** |
| F6 | P2 | Draft omits host prerequisites: Linux Chromium libraries, `/bin/ps`, executable `TMPDIR` | `package.json:9`, `onepassword.testSupport.ts:116-119`, `README.md:148` | **Fixed in the draft** |
| F7 | P2 | Stale status: `README.md:69,116`; `SCHEMA.md:202` (D-CANCEL "OPEN"); `SCHEMA.md:651-664` (old V1 wording); "Next" lines | `SCHEMA.md:163`, `docs/phase-0-plan.md:562`, Entry156/157 | **SCHEMA fixed** (outside the pinned section; claims and wording tests 186/186). README lines die with the README swap. "Next" lines updated at M10 |
| F8 | P2 | Limitations omit that tasks supply selectors, username and recovery URL | `SCHEMA.md:143-148`, `src/agents/reference.ts:21-47` | **Fixed in the draft** |
| F9 | P2 | Unsupported generalizations ("as most agent setups do today"; "WebMCP has no credential story") | positioning text only | **Fixed in the draft**: first deleted; WebMCP premise softened, positioning line kept (user asked for it) |
| F10 | P3 | `/Users/jonathanavni` paths in 21 tracked files (134 occurrences, mostly registers) and the author email in commit metadata | `git grep` | **Accepted, user decision 2026-09-18.** Paths stay. The author address is already public on every sampled commit of the owner's 11 other public repositories (checked via the GitHub API), so a history rewrite would break ~280 cited SHAs and the `PFc7eGp2` provenance for no privacy gain. No rewrite |

## Raw report (verbatim)

```text
VERDICT: READY-WITH-FIXES — I found no real credential, concrete layers-1–2 leak path, or new clean-clone test defect, but the public documentation needs the specific corrections below.

FINDINGS:

File references are relative to /Users/jonathanavni/Documents/Coding/tinyvault. Confirmed main at 5ebe7a9b6a707ad1a02d93a4b8e08a4ee91b5d85; the working-tree state remained unchanged.

F1 — P1 — docs/readme-draft-m10.md:74
“No usernames” is not true across both backends. Local-file listItems returns the optional account field unchanged (src/backends/localFile.ts:93–102); its test explicitly expects account: "person@example.com" (src/backends/localFile.test.ts:61–68). The fill service and MCP adapter forward that inventory.
Smallest fix: “Opaque handles, configured labels, kind and availability; local-file may also expose an operator-provided account hint. No credential values or provider-derived 1Password metadata.”

F2 — P1 — docs/readme-draft-m10.md:94–95
“Every model-visible byte crosses one seam that the testbed scans” overstates MCP coverage. Snapshots deliberately use uncaptured() (src/supervisor/host.ts:442–443,496–502). The MCP test explicitly returns a canary in a snapshot while the tripwire verdict remains pass (src/adapters/mcp/server.seam.test.ts:86–90). Adapter envelopes also sit outside that capture seam (SCHEMA.md:554–555). The evaluated agent loop separately captures tool results, including snapshots (src/agents/loop.ts:422–441).
Smallest fix: “The evaluated agent loop records tool results and snapshots for offline scanning. MCP shares the fill gate and host wrappers, but snapshots and adapter envelopes are outside the host tripwire capture seam.”

F3 — P1 — docs/readme-draft-m10.md:98
“Hash-pinned by the test gate” incorrectly implies the gate enforces the historical SKILL.md digest. The code hashes the current file and checks capture consistency (testbed/sourceInventory.ts:33–38,58–69). Tests enforce exact use and byte budgets, while the source-inventory test deliberately accepts changed instruction bytes and verifies changed provenance (src/agents/prompt.test.ts:16–49; testbed/sourceInventory.test.ts:55–61). I found no executable assertion pinning the historical digest.
Smallest fix: replace that phrase with “513 bytes, with its SHA-256 recorded in the cohort provenance.” The current file does match the recorded digest, 0dc375cda450b89e4d1c8335ebedfa2dc8c791923913bb58066dadf614724652. Leave SKILL.md unchanged.

F4 — P1 — SCHEMA.md:1248
“The eval is offline and deterministic” is false for the default make eval. It selects real-comparison, requires ANTHROPIC_API_KEY and constructs the provider client (testbed/evalEntry.ts:11–19). SCHEMA.md:196–198 itself correctly distinguishes deterministic replay from statistical live sampling.
Smallest fix: “Offline adjudication of fixed evidence and the scripted stub are deterministic. Fresh make eval runs require the provider API and may produce different trajectories.”

F5 — P1 — docs/readme-draft-m10.md:83
The universal second-fill refusal reason is incorrect, although the one-successful-fill boundary holds in the inspected path. A retry on the already locked control returns locked-field before reaching the handle reservation (src/core/fillService.ts:174–183); the browser test explicitly expects this after a successful fill (src/core/fillService.browser.test.ts:317–323).
Smallest fix: “A consumed handle cannot obtain another injection. An otherwise admissible attempt on a fresh control returns handle-exhausted; earlier validation or lockdown checks may return another fixed refusal.”

F6 — P2 — docs/readme-draft-m10.md:50–58
The replacement README omits host prerequisites relevant to clean-clone use. make browsers only runs “playwright install chromium” (package.json:9); Linux system dependencies require the separate dependency-install path, confirmed in the installed Playwright implementation (node_modules/playwright-core/lib/coreBundle.js:69396). Fake-CLI tests also execute files created beneath TMPDIR (src/backends/onepassword.testSupport.ts:63,118–119), which fails on a noexec temporary filesystem. The current README’s /bin/ps requirement at README.md:148 is absent from the draft.
Smallest fix: add: “On supported Linux systems, install Chromium’s system dependencies with npx playwright install-deps chromium. The default test gate requires /bin/ps with -axo pid=,ppid=,comm= and an executable temporary directory; use TMPDIR pointing to an executable filesystem if necessary.”

F7 — P2 — README.md:69,116; SCHEMA.md:202,651–664
Current-status text contradicts recorded completion and the narrowed shipping scope:
- README.md:69 says the M7 scenarios have “stub-harness results only,” immediately before describing their live cohorts.
- README.md:116 calls MCP acceptance pending, whereas README.md:53 records completion.
- SCHEMA.md:202 still calls D-CANCEL open, while SCHEMA.md:163 and docs/phase-0-plan.md:562 record its resolution.
- SCHEMA.md:651–664 retains the older V1/acceptance requirements without stating the narrowed claim and completed macOS smoke.
Smallest fix: remove the obsolete README phrases; mark D-CANCEL resolved while retaining its settlement limitations; replace the M9 qualification paragraph with the narrowed offline-plus-macOS-smoke wording and explicit Linux/expiry/denial-format limitations. Update the “Next” sequences at docs/phase-0-plan.md:565 and PROJECT-SPEC.md:143 to distinguish the completed smoke and owner-reported clean-clone gates from remaining M10 work.

F8 — P2 — docs/readme-draft-m10.md:148–149
The measurement limitation omits that these are supplied-selector and supplied-recovery tasks. Both profiles receive the username, selectors, start URL and recovery URL; this is explicitly distinguished from general selector discovery and autonomous recovery in SCHEMA.md:143–148 and implemented by src/agents/reference.ts:21–47.
Smallest fix: add: “Tasks supply the username, control selectors and recovery URL; this does not measure general selector discovery or autonomous recovery.”

F9 — P2 — docs/readme-draft-m10.md:20–21,184–185
The repository does not substantiate the external generalizations “as most agent setups do today” or “WebMCP has no credential story.” Project positioning text is not independent evidence of ecosystem prevalence or another standard’s current capabilities. Network verification was prohibited.
Smallest fix: delete “as most agent setups do today”; replace the WebMCP assertion with “TinyVault is intended to complement tools used in authenticated browser sessions. WebMCP hostile fixtures are planned, not part of v0.1.”

F10 — P3 — .claude/memory/gotchas_codex.md:9; tools/probe-p-campaign/predicate.test.ts:5–6; Git commit metadata
The tracked tree/history contains /Users/jonathanavni and owner-specific scratch paths. Git author/committer metadata exposes Jonathan Avni <yoniavni@gmail.com>. These are personal identifiers, not credentials. The test paths are synthetic inputs rather than dependencies on those directories.
Smallest tree edit: replace illustrative owner-specific paths with neutral examples. Editing current files will not remove identifiers from existing history.

Assessment coverage, in the requested question order:

1. Public-flip hygiene: no real secret found. I scanned all 2,531 unique blobs reachable through all local refs, covering 467 commits, and inspected candidate matches. Checks included recognizable provider tokens, private-key markers, JWTs, secret assignments, 1Password ID/Secret Key patterns, high-entropy quoted strings, sensitive filenames, emails and personal paths. Matches were synthetic values, placeholders, ordinary identifiers, or noncredential protocol correlation IDs. No account-specific 1Password hostname or plausible real vault/item/account ID was found. F10 covers the personal identifiers.

2. Trust-boundary spot check: none found beyond the documentation inaccuracies above. The inspected paths construct fixed results/errors, discard CLI stderr, and project configured 1Password metadata rather than provider fields (src/adapters/mcp/tools.ts:37–49; src/supervisor/host.ts:471–492; src/backends/onepasswordProcess.ts:188–191; src/backends/onepassword.ts:74–87). Origin admission is checked before secret resolution and again inside the isolated-world assignment (src/core/fillService.ts:145–158; src/browser/inRealm.ts:96–119). The synchronous handle reservation prevents competing fills; successful or ambiguous transport outcomes consume it (src/supervisor/fillAuthorizationDomain.ts:20–47; src/core/fillService.ts:226–229). Snapshot masking and locked typing are implemented at src/browser/inRealm.ts:173–186 and src/browser/session.ts:630–665. I did not find a model-accessible renewal route.

3. Claims versus evidence:
- Both results tables match docs/m7-review-findings.md:1252–1264: reference 0/50 leaks and 50/50 completed; baseline 50/50 leaks and 48/50 completed; every per-scenario row agrees.
- Cohort, commit, model, temperature and preregistration are supported by docs/m7-e8c-live-cohort-preregistration.md:46–51,310–317.
- Wilson arithmetic is correct: 50/50 gives 92.86524–100%; 0/50 gives 0–7.13476%. These round to the draft’s intervals. They are pooled intervals across heterogeneous fixtures.
- The E8b failure narrative is supported. E8c observed handle-exhausted in eight fake-reauth runs; two stopped after unsuccessful selector probes. No second injection was obtained (docs/m7-review-findings.md:1264,1270).
- Origin pinning, verified password controls, provenance masking, locked typing and fixed backend-error handling are supported by the code cited under question 2. Tool-description corrections are F1, F2 and F5.
- Reproduction defaults, stub behavior and assumed Docker isolation match testbed/evalEntry.ts:11–31 and package.json:9–14, subject to F6.
- MCP’s nine tools, protocol versions, checkout requirement and absent cohort qualification agree with src/adapters/mcp/tools.ts:16–19 and SCHEMA.md:494,559–608.
- The narrowed 1Password wording is supported by Entry157 and docs/onepassword-setup.md:297–312 as operator-reported evidence. Remove the draft’s obsolete PENDING smoke wording.
- The listed capture, restart, authorized-origin, archive and timing limitations agree with SCHEMA.md and the inspected implementation. Coverage is explicitly ten instrumented channels plus screenshot-text (testbed/coverage.ts:3–21).
- Meta-gating and offline recomputation are implemented (testbed/runner.ts:119–121,173–210; testbed/checkers/offline.ts:317–370). Their guarantee remains bounded by trusted capture and the declared measurement limits.
- SKILL wording, task scope and external positioning need F3, F8 and F9. The planned MIT file remains intentionally absent.

4. Commit 5ebe7a9: no weakening found. T6 now compares the canonical parent plus unchanged runtime-directory basename with the child’s cwd, while still requiring --config, HOME, OP_CONFIG_DIR and TMPDIR to name the same directory (src/backends/onepasswordProcess.test.ts:70–98). Canonicalizing the parent is appropriate because cleanup has already removed the leaf. Runtime creation remains mkdtemp plus chmod 0700, also covered by structural assertions (src/backends/onepasswordProcess.ts:91–117; src/backends/onepassword.structure.test.ts:728–732). No additional equivalent raw-path-versus-canonical-cwd assertion was found in the searches and related tests inspected.

5. Clean-clone portability: no additional concrete defect found beyond F6. I inspected package/Make targets, gate configuration, source inventory, generated-result handling and subprocess fixtures. No runtime dependency on the owner’s absolute home path or pre-existing eval artifacts was found. The supplied macOS gate results remain owner evidence, not checks I ran.

6. First-reader status: F4 and F7 identify the contradictions found. The setup document accurately states the narrowed smoke result and limitations. PROJECT-SPEC.md:141 explicitly labels its older checkboxes unreconciled, so their unchecked state is not itself a false completion claim.

NOT READ:

I did not inspect ignored raw cohort archives, owner gate logs, private smoke transcripts, unreachable/dangling Git objects, or remote-only history. Historical secret scanning was automated, not a line-by-line semantic review of every revision. M9 narrative reading was limited to Entry156 and Entry157; PLAN-archive.md was not bulk-read. Source/tests outside the named paths and targeted searches were not exhaustively audited. No tests, browser sessions, Docker commands, provider calls or network checks were run.

DEVIATIONS:

Initial read-only commands caused Apple’s Git launcher to attempt temporary cache creation and zsh to attempt temporary backing for a heredoc; the sandbox denied both. I switched to the direct Git binary and python -c. No files were created or changed, and no other prohibited action was taken.
```
