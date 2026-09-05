# M5.2 slice 3 — the container, the Compose file, and the framed `docker exec` bridge

> The spec calls this "the `docker exec -T` bridge"; the plain `docker exec` CLI has no `-T` (that flag belongs to `docker compose exec`, which takes a service selector), so the argv is `docker exec -i <id>` — see §3 step 7.

**Revision 4 — LOCKED for implementation** (continuity-owner adjudication, 2026-09-05; the paper cap of three
rounds is spent). Absorbs all three pre-implementation rounds (`docs/m5-2-slice-3-review-findings.md`: C-U1 Codex
Sol **STOP** 10×P1; C-U1b Claude 7×P2; C-U2 Codex **STOP** 8×P1; C-U2b Claude 1×P1; C-U3 Codex **STOP** 10×P1;
C-U3b Claude 1×P1). Base: `main` @ `933d7b4`. Branch:
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

> **What changed from revision 2 — and the claim that was narrowed.** Round 2 beat every *static source scan*
> revision 2 had introduced (the per-capability allowlist, the one-writer scan, the entry-point token gate), each
> by the C-S1 route: a spelling the scan does not know (`.cjs`, an aliased `node:process` import, `/usr/bin/env
> docker`, `&& exit 0;`). That is two rounds on the same invariant class, so revision 3 **narrows the claim**
> (`.claude/memory/conventions.md`) instead of adding a fourth scan: static gates are **defence in depth with
> stated limits**, runtime tripwires are the primary guard where one exists, and the two things that actually pin
> `make test` are an **exact grammar for the `test` script and the Makefile target** plus an **execution proof**
> (a machine-readable reporter file whose inventory must equal the discovered test set with zero skipped) — §9.
> Also absorbed: canonical-encoding equality is now a rebuild-in-schema-order comparison, since
> `JSON.stringify(JSON.parse(x))` preserves insertion order (U2-1); correlation uses an ordered high-water-mark
> classification, not an unbounded seen-set, with the check order stated (U2-10, U2b-P2-4); the one-writer
> property is a **runtime tripwire** on `process.stdout.write` plus a narrowed import allowlist, with fd-level
> writes declared outside it (U2-4); the B4 injection is a real `Error` with `code:'EPERM'`, the substitution lives
> at one shared bind site, and the lookalike's second binder is recorded as an equivalent mutant (U2-5, U2b-P3-11);
> Acceptance E scans the exec process's real stderr, every surface has its own marker, needles are planted in the
> encodings a leak would take (raw, base64url, hex, decimal array) and checked with the existing leak decoders,
> `docker history --no-trunc` is scanned, and the scan window runs **after** bridge close with a shutdown sentinel
> (U2-6, U2-7, U2b-P2-1/2); the lint pins the **values** of allowed keys and every `${…}` interpolation, the
> Compose child environment is built from an allowlist rather than pass-through, and `--progress quiet --ansi
> never` are fixed argv (U2-9, U2b-P2-3); a Dockerfile lint joins the Compose lint (U2b-P3-1); operation bodies
> are closed schemas, `containerId` is 64-hex, base64url values must round-trip, and the SPKI must re-export
> byte-identically (U2-12); every spawned handle is registered before use and killed on any failure, and `compose
> down` is **not** run when the pre-up absence check fails (U2-11); §3 step 6 is one field→predicate→code→mutant
> table (U2-13); the eight drift items both channels listed are fixed.

> **What changed from revision 3 — the lock, and the second narrowing.** Round 3 attacked the narrowed §9 claim and
> found that the **entry-point files are themselves executable**: a Vitest `globalSetup` runs outside the setup-file
> interceptor and can spawn without an import the capability map sees; a Makefile `$(shell …)` runs at parse time
> before any recipe. No in-repo gate can guard the files that define the gates. So revision 4 states Acceptance N's
> claim as what a repository can honestly enforce: **the gates catch Docker reach from code modules** (imports, test
> files, spawn sites, plain-`node` gate scripts) **reachable from `make test`; the entry-point files —
> `package.json` scripts, `Makefile`, the two Vitest configs, and the gate scripts — are the reviewed root of trust,
> hash-pinned in-suite so any edit is a visible red in the same diff.** A hostile edit of the root of trust is
> outside the locked threat model (page content and the evaluated model do not edit the repository) and is declared,
> not chased. Also absorbed (U3/U3b): plain-`node` steps of `test` run outside the interceptor, so exactly one
> `scripts/` file may import `child_process` and its one spawn site is allowlisted to `process.execPath`; the
> execution proof produces **one report per Vitest invocation** and asserts a disjoint union; the E scanner is
> **byte-native** with contiguous-hex, Node `Buffer`-inspect, decimal-array and base64url forms and is proven with the
> **real secret bytes** in each form, not markers alone; teardown is **stop → scan → down** with a bounded stop, so
> the shutdown banner and shutdown-only leaks are inside the window; the artifact walker has its own nested marker
> and traversal mutants; correlation uses a **completed high-water mark** so an idle duplicate is `duplicate-id` and
> ids start at 1; `project-not-fresh` asserts **zero** teardown calls; the vocabulary gains `compose-stop`, typed
> `inspect`, full-JSON `image-inspect`, and every `run()` is bounded; `${TV_EVAL_EPOCH}` is permitted at its exact
> `environment` and `labels` positions; the image name is fixed (`tinyvault-fixture:local`, no `--rmi`, no
> `${TV_PROJECT}`); `read_only` and `EXPOSE` are dropped (a read-only rootfs cannot host the socket or the capture
> directory; unpublished `EXPOSE` ports appear as `null` in inspect); the stdout tripwire's claim is sized to the
> methods it patches (`write`, `end`, `console.*`) with prototype dispatch and `net.Socket({fd:1})` declared outside
> it; close is atomic (outstanding rejected with the cause, waiters drained `bridge-closed`, decoder stopped);
> `exitCode = 1` on any container start failure; the skip exception is pinned by test name; `exclude` is pinned by
> value including Vitest's defaults; the eight drift items are fixed. Carried by name into the implementation review:
> §14 items 10–16.

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
origin.** `startLoginFixture` gains an injected listen spec `{host, port, publicOrigin, onListenPermissionError:
'substitute' | 'fail'}`; the in-process default stays `127.0.0.1:0`, bound address as origin, `'substitute'`
(`loginFixture.ts:114-128`, `:470-478`), so in-process behaviour is byte-identical. **Both** servers — the login
fixture and the lookalike's second server (`lookalike-origin/index.ts:140-148`) — bind through **one shared
`bindServer` helper** that owns the EPERM branch, so the substitution exists at exactly one site (§10 B4).

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

