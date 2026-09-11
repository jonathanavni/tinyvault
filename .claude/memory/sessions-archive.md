# Sessions Archive

An append-only, one-line-per-session index of project history, newest first. Each `/wrapup` can add a line here so you can scan how the project got to where it is without digging through `PLAN-archive.md`'s detail.

This is the chronological table of contents; `PLAN-archive.md` holds the detailed archived work. Neither is read at `/start` — they're for when you need to look back.

<!-- Format: one line per session.
## <YYYY-MM-DD-thread>
<one-line outcome> (commit `<sha>` / PR #<n>)
-->

## 2026-08-31-build
Phase 0 plan LOCKED (3-round Codex ladder + alignment review); M0 contracts and M1 eval spine built by Codex
and integrated; independent Opus 5 blind audit found a class the prior rounds missed (false positives, trust
in checker inputs, capture coverage) → M1-hardening closed 15 findings across 3 channels; spec amendment
triaged. `make eval` produces a Wilson-CI scorecard offline. (commits `7f60152`..`06705f3`)

## 2026-09-01-m2
M2 security primitives built, reviewed across 3 paper + 5 code rounds, and merged to `main`. The paper
ladder hit its cap when the seam could not be settled on paper; the mechanism was redesigned (types →
build-time dependency boundary + runtime attestation) and every subsequent blocker was found only by
running code. (commits `9f216b0`..`6a6b67c`)

- **2026-09-01-m3** — M3 (backend interface + libsodium local-file, B1 slice 2/3) through the full Codex ladder: spec locked after 3 paper rounds (8/4/4 findings), Codex implemented (2 commits), 3 post-impl channels in parallel → 2 convergent P1s (AD source; gate laundering via `scripts/`), 2 fix rounds, integrator mutation pass, merged FF to `main` (`1e24f73`). Gate gap G-1 (`.d.ts` scanned instead of runtime JS) found and fixed. Fact-check thread closed (27/7/3/3). `make test` 206 → 339.
- **2026-09-01-m4** — M4 (fill service + integration gates) through the full ladder over ~15 h: spec locked (3 paper rounds), 4 commits + 5 fix slices each three-channel reviewed with real-Chromium probes, whole-codebase audit, probe P amended (paired/Holm), retention rule capped at S1–S35; two real formaction leaks and six layer-4 blind spots closed; shipped `b8a9396` with declared residuals (register "Final5 round").

- **2026-09-02-m5** — M5 (hostile fixtures #1–#2, the capture-coverage gate, the finite decoder inventory, worker-body markers; M4 residuals folded in per spec §D8) through the full ladder over two days: spec r3 locked after two paper rounds; slice A (decoders, 3 rounds + integrator pass, merged `2e7b300`); slice B commits 1–3 (fixture core + signers; coverage gate + console/redirect + recursive worker attach with markers, 3 rounds + pass; the two fixtures, 2 rounds + pass); every round three-channel with real-Chromium probes; the merge gate surfaced M5-M1 (the flat candidate budget exhausted by ordinary model-context events) fixed in the merge `96e3ea3`; docs pass `1f03e99`; hygiene same day (branch prune, `rules.ts`/`runner.ts` splits, A2/D1 spec paragraphs). Next: M6.
- **2026-09-04-m5.1-m5.2-slice1** — M5.1 gate repair shipped (timing file split; generated corpus; the M5-M1 guard found not to kill its own mutant), accepted by a literal clean clone. M5.2 spec taken from draft to **LOCKED revision 4** (`60520d9`) through four review passes and three honoured stop-and-return points: round 1 killed the network shape the decision was written from (Docker networks scope routes, not listening ports); round 2 killed the sidecar split and exec bridge (the isolation claim promised containment after fixture-process compromise); the user then locked the threat model; round 3 found the daemon endpoint an unguarded alternate control transport; the closure review found the repair validated the client, not the daemon; the user adjudicated daemon isolation into a stated deployment requirement. Then implementation slice 1: the `FixtureTransport` seam (all bridge-crossing ops async), the architecture/reachability split, a canonical model-turn snapshot, and the agent tool boundary enforced at **runtime** after three source-analysis designs failed (C-S1: a positive allowlist over resolvable occurrences is not a positive allowlist over occurrences). Two repairs — the first deleted two protections while appearing to strengthen them, restored in the second. Merged `ab52f8e`; final head `1d04f93`; `make test` 995 + 5 + 10. Next: slice 2, the daemon-channel preflight.
- **2026-09-04 (`m5.2-slice2`)** — M5.2 slice 2 merged (`8133495`, reviewed/clean-clone-tested at `41aa5f5`, 1182 + 5 + 10): daemon-channel preflight, canonical `unix:///` policy, runtime-unforgeable pin, single Docker choke point, runtime Docker-free guard, fail-closed composed construction. Full ladder: 2 pre-impl rounds → 3 impl jobs → 3-channel post-impl → 2 fix rounds → clean clone. Also: Codex ladder moved to GPT-6 Astra with stakes-based model routing (`8ef2e89`); codex-cli 0.144.5 → 0.153.3.
- **2026-09-05 (`m5.2-slice3`)** — Assessment fold-in verified (A1/A2 BACKLOG rows added); `AGENTS.md` committed. M5.2
  slice 3 merged (`8afce07`; branch tip `638bc15` clean-clone green, 1568 + 5 + 10 + Docker 4/4): container + Compose +
  framed exec bridge + stdin bootstrap + injective MAC + provenance-first fail-closed construction + the gates that keep
  Docker off `make test`. Ladder: 3 paper rounds × 2 channels → rev-4 lock (Acceptance N narrowed to a hash-pinned root
  of trust) → 6 Astra jobs with 9 adjudicated stops → integrator Docker fix cycle (image-inspect Cmd, matrix
  concurrency, supervised-leg stall, `compose ps` blindness, ORB/CORS oracle) → 3-channel review → 3 fix rounds → QA
  round 3 → clean clone → merge. Found for M6: `browser_close_session` stalls on a black-hole connect. Pruned
  `codex/m5-2-slice-2` and `codex/m5-2-slice-3`.

- **2026-09-05 (`m5.2-slice4-planning`, Codex owner, closed)** — Slice 4 plan revision 5 LOCKED after three paper rounds and explicit SCHEMA approval; baseline review-tool prerequisite accepted after real CLI/helper mutants and final `make test` 1574 + 5 + 10 (one expected pending). All work uncommitted on `main` at `dc0796f`; no Slice 4 feature implementation. Ownership relinquished for the user's fresh Codex implementation session; start bounded Job A from the dirty candidate. Handoff: PLAN Current State; canonical evidence/dispositions: `docs/m5-2-slice-4-review-findings.md`.

- **2026-09-05 (`m5.2-slice4-implementation`, Codex owner, closed)** — Locked revision5 Jobs A–D accepted
  through the full ladder; all incoming work preserved. Independently proven helper stream-error repair
  reviewed by Astra/Claude QA/security. Exact candidate7a02d3a clean clone PASS; final source merge39169a6
  passed serial make test1891+one expected skip, Docker5/5 and execution gates; acceptance docsf6b6a42.
  Historical intermittent missing summaries remain unexplained. Full wrapup relinquishes ownership for
  fresh Slice5 attestation planning; no active jobs, no push. Canonical handoff: PLAN; evidence: Slice4
  register Entries39–44.

- **2026-09-06 (`2026-09-05-m5.2-slice5-planning`, Codex owner, closed)** — Slice5 revision3 locked;
  JobsA/B, 66 mutation dispositions, fresh Astra and Claude Opus5 QA/security PASS. Candidate005a4f3
  exact clone1963+one skip; merge02929e5 serial full test1963+one skip and Docker5/5 PASS. Acceptance
  records73bd015 pushed and remote verified. Ownership relinquished for fresh Slice6 parity/claim-closure
  planning. No active jobs; no repeated Slice4/5 reviews. Canonical handoff: PLAN; evidence: Slice5 register.

- **2026-09-06 (`2026-09-06-m5.2-slice6-planning`, Codex owner, closed)** — Slice6 revision3 A–D accepted
  after paper3 / implementation2; Astra and Claude Opus5 QA/security PASS. Exact source8103c47 clone
  and main gates2317+one skip each, Docker6/6, composed scripted eval30/30 complete and zero observed
  leaks. Source8103c47 and acceptance records53fd94f pushed. Ownership relinquished for whole-M5.2
  assessment; five wrapup documents uncommitted, no active jobs. Evidence: Slice6 register Entries28–29.

- **2026-09-06 (`2026-09-06-m5.2-milestone-close`, Codex owner, closed)** — Whole-M5.2 assessment
  completed; independent Codex and separate Opus5 QA/security found documentation issues only, all
  owner-verified and corrected. M5.2 closed (register C-M1); retained source8103c47 acceptance hashes
  and selector joins verified without repeating slice reviews/runtime suites. Eleven documents remain
  uncommitted. Ownership relinquished for fresh M6 planning; no active jobs, M6 implementation or release.

- **2026-09-07 (`2026-09-06-m6-s1`, Codex owner, closed)** — S1 provenance/profile/diagnostic
  contracts accepted at implementation round3 cap; source/contracts330e7f6 and historical docs3367a6b
  pushed and remote verified. Security/Codex PASS, QA coverage residuals retained; full test2402+one
  pending and15 timing PASS;47 mutations,45 killed/two redundant survivors. Local evidence archive
  verified; canonical details in M6 register. No active jobs. Fresh next scope: D-BUDGET before S2;
  D-CANCEL stays OPEN for S4. No repeated paper/M5.2 reviews or release.

- **2026-09-07 (`2026-09-07-m6-d-budget`, Codex owner, closed)** — D-BUDGET resolved by explicit user
  approval of AM11's narrower deterministic witness policy; actual SDK proof remains S2. Full sizing,
  review dispositions, hashes and approval live in M6 plan §4.3.1/register. User authorized fresh S2-only
  implementation in the same checkout; eight dirty owner docs preserved, no source/commit/push/release.
  S1 residuals and completed review caps retained; D-CANCEL OPEN S4.

- **2026-09-07 (`2026-09-07-m6-s2`, Codex owner, closed)** — S2 SDK transport/AM11 feasibility and
  bounded helper repair accepted;2892973 and3b6bbbe pushed, remote equality verified. Exact-commit
  full gate2490+one inherited skip and15 timing PASS; final R3 QA/security/Codex PASS. Canonical
  findings/evidence/limits in M6 register; no active jobs. Five wrapup documents uncommitted. Fresh
  next step: read-only kickoff and S3-only proposal; implementation awaits scope authorization,
  D-CANCEL OPEN before S4, no repeated completed ladders or release.

- **2026-09-07 (`2026-09-07-m6-s3`, Codex owner, closed)** — S3 profiles/recipes/root instructions and
  exact SDK sizing accepted after R2; `db78a1c` pushed and remote equality verified. Exact-commit gate
  main2539/0/1 inherited skip plus15 timing PASS. Codex R2 PASS; Claude QA/security NEEDS-ATTENTION,
  no P1/P2, P3 dispositions retained in M6 register. Fresh next scope: D-CANCEL evidence before S4;
  S5 wiring/real cohorts remain due. Documentation-only wrapup remains uncommitted; all prior caps retained.

- **2026-09-07 (`2026-09-07-d-cancel`, Claude owner)** — committed the S3 wrapup docs (`0acb6bb`), pruned three
  merged codex branches, resolved D-CANCEL with a reproduction + cause isolation + externally-proven mechanism on the
  real supervised path and three capped Sol paper rounds; no source change, S4 not dispatched. Found the hostile
  self-navigation channel wedge. Docs uncommitted at session end pending wrapup.

- **2026-09-07 (`2026-09-07-d-cancel`, continued: S4)** — S4 packet Sol-reviewed, approved, dispatched to Astra;
  candidate + two fix rounds under a three-channel ladder (Codex adversarial, Claude QA, Claude security ×3), owner gate
  green each round after fixes, six owner mutant spot-checks, one Sol test-only witness; accepted at the cap with nine
  declared residuals; committed. S5 next.
- **2026-09-07 → 08 (`2026-09-07-s5`)** — stale probeP busy-loops killed; S4 residual (8) closed by a Sol test-only packet;
  S5 packet drafted (Sol paper pass, ten user-approved decisions), Astra candidate after one correct STOP, three review rounds
  (Codex found admission defects every round; classifier-flagged review mode → defensive task mode) + two fix rounds + the
  cap-round integrator fix (attestation = finalization disposition); owner gate green after every delivery; 24 owner mutant
  reproductions; S5 ACCEPTED `1d32657`, pushed. S6 (E9/E10 ladder, needs per-step user authorization) next.
- 2026-09-08 (s6, session 3) — AM12 adopted → Astra-implemented → three-round post-impl cap → merged `623a8b7`; E9 attempt-2 steps 1–2 PASS (3× clean-clone green); pilot attempt 2 UNQUALIFIED on the lookalike cell (assertedOrigin trailing slash; all-diverted baseline). Open: Probe P gate policy; F1/F2 decisions.
- 2026-09-09 (s6, session 4) — F1 merged `dd669ba`; M6-AM13 adopted (corrections A/B) → implemented → accepted at round 2 → merged `fe8e9e1`; clean clone `3072e0b` 3× green; pilot 3 `cY3Deep4` READY; N10 sequence QUALIFIED (`z22Kn2eT`, `y9WmFqoL`: ref 0/30 leaks 30/30 done; baseline 30/30 leaks) — S6 ACCEPTED, E8/E9/E10. Probe P deferred. Not pushed.
- 2026-09-09 (m6-close, session 5) — M6 milestone-close assessment: three blind read-only channels on frozen `50e96e9` (= `3072e0b` executable); every finding verified line by line; **M6 CLOSED**; P1 `M6C-CODEX-P1-01` (receiptless baseline canary unauthenticated) → **M6.1** remediation owed before M7/publication; README/ORIENT/SCHEMA/plan status drift fixed, N10 table published in README; residual sweep; owner gate-1 red by mid-run edit (gotcha), gate-2 rerun; merged `codex/*` branches deleted; pushed. **M6.1 same session:** packet adopted at the Sol cap (`bb2a1cc`), Astra slice + Extension 1, Codex MERGEABLE / QA+security no code defect, owner gates green, merged `7ae23be`, owner integration `352e465`; wrapup with a full doc pass (stamp closed, s5/s6 narratives archived, index/packet/assessment/phase-plan/BACKLOG status flips, CLAUDE.md gate rule, STOP-extension convention); pushed. Next: M7 entry inputs; Probe P policy decision.
- 2026-09-09/10 (m7-entry, session 6) — M7 entry inputs (4 Sol packets, pushed `ca43cd9`); Probe P policy v2.1 adopted (gate unchanged, observability first); C2 diagnostics through the full ladder (3 paper rounds, Astra impl, 2 fix rounds + cap correction, integrator fix, 3 clean-clone gates) merged `92d2bbe` after D-1..D-4 accepted; campaign harness (bash spawner, predicate v5 after live inventories); **20-run campaign executed: 20/20 green, 11 excluded by rule B, V = 9 → inconclusive, P-1 accepted**; M7 slice spec rev 3 locked. Next: inventory-pin Astra packet, M7 implementation packet.
- 2026-09-10 (m7-packets, session 7) — two paper rounds → v4 packets; timing-2 inventory pin implemented/reviewed/gated/merged `c49e9ad`; M7 implemented on `codex/m7-fixtures` (two correct Astra STOPs → O-M7-1, Extension 2; one Astra fix round; owner carve-outs) → candidate `9a826e5` returned unmerged: `make test` green, eval-stub green, test-docker 6/7 (export-scan capacity at 965 secrets → 240 s per-export deadline authorized), recorded Probe P rejection on `828c769`; D-6 pin accepted; handoff `docs/m7-final-acceptance-handoff.md`.
- 2026-09-10 (m7-final-acceptance, session 8) — handoff §3 executed: owner mutant table on `9a826e5` (row 7 equivalent → 7b; 9c), Docker 240 s per-export deadline (Astra `2aead00`), focused reviews (Codex 1 P1/1 P2 — the 579→965 pin fixed `b7889d3`, count residual accepted; Opus QA 0 P1), gates green → **user approved; M7 MERGED `4e86933`**, E10 `29f704a`, merged-tree + clean-clone gates green (`9f4574f`); merged branches and the worktree deleted; no push.
- 2026-09-10 (e8b-prereg-m8-packet, session 9) — E8b pre-registration rev 2 (dedup N10 usage → ≈ $3.6 expected; Sol fact-check absorbed; watcher dry-run; $10 approved as the operational stop threshold with hardening owed); M8 MCP adapter packet through the three-round paper ladder → rev 4 lock candidate (48 P1 verified, 2 disproved; register `docs/m8-review-findings.md`); user decisions O-2…O-8 recorded, O-1 pending `_meta` reconciliation + client probe; commit `915a90f`; no spend, no push.
- 2026-09-10/11 (e8b-live-cohort, session 10, session A) — monitors hardened (watcher rev 3.1 / launcher rev 2.1 / go-wrapper; 34 local failure tests ×4 green; tests caught a zsh `path`→`PATH` fail-open; Sol ladder 11 P1 → 5 P1 → PASS), pre-registration rev 3, spend-free pre-flight, **attempt `E8b-A1-N10` executed once: cohort `ODMFYbwH` UNQUALIFIED — reference 0/10 leaks in four cells, 10/10 on `fake-reauth-prompt` (second same-origin fill after login), baseline leaks in all five; $3.254 = harness usage; preserved, not repeated**; user authorized a runtime fill-control design packet (full ladder, before M8 implementation); commit `3f136f3`; handoff `docs/m7-e8b-runtime-control-handoff.md`.
