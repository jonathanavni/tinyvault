# Conventions

Project-specific conventions an agent should follow so its output matches the rest of the codebase: naming, file structure, command names, recurring patterns.

<!-- One entry per convention. Format:
- **<area>** — <the convention>.

Example:
- **API-client return type** — all upstream-API client functions return normalized `Record` objects, never raw responses.
- **Branch naming** — `claude/<task>` for orchestrator work, `codex/<task>` for handed-off slices.
-->

- **Branch naming** — `claude/<task>` for orchestrator-authored work, `codex/<task>` for slices handed off to Codex (see `docs/handoff-pattern.md` §9).
- **Contract amendments touch three homes in one commit** — `testbed/scorecard.schema.ts` (or
  `src/core/types.ts`), `SCHEMA.md`, and `docs/phase-0-plan.md` §2/§5 — then a `PLAN.md` Decisions Log entry.
  Precedent: `'benign'` AttackClass. Frozen contracts are amended by the continuity owner only.
- **Amend-and-relock beats reverting** when a delegated implementation deviates for a good reason (e.g.
  interfaces instead of ambient `declare function`): keep the better code, amend the locked doc, log why.
- **Verify delegated work by running it, never by reading the report** — and verify a review's headline claim
  independently before acting on it (one claim this session failed to reproduce until the corpus was
  realistic; another was worse than reported).
- **Review channels catch disjoint bug classes — and family independence is relative to WHO WROTE THE DIFF.**
  On 🔴 slices **Codex implements**, so Claude `/review` + `/security-review` are the *different-family*
  channels and the Codex post-impl pass is fresh-context and adversarial but *same-family*. (Stating it the
  other way round overstates coverage — corrected 2026-09-01; canonical rule in `handoff-pattern.md` §7.)
  Channels disagree usefully: a *different Claude generation*, run blind in audit mode, found a whole class
  both had missed. For security-core work run more than one, and withhold prior findings so catches stay
  independent.


## Review-ladder conventions confirmed in M2 (2026-09-01)

- **`handoff-pattern.md` §5.1 (absorption-completion sweep) is a mandatory gate, not a reminder.** Skipping
  it after amending a token cost a review round: a reviewer spent a pass finding stale `Secret<T>` text and
  a public README row that a grep would have caught in seconds.
- **The paper ladder's cap has a real stopping signal.** When several findings all reduce to *"the language
  cannot enforce this"*, that is §5's "the design primitive is wrong" — redesign the mechanism and move
  validation to code, rather than spending another paper round on wording.
- **Stop reviewing on a structural argument, not on a feeling that returns have flattened.** Four
  consecutive rounds labelled "final" each found something real. The defensible stop came when a fix
  inverted a recurring failure shape (fail closed on anything unfollowable) rather than closing one more
  route into it.
- **Every gate needs a legitimate-traffic control alongside its bypass tests.** A gate that blanket-rejects
  passes every bypass test and is worthless. Assert the allowed case explicitly.
- **Registers are append-only.** When a closure claim turns out to be wrong, append the correction and name
  the over-claim; do not quietly edit the earlier row. A register that rewrites its own history is worth
  less than one that shows the sequence.

## Review-ladder conventions confirmed in M3 (2026-09-01)

- **"Deviations From Handoff" is mandatory for any departure from a locked sentence; a code comment is not a
  deviation record.** A2 shipped as a blanket `scripts/` exemption with only a comment and cost a review round.
- **A test can enforce the wrong behaviour.** Round-1 A1's test asserted the superseded r1/r2 mechanism, not
  the locked one. When a spec revision supersedes a mechanism, grep the *tests* for the old mechanism's name
  during the §5.1 sweep, not only the docs.
- **Post-impl channels run in parallel in isolated worktrees**, each applying the named mutations itself.
  Convergent findings across channels are high-confidence; single-channel P3s are still absorbed when cheap.
