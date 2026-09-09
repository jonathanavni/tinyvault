import {
  FIXTURE_SOURCE, timingSourceProbeSection, timingSourceTestCases, SIDECAR_SOURCE, timingSourceTitles,
} from './timingSourceCompiler';
import {
  PINNED_ENTRY_NAMES_SOURCE, timingSourceNonDiagnosticTitles, PINNED_TASK_TITLES_SOURCE,
  PINNED_PROBE_NAMES_SOURCE,
} from './timingSourceContracts';
import { isFlatCopyBody, flatCopy } from '../../src/supervisor/host.timing.fixtures';

export function timingFunctionText(source: string, name: string): string {
  return source.match(new RegExp('^(?:export )?(?:async )?function ' + name + '\\([\\s\\S]*?^\\}', 'mu'))?.[0] ?? '';
}

export function timingConstantText(source: string, name: string, ending: string): string {
  return source.match(new RegExp('^const ' + name + '[\\s\\S]*?^' + ending, 'mu'))?.[0] ?? '';
}

export function pinsProbeIsolation(source: string): Record<string, boolean> {
  const reporter = ['report', '('].join('');
  const calls = source.split('\n').map((line) => line.trim()).filter((line) => line.startsWith(reporter));
  const names = timingConstantText(source, 'PROBE_NAMES', '\\] as const;');
  const write = ['probe' + 'Results', '.set('].join('');
  const family = ['assertProbeFamily', '(' + 'probe' + 'Results' + ','].join('');
  const options = '{ alpha: 0.01, expected: PROBE_NAMES }';
  const diagnosticMap = ['diagnostic', 'Results'].join('');
  return {
    reportCalls: source.split(reporter).length - 1 === 7 && calls.length === 6
      && calls.every((line) => {
        const name = line.match(new RegExp("^report" + "\\('([^']+)', result\\);$", 'u'))?.[1];
        return name !== undefined && names.includes(`'${name}'`);
      }),
    probeWrites: source.split(write).length - 1 === 1
      && timingFunctionText(source, 'report').includes(write),
    gatedFamily: source.split(family).length - 1 === 1
      && source.split('\n').some((line) => line.trim() === family + ' ' + options + ');'),
    recomputedFamily: source.split('\n').some((line) => line.trim()
      === 'assertProbeFamily(new Map(' + 'probe' + 'Results' + '), ' + options + ');'),
    separateMaps: source.split('\n').every((line) => !line.includes(diagnosticMap)
      || !new RegExp('assertProbeFamily|' + 'probe' + 'Results', 'u').test(line)),
    diagnosticNamesExcluded: !/-(?:aa|sham|250us|1000us)'/u.test(names),
  };
}

export function pinsMapReferences(source: string, fixtureSource = FIXTURE_SOURCE): Record<string, boolean> {
  const gateMap = 'probe' + 'Results';
  const diagnosticMap = 'diagnostic' + 'Results';
  const declarations = [
    'const ' + gateMap + ' = new Map<string, ProbePResult>();',
    'const ' + diagnosticMap + ' = new Map<string, DiagnosticResult>();',
  ];
  const sourceLines = source.split('\n');
  const lines = sourceLines.map((line) => line.trim());
  // User-authorized exemption: the pre-existing measurement helper remains byte-identical.
  const existingCast = "    result: { ok: true, filled: [timingLabel(payload)] } as " + "unknown as FillOutcome['result'],";
  const allowed = new Set([
    ...declarations,
    gateMap + '.clear();',
    gateMap + '.set(name, result);',
    'assertProbeFamily(' + gateMap + ', { alpha: 0.01, expected: PROBE_NAMES });',
    'const biased = new Map(' + gateMap + ');',
    'assertProbeFamily(new Map(' + gateMap + '), { alpha: 0.01, expected: PROBE_NAMES });',
    diagnosticMap + '.set(name, { result, hardClause, singleProbeFamily });',
    diagnosticMap + '.set(name, { ...' + diagnosticMap + ".get(name)!, singleProbeFamily: rejection ? 'reject' : 'accept' });",
    'expect(' + diagnosticMap + '.has(name)).toBe(true);',
    'afterAll(async () => { await finishTimingSidecar(SIDECAR_PATH, startedAt, browser, ledger, ledgerFailures, ' + gateMap + ',',
    diagnosticMap + ', sensitivityFloor, timingFamily); });',
  ]);
  const identifiers = new RegExp('\\b(?:' + gateMap + '|' + diagnosticMap + ')\\b', 'u');
  const alias = new RegExp('=\\s*(?:' + gateMap + '|' + diagnosticMap + ')\\b', 'u');
  return {
    mapDeclarations: declarations.every((declaration) => sourceLines.filter((line) => line === declaration).length === 1),
    mapReferences: lines.every((line) => !identifiers.test(line) || allowed.has(line))
      && lines.every((line) => !alias.test(line) || declarations.includes(line)),
    unknownCastExemption: [...sourceLines, ...fixtureSource.split('\n')].filter((line) => line.includes('as ' + 'unknown')).length === 1
      && timingFunctionText(fixtureSource, 'timingFillOutcome').split('\n').includes(existingCast),
  };
}

