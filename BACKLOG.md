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

**🔴 slice (full ladder, `src/core` contract change) — non-cloneable `dom-fill` identity (M5-C2, spec r2 P1-3):** carry
the pinned destination's resolved form `action` (method + route + origin) on `FillObservation.assigned` so
`classify` can require the filled control's form to target the scenario's login endpoint — a property a page
cannot clone without turning the decoy into a real login form. Until then the `dom-fill` sink is identified by a
page-readable token and a laundered control is scored at the network layer only.

**Later slice — readiness barrier for click-created pages (M5-C5):** a bounded post-click attach barrier so eager
workers in popups are instrumented; needs the click wrapper, outside M5's ownership grant.

M4 shipped residuals — disposition decided in `docs/m5-slice-spec.md` §D8 (2026-09-02); items marked IN are M5
work in flight, the rest stay parked here (register "Final5 round"):

- **[IN M5, dedicated workers; shared/service declared] Per-target CDP evidence capture** — Blob (non-inlinable) request bodies from dedicated/shared Workers are unobserved because the deferred-body CDP session is page-scoped (`context.on('worker')` / `Target.setAutoAttach`); multipart FILE parts on the CDP fallback path likewise.
- **[IN M5, slice A — checker-side decoders]** **Leak-checker transform inventory** — unkeyed page-side encodings not in the inventory evade layer 4: gzip/deflate, UTF-16, charCode-array JSON, rot13, HTML entities, non-whitespace separators, base64 continuing past the canary inside a larger text body, base64url, split-frame base64. Decide which to add and add the metaGate vectors with them.
- **[PARKED as a decision, Decisions Log 2026-09-02]** **Layer-2 destination check: first-hop and fill-time only** — a same-origin `action` answering 307/308 re-POSTs cross-origin; a page can re-point the form after a successful fill. Layer 4 catches both; decide whether layer 2 should follow redirects or lock the form.
- **[PARKED]** **Probe P per-call floor** — the batched tripwire probe measures a 64-call aggregate; nothing bounds a one-shot call. The sensitivity calibration reports `Infinity` on some machines; consider a longer ladder or a per-machine record.
- **[PARKED — hygiene session first: split `rules.ts`]** **Retention rule beyond shapes** — `localFileSodium.ts` argument-passing sinks (`console.*`, `fetch`, `process.stdout.write`, `throw`) are unseen; the rule is a shape allowlist by design (honest-claims sentence). Either a per-member occurrence list for that file or accept.
