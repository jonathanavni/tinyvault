# M3 Fix Slice — closing the post-implementation review register (Codex handoff)

> Governs one fix commit on `codex/m3-backend` after `3da198f`. Register: `docs/m3-review-findings.md`
> (read it first — every item below cites it). The locked slice spec `docs/m3-slice-spec.md` r4 still
> governs everything not amended here. Ladder: Codex implements; Claude `/review` + security review
> (different-family) and Codex adversarial (same-family) re-run on the fix diff (round 2, cap 3).

## Branch / commits

Continue on `codex/m3-backend`. **Two commits again, in order:** (1) gate items A2 + B2 + B3 (scripts and
selftest only); (2) backend items A1 + B1 + B4–B8 (`src/backends/**` only). Leave both **uncommitted and
unstaged** (the sandbox cannot write `.git`); the integrator commits with explicit paths. Run `npm test`
before reporting and paste the output; if any step runs zero tests in your sandbox, say so.

## Commit 1 — gate

### A2 (P1) — traverse externals from every node; forbid production→scripts; scripts-rooted toolchain tolerance
`scripts/dependency-boundary.mjs:40-51, 115-117`.
1. Build a graph node for **every** external target reachable from any importer (production or script).
   Delete the `configuredFileSet.has(file)` gating of `addExternalEntry` and of `unscanned`.
2. A BFS edge whose target has **no graph node** is an `unscanned` violation, never a silent stop.
3. **New rule: a production module (tsconfig-configured file) must not import anything under `scripts/`.**
   Violation syntax: `production-to-tooling <syntax>`.
4. **Scripts-rooted entries only** (entry file under `scripts/`): `unscanned` and `unsupported` results
   that occur **inside `node_modules`** are tolerated (the toolchain — `typescript` has a non-literal
   `require` and an unresolvable `source-map-support` edge); any reach into a protected directory, and any
   in-repo unsupported syntax, is still reported. Data-plane-rooted entries tolerate nothing. Document the
   two-tier rule in the script header, replacing the current comment at lines 47-48.
5. Selftest fixtures, each with the required outcome: laundering chain `src/core → scripts/x.mjs →
   node_modules/pkg → protected` → **FAIL** (`production-to-tooling` and/or protected reach — assert at
   least the protected reach is reported when the production→scripts rule is mutated away); the direct
   `src/core → node_modules/pkg → protected` control → FAIL; `scripts/tool.mjs → node_modules/pkg →
   protected` → **FAIL** (security fixture B); `scripts/tool.mjs → typescript` (real, linked) → **PASS**;
   `src/core → libsodium-wrappers` (real, linked) → **PASS** (restores a real-installed-package
   legitimate-traffic control). Mutation: remove step 4's tolerance and assert the `typescript` fixture flips
   to FAIL — proving the tolerance is scoped, not blanket.

### B2 (P3) — enforce the flag
At module load in `dependency-boundary.mjs`: resolve `'./probe.mjs'` against the parent
`'file:///tinyvault-flag-probe/parent.mjs'`; if the result does not start with
`file:///tinyvault-flag-probe/`, throw `Error('dependency gate requires --experimental-import-meta-resolve')`.
Selftest: spawning the gate CLI **without** the flag exits non-zero with that message; with the flag it
runs. The selftest must itself refuse to run unflagged (same check at its top).

### B3 (P3) — realpath in-repo files
Canonicalize every entry of `files` (and the `scripts/` walk) through `fs.realpathSync` before building
`fileSet`, so a committed symlink alias into `src/supervisor` is classified by its real path. Fixture:
`src/core/alias.ts → ../supervisor/marker.ts` symlink imported from a data-plane file → **FAIL**; the same
alias pointing at a clean module → PASS.

## Commit 2 — backend

### A1 (P1) — AD from the validated record snapshot
`src/backends/localFile.ts:141-145`: `encodeAdditionalData(handle, record)` (or a `recordPolicy` derived
once from the same parsed record the compare used). `policiesEqual` reads each `authorizedPolicy` field
**exactly once**; nothing reads `authorizedPolicy` after the compare. Tests:
- Invert `localFile.test.ts:409-435`: a getter-backed policy whose `canonicalOrigin` returns the file's
  origin on the first read and something else afterwards must yield **`integrity`** with the AD bytes equal
  to the record-derived golden vector — or, when the first read matches and the record was never edited,
  succeed with AD equal to the record's (assert the observed AD is the record's, never the argument's).
- Add the two security probes verbatim as regression tests: (a) seal under origin A, edit the file origin to
  B, pass a getter policy returning B then A → `integrity`, zero secret release; (b) recipe `Proxy` whose
  `toJSON` returns the sealed recipe after a recipe-only edit → `integrity`.
- Read-count test: each `authorizedPolicy` field read exactly once; a mutation adding a second read fails.

### B1 (P2) — independent `ItemMeta` expectations
`localFile.test.ts:32-80`: write the vault JSON by hand (fixed handles matching `/^vh_[0-9a-f]{32}$/`)
or inject a `randomHandle` seam returning fixed bytes; hard-code the expected `ItemMeta[]` literal; consume
no writer output in the expectation.

### B4 (P3) — runtime kind check on `BackendError`
Unknown kind → throw a fixed `Error('Invalid backend error kind')` from the constructor (house style,
`results.ts`); test it; keep the `@ts-expect-error` negatives.

### B5 (P3) — de-vacuate `localFileWriter.test.ts:167`
Assert on the fs trace: no `open`/`rename` events after a seal failure.

### B6 (P3) — explicit `account: undefined`
Writer treats `Object.hasOwn(entry, 'account') && entry.account === undefined` as absent; test both forms.

### B7 (P3) — code-quality rules
- Extract the key-scoped body of `resolveSecret` (read key → length check → `open()` → decode) into a
  helper so the function is ≤4 levels deep, **preserving the nested `finally` structure**; the existing
  cleanup tests must still kill the mutations.
- Split `writeLocalVault` and `validateRecord` under 50 lines each.
- One home for `FIELD_ROLES`/recipe rules (export from `localFileFormat.ts`; writer imports) and one
  `Awaitable<T>` (in `localFileSodium.ts`).
- Tighten `backend.ts:46` to "must not retain".
- Add the partial-key-file residual (register D) to the writer's module header.

### B8 (P3) — real `memzero`
One success-path test through `defaultSealingPrimitives` (real `sodium.memzero`) with the key `Buffer`
and plaintext retained via the fs/sodium seams, asserting both are all-zero afterwards.

## Do not touch
`src/core/*`, `src/supervisor/*`, `src/shared/*`, `testbed/*`, `SCHEMA.md`, `docs/*`, `PLAN.md`,
`.claude/memory/*`, `README.md`, `Makefile`. `package.json` only if B2 needs a script change (it should
not — the flag is already on both invocations).

## Report
`handoff-pattern.md` §13 headings, plus a **register cross-walk**: one line per item A1, A2, B1–B8 with
`file:line` of the change and the test that kills its mutation.
