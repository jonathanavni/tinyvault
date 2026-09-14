# 1Password setup for TinyVault

The M9 implementation is in progress. These instructions describe the approved contract; they are
not a release announcement. Real-adapter verification (V1), integration gates and the security audit
remain required. Local-file remains the free, offline default. Bitwarden is deferred.

Each person connects their own account using local files. TinyVault does not ship an account, shared
token or credential database. Keep account IDs, item IDs, tokens, configuration and raw CLI responses
outside the repository and outside screenshots, transcripts, issues and test evidence. Portfolio
examples and automated tests use independently authored synthetic data.

## Account and vault

1. Use a dedicated custom vault containing only the Login records you intend TinyVault to access.
   The service account can read the whole granted vault; TinyVault's item allowlist is not a vendor ACL.
2. In 1Password's developer tools, create your own service account granting only **Read Items** on
   that vault. Do not grant other vaults, write/share/create-vault permissions or Environments.
   Follow [1Password's service-account setup](https://www.1password.dev/service-accounts/get-started).
3. Start with disposable synthetic Logins. Each needs the standard built-in password field and at
   least one full website URL, such as https://tinyvault.example.invalid/login. A custom URL field
   or a bare hostname is insufficient. Multiple website URLs must all have the same normalized origin.
4. Privately copy the vault and item UUIDs using 1Password's UUID controls. Configure exact item IDs,
   not names, links or secret references. This adapter accepts only lowercase ASCII alphanumeric
   26-character vault/item IDs. Uppercase or mixed-case record IDs are unsupported; the service-account
   identity has a different grammar and does not belong in the item config.

Use the minimal Login shape described in the [locked parser contract](m9-onepassword-packet.md#31-d9--exact-parser-contract-approved-entry55).
Unrecognized response keys, including tags, sections, files and custom sections, cause refusal.
Duplicate field IDs or present purposes (including two empty purposes) also cause refusal.
A provider-side response change can cause refusal even when the CLI version is unchanged.

## CLI and private token file

Use Node 24 and the pinned **1Password CLI 2.39.0**, obtained through the
[official CLI installation instructions](https://www.1password.dev/cli/get-started).
Configure the absolute path to the real executable, not a shell wrapper or PATH lookup.
The observed Darwin arm64 binary is 41,016,304 bytes, SHA-256
`f48b97df4dfdccc67483587b40a596f70881eac05a576de7b7775d267375757a`.
This is an installation/evidence pin; the runtime version check is not executable authentication.
Darwin V0 observations do not qualify Linux binaries or a working real adapter. Linux remains
unverified, and Windows is unsupported.

Save the token privately in your password manager, then use a local token file owned by your user,
mode 0600, in a private directory outside the checkout. Do not export
`OP_SERVICE_ACCOUNT_TOKEN`, put it in MCP configuration, paste it into chat, or supply it on a
command line. Both library construction and the MCP entry reject an inherited service token.

For first-time file creation, run this in your own interactive terminal. It prompts with hidden input,
creates only a new file, and prints no token. It does not contact 1Password.

```python
import getpass, os, pathlib, stat, sys

if not sys.stdin.isatty() or not sys.stderr.isatty():
    raise SystemExit("Use an interactive terminal.")
directory = pathlib.Path.home() / ".config" / "tinyvault"
directory.mkdir(parents=True, mode=0o700, exist_ok=True)
info = directory.lstat()
if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid():
    raise SystemExit("Use your own private directory.")
directory.chmod(0o700)
token = getpass.getpass("Service-account token (hidden): ")
if not token or any(c.isspace() for c in token) or len(token.encode()) > 16384:
    raise SystemExit("Token format not supported.")
descriptor = os.open(directory / "service-token",
    os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
try:
    with os.fdopen(descriptor, "wb") as output:
        output.write(token.encode())
finally:
    token = None
print("Token saved privately.")
```

For an existing file, intentionally replace it through your own private workflow after stopping
TinyVault. Do not make replacement part of an unattended retry. The backend rereads the file when
provider work is needed and binds the first token's fingerprint. A changed token latches refusal
until process restart, even if you restore the original token. This does not prevent an already
admitted call from finishing with its original token.

## Local configuration and MCP launch

Create a local config JSON outside the repository. Replace these synthetic placeholders with your
own absolute paths and copied IDs. Labels are your chosen display text, 1–128 characters without
control characters. The exact allowed keys are shown here; configure 1–64 unique items.

```json
{
  "opPath": "/absolute/path/to/op",
  "tokenPath": "/absolute/path/to/private/service-token",
  "vaultId": "vvvvvvvvvvvvvvvvvvvvvvvvvv",
  "items": [
    { "itemId": "aaaaaaaaaaaaaaaaaaaaaaaaaa", "label": "Example Login" }
  ]
}
```

From the TinyVault checkout with dependencies installed, build with `make mcp`. Configure your
MCP client to launch Node with the absolute checkout bundle path, use the checkout as its working
directory, and set only the backend/config-path variables shown below. Do not combine them with
`TINYVAULT_VAULT_PATH` or `TINYVAULT_KEY_PATH`.

```json
{
  "command": "/absolute/path/to/node",
  "args": ["/absolute/path/to/tinyvault/dist/tinyvault-mcp.mjs"],
  "cwd": "/absolute/path/to/tinyvault",
  "env": {
    "TINYVAULT_BACKEND": "onepassword",
    "TINYVAULT_1PASSWORD_CONFIG": "/absolute/path/to/private/config.json"
  }
}
```

**Process recreation grants fresh fill authorization; the adapter does not establish renewal isolation in the tested Claude Code configuration (2.1.258, measured 2026-09-12).**

The bundle needs the checkout's dependencies; it is not a relocatable standalone binary. MCP client
configuration field names can differ; the contract is the executable, argument, working directory
and environment above. Existing model-facing tools, metadata and setup templates are unchanged.
Their generic “Unlock” guidance does not mean a service account follows desktop lock state:
repair account/token permissions privately and restart deliberately. There is no model-run unlock,
automatic sign-in, installation, fallback or credential-provisioning operation.

## What stays fixed during a process

Initial successful discovery freezes the eligible inventory and policy. Later lists and policy reads
use that snapshot with no provider refresh; a valid empty discovery also stays empty until restart.
Renaming, password rotation, setup calls, or archive/restore cannot create a second handle or another
fill budget. A copy with a new item ID is another record: TinyVault does not compare plaintexts to
deduplicate duplicate credentials. Avoid configuring copies if you intend one budget per credential.

**Archiving a 1Password item does not revoke TinyVault access in an already-running process.**
Items archived before discovery are excluded. An already discovered item may still resolve after
archiving under its original identity, origin, password-field checks and remaining fill budget.
Deletion and token revocation are intended removal workflows, but V1 must verify their actual
behavior before release. No immediate interruption of an in-flight fill is promised. Stopping one
process ends its domain; restarting creates fresh authorization and does not revoke another process.

The CLI decrypts a full item in trusted memory after fill admission, before TinyVault validates
its current identity and policy. This differs from local-file's policy check before decryption.
Only the selected password reaches Secret construction; no returned provider titles, usernames,
notes, references, passwords or errors are forwarded as metadata. Configured labels and opaque
handles are the model-facing inventory. No atomic vendor snapshot or cryptographic memory-erasure
guarantee is claimed.

Supported passwords are 1–4096 UTF-16 code units with no CR/LF. Supported whitespace is preserved.
Missing/unsupported passwords cause fixed refusal, so support eligibility is not hidden. Remote
fetch latency is outside the existing measured timing claim.

Each backend method has a 4-second bound on a responsive event loop, with at most four simultaneous
methods and 64 total CLI spawns per backend lifetime. If work has not settled by the final
3,900 ms cutoff, the backend permanently refuses later work until restart, including when stalled
local filesystem operations caused the timeout. The count includes version checks, probes and
failures; it is not a provider-request or billing ceiling. Version plus discovery leaves at most
62 further spawns, so 64 configured items do not guarantee 64 fills. Slow networks can make the
adapter unavailable; there is no automatic retry, cache enablement or deadline increase. A host
timeout can consume fill authorization even if no fill is reported. Cancellation can suppress a
response while admitted work still finishes.

## Cleanup and reporting problems

The backend removes only its own temporary runtime directory on normal disposal. It does not delete
your token/config files, service account or vault. You own their cleanup: revoke disposable tokens
in 1Password, stop TinyVault, then remove your local files and synthetic vault when finished.
Forced parent termination cannot guarantee cleanup of every child or temporary resource.

For reports, share the fixed error category and synthetic reproduction only. Do not attach raw CLI
output, service tokens, account/item IDs, local configuration or password-manager screenshots.
No online V1 run is authorized by these instructions alone in an agent-led session.
