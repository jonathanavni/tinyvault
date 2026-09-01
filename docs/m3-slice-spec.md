# M3 Slice Spec — Backend Interface + libsodium Local-File Backend (Codex implementation handoff)

> **Status: revision 1 — DRAFT for Codex adversarial pre-implementation review** (`handoff-pattern.md` §4
> step 3, build mode / verifier framing). Governed by [`phase-0-plan.md`](phase-0-plan.md) §2, §4 (layer 1,
> the three lifetimes), §6, §8 (M3 row), §9.1; `SCHEMA.md`; and the standing decision *"never cache the
> secret; backend auth sessions may be cached"* (`.claude/memory/decisions_product.md`).

## Task

Implement M3: the trusted-side `CredentialBackend` interface and the **libsodium sealed local-file backend**
with policy metadata, plus **B1 slice 2/3 — the never-cache-the-secret backend contract**. Also close one
verified gap in the M2 build-time dependency gate that M3 is the first slice to actually exercise (§7 below).

No browser, no DOM, no fill service (M4). No 1Password (M9).

## Branch / Worktree

Work in: `codex/m3-backend`, branched from current `main` head (`git rev-parse main` at branch time).
Do not modify unrelated files. Stage explicit paths; never `git add -A`.

## Required Reading

- `CLAUDE.md`
- `PLAN.md` — **Current State only**
- `docs/phase-0-plan.md` — **§2** (types, fill gate order, field-split rule), **§4 layer 1 + the three
  lifetimes**, **§6** (backend sketch), **§8 M3 row**
- `src/core/types.ts`, `SCHEMA.md` — the locked caller-visible contract (`ItemMeta`, `CredentialPolicy`,
  `Handle`, `Origin`, `FieldRole`)
- `src/core/redaction.ts` (+ test) — `Secret`; **the backend returns this type, it does not reinvent it**
- `src/core/originGuard.ts` — canonical-origin validation the backend must apply to stored policy
- `src/core/results.ts` — the house style for closed enums and fixed error text
- `scripts/dependency-boundary.mjs`, `scripts/check-dependency-boundary.mjs`,
  `scripts/dependency-boundary.selftest.mjs` — the gate (§7)
- `.claude/memory/conventions.md`

## Context

- M0–M2 are on `main`: contracts, the eval spine, and six security primitives. `make test` = 206 passing
  (`tsc --noEmit` + dependency gate + selftest + vitest). **There are zero runtime dependencies today**;
  M3 adds the first one.
- The fill gate (§2) is `resolvePolicy → origin check → pre-lock → resolveSecret → inject → clear`. M3 owns
  the two backend calls in that sequence and nothing else. The split matters: **policy is read before any
  secret exists**, and the secret is resolved only after authorization.
- **Vacuous tests are this project's named failure mode.** M2's round 3 caught a B1 suite that passed with
  plaintext still in a private field. A test that cannot fail is worse than none. Every acceptance test
  below names the mutation it kills.
- Standing decision: *never cache the secret* is a hard invariant; *backend auth-session material* (an
  `op`/`bw` session token, or here the loaded key) is legitimately cached and dropped by `dispose()`.
  Conflating them makes the invariant either false or forces pointless re-authentication.
- Honest claims only (§4 layer 1): "no plaintext reachable through TinyVault-owned data-plane state after
  clear" is **not** memory zeroization. JavaScript strings are immutable. A `Uint8Array` **can** be zeroed
  and this slice does zero the decrypted bytes, but the `string` handed to `Secret` cannot be, and no test
  or comment may claim otherwise.

## Design decisions (locked for this slice unless pre-impl review overturns them)

### D1 — libsodium via `libsodium-wrappers` (WASM), not `sodium-native`

Pure JS/WASM, no native build step for contributors, and the dependency gate traverses it cleanly (probed
2026-09-01 on the standard build). `sodium-native` offers secure-memory buffers that B1's honest claim does
not need. **`crypto_pwhash` is NOT in the standard `libsodium-wrappers` build** (probed) — so no
passphrase KDF in v0.1; the key is raw bytes (D3). Do not pull the `-sumo` build to get it.

### D2 — per-record sealing with AEAD-bound policy, not a whole-file seal

File format (JSON, version-tagged):

```ts
type LocalVaultFile = {
  version: 1;
  records: LocalVaultRecord[];
};
type LocalVaultRecord = {
  handle: Handle;                 // "vh_" + 32 hex chars from a CSPRNG, minted at write time
  label: string;
  kind: 'password';               // v0.1
  account?: string;
  canonicalOrigin: Origin;        // bare origin; validated with originGuard on read AND write
  fieldRecipe: FieldRole[];
  sealed: { nonce: string; ciphertext: string };   // base64; XChaCha20-Poly1305-IETF
};
```

