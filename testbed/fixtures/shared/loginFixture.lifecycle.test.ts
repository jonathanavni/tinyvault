import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { Server as NetServer } from 'node:net';
import { request as httpRequest, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { startLoginFixture, captureFixtureSnapshot, observeFixtureAdministration, readFixturePublicKey,
  type FixtureAdministrativeOperation, type LoginFixtureOptions } from './loginFixture';
import type { FixtureTransport } from '../transport';
import { startLookalikeOriginFixture } from '../lookalike-origin';

const captured = vi.hoisted(() => ({ servers: [] as Server[] }));
vi.mock('node:http', async (original) => {
  const http = await original<typeof import('node:http')>();
  return { ...http, createServer: (...args: Parameters<typeof http.createServer>) => {
    const server = http.createServer(...args); captured.servers.push(server); return server;
  } };
});
const roots: string[] = [];
const fixtures: FixtureTransport[] = [];
afterEach(async () => {
  vi.useRealTimers(); vi.restoreAllMocks();
  for (const fixture of fixtures.splice(0)) await fixture.close().catch(() => {});
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  captured.servers.length = 0;
});
const setup = (runId = 'A') => ({ runId, scenarioId: 'test', nonce: 'nonce', canaryId: 'canary', canary: 'secret-α' });
const login = (runId = 'A', extra = '') => new URLSearchParams({ runId, username: 'fixture-user', password: setup().canary }).toString() + extra;
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function noSocket() {
  vi.spyOn(NetServer.prototype, 'listen').mockImplementation(function (this: NetServer) {
    queueMicrotask(() => this.emit('error', Object.assign(new Error('listen'), { code: 'EPERM' }))); return this;
  });
}
async function start(routes: LoginFixtureOptions['routes'] = {}) {
  const root = await mkdtemp(join(tmpdir(), 'tv-lifecycle-')); roots.push(root);
  const fixture = await startLoginFixture(root, { fixtureId: 'benign-login', fixtureVersion: '2',
    pages: { '/': '{{TV_DOCUMENT_ATTRIBUTE}} {{TV_CONTROL_ATTRIBUTE}}' }, routes });
  fixtures.push(fixture);
  return { fixture, root, server: captured.servers.at(-1)! };
}
function simulatedHttp(server: Server, path: string, method = 'POST') {
  const input = new PassThrough() as PassThrough & { url: string; method: string };
  input.url = path; input.method = method;
  let status = 200; let resolve!: (value: number) => void;
  const done = new Promise<number>((res) => { resolve = res; });
  const response = { get statusCode() { return status; }, set statusCode(value: number) { status = value; },
    headersSent: false, setHeader: vi.fn(), end: (_body?: unknown, callback?: () => void) => { resolve(status); callback?.(); } };
  server.emit('request', input as unknown as IncomingMessage, response as unknown as ServerResponse);
  return { input, done, response };
}

it.each(['direct', 'HTTP'] as const)('%s admission drains an earlier unknown body and refuses the same later body before writes', async (entry) => {
  noSocket();
  const { fixture, server, root } = await start(); await fixture.registerRun(setup());
  let release!: () => void;
  let submitted: Promise<number>;
  if (entry === 'HTTP') {
    const req = simulatedHttp(server, '/login');
    await tick(); // Actual HTTP handler is inside readBodyOrReject with unknown attribution.
    submitted = req.done; release = () => req.input.end(login());
  } else {
    const gate = new Promise<void>((resolve) => { release = resolve; });
    // Hold the first direct-entry continuation before body processing; no production test hook.
    const resolve = vi.spyOn(Promise, 'resolve').mockReturnValueOnce(gate);
    submitted = fixture.submitLogin(login());
    resolve.mockRestore();
  }
  let finalized = false;
  const finalization = fixture.finalizeRun('A').then(() => { finalized = true; });
  expect(finalized).toBe(false);
  const late = entry === 'direct' ? fixture.submitLogin(login('A', '&late=1')) : (() => {
    const req = simulatedHttp(server, '/login'); req.input.end(login('A', '&late=1')); return req.done;
  })();
  await tick();
  try { expect(finalized).toBe(false); } finally { release(); }
  expect(await submitted).toBe(303);
  expect(await late).toBe(409);
  await finalization;
  const receipt = await fixture.takeReceipt('A'); expect(receipt).toBeTypeOf('string');
  expect(Buffer.from(await fixture.captureRequests('A')).toString()).toBe(login() + '\n');
  expect(await readFile(join(root, 'A.requests'), 'utf8')).toBe(login() + '\n');
  expect(await fixture.takeReceipt('A')).toBe(receipt);
  expect(await fixture.submitLogin(login('A', '&after=1'))).toBe(409);
  expect(await fixture.takeReceipt('A')).toBe(receipt);
  expect(Buffer.from(await fixture.captureRequests('A')).toString()).toBe(login() + '\n');
});

it('real HTTP pauses an admitted body before attribution, then preserves 303 and snapshot before refusing late writes', async () => {
  const { fixture, root } = await start(); expect(fixture.reachability).toBe('http');
  await fixture.registerRun(setup());
  let request!: ReturnType<typeof httpRequest>;
  const result = new Promise<number>((resolve, reject) => {
    request = httpRequest(`${fixture.origin}/login`, { method: 'POST' }, (response) => { response.resume(); resolve(response.statusCode!); });
    request.on('error', reject); request.flushHeaders();
  });
  // The real server's request event is the observable admission boundary, not elapsed wall time.
  const server = captured.servers.at(-1)!;
  await new Promise<void>((resolve) => server.once('request', () => resolve()));
  await tick();
  const finalization = fixture.finalizeRun('A');
  request.end(login());
  expect(await result).toBe(303); await finalization;
  const receipt = await fixture.takeReceipt('A');
  const late = await fetch(`${fixture.origin}/login`, { method: 'POST', body: login('A', '&late=1'), redirect: 'manual' });
  expect(late.status).toBe(409);
  expect(await fixture.takeReceipt('A')).toBe(receipt);
  expect(await readFile(join(root, 'A.requests'), 'utf8')).toBe(login() + '\n');
});

it('active duplicates remain captured 409; finalized A does not freeze active B, GET or unknown attribution', async () => {
  noSocket(); const effect = vi.fn();
  const { fixture, server } = await start({ 'POST /custom': async (_req, res) => { effect(); res.statusCode = 204; res.end(); } });
  await fixture.registerRun(setup()); await fixture.registerRun(setup('B'));
  expect(await fixture.submitLogin(login())).toBe(303);
  const receipt = await fixture.takeReceipt('A');
  expect(await fixture.submitLogin(login('A', '&duplicate=1'))).toBe(409);
  expect(await fixture.takeReceipt('A')).toBe(receipt);
  await fixture.finalizeRun('A');
  for (const path of ['/custom?runId=A', '/login?runId=A']) {
    const req = simulatedHttp(server, path); req.input.end('payload=late'); expect(await req.done).toBe(409);
  }
  const wrong = simulatedHttp(server, '/login'); wrong.input.end('runId=A&password=wrong'); expect(await wrong.done).toBe(409);
  expect(await fixture.unauthorizedRequests('A')).toEqual([]);
  const post = simulatedHttp(server, '/custom?runId=A'); post.input.end('runId=B&payload=active'); expect(await post.done).toBe(204);
  const unknown = simulatedHttp(server, '/custom?runId=unknown'); unknown.input.end('payload=unknown'); expect(await unknown.done).toBe(204);
  const get = simulatedHttp(server, '/?runId=A', 'GET'); expect(await get.done).toBe(200);
  expect(effect).toHaveBeenCalledTimes(2);
  expect(await fixture.submitLogin(login('B'))).toBe(303);
  await fixture.finalizeRun('B');
  expect(Buffer.from(await fixture.captureRequests('A')).toString()).toBe(login() + '\n' + login('A', '&duplicate=1') + '\n');
  expect(Buffer.from(await fixture.captureRequests('B')).toString()).toBe(login('B') + '\n');
  expect(await fixture.unauthorizedRequests('unregistered')).toEqual([{ route: '/custom?runId=unknown', body: 'payload=unknown' }]);
});

it('late 413 and 408 take precedence over frozen attribution and never capture or call custom routes', async () => {
  noSocket(); const effect = vi.fn();
  const { fixture, server } = await start({ 'POST /custom': async () => { effect(); } });
  await fixture.registerRun(setup()); await fixture.finalizeRun('A');
  const big = simulatedHttp(server, '/custom?runId=A'); big.input.end('x'.repeat(1024 * 1024 + 1)); expect(await big.done).toBe(413);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const slow = simulatedHttp(server, '/custom?runId=A'); await tick(); slow.input.write('runId=A');
  await vi.advanceTimersByTimeAsync(2000); expect(await slow.done).toBe(408);
  expect(effect).not.toHaveBeenCalled(); expect(await fixture.unauthorizedRequests('A')).toEqual([]);
  expect(await fixture.submitLogin(login('A') + 'x'.repeat(1024 * 1024))).toBe(413);
});

it('snapshots retain UTF8 JSONL order, duplicate routes/query and defensive bytes despite equal-length disk changes', async () => {
  noSocket(); const { fixture, server, root } = await start(); await fixture.registerRun(setup());
  const records = [{ route: '/custom?x=1&x=2&runId=A', body: 'message=☃' }, { route: '/custom?x=1&x=2&runId=A', body: 'message=☃' }];
  for (const record of records) { const req = simulatedHttp(server, record.route); req.input.end(record.body); expect(await req.done).toBe(404); }
  expect(await fixture.submitLogin(login())).toBe(303); await fixture.finalizeRun('A');
  const expected = records.map((record) => JSON.stringify(record) + '\n').join('');
  const bytes = await captureFixtureSnapshot(fixture, 'A', 'unauthorized'); expect(Buffer.from(bytes).toString()).toBe(expected); bytes.fill(0);
  const requests = await fixture.captureRequests('A'); requests.fill(0);
  const debug = await fixture.unauthorizedRequests('A'); (debug[0] as { body: string }).body = 'changed';
  await writeFile(join(root, 'A.requests'), 'z'.repeat(Buffer.byteLength(login() + '\n')));
  await writeFile(join(root, 'A.unauthorized.requests'), 'z'.repeat(Buffer.byteLength(expected)));
  expect(Buffer.from(await captureFixtureSnapshot(fixture, 'A', 'unauthorized')).toString()).toBe(expected);
  expect(await fixture.unauthorizedRequests('A')).toEqual(records);
  expect(Buffer.from(await fixture.captureRequests('A')).toString()).toBe(login() + '\n');
});

it('absent receipt reads are not cached, acknowledgement is explicit, setup is copied and runId ends exactly', async () => {
  noSocket(); const { fixture } = await start();
  for (const runId of ['', 'x'.repeat(129), 'valid\n', 'valid\r', '../bad', 'é']) await expect(fixture.registerRun(setup(runId))).rejects.toThrow('Unsafe fixture runId');
  await fixture.registerRun(setup('x'.repeat(128)));
  for (const fields of [{ nonce: '' }, { canary: '\ud800' }, { scenarioId: 'x'.repeat(129) }, { canaryId: 'x'.repeat(129) }, { canary: 'x'.repeat(4097) }]) {
    await expect(fixture.registerRun({ ...setup('invalid'), ...fields })).rejects.toThrow('run-state');
  }
  let reads = 0;
  const withGetter = Object.defineProperty(setup('getter'), 'runId', { get: () => ++reads === 1 ? 'getter' : '../unsafe' });
  await fixture.registerRun(withGetter); expect(reads).toBe(1); expect(await fixture.takeReceipt('getter')).toBeUndefined();
  const input = setup(); await fixture.registerRun(input); input.canary = 'changed'; input.runId = 'changed';
  expect(await fixture.takeReceipt('A')).toBeUndefined();
  await expect(fixture.captureRequests('A')).rejects.toThrow('run-state');
  await expect(fixture.attestEvents('A', Buffer.from('[]'))).rejects.toThrow('run-state');
  await expect(fixture.acknowledgeReceipt('A')).rejects.toThrow('run-state');
  expect(await fixture.submitLogin(login())).toBe(303);
  const receipt = await fixture.takeReceipt('A'); expect(receipt).toBeTruthy(); expect(await fixture.takeReceipt('A')).toBe(receipt);
  await fixture.finalizeRun('A'); await expect(fixture.finalizeRun('A')).rejects.toThrow('run-state');
  await fixture.attestEvents('A', Buffer.from('[]')); await expect(fixture.attestEvents('A', Buffer.from('[]'))).rejects.toThrow('run-state');
  await fixture.acknowledgeReceipt('A'); expect(await fixture.takeReceipt('A')).toBeUndefined();
  await expect(fixture.acknowledgeReceipt('A')).rejects.toThrow('run-state');
});

it('a registered run literally named unregistered never exports unknown-attribution records', async () => {
  noSocket(); const { fixture, server } = await start();
  await fixture.registerRun(setup('unregistered'));
  for (const [runId, body] of [['unknown', 'unknown-body'], ['unregistered', 'owned-body']] as const) {
    const req = simulatedHttp(server, `/custom?runId=${runId}`); req.input.end(body); expect(await req.done).toBe(404);
  }
  await fixture.finalizeRun('unregistered');
  expect(Buffer.from(await captureFixtureSnapshot(fixture, 'unregistered', 'unauthorized')).toString())
    .toBe(JSON.stringify({ route: '/custom?runId=unregistered', body: 'owned-body' }) + '\n');
  await expect(captureFixtureSnapshot(fixture, 'unknown', 'unauthorized')).rejects.toThrow('run-state');
});

it('all seven underlying administrative primitives observe rejected entry as well as successful entry', async () => {
  noSocket(); const { fixture } = await start(); const entries: FixtureAdministrativeOperation[] = [];
  const detach = observeFixtureAdministration(fixture, (operation) => entries.push(operation));
  await fixture.registerRun(setup());
  await expect(fixture.registerRun(setup())).rejects.toThrow();
  await expect(fixture.takeReceipt('missing')).rejects.toThrow();
  await expect(fixture.captureRequests('missing')).rejects.toThrow();
  await expect(fixture.attestEvents('missing', Buffer.from('[]'))).rejects.toThrow();
  await expect(readFixturePublicKey(fixture, 'missing')).rejects.toThrow();
  await expect(fixture.finalizeRun('missing')).rejects.toThrow();
  await expect(fixture.acknowledgeReceipt('missing')).rejects.toThrow();
  expect(entries).toEqual(['register', 'register', 'receipt', 'capture', 'attest', 'key', 'finalize', 'ack']);
  detach(); await fixture.takeReceipt('A'); expect(entries).toHaveLength(8);
});

it('finalization freezes a run with no receipt; late valid login cannot create bytes or a receipt', async () => {
  noSocket(); const { fixture, server, root } = await start(); await fixture.registerRun(setup());
  await fixture.finalizeRun('A');
  expect(await fixture.submitLogin(login())).toBe(409);
  const req = simulatedHttp(server, '/login'); req.input.end(login()); expect(await req.done).toBe(409);
  expect(await fixture.takeReceipt('A')).toBeUndefined();
  expect(Buffer.from(await fixture.captureRequests('A')).length).toBe(0);
  expect(await readFile(join(root, 'A.requests'), 'utf8')).toBe('');
});

it.each(['direct', 'HTTP', 'real HTTP'] as const)('%s missing attribution stays unknown before and after finalizing the explicit unregistered run', async (entry) => {
  if (entry !== 'real HTTP') noSocket();
  const { fixture, server } = await start();
  if (entry === 'real HTTP') expect(fixture.reachability).toBe('http');
  await fixture.registerRun(setup('unregistered'));
  const send = async (value: string) => {
    if (entry === 'direct' || entry === 'real HTTP') return fixture.submitLogin(value);
    const req = simulatedHttp(server, '/login'); req.input.end(value); return req.done;
  };
  expect(await send('password=unknown-before')).toBe(400);
  expect(await fixture.unauthorizedRequests('unregistered')).toEqual([]);
  const explicit = 'runId=unregistered&password=explicit-wrong';
  expect(await send(explicit)).toBe(401);
  expect(await send(login('unregistered'))).toBe(303);
  await fixture.finalizeRun('unregistered');
  const receipt = await fixture.takeReceipt('unregistered');
  const expected = [{ route: '/login', body: explicit }];
  const snapshot = await captureFixtureSnapshot(fixture, 'unregistered', 'unauthorized');
  expect(Buffer.from(snapshot).toString()).toBe(JSON.stringify(expected[0]) + '\n');
  expect(await send('password=unknown-after')).toBe(400);
  expect(await fixture.unauthorizedRequests('unregistered')).toEqual(expected);
  expect(await send(explicit)).toBe(409);
  expect(await fixture.takeReceipt('unregistered')).toBe(receipt);
  expect(await captureFixtureSnapshot(fixture, 'unregistered', 'unauthorized')).toEqual(snapshot);
  // Query attribution is explicit too; missing form/query attribution cannot inherit its run.
  const query = simulatedHttp(server, '/custom?runId=unregistered'); query.input.end('payload=explicit');
  expect(await query.done).toBe(409);
  const absent = simulatedHttp(server, '/custom'); absent.input.end('payload=unknown');
  expect(await absent.done).toBe(404);
  expect(await fixture.unauthorizedRequests('unregistered')).toEqual(expected);
});

it('HTTP close stops new admission immediately while an earlier body finishes normally', async () => {
  noSocket(); const { fixture, server, root } = await start(); await fixture.registerRun(setup());
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const accepted = simulatedHttp(server, '/login'); await tick();
  let closeResult: unknown;
  const close = fixture.close().then(() => { closeResult = 'closed'; }, (error: unknown) => { closeResult = error; });
  const late = simulatedHttp(server, '/login'); late.input.end(login('A', '&late=1'));
  await tick();
  try {
    expect(await late.done).toBe(500);
    expect(closeResult).toBeUndefined();
  } finally { accepted.input.end(login()); }
  expect(await accepted.done).toBe(303); await close;
  expect(closeResult).toBe('closed');
  expect(await readFile(join(root, 'A.requests'), 'utf8')).toBe(login() + '\n');
});

const forwardedPage = '<main>canonical header|canonical body that must survive close</main>';
function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}
async function startLookalikeForClose() {
  const root = await mkdtemp(join(tmpdir(), 'tv-lookalike-close-')); roots.push(root);
  const fixture = await startLookalikeOriginFixture(root, { page: forwardedPage,
    onListenPermissionError: 'fail', lookalike: { onListenPermissionError: 'fail' } });
  fixtures.push(fixture);
  const [lookalikeServer, canonicalServer] = captured.servers.slice(-2);
  expect(fixture.reachability).toBe('http');
  expect(lookalikeServer!.address()).toMatchObject({ port: Number(new URL(fixture.lookalikeOrigin).port) });
  expect(canonicalServer!.address()).toMatchObject({ port: Number(new URL(fixture.origin).port) });
  await fixture.registerRun(setup());
  const administrativeEntries = vi.fn(); observeFixtureAdministration(fixture, administrativeEntries);
  return { fixture, root, lookalikeServer: lookalikeServer!, canonicalServer: canonicalServer!, administrativeEntries };
}
async function holdForwardedBody() {
  const started = await startLookalikeForClose();
  const originalFetch = globalThis.fetch;
  const bodyRead = barrier();
  let releaseBody = () => {};
  let nestedAdmissions = 0;
  started.canonicalServer.prependListener('request', (request, response) => {
    if (request.url !== '/login?runId=A') return;
    nestedAdmissions++;
    if (nestedAdmissions !== 1) return; // Hold only the original request; a late-forwarding mutant must still settle.
    const end = response.end.bind(response);
    // Hold real canonical response bytes, after its real handler was admitted. No fake peer/response.
    vi.spyOn(response, 'end').mockImplementationOnce((chunk: unknown) => {
      const bytes = Buffer.from(String(chunk)); const split = Math.floor(bytes.length / 2);
      response.write(bytes.subarray(0, split));
      releaseBody = () => { end(bytes.subarray(split)); };
      return response;
    });
  });
  const forwardFetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const rendered = await originalFetch(input, init);
    if (String(input) === `${started.fixture.origin}/login?runId=A`) {
      const text = rendered.text.bind(rendered);
      vi.spyOn(rendered, 'text').mockImplementation(() => { bodyRead.release(); return text(); });
    }
    return rendered;
  });
  const page = originalFetch(`${started.fixture.lookalikeOrigin}/?runId=A`)
    .then(async (response) => ({ status: response.status, body: await response.text() }))
    .catch((error: unknown) => ({ error: error instanceof Error ? error.name : 'unknown' }));
  await bodyRead.promise; // The real lookalike handler is waiting inside rendered.text().
  expect(nestedAdmissions).toBe(1);
  return { ...started, originalFetch, forwardFetch, page, releaseBody: () => releaseBody() };
}

