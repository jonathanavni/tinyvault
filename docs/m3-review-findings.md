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

---

# Round 2 — the fix diff `4f1b5be..d771bdf` (`1b15831` gate set, `d771bdf` backend set)

| Channel | Family | Verdict |
|---|---|---|
| Claude `/review` (QA, isolated worktree) | different | **NEEDS-ATTENTION** — A1/A2/B1–B8 all **CLOSED**; 21 mutations applied, 18 killed, 2 survived (test gaps), 1 equivalent; 12-case A2 CLI matrix all as required; 2 new P2, 3 P3 |
| Claude security review (isolated worktree) | different | **PASS** — A1/A2/B2/B3/B8 **CLOSED** with re-run probes (23 backend cases, 31 gate fixtures, 14 source mutations); 3 P3 |
| Codex adversarial diff (retry; first attempt died on model capacity) | same | **NO-SHIP** — A1 CLOSED, B1–B4/B6–B8 CLOSED, B5 MOVED, A2 held OPEN on two points (below); its sandbox again ran **zero** vitest/selftest tests |

**Register cross-walk (both Claude channels agree):** A1 CLOSED (`localFile.ts:196` `encodeAdditionalData(handle, record)`;
`policiesEqual` reads each field once; mutation "AD from argument" fails four tests `localFile.test.ts:446/475/509/536`;
the security probes — getter origin B-then-A, recipe `Proxy` `toJSON` — now yield `integrity` with 0 releases, and a
full-`Proxy` trap log across `resolveSecret` is exactly `['canonicalOrigin','fieldRecipe']` + `['length','0','1']`).
A2 CLOSED (traverse from every importer `dependency-boundary.mjs:51-53`; `production-to-tooling` `:59`; tolerance keyed
on the **entry root** `:406-410` — confirmed by the same package reached from a script and a data-plane root producing
one violation with `entry = src/core/probe.ts`). B1–B8 CLOSED with the killing tests named in the QA report.

## Round-2 findings (new, from the fixes)

- **R2-1 [P2] B3 moved a hole (QA, reproduced).** Files are classified by realpath only, so a symlink *inside*
  `src/supervisor` pointing outside (`src/supervisor/evil.ts → ../../outside/evil.ts`) is now unprotected; the
  pre-fix gate FAILED that fixture. Fix: protected = union of link path and real path; alias-out fixture + clean mirror.
- **R2-2 [P2] `src/backends/localFile.test.ts` is 843 lines (hard max 800) (QA).** The B7 fix created a breach of the
  same rule set. Fix: split `describe('policy binding and error ordering')` into a sibling file; shared helpers into a
  testkit module.
- **R2-3 [P3] Header/spec drift on the tolerance (QA).** The code also tolerates **unresolved** external-package
  edges, and that is load-bearing (`source-map-support` is unresolved, not unsupported); header and
  `m3-fix-slice-spec.md` §A2.4 say "unsupported/unscanned"; the header omits the production→`scripts/` rule.
- **R2-4 [P3] Gate nesting/length (QA).** `checkDependencyBoundary` 130 lines, 5 levels at `:122/:132`;
  `addExternalEntry` 69 lines (pre-existing). Fix: extract `walkEntry()` and `classifyEdge()`.
- **R2-5 [P3] `localFileWriter.test.ts:170` vacuous `stat` assertion survives** (QA) — delete.
- **R2-6 [P3] `production-to-tooling` is a direct-edge rule (security F1, reproduced).** An indirect reach
  `src → node_modules/p → scripts/tool.mjs` is not named as such; the BFS still continues through `scripts/` with zero
  tolerance so every protected reach is caught — rule text vs behavior only. Fix: move the check into the BFS edge loop
  (entry not under `scripts/`, target under `scripts/`) + indirect fixture.
- **R2-7 [P3] The B3 selftest fixture is killed by the edge-side realpath, not by `canonicalFile`** (security F2) —
  mutation "revert `canonicalFile` to `path.resolve`" survives; the comment over-attributes. Fix: reword, and add the
  alias-relative-import control that only file canonicalization distinguishes.
- **R2-8 [P3] `syntax.startsWith('external-package')` guard in `toleratesToolchainIssue` has no killing test**
  (security F3, reproduced): an in-repo `scripts/node_modules/helper.mjs` with a non-literal `import()` FAILS today and
  would be swallowed without the guard. Fix: that fixture.
- **Test gaps (both channels):** entry-root keying not pinned independently of the production-to-tooling rule (QA G2b
  survives: laundering fixture with a non-literal require must report an `external-package non-literal` violation whose
  `entry` is the data-plane root); writer recipe validation only exercises `[]` (duplicate/unknown roles untested;
  K5d survives); the selftest's own unflagged refusal has no automated check; `memzero` throwing on the **key** with the
  plaintext memzero succeeding is not pinned (ordering mutant); no test asserts the recipe compare reads only
  `length` + indices.
