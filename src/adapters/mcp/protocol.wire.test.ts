// T-WIRE provenance: https://modelcontextprotocol.io/specification/2026-07-28/basic/index
// (Requests, Notifications, _meta), /server/discover (DiscoverResult), /server/tools
// (Calling Tools), /basic/versioning (Serving Multiple Protocol Versions),
// /server/utilities/caching (Caching Hints), and
// https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
// (Initialization). Preserved at
// artifacts/review-evidence/tinyvault-m8-rev5-20260911/spec/; wire shapes below
// also reproduce the inbound requests in probe/run1.log, run2b.log and run6.log
// from the same evidence tree (synthetic client probe, 2026-09-12).
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createProtocol, MAX_LINE_BYTES, type ProtocolOptions } from './protocol';

const VERSION = 'io.modelcontextprotocol/protocolVersion';
const CAPS = 'io.modelcontextprotocol/clientCapabilities';
const INFO = 'io.modelcontextprotocol/clientInfo';
const SERVER = 'io.modelcontextprotocol/serverInfo';
const tool = { name: 'list_vault', description: 'TinyVault supervised list_vault operation.',
  inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false } };
const payload = { content: [{ type: 'text', text: '{"items":[]}' }],
  structuredContent: { items: [] }, isError: false };
const modernMeta = { [VERSION]: '2026-07-28', [INFO]: { name: 'claude-code', title: 'Claude Code',
  version: '2.1.258', description: "Anthropic's agentic coding tool",
  websiteUrl: 'https://claude.com/claude-code' },
  [CAPS]: { roots: { listChanged: true }, elicitation: {} } };
const modern = (id: string | number, method: string, params: Record<string, unknown> = {}) =>
  ({ jsonrpc: '2.0', id, method, params: { _meta: modernMeta, ...params } });
const legacyInit = (id: string | number = 0, version = '2025-11-25') => ({
  method: 'initialize',
  params: { protocolVersion: version, capabilities: { roots: { listChanged: true }, elicitation: {} },
    clientInfo: { name: 'claude-code', title: 'Claude Code', version: '2.1.258',
      description: "Anthropic's agentic coding tool", websiteUrl: 'https://claude.com/claude-code' } },
  jsonrpc: '2.0', id,
});

// Exact inbound JSON object bytes after ` in ` in the three preserved probe logs.
const RUN6_DISCOVER = `{"jsonrpc":"2.0","id":"server-discover-probe-1","method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"claude-code","title":"Claude Code","version":"2.1.258","description":"Anthropic's agentic coding tool","websiteUrl":"https://claude.com/claude-code"},"io.modelcontextprotocol/clientCapabilities":{"roots":{"listChanged":true},"elicitation":{}}}}}`;
const RUN6_LIST = `{"method":"tools/list","jsonrpc":"2.0","id":0,"params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"claude-code","title":"Claude Code","version":"2.1.258","description":"Anthropic's agentic coding tool","websiteUrl":"https://claude.com/claude-code"},"io.modelcontextprotocol/clientCapabilities":{"roots":{"listChanged":true},"elicitation":{}}}}}`;
const RUN6_CALL = `{"method":"tools/call","params":{"name":"probe_echo","arguments":{"text":"one"},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"claude-code","title":"Claude Code","version":"2.1.258","description":"Anthropic's agentic coding tool","websiteUrl":"https://claude.com/claude-code"},"io.modelcontextprotocol/clientCapabilities":{"roots":{"listChanged":true},"elicitation":{}},"claudecode/toolUseId":"toolu_01NBCcb5c1Wn3Ejaau4HbeK9","progressToken":1}},"jsonrpc":"2.0","id":1}`;
const RUN1_INIT = `{"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{"roots":{"listChanged":true},"elicitation":{}},"clientInfo":{"name":"claude-code","title":"Claude Code","version":"2.1.258","description":"Anthropic's agentic coding tool","websiteUrl":"https://claude.com/claude-code"}},"jsonrpc":"2.0","id":0}`;
const RUN2B_CALL = `{"method":"tools/call","params":{"name":"probe_echo","arguments":{"text":"one"},"_meta":{"claudecode/toolUseId":"toolu_01MNGo5iMdfEAW9aP4iuf9wN","progressToken":2}},"jsonrpc":"2.0","id":2}`;

