# Gotchas — shell, git and authoring

zsh traps in the Bash tool, git footguns in shared checkouts, and authoring hazards (control characters, mojibake).

<!-- One entry per gotcha: `- **<short title>** — <the trap>, <how to detect it>, <the fix>. (<date>)`. Entries were moved here verbatim in the 2026-09-09 consolidation; add new ones under the matching heading. -->

## zsh and macOS

- **The Bash tool runs zsh, which does not word-split an unquoted `$VAR`.** `C="node x.mjs"; $C status`
  runs a command literally named "node x.mjs" (exit 127). Three poll monitors sat silent for 40+ minutes.
  Write the command inline (or `${=C}`), and make poll loops exit loudly on an unreadable status — a
  monitor whose failure mode is silence is the same bug as a leak checker that cannot go red. (2026-09-01)
- **This shell's `grep` is `ugrep` and rejects wide bounded quantifiers on UTF-8 (`{0,400}` → "exceeds complexity
  limits"); use `command grep` or python for transcript/JSONL mining.** Two more zsh traps met the same night: `$T:testbed/…`
  applies the `:t` modifier (path tail) — write `${T}:…`; and `set -- $VAR` does NOT word-split in zsh — use
  `read A B C <<< "$VAR"` (a status monitor misparsed "running" as terminal until fixed). (2026-09-03)
- **macOS has no `timeout(1)`.** `timeout 180 node …` dies with `command not found`, and inside a backgrounded
  compound command that failure is easy to miss. Use a bounded poll loop instead. (2026-09-04)
- **zsh: `status` is a read-only variable; `local status=…` aborts a non-interactive script silently.** The N10 sequence runner died after the baseline step with no log line (2026-09-09). Use `qstatus`/`rc`; run `zsh -n` plus a dry run of every helper that a live-spend step depends on.

## git in shared checkouts

- **`git add -A` in a worktree shared with a delegated agent stages work you have not reviewed.** A
  planning-side doc was swept into an unrelated Codex commit this way. Stage explicit paths. (2026-08-31)
- **A `cd <worktree> && …` chain leaves later commands in that worktree** — the C-B2f2 register commit landed on the
  fixtures branch instead of main and had to be reset and redone. Run each git write from an explicit `git -C <path>`
  or start the command with the intended `cd`. (2026-09-04)
- **`git merge` with no branch argument silently merges the upstream, not your branch.** `git checkout main && git
  merge --no-ff -m "…"` reported "Already up to date" because the branch name was omitted; it tried `origin/main`.
  Caught only by reading the log afterwards. Name the branch, and verify the merge commit exists. (2026-09-04)
- **Unstaged diff hygiene omits new untracked files.** A green `git diff --check` did not cover the new
  Slice5 mutation ledger; staging exposed trailing spaces in its diff code fences. Include newly added
  files in the final hygiene check (`git diff --cached --check` after authorized explicit-path staging).
  Preserve exact raw mutation replacements separately from documentation formatting. (2026-09-06)

## Authoring hazards

- **Authoring hazard: literal control characters and mojibake.** Twice in one session, content I authored
  carried corrupt bytes — UTF-8 `ä` read as MacRoman (`√§`) in a normative test vector, and literal C0
  controls in the findings register that made `file(1)` report `data` and hid the file from default
  `grep`. Write control characters as `U+XXXX` notation in docs, and annotate non-ASCII test vectors with
  their code point.
- **The authoring hazard recurred: a NUL pad character written as a JS escape inside a spec code block landed as
  a literal NUL byte.** `file(1)` said `data` and every `grep` over the doc went silent (binary), so the §5.1
  stale-token sweep looked clean. Run `file -b <doc>` after every authored write and before any grep sweep; the
  model's own tool calls render escape sequences into raw bytes, so spell the escape out (backslash, u, four
  zeros) or use `perl` to insert it. (2026-09-01)
- **A background job launched from a non-interactive zsh shares the parent's process group, so `kill -0 -- -<pgid>` never turns false and `kill -TERM -- -<pgid>` hits the caller.** The first E8b watcher dry run looped forever for this reason. Launch a group-owning child with `perl -e 'setpgrp(0,0); exec @ARGV' zsh -c '…' &` (child pgid = child pid), `wait` on it in the launcher so it is reaped, and test liveness as "any non-zombie process in the group" (`ps -o stat= -g <pgid> | grep -qv '^Z'`) — an unreaped zombie keeps `kill -0` true. `setsid` does not exist on macOS. (2026-09-10)