**Readiness.** Each service declares a Compose `healthcheck` (a `node -e` probe of its own HTTP port — accepting any 2xx or 3xx, because the lookalike's canonical `/` is a
302 to the lookalike origin — and the control socket's existence) with pinned `interval`, `timeout`, `retries` and `start_period`, and the harness runs
`compose up -d --wait --wait-timeout <N>` with a **finite** constant timeout, so "container is up" means healthy
and an unhealthy or never-healthy service is a loud `container-unhealthy` red rather than a hang. The bridge then
connects **once**. A bounded pre-handshake connect retry against the same immutable id would *not* be the
rebinding §D2.1 forbids (revision 1 said otherwise; that was wrong) — one connect is chosen as the simpler,
fail-fast design, and the healthcheck's socket-existence probe is what makes it safe.

**Image naming.** Exactly one service (`benign-login`) carries `build`; the other two reference the same fixed
`image: tinyvault-fixture:local` without `build`, so Compose builds once and the harness has one image id to
verify. The name is a constant — a per-project tag would either leak one image per eval or force `--rmi` and a
rebuild every run; identity is established by the recorded image id (§3), not by the tag. The lint encodes this
exact shape. The container's rootfs is **not** `read_only` (the control socket and the capture directory live on it
and `tmpfs` would add a mount the step-6 table must see as empty), and the Dockerfile has **no `EXPOSE`** —
publishing does not need it, and an unpublished exposed port shows as a `null` entry in inspect.

---

## 3. Harness-controlled creation and the provenance chain (§D2.1 step 1–2, Acceptance G)

Order, after the slice-2 preflight has pinned the endpoint:

1. **Mint the eval epoch**: `<unix-ms>-<128-bit CSPRNG hex>`. **Project name**: `tinyvault-<epoch short hash>`.
   Both are non-secret; both go into every service's labels via Compose interpolation
   (`com.tinyvault.epoch`, `com.tinyvault.fixture`; the project name is carried by Compose's own
   `com.docker.compose.project` label, which is verified — a custom project label would need `${TV_PROJECT}`
   interpolation, which §8 forbids; integrator amendment 2026-09-05 after Job B2 stopped on the contradiction).
2. **Pre-up absence**: `compose ps -aq` for the project (all states) must return **nothing**; any output is
   `project-not-fresh`. `compose up` reuses an existing container whose configuration is unchanged, so exact-one
   resolution alone cannot prove *this invocation* created the container — the absence check plus the
   `Created` bound in the step-6 table do.
3. `compose build` under that project → **record the built image id** (`image inspect` → `.Id`, `sha256:` + 64
   hex, strictly validated).
4. `compose up -d --wait --wait-timeout <N> --no-build`.
5. For each service, **resolve exactly one container**: `compose ps -q <service>` must return exactly one
   64-hex line. Zero, more than one, or anything not matching `^[0-9a-f]{64}$` is a hard failure
   (`resolution-count` / `resolution-shape`). This is also what makes `scale > 1` a rejection, not a guess.
