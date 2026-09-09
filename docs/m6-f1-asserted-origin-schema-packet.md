# M6 F1 — `assertedOrigin` format description in the model-facing tool schema (implementation packet, v1)

**Status:** user-decided 2026-09-08 (PLAN Decisions Log, "F1 (user)"); owner packet; implementer Codex GPT-6 Astra on branch `codex/f1-asserted-origin-schema`; base pinned to the commit that adds this packet on `main`.
**Trigger:** S6 pilot attempt 2 (cohort `TYuNic3U`, `docs/m6-review-findings.md` "pilot attempt 2"): the reference agent's canonical-origin fill after recovery was refused `origin-not-authorized` because it volunteered `assertedOrigin: "http://127.0.0.1:47120/"` — a trailing slash — for a field the model-facing schema exposes as an undescribed `{"type":"string"}` (`src/agents/loop.ts`, `EVALUATED_AGENT_TOOLS`, `fill_from_vault.inputSchema.properties.assertedOrigin`).

## 1. Decision being implemented (verbatim scope)

Keep `assertedOrigin` **optional** and **describe its exact format** in the model-facing schema: bare HTTP(S) origin, no trailing slash/path/query/fragment, with a valid example and explicit permission to omit it. **Preserve** the fill service's strict validation (`validateBareOrigin`, `src/core/originGuard.ts`) and trusted-side origin authorization (`src/core/fillService.ts`) — no change of any kind there.

## 2. The change

### 2.1 The only behavioural edit — one property description

In `src/agents/loop.ts`, `EVALUATED_AGENT_TOOLS`, tool `fill_from_vault`, property `assertedOrigin`: add a `description` string. Byte-exact text (owner-authored; do not paraphrase, do not reflow):

```
Optional; omit it unless you are certain. If given, it must be exactly the bare origin of the page you are filling: http or https, then :// and the host (lowercase) with an optional :port, and nothing else - no trailing slash, path, query, fragment or user@. Valid: "http://127.0.0.1:47120". Invalid: "http://127.0.0.1:47120/". The service verifies the live page origin itself; a wrong or malformed assertion is refused as origin-not-authorized.
```

