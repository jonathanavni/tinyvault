# M5.2 slice spec — Docker-composed fixtures behind one implementation, two transports

**Status: BLOCKED — revision 1 did NOT lock. Paper round 2 rejected both the sidecar split and the exec bridge**
(`docs/m5-2-review-findings.md`, C-R3). Round 2 of the three-round cap is spent. The stop-and-report rule applies:
no published control port, no silent fallback, no repair without the user.

**Why it is blocked, in one paragraph.** §D2 promised that compromising a page container could never reach the
signing path. **Receipt signing is triggered by a page request by design** — the page POSTs the login body, and the
right username plus the registered canary is what makes the fixture capture and sign
(`testbed/fixtures/shared/loginFixture.ts:385-411`) — and `SCHEMA.md:319-335` already declares that an
exact-endpoint follower can obtain a real receipt. So §D2's claim exceeded a residual the project had already
declared; it was not true in-process either, and the sidecar inherited the gap while promising to close it. Every
candidate page↔sidecar state channel therefore fails identically: the page container must be able to say "a login
arrived with this body", so a compromised one can forge exactly that. The only semantic escape — the sidecar
observing the browser request itself — puts page-input parsing back beside the signing path and contradicts §D2's
own argument. **This is a claim problem, not a mechanism problem, and narrowing the claim is the user's decision.**
Separately, the exec bridge's landing handshake is circular: it cannot verify an "expected" public key, because the
bridge is that key's first trust path.

**Read the sections below as the rejected design plus the constraints that survived**, not as a plan. Everything
below §D1 is subject to whatever the user decides about the claim.

## What changed from revision 0 (read first)

1. **§D2 is rewritten, and the correction is load-bearing.** Revision 0 — and the topology sketch it was written
   from — assumed a fixture container could "publish its page origins on the page network and its control port on
   the harness network". **Docker does not work that way.** A dual-homed container has one network namespace; a
   control listener on `0.0.0.0` is reachable through its `tv-page` IP too, because Docker networks scope routes,
   not listening ports. The isolation must come from **privilege separation** — a control sidecar the page-serving
   process cannot reach — not from network labelling.
2. **§D4's preferred option was not implementable.** "Keep attestation in-process and keep the claim" cannot be
   done: offline adjudication requires the fixture signature *before* it parses events. §D4 is now an explicit
   fork, both branches honest about what composed runs prove.
3. **§D3 contradicted itself** — §D2 demanded a capability bound to run *and operation*, §D3 issued one bearer for
   all operations. Capabilities are now per-operation, with a non-observability gate, because the obvious
   implementation recycles a token the fixture **deliberately renders into the hostile page**.
4. **§D6 gained the specific false green** a normalizer would produce: duplicate-header multiplicity.
5. **§D5 gained a second enforcement point** — the preflight is necessary but not sufficient.
6. **Every acceptance criterion was rewritten**; round 1 showed all seven could pass while false.

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

## Design decisions (revision 1 — answered against paper round 1; round 2 must attack §D2)

### D1 — One implementation, two transports, chosen at the seam not in the fixture

The fixture's *behavior* (routes, pages, receipt issuance, capture recording) is written once. What varies is how
the harness reaches it. Introduce a `FixtureTransport` with two implementations:

- `in-process` — today's direct object, unchanged in behavior. Used by `make test`, the coverage gate and the
  hostile browser suite. Docker never enters that path.
- `composed` — a client that speaks the control protocol (§D3) to a fixture running in a container.

The fixture object the runner consumes becomes a **client interface**, not a closure bundle. Today's `LoginFixture`
is a live API whose methods close over server state (recon §7); the in-process transport keeps that by
implementing the same interface directly.

Note the existing `transport` field is a trap: it currently means "HTTP available vs the EPERM no-socket fallback",
and the fallback is *named* `in-process` (`testbed/fixtures/shared/loginFixture.ts:137-151`). Docker-over-HTTP would
satisfy today's `assertHttpFixture` guard unchanged. **Renaming is in scope**; the guard must distinguish
*architecture* (in-process / composed) from *reachability* (http / no-socket), because §D5's no-fallback rule is
enforced on the first and today's capture-red rule on the second.

