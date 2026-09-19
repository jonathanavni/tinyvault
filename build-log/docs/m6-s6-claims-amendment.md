# M6 S6 claims-row amendment packet

Status: paper-only proposal for continuity owner Claude (`2026-09-08-s6`). This file does not apply the claim-row, test, source, or SCHEMA changes described below.

## 1. Summary

S5 declared residual (1) because the `P-attestation` and `P-same-observation` rows still name `testbed/checkers/offline.ts:deriveLeakFromEvidence`, while real-profile admission moved its first and only event-file read, digest verification, and parse into `readVerifiedRunEvents`. The accepted register explicitly records this drift. (`docs/m6-review-findings.md:1733-1735`; `testbed/parity/claims.ts:149`; `testbed/parity/claims.ts:277`)

The split is real, not cosmetic. A real-profile cohort preloads an event snapshot through `readVerifiedRunEvents`, stores that snapshot, and passes it into recomputation; `deriveLeakFromEvidence` then skips its own read and digest check whenever `verifiedEvents` is present. A mutation that bypasses the digest check at `readVerifiedRunEvents` therefore breaks the real-profile production path without mutating the currently named `deriveLeakFromEvidence` site. (`testbed/checkers/offline.ts:129-163`; `testbed/checkers/offline.ts:189-199`; `testbed/checkers/offline.ts:222-229`; `testbed/checkers/offline.ts:339-343`; `testbed/checkers/offline.ts:393-400`)

No selector currently named by either row reaches `readVerifiedRunEvents`:

- `attestation v2 signed transcript rejects same-key fixture mismatch` calls the digest verifier directly, not the offline real-profile caller. (`testbed/fixtures/shared/eventsDigest.test.ts:85-89`)
- `attestation v2 signed transcript rejects same-key run mismatch` calls the digest verifier directly, not the offline real-profile caller. (`testbed/fixtures/shared/eventsDigest.test.ts:90-94`)
- `attestation v2 signed transcript rejects exact-byte digest mismatch without reparsing or canonicalizing events` calls the digest verifier directly, not the offline real-profile caller. (`testbed/fixtures/shared/eventsDigest.test.ts:95-99`)
- `offline v2 authenticated single observation rejects invalid attestation before parsing invalid event JSON at the actual caller` uses a `stub-safe` persisted row and calls adjudication without provenance trust, so the `needsProvenance` real-profile preload is not entered and the fallback check remains in `deriveLeakFromEvidence`. (`testbed/runner.test.ts:772-805`; `testbed/runner.test.ts:810-821`; `testbed/runner.test.ts:944-952`; `testbed/checkers/offline.ts:129-157`; `testbed/checkers/offline.ts:393-400`)
- `offline v2 authenticated single observation reads events once and preserves the scored array and event objects across capture agreement and outcomes` uses the same `stub-safe` fixture builder and therefore proves the fallback/stub route only. (`testbed/runner.test.ts:772-805`; `testbed/runner.test.ts:960-980`; `testbed/checkers/offline.ts:129-157`)
- `Slice6 isolated observation proofs P-same-observation actual adjudication shares decoder graph with outcome consumers` also builds a `stub-safe` bundle without provenance trust, so it proves the common downstream graph identity but not the real-profile preload. (`testbed/parity/claims.test.ts:545-575`; `testbed/parity/claims.test.ts:1866-1886`; `testbed/checkers/offline.ts:129-157`)

An existing, currently unlinked S5 selector does exercise the real-profile digest edge: `G2 command permanently excludes first-read unsigned despite later valid bytes`. It substitutes unsigned bytes for the first real-profile event read, makes later bytes valid, and asserts exactly one read plus a per-run `signature-mismatch` with no admission. Link it to `P-attestation`. (`testbed/realAgentRun.test.ts:681-700`)

The existing companion `G2 ... EIO`/`unsigned` cases prove that a failed first read is not retried, but there is no real-profile *successful-first-read* test that would kill a mutation which verifies one buffer and then re-reads a different buffer for parsing; the only successful read-once/graph-identity tests are the two stub-path selectors listed above. Add the new test specified in section 2 before claiming `readVerifiedRunEvents` as a `P-same-observation` mutation site. (`testbed/realAgentRun.test.ts:681-700`; `testbed/runner.test.ts:960-980`; `testbed/parity/claims.test.ts:1866-1886`)

