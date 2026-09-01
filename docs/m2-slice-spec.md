# M2 Slice Spec — Security Primitives (Codex implementation handoff)

> **Status:** revision 3, for Codex **pre-implementation adversarial review round 3** (the cap).
> Revision 1: **NO-SHIP**, 9 findings, all accepted — three were packet drift, two exposed genuine
> contradictions in the *locked plan*, which was amended. Revision 2: **NEEDS-ATTENTION**, 4 findings
> (1 high, 2 med, 1 low), all accepted, with **all 9 round-1 findings confirmed CLOSED and none
> cosmetic**. Round 2 also ran on a different reviewer model than round 1 (`gpt-5.6-sol` was at
> capacity), so its absorption check is fresh-eyes rather than the original finder re-checking itself.
> Governed by [`phase-0-plan.md`](phase-0-plan.md) §8 (M2 row), §9.1 (review gate), §4 (redaction layers),
> §2 (contracts), `SCHEMA.md`. Those are authoritative — this packet **implements** them and may not
> reinterpret them.

## Task

Implement M2: the six security primitives, **unit-testable in isolation with no browser**, plus the M2 slice
of the never-cache-the-secret invariant (B1 slice 1/3).

## Branch / Worktree

Work in: `codex/m2-primitives`
Base from: current `main` head (verify with `git rev-parse main` at branch time)
Do not modify unrelated files.

## Amendments made in response to round 1 (read these first)

Round 1 was correct that the slice was not implementable without inventing security-relevant semantics. The
**locked plan has been amended** rather than leaving the implementer to guess — the locked text itself says a
contract conflict is kicked back to the continuity owner, and this is that path working as designed:

1. **§4 layer 3 — tripwire plane split.** The old text promised both "fails the eval/CI run" and "never
   alters process lifetime," which cannot both hold in one process. Now: a **data plane** returning identical
   bytes/errors/session/mutex behavior regardless of a match, and an **evaluator-owned control plane** that
   examines *sealed* evidence and produces the verdict afterward. The absolute process-lifetime claim is
   **withdrawn** and replaced with a scoped one. Ownership is M2 (detector + types + seam) → M4 (wiring) →
   M8 (MCP seam).
2. **§4 layer 1 — `Secret<T>` narrowed to `Secret<string>`, guarantee restated honestly.** Not memory
   zeroization; `expose()` aliases are unrevocable; the claim is non-reachability from TinyVault-owned
   data-plane state. Per-operation shapes are now exact (value-producing vs structure-producing routes).
3. **§8 M2 row — the noninterference differential moved to M4.** With no fill service it was structurally
   vacuous. M2 now gets **structural confinement** instead.
4. **§4 — B1 live-secret lease carve-out.** The taboo set must retain secret material to match it, which
   contradicted B1. Data-plane lease (dropped in `finally` before mutex release) vs evaluator control-plane
   lease (until sealed evidence is adjudicated), with the latter explicitly excluded from B1's claim.
5. **§4 layer 2 — no generic `unlock`.** It contradicted "taint persists until trusted top-level navigation."
6. **§8 M4 row — B1 slice 3/3 upgraded to a rotation test**; **§8 M8 row** — MCP capture seam proved.
7. **§9.1 — mutex non-reentrancy chosen** (it named reentrancy as a review surface without picking a
   behavior).

Round 2 then found four more, all absorbed:

