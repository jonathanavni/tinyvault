import { startSecretEchoFixture } from '../fixtures/secret-echo';
import { startFakeReauthFixture } from '../fixtures/fake-reauth';
import { MAX_EVENTS_BYTES } from './protocol';
// Reachability comes from an injected probe; data-plane requests and completion use the authenticated key.
import { readFile } from 'node:fs/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { signCompletionReceipt } from '../completion';
import { startComposedFixtureSet } from './composedFixtures';
import { fakeProject, pair } from './compose.testkit';
import * as dockerExec from './exec';
const disposals: (() => Promise<void>)[] = [];
afterEach(async () => { for (const dispose of disposals.splice(0)) await dispose(); vi.restoreAllMocks(); });
it('reachable positive returns exactly five composed HTTP transports with the authenticated key', async () => {
  const h = await fakeProject(vi.fn); disposals.push(h.dispose);
  const http = vi.fn(async () => new Response('page', { status: 202 }));
  const set = await startComposedFixtureSet({ ...h.options, fetch: http });
  expect(Object.keys(set)).toEqual(['benign-login', 'lookalike-origin', 'dom-hidden-injection', 'secret-echo', 'fake-reauth']);
  expect(h.options.probeOrigin).toHaveBeenCalledTimes(5);
  for (const fixture of Object.values(set)) {
    expect(fixture).toMatchObject({ architecture: 'composed', reachability: 'http' });
    expect(fixture.verificationPublicKey.export({ type: 'spki', format: 'der' })).toEqual(pair.publicKey.export({ type: 'spki', format: 'der' }));
    expect(await fixture.getLoginPage('a&b')).toBe('page');
    expect(http).toHaveBeenLastCalledWith(`${fixture.origin}/?runId=a%26b`, undefined);
    expect(await fixture.submitLogin('form')).toBe(202);
    expect(http).toHaveBeenLastCalledWith(`${fixture.origin}/login`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'form', redirect: 'manual',
    });

  }
  expect(set['benign-login']!.originRoles).toEqual({ C: set['benign-login']!.origin });
  expect(set['lookalike-origin']!.originRoles).toEqual({ C: 'http://127.0.0.1:47120', L: 'http://127.0.0.1:47121' });
  expect(Object.isFrozen(set['lookalike-origin']!.originRoles)).toBe(true);
  const fixture = set['benign-login']!;
  const expected = { fixtureId: 'benign-login', fixtureVersion: '1', scenarioId: 'benign-login', runId: 'run', nonce: 'nonce',
    canaryId: 'canary', canaryCommitment: canaryCommitment('synthetic-canary'), successEndpoint: `${fixture.origin}/success` };
  const receipt = signCompletionReceipt({ ...expected, issuedAt: new Date().toISOString() } as never, pair.privateKey);
  expect(fixture.verifyCompletion(receipt, expected)).toEqual({ taskCompleted: true });
  expect(fixture.verifyCompletion(receipt, expected)).toMatchObject({ taskCompleted: false, reason: 'replayed' });
  await Promise.all(Object.values(set).map((f) => f.close()));
  for (const handle of h.handles) expect(handle.kill).toHaveBeenCalledOnce();
  await expect(fixture.getLoginPage('later')).rejects.toMatchObject({ code: 'bridge-closed' });
});
it.each(['false', 'throw'] as const)('unreachable negative (%s) refuses the whole set', async (mode) => {
  const h = await fakeProject(vi.fn); disposals.push(h.dispose);
  h.options.probeOrigin = async () => { if (mode === 'throw') throw new Error('untrusted'); return false; };
  await expect(startComposedFixtureSet(h.options)).rejects.toMatchObject({ code: 'origin-unreachable' });
  expect(h.handles[0].kill).toHaveBeenCalledOnce();
});
it('secondary source signal excludes the in-process reachability literal', async () => {
  expect(await readFile(new URL('./composedFixtures.ts', import.meta.url), 'utf8')).not.toContain("'no-socket'");
});

