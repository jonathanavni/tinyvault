# M3 Post-Implementation Review — Consolidated Findings Register

Branch `codex/m3-backend` @ `3da198f` (two commits: `bba7170` gate fix, `3da198f` backend). All three
§9.1 channels ran on the identical committed diff, in parallel. **Register is append-only** (conventions):
closure claims that turn out wrong get a correction row, never an edit.

| Channel | Family (relative to implementer = Codex) | Verdict |
|---|---|---|
| Codex adversarial diff | same (fresh-context) | **NO-SHIP** — 3 findings; its sandbox ran **zero** vitest/selftest tests (static findings only) |
| Claude `/review` (QA, isolated worktree) | **different** | **NO-SHIP** — 2 core + 8 P3; **16 mutations applied, 15 killed by the named test**, 1 equivalent mutant |
| Claude security review (isolated worktree) | **different** | **NEEDS-ATTENTION** — 2 P2 + 4 P3, every item REPRODUCED with a probe; 11-case backend probe suite held |

None certifies M3 (`handoff-pattern.md` §7.1). The suite was run by Claude on the real tree throughout:
`npm test` → gate PASS (36 modules), selftest PASS (11 fixtures / 48 outcomes), vitest 323 passed.

## A. Convergent (all three channels) — fix before merge

### A1 — AEAD additional data is built from the caller's argument, not the validated record. **P1**
`src/backends/localFile.ts:141-145` · Codex #1, QA P2, security P2 (reproduced).

