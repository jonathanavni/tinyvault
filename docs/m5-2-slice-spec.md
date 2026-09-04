# M5.2 slice spec — Docker-composed fixtures behind one implementation, two transports

**Status: BLOCKED — revision 2 did NOT lock. Paper round 3 found one P1** (`docs/m5-2-review-findings.md`, C-R5)
**and the three-round paper cap is now spent.** The stop rule applies: no published control port, no silent
fallback, no repair without the user.

**The P1 in one paragraph.** Revision 2 isolates the fixture control socket and then leaves the daemon that fronts
it unconstrained. It forbids *mounting* the Docker socket into a container but never forbids or preflights a
**network-addressable Docker endpoint**, and Acceptance B inspects Compose publications rather than the daemon
selected by the Docker context or `DOCKER_HOST`. A conforming deployment pointed at a browser-addressable Docker
TCP API would let hostile page content read the bootstrap secret from `Config.Env` by container inspection and
`exec` into the exact container to reach the internal socket — **with no fixture compromise**, so it is squarely
inside the locked threat model. Verified not exploitable on the development host (`DOCKER_HOST` unset; the active
context is a Unix socket): this is a spec-completeness hole, not a live one. The repair is bounded and adds neither
a control port nor a fallback — preflight the daemon channel, stop injecting the bootstrap secret through Compose
environment, and freeze the evaluated agent's tool boundary — but it is the user's call.

**Read the sections below as the design plus the constraints that survived round 3.** The threat model is locked
and unaffected; §D2's topology, §D2.1's trust anchor and framing, §D3, §D4 and §D7 all survived, and round 3
recorded no P1 on indirect invocation — the question that motivated the round. Eight P2s, including two acceptance
criteria that test the wrong property, are listed in C-R5 and are not yet applied.

## What changed from revision 1 (read first)

1. **A threat model is stated and locked** (next section). Revision 1 had none, which is how an unsupportable
   absolute got written into §D2 and survived a round.
2. **The §D2 claim is replaced with the user's exact sentence.** It no longer promises anything about a
   compromised fixture process, and it explicitly admits that declared data-plane requests may cause capture and
   receipt issuance, M5-C2 included.
3. **The sidecar is removed as a required security mechanism.** Under the locked boundary it buys nothing: it
   defends against fixture-process compromise, which is out of scope, while introducing an unsound page↔sidecar
   state-transfer boundary that round 2 showed has no surviving implementation. One container per fixture.
4. **The control transport is a Unix socket entirely inside the fixture container** — never published, never
   bind-mounted (bind-mounting is also non-functional on this host; see §D2.1) — reached by a long-lived
   `docker exec -T` bridge that connects to it from inside.
5. **The exec trust anchor is repaired** (§D2.1): a fresh per-eval, per-fixture bootstrap secret injected at
   container creation, exec against a resolved immutable container id rather than a service selector, a fresh
   challenge, and a MAC binding challenge, epoch, fixture identity, container identity and public key. A
   self-announced key is not trust.
6. **Round 2's other valid findings are absorbed**: capability entropy/epoch/expiry/single-use/restart-invalidation
   (§D3); captures transferred over the authenticated control transport with **no shared artifact-root or
   cross-fixture mount** (§D7); framing with request ids, one stdout writer, and close-on-desynchronisation
   (§D2.1); and testable domain separation inside the signed bytes (§D4).
7. **§D4 branch (i) is kept and renamed** from "sidecar-only" to **fixture-control-only, operation-scoped
   attestation**.

---

## Threat model (LOCKED — user, 2026-09-04)

Everything in this spec is claimed against this boundary and nothing beyond it.

- **The adversary is the evaluated model/agent and hostile page content executing in Chromium.**
- **The harness and the fixture server/container are trusted evaluation infrastructure.**
- **Compromise of a fixture process invalidates the run and is out of scope.** M5.2 must not claim containment
  after that compromise. Any acceptance criterion that appears to test it is testing the wrong thing.
