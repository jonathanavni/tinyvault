# M5.2 slice 3 — review register (append-only)

Plan under review: `docs/m5-2-slice-3-plan.md`. Spec: `docs/m5-2-slice-spec.md` revision 4 (LOCKED). Registers are
append-only; corrections are appended, never edited in place (`.claude/memory/conventions.md`).

## C-U1 — pre-implementation round 1, Codex GPT-5.6 Sol (read-only `task`, 2026-09-05) — on plan revision 1 @ `ee23823`

**Status: STOP** — 10×P1, 6×P2, 3×P3. Parallel channel C-U1b below ran blind on the same packet; neither saw the
other's output before this register was written.

| # | Sev | Finding (Codex wording, condensed) | Disposition (integrator) |
|---|---|---|---|
| U1-1 | P1 | Acceptance E does not gate the *file*, *artifact* or *main-container-log* surfaces: the vocabulary has no `logs` or filesystem/export variant, so a secret written to `/tmp/secret`, an artifact or the fixture's Docker log stays green. | **ACCEPTED.** Plan §7 adds closed `logs` and `export` variants; §11 E gains rows for container file, Docker log and host artifact, each scan with a **planted-needle positive control** so a blind scanner is itself red. |
| U1-2 | P1 | Single-outstanding correlation makes the deletion-isolated duplicate-response test impossible (a duplicate after the response cleared is "unsolicited"; during the next request it is an old-id mismatch), and an unseen wrong id is not one of the eleven close conditions. | **ACCEPTED.** §4 tracks lifetime-seen response ids: `unsolicited` / `duplicate-id` / `id-mismatch` are distinct codes with non-overlapping branches; §11 I lists each. |
| U1-3 | P1 | Adding container modules to the path-wide `docker-invocation.mjs` allowlist lets them import every gated capability including `child_process`; a dormant conditional `spawn('docker')` there passes the static gate and never executes under the runtime one. | **ACCEPTED.** §9: the allowlist becomes a per-path **capability map** (`exec.ts` → `child_process` only; container modules → `net`/`http`); self-test mutant added. |
| U1-4 | P1 | `JSON.parse` removes YAML divergence, not Compose semantics: `include`, `extends`, profiles and unknown keys can pull in ports or mounts the lint never sees. | **ACCEPTED.** §8 decision L2: closed schema at every level; `include`/`extends`/unknown keys rejected by construction and each also a named rule with its own mutant. |
| U1-5 | P1 | Dynamic C matrix omits container IPs and the evaluated-agent case; its extra-port mutant fails earlier at lint/inspect, so the probe is never proven able to detect anything. | **ACCEPTED, agent leg scoped.** §11 C adds container IPs from inspect and a supervised `browser_navigate` leg (the frozen tool surface has no other network primitive — stated). The dynamic mutant runs from a Docker-suite-only Compose override that bypasses the repo-file lint and inspect, so the probe must detect the extra port itself. |
| U1-6 | P1 | `compose up --no-build` reuses an existing matching container; exact-one resolution plus labels/image does not prove *this invocation* created it. Same-image/same-label stale container satisfies steps 4–5. | **ACCEPTED.** §3 adds a pre-up `compose ps -aq` absence check (`project-not-fresh`), `.Created ≥ epoch`, and the standard Compose labels; §11 G adds the same-image stale-container mutant (unit and integrator). |
| U1-7 | P1 | `--wait` without `--wait-timeout` can hang; the plan's "wait timeout" mutant has no bounded production argv to exercise. | **ACCEPTED** (also C-U1b-2). Finite constant `--wait-timeout <N>`, pinned healthcheck timings, argv pinned in tests, `container-unhealthy` code. |
| U1-8 | P1 | Job B's unreachable-origin test implies a real HTTP dial → not sandbox-feasible and a new dial on `make test`. | **ACCEPTED** (also C-U1b). `probeOrigin` injected; real `fetch` only in the Docker suite. |
| U1-9 | P1 | Scanning one normal execution for expected frames does not kill a dormant second stdout write site. | **ACCEPTED, reframed.** The exec'd *bridge process* is the only stdout writer that matters (the fixture process's stdout is `docker logs`, an E surface, not a bridge surface). §4: structural one-writer rule on `container/bridge.ts`, statically scanned with a self-test mutant that adds a second `process.stdout.write` site. |
| U1-10 | P1 | The in-band config test pins the config object, not the `package.json`/Makefile entry point; pointing `test` at the Docker config would stop that test being discovered. | **ACCEPTED** (also C-U1b-6). §9: external pre-Vitest gate `scripts/check-test-entry.mjs`, self-tested, first in `test`. |
| U1-11 | P2 | B4 is re-labelled, not resolved: T1 runs `startLoginFixture` inside the container, which reaches `listen()` and converts EPERM to `no-socket` (`loginFixture.ts:114-128`). | **ACCEPTED — revision 1's reframing withdrawn.** §10: the substitution becomes in-process-only via the T3 seam (`onListenPermissionError`), the container entry fails hard, and B4's original deletion-isolated EPERM test is restored. The origin probe stays as a second protection. |
| U1-12 | P2 | R2-4 is re-labelled: deleting the assertion on a pristine vocabulary is equivalent, but mutating a real variant to emit `--host` is not. | **ACCEPTED.** §7: R2-4 is gated by the integrator's production-builder mutation pass and recorded with the variant and the red; "equivalent mutant" wording removed. |
| U1-13 | P2 | The ordering rule does not say the container serializes handling; coalesced `bootstrap`+`hello` could both dispatch before the first response. | **ACCEPTED.** §4 `inFlight` state, `pipelined` closes, coalesced-frame test. |
| U1-14 | P2 | "A bounded pre-handshake connect retry is indistinguishable from rebinding" is false; same-id retry before secret delivery rebinds nothing. | **ACCEPTED — wording corrected.** One connect kept as the fail-fast choice, justified by the healthcheck's socket-existence probe and `--wait-timeout`. |
| U1-15 | P2 | Inspect omits health, standard Compose labels, hostname↔id, user, privilege/PID/IPC/device/capability fields, network membership. | **ACCEPTED** (also C-U1b P3). §3 step 6 lists every field with its own code and deletion mutant; stated as trusted-boundary hygiene. |
| U1-16 | P2 | The `**/*.docker.test.ts` glob is a suffix-based opt-out from the default suite. | **ACCEPTED** (also C-U1b-6). Exact single-file include/exclude; the entry gate rejects any other `*.docker.test.ts` in the tree. |
| U1-17 | P3 | `testbed/docker/.dockerignore` will not filter a repo-root build context. | **ACCEPTED.** Repo-root `.dockerignore`. |
| U1-18 | P3 | T5's rationale wrongly says the package lacks `"type": "module"` (`package.json:5`); add `package-lock.json` to the owned set. | **ACCEPTED** (also C-U1b P3). Rationale corrected to extensionless imports; lockfile owned by Job C. |
| U1-19 | P3 | Job B too broad and secretly socket-dependent; split. | **ACCEPTED** (also C-U1b P3). Jobs B1/B2. |