### D2 — The network shape: privilege separation, not network labelling **(round 2 must attack this)**

The constraint is unchanged and is the user's: the control plane must be unreachable from the hostile page **by
topology, not by CORS**, with authenticated, run-scoped registration. What changed is the mechanism, because the
mechanism first proposed does not exist.

**Why the obvious shape fails.** "The fixture publishes its page origins on the page network and its control port on
the harness network" describes something Docker cannot do. A container has **one network namespace**. A listener
bound to `0.0.0.0:<control-port>` is reachable on *every* network the container joins, including `tv-page`; Compose
attaching a container to two networks scopes its **routes**, not its **ports**. So a hostile page reaches
`http://<fixture-service>:<control-port>/register` over the page network, and `internal: true` on `tv-control`
changes nothing — it prevents external routing, not access by a member or a dual-homed member. Worse, any fixture
compromised through page-supplied input becomes a pivot onto `tv-control` with its bootstrap secret in hand.

Host Chromium is a *second*, independent problem: Playwright launches the browser on the host today
(`testbed/runner.ts:110-149`), and a host page reaches any published `127.0.0.1` port and the Docker gateway.

**The design: one control sidecar per fixture, and the page process is not in it.**

- The **page container** serves the fixture's origins and joins **only** `tv-page`. It holds no bootstrap secret, no
  control socket, no control listener, and no capability material.
- The **control sidecar** holds registration, receipt retrieval, capture retrieval and (per §D4) attestation. It
  joins **only** `tv-control`, or exposes only a Unix socket the page container does not mount.
- Page container and sidecar share exactly one thing: the fixture's own state, over a channel the sidecar defines
  and the page container cannot use to issue control operations. Round 2's job is to attack that channel.
- `tv-control` is `internal: true`, but that is defence in depth, not the argument. **The argument is that nothing
  which parses page-supplied input can address the control plane at all.**

Compromise of a page container must therefore cost the attacker only that fixture's page surface — never another
run, never another fixture, never the signing path.

**DECIDED (user, 2026-09-04): host Chromium plus per-fixture control sidecars.** The calibrated browser
environment is preserved, so **transport is the only changed variable in the parity experiment** — which is what
makes §D6's comparison mean anything. Containerized Chromium is **deferred**, and if it is ever introduced it comes
in as a *separately rebaselined environment*, never as a swap underneath the existing calibration (SCHEMA's 44–83 %
miss range and ≥ 150 ms figures are host-browser observations, `SCHEMA.md:140-155`).

The cost of that decision is that the host is inside the topology, so **no control port may be published to the
host, ever** — enforced statically (Acceptance B) and structurally by §D2.1.

### D2.1 — The host-harness ↔ sidecar transport: a framed `docker compose exec -T` stdio bridge

Host Chromium means the harness is on the host, and the sidecar's control surface must be reachable by the harness
and by nothing the page can address. Two candidate mechanisms are ruled out before the bridge is specified:

- **A published control port is forbidden** by the decision above — a host page reaches any `127.0.0.1` port.
- **A bind-mounted, container-created Unix socket does not work on this host** — verified by the user on Docker
  Desktop for macOS, 2026-09-04: the socket file *appears* on the host side of the bind mount, but a host
  connection returns `ECONNREFUSED`. The macOS Docker Desktop file-sharing layer does not proxy `AF_UNIX`
  connect() across the VM boundary. Revision 0's Option B is therefore not merely weaker, it is **non-functional on
  the development host**, and no amount of sidecar re-siting fixes it.

**The transport is a long-lived, framed `docker compose exec -T` stdio bridge** into a control process inside the
sidecar (or into a container-local Unix socket that process fronts). The page cannot reach the Docker exec API, its
stdio, or the container-local socket: none of them is a network endpoint reachable from a page's origin, and the
sidecar publishes nothing.

Requirements on the bridge, each of which round 2 should try to break:

- **`-T` is mandatory.** A TTY would mangle the byte stream and echo input; framing must run over a raw pipe.
- **Explicit framing.** Exec stdio is a byte stream with no message boundaries: length-prefixed frames, one
  request/response per frame, with a declared maximum frame size. Malformed or oversized frames close the bridge
  rather than resynchronising — a resynchronising parser is a request-smuggling surface.
- **`stderr` is not the frame stream.** Diagnostics go to `stderr` and are never parsed as control responses.
- **One long-lived bridge per fixture per eval run**, not one exec per operation — repeated exec is both a cost and
  a race, and a per-operation exec multiplies the binding checks below.
- **The bridge must prove where it landed.** An exec that succeeds is not evidence that it reached the intended
  container. On open, the sidecar announces its Compose project, service name, container id, `fixtureId`, and its
  **public key**; the harness verifies every field against what it expects and **binds the public key to that
  fixture identity for the run**. A mismatch is a hard failure, never a retry against whatever answered. Cross-
  fixture key inequality (§D6) is checked across these announcements.
- **Bridge death is a red, not a fallback.** If the bridge closes mid-run, the run fails loudly; there is no
  reconnection that silently rebinds to a different container, and no downgrade to the in-process transport (§D5).

Round 2 attacks this bridge directly: see "For paper round 2".

### D3 — Per-operation, run-scoped capabilities

- Registration is authenticated by a bootstrap secret **unique per control sidecar**, delivered by Compose to the
  sidecar only. A single shared Compose secret is rejected: it would let one compromised fixture register
  predictable ids on every other fixture ahead of the harness.
- Registration returns **one capability per operation** — receipt retrieval, capture retrieval, attestation — each
  bound to `(fixtureId, runId, operation)`; the attestation capability additionally carries §D4's bounded,
  single-use-after-finalization rule. Revision 0's single `(fixtureId, runId)` bearer is withdrawn: it would
  let a capture-read capability destructively drain the receipt or drive the signing oracle, and it contradicted
  §D2's own requirement.
- **Capabilities must be unobservable to the page, and this is gated, not asserted.** The obvious implementation
  recycles the existing run token — which the fixture *deliberately renders into the hostile page*
  (`loginFixture.ts:355-363`) and which the lookalike copies into its own rendering
  (`lookalike-origin/index.ts:112-120`). No capability or capability-derived value may appear in page HTML, page
  URLs or headers, captured evidence, transcripts, artifacts, fixture access logs, or error text.
- The L→C server-side fetch is **not** destination-steerable — fixed `/login`, closure-held canonical origin, only
  the query copied (`lookalike-origin/index.ts:102-120`) — but it *is* a read oracle on whatever registration
  renders for any predictable registered `runId`. That is precisely why the rule above is absolute.
- Run ids stay predictable; **predictability must not be authorization**. The registration race closes on the
  bootstrap secret.
- Receipt retrieval becomes an **idempotent authenticated read** plus an optional explicit acknowledgement.
  Today's `takeReceipt` deletes on read (`loginFixture.ts:192-195`): over a network, a dropped response turns a
  completed run into an incomplete one on retry. Offline replay protection already makes repeated retrieval
  harmless (`testbed/completion.ts:107-117`).
- The page-controlled attribution residual (`SCHEMA.md:332-335`) stays exactly as declared, corroborating only, and
  **neither its form-body path nor its query path** may feed any authorization decision (`loginFixture.ts:371-378`).

### D4 — Attestation: sidecar-only, operation-scoped **(DECIDED — branch (i))**

Revision 0 preferred "do not expose `attestEvents`; keep the single-process claim". That cannot be done: offline
adjudication **requires the fixture signature before it parses events** (`testbed/checkers/offline.ts:244-267`), so
in composed mode the fixture either signs or there is no attestation.

**DECIDED (user, 2026-09-04): branch (i) — sidecar-only, operation-scoped event attestation, keeping the existing
limited post-capture-integrity guarantee.** The claim does not grow. In particular:

> **Do not describe this as independent authenticity.** The sidecar still signs a digest of runner-supplied bytes
> it did not observe. Moving that signer into a container changes *who can reach the signer*, not *what the
> signature proves*.

Constraints on the operation, all of which are acceptance-gated:

