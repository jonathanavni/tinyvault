

export function timingSourceLifecyclePins() {
  // User-authorized pre-existing exceptions: exact statements and suite positions only.
  return {
    hook: [
      "afterEach(async () => {",
      "    lifecycleHost?.abort();",
      "    try { await lifecycleHost?.closeAll(); }",
      "    finally {",
      "      await lifecycleBrowser?.close(); lifecycleHost = undefined; lifecycleBrowser = undefined;",
      "    }",
      "  });",
    ].join('\n'),
    each: [
      "it.each([false, true])('busy-renderer suspension cutoff permits successful quiesce within the hard five-second budget (pending CDP=%s)', async (pendingCdp) => {",
      "    const { host, page } = await lifecycleTimingHarness((context) => {",
      "      if (!pendingCdp) return;",
      "      const create = context.newCDPSession.bind(context);",
      "      vi.spyOn(context, 'newCDPSession').mockImplementation(async (target) => {",
      "        const cdp = await create(target); const send = cdp.send.bind(cdp);",
      "        vi.spyOn(cdp, 'send').mockImplementation((async (method: string, params?: never) => {",
      "          if (method !== 'Emulation.setScriptExecutionDisabled') return send(method as never, params);",
      "          const work = await Promise.allSettled([send('Runtime.evaluate', { expression: '1' }), send(method, params)]);",
      "          for (const result of work) if (result.status === 'rejected') throw result.reason;",
      "          return (work[1] as PromiseFulfilledResult<any>).value;",
      "        }) as CDPSession['send']); return cdp;",
      "      });",
      "    });",
      "    const entered = page.waitForEvent('console', (message) => message.text() === 's4-suspend-busy');",
      "    await page.evaluate(() => { setTimeout(() => { console.log('s4-suspend-busy'); while (true) {} }, 0); });",
      "    await entered;",
      "    const start = performance.now(); await host.quiesceEvidenceProducers!();",
      "    expect(performance.now() - start).toBeLessThan(5_000);",
      "    expect(inspectSupervisedHostCaptureFailedForTest(host)).toBe(false);",
      "    host.drainEvidence(); expect(host.finish().verdict).toBe('pass');",
      "  }, 10_000);",
    ].join('\n'),
    rootHooks: [
    [
      "afterEach(async () => {",
      "  for (const host of activeHosts.splice(0)) host.abort();",
      "  await Promise.all(activeSessions.splice(0).map((sessions) => sessions.closeAll()));",
      "  vi.restoreAllMocks();",
      "});",
    ].join('\n'),
    [
      "afterEach(({ task }) => {",
      "  try {",
      "    const sequence = ++ledgerSequence;",
      "    try { ledger.push({ task, sequence }); }",
      "    catch (error) {",
      "      const message = error instanceof Error ? error.message : String(error);",
      "      try { ledgerFailures.push({ task, sequence, message }); }",
      "      catch (failure) { console.error(failure); }",
      "      console.error(error);",
      "    }",
      "  } catch (error) { try { console.error(error); } catch {} }",
      "});",
    ].join('\n'),
    ],
  };
}

export function timingSourceFamilyBody(): string {
  const gateMap = 'probe' + 'Results';
  return [
    '{',
    "    // Called directly so a rejection's full message (probe, p-value, Holm threshold, rank) reaches the",
    "    // JSON report; the expect(...).not.toThrow() wrapper truncated it to 'tripw…' (M6 close gate 2).",
    '    assertProbeFamily(' + gateMap + ', { alpha: 0.01, expected: PROBE_NAMES });',
    '    const biased = new Map(' + gateMap + ');',
    "    const name = 'reflection-equal-length';",
    '    biased.set(name, { ...biased.get(name)!, pValue: 0 });',
    '    expect(() => assertProbeFamily(biased, { alpha: 0.01, expected: PROBE_NAMES }))',
    '      .toThrow(`Probe P family rejected: ${name}`);',
    '  }',
  ].join('\n');
}

