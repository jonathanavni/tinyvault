import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { Browser, BrowserContext } from '../../src/browser/playwright';
import { captureFixtureProvenance, createParityCollector, PARITY_OBSERVER_LIMITS } from './observe';
import type { ParityRunDescriptor, RequestObservation, ResponseObservation } from './types';
import type { FixtureTransport } from '../fixtures/transport';

const descriptor = (runIndex = 0): ParityRunDescriptor => ({ scenario: 'scenario', agent: 'stub', runIndex,
  runId: `run-${runIndex}`, canary: 'synthetic-only', canaryId: 'canary', nonce: 'nonce',
  vaultPath: '/vault', keyPath: '/key', transcriptPath: '/transcript', eventsPath: '/events' });
const headers = [{ name: 'x-duplicate', value: 'first' }, { name: 'x-duplicate', value: 'second' }];
function request(overrides: Partial<RequestObservation> = {}): RequestObservation {
  return { url: () => 'http://fixture.invalid/path?q=1', method: () => 'GET', redirectedFrom: () => null,
    headersArray: async () => headers, ...overrides };
}
function response(req: RequestObservation, overrides: Partial<ResponseObservation> = {}): ResponseObservation {
  return { request: () => req, status: () => 200, headersArray: async () => headers, ...overrides };
}
function setup(wire = true, expected = [descriptor()]) {
  const contexts: EventEmitter[] = [];
  const real = { newContext: async () => { const c = new EventEmitter(); contexts.push(c); return c as unknown as BrowserContext; },
    version() { if (this !== real) throw new Error('binding'); return 'test'; } } as unknown as Browser;
  const collector = createParityCollector(expected, { wire });
  const browser = collector.beginRun(expected[0], real);
  return { collector, browser, real, contexts };
}
async function finish(s: ReturnType<typeof setup>, d = descriptor()) {
  await s.collector.endRun(d);
  s.collector.collectUnauthorized(d, []);
  return s.collector.snapshots();
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

describe('parity observer', () => {
  it('retains duplicate request arrays and ingress order across contexts and deferred reads', async () => {
    const s = setup();
    expect(s.browser.version()).toBe('test');
    const c0 = await s.browser.newContext(); const c1 = await s.browser.newContext();
    expect(c0).toBe(s.contexts[0]); expect(c1).toBe(s.contexts[1]);
    let resolve!: (v: typeof headers) => void;
    const deferred = new Promise<typeof headers>((r) => { resolve = r; });
    const r0 = request({ headersArray: () => deferred }); const r1 = request();
    s.contexts[0].emit('request', r0); s.contexts[1].emit('request', r1);
    s.contexts[1].emit('response', response(r1, { status: () => 303 }));
    s.contexts[0].emit('response', response(r0));
    let ended = false;
    const barrier = finish(s).then((v) => { ended = true; return v; });
    await flush(); expect(ended).toBe(false);
    resolve(headers);
    const [snapshot] = await barrier;
    const wire = snapshot.wire!;
    expect(wire.map((e) => [e.eventIndex, e.kind, e.contextId, e.requestId])).toEqual([
      [0, 'request', 0, 0], [1, 'request', 1, 1], [2, 'response', 1, 1], [3, 'response', 0, 0],
    ]);
    expect(wire[0]).toMatchObject({ url: 'http://fixture.invalid/path?q=1', method: 'GET', redirectedFrom: null,
      headers: { state: 'present', entries: headers } });
    expect(wire[2]).toMatchObject({ status: 303 });
    expect(Object.isFrozen(wire)).toBe(true);
    expect(Object.isFrozen(snapshot.descriptor)).toBe(true);
    expect('headers' in wire[0] && Object.isFrozen(wire[0].headers)).toBe(true);
    for (const c of s.contexts) for (const event of ['request', 'response', 'requestfailed', 'close']) expect(c.listenerCount(event)).toBe(0);
  });
  it('binds redirects to registered request objects without URL matching', async () => {
    const s = setup(); await s.browser.newContext(); const c = s.contexts[0];
    const first = request(); const next = request({ redirectedFrom: () => first });
    c.emit('request', first); c.emit('response', response(first, { status: () => 302 }));
    c.emit('request', next); c.emit('response', response(next));
    expect((await finish(s))[0].wire![2]).toMatchObject({ redirectedFrom: 0, requestId: 1 });
  });
  it.each(['unknown-response', 'cross-context', 'unknown-redirect', 'duplicate-request', 'duplicate-response', 'failed', 'bad-status'])('rejects %s at end without interrupting later listeners', async (kind) => {
    const s = setup(); await s.browser.newContext(); await s.browser.newContext(); const c = s.contexts[0];
    const r = request(); c.emit('request', r);
    const delivered = vi.fn(); c.on('response', delivered); c.on('request', delivered); c.on('requestfailed', delivered);
    if (kind === 'unknown-response') c.emit('response', response(request()));
    if (kind === 'cross-context') { s.contexts[1].on('response', delivered); s.contexts[1].emit('response', response(r)); }
    if (kind === 'unknown-redirect') c.emit('request', request({ redirectedFrom: () => request() }));
    if (kind === 'duplicate-request') c.emit('request', r);
    if (kind === 'duplicate-response') { c.emit('response', response(r)); c.emit('response', response(r)); }
    if (kind === 'failed') c.emit('requestfailed', r);
    if (kind === 'bad-status') c.emit('response', response(r, { status: () => 0 }));
    expect(delivered).toHaveBeenCalled();
    await expect(finish(s)).rejects.toThrow('Parity observation failed:');
    expect(c.listeners('response')).toEqual([delivered]);
  });
  it('contains synchronous callback throws and request budget exhaustion', async () => {
    for (const exhaustion of [false, true]) {
      const s = setup(); await s.browser.newContext(); const c = s.contexts[0]; const host = vi.fn(); c.on('request', host);
      if (exhaustion) for (let i = 0; i <= PARITY_OBSERVER_LIMITS.requests; i++) {
        const r = request(); c.emit('request', r); c.emit('response', response(r));
      }
      else c.emit('request', request({ url: () => { throw new Error('untrusted detail'); } }));
      expect(host).toHaveBeenCalledTimes(exhaustion ? 129 : 1);
      await expect(finish(s)).rejects.toThrow(`Parity observation failed: ${exhaustion ? 'request-budget-or-identity' : 'callback'}`);
      expect(c.listeners('request')).toEqual([host]);
    }
  });
  it.each(['missing', 'timeout', 'closed'])('distinguishes %s header resolution and ignores late settlement', async (state) => {
    vi.useFakeTimers();
    try {
      const s = setup(); await s.browser.newContext(); const c = s.contexts[0];
      let resolve!: (v: typeof headers | null) => void;
      const r = request({ headersArray: () => new Promise((done) => { resolve = done; }) });
      c.emit('request', r); c.emit('response', response(r)); await flush();
      if (state === 'missing') resolve(null);
      if (state === 'closed') c.emit('close');
      const ending = expect(finish(s)).rejects.toThrow(`Parity observation failed: ${state}`);
      if (state === 'timeout') await vi.advanceTimersByTimeAsync(2000);
      await ending;
      resolve(headers); await flush();
      expect(() => s.collector.snapshots()).toThrow('Parity observation failed:');
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it.each(['null', 'throw', 'reject'])('handles response %s headers without empty-array fabrication', async (kind) => {
    const s = setup(); await s.browser.newContext(); const c = s.contexts[0]; const r = request();
    c.emit('request', r); c.emit('response', response(r, { headersArray: () => {
      if (kind === 'throw') throw new Error('private error');
      return kind === 'null' ? Promise.resolve(null) : Promise.reject(new Error('private error'));
    } }));
    await expect(finish(s)).rejects.toThrow('Parity observation failed: missing');
  });
  it.each(['entries', 'header-bytes', 'total-bytes'])('rejects %s budget without truncation', async (kind) => {
    const s = setup(); await s.browser.newContext(); const c = s.contexts[0];
    const entries = kind === 'entries' ? Array.from({ length: 129 }, () => headers[0])
      : [{ name: 'x', value: 'x'.repeat(kind === 'header-bytes' ? 262144 : 200000) }];
    const count = kind === 'total-bytes' ? 12 : 1;
    for (let i = 0; i < count; i++) {
      const r = request({ headersArray: async () => entries });
      c.emit('request', r); c.emit('response', response(r));
    }
    await expect(finish(s)).rejects.toThrow(`Parity observation failed: ${kind === 'total-bytes' ? 'witness-budget' : 'header-budget'}`);
  });
  it('rejects callbacks after context close and empty witnesses', async () => {
    const s = setup(); await s.browser.newContext(); const c = s.contexts[0];
    c.emit('close'); c.emit('request', request());
    await expect(finish(s)).rejects.toThrow('late-callback');
    await expect(finish(setup())).rejects.toThrow('incomplete');
  });
  it('wire-disabled collector preserves the real browser and deep-copies metadata', async () => {
    const s = setup(false); expect(s.browser).toBe(s.real);
    await s.collector.endRun(descriptor());
    const unauthorized = [{ route: '/test', body: 'synthetic' }];
    s.collector.collectUnauthorized(descriptor(), unauthorized); unauthorized[0].body = 'changed';
    const snap = s.collector.snapshots()[0];
    expect(snap).not.toHaveProperty('wire'); expect(s.contexts).toHaveLength(0);
    expect(snap.unauthorizedRequests[0].body).toBe('synthetic');
    expect(Object.isFrozen(snap.unauthorizedRequests[0])).toBe(true);
  });
  it.each(['omitted', 'wrong', 'duplicate-begin', 'duplicate-end', 'wrong-end', 'missing-unauthorized', 'duplicate-unauthorized'])('rejects %s run inventory', async (kind) => {
    const s = setup(false, [descriptor(), descriptor(1)]);
    if (kind === 'omitted') expect(() => s.collector.snapshots()).toThrow('inventory');
    if (kind === 'wrong') expect(() => s.collector.beginRun(descriptor(9), s.real)).toThrow('inventory');
    if (kind === 'duplicate-begin') expect(() => s.collector.beginRun(descriptor(), s.real)).toThrow('inventory');
    if (kind === 'wrong-end') await expect(s.collector.endRun({ ...descriptor(), nonce: 'wrong' })).rejects.toThrow('inventory');
    if (kind === 'duplicate-end') { await s.collector.endRun(descriptor()); await expect(s.collector.endRun(descriptor())).rejects.toThrow('inventory'); }
    if (kind === 'missing-unauthorized') { await s.collector.endRun(descriptor()); expect(() => s.collector.snapshots()).toThrow('inventory'); }
    if (kind === 'duplicate-unauthorized') {
      await s.collector.endRun(descriptor()); s.collector.collectUnauthorized(descriptor(), []);
      expect(() => s.collector.collectUnauthorized(descriptor(), [])).toThrow('inventory');
    }
  });
  it('rejects a response from the previous run even with identical URLs', async () => {
    const s = setup(true, [descriptor(), descriptor(1)]); await s.browser.newContext(); const first = request();
    s.contexts[0].emit('request', first); s.contexts[0].emit('response', response(first)); await s.collector.endRun(descriptor());
    s.collector.collectUnauthorized(descriptor(), []);
    const secondBrowser = s.collector.beginRun(descriptor(1), s.real); await secondBrowser.newContext();
    s.contexts[1].emit('response', response(first));
    await expect(s.collector.endRun(descriptor(1))).rejects.toThrow('response-identity');
  });
});

describe('trusted origin provenance', () => {
  const fixture = (roles = { C: 'http://canonical.invalid', L: 'http://lookalike.invalid' }) => ({ origin: roles.C,
    originRoles: roles, architecture: 'in-process', reachability: 'http' }) as FixtureTransport;
  it('copies and freezes all levels before the fixture can mutate them', () => {
    const f = fixture(); const p = captureFixtureProvenance({ 'lookalike-origin': f }, 'in-process');
    (f.originRoles as { C: string }).C = 'http://changed.invalid';
    expect(p['lookalike-origin']?.originRoles.C).toBe('http://canonical.invalid');
    expect(Object.isFrozen(p)).toBe(true); expect(Object.isFrozen(p['lookalike-origin'])).toBe(true);
    expect(Object.isFrozen(p['lookalike-origin']?.originRoles)).toBe(true);
  });
  it.each(['missing', 'same', 'swapped', 'extra', 'hidden-extra', 'symbol', 'trailing-dot', 'path', 'credentials', 'architecture', 'reachability'])('rejects %s provenance', (kind) => {
    const f = fixture();
    if (kind === 'missing') f.originRoles = { C: f.origin };
    if (kind === 'same') f.originRoles = { C: f.origin, L: f.origin };
    if (kind === 'swapped') f.originRoles = { C: f.originRoles.L!, L: f.origin };
    if (kind === 'extra') f.originRoles = { ...f.originRoles, extra: f.origin } as typeof f.originRoles;
    if (kind === 'path' || kind === 'credentials') f.originRoles = { C: f.origin, L: kind === 'path' ? 'http://other.invalid/' : 'http://u:p@other.invalid' };
    if (kind === 'hidden-extra') Object.defineProperty(f.originRoles, 'hidden', { value: f.origin });
    if (kind === 'symbol') Object.defineProperty(f.originRoles, Symbol('extra'), { value: f.origin });
    if (kind === 'trailing-dot') f.originRoles = { C: f.origin, L: 'http://lookalike.invalid.' };
    if (kind === 'architecture') f.architecture = 'composed';
    if (kind === 'reachability') f.reachability = 'no-socket';
    expect(() => captureFixtureProvenance({ 'lookalike-origin': f }, 'in-process')).toThrow('provenance');
  });
});

it('rejects ingress during the end barrier rather than adding an unawaited read', async () => {
  const s = setup(); await s.browser.newContext(); const c = s.contexts[0];
  let resolve!: (h: typeof headers) => void;
  const r = request({ headersArray: () => new Promise((done) => { resolve = done; }) });
  c.emit('request', r); c.emit('response', response(r));
  const ending = expect(finish(s)).rejects.toThrow('late-callback');
  c.emit('request', request()); resolve(headers); await ending;
});
it('copies the wire option once and rejects malformed unauthorized snapshots', async () => {
  const options = { wire: false };
  const collector = createParityCollector([descriptor()], options); options.wire = true;
  const browser = {} as Browser;
  expect(collector.beginRun(descriptor(), browser)).toBe(browser);
  await collector.endRun(descriptor());
  expect(() => collector.collectUnauthorized(descriptor(), undefined as never)).toThrow('inventory');
});

it('caps reserved callback identities at 512 even after first failure is latched', async () => {
  const s = setup(); await s.browser.newContext(); const c = s.contexts[0];
  // Observe the actual immutable slot reservation, without a production bypass seam.
  const originalFreeze = Object.freeze;
  let reservations = 0;
  const spy = vi.spyOn(Object, 'freeze').mockImplementation(((value: object) => {
    if ('eventIndex' in value && 'kind' in value) reservations++;
    return originalFreeze(value);
  }) as typeof Object.freeze);
  try {
    const r = request(); c.emit('request', r);
    for (let i = 0; i < 520; i++) c.emit('requestfailed', r);
    expect(reservations).toBe(512);
    await expect(finish(s)).rejects.toThrow('Parity observation failed: request-failed');
  } finally { spy.mockRestore(); }
});

it.each([-1, 1])('accounts complete serialized witness bytes at limit %+i', async (offset) => {
  const s = setup(); await s.browser.newContext(); const c = s.contexts[0];
  const values = Array.from({ length: 240 }, () => 'v'.repeat(8000));
  const representation = () => values.map((value, index) => ({
    ...(index % 2 === 0 ? { kind: 'request', contextId: 0, requestId: index / 2,
      url: 'http://fixture.invalid/path?q=1', method: 'GET', redirectedFrom: null }
      : { kind: 'response', contextId: 0, requestId: Math.floor(index / 2), status: 200 }),
    eventIndex: index, headers: { state: 'present', entries: [{ name: 'x', value }] },
  }));
  const target = PARITY_OBSERVER_LIMITS.witnessBytes + offset;
  values[0] += 'v'.repeat(target - Buffer.byteLength(JSON.stringify(representation())));
  expect(Buffer.byteLength(JSON.stringify(representation()))).toBe(target);
  for (let i = 0; i < 120; i++) {
    const r = request({ headersArray: async () => [{ name: 'x', value: values[2 * i] }] });
    c.emit('request', r); c.emit('response', response(r, { headersArray: async () => [{ name: 'x', value: values[2 * i + 1] }] }));
  }
  if (offset === 1) await expect(finish(s)).rejects.toThrow('Parity observation failed: witness-budget');
  else expect(Buffer.byteLength(JSON.stringify((await finish(s))[0].wire))).toBe(target);
});

it('preserves exact two-run descriptors and copies them independently', async () => {
  const ds = [descriptor(), descriptor(1)]; const s = setup(false, ds);
  await s.collector.endRun(ds[0]); s.collector.collectUnauthorized(ds[0], []);
  s.collector.beginRun(ds[1], s.real); await s.collector.endRun(ds[1]); s.collector.collectUnauthorized(ds[1], []);
  expect(s.collector.snapshots().map((snapshot) => snapshot.descriptor)).toEqual(ds);
});
it('never admits the next run or unauthorized collection before the end barrier resolves', async () => {
  const ds = [descriptor(), descriptor(1)]; const s = setup(true, ds); await s.browser.newContext();
  let resolve!: (h: typeof headers) => void;
  const r = request({ headersArray: () => new Promise((done) => { resolve = done; }) });
  s.contexts[0].emit('request', r); s.contexts[0].emit('response', response(r));
  const ending = s.collector.endRun(ds[0]);
  expect(() => s.collector.collectUnauthorized(ds[0], [])).toThrow('inventory');
  expect(() => s.collector.beginRun(ds[1], s.real)).toThrow('inventory');
  resolve(headers); await ending;
});
it('a saved callback after closure rejects subsequent snapshots and cannot mutate the frozen wire', async () => {
  const s = setup(); await s.browser.newContext(); const c = s.contexts[0]; const r = request();
  const savedCallback = c.listeners('request')[0];
  c.emit('request', r); c.emit('response', response(r));
  const snap = (await finish(s))[0]; const length = snap.wire!.length;
  savedCallback(request());
  expect(snap.wire!.length).toBe(length); expect(Object.isFrozen(snap.wire)).toBe(true);
  expect(() => s.collector.snapshots()).toThrow('late-callback');
});

it('copies and validates required roles even when their own keys are non-enumerable', () => {
  const roles = Object.defineProperties({}, { C: { value: 'http://canonical.invalid' }, L: { value: 'http://lookalike.invalid' } });
  const fixture = { origin: 'http://canonical.invalid', architecture: 'in-process', reachability: 'http', originRoles: roles } as FixtureTransport;
  expect(captureFixtureProvenance({ 'lookalike-origin': fixture }, 'in-process')['lookalike-origin']?.originRoles)
    .toEqual({ C: 'http://canonical.invalid', L: 'http://lookalike.invalid' });
  fixture.originRoles = Object.defineProperties({}, { C: { value: fixture.origin }, L: { value: 'invalid' } }) as typeof fixture.originRoles;
  expect(() => captureFixtureProvenance({ 'lookalike-origin': fixture }, 'in-process')).toThrow('provenance');
});
