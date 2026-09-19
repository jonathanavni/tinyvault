# M2 Post-Implementation Review — Consolidated Findings Register

> **Encoding note (final-pass finding 3).** This file originally embedded literal C0 control
> characters in the C3 finding text. That made it `data` to `file(1)` and **invisible to default
> `grep`** — a premature-closure audit during the final review silently returned zero rows for it.
> Controls are now written as `U+XXXX`. This is the project's own "silent-wrong is an
> observability gap" shape, in the register that documents that principle.

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
- **C3 — trailing C0 controls accepted.** ``U+0000``, ``U+0001``, ``U+001F`` → accepted; the WHATWG parser strips
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

---

# FINAL CLOSURE STATUS (appended — the round-2 table above is historical, not rewritten)

The round-2 closure table records status **as of round 2**. It is deliberately left intact so the
chronology stays honest. This section records the later disposition. Where the two disagree, this
section is current.

## Round-2 blockers — CLOSED

| ID | Status now | Evidence |
|---|---|---|
| **C1 / F-1** | **CLOSED** (was OPEN) | Two explicit branches: ASCII keeps strict idempotence; non-ASCII requires `domainToUnicode(domainToASCII(raw)) === raw.normalize('NFC').toLowerCase()`, failing closed. Locked Appendix A row 9 preserved — `exämple.com`, its uppercase and canonically **decomposed** forms, and ASCII `xn--` all still accept. All mapping classes reject: fullwidth→ASCII, U+00AD, U+200B, U+2168, U+3002/U+FF0E/U+FF61. Reproducible proof: `scripts/unicode-origin-sweep.mjs`. |
| **C2 / F-2** | **CLOSED** (was COSMETIC) | The **delimiter and userinfo** guards are killed by their own tests. (**C3's control-character guard was NOT** — see the pre-merge round below; this row originally over-claimed it.) Verified by separate mutations: backslash → *"rejects a trailing backslash on an IPv6 authority as a delimiter"*; `@` alone and `%` alone → their two respective *"…before consulting the URL parser"* tests. The `@` test fails on `expected "URL" to not be called`, proving the pre-parse claim rather than mere rejection. |
| **B2 / F-3** | **CLOSED** (was OPEN partial) | Resolution goes through parsed TypeScript compiler options. Real child-process CLI asserts exit 1; 8 independent alias vectors absent from the selftest all caught, control exits 0. |

## Post-SHIP pre-merge items — the reviewer's SHIP was not the end

An independent reviewer rejected merge-readiness *after* the confirmation pass returned SHIP, on four
items. Three were code; all are now closed and independently verified.

- **F-5 — CLOSED, and it should never have been deferred.** `firstMatchingSecretTransform` — the actual
  secret-matching core — sat in **unprotected** `src/shared`, so a data-plane module could import the
  matcher without ever touching `src/supervisor` and the gate would pass. That contradicted the
  architecture's claim that matching executes only in the supervisor plane. *Exploitability-today was the
  wrong test; a stated boundary either holds or it does not.* Note the shape: F-5 was **introduced by the
  fix that deleted the filename exemption** so `isProtected` would be "the directory rule alone" — and then
  created a third directory with no rule. The fix moved the hole rather than closing it.
  **Now:** matching lives in protected `src/supervisor/secretMatcher.ts`; `src/shared` holds only the
  canonical inventory and neutral encoders; the offline checker keeps its **own independent** matcher
  (`firstMatchingCheckerTransform`) guarded by `metaGate`'s independent vectors. Verified: a data-plane
  import of the matcher → CLI **exit 1**; a data-plane import of neutral encoding → **exit 0** (correctly
  still allowed).
- **F-4 — CLOSED.** `TripwireRun` closure semantics resolved rather than left in the ambiguous middle.
  Evidence is single-use (direct detection *or* sealing consumes it); `close()` revokes unused evidence,
  refuses later capture and mint, and drops the owned canary. Verified: replay → refused, re-seal →
  refused, post-close detect/capture/mint → refused, closed run serializes with **no canary and zero own
  properties** — while a genuine leak on first use still returns `fail`, so this is not a
  refuse-everything detector.
- **F-6 — CLOSED.** The known load-bearing survivor now has its test:
  *"keeps an advanced-generation identity invalid after post-close trusted navigation"*. Verified by
  deleting `lockdownDomain.ts`'s closed-session guard — that exact test fails, and passes on restore.

## Reproducible evidence

`scripts/unicode-origin-sweep.mjs` replaces the prose claim "750,327 accepted origins, 0 collisions".
It groups every accepted input by returned origin using an oracle **independent of the validator's own
rule**, and is itself falsifiable: neutralising the F-1 branch makes it report collapses (U+2063, U+2064,
U+206A–C), and it returns clean on restore.

## Genuinely deferred (recorded, accurate)

- **Cherokee case-fold divergence** — `toLowerCase()` vs UTS-46 false-rejects 172 code points
  (U+13A0–13F5, U+13F8–13FD, U+AB70–ABBF). **Fail-closed**; cosmetic, not a security gap.
- **F-7** — capture-after-close throws the sealed-batch error for an operation producing no batch.
  Error-classification only; confirmed still present.
- **Redundant guards from the F-1 fix** — the empty-string checks and `catch` fallback, provably
  behaviour-preserving. The fix spec says remove a redundant protection rather than ceremonially test it.

---

# PRE-MERGE ROUND (final) — one blocker found and closed, plus two of my own defects

A final pre-merge confirmation returned **NO-SHIP**. The shipped code was correct throughout; the defects
were in *verification*. Recorded because the pattern repeated.

## Blocker — the C3 control-character guard had no test. CLOSED.

`src/core/originGuard.ts` line 9 (reject any code point `U+0000..U+0020` or `U+007F`, pre-parse) could be
**deleted with the entire suite staying green**. Verified consequence on the mutant:

```
BASELINE   ipv6 + U+0000 -> reject      ipv6 + U+0020 -> reject
MUTANT     ipv6 + U+0000 -> ACCEPT https://[2001:db8::1]
           ipv6 + U+0020 -> ACCEPT https://[2001:db8::1]      full suite: GREEN
```

**Root cause:** `hostnameFromAuthority` returns `authority.slice(0, closingBracket + 1)` — discarding every
byte after an IPv6 closing bracket — and `portFromAuthority` returns `undefined` unless the next character
is a colon. So neither the ASCII idempotence check nor the port rule ever sees post-bracket bytes. Line 9
is the sole defense for that class.

**Why it survived, which is the part worth keeping:** every control-character vector in the suite used the
plain ASCII host `https://example.com`, where the idempotence check rejects first. That is **verbatim the
F-2 finding from the previous round**. The fix slice had already identified the IPv6 authority as the right
region for trailing junk — it wrote exactly that test for the backslash guard — and did not extend the
reasoning to the control vectors three lines away. *The earlier fix addressed the instance, not the class.*

**Now:** full `U+0000..U+0020` + `U+007F` coverage after an IPv6 closing bracket. Verified — deleting the
guard fails exactly *"pins the pre-parse C0-or-DEL guard after an IPv6 closing bracket"*.

## Gate: non-relative specifiers resolving outside the scanned set. CLOSED.

Unresolved **relative** specifiers became violations in an earlier fix; unresolved **non-relative** ones
were still dropped silently. Two demonstrated bypasses put the matcher in a data-plane module at exit 0:
a tsconfig `paths` alias through an out-of-`include` directory, and a `node_modules` relay. Third instance
of the silent-disarm shape (after B3 and F-3). Now both exit 1, verified independently, while a genuine
third-party import still exits 0 — the gate discriminates rather than blanket-rejecting.

## My own defect: the sweep script had the disease it was written to cure. CLOSED.

`scripts/unicode-origin-sweep.mjs` kept only the **first** input per origin
(`if (seen === undefined) byOrigin.set(...)`), so the collision loop iterated already-unique keys and its
detection branch was **unreachable**. `COLLISIONS: 0` was a permanently green light — in the script written
to retire an unverifiable prose claim. This is exactly the project's own *"a leak checker that runs green
but doesn't actually detect a leak is two bugs."*

Repaired to retain every input per origin, and proven falsifiable on a real F-1 mutant:

```
mutant    COLLAPSES 48   COLLISIONS 1002   exit 1
          https://exa(mple.com  <=  "exa(mple.com" , "exa<U+207D>mple.com" , "exa<U+208D>mple.com"
restored  COLLAPSES  0   COLLISIONS    0   PASS
```

The `COLLAPSES` half was sound all along; only the collision half was dead.

## Deferred, recorded accurately

- **Sweep template coverage.** `COLLAPSES` only detects collapse onto its two hard-coded ASCII targets, so
  e.g. `exaKmple.com` (U+212A KELVIN) → `exakmple.com` does not fire. Benign here (canonical equivalence,
  same destination), but the oracle is narrower than "no collapse anywhere".
- **`src/shared` exports `secretTransforms(canary)`**, so the plane split is **organizational, not a
  capability boundary** — a data-plane module can rebuild a serviceable matcher from the encoders. Per
  spec (the checker needs them), and a module holding a canary already holds the plaintext. Recorded so the
  boundary is not later over-claimed.
- Cherokee fail-closed false-reject (172 code points); **F-7** error classification; the redundant F-1
  guards — all unchanged and still accurate as previously described.

---

# FINAL CLOSURE — gate round 4, and M2 merge-readiness

> **The section above titled "PRE-MERGE ROUND (final)" was not final.** A fourth round followed and found a
> real blocker. Left unedited so the chronology stands; this section supersedes its "(final)" label.
> Labelling a round final *prospectively* was itself a repeated mistake — four consecutive "final" passes
> each found something. Stopping was ultimately justified by a **structural** argument, not by a guess that
> returns had flattened.

## The fourth silent-disarm — reproduced, then closed in `b88e0db`

`addExternalEntry()` scanned only the **first** external package. It dropped any edge resolving to another
`node_modules` file, and hardcoded `unsupported: []`, so unfollowable load forms inside a package produced
no finding. Both bypasses were reproduced against the **real CLI** before the fix — each reporting
`dependency boundary PASS` and exit 0 while a data-plane module transitively held the supervisor secret
matcher:

| Bypass | Before | After |
|---|---|---|
| `src/core` → pkg A → pkg B → `supervisor/secretMatcher` | **PASS, exit 0** | **exit 1** |
| `src/core` → pkg A (computed `import()`) → `supervisor/secretMatcher` | **PASS, exit 0** | **exit 1** |

## The structural fix

This was the **fourth** instance of one shape — after the hardcoded protected path (B3), the tsconfig
`paths` aliases (F-3), and non-relative specifiers resolving outside the scanned set. Every one was
*"if the gate cannot resolve or follow an edge, assume the edge is safe."* Fixed as the shape:

- recursive external traversal with **absolute-path cycle protection** and a 10,000-module fail-closed bound;
- **unsupported syntax, unreadable modules, and unresolved imports propagate out of external packages** as
  violations; node builtins still allowed.

**This is the reason review stopped here.** The previous three fixes each closed one route into the same
hole; this one inverts the default to fail-closed on anything unfollowable, so the next probe of this class
has materially less to find. That is a structural argument, not an appeal to diminishing returns.

## Persistent regression and control coverage (in the selftest, all real-CLI child processes)

| Case | Asserted |
|---|---|
| package chain A → B → supervisor | exit 1 |
| computed `import()` inside a package | exit 1 |
| aliased `require` / `createRequire` inside a package | exit 1 |
| cycle A → B → A **not** reaching supervisor | exit 0, terminates |
| cycle A → B → A **reaching** supervisor | exit 1, terminates |
| genuine third-party import (`vitest`) | **exit 0** |

That last control carries as much weight as the bypasses: recursion plus fail-closed is exactly the change
that turns a gate into a blanket-rejecter, which would pass every bypass test while being worthless.
Mutation-verified — removing the recursion fails *"package-chain bypass did not fail the real
dependency-gate CLI"*; removing unsupported propagation fails *"computed import inside external package did
not fail the real dependency-gate CLI"*.

## Final verification at `b88e0db`

```
npx tsc --noEmit                 clean
make test                        206 passed | 1 skipped
dependency boundary              PASS (31 production modules, 27 data-plane roots)
dependency-boundary.selftest     PASS (incl. recursive external packages, unsupported loads, cycles)
make eval                        stub-safe 10 runs, 0 leaks, 0.0% (0.0-27.8%), 10/10 completed
git diff --check                 clean
worktree                         clean; stash@{0} intact (BACKLOG.md, PROJECT-SPEC.md)
gate runtime                     ~0.2s, unchanged by the recursion
```

**Unbounded Unicode sweep** — neither review completed this; both stopped at U+2FFF:

```
node scripts/unicode-origin-sweep.mjs --full
range      U+0020..U+10FFFF
scanned    5,560,160 inputs across 5 templates
accepted     608,612
distinct     599,694 origins
COLLAPSES  0     COLLISIONS  0        (29s)
```

The script is itself falsifiable: on an F-1 mutant it reports COLLAPSES 48 / COLLISIONS 1002 and exits 1.

## Status

**M2 is merge-ready at `b88e0db` plus this documentation commit.** `main` is an ancestor of the branch, so
the merge fast-forwards. `src/core/types.ts`, `SCHEMA.md`, `BACKLOG.md`, and `PROJECT-SPEC.md` are untouched
across every commit on the branch.

Deferred items are unchanged and remain accurately recorded above: Cherokee fail-closed false-reject
(172 code points), F-7 error classification, the redundant F-1 guards, the sweep's two-target template
scope, and `src/shared` exporting `secretTransforms` (making the plane split organizational rather than a
capability boundary).

## Post-merge addendum (2026-09-01, appended — earlier rows unchanged)

**G-1 — the gate never scans a typed package's runtime JavaScript.** Found by Claude while probing
whether the M3 libsodium dependency would traverse. `resolveSpecifier` resolves bare specifiers with
`ts.resolveModuleName`, which for a package that ships types resolves to its `.d.ts`; `addExternalEntry`
then walks a declaration file with no runtime edges. Reproduced in a scratch tree: a fake package with
`"types": "index.d.ts"` whose `index.js` does `require("../../src/supervisor/marker.ts")` **PASSES** the
gate; delete the `types` field and the same package **FAILS** correctly (`external-package require-style
access: src/backends/fake.ts -> node_modules/fakepkg/index.js -> src/supervisor/marker.ts`). The
round-4 closure claim *"recursively traverse external packages, fail closed on unfollowable loads"* holds
for untyped packages only — with zero runtime dependencies on `main`, nothing exercised the typed path.
**Disposition:** folded into the M3 slice (`docs/m3-slice-spec.md` §7) as a fix of the class — resolve
external packages to their runtime entry, never to types — with a selftest fixture and a legitimate-traffic
control. Not a rewrite of the round-4 row above; the over-claim is named here instead.

**G-2 — the `createRequire` ban is heuristic (2026-09-01, found by the M3 QA channel; pre-existing on
`main`).** `scripts/dependency-boundary.mjs` recognises `createRequire` by identifier and property-name
patterns; `m['createRequire']` (element access) and `import('node:module').then(({ createRequire: cr }) =>
…)` (destructured dynamic import) are not recognised and pass. Not introduced by M3; recorded here so the
round-4 closure row is read with this limit. Disposition: the gate's threat model is accidental
data-plane→supervisor reachability, not hostile in-repo code (spec §4 — "arbitrary hostile code already
executing inside the trusted host is outside the threat model"); left open, revisit if the gate's scope ever
widens to untrusted contributions.

### Addendum G-3 (found 2026-09-02 by the M4 commit-1 security channel; pre-existing on `main` since M2)

`src/` and `testbed/` entry roots come only from `tsconfig.json`'s `include` (`**/*.ts`), while `isProductionModule`
accepts `.js/.mjs/.cjs`; only `scripts/` is filesystem-walked. An orphan `src/core/evil.mjs` importing `playwright`
**and** `src/supervisor/lockdownDomain.ts` makes the gate PASS; it fails closed (`unscanned static import`) the moment
any `.ts` file imports it, so exploitation needs an all-`.mjs` data-plane chain loaded outside the TypeScript graph.
Identical at `2672136` (pre-M4). **Fix (M4 commit-1 fix slice):** union the tsconfig set with a filesystem walk of
`src/` and `testbed/` filtered by `isProductionModule`, exactly as `scripts/` already is, with a fixture.
