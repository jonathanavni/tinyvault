import { randomBytes } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { OnePasswordConfig } from './onepasswordConfig';

export type SyntheticObject = Record<string, any>;
export type FakeBehavior = {
  mode?: 'normal' | 'hang' | 'ignore-term' | 'descendant' | 'close-pipes' | 'stdout-flood' | 'stderr-flood';
  delayMs?: number;
  exitCode?: number;
  stderr?: string;
};
export type FakeRecord = {
  command: string; itemId?: string; argv: string[]; pid: number; descendantPid?: number;
  cwd: string; env: Record<string, string>; tokenMatches: boolean; stdinEnded: boolean;
};
export type FixtureOptions = {
  origin?: string; list?: unknown; details?: Record<string, unknown>; probe?: unknown;
  version?: string; behavior?: Record<string, FakeBehavior>;
};

export function syntheticRecipe(origin = 'https://login.example') {
  const vaultId = randomBytes(13).toString('hex');
  const [a, b, c, d] = Array.from({ length: 4 }, () => randomBytes(13).toString('hex'));
  function row(id: string, websites?: SyntheticObject[]): SyntheticObject {
    return {
      id, vault: { id: vaultId, name: 'Synthetic custom vault' }, category: 'LOGIN',
      title: 'Synthetic ignored title', version: 4, last_edited_by: 'Synthetic editor',
      created_at: 'Synthetic creation', updated_at: 'Synthetic update',
      additional_information: 'Synthetic ignored information',
      ...(websites === undefined ? {} : { urls: websites }),
    };
  }
  const firstUrls = [{ href: `${origin}/sign-in`, label: 'Synthetic website', primary: true }];
  const secondUrls = [{ href: `${origin}/other`, label: 'Synthetic alternate website', primary: false }, { href: `${origin}/sign-in`, label: 'Synthetic website' }];
  const passwords = { [a]: 'A-synthetic-16!!', [b]: 'B'.repeat(64), [c]: 'C synthetic password' };
  function detail(id: string, websites: SyntheticObject[]): SyntheticObject {
    return {
      ...row(id, websites),
      fields: [
        { id: 'username', type: 'STRING', purpose: 'USERNAME', label: 'Synthetic user', value: 'Synthetic user value', reference: 'Synthetic user reference' },
        { id: 'password', type: 'CONCEALED', purpose: 'PASSWORD', label: 'Synthetic password', value: passwords[id], reference: 'Synthetic password reference', entropy: 41.25, password_details: { entropy: 67.5, generated: true, strength: 'Synthetic strength' } },
        { id: 'notesPlain', type: 'STRING', purpose: 'NOTES', label: 'Synthetic notes', reference: 'Synthetic notes reference' },
      ],
    };
  }
  const list = [row(d), row(a, firstUrls), row(b, secondUrls)];
  const details: Record<string, SyntheticObject> = {
    [a]: detail(a, firstUrls),
    [b]: detail(b, [...secondUrls].reverse()),
    [c]: { ...detail(c, firstUrls), state: 'ARCHIVED' },
  };
  const probe = {
    id: randomBytes(13).toString('hex').toUpperCase(), name: 'Synthetic account', email: 'synthetic@example.invalid',
    type: 'SERVICE_ACCOUNT', state: 'ACTIVE', created_at: 'Synthetic creation', updated_at: 'Synthetic update', last_auth_at: 'Synthetic auth',
  };
  return { vaultId, ids: { a, b, c, d }, passwords, list, details, probe };
}