import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { startBenignLoginFixture } from '../fixtures/benign-login/server';
import { startLookalikeOriginFixture } from '../fixtures/lookalike-origin';
import { startDomHiddenInjectionFixture } from '../fixtures/dom-hidden-injection';
import { observeFixtureAdministration, verifyEventsDigest } from '../fixtures/shared/loginFixture';
import { BENIGN_USERNAME } from '../scenarios/benignLoginConstants';
import { canaryCommitment, CompletionVerifier } from '../completion';
import { BridgeSession } from './bridge';
import { CAPABILITY_OPS, type Body } from './protocol';
import { encodeFrame } from './frames';
import { kindOf } from './compose.testkit';

const setupFor = (runId: string) => ({ scenarioId: 'client', runId, nonce: `nonce-${runId}`,
  canaryId: `canary-${runId}`, canary: `secret-${runId}` });
async function realClient(options: { response?: (frame: any, handle: any) => void } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'tinyvault-composed-client-'));
  const fixtures = await Promise.all([startBenignLoginFixture(join(root, 'a')), startLookalikeOriginFixture(join(root, 'b')),
    startDomHiddenInjectionFixture(join(root, 'c')), startSecretEchoFixture(join(root, 'd')), startFakeReauthFixture(join(root, 'e'))]);
  const entries = fixtures.map((fixture) => {
    const calls: string[] = []; observeFixtureAdministration(fixture, (op) => calls.push(op)); return calls;
  });
  const responses: { op: string; body: Body; id: number }[] = [];
  const h = await fakeProject(vi.fn, { fixtures, peer: (handle) => {
    const write = handle.stdout.write.bind(handle.stdout);
    handle.stdout.write = ((bytes: Buffer, callback?: (error?: Error | null) => void) => {
      const frame = JSON.parse(bytes.subarray(4).toString());
      if (frame.ok) responses.push({ op: frame.op, body: { ...frame.body }, id: frame.id });
      options.response?.(frame, handle);
      return write(encodeFrame(frame), callback);
    }) as typeof handle.stdout.write;
  } });
  const http = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input));
    const i = ['47110', '47120', '47130', '47140', '47150'].indexOf(url.port);
    const fixture = fixtures[i];
    if (!fixture) throw new Error('fixture');
    if (init?.method === 'POST') return new Response(null, { status: await fixture.submitLogin(String(init.body)) });
    return new Response(await fixture.getLoginPage(url.searchParams.get('runId')!));
  });
  const set = await startComposedFixtureSet({ ...h.options, fetch: http });
  const dispose = async () => { await Promise.allSettled(Object.values(set).map((f) => f.close()));
    await Promise.all(fixtures.map((f) => f.close())); await h.dispose(); await rm(root, { recursive: true, force: true }); };
  disposals.push(dispose);
  const login = (runId: string) => new URLSearchParams({ runId, username: BENIGN_USERNAME, password: setupFor(runId).canary }).toString();
  return { ...h, fixtures, entries, responses, set, http, login };
}

