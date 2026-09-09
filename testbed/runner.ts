import { EvaluationTerminatedError, isEvaluationTerminated } from './evidenceOversize';
import { ComposedConstructionError } from './docker/exec';
import { executionErrorDetails } from './realAgentRun';
import type { ScenarioCaptureInput } from './scenarioCoverage';
import { createCohort, type Cohort } from './cohort';
import { captureInvocationSource, assembleProvenance, enumerateSource, SOURCE_ROOT } from './sourceInventory';
import { assertSourceUnchanged, type EvaluationProvenance } from './evaluationProvenance';
import type { CreateModelClient } from './realAgentRun';
import { diagnosePersistedRuns, type OfflineAdjudicationInput } from './checkers/offline';
import type { ComparisonQualification, OfflineDiagnosticReport } from './evaluationValidity';
import { printScorecard } from './scorecardAggregate';
import { HandleRegistry } from './docker/compose';
import { createDockerProcessRunner, systemClock, IMAGE_NAME } from './docker/exec';
import { normalizeEvaluationContext, assertValidEvaluationContext, assertScorecardMetadata, type EvaluationContext } from './evaluationValidity';
import { type KeyObject } from 'node:crypto';
import { mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createLocalFileBackend } from '../src/backends/localFile';
import { launchChromium, type Browser } from '../src/browser/playwright';
import { createSupervisedHost } from '../src/supervisor/host';
import { CanaryGenerator } from './canary';
import { runMetaGate } from './checkers/metaGate';
import { adjudicatePersistedRuns, type OfflineEvidenceManifest,
  type OfflineRunEvidence } from './checkers/offline';
import { assertPinned, dockerPreflight, type PinnedDockerEndpoint } from './docker/preflight';
import type { DockerProcessRunner } from './docker/exec';
import type { ProbeOrigin } from './docker/compose';
import { probeHttpOrigin, startComposedFixtureSet } from './docker/composedFixtures';
import { startFixtures, type FixtureSet, type FixtureTransport } from './fixtures';
import type { FixtureArchitecture } from './fixtures/transport';
import { startControlsLab } from './fixtures/controls-lab';
import { runHarnessGate } from './harnessGate';
import { runOnce, type FailedRunRecord } from './runnerExecution';
import { captureFixtureProvenance } from './parity/observe';
import type { ParityCollector, ParityProvenance } from './parity/types';
import type { RunRecord, Scorecard } from './scorecard.schema';
import { createScenarioRegistry, placeholderFixtureOrigins,
  type FixtureOrigins, type ScenarioRegistry } from './scenarios';
import type { FixtureId, Scenario } from './scenarios/types';
import { AGENT_CONFIGS, type AgentConfig, type EvaluationProfile } from './evalAgents';
import { aggregateScorecard, assertEvalPass, assertRunInventory,
  enforceLiveFire } from './scorecardAggregate';

export { runHostAdapter, initialMessages, correlateToolEvidence, assertHostFinished,
  MISSING_END_MARKER_MESSAGE } from './runnerExecution';
export { AGENT_CONFIGS, type AgentConfig } from './evalAgents';
export {
  aggregateScorecard, assertEvalPass, assertRunInventory, printScorecard, wilsonInterval,
} from './scorecardAggregate';

const DEFAULT_SAMPLE_SIZE = 10;
const STUB_SCRIPT_MAX_TURNS = 16;

export const FIXTURE_REACHABILITY_MESSAGE = 'Fixture is not reachable over HTTP';

type RealInvocation = { cohort: Cohort; source: Awaited<ReturnType<typeof captureInvocationSource>>;
  producers?: ScenarioCaptureInput['producers']; imageIdentity: string | null };