*Codex's "mutants that stay green" list (14 items) maps onto the rows above; each named mutant now has a row in
plan §11 or a rule in §8/§9.* Its F7 answer: **no plan sentence claims daemon non-exposure or post-compromise
containment** — independently confirmed by C-U1b.

## C-U1b — pre-implementation round 1, fresh-context Claude reviewer (read-only, 2026-09-05) — on plan revision 1 @ `ee23823`

**Status: NEEDS-ATTENTION** — 0×P1, 7×P2, ~14×P3. Ran blind in parallel with C-U1.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| U1b-1 | P2 | `docker exec -T -i <id>` is not a valid CLI invocation: plain `docker exec` has `-i`/`-t` only; `-T` belongs to `docker compose exec`, which takes a service selector (forbidden by G). Would burn Job C's single integrator fix cycle. | **ACCEPTED, verified on this host** (`docker exec --help`, Docker 29.6.2). Argv is `exec -i <id> node /app/bridge.mjs`; the plan title notes the spec's `-T` shorthand. |
| U1b-2 | P2 | `--wait` unbounded. | **ACCEPTED** (= U1-7). |
| U1b-3 | P2 | "Duplicate keys → malformed" not implementable with `JSON.parse`; value types unspecified. | **ACCEPTED.** §4: canonical encoding equality (`payload === JSON.stringify(parsed)` in schema key order), fatal UTF-8 decode, explicit value-type rules; each an I mutant. |
| U1b-4 | P2 | A request timeout should close the bridge, not only reject the late response. | **ACCEPTED.** `bridge-timeout` closes the bridge. |
| U1b-5 | P2 | Lint self-test covers 8 of ~14 rules; add `hostname`/`container_name`/`domainname`/`build.args` rules. | **ACCEPTED** (with U1-4). Table-driven self-test, one mutant per rule asserting the rule code; the table is checked against the rule list. |
| U1b-6 | P2 | Rename-to-hide: a test named `*.docker.test.ts` outside `testbed/` runs nowhere; the config test stays green. | **ACCEPTED** (with U1-10/U1-16). |
| U1b-7 | P2 | No named mutant for a *partial* `FixtureSet` when the last service fails. | **ACCEPTED.** §11 A: fail at service index 2 → no set, both bridges killed, one `compose-down`. |
| U1b P3s | P3 | T5 rationale false; bundle graph reaches `src/agents/stub` via `scenarios/benignLogin`; image naming (one `build`, two `image`); `inspect` returns an array; Ed25519-SPKI check, 32-byte checks, container cross-check of `epoch`/`fixtureId`, unknown-`op` behaviour; explicit `kind` rules; B4/B5a header labels; secret zeroing best-effort in JS; inject the probe; `.env` beside the Compose file; F7 soft scoping notes; split Job B. | **ALL ACCEPTED** and absorbed in revision 2 (§2, §3, §4, §5, §6, §7, §10, §11, §13). |