## 2. Proposed row edits

### P-attestation

Keep all four existing selectors and add the following existing S5 selector verbatim: (`testbed/parity/claims.ts:149`; `testbed/realAgentRun.test.ts:681-700`)

```json
{"kind":"runtime","file":"testbed/realAgentRun.test.ts","fullName":"G2 command permanently excludes first-read unsigned despite later valid bytes"}
```

The exact resulting selectors array is:

```json
[
  {"kind":"runtime","file":"testbed/fixtures/shared/eventsDigest.test.ts","fullName":"attestation v2 signed transcript rejects same-key fixture mismatch"},
  {"kind":"runtime","file":"testbed/fixtures/shared/eventsDigest.test.ts","fullName":"attestation v2 signed transcript rejects same-key run mismatch"},
  {"kind":"runtime","file":"testbed/fixtures/shared/eventsDigest.test.ts","fullName":"attestation v2 signed transcript rejects exact-byte digest mismatch without reparsing or canonicalizing events"},
  {"kind":"runtime","file":"testbed/runner.test.ts","fullName":"offline v2 authenticated single observation rejects invalid attestation before parsing invalid event JSON at the actual caller"},
  {"kind":"runtime","file":"testbed/realAgentRun.test.ts","fullName":"G2 command permanently excludes first-read unsigned despite later valid bytes"}
]
```

Use this exact `mutationSites` array, retaining the stub/fallback site and adding the real-profile site in execution order: (`testbed/checkers/offline.ts:222-229`; `testbed/checkers/offline.ts:393-400`)

```json
[
  "testbed/fixtures/shared/eventsDigest.ts:verifyEventsDigest",
  "testbed/checkers/offline.ts:readVerifiedRunEvents",
  "testbed/checkers/offline.ts:deriveLeakFromEvidence"
]
```

Add `testbed/checkers/offline.ts:readVerifiedRunEvents` between `verifyEventsDigest` and `deriveLeakFromEvidence` in both implementation-reference arrays. Do not change either boundary string. The exact resulting reference arrays are: (`testbed/parity/claims.ts:149`; `testbed/checkers/offline.ts:222-229`; `testbed/checkers/offline.ts:373-405`)

```json
{
  "inProcessImplementation.references": [
    "testbed/fixtures/shared/eventsDigest.ts:verifyEventsDigest",
    "testbed/checkers/offline.ts:readVerifiedRunEvents",
    "testbed/checkers/offline.ts:deriveLeakFromEvidence",
    "testbed/fixtures/shared/loginFixture.ts:startLoginFixture",
    "testbed/fixtures/index.ts:startFixtures",
    "testbed/runnerExecution.ts:runOnce"
  ],
  "composedImplementation.references": [
    "testbed/fixtures/shared/eventsDigest.ts:verifyEventsDigest",
    "testbed/checkers/offline.ts:readVerifiedRunEvents",
    "testbed/checkers/offline.ts:deriveLeakFromEvidence",
    "testbed/docker/composedFixtures.ts:transport",
    "testbed/docker/container/control.ts:createControlServer",
    "testbed/docker/container/fixture.ts:controlConfigForFixture",
    "testbed/fixtures/shared/loginFixture.ts:startLoginFixture",
    "testbed/runnerExecution.ts:runOnce"
  ]
}
```

Mutation proof to run after the row edit: temporarily bypass the `verifyEventsDigest(...)` rejection in `readVerifiedRunEvents`; the added `G2 ... unsigned` selector must fail because it requires the first unsigned snapshot to remain a `signature-mismatch` and never admit the row. Restore the source byte-for-byte before any gate. This exact bypass mutant has not been run in this packet. **(unverified)** (`testbed/checkers/offline.ts:222-229`; `testbed/realAgentRun.test.ts:681-700`)

### P-same-observation

Keep both existing selectors. Add this new selector after implementing the test specified below: (`testbed/parity/claims.ts:277`)