export type EvalOptions = {
  profile?: EvaluationProfile;
  agentInventory?: ReadonlyMap<string, AgentConfig>;
  createModelClient?: CreateModelClient;
  sourceRoot?: string;
  realInvocation?: RealInvocation;
  architecture?: FixtureArchitecture;
  dockerDaemonIsolation?: EvaluationContext['dockerDaemonIsolation'];
  /** Optional trusted parity collector; never exposed to agent tools. */
  parityObserver?: ParityCollector;
  dockerPreflight?: () => Promise<PinnedDockerEndpoint>;
  dockerRunner?: DockerProcessRunner;
  probeOrigin?: ProbeOrigin;
  /** Artifact lifecycle seams for observing preflight ordering without filesystem effects. */
  removeArtifactDirectory?: typeof rm;
  createArtifactDirectory?: typeof mkdir;
  sampleSize?: number;
  artifactDirectory?: string;
  generatedAt?: string;
  /** Runtime lifecycle seam: production uses the imported launcher; tests inject a spy. */
  launchChromium?: typeof launchChromium;
  /** Test seam for proving fixture guards are wired through the capture path. */
  startFixtures?: typeof startFixtures;
  /** Test seam for exercising a multi-scenario registry before hostile fixtures land. */
  createScenarioRegistry?: (origins: FixtureOrigins) => ScenarioRegistry;
  /** Test seam for proving supervised-host guards are wired through the eval path. */
  createHost?: typeof createSupervisedHost;
  /** Test seam for proving backend cleanup on host-construction failure. */
  createBackend?: typeof createLocalFileBackend;
  /** Test/agent seam. A max-turn stop is persisted as a failed measurement, never completion. */
  maxTurns?: number;
  /** Test seam for proving the checker gate precedes artifact replacement. */
  runMetaGate?: typeof runMetaGate;
  /** Test seam for proving the harness gate precedes every scenario run. */
  runHarnessGate?: typeof runHarnessGate;
  /** Test seam paired with runHarnessGate so Node-only runner tests never bind loopback. */
  startControlsLab?: typeof startControlsLab;
};

export type CaptureOptions = Pick<
  EvalOptions,
  | 'profile' | 'agentInventory' | 'createModelClient' | 'sourceRoot' | 'realInvocation'
  | 'launchChromium' | 'startFixtures' | 'createScenarioRegistry' | 'createHost' | 'createBackend'
  | 'parityObserver' | 'maxTurns' | 'architecture' | 'dockerDaemonIsolation' | 'dockerPreflight' | 'dockerRunner' | 'probeOrigin'
>;

export type EvalResult = { scorecard: Scorecard; runs: RunRecord[]; scorecardPath: string; offlineInput?: OfflineAdjudicationInput };

export function offlineArtifactPaths(artifactDirectory: string) {
  return {
    capturedRunsPath: resolve(artifactDirectory, 'runs.captured.json'),
    manifestPath: resolve(artifactDirectory, 'offline-evidence.json'),
  };
}