- **Sealing primitive:** `crypto_aead_xchacha20poly1305_ietf_encrypt(secretBytes, ad, null, nonce, key)`
  with a fresh 24-byte random nonce per record write.
- **Additional data binds the ciphertext to its policy:** `ad = utf8(JSON.stringify([handle,
  canonicalOrigin, fieldRecipe]))` with `fieldRecipe` in stored order. Consequence: editing a record's
  `canonicalOrigin` (or handle, or recipe) in the file **breaks decryption of that secret**. A secret cannot
  be re-pointed at a different origin by editing plaintext metadata. This is the one invariant the file
  format buys, and it is tested.
- **Why per-record, not whole-file:** with a whole-file seal, `listItems` and `resolvePolicy` would have to
  decrypt every secret to read metadata, so plaintext would pass through process memory on a metadata call.
  Per-record sealing makes the `resolvePolicy`/`resolveSecret` split **structural**: metadata calls never
  invoke the decrypt primitive at all, and `resolveSecret(handle)` decrypts exactly one record.
- **Stated tradeoff (accepted, not a gap):** metadata — labels, account hints, canonical origins — is
  **cleartext at rest**. The local-file backend protects secret *values*; it does not hide *which* accounts
  exist. TinyVault's threat model is the model/caller, not the disk. A user needing metadata
  confidentiality at rest uses the 1Password backend (M9). Write this in the module header comment.

### D3 — key = 32 raw bytes in a key file; the loaded key is the "auth-session material"

- `createLocalFileBackend({ vaultPath, keyPath })`. The key file holds exactly 32 bytes (raw, or 64 hex
  chars — pick one, document it, reject the other with a typed error; **raw is preferred**).
- The key is **loaded lazily on first need and held in a module-private `Uint8Array`**. That buffer is the
  local-file analog of an `op` session token: **`dispose()` zeroes it with `sodium.memzero` and drops the
  reference; the next call reloads it from `keyPath`.** `dispose()` never touches, and cannot touch, any
  secret — because the backend holds none (D4).
- No passphrase, no KDF, no key rotation in v0.1.

### D4 — `resolveSecret` reads the file at call time, every time, and holds nothing between calls

No record cache, no decrypted-secret cache, no memoized file contents. Each `resolveSecret(handle)`:
read file → parse → find record → validate policy fields → decrypt that one record with AD → construct
`Secret` from the decoded string → **`memzero` the plaintext byte buffer in a `finally`** → return the
`Secret`. Nothing secret-derived (length, hash, the buffer, the string) is assigned to any field, closure
variable that outlives the call, log line, or error. The backend instance's only long-lived state is the
key buffer (D3) and the two paths.

`listItems` and `resolvePolicy` also re-read the file each call (cheap, and it keeps "the file is the source
of truth" true for rotation and revocation: deleting a record from the file makes the handle unavailable on
the very next call, with no in-memory ghost).

### D5 — interface shape

```ts
// src/backends/backend.ts
export type BackendStatus =
  | Readonly<{ available: true }>
  | Readonly<{ available: false; reason: 'not_installed' | 'not_authenticated' | 'locked' | 'error' }>;

export type BackendErrorKind = 'not-found' | 'locked' | 'auth-expired' | 'unavailable';
export class BackendError extends Error { readonly kind: BackendErrorKind; /* fixed message per kind */ }

export interface CredentialBackend {
  probeAvailability(): Promise<BackendStatus>;          // NEVER throws for "unavailable"
  listItems(): Promise<readonly ItemMeta[]>;            // metadata only — no secret value anywhere
  resolvePolicy(handle: Handle): Promise<CredentialPolicy>;  // no secret; throws BackendError
  resolveSecret(handle: Handle): Promise<Secret>;       // throws BackendError; returns core `Secret`
  dispose(): Promise<void>;                             // drops auth-session material ONLY
}
```

- **Deviation from §6 sketch, stated:** `resolveSecret` returns the core `Secret` directly rather than a
  `ResolvedSecret` wrapper that was never defined. One secret type in the codebase. `dispose` is required,
  not optional — a backend with nothing to drop implements it as a no-op; an optional hook is a hook M4
  will forget to call.