- **A request through the declared page data plane may legitimately cause capture and completion-receipt
  issuance**, including the already-declared M5-C2 exact-endpoint residual (`SCHEMA.md:319-335`). This is fixture
  semantics, not a defect, and not something the composed transport is expected to change.
- **Page content must not be able to invoke administrative control operations**: registration, receipt retrieval,
  capture retrieval, arbitrary event attestation, or capability/key retrieval.

That last line is the whole security question for this slice. Round 3 attacks it and nothing else.

---

## Task

`PROJECT-SPEC.md` goal 3, the launch checklist and the first-week milestones all call for **Docker-composed
fixtures**. M5 shipped in-process Node HTTP servers instead. The 2026-09-03 project assessment found the deviation;
the user adjudicated it on the same day (`PLAN.md` Decisions Log): Docker-composed fixtures are the M5 acceptance
path, built now as M5.2, and **the spec is not amended** — the code moves to meet it.

Build that, under four constraints the user set when they took the decision:

1. **One fixture implementation, two transports.** The existing in-process servers stay the fast harness — `make
   test`, the capture-coverage gate, the hostile browser suite — and stay Docker-free. `make eval` runs *the same
   fixtures* Docker-composed.
2. **No silent fallback.** A missing daemon is a loud red before any run starts, never a downgrade to the fast
   transport. The parity gate must not be satisfiable by the in-process transport alone.
3. **A control plane the hostile page cannot reach by topology, not by CORS**, with authenticated, run-scoped
   registration. The page-controlled attribution residual must not become a registration hole.
4. **A canonical parity gate**: the same scenario through both transports, transport nondeterminism normalized,
   then identical security-relevant evidence shapes, completion outcomes and adjudication.

---

## Required Reading

- `PROJECT-SPEC.md` §5 (the as-built note recording the in-realm inject and this pending adjudication), §7.
- `SCHEMA.md` — the declared limits, especially the fixture-capture and post-capture-integrity claims
  (§ "corroborating only", the single-process attestation sentence). **This slice changes what that sentence can
  honestly say; see §D4.**
- `docs/m5-slice-spec.md` §D1–D2 — the shared login-fixture core and the lookalike two-origin design being ported.
- `PLAN.md` Current State (M5.2 block) and the Decisions Log entry dated 2026-09-03.
- `docs/project-assessment-2026-09-03.md` finding 3.

---

## Context — the seams, as they actually are

A read-only Codex reconnaissance of the fixture layer (2026-09-04) mapped the harness↔fixture seams. Its findings
below are cited because two of them **correct** the framing the M5.2 PLAN block was written with. Do not re-derive
these; do challenge them.

**Corrected assumption 1 — there is no signing-key distribution.** Each fixture generates its own Ed25519 pair at
startup (`testbed/fixtures/shared/loginFixture.ts:81-100`) and hands the harness its **public** key as a live Node
`KeyObject` (`testbed/runner.ts:240-249`). The Docker boundary therefore needs *serialized public-key transport and
a binding of key to fixture identity*, not secret distribution. This is easier than assumed, and the trust question
moves to: how does the harness know the public key it received belongs to the fixture it thinks it does?

**Corrected assumption 2 — the sharpest seam is a signing oracle, not registration.** `attestEvents` signs
`{runId, sha256(bytes)}` over **harness-supplied bytes the fixture never observed**
(`testbed/fixtures/shared/loginFixture.ts:198-207`), authorized only by "that runId is registered". Exposed as a
network endpoint on a page-reachable address, that is an oracle that will sign an attacker's evidence bundle for any
registered run. `SCHEMA.md:344-355` already disclaims independent authenticity for exactly this reason, and
`SCHEMA.md:351-359` states the claim as *single-process* post-capture integrity.

