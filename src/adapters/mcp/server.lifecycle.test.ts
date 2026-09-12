import { PassThrough, Writable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { composeSupervisedHost, EvidenceLease, type SupervisedHost } from '../../supervisor/host';
import type { FillService, FillOutcome } from '../../core/fillService';
import type { BrowserSessionHost, SessionPage } from '../../browser/session';
import type { FillDestinationPort } from '../../core/browserPort';
import { createSetupResult } from '../../core/results';
import { createServer, serve } from './server';
const CANARY = 'TVC_mcp_canary_8193';
const META = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientCapabilities': {} };
const ARGS: Record<string, Record<string, unknown>> = {
  list_vault: {}, fill_from_vault: { handle: 'vh_test', sessionId: 'session', fields: [{ role: 'password', selector: '#p' }] },
  request_vault_setup: { reason: 'missing_item' }, browser_open_session: {}, browser_close_session: { sessionId: 'session' },
  browser_navigate: { sessionId: 'session', url: 'https://example.test' }, browser_click: { sessionId: 'session', selector: '#b' },
  browser_type: { sessionId: 'session', selector: '#t', text: 'typed' }, browser_snapshot: { sessionId: 'session' },
};
function outcome(result: unknown = { ok: true, filled: ['password'] }): FillOutcome {
  return { result, observation: { topOrigin: 'https://example.test', topPath: 'https://example.test/login',
    unobserved: false, reobservedOrigin: null, assertedMismatch: null, assigned: null } } as FillOutcome;
}
class FakeSessions implements BrowserSessionHost {
  forced: unknown; openResult: unknown = { sessionId: 'session' }; closeResult: unknown = true;
  snapshotValue: unknown = { url: 'https://example.test', nodes: [] }; count = 0;
  async openSession() { this.count++; return this.openResult as { sessionId: string }; }
  async closeSession() { this.count = Math.max(0, this.count - 1); return this.closeResult as boolean; }
  async runExclusive<T>(_id: string, op: (port: FillDestinationPort) => Promise<T>) { return op({} as FillDestinationPort); }
  async runControl<T>(_id: string, op: (page: SessionPage) => Promise<T>): Promise<T> {
    if (this.forced !== undefined) return this.forced as T;
    return op({ navigate: async () => undefined, click: async () => undefined,
      type: async () => 'ok', snapshot: async () => this.snapshotValue } as SessionPage);
  }
  openSessionCount() { return this.count; }
  async closeAll() { this.count = 0; }
  async stopLoading() {} async quiesceControls() {} async abortSessions() { this.count = 0; } async disposeSession() {}
}
function fixture() {
  const lease = new EvidenceLease(CANARY); const sessions = new FakeSessions();
  const service: FillService = { fill: vi.fn(async () => outcome()), listVault: vi.fn(async () => ({ items: [] })),
    requestSetup: vi.fn(async args => createSetupResult(args)), setupReasonFor: vi.fn(async () => null),
    disposeBackend: vi.fn(async () => undefined) };
  const host = composeSupervisedHost({ fillService: service, sessions, lease });
  return { host, lease, sessions, service };
}
function connection(host: SupervisedHost, onInternalError = () => undefined) {
  const server = createServer(host, { version: '0.0.0', onInternalError });
  const input = new PassThrough(); const output = new PassThrough(); let stdout = '';
  output.on('data', chunk => { stdout += chunk.toString(); });
  const ended = serve(server, input, output); let id = 0;
  return { server, input, output, ended, stdout: () => stdout,
    call: async (name: string, args: unknown = ARGS[name]) => {
      const requestId = ++id;
      input.write(JSON.stringify({ jsonrpc: '2.0', id: requestId, method: 'tools/call', params: { _meta: META, name, arguments: args } }) + '\n');
      await server.idle();
      return JSON.parse(stdout.trim().split('\n').find(line => JSON.parse(line).id === requestId)!);
    }, close: async () => { input.end(); await ended; await server.idle(); } };
}

import { EventEmitter } from 'node:events';
import * as hostModule from '../../supervisor/host';
import { start, SHUTDOWN_HANDLER_DEADLINE_MS } from './main';
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const tick = async () => { await new Promise<void>(resolve => setImmediate(resolve)); for (let i = 0; i < 12; i++) await Promise.resolve(); };
function runtime(output: Writable = new PassThrough()) {
  const events = new EventEmitter(); const input = new PassThrough(); const stderr = new PassThrough();
  let err = ''; let out = ''; stderr.on('data', bytes => { err += bytes.toString(); });
  output.on('data', bytes => { out += bytes.toString(); });
  const exit = vi.fn();
  const value = Object.assign(events, { stdin: input, stdout: output, stderr, exit,
    env: { TINYVAULT_VAULT_PATH: '/unused/vault', TINYVAULT_KEY_PATH: '/unused/key', TINYVAULT_TRIPWIRE_CANARY: CANARY } });
  return { value, input, output, events, exit, stdout: () => out, stderr: () => err };
}
function tracked(f = fixture()) {
  const order: string[] = []; const hooks: unknown[] = [];
  const host: SupervisedHost = { ...f.host,
    settleEvidence: vi.fn(async () => { order.push('settle'); await f.host.settleEvidence(); }),
    drainEvidence: vi.fn(() => { order.push('drain'); return f.host.drainEvidence(); }),
    quiesceEvidenceProducers: vi.fn(async opts => { order.push('quiesce'); hooks.push(opts); await f.host.quiesceEvidenceProducers!(opts); }),
    finish: vi.fn(() => { order.push('finish'); return f.host.finish(); }),
    abort: vi.fn(() => { order.push('abort'); f.host.abort(); }),
    closeAll: vi.fn(async () => { order.push('closeAll'); await f.host.closeAll(); }),
  };
  return { ...f, host, order, hooks };
}
function request(r: ReturnType<typeof runtime>, name = 'list_vault') {
  r.input.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { _meta: META, name, arguments: ARGS[name] } }) + '\n');
}
function inactive(f: ReturnType<typeof tracked>) { expect(() => f.host.finish()).toThrow(); }

