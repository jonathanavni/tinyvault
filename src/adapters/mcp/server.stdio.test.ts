import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { build } from 'esbuild';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { generateLocalVaultKey, writeLocalVault } from '../../backends/localFileWriter';
import { createSetupResult } from '../../core/results';
import { TOOLS } from './tools';

const META = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientCapabilities': {} };
const version = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')).version;
const COMPLETE = { resultType: 'complete', _meta: {
  'io.modelcontextprotocol/serverInfo': { name: 'tinyvault', version },
} };
type Reply = { jsonrpc: '2.0'; id: string | number; result: Record<string, any> };
type Exit = { code: number | null; signal: NodeJS.Signals | null };
type ProcessRow = { pid: number; ppid: number; command: string };
let directory: string;
let bundlePath: string;
let env: NodeJS.ProcessEnv;
let items: Awaited<ReturnType<typeof writeLocalVault>>;
const children: { child: { kill(signal: NodeJS.Signals): boolean; stdout: { resume(): unknown } };
  exitResult(): Exit | undefined; closed: Promise<Exit> }[] = [];

async function within<T>(work: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(label)), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

async function eventually(predicate: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(label);
    await delay(10);
  }
}

function launch() {
  const child = spawn(process.execPath, [bundlePath], { env: env, stdio: 'pipe', shell: false });
  let stdout = ''; let stderr = ''; let startupError: Error | undefined;
  let exitResult: Exit | undefined;
  child.stdout.on('data', bytes => { stdout += bytes.toString('utf8'); });
  child.stderr.on('data', bytes => { stderr += bytes.toString('utf8'); });
  child.on('error', error => { startupError = error; });
  child.stdin.on('error', error => { startupError ??= error; });
  const exited = new Promise<Exit>(resolve => child.once('exit', (code, signal) => {
    exitResult = { code, signal }; resolve(exitResult);
  }));
  const closed = new Promise<Exit>(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  const messages = (): Reply[] => stdout.split('\n').slice(0, -1).map(line => JSON.parse(line));
  const send = (value: unknown) => child.stdin.write(`${JSON.stringify(value)}\n`);
  const request = (id: string | number, method: string, params: Record<string, unknown> = {}) =>
    send({ jsonrpc: '2.0', id, method, params: { _meta: META, ...params } });
  const response = async (id: string | number): Promise<Reply> => {
    await eventually(() => {
      if (startupError) throw startupError;
      if (messages().some(message => message.id === id)) return true;
      if (exitResult) throw new Error(`adapter exited before response ${id}: ${JSON.stringify(exitResult)}; ${stderr}`);
      return false;
    }, 30_000, `adapter response timeout: ${id}`);
    return messages().find(message => message.id === id)!;
  };
  const call = async (id: number, name: string, args: Record<string, unknown> = {}) => {
    request(id, 'tools/call', { name, arguments: args }); return response(id);
  };
  const client = { child, send, request, response, call, messages, exited, closed,
    exitResult: () => exitResult, stdout: () => stdout, stderr: () => stderr };
  children.push(client);
  return client;
}

function inventory(): ProcessRow[] {
  const text = execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,comm='], { encoding: 'utf8', shell: false });
  return text.trim().split('\n').map(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
    if (!match) throw new Error('malformed process inventory');
    return { pid: Number(match[1]), ppid: Number(match[2]), command: match[3] };
  });
}

function descendants(parent: number, rows: ProcessRow[]): ProcessRow[] {
  const found = new Set([parent]); let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) if (found.has(row.ppid) && !found.has(row.pid)) {
      found.add(row.pid); changed = true;
    }
  }
  return rows.filter(row => row.pid !== parent && found.has(row.pid));
}

function toolResult(value: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value, isError: false, ...COMPLETE };
}

function assertInventory(client: ReturnType<typeof launch>, expected: Reply[]): void {
  expect(client.messages()).toEqual(expected);
  expect(client.stdout()).toBe(expected.map(message => JSON.stringify(message) + '\n').join(''));
  expect(client.stderr()).toBe('');
}

const discoverResult = { supportedVersions: ['2026-07-28'], capabilities: { tools: {} },
  ttlMs: 0, cacheScope: 'public', ...COMPLETE };