```json
{"kind":"runtime","file":"testbed/realAgentRun.test.ts","fullName":"P-same-observation command reads a valid real-profile event snapshot once and shares it with outcome consumers"}
```

The exact resulting selectors array is:

```json
[
  {"kind":"runtime","file":"testbed/runner.test.ts","fullName":"offline v2 authenticated single observation reads events once and preserves the scored array and event objects across capture agreement and outcomes"},
  {"kind":"runtime","file":"testbed/parity/claims.test.ts","fullName":"Slice6 isolated observation proofs P-same-observation actual adjudication shares decoder graph with outcome consumers"},
  {"kind":"runtime","file":"testbed/realAgentRun.test.ts","fullName":"P-same-observation command reads a valid real-profile event snapshot once and shares it with outcome consumers"}
]
```

Use this exact `mutationSites` array, retaining the common fallback/consumer site and adding the real-profile preload site: (`testbed/checkers/offline.ts:222-229`; `testbed/checkers/offline.ts:339-352`; `testbed/checkers/offline.ts:393-404`)

```json
[
  "testbed/checkers/offline.ts:readVerifiedRunEvents",
  "testbed/checkers/offline.ts:deriveLeakFromEvidence"
]
```

Add `testbed/checkers/offline.ts:readVerifiedRunEvents` before `deriveLeakFromEvidence` in both implementation-reference arrays. Do not change either boundary string. The exact resulting reference arrays are: (`testbed/parity/claims.ts:277`; `testbed/checkers/offline.ts:189-199`; `testbed/checkers/offline.ts:317-370`)

```json
{
  "inProcessImplementation.references": [
    "testbed/checkers/offline.ts:readVerifiedRunEvents",
    "testbed/checkers/offline.ts:deriveLeakFromEvidence",
    "testbed/checkers/offline.ts:recomputeRun",
    "testbed/fixtures/index.ts:startFixtures",
    "testbed/runner.ts:captureWithBrowser",
    "testbed/runnerExecution.ts:runOnce"
  ],
  "composedImplementation.references": [
    "testbed/checkers/offline.ts:readVerifiedRunEvents",
    "testbed/checkers/offline.ts:deriveLeakFromEvidence",
    "testbed/checkers/offline.ts:recomputeRun",
    "testbed/docker/composedFixtures.ts:startComposedFixtureSet",
    "testbed/docker/composedFixtures.ts:transport",
    "testbed/runner.ts:captureWithBrowser",
    "testbed/runnerExecution.ts:runOnce"
  ]
}
```

New Astra test item:

- File: `testbed/realAgentRun.test.ts`; top-level `it` name: `P-same-observation command reads a valid real-profile event snapshot once and shares it with outcome consumers`; therefore the full selector is exactly the JSON object above. Existing S5 command tests in this file already install a target-specific `node:fs/promises.readFile` spy only after the persisted bundle exists. (`testbed/realAgentRun.test.ts:655-668`; `testbed/realAgentRun.test.ts:681-700`)
- Setup: run the existing `command()` real-comparison path; at fixture close, resolve one real-profile `eventsPath`, read and retain its authentic signed bytes before installing the spy, and prepare a different parse-valid second-read buffer. Let the first offline target read return the authentic bytes and every later target read return the different bytes. (`testbed/realAgentRun.test.ts:681-693`; `testbed/checkers/offline.ts:130-163`)
- Assertions: the command retains the honest accepted outcome; the target event file is read exactly once; `leakScan` and `wrongOrigin` receive the same array reference and the same event-object identities, following the existing graph observers; restore every spy in `finally`. (`testbed/parity/claims.test.ts:1866-1886`; `testbed/checkers/offline.ts:339-369`)
- Deletion-isolated mutant: in `readVerifiedRunEvents`, verify the first `bytes` buffer but perform a second `readContainedBytes(...)` and parse that second buffer. The new test must fail on `reads === 1` (and may additionally fail on the accepted outcome), then the source must be restored byte-for-byte. This mutant has not been run in this packet. **(unverified)** (`testbed/checkers/offline.ts:222-229`)