The full seam inventory (all in-process today, all needing a wire form or a deliberate exclusion): startup and
origin discovery; run registration; public-key transport; receipt retrieval (`takeReceipt`, a **destructive**
map read); live completion verification; event attestation; authorized capture transfer (**a shared-filesystem
convention**, `<artifact>/fixture-captures/<runId>.requests`, reconstructed independently by the offline checker at
`testbed/checkers/offline.ts:244-267`); unauthorized and lookalike capture retrieval; the HTTP-bypass test helpers;
controls-lab observation; teardown; and the lookalike C↔L wiring, which is closures both ways.

**What protects all of it today is object possession.** The data-plane router exposes only `/login`, configured
routes and configured pages (`testbed/fixtures/shared/loginFixture.ts:313-353`). No control operation has an HTTP
route at all. That is the property M5.2 spends, and must buy back with topology plus authentication.

If the current methods became unauthenticated page-reachable endpoints, the recon's answer to "what would the
hostile page need" is: **register** — reachability plus an unused runId (duplicate detection prevents overwrite but
not winning a race for a predictable id); **read/delete a receipt** — reachability plus a runId; **read a capture** —
reachability plus a runId; **use the signing oracle** — reachability, a registered runId, and attacker-chosen bytes;
**complete another run** — additionally that run's canary. Registration is not the only hole and is not the worst.

---

## Design decisions (revision 2 — rewritten against the locked threat model)

### D1 — One implementation, two transports, chosen at the seam not in the fixture

The fixture's *behavior* (routes, pages, receipt issuance, capture recording) is written once. What varies is how
the harness reaches it. Introduce a `FixtureTransport` with two implementations:

- `in-process` — today's direct object, unchanged in behavior. Used by `make test`, the coverage gate and the
  hostile browser suite. Docker never enters that path.
- `composed` — a client that speaks the control protocol (§D3) over the §D2.1 bridge to a fixture in a container.

The fixture object the runner consumes becomes a **client interface**, not a closure bundle. Today's `LoginFixture`
is a live API whose methods close over server state; the in-process transport keeps that by implementing the same
interface directly.

The existing `transport` field is a trap: it currently means "HTTP available vs the EPERM no-socket fallback", and
the fallback is *named* `in-process` (`testbed/fixtures/shared/loginFixture.ts:137-151`). Docker-over-HTTP would
satisfy today's `assertHttpFixture` guard unchanged. **Renaming is in scope**; the guard must distinguish
*architecture* (in-process / composed) from *reachability* (http / no-socket), because §D5's no-fallback rule is
enforced on the first and today's capture-red rule on the second.

### D2 — The claim, and the topology that supports it

**The claim (locked wording, user 2026-09-04):**

> Hostile page content and the evaluated agent cannot directly address the fixture control transport, obtain its
> capabilities, retrieve control-plane state, or request event attestation. Declared data-plane requests may cause
> the trusted fixture to record captures and issue completion receipts according to the fixture semantics,
> including M5-C2. Compromise of the trusted fixture process is outside the evaluation threat model and
> invalidates the run.

Nothing in this spec may state a stronger guarantee than that sentence, in code comments, `SCHEMA.md`, or the
scorecard.

**The sidecar is removed.** Round 2 established that no page↔sidecar state channel survives a compromised page
process — but under the locked boundary that compromise is out of scope, so the sidecar was defending against a
threat this slice does not carry, at the cost of an unsound state-transfer boundary. It adds no strength to the
claim above. Dropping it also drops every finding that existed only because of it.

**The topology:**

- **One container per fixture.** The fixture server and its control process live together; both are trusted.
- **Only page-origin TCP ports are published.** The lookalike fixture publishes its two page origins; nothing else
  is published, ever.
- **The control transport is a Unix socket entirely inside the container.** Never published, never bind-mounted.
- **The harness reaches it over a long-lived `docker exec -T` bridge** that connects to that internal socket from
  inside the container (§D2.1).
- **No control network port and no silent fallback** (§D5).

