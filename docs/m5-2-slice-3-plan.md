# M5.2 slice 3 — the container, the Compose file, and the framed `docker exec -T` bridge

**Revision 1** — pre-implementation draft for the Codex plan-review ladder. Base: `main` @ `b90d849`. Branch:
`codex/m5-2-slice-3`. Spec: `docs/m5-2-slice-spec.md` revision 4 (LOCKED, `60520d9`) §D2, §D2.1, §D5, §D7
(hygiene only), and the parts of §D3 the bridge must carry. Acceptance gated here: **C** (lint + probe matrix),
**E**, **G**, **I**, plus the slice-3 subset of **A** and the standing **N**. Inherits six declared residuals from
slice 2 (§10).

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
3. The long-lived **`docker exec -T` bridge** to the internal socket, with length-prefixed framing, request ids,
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
*Why a bundler:* the repo's TypeScript is extensionless-import ESM under `moduleResolution: Bundler` with no
`"type": "module"` — plain Node cannot execute it, `tsc` cannot emit runnable ESM from it without rewriting every
import, and CJS emission fails on `import.meta.url` (`lookalike-origin/index.ts:43`). esbuild is the boring,
auditable way to get one file per entry. Alternatives considered and rejected: `tsx` inside the runtime image (a
runtime dependency and a second TypeScript toolchain in the security fixture); publishing a prebuilt image (M10,
and it breaks "provenance from harness-controlled creation").

