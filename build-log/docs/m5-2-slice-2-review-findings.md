# M5.2 slice 2 — pre-implementation review register

Channel: Codex (gpt-5.6-sol, high effort), read-only, 2026-09-04, on `docs/m5-2-slice-2-plan.md` revision 1.
Split into two focused parallel jobs after two full-scope turns died silently (see `.claude/memory/gotchas.md`).

- **C-T1** = part A (plan §2–§3: endpoint syntax, source resolution, ambiguity) — **NEEDS-ATTENTION**, 2 P2 + 2 P3.
- **C-T2** = part B (plan §4–§7: pinning, ordering, fail-closed, acceptance, gate) — **STOP**, 3 P1 + 2 P2.

Both were empirically grounded: A probed the real `docker` CLI 29.6.2 for parsing and context behaviour; B traced
the actual call graph. Neither touched a file.

---

## C-T1 — part A findings

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| A1 | P2 | The built-in `default` context is **not file-backed**: `docker context inspect default` reports `Storage.MetadataPath=<IN MEMORY>` and `unix:///var/run/docker.sock`; no `sha256("default")/meta.json` exists. So `DOCKER_CONTEXT=default` or `currentContext: "default"` works in Docker 29.6.2 but the plan's file-only lookup rejects it. | **ACCEPTED** — special-case the built-in context. |
| A2 | P2 | `DOCKER_HOST=unix://` is resolved by Docker 29.6.2 to `unix:///var/run/docker.sock`; the plan rejects it as empty-path. Rejecting is safe but rejects a legitimate configuration. | **DECLINED, recorded** — see §Adjudications. |
| A3a | P3 | AP-1's rationale is **false**: Unix filenames may contain `%`, and Docker dialed the literal `/tmp/docker%25.sock`. "A real Docker socket path never needs one" is unsupported. | **ACCEPTED** — rule kept, rationale corrected. |
| A3b | P3 | The stated grammar **accepts** `unix:////var/run/docker.sock` and `unix:///var//run/docker.sock` (Docker reached the socket through both), contradicting the plan's own "already normalized" dot-segment rule. | **ACCEPTED** — reject redundant slashes for internal consistency. |
| A4 | P3 | AP-2 and AP-3 are both **sound and retained**, but the plan's new "verified on this host … why both are needed" block **overstates**: once AP-3 canonicalizes, counting the built-in default would not cause disagreement on this host. Also: AP-2 accepts a single bad explicit source (`currentContext: "evil"` → `/tmp/attacker.sock`); counting the default would reject that but would break ordinary Colima/rootless installs. | **ACCEPTED** — evidence block corrected; residual declared. |

**A's answer to the AP-3 question I asked:** in one stable filesystem namespace, `realpath` **cannot** make two
genuinely different contemporaneous Unix socket addresses compare equal; replacement races are a separate threat.
AP-3 retained.

**A on §2.3 (proxy rejection):** *"declining proxy rejection is sound and respects the locked claim boundary.
Socket inspection cannot establish the daemon's complete listener set or rule out forwarding."* — independent
confirmation of the C-R8-aligned decision.

---

