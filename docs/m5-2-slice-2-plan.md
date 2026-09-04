# M5.2 slice 2 — daemon-channel preflight, canonical endpoint policy, pinning, fail-closed composed construction

**Revision 3** — absorbs round 1 and round 2 of the pre-impl review (`docs/m5-2-slice-2-review-findings.md`:
C-T1 NEEDS-ATTENTION, C-T2 **STOP** 3×P1, C-T3a absorption **PASS**, C-T3b **STOP** 4×P1). Base: `main` @ `f161f1b`. Branch: `codex/m5-2-slice-2`.
Spec: `docs/m5-2-slice-spec.md` revision 4 (LOCKED, `60520d9`) §D5.0, §D5, Acceptance A + B.

> **What changed from revision 1.** The pinning design was rebuilt: a type brand does not enforce provenance and
> free-form argv defeats env pinning (B1, B2), so the seam is now a **closed command vocabulary behind a single
> runtime-checked executor**, backed by a repo-wide scan with a proven red. Preflight ordering moved **above
> browser launch on the public capture entry**, because the direct-capture path bypassed `runEval` entirely (B3).
> The built-in `default` Docker context is special-cased (A1), redundant slashes are rejected (A3b), AP-1's
> rationale is corrected (A3a), the AP-2/AP-3 evidence block is corrected (A4), and two limits are recorded as
> **declared deferrals** rather than left implicit (A2, B5a).
>
> **Revision 3 (round 2).** Provenance moves from `instanceof` + `Symbol` to a module-private `WeakSet` with
> immutable storage, because symbols are reachable by reflection and a genuine instance was mutable (R2-1). The
> invocation gate stops keying on Docker spellings — which a computed import plus a base64 executable name walks
> straight past — and gains a **runtime interceptor** that sees resolved values at call time (R2-2). A
> caller-supplied browser becomes **runtime-illegal in composed mode**, closing the hostile suite's
> `capturePersistedRuns(…, existingBrowser, …)` shape (R2-3). And **Acceptance B is no longer claimed as fully
> gated**: with zero executable command variants in this slice, the argv mutant cannot fail, so it is deferred
> rather than asserted (R2-4).

---

## 1. Scope (literal — the owner set this boundary)

