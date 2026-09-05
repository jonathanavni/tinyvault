# M5.2 slice 3 — the container, the Compose file, and the framed `docker exec` bridge

> The spec calls this "the `docker exec -T` bridge"; the plain `docker exec` CLI has no `-T` (that flag belongs to `docker compose exec`, which takes a service selector), so the argv is `docker exec -i <id>` — see §3 step 7.

**Revision 2** — absorbs round 1 of the pre-implementation review (`docs/m5-2-slice-3-review-findings.md`: C-U1
Codex Sol **STOP** 10×P1 / 6×P2 / 3×P3; C-U1b fresh-context Claude **NEEDS-ATTENTION** 0×P1 / 7×P2). Base: `main` @ `ee23823`. Branch:
`codex/m5-2-slice-3`. Spec: `docs/m5-2-slice-spec.md` revision 4 (LOCKED, `60520d9`) §D2, §D2.1, §D5, §D7
(hygiene only), and the parts of §D3 the bridge must carry. Acceptance gated here: **C** (lint + probe matrix),
**E**, **G**, **I**, plus the slice-3 subset of **A** and the standing **N**. Inherits six declared residuals from
slice 2 (§10).

> **What changed from revision 1.** Every round-1 finding is absorbed. The invalid `docker exec -T` argv becomes
> `exec -i <id>` (U1b-1); `compose up` gets a finite `--wait-timeout` (U1-7, U1b-2); the origin probe is injected so
> Job B stays Docker-free (U1-8, U1b); frames get a canonical-encoding check and value-type rules, and a request
> timeout closes the bridge (U1b-3/4); response correlation tracks lifetime-seen ids so the duplicate, unseen-id and
> unsolicited branches are non-overlapping (U1-2); the container serializes request handling (U1-13); Acceptance E
> gains `logs` and `export` variants plus an artifact-tree scan, each with a planted-needle positive control
> (U1-1); the lint becomes a **closed schema** rejecting every unknown key including `include`/`extends`, with one
> self-test mutant per rule (U1-4, U1b-5); the capability allowlist becomes **per-capability** (U1-3); the
> `make test` entry point is pinned by an external gate and the Docker test set is exact (U1-10, U1-16, U1b-6);
> creation provenance adds a pre-up absence check, `Created ≥ epoch`, the standard Compose labels and the full
> inspect field list (U1-6, U1-15, U1b); the C probe matrix adds container IPs, a supervised-browser navigation leg
> for the evaluated agent, and a Docker-suite-only override so the dynamic mutant reaches the probe (U1-5); the
> two-writers property is enforced structurally on the bridge process (U1-9); **B4 is resolved by its original
> shape** — the EPERM substitution becomes in-process-only and the container entry fails hard under an injected
> EPERM (U1-11); **R2-4 is gated by a production-builder mutation pass, not recorded as equivalent** (U1-12); the
> false `"type": "module"` rationale is corrected (U1-18, U1b); Job B is split (U1-19, U1b); `.dockerignore` moves to
> the context root; `.env` interpolation is disabled by argv.

> **The claim this slice serves, and nothing stronger** (spec §D2, locked wording): *under the Docker-daemon
> isolation requirement, hostile page content and the evaluated agent cannot directly address the fixture control
> transport, obtain its capabilities, retrieve control-plane state, or request event attestation.* Nothing in this
> plan, the code, a test name, `SCHEMA.md` or the scorecard may present the §D5.0 preflight as proof of daemon
> non-exposure, or promise containment after fixture-process compromise.

---

## 1. Scope (literal — the owner set this boundary in `docs/m5-2-implementation-plan.md` row 3)

1. A Dockerfile and a Compose file: **one container per fixture**, only page-origin TCP ports published (loopback
   only), the control Unix socket entirely inside the container, no volumes of any kind.
2. **Harness-controlled creation** under a fresh Compose project and eval epoch; **exactly-one-container**
   resolution per service; the immutable container id recorded; **label and image-identity verification** before
   any exec.
3. The long-lived **`docker exec -i <id>` bridge** to the internal socket, with length-prefixed framing, request ids,
   one stdout writer, and close-on-anomaly (§D2.1 framing rules, Acceptance I).
4. **Bootstrap-secret delivery over bridge stdin**, then the **challenge / injective-MAC** trust anchor binding
   challenge, epoch, fixture identity, full container id and public key (Acceptance G).
