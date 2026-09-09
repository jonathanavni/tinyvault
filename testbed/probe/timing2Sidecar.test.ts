import { promises as fs, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { assertProbeFamily, assertProbeHardClause, wilcoxonSignedRank, type ProbePResult } from './probeP';
import { classifyFamilyError, composeFloor, composeTimingSidecar, readTimingCommit, writeTimingSidecar,
  type DiagnosticResult, type FloorResult, type LedgerRow, type LedgerFailure, type TimingTask } from './timing2Sidecar';

const SOURCE = readFileSync(new URL('../../src/supervisor/host.timing.browser.test.ts', import.meta.url), 'utf8');
const NAMES = [
  'fill-short-vs-long', 'queued-short-vs-long', 'reflection-equal-length', 'tripwire-match-vs-no-match',
  'tripwire-real-click-match-vs-no-match', 'real-listener-click', 'tripwire-batched-injected-bias-control',
  'sensitivity-floor', 'tripwire-match-vs-no-match-aa', 'tripwire-match-vs-no-match-sham',
  'tripwire-real-click-match-vs-no-match-aa', 'tripwire-real-click-match-vs-no-match-sham',
  'tripwire-real-click-bias-250us', 'tripwire-real-click-bias-1000us',
];
const START = '2026-09-09T12:00:00.000Z';
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

function result(overrides: Partial<ProbePResult> = {}): ProbePResult {
  return { pValue: 1, z: 0, effectSize: 0, medianDiffMs: 0, p95AMs: 1, p95BMs: 1,
    differencesMs: Array(500).fill(0), aSamplesMs: Array(500).fill(1), bSamplesMs: Array(500).fill(1), ...overrides };
}

function task(name: string, state = 'pass'): TimingTask {
  return { name, result: { state, startTime: Date.parse(START) + 20, duration: 10 } };
}

function input() {
  return { startedAt: START, writtenAt: '2026-09-09T12:00:01.000Z', commit: null, node: 'v24.fixture',
    chromium: 'fixture-chromium', names: NAMES, titleToEntry: { 'gated title': NAMES[0]! },
    ledger: [] as LedgerRow[], ledgerFailures: [] as LedgerFailure[],
    probeResults: new Map<string, ProbePResult>(), diagnosticResults: new Map<string, DiagnosticResult>(),
    family: { status: 'accept' as const } };
}

function fixtureInput() {
  const data = input();
  data.ledger.push({ task: task('source pins'), sequence: 1 });
  NAMES.forEach((name, index) => {
    const sequence = index < 6 ? index + 2 : index + 3;
    data.ledger.push({ task: task(name), sequence });
    if (index < 6) data.probeResults.set(name, result());
    else if (name !== 'sensitivity-floor') {
      const bias = index === 6 ? 0.128 : index === 12 ? 0.25 : index === 13 ? 1 : 0;
      const differencesMs = Array(500).fill(bias);
      const { pValue, z, effectSize, medianDiffMs } = wilcoxonSignedRank(differencesMs);
      data.diagnosticResults.set(name, {
        result: result({ pValue, z, effectSize, medianDiffMs, p95BMs: 1 + bias,
          differencesMs, bSamplesMs: Array(500).fill(1 + bias) }),
        hardClause: 'pass', singleProbeFamily: bias ? 'reject' : 'accept',
      });
    }
  });
  data.ledger.push({ task: task('family gate'), sequence: 8 });
  for (let index = 0; index < 10; index++) data.ledger.push({ task: task(`lifecycle ${index}`), sequence: index + 17 });
  data.ledger.sort((left, right) => left.sequence - right.sequence);
  return { ...data, floor: composeFloor([4, 8, 16, 32].map((microseconds) => ({
    microseconds, pValue: 1, medianDiffMs: 0, singleProbeFamily: 'accept',
  }))) };
}

function definitions(source = SOURCE, diagnosticResults = new Map<string, DiagnosticResult>()) {
  const file = ts.createSourceFile('timing.ts', source, ts.ScriptTarget.Latest, true);
  const selected = file.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name
    && /^(?:pins|timingSource|timingConstructionMutations|timingHardeningMutations|timingFunctionText|timingConstantText|timingDiagnosticBodies|recordDiagnostic|assertFiniteProbeStatistics)/u.test(node.name.text));
  const code = ts.transpileModule(selected.map((node) => node.getText(file)).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function('ts', 'expect', 'assertProbeFamily', 'assertProbeHardClause', 'diagnosticResults', code
    + '\nconst build = timingSourceCompiler(); const programDurations = []; const semanticDurations = [];'
    + '\nconst compile = (source, semantic = false) => { const start = performance.now(); const program = build(source, semantic);'
    + ' program.getTypeChecker(); programDurations.push(performance.now() - start);'
    + ' const diagnostics = program.getSemanticDiagnostics.bind(program);'
    + ' program.getSemanticDiagnostics = (...args) => { const start = performance.now();'
    + ' try { return diagnostics(...args); } finally { semanticDurations.push(performance.now() - start); } }; return program; };'
    + '\nreturn { timingSourceChecks: (source, compiler = compile) => timingSourceChecks(source, compiler), programDurations, semanticDurations,'
    + ' timingSourceResolve: (source) => timingSourceResolve(source, compile), timingSourceCompiler,'
    + ' timingSourceMutations, timingSourceResolvedMutations, timingHardeningMutations, recordDiagnostic, recordDiagnosticOutcomes, assertFiniteProbeStatistics };')(
    ts, expect, assertProbeFamily, assertProbeHardClause, diagnosticResults,
  ) as {
    timingSourceChecks: (source: string, compiler?: (source: string, semantic?: boolean) => ts.Program) => Record<string, boolean>;
    timingSourceCompiler: () => (source: string, semantic?: boolean) => ts.Program;
    programDurations: number[];
    semanticDurations: number[];
    timingSourceResolve: (source: string) => { registrationsResolved: boolean; tests: { title: string; suite: string; body: string }[] };
    timingSourceMutations: (source: string) => [string, string, string][];
    timingSourceResolvedMutations: (source: string) => [string, string, string][];
    timingHardeningMutations: (source: string) => [string, string, string][];
    recordDiagnostic: (name: string, result: ProbePResult, rejection?: string) => void;
    recordDiagnosticOutcomes: (name: string, result: ProbePResult) => void;
    assertFiniteProbeStatistics: (result: ProbePResult) => void;
  };
}

function ledgerHook(ledger: LedgerRow[], ledgerFailures: LedgerFailure[], source = SOURCE) {
  const file = ts.createSourceFile('timing.ts', source, ts.ScriptTarget.Latest, true);
  const statement = file.statements.find((node) => ts.isExpressionStatement(node)
    && node.getText(file).startsWith('afterEach(') && node.getText(file).includes('ledgerSequence'));
  if (!statement) throw new Error('Missing ledger hook');
  const code = ts.transpileModule('let ledgerSequence = 0;\n' + statement.getText(file), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let hook!: (context: { task: TimingTask }) => void;
  new Function('afterEach', 'ledger', 'ledgerFailures', code)(
    (callback: typeof hook) => { hook = callback; }, ledger, ledgerFailures,
  );
  return hook;
}

function floorRecorder(floorResults: FloorResult[], compose = composeFloor, source = SOURCE) {
  const file = ts.createSourceFile('timing.ts', source, ts.ScriptTarget.Latest, true);
  const declaration = file.statements.find((node) => ts.isFunctionDeclaration(node)
    && node.name?.text === 'recordSensitivityFloor');
  if (!declaration) throw new Error('Missing floor recorder');
  const code = ts.transpileModule('let sensitivityFloor;\n' + declaration.getText(file), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function('floorResults', 'composeFloor', code
    + '\nreturn { record: recordSensitivityFloor, read: () => sensitivityFloor };')(floorResults, compose) as {
      record: (microseconds: number, result: ProbePResult, rejected: boolean) => void;
      read: () => ReturnType<typeof composeFloor> | undefined;
    };
}

function sourceComposition() {
  const file = ts.createSourceFile('timing.ts', SOURCE, ts.ScriptTarget.Latest, true);
  const titleToEntry: Record<string, string> = {};
  const titles: string[] = [];
  let names: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'TASK_TITLE_TO_ENTRY'
      && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      for (const property of node.initializer.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.name)
          || !ts.isStringLiteral(property.initializer)) throw new Error('Nonliteral title map');
        titleToEntry[property.name.text] = property.initializer.text;
      }
    }
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'ENTRY_NAMES'
      && node.initializer && ts.isAsExpression(node.initializer) && ts.isArrayLiteralExpression(node.initializer.expression)) {
      names = node.initializer.expression.elements.map((element) => {
        if (!ts.isStringLiteral(element)) throw new Error('Nonliteral entry');
        return element.text;
      });
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'it'
      && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) titles.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { names, titleToEntry, titles };
}