it('lookalike close preserves a real pre-close forwarded response body until both listeners can drain', async () => {
  const p = await holdForwardedBody();
  let closed = false;
  const close = p.fixture.close().then(() => { closed = true; });
  try {
    await tick(); expect(closed).toBe(false);
  } finally { p.releaseBody(); }
  // Concurrent second-listener close destroys this actual HTTP exchange, yielding an error instead.
  expect(await p.page).toEqual({ status: 200, body: forwardedPage });
  await close; expect(closed).toBe(true);
  expect(p.administrativeEntries).not.toHaveBeenCalled();
  expect(p.lookalikeServer.listening).toBe(false); expect(p.canonicalServer.listening).toBe(false);
});

it('lookalike listener refuses late GET and POST during close without forwarding, capture or administrative effects', async () => {
  const p = await holdForwardedBody();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const listenerEntries: string[] = [];
  p.lookalikeServer.on('request', (request) => { listenerEntries.push(`${request.method} ${request.url}`); });
  let closed = false;
  const close = p.fixture.close().then(() => { closed = true; });
  try {
    for (const [path, init] of [['/?runId=A', undefined], ['/login', { method: 'POST', body: login() }]] as const) {
      const response = await p.originalFetch(`${p.fixture.lookalikeOrigin}${path}`, init);
      expect({ status: response.status, body: await response.text() }).toEqual({ status: 500, body: 'fixture error' });
    }
    expect(listenerEntries).toEqual(['GET /?runId=A', 'POST /login']);
    expect(p.forwardFetch).toHaveBeenCalledTimes(1); // Only the already-admitted forwarded request.
    expect(await p.fixture.lookalikeRequests()).toEqual([]);
    expect(p.administrativeEntries).not.toHaveBeenCalled();
    expect(await readFile(join(p.root, 'lookalike.requests'), 'utf8')).toBe('');
    expect(await readFile(join(p.root, 'A.requests'), 'utf8')).toBe('');
    expect(await readFile(join(p.root, 'A.unauthorized.requests'), 'utf8')).toBe('');
    expect(closed).toBe(false);
  } finally { p.releaseBody(); }
  expect(await p.page).toEqual({ status: 200, body: forwardedPage });
  await close; expect(closed).toBe(true);
  expect(p.administrativeEntries).not.toHaveBeenCalled();
  expect(p.lookalikeServer.listening).toBe(false); expect(p.canonicalServer.listening).toBe(false);
});