5. The **static Compose lint** and its self-test, wired into `make test` (Acceptance C's static half).
6. The first **executable `DockerCommand` variants** behind the slice-2 choke point (`testbed/docker/exec.ts`).
7. **Every** new composed-construction failure class is a red with no fallback (Acceptance A's slice-3 subset).
8. Two inherited residuals are **resolved**, not carried: the eval-time interceptor exclusion and B4 (§10).

**Not this slice** (rows 4–6): the five administrative operations over the bridge and their capabilities (§D3),
capture transfer and harness-side persistence (§D7), the idempotent receipt read, attestation and domain
separation (§D4), the parity gate, the behaviour-to-claim table, the `SCHEMA.md` amendment and scorecard line
(§D6, Acceptance K/O/P). **Composed mode therefore cannot run a scenario at the end of slice 3** — its
control-plane methods fail closed with a named code until slice 4 (§6). This is the same shape slice 2 shipped
("construction unavailable until slice 3") and it is stated rather than hidden. Also not this slice: CI, image
publishing, digest pinning, Node pinning (M10); new fixtures or capture channels; any change to `PROJECT-SPEC.md`.

---

## 2. Topology: one image, three services, fixed loopback ports

**Decision T1 — one image, `TV_FIXTURE_ID` selects the fixture.** All three services build from the same
Dockerfile; the container entry reads `TV_FIXTURE_ID` (`benign-login` | `lookalike-origin` |
`dom-hidden-injection`) and starts that fixture with the **same** `startLoginFixture` code the in-process
transport uses (§D1: one implementation, two transports). One image keeps image-identity verification to one
expected id.

**Decision T2 — fixed, loopback-only published ports, declared in the Compose file.**

| Service | Container port | Published on host | Origin the browser sees |
|---|---|---|---|
| `benign-login` | 8080 | `127.0.0.1:47110` | `http://127.0.0.1:47110` |
| `lookalike-origin` | 8080 (canonical), 8081 (lookalike) | `127.0.0.1:47120`, `127.0.0.1:47121` | `http://127.0.0.1:47120`, `http://127.0.0.1:47121` |
| `dom-hidden-injection` | 8080 | `127.0.0.1:47130` | `http://127.0.0.1:47130` |

*Why fixed rather than ephemeral:* the fixture must know its **host-visible origin** before it serves anything —
`successEndpoint` in the signed receipt is `${origin}/success` (`loginFixture.ts:375-385`) and the lookalike
canonical origin redirects to the lookalike's host-visible origin (`lookalike-origin/index.ts:47-53`). With
ephemeral host ports that origin exists only after `up`, which would require a post-start control operation to
deliver it (slice-4 machinery) or a racy free-port pick. Fixed ports let the origin travel as plain Compose
environment (`TV_PUBLIC_ORIGIN`, `TV_LOOKALIKE_PUBLIC_ORIGIN` — not secret) and let the static lint check the
**exact** published-port set, which is what Acceptance C asks for. Cost: two concurrent composed evals on one
host collide at `compose up` (port in use) and the second **fails closed, loudly** under Acceptance A. Accepted.

**Decision T3 — the fixture listens on `0.0.0.0:<container port>` inside the container but reports the public
origin.** `startLoginFixture` gains an injected listen spec `{host, port, publicOrigin}`; the in-process default
stays `127.0.0.1:0` with the bound address as origin (`loginFixture.ts:114-128`, `:470-478`), so in-process
behaviour is byte-identical. The lookalike server gets the same seam.

**Decision T4 — control socket path `/tmp/tinyvault/control.sock`, inside the container filesystem.** Never
declared in `volumes`, never published; the lint rejects any `volumes` key at all (§8). The container runs as the
`node` user.

**Decision T5 — the image is built by the harness, not pulled.** Base `node:24-slim` by tag (digest pinning is
M10). Multi-stage: the builder runs `npm ci --ignore-scripts` and bundles the two container entries with
**esbuild** (new pinned devDependency) into single ESM files; the runtime stage copies only those bundles.
*Why a bundler:* the package is ESM (`package.json:5`) but the sources are TypeScript with **extensionless
relative imports** under `moduleResolution: Bundler`; Node's ESM resolver requires explicit extensions and its type
stripping does not add them, `tsc` cannot rewrite extensionless specifiers (`rewriteRelativeImportExtensions`
only rewrites explicit `.ts`), and CJS emission fails on `import.meta.url` (`lookalike-origin/index.ts:43`).
The bundle graph must stay **fixture-only**: `loginFixture.ts:19` imports `scenarios/benignLogin`, which imports
`src/agents/stub`; Job C lifts `BENIGN_USERNAME`/`controlTokenFor` into a leaf module so no agent or harness code
enters the image, and the Docker suite asserts the bundle's module list (esbuild `--metafile`) contains no
`src/agents/` or `testbed/runner*` path. `package-lock.json` is owned by Job C alone. esbuild is the boring,
auditable way to get one file per entry. Alternatives considered and rejected: `tsx` inside the runtime image (a
runtime dependency and a second TypeScript toolchain in the security fixture); publishing a prebuilt image (M10,
and it breaks "provenance from harness-controlled creation").

**Readiness.** Each service declares a Compose `healthcheck` (a `node -e` probe of its own HTTP port and the
control socket's existence) with pinned `interval`, `timeout`, `retries` and `start_period`, and the harness runs
`compose up -d --wait --wait-timeout <N>` with a **finite** constant timeout, so "container is up" means healthy
and an unhealthy or never-healthy service is a loud `container-unhealthy` red rather than a hang. The bridge then
connects **once**. A bounded pre-handshake connect retry against the same immutable id would *not* be the
rebinding §D2.1 forbids (revision 1 said otherwise; that was wrong) — one connect is chosen as the simpler,
fail-fast design, and the healthcheck's socket-existence probe is what makes it safe.

**Image naming.** Exactly one service (`benign-login`) carries `build`; the other two reference the same
`image: tinyvault-fixture-${TV_PROJECT}:latest` without `build`, so Compose builds once and the harness has one
image id to verify. The lint encodes this exact shape.

---

## 3. Harness-controlled creation and the provenance chain (§D2.1 step 1–2, Acceptance G)

Order, after the slice-2 preflight has pinned the endpoint:

1. **Mint the eval epoch**: `<unix-ms>-<128-bit CSPRNG hex>`. **Project name**: `tinyvault-<epoch short hash>`.
   Both are non-secret; both go into every service's labels via Compose interpolation
   (`com.tinyvault.epoch`, `com.tinyvault.project`, `com.tinyvault.fixture`).
2. **Pre-up absence**: `compose ps -aq` for the project (all states) must return **nothing**; any output is
   `project-not-fresh`. `compose up` reuses an existing container whose configuration is unchanged, so exact-one
   resolution alone cannot prove *this invocation* created the container — the absence check plus the
   `Created` bound in step 5 do.
3. `compose build` under that project → **record the built image id** (`image inspect` → `.Id`, `sha256:` + 64
   hex, strictly validated).
4. `compose up -d --wait --wait-timeout <N> --no-build`.
5. For each service, **resolve exactly one container**: `compose ps -q <service>` must return exactly one
   64-hex line. Zero, more than one, or anything not matching `^[0-9a-f]{64}$` is a hard failure
   (`resolution-count` / `resolution-shape`). This is also what makes `scale > 1` a rejection, not a guess.
6. `docker inspect <id>` (a one-element JSON array, parsed strictly) and verify **every** field below; each has its
   own closed code and its own deletion mutant (§11 G): `.State.Running === true` and `.State.Health.Status ===
   'healthy'` (`not-running` / `not-healthy`); `.Image` equals the recorded image id (`image-mismatch`);
   `.Created` ≥ the epoch's millisecond timestamp (`created-before-epoch`); labels `com.tinyvault.fixture`,
   `com.tinyvault.epoch`, `com.tinyvault.project` **and** the standard `com.docker.compose.project`,
   `com.docker.compose.service` equal the expected values (`label-mismatch`, one code per label);
   `.Config.Hostname` is a 12-hex prefix of the id (`hostname-mismatch`); `.Config.User === 'node'`;
   `.Config.Env` ⊆ the four `TV_*` keys plus the image's own `PATH`/`NODE_VERSION`/`YARN_VERSION` defaults
   (`env-unexpected`); `.Config.Cmd`/`.Config.Entrypoint` equal the image's (`command-overridden`);
   `.HostConfig.NetworkMode` is the project's default network (`network-mode`), `.HostConfig.Privileged ===
   false`, `PidMode`/`IpcMode` empty, `CapAdd`/`Devices`/`Binds` empty (`privilege-escalation`);
   `.Mounts` empty (`mount-present`); `.NetworkSettings.Networks` is exactly the project network
   (`network-membership`); `.NetworkSettings.Ports` publishes **exactly** the §2 table for that service and
   nothing else, all on `127.0.0.1` (`port-mismatch`). **This is the stale-container catch the MAC alone cannot
   provide.** The adversary cannot reach the daemon under the deployment requirement, so these checks are
   code-enforced hygiene for a trusted boundary — stated as such, not as isolation.
7. Only now: `docker exec -i <that exact id> node /app/bridge.mjs` (§4) — `-i` keeps stdin open, no `-t` so no
   TTY. (`-T` is a `docker compose exec` flag and Compose exec takes a *service selector*, which G forbids; do not
   "restore" it.) Never a service name, never a selector.

On **any** failure in 2–7, in the handshake (§5), or in the origin probe (§6), the harness runs `compose down --remove-orphans` for the
project and rethrows the **original** `ComposedConstructionError`; a teardown failure is recorded on the error as
`teardownCode`, never substituted for the cause. No transport is ever returned from a failed construction — **including a partial set** when a later service fails
after earlier ones established (earlier bridges are killed, exactly one `compose down` runs) — and the in-process
starter is never called from the composed path (slice-2 structural proof, retained). The no-fallback test is
**table-driven over every construction failure code** in this section, §5 and §6, so a fallback added for a new
class cannot hide.

---

## 4. The bridge: framing, correlation, and close rules (Acceptance I)

Two processes participate inside the container: the **fixture/control process** (`main.mjs`, holds runs,
receipts and the signing key, serves HTTP on the page ports, and listens on the control Unix socket) and the
**bridge process** (`bridge.mjs`, spawned by `docker exec -i <id>`, which connects to the socket and pipes
stdin→socket and socket→stdout byte-for-byte, writing diagnostics only to stderr, and exiting when either side
closes). The bridge process is the container's **only stdout writer**.

**Frame.** `u32be length` (1 ≤ length ≤ 262 144) followed by exactly `length` bytes that decode as UTF-8 with
`TextDecoder('utf-8', {fatal: true})` and parse as one JSON object with **exactly** the keys below in the **fixed
order shown**, no whitespace. The decoder requires `payload === JSON.stringify(parsed)` with the schema's key order
byte-for-byte — one check that rejects duplicate keys (which `JSON.parse` would silently collapse), extra
whitespace, non-canonical numbers and reordered keys. Value types are checked explicitly: `v === 1`; `id` a safe
non-negative integer (`Number.isSafeInteger`, not `2.0`/`1e0`); `kind`/`op` strings from closed sets; `ok` a
boolean; `body` a plain object (not `null`, not an array); `code` from the closed enum. Slice 4 inherits this
canonical form.

```
request  : {"v":1,"kind":"req","id":<uint ≥ 1>,"op":<string>,"body":<object>}
response : {"v":1,"kind":"res","id":<uint>,"op":<string>,"ok":true,"body":<object>}
         | {"v":1,"kind":"res","id":<uint>,"op":<string>,"ok":false,"code":<closed enum>}
```

Error codes are a closed enum; **no free text crosses the bridge in either direction** (the project's
closed-enum-errors rule, and Acceptance F's "bridge error text" surface is then structurally empty).

**Correlation.** Request ids are **strictly increasing from 1 for the bridge lifetime**. The host issues **at
most one outstanding request** (a per-bridge mutex; slice 3 needs no pipelining) **and records every response id
ever seen**, so the three wrong-response cases are distinct, non-overlapping branches with distinct codes:
no outstanding request → `unsolicited`; id already seen → `duplicate-id` (whether or not a request is outstanding);
id unseen but ≠ the outstanding id → `id-mismatch`. A correlated response is then checked for `kind === 'res'` and
`op === outstanding.op`. Slice 4 keeps the mutex or re-tests correlation as an id set; either way the seen-set stays.
The container likewise **serializes** request handling: an `inFlight` flag means a second request frame arriving
before the current response has been written (coalesced `bootstrap`+`hello` in one read) is `pipelined` and
closes the session.

**Close, never resynchronise.** Both ends close the bridge — the host kills the exec process and rejects the
outstanding operation with `bridge-closed`; the container closes the session — on any of: a frame length of 0 or
above the maximum; a payload failing the canonical-encoding or value-type rules above (including invalid UTF-8);
the three wrong-response cases (`unsolicited`, `duplicate-id`, `id-mismatch`); host side, **any frame whose
`kind !== 'res'`**; container side, **any frame whose `kind !== 'req'`**, a request id not strictly greater than the
previous one, an unknown `op`, or a `pipelined` request; a correctly-correlated response whose `op` does not
match; **the per-request timeout itself** (default 5 s, injected) — a timeout transitions the bridge to closed with
`bridge-timeout`, so a late response is simply bytes after close and the bridge never issues a request on a
channel whose state is unknown; EOF with a partial frame buffered; **any bytes on stdout that do not parse as a
frame** (a diagnostic on stdout therefore corrupts-and-closes rather than being skipped — note this shares a
branch with "oversized frame", since garbage decodes as a length; the register records it as one branch with two
inputs, not two independent reds). A bridge that has closed is dead: every later frame is rejected
`bridge-closed`, the transport is marked failed, the run fails, and there is **no reconnect and no in-process
downgrade**.

**One stdout writer, structurally.** The bridge process (`container/bridge.ts`) has exactly one stdout write path
— the socket→stdout pipe — and every diagnostic goes to stderr; a static scan (`scripts/compose-lint.mjs`'s
sibling rule set, self-tested) rejects any `console.log`/`process.stdout` reference in `container/bridge.ts`
other than the single pipe site, and the pipe logic is unit-tested with fake streams. The fixture/control process
(`main.mjs`) never writes to stdout either; its stdout is `docker logs`, which is an Acceptance E surface (§11),
not a bridge surface.

**Session rule.** The control server accepts **one** bridge connection for the container's lifetime; a second
connection attempt is refused and logged to stderr. Slice 3's session state machine: `awaiting-bootstrap` →
`awaiting-hello` → `established`, with `inFlight` while a response is pending. Any op out of order, and any
unknown op in any state, is `protocol-order` / `unknown-op` and **closes** the session (a closed code, then close —
slice 4 inherits "unknown op closes").

---

## 5. Trust anchor: bootstrap over stdin, challenge, injective MAC (Acceptance E, G)

Two operations exist in slice 3, and they are the only two the container will answer:

| Op | Request id | Body | Response |
|---|---|---|---|
| `bootstrap` | must be 1 | `{secret: base64url(32 CSPRNG bytes)}` | `ok:true, body:{}` |
| `hello` | must be 2 | `{challenge: base64url(32 CSPRNG bytes), epoch, fixtureId, containerId}` | `ok:true, body:{publicKey: base64url(DER SPKI), mac: base64url(32 bytes)}` |

**Bootstrap.** The secret is minted per eval **and per fixture** in harness memory (a `Buffer`, never placed in
`process.env`, never interpolated into a string other than the one `bootstrap` payload), sent as the first frame
over the already-open exec bridge's stdin, and held by the control process in memory only. Both sides check that
`secret` and `challenge` decode to **exactly 32 bytes**. It is **never** placed in
Compose environment, labels, `command`/`args`, image layers, files, logs, stderr diagnostics, artifacts, or error
text — and the closed-enum error rule makes the last one structural. A second `bootstrap` is `protocol-order`.

**The transcript** (exact bytes; both sides build it with the same shared function):

```
P  = ASCII "tinyvault/m5.2/bridge-hello/v1"
T  = P || F(challenge) || F(epoch) || F(fixtureId) || F(containerId) || F(publicKeyDer)
F(x) = u32be(len(x)) || x           (challenge: 32 raw bytes; epoch/fixtureId/containerId: UTF-8; key: DER)
mac = HMAC-SHA256(bootstrapSecret, T)
```

Fixed protocol prefix, fixed field order, byte-length framing on every field, one encoding per field — the
injectivity Acceptance G requires, and the reason a "concatenate five values" implementation fails the
tuple-confusion mutant (§9).

**Container-side refusals (refuse-only, like the prefix check).** The control process rejects a `hello` whose
`epoch` or `fixtureId` differ from its own `TV_EVAL_EPOCH` / `TV_FIXTURE_ID` (`hello-mismatch`), and whose
`containerId` does not have its hostname as a prefix.

**Verification, host side.** The announced `publicKey` must import as an Ed25519 SPKI
(`asymmetricKeyType === 'ed25519'`, `key-shape` otherwise) before anything else. Recompute `T` from the harness's *own* expected values (its challenge, its epoch,
the fixture it started, the **container id it resolved in §3 step 4**, and the key the peer announced) and
compare MACs in constant time. A valid announcement without a valid MAC is `mac-invalid`, a hard failure, never a
retry against whatever answered. A MAC from an earlier eval or container instance fails on the fresh challenge and
epoch by construction, and that is tested, not assumed.

**What the container id binding is, and is not.** The container process does not have an independent source of
its own full 64-hex id, so the id in the transcript is the one the harness supplies in `hello`. The control
process cross-checks that its hostname (Docker's default: the 12-character short id) is a **prefix** of the
supplied id and rejects otherwise — a check that can only refuse, never authenticate. The binding's job is to make
each transcript **unique to one resolved container**, alongside the epoch and the fresh challenge; **provenance
comes from §3, and the MAC proves possession of the delivered secret and binds session and key to that
already-established container. It does not establish provenance, and no comment, test name or claim may say
otherwise** (spec §D2.1, verbatim intent).

**The public key is not secret.** Its visibility anywhere is not a failure; what the slice proves is that it is
authenticated by this binding. (Page content's inability to invoke key retrieval is Acceptance M, slice 4.)

---

## 6. The composed `FixtureTransport` in slice 3, and the runner wiring

`startComposedFixtures(captureDirectory, pin)` (`runner.ts:303-312`, today a throw) becomes the real
constructor. It returns a `FixtureSet` of three composed transports or throws a `ComposedConstructionError`;
it never returns a partial set, and it never calls an in-process starter.

Per composed transport:

- `origin` — the public origin from §2; `architecture: 'composed'`.
- `reachability` — **probed, not self-labelled**: one `GET ${origin}/` after the handshake must answer; failure
  is `origin-unreachable` and construction fails. The prober is **injected** (`probeOrigin` seam): the Docker-free
  unit suite uses deterministic fakes for both the reachable positive control and the unreachable negative, so no
  loopback dial enters `make test` or the Codex sandbox; the real `fetch` runs only in `composed.docker.test.ts`.
  The value `'no-socket'` is **unreachable from the composed constructor** (there is no code path that produces
  it), and the container entry cannot produce it either — see B4 in §10.
- `verificationPublicKey` — the key authenticated by the §5 handshake, wrapped in `CompletionVerifier`, so
  `verifyCompletion` works exactly as in-process.
- `getLoginPage`, `submitLogin` — data-plane HTTP to the public origin, as the in-process `http` mode already does
  (`loginFixture.ts:142-167`).
- `registerRun`, `takeReceipt`, `attestEvents`, `captureRequests`, `unauthorizedRequests` — **fail closed** with
  `ComposedNotImplementedError('slice-4')`. Stated in code with the slice reference, mirroring slice 2.
- `close()` — close the bridge (kill the exec process; the host zeroes its secret `Buffer` — the JSON string copy
  used for the single `bootstrap` payload lives until GC, and the test claims exactly what it inspects), then
  `compose down --remove-orphans` for the project.
  Closing one transport tears down the whole project, so `FixtureSet.close` semantics are "first close wins,
  later closes are no-ops"; the set is closed by the runner's existing `closeFixtures`.

Runner ordering is unchanged from slice 2: preflight → pin → (artifact deletion, Chromium) → composed construction
inside `captureWithBrowser`. The only slice-3 change in `runner.ts` is the body of `startComposedFixtures`
delegating to `testbed/docker/composedFixtures.ts`, plus the injected `DockerProcessRunner` seam so Node-only tests
never spawn.

---

## 7. `exec.ts`: the closed vocabulary gets its first executable variants (slice 2 §4, R2-4)

`DockerCommand` (today `never`) becomes a discriminated union whose argv is **built inside the module**:

| Variant | argv (after the fixed `docker`) | Boundary |
|---|---|---|
| `compose-ps-all` | `compose --env-file /dev/null -f <file> -p <project> ps -aq` | stdout must be empty (§3 step 2) |
| `compose-build` | `compose --env-file /dev/null -f <file> -p <project> build` | run to completion |
| `compose-up` | `compose --env-file /dev/null -f <file> -p <project> up -d --wait --wait-timeout <N> --no-build` | run to completion; `<N>` a module constant |
| `compose-ps` | `compose --env-file /dev/null -f <file> -p <project> ps -q <service>` | stdout parsed: exactly one 64-hex line |
| `compose-down` | `compose --env-file /dev/null -f <file> -p <project> down --remove-orphans` | run to completion |
| `image-inspect` | `image inspect tinyvault-fixture-<project>:latest --format {{.Id}}` | stdout parsed: `sha256:` + 64 hex |
| `inspect` | `inspect <64-hex id>` | stdout parsed as a one-element JSON array, strictly (§3 step 6) |
| `logs` | `logs <64-hex id>` | stdout+stderr returned for the Acceptance E scan |
| `export` | `export <64-hex id>` | **streamed** tar of the container filesystem, scanned on the host (E) |
| `exec-bridge` | `exec -i <64-hex id> node /app/bridge.mjs` | **long-lived**: returns stdio streams |

`--env-file /dev/null` disables Compose's implicit `testbed/docker/.env` interpolation source, so the only
interpolation inputs are the allowlisted child-environment keys below; the lint additionally asserts no `.env`
exists beside the Compose file.

Rules: `<file>` is the module constant path of the Compose file; `<project>` and `<service>` are validated against
`^[a-z0-9][a-z0-9-]{0,62}$`; ids against `^[0-9a-f]{64}$` at the type **and** runtime; the exec command is the
fixed constant `node /app/bridge.mjs` and is never caller-supplied. The child environment is built as in slice 2
(`DOCKER_HOST` from the pin; `DOCKER_CONTEXT`/`DOCKER_CONFIG` removed) plus an **allowlisted** Compose
interpolation set: `TV_EVAL_EPOCH`, `TV_PROJECT`. **No other key is ever added**, and the bootstrap secret is
minted by a different module that has no access to this environment builder (Acceptance E's static half, tested
by scanning every spawn description in §9).

**Injected process boundary.** All variants run through one `DockerProcessRunner` interface (`run(spawn) →
{stdout, stderr, exitCode}` and `spawnLongLived(spawn) → {stdin, stdout, stderr, kill, exited}`), the sole
production implementation of which lives in `exec.ts` and is the repo's **only** `child_process` import outside
the interceptor and self-tests. Unit tests inject fakes; the Docker-required suite (§9) uses the real one.

**R2-4, gated — not recorded as equivalent.** Slice 2 deferred the endpoint-argv mutant until an executable
variant existed; slice 3 has them. Deleting the assertion against the *pristine* vocabulary is equivalent, but the
mutant that matters is **a production argv builder mutated to emit `--host <x>` or `-H`** — that must be rejected
by the assertion **before** `DockerProcessRunner` is reached. This is a code mutation applied in the integrator's
mutation pass (the project's standard practice), recorded in the register with the variant mutated and the
observed red; the unit suite additionally pins each variant's exact argv so a builder change is visible. The
strict hex validation of daemon-returned values remains the reason no *input* can reach a global-flag slot.

---

## 8. The static Compose lint (Acceptance C, static half)

**Decision L1 — the Compose file is JSON** (`testbed/docker/compose.json`, passed with `-f`). JSON is valid YAML
to Compose, and it lets the lint parse the file with `JSON.parse` — no YAML dependency on the `make test` path, no
parser divergence between what the lint reads and what Compose reads.

**Decision L2 — the lint is a closed schema, not a blocklist.** `JSON.parse` removes YAML syntax divergence but not
Compose *semantics*: `include`, service `extends`, `profiles`, anchors-by-reference and unknown keys can all pull in
definitions the file does not visibly contain. So the lint rejects **every key not in an explicit allowlist at
every level** — top level (`services` only; no `include`, `volumes`, `networks`, `secrets`, `configs`, `name`),
service level (`image`, `build` [one service only], `ports`, `environment`, `labels`, `healthcheck`, `user`,
`read_only`, `init`), and inside each of those. `extends`, `profiles`, `network_mode`, `hostname`,
`container_name`, `domainname`, `command`, `entrypoint`, `env_file`, `volumes`, `privileged`, `pid`, `ipc`,
`cap_add`, `devices`, `security_opt`, `deploy`, `scale`, `build.args` are therefore rejected by construction, and
each also gets a **named** rule so its self-test mutant asserts the rule's code, not merely "red".

`scripts/check-compose.mjs` (wired into `package.json` `test` next to the other gates) enforces, with
`scripts/compose-lint.selftest.mjs` proving **one mutant per rule, asserting that rule's code**:

- `network_mode` present at all (host networking, or any other mode);
- `privileged`, `pid`, `ipc`, `cap_add`, `devices`, `security_opt` present;
- **any** `volumes` key (this is how a bind mount of the control socket or of the Docker socket would appear —
  the rule bans the whole class, not two spellings), and any top-level `volumes`;
- a `ports` entry that is not the exact `127.0.0.1:<host>:<container>` triple from §2 for that service; any
  published port not in the §2 table; any service missing a port from the table; any ports on another service;
- an `environment` key outside `{TV_FIXTURE_ID, TV_EVAL_EPOCH, TV_PUBLIC_ORIGIN, TV_LOOKALIKE_PUBLIC_ORIGIN}`, or
  any `env_file`, `secrets`, `configs`, `command`, `entrypoint` override;
- a service set other than exactly the three in §2, or an `image`/`build` not pointing at the one Dockerfile;
- missing `healthcheck`; missing labels; `deploy.replicas` or `scale` present.

- `healthcheck` present with pinned `interval`/`timeout`/`retries`/`start_period`; the required labels present;
  exactly one service with `build` pointing at the one Dockerfile and all three sharing the one `image` name;
  no `.env` file beside the Compose file.

The self-test is **table-driven**: for every rule, one mutated document that trips only that rule, asserting the
rule's code. The spec-named four (`network_mode: host`, an extra published port, a control-socket bind mount, a
Docker-socket bind mount) are in the table alongside `include`, `extends`, a §2 port on `0.0.0.0`, a fourth
service, an unknown environment key, a dropped healthcheck, `build.args`, `hostname`, and every other named rule.
A rule with no mutant in the table fails the self-test itself (the table is checked against the rule list).

---

## 9. `make test` stays Docker-free — and the eval-time interceptor exclusion is resolved (Acceptance N)

**Two Vitest configurations, one guard.**

- `vitest.config.ts` (the `make test` path and `npm run eval`) keeps the runtime interceptor
  (`testbed/docker/no-docker.setup.ts`) **unconditionally** and excludes **exactly one file by path**,
  `testbed/docker/composed.docker.test.ts` — not a glob, so a test cannot be hidden from `make test` by renaming.
  The in-process eval stays under the guard on purpose: it proves the in-process transport is Docker-free too.
- `vitest.docker.config.ts` registers **no** setup file and includes **exactly that one file**. It is run by
  `npm run test:docker` / `make test-docker`, **never** by `make test`, and it is the only way Docker-bound tests
  execute.
- **An external pre-Vitest gate** (`scripts/check-test-entry.mjs`, first in the `test` script, self-tested red)
  parses `package.json` and the `Makefile` and rejects: any `test` script token referencing
  `vitest.docker.config.ts` or `test:docker`; any Vitest invocation in `test` without the default config; any file
  in the tree matching `*.docker.test.ts` other than the single registered one; and a default config whose exclude
  list is not exactly that file or whose `setupFiles` lacks the guard. An in-band Vitest test cannot pin its own
  entry point — pointing the first Vitest invocation at the Docker config would stop that test from being
  discovered — so this gate is external and fail-closed. When slice 4 makes composed runs possible, the composed eval entry uses this configuration — so
  the exclusion is decided **now**, as a config boundary, rather than as an env-var branch inside the guard
  (which a test could influence and a reviewer would have to reason about).

**Declared, in the guard's header:** the interceptor covers Vitest runs under the default configuration; the
Docker configuration is the deliberate exception and is never on the `make test` path. This closes the slice-2
residual "interceptor registered for every Vitest run including `npm run eval`" by making the statement true
rather than by weakening the guard.

**Allowlist becomes per-capability.** Today `scripts/docker-invocation.mjs:9-25` exempts a whole file before
looking at its imports, so adding container modules to it would let them import `node:child_process` unseen — a
dormant conditional `spawn('docker')` in an allowed module would pass the static gate and never execute under the
runtime one. The allowlist becomes a **map from exact path to the exact capability set** it may import:
`testbed/docker/exec.ts` → `{child_process}` (the only such entry); `testbed/docker/container/main.ts`,
`control.ts` → `{net, http}`; `container/bridge.ts` → `{net}`; the existing entries keep only the capabilities they
use today (measured, then pinned). The self-test gains the mutant "a `net`-allowed container module imports
`child_process`" → red. The dependency-boundary gate is unaffected (all new code is `testbed/`).

**The three N gates remain three**: the runtime interceptor, the static allowlist, and the **literal clean clone**
(`git clone` → `npm ci` → `make browsers` → `make test`) at merge. Baseline to preserve: **1182 + 5 + 10, exit 0**
on `main` @ `8133495`, this host. The entry-point gate above is the config regression's red; a Docker-free unit
test additionally imports the two config objects and asserts their include/exclude/setupFiles values, as a second
signal.

---

## 10. Inherited residuals — resolved or carried, each in code

| Residual (slice 2) | Slice-3 disposition |
|---|---|
| **Eval-time interceptor exclusion** | **RESOLVED** by the configuration split in §9. |
| **B4 — deletion-isolated composed-EPERM proof** | **RESOLVED by its original shape** (revision 1 reframed it; round 1 showed the reframing was a re-labelling, because T1 runs the same `startLoginFixture` *inside the container*, and that code reaches `listen()` and converts EPERM to `'no-socket'` at `loginFixture.ts:114-128`). Mechanism: the substitution becomes an **in-process-transport-only** behaviour behind the T3 listen seam (`onListenPermissionError: 'substitute'` for the in-process default, `'fail'` for the container entry, which exits non-zero so the healthcheck never turns healthy and construction is red under `--wait-timeout`). Deletion-isolated test: the container entry's start function is unit-tested with an injected `listen` rejecting `{code:'EPERM'}` and must **throw**, never return a `'no-socket'` fixture; deleting the container-mode hard-failure branch turns it green-through-substitution and the assertion catches it. The host-side origin probe (§6) is retained as a *second*, different protection with its own two mutants: the probe replaced by a literal `'http'` (caught by the injected-unreachable negative), and any construction failure routed to the in-process starter (slice-2 structural tests). |
| **B5a — dead-listener socket** | **Closed via Acceptance A, integrator-verified** — not a slice-3 mechanism: the first Docker operation (`compose ps -aq`) fails and construction is red (unit: injected runner failure on the first command → `project-not-fresh`/`daemon-unreachable`; integrator: `DOCKER_HOST=unix:///tmp/stale.sock` pointing at a socket file with no listener). Nothing about liveness is claimed by the preflight. |
| **R2-4 — endpoint-selecting argv mutant** | **Gated by the production-builder mutation pass** (§7), recorded in the register with the mutated variant and the observed red. |
| **A2 (incl. U+FEFF) — `unix://` and edge U+FEFF rejected** | **Carried unchanged**; conveniences declined, not protections. |
| **Hygiene, not containment** (worker realms, `process.binding`) | **Carried unchanged**; the guard's header keeps saying so. |

---

## 11. Acceptance mapping — what this slice proves, and what it declares

**Honest narrowing.** The implementation-plan table says slice 3 gates C, E, G, I. **C's dynamic probe matrix,
E's `docker inspect` scan, and the end-to-end handshake are Docker-required and integrator-run** (§9); the
Docker-free unit suite proves the same properties against injected boundaries. Both halves are listed, and a
Codex "passed" never covers the Docker half (`AGENTS.md`, `.claude/memory/gotchas.md`).

### A — slice-3 subset (no silent fallback)

| Mutant | Red where |
|---|---|
| Project not fresh; image build failure; container creation failure; **unhealthy / never-healthy service under the finite `--wait-timeout`** | unit: injected runner exit ≠ 0 at each step → distinct code, `compose down` attempted, no transport; the `compose-up` argv test pins `--wait-timeout <N>` |
| Daemon killed after preflight, before creation | unit: injected runner ENOENT/ECONNREFUSED on the first command → `daemon-unreachable`; integrator: documented manual procedure |
| **Partial set** — the third service fails after two established | unit: fake construction fails at service index 2 → no set returned, both earlier bridges killed, exactly one `compose-down` spawn |
| Any inspect-verification failure (each §3 step 6 code) or `origin-unreachable` | unit: table-driven over **every** construction failure code — no transport, `startFixtures` spy never called, one `compose-down` |
| Exec failure | unit: `spawnLongLived` rejects / exits immediately → `exec-spawn` |
| Handshake failure; MAC failure; protocol error | unit: fake peer over `PassThrough` streams → `handshake-rejected` / `mac-invalid` / `bridge-protocol` |
| A fallback for **any** of the above | the same table-driven test — a fallback added for one class turns that class's row red |
| Slice-2 A items | retained tests, unchanged |

### C — page content cannot address the control transport

- **Static:** the lint in §8, with its eight self-test mutants.
- **Dynamic (integrator, Docker + Chromium):** from a page on the hostile origin (`dom-hidden-injection` and the
  lookalike origin), attempt `fetch`, form POST, `<img>`, `WebSocket` and a worker `fetch` against: every
  published port (POST to a `/control` path and a frame-shaped WebSocket upgrade), loopback ports 8080/8081 and
  the container-internal socket path as a URL, `[::1]`, `host.docker.internal`, the Docker bridge gateway, **each
  container's IP from `inspect` `.NetworkSettings.Networks`**, the service names, and a DNS-rebound name mapped to
  `127.0.0.1` via Chromium's `--host-resolver-rules`. **The evaluated-agent leg:** the frozen tool surface (J) has
  no network primitive other than supervised browser navigation, so the agent-side attempt is a supervised
  `browser_navigate` to each target through the real `SupervisedHost`, expected to fail identically. Evidence:
  every attempt errors or 404s, the container's stderr shows no second connection attempt, **and the control
  session's state machine never left `established`** (asserted via the bridge's own request counter). **Its
  mutant reaches the probe:** the Docker suite starts a second project from a **test-only Compose override** that
  publishes one extra port (bypassing the repo-file lint and the inspect verification, which target the real
  construction) and asserts the probe matrix detects the reachable extra port — so the dynamic test is proven
  able to see what it claims to see, not green because an earlier gate fired.

### E — the bootstrap secret is stdin-only

| Mutant | Red where |
|---|---|
| Secret in Compose environment / label / command / image | unit: every `DockerSpawn` produced during a fake construction is scanned for the secret bytes (args + env) → none; the Compose file bytes contain no interpolation of any secret-named variable; integrator: `docker inspect` (`Config.Env`, `Config.Labels`, `Config.Cmd`, `Args`) and `docker history` scanned for the secret |
| **Secret in a container file** | integrator: `export <id>` streamed and scanned for the secret bytes after the handshake |
| **Secret in the fixture process's Docker log** (stdout/stderr of `main.mjs`) | integrator: `logs <id>` scanned |
| **Secret in a host artifact** | unit + integrator: the artifact tree under the eval directory is scanned after construction |
| Secret in bridge error text / harness diagnostic | unit: bridge and constructor errors carry closed codes only; a test asserts `String(error)` and stderr capture exclude the secret |
| **Scanner blind (silent-green)** | each scan has a **planted-needle positive control**: a known non-secret marker that legitimately reaches that surface (`TV_FIXTURE_ID` in env/inspect, a fixed stderr banner in logs, a fixed marker file in the image for `export`, the epoch in artifacts) must be **found** by the same scanner, proving the scan reads the surface it claims to |
| Secret retained after bridge close | unit: the host holder zeroes its `Buffer` on close (the one JSON string copy is stated as GC-bound); the container holder is dropped with the session |

### G — authenticated, injective trust anchor with provenance first

| Mutant | Red where |
|---|---|
| Announcement without MAC / with wrong MAC | unit fake peer → `mac-invalid` |
| **Deletion of each of the five bound fields**, independently | unit: golden-vector test pins the exact MAC for a fixed secret and tuple; a peer built from a transcript function missing field *k* fails verification — five tests, one per field |
| Delimiter-free or ambiguous encoding | unit: two tuples with identical concatenation but different field splits (e.g. epoch/fixtureId boundary moved by one byte) produce different MACs |
| Replayed MAC from an earlier challenge / epoch / container | unit: a captured valid response replayed against a new challenge → `mac-invalid` |
| Service selector instead of resolved id | type + runtime: `exec-bridge` accepts only a 64-hex id; a unit test passes a service name and expects a throw before any spawn |
| Zero or two containers resolved | unit: injected `compose-ps` output of 0 / 2 lines → `resolution-count` |
| **Each §3 step 6 field**, independently | unit: table-driven — for every verified field, one injected `inspect` document wrong in only that field → that field's code; deleting any single check turns exactly its row green and is caught |
| **Pre-existing same-image, same-label container** (reuse, not creation) | unit: injected `compose-ps-all` output non-empty → `project-not-fresh`; injected `.Created` earlier than the epoch → `created-before-epoch`; integrator: pre-create a container under the same project name **from the same image with matching labels** → red at the absence check |
| Bridge death | unit: peer closes mid-request → outstanding op rejected `bridge-closed`, no reconnect attempted (spy on `spawnLongLived` call count) |

### I — framing cannot be desynchronised or confused

Each close condition in §4 is one unit test over `PassThrough` streams, red when its branch is deleted, and the
branches are **non-overlapping by construction** (distinct codes): `unsolicited` (response with nothing
outstanding); `duplicate-id` (a seen id, tested both with and without an outstanding request); `id-mismatch`
(unseen, ≠ outstanding); non-increasing request id and `pipelined` (container state machine, in isolation); wrong
`op` on a correlated response; wrong `kind` on each side; `bridge-timeout` (and that a frame after it is
`bridge-closed`); oversized frame / non-frame bytes (one branch, two inputs, recorded as such); zero-length frame;
duplicate JSON keys, reordered keys, `id: 2.0`, `body: null`, invalid UTF-8 (each caught by the canonical-encoding
or type rules); malformed frame followed by valid bytes (the resynchronising-parser mutant: the valid frame must
**not** be processed); EOF with a partial frame; unknown `op`. The bridge process's one-writer property is
**structural and statically gated** (§4): the self-test mutant adds a second `process.stdout.write` site to
`container/bridge.ts` and the scan goes red; a dormant second write site therefore cannot survive by not executing.
The Docker suite additionally asserts the bridge stream contains exactly the expected frames.

### N — Docker-free `make test`, clean-clone green

The three gates of §9, plus the config-boundary unit test. Verified at merge by the literal clone.

### Declared for later slices

D, F (beyond E's surfaces), H, M → slice 4 with the control operations; L → slice 5; K, O, P → slice 6. The
`SCHEMA.md` deployment-requirement paragraph is untouched here.

### Absence-detection

Every mutant above is demonstrated **red-then-green** in the implementation report, never asserted. The M5.1
lesson stands: a test that passes because the code failed *earlier* is not shipped — it is declared (§10 B4 is
this rule applied to slice 2's own deferral).

---

## 12. Proposed file layout (files ≤ 400 lines, functions ≤ 50, ≤ 4 nesting levels)

| File | Purpose |
|---|---|
| `testbed/docker/Dockerfile`, **repo-root** `.dockerignore` | §2 T5 multi-stage image; the build context is the repo root, and Docker reads `.dockerignore` at the context root, so the ignore file lives there (`node_modules`, `artifacts`, `.git`, `.claude`, `docs`) |
| `testbed/docker/compose.json` | §2 topology, §8 lint target |
| `testbed/docker/frames.ts` (+ test) | §4 pure codec: encode, incremental decoder, exact-key validation |
| `testbed/docker/handshake.ts` (+ test) | §5 transcript builder, MAC, verifier; golden vectors |
| `testbed/docker/bridge.ts` (+ test) | host-side session: one outstanding request, correlation, close rules, secret zeroing |
| `testbed/docker/exec.ts` (+ test) | §7 variants, argv, env allowlist, `DockerProcessRunner` |
| `testbed/docker/compose.ts` (+ test) | §3 build/up/resolve/verify/down orchestration and `ComposedConstructionError` |
| `testbed/docker/composedFixtures.ts` (+ test) | §6 the composed `FixtureTransport` set, probe, fail-closed control ops |
| `testbed/docker/container/main.ts` | container entry: fixture by `TV_FIXTURE_ID`, control server, stderr-only diagnostics |
| `testbed/docker/container/control.ts` (+ test) | §4/§5 session state machine (stream-based, unit-testable without Docker) |
| `testbed/docker/container/bridge.ts` | the exec'd stdio↔socket pipe |
| `testbed/docker/composed.docker.test.ts` | the Docker-required suite (§11: E inspect scan, C probe matrix, bridge death, stale container, teardown) |
| `vitest.config.ts`, `vitest.docker.config.ts` | §9 split |
| `scripts/check-compose.mjs`, `scripts/compose-lint.mjs`, `scripts/compose-lint.selftest.mjs` | §8 closed-schema lint, table-driven self-test, bridge one-writer scan, no-`.env` check |
| `scripts/check-test-entry.mjs` (+ selftest) | §9 external entry-point gate |
| `scripts/docker-invocation.mjs` (+ selftest) | §9 per-capability allowlist map |
| `testbed/scenarios/benignLoginConstants.ts` (or equivalent leaf) | §2 T5 — `BENIGN_USERNAME`/`controlTokenFor` lifted so the fixture bundle carries no agent code |
| `testbed/fixtures/shared/loginFixture.ts`, `testbed/fixtures/lookalike-origin/index.ts` | §2 T3 listen/public-origin seam, in-process default unchanged |
| `testbed/runner.ts` | `startComposedFixtures` delegates; runner seam |
| `package.json`, `package-lock.json`, `Makefile` | esbuild devDependency (Job C owns the lockfile); `test:docker` / `test-docker`; entry gate + lint wired into `test` |

---

## 13. Implementation sequencing (Codex GPT-6 Astra, one worktree, sequential — the companion does not serialize writes)

1. **Job A — protocol core (Docker-free).** `frames.ts`, `handshake.ts`, host `bridge.ts`, container
   `control.ts` state machine, all unit tests for I and the G vectors. Contract = §4 and §5 of this plan, verbatim.
2. **Job B1 — executor and orchestration (Docker-free).** `exec.ts` variants and `DockerProcessRunner`,
   `compose.ts` (§3 chain, every code), `composedFixtures.ts` with the injected `probeOrigin`, runner wiring, the
   E spawn/artifact scanners with their positive controls. The table-driven A/G unit tests. All streams and
   probes injected — nothing in this job dials or spawns.
3. **Job B2 — gates and configuration (Docker-free).** The closed-schema lint + table-driven self-test + bridge
   one-writer scan; `scripts/check-test-entry.mjs` + self-test; the per-capability allowlist map + self-test
   mutant; the Vitest split and config test; `package.json` `test` wiring and `Makefile` targets (not the
   lockfile).
4. **Job C — container side and the Docker suite.** Dockerfile, repo-root `.dockerignore`, `compose.json`,
   `main.ts`, container `bridge.ts`, the loginFixture/lookalike listen seam with `onListenPermissionError`, the
   leaf-constants lift, esbuild devDependency + `package-lock.json`, `composed.docker.test.ts` (E inspect/logs/
   export/artifact scans with positive controls; C probe matrix with the override mutant; bridge death; same-image
   stale container; teardown). Codex cannot run Docker or Chromium; the integrator runs the Docker suite and
   budgets one fix cycle.

Integrator owns: commits (explicit paths), `make test` and `make test-docker` on every job, the clean clone, and
the register. Reviews (three channels: Codex adversarial on the diff, fresh-context QA with mutations,
`/security-review`) run after Job C on the full range, then the round cap and P1 criteria from
`.claude/memory/conventions.md` apply.

---

## 14. Carry into the post-implementation review — paper cannot settle these

1. Does the framing decoder really **close** on a malformed frame followed by valid bytes, or does a buffered
   valid frame get processed first?
2. Is the transcript builder shared by both sides **the same function**, or two implementations that agree today?
3. Does any `DockerSpawn` produced on the real construction path carry the secret — including via inherited
   `process.env` (the secret must never be placed in `process.env` at all)?
4. Does `docker inspect` on this host show exactly the §2 ports and an empty `Mounts`, and does the lint's model
   of the Compose file match what Compose actually creates (`compose config` as an integrator cross-check)?
5. Is `'no-socket'` genuinely unreachable from the composed constructor, or does a shared helper reintroduce it?
6. Does any comment, test name or error string in the slice imply daemon non-exposure or containment after
   fixture compromise? (`git diff main..HEAD | grep -Ei '^\+.*(daemon|expos|contain|isolat)'` as the first check.)
7. Does the host-side bridge zero the bootstrap secret `Buffer`, and does nothing retain a reference beyond the
   stated GC-bound string (the fake-peer test inspects the holder after close)?
8. Does `compose config` on this host agree with the lint's model of the file (integrator cross-check), and does
   the built image's `--metafile` module list contain no agent or harness code?
9. Does the production-builder `--host` mutation (R2-4) actually reach the assertion and fail before the runner?

## 15. Decisions the pre-implementation reviewer should attack first

T2 (fixed loopback ports over ephemeral), T5 (esbuild bundle over alternatives), L1+L2 (JSON Compose file with a
closed schema), the single-outstanding-request bridge with a lifetime seen-id set, the single-session control
server with serialized handling, the container-id binding semantics in §5, the per-capability allowlist map, the
external entry-point gate, and the B4 mechanism in §10. Each is a choice with a stated alternative; none is locked
by the spec. Round 2's job is the absorption sweep (every round-1 finding present, no new sibling defect) and a
bypass hunt on the new mechanisms.