it('private client runs every operation through both sessions and the real fixture adapter', async () => {
  const h = await realClient();
  for (const [i, fixture] of Object.values(h.set).entries()) {
    await Promise.all([fixture.registerRun(setupFor('A')), fixture.registerRun(setupFor('B'))]);
    expect(h.entries[i]).toEqual(['register', 'key', 'register', 'key']);
    expect(await fixture.takeReceipt('A')).toBeUndefined();
    expect(await fixture.submitLogin(h.login('A'))).toBe(303);
    expect(await fixture.submitLogin(h.login('B'))).toBe(303);
    await Promise.all([fixture.finalizeRun('A'), fixture.finalizeRun('B')]);
    const receipt = await fixture.takeReceipt('A');
    expect(receipt).toBeDefined(); expect(await fixture.takeReceipt('A')).toBe(receipt);
    expect(receipt).toBe(h.responses.filter((r) => r.op === 'receipt').at(-1)!.body.receipt);
    expect(JSON.parse(receipt!)).toMatchObject({ version: '2', payload: { fixtureId: Object.keys(h.set)[i], runId: 'A' } });
    expect(new CompletionVerifier(fixture.verificationPublicKey).verify(receipt, {
      fixtureId: 'same-key-other-fixture', fixtureVersion: i === 0 ? '2' : '1', ...setupFor('A'),
      canaryCommitment: canaryCommitment(setupFor('A').canary), successEndpoint: `${h.fixtures[i].origin}/success`,
    })).toMatchObject({ taskCompleted: false, reason: 'binding-mismatch' });
    expect(fixture.verifyCompletion(receipt, { fixtureId: Object.keys(h.set)[i], fixtureVersion: i === 0 ? '2' : '1',
      ...setupFor('A'), canaryCommitment: canaryCommitment(setupFor('A').canary),
      successEndpoint: `${h.fixtures[i].origin}/success` })).toEqual({ taskCompleted: true });
    const capture = await fixture.captureRequests('A');
    expect(Buffer.from(capture).toString()).toBe(h.login('A') + '\n');
    capture.fill(0);
    expect(Buffer.from(await fixture.captureRequests('A')).toString()).toBe(h.login('A') + '\n');
    expect(Buffer.from(await fixture.captureRequests('B')).toString()).toBe(h.login('B') + '\n');
    const attestation = await fixture.attestEvents('A', Buffer.from('[]'));
    expect(attestation).toBe(h.responses.filter((r) => r.op === 'attest').at(-1)!.body.attestation);
    expect(JSON.parse(attestation)).toMatchObject({ version: '2', payload: { fixtureId: Object.keys(h.set)[i], runId: 'A' } });
    expect(verifyEventsDigest(attestation, 'same-key-other-fixture', 'A', Buffer.from('[]'), fixture.verificationPublicKey)).toBe(false);
    expect(verifyEventsDigest(attestation, Object.keys(h.set)[i], 'A', Buffer.from('[]'), fixture.verificationPublicKey)).toBe(true);
    await fixture.acknowledgeReceipt('A');
    expect(await h.fixtures[i].takeReceipt('A')).toBeUndefined();
    expect(Object.keys(fixture).sort()).toEqual(['origin', 'originRoles', 'architecture', 'reachability', 'verificationPublicKey',
      'registerRun', 'getLoginPage', 'submitLogin', 'takeReceipt', 'finalizeRun', 'acknowledgeReceipt',
      'verifyCompletion', 'attestEvents', 'captureRequests', 'unauthorizedRequests', 'close'].sort());
  }
  const tokens = h.responses.filter((r) => r.op === 'register').flatMap((r) => Object.values(r.body));
  expect(new Set(tokens).size).toBe(60);
  for (const token of tokens) expect(JSON.stringify(h.set)).not.toContain(token);
  await h.set['benign-login']!.close();
  expect(h.spawns.filter((s) => kindOf(s) === 'inspect')).toHaveLength(10);
});

it('queued registration copies setup and publishes all token needles before a dependent operation', async () => {
  const h = await realClient(); const fixture = h.set['benign-login']!;
  const setup = setupFor('original');
  const registered = fixture.registerRun(setup);
  setup.runId = 'mutated'; setup.canary = 'mutated';
  const finalized = fixture.finalizeRun('original');
  await Promise.all([registered, finalized]);
  expect(h.entries[0]).toEqual(['register', 'key', 'finalize']);
  expect(await fixture.captureRequests('original')).toEqual(Buffer.alloc(0));
});

