# M5.2 register — review findings and dispositions

Companion to `docs/m5-2-slice-spec.md`. One section per round; every finding gets a disposition, and a disposition
that changes the spec names the section it changed.

---

## C-R1 — Codex reconnaissance (read-only, 2026-09-04) — pre-spec

Read-only map of the harness↔fixture seams, commissioned before the spec was written. Absorbed into the spec's
"Context" section. Two findings **corrected the framing the M5.2 PLAN block was written with**, and both are
carried as corrections rather than quietly fixed:

| Assumed | Actually |
|---|---|
| The harness distributes a receipt-signing key to each fixture | Each fixture generates its own Ed25519 pair at startup and hands back the **public** key as a live `KeyObject` (`testbed/fixtures/shared/loginFixture.ts:81-100`, `testbed/runner.ts:240-249`). Nothing secret crosses. The Docker question is public-key transport and key↔fixture binding. |
| Run registration is the sharpest seam | `attestEvents` is: it signs `{runId, sha256(bytes)}` over **harness-supplied bytes the fixture never observed**, authorized only by "that runId is registered" (`loginFixture.ts:198-207`). On a page-reachable address that is a signing oracle. |

Also established: what protects every control operation today is **object possession** — no control operation has an
HTTP route at all (`loginFixture.ts:313-353`). That is the property M5.2 spends and must buy back.

---

## C-R2 — Codex adversarial paper round 1 (read-only, 2026-09-04) — on spec revision 0

Verdict on the network shape: **neither proposed option survives as specified.** Dispositions below; the spec is
re-issued as revision 1 against them.

### The finding that mattered

