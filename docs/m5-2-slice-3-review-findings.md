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