## C-T2 — part B findings

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| B1 | **P1** | **Docker arguments override the pin.** `createDockerCommand(pin, argv)` takes arbitrary global argv, and `-H/--host` / `-c/--context` beat `DOCKER_HOST`. Bypass: `argv = ['--host','tcp://attacker:2375','compose','up']`. Deleting env vars is insufficient. | **ACCEPTED** — closed typed command vocabulary; no free-form global argv. |
| B2 | **P1** | **The branded type does not enforce "preflight only."** TS brands are erased: `'unix:///tmp/evil.sock' as unknown as PinnedDockerEndpoint` forges a pin, JS callers pass a raw string, and nothing stops `spawn('docker', ['-H', 'tcp://…'])` elsewhere. Acceptance B's builder-only test stays **green** under the raw-spawn mutant. | **ACCEPTED** — runtime-checked provenance + single choke-point executor + repo-wide scan with a proven red. This is C-S1 (slice 1) restated. |
| B3 | **P1** | **Direct composed capture has no valid preflight/pin flow.** `capturePersistedRuns(dir, 1, undefined, {startFixtures: composedStarter})` launches Chromium at `runner.ts:165` *before* `captureWithBrowser`; supplying a browser bypasses `runEval` and preflight entirely. Moving preflight into `captureWithBrowser` is **still too late**. | **ACCEPTED** — explicit architecture mode on the public capture entry, preflight before browser launch, downward-only pin propagation. |
| B4 | P2 | **Composed identity and the EPERM boundary lack a deletion-isolated proof.** `FixtureStarter` may return any self-labelled transport; capture checks only HTTP reachability. §6 names no mutant that deletes the composed-mode EPERM guard, so an unconditional slice-2 `ComposedTransportUnavailableError` test could stay **green**. | **ACCEPTED, then DEFERRED to slice 3 at implementation** — the structural half (no fallback; in-process EPERM substitution unreachable from composed) is proven now; the deletion-isolated EPERM test itself cannot exist in slice 2 because no composed path reaches `listen()`. See the three-channel section below. |
| B5a | P2 | **"Daemon absent" is narrowed to a missing socket**, but `unix:///tmp/stale.sock` can be an existing `S_ISSOCK` with a dead listener; `realpath`/`stat` both pass. Neither proved nor deferred. | **ACCEPTED as an explicit deferral** — see §Adjudications. |
| B5b | P2 | **The Docker-free checker and its self-test are not wired into `make test`** (`package.json:8` unchanged), so a conditional `spawn('docker')` mutant is silent-green. The gate **belongs in slice 2** because Docker-facing modules become reachable now. `runEval` also needs an **injected preflight seam** so existing unit tests never read real Docker configuration. | **ACCEPTED** in full. |

**B validated the ordering claim:** the `runner.ts:118`/`:119` insertion *is* correctly before artifact deletion,
directory creation, Chromium launch, controls-lab startup and the harness gate. The direct-capture path (B3) was
the remaining bypass.

---

## Adjudications (integrator, 2026-09-04)

**A2 — DECLINED, fail-closed.** `DOCKER_HOST=unix://` stays rejected. The accepted representation remains exactly
one shape (`unix:///` + normalized absolute path), which keeps the rule auditable — the security story here is
"read the code." A false rejection is loud and the operator's remedy is to write the full path; a false acceptance
is silent. This declines a *convenience*, not a protection, and it does not weaken any claim.

**B5a — DEFERRED to slice 3, explicitly.** A dead-listener socket cannot be distinguished from a live one without
**dialing** it, and §D5.0 requires the preflight to run *before the daemon is contacted*. Adding a liveness dial
would either violate that ordering or assert liveness the preflight cannot honestly establish. Slice 3's first
real Docker operation fails closed on a dead listener under Acceptance A's no-fallback rule, which is where the
case belongs. Recorded here so it is a **declared deferral rather than an unnoticed gap** — B5a's actual complaint.

**Round budget.** This is pre-implementation, round 1. Revision 2 absorbs every accepted finding and gets one
focused round-2 pass on the changed decisions only, then implementation proceeds.

---

## C-T3 — round 2 (Codex, read-only, 2026-09-04) — on plan revision 2

Split again after a single-turn round-2 job died silently. Two jobs:

**C-T3a — absorption sweep + deferral judgement: PASS.** All eleven round-1 findings marked **ABSORBED** with a
section reference each; *"Accepted findings missing from the plan: none."* Both declared deferrals judged
legitimate on their reasoning, not their label: A2 is *"a permanent compatibility rejection rather than deferred
implementation"* (fails loudly, trivial remediation); B5a is sound because *"establishing liveness requires
contacting the endpoint, contrary to the locked pre-contact ordering"* and the first pinned operation must fail
closed. No wording implies daemon non-exposure.