**P1 — a dual-homed container has one network namespace, so "publish the page origins on the page network and the
control port on the harness network" is not a thing Docker does.** A control listener bound to `0.0.0.0:<port>` is
reachable through the fixture's **`tv-page` IP** as well, because Docker networks scope *routes*, not *listening
ports*. Option A's claim ("the browser never joins `tv-control`, so it cannot reach control") was therefore false
as written, and so was the same assumption in the user's original sketch and in the M5.2 PLAN block. `internal:
true` prevents external routing; it constrains neither members nor a dual-homed member.

This is precisely the "one place M5.2 can create a new hole rather than close one" the round was commissioned to
find, and it would have been built.

**Disposition: accepted, spec §D2 rewritten.** The surviving design is **privilege separation, not network
labelling**: page containers join only `tv-page`; a **control sidecar** per fixture joins only `tv-control`; the
page-serving process receives neither the bootstrap secret nor the control socket. The same correction repairs
Option B, whose flaw was bind-mounting the privileged socket *into the page-serving container* — B is sound only
once the socket terminates in a separate sidecar.

### The rest, with dispositions

| # | Finding | P | Disposition |
|---|---|---|---|
| 1 | Option A makes every dual-homed fixture a pivot: compromise one and it routes over `tv-control`, reads its bootstrap secret, races predictable run ids | P1 | Accepted. §D2 sidecar split; §D3 requires a **per-sidecar** bootstrap secret, never one shared Compose secret. |
| 2 | Topology regression needs far more than one page probe — service DNS, every page-network IP, loopback, Docker gateway, `host.docker.internal`, IPv4/IPv6, rebound names, `fetch`/form/image/WebSocket/worker producers, server-side fixture pivots; plus static rejection of `network_mode: host`, published control/CDP ports, page-container control mounts, wildcard control binds | P1 | Accepted. Acceptance B rewritten as a probe matrix **plus a static Compose lint**. The controls lab's permissive CORS makes any accidental TCP exposure immediately readable (`controls-lab/index.ts:350-383`), so a probe that only tries a service name is a false green. |
| 3 | Option A changes two variables in the parity experiment (transport **and** browser), and SCHEMA's 44–83% miss range and ≥150 ms calibration are host-browser observations | P2 | Accepted as stated: it does not invalidate the gate's logic, it invalidates treating the existing calibration as evidence for a container browser. Recorded in §D2 as the cost of A; a container browser needs a rebaseline and M6 would then measure a different environment. |
| 4 | **§D4 option 1 is incoherent.** Offline adjudication requires the fixture signature *before parsing events* (`offline.ts:244-267`), so "don't expose attestation, keep the claim" cannot implement both — composed mode would either have no attestation or a harness-local substitute that is not "the fixture signs bytes" | P1 | Accepted; the spec's preferred option was not implementable. §D4 rewritten as an explicit fork, both branches honest: **(i)** an operation-scoped, sidecar-only signing endpoint keeping today's limited claim, or **(ii)** composed runs declared to carry **no** event attestation. The SCHEMA sentence that must change either way is quoted in §D4. |
| 5 | §D3 contradicts §D2: D2 demands a capability bound to run **and operation**; D3 proposed one `(fixtureId, runId)` bearer for receipt, capture and attestation — a capture-read capability would drain the receipt or drive the signing oracle | P1 | Accepted. §D3 now specifies **per-operation** capabilities. |
| 6 | Capability non-observability is asserted, not gated — a plausible implementation recycles the run token that is **deliberately rendered into the hostile page** (`loginFixture.ts:355-363`), which the lookalike then copies (`lookalike-origin/index.ts:112-120`) | P1 | Accepted. §D3 adds an explicit non-observability assertion: no capability may appear in page HTML, page URLs or headers, captured evidence, transcripts, artifacts, fixture access logs, or error text. |
| 7 | The L→C server-side fetch is **not** destination-steerable (fixed `/login`, closure-held origin, query copied only) but is a **read oracle** on whatever registration renders for any predictable registered `runId` | P2 | Accepted, and it is the reason finding 6 is P1: no capability or capability-derived material may enter that rendering. Spec §D3. |
| 8 | Destructive `takeReceipt` is not network-safe: server deletes, response drops, retry returns empty, a completed run scores incomplete | P2 | Accepted. §D3: idempotent authenticated read plus optional explicit acknowledgement; offline replay protection already makes repeated retrieval harmless (`testbed/completion.ts:107-117`). |
| 9 | **The parity normalizer's concrete false green:** in-process captures two same-name headers, the first carrying the canary; the composed transport drops the first; a "lowercase and normalize header order" implementation collapses both to a last-value map; parity passes while composed capture missed the leak | P1 | Accepted — this is the answer to "what would a normalizer erase". §D6 adds duplicate-name multiplicity, individual values and within-name value order to the must-not-normalize list, and requires mutation tests for last-write-wins, deduplication and comma-coalescing. |
| 10 | Key-uniqueness underspecified: normalizing public-key bytes to fixture roles hides a composed transport that reuses one key across fixtures — verification succeeds, yet compromising one fixture forges another | P2 | Accepted. §D6 preserves the **cross-fixture key inequality graph**, not merely successful verification and wrong-key failure. |
| 11 | `runner.ts:118/119` is necessary but **not sufficient**: `capturePersistedRuns` is exported, launches Chromium itself and runs scenarios without `runEval` (`runner.ts:157-203`); the hostile suite calls it directly | P2 | Accepted. §D5 keeps the early `runEval` preflight *and* makes composed-transport construction **fail closed**, with three named mutants: direct composed `capturePersistedRuns`; daemon lost after preflight but before Compose startup; composed startup catching failure and returning the fast transport. |
| 12 | **Every acceptance criterion A–G can pass while the property it names is false** | P1 | Accepted wholesale; all seven rewritten. Notably D — the spec tested form-body attribution but query attribution is also accepted today (`loginFixture.ts:371-378`) — and G, where a prose assertion passes while the composed path does not implement the sentence, so G becomes a behaviour-to-claim closure table per transport. |

### Not accepted as a weakening

Keeping the harness outside Compose is **not** a requirements weakening. The locked goal is Docker-composed
*fixtures* (`PROJECT-SPEC.md:47-51`, `:126-134`) and the as-built note already keeps an in-process fast harness
(`:113-119`). It is an operational reproducibility cost, not a page-isolation defect.

### Round budget

Round 1 of the three-round cap (`CLAUDE.md`). Round 2 reviews spec revision 1 — specifically whether the sidecar
split survives the same attacks, since it is a design this round proposed rather than tested.

---

## C-R3 — Codex adversarial paper round 2 (read-only, 2026-09-04) — on spec revision 1

**Verdict: the sidecar split does NOT survive. The exec bridge does NOT survive. Revision 1 must not lock.**
The user's stop-and-report rule is triggered: no published control port, no silent fallback, no repair without the
user. Round 2 of the three-round cap. **No code was written and none should be until this is resolved.**

### The finding under the findings: §D2's isolation claim was never true, in either transport

Round 2's first two attacks converge on one thing, and it is a premise problem rather than a mechanism problem.

§D2 asserted that compromise of a page container "must cost the attacker only that fixture's page surface — never
another run, never another fixture, **never the signing path**". But **receipt signing is triggered by a page
request by design**: the page POSTs the login body, and a correct username plus the registered canary is what makes
the fixture capture and sign (`loginFixture.ts:385-411`). `SCHEMA.md:319-335` already declares that an
exact-endpoint follower can obtain a real receipt and satisfy completion. So D2's absolute claim **exceeds the
residual the project has already declared** — it was not true in-process either, and the sidecar split did not
introduce the gap, it inherited it while promising to close it.

That is why no state channel survives. The page container must be able to tell the fixture "a login arrived with
this body"; a compromised page container can therefore forge exactly that. Round 2 enumerated shared volume, shared
namespace/socket, sidecar-initiated pull, message queue, and shared memory — each fails identically, because the
question is not who opens the connection but **who authors the data**. The only semantic escape is for the sidecar
to observe and adjudicate the browser request itself, which puts page-input parsing back beside the signing path
and contradicts §D2's own argument (`m5-2-slice-spec.md:147-150`).

**Disposition: not repairable inside the current claim. The claim has to narrow, and that is the user's call.**

### Findings

| # | Finding | P |
|---|---|---|
| 1 | **No page↔sidecar state channel survives the stated compromise model.** All five candidate channels let a compromised page process forge the state transition that causes receipt issuance. Directional directories still let it fabricate every record it is authorized to write; `network_mode: service:sidecar` exposes sidecar loopback; a sidecar-initiated pull changes the connection direction, not the data's author; queue ACLs bound fixture scope but cannot establish that an event corresponds to a real request. | P1 |
| 2 | **The page can cause receipt signing by design** (above), and the split has no trustworthy way to distinguish that from a forged request. Also: attribution parsing does not sign today (`loginFixture.ts:366-382`), but **any sidecar that watches those page-writable files or statuses turns attribution into an indirect signing trigger** — the exact way this slice would convert a declared measurement limit into a hole. Attestation is harness-requested after receipt retrieval (`runner.ts:296-310`) and the signer checks only registration (`loginFixture.ts:198-207`), so a page-writable finalization bit, queue entry or request file would let the page reach it indirectly. | P1 |
| 3 | **The exec bridge's landing proof is circular and unauthenticated.** The sidecar self-asserts project, service, container id, `fixtureId` and public key with no fresh harness challenge, MAC, or independent trust source. Critically, **"unexpected public key" cannot be checked at all — keys are generated at fixture startup and the bridge is the key's first trust path.** Cross-fixture inequality detects reuse, not authenticity or freshness. A collided or reused Compose project presents the expected static fields; a scaled service is not uniquely selected without replica cardinality and index checks; a stale sidecar announces internally consistent old metadata and its own key with nothing to detect it. | P1 |
| 4 | Framing underspecified: no single-stdout-writer requirement, no request ids, no rejection of unsolicited or duplicate responses, no close-after-timeout — so a late frame can be consumed as the next response. `stderr` is safe only if the CLI's pipes stay separate; stdout diagnostics must corrupt-and-close, never be skipped. **Correct as specified:** the long-lived pipe does narrow later TOCTOU (replacement/restart kills the exec), and bridge death is red — it must also reject the outstanding operation on EOF. | P2 |
| 5 | **Capability tuple binding is not freshness, secrecy, or revocation.** No entropy, eval/sidecar-instance epoch, expiry, or restart-safe consumed state is required. Run ids deterministically recur across evals (`runner.ts:380-388`), restart resets in-memory "used" state, and bridge death reddens the run without invalidating bearer material a restarted sidecar would accept. Leak paths beyond Acceptance E's artifact scan: shared state files, IPC buffers, page-container process state, bridge error echoing, stdout diagnostics, access logs, crash/core material. | P1 |
| 6 | **The straightforward filesystem implementation reopens exactly what capabilities close.** All fixtures receive the **same** capture directory today (`fixtures/index.ts:10-20`, `runner.ts:174-182`); capture filenames are flat and keyed only by `runId`, and successful captures contain the full login body including the canary. Mounting the artifact root is worse — vault ciphertext and its key are sibling files per run (`runner.ts:390-409`). `readContainedBytes` prevents escape from the root, not cross-run or cross-fixture substitution inside it. The spec defines no filesystem ownership, per-fixture/per-run isolation, transfer timing, symlink handling, or teardown. | P1 |
| 7 | **Domain confusion is not currently exploitable** — attestations sign canonical JSON of exactly `{runId, eventsSha256}` and receipts a fixed nine-field object, and both parsers reject other shapes (`loginFixture.ts:258-275`, `completion.ts:138-150`, `:188-210`), so the signed-byte languages are disjoint today. But **Acceptance J cannot prove the property it names**: removing a future prefix leaves the shapes disjoint, so the test stays green while explicit domain separation is false. The signed transcript must cover a distinct fixed prefix (protocol, artifact kind, version), length framing, fixed field ordering, one canonical encoding, schemas rejecting duplicate and unknown fields, and operation/`fixtureId`/`runId` scope **inside the signed bytes** — version and type signed, not carried in an outer envelope. | P2 |
| 8 | **All ten acceptance criteria can still false-green**, including both criteria added in revision 1. A and B pass while the permitted state channel carries forged control-equivalent transitions; I passes on fake-announcement tests while a stale or collided sidecar self-reports consistent fields; J's single-use stays green in-process while a restart resets the ledger; F's per-run alpha-renaming can hide cross-run nonce/canary/handle reuse; G's import check misses a conditional `spawn("docker")` or direct daemon-socket access not exercised in the clone run; H remains prose in table rows without an executable link to the composed path. | P1/P2 |

### Correct as specified

Nothing requires mounting the Docker socket into a container — the host harness invokes the Docker CLI itself, and
exposing the socket to the page container or sidecar would be a new violation. The long-lived bridge's TOCTOU
narrowing and its death-is-red rule are right.

### Round budget

Round 2 of three. **The next action is the user's, not another round**: the blocking issue is a claim that is
stronger than the fixture semantics support, and no amount of mechanism fixes that.

---

## C-R4 — threat boundary locked, sidecar removed (user, 2026-09-04) — spec revision 2

The user accepted round 2's stop and its finding that revision 1's isolation claim was false. They also **rejected
the integrator's proposed replacement sentence** ("a compromised page container cannot reach another run…") on the
same grounds: it still promises containment after compromise of the fixture server process, which the design cannot
establish. Spec revision 2 is written against a locked threat model instead of an implied one — revision 1 had
none, which is how an unsupportable absolute got written and survived a round.

**Locked threat model** (spec "Threat model"): the adversary is the evaluated model/agent and hostile page content
in Chromium; the harness and fixture server/container are trusted infrastructure; **compromise of a fixture process
invalidates the run and is out of scope**, and M5.2 must not claim containment after it; a declared data-plane
request **may legitimately** cause capture and completion-receipt issuance, M5-C2 included; and page content **must
not** be able to invoke registration, receipt retrieval, capture retrieval, arbitrary event attestation, or
capability/key retrieval. That last line is the whole security question for the slice.

**The sidecar is removed as a required security mechanism.** Round 2 proved no page↔sidecar state channel survives
a compromised page process — but under the locked boundary that compromise is out of scope, so the sidecar was
defending a threat this slice does not carry while introducing an unsound state-transfer boundary. Removing it also
removes every C-R3 finding that existed only because of it (findings 1 and 2's channel enumeration).

**Topology (decided):** one container per fixture; only page-origin TCP ports published; a control Unix socket
**entirely inside** the container, never published or bind-mounted; a long-lived `docker exec -T` bridge connecting
to it from inside; no control-network port; no silent fallback.

**The exec trust anchor is repaired.** C-R3's finding stands and is answered: a self-announced key is not trust,
because the bridge was that key's first trust path. Revision 2 requires a fresh **per-eval, per-fixture** bootstrap
secret injected when Compose creates the container, resolution of **exactly one container id** and exec against
that immutable id rather than a service selector, a fresh challenge, and a **MAC binding challenge, eval epoch,
fixture identity, container identity and generated public key**.

**Attestation** stays branch (i), renamed from "sidecar-only" to **fixture-control-only**, operation-scoped. It
retains only post-capture integrity and does not establish independent capture authenticity.

### C-R3 findings, disposition under the locked boundary

| C-R3 finding | Disposition |
|---|---|
| 1 — no page↔sidecar state channel survives | **Moot**: the sidecar is removed and the compromise it addressed is out of scope. |
| 2 — the page can cause receipt signing by design | **Accepted as correct, and now stated as intended behaviour**: the locked model says a declared data-plane request may cause capture and receipt issuance, M5-C2 included. The sub-finding stays live in a narrower form and is Acceptance C: a data-plane request must never cause an *administrative* operation. |
| 3 — the exec landing proof is circular | **Accepted; repaired** in §D2.1 (bootstrap secret, resolved container id, challenge, five-value MAC). Acceptance F, with mutants for a missing MAC, any one omitted bound value, a replayed MAC, a service selector, a zero/two-container resolution, and a stale container. |
| 4 — framing underspecified | **Accepted**; §D2.1 gains request ids, one stdout writer, rejection of unsolicited/duplicate/late responses, bounded frames, close-on-desynchronisation, and close-on-timeout. Acceptance G. |
| 5 — capabilities lack freshness, secrecy, revocation | **Accepted**; §D3 gains cryptographic entropy, eval/instance epoch binding, expiry, per-operation scope, single use and restart invalidation. Acceptance D and E. |
| 6 — the filesystem reopens cross-run/cross-fixture reads | **Accepted**; new §D7 — no shared artifact-root or cross-fixture capture mount; captures move over the authenticated control transport and the harness persists them. Acceptance J. Framed explicitly as "the composed transport must not *introduce* a read path the in-process transport lacks", not as a containment claim. |
| 7 — Acceptance J could not prove domain separation | **Accepted**; the criterion (now I) leads with the mutant that matters: **remove the prefix and the test must still go red**, even though payload shapes remain disjoint. Requirements on the signed transcript are enumerated. |
| 8 — all ten criteria could false-green | **Accepted**; twelve criteria (A–L), rewritten. A now mutation-covers every composed-construction failure separately; K adds conditional `spawn("docker")` and direct daemon-socket access alongside the import check and the clone; L requires each claim row linked to the test that exercises it. |

### Round budget

Round 3 of three, dispatched against revision 2, with one question: can page content or the evaluated agent reach
an administrative control operation, directly or indirectly? Findings that assume a compromised fixture process are
out of scope by instruction. If the design cannot prevent it, stop again — no published control port, no fallback;
otherwise the spec locks and implementation proceeds.

---

## C-R5 — Codex adversarial paper round 3 (read-only, 2026-09-04) — on spec revision 2

**Verdict: YES — page content can still reach an administrative control operation, by one path. Revision 2 must not
lock.** One P1, eight P2s, no P3s. The user's stop rule applies again. Round 3 of three; **the paper-round cap is
spent**, so the next move is the user's.

### The P1 — the Docker Engine endpoint is an unguarded alternate control transport

Revision 2 isolates the fixture control socket correctly, and then leaves the daemon that fronts it unconstrained.
The spec forbids **mounting** the Docker socket into a container (`m5-2-slice-spec.md:187-207`) but never forbids or
preflights a **network-addressable Docker endpoint**, and Acceptance B inspects Compose publications rather than the
daemon selected by the Docker context or `DOCKER_HOST` (`:354-360`).

A conforming deployment could therefore point at a Docker TCP API that Chromium can address. Docker's own
documentation is explicit that unsecured TCP access grants full Docker control; the Engine API exposes
`Config.Env` through container inspection and supports `exec`. So hostile page content or the evaluated agent could
read the bootstrap secret out of the container's environment and `exec` into the exact container to reach the Unix
socket — **without any fixture compromise**, which is what makes it in scope. The attack begins with a
trusted-but-reachable daemon.

**Verified on this host: not currently exploitable.** `DOCKER_HOST` is unset and the active context
(`desktop-linux`) resolves to `unix:///Users/jonathanavni/.docker/run/docker.sock`. The finding is a
**spec-completeness hole** — nothing in the design, the preflight, or the acceptance suite prevents or even detects
the insecure configuration — not a live hole on the development machine.

