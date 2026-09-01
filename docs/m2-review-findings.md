# M2 Post-Implementation Review — Consolidated Findings Register

Branch `codex/m2-primitives` @ `a3eab0c`. All three §9.1 channels ran on the identical diff.

| Channel | Family (relative to implementer) | Verdict |
|---|---|---|
| Claude `/review` | **different** | **NO-SHIP** — 15 findings, 25 mutations run (17 killed, 8 survived) |
| Claude `/security-review` | **different** | **NEEDS-ATTENTION** — 8 findings, all reproduced by executing shipped code |
| Codex adversarial diff | same (fresh-context) | **NO-SHIP** — 5 findings |

None of these certifies M2; each is additive (`handoff-pattern.md` §7.1).

> **Caveat on the Codex run:** its verification was sandbox-blocked (`EPERM` on temp dirs; `npm test`,
> `vitest`, and `make eval` executed **zero tests**). Its in-memory mutation results are sound; its
> "current graph passes" statements are weaker than they read. The local suite was run by Claude throughout.

---

## A. Verified-exploitable (fix before M2 merges)

### A1 — Provenance TOCTOU: mixed-provenance evidence reaches the scanner. **CRITICAL**
`src/core/tripwire.ts:46,51` · `src/supervisor/tripwireSeam.ts:31,34` — `/review` #1, Codex #3.

Two distinct attack shapes, **both verified by Claude locally**:

- **Direct path** (`/review`): `detectTripwire` reads `item.provenance` (`:46`) then `item.bytes` (`:51`)
  off the *same live object*. A self-flipping getter (`'trusted'` then `'mixed'`) is scanned anyway.
  Probe: `DIRECT => {"verdict":"fail","transform":"raw","evidenceIndex":0}`.
- **Seam path** (Codex — the stronger shape): record 0's `provenance` getter **relabels record 1**
  mid-`.some()`. Preflight passes, `mint` copies record 1's bytes, adjudication returns a match.
  Probe: `CROSSREC => {"verdict":"fail","transform":"raw","evidenceIndex":1}`.