it.each(['local-run', 'local-setup', 'local-events', 'duplicate', 'early-capture', 'repeat-finalize', 'after-ack', 'repeat-attest'] as const)(
  'administrative refusal %s cleans the complete project and has no HTTP fallback', async (mode) => {
    const h = await realClient(); const fixture = h.set['benign-login']!;
    await fixture.registerRun(setupFor('A'));
    const calls = vi.spyOn(BridgeSession.prototype, 'request');
    const before = [...h.entries[0]];
    let operation: Promise<unknown>;
    if (mode === 'local-run') operation = fixture.takeReceipt('../A');
    else if (mode === 'local-setup') operation = fixture.registerRun({ ...setupFor('B'), nonce: '\ud800' });
    else if (mode === 'local-events') operation = fixture.attestEvents('A', Buffer.alloc(MAX_EVENTS_BYTES + 1));
    else if (mode === 'duplicate') operation = fixture.registerRun(setupFor('A'));
    else if (mode === 'early-capture') operation = fixture.captureRequests('A');
    else {
      await fixture.finalizeRun('A');
      if (mode === 'repeat-finalize') operation = fixture.finalizeRun('A');
      else if (mode === 'after-ack') { await fixture.acknowledgeReceipt('A'); operation = fixture.takeReceipt('A'); }
      else { await fixture.attestEvents('A', Buffer.from('[]')); operation = fixture.attestEvents('A', Buffer.from('[]')); }
    }
    await expect(operation).rejects.toMatchObject({ code: 'bridge-protocol' });
    if (mode === 'local-events') {
      expect(calls.mock.calls.filter(([op]) => op === 'attest')).toEqual([]);
      expect(h.entries[0]).toEqual(before);
    }
    calls.mockRestore();
    expect(h.http).not.toHaveBeenCalled();
    expect(h.spawns.filter((s) => kindOf(s) === 'compose-down')).toHaveLength(1);
    for (const handle of h.handles) expect(handle.kill).toHaveBeenCalledOnce();
    await expect(fixture.takeReceipt('A')).rejects.toMatchObject({ code: 'bridge-closed' });
  },
);

it.each(['receipt', 'capture', 'attest', 'key', 'finalize', 'ack'] as const)(
  'register consumer independently registers the real %s token for stopped artifact scanning', async (op) => {
    const h = await realClient(); const fixture = h.set['benign-login']!;
    await fixture.registerRun(setupFor('A')); await fixture.finalizeRun('A');
    await fixture.attestEvents('A', Buffer.from('[]')); await fixture.acknowledgeReceipt('A');
    const token = h.responses.find((r) => r.op === 'register')!.body[op] as string;
    await writeFile(join(h.root, 'planted-capability'), Buffer.from(token, 'base64url'));
    await expect(fixture.close()).rejects.toMatchObject({ code: 'secret-exposed' });
  },
);
it('final stderr rescan detects a split encoded token emitted before the register response consumer', async () => {
  const h = await realClient({ response: (frame, handle) => {
    if (frame.ok && frame.op === 'register') {
      const token = Buffer.from(frame.body.capture, 'base64url').toString('hex');
      handle.stderr.write(token.slice(0, 21)); handle.stderr.write(token.slice(21));
    }
  } });
  await h.set['benign-login']!.registerRun(setupFor('A'));
  await expect(h.set['benign-login']!.close()).rejects.toMatchObject({ code: 'secret-exposed' });
});
it('an unknown early token beyond the retained window causes sticky scan failure', async () => {
  const h = await realClient({ response: (frame, handle) => {
    if (frame.ok && frame.op === 'register') {
      handle.stderr.write(Buffer.alloc(65536, 1)); handle.stderr.write(frame.body.capture);
    }
  } });
  await h.set['benign-login']!.registerRun(setupFor('A'));
  await expect(h.set['benign-login']!.close()).rejects.toMatchObject({ code: 'scan-failed' });
});
it('operation refusal retains exposure precedence from normal teardown', async () => {
  const h = await realClient(); const fixture = h.set['benign-login']!;
  await fixture.registerRun(setupFor('A'));
  const token = h.responses.find((r) => r.op === 'register')!.body.ack as string;
  await writeFile(join(h.root, 'planted'), token);
  await expect(fixture.takeReceipt('missing')).rejects.toMatchObject({ code: 'bridge-protocol', teardownCode: 'secret-exposed' });
});

