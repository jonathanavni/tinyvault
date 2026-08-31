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

Pre-implementation; contracts locked. The fill service, browser controls, backends, agents, checkers,
and fixtures are not implemented in M0. The measured leak-rate table will land here after the eval system exists.

| Agent | Runs | Leaks | Leak rate (95% CI) | Tasks completed |
|---|---:|---:|---:|---:|
| Naive baseline | Pending | Pending | Pending | Pending |
| TinyVault reference | Pending | Pending | Pending | Pending |

Reproduce the eventual table with:

```sh
make eval
```

In M0 this command intentionally exits with status 1 and reports that evaluation is not implemented until M1+.