- **Equivalent mutants (accepted, defensive code):** the `node === undefined` fail-closed branch is unreachable by
  construction (every external target receives a graph node); `handle` vs `record.handle` at `localFile.ts:196` are
  `===` after `findRecord`.

- **R2-9 [P2→rule amendment] Unresolved external edges are tolerated for scripts-rooted entries (Codex).** Same
  observation as R2-3, framed as a violation of the two-tier rule as written ("unsupported/unscanned"). **Continuity-owner
  decision:** the tolerance is load-bearing (`typescript`'s optional `source-map-support` edge is *unresolved*, not
  unsupported), "unresolved" is one more kind of unfollowable toolchain load, and the data plane still tolerates nothing —
  so the **rule text is amended to "unsupported, unscanned, or unresolved external-package loads inside `node_modules`"**
  rather than adding a per-package exemption (fix the class, not the instance). Recorded in `m3-fix-slice-spec.md`
  round 3 and the gate header; a `scripts → package with unresolved import` fixture pins that the tolerance is scoped
  (PASS) and the data-plane mirror FAILS.
- **R2-10 [P2] A2 closure fixtures incomplete (Codex).** The scripts-rooted protected fixture never first triggers a
  tolerated issue, so an implementation that skips the rest of a tolerated package node passes; no fixture produces a
  reachable `unscanned` data-plane target. Fix: a scripts-rooted package combining a non-literal `require` **and** a
  literal protected edge (assert the protected violation specifically — QA matrix case 4 and the security probe both
  ran this by hand; it must live in the selftest); a data-plane fixture importing a file outside the tsconfig include
  (reachable, not in `fileSet`, not `node_modules`) asserting the exact `unscanned` violation.
- **R2-11 [P3] B5 moved (Codex).** The failure trace asserts only "no `open`/`rename`"; a direct `fs.writeFile` of
  partial output would pass. Fix: assert the exact failure trace (`['readFile']`).

## Round-2 residuals (state in the gate header)

A scripts-rooted BFS cannot see non-literal or unresolved loads *inside* a toolchain package — a malicious
`typescript`-shaped devDependency could reach protected code at build time undetected. Scripts are not the data plane;
accepted by the fix-slice contract (§A2 step 4). `walk` does not descend symlinked directories under `scripts/`
(pre-existing, tooling only). `isNodeModulesFile` is a path-segment heuristic.

## Round-2 status

**A1 is closed on every channel; A2 is closed on both different-family channels and held open by the same-family
channel on fixture completeness (R2-10) and rule wording (R2-9, amended). Not yet merge-ready:** R2-1 (regression),
R2-2 (hard rule), R2-10 block. Round 3 is the cap: one fix slice for R2-1…R2-11 + the test gaps, then a
confirmation pass by the integrator (suite + the named mutations), no fourth paper round.

---

# Round 3 (the cap) — fix diff `ab92688..6de0ad7` (`bf2001d` gate set, `6de0ad7` backend set)

Codex closed R2-1 … R2-11 and every listed test gap (its report cross-walks each to `file:line` + killing
test; this time its sandbox ran the suite: 339 passed). Per the cap there was no fourth review round;
instead the integrator ran the prescribed **confirmation pass on the committed tree** (mutation → suite →
revert, tree clean after each):

```
KILLED   R2-1  drop protectedRealPaths membership            (selftest exit 1)
KILLED   R2-6  disable transitive production-to-tooling      (selftest exit 1)
KILLED   R2-8  drop the external-package prefix guard        (selftest exit 1)
KILLED   R2-10b drop the edge.unscanned violation            (selftest exit 1)
KILLED   entry keying → blanket tolerance                    (selftest exit 1)
KILLED   A1    AD from the authorized policy (threaded through openRecordSecret/decryptRecord)
               → 5 tests fail in localFile.policy.test.ts (changing-policy AD, getter origin edit,
                 Proxy recipe edit, second read, JSON/string recipe compare)
KILLED   policy compare via JSON.stringify(fieldRecipe)      (vitest exit 1)
KILLED   writer constant nonce                               (vitest exit 1)
equivalent: `arguments[1]` inside decryptRecord IS the record — the policy is structurally out of scope
            there, which is the design working, not a gap
flag     gate unflagged exit 1; selftest unflagged exit 1
repro    laundering chain (src → scripts → package → supervisor) gate exit 1
repro    alias-out symlink (src/supervisor/evil.ts → ../../outside) gate exit 1
suite    tsc clean; gate PASS (36 modules, 32 roots); selftest PASS; vitest 339 passed, 1 skipped
limits   largest files: selftest 682, gate 456, localFile.test 385, policy.test 347 — all under 800
```

## Status

**M3 is merge-ready at `6de0ad7` plus this documentation commit.** `main` is an ancestor of the branch, so
the merge fast-forwards. `src/core/types.ts` and `SCHEMA.md` are untouched across every commit on the branch
(`git diff main..HEAD -- src/core/types.ts SCHEMA.md` is empty). Residuals stand as recorded in §D and the
round-2 residuals; none is load-bearing for M4.
