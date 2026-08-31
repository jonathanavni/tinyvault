# Release Guide

Read this when shipping, deploying, or doing post-deploy work. Most projects skip this phase entirely and regret it.

## The Release Pipeline

```
/ship → deploy → /canary → /document-release → /retro
```

| Step | What | Key Actions |
|------|------|-------------|
| 1. Ship | Prepare for merge | Sync main, run full test suite, audit coverage, check for console.log/debug artifacts, open PR |
| 2. Deploy | Get it live | Merge PR, wait for CI, trigger deploy, verify production URL responds |
| 3. Canary | Post-deploy monitoring | Watch for console errors, network failures, regressions, performance degradation |
| 4. Document | Update docs | Update README, changelog, API docs. Catch stale documentation before it misleads |
| 5. Retro | Learn from the release | What went well, what went poorly, patterns, actionable improvements |

## Pre-Ship Checklist

Before opening a PR:

- [ ] All tests pass (don't skip flaky tests — fix them)
- [ ] No leftover debug statements (console.log, debugger, TODO-HACK)
- [ ] Test coverage hasn't decreased
- [ ] No new security warnings from linter/audit
- [ ] Run `/security-review` on the branch if the diff touches the security surface (auth, user input, DB queries, file uploads, secrets, external/network calls) — built into Claude Code, reviews the diff for injection/auth/secrets/vuln-deps. Gate on the surface, not the diff size. For CI, add the `anthropics/claude-code-security-review` GitHub Action on every PR
- [ ] PR description explains the "why", not just the "what"
- [ ] Screenshots for visual changes (before/after)

## Post-Deploy Monitoring

After deploying, don't walk away. Monitor for:

- Console errors (new errors that didn't exist before)
- Network request failures (new 4xx/5xx responses)
- Performance regression (page load time, API latency)
- User-facing broken flows (try the core user journey)

If monitoring catches issues, **roll back first, investigate second**. A broken deploy that's live for 5 minutes is better than one that's live for an hour while you debug.

## Retrospectives

Run a retro after each significant release (not every bug fix):

1. **What was planned?** vs **What was actually delivered?**
2. **What went smoothly?** (patterns to repeat)
3. **What was painful?** (patterns to fix)
4. **What surprised you?** (hidden assumptions exposed)
5. **1-3 actionable improvements** for the next release

Encode improvements into CLAUDE.md, guides, or skills so they persist across sessions.

## Safety Guards for Production

When working on production systems:

- **Careful mode** — require explicit confirmation before any destructive command (rm, DROP, force-push, deploy)
- **Freeze mode** — restrict edits to a single directory during debugging. Prevents accidental changes to unrelated code while investigating an issue
- **Guard mode** — combine careful + freeze for maximum safety during production incidents

These can be implemented as skills or hooks depending on your preference.

## Day-One Infrastructure

Set up before the first deploy, not after:

- **Error tracking** — Sentry (free tier). Know when things break before users tell you
- **Analytics** — PostHog or Plausible. You need data when you need it, not from the day you add it
- **Preview deployments** — every PR gets a URL (Vercel does this automatically)
- **Secrets** — `.env` + `.gitignore`. Never hardcode. Use Doppler or Vercel env vars for production