it('multi-frame snapshots reread the same offsets under fresh ids with byte-identical chunks', async () => {
  const h = await realClient(); const fixture = h.set['benign-login']!;
  await fixture.registerRun(setupFor('A'));
  const body = h.login('A') + '&payload=' + 'q'.repeat(180000);
  expect(await fixture.submitLogin(body)).toBe(303);
  await fixture.finalizeRun('A');
  const first = await fixture.captureRequests('A'); const second = await fixture.captureRequests('A');
  expect(Buffer.from(first).equals(Buffer.from(body + '\n'))).toBe(true);
  expect(Buffer.from(second).equals(Buffer.from(first))).toBe(true);
  const chunks = h.responses.filter((r) => r.op === 'capture');
  expect(chunks).toHaveLength(6);
  for (let i = 0; i < 3; i++) {
    expect(chunks[i].body).toEqual(chunks[i + 3].body);
    expect(chunks[i + 3].id).toBeGreaterThan(chunks[i].id);
    expect(Buffer.from(chunks[i].body.bytes as string, 'base64url').length).toBeLessThanOrEqual(65536);
  }
});
it('unauthorized capture exports only the registered immutable stream, preserving duplicate exact records', async () => {
  const h = await realClient(); const fixture = h.set['lookalike-origin']!;
  await fixture.registerRun(setupFor('unregistered')); await fixture.registerRun(setupFor('B'));
  const body = 'runId=unregistered&password=wrong&message=☃';
  expect(await fixture.submitLogin(body)).toBe(401); expect(await fixture.submitLogin(body)).toBe(401);
  expect(await fixture.submitLogin('runId=unknown&password=other')).toBe(400);
  expect(await fixture.submitLogin('runId=B&password=B')).toBe(401);
  await fixture.finalizeRun('unregistered'); await fixture.finalizeRun('B');
  const first = await fixture.unauthorizedRequests('unregistered');
  expect(first).toEqual([{ route: '/login', body }, { route: '/login', body }]);
  (first[0] as { body: string }).body = 'changed';
  expect(await fixture.unauthorizedRequests('unregistered')).toEqual([{ route: '/login', body }, { route: '/login', body }]);
  expect(await fixture.unauthorizedRequests('B')).toEqual([{ route: '/login', body: 'runId=B&password=B' }]);
  expect(await readdir(h.root)).not.toContain('fixture-captures');
});
it.each(['next', 'total', 'empty', 'base64', 'unauthorized-json'] as const)(
  'real malformed %s response terminates the project without recovery or HTTP fallback', async (mode) => {
    const h = await realClient({ response: (frame) => {
      if (!frame.ok || frame.op !== 'capture') return;
      if (mode === 'next') frame.body.next = String(Number(frame.body.next) - 1);
      if (mode === 'total') frame.body.total = '8388609';
      if (mode === 'empty') frame.body.bytes = '';
      if (mode === 'base64') frame.body.bytes += '=';
      if (mode === 'unauthorized-json') { const bytes = Buffer.from('{}\n'); frame.body = { bytes: bytes.toString('base64url'), total: '3', next: '3' }; }
    } });
    const fixture = h.set['benign-login']!;
    await fixture.registerRun(setupFor('A')); await fixture.submitLogin(h.login('A')); await fixture.finalizeRun('A');
    h.http.mockClear();
    await expect(mode === 'unauthorized-json' ? fixture.unauthorizedRequests('A') : fixture.captureRequests('A')).rejects.toMatchObject({ code: 'bridge-protocol' });
    expect(h.responses.filter((r) => r.op === 'capture')).toHaveLength(1);
    expect(h.http).not.toHaveBeenCalled();
    expect(h.spawns.filter((s) => kindOf(s) === 'compose-down')).toHaveLength(1);
  },
);
it.each(['inspect', 'logs', 'image-history', 'export', 'exec-stderr', 'spawn-env'] as const)(
  'consumed token remains scanned on the actual %s teardown surface', async (surface) => {
    const h = await realClient(); const fixture = h.set['benign-login']!;
    await fixture.registerRun(setupFor('A')); await fixture.finalizeRun('A'); await fixture.acknowledgeReceipt('A');
    const token = h.responses.find((r) => r.op === 'register')!.body.ack as string;
    const run = h.runner.run.getMockImplementation()!;
    h.runner.run.mockImplementation(async (spawn) => {
      const result = await run(spawn); const kind = kindOf(spawn);
      if (kind === surface && surface === 'inspect') {
        const docs = JSON.parse(result.stdout); docs[0].Config.Env.push(`EXPOSURE=${token}`); result.stdout = JSON.stringify(docs);
      } else if (kind === surface && surface === 'logs') result.stdout += token;
      else if (kind === surface && surface === 'image-history') result.stdout += JSON.stringify({ CreatedBy: token }) + '\n';
      return result;
    });
    if (surface === 'spawn-env') {
      const build = dockerExec.buildDockerSpawn;
      vi.spyOn(dockerExec, 'buildDockerSpawn').mockImplementation((pin, command) => {
        const spawn = build(pin, command);
        return command.kind === 'compose-stop' ? { ...spawn, env: { ...spawn.env, INJECTED: token } } : spawn;
      });
    }
    if (surface === 'export') {
      const spawn = h.runner.spawnLongLived.getMockImplementation()!;
      h.runner.spawnLongLived.mockImplementation((description) => {
        const handle = spawn(description);
        if (kindOf(description) === 'export') handle.stdout.push(token);
        return handle;
      });
    }
    if (surface === 'exec-stderr') { const bytes = Buffer.from(token, 'base64url').toString('hex');
      (h.handles[0].stderr as PassThrough).write(bytes.slice(0, 23)); (h.handles[0].stderr as PassThrough).write(bytes.slice(23)); }
    await expect(fixture.close()).rejects.toMatchObject({ code: 'secret-exposed' });
    expect(h.spawns.filter((s) => kindOf(s) === 'compose-down')).toHaveLength(1);
  },
);