## Adjudications (integrator, 2026-09-05)

- **Two channels, disjoint strengths, same conclusion.** Codex attacked the *gating* (which mutants stay green) and
  found the E-surface and correlation-branch gaps; Claude attacked *feasibility* and found the two defects that
  would have failed on the integrator's first Docker run (`exec -T`, unbounded `--wait`). Both independently
  confirmed the claim boundary is intact and that nothing lands Docker on the `make test` path.
- **Two revision-1 dispositions were re-labellings and are withdrawn**: B4 (the substitution *is* reachable inside
  the container) and R2-4 (a real variant can now be mutated). Recorded here so the register, not the plan's
  history, carries the correction.
- **Round 2** runs on revision 2 as an absorption sweep plus a bypass hunt on the new mechanisms (closed-schema lint,
  per-capability map, entry-point gate, seen-id correlation, pre-up absence check). Cap: round 3 is the last paper
  round (`docs/handoff-pattern.md` §5).

## C-U2 — pre-implementation round 2, Codex GPT-5.6 Sol (read-only `task`, 2026-09-05) — on plan revision 2 @ `3298262`

**Status: STOP** — 8×P1, 4×P2, 1×P3. Absorption sweep: 19 of 26 rows ABSORBED, 7 PARTIAL (U1-1, U1-3, U1-9, U1-10,
U1-11, U1b-3, U1b-5), none MISSING. Parallel blind channel C-U2b below.