Why this satisfies the claim: page content executes in host Chromium and can address only published TCP ports. The
control socket has no TCP endpoint, no published port, and no host-side path — it is not addressable from a page at
any layer, which is topology rather than a header check. The remaining question is *indirect* invocation, and that
is §D3's job and round 3's target.

### D2.1 — The exec bridge, and a trust anchor that is not self-asserted

**Ruled out first:** a published control port (forbidden above), and a bind-mounted container-created Unix socket —
verified non-functional on this host (Docker Desktop for macOS, user, 2026-09-04): the socket file appears on the
host side of the mount but connecting returns `ECONNREFUSED`, because the file-sharing layer does not proxy
`AF_UNIX` across the VM boundary. The socket therefore stays *inside* and the bridge comes to it.

**Trust anchor.** Round 2 killed revision 1's handshake as circular: the sidecar self-announced its public key, and
the bridge was that key's first trust path, so "unexpected key" could not be checked. Repaired as:

- The harness generates a **fresh bootstrap secret per eval and per fixture** and injects it **when Compose creates
  the container** — before the container is reachable, and never derived from anything page-visible.
- The harness **resolves exactly one container id** for the fixture and **execs that immutable id**, never a
  service selector. A resolution that yields zero or more than one container is a hard failure (this is also what
  makes `scale > 1` safe rather than ambiguous).
- The harness sends a **fresh challenge**, and the fixture control process returns a **MAC under the bootstrap
  secret binding: the challenge, the eval epoch, the fixture identity, the container identity, and the generated
  public key.** Only then is that public key trusted for the run.
- **A self-announced key alone is not trust.** Any announcement without a valid MAC over all five values is a hard
  failure, never a retry against whatever answered.
- Bridge death is a red: the run fails, the outstanding operation is rejected on EOF, and there is no reconnection
  that silently rebinds and no downgrade to the in-process transport.

**Framing** (round 2, absorbed): length-prefixed frames with a declared maximum size; **request ids** correlating
each response to its request; **exactly one writer on stdout**; unsolicited, duplicate and late responses are
rejected rather than consumed as the next answer; `stderr` carries diagnostics only and is never parsed as a frame,
and stdout diagnostics must corrupt-and-close rather than be skipped; malformed or oversized frames **close the
bridge** — no resynchronisation, because a resynchronising parser is a request-smuggling surface; an operation
timeout closes the bridge rather than leaving a frame outstanding.

The Docker socket is **not** mounted into any container: the trusted host harness invokes the Docker CLI itself.

### D3 — Control operations and per-operation capabilities

The five administrative operations the locked claim names — registration, receipt retrieval, capture retrieval,
arbitrary event attestation, capability/key retrieval — are reachable **only** over the §D2.1 bridge, and only
under a capability.

- Registration is authenticated by the per-eval, per-fixture bootstrap secret (§D2.1).
- Registration returns **one capability per operation**, bound to `(fixtureId, runId, operation)`.
- **Capabilities carry cryptographic entropy** — never derived from a run id, a nonce, or anything rendered.
- **Bound to an eval/instance epoch**, so a capability from an earlier eval or an earlier container instance is
  invalid even for a recurring run id (run ids deterministically recur, `testbed/runner.ts:380-388`).
- **Expiry**, **per-operation scope**, and **single use** where the operation is single-use (§D4).
- **Restart invalidation:** a restarted control process must reject every capability minted before the restart. In-
  memory "used" state that resets on restart is a round-2 finding, not an implementation detail.
- **Unobservable to the page, and gated rather than asserted.** No capability or derived value may appear in page
  HTML, page URLs or headers, captured evidence, transcripts, artifacts, fixture access logs, bridge error text, or
  stdout diagnostics. The obvious wrong implementation recycles the run token the fixture *deliberately renders
  into the page* (`loginFixture.ts:355-363`), which the lookalike then copies (`lookalike-origin/index.ts:112-120`)
  — and that rendering is a read oracle for any predictable registered run id.
