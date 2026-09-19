# TinyVault project teardown — Claude Code handoff

**Assessment date:** 2026-09-03  
**Reviewed revision:** `main` at `e69259d`  
**Assessment mode:** Read-only project, documentation, specification, implementation, and verification review

## Bottom line

TinyVault has a strong security-oriented foundation and unusually good test depth for its stage. Milestones M0–M5 are implemented, and the deterministic evaluation currently reports 30/30 completed runs with no detected leaks. The codebase is coherent, TypeScript-strict, dependency-disciplined, and backed by substantial mutation, timing, browser, and evaluator coverage.

It is not yet launch-ready. The most important problems are:

1. The repository's mandatory `make test` gate is currently red because a decoder stress test exceeds its 60-second timeout.
2. That test gate also depends on ignored, generated evaluation artifacts, so it is not reproducible from a clean checkout.
3. M5's in-process hostile fixtures conflict with the locked project specification, which requires Docker-composed hostile fixtures and explicitly assigns the first two fixtures to Docker Compose.
4. The present 0/30 leak result uses a scripted stub rather than a real browser-capable agent, so it is infrastructure proof—not evidence of the real-agent leak rate.
5. Several documents describe an older architecture or milestone state and no longer agree with the shipped implementation.
6. CI, runtime pinning, packaging, and other release-engineering controls remain largely absent.

Recommended project status: **NEEDS ATTENTION**. Treat M5 as functionally implemented but not fully closed until the failing gate, clean-checkout reproducibility, and Docker/spec conflict are resolved or explicitly adjudicated.

## What has shipped

The implementation covers six of the eleven planned milestones:

| Milestone | Shipped capability | Assessment |
|---|---|---|
| M0 | Repository skeleton and dependency boundary | Implemented and verified |
| M1 | Secret-handle API and mediated capabilities | Implemented |
| M2 | Audit events and append-only local evidence | Implemented, with documented durability limitations |
| M3 | Encrypted vault and ephemeral session materialization | Implemented |
| M4 | Browser fill service and supervisor integration | Implemented |
| M5 | Hostile fixture testbed and deterministic evaluator | Implemented, but fixture topology conflicts with the locked spec |

M6–M10 remain: real-agent browser evaluation, failure-path hardening, packaging/release work, final adversarial audit, and the demo/reporting layer described by the project plan.

Canonical project sources:

- [`PROJECT-SPEC.md`](../PROJECT-SPEC.md) — locked product and security contract; its intent wins on conflict.
- [`PLAN.md`](../PLAN.md) — active implementation state and milestone tracking.
- [`docs/phase-0-plan.md`](../../docs/phase-0-plan.md) — detailed phase plan and acceptance criteria.
- [`docs/m5-slice-spec.md`](m5-slice-spec.md) — M5 implementation contract.
- [`BACKLOG.md`](../BACKLOG.md) — known residual risks and deferred work.

## Verification snapshot

The following checks were performed against the reviewed revision:

| Check | Result |
|---|---|
| Strict TypeScript check | Passed |
| Production dependency-boundary check | Passed: 69 production modules, 61 data-plane roots |
| Mutation/self-test corpus | Passed: 11 fixtures, 48 load outcomes |
| Main unit/browser test tranche | Passed: 61 files, 972 tests passed, 1 deliberately skipped |
| Host timing family | Passed: 10/10, with a 32 μs sensitivity floor |
| Deterministic evaluation | Passed: 30/30 scripted-stub runs, 0 detected leaks, full completion |
| Evaluator observation health | `unobserved=0`, `bodiesUnobserved=0`, `scanTruncated=0`, channel coverage 10/11 |
| Dependency audit | Live `npm audit` reported zero known vulnerabilities across 77 dependencies |
| Full `make test` | **Failed**: decoder timing stress case exceeded its 60-second test timeout |
| Working tree | Clean after regenerating ignored evaluation artifacts |

The successful checks establish that the implemented deterministic path is internally consistent and well tested. They do not establish real-agent safety or production readiness.

## Confirmed issues

### P0 — Restore the mandatory test gate

`make test` is red because `testbed/checkers/leakDecoders.timing.test.ts` performs a 10-event benchmark and then a 200-event stress scan inside a test capped at 60 seconds. The benchmark itself finishes in roughly 2.9 seconds and satisfies its `<4s` assertion, but the later stress scan pushes total test time to roughly 61 seconds.

