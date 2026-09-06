// Docker-free real control dispatch and shared fixture signer; no container provenance claim.
import { randomBytes, sign as cryptoSign } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { PassThrough } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';
import { canaryCommitment, CompletionVerifier } from '../completion';
import { startBenignLoginFixture } from '../fixtures/benign-login/server';
import { signEventsDigest, verifyEventsDigest } from '../fixtures/shared/eventsDigest';
import { observeFixtureAdministration, type FixtureAdministrativeOperation } from '../fixtures/shared/loginFixture';
import { BENIGN_USERNAME } from '../scenarios/benignLoginConstants';
import { BridgeSession } from './bridge';
import { CapabilityRegistry } from './container/capabilities';
import { createControlServer } from './container/control';
import { containerConfig, controlConfigForFixture } from './container/fixture';
import { encodeFrame, FrameDecoder } from './frames';
import { BridgeError, type Body, type CapabilityOp, type Frame } from './protocol';
import topology from './topology.json';

vi.mock('node:crypto', async (original) => {
  const actual = await original<typeof import('node:crypto')>();
  return { ...actual, sign: vi.fn(actual.sign) };
});
vi.mock('../fixtures/shared/eventsDigest', async (original) => {
  const actual = await original<typeof import('../fixtures/shared/eventsDigest')>();
  return { ...actual, signEventsDigest: vi.fn(actual.signEventsDigest) };
});
vi.mock('node:perf_hooks', () => ({ performance: { now: vi.fn(() => 1000) } }));
afterEach(() => { vi.restoreAllMocks(); vi.mocked(performance.now).mockReturnValue(1000); });

const events = Buffer.from('[]\n');
async function paired() {
  const root = await mkdtemp(join(tmpdir(), 'tinyvault-slice5-dispatch-'));
  const fixture = await startBenignLoginFixture(root);
  const config = containerConfig({ TV_FIXTURE_ID: 'benign-login', TV_EVAL_EPOCH: `1-${'a'.repeat(32)}`,
    TV_PUBLIC_ORIGIN: `http://127.0.0.1:${topology.services['benign-login'][0].host}` });
  const entries: FixtureAdministrativeOperation[] = [];
  observeFixtureAdministration(fixture, (op) => entries.push(op));
  const input = new PassThrough(); const output = new PassThrough(); const diagnostics = vi.fn();
  const session = createControlServer(controlConfigForFixture(config, fixture, 'a'.repeat(12), diagnostics))({ input, output })!;
  const bridge = new BridgeSession({ stdin: input, stdout: output }, { kill: () => queueMicrotask(() => session.close()) });
  await bridge.sendBootstrap(randomBytes(32));
  const key = await bridge.hello({ challenge: randomBytes(32).toString('base64url'), epoch: config.epoch,
    fixtureId: config.fixtureId, containerId: 'a'.repeat(64) });
  const scope = (runId: string) => ({ epoch: config.epoch, fixtureId: config.fixtureId, runId });
  const setup = (runId: string) => ({ runId, scenarioId: 'slice5', nonce: `nonce-${runId}`,
    canaryId: `canary-${runId}`, canary: `synthetic-${runId}` });
  const register = (runId = 'A') => bridge.request('register', { ...scope(runId), ...setup(runId) });
  const operation = (op: CapabilityOp, runId: string, caps: Body, extra: Body = {}) =>
    bridge.request(op, { ...scope(runId), capability: caps[op] as string, ...extra });
  const attest = (caps: Body, runId = 'A') => operation('attest', runId, caps, { events: events.toString('base64url') });
  const finalized = async (runId = 'A') => {
    const caps = await register(runId); await operation('finalize', runId, caps); return caps;
  };
  const close = async () => { bridge.close(); await fixture.close(); await rm(root, { recursive: true, force: true }); };
  return { fixture, input, output, session, bridge, key, entries, diagnostics, scope, setup, register, operation, attest, finalized, close };
}
function resetSigning() { vi.mocked(cryptoSign).mockClear(); vi.mocked(signEventsDigest).mockClear(); }
async function positive(p: Awaited<ReturnType<typeof paired>>, caps: Body, runId = 'A', bytes = events) {
  resetSigning();
  const result = await p.operation('attest', runId, caps, { events: bytes.toString('base64url') });
  expect(JSON.parse(result.attestation as string)).toMatchObject({ version: '2', payload: { fixtureId: 'benign-login', runId } });
  expect(verifyEventsDigest(result.attestation as string, 'benign-login', runId, bytes, p.key)).toBe(true);
  expect(cryptoSign).toHaveBeenCalledOnce(); expect(signEventsDigest).toHaveBeenCalledOnce();
  return result;
}