- **Domain separation from completion receipts.** Event attestations and completion receipts are signed over
  distinct, explicitly prefixed domains, so no attestation can be verified as a receipt and no receipt as an
  attestation. This is the "domain confusion" surface round 2 attacks; today both are Ed25519 signatures from the
  same fixture key, and only the payload shape distinguishes them.
- **Capability-scoped to `(fixtureId, runId, attest)`.** An attestation capability authorizes attestation, for that
  run, on that fixture — nothing else. It cannot sign for another run, another fixture, or another operation.
- **Bounded and single-use after run finalization.** Attestation is available once, after the run is finalized;
  it is not a standing oracle for the life of the sidecar. Repeat or pre-finalization requests are refused.
- **Private keys never leave the sidecar.** The page container never holds one; the harness holds only public keys,
  bound to fixture identity by the §D2.1 bridge handshake.
- **Cross-fixture key inequality stays gated** (§D6): reusing one key across fixtures must go red, because
  verification would still succeed while compromising one fixture forged another.

Fixture-observed attestation — the real fix, which would let the claim actually grow — stays out of scope and stays
named as the thing that would close it.

### D5 — Daemon preflight, plus fail-closed construction

The preflight sits after the synchronous checker meta-gate and before artifact deletion, Chromium launch,
controls-lab startup and `runHarnessGate()` — between `testbed/runner.ts:118` and `:119`. A preflight in the `npm`
script is bypassed by every direct `runEval()` caller, and the eval entry is one (`runner.eval.test.ts:23-30`).

That placement is **necessary but not sufficient**: `capturePersistedRuns` is exported, launches Chromium itself and
runs scenarios without ever entering `runEval` (`runner.ts:157-203`), and the hostile suite calls it directly. So
composed-transport **construction** must also fail closed, independently. Three mutants, all of which must go red:

- a direct composed `capturePersistedRuns` that never passes the preflight;
- the daemon lost *after* the preflight but before Compose startup;
- composed startup catching a failure and returning the fast transport.

The EPERM no-socket substitution (`loginFixture.ts:137-151`) must be unreachable from the composed path — it is the
existing silent-downgrade shape.

### D6 — The canonical parity gate

**Normalize:** physical origins → logical roles (`C`, `L`, `controls-primary`, `controls-secondary`), preserving
origin equality/inequality and `C ≠ L`; random values (canary, nonce, vault handle and key material) by
alpha-renaming that preserves every equality, uniqueness and leak-presence relationship; signature and public-key
*bytes*; wall-clock fields (`issuedAt`, run start/end, coverage `observedAt`, scorecard `generatedAt`) while
retaining the predicate that receipt time falls inside the run window; browser/CDP session, frame, document and
request ids by alpha-renaming that preserves the correlation graph; header name **casing**; absolute artifact and
temp paths → logical per-run paths.

**Must not be normalized away** — each is load-bearing: method; route including query; status and redirect
behaviour; channel; direction; initiator; evidence bytes and the transform that produced them; logical origin
separation; identity correlation; **relative event order** (`t` is capture-array order, consumed by leak-channel
selection, chunk reassembly and authorized-capture comparison); receipt binding and verification; completion
outcome; adjudicated outcome; body-versus-marker classification; capture presence and order; per-cell run
inventory; scheme (`http`/`ws` is part of the bare origin and the capture layer treats schemes explicitly); and
wrong-key, bad-signature and replay **failures**, which must survive as failures.

Two invariants round 1 added, both because they are what a plausible normalizer erases:

- **Duplicate-header name multiplicity, individual values, and within-name value order.** The concrete false green:
  the in-process transport captures two same-name headers, the first carrying the canary; the composed transport
  drops the first; a "lowercase and sort header names" implementation collapses both sides to a last-value map;
  parity passes although composed capture missed the leak. Header values are a declared leak channel including
  cookies (`SCHEMA.md:136-139`). Mutation-test last-write-wins, deduplication and comma-coalescing.
- **The cross-fixture signing-key inequality graph.** Normalizing key bytes to fixture roles would hide a composed
  transport that reuses one key for every fixture: verification still succeeds, yet compromising one fixture forges
  another. Preserve key inequality across fixtures, not merely successful verification.

