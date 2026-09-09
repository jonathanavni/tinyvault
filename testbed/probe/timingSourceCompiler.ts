import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import {
  timingSourceResolve, pinsResolvedMapReferences, pinsDiagnosticTitles, pinsDiagnosticStatistics,
  pinsDiagnosticConstruction,
} from './timingSourceResolve';
import {
  pinsProbeIsolation, pinsTripwireHelpers, pinsMapReferences, hasDirectFamilyGate, hasWrappedFamilyGate,
  hasPinnedTripwireBatch, pinsPayloadConstruction, pinsSyntheticHelperSource, pinsRealClickHelperSource,
  pinsEntryNames, pinsTaskTitles, pinsProbeNames, pinsAssertFiniteProbeStatistics,
  pinsRecordDiagnosticOutcomes, pinsRecordDiagnostic, pinsSyntheticRecording, pinsFloorRecording,
  pinsLedgerRecording,
} from './timingSourcePins';
import { PINNED_TIMING_IMPORTS } from './timingSourceContracts';

// The test entry supplies TypeScript; evaluator modules must not load its compiler package.
type TypeScript = typeof import('typescript');

let ts: TypeScript;

type TimingArrowFunction = import('typescript').ArrowFunction;

type TimingBlock = import('typescript').Block;

type TimingCallExpression = import('typescript').CallExpression;

type TimingExpression = import('typescript').Expression;

type TimingExpressionStatement = import('typescript').ExpressionStatement;

type TimingFunctionDeclaration = import('typescript').FunctionDeclaration;

type TimingIdentifier = import('typescript').Identifier;

type TimingNode = import('typescript').Node;

type TimingProgram = import('typescript').Program;

type TimingSourceFile = import('typescript').SourceFile;

type TimingSymbol = import('typescript').Symbol;

export const TIMING_SOURCE_PATH = fileURLToPath(new URL('../../src/supervisor/host.timing.browser.test.ts', import.meta.url));

export const SIDECAR_SOURCE = readFileSync(new URL('./timing2Sidecar.ts', import.meta.url), 'utf8');

export const FIXTURE_SOURCE = readFileSync(new URL('../../src/supervisor/host.timing.fixtures.ts', import.meta.url), 'utf8');

export type TimingSourceInput = string | { source: string; sidecarSource?: string; fixtureSource?: string };

export type TimingSourceMutation = [pin: string, name: string, changed: TimingSourceInput];

export const programDurations: number[] = [];

export const semanticDurations: number[] = [];

let sharedCompiler: ReturnType<typeof timingSourceCompiler> | undefined;

export function pinsTimingImports(file: TimingSourceFile): boolean {
  const expected = PINNED_TIMING_IMPORTS;
  const actual = file.statements.filter(ts.isImportDeclaration).map((node) => node.getText(file));
  return actual.length === expected.length && actual.every((text, index) => text === expected[index]);
}

export function timingSourceCompiler(typescript = ts): (source: string, checkSemantics?: boolean) => TimingProgram {
  if (!typescript) throw new Error('The timing-source test must supply its TypeScript compiler');
  ts = typescript;
  const rootDirectory = fileURLToPath(new URL('../../', import.meta.url));
  const configPath = fileURLToPath(new URL('../../tsconfig.json', import.meta.url));
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, rootDirectory);
  if (parsed.errors.length) throw new Error('Cannot resolve timing-source tsconfig');
  const root = TIMING_SOURCE_PATH;
  const host = ts.createCompilerHost(parsed.options, true);
  const modules = ts.createModuleResolutionCache(rootDirectory, host.getCanonicalFileName, parsed.options);
  host.resolveModuleNames = (names, containingFile) => names.map((name) =>
    ts.resolveModuleName(name, containingFile, parsed.options, host, modules).resolvedModule);
  const read = host.getSourceFile;
  const dependencies = new Map<string, TimingSourceFile>();
  let current: TimingSourceFile;
  let oldProgram: TimingProgram | undefined;
  host.getSourceFile = (name, ...args) => {
    if (ts.sys.resolvePath(name) === root) return current;
    let file = dependencies.get(name);
    if (!file) { file = read(name, ...args); if (file) dependencies.set(name, file); }
    return file;
  };
  // One full import graph is reused across mutants; only the changed root is reparsed.
  // Type diagnostics remain lazy and run only for the registration predicate.
  return sharedCompiler = (source: string, _checkSemantics = false): TimingProgram => {
    const start = performance.now();
    current = ts.createSourceFile(root, source, parsed.options.target!, true);
    const program = ts.createProgram({ rootNames: [root], options: parsed.options, host, oldProgram });
    oldProgram = program;
    program.getTypeChecker();
    programDurations.push(performance.now() - start);
    const diagnostics = program.getSemanticDiagnostics.bind(program);
    program.getSemanticDiagnostics = (...args) => {
      const start = performance.now();
      try { return diagnostics(...args); }
      finally { semanticDurations.push(performance.now() - start); }
    };
    return program;
  };
}

