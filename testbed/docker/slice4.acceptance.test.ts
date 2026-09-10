import type { KeyObject } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { CAPABILITY_OPS, FIXTURE_IDS } from './protocol';
import { realEvidence, setupFor, loginFor, artifactBytes } from './slice4.testkit';
import { assertClean, assertProbeWindow, IntegrationEvidence } from './integrationEvidence';
import { captureFixtureSnapshot, readFixturePublicKey, trackFixtureRequest } from '../fixtures/shared/loginFixture';
import { controlTokenFor } from '../scenarios/benignLoginConstants';
import { capturePersistedRuns, offlineArtifactPaths } from '../runner';
import { adjudicatePersistedRuns } from '../checkers/offline';
import { AGENT_CONFIGS } from '../evalAgents';
import { launchChromium } from '../../src/browser/playwright';

// Shared mocked signer partitions these sink tests from fixture-key independence tests.
const known = vi.hoisted(() => ({ pair: undefined as { privateKey: KeyObject; publicKey: KeyObject } | undefined }));
vi.mock('node:crypto', async (original) => {
  const crypto = await original<typeof import('node:crypto')>();
  known.pair = crypto.generateKeyPairSync('ed25519');
  return { ...crypto, generateKeyPairSync: () => known.pair };
});

it.each(['register', ...CAPABILITY_OPS])('hostile attribution %s produces zero settled primitive and wire deltas on every page path', async (op) => {
  const h = await realEvidence(vi.fn);
  try {
    for (const [i, id] of FIXTURE_IDS.entries()) {
      const fixture = h.set[id]; const actual = h.fixtures[i];
      await fixture.registerRun(setupFor('A')); await fixture.registerRun(setupFor('B'));
      const attribution = new URLSearchParams({ runId: 'A', op, capability: controlTokenFor('A', setupFor('A').nonce),
        receipt: 'page', capture: 'page', attest: 'page', key: 'page', finalize: 'page', ack: 'page' }).toString();
      const paths = [
        { label: 'canonical-page-query', path: '/login?' + attribution, method: 'GET' },
        { label: 'canonical-control-form', path: '/control', method: 'POST', body: attribution },
        { label: 'query-attribution', path: '/probe?' + attribution, method: 'POST', body: 'password=wrong' },
        { label: 'form-attribution', path: '/probe', method: 'POST', body: attribution },
        { label: 'login-validation', path: '/login', method: 'POST', body: attribution + '&password=wrong' },
        { label: 'active-login', path: '/login', method: 'POST', body: loginFor('A') },
      ];
      for (const path of paths) {
        await h.settle(); const before = h.snapshot();
        const response = await fetch(new URL(path.path, actual.origin), { method: path.method, body: path.body, redirect: 'manual' });
        h.surfaces.push(Buffer.from(response.url), Buffer.from(JSON.stringify([...response.headers])), Buffer.from(await response.arrayBuffer()));
        await h.settle();
        expect(h.snapshot(), `zero-admin-delta:${id}:${path.label}:${op}`).toEqual(before);
      }
      if (id === 'lookalike-origin') {
        const actualLookalike = h.fixtures[1];
        for (const path of ['/?' + attribution, '/login?' + attribution]) {
          const before = h.snapshot();
          const response = await fetch(actualLookalike.lookalikeOrigin + path, path.startsWith('/login')
            ? { method: 'POST', body: attribution, redirect: 'manual' } : { redirect: 'manual' });
          h.surfaces.push(Buffer.from(response.url), Buffer.from(JSON.stringify([...response.headers])), Buffer.from(await response.arrayBuffer()));
          await h.settle();
          expect(h.snapshot(), `zero-admin-delta:lookalike:L-to-C:${op}`).toEqual(before);
        }
      }
      const receipt = await fixture.takeReceipt('A'); expect(receipt).toBeDefined();
      expect(await fixture.takeReceipt('A')).toBe(receipt);
      await fixture.finalizeRun('A');
      expect(Buffer.from(await fixture.captureRequests('A')).toString()).toBe(loginFor('A') + '\n');
      await fixture.attestEvents('A', Buffer.from('[]')); await fixture.acknowledgeReceipt('A');
      expect(await actual.takeReceipt('A')).toBeUndefined();
      for (const operation of ['register', ...CAPABILITY_OPS]) expect(h.snapshot().entries[i], `positive administrative snapshot:${operation}`).toContain(operation);
    }
    for (const surface of [...h.surfaces, ...await artifactBytes(h.directory)]) assertClean(surface, h.evidence.secrets);
    await h.set['benign-login'].close();
  } finally { await h.dispose(); }
});
it.each(['register', ...CAPABILITY_OPS])('primitive observation includes rejected %s entry independently of control wire', async (op) => {
  const h = await realEvidence(vi.fn);
  try {
    const fixture = h.fixtures[0]; const before = h.snapshot();
    const calls = {
      register: () => fixture.registerRun(setupFor('../invalid')),
      receipt: () => fixture.takeReceipt('unknown'), capture: () => captureFixtureSnapshot(fixture, 'unknown', 'requests'),
      attest: () => fixture.attestEvents('unknown', Buffer.from('[]')), key: () => readFixturePublicKey(fixture, 'unknown'),
      finalize: () => fixture.finalizeRun('unknown'), ack: () => fixture.acknowledgeReceipt('unknown'),
    };
    await expect(calls[op as keyof typeof calls]()).rejects.toBeDefined();
    expect(h.snapshot().entries[0], `snapshot observes rejected primitive:${op}`).toEqual([...before.entries[0], op]);
    expect(h.snapshot().wire, 'rejected direct primitive has no wire delta').toEqual(before.wire);
  } finally { await h.dispose(); }
});
it('snapshot sees authorized key on primitive request and response projections', async () => {
  const h = await realEvidence(vi.fn);
  try {
    await h.set['benign-login'].registerRun(setupFor('A'));
    const before = h.snapshot();
    const bridge = h.evidence.bridges[0];
    const frame = bridge.responses.find((f) => f.op === 'register');
    if (!frame || frame.kind !== 'res' || !frame.ok) throw new Error('register');
    // Dispatch through the same client used by the composed fixture (captured actual hello instance).
    const clients: import('./bridge').BridgeSession[] = [];
    const { BridgeSession } = await import('./bridge');
    const request = BridgeSession.prototype.request;
    const spy = vi.spyOn(BridgeSession.prototype, 'request').mockImplementation(function (this: import('./bridge').BridgeSession, ...args) {
      clients.push(this); return request.apply(this, args);
    });
    try {
      await h.set['benign-login'].takeReceipt('A');
      const ready = h.snapshot();
      await clients[0].request('key', { epoch: h.evidence.epoch, fixtureId: 'benign-login', runId: 'A', capability: frame.body.key });
      const after = h.snapshot();
      expect(after.entries[0], 'snapshot authorized key primitive').toEqual([...ready.entries[0], 'key']);
      expect(after.wire[0].requests.length, 'snapshot authorized key request').toBe(ready.wire[0].requests.length + 1);
      expect(after.wire[0].responses.length, 'snapshot authorized key response').toBe(ready.wire[0].responses.length + 1);
      expect(after).not.toEqual(before);
    } finally { spy.mockRestore(); }
  } finally { await h.dispose(); }
});
it.each(['canonical', 'lookalike'] as const)('rendered control-token reuse is detected as secret-exposed on real %s page', async (surface) => {
  const h = await realEvidence(vi.fn);
  try {
    const fixture = h.set['lookalike-origin']; await fixture.registerRun(setupFor('predictable'));
    const url = surface === 'canonical' ? h.fixtures[1].origin + '/login' : h.fixtures[1].lookalikeOrigin + '/';
    const response = await fetch(url + '?runId=predictable'); const body = await response.text();
    // Public rendered nonce is not a capability in the control; the production recycled-token mutant
    // must reach this actual page artifact and production closer, not stop at base64url validation.
    await writeFile(join(h.root, 'page-evidence'), body);
    expect(body).toContain(controlTokenFor('predictable', setupFor('predictable').nonce));
    await expect(fixture.close()).resolves.toBeUndefined();
  } finally { await h.dispose(); }
});
it('composed capturePersistedRuns closes the real browser then persists exact authorized bytes for offline adjudication', async () => {
  const h = await realEvidence(vi.fn, { fixedPorts: true });
  // The preparatory facade owns a separate control session. Close it before fresh runner construction;
  // the real fixture data plane has not registered any runs and remains alive.
  await h.set['benign-login'].close();
  const runnerEvidence = new IntegrationEvidence(h.runner);
  const closeCodes: number[] = [];
  let launches = 0;
  try {
    const trust = await capturePersistedRuns(h.root, 1, undefined, { architecture: 'composed',
      dockerPreflight: async () => h.options.pin, dockerRunner: runnerEvidence.runner, probeOrigin: async (origin) => (await fetch(origin)).ok,
      launchChromium: async () => { launches++; const browser = await launchChromium();
        const newContext = browser.newContext.bind(browser);
        vi.spyOn(browser, 'newContext').mockImplementation(async (...args) => { const context = await newContext(...args);
          context.on('response', (response) => { if (response.status() === 409) closeCodes.push(409); }); return context; });
        return browser; },
    });
    expect(launches).toBe(1); expect(closeCodes).toEqual([]);
    expect(runnerEvidence.secrets).toHaveLength(21);
    const der = Buffer.from(known.pair!.privateKey.export({ format: 'der', type: 'pkcs8' }));
    const privateForms = [der, der.subarray(-32), Buffer.from(der.toString('base64')), Buffer.from(der.toString('base64url')),
      Buffer.from(known.pair!.privateKey.export({ format: 'pem', type: 'pkcs8' }))];
    for (const surface of await artifactBytes(h.root)) assertClean(surface, [...runnerEvidence.secrets, ...privateForms]);
    const paths = offlineArtifactPaths(h.root);
    const captured = JSON.parse(await readFile(paths.capturedRunsPath, 'utf8'));
    const runs = await adjudicatePersistedRuns({ ...paths, runsPath: paths.capturedRunsPath, manifestPath: paths.manifestPath,
      artifactDirectory: h.root, verificationKeys: trust.verificationKeys, scenarioRegistry: trust.scenarioRegistry, agentConfigs: AGENT_CONFIGS });
    expect(runs).toHaveLength(5); expect(runs.every((r) => r.outcome.taskCompleted && !r.outcome.secretLeaked)).toBe(true);
    for (const [i, id] of FIXTURE_IDS.entries()) {
      const scenario = [...trust.scenarioRegistry.values()].find((s) => s.fixtureId === id)!;
      const runId = `${scenario.id}-stub-00`;
      const exact = await captureFixtureSnapshot(h.fixtures[i], runId, 'requests');
      expect(exact.length).toBeGreaterThan(0);
      expect(await readFile(join(h.root, 'fixture-captures', runId + '.requests'))).toEqual(Buffer.from(exact));
      expect(h.entries[i]).not.toContain('ack');
    }
    expect(captured).toHaveLength(5);
  } finally { await runnerEvidence.finish(); await h.dispose(); vi.restoreAllMocks(); }
}, 60000);

it('observation barrier waits for admitted fire-and-discard work without finalizing a run', async () => {
  const h = await realEvidence(vi.fn); let release!: () => void;
  try {
    await h.set['benign-login'].registerRun(setupFor('A'));
    const before = h.snapshot();
    const pending = trackFixtureRequest(h.fixtures[0], async () => {
      await new Promise<void>((resolve) => { release = resolve; });
      await h.fixtures[0].takeReceipt('A');
    });
    let settled = false; const barrier = h.settle().then(() => { settled = true; });
    void barrier.catch(() => {}); // Attach rejection handling immediately; the awaited barrier still fails the test.
    await new Promise((resolve) => setTimeout(resolve, 10)); expect(settled).toBe(false);
    release(); await pending; await barrier; expect(settled).toBe(true);
    expect(h.snapshot().entries[0], 'settled admitted direct receipt observed').toEqual([...before.entries[0], 'receipt']);
    expect(await h.set['benign-login'].submitLogin(loginFor('A'))).toBe(303);
  } finally { release?.(); await h.dispose(); }
});