export function pinsTripwireHelpers(source: string): Record<string, boolean> {
  const synthetic = timingFunctionText(source, 'tripwireTimingProbe');
  const real = timingFunctionText(source, 'realClickTripwireTimingProbe');
  return {
    helperBoundary: [synthetic, real].every((body) => body.length > 0
      && !/\b(?:assertProbeHardClause|assertProbeFamily|catch|gated|throw)\b/u.test(body)),
    realWrapper: real.includes('a: () => hostA.tools.fill_from_vault(request).then(afterA),')
      && real.includes('b: () => hostB.tools.fill_from_vault(request).then(afterB),')
      && real.includes('{ afterA = NO_HOOK, afterB = NO_HOOK }')
      && /^const NO_HOOK = \(\) => undefined;$/mu.test(source)
      && !/then\(\(\) =>/u.test(real),
    helperCalls: synthetic.split('runTripwireBatch(').length - 1 === 1
      && real.split('fill_from_vault(').length - 1 === 2 && !real.includes('spyOn')
      && !/afterA|afterB|afterCall/u.test(synthetic),
    helperSampling: [synthetic, real].every((body) => body.includes('pairs: 500, warmup: 20,')),
    gatedRealClick: pinsGatedTripwireCaller(source, 'realClickTripwireTimingProbe',
      'kills match-dependent tripwire timing on a real supervised browser fill call'),
    gatedSynthetic: pinsGatedTripwireCaller(source, 'tripwireTimingProbe',
      'kills match-dependent tripwire timing through composeSupervisedHost'),
    nonmatch2: /^const NONMATCH2 = flatCopy\(rotateFinalCharacter\(NONMATCH\)\);$/mu.test(source)
      && !/const\s+NONMATCH2\s*=\s*rotateFinalCharacter\(NONMATCH\)/u.test(source),
  };
}

export function pinsGatedTripwireCaller(source: string, helper: string, title: string): boolean {
  const section = timingSourceProbeSection(source);
  const body = timingSourceTestCases(section).find((test) => test.title === title)?.body ?? '';
  return body.split('\n').includes('    const result = await ' + helper + '(CANARY, NONMATCH);');
}

export function pinsEntryNames(source: string): boolean {
  return timingConstantText(source, "ENTRY_NAMES", "\\] as const;") === PINNED_ENTRY_NAMES_SOURCE;
}

export function pinsTaskTitles(source: string, sidecarSource = SIDECAR_SOURCE): boolean {
  const entries = [...timingConstantText(sidecarSource, 'TASK_TITLE_TO_ENTRY', '\\};')
    .matchAll(/^  '([^']+)': '([^']+)',$/gmu)].map(([, title, name]) => [title!, name!] as const);
  const names = [...timingConstantText(sidecarSource, 'ENTRY_NAMES', '\\] as const;')
    .matchAll(/^  '([^']+)',$/gmu)].map(([, name]) => name!);
  const titles = timingSourceTitles(source);
  const expected = timingSourceNonDiagnosticTitles().filter((title) => title.startsWith('kills ') || title.startsWith('reports '));
  return entries.length === 8 && expected.length === 8
    && entries.every(([title, name]) => expected.includes(title) && names.includes(name)
      && titles.filter((actual) => actual === title).length === 1)
    && expected.every((title) => entries.some(([key]) => key === title))
    && timingConstantText(sidecarSource, "TASK_TITLE_TO_ENTRY", "\\};") === PINNED_TASK_TITLES_SOURCE;
}

export function pinsProbeNames(source: string): boolean {
  return timingConstantText(source, "PROBE_NAMES", "\\] as const;") === PINNED_PROBE_NAMES_SOURCE;
}

export function pinsAssertFiniteProbeStatistics(source: string): boolean {
  return timingFunctionText(source, "assertFiniteProbeStatistics") === [
    "function assertFiniteProbeStatistics(result: ProbePResult): void {",
    "  for (const value of [result.pValue, result.z, result.effectSize, result.medianDiffMs, result.p95AMs, result.p95BMs]) {",
    "    expect(Number.isFinite(value)).toBe(true);",
    "  }",
    "  for (const samples of [result.aSamplesMs, result.bSamplesMs, result.differencesMs]) {",
    "    expect(samples.length === 500).toBe(true);",
    "    expect(samples.every(Number.isFinite)).toBe(true);",
    "  }",
    "}",
  ].join('\n');
}

export function pinsRecordDiagnosticOutcomes(source: string): boolean {
  return timingFunctionText(source, "recordDiagnosticOutcomes") === [
    "function recordDiagnosticOutcomes(name: string, result: ProbePResult): void {",
    "  let hardClause: 'pass' | 'fail' = 'pass';",
    "  let singleProbeFamily: 'accept' | 'reject' = 'accept';",
    "  try { assertProbeHardClause(result); } catch { hardClause = 'fail'; }",
    "  try {",
    "    assertProbeFamily(new Map([[name, result]]), { alpha: 0.01, expected: [name] });",
    "  } catch { singleProbeFamily = 'reject'; }",
    "  " + "diagnostic" + "Results" + ".set(name, { result, hardClause, singleProbeFamily });",
    "}",
  ].join('\n');
}

export function pinsRecordDiagnostic(source: string): boolean {
  return timingFunctionText(source, "recordDiagnostic") === [
    "function recordDiagnostic(name: string, result: ProbePResult, rejection?: string): void {",
    "  try {",
    "    recordDiagnosticOutcomes(name, result);",
    "    if (rejection !== undefined) {",
    "      " + "diagnostic" + "Results" + ".set(name, { ..." + "diagnostic" + "Results" + ".get(name)!, singleProbeFamily: rejection ? 'reject' : 'accept' });",
    "    }",
    "  } catch (error) { console.error(error); }",
    "}",
  ].join('\n');
}

export function pinsSyntheticHelperSource(source: string): boolean {
  return timingFunctionText(source, "tripwireTimingProbe") === [
    "async function tripwireTimingProbe(payloadA: string, payloadB: string): Promise<ProbePResult> {",
    "  const match = vi.spyOn(secretMatcher, 'firstMatchingSecretTransform');",
    "  const mint = vi.spyOn(TripwireRun.prototype, 'mint');",
    "  const adjudicate = vi.spyOn(TripwireRun.prototype, 'adjudicate');",
    "  const timedCallDeltas: number[][] = [];",
    "  let hostA!: SupervisedHost; let hostB!: SupervisedHost;",
    "  let currentHost: SupervisedHost | undefined;",
    "  const bytesA = JSON.stringify(timingVaultResult(payloadA));",
    "  const bytesB = JSON.stringify(timingVaultResult(payloadB));",
    "  expect(bytesA.length).toBe(bytesB.length);",
    "  expect(payloadB).toHaveLength(payloadA.length);",
    "  expect(characterClassShape(payloadB)).toBe(characterClassShape(payloadA));",
    "  const setupHost = (payload: string) => {",
    "    currentHost?.drainEvidence(); currentHost?.finish();",
    "    const service = timingService(payload);",
    "    currentHost = composeSupervisedHost({",
    "      fillService: service,",
    "      sessions: new TimingSessions(),",
    "      lease: new EvidenceLease(CANARY),",
    "    });",
    "    activeHosts.push(currentHost);",
    "    return currentHost;",
    "  };",
    "  const timedToolCall = async (host: SupervisedHost) => {",
    "    const before = [match.mock.calls.length, mint.mock.calls.length, adjudicate.mock.calls.length];",
    "    await runTripwireBatch(host);",
    "    timedCallDeltas.push([",
    "      match.mock.calls.length - before[0]!,",
    "      mint.mock.calls.length - before[1]!,",
    "      adjudicate.mock.calls.length - before[2]!,",
    "    ]);",
    "  };",
    "  const result = await runProbeP({",
    "    pairs: 500, warmup: 20,",
    "    setupA: () => { hostA = setupHost(payloadA); },",
    "    setupB: () => { hostB = setupHost(payloadB); },",
    "    a: () => timedToolCall(hostA),",
    "    b: () => timedToolCall(hostB),",
    "  });",
    "  currentHost?.drainEvidence(); currentHost?.finish();",
    "  expect(timedCallDeltas.length).toBeGreaterThan(0);",
    "  expect(timedCallDeltas.every((delta) => delta.every((calls) => calls === 0))).toBe(true);",
    "  return result;",
    "}",
  ].join('\n');
}

export function pinsRealClickHelperSource(source: string): boolean {
  return timingFunctionText(source, "realClickTripwireTimingProbe") === [
    "async function realClickTripwireTimingProbe(",
    "  payloadA: string, payloadB: string,",
    "  { afterA = NO_HOOK, afterB = NO_HOOK }: { afterA?: () => void; afterB?: () => void } = {},",
    "): Promise<ProbePResult> {",
    "  const domain = createLockdownDomain();",
    "  const sessions = createBrowserSessionHost({ newContext: () => browser.newContext(), ...domain });",
    "  activeSessions.push(sessions);",
    "  const controls = createBrowserControls(sessions);",
    "  const session = await controls.browser_open_session();",
    "  expect(await controls.browser_navigate({",
    "    sessionId: session.sessionId, url: `${lab.primaryOrigin}/controls`,",
    "  })).toEqual({ ok: true });",
    "  let hostA!: SupervisedHost; let hostB!: SupervisedHost;",
    "  let currentHost: SupervisedHost | undefined;",
    "  const hostsToFinish: SupervisedHost[] = [];",
    "  const resultA = JSON.stringify(timingFillOutcome(payloadA).result);",
    "  const resultB = JSON.stringify(timingFillOutcome(payloadB).result);",
    "  expect(resultA.length).toBe(resultB.length);",
    "  expect(payloadB).toHaveLength(payloadA.length);",
    "  expect(characterClassShape(payloadB)).toBe(characterClassShape(payloadA));",
    "  const setupHost = (payload: string) => {",
    "    // A/B arms remain symmetric: both finalize after the shared live producer closes, outside measurement.",
    "    currentHost = composeSupervisedHost({",
    "      fillService: browserClickTimingService(controls, session.sessionId, payload),",
    "      sessions,",
    "      lease: new EvidenceLease(CANARY),",
    "    });",
    "    activeHosts.push(currentHost);",
    "    hostsToFinish.push(currentHost);",
    "    return currentHost;",
    "  };",
    "  const request = {",
    "    handle: 'vh_timing', sessionId: session.sessionId,",
    "    fields: [{ role: 'password' as const, selector: '#password' }],",
    "  };",
    "  const result = await runProbeP({",
    "    pairs: 500, warmup: 20,",
    "    setupA: () => { hostA = setupHost(payloadA); },",
    "    setupB: () => { hostB = setupHost(payloadB); },",
    "    a: () => hostA.tools.fill_from_vault(request).then(afterA),",
    "    b: () => hostB.tools.fill_from_vault(request).then(afterB),",
    "  });",
    "  await sessions.closeAll();",
    "  for (const pending of hostsToFinish) {",
    "    await pending.settleEvidence(); pending.drainEvidence(); pending.finish();",
    "  }",
    "  return result;",
    "}",
  ].join('\n');
}

export function pinsFloorRecording(source: string): boolean {
  return timingFunctionText(source, "recordSensitivityFloor") === [
    "function recordSensitivityFloor(microseconds: number, result: ProbePResult, rejected: boolean): void {",
    "  try {",
    "    floorResults.push({ microseconds, pValue: result.pValue, medianDiffMs: result.medianDiffMs,",
    "      singleProbeFamily: rejected ? 'reject' : 'accept' });",
    "    sensitivityFloor = composeFloor(floorResults);",
    "  } catch (error) { try { console.error(error); } catch {} }",
    "}",
  ].join('\n')
    && source.split('\n').filter((line) => line === '      recordSensitivityFloor(microseconds, result, rejected.includes(microseconds));').length === 1;
}

export function pinsLedgerRecording(source: string): boolean {
  return source.match(/^afterEach\(\(\{ task \}\) => \{[\s\S]*?^\}\);/mu)?.[0] === [
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
  ].join('\n');
}

export function pinsSyntheticRecording(source: string): boolean {
  const body = source.match(/^  it\('reports a path-specific[\s\S]*?^  \}, 180_000\);/mu)?.[0] ?? '';
  return body.includes(['    }', '    recordDiagnostic(name, result, rejection);',
    '    console.info(`${name}: p=${result.pValue} aggregateBiasUs=${2 * TRIPWIRE_BATCH} rejected=${rejection}`);',
    '    expect(rejection).toBe(`Probe P family rejected: ${name} (p=${result.pValue} <= 0.01 at rank 1 of 1)`);',
  ].join('\n'));
}

export function pinsPayloadConstruction(source: string, fixtureSource = FIXTURE_SOURCE): boolean {
  const body = timingFunctionText(fixtureSource, 'flatCopy');
  const sliced = 'x' + 'TVC_timing_probe_7B32'.slice(1);
  return source.includes("const CANARY = flatCopy('TVC_timing_probe_7B32');")
    && source.includes('const NONMATCH = flatCopy(rotateFinalCharacter(CANARY));')
    && !/const\s+NONMATCH\s*=\s*rotateFinalCharacter\(CANARY\)/u.test(source)
    && isFlatCopyBody(flatCopy.toString()) && flatCopy(sliced) === sliced
    && !isFlatCopyBody('function flatCopy(value) { return value; }')
    && body.includes('String.fromCharCode(...Array.from(') && !body.includes('return value;');
}

export function hasPinnedTripwireBatch(source: string): boolean {
  // Anchored to a whole line: the quoted mutant text inside this file must not satisfy the pin.
  return /^const TRIPWIRE_BATCH = 64;$/mu.test(source)
    && source.includes('index < TRIPWIRE_BATCH; index += 1');
}

export function hasDirectFamilyGate(source: string): boolean {
  const direct = ['assertProbeFamily', '(' + 'probe' + 'Results' + ', { alpha: 0.01, expected: PROBE_NAMES })', ';'].join('');
  return source.split('\n').some((line) => line.trim() === direct);
}

export function hasWrappedFamilyGate(source: string): boolean {
  return source.includes(['expect(() => assertProbeFamily', '(' + 'probe' + 'Results'].join(''));
}

export {
  TIMING_SOURCE_PATH, SIDECAR_SOURCE, FIXTURE_SOURCE, type TimingSourceInput, type TimingSourceMutation,
  programDurations, semanticDurations, timingSourceCompiler, timingSourceChecks, pinsTimingImports,
  timingSourceProbeSection, timingSourceTestCases, timingSourceTitles,
} from './timingSourceCompiler';

export {
  timingSourceResolve, pinsResolvedMapReferences, pinsDiagnosticTitles, timingDiagnosticBodies,
  pinsDiagnosticStatistics, pinsDiagnosticConstruction,
} from './timingSourceResolve';

export {
  timingSourceLifecyclePins, timingSourceFamilyBody, timingSourceNonDiagnosticTitles,
  timingSourceDiagnosticTitles, PINNED_TIMING_IMPORTS, PINNED_ENTRY_NAMES_SOURCE, PINNED_TASK_TITLES_SOURCE,
  PINNED_PROBE_NAMES_SOURCE, PINNED_START_SIDECAR_SOURCE, PINNED_FINISH_SIDECAR_SOURCE, PINNED_ROOT_HOOKS,
} from './timingSourceContracts';

export {
  timingSourceMutations, timingHardeningMutations, timingSourceResolvedMutations,
  timingConstructionMutations,
} from './timingSourceMutations';
