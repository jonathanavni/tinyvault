# M3 Slice Spec — Backend Interface + libsodium Local-File Backend (Codex implementation handoff)

> **Status: revision 2 — for Codex adversarial pre-implementation review round 2** (`handoff-pattern.md`
> §4 step 3, build mode / verifier framing; cap at round 3). Round 1 returned **NO-SHIP, 8 findings (6 P1,
> 2 P2), all absorbed** — see "What changed from revision 1" below. Governed by
> [`phase-0-plan.md`](phase-0-plan.md) §2, §4 (layer 1, the three lifetimes), §6, §8 (M3 row), §9.1;
> `SCHEMA.md`; and the standing decision *"never cache the secret; backend auth sessions may be cached"*
> (`.claude/memory/decisions_product.md`).

## Task

Implement M3: the trusted-side `CredentialBackend` interface and the **libsodium sealed local-file backend**
with policy metadata, plus **B1 slice 2/3 — the never-cache-the-secret backend contract**. Also close one
verified gap in the M2 build-time dependency gate that M3 is the first slice to actually exercise (§7).

No browser, no DOM, no fill service (M4). No 1Password (M9).

## What changed from revision 1, and why (read first)

Round 1's findings, and how each was absorbed:

1. **Policy/secret TOCTOU (P1).** The fill gate resolves policy, authorizes, then resolves the secret; both
   calls re-read the file, so a keyed writer replacing the record in between made `resolveSecret` return
   secret B under authorization A. **Fix:** `resolveSecret(handle, authorizedPolicy)` — the caller passes
   back the exact policy it authorized, and the backend **computes the AEAD additional data from that
   argument, not from the file**. A re-pointed record fails authentication. The second call is bound to the
   first cryptographically, with no separate comparison path to get wrong (D2, D5).
2. **Nonce reuse untestable (P1).** A constant-nonce writer passed every test. **Fix:** the libsodium
   surface is injected through one seam; tests assert one `randombytes_buf(NPUBBYTES)` per sealed record,
   persisted verbatim, and a constant-nonce mutant fails (G).
3. **Never-cache suite passable with a content-keyed cache (P1).** **Fix:** the claim is narrowed to what
   tests show; an injected-decryptor test kills mtime/content caches; non-retention is *structural review of
   one decrypt path plus mutation evidence*, never a black-box proof (C, Honest-claims).
4. **Key-cache concurrency (P1).** Lazy load + `dispose` needed a single-flight state machine. **Fix: the
   key is not cached at all.** Every call reads the 32-byte key file, uses it, zeroes it in a `finally`.
   For local-file there is **no auth-session material**, so `dispose()` is a documented no-op; the
   "dispose drops session material only" half of the contract is stated on the interface and **proven at
   M9** by the first backend that actually holds a session token. Removing state beats serializing it (D3).
5. **Gate fix underspecified (P1).** A main/index-only resolver passes the one proposed fixture while
   missing conditional/subpath/transitive edges. **Fix:** parent-aware, Node-compatible resolution per edge
   syntax, union of the `import` and `require` condition branches, and an enumerated fixture matrix each
   with a protected and a clean branch (§7).
6. **Writer could destroy the only key / tear the vault (P1).** **Fix:** exclusive key creation (`wx`),
   same-directory temp + fsync + atomic rename for the vault, mode-on-fresh-file only, with tests (D6, G).
7. **AD canonicalization / rollback (P2).** **Fix:** writer stores `originGuard`'s *normalized* return,
   one `encodeAdditionalData` shared by read and write, golden byte vectors incl. non-canonical accepted
   inputs. **Rollback of an old authentic file by a filesystem writer is explicitly out of scope** (D2).
8. **AEAD failure mapped to `locked` sends users to unlock forever (P2).** **Fix:** new `integrity` kind
   for authentication failure and policy mismatch; `locked` is reserved for key-material problems (D5).