| # | Sev | Finding (condensed) | Disposition |
|---|---|---|---|
| U2-1 | P1 | `payload === JSON.stringify(JSON.parse(payload))` accepts reordered keys — parsing preserves insertion order; the reordered-key I mutant stays green. | **ACCEPTED.** §4: rebuild a fresh object in schema key order, compare its serialization. |
| U2-2 | P1 | Capability map does not close `make test`: `.cjs` test files are outside the scanner's extensions and the Docker inventory; `spawnSync('/usr/bin/env',['docker'])` passes the runtime guard (executable is `env`). | **ACCEPTED, with the claim narrowed.** §9: all Node extensions scanned; inventory uses Vitest's real include glob; the interceptor gains the `env` case; **wrapper launchers in general are declared outside the guard** in its header — a third scan is not added. |
| U2-3 | P1 | The token gate does not pin shell control flow or prove execution: `check && exit 0; vitest …` is green with no tests run. | **ACCEPTED.** §9: the gate becomes an **exact grammar** (`&&`-only, exact ordered command list, no prerequisites) plus an **execution proof** (JSON reporter inventory must equal the discovered set, zero skipped bar the eval-gated test). |
| U2-4 | P1 | One-writer rule is a blocklist; an aliased `node:process` stdout writer is invisible. | **ACCEPTED, mechanism changed.** §4: **runtime tripwire** on `process.stdout.write`/`console.*` (bound original used by the pipe; any other writer exits non-zero when it executes); static side narrowed to an exact import list for `bridge.ts`; fd-level writes declared outside hygiene. |
| U2-5 | P1 | B4 test vacuous with a plain `{code:'EPERM'}` — `isNodeError` requires `instanceof Error`, so both versions throw before the branch. | **ACCEPTED.** §10: inject `Object.assign(new Error, {code:'EPERM'})`; paired in-process positive. |
| U2-6 | P1 | E misses the exec process's real stderr (`docker logs` is PID 1 only). | **ACCEPTED.** §11 E row: host consumes `spawnLongLived.stderr` (bounded) and scans it, with its own sentinel. |
| U2-7 | P1 | Positive controls do not isolate surfaces (`TV_FIXTURE_ID` proves one inspect location; a boot banner does not detect later truncation; one marker does not prove traversal or chunk matching). | **ACCEPTED.** §11 E: one marker per independently scanned surface, hex and decimal-array plants, shutdown banner, straddling marker, `history --no-trunc`. |
| U2-8 | P1 | U1b-5 internally unabsorbed: §11 C still said "eight self-test mutants". | **ACCEPTED** — drift fixed; rule-list equality in both directions. |
| U2-9 | P2 | L2 closes keys but not values (`user:"0"`, `read_only:false`, `healthcheck.test:["CMD","true"]`). | **ACCEPTED** (with C-U2b P2-3). §8 pins values, the exact healthcheck command, labels, environment values and every `${…}` reference. |
| U2-10 | P2 | Correlation order-dependent; seen-set unbounded. | **ACCEPTED** (with C-U2b P2-4). §4: ordered high-water-mark classification with per-branch test inputs and an order-swap test. |
| U2-11 | P2 | Cleanup covers established bridges, not the one spawned for the failing service; `compose down` should not run when the pre-up absence check fails. | **ACCEPTED.** §3: handle registry populated at spawn, whole registry killed; no teardown on `project-not-fresh`. |
| U2-12 | P2 | Bodies not closed schemas; `containerId` not required 64-hex; SPKI with trailing garbage still reports `ed25519`. | **ACCEPTED.** §5: closed body schemas, 64-hex id, base64url round-trip, SPKI re-export byte equality, `mac-shape`. |
| U2-13 | P3 | Step references and code accounting inconsistent. | **ACCEPTED.** §3 step 6 is one field→predicate→code→mutant table; references renumbered. |

Codex's residual-risk note is recorded as confirmation: **no extra-port or mount bypass via anchors, `x-` fields,
profiles, `COMPOSE_FILE` or `COMPOSE_ENV_FILES`** was found against the closed schema (probe: explicit `-f` and
`--env-file /dev/null` win over those variables on this host), and **no same-image/same-label stale container
survives the pre-up absence check plus the step-6 table** under the locked assumption.

## C-U2b — pre-implementation round 2, fresh-context Claude reviewer (read-only, 2026-09-05) — on plan revision 2 @ `3298262`

**Status: NEEDS-ATTENTION** — 1×P1, 4×P2, 12×P3. Absorption sweep: all rows ABSORBED except U1-2 PARTIAL (the
"non-overlapping" claim was untrue as worded) and one U1b P3 (code header labels for B4/B5a). Verified on this
host: JSON piped to `compose -f - config` accepted; `${…}` interpolated from the **process** environment under
`--env-file /dev/null`; `dockerfile_inline` and an `x-` service key accepted by Compose; a duplicate JSON key
**rejected** by Compose's YAML parser (fail-closed direction).

