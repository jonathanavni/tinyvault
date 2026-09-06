// Trusted test harness: real shared HTTP fixtures and control peers, injected Docker descriptions.
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startBenignLoginFixture } from '../fixtures/benign-login/server';
import { startLookalikeOriginFixture } from '../fixtures/lookalike-origin';
import { startDomHiddenInjectionFixture } from '../fixtures/dom-hidden-injection';
import { observeFixtureAdministration, settleFixtureObservation } from '../fixtures/shared/loginFixture';
import { BENIGN_USERNAME } from '../scenarios/benignLoginConstants';
import { fakeProject } from './compose.testkit';
import { IntegrationEvidence } from './integrationEvidence';
import { startComposedFixtureSet } from './composedFixtures';
import { FIXTURE_IDS } from './protocol';
import type { FixtureTransport } from '../fixtures/transport';

// Preserve Buffer/typed-array writes exactly; string writes use Node's requested encoding.
export function writerBytes(value: unknown, encoding?: unknown): Buffer {
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from(String(value), typeof encoding === 'string' ? encoding as BufferEncoding : 'utf8');
}
export const setupFor = (runId: string) => ({ scenarioId: 'slice4', runId, nonce: `nonce-${runId}`,
  canaryId: `canary-${runId}`, canary: `secret-${runId}` });
export const loginFor = (runId: string) => new URLSearchParams({ runId, username: BENIGN_USERNAME,
  password: setupFor(runId).canary }).toString();
export async function artifactBytes(root: string): Promise<Buffer[]> {
  const bytes: Buffer[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) bytes.push(...await artifactBytes(path));
    else bytes.push(await readFile(path));
  }
  return bytes;
}
export async function realEvidence(spyFactory: Parameters<typeof fakeProject>[0], options: { fixedPorts?: boolean } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'tinyvault-slice4-'));
  // fixedPorts requires 47110/47120/47121/47130 free; run serially with all live Docker/browser suites.
  // Real peer origins are topology-pinned; bind refusal must remain fail-closed.
  const listen = (i: number) => options.fixedPorts ? { port: [47110, 47120, 47130][i], onListenPermissionError: 'fail' as const } : { onListenPermissionError: 'fail' as const };
  const fixtures = await Promise.all([startBenignLoginFixture(join(directory, 'a'), listen(0)),
    startLookalikeOriginFixture(join(directory, 'b'), { ...listen(1), ...(options.fixedPorts ? { lookalike: { port: 47121 } } : {}) }),
    startDomHiddenInjectionFixture(join(directory, 'c'), listen(2))]);
  const entries = fixtures.map((fixture) => {
    const calls: string[] = []; observeFixtureAdministration(fixture, (op) => calls.push(op)); return calls;
  });
  const h = await fakeProject(spyFactory, { fixtures, evidence: true });
  const evidence = new IntegrationEvidence(h.runner);
  const surfaces: Buffer[] = [];
  const http: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const i = ['47110', '47120', '47130'].indexOf(url.port);
    if (i < 0) throw new Error('fixture');
    const actual = new URL(url.pathname + url.search, fixtures[i].origin);
    const response = await fetch(actual, init);
    surfaces.push(Buffer.from(actual.toString()), Buffer.from(JSON.stringify([...response.headers])), Buffer.from(await response.clone().arrayBuffer()));
    return response;
  };
  const set = await startComposedFixtureSet({ ...h.options, runner: evidence.runner, fetch: http });
  const snapshot = () => ({ entries: entries.map((e) => [...e]), wire: evidence.bridges.map((b) => ({ requests: [...b.requests],
    responses: b.responses.map((f) => `${f.id}:${f.kind}:${f.op}`), errors: [...b.errors] })) });
  const settle = async () => { await Promise.all(fixtures.map(settleFixtureObservation)); };
  const dispose = async () => {
    await Promise.allSettled(Object.values(set).map((f) => f.close()));
    await Promise.allSettled(fixtures.map((f) => f.close()));
    await evidence.finish(); await h.dispose(); await rm(directory, { recursive: true, force: true });
  };
  return { ...h, directory, evidence, fixtures, set: set as Record<typeof FIXTURE_IDS[number], FixtureTransport>, entries, surfaces, snapshot, settle, dispose };
}