- Receipt retrieval becomes an **idempotent authenticated read** plus an optional acknowledgement; today's
  `takeReceipt` deletes on read (`loginFixture.ts:192-195`), so over a transport a dropped response would turn a
  completed run into an incomplete one. Offline replay protection already makes repeated retrieval harmless
  (`testbed/completion.ts:107-117`).
- The page-controlled attribution residual (`SCHEMA.md:332-335`) stays corroborating-only, and **neither its
  form-body path nor its query path** may feed any authorization decision (`loginFixture.ts:371-378`). Note the
  locked boundary makes the distinction sharp: a data-plane POST *may* cause capture and receipt issuance; it may
  never cause registration, retrieval, arbitrary attestation, or capability disclosure.

### D4 — Fixture-control-only, operation-scoped attestation **(branch (i), locked)**

"Keep attestation in-process and keep the claim" is not implementable: offline adjudication requires the fixture
signature **before** it parses events (`testbed/checkers/offline.ts:244-267`).

**Decided (user):** attestation is served by the fixture's control process, over the §D2.1 bridge, under an
attestation capability. Renamed from "sidecar-only" to **fixture-control-only** now that the sidecar is gone.

> **It retains only post-capture integrity. It does not establish independent capture authenticity.** The control
> process signs a digest of runner-supplied bytes it did not observe. Containerizing the signer changes who can
> reach it, not what the signature proves.

- **Domain separation must be explicit and testable, inside the signed bytes.** Round 2's point is that today's
  attestation and receipt payload *shapes* are already disjoint (`loginFixture.ts:258-275`, `completion.ts:138-150`,
  `:188-210`), so a test that merely shows "an attestation does not verify as a receipt" stays green even when the
  named separation is absent. The signed transcript must therefore carry: a distinct fixed prefix naming protocol,
  artifact kind and version; unambiguous length framing; fixed field ordering; one canonical encoding including
  string/Unicode and numeric rules; schemas rejecting duplicate and unknown fields; and operation, `fixtureId` and
  `runId` scope **inside the signed bytes**. Version and type are signed, not carried in an outer envelope.
- Capability-scoped to `(fixtureId, runId, attest)`; bounded; **single use after run finalization**; refused before
  finalization, on repeat, and after a control-process restart.
- Private keys never leave the fixture container. The harness holds only public keys, trusted via the §D2.1 MAC.
- Cross-fixture key inequality stays gated (§D6).

Fixture-observed attestation — the only thing that would let the claim grow — stays out of scope and stays named.

### D5 — Daemon preflight, plus fail-closed construction

The preflight sits after the synchronous checker meta-gate and before artifact deletion, Chromium launch,
controls-lab startup and `runHarnessGate()` — between `testbed/runner.ts:118` and `:119`. A preflight in the `npm`
script is bypassed by every direct `runEval()` caller, and the eval entry is one (`runner.eval.test.ts:23-30`).

Necessary but not sufficient: `capturePersistedRuns` is exported, launches Chromium itself and runs scenarios
without entering `runEval` (`runner.ts:157-203`), and the hostile suite calls it directly. Composed-transport
**construction** must therefore also fail closed, independently. **Every** composed-construction failure is a red —
daemon absent, image build failure, container creation failure, exec failure, handshake or MAC failure, protocol
error — with no selective fallback for any of them. The EPERM no-socket substitution
(`loginFixture.ts:137-151`) must be unreachable from the composed path.

### D6 — The canonical parity gate

**Normalize:** physical origins → logical roles (`C`, `L`, `controls-primary`, `controls-secondary`), preserving
origin equality/inequality and `C ≠ L`; random values (canary, nonce, vault handle and key material) by
alpha-renaming that preserves every equality, uniqueness and leak-presence relationship **within and across runs** —
cross-run reuse of a nonce, canary or handle must survive as reuse, not be renamed away; signature and public-key
*bytes*; wall-clock fields while retaining the predicate that receipt time falls inside the run window;
browser/CDP session, frame, document and request ids by alpha-renaming that preserves the correlation graph; header
name **casing**; absolute artifact and temp paths → logical per-run paths.