Evidence:

- [`package.json`](../../package.json), line 8: the failing suite is part of the mandatory test command.
- [`testbed/checkers/leakDecoders.timing.test.ts`](../../testbed/checkers/leakDecoders.timing.test.ts), lines 111–115: the 200-event stress invocation.

Do not solve this only by increasing the timeout without determining whether runtime growth is expected and bounded. Preserve the intended performance proof and separate benchmark assertions from heavy stress coverage if appropriate.

### P0 — Make tests reproducible from a clean checkout

The decoder timing test requires exactly 30 files in `artifacts/eval/runs`. That directory is ignored by Git, and `make test` does not generate it first. A clean clone can therefore fail before exercising product behavior.

Evidence:

- [`testbed/checkers/leakDecoders.timing.test.ts`](../../testbed/checkers/leakDecoders.timing.test.ts), lines 40–48: hard requirement for 30 run artifacts.
- [`.gitignore`](../../.gitignore), lines 35–36: `artifacts/` is ignored.
- [`Makefile`](../../Makefile): the test target does not establish this prerequisite.

Preferred outcome: deterministic tests create their own fixtures or use checked-in minimal fixtures. Generated evaluator output should not be an undeclared prerequisite for the unit-test gate.

### P0 — Resolve the M5 Docker contract conflict

The locked specification requires hostile pages to run as Docker-composed fixtures and explicitly defines the first two fixtures as Docker Compose targets. M5 instead shipped in-process HTTP fixtures, and the repository contains no Dockerfile or Compose definition for them.

Evidence:

- [`PROJECT-SPEC.md`](../PROJECT-SPEC.md), lines 47–50, 133–143, and 179–184.
- [`docs/phase-0-plan.md`](../../docs/phase-0-plan.md), lines 3–4, 356, and 402: specification intent wins and the fixture topology is part of the planned contract.
- [`docs/m5-slice-spec.md`](m5-slice-spec.md), lines 259–275: the implemented in-process topology.

This needs an explicit decision. Either implement the specified Docker topology and rerun acceptance, or amend the canonical specification with a security and reproducibility rationale. Do not silently treat the slice spec as overriding the locked project spec.

### P1 — Do not present the current leak rate as real-agent evidence

The 0/30 result is produced by a scripted stub. It validates orchestration, persistence, adjudication, and reporting, but it does not measure whether a real agent leaks secrets under hostile prompting. M6 is the first milestone expected to produce empirically meaningful agent-behavior evidence.

Evidence:

- [`README.md`](../../README.md), lines 42–44: identifies the current agent as a deterministic stub.

Any report or release language should label this result as a deterministic harness result until real-agent rows exist.

### P1 — Reconcile stale and contradictory documentation

Several documents describe different project states:

- [`README.md`](../../README.md), lines 26–29, still says the fill service is not built, while lines 37–38 report M4 and M5 complete.
- [`ORIENT.md`](../ORIENT.md), lines 9–24, contains unresolved placeholders.
- [`docs/phase-0-plan.md`](../../docs/phase-0-plan.md), lines 417–422, still identifies M2 as next.
- [`PLAN.md`](../PLAN.md), line 14, describes the same hygiene work as both completed and deferred.
- [`PROJECT-SPEC.md`](../PROJECT-SPEC.md) still describes native autofill/keyboard interaction, while the current fill implementation uses synchronous isolated-realm assignment.

First establish the intended canonical architecture; then update status documents without erasing useful historical decisions.

### P1 — Add release-engineering gates before packaging or publishing

The repository currently lacks several controls expected before external release:

- no CI workflow;
- no pinned Node version and no `engines` declaration;
- no lint or formatting gate;
- no defined package entrypoint, exports map, or build artifact contract;
- no visible license, security policy, contribution guide, changelog, or release tags.

These are not all immediate product blockers, but they make local success harder to reproduce and weaken release confidence. CI should separate deterministic unit checks, browser checks, timing/performance checks, and evaluator runs so failures retain their meaning.

## Known security and measurement residuals

These are already acknowledged in the repository and should become explicit M6–M9 acceptance inputs rather than remaining passive backlog notes:

