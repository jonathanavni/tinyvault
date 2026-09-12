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

describe('T-ERR closed tool failures and drain', () => {
  it.each(['vault', 'open'])('preserves only the fixed %s failure', async kind => {
    const f = fixture();
    if (kind === 'vault') vi.mocked(f.service.listVault).mockRejectedValue(new Error('x-secret-y'));
    else vi.spyOn(f.sessions, 'openSession').mockRejectedValue(new Error('x-secret-y'));
    const diagnostic = vi.fn(); const wire = connection(f.host, diagnostic);
    const response = await wire.call(kind === 'vault' ? 'list_vault' : 'browser_open_session');
    expect(response.result).toEqual({ content: [{ type: 'text', text: kind === 'vault' ? 'Vault operation failed' : 'Browser session could not be opened' }],
      isError: true, resultType: 'complete', _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'tinyvault', version: '0.0.0' } } });
    expect(diagnostic).not.toHaveBeenCalled(); expect(wire.stdout()).not.toContain('x-secret-y');
    await wire.close(); f.host.abort(); await f.host.closeAll();
  });
  it('settleAttach rejection is scrubbed by the catch-all', async () => {
    const f = fixture(); let reject!: (error: Error) => void;
    const pending = new Promise<void>((_resolve, fail) => { reject = fail; }); f.lease.trackAttach(pending);
    let stderr = ''; const wire = connection(f.host, () => { stderr += 'tinyvault-mcp: internal error\n'; });
    const call = wire.call('browser_open_session'); await Promise.resolve(); reject(new Error('x-secret-y'));
    const response = await call;
    expect(response.result.isError).toBe(true); expect(response.result.content[0].text).toBe('tinyvault: internal error');
    expect(wire.stdout()).not.toContain('x-secret-y'); expect(stderr).toBe('tinyvault-mcp: internal error\n');
    await wire.close(); f.host.abort(); await f.host.closeAll();
  });
  it.each(Object.keys(ARGS))('%s drains exactly once; a rejected drain cannot alter success bytes', async name => {
    const f = fixture(); const drain = vi.fn(() => f.host.drainEvidence());
    const wire = connection({ ...f.host, drainEvidence: drain }); const first = await wire.call(name);
    expect(drain).toHaveBeenCalledTimes(1);
    drain.mockImplementation(() => { throw new Error('x-secret-y'); });
    const second = await wire.call(name);
    expect(drain).toHaveBeenCalledTimes(2); expect(second.result).toEqual(first.result);
    await wire.close(); await f.host.closeAll(); f.host.drainEvidence(); f.host.finish();
  });
  it('unknown tool and post-shutdown calls never reach a host method', async () => {
    const f = fixture(); const wire = connection(f.host);
    expect((await wire.call('unknown', {})).error.code).toBe(-32602);
    wire.server.stopAdmission(); expect((await wire.call('list_vault')).error.code).toBe(-32600);
    expect(f.service.listVault).not.toHaveBeenCalled(); await wire.close(); f.host.finish();
  });
});
