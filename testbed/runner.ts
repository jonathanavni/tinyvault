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
import { startFixtures, type FixtureSet, type FixtureTransport } from './fixtures';
import type { FixtureArchitecture } from './fixtures/transport';
import { startControlsLab } from './fixtures/controls-lab';
import { runHarnessGate } from './harnessGate';
import { runOnce } from './runnerExecution';
import type { RunRecord, Scorecard } from './scorecard.schema';
import { createScenarioRegistry, placeholderFixtureOrigins,
  type FixtureOrigins, type ScenarioRegistry } from './scenarios';
import type { FixtureId, Scenario } from './scenarios/types';
import { AGENT_CONFIGS } from './evalAgents';
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

export type EvalOptions = {
  architecture?: FixtureArchitecture;
  dockerPreflight?: () => Promise<PinnedDockerEndpoint>;
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
  | 'launchChromium' | 'startFixtures' | 'createScenarioRegistry' | 'createHost' | 'createBackend'
  | 'maxTurns' | 'architecture' | 'dockerPreflight'
>;

export type EvalResult = { scorecard: Scorecard; runs: RunRecord[]; scorecardPath: string };

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
  const artifactDirectory = resolve(options.artifactDirectory ?? 'artifacts/eval');
  const pin = await prepareArchitecture(options);
  await (options.removeArtifactDirectory ?? rm)(artifactDirectory, { recursive: true, force: true });
  await (options.createArtifactDirectory ?? mkdir)(artifactDirectory, { recursive: true });

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
    const trust = await captureWithBrowser(artifactDirectory, sampleSize, browser, options, pin);
    const paths = offlineArtifactPaths(artifactDirectory);
    const runs = await adjudicatePersistedRuns({
      runsPath: paths.capturedRunsPath,
      manifestPath: paths.manifestPath,
      artifactDirectory,
      verificationKeys: trust.verificationKeys,
      scenarioRegistry: trust.scenarioRegistry,
      agentConfigs: AGENT_CONFIGS,
    });
    return finalizeEvaluation(
      artifactDirectory, sampleSize, runs, options.generatedAt, trust.scenarioRegistry, coverage,
    );
  } finally {
    await browser.close();
  }
}

export type EvalTrust = {
  verificationKeys: Readonly<Record<FixtureId, KeyObject>>;
  scenarioRegistry: ScenarioRegistry;
};

export async function capturePersistedRuns(
  artifactDirectory: string,
  sampleSize: number,
  browser?: Browser,
  options: CaptureOptions = {},
): Promise<EvalTrust> {
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
    ? await startComposedFixtures(captureDirectory, pin!)
    : await (options.startFixtures ?? startFixtures)(captureDirectory);
  const capturedRuns: RunRecord[] = [];
  const evidenceRuns: OfflineRunEvidence[] = [];
  try {
    for (const fixture of Object.values(fixtures)) assertHttpFixture(fixture);
    const origins = fixtureOrigins(fixtures);
    const scenarioRegistry = (options.createScenarioRegistry ?? createScenarioRegistry)(origins);
    assertScenarioFixturesPresent(scenarioRegistry, fixtures);
    const generator = new CanaryGenerator();
    for (const scenario of scenarioRegistry.values()) {
      const fixture = fixtureForScenario(fixtures, scenario);
      for (let runIndex = 0; runIndex < sampleSize; runIndex += 1) {
        const result = await runOnce({
          runIndex, scenario, fixture, generator, artifactDirectory, browser,
          createHost: options.createHost ?? createSupervisedHost,
          createBackend: options.createBackend ?? createLocalFileBackend,
          maxTurns: options.maxTurns ?? STUB_SCRIPT_MAX_TURNS,
        });
        capturedRuns.push(result.record);
        evidenceRuns.push(result.evidence);
      }
    }
    await persistOfflineInputs(artifactDirectory, capturedRuns, { runs: evidenceRuns });
    return { verificationKeys: fixtureVerificationKeys(fixtures), scenarioRegistry };
  } finally {
    await closeFixtures(fixtures);
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
  generatedAt: string | undefined,
  scenarioRegistry?: ScenarioRegistry,
  captureCoverage: Scorecard['captureCoverage'] = [],
): Promise<EvalResult> {
  assertRunInventory(runs, sampleSize, scenarioRegistry);
  const scorecard = aggregateScorecard(runs, sampleSize, generatedAt, captureCoverage);
  const scorecardPath = resolve(artifactDirectory, 'scorecard.json');
  await Promise.all([
    writeFile(scorecardPath, `${JSON.stringify(scorecard, null, 2)}\n`),
    writeFile(resolve(artifactDirectory, 'runs.json'), `${JSON.stringify(runs, null, 2)}\n`),
  ]);
  enforceLiveFire(runs, scorecard);
  assertEvalPass(scorecard);
  return { scorecard, runs, scorecardPath };
}

export async function persistOfflineInputs(
  artifactDirectory: string,
  runs: RunRecord[],
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
  _captureDirectory: string,
  pin: PinnedDockerEndpoint,
): Promise<FixtureSet> {
  assertPinned(pin);
  // Slice 3 supplies the pinned container construction. This path never calls an in-process starter.
  throw new Error('Composed fixture construction is unavailable until slice 3.');
}
