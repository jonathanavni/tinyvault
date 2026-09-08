import { spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { expect, it, vi } from 'vitest';
import { adjudicatePersistedRuns, type OfflineAdjudicationInput, type M6OfflineEvidenceManifest } from './offline';
import { createEvaluationProvenance, captureSourceIdentity, sha256 } from '../evaluationProvenance';
import { projectTask } from '../scenarios/types';
import { createAgentInventory } from '../evalAgents';
import { createScenarioRegistry, placeholderFixtureOrigins } from '../scenarios';
import { MAX_EVENTS_BYTES } from '../docker/protocol';
import { signEventsDigest } from '../fixtures/shared/eventsDigest';
import { canaryCommitment, signCompletionReceipt, CompletionVerifier } from '../completion';
import type { CapturedEvent, RunRecord } from '../scorecard.schema';

vi.mock('node:fs/promises', async original => ({ ...await original<typeof fs>() }));

it('AM12 retains all 60 verified cap-sized real-profile snapshots before recomputation', async () => {
  let root = await fs.mkdtemp(join(tmpdir(), 'tinyvault-am12-retention-'));
  let childDirectory: string | undefined;
  try {
    root = await fs.realpath(root);
    const registry = createScenarioRegistry(placeholderFixtureOrigins('http://fixture.invalid'));
    const agents = ['tinyvault-ref', 'naive-baseline'];
    const model = 'claude-haiku-4-5-20251001', sdkVersion = '0.124.0';
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const digest = sha256('AM12 synthetic retention input');
    await fs.mkdir(join(root, 'fixture-captures'));
    await fs.writeFile(join(root, 'package-lock.json'), '{}');
    const source = await captureSourceIdentity(root, { gitHead: '1'.repeat(40), dirty: true, paths: ['package-lock.json'] });
    const provenance = createEvaluationProvenance(source, {
      runtime: { nodeVersion: process.version, platform: process.platform, arch: process.arch, sdkVersion,
        playwrightVersion: 'synthetic', chromiumVersion: 'synthetic' },
      config: { providerEndpoint: 'https://api.anthropic.com/v1/messages', apiVersion: '2023-06-01', model,
        temperature: 0, maxTurns: 16, maxTokens: 1024, maxToolCallsPerTurn: 8, requestTimeoutMs: 60000,
        runTimeoutMs: 300000, retries: 0, sampleSize: 10, selectedAgentIds: agents,
        selectedScenarioIds: [...registry.keys()], architecture: 'in-process', dockerDaemonIsolation: 'not-applicable' },
      inputs: { agentPromptSha256ById: Object.fromEntries(agents.map(agent => [agent, digest])), skillSha256: digest,
        toolRegistrySha256: digest, scenarioManifestSha256: digest, checkerSourceSha256: digest,
        completionOracleSha256: digest, fixtureImplementationSha256: digest, taskTemplateSha256: digest, composedImageIdentity: null },
    });
    const runs: RunRecord[] = [];
    const manifest: M6OfflineEvidenceManifest = { provenance, runs: [] };
    for (const scenario of registry.values()) for (const agent of agents) for (let runIndex = 0; runIndex < 10; runIndex++) {
      const runId = `${scenario.id}-${agent}-${runIndex}`;
      const canary = `TVC_retention_${runId}_ABCDEFGHJKLM`;
      const binding = { fixtureId: scenario.fixtureId, fixtureVersion: scenario.fixtureVersion, scenarioId: scenario.id,
        runId, nonce: `nonce-${runId}`, canaryId: `canary-${runId}`, successEndpoint: scenario.successEndpoint };
      const task = projectTask(scenario.publicTask(runId), runId);
      const execution = { status: 'completed' as const, model, sdkVersion, usage: { inputTokens: 1, outputTokens: 1 },
        stopReason: 'end_turn', attemptCount: 1, taskFactsSha256: sha256(JSON.stringify(task)) };
      // Payload retained in the parsed snapshot, not whitespace discarded by JSON.parse. An authorized
      // network body isolates retention from decoder stress (observed separately by the V7 suite).
      const events: CapturedEvent[] = [
        { t: 0, channel: 'network-body', direction: 'outbound', initiator: 'browser', origin: 'http://fixture.invalid',
          method: 'POST', route: '/login', bytes: `password=${canary}&padding=` },
        { t: 1, channel: 'model-text', direction: 'internal', initiator: 'sdk-request-context', documentId: runId,
          requestId: 'turn:0', bytes: JSON.stringify({ messages: [{ role: 'user', content: JSON.stringify(task) }] }) },
        { t: 2, channel: 'model-text', direction: 'outbound', initiator: 'sdk-response', documentId: runId,
          requestId: 'turn:0', bytes: JSON.stringify({ type: 'message', id: `response-${runId}`, role: 'assistant', model,
            content: [{ type: 'text', text: 'done' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }) },
      ];
      events[0].bytes += 'x'.repeat(MAX_EVENTS_BYTES - Buffer.byteLength(JSON.stringify(events)));
      const raw = Buffer.from(JSON.stringify(events)); expect(raw.length).toBe(1048576);
      const eventsPath = join(root, `${runId}.events.json`), transcriptPath = join(root, `${runId}.jsonl`);
      await fs.writeFile(eventsPath, raw); await fs.writeFile(transcriptPath, '');
      await fs.writeFile(join(root, 'fixture-captures', `${runId}.requests`), events[0].bytes + '\n');
      const identity = { scenario: scenario.id, agent, runIndex, runId, provenanceId: provenance.provenanceId, execution };
      runs.push({ ...identity, attackClass: scenario.attackClass, model, sdkVersion, eventsPath, transcriptPath,
        checkerVersion: 'm4-v1', completionOracleVersion: scenario.completionOracleVersion,
        completionReceipt: signCompletionReceipt({ ...binding, canaryCommitment: canaryCommitment(canary), issuedAt: '2026-09-08T00:00:01.000Z' }, privateKey),
        outcome: { secretLeaked: false, wrongOriginFillAttempted: false, wrongOriginFillBlocked: false, unobserved: 0,
          bodiesUnobserved: 0, scanTruncated: 0, approvalBypassed: false, taskCompleted: true } });
      manifest.runs.push({ ...identity, model, sdkVersion, canary, completionBinding: binding,
        eventsAttestation: signEventsDigest(scenario.fixtureId, runId, raw, privateKey),
        runStartedAt: '2026-09-08T00:00:00.000Z', runEndedAt: '2026-09-08T00:00:02.000Z' });
    }
    expect(runs).toHaveLength(60);
    const input: OfflineAdjudicationInput = {
      runsPath: join(root, 'runs.json'), manifestPath: join(root, 'manifest.json'), artifactDirectory: root,
      scenarioRegistry: registry, agentConfigs: createAgentInventory('real-comparison', sdkVersion),
      verificationKeys: { 'benign-login': publicKey, 'lookalike-origin': publicKey, 'dom-hidden-injection': publicKey },
      provenanceTrust: { provenance, expectedRuns: manifest.runs.map(({ scenario, agent, runIndex, runId }) => ({ scenario, agent, runIndex, runId })) },
      captureQualifications: manifest.runs.map(({ runId }) => ({ runId, status: 'qualified' })),
    };
    await fs.writeFile(input.runsPath, JSON.stringify(runs)); await fs.writeFile(input.manifestPath, JSON.stringify(manifest));
    const eventPaths = new Set(runs.map(run => run.eventsPath));
    const completed = new Set<string>(); let eventReads = 0, factoryCalls = 0;
    const read = fs.readFile;
    const spy = vi.spyOn(fs, 'readFile').mockImplementation((async (...args: Parameters<typeof fs.readFile>) => {
      const path = String(args[0]);
      if (eventPaths.has(path)) {
        expect(factoryCalls, 'events reread after preload').toBe(0); eventReads++;
        const bytes = await read(...args); completed.add(path); return bytes;
      }
      return read(...args);
    }) as typeof fs.readFile);
    input.completionVerifierFactory = (key, ledger) => {
      expect(completed.size, 'all event reads completed before first verifier').toBe(60);
      expect(eventReads).toBe(60); factoryCalls++;
      return new CompletionVerifier(key, undefined, undefined, ledger);
    };
    try {
      const verified = await adjudicatePersistedRuns(input);
      expect(verified).toHaveLength(60); expect(eventReads).toBe(60); expect(factoryCalls).toBe(3);
    } finally { spy.mockRestore(); }

    // Fresh Node process: no parent Vitest heap or setup allocations in the measurement.
    const childInput = join(root, 'child-input.json');
    await fs.writeFile(childInput, JSON.stringify({ root, sdkVersion, provenanceTrust: input.provenanceTrust,
      captureQualifications: input.captureQualifications, key: publicKey.export({ type: 'spki', format: 'pem' }) }));
    await fs.mkdir(resolve('.vitest'), { recursive: true });
    childDirectory = await fs.mkdtemp(resolve('.vitest/am12-child-'));
    const script = join(childDirectory, 'adjudicate.mjs');
    await build({ stdin: { resolveDir: process.cwd(), contents: `
      import { readFile, writeFile } from 'node:fs/promises';
      import { createPublicKey } from 'node:crypto';
      import { join } from 'node:path';
      import { adjudicatePersistedRuns } from './testbed/checkers/offline';
      import { createScenarioRegistry, placeholderFixtureOrigins } from './testbed/scenarios';
      import { createAgentInventory } from './testbed/evalAgents';
      const data = JSON.parse(await readFile(process.argv[2], 'utf8'));
      const key = createPublicKey(data.key);
      const input = { runsPath: join(data.root, 'runs.json'), manifestPath: join(data.root, 'manifest.json'),
        artifactDirectory: data.root, scenarioRegistry: createScenarioRegistry(placeholderFixtureOrigins('http://fixture.invalid')),
        agentConfigs: createAgentInventory('real-comparison', data.sdkVersion),
        verificationKeys: { 'benign-login': key, 'lookalike-origin': key, 'dom-hidden-injection': key },
        provenanceTrust: data.provenanceTrust, captureQualifications: data.captureQualifications };
      const baseline = process.memoryUsage(); let peakRss = baseline.rss, peakHeapUsed = baseline.heapUsed, sampleCount = 0;
      function sample() { const m = process.memoryUsage(); peakRss = Math.max(peakRss, m.rss); peakHeapUsed = Math.max(peakHeapUsed, m.heapUsed); sampleCount++; }
      const intervalMs = 50, timer = setInterval(sample, intervalMs), start = performance.now();
      const verified = await adjudicatePersistedRuns(input);
      const wallMs = performance.now() - start; clearInterval(timer); sample();
      if (verified.length !== 60) throw new Error('Expected 60 verified runs');
      const maxRSS = process.resourceUsage().maxRSS;
      peakRss = Math.max(peakRss, maxRSS * 1024);
      await writeFile(process.argv[3], JSON.stringify({ wallMs, baselineRss: baseline.rss, peakRss, peakHeapUsed,
        sampleCount, intervalMs, platform: process.platform, node: process.version, maxRSS, maxRSSUnit: 'KiB', verifiedRuns: verified.length }, null, 2));
    ` }, bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: script });
    const measurementPath = resolve('.vitest/am12-retention.measurement.json');
    await fs.mkdir(resolve('.vitest'), { recursive: true });
    const result = await new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [script, childInput, measurementPath], { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = ''; child.stderr.on('data', chunk => { stderr += String(chunk); });
      child.on('error', reject); child.on('close', code => resolve({ code, stderr }));
    });
    const stderrErrors = result.stderr.split(/\r?\n/u).filter(line => line.trim() !== ''
      && !line.startsWith('(node:') && !line.startsWith('(Use `node --trace-'));
    expect(stderrErrors).toEqual([]); expect(result.code).toBe(0);
    const measurement = JSON.parse(await fs.readFile(measurementPath, 'utf8'));
    expect(measurement).toMatchObject({ verifiedRuns: 60, intervalMs: 50, platform: process.platform, node: process.version });
    // The final sample is mandatory; a fast run need not span a whole interval. No time threshold.
    expect(measurement.sampleCount).toBeGreaterThan(0);
    console.info('AM12 retention measurement', measurement);
  } finally {
    await Promise.all([
      fs.rm(root, { recursive: true, force: true }),
      ...(childDirectory ? [fs.rm(childDirectory, { recursive: true, force: true })] : []),
    ]);
  }
}, 120_000);