export async function createOnePasswordFixture(options: FixtureOptions = {}) {
  const root = await mkdtemp(join(tmpdir(), "tinyvault fake ' ; $ op-"));
  const recipe = syntheticRecipe(options.origin);
  const token = `synthetic-token-${randomBytes(12).toString('hex')}`;
  const tokenPath = join(root, 'token');
  const opPath = join(root, "fake op ' ; $.cjs");
  const scriptPath = join(root, 'synthetic-script.cjs');
  const controlPath = join(root, 'control.json');
  const recordPath = join(root, 'record.jsonl');
  const state = {
    list: structuredClone(options.list ?? recipe.list) as unknown, details: structuredClone(options.details ?? recipe.details),
    probe: structuredClone(options.probe ?? recipe.probe) as unknown, version: options.version ?? '2.39.0',
    behavior: structuredClone(options.behavior ?? {}) as Record<string, FakeBehavior>, raw: {} as Record<string, string>, token,
  };
  await writeFile(tokenPath, token, { mode: 0o600 });
  await writeFile(controlPath, JSON.stringify(state), { mode: 0o600 });
  await writeFile(recordPath, '', { mode: 0o600 });
  // This is fixture source data. The helper itself never launches a subprocess.
  const script = `const fs = require('node:fs');
const state = JSON.parse(fs.readFileSync(${JSON.stringify(controlPath)}, 'utf8'));
const args = process.argv.slice(2);
const command = args.includes('--version') ? 'version' : args.includes('--me') ? 'probe' : args.includes('list') ? 'list' : 'detail';
const itemId = command === 'detail' ? args[args.indexOf('get') + 1] : undefined;
const behavior = state.behavior[command] || {};
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'OP_SERVICE_ACCOUNT_TOKEN'));
const record = { command, itemId, argv: args, pid: process.pid, cwd: process.cwd(), env, tokenMatches: process.env.OP_SERVICE_ACCOUNT_TOKEN === state.token, stdinEnded: false };
function recordNow() { fs.appendFileSync(${JSON.stringify(recordPath)}, JSON.stringify(record) + '\\n'); }
process.stdin.on('end', () => { record.stdinEnded = true; recordNow(); });
process.stdin.resume();
if (behavior.mode === 'descendant') {
  const child = require('node:child_process').spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { stdio: 'ignore' });
  record.descendantPid = child.pid;
}
recordNow();
function output() {
  if (behavior.stderr) process.stderr.write(behavior.stderr);
  if (behavior.mode === 'ignore-term' || behavior.mode === 'descendant') process.on('SIGTERM', () => {});
  if (behavior.mode === 'close-pipes') {
    const value = command === 'version' ? state.version : JSON.stringify(command === 'list' ? state.list : command === 'probe' ? state.probe : state.details[itemId]);
    process.stdout.write(value, () => process.stdout.end());
    process.stderr.end();
  }
  if (['hang', 'ignore-term', 'descendant', 'close-pipes'].includes(behavior.mode)) { setInterval(() => {}, 1000); return; }
  if (behavior.mode === 'stdout-flood' || behavior.mode === 'stderr-flood') {
    const stream = behavior.mode === 'stdout-flood' ? process.stdout : process.stderr;
    const timer = setInterval(() => stream.write(Buffer.alloc(65536, 88)), 1);
    stream.on('error', () => clearInterval(timer)); return;
  }
  const value = command === 'version' ? state.version : JSON.stringify(command === 'list' ? state.list : command === 'probe' ? state.probe : state.details[itemId]);
  const bytes = state.raw[command] === undefined ? Buffer.from(value === undefined ? 'null' : value) : Buffer.from(state.raw[command], 'base64');
  process.stdout.write(bytes, () => { process.exitCode = behavior.exitCode || 0; });
}
if (behavior.delayMs) setTimeout(output, behavior.delayMs); else output();
`;
  await writeFile(scriptPath, script, { mode: 0o600 });
  const quote = (value: string) => `'${value.replace(/'/gu, "'\\''")}'`;
  await writeFile(opPath, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(scriptPath)} \"$@\"\n`, { mode: 0o700 });
  await chmod(opPath, 0o700);
  const config: OnePasswordConfig = {
    opPath, tokenPath, vaultId: recipe.vaultId,
    items: Object.entries(recipe.ids).map(([label, itemId]) => ({ itemId, label: `Approved ${label}` })),
  };
  async function save(): Promise<void> { await writeFile(controlPath, JSON.stringify(state), { mode: 0o600 }); }
  async function readRecords(): Promise<FakeRecord[]> {
    const contents = await readFile(recordPath, 'utf8');
    const lines = contents.slice(0, contents.lastIndexOf('\n') + 1).split('\n').filter(Boolean);
    // A process emits startup and stdin-closure observations; expose its latest observation once.
    const records = new Map<number, FakeRecord>();
    for (const line of lines) {
      const record = JSON.parse(line) as FakeRecord;
      records.set(record.pid, record);
    }
    return [...records.values()];
  }
  return {
    root, config, token, recipe, controlPath, recordPath,
    async setList(value: unknown) { state.list = structuredClone(value); await save(); },
    async setDetail(itemId: string, value: unknown) { state.details[itemId] = structuredClone(value); await save(); },
    async setProbe(value: unknown) { state.probe = structuredClone(value); await save(); },
    async setVersion(value: string) { state.version = value; await save(); },
    async setBehavior(command: string, behavior: FakeBehavior) { state.behavior[command] = structuredClone(behavior); await save(); },
    async setRaw(command: string, bytes: Uint8Array) { state.raw[command] = Buffer.from(bytes).toString('base64'); await save(); },
    readRecords,
    async waitForCommand(command: string, timeout = 2000): Promise<FakeRecord> {
      const start = Date.now();
      for (;;) {
        const record = (await readRecords()).find((entry) => entry.command === command);
        if (record !== undefined) return record;
        if (Date.now() - start > timeout) throw new Error('Synthetic command observation timed out');
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    },
    async cleanup() { await rm(root, { recursive: true, force: true }); },
  };
}

export async function createHttpFixture() {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><title>Synthetic login</title><form><input id="password" name="password" type="password" autocomplete="off"><button type="button">Continue</button></form>');
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Synthetic fixture address unavailable');
  const origin = `http://127.0.0.1:${address.port}`;
  return { origin, url: `${origin}/login`, async close() {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  } };
}
