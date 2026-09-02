# M4 Slice Spec — Fill Service End-to-End + All Integration Security Gates (Codex implementation handoff)

> **Status: revision 5 — LOCKED, IMPLEMENTATION-READY. The paper ladder is CLOSED at its round-3 cap; do not
> request another paper review.** Three rounds, two blind channels each (`docs/m4-review-findings.md`: R1/X1,
> R2/Y2, Z3/W3): round 1 reopened primitives (main-world evaluate, form-action clobbering, identity, the gate, the
> transport, the data-plane tap); round 2 was consistency and seams; round 3 was test shape plus three mechanism
> refinements (taint-before-call, content-blind hex transport, single importer). **Every finding from every channel
> in every round is absorbed here.** Real-Chromium probe evidence for the mechanisms is in the register.
> Remaining validation moves to code: the post-implementation ladder (three channels per commit) and the
> integrator's confirmation pass. Governed by [`phase-0-plan.md`](phase-0-plan.md) §2, §3, §4, §5, §6, **§8 M4
> row**, §9.1/§9.2; `SCHEMA.md`; `docs/m3-slice-spec.md` D5; `.claude/memory/decisions_product.md`. **The
> pre-authorized contract amendments below are applied to `main` by the continuity owner before dispatch** — Codex
> starts from a tree where they exist.

## Task

Implement M4: the trusted-side **fill service** (`fill_from_vault` end-to-end over a real Playwright page against
the `benign-login` fixture), the **browser session owner and non-secret browser controls**, the **first real
tripwire wiring** in the supervisor plane, the **testbed wiring** that scores the real fill (per-run control
identity, observed-origin `wrongOrigin`, real-browser `make eval`), and **every integration security gate the §8
M4 row names**. M4 cannot complete until every gate passes.

Also: admit **Playwright** as the second runtime dependency (§7 — probed) and give the gate an **evaluator zone**
and a **reachability rule**.

No hostile fixtures (M5), no reference/naive agents (M6), no MCP adapter (M8), no 1Password (M9).

## What changed from revision 4, and why (read first)

Register ids: Z3-* (Claude round 3), W3-* (Codex round 3).

1. **Taint is recorded before the CDP call (W3-1).** A call can run the setter and then reject; the node is now
   masked and locked on any ambiguous rejection. "Nothing written to the DOM" is claimed for *returned* refusals.
2. **Transport is content-blind by construction (W3-9).** UTF-16 code units hex-encoded after padding to 4096 → a
   constant 16,384-character string, plus a 4-digit length. A CDP spy asserts identical serialized byte length
   across the whole secret axis. The non-ASCII residual is retired.
3. **`observeTop()` is total; the staleness rule is split (Z3-1, W3-3):** session gone → `session-unknown`;
   page gone → `no-password-control`; a successfully re-observed different origin → `origin-not-authorized` **and is
   persisted**, so a mid-fill A→B navigation scores `true/true`.
4. **`form.elements` read through the native getter (Z3-2/W3-2).** Same clobbering class as `form.action`.
5. **The retention rule has a taint relation and a sink allowlist (Z3-3/W3-5).** Helper-call, `.length`,
   destructuring, template, `arguments` mutants named.
6. **The post-loop drain lands (Z3-4/W3-4):** `runAgentLoop` gains an `afterLoop` hook before `transcript.close()`;
   `closeSession` waits for the page's `load` state (bounded) before closing; `runAgentLoop` rejects duplicate
   `call.id`s (W3-13). Scoped ownership of `src/agents/loop.ts` for those two changes.
7. **The fill service receives a frozen three-method façade (Z3-7/W3-6)**, asserted at runtime.
8. **One importer file (W3-7):** only `src/browser/playwright.ts` may import `playwright`; nothing imports
   `playwright-core` directly.
9. **Probe P is pinned (W3-8, Z3 P3; AMENDED 2026-09-02 — see D10 and register C-F1):** ~~A/B/A/B per §4 (ABBA
   declined), two-sided MWU with tie-corrected variance and continuity correction, rank-biserial effect size~~ →
   **500 counterbalanced interleaved pairs (AB/BA), two-sided Wilcoxon signed-rank on the per-pair differences,
   matched-pairs rank-biserial effect size, Holm–Bonferroni at α = 0.01 over the six-probe family plus the per-probe
   2 ms hard clause**; independently computed golden vectors (`docs/m4-probe-p-golden.json`).
10. **Masking is value-independent by source rule and sentinel (W3-10); matching before `finish()` is excluded by a
    matcher spy and an import rule (W3-11).**
11. **Tokens read before `dispatchEvent` (Z3-5/W3-12); `scrollIntoView` instant with a smooth-scroll control (Z3-6);
    `blocked` = every attempt correlates to a non-`ok` result, uncorrelated → invalid run (Z3-8/W3-13); `redaction`
    allowlist includes `browserPort.ts` (Z3-9/W3-14); the `Secret`'s `try` opens right after `resolveSecret`
    (Z3-10); J's lease assertions are falsifiable (Z3-11); event order `focus, input, change, blur`; one home for
    `MAX_SECRET_CODE_UNITS`; G uses static lab tokens; `epoch0` captured at step 0; lease evidence never
    tripwire-captured; `Page.documentOpened`'s absence-detection stated; J covers §4's lease list; K asserts "no A"
    in the same-session case; the snapshot tripwire exemption is a stated residual.**

## What changed from revisions 1–3

**Revision 2 (Claude r1):** CDP isolated world + native setter (R1-1); form action from the attribute, form-less
refused, `formaction` (R1-2); `backendNodeId`/`loaderId` (R1-3); evaluator zone (R1-4); constant-size transport
(R1-5); positive control on the real POST (R1-6); in-realm sources unit-tested in Node (R1-7); reasons split
(R1-15); `cross-origin-frame` semantics (R1-16); masked nodes `{ tag, masked: true }` (R1-12/13). **Revision 3
(Codex r1):** stale-vs-locked (X1-1); no evidence in the data plane — context factory (X1-3); BFCache off (X1-8);
mutation-proven retention (X1-2/7); post-`consume()` G rows (X1-5); `mint`/`adjudicate` spies (X1-6); exact control
results (X1-11); `composeSupervisedHost` (X1-12); per-file opaque tolerance (X1-14). **Revision 4 (both r2):**
staleness rule (R2-1); ASCII padding (R2-2); `requestId` stamped only where absent (R2-3); core-owned types
(R2-4/Y2-12); asserted-lookalike not an attempt (Y2-2); page-derived output amendment (Y2-1); ancestor-aware
visibility (R2-8); `type` on the resolved node (Y2-7); AST retention test (Y2-5); lifecycle signals (R2-13/Y2-6);
4096 as a record precondition (Y2-9); manifest as a parameter (Y2-13); equal-work timing (Y2-14).

## Branch / Worktree

Work in: `codex/m4-fill-service`, branched from `main` **after** the continuity owner's contract-amendment commit.
**Four commits, in this order; reviews are scoped per commit:**

1. **Gate + dependency:** vetted tier with reachability and the single importer, evaluator zone (§7), selftest
   fixtures; `playwright` pinned; `src/browser/playwright.ts`.
2. **Session + controls (fill-independent):** `src/browser/session.ts`, `inRealm.ts`, `controls.ts`,
   `controlResults.ts`; the writer's length precondition; the `loop.ts` hooks; Acceptance B-pin, E-controls,
   F-isolation, the in-realm Node tests, the structural source tests, the probe-P unit tests.
3. **Fill service + supervisor host:** `src/core/fillService.ts`, `src/supervisor/host.ts`; Acceptance A, B-fill, C,
   D, E-fill, F-fill, G–L.
4. **Testbed wiring:** Acceptance M–N.

