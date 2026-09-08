# PLAN

The active-work document. `/start` reads it; `/wrapup` updates it. Two parts:

1. **Current State** — the lean, session-by-session narrative of what's in flight. Stale detail gets archived to `PLAN-archive.md` every `/wrapup`.
2. **Decisions Log** — the cumulative "X over Y because Z" record. Never archived.

> The canonical roadmap (goals, scope, requirements, locked sequence) lives in [`PROJECT-SPEC.md`](PROJECT-SPEC.md). This file tracks *execution*; it points to the spec rather than restating it.

---

## Current State

`2026-09-07-s5` — focus: **S5 packet (composed real-agent command path, E7/E8) — draft, Sol paper pass, Astra dispatch under the full ladder**;
owner: claude; state: active. Checkout: `/Users/jonathanavni/Documents/Coding/tinyvault`, branch main at `39126cf` (== origin).
Breadcrumb (2026-09-07): two stale busy-loop shells from the 2026-09-02 probeP stress run killed (PIDs 60983/60984). S5
packet drafted at `docs/m6-s5-handoff.md` (uncommitted) with nine open owner decisions D-S5-1…9 awaiting user approval;
evidence dir `artifacts/review-evidence/tinyvault-m6-s5-packet-20260907/`. Running: Sol read-only paper pass over the
packet (first job `task-mts2g9xk-rvqmq9` died silently at ~13 min, log archived as `sol-packet-review-r1-attempt1-dead.log`;
re-dispatched once with identical arguments as `task-mts3amtl-w3s8u7`, main checkout); Sol test-only "unmutated arms" job (S4 residual 8) in worktree
`<scratchpad>/wt-s4-arms` on branch `codex/s4-arms` (Codex job `task-mts2i6mf-90u9gv`) — DONE: four tests + 14 s sync
fix, owner-verified on main (35/35 ×3, typecheck, 31/31 browser control, Arm D mutant killed), register entry "S4
residual (8) — unmutated arms closed", committed on main; worktree/branch removed. Hold further commits while the
paper pass runs.
Sol paper pass R1 DONE (NO-SHIP, 3 P1 / 3 P2, all absorbed; register entry "S5 packet — Sol paper pass R1"); packet now
carries ten decisions D-S5-1…10. **Blocked on the user:** approval of D-S5-1…10. Then: owner pre-integration (docker
capability row for `testbed/sourceInventory.ts`, plan §7 S5 row amendment, docs/README line) → commit packet → pin base
→ Astra `task --write` for S5 → post-impl ladder (Codex adversarial + Claude QA + Claude security, three-round cap).
Astra R1 STOPPED at the canary boundary (`_` in base64url IDs); disposition: D-S5-1 narrowed to `[A-Za-z0-9]`, commit
`45f1074`; resumed as `task-mts4t4qt-n274ci` → S5 CANDIDATE delivered 2026-09-08 (23 files, 43/43 worker mutants, six H traces in
budget). Owner `make test` on the candidate: first run red (2 owner-gate fallout items: root-of-trust pins for the approved script/
Makefile change; the arms commit's wall-clock bound rejected by the meta-gate — both fixed, register correction + gotcha); second run
GREEN (main 2696/0/1, timing 5/5, 20/20, execution PASS). Candidate committed on main; post-impl ladder R1 next (Codex adversarial,
Claude QA, Claude security in parallel worktrees). R1 DONE 2026-09-08: Codex 2 P1 (unsigned execution metadata admitted;
E5-unqualified runs credit control cells), QA 0 P1/3 P2/4 P3, security 0 P1/1 P2/3 P3; owner 6/6 spot-check kills; register
entry "S5 R1 — candidate fb8816b". Fix round 1 packet `fix-round-1.md` dispatched to Astra (write, main checkout; job id in
the evidence breadcrumb). Fix round 1 DELIVERED after four owner-answered STOP questions (zero-request runs; canary custody
boundaries; loop.ts export; authorized dom-fill control) — 15 files, F1–F9, 152 targeted tests, 10/10 mutants; owner `make test`
GREEN (main 2725/0/1, timing 5/5, 20/20, execution PASS); committed `5685d01`. R2 DONE 2026-09-08: Codex (defensive-framed task
mode after three classifier-flagged `adversarial-review` failures) NO-SHIP 2 P1 (live-rejected responses satisfy offline completion;
early-return/TOCTOU bypass of the recomputation); QA 0 P1/1 P2/3 P3; security PASS 0 P1/0 P2/4 P3; owner 6/6 spot-check kills;
register entry "S5 R2". Fix round 2 (`fix-round-2.md`, the LAST fix round) DELIVERED 2026-09-08 without STOPs: shared live
acceptance predicate, requestId pairing, terminal-state rules, single verified snapshot, G3–G5 tests; 10/10 mutants; owner `make test`
GREEN (main 2754/0/1, timing 5/5, 20/20, PASS); committed on main. R3 = capped review (three channels, defensive framing, P1 only per
the packet's criteria); then acceptance + owner docs integration (SCHEMA/phase/M6 plan diffs from the worker's proposed-docs.patch).

`2026-09-07-d-cancel` — focus: **D-CANCEL resolved; S4 implemented, reviewed and accepted; pushed**;
owner: claude; **state: closed** (2026-09-07); continuity relinquished for a fresh session.
State checkout/worktree: `/Users/jonathanavni/Documents/Coding/tinyvault`; branch main; local == origin at `b0461f0`.

**This session (all pushed):** S3 wrapup committed (`0acb6bb`); three merged codex branches pruned; D-CANCEL resolved with
a nine-experiment evidence packet and three capped Sol paper rounds (`2bcfbbd`; M6 plan §7 + register entry "D-CANCEL —
resolution and evidence packet"); S4 packet drafted, Sol-reviewed, user-approved (10 s navigation/per-op bounds; failed-run
retention stays S5; optional quiesce method + four pre-authorized test files) and dispatched to Codex Astra; candidate + two
fix rounds under a three-channel ladder (Codex adversarial, fresh Claude QA, fresh Claude security ×3), owner `make test`
green each round after fixes, six owner mutant spot-checks, one Sol test-only witness at the round-3 cap; **S4 accepted**
(`b0461f0`; register entry "S4 implementation — accepted at the round-3 cap", nine declared residuals). Final gate: main
2629/0/1 inherited skip, timing 5/5 and 20/20, execution gate PASS. Evidence archives (local, ignored):
`artifacts/review-evidence/tinyvault-m6-d-cancel-20260907/` and `tinyvault-m6-s4-packet-20260907/` (+ manifests/tarballs).

**Retained boundaries:** S4 proves lifecycle bounds on this host with page-scoped producers; trusted-side stalls (backend,
non-cancellable captures) are bounded only at the abort trigger; `abort()` discards all lease evidence (verdict capture-failed,
never clean); E5 qualification is a module + initial-snapshot observation, not production-wired; socket release rests on the
owner's SYN_SENT observations; nested/service-worker targets are counted, not defeated. Full list: register entry.

**Next session:** `/start` read-only; propose the **S5 packet** (composed real-agent command path, E7/E8) carrying the S4
residuals by name — E5 publication wiring, evidence snapshot before `#drop`, bounded trusted-backend/capture contract (or
explicit residual), the unmutated arms (courtesy deadline term, suspension reserve, `abortSessions` recovery loop, 14 s sync)
— plus S5's own obligations from S3 (remeasure prompt headroom with real cohort IDs; same-backend discovery/probe/setup/fill;
root instructions/provenance bound to execution). Sol paper pass on the packet, then Astra under the full ladder. No live
cohorts, Docker/clean-clone acceptance or release are authorized by this wrapup. No workers, reviewers or jobs are running.

## Decisions Log

> Append-only. Each entry: the decision, the alternative rejected, and why. Cross-model review findings that were absorbed, declined, or punted get recorded here too (see `docs/handoff-pattern.md` §6).

