# M2 Slice Spec — Security Primitives (Codex implementation handoff)

> **Status:** draft for Codex **pre-implementation adversarial review** (ladder step 2), then implementation.
> Governed by [`phase-0-plan.md`](phase-0-plan.md) §8 (M2 row), §9.1 (review gate), §4 (redaction layers),
> §2 (contracts). Those are LOCKED — this packet **implements** them and may not reinterpret them.

## Task

Implement M2: the six security primitives, **unit-testable in isolation with no browser**, plus the M2 slice
of the never-cache-the-secret invariant (B1 slice 1/3).

## Branch / Worktree

Work in: `codex/m2-primitives`
Base commit: `5640763`
Do not modify unrelated files.

## Required Reading

- `CLAUDE.md`
- `PLAN.md` — **Current State only** (do not read or edit the Decisions Log)
- `docs/phase-0-plan.md` — **§2** (contracts + fill gate), **§4** (redaction layers 1–3), **§5** (canary +
  `Channel` enum), **§8** (M2 row), **§9.1** (the review gate you will be reviewed against)
- `src/core/types.ts` — the locked model-visible contract
- `SCHEMA.md` — only if you believe a contract change is needed (see *Contract conflicts* below)
- `.claude/memory/conventions.md`

Do **not** bulk-load `.claude/memory/`.

## Context

- TinyVault's thesis is *measure, don't assert*: plaintext never enters the model's context, proven by a
  leak-rate testbed rather than by claims.
- **M0** (contracts) and **M1** (eval spine) are done and on `main`. `make eval` runs fully offline and
  deterministically, emitting a Wilson-CI scorecard. 81 tests green.
- **There is no fill service yet.** M2 is the first slice that handles real secrets, but it handles them
  *only in isolated primitives* — no browser, no DOM, no Playwright.
- The plan was locked after a 3-round Codex adversarial ladder plus an independent Opus 5 audit. Round-2
  finding #6 specifically caught M2 having a forward dependency on M4's browser and split them. **Do not
  re-merge them.**
- Several primitives here exist because a reviewer demonstrated an oracle. `Secret<T>` (layer 1), the
  provenance-based taint registry (layer 2), and the tripwire-as-instrumentation (layer 3) are each the
  *fix* for a specific attack. Weakening one to simplify re-opens a closed finding.

## Scope

Implement in `src/core/`:

1. **`redaction.ts` — `Secret<T>`.** `toString`/`toJSON`/`inspect`/`util.inspect.custom`/template coercion/
   property enumeration all yield `"[REDACTED]"`. Exactly one accessor, `expose()`, whose single production
   call site is M4's in-realm inject primitive (which does not exist yet — M2 ships the wrapper and its
   tests only). **[B1 slice 1/3]** an explicit clear/consume lifecycle: after clear, no plaintext or derived
   material remains reachable through any accessor, property, serialization, or error path.
2. **`originGuard.ts` — bare-origin string validator.** `scheme://host[:port]`, no path/query/fragment/
   trailing slash. Pure string-level accept/reject and normalization. **It does not read live browser
   state** — comparing against a live top-level origin is M4's job.
3. **`lockdown.ts` — taint/lockdown registry.** Provenance-keyed, not value-keyed (§4 layer 2): records that
   a given (session, frame, element) identity is locked/tainted and must be masked *because of where it is*,
   never because its content matches a secret. In M2 identities are opaque keys supplied by the caller —
   no DOM.
4. **`sessionMutex.ts` — per-session mutex** serializing page ops. Correct release on the exceptional path,
   defined reentrancy behavior, defined behavior on session close while held, and no stale state after
   release.