8. **§4 layer 3 — the "supervisor-facing seam" is now an exact API, not a label** (R2 #1, high). An
   unpinned seam could later be satisfied by an `onMatch(callback)` or `scanAndReport()` reachable from
   the data plane — re-opening the banned callback oracle. Pinned: **sealed batch in → verdict +
   fixed-shape diagnostics out**, control-plane only, refusing caller-originated/mixed-provenance bytes
   at the type level.
9. **§4 — lease finalization is run-bound** (R2 #2). The old text never said what happens if the
   end marker never arrives. Missing marker or capture error now marks the run invalid/red and drops
   the lease in a supervisor `finally`; a lease never outlives its run.
10. **§4 — two honest-claims violations in the plan itself** (R2 #3). It still said the tripwire "never
   changes caller-visible behavior or timing" and that the differential "proves no timing channel."
   Both replaced with bounded claims. *This packet asserted the honest-claims rule while the plan
   still broke it — a self-consistency failure worth naming, not quietly patching.*
11. **§4 — the transform corpus is normative** (R2 #4), with exact expected strings pinned
   independently of the detector, including base32 padding/case, hex case, percent-encoding case,
   JSON escape forms, and whitespace-split shape.
12. **Continuity-owner addition (not from either review): lockdown identities are branded capability
   types**, constructor private to the trusted side, so forging one is a compile error. Round 1's
   reviewer had flagged the risk that registry tests "prove capability provenance rather than merely
   exercise a map" before its run died on a capacity error; round 2 did not re-raise it. Same
   "executable contract, not a label" class as R2 #1.

## Required Reading

- `CLAUDE.md`
- `PLAN.md` — **Current State only** (do not read or edit the Decisions Log)
- `docs/phase-0-plan.md` — **§2**, **§4** (layers 1–3 + the lease carve-out + transform coverage), **§5**,
  **§8** (M2/M3/M4 rows), **§9.1**
- `src/core/types.ts` — the locked model-visible contract
- `SCHEMA.md` — the `Origin` contract (bare HTTP(S)); also read before proposing any contract change
- `.claude/memory/conventions.md`

Do **not** bulk-load `.claude/memory/`.

## Context

- TinyVault's thesis is *measure, don't assert*. Claims the language cannot support are worse than no claim.
- **M0** (contracts) and **M1** (eval spine) are on `main`; `make eval` runs offline; 81 tests green.
  **There is no fill service yet.**
- Several primitives exist because a reviewer demonstrated an oracle. Weakening one to simplify re-opens a
  closed finding.
- **Vacuous tests are a named project failure mode.** The M0 review caught `make test` running `vitest run`
  without type-checking; round 1 caught a noninterference test that any constructor would pass. A test that
  cannot fail is worse than an absent one, because it reads as coverage.

## Scope

Implement in `src/core/`:

1. **`redaction.ts` — `Secret<string>`** (narrowed; not generic). Value-producing routes — `String()`,
   template coercion, `toString`, `toJSON`/`JSON.stringify`, `util.inspect`/`inspect.custom`, `console.log` —
   yield `"[REDACTED]"`. Structure-producing routes — `Object.keys`/`entries`, spread,
   `getOwnPropertyNames`, `Reflect.ownKeys`, descriptors — expose **no secret-bearing state**. One accessor,
   `expose()`. **[B1 slice 1/3]** idempotent `clear()` and one-shot `consume()`; afterward the wrapper holds
   no reference and further exposure fails with **one fixed, secret-independent error**. Document in code
   that this is a guardrail, not secure memory: previously-exposed aliases cannot be revoked and heap copies
   cannot be proven absent.
2. **`originGuard.ts` — bare-origin validator.** **`http:`/`https:` only** (`SCHEMA.md`). Reject userinfo,
   any path/query/fragment/trailing slash **including empty `?` and `#` delimiters**, and surrounding or
   internal whitespace *before* parsing. Pin WHATWG normalization for lowercasing, IDN/punycode, IPv6
   serialization, and removal of explicit default ports. **Deliver a normative input→output/rejection
   table** — do not leave edge cases to inference. No live browser state; comparison against a live
   top-level origin is M4's.
3. **`lockdown.ts` — taint/lockdown registry.** Provenance-keyed, never content-keyed. Identities are
   **trusted-host-minted BRANDED capability types** — a nominal/branded type whose constructor is
   private to the trusted side, so **forging one is a compile error, not a convention violation**.
   Typed as a bare `string` the registry tests degrade into exercising a `Map` and prove nothing about
   provenance. Explicit session/document/frame/element components with stated equality rules. The registry API **never accepts content**.
   **No generic `unlock`**: clearing happens only via trusted lifecycle operations
   (clear-on-trusted-top-level-navigation, clear-on-session-close), per §4 layer 2.
4. **`sessionMutex.ts` — per-session mutex.** Non-reentrant `runExclusive(session, fn)`; same-session nested
   acquisition **fails fast** with a fixed internal error. States `OPEN → CLOSING → CLOSED`. Close rejects
   new and queued work with a fixed outcome, lets the **current holder finish cleanly**, then deletes state.
   Close and release are idempotent; a late release cannot resurrect or corrupt state.
5. **`results.ts` — exact result constructors, proved by STRUCTURAL CONFINEMENT.** Exact signatures
   accepting only named public provenance; `filled` copied solely from caller-requested roles with pinned
   ordering/dedup semantics; closed reason/error sets with fixed text; no context/error/secret parameters.
   *(The differing-value/length differential is **M4's** — see Do-not-implement.)*
6. **`tripwire.ts` — detector + diagnostic types + supervisor-facing seam ONLY.** A pure, transform-aware
   detector over the **full §4 matrix**: raw, base64, base32, hex, percent, JSON-escape, reversed,
   whitespace-split — against the **normative corpus** (§4), whose expected
   strings are pinned independently of your detector so it cannot pass against its own narrow
   examples. **The seam has a pinned shape: sealed batch in → verdict + fixed-shape diagnostics out.**
   Control-plane only: no callbacks, no mutation of caller state, no per-event data-plane hook, and it
   refuses caller-originated/mixed-provenance bytes at the type level. Fixed-shape, non-secret diagnostic types. **Do not inject a callback sink into the
   caller path** — TypeScript cannot guarantee a callback won't throw, block, or mutate caller state, which
   re-opens the oracle. Detector and sink execution belong to the supervisor plane. "Trusted-originated" is
   defined **by provenance**; mixed caller/host strings are **refused, not scanned**.

### Do not implement

- Anything touching a browser, DOM, Playwright, CDP, or a live origin. **No test may assert a real-fill or
  DOM property.**
- **Tripwire wiring into `make eval`** — M4 owns first wiring, sealed-evidence lifecycle, and the "same
  caller result, different post-run verdict" test. M2 ships the seam, not the connection.
- **The results noninterference differential** — M4, where a real fill path exists.
- `fillService`, the in-realm inject primitive, verified credential destination, TOCTOU recheck — **M4**.
- The backend interface or `resolveSecret` — **M3**.
- B1's other slices: backend never-cache (**M3**), rotation A→B (**M4**).
- Fragment reassembly — checker-only, stays in `testbed/`.
- Any change to `testbed/`, the scorecard schema, or the checkers. Refactors of M1 code.

## File Ownership

Codex owns: `src/core/redaction.ts`, `originGuard.ts`, `lockdown.ts`, `sessionMutex.ts`, `results.ts`,
`tripwire.ts`, and their colocated `*.test.ts`.

Codex must avoid: `PLAN.md`, `.claude/memory/*`, `docs/*`, `testbed/*`, `src/agents/*`, `README.md`,
`SCHEMA.md`, and `src/core/types.ts`.

## Acceptance Criteria — happy path *and* rejection path (handoff §12)

- **`Secret` lifecycle matrix:** repeated exposure; `consume` vs `clear`; double-clear; exposure after clear
  (fixed error bytes); **every** coercion and enumeration route before *and* after clear; symbol/prototype/
  descriptor inspection; thrown-error paths (a `Secret` in a message or stack must not print plaintext).
  A test must state the external-alias limitation rather than assert a guarantee that doesn't hold.
- **Origin:** the full normative table, accept and reject, including every case named in scope item 2.
- **`results.ts`:** exact own-key sets and serialized bytes for every success and failure constructor, plus
  **compile-time negative cases** (`@ts-expect-error`) for secret arguments, secret-bearing fields, and extra
  properties — the M0 pattern that makes contract drift fail the build.
- **Mutex:** ordering with an active owner; multiple queued ops; rejection and throw; nested acquisition;
  close while active; close with queued waiters; repeated close; late release.
- **Lockdown:** session/document isolation; distinct-but-similar identities; stale-token rejection;
  navigation and session-close bulk clearing. Assert **registry-state semantics only** — do not simulate
  masking and present it as the DOM guarantee (M4 owns that).
- **Tripwire detector:** the full transform matrix against the normative corpus, each transform failing
  independently if deleted; plus false-positive controls and mixed-provenance strings it must **refuse
  to inspect**. Assert **supervisor-verdict semantics only** — M2 must not claim `make eval` fails.
- **Tripwire seam (R2 #1):** a test *or type-check* proving the seam **cannot be used as a callback
  sink in the caller path**. A comment saying so is not the deliverable; make it unrepresentable.
- **Lockdown tokens (amendment 12):** a compile-time negative case proving a forged/plain-string token
  is rejected. Without this the registry tests only prove `Map` semantics.

**Absence-detection:** for each primitive, include at least one test that **fails if the protection is
removed**. A green suite that stays green after you delete the protection is the failure mode here.

## Verification Commands

```bash
make test
```

Must pass `tsc --noEmit && vitest run`. `make eval` must remain green and unchanged.

## Contract conflicts — STOP, do not guess

`src/core/types.ts` and `SCHEMA.md` are locked. If M2 requires changing either, **stop and report** rather
than resolving it. Mid-M1 Codex correctly stopped on exactly this (`AttackClass` had no value for the benign
control run) and the kickback produced a clean amendment instead of a corrupted leak-rate table. Round 1 of
*this* slice did the same thing at plan level, and the plan was amended. The path works — use it.

## Review sequence you will be reviewed under (§9.1)

On the pending branch while the diff exists: **1.** Claude `/review` · **2.** Claude `/security-review` ·
**3.** Codex adversarial post-implementation diff review.

**Independence is relative to the author.** Because **Codex implements M2**, Claude's `/review` and
`/security-review` are the **different-family** channels; the Codex post-impl pass is fresh-context and
adversarial but **same-family** as the implementer — valuable for contract drift and locked-gate
reinterpretation, *not* a source of different-family coverage. None certifies M2; each is additive
(`handoff-pattern.md` §7.1). Where a review and a test disagree, **the locked invariant is authoritative,
not either mechanism.**

Security-review focus surfaces are §9.1's, as amended.

## Honest-claims rule

Do not write a claim the language cannot support. Specifically: no assertion that plaintext was zeroized or
erased from memory; no assertion that timing is *identical* (repeated trials **bound** detectable
differences, they do not prove noninterference); no assertion that M2 proves snapshot masking or eval
failure. Where a guarantee is structural rather than absolute, say which.

## Note on the simplification question

The standing merge-review question is **scoped at the existing M1 testbed, not at this diff** (§9.1):
`testbed/` is 3,486 lines against `src/`'s 597. No pre-emptive action needed from you.

## Reporting

Implementation-report format, `handoff-pattern.md` §13: Summary / Files Changed / Verification / Risks &
Follow-ups / **Deviations From Handoff**.