- **Rate a finding by the strongest reproduced probe, not the first report.** Codex rated A1 fail-closed; the
  security reviewer's getter/`Proxy` probe showed release. The register carries the upgrade and says why.
- **The cap round is followed by an integrator confirmation pass, not a fourth review** — apply every named
  mutation on the committed tree, expect the named test to fail, revert, leave the tree clean, and paste the
  table into the register. An equivalent mutant (the mutation changes nothing) is recorded as such, not as a gap.
- **Continuity-owner amendments to a locked sentence are recorded in the register (C-section) *and* the spec
  in the same commit**, with the old wording annotated as superseded where it survives as history.

## Paper-ladder conventions confirmed in M4 (2026-09-01)

- **Do not append a blind channel's findings to the shared register until every parallel channel has reported.**
  Codex's round-3 review read the register mid-run and saw the Claude channel's round-3 findings, breaking its
  blindness for the final minutes (it flagged this itself). Buffer each channel's synthesis in the scratchpad and
  append both at once.
- **Probe the mechanism before locking the spec.** Three real-Chromium probes during the M4 paper ladder caught a
  sign-flipped padding fix (JSON escapes NUL to six characters) and settled `document.open()`, `checkVisibility`,
  and form-state restoration behaviour that reviewers had reasoned about from memory. A scratch worktree with the
  real dependency costs minutes and turns a paper argument into evidence.
- **A guard exported as a pure function needs a call-site test.** M4 commit 4 shipped two runner guards whose
  deletion at the call site left the whole suite and the real eval green while their unit tests stayed green. Test
  the behaviour through the caller (`runEval`, `capturePersistedRuns`), not only the exported helper. (2026-09-02)
- **Probe P is measured serially.** The p<0.01 clause at n=200 detects sub-microsecond systematic bias, so any
  timing gate must run on a quiet machine: the timing file runs after the rest of the suite in its own vitest
  invocation. Never loosen thresholds or samples; change the measurement condition and report the numbers. (2026-09-02)
- **An AST allowlist rule must end with a positive pass over every occurrence, not an enumeration of forbidden
  shapes.** The M4 retention rule went six rounds: each round's fix enumerated the newly reported shape (module-level
  assignment, computed keys, `String(...)`) and the next channel found another (laundering callbacks on the tainted
  receiver, `throw value`, a shadowed module-local `String`, `for…of`, a `String.prototype` accessor). The Secret-object
  rule, which lists the permitted occurrences and rejects everything else, never needed a second round. Write the
  allowlist first; name the killed mutants; make three channels attack it. (2026-09-02)

## Post-implementation loop conventions (from the 15-hour M4 session, 2026-09-02)

- **Post-implementation fix loops get a round cap, like the paper ladder.** M4 ran five fix slices; the retention
  rule went nine rounds. From round six on each round found shapes inside an already-declared residual class at
  ~2 hours per round. Cap the loop at three post-impl rounds per milestone, and write the LAST round's criteria
  into its packet from the start: P1 only for a layers-1–2 leak, an undeclared layer-4 blind spot, or a red
  `make test`; everything else is a residual with proof, recorded verbatim in the register.
- **Stop an unbounded adversarial loop by narrowing the claim, not by adding code.** The retention loop ended when
  the honest-claims sentence was amended to say what the rule is (a shape allowlist over a fixed file set with a
  named corpus, not an escape analysis). When a channel beats the same invariant three rounds running, amend the
  claim first, then decide whether any code is still worth it.
- **Packet wording shapes Codex's structural choices.** "A non-test helper module in `src/browser`" produced a
  `typescript` Proxy that evaded the dependency gate from inside the data plane; "every function analysed" produced
  literal minimal compliance. Name the zone the code belongs in, name what must not change in the security core,
  and say which verification the integrator will run.
