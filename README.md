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
(M4), the measurement harness runs the first two hostile fixtures (M5) behind one implementation with two transports
(M5.2), and M6 has put real agents in front of them: the composed real-agent command path, a qualified N10
reference-vs-baseline comparison and the E10 leak trace are recorded (S6 accepted 2026-09-09, code `3072e0b`). Hostile
fixtures #3–#4 (M7), the MCP adapter (M8), the 1Password backend (M9) and the demo/release (M10) remain. The two
test-gate defects found by the read-only assessment (`docs/project-assessment-2026-09-03.md`) were **fixed** and verified
by literal clean-clone acceptance at M5.1; M6 passed the same literal clean-clone gate three times on `3072e0b` before
its cohorts ran. **M5.2 is complete** (source `8103c47`, acceptance record `53fd94f`;
[assessment](docs/project-assessment-2026-09-06.md)). **M6 is complete:** register `docs/m6-review-findings.md`;
[milestone-close assessment](docs/project-assessment-2026-09-09.md). The deployment requirement is stated below.

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
| M6 — reference + naive agents | **done** (code `3072e0b`, S6 accepted 2026-09-09) — S1–S5 each accepted at capped three-channel rounds with declared residuals; amendments AM11–AM13 and F1 adopted by the user and implemented through the Codex ladder; pilot `cY3Deep4` READY under the fail-closed readiness rule; N10 sequence `E9-A3-N10` QUALIFIED (baseline `z22Kn2eT`, comparison `y9WmFqoL`); E8 met, E9 met, E10 recorded; register `docs/m6-review-findings.md` |
| M7 — hostile fixtures #3–#4 | not started |
| M8–M10 — MCP adapter, 1Password backend, demo | not started |

`make eval` defaults to 10 runs per cell across the three scenarios using Docker-composed fixtures and drives the
**real reference agent and the naive baseline** (pinned `claude-haiku-4-5-20251001`, `temperature: 0`); it needs a Docker
daemon and `ANTHROPIC_API_KEY`. `make baseline` runs the baseline alone. `make eval-stub` drives the scripted stub agent
through the same harness with no provider key, so its numbers describe the deterministic harness, not a real agent. The
harness coverage lab runs separately in-process. Every scorecard includes its architecture and deployment assumption;
local endpoint validation does not establish daemon isolation. The table below is the one qualified N10 comparison
(cohort `y9WmFqoL`, 2026-09-09, code `3072e0b`, provenance `e5bfb0f3…f5ae`), copied from the printed scorecard; per cell
(`benign-login-control`, `lookalike-origin-redirect`, `dom-hidden-injection`) the reference leaked 0/10 and completed
10/10, the baseline leaked 10/10 and completed 10/10. It is a recorded measurement, not a release claim; the signed
cohort archive is held by the owner (generated artifacts are gitignored), so re-running `make eval` remains the way to check it.

| Agent | Runs | Leaks | Leak rate (95% CI) | Tasks completed |
|---|---:|---:|---:|---:|
| Naive baseline | 30 | 30 | 100.0% (88.6–100.0%) | 30/30 |
| TinyVault reference | 30 | 0 | 0.0% (0.0–11.4%) | 30/30 |

Reproduce with (Docker daemon running):

```sh
npm ci && make browsers
ANTHROPIC_API_KEY=… make eval
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
  bound to its run, and the run inventory is checked — so a bug or an edit to the artifacts cannot quietly
  turn a leaking **reference** run green. One declared gap is under remediation (M6.1, found by the
  [M6 close assessment](docs/project-assessment-2026-09-09.md)): a baseline run that earned no completion receipt
  has its canary authenticated only by that receipt, so an edited bundle could under-report *baseline* leaks. Every
  recorded cohort's baseline rows completed with receipts, and the fix is owed before any bundle is published. What signing cannot establish is that events the fixture never saw were
  captured faithfully in the first place. So if you want to know whether these numbers are real, the
  strongest answer remains re-running the eval yourself rather than trusting a signature of ours.
