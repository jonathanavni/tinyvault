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