The immediate-worker race (`SCHEMA.md:140-155`) is declared nondeterministic between body and `harness-marker`:
preserve the result and the count, and never normalize "no evidence" into either.

---

## Scope

### Implement

- The `FixtureTransport` seam and the two implementations (§D1), plus the `transport` field rename.
- Dockerfile(s) and a Compose file for the fixture set in the §D2 topology: page container plus control
  sidecar per fixture, `tv-page` and `tv-control`, and the static Compose lint Acceptance B requires.
- The framed `docker compose exec -T` stdio bridge and its landing-verification handshake (§D2.1).
- The control protocol and per-operation run capabilities (§D3), including the idempotent receipt read, and §D4's
  domain-separated, bounded, single-use attestation.
- The daemon preflight at the one placement (§D5).
- The parity gate and its normalizer (§D6), plus the `SCHEMA.md` amendment §D4 requires.

### Do not implement

- Fixture-observed attestation (§D4 option 3) — a later slice.
- CI, image publishing, registry work, Node pinning — those are the M10 release-engineering slice (BACKLOG).
- New hostile fixtures or new capture channels; M6's blind-spot list is not this slice.
- Any change to the locked `PROJECT-SPEC.md`.

---

## Acceptance Criteria (each names its mutant)

Round 1 showed revision 0's seven criteria could each pass while the property named was false. These are rewritten
against that.

**A. No silent fallback, at both enforcement points.** With the daemon stopped, `make eval` exits non-zero naming it,
before any artifact is deleted, before Chromium launches, before any producer runs. *Mutants:* preflight moved into
`captureWithBrowser()`; a direct composed `capturePersistedRuns` bypassing `runEval`; the daemon killed after the
preflight but before Compose startup; composed startup catching a failure and returning the fast transport.

**B. The page cannot reach the control plane — proven by a matrix, not one probe, plus a static lint.** From a page
served by the hostile origin, every control operation is attempted across: the fixture's service DNS name, every
page-network IP, loopback, the Docker gateway, `host.docker.internal`, IPv4 and IPv6, a DNS-rebound name, and each
of `fetch`, form POST, image, WebSocket and worker — and separately from a *compromised fixture* pivot. All fail at
the transport layer, with no route, never at an authorization check. A static Compose lint rejects `network_mode:
host`, **any published port other than the fixtures' page origins**, any control mount into a page container, and
any wildcard control bind — the control plane is reachable only over the §D2.1 exec bridge, so a published control
port is a lint failure by construction, not a judgement call.
*Mutant:* a single-probe version of this test passes while the page-network IP still answers. (The controls lab's
deliberately permissive CORS means any accidental TCP exposure is immediately readable —
`controls-lab/index.ts:350-383` — so reachability alone is the failure.)

**C. A capability authorizes one run and one operation.** A capture-read capability for run A is refused for run A's
receipt and attestation, for run B entirely, and for the same `runId` on a different fixture. *Mutant:* one bearer
per run — revision 0's design — goes red, as does authorization reduced to "the runId is registered".

**D. Attribution is not authorization, by either path.** A page-supplied `runId` in a **form body** *and* in a
**query** still attributes unauthorized capture exactly as declared, and neither registers, retrieves nor attests.
*Mutant:* the control plane consults either attribution path, or accepts any other page-visible token.

**E. Capabilities are unobservable.** No capability or derived value appears in page HTML, page URLs or headers,
captured evidence, transcripts, artifacts, fixture access logs, or error text — asserted by scanning all of them.
*Mutant:* the implementation recycles the rendered run token (`loginFixture.ts:355-363`) and the scan finds it.

**F. Canonical parity, including what a normalizer erases.** The same scenario through both transports yields
identical normalized security-relevant evidence, completion outcomes and adjudication. *Mutants — and these are the
criterion that matters:* drop one of two duplicate same-name headers where the dropped one carries the canary;
reorder two events; coarsen a route to its origin; reuse one signing key across fixtures; normalize an omitted
field to an empty one. Each must go red. A parity gate that passes when one transport is degraded is the failure
mode this slice is most likely to ship.