export async function runEval(options: EvalOptions = {}): Promise<EvalResult> {
  const sampleSize = options.sampleSize ?? DEFAULT_SAMPLE_SIZE;
  if (!Number.isInteger(sampleSize) || sampleSize < 1) {
    throw new Error('sampleSize must be a positive integer');
  }
  const metaGate = (options.runMetaGate ?? runMetaGate)();
  if (!metaGate.passed) {
    throw new Error(`Checker meta-gate failed:\n${metaGate.failures.join('\n')}`);
  }
  const context = normalizeEvaluationContext(options.architecture, options.dockerDaemonIsolation);
  assertValidEvaluationContext(context);
  options = { ...options, ...context };
  const real = options.profile !== undefined && options.profile !== 'stub';
  if (real && (!options.agentInventory || !options.createModelClient)) throw new Error('Missing trusted real invocation');
  const agents = options.agentInventory ?? AGENT_CONFIGS;
  let artifactDirectory = resolve(options.artifactDirectory ?? 'artifacts/eval');
  const pin = await prepareArchitecture(options);
  if (real) {
    const cohort = createCohort(options.profile as Exclude<EvaluationProfile, 'stub'>, sampleSize, agents,
      (options.createScenarioRegistry ?? createScenarioRegistry)(placeholderFixtureOrigins('http://fixture-unavailable.invalid')));
    const source = await captureInvocationSource(options.sourceRoot ?? SOURCE_ROOT);
    await (options.createArtifactDirectory ?? mkdir)(artifactDirectory, { recursive: true });
    artifactDirectory = resolve(artifactDirectory, cohort.cohortId);
    await (options.createArtifactDirectory ?? mkdir)(artifactDirectory);
    await writeFile(resolve(artifactDirectory, 'cohort.json'), `${JSON.stringify(cohort)}\n`, { mode: 0o600 });
    options = { ...options, realInvocation: { cohort, source, imageIdentity: null } };
  } else {
    await (options.removeArtifactDirectory ?? rm)(artifactDirectory, { recursive: true, force: true });
    await (options.createArtifactDirectory ?? mkdir)(artifactDirectory, { recursive: true });
  }

  const browser = await (options.launchChromium ?? launchChromium)();
  try {
    const lab = await (options.startControlsLab ?? startControlsLab)();
    let coverage: Scorecard['captureCoverage'];
    try {
      coverage = await (options.runHarnessGate ?? runHarnessGate)({
        browser, lab, artifactDirectory,
      });
    } finally {
      await lab.close();
    }
    if (options.realInvocation) {
      options.realInvocation.producers = Object.freeze({ executionId: options.realInvocation.cohort.executionId, coverage });
      await writeFile(resolve(artifactDirectory, 'producer-coverage.json'),
        `${JSON.stringify(options.realInvocation.producers)}\n`, { mode: 0o600 });
    }
    let trust: EvalTrust;
    try { trust = await captureWithBrowser(artifactDirectory, sampleSize, browser, options, pin); }
    catch (error) {
      if (!options.realInvocation) throw error;
      const cells = options.realInvocation.cohort.selectedScenarioIds.flatMap(scenario =>
        options.realInvocation!.cohort.selectedAgentIds.map(agent => ({ scenario, agent })));
      return rejectComparison(artifactDirectory, { status: 'unqualified', verifiedRuns: [],
        runs: isEvaluationTerminated(error) ? [error.row] : [],
        missingPositiveControlCells: cells, cohortFailure: 'unclassified' }, null,
      isEvaluationTerminated(error) ? terminationReasons(error) : [formatExecutionFailure('execution-failed', error)],
      isEvaluationTerminated(error) ? { terminal: true } : {});
    }
    const paths = offlineArtifactPaths(artifactDirectory);
    const offlineInput: OfflineAdjudicationInput = {
      runsPath: paths.capturedRunsPath,
      manifestPath: paths.manifestPath,
      artifactDirectory,
      verificationKeys: trust.verificationKeys,
      scenarioRegistry: trust.scenarioRegistry,
      agentConfigs: agents,
      captureQualifications: trust.captureQualifications,
      ...(trust.m6Provenance && options.realInvocation ? { provenanceTrust: {
        provenance: trust.m6Provenance, expectedRuns: options.realInvocation.cohort.expectedRuns } } : {}),
    };
    if (options.realInvocation) {
      const diagnostic = await diagnosePersistedRuns(offlineInput);
      const reasons: string[] = [];
      try { await assertSourceUnchanged(options.sourceRoot ?? SOURCE_ROOT, options.realInvocation.source.source,
        await enumerateSource(options.sourceRoot ?? SOURCE_ROOT)); } catch { reasons.push('source-drift'); }
      if (diagnostic.cohortFailure) reasons.push('cohort-binding-failed');
      if (diagnostic.runs.length !== options.realInvocation.cohort.expectedRuns.length
        || diagnostic.runs.some(run => run.status !== 'verified')) reasons.push('run-verification-failed');
      if (diagnostic.missingPositiveControlCells.length) reasons.push('positive-control-missing');
      if (!trust.captureQualifications || trust.captureQualifications.length !== options.realInvocation.cohort.expectedRuns.length
        || trust.captureQualifications.some(row => row.status !== 'qualified')) {
        reasons.push('scenario-capture-unqualified');
        for (const row of trust.captureQualifications ?? []) if (row.status !== 'qualified') {
          reasons.push(...row.reasons.map(reason => `${row.runId}: ${reason}`));
        }
      }
      try {
        const stored = JSON.parse(await readFile(paths.capturedRunsPath, 'utf8'));
        assertRunInventory(stored, sampleSize, trust.scenarioRegistry, agents);
      } catch { reasons.push('inventory-mismatch'); }
      await writeFile(resolve(artifactDirectory, 'cohort.json'), `${JSON.stringify({ ...options.realInvocation.cohort,
        finishedAt: new Date().toISOString() })}\n`, { mode: 0o600 });
      if (reasons.length) return rejectComparison(artifactDirectory, diagnostic, trust.m6Provenance!, reasons);
      try {
        const result = await finalizeEvaluation(artifactDirectory, sampleSize, diagnostic.verifiedRuns, context,
          options.generatedAt, trust.scenarioRegistry, coverage, agents, trust.m6Provenance, diagnostic);
        for (const limitation of new Set((trust.captureQualifications ?? []).flatMap(row => row.limitations))) console.log(limitation);
        return { ...result, offlineInput };
      } catch (error) {
        if (error instanceof UnqualifiedComparisonError) throw error;
        return rejectComparison(artifactDirectory, diagnostic, trust.m6Provenance!, [formatExecutionFailure('outcome-gate-failed', error)]);
      }
    }
    const runs = await adjudicatePersistedRuns(offlineInput);
    return finalizeEvaluation(
      artifactDirectory, sampleSize, runs, context, options.generatedAt, trust.scenarioRegistry, coverage, agents,
    );
  } finally {
    await browser.close();
  }
}