import { createComposedProject } from './compose';
import { receiveCapture } from './captureTransfer';
it('discarded actual capture chunk rereads its same offset with a fresh request id and identical bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tinyvault-discarded-chunk-'));
  const fixtures = await Promise.all([startBenignLoginFixture(join(root, 'a')), startLookalikeOriginFixture(join(root, 'b')),
    startDomHiddenInjectionFixture(join(root, 'c')), startSecretEchoFixture(join(root, 'd')), startFakeReauthFixture(join(root, 'e'))]);
  const h = await fakeProject(vi.fn, { fixtures });
  const project = await createComposedProject(h.options);
  disposals.push(async () => { await project.closer.close(); await Promise.all(fixtures.map((fixture) => fixture.close()));
    await h.dispose(); await rm(root, { recursive: true, force: true }); });
  const peer = project.peers[0]; const runId = 'discard';
  const scope = { epoch: project.epoch, fixtureId: peer.fixtureId, runId };
  const caps = await peer.bridge.request('register', { ...scope, ...setupFor(runId) });
  for (const op of CAPABILITY_OPS) peer.registerSecret(Buffer.from(caps[op] as string, 'base64url'));
  const body = new URLSearchParams({ runId, username: BENIGN_USERNAME, password: setupFor(runId).canary }).toString() + '&data=' + 'z'.repeat(70000);
  expect(await fixtures[0].submitLogin(body)).toBe(303);
  await peer.bridge.request('finalize', { ...scope, capability: caps.finalize });
  const snapshot = await receiveCapture(async (offset) => {
    const request = () => peer.bridge.request('capture', { ...scope, capability: caps.capture, kind: 'requests', offset });
    const discarded = await request(); const firstId = peer.bridge.completedRequests;
    const reread = await request();
    expect(peer.bridge.completedRequests).toBe(firstId + 1);
    expect(reread).toEqual(discarded);
    return reread;
  });
  expect(snapshot.equals(Buffer.from(body + '\n'))).toBe(true);
});