**The repair is bounded and violates no constraint** (round 3 says so explicitly: "neither a published
fixture-control port nor a fallback"): preflight must assert the daemon is reached only over a non-network channel
inaccessible to Chromium and fail loudly otherwise, and Acceptance B must cover it. Two things belong with it:

- **Stop injecting the bootstrap secret through Compose environment.** `Config.Env` is disclosed by container
  inspection, so environment injection is the weakest available channel independent of the daemon question. Deliver
  it over the exec bridge's stdin during the handshake, or through a file the harness writes in.
- **Freeze the evaluated agent's tool boundary explicitly.** The agent today holds only supervised browser and
  vault tools — no shell, filesystem, raw-socket or Docker tools (`testbed/runner.ts:592-614`) — and that is
  load-bearing for this claim while being asserted nowhere.

### Confirmed sound (no P1)

- **Indirect invocation — the sharp question — survives.** Attribution-controlled `runId` selects only an
  unauthorized-capture bucket and dispatches nothing (`loginFixture.ts:366-382`); `/login` requires a registered
  run, the fixed username and the run canary, then performs only the expressly permitted capture and receipt
  issuance (`:385-411`); the rendered document/control tokens are exposed, which is precisely why they may never be
  capabilities (`:355-363`); and L→C is fixed to `GET /login` with only the query copied — a rendering oracle, not
  destination-steerable SSRF (`lookalike-origin/index.ts:102-120`).
- **The exec trust anchor works as designed** against stale projects, container replacement, cross-eval replay and
  post-handshake replacement. It simply cannot defend against Docker-level access, which is the P1.
- **Framing**: no page-input smuggling path survives length-prefixed bounded frames, one stdout writer, request
  correlation, close-on-malformed and close-on-timeout.
- **Capture transfer** (§D7) introduces no page-visible or cross-fixture mount path.
- **Acceptance A, H and K** found no false-green path.

### P2s — and two are criteria that test the wrong thing

| # | Finding | Where |
|---|---|---|
| 1 | **Acceptance J asserts an impossible property.** One long-lived fixture container necessarily holds several registered runs and their captures in shared process state (`loginFixture.ts:85-97`, `:154-163`). J must test **caller-visible retrieval isolation** — run A's capability cannot fetch run B's or another fixture's — not that the trusted container has no internal access. A compromised fixture abusing that access is out of scope. | Acceptance J |
| 2 | **Acceptance E's body contradicts its title.** It says "keys" but names only capabilities, derived values and private keys, omitting the **bootstrap MAC secret** and the **serialized public verification key**, both control-plane values covered by the locked question. Docker inspection and error output are missing from the scan set. | Acceptance E |
| 3 | MAC encoding underspecified: "binding five values" does not require an **injective** transcript, so F can pass its omission mutants while delimiter-free or ambiguous encoding admits tuple confusion. Needs a fixed protocol prefix, byte-length framing, exact field order and encoding, the canonical **full** container id, and independent deletion mutants per field. | §D2.1 / F |
| 4 | Acceptance D quantifies nothing: a short random token and an effectively run-long expiry pass the deterministic-token mutant. Require a CSPRNG, a minimum security strength, and an explicit latest expiry. | Acceptance D |
| 5 | Acceptance G omits **request-id reuse** within a bridge lifetime and a **correctly correlated response carrying the wrong operation/type**; EOF with a partial frame should also close. | Acceptance G |
| 6 | Acceptance I's single prefix mutant can false-green: it must remove the **receipt** prefix and the **attestation** prefix independently and assert the exact signed preimage in each case, or one transcript stays unprefixed while deleting the other still reddens the test. | Acceptance I |
| 7 | Acceptance C's operation-wiring mutant is adequate **only if it observes actual control dispatch**, including fire-and-discard calls and idempotent reads — not merely returned page content. | Acceptance C |
| 8 | Acceptance L can link the §D2 row to a false-green B while also carrying J's overstated claim. Require each linked test to **die under its row's claim-breaking mutant**. | Acceptance L |

### Round budget

**Rounds 1–3 spent; the paper cap is exhausted.** Extending it, accepting a revision 3 repair, or proceeding some
other way is the user's decision. `CLAUDE.md`'s convention — when a channel beats the same invariant repeatedly,
narrow the claim before adding code — has already been applied once here (C-R4); this P1 is a different shape, an
unclosed transport rather than an overstated claim, and it has a bounded repair.

---

## C-R6 — bounded cap extension: spec revision 3 (user, 2026-09-04)

The user accepted round 3's stop and authorized **one bounded cap extension**, scoped to C-R5's P1, the eight
recorded P2s, and consequent consistency edits. Explicitly **not** permission to reopen the architecture or begin
implementation.

### The P1 repair, as authorized — four requirements, all inside the existing architecture

| # | Requirement | Where |
|---|---|---|
| 1 | **Daemon-channel preflight.** Before contacting the daemon, deleting artifacts or launching Chromium: resolve the *effective* endpoint across `DOCKER_HOST`, `DOCKER_CONTEXT` and the active context; require a canonical local `unix://` endpoint for v0.1; reject TCP, HTTP(S), SSH, unknown schemes, and anything malformed or ambiguous; and **pin every later Docker/Compose invocation to the endpoint that passed** — validating one context and executing against another is the specific failure to prevent. | new §D5.0 |
| 2 | **Acceptance coverage.** Mutate both `DOCKER_HOST` and context selection to network endpoints and prove failure occurs before any Docker API operation or other eval side effect. This host's Unix endpoint is the positive control. | Acceptance B |
| 3 | **Bootstrap delivery over the already-open bridge's stdin.** Never Compose environment, labels, command arguments, container inspection, files, logs, diagnostics, artifacts or error text. Held only in harness/bridge memory for the bridge lifetime. This closes the disclosure half of the P1 independently of the daemon half. | §D2.1, Acceptance E |
| 4 | **Frozen evaluated-agent tool allowlist.** Only supervised browser and vault tools; shell, filesystem, raw network/socket, process, Docker and generic code-execution tools absent, asserted on the **exact set**. Any expansion is a new threat-model decision. | new §D8, Acceptance J |

### The eight P2s, with the user's clarifications

| C-R5 P2 | Disposition |
|---|---|
| J asserted an impossible property | **Corrected** (now Acceptance M): tests **caller-visible retrieval isolation** — run A's capability cannot fetch run B's or another fixture's — not trusted-container internal separation. A compromised fixture abusing internal access is out of scope. |
| E's scan set incomplete | **Corrected** (now F): covers the **bootstrap secret, capabilities, capability-derived values and private signing material** across container inspection and every existing surface. **User's clarification: the public verification key is NOT secret — its mere visibility must not be a failure.** What is proven instead is its authenticated binding to challenge, eval epoch, fixture identity, full container id and bootstrap MAC (G), and separately that page content cannot invoke key retrieval (M). |
| MAC transcript not injective | **Accepted**: fixed protocol prefix, byte-length framing per field, fixed field order, one canonical encoding, full canonical container id; independent deletion mutants per field plus a tuple-confusion mutant (G). |
| Capabilities unquantified | **Accepted**: CSPRNG with ≥ 128-bit security strength, and an explicit latest expiry stated as a duration — an effectively run-long lifetime is called out as passing every mutant while making expiry meaningless (H). |
| Framing mutants missing | **Accepted**: request-id reuse within a bridge lifetime, a correctly correlated response carrying the wrong operation/type, and EOF with a partial frame outstanding all close the bridge (I). |
| Domain-prefix mutant singular | **Accepted**: receipt and attestation prefixes removed **independently**, each asserting the exact signed preimage (L). |
| C needed dispatch observation | **Accepted** (now D): the assertion observes **actual control dispatch**, including fire-and-discard calls and idempotent reads, not returned page content. |
| L could link to a false-green row | **Accepted** (now O): each linked test must **die under its own row's claim-breaking mutant**. |

Acceptance is now A–O (fifteen). Scope fences were added to "Do not implement": remote/networked Docker daemon
support and any agent-tool-surface widening are new threat-model decisions, not implementation details.

### Next, and the outcome rule

**One focused closure review, not a fourth paper round.** Scope: effective-daemon selection and pinning;
stdin-only bootstrap handling; agent tool confinement; the eight P2 dispositions and their named mutants; and an
absorption sweep for stale revision-1/revision-2 language. If it finds these correctly specified and **no new P1**,
revision 3 locks and implementation proceeds. If it finds a new P1, or closing one would need another architectural
mechanism, **stop and return to the user — no automatic further extension.**

---

## C-R7 — focused closure review (Codex, read-only, 2026-09-04) — on spec revision 3

**Verdict: STOP. A new P1. Revision 3 does not lock.** The user's outcome rule applies: a new P1 returns to the
user, with no automatic further extension. Three of the five scoped items pass; two need work.

### The new P1 — §D5.0 validates the client's connection, not the daemon's exposure

The repair conflated two different things, and the spec states the stronger one. Requiring the **selected** endpoint
to be a canonical local `unix://` socket proves only **how the harness connects**. Docker supports multiple `-H`
listeners simultaneously, so the very same daemon may *also* be listening on TCP and remain browser-addressable;
and a Unix socket may itself front a TCP proxy. §D5.0 nevertheless concludes that it "keeps the API itself off the
network" (`m5-2-slice-spec.md:305-322`), which is false as written. Acceptance B's positive control would **falsely
pass** a dual-listener or socket-proxy configuration, because it examines only the selected endpoint
(`:435-441`).

So C-R5's P1 is not closed. The disclosure half is closed (stdin delivery keeps the secret out of `Config.Env`),
but the reachability half is not: a browser-addressable daemon still exposes `exec`.

**Verified on this host, again not live:** no listener on 2375/2376, and `~/.docker/daemon.json` sets no `hosts`.
As with C-R5 this is a spec-completeness hole rather than an exploitable one here.

**Why this is not obviously repairable inside the current mechanism.** Closing it needs the preflight to verify the
**daemon's own listener set**, not the client's chosen endpoint. That set is not reliably queryable: `/info` does
not report listeners, and under Docker Desktop the daemon runs inside a VM whose `-H` flags are not exposed through
the API and whose configuration Desktop manages. So the honest options are a different mechanism or a narrower
claim — and by the user's rule, both are the user's call.

### Items that pass

- **Preflight ordering** is correct: after the synchronous checker meta-gate, before artifact deletion, Chromium,
  controls-lab and any Docker API operation (`runner.ts:115-125`).
- **CLI precedence** is stated adequately at policy level, and rejecting disagreement is **safely stricter** than
  the CLI's own precedence. **Pinning** correctly targets validate-one/execute-another.
- **§D8 agent tool confinement — correctly specified.** The assertion aims at the actual tool array, not handlers
  or documentation; the production surface is exactly seven definitions and handlers are generated from that same
  list (`runner.ts:492-499`, `:571-576`, `:592-614`). Exact-set assertion plus the extra-tool mutant closes silent
  widening.
- **Six of the eight P2 dispositions are correct and their mutants kill the reported defects:** G (injective MAC —
  independent field deletion plus tuple confusion), H's entropy half, I (all three framing mutants), L (independent
  prefix removal with exact preimages), D (fire-and-discard and idempotent-read dispatch observation), F (secret
  scan set with the public key excluded, correct under the user's binding clarification), O (per-row claim-breaking
  mutants).