**C-T3b — bypass hunt: STOP, four P1s.** All four accepted.

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| R2-1 | **P1** | **The pin's provenance is forgeable.** `instanceof` + a module-private `Symbol` is not runtime-private: `Object.getPrototypeOf()` / `Object.getOwnPropertySymbols()` expose and clone the brand. Simpler: a *genuine* branded instance stays valid after `(pin as any).endpoint = 'tcp://attacker:2375'` unless the endpoint storage is immutable. | **ACCEPTED** — module-private `WeakSet` + true `#private` fields + frozen endpoint storage; mutation and reflection-cloning both tested. |
| R2-2 | **P1** | **The scan is defeated without a Docker literal.** `const cp = await import('node:'+'child_process'); const exe = Buffer.from('ZG9ja2Vy','base64').toString(); cp.spawn(exe, ['-H','tcp://attacker:2375','info'])` contains no docker literal and no socket literal; `node:http.request({port:2375, path:'/v1.51/info'})` and a daemon-client dependency also bypass it. The literal raw-spawn self-test stays **green**. | **ACCEPTED** — the gate keys on *capabilities*, not Docker spellings, and gains a **runtime** interceptor (see plan §4c). |
| R2-3 | **P1** | **§5.1 misses the supplied-browser capture path.** `capturePersistedRuns(…, existingBrowser, composed)` — Chromium is already launched by the caller, so the "no Chromium launch before preflight" assertion is false before the preflight even runs. The hostile suite uses exactly this shape at `hostile.browser.test.ts:318, 359, 430`. Exported `startFixtures()` / `startLoginFixture()` would become further uncovered composed entries if made architecture-aware. | **ACCEPTED** — a supplied browser is **runtime-illegal** in composed mode; composed constructors stay private behind the owning entry. |
| R2-4 | **P1** | **§6 contains a silent-green argv mutant, so "Acceptance B fully gated" is false.** Slice 2 defines *zero* executable `DockerCommand` variants, so deleting the endpoint-token assertion cannot change any production-path result — no variant can emit `-H`/`--host=`/`-c`/`--context=`. Also: overlapping rejection branches hide each other (deleting only the scheme check from `tcp://attacker:2375` still rejects on non-empty authority). | **ACCEPTED** — B is **no longer claimed as fully gated**; the argv mutant is deferred to slice 3, and every rejection test must isolate a single rejection branch. |

**Round budget.** Rounds 1 and 2 both beat the *pinning-enforcement* invariant. Per
`.claude/memory/conventions.md`, a channel beating the same invariant repeatedly is the signal to **narrow the
claim rather than add code** — which is what R2-4's disposition does. Revision 3 absorbs all four P1s and
**implementation proceeds**; the executable guarantees are validated in the implementation-review ladder, as the
locked spec itself directs, not in a third paper round.

---

## Three-channel post-implementation review (2026-09-04) — on `783d0df..fb044d3`

Because **Codex wrote this code**, the two Claude channels are the different-family look and the Codex pass is
fresh-context but same-family (`.claude/memory/conventions.md`).

| Channel | Verdict |
|---|---|
| Codex adversarial post-impl (gpt-6-astra, base+head pinned) | **NEEDS-ATTENTION** — 4 × P2 |
| Fresh-context QA `/review` (rejection-default, **43 mutations, 40 red**) | **NEEDS-ATTENTION** — 2 × P2 new, 1 × P2 docs, 5 × P3 |
| `/security-review` (third channel) | **No findings ≥ 7 confidence**; 4 sub-threshold observations |

**Where the channels disagreed, and how it was adjudicated.** The security channel rated the exemption-suffix and
socket-basename issues ~4 (needs a deliberate repo change; operator config is trusted) while Codex rated both P2.
Adjudicated in favour of fixing: PI-4 **weakens a boundary that existed before this change**, and a regression in an
existing gate is not excused by the threat model; PI-2 degrades the **Docker-free guarantee**, which is a
correctness invariant of the suite and not only a security property. "One channel said it was fine" is not a
resolution (`docs/handoff-pattern.md` §7.1).

