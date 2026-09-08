import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { EVIDENCE_DECODER_LIMITS, type EventWork } from './leakDecoders';
import { leakScan } from './leakScan';
import { buildSyntheticRunCorpus } from './syntheticCorpus';
import { classify, type ScenarioAuth } from './classify';
import { MAX_EVENTS_BYTES } from '../docker/protocol';

const observed = vi.hoisted(() => [] as EventWork[]);
vi.mock('./leakDecoders', async original => {
  const actual = await original<typeof import('./leakDecoders')>();
  return { ...actual, createEventWork: (inputBytes?: number) => {
    const work = actual.createEventWork(inputBytes); observed.push(work); return work;
  } };
});

// Observation only; intentionally outside the serial timing benchmark and its pinned corpus.
it('AM12 observes per-event decoder budgets in a near-cap synthetic run', async () => {
  const run = buildSyntheticRunCorpus().find(run => run.cell === 'dom-hidden-injection')!;
  const auth: ScenarioAuth = { canonicalOrigin: 'https://fixture.test',
    loginEndpoint: { method: 'POST', route: '/login' },
    credentialControl: { origin: 'https://fixture.test', frameId: 'top', documentId: 'doc', requestId: 'password' },
    secretSources: [{ channel: 'model-text', direction: 'inbound', initiator: 'seeded' }] };
  const event = run.events.filter(event => event.initiator === 'model-context').at(-1)!;
  const context = JSON.parse(event.bytes);
  // Distinct gzip/zlib-shaped and raw-DEFLATE candidate leaves exercise the fixed inflate budgets.
  // Preserve all generated calls/results/history and add stress leaves only to the last context.
  context.am12DecodeStress = Array.from({ length: 1400 }, (_, index) => Buffer.concat([
    Buffer.from(index % 2 ? [0x78, 0x9c] : [0x1f, 0x8b, 0x08]),
    createHash('sha256').update(`am12-${index}`).digest(),
  ]).toString('base64'));
  context.am12Padding = '';
  event.bytes = JSON.stringify(context);
  const spare = MAX_EVENTS_BYTES - 1 - Buffer.byteLength(JSON.stringify(run.events));
  expect(spare).toBeGreaterThan(0);
  context.am12Padding = 'x'.repeat(spare); event.bytes = JSON.stringify(context);
  const rawBytes = Buffer.byteLength(JSON.stringify(run.events));
  expect(rawBytes).toBe(1048575);
  observed.length = 0;
  const result = leakScan(run.events, 'TVC_am12_absent_ABCDEFGHJKLM', auth);
  expect(result.secretLeaked).toBe(false);
  const unauthorized = run.events.filter(event => classify(event, auth) === 'unauthorized-sink');
  expect(observed).toHaveLength(unauthorized.length);
  const counters = observed.map((work, index) => ({ index, t: unauthorized[index].t,
    initiator: unauthorized[index].initiator, inputBytes: Buffer.byteLength(unauthorized[index].bytes),
    candidates: work.candidates, candidateBudget: work.candidateBudget,
    candidateLimitHit: work.candidates >= work.candidateBudget,
    wrapperInflateTrials: work.wrapperInflateTrials,
    wrapperLimitHit: work.wrapperInflateTrials >= EVIDENCE_DECODER_LIMITS.wrapperInflateTrialsPerEvent,
    rawInflateTrials: work.rawInflateTrials,
    rawLimitHit: work.rawInflateTrials >= EVIDENCE_DECODER_LIMITS.rawInflateTrialsPerEvent }));
  // No counter is added to the production result or persisted scorecard contracts.
  const measurement = { rawBytes, truncated: result.truncated === true, events: counters,
    exhaustionCounts: { candidate: counters.filter(row => row.candidateLimitHit).length,
      wrapper: counters.filter(row => row.wrapperLimitHit).length, raw: counters.filter(row => row.rawLimitHit).length } };
  await mkdir(resolve('.vitest'), { recursive: true });
  await writeFile(resolve('.vitest/am12-decoders.measurement.json'), JSON.stringify(measurement, null, 2));
  console.info('AM12 decoder observation', measurement);
}, 30_000);
