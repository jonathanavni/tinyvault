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

**Pre-release, under construction.** The contracts are frozen and the *measurement harness* works; the
credential fill service itself is not built yet.

| Milestone | State |
|---|---|
| M0 — contracts, threat model | done |
| M1 — eval spine (leak checkers, meta-gate, offline adjudicator, scorecard) | done |
| M2 — security primitives (`Secret<string>`, origin validator, lockdown, mutex, results, tripwire detector + dependency boundary) | done (`6a6b67c`) |
| M3 — backend interface + libsodium local-file backend (never-cache contract, policy-bound sealing) | **done** — three pre-impl and three post-impl review rounds; the dependency gate now scans runtime modules, not `.d.ts` |
| M4 — the fill service and its integration gates | **not started** |
| M5–M7 — hostile fixtures, reference + naive agents | not started |
| M8–M10 — MCP adapter, 1Password backend, demo | not started |

`make eval` runs today and produces a scorecard, but it drives a **scripted stub agent** against a benign
local login fixture — it is exercising the harness, not yet measuring a real agent. The table below stays
empty until M6 puts real agents in front of real hostile fixtures.

| Agent | Runs | Leaks | Leak rate (95% CI) | Tasks completed |
|---|---:|---:|---:|---:|
| Naive baseline | not yet measured | — | — | — |
| TinyVault reference | not yet measured | — | — | — |

Reproduce with:

```sh
make eval
```

### What a green scorecard does and does not prove

Honesty matters more here than in most projects, because the deliverable *is* a number.

- The leak checker's own competence is gated: `make eval` fails if the checker cannot catch a planted
  leak on every locked encoding, or if it flags an authorized login as a leak.
- Run outcomes are **recomputed offline** from persisted evidence rather than trusted from the runner.
- **Capture coverage is currently partial.** Of the declared evidence channels, several (`url`, `header`,
  `websocket`, `redirect`, `screenshot-text`, `log`) have no producer yet, so a leak over those routes
  would not be observed. Until that is closed, a zero is bounded by what is instrumented — the eval
  measures the channels it watches, not every channel that exists.
- A reported `0/N` is an observed rate with a Wilson 95% interval. It **bounds** the leak rate; it does
  not prove zero.
- The published artifacts are **evidence you can re-derive, not evidence you must trust**. Outcomes are
  recomputed offline from persisted events against a code-defined policy, the evidence is signed and
  bound to its run, and the run inventory is checked — so neither a bug nor an edit to the artifacts can
  quietly turn a leaking run green. What signing cannot establish is that events the fixture never saw were
  captured faithfully in the first place. So if you want to know whether these numbers are real, the
  strongest answer remains re-running the eval yourself rather than trusting a signature of ours.