describe('T-LIFE actual entry lifecycle with real evidence lease', () => {
  it.each(['EOF', 'SIGINT', 'SIGTERM', 'SIGHUP'])('%s closes two sessions through host quiesce hooks', async trigger => {
    const f = tracked(); await f.host.tools.browser_open_session(); await f.host.tools.browser_open_session();
    const closeTool = vi.fn(f.host.tools.browser_close_session);
    vi.spyOn(hostModule, 'createSupervisedHost').mockResolvedValue({ ...f.host, tools: { ...f.host.tools, browser_close_session: closeTool } });
    const r = runtime(); const running = start(r.value); await tick();
    if (trigger === 'EOF') r.input.end(); else r.events.emit(trigger);
    expect(await running).toBe(0); expect(r.exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(f.order).toEqual(['quiesce', 'settle', 'drain', 'settle', 'drain', 'finish', 'closeAll']);
    expect(f.hooks[0]).toMatchObject({ beforeClose: expect.any(Function), afterClose: expect.any(Function), settleTimeoutMs: 0 });
    expect(closeTool).not.toHaveBeenCalled(); expect(f.sessions.count).toBe(0);
    expect(r.stdout()).toBe(''); expect(r.stderr()).toBe('');
  });
  it('EOF waits for an unadmitted list operation before quiesce', async () => {
    const f = tracked(); await f.host.tools.browser_open_session(); await f.host.tools.browser_open_session(); let release!: () => void;
    vi.mocked(f.service.listVault).mockImplementation(async () => { await new Promise<void>(done => { release = done; }); return { items: [] }; });
    vi.spyOn(hostModule, 'createSupervisedHost').mockResolvedValue(f.host);
    const r = runtime(); const running = start(r.value); await tick(); request(r); await tick(); r.input.end(); await tick();
    expect(f.host.quiesceEvidenceProducers).not.toHaveBeenCalled(); release();
    expect(await running).toBe(0); expect(r.stdout().trim().split('\n')).toHaveLength(1);
    expect(f.order.indexOf('drain')).toBeLessThan(f.order.indexOf('quiesce'));
  });
  it('deadline cancels an abandoned handler and consumes its late rejection', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); const f = tracked(); let reject!: (error: Error) => void;
    vi.mocked(f.service.listVault).mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    vi.spyOn(hostModule, 'createSupervisedHost').mockResolvedValue(f.host);
    const r = runtime(); const running = start(r.value); await tick(); request(r); await tick(); r.events.emit('SIGTERM');
    await vi.advanceTimersByTimeAsync(SHUTDOWN_HANDLER_DEADLINE_MS);
    expect(await running).toBe(3); expect(f.host.abort).toHaveBeenCalledTimes(1); expect(f.host.closeAll).toHaveBeenCalledTimes(1);
    expect(r.stdout()).toBe(''); const before = r.stderr(); reject(new Error('x-secret-y')); await tick();
    expect(r.stdout()).toBe(''); expect(r.stderr()).toBe(before); expect(r.exit).toHaveBeenCalledExactlyOnceWith(3); inactive(f);
  });
  it('tripwire verdict is unobservable across identical wire runs', async () => {
    const outputs: unknown[] = [];
    for (const planted of [false, true]) {
      const f = tracked(); if (planted) f.lease.captureTrusted(CANARY);
      vi.spyOn(hostModule, 'createSupervisedHost').mockResolvedValue(f.host);
      const r = runtime(); const running = start(r.value); await tick(); request(r); await tick(); r.input.end();
      const code = await running; expect(r.stdout()).toContain('structuredContent'); expect(f.host.finish).toHaveReturnedWith(expect.objectContaining({ verdict: planted ? 'fail' : 'pass' }));
      outputs.push({ stdout: r.stdout(), stderr: r.stderr(), code }); vi.restoreAllMocks();
    }
    expect(outputs[0]).toEqual(outputs[1]);
  });
  it.each(['finish', 'quiesce', 'close'])('%s failure drops the lease and exits 3', async stage => {
    const f = tracked();
    if (stage === 'finish') vi.mocked(f.host.finish).mockImplementationOnce(() => { throw new Error(hostModule.FINISH_PRECONDITION_MESSAGE); });
    if (stage === 'quiesce') vi.mocked(f.host.quiesceEvidenceProducers!).mockRejectedValue(new Error(hostModule.CAPTURE_FAILED_MESSAGE));
    if (stage === 'close') vi.mocked(f.host.closeAll).mockRejectedValue(new Error('x-secret-y'));
    vi.spyOn(hostModule, 'createSupervisedHost').mockResolvedValue(f.host);
    const r = runtime(); const running = start(r.value); await tick(); r.events.emit('SIGTERM');
    expect(await running).toBe(3); expect(f.host.abort).toHaveBeenCalled(); inactive(f);
    expect(r.stdout()).toBe(''); expect(r.stderr()).not.toContain('x-secret-y');
  });
  it.each(['missing-env', 'empty-canary', 'factory', 'missing-quiesce'])('startup %s exits 4', async mode => {
    const f = tracked(); const factory = vi.spyOn(hostModule, 'createSupervisedHost').mockResolvedValue(f.host);
    const r = runtime();
    if (mode === 'missing-env') r.value.env.TINYVAULT_KEY_PATH = '';
    if (mode === 'empty-canary') r.value.env.TINYVAULT_TRIPWIRE_CANARY = '';
    if (mode === 'factory') factory.mockRejectedValue(new Error('x-secret-y'));
    if (mode === 'missing-quiesce') factory.mockResolvedValue({ ...f.host, quiesceEvidenceProducers: undefined });
    expect(await start(r.value)).toBe(4);
    if (mode === 'missing-env' || mode === 'empty-canary') expect(factory).not.toHaveBeenCalled();
    if (mode === 'missing-quiesce') { expect(f.host.abort).toHaveBeenCalled(); expect(f.host.closeAll).toHaveBeenCalled(); inactive(f); }
    expect(r.stdout()).toBe(''); expect(r.stderr()).not.toContain('x-secret-y');
  });
  it.each([false, true])('framing then normal finalization or failure=%s respects priority', async fail => {
    const f = tracked(); if (fail) vi.mocked(f.host.finish).mockImplementationOnce(() => { throw new Error('x-secret-y'); });
    vi.spyOn(hostModule, 'createSupervisedHost').mockResolvedValue(f.host);
    const r = runtime(); const running = start(r.value); await tick(); r.input.write(Buffer.from([255, 10]));
    expect(await running).toBe(fail ? 3 : 5); expect(r.stderr()).toBe('tinyvault-mcp: framing error\n');
  });
  it('output error without write callback completion aborts immediately', async () => {
    const f = tracked(); vi.spyOn(hostModule, 'createSupervisedHost').mockResolvedValue(f.host);
    const out = new Writable({ write(_chunk, _encoding, _callback) {} });
    const r = runtime(out); const running = start(r.value); await tick(); request(r); await tick();
    out.emit('error', new Error('x-secret-y'));
    expect(await running).toBe(6); expect(f.host.abort).toHaveBeenCalled(); expect(f.host.closeAll).toHaveBeenCalled(); inactive(f);
    expect(r.stderr()).toBe('');
  });
  it('post-host uncaught error is one fixed line followed by abort and close', async () => {
    const f = tracked(); vi.spyOn(hostModule, 'createSupervisedHost').mockResolvedValue(f.host);
    const r = runtime(); const running = start(r.value); await tick(); r.events.emit('uncaughtException', new Error('x-secret-y'));
    expect(await running).toBe(3); expect(r.stderr()).toBe('tinyvault-mcp: internal error\n'); inactive(f);
  });
  it.each([false, true])('startup trigger is remembered when factory rejects=%s', async fail => {
    const f = tracked(); let resolveHost!: (host: SupervisedHost) => void; let reject!: (error: Error) => void;
    vi.spyOn(hostModule, 'createSupervisedHost').mockImplementation(() => new Promise((done, failed) => { resolveHost = done; reject = failed; }));
    const r = runtime(); const running = start(r.value); r.events.emit('SIGINT'); r.events.emit('SIGTERM'); r.input.end();
    if (fail) reject(new Error('x-secret-y')); else resolveHost(f.host);
    expect(await running).toBe(fail ? 4 : 0); expect(r.exit).toHaveBeenCalledTimes(1);
    if (!fail) expect(f.host.quiesceEvidenceProducers).toHaveBeenCalledTimes(1);
  });
  it('startup contract failure dominates an already observed stdout failure', async () => {
    const f = tracked(); vi.spyOn(hostModule, 'createSupervisedHost').mockResolvedValue({ ...f.host, quiesceEvidenceProducers: undefined });
    const r = runtime(); const running = start(r.value); r.output.emit('error', new Error('x-secret-y'));
    expect(await running).toBe(4); inactive(f);
  });
});