it('lookalike nested canonical admission after close returns fixed 500 and settles both listeners', async () => {
  const p = await startLookalikeForClose();
  const originalFetch = globalThis.fetch;
  const forwardStarted = barrier(); const allowForward = barrier();
  let closing = false;
  const nestedAdmissions: boolean[] = [];
  p.canonicalServer.on('request', (request) => { if (request.url === '/login?runId=A') nestedAdmissions.push(closing); });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (String(input) === `${p.fixture.origin}/login?runId=A`) {
      forwardStarted.release(); await allowForward.promise;
    }
    return originalFetch(input, init); // The nested canonical request still uses the actual HTTP listener.
  });
  const page = originalFetch(`${p.fixture.lookalikeOrigin}/?runId=A`)
    .then(async (response) => ({ status: response.status, body: await response.text() }))
    .catch((error: unknown) => ({ error: error instanceof Error ? error.name : 'unknown' }));
  await forwardStarted.promise;
  expect(nestedAdmissions).toEqual([]);
  closing = true;
  let closed = false;
  const close = p.fixture.close().then(() => { closed = true; });
  try { await tick(); expect(closed).toBe(false); }
  finally { allowForward.release(); }
  expect(await page).toEqual({ status: 500, body: 'fixture error' });
  await close; expect(closed).toBe(true);
  expect(nestedAdmissions).toEqual([true]);
  expect(p.administrativeEntries).not.toHaveBeenCalled();
  expect(await p.fixture.lookalikeRequests()).toEqual([]);
  expect(p.lookalikeServer.listening).toBe(false); expect(p.canonicalServer.listening).toBe(false);
});
