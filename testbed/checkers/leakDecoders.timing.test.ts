import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { CapturedEvent } from '../scorecard.schema';
import type { ScenarioAuth } from './classify';
import { decodeEvidence } from './leakDecoders';
import { leakScan } from './leakScan';

const canary = 'TVC_scan_run-1_A234567BCDEF';
const auth: ScenarioAuth = {
  canonicalOrigin: 'https://fixture.test',
  loginEndpoint: { method: 'POST', route: '/login' },
  credentialControl: {
    origin: 'https://fixture.test', frameId: 'top', documentId: 'doc', requestId: 'password',
  },
  secretSources: [{ channel: 'model-text', direction: 'inbound', initiator: 'seeded' }],
};

describe('evidence decoder serial timing gates', () => {
  it('scans a pathological 1 MiB separator body under 200 ms', () => {
    const repeatedPrefix = [...canary].join('#').slice(0, -1);
    const body = repeatedPrefix.repeat(Math.ceil((1024 * 1024) / repeatedPrefix.length))
      .slice(0, 1024 * 1024);
    const started = performance.now();
    const candidates = decodeEvidence(body, canary);
    const elapsedMs = performance.now() - started;
    console.info(`Separator pathological 1 MiB timing: ${elapsedMs.toFixed(2)} ms`);
    expect(candidates.some((candidate) => candidate.decoder === 'separators')).toBe(false);
    expect(elapsedMs).toBeLessThan(200);
  });

  it('invokes leakScan over the artifact and synthetic corpora under two seconds each', () => {
    const runsDirectory = join(process.cwd(), 'artifacts', 'eval', 'runs');
    const artifactPaths = existsSync(runsDirectory)
      ? readdirSync(runsDirectory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(runsDirectory, entry.name, 'events.json'))
        .filter(existsSync)
      : [];
    expect(artifactPaths).toHaveLength(10);
    const artifactStarted = performance.now();
    const artifactResults = artifactPaths.map((path) => leakScan(
      JSON.parse(readFileSync(path, 'utf8')) as CapturedEvent[], canary, auth,
    ));
    const artifactElapsedMs = performance.now() - artifactStarted;
    console.info(`Artifact corpus timing: ${artifactElapsedMs.toFixed(2)} ms`);
    expect(artifactResults).toHaveLength(artifactPaths.length);
    expect(artifactElapsedMs).toBeLessThan(2000);

    const syntheticRuns = Array.from({ length: 30 }, (_, runIndex) =>
      Array.from({ length: 200 }, (_, eventIndex): CapturedEvent => ({
        t: eventIndex,
        channel: 'log',
        direction: 'outbound',
        initiator: 'synthetic-performance-control',
        requestId: `run-${runIndex}-event-${eventIndex}`,
        bytes: `ordinary canary-free testbed evidence payload ${runIndex}-${eventIndex}`,
      })));
    const syntheticStarted = performance.now();
    const syntheticResults = syntheticRuns.map((events) => leakScan(events, canary, auth));
    const syntheticElapsedMs = performance.now() - syntheticStarted;
    console.info(`Synthetic 30x200 corpus timing: ${syntheticElapsedMs.toFixed(2)} ms`);
    expect(syntheticResults).toHaveLength(30);
    expect(syntheticElapsedMs).toBeLessThan(2000);
  });
});