### Independent expectations in `claims.test.ts`

Update the two literal `EXPECTED_BINDING_ROWS` entries so their common reference lists exactly match the arrays above before transport-specific references are appended. The test deliberately constructs those implementation bindings from independently authored literals. (`testbed/parity/claims.test.ts:1283-1284`; `testbed/parity/claims.test.ts:1412-1430`; `testbed/parity/claims.test.ts:1675-1685`)

Use these exact replacement lines:

```text
P-attestation ; implemented ; F ; testbed/fixtures/shared/eventsDigest.ts:verifyEventsDigest,testbed/checkers/offline.ts:readVerifiedRunEvents,testbed/checkers/offline.ts:deriveLeakFromEvidence ; Fixture and run binding plus the exact raw-event digest are authenticated before parsing; attestation protects runner-supplied bytes against later changes.
P-same-observation ; implemented ; A ; testbed/checkers/offline.ts:readVerifiedRunEvents,testbed/checkers/offline.ts:deriveLeakFromEvidence,testbed/checkers/offline.ts:recomputeRun ; Authenticated event bytes are read once and the same parsed array and objects feed leak scanning, capture agreement and derived outcomes.
```

Keep the existing `expectRuntime` calls and add these exact independent selector registrations: (`testbed/parity/claims.test.ts:1440-1450`; `testbed/parity/claims.test.ts:1491-1493`)

```ts
expectRuntime('P-attestation', 'testbed/realAgentRun.test.ts',
  'G2 command permanently excludes first-read unsigned despite later valid bytes');
expectRuntime('P-same-observation', 'testbed/realAgentRun.test.ts',
  'P-same-observation command reads a valid real-profile event snapshot once and shares it with outcome consumers');
```

## 3. SCHEMA claim-span fallout

None.

Spans s082, s115, s116, s118, and s123 describe the signed envelope, digest-before-parse rule, read-once/shared-object rule, and post-capture-integrity boundary without naming either `deriveLeakFromEvidence` or `readVerifiedRunEvents`; changing implementation linkage does not change their normative prose. (`SCHEMA.md:766-772`; `SCHEMA.md:992-1001`; `SCHEMA.md:1007-1011`; `SCHEMA.md:1032-1041`)

## 4. Application procedure

1. **Astra — new-mutant/test-file work.** Add the `P-same-observation` top-level command test to `testbed/realAgentRun.test.ts` exactly as specified in section 2. Run it green on the unmodified implementation, apply the specified second-read mutant to `readVerifiedRunEvents`, prove the same test red, restore `offline.ts` byte-for-byte, and rerun the test green. This changes a test and temporarily mutates a security-core claim site. (`CLAUDE.md:51-54`; `testbed/checkers/offline.ts:222-229`)
2. **Astra — existing-test mutant proof.** Run the existing `G2 ... unsigned` selector green, temporarily bypass the digest rejection in `readVerifiedRunEvents`, prove the selector red, restore `offline.ts` byte-for-byte, and rerun green. No new permanent source behavior is intended. (`CLAUDE.md:51-54`; `testbed/realAgentRun.test.ts:681-700`)
3. **Astra — machine claim row.** Edit only the `P-attestation` and `P-same-observation` objects in `testbed/parity/claims.ts`: apply the exact selector, `mutationSites`, and implementation-reference arrays in section 2; retain statuses, architectures, and boundary strings unchanged. `CLAIM_LINKS` is the machine linkage source. (`testbed/parity/claims.ts:11-17`; `testbed/parity/claims.ts:145-149`; `testbed/parity/claims.ts:277`)
4. **Astra — independent claim expectations.** In `testbed/parity/claims.test.ts`, replace the two `EXPECTED_BINDING_ROWS` lines and add the two independent `expectRuntime` registrations exactly as specified in section 2. Do not derive these expectations from `CLAIM_LINKS`; their independence is intentional. (`testbed/parity/claims.test.ts:1283-1284`; `testbed/parity/claims.test.ts:1439-1445`; `testbed/parity/claims.test.ts:1675-1685`; `docs/m5-2-slice-6-plan.md:527-538`)
5. **Astra — canonical markdown claim rows.** Manually replace only rows `P-attestation` and `P-same-observation` in `docs/m5-2-claim-evidence.md` with the now-exact `CLAIM_LINKS` objects. Each cell is compact `JSON.stringify` output inside backticks, with `|` encoded as `&#124;` and backticks encoded as `&#96;`; preserve row order and all other prose. (`docs/m5-2-claim-evidence.md:7-11`; `docs/m5-2-claim-evidence.md:139`; `testbed/parity/claims.test.ts:1720-1723`)
6. **No SCHEMA edit.** Leave all five reviewed claim spans unchanged for the reason in section 3. (`SCHEMA.md:766-772`; `SCHEMA.md:992-1011`; `SCHEMA.md:1032-1041`)

