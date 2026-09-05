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

*(Added 2026-08-31, after M0/M1 + the Opus 5 audit — these are now enforced in code, not just intended.)*

- **Origin authorization is bound trusted-side to the credential, never asserted by the caller.** The vault
  item's own canonical URL is the gate; a caller-supplied origin is at most a redundant assertion. The
  earlier "caller passes `expectedOrigin`" design made every handle transferable to an attacker site.
- **Injection is a single synchronous in-page-realm validate-and-assign, not keystrokes.** Keystrokes force a
  TOCTOU gap between the origin check and the write, and their duration leaks the secret's length. One
  in-realm callback re-validates origin + element identity and assigns in the same turn.
- **The leak checker's inputs must come from code, not from the artifact bundle.** Verification key,
  `ScenarioAuth`, and the canary are all producer-writable if read from the bundle — that was three
  demonstrated forgeries. Evidence is additionally fixture-signed and the run inventory is gated.
- **Anti-fabrication rests on reproducibility, not attestation.** The fixture signs bytes the runner supplied,
  so events it never observed have integrity but not independent authenticity. The honest answer to "did you
  fake this number" is "re-run it", which is why the reproduce command is a launch requirement.
- **Never cache the *secret*; backend *auth sessions* may be cached.** Distinct things — conflating them makes
  the invariant either false or forces pointless re-auth. Rotation/revocation are then honored by construction.
- **Payments are a non-goal** (triaged 2026-08-31): rail owners solve that class upstream (Stripe Link's
  one-time cards). Sign-in has no rail owner — that is TinyVault's class.


*(Added 2026-09-01, after M3 — enforced in code and mutation-tested.)*

- **A secret is released only for the policy the fill gate authorized.** `resolveSecret(handle,
  authorizedPolicy)` compares the record's *current* policy to the authorized one before decrypting and seals
  each secret with additional data bound to `[handle, origin, recipe]`. The compare closes the policy/secret
  TOCTOU between the gate's two backend calls; the AD stops re-pointing by metadata edit. Computing the AD from
  the caller's argument is *not* equivalent (it never authenticates the cleartext beside the ciphertext).
- **Backends hold nothing between calls — not even the key.** Local-file reads the 32-byte key per call and
  zeroes it in a nested `finally`. `dispose()` exists for session-token backends (M9) and is a documented
  no-op where there is nothing to drop.
- **The dependency gate follows runtime modules with Node's own resolvers and is two-tier:** data-plane roots
  tolerate nothing; scripts-rooted walks tolerate unsupported/unscanned/unresolved loads *inside
  `node_modules`* only, keyed on the entry root; production may not import `scripts/`, directly or
  transitively; protected classification is the union of link path and real path; the gate refuses to run
  without `--experimental-import-meta-resolve`.
- **Docker-composed fixtures are the acceptance path; in-process servers are the fast harness; one implementation, two
  transports.** The locked spec's Docker wording stands (governance: a locked spec is not amended to match what was easier
  to ship) and encodes a real process boundary plus host-independent reproducibility. `make test` stays Docker-free;
  `make eval` is Docker-backed with no silent fallback; parity between transports is canonical, not byte-for-byte; the
  control plane is unreachable from the hostile page by network topology, with authenticated run-scoped registration.
  (Decisions Log 2026-09-03; M5.2)
- **Docker-daemon isolation is a stated DEPLOYMENT REQUIREMENT, not a proven property.** A valid TinyVault
  evaluation requires that the Docker Engine API not be reachable by the evaluated browser, page content, or agent.
  The harness resolves, validates and pins the local `unix://` endpoint *it* uses, but cannot prove the same daemon
  has no additional TCP listener, proxy, or externally configured route — Docker supports multiple `-H` listeners
  and the listener set is not reliably queryable. **If the assumption is false the run is outside the threat model
  and its results are INVALID — not a measured pass, not a measured failure.** Chosen over adding a mechanism that
  would assert an uncheckable property. Published scorecards state it; recorded beside the number in `README.md`
  and `SCHEMA.md`, not only in the spec. (user, 2026-09-04; M5.2 revision 4, register C-R8)
- **The evaluated agent's tool boundary is enforced by runtime non-acceptance, never by source analysis.**
  `runAgentLoop` accepts no caller-supplied `tools` or `handlers`; it owns a private deeply frozen registry of the
  seven approved operations, and the *same object* is what is offered to the model and what dispatch validates
  against — so the offered set equals the validated set by construction. Three source-analysis designs failed first
  (register C-S1); the structural reason is that **a positive allowlist over occurrences the type checker can
  resolve is not a positive allowlist over occurrences**. Because there is no `tools` parameter, import syntax,
  aliases, call sites, roots and filenames are all irrelevant. (user, 2026-09-04; M5.2 slice 1)
- **M5.2 threat boundary (locked):** the adversary is the evaluated model/agent and hostile page content in
  Chromium; the harness and fixture container are trusted infrastructure; **compromise of a fixture process
  invalidates the run and is out of scope**; a declared data-plane request MAY legitimately cause capture and
  completion-receipt issuance (including the declared M5-C2 residual); and page content must not be able to invoke
  registration, receipt retrieval, capture retrieval, arbitrary event attestation, or capability/key retrieval.
  Accessor/prototype tests are robustness probes, not evidence that in-process compromise is contained.
  (user, 2026-09-04; register C-R4)


## M5.2 slice 2 — the Docker channel (2026-09-04, merged `8133495`)

- **The harness pins the Docker endpoint it validated, and nothing below re-resolves one.** Provenance is a
  module-private `WeakSet` plus `#private` frozen storage — **not** a TypeScript brand, which erases at runtime —
  and Docker commands are a closed vocabulary whose argv is built internally, because free-form argv lets
  `-H/--host` override a correct env pin.
- **`unix:///` + a normalized absolute path is the only accepted endpoint spelling.** Comparison between sources is
  done on the `realpath`-resolved path, so one socket reached by two paths agrees rather than collides, while the
  built-in default never counts as a disagreeing source. Trailing/edge whitespace is rejected because Docker
  **trims** it and would dial a different socket than the one pinned.
- **The Docker-free guarantee for `make test` is enforced at RUNTIME, not by source scanning**, and it is
  **hygiene, not containment**: `worker_threads` realms and `process.binding` escape it, and the code says so.
- **Nothing claims the Docker daemon has no other listeners or cannot proxy.** That remains the declared
  deployment requirement (C-R8). All three review channels independently confirmed the claim boundary is clean.
