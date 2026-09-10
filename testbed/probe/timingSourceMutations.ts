import { type TimingSourceMutation, SIDECAR_SOURCE, FIXTURE_SOURCE } from './timingSourceCompiler';
import {
  PINNED_ROOT_HOOKS, timingSourceLifecyclePins, timingSourceFamilyBody,
} from './timingSourceContracts';
import { timingFunctionText } from './timingSourcePins';

export function timingSourceMutations(source: string): TimingSourceMutation[] {
  const reporter = ['report', '('].join('');
  const family = ['assertProbeFamily', '(' + 'probe' + 'Results' + ','].join('');
  const diagnostic = "  it('tripwire-match-vs-no-match-aa', async () => {";
  const options = '{ alpha: 0.01, expected: PROBE_NAMES }';
  const mutations: TimingSourceMutation[] = [
    ['registrationsResolved', 'stub hook call omitted', source.replace('  await startTimingSidecar(SIDECAR_PATH, startedAt);', '')],
    ['registrationsResolved', 'sidecar hook registered first', source.replace(PINNED_ROOT_HOOKS[4]!, '')
      .replace(PINNED_ROOT_HOOKS[0]!, PINNED_ROOT_HOOKS[4]! + '\n' + PINNED_ROOT_HOOKS[0]!)],
    ['mapReferencesResolved', 'moved stub write omitted', { source, sidecarSource: SIDECAR_SOURCE.replace(
      "  await writeTimingSidecar(SIDECAR_PATH, { schema: 'timing-2-probes/1', complete: false, startedAt });", '') }],
    ['mapReferencesResolved', 'moved sidecar body changed', { source, sidecarSource: SIDECAR_SOURCE.replace(
      'floor: sensitivityFloor, family: timingFamily()', "floor: sensitivityFloor, family: { status: 'accept' }") }],

    ['nonmatch2', 'canary constructor removed', source.replace("flatCopy('TVC_timing_probe_7B32')", "'TVC_timing_probe_7B32'")],
    ['nonmatch2', 'nonmatch bare rotation', source.replace('flatCopy(rotateFinalCharacter(CANARY))', 'rotateFinalCharacter(CANARY)')],
    ['nonmatch2', 'flat copy identity', { source, fixtureSource: FIXTURE_SOURCE.replace('return String.fromCharCode(...Array.from(value, (character) => character.charCodeAt(0)));', 'return value;') }],
    ['helperCalls', 'batch reduced', source.replace('const TRIPWIRE_BATCH = 64;', 'const TRIPWIRE_BATCH = 1;')],

    ['reportCalls', 'twin reported as gated', source.replace(reporter + "'fill-short-vs-long'", reporter + "'tripwire-match-vs-no-match-aa'")],
    ['probeWrites', 'diagnostic writes gate map', source.replace(diagnostic, diagnostic + '\n    ' + ['probe' + 'Results', '.set(name, result);'].join(''))],
    ['gatedFamily', 'gate derives expected names', source.replace(family + ' ' + options, family + ' { alpha: 0.01, expected: [...map.keys()] }')],
    ['recomputedFamily', 'recompute derives expected names', source.replace('assertProbeFamily(new Map(' + 'probe' + 'Results' + '), ' + options,
      'assertProbeFamily(new Map(' + 'probe' + 'Results' + '), { alpha: 0.01, expected: [...map.keys()] }')],
    ['separateMaps', 'diagnostics merged into gate', source.replace(family, 'assertProbeFamily(new Map([...' + 'probe' + 'Results' + ', '
      + '...' + 'diagnostic' + 'Results' + ']),')],
    ['diagnosticNamesExcluded', 'twin inserted in family', source.replace('const PROBE_NAMES = [', "const PROBE_NAMES = [\n  'tripwire-match-vs-no-match-aa',")],
    ['probeNames', 'gated name removed', source.replace("  'fill-short-vs-long',", '')],
    ['entryNames', 'entry order swapped', { source, sidecarSource: SIDECAR_SOURCE.replace("const ENTRY_NAMES = [\n  'fill-short-vs-long',\n  'queued-short-vs-long',",
      "const ENTRY_NAMES = [\n  'queued-short-vs-long',\n  'fill-short-vs-long',") }],
    ['taskTitles', 'gated title changed', { source, sidecarSource: SIDECAR_SOURCE.replace("  'kills secret-length-dependent fill latency after asserting exact result equality':", "  'wrong title':") }],
    ['nonmatch2', 'bare rotation', source.replace(/^const NONMATCH2 = .*;$/mu,
      ['const NONMATCH2 = ', 'rotateFinalCharacter(NONMATCH);'].join(''))],
    ['diagnosticConstruction', 'sham arm B duplicates A', source.replace('await tripwireTimingProbe(NONMATCH, NONMATCH2);', 'await tripwireTimingProbe(NONMATCH, NONMATCH);')],
    ['realWrapper', 'extra promise hook layer', source.replace('.then(afterB),', '.then(() => afterB()),')],
    ['realWrapper', 'arm B loses hook', source.replace('.then(afterB),', '.then(NO_HOOK),')],
    ['helperCalls', 'second synthetic batch', source.replace('await runTripwireBatch(host);', 'await runTripwireBatch(host); await runTripwireBatch(host);')],
    ['finiteHelper', 'finite helper adds threshold', source.replace('function assertFiniteProbeStatistics(result: ProbePResult): void {',
      'function assertFiniteProbeStatistics(result: ProbePResult): void {\n  expect(result.pValue).toBeGreaterThan(0.01);')],
    ['recordingHelper', 'recording catch removed', source.replace(timingFunctionText(source, 'recordDiagnostic'),
      'function recordDiagnostic(name: string, result: ProbePResult): void {\n  recordDiagnosticOutcomes(name, result);\n}')],
    ['outcomesHelper', 'outcome catch removed', source.replace("try { assertProbeHardClause(result); } catch { hardClause = 'fail'; }", 'assertProbeHardClause(result);')],
  ];
  for (const statement of ['expect(result.pValue > 0.01).toBe(true);', 'assertAnotherStatistic(result);',
    "expect(result.hardClause).toBe('pass');", "expect(result.singleProbeFamily).toBe('accept');"]) {
    mutations.push(['diagnosticStatistics', statement, source.replace(diagnostic, diagnostic + '\n    ' + statement)
      + '\nfunction assertAnotherStatistic(result: ProbePResult) { expect(result.pValue).toBeGreaterThan(0.01); }']);
  }
  for (const token of ['assertProbeHardClause(result);', 'assertProbeFamily(new Map(), { expected: [] });', 'try {} catch {}']) {
    mutations.push(['helperBoundary', token, source.replace('async function tripwireTimingProbe(payloadA: string, payloadB: string): Promise<ProbePResult> {',
      'async function tripwireTimingProbe(payloadA: string, payloadB: string): Promise<ProbePResult> {\n  ' + token)]);
  }
  return [...mutations, ...timingConstructionMutations(source), ...timingHardeningMutations(source), ...timingSourceResolvedMutations(source)];
}