export function timingSourceProbeSection(source: string): string {
  const file = ts.createSourceFile('timing.ts', source, ts.ScriptTarget.Latest, true);
  const sections = file.statements.filter((node) => ts.isExpressionStatement(node)
    && ts.isCallExpression(node.expression) && node.expression.expression.getText(file) === 'describe.sequential'
    && node.expression.arguments[0] && ts.isStringLiteral(node.expression.arguments[0])
    && node.expression.arguments[0].text === 'H Probe P timing bounds');
  if (sections.length !== 1) return '';
  const section = sections[0]! as TimingExpressionStatement & { expression: TimingCallExpression };
  const callback = section.expression.arguments[1];
  return callback && ts.isArrowFunction(callback) && ts.isBlock(callback.body) ? callback.body.getText(file) : '';
}

export function timingSourceTestCases(source: string): { title: string; body: string }[] {
  const file = ts.createSourceFile('timing.ts', source, ts.ScriptTarget.Latest, true);
  const tests: { title: string; body: string }[] = [];
  const visit = (node: TimingNode): void => {
    if (ts.isCallExpression(node)) {
      let callee = node.expression;
      while (ts.isPropertyAccessExpression(callee) || ts.isCallExpression(callee)) callee = callee.expression;
      if (ts.isIdentifier(callee) && callee.text === 'it') {
        const title = node.arguments[0]; const callback = node.arguments[1];
        tests.push({
          title: title && ts.isStringLiteral(title) ? title.text : '',
          body: callback && ts.isArrowFunction(callback) && ts.isBlock(callback.body)
            ? source.slice(callback.body.getStart(file) + 1, callback.body.end - 1) : '',
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return tests;
}

export function timingSourceTitles(source: string): string[] {
  return timingSourceTestCases(source).map(({ title }) => title);
}

export function timingSourceChecks(
  input: TimingSourceInput, compile = sharedCompiler ??= timingSourceCompiler(),
): Record<string, boolean> {
  const source = typeof input === 'string' ? input : input.source;
  const sidecarSource = typeof input === 'string' ? SIDECAR_SOURCE : input.sidecarSource ?? SIDECAR_SOURCE;
  const fixtureSource = typeof input === 'string' ? FIXTURE_SOURCE : input.fixtureSource ?? FIXTURE_SOURCE;
  // Object.entries evaluates every real-source predicate. A named mutant evaluates only its
  // target predicate, so text-only mutants do not construct an unused semantic program.
  let resolved: ReturnType<typeof timingSourceResolve> | undefined;
  const resolve = () => resolved ??= timingSourceResolve(source, compile);
  let isolation: Record<string, boolean> | undefined;
  const isolated = () => isolation ??= pinsProbeIsolation(source);
  let helpers: Record<string, boolean> | undefined;
  const helper = () => helpers ??= pinsTripwireHelpers(source);
  let maps: Record<string, boolean> | undefined;
  const map = () => maps ??= pinsMapReferences(source, fixtureSource);
  return {
    get registrationsResolved() {
      try { return resolve().registrationsResolved; }
      catch { return false; } // A failed program build cannot certify registrations.
    },
    get mapReferencesResolved() { return pinsResolvedMapReferences(resolve(), sidecarSource); },
    get reportCalls() { return isolated().reportCalls!; },
    get probeWrites() { return isolated().probeWrites!; },
    get gatedFamily() { return isolated().gatedFamily! && hasDirectFamilyGate(source) && !hasWrappedFamilyGate(source); },
    get recomputedFamily() { return isolated().recomputedFamily!; },
    get separateMaps() { return isolated().separateMaps!; },
    get diagnosticNamesExcluded() { return isolated().diagnosticNamesExcluded!; },
    get helperBoundary() { return helper().helperBoundary!; },
    get realWrapper() { return helper().realWrapper!; },
    get helperCalls() { return helper().helperCalls! && hasPinnedTripwireBatch(source); },
    get helperSampling() { return helper().helperSampling!; },
    get gatedRealClick() { return helper().gatedRealClick!; },
    get gatedSynthetic() { return helper().gatedSynthetic!; },
    get nonmatch2() { return helper().nonmatch2! && pinsPayloadConstruction(source, fixtureSource); },
    get mapDeclarations() { return map().mapDeclarations!; },
    get mapReferences() { return map().mapReferences!; },
    get unknownCastExemption() { return map().unknownCastExemption!; },
    get diagnosticTitles() { return pinsDiagnosticTitles(resolve()); },
    get diagnosticStatistics() { return pinsDiagnosticStatistics(resolve()); },
    get diagnosticConstruction() { return pinsDiagnosticConstruction(resolve()); },
    get syntheticHelperSource() { return pinsSyntheticHelperSource(source); },
    get realClickHelperSource() { return pinsRealClickHelperSource(source); },
    get entryNames() { return pinsEntryNames(sidecarSource); },
    get taskTitles() { return pinsTaskTitles(source, sidecarSource); },
    get probeNames() { return pinsProbeNames(source); },
    get finiteHelper() { return pinsAssertFiniteProbeStatistics(source); },
    get outcomesHelper() { return pinsRecordDiagnosticOutcomes(source); },
    get recordingHelper() { return pinsRecordDiagnostic(source); },
    get syntheticRecording() { return pinsSyntheticRecording(source); },
    get floorRecording() { return pinsFloorRecording(source); },
    get ledgerRecording() { return pinsLedgerRecording(source); },
  };
}

export { ts };

export type { TimingArrowFunction, TimingBlock, TimingCallExpression, TimingExpression, TimingFunctionDeclaration, TimingIdentifier, TimingNode, TimingSymbol };