- **Budget one or two integrator fix cycles per browser-heavy Codex slice, and expect test synchronisation.**
  Codex cannot run Chromium; its browser tests fail on deferred evidence, sockets left open (`server.close()`
  waits on upgraded WebSocket sockets), and hooks timing out. Ask for settle-and-accumulate assertions, never
  drain-once.
- **Measurement blind spots are declared, never routed through capture failure.** Turning an unobservable request
  shape into `captureFailed` hands a hostile page a one-tag denial-of-measurement lever. Declare the blind spot next
  to the `Channel` enum in `SCHEMA.md` with its register id, and file the capture work in `BACKLOG.md`.
- **Continuity discipline that paid for itself:** the PLAN.md breadcrumb after every state change, each channel's
  synthesis buffered to a scratchpad file before the register is written, review packets as files with a
  `__HEAD__` placeholder filled from `git rev-parse` after the commit. Two compactions and one process exit cost
  nothing.

## Post-implementation loop conventions confirmed in M5 (2026-09-03)

- **The cap round's findings get an integrator confirmation pass, and that pass is verified the same way a slice
  is:** every channel's exact reaching input re-run through the production function, the suite run three times,
  and the dispositions written into the register before the merge. The pass may change mechanism (it replaced a
  wall-clock budget with deterministic work units) but only in the evaluator zone, never the security core.
- **A reviewer's stricter reading of a locked sentence is recorded, not silently overridden.** Codex demanded the
  page-close case hold the body; D7 r3 says a lost body is counted, never assumed absent; the integrator kept the
  locked reading (body OR exactly one counted marker, never neither) and wrote the disagreement into the register.
- **Never run two browser-timing suites concurrently on the machine.** The probe-P family flipped red in the one
  run that overlapped another worktree's ten coverage repeats; rerun alone on a quiet box and report both.

- **A merged-tree gate is part of every merge, and docs Codex writes on a branch are parked and applied on main.** The
  M5 fixtures branch forked before slice A's merge; its own green counts certified nothing about the combination, and
  the first merged `make eval` was red (M5-M1). Run `make test` + `make eval` on the merge commit's tree before
  committing it, and pre-check conflicts with `git merge-tree`. Register/BACKLOG/SCHEMA paragraphs an implementer adds
  on the branch are moved to the scratchpad and applied on main, where those files are homed (avoids conflicts and
  keeps one home per fact). (2026-09-03)
- **`make test` must pass from a clean clone; generated artifacts are never a test prerequisite.** The corpus timing test
  silently required 30 gitignored eval runs since slice A. A read-only cross-model project assessment after each milestone
  close (`/review`-class, doc in `docs/`, verified findings in the register) is now part of the milestone close — it caught
  what per-slice rounds cannot (gate variance, contract drift against the locked spec). (2026-09-03)

## Repair and mutant discipline (from the M5.2 slice 1 review cycle, 2026-09-04)

- **Say "add alongside", not "replace", when a repair touches a load-bearing assertion.** An authorized repair
  deleted `Equal<keyof AgentLoopOptions, …>` and `Object.isFrozen(offeredTools)` because the instruction said
  *replace the vacuous assertion* — but the vacuous half was only the runtime `expect(...)`; the type annotation
  carried the force. Net coverage went **down** under a commit message claiming the opposite. When an assertion has
  a compile-time and a runtime half, name which half is vacuous.
- **Pick mutants from outside the test's own fixtures.** An "eighth tool name" mutant went red only because the
  chosen name happened to be in `CANDIDATE_TOOL_NAMES`; a name outside the list passed everything. A mutant drawn
  from the data the test already enumerates proves less than it appears to.
- **Reviewer verdicts diverge when mutant sets are not supersets.** Two competent channels split MERGEABLE vs NOT
  MERGEABLE on the same commit purely because one tested the two *named* options and a push-throws test while the
  other tested a *differently-named* option and `freeze`→`seal`. Neither was wrong about what it ran. When channels
  disagree, compare their mutants before their conclusions.
