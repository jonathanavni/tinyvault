# M2 Slice Spec — Security Primitives (Codex implementation handoff)

> **Status: revision 4 — IMPLEMENTATION-READY. The paper-review ladder is CLOSED at its round-3 cap; do not
> request another paper review.** Rounds 1/2/3 returned NO-SHIP / NEEDS-ATTENTION / NO-SHIP; all 22 findings
> are absorbed. Round 3's findings #1, #3 and #6 all said the same thing — *this cannot be settled on paper*
> — so per `handoff-pattern.md` §5 the mechanism was redesigned (types → build-time boundary + runtime
> attestation) and validation moves to code. The post-implementation ladder (`/review` →
> `/security-review` → Codex adversarial diff) is where the dependency boundary, runtime attestation,
> cleanup behavior, and absence-detection tests get verified.
> Governed by [`phase-0-plan.md`](phase-0-plan.md) §4, §8 (M2/M3/M4 rows), §9.1, §2, and `SCHEMA.md`.

## Task

Implement M2: the six security primitives, **unit-testable in isolation with no browser**, plus the M2 slice
of the never-cache-the-secret invariant (B1 slice 1/3).

## Branch / Worktree

Work in: `codex/m2-primitives`
Base from: current `main` head (verify with `git rev-parse main` at branch time)
Do not modify unrelated files.

## What changed from revision 3, and why (read first)

Round 3 blocked revision 3. The three structural fixes:

1. **The tripwire seam is no longer type-enforced — that approach was abandoned as unsound.** TypeScript
   cannot encode "only after caller-facing work completes" or "not reachable from this call path": a
   function taking a sealed batch can still be imported and called synchronously, or wrapped. Three rounds
   circled this because each fix was a *wording* fix. Replaced by a build-time dependency rule + physically
   separated module zones + runtime attestation (below).
2. **Branded types alone were overclaimed.** `as unknown as`, `any`, `JSON.parse`, spread/clone and stray
   minting helpers all launder a structural brand, and type erasure leaves no runtime provenance. Branding
   stays as cheap friction; **runtime attestation via a module-private `WeakMap` is the actual control.**