export function timingHardeningMutations(source: string): TimingSourceMutation[] {
  const diagnostic = "  it('tripwire-match-vs-no-match-aa', async () => {";
  const gateMap = 'probe' + 'Results';
  const diagnosticMap = 'diagnostic' + 'Results';
  const mutations: TimingSourceMutation[] = [];
  for (const statement of [
    '{ const expect = assertProbeHardClause; expect(result); }',
    'expect(result.p95BMs > result.p95AMs).toBe(true);',
    'expect(result.aSamplesMs[0] > result.bSamplesMs[0]).toBe(true);',
    '// expect(',
  ]) mutations.push(['diagnosticStatistics', statement, source.replace(diagnostic, diagnostic + '\n    ' + statement)]);
  mutations.push(['mapDeclarations', 'diagnostic map aliases the gated map through sharedResults', source.replace(
    'const ' + diagnosticMap + ' = new Map<string, DiagnosticResult>();',
    'const sharedResults = ' + gateMap + ';\nconst ' + diagnosticMap + ' = sharedResults as ' + 'unknown as Map<string, DiagnosticResult>;',
  )]);
  mutations.push(['mapReferences', 'helper aliases the gated map', source.replace(
    '  const match = vi.spyOn(', '  const gate = ' + gateMap + ';\n  const match = vi.spyOn(',
  )]);
  mutations.push(['mapDeclarations', 'gated map declaration changed', source.replace(
    'const ' + gateMap + ' = new Map<string, ProbePResult>();',
    'const ' + gateMap + ' = new Map<string, ProbePResult>([]);',
  )]);
  mutations.push(['mapReferences', 'helper aliases the diagnostic map', source.replace(
    '  const match = vi.spyOn(', '  const records = ' + diagnosticMap + ';\n  const match = vi.spyOn(',
  )]);
  mutations.push(['mapReferences', 'unlisted map reference without an assignment', source.replace(
    '  const match = vi.spyOn(', '  consume(' + gateMap + ');\n  const match = vi.spyOn(',
  )]);
  mutations.push(['unknownCastExemption', 'second unknown cast outside the exemption', source + '\nconst cast = {} as ' + 'unknown;\n']);
  const existingCast = "    result: { ok: true, filled: [timingLabel(payload)] } as " + "unknown as FillOutcome['result'],";
  mutations.push(['unknownCastExemption', 'existing exempt line changed', { source, fixtureSource: FIXTURE_SOURCE.replace(existingCast,
    existingCast.replace('timingLabel(payload)', "timingLabel(payload + '')")) }]);
  mutations.push(['unknownCastExemption', 'existing exempt line duplicated', source + '\n' + existingCast + '\n']);
  mutations.push(['unknownCastExemption', 'existing exempt line removed', { source, fixtureSource: FIXTURE_SOURCE.replace(existingCast, '') }]);
  mutations.push(['diagnosticTitles', 'seventh diagnostic has an unrecognized suffix', source.replace(diagnostic,
    "  it('tripwire-real-click-bias-2000us', async () => {\n"
    + '    const result = await realClickTripwireTimingProbe(NONMATCH, NONMATCH);\n'
    + '    expect(result.pValue).toBeLessThan(0.01);\n  }, 180_000);\n\n' + diagnostic)]);
  mutations.push(['diagnosticTitles', 'seventh diagnostic is inline', source.replace(diagnostic,
    "  void 0; it('another diagnostic', async () => {});\n" + diagnostic)]);
  mutations.push(['diagnosticTitles', 'duplicate diagnostic title', source.replace(diagnostic,
    "  it('tripwire-match-vs-no-match-aa', async () => {});\n" + diagnostic)]);
  for (const [helper, pin] of [['tripwireTimingProbe', 'syntheticHelperSource'],
    ['realClickTripwireTimingProbe', 'realClickHelperSource']] as const) {
    for (const statement of ['if (payloadA === payloadB) expect(result.pValue).toBeGreaterThan(0.01);',
      'const gate = ' + gateMap + "; gate.set('tripwire-match-vs-no-match', result);"]) {
      const body = timingFunctionText(source, helper);
      mutations.push([pin, helper + ': ' + statement, source.replace(body,
        body.replace('  return result;', '  ' + statement + '\n  return result;'))]);
    }
  }
  for (const args of ['NONMATCH, NONMATCH', 'CANARY, NONMATCH2', 'NONMATCH, CANARY']) {
    mutations.push(['gatedSynthetic', 'synthetic gated arms: ' + args, source.replace(
      '    const result = await tripwireTimingProbe(CANARY, NONMATCH);',
      '    const result = await tripwireTimingProbe(' + args + ');',
    )]);
  }
  mutations.push(['taskTitles', 'actual gated it title renamed', source.replace(
    "  it('kills secret-length-dependent fill latency after asserting exact result equality',",
    "  it('renamed gated probe',",
  )]);
  const floor = timingFunctionText(source, 'recordSensitivityFloor');
  mutations.push(['floorRecording', 'floor recording catch removed', source.replace(floor,
    floor.replace('  try {\n', '').replace('  } catch (error) { try { console.error(error); } catch {} }\n', ''))]);
  mutations.push(['floorRecording', 'floor recording call omitted', source.replace(
    '      recordSensitivityFloor(microseconds, result, rejected.includes(microseconds));', '',
  )]);
  const ledgerHook = source.match(/^afterEach\(\(\{ task \}\) => \{[\s\S]*?^\}\);/mu)?.[0] ?? '';
  mutations.push(['ledgerRecording', 'ledger outer catch removed', source.replace(ledgerHook,
    ledgerHook.replace('  try {\n', '').replace('  } catch (error) { try { console.error(error); } catch {} }\n', ''))]);
  mutations.push(['ledgerRecording', 'ledger console outside guard', source.replace(ledgerHook,
    ledgerHook.replace('\n});', '\n  console.error("unguarded");\n});'))]);
  return mutations;
}

