import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { build } from 'esbuild';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHttpFixture, createOnePasswordFixture } from '../../backends/onepassword.testSupport';
import { createSetupResult } from '../../core/results';
import { TOOLS } from './tools';

const META = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientCapabilities': {} };
const version = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')).version;
const COMPLETE = { resultType: 'complete', _meta: {
  'io.modelcontextprotocol/serverInfo': { name: 'tinyvault', version },
} };
type Reply = { jsonrpc: '2.0'; id: number; result: Record<string, any>; error?: unknown };
type Exit = { code: number | null; signal: NodeJS.Signals | null };
type Row = { pid: number; ppid: number; command: string };
let directory: string;
let bundlePath: string;
let env: NodeJS.ProcessEnv;
let fixture: Awaited<ReturnType<typeof createOnePasswordFixture>>;
let site: Awaited<ReturnType<typeof createHttpFixture>>;
let otherSite: Awaited<ReturnType<typeof createHttpFixture>>;
const children: { child: { kill(signal: NodeJS.Signals): boolean; stdout: { resume(): unknown } };
  closed: Promise<Exit>; exitResult(): Exit | undefined }[] = [];

async function within<T>(work: Promise<T>, timeout: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Synthetic MCP deadline exceeded')), timeout);
    })]);
  } finally { clearTimeout(timer); }
}
async function eventually(predicate: () => boolean, timeout = 15000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error('Synthetic MCP observation timed out');
    await delay(10);
  }
}

function launch() {
  const child = spawn(process.execPath, [bundlePath], { env: env, stdio: 'pipe', shell: false });
  let stdout = ''; let stderr = ''; let failed = false; let result: Exit | undefined;
  child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
  child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
  child.on('error', () => { failed = true; });
  child.stdin.on('error', () => { failed = true; });
  const closed = new Promise<Exit>(resolve => child.once('close', (code, signal) => {
    result = { code, signal }; resolve(result);
  }));
  const messages = (): Reply[] => stdout.split('\n').slice(0, -1).map(line => JSON.parse(line));
  const request = (id: number, method: string, params: Record<string, unknown> = {}) => {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params: { _meta: META, ...params } }) + '\n');
  };
  const response = async (id: number): Promise<Reply> => {
    await eventually(() => {
      if (messages().some(message => message.id === id)) return true;
      if (failed || result) throw new Error('Synthetic MCP exited before response');
      return false;
    });
    return messages().find(message => message.id === id)!;
  };
  const call = async (id: number, name: string, args: Record<string, unknown> = {}) => {
    request(id, 'tools/call', { name, arguments: args }); return response(id);
  };
  const client = { child, request, response, call, messages, closed,
    exitResult: () => result, stdout: () => stdout, stderr: () => stderr };
  children.push(client); return client;
}

function inventory(): Row[] {
  const text = execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,comm='], { encoding: 'utf8', shell: false });
  return text.trim().split('\n').map(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
    if (!match) throw new Error('Malformed process inventory');
    return { pid: Number(match[1]), ppid: Number(match[2]), command: match[3] };
  });
}
function descendants(pid: number, rows = inventory()): Row[] {
  const found = new Set([pid]); let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) if (found.has(row.ppid) && !found.has(row.pid)) {
      found.add(row.pid); changed = true;
    }
  }
  return rows.filter(row => row.pid !== pid && found.has(row.pid));
}
const toolResult = (value: unknown) => ({
  content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value, isError: false, ...COMPLETE,
});
const data = (response: Reply) => {
  expect(response.result, 'M9 expected successful tool data').toHaveProperty('structuredContent');
  return response.result.structuredContent;
};
async function open(client: ReturnType<typeof launch>, first: number, url = site.url) {
  const sessionId = data(await client.call(first, 'browser_open_session')).sessionId as string;
  expect(typeof sessionId).toBe('string');
  expect((await client.call(first + 1, 'browser_navigate', { sessionId, url })).result).toEqual(toolResult({ ok: true }));
  return sessionId;
}
const fillArgs = (handle: string, sessionId: string) => ({
  handle, sessionId, fields: [{ role: 'password', selector: '#password' }],
});
async function noPrivateOutput(client: ReturnType<typeof launch>) {
  const output = client.stdout() + client.stderr();
  for (const value of [fixture.token, ...Object.values(fixture.recipe.passwords),
    fixture.config.tokenPath, fixture.recipe.vaultId, ...Object.values(fixture.recipe.ids),
    'Synthetic ignored title', 'Synthetic ignored information', 'Synthetic user value',
    'Synthetic password reference', 'Synthetic strength']) expect(output).not.toContain(value);
}