| # | Sev | Finding (condensed) | Disposition |
|---|---|---|---|
| U2b-P1-1 | P1 | The entry gate misses npm `pre`/`post` lifecycle scripts, Makefile prerequisites, Vitest `projects`/`--root`/`--dir`, extra config files and the exact `--exclude` tokens — a guard-less Docker run on `make test` with all N gates green. | **ACCEPTED** (with U2-3). §9 grammar gate: no `pre*`/`post*`, exact command list, no Makefile prerequisites, exactly two config files, no `projects`/`root`/`dir`, exact excludes. |
| U2b-P2-1 | P2 | Controls are ASCII substrings; a `Buffer` logs as hex or a decimal array; `docker history` truncates by default and has no needle. | **ACCEPTED** (with U2-7). Existing leak decoders run against the 32 raw bytes; `history --no-trunc` with a `LABEL` needle. |
| U2b-P2-2 | P2 | Scan window ends at the handshake; shutdown paths unscanned; controls planted at boot. | **ACCEPTED.** §11 E: kill bridge → scans → `compose down`; SIGTERM shutdown banner; post-`close()` artifact scan. |
| U2b-P2-3 | P2 | Interpolation from process env under `--env-file /dev/null` (verified); slice-2 env builder is pass-through; `COMPOSE_*` pass-through can put status text on stdout. | **ACCEPTED.** §7: allowlisted child environment, `--progress quiet --ansi never`; §8: `${…}` set and positions pinned; §7 sentence corrected. |
| U2b-P2-4 | P2 | `unsolicited` and `duplicate-id` predicates overlap; order unstated. | **ACCEPTED** (= U2-10). The register's U1-2 row said "non-overlapping"; **correction appended here, not edited**: it became true only with revision 3's stated order and per-branch inputs. |
| U2b-P3s | P3 | Dockerfile lint (`VOLUME`, `USER`, `EXPOSE`, `ENV TV_*`); nested allowlists incl. `dockerfile_inline`; override launch mechanics and a capability entry for the Docker suite; `Created` clock tolerance and `--type container`; verifier field-list export; `mac-shape`/`secret-shape`, base64url canonical; text-shaped one-writer scan (`fs.writeSync(1)`); `tls`/`http2` in the static list; Docker-suite execution gate; bounded stderr capture, SIGKILL, bounded `down`, `--rmi local`; lookalike EPERM branch equivalent → one bind site; F wording; PLAN.md "Next session" should say `exec -i`. | **ALL ACCEPTED** and absorbed in revision 3 (§2 T3, §3, §4, §5, §7, §8, §9, §11, §12); the PLAN.md wording lands at wrapup. |

## Adjudications (integrator, 2026-09-05, after round 2)

- **The static-scan class was beaten twice** (allowlist, one-writer scan, token gate), each time by a spelling the
  scan did not know — the C-S1 shape. Revision 3 **narrows the claim** rather than adding a fourth scan: runtime
  tripwires primary, static scans declared partial, `make test` pinned by an exact grammar plus an execution
  proof. Recorded so round 3 reviews the narrowed claim, not a stronger one.
- **Two channels again converged on disjoint evidence**: Codex found the reorder-blind canonical check and the
  `instanceof Error` vacuity; Claude verified interpolation from the process environment and the lifecycle-script
  hole on this host. Both confirmed no sentence exceeds the locked §D2 claim.
- **Round 3 is the last paper round** (`docs/handoff-pattern.md` §5 cap). Its P1 criteria are stated in its packet:
  an acceptance mutant that stays green, a claim beyond the locked spec, a Docker/`make test` breach, or a round-1/2
  finding claimed absorbed but not. Anything else is absorbed or carried by name into the implementation review.

## C-U3 — pre-implementation round 3 (the last under the cap), Codex GPT-5.6 Sol (read-only `task`, 2026-09-05) — on plan revision 3 @ `e40a327`

**Status: STOP** — 10×P1, 3×P2, 1×P3. Absorption sweep over rounds 1–2: 26 ABSORBED, 12 PARTIAL, 1 MISSING
(U2b-P2-2: the shutdown banner was scanned before `compose down` delivered SIGTERM). Parallel blind channel C-U3b
below. Both channels again confirmed **no sentence exceeds the locked §D2 claim** and **no paper path returns a
`no-socket` composed transport**.

