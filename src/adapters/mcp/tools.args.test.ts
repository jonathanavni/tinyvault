import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
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

describe('T-ARGS validates before the executor', () => {
  it.each(Object.keys(ARGS))('%s rejects extra, missing and mistyped members', async name => {
    const f = fixture(); const spies = Object.fromEntries(Object.entries(f.host.tools).map(([key, value]) => [key, vi.fn(value)]));
    const host = { ...f.host, tools: spies as unknown as SupervisedHost['tools'] }; const wire = connection(host);
    const invalid: unknown[] = [{ ...ARGS[name], extra: true }, null, [], 2, 'text'];
    for (const key of Object.keys(ARGS[name])) {
      const missing = { ...ARGS[name] }; delete missing[key]; invalid.push(missing, { ...ARGS[name], [key]: false });
    }
    for (const args of invalid) expect((await wire.call(name, args)).error.code).toBe(-32602);
    for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
    await wire.close(); f.host.finish();
  });
  it.each(Object.keys(ARGS))('%s absent arguments and empty object acceptance', async name => {
    const f = fixture(); const open = vi.fn(f.host.tools.browser_open_session);
    const wire = connection({ ...f.host, tools: { ...f.host.tools, browser_open_session: open } });
    const empty = await wire.call(name, {});
    wire.input.write(JSON.stringify({ jsonrpc: '2.0', id: 'absent', method: 'tools/call', params: { _meta: META, name } }) + '\n');
    await wire.server.idle(); const absent = JSON.parse(wire.stdout().trim().split('\n').at(-1)!);
    if (['list_vault', 'browser_open_session'].includes(name)) {
      expect(empty.result.isError).toBe(false); expect(absent.result.isError).toBe(false);
      if (name === 'browser_open_session') expect(open.mock.calls).toEqual([[], []]);
    } else { expect(empty.error.code).toBe(-32602); expect(absent.error.code).toBe(-32602); }
    await wire.close(); await f.host.closeAll(); f.host.finish();
  });
  it('rejects per-method parameters before any host invocation', async () => {
    const f = fixture(); const wire = connection(f.host);
    for (const [id, method, params] of [[0, 'server/discover', { extra: true }], ['long-id', 'tools/list', { cursor: 4 }],
      [2, 'tools/call', { name: 'list_vault', extra: false }], [3, 'tools/call', { name: 1 }]] as const) {
      wire.input.write(JSON.stringify({ jsonrpc: '2.0', id, method, params: { _meta: META, ...params } }) + '\n');
      await wire.server.idle(); expect(JSON.parse(wire.stdout().trim().split('\n').at(-1)!).error.code).toBe(-32602);
    }
    expect(f.service.listVault).not.toHaveBeenCalled(); await wire.close(); f.host.finish();
  });
});

it('rejects invalid nested fill fields and setup enum values before host dispatch', async () => {
  const f = fixture(); const wire = connection(f.host);
  for (const field of [{ role: 'invalid', selector: '#p' }, { role: 'password', selector: 3 },
    { role: 'password', selector: '#p', value: 'x' }, { role: 'password' }, null]) {
    expect((await wire.call('fill_from_vault', { ...ARGS.fill_from_vault, fields: [field] })).error.code).toBe(-32602);
  }
  expect((await wire.call('request_vault_setup', { reason: 'invalid' })).error.code).toBe(-32602);
  expect(f.service.fill).not.toHaveBeenCalled(); expect(f.service.requestSetup).not.toHaveBeenCalled();
  await wire.close(); f.host.finish();
});
