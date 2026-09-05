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