async function temporaryRoot() {
  const root = await fs.mkdtemp(join(tmpdir(), 'timing-2-sidecar-'));
  roots.push(root);
  return root;
}

const sourcePins = definitions();

describe('timing-2 sidecar', () => {
  it('runs every source pin and its named in-memory negative control without loading Chromium', () => {
    const functions = sourcePins;
    for (const [pin, passed] of Object.entries(functions.timingSourceChecks(SOURCE))) expect(passed, pin).toBe(true);
    const mutations = functions.timingSourceMutations(SOURCE);
    expect(new Set(mutations.map(([pin]) => pin))).toEqual(new Set(Object.keys(functions.timingSourceChecks(SOURCE))));
    for (const [pin, name, changed] of mutations) {
      expect(changed, name).not.toBe(SOURCE);
      expect(functions.timingSourceChecks(changed)[pin], name).toBe(false);
    }
    console.info(`timing source: ${mutations.length} mutants; program + checker cold=${functions.programDurations[0]!.toFixed(1)}ms`
      + ` max=${Math.max(...functions.programDurations).toFixed(1)}ms`
      + `; file semantic cold=${functions.semanticDurations[0]!.toFixed(1)}ms`
      + ` max=${Math.max(...functions.semanticDurations).toFixed(1)}ms`);
  });

  it.each(sourcePins.timingHardeningMutations(SOURCE))('rejects fix-round mutant %s: %s', (pin, name, changed) => {
    expect(changed, name).not.toBe(SOURCE);
    const checks = sourcePins.timingSourceChecks(changed);
    expect(Object.values(checks), name).toContain(false);
    expect(checks[pin], name).toBe(false);
  });

  it.each(sourcePins.timingSourceResolvedMutations(SOURCE))('rejects symbol-resolution mutant %s: %s', (pin, name, changed) => {
    expect(changed, name).not.toBe(SOURCE);
    expect(sourcePins.timingSourceChecks(changed)[pin], name).toBe(false);
  });

  it('rejects semantic build failure and a compiler that throws', () => {
    expect(sourcePins.timingSourceChecks(SOURCE + '\nconst __reviewBuildFailure: string = 1;')
      .registrationsResolved).toBe(false);
    expect(sourcePins.timingSourceChecks(SOURCE, () => { throw new Error('build failed'); })
      .registrationsResolved).toBe(false);
  });

  it.each([
    ['computed it', "(await vi.importActual<typeof import('vitest')>('vitest'))['it']('hidden', () => {});"],
    ['property descriptor', "Object.getOwnPropertyDescriptor(await vi.importActual<typeof import('vitest')>('vitest'), 'test')!.value('hidden', () => {});"],
    ['computed destructuring', "const { ['it']: hidden } = await vi.importActual<typeof import('vitest')>('vitest'); hidden('hidden', () => {});"],
    ['async factory', ''],
  ])('rejects cap-round async suite mutant: %s', (_name, statement) => {
    const changed = SOURCE.replace("describe.sequential('H Probe P timing bounds', () => {",
      "describe.sequential('H Probe P timing bounds', async () => {\n  " + statement);
    expect(changed).not.toBe(SOURCE);
    expect(sourcePins.timingSourceChecks(changed).registrationsResolved).toBe(false);
  });

  it('rejects factory-level await', () => {
    const changed = SOURCE.replace("describe.sequential('H Probe P timing bounds', () => {",
      "describe.sequential('H Probe P timing bounds', () => {\n  await Promise.resolve();");
    expect(sourcePins.timingSourceChecks(changed).registrationsResolved).toBe(false);
    // Isolate the AST control: the same await also produces a semantic diagnostic.
    const compile = sourcePins.timingSourceCompiler();
    expect(sourcePins.timingSourceChecks(changed, (source) => {
      const program = compile(source);
      program.getSemanticDiagnostics = () => [];
      return program;
    }).registrationsResolved).toBe(false);
  });

  it.each([
    'vi.importActual', 'vi.importMock', 'vi.mock', 'vi.doMock', 'vi.hoisted', 'vi.stubGlobal',
    'vi.restoreAllMocks()', 'vi', 'vi.spyOn', "vi['spyOn']", 'const alias = vi;', 'const carried = { vi };',
  ])('rejects cap-round vi reference in a test callback: %s', (statement) => {
    const anchor = "  it('tripwire-match-vs-no-match-aa', async () => {";
    const changed = SOURCE.replace(anchor, anchor + '\n    ' + statement + ';');
    expect(sourcePins.timingSourceChecks(changed).registrationsResolved).toBe(false);
  });

  it('composes all completion states, preserves failed raw results, and dereferences final task state', () => {
    const data = input();
    data.ledger = [
      { task: task('source pins'), sequence: 1 }, { task: task('gated title'), sequence: 2 },
      { task: task(NAMES[1]!), sequence: 3 }, { task: task(NAMES[2]!), sequence: 4 },
      { task: task(NAMES[3]!, 'skip'), sequence: 5 }, { task: task(NAMES[4]!, 'todo'), sequence: 6 },
    ];
    data.probeResults.set(NAMES[0]!, result()); data.probeResults.set(NAMES[1]!, result());
    const laterFailure = data.ledger[2]!.task;
    laterFailure.result = { ...laterFailure.result!, state: 'fail', errors: [{ message: 'cleanup failed' }] };
    const output = composeTimingSidecar(data);
    expect(output.entries.slice(0, 6).map(({ status, reason }) => ({ status, reason }))).toEqual([
      { status: 'measured', reason: undefined }, { status: 'error', reason: 'cleanup failed' },
      { status: 'missing', reason: 'result not recorded' }, { status: 'missing', reason: 'skip' },
      { status: 'missing', reason: 'todo' }, { status: 'missing', reason: 'not reached' },
    ]);
    expect(output.entries[1]).toMatchObject({ result: result(), sequence: 3,
      startedAt: '2026-09-09T12:00:00.020Z', endedAt: '2026-09-09T12:00:00.030Z', durationMs: 10 });
    expect(output.otherTests).toBe(1);
  });

  it('measures every gated entry using the real source title map and actual it titles', () => {
    const { names, titleToEntry, titles } = sourceComposition();
    expect(Object.keys(titleToEntry)).toHaveLength(8);
    expect(Object.keys(titleToEntry).every((title) => titles.filter((actual) => actual === title).length === 1)).toBe(true);
    expect(Object.values(titleToEntry).every((name) => names.includes(name))).toBe(true);
    const data = { ...input(), names, titleToEntry,
      ledger: titles.map((title, index) => ({ task: task(title), sequence: index + 1 })),
      floor: composeFloor([]) };
    for (const name of names.slice(0, 6)) data.probeResults.set(name, result());
    data.diagnosticResults.set('tripwire-batched-injected-bias-control', {
      result: result(), hardClause: 'pass', singleProbeFamily: 'reject',
    });
    const entries = composeTimingSidecar(data).entries;
    expect(entries.slice(0, 8).map(({ status }) => status)).toEqual(Array(8).fill('measured'));
    expect(entries.slice(0, 6).map(({ kind, sequence }) => ({ kind, sequence })))
      .toEqual([2, 3, 4, 5, 6, 7].map((sequence) => ({ kind: 'gated', sequence })));
  });

  it('records the failed ledger task with its own sequence and leaves the next diagnostic measured', () => {
    const data = input(); const hook = ledgerHook(data.ledger, data.ledgerFailures);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (let index = 0; index < 10; index++) hook({ task: task(`prior ${index}`) });
    const failed = task(NAMES[8]!); const next = task(NAMES[9]!);
    vi.spyOn(data.ledger, 'push').mockImplementationOnce(() => { throw new Error('forced ledger failure'); });
    expect(() => hook({ task: failed })).not.toThrow(); hook({ task: next });
    for (const name of [failed.name, next.name]) data.diagnosticResults.set(name, {
      result: result(), hardClause: 'pass', singleProbeFamily: 'accept',
    });
    expect(data.ledgerFailures[0]).toEqual({ task: failed, sequence: 11, message: 'forced ledger failure' });
    expect(data.ledger.at(-1)).toEqual({ task: next, sequence: 12 });
    const entries = composeTimingSidecar(data).entries;
    expect(entries[8]).toMatchObject({ name: failed.name, sequence: 11, status: 'error', reason: 'ledger-failed', result: result() });
    expect(entries[9]).toMatchObject({ name: next.name, sequence: 12, status: 'measured', result: result() });
    expect(log).toHaveBeenCalledOnce();
    vi.spyOn(data.ledger, 'push').mockImplementationOnce(() => { throw new Error('row'); });
    vi.spyOn(data.ledgerFailures, 'push').mockImplementationOnce(() => { throw new Error('sentinel'); });
    expect(() => hook({ task: task(NAMES[10]!) })).not.toThrow();
    expect(composeTimingSidecar(data).entries[10]).toMatchObject({ status: 'missing', reason: 'not reached' });
  });

  it('keeps task references through later hook failures and prefers a successful row over a sentinel', () => {
    const data = input(); const hook = ledgerHook(data.ledger, data.ledgerFailures); const measured = task(NAMES[0]!);
    hook({ task: measured }); data.probeResults.set(measured.name, result());
    measured.result = { state: 'fail', errors: [{ message: 'later hook failed' }] };
    data.ledgerFailures.push({ task: measured, sequence: 1, message: 'stale sentinel' });
    expect(composeTimingSidecar(data).entries[0]).toMatchObject({ status: 'error', reason: 'later hook failed', result: result() });
  });

  it('keeps the actual ledger hook non-throwing when recording, error conversion, and console.error fail', () => {
    const data = input(); const hook = ledgerHook(data.ledger, data.ledgerFailures);
    vi.spyOn(console, 'error').mockImplementation(() => { throw new Error('console unavailable'); });
    vi.spyOn(data.ledger, 'push').mockImplementation(() => { throw new Error('ledger unavailable'); });
    const failed = task(NAMES[8]!);
    expect(() => hook({ task: failed })).not.toThrow();
    expect(data.ledgerFailures[0]).toMatchObject({ task: failed, sequence: 1 });
    vi.spyOn(data.ledgerFailures, 'push').mockImplementation(() => { throw new Error('sentinel unavailable'); });
    expect(() => hook({ task: task(NAMES[9]!) })).not.toThrow();
    vi.mocked(data.ledger.push).mockImplementation(() => { throw { toString() { throw new Error('conversion unavailable'); } }; });
    expect(() => hook({ task: task(NAMES[10]!) })).not.toThrow();
  });

  it('classifies the genuine non-exported family error and preserves details through JSON', () => {
    let error: unknown;
    try { assertProbeFamily(new Map([['rejecting', result({ pValue: 0 })]]), { alpha: 0.01, expected: ['rejecting'] }); }
    catch (caught) { error = caught; }
    const ranked = { name: 'rejecting', pValue: 0, threshold: 0.01, rank: 1 };
    const expected = { status: 'reject', details: { alpha: 0.01, rejected: [ranked], ordered: [ranked] } };
    expect(classifyFamilyError(error)).toEqual(expected);
    expect(JSON.parse(JSON.stringify(classifyFamilyError(error)))).toEqual(expected);
    let mismatch: unknown;
    try { assertProbeFamily(new Map(), { alpha: 0.01, expected: ['absent'] }); } catch (error) { mismatch = error; }
    expect(classifyFamilyError(mismatch)).toEqual({ status: 'not-evaluated',
      reason: 'Probe P family names mismatch: expected [absent], got []' });
    expect(classifyFamilyError(new Error('unrelated'))).toEqual({ status: 'not-evaluated', reason: 'unrelated' });
    for (const details of [{ alpha: Infinity, rejected: [], ordered: [] }, { alpha: 0.01, rejected: [], ordered: null }, null]) {
      expect(classifyFamilyError(Object.assign(new Error('malformed'), { name: 'ProbeFamilyError', details })))
        .toEqual({ status: 'not-evaluated', reason: 'malformed' });
    }
  });

  it('records a rejecting diagnostic without throwing or mutating it; truncation remains a structural error', () => {
    const records = new Map<string, DiagnosticResult>(); const functions = definitions(SOURCE, records);
    const rejecting = Object.freeze(result({ pValue: 0, medianDiffMs: 5 }));
    expect(() => functions.recordDiagnosticOutcomes('rejecting', rejecting)).not.toThrow();
    expect(() => functions.recordDiagnostic('rejecting', rejecting)).not.toThrow();
    expect(records.get('rejecting')).toEqual({ result: rejecting, singleProbeFamily: 'reject', hardClause: 'fail' });
    expect(records.get('rejecting')!.result).toBe(rejecting);
    functions.recordDiagnostic('quiet', result());
    expect(records.get('quiet')).toEqual({ result: result(), singleProbeFamily: 'accept', hardClause: 'pass' });
    functions.recordDiagnostic('rank-one', result({ pValue: 0.005 }));
    expect(records.get('rank-one')).toMatchObject({ singleProbeFamily: 'reject', hardClause: 'pass' });
    expect(() => functions.assertFiniteProbeStatistics(rejecting)).not.toThrow();
    for (const key of ['aSamplesMs', 'bSamplesMs', 'differencesMs'] as const) {
      expect(() => functions.assertFiniteProbeStatistics(result({ [key]: Array(499).fill(1) }))).toThrow();
    }
    expect(() => functions.assertFiniteProbeStatistics(result({ z: NaN }))).toThrow();
    functions.recordDiagnostic('synthetic', result(), 'original rejection');
    expect(records.get('synthetic')!.singleProbeFamily).toBe('reject');
  });

  it('contains diagnostic-map write errors within the actual recording function', () => {
    const records = new Map<string, DiagnosticResult>(); const functions = definitions(SOURCE, records);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(records, 'set').mockImplementation(() => { throw new Error('map unavailable'); });
    expect(() => functions.recordDiagnostic('diagnostic', result())).not.toThrow();
  });

  it('records the floor as statistics only, using null when no magnitude rejects', () => {
    const quiet = composeFloor([4, 8, 16, 32].map((microseconds) => ({ microseconds,
      pValue: 1, medianDiffMs: 0, singleProbeFamily: 'accept' })));
    expect(quiet).toEqual({ floorMicroseconds: null, magnitudes: [4, 8, 16, 32],
      results: [4, 8, 16, 32].map((microseconds) => ({ microseconds, pValue: 1, medianDiffMs: 0, singleProbeFamily: 'accept' })) });
    expect(composeFloor([]).floorMicroseconds).toBeNull();
    expect(composeFloor([{ microseconds: 8, pValue: 0, medianDiffMs: 0.008, singleProbeFamily: 'reject' }]).floorMicroseconds).toBe(8);
    expect(JSON.stringify(quiet)).not.toContain('SamplesMs');
  });

  it('keeps the actual sensitivity-floor recorder non-throwing on push, composition, and logging failures', () => {
    const rows: FloorResult[] = []; const recorder = floorRecorder(rows);
    const measured = Object.freeze(result({ pValue: 0, medianDiffMs: 5 }));
    recorder.record(4, measured, false); recorder.record(8, measured, true);
    expect(recorder.read()).toEqual(composeFloor([
      { microseconds: 4, pValue: 0, medianDiffMs: 5, singleProbeFamily: 'accept' },
      { microseconds: 8, pValue: 0, medianDiffMs: 5, singleProbeFamily: 'reject' },
    ]));
    vi.spyOn(console, 'error').mockImplementation(() => { throw new Error('console unavailable'); });
    vi.spyOn(rows, 'push').mockImplementation(() => { throw new Error('recording unavailable'); });
    expect(() => recorder.record(16, measured, true)).not.toThrow();
    expect(recorder.read()!.floorMicroseconds).toBe(8);
    const brokenCompose = floorRecorder([], () => { throw new Error('composition unavailable'); });
    expect(() => brokenCompose.record(4, measured, true)).not.toThrow();
    expect(brokenCompose.read()).toBeUndefined();
  });

  it('overwrites a previous complete sidecar with an atomic beforeAll stub in the same directory', async () => {
    const path = join(await temporaryRoot(), 'timing-2-probes.json');
    await fs.writeFile(path, JSON.stringify({ complete: true, startedAt: 'old run' }));
    const rename = vi.spyOn(fs, 'rename'); const stub = { schema: 'timing-2-probes/1', complete: false, startedAt: START };
    await writeTimingSidecar(path, stub);
    expect(JSON.parse(await fs.readFile(path, 'utf8'))).toEqual(stub);
    expect(rename).toHaveBeenCalledOnce();
    const [temporary, destination] = rename.mock.calls[0]!;
    expect(destination).toBe(path); expect(temporary).not.toBe(path); expect(dirname(String(temporary))).toBe(dirname(path));
    expect(await fs.readdir(dirname(path))).toEqual(['timing-2-probes.json']);
  });

  it('removes the atomic temp on failure and reports an incomplete fallback without throwing', async () => {
    const path = join(await temporaryRoot(), 'timing-2-probes.json');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(fs, 'rename').mockRejectedValue(new Error('rename failed'));
    await expect(writeTimingSidecar(path, composeTimingSidecar(input()))).resolves.toBeUndefined();
    expect(JSON.parse(await fs.readFile(path, 'utf8'))).toEqual({ schema: 'timing-2-probes/1', complete: false,
      startedAt: START, writeError: 'rename failed' });
    expect(await fs.readdir(dirname(path))).toEqual(['timing-2-probes.json']);
    expect(log).toHaveBeenCalledOnce();
    vi.spyOn(fs, 'writeFile').mockRejectedValue(new Error('disk unavailable'));
    await expect(writeTimingSidecar(path, composeTimingSidecar(input()))).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(3);
  });

  it('resolves detached, loose and packed HEADs via fs and returns null for failures and worktrees', async () => {
    const root = await temporaryRoot(); const git = join(root, '.git'); const sha = 'a'.repeat(40);
    expect(await readTimingCommit(root)).toBeNull();
    await fs.writeFile(git, 'gitdir: /elsewhere'); expect(await readTimingCommit(root)).toBeNull();
    await fs.rm(git); await fs.mkdir(join(git, 'refs', 'heads'), { recursive: true });
    await fs.writeFile(join(git, 'HEAD'), sha + '\n'); expect(await readTimingCommit(root)).toBe(sha);
    await fs.writeFile(join(git, 'HEAD'), 'ref: refs/heads/main\n');
    await fs.writeFile(join(git, 'refs', 'heads', 'main'), sha + '\n'); expect(await readTimingCommit(root)).toBe(sha);
    await fs.rm(join(git, 'refs', 'heads', 'main'));
    await fs.writeFile(join(git, 'packed-refs'), `# packed refs\n${sha} refs/heads/main\n`);
    expect(await readTimingCommit(root)).toBe(sha);
    await fs.writeFile(join(git, 'HEAD'), 'malformed'); expect(await readTimingCommit(root)).toBeNull();
  });

  it('matches the committed synthetic fixture and the literal complete schema', () => {
    const output = composeTimingSidecar(fixtureInput());
    const fixture = JSON.parse(readFileSync(new URL('./fixtures/timing-2-probes.fixture.json', import.meta.url), 'utf8'));
    expect(output).toEqual(fixture);
    expect(Object.keys(output)).toEqual(['schema', 'complete', 'startedAt', 'writtenAt', 'partitionDurationMs',
      'otherTests', 'commit', 'node', 'chromium', 'pairs', 'warmup', 'alpha', 'entries', 'family']);
    expect(output).toMatchObject({ schema: 'timing-2-probes/1', complete: true, partitionDurationMs: 1000,
      otherTests: 12, pairs: 500, warmup: 20, alpha: 0.01, family: { status: 'accept' } });
    expect(output.entries.map(({ name }) => name)).toEqual(NAMES);
    expect(output.entries.map(({ status }) => status)).toEqual(Array(14).fill('measured'));
    expect(output.entries.slice(0, 6).map(({ sequence }) => sequence)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(output.entries[6]).toMatchObject({ kind: 'control-synthetic', biasMicroseconds: 2, biasPlacement: 'per-call', batch: 64 });
    expect(output.entries.slice(8).map(({ kind }) => kind)).toEqual([
      'twin-aa', 'twin-sham', 'twin-aa', 'twin-sham', 'control-real-click', 'control-real-click',
    ]);
    expect(output.entries.slice(12).map(({ biasMicroseconds, biasPlacement }) => ({ biasMicroseconds, biasPlacement })))
      .toEqual([{ biasMicroseconds: 250, biasPlacement: 'per-sample' }, { biasMicroseconds: 1000, biasPlacement: 'per-sample' }]);
    for (const entry of output.entries.filter(({ name }) => name !== 'sensitivity-floor')) {
      expect('result' in entry && Object.keys(entry.result!)).toEqual([
        'pValue', 'z', 'effectSize', 'medianDiffMs', 'p95AMs', 'p95BMs', 'differencesMs', 'aSamplesMs', 'bSamplesMs',
      ]);
      const raw = entry.result!;
      for (const samples of [raw.aSamplesMs, raw.bSamplesMs, raw.differencesMs]) expect(samples).toHaveLength(500);
    }
  });
});