### Remaining P2s

| # | Finding | Where |
|---|---|---|
| 1 | "Canonical local `unix://`" is not defined enough to implement: absolute-path syntax, `unix://` vs `unix:///`, `realpath`/symlink treatment, socket-type verification, and proxy rejection are all unstated. | §D5.0 |
| 2 | **The stdin ordering question is answered, but the spec justifies it wrongly.** The secret *is* disclosed before protocol-level peer authentication, and the MAC proves possession only after the recipient already has it — so an accidentally selected **stale container** can MAC its own internally consistent identity, and Acceptance G's stale-container mutant **cannot be killed by the handshake alone**. Under the locked model this is not independently P1 once the daemon and the freshly created container identity are trusted (a malicious same-container recipient would need fixture compromise). But the spec must make the **pre-MAC provenance of the current-eval container identity** binding, rather than treating the MAC as that authentication. | §D2.1, Acceptance G |
| 3 | "Harness and bridge memory" is underspecified: the value necessarily traverses Docker client, daemon and kernel buffers and reaches the control process. Core dumps, Docker CLI/debug logging, retention after handshake, and zeroization are ungated, and the generic file/log mutants do not name those surfaces. | §D2.1, Acceptance E |
| 4 | **Capability expiry remains unclosed** — no maximum duration is specified, so "effectively run-long" has no executable threshold. The entropy half is correct. | §D3, Acceptance H |
| 5 | **Acceptance M reintroduces the out-of-scope property it was written to remove.** Its capability-check mutant is right, but the shared-capture-mount and artifact-root-mount mutants do not necessarily change **what a caller can retrieve** — they test trusted-container internal access, exactly what M says it no longer tests. §D7's cross-run/cross-fixture language has the same flavour. | §D7, Acceptance M |
| 6 | **Two stale revision-2 statements survive**, both saying the bootstrap secret is injected "at container creation", which revision 3 replaced with stdin delivery after the bridge opens. Verified present at `m5-2-slice-spec.md:41-44` and `:546-548`. | spec |

