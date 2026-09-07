// Execute the actual startup/observer/control adapter; only the listener and tripwire are inert.
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Duplex, PassThrough, Writable } from 'node:stream';
import type { KeyObject } from 'node:crypto';
import type { FixtureTransport } from '../../fixtures/transport';
import { expect, it, vi } from 'vitest';
import topology from '../topology.json';
import { BridgeSession } from '../bridge';
import { adminCounts, assertClean } from '../integrationEvidence';
import { setupFor, loginFor, artifactBytes, writerBytes } from '../slice4.testkit';
import { CAPABILITY_OPS } from '../protocol';

const state = vi.hoisted(() => ({ parent: '', ready: false, socket: '', observed: false, observedAtRegistration: false, observedAtListen: false,
  connection: undefined as undefined | ((socket: Duplex) => void),
  fixture: undefined as FixtureTransport | undefined,
  pair: undefined as { privateKey: KeyObject; publicKey: KeyObject } | undefined,
}));
vi.mock('node:crypto', async (original) => {
  const crypto = await original<typeof import('node:crypto')>();
  state.pair = crypto.generateKeyPairSync('ed25519');
  return { ...crypto, generateKeyPairSync: () => state.pair };
});
vi.mock('./topology', () => ({ containerTopology: { ...topology,
  get controlSocket() { return join(state.parent, 'control.sock'); },
} }));
vi.mock('./stdoutTripwire', () => ({ installStdoutTripwire: vi.fn() }));
vi.mock('node:os', async (original) => ({ ...await original(), hostname: () => 'a'.repeat(12) }));
vi.mock('./fixture', async (original) => {
  const actual = await original<typeof import('./fixture')>();
  return { ...actual,
    containerConfig: () => ({ fixtureId: 'benign-login', epoch: '1788600000000-' + 'a'.repeat(32), options: { onListenPermissionError: 'fail' } }),
    startContainerFixture: async (config: Parameters<typeof actual.startContainerFixture>[0]) => {
      state.fixture = await actual.startContainerFixture(config, join(state.parent, 'captures'));
      return state.fixture;
    },
  };
});
vi.mock('../../fixtures/shared/loginFixture', async (original) => {
  const actual = await original<typeof import('../../fixtures/shared/loginFixture')>();
  return { ...actual, observeFixtureAdministration: (...args: Parameters<typeof actual.observeFixtureAdministration>) => {
    const result = actual.observeFixtureAdministration(...args); state.observed = true; return result;
  } };
});
vi.mock('node:net', () => ({ createServer: () => ({
  on(event: string, cb: (socket: Duplex) => void) { if (event === 'connection') { state.observedAtRegistration = state.observed; state.connection = cb; } }, once() {}, off() {},
  close(cb: () => void) { cb(); },
  listen(path: string, ready: () => void) { state.observedAtListen = state.observed; state.socket = path; ready(); state.ready = true; },
}) }));
it('actual startup installs every primitive audit writer before control accepts and keeps private key off all startup surfaces', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tinyvault-main-'));
  state.parent = join(root, 'tinyvault');
  const once = vi.spyOn(process, 'once').mockReturnValue(process);
  // Copy inside each writer: mock.calls retains views that the caller can later erase.
  const stderrBytes: Buffer[] = [];
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation((value, encoding) => {
    stderrBytes.push(writerBytes(value, encoding)); return true;
  });
  const stdoutBytes: Buffer[] = [];
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation((value, encoding) => {
    stdoutBytes.push(writerBytes(value, encoding)); return true;
  });
  let bridge: BridgeSession | undefined;
  try {
    await import('./main');
    await vi.waitFor(() => expect(state.ready).toBe(true));
    expect(state.observedAtRegistration, 'observer installed before connection registration').toBe(true);
    expect(state.observedAtListen, 'observer installed before control listen').toBe(true);
    expect(state.fixture!.reachability).toBe('http');
    expect((await stat(state.parent)).mode & 0o777).toBe(0o700);
    expect((await stat(join(state.parent, 'captures'))).isDirectory()).toBe(true);
    expect(state.socket).toBe(join(state.parent, 'control.sock'));
    const output = new PassThrough(); const wire: Buffer[] = []; output.on('data', (bytes: Buffer) => wire.push(Buffer.from(bytes)));
    const socket = new Duplex({ read() {}, write(bytes, _encoding, cb) { output.write(bytes, cb); } });
    state.connection!(socket);
    const input = new Writable({ write(bytes, _encoding, cb) { socket.push(bytes); cb(); } });
    bridge = new BridgeSession({ stdin: input, stdout: output }, { kill: () => socket.destroy() });
    await bridge.sendBootstrap(Buffer.alloc(32, 5));
    const epoch = '1788600000000-' + 'a'.repeat(32);
    const key = await bridge.hello({ epoch, fixtureId: 'benign-login', containerId: 'a'.repeat(64), challenge: Buffer.alloc(32, 6).toString('base64url') });
    expect(key.export({ format: 'der', type: 'spki' })).toEqual(state.pair!.publicKey.export({ format: 'der', type: 'spki' }));
    const scope = { epoch, fixtureId: 'benign-login', runId: 'A' };
    const caps = await bridge.request('register', { ...scope, ...setupFor('A') });
    const pageResponse = await fetch(state.fixture!.origin + '/?runId=A');
    expect(pageResponse.status, 'actual startup fixture page').toBe(200);
    const page = Buffer.from(await pageResponse.arrayBuffer());
    expect(await state.fixture!.submitLogin(loginFor('A'))).toBe(303);
    await bridge.request('key', { ...scope, capability: caps.key });
    await bridge.request('receipt', { ...scope, capability: caps.receipt });
    await bridge.request('finalize', { ...scope, capability: caps.finalize });
    await bridge.request('capture', { ...scope, capability: caps.capture, kind: 'requests', offset: '0' });
    await bridge.request('attest', { ...scope, capability: caps.attest, events: Buffer.from('[]').toString('base64url') });
    await bridge.request('ack', { ...scope, capability: caps.ack });
    await expect(bridge.request('receipt', { ...scope, capability: caps.receipt })).rejects.toBeDefined();
    const logs = Buffer.concat(stderrBytes).toString('utf8');
    expect(adminCounts(logs)).toEqual({ register: 1, key: 1, receipt: 1, finalize: 1, capture: 1, attest: 1, ack: 1 });
    expect(logs).toContain('capability-refused');
    expect(logs).not.toContain('nonce-A'); // Fixed operation vocabulary has no run identifiers.
    const der = Buffer.from(state.pair!.privateKey.export({ type: 'pkcs8', format: 'der' }));
    const secrets = [der, der.subarray(-32), Buffer.from(der.toString('base64')), Buffer.from(der.toString('base64url')), Buffer.from(state.pair!.privateKey.export({ type: 'pkcs8', format: 'pem' }))];
    for (const surface of [page, Buffer.concat(stderrBytes), Buffer.concat(wire),
      Buffer.concat(stdoutBytes), ...await artifactBytes(state.parent)]) assertClean(surface, secrets);
    expect(Object.keys(state.fixture!).sort()).toEqual(['origin', 'originRoles', 'architecture', 'reachability', 'verificationPublicKey', 'registerRun',
      'getLoginPage', 'submitLogin', 'takeReceipt', 'finalizeRun', 'acknowledgeReceipt', 'verifyCompletion', 'attestEvents',
      'captureRequests', 'unauthorizedRequests', 'close'].sort());
    expect(CAPABILITY_OPS).toHaveLength(6);
  } finally { bridge?.close(); await state.fixture?.close(); once.mockRestore(); stderr.mockRestore(); stdout.mockRestore(); await rm(root, { recursive: true, force: true }); }
});