const listResult = { tools: TOOLS, ttlMs: 0, cacheScope: 'public', ...COMPLETE };
const reply = (id: string | number, result: Record<string, any>): Reply => ({ jsonrpc: '2.0', id, result });

describe.sequential('T-STDIO checkout bundle with real Chromium', () => {
  beforeAll(async () => {
    mkdirSync(path.join(process.cwd(), 'artifacts'), { recursive: true });
    directory = mkdtempSync(path.join(process.cwd(), 'artifacts', 'mcp-stdio-'));
    bundlePath = path.join(directory, 'tinyvault-mcp.mjs');
    const manifest = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    expect(manifest.scripts['build:mcp'].trim().split(/\s+/)).toEqual([
      './node_modules/.bin/esbuild', 'src/adapters/mcp/main.ts', '--bundle', '--platform=node',
      '--target=node24', '--format=esm', '--packages=external', '--outfile=dist/tinyvault-mcp.mjs',
    ]);
    const built = await build({ entryPoints: ['src/adapters/mcp/main.ts'], bundle: true,
      platform: 'node', target: 'node24', format: 'esm', packages: 'external', metafile: true,
      write: true, outfile: bundlePath });
    expect(Object.keys(built.metafile.inputs).filter(file => file.split(/[\\/]/).includes('node_modules'))).toEqual([]);
    const imports = Object.values(built.metafile.outputs).flatMap(output => output.imports);
    expect(imports.every(item => item.external === true)).toBe(true);
    expect(imports.map(item => item.path)).toEqual(expect.arrayContaining(['playwright', 'libsodium-wrappers']));
    const vaultPath = path.join(directory, 'vault.json'); const keyPath = path.join(directory, 'key');
    await generateLocalVaultKey(keyPath);
    items = await writeLocalVault(vaultPath, keyPath, [{ label: 'MCP throwaway item', kind: 'password',
      canonicalOrigin: 'https://example.test', fieldRecipe: ['password'], secret: 'TVC_stdio_synthetic_83af' }]);
    env = { ...process.env, TINYVAULT_VAULT_PATH: vaultPath, TINYVAULT_KEY_PATH: keyPath,
      TINYVAULT_TRIPWIRE_CANARY: 'TVC_stdio_canary_2e94' };
  }, 30_000);
  afterEach(async () => {
    for (const client of children.splice(0)) {
      if (!client.exitResult()) client.child.kill('SIGKILL');
      client.child.stdout.resume();
      await within(client.closed, 10_000, 'adapter cleanup timeout');
    }
  }, 30_000);
  afterAll(() => { if (directory) rmSync(directory, { recursive: true, force: true }); });

  it('serves the exact modern inventory, suppresses queued cancellation and exits cleanly on EOF', async () => {
    const client = launch(); client.request(0, 'server/discover');
    expect(await client.response(0)).toEqual(reply(0, discoverResult));
    client.request(1, 'tools/list'); expect(await client.response(1)).toEqual(reply(1, listResult));
    expect((await client.call(2, 'list_vault')).result).toEqual(toolResult({ items }));
    const setup = createSetupResult({ reason: 'missing_item' });
    expect((await client.call(3, 'request_vault_setup', { reason: 'missing_item' })).result).toEqual(toolResult(setup));
    const open = await client.call(4, 'browser_open_session'); const { sessionId } = open.result.structuredContent;
    expect(sessionId).toEqual(expect.any(String)); expect(sessionId.length).toBeGreaterThan(0);
    expect(open.result).toEqual(toolResult({ sessionId }));
    // The existing host snapshot uses location.origin + location.pathname, including opaque origins.
    const snapshot = { ok: true, snapshot: { url: 'nullblank', nodes: [] } };
    expect((await client.call(5, 'browser_snapshot', { sessionId })).result).toEqual(toolResult(snapshot));
    // One write makes the cancellation reader-visible before the async first tool can finish.
    client.child.stdin.write([
      { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { _meta: META, name: 'list_vault' } },
      { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { _meta: META, name: 'request_vault_setup', arguments: { reason: 'missing_item' } } },
      { jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 7 } },
      { jsonrpc: '2.0', id: 8, method: 'tools/list', params: { _meta: META } },
    ].map(value => JSON.stringify(value) + '\n').join(''));
    await client.response(8); client.child.stdin.end();
    expect(await within(client.closed, 15_000, 'EOF shutdown timeout')).toEqual({ code: 0, signal: null });
    assertInventory(client, [reply(0, discoverResult), reply(1, listResult), reply(2, toolResult({ items })),
      reply(3, toolResult(setup)), reply(4, toolResult({ sessionId })), reply(5, toolResult(snapshot)),
      reply(6, toolResult({ items })), reply(8, listResult)]);
  }, 60_000);

  it('handles the discovery-only probe SIGTERM and EOF five milliseconds after its answer', async () => {
    const client = launch(); const id = 'server-discover-probe-1'; client.request(id, 'server/discover');
    expect(await client.response(id)).toEqual(reply(id, discoverResult));
    await delay(5); expect(client.child.kill('SIGTERM')).toBe(true); client.child.stdin.end();
    expect(await within(client.closed, 15_000, 'discovery shutdown timeout')).toEqual({ code: 0, signal: null });
    assertInventory(client, [reply(id, discoverResult)]);
  }, 45_000);

  it('actually receives SIGKILL at the 500ms grace and leaves no captured Chromium descendant', async () => {
    const client = launch(); client.request(0, 'server/discover'); await client.response(0);
    const before = descendants(client.child.pid!, inventory());
    expect(before.length, 'no adapter descendants observed before signals').toBeGreaterThan(0);
    expect(before.some(row => /chrom(?:e|ium)|headless_shell/i.test(row.command)), 'no Chromium descendant witness').toBe(true);
    // Fill the real pipe with a valid (<1MiB) response. The blocked handler keeps
    // shutdown inside its 30s deadline; a graceful early exit cannot pass this test.
    client.child.stdout.pause(); client.request('x'.repeat(900_000), 'tools/list');
    await eventually(() => client.child.stdout.readableLength > 0, 5_000, 'stdout backpressure witness missing');
    expect(client.child.kill('SIGINT')).toBe(true); await delay(500);
    expect(client.exitResult(), 'SIGINT exited early; forced-kill path was not exercised').toBeUndefined();
    const killedAt = Date.now(); const remaining = () => Math.max(0, killedAt + 5_000 - Date.now());
    expect(client.child.kill('SIGKILL')).toBe(true);
    expect(await within(client.exited, remaining(), 'SIGKILL exit timeout')).toEqual({ code: null, signal: 'SIGKILL' });
    // A paused pipe delays the close event even after exit; drain only after the signal witness.
    client.child.stdout.resume(); await within(client.closed, remaining(), 'SIGKILL pipe cleanup timeout');
    await eventually(() => {
      const alive = new Set(inventory().map(row => row.pid));
      return Date.now() <= killedAt + 5_000 && before.every(row => !alive.has(row.pid));
    }, remaining(), `STOP: adapter Chromium descendant survived SIGKILL: ${JSON.stringify(before)}`);
    expect(client.stderr()).toBe('');
  }, 45_000);

  it('two concurrent processes with the same vault each own an independent host', async () => {
    const first = launch(); const second = launch(); expect(first.child.pid).not.toBe(second.child.pid);
    for (const client of [first, second]) expect((await client.call(0, 'list_vault')).result).toEqual(toolResult({ items }));
    const [a, b] = await Promise.all([first.call(1, 'browser_open_session'), second.call(1, 'browser_open_session')]);
    const sessionA = a.result.structuredContent.sessionId; const sessionB = b.result.structuredContent.sessionId;
    expect(sessionA).toEqual(expect.any(String)); expect(sessionB).toEqual(expect.any(String)); expect(sessionA).not.toBe(sessionB);
    for (const [client, sessionId] of [[first, sessionA], [second, sessionB]] as const) {
      expect((await client.call(2, 'browser_snapshot', { sessionId })).result)
        .toEqual(toolResult({ ok: true, snapshot: { url: 'nullblank', nodes: [] } }));
    }
    first.child.stdin.end(); second.child.stdin.end();
    for (const [client, sessionId] of [[first, sessionA], [second, sessionB]] as const) {
      expect(await within(client.closed, 15_000, 'independent host shutdown timeout')).toEqual({ code: 0, signal: null });
      assertInventory(client, [reply(0, toolResult({ items })), reply(1, toolResult({ sessionId })),
        reply(2, toolResult({ ok: true, snapshot: { url: 'nullblank', nodes: [] } }))]);
    }
  }, 60_000);
});
