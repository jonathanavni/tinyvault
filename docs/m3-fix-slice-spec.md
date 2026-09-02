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
4. **Scripts-rooted entries only** (entry file under `scripts/`): `unscanned`, `unsupported`, **and
   `unresolved`** results that occur **inside `node_modules`** are tolerated (the toolchain — `typescript`
   has a non-literal `require` and an *unresolved* optional `source-map-support` edge; *"unresolved" added
   by continuity-owner amendment in round 3, register R2-9*); any reach into a protected directory, and any
   in-repo unsupported/unresolved syntax, is still reported. Data-plane-rooted entries tolerate nothing.
   Document the two-tier rule **and the production→scripts rule** in the script header.
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


---

# Round 3 (the cap) — closing register R2-1 … R2-11 and the round-2 test gaps

One fix commit per set again: **(1) gate** — R2-1, R2-3, R2-4, R2-6, R2-7, R2-8, R2-9 (header), R2-10, and the
gate test gaps; **(2) backend** — R2-2, R2-5, R2-11, and the backend test gaps. Leave uncommitted/unstaged; the
integrator commits. `npm test` before reporting. After this slice the integrator runs a confirmation pass
(suite + the named mutations) and there is **no fourth review round** — so every item below must carry the
test that kills its mutation, or say why it cannot.

## Set 1 — gate (`scripts/dependency-boundary.mjs`, `scripts/dependency-boundary.selftest.mjs`)

- **R2-1 (P2, regression):** protected classification = **union** of link path and real path. Collect
  `protectedRealPaths` from every configured/walked file whose *pre-realpath* location is protected;
  `isProtected(target)` checks the real-path directory rule **or** membership in that set. Fixtures:
  `src/supervisor/evil.ts → ../../outside/evil.ts` imported from a data-plane file → **FAIL** (link path is
  protected); control: `src/core/alias.ts → ../../outside/clean.ts` imported → **PASS** (neither path is
  protected).
- **R2-3 + R2-9:** header states the two-tier rule verbatim: *"A scripts-rooted BFS tolerates unsupported,
  unscanned, or unresolved external-package loads inside node_modules; data-plane roots tolerate nothing; neither
  tier may reach a protected directory; production modules may not import scripts/ (directly or transitively)."*
  Plus the residual: a scripts-rooted BFS cannot see non-literal/unresolved loads inside a toolchain package.
  Fixture: `scripts/tool.mjs → node_modules/pkg` whose `index.js` has an unresolved bare import → **PASS**
  (scoped tolerance); the same package imported from `src/core` → **FAIL** `external-package unresolved`.
- **R2-4:** extract `walkEntry(entry, …)` and `classifyEdge(edge, …)` so `checkDependencyBoundary` is under
  50 lines and nesting ≤ 4; extract from `addExternalEntry` likewise if it stays over 50. Behavior-preserving —
  the whole selftest matrix must pass unchanged before and after.
- **R2-6:** production→scripts becomes a BFS-loop rule: for an entry not under `scripts/`, any edge whose
  target is under `scripts/` is a `production-to-tooling` violation (direct or transitive). Fixture:
  `src/core → node_modules/p → scripts/tool.mjs` (clean tool) → **FAIL** `production-to-tooling`.
- **R2-7:** reword the B3 fixture comment to attribute the kill to the edge-side realpath; add the control only
  file canonicalization distinguishes (`src/core/alias.ts → ../../tools/real.ts` where `./helper.ts` resolves to a
  clean file from the alias path but to a supervisor re-export from the real path) → **FAIL**, and assert that
  reverting `canonicalFile` to `path.resolve` still fails closed (as `unresolved relative`) — i.e. the file
  canonicalization is redundant-but-fail-closed; say so in the comment.
- **R2-8:** fixture `scripts/node_modules/helper.mjs` with a non-literal `import()` reached from a scripts root →
  **FAIL** (in-repo path with a `node_modules` segment is not toolchain; the `external-package` prefix guard is
  what makes this fail — mutation: drop the guard → the fixture passes → test fails).
- **R2-10:** (a) scripts-rooted package whose `index.js` has a non-literal `require` **and** a literal
  `require('../../src/supervisor/marker.ts')` → **FAIL** with the protected violation specifically (assert its
  text); mutation: "skip the rest of a tolerated package node" must be killed. (b) data-plane file importing a
  relative file **outside the tsconfig include** (e.g. `../../outside/helper.ts`, existing, not in `fileSet`, not
  `node_modules`) → **FAIL** `unscanned static import`; mutation: drop the `edge.unscanned` violation branch →
  killed. (c) The `node === undefined` branch: keep as defensive code; comment "unreachable by construction —
  every external target receives a graph node (see addExternalEntry); kept fail-closed".
- **Gate test gaps:** entry-root keying pinned independently of production-to-tooling — in the laundering
  fixture use a package with a non-literal `require` and assert an `external-package non-literal` violation whose
  `entry` ends with `src/core/probe.ts` (mutation G2b: importer-keyed tolerance → killed). The selftest's own
  unflagged refusal: spawn the selftest without the flag → exit 1 with the fixed message.

## Set 2 — backend (`src/backends/**`)

- **R2-2 (P2, hard rule):** split `src/backends/localFile.test.ts` (843 lines): move `describe('policy binding
  and error ordering')` to `src/backends/localFile.policy.test.ts`. Shared helpers go in a test-only module
  that both the dependency gate and vitest treat as a test file — the gate's `isProductionModule` excludes
  names matching `.test.` or `.spec.`, so use `src/backends/localFile.helpers.test.ts` (exports the helpers; may
  contain no `describe` — vitest tolerates a suite-less file only with `passWithNoTests`, so include one trivial
  `it` that asserts a helper's shape). State the choice under Deviations. Both files stay under 400 lines.
- **R2-5:** delete the vacuous `stat` assertion at `localFileWriter.test.ts:170`.
- **R2-11:** the writer failure trace asserts the **exact** sequence `['readFile']` (and, for the nth-record
  case, still exactly `['readFile']` — sealing happens before any mutating fs call).
- **Backend test gaps:** writer recipe validation `it.each([[], ['password','password'], ['secret']])` refused
  before any fs call; `memzero` throwing on the **key** with the plaintext memzero succeeding → `unavailable`,
  plaintext all-zero (pins the ordering mutant "swap the two finally scopes"); the policy compare reads the recipe
  via `length` + indices only (full-`Proxy` trap log equals `['canonicalOrigin','fieldRecipe']` and
  `['length','0','1']`; mutation: `JSON.stringify(fieldRecipe)` in the compare → killed).

## Report
§13 headings + register cross-walk for R2-1 … R2-11 and each test gap (file:line + killing test). Any
deviation from a locked sentence goes under Deviations From Handoff.