export function timingSourceNonDiagnosticTitles(): string[] {
  return [
    "pins same-constructor timing payloads against the bare-rotation mutant",
    "kills secret-length-dependent fill latency after asserting exact result equality",
    "kills secret-length-dependent mutex occupancy with an immediately queued control",
    "kills a content-dependent reflection oracle with equal-length caller traffic",
    "kills match-dependent tripwire timing through composeSupervisedHost",
    "kills match-dependent tripwire timing on a real supervised browser fill call",
    "kills content-dependent request-listener work on the real supervised click path",
    "applies the Holm–Bonferroni family gate over the six probes",
    "reports a path-specific 2us-per-call injected-bias control rejected by the family gate",
    "reports the length-proportional fill-wrapper sensitivity floor",
  ];
}

export function timingSourceDiagnosticTitles(): string[] {
  return [
    "tripwire-match-vs-no-match-aa",
    "tripwire-match-vs-no-match-sham",
    "tripwire-real-click-match-vs-no-match-aa",
    "tripwire-real-click-match-vs-no-match-sham",
    "tripwire-real-click-bias-250us",
    "tripwire-real-click-bias-1000us",
  ];
}

export const PINNED_TIMING_IMPORTS = [
  "import { readFile } from 'node:fs/promises';",
  "import ts from 'typescript';",
  "import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';",
  "import type { CredentialBackend } from '../backends/backend';",
  "import { createBrowserControls } from '../browser/controls';",
  "import { launchChromium, type Browser, type BrowserContext, type CDPSession, type Page } from '../browser/playwright';",
  "import { createBrowserSessionHost, type BrowserSessionHost } from '../browser/session';",
  "import { createFillService } from '../core/fillService';",
  "import { Secret } from '../core/redaction';",
  "import type { Origin } from '../core/types';",
  "import {\n  assertProbeFamily,\n  assertProbeHardClause,\n  runProbeP,\n  type ProbePResult,\n} from '../../testbed/probe/probeP';",
  "import { ENTRY_NAMES, TASK_TITLE_TO_ENTRY, classifyFamilyError, composeFloor, startTimingSidecar, finishTimingSidecar,\n  type DiagnosticResult, type FamilyVerdict, type FloorResult, type LedgerRow, type LedgerFailure } from '../../testbed/probe/timing2Sidecar';",
  "import { timingSourceChecks, timingSourceMutations, timingSourceCompiler } from '../../testbed/probe/timingSourcePins';",
  "import { SECRET_TRANSFORM_NAMES } from '../shared/secretTransforms';",
  "import { startControlsLab, type ControlsLab } from '../../testbed/fixtures/controls-lab';",
  "import { createLockdownDomain } from './lockdownDomain';",
  "import { EvidenceLease, composeSupervisedHost, createSupervisedHost, CAPTURE_FAILED_MESSAGE,\n  inspectSupervisedHostCaptureFailedForTest, type SupervisedHost } from './host';",
  "import * as secretMatcher from './secretMatcher';",
  "import { TripwireRun } from './tripwireSeam';",
  "import { flatCopy, rotateFinalCharacter, characterClassShape, timingService, timingVaultResult,\n  browserClickTimingService, timingFillOutcome, TimingSessions } from './host.timing.fixtures';"
];

export const PINNED_ENTRY_NAMES_SOURCE = [
    "const ENTRY_NAMES = [",
    "  'fill-short-vs-long',",
    "  'queued-short-vs-long',",
    "  'reflection-equal-length',",
    "  'tripwire-match-vs-no-match',",
    "  'tripwire-real-click-match-vs-no-match',",
    "  'real-listener-click',",
    "  'tripwire-batched-injected-bias-control',",
    "  'sensitivity-floor',",
    "  'tripwire-match-vs-no-match-aa',",
    "  'tripwire-match-vs-no-match-sham',",
    "  'tripwire-real-click-match-vs-no-match-aa',",
    "  'tripwire-real-click-match-vs-no-match-sham',",
    "  'tripwire-real-click-bias-250us',",
    "  'tripwire-real-click-bias-1000us',",
    "] as const;",
  ].join('\n');

