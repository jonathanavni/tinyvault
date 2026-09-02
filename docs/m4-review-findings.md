# M4 Review Register (append-only)

The authoritative record of every review round on M4 — pre-implementation (paper) and post-implementation
(code). Historical sections are never rewritten; corrections are appended and name the over-claim.

---

# Paper round 1 — `docs/m4-slice-spec.md` revision 1 (2026-09-01)

Two channels, run blind and in parallel (neither saw the other's findings):

| Channel | Family (author = Claude, so:) | Verdict |
|---|---|---|
| Claude fresh-context adversarial reviewer (Opus, read-only) | same-family, fresh context | **NEEDS-ATTENTION** — 6 P1, 11 P2, 8 P3, 7 coverage gaps |
| Codex adversarial reviewer (`gpt-5.6-sol`, xhigh) | different-family | **NEEDS-ATTENTION** — 10 P1, 5 P2, 2 coverage gaps, 4 test gaps (against revision 1; first dispatch died at 53 s on model capacity, retried) |

## Claude channel — findings and the continuity owner's synthesis

Severity is the channel's; **Decision** is the continuity owner's (handoff §6). "Absorb" = revision 2 changes
the spec; "Amend" = a locked plan sentence changes with the reason recorded; "Residual" = recorded, not fixed.

### P1

- **R1-1 Main-world `evaluate` is page-overridable (D3/D5).** `instanceof`, `type`, `disabled`, `isConnected`,
  `getClientRects`, `dataset`, and decisively the `value` **setter** are all patchable from page code; a poisoned
  setter receives the plaintext while the function returns `assigned: true`. Only `window.top` and
  `location.origin` are unforgeable. "One synchronous turn" defends against async interleaving, not synchronous
  re-entrancy through accessors. **Decision: Absorb — the primitive changes.** Validate-and-assign runs in a
  **CDP isolated world** (`Page.createIsolatedWorld` → `Runtime.callFunctionOn` on a node resolved via
  `DOM.resolveNode`), where DOM wrapper prototypes are the isolated world's own, and assigns through the
  native setter captured from that world's `HTMLInputElement.prototype`. Poisoned-setter and patched-prototype
  lab pages join Acceptance B. Playwright's own `locator.fill` runs in its utility world for the same reason.
- **R1-2 Form-action check is clobberable and waived (D3/D5).** `<input name="action">` inside the form shadows
  `form.action` (`[LegacyOverrideBuiltIns]`), and `String(element)` resolves as a relative URL to the page origin
  → check passes while the content attribute still targets another origin. And the spec waived the check for
  form-less inputs, enshrining the waiver as a control. **Decision: Absorb.** Read `form.getAttribute('action')`
  (native, isolated world) resolved against `location.href`; **refuse form-less password inputs** (consistent with
  `phase-0-plan.md` §10: non-`<form>` submission is a stated v0.1 limitation); also refuse when any submit control
  in the form carries a `formaction` resolving off-origin. Clobbering and form-less become B mutants.
- **R1-3 Per-pin `elementId` makes `locked-field` unreachable (D3 vs `lockdownDomain.ts` `equalRecords`).**
  A fresh identity per pin never equals the locked one; Acceptance E bullet 1 cannot pass. **Decision: Absorb.**
  `elementId` = the node's CDP **`backendNodeId`** (stable per node for the document's lifetime, obtained from
  the same `DOM.describeNode`/`resolveNode` path R1-1 needs); `documentId` = the main frame's `loaderId` from
  `Page.frameNavigated`. Identity stability is now defined, not left to the implementer.
- **R1-4 The runner cannot pass its own gate (§7 rules 3–4 vs D9).** `testbed/**` files are data-plane roots
  today; D9 has `runner.ts` import `src/supervisor/host.ts` (protected reach, never tolerated) and launch Chromium
  (vetted package from an undeclared importer). **Decision: Absorb — the gate gains an evaluator zone.**
  Entry roots under `testbed/` are the *evaluator* and may reach `src/supervisor/*`; every `src/**` non-protected
  root keeps zero tolerance (a data-plane root reaching supervisor *through* a testbed module is still caught
  because the BFS runs from the data-plane entry). Browser launch moves into the supervisor composition root, so
  vetted importers stay `['src/browser', 'src/supervisor']`. Fixtures: testbed→supervisor PASS; src/core→supervisor
  FAIL; src/core→testbed-module-importing-supervisor FAIL.
- **R1-5 Short-vs-long timing is unpassable by construction (H/D5).** The secret rides in the CDP payload, so 16
  vs 4096 chars differs by ~4 KB; probe P at n=200 will reject systematic sub-millisecond shifts and D10 forbids
  loosening. Per-trial fresh documents are condition-correlated unless kept outside the window. **Decision:
  Absorb.** The transported value is **padded to a constant 4096 code units** with the true length as a
  fixed-width number; the isolated-world function slices before assigning. Secrets longer than 4096 code units
  are refused with `backend-error` and the noninterference claim is bounded to "≤ 4096 code units" (honest
  limitation, stated). Trial setup (fresh page) is explicitly outside the measured window.