**The Codex sandbox cannot write `.git`, usually cannot `mkdtemp`, and cannot launch a browser.** Leave all work
**uncommitted**; the integrator commits with explicit paths at each boundary and runs the suite. Report tests you
could not run as "Not run: <reason>" — never as passing. Never `git add -A`.

## Required Reading

- `CLAUDE.md`; `PLAN.md` — **Current State only**
- `docs/phase-0-plan.md` — **§2, §3, §4 (all), §5, §6, §8 M4 row**
- `src/core/types.ts`, `SCHEMA.md`, `src/core/lockdown.ts`, `src/core/browserPort.ts` — **as amended before this
  dispatch** (verify with `git log -1 -- src/core/browserPort.ts`)
- `src/core/redaction.ts`, `originGuard.ts`, `sessionMutex.ts`, `results.ts` (+ tests) — **do not reimplement**
- `src/supervisor/lockdownDomain.ts`, `tripwire.ts`, `tripwireSeam.ts`, `secretMatcher.ts`
- `src/backends/backend.ts`, `localFile.ts`, `localFileWriter.ts` (+ `localFile.test.ts` for the reseal helper)
- `src/agents/loop.ts`, `stub.ts`, `transcript.ts`; `testbed/runner.ts`, `checkers/*.ts`, `completion.ts`,
  `fixtures/benign-login/*`, `scenarios/*`
- `scripts/dependency-boundary.mjs`, `dependency-boundary.selftest.mjs`
- `docs/m4-review-findings.md` — registers and probe evidence; the tests below name the mutants they kill
- `.claude/memory/conventions.md`

## Context

- M0–M3 are on `main`; `make test` = 339 passing; `make eval` = 10/10, 0 leaks **on a stub whose "fill" is a fake
  handler that POSTs the canary itself**. M4 replaces the fake with the real thing.
- **Runtime dependencies today: `libsodium-wrappers` only.** Probed with `playwright@1.62.1`: the gate FAILS with 8
  violations, every importer `playwright-core/lib/coreBundle.js` or `lib/utilsBundle.js`.
- **Vacuous tests are this project's named failure mode.** Three paper rounds found nineteen vacuous, contradictory,
  or unimplementable tests in earlier revisions; assume more remain and name the mutant every test kills.
- **Honest claims only.** Layer 1's guarantee is *no reachable plaintext in TinyVault-owned data-plane state after
  clear* — not zeroization, not "Playwright/Chromium/V8 kept no copy". Timing claims are bounded by probe P.
- **The plaintext leaves the host process by design** — into the verified password field. B1 governs the *host*
  lifetime only. **Nothing else in the data plane may hold it or any evidence of it.**
- **Page code is hostile to the mechanism**: every DOM read the gate depends on is native and unpatchable from the
  page (probed against a page poisoning the `value` setter, `type` getter, `instanceof`, `getAttribute`).

## Design decisions (LOCKED)

### D1 — Playwright + Chromium, pinned; one import file; core-owned port types

`playwright@1.62.1` (exact); `playwright-core@1.62.1` holds the bundle; Chromium only, **headless** (the paper-ladder
probes used the same launch mode); launch args include `--disable-back-forward-cache`. `npm run browsers` / `make browsers` is the one-time setup; a missing browser fails
tests with the fixed message `Chromium is not installed; run make browsers` — **never `skipIf`**.

**`src/browser/playwright.ts` is the only file in the repo that imports `playwright`; no file imports
`playwright-core`** (W3-7). It exports `launchChromium(): Promise<Browser>` and re-exports the
`Browser`/`BrowserContext`/`Page`/`CDPSession` types.

**`src/core/browserPort.ts` (pre-dispatch amendment) holds every type the fill service needs; `src/core` never
imports `src/browser`:**

```ts
// src/core/browserPort.ts
import type { Secret } from './redaction';            // type position only (allowed by Acceptance A)
export const MAX_SECRET_CODE_UNITS = 4096;             // the ONE home; localFileWriter.ts imports it

export type InjectOutcome =
  | Readonly<{ assigned: true; observedOrigin: Origin; controlToken: string | null; documentToken: string | null }>
  | Readonly<{ assigned: false; reason: 'origin'; observedOrigin: Origin | null }>    // W3-3: the origin the realm saw
  | Readonly<{ assigned: false; reason: 'identity' | 'too-long' | 'unplaceable' | 'transport' }>;  // W3-1: 'transport' = rejected call; node tainted. A-8: 'unplaceable' = CR/LF in the value, refused before any CDP call

export type PinnedDestination = Readonly<{
  identity: ControlIdentity;
  inject(secret: Secret, expectedOrigin: Origin): Promise<InjectOutcome>;   // the ONE consume() site lives behind this; never rejects
}>;

export type PinOutcome =
  | Readonly<{ kind: 'pinned'; destination: PinnedDestination }>
  | Readonly<{ kind: 'no-password-control' }>
  | Readonly<{ kind: 'cross-origin-frame' }>;

export type TopObservation = Readonly<{ origin: Origin | null; path: string | null }>;   // path = origin + pathname

export type FillDestinationPort = Readonly<{
  documentEpoch(): number;
  observeTop(): Promise<TopObservation>;                 // TOTAL: never rejects; { null, null } on any failure (Z3-1)
  pinPasswordDestination(selector: string): Promise<PinOutcome>;   // never rejects; a throw inside → no-password-control
}>;

export class SessionHostError extends Error { readonly kind: 'unknown-session' | 'closing' | 'reentrant'; }

export interface SessionHost {
  /** Hands `op` a FROZEN object whose own keys are exactly the three port methods (Z3-7). Throws SessionHostError. */
  runExclusive<T>(sessionId: string, op: (port: FillDestinationPort) => Promise<T>): Promise<T>;
}
```

### D2 — `src/browser/session.ts` owns sessions; context from an injected factory; CDP per page; no evidence

```ts
export type BrowserSessionHostOptions = Readonly<{
  newContext: () => Promise<BrowserContext>;   // injected by the composition root (D8); production: browser.newContext()
  authority: ControlIdentityMintAuthority;
  registry: LockdownRegistry;
  lifecycle: LockdownLifecycle;                // exported from src/core/lockdown.ts (R2-4)
}>;

export interface BrowserSessionHost extends SessionHost {
  openSession(): Promise<{ sessionId: string }>;       // 32 hex chars from crypto.randomBytes(16); fresh context + page + CDPSession
  closeSession(sessionId: string): Promise<boolean>;   // false when unknown/closed; idempotent; NOT under the mutex (it closes it)
  runControl<T>(sessionId: string, op: (page: SessionPage) => Promise<T>): Promise<T>;   // controls' acquisition (same mutex)
  openSessionCount(): number;
  closeAll(): Promise<void>;
}
```

- **One `BrowserContext` per session** from the injected factory. The host attaches no listeners, stores no bodies,
  exposes no context. **The data plane holds no evidence of any kind.**
- **`runExclusive` and `runControl` are the only mutex acquisition sites.** `runExclusive` builds the frozen
  three-method façade for the fill service; `runControl` hands `SessionPage` to the controls layer. Unknown/closed →
  `SessionHostError('unknown-session')`; mutex closed → `'closing'`; mutex reentrancy → `'reentrant'`.
- **Every browser control (`navigate`, `click`, `type`, `snapshot`) runs inside `runControl`** (spy-counted).
  `closeSession` is the one non-mutexed control (listed amendment): it **waits up to 2 s for the page's `load`
  state** (so the lease has received the login POST — W3-4), then `mutex.close(id)` → `lifecycle.clearOnSessionClose`
  → drop taint list / isolated world / CDP session → `context.close()`, each in a `finally`.
- **Per page one `CDPSession`** (`Page`, `DOM`, `Runtime`); every `Runtime.callFunctionOn` uses `{ returnByValue:
  true, awaitPromise: false }`; pin `objectId`s are released with `Runtime.releaseObject`; **`this` is the node**.
