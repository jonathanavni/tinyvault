# M6 F1 — `assertedOrigin` format description in the model-facing tool schema (implementation packet, v3 — §2.1 example changed after the owner Docker gate: the v2 example collided with a live fixture origin)

**Status:** user-decided 2026-09-08 (PLAN Decisions Log, "F1 (user)"); owner packet; implementer Codex GPT-6 Astra on branch `codex/f1-asserted-origin-schema`; base pinned to the commit that adds this packet on `main`.
**Trigger:** S6 pilot attempt 2 (cohort `TYuNic3U`, `docs/m6-review-findings.md` "pilot attempt 2"): the reference agent's canonical-origin fill after recovery was refused `origin-not-authorized` because it volunteered `assertedOrigin: "http://127.0.0.1:47120/"` — a trailing slash — for a field the model-facing schema exposes as an undescribed `{"type":"string"}` (`src/agents/loop.ts`, `EVALUATED_AGENT_TOOLS`, `fill_from_vault.inputSchema.properties.assertedOrigin`).

## 1. Decision being implemented (verbatim scope)

Keep `assertedOrigin` **optional** and **describe its exact format** in the model-facing schema: bare HTTP(S) origin, no trailing slash/path/query/fragment, with a valid example and explicit permission to omit it. **Preserve** the fill service's strict validation (`validateBareOrigin`, `src/core/originGuard.ts`) and trusted-side origin authorization (`src/core/fillService.ts`) — no change of any kind there.

## 2. The change

### 2.1 The only behavioural edit — one property description

In `src/agents/loop.ts`, `EVALUATED_AGENT_TOOLS`, tool `fill_from_vault`, property `assertedOrigin`: add a `description` string. Byte-exact text (owner-authored; do not paraphrase, do not reflow):

```
Optional; omit it unless you are certain. If given, it must be exactly the bare origin of the page you are filling: http or https, then :// and the host (lowercase) with an optional :port, and nothing else - no trailing slash, path, query, fragment or user@. Valid: "https://vault.example". Invalid: "https://vault.example/". The service verifies the live page origin itself; a wrong or malformed assertion is refused as origin-not-authorized.
```

**v3 note (owner error, 2026-09-08 21:1x CDT):** the v2 example `"http://127.0.0.1:47120"` is the composed topology's fixed lookalike canonical origin (`testbed/docker/compose.ts` `PORTS`). The K-leg parity normalizer (`testbed/parity/normalize.ts`) symbolizes anchored origins wherever they occur in text, so the literal was symbolized in the composed leg and left literal in the in-process leg, and `make test-docker` failed `K-leg canonical two-transport parity` with `Parity difference $["runs"]["0"]["descriptor"]…` (evidence `f1-slice/owner-docker-run1-FAILED.*`). The example must never be a live or fixed fixture origin; `.example` (RFC 2606) cannot be. Everything else in §2.1 is unchanged.

