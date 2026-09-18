# Pre-launch audit — 2026-09-18

One bounded, read-only, two-channel audit before publication (user decision 2026-09-18), on commit
**`82fe7fc`** (docs-only on top of `ddc38e2`, whose literal clean-clone gate was green the same day:
`make test` 3,761 passed / 0 failed / 1 intentional skip, timing 5/5 and 26/26; `make test-docker` 7/7;
`make eval-stub` five scenarios 0/10 leaks, 10/10 completed; `make demo` refuses without a key).
Guardrails set before dispatch: P1 defined up front; only a P1 may change code before launch; at most 15
findings per channel; no second review round; one fix batch, one gate rerun. Owner: Claude, session
`2026-09-18-ship-path-claude`. Both channels left the working tree unchanged (verified).

## Channel 1 — Codex GPT-6 Astra: end-to-end read of the security core

Job `task-mu7j0c7i-g1mhto`. Read completely: every non-test file in `src/core`, `src/supervisor`,
`src/browser`, `src/backends`, `src/adapters/mcp`, and `src/shared/secretTransforms.ts`. Items 2, 3, 4 and 6
(wrong-origin or second injection, provider text forwarding, secret lifetime, misleading comments): none found.

**One finding, P1, confirmed by the owner at runtime.** Caller-supplied selectors reach `DOM.querySelector`
unfiltered (`src/browser/session.ts:456-470`), and "no match" and "matched a locked control" are different
fixed results (`session.ts:625`, `:636-642`). A value-dependent pseudo-class therefore turns the result into an
oracle on the filled value. Owner reproduction (scratch only, synthetic 27-character secret, local-file backend,
the built MCP bundle, a page whose password input carries a `pattern` attribute):

| Page `pattern` | `browser_type "#password:valid"` | `browser_click "#password:valid"` | `…:invalid` (type / click) |
|---|---|---|---|
| `.{12,}` (secret matches) | `locked-field` | `ok` | `no-such-element` / `no-such-element` |
| `.{40,}` (secret does not match) | `no-such-element` | `no-such-element` | `locked-field` / `ok` |

