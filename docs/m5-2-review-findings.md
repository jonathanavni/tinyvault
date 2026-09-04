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
