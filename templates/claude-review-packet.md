# Independent Claude review packet

Fill this in outside the source worktree and pass it to `scripts/claude-review.mjs`. The helper supplies
the role, model, channel, candidate inventory/diff, complete root `CLAUDE.md` from the reviewed checkout,
and report format. This packet supplies task-specific intent and context.

- **Continuity owner / session:** <Codex owner identifier>
- **Scope:** <precise plan or implementation question; exact files; non-goals>
- **Candidate:** <checkout, expected HEAD, base commit; describe intentional dirty/untracked changes>
- **Additional required reading:** <relevant spec/plan, source/tests; selected memory topics; CLAUDE.md is already supplied>
- **Locked acceptance criteria:** <requirements and evidence needed to accept this candidate>
- **Threat model and exclusions:** <attacker control, trust boundaries, explicit deployment assumptions>
- **Accepted residuals:** <exact register sections; do not forward other blind reviewers' current findings>
- **Verification supplied:** <absolute paths to actual test/mutation/CLI evidence, commands and candidate identity>
- **Open questions:** <neutral questions; distinguish unresolved contract questions from known defects>

All paths must be readable from the review environment. Name additional context explicitly: automatic
instructions, commands, plugins, and memory are disabled in this fresh reviewer. The helper supplies
`CLAUDE.md` as project guidance while preserving the delegated reviewer role. The reviewer
cannot execute tests or scan tools. A security-channel report uses the repository's versioned methodology;
it does not claim that Claude's `/security-review` command or another external auditor actually ran.
