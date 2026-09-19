# M3 Slice Spec — Backend Interface + libsodium Local-File Backend (Codex implementation handoff)

> **Status: revision 4 — LOCKED, IMPLEMENTATION-READY. The paper ladder is CLOSED at its round-3 cap; do
> not request another paper review.** Round 1: NO-SHIP, 8 findings. Round 2: NO-SHIP, 4 findings. Round 3:
> NO-SHIP, 4 findings (2 P1, 1 P2, 1 P3) — round-2's lead item (the TOCTOU compare) **CLOSED**; the four
> remaining are a wrong `exports` fixture, an incomplete zeroization contract, and two omissions from the
> r3 edit itself (Acceptance G never received the tests r3 promised; a stale review directive). **All four
> absorbed here** ("What changed from revision 3"). Per `handoff-pattern.md` §5 findings narrowed every
> round (design → tests → drift) and none reopened a primitive, so the spec is locked and remaining
> validation moves to code: the post-implementation ladder verifies the parsed-snapshot compare, the actual
> `try/finally` scopes, the fs trace, the flag on both gate invocations, and the real `libsodium-wrappers`
> traversal. Governed by
> [`phase-0-plan.md`](../../docs/phase-0-plan.md) §2, §4 (layer 1, the three lifetimes), §6, §8 (M3 row), §9.1;
> `SCHEMA.md`; and the standing decision *"never cache the secret; backend auth sessions may be cached"*
> (`.claude/memory/decisions_product.md`).

## Task

Implement M3: the trusted-side `CredentialBackend` interface and the **libsodium sealed local-file backend**
with policy metadata, plus **B1 slice 2/3 — the never-cache-the-secret backend contract**. Also close one
verified gap in the M2 build-time dependency gate that M3 is the first slice to actually exercise (§7).

No browser, no DOM, no fill service (M4). No 1Password (M9).

## What changed from revision 3, and why (read first)

1. **Fixture 9 demanded behavior Node does not implement (P1).** Node's `PACKAGE_TARGET_RESOLVE` returns
   the first syntactically valid array target; it does not skip a missing file. A resolver passing the r3
   matrix would have been *non*-Node-compatible. **Fix (§7):** fixture 9 now uses a genuine fallback (a
   first entry that is an invalid package target), a new fixture 11 checks **condition-object insertion
   order** (`default` listed before `import`/`require` wins), and the resolver is **mandated** to be Node's
   own — `createRequire(importer).resolve` for `require` edges and `import.meta.resolve(spec, parentURL)`
   under `--experimental-import-meta-resolve` for `import` edges, **with the flag on both the gate and the
   selftest invocations** (without it the parent argument is silently ignored). The `resolve.exports` and
   hand-written-resolver latitude is deleted; a finite matrix cannot prove a hand-written resolver
   Node-compatible, so we do not build one.
2. **Zeroization contract omitted TinyVault-owned key paths outside `resolveSecret` (P1).** **Fix (D3, D4,
   D6, C, G):** *one outer key `try/finally` beginning immediately before each key read or allocation and
   spanning every use; an inner per-record plaintext `try/finally`; nested so one cleanup failing cannot skip
   the other.* `probeAvailability` and `resolvePolicy` **never read key bytes** — they `stat` the key file
   for existence and 32-byte size. `generateLocalVaultKey` wipes the generated buffer on success and
   failure. Tests retain references through the seam for generation, writer success, first-record failure,
   and nth-record failure.
3. **Acceptance G never received the atomic-write tests r3 promised (P2).** **Fix (G):** overwrite of a
   `0640` vault yields `0600`; exact ordered trace (exclusive same-directory temp → write → fsync → close →
   rename); separate injected failures at write, fsync, close, and rename, each asserting prior bytes
   unchanged, no rename before a successful close, and no temp file left.
4. **The review directive still named the superseded AD-from-argument mechanism (P3).** **Fix:** reworded
   to the pre-open compare on the validated record snapshot followed by AD from that same policy.

Also from round 3's test-gap list: B asserts `Object.isFrozen(policy)` itself, not only the recipe; E adds
missing/non-array `fieldRecipe` and non-canonical (unpadded or whitespace-bearing) base64 negatives; the
wrong-key and corrupt-ciphertext cleanup cases are one cleanup mutation test plus separate functional
`integrity` cases (they exercise the same `open()` throw edge).

## What changed from revision 2, and why

