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