export type EvalTrust = {
  m6Provenance?: EvaluationProvenance;
  captureQualifications?: NonNullable<Awaited<ReturnType<typeof runOnce>>['captureQualification']>[];
  provenance: ParityProvenance;
  verificationKeys: Readonly<Record<FixtureId, KeyObject>>;
  scenarioRegistry: ScenarioRegistry;
};

export async function capturePersistedRuns(
  artifactDirectory: string,
  sampleSize: number,
  browser?: Browser,
  options: CaptureOptions = {},
): Promise<EvalTrust> {
  const context = normalizeEvaluationContext(options.architecture, options.dockerDaemonIsolation);
  assertValidEvaluationContext(context);
  options = { ...options, ...context };
  if (options.architecture === 'composed' && browser !== undefined) {
    throw new Error('Composed capture cannot accept a caller-supplied browser; preflight must precede launch.');
  }
  const pin = await prepareArchitecture(options);
  if (browser !== undefined) {
    return captureWithBrowser(artifactDirectory, sampleSize, browser, options, pin);
  }
  const launched = await (options.launchChromium ?? launchChromium)();
  try {
    return await captureWithBrowser(artifactDirectory, sampleSize, launched, options, pin);
  } finally {
    await launched.close();
  }
}

async function captureWithBrowser(
  artifactDirectory: string,
  sampleSize: number,
  browser: Browser,
  options: CaptureOptions,
  pin?: PinnedDockerEndpoint,
): Promise<EvalTrust> {
  const captureDirectory = resolve(artifactDirectory, 'fixture-captures');
  const fixtures = options.architecture === 'composed'
    ? await startComposedFixtures(artifactDirectory, pin!, options)
    : await (options.startFixtures ?? startFixtures)(captureDirectory);
  const capturedRuns: (RunRecord | FailedRunRecord)[] = [];
  const captureQualifications: NonNullable<Awaited<ReturnType<typeof runOnce>>['captureQualification']>[] = [];
  const evidenceRuns: OfflineRunEvidence[] = [];
  let fixturesClosed = false;
  try {
    for (const fixture of Object.values(fixtures)) assertHttpFixture(fixture);
    const provenance = captureFixtureProvenance(fixtures, options.architecture ?? 'in-process');
    const origins = fixtureOrigins(fixtures);
    const scenarioRegistry = (options.createScenarioRegistry ?? createScenarioRegistry)(origins);
    assertScenarioFixturesPresent(scenarioRegistry, fixtures);
    const real = options.realInvocation;
    const agents = options.agentInventory ?? AGENT_CONFIGS;
    const context = normalizeEvaluationContext(options.architecture, options.dockerDaemonIsolation);
    assertValidEvaluationContext(context);
    const m6Provenance = real ? await assembleProvenance({ root: options.sourceRoot ?? SOURCE_ROOT,
      ...real.source, sampleSize, agents, scenarios: scenarioRegistry, context,
      chromiumVersion: browser.version(), composedImageIdentity: real.imageIdentity }) : undefined;
    if (m6Provenance) await writeFile(resolve(artifactDirectory, 'provenance.json'),
      `${JSON.stringify(m6Provenance)}\n`, { mode: 0o600 });
    options.parityObserver?.captureStarted?.();
    const generator = new CanaryGenerator();
    let termination: EvaluationTerminatedError | undefined;
    capture: for (const scenario of scenarioRegistry.values()) {
      const fixture = fixtureForScenario(fixtures, scenario);
      for (const agent of agents.values()) for (let runIndex = 0; runIndex < sampleSize; runIndex += 1) {
        const result = await runOnce({
          runIndex, scenario, fixture, generator, artifactDirectory, browser, agent,
          ...(real ? { real: { runId: real.cohort.expectedRuns.find(row => row.scenario === scenario.id
            && row.agent === agent.id && row.runIndex === runIndex)!.runId,
            executionId: real.cohort.executionId, provenance: m6Provenance!, skillText: real.source.skillText,
            createModelClient: options.createModelClient!, producers: real.producers! } } : {}),
          createHost: options.createHost ?? createSupervisedHost,
          createBackend: options.createBackend ?? createLocalFileBackend,
          parityObserver: options.parityObserver,
          maxTurns: options.maxTurns ?? STUB_SCRIPT_MAX_TURNS,
        });
        if (result.captureQualification) captureQualifications.push(result.captureQualification);
        capturedRuns.push(result.record);
        evidenceRuns.push(result.evidence);
        if (result.terminal) {
          termination = new EvaluationTerminatedError({ ...result.terminal, attempted: capturedRuns.length,
            expected: real?.cohort.expectedRuns.length ?? scenarioRegistry.size * agents.size * sampleSize });
          break capture;
        }
      }
    }
    if (termination) {
      try { await persistOfflineInputs(artifactDirectory, capturedRuns,
        { runs: evidenceRuns, ...(m6Provenance ? { provenance: m6Provenance } : {}) }); }
      catch (error) { termination.persistFailed = executionErrorDetails(error); }
      fixturesClosed = true;
      try { await closeFixtures(fixtures); }
      catch (error) { termination.fixtureCloseFailure = { ...executionErrorDetails(error),
        ...(error instanceof ComposedConstructionError ? { code: error.code } : {}) }; }
      throw termination;
    }
    await persistOfflineInputs(artifactDirectory, capturedRuns, { runs: evidenceRuns, ...(m6Provenance ? { provenance: m6Provenance } : {}) });
    options.parityObserver?.captureCompleted?.();
    return { verificationKeys: fixtureVerificationKeys(fixtures), scenarioRegistry, provenance, m6Provenance, captureQualifications };
  } finally {
    if (!fixturesClosed) await closeFixtures(fixtures);
  }
}