3. **B1 was product-breaking as written** (round-3 #2, the sharpest catch of the ladder). TinyVault owns the
   browser context, so "retain no plaintext" plus a demanded page-realm cleanup forced you to either wipe
   the password field before the caller could submit — breaking the product — or violate the invariant. B1
   now spans **three explicitly separated lifetimes**.

## Required Reading

- `CLAUDE.md`
- `PLAN.md` — **Current State only** (do not read or edit the Decisions Log)
- `docs/phase-0-plan.md` — **§4** (layers 1–3, the three lifetimes, probe P, transform inventory), **§2**,
  **§8** (M2/M3/M4 rows), **§9.1**
- `src/core/types.ts`, `SCHEMA.md` — the locked contracts
- `testbed/checkers/leakScan.ts` — `SECRET_TRANSFORM_NAMES` is the **canonical transform inventory**
- `.claude/memory/conventions.md`

## Context

- TinyVault's thesis is *measure, don't assert*. A claim the language cannot support is worse than no claim.
- **M0** (contracts) and **M1** (eval spine) are on `main`; `make eval` runs offline; 81 tests green.
  **There is no fill service yet** — no browser, no DOM, no Playwright in this slice.
- **Vacuous tests are the named failure mode of this project.** M0's review caught `make test` running
  `vitest run` without type-checking. Round 1 caught a noninterference test any constructor would pass.
  Round 3 caught that the B1 suite could pass with the plaintext still sitting in a private field. A test
  that cannot fail reads as coverage and is worse than an absent one.

## Scope

### 1. `redaction.ts` — `Secret<string>`

Value-producing routes (`String()`, template coercion, `toString`, `toJSON`/`JSON.stringify`,
`util.inspect`/`inspect.custom`, `console.log`) yield `"[REDACTED]"`. Structure-producing routes
(`Object.keys`/`entries`, spread, `getOwnPropertyNames`, `Reflect.ownKeys`, descriptors) expose **no
secret-bearing state**. One accessor, `expose()`. Idempotent `clear()`, one-shot `consume()`; afterward the
wrapper holds no reference and further exposure fails with **one fixed, secret-independent error**.

**The claim, exactly** — do not strengthen it in code comments or tests: *after clear, no plaintext is
reachable through TinyVault's owned data-plane state.* Not memory zeroization; strings are immutable, V8 may
retain copies, and an alias already returned by `expose()` **cannot be revoked**.

### 2. `originGuard.ts` — bare-origin validator

`http:`/`https:` only. Normative table in **Appendix A** — implement to it exactly.

### 3. `lockdown.ts` — taint/lockdown registry

Provenance-keyed, never content-keyed; the API **never accepts content**. Identities are **trusted-host
minted capability tokens**: a branded type *plus* module-private runtime attestation (same `WeakMap`
mechanism as §6). Composition is (session, document, frame, element) with stated equality and generation
rules. **No generic `unlock`** — clearing only via trusted lifecycle operations
(clear-on-trusted-top-level-navigation, clear-on-session-close), per §4 layer 2.

### 4. `sessionMutex.ts` — per-session mutex

Non-reentrant `runExclusive(session, fn)`; same-session nested acquisition **fails fast** with a fixed
internal error. `OPEN → CLOSING → CLOSED`. Close rejects new and queued work with a fixed outcome, lets the
**current holder finish cleanly**, then deletes state. Close and release idempotent; a late release cannot
resurrect state. Internal mechanism and error wording are your judgment; the observable semantics are not.

### 5. `results.ts` — exact result constructors (structural confinement)

Exact signatures taking only named public provenance; `filled` copied solely from caller-requested roles with
pinned ordering/dedup; closed reason/error sets with fixed text; no context/error/secret parameters. *(The
differing-value/length differential is **M4's** — it cannot be meaningfully written here.)*

### 6. `tripwire.ts` — detector + attestation seam (NO wiring)

Pure transform-aware detector over the canonical inventory (**Appendix B**). Seam shape: **sealed batch in →
verdict + fixed-shape diagnostics out**. **No callback-style sink and no match-dependent hook anywhere in
the caller path.** Enforcement is three controls, none of them a type annotation:

- **Build-time dependency rule** — production data-plane modules have **no dependency path** to the
  supervisor/evaluator or the batch-mint authority. The gate must cover **static imports, re-exports,
  dynamic `import()`, and `require`-style access**, and must **fail the build**, not warn. Wire it into
  `make test`.
- **Physically separated module zones** — supervisor/control-plane code in its own directory zone, distinct
  from data-plane code, so the dependency direction is visible in the tree.
- **Runtime attestation via a module-private `WeakMap`** — keyed by a token object only the mint authority
  creates; the map holds the sealed payload privately. Tokens are **run-bound and single-use**. Unattested,
  cloned, serialized, stale, cross-run, and replayed batches are **rejected at runtime**.

**State the claim exactly as follows** (round-3 #1 — do not strengthen it): *under the checked production
module graph, caller-facing data-plane modules have no dependency path to the supervisor evaluator or
batch-mint authority; unattested, cloned, serialized, stale, cross-run, and replayed batches are rejected at
runtime.* TypeScript does **not** make the seam universally uncallable. Arbitrary hostile code already
executing in the trusted host is **outside the threat model**.

**M2 proves the mechanism and exposes no callback API. M4 proves the real fill/browser module graph obeys
the boundary** — those modules do not exist yet.

### B1 — the three lifetimes (M2 owns only the first)

| Lifetime | What | Cleared by | In B1's claim? |
|---|---|---|---|
| **Transient host state** | `Secret`, inject args, closures, host refs | `finally`, before mutex release | **Yes — this is B1** |
| **Authorized destination state** | plaintext in the verified password field, so submission can happen | trusted top-level navigation or session close; taint-masked meanwhile | **No — explicitly carved out** |
| **Evaluator state** | scoped canary lease | when sealed evidence is adjudicated | **No** |

Refusal or any pre-assignment failure must place **no** plaintext in the DOM. We do **not** claim TinyVault
can erase copies the authorized origin retains — accepted residual risk, not a gap. **M2 implements only the
transient-host-state half**; the DOM half is M4's and needs no browser code here.

### Do not implement

- Anything touching a browser, DOM, Playwright, CDP, or a live origin.
- Tripwire **wiring** into `make eval`; sealed-evidence lifecycle — **M4**.
- The results noninterference differential — **M4**. `fillService`, inject primitive, TOCTOU recheck — **M4**.
- Backend interface / `resolveSecret` — **M3**. B1 rotation A→B — **M4**.
- Fragment reassembly (checker-only). Any change to `testbed/`, the schema, or the checkers. M1 refactors.

## File Ownership

Codex owns `src/core/{redaction,originGuard,lockdown,sessionMutex,results,tripwire}.ts` + colocated tests,
the supervisor-zone module(s) the split requires, and the build-gate config.

Must avoid: `PLAN.md`, `.claude/memory/*`, `docs/*`, `testbed/*`, `src/agents/*`, `README.md`, `SCHEMA.md`,
`src/core/types.ts`.

## Acceptance Criteria

- **`Secret` lifecycle:** repeated exposure; `consume` vs `clear`; double-clear; exposure after clear (fixed
  error bytes); every coercion and enumeration route before *and* after clear; symbol/prototype/descriptor
  inspection; thrown-error paths.
- **B1 honesty (round-3 #6):** the tests prove **post-clear API inaccessibility**. They do **not** prove
  non-retention — an implementation can set `cleared = true` and leave the string in a private field. So
  either add a **mutation test that fails when the owned value is retained after clear**, or state plainly
  in the test file that non-retention is verified by structural review of the single owned cell, not by
  these tests. Do not report B1 as proved by API tests alone.
- **Origin:** the complete Appendix A table, accept and reject.
- **`results.ts`:** exact own-key sets and serialized bytes per constructor, plus `@ts-expect-error`
  negatives for secret arguments, secret-bearing fields, and extra properties.
- **Mutex:** active-owner ordering; multiple queued ops; rejection and throw; nested acquisition; close while
  active; close with queued waiters; repeated close; late release.
- **Lockdown + attestation (round-3 #3) — runtime negatives, not just a compile-time one:** reject plain
  objects, `as any` / `as unknown as` laundering, spread/clone, JSON round-trips, stale tokens, cross-run
  tokens, and replayed tokens. A passing compile-time negative alone leaves runtime forgery trivial.
- **Dependency boundary:** a test proving the build gate **fails** when a data-plane module is made to import
  the supervisor/mint authority — via static import, re-export, dynamic `import()`, and `require`. A gate
  that has never been observed failing is not a gate.
- **Tripwire detector:** Appendix B vectors; each transform must fail independently if deleted; plus
  false-positive controls and mixed-provenance inputs it must **refuse to inspect**.
- **Absence-detection, named not generic:** for each primitive, state the exact protection mutation the test
  detects. "At least one test" is satisfiable by a superficial mutation.

## Verification Commands

```bash
make test
```

`tsc --noEmit && vitest run`, plus the new dependency gate. `make eval` stays green and unchanged.

## Appendix A — normative origin table (implement exactly)

| Input | Result |
|---|---|
| `https://example.com` | accept → `https://example.com` |
| `http://example.com` | accept → `http://example.com` |
| `https://example.com:8443` | accept → `https://example.com:8443` |
| `https://example.com:443` | accept → `https://example.com` (default port removed) |
| `http://example.com:80` | accept → `http://example.com` (default port removed) |
| `https://EXAMPLE.com` / `HTTPS://example.com` | accept → `https://example.com` (lowercased) |
| `https://ex√§mple.com` | accept → `https://xn--exmple-cua.com` (IDN → punycode) |
| `https://[2001:db8::1]:8443` | accept → `https://[2001:db8::1]:8443` (compressed, lowercase) |
| `https://example.com/` | **reject** — trailing slash |
| `https://example.com/path` · `?q` · `#f` | **reject** — path / query / fragment |
| `https://example.com?` · `https://example.com#` | **reject** — empty delimiter still a delimiter |
| `https://user:pw@example.com` | **reject** — userinfo |
| `https://example.com.` | **reject** — trailing dot host |
| `ftp://example.com` · `file://…` · `data:…` · custom scheme | **reject** — HTTP(S) only |
| `https://example.com:0` · `:99999` · `:` (empty port) | **reject** |
| `" https://example.com "` (surrounding whitespace) | **reject** — reject *before* parsing, do not trim |
| `https://exa mple.com` (internal whitespace) | **reject** |
| `https://exa%20mple.com` (encoded host char) | **reject** |
| `https://192.168.001.1` (non-canonical IPv4) | **reject** |
| `example.com` (no scheme) · `""` · `"   "` | **reject** |

Two inputs normalizing to the same output are the **same** origin; equality is on normalized form.

## Appendix B — transform corpus

**The inventory is canonical in code**: `testbed/checkers/leakScan.ts` → `SECRET_TRANSFORM_NAMES`. Match it
exactly — a fourth prose copy would just drift. It is currently: `raw`, `base64`, **`base64url-unpadded`**,
`base32`, `hex`, `percent`, `json-escape`, `reversed`, `whitespace-split`. Revision 3 omitted
`base64url-unpadded`; an implementation built to that prose would have shipped one transform short of the
checker (round-3 #4).

**Author expected vectors independently of your detector** — compute them by hand or with a distinct method,
never by calling your own transform — otherwise the test proves only self-consistency. Pin, per transform:
base32 padding and case (M1's fixture emits **uppercase, unpadded**); hex case; percent-encoding case
**including selective escaping** (e.g. `TVC%5f…` — the evasion M1 already closed); JSON escape forms;
whitespace-split shape. Do **not** change checker behavior; if your independently-derived vectors disagree
with the checker's, **stop and report** — that is a real conflict, not a merge task.

## Contract conflicts — STOP, do not guess

`src/core/types.ts` and `SCHEMA.md` are locked. If M2 needs either changed, **stop and report**. Precedent:
mid-M1 Codex stopped when `AttackClass` had no value for the benign control run, and the kickback produced a
clean amendment instead of a corrupted leak-rate table. This slice's own three review rounds did the same at
plan level. The path works — use it.

## Review sequence (§9.1)

On the pending branch while the diff exists: **1.** Claude `/review` · **2.** Claude `/security-review` ·
**3.** Codex adversarial diff review. Because **Codex implements M2**, Claude's two passes are the
**different-family** channels; the Codex post-impl pass is fresh-context and adversarial but **same-family**
as the implementer. None certifies M2; each is additive. Where a review and a test disagree, **the locked
invariant is authoritative, not either mechanism.**

These reviews will specifically verify the dependency boundary, runtime attestation, cleanup behavior, and
absence-detection tests **against real code** — that is why the paper ladder was closed rather than extended.

## Honest-claims rule

No claim the language or the test cannot support. Specifically: no zeroization or erasure-from-memory claims;
no "identical timing" (probe P **bounds**, it does not prove); no claim that types make the seam uncallable;
no claim M2 proves DOM masking or `make eval` failure. Where a guarantee is structural rather than absolute,
say which — in code comments and test names as well as reports.

## Reporting

`handoff-pattern.md` §13: Summary / Files Changed / Verification / Risks & Follow-ups / **Deviations From
Handoff**.