| # | Sev | Finding (condensed) | Disposition |
|---|---|---|---|
| U3-1 | P1 | `vitest.config.ts` is executable: a `globalSetup` runs outside the setup-file interceptor and `process.getBuiltinModule` needs no import the capability map sees; a `globalSetup` teardown can overwrite the JSON report. `include: []` + `passWithNoTests` makes the inventory equality vacuous. | **ABSORBED BY DECLARATION + PIN** (revision 4 §9). Third round on the same invariant class → the claim is narrowed: gates catch Docker reach from *code modules*; the entry-point files are the **reviewed root of trust, hash-pinned in-suite**; `globalSetup`/`include`/`passWithNoTests`/`reporters`/`outputFile` are forbidden keys in the grammar gate; the proof deletes report paths first and checks mtime. Not a new mechanism. |
| U3-2 | P1 | Makefile parse-time `$(shell docker …)` runs before any recipe; an in-recipe gate cannot establish the property. (Unverified in the sandbox — `make` denied a temp file.) | **ABSORBED BY DECLARATION + PIN.** Makefile hash-pinned; "no prerequisites, one recipe line"; parse-time execution declared outside the gates, in the guard's header. §14 item 16 carries the check that the declaration is where it says. |
| U3-3 | P1 | One "main" JSON report cannot equal the whole inventory while the two timing files run in separate serial invocations. | **ACCEPTED** (= C-U3b P2-4). §9: one report per invocation, disjoint partitions, union = inventory; `runner.artifacts.test.ts` pins amended. |
| U3-4 | P1 | The existing decoder inventory has no hex form (verified: neither contiguous hex nor `<Buffer 4a 5b …>` matched); the plan's own `console.error(buffer)` mutant stays green. | **ACCEPTED** (= C-U3b P2-5). §11 E: a slice-3-local byte-native `secretScan` with contiguous-hex, Buffer-inspect, decimal-array and base64url forms, proven with the real bytes per form; `leakDecoders.ts` untouched. |
| U3-5 | P1 | Logs scanned before `compose down` sends SIGTERM; the shutdown banner cannot be observed. | **ACCEPTED** (= C-U3b P2-6). §3/§7/§11: `compose-stop` (bounded) → scans → `down`. |
| U3-6 | P1 | The artifact control (epoch in the manifest) passes a walker that reads only the manifest. | **ACCEPTED.** §11 E: dedicated nested marker written last by `close()`; traversal mutants. |
| U3-7 | P1 | Idle duplicate classified `unsolicited`; id `0` accepted. | **ACCEPTED.** §4: `id ≥ 1` schema rule; `completedHighWater`; `id ≤ completedHighWater` is `duplicate-id` idle or not; order-swap test. |
| U3-8 | P1 | §11 A required `compose down` on `project-not-fresh`, contradicting §3. | **ACCEPTED.** Row split: zero teardown calls on `project-not-fresh`. |
| U3-9 | P1 | Vocabulary omitted `--type container`, the `--rmi local` argv, and full image config for `Cmd`/`Entrypoint`. | **ACCEPTED, with one decision.** Typed `inspect`; full-JSON `image-inspect`; **image name fixed to `tinyvault-fixture:local`, no `--rmi`** (a per-project tag either leaks images or forces a rebuild per eval); `compose-stop` added; every `run()` bounded. |
| U3-10 | P1 | The lint permitted `${…}` only in `image`/`labels` while §5 requires `TV_EVAL_EPOCH` in the container environment. | **ACCEPTED.** §8: `${TV_EVAL_EPOCH}` at exactly the `environment` and `labels` positions; `${TV_PROJECT}` removed entirely; any other `$` rejected. |
| U3-11 | P2 | `process.stdout.end`, `_write`, prototype-dispatched `write` bypass an instance patch (verified). | **ACCEPTED** (= C-U3b P2-2). §4: `end` patched too; prototype dispatch, `net.Socket({fd:1})` and raw fd declared outside the tripwire, Docker-suite exact-frames the only signal there. |
| U3-12 | P2 | First-close kills one bridge; a failed `down` leaves the other two exec processes. | **ACCEPTED.** §3/§6: one idempotent project closer kills the whole registry first. |
| U3-13 | P2 | Close atomicity unspecified (outstanding, mutex waiters, buffered frames). | **ACCEPTED.** §4: atomic close, waiters drained `bridge-closed`, decoder stopped; queued-second-call test. |
| U3-14 | P3 | §15 still said "lifetime seen-id set". | **ACCEPTED** — §15 replaced by the lock record. |

## C-U3b — pre-implementation round 3, fresh-context Claude reviewer (read-only, 2026-09-05) — on plan revision 3 @ `e40a327`

**Status: NEEDS-ATTENTION** — 1×P1, 7×P2, 11×P3, 4 drift. Verified on this host (Node 24.19.0, Vitest 4.1.11, Docker
29.6.2): `console.*` all pass through the instance `write`; `end(chunk)`, `Writable.prototype.write.call` and
`net.Socket({fd:1})` do not; `configDefaults.exclude` is replaced by a config `exclude` array; CLI `--exclude` is
additive; `docker history` truncates by default; `vitest list --filesOnly --json` exists.