Also from round 1's residual-risk notes: **`libsodium-wrappers` 0.8.4 ships its own type declarations;
`@types/libsodium-wrappers` is a deprecated stub — do not add it.** And the honest claim now disclaims copies
inside the WASM heap. Process fix: round 2 is dispatched against a **pinned commit range** (round 1's basis
drifted because the orchestrator committed unrelated docs mid-review).

## Branch / Worktree

Work in: `codex/m3-backend`, branched from current `main` head (`git rev-parse main` at branch time).
**Two commits, in this order: (1) the gate fix (§7) alone, (2) the backend.** Reviews are scoped per commit.
Do not modify unrelated files. Stage explicit paths; never `git add -A`.

## Required Reading

- `CLAUDE.md`
- `PLAN.md` — **Current State only**
- `docs/phase-0-plan.md` — **§2** (types, fill gate order, field-split rule), **§4 layer 1 + the three
  lifetimes**, **§6** (backend sketch), **§8 M3 row**
- `src/core/types.ts`, `SCHEMA.md` — the locked caller-visible contract (`ItemMeta`, `CredentialPolicy`,
  `Handle`, `Origin`, `FieldRole`)
- `src/core/redaction.ts` (+ test) — `Secret`; **the backend returns this type, it does not reinvent it**
- `src/core/originGuard.ts` (+ test) — canonical-origin validation and normalization
- `src/core/results.ts` — the house style for closed enums and fixed error text
- `scripts/dependency-boundary.mjs`, `scripts/check-dependency-boundary.mjs`,
  `scripts/dependency-boundary.selftest.mjs` — the gate (§7)
- `.claude/memory/conventions.md`

## Context

- M0–M2 are on `main`: contracts, the eval spine, and six security primitives. `make test` = 206 passing
  (`tsc --noEmit` + dependency gate + selftest + vitest). **There are zero runtime dependencies today**;
  M3 adds the first one.
