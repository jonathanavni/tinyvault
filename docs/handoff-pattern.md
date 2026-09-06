# Claude + Codex Handoff Pattern

The canonical reference for session ownership, implementation handoffs, and independent review.
Read §0 to choose the session mode, then the relevant ladder and packet sections.

> The pattern is model-agnostic. "Claude" and "Codex" are the two families this repo is wired for, but the roles matter more than the brands — you could run the orchestrator on one frontier model and the adversary on another (Gemini, GLM, etc.). What makes it work is that the model reviewing or attacking the code is a *different family* than the one that wrote it.

Companion essay: [Two Models Today, Meta-Harnesses Tomorrow](https://jonathanavni.com/blog/two-models-today-meta-harnesses-tomorrow).

---

## Purpose

This repo supports Claude-led and Codex-led sessions using the same `PLAN.md`, contracts, review
registers, and `.claude/memory/*`. The agent where the user starts the session leads the agreed work;
an explicit delegation or ownership handover takes precedence.

**Sections 1–13 retain the existing Claude-led flow.** For a direct Codex-led session, §0 supplies
the ownership and dispatch mapping. Only those role assignments change: the contracts, review
independence, round caps, evidence requirements, and reporting formats remain in force. In particular,
§8's state-writing ban applies to a **delegated Codex worker**, not the Codex continuity owner.

Claude continues to dispatch Codex through the [OpenAI Codex plugin](https://github.com/openai/codex-plugin-cc).
Direct Codex sessions use `AGENTS.md` and the project skills; they do not need Claude to dispatch them.

---

## 0. Session Entry and Ownership

| Entry | Continuity owner | Other agents |
|---|---|---|
| User starts in Claude Code | Claude Code | Codex receives bounded packets via the existing ladder |
| User starts directly in Codex with GPT-6 Astra selected | Codex GPT-6 Astra | Claude supplies independent review; Codex workers receive bounded packets as useful |
| An orchestrator dispatches an implementation or review packet | The dispatching orchestrator | Recipient remains a worker, regardless of app or model |
| Existing session resumes or compacts | Its existing owner | No implicit transfer |

Explicit user scope and handoffs win. A quoted `/start` inside a packet is not a new session.
Neither a second window nor a model switch grants concurrent ownership of project state.

### One writer and handover

`PLAN.md` remains the shared continuity record, including for Codex. The `.claude/memory/` name
is historical; its project topics are shared. Do not create a second plan, decisions log, or Codex
memory directory. Keep roadmap changes in `PROJECT-SPEC.md`, review-method policy here, and
milestone-specific gates in `phase-0-plan.md`. Registers remain append-only.

At kickoff, read Current State and inspect `git status`, HEAD, branch, and `git worktree list`.
Identify the integration checkout that holds shared project state; a worker's branch copy of
`PLAN.md` may be stale. Read that checkout's Current State before claiming or transferring ownership.
An in-progress focus stamp predating this protocol is still evidence of work in flight, not a vacant slot.

Once direction is agreed, extend the existing focus stamp with a compact owner checkpoint:

```text
`YYYY-MM-DD-<session>` — focus: <scope>; owner: codex|claude; state: active;
state checkout: <absolute integration-checkout path>; worktree: <absolute task-worktree path>
```

Use the actual owner value and a stable session identifier. Add the current branch/HEAD and
outstanding worker jobs to the surrounding state when they matter. This is a coordination convention,
not an atomic lock: only one orchestrator writes shared state, and agents do not edit the same worktree
concurrently. Workers return reports; the owner records dispositions.

If another owner is active or its status is uncertain, orient read-only and surface the overlap before
conflicting writes. Continue only independently authorized work that does not overlap it. Do not infer
abandonment from elapsed time. A handover records completed work, dirty files, pinned refs, pending jobs,
verification, next action, and the receiving owner; the old owner stops writing before the receiver starts.
Obtain the user's direction when a live handover cannot be established. Do not adopt or cancel another
session's jobs automatically. Re-check this checkpoint after compaction and before integration or wrapup.

On wrapup, mark the session `closed` when relinquishing continuity; use `paused` if work is interrupted
without a handover. Paused ownership also needs explicit resolution before another writer takes over.
Record remaining work and running jobs either way. Do not mark another owner's session closed.

### Codex kickoff

Select GPT-6 Astra in the client, open the TinyVault checkout, and select **tinyvault-start** from the
skill picker. In Codex CLI/IDE, use `$tinyvault-start` or `/skills`. Plain “start the TinyVault session”
also routes through `AGENTS.md`. `/start` is supported as a message alias when the client sends it to
the agent; this repo does not register a built-in Codex slash command.

1. Establish owner versus worker from the request and checkpoint. Read `AGENTS.md`, `CLAUDE.md`,
   `PLAN.md` Current State, the project-memory index, and the governing spec/plan for the current slice.
   Load relevant topics and findings, not the full session history.
2. Inspect working state and ownership as above. Report dirty files, blockers, and known active jobs;
   do not silently switch branches, clean a worktree, or resume a job.
3. Present roughly ten lines: owner/mode, milestone, shipped/in-progress work, blockers, and recommended
   next steps. **Kickoff alone is read-only**; wait for direction. If the user already supplied a concrete
   task, use that authorization without asking them to repeat it, subject to the ownership check.
4. When work is agreed, record the owner checkpoint and drive it through the ladder below. A delegated
   worker instead follows its packet and returns results to its orchestrator; it does not stamp `PLAN.md`.

### Codex-led ladder

This maps §§2, 4, 6, 8, and 11's continuity duties to Astra for a direct Codex session. Claude's native
commands and plugin-dispatch instructions remain specific to Claude-led sessions.

1. **Astra plans and synthesizes:** turn the agreed goal into bounded slices and acceptance evidence;
   preserve the existing locked spec and completed reviews. Do not restart an in-flight ladder or reset
   its round count on handover. Surface changes to locked contracts for explicit disposition.
2. **Independent paper review before high-risk implementation:** send the plan and exact contract to
   a fresh Claude reviewer. Keep additional paper channels required by the slice; for blind parallel
   reviews, withhold the other reviewers' findings until synthesis. Astra records dispositions and the lock.
3. **Astra implements:** use a bounded, fresh-context Codex implementation worker where available and
   warranted; a small agreed slice may be implemented in the owner session. Give workers explicit file
   ownership, base/head, no-touch boundaries, tests, and a return format. Do not have two writers implement
   the same slice. A worker is not an independent reviewer of its own implementation.
4. **Review the exact candidate:** retain fresh Claude QA, a separate security-specialized channel where
   §7.1 requires it, and a fresh-context Codex adversarial pass. Relative to Astra-authored code, Claude is
   cross-family; Astra/Sol review is same-family. The owner rereading its own code counts as neither a fresh
   review nor a substitute for a required channel. Use the mandated round-2/round-3 fix review and caps (§5).
5. **Astra integrates and preserves continuity:** adjudicate findings under §6, run the required candidate,
   merged-tree and clean-clone checks at the stages the active contract requires, and record exact evidence.
   Coordinate browser timing suites serially across the machine. Attempt checks allowed in the current
   environment; old Codex sandbox failures do not establish present capability. Report blocked/unrun checks
   separately. Commit, merge, push, or release only within the user's authorization; owner status grants no
   additional permissions. Update shared state and append-only registers after the relevant evidence exists.

Lower-risk work may use the existing reduced ladder. Owner-side model choice stays under the user's
control; use the existing stakes-based routing for delegated jobs when the dispatcher supports it.

**Dispatch to Claude:** use [tinyvault-claude-review](../.agents/skills/tinyvault-claude-review/SKILL.md),
backed by [`scripts/claude-review.mjs`](../scripts/claude-review.mjs). The reviewer is explicitly pinned
to **Opus 5 (`claude-opus-5`)**, high effort, in a fresh non-interactive CLI session with no model fallback.
This uses the existing Claude Code login; no reverse-dispatch plugin is needed. Give it the
[review packet](../templates/claude-review-packet.md), exact candidate, relevant contracts, threat model,
accepted residuals, and verification artifacts. Keep raw reports outside every source worktree (§7.2).

The helper exposes only Read/Glob/Grep and uses CLI safe mode to disable automatic instructions, commands,
hooks, plugins, and MCP tools. It automatically supplies the reviewed checkout's complete root `CLAUDE.md`
as required project context, saves `project-context.md`, and records its SHA-256 in `request.json`. Missing
or empty `CLAUDE.md` fails before dispatch. Its product principles and review standards apply; its
orchestrator/session/state-writing duties do not transfer to the reviewer. The packet supplies additional
task-specific context. The reviewer cannot run tests or modify code. These
are tool restrictions, not an OS sandbox. The before/after digest covers tracked and non-ignored untracked
files, not `.git` internals or ignored artifacts; it detects candidate drift but is not an atomic lock.
Hold the checkout stable. Each required channel gets its own fresh invocation. For `security`, the helper
includes and hashes the versioned [security methodology](../templates/claude-security-review.md); this is
a dedicated static security review, not a claim that `/security-review` or an external scanner ran.
Explicitly mandated auditors and dynamic tests remain separate gates.

**Standing user authorization — 2026-09-05.** The user explicitly approved sending TinyVault review
source/context to Claude and asked that routine dispatch no longer depend on repeated approval. Within an
already authorized TinyVault task, the continuity owner may choose and run the required read-only Claude
plan, QA, security and fix-absorption reviews through `scripts/claude-review.mjs`, using the existing Claude
login. This includes transmitting the scoped repository source/diff, project guidance, contracts and relevant
verification evidence to Anthropic's Claude service. Do not ask the user to approve that same transfer again.
Keep the helper's pinned model, read-only tools, safe mode, external report location and candidate-freeze checks.
This authorization covers the review workflow; it does not authorize unrelated destinations, real credentials,
publication, commits, pushes, merges or changes to managed sandbox/approval policy. Runtime approval controls
remain authoritative: if a dispatch is still rejected, report the specific rejection and the existing standing
authorization rather than bypassing the control or presenting another consent request as a project requirement.

Model identity is checked against CLI initialization and every assistant event. CLI auxiliary model usage
may appear in usage metadata and is preserved; it is not relabeled as reviewer output. Missing or malformed
results, denied permissions, wrong reviewer models/tools, timeouts, or candidate drift fail dispatch.
Exit 0 is a completed PASS report; exit 2 is completed NEEDS-ATTENTION; other exits are execution failures.
Read the full report before adjudication. Preserve candidate refs/digest, reviewer identity, channel,
command, and evidence location. Do not resume the author's conversation as the independent reviewer.

**Dispatch validation (2026-09-05):** Claude Code 2.1.258 completed an Opus 5 security smoke review of a
synthetic origin-prefix bug. The report identified the bug, reproduced a randomly generated file-read
marker, returned NEEDS-ATTENTION (exit 2), and left the candidate and startup-hook sentinel unchanged.
Raw evidence: `/private/tmp/tinyvault-opus-live-vtzlsp54/security-report` (temporary local artifacts).
`npx vitest run scripts/claude-review.test.mjs` covers result/model/tool validation, process failures,
timeouts, candidate drift, and output-location checks without making model calls. This validates the
dispatch path, not TinyVault's security or the quality of every reviewer conclusion. The standard skill
validator could not run because PyYAML is absent; the skill's YAML was parsed and checked with Ruby Psych.
The exact model identifier follows [Claude's model configuration documentation](https://support.claude.com/en/articles/11940350-claude-code-model-configuration).

```text
Role: delegated reviewer; continuity owner: Codex <session>.
READ-ONLY. Do not run /start or /wrapup, update shared state, or dispatch implementation.
Checkout and candidate: <absolute path>, base <sha>, head <sha>.
Scope and channel: <plan / QA / security; exact files and methodology>.
Read: <governing contracts, source/tests, threat model, accepted residuals>.
Evidence supplied: <diff and verification artifacts>; evidence to check: <requirements>.
Return: §13 review format, severity and file:line, test gaps, residual risk, deviations.
```

If cross-family tooling or a required audit skill is unavailable, prepare that exact packet and request
the missing review through the user. Continue independent preparation, but leave the review gate pending.
A same-family substitute or an unexecuted packet is not completed cross-family review. This protocol
does not install a reverse-dispatch plugin or change either application's saved credentials or permissions.

### Codex wrapup

Use **tinyvault-wrapup**, `$tinyvault-wrapup` in CLI/IDE, or “wrap up this TinyVault session.” `/wrapup`
has the same message-alias limitation as `/start`.

- Re-read the ownership checkpoint and current diff. A worker or former owner returns the §13 handoff
  report and proposed state updates; it does not edit shared state or close the current owner's session.
  After read-only orientation alone, summarize without manufacturing state changes.
- The owner updates Current State with outcomes, exact verification and blockers, next action, pending
  jobs, and the closed/paused checkpoint. Move no-longer-load-bearing narrative to `PLAN-archive.md`;
  keep the cumulative Decisions Log in `PLAN.md` and open threads easy to find.
- Record only useful durable project decisions/gotchas in the existing `.claude/memory/` topic files and
  index, without duplicating Current State. This grants no authority to edit user-global Codex memory.
- Follow the existing doc-hygiene rule: surface judgment-dependent staleness rather than silently rewriting
  history. Preserve append-only registers. Leave changes uncommitted unless authorized, and summarize what
  happened, what was verified, and the next step.

Repository skills are thin entry points to this section. [OpenAI's skill documentation](https://learn.chatgpt.com/docs/build-skills)
describes `.agents/skills` discovery and invocation. New sessions/worktrees must contain these files;
existing conversations should reload `AGENTS.md` and this section before relying on the new mode.

---

## 1. Dispatch Mechanics

Codex from Claude Code runs through the local Codex CLI via a companion script shipped with the plugin.

**Claude dispatches Codex via direct bash to the companion script.** Claude is the dispatcher; the user does not have to type a slash command for Codex to get involved. When the workflow patterns below warrant Codex (plan-stage adversarial review, post-impl review, scoped implementation, deeper investigation), invoke proactively:

```bash
node "<path-to>/codex-companion.mjs" <mode> "<prompt>"
```

> The exact companion-script path and flag set are owned by the plugin and change across versions. Treat the plugin's own docs as the source of truth, and pin the working invocation for your machine in `.claude/memory/gotchas.md`.

> **Route by stakes, then pin explicitly.** Reserve the expensive model for work where a wrong answer ships a false
> claim — security-core implementation, adversarial review of code, rescue. Send docs, mechanical refactors,
> test-only additions, fact-checks and environment probes to the cheaper one, and escalate only when it stops at a
> boundary or returns a design question. Note that `adversarial-review` / `review` accept no `--model` flag, so
> routing a review to the cheaper model means `task --model` with a review-shaped prompt.
>
> **Pin the model explicitly, not by mode default.** A mode's built-in default model changes when the plugin updates, and a default your CLI cannot run fails as an HTTP 400 at dispatch — silently, if you are not watching. Record the intended model and the minimum CLI version alongside the invocation, and keep `task --model <id>` documented as the escape hatch: it is the only mode that accepts a model flag, so it is what keeps the cross-model channel alive when a mode default breaks.

Modes (current plugin):

- **`task`** — rescue-equivalent. Use for: deeper-investigation passes, second-opinion debugging, scoped implementation when Codex is the better-suited writer, "I'm stuck, let the other model try."
- **`adversarial-review`** — adversarial diff or plan review. Use for: pre-impl plan review, post-impl diff review, gating-code stress test, contract-drift checks.
- **`review`** — built-in reviewer (less adversarial, more correctness-checking). Rarely the right choice; prefer `adversarial-review` for design stress-tests.

For long prompts, write the prompt to a file first and pass its contents, rather than inlining a multi-line string. Dispatch long-running work in the background and wait on the completion notification.

**Slash commands** (`/codex:review`, `/codex:adversarial-review`, `/codex:rescue`) exist for direct user invocation. Claude should use the direct-bash path instead — it is operationally simpler and is what the slash commands call internally anyway.

---

## 2. Role Split

### Claude owns continuity

Claude is the project-thread owner:

- Run session kickoff (`/start`) and wrapup (`/wrapup`)
- Read and maintain `PLAN.md`
- Read and maintain `.claude/memory/*`
- Update planning docs after work lands
- Coordinate branches, worktrees, and reviews
- Decide sequencing across milestones
- Preserve project intent across sessions

Claude holds the broader narrative: which milestone we are on, which decisions are locked, which risks are active, and what should happen next.

### Codex owns bounded challenge or execution

Codex is best used for:

- Adversarial plan review before risky work
- Post-implementation review before merge
- Isolated implementation slices with clear file ownership
- Tests and edge-case hardening
- Contract and wire-shape review
- Surfacing stale surfaces the orchestrator missed

Codex receives a precise contract, not a vague instruction to learn the entire project.

---

## 3. Build vs Audit Mode

Codex behaves differently depending on the shape of the work. Pick the framing on dispatch; do not conflate.

### Build mode (verifier framing)

Claude has drafted a plan or shipped a diff. Codex is shown the artifact and asked to pressure-test it. Default to rejection; cite `file:line` for every claim.

Use for: plan reviews, post-impl reviews, contract/wire-shape reviews, migration reviews, payment-path reviews.

### Audit mode (blind parallel framing)

The work is open-ended ("find tech debt across the codebase," "what did we miss"). Showing Codex the orchestrator's findings biases it toward convergence and reproduces shared blind spots.

Run Codex *independently* on the same scope brief, with no findings shown. Then synthesize:

- Items in both = high confidence
- Claude-only = Codex's blind spot
- Codex-only = Claude's blind spot

Use for: tech-debt sweeps, perf audits, security audits, "what did we miss" reviews.

Audit mode is structurally better for "find," verifier mode is structurally better for "challenge."

---

## 4. Plan-Review and Code-Review Sequencing (the ladder)

For high-risk or gating work, run the full ladder. **Claude is continuity owner; Codex implements bounded slices.** Step 4 is the load-bearing default — Claude implementing the slice in parallel defeats the cross-model coverage the ladder exists to provide.

1. The human gives the high-level requirements and the acceptance/test criteria.
2. Claude drafts the plan (root causes, risks, sequencing, decisions).
3. Codex adversarial pre-impl review on the plan (build mode, verifier framing).
4. Claude synthesizes findings and locks the plan.
5. **Codex implements one bounded slice** on a dedicated branch / worktree (see §9). Claude does not implement in parallel for high-risk-surface work; its role here is integration-gating, not authorship.
6. Claude `/review` (fresh-context QA) on the diff.
7. Codex adversarial post-impl review on the same diff.
8. Round 2 if needed (see §5).
9. Claude integrates, merges intentionally, and updates `PLAN.md` and memory.

**High-risk surfaces — always run the full ladder, with the implementation step defaulting to Codex.** Generalize this list to your own project; common members:

- Database schema changes / migrations
- Auth, sessions, access control
- Payment, billing, or money-movement code
- Public API or wire-shape contracts (REST, MCP, RPC, SDK types)
- Bulk data-write or backfill jobs
- Anything touching a locked gate, threshold, or invariant

**Carve-outs — Claude may implement when:**

- The bounded slice is a single-file edit (~50 LoC or less) mechanically absorbing pre-impl review findings.
- The change is an isolated test addition with no production-code touch.
- The change is internal copy / docs polish on a non-public surface.
- Time-criticality plus the user explicitly asks Claude to implement.

In every other high-risk case, default to Codex. If Claude finds itself reaching for the editor on high-risk-surface code without a carve-out reason, that is the signal to stop and hand off.

Lower-risk work (single-file edits, scripts, internal docs) can use a subset of the ladder — often Claude-only, or Claude plus a post-impl Codex pass.

---

## 5. Round-2 / Iteration Rules

When round 1 returns `NEEDS-ATTENTION` and Claude absorbs the findings, **run round 2 on the absorbed-fix diff for gating / correctness code.** This is not theater. Round 2 routinely catches:

- Stale sub-sections in a doc when only the top-level was amended (sub-section drift)
- New bugs introduced by absorbing round-1 findings
- Cross-cutting concerns the round-1 fix exposed

**Cap at round 3.** If round 4 is forming, the design primitive is wrong — redesign, do not patch further. Symptoms of a stuck design:

- Findings get *harder* each round (not narrower)
- New findings span the same load-bearing area each round
- The absorbed fix keeps creating sibling issues

### 5.1 Absorption-completion sweep (mandatory before round N+1)

Sub-section drift is the highest-frequency round-2/3 finding class — awareness is not enough, so this is a gate, not a reminder. After absorbing **any** review finding into a doc or spec, run this sweep **before** declaring the version done or dispatching the next round:

1. **Extract the changed token(s)** — the renamed function, the new count, the rejected gate, the changed contract value.
2. **Grep the full doc** for each old token. Every surviving hit is drift — fix it inline, or replace it with a "see X for canonical spec" reference.
3. **Grep sibling locked docs** whose semantics the amendment governs. A fix that lives only as "intent" in your plan while a locked doc still spells out the rejected approach is a reintroduction hole.
4. **Only then** mark the finding absorbed in the `PLAN.md` Decisions Log. If you decide *not* to change a hit, say why — silence reads as "missed it."

---

## 6. Synthesis Discipline

`NEEDS-ATTENTION` from Codex is a serious review input — **not** an automatic stop-the-line verdict.

Codex does not have full context on:

- **Product stage** — early/pre-launch vs mature. Pre-launch with no users means operational drift outweighs attacker theater.
- **Threat model** — defensive against operational drift vs hardening against sophisticated attackers.
- **Priority** — correctness vs cost vs observability.
- **Round history** — a round-3 finding may be an acceptable tradeoff even when adversarially defensible.

After `NEEDS-ATTENTION`:

1. **Classify each finding** by user-visible impact (correctness vs cost vs observability).
2. **Weigh against project stage.**
3. **Consider round history** — narrower findings → patch; harder findings → redesign or punt.
4. **Document the synthesis in the `PLAN.md` Decisions Log** — future sessions need to see *why* a finding was absorbed, declined, or punted, not just that it was.

`NEEDS-ATTENTION` means "here are the findings, decide." It does not mean "do not merge." The same discipline applies to Claude `/review` findings — both reviewers default to rejection by design.

---

## 7. Claude `/review` and Codex Complementarity

`/review` and Codex are two review channels, not one fallback for the other. They catch different bug classes:

**Family independence is relative to the AUTHOR of the change, not to a fixed role.** Whichever family wrote
the diff, a reviewer from that same family shares its blind spots — so "cross-family" must be evaluated per
slice, by asking *who implemented this?* Getting this backwards is easy and it silently overstates coverage:

- When **Claude** implements, `/review` is same-family and the Codex pass supplies the different-family look.
- When **Codex** implements (the default for 🔴 slices here, see [`phase-0-plan.md` §9](../docs/phase-0-plan.md)),
  the relationship inverts: Claude `/review` and `/security-review` are the **different-family** channels, and
  the Codex post-implementation pass is **fresh-context and adversarial but same-family** as the implementer.

Independent of family, the two channels differ in context and in what they are good at:

**Claude `/review`** (fresh-context QA)
- Full project context — `CLAUDE.md` + memory + repo conventions loaded
- Defaults to rejection
- Strong on: convention violations, "does this match how the rest of the codebase does X," subtle correctness inside domain logic, doc/spec drift

**Codex adversarial review**
- Less project context (only what is in the handoff packet)
- Defaults to rejection
- Strong on: deeper-merge semantics, cross-system races, contract drift across files, silent reinterpretation of locked gates

Empirically across many sessions, each catches issues the other misses, and the two finding-sets are largely disjoint. For gating / correctness / security / payment code, **run both on the same diff** — not one or the other. Running only channels from the implementer's own family shares blind spots within it; ensuring at least one different-family reviewer sees the diff is the high-leverage move.

### 7.1 A security-specialized third channel

If your toolchain ships a security-specialized reviewer (Claude Code's built-in `/security-review`, for example), treat it as a *third* channel on top of generalist `/review` + Codex, not a universal gate. Run it, in addition to the normal ladder, when a change touches a security surface:

- Auth, sessions, access control
- Payment, billing, or money-movement code
- Public API wire, rate-limit / quota / payment gates
- Secret and credential handling
- Database migrations and the queries they expose

Skip it on refactors, pure docs, and non-security features. It is diff-aware (blind to pre-existing code), so run a baseline sweep separately for code that already merged. Note its family is *Claude* — whether that makes it same- or different-family coverage depends on who wrote the diff (§7 above): it is different-family review of a Codex-implemented slice, and same-family review of a Claude-implemented one. Keep whichever channel supplies the different-family look for that slice.

**It is additive, never certification.** A clean security-review is one more input, not a verdict that a change is safe. It does **not** replace, and must never be recorded as having replaced:

- cross-model (different-family) adversarial review,
- the deterministic test suite,
- noninterference / side-channel tests,
- or the project's own evaluation harness, where one exists.

A generalist security reviewer is typically strongest on conventional classes (injection, secrets in logs, auth bypass) and weakest on project-specific invariants — "does this boolean leak an equality bit about the secret" is not a class it is tuned for. Those invariants stay the job of purpose-built tests.

**When a review and a test disagree, the locked invariant is authoritative — not either mechanism.** Neither a green test nor a clean review is a verdict about the other:

- A **failing purpose-built test blocks release**, regardless of a clean security review.
- A **passing test does not dismiss a concrete reviewer finding** — the test may simply not cover the case.
- **Investigate the disagreement** until either the finding is disproved *with evidence*, or the test is corrected/expanded to cover what the reviewer saw. "One of them said it was fine" is not a resolution.

**Diff-aware review cannot audit what already merged.** A change reviewed while pending is covered; code that landed earlier is not. That is the gap a periodic whole-codebase audit fills — see below.

### 7.2 Whole-codebase security audits

Distinct from per-diff review: an audit sweeps existing code, including everything a diff-aware pass never saw.

**Timing.** Do not run a heavyweight *routine* baseline audit before the system's core security path actually exists — auditing scaffolding produces noise and false confidence. Schedule routine sweeps against milestones where a real trust boundary has landed; the concrete schedule for this project is in [`phase-0-plan.md` §9.2](phase-0-plan.md).

This schedules **routine whole-codebase sweeps only. It does not prohibit a targeted audit** at any time when there is a reason for one: concrete evidence of a defect, a new threat-model question, or a named gap a review channel has left open. A targeted audit is scoped to that question and needs no milestone permission.

**Tooling.** Prefer a first-party security scanner where scan access is available; otherwise an open, inspectable audit skill. **Start with one baseline auditor** rather than running several automatically — a second is worth adding only once the first's findings are understood and its blind spots named.

**Hygiene, non-negotiable:**

- Run audits **read-only**. An auditor must not mutate the worktree.
- Store reports **outside the source worktree**, so findings never land in a commit unreviewed.
- Supply the auditor the project's **threat model, enforced invariants, explicit exclusions, and accepted residual risks** — an auditor without them re-reports known, deliberate tradeoffs as findings and buries the real ones.
- **Inspect and pin any imported skill or plugin** to a reviewed commit or version. An unpinned auditor is arbitrary third-party code with repository read access.

**Differential / history-aware review skills** (git-history and blast-radius analysis) substantially overlap an adversarial diff pass and add little on predominantly greenfield code. Reserve them for large or history-sensitive diffs where provenance and blast radius are the actual question.

**Do not multiply platforms.** Where a working cross-family review workflow already exists, adding another hosted platform fragments the workflow without a defined coverage gain. Add a channel only against a named gap it closes.

---

## 8. Codex Must-Not-Do List

To preserve single-owner project continuity, Codex must not:

- Edit `PLAN.md`
- Edit `.claude/memory/*`
- Update planning / roadmap docs
- Make milestone-sequencing decisions
- Make launch-readiness calls
- Reinterpret locked gates or thresholds
- Decide tradeoffs between cost and correctness
- Touch unrelated files outside the handoff packet's stated scope
- Push, merge, or close branches without Claude orchestration

If a Codex review or implementation surfaces a planning decision, it goes back to Claude (and the user) — not absorbed silently. Codex implements or reviews; Claude synthesizes and updates project state.

---

## 9. Branch and Worktree Discipline

Claude and Codex should not edit the same worktree at the same time.

Convention:

- `main` is the clean integration branch.
- `claude/<task>` is Claude's implementation branch.
- `codex/<task>` is Codex's implementation or review branch when Codex is doing the writing.

For implementation handoffs, Claude tells Codex: the branch/worktree to use, the base commit, the files Codex owns, the files Codex must not touch, and whether Codex may update docs or only code and tests.

For review handoffs, Codex does not edit unless explicitly asked. It returns findings with `file:line` references and severity.

---

## 10. Handoff Templates

Fill-in-the-blank packets live in [`../templates/`](../templates/):

- [`templates/implementation-handoff.md`](../templates/implementation-handoff.md)
- [`templates/review-handoff.md`](../templates/review-handoff.md)

### Required-reading rules

Keep Codex's required reading short and task-specific. Always include `CLAUDE.md`, `PLAN.md` Current State, the relevant source files, and the relevant tests. Add `SCHEMA.md` (or your other contract docs) only when the change touches the schema or a contract. Add the relevant planning doc from `docs/` when one governs the work. Do not bulk-load all of `.claude/memory/` by default — include only the memory files relevant to the task.

### Good vs bad handoff

Bad:

```
Implement the new endpoint.
```

Better:

```
Implement default-branch URL correctness in the repo-import path.

Problem:
Source URLs are built assuming every repo's default branch is `main`.

Scope:
- Plumb the real default branch from the repo-fetch path into normalization.
- Build source.url and raw_url from the actual default branch.
- Add a regression test for a repo whose default branch is `master`.
- Do not change discovery, search, or the source interfaces.

Acceptance:
- Existing import tests pass.
- New non-main default-branch test fails before the change and passes after.
- No public API wire-shape changes.
```

If the scope cannot be expressed as concrete behavior + tests, ask Codex for plan review first, not implementation.

---

## 11. Implementation Slices That Fit Codex Well

Good Codex implementation tasks:

- Add a focused CLI around already-planned library code
- Add tests for a known edge-case class
- Implement one migration + wrapper + tests
- Update generated types for a locked wire-shape
- Harden a parser against ambiguous input
- Implement one sub-task of a larger track, not the whole track

Poor Codex implementation tasks:

- "Finish phase 4"
- "Improve quality"
- "Clean up the data layer"
- Any task where the desired behavior is not yet locked
- Any task requiring broad product judgment without a plan

Keep work local (Claude) when it is mostly project-state writing, product/strategic synthesis, blocked on live user judgment, or a small single-file edit whose handoff packet would take longer to draft than the change.

---

## 12. Acceptance Criteria Discipline

Codex handoffs must include **rejection-path tests, not just happy paths**. For example:

- Rate-limit / quota code tests under-limit, at-limit, and over-limit behavior
- Input-handling code tests malformed input and the error envelope shape
- Write-path code tests that stale writes are rejected
- Wire-shape changes test for contract drift

If a task changes a gate, threshold, or public contract, require before/after artifacts. Do not accept silent reinterpretation of a locked gate — a recurring failure mode.

---

## 13. Reporting Formats

### Implementation report

```
## Summary
- ...

## Files Changed
- ...

## Verification
- <test command> PASS
- <build command> PASS
- Not run: <reason>

## Risks / Follow-ups
- ...

## Deviations From Handoff
- None
```

### Review report

```
## Status: PASS | NEEDS-ATTENTION

## Findings
- [P1] file:line — issue, impact, fix
- [P2] file:line — issue, impact, fix

## Test Gaps
- ...

## Residual Risk
- ...
```

Use `PASS | NEEDS-ATTENTION` verbatim so both labels are greppable in session logs and the decisions log.

---

## Summary Rule

**Hand Codex less history and more contract.**

Claude preserves the broad project narrative. Codex receives the exact task, exact context, exact files, exact invariants, exact tests, and exact non-goals. That is the highest-leverage way to use a second model family from inside Claude Code.
