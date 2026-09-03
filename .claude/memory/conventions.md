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