export function timingSourceResolvedMutations(source: string): [string, string, string][] {
  // The first four additions are verbatim witnesses from the round-2 review.
  const end = '\n});\n\n\nfunction timingFamily';
  const callback = 'async () => {\n    const result = await tripwireTimingProbe(CANARY, CANARY);\n'
    + '    expect(result.pValue).toBeGreaterThan(0.01);\n  }, 180_000';
  const tick = String.fromCharCode(96);
  const diagnostic = "  it('tripwire-match-vs-no-match-aa', async () => {";
  const gateMap = 'probe' + 'Results'; const diagnosticMap = 'diagnostic' + 'Results';
  const declaration = 'const ' + gateMap + ' = new Map<string, ProbePResult>();';
  const slash = String.fromCharCode(92);
  const aliasPair = '\nconst gateAlias = pr' + slash + 'u006fbeResults;\n'
    + 'const diagnosticAlias = diagn' + slash + 'u006fsticResults;\n'
    + 'const originalDiagnosticSet = diagnosticAlias.set.bind(diagnosticAlias);\n'
    + 'diagnosticAlias.set = (key, value) => { gateAlias.set(key, value.result); return originalDiagnosticSet(key, value); };';
  const mutations: [string, string, string][] = [
    ['registrationsResolved', 'round-2 aliased it', source.replace(end,
      "\n  const hiddenIt = it;\n  hiddenIt('stealth alias diagnostic', " + callback + ');' + end)],
    ['registrationsResolved', 'round-2 template alias title', source.replace(end,
      '\n  const hiddenTemplateIt = it;\n  hiddenTemplateIt(' + tick + 'stealth template diagnostic' + tick + ', ' + callback + ');' + end)],
    ['registrationsResolved', 'round-2 computed member', source.replace(end,
      "\n  const hiddenComputedIt = { test: it }['test'];\n  hiddenComputedIt('stealth computed diagnostic', " + callback + ');' + end)],
    ['registrationsResolved', 'round-2 second describe', source
      + "\ndescribe('H Probe P timing bounds', () => {\n  it('stealth second-block diagnostic', "
      + callback.replaceAll('\n  ', '\n') + ');\n});\n'],
    ['registrationsResolved', 'test registration', source.replace('describe, expect, it, vi', 'describe, expect, it, test, vi')
      .replace(end, "\n  test('stealth test diagnostic', " + callback + ');' + end)],
    ['registrationsResolved', 'it.each registration', source.replace(end,
      "\n  it.each([1])('stealth each diagnostic', " + callback + ');' + end)],
    ['registrationsResolved', 'Function in twin body', source.replace(diagnostic,
      diagnostic + "\n    new Function('return 1')();")],
    ['mapReferencesResolved', 'round-2 unicode-escaped alias pair', source.replace(declaration, declaration + aliasPair)],
    ['mapReferencesResolved', 'destructured diagnostic set', source.replace(diagnostic,
      diagnostic + '\n    const { set } = ' + diagnosticMap + ';')],
    ['mapReferencesResolved', 'computed diagnostic set', source.replace(diagnostic,
      diagnostic + '\n    ' + diagnosticMap + "['set'];")],
    ['mapReferencesResolved', 'Reflect.get gated set', source.replace(diagnostic,
      diagnostic + '\n    Reflect.get(' + gateMap + ", 'set');")],
  ];
  for (const [name, statement] of [
    ['direct template title', "it(`stealth template diagnostic`, async () => {});"],
    ['different second describe', "describe.sequential('different suite', () => {});"],
    ['nested describe', "describe.sequential('H Probe P timing bounds', () => {});"],
    ['shorthand it alias', 'const registration = { it };'],
    ['unicode it alias', 'const registration = ' + 'i' + slash + 'u0074;'],
    ['nested hook', 'afterAll(() => {});'],
    ...['concurrent', 'only', 'skip', 'todo', 'sequential'].map((member) => [
      'it.' + member, "it." + member + "('stealth member diagnostic', async () => {});",
    ]),
  ]) mutations.push(['registrationsResolved', name!, source.replace(diagnostic, diagnostic + '\n    ' + statement)]);
  for (const [name, statement] of [
    ['eval in helper', "eval('1');"],
    ['escaped Function in helper', 'new ' + 'F' + slash + "u0075nction('return 1')();"],
    ['Reflect in helper', "Reflect.get({}, 'value');"],
    ['Proxy in helper', 'new Proxy({}, {});'],
    ['global computed Function', "globalThis['Function']('return 1')();"],
  ]) mutations.push(['registrationsResolved', name!, source.replace(
    'async function timedFillHarness() {', 'async function timedFillHarness() {\n  ' + statement,
  )]);
  for (const [name, statement] of [
    ['shorthand gated map alias', 'const carried = { ' + gateMap + ' };'],
    ['destructured gated set', 'const { set } = ' + gateMap + ';'],
    ['computed gated set', gateMap + "['set'];"],
    ['unlisted gated property', gateMap + '.size;'],
    ['gated clear moved into diagnostic', gateMap + '.clear();'],
    ['diagnostic set moved into helper', diagnosticMap + '.set(name, result);'],
    ['map alias through another binding', 'const first = ' + gateMap + '; const second = first;'],
  ]) mutations.push(['mapReferencesResolved', name!, source.replace(diagnostic, diagnostic + '\n    ' + statement)]);
  mutations.push(['registrationsResolved', 'vitest import alias', source.replace('expect, it, vi', 'expect, it as hiddenIt, vi')]);
  mutations.push(['registrationsResolved', 'dynamic vitest import', source.replace(diagnostic,
    diagnostic + "\n    const registrations = await import('vitest');")]);
  const lifecycle = "describe.sequential('M6 S4 lifecycle timing bounds', () => {";
  const lifecyclePins = timingSourceLifecyclePins();
  mutations.push(['registrationsResolved', 'second lifecycle it.each', source.replace(lifecyclePins.each,
    lifecyclePins.each + '\n\n  ' + lifecyclePins.each)]);
  mutations.push(['registrationsResolved', 'lifecycle each copied into H', source.replace(diagnostic,
    '  ' + lifecyclePins.each + '\n' + diagnostic)]);
  mutations.push(['registrationsResolved', 'lifecycle each moved within suite', source.replace(lifecycle,
    lifecycle + '\n  void 0;')]);
  mutations.push(['registrationsResolved', 'lifecycle hook duplicated', source.replace(lifecyclePins.hook,
    lifecyclePins.hook + '\n  ' + lifecyclePins.hook)]);
  mutations.push(['registrationsResolved', 'lifecycle hook copied into H', source.replace(diagnostic,
    '  ' + lifecyclePins.hook + '\n' + diagnostic)]);
  mutations.push(['registrationsResolved', 'root afterEach duplicated', source.replace(lifecyclePins.rootHooks[0]!,
    lifecyclePins.rootHooks[0] + '\n' + lifecyclePins.rootHooks[0])]);
  mutations.push(['registrationsResolved', 'new root afterEach', source + '\nafterEach(() => {});\n']);
  for (const statement of ["it.each([1])('new lifecycle each', () => {});",
    "test('new lifecycle test', () => {});", "const hiddenIt = it; hiddenIt('new lifecycle alias', () => {});"]) {
    const imported = statement.startsWith('test(') ? source.replace('describe, expect, it, vi', 'describe, expect, it, test, vi') : source;
    mutations.push(['registrationsResolved', statement, imported
      .replace(lifecyclePins.each, lifecyclePins.each + '\n  ' + statement)]);
  }
  const biasedCopy = 'const biased = new Map(' + gateMap + ');';
  for (const [location, anchor] of [
    ['diagnostic', diagnostic],
    ['source-pin test', "  it('pins same-constructor timing payloads against the bare-rotation mutant', async () => {"],
    ['other gated test', "  it('kills secret-length-dependent fill latency after asserting exact result equality', async () => {"],
    ['lifecycle suite', lifecycle],
    ['beforeAll', 'beforeAll(async () => {'],
    ['helper', 'async function timedFillHarness() {'],
    ['reporter', 'function ' + 'report' + '(name: string, result: ProbePResult): void {'],
    ['family recorder', 'function timingFamily(): FamilyVerdict {'],
  ]) mutations.push(['mapReferencesResolved', 'biased copy in ' + location, source.replace(anchor!, anchor + '\n    ' + biasedCopy)]);
  mutations.push(['mapReferencesResolved', 'biased copy at module scope', source + '\n' + biasedCopy + '\n']);
  const familyBody = timingSourceFamilyBody();
  for (const [name, changedBody] of [
    ['biased copy duplicated in family', familyBody.replace(biasedCopy, biasedCopy + '\n    { ' + biasedCopy + ' }')],
    ['biased copy removed from family', familyBody.replace('    ' + biasedCopy + '\n', '')],
    ['biased copy moved before direct gate', familyBody.replace('    ' + biasedCopy + '\n', '').replace('{\n', '{\n    ' + biasedCopy + '\n')],
    ['family bias changed', familyBody.replace('pValue: 0', 'pValue: 1')],
    ['family rejection assertion removed', familyBody.replace(
      '    expect(() => assertProbeFamily(biased, { alpha: 0.01, expected: PROBE_NAMES }))\n'
        + '      .toThrow(`Probe P family rejected: ${name}`);\n', '')],
    ['family statement added', familyBody.replace('{\n', '{\n    void 0;\n')],
    ['family comment changed', familyBody.replace('Called directly', 'Invoked directly')],
  ]) mutations.push(['mapReferencesResolved', name!, source.replace(familyBody, changedBody!)]);
  return mutations;
}

