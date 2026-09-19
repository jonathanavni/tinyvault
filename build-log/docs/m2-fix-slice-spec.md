# M2 Fix Slice — Codex implementation handoff

> **Status:** repair slice for `codex/m2-primitives` @ `0684306`, which the post-implementation ladder
> returned **NO-SHIP / NEEDS-ATTENTION / NO-SHIP** on. Findings register:
> [`m2-review-findings.md`](m2-review-findings.md) — read it in full; it is the authoritative list and it
> marks which findings were *verified by execution* versus reasoned.
> Original contract: [`m2-slice-spec.md`](m2-slice-spec.md) revision 4. Still governed by
> [`phase-0-plan.md`](../../docs/phase-0-plan.md) §4, §8, §9.1 and `SCHEMA.md`.

## Task

Close every finding in §A (A1–A4) and §B (B1–B4) of the findings register, plus the §D mutation-test gaps,
plus the three scope amendments below. **M2 does not merge until the critical provenance bypass, the
lifecycle-capability issue, the dependency-gate blind spots, and the mutation survivors are demonstrably
closed.**

## Branch

Continue on `codex/m2-primitives`, base `a7c2e5e`. Do not rebase or amend existing commits.

**Do not touch `BACKLOG.md` or `PROJECT-SPEC.md`** — the user has uncommitted policy-dry-run edits held in
`stash@{0}`. They must not appear in any M2 commit.