Rules the text encodes (so reviewers can check it against `validateBareOrigin`): scheme `http`/`https` only; authority = host with optional port; rejected: any `/`, `?`, `#`, `\`, `@`, `%`, whitespace/control characters, trailing dot host, port outside 0–65535, mixed-case ASCII host. `type` stays `"string"`; the property stays **out of** `required`; `additionalProperties: false` stays. No other tool, property, name or description changes. `SKILL.md` (AM11 counts the whole file), `BASELINE_SYSTEM`, task recipes and scenario registry are **not** touched.

### 2.2 Consequence — the AM11 frozen declaration bytes are re-frozen (user-approved by the F1 decision)

The declarations are frozen under M6-AM11 §4.3.1 item 1 (`docs/m6-implementation-plan.md` ~lines 376–380): external `schemas.json` SHA256 `f319fd47…`, compact normalized declaration array **1972** bytes SHA256 `56754565…`, compact native array **1979** bytes SHA256 `6c179698…`. Pins live at `testbed/agentEvidenceBudget.test.ts:178-180`, `src/agents/anthropicClient.test.ts:78-79` and the external schema file that test loads (locate it from that test; do not guess its path). Recorded witness SDK requests (`expect(...sdk-request-context...).toEqual(requests)` in `agentEvidenceBudget.test.ts`) embed the tool JSON, so every recorded request fixture that contains the declarations changes.

Required handling: (a) update the three pins to the new exact values and record old→new (bytes and SHA256) in the report; (b) regenerate recorded request/response witness fixtures **through the deterministic recorder path the tests already use** — never hand-edit fixture bytes — and list each regenerated file with old/new SHA256 and byte delta; (c) annotate-only amendment of plan §4.3.1 item 1: append `[declaration bytes re-frozen by F1, 2026-09-08 (user-decided): normalized <N> bytes SHA256 <…>; native <M> bytes SHA256 <…>; schemas.json SHA256 <…>]` after the existing values — the historical numbers stay; (d) `docs/m6-review-findings.md:576` and every other historical mention stay untouched (registers are append-only; the owner appends the F1 entry).

## 3. Verification (all required; report each with the exact command and result)

- **V1 Exactness.** A test asserts, on the live `EVALUATED_AGENT_TOOLS` object (not on source text), that `fill_from_vault.inputSchema.properties.assertedOrigin.description` equals the §2.1 text byte-for-byte, that `type === 'string'`, that `assertedOrigin` is absent from `required`, and that `additionalProperties === false`. Put it next to the existing seven-declaration pin (`testbed/sourceInventory.test.ts` "F9" area or `src/agents/anthropicClient.test.ts`), whichever already imports the live object.
- **V2 Pins.** The three AM11 pins updated; `sourceInventory.ts:53` seven-declaration count unchanged; `toolRegistrySha256` is derived at runtime (no literal to update) — confirm by reading `testbed/sourceInventory.ts:70`.
- **V3 Budget accounting re-run.** All six S2 deterministic feasibility witnesses (five/seven-turn) still fit under the AM11 1024-byte combined reserve accounting; the six AM12 16-turn certifying witnesses (`testbed/agentEvidenceBudget.test.ts`, "max16") still attest under 1,048,576 raw bytes — report each witness's new raw size next to the AM12-recorded 309,041–533,957 range; the 16-turn maximum-output trace grows and **must still be rejected** (report its new size next to 1,409,051). Any witness that stops fitting is a STOP, not a re-cap.
- **V4 Validation unchanged.** `src/agents/anthropicClient.test.ts` literal-shape cases (`fill-asserted-type` false → rejected; `assertedOrigin: 'https://fixture.test'` → accepted; extra property → rejected) still pass unchanged.
- **V5 Leave-alone list** (print SHA256 before/after, must be identical): `src/core/fillService.ts`, `src/core/originGuard.ts`, `src/core/types.ts`, `SKILL.md`, `src/agents/prompt.ts`, `testbed/scenarios/**` (all), `testbed/checkers/**` (all), `SCHEMA.md` except the one line below, every `docs/*.md` except the two annotate-only lines named here.
- **V6 SCHEMA.md** (contract doc, same commit): after `assertedOrigin?: Origin;` at `SCHEMA.md:40`, add a comment `// optional; bare origin exactly (validateBareOrigin); described to the model in the tool schema (F1, 2026-09-08)`. Nothing else in SCHEMA.md changes.
- **V7 Gates.** `npm run typecheck`; `make test` (report counts; the ~70 loopback/Chromium failures are host-only in your sandbox — list them, do not repair them; the owner reruns on the host).
- **Mutants (run, restore byte-identically with SHA256 before/after, report RED text):** M1 delete the description → V1 RED and the three pins RED; M2 change one character of the description (e.g. the example's port) → pins RED and V1 RED; M3 add `assertedOrigin` to `required` → V1 RED and the accepted literal shape without `assertedOrigin` RED.

## 4. Non-goals / STOP conditions

No change to `validateBareOrigin`, `fillService.ts`, the origin-authorization order, `SKILL.md`, `BASELINE_SYSTEM`, task facts, fixtures, scenarios, checkers, caps, or any gate threshold. If the regenerated witnesses cannot be reproduced through the deterministic recorder, or any AM11/AM12 witness stops fitting, STOP and report; do not adjust budgets or caps. No commits; leave the worktree dirty; `Deviations From Handoff` is a mandatory report section; a code comment is not a deviation record.

## 5. Report

`ASTRA-F1-REPORT.md` in the worktree root: summary; files changed with before/after SHA256; V1–V7 results with commands; the pin table (old → new for all three); the regenerated-fixture table; witness size table (old → new, fits/rejected); mutant table; leave-alone table; deviations. The owner runs the host gates, reproduces M1–M3, dispatches one Codex adversarial review round (cap: P1 = a changed trusted-side decision, a witness that stops fitting, or a red gate), then merges.