6. `docker inspect --type container <id>` (a one-element JSON array, parsed strictly) and verify **every** row of
   the table below. The verifier **exports its field list**, and the unit test table is asserted equal to it, so a
   field added to code without a test row fails the suite (the same rule-list equality the lint uses).

   | Field | Predicate | Code | Deletion mutant (injected `inspect` wrong in only this field) |
   |---|---|---|---|
   | `.State.Running` | `=== true` | `not-running` | stopped container |
   | `.State.Health.Status` | `=== 'healthy'` | `not-healthy` | `starting` |
   | `.Image` | equals the recorded image id | `image-mismatch` | other `sha256:` |
   | `.Created` | ≥ epoch ms − tolerance (60 s; the daemon VM clock can drift) | `created-before-epoch` | one hour earlier |
   | `.Config.Labels['com.tinyvault.fixture']` | equals the service's fixture id | `label-fixture` | other fixture |
   | `.Config.Labels['com.tinyvault.epoch']` | equals the epoch | `label-epoch` | other epoch |
   | `.Config.Labels['com.docker.compose.project']` | equals the project | `label-compose-project` | other |
   | `.Config.Labels['com.docker.compose.service']` | equals the service | `label-compose-service` | other |
   | `.Config.Hostname` | 12-hex, prefix of the id | `hostname-mismatch` | unrelated hostname |
   | `.Config.User` | `=== 'node'` | `user-mismatch` | `'0'` |
   | `.Config.Env` | ⊆ `{TV_FIXTURE_ID, TV_EVAL_EPOCH, TV_PUBLIC_ORIGIN, TV_LOOKALIKE_PUBLIC_ORIGIN}` ∪ the image's own `PATH`/`NODE_VERSION`/`YARN_VERSION`, by key | `env-unexpected` | extra key |
   | `.Config.Cmd`, `.Config.Entrypoint` | equal the image's (`image inspect`) | `command-overridden` | other cmd |
   | `.HostConfig.NetworkMode` | equals the project default network | `network-mode` | `host` |
   | `.HostConfig.Privileged` | `=== false` | `privileged` | `true` |
   | `.HostConfig.PidMode` | empty | `namespace-shared` | `host` |
   | `.HostConfig.IpcMode` | `''` or `'private'` — Docker normalizes an unspecified IPC mode to the daemon default, `private` (integrator amendment 2026-09-05, Job C stop #2); `host`, `shareable` and `container:<id>` are rejected | `namespace-shared` | `host` |
   | `.HostConfig.CapAdd`, `.Devices`, `.Binds` | empty | `capability-added` / `device-added` / `bind-present` | one entry |
   | `.Mounts` | empty | `mount-present` | one mount |
   | `.NetworkSettings.Networks` | exactly the project network | `network-membership` | second network |
   | `.NetworkSettings.Ports` | exactly the §2 table for that service, all `127.0.0.1`, **no other key at all** (the Dockerfile has no `EXPOSE`, so no `null` entries exist) | `port-mismatch` | extra / `0.0.0.0` / a `null` entry |

   **This is the stale-container catch the MAC alone cannot provide.** The adversary cannot reach the daemon under
   the deployment requirement, so these checks are code-enforced hygiene for a trusted boundary — stated as such,
   not as isolation. The `Created` bound is belt-and-braces beside the fresh 128-bit project name, hence its
   tolerance.
7. Only now: `docker exec -i <that exact id> node /app/bridge.mjs` (§4) — `-i` keeps stdin open, no `-t` so no
   TTY. (`-T` is a `docker compose exec` flag and Compose exec takes a *service selector*, which G forbids; do not
   "restore" it.) Never a service name, never a selector.

**Handle registry and one project closer.** Every process handle — long-lived **and** short-lived — is
**registered the moment it is spawned**, and every `run()` is bounded by a module-constant timeout (`command-timeout`
with the variant named) so a hanging `build` or `up` cannot leak a CLI process. One **idempotent project closer**
owns teardown for the whole `FixtureSet`; every transport's `close()` and every construction failure delegate to it.
Its order is fixed: (1) SIGKILL every registered handle, bounded wait; (2) `compose stop` (bounded) so the
fixtures receive SIGTERM and write their shutdown banners; (3) the Acceptance E scans (§11) while the stopped
containers still exist; (4) `compose down --remove-orphans` (bounded). On **any** failure in 3–7, in the handshake
(§5), or in the origin probe (§6) the closer runs and the harness rethrows the **original**
`ComposedConstructionError`; a teardown failure is recorded on the error as
`teardownCode`, never substituted for the cause. **Exception:** when the **pre-up absence check** (step 2) fails, nothing is torn down — the test asserts **zero**
teardown calls for this case — the project was not proven
harness-created, so `compose down` would act on state that is not ours; the run fails `project-not-fresh` and
reports the project name. No transport is ever returned from a failed construction — **including a partial set**
when a later service fails after earlier ones established, **and including the bridge spawned for the very service
whose handshake or probe fails** (the registry, not "earlier bridges", is what gets killed; exactly one `compose
down` runs) — and the in-process
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
order shown**, no whitespace. The decoder **rebuilds a fresh object in the schema's fixed key order from the parsed fields** and requires
`payload === JSON.stringify(rebuilt)` byte-for-byte — one check that rejects duplicate keys (which `JSON.parse`
silently collapses), extra whitespace, non-canonical numbers **and reordered keys**. (`JSON.stringify(JSON.parse(x))`
alone would *not* catch reordering, because parsing preserves insertion order — the round-2 P1.) Every base64url
value must **round-trip** (`Buffer.from(v,'base64url').toString('base64url') === v`) to its declared byte length,
and every operation `body` is itself a **closed schema** with exact keys and types (§5). Value types are checked explicitly: `v === 1`; `id` a safe
non-negative integer (`Number.isSafeInteger`, not `2.0`/`1e0`); `kind`/`op` strings from closed sets; `ok` a
boolean; `body` a plain object (not `null`, not an array); `code` from the closed enum. Slice 4 inherits this
canonical form.

```
request  : {"v":1,"kind":"req","id":<uint ≥ 1>,"op":<string>,"body":<object>}
response : {"v":1,"kind":"res","id":<uint>,"op":<string>,"ok":true,"body":<object>}
         | {"v":1,"kind":"res","id":<uint>,"op":<string>,"ok":false,"code":<closed enum>}
```

Error codes are a closed enum; **no free text crosses the bridge in either direction** (the project's
closed-enum-errors rule), so the bridge error-text surface Acceptance E scans is structurally empty for the two
operations this slice defines.

**The full check order for an inbound frame** (both sides, in this sequence, each step with its own code): length
bounds → fatal UTF-8 → canonical-encoding equality → value types → `kind` (host: must be `res`; container: must be
`req`) → correlation (below) → `op` match → body schema. Every test input for a later step is well-formed for all
earlier steps, so no test passes by tripping an earlier check.

**Correlation.** Request ids are **strictly increasing from 1 for the bridge lifetime** (`id ≥ 1` is a schema rule;
`0` is a type error), so they are contiguous and two integers replace any seen-set: `completedHighWater` (the
largest id whose response has been accepted) and the single `outstanding` request, if any. The host issues **at
most one outstanding request** (a per-bridge mutex; slice 3 needs no pipelining). A response is classified in this
**fixed order**, each branch with a distinct code and a test input that satisfies **only** that branch:
1. `id ≤ completedHighWater` → `duplicate-id` — **whether or not a request is outstanding**, so an idle late
   duplicate is a duplicate, not "unsolicited";
2. nothing outstanding → `unsolicited` (a never-issued id while idle);
3. `id > outstanding.id` → `id-mismatch` (a not-yet-issued id);
4. `id === outstanding.id` → correlated; then `op === outstanding.op` or `op-mismatch`.
The tests assert the **code**, not just closure, and one test swaps steps 1 and 2 to prove the assertions
distinguish them. Slice 4 keeps the mutex or re-derives correlation from the same two integers.
The container likewise **serializes** request handling: an `inFlight` flag means a second request frame arriving
before the current response has been written (coalesced `bootstrap`+`hello` in one read) is `pipelined` and
closes the session.

**Close, never resynchronise.** Both ends close the bridge — the host kills the exec process and rejects the
outstanding operation with the **closing condition's own code** (`bridge-timeout` for a timeout, otherwise the
protocol code; every *later* call is `bridge-closed`); the container closes the session — on any of: a frame length of 0 or
above the maximum; a payload failing the canonical-encoding or value-type rules above (including invalid UTF-8);
the four wrong-response cases (`unsolicited`, `duplicate-id`, `id-mismatch`, `op-mismatch`); host side, **any frame whose
`kind !== 'res'`**; container side, **any frame whose `kind !== 'req'`**, a request id not strictly greater than the
previous one, an unknown `op`, or a `pipelined` request; a correctly-correlated response whose `op` does not
match; **the per-request timeout itself** (default 5 s, injected) — a timeout transitions the bridge to closed with
`bridge-timeout`, so a late response is simply bytes after close and the bridge never issues a request on a
channel whose state is unknown; EOF with a partial frame buffered; **any bytes on stdout that do not parse as a
frame** (a diagnostic on stdout therefore corrupts-and-closes rather than being skipped — note this shares a
branch with "oversized frame", since garbage decodes as a length; the register records it as one branch with two
inputs, not two independent reds). **Close is atomic**: the bridge marks itself closed, rejects the outstanding operation with the closing code,
drains every queued mutex waiter with `bridge-closed`, stops the decoder so no already-buffered frame is
dispatched, and kills the exec process — in that order, synchronously. A bridge that has closed is dead: every later
call is rejected `bridge-closed`, the transport is marked failed, the run fails, and there is **no reconnect and no
in-process downgrade**. A test times out a request while a second call is queued and asserts the second rejects
`bridge-closed`.

