# TinyVault

TinyVault is a harness-agnostic, model-blind credential-fill library for browser-using agents:
opaque handles go in, origin-pinned fills come out, plaintext never enters the model's context,
and a defensive hostile-web testbed measures credential-leak rate instead of merely asserting security.

> **Threat model cornerstone:** "The vault protects against the model, not against the code. Secrets are plaintext inside the trusted fill path by construction; the security claim is that the untrusted side (the model/agent) can neither read a secret nor express a request that would leak one."

## Threat model

TinyVault is defensive security infrastructure. It is designed to prevent the untrusted model or
caller from reading a credential and to prevent caller requests from routing a credential to an
origin other than the trusted-side policy's canonical origin. Its contracts expose opaque handles,
closed results, and fixed setup guidance—not plaintext credentials or secret-derived acceptance data.

TinyVault does not defend against a compromised authorized origin. Once a credential is injected
into the real authorized login form, code at that origin can observe it. This limitation includes
that origin's redirects and reflected responses: secret-bearing traffic outside the exact authorized
login endpoint remains unauthorized evidence, but TinyVault cannot make compromised destination code trustworthy.

Multi-origin SSO and fully JavaScript-defined, non-form submission flows are unsupported in v0.1.
Automating 2FA and CAPTCHA is also out of scope; a human-handoff hook is deferred to the later
KuchiClaw integration. Demo and evaluation targets will be self-hosted or explicitly safe for automation,
and the repository and CI must contain no real credentials.

## Status

**Pre-release, under construction.** The contracts are frozen, the fill service and its integration gates are built
(M4), and the measurement harness runs the first two hostile fixtures (M5). M6's SDK and reference/baseline
profile modules are implemented through S3. The composed real-agent command path, live cohorts and published
comparison remain unfinished, along with the MCP adapter (M8) and 1Password backend (M9). The two test-gate
defects found by the read-only assessment (`docs/project-assessment-2026-09-03.md`) were **fixed** and verified
by literal clean-clone acceptance at M5.1; M6's own clean-clone/cohort acceptance remains due after S5. **M5.2 is complete:** all six slices are accepted, including
parity, claim evidence and evaluation validity (source `8103c47`, acceptance record `53fd94f`). The
[whole-milestone assessment](docs/project-assessment-2026-09-06.md) verified the retained evidence and
closed the documentation findings. The deployment requirement is stated below.