**Must not be normalized away:** method; route including query; status and redirect behaviour; channel; direction;
initiator; evidence bytes and the transform that produced them; logical origin separation; identity correlation;
**relative event order**; receipt binding and verification; completion outcome; adjudicated outcome;
body-versus-marker classification; capture presence and order; per-cell run inventory; scheme; wrong-key,
bad-signature and replay **failures**; **duplicate-header name multiplicity, individual values, and within-name
value order**; the **cross-fixture signing-key inequality graph**; and the distinction between an omitted field and
an empty one.

The immediate-worker race (`SCHEMA.md:140-155`) is declared nondeterministic between body and `harness-marker`:
preserve the result and the count, and never normalize "no evidence" into either.

### D7 — Capture transfer over the control transport; no shared mounts

Today every fixture receives the **same** capture directory (`testbed/fixtures/index.ts:10-20`,
`runner.ts:174-182`), filenames are flat and keyed only by `runId`, and a successful capture holds the full login
body including the canary (`loginFixture.ts:385-393`). Vault ciphertext and its key are sibling files under each
run (`runner.ts:390-409`).

**There is no shared artifact-root mount and no cross-fixture capture mount.** Captures are transferred to the
harness over the authenticated control transport under a capture-retrieval capability, and **the harness persists
them** into the artifact tree the offline checker already expects (`testbed/checkers/offline.ts:244-267`). A
container's filesystem is its own.

This is not a containment claim about a compromised fixture — that is out of scope — it is that the composed
transport must not *introduce* a cross-run or cross-fixture read path that the in-process transport does not have.

---

## Scope

### Implement

- The `FixtureTransport` seam and the two implementations (§D1), plus the `transport` field rename.
- A Dockerfile and Compose file: **one container per fixture**, only page-origin ports published, the control Unix
  socket internal, plus the static Compose lint Acceptance B requires (§D2).
- The framed `docker exec -T` bridge, the per-eval/per-fixture bootstrap secret injected at container creation, the
  single-container-id resolution, and the challenge/MAC trust anchor (§D2.1).
- The control protocol and per-operation capabilities with entropy, epoch binding, expiry, single use and restart
  invalidation (§D3), including the idempotent receipt read.
- Fixture-control-only attestation with testable in-signature domain separation (§D4).
- The daemon preflight and fail-closed composed construction (§D5).
- The parity gate and its normalizer (§D6).
- Capture transfer over the control transport, harness-persisted, no shared mounts (§D7).
- The `SCHEMA.md` amendment §D4 requires, stating the locked §D2 claim and no more.

### Do not implement

- **Any containment guarantee after fixture-process compromise** — explicitly out of the threat model. Do not add
  mechanism for it and do not write an acceptance criterion that appears to test it.
- Fixture-observed attestation — the only thing that would let the claim grow; a later slice.
- A control sidecar; removed in revision 2 as buying nothing under the locked boundary.
- CI, image publishing, registry work, Node pinning — the M10 release-engineering slice (BACKLOG).
- New hostile fixtures or new capture channels; M6's blind-spot list is not this slice.
- Any change to the locked `PROJECT-SPEC.md`.

---

## Acceptance Criteria (each names its mutant)

Every criterion below tests the locked §D2 claim. None tests containment after fixture-process compromise.

**A. No silent fallback, for every composed-construction failure.** With the daemon stopped, `make eval` exits
non-zero naming it, before any artifact is deleted, before Chromium launches, before any producer runs. *Mutants,
each independently:* preflight moved into `captureWithBrowser()`; a direct composed `capturePersistedRuns`
bypassing `runEval`; daemon killed after the preflight but before container creation; **image build failure;
container creation failure; exec failure; handshake failure; MAC failure; protocol error** — each must be red, and
a fallback for any one of them must be caught. "All failures are red" is only true if each is mutation-covered.