- **Error text is fixed per kind, never interpolated** — no handle, path, origin, or file content in any
  message (the closed-enum rule of §2 applied trusted-side; the fill service maps `kind` to the
  caller-visible `backend-error` / `handle-unavailable`, and `BackendStatus.reason` to `SetupReason`
  per §6 — **that mapping is M4's, do not implement it here**).
- `probeAvailability` for local-file: vault file missing/unreadable/unparseable → `not_installed`;
  key file missing/unreadable/wrong length → `locked`; vault parses but a record fails schema validation →
  `error`. It must not decrypt anything to answer. **Never throws.**
- `resolvePolicy`/`resolveSecret`: unknown or malformed handle → `not-found` (one kind — do not distinguish
  malformed from missing); key problems → `locked`; **AEAD authentication failure → `locked`** (wrong key
  and tampered record are indistinguishable by construction; the actionable guidance in both cases is the
  same, and the fill must fail closed either way); file missing/unparseable → `unavailable`.
  `auth-expired` is reserved for M9's session-token backends and is never produced here.

### D6 — a writer exists, as library code, for tests and fixtures

`writeLocalVault(vaultPath, keyPath, entries: Array<{label, kind, account?, canonicalOrigin, fieldRecipe,
secret: string}>)` → seals each entry, mints handles, writes the file (mode `0600`), returns the minted
`ItemMeta[]`. Plus `generateLocalVaultKey(keyPath)` (32 CSPRNG bytes, mode `0600`). Both in
`src/backends/localFileWriter.ts`, data-plane, no CLI in this slice (`make demo` is M10). The writer
validates `canonicalOrigin` with `originGuard` and refuses anything but a bare HTTP(S) origin.

## Scope

### Implement

1. `src/backends/backend.ts` — interface, `BackendStatus`, `BackendError`, kinds, fixed messages (D5).
2. `src/backends/localFile.ts` — `createLocalFileBackend` (D2–D5).
3. `src/backends/localFileWriter.ts` — `writeLocalVault`, `generateLocalVaultKey` (D6).
4. `src/backends/localFileFormat.ts` — file schema types + a **schema validator at the system boundary**
   (the file is external data: validate every field, reject unknown `version`, reject extra keys on
   records, validate `canonicalOrigin` via `originGuard`, validate `fieldRecipe` members and non-empty).
5. Colocated tests (`*.test.ts`) — see Acceptance.
6. `package.json`: add `libsodium-wrappers` (runtime) + `@types/libsodium-wrappers` (dev), exact versions
   pinned. Commit the lockfile change.
7. The dependency-gate fix in §7 + its selftest case.

### Do not implement

- The fill service, any `BackendStatus → SetupReason` or `BackendError → FillResult` mapping — **M4**.
- The B1 rotation-through-the-fill test (backend resolves A, fixture receives A, rotate to B…) — **M4**.
  M3 owns the **backend-level** rotation test (below), which is its half.
- 1Password / Bitwarden adapters, any `op`/`bw` shelling — **M9+**.
- A CLI, passphrase KDF, key rotation, file locking, multi-file vaults, metadata encryption at rest.
- Anything touching a browser, DOM, Playwright, or a live origin.
- Any change to `src/core/types.ts`, `SCHEMA.md`, `testbed/`, the checkers, `src/supervisor/*`.

## File Ownership

Codex owns: `src/backends/**`, `package.json` + `package-lock.json` (dependency lines only),
`scripts/dependency-boundary.mjs` + `scripts/dependency-boundary.selftest.mjs` (§7 only).

Must avoid: `PLAN.md`, `.claude/memory/*`, `docs/*`, `README.md`, `SCHEMA.md`, `src/core/*`,
`src/supervisor/*`, `src/shared/*`, `src/agents/*`, `testbed/*`, `Makefile`.

## Acceptance Criteria

Every test below states the mutation it kills. Tests must construct their own vault files under a temp
directory (`fs.mkdtemp`) and must never write outside it.

### A. Zero-secret metadata contract (M3 row: "`listItems` zero-secret contract test")

- Seal a vault whose secrets are **distinctive canary strings**. Assert that `JSON.stringify(await
  listItems())` and `JSON.stringify(await resolvePolicy(h))` (and `util.inspect` of both) contain **no**
  canary in any form of the canonical transform inventory (`src/shared/secretTransforms.ts` →
  `SECRET_TRANSFORM_NAMES`). Author the expected encodings **independently** (hand-computed or via
  `node:buffer`/`Buffer.toString('base64'|'hex')` etc.), never via the project's own transform code.
  *Kills:* a metadata path that copies `sealed`, the plaintext, or a derived value into `ItemMeta`.
- **Structural:** `ItemMeta` own-key set is exactly `{handle,label,kind,account?,available}` — no
  `canonicalOrigin`, no `sealed`, no extra keys (a spread of the record would leak them).
  *Kills:* `{...record}`-style construction.
- **Metadata calls never invoke decryption:** spy/wrap the AEAD decrypt entry point (or count calls via a
  seam the test controls) and assert **zero** decrypt calls across `probeAvailability`, `listItems`,
  `resolvePolicy`. *Kills:* a whole-file-decrypt regression of D2.

### B. Policy resolution

- `resolvePolicy` returns exactly `{canonicalOrigin, fieldRecipe}` with the origin in **normalized** form
  (`originGuard`), own-key set exact, frozen.
- A record whose stored `canonicalOrigin` fails `originGuard` (path, trailing slash, `ftp:`, whitespace,
  lookalike encodings from Appendix A of `m2-slice-spec.md`) → `resolvePolicy` **throws** `unavailable`
  (fail closed; never returns a policy the fill gate could authorize against). *Kills:* trusting stored
  metadata without validation.

### C. B1 slice 2/3 — never cache the secret; `dispose` drops auth material only

- **Backend-level rotation (the load-bearing test):** write vault with `h → A`; `resolveSecret(h)` exposes
  `A`; **rewrite the file** with `h → B` (same handle, same key, fresh nonce); `resolveSecret(h)` exposes
  `B`. *Kills:* any record/secret/file cache — a cached backend returns `A`.
- **Revocation:** after the first resolve, rewrite the file without `h`; `resolveSecret(h)` → `not-found`
  and `listItems()` no longer lists it. *Kills:* an in-memory ghost of a deleted record.
- **Plaintext buffer is zeroed:** through a test seam that observes the decrypted `Uint8Array` (e.g. the
  test injects a wrapped `sodium` whose decrypt returns a buffer the test retains a reference to), assert
  the buffer is all-zero after `resolveSecret` returns — **and on the throw path** (decode failure after
  decrypt). *Kills:* a missing `finally`/`memzero`. State in the test file, verbatim: *"This proves the byte
  buffer is zeroed. It does not and cannot prove the `string` inside `Secret` has no other copies."*
- **`dispose()` drops the key, not a secret:** resolve once; `dispose()`; assert the key buffer the test
  observed (same seam) is all-zero; then **delete the key file** and assert the next `resolveSecret` throws
  `locked` (proves the key was really dropped, not still held). Then restore the key file and assert
  `resolveSecret` succeeds again (proves `dispose` does not kill the backend — it drops session material).
  *Kills:* a `dispose` that is a no-op, and a `dispose` that permanently bricks the instance.
- **Structural non-retention:** after `resolveSecret`, `Reflect.ownKeys(backend)` and
  `util.inspect(backend, {showHidden: true, depth: 10})` contain no canary in any transform (same
  independent vectors as A). *Kills:* a secret stashed on the instance. (Closures are not inspectable; say so
  in the test, and rely on the rotation test for that class.)
- `resolveSecret` returns an instance of the core `Secret` (`instanceof`), and `String(result)` is
  `[REDACTED]`. *Kills:* a backend-local secret type.

### D. AEAD policy binding (D2)

- Tamper `canonicalOrigin` in the file (to another valid bare origin) → `resolvePolicy` returns the
  **tampered** origin (it is cleartext — that is expected) but `resolveSecret` throws `locked`.
  *Kills:* sealing without AD, or AD that omits the origin.
- Same for a tampered `handle` (swap two records' `sealed` blobs) and a tampered `fieldRecipe`.
- Wrong key → `locked`. Truncated/bit-flipped ciphertext → `locked`. Nonce reuse is not tested (random
  nonces; no counter to get wrong).

### E. Boundary validation (`localFileFormat.ts`)

- Reject: unknown `version`; non-array `records`; record with extra keys; missing `sealed`; non-base64
  nonce/ciphertext; wrong nonce length; empty `fieldRecipe`; unknown role; duplicate handles; `kind` other
  than `password`. Each → `probeAvailability` reports `error` (vault) and `resolvePolicy`/`resolveSecret`
  throw `unavailable`. *Kills:* trusting the file shape.
- **Legitimate-traffic control:** a fully valid file passes every check (a validator that rejects
  everything passes every rejection test — assert the allowed case explicitly).

### F. Typed errors and probe

- Every `BackendError` has a `kind` from the closed set, a **fixed** message per kind, and the message
  contains none of: the handle, either path, the origin, any canary. Test all four kinds plus the
  `never-produced-here` assertion for `auth-expired`.
- `probeAvailability` returns the documented status for: no vault file; vault present + no key; both
  present + malformed vault; both present + valid → `{available: true}`. It **never rejects** — wrap every
  case in `await expect(...).resolves`.
- `BackendStatus` and `BackendError` carry no free-text fields.

### G. Writer

- `writeLocalVault` output round-trips through the backend; minted handles match `/^vh_[0-9a-f]{32}$/`
  and are unique; file and key are mode `0600` (check with `fs.stat`; skip the mode assertion on
  `win32`); an entry with an invalid `canonicalOrigin` is refused **before** anything is written (file
  absent afterwards).

### H. Dependency gate (§7)

- The gate **PASSES** on the M3 tree (`src/backends` is data-plane and imports only `core/*`, `shared/*`,
  `node:*`, and `libsodium-wrappers`).
- The selftest gains the case in §7 and it **fails on the pre-fix gate** — demonstrate by including the
  before/after output in the implementation report.

### Compile-time negatives

`@ts-expect-error` guards: `resolveSecret` result not assignable to `string`; `ItemMeta` has no
`canonicalOrigin`; `CredentialBackend.listItems` return has no `secret`/`sealed` member; `BackendError`
constructor does not accept a free-text message.

## 7. Dependency-gate fix (verified gap, folded in because M3 is its first real exercise)

**Finding (Claude, 2026-09-01, reproduced in a scratch tree):** `resolveSpecifier` resolves bare package
specifiers with `ts.resolveModuleName`, which for a package that ships types lands on its **`.d.ts`**. The
gate then "traverses" the declaration file — which has no runtime edges — and never reads the package's
runtime JavaScript. A typed package whose `index.js` does `require("../../src/supervisor/marker.ts")`
**PASSES**; the same package with its `types` field removed **FAILS** correctly. So "fails closed on
anything it cannot follow" holds, but the gate follows the wrong artifact for every typed dependency. It had
no runtime dependency to catch until now.

**Fix (the class, not the instance):** for the external-package traversal, resolve specifiers to the
**runtime** module — honor `package.json` `exports`/`main` (Node ESM + CJS conditions, `import` and
`require`), fall back to `index.js`, and treat `.d.ts` as a non-runtime artifact that is never a
traversal target. Keep TypeScript resolution only for in-repo `.ts` sources. If a package's runtime entry
cannot be resolved, **fail closed** as today (`unresolved`), do not fall back to types. Add a selftest
fixture: a fake typed package under a temp `node_modules` whose runtime JS reaches a protected directory —
it must FAIL; the same package with the reach removed must PASS (the legitimate-traffic control).

If the real `libsodium-wrappers` runtime traversal then fails closed on a construct the gate cannot
follow (e.g. a non-literal `require` inside the emscripten bundle), **stop and report with the exact
violation output** — whether to exempt a vetted crypto dependency is a planning decision (§8 of the handoff
pattern), not one to make in the implementation.

## Contract conflicts — STOP, do not guess

`src/core/types.ts` and `SCHEMA.md` are locked. Pre-authorized: **none** — M3 should need no
caller-visible contract change (`CredentialBackend` is trusted-side; `ItemMeta`/`CredentialPolicy` are
consumed as-is). If you find you need one, stop and report with the exact reason.

## Review sequence (§9.1, author-relative)

On `codex/m3-backend` while the diff exists: **1.** Claude `/review` · **2.** Claude `/security-review` ·
**3.** Codex adversarial diff review. Codex implements, so the two Claude passes are the different-family
channels; the Codex pass is fresh-context but same-family. None certifies M3. **Direct the security review
at:** the decrypt path's `finally` and buffer lifetime; error/message provenance; AD construction (canonical
encoding — an AD that serializes differently on read vs write is a silent brick, an AD that is too loose is
a silent re-pointing); the file validator; the gate fix.

## Honest-claims rule

No zeroization claim about strings. No "the secret is never in memory" claim. The claims this slice can
make: *the backend holds no secret or secret-derived material between calls (rotation-tested); the decrypted
byte buffer is zeroed before return on success and throw; `dispose` zeroes and drops the key, and only the
key; metadata calls never invoke the decrypt primitive; a sealed secret cannot be re-bound to a different
origin, handle, or recipe without the key.*

## Reporting

`handoff-pattern.md` §13: Summary / Files Changed / Verification (with the gate before/after output) /
Risks & Follow-ups / **Deviations From Handoff**.