**One stdout writer — a runtime tripwire whose claim is sized to its mechanism.** The bridge process
(`container/bridge.ts`) takes a **bound reference** to the original `process.stdout.write` at startup, replaces the
**instance methods** `process.stdout.write` and `process.stdout.end` and every `console.*` method with a function
that writes a closed diagnostic to stderr and **exits non-zero**, and forwards socket bytes through the bound
reference only — it does **not** `pipe()` into stdout (pipe calls `dest.write` and would trip itself). Any writer
that goes through those instance methods — named, aliased, destructured from `node:process`, or via `console` —
hits the tripwire the moment it executes, dormant or not; the unit test installs the tripwire against fake streams
and asserts that a second writer terminates the process. **Stated limits, declared in the module header:**
prototype-dispatched calls (`Writable.prototype.write.call(process.stdout, …)`, `_write`), `net.Socket({fd: 1})`,
and raw-fd writes (`fs.writeSync(1, …)`) bypass instance patching; for those the only signal is the Docker suite's
exact-frames assertion on the executed path. The static side is narrow and honest about it: `container/bridge.ts`
may import **exactly** `node:net` and `node:process` (an exact import list). The Docker suite additionally asserts the bridge
stream contains exactly the expected frames. The fixture/control process (`main.mjs`) installs the same tripwire
for hygiene; its stdout is `docker logs`, an Acceptance E surface (§11), not a bridge surface.

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

**Bodies are closed schemas.** `bootstrap.body` has exactly `{secret}`; `hello.body` exactly `{challenge, epoch,
fixtureId, containerId}` with `containerId` matching `^[0-9a-f]{64}$`, `fixtureId` from the closed `FixtureId`
set, `epoch` matching its fixed shape; the response bodies exactly `{}` and `{publicKey, mac}`. An extra, missing
or mistyped field is `body-shape`. `secret`, `challenge` and `mac` must decode to **exactly 32 bytes**
(`secret-shape` / `challenge-shape` / `mac-shape` — the last also prevents `timingSafeEqual`'s length `RangeError`
from ever being the observable outcome).

**Container-side refusals (refuse-only, like the prefix check).** The control process rejects a `hello` whose
`epoch` or `fixtureId` differ from its own `TV_EVAL_EPOCH` / `TV_FIXTURE_ID` (`hello-mismatch`), and whose
`containerId` does not have its hostname as a prefix.

**Verification, host side.** The announced `publicKey` must import as an Ed25519 SPKI
(`asymmetricKeyType === 'ed25519'`) **and re-export to byte-identical DER** — Node accepts trailing garbage on DER
while still reporting the key type — else `key-shape`, before anything else. Recompute `T` from the harness's *own* expected values (its challenge, its epoch,
the fixture it started, the **container id it resolved in §3 step 5**, and the key the peer announced) and
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
- `close()` — delegates to the **shared project closer** (§3): kill every registered handle, `compose stop`, the E
  scans, `compose down`. The host zeroes its secret `Buffer` (the JSON string copy used for the single `bootstrap`
  payload lives until GC, and the test claims exactly what it inspects).
  Closing one transport closes the whole project through the idempotent closer — every bridge handle, not just its
  own — so later closes are no-ops; the set is closed by the runner's existing `closeFixtures`.

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
| `compose-stop` | `compose --env-file /dev/null -f <file> -p <project> stop --timeout <N>` | bounded; delivers SIGTERM so shutdown banners are written before the scans |
| `compose-down` | `compose --env-file /dev/null -f <file> -p <project> down --remove-orphans` | bounded run to completion |
| `image-inspect` | `image inspect tinyvault-fixture:local` | stdout parsed as a one-element JSON array: `.Id` (`sha256:` + 64 hex), `.Config.Cmd`, `.Config.Entrypoint`, `.Config.Env`, `.Config.Labels` for the step-6 comparisons and the E scan |
| `inspect` | `inspect --type container <64-hex id>` | stdout parsed as a one-element JSON array, strictly (§3 step 6) |
| `image-history` | `history --no-trunc --format {{json .}} <sha256:64-hex image id>` | one JSON object per line; `CreatedBy` scanned for the E `history` surface, with the Dockerfile `LABEL` as its marker. *Added at implementation (integrator amendment, 2026-09-05): §11 E required this scan but the table omitted the variant; Job B1 correctly stopped rather than widen the closed vocabulary itself.* |
| `logs` | `logs <64-hex id>` | stdout+stderr returned for the Acceptance E scan |
| `export` | `export <64-hex id>` | **streamed** tar of the container filesystem, scanned on the host (E) |
| `exec-bridge` | `exec -i <64-hex id> node /app/bridge.mjs` | **long-lived**: returns stdio streams |

Every `run()` variant is bounded by a module-constant timeout and registered with the closer (§3). Every `compose`
variant also carries the fixed `--progress quiet --ansi never`, so Compose status text can never
land on the stdout the harness parses. `--env-file /dev/null` disables Compose's implicit `testbed/docker/.env`
interpolation source (verified on this host to win over `COMPOSE_ENV_FILES`), **but Compose still interpolates from
the process environment** — revision 2 said otherwise and was wrong. Two things close that: the lint pins the
**exact set and positions** of `${…}` references in the file (§8), and the child environment is an **allowlist**,
not pass-through.

