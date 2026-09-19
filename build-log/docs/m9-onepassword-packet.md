# M9 — 1Password backend proposal

> **Current disposition — 2026-09-18:** The user's final [M9 Entry156](m9-review-findings.md#entry156--2026-09-18-user-directed-abandonment-and-claude-handoff) supersedes pending calibration/continuity and broad V1 launch obligations below. LP2-CONTINUITY, LP3, AM/AP/AS and normal route N are abandoned residuals, with no further work. Prior contracts, counts, caps and failures remain historical evidence. V1 is now the [manual operator smoke](../../docs/onepassword-setup.md#v1-manual-operator-smoke-test); natural expiry, Linux and denial-format classification are limitations. Claude owns the next session. The historical text below is not authorization to resume abandoned work.

Revision 7 — 2026-09-13. **D9 LOCKED; offline S1–S4 implementation APPROVED 2026-09-13 (Entry55).**
**D1–D9/N1–N8 approved. Offline implementation authorized; provider/commit/release actions remain separate.**

Revision5's five paper rounds remain closed: Claude plan/Sol conditional PASS, Claude security
NEEDS-ATTENTION with both mandatory P2 proof conditions and reading limits retained in
[Entry7](m9-review-findings.md#entry-7--2026-09-12-extended-review-complete-no-unresolved-paper-p1).
Revision6 approved the D8 archive limitation with scoped review (Entry44). Revision7 adds only the
provider-dependent grammar/fixture and implementation approval boundary; prior reviews are not restarted
or relabelled. The full revision6 snapshot is retained with Entry52. D1–D7/N1–N8 were approved in Entry10;
D8 is approved in Entry43. V0 attempts01–04 retain their literal INCONCLUSIVE outcomes; Entry51 records the completed attempt04 observation schedule and its limits.

Continuity owner: Codex Astra, `2026-09-13-m9-v0-prep`, direct active session. Base/head:
`87e81b8168703e5b76e0b1659543a4b4ec80f988`, `main`, sole registered worktree
`/Users/jonathanavni/Documents/Coding/tinyvault`. Review the dirty documentation candidate by
its helper-recorded inventory digest, not by HEAD alone. Findings: [M9 register](m9-review-findings.md).
The closed prior-owner handoff/unchanged revision5 review history remain in Entries7–8 and the
external frozen revision5 snapshot recorded in Entry43. Offline implementation is authorized by Entry55; no new provider run is authorized.

## 1. Outcome, scope and non-goals

Deliver the smallest real password-manager backend for the existing library and nine-tool MCP
entry: one account, one dedicated custom vault, an operator-maintained item-ID allowlist, standard
Login/password fields, one canonical origin per record. Keep local-file as the default free/offline
backend. Prefer **1Password CLI 2 with service-account read access**; Bitwarden is post-launch.
A successful first authorized fill resolves the current password, never returns it to the model,
and consumes the existing per-handle budget. Another list, renamed item, rotated password, new
browser session or setup call cannot create another budget in the same process.

Non-goals: username/TOTP/custom-field fill, arbitrary secret references, name lookup, multiple
accounts/vaults, discovery of all personal items, automatic provisioning, interactive desktop unlock,
Connect, SDK fallback, password writes, vault editing, persistent sessions/caches, automatic retries,
hot config reload, renewal tools, per-caller entitlements, launch publication, new eval/cohort or
paid installed-client runs. Existing local-file behavior, measurement thresholds and histories stay.

Planning and scoped reviews are complete. Entry55 authorizes the production/test files below within
S1–S4, leaving the candidate uncommitted. Commit/merge/push and real-provider operations remain separate.

## 2. Approved conflict dispositions (Entries10/43/55)

| ID | Existing authority | Proposed disposition and consequence |
|---|---|---|
| D1 | Phase-plan §1 row 4 and §6 select `@1password/sdk`; PROJECT-SPEC §6 accepts `op` or `bw` | Select CLI, no SDK dependency. Amend those two phase-plan locations at approved implementation. CLI gives an inspectable process boundary but adds subprocess lifecycle work. Bitwarden deferral satisfies the launch OR requirement; broad long-term backend goal remains. |
| D2 | `CredentialBackend.resolveSecret` / phase-plan §6: compare current policy **before decrypting**, mismatch means no decrypt | For 1Password only, fetch one secret-bearing item detail after trusted fill admission; validate returned identity/category/policy and optional state shape under D8 before constructing `Secret`. The CLI has already decrypted the item inside trusted code. Preserve the stronger local-file pre-decrypt guarantee. This is an explicit weakening of that backend timing requirement, not a claim that `op read` is equivalent. Without approval, the CLI design is BLOCKED. |
| D3 | Phase-plan rationale asserts `op item list` natively carries canonical URLs and is metadata-only | Official pages describe listing but do not provide a complete normative JSON contract. Treat required shape, archive-at-discovery behavior under D8 and metadata-only behavior as a provider-compatibility gate, not an established fact. Never substitute `item get` during discovery to pass it. |
| D4 | BACKLOG S4 residual: trusted backend stalls can outlive abort trigger | Give this adapter hard method bounds and disposal cancellation, without claiming arbitrary third-party backends or all host shutdown work is bounded. Keep active MCP notification cancellation response-only. No new core cancellation API in this minimum slice. |
| D6 | retention.test.ts:100–110 rejects all Secret constructors outside the fixed six files | Add the one AST-pinned direct constructor/import in onepassword.ts under the separate M9 shape gate; preserve all other outside-set consume/expose/open/decrypt/constructor bans and the old six-file analyzer. Exact S3 ownership and mutants in §8. Requires user lock. |
| D7 | docker-invocation.mjs requires exact capability-import permissions, independently of dependency hygiene | Add only the three §8 path/specifier rows and the new MCP test profile, with named selftests. Preserve checker grammar/current permissions and assign the trusted dynamic opPath spawn-shape proof to the M9 AST gate explicitly. Requires user lock; no blanket capability permission. |
| D8 | Revision5 §5/§7/T4 requires explicit active detail state and archive-by-ID denial | **APPROVED 2026-09-13:** archive-after-discovery is not revocation. Keep archive exclusion during initial discovery; an already eligible item may still resolve after archiving, subject to all other checks/budgets. Detail state may be absent; optional state must follow §5. Update setup/README/planned tests; deletion/revocation behavior remains a verification gate, not an observed guarantee. |
| D9 | V0-dependent exact JSON grammar/version/fixture were deliberately unpinned | **APPROVED Entry55:** adopt §3.1’s location-specific observed-core schema, declared optionality/resource limits and minimal-shape compatibility cost as the production parser contract; use F0 synthetic fixtures, not private reports or the diagnostic parser. |

D1–D7/N1–N8 decisions are approved (Entry10); their implementation-stage crosswalk remains gated.
D8 is approved for this proposal and human-facing limitation; its narrow independent review is complete with recorded limits (Entry44).
Entry55 separately authorizes the bounded offline production/test/gate implementation.
The remaining design is contingent on D2 and the provider feasibility gate, not an instruction to
silently choose another primitive if either fails. No M8 paper/implementation round is reopened.

**D5 — timing claim decision:** phase-plan §2/§4 and M4’s honest-claims rule describe the
measured fill/mutex Probe P result on its fixed harness. The new remote CLI path adds variable
transport/parsing work inside that mutex. Recommend explicitly excluding provider-fetch latency
from the M9 timing-security claim; retain existing six-probe tests/thresholds and their exact scope.
The4s deadline is availability protection, not timing normalization. D5 was approved in Entry10; retain this explicit limitation at implementation lock and never
claim coverage from the existing synthetic-backend tests for remote latency. No new statistical acceptance family is silently added.

## 3. Evidence and provider compatibility boundary

Research checked 2026-09-12, official sources only. **Documented** is different from **observed**.

| Source | Documented behavior relevant to this proposal |
|---|---|
| [Service-account setup](https://www.1password.dev/service-accounts/get-started) | CLI ≥2.18.0; service token; selectable vault access/permissions; built-in Personal/Private/Employee/default Shared vaults excluded; immutable access scope. |
| [Management](https://www.1password.dev/service-accounts/manage-service-accounts) | Creation permissions depend on account role; token rotation/revocation are operator operations. |
| [Rate limits](https://www.1password.dev/service-accounts/rate-limits) | Individual/Families, Teams and Business supported, with different quotas; Business is not a prerequisite. Avoid polling and retries. |
| [Service account with CLI](https://www.1password.dev/service-accounts/use-with-1password-cli) | `OP_SERVICE_ACCOUNT_TOKEN`; Connect variables take precedence; `op user get --me` is the documented auth check. |
| [CLI reference](https://www.1password.dev/cli/reference) | IDs are 26 alphanumeric characters and stable until item move; JSON format, config and cache flags; UNIX cache enabled by default, encrypted daemon cache; `--cache=false` disables it. |
| [Environment](https://www.1password.dev/cli/environment-variables) | Configuration directory is read/written; app-integration, account/session/debug/archive/format environment controls exist. |
| [Item commands](https://www.1password.dev/cli/reference/management-commands/item) | List supports vault/category filters; get returns item details. ID lookup can retrieve archived items despite default archive exclusion. Move creates a new item ID. |
| [Fields](https://www.1password.dev/cli/item-fields) | Standard password has ID `password`, type `CONCEALED`, purpose `PASSWORD`; website URL is distinct from a custom URL field. |
| [References](https://www.1password.dev/cli/secret-reference-syntax) / [read](https://www.1password.dev/cli/reference/commands/read) | Names/IDs and case-insensitive references create aliases; read returns a value, without a documented policy/version envelope. |

**Historical revision5 planning-session observations (2026-09-12, not current status):** expected clean main tip and sole registered worktree; prior owner
closed and desktop M8 task idle. Process inspection initially required sandbox escalation, then worked;
lingering app/MCP infrastructure and old scratch cwd references remain, no identified running gate/review.
`command -v op` found no executable on PATH. No CLI version/help/auth command ran, no account/token or
`.env` was read, and no vendor JSON was captured. No new deterministic tests or mutants ran.

**Original V0 target:** CLI2.39.0, listed at planning time on the
[official release page](https://releases.1password.com/developers/cli/) (2026-08-14).
Subsequently installed/observed on Darwin arm64 under separate approvals (Entries17/27/31/40/51);
measured binary hash retained there. Linux compatibility remains unverified.

**Current V0 boundary (Entry51):** separately authorized attempt04 completed all seven scheduled
observations on pinned Darwin arm64 CLI2.39.0. LIST excluded C and returned exact A/B/D metadata;
A/B detail identity/origin/password shape and hidden-reference equality passed; C detail was retrievable
by ID and explicitly ARCHIVED. A/B omitted state. All three details contained the finite candidate
entropy/password_details names/types with no remaining unknown keys in this sample. Tokenless
refusal and point-in-time owned-group/runtime cleanup were observed. The helper's literal outcome
remains INCONCLUSIVE with scheduled_checks_satisfied=true; earlier attempts/failures remain unchanged.
These observations clear the sampled schema/B/C/control feasibility blockers under D8, supporting
preparation of the exact sanitized parser contract. They do not themselves lock a production allowlist,
prove C plaintext equality, establish Linux support or pass V1. Old anonymous attempt03 keys are not
retrospectively identified. Official docs do not promise a transactional snapshot, version-conditioned
read or stable typed CLI failure taxonomy; no such guarantee is inferred. String-metadata sensitivity,
escaped descendants/global writes and permanent cleanup remain disclosed evidence limits.

V0 is the pre-implementation feasibility stage; V1 is adapter acceptance. Before production parser implementation, separately authorized operator verification
must establish the required list/detail shape using a disposable vault and synthetic Login records.
A human-approved sanitized schema fixture and exact CLI version pin become the parser contract.
After deterministic implementation, V1 verifies the real adapter on that pinned CLI (§9). If list lacks
websites, required bounded identity/policy/password detail shape cannot be established, or archive
exclusion at discovery is unsupported, STOP: propose another reviewed backend contract; never fetch plaintext during policy/list to work around it.
Implementation-ready here means exact boundaries/algorithms and gates are specified; provider-dependent
parser bytes and final lock are explicitly gated by V0, rather than guessed.

### 3.1 D9 — exact parser contract (approved Entry55)

D9 locks the following narrow **TinyVault acceptance grammar**, not a universal 1Password JSON
specification. Its observed core comes from human-released attempt04, SHA256
`016fe794c77cc2447a32c597e6dffe752ebb5c08c58bb5eaf90d2e5bf6995305`, with the diagnostic
source/card pinned in Entry46. PROBE names/types and account-ID predicate originate in the
released attempt02/Entry31 report (SHA256 f1354847516f19bf64ef191d221cb6d61438f2626deff6a38ead2011bb2c027c);
attempt04 corroborates its exact-profile checks, not a second printed profile schema. This finite
sample does not establish a shape for every account. The full reports remain outside the repository. The schema recipe
below is the canonical sanitized fixture specification for implementation; tests must create fresh
synthetic records/values in the already-owned test helper, never load private reports or /tmp artifacts.
Original reports retain INCONCLUSIVE. Owner accepts their finite evidence as sufficient under Entry55
for this parser design under D8, not as V1 or production acceptance.

**Pin and observed envelope.** Version text, after ASCII whitespace trimming, must equal `2.39.0`
under the16KiB version cap. Entry17 records binary byte count/digest; Entry46 pins the
observer/card and exact §6 argument order used by the authorized Entry47/50 run. Entry51 interprets
A/B equality checks against the card’s16/64-unit hidden references; those lengths are not plaintext
or a numeric-length field in the released report. Version matching cannot detect server-side schema drift.
Darwin arm64's observed binary is41016304bytes, SHA256
`f48b97df4dfdccc67483587b40a596f70881eac05a576de7b7775d267375757a`.
This digest is the operator-installation/evidence pin; §6's trusted absolute executable and runtime
version check remain the implementation boundary. Do not silently add a runtime digest bypass for
fake executables or claim --version authenticates executable code. A trusted operator/same-user
process controls this executable, as already assumed. Linux remains in the approved POSIX design
but its binary pin and real-provider/process acceptance are unverified; fake Linux tests cannot
qualify it. Do not publish support beyond verified OS/binary combinations or waive the existing gates.

**Closed grammar.** Decode strict UTF-8 and JSON; reject duplicate *decoded* object keys at every
level (including escaped spellings), trailing data, non-JSON constants and non-finite numeric values.
The owning module is onepasswordMetadata.ts: use TextDecoder('utf-8', {fatal: true}) and a
bounded JSON-token scan that detects decoded-key duplicates before ordinary object extraction.
Bare JSON.parse or a reviver cannot establish duplicate absence; Buffer.toString('utf8') is not
strict decoding. The scanner must validate JSON escape/string/number syntax, depth and node count
before location validation; an optional later JSON.parse is allowed only after that scan. No new
module/dependency, prototype traversal/merge or provider-key-based assignment to application state.
Use own properties. Version output uses the same fatal UTF-8 rule before exact ASCII trimming;
invalid version bytes map unsupported-version/error or unavailable, with zero authenticated spawns.
Keep1MiB list/detail and16KiB probe bounds. Proposed defensive parse bounds are maximum depth12
(root depth0) and65,536 value nodes (root and each object value/array element count once, keys do not).
These are declared resource limits, not observed large-vault capacities; overflow maps unavailable,
never truncation. The1024-row list cap remains, with byte/node limits also applying. Malformed JSON,
duplicate keys, forbidden keys, wrong primitive/container types or non-finite numbers map integrity
(list/detail), error (probe); resource overflow is error for probe. No new dependency or module is added.

`S` below means a JSON string (all values, including metadata strings, may be sensitive); `N` a finite
JSON number; `B` a JSON boolean. Keys in the Required column are mandatory; Optional-column keys
may be absent independently and must match the listed type when present. Null is not absence.
Optionality beyond the concrete sample is an explicit grammar choice; no claim the sample exercised
every missing-key combination. No key not listed at its exact location is accepted.

| Location | Required keys | Optional keys | Meaning after shape validation |
|---|---|---|---|
| LIST root | array of0–1024 row objects | none | Validate whole response before publishing any discovery state. |
| LIST row | `id:S`, `vault:Vault`, `category:S` | `title:S`, `version:N`, `last_edited_by:S`, `created_at:S`, `updated_at:S`, `additional_information:S`, `urls:URL[]` | IDs must be canonical lowercase26, vault must equal configured vault, category exactly LOGIN; duplicate IDs/wrong-vault/category reject even for unconfigured rows. |
| DETAIL root | `id:S`, `vault:Vault`, `category:S` | same optional keys as LIST row, plus `state:S`, `fields:Field[]` | Exact requested identity, category, frozen policy, D8 state and selected password rules below; no new eligibility. |
| Vault | `id:S` | `name:S` | Lowercase26 ID and exact configured vault; name discarded. |
| URL | `href:S` | `label:S`, `primary:B` | Every website participates in §5's origin derivation. Never select only primary/first URL. |
| Field | `id:S`, `type:S` | `purpose:S`, `label:S`, `value:S`, `reference:S`, `entropy:N`, `password_details:PasswordDetails` | IDs nonempty/unique; present purpose strings unique across fields (including empty strings); selection by exact built-in id/purpose only. Other type/purpose strings are opaque, never new fill kinds. |
| PasswordDetails | `entropy:N`, `generated:B`, `strength:S` | none | Allowed only on the selected built-in password field; validate and discard, never affect strength policy, eligibility, identity or budget. |
| PROBE root | exactly `id:S`, `name:S`, `email:S`, `type:S`, `state:S`, `created_at:S`, `updated_at:S`, `last_auth_at:S` | none | `id` matches uppercase ASCII `[A-Z0-9]{26}`, type SERVICE_ACCOUNT, state ACTIVE. Account ID is not a vault/item ID; no case folding or grammar reuse. |

During grammar validation, perform an internal scan of structurally typed fields: any field with
entropy/password_details must itself have id=password, type=CONCEALED and purpose=PASSWORD.
This scan validates placement without extracting a secret; it does not yet classify absent/multiple
password candidates. Duplicate field IDs or present purposes are grammar-integrity failures. Once
this phase passes, later candidate absence/multiplicity use the semantic order below. This makes
“selected built-in field” precise even for a multiply malformed response. Field-level entropy has
the same placement restriction. Missing either
entropy or password_details is permitted; if password_details is present all three children are
required. Booleans are not numbers. Neither numeric metadata value nor version is used as a revision
lock; a changed version does not invalidate same-ID password rotation. No entropy/strength thresholds.
A JSON-number shape was observed for detail version/entropy; integer/range semantics are not inferred.

**Exact semantic/error order.** Apply method/auth/byte checks, fatal UTF-8 decoding, then the
bounded JSON scanner (syntax, decoded keys, depth/nodes), then the entire location grammar including
field uniqueness/metadata placement, then identity/category. First detected scanner violation wins;
syntactically valid unique-key over-limit inputs reach resource-overflow before location rejection. For DETAIL, apply D8 state next: absent is unspecified, ACTIVE/ARCHIVED may
continue only for previously eligible handles, DELETED is not-found, any other string is integrity.
Then require valid websites matching frozen origin/policy (missing/empty/invalid/different is integrity).
Then locate password candidates by `id == password OR purpose == PASSWORD`: none/missing fields is
not-found; more than one is integrity. The unique candidate must have id password, type CONCEALED,
purpose PASSWORD, no section, and a string value; missing/empty value is not-found, wrong identity/
type/purpose/section is integrity. All fields are shape-validated, including unselected fields with
missing values. Password domain and Secret-construction/admission ordering remain exactly §5.
An untyped nonzero CLI failure stays unavailable, never decoded as a deleted/revoked typed cause.

For LIST, missing/empty/unsuitable websites omit the configured record only under §5's unchanged
URL-suitability rule; malformed URL containers/member types reject the entire response. Suitability of
valid unconfigured rows does not matter, but their structural/identity checks still apply. A missing
LIST state is not inferred ACTIVE: archive exclusion relies on the fixed default LIST operation and
its measured compatibility. LIST state is not in this narrow allowed grammar; unexpected state or
other extra fields reject, not a silent discovery refresh or an archive-by-ID permission.

**Compatibility cost (part of D9 approval).** This observed minimum does not accept unobserved
`tags`, `favorite`, `sections`, `files`, `document_attributes`, field `section`, password history or any
new provider key. A dedicated vault containing unsupported row/detail attributes may refuse even if
a person regards the extra attribute as harmless. Do not ignore these fields or fetch details to
repair discovery. Keep launch records within the documented minimal Login shape; extending it needs
scoped evidence/review and an explicit updated grammar. Provider-side schema additions can cause
this refusal even with unchanged CLI2.39.0. Uppercase/mixed-case item/vault IDs refuse the whole
response; uppercase config IDs fail startup. Lowercase is TinyVault’s deliberately narrow sampled
record-ID restriction, not a vendor-wide guarantee; account PROBE uses its distinct uppercase rule.
Present-purpose uniqueness also rejects two non-selected fields with the same purpose, including two
empty strings. That narrow compatibility cost is deliberate and not inferred as universal provider behavior. Recognizing a non-selected field's opaque
type/purpose string does not support custom-field/username/TOTP filling. Every returned string is
trusted-boundary-only; metadata-only here describes allowed response structure, not proof that a
user never placed a secret in a title/URL/metadata string.

**Canonical fixture recipe (F0).** This is an authored synthetic recipe derived from sanitized shapes,
not copied user JSON or user passwords. Build three LIST rows: one with URLs absent (D), one with one
URL (A), one with two same-origin distinct paths (B); all contain the observed optional scalar metadata
keys and Vault name. URLs exercise both presence and absence of primary. DETAIL A/B/C contain three
fields: username-like non-selected field with value/reference, the exact built-in password with value,
reference, entropy and password_details, and notes-like non-selected field with reference but no value.
All three fields have id/type/purpose/label; use fresh synthetic constants for every value and ID.
DETAIL roots include the observed scalar metadata/Vault name and valid website arrays: A/C one,
B two distinct paths on the same origin (exercise changed order/primary flags). A/B omit state, C uses ARCHIVED. A/B passwords are independently authored16/64 UTF-16-unit values,
not the hidden references used in live V0; C uses an independently authored supported value. PROBE
uses all eight synthetic strings with ACTIVE/SERVICE_ACCOUNT/uppercase26 id. No real account data,
private IDs, entropy/strength values, report ordering guarantee or report path becomes a test input.

F0 must be represented in the existing S1 test/helper ownership; no additional source/test/fixture file
or production import of that helper is granted. The minimal absent-optional-field cases, explicit D8
state positives/negatives, equivalent URL ordering, ignored-value changes, unsupported extras and
escaped duplicate keys are separate synthetic variations, not mislabeled observed V0 cases.
Name DETAIL urls-absent → integrity and fields-absent → not-found, with otherwise valid input.
The no-section semantic rule is intentionally redundant with closed Field keys; do not count an
unreached downstream section mutant as an independent kill. Use valid JSON 1e999 for non-finite
number rejection, distinct from invalid NaN/Infinity tokens. “Strict UTF-8” constrains input bytes;
JSON escapes still produce JavaScript UTF-16 strings. Unpaired surrogate escapes are not malformed
UTF-8 and are not silently added to the password exclusions: preserve §5’s1–4096-unit/no-CRLF domain,
with a deterministic transport-fidelity witness for such a synthetic value. Any inability to preserve
that supported value blocks acceptance for an explicit contract disposition; no normalization claim.

D9 does not copy the Python diagnostic parser into production. Its global known-key set, lower-case
legacy probe branch, receipt/report machinery, temporary source paths and always-INCONCLUSIVE label
are not a production parser contract. Only this location-specific grammar, §5–§7 behavior and the
existing S1–S4 ownership/gates govern the TypeScript implementation.

## 4. Authentication and operator configuration

Vendor least privilege: a dedicated **custom vault** containing only agent-approved Login records,
service account with **read_items only**. No write/share/create-vault/Environments permission. Operator
must have permission to create the account and grant that vault; account creation is operator-confirmed, while actual grants remain independently unverified.
The TinyVault allowlist is application filtering, not a vendor item-level ACL: the token can read the vault.
Keep unrelated records and additional sensitive fields out of that vault. A malicious same-user shell or
parent with the token file can bypass TinyVault; this is not a sandbox against its trusted operator.

Proposed trusted configuration (library options; MCP reads the JSON file at the absolute path in `TINYVAULT_1PASSWORD_CONFIG`):
`{opPath, tokenPath, vaultId, items:[{itemId,label}]}`. All paths absolute; exact known keys; 1–64 entries;
IDs exactly 26 ASCII alphanumeric characters with one canonical lowercase encoding, reject uppercase
rather than normalize. Entry27’s three successful V0-M9-DARWIN-01 LIST inspections confirmed
canonical lowercase item/vault checks for this sample; Entry51’s exact fixture identities corroborate
that sample, not all provider deployments. This closes the sampled prerequisite only; D9 explicitly
retains the compatibility restriction and separate uppercase account-ID grammar. Duplicate item IDs fail startup,
even with different labels. Labels are operator-approved metadata, 1–128 characters, no control chars.
No free-form argv, environment map, secret reference, field selector, URL override or auth token in JSON.
Freeze the validated config and handle map for the backend lifetime; no reload or fallback.

`TINYVAULT_BACKEND` absent or `local-file` preserves current vault/key configuration; `onepassword`
selects the new config path. Unknown selection, malformed config, or mixed backend-specific config is a
fixed startup error. The account is the single service account represented by the configured token;
V0 verifies its intended vault. Bind the first valid token’s SHA-256 fingerprint atomically before
any authenticated spawn and retain that private auth fingerprint until disposal. Every subsequent method that needs authenticated provider work
rereads and fingerprints the token before spawn; any changed token is locked/not_authenticated
and latches an auth-changed state requiring deliberate restart, even if its account or permissions are equivalent.
Restoring the original token cannot clear this latch; subsequent authenticated operations fail locked
without spawning. Probe returns not_authenticated. Already admitted calls may finish using the original
bound token, but no changed token is ever used; immutable metadata may still be listed. Concurrent first
reads use one synchronous compare-and-set; only the winning token can spawn authenticated commands.
This is an immutable token-identity boundary, not runtime introspection of vendor account IDs. Vault and
item IDs supplied by a different account cannot join this fixed mapping. No account auto-selection.

Token is supplied by an **operator-owned external token file**, not a literal in MCP JSON, argv, source,
chat, dotenv or shell history. Read it only inside the trusted backend per method. Use an opened regular
file, no-follow, owner=current uid and no group/other permission, ≤16 KiB, nonempty single token, at most
one terminal LF accepted; reject embedded whitespace. Read bytes then close descriptor. Missing or empty file maps
to not_authenticated/locked; unsafe or malformed nonempty file maps to error/unavailable. No token value inspection
is needed for diagnostics. No plaintext token retained between methods (only the pinned private fingerprint): temporary Buffer best-effort zeroed; child
env/string references dropped after closure. JS/CLI/OS memory cannot promise cryptographic zeroization.
This file avoids forwarding the token to Chromium through the parent process environment. M9 production
entry must reject an inherited `OP_SERVICE_ACCOUNT_TOKEN` for onepassword mode with the same fixed
startup diagnostic; documented setup supplies only the token-file path. Never delete someone else's env.

Safe human setup documentation: install the pinned CLI from official instructions; create custom vault,
synthetic or operator-approved item and read-only service account outside TinyVault; each Login
website must be a full http(s):// URL (prefer HTTPS), never just example.com or a custom URL field; privately create the
0600 token file and non-secret config; launch with backend/config path only. No auto-install/signin/unlock,
no secret read examples that print to the terminal, no token embedded in copied commands. The three
model-facing setup templates remain byte-for-byte unchanged. Human troubleshooting explains that
service accounts do not follow desktop lock/unlock; the frozen model template’s “Unlock” wording
is a declared guidance mismatch, not permission for the model to run an unlock command; repair token permissions/expiry or revoke/rotate
privately, then restart deliberately; service-token replacement is never a hot reload. Credential password
rotation at unchanged record IDs remains supported (§5). Setup never renews the running process's fill budget.
Human setup, README and release notes must state the approved D8 limitation:

**Archiving a 1Password item does not revoke TinyVault access in an already-running process.**

Items archived before initial discovery are excluded. An item archived afterward can remain usable
through its existing handle, subject to origin/identity/field checks and the existing fill budget.
Deleting the item or revoking its service-account token are intended access-removal workflows whose
real behavior must be verified before release; this planning document does not promise their latency,
error category or interruption of an in-flight fill. Operators can stop the TinyVault process to end
its authorization domain; restarting is a deliberate new authorization domain, not a budget-preserving
refresh or a guarantee that another still-running process lost access. State the archive limitation
beside setup/operations, not only in a release-note footnote. No broader archive protection is claimed.

Human setup also states the64-spawn allowance (not one guaranteed fill per configured item), snapshot
inventory, and possible consumed budget despite a host-timeout refusal (§6).

**Process recreation grants fresh fill authorization; the adapter does not establish renewal isolation in the tested Claude Code configuration (2.1.258, measured 2026-09-12).**

Put that exact sentence immediately beside every new MCP setup block, as in existing README/SCHEMA.

## 5. Metadata, policy, identity and rotation

### Identity (R20)

Canonical record identity in one backend is `(fixed vault ID, fixed item ID)` under its single account.
Only the built-in password is supported; no field alias can yield a second handle. Before any CLI call,
allocate one random opaque `vh_` + 32 base64url characters per configured unique record, check collision
and retry allocation, retain both maps until disposal. A successful list publishes only these handles.
All lookup accepts exact map keys only, no case folding, prefixes, decoding, direct IDs or `op://` aliases.
Never derive a new handle from title, URL, password, version, token or list ordering. Do not remove/re-add
map entries after lookup failure; failed/missing records keep their reserved identity. Distinct accepted
handles cannot resolve to one canonical record. Stability is for the backend/process lifetime; another
process already has fresh authorization under M8, regardless of its handle spelling.

Under preserved R15 and R20 (runtime-control packet §9), a copied item with another vendor ID is another record, even if the password is equal. Metadata-only
code cannot detect equal secret values. The allowlist is frozen, so an item moved/copied during the
process cannot be newly discovered and mint a replacement budget. Operator configuration must not
list duplicate physical copies of one credential when a one-credential budget is intended. That limit
must be stated beside the R20 claim, not disguised as global secret-value deduplication.

### Listing and canonical origin

`listItems` calls only the suffix `item list --vault <fixed-ID> --categories Login`, preceded by the fixed global
flags in §6 (including the single `--format json`). Never `get`, `read`, templates, export, account-wide list, or password fields. V0 fixes the
minimal exact parser schema (§3.1 D9) and its enumerated optional metadata keys. Any key not
listed at its exact location or any forbidden secret-bearing structure rejects the response; no passthrough. Reject malformed JSON, duplicate record IDs, wrong vault,
non-Login rows or conflicting identity. Limit list input to 1 MiB / 1024 rows; oversized dedicated vault is
unavailable, not truncated. Ignore valid unconfigured record IDs after validation. Return exact ItemMeta
objects built from handle, configured label, `kind:'password'`, `available:true`; omit `account`, never
copy title, notes, username, URL, field values or arbitrary CLI properties into model output.

For each configured record returned by the archive-excluding list, derive a **single** origin from its website URLs. Reject no
website, non-HTTP(S), userinfo, controls/whitespace, backslashes, malformed authority, encoded/alternate
host forms rejected by `validateBareOrigin`, and ambiguous distinct normalized origins. Accept multiple
website URLs only when all reduce to the same origin. Before WHATWG URL normalization, require a case-insensitive http:// or https:// prefix and extract the raw
scheme+authority, stopping at the first / ? # **after** the scheme’s ://, pass that to existing `validateBareOrigin`; then parse full URL and
require its origin to agree. Thus path/query/fragment do not authorize paths or repair unsafe authority.
No title/domain guessing, wildcard, subdomain expansion, redirects or browser-derived origin. Existing
HTTP(S) core policy stays; human setup recommends HTTPS, with HTTP for deterministic local fixtures.

One successful, structurally validated discovery response freezes the eligible inventory and each record's policy `{canonicalOrigin,fieldRecipe:
['password']}`; later list/policy calls return this snapshot without replacing it. Metadata and identity caches
are allowed; plaintext caches are not. `listItems` and `resolvePolicy` share one initial in-flight
metadata discovery promise, with validation completed before any map is published. An unknown handle
in resolvePolicy rejects before token read or spawn. Once discovery succeeds, both methods serve the
frozen inventory/policy and perform **zero further provider calls**. A failed discovery does not publish
partial state; a later caller may try again within the process invocation budget while the backend remains live, but no automatic retry. The final3900ms deadline permanently latches unavailable, including stalled local filesystem work.
A valid empty LIST or one containing no eligible configured records is a successful empty snapshot:
it freezes for this process, subsequent list/policy calls do not retry, and handles are not-found.
Misconfiguration or later additions require deliberate restart; this is a declared diagnosability cost.

A configured record absent/archived at discovery (default archive-excluding LIST), or with an underivable website (missing website,
bare host, custom URL field only, non-HTTP(S), or ambiguous origins), is omitted and resolvePolicy
returns not-found. Malformed response structure, duplicate IDs or wrong-vault/category rows reject the
whole discovery with integrity. Unconfigured valid rows are ignored; their URL suitability is irrelevant.
At fill time a previously eligible record whose website becomes invalid/different returns integrity from
resolveSecret, except when the earlier D8 state check has already denied under §3.1’s order; never
replacement policy or omission. Under D8, archiving after discovery is not a fill-time denial signal. A deleted/unretrievable record
with only an untyped CLI failure remains unavailable; do not label that failure not-found or revoked
without stable evidence. Deletion behavior and token revocation remain separately verified V1 cases. Missing
fields are not-found; wrong-type/duplicate/ambiguous field structures are integrity. T2/T4 pin each case.

`available:true` means eligible **at the discovery snapshot**, not a live availability claim. Listing may
show a since-deleted/archived item; detail validation must still establish current identity, category,
origin and built-in password. It does not establish current ACTIVE state. No fill relies on cached
passwords, and archiving alone does not invalidate previously discovered eligibility under D8. New records or changed policy require deliberate restart. Same-ID
password rotation is read at each admitted fill. This deliberately trades live inventory updates for
bounded provider traffic and stable authority; human setup must explain it.

### Fill-time resolution — contingent on D2

Only the existing `fillService` calls `resolveSecret`, after origin equality, destination pinning and
budget reservation. Keep that order. Unknown handle or uninitialized authorized-policy binding rejects
before spawn. Check the supplied policy equals the record's frozen policy. Then exactly one `item get
<item-ID> --vault <vault-ID>` suffix preceded by the fixed global flags in §6, including the single `--format json`. No field/name-based command or second `op read`.

Parse the bounded returned item as a single candidate snapshot; require exact requested IDs,
Login category, then the D8 state rule, then the same canonical-origin derivation/policy as authorized,
then password selection, in §3.1’s exact order. In particular, a structurally valid DELETED detail with
a drifted origin is not-found before origin evaluation; malformed grammar still takes precedence.
**D8 state rule:**
a missing top-level `state` is permitted and is not interpreted as ACTIVE. D8 applies only to item
detail state; the account PROBE must still confirm an ACTIVE SERVICE_ACCOUNT. If the exact optional key
is present, require a string equal to `ACTIVE` or `ARCHIVED`; either is acceptable for an item already
eligible in the frozen discovery snapshot. An explicit string `DELETED` remains a denial (not-found); any other value/type, including null, is
integrity. ACTIVE/DELETED are declared parser/denial cases, not claimed observed detail values; V0 observed
ARCHIVED on C and absent state on A/B. Unknown keys elsewhere remain rejected under the separately verified schema. A direct-ID
lookup cannot bypass frozen eligibility: records absent at discovery never gain resolve authority. Require exactly
one built-in field with `id=password`, `purpose=PASSWORD`, `type=CONCEALED`, no custom section, and string
value; reject duplicate IDs/purposes, missing/wrong-type field and malformed data. A missing or empty built-in password is not-found; a duplicate, wrong type/purpose/section is integrity.
Supported passwords contain1–4096 UTF-16 code units and no CR/LF, matching the browser transport
bound and local-writer sanitization constraint. Reject CR/LF or >4096 before Secret construction as
unavailable/backend-error; never trim or truncate. Preserve all supported whitespace exactly.
The fixed error exposes unsupported-domain eligibility; noninterference compares only supported values,
not missing/invalid versus usable credentials. Make that boundary explicit in the approved backend contract. Do not extract TOTP,
username or custom secrets into any output. Full item retrieval nevertheless exposes all item fields to
trusted CLI/backend memory, an explicit D2 cost. Construct `new Secret(value)` only after every check;
never retain the full JSON/field object or Secret in the backend. Current fill code clears Secret in finally.
Clear byte buffers and drop parsed/string references on success and every error/disposal path.

Password rotation at the same IDs and unchanged policy yields the new value on the next authorized
fill; it never resets consumed budget. Version changes alone are not failure (rotation changes version).
Origin/category/field identity changes fail closed. Archive-after-discovery may still resolve under
D8; omit `--include-archive` as before but do not treat that flag as active-state proof. Deleted/moved
records cannot mint new authority or replace this map. If their fixed-ID GET fails, return unavailable
for an untyped CLI failure; verify actual removal behavior separately before making a release claim. Additions/moves or policy changes require operator config review and deliberate restart.
No instantaneous revocation or transactional vendor snapshot guarantee is claimed: a provider change
after the returned snapshot is not observed. V0 must establish sufficient detail coherence; if uncertain,
keep the real-provider acceptance gate blocked. Two separate reads cannot establish that coherence.

## 6. Subprocess and lifetime contract

Dedicated `onepasswordProcess.ts` owns the only new production `node:child_process` import/spawn site.
Fixed absolute real executable supplied by trusted config, regular executable file; no PATH search,
shell, wrapper command, caller args, `exec`, `op run`, signin, inject, plugin or auto-update. Each invocation
uses argument-array spawn with `shell:false`, private stdout/stderr pipes, stdin ignored, fixed private
cwd. Node 24, POSIX Darwin/Linux only for initial adapter; Windows unsupported with fixed unavailable.
V0 pins the supported CLI version/digest in operator setup; fake CLI tests do not establish real compatibility.

Global argv: `--cache=false --config <owned-dir> --format json --no-color`; subcommands limited to
`item list` above, `item get` above, `user get --me` for probe, and `--version` for version validation.
No `--session`, token argv, field flags or `--include-archive`. Flags and IDs are constants/validated config.
Actual accepted ordering is fixed by V0 before implementation. In that observed assembled argv,
`--format json` appears once in the global prefix; LIST/GET suffixes do not repeat it (Entries33/46).
Version check is once before first
credential-bearing command, consumes the same method deadline; no background version check.

Build child env from an empty object: only service token, `OP_CACHE=false`,
`OP_BIOMETRIC_UNLOCK_ENABLED=false`, `OP_DEBUG=false`, `OP_INCLUDE_ARCHIVE=false`, `OP_FORMAT=json`,
`HOME`/`OP_CONFIG_DIR`/`TMPDIR` pointing to the owned private runtime tree, `PATH=/usr/bin:/bin`,
`LANG=C.UTF-8`. Use no parent-env spread. Connect/session/account variables, proxy settings,
NODE_OPTIONS, DYLD/LD preload and unrelated tokens cannot be inherited. Private mode-0700 runtime tree
under OS tmp, created by backend, no persistent 1Password configuration and no existing account directory.
No secret stdout/stderr writes to disk; drain/drop stderr under a byte cap. Cleanup touches only that owned
tree, never operator token/config files. Cache disabled to avoid a surviving cache daemon; verify rather
than assume that this yields no descendants or external writes on the supported CLI.

Each public backend method settles within **4,000 ms** from entry including auth file/version/spawn/
parse/cleanup, on a responsive event loop. Start cleanup by 3,000 ms; SIGTERM to the owned POSIX process
group, after 250 ms SIGKILL, then 250 ms to observe closure; use remaining budget to finalize. Cap stdout
1 MiB for list/detail, 16 KiB for probe/version and stderr16 KiB for all. Combined retained bytes remain
within those fixed caps; stop copying on overflow and cancel. At most four in-flight methods, no internal
queue; excess fails unavailable immediately. At most **64 CLI spawns per backend/process lifetime**,
including version/probe/failed attempts; reserve one slot synchronously immediately before spawn.
The65th fails unavailable without spawning; disposal/re-list/setup cannot reset the counter. This is
a subprocess-attempt cap, not a vendor-request/billing cap: one CLI invocation may make multiple
requests. Parent restart gives a new cap, under the existing renewal limitation. An attacker can spend
this finite allowance and deny later work; no availability guarantee against the authorized client.
It is also a non-adversarial availability limit: version + discovery leaves at most62 detail fetches,
or61 after one online probe, even with64 configured items. Setup probes and the library diagnostic
probe after backend-error consume slots too. Configuration capacity does not promise one fill for every
configured item per process. Preserve64 as a deliberate finite allowance; do not raise it implicitly.
T1/T8 assert unknown handles cause0 spawns, repeated discovery causes1 successful list, denied/exhausted
fills after discovery cause0 lists/gets, and repeated failures/probes never exceed64 total invocations.
No retry/backoff/polling. Every operation checks disposed
state before spawn and before publishing result; late success never constructs or returns a Secret.

Use an owned detached process group; never signal arbitrary PID/name. Await closure/pipe drain within
the cleanup bound. If death/closure cannot be confirmed, mark backend permanently unavailable, discard
late data, retain handlers to reap eventual closure and report only fixed failure. A finite deadline cannot
prove the OS killed an unkillable process; this is a containment failure, not successful cleanup. Node
handles must not retain the application forever (unref/destroy bounded owned resources). Private-dir
cleanup failure similarly poisons backend; disposal returns a fixed BackendError. No clean-termination
claim on SIGKILL of the parent; no exit-handler promise of cleanup after uncatchable death.

`dispose()` is idempotent, marks closed before awaiting, cancels all owned children, drops metadata/handle
maps/auth references and removes owned temp tree. Future methods reject unavailable; probe returns error.
The backend factory also refuses inherited OP_SERVICE_ACCOUNT_TOKEN presence before creating
resources, using fixed failure and no value disclosure; this applies to library construction as well
as the MCP entry. A library composer remains responsible for not adding a token to its parent env
after construction before Chromium launch; trusted-composer changes are outside the guarantee.

MCP entry keeps a backend variable before host creation, disposes on startup failure, and starts disposal
on its existing abort path before waiting on host close; normal path lets the accepted operation settle
then disposes through host close and idempotent final cleanup. Close races never leave an unhandled
rejection. Preserve normal drain/finish/close ordering, host options and exit priority. No host-factory,
fill-service, browser, mutex or authorization-domain production edit is needed.

MCP notifications/cancelled still suppress the response without cancelling active host work. That work
is now bounded at the backend, but may still fill before finishing. This preserves M8's declared behavior;
no cancellation-is-no-fill claim. Fatal shutdown disposes the backend; forced parent death still cannot
establish complete cleanup. On an initial fill before discovery, two backend calls can consume8s, leaving little room under the
existing10s host timeout; later cached-policy fills need only one detail fetch. The host10s timer
triggers stop-loading/disposal; bounded() still awaits the underlying operation before returning, so
it is not an immediate returned refusal followed by a detached fill. An adapter shutdown/cancelled
response may nevertheless leave trusted work finishing against a dropped lease (accepted M8 limit).
Transport consumption remains authoritative; do not reinterpret deadline expiry as a free retry.
If an assignment completes after the host timer expires, the handle remains consumed while the host
returns its fixed no-password-control failure. Thus a refusal does not prove that assignment did not
occur. Keep this existing host behavior and test it with controlled delays; no timer change here.

## 7. Fixed availability and error translation

| Condition (trusted evidence only) | probeAvailability | Other methods |
|---|---|---|
| Configured executable ENOENT | not_installed | unavailable |
| Token file missing/empty or changed fingerprint | not_authenticated | locked |
| Unsafe token file, unsupported version/platform/config, I/O error | error | unavailable |
| Response exceeds byte/depth/node bounds | error | unavailable |
| Password outside the supported length/CRLF domain | n/a | unavailable (core backend-error) |
| Successful `user get --me`, confirmed ACTIVE SERVICE_ACCOUNT | available:true | n/a |
| CLI nonzero, timeout, cancellation, rate limit, malformed probe, revoked/expired token with no stable typed code | error | unavailable |
| Unknown handle or record absent from the eligible discovery snapshot; explicit detail DELETED; empty/missing password | n/a | not-found |
| Wrong record/vault/category/policy, malformed present optional detail state under D8 or malformed/ambiguous item (including invalid UTF-8/JSON, duplicate/unlisted keys or wrong types) | error if in probe | integrity |
| Disposed or containment failure | error | unavailable |

No localized stderr parsing or guessed exit-code distinctions. `locked`/`auth-expired` remain legal core
backend kinds but no fabricated provider mapping. Desktop-lock state is not this auth mechanism; probe
can distinguish install/missing-auth/working/generic-failure, not every network-vs-revocation cause.
This explicitly narrows any reading of phase-plan M9's “probe distinguishes states” beyond documented
signals. Core mapping unchanged: not-found → handle-unavailable; every other BackendError → backend-error;
setup maps not_authenticated/locked to backend_locked, installation/error to backend_unavailable.
No raw stderr/stdout/native error/cause/argv/paths or token-bearing objects leave the trusted boundary.

## 8. Approved file ownership and implementation slices

D9 is contained in these same ownership boundaries; no new implementation file is authorized by the grammar.
Only the continuity owner writes contracts/registers/PLAN. Worker packets pin actual base/head,
branch/worktree and exact files; leave uncommitted. No parallel writers on one checkout. Gate files belong
to S3, not to a backend implementer looking to make failures disappear. All unlisted files are no-touch.

| Slice | Exact ownership | Work and exit evidence |
|---|---|---|
| S0 prerequisites / lock (owner, no implementation) | this packet, `docs/m9-review-findings.md`, `PLAN.md`, `docs/README.md` | Resolve D1–D7, complete paper ladder, obtain V0 and user lock/implementation authorization. |
| S1 backend (Astra, complex) | NEW `src/backends/onepassword.ts`, `onepasswordConfig.ts`, `onepasswordMetadata.ts`, `onepasswordProcess.ts` | Fixed config, identity/policy, bounded process runner, Secret construction confined to onepassword.ts. Each production file <400 lines; STOP if more modules needed. |
| S1 deterministic proofs | NEW `src/backends/onepassword.test.ts`, `onepassword.policy.test.ts`, `onepassword.identity.test.ts`, `onepasswordProcess.test.ts`, `onepasswordConfig.test.ts`, `onepassword.testSupport.ts` | D9/F0 synthetic fixtures, private fake-executable harness, tests T1–T8 plus T12 in these same files. testSupport is classified as production by the graph: it may only create synthetic fixture files and local HTTP fixtures; contains no child_process import/spawn/Secret import or production importer, and receives no exemption. Each test/helper <800 lines. |
| S2 MCP integration (Astra, moderate) | `src/adapters/mcp/main.ts`; NEW `src/adapters/mcp/main.backend.test.ts`, `server.onepassword.stdio.test.ts` | Selection and cleanup only; exactly one `createSupervisedHost({backend,canary,handleSignals:false})`; preserve byte-exact host options `{ backend, canary, handleSignals: false }` for existing mutation anchors; wire tools/protocol remain byte-identical. Built bundle tests T9–T10. |
| S3 gate integration (Astra, moderate/security gates) | `src/core/fillService.structure.test.ts`, `src/browser/retention.test.ts`, `src/browser/playwright.signals.test.ts` (one source-path literal only), `scripts/docker-invocation.mjs`, `scripts/docker-invocation.selftest.mjs`; NEW `src/core/fillService.authority.structure.test.ts`, `src/backends/onepassword.structure.test.ts` | Move the contiguous authority block (base lines259–773) to the named file; duplicate its four shared helpers verbatim (`sourceFiles`, `relativeModuleSpecifiers`, `unwrap`, `walk`) and retain originals for A/K and T-RC-5. Move its three exclusive imports (`createSupervisedHost`, `CredentialBackend`, `Browser`) too. Owner AST read confirmed exactly these four pre-block helper references; no shared helper module. Pin duplicate helper bodies and preserve every assertion/mutant, add file to existing strict size list; add onepassword.ts to all three Secret-importer lists (base lines18–19,52–56,57–61) only, using a direct Secret import from ../core/redaction; add executable AST subprocess/command/env confinement and detector mutants T11. Narrow retention-pin amendment below; no other permissions/caps loosened. |
| S4 contracts/setup (owner, moderate) | `src/backends/backend.ts` COMMENTS ONLY; `SCHEMA.md`, `docs/phase-0-plan.md`, `README.md`, `docs/README.md`, `BACKLOG.md`, `PLAN.md`, this packet/register; `.claude/memory/decisions_product.md` only after explicit user approval of that named project-memory reconciliation; NEW `docs/onepassword-setup.md` | Approved D1/D2/D5 wording, bounds/error mapping/R20/setup and truthful prerequisite status; no types/result/schema/tool vocabulary edits. |

S2 preserves every existing main.ts composition pin: exactly one createSupervisedHost call directly
inside the FunctionDeclaration named start, with the literal `host = await createSupervisedHost`
assignment and `{ backend, canary, handleSignals: false }` argument; exactly one createServer call with
first argument text `host`. Keep the mutation anchors `function start(`, `await createSupervisedHost`
and `, handleSignals: false` unchanged. Add cleanup around that structure; no relocation of host creation
to a helper/arrow. src/adapters/mcp/adapters.structure.test.ts is READ-ONLY, not S3 edit ownership.

S3 also updates the sole source-path literal in src/browser/playwright.signals.test.ts:28 from
src/core/fillService.structure.test.ts to src/core/fillService.authority.structure.test.ts. That M8-C5
test extracts unwrap/staticKey/propertyText/inspectHostShape from the actual inspector source; the
latter three move with the authority block and unwrap is already copied there. Except for the approved
Entry58 path-equality amendment below, preserve every extracted function body, assertion, test name
and transpilation/execution step; no cached or duplicate inspector.
Approved narrow exception (Entry58): inspectHostShape compares both source filename and the exact
MCP path through ts.sys.resolvePath, recognizing the same file's relative/absolute compiler names.
Only that equality expression changes; all other extracted bodies and literal-false/property guards
remain unchanged. One new named regression in the existing authority test covers actual compiler
filename, relative/absolute true/false and relative/sibling/outside-checkout decoys, with the existing
60s graph-test timeout. Preserve32 historical executed assertions,2 existing relocation assertions
and this1 newly approved assertion. Add revert-normalization, all-paths and suffix-widening mutants;
no signals-consumer change beyond its already approved source-path literal.
The four helper-copy pins and three-import relocation remain as specified. Required future proof:
run playwright.signals.test.ts; delete or rename inspectHostShape in the new authority file and verify
the existing M8-C5 extraction assertion reds; remove its signal-option rejection and verify the same
M8-C5 negative cases red; restore exact bytes/hash and green. Source-consumer search found this direct
external consumer; new findings still require precise ownership before edits. No M8 semantics reopened.

S1/S2/S3 are ownership/work units, not independently releasable commits. They are assembled in one
uncommitted candidate before the §9 gate sequence: partial trees may be gate-red because code precedes
permission rows and manifests precede new files. Never report such a partial tree as accepted. Any later
user-authorized commit/integration must carry each new capability row together with its M9 AST shape
proof, helper reachability/presence pins and required tests; no permissions-only intermediate commit.
No commit or integration is authorized now.

No production edits to core fill/auth/origin/redaction/browser/supervisor, MCP server/tools/protocol,
local-file files, agents, testbed/checkers/fixtures/runner, cohorts, SKILL.md, package manifests/lockfile,
Makefile, dependency-boundary policy or any cap. `node:child_process` is already a built-in accepted by
the dependency walker; no new package exemption is needed. This does not satisfy the independent Docker-capability checker;
D7 below owns its exact new rows/profile and selftests. The new AST gate must confine subprocess
use itself; generic dependency hygiene is not OS containment. S3 adds no Secret consume/expose sites.

The new onepassword.structure.test.ts also owns a separate bounded retention shape allowlist
across all four new production files: enumerate permitted backend/module state, operation-owned
closures, nonlocal assignments, callback captures, output buffers and post-settlement state. Only
bounded snapshot fields (handle, configured label, configured vault/item ID, derived canonical origin,
fixed password policy and availability flag), token fingerprint and fixed lifecycle/cancellation state
may survive a method. Also explicitly permit operator-validated opPath/tokenPath, the shared
metadata-discovery promise only while pending (drop it after settlement), the64-spawn counter,
version-checked marker and the already bounded lifecycle/admission/cancellation bookkeeping.
These categories never authorize retaining generic provider objects. Do not retain raw provider
titles/additional_information, URLs beyond the
derived origin, references or other provider values in the snapshot. Raw stdout, parsed LIST/detail, password strings, Secret, token bytes/strings and token-bearing child env objects must not survive in backend/module state or
settled callbacks. Every allowed operation-local buffer/capture is cleared/detached on success, error,
timeout and disposal. Add on-disk mutants storing each form (including both token buffer/string and
the child env object) in both module and backend-closure state, plus late-child callback retention.
Also require on-disk mutants retaining provider title and additional_information in the frozen map;
each must red the new M9 retention shape gate, even if never emitted. Default test must kill each.
Existing scripts/retention fixed-file rules and M4 proof scope remain unchanged. The new
Secret-constructing backend is outside retentionViolations and its localFile-specific occurrence proof;
its additional retention evidence is the enumerative M9 shape gate and named mutants only,
not whole-program escape analysis. If this cannot fit the listed test file,
stop that slice and request a precise helper/gate ownership extension before proceeding. Specifically,
if the strict scanner plus grammar cannot fit onepasswordMetadata.ts under400lines, stop and return
an exact proposed redistribution/ownership change; do not minify for the cap or add a module/dependency.
The existing src/browser/retention.test.ts global outside-set scan (base100–110) must be amended
explicitly: keep its six-file RETENTION_SOURCE_FILES assertion and analyzer unchanged, and allow only
one direct `new Secret` site in onepassword.ts, identified by AST and covered by the M9 shape gate.
Do not exempt that whole file: consume/expose/decrypt/open references there remain forbidden; every
other outside-set file still rejects constructors. The existing test independently pins the exact
constructor count/file/import. A separate unconditional assertion named `M9 retention gate file exists`
reads literal src/backends/onepassword.structure.test.ts with readFile and requires nonempty text.
This pins file presence only; it does not prove assertion execution/content or prevent passing no-op
replacement, the disclosed gate-tampering residual. The existing core manifest independently pins deletion. Required on-disk mutants: add a second
constructor there, add consume/expose there, plant a constructor in another module, and delete the new
gate. The surviving existing gate must reject each. Retaining a secret at the allowed site must fail
the M9 retention gate. No alias spelling to evade the existing scan and no M4 analyzer-domain expansion.
If a listed proof needs an unlisted helper/gate edit, report the precise ownership extension before work.


S3’s new gate enumerates every supported JS/TS file in src/** minus test/spec suffixes, with no
helper exemption from spawn/import/authority checks. It pins the only production child-process import and spawn to onepasswordProcess.ts;
resolved aliases/relays and second sites fail. It additionally pins one backend selection/construction
in MCP start (one branch for local-file, one for onepassword, one resulting instance; no factory in
request handlers). Across the four new files, reject console/loggers, process.stdout/stderr, writable
streams and fs write/append APIs. Permit only exactly named filesystem sites for config/token reading,
owned mkdir/mkdtemp/chmod and owned-tree removal; raw output must never reach those path arguments.
Add console/stderr/fs-output mutants and a spawn planted in testSupport; all must red. The standalone
retention gate above must include raw buffer/parsed-object/token/child-env taint sources as well as Secret constructors.
The fs write/append ban is scoped to the four runtime modules; testSupport may write synthetic fixture
files under owned temp paths. That permission is no exception to its spawn/Secret/authority/import rules.
The same M9 AST gate owns the helper-consumer assertion: no non-test/spec src JS/TS module may
import or re-export onepassword.testSupport, directly or through a local relay. Resolve local import,
export-from, import-equals/require and literal dynamic-import edges (including alias/extension spellings)
to source paths and compute reachability; unresolved local edges cannot establish a pass. Do not exempt
the helper from the production graph. Nonliteral module loads in the four runtime modules or helper
fail the shape allowlist. Existing external-package internals are outside this source-graph claim.
Required on-disk mutants: direct import, aliased import, relay re-export and literal dynamic import
from onepassword.ts to the helper; include a synthetic parsed-password argument routed to its fixture
writer. Each must produce the named helper-production-reach assertion failure through the real M9
gate. A typecheck red alone is insufficient. No other runtime-to-test helper write path is permitted.

The EXISTING src/core/fillService.structure.test.ts gains a literal REQUIRED_M9_FILES manifest of all
new production/test/helper paths listed in S1–S3. Its existing default-gated size test reads every path;
a missing path fails. Enforce <400 on the four new production files and <800 on every listed new test/
helper. This is the independent surviving pin for deleting the new onepassword.structure.test.ts or
another M9 test; deleting each new test file must make the existing test fail on its missing path.
This replaces the undefined “remove inventory” mutant, without editing CLAIM_LINKS or test-entry policy.
The manifest is literal, never derived by glob:

```text
src/backends/onepassword.ts
src/backends/onepasswordConfig.ts
src/backends/onepasswordMetadata.ts
src/backends/onepasswordProcess.ts
src/backends/onepassword.test.ts
src/backends/onepassword.policy.test.ts
src/backends/onepassword.identity.test.ts
src/backends/onepasswordProcess.test.ts
src/backends/onepasswordConfig.test.ts
src/backends/onepassword.testSupport.ts
src/adapters/mcp/main.backend.test.ts
src/adapters/mcp/server.onepassword.stdio.test.ts
src/core/fillService.authority.structure.test.ts
src/backends/onepassword.structure.test.ts
```

Both new MCP test files inherit the adapter scanner’s test rules: no literal forbidden authority/renewal
identifiers, console, or imports matching playwright/testbed/scripts. Use local HTTP fixture code in the
listed fake-CLI helper (no child spawning or Secret import), reached by the tests; no gate exception.
The existing authority inventory also covers all four new backend modules and production-classified
testSupport: no exact identifier/string/private/static key from AUTHORITY_NAMES (including renew).
Preserve that inventory. MCP main.backend.test.ts exercises start(); T9/T10 build the real main.ts
bundle in-test with esbuild into owned checkout-local artifacts/mcp-onepassword-* output, following
server.stdio.test.ts:114–117, with cleanup. This preserves external-package resolution from the checkout;
a default clean clone never depends on prebuilt dist or an earlier make mcp. The separate private CLI
HOME/config/runtime tree stays under OS tmp. No extra host factory in production.
Do not add a fifth adapter production module. S4 wording is frozen with runtime/test candidate before
fresh independent reviews, not appended after its contract has been reviewed.

### D7 capability-gate integration (future S3, explicit lock decision)

The independent Docker-capability checker scans source and tests. Add only these exact entries to
DOCKER_CAPABILITY_ALLOWLIST in scripts/docker-invocation.mjs; all existing entries stay unchanged:

| New path | Sole capability import |
|---|---|
| src/backends/onepasswordProcess.ts | node:child_process |
| src/backends/onepassword.testSupport.ts | node:http |
| src/adapters/mcp/server.onepassword.stdio.test.ts | node:child_process |

All other new files avoid capability imports: tests exercise the actual backend/runner/start and
HTTP helper. No node:net/http/child_process permission by directory, neighboring path or bare alias.
Add reviewProfiles for server.onepassword.stdio.test.ts: exactly one direct spawn(process.execPath,
[bundlePath], { env: env, stdio: 'pipe', shell: false }) and one direct execFileSync('/bin/ps',
['-axo','pid=,ppid=,comm='], { encoding: 'utf8', shell: false }). The second argument must be an inline array literal, not an array variable. The existing grammar pins
imports, executable, argv-array form, option keys, shell:false, ps encoding and call count/reference
shape. It does NOT pin env/stdio initializer values. No grammar widening.
The M9 AST gate separately reads literal src/adapters/mcp/server.onepassword.stdio.test.ts, requires
exactly one direct spawn call, and pins its env initializer to the identifier env and stdio initializer
to the literal pipe (in addition to existing profile constraints). Named failures: mcp-test-env-value
and mcp-test-stdio-value. On-disk test-source mutants `env: process.env` and `stdio: 'inherit'` must red that
M9 gate respectively, then restore exact bytes/hash. They are not claimed to red the Docker checker.
These assertions pin test callsite spelling, not arbitrary provenance of the env variable; T10 supplies
the synthetic inherited-token/output capture behavior witness.
The op runner has a trusted validated dynamic executable, which that literal-executable grammar cannot
express. It receives only the import row here; the new M9 AST gate must prove its one spawn, validated
opPath data flow, literal shell:false, fixed argument-array variants, fixed env construction and lifetime
checks. No unproved spawn-shape exception is authorized. The helper has no spawn permission.

scripts/docker-invocation.selftest.mjs owns all new Docker-checker/selftest proof code. Add an explicit new-MCP two-call
positive fixture, actual-source positive control, exact allowed-row assertions and neighboring-path /
extra-specifier denials. The existing generic positive loop at60–66 must select this named fixture:
its one-spawn fallback cannot satisfy the two-call profile. Reuse or separately run the existing MCP
mutant family against the new profile, preserving every old M8 witness and its reported count.
The duplicate ps-profile property would make the old global replaceOnce anchor (base352 literal /354 call) non-unique:
qualify that existing deletion anchor by its exact old profile path and property (AST-selected node or
unique whole-profile substring), preserving the same one-property deletion and red/restored-green proof.
Do not alter a guard or assertion to make an ambiguous anchor pass; a non-unique anchor is failure.
Keep old CLI review-helper profiles/mutant counts unchanged; new profile results reported separately.
New profiled-path rejection cases restore the valid two-call fixture, following the current MCP loop;
the generic rejected() helper restores a bare export that itself fails spawn-call-count on a profiled
path, so do not use it there. Neighbor paths without a profile may still use that generic helper.
The selftest retains its sole named { spawnSync } import and direct process.execPath calls; new CLI
proofs use the existing assertCli wrapper, not exec/execFile/spawn aliases or another capability import.

Require actual checker CLI and selftest positive controls, new capability/profile deletion proofs,
extra node:net in the op runner, neighbor paths, and changed MCP executable/argv/options/reference/count.
Deleting a non-scripts reviewProfile removes its binding guard, so merely checking the clean source
cannot detect that deletion: the unchanged negative fixture must then be accepted by the weakened
checker and make the selftest red. Record that precise absence-detection witness. All new on-disk
mutants and guard deletions restore exact bytes/hash and prove restored green; dynamic proof is future.
The checker entry script, test-contract command list, root-of-trust pins, runtime interceptor and every
existing permission/threshold remain untouched. scripts/docker-invocation.mjs and its selftest are the
only D7 existing gate owners; request an exact extension if implementation proves more is necessary.

## 9. Verification and mutation ledger (future; not run this session)

Deterministic tests use only synthetic values, fake CLI executables and owned temporary directories;
never PATH's real op, developer auth, network, `.env`, generated eval prerequisites or external accounts.
The fake CLI interpreter is independent of the restricted child PATH. For complex Node fixtures,
onepassword.testSupport writes a synthetic executable with fixed /bin/sh shebang and a minimal exec
trampoline to the test process's absolute process.execPath and an absolute fixture-script path; both
are POSIX single-quoted with embedded-quote escaping, and original argv is forwarded unchanged.
This handles spaces/metacharacters without /usr/bin/env node or PATH lookup. The fixture interpreter
replaces itself with Node; descendant/hang/flood behaviors remain in the owned synthetic script.
This is test-fixture machinery only: the production runner still uses shell:false and the real CLI
contract permits no shell/wrapper command. Prove the fake runs with PATH=/usr/bin:/bin and a fixture
path containing spaces/metacharacters; no interpreter-dependent skip or assumed Homebrew/nvm PATH.
Default clean-clone tests must work without op installed and with no new conditional skip (the
existing single intentional skip stays pinned). Integration uses the real backend + real host +
scripted built MCP bundle with fake CLI and local browser fixture, never a paid agent client.

| ID | Required assertion / production path | Named non-equivalent mutant required red |
|---|---|---|
| T1 metadata absence | list/policy/probe command recorder proves zero get/read; exact ItemMeta output and malicious extra fields rejected; no sentinel at model sinks | replace list with get-and-strip; spread raw list object |
| T2 origins | raw-authority rejection vectors (userinfo, backslash, controls, numeric host rewrite, IDN, ports); no URL/mixed-origin denial; same-origin paths accepted | use only new URL().origin; choose first of differing URLs |
| T3 identity | duplicate config and duplicate CLI rows deny; alias/direct-ID/case variants refuse before spawn; valid empty/no-eligible LIST freezes with zero later calls; repeated lists/title changes/rotation preserve handle; move/new-ID never joins map | remint per list; accept op:// alias; add newly listed IDs; retry discovery when snapshot has no eligible records (dedicated spawn-count witness) |
| T4 rotation/policy binding and D8 | real fill path origin change yields backend-error/zero assignment; same-ID rotation fills; initially archived item omitted and never fetched via handle; archive after discovery with unchanged origin/fields may fill under original budget; missing state and explicit ARCHIVED accepted for eligible records, explicit DELETED denies, DELETED plus drifted origin is not-found with zero assignment, malformed grammar plus DELETED is integrity; malformed present state rejects; archive→restore followed by list preserves identical handles, causes zero new provider spawns and leaves consumed fill authorization exhausted | remove current-policy equality; select password by label; bypass frozen eligibility; reject missing state (positive witness); reject ARCHIVED (positive witness); accept DELETED or unknown/nonstring state (negative witnesses); re-run discovery on a later list (spawn-count witness); remint handles on later list (identity witness); reset per-handle authorization on later list (second-fill exhaustion witness) |
| T5 secret/error noninterference | two synthetic passwords/lengths and malicious stderr/JSON on all failure branches yield identical model-visible envelopes; supported whitespace preserved; CR/LF and4096/4097 boundaries; cleanup clears owned buffers and no stored Secret | forward native error/cause; trim value; retain item/Secret/token buffer/token string/child env in module or backend state |
| T6 confinement | launch real fake executable at path with spaces/metacharacters, hostile env sentinels absent, token reaches only child env, closed stdin/no fallback, argv whitelist exact | shell:true; spread process.env; omit cache=false/config isolation; argv token |
| T7 lifetime | fake child hangs, floods each pipe, ignores TERM, spawns descendant, closes pipes early, returns late; assert bound, proper escalation/reaping and no late Secret/unhandled rejection | delete deadline; delete KILL; resolve before close; allow late result |
| T8 disposal | concurrent calls, cap4/5th reject; token replacement between policy/get and concurrent first-read binding and changed-then-restored token remains latched; dispose before spawn/during read/during child/after close; startup config failure cleanup; poison on unconfirmed closure/cleanup failure | remove disposed check; clear auth-changed latch on token restore; omit owned temp cleanup |
| T9 MCP/real fill | built bundle, real backend/host: list, first fill, second fresh control exhausted, setup still exhausted, wrong-origin denial zero secret reads; snapshot/output sentinel scan; synthetic restart new fill | select local fallback; reconstruct backend per list; omit disposal on startup failure |
| T10 process cleanup | real bundle with hanging fake op, SIGTERM/EOF/stdout failure; actual owned descendants gone or fixed containment failure; cold start without real op/auth; inherited token cannot reach browser | omit abort backend disposal; inherit parent service token |
| T11 structural production gate | M8-C5 relocated-inspector proof; D7 checker/selftest positive and rejection paths; MCP test env/stdio value pins; no production reach to fixture helper; default make test selects new files; existing retention pin allows only the named constructor; AST scopes sole new spawn site, fixed command/config/env construction and exact Secret importer; duplicate/aliased spawn and extra importer rejected | extra spawn via alias/relay; add unlisted Secret importer; delete each new test file while the existing REQUIRED_M9_FILES pin survives; helper import/relay/dynamic route; D7 capability/profile/shape mutants; renamed inspector/removed signal rejection; test env/stdio value mutants |
| T12 D9 parser/fixture contract | F0 exact observed shapes and separately labelled optionality cases; duplicate decoded keys/depth/node limits; entire location grammar checked before extraction; ignored values never emitted; LIST extras rejected; metadata never gates eligibility/budget; exact profile grammar distinct from record IDs | accept escaped duplicate key; accept unknown key/incorrect location or null; omit depth/node bound; select primary URL only; loosen profile field-set/ID check; accept metadata on another field; leak ignored metadata; apply entropy threshold (positive witness); omit a permitted optional-key branch (positive witness) |

T12 belongs to existing S1 tests/helper only; §8 retains all file/line caps. If a bound/guard is
redundant under the reaching path, report that and supply a non-equivalent invariant witness; do not
count typecheck, equivalent mutations or mere incidental exceptions as runtime assertion kills.

T12 additionally requires these concrete witnesses within existing S1/S3 ownership:
- Version: accept 2.39.0 plus leading/trailing ASCII whitespace; reject 2.39.1, v2.39.0,
  2.39.0-beta, 2.39.0 extra, empty/invalid-UTF8 or >16KiB output as error/unavailable, with
  zero subsequent credential-bearing spawns. Include >16KiB output consisting only of a valid
  2.39.0 plus ASCII padding, so removing the byte cap would pass exact trimming and spawn an
  authenticated command; remove-version-byte-cap must red its dedicated zero-spawn witness.
  Mutants skip comparison, prefix/substring match,
  and accept-any-nonempty must red exact version/spawn assertions.
- Decode: truncated multibyte and lone0x80 inside an otherwise valid ignored title string reject
  integrity; fatal-decoder → Buffer.toString('utf8') mutant must red. Escaped duplicate
  title members ("title":"a" and "\u0074itle":"b") in an otherwise fully valid
  fixture reject integrity; accepting the decoded duplicate would succeed after last-wins parsing.
  The duplicate-key mutant must red that reaching success-vs-integrity assertion, not an unrelated
  identity check on a malformed standalone object.
- Limits: syntactically valid unique-key depth13 and >65,536-node inputs below byte caps yield
  unavailable before location-grammar rejection. Separate remove-depth/remove-node mutants must
  red the exact unavailable-vs-integrity envelope assertion; mere rejection is insufficient.
- Identity: uppercase/mixed26 item/vault IDs produce integrity on LIST/detail, config startup
  rejects; account uppercase26 remains a positive PROBE case. Duplicate field-ID values and
  duplicate present purpose strings reject integrity. Drop-uniqueness mutants need reaching
  witnesses that avoid other duplicate/candidate guards (e.g. two non-selected fields).
- Optionality/metadata: urls-absent detail integrity; fields-absent detail not-found; metadata
  placement scan before candidate semantic outcomes: an otherwise valid detail with no password
  candidate and entropy on a username field is integrity; moving placement validation after the
  missing-candidate return yields not-found and must red the exact-envelope assertion.
  Retain provider title/additional_information
  mutants target the S3 gate named above, not merely a model-output assertion.

A mutant must modify on-disk production/gate source, hit the actual test/CLI path, produce the specific
failing assertion (or explicitly declared timeout kill), then restore exact bytes/hash. Preserve command,
selector, before/mutant/restored digest, exit, native log, failure signature and final restored green for
each mutant. No equivalent mutant, in-memory inspection-only proof, skipped test or merely failing
TypeScript compile substitutes for the named runtime invariant. Do not promise a fake-process mutant
proves the real vendor CLI; T7 Darwin/Linux process behavior and V1 remain separate.

After implementation run in this order on a frozen candidate: (1) `npm run typecheck`; (2) `node scripts/check-docker-invocation.mjs` and
`node scripts/docker-invocation.selftest.mjs`, then targeted T1–T12;
(3) full named mutation table and restored targeted baseline; (4) `make test`; (5) `make test-docker`;
(6) `make eval-stub`; (7) `make mcp` and scripted T9/T10 bundle proof; (8) independent exact-candidate
diff channels including S4 contract/comments/setup wording and necessary capped fix/absorption gates; (9) literal independent clean clone + install +
browsers + full `make test` with no op/auth/generated artifacts; (10) V1 when separately authorized.
After any approved integration, exact merged-tree `make test`, Docker and stub gates remain mandatory.
Browser/timing suites serial across the machine; preserve every red, no retry-to-green or weakening.
`make eval` is NOT a free gate (real-comparison default); not authorized. No real cohort or paid interop.

V1 real-provider verification requires a separate concrete user-approved run card: supported OS/CLI
version+digest, isolated disposable custom vault, synthetic passwords only, operator-created read-only
service account/config, enumerated finite operations and cleanup/retention. Verify actual least privilege,
metadata/detail, rotation/origin drift, archive exclusion at discovery and permitted archive-after-discovery
resolution under D8, deletion/move, revoked/expired token, fixed errors,
no desktop/Connect fallback, cache/config/process behavior, and real adapter fill against a local fixture.
For deletion and token revocation separately, the V1 card must pre-register a finite schedule of
fresh, otherwise-admissible fills after the provider acknowledges the operation. Use a previously
discovered handle with unconsumed authorization; an exhausted budget or unrelated policy rejection
cannot establish provider removal. Record acknowledgement-to-attempt timing and whether each fresh
fill is denied with zero assignment and the fixed error envelope. Passing the removal check requires
all scheduled post-acknowledgement fills to deny because provider access/record retrieval is no longer
available; untyped CLI refusal remains unavailable, not proof of a particular typed cause. No cached
plaintext may supply a fill. In-flight operations started earlier are recorded separately and no
instantaneous interruption guarantee follows. Any successful fresh fill, ambiguous denial or missing
observation leaves the removal claim and M9 acceptance blocked pending a scoped reviewed disposition
and explicit user decision; no automatic retry or silent README-only waiver. Finite observations
establish only the recorded timing/environment, not a universal revocation-latency bound.

V0 and V1 each measure cold version+initial-list and warm-policy detail fetch durations with cache
disabled on the supported OS. V1 records three initial-discovery trials and three detail-fetch trials
(6 finite trials, synthetic records; no retry to pass) against the unchanged4s method deadline. Any
timeout is a retained availability failure; slow networks may render the adapter unusable. That is not
permission to enable cache or raise the bound; a material feasibility failure blocks acceptance pending
a reviewed user decision. A successful finite sample establishes feasibility only for that environment.
Retain only sanitized schema assertions, version and boolean outcomes; no raw CLI JSON, token or real
credential output. Timing observations are descriptive only under proposed D5: report
short/long response and queued-operation durations without treating finite non-detection as a security
pass. They do not modify Probe P’s locked family or thresholds. Provision/revoke/delete permission and request count must be explicit in that run card;
current session authorizes none of them. V0 is its earlier read-only schema feasibility subset.

M9 cannot be marked complete merely on mocks: V0/V1 and real working adapter are launch prerequisites.
After normal M9 implementation/diff ladder and after user-authorized M9 integration and exact merged-tree gates, but before M9
completion/advancing to M10, run the required read-only **whole-codebase security audit of that
exact integrated tree** (phase-plan §9.2) with the existing methodology, one baseline
auditor initially, external reports, threat model and accepted residuals. Then milestone-close assessment.
M10's demo/WebMCP positioning/publication remain separately scoped.

## 10. Review plan, criteria and preserved boundaries

M9 paper rounds1–3 are preserved as completed, including the final P1 and all NEEDS-ATTENTION
verdicts. On2026-09-12 the user requested additional review iterations; this M9-only extension is
bounded to **rounds4–5**, with no renumbering or M8 reopening. It overrides the original three-round
paper stop for this task only, not the repository policy or future implementation ladder. Round4 used
fresh Claude Opus5 plan/security channels and fresh-context Sol paper review. Revision5 absorbed its
findings and completed the three final-round5 channels; literal verdicts/coverage remain in Entry7.
The general paper cap stays closed. D8 is a user-approved material scope amendment with a fresh,
bounded independent delta review, not general round6. No original count or verdict is reset. No implication that
additional reviews approve contract amendments, real-provider work or implementation.

Paper P1: a concrete path to model-visible secret, unauthorized fill, duplicate budget for the same record,
secret resolution before admission, unbounded backend work falsely claimed bounded, or a silent locked
contract/gate relaxation that makes the proposal unsafe to implement. P2: missing implementable state,
unsupported provider behavior treated as fact, incorrect ownership or missing requisite proof. P3:
maintainability, wording and correctly disclosed limitations. D1–D9 approvals and offline implementation authorization are recorded in Entry55. Sampled V0 feasibility
is complete; actual implementation/V1 acceptance remains pending. D6/D7 gate changes stay confined to S3. At final implementation round, use canonical P1 cap: layers1–2 leak,
undeclared layer4 blind spot or red `make test`; all other defects remain recorded residuals/lock decisions.
Plan acceptance is not implementation approval, and a completed helper dispatch is not a safety verdict.

Post-implementation: fresh Claude QA, distinct Claude security, fresh Codex Astra adversarial exact-diff
review, capped at three fix rounds, then required audit/assessment. No author self-review substitutes.
Raw reports outside all worktrees, helper pins Opus5/high, safe-mode Read/Glob/Grep, no fallback;
record refs/digest/session/model/results/evidence location in the append-only M9 register.

Preserve M8's exact modern/legacy metadata behavior including uninspected optional values, stated
conformance uncertainty, `-32021` never emitted, seven frozen tool objects and all nine methods;
snapshot exemption, first-flush listener-retention and evaluator-alias residuals, generic error translation,
non-relocatable/unscanned dist, process recreation limitation, finite unfuzzed framing and prior coverage
limits. New deterministic M9 real-fill/subprocess tests may close only the specific witnessed coverage
gaps, not retroactively expand M8 acceptance. Production random canary does not detect real credential
leaks by value; synthetic sentinel proofs are bounded tests, not a credential-dependent production oracle.

E8c `PFc7eGp2` qualified only in its fixture/configuration; E8b `ODMFYbwH` unqualified. Both historical
archives remain untouched. MCP interoperability is not E8c qualification and there is no measured
nine-tool MCP cohort leak rate. The two paid M8 client calls are exhausted; standing independent-review
authorization is separate. M8's complete assessments/review rounds are not restarted.

### Canonical amendment crosswalk (apply only on user lock/implementation authorization)

D1 targets PROJECT-SPEC §3 goal2/§6/§10 as supporting CLI authority and phase-plan §1 row4 plus
§6’s onepassword/op-reference sentence (base line501); preserve long-term Bitwarden goal. D2 targets the literal phase-plan §6 before-decrypt sentence (base line489); backend.ts:49–50
currently has only the broader authorized-policy comment, so S4 adds the approved distinction there. D2 also
names `.claude/memory/decisions_product.md`’s added-after-M3 current-policy-before-decrypt statement
(base lines39–43). Proposed replacement: “Local-file compares current policy before decrypting and
binds ciphertext to handle/origin/recipe. 1Password, under approved D2, retrieves a full item only after
fill admission and validates returned identity/current policy before Secret construction; no atomic
vendor snapshot guarantee is established.” Its following “Backends hold nothing between calls” text
must distinguish no credential plaintext from the allowed frozen metadata, token fingerprint and
bounded lifecycle state. This project-memory edit is an explicit additional user-lock decision, not
permission to edit global Codex memory, and is not performed in this planning session.

D1/D3 also target the dated2026-08-31 PLAN.md Decisions-Log entry “First real backend = 1Password”
(locate by that dated text; frozen revision3 line127, revision4 line129), which asserts SDK/op-read equivalence and native canonical URLs. After
explicit lock, append a new APPROVED superseding decision tied to D1/D3, preserving that historical
entry. The current PROPOSAL ONLY entry does not supersede it. Do not leave this sibling ambiguous.
D6 targets retention.test.ts:100–110 and the explicit constructor/absence/mutant proof in §8.
D7 targets only the two owned Docker gate files and the exact rows/profile/selftest changes above.
Both gate amendments must appear in the user lock inventory and the reviewed implementation packet;
only the specifically authorized S3 gate changes are permitted.

Phase-plan §8 M9 row (base line561) must name the limited probe taxonomy, frozen discovery, bounds,
V0/V1 and CLI, rather than broadly promising all provider states. D5 targets phase-plan §2/§4 and the
new backend SCHEMA/setup text: retain historical M4 measurement and its six probes without claiming
that its synthetic-backend result covers remote provider latency. The dated M4 packet is historical;
add a scoped cross-reference in the current phase-plan, do not rewrite its historical measured result.
S4 also adds the disclosed unsupported-password-domain eligibility bit to SCHEMA declared limits.
Source backend.ts changes are comment-only in the reviewed S4 candidate. Entry55 authorizes this exact reconciliation; S4 updates the current normative sentences while
preserving historical decisions and observations.

D8 targets this proposal §2–§5/§7/T4/V1 and the README/setup limitation now. At separately authorized
implementation, S4 carries the same wording into SCHEMA's 1Password limits, docs/onepassword-setup.md
and release notes; no global local-file archive semantics change. The old T4 active-state-removal mutant
is superseded only for this adapter by the named D8 positive/negative/eligibility witnesses above.
T4 owns the archive/restore assertions and its separate later-list spawn/identity/budget mutants. Archive tests must assert handle/budget stability: an archive/restore cycle cannot refresh discovery,
remint handles or reset authorization. Deletion/revocation tests retain fixed-error and no-plaintext-cache
requirements and disclose post-snapshot/in-flight limitations; no assumption that archive is a substitute.

## 11. Open decisions, blockers and handoff status

D1–D7/N1–N8 are approved in Entry10; D8 is approved in Entry43. Both Entry7 mandatory P2 proofs,
all S1–S4 ownership and M8-C5 relocation/negative-signal proof conditions remain required unchanged.
D8’s narrowed guarantee completed scoped independent review (Entry44); D9 parser lock and offline
implementation approval followed in Entry55. Real-adapter acceptance remains pending. Neither a user policy decision nor a helper test is a V0 pass.

Observed V0 attempts01–04 and raw review verdicts/reading limits are preserved in the register.
All three V0 tokens are operator-revoked. Entry51's full bounded schedule satisfies its observation
checks, including A/B hidden-reference equality, current metadata candidate matching, C archive/list
behavior and tokenless refusal. D9 exact sanitized parser-contract lock/review and offline implementation
approval are complete in Entries54–55. No new token or live run is authorized; no original report is upgraded to PASS.
A production parser must use the explicitly locked bounded schema, never ignore unknown keys.
The64-spawn allowance and metadata snapshot, exact M8 metadata/restart limitation, R20 and both historical
cohorts stay unchanged. V1, whole-codebase audit and integrated gates still block M9 completion.

Not run in this D8 amendment: production/test/gate implementation, CLI/provider/credential operations,
configuration writes, paid interoperability/cohorts, commit/merge/push/public release. Only scoped
planning/docs changes and independent delta review. Historical provider observations are not erased.

**Deviations From Handoff:** user-approved D8 narrows archive-after-discovery enforcement. It is explicit
in proposal, planned tests and human-facing claims. Deletion-at-fill denial uses unavailable for an untyped CLI failure; not-found requires explicit DELETED or another established not-found case. This clarifies error classification without accepting a fill. No silent relaxation, general paper-review restart or retroactive PASS. D8 alone authorized no provider access; attempt04 ran under separate Entry47 authorization. Entry55 subsequently approves the exact observed-schema contract and offline implementation; V1 acceptance remains gated.


## 12. Concrete approval package — D9 lock and offline S1–S4 candidate

**APPROVED 2026-09-13 (Entry55):** scoped D9 review complete (Entries53–54); user approved §3.1/F0 as the exact parser contract and authorized the
already-owned S1–S4 offline implementation, synthetic proofs, exact-candidate reviews and bounded
fixes under §9/Entry7. This is one implementable candidate, not permission to relax existing gates.

- S1: four bounded backend modules and six existing planned test/helper files; no extra module,
  package or production source dependency. Use only operator-local configuration, no embedded
  account IDs/tokens or private report artifacts. Real credentials do not enter the repository.
- S2: MCP main selection/cleanup plus its two planned integration tests, preserving exact M8
  tool/protocol/metadata, startup anchors, cancellation and restart limitation.
- S3: only §8's exact gate owners/rows/manifest/relocation, mandatory stale-inspector and distinct
  positive/negative signal proofs from Entry7; no blanket authority or Secret-constructor exemption.
- S4: the named contract/comment/setup documents and project-local decisions_product.md reconciliation
  sequenced by N6, keeping historical decisions as history. **Approving this §12 package explicitly
  includes the named .claude/memory/decisions_product.md reconciliation required by §8/§10**;
  it does not imply any global Codex memory edit. No memory file is edited during preparation.

Authorize typecheck, named capability checkers/selftests, targeted and full default tests, on-disk
mutants with restored baseline, Docker tests, eval-stub, MCP build/scripted local fake-CLI proofs and
independent code/QA/security reviews. Existing test scripts/fixtures are inspected before execution;
no command may quietly invoke real op/accounts/paid agents. Browser/timing suites stay machine-serial.
No fresh statistical cohort, real-agent make eval, live client call or gate-policy change.

Leave the assembled candidate uncommitted and return its exact diff, results, risks and pending
acceptance work. §9's literal clean-clone gate remains required; because no commit is authorized here,
that gate waits for separate authorization of the exact reviewed commit. A dirty-tree export or
clone-plus-overlay may be reported separately but cannot substitute for the literal clean-clone gate.
No automatic merge/push/public release, extra worktree/branch switch of the continuity checkout,
provider/credential operation, installation or persistent configuration change. Any needed isolated
worker environment must preserve this checkout's dirty documents and be explicitly scoped by owner.

Actual later gates: V1 with its own approved finite provider/run/control card, Linux/binary/process
qualification for any Linux support claim, exact authorized integration gates, literal clean clone and
whole-codebase security audit. Revocation/deletion attribution controls from Entry44 stay mandatory
V1 design work. All three V0 tokens are revoked; no token is needed for offline implementation.
These outstanding acceptance gates are not reasons to invent more V0 reads, nor permission to mark
M9 complete early. D9/implementation approval does not approve any of those later external actions.