**`docs/*` remains must-avoid.** If a contract needs amending, STOP and report; the continuity owner commits
it separately. (This was Codex adversarial finding #5 and it is now enforced by the split at `c453545`.)

## Why this slice exists

The round-3 paper ladder abandoned type-based enforcement as unsound and replaced it with a build-time
dependency boundary plus runtime attestation. The post-implementation reviews found **that replacement
mechanism is itself bypassable** — four blind spots in the gate, and a provenance bypass that reaches the
scanner. Shipping M2 as-is ships the exact hole the redesign existed to close. Everything below is in
service of that.

---

## 1. Tripwire boundary (findings A1, B1–B4, F2, F3)

### 1a. Move the detector into the supervisor zone

Move the tripwire detector **physically** to `src/supervisor/`. Then **delete the filename-based protected
module exception** in the gate so `isProtected` is the *directory rule alone*.

Root cause being fixed: §4 layer 3 control 2 requires physically separated zones "so the dependency
direction is visible in the tree and the gate has an unambiguous boundary to check." The detector currently
sits in the data-plane directory next to `redaction.ts` and is exempted by a hardcoded path string — so the
tree does not show the direction, and moving or splitting the file silently evaporates the boundary
(verified: `src/core/tripwire/index.ts` → 0 violations).

### 1b. Own the evidence — do not accept arbitrary structural objects at the mint boundary

**This is the critical finding.** Two verified bypasses (register A1):

- direct: `detectTripwire` reads `provenance` then `bytes` off the same live object; a self-flipping getter
  is scanned anyway;
- seam: record 0's `provenance` getter **relabels record 1** mid-`.some()`, so preflight passes and record
  1's bytes are sealed and matched.

Required shape:

- Evidence records are **minted inside the trusted capture authority**. The mint boundary must not accept
  caller-constructed structural evidence objects at all.
- Provenance and bytes live in **module-private storage**.
- Any validation **snapshots into owned frozen locals first**, validates the snapshot, and **scans only the
  snapshot**. Never re-read a caller-reachable property after validating it.
- Freezing a copy of a caller-supplied object is **not** sufficient — accessors and proxies defeat it.

### 1c. Dependency gate — close all four blind spots

- **Cover every compiled/executable production tree**, not only `src/`. Build the graph over the tsconfig
  `include` set plus `scripts/`. (`src/core/tripwire.ts` already imports `../../testbed/checkers/leakScan`,
  so cross-tree edges exist in the shipped graph today — see §3 below, which removes that particular edge,
  but the gate must not depend on that.)
- **Treat an unresolved relative import from a data-plane module as a violation**, not a silently dropped
  edge. A gate that cannot resolve an edge must fail, not assume it is safe.
- **Reject non-literal / computed dynamic imports and aliased `require`/`createRequire` usage from
  data-plane modules** rather than pretending arbitrary expressions can be resolved. Verified bypasses to
  close: `const t = '...'; import(t)`, `createRequire(import.meta.url)('...')`, `const r = require; r('...')`,
  and TS `import x = require('...')`.
- **Assert the gate exists and is armed:** every protected path must resolve to a real file; the scan must
  cover at least one data-plane root and report `files > 0`. An empty tree currently returns PASS with exit
  0, so a wrong `--root` disarms it silently.

### 1d. Prove the gate fails the build

**Spawn the real dependency-gate CLI as a child process** in the test suite. Assert **exit status 1** for
each violating fixture and **exit status 0** for a clean graph. The current selftest only calls the library
function, so deleting `process.exitCode = 1` leaves `make test` green — the packet's own "a gate that has
never been observed failing is not a gate."

Add a fixture per bypass route in 1c, and one whose protected target is the **detector** (that arm has never
been exercised).

---

## 2. Lockdown — capability separation (finding A2)

**Split registry operations from lifecycle clearing.**

- `LockdownRegistry` keeps only `lock` / `isLocked` / `isSameIdentity`.
- The two clears (`clearOnTrustedTopLevelNavigation`, `clearOnSessionClose`) move to a **separate lifecycle
  capability**.
- **The lifecycle capability must be held only by the trusted browser-navigation/session owner.** Returning
  the registry and the lifecycle object to the same general data-plane caller does **not** enforce
  separation and does not close the finding.

Why: `lock()` demands an attested `ControlIdentity`; the clear currently takes a **bare string**, so the
method name is the entire trust claim. For any registry holder that is a generic unlock, which §4 layer 2
forbids outright. The M4 consequence is concrete — the fill service must hold the registry to call
`isLocked()`, and any data-plane path reaching the clear drops taint on a password field *while plaintext is
still in it by design*, un-masking it in `browser_snapshot`.

**Milestone split:** **M2** proves the **registry surface cannot clear taint** (a capability test, not a
name check). **M4** proves actual lifecycle-capability ownership once a browser/session owner exists.

Replace `lockdown.test.ts:74` — asserting `'unlock' in registry === false` is a *name* check and passes for
a method called `release()` or `forceUnlock()`. Assert the exact reachable surface, the way `results.test.ts`
asserts exact own-key sets.

---

## 3. Shared transform/encoding module (findings F2, F3) — SCOPE AMENDMENT

The transform inventory and encoding utilities move into a **neutral shared production module** imported by
**both** the supervisor detector and the testbed checker.

- **Eliminate the production `src/` → `testbed/` dependency.** Production code must be packageable without
  the test tree.
- **Eliminate the duplicated `base32Encode`** (`tripwire.ts` currently carries a verbatim copy of the
  already-exported `testbed/canary.ts` implementation).
- **Preserve independently authored meta-gate vectors.** Sharing the *implementation* must not create an
  undetected common-mode failure: the meta-gate's expected vectors must remain authored independently of the
  shared code, so a bug in the shared transform cannot be validated by a test derived from it.
- **`testbed/` checker behavior must not change.** `make eval` must stay byte-identical in outcome.

> **This authorizes touching `testbed/` — narrowly, for this refactor only.** It is otherwise still
> off-limits. Do not alter checker semantics, the meta-gate, the scorecard schema, or any M1 test
> expectation. If the refactor cannot be done without a behavior change, STOP and report.

---

## 4. Session mutex (finding A3)

Fix the queued-path ownership bug: the owner set is read at **dispatch** time via `getStore()`, inside
whatever async context runs `#release` → `#dispatch`, not the acquirer's. Build the owner set in
`runExclusive` **before pushing the entry**, where the caller's context is already being read, and close
over it in `start()`.

Both verified failure directions must be closed:

- *under-inheritance* — a nested same-session re-acquisition **deadlocked instead of failing fast**;
- *over-inheritance* — an unrelated caller got a spurious reentrancy error from another party's owner set.

**Add mutation tests for the nested, queued, and A→B→A paths** — the existing test covers only the
uncontended nested case and cannot fail on the queued path.

---

## 5. Result constructors — runtime validation (finding A4)

- **Null-prototype or `Object.hasOwn` lookup for setup reasons.** `request_vault_setup` is a
  **model-callable** tool documented as "fixed template text only"; today `reason: '__proto__'` returns
  `Object.prototype` and `'constructor'` returns the `Object` constructor.
- **Runtime `FieldRole` validation/filtering** against a frozen three-value set, so `filled` cannot echo
  arbitrary caller strings of arbitrary length into a model-visible array.
- **Fixed, frozen, closed result shapes.**

Nothing here is secret-derived today — that part is sound. The defect is that confinement rests entirely on
erased types, which is the same reasoning round 3 used to reject branded-types-alone, not carried through.

---

## 6. Origin validation (findings C1–C4)

Reject:

- **hex, octal, and any non-canonical IPv4 form.** Verified accepts today: `0x7f000001`,
  `0x7f.0x0.0x0.0x1` → `127.0.0.1`; `0xc0a80101` → `192.168.1.1`. The `/^[0-9.]+$/` guard is a blocklist
  that structurally cannot see hex. Prefer an **idempotence check** — for pure-ASCII hosts require
  `raw.toLowerCase() === parsed.hostname`, else take the IDNA path. (Verified against all 9 Appendix A
  accept rows; also catches non-canonical IPv6 such as `[::ffff:127.0.0.1]`.)
- **backslashes** — `https://example.com\` is accepted today; backslash is a path separator for special
  schemes, so this is the trailing-slash reject row in disguise.
- **C0 controls and DEL** — any code point ≤ U+0020 or == U+007F **anywhere** in the input, rejected *before*
  parsing. The WHATWG parser strips trailing C0 and silently repairs a NUL-bearing string into a valid
  origin, defeating the table's "reject before parsing, do not trim" discipline.
- **encoded-host normalization tricks** such as `%2E` (`exa%2Emple.com` → `exa.mple.com` today).

**Port rule — adopt exactly this (it AMENDS Appendix A):**

- accept `0`, or a canonical non-zero decimal port **without leading zeros**;
- **reject** `:0443` and `:00080`;
- explicit canonical defaults `:443` / `:80` may be accepted and normalized away.

> Note: this **changes the Appendix A row** `https://example.com:0 → reject` to *accept*. Implement the rule
> as stated; the continuity owner will amend the table in a separate commit.

Add every missing adversarial vector, including the ones above and a `%2E` case that isolates the `%` guard
(the current `%20` vector does not — `new URL` rejects it independently).

---

## 7. Mutation / absence-detection tests (finding register §D)

Add a test for **every** surviving mutation listed in §D. **If a protection is redundant rather than
required, remove the protection and its claim instead of adding a ceremonial test.** Known redundancies
flagged by review: `Symbol.toPrimitive` (redundant with `toString`), `authority.endsWith(':')` (redundant
with the port-range check), `sameOrigin` (a one-line `===` alias with one call site — its own test).

Each new test must name the **exact protection mutation** it detects. "At least one test per primitive" is
satisfiable by a superficial mutation and is not what is being asked for.

Do **not** add a ceremonial test for `redaction.test.ts:90-94` — all three channels accepted its explicit
statement that API tests do not prove non-retention as the packet's permitted structural-review option.

---

## Verification (all must pass, all reported)

```bash
tsc --noEmit
make test
make eval
```

plus the dependency-gate mutation suite, including the **child-process exit-status** assertions from 1d.

Report, per finding ID from the register (A1–A4, B1–B4, C1–C4, D, F2, F3): closed / not closed / n-a, and
**how it was verified** — executed mutation vs reasoning. A finding claimed closed without an executed
check should say so.

## Contract conflicts — STOP, do not guess

`src/core/types.ts`, `SCHEMA.md`, and `docs/*` are locked to you. If the work requires changing any of them,
**stop and report**. This has now produced three clean amendments on this project rather than three silent
drifts.

## What happens next

A **focused post-implementation round 2** runs on the repaired diff. The paper-round cap does not waive
review of critical code fixes — it applied to the *design* ladder, not to verification of security-critical
repairs.
