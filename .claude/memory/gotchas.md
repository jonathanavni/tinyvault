# Gotchas — index

Sharp edges and footguns discovered the hard way. Consolidated 2026-09-09 (474 lines, 93 entries) into four topic files; entry text was moved verbatim and one duplicate dropped (macOS `timeout`, kept in the shell file). Add a new entry to the matching file under its heading, one bullet per gotcha: `- **<short title>** — <the trap>, <how to detect it>, <the fix>. (<date>)`.

- [`gotchas_codex.md`](gotchas_codex.md) — **Codex and review channels**: the pinned dispatch invocation and model routing (read before any dispatch), sandbox limits, job monitoring (silence is the failure mode), the safety classifier, dispatch hygiene, the Claude review helper.
- [`gotchas_verif.md`](gotchas_verif.md) — **verification, gates and mutants**: the M2 blind-spot lessons, owner-gate and commit-chain discipline (gate → read → decide; nothing edits the tree while a gate runs), mutant hygiene, evidence archives, measurement claims and model-facing text.
- [`gotchas_runtime.md`](gotchas_runtime.md) — **Chromium / Playwright / CDP, Docker Desktop, Node**: navigation wedges, worker capture, ORB, bind-mounted sockets, bridge networks, `image inspect`, BOM, `import.meta.resolve`.
- [`gotchas_shell.md`](gotchas_shell.md) — **shell, git and authoring**: zsh word-splitting and the read-only `status` variable, no `timeout(1)` on macOS, `git add -A` / bare `git merge` traps, control characters and mojibake in authored docs.

The ones that bit more than once: a monitor whose failure mode is silence (M3, M4, M5.2 ×2); a gate result stated without reading its log (2026-09-08, twice); an owner edit landing while a gate or review runs (2026-09-04, 2026-09-05, 2026-09-09); the safety classifier flagging attack-framed packets (2026-09-04, 2026-09-08); authored bytes carrying control characters (2026-09-01 ×2).