export function timingConstructionMutations(source: string): [string, string, string][] {
  return [
    ['helperSampling', '499 pairs', source.replace('pairs: 500, warmup: 20,', 'pairs: 499, warmup: 20,')],
    ['helperSampling', '19 warmups', source.replace('pairs: 500, warmup: 20,', 'pairs: 500, warmup: 19,')],
    ['gatedRealClick', 'gated caller adds bias', source.replace('await realClickTripwireTimingProbe(CANARY, NONMATCH);',
      'await realClickTripwireTimingProbe(CANARY, NONMATCH, { afterB: () => spinForMicroseconds(2) });')],
    ['syntheticRecording', 'synthetic raw recording omitted', source.replace('    recordDiagnostic(name, result, rejection);', '')],
    ['diagnosticStatistics', 'diagnostic recording omitted', source.replace('    recordDiagnostic(name, result);', '')],
    ['diagnosticStatistics', 'structural check omitted', source.replace('    assertFiniteProbeStatistics(result);', '')],
    ['diagnosticStatistics', 'entry check omitted', source.replace('    expect(' + 'diagnostic' + 'Results' + '.has(name)).toBe(true);', '')],
    ['diagnosticStatistics', 'title and recording name differ', source.replace("    const name = 'tripwire-match-vs-no-match-aa';", "    const name = 'wrong-entry';")],
    ['diagnosticConstruction', 'sham uses empty transform set', source.replace('new Set(SECRET_TRANSFORM_NAMES)', 'new Set([])')],
  ];
}