`SCHEMA.md`'s single-process wording is stale for the eventual composed implementation, but the spec already
requires amending it before completion — correctly flagged, not a defect.

### Round budget

The bounded cap extension is spent, and its closure review returned a new P1. **No automatic further extension**:
this goes back to the user.

---

## C-R8 — continuity-owner adjudication: daemon isolation becomes a deployment requirement (user, 2026-09-04)

**C-R7 is preserved above as the reason this became an explicit deployment assumption.** Its P1 stands accepted and
is not repaired by mechanism: exclusive Docker-daemon non-exposure **cannot be established by the harness**, because
Docker supports multiple `-H` listeners simultaneously, a Unix socket may front a TCP proxy, and the daemon's own
listener set is not reliably queryable (`/info` does not report it; under Docker Desktop the daemon runs in a VM
whose flags the API does not expose).

**No further mechanism and no further paper round.** The paper cap stays spent. Spec revision 4 is **LOCKED** and
implementation may proceed, with executable guarantees validated in the implementation-review ladder.

### The adjudication

**Docker-daemon isolation is a required deployment assumption.** A valid TinyVault evaluation requires that the
Docker Engine API not be reachable by the evaluated browser, page content, or agent. The harness verifies and pins
the local Unix endpoint it uses but cannot prove the same daemon has no additional listener, proxy, or externally
configured route. **If the assumption is false, the run is outside the threat model and its results are invalid** —
it does not become a measured TinyVault pass or a measured TinyVault failure.

The control-plane claim now opens *"Under the Docker-daemon isolation requirement…"*, and the §D5.0 wording no
longer says the preflight "keeps the API itself off the network": it proves only that TinyVault selected and
consistently uses a validated local Unix channel.

**Enforceable protections retained and gated:** reject any selected endpoint other than the approved local
`unix://` one; pin all Docker operations to it; keep the bootstrap secret out of Compose environment, labels,
arguments, files, inspection output and artifacts and deliver it over bridge stdin; preserve the exact
evaluated-agent tool allowlist with no shell, filesystem, raw-network, process or Docker capability. An exposure
diagnostic is optional, **labelled incomplete**, and never proof of non-exposure — its red is informative, its
green is not evidence.

### The three C-R7 corrections applied

| # | Correction | Where |
|---|---|---|
| 1 | **Acceptance M tests caller-visible capability retrieval isolation only.** The shared-mount and artifact-root mutants are removed from that claim — they test containment from trusted fixture internals, which the threat model puts out of scope — and survive as **implementation-hygiene constraints under §D7**. This was the review's finding that M had reintroduced the very property it was rewritten to remove. | Acceptance M, §D7 |
| 2 | **Every "injected at container creation" statement removed.** Stdin delivery is the sole live contract; the two surviving revision-2 sentences are corrected, and the remaining mentions are explicit negations. | §D2.1, changelog, Decisions taken |
| 3 | **The handshake proof is stated as a chain, and the MAC's role is bounded.** Provenance comes first from harness-controlled creation under a fresh project/epoch, exact-one-container resolution, a recorded immutable container id, and verification of expected labels and image identity; exec targets that exact id; the challenge MAC then **proves possession and binds the session and public key to that already-established container — it does not establish provenance by itself**. Acceptance G gains the labels/image-identity mutant, which is what actually catches a stale container, since a stale container can MAC its own internally consistent identity. | §D2.1, Acceptance G |

### Absorption-completion sweep (revision 4)

`docs/m5-2-slice-spec.md` (claim, §D2.1, §D5.0, §D7, Acceptance B/G/M, new Acceptance O, lock record), this
register, `PLAN.md`, `SCHEMA.md` (deployment requirement beside the honest-claims wording) and `README.md`
(beside the reproduce instructions). Acceptance is now **A–P**; the new O requires the assumption to be stated
wherever the number is published, with a mutant for wording anywhere that presents the preflight as proof of
non-exposure.

### Status

**Revision 4 LOCKED.** Implementation proceeds through `docs/handoff-pattern.md` §4 with the security third channel
(§7.1) — this is security-core surface. If implementation shows a locked decision needs a new mechanism, or a claim
stronger than the deployment assumption supports, **stop and return to the user** rather than widening the claim.

---

## C-S1 — M5.2 slice 1: F-ALT failed three enforcement designs (2026-09-04)