it.each(['output', 'uncaughtException', 'unhandledRejection'])('pending host %s aborts a subsequently constructed lease', async event => {
  const f = tracked(); let resolveHost!: (host: SupervisedHost) => void;
  vi.spyOn(hostModule, 'createSupervisedHost').mockImplementation(() => new Promise(done => { resolveHost = done; }));
  const r = runtime(); const running = start(r.value);
  if (event === 'output') r.output.emit('error', new Error('x-secret-y'));
  else { r.events.emit(event, new Error('x-secret-y')); expect(r.exit).toHaveBeenCalledExactlyOnceWith(4); }
  // The immediate exit assertion is made while the factory remains unresolved.
  resolveHost(f.host); expect(await running).toBe(event === 'output' ? 6 : 4);
  expect(f.host.abort).toHaveBeenCalledTimes(1); expect(f.host.closeAll).toHaveBeenCalledTimes(1); inactive(f);
  expect(r.stderr()).toBe(event === 'output' ? '' : 'tinyvault-mcp: internal error\n');
});

it('EOF alone while startup is pending is remembered without reading request bytes', async () => {
  const f = tracked(); let resolveHost!: (host: SupervisedHost) => void;
  vi.spyOn(hostModule, 'createSupervisedHost').mockImplementation(() => new Promise(done => { resolveHost = done; }));
  const r = runtime(); const running = start(r.value); r.input.end(); await tick();
  expect(f.host.quiesceEvidenceProducers).not.toHaveBeenCalled(); resolveHost(f.host);
  expect(await running).toBe(0); expect(f.host.quiesceEvidenceProducers).toHaveBeenCalledTimes(1);
});