function setup(overrides: Partial<ProtocolOptions> = {}) {
  const input = new PassThrough();
  const output = new PassThrough();
  const raw: string[] = [];
  output.on('data', (chunk: Buffer) => raw.push(chunk.toString('utf8')));
  const dispatch = vi.fn(async () => payload);
  const protocol = createProtocol({ version: '0.0.0', tools: [tool], dispatch,
    matchesSchema: () => true, ...overrides });
  const served = protocol.serve(input, output);
  return { input, output, raw, dispatch, protocol, served };
}

async function drive(...messages: unknown[]) {
  const h = setup();
  h.input.end(messages.map(message => `${JSON.stringify(message)}\n`).join(''));
  expect(await h.served).toBe('eof');
  await h.protocol.idle();
  return { lines: h.raw.join('').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)),
    dispatch: h.dispatch };
}

describe('T-WIRE exact envelopes and eras', () => {
  it('accepts the five preserved probe requests with their original member order', async () => {
    const probeTool = { name: 'probe_echo', description: 'Synthetic probe tool. Echoes its argument.',
      inputSchema: { type: 'object', properties: { text: { type: 'string' } },
        required: ['text'], additionalProperties: false } };
    for (const raw of [RUN6_DISCOVER, RUN6_LIST, RUN6_CALL, RUN1_INIT, RUN2B_CALL]) {
      expect(JSON.stringify(JSON.parse(raw))).toBe(raw);
    }
    const modernInput = new PassThrough(); const modernOutput = new PassThrough();
    const modernRaw: string[] = [];
    modernOutput.on('data', (chunk: Buffer) => modernRaw.push(chunk.toString('utf8')));
    const protocol = createProtocol({ version: '0.0.0', tools: [probeTool],
      dispatch: async () => payload, matchesSchema: () => true });
    const modernServe = protocol.serve(modernInput, modernOutput);
    modernInput.end(`${RUN6_DISCOVER}\n${RUN6_LIST}\n${RUN6_CALL}\n`);
    await modernServe; await protocol.idle();
    const modernLines = modernRaw.join('').trim().split('\n').map(line => JSON.parse(line));
    expect(modernLines.map(line => line.id)).toEqual(['server-discover-probe-1', 0, 1]);
    expect(modernLines.every(line => 'result' in line && !('error' in line))).toBe(true);
    const legacyInput = new PassThrough(); const legacyOutput = new PassThrough();
    const legacyRaw: string[] = [];
    legacyOutput.on('data', (chunk: Buffer) => legacyRaw.push(chunk.toString('utf8')));
    const legacyServe = protocol.serve(legacyInput, legacyOutput);
    legacyInput.write(`${RUN1_INIT}\n`);
    await protocol.idle();
    legacyInput.end(`${RUN2B_CALL}\n`);
    await legacyServe; await protocol.idle();
    const legacyLines = legacyRaw.join('').trim().split('\n').map(line => JSON.parse(line));
    expect(legacyLines.map(line => line.id)).toEqual([0, 2]);
    expect(legacyLines.every(line => 'result' in line && !('error' in line))).toBe(true);
  });

  it('serves the measured modern discovery, list, and call shapes', async () => {
    const { lines, dispatch } = await drive(
      modern('server-discover-probe-1', 'server/discover'),
      modern(0, 'tools/list'),
      modern(1, 'tools/call', { name: 'list_vault', arguments: {},
        _meta: { ...modernMeta, progressToken: 2, 'claudecode/toolUseId': 'toolu_probe' } }),
    );
    const meta = { [SERVER]: { name: 'tinyvault', version: '0.0.0' } };
    expect(lines).toEqual([
      { jsonrpc: '2.0', id: 'server-discover-probe-1', result: {
        resultType: 'complete', _meta: meta, supportedVersions: ['2026-07-28'],
        capabilities: { tools: {} }, ttlMs: 0, cacheScope: 'public' } },
      { jsonrpc: '2.0', id: 0, result: { resultType: 'complete', _meta: meta,
        tools: [tool], ttlMs: 0, cacheScope: 'public' } },
      { jsonrpc: '2.0', id: 1, result: { resultType: 'complete', _meta: meta, ...payload } },
    ]);
    expect(Object.keys(lines[0].result._meta)).toEqual([SERVER]);
    expect(dispatch).toHaveBeenCalledExactlyOnceWith('list_vault', {});
  });

  it('retains process-scoped legacy state while modern requests remain stateless', async () => {
    const h = setup();
    h.input.write([modern('m1', 'server/discover'), legacyInit()]
      .map(message => `${JSON.stringify(message)}\n`).join(''));
    await h.protocol.idle();
    h.input.end([
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: { name: 'list_vault', _meta: { progressToken: 2, 'claudecode/toolUseId': 'toolu_probe' } } },
      modern('m2', 'tools/list'),
      { jsonrpc: '2.0', id: 3, method: 'initialize', params: legacyInit().params },
    ].map(message => `${JSON.stringify(message)}\n`).join(''));
    await h.served; await h.protocol.idle();
    const lines = h.raw.join('').trim().split('\n').map(line => JSON.parse(line));
    expect(lines.map(line => line.id)).toEqual(['m1', 0, 1, 2, 'm2', 3]);
    expect(lines[1].result).toEqual({ protocolVersion: '2025-11-25', capabilities: { tools: {} },
      serverInfo: { name: 'tinyvault', version: '0.0.0' } });
    expect(lines[2].result).toEqual({ tools: [tool] });
    expect(lines[3].result).toEqual(payload);
    expect(lines[4].result.resultType).toBe('complete');
    expect(lines[5].error).toEqual({ code: -32600, message: 'Invalid request' });
    expect(h.protocol.legacyInitialized).toBe(true);
  });

  it('negotiates both legacy revisions and defaults an unsupported proposal', async () => {
    const { lines } = await drive(legacyInit(0, '2025-06-18'));
    expect(lines[0].result.protocolVersion).toBe('2025-06-18');
    const fallback = await drive(legacyInit(0, '1999-01-01'));
    expect(fallback.lines[0].result.protocolVersion).toBe('2025-11-25');
    const withMeta = await drive({ ...legacyInit(), params: { ...legacyInit().params,
      _meta: { progressToken: 1, 'claudecode/toolUseId': 'toolu_probe' } } });
    expect(withMeta.lines[0].result.protocolVersion).toBe('2025-11-25');
  });

  it.each([
    [modern(1, 'unknown'), -32601],
    [modern(1, 'ping'), -32601],
    [modern(1, 'initialize'), -32601],
    [modern(1, 'tinyvault/renew'), -32601],
    [modern(1, 'authorization/renew'), -32601],
    [modern(1, 'fill/renew'), -32601],
    [modern(1, 'tools/list', { cursor: 4 }), -32602],
    [modern(1, 'server/discover', { extra: true }), -32602],
    [modern(1, 'tools/call', { name: 'missing' }), -32602],
    [modern(1, 'tools/call', { name: 'list_vault', arguments: null }), -32602],
    [modern(1, 'tools/call', { name: 'list_vault', extra: true }), -32602],
    [modern(1, 'tools/call', { name: 7 }), -32602],
    [modern(1, 'tools/call', { name: 'list_vault', arguments: [] }), -32602],
    [modern(1, 'tools/list', { inputResponses: [] }), -32602],
    [modern(1, 'tools/list', { requestState: {} }), -32602],
    [{ ...modern(1, 'tools/list'), params: { _meta: { [VERSION]: {}, [CAPS]: {} } } }, -32602],
    [{ ...modern(1, 'tools/list'), params: { _meta: { [VERSION]: 'x'.repeat(65), [CAPS]: {} } } }, -32602],
    [{ ...modern(1, 'tools/list'), params: { _meta: { [VERSION]: '2026-07-28', [CAPS]: [] } } }, -32602],
    [{ ...modern(1, 'tools/list'), params: { _meta: { [VERSION]: '2026-07-28' } } }, -32602],
    [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }, -32602],
    [{ ...modern(1, 'tools/list'), params: { _meta: { [VERSION]: 'é'.repeat(33), [CAPS]: {} } } }, -32602],
  ])('applies method, param and metadata validation', async (request, code) => {
    const { lines, dispatch } = await drive(request);
    expect(lines).toHaveLength(1);
    expect(lines[0].error.code).toBe(code);
    expect(Object.keys(lines[0])).toEqual(['jsonrpc', 'id', 'error']);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('reports unsupported modern versions before looking up the method', async () => {
    const { lines } = await drive({ ...modern(7, 'does/not/exist'),
      params: { _meta: { [VERSION]: '2028-01-01', [CAPS]: {} } } });
    expect(lines).toEqual([{ jsonrpc: '2.0', id: 7, error: {
      code: -32022, message: 'Unsupported protocol version',
      data: { supported: ['2026-07-28'], requested: '2028-01-01' } } }]);
  });

  it('accepts optional metadata values without inspecting them', async () => {
    const meta = { ...modernMeta, [INFO]: null, 'io.modelcontextprotocol/logLevel': 7,
      progressToken: [], 'vendor.example/trace': { anything: true } };
    const { lines } = await drive({ ...modern(1, 'tools/list'), params: { _meta: meta } });
    expect(lines[0].result.tools).toEqual([tool]);
  });

  it('rejects shape failures and continues after a parse failure', async () => {
    const h = setup();
    h.input.end('{bad json}\nnull\n[]\n{"jsonrpc":"2.0","method":"tools/list"}\n' +
      `${JSON.stringify(modern(0, 'tools/list'))}\n`);
    await h.served; await h.protocol.idle();
    const lines = h.raw.join('').trim().split('\n').map(line => JSON.parse(line));
    expect(lines.map(line => line.error?.code ?? 0)).toEqual([-32700, -32700, -32600, -32600, 0]);
    expect(lines.slice(0, 3).map(line => line.id)).toEqual([null, null, null]);
  });

  it.each([
    [{ jsonrpc: '2.0', id: null, method: 'tools/list' }, null],
    [{ jsonrpc: '2.0', id: 1.5, method: 'tools/list' }, null],
    [{ jsonrpc: '1.0', id: 7, method: 'tools/list' }, 7],
    [{ jsonrpc: '2.0', id: 9, method: 4 }, 9],
    [{ ...modern(8, 'tools/list'), jsonrpc: '1.0',
      params: { _meta: { [VERSION]: 'wrong', [CAPS]: {} } } }, 8],
  ])('applies JSON-RPC shape before era and method checks', async (request, id) => {
    const { lines } = await drive(request);
    expect(lines).toEqual([{ jsonrpc: '2.0', id,
      error: { code: -32600, message: 'Invalid request' } }]);
  });

  it('ignores inbound responses and malformed notifications without output', async () => {
    const { lines } = await drive(
      { jsonrpc: '2.0', id: 1, result: {} },
      { jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 'unknown' } },
      { jsonrpc: '2.0', method: 'notifications/cancelled', params: null },
      { jsonrpc: '2.0', method: 'notifications/unknown' },
      modern(2, 'tools/list'),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].id).toBe(2);
  });

  it('ignores an ID-bearing cancellation without cancelling its target (M8-C1)', async () => {
    const dispatch = vi.fn(async () => payload);
    const h = setup({ dispatch });
    h.input.end([
      modern(0, 'tools/call', { name: 'list_vault' }),
      { jsonrpc: '2.0', id: 99, method: 'notifications/cancelled', params: { requestId: 0 } },
      { jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 0, reason: 7 } },
      { jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 0, extra: true } },
      modern(1, 'tools/list'),
    ].map(message => `${JSON.stringify(message)}\n`).join(''));
    await h.served; await h.protocol.idle();
    expect(h.raw.join('').trim().split('\n').map(line => JSON.parse(line).id)).toEqual([0, 1]);
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it('rejects schema-invalid arguments before dispatch', async () => {
    const dispatch = vi.fn(async () => payload);
    const h = setup({ dispatch, matchesSchema: () => false });
    h.input.end(`${JSON.stringify(modern(1, 'tools/call', {
      name: 'list_vault', arguments: { unexpected: true } }))}\n`);
    await h.served; await h.protocol.idle();
    expect(JSON.parse(h.raw.join('')).error).toEqual({ code: -32602, message: 'Invalid params' });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('validates initialize and ping params and ignores premature initialized', async () => {
    const invalid = [
      { ...legacyInit(), params: { ...legacyInit().params, extra: true } },
      { ...legacyInit(), params: { ...legacyInit().params, _meta: null } },
      { ...legacyInit(), params: { ...legacyInit().params, clientInfo: { name: 'client' } } },
      { ...legacyInit(), params: { ...legacyInit().params, capabilities: [] } },
      { ...legacyInit(), params: { ...legacyInit().params, protocolVersion: 7 } },
      { ...legacyInit(), params: null },
    ];
    for (const request of invalid) {
      const { lines } = await drive(request);
      expect(lines).toEqual([{ jsonrpc: '2.0', id: 0,
        error: { code: -32602, message: 'Invalid params' } }]);
    }
    const h = setup();
    h.input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    expect(h.protocol.legacyInitialized).toBe(false);
    h.input.write(`${JSON.stringify(legacyInit())}\n`);
    await h.protocol.idle();
    expect(h.protocol.legacyInitialized).toBe(false);
    h.input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized',
      params: { extra: true } })}\n`);
    await new Promise(resolve => setImmediate(resolve));
    expect(h.protocol.legacyInitialized).toBe(false);
    h.input.end([
      { jsonrpc: '2.0', id: 1, method: 'ping', params: { extra: true } },
      { jsonrpc: '2.0', id: 2, method: 'ping', params: { _meta: { progressToken: [] } } },
      { jsonrpc: '2.0', id: 3, method: 'tools/list', params: { _meta: null } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
    ].map(message => `${JSON.stringify(message)}\n`).join(''));
    await h.served; await h.protocol.idle();
    const lines = h.raw.join('').trim().split('\n').map(line => JSON.parse(line));
    expect(lines.map(line => line.error?.code ?? 0)).toEqual([0, -32602, 0, -32602]);
    expect(lines[2].result).toEqual({});
    expect(h.protocol.legacyInitialized).toBe(true);
    const preInitPing = await drive({ jsonrpc: '2.0', id: 0, method: 'ping' });
    expect(preInitPing.lines).toEqual([{ jsonrpc: '2.0', id: 0, result: {} }]);
  });

  it('rejects pre-response legacy work while a queued ping waits for initialize', async () => {
    const h = setup();
    h.input.end([
      legacyInit(),
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ].map(message => `${JSON.stringify(message)}\n`).join(''));
    await h.served; await h.protocol.idle();
    const lines = h.raw.join('').trim().split('\n').map(line => JSON.parse(line));
    expect(lines.map(line => line.id)).toEqual([0, 1, 2]);
    expect(lines[1].result).toEqual({});
    expect(lines[2].error).toEqual({ code: -32600, message: 'Invalid request' });
  });

  it('remembers a ping ID queued behind initialize once the legacy session succeeds', async () => {
    const h = setup();
    h.input.write(`${JSON.stringify(legacyInit())}\n${JSON.stringify({ jsonrpc: '2.0',
      id: 1, method: 'ping' })}\n`);
    await h.protocol.idle();
    h.input.end(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })}\n`);
    await h.served; await h.protocol.idle();
    const lines = h.raw.join('').trim().split('\n').map(line => JSON.parse(line));
    expect(lines.map(line => line.error?.code ?? 0)).toEqual([0, 0, -32600]);
  });

  it('rejects legacy renewal-shaped and unknown methods with -32601', async () => {
    const h = setup();
    h.input.write(`${JSON.stringify(legacyInit())}\n`);
    await h.protocol.idle();
    h.input.end(['tinyvault/renew', 'authorization/renew', 'fill/renew', 'other/method']
      .map((method, index) => `${JSON.stringify({ jsonrpc: '2.0', id: index + 1, method })}\n`).join(''));
    await h.served; await h.protocol.idle();
    const lines = h.raw.join('').trim().split('\n').map(line => JSON.parse(line));
    expect(lines.slice(1).map(line => line.error.code)).toEqual([-32601, -32601, -32601, -32601]);
  });

  it('rejects legacy ID reuse after a completed request and after cancellation', async () => {
    const h = setup();
    h.input.write(`${JSON.stringify(legacyInit())}\n`);
    await new Promise(resolve => setImmediate(resolve));
    h.input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })}\n`);
    h.input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } })}\n`);
    h.input.end(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })}\n`);
    await h.served; await h.protocol.idle();
    const lines = h.raw.join('').trim().split('\n').map(line => JSON.parse(line));
    expect(lines.at(-1).error.code).toBe(-32600);
  });

  it('remembers the ID of a cancelled queued legacy request', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const dispatch = vi.fn(async () => { await gate; return payload; });
    const h = setup({ dispatch });
    h.input.write(`${JSON.stringify(legacyInit())}\n`);
    await h.protocol.idle();
    h.input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'list_vault' } })}\n`);
    h.input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'list_vault' } })}\n`);
    await new Promise(resolve => setImmediate(resolve));
    h.input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled',
      params: { requestId: 2 } })}\n`);
    h.input.end(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
    release(); await h.served; await h.protocol.idle();
    const lines = h.raw.join('').trim().split('\n').map(line => JSON.parse(line));
    expect(lines.filter(line => line.id === 2)).toEqual([{ jsonrpc: '2.0', id: 2,
      error: { code: -32600, message: 'Invalid request' } }]);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('suppresses an in-flight response and never starts a cancelled queued call', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const dispatch = vi.fn(async () => { await gate; return payload; });
    const h = setup({ dispatch });
    h.input.write(`${JSON.stringify(modern(1, 'tools/call', { name: 'list_vault' }))}\n`);
    h.input.write(`${JSON.stringify(modern(2, 'tools/call', { name: 'list_vault' }))}\n`);
    await new Promise(resolve => setImmediate(resolve));
    expect(dispatch).toHaveBeenCalledTimes(1);
    h.input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled',
      params: { requestId: 1, reason: 'client moved on', _meta: { progressToken: 3 } } })}\n`);
    h.input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled',
      params: { requestId: 2 } })}\n`);
    h.input.end(`${JSON.stringify(modern(3, 'tools/list'))}\n`);
    release();
    await h.served; await h.protocol.idle();
    expect(h.raw.join('').trim().split('\n').map(line => JSON.parse(line).id)).toEqual([3]);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('rejects the 65th outstanding request and permits completed modern ID reuse', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const h = setup({ dispatch: async () => { await gate; return payload; } });
    for (let id = 0; id < 64; id++) {
      h.input.write(`${JSON.stringify(modern(id, 'tools/call', { name: 'list_vault' }))}\n`);
    }
    h.input.end(`${JSON.stringify(modern(64, 'tools/list'))}\n`);
    await h.served;
    await h.protocol.flush();
    expect(JSON.parse(h.raw.join('').trim().split('\n')[0])).toEqual({ jsonrpc: '2.0', id: 64,
      error: { code: -32600, message: 'Invalid request' } });
    release(); await h.protocol.idle();
    const repeat = setup();
    repeat.input.write(`${JSON.stringify(modern(0, 'tools/list'))}\n`);
    await repeat.protocol.idle();
    repeat.input.end(`${JSON.stringify(modern(0, 'tools/list'))}\n`);
    await repeat.served; await repeat.protocol.idle();
    expect(repeat.raw.join('').trim().split('\n').map(line => JSON.parse(line).id)).toEqual([0, 0]);
  });

  it('rejects a duplicate outstanding ID and queued requests when admission stops', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const dispatch = vi.fn(async () => { await gate; return payload; });
    const h = setup({ dispatch });
    h.input.write(`${JSON.stringify(modern(1, 'tools/call', { name: 'list_vault' }))}\n`);
    h.input.write(`${JSON.stringify(modern(1, 'tools/list'))}\n`);
    h.input.write(`${JSON.stringify(modern(2, 'tools/call', { name: 'list_vault' }))}\n`);
    await new Promise(resolve => setImmediate(resolve));
    h.protocol.stopAdmission();
    h.input.end(`${JSON.stringify(modern(3, 'tools/list'))}\n`);
    release();
    await h.served; await h.protocol.idle();
    const lines = h.raw.join('').trim().split('\n').map(line => JSON.parse(line));
    expect(lines.filter(line => line.error?.code === -32600).map(line => line.id)).toEqual([1, 2, 3]);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('keeps a successful legacy negotiation across two sequential connections', async () => {
    const protocol = createProtocol({ version: '0.0.0', tools: [tool], dispatch: async () => payload,
      matchesSchema: () => true });
    const firstInput = new PassThrough(); const firstOutput = new PassThrough();
    const firstRaw: string[] = [];
    firstOutput.on('data', (chunk: Buffer) => firstRaw.push(chunk.toString('utf8')));
    const first = protocol.serve(firstInput, firstOutput);
    firstInput.end(`${JSON.stringify(legacyInit())}\n`);
    await first; await protocol.idle();
    expect(JSON.parse(firstRaw.join('')).result.protocolVersion).toBe('2025-11-25');
    const secondInput = new PassThrough(); const secondOutput = new PassThrough();
    const secondRaw: string[] = [];
    secondOutput.on('data', (chunk: Buffer) => secondRaw.push(chunk.toString('utf8')));
    const second = protocol.serve(secondInput, secondOutput);
    secondInput.end([
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_vault' } },
      modern('m', 'tools/list'),
      legacyInit(2),
    ].map(message => `${JSON.stringify(message)}\n`).join(''));
    await second; await protocol.idle();
    const lines = secondRaw.join('').trim().split('\n').map(line => JSON.parse(line));
    expect(lines[0].result).toEqual(payload);
    expect(lines[1].result.resultType).toBe('complete');
    expect(lines[2].error.code).toBe(-32600);
  });

  it('supports a line split across chunks and rejects fatal UTF-8 and oversized lines', async () => {
    const h = setup();
    const line = Buffer.from(`${JSON.stringify(modern(0, 'tools/list'))}\n`);
    h.input.write(line.subarray(0, 11));
    h.input.end(line.subarray(11));
    expect(await h.served).toBe('eof'); await h.protocol.idle();
    expect(h.raw.join('').trim().split('\n')).toHaveLength(1);
    const bad = setup(); bad.input.end(Buffer.from([0xff, 10]));
    expect(await bad.served).toBe('framing');
    const huge = setup(); huge.input.end(Buffer.alloc(MAX_LINE_BYTES + 1, 0x61));
    expect(await huge.served).toBe('framing');
  });

  it('counts a multibyte code point at the one MiB byte boundary', async () => {
    const base = { ...modern(1, 'tools/list'), padding: '' };
    const padding = MAX_LINE_BYTES - Buffer.byteLength(JSON.stringify(base)) - Buffer.byteLength('🦊');
    const line = JSON.stringify({ ...base, padding: 'x'.repeat(padding) + '🦊' });
    expect(Buffer.byteLength(line)).toBe(MAX_LINE_BYTES);
    const bytes = Buffer.from(`${line}\n`);
    const split = bytes.lastIndexOf(Buffer.from('🦊')) + 2;
    const h = setup();
    h.input.write(bytes.subarray(0, split));
    h.input.end(bytes.subarray(split));
    expect(await h.served).toBe('eof'); await h.protocol.idle();
    expect(JSON.parse(h.raw.join('')).id).toBe(1);
    const over = setup();
    over.input.end(`${line}x\n`);
    expect(await over.served).toBe('framing');
  });
});
