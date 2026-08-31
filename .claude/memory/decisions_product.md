# Product & Architecture Decisions

The *standing* product and architecture decisions for TinyVault — the current posture a new agent (or teammate) needs before touching anything. Distilled and current, not chronological. (The dated "X over Y because Z" trail lives in `PLAN.md`'s Decisions Log; lift a decision up here once it becomes a durable part of how the system works.)

<!-- One entry per standing decision. Format:
- **<short title>** — <the decision and its current rationale>. -->

- **Model-blind by construction** — the model/agent (the untrusted caller) sees only opaque handles, never a secret value, and cannot express a request that would leak one. The vault protects against the *model*, not against the *code*; secrets are plaintext inside the trusted fill path by design.
- **No hand-rolled crypto** — lean on vetted password-manager CLIs (`op` / `bw`) and libsodium for the local-file adapter. The security story is "read the code," so the code stays boring and auditable.
- **Trusted fill service runs outside the caller** — the fill service + browser sit host-side, outside any agent container. This is what makes the later KuchiClaw integration (process boundary + context boundary) free; keep the fill service runnable as a standalone process (the MCP/stdio adapter provides this), not only an importable library.
- **Neutral core, thin adapters** — the core (three-tool interface + fill service + backends + testbed) is ecosystem-agnostic; each of MCP / eve / dsh is a ~200-LOC adapter so preview-stage framework churn is contained to the adapter, never the core.
- **Measure, don't assert** — security claims are backed by the hostile-web testbed's leak-rate scorecard, not prose. A leak *finding* is a publishable result.
- **Defensive framing is load-bearing** — this is protective security work (keeping secrets out of the model's reach; red-teaming to prevent leaks). Keep the defensive intent explicit in the repo and in prompts; it's good hygiene and reduces false-positive safety flags. Never route around safety by obfuscating what the code does.

See `PROJECT-SPEC.md` §4 (the mechanism/invariants) and §11 (model/safeguards) for the full statements.
