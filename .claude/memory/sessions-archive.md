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