it('attest capability cannot retrieve an existing genuine receipt before receipt primitive entry', async () => {
  const p = await paired();
  try {
    const caps = await p.register(); const setup = p.setup('A');
    expect(await p.fixture.submitLogin(new URLSearchParams({ runId: 'A', username: BENIGN_USERNAME, password: setup.canary }).toString())).toBe(303);
    const genuine = await p.operation('receipt', 'A', caps);
    expect(new CompletionVerifier(p.key).verify(genuine.receipt as string, { fixtureId: 'benign-login', fixtureVersion: '2',
      ...setup, canaryCommitment: canaryCommitment(setup.canary), successEndpoint: `${p.fixture.origin}/success` })).toEqual({ taskCompleted: true });
    await p.operation('finalize', 'A', caps);
    p.entries.length = 0; resetSigning();
    await expect(p.operation('receipt', 'A', { ...caps, receipt: caps.attest })).rejects.toMatchObject({ code: 'capability-refused' });
    expect(p.entries).toEqual([]); expect(cryptoSign).not.toHaveBeenCalled(); expect(p.session.closed).toBe(true);
  } finally { await p.close(); }
});

it('early control attestation refuses before fixture entry and signing with a fresh finalized positive', async () => {
  const p = await paired();
  try {
    const caps = await p.register(); p.entries.length = 0; resetSigning();
    await expect(p.attest(caps)).rejects.toMatchObject({ code: 'run-state' });
    expect(p.entries).toEqual([]); expect(signEventsDigest).not.toHaveBeenCalled(); expect(cryptoSign).not.toHaveBeenCalled();
  } finally { await p.close(); }
  const valid = await paired();
  try { await positive(valid, await valid.finalized()); } finally { await valid.close(); }
});

it('queued duplicate control attestation enters the primitive and real signer exactly once', async () => {
  const p = await paired();
  try {
    const caps = await p.finalized(); p.entries.length = 0; resetSigning();
    const results = await Promise.allSettled([p.attest(caps), p.attest(caps)]);
    expect(results[0].status).toBe('fulfilled');
    if (results[0].status !== 'fulfilled') throw new Error('missing first attestation');
    expect(verifyEventsDigest(results[0].value.attestation as string, 'benign-login', 'A', events, p.key)).toBe(true);
    expect(results[1]).toMatchObject({ status: 'rejected', reason: { code: 'capability-refused' } });
    expect(p.entries).toEqual(['attest']); expect(signEventsDigest).toHaveBeenCalledOnce(); expect(cryptoSign).toHaveBeenCalledOnce();
  } finally { await p.close(); }
});

