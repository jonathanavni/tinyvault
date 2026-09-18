import { PassThrough } from 'node:stream';
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
import * as serverModule from './server';
import { start } from './main';
afterEach(() => vi.restoreAllMocks());
it('T-HOST: one process host, two connections, legacy state and concurrent eras', async () => {
  const f = fixture(); const identity: SupervisedHost[] = [];
  const host: SupervisedHost = { ...f.host, tools: { ...f.host.tools,
    list_vault: vi.fn(function () { identity.push(host); return f.host.tools.list_vault(); }),
    request_vault_setup: vi.fn(function (args) { identity.push(host); return f.host.tools.request_vault_setup(args); }),
  } };
  const factory = vi.spyOn(hostModule, 'createSupervisedHost').mockResolvedValue(host);
  const create = vi.spyOn(serverModule, 'createServer');
  const attach = serverModule.serve;
  vi.spyOn(serverModule, 'serve').mockImplementationOnce(() => new Promise(() => undefined));
  const first = new PassThrough(); const firstOut = new PassThrough(); let output1 = '';
  firstOut.on('data', bytes => { output1 += bytes.toString(); });
  const events = new EventEmitter(); const stderr = new PassThrough(); let err = ''; stderr.on('data', bytes => { err += bytes.toString(); });
  const exit = vi.fn();
  const runtime = Object.assign(events, { stdin: new PassThrough(), stdout: new PassThrough(), stderr, exit,
    env: { TINYVAULT_VAULT_PATH: '/unused/vault', TINYVAULT_KEY_PATH: '/unused/key', TINYVAULT_TRIPWIRE_CANARY: CANARY } });
  const running = start(runtime); await new Promise<void>(resolve => setImmediate(resolve));
  expect(factory).toHaveBeenCalledTimes(1); expect(create).toHaveBeenCalledTimes(1);
  expect(create.mock.calls[0][0]).toBe(host);
  const server = create.mock.results[0].value;
  const ended1 = attach(server, first, firstOut);
  const send = async (input: PassThrough, id: number, method: string, params: unknown = {}) => {
    input.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); await new Promise<void>(resolve => setImmediate(resolve)); await server.idle();
  };
  const init = { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } };
  await send(first, 0, 'initialize', init); await send(first, 1, 'tools/list');
  for (const id of [2, 3, 4]) await send(first, id, 'tools/call', { name: 'list_vault' });
  await send(first, 5, 'initialize', init); await send(first, 6, 'server/discover', { _meta: META });
  await send(first, 7, 'tools/call', { _meta: META, name: 'request_vault_setup', arguments: { reason: 'missing_item' } });
  await send(first, 8, 'tools/call', { name: 'list_vault' });
  first.end(); expect(await ended1).toBe('eof'); await server.idle();
  const pair2 = new PassThrough(); const pair2Out = new PassThrough(); let output2 = '';
  pair2Out.on('data', bytes => { output2 += bytes.toString(); }); const ended2 = attach(server, pair2, pair2Out);
  await send(pair2, 10, 'tools/call', { name: 'list_vault' });
  await send(pair2, 11, 'tools/call', { _meta: META, name: 'list_vault' }); await send(pair2, 12, 'initialize', init);
  pair2.end(); expect(await ended2).toBe('eof'); await server.idle();
  expect(factory).toHaveBeenCalledTimes(1); expect(create).toHaveBeenCalledTimes(1);
  expect(JSON.parse(output1.trim().split('\n').find(line => JSON.parse(line).id === 5)!).error.code).toBe(-32600);
  expect(JSON.parse(output2.trim().split('\n').at(-1)!).error.code).toBe(-32600);
  expect(identity).toHaveLength(7); identity.forEach(seen => expect(seen).toBe(host));
  events.emit('SIGTERM'); expect(await running).toBe(0); expect(err).toBe('');
});

it('createServer(host) supports the locked one-argument factory API', async () => {
  const f = fixture(); const server = createServer(f.host);
  const input = new PassThrough(); const output = new PassThrough(); let raw = '';
  output.on('data', bytes => { raw += bytes.toString(); });
  const ended = serve(server, input, output);
  input.end(JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'server/discover', params: { _meta: META } }) + '\n');
  expect(await ended).toBe('eof'); await server.idle();
  expect(JSON.parse(raw).result._meta['io.modelcontextprotocol/serverInfo']).toEqual({ name: 'tinyvault', version: '0.1.0' });
  f.host.abort();
});