1. **AD from the argument did not authenticate the record's *current* cleartext policy (P1, reopened
   round-1 #1).** AEAD verifies the ciphertext under the AD you supply; it says nothing about the metadata
   sitting beside it. Seal under A, edit only the metadata to B, call `resolveSecret(h, A)` → AD(A) matches
   → success. My r2 tamper tests demanded `integrity` there, which was internally impossible. **Fix (D2,
   D5, D-tests):** an **exact pre-open comparison** of the validated current record policy against
   `authorizedPolicy` (normalized origin, ordered recipe) — mismatch → `integrity` **without calling
   `open()`**; only then `open()` with the (now equal) policy's AD. The r2 sentence "no separate comparison
   path" is withdrawn; the compare is the mechanism and the AD is the cryptographic backstop.
2. **Zeroization tests missed the throw paths most likely to retain the key (P1).** **Fix (D4, D6, C, G):**
   the reader's `try/finally` must begin before the key-length check and cover `open()`; tests retain
   references through the seam and assert zeroing on success, `open()` failure (wrong key, corrupt
   ciphertext), and wrong-length key. The **writer** must zero its key and plaintext buffers around every
   seal, including an nth-record seal failure.
3. **Gate matrix admitted a non-Node-compatible `exports` resolver (P1).** **Fix (§7):** fixtures for
   `exports` string sugar, array fallback, wildcard subpath patterns, and a clean `main` that must be
   ignored when `exports` exists; both conditions asserted per fixture. Preference stated for Node's own
   resolver over a hand-written one. *(Superseded by r4 #1: Node's resolvers are mandated, fixture 9 corrected.)*
4. **Atomic replacement was vacuously tested and contradicted the mode rule (P2).** **Fix (D6, G):**
   replacement is **always mode `0600`** (the renamed temp inode's mode; "fresh files only" withdrawn);
   test overwriting a `0640` vault yields `0600`; the fs operations go through an injectable seam so the
   test verifies the trace (exclusive same-dir temp → write → fsync → close → rename) and injects failures at
   write, fsync, close, and rename.

Also from round 2's test-gap list: the same-file cache test reuses **one** policy object and asserts **two**
`open()` calls. The 1 MiB file cap is **cut** as v0.1 scope creep; file-size DoS by a host-disk writer is
recorded as residual risk.

## What changed from revision 1, and why

Round 1's findings, and how each was absorbed:

1. **Policy/secret TOCTOU (P1).** The fill gate resolves policy, authorizes, then resolves the secret; both
   calls re-read the file, so a keyed writer replacing the record in between made `resolveSecret` return
   secret B under authorization A. **Fix:** `resolveSecret(handle, authorizedPolicy)` — the caller passes
   back the exact policy it authorized, and the backend **computes the AEAD additional data from that
   argument, not from the file**. A re-pointed record fails authentication. The second call is bound to the
   first cryptographically, with no separate comparison path to get wrong (D2, D5). *(Superseded by r3 #1:
   AD alone does not authenticate the current cleartext metadata; an exact pre-open compare is now the
   mechanism and the AD is the backstop. Kept here as history.)*
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
   with a protected and a clean branch (§7). *(The "union" wording was amended post-implementation to
   per-syntax resolution — register C1.)*
6. **Writer could destroy the only key / tear the vault (P1).** **Fix:** exclusive key creation (`wx`),
   same-directory temp + fsync + atomic rename for the vault, mode-on-fresh-file only, with tests (D6, G).
   *(Mode rule superseded by r3 #4: replacement is always `0600`.)*
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
- **The reader compares before it opens (r3 #1).** `resolveSecret(handle, authorizedPolicy)` validates the
  file, finds the record, and **compares the record's current policy to `authorizedPolicy` exactly**
  (normalized origin string equality; recipe equality element-by-element in stored order). Mismatch →
  `integrity`, and `open()` is **never called**. Only on equality does it `open()` with
  `encodeAdditionalData(handle, policy)` — at that point the argument and the file agree, so which one
  feeds the encoder is immaterial; use the validated record's. Two layers, stated plainly: the comparison
  proves the file *still says* what the fill gate authorized (closing the TOCTOU); the AD proves the
  ciphertext was *sealed for* that policy (closing re-pointing by metadata edit).
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
  state to serialize. **`probeAvailability` and `resolvePolicy` never read key bytes** (r4 #2): they `stat`
  the key path and check for a regular 32-byte file; only `resolveSecret` (and the writer) ever hold key
  material, and every such holder wraps it in the outer `try/finally` of D4. Cost: one small file read per fill — negligible, and it keeps "the disk is the source of
  truth" exact for key replacement too.
- **`dispose()` is a no-op for local-file, with a comment saying why**: this backend holds no auth-session
  material. The `CredentialBackend` doc comment states the contract (`dispose` drops session material —
  an `op`/`bw` token — and **never** a secret, which no conforming backend holds between calls); M9's
  1Password backend is where that half is first exercised and tested.
- No passphrase, no KDF, no key rotation, no permission enforcement on read in v0.1 (stated).

### D4 — `resolveSecret` reads the vault at call time, every time, and holds nothing between calls

**One decrypt path, no module-level or instance-level data state.** The backend instance owns exactly the
two paths and the injected primitives — nothing else. Each `resolveSecret(handle, authorizedPolicy)`:
read vault → validate (E) → find record → **compare record policy to `authorizedPolicy`** (r3 #1) →
**enter `try`** → read key → check key length → `open(ciphertext, encodeAdditionalData(handle,
recordPolicy), nonce, key)` → decode UTF-8 → `new Secret(string)` → **`finally`: `memzero` the key buffer
and the plaintext buffer (whichever exist)** → return. **Cleanup structure (r3 #2, r4 #2): one outer `try/finally` owns the key buffer and begins immediately
before the key read (so the length check, `open()`, and decoding are all inside it); an inner `try/finally`
owns the plaintext buffer from the moment `open()` returns. Nested, so a failure in one `finally` cannot
skip the other.** A wrong key, a corrupt ciphertext, a wrong-length key, or a decoder failure all pass
through the same cleanup. Nothing secret-derived (length, hash, buffer, string) is assigned to any
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
  vault missing/invalid → `unavailable`; policy mismatch (pre-open compare) or AEAD failure (wrong key,
  tampered record) → `integrity`. **Order of checks: vault validity → handle lookup → policy compare → key
  → open.** A missing key with an unknown handle reports `not-found`, and a missing key with a mismatched
  policy reports `integrity` — the key is never read unless the record is the one that was authorized.

### D6 — a writer exists, as library code, for tests and fixtures

`src/backends/localFileWriter.ts`, data-plane, no CLI in this slice:

- `generateLocalVaultKey(keyPath)` — 32 bytes from `randombytes_buf`, written with flag **`wx`** (exclusive
  create), mode `0600`. An existing file → a plain `Error` with the fixed text `Key file already exists`
  (writer-side failures are not `BackendError`s; that class is reserved for the read path).
- `writeLocalVault(vaultPath, keyPath, entries)` — validates every entry **before** touching disk (origin via
  `originGuard`, stored in normalized form; recipe non-empty, no duplicates; `kind === 'password'`), mints
  handles, seals each entry with a fresh nonce, and writes **atomically** through an injectable fs seam
  (default `node:fs/promises`): exclusive same-directory temp file (`wx`, mode `0600`) → write → `fsync` →
  close → `rename` over `vaultPath`. On any failure at any step the previous vault is byte-identical and the
  temp file is removed. Returns the minted `ItemMeta[]`.
- **The replaced vault is always mode `0600`** — it is the renamed temp inode (r3 #4). A pre-existing vault
  with a looser mode is therefore tightened by replacement; the key file's mode is never changed by the
  writer.
- **Writer buffer hygiene (r3 #2, r4 #2):** `writeLocalVault` reads the key once inside **one outer
  `try/finally`** spanning every seal (not per seal — an inner key wipe would zero the shared key before
  record two); each entry's UTF-8 plaintext buffer lives in an **inner per-record `try/finally`**. Both
  are zeroed on success and when the first or the nth seal throws. `generateLocalVaultKey` zeroes the
  generated key buffer after the write, on success and on failure.

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
  (`Object.isFrozen(policy)` **and** `Object.isFrozen(policy.fieldRecipe)`; a push throws in strict mode). *Kills:* a shallow freeze that lets
  M4 mutate the recipe after authorization.
- A record whose stored `canonicalOrigin` fails `originGuard` (path, trailing slash, `ftp:`, whitespace,
  uppercase or default-port spellings that are *not* normalized, and the Appendix A lookalike encodings from
  `m2-slice-spec.md`) → `unavailable`. *Kills:* trusting stored metadata.

### C. B1 slice 2/3 — never cache the secret

- **Backend-level rotation:** vault `h → A`; resolve → `A`; rewrite `h → B` (same handle/policy/key, fresh
  nonce); resolve → `B`. *Kills:* a record/secret/file cache.
- **Same-file repeated resolution with an injected decryptor (r2 #3):** file unchanged; **the same policy
  object** is passed both times; the injected `open()` returns different plaintext on each call; two
  resolves return the two different values **and the seam counted exactly two `open()` calls**.
  *Kills:* an mtime-, content-, or policy-identity-keyed cache that the rotation test cannot see.
- **Revocation:** rewrite without `h`; resolve → `not-found`; `listItems` no longer lists it. *Kills:* an
  in-memory ghost.
- **Buffers zeroed on every path (r3 #2):** through the seam (and an injected fs seam for the key read),
  retain references to the key buffer and the plaintext buffer; assert all-zero after (i) success, (ii)
  `open()` throwing (one cleanup test on the throw edge; wrong-key and corrupt-ciphertext are separate
  *functional* `integrity` tests), (iii) a wrong-length key (the buffer that was read is zeroed even though
  `open()` never ran), and (iv) a decoder failure after `open()`. *Kills:* a `try` that begins after the key
  read or after `open()`.
- **Metadata paths never touch key bytes (r4 #2):** through the fs seam, assert `probeAvailability` and
  `resolvePolicy` perform no read of `keyPath` (stat only), across valid, missing, and wrong-size key
  files. *Kills:* a probe that reads the key to check it and leaves the buffer unwiped. State verbatim in the test file:
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
- **Policy-swap between calls (the TOCTOU, r3 #1):** `p = resolvePolicy(h)`; rewrite `h` with a different
  origin **and** a different secret (valid, keyed — a legitimate re-seal); `resolveSecret(h, p)` →
  `integrity` and the seam counted **zero** `open()` calls. *Kills:* opening before comparing, and any
  implementation that releases a secret for a policy the file no longer carries.
- **Metadata-only edit (r3 #1):** seal under A; edit only the cleartext `canonicalOrigin` to B.
  `resolvePolicy(h)` returns B (cleartext, expected). `resolveSecret(h, A)` → `integrity` with **zero**
  `open()` calls (compare fails). `resolveSecret(h, B)` → `integrity` with **one** `open()` call (compare
  passes, AEAD fails — the ciphertext was sealed for A). *Kills:* skipping the compare, and sealing without
  policy-bound AD. Same shape for a tampered `fieldRecipe` and for swapped `sealed` blobs between two
  records.
- Wrong key → `integrity`. Truncated or bit-flipped ciphertext → `integrity`. Wrong-length key → `locked`.
- Rollback (restore an older authentic file) is **not** tested and is stated out of scope in the module header.

### E. Boundary validation (`localFileFormat.ts`)

- Reject: unknown `version`; non-array `records`; extra keys at top level, on a record, or inside `sealed`;
  missing/non-string `label`; non-string `account`; `kind !== 'password'`; missing, non-array, empty, or
  duplicate-role `fieldRecipe`; unknown role; duplicate handles; handle not matching
  `/^vh_[0-9a-f]{32}$/`; nonce/ciphertext that is not **canonical padded standard base64** (unpadded,
  URL-alphabet, or whitespace-bearing strings are rejected even if decodable); wrong-length nonce;
  ciphertext shorter than the AEAD tag. Each → `probeAvailability` reports `error`
  and `resolvePolicy`/`resolveSecret` throw `unavailable`. *Kills:* trusting the file shape. (No file-size
  cap in v0.1 — cut as scope creep, r3; oversized-file DoS by a host-disk writer is residual risk.)
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
  bytes unchanged. **Generated key is wiped (r4 #2):** through the seam, the generated buffer is all-zero
  after a successful write and after an injected write failure.
- **Writer buffers wiped (r4 #2):** through the seams, the key buffer and every plaintext buffer are
  all-zero after success, after the first seal throws, and after the nth seal throws; the output file is
  absent in both failure cases. *Kills:* a per-seal key wipe (record two would fail to seal) and a missing
  outer `finally`.
- **Atomic replacement, verified by trace (r3 #4, r4 #3):** through the fs seam, the recorded operation
  sequence is exactly: exclusive (`wx`) temp file in `vaultPath`'s directory → write → `fsync` → close →
  `rename` to `vaultPath`; no other write to `vaultPath`. *Kills:* a direct overwrite after the checkpoint,
  a non-exclusive temp, and a missing `fsync`.
- **Failure at every step:** inject a failure at write, at `fsync`, at close, and at `rename` separately;
  after each, the prior vault is byte-identical, no `rename` occurred before a successful close, and no temp
  file remains. An invalid entry is refused before anything is written.
- **Replacement mode:** overwrite a pre-existing `0640` vault; the result is `0600` (skip on `win32`).

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
  through the `import` condition set (`node`, `default` in both). **Each edge is resolved by its own syntax
  only** — *amended post-implementation (register C1)*: r4 said "scan the union of the two resolved
  targets"; the implementation resolves per syntax, which is the Node-accurate model (an `import` edge can
  never load the `require` branch), and fixtures 2/11 assert it. The over-approximation rule below still
  holds: anything the resolver cannot follow fails closed.
- Honor `exports` (conditional and subpath, including `exports` sugar strings and arrays), `main`, and the
  `index.js` fallback; `.mjs`/`.cjs`/`.js` entries; package self-references; symlinked packages (resolve
  through `fs.realpathSync` so a symlinked workspace is scanned at its real path and not double-counted).
- **`.d.ts`/`.d.mts`/`.d.cts` are never traversal targets.** Keep TypeScript resolution only for in-repo
  `.ts` sources. Unresolvable runtime entry → **fail closed** as `unresolved`, never fall back to types.
- **Resolver — MANDATED, not preferred (r4 #1): Node's own resolvers, nothing hand-written.**
  `createRequire(importerPath).resolve(specifier)` for `require`-style edges;
  `import.meta.resolve(specifier, pathToFileURL(importerPath).href)` for `import`/re-export/dynamic-`import()`
  edges. The parent argument is honored **only** under `--experimental-import-meta-resolve` — without the
  flag it is silently ignored and resolution happens relative to the gate script — so **both** the gate
  invocation and the selftest invocation in `package.json` carry the flag, the script header documents
  why, **and the gate refuses to run unflagged** (post-impl register B2). Catch resolution errors and treat them as `unresolved` (fail closed). No `resolve.exports`, no
  hand-written `exports` walker, no new dependency of any kind for the gate. In-repo `.ts` sources keep
  TypeScript resolution as today.
- **Selftest matrix** — each fixture in a temp `node_modules`, each with a **protected branch** (runtime JS
  reaches `src/supervisor`) that must FAIL and a **clean branch** that must PASS:
  1. typed package, `main` only (the original repro);
  2. conditional `exports` where the `import` branch reaches protected and `require` is clean, and the
     mirror;
  3. subpath export (`pkg/sub`) reaching protected while the root is clean;
  4. transitive: clean typed package depending on a typed package that reaches protected;
  5. `.mjs` entry and `.cjs` entry;
  6. package self-reference (`import "pkg/x"` from inside `pkg`);
  7. symlinked package directory;
  8. `exports` **string sugar** (`"exports": "./runtime.js"`) with a **clean `main`** that must be ignored;
  9. `exports` **array fallback** — the first entry is an **invalid package target** (e.g. `"http://x"` or
     `"../outside.js"`) so Node advances to the second, which reaches protected; mirror with a clean second
     entry. (r4 #1: a *missing file* is NOT a fallback trigger in Node — the r3 fixture was wrong.)
  10. **wildcard subpath pattern** (`"./features/*": "./src/features/*.js"`) where the matched target
      reaches protected while the root is clean;
  11. **condition insertion order** (r4 #1): `{"default": "./clean.js", "import": "./protected.mjs"}` —
      Node takes `default` first, so this fixture is **clean** for both edge kinds; mirror with `import`
      listed first, which is protected for `import` edges only.
  Every fixture asserts **both** the `import` and the `require` outcome (r3 #3). Because the resolver is
  Node's own, the matrix is a **regression suite for the gate's use of it**, not a proof of resolver
  compatibility — say so in the selftest header.
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
**Direct the security review at:** the single decrypt path and its nested `finally` scopes; **the exact
pre-open policy comparison on the validated record snapshot, followed by AD computed from that same record
policy** (and that compare and `open()` use one parsed snapshot, not two reads); the golden AD vectors;
foreign-exception containment; the validator; nonce discipline; the fs trace of the atomic write; that the
flag is on both gate invocations; the real `libsodium-wrappers` traversal output; and each selftest
fixture's legitimate-traffic control.

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