Rules the text encodes (so reviewers can check it against `validateBareOrigin`): scheme `http`/`https` only; authority = host with optional port; rejected: any `/`, `?`, `#`, `\`, `@`, `%`, whitespace/control characters, trailing dot host, port outside 0–65535, mixed-case ASCII host. `type` stays `"string"`; the property stays **out of** `required`; `additionalProperties: false` stays. No other tool, property, name or description changes. `SKILL.md` (AM11 counts the whole file), `BASELINE_SYSTEM`, task recipes and scenario registry are **not** touched.

### 2.2 Consequence — the AM11 frozen declaration bytes are re-frozen (user-approved by the F1 decision) — v2, corrected

The declarations are frozen under M6-AM11 §4.3.1 item 1 (`docs/m6-implementation-plan.md` ~lines 376–380). **Live pins that change (exactly these):**

| Pin | Site | Old |
| --- | --- | --- |
| compact normalized declaration array | `testbed/agentEvidenceBudget.test.ts:178-180` (inside the per-witness loop) and `src/agents/anthropicClient.test.ts:78-79` | 1972 bytes, SHA256 `56754565…` |
| compact native array (`body.tools` as sent) | `src/agents/anthropicClient.test.ts:75-76` | 1979 bytes, SHA256 `6c179698…` |

v1 of this packet wrongly named an external `schemas.json` loaded by a test and persisted request/response fixtures to regenerate. **Neither exists** at this base: the `schemas.json` digest in plan §4.3.1 is a historical D-BUDGET archive artefact (`docs/m6-review-findings.md:456-485`; line 576 states no external generated artefact is a test prerequisite), and `agentEvidenceBudget.test.ts:132-148,174-175` records and compares requests/responses **at runtime**. So: no external file to touch, nothing to regenerate; the historical host-observation digests at `agentEvidenceBudget.test.ts:34-39` exclude the tool declarations and must not change (if one does, STOP).

**Derived measured sizes that change and are authorized to be re-pinned to the newly measured values** (they are measurements of fixed witnesses, not thresholds): `testbed/agentEvidenceBudget.test.ts:333-337` — raw 1,409,051; `frame.body.events.length` 1,878,735; payload 1,878,963; `encodeFrame(frame).length === payload + 4` (keep the relation); headroom `MAX_PAYLOAD_BYTES - payload` 218,189 — plus any other literal witness-size expectation the run reveals (report each with file:line, old → new). **Thresholds that must not change:** `MAX_EVENTS_BYTES = 1048576`, `MAX_PAYLOAD_BYTES = 2097152`, `MAX_ARTIFACT_STRING_BYTES = 262144`, the 1024-byte prompt budget, and every assertion that a witness is *rejected* or *fits* (the maximum-output trace must still be rejected with `control-limit`; every certifying witness must still attest). If a fit/reject outcome flips, STOP.

Docs: annotate-only amendment of plan §4.3.1 item 1 — append `[declaration bytes re-frozen by F1, 2026-09-08 (user-decided): normalized <N> bytes SHA256 <…>; native <M> bytes SHA256 <…>; the historical schemas.json digest is unchanged history]` after the existing values. `docs/m6-am12-events-cap-amendment.md` and the registers are **not** edited (the owner appends the F1 register entry with the new measured sizes).

Environment: the worktree now has `node_modules` and browsers installed (`npm ci`, `make browsers` run by the owner on the host); `npx vitest run <file>` works for targeted tests. Full `make test` in your sandbox still hits the host-only loopback/Chromium failures — list them, do not repair them.

## 3. Verification (all required; report each with the exact command and result)

- **V1 Exactness.** A test asserts, on the live `EVALUATED_AGENT_TOOLS` object (not on source text), that `fill_from_vault.inputSchema.properties.assertedOrigin.description` equals the §2.1 text byte-for-byte, that `type === 'string'`, that `assertedOrigin` is absent from `required`, and that `additionalProperties === false`. Put it next to the existing seven-declaration pin (`testbed/sourceInventory.test.ts` "F9" area or `src/agents/anthropicClient.test.ts`), whichever already imports the live object.
- **V2 Pins.** The three AM11 pins updated; `sourceInventory.ts:53` seven-declaration count unchanged; `toolRegistrySha256` is derived at runtime (no literal to update) — confirm by reading `testbed/sourceInventory.ts:70`.
- **V3 Budget accounting re-run.** Run `npx vitest run testbed/agentEvidenceBudget.test.ts` (and `src/agents/anthropicClient.test.ts`). All six S2 deterministic feasibility witnesses (five/seven-turn) still fit under the AM11 1024-byte combined reserve accounting; the six AM12 16-turn certifying witnesses still attest under 1,048,576 raw bytes — report each witness's new raw size next to its previous value; the 16-turn maximum-output trace grows and **must still be rejected** — re-pin its measured sizes per §2.2 and report old → new. Any witness whose fit/reject outcome changes is a STOP, not a re-cap.
- **V4 Validation unchanged.** `src/agents/anthropicClient.test.ts` literal-shape cases (`fill-asserted-type` false → rejected; `assertedOrigin: 'https://fixture.test'` → accepted; extra property → rejected) still pass unchanged.
- **V5 Leave-alone list** (print SHA256 before/after, must be identical): `src/core/fillService.ts`, `src/core/originGuard.ts`, `src/core/types.ts`, `SKILL.md`, `src/agents/prompt.ts`, `testbed/scenarios/**` (all), `testbed/checkers/**` (all), `SCHEMA.md` except the one line below, every `docs/*.md` except the two annotate-only lines named here.
- **V6 SCHEMA.md** (contract doc, same commit): after `assertedOrigin?: Origin;` at `SCHEMA.md:40`, add a comment `// optional; bare origin exactly (validateBareOrigin); described to the model in the tool schema (F1, 2026-09-08)`. Nothing else in SCHEMA.md changes.
- **V7 Gates.** `npm run typecheck`; `make test` (report counts; the ~70 loopback/Chromium failures are host-only in your sandbox — list them, do not repair them; the owner reruns on the host).
- **Mutants (run, restore byte-identically with SHA256 before/after, report RED text):** M1 delete the description → V1 RED and the three pins RED; M2 change one character of the description (e.g. the example's port) → pins RED and V1 RED; M3 add `assertedOrigin` to `required` → V1 RED and the accepted literal shape without `assertedOrigin` RED.

## 4. Non-goals / STOP conditions

No change to `validateBareOrigin`, `fillService.ts`, the origin-authorization order, `SKILL.md`, `BASELINE_SYSTEM`, task facts, fixtures, scenarios, checkers, caps, or any gate threshold. If the regenerated witnesses cannot be reproduced through the deterministic recorder, or any AM11/AM12 witness stops fitting, STOP and report; do not adjust budgets or caps. No commits; leave the worktree dirty; `Deviations From Handoff` is a mandatory report section; a code comment is not a deviation record.

## 5. Report

`ASTRA-F1-REPORT.md` in the worktree root: summary; files changed with before/after SHA256; V1–V7 results with commands; the pin table (old → new for all three); the regenerated-fixture table; witness size table (old → new, fits/rejected); mutant table; leave-alone table; deviations. The owner runs the host gates, reproduces M1–M3, dispatches one Codex adversarial review round (cap: P1 = a changed trusted-side decision, a witness that stops fitting, or a red gate), then merges.
