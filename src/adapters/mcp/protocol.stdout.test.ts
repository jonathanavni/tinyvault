// T-STDOUT provenance: fetched MCP 2026-07-28 basic/transports/stdio
// (one JSON-RPC message per newline; no other stdout content) and
// basic/patterns/cancellation (no messages after cancellation), preserved under
// artifacts/review-evidence/tinyvault-m8-rev5-20260911/spec/.
import { PassThrough, Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createProtocol } from './protocol';

const meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientCapabilities': {} };
const request = (id: number, method = 'tools/list', params: Record<string, unknown> = {}) =>
  ({ jsonrpc: '2.0', id, method, params: { _meta: meta, ...params } });
const tool = { name: 'list_vault', description: 'TinyVault supervised list_vault operation.',
  inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false } };
const options = { version: '0.0.0', tools: [tool], matchesSchema: () => true,
  dispatch: async () => ({ content: [{ type: 'text', text: '{"items":[]}' }],
    structuredContent: { items: [] }, isError: false }) };

describe('T-STDOUT line inventory and failure signals', () => {
  it('writes exactly one JSON-RPC line per accepted request and nothing else', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: string[] = [];
    output.on('data', (chunk: Buffer) => chunks.push(chunk.toString('utf8')));
    const protocol = createProtocol(options);
    const served = protocol.serve(input, output);
    input.end([request(0), { jsonrpc: '2.0', method: 'notifications/unknown' },
      request(1, 'tools/call', { name: 'list_vault' })]
      .map(value => `${JSON.stringify(value)}\n`).join(''));
    expect(await served).toBe('eof');
    await protocol.idle();
    const raw = chunks.join('');
    const lines = raw.trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(raw).toBe(`${lines[0]}\n${lines[1]}\n`);
    expect(lines.map(line => JSON.parse(line).id)).toEqual([0, 1]);
    expect(JSON.parse(lines[1]).result.content).toEqual([{ type: 'text', text: '{"items":[]}' }]);
  });

  it('awaits both the write callback and drain after backpressure', async () => {
    const input = new PassThrough();
    let release!: () => void;
    const output = new Writable({ highWaterMark: 1, write(_chunk, _encoding, callback) {
      release = () => callback();
    } });
    const protocol = createProtocol(options);
    const served = protocol.serve(input, output);
    input.end(`${JSON.stringify(request(0))}\n`);
    expect(await served).toBe('eof');
    await new Promise(resolve => setImmediate(resolve));
    let flushed = false;
    const flush = protocol.flush().then(() => { flushed = true; });
    await new Promise(resolve => setImmediate(resolve));
    expect(flushed).toBe(false);
    release();
    await flush;
    expect(flushed).toBe(true);
  });

  it('latches a late output error after EOF for the lifecycle owner', async () => {
    const input = new PassThrough();
    let fail!: () => void;
    const output = new Writable({ write(_chunk, _encoding, callback) {
      fail = () => callback(new Error('private write failure'));
    } });
    const abort = vi.fn();
    const closeAll = vi.fn();
    const onOutputError = vi.fn(() => { abort(); closeAll(); });
    const protocol = createProtocol({ ...options, onOutputError });
    const served = protocol.serve(input, output);
    input.end(`${JSON.stringify(request(0))}\n`);
    expect(await served).toBe('eof');
    await new Promise(resolve => setImmediate(resolve));
    fail();
    await protocol.flush();
    expect(protocol.outputFailed).toBe(true);
    expect(onOutputError).toHaveBeenCalledOnce();
    expect(abort).toHaveBeenCalledOnce();
    expect(closeAll).toHaveBeenCalledOnce();
  });

  it('returns a fatal framing signal while an earlier response is still awaiting its write', async () => {
    const input = new PassThrough();
    let release!: () => void;
    const output = new Writable({ highWaterMark: 1, write(_chunk, _encoding, callback) {
      release = () => callback();
    } });
    const protocol = createProtocol(options);
    const served = protocol.serve(input, output);
    input.write(`${JSON.stringify(request(0))}\n`);
    input.end(Buffer.from([0xff, 10]));
    expect(await served).toBe('framing');
    await new Promise(resolve => setImmediate(resolve));
    let flushed = false;
    const flush = protocol.flush().then(() => { flushed = true; });
    await new Promise(resolve => setImmediate(resolve));
    expect(flushed).toBe(false);
    release(); await flush;
    expect(protocol.outputFailed).toBe(false);
  });

  it('latches an output error event after EOF while a write is pending', async () => {
    const input = new PassThrough();
    let release!: () => void;
    const output = new Writable({ write(_chunk, _encoding, callback) {
      release = () => callback();
    } });
    const onOutputError = vi.fn();
    const protocol = createProtocol({ ...options, onOutputError });
    const served = protocol.serve(input, output);
    input.end(`${JSON.stringify(request(0))}\n`);
    expect(await served).toBe('eof');
    await new Promise(resolve => setImmediate(resolve));
    output.emit('error', new Error('private stream error'));
    expect(protocol.outputFailed).toBe(true);
    expect(onOutputError).toHaveBeenCalledOnce();
    release(); await protocol.flush();
  });

  it('keeps internal error diagnostics outside stdout', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: string[] = [];
    const stderr: string[] = [];
    output.on('data', (chunk: Buffer) => chunks.push(chunk.toString('utf8')));
    const protocol = createProtocol({ ...options,
      dispatch: async () => { throw new Error('private host value'); },
      onInternalError: () => stderr.push('tinyvault-mcp: internal error\n') });
    const served = protocol.serve(input, output);
    input.end(`${JSON.stringify(request(1, 'tools/call', { name: 'list_vault' }))}\n`);
    await served; await protocol.idle();
    expect(stderr).toEqual(['tinyvault-mcp: internal error\n']);
    const raw = chunks.join('');
    expect(raw).not.toContain('private host value');
    expect(raw).not.toContain('tinyvault-mcp: internal error');
    expect(JSON.parse(raw).result).toEqual({ resultType: 'complete',
      _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'tinyvault', version: '0.0.0' } },
      content: [{ type: 'text', text: 'tinyvault: internal error' }], isError: true });
  });
});
