---
name: tinyvault-claude-review
description: Dispatch a fresh read-only Claude Opus 5 plan, QA, or security review for an Astra-led TinyVault session and collect verified results. Use for independent Claude review gates or an explicit request to send a review to Claude; not for implementation or a Claude-led session's existing Codex ladder.
---

# Independent Claude Opus 5 review

Read [AGENTS.md](../../../AGENTS.md) and [the session protocol](../../../docs/handoff-pattern.md#codex-led-ladder).
Codex retains continuity; Claude is a fresh, read-only worker. Use the user's authorized review scope.

1. Hold the candidate checkout stable. Use a separate checkout if another session is editing it.
   Prepare a packet outside all source worktrees from [the packet template](../../../templates/claude-review-packet.md).
   Supply exact base/head, files, locked requirements, threat model, accepted residuals, and available
   verification evidence. Untracked files are included in the candidate inventory; ignored files are not.
   Do not include real credentials or another reviewer's findings in a blind review packet.
   The helper automatically embeds the reviewed checkout's root `CLAUDE.md`, with a saved snapshot
   and hash. It must exist in the candidate inventory and be nonempty. Supply other required context
   in the packet; the embedded project guidance does not grant Claude orchestration or write authority.
2. Run the [helper](../../../scripts/claude-review.mjs) from the TinyVault root:

   ```sh
   node scripts/claude-review.mjs --repo /absolute/review-checkout --packet /absolute/task.md --channel qa --base BASE_SHA --output /absolute/new-report-directory
   ```

   Choose `plan`, `qa`, or `security`. Run each required channel as a separate invocation, with its own
   packet and output directory. `security` automatically includes the versioned
   [security methodology](../../../templates/claude-security-review.md); if the contract requires a specific
   external auditor, that remains a separate gate. The default timeout is 900 seconds; adjust explicitly
   with `--timeout-seconds` (1–3600) for a genuinely larger review.
3. The helper pins `claude-opus-5` at high effort with no fallback. Use the existing Claude Code login.
   If sandbox access to that login/network is blocked, use the host's normal approval mechanism for this
   exact invocation. Never read/copy credentials or enable permission bypasses. Do not silently substitute
   a different model. Missing CLI/authentication/model access leaves the gate pending.
4. Keep the process/session identifier and let the bounded run finish. Inspect `events.jsonl` for live
   progress, then `summary.json` and `report.md`. Exit **0** means a completed PASS review; **2** means a
   completed NEEDS-ATTENTION review; **1** is dispatch/validation failure; **124** is timeout; **130** is
   interruption. No summary, a failed summary, or a killed outer process is never a successful review.
   Do not rerun merely because findings are inconvenient. Check an interrupted run has stopped before retrying.
5. Read the full findings and evidence. Synthesize them under the canonical ladder; record the reviewer,
   candidate digest/refs, channel, report path, and disposition in the appropriate append-only register
   when authorized as continuity owner. A successful dispatch is not proof the candidate is safe.

The reviewer can only Read/Glob/Grep; it cannot execute tests, mutate files, launch workers, or load
custom commands/hooks/MCP tools. Give it already-produced diff and test artifacts. It must report missing
dynamic evidence. These are CLI tool restrictions, not an OS-level sandbox or a repository-only read boundary.
The candidate digest is a before/after drift check, not an atomic lock; freeze the checkout during review.
Opus 5 is checked against actual assistant events; CLI auxiliary model usage is preserved separately.