1. Effective-endpoint resolution, validation, and ambiguity rejection.
2. Canonical local Unix-socket policy (the C-R7 P2 #1 decision).
3. Endpoint pinning for every later Docker operation.
4. Preflight ordering — before artifact deletion, Chromium, scenario execution, or any composed side effect.
5. Fail-closed composed construction, with no in-process fallback.
6. The Acceptance A and B mutants this slice can actually prove (§6).

**Not this slice — these stay slice 3+:** containers, Dockerfile, Compose, the control socket, framing, bootstrap
delivery, the exec bridge. Slice 2 **may** establish injected construction/command seams where they are needed to
prove failure propagation, but **Docker must remain absent from the `make test` execution path** — no subprocess,
no daemon connection, no socket dial, in any test.

---

## 2. The C-R7 P2 #1 decision — what "canonical local `unix://`" means

### 2.1 Accepted representation

The endpoint must be **exactly** `unix:///` + a **normalized** absolute path. One shape, no aliases:

| Rejected | Example | Why |
|---|---|---|
| Non-Unix scheme | `tcp://`, `http://`, `https://`, `ssh://`, `npipe://` | v0.1 restriction (§D5.0) |
| Unknown / absent scheme | `foo://…`, `/var/run/docker.sock` | not the accepted representation |
| Non-empty authority | `unix://host/var/run/docker.sock` | `host` is an authority — ambiguous |
| Authority-less short form | `unix:/var/run/docker.sock` | parses, but is not the accepted representation |
| Credentials / userinfo / port | `unix://user:pw@/path`, `unix://:2375/path` | authority must be empty |
| Query or fragment | `…sock?x=1`, `…sock#f` | no meaning for a socket path; silent-drop hazard |
| Empty path | `unix://` | **A2 — declined deliberately;** see the note below |
| **Redundant slashes** | `unix:////var/run/docker.sock`, `unix:///var//run/docker.sock` | **A3b** — Docker reaches the socket through both, but "canonical" must mean *already normalized*, or the rule contradicts itself |
| Relative or dot segments | `unix:///var/../run/x`, `unix:///./x` | must already be normalized |
| Trailing slash | `unix:///path/` | not a socket path |
| Any percent escape | `unix:///var/run/docker%2Esock` | **AP-1**, rationale corrected below |
| Control characters / NUL | — | path-truncation hazard |

**Decision AP-1 — reject `%` outright rather than percent-decoding.** *Rationale corrected per A3a:* it is **not**
true that a real socket path never contains `%` — Unix filenames may contain it, and Docker 29.6.2 dials the
literal `/tmp/docker%25.sock`. The rule stands on different ground: refusing the character removes the
malformed-escaping class entirely instead of parsing it, and no decoding step means no decoding ambiguity. This
**rejects a legal-but-rare path**; the operator's remedy is to rename or symlink it. Recorded as a deliberate
false-rejection, not an oversight.

**A2 — `DOCKER_HOST=unix://` stays rejected, deliberately.** Docker 29.6.2 resolves it to
`unix:///var/run/docker.sock`. Accepting it would add a normalization special-case to buy a convenience. Keeping
exactly one accepted shape keeps the rule auditable — a false rejection is loud and trivially remedied, a false
acceptance is silent. This declines a convenience, not a protection.

### 2.2 Canonicalization and the filesystem check

After the syntactic gate, in this order:

1. **`realpath`** the path → the canonical real path. Symlinks resolve (on this host `/var/run/docker.sock` →
   `~/.docker/run/docker.sock`; on macOS `/var` → `/private/var`). Both are normal and must pass.
2. **`stat`** the resolved path; it must **exist** and be a **Unix socket** (`isSocket()`).
3. **Pin the resolved path**, never the pre-realpath string. Everything downstream uses `unix://<realpath>`.

Pinning the *resolved* path is what closes validate-one/execute-another across a symlink that changes between
check and use.

**B5a — dead-listener sockets are a declared deferral to slice 3.** `unix:///tmp/stale.sock` can be an existing
`S_ISSOCK` whose listener is gone; `realpath` and `stat` both pass. Distinguishing it requires **dialing** the
socket, and §D5.0 requires the preflight to run *before the daemon is contacted* — so a liveness probe would
either violate that ordering or assert liveness the preflight cannot honestly establish. Slice 3's first real
Docker operation fails closed on it under Acceptance A's no-fallback rule. Declared here so it is a known
deferral, not an unnoticed gap.

### 2.3 The limit that is recorded, not implemented — proxy rejection

**Not implemented, and not claimed.** A `socat`-style forwarder presents an `AF_UNIX` socket byte-identical to
dockerd's; `S_ISSOCK` is true either way. Peer credentials name only the *listening* process, are not reliably
obtainable for a listening socket through Node on macOS, and — decisively — **Docker Desktop's socket is itself
fronted by a user-space helper**, so "reject proxied sockets" would reject the standard supported configuration.
Even a confirmed `dockerd` peer says nothing about that daemon's *other* listeners, which is the real exposure
question.

This restates C-R8 at implementation level: it stays covered by the **declared Docker-daemon isolation deployment
requirement**. No code, comment, test name, or report in this slice may imply that inspecting the socket proves
the daemon has no additional listeners or cannot proxy elsewhere. *Round-1 review independently confirmed this
reasoning as sound and inside the locked claim boundary.*

---

## 3. Source resolution and the ambiguity policy

### 3.1 Sources

| Source | Read from | Counts as *explicit* when |
|---|---|---|
| `DOCKER_HOST` | environment | set and non-empty |
| `DOCKER_CONTEXT` | environment → context lookup | set and non-empty |
| active context | `$DOCKER_CONFIG/config.json` (default `~/.docker/config.json`) → `currentContext` → context lookup | the `currentContext` key is **explicitly present** and non-empty |
| built-in default | `unix:///var/run/docker.sock` | used only when **zero** explicit sources are present |

Context lookup is **file-based, never the `docker` CLI**: `$DOCKER_CONFIG/contexts/meta/<sha256(name)>/meta.json`,
field `Endpoints.docker.Host`. Reading files keeps the preflight subprocess-free, which is what lets it run on a
Docker-free `make test` path with injected inputs. *Round-1 review verified the sha256-of-name layout is correct
on this host and that the file endpoint matches the CLI.*

**A1 — the built-in `default` context is special-cased, because it is not file-backed.**
`docker context inspect default` reports `Storage.MetadataPath=<IN MEMORY>` and `unix:///var/run/docker.sock`;
no `sha256("default")/meta.json` exists. A file-only lookup would reject `DOCKER_CONTEXT=default` and
`currentContext: "default"`, both of which are valid in Docker 29.6.2. The name `default` therefore resolves to
the built-in endpoint **without** a file read. It still counts as an *explicit* source when named explicitly.

Any other named context that does not exist, or whose `meta.json` is missing, unparseable, or has no
`Endpoints.docker.Host`, is a **rejection** — never a fall-through to another source.

### 3.2 Ambiguity policy

**If two or more *explicit* sources are present and their endpoints disagree → reject.** Agreement is accepted.
This is deliberately stricter than the Docker CLI's precedence (which lets `DOCKER_HOST` silently win over
`DOCKER_CONTEXT`); C-R7 confirmed stricter-than-CLI is the safe direction. The operator's remedy is to unset the
conflicting source — never a fallback, never a best guess.