- The fill gate (§2) is `resolvePolicy → origin check → pre-lock → resolveSecret → inject → clear`. M3 owns
  the two backend calls in that sequence and nothing else. **Policy is read before any secret exists**, and
  the secret is resolved only after authorization — **and only for the policy that was authorized** (r2 #1).
- **Vacuous tests are this project's named failure mode.** Every acceptance test below names the mutation it
  kills. Round 1 of this spec found three tests that a wrong implementation passes; assume there are more.
- Standing decision: *never cache the secret* is a hard invariant; *backend auth-session material* is
  legitimately cached and dropped by `dispose()`. Local-file has none (r2 #4); the interface carries the
  contract for M9.
- Honest claims only (§4 layer 1): "no plaintext reachable through TinyVault-owned data-plane state after
  clear" is **not** memory zeroization. A `Uint8Array` can be zeroed and this slice zeroes the ones it owns;
  the `string` handed to `Secret` cannot be, and **neither can copies the libsodium WASM heap may hold**.
  No test or comment may claim otherwise.

## Design decisions (locked for this slice unless review overturns them)

### D1 — libsodium via `libsodium-wrappers` (WASM), not `sodium-native`

Pure JS/WASM, no native build step; the dependency gate traverses it (probed 2026-09-01). `sodium-native`'s
secure-memory buffers are not needed for the honest claim. **`crypto_pwhash` is NOT in the standard
`libsodium-wrappers` build** (probed) — no passphrase KDF in v0.1; the key is raw bytes (D3). Do not pull the
`-sumo` build. Pin the exact version; **the package ships its own `.d.ts` — add no `@types` package.**

**All libsodium access goes through one injectable seam** (`localFileSodium.ts` exporting a narrow
`SealingPrimitives` interface: `randomNonce()`, `seal(plaintext, ad, nonce, key)`, `open(ciphertext, ad,
nonce, key)`, `memzero(buf)`; default implementation wraps `libsodium-wrappers` after `await sodium.ready`).
Tests inject a wrapped instance to observe nonces, buffers, and call counts. Production code never imports
`libsodium-wrappers` anywhere else.

### D2 — per-record sealing with AEAD-bound policy, not a whole-file seal

File format (JSON, version-tagged):

```ts
type LocalVaultFile = { version: 1; records: LocalVaultRecord[] };
type LocalVaultRecord = {
  handle: Handle;                 // "vh_" + 32 hex chars from randombytes, minted at write time
  label: string;
  kind: 'password';               // v0.1
  account?: string;
  canonicalOrigin: Origin;        // STORED IN originGuard-NORMALIZED FORM (r2 #7); re-validated on read
  fieldRecipe: FieldRole[];       // non-empty, no duplicates, stored order is significant
  sealed: { nonce: string; ciphertext: string };   // base64 (standard, padded); XChaCha20-Poly1305-IETF
};
```

- **Sealing primitive:** `crypto_aead_xchacha20poly1305_ietf_encrypt(secretBytes, ad, null, nonce, key)`,
  nonce = `randombytes_buf(crypto_aead_xchacha20poly1305_ietf_NPUBBYTES)` fresh per sealed record (G kills
  the constant-nonce mutant).
- **Additional data binds the ciphertext to its policy.** One function, `encodeAdditionalData(handle,
  policy)`, used by **both** writer and reader, returns
  `utf8(JSON.stringify([handle, policy.canonicalOrigin, policy.fieldRecipe]))` with the origin already
  normalized and the recipe in stored order. Golden byte vectors pin the encoding (D-tests). Consequence:
  editing a record's origin, handle, or recipe in the file **breaks authentication of that secret** — a
  secret cannot be re-pointed at another origin by editing cleartext metadata.
- **The reader computes AD from the caller's `authorizedPolicy`, not from the file (r2 #1).** So the AD
  check simultaneously authenticates the record *and* proves the record still carries the policy the fill
  gate authorized. There is no separate "compare policies" branch.
- **Why per-record, not whole-file:** with a whole-file seal, `listItems`/`resolvePolicy` would decrypt every
  secret to read metadata. Per-record sealing makes the policy/secret split **structural**: metadata calls
  never invoke `open()` (A-tests count calls), and `resolveSecret` opens exactly one record.
- **Stated tradeoffs (accepted, written in the module header, not gaps):** (a) metadata — labels, account
  hints, canonical origins — is **cleartext at rest**; the local-file backend protects secret *values*, not
  the existence of accounts. (b) **A filesystem writer who restores an older authentic vault file (rollback)
  defeats rotation/revocation.** Both are outside TinyVault's threat model, which is the model/caller, not a
  party with write access to the trusted host's disk. Users needing either property use the 1Password
  backend (M9).

### D3 — key = 32 raw bytes in a key file, read per call, never cached (r2 #4)

- `createLocalFileBackend({ vaultPath, keyPath })`. The key file holds **exactly 32 raw bytes**; any other
  length → `locked`.
- **Every `resolveSecret` reads the key file into a fresh `Uint8Array`, uses it, and `memzero`s it in a
  `finally`.** No key buffer outlives a call; there is no lazy load, no cache, and therefore no concurrency
  state to serialize. Cost: one small file read per fill — negligible, and it keeps "the disk is the source of
  truth" exact for key replacement too.
- **`dispose()` is a no-op for local-file, with a comment saying why**: this backend holds no auth-session
  material. The `CredentialBackend` doc comment states the contract (`dispose` drops session material —
  an `op`/`bw` token — and **never** a secret, which no conforming backend holds between calls); M9's
  1Password backend is where that half is first exercised and tested.
- No passphrase, no KDF, no key rotation, no permission enforcement on read in v0.1 (stated).

### D4 — `resolveSecret` reads the vault at call time, every time, and holds nothing between calls

**One decrypt path, no module-level or instance-level data state.** The backend instance owns exactly the
two paths and the injected primitives — nothing else. Each `resolveSecret(handle, authorizedPolicy)`:
read vault → validate (E) → find record → read key → `open(ciphertext, encodeAdditionalData(handle,
authorizedPolicy), nonce, key)` → decode UTF-8 → `new Secret(string)` → **`memzero` key and plaintext
buffers in a `finally`** → return. Nothing secret-derived (length, hash, buffer, string) is assigned to any
field, outer-scope variable, log line, or error. The decoded `string` is passed to `Secret` and the local
binding is not reused.

`listItems` and `resolvePolicy` also re-read the file each call: deleting a record makes the handle
unavailable on the very next call, with no in-memory ghost.

### D5 — interface shape

```ts
// src/backends/backend.ts
export type BackendStatus =
  | Readonly<{ available: true }>
  | Readonly<{ available: false; reason: 'not_installed' | 'not_authenticated' | 'locked' | 'error' }>;

export type BackendErrorKind =
  | 'not-found'      // handle unknown or malformed (one kind; do not distinguish)
  | 'locked'         // key material missing, unreadable, or wrong length
  | 'auth-expired'   // reserved for session-token backends (M9); never produced by local-file
  | 'unavailable'    // vault missing, unreadable, unparseable, or fails schema validation
  | 'integrity';     // AEAD authentication failed: wrong key, tampered record, OR policy no longer matches
export class BackendError extends Error { readonly kind: BackendErrorKind; constructor(kind: BackendErrorKind); }
// message is a fixed string per kind; the constructor takes NO free text.

export interface CredentialBackend {
  probeAvailability(): Promise<BackendStatus>;                 // NEVER rejects
  listItems(): Promise<readonly ItemMeta[]>;                   // metadata only
  resolvePolicy(handle: Handle): Promise<CredentialPolicy>;    // deep-frozen; throws BackendError
  resolveSecret(handle: Handle, authorizedPolicy: CredentialPolicy): Promise<Secret>;  // throws BackendError
  dispose(): Promise<void>;                                    // drops auth-session material only; no-op if none
}
```

- **Deviations from the §6 sketch, stated:** `resolveSecret` returns the core `Secret` (no undefined
  `ResolvedSecret`), takes the **authorized policy** (r2 #1), and `dispose` is required (a no-op is
  explicit; an optional hook is one M4 forgets to call). The continuity owner amends §6 when M3 lands.
- **Error text is fixed per kind, never interpolated** — no handle, path, origin, or file content in any
  message. **Every native exception (fs, JSON, sodium, TextDecoder) is caught at the backend boundary and
  re-thrown as a `BackendError`** so no path or content escapes via a foreign error (F).
- The fill service's mappings — `kind → FillResult.reason` (`not-found → handle-unavailable`, everything
  else → `backend-error`) and `BackendStatus.reason → SetupReason` per §6 — are **M4's; do not implement
  them here.** `integrity` must map to `backend-error`, never to an unlock instruction (r2 #8).
- `probeAvailability` for local-file: vault file missing/unreadable/unparseable/invalid → `not_installed`
  (missing) or `error` (present but invalid); key file missing/unreadable/wrong length → `locked`; both fine
  → `{available: true}`. It never opens a record. It **never rejects**.
- `resolvePolicy`/`resolveSecret`: unknown or malformed handle → `not-found`; key problems → `locked`;
  vault missing/invalid → `unavailable`; AEAD failure (wrong key, tampered record, policy mismatch) →
  `integrity`. The order of checks is: vault validity → handle lookup → key → open. A missing key with an
  unknown handle reports `not-found` (handle lookup precedes the key read; the key is never read for a handle
  that does not exist).

### D6 — a writer exists, as library code, for tests and fixtures

`src/backends/localFileWriter.ts`, data-plane, no CLI in this slice:

- `generateLocalVaultKey(keyPath)` — 32 bytes from `randombytes_buf`, written with flag **`wx`** (exclusive
  create), mode `0600`. An existing file → a plain `Error` with the fixed text `Key file already exists`
  (writer-side failures are not `BackendError`s; that class is reserved for the read path).
- `writeLocalVault(vaultPath, keyPath, entries)` — validates every entry **before** touching disk (origin via
  `originGuard`, stored in normalized form; recipe non-empty, no duplicates; `kind === 'password'`), mints
  handles, seals each entry with a fresh nonce, and writes **atomically**: same-directory temp file (mode
  `0600`) → write → `fsync` → close → `rename` over `vaultPath`. On any failure the previous vault is
  untouched and the temp file is removed. Returns the minted `ItemMeta[]`.
- Mode is set on fresh files only; the writer does not tighten a pre-existing file's mode (stated).

## Scope

### Implement

1. `src/backends/backend.ts` — interface, `BackendStatus`, `BackendError`, kinds, fixed messages (D5).
2. `src/backends/localFileSodium.ts` — the `SealingPrimitives` seam + default `libsodium-wrappers` impl (D1).
3. `src/backends/localFileFormat.ts` — file schema types, `encodeAdditionalData`, and the **boundary
   validator** (E).
4. `src/backends/localFile.ts` — `createLocalFileBackend` (D2–D5).
5. `src/backends/localFileWriter.ts` — `writeLocalVault`, `generateLocalVaultKey` (D6).
6. Colocated tests (`*.test.ts`) — see Acceptance.
7. `package.json`: add `libsodium-wrappers` (runtime, exact version). Commit the lockfile change.
8. The dependency-gate fix (§7) + its selftest matrix, **as its own first commit**.

### Do not implement

- The fill service, any `BackendError → FillResult` or `BackendStatus → SetupReason` mapping — **M4**.
- The B1 rotation-through-the-fill test — **M4**. M3 owns the backend-level rotation test (C).
- 1Password / Bitwarden adapters, any `op`/`bw` shelling, `auth-expired` production — **M9+**.
- A CLI, passphrase KDF, key rotation, file locking, multi-file vaults, metadata encryption at rest,
  anti-rollback state, permission enforcement on read.
- Anything touching a browser, DOM, Playwright, or a live origin.
- Any change to `src/core/types.ts`, `SCHEMA.md`, `testbed/`, the checkers, `src/supervisor/*`.

## File Ownership

Codex owns: `src/backends/**`, `package.json` + `package-lock.json` (dependency lines only),
`scripts/dependency-boundary.mjs` + `scripts/dependency-boundary.selftest.mjs` (§7 only).

Must avoid: `PLAN.md`, `.claude/memory/*`, `docs/*`, `README.md`, `SCHEMA.md`, `src/core/*`,
`src/supervisor/*`, `src/shared/*`, `src/agents/*`, `testbed/*`, `Makefile`.

## Acceptance Criteria

Every test states the mutation it kills. Tests build their own vaults under `fs.mkdtemp` and never write
outside it. Canary secrets are distinctive strings; expected encodings are **authored independently**
(hand-computed or via `Buffer.toString('base64'|'hex')`), never via the project's transform code.

### A. Zero-secret metadata contract

- `JSON.stringify` and `util.inspect({showHidden:true, depth:10})` of `listItems()` and
  `resolvePolicy(h)` contain no canary in any form of `SECRET_TRANSFORM_NAMES`. *Kills:* copying `sealed`
  or plaintext into metadata.
- **Exact values, not just exact keys (r1 test-gap A):** `listItems()` deep-equals the independently
  authored expected `ItemMeta[]` (`handle`, `label`, `kind`, `account`, `available: true`), so a
  secret-derived length or hash cannot hide in a string field. Own-key set exact; no `canonicalOrigin`, no
  `sealed`. *Kills:* `{...record}` construction and derived-value smuggling.
- **Metadata calls never open a record:** via the injected seam, assert **zero** `open()` calls across
  `probeAvailability`, `listItems`, `resolvePolicy`. *Kills:* a whole-file-decrypt regression.

### B. Policy resolution

- `resolvePolicy` returns exactly `{canonicalOrigin, fieldRecipe}`, origin in normalized form, **deep-frozen**
  (`Object.isFrozen(policy.fieldRecipe)`; a push throws in strict mode). *Kills:* a shallow freeze that lets
  M4 mutate the recipe after authorization.
- A record whose stored `canonicalOrigin` fails `originGuard` (path, trailing slash, `ftp:`, whitespace,
  uppercase or default-port spellings that are *not* normalized, and the Appendix A lookalike encodings from
  `m2-slice-spec.md`) → `unavailable`. *Kills:* trusting stored metadata.

### C. B1 slice 2/3 — never cache the secret

- **Backend-level rotation:** vault `h → A`; resolve → `A`; rewrite `h → B` (same handle/policy/key, fresh
  nonce); resolve → `B`. *Kills:* a record/secret/file cache.
- **Same-file repeated resolution with an injected decryptor (r2 #3):** file unchanged; the injected
  `open()` returns different plaintext on each call; two resolves return the two different values.
  *Kills:* an mtime- or content-keyed cache that the rotation test cannot see.
- **Revocation:** rewrite without `h`; resolve → `not-found`; `listItems` no longer lists it. *Kills:* an
  in-memory ghost.
- **Buffers zeroed:** through the seam, retain references to the key buffer passed to `open()` and the
  plaintext buffer it returned; after `resolveSecret` returns **and** on the throw path (inject a decoder
  failure after `open`), both are all-zero. *Kills:* a missing `finally`. State verbatim in the test file:
  *"This proves the byte buffers TinyVault owns are zeroed. It does not and cannot prove the `string`
  inside `Secret`, or the libsodium WASM heap, has no other copies."*
- **Key is read per call:** delete the key file after a successful resolve; the next resolve → `locked`;
  restore it; resolve succeeds. *Kills:* a cached key (and proves no state machine is needed).
- **Structural non-retention:** after resolve, `Reflect.ownKeys(backend)` and a deep `util.inspect` contain
  no canary in any transform. *Kills:* an instance-level stash. State in the test that closures are not
  inspectable and that the injected-decryptor test plus structural review of the single decrypt path cover
  that class.
- Result is `instanceof Secret`; `String(result) === '[REDACTED]'`. *Kills:* a backend-local secret type.
- `dispose()` resolves, is idempotent, and a subsequent resolve still succeeds (no-op proven, not assumed).

### D. AEAD policy binding and the TOCTOU closure (r2 #1, #7)

- **Golden AD vectors:** `encodeAdditionalData` output for three fixed inputs equals hand-authored byte
  arrays, including one whose origin was supplied in a non-canonical accepted spelling to the writer
  (e.g. uppercase host, explicit `:443`) and is therefore encoded in normalized form. *Kills:* writer/reader
  encoder divergence and normalize-on-read-only.
- **Policy-swap between calls:** `p = resolvePolicy(h)`; rewrite `h` with a different origin **and** a
  different secret (valid, keyed); `resolveSecret(h, p)` → `integrity`, and the seam observed **no plaintext
  returned** from `open()`. *Kills:* computing AD from the file, and any implementation that compares
  policies after decrypting.
- Tamper `canonicalOrigin` alone → `resolvePolicy` returns the tampered origin (cleartext, expected), and
  `resolveSecret(h, originalPolicy)` → `integrity`; `resolveSecret(h, tamperedPolicy)` → `integrity` too
  (the AD in the ciphertext still names the original). Same for swapped `sealed` blobs between two records
  and a tampered `fieldRecipe`.
- Wrong key → `integrity`. Truncated or bit-flipped ciphertext → `integrity`. Wrong-length key → `locked`.
- Rollback (restore an older authentic file) is **not** tested and is stated out of scope in the module header.

### E. Boundary validation (`localFileFormat.ts`)

- Reject: unknown `version`; non-array `records`; extra keys at top level, on a record, or inside `sealed`;
  missing/non-string `label`; non-string `account`; `kind !== 'password'`; empty or duplicate-role
  `fieldRecipe`; unknown role; duplicate handles; handle not matching `/^vh_[0-9a-f]{32}$/`; non-base64 or
  wrong-length nonce; ciphertext shorter than the AEAD tag; **file larger than 1 MiB** (read with a size
  check first; a resource limit, not a format rule). Each → `probeAvailability` reports `error` and
  `resolvePolicy`/`resolveSecret` throw `unavailable`. *Kills:* trusting the file shape.
- **Legitimate-traffic control:** a fully valid file passes every check.

### F. Typed errors, foreign exceptions, and probe

- Every `BackendError` has a `kind` from the closed set and a fixed message containing none of: the handle,
  either path, the origin, any canary, any `errno`/syscall text. Test all five kinds' messages, and assert
  `auth-expired` is never produced by any local-file path.
- **Foreign-exception containment:** inject failures into `fs` (ENOENT with a path in the message), `JSON`,
  the seam (`open` throws), and `TextDecoder` (invalid UTF-8 with `fatal: true`); every one surfaces as a
  `BackendError` whose message and `stack`-visible text contain no path. *Kills:* a native error escaping.
- `probeAvailability` never rejects across: no vault; vault + no key; malformed vault; wrong-length key;
  valid. Wrap every case in `await expect(...).resolves`.
- `BackendStatus` and `BackendError` carry no free-text fields.

### G. Writer

- Round-trips through the backend; handles match `/^vh_[0-9a-f]{32}$/` and are unique; fresh file and key
  are mode `0600` (skip on `win32`).
- **Nonce discipline (r2 #2):** via the seam, exactly one `randomNonce()` call per sealed record; the
  persisted `sealed.nonce` values equal those outputs; a mutant seam returning a constant nonce makes a test
  fail (two records with equal nonces is asserted impossible).
- **Exclusive key creation:** `generateLocalVaultKey` on an existing path throws and leaves the existing
  bytes unchanged.
- **Atomic replacement:** inject a failure between temp-write and rename; the previous vault is byte-identical
  afterwards and no temp file remains. An invalid entry is refused before anything is written.

### H. Dependency gate (§7)

- The gate **PASSES** on the M3 tree (`src/backends` imports only `core/*`, `shared/*`, `node:*`, and
  `libsodium-wrappers`). Include the gate's runtime traversal output for `libsodium-wrappers` in the report.
- The selftest matrix in §7 passes on the fixed gate, and the typed-package protected case **fails on the
  pre-fix gate** — include before/after output in the report.

### Compile-time negatives

`@ts-expect-error` guards: `resolveSecret` result not assignable to `string`; `resolveSecret` without the
policy argument; `ItemMeta` has no `canonicalOrigin`; `listItems` return has no `secret`/`sealed`; `new
BackendError('free text')` and `new BackendError('not-found', 'extra')` rejected.

## 7. Dependency-gate fix (verified gap; first commit on the branch)

**Finding (Claude, 2026-09-01, reproduced; confirmed by round 1):** `resolveSpecifier` resolves bare
specifiers with `ts.resolveModuleName`, which for a package that ships types lands on its **`.d.ts`**;
`addExternalEntry` then walks a declaration file with no runtime edges. A typed package whose `index.js`
does `require("../../src/supervisor/marker.ts")` **PASSES**; remove the `types` field and it **FAILS**
correctly. The gate follows the wrong artifact for every typed dependency, and `main` had no runtime
dependency to expose it. Recorded as G-1 in `docs/m2-review-findings.md`.

**Fix — the class, not the instance (r2 #5):**

- Resolve external specifiers with **Node-compatible, parent-aware resolution chosen by edge syntax**:
  `require`-style edges through the `require` condition set, `import`/re-export/dynamic-`import()` edges
  through the `import` condition set (`node`, `default` in both). **Scan the union** of the two resolved
  targets whenever they differ — the gate is an over-approximation by design, never an under-approximation.
- Honor `exports` (conditional and subpath, including `exports` sugar strings and arrays), `main`, and the
  `index.js` fallback; `.mjs`/`.cjs`/`.js` entries; package self-references; symlinked packages (resolve
  through `fs.realpathSync` so a symlinked workspace is scanned at its real path and not double-counted).
- **`.d.ts`/`.d.mts`/`.d.cts` are never traversal targets.** Keep TypeScript resolution only for in-repo
  `.ts` sources. Unresolvable runtime entry → **fail closed** as `unresolved`, never fall back to types.
- **Implementation latitude:** you may implement the `exports` algorithm directly, or use `createRequire(
  importer).resolve()` for the `require` branch and a minimal `exports` walker for the `import` branch.
  Do not add a runtime dependency to the gate; a tiny, pinned **dev**Dependency (e.g. `resolve.exports`) is
  acceptable if you justify it in the report. The gate must still resolve in-repo TS as today.
- **Selftest matrix** — each fixture in a temp `node_modules`, each with a **protected branch** (runtime JS
  reaches `src/supervisor`) that must FAIL and a **clean branch** that must PASS:
  1. typed package, `main` only (the original repro);
  2. conditional `exports` where the `import` branch reaches protected and `require` is clean, and the
     mirror;
  3. subpath export (`pkg/sub`) reaching protected while the root is clean;
  4. transitive: clean typed package depending on a typed package that reaches protected;
  5. `.mjs` entry and `.cjs` entry;
  6. package self-reference (`import "pkg/x"` from inside `pkg`);
  7. symlinked package directory.
- If the real `libsodium-wrappers` runtime traversal then fails closed on a construct the gate cannot follow
  (a non-literal `require` in the emscripten bundle is plausible), **stop and report with the exact
  violation output** — exempting a vetted crypto dependency is a planning decision (handoff §8).

## Contract conflicts — STOP, do not guess

`src/core/types.ts` and `SCHEMA.md` are locked. Pre-authorized: **none** — M3 needs no caller-visible
contract change (`CredentialBackend` is trusted-side). If you find you need one, stop and report why.

## Review sequence (§9.1, author-relative)

On `codex/m3-backend` while the diff exists, **per commit**: **1.** Claude `/review` · **2.** Claude
`/security-review` · **3.** Codex adversarial diff review. Codex implements, so the two Claude passes are
the different-family channels; the Codex pass is fresh-context but same-family. None certifies M3.
**Direct the security review at:** the single decrypt path and its `finally`; AD computed from the argument
and the golden vectors; foreign-exception containment; the validator; nonce discipline; atomic write; the
gate's resolver and each selftest fixture's legitimate-traffic control.

## Honest-claims rule

The claims this slice can make, and no others: *the backend holds no secret, key, or secret-derived
material between calls — shown by rotation, injected-decryptor, and key-file-removal tests plus structural
review of one decrypt path; the key and plaintext byte buffers TinyVault owns are zeroed before return on
success and throw; metadata calls never invoke the AEAD open primitive; a sealed secret cannot be
re-bound to a different origin, handle, or recipe without the key; and a secret is released only for the
policy the caller authorized.* Not claimed: string zeroization, WASM-heap hygiene, metadata confidentiality
at rest, anti-rollback, or any protection against a party with write access to the host's disk.

## Reporting

`handoff-pattern.md` §13: Summary / Files Changed / Verification (gate before/after output and the
`libsodium-wrappers` traversal output) / Risks & Follow-ups / **Deviations From Handoff**.