describe.sequential('M9 built MCP bundle, real backend and synthetic CLI', () => {
  beforeAll(async () => {
    mkdirSync(path.join(process.cwd(), 'artifacts'), { recursive: true });
    directory = mkdtempSync(path.join(process.cwd(), 'artifacts', 'mcp-onepassword-'));
    bundlePath = path.join(directory, 'tinyvault-mcp.mjs');
    const built = await build({ entryPoints: ['src/adapters/mcp/main.ts'], bundle: true,
      platform: 'node', target: 'node24', format: 'esm', packages: 'external', metafile: true,
      write: true, outfile: bundlePath });
    expect(Object.keys(built.metafile.inputs).filter(file => file.split(/[\\/]/).includes('node_modules'))).toEqual([]);
    expect(Object.values(built.metafile.outputs).flatMap(output => output.imports).every(item => item.external)).toBe(true);
    expect(Object.keys(built.metafile.inputs)).not.toContain('src/backends/onepassword.testSupport.ts');
    site = await createHttpFixture(); otherSite = await createHttpFixture();
  }, 30000);
  beforeEach(async () => {
    fixture = await createOnePasswordFixture({ origin: site.origin });
    const configPath = path.join(directory, 'config.json');
    writeFileSync(configPath, JSON.stringify(fixture.config), { mode: 0o600 });
    // Explicit environment; never inherit the developer's backend credentials or configuration.
    env = { PATH: '/usr/bin:/bin', HOME: homedir(), TMPDIR: directory,
      PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH,
      TINYVAULT_BACKEND: 'onepassword', TINYVAULT_1PASSWORD_CONFIG: configPath,
      TINYVAULT_TRIPWIRE_CANARY: 'TVC_M9_mcp_synthetic_canary_71' };
  });
  afterEach(async () => {
    for (const client of children.splice(0)) {
      if (!client.exitResult()) client.child.kill('SIGKILL');
      client.child.stdout?.resume();
      await within(client.closed, 15000);
    }
    await fixture.cleanup();
  }, 30000);
  afterAll(async () => {
    await site?.close(); await otherSite?.close();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('preserves exact inventory, fills once, masks snapshots and refuses a second fresh control after setup', async () => {
    const client = launch();
    client.request(1, 'tools/list');
    expect((await client.response(1)).result).toEqual({ tools: TOOLS, ttlMs: 0, cacheScope: 'public', ...COMPLETE });
    const firstList = data(await client.call(2, 'list_vault')).items;
    expect(firstList).toHaveLength(2);
    expect(firstList.map((item: { label: string }) => item.label)).toEqual(['Approved a', 'Approved b']);
    for (const item of firstList) expect(item).toEqual({
      handle: expect.stringMatching(/^vh_[A-Za-z0-9_-]{32}$/), label: item.label, kind: 'password', available: true,
    });
    const a = firstList[0].handle;
    const session = await open(client, 3);
    expect((await client.call(5, 'fill_from_vault', fillArgs(a, session))).result)
      .toEqual(toolResult({ ok: true, filled: ['password'] }));
    const snapshot = data(await client.call(6, 'browser_snapshot', { sessionId: session }));
    expect(snapshot.ok).toBe(true);
    expect(snapshot.snapshot.nodes).toContainEqual({ tag: 'input', masked: true });
    expect(data(await client.call(30, 'list_vault')).items).toEqual(firstList);
    const fresh = await open(client, 7);
    expect((await client.call(9, 'fill_from_vault', fillArgs(a, fresh))).result)
      .toEqual(toolResult({ ok: false, reason: 'handle-exhausted' }));
    expect((await client.call(10, 'request_vault_setup', { reason: 'missing_item' })).result)
      .toEqual(toolResult(createSetupResult({ reason: 'missing_item' })));
    expect((await client.call(11, 'fill_from_vault', fillArgs(a, fresh))).result)
      .toEqual(toolResult({ ok: false, reason: 'handle-exhausted' }));
    expect(data(await client.call(12, 'list_vault')).items).toEqual(firstList);
    expect((await fixture.readRecords()).map(record => record.command)).toEqual(['version', 'list', 'detail']);
    await noPrivateOutput(client);
    client.child.stdin.end(); expect(await within(client.closed, 15000)).toEqual({ code: 0, signal: null });
    await noPrivateOutput(client);

    const restarted = launch(); const newItems = data(await restarted.call(1, 'list_vault')).items;
    expect(newItems[0].handle).not.toBe(a);
    const restartedSession = await open(restarted, 2);
    expect((await restarted.call(4, 'fill_from_vault', fillArgs(newItems[0].handle, restartedSession))).result)
      .toEqual(toolResult({ ok: true, filled: ['password'] }));
    restarted.child.stdin.end(); expect(await within(restarted.closed, 15000)).toEqual({ code: 0, signal: null });
    await noPrivateOutput(restarted);
  }, 60000);

  it.each([
    'success', 'detail-exit', 'detail-json', 'detail-utf8', 'detail-extra', 'detail-null',
    'detail-duplicate', 'detail-identity', 'detail-origin', 'detail-deleted', 'detail-no-fields',
    'detail-empty', 'detail-selection', 'detail-multiple', 'detail-long', 'detail-crlf',
    'detail-depth', 'detail-nodes', 'detail-hang', 'detail-flood', 'stderr-flood',
    'list-exit', 'list-json', 'list-extra', 'list-identity', 'list-duplicate', 'list-overflow',
    'version-mismatch', 'token-missing', 'token-changed',
  ])('T5 compares complete model-facing envelopes for paired synthetic values: %s', async mode => {
    const responses: Reply[] = [];
    const privateValues = ['T5PRIVATEA'.padEnd(16, 'A'), 'T5PRIVATEB'.padEnd(64, 'B')];
    for (const privateValue of privateValues) {
      writeFileSync(fixture.config.tokenPath, fixture.token, { mode: 0o600 });
      const detail = structuredClone(fixture.recipe.details[fixture.recipe.ids.a]);
      detail.fields[1].value = privateValue;
      detail.title = privateValue;
      await fixture.setDetail(fixture.recipe.ids.a, detail);
      const listing = structuredClone(fixture.recipe.list);
      for (const row of listing) row.title = privateValue;
      await fixture.setList(listing);
      await fixture.setBehavior('detail', { stderr: privateValue });
      await fixture.setBehavior('list', { stderr: privateValue });
      if (mode.startsWith('list-')) {
        if (mode === 'list-exit') await fixture.setBehavior('list', { exitCode: 1, stderr: privateValue });
        if (mode === 'list-json') await fixture.setRaw('list', Buffer.from('{"private":"' + privateValue));
        if (mode === 'list-extra') listing[0].unexpected = privateValue;
        if (mode === 'list-identity') listing[0].vault.id = 'z'.repeat(26);
        if (mode === 'list-duplicate') listing.push(structuredClone(listing[0]));
        if (mode === 'list-overflow') await fixture.setRaw('list', Buffer.from(' '.repeat(1_048_576) + privateValue));
        await fixture.setList(listing);
      }
      if (mode === 'version-mismatch') await fixture.setVersion('2.39.0 ' + privateValue);
      const client = launch();
      if (mode.startsWith('list-') || mode === 'version-mismatch') {
        const response = await client.call(5, 'list_vault');
        expect(response.result).toEqual({ content: [{ type: 'text', text: 'Vault operation failed' }], isError: true, ...COMPLETE });
        responses.push(response);
      } else {
        const items = data(await client.call(1, 'list_vault')).items;
        const sessionId = await open(client, 2);
        if (mode === 'token-missing') rmSync(fixture.config.tokenPath);
        if (mode === 'token-changed') writeFileSync(fixture.config.tokenPath, privateValue, { mode: 0o600 });
        if (mode === 'detail-exit') await fixture.setBehavior('detail', { exitCode: 1, stderr: privateValue });
        if (mode === 'detail-json') await fixture.setRaw('detail', Buffer.from('{"private":"' + privateValue));
        if (mode === 'detail-utf8') await fixture.setRaw('detail', Buffer.concat([Buffer.from('{"title":"' + privateValue), Buffer.from([0x80]), Buffer.from('"}')]));
        if (mode === 'detail-extra') detail.unexpected = privateValue;
        if (mode === 'detail-null') detail.version = null;
        if (mode === 'detail-duplicate') await fixture.setRaw('detail', Buffer.from(JSON.stringify(detail).replace('"title":', '"title":"' + privateValue + '","title":')));
        if (mode === 'detail-identity') detail.id = 'z'.repeat(26);
        if (mode === 'detail-origin') detail.urls[0].href = 'https://changed.example.invalid/' + privateValue;
        if (mode === 'detail-deleted') detail.state = 'DELETED';
        if (mode === 'detail-no-fields') delete detail.fields;
        if (mode === 'detail-empty') detail.fields[1].value = '';
        if (mode === 'detail-selection' || mode === 'detail-multiple') {
          detail.fields[1].purpose = 'CUSTOM';
          delete detail.fields[1].entropy; delete detail.fields[1].password_details;
        }
        if (mode === 'detail-multiple') detail.fields.push({ id: 'other', type: 'CONCEALED', purpose: 'PASSWORD', value: privateValue });
        if (mode === 'detail-long') detail.fields[1].value = privateValue.repeat(300);
        if (mode === 'detail-crlf') detail.fields[1].value = privateValue + '\r\n';
        if (mode === 'detail-depth') await fixture.setRaw('detail', Buffer.from('['.repeat(13) + JSON.stringify(privateValue) + ']'.repeat(13)));
        if (mode === 'detail-nodes') await fixture.setRaw('detail', Buffer.from('{"private":' + JSON.stringify(privateValue) + ',"nodes":[' + Array(65_536).fill('0').join(',') + ']}'));
        if (mode === 'detail-hang') await fixture.setBehavior('detail', { mode: 'hang', stderr: privateValue });
        if (mode === 'detail-flood') await fixture.setBehavior('detail', { mode: 'stdout-flood', stderr: privateValue });
        if (mode === 'stderr-flood') await fixture.setBehavior('detail', { mode: 'stderr-flood', stderr: privateValue });
        await fixture.setDetail(fixture.recipe.ids.a, detail);
        const response = await client.call(5, 'fill_from_vault', fillArgs(items[0].handle, sessionId));
        const missing = ['detail-deleted', 'detail-no-fields', 'detail-empty'].includes(mode);
        expect(response.result).toEqual(toolResult(mode === 'success'
          ? { ok: true, filled: ['password'] }
          : { ok: false, reason: missing ? 'handle-unavailable' : 'backend-error' }));
        responses.push(response);
      }
      client.child.stdin.end();
      expect(await within(client.closed, 15000)).toEqual({ code: 0, signal: null });
      await noPrivateOutput(client);
      for (const value of privateValues) expect(client.stdout() + client.stderr()).not.toContain(value);
    }
    expect(responses[1]).toEqual(responses[0]);
  }, 60000);

  it('refuses a wrong-origin fill with zero detail calls after discovery', async () => {
    const client = launch(); const items = data(await client.call(1, 'list_vault')).items;
    const sessionId = await open(client, 2, otherSite.url);
    expect((await client.call(4, 'fill_from_vault', fillArgs(items[0].handle, sessionId))).result)
      .toEqual(toolResult({ ok: false, reason: 'origin-not-authorized' }));
    expect((await fixture.readRecords()).map(record => record.command)).toEqual(['version', 'list']);
    await noPrivateOutput(client);
    client.child.stdin.end(); expect(await within(client.closed, 15000)).toEqual({ code: 0, signal: null });
  }, 30000);

  it.each(['SIGTERM', 'EOF', 'stdout failure'])('bounds hanging CLI/descendant cleanup on %s', async mode => {
    await fixture.setBehavior('detail', { mode: 'descendant' });
    const client = launch(); const items = data(await client.call(1, 'list_vault')).items;
    const sessionId = await open(client, 2);
    client.request(4, 'tools/call', { name: 'fill_from_vault', arguments: fillArgs(items[0].handle, sessionId) });
    const command = await fixture.waitForCommand('detail', 15000);
    expect(command.descendantPid).toEqual(expect.any(Number));
    const owned = descendants(client.child.pid!);
    expect(owned.some(row => row.pid === command.pid)).toBe(true);
    const started = Date.now();
    if (mode === 'SIGTERM') client.child.kill('SIGTERM');
    else if (mode === 'EOF') client.child.stdin.end();
    else {
      client.child.stdout.destroy();
      // Malformed JSON receives an immediate protocol reply even while the fill handler is active.
      client.child.stdin.write('{\n');
      const deadline = Date.now() + 1800;
      const stillRunning = () => inventory().some(row => row.pid === command.pid || row.pid === command.descendantPid);
      while (stillRunning() && Date.now() < deadline) await delay(10);
      expect(stillRunning(), 'abort disposes backend before its ordinary deadline').toBe(false);
    }
    const result = await within(client.closed, 15000);
    expect(Date.now() - started).toBeLessThan(15000);
    expect(result.signal).toBeNull();
    if (mode === 'stdout failure') {
      expect(result.code).toBe(6);
    }
    else expect([0, 3]).toContain(result.code);
    const expectedGone = new Set([...owned.map(row => row.pid), command.pid, command.descendantPid!]);
    await eventually(() => inventory().every(row => !expectedGone.has(row.pid)));
    await noPrivateOutput(client);
    for (const record of await fixture.readRecords()) {
      if (record.command !== 'version') expect(record.tokenMatches).toBe(true);
    }
  }, 45000);

  it('rejects inherited service tokens before any provider spawn or host startup', async () => {
    env.OP_SERVICE_ACCOUNT_TOKEN = 'synthetic-inherited-token-denied';
    const client = launch();
    client.child.stdin.end();
    expect(await within(client.closed, 15000)).toEqual({ code: 4, signal: null });
    expect(client.stdout()).toBe(''); expect(client.stderr()).toBe('tinyvault-mcp: internal error\n');
    expect(await fixture.readRecords()).toEqual([]);
    expect(client.stderr()).not.toContain(env.OP_SERVICE_ACCOUNT_TOKEN);
  }, 20000);

  it('starts without an installed provider binary and returns only a fixed vault failure', async () => {
    writeFileSync(env.TINYVAULT_1PASSWORD_CONFIG!, JSON.stringify({
      ...fixture.config, opPath: path.join(directory, 'synthetic-missing-op'),
    }));
    const client = launch(); const response = await client.call(1, 'list_vault');
    expect(response.result.isError).toBe(true);
    expect(response.result.content).toEqual([{ type: 'text', text: 'Vault operation failed' }]);
    expect(await fixture.readRecords()).toEqual([]);
    await noPrivateOutput(client);
    client.child.stdin.end(); expect([0, 3]).toContain((await within(client.closed, 15000)).code);
  }, 30000);
});