**Decision AP-2 — the built-in default is "absent", not a disagreeing source.** Counting it would reject ordinary
Colima and rootless-Docker installs, whose selected socket legitimately differs from `/var/run/docker.sock`.
Strictness is aimed at *two explicit, conflicting configurations* — the real validate-one/execute-another setup.

**Decision AP-3 — compare endpoints after canonicalization, not as raw strings.** Two explicit sources naming the
same socket by different paths must agree, not collide. Disagreement is judged on the `realpath`-resolved socket
path (§2.2), which is also the value that gets pinned. Raw-string comparison would reject the ordinary local
pairing `DOCKER_HOST=unix:///var/run/docker.sock` + `DOCKER_CONTEXT=desktop-linux` even though both reach one
socket.

**Round-1 review settled the AP-3 question I raised:** in one stable filesystem namespace, `realpath` **cannot**
make two genuinely different contemporaneous Unix socket addresses compare equal. Replacement races are a separate
threat, and are not in this slice's claim. Both decisions retained.

**Corrected evidence (A4).** Revision 1 claimed this host demonstrates AP-2 and AP-3 are "both needed". It does
not: once AP-3 canonicalizes, counting the built-in default would *not* cause disagreement here, because
`/var/run/docker.sock` and the `desktop-linux` endpoint resolve to the same path. The accurate statement is
narrower — this host has **exactly one explicit source** (`currentContext: desktop-linux`), so it exercises
neither rule's disagreement branch:

```
DOCKER_HOST unset · DOCKER_CONTEXT unset
~/.docker/config.json -> "currentContext": "desktop-linux"        <- the single explicit source
context desktop-linux -> unix:///Users/jonathanavni/.docker/run/docker.sock
/var/run/docker.sock  -> symlink -> /Users/jonathanavni/.docker/run/docker.sock   (same socket, S_ISSOCK)
docker-cli 29.6.2
```

**Declared residual (A4).** AP-2 trusts a *single* explicit source: `currentContext: "evil"` resolving to
`/tmp/attacker.sock` is accepted. Counting the built-in default would reject it but would break ordinary
Colima/rootless installs. This sits inside the locked threat model — the operator and harness are **trusted**; the
adversary is the evaluated model and hostile page content, neither of which can write the operator's Docker
configuration. Recorded, not chased.

---

## 4. Pinning — a closed command vocabulary behind one runtime-checked executor

Revision 1 proposed a branded type plus `createDockerCommand(pin, argv)`. Round-1 review destroyed both halves,
and it is the same lesson slice 1 learned as C-S1: **the type system cannot enforce this class.**

- **B1 — free-form argv defeats env pinning.** `-H/--host` and `-c/--context` override `DOCKER_HOST`, so
  `['--host','tcp://attacker:2375','compose','up']` walks straight past a correct env pin.
- **B2 — a TS brand is erased at runtime.** `'unix:///tmp/evil.sock' as unknown as PinnedDockerEndpoint` forges a
  pin, a JS caller passes a bare string, and nothing at all stops `spawn('docker', ['-H','tcp://…'])` from another
  module. A builder-only test stays **green** under the raw-spawn mutant.

The replacement has three parts, none of which relies on static types:

