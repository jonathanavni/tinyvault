import { startSecretEchoFixture } from '../../fixtures/secret-echo';
import { startFakeReauthFixture } from '../../fixtures/fake-reauth';
import { Server } from 'node:net';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';
import { startBenignLoginFixture } from '../../fixtures/benign-login/server';
import { BENIGN_USERNAME } from '../../scenarios/benignLoginConstants';
import { canaryCommitment, CompletionVerifier } from '../../completion';
import { BridgeSession } from '../bridge';
import { createControlServer } from './control';
import { containerConfig, controlConfigForFixture } from './fixture';
import topology from '../topology.json';

afterEach(() => vi.restoreAllMocks());
it('the container control configuration authenticates the same key that verifies fixture receipts', async () => {
  vi.spyOn(Server.prototype, 'listen').mockImplementation(function (this: Server) {
    queueMicrotask(() => this.emit('error', Object.assign(new Error('listen'), { code: 'EPERM' })));
    return this;
  });
  const root = await mkdtemp(join(tmpdir(), 'tinyvault-container-key-'));
  const fixture = await startBenignLoginFixture(root);
  const config = containerConfig({ TV_FIXTURE_ID: 'benign-login', TV_EVAL_EPOCH: `1-${'a'.repeat(32)}`,
    TV_PUBLIC_ORIGIN: `http://127.0.0.1:${topology.services['benign-login'][0].host}` });
  const stdin = new PassThrough(); const stdout = new PassThrough();
  const accept = createControlServer(controlConfigForFixture(config, fixture, 'a'.repeat(12), () => {}));
  const session = accept({ input: stdin, output: stdout });
  const bridge = new BridgeSession({ stdin, stdout }, { kill: () => session?.close() });
  try {
    const setup = { runId: 'key-proof', scenarioId: 'key-proof', nonce: 'nonce', canaryId: 'canary',
      canary: randomBytes(24).toString('hex') };
    await fixture.registerRun(setup);
    expect(await fixture.submitLogin(new URLSearchParams({ runId: setup.runId, username: BENIGN_USERNAME,
      password: setup.canary }).toString())).toBe(303);
    const receipt = await fixture.takeReceipt(setup.runId);
    await bridge.sendBootstrap(randomBytes(32));
    const key = await bridge.hello({ challenge: randomBytes(32).toString('base64url'),
      epoch: config.epoch, fixtureId: config.fixtureId, containerId: 'a'.repeat(64) });
    expect(key.export({ format: 'der', type: 'spki' })).toEqual(fixture.verificationPublicKey.export({ format: 'der', type: 'spki' }));
    expect(new CompletionVerifier(key).verify(receipt, { fixtureId: 'benign-login', fixtureVersion: '2',
      scenarioId: setup.scenarioId, runId: setup.runId, nonce: setup.nonce, canaryId: setup.canaryId,
      canaryCommitment: canaryCommitment(setup.canary), successEndpoint: `${fixture.origin}/success`,
    })).toEqual({ taskCompleted: true });
  } finally { bridge.close(); await fixture.close(); await rm(root, { recursive: true, force: true }); }
});

// These are real shared operations behind both production stream sessions and the container adapter.
import { appendFile } from 'node:fs/promises';
import { startLookalikeOriginFixture } from '../../fixtures/lookalike-origin';
import { startDomHiddenInjectionFixture } from '../../fixtures/dom-hidden-injection';
import { observeFixtureAdministration, verifyEventsDigest,
  type FixtureAdministrativeOperation } from '../../fixtures/shared/loginFixture';
import type { BridgeClock } from '../bridge';
import type { Body, CapabilityOp } from '../protocol';

vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof import('node:fs/promises')>();
  return { ...fs, appendFile: vi.fn(fs.appendFile) };
});
function substituteSocket() {
  vi.spyOn(Server.prototype, 'listen').mockImplementation(function (this: Server) {
    queueMicrotask(() => this.emit('error', Object.assign(new Error('listen'), { code: 'EPERM' }))); return this;
  });
}
async function paired(fixtureId: 'benign-login' | 'lookalike-origin' | 'dom-hidden-injection' | 'secret-echo' | 'fake-reauth' = 'benign-login', clock?: BridgeClock) {
  substituteSocket();
  const root = await mkdtemp(join(tmpdir(), 'tinyvault-real-adapter-'));
  const fixture = await ({ 'benign-login': startBenignLoginFixture, 'lookalike-origin': startLookalikeOriginFixture,
    'dom-hidden-injection': startDomHiddenInjectionFixture, 'secret-echo': startSecretEchoFixture, 'fake-reauth': startFakeReauthFixture })[fixtureId](root);
  const env = { TV_FIXTURE_ID: fixtureId, TV_EVAL_EPOCH: `1-${'a'.repeat(32)}`,
    TV_PUBLIC_ORIGIN: `http://127.0.0.1:${topology.services[fixtureId][0].host}`,
    ...(fixtureId === 'lookalike-origin' ? { TV_LOOKALIKE_PUBLIC_ORIGIN: `http://127.0.0.1:${topology.services[fixtureId][1].host}` } : {}) };
  const config = containerConfig(env);
  const entries: FixtureAdministrativeOperation[] = [];
  observeFixtureAdministration(fixture, (operation) => entries.push(operation));
  const stdin = new PassThrough(); const stdout = new PassThrough(); const diagnostics = vi.fn();
  const session = createControlServer(controlConfigForFixture(config, fixture, 'a'.repeat(12), diagnostics))({ input: stdin, output: stdout });
  const bridge = new BridgeSession({ stdin, stdout }, { kill: () => queueMicrotask(() => session?.close()), clock });
  await bridge.sendBootstrap(randomBytes(32));
  const key = await bridge.hello({ challenge: randomBytes(32).toString('base64url'), epoch: config.epoch,
    fixtureId, containerId: 'a'.repeat(64) });
  const run = (runId: string) => ({ runId, scenarioId: 'adapter', nonce: `nonce-${runId}`, canaryId: `canary-${runId}`, canary: `secret-${runId}` });
  const scope = (runId: string) => ({ epoch: config.epoch, fixtureId, runId });
  const register = (runId: string) => bridge.request('register', { ...scope(runId), ...run(runId) });
  const operation = (op: CapabilityOp, runId: string, caps: Body, extra: Body = {}) =>
    bridge.request(op, { ...scope(runId), capability: caps[op] as string, ...extra });
  const login = (runId: string, extra = '') => new URLSearchParams({ runId, username: BENIGN_USERNAME, password: run(runId).canary }).toString() + extra;
  const close = async () => { bridge.close(); await fixture.close(); await rm(root, { recursive: true, force: true }); };
  return { root, fixture, key, entries, bridge, session, diagnostics, run, register, operation, login, close };
}

