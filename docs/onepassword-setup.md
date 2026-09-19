# 1Password setup for TinyVault

This guide connects TinyVault to your own 1Password account, through a service account and 1Password's `op` command-line tool. The local-file backend is the default and needs none of this. Bitwarden isn't supported yet.

What has been tested: the backend against a fake CLI, plus one manual run against the real service on macOS with `op` 2.39.0 on 2026-09-18 ([results](#5-record-and-clean-up)). What hasn't: Linux, tokens that expire on their own, and the exact wording of 1Password's refusals. I started a deeper qualification effort for this backend and dropped it. It isn't claimed as evidence.

You connect your own account using files on your machine. TinyVault ships no account, token or credential database. Keep account IDs, item IDs, tokens, config files and raw CLI output out of the repo, and out of screenshots, transcripts, issues and test evidence. The examples and automated tests use made-up data.

The [manual smoke test](#v1-manual-operator-smoke-test) at the end is a 30-minute way to check all of this against a throwaway vault.

## Account and vault

1. Make a dedicated vault that holds only the Logins you want TinyVault to reach. The service account can read everything in a vault it's granted. TinyVault's own item list limits what TinyVault uses; it is not an access control on 1Password's side.
2. In 1Password's developer tools, create a service account with **Read Items** on that vault and nothing else: no other vaults, no write, share or create-vault permissions, no Environments. 1Password's walkthrough is [here](https://www.1password.dev/service-accounts/get-started).
3. Start with throwaway Logins. Each one needs the standard password field and at least one full website URL, such as https://tinyvault.example.invalid/login. A custom URL field or a bare hostname isn't enough. If an item has several website URLs, they must all be on the same origin.
4. Copy the vault's and each item's UUID using 1Password's UUID controls, and keep them private. TinyVault is configured with exact item IDs, not names, links or secret references. It accepts only 26-character IDs made of lowercase letters and digits. Uppercase or mixed-case IDs aren't supported. The service account's own ID looks different and doesn't go in the item config.

Keep items plain. TinyVault refuses an item whose data contains anything it doesn't recognise: tags, sections, attachments, custom fields, duplicate field IDs, or two fields with the same purpose. One consequence is that a change on 1Password's side can make TinyVault start refusing even when your CLI version hasn't changed. The exact accepted shape is in the [parser contract](../build-log/docs/m9-onepassword-packet.md#31-d9--exact-parser-contract-approved-entry55).

## CLI and private token file

Use Node 24 and **1Password CLI 2.39.0**, installed the [official way](https://www.1password.dev/cli/get-started). TinyVault refuses other versions. Configure the absolute path to the real executable, not a shell wrapper or a PATH lookup. If your install is a symlink (Homebrew's `/opt/homebrew/bin/op` is one), resolve it with `realpath`, so the path names the file whose hash you checked.

The macOS arm64 binary I used is 41,016,304 bytes, SHA-256 `f48b97df4dfdccc67483587b40a596f70881eac05a576de7b7775d267375757a`. TinyVault checks the version at run time, but that check doesn't prove the binary is genuine. Verifying your download is up to you. Linux is untested and Windows isn't supported.

Save the token in your password manager, then put a copy in a file owned by your user, mode 0600, in a private directory outside the checkout. Don't export `OP_SERVICE_ACCOUNT_TOKEN`, put the token in your MCP configuration, paste it into a chat, or pass it on a command line. TinyVault refuses to start if it inherits that environment variable.

To create the file, run this script in your own terminal. It asks for the token with hidden input, creates a new file only, prints nothing secret, and doesn't contact 1Password.

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

To replace a token later: stop TinyVault, replace the file yourself, start TinyVault again. Don't build this into an automatic retry. TinyVault rereads the file whenever it needs 1Password and remembers a fingerprint of the first token it saw. If the token changes while TinyVault is running, it refuses everything until you restart it, even if you put the old token back. A call that was already under way finishes with the token it started with.

## Local configuration and MCP launch

Create a config file outside the repository. Replace the placeholders with your own absolute paths and the IDs you copied. A label is the display text the model will see: 1 to 128 characters, no control characters. These are the only keys allowed, and you can list 1 to 64 items, each once.

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

From the TinyVault checkout, with dependencies installed, build the server with `make mcp`. Then configure your MCP client to launch Node on the bundle, with the checkout as the working directory and only the two environment variables below. Don't set `TINYVAULT_VAULT_PATH` or `TINYVAULT_KEY_PATH` as well; those select the local-file backend.

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

**Process recreation grants fresh fill authorization; the adapter does not establish renewal isolation in the tested Claude Code configuration (2.1.258, measured 2026-09-12).** In plain terms: each credential can be filled once per TinyVault process, and restarting the process resets that. An MCP client that restarts servers on its own, which Claude Code does, gives the model a way around the one-fill rule.

The bundle needs the checkout's `node_modules`; it isn't a standalone binary. MCP clients name their config fields differently. What matters is the four things above: the executable, the argument, the working directory and the environment.

The model sees the same tools and messages as with the local-file backend. If a setup message tells the user to "unlock" the vault, that wording is generic. A service account has no lock screen. Fix the token or its permissions yourself and restart TinyVault. The model can't unlock anything, sign in, install software, fall back to another backend, or create credentials.

## What stays fixed during a process

**The item list is read once.** The first successful listing fixes which items TinyVault can use and the origin each is pinned to. Later listings reuse that snapshot and don't ask 1Password again. If the first listing was validly empty, it stays empty until restart. Renaming an item, rotating its password, archiving and restoring it, or asking for setup can't produce a second handle or a second fill. A copy of an item with a new ID is a different item to TinyVault: it doesn't compare passwords to spot duplicates, so don't configure copies if you want one fill per credential.

**Archiving a 1Password item does not revoke TinyVault access in an already-running process.** Items archived before the first listing are left out. An item archived afterwards may still be filled, under the same identity, origin and password-field checks and whatever fill budget remains. To cut access, delete the item or revoke the token. The manual smoke test below checked a missing item, a bad token and a revoked token; it doesn't claim to cover everything 1Password might do. A fill that's already under way isn't interrupted. Stopping a TinyVault process ends its authorization; restarting creates a fresh one and has no effect on any other running process.

**What TinyVault reads from 1Password.** When a fill is allowed, the CLI decrypts the whole item in trusted memory, and only then does TinyVault check the item's identity and origin again. The local-file backend checks first and decrypts second, so this is a real difference. Only the password is kept. Titles, usernames, notes, references and error text from 1Password are never passed to the model. The model sees your configured labels and the opaque handles, nothing else. TinyVault doesn't claim a consistent snapshot across 1Password's data, or that memory is cryptographically erased.

**Passwords.** Supported: 1 to 4,096 UTF-16 code units, no carriage return or line feed, whitespace preserved. A missing or unsupported password is refused with a fixed reason, which does tell the model that this item can't be used. Time spent fetching from 1Password is outside TinyVault's measured timing claim.

**Limits.** Each backend call gets 4 seconds. At most four run at once, and a backend starts the CLI at most 64 times in its life. If a call hasn't settled by 3,900 ms, the backend refuses everything after that until restart, even when the stall was in the local filesystem. The 64 counts version checks, probes and failures too, so it isn't a limit on requests to 1Password or on billing. The version check and the first listing use two, which leaves 62: configuring 64 items doesn't guarantee 64 fills. On a slow network the backend can become unavailable. There is no automatic retry, no caching and no longer deadline. If the host times out, the fill budget can be spent even though no fill was reported, and a cancelled request can still finish its work without sending a response.

## V1 manual operator smoke test

About 30 minutes, in your own terminal, with **op CLI 2.39.0 on macOS**, a throwaway vault and a service account restricted to it. No agent or model is involved. You paste MCP requests into the server by hand, so the saved output is exactly what a model would have seen.

It checks listing, filling, a missing item, a bad token and a revoked token, and that neither the password nor the token appears anywhere in the transcript or the logs. It doesn't cover tokens that expire on their own, Linux, or how 1Password words its refusals.

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
| C revoked token: fixed refusal, no provider text | yes | **pass**: fresh process after the operator revoked the service-account token in 1Password; same fixed refusal, no provider text |
| Hash prefix from step 4 equals the login server's | equal | **pass**: equal (12-hex prefix of the SHA-256; the value itself was never shown) |
| Secret grep over transcript and logs | no match (exit 1) | **pass**: exit 1 over a 19-reply transcript; a known-present string was found by the same grep (positive control) |
| Token grep over transcript and logs | no match (exit 1) | **pass**: exit 1 |
| Anything unexpected | none | The stderr log was 0 bytes in all runs, so the log grep is trivially clean. Nine `-32700 Parse error` replies came from empty lines the operator sent (an extra Enter); fixed protocol errors, no data. One `list_vault` was pasted into the still-running run A process and correctly answered from its frozen snapshot. |

This is one operator's single run. It shows the adapter working against the real service on this
CLI version and OS, with no secret or token in the model-visible output. It is not a qualification
of natural token expiry, Linux, or 1Password's denial formats.

## Cleanup and reporting problems

When TinyVault shuts down normally it removes its own temporary directory and nothing else. Your token file, config, service account and vault are yours to clean up: revoke throwaway tokens in 1Password, stop TinyVault, then delete the local files and the test vault. If the parent process is killed, a child process or temp directory can be left behind.

When reporting a problem, share the fixed error category and a reproduction with made-up data. Don't attach raw CLI output, tokens, account or item IDs, your config, or password-manager screenshots.

If a coding agent is helping you with this setup, it shouldn't hold your token or run these steps against your real account. Run them yourself.