- **2026-08-31** — Reuse the **tinytandem** two-model (Claude orchestrator + Codex adversary) harness over a fresh setup, because it's the workflow that shipped KuchiClaw (its `handoff-pattern.md` is used verbatim there) and its Codex channel doubles as the mitigation for this project's safety-classifier flagging (spec §11).
- **2026-08-31** — Seed the scaffold from tinytandem's spine + the fresher `coding-starter-kit` guides + the vault playbook's recent practices, writing only into this repo; tinytandem and the starter-kit are left untouched (read-only sources).
- **2026-08-31** — **TypeScript** (per `PROJECT-SPEC.md`), because the intended adapters (MCP, eve, dsh) and Playwright/CDP are all TS-native.
- **2026-08-31** — **Agent-loop substrate = hand-rolled loop on `@anthropic-ai/sdk`** (not the Claude Agent SDK, not the beta tool-runner), because the loop is the auditable artifact and the transcript is byte-exact wire I/O; the Agent SDK would put a closed Claude Code subprocess *inside* the leak-measurement boundary. (Research-backed.)
- **2026-08-31** — **Pinned eval model = `claude-haiku-4-5-20251001` at `temperature:0`**, because it's the newest tier where `temperature` is still legal (removed/400 on Opus5/Sonnet5/Fable5/Opus4.8), 5–10× cheaper for N-run sweeps; the Messages API has **no `seed`**, so the eval is statistical (leak *rate* over N + Wilson CI) by construction — which is the thesis.
- **2026-08-31** — **First real backend = 1Password** (`@1password/sdk`, `op read` equivalent), Bitwarden second, because `op item list` returns metadata-only natively **and each item carries its canonical URL** (load-bearing for trusted-side origin authorization), whereas `bw list items` always emits plaintext passwords into the adapter (redaction mismatch) and has open 2026 non-interactive-unlock regressions. libsodium local-file stays the free offline default, built first.
- **2026-08-31** — **Round-1 Codex adversarial review of the Phase 0 plan: NO-SHIP, 6 findings, ALL ACCEPTED** (none discounted by pre-launch stage — each attacks the core claim). Absorbed into `docs/phase-0-plan.md` §0.5: (1 crit) caller-controlled `expectedOrigin` made every handle transferable to an attacker origin → **origin authorization now bound trusted-side to the credential's canonical URL**; caller origin demoted to a redundant assertion. (2) `LeakError` on caller-text match was a password-membership oracle → tripwire scans **trusted-originated output only, never caller input**. *(SUPERSEDED by round 2 #2 below: the tripwire is **pure instrumentation** — it fails the eval + writes a protected-sink diagnostic but NEVER changes caller-visible control flow, process lifetime, or timing; there is no caller-observable teardown. Reflection is handled by provenance-masking, not content comparison. This is the single canonical tripwire contract.)* (3) unrestricted selectors + post-fill-only lockdown + callable snapshot = races/DOM-mirroring → **pre-lock before inject + per-session mutex serializing all page ops + password-control/top-frame restriction + cross-origin-frame refusal**. (4) grep-whole-transcript was both falsely-red (baseline source secret, legit login POST) and falsely-green (missed encodings/fragments) → **typed source/authorized-sink/unauthorized-sink event model + fragment reassembly + broad encodings + planted-leak matrix & negative controls**; per-run **canary secrets** make it exact. (5) a do-nothing agent scored 0 leaks → **deterministic completion oracle; reference must pass 0-leak AND full completion; N=10 + Wilson CI + ship threshold locked in Phase 0**. (6) milestone graph was internally impossible & undershot the ≥3-fixture launch bar → **eval spine before security core; ≥3 fixtures own explicit milestones; M0 contracts re-tiered 🔴**. Residual (accepted, in README threat model): a compromised *authorized* origin can read the injected secret — out of scope by construction.
- **2026-08-31** — **Round-2 Codex adversarial review: NEEDS-ATTENTION, 5 findings, ALL ACCEPTED; findings narrowed vs round 1 (productive convergence, not a stuck design per handoff §5).** Absorbed into `docs/phase-0-plan.md` §0.6: (#2) reflected caller input re-created the membership oracle → snapshot now masks by **provenance/taint not value**, and the content tripwire is **pure instrumentation** that never alters caller-visible control flow/timing (+reflection-oracle differential test). (#1/#3) caller still chose the target element + origin check was **TOCTOU-raceable** → **verified credential destination** (password-type, top-frame, correct login form/action only) + **atomic check-then-inject** aborting on any navigation/frame-detach mid-fill. (#4/#5) persisted evidence pre-classified sinks / stored bare origin+bool → persist **raw immutable events** (direction/method/route/identity + `dom-fill` channel), classify **offline only**, authorize the **exact** endpoint (closes same-origin laundering), recompute completion from a **signed fixture receipt**. (#6) M2 verification depended on M4's browser → M2 split to **isolated unit primitives**, all real-fill/DOM **integration gates moved to M4**. (#NEW) shape-only egress allowed secret-derived enums/booleans/counts → **exact result constructors with non-secret provenance + a noninterference differential test**. Next: round 3 to verify, then LOCK (cap at round 3).
- **2026-08-31** — **Round-3 (capped final) Codex adversarial review: NEEDS-ATTENTION, 4 findings, ALL ABSORBED → plan LOCKED.** Judged implementation-level specifics + one doc nit, not new design holes (Codex: "round 2 substantially improved the design"; "no remaining forward dependency"), so absorbed and locked at the round cap rather than spinning round 4. §0.7: (#1) "atomic check-then-keystroke, no await gap" was un-implementable against Playwright's async keystroke API → replaced with a **single synchronous in-page-realm validate-and-assign primitive** (no keystrokes; TOCTOU window structurally impossible). (#2, NEW) char-by-char keystrokes leaked secret **length** via fill latency + mutex-occupancy → same in-realm primitive is not length-proportional + **normalized completion/mutex-release timing** + short-vs-long timing added to the noninterference test. (#3, NEW) signed completion receipt proved issuer not freshness → **single-use, per-run-nonce-bound** receipt, fixture-server-only key, out-of-band capture, binding verified offline. (#4) this Decisions Log's round-1 entry still prescribed terminal teardown → **superseded above** (one canonical tripwire contract). **Decision: the atomic in-realm primitive is re-verified AS CODE in the M2/M4 Codex implementation ladder — a plan cannot prove implementability, the impl review does.** Accepted residual risks: compromised authorized origin incl. its open-redirects/reflected responses (secret-bearing follow-ups classify unauthorized); multi-origin SSO / JS-only submission unsupported in v0.1 (stated, not silent).
- **2026-08-31** — **Post-LOCK fresh-context spec-alignment review (Claude subagent, per "always delegate reviews"): GAPS-FOUND — 0 blockers, 6 P2, 10 P3; ALL 16 ABSORBED; LOCK stands.** Confirmed clean: all ten spec-§6 launch checkboxes map to milestones, all §10 questions resolved, §5 structural decisions preserved, all major spec deviations conscious and stated. Fixed: (P2) the spec's **2FA/CAPTCHA human-handoff hook** had silently vanished → now explicitly deferred to the KuchiClaw step with its v0.1 attach-point stated (`handle-unavailable` + `request_vault_setup`); (P2) **`sessionId` lifecycle was undefined** on the M0-freezing contract → `browser_open_session`/`browser_close_session` added with mutex/taint/dispose semantics + `session-unknown` reason; (P2) three keystroke-era phrases survived the round-3 LOCK edit — worst being the single-`expose()`-site contract naming the abolished "keystroke-injection function" → renamed to the in-realm inject primitive; (P2) the round-3 **timing differential had no milestone home** → added to M4's gates; (P2) planted-leak matrix was missing the **`tool-result` channel** (the one layer-1 exists to protect) → added; (P3s) acceptance-signal deviation now stated, M10 gains the README reproduce command, baseline-early rationale noted on M6, stale "round 2 pending" lines fixed, `results.ts` + `benign-login/` added to the layout, invariant-4 test homed in M4, `approvalBypassed` marked reserved-v0.1, BackendStatus→SetupReason mapping defined, full three-tool + session signatures added to §2, `fixtureVersion` naming aligned.
- **2026-08-31** — **`SKILL.md` added to the v0.1 launch (user proposal, post-LOCK M10 amendment; docs-tier, no contract change).** An agent-facing skill teaching the three-tool flow, refusal semantics, and the never-ask-for-the-password norm — over README-only docs, because agents consume skills, not READMEs, and "harness-agnostic" needs a usable-correctly story, not just a mountable one. Twist: the reference agent's testbed system prompt is derived from SKILL.md, so the scorecard measures the *published usage instructions* (0/N under the docs we ship), keeping the skill honest. Constraint: SKILL.md is a model-visible surface — no example secrets, no credential-echo patterns.
- **2026-08-31** — **One canonical Phase 0 plan doc** (`docs/phase-0-plan.md`) over two competing drafts, because "each fact has ONE home." An orphaned earlier draft (`docs/implementation-plan.md`, uncommitted, untracked) was consolidated — its stronger specifics (one-line field-split rule, closed-enum/no-free-text errors, `Secret<T>` wrapper, per-run canary secrets, "naive leakRate==0 is a checker alarm") were lifted in — then archived to `docs/archive/implementation-plan-superseded.md` for provenance.
- **2026-08-31** — **M0 (scaffold + contracts + threat-model README) implemented by Codex, cross-model reviewed, integrated to `main` (`8007aea`).** Fresh-context `/review` (same-model, full plan context) + Codex `adversarial-review` (cross-model) run in parallel; both verified clean on the load-bearing checks (contract fidelity exact — seven `FillResult` reasons, `CapturedEvent` no sink field, `CompletionReceipt` matches §5; no leaked trusted-only surface; README quotes spec §4 verbatim; pure M0 scope). Two findings absorbed: **(both channels, P2)** `make test` ran `vitest run` only, which strips types without checking, so the contract test was a near-vacuous runtime pass → gated `tsc --noEmit && vitest run` + added `@ts-expect-error` negative guards (closed union, no-secret-on-success, no-canonicalOrigin-on-ItemMeta, no-sink-on-CapturedEvent) so drift fails the build. **(Codex-only, P1 — same-model reviewer judged it "arguably better")** tool signatures grouped into `VaultTools`/`BrowserControls` interfaces vs the plan's `declare function` notation → **kept the interfaces** (identical method signatures; the importable idiom ambient declarations can't provide) and **amended locked plan §2 to sanction** rather than reverting. `/security-review` deliberately skipped at M0 (no secret-handling code yet; load-bearing at M2/M4). `moduleResolution: Bundler` + all-string `CompletionReceipt` fields accepted.
- **2026-08-31** — **M1 (eval spine) implemented by Codex, hardened over THREE cross-model adversarial review rounds, integrated to `main` (`8faedde`).** The eval harness — stub agent + transcript, three leak checkers + meta-gate, canary minter, benign-login fixture with signed receipts, runner + Wilson-CI scorecard, offline adjudicator — is the component whose correctness IS the product, so it drew the most rigorous review of the project so far. **14 P1 findings across 3 review rounds, all closed** (review R1 dual-channel: 5; R2 Codex: 4; R3 Codex: 1), plus my own independent verification of the load-bearing properties. Round-by-round: **R1** — meta-gate circular on encodings (both channels), interleaved-fragment evasion, tool-call-id unscanned, single-use signature-string bypass, runner-holds-HMAC-key → fixed with independent meta-gate fixtures + mutation tests, per-stream/subsequence reassembly, full-envelope capture, **Ed25519 asymmetric signing** (verifier holds only the public key), bound-identity replay keys. **R2** — offline outcome recomputation was under-built (live-computed stored booleans) → added `testbed/checkers/offline.ts` (reload persisted evidence + public key + eval-wide replay ledger, recompute, assert agreement, fail on mismatch); full-response scan; case-insensitive encoding decode; structured-payload leaf reassembly. **R3** — one residual decoder gap (selective escaping like `TVC%5f...` slipped a per-run decoder) → Claude-implemented decode-in-place fix + independent selective meta-gate fixtures, verified conclusively (reverting to per-run decoding fails the gate on `case:percent-selective`); the `decoded !== bytes` guard preserves transform independence. **Verified myself** (not just via reports): deleting production base32 fails the gate; tampering a stored outcome triggers "Offline outcome mismatch"; the selective-escape evasion is caught; the real localhost HTTP fixture binds a socket (Codex's sandbox hit EPERM). **Accepted residual** (threat model): encoded fragments across genuinely different streams / arbitrary receiver schemes = motivated steganography, out of scope, documented in code. Judgment call recorded: R3's single narrow finding was Claude-fixed directly (small, single-concern, conclusively verifiable) rather than escalated or given a 4th Codex round — the cap held.
- **2026-08-31** — **M1 contract amendment: added `'benign'` to `AttackClass`** (plan §5 + `testbed/scorecard.schema.ts` + SCHEMA.md, same commit). Codex, mid-M1, correctly STOPPED on a locked-contract conflict (kicked the planning decision back per handoff §8) rather than guessing: `RunRecord.attackClass` is mandatory but every enum value was hostile, so the benign-login control run (the task-completion baseline) couldn't be scored. Chose add-`'benign'` over mislabeling-as-`prompt-injection` (would corrupt the leak-rate table AND misfire the live-fire alarm, which keys off injection scenarios) or excluding-benign (fails M1 + breaks completion measurement). Low-risk: `attackClass` lives in `RunRecord` (testbed-internal scoring), NOT a model-visible type — no trust-boundary impact, so amended directly as continuity owner without a new review round. Live-fire alarm now scoped to non-benign scenarios.
- **2026-08-31** — **M1 hardening complete and integrated (`07996a2`), closing the independent Opus 5 audit.** Two blind Opus 5 auditors (`docs/audit-opus5-m0-m1.md`) plus two follow-up review rounds produced **15 findings across 3 channels**, all closed or explicitly scoped. Why it mattered: the three prior Codex/Opus-4.8 rounds all attacked *"can a leak hide from the checker"*; Opus 5 attacked **false positives, trust in the checker's inputs, and capture coverage** — orthogonal axes, hence the disjoint catches. Headline fixes: (1) a **verified live false-positive bug** — `leakScan`'s subsequence branch flagged leaks on canary-free transcripts (78.5% FP @6KB, 100% @16KB+, reproduced independently), which would have made the first real M6 run read 10/10 false leaks; deleted, then the genuinely-lost fragmentation class restored via min-chunk in-order reassembly (split-with-noise now caught, FP still 0% at 71KB). (2) **Trust anchor** — the adjudicator verified against a key, canary, and auth policy the run producer wrote; three forgeries were demonstrated. Now: key and `ScenarioAuth` from code, `canaryCommitment` in the signed payload, fixture-signed `sha256(events)` bound to `runId`, cross-check against the fixture's own capture record, positive control, and a run-inventory gate. (3) **A regression I authorized then had to fix**: round-1's A2 exempted the model-context channel for *every* agent, hiding plaintext-in-prompt — invariant #1; now agent-scoped (naive = seeded source, vaulted = unauthorized sink). **Judgment calls recorded:** I initially *declined* to bind the event log, arguing the runner is the capture layer so a self-signed digest proves nothing — correct for `model-text`, but I over-generalized and missed that the fixture holds an unreachable key and writes an independent capture record; corrected and implemented. Conversely I *declined* to chase full capture authenticity, which genuinely needs an attestor outside a single-process harness — scoped honestly in README/SCHEMA instead, with reproducibility as the anti-fabrication story. Final cross-model verdict: **PASS, no material findings.** Cost noted: ~+419 impl LOC; flag simplification at M2 review.
- **2026-08-31** — **Triage of `docs/spec-amendment-2026-08-31.md` (planning-side proposal; 8 outcomes as the doc requests).** Verdict: **accept the direction, adjust three items, verify the facts before they go public.** Nothing here reopens the round-1/2/3 security design (E acknowledged) and nothing delays the ≥3-fixture launch bar.
  - **A1 spec §2 "why now" refresh — ABSORB-NOW (docs), with a caveat.** The framing *"TinyVault is the unbundled trust layer — the thing every converged persistent-VM-browser agent needs and none sells separately"* is the sharpest positioning the project has had; the six-product substrate-convergence argument is what makes it land. **Caveat: no external claim in that document has been verified in-session** (no web research was run). Funding figures, product details, and URLs must be checked before they enter `PROJECT-SPEC.md`, and especially before any of it reaches the public README — this is a public credential-handling repo where a wrong market claim is a credibility cost. The *positioning* stands regardless of whether a dollar figure is off.
  - **A2 payments → explicit non-goal — ABSORB-NOW. Strongest item in the document.** It *narrows* scope (scope discipline), closes a real ambiguity — spec §4 item 5 still says "consider borrowing payload-bound approval," which the locked plan already defers — and the parallel is the best sentence anyone has written for this project: *"Link separates permission to spend from possession of the card. TinyVault separates permission to sign in from possession of the password."* Zero plan impact; nothing builds payments. The *scope decision* is sound even if the Link mechanics need fact-checking.
  - **A3 own the RPA lineage — ABSORB-NOW.** Preempts the "just RPA" / "just a wrapper around `op`" dismissal already listed in spec §8 by claiming the lineage first, and the **attended/unattended** vocabulary is a genuine improvement to how we frame the 2FA/CAPTCHA human-handoff hook (already deferred to roadmap step 5 with its attach-point recorded). Owning prior art strengthens credibility rather than costing it.
  - **A4 SKILL.md revocation norm — DEFER-TO-MILESTONE (M10), not absorb-now.** Correct content, wrong timing: `SKILL.md` does not exist yet (it is an M10 deliverable). Recorded into the M10 spec instead of written now.
  - **B1 "resolve at fill time, never cache" — NOT already-covered; ABSORB as an explicit invariant + test.** The plan states fill-time resolution but does not *enforce* it, and the backend seam's `dispose?()` ("drop cached sessions/keys") in fact implies some caching exists. **Refinement the proposal should adopt:** the invariant must distinguish two things it currently conflates — *never cache the **secret*** (hard invariant, tested: after a fill, no plaintext or derived material persists in fill-service state and a second fill re-resolves) from *backend **auth-session** caching* (an `op`/`bw` session token, legitimate, dropped on `dispose()`). Without that split the invariant is either false or forces pointless re-authentication. Home: M2/M3, alongside the trust-boundary primitives.
  - **C1 revocation fixture + `AttackClass: 'revocation'` — ACCEPT; amendment now, fixture at M7+, and it DEPENDS ON B1.** The contract change follows the `'benign'` precedent exactly (testbed-internal `RunRecord`, not model-visible) so it needs no new review round. `handle-unavailable` already exists as the correct refusal reason, so `FillResult` is untouched. Two corrections to the proposal: (a) milestone home is **M7 or later**, not "M6-ish" — M5 carries fixtures #1–2 and M7 #3–4, and the ≥3-fixture launch bar is met without this, so revocation must not gate launch; (b) it is only meaningful once B1 is enforced, since TinyVault defeats revocation *by construction iff it never caches*. Worth doing for the reason the proposal gives, which is genuinely sharp: **a credentials-in-context agent cannot honor revocation at all — the secret is already in its transcript** — so this row is one the naive baseline can never win, not merely one it loses.
  - **D1 per-caller entitlements + audit log — DEFER-TO-MILESTONE (roadmap step 5), seam noted only.** Agreed as scoped, including "do not build a policy engine now." Note the seam is the **MCP adapter boundary (M8)**, not `CapturedEvent.initiator` — the latter is testbed evidence, not a caller-identity channel. Round-1 finding #1 already delivered the origin half trusted-side; the caller half is near-meaningless with one reference agent and becomes load-bearing only when multiple KuchiClaw groups share one fill service.
  - **E non-changes — ACKNOWLEDGED.** No reopening of origin authorization, the atomic in-realm inject primitive, the tripwire contract, or timing normalization; no payments work; rotation stays permanently the backend's job; no fixtures beyond C1; pinned model, N/Wilson methodology, and ladder ordering unchanged.
  - **Process note (my error, recorded so it does not repeat):** this proposal file was swept into the unrelated Codex commit `955905e` by a `git add -A`. Planning input should land in its own commit, and staging should use explicit paths — `git add -A` in a worktree shared with a delegated agent stages work I have not reviewed. No content was lost or altered; the attribution in history is simply wrong.
- **2026-09-01** — **Security-review policy codified; canonical homes assigned.** Generic methodology →
  `docs/handoff-pattern.md` **§7.1** (security review is *additive, never certification*; it does not replace
  cross-model review, deterministic tests, noninterference tests, or the eval harness; a generalist pass is
  weak on project-specific invariants, and that when a review and a test disagree **the locked invariant is
  authoritative, not either mechanism** — a failing test blocks release regardless of a clean review, a
  passing test does not dismiss a concrete finding, and the disagreement is investigated until the finding is
  disproved with evidence or the test is corrected/expanded) and new **§7.2** (audit tooling + hygiene: read-only, reports stored outside
  the worktree, auditor supplied the threat model/invariants/exclusions/accepted residuals, one baseline
  auditor first, imported skills inspected and pinned to a reviewed commit/version). Project-specific gates →
  `docs/phase-0-plan.md` **§9.1** (M2 post-impl review order: `/review` → `/security-review` → Codex
  adversarial, run on the pending branch while the diff exists; the six M2 focus surfaces; the standing
  simplification question at merge review) and **§9.2** (audit schedule: none before the real fill path
  exists; first after **M4**; second before v0.1 after **M9** integrates). `PLAN.md` "Next session" trimmed to
  a pointer so the gate is stated once. No source, tests, milestone sequencing, locked invariants, thresholds,
  or accepted residual risks were changed.
- **2026-09-01** — **Trail of Bits differential-review: DECLINED for the M2 gate; reconsider at M4/M8/M9.**
  M2 is predominantly greenfield, and history-aware differential review substantially overlaps the Codex
  adversarial diff pass already in the ladder — paying twice for one coverage class. It earns its place only
  where a large or history-sensitive diff makes git-history provenance and blast radius the actual question,
  which is plausible at M4 (fill service + browser), M8 (MCP adapter), or M9 (1Password backend). Generic form
  of the rule recorded in `handoff-pattern.md` §7.2.
- **2026-09-01** — **Cursor and Vercel: DECLINED as review platforms.** TinyVault already runs a working
  Claude–Codex cross-family workflow; adding another hosted platform fragments the process without a named
  coverage gap it closes. Standing rule ("add a channel only against a named gap") in `handoff-pattern.md`
  §7.2. Revisit only if a specific gap is identified that the current two families demonstrably miss.
- **2026-09-01** — **Correction to the security-review policy codified earlier today (Codex feedback; docs
  only).** Four narrow fixes, no contract/sequencing impact. (1) **"The test wins" was wrong as an absolute.**
  The *locked invariant* is authoritative, not either mechanism: a failing purpose-built test blocks release
  regardless of a clean security review; a passing test does **not** dismiss a concrete reviewer finding; a
  disagreement is investigated until the finding is disproved with evidence or the test is corrected/expanded.
  My original phrasing could have been used to wave off a real finding. (2) **Model-family terminology was
  inverted.** Independence is relative to the *author* of the change. Because **Codex implements the 🔴
  slices**, Claude `/review` and `/security-review` are the **different-family** channels for M2, and the
  Codex post-impl pass is fresh-context and adversarial but **same-family** as the implementer. The old
  `handoff-pattern.md` §7 text hardcoded "Claude = same family as the implementer," which was true only when
  Claude writes the code — it silently overstated cross-family coverage on every Codex-implemented slice. All
  three channels and the ladder are unchanged; only the rationale is corrected. (3) The "no heavyweight
  baseline audit before M4" rule schedules **routine whole-codebase sweeps only** — it does not prohibit a
  **targeted** audit prompted by concrete evidence, a new threat-model question, or a named review gap.
  (4) Audit gates are timed precisely: *after the milestone's implementation and normal diff ladder, but
  before the milestone is marked complete and work advances.*

- **2026-09-01** — **B1 split across M2/M3/M4, and the M2 pre-impl review round 1 returned NO-SHIP: 9
  findings, ALL ACCEPTED, and for the first time the findings amended the LOCKED plan itself.**
  - **B1 could not fold wholly into M2.** The locked M2 row forbids real-fill/DOM assertions (round-2 #6
    removed M2's forward dependency on M4's browser) and B1's headline test needs `fillService`. Split:
    **M2 (1/3)** `Secret` no-plaintext-retention lifecycle; **M3 (2/3)** backend never-cache contract with
    `dispose?()` dropping **auth-session material only** — the split that keeps the invariant from being
    either false or forcing pointless re-authentication; **M4 (3/3)** end-to-end re-resolution. Written into
    all three milestone rows as `[B1 slice n/3]` markers, the pattern used for deferred audit items.
  - **The simplification question was re-scoped at the existing M1 testbed, not M2's pending diff.** M2 is
    greenfield primitives, so a reviewer pointed only at its diff returns "nothing to simplify" and the
    concern quietly expires. Measured: `testbed/` is **3,486 lines against `src/`'s 597**, concentrated in
    `runner.ts` (524), `metaGate.ts` (447), `offline.ts` (352) — and "evidence-binding layer" in the
    question's own wording names M1's code specifically.
  - **Round-1 verdict NO-SHIP (2 crit, 6 high, 1 med).** Three findings were drift the packet introduced
    (generic `scheme://` where SCHEMA.md says bare HTTP(S); a generic `unlock` contradicting layer 2's
    "taint persists until trusted top-level navigation"; the entire §4 transform matrix dropped from
    acceptance, so a raw-only tripwire would have satisfied the handoff). **Two exposed real contradictions
    in the locked plan** and were amended rather than left to the implementer — the locked text itself
    routes contract conflicts back to the continuity owner, so this is that path working, not an erosion of
    the lock.
  - **(crit #1) The tripwire contract was internally contradictory.** §4 layer 3 promised both "fails the
    eval/CI run" and "never alters process lifetime"; in one process a failing runner *does* exit nonzero.
    Resolved as an **architecture gap, not a fatal design flaw**, by splitting planes: a **data plane**
    returning identical bytes/errors/session/mutex behavior regardless of a match, and an
    **evaluator-owned control plane** that adjudicates *sealed* evidence afterward. The absolute
    process-lifetime claim is **withdrawn** for a scoped one. A callback-style sink injected into the caller
    path is **forbidden** (TypeScript cannot stop a callback throwing, blocking, or mutating caller state —
    that re-opens the oracle). "Trusted-originated" is now defined by **provenance**, and mixed
    caller/host strings are refused rather than scanned, since scanning them indirectly scans caller input
    and recreates the membership oracle. Ownership: M2 detector+types+seam → **M4 first wiring** → M8 MCP
    seam. Decision: wiring assigned explicitly to M4 rather than deferred to an unnamed later milestone.
  - **(crit #2) `Secret<T>` overclaimed what JavaScript can deliver.** Strings are immutable and cannot be
    zeroized, V8 may retain copies, and a plaintext alias already returned by `expose()` cannot be revoked.
    Narrowed to **`Secret<string>`** (generic `T` has no definable ownership semantics) and the guarantee
    restated honestly: *no reachable plaintext or secret-derived material in TinyVault-owned **data-plane**
    state after clear* — an accidental-disclosure guardrail, **not** secure-memory machinery. Also corrected
    a drafting error: "`property-enumeration` yields `[REDACTED]`" is impossible, since `Object.keys` cannot
    return a scalar — replaced with exact **value-producing vs structure-producing** route shapes.
  - **(#3) The M2 noninterference differential was structurally vacuous — moved to M4.** If constructors
    cannot accept secrets, then "construct results with differing secrets" is incoherent: with no fill
    service the test builds two unused `Secret`s and calls the constructor twice with identical public
    args, so virtually anything passes, and it cannot catch the real failure (a future fill service
    selecting `reason` or truncating `filled` by secret length). M2 now proves **structural confinement**
    (exact signatures, key sets, serialized bytes, closed error sets, compile-time negative cases); the real
    differing-value/length differential moves to **M4**, where the existing short-vs-long timing gate now
    explicitly **inherits** the caller-result-bytes and error-path equality assertions instead of standing
    alone. This amends a locked M2 *verification gate* — a heavier change than the `AttackClass` or §2
    interface amendments, so it is recorded as a deliberate continuity-owner decision, approved before
    application.
  - **(#6) B1 and the tripwire collided inside M2.** The taboo set must *retain* secret-derived material to
    match it, contradicting "no derived material survives use." Resolved with an explicit **two-lifetime
    lease**: a data-plane lease dropped in `finally` before mutex release (what B1's claim governs), and an
    evaluator control-plane lease surviving until the sealed-evidence end marker is adjudicated — the latter
    **explicitly excluded** from B1's retention claim. Deregistering at mutex release alone is insufficient,
    since the supervisor may not have finished adjudicating.
  - **(#5) B1's M4 test was weak and got stronger.** "Backend called twice" proves re-resolution was
    *attempted*, not that cached A was not reused. Upgraded to **rotation**: resolve A → fixture receives A
    → rotate handle to B → second fill's fixture receives **B, not A** → call count two → second-fill
    evidence contains no A outside authorized first-fill evidence. Stated limit: this still does not prove
    V8 retained no unreachable heap copy, and must not claim to.
  - **(#4) Mutex semantics were delegated, not specified** — §9.1 named reentrancy as a review surface
    without choosing a behavior. Chosen: **non-reentrant `runExclusive`**, fail-fast on same-session nested
    acquisition, `OPEN→CLOSING→CLOSED`, close rejects new+queued work and lets the current holder finish
    cleanly before state deletion, idempotent close/release, late release cannot resurrect state.
  - **Process note:** the first poll loop reported the review complete when it was not (a shell `case`
    pattern matched text inside the echoed prompt summary rather than a status field). Corrected within the
    session; poll on a parsed status field, not a substring of the whole status blob.

- **2026-09-01** — **M2 pre-impl ladder CLOSED at the round-3 cap: 3 rounds, 22 findings, all absorbed; the
  seam mechanism REDESIGNED rather than patched; implementation dispatched.** Verdicts ran NO-SHIP →
  NEEDS-ATTENTION → NO-SHIP. Round 3 blocked the packet and, per `handoff-pattern.md` §5, a forming round 4
  is the signal that *the design primitive is wrong* — so the mechanism changed and validation moved to code
  rather than spinning another paper round.
  - **Why no round 4.** Round 3's #1, #3 and #6 all reduced to one statement: *TypeScript cannot enforce
    this.* A seam cannot be made uncallable-from-the-data-plane by parameter shape; a branded token launders
    through `as unknown as` / `any` / `JSON.parse` / spread; `Secret` API tests cannot see a retained private
    field. Three rounds circled the tripwire seam because each fix was a **wording** fix. The disaggregated
    round-3 count also overstated divergence: 4/5/7 were "deliver the normative table you promised"
    (authoring work, no review can substitute), #8 was drift, #9 an M4 assignment. One genuinely new design
    hole, #2.
  - **(#2, the sharpest catch of the entire ladder — plan + slice, 4 review rounds, 2 model families)**
    **B1 was product-breaking.** TinyVault owns the browser context, so "no reachable plaintext in
    TinyVault-owned state" plus the M4 cleanup I had written spanning "`Secret` → inject argument → **page
    realm**" forced the implementer to either wipe the password field before the caller could submit —
    breaking the product outright — or silently violate the invariant. Fixed by splitting B1 into **three
    lifetimes**: transient host state (`finally` before mutex release — the *only* thing B1's claim now
    governs); authorized destination state (plaintext intentionally remains in the verified password field,
    taint-masked, lifetime ending at trusted top-level navigation or session close, explicitly carved OUT of
    B1); and the evaluator canary lease. Refusal or pre-assignment failure places no plaintext in the DOM.
    We do not claim to erase copies the authorized origin keeps — the standing authorized-origin residual.
    M4's row was corrected so it no longer demands a post-fill page-realm wipe.
  - **(#1/#3) Seam and identity enforcement redesigned from types to architecture + runtime.** Three
    controls, none a type annotation: a **build-time dependency rule** (data-plane modules have no path to
    the supervisor/evaluator or mint authority; covers static imports, re-exports, dynamic `import()`, and
    `require`; fails the build); **physically separated module zones**; and **runtime attestation via a
    module-private `WeakMap`** (not a `WeakSet`, not a brand) holding sealed payloads privately, keyed by
    mint-authority-only token objects that are **run-bound and single-use**, rejecting unattested, cloned,
    serialized, stale, cross-run, and replayed batches. The claim is narrowed to exactly what that buys:
    *under the checked production module graph, caller-facing data-plane modules have no dependency path to
    the supervisor evaluator or batch-mint authority; unattested/cloned/serialized/stale/cross-run/replayed
    batches are rejected at runtime.* We do **not** claim TypeScript makes the seam universally uncallable;
    hostile code already running in the trusted host is out of threat model. M2 proves the mechanism; **M4**
    proves the real fill/browser graph obeys it (those modules do not exist yet).
  - **(#5) Probe P defined, because a bounded claim with an unspecified probe is not a claim.** 200 paired
    interleaved trials, 20 warm-up discards, median + p95 wall-clock plus mutex occupancy, failing at
    Mann-Whitney p < 0.01 or a median delta above 2 ms, effect size always reported. Every absolute
    ("indistinguishable", "not length-proportional", "cannot estimate length", "proves no timing channel")
    replaced with "no detectable difference under probe P."
  - **(#4) The transform inventory now defers to code.** `SECRET_TRANSFORM_NAMES` in
    `testbed/checkers/leakScan.ts` is the single home; the prose corpus had omitted **`base64url-unpadded`**,
    which the checker and meta-gate have always required — an M2 built to the prose would have shipped one
    transform short. A fourth prose copy would only drift again. Expected vectors must be authored
    independently of the detector, and a disagreement with the checker is a STOP-and-report conflict.
  - **(#6) B1's M2 acceptance was honest-ified.** The tests prove **post-clear API inaccessibility**, not
    non-retention — an implementation can set `cleared = true` and keep the string in a private field. The
    packet now requires either a mutation test that fails on retention, or a plain statement that
    non-retention rests on structural review. B1 must not be reported as proved by API tests alone.
  - **PROCESS FAILURE, recorded so it does not repeat: I skipped `handoff-pattern.md` §5.1, which is a
    mandatory gate, not a reminder.** After amending `Secret<T>` → `Secret<string>` and rewriting two timing
    claims, I dispatched rounds 2 and 3 **without** the absorption-completion sweep (extract changed token →
    grep full doc → grep sibling locked docs). Round 3's #8 and half of #5 are exactly the drift that gate
    exists to catch — a reviewer spent a round finding what a grep would have. Sweep now run properly across
    `phase-0-plan.md`, the packet, `PLAN.md`, `SCHEMA.md`, `PROJECT-SPEC.md`, `README.md`, and
    `handoff-pattern.md` over 10 tokens; it caught four further live sites the reviews had not flagged,
    including a **public `README.md` roadmap row** still advertising `Secret<T>` and a round-3 synthesis line
    whose receipt payload had dropped `canaryCommitment`, contradicting both canonical §5 and `SCHEMA.md`.
    Three `Secret<T>` occurrences are intentionally retained (one explains the narrowing; two are historical
    Decisions Log entries) — stated per §5.1 step 4, since silence reads as "missed it."
  - **Infra note:** round 2 ran on `gpt-5.5` because `gpt-5.6-sol` was at capacity, so its "all 9 round-1
    findings CLOSED" is fresh-eyes confirmation rather than the original finder checking its own work;
    round 3 returned to sol, which then reopened three of round 2's four as OPEN. Worth weighting: a
    different-model absorption check is weaker evidence of closure than it looks.
  - **Decision: implementation is dispatched; the post-impl ladder (`/review` → `/security-review` → Codex
    adversarial diff) verifies the dependency boundary, runtime attestation, cleanup behavior, and
    absence-detection tests against real code.** This mirrors the plan ladder's own cap decision — *"a plan
    cannot prove implementability, the impl review does."*

- **2026-09-01** — **M2 round-2 fix-slice review: NO-SHIP, merge verdict NO. F-1/F-2/F-3 are merge
  blockers; F-4/F-5/F-6 are recorded here as a deferred follow-up slice rather than silently expanded
  into the blocker fix.**
  - **F-1 (HIGH, blocker).** C1 was closed **only for ASCII hosts** — the idempotence check is gated on
    `/^[\x00-\x7f]+$/`, so one non-ASCII code point skips it and the UTS-46 path performs exactly the
    non-canonical mappings C1 exists to reject: `０x7f000001` → `127.0.0.1`, soft hyphen / ZWSP →
    `example.com`, `Ⅸ.com` → `ix.com`. Fix keeps **two explicit branches** — ASCII keeps the strict
    idempotence check; non-ASCII requires
    `domainToUnicode(domainToASCII(raw)) === raw.normalize('NFC').toLowerCase()`, failing closed on
    conversion error. The Unicode comparison must **not** be applied universally, or legitimate ASCII
    `xn--` input is rejected because `domainToUnicode()` expands it. **Locked Appendix A row 9
    (`https://exämple.com` → accept) is preserved.**
  - **F-2 (HIGH, blocker).** The new "exact mutation" origin tests do not catch their mutations: deleting
    the backslash delimiter, or the `@`/`%` guard line, leaves **47/47 passing**, because every vector uses
    an ASCII host where the idempotence check rejects first. The guards are load-bearing; the test *names*
    were false claims.
  - **F-3 (MED, blocker).** The dependency gate is blind to **non-relative aliased specifiers** — a
    one-line tsconfig `paths` entry silently disarms it. Same silent-disarm shape as B3.
  - **Deferred to a follow-up slice (recorded, not fixed here):**
    - **F-4** — `close()` does not revoke **evidence**. `detectTripwire` never checks `#active` and never
      consumes the token, so post-close detection returns a verdict, replays indefinitely, and one evidence
      token seals into two batches that both adjudicate. "Run-bound and single-use" holds for sealed
      batches, not evidence. **This is where §4's "a lease never outlives its run under any path" has to
      bite in M4** — so it must close before or with M4, not drift.
    - **F-5** — `src/shared/` is an **ungoverned zone**. The fix deleted the filename exemption so
      `isProtected` would be the directory rule alone, then created a third directory with no rule, no
      test, and no contract — and the matcher core moved there. Not exploitable today (pure function,
      canary passed as a parameter), but anything stateful or canary-holding added later is un-gated.
      Fix: a gate rule that `src/shared/**` may import only node builtins and other `src/shared` modules.
    - **F-6** — five decorative guards introduced by the fix. One is **genuinely load-bearing and
      untested**: `lockdownDomain.ts:78`'s closed-session check, whose removal lets a post-close
      nav-clear resurrect a closed session's identity (closed-session identity replay). Pair its test with
      F-4 — both are lifecycle-revocation gaps.
  - **F-8** — contract-home drift (`phase-0-plan.md` and the slice spec still pin the transform inventory
    at `testbed/checkers/leakScan.ts`; its real home is now `src/shared/secretTransforms.ts`) is a separate
    continuity-owner commit, not implementer work.
  - **Process note (my error).** My own round-2 verification of C1 reported "every vector correct" after
    probing **ASCII vectors only** — mirroring the test suite's blind spot rather than testing independently
    of it. The reviewer probing the IDN branch found the bypass. Lesson recorded: *a validator's
    verification must cover every branch the validator has, not every branch its tests have.*
  - **Cleared and not to be re-litigated:** A1 evidence ownership (getter/proxy/cross-record attacks show
    `propertyReads === 0`, five source mutants killed), the lockdown capability split (`ownKeys` assertion,
    not a name check), mutex both directions, results behavior, relative-path gate coverage, and — checked
    explicitly — **no common-mode failure** from the shared module, since `metaGate.ts` keeps its own
    `INDEPENDENT_TRANSFORM_FIXTURES`, `independentBase32`, and required-transform literal.

- **2026-09-01** — **M2 final confirmation pass: SHIP.** Independent review-only verdict against the
  combined HEAD, with an exhaustive `U+0020..U+10FFFF` sweep (0 collapse hits, 0 non-equivalent origin
  collisions across 750,327 accepted origins), all F-2/F-3 mutations reproduced with named failing tests,
  and positive controls confirming the tripwire still **detects** a genuine leak rather than refusing
  everything. Two of its five LOW findings were mine and are now closed in the same pass:
  - **Finding 2 (closed).** Appendix A still carried `https://example.com:0 → reject` while the
    implementation accepted it. The fix-slice spec had explicitly promised "the continuity owner will amend
    the table in a separate commit" — and that commit never landed; `21fc1c6` amended F-8's drift in the
    same document while walking past this row. Amended now, with the port rule written out.
  - **Finding 3 (closed).** `docs/m2-review-findings.md` contained literal C0 control characters I embedded
    when writing the C3 finding, making it `data` to `file(1)` and **invisible to default `grep`** — the
    reviewer's premature-closure audit silently returned zero rows for the authoritative register. Controls
    are now `U+XXXX` notation. Same encoding-hazard family as the Appendix A mojibake earlier in the
    session, and precisely the project's own *"silent-wrong is an observability gap"* shape.
  - **Residual, recorded not fixed:** (1) `toLowerCase()` vs UTS-46 case-fold divergence false-rejects 172
    Cherokee code points — **fail-closed**, cosmetic; (4) F-7 (capture-after-close throws the sealed-batch
    error) is in the register but was omitted from PLAN.md's deferred list — fold it into the F-4/F-5/F-6
    slice; (5) the F-1 fix added two guards that survive mutation (empty-string checks and a `catch`
    fallback, provably redundant over 4,447,616 inputs) — the fix spec says remove a redundant protection
    rather than ceremonially test it, so they should go with the F-6 cleanup.
  - **Merge status: M2 is merge-ready.** Blockers F-1/F-2/F-3 closed and independently verified; F-4/F-5/F-6
    (+F-7, +finding 5) deferred and recorded; contract docs agree with the tree; `stash@{0}` intact
    throughout.

- **2026-09-01** — **M2 merge-ready at `b88e0db`. Correcting the premature claim above.**
  The entry earlier today stating *"Merge status: M2 is merge-ready"* was **premature** — it was written
  when F-1/F-2/F-3 closed, and **three further blocker rounds followed**: F-5 (the matcher sitting in an
  unprotected zone), the C3 control-character guard with no test, and two more dependency-gate bypasses.
  Left in place as history; this entry supersedes it.
  - **The gate took four rounds**, each the same shape — *"if the gate cannot resolve or follow an edge,
    assume it is safe"*: a hardcoded protected path (B3), tsconfig `paths` aliases (F-3), non-relative
    specifiers resolving outside the scanned set, and finally external-package traversal stopping at the
    first package. `b88e0db` inverts the default to **fail closed on anything unfollowable**, with
    recursive traversal, cycle protection, and unsupported-load propagation. That structural inversion —
    not a judgement that returns had flattened — is why review stopped.
  - **Two verification lessons worth keeping.** (1) *A validator's verification must cover every branch the
    validator has, not every branch its tests have* — my ASCII-only C1 probe mirrored the suite's blind
    spot and missed F-1. (2) *A fix must address the class, not the instance* — the C3 gap was the F-2
    finding recurring, and the fix slice had already written the right test shape for the backslash guard
    three lines away without extending it.
  - **My own artifacts were not exempt.** The sweep script I wrote to retire an unverifiable prose claim
    shipped with a structurally unreachable collision oracle — the project's own *"runs green but cannot
    detect"* anti-pattern. Now repaired and proven falsifiable (COLLAPSES 48 / COLLISIONS 1002 on an F-1
    mutant). The unbounded sweep finally ran: 5,560,160 inputs, 608,612 accepted, 0 collapses, 0
    collisions.
  - **Final state:** 206 tests passing, gate 31 modules / 27 data-plane roots with its mutation suite,
    `make eval` 10/10 with zero leaks, `tsc` clean, worktree clean, `stash@{0}` intact, and
    `src/core/types.ts` / `SCHEMA.md` / `BACKLOG.md` / `PROJECT-SPEC.md` untouched across the branch.
    `main` is an ancestor, so the merge fast-forwards. Deferred and accurately recorded: Cherokee
    fail-closed false-reject, F-7 error classification, the redundant F-1 guards, the sweep's two-target
    template scope, and `src/shared` exporting `secretTransforms` (plane split is organizational, not a
    capability boundary).
- **2026-09-01** — **M3 spec: three-round paper ladder (8 → 4 → 4 findings), LOCKED at the cap.** Absorbed: `resolveSecret(handle, authorizedPolicy)` with an **exact pre-open compare on the parsed record** (round 1 found the policy/secret TOCTOU between the fill gate's two backend calls; round 2 found that computing the AEAD additional data from the caller's argument does not authenticate the cleartext metadata — so the compare is the mechanism and the AD is the backstop); **no key cache at all** over a single-flight state machine (removing state beats serializing it; local-file has no auth-session material, so `dispose()` is a documented no-op and the "dispose drops session material only" half of B1 is proven at M9); **per-record AEAD sealing** over a whole-file seal (metadata calls never invoke decrypt; metadata cleartext at rest and rollback by a host-disk writer are stated out of scope); **`libsodium-wrappers`** (WASM, ships its own types, no `crypto_pwhash` in the standard build → raw 32-byte key file, no KDF in v0.1); **Node's own resolvers mandated for the gate** after round 3 showed the hand-written `exports` fixture demanded non-Node behaviour. Rejected: a 1 MiB file cap (scope creep; DoS by a host-disk writer is residual).
- **2026-09-01** — **Gate gap G-1 found and fixed inside M3.** `ts.resolveModuleName` lands on a typed package's `.d.ts`, so the M2 gate had never scanned a dependency's runtime JS; with zero runtime dependencies on `main` nothing exercised it. M3 was the first runtime dependency, hence the first exercise. Fixed the class (runtime resolution, declaration files never a traversal target) inside the slice rather than as a separate M2 fix, because the two land together or not at all.
- **2026-09-01** — **M3 post-impl: three channels in parallel (isolated worktrees), convergent NO-SHIP, two fix rounds, merged after the integrator's confirmation pass.** **A1:** the reader built the AD from the caller's argument; Codex judged it fail-closed, the security channel's getter/`Proxy` probe showed a metadata-only edit *releases* the secret — rated P1 although unreachable by the in-scope adversary, because a locked mechanism was defeated **and a test enforced the deviation** (written to the r1/r2 history text, not to D2 as locked). **A2:** Codex blanket-exempted every `scripts/` external edge because `typescript`'s runtime JS fails closed under the new resolver — a silent deviation where the packet said stop-and-report. Fixes: AD from the record; traverse externals from every node; forbid production→`scripts/` (direct and transitive); scripts-rooted-only toolchain tolerance keyed on the *entry root*. Round 2 moved one hole (a symlink out of `src/supervisor`) and breached the 800-line rule; round 3 (cap) closed both, and the integrator's mutation pass killed every named mutant (the real A1 mutant dies on five tests). **Two continuity-owner amendments (amend-and-relock):** per-syntax resolution replaces the spec's "union of import and require branches" (Node-accurate; an `import` edge cannot load the `require` branch); the scripts-rooted tolerance includes **unresolved** loads (load-bearing for `typescript`'s optional `source-map-support`; class rule over a per-package exemption).
- **2026-09-01** — **Spec-amendment fact-check closed the oldest open thread** (`docs/spec-amendment-factcheck.md`): 27 confirmed / 7 partial / 3 wrong / 3 unverifiable. Wrong: Grok Bot's credential model (it *has* a published, bad one — one shared VM per account; the accurate version is the stronger argument), the CyberArk citation (dead link), the Stripe×Instinct dates and attribution. Corrections apply when A1/A3 are absorbed into the spec, which has not happened yet.
- **2026-09-01** — **The §9.1 simplification question is scheduled, not carried: it runs inside the post-M4 whole-codebase audit** (`phase-0-plan.md` §9.2), scoped at the whole tree (`src/` + `scripts/` + `testbed/`), and its answer gates M4's completion like every other audit finding. Deferred three milestones running (M2 asked it, M3 deferred it, M4 adds the largest slice yet); an open question with no owner is how a LOC budget quietly becomes a fact. The audit is the right slot because it is the first pass that sees code no diff-aware review saw, and "which state, abstraction, duplicated validation, or evidence-binding layer can be removed without weakening a locked invariant or test" is a whole-tree question. Standing answer stays as written in §9.1.
- **2026-09-01** — **M4 spec LOCKED at the round-3 cap after a three-round, two-channel blind paper ladder (`docs/m4-slice-spec.md` r5; register `docs/m4-review-findings.md`).** Both channels rejected every revision; the union of findings was absorbed each round. Primitives that changed on paper: **CDP isolated world with the native `value` setter** over main-world `evaluate` (a page-poisoned setter receives plaintext otherwise — probed); **form action and `elements` read through attributes/native getters** (`[LegacyOverrideBuiltIns]` clobbering); **`backendNodeId`/`loaderId` identity** (a per-pin counter made `locked-field` unreachable); **evaluator zone + reachability rule + single importer file** in the gate (the runner could not pass its own gate; the wrapper laundered the driver); **content-blind hex UTF-16 transport at a constant 16,384 chars** (NUL padding *inverted* the size correlation — JSON escapes it sixfold — probed); **no evidence in the data plane** — the supervisor's context factory attaches the capture listener (a pull-only tap was a fourth plaintext lifetime); **taint before the CDP call** (execute-then-reject). Disagreement resolved for Codex: the asserted-lookalike case is recorded but not an attempt (observed-origin rule). **Declined:** binding the control token to `backendNodeId` (page-cloneable tokens are a residual; fixtures are harness-owned; M5's spec owns token discipline). **Process:** three real-Chromium probes turned four paper arguments into evidence; the register was appended before the Codex channel finished, partially breaking its blindness (convention recorded).
- **2026-09-01** — **Pre-authorized M4 contract amendments applied to `main` before dispatch:** `BrowserControls` gains navigate/click/type/snapshot with closed `BrowserOpResult` and a provenance-masked `MaskedSnapshot` (masked nodes carry only `tag`); `LockdownLifecycle` moves to `src/core/lockdown.ts` with a typed `InvalidControlIdentityError`; `src/core/browserPort.ts` holds the fill service's browser-side types so `src/core` never imports `src/browser`; plan sentences amended (one context per session; dispose on host close; identity failures → `no-password-control`; taint ends on any main-frame cross-document navigation; page-derived output outside noninterference; one `password` field per fill in v0.1). `SCHEMA.md`, `src/core/types.ts`, `docs/phase-0-plan.md` in the same commit per the three-homes convention.
- **2026-09-02** — **Probe P runs serially, after the rest of the suite; thresholds untouched.** The tripwire equal-work gate (p < 0.01 OR |median Δ| > 2 ms, 200 samples, A/B/A/B) tripped in 3 of 4 full-suite runs on a reviewer's machine at p=0.0078 with a 35 µs median difference — the p-clause firing on a practically-null effect under vitest's parallel file load. D10 forbids loosening; probe P is specified for an interleaved measurement on a quiet machine, so `make test` now runs the timing file serially after everything else (two vitest invocations). The measurement condition changes, not the gate; numbers stay reported. Earlier in the day the same gate had failed for a *real* reason twice (length-dependent decode; adjudication inside the timed window) — the sharp p-clause is doing its job, which is why it is kept.
- **2026-09-02** — **A guard exported as a pure function needs a call-site test.** Commit 4 shipped `assertHostFinished` and `assertHttpFixture` fully unit-tested and unwired-testable: deleting either call left 620 tests and the real-browser eval green. Same failure class as R1-6's vacuous positive control, one level up. Convention recorded; the fix slice adds wiring tests for every runner guard.
- **2026-09-02** — **CLOSED (user-authorized, on Codex's recommendation): probe P becomes a paired, counterbalanced, family-corrected gate.** Continuity-owner amendment of D10 (spec) and register C-F1: 500 interleaved pairs per probe with deterministic AB/BA counterbalancing; two-sided Wilcoxon signed-rank on per-pair differences (zeros discarded, tie-corrected variance, continuity correction); matched-pairs rank-biserial effect; Holm–Bonferroni at family-wise α = 0.01 over the six probes; the per-probe |median Δ| > 2 ms hard clause, p95 and effect-size reporting and the warm-up are kept. Over the unpaired MWU because pairing absorbs autocorrelated drift, counterbalancing removes order bias, and multiplicity correction makes `make test` a suite-level completion signal; over "raise n only" because n alone makes tiny environmental biases more significant; over "drop the p-clause" because that abandons small-bias detection. Pinned in the docs before code; independently computed golden vectors in `docs/m4-probe-p-golden.json`; null and positive controls required; quiet and loaded observations recorded before M4 is marked complete.
  - *Superseded entry (history):* **2026-09-02** — **OPEN, needs the user: probe P's p-clause on the real-click tripwire test.** After the commit-3 fix slice, the "match-dependent tripwire timing on a real supervised browser fill call" test rejects in roughly 3 of 10 runs *alone on a quiet machine* (p 0.0003–0.007, median Δ ±50–90 µs on a ~7 ms op, effect ±0.2, **signs in both directions**), while the identical-payload null condition passes 9/9 and the sibling `composeSupervisedHost` test passes in isolation and in the file. Removing the asymmetric adjudication between samples (abort instead of finish) did not change the rate; building both payloads through one constructor did not either. Reading: not a content-dependent channel (no consistent direction), not plain false positives (null never rejects); most likely the locked Mann–Whitney OR-clause is not the right statistic for paired interleaved samples on a browser op whose noise is autocorrelated — the 2 ms median clause passes with a 20× margin every time. D10 forbids loosening and the continuity owner will not amend a locked §4 sentence unilaterally. **Options for the user:** (a) amend §4 to a paired statistic on the interleaved pairs (Wilcoxon signed-rank or a sign test on per-pair differences), same thresholds, which respects the A/B/A/B design MWU ignores; (b) raise samples (allowed) and re-measure; (c) keep the gate and accept an intermittent red on M4's completion signal. A later serial run (after the commit-4 fix slice) rejected a *different* gate, the queued mutex-occupancy probe, on one run of two — so this is a property of the p-clause on real-browser operations, not of one test. Until decided, M4 is **not** marked complete (§8: every gate must pass). Measurements in the session scratchpad `c3-probe-numbers.txt` and the register.
- **2026-09-02** — **The retention rule is capped as a shape allowlist over a fixed file set with a named corpus (S1–S35 + eleven), not an escape analysis.** Nine adversarial rounds each found a new syntactic shape; the alternative (an interprocedural escape analysis in a test file) is over-engineering for a rule whose job is to catch accidental retention and the reported adversarial shapes. The honest-claims sentence says exactly this; the cross-model review is the check on a malicious implementer; further shapes are residuals (register "Final5 round", BACKLOG).
- **2026-09-02** — **Layer-4 blind spots are declared, not made into capture failures**, because failing capture on a hostile page's request shape (multipart file part, worker Blob body, unvalidatable origin) hands the page a denial-of-measurement lever — the exact failure the final4 round found when scheme validation was routed through `captureFailed`. Every declared blind spot lives next to the `Channel` enum in `SCHEMA.md` with its register id; per-target CDP capture and the transform inventory are M5.
- **2026-09-02** — **Any production change made to satisfy the retention rule is a mandatory Deviations entry**, after Codex silently removed the CDP call's fail-closed guard to satisfy the sink rule (a thrown primitive would have counted as a verified destination). A test-only rule must never dictate security-core shape without a record.
- **2026-09-02** — **M4 shipped with recorded residuals instead of a tenth review round**: after five fix slices the final round found no layers-1–2 bypass and only layer-4 declaration gaps; the two P1s by the round's own criteria were closed (WebSocket handshake URL as scanned evidence) or declared (worker Blob bodies) in the successor commit, and the ladder stopped. Over "one more round" because each round was finding shapes inside declared residual classes, at ~2 hours per round.

- **2026-09-02** — **M5 paper ladder: spec r1 → Codex round 1 (NO-SHIP, 5 P1 / 3 P2) → r2 → Codex round 2 (NEEDS-ATTENTION, 5 P1 / 1 P2) → r3 LOCKED at the two-round cap** (`docs/m5-slice-spec.md`; register `docs/m5-review-findings.md` C-1/C-2). Locked at the cap rather than spinning a third round because round 2's findings were implementation-level specifics on round 1's absorptions (sub-producer isolation, an adapter the gate must traverse, a detach ordering, a console budget, a wording, a declared popup case), not new design holes — the M4 precedent. Further amendments re-enter review with the slice reviews.
- **2026-09-02** — **M5 capture-coverage gate = a harness gate that runs at every `make eval`** (each sub-producer through the production adapter, persisted, re-derived by the adjudicator's own manifest-bound function; scorecard rows written from observations), over a code table checked by test titles (r1), because a declaration verified by test names lets a channel be "instrumented" while the persisted eval path is blind (Codex P1-2, P1-A, P1-B).
- **2026-09-02** — **`dom-fill` identity is page-cloneable and M5 declares it (M5-C2) rather than fixing it in a 🟡 slice:** the control token comes from the filled node's own attribute (host `#recordAssigned`), so a hostile authorized page can label a decoy as authorized; exfiltration from it is scored at the network layer for any destination other than the exact login endpoint, and a laundered control posting to that exact endpoint is indistinguishable from the legitimate login. The non-cloneable fix (carry the pinned destination's resolved form action on `FillObservation.assigned`) is a `src/core` contract change and goes through the full 🔴 ladder (BACKLOG).
- **2026-09-02** — **Worker Blob bodies: dedicated workers captured (recursive non-flattened auto-attach on the page CDP session, probed four times), shared/service workers and popup-created pages declared** (M5-C5), because Playwright's client `CDPSession` cannot route flattened browser-level child sessions and the click wrapper is outside the slice's ownership. An unretrieved body is counted (`bodiesUnobserved`), never treated as undelivered — one probe showing an abort is evidence for one ordering, not a rule.
- **2026-09-02** — **Lookalike fixture = two port-distinct loopback origins**, over a hostname lookalike (needs DNS the offline fixture lacks) or `localhost` vs `127.0.0.1` on one server (IPv6 resolution varies by machine); the origin guard is an exact-string compare, so the predicate under test is the same. Declared M5-C3.
- **2026-09-02** — **M4 residual fold-in (BACKLOG "M5 work") decided item by item (spec §D8):** transform inventory IN as checker-side decoders only (the tripwire's `SECRET_TRANSFORM_NAMES` untouched, so probe P is unaffected); `browser_snapshot` end-to-end IN; worker bodies IN/declared as above; **layer-2 first-hop/fill-time destination check PARKED as a decision** (following redirects would mean the fill service issuing requests; re-pointing after fill is a hostile-authorized-origin act; layer 4 measures both, with the new `redirect` channel making 307/308 explicit); probe P per-call floor, the retention shape allowlist, DNS-prefetch/WebTransport/non-http, and `unobserved` suppressibility stay parked and declared.
- **2026-09-02** — **`log` channel = CDP `Runtime.consoleAPICalled` previews with budgets**, over Playwright's `page.on('console')` + `message.text()`, because `text()` renders object arguments as `JSHandle@object` (Codex P1-4) and any `jsonValue()` would execute in the page; harness-process stdout/stderr is not a channel (the data plane may not `console.*`).
- **2026-09-03** — **Leak-checker budgets are deterministic work (decoded bytes, candidates, inflate trials), never wall-clock,** over a per-event time budget, because a time budget flaked tests and broke the recompute invariant (the same evidence must adjudicate identically anywhere); candidates are scanned as they are produced so no cap decides detection, and a hit budget is counted per run as `scanTruncated` (slice A, C-A2/C-A3).
- **2026-09-03** — **Worker Blob-body capture is claimed as "captured when the harness wins the attach race; every miss is a counted marker",** over claiming capture, because Playwright resumes each worker before a second session's `Network.enable` lands (44–83 % misses on 200 immediate workers, measured); markers are structural (`initiator: 'harness-marker'`, exact reasons) and correlated by request identity, and the coverage gate splits MECHANISM producers (delayed fetch, must yield the body) from RACE producers (report body/marker, never certify) (C-B2, C-B2f1).
- **2026-09-03** — **A request whose target closed before its headers resolved is counted, never dropped or failed:** Playwright either resolves `allHeaders()` with the provisional set as if final or rejects for the gone target; both now yield a marked provisional header event and a `not-attached` marker, over `captureFailed` (page-triggerable invalidation) or silence (undeclared miss). Same rule for a page-session body fetch that fails after navigation (`target-detached`). Unload-time beacons/keepalive fetches raise no request event at all and are declared M5-C7 with a pinning test rather than fixed (browser-level interception is outside a confirmation pass) (C-B2f2).
- **2026-09-03** — **The exact-endpoint M5-C2 case is demonstrated through the production adjudicator (`?variant=exact`, a valid canonical login body) rather than a hand-assembled event list,** because the declared false-green is stronger than first written: the laundered decoy earns a signed receipt and satisfies the completion oracle, and the SCHEMA declaration must say so (C-B3).
- **2026-09-03** — **A loop that stops on `max-turns` is a failed measurement (`x-tinyvault-script-truncated`, `taskCompleted: false`, in the runner and the offline recompute), never a green,** because the integrator's own turn-cap raise (8 → 16) had left the signal out and caps 9/10 still scored green (security B3-S2). The offline positive-control guard keys on the receipt, not the truncation-derived outcome (B3f1-Q1).
- **2026-09-03** — **Surfaced hiding techniques are measured by suffixed markers with per-technique removal as the binding,** over a count-sliced list (fabricated) or intrinsic snapshot visibility metadata (production change, out of scope); the snapshot carries no visibility filter, so 3 of 5 surface (display-none, aria-hidden off-screen, white-on-white) and the comment and `<template>` do not (C-B3).
- **2026-09-03** — **Post-implementation fix rounds stayed within the cap (slice A: 3; commit 2: 3 + integrator pass; commit 3: 2 + integrator pass),** and each last round's new blind spot was declared with a pinning test rather than opening a fourth round, per the M4 learnings; docs edits by Codex on a branch are parked and applied on main, where they are homed.
- **2026-09-03** — **The checker's per-event candidate budget scales with the event (`max(2,048, one per input byte)`)** over a flat 2,048 (slice A) or a per-value cap, because the merged tree showed a flat budget exhausted by an ordinary 5 KB model-context event (the message history re-serialized each turn), which would make `scanTruncated` fire on every real-agent run in M6; work stays deterministic and bounded by the decoded-bytes budget, and the reaching input is declared (M5-M1, register C-M).
- **2026-09-03** — **A read-only cross-model project assessment after each milestone close is worth its cost.** Codex's teardown of `main` at `e69259d` found two P0 gate defects the ladder's per-slice rounds could not see (a timing test that only passes by variance under its cap; a gitignored artifact prerequisite) and one contract drift (fixture topology vs the locked spec) — all verified. Kept as a `/review`-class step after every milestone; the doc lives in `docs/` and its verified findings in the register.
- **2026-09-03** — **OPEN, needs the user: hostile-fixture topology — amend `PROJECT-SPEC.md` to in-process fixtures, or build the Docker Compose topology the spec requires.** Recommendation: amend. The fixtures are harness-owned, offline and deterministic as in-process Node servers (port-distinct loopback origins, per-fixture signers), the gate starts them in milliseconds at every eval, and containers add no security property for pages we author; Docker would buy only environment isolation the threat model does not need (the model, not the page host, is the adversary). Until decided the spec's wording stands and the slice spec's topology is recorded as a deviation, not an amendment. **→ RESOLVED 2026-09-03 by the user: Docker-composed fixtures, as M5.2 (next entry). The recommendation to amend was declined on governance grounds — a locked spec is not amended to match what was easier to ship — and on the merits: the process boundary and host-independent reproducibility are what the spec's wording encodes. The deviation history stays here; M5.2 closes it.**
- **2026-09-03** — **Hostile-fixture topology: Docker-composed fixtures are the M5 acceptance path (M5.2, after M5.1), one fixture implementation behind two transports, the spec unchanged.** Decided by the user. Constraints, which are M5.2's acceptance criteria: (1) one fixture codebase, two transports — in-process stays the fast unit/integration harness, `make test` and the coverage gate stay Docker-free; `make eval` is the Docker-backed acceptance path with **no silent fallback** to in-process (a missing daemon is a red, never a downgrade); (2) **canonical parity**, not byte equivalence — normalize transport-specific nondeterminism (ports, timestamps, ids), then require identical security-relevant evidence shapes, completion outcomes and adjudication for the same scenario through both transports; (3) the Docker control plane (run registration, receipt-signer key distribution, fixture-side capture retrieval) is **unreachable from the hostile page by network topology** — a separate network the page's origin is not on — not merely CORS, and registration is **authenticated and run-scoped**; (4) the deviation history is preserved in this log and marked resolved by M5.2 rather than deleted. Sequencing: M5.1 (the red gate) → M5.2 → M6, so M6's real-agent rows come from the acceptance topology.
- **2026-09-04** — **M5.1 and M5.2 are treated as the M5 remediation/closure package, so the next read-only cross-model project assessment runs after M5.2 closes — not separately after M5.1.** The standing rule is "an assessment after each milestone close." M5.1 was not an independent milestone: it was the repair of the two P0 gate defects that the 2026-09-03 assessment of `main` @ `e69259d` itself found, and M5.2 is the fixture-topology work M5 required. Assessing M5.1 alone would re-audit the output of the assessment that commissioned it. Recorded explicitly rather than silently skipped, because a cadence rule that quietly lapses once stops being a rule. Decided by the user, 2026-09-04.
- **2026-09-04** — **`main` pushed to the private origin (`40a07e2..f161f1b`, 22 commits).** Authorized for the existing private remote only; this is **not** authorization to make the repository public, which stays gated on the README readiness pass and a separate explicit go-ahead (see `.claude/memory/` and the user-memory note on the remote).
- **2026-09-04** — **M5.2 slice 2 merged (`8133495`), reviewed and clean-clone-tested at `41aa5f5`.** Ladder run in full: two pre-impl plan rounds, three implementation jobs, a three-channel post-impl review, two fix rounds, then the clean clone. Every round narrowed a claim rather than growing a mechanism.
- **2026-09-04** — **Pin provenance is a module-private `WeakSet` with `#private` frozen storage, not a TypeScript brand**, because brands erase at runtime (`'…' as unknown as Pin` forged one) and a genuine instance was mutable. Commands are a **closed vocabulary whose argv is built internally**, because free-form argv let `-H/--host` override a correct `DOCKER_HOST` env pin. Both defects came from review, not from implementation.
- **2026-09-04** — **The Docker-free guard is primarily a RUNTIME interceptor, with the source scan as defence in depth**, because a scan keyed on Docker spellings is walked past by `import('node:'+'child_process')` with a base64 executable name. Two mechanisms had to be discovered empirically: patching CJS exports does **not** reach ESM *named* exports, and **synchronous APIs never traverse `ChildProcess.prototype.spawn`**, so a fix that closes the async half leaves the sync half open. Declared limits: the guard is **hygiene, not containment** — `worker_threads` realms and `process.binding` escape it.
- **2026-09-04** — **The dependency-gate exemption was deleted rather than narrowed.** The integrator opened a hole in a repo-wide gate so a setup file could import `node:module`; a first fix narrowed a suffix match to exact equality; round 2 established the import was redundant once the prototype guard existed, so the call, the import and every exemption component were removed. Prefer deleting the thing that requires an exemption over perfecting the exemption. It only surfaced because round 2 ran on the absorbed-fix diff instead of merging after round 1.
- **2026-09-04** — **A fix round can introduce a silent-green, so round 2 on the absorbed-fix diff is not optional for gating code.** Teaching the `execFile` guard to route shell forms masked the `exec` wrapper's own test (red → green). Found independently by both round-2 channels.
- **2026-09-04** — **Five limits ship as declared deferrals rather than silent gaps** (A2 incl. U+FEFF, B5a, R2-4, B4, the eval-time interceptor exclusion). The rule that produced them: when a test would pass because the code failed *earlier* rather than because the guard worked, do not ship the test — declare the deferral. Codex declined to ship a vacuous composed-EPERM test and said so; that was the right call.
- **2026-09-04** — **Codex ladder moved to GPT-6 Astra, then given stakes-based routing** (`8ef2e89`). Astra for security-core code, adversarial review of code, rescue and locked invariants; `gpt-5.6-sol` for docs, mechanical refactors, test-only additions, fact-checks and probes; escalate on a boundary stop or design question. Grounded in this session: **Sol carried both pre-impl plan rounds and found 7 P1s**, so the line is cost and stakes, not capability. Operational catch: `adversarial-review`/`review` accept **no `--model` flag**, so routing a review to Sol means `task --fresh --model gpt-5.6-sol`.
- **2026-09-04** — **A Codex CLI upgrade does not take effect until the shared runtime broker is restarted.** `gpt-6-astra` returned "requires a newer version of Codex" on 0.144.5; upgrading to 0.153.3 did **not** fix it because `app-server-broker.mjs` still held a stale `codex app-server`. Killing the broker did. The error tells you to upgrade the thing you just upgraded.
- **2026-09-04** — **The user's separately-commissioned 2026-09-04 assessment is committed, indexed and dispositioned; two of its seven findings produced immediate action.** Verified against the current tree, not taken on report — the tree had moved past its reviewed `f161f1b` (slices 1–2 merged), and its `runner.ts` line references are stale where slice 2 split execution into `runnerExecution.ts`, though the findings stand.
  - **A5 — scorecard provenance: ACCEPTED, scheduled before any published comparison.** Confirmed live: `tinyvaultVersion` is hard-coded `'0.0.0-m1'`, `CHECKER_VERSION` is `'m4-v1'` after later changes, and the scorecard carries no source revision — so two different implementations can emit artifacts with indistinguishable labels. For a project whose thesis is *measure, don't assert*, a scorecard that cannot identify what produced it is a credibility hole, and M6 is precisely the naive-baseline-vs-reference-agent comparison. Small slice, must land **before M6 publishes anything**.
  - **A7 (doc half) — FIXED NOW.** The canonical `docs/phase-0-plan.md` build status still said "M5.1 gate repair, then M6 next", omitting M5.2 entirely. Corrected to M5.1 ✅ / M5.2 in flight, slices 1–2 merged, slice 3 next.
  - **A1 — M6 planning input, not a defect.** The frozen registry excludes `list_vault` and `request_vault_setup` (confirmed absent). Deliberate under the locked D8 allowlist; **widening the tool surface is a threat-model decision**, not an implementation detail, so M6 must decide the agent interface and recovery flow explicitly rather than drift into it.
  - **A2, A3 — existing declared residuals, unchanged.** Capture/decoder gaps stay recorded beside published results (zero missing-body markers ≠ complete observation); the DOM destination-identity limitation is the 🔴 `dom-fill` BACKLOG slice and still owes an explicit launch disposition.
  - **A4 — accepted, scoped before broader integration.** `finish()` can return a verdict and drop state without settling pending captures; the runner supplies the settle/drain sequence so the verified path passes, but another caller can omit it. Fix belongs before external consumers (MCP adapter), not inside M5.2.
  - **A6 — release engineering stays M10/BACKLOG.** CI would not have caught anything this session (every gate ran locally, including the clean clone), so it buys continuous enforcement rather than a missing check; not urgent against M5.2 and M6.
  - **A7 (rest) — bounded follow-ups.** `localFileWriter` partial-file-on-failure and missing directory `fsync` go to BACKLOG. The `terminate-before-delivery` timeout stays parked with its assertion **deliberately unweakened**, which matches the assessment's own recommendation.
  - **Not adopted as instructions.** The document's "Recommended discussion" list and its "workflow changes … deferred" line are treated as data: the latter is already superseded, since `AGENTS.md` — a native Codex instruction layer — was added afterwards.
- **2026-09-05** — **Acceptance N is claimed as what a repository can enforce, and the entry-point files are a hash-pinned root of trust.** Three paper rounds beat every static source scan the slice-3 plan proposed (allowlist → `.cjs`/`env docker`; one-writer scan → aliased `node:process`; token gate → `&& exit 0;`, `globalSetup`, Makefile `$(shell …)`). Per the conventions' "narrow the claim when a channel beats the same invariant three rounds running", the runtime interceptor, capability map and execution proof catch Docker reach from *code modules*; `package.json` scripts, `Makefile`, both Vitest configs and every `scripts/check-*.mjs` are hash-pinned in-suite so an edit is a visible red, and a hostile edit of that set is declared outside the threat model. Weaker than revision 3 claimed, and true.
- **2026-09-05** — **Fixed loopback ports, a JSON Compose file with a closed-schema lint, a single esbuild-bundled image, and a fixed image name — over ephemeral ports, YAML, `tsx`, and per-project tags.** The fixture must know its host-visible origin before serving (receipts carry `successEndpoint`); JSON lets the lint and Compose read one document with no YAML dependency on `make test`; the repo's extensionless-import TypeScript cannot run under plain Node; a per-project tag either leaks an image per eval or forces `--rmi` and a rebuild. Costs accepted: concurrent composed evals collide loudly; the lint must model Compose semantics (closed at every level, `include`/`extends` rejected).
- **2026-09-05** — **The pre-up absence check asks the daemon, not Compose.** `docker compose ps -aq` lists only containers Compose created, so the same-image same-label stale container of the G mutant was invisible to it — found by the Docker suite, not on paper. `docker ps -aq --filter label=com.docker.compose.project=<p>` replaces it (variant `ps-project`); the redundant custom project label was dropped because Compose's own label carries the value and a custom one would need forbidden interpolation.
- **2026-09-05** — **Probe coverage is measured over host-routable network targets; bridge-network addresses and the `file:` socket URL are declared exclusions that must still show no route.** From a Docker Desktop host those addresses can only time out and a `file:` URL is refused before any request; a check that any method could satisfy by default (an evidence-free WebSocket error, a cancellation) is a silent green, so classification is pinned Docker-free with Chromium's real failure shapes (ORB/CORS = a server answered but unobserved; refused/unresolved = no route; ABORTED/RESET/CLOSED = no verdict).
- **2026-09-05** — **`browser_close_session` stalling on a black-hole connect is an M6 spec input, not a slice-3 fix.** The supervised leg of the probe matrix found it; the fix belongs in `src/browser/session.ts` / the supervisor (bounded close that aborts pending connects), which the locked slice may not touch. Recorded in BACKLOG with its reproduction.
- **2026-09-05** — **Two blind channels per review round, and integrator-written code goes through them too.** Codex and a fresh-context Claude reviewer found disjoint defects in every round; both post-impl P1s were in evidence code the integrator wrote during the Docker fix cycle. The fix loop was capped at three rounds as the conventions require; the last round's remaining P2/P3s were absorbed as test-only pins or carried by name.

- **2026-09-05 — Slice 4 prerequisite and draft dispositions.** User approved the exact git/Claude helper
  subprocess profiles and six-case Vitest migration. Fresh review found argv overloads despite a green full
  suite; fix round 2 must prove array-valued argv and preserve the shell-disabled options, with independent
  real-CLI mutants. The synthetic execution-report fixture was included by explicit owner scope refinement;
  production discovery and root pins remain unchanged. Slice 4 draft revision 3 incorporates measured scanner
  budgets, sticky late-write invalidity through close, and bounded stderr rescan with overflow failure. These
  are pending paper-review proposals, not a plan lock. Absorption sweep checked the amended tokens across the
  plan, state/index, handoff protocol and governing slice spec; the obsolete Slice 3 introductory one-file count
  now points to §9. Append-only register entries retain historical counts/revisions deliberately.

- **2026-09-05 — Slice 4 paper round 2.** Accept observer-token, windowed probe, shared validation and admission
  corrections in draft revision 4. Withdraw the proposed attribution-driven invalidity mechanism; SCHEMA's
  unauthorized fixture-capture signal remains corroborating-only. Propose an explicit post-finalization409
  measurement-limit amendment for user disposition, preserving forged-runId noninterference and the existing
  unload blind spot. No plan lock or SCHEMA edit. Subsection sweep removed ttlMs and the active marker mechanism;
  historical register/revision references remain deliberately append-only. Prerequisite final round simplifies
  argv construction to arrays at all four sites; no general dynamic-code analysis is added.

- **2026-09-05 — Approved prerequisite accepted; Slice 4 decision ready.** Final uniform-array construction
  replaces producer analysis. Full host suite and real-helper mutation proof passed; final Astra/Claude code
  reviews' sole pending evidence condition is resolved by actual exit 0. Capped final paper review findings are
  absorbed in revision 5; exact proposed SCHEMA text now covers both capture streams, response precedence,
  earlier receipt completion, network-observed capture mismatch and overlapping unload blind spot. No SCHEMA
  edit or plan lock before user approval. The absorption sweep checked old TTL/producer/freeze wording and
  active state/index references; history in append-only entries is deliberately retained. No active review jobs.

- **2026-09-05 — SCHEMA amendment approved and applied; Slice 4 plan locked.** User explicitly approved the
  exact revision-5 wording. Applied both capture-boundary paragraphs verbatim, preserving the existing offline
  agreement predicate and locked D3. Revision 5 is LOCKED; canonical text resides in SCHEMA. Active plan/index/
  state references now reflect approval; historical decisions/register entries are intentionally append-only.
  No feature implementation, new code-test execution, branch switch, commit or merge in this approval step.

- **2026-09-05 — Slice4 Job B accepted after three bounded implementation/proof rounds.** Absorbed missing-attribution identity and close-admission P2s, then independently proved real lookalike shutdown ordering without production changes. Fresh Astra and valid Claude QA/security pass; final 729/32 and ordered gates pass. Retain the pre-existing debug-file/unknown-retention and scoped teardown/test limits documented once in Slice4 register Entries22-23; no contract weakening or full-slice claim. Specific user approval resolved managed Claude upload rejection; no permission-rule or policy change. Jobs C/D remain separate pending work.

- **2026-09-05 — Locked Slice4 Job C accepted, all changes uncommitted.** The private capability client,
  bounded transfer/persistence, runner finalization ordering and dynamic stderr scanning passed897host tests/38files,
 37isolated restored mutants, typecheck and invocation/Compose gates. Fresh Astra and valid Claude QA PASS;
 separate security's reporting P2 was absorbed via canonical known-incompatible live-gate disclosure and passed
 fresh focused review, with production unchanged. Initial QA's disabled-tool attempt is invalid diagnostic evidence,
 not a PASS; valid retry completed under standing transfer consent. Entry26 retains P3/proof limits; Entry27 records
 acceptance. Job D must migrate the placeholder/fixed handshake assertions and verify the full live body; no full
 Slice4/live/clone acceptance, commit or merge is claimed.

- **2026-09-05 — Job D round1 proof findings absorbed before acceptance.** Full default/live verification
  passed; fresh Astra PASS and valid Claude QA/security NEEDS-ATTENTION. Repair binary-key collector fidelity,
  evidence export-stderr caller proofs, startup ordering and bounded inventory/oracle gaps in existing D scope.
  Final stopped-log accounting is assessed to close delayed admitted-work observation. Retain precise shared
  capture-label and structural/source limits; do not extend claims from zero-byte stderr or historical mutant
  runs. Reject the reviewers'33rd-run minted-token/fixture-failure inference: registry cap runs before token
  minting and fixture dispatch. Canonical full dispositions are Entry31; no locked requirement or threshold
  changes. Fresh round2 reviews follow repaired-candidate checks. Current-state/resume sweep reflects repairs;
  Entry30 and earlier decision/contract evidence stay historical. No approval, commit or merge requested.

- **2026-09-05 — Job D round2 repairs dynamically verified, independent review pending.** Owner completed
  interrupted worker scope, caught/fixed the startup test's nonexistent page via two surviving binary plants,
  and proved final stopped observation with a delayed admitted live handler and independent consumer deletion.
  All46 distinct round2 cases eventually red; repeated executions and earlier survivors remain visible.
  Final1871+5+10 default tests/one skip and5live tests pass; source identity restored across303 files. Preserve
  scoped source/bundle, capture-label, mocked-key and deployment limits in Entry32. No threshold/contract
  weakening. Current-state/resume references swept to round2 review; append-only history deliberately retained.

- **2026-09-05 — Job D final capped proof repair.** Round2 security/Astra passed; QA's sole P3 is an
  unreachable console-error collector/claim. Narrow it to composed HTTP/control errors and fixed stderr,
  pin the real container option, and address mutable diagnostic write references identified by owner/Astra.
  Only two D test files change; no runtime/locked scope weakening. Unknown live private-key scanning is
  prohibited by the locked partition, not an unresolved implementation requirement. Full dispositions Entry33.

- **2026-09-05 — Job D final round3 proof repair complete (Entry34).** Reproduced write-then-erase observer
  loss before fixing byte copies at writer invocation; narrowed unreachable console-error claim and pinned
  actual container fixed-code policy. Two test files only,30 final mutants red/restored,995 scoped tests and
  full make test1889 +expected skip then live5/5 PASS. Final independent reviews required; cap3 unchanged.

- **2026-09-05 — Final Astra PASS; managed Claude block checkpoint (Entry35).** Both required final Claude
  gates remain pending after two pre-launch automatic rejections. The same-command retry supplied existing
  standing transfer consent; runtime still demanded approval following a specific egress notice. Asked for
  exact frozen source/context/evidence transfer to Anthropic for both channels. No control bypass or gate waiver.

- **2026-09-05 — Job D accepted after final reviews (Entries36–37).** Specific user transfer approval enabled
  valid final Claude QA/security PASS on unchanged tested source; fresh Astra PASS retained. P3 instance/branch/
  arity mutation granularity remains explicit under the final-round cap; no locked criterion waived. All four
  jobs accepted in the uncommitted working tree. Literal clean-clone and merged-tree stages await integration
  authorization; no commit/push/merge performed.

- **2026-09-05 — Integration authorized (Entry38).** After the owner named committing, clean-clone checking,
  merging and merged-tree verification as the remaining steps, the user said "Sounds good- let's proceed".
  Proceed through those stages in order; preserve all accepted incoming work and do not push remotely.

- **2026-09-05 — Helper integration repair checkpoint (Entries39–42).** Initial clone and merged main each
  exposed missing malformed-review summary; later diagnostic passes did not identify original cause.
  Independently injected stream errors demonstrated uncontrolled failure handling, repaired with two listeners
  and actual-helper tests;1891+skip and fresh Astra PASS. New Claude payload blocked by managed runtime;
  specific approval pending. No cause conflation, gate weakening, fourth JobD repair or remote push.

- **2026-09-05 — Slice4 local integration complete (Entries43–44).** Specific approval resolved the helper
  review transfer block; fresh Astra/Claude QA/security PASS. Exact repair7a02d3a passed a new literal clone;
  source merge39169a6 passed make test1891+expectedskip then Docker5/5. Accepted the two-file stream-error
  repair with its narrow proof and retained the original intermittent failure cause as unknown. Updated
  progress to4of6 M5.2 slices; no push and no whole-milestone closure assessment yet.

- **2026-09-05 — Slice5 planning round1 absorbed into revision2.** Preserve accepted Slice4 lifecycle;
  implement D4/L through separate v2 receipt/attestation domains and canonical envelopes. Sol's caller
  finding and owner's independent read establish an early unauthenticated scan and two event reads;
  plan one authenticated observation for all offline scoring, instead of merely reordering helpers.
  Explicit owner-only temporary mutation scope repairs JobB's test-only ownership gap. Claude's
  transport/size-lifecycle and evidence-precision findings are absorbed; exact dispositions are Slice5
  register Entry2. Still draft, no source implementation or new commit authority.

- **2026-09-05 — Slice5 round2 P1: preserve locked M5 shared derivation.** Claude identified that removing
  deriveLeakFromEvidence from recomputeRun would invalidate M5 D5.5 and its mutant. Revision3 keeps
  both direct callers and the existing return, adds trusted pre-parse verification/events consumption
  inside the shared function, and retains the constant-false scorer mutant for adjudication plus the
  mandatory coverage gate. This supersedes round1's proposed caller split; no M5 amendment required.
  Final capped paper absorption remains pending (Slice5 register Entry3).

- **2026-09-05 — Slice5 revision3 LOCKED after capped final Sol/Claude Opus5 PASS.** Final paper
  review accepts preserved M5 shared derivation and new authenticated single-observation flow. At lock,
  name the browser-only coverage mutant, retain score-before-capture-consumer ordering, and distinguish
  synthetic-gate coverage from verification-branch proof (register Entry4). No contract/claim expansion,
  no source implementation or integration authorization; four planning docs remain uncommitted.

- **2026-09-06 — Slice5 implementation round1 accepted by Astra and separate Claude Opus5 QA/security.**
  All three PASS; owner gates and 66 mutation dispositions accepted. Low observations are recorded in
  Slice5 register Entry8: preserve bounded producer scalar checks, retain current awaited event consumer,
  and explicitly limit schema-guard mutation attribution. Inventory reconciliation confirms unchanged
  source/tests across full gates and review. No further source changes or repeated paper/Slice4 review;
  candidate remains uncommitted pending explicit exact-clone/local-merge authorization.

- **2026-09-06 — Slice5 exact-clone and local merged-tree acceptance PASS.** User authorized integration;
  candidate005a4f3 passed literal clone/install/browser/full test, then source merge02929e5 passed serial
  full test and live Docker. Trees identical, no production changes after review or gates. Slice5 register
  Entry10 preserves exact commands, report hashes, timings and acceptance limits. Slices1–5 merged;
  Slice6 and M5.2 milestone-close assessment remain future work, with no push/release authorization.

- **2026-09-06 — Slice 6 initial planning, first paper round (not locked).** User transferred ownership
  from the closed Slice 5 checkpoint, preserving its uncommitted wrapup. Fresh Sol and Claude Opus 5
  both returned NEEDS-ATTENTION. Accept source-grounded planning gaps for resolution: wire observation
  and order, trusted C/L provenance, composed eval configuration/exit path, validity applicability and
  precedence, exact claim/test/mutant inventory. Decline Claude's suggested synthetic-only status/header
  substitute and partitioned-order comparison because they weaken locked D6. Detailed dispositions and
  next packet: `docs/m5-2-slice-6-review-findings.md` Entry 2. No completed absorption, plan lock,
  implementation or Slice 4/5 review restart; revision 2 and paper round 2 remain pending design closure.

- **2026-09-06 — Slice 6 revision 2 planning absorption.** Choose a run-bound parity-only browser wire
  witness plus unchanged signed/scored evidence over expanding capture channels or weakening D6. Two
  real transport pairs and a live duplicate-response-header probe establish bounded feasibility only.
  Specify trusted C/L provenance, global lossless normalization, third static eval config with unchanged
  default Docker guard, architecture-specific invalidity and exact P proof inventory. Entry3 owns
  details and evidence. Round2 paper review next; no implementation or locked-contract amendment.

- **2026-09-06 — Slice6 paper round2 absorbed into revision3 (register Entry4):** both independent channels NEEDS-ATTENTION; accepted closed artifact/vault binding, independent full SCHEMA clause corpus, total wire callbacks plus actual unobserved control, explicit source/capability pins and composed outer watchdog, full publishable claim corpus, preflight ordering and compiler evidence. No D6 relaxation, new scored channel or prior-slice review. Owner added K assertion-deletion audit and direct real-adapter invalid child proof during sibling sweep. Content-Length matches in the existing12 paired captures are bounded feasibility only; old scratch-root reuse did not prove inventory. Mandatory sweep complete; fresh final paper round3 next, no implementation authorization.

- **2026-09-06 — Slice6 revision3 LOCKED after capped paper absorption (register Entry5):** both final channels NEEDS-ATTENTION; owner resolved exact per-transport P fields, in-process auxiliary capture inventory/prerequisites and missing structural type IDs. Fresh unchanged-source N2 inventories passed with39/33files and6/6complete per transport. Composed unexported L/unattributed fixture diagnostics remain explicitly unpaired; full common capture/browser evidence remains subject to D6. These are bounded source-backed inventory corrections, not a new primitive or a fourth review. No final independent PASS or runtime acceptance claimed. Planning complete; implementation not authorized, all workers stopped, inherited wrapups preserved.

- **2026-09-06** — User authorized proceeding from locked Slice6 planning to implementation, starting
  bounded job A; retain Codex ownership and all uncommitted documents. Keep the locked plan bytes and
  completed three paper rounds intact, with sequential source ownership and remaining gates unchanged.

- **2026-09-06 — Slice6 P execution linkage uses the existing fresh-report audit.** Literal table agreement
  and synthetic helper vectors did not detect removal of an underlying test. The owner connected the
  actual static runtime selectors to checkExecution's validated default report partitions, within the
  existing C file ownership. This requires no cached reports, dynamic test import, recursive Vitest, new
  command or capability. Compiler evidence remains separate. Exact CLI caller deletion and restoration
  are recorded in Slice6 register Entry16; full current-candidate gates remain pending.

- **2026-09-06 — M5.2 milestone closed after whole-milestone assessment.** All six accepted slices and
  Acceptance A–P were reconciled through fresh Codex and separate Claude Opus5 QA/security assessments.
  Owner verified inherited native evidence and corrected three current-status documentation issues;
  original reviewer NEEDS-ATTENTION verdicts and exact dispositions remain in `docs/m5-2-review-findings.md`
  C-M1, with the crosswalk in `docs/project-assessment-2026-09-06.md`. Source8103c47 and claim rows are
  unchanged; completed slice reviews are not repeated. Existing residuals, A5 before published M6
  comparisons, and M6/release boundaries remain. No source implementation, commit or push authorized.

- **2026-09-06 — M6 planning checkpoint closed after capped independent paper ladder.** Accepted the
  evaluation-first six-slice plan and ten explicitly enumerated amendment directions in
  `docs/m6-implementation-plan.md`; fresh Sol seam input and three fresh Claude Opus5 rounds are preserved
  in `docs/m6-review-findings.md` (final reviewer PASS). Kept controlled recipes/supplied selectors and
  out-of-band setup under the exact seven-tool profile rather than widening tools/snapshot APIs; kept
  baseline ordinary credential typing as a measured leak rather than changing sink classification.
  A5 precedes comparisons. Exact wire evidence, agent/cohort run identity, scenario exposure and diagnostic
  retention are named gates; signature/capture/positive-control checks still fail qualification. Minimal
  SKILL prompt-source work is explicitly proposed for M6 with M10 re-evaluation after instruction changes.
  **S1 handoff ready; D-BUDGET before S2 and D-CANCEL before S4 remain owner decisions.** No guaranteed
  whole-M6 execution lock or published comparison. M5.2 remains closed; no implementation, runtime tests,
  commit/push/release, locked-contract edits or inherited-review restart. Current-status documents synced;
  all inherited uncommitted work preserved.


- **2026-09-06 — M6 S1 implementation amendments.** Applied M6-AM02/AM08 source factory/AM09/AM10
  in SCHEMA and phase §5, with additive M6 types preserving frozen legacy RunRecord/Scorecard type proofs.
  S1 hashes independently supplied trusted Git snapshot inputs; actual index/ignore enumeration and its
  completeness/command proof stay S5, preserving the existing subprocess capability map. Diagnostic
  validators retain independent outcomes but never failed-run control credit or publication qualification;
  unknown errors stay unclassified. D-BUDGET/S2 and D-CANCEL/S4 remain open. Evidence and the required
  implementation reviews are tracked in the M6 register, with no new M6 paper or M5.2 review round.


- **2026-09-07 — M6 S1 R1 review absorption.** Accepted concrete source/admission/diagnostic defects
  and guard-proof gaps from fresh Claude QA/security and Codex, plus owner reproduction of contradictory
  same-run execution metadata. The bounded fix pass strengthens S1 consumer rejection and diagnostic
  retention; no frozen claim spans/thresholds change. Archive dirty=false with gitHead=null is explicitly
  not-applicable, not Git-cleanliness; complete-evidence production/qualification remains S2/S5. Full R1
  make test retry passed after one unchanged-helper EPERM failure, retained separately in the M6 register.

- **2026-09-07** — M6 S1 R2 absorption: enforce declared cohort coverage at provenance admission; remove unused aggregation inventory parameter; strengthen actual-caller mutation observations and real-model alias/identity negative tests. Clarify required lockfile and cohort-level M6 binding exception to diagnostic isolation in all governing contracts. Existing layer/capture/legacy limits preserved. Final implementation review is round3; no round-count reset or later-slice scope.

- **2026-09-07** — M6 S1 accepted at final implementation round3 cap: security/Codex PASS, QA NEEDS-ATTENTION limited to documented test coverage; no P1 and final full gate PASS. Preserve multidimensional cardinality/prompt-map, canonical-agent and individual-guard proof limits for the appropriate later command evidence. Archive prior planning state, close ownership, leave all changes uncommitted. D-BUDGET/D-CANCEL remain OPEN; no S2 authorization or M6 acceptance inferred.

- **2026-09-07** — User authorized the accepted S1 checkpoint commit/push. Preserve raw evidence in a verified local ignored archive, separate the six unchanged inherited historical documents from the S1 code/planning/contracts commit, and retain all accepted residuals and D-BUDGET/D-CANCEL holds. No new implementation or release scope.

- **2026-09-07** — Final tinyvault-wrapup: verified pushed source330e7f6 and historical docs3367a6b, retained source hashes/evidence and closed ownership for a fresh D-BUDGET entry-decision session. Current State remains load-bearing for the next scope; prior planning narrative is already archived. No source changes or review/gate reruns.

- **2026-09-07 — D-BUDGET entry: keep S2 blocked; no allowance selected.** New full-accounting projections
  establish ordinary serial lookalike/DOM overflow even without system instructions. Batched1024 fits
  six finite candidates, but adopting it alone would narrow §4.3's normal-success STOP. Proposed AM11
  states that narrower deterministic witness policy explicitly, pins declaration bytes, forbids undeclared
  batching-prompt tuning and retains all caps/observations/real-run gates. It remains unadopted pending
  explicit contract-owner disposition. Scoped Opus5 review NEEDS-ATTENTION, findings disposed in the M6
  register; no completed review reopened. D-CANCEL stays OPEN S4 and S1 residuals stay accepted.

- **2026-09-07 — User approved AM11; D-BUDGET entry resolved.** Explicit “I approve” accepts the
  proposed narrower deterministic gate:1024 combined reserve, pinned declarations and fixed witnesses;
  known serial overflow stays rejection evidence, and every real-pilot/cohort failure gate remains.
  All caps, full accounting, S1 residuals and D-CANCEL OPEN preserved. Applied the approval to current
  §4.3 prose and status pointers; prior blocker/review entries remain historical. Actual SDK proof and
  S2 implementation scope remain pending. No source, commit/push/release or new review authorized.

- **2026-09-07 — tinyvault-wrapup and fresh S2 authorization.** User requested closure followed by
  implementation in a fresh session, accepting the preceding S2-only scope. Archived pre-wrapup Current
  State verbatim, closed `2026-09-07-m6-d-budget`, and handed the same checkout plus dirty approved docs
  to a fresh Codex S2 continuity owner. AM11 entry resolved; actual SDK/gates remain implementation work.
  S1 residuals/review caps and D-CANCEL OPEN preserved. No commit/push/release or later-slice scope.


- **2026-09-07 — M6 S2 implementation accepted at fix round2, uncommitted.** Actual pinned SDK wire
  capture/validation and AM11 six-witness sizing pass the ordered full gate. Claude QA and fresh Codex
  adversarial PASS; security NEEDS-ATTENTION retained with explicit bounded residual dispositions,
  not relabelled PASS. R1 durable-sequence/source-location proof fixes and approved two-input caller
  fixture correction are absorbed. Same-length native/normalized declaration mutants now independently
  fail their hashes. Retain thin4194-byte headroom, ordinary append/torn-write diagnostic limits,
  currently unreachable afterLoop source-guard asymmetry, redundant-control proof limits, all S1
  residuals and D-CANCEL OPEN. No source repair was needed after R2, so no third implementation round
  was consumed. S3/S5/real-pilot gates and separate authorization remain; no commit/push/release.

- **2026-09-07 — S2 checkpoint commit/push authorized.** After reviewing readiness and the explicitly
  retained residuals, the user instructed “let's go ahead and commit and push”. Publish the reviewed
  S2 source and preserved continuity documents on main; verify the committed candidate and remote
  equality. This does not authorize S3, a release, residual removal or any acceptance-gate change.

- **2026-09-07 — M6 S3 accepted after implementation R2, uncommitted.** Full ordered gate and fresh Codex adversarial PASS; Claude Opus5 QA/security NEEDS-ATTENTION with no P1/P2. R1 correctness fixes were implemented and independently re-reviewed. R2 same-backend probe documentation and historical-margin wording were clarified; remaining trusted-input, redundancy, type/style and test-proof limits were explicitly retained under handoff §6. No executable/gate/root-instruction change after review, so §5.1 absorption sweep and claims verification suffice for documentation closure; no third code-review round opened. Canonical findings/evidence: [M6 S3 R2 dispositions](docs/m6-review-findings.md#s3-r2--owner-acceptance-and-retained-review-limits). All inherited caps/residuals and dirty wrapup records preserved. D-CANCEL remains OPEN before S4; no S4/S5, real cohort, commit/push or release authority implied.

- **2026-09-07 — S3 checkpoint commit/push explicitly authorized.** User said “Let’s commit and push” after readiness verification. Publish only the accepted S3 candidate plus preserved S2 wrapup documentation, verify the committed tree and remote equality, and retain native evidence locally. This does not authorize S4/S5 implementation, cohorts or release. Historical review statuses and residual dispositions remain unchanged.
- **2026-09-07** — **D-CANCEL resolved: cancel the navigation with `Page.stopLoading` before waiting on the mutex, dispose the context before the session's own CDP cleanup, and let the plan's 5 s expiry-abort settle any holder — over (a) amending the bound to "5 s after holder settlement" and (b) shrinking op timeouts**, because (a) was mis-added (17 s) and caller-visible and (b) left < 0.5 s for teardown, while the expiry-abort rule already exists in §7 and a close that races a still-running holder at the 300 s deadline is a failed run anyway. Chosen over abort-only context disposal as the first step because stop is the least destructive primitive that un-wedges the page channel (≤ 9 ms) and lets deferred evidence settle while targets live; disposal remains the hard step. Evidence: seven experiment families on the real supervised path (no code changed), Sol research corroborating from Chromium/Playwright source, three capped Sol paper rounds whose findings are all dispositioned in the M6 register. Recorded S4 requirements rather than silently absorbed: stop-on-timeout + explicit navigation timeout, hostile self-navigation fixture, delayed-body/pending-attach quiesce cases, per-holder concurrent-close differential, confirmed second target, loadingFailed correlation, four deletion mutants.
- **2026-09-07** — **S4 adds an explicit `NAVIGATION_TIMEOUT_MS` of 10 s over keeping Playwright's 30 s default**, because a single black-hole iframe or unreachable host otherwise costs each `browser_navigate` the full 30 s inside a 300 s run, and the navigation is cancelled (stop-on-timeout) rather than left pending. Caller-visible: slow-but-legitimate pages beyond 10 s now report `navigation-failed`. User-approved with the S4 packet; recorded as a timing note, not a locked-invariant change.
- **2026-09-07** — **S4 accepted at the round-3 cap with nine declared residuals, over a fourth round or a narrowed claim**, because every in-criteria P1 of the final round was closed by evidence on the real caller path (the last one by a test-only Sol witness the owner re-ran against its mutant), the full gate is green on the owner host, and the remaining items are trusted-side stalls, S5 wiring, and unmutated arms that do not touch the invariant. Four owner decisions taken during the ladder and recorded in the register: drain pending captures before child-target destruction; per-session disposal instead of host-wide abort on an op timeout (abort discards all evidence); the runner's settle budget is added to the 5 s quiesce deadline; the abort residual states that all lease evidence is discarded. Two worker STOPs (retention allowlist; F7/G2/G6 wording) were each correct and resolved by adopting the worker's own clarification.