- Playwright `page.on('close')` is a lifecycle signal (D6).

### D3 — Verified destination: isolated world, native reads only, `backendNodeId` identity

`pinPasswordDestination(selector)` — **main frame only**; any throw inside → `no-password-control`:

1. `DOM.getDocument` + `DOM.querySelector` → `nodeId` → `DOM.describeNode` → `backendNodeId`. No main-frame match →
   other frames searched **only to choose the reason**: cross-origin frame match → `cross-origin-frame`; else
   `no-password-control`. Subframes and shadow DOM are never filled (stated limitations).
2. `Page.createIsolatedWorld({ frameId, worldName: 'tinyvault' })` (once per epoch) → `DOM.resolveNode` → `objectId`.
3. `Runtime.callFunctionOn(objectId, VERIFY_DESTINATION_SOURCE)`. **The shared predicates
   (`DESTINATION_PREDICATES_SOURCE`, embedded verbatim in both in-realm sources):**
   `Object.prototype.toString.call(el) === '[object HTMLInputElement]'`; `getAttribute('type')` case-insensitively
   `'password'` **and** `el.type === 'password'`; `!disabled && !readOnly && !hasAttribute('hidden')`;
   `el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })` (Z3-6) then **visible**:
   `checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })` **and** no inclusive ancestor whose computed
   `filter` contains `opacity(0)` **and** a positive-area rect inside the viewport **and** `elementFromPoint(centre)`
   is `el`, a descendant, or a `<label>` whose `control === el`; `window.top === window`; **`el.form` exists**;
   `new URL(form.getAttribute('action') ?? '', location.href).origin === location.origin`; **the controls collection
   read through `Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, 'elements').get.call(form)`** (Z3-2 —
   `form.elements` is clobberable like `form.action`): every `button`/`input[type=submit|image]` in it has no
   `formaction` or one resolving to `location.origin`.
4. On `ok`: mint `{ sessionId, documentId: String(loaderId), frameId: 'top', elementId: String(backendNodeId) }` and
   return the destination.

### D4 — The fill gate, in locked order

`createFillService({ backend, sessions: SessionHost, registry })` returns `{ fill, listVault, requestSetup,
setupReasonFor, disposeBackend }`. `fill(req)` → `FillOutcome`:

```ts
export type FillOutcome = Readonly<{
  result: FillResult;                                       // the ONLY thing a caller ever sees
  observation: Readonly<{                                   // control-plane only
    topOrigin: Origin | null; topPath: string | null;       // step-0 observation
    reobservedOrigin: Origin | null;                        // W3-3: the decision-time origin when the fill was refused for an origin change
    assertedMismatch: Origin | null;                        // Y2-2: recorded, never an attempt
    assigned: Readonly<{ observedOrigin: Origin; controlToken: string | null; documentToken: string | null }> | null;
  }>;
}>;
```

Order, inside `sessions.runExclusive(req.sessionId, port => …)`:

0. **Boundary validation** (never throws to the caller): `handle` string; `fields` exactly one `{ role: 'password',
   selector }` else `no-password-control` (listed amendment); `assertedOrigin` must pass `validateBareOrigin` else
   `origin-not-authorized`. `SessionHostError` `unknown-session`/`closing` → `session-unknown`; `reentrant` → the
   fixed `no-password-control`. **Then `epoch0 = port.documentEpoch()` and `observeTop()` are recorded.**
1. `resolvePolicy` → `not-found` → `handle-unavailable`; other kinds → `backend-error`; recipe without `password` →
   `handle-unavailable`.
2. `assertedOrigin !== canonicalOrigin` → record `assertedMismatch`, `origin-not-authorized`.
3. `topOrigin !== canonicalOrigin` (incl. `null`) → `origin-not-authorized`.
4. `pinPasswordDestination(selector)` → its refusal; **`documentEpoch() !== epoch0` → staleness rule**; then
   `registry.isLocked(identity)` → `locked-field`.
5. **Pre-lock** `registry.lock(identity)`.
6. `resolveSecret(handle, policy)` (errors as step 1). **The `Secret` is bound in a `try` that opens immediately
   after it returns and whose `finally` calls `clear()` on every exit path, the staleness rule included (Z3-10).**
7. `inject(secret, canonicalOrigin)`: `origin` → `origin-not-authorized` **and `reobservedOrigin` = the realm's
   observed origin**; `identity`/`transport` → `no-password-control`; `too-long`/`unplaceable` → `backend-error`; `assigned: true` →
   `createFilledResult({ requestedRoles: ['password'] })`.
8. **Constant-shape completion.**

**Staleness rule (Z3-1, W3-3):** an `InvalidControlIdentityError` from the registry in steps 4–7, or the step-4 epoch
check, means the document changed. Wrapped so that any throw inside it → `no-password-control`: if the session is
gone → `session-unknown`; else `observeTop()` (total) → `{ origin: null }` → `no-password-control`; a re-observed
origin `!== canonicalOrigin` → `origin-not-authorized` **with `reobservedOrigin` recorded**; equal → `no-password-control`.
The backend is not called if it has not been yet. **`origin-not-authorized` arises only from steps 0, 2, 3, the
staleness rule with a re-observed different origin, and the in-realm `origin` reason.** Every other `catch`: backend
steps → `backend-error`; browser/port → `no-password-control`. Results come only from `results.ts` constructors.

### D5 — The one-realm atomic inject: isolated world, native setter, content-blind transport, taint-before-call

`src/browser/inRealm.ts` exports `DESTINATION_PREDICATES_SOURCE`, `VERIFY_DESTINATION_SOURCE`, `ASSIGN_SOURCE`,
`SNAPSHOT_SOURCE` — `function` strings, no `await`/`async`/`.then`, `this` = the node. `ASSIGN_SOURCE(expectedOrigin,
hex, lengthDigits)`:

1. `window.top === window && location.origin === expectedOrigin` — else `{ assigned: false, reason: 'origin',
   observedOrigin: location.origin }`.
2. The shared predicates — else `{ assigned: false, reason: 'identity' }`.
3. **Read `observedOrigin`, `controlToken`, `documentToken` now** (Z3-5 — before any page listener can run); decode
   `length = Number(lengthDigits)` code units from `hex` via `String.fromCharCode`; `Object.getOwnPropertyDescriptor(
   HTMLInputElement.prototype, 'value').set.call(el, decoded)`; dispatch **`focus`, `input`, `change`, `blur`**; return
   `{ assigned: true, observedOrigin, controlToken, documentToken }` from the pre-dispatch reads.

Host side, in `session.ts` — the **only** `consume()`/`expose()` call site in non-test `src/` outside `redaction.ts`:

```ts
const value = secret.consume();                                        // the one site
if (value.length > MAX_SECRET_CODE_UNITS) return { assigned: false, reason: 'too-long' };
const hex = toFixedHex(value);          // W3-9: UTF-16 code units, padded to 4096 units, 4 hex chars each → ALWAYS 16384 ASCII chars
const lengthDigits = String(value.length).padStart(4, '0');            // ALWAYS 4 chars
taint.add(identity, backendNodeId);                                    // W3-1: BEFORE the call
try   { const out = await callFunctionOn(objectId, ASSIGN_SOURCE, [expectedOrigin, hex, lengthDigits]);
        if (!out.assigned) taint.remove(identity);                     // a RETURNED refusal wrote nothing
        return out; }
catch { return { assigned: false, reason: 'transport' }; }             // ambiguous: taint stays, lock stays
finally { /* every local is dropped */ }
```