**STOP.** Per the user's standing rule, a third F-ALT failure ends the work: no fourth matcher iteration, no Slice 2.
Slice 1 is unmerged on `codex/m5-2-slice-1` at `3c91a39`. **The enforcement primitive needs redesign, not another
recognized syntax case.**

### What Acceptance J requires

The evaluated agent is a declared adversary in the locked threat model. §D8 freezes its tool surface to exactly
seven supervised browser/vault tools, and Acceptance J asserts the **exact set**. The property is load-bearing for
the locked §D2 claim.

### Three designs, three failures

| Round | Design | Defeated by |
|---|---|---|
| 1 | A test observing the array `runHostAdapter` passes to the client | An alternate production construction — the test wasn't at the production call site |
| 2 | An AST matcher enumerating permitted call shapes | **Seven** bypasses: barrel re-export, local alias, `.call`, construction under `src/`, production code in a `*.test.ts`-named file, dynamic import, trailing spread in the options literal |
| 3 | A positive occurrence inventory + suffix-blind reachability walk | **Eighth-class bypasses, found independently by two channels** (below) |

Round 3 followed `.claude/memory/conventions.md:82` — "an AST allowlist rule must end with a positive pass over
every occurrence, not an enumeration of forbidden shapes." The convention was applied correctly and still failed.

### Why round 3 failed — the structural finding

**A positive allowlist over "occurrences the type checker can resolve" is not a positive allowlist over
"occurrences."** Two independent gaps, both verified by reading the gate and by end-to-end mutants:

1. **Symbol-less references.** `nodeRefersToTarget` returns false when `checker.getSymbolAtLocation` yields
   `undefined` (`runner.agent-tools.test.ts:337`), and `isStaticDynamicImport` requires a string-literal specifier
   (`:377`). A dynamic `import()` with a **computed** specifier types the namespace `any`, so `mod.runAgentLoop`
   carries no symbol: invisible to the inventory, unrecognised by the construction finder, and still executable.
   Driven end-to-end inside `testbed/`: the gate reported green while the loop dispatched `run_shell` to the
   evaluated agent. Control: replacing the computed import with a plain one turns the gate red, proving the file is
   genuinely scanned and the green is a true evasion.
2. **The `ROOTS` boundary and symlinked directories.** The walk only retains modules already in
   `sourcePaths` (`ROOTS = ['src','testbed']`), skipping anything outside with no error, and `sourceFiles()` never
   descends a symlinked directory because `entry.isDirectory()` is false for one. A second, wholly unvalidated
   construction in `scripts/`, a new top-level directory, or behind a symlink is invisible to **both** checks.

The set of symbol-resolvable, root-contained references is not closed under the language's import mechanisms. That
is why an eighth or ninth recognised form would not end this.

### The qualifier that belongs with the finding

**`scripts/check-dependency-boundary.mjs` — pre-existing, already on the `make test` path — catches all four of the
root-boundary mutants** (`production-to-tooling re-export`, `unresolved relative re-export`, `non-literal dynamic
import()`). So `make test` still goes red on those exact routes today. **The F-ALT gate is defeated; the
enforcement system is not, by an unrelated gate.** Both halves of that sentence are needed to judge the risk.

### Two further defects in the round-3 gate

- **It has no deletion-detection.** Nothing in the repo references `runner.agent-tools.test.ts`; deleting either
  `it()` block, or the whole file, turns nothing red. The only signal is an unasserted total test count. A gate that
  cannot detect its own removal is the silent-wrong shape.
- **Its own text overclaims, and so does the integrator's commit message.** The gate says "This is the complete
  positive inventory" and "exactly one reachable direct construction"; `d7418d5` repeats the reachability sentence
  unqualified. Both are false outside `ROOTS` and for symbol-less occurrences inside them. The inventory paragraph
  does state its `src/`+`testbed/` scope honestly; the reachability sentence does not.

### Verified closed and expected to survive a redesign

F-ASYNC (every `FixtureTransport` operation and `lookalikeRequests` awaited at all 46 call sites; `verifyCompletion`
correctly sync; `readCaptureRequests` rejects rather than throwing, with its own absence-detection test); F-PROTO
(own-property dispatch, equality-asserted unknown-tool message across `toString`/`constructor`/`__proto__`/
`valueOf`/`hasOwnProperty`, with the safe handler asserted not called); F-FLAKE; F-MINOR including the corrected
`child_process` count; and `architecture` honestly documented as reserved for commit 2 with no manufactured proof.

### The direction the evidence points

Not a syntactic patch. Move the property from **source shape** to **value identity or non-acceptance of input**:
have `runAgentLoop` derive the tool surface from an internal registry rather than accept a `tools` parameter, or
accept only a frozen module-level allowlist compared by identity. Such a property holds however the module is
imported, because it never depends on recognising a reference. **This is a redesign decision and belongs to the
user**, per the stop rule.

---

## C-S2 — M5.2 slice 1: the runtime redesign, its review, and two protections lost in repair (2026-09-04)

