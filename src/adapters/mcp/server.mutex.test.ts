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

import { EventEmitter } from 'node:events';
import { createBrowserSessionHost } from '../../browser/session';
import { SessionHostError } from '../../core/browserPort';
import { createLockdownDomain } from '../../supervisor/lockdownDomain';
const tick = () => new Promise<void>(done => setImmediate(done));
function realSessions() {
  const order: string[] = []; let release!: () => void;
  const held = new Promise<void>(done => { release = done; });
  const cdp = Object.assign(new EventEmitter(), {
    send: async (method: string, params?: Record<string, any>): Promise<any> => {
      if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'main', loaderId: 'document' } } };
      if (method === 'DOM.getDocument') return { root: { nodeId: 1 } };
      if (method === 'DOM.querySelector') return { nodeId: 2 };
      if (method === 'DOM.describeNode') return { node: { backendNodeId: 7 } };
      if (method === 'Page.createIsolatedWorld') return { executionContextId: 40 };
      if (method === 'DOM.resolveNode') return { object: { objectId: 'object' } };
      if (method === 'Runtime.callFunctionOn') {
        const text = params?.arguments?.[0]?.value;
        order.push(`start:${text}`); if (text === 'first') await held; order.push(`end:${text}`);
        return { result: { value: true } };
      }
      return {};
    }, detach: async () => undefined,
  });
  const page = Object.assign(new EventEmitter(), { url: () => 'https://example.test',
    waitForLoadState: async () => undefined, waitForEvent: async () => undefined });
  let closed = false;
  const context = Object.assign(new EventEmitter(), {
    browser: () => ({ contexts: () => closed ? [] : [context] }), newPage: async () => page,
    newCDPSession: async () => cdp,
    close: async () => { closed = true; page.emit('close'); context.emit('close'); },
  });
  const domain = createLockdownDomain();
  const sessions = createBrowserSessionHost({ newContext: async () => context as never,
    authority: domain.authority, registry: domain.registry, lifecycle: domain.lifecycle });
  const base = fixture();
  const service: FillService = { ...base.service, fill: vi.fn(async request => {
    try { return await sessions.runExclusive(request.sessionId, async () => outcome()); }
    catch (error) {
      if (error instanceof SessionHostError) return outcome({ ok: false, reason: 'session-unknown' });
      throw error;
    }
  }) };
  base.host.abort();
  const lease = new EvidenceLease(CANARY); const host = composeSupervisedHost({ fillService: service, sessions, lease });
  return { host, sessions, service, order, release };
}
describe('T-MUTEX caller paths', () => {
  it.each([false, true])('adapter serializes back-to-back calls, queued cancellation=%s', async cancel => {
    const f = fixture(); const order: string[] = []; let release!: () => void;
    const held = new Promise<void>(done => { release = done; });
    const original = f.host.tools.browser_type;
    const host = { ...f.host, tools: { ...f.host.tools, browser_type: vi.fn(async args => {
      order.push(`start:${args.text}`); if (args.text === 'first') await held;
      const result = await original(args); order.push(`end:${args.text}`); return result;
    }), list_vault: vi.fn(async () => { order.push('list'); return f.host.tools.list_vault(); }) } };
    const wire = connection(host);
    const write = (id: number, name: string, args: unknown) => wire.input.write(JSON.stringify({ jsonrpc: '2.0', id,
      method: 'tools/call', params: { _meta: META, name, arguments: args } }) + '\n');
    write(1, 'browser_type', { ...ARGS.browser_type, text: 'first' });
    write(2, 'browser_type', { ...ARGS.browser_type, text: 'second' }); write(3, 'list_vault', {});
    if (cancel) wire.input.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 2 } }) + '\n');
    await tick(); expect(order).toEqual(['start:first']); release(); await wire.server.idle();
    expect(order).toEqual(cancel ? ['start:first', 'end:first', 'list'] : ['start:first', 'end:first', 'start:second', 'end:second', 'list']);
    expect(wire.stdout().trim().split('\n').map(line => JSON.parse(line).id)).toEqual(cancel ? [1, 3] : [1, 2, 3]);
    await wire.close(); f.host.finish();
  });
  it('real host mutex serializes concurrent browser_type calls without the adapter', async () => {
    const f = realSessions(); const { sessionId } = await f.host.tools.browser_open_session();
    const first = f.host.tools.browser_type({ sessionId, selector: '#field', text: 'first' });
    const second = f.host.tools.browser_type({ sessionId, selector: '#field', text: 'second' });
    await tick(); expect(f.order).toEqual(['start:first']); f.release();
    expect(await first).toEqual({ ok: true }); expect(await second).toEqual({ ok: true });
    expect(f.order).toEqual(['start:first', 'end:first', 'start:second', 'end:second']);
    await f.host.closeAll(); f.host.drainEvidence(); f.host.finish();
  });
  it.each(['close-first', 'fill-first', 'never-issued'])('close/fill linearization %s over real session host', async mode => {
    const f = realSessions(); const opened = await f.host.tools.browser_open_session();
    const wire = connection(f.host); const sessionId = mode === 'never-issued' ? 'never-issued' : opened.sessionId;
    const args = { ...ARGS.fill_from_vault, sessionId };
    if (mode === 'close-first') expect((await wire.call('browser_close_session', { sessionId })).result.structuredContent).toEqual({ ok: true });
    const response = await wire.call('fill_from_vault', args);
    const expected = mode === 'fill-first' ? { ok: true, filled: ['password'] } : { ok: false, reason: 'session-unknown' };
    expect(response.result.isError).toBe(false); expect(response.result.content[0].text).toBe(JSON.stringify(expected));
    if (mode === 'fill-first') expect((await wire.call('browser_close_session', { sessionId })).result.content[0].text).toBe('{"ok":true}');
    await wire.close(); await f.host.closeAll(); f.host.drainEvidence(); f.host.finish();
  });
});