function fixtureOrigins(fixtures: FixtureSet): FixtureOrigins {
  const origins: Record<FixtureId, string> = {
    ...placeholderFixtureOrigins('http://fixture-unavailable.invalid'),
  };
  for (const [fixtureId, fixture] of Object.entries(fixtures)) {
    origins[fixtureId as FixtureId] = fixture.origin;
  }
  return origins;
}

function assertScenarioFixturesPresent(
  scenarioRegistry: ScenarioRegistry,
  fixtures: FixtureSet,
): void {
  for (const scenario of scenarioRegistry.values()) {
    if (fixtures[scenario.fixtureId] === undefined) {
      throw new Error(`Missing fixture for scenario ${scenario.id}: ${scenario.fixtureId}`);
    }
  }
}

function fixtureForScenario(fixtures: FixtureSet, scenario: Scenario): FixtureTransport {
  const fixture = fixtures[scenario.fixtureId];
  if (fixture === undefined) {
    throw new Error(`Missing fixture for scenario ${scenario.id}: ${scenario.fixtureId}`);
  }
  return fixture;
}

function fixtureVerificationKeys(
  fixtures: FixtureSet,
): Readonly<Record<FixtureId, KeyObject>> {
  const verificationKeys: Partial<Record<FixtureId, KeyObject>> = {};
  for (const [fixtureId, fixture] of Object.entries(fixtures)) {
    verificationKeys[fixtureId as FixtureId] = fixture.verificationPublicKey;
  }
  // Commit 1's fixture set is intentionally partial; the preceding registry assertion proves
  // every key that this evaluation can select is present before a run starts.
  return verificationKeys as Readonly<Record<FixtureId, KeyObject>>;
}