**G. `make test` stays Docker-free and clean-clone green.** The deterministic suite and the hostile browser suite
run with no daemon present, verified by a **literal clean clone** — `git clone` into a temp directory, `npm ci`,
`make browsers`, `make test` — not by a green run in the development tree. *Mutant:* any Docker import reachable
from the `make test` path fails the dependency-boundary check. (An import-boundary check alone is not equivalent to
the clone; both are required.)

**H. The claim did not silently grow — as a table, not a sentence.** A behaviour-to-claim closure table maps each
`SCHEMA.md` integrity claim to what each transport actually implements, including §D4's chosen branch. *Mutant:* a
prose assertion passes while the composed attestation path implements nothing.

**I. The bridge proves where it landed.** On open, the harness verifies the sidecar's announced Compose project,
service, container id, `fixtureId` and public key against what it expects, and binds that key to that fixture for
the run. *Mutants:* an exec that lands in a different service, a second container of the same service, a sidecar
announcing another fixture's id, and a sidecar announcing a key the harness did not expect — each must be a hard
failure, and none may retry against whatever answered. A closed bridge mid-run fails the run; it never reconnects
onto a different container and never falls back to the in-process transport.

**J. Attestation is domain-separated, scoped, bounded and single-use.** An event attestation cannot be verified as a
completion receipt, nor a receipt as an attestation. An attestation capability for `(fixtureId, runId, attest)` is
refused for another run, another fixture, and every other operation; attestation is refused before run
finalization and on any repeat. *Mutants:* both signatures over a shared, un-prefixed domain; the attestation
capability accepted for receipt retrieval; a second attestation call succeeding; a pre-finalization call
succeeding. Private keys never appear outside the sidecar — asserted by scanning the page container, the harness
process, artifacts and logs.

---

## Decisions taken (user, 2026-09-04)

1. **Host Chromium plus per-fixture control sidecars** (§D2). Preserves the calibrated browser environment and keeps
   **transport as the only changed variable** in the parity experiment. Containerized Chromium is deferred, and is
   only ever introduced later as a *separately rebaselined* environment.
2. **Attestation branch (i)** (§D4): sidecar-only, operation-scoped, keeping the existing limited
   post-capture-integrity guarantee, explicitly **not** described as independent authenticity.
3. **The host-harness ↔ sidecar transport is a framed `docker compose exec -T` stdio bridge** (§D2.1). No control
   port may be published. A bind-mounted container-created Unix socket is **not viable on this host** — verified on
   Docker Desktop for macOS: the socket file appears on the host side of the mount but connecting returns
   `ECONNREFUSED`.

Nothing else in this spec is locked. Revision 1 locks only after paper round 2.

## For paper round 2

Round 1 *proposed* the sidecar split and never attacked it, and the exec bridge (§D2.1) is newer still. Round 2's
job is to break both. The user set the attack surface:

1. **The page-container ↔ sidecar state channel** — the new trust boundary, and therefore the new candidate hole.
2. **Whether page-controlled input can cause receipt or attestation signing indirectly** — not "can the page call
   the signer", but "can the page make the fixture ask the signer on its behalf".
3. **The Docker-exec bridge's binding** to the intended Compose project, service, container, fixture identity and
   public key — including what an exec that lands somewhere else looks like, and whether anything retries.
4. **Capability leakage and replay** — including through the L→C read oracle, artifacts, logs and error text.
5. **Shared-volume and cross-fixture access** — whether the filesystem reintroduces the cross-run reads §D3 closes.
6. **Domain confusion between event attestations and completion receipts** — both are Ed25519 signatures from the
   same fixture key today.

**Stop-and-report rule (user, 2026-09-04).** If the sidecar split or the exec bridge fails this attack, **stop and
report**. Do not repair it by publishing a control port, and do not add a silent fallback. A design that cannot
survive round 2 goes back to the user, not into code.

## Reporting

"Deviations From Handoff" is mandatory. Where this spec's framing is contradicted by the code, say so plainly —
that is the most valuable output of a paper round, and two of this spec's own premises came from the last one.
