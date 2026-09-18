# 1Password setup for TinyVault

The M9 claim is narrowed by the user decision of 2026-09-18: “offline-verified against a fake CLI,
plus an operator smoke test on op CLI 2.39.0 / macOS.” The smoke test was run by the operator on
2026-09-18 and passed ([results](#5-record-and-clean-up)); this is not a release announcement. Calibration/continuity work is abandoned as recorded residuals, not launch gates.
Natural expiry, Linux and denial-format classification remain documented limitations.
Local-file remains the always-available, free offline backend. Bitwarden is deferred.
The [V1 manual operator smoke test](#v1-manual-operator-smoke-test) is at the end of the setup steps.

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
Deletion and token revocation are intended removal workflows. The manual V1 smoke checks
missing-item and bad/revoked-token refusals; exhaustive provider behavior is not claimed. No immediate interruption of an in-flight fill is promised. Stopping one
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

## V1 manual operator smoke test

About 30 minutes, run by the operator in their own terminal with **op CLI 2.39.0 on macOS**, a
throwaway vault and a service account restricted to it. No agent or model is involved: you paste
MCP requests into the server by hand, so the saved stdout is exactly what a model would have seen.
It checks list, fill, missing item, bad token, revoked token, and that the secret and token appear
nowhere in the transcript or logs. It does not qualify natural token expiry, Linux, or how 1Password
words its denials; those stay documented limitations.

### 1. Prepare (about 12 minutes)

1. In 1Password create a vault `tinyvault-smoke` with one Login item: website
   `http://127.0.0.1:8808/login`, password generated by 1Password (32 letters and digits). No tags,
   sections, attachments or custom fields. You never need to type or view the password until step 6.
2. Create a service account with **Read Items** on that vault only. Save its token with the script in
   [CLI and private token file](#cli-and-private-token-file) (save the script as a file and run it
   with `python3`; it writes `~/.config/tinyvault/service-token`).
3. Write `~/.config/tinyvault/config.json` as in [Local configuration](#local-configuration-and-mcp-launch),
   with **two** items: your real item ID, and a second entry that does not exist,
   `{ "itemId": "zzzzzzzzzzzzzzzzzzzzzzzzzz", "label": "Ghost item" }`. That is the missing-item case.
4. Make the bad-token config and the working directory (the fake token is not a secret):

```bash
mkdir -p ~/tinyvault-smoke && chmod 700 ~/tinyvault-smoke
(umask 077; printf 'ops_smoke_invalid_token' > ~/.config/tinyvault/bad-token)
sed 's#/service-token"#/bad-token"#' ~/.config/tinyvault/config.json > ~/.config/tinyvault/config-badtoken.json
```

5. Confirm the CLI pin, replacing the path with your `opPath`. Expect `2.39.0` and the SHA-256 listed
   under [CLI and private token file](#cli-and-private-token-file):

```bash
/absolute/path/to/op --version && shasum -a 256 /absolute/path/to/op
```

6. Save this as `~/tinyvault-smoke/login-server.mjs` and start it in a **second terminal** with
   `node ~/tinyvault-smoke/login-server.mjs`. It never prints the password, only its length and a
   hash prefix:

```js
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

const page = body => `<!doctype html><title>Smoke login</title>${body}`;
createServer((request, response) => {
  if (request.method === 'POST') {
    let raw = '';
    request.on('data', chunk => { raw += chunk; if (raw.length > 65536) request.destroy(); });
    request.on('end', () => {
      const password = new URLSearchParams(raw).get('password') ?? '';
      const digest = createHash('sha256').update(password).digest('hex').slice(0, 12);
      console.log(`received password: length=${password.length} sha256[0:12]=${digest}`);
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(page('<p id="done">Signed in.</p>'));
    });
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html' });
  response.end(page('<form method="post" action="/login"><input id="password" name="password" type="password" autocomplete="off"><button id="submit" type="submit">Sign in</button></form>'));
}).listen(8808, '127.0.0.1', () => console.log('smoke login page: http://127.0.0.1:8808/login'));
```

7. In the first terminal, from the TinyVault checkout, build the server and define the launcher.
   stdout (the model-visible transcript) and stderr (the application log) are both saved:

```bash
make mcp
smoke() { env -i PATH="$PATH" HOME="$HOME" TINYVAULT_BACKEND=onepassword TINYVAULT_1PASSWORD_CONFIG="$HOME/.config/tinyvault/$1" node dist/tinyvault-mcp.mjs 2>> "$HOME/tinyvault-smoke/logs.txt" | tee -a "$HOME/tinyvault-smoke/transcript.jsonl"; }
```

### 2. Run A: list, fill, missing item (about 8 minutes)

Start with `smoke config.json`. The terminal then waits for input. **Paste one request line at a
time and wait for its reply** before the next; two lines pasted together are rejected as
`Invalid request`. Prepare lines 3 to 7 in a text editor first, replacing `HANDLE` and `SESSION`
with the values from replies 1 and 2. Press Ctrl-D to stop the server when done.

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}},"name":"list_vault","arguments":{}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}},"name":"browser_open_session","arguments":{}}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}},"name":"browser_navigate","arguments":{"sessionId":"SESSION","url":"http://127.0.0.1:8808/login"}}}
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}},"name":"fill_from_vault","arguments":{"handle":"HANDLE","sessionId":"SESSION","fields":[{"role":"password","selector":"#password"}]}}}
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}},"name":"browser_click","arguments":{"sessionId":"SESSION","selector":"#submit"}}}
{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}},"name":"browser_snapshot","arguments":{"sessionId":"SESSION"}}}
{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}},"name":"fill_from_vault","arguments":{"handle":"vh_00000000000000000000000000000000","sessionId":"SESSION","fields":[{"role":"password","selector":"#password"}]}}}
```

Expected, and what to record:

- **List (id 1):** exactly one item, carrying your configured label, a `vh_…` handle and
  `"available":true`. "Ghost item" is absent. No 1Password title, username, URL or item ID appears.
  If the list fails instead, remove the ghost entry, rerun, and record that the ghost caused it.
- **Fill (ids 3 to 6):** `{"ok":true}`, then `{"ok":true,"filled":["password"]}`, then `{"ok":true}`;
  the login-server terminal prints one `received password: length=… sha256[0:12]=…` line; the
  snapshot shows `Signed in.`. Keep that hash prefix for step 4.
- **Missing item (id 7):** `{"ok":false,"reason":"handle-unavailable"}` and no new line in the
  login-server terminal.

### 3. Runs B and C: bad token, revoked token (about 6 minutes)

Each run is one request: start the server, paste the `list_vault` line (id 1 above), read the reply,
press Ctrl-D.

- **Run B, bad token:** `smoke config-badtoken.json`. Expect the fixed refusal
  `"text":"Vault operation failed"` with `"isError":true`, and nothing from 1Password's own error text.
- **Run C, revoked token:** in 1Password, revoke the service account's token (or delete the service
  account). Then `smoke config.json` again. Expect the same fixed refusal. Record the literal reply if
  it differs; a different fixed category is an observation, not a failure. Any 1Password error
  wording, token fragment or item data in a reply **is** a failure.

### 4. Grep for the secret and the token (about 3 minutes)

`read -rs` takes the password without echo and without shell history. Copy the password from
1Password, run the block, paste, press Enter:

```bash
read -rs S
printf '%s' "$S" | shasum -a 256 | cut -c1-12
grep -rlF -f <(printf '%s\n' "$S") ~/tinyvault-smoke; echo "secret grep exit=$? (1 means no match)"
grep -rlF -f ~/.config/tinyvault/service-token ~/tinyvault-smoke; echo "token grep exit=$? (1 means no match)"
unset S
```

- The printed hash prefix must equal the one the login server printed in run A. This is the positive
  control: it proves the value you are grepping for is the value that was filled, so a zero-match
  grep means something.
- Both greps must list no files and print `exit=1`.

### 5. Record and clean up

Report only the table below: no secret, token, IDs or raw CLI output. Then delete the service
account and the `tinyvault-smoke` vault, and remove `~/tinyvault-smoke`, the two token files and the
two configs.

| Check | Expected | Result (2026-09-18, operator-run) |
|---|---|---|
| Date, macOS version, `op --version`, binary SHA-256 matches pin | 2.39.0, match | 2026-09-18, macOS 15.6.1 (24G90) arm64, op 2.39.0 (Homebrew cask), 41,016,304 bytes, SHA-256 matches the pin |
| A1 list: one item, configured label, ghost absent, no provider metadata | yes | **pass**: one item, configured label, `available:true`; ghost absent; no title, username, URL or item ID |
| A2 fill: `filled:["password"]`, server got one POST, snapshot `Signed in.` | yes | **pass**: `{"ok":true,"filled":["password"]}`; one POST, length 32; snapshot `Signed in.` |
| A3 unknown handle refused as `handle-unavailable`, no POST | yes | **pass**: `handle-unavailable`; login page still showed exactly one POST |
| B bad token: fixed refusal, no provider text | yes | **pass**: `Vault operation failed`, `isError:true`, no provider text |
| C revoked token: fixed refusal, no provider text | yes | **pass**: fresh process after the operator revoked access in 1Password; same fixed refusal, no provider text |
| Hash prefix from step 4 equals the login server's | equal | **pass**: equal (12-hex prefix of the SHA-256; the value itself was never shown) |
| Secret grep over transcript and logs | no match (exit 1) | **pass**: exit 1 over a 19-reply transcript; a known-present string was found by the same grep (positive control) |
| Token grep over transcript and logs | no match (exit 1) | **pass**: exit 1 |
| Anything unexpected | none | The stderr log was 0 bytes in all runs, so the log grep is trivially clean. Nine `-32700 Parse error` replies came from empty lines the operator sent (an extra Enter); fixed protocol errors, no data. One `list_vault` was pasted into the still-running run A process and correctly answered from its frozen snapshot. |

This is one operator's single run. It shows the adapter working against the real service on this
CLI version and OS, with no secret or token in the model-visible output. It is not a qualification
of natural token expiry, Linux, or 1Password's denial formats.

## Cleanup and reporting problems

The backend removes only its own temporary runtime directory on normal disposal. It does not delete
your token/config files, service account or vault. You own their cleanup: revoke disposable tokens
in 1Password, stop TinyVault, then remove your local files and synthetic vault when finished.
Forced parent termination cannot guarantee cleanup of every child or temporary resource.

For reports, share the fixed error category and synthetic reproduction only. Do not attach raw CLI
output, service tokens, account/item IDs, local configuration or password-manager screenshots.
No online V1 run is authorized by these instructions alone in an agent-led session.