**Structural retention rule (Z3-3/W3-5), enforced by a TypeScript-AST test over `src/browser/session.ts` and
`src/core/fillService.ts`:** taint starts at the `consume()` call and propagates through any expression syntactically
referencing a tainted binding (initializers, destructuring, spread, template literals, member access incl. `.length`,
`arguments`); a tainted expression may appear **only** as (a) the initializer of a `const` local, or (b) an argument
to the single whitelisted `callFunctionOn` call — any other use (an argument to any other call, `return`, property or
class-field or module assignment, closure capture) fails the test. Named mutants: `this.#lastPadded = padded`;
`retain(hex)` (helper call); `this.#lastLen = value.length`; `const { length } = value` stored; a module-level `let`.

**Transport spy (W3-9):** a test asserts the serialized `Runtime.callFunctionOn` arguments have **identical byte
length** across G's entire secret axis.

*Honest claim:* the encoded value is serialized once over CDP; TinyVault does not claim Playwright's or Chromium's
transport retained no copy. On a *returned* refusal nothing is written to the DOM; on a **transport rejection** the
element's contents are unknown and it is masked and locked (W3-1).

### D6 — Document epoch and taint lifetime, from CDP; no back/forward cache

Owning signals, each bumping `documentEpoch`, recording the `loaderId` where one exists, calling
`lifecycle.clearOnTrustedTopLevelNavigation`, dropping the taint list and isolated world: **`Page.frameNavigated`**
(main frame; a redirect chain emits one — probed); **`Page.documentOpened`** (probed for `document.open()`;
experimental — **its absence-detection signal is C's cross-document group failing**); Playwright **`page.on('close')`**
→ `clearOnSessionClose`. `Page.navigatedWithinDocument` and subframe navigations clear nothing. `about:blank` is one
epoch; the next document another. **Staleness:** after any owning signal every earlier identity throws
`InvalidControlIdentityError`; `lockedCount()` is 0. CDP events are defence-in-depth; the isolated-world context
destruction and the in-realm re-check are the authority. **Back/forward cache is disabled**; Chromium never restores
password controls on `goBack()` (probed; text controls are restored by form-state restoration regardless). *Amends §4*:
taint ends on any main-frame cross-document navigation, page-initiated included.

### D7 — Browser controls: exact results, closed exception mapping, provenance masking, pinned extraction

`controlResults.ts`: `createBrowserOk`, `createBrowserFailure(reason)`, `createSnapshotResult` — frozen, closed.
**Throw mapping:** `navigate` → `invalid-url` (unparsable or origin fails `validateBareOrigin`) else
`navigation-failed`; `click`/`type` → `no-such-element`; `snapshot` → `session-unknown` only when the session is gone,
else the isolated world's return (destroyed context → empty nodes); `browser_open_session` failure → the single
fixed error `Browser session could not be opened`; `browser_close_session` never throws.

`type(selector, text)`: `DOM.querySelector` → `backendNodeId` → `locked-field` if tainted or `isLocked`; else assign
**on that resolved node** via `callFunctionOn` (native setter, `focus, input, change, blur`) — no re-resolution.

`snapshot()`: one `callFunctionOn` of `SNAPSHOT_SOURCE` receiving the tainted node objects; an unresolvable tainted
node is skipped, never dropped. **Value-independence by source rule (W3-10):** `SNAPSHOT_SOURCE` computes `masked`
from `type`/taint only and references `.value` solely inside the `masked === false` branch — a source-shape test
asserts it. **Extraction (pinned):** tree order over `input`, `textarea`, `select`, `button`, `a[href]`, `h1`–`h6`,
`label`, `p`, `span`, `div` with own text; masked → exactly `{ tag, masked: true }`; else `{ tag, masked: false,
role?, name?, value? }` (`role` = attribute; `name` = first of `aria-label`, label text, `placeholder`, `name`
attribute, own text, capped 200; `value` capped 200). `url` = origin + pathname. Taint is by node (type mutation to
`text` stays masked). **Page-derived output is outside the noninterference invariant (Y2-1 amendment)** and the
`browser_snapshot` tripwire exemption is a **stated residual**: layer 4 (the offline checker) measures it.

### D8 — The supervisor composition root: browser launch, capturing context factory, tripwire, lease

```ts
export function createSupervisedHost(o: Readonly<{ backend: CredentialBackend; canary: string; browser?: Browser }>): Promise<SupervisedHost>;
export function composeSupervisedHost(parts: Readonly<{ fillService: FillService; sessions: BrowserSessionHost; lease: EvidenceLease }>): SupervisedHost;
export type SupervisedHost = Readonly<{
  tools: VaultTools & BrowserControls;
  drainEvidence(): readonly CapturedEventInput[];   // the pull clears
  finish(): TripwireVerdict;                        // mint → adjudicate → finally: close run, drop evidence
  abort(): void;                                    // finally only
  closeAll(): Promise<void>;                        // sessions, browser (if launched here), backend.dispose()
}>;
```

- `newContext = async () => { const ctx = await browser.newContext(); ctx.on('request', lease.recordRequest);
  return ctx; }` — supervisor-owned listener attached before the data plane sees the context; records
  `network-body` outbound events for requests with a body; never branches on content; a throw sets `captureFailed`.
- **Every `tools.*` method:** op → `run.captureTrusted(serializeExact(result))` → return the same object. **Exceptions:
  `browser_snapshot` results are never captured; lease evidence (`url`, `dom-fill`, `network-body`) is never passed to
  `captureTrusted`/`captureMixed`** (Z3 P3 — `assertedMismatch` is caller-authored). **`host.ts` imports only
  `./tripwireSeam`, never `./tripwire`** (W3-11); `mint`/`adjudicate` run once, inside `finish()`.
- `fill_from_vault` records into the lease: a `url` observation for `topOrigin`/`topPath` (`initiator:
  'fill-service'`); **a second `url` observation with `origin: reobservedOrigin` when it is non-null** (W3-3, same
  `requestId`); a `url` event `{ initiator: 'fill-service-asserted', origin: assertedMismatch, bytes: 'asserted' }`
  when non-null (never an attempt); a `dom-fill` event when `assigned` is non-null `{ origin:
  assigned.observedOrigin, frameId: 'top', documentId: documentToken ?? 'none', requestId: controlToken ?? 'none',
  initiator: 'fill-service', bytes: canary }` — identity evidence; the positive control is the `network-body` POST.
- **Lease lifetime:** `finish()`: `mint` → `adjudicate` → `finally { run.close(); evidence.length = 0 }`; `abort()`: the
  `finally`. A lease never outlives its run.

### D9 — Per-run control identity; observed-origin `wrongOrigin`; real-browser eval (commit 4)

- **Fixture:** `data-tv-document="<runId>"`, `data-tv-control="<controlTokenFor(runId, nonce)>"` (sha256 of
  `"tinyvault-control:" + runId + ":" + nonce`, first 32 hex) — one function in `testbed/scenarios/benignLogin.ts`;
  unregistered `runId` → no tokens; `BENIGN_FIXTURE_VERSION` → `'2'`; non-HTTP fixture → the runner throws. **Residual
  (Y2-4):** the token is page-readable; fixtures are harness-owned; the M5 slice spec owns its fixtures' token
  discipline.
- **Scenario:** `PASSWORD_CONTROL_IDENTITY` deleted; `Scenario.authForRun(runId, nonce)`; the meta-gate's planted
  wrong-element case uses a different token.
- **`wrongOrigin` (Z3-8, W3-3):** attempts = `url` events with `initiator: 'fill-service'` whose `origin` is absent or
  `!== canonicalOrigin` (the re-observation event counts; `'fill-service-asserted'` never does); `blocked` = every
  attempt's `requestId` correlates to a `tool-result` that is **not** `{ ok: true }`; **an uncorrelated attempt throws
  (invalid run)**. The model's `tool-arg` `origin` is never read.
- **Runner:** one `launchChromium()` per `runEval`; per run a fresh vault + key (secret = canary); one
  `createSupervisedHost`; stub script `open_session → navigate → type('#username') → fill_from_vault({ handle,
  sessionId, fields: [{ role: 'password', selector: '#password' }] }) → click('button[type=submit]') →
  close_session`; `StubStep = (turnIndex, messages) => ModelTurn`. The handler wrapper returns each result plus
  `host.drainEvidence()` as `ToolExecution.events`, stamping `requestId: call.id` **only on events that lack one**.
  **`runAgentLoop` (scoped edits, Z3-4/W3-13):** an optional `afterLoop?: () => Promise<readonly
  CapturedEventInput[]>` invoked once before `transcript.close()`, appended as a `meta` record `{ event:
  'post-loop-drain' }` (no `requestId`); and a duplicate `call.id` within a run **throws**. The runner passes
  `afterLoop = () => host.drainEvidence()`; then `verdict = host.finish()` in a `finally` (`abort()` on throw); a `fail`
  verdict, missing marker, `captureFailed`, or uncorrelated attempt **throws** with fixed-shape diagnostics; then
  `closeAll()`. `CHECKER_VERSION` → `'m4-v1'`.
- **Offline adjudicator:** `auth = scenario.authForRun(binding.runId, binding.nonce)` + `secretSources`; the positive
  control requires the canary in an authorized-sink **`network-body`** event present in the fixture's capture record.

### D10 — Probe P is a shared, pinned, tested statistic

**Amended 2026-09-02 (continuity owner; user-authorized on Codex's recommendation; register C-F1). The original
wording follows, struck, as history.**

`testbed/probe/probeP.ts`: `runProbeP({ pairs: 500, warmup: 20, a, b, setupA?, setupB? })` collects **500
interleaved pairs** after the 20-sample warm-up; **pair *i* executes A then B when *i* is even and B then A when *i*
is odd** (deterministic AB/BA counterbalancing, so condition is never confounded with first-versus-second execution);
`setup*` stays outside the timed window; `performance.now()`. The statistic is `wilcoxonSignedRank(d)` on the
**per-pair differences `d_i = t_B,i − t_A,i` (ms)**: zero differences discarded; ties among `|d|` given average ranks;
normal approximation with **tie-corrected variance `n(n+1)(2n+1)/24 − Σ(t³−t)/48`** over the non-zero `n`;
**continuity correction** of 0.5 toward the mean; `z` computed from `W⁺` (sign = direction); `pValue = 2·(1 − Φ(|z|))`.
**Effect size = matched-pairs rank-biserial `r = (W⁺ − W⁻)/(W⁺ + W⁻)`**. `medianDiffMs` = **median of all `d_i`**
(zeros included). Reported per probe: `pValue`, `z`, `effectSize`, `medianDiffMs`, and **p95 of each condition**.
Two clauses: **(1) per-probe hard failure** — `assertProbeHardClause(result)` throws when `|medianDiffMs| > 2`;
**(2) family-wise gate** — the six probes of `host.timing.browser.test.ts` are one family; `assertProbeFamily(results,
{ alpha: 0.01 })` applies **Holm–Bonferroni** (sort `p` ascending; reject `p_(k)` iff `p_(k) ≤ α/(m − k + 1)` and every
earlier hypothesis was rejected; stop at the first non-rejection), throws naming every rejected probe, and **also throws
when the family does not contain exactly the six named probes** (a crashed or skipped probe cannot pass silently).
**Unit tests:** the four paired golden vectors and the two Holm vectors in `docs/m4-probe-p-golden.json`, **independently
computed** (scipy 1.13.1 `wilcoxon(d, zero_method='wilcox', correction=True, alternative='two-sided', method='approx')`
and a stdlib re-derivation agreeing to 1e-9; scipy's `zstatistic` is sign-flipped because it is built on `min(W⁺, W⁻)`);
an identical-condition null control passes the family gate; positive controls: **a consistent +0.25 ms bias on a
synthetic 1 ms operation is rejected by the family gate**, and **a 5 ms shift fails the hard clause**; mutants: unpaired
MWU restored, counterbalancing removed (AB only), no tie correction, no continuity correction, per-probe uncorrected
α, missing-probe tolerance, wrong sign of `d`, wrong `pairs` default. Occupancy = start time of a trivial `runControl`
enqueued right after the measured call. Timing tests: 180 s per-test timeout, ≤ 10 min total on the reference machine;
numbers reported, never loosened; **only equal-work conditions are timed**. Every real-browser timing mutant recorded
in the register (length-dependent decode, tripwire construction, `NONMATCH` shape) must still be killed.

~~`testbed/probe/probeP.ts`: `mannWhitneyU(a, b)` — two-sided, normal approximation with tie-corrected variance and
continuity correction; effect size = rank-biserial correlation `1 − 2U/(n·m)` (W3-8); `runProbeP({ samplesPerCondition:
200, warmup: 20, a, b, setupA?, setupB? })` — A/B/A/B interleaving (§4's locked sentence; ABBA declined), `setup*`
outside the window, `performance.now()`; `assertProbeP` fails if `pValue < 0.01 || |medianDiffMs| > 2`. Unit tests:
three golden vectors (one with ties) with independently computed U, z, p; identical distributions pass; a 5 ms shift
fails; mutants: constant `p`, one-sided tail, no tie correction.~~

## Scope

### Implement

1. `package.json`/lockfile (`playwright` exact; `browsers`); `Makefile` `browsers`. (1)
2. Gate: vetted tier (single importer, reachability, per-file opaque tolerance, manifest parameter), evaluator zone,
   selftest fixtures. (1)
3. `src/browser/playwright.ts`. (1)
4. `src/browser/session.ts`, `inRealm.ts`, `controls.ts`, `controlResults.ts`; `writeLocalVault` precondition importing
   `MAX_SECRET_CODE_UNITS`; `loop.ts` `afterLoop` + duplicate-id rejection (+ tests); fill-independent tests;
   `testbed/probe/probeP.ts` (+ tests); `testbed/fixtures/controls-lab/` (two origins; every B/C/E page incl. redirect
   chain, poisoned setter, patched prototype, clobbered `action`, clobbered `elements`, `form="<id>"` submit, ancestor
   opacity/filter, overlay-after-pin, mirror span, echo field, below-the-fold, label overlay, smooth-scroll,
   self-navigating iframe, static-token login form). (2)
5. `src/core/fillService.ts`; `src/supervisor/host.ts` (+ `EvidenceLease`, `composeSupervisedHost`); introspection
   getters with tests; fill-dependent tests. (3)
6. Testbed wiring; M–N. (4)

Every test file **under 800 lines**.

### Do not implement

- Hostile scenarios (M5); agents (M6); MCP (M8); 1Password (M9); README/SKILL (M10).
- Any `username`/`totp`/multi-field/keystroke/subframe/form-less/shadow-DOM fill; any cache between fills; any request
  listener, evidence buffer, callback sink, or tripwire hook in `src/core`, `src/browser`, `src/backends`; free-text
  errors or `console.*` on the caller path; changes to the amended contract files beyond the pre-applied amendments;
  a second vetted package or `opaqueFiles` entry; any import of `./tripwire` from `host.ts`.

## File Ownership

Codex owns: `src/browser/**`, `src/core/fillService*.ts`, `src/supervisor/host*.ts`, `src/core/sessionMutex.ts` and
`src/supervisor/lockdownDomain.ts` (**introspection getters only**), `src/backends/localFileWriter.ts` (**the length
precondition only**), `src/agents/stub.ts` (`StubStep`), `src/agents/loop.ts` (**`afterLoop` hook and duplicate-id
rejection only**), `testbed/**`, the gate scripts (`scripts/dependency-boundary*.mjs`, §7 only — the pattern, not a file count; four files after the commit-1 and commit-2 splits), `package.json` + lockfile, `Makefile` (`browsers`).

Must avoid: `PLAN.md`, `.claude/memory/*`, `docs/*`, `README.md`, `SCHEMA.md`, `src/core/types.ts`,
`src/core/browserPort.ts`, `src/core/lockdown.ts`, `src/core/{redaction,originGuard,results}.ts`,
`src/supervisor/{tripwire,tripwireSeam,secretMatcher}.ts`, `src/shared/**`, `src/backends/*` except the one rule,
`src/agents/transcript.ts`.

## Acceptance Criteria

Every test names the mutation it kills and has a legitimate-traffic control. One `launchChromium()` per file, fresh
session per test. "No canary anywhere" = any `SECRET_TRANSFORM_NAMES` form. "No plaintext in the DOM" = an
isolated-world probe finds it in no control value and `outerHTML` has none. "Stale" = `isLocked` throws
`InvalidControlIdentityError`.

### A. Real-fill structural redaction (3)

- `JSON.stringify`/deep `inspect`/`Reflect.ownKeys` of result, outcome, fill service, session host, supervised host:
  no canary (**stated: own properties only**; K proves retention). `filled` = `['password']`, frozen, exact keys.
  Control: the fixture login succeeds and its receipt verifies.
- **One consume site:** `src/**/*.ts` minus tests minus `redaction.ts`: `.expose(`/`.consume(` exactly once, in
  `session.ts`; `Secret.prototype` nowhere; `redaction` imported only by `src/core/browserPort.ts` (type),
  `src/core/fillService.ts` (type), `src/browser/session.ts`, `src/backends/*` (Z3-9).

### B. Verified destination — B-pin (2, through the port) and B-fill (3, through `fill`)

- Refused (`no-password-control`): `contenteditable`, `type="text"`, `disabled`, `readonly`, `hidden`,
  `display:none`, `visibility:hidden`, `opacity:0`, ancestor `opacity:0`, ancestor `filter:opacity(0)`, off-screen,
  `scale(0)`, overlay; form-less; off-origin `action`; **clobbered `action`** (`<input name="action">`); descendant
  submit with off-origin `formaction`; **external submit via `form="<id>"`** with off-origin `formaction`;
  **clobbered `elements`** (`<input name="elements">` + off-origin `formaction`) (Z3-2); patched `type` prototype on
  a text input.
- **Must succeed (controls):** below-the-fold field; field under a floating `<label for>`; **`scroll-behavior:
  smooth` page** (Z3-6); same-origin `action` with an unrelated `<input name="action">`; same-origin form with an
  unrelated `<input name="elements">`; **poisoned setter** page with `window.__leak` still `undefined`; selector
  matching in both main frame and subframe (main-frame element used).
- Cross-origin-iframe-only → `cross-origin-frame`; same-origin-iframe-only or nowhere → `no-password-control`.
- (B-fill) zero/two fields, `username`, `totp` → `no-password-control`, no backend call; unknown/closed session →
  `session-unknown`, no backend call.

### C. Atomic re-check, staleness, transport, and the in-realm sources (3; Node tests in 2)

- **Node unit tests** of the sources with fake DOM objects: origin mismatch → `origin` with `observedOrigin`, setter
  not called; each shared predicate failing → `identity`, setter not called; all good → tokens read **before**
  dispatch, setter called once with the decoded `length` units, events `focus, input, change, blur`; sources contain
  no `await`/`async`/`.then`; `DESTINATION_PREDICATES_SOURCE` is a substring of both fill sources; `SNAPSHOT_SOURCE`
  references `.value` only inside the unmasked branch (W3-10).
- **One `callFunctionOn` per `inject`; one per `snapshot`** (spies). **Transport spy (W3-9):** serialized argument
  byte length identical across G's secret axis; mutant: dropping the hex encoding fails.
- **Execute-then-reject (W3-1):** a decorator runs the real setter then rejects → `no-password-control`, node
  **masked**, identity **locked**; mutant: tainting only on `assigned: true`.
- **Decorator cases** between `pin` and `inject`, awaiting each signal. **Cross-document** (stale, `lockedCount() ===
  0`): `goto(<other origin>)` → `origin-not-authorized` **and `observation.reobservedOrigin` = the other origin**
  (W3-3); `goto(<same origin, other path>)`, redirect chain, `document.open()` → `no-password-control`;
  **`page.close()` → `no-password-control`** (page gone, session alive — Z3-1); **`about:blank` then the page** → two
  epoch increments. **Same-document** (still locked): `el.remove()`, replacement, off-origin `action` attribute,
  ancestor `opacity:0` after pin, overlay after pin → `no-password-control`; `pushState` → success (control).
- **Epoch check:** a fake port whose `documentEpoch()` changes between `pinPasswordDestination` returning and the
  epoch read → `resolveSecret` count 0; the missing-check mutant resolves (count 1).
- **Staleness inside the registry:** a fake registry throwing at `lock` → the rule's reason, `resolveSecret` 0. **The
  handler's own throw:** a fake port whose `observeTop` throws (violating totality) → `no-password-control`, never a
  caller-visible throw.
- **`Secret` cleared on every exit:** including the staleness path after step 6 (Z3-10); mutant: `try` wrapping only
  `inject`.

### D. Origin authorization and `assertedOrigin` (3)

Policy A, page B → `origin-not-authorized`, `resolveSecret` 0. `assertedOrigin` = B on A → `origin-not-authorized`,
`assertedMismatch === B`; = A → success; malformed → `origin-not-authorized`; absent → success. `about:blank` →
`origin-not-authorized`. **Pre-lock survives backend failure** → `backend-error`, identity locked, second fill →
`locked-field`.

### E. Lockdown, masking, lifetime — E-controls (2), E-fill (3)

- Second fill → `locked-field`, no backend call; `type` into it → `locked-field`; into `#username` → `ok`. **Swap
  decorator:** replacing the target with the locked node between resolve and assign → the locked node's value
  unchanged.
- Snapshot after the fill: password node `{ tag: 'input', masked: true }`; no canary; username value present; `url`
  without query. Provenance: typed canary in an echo field unmasked; never-filled password inputs masked; **type
  mutated to `text` → still masked**; **removed and re-inserted → still masked**; **sentinel:** a password field whose
  value equals a chosen sentinel is masked identically to any other (W3-10).
- **Mirror page:** the `<span>` carries the canary; the `tool-result` event carries it (layer 4 measures it).
- **Lifetime:** `pushState` → still locked; cross-document back → new `#password` fillable, old identity stale,
  `lockedCount()` 0; subframe self-navigation → still locked; `browser_close_session` and `page.close()` → counts 0,
  further fill `session-unknown`; snapshot after a destroyed tainted node → no throw. **No BFCache:** password field
  empty after `goBack()` (asserted on the password field).
- (E-controls) **Exception matrix:** missing selector; `navigate` to an unreachable port / `ftp://` / a non-URL;
  `snapshot` on a destroyed context; `close` twice; each the exact frozen result; `open` with a dead browser → the
  single fixed message.

### F. Concurrency, isolation, mutex — F-isolation (2), F-fill (3)

Fill in flight; `snapshot` and `type` complete after it, masked, no canary. Two sessions concurrent; one closing
mid-fill leaves the other's lock. **Context isolation** (cookie + `localStorage`). **Session-id entropy**
(`randomBytes(16)` spied; 100 distinct). Close mid-fill → identical result bytes. **Every control acquires the mutex**
(spy). **Façade (Z3-7):** `Reflect.ownKeys(port)` is exactly `['documentEpoch','observeTop','pinPasswordDestination']`,
frozen; mutant: passing `page`. Reentrancy mutant → `SessionHostError('reentrant')` at the port layer, fixed closed
result at the tool layer.

### G. Noninterference differential (3)

**Secret axis:** lengths `1, 16, 64, 1024, 4096`, every JSON-escapable character, non-ASCII, a string of `"`/`\`.
**Policy axis:** `fieldRecipe` × `canonicalOrigin` short/long. Paths: success (**static-token lab login page**, page at
the policy origin); every pre-secret refusal; every post-`consume()` path (`origin`, `identity`, `too-long`, `unplaceable`,
`transport`). `serializeExact(result)` byte-identical across both axes per path; `serializeExact(observation)`
byte-identical across the secret axis per (path, policy); mismatching-policy refusal rows: `observation.topOrigin` =
the **page's** origin. 4097 → `backend-error` (record precondition; stated).

### H. Timing under probe P (3; G's equalities asserted first)

Short vs long (16 vs 4096, any content — transport is content-blind); queued probe; reflection oracle; tripwire
equal-work (leaky vs same-length non-matching, via `composeSupervisedHost`); real supervised path with the lease
listener (canary vs same-length non-canary POST body: `browser_click` latency). Each probe asserts the hard clause and
registers its result; a final family test applies Holm–Bonferroni (D10 as amended); numbers reported.

### I. Tripwire wiring (3)

`tools` vs bare tools byte-identical (also on the real path with the listener). Leaky fake result → `'fail'` with
diagnostics; non-leaky → `'pass'`; every transform → `'fail'`; **every captured method** planted → `'fail'`. Snapshot
with a caller-typed canary → `'pass'` and its `tool-result` event still reaches the loop. **Canary-encoded
`assertedOrigin`** (hex/base32 in a valid host) → `finish()` `'pass'`, `fill-service-asserted` event present. **No
matching before `finish()` (W3-11):** `vi.spyOn(secretMatcher, 'firstMatchingSecretTransform')` zero calls before,
≥ 1 inside; `mint`/`adjudicate` zero before, one inside; source test: `host.ts` imports only `./tripwireSeam`.

### J. Lease finalization (3)

`finish()` → verdict; then `adjudicate(oldBatch)` throws `INVALID_SEALED_BATCH_MESSAGE`; `captureTrusted` after close
throws; `drainEvidence()` empty; a test-only lease inspector returns an empty array (Z3-11; mutants: dropping
`#canary = null`, dropping the evidence clear). Missing marker → `abort()` in the `finally`. Capture error → caller
result unchanged, `captureFailed`, run invalid. Injected `adjudicate` throw → lease still dropped. **Lease dropped
after fill refusal, tool-op throw, session close, and tripwire match** (§4's list). **Network evidence lives only in
the lease:** session host and fill service show no POST body; `drainEvidence()` returns it once.

### K. B1 slice 3/3 — rotation, retention, cleanup (3)

- **Same session, same fill-service instance:** A → cross-document back → `reseal(B)` → B; `resolveSecret` 2; **the
  second fill's evidence (drained after the first was drained) contains no A in any transform**.
- **Structural retention test** (D5's taint relation and sink allowlist) with the five named mutants; **closure
  mutant:** a second `inject` on a cleared `Secret` fails, never reuses a retained string.
- **Cleanup** after success, refusal, throw, session close, tripwire match: `Secret` cleared; four counters 0 after
  `closeAll()`; deep inspect shows no canary; `consume` spy one per successful fill, zero per pre-secret refusal.
  Verbatim: *"This proves TinyVault-owned host state retains no plaintext. It does not and cannot prove V8,
  Playwright, or Chromium retained no copy."*
- **Two sessions, evidence partition.** **Returned refusals leave no plaintext in the DOM.**

### L. Setup blocker, backend mapping, dependency boundary (1 and 3)

Setup template and mappings as before. **Writer precondition:** 4097 → `Invalid local vault entry`, nothing written;
4096 accepted; **the writer's bound `=== MAX_SECRET_CODE_UNITS`** (imported). **Gate PASSES on the M4 tree.**
Must-FAIL mutants: `fillService.ts → ../supervisor/host`; a `src/browser` file `import type` from `src/supervisor`;
**`session.ts → 'playwright'`; `session.ts → 'playwright-core'`; `playwright.ts → 'playwright-core'`** (W3-7);
`src/core/fillService.ts → 'playwright'`; `testbed/runner.ts → 'playwright'`; `src/core/x.ts → src/browser/playwright.ts`
(reachability); `src/core → testbed → src/supervisor/host` (transitive); an unsupported load from a `playwright-core`
file not in `opaqueFiles`. Controls: `testbed/runner.ts → src/supervisor/host` PASSES; real tree PASSES. **Rule 4:**
`checkDependencyBoundary(root, { vetted: [] })` FAILS naming exactly the two bundles. **Browser missing** (empty
`PLAYWRIGHT_BROWSERS_PATH` directory) → the fixed message, non-zero exit.

### M. Testbed: per-run control identity (4)

Served tokens as specified; unregistered `runId` → none. **Real wrong-element fill:** token-less → `requestId 'none'`
(read before the wrapper); different token → that token; **an `input` listener that rewrites the tokens → the
pre-dispatch values** (Z3-5); the wrapper preserves `dom-fill.requestId`; **the emitted identity and the node that
received bytes are the same node** (asserted via the node's value in the isolated world). Offline recomputes from the
receipt-bound `runId`/`nonce`.

### N. Testbed: real-browser eval and observed-origin `wrongOrigin` (4)

`make eval`: 10/10, 0 leaks, `pass`; digest and capture agreement hold; the login `network-body` is present via the
`afterLoop` drain (Z3-4). `wrongOrigin`: page at the lab origin, no assertion → `true/true`; page elsewhere with
`assertedOrigin` = canonical → `true/true`; **navigate A→B mid-fill → `true/true`** (W3-3); lookalike assertion while
on the canonical page → `false/false` with the `fill-service-asserted` event; **lookalike page + unknown handle
(`handle-unavailable`) → `true/true`** (Z3-8: any non-`ok` result blocks); two attempts, one `ok` → `true/false`;
**uncorrelated attempt → `runEval` throws**; **duplicate `call.id` → the loop throws** (W3-13); swapped ids in a
mutated set → `blocked: false`; benign → `false/false`. Host never reaching `finish()`, `fail` verdict,
`captureFailed`, non-HTTP fixture → throws. Live-fire alarm and meta-gate green.

### Compile-time negatives

`FillOutcome.result` not assignable to a type with a `secret` field; `inject` without `expectedOrigin`;
`FillDestinationPort` has no `evaluate`/`page`/`cdp`; `BrowserSessionHost` has no `on`/`onRequest`/`drainEvidence`/
`context`; `SupervisedHost` exposes no `run`/`registry`/`authority`/`lease`; masked node with `value` rejected.

## 7. Dependency gate — two additions (commit 1; planning decisions made here)

### 7.1 The vetted-package tier

```js
// manifest is a PARAMETER of checkDependencyBoundary(root, { vetted = VETTED_EXTERNAL_PACKAGES })
const VETTED_EXTERNAL_PACKAGES = [
  { packages: ['playwright', 'playwright-core'], version: '1.62.1',
    importerFiles: ['src/browser/playwright.ts'],               // the ONLY repo file that may import any of `packages` (W3-7)
    directImportOnly: ['playwright'],                            // repo files may never import 'playwright-core' directly
    reachableFrom: ['src/browser', 'testbed'],                   // entry roots that may reach it at all (Y2-12)
    opaqueFiles: ['playwright-core/lib/coreBundle.js', 'playwright-core/lib/utilsBundle.js',
                  'playwright-core/lib/bootstrap.js'],   // added 2026-09-02 (T3-1 follow-up): its CJS bootstrap does require("module")
    reason: 'browser driver; the two bundles carry non-literal and optional loads; the plaintext is handed to it by design' },
];
```

1. **Tolerance** only when the importer file's realpath ends with an `opaqueFiles` entry under `node_modules/`; the
   `traversal exceeded` message is a violation in every tier; a literal protected edge is never tolerated.
2. **Version + lockfile `integrity`** for each package; either missing → configuration violation.
3. **Importer file rule:** a repo-file edge into any of `packages` must originate from an `importerFiles` entry and
   target a `directImportOnly` package. **Reachability rule:** a vetted package may appear in an entry root's BFS only
   if the entry is under `reachableFrom` or is protected/evaluator by zone.
4. **Load-bearing on the real graph:** `{ vetted: [] }` → FAIL naming exactly the three opaque files (the two bundles and `bootstrap.js`, per the T3-1 follow-up); real manifest → PASS;
   no entry names an uninstalled package or a missing `opaqueFiles`/`importerFiles` path.

### 7.2 The evaluator zone

`testbed/` may reach `src/supervisor/*` and vetted packages; `src/**` non-protected roots tolerate nothing;
transitive reach through `testbed` from a `src` entry is still a violation. Header names four zones: data plane,
control plane, evaluator, tooling. **Residual:** the two bundles are opaque; the gate proves no scanned or resolved
path. **Any other blocking construct → stop and report.**

## Pre-authorized contract amendments (continuity owner applies to `main` BEFORE dispatch)

One commit — `src/core/types.ts`, `SCHEMA.md`, `src/core/lockdown.ts`, `src/core/browserPort.ts` (new),
`src/supervisor/lockdownDomain.ts` (imports the moved type; throws the new error), `phase-0-plan.md` — plus a
Decisions Log entry:

```ts
// src/core/types.ts additions
export type BrowserOpResult =
  | { ok: true }
  | { ok: false; reason: 'session-unknown' | 'invalid-url' | 'navigation-failed' | 'no-such-element' | 'locked-field' };
export type MaskedSnapshotNode =
  | { tag: string; masked: true }
  | { tag: string; masked: false; role?: string; name?: string; value?: string };
export type MaskedSnapshot = { url: string; nodes: MaskedSnapshotNode[] };   // url = origin + pathname only
export interface BrowserControls {
  browser_open_session(): Promise<{ sessionId: string }>;            // rejects with one fixed error if the browser is unavailable
  browser_close_session(args: { sessionId: string }): Promise<{ ok: boolean }>;
  browser_navigate(args: { sessionId: string; url: string }): Promise<BrowserOpResult>;
  browser_click(args: { sessionId: string; selector: string }): Promise<BrowserOpResult>;
  browser_type(args: { sessionId: string; selector: string; text: string }): Promise<BrowserOpResult>;
  browser_snapshot(args: { sessionId: string }): Promise<{ ok: true; snapshot: MaskedSnapshot } | { ok: false; reason: 'session-unknown' }>;
}
// src/core/lockdown.ts additions
export type LockdownLifecycle = Readonly<{ clearOnTrustedTopLevelNavigation(sessionId: string): void; clearOnSessionClose(sessionId: string): void }>;
export class InvalidControlIdentityError extends Error { /* message = INVALID_CONTROL_IDENTITY_MESSAGE */ }
// src/core/browserPort.ts — as in D1
```

`VaultTools` is unchanged. **Plan-sentence amendments** (register §C when applied): §2 step 5 identity failures →
`no-password-control` (R1-15); `types.ts` `cross-origin-frame` comment (R1-16); §3 one context per session; §3
`dispose` on host close (R1-22); §3 `browser_close_session` is not under the mutex; §3 `fill_from_vault` fills exactly
one `password` field in v0.1; §4 taint ends on any main-frame cross-document navigation, BFCache disabled
(R1-17/X1-8); §4 layer 1 noninterference holds *for every secret a conforming backend can hold*, which local-file
bounds at 4096 code units (Y2-9); §4 layer 3: the supervisor's request listener is attached to a context it creates
before the data plane receives it, is provenance-blind, never branches on content — the "no callback-style sink" rule
forbids **match-dependent** hooks in the caller path (R2-9); §4 layer 2 / §2: page-derived browser output is outside
the noninterference invariant; the checker measures it; the authorized origin is the residual (Y2-1); §4 "nothing is
written to the DOM on refusal" holds for **returned** refusals — a transport rejection leaves the node masked and
locked with unknown contents (W3-1); `BENIGN_FIXTURE_VERSION`/`CHECKER_VERSION` bumps. **Any further contract need →
STOP and report.**

## Review sequence (§9.1, author-relative)

Codex implements, so on `codex/m4-fill-service` **per commit**, in parallel isolated worktrees: **1.** Claude `/review`
· **2.** Claude `/security-review` · **3.** Codex adversarial diff review. Then the **post-M4 whole-codebase audit**
(§9.2, carrying the §9.1 simplification question) before M4 is marked complete. **Direct the security review at:** the
single `consume()` site, its `finally`, the taint-before-call, and the AST retention rule; the in-realm sources (shared
predicates, native getters for `elements`, tokens read before dispatch, no `await`); the transport spy; one
`callFunctionOn` per inject/snapshot; the step order, `epoch0`, and the staleness rule's totality; the façade;
**no listener, buffer, or evidence anywhere in `src/browser`/`src/core`**; the lease `finally` and that lease
evidence is never tripwire-captured; the matcher spy and `host.ts`'s import rule; `browser_snapshot` never captured;
the lifecycle signals and BFCache switch; every `catch` → the right closed reason; the gate's single-importer,
reachability, per-file, version, integrity rules and the evaluator zone; the positive control on `network-body`;
probe P's pinned statistic and A/B/A/B.

## Honest-claims rule

Claims this slice may make: *a secret is resolved only after the request shape, the credential's policy, the asserted
origin, and the trusted-side observed top-level origin all agree; it is placed only by one synchronous function in a
CDP isolated world that re-verifies origin and element identity through native, page-unpatchable reads in the same
turn as the native-setter assignment (probed against a poisoned page); on every returned refusal nothing is written
to the DOM, and on a transport rejection the element is masked and locked; TinyVault-owned data-plane state retains
no plaintext, no secret-derived material, and no evidence after the fill on every path, shown by a structural taint
rule and by mutation; filled and password-type controls are masked by provenance, masked nodes carry only their tag,
and the mask decision reads no value; caller-visible bytes and error paths are independent of the secret's value and
length for every secret a conforming backend can hold and of the policy's shape, on pre- and post-secret paths; the
CDP transport is content-blind by construction; the fill's latency and mutex occupancy show no detectable difference
under probe P; the tripwire changes nothing caller-visible and matches only in `finish()`; no data-plane module has a scanned or
resolved path to the supervisor, and none outside `src/browser` has one to the browser driver — within `src/browser`
only `playwright.ts` imports it, and only the `playwright` package (post-impl S1: `src/browser` is a data-plane zone
with a sanctioned path; the earlier sentence over-claimed); the eval scores the real fill, the real
element, the real observed origin (including a mid-fill origin change), and its positive control is the browser's own
login POST.* Not claimed: memory zeroization; copies inside V8, Playwright, or Chromium; protection against a
compromised authorized origin, including anything the authorized page displays to the model or mirrors; absence of a
timing channel; subframe, multi-field, form-less, or shadow-DOM fills; that the per-run control token resists a page
that clones it (M5 owns token discipline); that a trusted-side leak into a `browser_snapshot` result is caught by the
tripwire (layer 4 measures it); anything about the two opaque bundles beyond the pinned, integrity-recorded version
having been traversed where the gate could follow.

## Reporting

`handoff-pattern.md` §13 per commit: Summary / Files Changed / Verification (what ran; what could not run in the
sandbox and why) / Risks & Follow-ups / **Deviations From Handoff** (mandatory for any departure from a locked
sentence; a code comment is not a deviation record).
