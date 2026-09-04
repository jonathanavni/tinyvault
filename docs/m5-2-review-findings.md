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