The literal secret never appears in any output. What leaks is one predicate per fill, and the predicate is
whatever constraint the page's own markup puts on the filled control (`pattern`, `required`, length limits). On an
ordinary page that is the site's password policy, which a real password satisfies, so the information is near
zero; a hostile page at the authorized origin can already read the value (declared residual). It is still a
violation of the stated invariant (the untrusted side can "neither read a secret nor express a request that
would leak one") and it is reachable by a hostile model with no trusted-side cooperation, so it meets the P1
definition set before dispatch. The five measured scenarios and `SKILL.md` use colon-free selectors only. (The owner first recorded here that *no* fixture or agent selector contained a colon; that was wrong, from too narrow a search, and the gate caught it: see the gate history below.)

**Disposition: FIXED (user decision 2026-09-18; fix round 2 of 3).** Implemented by Codex GPT-6 Astra as a scoped
slice in an isolated worktree (job `task-mu7jif62-2raoo3`, no deviations reported), reviewed and verified by the
owner. `src/browser/session.ts` refuses any selector containing `:` (Codex wrote a one-line `selectorAllowed` helper; the owner
inlined it at its two call sites, see below); the guard runs in `pinDestination` before the main-frame lookup, so the child-frame Playwright probe never receives such a
selector (a sink the audit's suggested fix would have missed), and in `resolveMainNode`, which gates type and click
before the click locator. No new result reason, schema, description or log line. Two tests added to
`src/core/fillService.browser.test.ts`: one confirms in the page that `:valid` really flips between the two
patterns and then requires identical results from both pages before and after a real fill; the other asserts that
eight colon selectors reach no CDP call, no page locator and no child-frame locator. Owner verification: file 67/67,
typecheck clean; three guard-deletion mutants each killed by assertion (both guards: both tests; fill guard only: the
child-frame test; resolver guard only: both tests) and the restored file byte-identical and green; the original
end-to-end reproduction against the rebuilt MCP bundle now returns `no-such-element` for every probe on both pages.
The rule is stated in `SCHEMA.md` and the README. Accepted cost: selectors with an escaped colon are refused.

**Gate history for this fix (nothing retried to green).** The first clean-clone gate on `8ebdeb6` was **RED**: `make test`
4 failed of 3,764 (Docker 7/7, stub eval, the README snippet check and the `make demo` refusal were green). Three
causes, all the owner's or the slice's, none a product defect: (a) `src/browser/retention.test.ts` pins an allowlist of
function names in `session.ts`, and the new helper changed it (2 failures): fixed by inlining the one-line check, so
no function is added and the pinned allowlist is untouched; (b) two test-support selectors used `:has()`
(`src/agents/stub.ts` `followInjectionAtExactLogin` and the M5-C6 "exact" variant in `testbed/hostile.browser.test.ts`),
so the new rule refused them and a positive control correctly failed: rewritten with the sibling combinator
(`#password ~ button[type=submit]`, `form[action="/login"] #verify-password ~ button`), which selects the same buttons in
the fixture; (c) `src/adapters/mcp/server.host.test.ts` hard-coded version `0.0.0` for the default factory, which reads
`package.json`: updated to `0.1.0`. After the repair: the 14 affected and neighbouring test files 238/238, typecheck
clean, and the three guard-deletion mutants re-run against the inlined guard with the same kills and a byte-identical
restore. This is fix round 3 of 3 for the close.

**Final gate: GREEN on `e55b1e3`** (literal fresh clone, macOS default `TMPDIR`, 2026-09-18 23:21–23:55 UTC):
`make test` exit 0 — 3,763 passed, 0 failed, 1 intentional skip, timing 5/5 and 26/26, entry and execution checks
PASS; `make test-docker` exit 0, 7/7; `make eval-stub` exit 0, five scenarios each 0/10 leaks and 10/10 completed (a
real check this time, since the stub agent file changed); `make demo` refuses without a key. The four previously red
tests and the two new selector tests all pass. The red clone of `8ebdeb6` and its log are preserved by the owner.

## Channel 2 — Claude Opus (fresh subagent): a stranger's first hour

Verdict: publishable after two fixes. Each finding below was checked by the owner against the cited file.

| ID | Sev. | Finding (verified) | Proposed disposition |
|---|---|---|---|
| O1 | P1 | No reader-facing document says how to create the `vault.json` and key the README's MCP section requires; `generateLocalVaultKey` / `writeLocalVault` are mentioned only in M3–M5 slice specs and registers. The owner hit this during the smoke dry run | **Fixed (docs).** README snippet, run verbatim in a clean clone first: vault and key written mode 0600, the MCP server lists the item, a rerun refuses to overwrite the key, the clone stays clean |
| O2 | P1 | `.claude/memory/gotchas_codex.md:198` ends "keep the technique list short and framed as detector coverage", which out of context reads as advice for rewording a prompt past a safety classifier; the surrounding entries and `PROJECT-SPEC.md` §11 say the opposite | **Fixed (docs):** reword to "state what the gate must detect rather than enumerating evasion techniques — accurate framing, never a reword to get past a filter (PROJECT-SPEC §11)" |
| O3 | P2 | Reader-facing files still say the repo is private: `ORIENT.md:59`, `docs/README.md:11` ("Not yet public"), `docs/phase-0-plan.md` build status | **Fixed (docs)**; the historical status text stays inside the collapsed block |
| O4 | P2 | `make demo` is undocumented in the README; `ORIENT.md:50` says "not implemented yet"; `docs/phase-0-plan.md:550` describes a split-screen over saucedemo, which it is not. A reader with a key set would trigger a billed run unknowingly | **Fixed (docs):** say what it runs and roughly what it costs, in all three places |
| O5 | P2 | `ORIENT.md:7` "It's a portfolio project — … the mechanism OpenInstinct hand-rolled" | **Fixed (docs):** neutral wording |
| O6 | P2 | "eve" and "dsh" appear eight times in `PROJECT-SPEC.md` and are never explained (the launch trim removed the only context) | **Fixed (docs):** gloss at first use |
| O7 | P2 | `PROJECT-SPEC.md:165` calls OpenInstinct "harness-committed (eve-only, monolithic app)" making "its security case by assertion"; the repo's own `docs/spec-amendment-factcheck.md` #20 found it ships an encrypted per-action vault | **Fixed (docs):** "ships its vault inside a larger hosted product and publishes no leak measurement" |
| O8 | P2 | The README's main forward link lands on a twenty-line unbroken status blockquote in `docs/phase-0-plan.md` §8 | **Fixed (docs):** one-line status, full text unchanged inside a collapsed details block |
| O9 | P2 | `guides/release.md`, `guides/skills-reference.md`, `guides/tools-catalog.md` are generic workflow boilerplate describing commands and pipelines this repo does not have (`tools-catalog` says Codex is "GPT-5.4") | **Fixed, user-approved:** three files deleted, the two `CLAUDE.md` pointers and one cross-reference removed |
| O10 | P3 | README uses "cohort", "tripwire capture seam" and "canary" without defining them; `6812627` is not labelled a commit | **Fixed (docs)** |
| O11 | P3 | `SCHEMA.md:617` heading still says "implementation acceptance pending"; `package.json` version is `0.0.0` (reported to MCP clients) while every document says v0.1 | **Fixed, user-approved:** heading corrected; `0.1.0` in `package.json` and the lockfile together (scripts pin unchanged) |
| O12 | P3 | README says `make test` is the offline gate without saying it needs `make browsers` first | **Fixed (docs)** |
| O13 | P3 | `PROJECT-SPEC.md` §11 recounts a specific model-safeguard incident and the author's model preferences | **Fixed, user-approved** |
| O14 | P3 | `PROJECT-SPEC.md:146` still carries two superseded sets of leak numbers | **Fixed (docs):** point at the README figures |
| O15 | P3 | `/Users/jonathanavni` paths across the registers | **No action** — accepted by the user earlier today |
| — | — | `docs/m4-probe-p-golden.json` and `docs/m9-lp2-contract-disposition.md` are not in the `docs/README.md` index | **Fixed (docs):** index both |

Keep / delete / move: `templates/` keep (read by the review helper); `tools/probe-p-campaign/` keep (the artefact
behind a preserved red); the other five guides keep; `BACKLOG.md`, `docs/archive/`, `ORIENT.md` keep; no dead
code found in `src/`. Not read by this channel: the testbed, the gate scripts, all tests, most of the registers
(grep-targeted only), and `docs/onepassword-setup.md` beyond its first 60 lines.

## Codex raw report (verbatim)

```text
VERDICT: P1-FOUND — A hostile model can learn a predicate of a filled password through value-dependent CSS selectors and distinguishable tool results.

FINDINGS:

F1 | P1 | src/browser/session.ts:461, src/browser/session.ts:636, src/browser/controls.ts:80

Concrete path: An ordinary canonical-origin form contains a visible, enabled input such as <input id="password" type="password" pattern=".{12,}">. After a successful fill, the model calls browser_type with selector "#password:valid" and text "". A supported ASCII password of 12 or more characters produces {"ok":false,"reason":"locked-field"}; a nonempty shorter password produces {"ok":false,"reason":"no-such-element"}. This reveals a password-length predicate. No page JavaScript, secret reflection, second injection, or trusted-side cooperation is needed.

Evidence: resolveMainNode passes the caller’s selector directly to DOM.querySelector at session.ts:461. typeOnPage distinguishes a missing match at :637 from a tainted/locked match at :642. controls.ts:80–83 preserves that distinction, and src/adapters/mcp/tools.ts:40–42 exposes it in both text and structuredContent. The tool schema accepts any selector string. Repeated fill requests have the same underlying issue because selection and the locked-field check precede the exhausted-handle check.

Tests read confirm separate missing-element and locked-field results, but the inspected tests do not cover value-dependent selectors. This finding is established by source tracing; no runtime reproduction was attempted.

Smallest specific fix: At the beginning of resolveMainNode, before any CDP request, reject selectors containing ":" with the existing fixed MISSING_CONTROL_MESSAGE. This conservatively excludes pseudo-classes, including nested :has(), :is(), and escaped pseudo-class names, across fill, type, and click callers. It also rejects some harmless selectors containing colons.

Item 2 — none found: No additional wrong-origin, subframe, non-password injection, or second-injection path found in fillService.ts, originGuard.ts, lockdown.ts, fillAuthorization.ts, sessionMutex.ts, browserPort.ts, session.ts, inRealm.ts, fillAuthorizationDomain.ts, and lockdownDomain.ts.

Item 3 — none found: No unintended provider/native text forwarding found in backend.ts, localFile.ts, localFileFormat.ts, localFileSodium.ts, localFileWriter.ts, onepassword.ts, onepasswordConfig.ts, onepasswordMetadata.ts, onepasswordProcess.ts, host.ts, results.ts, or the four MCP files. Local-file labels/account hints are deliberately exposed metadata; 1Password metadata uses configured labels rather than provider titles/usernames.

Item 4 — none found: No additional claimed-lifetime, secret-disk-write, environment, or temporary-permission defect found in redaction.ts, fillService.ts, session.ts, the nine backend production files, host.ts, evidenceLease.ts, and tripwire.ts.

Item 5 — F1 is the demonstrated trust-boundary defect. No additional finding in controls.ts, session.ts, fillService.ts, originGuard.ts, sessionMutex.ts, the backend parsers/process wrapper, or main.ts, server.ts, tools.ts, and protocol.ts.

Item 6 — none found beyond the invariant violation explained in F1; reviewed the comments and enforcement in every required production file listed below.

COVERAGE:

Read completely, with filenames grouped by directory:

src/core/: fillService.ts, originGuard.ts, lockdown.ts, redaction.ts, fillAuthorization.ts, sessionMutex.ts, results.ts, types.ts, browserPort.ts. Also read originSweep.ts completely.

src/supervisor/: host.ts, fillAuthorizationDomain.ts, lockdownDomain.ts, tripwire.ts, tripwireSeam.ts, secretMatcher.ts, evidenceLease.ts, bodyCorrelation.ts, consoleSerialization.ts. Also read workerAttach.ts completely.

src/browser/: inRealm.ts, controlResults.ts, controls.ts, playwright.ts, session.ts — all non-test files.

src/backends/: backend.ts, localFile.ts, localFileFormat.ts, localFileSodium.ts, localFileWriter.ts, onepassword.ts, onepasswordConfig.ts, onepasswordMetadata.ts, onepasswordProcess.ts. Also read onepassword.testSupport.ts completely.

src/adapters/mcp/: main.ts, server.ts, tools.ts, protocol.ts.

src/shared/: secretTransforms.ts.

Additional complete reads: src/agents/transcript.ts; src/browser/controls.browser.test.ts; src/browser/controls.snapshot.browser.test.ts; src/browser/session.transport.browser.test.ts; CLAUDE.md; PROJECT-SPEC.md.

Selected sections/searches only: src/agents/loop.ts; src/core/fillService.browser.test.ts and related tests; PLAN.md; SCHEMA.md; docs/phase-0-plan.md; docs/handoff-pattern.md; review-register and memory searches.

Required files unfinished: none.

Verified main at 82fe7fc0641a138728ab5643c20c7ddfec8234fb, with a clean working tree. The diff from ddc38e2 contains only three documentation files. Tests not run, as instructed; the supplied gate results remain owner-reported evidence.

DEVIATIONS:

The initial read-only git commands invoked Apple’s launcher, which attempted temporary xcrun cache writes; the sandbox denied them. Subsequent git checks used the underlying executable directly. No files were changed, tests run, agents dispatched, shared state updated, or network services contacted.
```