Rules: `<file>` is the module constant path of the Compose file; `<project>` and `<service>` are validated against
`^[a-z0-9][a-z0-9-]{0,62}$`; ids against `^[0-9a-f]{64}$` at the type **and** runtime; the exec command is the
fixed constant `node /app/bridge.mjs` and is never caller-supplied. The child environment is **built from an allowlist** — `PATH`, `HOME`, `TMPDIR`, `DOCKER_HOST` (from the pin),
`TV_EVAL_EPOCH` — and nothing else (`TV_PROJECT` is no longer interpolated; the project name travels only as `-p`): no `DOCKER_CONTEXT`, `DOCKER_CONFIG`, `COMPOSE_*`,
`DOCKER_BUILDKIT`, `DOCKER_DEFAULT_PLATFORM`. (Slice 2's builder copied `process.env` minus two keys,
`exec.ts:17-19`; this replaces it, and the slice-2 tests that pin `DOCKER_HOST`/absence of `DOCKER_CONTEXT` stay
green.) The bootstrap secret is minted by a different module that has no access to this environment builder
(Acceptance E's static half, tested by scanning every spawn description in §11).

**Injected process boundary.** All variants run through one `DockerProcessRunner` interface (`run(spawn) →
{stdout, stderr, exitCode}` and `spawnLongLived(spawn) → {stdin, stdout, stderr, kill, exited}`), the sole
production implementation of which lives in `exec.ts` — the only `child_process` import under `testbed/` and `src/`
outside the interceptor and self-tests. (`scripts/check-acceptance-j-results.mjs` also imports it to re-run
Vitest; §9 pins that one site.) Unit tests inject fakes; the Docker-required suite (§9) uses the real one.

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
`init`), and inside each of those. `extends`, `profiles`, `network_mode`, `hostname`,
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

- `healthcheck` present with pinned `interval`/`timeout`/`retries`/`start_period` **and the exact `test` command**;
  the required labels present **with pinned values**; exactly one service with `build` pointing at the one
  Dockerfile (`build` allows only `context` and `dockerfile`; `dockerfile_inline`, `args`, `network`, `privileged`,
  `secrets`, `ssh`, `additional_contexts` rejected) and all three sharing the one `image` name; no `.env` file
  beside the Compose file.
- **Values, not just keys**: `user === "node"`, `init === true`, `image === "tinyvault-fixture:local"`, environment
  values exactly the §2 constants per service, and **every `$` in the whole file accounted for**: the only permitted
  references are `${TV_EVAL_EPOCH}` at exactly `services.<name>.environment.TV_EVAL_EPOCH` and
  `services.<name>.labels["com.tinyvault.epoch"]` for each service; any other `$` (braced, braceless `$VAR`, or
  `$$`) in any string value is rejected (a `${HOME}` in a label value would otherwise be interpolated from the
  harness environment).
- **Every nested level** (`ports[]`, `healthcheck`, `build`, `labels`, `environment`) is closed, and the self-test
  table has at least one unknown-key mutant per level.

**The Dockerfile is linted too** (same script, same table discipline): `FROM node:24-slim` only; `USER node`;
**no `EXPOSE`** (§2); **no `VOLUME`** (a `VOLUME` produces a mount with no Compose `volumes` key); no `ENV TV_*`; no
`ARG`/`LABEL` carrying anything but the fixed planted-needle marker (§11 E). Mutants: add `VOLUME`, drop `USER`,
add `EXPOSE 8080`, add `ENV TV_BOOTSTRAP`.

The self-test is **table-driven**: for every rule, one mutated document that trips only that rule, asserting the
rule's code. The spec-named four (`network_mode: host`, an extra published port, a control-socket bind mount, a
Docker-socket bind mount) are in the table alongside `include`, `extends`, a §2 port on `0.0.0.0`, a fourth
service, an unknown environment key, a dropped healthcheck, `build.args`, `hostname`, and every other named rule.
A rule with no mutant in the table fails the self-test itself (the table is checked against the rule list).

---

## 9. `make test` stays Docker-free — and the eval-time interceptor exclusion is resolved (Acceptance N)

**The claim, stated as what a repository can enforce.** Three review rounds beat every static gate this plan
proposed, and round 3 showed why the sequence cannot end: the entry-point files are themselves executable (a Vitest
`globalSetup` runs outside the setup-file interceptor and `process.getBuiltinModule` needs no import; a Makefile
`$(shell …)` runs at parse time, before any recipe). No gate inside the repository can guard the files that define
the gates. So Acceptance N is claimed as: **the runtime interceptor, the capability map and the execution proof
catch Docker reach from code modules reachable from `make test` — source and test files, spawn sites, plain-`node`
gate scripts. The entry-point files are the reviewed root of trust: `package.json` (`scripts` block), `Makefile`,
`vitest.config.ts`, `vitest.docker.config.ts`, and every `scripts/check-*.mjs`. Their exact content is hash-pinned
by an in-suite test**, so an edit to any of them — a `globalSetup`, a `posttest`, a `$(shell …)`, a loosened
`exclude` — is a red in the same diff that made it, and the reviewer sees the pin move. A hostile edit of the root
of trust is outside the locked threat model (page content and the evaluated model do not edit the repository) and is
**declared**, in `no-docker.setup.ts`'s header and in the gate's header, not chased. No sentence in code or docs
may present any static gate as complete.

**Two Vitest configurations, one guard.**

- `vitest.config.ts` (the `make test` path and `npm run eval`) keeps the runtime interceptor
  (`testbed/docker/no-docker.setup.ts`) **unconditionally**, has **no** `include` (Vitest's default pattern
  `**/*.{test,spec}.?(c|m)[jt]s?(x)` applies), and its `exclude` is **by value** `[...configDefaults.exclude,
  'testbed/docker/composed.docker.test.ts']` — a bare array would replace the defaults and make `node_modules`
  discoverable. The in-process eval stays under the guard on purpose.
- `vitest.docker.config.ts` registers **no** setup file and includes **exactly that one file**. It is run by
  `npm run test:docker` / `make test-docker`, **never** by `make test`.

**The entry-point grammar gate** (`scripts/check-test-entry.mjs`, first in `test`, self-tested red per rule) requires
the entry points to **match an exact shape**, in addition to the hash pin above:
- `package.json` has **no** `pretest`/`posttest`; its `test` script, split on `&&` only, is **exactly** the expected
  ordered command list (this gate, the boundary gates, the lint, the three Vitest invocations with their exact
  `--exclude`/reporter tokens, the execution proof) — any `;`, `||`, `|`, `exit`, subshell, redirection, `--config`,
  `-c`, `--root`, `-r`, `--dir`, `--project` token, or extra command fails it; the expected list is one exported
  constant, and the existing in-suite pin (`testbed/runner.artifacts.test.ts:83-107`) is amended to assert
  equality with that same constant;