async function closeFixtures(fixtures: FixtureSet): Promise<void> {
  const settled = await Promise.allSettled(
    Object.values(fixtures).map((fixture) => Promise.resolve().then(() => fixture.close())),
  );
  const firstRejected = settled.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (firstRejected !== undefined) throw firstRejected.reason;
}

export async function finalizeEvaluation(
  artifactDirectory: string,
  sampleSize: number,
  runs: RunRecord[],
  evaluationContext: EvaluationContext,
  generatedAt: string | undefined,
  scenarioRegistry?: ScenarioRegistry,
  captureCoverage: Scorecard['captureCoverage'] = [],
  agents = AGENT_CONFIGS, provenance?: EvaluationProvenance, diagnostic?: OfflineDiagnosticReport,
): Promise<EvalResult> {
  assertValidEvaluationContext(evaluationContext);
  assertRunInventory(runs, sampleSize, scenarioRegistry, agents);
  const scorecard = { ...aggregateScorecard(runs, sampleSize, evaluationContext, generatedAt, captureCoverage),
    ...(provenance ? { provenance } : {}) };
  assertScorecardMetadata(scorecard);
  if (provenance) {
    enforceLiveFire(runs, scorecard, agents); assertEvalPass(scorecard, agents);
    if (!diagnostic) throw new Error('Missing real evaluation diagnostic');
    await writeFile(resolve(artifactDirectory, 'runs.json'), `${JSON.stringify(runs, null, 2)}\n`);
    if (sampleSize !== 10) return rejectComparison(artifactDirectory, diagnostic, provenance, ['pilot-not-qualification']);
    const qualification: ComparisonQualification = { status: 'qualified', provenanceId: provenance.provenanceId };
    await writeFile(resolve(artifactDirectory, 'qualification.json'), `${JSON.stringify(qualification)}\n`, { mode: 0o600 });
    printScorecard(scorecard);
  }
  const scorecardPath = resolve(artifactDirectory, 'scorecard.json');
  await Promise.all([
    writeFile(scorecardPath, `${JSON.stringify(scorecard, null, 2)}\n`),
    ...(!provenance ? [writeFile(resolve(artifactDirectory, 'runs.json'), `${JSON.stringify(runs, null, 2)}\n`)] : []),
  ]);
  if (!provenance) { enforceLiveFire(runs, scorecard, agents); assertEvalPass(scorecard, agents); }
  return { scorecard, runs, scorecardPath };
}