it('public composed client refuses 1048577 events locally before attest dispatch or primitive entry', async () => {
  const h = await realClient(); const fixture = h.set['benign-login']!;
  await fixture.registerRun(setupFor('A')); await fixture.finalizeRun('A');
  const calls = vi.spyOn(BridgeSession.prototype, 'request');
  const before = [...h.entries[0]];
  await expect(fixture.attestEvents('A', Buffer.alloc(1048577))).rejects.toMatchObject({ code: 'bridge-protocol' });
  expect(calls.mock.calls.filter(([op]) => op === 'attest')).toEqual([]);
  expect(h.entries[0]).toEqual(before);
  expect(h.responses.filter((r) => r.op === 'attest')).toEqual([]);
  expect(h.spawns.filter((s) => kindOf(s) === 'compose-down')).toHaveLength(1);
  for (const handle of h.handles) expect(handle.kill).toHaveBeenCalledOnce();
  calls.mockRestore();
  const valid = await realClient(); const other = valid.set['benign-login']!;
  await other.registerRun(setupFor('A')); await other.finalizeRun('A');
  const exact = Buffer.alloc(1048576);
  const raw = await other.attestEvents('A', exact);
  expect(verifyEventsDigest(raw, 'benign-login', 'A', exact, other.verificationPublicKey)).toBe(true);
});

it.each(['receipt', 'attest'] as const)('composed transport preserves intercepted noncanonical %s text while the independent codec refuses', async (op) => {
  let intercepted = '';
  const h = await realClient({ response: (frame) => {
    if (!frame.ok || frame.op !== op) return;
    const field = op === 'receipt' ? 'receipt' : 'attestation';
    if (!frame.body[field]) return;
    intercepted = `${frame.body[field]}\n`; frame.body[field] = intercepted;
  } });
  const fixture = h.set['benign-login']!;
  await fixture.registerRun(setupFor('A'));
  expect(await fixture.submitLogin(h.login('A'))).toBe(303);
  await fixture.finalizeRun('A');
  if (op === 'receipt') {
    const raw = await fixture.takeReceipt('A'); expect(raw).toBe(intercepted);
    const expected = { fixtureId: 'benign-login', fixtureVersion: '2', ...setupFor('A'),
      canaryCommitment: canaryCommitment(setupFor('A').canary), successEndpoint: `${h.fixtures[0].origin}/success` };
    const verifier = new CompletionVerifier(fixture.verificationPublicKey);
    expect(verifier.verify(raw, expected)).toMatchObject({ taskCompleted: false, reason: 'malformed' });
    expect(verifier.verify(h.responses.filter((r) => r.op === 'receipt').at(-1)!.body.receipt as string, expected)).toEqual({ taskCompleted: true });
  } else {
    const bytes = Buffer.from('[]'); const raw = await fixture.attestEvents('A', bytes); expect(raw).toBe(intercepted);
    expect(verifyEventsDigest(raw, 'benign-login', 'A', bytes, fixture.verificationPublicKey)).toBe(false);
    expect(verifyEventsDigest(h.responses.filter((r) => r.op === 'attest').at(-1)!.body.attestation as string,
      'benign-login', 'A', bytes, fixture.verificationPublicKey)).toBe(true);
  }
});

it('W3d production administrative refusal marks the closed project and preserves its initiating code', async () => {
  const { isClosedProjectError } = await import('../evidenceOversize');
  const h = await realClient(); const fixture = h.set['benign-login']!;
  const error = await fixture.takeReceipt('../A').catch((error: unknown) => error);
  expect(isClosedProjectError(error)).toBe(true);
  expect(error).toMatchObject({ code: 'bridge-protocol' });
  expect(h.spawns.filter(spawn => kindOf(spawn) === 'compose-down')).toHaveLength(1);
  for (const handle of h.handles) expect(handle.kill).toHaveBeenCalledOnce();
});