The second disproves the initial reading (mine and `/security-review`'s) that `mint`'s double-read made the
seam fail-closed — that holds only for single-record self-flips. **Freezing a copy of a caller-supplied
object is not the same as owning provenance.** This is the §4 layer-3 control that keeps caller input out
of the scanner, i.e. the membership-oracle defense three paper rounds were spent building.

**Fix:** do not accept arbitrary structural evidence at the mint boundary. Mint evidence records inside the
trusted capture authority; hold provenance + bytes in module-private storage. Snapshot into frozen locals,
validate the snapshot, scan only the snapshot. Freezing caller objects is insufficient against
accessors/proxies.

### A2 — Taint clear requires no capability. **HIGH**
`src/core/lockdown.ts:57` — `/security-review` #1.

`lock()` demands an attested `ControlIdentity` and rejects a forged `{}`.
`clearOnTrustedTopLevelNavigation(sessionId)` takes a **bare string**; nothing carries evidence that a
navigation occurred — the method name is the whole trust claim. Satisfies the letter of §4 layer 2's "no
method named `unlock`" while being, for any registry holder, exactly a generic unlock.

**M4 attack narrative:** the fill service is data-plane and must hold the registry to call `isLocked()`.
Any data-plane path reaching the clear drops taint on a password field *while plaintext is still in it by
design* (§4's authorized-destination lifetime) → provenance masking stops masking → plaintext becomes
model-visible. The round-2 reflection oracle, reopened through the lifecycle API.

**Fix:** split the capability. `createLockdownDomain()` returns a separate `lifecycle` object holding the
two clears; `LockdownRegistry` keeps only `lock`/`isLocked`/`isSameIdentity`.

### A3 — Non-reentrancy does not hold on the queued path. **MEDIUM**
`src/core/sessionMutex.ts:36` — `/security-review` #2. Both directions verified.

The owner set is read at **dispatch** time (`getStore()`), inside whatever async context runs
`#release`→`#dispatch` — not the acquirer's. `AsyncLocalStorage.run()` exits before `.then/.finally`
register.

- *Under-inheritance:* nested same-session re-acquisition **silently queued into a deadlock** instead of
  failing fast, violating the packet's "fails fast with a fixed internal error."
- *Over-inheritance:* an unrelated caller was rejected with a reentrancy error because another party's
  owner set bled into its operation.

**Fix (2 lines):** build the owner set in `runExclusive` before pushing the entry, where the caller's
context is already read, and close over it in `start()`.

### A4 — Result constructors' closed sets are type-only. **MEDIUM**
`src/core/results.ts:11,19,28` — `/security-review` #7.

`SETUP_INSTRUCTIONS` is a plain object literal indexed by a caller-supplied string.
`request_vault_setup` is a **model-callable tool** documented at `src/core/types.ts:56` as *"fixed template
text only"*; at runtime `reason: '__proto__'` yields `Object.prototype` and `'constructor'` yields the
`Object` constructor. `createFilledResult` echoes arbitrary caller strings of arbitrary length into the
model-visible `filled` array.

Nothing here is *secret*-derived — that part is sound. But confinement rests entirely on erased types,
which is precisely the reasoning round 3 used to reject branded-types-alone, not carried through.

**Fix:** `Object.create(null)` / `Object.hasOwn` for the table; filter `requestedRoles` at runtime against
a frozen `FieldRole` set.

---

## B. Dependency-boundary gate — the redesign's own central control

Convergent across **all three channels**. The gate replaced type enforcement precisely because types were
unsound; it currently has four blind spots and two unverified claims.

| # | Blind spot | Evidence |
|---|---|---|
| B1 | **Blind outside `src/`.** Walker scans only `src/`; unresolved targets are silently dropped. `data-plane → testbed/relay → supervisor` = **0 violations**. Not hypothetical: `src/core/tripwire.ts:1-4` already imports `../../testbed/checkers/leakScan`, and tsconfig includes both trees. | all 3, verified |
| B2 | **Computed / aliased loads escape.** `const t='...'; import(t)`, `createRequire(import.meta.url)('...')`, `const r=require; r('...')`, TS `import x = require(...)` all → 0 violations. Selftest nonetheless prints "(static, re-export, dynamic, require, transitive)". | Codex + `/review`, verified |
| B3 | **Protected set is hardcoded strings, never existence-checked; the `core/tripwire.ts` arm is never exercised.** Deleting that arm leaves `make test` green. Moving the detector to `core/tripwire/index.ts` → 0 violations. Empty `src/` → PASS, exit 0, so a wrong `--root` silently disarms it. | `/review` #2, `/security-review` #6, verified |
| B4 | **Nothing observes the gate failing the build.** Deleting `process.exitCode = 1` (`check-dependency-boundary.mjs:17`) leaves `make test` green. The selftest only calls the library function. This is the packet's own "a gate that has never been observed failing is not a gate." | `/review` #3, Codex #2, verified |

**Root cause of B3** (`/security-review`): §4 layer 3 control 2 requires *physically separated module
zones* "so the dependency direction is visible in the tree." The detector sits in the data-plane directory
next to `redaction.ts` and is exempted **by filename**. The tree does not show the direction.

**Fix:** move the detector to `src/supervisor/`, delete the filename special case so `isProtected` is the
directory rule alone; build the graph over every compiled production tree (tsconfig `include` + `scripts/`);
make an unresolvable relative specifier from a data-plane module a **violation**, not a dropped edge; spawn
the real CLI in the selftest and assert exit 1 (and 0 for a clean fixture); add fixtures for each bypass
route and for the detector arm.

---

## C. Origin validator (`src/core/originGuard.ts`)

All Appendix A rows behave as tabulated. These are inputs *outside* the table whose handling contradicts
the rule the table encodes.

- **C1 — hex IPv4 accepted.** `0x7f000001` and `0x7f.0x0.0x0.0x1` → `https://127.0.0.1`; `0xc0a80101` →
  `192.168.1.1`. The guard `/^[0-9.]+$/` is a blocklist that structurally cannot see hex, while decimal
  (`2130706433`) and octal (`0177.0.0.1`) are caught. All 3 channels, verified. **Fix:** replace the
  blocklist with an idempotence check — for pure-ASCII hosts require `raw.toLowerCase() === parsed.hostname`
  (verified against all 9 accept rows; also catches non-canonical IPv6 like `[::ffff:127.0.0.1]`).
- **C2 — trailing backslash accepted.** `https://example.com\` → accepted. Backslash is a path separator
  for special schemes, so this is the "trailing slash → reject" row in disguise. One-char fix:
  `/[/\\?#]/`.
- **C3 — trailing C0 controls accepted.** ` `, ``, `` → accepted; the WHATWG parser strips
  them, defeating the table's "reject *before* parsing, do not trim" discipline. **Fix:** reject any code
  point ≤ U+0020 or == U+007F anywhere in the input, up front.
- **C4 — strictness is row-driven, not rule-driven.** `:0443`, `:00080` accepted. Pick and state the rule.

---

## D. Test gaps (tests that cannot fail)

Each verified by mutation leaving `make test` green.

- `lockdown.test.ts:74` — "no generic unlock" is a **name check** (`'unlock' in registry === false`), not a
  capability check. The invariant it claims to defend is untested (see A2).
- `lockdown.test.ts:56-59` — the cross-domain negative **passes for the wrong reason**: it never mints in
  domain B, so the *generation* check rejects first. Deleting the domain check survives.
- `sessionMutex.test.ts:39` — covers only the uncontended nested case; cannot fail on the queued path (A3).
- `sessionMutex.ts:90` — deleting `#states.delete(sessionId)` survives; "then deletes state" is named as
  observable semantics.
- `sessionMutex.ts:36` — replacing the owner set with a fresh empty set survives; that line is what makes
  A→B→A fail fast rather than deadlock.
- `lockdown.ts:62` — making nav-clear wipe **all** sessions survives. Over-clearing is fail-**open**.
- `originGuard.test.ts:38` — the `%20` vector doesn't isolate the `%` guard (`new URL` rejects it anyway);
  the guard is genuinely needed for `%2E` (`exa%2Emple.com` → `exa.mple.com`). Add that vector.
- `results.ts` — `Object.freeze` deletion survives; nothing asserts results are frozen.
  `redaction.ts` — `Symbol.toPrimitive` deletion survives (redundant with `toString`).
- No `structuredClone(realToken)` case; no provenance-accessor/proxy case; no hex-IPv4 case; no
  computed-import / `createRequire` / off-`src` gate fixtures.

**Not counted as vacuous:** `redaction.test.ts:90-94` states plainly that API tests do not prove
non-retention — the packet's permitted option B. B1 slice 1/3 therefore rests on structural review of
`redaction.ts:15-34`. All three channels accepted this as honest.

---

## E. Confirmed sound (do not re-litigate)

- **`Secret<string>`** — 27 exposure routes probed (`String`, template, all `Symbol.toPrimitive` hints,
  `toJSON`, nested/replacer `JSON.stringify`, `util.inspect` with `showHidden`/`depth:9`/`customInspect:false`,
  `console.log`, `Object.keys/values/entries`, spread, `Object.assign`, `getOwnPropertyNames`,
  `Reflect.ownKeys`, descriptors, prototype sweep, `structuredClone`, `Array.from`, `valueOf`,
  `toLocaleString`, `Error.stack`): **zero plaintext leaks**, identical after `clear()` and `consume()`.
  `#value` is a true private field — not a property, so no structural route reaches it.
- **Runtime attestation** — 11 forgery vectors rejected incl. `Proxy`, `structuredClone`, cross-domain,
  cross-registry, stale, replayed, post-close. Tokens are owner-bound, consumed before detection, and the
  `WeakMap` is genuinely module-private. Four separate seam mutations all killed. *(A1 is an
  evidence-ownership flaw, not an attestation flaw.)*
- **Transform parity** — `matchesTransform` verified byte-for-byte equivalent to `leakScan`'s
  `containsEnabledTransform` across all nine transforms; base32 vector recomputed independently.
- **Error paths** — every `new Error` takes a module constant; no interpolation, no input/origin/secret/
  session echoed; no logging anywhere in the diff.
- **Caller-facing neutrality** — no callback parameter, emitter, sink, or match-dependent hook in any new
  public API.
- **Scope + honest claims** — no browser/DOM/Playwright/fillService/backend; `testbed/`, `types.ts`,
  `SCHEMA.md` unchanged; no tripwire wiring; `make eval` green. Every "zeroization"/"uncallable" string in
  the diff is a disclaimer.

---

## F. Process findings

- **F1 (Codex #5, fair).** The implementation branch edited its own locked packet — `docs/*` is must-avoid.
  The edit was substantively correct (Claude's Appendix A mojibake fix, pinning U+00E4), but it should have
  been a separate continuity-owner commit. Allowing an implementation branch to revise its own packet
  weakens contract control.
- **F2.** `src/core/tripwire.ts` imports from `testbed/`, so production `src/` cannot be packaged without
  the test tree — and it is the concrete instance of B1. The shared constant belongs in a module both zones
  import.
- **F3.** The tripwire matchers are a hand-copy of the checker's; `tripwire.ts:89-104` is a **verbatim
  duplicate of the already-exported `base32Encode`** (`testbed/canary.ts:11-28`). Identical today, but the
  conformance test compares *encoded vectors*, not *matcher behavior*, so a future evasion fix in the
  checker would silently not reach the tripwire.

## G. Simplification (standing §9.1 question — diff half)

`sameOrigin` (`originGuard.ts:37-39`) is a one-line alias for `===` with exactly one call site (its own
test); `authority.endsWith(':')` (`:12`) is redundant with the port-range check; `Symbol.toPrimitive`
(`redaction.ts:44-46`) is redundant with `toString`; `LockdownRegistry` should export the type only. Largest
single removal is F3's duplicated `base32Encode`. Keep `detectTripwireWithTransforms` — it is what makes the
per-transform deletion test load-bearing. *Testbed-scoped half (the ~3,486 lines §9.1 actually points at) is
still outstanding.*

---

# ROUND 2 — review of the fix slice (`a1c7c39`)

Verdict **NO-SHIP**, merge verdict **no**. Findings verified against *unmutated shipped code*.
A1, A3, A4, B1, B3, B4, F2, F3 are real closures that survive adversarial mutation.

## Blockers

- **F-1 (HIGH, verified by Claude).** C1 is closed **only for ASCII hosts**. The idempotence check is gated
  on `/^[\x00-\x7f]+$/` (`originGuard.ts:34-35`), so **one non-ASCII code point skips it entirely** and the
  raw IDNA/UTS-46 path then performs exactly the non-canonical mappings C1 exists to reject:
  `https://０x7f000001` → `https://127.0.0.1`; all-fullwidth hex → `127.0.0.1`; fullwidth stops → `127.0.0.1`;
  soft hyphen / ZWSP / fullwidth `e` → `example.com`; `Ⅸ.com` → `ix.com`.
  The `a1c7c39` commit message claims this class is rejected — **overclaimed**. An origin string that reads
  as one authority and normalizes to another is the defect this primitive exists to prevent.
  *Claude's own round-2 verification missed this: it probed ASCII vectors only, mirroring the suite's blind
  spot. Recorded so the pattern is not repeated — a validator's tests must cover every branch it has.*
  **Needs a continuity-owner decision on Appendix A row 9 before it can be fixed.**
- **F-2 (HIGH, verified by Claude).** The new "exact mutation" origin tests do not catch their mutations.
  Deleting the backslash from the delimiter set → **47/47 still pass**. Deleting the `@`-and-`%` guard line
  → **47/47 still pass** (broader than reported: the userinfo guard is not isolated either). Every vector
  uses an ASCII host, where the idempotence check rejects first. The guards *are* load-bearing — with them
  removed, `https://ä.com\`, `https://ä.com<C0>` and `https://exä%2Emple.com` all become accepted.
  Violates fix-spec §7 and repeats round-1's own `%20` note.

## Further findings

- **F-3 (MED).** Gate is blind to **non-relative aliased specifiers**; a one-line tsconfig `paths` entry
  silently disarms it (`@sup/evaluator` → PASS/exit 0 vs `../supervisor/evaluator` → FAIL/exit 1). Same
  silent-disarm shape as B3. Not live today (no `paths`), but `moduleResolution: Bundler` is in use.
- **F-4 (MED).** `close()` does not revoke **evidence**. `detectTripwire` never checks `#active` and never
  consumes the token: post-close detection returns a `fail` verdict, replays indefinitely, and one evidence
  token seals into two batches that both adjudicate. "Run-bound and single-use" holds for sealed batches,
  not evidence. This is where §4's "a lease never outlives its run under any path" must bite in M4.
- **F-5 (MED).** `src/shared/` is an **ungoverned zone**. The fix deleted the filename exemption so
  `isProtected` would be "the directory rule alone", then created a third directory with no rule, no test,
  and no contract — and the matcher core (`firstMatchingSecretTransform`) moved there. A data-plane import
  of it leaves the gate at exit 0. Not exploitable today (pure function, canary passed as a parameter).
- **F-6 (LOW).** Five decorative guards introduced by the fix. One — `lockdownDomain.ts:78`'s
  closed-session check — is **genuinely load-bearing and untested**: removing it lets a post-close
  nav-clear resurrect a closed session's identity (closed-session identity replay).
- **F-7 (LOW).** Capture-after-close throws the sealed-batch error for an operation producing no batch.
- **F-8 (LOW).** Contract-home drift: `phase-0-plan.md:233` and `m2-slice-spec.md:47,215` still pin the
  transform inventory at `testbed/checkers/leakScan.ts`; its real home is now `src/shared/secretTransforms.ts`.
  Continuity-owner amendment.

## Cleared — do not re-litigate

Evidence ownership (A1) sound: getter/proxy/cross-record attacks show `propertyReads === 0` / `traps === 0`;
five source mutants killed; WeakMap keying sound. **No common-mode failure** from the shared module —
`metaGate.ts` keeps its own `INDEPENDENT_TRANSFORM_FIXTURES`, `independentBase32`, and required-transform
literal, importing nothing from `src/shared`. `testbed/` refactor behavior-preserving; `make eval` unchanged.
Lockdown split real (`ownKeys` assertion, not a name check). Mutex both directions killed. `Secret` 29-route
sweep after `Symbol.toPrimitive` removal: zero leaks. Scope and neutrality clean; `stash@{0}` intact.

## Closure table

CLOSED: A1, A2 (M2 scope), A3, A4, B1, B3, B4, C4, F2, F3 · **OPEN:** B2 (partial — F-3), C1 (F-1) ·
**COSMETIC:** C2, C3 (F-2) · **PARTIAL:** D (F-6 + F-2).