- the `Makefile` `test` target has **no prerequisites** and exactly one recipe line, `npm run test`; the whole
  Makefile is hash-pinned (parse-time execution cannot be gated from inside a recipe — declared);
- the repository contains **exactly two** Vitest/Vite config files by exact name, both hash-pinned; the default
  one has no `projects`/`workspace`/`root`/`dir`/`globalSetup`/`include`/`passWithNoTests`/`reporters`/
  `outputFile` key, `setupFiles` exactly the guard, `exclude` exactly the value above;
- the gate **deletes the reporter output paths** before Vitest runs, so a stale report cannot satisfy the proof.

**The execution proof** (last in `test`, `scripts/check-test-execution.mjs`, self-tested): each of the **three**
Vitest invocations writes its own JSON report (`--reporter=json --outputFile=<path>`; these tokens are part of the
pinned grammar), and the proof asserts (a) each report's file set is exactly its expected partition — main = every
file matching Vitest's default pattern under the repo minus the Docker file minus the two timing files; timing-1 =
its file; timing-2 = its file — computed from a **hard-coded** copy of the default pattern, not from the config;
(b) the partitions are disjoint and their union is the inventory; (c) every file has at least one test; (d) exactly
one test is skipped in the whole run, pinned by **full name** — the eval-gated one in `runner.eval.test.ts` —
so a Docker-free test hidden under its `describe.skipIf` is caught; (e) every report's mtime is later than the
gate's recorded start. A `test` script that exits early, a `describe.skip` around a file, or a test that vanished
into a config nobody runs is red. **Declared limit:** the proof pins files, not test names (the J gate does that for
its ten); a test removed from a file that keeps other tests moves inventory and report together. `test:docker` gets
the same proof with its own exact set (one file, zero skipped).

**Plain-`node` steps run outside the interceptor — declared and pinned.** The existing gate scripts and the three
new ones run under bare `node`, where the Vitest setup file is not loaded. So the capability map pins the **measured
set** of `scripts/` files that import `child_process` — `check-acceptance-j-results.mjs` (re-runs Vitest),
`dependency-boundary.selftest.mjs`, `dependency-boundary.selftest-fixtures.mjs` and `docker-invocation.selftest.mjs`
(each proves its gate red through the real CLI) — and **every spawn site in those files is allowlisted to a first
argument of the literal `process.execPath`** (a positive allowlist over reviewed call sites, the M4 rule form; a
self-test mutant changes one to `'docker'` and must go red). *Revision 4 said "exactly one"; Job B2 measured four.
Integrator amendment 2026-09-05.* The three new gate scripts have **no** `child_process`, `net` or `http` entry, so
the execution proof **reads** the reporter files rather than spawning Vitest. A
conditional `spawnSync('docker', …)` in any gate script is therefore caught by the map (no entry) or the call-site
pin (wrong first argument); a mutation of that one argument is the reviewed-root-of-trust residual.

**Declared, in the guard's header:** the interceptor covers Vitest runs under the default configuration; the Docker
configuration is the deliberate exception and is never on the `make test` path. The interceptor also gains the cheap
indirect-launch case — an executable named `env` is checked on its first non-option argument, and the existing
shell-form check stays — while **wrapper launchers in general (`xargs`, `nohup`, `script`, a user-written shim on
`PATH`) are declared outside it**, next to `worker_threads` and `process.binding`. Its self-test adds the `env
docker` mutant.

**The capability map, with its limit stated.** `scripts/docker-invocation.mjs` becomes a map from exact path to
the **exact import list** it may use (`testbed/docker/exec.ts` → `node:child_process` only; `container/main.ts`,
`control.ts` → `node:net`, `node:http`; `container/bridge.ts` → `node:net`, `node:process`;
`composed.docker.test.ts` → `node:child_process` for its override launch; `scripts/check-acceptance-j-results.mjs`
→ `node:child_process`; existing entries measured and pinned), scans **every Node-executable extension**
(`.ts .mts .cts .js .mjs .cjs`), adds `tls` and `http2` to the gated specifiers, and rejects any **computed**
`import()`/`require()` argument outright in gated directories rather than skipping it. Its header says what it
cannot do: follow a specifier built at runtime outside those directories, or see `process.getBuiltinModule`. The
self-test gains "a `net`-allowed container module imports `child_process`", "a `.cjs` test file imports
`child_process`", and "a second `scripts/` file imports `child_process`".

**Acceptance N now has six signals, none substituting for another**: the runtime interceptor, the capability map,
the root-of-trust hash pins, the entry-point grammar gate, the execution proof, and the **literal clean clone**
(`git clone` → `npm ci` → `make browsers` → `make test`) at merge. Baseline to preserve: **1182 + 5 + 10, exit 0**
on `main` @ `8133495`, this host (the count will grow; the execution proof asserts the inventory, never a number).

---

## 10. Inherited residuals — resolved or carried, each in code