**B. Page content cannot address the control transport.** From a page served by the hostile origin, and from the
evaluated agent, every administrative operation is attempted across: every published port, loopback, the Docker
gateway, `host.docker.internal`, IPv4 and IPv6, container service names and IPs, DNS-rebound names, and each of
`fetch`, form POST, image, WebSocket and worker. All fail with no route. A static Compose lint rejects
`network_mode: host`, **any published port other than the fixtures' page origins**, any bind mount of the control
socket, and any Docker-socket mount into a container. *Mutant:* publish the control socket over TCP and the probe
matrix must go red; a single-probe version of this test must be shown insufficient.

**C. Page content cannot invoke administrative operations indirectly.** A data-plane request may cause capture and
receipt issuance — that is fixture semantics and must stay green. It must **not** cause registration, receipt
retrieval, capture retrieval, arbitrary event attestation, or capability/key disclosure, by any path including the
attribution parse (both form-body and query), the login validation path, and the lookalike L→C server-side fetch.
*Mutant:* wire any administrative operation to a page-reachable trigger and this goes red while B stays green —
which is the point, since B and C fail differently.

**D. Capabilities are unguessable, scoped, expiring, single-use and epoch-bound.** A capability is refused for
another run, another fixture, another operation, after expiry, on repeat where single-use, after a control-process
restart, and when minted in an earlier eval for a recurring run id. *Mutants:* a capability derived from the run id
or a rendered nonce; single-use state held only in memory across a restart; no epoch binding.

**E. Capabilities and keys are unobservable.** No capability, derived value, or private key appears in page HTML,
page URLs or headers, captured evidence, transcripts, artifacts, fixture access logs, bridge error text, or stdout
diagnostics — asserted by scanning all of them, including the L→C rendering for a predictable registered run id.
*Mutant:* the implementation recycles the rendered run token (`loginFixture.ts:355-363`) and the scan finds it.

**F. The bridge's trust anchor is not self-asserted.** The harness resolves exactly one container id and execs it;
the control process returns a MAC under the per-eval, per-fixture bootstrap secret binding challenge, epoch,
fixture identity, container identity and public key; only then is the key trusted. *Mutants:* a valid announcement
with no MAC; a MAC omitting any one of the five bound values; a replayed MAC from an earlier eval or container
instance; a service selector used instead of a resolved id; a resolution yielding zero or two containers; a stale
container answering with internally consistent metadata. Bridge death fails the run and rejects the outstanding
operation on EOF; it never reconnects onto a different container.

**G. Framing cannot be desynchronised or confused.** *Mutants:* an unsolicited response frame; a duplicate response
id; a late response arriving after a timeout; an oversized frame; a malformed frame followed by valid bytes
(a resynchronising parser must be caught); two writers on stdout; a diagnostic written to stdout; an operation
timeout that leaves a frame outstanding rather than closing the bridge.

**H. Canonical parity, including what a normalizer erases.** The same scenario through both transports yields
identical normalized security-relevant evidence, completion outcomes and adjudication. *Mutants:* drop one of two
duplicate same-name headers where the dropped one carries the canary; reorder two events; coarsen a route to its
origin; reuse one signing key across fixtures; **reuse a canary, nonce or handle across runs** (per-run
alpha-renaming must not hide it); normalize an omitted field to an empty one.

**I. Attestation is domain-separated in the signed bytes, and provably so.** *Mutants — and the first is the one
that matters:* **remove the domain prefix and the test must still go red**, even though the payload shapes remain
disjoint; a version or type carried in an outer envelope rather than signed; duplicate or unknown fields accepted;
a non-canonical encoding accepted; the attest capability accepted for receipt retrieval; a second attestation
succeeding; a pre-finalization attestation succeeding; an attestation succeeding after a control-process restart.