**Readiness.** Each service declares a Compose `healthcheck` (a `node -e` probe of its own HTTP port and the
control socket's existence); the harness runs `compose up -d --wait`, so "container is up" means healthy, and the
bridge connects **once**. A connect retry loop before the handshake is *not* used — a readiness race would be
indistinguishable from a rebinding retry, which §D2.1 forbids.

---

## 3. Harness-controlled creation and the provenance chain (§D2.1 step 1–2, Acceptance G)

Order, after the slice-2 preflight has pinned the endpoint:

1. **Mint the eval epoch**: `<unix-ms>-<128-bit CSPRNG hex>`. **Project name**: `tinyvault-<epoch short hash>`.
   Both are non-secret; both go into every service's labels via Compose interpolation
   (`com.tinyvault.epoch`, `com.tinyvault.project`, `com.tinyvault.fixture`).
2. `compose build` under that project → **record the built image id** (`docker image inspect
   <project>-fixture:latest` → `.Id`, `sha256:` + 64 hex, strictly validated).
3. `compose up -d --wait --no-build`.
4. For each service, **resolve exactly one container**: `compose ps -q <service>` must return exactly one
   64-hex id. Zero, more than one, or anything not matching `^[0-9a-f]{64}$` is a hard failure
   (`resolution-count` / `resolution-shape`). This is also what makes `scale > 1` a rejection, not a guess.
5. `docker inspect <id>` and verify, strictly: `.State.Running === true`; `.Image` equals the recorded image id;
   labels `com.tinyvault.fixture`, `com.tinyvault.epoch`, `com.tinyvault.project` equal the expected values;
   `.HostConfig.NetworkMode !== 'host'`; `.Mounts` is empty; `.NetworkSettings.Ports` publishes **exactly** the
   table in §2 for that service and nothing else, all on `127.0.0.1`. Any mismatch is `label-mismatch`,
   `image-mismatch`, `not-running`, `mount-present`, or `port-mismatch`. **This is the stale-container catch the
   MAC alone cannot provide** (G's "labels or image identity do not match" mutant).
6. Only now: `docker exec -T -i <that exact id> node /app/bridge.mjs` (§4). Never a service name, never a
   selector.

On **any** failure in 2–6, or in the handshake (§5), the harness runs `compose down --remove-orphans` for the
project and rethrows the **original** `ComposedConstructionError`; a teardown failure is recorded on the error as
`teardownCode`, never substituted for the cause. No transport is ever returned from a failed construction, and
the in-process starter is never called from the composed path (slice-2 structural proof, retained).

---

## 4. The bridge: framing, correlation, and close rules (Acceptance I)

Two processes participate inside the container: the **fixture/control process** (`main.mjs`, holds runs,
receipts and the signing key, serves HTTP on the page ports, and listens on the control Unix socket) and the
**bridge process** (`bridge.mjs`, spawned by `docker exec -T`, which connects to the socket and pipes
stdin→socket and socket→stdout byte-for-byte, writing diagnostics only to stderr, and exiting when either side
closes). The bridge process is the container's **only stdout writer**.

**Frame.** `u32be length` (1 ≤ length ≤ 262 144) followed by exactly `length` bytes of UTF-8 JSON encoding one
object with **exactly** the keys below (extra, missing or duplicate keys → malformed).

```
request  : {"v":1,"kind":"req","id":<uint ≥ 1>,"op":<string>,"body":<object>}
response : {"v":1,"kind":"res","id":<uint>,"op":<string>,"ok":true,"body":<object>}
         | {"v":1,"kind":"res","id":<uint>,"op":<string>,"ok":false,"code":<closed enum>}
```

Error codes are a closed enum; **no free text crosses the bridge in either direction** (the project's
closed-enum-errors rule, and Acceptance F's "bridge error text" surface is then structurally empty).

**Correlation.** Request ids are **strictly increasing from 1 for the bridge lifetime**. The host issues **at
most one outstanding request** (a per-bridge mutex; slice 3 needs no pipelining), so a response is matched
against the single outstanding `(id, op)` and nothing else.

**Close, never resynchronise.** Both ends close the bridge — the host kills the exec process and rejects the
outstanding operation with `bridge-closed`; the container closes the session — on any of: a frame length of 0 or
above the maximum; a payload that is not exactly one JSON object with exactly the permitted keys; an unsolicited
response (no outstanding request); a duplicate response id; a request id not strictly greater than the previous
one (container side); a correctly-correlated response whose `op` or `kind` does not match the outstanding
request; a response arriving after the per-request timeout (default 5 s, injected) has already rejected the
request; EOF with a partial frame buffered; **any bytes on stdout that do not parse as a frame** (a diagnostic on
stdout therefore corrupts-and-closes rather than being skipped). A bridge that has closed is dead: the transport
is marked failed, the run fails, and there is **no reconnect and no in-process downgrade**.

**Session rule.** The control server accepts **one** bridge connection for the container's lifetime; a second
connection attempt is refused and logged to stderr. Slice 3's session state machine: `awaiting-bootstrap` →
`awaiting-hello` → `established`. Any op out of order is `protocol-order` and closes the session.

---

## 5. Trust anchor: bootstrap over stdin, challenge, injective MAC (Acceptance E, G)

Two operations exist in slice 3, and they are the only two the container will answer:

| Op | Request id | Body | Response |
|---|---|---|---|
| `bootstrap` | must be 1 | `{secret: base64url(32 CSPRNG bytes)}` | `ok:true, body:{}` |
| `hello` | must be 2 | `{challenge: base64url(32 CSPRNG bytes), epoch, fixtureId, containerId}` | `ok:true, body:{publicKey: base64url(DER SPKI), mac: base64url(32 bytes)}` |

**Bootstrap.** The secret is minted per eval **and per fixture** in harness memory, sent as the first frame over
the already-open exec bridge's stdin, and held by the control process in memory only. It is **never** placed in
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

**Verification, host side.** Recompute `T` from the harness's *own* expected values (its challenge, its epoch,
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
  is `origin-unreachable` and construction fails. The value `'no-socket'` is **unreachable from the composed
  constructor** (there is no code path that produces it) — see B4 in §10.
- `verificationPublicKey` — the key authenticated by the §5 handshake, wrapped in `CompletionVerifier`, so
  `verifyCompletion` works exactly as in-process.
- `getLoginPage`, `submitLogin` — data-plane HTTP to the public origin, as the in-process `http` mode already does
  (`loginFixture.ts:142-167`).
- `registerRun`, `takeReceipt`, `attestEvents`, `captureRequests`, `unauthorizedRequests` — **fail closed** with
  `ComposedNotImplementedError('slice-4')`. Stated in code with the slice reference, mirroring slice 2.
- `close()` — close the bridge (kill the exec process), then `compose down --remove-orphans` for the project.
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
| `compose-build` | `compose -f <file> -p <project> build` | run to completion |
| `compose-up` | `compose -f <file> -p <project> up -d --wait --no-build` | run to completion |
| `compose-ps` | `compose -f <file> -p <project> ps -q <service>` | stdout parsed: exactly one 64-hex line |
| `compose-down` | `compose -f <file> -p <project> down --remove-orphans` | run to completion |
| `image-inspect` | `image inspect <project>-fixture:latest --format {{.Id}}` | stdout parsed: `sha256:` + 64 hex |
| `inspect` | `inspect <64-hex id>` | stdout parsed as JSON, strictly (§3 step 5) |
| `exec-bridge` | `exec -T -i <64-hex id> node /app/bridge.mjs` | **long-lived**: returns stdio streams |

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

**R2-4, dispositioned.** With argv constructed from a closed vocabulary, no variant can emit `-H`, `--host`, `-c`
or `--context` in a global-flag position, and daemon-returned values (ids, image ids) are validated to hex before
they can occupy an argument slot at all. Deleting the slice-2 endpoint-token assertion therefore changes no
production-path result: the mutant is **equivalent**, and per `.claude/memory/conventions.md` an equivalent mutant
is recorded as such, not as a gap. The assertion stays as defence in depth. The *live* protections are the strict
output validation and the vocabulary itself, each with its own red (§9).

---

## 8. The static Compose lint (Acceptance C, static half)

**Decision L1 — the Compose file is JSON** (`testbed/docker/compose.json`, passed with `-f`). JSON is valid YAML
to Compose, and it lets the lint parse the file with `JSON.parse` — no YAML dependency on the `make test` path, no
parser divergence between what the lint reads and what Compose reads.

`scripts/check-compose.mjs` (wired into `package.json` `test` next to the other gates, with
`scripts/check-compose.selftest.mjs` proving each rule red on a mutated fixture) rejects, for **every** service:

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

The self-test mutants are: add `network_mode: host`; publish an extra port; publish a §2 port on `0.0.0.0`;
add a bind mount of `/var/run/docker.sock`; add a bind mount of the control socket path; add a fourth service;
add an unknown environment key; drop a healthcheck. Each independently red.

---

## 9. `make test` stays Docker-free — and the eval-time interceptor exclusion is resolved (Acceptance N)

**Two Vitest configurations, one guard.**

- `vitest.config.ts` (the `make test` path and `npm run eval`) keeps the runtime interceptor
  (`testbed/docker/no-docker.setup.ts`) **unconditionally** and adds `exclude: ['**/*.docker.test.ts']` to the
  defaults. The in-process eval stays under the guard on purpose: it proves the in-process transport is
  Docker-free too.
- `vitest.docker.config.ts` registers **no** setup file and includes only `testbed/**/*.docker.test.ts`. It is run
  by `npm run test:docker` / `make test-docker`, **never** by `make test`, and it is the only way Docker-bound
  tests execute. When slice 4 makes composed runs possible, the composed eval entry uses this configuration — so
  the exclusion is decided **now**, as a config boundary, rather than as an env-var branch inside the guard
  (which a test could influence and a reviewer would have to reason about).

**Declared, in the guard's header:** the interceptor covers Vitest runs under the default configuration; the
Docker configuration is the deliberate exception and is never on the `make test` path. This closes the slice-2
residual "interceptor registered for every Vitest run including `npm run eval`" by making the statement true
rather than by weakening the guard.

**Allowlists.** `scripts/docker-invocation.mjs` gains exact paths for the container-side modules that import
`node:net`/`node:http` (`testbed/docker/container/*.ts`) and for the Docker-required test file; `exec.ts` remains
the only `child_process` site. The dependency-boundary gate is unaffected (all new code is `testbed/`).

**The three N gates remain three**: the runtime interceptor, the static allowlist, and the **literal clean clone**
(`git clone` → `npm ci` → `make browsers` → `make test`) at merge. Baseline to preserve: **1182 + 5 + 10, exit 0**
on `main` @ `8133495`, this host. A Docker-free unit test additionally asserts that the default Vitest
configuration excludes `*.docker.test.ts` and registers the guard, so a config regression is a red, not a review
note.

---

## 10. Inherited residuals — resolved or carried, each in code

| Residual (slice 2) | Slice-3 disposition |
|---|---|
| **Eval-time interceptor exclusion** | **RESOLVED** by the configuration split in §9. |
| **B4 — deletion-isolated composed-EPERM proof** | **RESOLVED, reframed honestly.** In composed mode the harness never binds a fixture server, so `listen()` and the EPERM substitution (`loginFixture.ts:114-128`) are not on the path — the deletion-isolated *EPERM* test slice 2 imagined cannot exist because there is no EPERM branch to delete. What B4 actually protects against is a composed transport that **self-labels** its reachability. So: `reachability` is probe-derived (§6), the `'no-socket'` literal does not occur in the composed constructor, and two mutants are red: (a) replace the probe with the literal `'http'` → the unit test with an unreachable fake origin goes green-for-the-wrong-reason and is caught by the negative test that expects `origin-unreachable`; (b) route any construction failure to the in-process starter → the slice-2 structural tests stay red. Recorded in the register as B4 **closed with a narrowed statement**, not as the original test. |
| **B5a — dead-listener socket** | **RESOLVED in the sense slice 2 predicted:** the first Docker operation (`compose build`) fails and construction is red under Acceptance A (unit: injected runner exit ≠ 0 → `image-build`; integrator: `DOCKER_HOST=unix:///tmp/stale.sock` pointing at a socket file with no listener). Nothing about liveness is claimed by the preflight. |
| **R2-4 — endpoint-selecting argv mutant** | **Equivalent mutant, recorded** (§7). |
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
| Image build failure; container creation failure; `--wait` timeout | unit: injected runner exit ≠ 0 at each step → distinct code, `compose down` attempted, no transport |
| Daemon killed after preflight, before creation | unit: injected runner ENOENT/ECONNREFUSED on the first command → `image-build`; integrator: documented manual procedure |
| Exec failure | unit: `spawnLongLived` rejects / exits immediately → `exec-spawn` |
| Handshake failure; MAC failure; protocol error | unit: fake peer over `PassThrough` streams → `handshake-rejected` / `mac-invalid` / `bridge-protocol` |
| A fallback for **any** of the above | unit: composed constructor never invokes `startFixtures` (spy), never returns a transport on failure |
| Slice-2 A items | retained tests, unchanged |

### C — page content cannot address the control transport

- **Static:** the lint in §8, with its eight self-test mutants.
- **Dynamic (integrator, Docker + Chromium):** from a page on the hostile origin (`dom-hidden-injection` and the
  lookalike origin), attempt `fetch`, form POST, `<img>`, `WebSocket` and a worker `fetch` against: every
  published port (POST to a `/control` path and a frame-shaped WebSocket upgrade), loopback ports 8080/8081 and
  the container-internal socket path as a URL, `[::1]`, `host.docker.internal`, the Docker bridge gateway, the
  service names, and a DNS-rebound name mapped to `127.0.0.1` via Chromium's `--host-resolver-rules`. Expected:
  every attempt errors or 404s, and **no control-session event** occurs in the container (stderr shows no second
  connection attempt). Its mutant is a Compose file publishing an extra port, which the lint catches first and the
  probe catches second.

### E — the bootstrap secret is stdin-only

| Mutant | Red where |
|---|---|
| Secret in Compose environment / label / command / image | unit: every `DockerSpawn` produced during a fake construction is scanned for the secret bytes (args + env) → none; the Compose file bytes contain no interpolation of any secret-named variable; integrator: `docker inspect` (`Config.Env`, `Config.Labels`, `Config.Cmd`, `Args`) and `docker history` scanned for the secret |
| Secret in a log line / diagnostic / error text | unit: bridge and constructor errors carry closed codes only; a test asserts `String(error)` and stderr capture exclude the secret; the container's stderr output is captured in the Docker suite and scanned |
| Secret retained after bridge close | unit: the host holder zeroes its buffer on close; the container holder is dropped with the session |

### G — authenticated, injective trust anchor with provenance first

| Mutant | Red where |
|---|---|
| Announcement without MAC / with wrong MAC | unit fake peer → `mac-invalid` |
| **Deletion of each of the five bound fields**, independently | unit: golden-vector test pins the exact MAC for a fixed secret and tuple; a peer built from a transcript function missing field *k* fails verification — five tests, one per field |
| Delimiter-free or ambiguous encoding | unit: two tuples with identical concatenation but different field splits (e.g. epoch/fixtureId boundary moved by one byte) produce different MACs |
| Replayed MAC from an earlier challenge / epoch / container | unit: a captured valid response replayed against a new challenge → `mac-invalid` |
| Service selector instead of resolved id | type + runtime: `exec-bridge` accepts only a 64-hex id; a unit test passes a service name and expects a throw before any spawn |
| Zero or two containers resolved | unit: injected `compose-ps` output of 0 / 2 lines → `resolution-count` |
| Labels or image identity mismatch | unit: injected `inspect` JSON with a wrong epoch label / wrong `.Image` → `label-mismatch` / `image-mismatch`; integrator: pre-create a container with matching labels from a different image under the same project name → red |
| Bridge death | unit: peer closes mid-request → outstanding op rejected `bridge-closed`, no reconnect attempted (spy on `spawnLongLived` call count) |

### I — framing cannot be desynchronised or confused

Each of the eleven close conditions in §4 is one unit test over `PassThrough` streams, red when its branch is
deleted: unsolicited response; duplicate response id; reused (non-increasing) request id (container-side state
machine, tested in isolation); wrong `op` on a correlated response; wrong `kind`; late response after timeout;
oversized frame; zero-length frame; malformed frame followed by valid bytes (the resynchronising-parser mutant:
the valid frame must **not** be processed); EOF with a partial frame; non-frame bytes on stdout. The
container-side "one writer" property is structural (the bridge process is the only stdout writer, and
`main.mjs` never writes to stdout) and is asserted in the Docker suite by scanning the bridge stream for exactly
the expected frames.

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
| `testbed/docker/Dockerfile`, `testbed/docker/.dockerignore` | §2 T5 multi-stage image; ignores `node_modules`, `artifacts`, `.git` |
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
| `scripts/check-compose.mjs`, `scripts/compose-lint.mjs`, `scripts/compose-lint.selftest.mjs` | §8 |
| `scripts/docker-invocation.mjs` | allowlist additions |
| `testbed/fixtures/shared/loginFixture.ts`, `testbed/fixtures/lookalike-origin/index.ts` | §2 T3 listen/public-origin seam, in-process default unchanged |
| `testbed/runner.ts` | `startComposedFixtures` delegates; runner seam |
| `package.json`, `Makefile` | esbuild devDependency; `test:docker` / `test-docker`; lint wired into `test` |

---

## 13. Implementation sequencing (Codex GPT-6 Astra, one worktree, sequential — the companion does not serialize writes)

1. **Job A — protocol core (Docker-free).** `frames.ts`, `handshake.ts`, host `bridge.ts`, container
   `control.ts` state machine, all unit tests for I and the G vectors. Contract = §4 and §5 of this plan, verbatim.
2. **Job B — harness orchestration and gates (Docker-free).** `exec.ts` variants and runner, `compose.ts`,
   `composedFixtures.ts`, runner wiring, the lint + self-test, the Vitest split and its config test, allowlists,
   `package.json`/`Makefile`. All A/E/G-resolution unit tests.
3. **Job C — container side and the Docker suite.** Dockerfile, `.dockerignore`, `compose.json`, `main.ts`,
   container `bridge.ts`, the loginFixture/lookalike listen seam, esbuild devDependency, `composed.docker.test.ts`.
   Codex cannot run Docker or Chromium; the integrator runs the Docker suite and budgets one fix cycle.

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
7. Does the host-side bridge zero the bootstrap secret, and does nothing retain a reference (the fake-peer test
   inspects the holder after close)?

## 15. Decisions the pre-implementation reviewer should attack first

T2 (fixed loopback ports over ephemeral), T5 (esbuild bundle over alternatives), L1 (JSON Compose file), the
single-outstanding-request bridge, the single-session control server, the container-id binding semantics in §5,
and the B4 reframing in §10. Each is a choice with a stated alternative; none is locked by the spec.
