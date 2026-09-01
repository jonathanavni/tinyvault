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