it('control consumes attestation authority before a real crypto signer failure and terminal close', async () => {
  const p = await paired();
  const original = CapabilityRegistry.prototype.authorize;
  let current: CapabilityRegistry | undefined; let refusalAtSign: unknown;
  const observer = vi.spyOn(CapabilityRegistry.prototype, 'authorize').mockImplementation(function (this: CapabilityRegistry, ...args) {
    current = this; return original.apply(this, args);
  });
  try {
    const caps = await p.finalized(); p.entries.length = 0; resetSigning();
    vi.mocked(cryptoSign).mockImplementationOnce(() => {
      try { original.call(current!, p.scope('A'), 'attest', caps.attest as string); }
      catch (error) { refusalAtSign = error; }
      throw new Error('synthetic crypto failure');
    });
    await expect(p.attest(caps)).rejects.toMatchObject({ code: 'bridge-closed' });
    expect(refusalAtSign).toBeInstanceOf(BridgeError);
    expect(refusalAtSign).toMatchObject({ code: 'capability-refused' });
    expect(p.entries).toEqual(['attest']); expect(signEventsDigest).toHaveBeenCalledOnce(); expect(cryptoSign).toHaveBeenCalledOnce();
    expect(p.session.closed).toBe(true);
  } finally { observer.mockRestore(); await p.close(); }
  const valid = await paired();
  try { await positive(valid, await valid.finalized()); } finally { await valid.close(); }
});

it.each([59999.999, 60000])('real control attestation honors monotonic TTL elapsed=%s', async (elapsed) => {
  const p = await paired();
  try {
    const caps = await p.finalized(); p.entries.length = 0; resetSigning();
    vi.mocked(performance.now).mockReturnValue(1000 + elapsed);
    if (elapsed < 60000) { await positive(p, caps); expect(p.entries).toEqual(['attest']); }
    else {
      await expect(p.attest(caps)).rejects.toMatchObject({ code: 'capability-refused' });
      expect(p.entries).toEqual([]); expect(signEventsDigest).not.toHaveBeenCalled(); expect(cryptoSign).not.toHaveBeenCalled();
    }
  } finally { await p.close(); }
});

it.each(['fixture', 'run', 'operation', 'epoch'] as const)('real control rejects wrong %s attestation scope before primitive entry', async (kind) => {
  const p = await paired();
  try {
    const a = await p.finalized('A'); const b = await p.finalized('B');
    // A valid independent run proves this session reaches the actual signer without consuming A.
    await positive(p, b, 'B'); p.entries.length = 0; resetSigning();
    const change: Body = kind === 'fixture' ? { fixtureId: 'lookalike-origin' }
      : kind === 'run' ? { runId: 'B' } : kind === 'epoch' ? { epoch: `2-${'b'.repeat(32)}` }
        : { capability: a.receipt };
    // Bypass the host's established fixture/epoch check to exercise the server registry.
    await new Promise<void>((resolve) => setImmediate(resolve));
    p.output.removeAllListeners('data');
    const frames: Frame[] = [];
    const decoder = new FrameDecoder((frame) => frames.push(frame), (code) => { throw new Error(code); });
    p.output.on('data', (bytes) => decoder.feed(bytes));
    p.input.write(encodeFrame({ v: 1, kind: 'req', id: 9, op: 'attest', body: {
      ...p.scope('A'), capability: a.attest, events: events.toString('base64url'), ...change,
    } }));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(frames).toEqual([{ v: 1, kind: 'res', id: 9, op: 'attest', ok: false, code: 'capability-refused' }]);
    expect(p.entries).toEqual([]); expect(signEventsDigest).not.toHaveBeenCalled(); expect(cryptoSign).not.toHaveBeenCalled();
  } finally { await p.close(); }
});

it('new authenticated control instance rejects old attest token for recurring run with fresh token positive', async () => {
  const old = await paired(); let oldToken: string;
  try { oldToken = (await old.finalized()).attest as string; } finally { await old.close(); }
  const fresh = await paired();
  try {
    const caps = await fresh.finalized(); await positive(fresh, await fresh.finalized('B'), 'B');
    expect(caps.attest).not.toBe(oldToken); fresh.entries.length = 0; resetSigning();
    await expect(fresh.attest({ ...caps, attest: oldToken })).rejects.toMatchObject({ code: 'capability-refused' });
    expect(fresh.entries).toEqual([]); expect(cryptoSign).not.toHaveBeenCalled();
  } finally { await fresh.close(); }
  // Token-map lookup already rejects the old token; this does not isolate private instance equality.
});

