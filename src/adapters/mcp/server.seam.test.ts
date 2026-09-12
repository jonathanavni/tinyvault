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

describe('T-SEAM supervised wire payloads', () => {
  for (const name of Object.keys(ARGS)) it(`${name}: exact legitimate host bytes`, async () => {
    const direct = fixture(); const wrapped = fixture(); const wire = connection(wrapped.host);
    const directTool = direct.host.tools[name as keyof SupervisedHost['tools']] as (args?: never) => Promise<unknown>;
    const expected = await directTool(ARGS[name] as never);
    const response = await wire.call(name);
    expect(response.result.isError).toBe(false);
    expect(response.result.structuredContent).toEqual(expected);
    expect(response.result.content).toEqual([{ type: 'text', text: JSON.stringify(expected) }]);
    await wire.close(); await direct.host.closeAll(); await wrapped.host.closeAll();
    expect(wrapped.host.finish().verdict).toBe('pass'); direct.host.drainEvidence(); direct.host.finish();
  });
  for (const name of Object.keys(ARGS).filter(name => name !== 'browser_snapshot')) {
    it(`${name}: planted payload crosses the real capture wrapper`, async () => {
      const f = fixture();
      if (name === 'list_vault') vi.mocked(f.service.listVault).mockResolvedValue(CANARY as never);
      else if (name === 'fill_from_vault') vi.mocked(f.service.fill).mockResolvedValue(outcome(CANARY));
      else if (name === 'request_vault_setup') vi.mocked(f.service.requestSetup).mockResolvedValue(CANARY as never);
      else if (name === 'browser_open_session') f.sessions.openResult = CANARY;
      else if (name === 'browser_close_session') f.sessions.closeResult = CANARY;
      else f.sessions.forced = CANARY;
      const wire = connection(f.host); const response = await wire.call(name);
      expect(response.result.isError).toBe(false); expect(response.result.content[0].text).toContain(CANARY);
      await wire.close(); await f.host.closeAll();
      expect(f.host.finish()).toMatchObject({ verdict: 'fail', diagnostics: { matched: true, transform: 'raw' } });
    });
  }
  it('snapshot keeps caller-typed canary visible and uncaptured', async () => {
    const f = fixture(); f.sessions.snapshotValue = { url: 'https://example.test', nodes: [{ tag: 'input', masked: false, value: CANARY }] };
    const wire = connection(f.host); const response = await wire.call('browser_snapshot');
    expect(response.result.content[0].text).toContain(CANARY); await wire.close();
    expect(f.host.finish().verdict).toBe('pass');
  });
  it.each(['missing_item', 'backend_locked', 'backend_unavailable'] as const)('exhausted fill then fixed setup %s', async reason => {
    const f = fixture(); vi.mocked(f.service.fill).mockResolvedValue(outcome({ ok: false, reason: 'handle-exhausted' }));
    const wire = connection(f.host); const response = await wire.call('fill_from_vault');
    expect(response.result).toMatchObject({ isError: false, structuredContent: { ok: false, reason: 'handle-exhausted' } });
    expect(response.result.content[0].text).toBe('{"ok":false,"reason":"handle-exhausted"}');
    expect(f.service.fill).toHaveBeenCalledTimes(1);
    const setup = await wire.call('request_vault_setup', { reason });
    expect(setup.result.structuredContent).toEqual(createSetupResult({ reason }));
    await wire.close(); f.host.finish();
  });
});