There is intentionally no repository command that regenerates expected claims or the canonical table from current source; automatic regeneration is forbidden so the corpus remains independent. The markdown table is manually serialized using `tableText`'s rules, and the exact validator is: (`docs/m5-2-slice-6-plan.md:527-538`; `testbed/parity/claims.test.ts:1704-1729`)

```sh
npx vitest run testbed/parity/claims.test.ts
```

Run verification in this order after restoring every mutant:

```sh
npx vitest run testbed/realAgentRun.test.ts -t 'G2 command permanently excludes first-read unsigned despite later valid bytes'
npx vitest run testbed/realAgentRun.test.ts -t 'P-same-observation command reads a valid real-profile event snapshot once and shares it with outcome consumers'
npx vitest run testbed/parity/claims.test.ts
npm run typecheck
make test
```

The focused commands prove the linked real-profile selectors execute; the parity command compares the canonical markdown row to `CLAIM_LINKS`, independently checks implementation bindings and selector sets, and the full gate supplies current execution reports for all runtime selectors. (`testbed/parity/claims.test.ts:1704-1730`; `testbed/parity/claims.ts:91-99`; `package.json:7-8`; `Makefile:3-4`)

Change classification: `docs/m5-2-claim-evidence.md` is a docs file but is the canonical claim crosswalk; `testbed/parity/claims.ts` is the machine claim table; `testbed/parity/claims.test.ts` is a claim gate; `testbed/realAgentRun.test.ts` is a new security-path test; the two temporary `offline.ts` mutations are verification artifacts and must not remain in the worktree. (`docs/m5-2-claim-evidence.md:3-5`; `testbed/parity/claims.ts:11-17`; `testbed/parity/claims.test.ts:1704-1730`; `testbed/checkers/offline.ts:222-229`)

## 5. Routing recommendation

Sol-applicable: this paper packet and later clerical reporting of owner-verified results. Sol is the documented route for docs/register work and paper review. (`CLAUDE.md:53-56`)

Astra-required: the new `P-same-observation` test, both deletion-isolated source mutants, and all three synchronized claim surfaces (`claims.ts`, `claims.test.ts`, and the canonical markdown rows). Although one surface is Markdown, these edits change a locked claim and its gate; CLAUDE.md assigns anything touching a locked invariant, gate, or claim, plus any output landing in a security-core file, to Astra. (`CLAUDE.md:51-54`)

The owner should not split the three claim surfaces across independently landing changes: `claims.test.ts` requires the markdown row to equal `CLAIM_LINKS` and separately requires the expected implementation bindings and selectors. (`testbed/parity/claims.test.ts:1704-1718`; `testbed/parity/claims.test.ts:1725-1730`)

## 6. Deviations From Handoff

None. This packet creates only `docs/m6-s6-claims-amendment.md`; it does not edit `PLAN.md`, `SCHEMA.md`, source, tests, the canonical claim table, or the canonical claim-evidence rows, and it does not commit.

## 7. Open questions for the owner

None. The only unverified work is explicitly routed above: the proposed new real-profile success-path test and the two temporary mutation kills must be executed before the row amendment can be treated as mutation-backed. (`testbed/checkers/offline.ts:222-229`; `testbed/realAgentRun.test.ts:681-700`; `docs/m5-2-slice-6-plan.md:537-538`)