| # | Sev | Finding (condensed) | Disposition |
|---|---|---|---|
| U3b-P1 | P1 | Plain-`node` gate scripts of `test` run outside the interceptor; `check-acceptance-j-results.mjs` is legitimately allowlisted for `child_process`, so a conditional `spawnSync('docker')` there is green under every signal — the spec-named N mutant. Not declared anywhere. | **ACCEPTED** (no new mechanism). §9: exactly one `scripts/` file may import `child_process`, its single spawn site allowlisted to the literal `process.execPath`; the new gate scripts read reports rather than spawn; declared in the guard's header. |
| U3b-P2-1 | P2 | `read_only: true` makes the container unstartable (socket and capture dir on the rootfs); `tmpfs` would violate the empty-`Mounts` row. | **ACCEPTED.** `read_only` dropped (hygiene on a trusted boundary). |
| U3b-P2-2 | P2 | Tripwire claim wider than the mechanism; `node:net` (allowed import) can write fd 1. | **ACCEPTED** (= U3-11). |
| U3b-P2-3 | P2 | Execution proof cannot be green against the three-invocation script; `runner.artifacts.test.ts:96-107` pins go red when reporter flags are added. | **ACCEPTED** (= U3-3). |
| U3b-P2-4 | P2 | Hex marker planted as contiguous hex passes while `util.inspect(buffer)` output is missed. | **ACCEPTED** (= U3-4). Markers planted as `util.inspect` and `JSON.stringify` output. |
| U3b-P2-5 | P2 | Shutdown banner scanned before SIGTERM; banners must be on stderr because `main.mjs` carries the tripwire. | **ACCEPTED** (= U3-5); stderr stated. |
| U3b-P2-6 | P2 | A config `exclude` array replaces Vitest's defaults; a hand-rolled inventory glob can drift from Vitest's. | **ACCEPTED, partly by declaration.** `exclude` pinned by value including `configDefaults.exclude`; `include` forbidden so the default pattern applies; the inventory uses a hard-coded copy of that pattern (a `vitest list` spawn would need a `child_process` entry the U3b-P1 rule forbids) — declared. |
| U3b-P3s | P3 | In-suite pin of the `test` script constant; stale reporter; skip exception by full name; files-not-tests limit; `EXPOSE` `null` entries; full check order; braceless `$VAR`; bounded `run()`; `exitCode = 1`; image `Config.Env` marker; straddling marker in a unit test; B5a code mapping. | **ALL ACCEPTED**: absorbed in revision 4 (§2, §3, §4, §8, §9, §10, §11) except three **carried by name** into the implementation review (§14 items 12–14: bounded short-lived handles, the files-not-tests header, the synthetic-stream overlap test). |

## Adjudication and lock (continuity owner, 2026-09-05)

- **The cap is spent; revision 4 is LOCKED.** Round 3's findings were narrower and more implementation-level than
  round 2's (argv flags, scan order, code mappings, a contradiction between two sections) — the "productive
  convergence" signature of `docs/handoff-pattern.md` §5, not the "findings get harder" signature of a wrong
  primitive. Both channels independently confirmed the §D2 boundary intact for the third time.
- **The same invariant class was beaten three rounds running — the `make test` entry point — and the conventions'
  prescription was applied: narrow the claim.** Revision 4 states Acceptance N as what a repository can enforce
  (Docker reach from code modules) and moves the entry-point files to a declared, hash-pinned root of trust. This is
  a weaker claim than revision 3 made and a truer one; it does not touch a locked spec decision and needs no new
  mechanism, so it did not require a return to the user. **Recorded here so the implementation review checks the
  declaration, not a stronger sentence.**
- **One decision taken with a stated alternative:** a fixed image name (`tinyvault-fixture:local`) over a
  per-project tag, because the alternative either accumulates an image per eval or forces `--rmi` and a rebuild
  every run; identity comes from the recorded image id, not the tag.
- **Carried into the implementation review by name:** plan §14 items 1–16.
- **Implementation proceeds** on `codex/m5-2-slice-3` (worktree `../tinyvault-slice3`), Jobs A → B1 → B2 → C,
  GPT-6 Astra, one worktree, sequential (the companion does not serialize writes). Integrator runs every gate.

## Implementation log — integrator entries (append-only)

- **2026-09-05 — Job A (protocol core) committed `1310a7f`** on `codex/m5-2-slice-3`. Astra stopped once on a genuine
  §4/§5-vs-§11 wording conflict (adjudicated: the check order wins; `id: 2.0` → `frame-canonical`, missing `mac` →
  `body-shape`) and completed on re-dispatch. Integrator-verified: tsc clean; `testbed/docker` 286 tests; invocation
  gate PASS; **`make test` 1284 + 5 + 10, exit 0** in the worktree. Codex-reported 70/70 mutation reds (not
  independently re-run; the post-impl QA channel re-mutates).