| Milestone | State |
|---|---|
| M0 — contracts, threat model | done |
| M1 — eval spine (leak checkers, meta-gate, offline adjudicator, scorecard) | done |
| M2 — security primitives (`Secret<string>`, origin validator, lockdown, mutex, results, tripwire detector + dependency boundary) | done (`6a6b67c`) |
| M3 — backend interface + libsodium local-file backend (never-cache contract, policy-bound sealing) | **done** — three pre-impl and three post-impl review rounds; the dependency gate now scans runtime modules, not `.d.ts` |
| M4 — the fill service and its integration gates | **done** (`b8a9396`) — four commits + five fix slices, each three-channel reviewed with real-Chromium exploits; probe P is a paired Holm-corrected family gate; layer-4 blind spots declared in `SCHEMA.md`; residuals with proof in `docs/m4-review-findings.md` |
| M5 — hostile fixtures #1–#2 (`lookalike-origin`, `dom-hidden-injection`), the capture-coverage gate, the finite decoder inventory, worker-body markers | **done** (`96e3ea3`) — three slices, each three-channel reviewed with real-Chromium probes and capped fix rounds; register `docs/m5-review-findings.md` |
| M5.1 — test-gate repair (timing file split, generated run corpus, clean-clone acceptance) | **done** — accepted by a literal `git clone` + `npm ci` + `make browsers` + `make test`; register `docs/m5-review-findings.md` §C-Q |
| M5.2 — Docker-composed fixtures behind one implementation, two transports | **done** — all six slices accepted; source `8103c47`, acceptance `53fd94f`; [milestone-close assessment](docs/project-assessment-2026-09-06.md) complete |
| M6 — reference + naive agents | [S1 complete](docs/m6-review-findings.md#s1-r3--final-capped-review-and-owner-acceptance-2026-09-07); provenance/profile contracts with recorded proof limits; D-BUDGET entry resolved (AM11); S2 SDK sizing accepted; helper repair verified at final R3 with three review channels PASS; [S3 modules/recipes and exact sizing complete](docs/m6-review-findings.md#s3-r2--owner-acceptance-and-retained-review-limits) with recorded P3 limits; checkpoint `db78a1c` pushed; D-CANCEL resolved with evidence (`2bcfbbd`); [S4 quiescence/cancellation accepted at the round-3 cap](docs/m6-review-findings.md) with declared residuals (`b0461f0`); [S5 composed real-agent command path accepted at the round-3 cap with the integrator confirmation pass](docs/m6-review-findings.md) with declared residuals (`1d32657`); S6 (E9/E10 acceptance ladder) next |
| M7 — hostile fixtures #3–#4 | not started |
| M8–M10 — MCP adapter, 1Password backend, demo | not started |

`make eval` defaults to 10 runs per cell across the three scenarios using Docker-composed fixtures. It
drives a **scripted stub agent**, so its numbers describe the deterministic harness, not a real agent.
The harness coverage lab runs separately in-process. Every scorecard includes its architecture and
deployment assumption; local endpoint validation does not establish daemon isolation. The table below stays empty until M6 puts real agents in front of the fixtures.

| Agent | Runs | Leaks | Leak rate (95% CI) | Tasks completed |
|---|---:|---:|---:|---:|
| Naive baseline | not yet measured | — | — | — |
| TinyVault reference | not yet measured | — | — | — |

Reproduce with:

```sh
make eval
```

<!-- TV-DEPLOYMENT-ASSUMPTION:START -->
A valid composed evaluation assumes the Docker Engine API is unreachable by the evaluated browser, page content and agent. Local endpoint validation does not verify this assumption. An unsatisfied assumption invalidates the evaluation.
<!-- TV-DEPLOYMENT-ASSUMPTION:END -->

The default composed entry records isolation as assumed and unverified. Set
`TINYVAULT_DOCKER_ISOLATION=unsatisfied make eval` for known unsatisfied isolation: it emits a typed
invalid report, exits nonzero, and preserves prior artifacts as historical files without printing their
numbers. Invalid evaluations have no measured outcome. See [SCHEMA.md](SCHEMA.md).

### What a green scorecard does and does not prove

Honesty matters more here than in most projects, because the deliverable *is* a number.

- The leak checker's own competence is gated: `make eval` fails if the checker cannot catch a planted
  leak on every locked encoding, or if it flags an authorized login as a leak.
- Run outcomes are **recomputed offline** from persisted evidence rather than trusted from the runner.
- **Capture coverage is measured, not assumed.** Ten of eleven declared evidence channels have real producers
  that a harness gate runs through the production adapter at every eval and re-derives from the persisted evidence;
  the eleventh (`screenshot-text`) is declared uninstrumented. Worker request bodies the harness could not retrieve
  are counted per cell (`bodiesUnobserved`), never assumed absent; requests initiated during page unload are
  declared unobserved (M5-C7). The scorecard prints the coverage line and every declared limit is in `SCHEMA.md`.
- A reported `0/N` is an observed rate with a Wilson 95% interval. It **bounds** the leak rate; it does
  not prove zero.
- The published artifacts are **evidence you can re-derive, not evidence you must trust**. Outcomes are
  recomputed offline from persisted events against a code-defined policy, the evidence is signed and
  bound to its run, and the run inventory is checked — so neither a bug nor an edit to the artifacts can
  quietly turn a leaking run green. What signing cannot establish is that events the fixture never saw were
  captured faithfully in the first place. So if you want to know whether these numbers are real, the
  strongest answer remains re-running the eval yourself rather than trusting a signature of ours.