it.each(['benign-login', 'lookalike-origin', 'dom-hidden-injection', 'secret-echo', 'fake-reauth'] as const)('%s adapter dispatches every operation to shared primitives and returns isolated immutable same-key evidence', async (fixtureId) => {
  const p = await paired(fixtureId);
  try {
    expect(p.entries).toEqual([]); // Hello anchor discovery is not administrative key retrieval.
    const A = await p.register('A'); const B = await p.register('B');
    expect(await p.operation('receipt', 'A', A)).toEqual({ receipt: '' });
    const pageWindow = p.entries.length;
    expect(await p.fixture.submitLogin(p.login('A'))).toBe(303);
    expect(await p.fixture.submitLogin(p.login('B'))).toBe(303);
    expect(await p.fixture.submitLogin('runId=A&password=wrong&message=☃')).toBe(401);
    expect(p.entries).toHaveLength(pageWindow); // Automatic issuance/capture are not administrative reads.
    const receipt = await p.operation('receipt', 'A', A); expect(receipt.receipt).not.toBe('');
    expect(await p.operation('receipt', 'A', A)).toEqual(receipt);
    expect(new CompletionVerifier(p.key).verify(receipt.receipt as string, { fixtureId, fixtureVersion: fixtureId === 'benign-login' ? '2' : '1',
      scenarioId: p.run('A').scenarioId, runId: 'A', nonce: p.run('A').nonce, canaryId: p.run('A').canaryId,
      canaryCommitment: canaryCommitment(p.run('A').canary), successEndpoint: `${p.fixture.origin}/success` })).toEqual({ taskCompleted: true });
    expect(await p.operation('key', 'A', A)).toEqual({ publicKey: p.key.export({ format: 'der', type: 'spki' }).toString('base64url') });
    await p.operation('finalize', 'A', A); await p.operation('finalize', 'B', B);
    const captureA = await p.operation('capture', 'A', A, { kind: 'requests', offset: '0' });
    expect(Buffer.from(captureA.bytes as string, 'base64url').toString()).toBe(p.login('A') + '\n');
    expect(Buffer.from((await p.operation('capture', 'B', B, { kind: 'requests', offset: '0' })).bytes as string, 'base64url').toString()).toBe(p.login('B') + '\n');
    expect(await p.operation('capture', 'A', A, { kind: 'requests', offset: '0' })).toEqual(captureA);
    const unauthorized = await p.operation('capture', 'A', A, { kind: 'unauthorized', offset: '0' });
    expect(Buffer.from(unauthorized.bytes as string, 'base64url').toString()).toBe(JSON.stringify({ route: '/login', body: 'runId=A&password=wrong&message=☃' }) + '\n');
    const events = Buffer.from('[]\n');
    const attestation = await p.operation('attest', 'A', A, { events: events.toString('base64url') });
    expect(verifyEventsDigest(attestation.attestation as string, fixtureId, 'A', events, p.key)).toBe(true);
    expect(await p.fixture.submitLogin(p.login('A', '&late=1'))).toBe(409);
    expect(await p.operation('capture', 'A', A, { kind: 'requests', offset: '0' })).toEqual(captureA);
    expect(await p.operation('receipt', 'A', A)).toEqual(receipt);
    await p.operation('ack', 'A', A);
    expect(await p.fixture.takeReceipt('A')).toBeUndefined();
    expect(p.entries).toEqual(['register', 'register', 'receipt', 'receipt', 'receipt', 'key', 'finalize', 'finalize',
      'capture', 'capture', 'capture', 'capture', 'attest', 'capture', 'receipt', 'ack', 'receipt']);
    await expect(p.operation('receipt', 'A', A)).rejects.toMatchObject({ code: 'capability-refused' });
    expect(p.bridge.closed).toBe(true);
  } finally { await p.close(); }
});

it.each(['capture', 'attest', 'ack'] as const)('real adapter authorization refuses pre-finalized %s before shared dispatch', async (op) => {
  const p = await paired();
  try {
    const caps = await p.register('A');
    const extra = op === 'capture' ? { kind: 'requests', offset: '0' } : op === 'attest' ? { events: '' } : {};
    await expect(p.operation(op, 'A', caps, extra)).rejects.toMatchObject({ code: 'run-state' });
    expect(p.entries).toEqual(['register']); expect(p.bridge.closed).toBe(true);
  } finally { await p.close(); }
});

it('server drain refuses at 3000 ms with bridge clock held open at its independent 5000 ms deadline', async () => {
  const bridgeTimers = new Set<() => void>();
  const clock: BridgeClock = { setTimeout: vi.fn((callback, ms) => { expect(ms).toBe(5000); bridgeTimers.add(callback); return callback; }),
    clearTimeout: (callback) => { bridgeTimers.delete(callback as () => void); } };
  const p = await paired('benign-login', clock);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const original = vi.mocked(appendFile).getMockImplementation()!;
  vi.mocked(appendFile).mockImplementationOnce(async () => gate);
  const caps = await p.register('A');
  const submitted = p.fixture.submitLogin(p.login('A')).catch((error: unknown) => error);
  await new Promise<void>((resolve) => setImmediate(resolve));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  let refusal: unknown;
  const pending = p.operation('finalize', 'A', caps).catch((error: unknown) => { refusal = error; });
  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    await vi.advanceTimersByTimeAsync(2999); expect(refusal).toBeUndefined(); expect(p.bridge.closed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(refusal).toMatchObject({ code: 'control-limit' });
    expect(p.diagnostics).toHaveBeenCalledWith('control-limit'); expect(p.bridge.closingCode).toBe('control-limit');
    expect(clock.setTimeout).toHaveBeenCalled();
  } finally {
    release(); await submitted; await pending; vi.useRealTimers(); vi.mocked(appendFile).mockImplementation(original);
    await expect(p.fixture.close()).rejects.toMatchObject({ code: 'control-limit' });
    p.bridge.close(); await rm(p.root, { recursive: true, force: true });
  }
});
