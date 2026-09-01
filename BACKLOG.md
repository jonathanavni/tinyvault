# Backlog

The idea funnel: unprioritized, unscoped potential work. Most of it never ships, and that's fine — this is the holding pen so good ideas aren't lost and don't clutter `PLAN.md`. When an item is prioritized, it graduates into `PLAN.md` (or a planning doc in `docs/`) and comes off this list.

> Some teams gitignore this file, especially across multiple git worktrees where a committed backlog drifts. It's committed here so the skeleton shows the pattern — uncomment the `BACKLOG.md` line in `.gitignore` to keep it local instead.

## Ideas

Post-launch adapters & extensions (from `PROJECT-SPEC.md` §7 — parked here until the core + MCP launch ships):

- **eve tool package / Agent Plugin** — "the credential layer the eve browser-agent wave is missing."
- **dsh plugin** — TinyVault as a dsh capability seam (Service Definition + Provider + Consumer).
- **WebMCP hostile fixtures** — red-team the credential surface WebMCP punts on (`document.modelContext` sites authoring `verify_identity(password)`-style tools); first leak-rate rows for a WebMCP-consuming agent.
- **KuchiClaw browser access via TinyVault** — the composed-boundaries finale (process boundary + context boundary); 2FA/CAPTCHA as a human-handoff hook to KuchiClaw's chat channel.
- **Second safe public target / masked-input & JS-framework fill edge cases** — timeboxed, only if the demo needs it.
- ~~**Policy dry-run / replay mode**~~ — **graduated 2026-09-01** to `PROJECT-SPEC.md` §7 step 6 (post-v0.1 fast-follow; eval-side `make policy-diff` tool reusing the offline adjudicator).