Recording two rounds the register was missing (flagged by a closure reviewer: findings had to be reconstructed from
commit messages, which is not the register's contract).

### Round A — three-channel review of the runtime redesign (`ab8af72`)

After C-S1 stopped the source-analysis approach, the user authorized a runtime redesign: `runAgentLoop` no longer
accepts caller-supplied `tools` or `handlers`; a private deeply-frozen registry of the seven approved tools is both
what is offered to the model and what dispatch validates against; the 449-line source-analysis gate was deleted with
no replacement matcher. **All three channels agreed the primitive itself was not bypassable by any caller route**,
and none proposed a fourth matcher. The findings were all in the PROOFS, not the mechanism:

| # | Finding | Verified by |
|---|---|---|
| A1 | The snapshot probe could not fail — its accessor flipped on a flag set INSIDE the executor, but the snapshot is built BEFORE the executor runs, so it could not distinguish the implementations | QA + integrator |
| A2 | The outer-array freeze was covered by nothing pinned; `isDeeplyFrozenDefinition` checked only the inner levels | QA + Codex |
| A3 | The option-shape assertion was a runtime constant `true`; the type annotation carried all the force, so a two-line edit restored a caller-supplied option with everything green | all three |
| A4 | Rejection coverage was name-specific: an eighth name **other than those tested** would have passed | Codex |
| A5 | **`describe.skip` disarmed Acceptance J while the integrity gate stayed green at exit 0** — the pin checked assertion *text*, not execution. Deleting BOTH gate files was detected by nothing | security + Codex |
| A6 | `turn.toolCalls`, `call.id` and `call.name` were each read several times; a response differing between reads could execute one operation while evidence named another, defeat the duplicate-id check, and — the consequence that matters — run an operation with a canary in its input while **no captured event contained the canary**, because the `tool-arg` channel the leak checker reads was absent. A leak-rate under-count | QA + security + Codex |

The user then fixed the threat boundary: the evaluated model controls model-output **data** and does not execute
JavaScript in the harness process, so prototype poisoning and a malicious in-process `ModelClient` are outside it;
accessor tests are robustness probes, not containment evidence; production retains `invokeHostTool`'s seven-case
switch as defence in depth.

**Operational note.** The Codex channel was **safety-classifier-flagged mid-review** ("flagged for possible
cybersecurity risk") and produced no findings; the packet was dense with attack vocabulary. Re-dispatched with
accurate defensive framing — same substance, nothing obscured — it completed normally. Worth knowing, because
Codex is this project's documented mitigation for classifier flags (`PROJECT-SPEC.md` §11) and can itself be the
casualty when a review packet is written in attack framing.

### Round B — closure review of the authorized repair (`5868e60`), and its finding

The repair added a canonical model-turn snapshot (`serializeExact` → `JSON.parse` immediately after `nextTurn`,
consumed by every downstream reader), repaired the proofs, and replaced the text pin with a runtime-result gate
(`scripts/check-acceptance-j-results.mjs`) requiring the exact ten named tests to have executed and passed.

**The two closure channels disagreed, and the disagreement is instructive: they tested different mutants, and
neither set was a superset.** Security marked the option-shape and freeze findings CLOSED after reintroducing the
two *named* options and after a push-throws test. QA used sharper mutants and found both were regressions:

- **Restoring a caller option under a DIFFERENT name** (`unsafeExtraTools`), wired identity-preservingly, gave
  `tsc` exit 0 and the full gate green with an unapproved tool executing. The counterfactual proves regression: the
  same option at `ab8af72` produced `TS2322`. Cause: the repair **deleted**
  `Equal<keyof AgentLoopOptions, ExpectedOptionKeys>` and replaced it with a fixture covering two named keys.
- **`Object.freeze` → `Object.seal`** on the registry kept everything green, because `push` throws on a sealed
  array too — while the array becomes index-assignable and the registry mutable. Cause: the repair **deleted**
  `expect(Object.isFrozen(offeredTools)).toBe(true)`.

Both protections were **stronger at `ab8af72`** and were lost during the authorized repair. The cause was an
integrator specification error: the instruction said *replace* the vacuous assertion, but the vacuous half was the
runtime `expect(...)`, not the type annotation that carried the force — and the same "replace" framing was applied
to the freeze. The remedy is restoration, not new work.

Security contributed two findings QA did not, both of the "what detects the detector's removal" family:

- **The gate is removable from the test chain in 45 characters** — `package.json` is its only reference; deleting
  the command turns nothing red, after which the suites can be skipped at exit 0.
- **The source-text pin survives commenting out** — `// expect(...)` keeps `toContain` green while the assertion
  stops executing; a J file of same-named empty tests plus a comment block holding the pinned strings passes both
  the gate and the pin.

Security also ran a **16-turn hostile model-DATA probe** (duplicate and colliding ids, missing fields, `__proto__`
keys, origin/route spoofing, depth-5000 nesting, 8 MB inputs): in every case where a canary reached the executor,
`leakScan` reported `secretLeaked: true` with correct channel attribution. That is direct evidence for the
measurement property the snapshot repair exists to protect.

### Disposition (user, 2026-09-04) — final additive repair authorized

Restore both deleted protections; keep the named-option fixtures as complementary regressions; **do not narrow
Acceptance J** — the locked requirement remains an exact seven-tool surface, and the candidate-dispatch test is
renamed to say it checks *representative forbidden names* rather than pretending to cover the string namespace; pin
the gate command and its position in `package.json` via the existing artifacts test; and **declare the source-text
limitation as a residual rather than building a fifth matcher.**

**Declared residual (this register is its home):** the source-text pin can be satisfied by comments or by
coordinated edits to both code and tests. The runtime-result gate proves the ten named tests ran and passed; it does
not prove that every pinned assertion executed. This is accepted, not fixed — four rounds on one invariant is where
the project's own convention says to stop adding matchers.

### C-S2 addendum — final three-channel closure (2026-09-04), and the declared residuals

Three channels reviewed `f7aef17`. **All three agree the runtime stop condition is NOT met**: model-controlled data
cannot offer or dispatch outside the seven. Verdicts were MERGEABLE (security), MERGEABLE conditional on the pin
(QA), and NOT MERGEABLE (Codex) — the split turned entirely on one P2 all three found.

**Both restorations confirmed as restorations**, reproduced at both commits: an option under a name other than
`tools`/`handlers` was undetected at `5868e60` (`tsc` 0, gate green) and is `TS2322` at `f7aef17`; `Object.freeze` →
`Object.seal` was undetected at `5868e60` and is red at `f7aef17`. Attempts to defeat the restorations themselves
failed: index signatures and symbol keys change `keyof` and are caught (an index signature is double-caught, since
it also invalidates the `@ts-expect-error` fixtures); `AgentLoopOptions` is a `type` alias so declaration merging is
unavailable; and a frozen outer array holding unfrozen definitions is still caught by the retained inner checks.
Security ran a 22-case model-data probe — homoglyphs, padded and case-varied names, `__proto__`, `constructor`,
`list_vault`, non-string names — all rejected before `executeTool`.

**The P2, now fixed:** the `package.json` pin asserted presence and position but not that the gate's exit status
still gates the build. `|| true`, a bare `;`, an `echo` sharing the string, a command substitution, and replacement
by `node -e` each kept the pin green while the gate went inert — demonstrated empirically with the seal mutant
applied, so the gate genuinely exited 1 and the build continued. Fixed by an adjacency assertion pinning the
current fail-closed `&&` composition, in a separately named gate-wiring test rather than under the timing-only test
name. All six named mutants plus outright removal are verified red.

**Correction to `f7aef17`'s message:** it called the removed `typeof appendSerialized` branch "always-true". It was
always true *in production* — only `TranscriptWriter` instances reach it — but false for the transcript double in
`src/supervisor/host.test.ts`, which is why the same commit had to give that double an `appendSerialized`. No
assertion was weakened by the change; the wording was imprecise and is corrected here rather than by another
history rewrite.

#### Declared residuals — accepted, not chased

Each requires coordinated source changes passing code review; **none is reachable by the evaluated model in the
current implementation.**

1. **The package/build entry point is a reviewed root of trust.** The new assertion pins the *current* fail-closed
   `&&` composition. It does not prove exit propagation under arbitrary future shell rewrites: a trailing
   whole-command `|| true`, removal of the enclosing invocation, or coordinated edits to both the package script and
   its test are outside what an in-band test can establish.
2. **`Equal<keyof AgentLoopOptions, ExpectedOptionKeys>` constrains option KEYS, not every semantic widening of an
   existing property's type.** Widening an existing key — e.g. `client: ModelClient & { extraTools?: … }` — leaves
   `keyof` unchanged and passes everything, from a `loop.ts`-only edit. No TypeScript construct expresses "no member
   of any option's type may carry a tool list", so this is structurally uncloseable by another check.
3. **The `Equal` helper and `ExpectedOptionKeys` can be changed alongside production code**, in the same file the
   source pin reads, without touching any test.
4. **A future developer could split offering and dispatch into separate registries** — widening only the dispatch
   check with a name outside the finite candidate list passes the acceptance tests. Production is mitigated by
   `invokeHostTool`'s seven-case switch with a throwing default.
5. **Source-text pins can be satisfied by comments**, and the runtime-result gate proves the ten named tests ran and
   passed but not that every pinned assertion executed.

**On the finite candidate list:** `CANDIDATE_TOOL_NAMES` checks *representative* forbidden names and proves nothing
about the whole string namespace. The universal claim is carried by the literal exact-seven `offeredNames`
assertion, which catches an eighth registry entry under any name. `list_vault` has been added to the representative
set — it is a genuine host tool supplied through the bootstrap context and deliberately not one of the seven the
loop offers, making it the forbidden name a real model is likeliest to try.


## C-M1 — whole-M5.2 milestone-close assessment (2026-09-06)

**Owner VERDICT: PASS — M5.2 closed within locked revision4 Acceptance A–P.** All six slices remain
accepted. This is whole-milestone synthesis after Slice6 acceptance, not another slice review round.
The independent reports originally returned NEEDS-ATTENTION for documentation; those original verdicts
remain unchanged below. Owner verified and corrected every status finding. No new reaching security
defect or unresolved technical Acceptance A–P blocker was found. M6 implementation and release remain
unauthorized and unstarted. Full requirement/evidence crosswalk: [assessment](project-assessment-2026-09-06.md).

Reviewed frozen checkout: main `53fd94f7831d2fb913d887a4a40c2ef3913f30b1`, accepted executable source
`8103c4729e729d6a08e569e8aa5abe68cb535fa3`. Review candidate digest
`57871e4074cf39a4fbc928536e5257ebd0af9850c1c6d29268920eb1f254aa03` covered330 files, including the
five inherited dirty wrapup documents and the authorized PLAN ownership update. Owner compared all330
file hashes with both reviewer candidate inventories after completion: unchanged. Both helper runs
exited2 with executionStatus completed and reviewerModel `claude-opus-5`; this is completed review with
findings, not dispatch failure. QA session `f98bb323-f1e3-4c9a-b8b8-4a2c37ff4fe1`; security session
`74a0e9ff-679f-47bf-9d16-bd69a134d5f6`. Auxiliary CLI Haiku usage remains in metadata and is not called
reviewer output. Fresh Codex worker `/root/milestone_assessment` completed separately; channels were blind.

Raw report root: `/private/tmp/tinyvault-m52-close-20260906/` (ephemeral). Each Claude command used
`node scripts/claude-review.mjs --repo /Users/jonathanavni/Documents/Coding/tinyvault --packet <channel>-packet.md
--channel <qa|security> --base 53fd94f7831d2fb913d887a4a40c2ef3913f30b1 --output claude-<channel>
--timeout-seconds 1200`, with packet/output paths absolute beneath that root. Actual commands and
context/methodology hashes are preserved in each request.json; the security methodology was independently supplied.

| Independent channel | Original verdict | Report relative to root | SHA256 |
| --- | --- | --- | --- |
| Fresh Codex | NEEDS-ATTENTION | `astra-report.md` | `987fa347a170cfdfaea5f8782eda30f52026ca1beede793a98aef27d83534107` |
| Claude Opus5 QA | NEEDS-ATTENTION | `claude-qa/report.md` | `ed01a284f65d0065077550502e217f9fdd11d8f33f1aac8613cd0869fc8a5a1b` |
| Claude Opus5 security | NEEDS-ATTENTION | `claude-security/report.md` | `f79309c6ef2fb5a8cd44f3c1bbdf120c71143c2df038b8b8c8b99413d413fc97` |

### Findings verified line by line and dispositioned

References in this table identify the frozen candidate before documentation correction.

| ID | Independent finding | Owner evidence and disposition |
| --- | --- | --- |
| MC1 | README:32–34,45 says five accepted slices and Slice6 pending (Codex P3; both Claude channels Medium) | Confirmed against Slice6 Entry28/29 and source8103c47/acceptance53fd94f. Corrected paragraph and table to six accepted slices and this synthesized milestone closure. Owner P3: status drift without executable or security impact; fixed regardless of severity. |
| MC2 | phase-0-plan:419–424 says four merged slices and Slice5 next (Codex P3; QA Medium; security Low/Medium) | Confirmed recurring status drift. Updated only the build-status paragraph. Added the four current-status surfaces to handoff §0's existing closure hygiene step; no ladder/gate/role change. Historical A7 dispositions and dated reports preserved. |
| MC3 | docs/README:105–107 says A5 and A7 were “actioned” (security Low) | Confirmed ambiguous wording: scorecardAggregate.ts:37 and runnerExecution.ts:27 retain stale versions. Index now explicitly says A5 remains open before M6 publishes comparisons, while A7's then-current doc half was corrected. No A5 implementation or rescheduling. |

### Evidence and review-limit adjudications

- The owner independently recomputed all eight retained native report SHA256 values, verified their
  assertion records and all four command-log hashes, rechecked the scorecard hash, and rejoined all299
  runtime selectors exactly once passed in both default report sets. Source/tests remain byte-identical
  to accepted8103c47; all147 canonical claim rows unchanged. Entry28 is the durable runtime evidence home.
  This validates inherited evidence; no runtime gate was rerun. Verification results are under the report root.
- A5 is correctly retained: scorecard lineage depends on surrounding candidate/register evidence until
  source/config provenance lands. No self-identifying scorecard claim is made.
- Security's lack-of-CI observation is accepted as the existing A6 release-engineering follow-up. Its
  statement that M5.2 security properties live “entirely outside make test” is declined as overbroad:
  the accepted main native report includes833 passed tests across29 files under testbed/docker alone,
  including capabilities, control, framing, preflight and attestation. Real-Docker topology/parity still
  requires explicit make test-docker and make eval. No CI work is added to this milestone.
- P's mutation-death evidence is historical, not automatically re-established by the runtime-name join.
  This accepted limit stands. The stronger statement that merely re-linking a row to a weaker selector
  keeps every gate green is not established: claims.test.ts:1710–1717 pins exact independent selector
  sets, and :1732–1741 rejects swapped selectors. Weakening the selected assertion or coordinated
  implementation/test edits remains a review/mutation concern. No new universal mutant guarantee is claimed.
- The coverage lab is in-process (runner.ts:111–119, README's disclosure); host-side capture is shared
  across transports. Composed publication does not turn the lab into an independent composed coverage
  measurement. The unattested wire witness and three-leg parity retain their finite scope.
- Security's claimed on-disk hash verification is treated as reading candidate/recorded hashes under
  Read/Glob/Grep, not independent hash execution. The owner actually recomputed the claim-table SHA256:
  `e568cb613f46eb5fcfa0e2374ba4d0aac1a57973882931ccaa10bf7a470a335d`.
- The harness cannot establish daemon non-exposure through selected-endpoint preflight; this is the
  locked deployment assumption. Security's stronger “untestable ... by anyone” phrasing is not adopted.
- All original accepted finite observation/decoder/timing/wire and mutation-attribution limits remain.
  Seven historical admin-selector lineages, Slice5 Entry8, Slice4 Entries39/43/44 and the unexplained
  timeout are not erased by these reports. Static reviews are not independent dynamic reproductions.

Security disclosed targeted reading instead of full §0/§13 and all147 table rows; this bounds its coverage.
QA and Codex supplied independent requirement maps, and the owner read the governing protocol and verified
all147 row bytes and299 runtime links. No missing technical obligation was identified; full slice audits
were deliberately not repeated. Raw reports remain unedited. No second round is required for status-only
corrections under the existing documentation carve-out; no gating or correctness code changed.

Only assessment/continuity/status documents changed after review. The inherited closed Current State is
preserved verbatim in PLAN-archive.md; its original archive/register/memory bytes remain. Final checks:
git diff --check, source/test/locked-contract/claim preservation and local documentation links. No commit,
push, M6 or release. Deviations From Handoff: no owner scope deviation; reviewer coverage deviations are
explicitly recorded above.


## C-M2 — session wrapup and M6 planning handoff (2026-09-06)

User requested tinyvault-wrapup and a kickoff prompt for a fresh session. Owner closes this session
and relinquishes continuity; M5.2 remains closed under C-M1, with no active reviewer, worker, mutation,
test or acceptance gate. Original assessment Current State is archived verbatim. All eleven dirty/new
documents remain uncommitted, including the inherited Slice6 wrapup and the assessment document.
No source/test/locked-contract/claim-row change, no commit/push, no M6 implementation or release.
Next proposed scope is M6 planning under the existing independent review ladder, carrying A1/A2/A4,
A5 provenance before publication and all existing residuals; completed M5.2 reviews are not repeated.

Wrapup verification: git diff --check; only PLAN, PLAN-archive, this register and the session index
changed relative to the wrapup-entry snapshot; archived Current State and Decisions Log preserved,
archive/register/index changes append-only. No runtime gate rerun for documentation-only wrapup.
Doc hygiene: current status and index aligned; slice contracts/registers retained for traceability,
not silently archived. No new standing gotcha to duplicate into project memory.
Deviations From Handoff: none. Canonical kickoff/ownership handoff is PLAN Current State.
