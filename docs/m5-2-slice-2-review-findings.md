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
| B4 | P2 | **Composed identity and the EPERM boundary lack a deletion-isolated proof.** `FixtureStarter` may return any self-labelled transport; capture checks only HTTP reachability. §6 names no mutant that deletes the composed-mode EPERM guard, so an unconditional slice-2 `ComposedTransportUnavailableError` test could stay **green**. | **ACCEPTED** — production-path EPERM test whose guard-deletion mutant must kill it. |
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
