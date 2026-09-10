import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from '../../src/browser/playwright';
import { capturePersistedRuns, offlineArtifactPaths, type EvalTrust } from '../runner';
import { AGENT_CONFIGS } from '../evalAgents';
import { createScenarioRegistry, placeholderFixtureOrigins } from '../scenarios';
import { adjudicatePersistedRuns, type OfflineEvidenceManifest } from '../checkers/offline';
import type { RunRecord } from '../scorecard.schema';
import type { DockerProcessRunner } from '../docker/exec';
import type { PinnedDockerEndpoint } from '../docker/preflight';
import { createParityCollector } from './observe';
import type { ParityRunIdentity, ParityRunSnapshot } from './types';
import { parityFailure, readArtifactInventory, type ArtifactInventory } from './vault';

export type ParityBundle = Readonly<{
  root: string; architecture: 'in-process' | 'composed'; observed: boolean;
  trust: EvalTrust; snapshots: readonly ParityRunSnapshot[]; artifacts: ArtifactInventory;
  runs: RunRecord[]; manifest: OfflineEvidenceManifest; adjudicated: RunRecord[];
  timing: { captureMs: number; totalMs: number };
  browser: { version: string; options: { headless: true; args: readonly string[] } };
  destroy(): Promise<void>;
}>;
export function expectedParityRuns(): readonly ParityRunIdentity[] {
  return [...createScenarioRegistry(placeholderFixtureOrigins('http://inventory.invalid')).values()]
    .flatMap((scenario) => [...AGENT_CONFIGS.keys()].flatMap((agent) => [0, 1].map((runIndex) => ({ scenario: scenario.id, agent, runIndex }))));
}
export function assertParityIdentities(values: readonly ParityRunIdentity[], expected = expectedParityRuns()): void {
  const key = (item: ParityRunIdentity) => JSON.stringify([item.scenario, item.agent, item.runIndex]);
  if (!Array.isArray(values) || values.length !== expected.length || new Set(values.map(key)).size !== values.length
    || expected.some((item) => !values.some((other) => key(item) === key(other)))) parityFailure('run-inventory');
}

/** Architecture is positional and closed. No generic CaptureOptions escape hatch. */
export async function captureParityBundle(architecture: 'in-process' | 'composed',
  settings: { wire?: boolean; dockerRunner?: DockerProcessRunner; dockerPin?: PinnedDockerEndpoint } = {}): Promise<ParityBundle> {
  if (architecture !== 'in-process' && architecture !== 'composed') parityFailure('architecture');
  if (Object.keys(settings).some((key) => !['wire', 'dockerRunner', 'dockerPin'].includes(key))
    || (settings.wire !== undefined && typeof settings.wire !== 'boolean')
    || (architecture === 'in-process' && (settings.dockerRunner || settings.dockerPin))
    || (architecture === 'composed' && settings.wire === false)) parityFailure('capture-options');
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tinyvault-parity-')));
  const started = performance.now(); const collector = createParityCollector(expectedParityRuns(), { wire: settings.wire ?? true });
  let firstBegin: number | undefined; let lastEnd: number | undefined; let browserVersion: string | undefined; let capturedArtifacts: ArtifactInventory | undefined;
  try {
    const trust = await capturePersistedRuns(root, 2, undefined, { architecture,
      launchChromium: async () => { const browser = await launchChromium(); browserVersion = browser.version(); return browser; },
      ...(architecture === 'composed' ? { dockerRunner: settings.dockerRunner,
        ...(settings.dockerPin ? { dockerPreflight: async () => settings.dockerPin! } : {}) } : {}),
      parityObserver: {
        captureStarted() { if (firstBegin !== undefined || lastEnd !== undefined) parityFailure('capture-start-duplicate'); firstBegin = performance.now(); },
        captureCompleted() { if (firstBegin === undefined || lastEnd !== undefined) parityFailure('capture-complete-order'); lastEnd = performance.now(); },
        beginRun(descriptor, browser) { return collector.beginRun(descriptor, browser); },
        async endRun(descriptor) { await collector.endRun(descriptor); },
        collectUnauthorized(descriptor, requests) { collector.collectUnauthorized(descriptor, requests); },
        snapshots: () => collector.snapshots(),
      },
    });
    if (!browserVersion || firstBegin === undefined || lastEnd === undefined || lastEnd < firstBegin || lastEnd - firstBegin > 60000) parityFailure('capture-budget');
    const snapshots = collector.snapshots(); assertParityIdentities(snapshots.map((entry) => entry.descriptor));
    const fixtureIds = ['benign-login', 'lookalike-origin', 'dom-hidden-injection', 'secret-echo', 'fake-reauth'];
    if (Object.keys(trust.provenance).length !== 5 || Object.keys(trust.verificationKeys).length !== 5
      || fixtureIds.some((id) => !Object.hasOwn(trust.provenance, id) || !Object.hasOwn(trust.verificationKeys, id))) parityFailure('provenance-inventory');
    for (const provenance of Object.values(trust.provenance)) {
      if (provenance.architecture !== architecture || provenance.reachability !== 'http') parityFailure('provenance-architecture');
    }
    const artifacts = await readArtifactInventory(root, snapshots, architecture); capturedArtifacts = artifacts;
    const runs = JSON.parse(artifacts.files.get('runs.captured.json')!.toString('utf8')) as RunRecord[];
    const manifest = JSON.parse(artifacts.files.get('offline-evidence.json')!.toString('utf8')) as OfflineEvidenceManifest;
    assertParityIdentities(runs); assertParityIdentities(manifest.runs);
    const paths = offlineArtifactPaths(root);
    const adjudicated = await adjudicatePersistedRuns({ runsPath: paths.capturedRunsPath, manifestPath: paths.manifestPath,
      artifactDirectory: root, verificationKeys: trust.verificationKeys, scenarioRegistry: trust.scenarioRegistry, agentConfigs: AGENT_CONFIGS });
    if (adjudicated.length !== 10 || adjudicated.some((run) => !run.outcome.taskCompleted || run.outcome.secretLeaked)) parityFailure('adjudication');
    return { root, architecture, observed: settings.wire ?? true, trust, snapshots, artifacts, runs, manifest, adjudicated,
      timing: { captureMs: lastEnd - firstBegin, totalMs: performance.now() - started },
      browser: { version: browserVersion, options: { headless: true, args: ['--disable-back-forward-cache'] } },
      async destroy() { for (const bytes of artifacts.files.values()) bytes.fill(0); await rm(root, { recursive: true, force: true }); },
    };
  } catch (error) {
    // Failed evidence remains in its unique root for the owner to inspect/dispose. Never print bytes.
    if (capturedArtifacts) for (const bytes of capturedArtifacts.files.values()) bytes.fill(0);
    const failure = new Error(error instanceof Error && /^Parity (?:[a-z-]+|observation failed: [a-z-]+)$/.test(error.message) ? error.message : 'Parity capture-failed');
    Object.defineProperty(failure, 'artifactRoot', { value: root }); throw failure;
  }
}