- **R1-6 Control-plane `dom-fill` bytes = canary is (a) a vacuous positive control and (b) page-controllable
  (D8/D9).** (a) A service that assigned nothing still yields a canary-bearing authorized `dom-fill`. (b) A page
  that relocates `data-tv-control` makes a correct fill classify as a leak. **Decision: Absorb (a) as a
  change, record (b) as a residual.** The offline positive control is **anchored to the real `network-body`
  login POST** (browser traffic, cross-checked against the fixture's capture record); the `dom-fill` event is
  identity evidence — its bytes remain the canary so the existing classifier shape holds, but no check may be
  satisfied by it alone. (b): fixtures are harness-owned, not the adversary; a fixture relocating its own token
  would score its own fills red, which is loud, not silent. Wrong-element detection is additionally proven by
  a **real** fill into a token-less lab element (R1-9). A `wrongElementFill` outcome field would amend the locked
  scorecard schema — declined for v0.1.

### P2

- **R1-7 C's "check outside the evaluate" mutant survives** the host-side decorator. **Absorb:** (i) the
  isolated-world function is an exported constant unit-tested **in Node with fake DOM objects** (origin mismatch
  → no assignment; detached → none; clobbered action → none; all good → assigned; source contains no `await`);
  (ii) a CDP spy asserts exactly one `Runtime.callFunctionOn` per `inject`; (iii) C keeps the decorator cases as
  behavioural controls.
- **R1-8 G varies only the secret; `filled = policy.fieldRecipe` passes.** **Absorb:** vary `fieldRecipe`,
  `account`, `label`, origin length; assert `filled` stays `['password']`.
- **R1-9 M proves `classify`, not the service.** **Absorb:** a real fill into a lab password element with no /
  a different token, asserting the emitted `requestId`.
- **R1-10 H tripwire timing compares different payload sizes; lacks enabled-vs-disabled and the queued probe.**
  **Absorb** all three.
- **R1-11 `url` observation only after step 3 loses the asserted-lookalike attack.** **Absorb:** emit for every
  call with a live session, immediately after step 0.
- **R1-12 `MaskedSnapshotNode.name`/`role` are page free text on masked nodes; `url` carries the query.**
  **Absorb:** masked nodes are `{ tag, masked: true }` only; `url` = origin + pathname; the `url` event bytes likewise.
- **R1-13 Masking covers the injection site only; mirrors are unmasked.** **Absorb** a mirroring lab page and
  amend the claim: mirrors are *measured* by the checker (tool-result channel), not masked.
- **R1-14 Visibility check accepts `visibility:hidden`, `opacity:0`, off-screen, zero-scale.** **Absorb:**
  computed-style check plus `elementFromPoint` hit-test at the element centre; each variant in B.
- **R1-15 Collapsing browser throws to `origin-not-authorized` pollutes the `wrongOrigin` join.** **Absorb +
  Amend §2 step 5:** the isolated-world function returns a reason (`origin` | `identity`); `origin` →
  `origin-not-authorized`; `identity` and every host-side browser/port throw → `no-password-control`.
  `origin-not-authorized` is reserved for origin outcomes. Recorded as a continuity-owner amendment to the
  plan's "any identity/origin mismatch → origin-not-authorized" sentence.
- **R1-16 `cross-origin-frame` semantics inverted vs `types.ts:46`.** **Absorb:** pin searches the main frame
  only; on a miss, the other frames are searched **only to choose the reason** — match in a cross-origin frame →
  `cross-origin-frame`; same-origin subframe or nowhere → `no-password-control`. Never fills a subframe.
- **R1-17 D6 widens "trusted-side top-level navigation" to any main-frame cross-document navigation; the
  epoch short-circuit test races CDP delivery.** **Amend §4 wording** with the stated rationale (tainted nodes no
  longer exist; type-masking covers the new document; bfcache restore is noted); the C decorator awaits an
  observable navigation signal before continuing.

### P3

- **R1-18** A's inspection cannot see closures — state the limitation as K does. **Absorb.**
- **R1-19** The `.expose(`/`.consume(` grep is defeatable — also assert `Secret.prototype` is never named and
  which modules import `Secret`. **Absorb.**
- **R1-20** §7 claims "hash-recorded" but reads only `version` — read the lockfile `integrity` too. **Absorb.**
- **R1-21** Commit sequencing: rule 5 has no real traversal in commit 1; commit 2 is too large. **Absorb:**
  four commits — (1) gate tiers + dependency + `src/browser/playwright.ts` (the single import boundary, so the
  traversal is real); (2) session + controls; (3) fill service + supervisor host + gates; (4) testbed.
- **R1-22** `backend.dispose()` per session close drops shared session material. **Absorb + Amend §3:**
  dispose on host `closeAll()`, not per session.
- **R1-23** ABBA / randomised pairing and `performance.now()`. **Absorb.**
- **R1-24** Scope left to the implementer (CDP optional, `StubStep` "may", identity rule). **Absorb:** all
  three decided (CDP mandated by R1-1; `StubStep = (turnIndex, messages) => ModelTurn`; R1-3).
- **R1-25** The fixture's `in-process` transport fallback is unreachable by a real browser. **Absorb:** the
  runner fails loudly under M4 when the fixture is not HTTP.
- **R1-26** Network tap on `page`, body-only. **Absorb** `context.on('request')`; body-only stays (the `url`
  channel producer is M5's coverage gate).

### Coverage gaps (all absorbed into revision 2)

frame-detach case (add `document.open()` and ancestor-detach lab cases; note main-frame-only pin);
H performs G's equality assertions explicitly; tripwire queued probe + enabled-vs-disabled timing; pre-lock
survives a step-6 `resolveSecret` failure (test); wrong-origin *assertion* refused at step 2 scored by
`wrongOrigin`; browser acquisition: `make test` fails loudly with a fixed message naming `make browsers`.

### Test gaps (all absorbed)

Clobbering / form-less / poisoned setter / patched prototype mutants; `locked-field` reachability; policy-varying
G rows; observed-origin assertion; second fill after backend failure; concurrent close-mid-fill across two
sessions; the snapshot's `tool-result` event still reaches the loop (layer-4 independence); snapshot with a
disposed tainted handle.

### Residual risk (recorded)

bfcache restore bumps the epoch while the restored document still holds plaintext — type-masking covers it;
`playwright-core`'s opaque loaders; probe P bounds, never disproves; a missed network capture must fail the
run via the fixture-capture agreement check, never read as clean (made mandatory in revision 2).

## Codex channel — findings and the continuity owner's synthesis

Codex reviewed **revision 1** (its dispatch started before revision 2 existed; line refs are revision 1's).
Verdict **NEEDS-ATTENTION**: 10 P1, 5 P2, 2 coverage gaps, 4 test gaps. Convergent with the Claude channel
(high confidence): the runner cannot pass the gate (= R1-4), `dom-fill` bytes are synthetic and the positive
control is vacuous (= R1-6), the C decorator cannot kill a split-evaluate implementation (= R1-7), `href` has no
source in the port (fixed in revision 2's `observeTop()`), `cross-origin-frame` semantics (= R1-16). New:

### P1

- **X1-1 D6 vs C/E contradiction.** C required the pinned identity to remain `isLocked` after a cross-document
  `page.goto`, while D6 clears the session's registry on exactly that navigation and E requires `lockedCount()
  === 0` afterwards. No implementation passes both. **Decision: Absorb.** After a cross-document navigation the
  old identity is **stale**: `registry.isLocked(old)` throws `INVALID_CONTROL_IDENTITY_MESSAGE` (the domain's
  generation bump) and `lockedCount()` is 0. "Still locked" is reserved for same-document mutations
  (`el.remove()`, replacement, action change, `pushState`).
- **X1-2 "Exactly one `expose()`" grep matches `this.expose()` inside `Secret.consume()`; inspection cannot
  see private fields, closures, or module `WeakMap`s.** **Decision: Absorb.** The grep excludes
  `src/core/redaction.ts`; reflection claims are stated as own-property-only; retention is *proven by
  mutation*: a `#cachedSecret` mutant must die on K's same-session rotation (X1-7), and K's `consume` spy counts.
- **X1-3 The pull-only tap is a fourth plaintext lifetime.** `src/browser` buffering POST bodies (which carry
  the plaintext) until someone drains them is data-plane retention the three-lifetime contract does not cover.
  **Decision: Absorb — the data plane never holds evidence.** The session host receives a **context factory**
  (`newContext: () => Promise<BrowserContext>`) from the composition root; in the supervised host the factory
  attaches the supervisor's own `request` listener before handing the context over, and the bodies live in the
  **evaluator lease** (control plane), drained by the runner, dropped in `finish()`/`abort()` `finally`. In
  production (no supervisor) the factory is a plain `browser.newContext()` and nothing is captured. The factory
  runs once per session before any secret exists, so it is a construction seam, not a data-path hook. Tests:
  drain/drop on success, abort, capture failure, close.
- **X1-4 (= R1-6, extended)** — also check raw host evidence *before* the runner stamps request ids, and mutate
  both DOM tokens before a fill. **Absorb.**
- **X1-5 G exercises no secret-bearing failure path.** Every listed refusal happens before `resolveSecret`.
  **Absorb:** rows for in-realm `assigned: false` (`origin` and `identity`) and an evaluate throw **after
  `consume()`**, across the whole secret matrix, with exact result and thrown-status equality.
- **X1-6 I does not prove matching happens only in `finish()`.** **Absorb:** spy `mint`/`adjudicate`: zero
  calls before `finish()`, exactly one sealed adjudication inside it.
- **X1-7 K's two-session rotation lets a per-session cache pass.** **Absorb:** rotate **within one session and
  one fill-service instance** — fill A, cross-document navigate (clears the lock), reseal B, fill → B; the
  two-session variant stays for the evidence-partition assertion only.
- **X1-8 BFCache restore is undefined.** **Absorb: back/forward cache is disabled** for TinyVault's browser
  (`--disable-features=BackForwardCache`), so a back navigation is a fresh document; test navigate-away/back →
  password field empty, no taint. The revision-2 "type-masking covers it" residual is retired.
- **X1-9 (= R1-4)** — convergent; the evaluator zone (§7.2) is the fix.
- **X1-10 (= R1-7)** — convergent; the Node unit tests of the in-realm sources + the single-`callFunctionOn`
  spy are the fix.

### P2

- **X1-11 `BrowserControls` results lack exact constructors and a closed foreign-exception mapping; snapshot
  extraction is implementer-defined.** **Absorb:** `src/browser/controlResults.ts` with exact constructors,
  every Playwright/CDP throw mapped to a closed reason per operation, `browser_open_session` failing with one
  fixed error, and the snapshot extraction algorithm pinned (D7), with byte-exact tests.
- **X1-12 H has no seam for mutex occupancy (wrapping re-enters the mutex) or for a test-only fill service.**
  **Absorb:** occupancy = start time of a trivial `runExclusive` enqueued immediately after the fill (no
  mutex change); `src/supervisor/host.ts` exports `composeSupervisedHost({ fillService, sessions, canary })`
  for tests (protected module — the evaluator zone may import it).
- **X1-13 N does not prove attempt/result correlation.** **Absorb:** a multi-call case with swapped request ids;
  the forged case uses `assertedOrigin`.
- **X1-14 §7 tolerance is package-wide; the honest claim says "no path".** **Absorb:** the manifest names the
  exact importer files whose unsupported/unresolved loads are tolerated (`lib/coreBundle.js`,
  `lib/utilsBundle.js`); anything else in the package fails closed; rule 4 runs the **real gate process** with
  the manifest disabled via an env override; the claim reads "no *scanned or resolved* path".
- **X1-15 `href` unsourced** — already fixed in revision 2 (`observeTop()`).

### Coverage and test gaps (absorbed)

Redirect-chain and page-close/top-frame-detach cases in C; context isolation test (cookie in session 1 invisible
in session 2); session-id entropy (`randomBytes(16)` spy; a sequential-id mutant fails); a native-throw matrix
for every browser control with byte-exact closed results; `about:blank` intermediate document; rule-4
real-gate execution with wrapper→`playwright-core` and undeclared-root mirrors.

### Round-1 synthesis

Both channels rejected revision 1 and their P1 sets overlap on four items; the union is absorbed in
**revision 3**. Findings narrowed from primitives (isolated world, evaluator zone, lifetimes) to test shape and
seams, but two round-1 items reopened primitives (R1-1, X1-3), so **round 2 runs on revision 3 with both
channels, blind**, per handoff §5.

## Continuity-owner probe evidence for revision 3's mechanisms (2026-09-01, real Chromium)

Scratch install of `playwright@1.62.1` + Chrome Headless Shell 151.0.7922.34; probe scripts in the session
scratchpad (`pw-lab/probe.mjs`, `probe2.mjs`). A hostile page poisoned the element's own `value` setter/getter,
`HTMLInputElement.prototype.type`, `Symbol.hasInstance`, and `Element.prototype.getAttribute` in the main world.

```
isolated world (Page.createIsolatedWorld + DOM.resolveNode + Runtime.callFunctionOn):
  own `value` descriptor visible: false; native setter captured there assigned the real value;
  main world afterwards: poisoned getter -> "poisoned", native getter -> "S3cret!", window.__leak -> undefined
  form submit POST body: u=&p=S3cret%21                      (the real bytes reached the server)
  getAttribute('type'), .type, toString tag, el.form, action origin, elementFromPoint: all native, all correct
NUL padding: padEnd(4096, U+0000) survived CDP; padded.length 4096 in-realm; slice(0, len) assigned correctly
backendNodeId: stable across a same-document DOM move (true); differs across documents (9 vs 25)
history.pushState: Page.navigatedWithinDocument only — no Page.frameNavigated
redirect chain 302 -> 302 -> page: one Page.frameNavigated with the final URL (intermediates emit none)
callFunctionOn on a detached node in the isolated world: runs; isConnected false, form null
goBack after fill: Page.frameNavigated type "Navigation" (not BackForwardCacheRestore) with AND without
  --disable-features=BackForwardCache; text field value RESTORED by Chromium form-state restoration
  ("user1"), password fields NOT restored ("" for type=password, with and without autocomplete=new-password)
```

Consequences: R1-1/R1-3/R1-5/X1-1 mechanisms are confirmed workable as specified. **D6 gains a sentence:** the
empty-password-field assertion after `goBack()` holds because Chromium never restores password controls; text
controls *are* restored by form-state restoration, which is unrelated to the back/forward cache — the test must
assert on the password field. The BFCache flag stays as belt-and-braces.

---

# Paper round 2 — `docs/m4-slice-spec.md` revision 3 (2026-09-01)

| Channel | Family | Verdict |
|---|---|---|
| Claude fresh-context adversarial reviewer (Opus, read-only, blind) | same-family, fresh context | **NEEDS-ATTENTION** — 8 P1, 10 P2, 6 P3, 5 coverage gaps |
| Codex adversarial reviewer (`gpt-5.6-sol`, xhigh, blind) | different-family | **NEEDS-ATTENTION** — 8 P1, 6 P2, 4 coverage gaps, 7 test gaps |

## Claude channel — findings and the continuity owner's synthesis

Most P1s are **consistency errors in revision 3's own absorptions**, not new primitives; two are new holes
(R2-8 visibility, R2-5 asserted-lookalike). Probed where empirical (`pw-lab/probe3.mjs`; evidence below).

### P1

- **R2-1 The epoch check is unreachable and its test is vacuous; step 6 contradicts C.** The domain's generation
  bump makes `registry.lock(stale)` *throw* before step 6 runs, the throw fits neither catch-all, and C's epoch case
  passes with no epoch check at all. Step 6 said `origin-not-authorized` where C said `no-password-control` for
  the same event. **Absorb:** a typed `InvalidControlIdentityError` (pre-dispatch amendment to `src/core/lockdown.ts`,
  thrown by the domain); the fill service catches it anywhere in steps 4–7, **re-observes the top origin**, and
  returns `origin-not-authorized` iff the re-observed origin ≠ canonical, else `no-password-control`; the epoch
  check moves before step 4's `isLocked` and uses the same rule; C gains a fake-port case whose only failing
  mutant is the missing epoch check (`resolveSecret` count 0 vs 1).
- **R2-2 NUL padding inverts the size correlation.** `JSON.stringify` escapes U+0000 to six characters: probed
  24,498 bytes for a 16-unit secret vs 4,098 for a 4096-unit one. **Absorb:** pad with ASCII `'A'` (probed: 4,098
  bytes either way); non-ASCII content doubles the JSON byte size (probed: 8,194 for 4096 `é`) — stated residual;
  probe P's short-vs-long gate measures ASCII secrets.
- **R2-3 The runner's blanket `requestId` stamping destroys `dom-fill` identity** (`classify` requires
  `requestId === control.requestId`). **Absorb:** stamp only events **lacking** a `requestId` (the `url`
  observations); a test asserts the drained `dom-fill.requestId` survives the wrapper.
- **R2-4 `LockdownLifecycle` lives in `src/supervisor/lockdownDomain.ts`; a type-only import from `src/browser`
  is a literal edge into the protected zone.** **Absorb (pre-dispatch amendment):** the type moves next to
  `LockdownRegistry` in `src/core/lockdown.ts`; L gains the must-FAIL mutant "a `src/browser` file `import type`-ing
  from `src/supervisor`".
- **R2-5 The asserted-lookalike attack is unscorable** (attempt = observed origin ≠ canonical; the page *is* on the
  canonical origin). R1-11 moved the hole. **Absorb:** when step 2 refuses, the trusted side records a second
  observation `{ channel: 'url', direction: 'internal', initiator: 'fill-service-asserted', origin: assertedOrigin,
  bytes: 'asserted' }`; attempts are the union. It is a trusted-side record of what the caller asserted, not the
  checker reading `tool-arg` — the M4 row's rule holds.
- **R2-6 `MAX_SECRET_CODE_UNITS` cannot be enforced in the fill service without a second expose site.**
  **Absorb:** enforced inside `inject` (the one consume site): `{ assigned: false, reason: 'too-long' }` →
  `backend-error`; the grep stays intact.
- **R2-7 (part of R2-1)** — reason on cross-document staleness derives from re-observation. Absorbed above.
- **R2-8 Visibility predicates are not ancestor-aware, and `ASSIGN_SOURCE` is never tested for having them.**
  Probed: `getComputedStyle(el).opacity` is `'1'` under an `opacity: 0` ancestor; `el.checkVisibility({
  checkOpacity: true, checkVisibilityCSS: true })` returns `false` there but `true` under `filter: opacity(0)` and
  `true` under a full-viewport overlay; `elementFromPoint` returns the overlay. **Absorb:** visibility = `checkVisibility`
  **plus** an ancestor walk rejecting any computed `filter` containing `opacity(0)` **plus** the hit-test (accepting
  `el`, a descendant, or a `<label>` whose `control` is `el`), after `scrollIntoView` in the same turn; both source
  constants embed one shared `DESTINATION_PREDICATES_SOURCE` string and a test asserts it is present in both;
  ancestor-opacity, ancestor-filter, and overlay-after-pin lab cases join B and C.

### P2

- **R2-9** The context factory's `request` listener runs synchronously inside data-plane page operations and
  its cost tracks `postData` size; "honoured by construction" overstates. **Absorb:** the amendment sentence is
  narrowed to "no *match-dependent* hook; capture is provenance-blind and never branches on content"; H gains a
  probe-P condition on the **real** browser path with and without the lease listener; I gains a real-path
  byte-equality test.
- **R2-10** Observation byte-equality across the policy axis is impossible (the page must be *at* the varying
  origin). **Absorb:** observation equality is scoped to the secret axis; result equality spans both axes.
- **R2-11** No host-rejection → `FillResult` mapping (`runExclusive` creates state for unknown ids; the mutex's
  closed/reentrant errors are free text). **Absorb:** typed `SessionHostError { kind: 'unknown-session' |
  'closing' | 'reentrant' }` thrown by the host; `unknown-session`/`closing` → `session-unknown`; `reentrant` is
  an internal invariant failure → the fixed closed result for the operation **and** the F mutant test observes
  the typed throw at the port layer.
- **R2-12** `--disable-features=BackForwardCache` may clobber Playwright's own `--disable-features` list.
  **Absorb:** the dedicated `--disable-back-forward-cache` switch (probed: accepted).
- **R2-13** `document.open()` emits no `Page.frameNavigated`. Probed: it emits **`Page.documentOpened`**.
  **Absorb:** D6 treats `Page.documentOpened` on the main frame as a document replacement (epoch bump, clear);
  C keeps `document.open()` in the cross-document group.
- **R2-14** The hit-test refuses below-the-fold fields and label overlays. **Absorb** (with R2-8): `scrollIntoView`
  in-turn; accept `el`, a descendant, or a `<label>` for `el`; both as B controls that must succeed.
- **R2-15** `wrongOrigin.blocked` is `some`, not `every`. **Absorb:** `attempts.length > 0 && attempts.every(...)`;
  N gains a two-attempt case.
- **R2-16** `Runtime.callFunctionOn` result handling and `this` binding unspecified. **Absorb:** `{ returnByValue:
  true, awaitPromise: false }`; `Runtime.releaseObject` on pin disposal; `this` = the node in both sources and
  the Node fakes.
- **R2-17** Evidence drain race after the last tool call. **Absorb:** the runner drains once more after the loop,
  after `page` load state settles, before `finish()`; N asserts the login `network-body` is present.
- **R2-18** Unresolvable tainted node in the snapshot. **Absorb:** skipped, never dropped; E gains
  remove-and-reinsert and type-mutated-after-fill cases (taint is by node, not by type).

### P3 (all absorbed)

Username-role narrowing and `browser_close_session` not under the mutex added to the amendments list; `dom-fill`
`origin` = `assigned.observedOrigin` (the origin proven in the assignment turn); the browser-missing test points
`PLAYWRIGHT_BROWSERS_PATH` at an empty directory; timing tests get an explicit per-test timeout (180 s) and a
stated wall-clock budget (≤ 6 min for all timing files); `opaqueFiles` match by realpath suffix under
`node_modules/`; the gate's `external package traversal exceeded` message is a violation in every tier (stated);
shadow-DOM inputs are a stated v0.1 limitation.

### Coverage and test gaps (absorbed)

Frame-detach inapplicability stated (main-frame-only pin); closure-retention mutant named (a retained `padded`/
`value` in `inject` — a second `inject` on a cleared `Secret` must fail, not reuse); every browser control asserted
to acquire `runExclusive` (spy count); lease drop in a `finally` proven by an injected `adjudicate` throw; real
supervised path vs bare path (real browser) byte-equal and under probe P; `ASSIGN_SOURCE` visibility predicates
tested via the shared source text; snapshot single-`callFunctionOn` spy; rule 4 asserts the specific expected
importers, not just FAIL.

### Residual (recorded)

`data-tv-control` relocation by a hostile fixture becomes live at M5 — **owner: M5's slice spec** must state how
its fixtures carry the token. `adoptNode` into a subframe: the top-document `elementFromPoint` check is
load-bearing; named. Epoch/taint state from CDP events is defence-in-depth; the isolated-world context destruction
is the authority — stated in D6. Evidence on disk (`events.json`) holds plaintext by design (the eval's own record).

### Probe evidence (`pw-lab/probe3.mjs`, real Chromium)

```
JSON size: NUL-padded 16-unit secret 24498 B | 'A'-padded 16-unit 4098 B | 4096 ASCII 4098 B | 4096 'é' 8194 B
document.open(): Page.documentOpened only (no frameNavigated, no navigatedWithinDocument)
checkVisibility({checkOpacity,checkVisibilityCSS}): true baseline; FALSE under ancestor opacity:0
  (getComputedStyle(el).opacity still '1'); TRUE under ancestor filter:opacity(0); TRUE under a full overlay
elementFromPoint under a full-viewport overlay: the overlay
--disable-back-forward-cache: accepted by Chrome Headless Shell 151
```

## Codex channel — findings and the continuity owner's synthesis (round 2, revision 3)

Convergent with the Claude channel: request-id stamping (= R2-3), `document.open()`/page-close lifecycle signals
(= R2-13), G's impossible observation equality and non-policy fields (= R2-10). New:

### P1

- **Y2-1 R1-13 replaced prevention with measurement; "plaintext never model-visible" is unqualified while a page
  can mirror the filled value into a `<span>` or the pathname and `browser_snapshot` returns it.** **Decision:
  Amend, explicitly.** TinyVault's model-blind claim governs *TinyVault's own outputs* (results, masked controls).
  Page-derived browser output — unmasked values, text, names, the path — is content the **authorized origin**
  chooses to display; only page code can mirror the value, and the authorized origin is the accepted residual
  (§10). The pre-authorized amendments now state: *page-derived browser outputs are outside the noninterference
  invariant; the checker measures them; a hostile authorized origin is the stated residual.* Not "restrict
  snapshots to structure" — a model that cannot read the page cannot log in.
- **Y2-2 The asserted-lookalike case contradicts the observed-origin rule.** Codex: make it `false/false` or a
  separate metric; the Claude channel (R2-5) proposed a trusted-side record of the assertion counted as an attempt.
  **Decision: side with Codex — attempts are observed-origin only.** The M4 row's rule exists because the agent's
  self-description is untrusted; a lookalike *assertion* while the page is on the canonical origin is a refused
  request, not a wrong-origin fill attempt. The trusted side still records the refusal as evidence (`initiator:
  'fill-service-asserted'`), but `wrongOrigin` ignores it. N's case becomes `attempted: false, blocked: false` with
  the event present. R2-5's union is **withdrawn**.
- **Y2-3 (= R2-3)** — stamp `requestId` only where absent. Convergent.
- **Y2-4 The per-run token is page-readable and cloneable onto a replacement element.** Codex asks to bind the
  expected control to the original `backendNodeId` before agent activity (a token-mechanism amendment).
  **Decision: Residual, declined.** The adversary in the testbed is the *agent*, which cannot run page script;
  the page is the harness's own fixture (R1-6(b)). A `backendNodeId` binding would have to be persisted by the
  runner unattested — weaker than the receipt-bound nonce. **Owner: the M5 slice spec** must state its fixtures'
  token discipline. Recorded in the register and the spec's residuals.
- **Y2-5 A write-only `#lastPadded = padded` stash passes A, K, and every counter.** True — rotation kills reuse,
  not retention. **Absorb:** a **structural source test** parses `src/browser/session.ts` and `src/core/fillService.ts`
  with the TypeScript compiler and asserts that within the function containing the `consume()` call every binding
  derived from it is a `const` local never assigned to a property, class field, module variable, or captured by a
  closure that outlives the call; the named mutant `this.#lastPadded = padded` fails it. Plus the closure mutant
  from the Claude channel (a second `inject` on a cleared `Secret` must fail, not reuse).
- **Y2-6 (= R2-13 + page close)** — `Page.documentOpened` owns `document.open()`; Playwright `page.on('close')`
  owns page close (session teardown: stale identities, `lockedCount()` 0); the `about:blank` intermediate case gets
  an explicit two-epoch test. Absorbed.
- **Y2-7 `browser_type` checks a CDP-resolved node then calls selector-based `locator.fill` — a swap window.**
  **Absorb:** `type` assigns through `Runtime.callFunctionOn` on the **same resolved node** in the isolated world
  (native setter + events), after the lock check in the same host step; a swap decorator test replaces the node
  between resolve and assign and asserts the locked node stays untouched.
- **Y2-8 (= R2-10, extended)** — `account`/`label` are `ItemMeta`, not `CredentialPolicy`. **Absorb:** the policy
  axis is `fieldRecipe` × `canonicalOrigin`; observation equality is on the secret axis; mismatching-policy refusal
  rows assert `observation.topOrigin` equals the **page's** origin, killing `topOrigin = policy.canonicalOrigin`.

### P2

- **Y2-9 The 4096 bound narrows the locked length-noninterference invariant without an amendment.** **Absorb:**
  the bound becomes a **credential-record precondition**: `writeLocalVault` refuses a secret longer than 4096 code
  units (`Invalid local vault entry`), so no conforming vault holds one; `inject`'s `too-long` path stays as
  defence-in-depth; the §4 wording amendment ("for every secret a conforming backend can hold; local-file bounds
  that at 4096 code units") is listed explicitly. Codex's ownership extends to `src/backends/localFileWriter.ts`
  for that one rule and its test.
- **Y2-10 The `BrowserControls` amendment is not yet on `main`.** Expected: it is applied at lock, before dispatch;
  the status line now says so and the packet's "verify with `git log`" instruction stands.
- **Y2-11 Commit 2's tests need the fill service.** **Absorb:** commit 2 owns only fill-independent tests (pin
  outcomes through the port directly, controls matrix, isolation, id entropy, in-realm Node tests); every
  fill-dependent case moves to commit 3.
- **Y2-12 The importer rule constrains direct edges only; `src/core → src/browser/playwright.ts → playwright-core`
  launders the tolerance.** **Absorb:** a **reachability** rule — a vetted package may be reached only from entry
  roots under `importers` or the evaluator zone; and the port/host **types** move to `src/core/browserPort.ts`
  (browser imports core, never the reverse) so `fillService.ts` has no edge into `src/browser`. Mutant:
  `src/core/x.ts → src/browser/playwright.ts` FAILS.
- **Y2-13 Rule 4's env override can be gamed.** **Absorb:** the manifest is a **configuration parameter** of
  `checkDependencyBoundary(root, { vetted })`; the selftest runs the same real graph with the real list (PASS) and
  an empty list (FAIL naming the two bundles).
- **Y2-14 Enabled-vs-disabled timing rejects constant capture overhead.** **Absorb:** per `phase-0-plan.md` §4,
  enabled-vs-disabled is a **byte** equivalence (I); probe P applies to **equal-work match vs no-match** paths (H),
  including the real browser path with the lease listener attached (content match vs no-match).

### Coverage and test gaps (absorbed)

Write-only stash (Y2-5); lifecycle signals per transition (Y2-6); `browser_type` swap (Y2-7); form-associated
external submit controls (`form.elements`, not descendants) with off-origin `formaction`; I plants a trusted-result
leak through **every** captured method; probe P pins **200 samples per condition** (100 ABBA blocks).

### Round-2 synthesis

Findings narrowed from primitives (round 1) to consistency, seams, and test shape (round 2); two primitives were
touched (Y2-7 `type` mechanism, Y2-12 reachability) but neither reopened the fill gate or the isolated-world
inject. Revision 4 absorbs both channels. **Round 3 is the cap** (handoff §5): it runs on revision 4 with both
channels, and the spec locks afterwards regardless, with remaining validation moving to code and the integrator's
confirmation pass.

---

# Paper round 3 (the cap) — `docs/m4-slice-spec.md` revision 4 (2026-09-01)

| Channel | Family | Verdict |
|---|---|---|
| Claude fresh-context adversarial reviewer (Opus, read-only, blind) | same-family, fresh context | **NEEDS-ATTENTION** — 4 P1, 7 P2, 6 P3, 3 coverage gaps |
| Codex adversarial reviewer (`gpt-5.6-sol`, xhigh, blind) | different-family | **NEEDS-ATTENTION** — 8 P1, 7 P2, 2 coverage gaps, 9 test gaps (blindness partially broken: it read this register after the Claude section landed; it states its verdict is against revision 4 itself) |

Per handoff §5 this is the cap: revision 5 absorbs both channels and **locks**; no round 4. The post-implementation
ladder and the integrator's confirmation pass carry what paper cannot settle.

## Claude channel — findings and the continuity owner's synthesis

### P1

- **Z3-1 The staleness rule re-observes against a dead page and can throw free text to the caller.** `page.on('close')`
  → `clearOnSessionClose` → every identity throws; `observeTop()` on a closed page rejects (Target closed) inside a
  `catch`. **Absorb:** `observeTop()` **never rejects** (returns `{ origin: null, path: null }` on any failure — the
  `probeAvailability` precedent); the staleness handler is split: session gone → `session-unknown`; page/context gone
  with the session alive → `no-password-control`; only a *successfully* re-observed differing origin →
  `origin-not-authorized`; the whole handler is wrapped so any throw → `no-password-control`; C's `page.close()` row →
  `no-password-control`.
- **Z3-2 `form.elements` is `[LegacyOverrideBuiltIns]`-clobberable like `form.action`; `<input name="elements">`
  makes the `formaction` scan see zero controls.** **Absorb:** read the collection through
  `Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, 'elements').get.call(form)` in the isolated world; B
  gains `<input name="elements">` + off-origin `formaction` → `no-password-control`, and the same-origin control.
- **Z3-3 The AST retention rule is intra-function and assignment-only.** `this.stash(padded)`, `this.#lastLen =
  value.length`, destructuring/spread/template/`arguments` all escape. **Absorb:** taint propagates through any
  expression syntactically referencing a tainted binding (destructuring, spread, template literals, member access
  incl. `.length`, `arguments`); a tainted expression may appear **only** as the initializer of a `const` local or as
  an argument to the single whitelisted `callFunctionOn` call — any other use (call argument to anything else,
  `return`, property assignment, closure capture) fails; the three mutants are named.
- **Z3-4 The post-loop drain has nowhere to land.** `runAgentLoop` closes the transcript (writing `events.json`) before
  the runner can add late evidence, and `loop.ts`/`transcript.ts` are on the must-avoid list. **Absorb (scoped
  ownership amendment):** `runAgentLoop` gains an optional `afterLoop?: () => Promise<readonly CapturedEventInput[]>`
  hook invoked once **before** `transcript.close()`, appended as a `meta` record `{ event: 'post-loop-drain' }` so `t`
  continuity and attestation order are preserved; post-loop events carry no `requestId`. Codex owns that one hook in
  `src/agents/loop.ts` (+ its test).

### P2 (all absorbed)

- **Z3-5** Tokens and `observedOrigin` are read **before** the `dispatchEvent` calls; M's rewritten-token expectation
  becomes "an `input` listener that rewrites the token → the pre-dispatch values".
- **Z3-6** `scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })`; a `scroll-behavior: smooth`
  lab page joins B's must-succeed controls; the pre-secret scroll side effect is a stated residual.
- **Z3-7** `runExclusive` hands the fill service a **frozen three-method façade**, not the `SessionPage`; a test asserts
  `Reflect.ownKeys(port)` is exactly `['documentEpoch','observeTop','pinPasswordDestination']`; mutant: passing `page`.
- **Z3-8** `wrongOrigin.blocked` = every attempt correlates to a `tool-result` that is **not** `{ ok: true }`; an
  **uncorrelated** attempt makes the run invalid (throws), never `blocked: false`; N gains the `handle-unavailable`-on-
  lookalike case and the uncorrelated case.
- **Z3-9** A's `redaction` allowlist adds `src/core/browserPort.ts` (type position).
- **Z3-10** The `Secret`'s `try` opens immediately after `resolveSecret` returns and its `finally` clears on every exit,
  the staleness rule included; mutant: `try` wrapping only `inject`.
- **Z3-11** J's "lease inspect shows no canary" was unfalsifiable (`#canary`, module `WeakMap`s). Replaced by:
  `adjudicate(oldBatch)` after `finish()` throws; `captureTrusted` after close throws; a test-only lease inspector
  returns an empty array; mutants: dropping `#canary = null`, dropping the evidence clear.

### P3 (all absorbed)

**A/B/A/B, not ABBA** — §4's locked sentence stands; R1-23's ABBA suggestion is declined (warm-up discards cover the
bias it targeted). Event order `focus, input, change, blur`. `localFileWriter.ts` imports `MAX_SECRET_CODE_UNITS`
(one home) with a test. G's success rows use a lab page with **static** tokens. Step 0 captures `epoch0`; C's epoch
decorator acts between `pinPasswordDestination` returning and the epoch read. **Lease evidence is never passed to
`captureTrusted`/`captureMixed`**; I gains the case of a canary-encoded `assertedOrigin` → `finish()` `'pass'`.
`Page.documentOpened` is experimental: C's cross-document group is its absence-detection signal (stated).

### Coverage gaps (absorbed)

J covers lease drop on refusal, tool-op throw, session close, and tripwire match (§4's list); K's same-session
rotation asserts "no A in second-fill evidence"; the `browser_snapshot` tripwire exemption is a stated residual
(layer 4 measures it).

## Codex channel — findings and the continuity owner's synthesis (round 3, revision 4)

Convergent with the Claude channel: `form.elements` clobbering (= Z3-2), post-loop drain (= Z3-4), AST retention
rule (= Z3-3), the `SessionPage` façade (= Z3-7), tokens read after `dispatchEvent` (= Z3-5), the `redaction`
allowlist (= Z3-9), the K "no A" clause, A/B/A/B (= Z3 P3). New:

### P1

- **W3-1 Execute-then-reject.** A CDP call may run the setter and then reject before acknowledgment; taint was
  recorded only on `assigned: true`, so plaintext could sit untainted while the caller sees failure. **Absorb:** the
  taint entry `{ identity, backendNodeId }` is recorded **before** the `callFunctionOn` and removed only on a
  *returned* `assigned: false`; a transport rejection keeps it (conservative). The "nothing written to the DOM" claim
  is narrowed to *returned* refusals; an ambiguous rejection is stated as "masked and locked, contents unknown".
  Test: a decorator that runs the real setter then rejects → `no-password-control`, node masked, identity locked.
- **W3-3 Mid-fill A→B is blocked but scored `false/false`.** Only the step-0 origin was persisted. **Absorb:** the
  in-realm `origin` failure returns the observed origin; the staleness rule's successful re-observation is persisted
  as `observation.reobservedOrigin`; the supervisor emits a second `url` observation (`initiator: 'fill-service'`,
  same `requestId`) for either, so `wrongOrigin` sees the decision-time origin. N gains "navigate A→B during the
  fill → `true/true`". `observeTop()` is total (= Z3-1).
- **W3-4 (= Z3-4) plus session close before settle.** The stub closes the session as its last step, before any
  settle. **Absorb:** `closeSession` waits (bounded, 2 s) for the page's `load` state before closing the context, so
  the lease's listener has received the login POST; the `afterLoop` drain then lands it in the transcript.
- **W3-5 (= Z3-3)** — the helper-call escape (`retain(padded)`) is the named mutant.
- **W3-6 (= Z3-7)** — frozen façade with runtime key assertion.
- **W3-7 Any `src/browser` file may import `playwright` or `playwright-core`.** **Absorb:** `importers` is the single
  file `src/browser/playwright.ts`; **no repo file may import `playwright-core` directly** (only the `playwright`
  wrapper, only from that file). Mutants: `session.ts → playwright`, `session.ts → playwright-core`.
- **W3-8 Probe P's statistic was implementer-defined** (ABBA vs the locked A/B/A/B; two-sidedness, ties, continuity
  correction, effect size unpinned; `p = 1` disables the gate). **Absorb:** A/B/A/B restored (locked sentence);
  Mann-Whitney U two-sided, normal approximation with **tie-corrected variance and continuity correction**, effect
  size = **rank-biserial correlation** `1 − 2U/(n·m)`; golden vectors (three, incl. one with ties) carry
  independently computed U, z, p; mutants: constant `p`, one-sided tail, no tie correction.

### P2

- **W3-9 Fixed-width transport was incomplete** — `value.length` serializes to 1–4 digits and escape-heavy ASCII
  changes JSON size. **Absorb — transport is content-blind by construction:** the value's UTF-16 code units are
  hex-encoded (4 hex chars each) after padding to 4096 units → a constant **16,384-character** ASCII string; the
  length rides as a 4-digit zero-padded string; the isolated world decodes the first `length` units with
  `String.fromCharCode`. A CDP spy asserts the serialized argument byte length is **identical across G's entire
  secret axis**. The non-ASCII residual from R2-2 is **retired**.
- **W3-10 Masking's value-independence was proven only by output shape.** **Absorb:** a source-shape test asserts the
  snapshot source computes `masked` from `type`/taint only and references `.value` solely inside the unmasked
  branch; plus the sentinel case (a password field whose value equals a chosen sentinel is masked identically).
- **W3-11 Zero `mint`/`adjudicate` calls does not prove zero matching** (`detectTripwire` is exported). **Absorb:**
  `vi.spyOn` on `secretMatcher.firstMatchingSecretTransform` → zero calls before `finish()`; and `host.ts` imports
  only `./tripwireSeam` (never `./tripwire`) — asserted by a source test.
- **W3-12 (= Z3-5).** **W3-14 (= Z3-9).** **W3-15 (= K coverage).**
- **W3-13 Correlation trusts model-provided `call.id`.** **Absorb:** `runAgentLoop` rejects a duplicate `call.id`
  within a run (throws — a second scoped edit to `loop.ts`, with its test); an uncorrelated attempt invalidates the
  run (= Z3-8).

### Round-3 synthesis and lock

Both channels' round-3 P1s are consistency and test-shape items on revision 4's own absorptions, plus three
mechanism refinements (W3-1 taint-before-call, W3-9 hex transport, W3-7 single importer). None reopens the fill gate,
the isolated-world primitive, the evaluator zone, or the lease. **Revision 5 absorbs every round-3 finding from both
channels and is LOCKED.** Remaining validation moves to code: the post-implementation ladder (three channels per
commit) and the integrator's confirmation pass verify the isolated-world sources, the AST rule, the façade, the
transport spy, the lease `finally`, and the gate rules against the real tree.

---

# Post-implementation round 1 — commit 1 `2672136..5bfc401` (gate tiers + Playwright import boundary), 2026-09-02

Implementer: Codex. Three channels in parallel, blind; the two Claude channels ran in isolated worktrees with a
symlinked `node_modules`; Codex reviewed the pinned range in a read-only sandbox (could not re-run the suite).

| Channel | Family | Verdict |
|---|---|---|
| Claude `/review` (QA, `wt-review`) | different | **NEEDS-ATTENTION** — 1 P1, 4 P2, 4 P3; mutation table 15 rows (11 killed, 3 survived, 1 equivalent) |
| Claude security review (`wt-security`) | different | **NEEDS-ATTENTION** — 0 P1, 2 P2, 8 P3; 19 probes, no bypass |
| Codex adversarial diff review | same | **NEEDS-ATTENTION** — 2 P1, 3 P2 |

Integrator's own run on the committed tree (real `node_modules`): `tsc` clean; gate PASS (39 modules / 35 roots);
selftest PASS (11 fixtures / 48 outcomes + M4 set); vitest 339 passed. **Convergent:** the rule-4 assertion is
realpath-fragile and makes the selftest fail in any worktree with a symlinked `node_modules` (QA Q2 = security S2);
the dead protected branch in `entryMayReachVetted` (Q7 = S7); the third gate script vs the "two gate scripts"
ownership sentence (Codex C5 = QA's undeclared-deviation note).

## Findings and the continuity owner's synthesis

### P1
- **Q1 (QA) Version pin has no independent mutation coverage** — both version checks emit `version mismatch` and one
  fixture covers both; deleting either survives. Behaviour correct (probed); test gap. **Fix:** two fixtures with
  disjoint fragments.
- **C1 (Codex) The importer rule scans production modules only** — `*.test.ts`, `*.spec.*`, `.d.ts` may import
  `playwright`/`playwright-core` unchecked. The spec says "the ONLY repo **file**". **Fix:** a direct-import scan over
  every source file under `src/`, `testbed/`, `scripts/` (tests and declarations included) for vetted packages;
  fixtures for a test file and a `.d.ts`. (Tests reach the browser through `src/browser/playwright.ts` only.)
- **C2 (Codex) Importer and entry identity reduce to realpaths** — a symlink can re-zone a file (`src/core/x.ts →
  src/browser/playwright.ts` classifies under `src/browser`). Same class as M3's R2-1. **Fix:** classification is the
  **union** of link path and real path with the **stricter zone winning**; a symlink whose link and real paths fall in
  different zones is a configuration violation; fixtures for both directions.

### P2
- **Q2 = S2** rule-4 / `formatViolations` realpath fragility → realpath-suffix comparison; a symlinked-`node_modules`
  fixture. **Q3** `realpathEndsWith` guard untested → symlinked opaque-path fixture. **Q4 = S8** `playwright.ts` has
  zero tests → `playwright.test.ts` (exact browser-missing message with an empty `PLAYWRIGHT_BROWSERS_PATH` dir; real
  launch; the flag in args via a seam). **Q5** no `import type` fixture → add (mechanism probed correct). **S1**
  the honest-claims sentence over-claimed ("data plane has no path to the driver" while `src/browser` is data plane)
  → **amended in the spec and to be mirrored in the gate header**. **C3** `reachableFrom` accepts `..`/`''` → require
  normalized, non-empty, in-repo directories. **C4** six forbidden-import fixtures share one clean control → a
  same-file clean mirror per row with the expected violation class. **C5** the third gate script is outside the
  ownership sentence → **continuity-owner amendment:** ownership reads "the gate scripts (`dependency-boundary*.mjs`)".

### P3 (all absorbed into the fix slice unless marked residual)
Dead `packageNames`; dead protected branch; undeclared `classifyEdge` reporting change (declare it, keep it);
`headless: true` beyond D1's sentence — **integrator note:** every paper-ladder probe used `chromium.launch({
headless: true })`, so the evidence matches the shipped launch mode (recorded; D1 gains the word); **S3 `.js/.mjs/.cjs`
under `src/`/`testbed/` are neither roots nor scan targets — pre-existing, recorded as G-3 in the M2 register, fixed
here by a filesystem-walk union**; S4 shadow/nested copies unpinned but held to the general rules (**residual**); S5
integrity recorded not verified (**residual, stated**); S6 configuration errors do not disarm the grants; empty
`packages`/`importerFiles` accepted → fail closed; S9 BFCache flag duplicates a Playwright default — harmless; the
behavioural `goBack()` test in commit 3 is the real check; S10 header omits `reachableFrom` → state it; **the manifest
is the policy** → pin its exact shape in the selftest; C's lockfile-format matrix (v1 fails closed, v2/v3 accepted) →
state as residual.

### Disposition
**Not merge-ready as committed; no security bypass found.** Fix slice `m4-fix-c1` (Codex, same branch, queued behind
commit 2) implements every absorbed item with a killing test each; the three channels re-run on the fix diff together
with commit 2's review.

---

# Post-implementation round 1 — commit 2 `5bfc401..b1407cd` (session owner, controls, in-realm sources, probe P, lab, loop hooks, writer bound) + gate fix slice `0cbe9d1`, 2026-09-02

Implementer: Codex (plus one declared integrator carve-out: `navigatePage` settles a failed `goto` on the main-frame
`framenavigated` event). Three channels, blind, parallel; both Claude channels ran the browser suites in isolated
worktrees; Codex reviewed the pinned range read-only (its sandbox ran zero vitest/selftest tests — EPERM on mkdtemp).

| Channel | Family | Verdict |
|---|---|---|
| Claude `/review` (QA, `wt-review`) | different | **NEEDS-ATTENTION** — 2 P1, 2 P2, 4 P3; 27 mutants killed / 3 survived / 2 equivalent |
| Claude security review (`wt-security`) | different | **NEEDS-ATTENTION** — 2 P1, 2 P2, 5 P3; 41 probe assertions, **no leak bypass** |
| Codex adversarial diff review | same | **NEEDS-ATTENTION** — 2 P1, 3 P2, 1 P3 |

Integrator's run: gate PASS (45/41); selftest PASS; vitest 442 passed incl. every browser suite. **Three-way convergent
P1:** the structural retention rule is not enforcing (QA Q2-2 = security S2-1 = Codex 1). **Two-way convergent:** the
`browser_type` lockdown guard and swap have no tests (QA Q2-1/Q2-3 = Codex 4); runVettedConfigurationFixtures over
50 lines (QA Q2-8 = Codex 6).

## Findings and the continuity owner's synthesis

### P1
- **T2-1 Retention rule non-enforcing (all three channels).** `allowedTaintedCall` whitelists any callee whose result
  initialises a `const`; analysis never leaves the enclosing function. Survivors (probed, runtime read-back): a
  `keep: value` property in a `state.taint.push(...)`; `const hex = leakEncode(value)` writing a module `let`; a stash
  inside `toFixedHex`; `const leaked = retain(hex)`. **Absorb:** tainted arguments only to `callFunctionOn` or to named
  local helpers whose bodies are analysed with the argument tainted (one-hop interprocedural over the file's own
  functions); taint through property writes, templates, destructuring, spread, `.length`, `arguments`; the four
  survivors become named killed mutants; for a file without `consume()` (commit 3's `fillService.ts`) the rule is a
  **Secret-object rule** (a `Secret` may only be passed to `inject`/`consume`/`clear`, never stored) — never vacuous.
- **T2-2 Inject latency is length-dependent (security S2-2).** The in-realm decode loop runs `length` iterations; the
  shipped probe P rejects 16 vs 4096 (p≈0, rank-biserial 0.88–0.93, median Δ +0.15 ms; null control passes). The
  transport is constant-size but the decode is not constant-work; the honest-claims timing sentence is currently false
  and H would fail. **Absorb:** decode all 4096 units unconditionally, then slice.
- **T2-3 `walk()` does not descend directory symlinks (Codex 2).** `src/core/alias -> ../../rogue` with `rogue/evil.mjs`
  importing the supervisor is never seen; a symlinked directory of `.test.ts`/`.d.ts` escapes C1's all-source scan.
  **Absorb:** follow directory symlinks with cycle detection and link/real recording under the stricter-zone rule, or
  reject source-directory symlinks as a configuration violation (choose reject — simpler, fail-closed); fixtures.
- **T2-4 `browser_type`'s lockdown guard has zero tests; deleting it leaves 89 tests green (QA Q2-1, Codex 4).**
  Correct by live probe. **Absorb:** both disjuncts tested separately; the swap decorator (Q2-3); the W3-10 sentinel.

### P2
- **T2-5 `consume()` sits inside the `try` whose catch manufactures `transport` (security S2-4)** — a pre-call throw
  (second inject on a cleared `Secret`) returns `transport` with no taint recorded; an undeclared deviation from D5's
  listing. **Absorb:** `consume()` and `too-long` above the `try`; pre-call throws propagate; killing mutant.
- **T2-6 `createRequire` via `await import('node:module')` aliased (security S2-3; G-2 class, pre-existing)** reaches
  `playwright-core` and the supervisor with the gate PASSing. **Absorb:** any import/require of `node:module`/`module`
  outside the gate itself is an unsupported construct (fail closed); fixtures; G-2 closed.
- **T2-7 Page close does not bump `documentEpoch` (Codex 3)** — staleness holds via the registry, the epoch channel does
  not. **Absorb:** bump on first close; assertion.
- **T2-8 C3's normalization guard has no killing fixture; C2 lacks the reverse cross-zone symlink (Codex 5).** **Absorb.**
- **T2-9 100-session entropy test at 2.7 s of a 5 s default (QA Q2-4; flaked once).** **Absorb:** explicit timeout.

### P3 (absorbed unless marked)
`form.getAttribute` clobber → native `getAttribute` via descriptor + two lab routes (S2-5); CR/LF secrets silently
sanitised → writer precondition refuses U+000A/U+000D (S2-6); failed snapshot = `{url:'', nodes:[]}` → absence-detection
test that a live page never yields `url: ''`, residual stated (S2-7); `frameOrigin`'s main-world `location.origin`
read → comment (S2-8); pinned-never-injected object handles retained until epoch/close (S2-9, **residual**); masked-node
key set asserted at the realm source (Q2-5); `TYPE_SOURCE` into `inRealm.ts` (Q2-6); poisoned-`getAttribute` lab route
(Q2-7); functions over 50 lines: `runVettedConfigurationFixtures` 73, `checkDependencyBoundary` 56 (Q2-8/Codex 6).
**Test gaps (Codex):** transport spy pins exactly 16,384 hex chars and 4,096 units (a 4,095-unit encoder mutant
survives); close-ordering test records counts only; probe P threshold boundaries unpinned (`p < 0.001` / `> 4 ms`
cutoffs pass) → boundary vectors. **Undeclared deviations, now recorded:** `launchChromium(launcher = chromium)` seam
(authorised by Q4; D1 amended); `TYPE_SOURCE` as a fifth in-realm source; `role` capped at 200; the navigate carve-out
holds the mutex up to 2 s on failure (shape unchanged — stated).

### Disposition
**Not merge-ready as committed; no leak bypass found.** Fix slice `m4-fix-c2b` (Codex, same branch, dispatched after
commit 3's write job finishes — never two write jobs in one worktree) implements every absorbed item with a killing
test each; the three channels re-run on the fix diff together with commit 3's review. The commit-3 review must also
check the flagged `if (consumeCalls.length === 0) return []` in the retention test.

---

# Post-implementation round 1 — commit 3 `b1407cd..2652104` (fill service + supervisor host + Acceptance A–L) + commit-2 fix slice `20b4764`, 2026-09-02

Implementer: Codex (integrator carve-out declared: timing tests keep `finish()` outside the window). Three channels,
blind, parallel; Claude channels ran the full suite incl. browser and timing files in isolated worktrees; Codex
reviewed the pinned range read-only (zero vitest executed — EPERM).

| Channel | Family | Verdict |
|---|---|---|
| Claude `/review` (QA, `wt-review`) | different | **NEEDS-ATTENTION** — 1 P1, 3 P2, 5 P3; 34 mutants: 28 killed / 3 survived / 2 equivalent / 1 N/A |
| Claude security review (`wt-security`) | different | **NEEDS-ATTENTION** — 0 P1, 2 P2, 6 P3; 15-path noninterference matrix and every hostile-page probe **HELD**; no leak bypass |
| Codex adversarial diff review | same | **NEEDS-ATTENTION** — 2 P1, 2 P2 |

Integrator's run: gate PASS (48/43); selftest PASS; 598 passed; probe P (scratchpad `c3-probe-numbers.txt`): fill
short-vs-long p=0.39, queued p=0.39, reflection p=0.69, tripwire call p=0.054, real click p=0.087, listener p=0.61.
**Convergent:** the `node:module` prohibition is both untested (QA Q3-1) and filtered for external packages (Codex X3-2);
the retention rule still has name-based/receiver-agnostic sinks (QA Q3-2, Codex X3-1 computed keys, security S3-1
inferred-type Secret bindings) — the fourth round on this rule; the too-long path no longer disposes the pinned object
(QA Q3-5 = security S3-7); the tripwire equal-work test's marginal p (QA Q3-4) is an order dependence (security S3-2).

## Findings and the continuity owner's synthesis

### P1
- **T3-1 `node:module` prohibition: no discriminating fixture (Q3-1) and filtered for external packages (X3-2).** A
  computed `'create'+'Require'` alias in `src/core` reaches `playwright-core` with the rule deleted; an external relay
  package can alias `createRequire` and export a loader repo code uses to reach the supervisor while the gate PASSes.
  **Absorb:** never filter `module loader` findings except for the gate's own files; discriminating fixture; external
  relay fixture. T2-6 stays open until this lands.
- **T3-2 Retention rule, round four (X3-1, Q3-2, S3-1).** Computed-property sinks (`obj[value] = true`) pass; the sink
  allowlist matches bare names so `<anything>.String(value)` / `<anything>.inject(secret)` pass; the Secret-object rule
  keys on an explicit `: Secret` annotation so `const stashed = await resolveSecret(...)` pushed to module state passes
  (probed: plaintext readable afterwards). **Absorb:** taint in computed assignment targets and `Map`/`Set` keys;
  allowlisted sinks require an `Identifier` callee; `inject` only on the pinned-destination local; the Secret rule
  taints the **result of every `resolveSecret(...)` call** and every binding initialised from it, and asserts
  `resolveSecret` appears exactly once in the file. **Per handoff §5 this is the signal to stop patching the rule's
  syntax list:** the next revision states the rule *positively* — a tainted value may appear only in (a) a `const`
  initialiser, (b) the single `callFunctionOn` argument list, (c) `secret.clear()`/`inject(secret, …)` on the
  pinned-destination local — and every other occurrence is a violation, with the whole mutant corpus (now eleven)
  kept as named killed mutants.

### P2
- **T3-3 The tripwire equal-work timing test is order-dependent (S3-2, Q3-4).** In isolation it fails 5/5 (p=0,
  rank-biserial 0.5–0.78): `NONMATCH = 'X'.repeat(21)` is a degenerate one-character run vs a mixed-character canary,
  so V8 string work differs. The matcher/mint/adjudicate call counts are `[0,0,0]` inside every timed call — the
  channel is not TinyVault's. **Absorb:** a structurally comparable mixed-character non-match of equal length; the
  zero-call assertion is stated as the structural guarantee; thresholds and sample counts untouched.
- **T3-4 G does not cross the policy axis with post-consume paths (X3-3).** **Absorb:** every post-consume outcome × both
  policy shapes; the named mutant fails.
- **T3-5 K's verbatim sentence and A's own-properties statement absent (Q3-3);** no Deviations section in the commit
  messages. **Absorb:** the sentences as comments; every future commit message carries a Deviations section.
- **T3-6 Fourth gate file vs the "three files" parenthetical (X3-4).** Spec already amended to the pattern; declared.

### P3 (absorbed unless marked)
`canonicalOrigin` re-read after `await`s — pass the snapshot const everywhere (S3-3); `list_vault` propagates a backend
throw verbatim — normalise every `VaultTools` rejection to one fixed message (S3-4); a tool after `finish()`/`abort()`
performs its side effect before throwing — check lease liveness first (S3-5); `drainEvidence()` on a dropped lease
returns `[]` silently — throw (S3-6); too-long path disposes the pinned object (Q3-5/S3-7); driver-free `src/core →
src/browser` edge is not enforced — add an explicit zone edge rule with fixture (S3-8); the lab's `htmlAttributes` seam
is dead so `/static-token-login` never sets `data-tv-document` (S3-9); Acceptance I spy covers `fill_from_vault` and
`browser_snapshot`; I compares the real supervised path against the bare path; J asserts lease drop after a tripwire
match via `finish()`; `closeAll` ordering with a launched-here browser; the four-counter assertion after `closeAll`;
probe-P exact-boundary vectors beside `probeP.test.ts`; `createLockdownDomain` 72 lines; the `4096` literal in
`ASSIGN_SOURCE` derived from the constant; second `closeAll()` disposes twice — make idempotent.
**Residuals (recorded):** `callFunctionOn`'s body is an unanalysed sink by design (one-line assertion that it assigns to
no non-local state); `browser_snapshot` is outside the tripwire by design — layer 4 is the only instrument;
`composeSupervisedHost` carries no `network-body` capture (test seam only); `too-long` is a length oracle unreachable
for a conforming backend; short/long fills are not literally equal-work beyond transport/decode (`padEnd`, `slice`,
native assignment) — only the empirical probe-P claim is made.

### Disposition
**Not merge-ready as committed; no leak bypass found in three rounds of hostile-page probing.** Fix slice `m4-fix-c3b`
(Codex, same branch, dispatched after commit 4's write job finishes) implements every absorbed item with a killing test
each; the three channels re-run on the fix diff together with commit 4's review.