export const PINNED_TASK_TITLES_SOURCE = [
    "const TASK_TITLE_TO_ENTRY: Readonly<Record<string, string>> = {",
    "  'kills secret-length-dependent fill latency after asserting exact result equality': 'fill-short-vs-long',",
    "  'kills secret-length-dependent mutex occupancy with an immediately queued control': 'queued-short-vs-long',",
    "  'kills a content-dependent reflection oracle with equal-length caller traffic': 'reflection-equal-length',",
    "  'kills match-dependent tripwire timing through composeSupervisedHost': 'tripwire-match-vs-no-match',",
    "  'kills match-dependent tripwire timing on a real supervised browser fill call': 'tripwire-real-click-match-vs-no-match',",
    "  'kills content-dependent request-listener work on the real supervised click path': 'real-listener-click',",
    "  'reports a path-specific 2us-per-call injected-bias control rejected by the family gate': 'tripwire-batched-injected-bias-control',",
    "  'reports the length-proportional fill-wrapper sensitivity floor': 'sensitivity-floor',",
    "};",
  ].join('\n');

export const PINNED_PROBE_NAMES_SOURCE = [
    "const PROBE_NAMES = [",
    "  'fill-short-vs-long',",
    "  'queued-short-vs-long',",
    "  'reflection-equal-length',",
    "  'tripwire-match-vs-no-match',",
    "  'tripwire-real-click-match-vs-no-match',",
    "  'real-listener-click',",
    "] as const;",
  ].join('\n');

export const PINNED_START_SIDECAR_SOURCE = "export async function startTimingSidecar(SIDECAR_PATH: string, startedAt: string): Promise<void> {\n  await mkdir('.vitest', { recursive: true });\n  await writeTimingSidecar(SIDECAR_PATH, { schema: 'timing-2-probes/1', complete: false, startedAt });\n}";

export const PINNED_FINISH_SIDECAR_SOURCE = "export async function finishTimingSidecar(\n  SIDECAR_PATH: string, startedAt: string, browser: { version(): string },\n  ledger: LedgerRow[], ledgerFailures: LedgerFailure[], probeResults: Map<string, ProbePResult>,\n  diagnosticResults: Map<string, DiagnosticResult>, sensitivityFloor: ReturnType<typeof composeFloor> | undefined,\n  timingFamily: () => FamilyVerdict,\n): Promise<void> {\n  try {\n    const chromium = browser.version();\n    const record = composeTimingSidecar({\n      startedAt, writtenAt: new Date().toISOString(), commit: await readTimingCommit(process.cwd()),\n      node: process.version, chromium, names: ENTRY_NAMES, titleToEntry: TASK_TITLE_TO_ENTRY,\n      ledger, ledgerFailures, probeResults,\n      diagnosticResults, floor: sensitivityFloor, family: timingFamily(),\n    });\n    await writeTimingSidecar(SIDECAR_PATH, record);\n  } catch (error) { await writeIncompleteTimingSidecar(SIDECAR_PATH, startedAt, error); }\n}";

export const PINNED_ROOT_HOOKS = [
  "beforeAll(async () => {\n  startedAt = new Date().toISOString();\n  await startTimingSidecar(SIDECAR_PATH, startedAt);\n  probeResults.clear();\n  browser = await launchChromium();\n  lab = await startControlsLab();\n});",
  "afterEach(async () => {\n  for (const host of activeHosts.splice(0)) host.abort();\n  await Promise.all(activeSessions.splice(0).map((sessions) => sessions.closeAll()));\n  vi.restoreAllMocks();\n});",
  "afterAll(async () => {\n  await lab?.close();\n  await browser?.close();\n});",
  "afterEach(({ task }) => {\n  try {\n    const sequence = ++ledgerSequence;\n    try { ledger.push({ task, sequence }); }\n    catch (error) {\n      const message = error instanceof Error ? error.message : String(error);\n      try { ledgerFailures.push({ task, sequence, message }); }\n      catch (failure) { console.error(failure); }\n      console.error(error);\n    }\n  } catch (error) { try { console.error(error); } catch {} }\n});",
  "afterAll(async () => { await finishTimingSidecar(SIDECAR_PATH, startedAt, browser, ledger, ledgerFailures, probeResults,\n  diagnosticResults, sensitivityFloor, timingFamily); });"
];