it('direct shared fixture rejects early attestation before signer entry without consuming the later finalized attempt', async () => {
  const p = await paired();
  try {
    await p.fixture.registerRun(p.setup('A')); resetSigning();
    await expect(p.fixture.attestEvents('A', events)).rejects.toMatchObject({ code: 'run-state' });
    expect(signEventsDigest).not.toHaveBeenCalled(); expect(cryptoSign).not.toHaveBeenCalled();
    await p.fixture.finalizeRun('A');
    const raw = await p.fixture.attestEvents('A', events);
    expect(verifyEventsDigest(raw, 'benign-login', 'A', events, p.key)).toBe(true);
    expect(signEventsDigest).toHaveBeenCalledOnce(); expect(cryptoSign).toHaveBeenCalledOnce();
  } finally { await p.close(); }
});

it('direct shared fixture consumes its single successful attestation independently of control authority', async () => {
  const p = await paired();
  try {
    await p.fixture.registerRun(p.setup('A')); await p.fixture.finalizeRun('A'); resetSigning();
    const raw = await p.fixture.attestEvents('A', events);
    expect(verifyEventsDigest(raw, 'benign-login', 'A', events, p.key)).toBe(true);
    await expect(p.fixture.attestEvents('A', events)).rejects.toMatchObject({ code: 'run-state' });
    expect(signEventsDigest).toHaveBeenCalledOnce(); expect(cryptoSign).toHaveBeenCalledOnce();
  } finally { await p.close(); }
});

it('direct shared fixture accepts 131072 bytes and consumes a separate 131073 refusal before signer entry', async () => {
  const p = await paired();
  try {
    for (const runId of ['A', 'B']) { await p.fixture.registerRun(p.setup(runId)); await p.fixture.finalizeRun(runId); }
    const exact = Buffer.alloc(131072, 0x61); resetSigning();
    const raw = await p.fixture.attestEvents('A', exact);
    expect(verifyEventsDigest(raw, 'benign-login', 'A', exact, p.key)).toBe(true);
    expect(cryptoSign).toHaveBeenCalledOnce(); resetSigning();
    const failure = await p.fixture.attestEvents('B', Buffer.alloc(131073, 0x61)).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(BridgeError); expect(failure).toMatchObject({ code: 'control-limit' });
    // The direct signer has its own size cap: zero crypto.sign calls alone would be masked.
    expect(signEventsDigest).not.toHaveBeenCalled(); expect(cryptoSign).not.toHaveBeenCalled();
    await expect(p.fixture.attestEvents('B', events)).rejects.toMatchObject({ code: 'run-state' });
    expect(signEventsDigest).not.toHaveBeenCalled(); expect(cryptoSign).not.toHaveBeenCalled();
  } finally { await p.close(); }
});

it('raw server oversized attestation is terminal before primitive entry with independent exact-limit positive', async () => {
  const p = await paired();
  try {
    const caps = await p.finalized();
    await new Promise<void>((resolve) => setImmediate(resolve));
    p.output.removeAllListeners('data');
    const frames: Frame[] = [];
    const decoder = new FrameDecoder((frame) => frames.push(frame), (code) => { throw new Error(code); });
    p.output.on('data', (bytes) => decoder.feed(bytes)); p.entries.length = 0; resetSigning();
    // Deliberately bypass BridgeSession's local body validator, while retaining a valid outer frame.
    p.input.write(encodeFrame({ v: 1, kind: 'req', id: 5, op: 'attest', body: {
      ...p.scope('A'), capability: caps.attest, events: Buffer.alloc(131073, 0x61).toString('base64url'),
    } }));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(frames).toEqual([{ v: 1, kind: 'res', id: 5, op: 'attest', ok: false, code: 'control-limit' }]);
    expect(p.session.closed).toBe(true); expect(p.entries).toEqual([]);
    expect(signEventsDigest).not.toHaveBeenCalled(); expect(cryptoSign).not.toHaveBeenCalled();
  } finally { await p.close(); }
  const valid = await paired();
  try { await positive(valid, await valid.finalized(), 'A', Buffer.alloc(131072, 0x61)); }
  finally { await valid.close(); }
});
