# M5.2 implementation plan — commit order, ownership, and the criteria each commit must satisfy

Contract: `docs/m5-2-slice-spec.md` **revision 4, LOCKED**. Register: `docs/m5-2-review-findings.md`.
This plan sequences the work; it does not add or reinterpret decisions. If implementation shows a locked decision
needs a new mechanism, or a claim stronger than the deployment assumption supports, **stop and return to the user**.

## Ownership

Security-core surface (`CLAUDE.md`: the control plane, the bridge, the capability model), so the ladder in
`docs/handoff-pattern.md` §4 applies with the security third channel (§7.1). **Codex implements on
`codex/m5-2-<slice>` branches and leaves work uncommitted; the integrator commits with explicit paths and runs
`make test` — never taking a reported test count or a `failed` status at face value.** Claude does not implement the
invariant-enforcing code in parallel; that would collapse the cross-model coverage the ladder exists to provide.

Post-implementation rounds are capped at three per commit, and the last round's packet states its P1 criteria up
front.

## Commit order

Each commit is independently green: `make test` passes, and the criteria listed are gated by tests in that same
commit. Docker enters at commit 3 and never on the `make test` path.

| # | Slice | Spec | Acceptance gated |
|---|---|---|---|
| 1 | **Transport seam + the two field meanings + the frozen agent allowlist.** `FixtureTransport` interface; the in-process implementation refactored behind it with behaviour unchanged; `transport` split into *architecture* (in-process / composed) and *reachability* (http / no-socket), with `assertHttpFixture` updated to the right one. The §D8 allowlist assertion lands here because it is independent and freezes a boundary before anything else moves. | §D1, §D8 | **J**, **N** |
| 2 | **Daemon-channel preflight and fail-closed construction.** Effective-endpoint resolution across `DOCKER_HOST` / `DOCKER_CONTEXT` / active context; canonical local `unix://` validation (absolute-path syntax, `unix://` vs `unix:///`, `realpath`/symlink, socket-type check, proxy rejection — the C-R7 P2 the spec leaves to implementation); ambiguity is rejection; **pinning**; placement between `runner.ts:118` and `:119`; composed construction fails closed for every failure class. No containers yet — the preflight is testable on its own. | §D5.0, §D5 | **A**, **B** |
| 3 | **Container, Compose, and the bridge.** Dockerfile + Compose (one container per fixture, only page origins published, internal control socket); harness-controlled creation under a fresh project and epoch; exact-one-container resolution; recorded immutable id; label and image-identity verification; `docker exec -T` against that id; framing; stdin bootstrap delivery; challenge/injective MAC. The static Compose lint lands here. | §D2, §D2.1 | **C** (lint + probe matrix), **E**, **G**, **I** |
| 4 | **Control protocol, capabilities, capture transfer.** The five administrative operations; per-operation capabilities with CSPRNG ≥128-bit entropy, epoch binding, explicit maximum expiry, single use, restart invalidation; idempotent receipt read plus acknowledgement; capture transfer over the transport with harness-side persistence into the path `offline.ts:244-267` expects; no shared mounts. | §D3, §D7 | **D**, **F**, **H**, **M** |
| 5 | **Attestation.** Fixture-control-only, capability-scoped, bounded, single-use after finalization; domain-separated signed transcripts for **both** receipt and attestation, with the independent prefix-removal mutants asserting exact preimages. | §D4 | **L** |
| 6 | **Parity gate, claim closure, docs.** The normalizer and the two-transport comparison; the behaviour-to-claim table with each row linked to a test that dies under that row's claim-breaking mutant; the `SCHEMA.md` amendment; the scorecard's deployment-assumption line and the invalid-run reporting path. | §D6, deployment requirement | **K**, **O**, **P** |

## Standing constraints for every slice

- **`make test` stays Docker-free**, verified by a literal clean clone at the end of commit 1 and again at merge —
  `git clone` into a temp dir, `npm ci`, `make browsers`, `make test`. The dependency-boundary check, a scan for
  conditional `spawn("docker")` / shell invocation / daemon-socket access, and the clone are three distinct gates;
  none substitutes for another.
- **No wording anywhere** — code comment, test name, `SCHEMA.md`, scorecard, README — may present the §D5.0
  preflight as proof of daemon non-exposure (Acceptance O's mutant).
- **No criterion may test containment after fixture-process compromise.** That is outside the locked threat model;
  a test that appears to is a defect, and it is the mistake revision 4 had to correct once already.
- Codex cannot commit, usually cannot run browser tests, and cannot bind sockets in its sandbox — so its
  "passed" never covers the browser suite or anything touching Docker. The integrator runs those.