| Residual (slice 2) | Slice-3 disposition |
|---|---|
| **Eval-time interceptor exclusion** | **RESOLVED** by the configuration split in §9. |
| **B4 — deletion-isolated composed-EPERM proof** | **RESOLVED by its original shape** (revision 1 reframed it; round 1 showed the reframing was a re-labelling, because T1 runs the same `startLoginFixture` *inside the container*, and that code reaches `listen()` and converts EPERM to `'no-socket'` at `loginFixture.ts:114-128`). Mechanism: the substitution becomes an **in-process-transport-only** behaviour behind the T3 listen seam (`onListenPermissionError: 'substitute'` for the in-process default, `'fail'` for the container entry, which sets `process.exitCode = 1` and exits so the outcome never depends on how Compose treats an exited-0 container; the healthcheck never turns healthy and construction is red under `--wait-timeout`). Deletion-isolated test: the container entry's start function is unit-tested with an injected `listen` rejecting **a real `Error` carrying `code:'EPERM'`** (`Object.assign(new Error('listen'), {code:'EPERM'})` — a plain object would be rejected by the `instanceof Error` predicate at `loginFixture.ts:487-493` before the branch is reached, making the test vacuous) and must **throw**, never return a `'no-socket'` fixture; a paired **positive** asserts the in-process default still substitutes under the same error; deleting the container-mode hard-failure branch turns the negative green-through-substitution and the assertion catches it. Because both servers bind through the one shared helper (T3), the lookalike's former second EPERM branch no longer exists; had it stayed, its deletion would have been an **equivalent mutant** (the canonical fixture's branch or the parity check at `lookalike-origin/index.ts:72-74` throws first) and would have been recorded as such. The host-side origin probe (§6) is retained as a *second*, different protection with its own two mutants: the probe replaced by a literal `'http'` (caught by the injected-unreachable negative), and any construction failure routed to the in-process starter (slice-2 structural tests). |
| **B5a — dead-listener socket** | **Closed via Acceptance A, integrator-verified** — not a slice-3 mechanism: the first Docker operation (`compose ps -aq`) fails and construction is red (unit: injected runner failure on the first command — exit ≠ 0 → `daemon-unreachable`; exit 0 with output →
`project-not-fresh`; integrator: `DOCKER_HOST=unix:///tmp/stale.sock` pointing at a socket file with no listener). Nothing about liveness is claimed by the preflight. |
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
| **Project not fresh** (pre-up `ps -aq` non-empty) | unit: → `project-not-fresh`, **zero** teardown calls (the project was not proven ours), no transport |
| Image build failure; container creation failure; **unhealthy / never-healthy service under the finite `--wait-timeout`**; any `run()` exceeding its bound | unit: injected runner exit ≠ 0 / hang at each step → distinct code (`image-build`, `container-create`, `container-unhealthy`, `command-timeout`), exactly one closer run, no transport; the `compose-up` argv test pins `--wait-timeout <N>` |
| Daemon killed after preflight, before creation | unit: injected runner ENOENT/ECONNREFUSED on the first command → `daemon-unreachable`; integrator: documented manual procedure |
| **Partial set** — the third service fails after two established | unit: fake construction fails at service index 2 → no set returned, both earlier bridges killed, exactly one `compose-down` spawn |
| Any inspect-verification failure (each §3 step 6 code) or `origin-unreachable` | unit: table-driven over **every** construction failure code — no transport, `startFixtures` spy never called, one `compose-down` |
| Exec failure | unit: `spawnLongLived` rejects / exits immediately → `exec-spawn` |
| Handshake failure; MAC failure; protocol error | unit: fake peer over `PassThrough` streams → `handshake-rejected` / `mac-invalid` / `bridge-protocol` |
| A fallback for **any** of the above | the same table-driven test — a fallback added for one class turns that class's row red |
| Slice-2 A items | retained tests, unchanged |

### C — page content cannot address the control transport

- **Static:** the Compose and Dockerfile lint in §8 — one self-test mutant per rule, the table asserted equal to
  the rule list in both directions (a missing or an extra rule id fails the self-test).
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
  mutant reaches the probe:** the Docker suite — which runs outside the interceptor and has its own capability-map
  entry — spawns `docker compose` **directly** with a test-only override file that publishes one extra host port
  mapped to container 8080 (so there is something reachable to detect; this bypasses the repo-file lint and the
  inspect verification, which target the real construction) and asserts the probe matrix detects it — so the dynamic test is proven
  able to see what it claims to see, not green because an earlier gate fired.

### E — the bootstrap secret is stdin-only

| Mutant | Red where |
|---|---|
| Secret in Compose environment / label / command / image | unit: every `DockerSpawn` produced during a fake construction is scanned (args + env); the Compose file's `${…}` set is pinned by the lint; integrator: `docker inspect` (`Config.Env`, `Config.Labels`, `Config.Cmd`, `Args`), `docker image inspect` (`Config.Env`, `Config.Labels`) and **`docker history --no-trunc --format '{{json .}}'`** (default output truncates `CreatedBy`) scanned |
| Secret in a container file | integrator: `export <id>` streamed and scanned **with overlap across chunk boundaries** (the overlap is proven in a unit test on a synthetic stream — a straddling marker cannot be placed deterministically in a real tar) |
| Secret in the fixture process's Docker log | integrator: `logs <id>` scanned |
| **Secret on the exec bridge process's stderr** (`bridge.mjs` — *not* covered by `docker logs`, which is PID 1 only) | integrator: the host consumes `spawnLongLived.stderr` (bounded ring buffer, so a chatty stderr can neither exhaust memory nor, undrained, deadlock the bridge into a timeout) and scans it |
| Secret in a host artifact | unit + integrator: the artifact tree scanned |
| Secret in bridge error text / harness diagnostic | unit: closed codes only; `String(error)` and captured stderr exclude the secret |
| **Encoding the scanner does not know** — `console.error(buffer)` leaks Node's `<Buffer 4a 5b …>` (space-separated hex pairs), `buffer.toString('hex')` leaks contiguous hex, `JSON.stringify(buffer)` leaks a decimal array, and the existing decoder inventory has **no hex form** | the E scanner is a **slice-3-local `secretScan`** (not a change to `leakDecoders.ts`, a security-core file with its own timing gate): byte-native match of the 32 raw bytes on binary surfaces read as latin1, plus contiguous hex, Node `Buffer`-inspect pairs, decimal array and base64url text forms. It is unit-tested with the **real secret bytes in every form** on synthetic surfaces (a mutant that drops any one form is red), and every surface's marker is planted in the forms the row names |
| **Scan window ends too early** — the likeliest leak sites are shutdown paths | the closer's order is **kill bridges → bounded `compose stop` (SIGTERM, shutdown banners written) → `logs` + `export` + exec-stderr + artifact scans → `compose down`**, and the artifact tree is scanned again after `close()` returns |
| **Scanner blind (silent-green)** — one control per surface, in the encodings a leak would take | each independently scanned surface has **its own** planted, non-secret marker that legitimately reaches only that surface, and the same scanner must **find** it: `Config.Env` (`TV_FIXTURE_ID`), `Config.Labels` (the epoch), `Cmd`/`Args` (a fixed argv marker), `history` (a fixed Dockerfile `LABEL`), `export` (a fixed marker file **written at the end of the image**, and one straddling the scan chunk size), `logs` (a boot banner **and a SIGTERM shutdown banner**, both on **stderr** since `main.mjs` carries the stdout tripwire; `docker logs` carries both streams, so truncation after boot is caught), exec stderr (a fixed bridge start line), artifacts (a **dedicated marker file in a nested directory written last by `close()`**, plus **traversal mutants**: a walker that reads only the manifest, skips a subdirectory, or stops at the first file is red), image `Config.Env` (the image's own `NODE_VERSION` key) and `Config.Labels` (the Dockerfile `LABEL`). Two markers are planted as **`util.inspect(buffer)` output and `JSON.stringify(buffer)` output** — the exact forms the leak would take — to prove the decoders, not just the surfaces, are wired |
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
branches are **non-overlapping by construction** (distinct codes): `duplicate-id` (id ≤ `completedHighWater`, tested **both idle and with a request outstanding**); `unsolicited`
(idle, never-issued id); `id-mismatch` (id above the outstanding one); `op-mismatch`; `id: 0` and `id: 2.0` as type
errors; the **order test** that swaps steps 1 and 2 of the §4 classification and must fail its code assertions; the
queued-second-call-after-timeout test (`bridge-closed`); non-increasing request id and `pipelined` (container state machine, in isolation); wrong
`op` on a correlated response; wrong `kind` on each side; `bridge-timeout` (and that a frame after it is
`bridge-closed`); oversized frame / non-frame bytes (one branch, two inputs, recorded as such); zero-length frame;
duplicate JSON keys, reordered keys, `id: 2.0`, `body: null`, invalid UTF-8 (each caught by the canonical-encoding
or type rules); malformed frame followed by valid bytes (the resynchronising-parser mutant: the valid frame must
**not** be processed); EOF with a partial frame; unknown `op`. The bridge process's one-writer property is a **runtime tripwire** (§4): unit tests add a second writer through an
aliased `node:process` import, through `console.debug`, and through `process.stdout.end(chunk)`, and assert the
process exits non-zero the moment each writes; prototype dispatch, `net.Socket({fd:1})` and raw-fd writes are the
declared residue, with the Docker suite's exact-frames assertion as the only signal on the executed path.
The Docker suite additionally asserts the bridge stream contains exactly the expected frames.

### N — Docker-free `make test`, clean-clone green

The six signals of §9, with the root-of-trust claim stated in the guard's header. Verified at merge by the literal
clone.

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
| `scripts/check-compose.mjs`, `scripts/compose-lint.mjs`, `scripts/compose-lint.selftest.mjs` | §8 closed-schema Compose **and Dockerfile** lint, values and interpolation pinned, table-driven self-test, no-`.env` check |
| `testbed/docker/topology.json` | the single home of the §2 constants (services → container ports → host ports, image name, Compose file path, socket path, marker strings), read with `readFileSync` + `JSON.parse` and validated by **both** `compose.ts` and the plain-Node lint — a bare-`node` script cannot import TypeScript, and a constant that lives in two places is drift (integrator amendment 2026-09-05, after Job B2 stopped on the import) |
| `scripts/check-test-entry.mjs` (+ selftest) | §9 entry-point **grammar** gate |
| `scripts/check-test-execution.mjs` (+ selftest) | §9 execution proof over the three JSON reporter files (reads, never spawns) |
| `testbed/rootOfTrust.test.ts` | §9 hash pins for `package.json` scripts, `Makefile`, both Vitest configs, every `scripts/check-*.mjs` |
| `testbed/docker/secretScan.ts` (+ test) | §11 E the byte-native, multi-form scanner, proven with the real bytes |
| `testbed/fixtures/shared/bindServer.ts` | §2 T3 the single bind helper owning the EPERM branch |
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
3. **Job B2 — gates and configuration (Docker-free).** The closed-schema Compose + Dockerfile lint with its
   table-driven self-test; the entry-point grammar gate, the execution proof and the root-of-trust hash pins, each
   with self-tests; the capability map (exact import lists, all extensions, computed-import rejection, the single
   `scripts/` `child_process` entry and its `process.execPath` call-site pin) with its self-test mutants; the
   interceptor's `env` case and header; the Vitest split and the three reporter outputs; the amended
   `runner.artifacts.test.ts` pins; `package.json` `test` wiring and `Makefile` targets (not the lockfile).
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
10. Does the stdout tripwire fire for an aliased `node:process` writer in the **built bundle**, and does esbuild's
    bundling leave `process.stdout` as the same object the tripwire patched?
11. Is the `test` script grammar gate's expected command list itself the list `make test` runs (compare against
    `npm run test --dry-run` output, not against the gate's own constant)?
12. Are every `run()` bound and every short-lived handle registered, so a SIGINT during `compose up` leaks no CLI
    process (C-U3b P3, carried)?
13. Does the execution proof's "files, not tests" limit stay declared in its header (C-U3b P3, carried)?
14. Does the `export` overlap unit test on a synthetic stream actually straddle the chunk size (C-U3b P3, carried)?
15. Does `compose up --wait` treat an exited container as failure on this host, independent of the `exitCode = 1`
    rule (unverified on paper by both channels)?
16. Does the Makefile hash pin plus the `no prerequisites, one recipe line` rule leave any parse-time execution
    path un-declared (C-U3 P1-2 was absorbed by declaration; the review confirms the declaration is where the
    guard's header says it is)?

## 15. Lock record

**Revision 4 is LOCKED for implementation** (continuity owner, 2026-09-05). Three paper rounds ran, two blind
channels each (C-U1/U1b, C-U2/U2b, C-U3/U3b); the cap is spent and stays spent. Each round narrowed the design or
the claim rather than growing it: round 1 fixed the argv and the deferred residuals, round 2 replaced source scans
with runtime tripwires and a grammar gate, round 3 sized the tripwire's claim to its mechanism and moved the
entry-point files to a declared, hash-pinned root of trust. No round-3 finding required a new mechanism or a claim
stronger than the locked spec; two were absorbed by declaration (§9), which is the conventions' prescribed move
when a channel beats the same invariant three rounds running.

**What the implementation review must re-check** is §14 (items 1–16). **Stop-and-return conditions** for the
implementer and the integrator, from the spec's lock record: a locked decision that needs a new mechanism, or a
claim stronger than the deployment assumption supports. Design choices T1–T5, L1–L2, the ordered correlation, the
single-session control server, the container-id binding semantics, the root-of-trust declaration and the B4
mechanism are recorded with their alternatives in §2–§10 and are not reopened on paper.