5. **`results.ts` — exact result constructors.** Every `FillResult` is built by a constructor taking only
   **non-secret provenance**. No enum, boolean, count, or string may be derived from a secret's value or
   length (round-2 #NEW).
6. **`tripwire.ts` — content tripwire as pure instrumentation** (§4 layer 3). Registers the live secret
   (canary in tests) in a taboo set; scans **trusted-originated** outbound strings; on match writes to a
   protected host-side sink and fails the eval/CI run. It **never** inspects caller input and **never**
   alters caller-visible control flow, return values, process lifetime, or observable timing.

### Do not implement

- Anything touching a browser, DOM, Playwright, CDP, or a live origin. **No test in this slice may assert a
  real-fill or DOM property** (locked, §8 M2 row).
- `fillService`, the in-realm inject primitive, verified credential destination, TOCTOU recheck — all **M4**.
- The backend interface or `resolveSecret` — **M3**.
- B1's *other* two slices: the backend never-cache contract (**M3**) and "a second fill re-resolves" (**M4**).
  They are already written into those milestone rows. Do not pull them forward; the second needs
  `fillService`, which does not exist.
- Any change to `testbed/`, the scorecard schema, or the checkers.
- Refactors of M1 code. (The simplification question is asked separately at merge review — see below.)

## File Ownership

Codex owns: `src/core/redaction.ts`, `src/core/originGuard.ts`, `src/core/lockdown.ts`,
`src/core/sessionMutex.ts`, `src/core/results.ts`, `src/core/tripwire.ts`, and their colocated `*.test.ts`.

Codex must avoid: `PLAN.md`, `.claude/memory/*`, `docs/*`, `testbed/*`, `src/agents/*`, `README.md`,
and `src/core/types.ts` (locked contract — see below).

## Acceptance Criteria

**Behavior:** as scoped above; every primitive usable and tested standalone.

**Tests — happy path *and* rejection path (handoff §12):**

- `Secret` masking across **every** coercion route: `String()`, template literal, `JSON.stringify`,
  `console.log`/`util.inspect`, spread, `Object.keys`/`entries`/`getOwnPropertyNames`, and **thrown-error
  paths** (a `Secret` in an error message or stack must not print plaintext).
- **[B1 slice 1/3]** post-clear: no accessor, property, serialization, or error path yields the value.
- Origin validator: accept/reject table including trailing slash, path, query, fragment, default vs explicit
  port, uppercase scheme/host, IDN/punycode, IPv6 literals, userinfo, whitespace, and empty.
- **Noninterference differential** (`results.ts`): under identical public state, construct results with
  secrets of **differing value and differing length**; assert caller-visible result bytes and error paths are
  **byte-identical**.
- Tripwire: fires (protected sink written, run failed) **and** caller-visible behavior is provably unchanged
  vs the non-leaking path — same return value, same control flow, no teardown branch.
- Mutex: mutual exclusion under concurrency, release on throw, release on rejection, behavior on
  close-while-held, no stale lock after release.
- Lockdown registry: lock/unlock, masking keyed on **provenance not value** (an entry whose content happens
  to equal a secret is masked because of its identity; an untainted entry with identical content is not).

**Safety:** the rejection and race paths above are the point of the slice, not extras.

## Verification Commands

```bash
make test
```

Must pass `tsc --noEmit && vitest run` (the M0 finding: `vitest run` alone strips types without checking).
`make eval` must remain green and unchanged.

## Contract conflicts — STOP, do not guess

`src/core/types.ts` is a **locked** contract. If implementing M2 requires changing it, **stop and report the
conflict** rather than resolving it. This is not hypothetical: mid-M1, Codex correctly stopped on exactly this
(the `AttackClass` enum had no value for the benign control run), and kicking it back produced a clean
amendment instead of a corrupted leak-rate table. Same rule here.

## Review sequence you will be reviewed under (§9.1)

After implementation, on the pending branch while the diff exists:

1. Claude `/review` (fresh-context QA)
2. Claude `/security-review` (security-specialized third channel)
3. Codex adversarial post-implementation diff review

**Family terminology, stated correctly — independence is relative to the author.** Because **Codex implements
M2**, Claude's `/review` and `/security-review` are the **different-family** channels here; the Codex
post-implementation pass is fresh-context and adversarial but **same-family** as the implementer — valuable
for contract drift and locked-gate reinterpretation, *not* a source of different-family coverage. None of the
three certifies M2; each is additive (`handoff-pattern.md` §7.1). Where a review and a test disagree, **the
locked invariant is authoritative, not either mechanism.**

The security review will be directed at these surfaces specifically (§9.1): `Secret<T>` exposure via coercion/
serialization/inspection/enumeration/error paths/logging; bare-origin parsing edge cases; result-constructor
noninterference across differing secret values *and lengths*; mutex cleanup, exceptional release, reentrancy,
session-close races, stale taint state; and the tripwire never altering caller-visible behavior or timing.

**M2 must not claim real-fill or DOM guarantees** — reserved for M4's integration gates.

## Note on the simplification question

The standing merge-review question — *"which state, abstraction, duplicated validation, or evidence-binding
layer can be removed without weakening a locked invariant or test?"* — is **scoped at the existing M1 testbed,
not at this diff** (§9.1). `testbed/` is 3,486 lines against `src/`'s 597. It is not a criticism of this slice
and needs no pre-emptive action from you.

## Reporting

Use the implementation report format in `handoff-pattern.md` §13: Summary / Files Changed / Verification /
Risks & Follow-ups / **Deviations From Handoff**.