- Screenshot text is the uninstrumented eleventh exfiltration channel. See [`README.md`](../../README.md), lines 61–68.
- Unload-time `sendBeacon`/`keepalive` traffic may escape event capture. See [`BACKLOG.md`](../BACKLOG.md), lines 47–52.
- CDP request identifiers are not guaranteed globally unique. See [`BACKLOG.md`](../BACKLOG.md), lines 53–54.
- Composed decoder attacks can exceed scan depth, width, or time budgets. See [`BACKLOG.md`](../BACKLOG.md), lines 31–36.
- The retention rule is shape-oriented and does not cover every console, fetch, stdout, or thrown-value path. See [`BACKLOG.md`](../BACKLOG.md), line 45.
- A form action may be safe when filled and rewritten before submission; the design relies on observation-layer detection if the later request is captured. See [`BACKLOG.md`](../BACKLOG.md), lines 18–26.
- `SupervisorHost.finish()` does not itself settle pending evidence. The testbed runner currently handles that through `afterLoop`, creating an integration contract that callers can miss. See [`src/supervisor/host.ts`](../../src/supervisor/host.ts), lines 403–413 and 503–510, and [`testbed/runner.ts`](../../testbed/runner.ts), lines 479–509.

The append-only local writer also documents two durability weaknesses: a write failure can leave a partial key, and the directory is not fsynced after rename. See [`src/backends/localFileWriter.ts`](../../src/backends/localFileWriter.ts), lines 1–7 and 228–260.

## Codebase quality assessment

### Strong areas

- Security boundaries are modeled explicitly rather than left as conventions.
- Production dependency flow is mechanically checked.
- Tests are roughly as large as the production-like codebase: approximately 11,301 test-like lines versus 10,878 production-like lines.
- Mutation-oriented, hostile-fixture, timing-sensitivity, persistence, and adjudication tests show good attention to false confidence.
- Failure and observation metadata are preserved well enough to distinguish detected safety from missing telemetry.
- The deterministic evaluator has a credible foundation for later real-agent experiments.

### Weak areas

- The primary repository gate is not green or clean-clone reproducible.
- The specification hierarchy is clear in prose but was not enforced when M5 changed fixture topology.
- Documentation has drifted faster than the implementation.
- Several important guarantees rely on runner-level sequencing rather than an API that makes unsafe sequencing difficult.
- Performance tests mix benchmark and stress responsibilities, making their pass/fail signal fragile.
- Release and environment reproducibility lag behind implementation quality.

Overall codebase quality is **good for a security prototype, below the bar for a releasable security product**. The central risk is not poor code; it is overstating what has been proven and allowing contracts, generated artifacts, and local-only verification assumptions to drift apart.

## Recommended execution order

1. **Repair `make test`.** Preserve a meaningful decoder performance bound while making the stress test reliable.
2. **Remove the hidden artifact prerequisite.** Confirm the complete test target passes from a clean checkout.
3. **Adjudicate the Docker conflict.** Implement the locked topology or formally amend the canonical spec before declaring M5 closed.
4. **Refresh canonical and orientation docs.** Align README, ORIENT, PLAN, and phase-plan status with the actual architecture and milestone state.
5. **Add reproducible CI.** Pin Node and create distinct deterministic, browser, timing, and evaluation jobs.
6. **Specify M6 around real-agent evidence.** Carry every declared observation blind spot into its threat model and acceptance criteria.
7. **Defer public leak-rate claims.** Require real-agent runs, explicit denominators, telemetry-completeness reporting, and reproducible artifacts.
8. **Run a whole-codebase adversarial audit after M9.** Recheck the end-to-end capability boundary, observation coverage, persistence, and fail-closed behavior before release work is declared complete.

## Instructions for the next Claude Code session

- Treat `PROJECT-SPEC.md` as canonical when documents disagree; surface conflicts instead of reconciling them silently.
- Begin by reproducing the current failures and recording exact commands and results.
- Keep product defects separate from environment or sandbox failures.
- Prefer mutation-sensitive tests that fail when the relevant protection is removed.
- Verify the real CLI/build/evaluation path, not only in-process helpers.
- Do not mark M5 complete solely because the deterministic evaluator is green.
- Do not claim a measured leak rate for real agents until M6 produces real-agent rows.
- Keep changes narrowly scoped, and update project status documents only after the corresponding gate is demonstrably green.