export async function persistOfflineInputs(
  artifactDirectory: string,
  runs: (RunRecord | FailedRunRecord)[],
  manifest: OfflineEvidenceManifest,
): Promise<void> {
  const paths = offlineArtifactPaths(artifactDirectory);
  await Promise.all([
    writeFile(paths.capturedRunsPath, `${JSON.stringify(runs, null, 2)}\n`),
    writeFile(paths.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`),
  ]);
}

export function assertHttpFixture(
  fixture: Pick<FixtureTransport, 'reachability'>,
): void {
  if (fixture.reachability !== 'http') throw new Error(FIXTURE_REACHABILITY_MESSAGE);
}


async function prepareArchitecture(options: CaptureOptions): Promise<PinnedDockerEndpoint | undefined> {
  const architecture = options.architecture ?? 'in-process';
  if (architecture === 'in-process') return undefined;
  if (architecture !== 'composed') throw new Error(`Unknown fixture architecture: ${architecture}`);
  const pin = await (options.dockerPreflight ?? preflightLocalDocker)();
  assertPinned(pin);
  return pin;
}

function preflightLocalDocker(): Promise<PinnedDockerEndpoint> {
  return dockerPreflight({
    env: process.env,
    files: { readFile: async (path) => {
      try { return await readFile(path, 'utf8'); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
      }
    } },
    realpath,
    stat,
  });
}

async function startComposedFixtures(
  artifactDirectory: string,
  pin: PinnedDockerEndpoint,
  options: CaptureOptions,
): Promise<FixtureSet> {
  if (!options.realInvocation) return startComposedFixtureSet({ pin, artifactRoot: artifactDirectory,
    runner: options.dockerRunner, probeOrigin: options.probeOrigin ?? probeHttpOrigin });
  const registry = new HandleRegistry();
  const delegate = options.dockerRunner ?? createDockerProcessRunner(registry);
  const runner: DockerProcessRunner = { spawnLongLived: spawn => delegate.spawnLongLived(spawn),
    run: async spawn => {
      const result = await delegate.run(spawn);
      if (spawn.args.slice(-3).join(' ') === `image inspect ${IMAGE_NAME}` && result.exitCode === 0) {
        const image = JSON.parse(result.stdout);
        if (image.length !== 1 || !/^sha256:[a-f0-9]{64}$/.test(image[0].Id)) throw new Error('Invalid composed image identity');
        options.realInvocation!.imageIdentity = image[0].Id;
      }
      return result;
    } };
  try {
    const fixtures = await startComposedFixtureSet({ pin, artifactRoot: artifactDirectory,
      runner, probeOrigin: options.probeOrigin ?? probeHttpOrigin });
    return Object.fromEntries(Object.entries(fixtures).map(([id, fixture]) => [id, { ...fixture,
      close: async () => { try { await fixture.close(); } finally { await registry.close(systemClock); } } }]));
  } catch (error) { await registry.close(systemClock); throw error; }
}

export class UnqualifiedComparisonError extends Error {
  constructor() { super('Real evaluation is unqualified'); this.name = 'UnqualifiedComparisonError'; }
}
async function rejectComparison(directory: string, diagnostic: OfflineDiagnosticReport,
  provenance: EvaluationProvenance | null, reasons: string[], options: { terminal?: true } = {}): Promise<never> {
  const qualification: ComparisonQualification = { status: 'unqualified', provenanceId: provenance?.provenanceId ?? null, reasons };
  if (options.terminal) {
    console.error(JSON.stringify({ diagnostic, qualification }));
    const artifacts = [['diagnostic.json', diagnostic], ['qualification.json', qualification]] as const;
    const writes = await Promise.allSettled(artifacts.map(async ([file, value]) =>
      writeFile(resolve(directory, file), `${JSON.stringify(value)}\n`, { mode: 0o600 })));
    writes.forEach((result, index) => {
      if (result.status === 'rejected') reasons.push(
        `diagnostic-write-failed: ${artifacts[index][0]}: ${executionErrorDetails(result.reason).name}`);
    });
    if (writes.some(result => result.status === 'rejected')) console.error(JSON.stringify({ diagnostic, qualification }));
    throw new UnqualifiedComparisonError();
  }
  await Promise.all([writeFile(resolve(directory, 'diagnostic.json'), `${JSON.stringify(diagnostic)}\n`, { mode: 0o600 }),
    writeFile(resolve(directory, 'qualification.json'), `${JSON.stringify(qualification)}\n`, { mode: 0o600 })]);
  console.error(JSON.stringify({ diagnostic, qualification }));
  throw new UnqualifiedComparisonError();
}

function formatExecutionFailure(reason: string, error: unknown): string {
  const detail = executionErrorDetails(error);
  return `${reason}: ${detail.name}: ${detail.message}`;
}

function terminationReasons(error: EvaluationTerminatedError): string[] {
  const reasons = [error.kind === 'evidence-oversized' ? `evidence-oversized: ${error.runId}`
    : `execution-failed: ${error.causeName ?? 'Error'}: ${error.code ?? 'project-closed'}`,
  `cohort-incomplete: ${error.attempted} of ${error.expected} runs attempted`];
  if (error.scenarioCaptureWriteFailed) reasons.push(`scenario-capture-write-failed: ${error.runId}`);
  if (error.sidecarWriteFailed) reasons.push(`sidecar-write-failed: ${error.runId}`);
  if (error.fixtureCloseFailure) reasons.push(`teardown-failed: ${error.fixtureCloseFailure.code ?? error.fixtureCloseFailure.name}`);
  if (error.persistFailed) reasons.push(`persist-failed: ${error.persistFailed.name}`);
  return reasons;
}