### Confirmed by the integrator, not taken on report

| # | Finding | Verification |
|---|---|---|
| **F1** | **Loader exemption matches by SUFFIX** (`realpathEndsWith`), so **any** path ending `testbed/docker/no-docker.setup.ts` is exempt — including a production `src/testbed/docker/no-docker.setup.ts`. | **Reproduced:** that file importing `node:module` → gate **PASS**, 83 modules, 0 violations. **Integrator's own defect**; the earlier narrowness check varied the *filename* but never the *path*. |
| **F2** | **Interceptor escapes.** `util.promisify(cp.execFile)` uses the `promisify.custom` hook captured from the original and never enters the Proxy trap; `ChildProcess.prototype.spawn` is unwrapped; and `spawn`/`spawnSync`/`execFile` with `{shell:true}` take a command line that `basename()` never matches. | **Reproduced:** `direct execFile: blocked` / `promisified execFile: NOT BLOCKED` / `ChildProcess.spawn: NOT BLOCKED`. `/review` measured the shell form separately. The comment *"Every call is checked before the native API"* is false. |
| **F3** | **Socket matching is basename-exact** (`docker.sock`), but the preflight accepts **any** socket path, so a daemon at `/tmp/engine.sock` is dialable from a test. | Codex probe reached an intercepted boundary without rejection. |
| **F4** | **Trailing whitespace breaks the pin invariant.** `unix:///tmp/review.sock ` is accepted and pinned **with** the space; Docker 29.6.2 **trims** and dials a different path — validate-one/execute-another, the exact class the pin exists to prevent. | Codex verified against the real CLI via both `--host` and `DOCKER_HOST`. |
| **F5** | **Silent-green test.** Deleting **both** `net.connect`/`net.createConnection` wrappers leaves all 23 tests green, because `net.Socket.prototype.connect` is separately wrapped and masks them — while two test names read as coverage for them. | `/review` mutation **S9** green; contrast **S4** (prototype wrap) → 1 red. Protection is not weakened today; the *test* is the defect. |
| **F6** | **B4's deferral lives only in a commit message.** Plan §5.2 still states the composed-EPERM test as required and §6 lists it under Acceptance A "Provable now"; the register's disposition still says ACCEPTED. | `grep -n "B4" docs/*.md` returns no deferral wording. Judgement was right; the record is wrong. Violates "each fact has ONE home". |

### P3 — raised in this round, dispositions after fix rounds 1-2
| Item | Disposition |
|---|---|
| Unknown-architecture fail-closed throw (`runner.ts`) had **no test** (mutation R6 green) | **CLOSED** — test added; deleting the throw now turns 2 tests red |
| `assertPinned` in `startComposedFixtures` is **unobservable** (R7 green) | **DECLARED, not closed** (intended) — commented as deliberately unobservable until slice 3 |
| **A2 and B5a not declared in the shipped code** | **CLOSED** — `endpoint.ts` (A2, incl. the U+FEFF restriction) and `preflight.ts` (B5a) |
| `exec.ts` has no production importer | **CLOSED** — labelled slice-3 scaffolding |
| Interceptor registered for **every** Vitest run including `npm run eval` | **NOT CLOSED, carried to slice 3** — and the broad Unix-socket rejection makes the required exclusion *larger*, not smaller |

### Round 2 (on `fb044d3..05f42c4`) — both channels, and fix round 2

| Channel | Verdict |
|---|---|
| Codex adversarial | **NEEDS-ATTENTION** — 1 P1 + 2 residuals |
| Fresh-context QA (**23 mutations**, tree verified clean) | **NEEDS-ATTENTION** — no P1, 3 P2, 5 P3 |