- **2026-09-05 — Job B1 (executor, orchestration, composed transport, secretScan): plan amendment.** B1 stopped a
  second time on a real gap I left: §11 E requires a `docker history --no-trunc` scan but §7's closed vocabulary had
  no `history` variant, and the packet forbade widening the vocabulary unilaterally. **Continuity-owner amendment to
  the locked revision 4:** `image-history` added to the §7 table (bounded, typed to the recorded image id). Recorded
  here and in the plan row. The first B1 stop (creation-vs-unhealthy on a non-zero `compose up`) was adjudicated as a
  post-hoc `compose-ps-all` query, both codes terminal reds. B1's other verification: tsc clean; 483 targeted tests
  across 22 files; both gates PASS; Codex-reported 47 mutation reds including the **R2-4 production `--host`/`-H`
  builder mutation rejected before the runner** (2 reds) — the disposition §7 promised.
- **Process observation, recorded as a gotcha:** the first B1 job used subagents whose edits landed in the worktree
  *after* its main thread reported completion; two later dispatches saw "another writer". No foreign process
  existed. A quiescence check (no file newer than a marker for 60 s) now precedes every dispatch and every
  integrator verification run.
- **2026-09-05 — Job B1-b committed `d3cd3a0`** (`image-history` variant + E history scan; `make test` 1448 + 5 + 10,
  exit 0). **Job B2 stopped on a revision-4 contradiction:** the step-6 table required `com.tinyvault.project` =
  project name while §8 forbids `${TV_PROJECT}` interpolation, so no static Compose file can satisfy both.
  **Resolved by removing the redundant custom label** — Compose's own `com.docker.compose.project` label carries the
  same value and stays verified (`label-compose-project`). Integrator carve-out (four one-line removals in B1's
  verifier, its test table, the testkit and the code enum; `docs/handoff-pattern.md` §4 "mechanically absorbing
  review findings"), verified by tsc + the `testbed/docker` suite before commit. Plan §3 amended.
- **2026-09-05 — Job B2 stopped twice more, both correctly, on contract facts revision 4 got wrong.** (1) A plain-Node
  lint cannot import `compose.ts` (TypeScript parameter properties are not strippable; extensionless imports do not
  resolve) — **resolved by `testbed/docker/topology.json`** as the single constants home read by both sides (plan §12
  row added; B2 authorized to make the narrow `compose.ts` edit). (2) §9's "exactly one `scripts/` file may import
  `child_process`" was false: the two dependency-boundary self-tests and the docker-invocation self-test already spawn
  Node to prove reds — **resolved by pinning the measured set of four and every spawn site's `process.execPath`
  first argument** (plan §9 amended). Lesson for the register: three of the four revision-4 sentences B2 tripped on
  were written without measuring the tree; the paper rounds did not catch them because they were about the
  *implementation's* environment, not the design. Carried to `.claude/memory/conventions.md` at wrapup.
- **2026-09-05 — B2 stop #4 (ownership, not contract):** slice 2's R2-2 regression (`exec.test.ts:92`) deliberately
  contains `import('node:' + 'child_process')` to prove the runtime interceptor catches an obfuscated spawn; the new
  capability gate must reject computed imports in gated directories. **Resolved:** the probe moves into the file's
  existing `guardProbe` subprocess fixture as generated source, so the computed import is still *executed* under the
  interceptor and still asserted rejected, while no checked-in file carries the literal. B2 authorized to make that
  narrow edit. **Dispatch rule widened:** an ownership-only conflict that a §8/§9 rule forces is handled by the
  minimal edit preserving the file's assertions and reported as a deviation; STOP is reserved for contracts that
  cannot be met.
- **2026-09-05 — Job B2 committed `965c568`** after five dispatches (four correct stops, all adjudicated above).
  Integrator-verified: the **new `make test` chain green end to end** — entry gate → tsc → boundary gate + selftest →
  invocation gate + selftest (8 rules) → compose lint + selftest (58 rules) → acceptance-J → three Vitest
  invocations with JSON reports (1477 + 5 + 10 passed, 1 pinned skip) → **execution proof PASS**. B2's deviations were
  all authorized ones; two worth carrying: `tsc --noEmit` stays second in the chain (existing negative compile
  assertions depend on it), and the new gate CLIs accept `--root` for their real-CLI self-tests while the pinned
  grammar forbids `--root` in the actual `test` command. Job C dispatched with B2's Compose file, Dockerfile and
  topology as inherited inputs.