Locked spec D2/D4 (r3 #1, r4): compare the parsed record's policy to `authorizedPolicy`, then `open()` with
AD from **that same record snapshot**. The code passes `authorizedPolicy` to `encodeAdditionalData`, so
the compare and the encoder read caller-controlled state twice. Codex judged this fail-closed (denial).
**The security channel showed it is not:** a policy whose reads are unstable — a getter, or a `Proxy` over
the recipe (`Array.isArray(proxy)` is `true`) — presents the file's *edited* metadata to the compare and the
*sealed* metadata to the AD; after a metadata-only edit the secret is **RELEASED** (`opens = 1`,
`originReads = 2`). That is precisely the r3 #1 failure the compare exists to close. Not reachable by the
in-scope adversary (M4 passes back the frozen object `resolvePolicy` returned), which is why the two Claude
channels rated it P2; **the register rates it P1 because a locked mechanism is defeated and the test at
`localFile.test.ts:409-435` enforces the wrong behavior** — it was written to the r1/r2 history text
("AD from the argument"), not to D2 as locked. QA mutation (h): switching to the record source fails only
that test; the other 73 pass. Both Claude reviewers verified the one-line fix flips the probes to
`integrity`.

**Fix:** `encodeAdditionalData(handle, record)`; invert test 409 (a getter/Proxy policy that passes the
compare on its first read must yield `integrity`, and the AD bytes must equal the record-derived golden
vector); add the two security probes as regression tests; assert each `authorizedPolicy` field is read
exactly once and never after the compare.

### A2 — Script-importer external edges escape traversal (laundering bypass). **P1**
`scripts/dependency-boundary.mjs:40-51, 115-117` · Codex #2, QA P1, security P2 — reproduced by all three
and by the integrator (`src/core/_probe.ts → scripts/_probe/bridge.mjs → node_modules/_launder →
src/supervisor/lockdownDomain.ts` → gate **PASS**; `main`'s gate FAILS the same fixture).

External traversal starts only when the importer is in `configuredFileSet`; for a `scripts/` importer the
edge is neither traversed nor marked `unscanned`, and the BFS reaches a node with no graph entry and
**silently stops**. Production modules are not forbidden from importing `scripts/`, so the chain above
passes. **Root cause (QA Probe F, security):** Node-runtime resolution now follows `typescript`'s real
`lib/typescript.js`, which contains a non-literal `require` and an unresolvable `source-map-support` edge,
so the gate's own `import ts from 'typescript'` fails closed. Spec §7's rule for that case was "stop and
report — exempting a vetted dependency is a planning decision"; instead a blanket exemption of every
`scripts/` external edge shipped in a code comment, with **no Deviations-From-Handoff entry**. It violates
the M2 standing rule (fail closed on anything unfollowable) and §7's "over-approximation, never
under-approximation".

**Fix (the class):** build graph nodes for every reachable external target regardless of importer, and
treat a BFS target with no graph node as an `unscanned` violation; **forbid production→`scripts/` edges
outright**; for **scripts-rooted** entries only, tolerate unscanned/unsupported *external-package* loads
(the toolchain) while still reporting any reach into a protected directory; selftest fixtures for the
laundering chain (FAIL), its `src/core` control (FAIL), `scripts → typescript` (PASS), and a
real-installed-package legitimate-traffic control (`libsodium-wrappers`, restoring what the deleted
`typescript` link control provided).

## B. Single-channel, verified — fix in the same slice

- **B1 — `ItemMeta` expectations not independently authored. P2** (Codex #3) — `localFile.test.ts:32-80`
  takes expected handles from `writeLocalVault` output. Fix: fixed `randomHandle` seam bytes or hand-written
  vault JSON, and a hard-coded expected literal.
- **B2 — The flag is documented, not enforced. P3** (security, reproduced) — without
  `--experimental-import-meta-resolve` the parent argument is silently ignored, and on this tree the gate
  still prints PASS; dropping the flag from `package.json` is undetectable. Fix: a module-load self-check
  (`import.meta.resolve('./x.mjs', 'file:///nonexistent-parent/x.mjs')` must resolve under that parent, else
  throw) plus a selftest case that the gate refuses to run unflagged.
- **B3 — In-repo symlink alias into `src/supervisor` bypasses the protected rule. P3, pre-existing**
  (security, reproduced on `main` and branch) — `files`/`isProtected` classify by link path; realpath was
  added only for the root and externals. Fix: realpath every entry of `files` before building `fileSet`;
  symlink fixture.
- **B4 — `BackendError` has no runtime kind check. P3** (QA) — house style (`results.ts:46`) rejects unknown
  enum values; `new BackendError('x' as any)` yields `message === 'undefined'`. Fix + test.
- **B5 — Vacuous assertion. P3** (QA) — `localFileWriter.test.ts:167` "output file absent on seal failure"
  cannot fail under the stubbed fs. Fix: assert on the trace (no `open`/`rename` events).
- **B6 — `account: undefined` (explicit) rejected by the writer. P3** (security, reproduced) — TypeScript
  permits it for `account?: string`; sharp edge for M4 fixture authors. Fix: treat explicit `undefined` as
  absent.
- **B7 — Code-quality rule breaches. P3** (QA) — `resolveSecret` nests five `try` (six levels at `open()`;
  rule max 4); `writeLocalVault` 72 lines and `validateRecord` 56 (rule under 50); `FIELD_ROLES` and the
  recipe rules duplicated across `localFileFormat.ts` and `localFileWriter.ts`; `Awaitable<T>` declared
  three times. Fix: extract the key-scoped body into a helper preserving the nested `finally`s; split the two
  functions; one home for each duplicated definition.
- **B8 — Test gap: default `memzero` never exercised on a real `Buffer`** (security) — every cleanup test
  overrides `memzero` with `fill(0)`. Fix: one success-path test through `defaultSealingPrimitives` with
  references retained via the fs seam.

## C. Accepted deviations and continuity-owner amendments (no code change)

- **C1 — Per-syntax resolution, not the "union" §7 sentence.** (QA P3, security P3.) The implementation
  resolves each edge by its own syntax and fixtures 2/11 assert exactly that; the spec sentence "scan the
  union of the two resolved targets" was never implemented and is the *less* Node-accurate model. Amended
  in `docs/m3-slice-spec.md` §7 by the continuity owner (amend-and-relock over reverting, per conventions).
- **C2 — Seam exposes `randomKey()`/`randomHandle()` beyond the four listed primitives** (Codex's own stated
  deviation) — conservative: keeps every libsodium call in one module. Accepted.
- **C3 — Codex sandbox cannot write `.git`** — both commits were created by the integrator with dual
  co-author trailers; Codex was told to leave work uncommitted. Process, not code.

## D. Residuals (recorded, not fixed here)

- Non-`EEXIST` failure mid-write of the key file can leave a partial key (`localFileWriter.ts:73-78`) —
  note in module header.
- No directory `fsync` after `rename` (durability, not integrity; would change the exact-trace test).
- `createRequire` ban is heuristic: `m['createRequire']` and destructured dynamic `import('node:module')`
  bypass it — **pre-existing on `main`**, appended to the M2 register as G-2 (below). Native addons/WASM
  reached by the gate are parsed as opaque.
- `backend.ts:46` "conforming backends never retain a secret" is an interface contract not yet proven for a
  session-holding backend (M9) — tighten wording to "must not".
- `ENOTDIR` on the vault path reports `error` rather than `not_installed` — cosmetic.
- Accepted by spec: metadata cleartext at rest; rollback; no size cap; no KDF/rotation; no read-side
  permission enforcement; string plaintext and WASM-heap copies are not zeroed (and are not claimed to be).

## E. Verification evidence (Claude, real tree)

```
npm test                         tsc clean; gate PASS (36 modules, 32 roots); selftest PASS (11 fixtures / 48 outcomes); vitest 323 passed, 1 skipped
laundering repro (A2)            src/core/_probe.ts -> scripts/_probe/bridge.mjs -> node_modules/_launder -> src/supervisor  => branch gate PASS (bug); main gate FAIL
libsodium runtime traversal      node_modules/libsodium-wrappers/dist/modules-esm/libsodium-wrappers.mjs -> node_modules/libsodium/dist/modules-esm/libsodium.mjs (both channels instrumented it)
pre-fix demonstration (H)        new selftest vs main's gate: FAIL at fixture 1 (typed package with main), as required
QA mutation matrix               16 applied: 15 killed by the named test; (c1) equivalent mutant; (h) = A1
security backend probes          getter/Proxy policy after metadata edit: RELEASED (A1); shape matrix, zeroing with real memzero, native-error containment across 9 transforms, validator edge cases, fs trace, inspect/JSON: all held
contract drift                   git diff main HEAD -- src/core/types.ts SCHEMA.md : empty
```

## Status

**NOT merge-ready.** A1 and A2 block. Fix slice: `docs/m3-fix-slice-spec.md` (Codex implements on the same
branch; the three channels re-run on the fix diff).