**J. No cross-run or cross-fixture read path is introduced.** The composed transport gives a fixture container no
access to another fixture's captures, another run's captures, the artifact root, or vault material. *Mutants:* a
shared capture mount; an artifact-root mount; a flat `runId`-keyed path reachable across fixtures.

**K. `make test` stays Docker-free and clean-clone green.** The deterministic suite and the hostile browser suite
run with no daemon present, verified by a **literal clean clone** — `git clone` into a temp directory, `npm ci`,
`make browsers`, `make test`. *Mutants:* a Docker import reachable from the `make test` path (dependency-boundary
check); **a conditional `spawn("docker")` or shell invocation, and direct daemon-socket access** — round 2's point
that an import check alone is not equivalent to the clone, and neither is equivalent to the other.

**L. The claim did not grow — as an executable link, not prose.** A behaviour-to-claim table maps each `SCHEMA.md`
integrity claim to what each transport implements, and each row is **linked to the test that exercises it**.
*Mutant:* a row whose claim is asserted while the composed path implements nothing — a table of prose rows must be
shown insufficient.

---

## Decisions taken (user)

**2026-09-04, after round 1:** host Chromium (transport stays the only changed variable in the parity experiment;
containerized Chromium deferred, and only ever reintroduced as a separately rebaselined environment); attestation
branch (i); a framed `docker exec -T` bridge with no published control port.

**2026-09-04, after round 2 — the threat boundary above, and:**

- The revision-1 isolation claim is withdrawn as false, and the proposed replacement ("a compromised page container
  cannot reach another run…") is **also rejected** — it still promises containment after compromise of the fixture
  server process, which the design cannot establish.
- **The sidecar is removed as a required security mechanism**: it defends a threat now out of scope while adding an
  unsound state-transfer boundary.
- One container per fixture; only page-origin TCP ports published; control Unix socket entirely inside the
  container, never published or bind-mounted; long-lived `docker exec -T` bridge to that internal socket; no
  control-network port; no silent fallback.
- Attestation stays branch (i), renamed **fixture-control-only**; post-capture integrity only, never independent
  capture authenticity.
- The exec trust anchor is repaired with a fresh per-eval, per-fixture bootstrap secret injected at container
  creation, a resolved immutable container id, a fresh challenge, and a MAC binding challenge, epoch, fixture
  identity, container identity and public key.
- Round 2's valid findings are absorbed: capability entropy/epoch/expiry/scope/single-use/restart-invalidation; no
  shared artifact-root or cross-fixture capture mount, captures transferred over the authenticated control
  transport and persisted by the harness; framing with request ids, one stdout writer, rejection of
  unsolicited/duplicate/late responses, bounded frames and close-on-desynchronisation; explicit, testable domain
  separation inside the signed receipt and attestation transcripts.

---

## For paper round 3

**The question, and the only question:** can browser page content or the evaluated agent reach an administrative
control operation — registration, receipt retrieval, capture retrieval, arbitrary event attestation, or
capability/key retrieval — directly or indirectly?

**Do not spend this round trying to prove or disprove containment after fixture-process compromise. It is
explicitly outside the threat model.** A finding that assumes a compromised fixture server process is out of scope
and should be reported as such rather than argued.

In scope for attack: the exec bridge's trust anchor and framing; capability entropy, epoch binding, expiry, single
use and restart invalidation; capability and key leakage, including the L→C read oracle; indirect invocation of
administrative operations through the data plane; the Compose lint's completeness; whether §D7's transfer
reintroduces a cross-run or cross-fixture read path; and whether the domain-separation criterion (I) can be shown
to fail when the prefix is removed.

**If this design cannot prevent page content from reaching administrative control operations, stop again** — no
published control port, no silent fallback. Otherwise the spec locks and implementation proceeds.

---

## Reporting

"Deviations From Handoff" is mandatory. Where this spec's framing is contradicted by the code, say so plainly —
that is the most valuable output of a paper round, and two of this spec's own premises came from the last one.