**(a) A closed command vocabulary — no free-form global argv.** `DockerCommand` is a discriminated union of the
operations the harness actually performs. Slice 2 defines the union and its executor with the variants slice 2
needs (none yet); slice 3 adds `compose-up`, `compose-down`, `inspect`, `exec`, etc. **Process argv is constructed
inside the module from the variant** and is never passed through from a caller. Where a variant legitimately
carries inner arguments (slice 3's `exec` container command), those land strictly after the subcommand and can
never occupy a global-flag position.

**(b) A runtime-checked pin, not a compile-time brand.** `PinnedDockerEndpoint` is a class with a module-private
constructor; the preflight is the only minting site. The executor calls `assertPinned()` before doing anything.

*R2-1 corrected the mechanism.* `instanceof` plus a module-private `Symbol` is **not** runtime-private —
`Object.getPrototypeOf()` and `Object.getOwnPropertySymbols()` reach both, so the brand can be cloned onto a
forgery; and a *genuine* instance stayed valid under `(pin as any).endpoint = 'tcp://attacker:2375'`. So:

- Membership is recorded in a **module-private `WeakSet`** that is never exported and has no reflective path from
  an instance. `assertPinned` tests set membership, not shape.
- The endpoint is held in a true **`#private` field** and the instance is **frozen**, so a valid pin cannot be
  mutated into an invalid one after minting.
- Mutation and reflection-cloning are each a named mutant (§6).

Provenance is re-checked, **not** the filesystem — re-running `realpath`/`stat` at execution time would
reintroduce the TOCTOU the pin exists to close.

**(c) One choke point, guarded at runtime *and* statically.** Exactly one module — `testbed/docker/exec.ts` —
may spawn a Docker process. It sets `DOCKER_HOST` from the pin, removes `DOCKER_CONTEXT` and `DOCKER_CONFIG` from
the child environment, and asserts the argv it built carries no endpoint-selecting token.

*R2-2 killed the source-scan-only design.* A scan keyed on Docker spellings is walked past by:

```ts
const cp = await import('node:' + 'child_process');           // computed specifier
const exe = Buffer.from('ZG9ja2Vy', 'base64').toString();      // no "docker" literal
cp.spawn(exe, ['-H', 'tcp://attacker:2375', 'info']);
```

— and equally by `node:http.request({ port: 2375, path: '/v1.51/info' })` or any Engine-API client dependency. No
literal, no socket path, gate green. This is C-S1's lesson again: **static analysis cannot enforce this class.**
So the primary guard is runtime, where obfuscation has already resolved itself:

- **Runtime interceptor, active for the whole `make test` run.** A Vitest setup module wraps
  `child_process.spawn/spawnSync/exec/execFile/execSync` and `net.connect`, inspecting the **resolved value at
  call time**: a child process whose executable basename is `docker`/`docker-compose`, a connect to a Docker
  socket path, or a connect to ports 2375/2376 **throws loudly**. The base64 payload above is caught, because by
  the time `spawn` runs the string *is* `docker`. It is deliberately narrow — Playwright's own Chromium spawn
  must keep working, so this bans Docker access, not subprocesses.
- **Static allowlist as defence in depth**, for code no test exercises: `scripts/check-docker-invocation.mjs`
  allows `node:child_process` / `node:net` / `node:http(s)` imports only from an explicit module allowlist,
  reusing the module-graph machinery of the existing `scripts/check-dependency-boundary.mjs` rather than
  grepping for the word "docker".
- **Both ship with self-tests that prove a red**, modelled on `scripts/dependency-boundary.selftest.mjs`, and
  both are **wired into `package.json`'s `test` script** (B5b) — a gate `make test` does not run is not a gate.

Neither guard is claimed to be complete: the static half cannot follow a computed specifier, and the runtime half
only covers code the suite actually executes. Together they cover each other's blind spot, and that is the claim.

---

## 5. Ordering and fail-closed construction

### 5.1 The public capture entry, not just `runEval` (B3)

Revision 1 put the preflight only in `runEval`. That is **too late for the direct path**:
`capturePersistedRuns(dir, n, undefined, {startFixtures: composedStarter})` **launches Chromium itself at
`runner.ts:165`** before `captureWithBrowser` is reached, and passing a browser bypasses `runEval` altogether.
Moving the preflight into `captureWithBrowser` — revision 1's fallback idea — is *still* too late.

So:

- `capturePersistedRuns` takes an **explicit architecture mode**. For `composed`, the preflight runs **first**,
  before any browser launch, and yields the pin.
- **R2-3 — a caller-supplied browser is runtime-illegal in composed mode.** `capturePersistedRuns(…,
  existingBrowser, composed)` cannot be ordered correctly by any placement of the preflight: Chromium was already
  launched *by the caller*, so "no Chromium launch before preflight" is false before the preflight is even
  reached. The hostile suite uses exactly this shape (`testbed/hostile.browser.test.ts:318, 359, 430`), always
  in-process. Composed mode therefore **rejects a supplied browser** rather than accepting an unorderable call.
- **Composed constructors stay private behind the owning entry.** Exported `startFixtures()`
  (`testbed/fixtures/index.ts:10`) and `startLoginFixture()` (`testbed/fixtures/shared/loginFixture.ts:53`) remain
  **in-process-only in their public form**; making them architecture-aware in public would create exactly the
  uncovered composed entries R2-3 enumerated.
- The pin propagates **downward only**. Nothing below re-resolves an endpoint; that is what makes
  validate-one/execute-another unreachable rather than merely discouraged.
- `in-process` never touches Docker at all — the hostile suite's direct calls stay clean and Docker-free.
- `runEval` keeps its spec-pinned preflight between `testbed/runner.ts:118` and `:119`. *Round-1 review confirmed
  this location is genuinely before artifact deletion, directory creation, Chromium launch, controls-lab startup
  and the harness gate.*
- The preflight is an **injected seam** (`options.dockerPreflight`) so existing unit tests never read the real
  Docker configuration (B5b).

### 5.2 Fail-closed composed construction

- Composed start **requires a pin** and cannot be called without one.
- In slice 2 composed start then fails (slice 3 supplies the implementation). **Every** composed-construction
  failure is a red, with **no selective fallback for any of them.**
- The EPERM `no-socket` substitution (`testbed/fixtures/shared/loginFixture.ts:114-128`, helper at `:487-489`)
  must be **unreachable** from the composed path.
- **B4 — the EPERM proof must be deletion-isolated.** An unconditional slice-2 "composed is unavailable" throw
  would make a composed-EPERM test pass for the wrong reason. The required test drives the **production path**
  with composed mode and `listen()` rejecting `{code:'EPERM'}`, and asserts no transport and no in-process
  fallback is returned; **deleting the composed-mode EPERM guard must turn it red.**
- The in-process path is behaviour-unchanged; slice 2 must not alter any existing green.

*Noted from B4 and accepted as scope-bounded:* `FixtureStarter` can return any self-labelled transport, and
capture only checks HTTP reachability. Under the locked threat model the starter seam is **trusted harness
internals**, so this is a test-seam concern, not an adversary capability — which is precisely why B4's remedy is a
production-path mutant rather than new runtime mechanism.

---

## 6. Acceptance mapping — what this slice proves, and what it defers

**Honest narrowing.** The implementation-plan table says slice 2 gates "Acceptance A and B". **B is fully gated
here; A is only partly provable before containers exist.** This plan states the split rather than implying
coverage it lacks.

### Acceptance B — gated **except one deferred mutant** (R2-4)

**The honest correction.** Revision 2 claimed B was "fully gated". It is not. Slice 2 defines **zero executable
`DockerCommand` variants**, so deleting the endpoint-token assertion cannot change any production-path result — no
variant can emit `-H`, `--host=`, `-c` or `--context=`. A helper-only test would prove nothing about the choke
point. The **argv mutant is therefore deferred to slice 3**, where the first real variant reaches an injected
process boundary. The assertion still ships in slice 2 as a defensive check; it is simply not claimed as gated.

**Every rejection test must isolate a single rejection branch (R2-4).** Overlapping branches hide each other:
deleting only the scheme check from `tcp://attacker:2375` still rejects on non-empty authority, so that test would
stay green through a real defect. Each negative case names the one rule it exercises and uses an input that trips
only that rule.

| Mutant | Test must go red |
|---|---|
| `DOCKER_HOST=tcp://…` | rejected |
| `DOCKER_CONTEXT` → context whose endpoint is `tcp://` / `http(s)://` / `ssh://` | rejected |
| Unknown scheme; each malformed row of §2.1 **including redundant slashes** | rejected |
| Two explicit sources disagreeing (compared canonically, AP-3) | rejected |
| `DOCKER_CONTEXT=default` and `currentContext: "default"` (A1) | **accepted** — special-case must work |
| Named context missing / unparseable / no `Endpoints.docker.Host` | rejected |
| **Pin forgery — plain object (B2)** | a cast/plain-object pin reaching the executor must throw at runtime |
| **Pin forgery — reflection clone (R2-1)** | a forgery built via `Object.getPrototypeOf()` / `getOwnPropertySymbols()` must still fail the `WeakSet` check |
| **Pin mutation (R2-1)** | `(pin as any).endpoint = 'tcp://…'` on a *genuine* pin must fail — frozen instance, `#private` storage |
| **Raw spawn, literal (B2)** | `spawn('docker', ['-H','tcp://…'])` outside the choke point must turn both gates red — each gate's **self-test** proven red independently |
| **Raw spawn, obfuscated (R2-2)** | computed `import('node:'+'child_process')` with a base64 executable name must be caught by the **runtime interceptor** (the static gate is *expected* to miss it; that is why both exist) |
| **Direct Engine API (R2-2)** | `node:http.request({port:2375})` and a unix-socket connect to the Docker socket must both be caught at runtime |
| **Supplied browser in composed mode (R2-3)** | `capturePersistedRuns(…, existingBrowser, composed)` must be rejected, not silently ordered wrong |
| Ordering | each rejection occurs **before** artifact deletion, Chromium launch, and any Docker operation — asserted by observing those effects did not happen, not by argument |
| *Positive control* | this host's real `unix://` endpoint passes (integrator-run; not on the `make test` path) |

### Acceptance A — the slice-2 subset

**Provable now:** preflight ordering on the direct composed capture entry (B3); a direct composed
`capturePersistedRuns` bypassing `runEval`; daemon absent (socket missing); the composed-EPERM guard (B4); and the
**no-fallback rule** for every composed-construction failure this slice can raise.

**Deferred to slices 3–5, declared:** image build failure, container creation failure, exec failure, handshake
failure, MAC failure, protocol error, "daemon killed after preflight but before container creation", and
**B5a's dead-listener socket** (§2.2), and **R2-4's endpoint-selecting-argv mutant** (no executable variant
exists until slice 3).

### Absence-detection

Every mutant above is demonstrated **red-then-green**, never asserted. A rejection test that still passes with its
check deleted is the M5.1 defect class repeating — and B2/B4 are two live examples the reviewer found in
revision 1.

---

## 7. `make test` stays Docker-free

- No test may spawn a subprocess, dial a socket, or read the real `~/.docker` tree. Env, config, context metadata,
  `realpath` and `stat` inputs are **all injected**.
- `scripts/check-docker-invocation.mjs` + its self-test are **slice 2's job, not slice 3's** (B5b resolves
  revision 1's open question): Docker-facing modules become reachable now, so the absence signal must exist now.
  Both are wired into `package.json`'s `test` script.
- Verified at merge by a **literal clean clone**: `git clone` into a temp dir, `npm ci`, `make browsers`,
  `make test`.
- Baseline to preserve: **995 + 5 + 10, exit 0** (measured on `main` @ `f161f1b`, this host).

---

## 8. Proposed file layout

| File | Purpose |
|---|---|
| `testbed/docker/endpoint.ts` | §2 syntactic policy — pure, no I/O |
| `testbed/docker/context.ts` | §3.1 source reading, built-in `default` special-case, context files (injected fs) |
| `testbed/docker/preflight.ts` | resolve → validate → realpath → stat → mint the pin |
| `testbed/docker/exec.ts` | §4 the single choke point: closed vocabulary, `assertPinned`, child env |
| `testbed/docker/*.test.ts` | the §6 mutants |
| `scripts/check-docker-invocation.mjs` + `.selftest.mjs` | §7 gate and its proven red |
| `testbed/runner.ts` | §5.1 ordering: preflight at `:118`/`:119` **and** on the public capture entry |
| `testbed/fixtures/index.ts`, `shared/loginFixture.ts` | §5.2 architecture-aware, fail-closed start |
| `package.json` | wire the gate into `test` |

Files under 400 lines, functions under 50, ≤4 nesting levels (`.claude/rules/core.md`).

---

## 9. Status and what the implementation review must re-check

**Two pre-implementation rounds are complete and the plan is LOCKED for implementation.** Round 2's absorption
sweep passed with all eleven round-1 findings absorbed and no accepted finding missing; its bypass hunt returned
four P1s, all absorbed above. Both rounds beat the *pinning-enforcement* invariant, which per
`.claude/memory/conventions.md` is the signal to **narrow the claim rather than add another paper round** — R2-4's
disposition does exactly that. The locked spec directs that executable guarantees are validated in the
implementation-review ladder, not on paper.

**Carry into the post-implementation review, because paper cannot settle them:**

1. Does the `WeakSet` + `#private` + frozen design actually resist reflection and mutation *in the built code*?
2. Does the runtime interceptor catch the obfuscated spawn **without** breaking Playwright's Chromium launch?
3. Is every rejection test branch-isolated, or do overlapping rules still hide a deleted check?
4. Are A2, B5a and R2-4 still *declared deferrals* in the shipped code, or did one quietly become a claim?
5. Does any code comment, test name or report imply the preflight establishes daemon non-exposure?