- **P1 — synchronous shell normalization bypassed the guard.** With `shell:true` Node **joins the args array into
  the command**, so inspecting `args[0]` saw a harmless `' '`; and **sync APIs never traverse
  `ChildProcess.prototype.spawn`**, so fix round 1's shared-downstream hook did not cover them. Codex reached real
  Docker output; the integrator reproduced both mechanisms in plain Node (Node's own DEP0190 warns on the shape).
  **CLOSED** — the joined command is validated for sync APIs, plus custom `options.shell`. Reverting the join turns
  two isolated tests red.
- **P2-1 — fix round 1 INTRODUCED a silent-green.** `cp.exec` calls the exported `execFile` with `shell:true`, so
  teaching that guard to route shell forms **masked** the `exec` wrapper: deleting `exec` went from red to green.
  Found independently by both channels. **CLOSED** — deleting only that wrapper is red again.
- **P2-2 — the gate exemption turned out to be unnecessary, so it was DELETED rather than narrowed.** Fix round 1's
  prototype guard made `syncBuiltinESMExports` redundant, and that call was the *only* reason a hole was punched in
  the repo-wide dependency gate. Codex took option (b): the call, its `node:module` import, and **every component of
  the exemption** (`TEST_HARNESS_LOADER_EXEMPTIONS`, `isTestHarnessLoaderFile`, `GATE_ROOT`, the `isTestHarness`
  term) are gone. The `node:module` prohibition applies to every file again with no carve-out. Verified by probe:
  the R2-2 computed-import + base64 payload is **still blocked** without it, so this did not trade a gate hole for
  a guard hole.
- **P2-3 — two live escapes now declared.** Same-process `worker_threads` realms and
  `process.binding('spawn_sync')`/`('process_wrap')` reach a daemon and were not covered by the header's declared
  limits. The header now names both and states the guard **is hygiene, not containment**. Comment only — the honest
  fix, not more code.
- **P3s closed:** the reject message no longer mislabels a non-Docker socket; `preflight.ts` documents why the
  resolved path is checked for edge whitespace only (realpath cannot emit dot segments, doubled or trailing
  slashes; Go's `url.Parse` fails closed on control characters and a bare `%`); U+FEFF is **adjudicated as a kept
  compatibility restriction** — JS `\s` includes it and Docker does not trim it, so the parser rejects a legal
  filename, declared in the A2 comment on the A2 precedent (fail closed, loud, trivially remediable).

### The broad Unix-socket rejection — adjudicated
Both channels examined it. It is **consistent with the contract**: plan §7 already says no test may "dial a socket",
and §4c's narrower Docker-specific wording is what F3 proved insufficient (the preflight accepts *any* socket path,
so a daemon at `/tmp/engine.sock` was dialable). It breaks nothing today — no `net.connect`/`createConnection` use
exists outside `testbed/docker/` — and **does not break slice 3**, whose control socket lives *inside* the container
behind a `docker exec -T` bridge, with no host-side dial to block. It is recorded as an **additional compatibility
restriction, not evidence of stronger Docker isolation**.

### Carried, not fixed
- **The pin certifies provenance, not filesystem truth.** `dockerPreflight` takes injected `realpath`/`stat`, so any
  harness module can mint a *genuine* pin for an arbitrary path. Inherent to the injected-seam design a Docker-free
  `make test` requires, and inside the locked threat model (harness trusted) — but it deserves one sentence of
  comment so a future reader does not over-read the pin.
- A4 (single explicit source trusted) and B5a stand as previously declared.

### Independently confirmed clean
Claim boundary: `git diff 783d0df..fb044d3 | grep -Ei '^\+.*(daemon|proxy|expos|other listen|forward)'` returns
**zero** added lines — nothing states or implies daemon non-exposure. Pin forgery: no route found by either channel
across Proxy, subclass + `super`, reflection clone, `setPrototypeOf`, `structuredClone`, direct constructor, or
module-namespace reflection. Context names become `sha256(name)`, so path traversal is impossible by construction;
`%` is rejected before slicing so `%2e%2e` never decodes; `{"__proto__":{...}}` fails closed under `Object.hasOwn`.
The `runner.ts` → `runnerExecution.ts` split is a verbatim move, and `vitest.config.ts` lost no test discovery
(66 test files at base → 72 at head).