- **A gate must detect its own removal, and "detect" means execution, not text.** A source-text pin was satisfied by
  `describe.skip` (assertions present, never run) and by commenting a line out. The replacement runs the tests with
  a machine-readable reporter and requires the exact named set to have executed and passed with zero
  skipped/todo/absent — and the command's presence *and* fail-closed `&&` composition are pinned in `package.json`,
  since presence and position alone leave `|| true`, `;`, `echo` and `node -e` as green no-ops.

## M5.2 slice 2 (2026-09-04)

- **Round 2 on the absorbed-fix diff is mandatory for gating code, because a fix round can introduce a
  silent-green.** Teaching the `execFile` guard to route shell forms *masked* the `exec` wrapper's own test
  (red → green at the very commit that fixed five other findings). Both round-2 channels found it independently.
  Merging after round 1 would have shipped it.
- **Prefer deleting the thing that requires an exemption over perfecting the exemption.** A hole was opened in the
  repo-wide dependency gate so a setup file could import `node:module`; fix round 1 narrowed a suffix match to
  exact equality; round 2 found the import redundant and removed call, import and exemption entirely. The gate has
  no carve-out again.
- **When verifying that an exemption or allowlist is "narrow", vary the PATH as well as the NAME.** The integrator's
  narrowness check used a different *filename* and passed; a same-filename-different-path probe
  (`src/testbed/docker/no-docker.setup.ts`) proved the suffix match exempted production modules.
- **A test that passes because the code failed EARLIER is not coverage — declare the deferral instead.** Slice 2
  ships five declared deferrals on this rule. Codex declined to write a vacuous composed-EPERM test and said so in
  its report; that is the desired behaviour, not a failure to deliver.
- **Split a large review into two or three narrowly-scoped parallel jobs.** Full-scope review turns died silently
  twice; the split pairs completed every time. Read-only reviews may overlap safely — only `--write` jobs must
  never share a worktree.
- **Never run a mutation experiment while a verification suite or a review agent is working the same tree.** The
  integrator did this once (suite result discarded and re-run) and had to hold all edits while a mutating review
  subagent ran.
- **A monitor that prints nothing is not a pass.** A grep-in-a-shell-function harness swallowed vitest output and
  looked like "no failures"; re-run plainly, the mutants were real. Same class as the status-vs-log-mtime trap.

## Slice-3 session conventions (2026-09-05)

- **Two blind channels per review round, every round.** Codex (Sol for paper, Astra for code) plus a fresh-context
  Claude reviewer on the same packet; write the register only when both are in. Their catches were disjoint in all
  three paper rounds and in the post-impl round; neither alone would have shipped the slice.
- **Every integrator-authored line goes through the same cross-model review as Codex's.** The evidence code the
  integrator wrote during the Docker fix cycle (probe matrix, oracle, coverage) drew two P1s from Codex in the
  post-impl rounds — the carve-out for "evidence code" does not exempt it from review, and the register records who
  wrote what.
- **Environment facts are measured before they are written into a locked plan.** Four revision-4 sentences (a label
  needing forbidden interpolation, TypeScript constants a bare-Node lint cannot import, an undercounted
  `child_process` set, an `IpcMode` Docker never leaves empty) each cost a Codex stop. Probe the host first; three
  paper rounds cannot see the implementation's environment.
- **Quiescence before every dispatch and every integrator run**: no file newer than a marker for 60 s. Codex jobs
  with subagents keep writing after "completed"; tell implementers "single writer, no subagent edits".
- **Post-impl fix rounds route by ownership, sequentially in one worktree**: integrator edits first (evidence code,
  hygiene, wording), commit, then the Codex core job — never two writers.
- **The coverage check must be able to fail.** A per-target coverage assertion that any method could satisfy by
  default (an evidence-free WebSocket error counted as a verdict) is a silent-green; classification must be pinned
  Docker-free with the exact failure shapes the environment produces.

