import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { CapturedEvent } from '../scorecard.schema';
import type { ScenarioAuth } from './classify';
import { decodeEvidence } from './leakDecoders';
import { leakScan } from './leakScan';
import { buildSyntheticRunCorpus } from './syntheticCorpus';

const canary = 'TVC_scan_run-1_A234567BCDEF';
const auth: ScenarioAuth = {
  canonicalOrigin: 'https://fixture.test',
  loginEndpoint: { method: 'POST', route: '/login' },
  credentialControl: {
    origin: 'https://fixture.test', frameId: 'top', documentId: 'doc', requestId: 'password',
  },
  secretSources: [{ channel: 'model-text', direction: 'inbound', initiator: 'seeded' }],
};

function percent(value: string): string {
  return [...Buffer.from(value)]
    .map((byte) => `%${byte.toString(16).padStart(2, '0')}`).join('');
}

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

  it('scans the generated 30-run corpus under 200 ms per run', () => {
    // Was: 30 persisted runs read from `artifacts/eval/runs`, which is gitignored and which `make test` never
    // generates — the benchmark passed only on a machine that had already run `make eval` (M5.1). The corpus is
    // generated now, to the same shape; `syntheticCorpus.test.ts` is what keeps that shape honest.
    const corpus = buildSyntheticRunCorpus();
    expect(corpus).toHaveLength(30);
    const started = performance.now();
    const results = corpus.map((run) => leakScan(run.events, canary, auth));
    const elapsedMs = performance.now() - started;
    console.info(`Generated run corpus timing: ${elapsedMs.toFixed(2)} ms over ${corpus.length} runs`);
    // 200 ms per run (a 5 KB model-context event now gets ~5k candidates under the size-scaled budget, M5-M1).
    expect(elapsedMs).toBeLessThan(200 * corpus.length);
    expect(results.every((result) => result.secretLeaked === false)).toBe(true);
  });

  it('finds one planted leak in a 30 x 200-event corpus under two seconds', () => {
    const syntheticRuns = Array.from({ length: 30 }, (_, runIndex) =>
      Array.from({ length: 200 }, (_, eventIndex): CapturedEvent => ({
        t: eventIndex,
        channel: 'log',
        direction: 'outbound',
        initiator: 'synthetic-performance-control',
        requestId: `run-${runIndex}-event-${eventIndex}`,
        bytes: runIndex === 29 && eventIndex === 199
          ? Buffer.from(percent(canary)).toString('base64')
          : `ordinary canary-free testbed evidence payload ${runIndex}-${eventIndex}`,
      })));
    const syntheticStarted = performance.now();
    const syntheticResults = syntheticRuns.map((events) => leakScan(events, canary, auth));
    const syntheticElapsedMs = performance.now() - syntheticStarted;
    console.info(`Synthetic 30x200 corpus timing: ${syntheticElapsedMs.toFixed(2)} ms`);
    expect(syntheticResults.filter((result) => result.secretLeaked)).toHaveLength(1);
    expect(syntheticResults[29]).toMatchObject({
      secretLeaked: true, leakChannel: 'log',
    });
    expect(syntheticElapsedMs).toBeLessThan(2000);
  });

  /** One 55 KB run-shaped junk event: ~2,048 base64-shaped leaves, the ordering lever the decoder budget counts. */
  function junkEvent(leaves: number, index: number): CapturedEvent {
    const bytes = JSON.stringify(Array.from({ length: leaves }, (_, leafIndex) =>
      Buffer.concat([Buffer.from([(leafIndex >>> 8) & 0xff, leafIndex & 0xff]), randomBytes(16)])
        .toString('base64')));
    return {
      t: index,
      channel: 'model-text',
      direction: 'outbound',
      initiator: 'zlib-work-budget-control',
      requestId: `junk-${index}`,
      bytes,
    };
  }

  it('bounds run-shaped junk-base64 zlib work per event in time and retained ArrayBuffers', () => {
    const tenEvents = Array.from({ length: 10 }, (_, index) => junkEvent(2_048, index));
    const before = process.memoryUsage().arrayBuffers;
    const started = performance.now();
    const result = leakScan(tenEvents, canary, auth);
    const elapsedMs = performance.now() - started;
    const arrayBufferGrowth = Math.max(0, process.memoryUsage().arrayBuffers - before);
    console.info(
      `Junk-base64 10x2048 timing: ${elapsedMs.toFixed(2)} ms; arrayBuffers +${arrayBufferGrowth}`,
    );
    expect(result.secretLeaked).toBe(false);
    // Ten 55 KB junk events are scanned in full under the size-scaled candidate budget (≈ 55k each; merge
    // finding M5-M1) — ~280 ms per event, bounded by decoded bytes, never wall-clock.
    expect(elapsedMs).toBeLessThan(4000);
    expect(arrayBufferGrowth).toBeLessThan(256 * 1024 * 1024);
  });

  // Split out of the benchmark above at M5.1. The two lived in one test under a single 60 s timeout, and after the
  // M5-M1 size-scaled budget raised the per-event cost to ~280 ms the 200-event scan ran 200 x 280 ms against that
  // cap: `make test` was red on its own clock. The fix is a bound of its own, not a bigger timeout — so the scan
  // keeps its 200 events, drops to a per-event size the count claim does not depend on, and asserts the two
  // properties the count was there for: no fabricated leak at scale, and budgets that stay per-event.
  it('keeps a 200-event junk scan leak-free, per-event budgeted, and linear in event count', () => {
    const leaves = 256;
    const scan = (count: number): { result: ReturnType<typeof leakScan>; elapsedMs: number } => {
      const events = Array.from({ length: count }, (_, index) => junkEvent(leaves, index));
      const started = performance.now();
      const result = leakScan(events, canary, auth);
      return { result, elapsedMs: performance.now() - started };
    };

    scan(4);                                   // warm the decoders so the ratio below measures work, not JIT
    const one = scan(1);
    const small = scan(20);
    const full = scan(200);
    console.info(
      `Junk-base64 200x${leaves} timing: ${full.elapsedMs.toFixed(2)} ms `
      + `(20 events: ${small.elapsedMs.toFixed(2)} ms; ratio ${(full.elapsedMs / small.elapsedMs).toFixed(2)})`,
    );

    // Run-shaped junk exhausts its own per-event budget at any size past ~1.7 KB, so `truncated` is the declared,
    // counted state here — not a defect. The claim under test is that it is driven by the EVENT and not by the
    // scan: one event of this payload must return exactly what two hundred do. A budget that accumulated across
    // the scan instead of resetting per event would make the 200-event result diverge from the single-event one.
    expect(one.result).toEqual({ secretLeaked: false, truncated: true });
    expect(small.result).toEqual(one.result);
    expect(full.result).toEqual(one.result);
    // Ten times the events for no more than fifteen times the work: the cost is linear in event count. A scan that
    // grew superlinearly (cross-referencing events, or retaining per-event state) lands near 100x and goes red.
    expect(full.elapsedMs).toBeLessThan(small.elapsedMs * 15);
  }, 45_000);
});
