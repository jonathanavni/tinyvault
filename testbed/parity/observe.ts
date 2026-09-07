import type { Browser, BrowserContext } from '../../src/browser/playwright';
import { validateBareOrigin } from '../../src/core/originGuard';
import type { FixtureTransport } from '../fixtures/transport';
import type { FixtureId } from '../scenarios/types';
import type { HeaderObservation, ParityCollector, ParityProvenance, ParityRunDescriptor,
  ParityRunIdentity, ParityRunSnapshot, RequestObservation, ResponseObservation, WireEvent } from './types';

export const PARITY_OBSERVER_LIMITS = Object.freeze({ requests: 128, slots: 512, headerEntries: 128,
  headerBytes: 262144, witnessBytes: 2097152, headerTimeoutMs: 2000 });
const fail = (category: string): Error => new Error(`Parity observation failed: ${category}`);
const identityKey = (d: ParityRunIdentity): string => JSON.stringify([d.scenario, d.agent, d.runIndex]);

export function captureFixtureProvenance(fixtures: Readonly<Partial<Record<FixtureId, FixtureTransport>>>,
  architecture: 'in-process' | 'composed'): ParityProvenance {
  const result: Partial<Record<FixtureId, NonNullable<ParityProvenance[FixtureId]>>> = {};
  for (const [id, fixture] of Object.entries(fixtures)) {
    const roles = fixture.originRoles;
    const lookalike = id === 'lookalike-origin';
    if (!roles || Reflect.ownKeys(roles).some((key) => typeof key !== 'string')
      || Reflect.ownKeys(roles).sort().join(',') !== (lookalike ? 'C,L' : 'C')
      || roles.C !== fixture.origin || (lookalike && roles.C === roles.L)
      || fixture.architecture !== architecture || fixture.reachability !== 'http') throw fail('provenance');
    const copiedRoles = { C: roles.C, ...(lookalike ? { L: roles.L } : {}) };
    for (const origin of Object.values(copiedRoles)) {
      if (typeof origin !== 'string') throw fail('provenance');
      try { if (validateBareOrigin(origin) !== origin) throw fail('provenance'); }
      catch { throw fail('provenance'); }
    }
    result[id as FixtureId] = Object.freeze({ fixtureId: id as FixtureId, architecture: fixture.architecture,
      reachability: fixture.reachability, originRoles: Object.freeze(copiedRoles) });
  }
  return Object.freeze(result);
}

/** One collector per capture; each expected run owns an independent observer. */
export function createParityCollector(expected: readonly ParityRunIdentity[], options: Readonly<{ wire: boolean }> = { wire: true }): ParityCollector {
  const wireEnabled = options.wire;
  const inventory = expected.map((d) => Object.freeze({ scenario: d.scenario, agent: d.agent, runIndex: d.runIndex }));
  if (!inventory.length || new Set(inventory.map(identityKey)).size !== inventory.length) throw fail('inventory');
  const runs = new Map<string, { descriptor: ParityRunDescriptor; observer?: ReturnType<typeof observeRun>;
    ending: boolean; ended: boolean; unauthorized?: ParityRunSnapshot['unauthorizedRequests'] }>();
  let rejected = false;
  const reject = (): never => { rejected = true; throw fail('inventory'); };
  function find(d: ParityRunDescriptor) {
    const run = runs.get(identityKey(d));
    if (!run || Object.keys(run.descriptor).some((key) => run.descriptor[key as keyof ParityRunDescriptor] !== d[key as keyof ParityRunDescriptor])) return reject();
    return run;
  }
  return Object.freeze({
    beginRun(d: ParityRunDescriptor, browser: Browser) {
      const key = identityKey(d);
      if (rejected || runs.has(key) || key !== identityKey(inventory[runs.size] ?? { scenario: '', agent: '', runIndex: -1 })
        || [...runs.values()].some((r) => !r.ended || r.descriptor.runId === d.runId)) return reject();
      const descriptorKeys = ['scenario', 'agent', 'runIndex', 'runId', 'canary', 'canaryId', 'nonce',
        'vaultPath', 'keyPath', 'transcriptPath', 'eventsPath'];
      if (Object.keys(d).sort().join(',') !== descriptorKeys.sort().join(',')
        || descriptorKeys.some((field) => field !== 'runIndex' && typeof d[field as keyof ParityRunDescriptor] !== 'string')) return reject();
      const descriptor = Object.freeze({ ...d });
      const observer = wireEnabled ? observeRun(browser) : undefined;
      runs.set(key, { descriptor, observer, ending: false, ended: false });
      return observer?.browser ?? browser;
    },
    async endRun(d: ParityRunDescriptor) {
      const run = find(d);
      if (run.ending) return reject();
      run.ending = true;
      try { await run.observer?.end(); run.ended = true; } catch (error) { rejected = true; throw error; }
    },
    collectUnauthorized(d: ParityRunDescriptor, requests: ParityRunSnapshot['unauthorizedRequests']) {
      const run = find(d);
      if (!run.ended || run.unauthorized !== undefined || !Array.isArray(requests)) return reject();
      const copy = Array.from(requests, (request) => {
        if (!request || Object.keys(request).sort().join(',') !== 'body,route'
          || typeof request.route !== 'string' || typeof request.body !== 'string') return reject();
        return Object.freeze({ route: request.route, body: request.body });
      });
      run.unauthorized = Object.freeze(copy);
    },
    snapshots() {
      if (rejected || runs.size !== inventory.length) return reject();
      return Object.freeze([...runs.values()].map((run) => {
        if (!run.ended || run.unauthorized === undefined) return reject();
        return Object.freeze({ descriptor: run.descriptor, ...(run.observer ? { wire: run.observer.snapshot() } : {}),
          unauthorizedRequests: run.unauthorized });
      }));
    },
  });
}

type Slot = { identity: Readonly<Record<string, string | number | null>>; headers?: HeaderObservation };
function observeRun(realBrowser: Browser) {
  const slots: Slot[] = [];
  const requests = new WeakMap<object, { contextId: number; requestId: number; response: boolean }>();
  const registered: { response: boolean }[] = [];
  const pending: Promise<void>[] = [];
  const removers: (() => void)[] = [];
  let contexts = 0;
  let bytes = 0;
  let failure: string | undefined;
  let ending = false;
  let ended = false;
  let frozen: readonly WireEvent[] | undefined;
  const latch = (category: string) => { failure ??= category; };
  const total = (callback: () => void) => { try { callback(); } catch { latch('callback'); } };
  function reserve(identity: Slot['identity']): Slot | undefined {
    if (slots.length >= PARITY_OBSERVER_LIMITS.slots) { latch('slot-budget'); return; }
    const immutable = Object.freeze({ ...identity, eventIndex: slots.length });
    bytes += Buffer.byteLength(JSON.stringify(immutable));
    if (bytes > PARITY_OBSERVER_LIMITS.witnessBytes) { latch('witness-budget'); return; }
    const slot: Slot = { identity: immutable };
    slots.push(slot);
    return slot;
  }
  function attach(context: BrowserContext) {
    if (ending) { latch('late-context'); throw fail('late-context'); }
    const contextId = contexts++;
    let closed = false;
    const cancellations = new Set<() => void>();
    function read(slot: Slot, observation: RequestObservation | ResponseObservation) {
      let active = true;
      let finish!: () => void;
      const done = new Promise<void>((resolve) => { finish = resolve; });
      pending.push(done);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const settle = (headers: HeaderObservation) => {
        if (!active) return;
        active = false;
        clearTimeout(timer);
        cancellations.delete(cancel);
        slot.headers = headers;
        if (headers.state !== 'present') latch(headers.state);
        finish();
      };
      const cancel = () => settle(Object.freeze({ state: 'closed' }));
      cancellations.add(cancel);
      timer = setTimeout(() => settle(Object.freeze({ state: 'timeout' })), PARITY_OBSERVER_LIMITS.headerTimeoutMs);
      try {
        // Start at ingress and immediately handle both settlements. No emitter-await.
        const reading = observation.headersArray();
        void Promise.resolve(reading).then((headers) => {
          if (!active) return;
          try {
            if (!Array.isArray(headers)) { settle(Object.freeze({ state: 'missing' })); return; }
            if (headers.length > PARITY_OBSERVER_LIMITS.headerEntries) { latch('header-budget'); settle(Object.freeze({ state: 'missing' })); return; }
            let headerBytes = 0;
            const entries = headers.map((header) => {
              if (!header || typeof header.name !== 'string' || typeof header.value !== 'string') throw fail('missing');
              headerBytes += Buffer.byteLength(header.name) + Buffer.byteLength(header.value);
              return Object.freeze({ name: header.name, value: header.value });
            });
            if (headerBytes > PARITY_OBSERVER_LIMITS.headerBytes) {
              latch('header-budget'); settle(Object.freeze({ state: 'missing' })); return;
            }
            bytes += Buffer.byteLength(JSON.stringify(entries));
            if (bytes > PARITY_OBSERVER_LIMITS.witnessBytes) {
              latch('witness-budget'); settle(Object.freeze({ state: 'missing' })); return;
            }
            settle(Object.freeze({ state: 'present', entries: Object.freeze(entries) }));
          } catch { settle(Object.freeze({ state: 'missing' })); }
        }, () => settle(Object.freeze({ state: closed ? 'closed' : 'missing' })));
      } catch { settle(Object.freeze({ state: closed ? 'closed' : 'missing' })); }
    }
    const ingress = (callback: () => void) => total(() => {
      if (closed || ending || ended) { latch('late-callback'); return; }
      callback();
    });
    const onRequest = (request: RequestObservation) => ingress(() => {
      if (requests.has(request) || registered.length >= PARITY_OBSERVER_LIMITS.requests) { latch('request-budget-or-identity'); return; }
      const predecessor = request.redirectedFrom();
      const previous = predecessor === null ? undefined : requests.get(predecessor);
      if (predecessor !== null && (!previous || previous.contextId !== contextId)) { latch('redirect-identity'); return; }
      const identity = { contextId, requestId: registered.length, response: false };
      requests.set(request, identity);
      registered.push(identity);
      const url = request.url(); const method = request.method();
      if (typeof url !== 'string' || typeof method !== 'string') { latch('request-fields'); return; }
      const slot = reserve({ kind: 'request', contextId, requestId: identity.requestId,
        url, method, redirectedFrom: previous?.requestId ?? null });
      if (slot) read(slot, request);
    });
    const onResponse = (response: ResponseObservation) => ingress(() => {
      const request = requests.get(response.request());
      if (!request || request.contextId !== contextId || request.response) { latch('response-identity'); return; }
      request.response = true;
      const status = response.status();
      if (!Number.isInteger(status) || status < 100 || status > 599) { latch('response-status'); return; }
      const slot = reserve({ kind: 'response', contextId, requestId: request.requestId, status });
      if (slot) read(slot, response);
    });
    const onFailure = (request: RequestObservation) => ingress(() => {
      const identity = requests.get(request);
      if (!identity || identity.contextId !== contextId) { latch('failure-identity'); return; }
      reserve({ kind: 'failure', contextId, requestId: identity.requestId, category: 'request-failed' });
      latch('request-failed');
    });
    const onClose = () => total(() => { closed = true; for (const cancel of [...cancellations]) cancel(); });
    // Remove only our own listeners, including partial registration failure.
    removers.push(() => {
      context.off('request', onRequest); context.off('response', onResponse);
      context.off('requestfailed', onFailure); context.off('close', onClose);
    });
    try {
      context.on('request', onRequest); context.on('response', onResponse);
      context.on('requestfailed', onFailure); context.on('close', onClose);
    } catch { latch('registration'); throw fail('registration'); }
  }
  const browser = new Proxy(realBrowser, { get(target, key) {
    if (key === 'newContext') return async (...args: Parameters<Browser['newContext']>) => {
      const context = await target.newContext(...args);
      attach(context);
      return context;
    };
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  return {
    browser,
    async end() {
      if (ending) throw fail('duplicate-end');
      ending = true;
      try {
        await Promise.all(pending);
        ended = true;
        if (!registered.length || registered.some((r) => !r.response)) latch('incomplete');
        if (failure) throw fail(failure);
        frozen = Object.freeze(slots.map((slot) => Object.freeze({ ...slot.identity,
          ...(slot.headers ? { headers: slot.headers } : {}) }) as WireEvent));
        if (Buffer.byteLength(JSON.stringify(frozen)) > PARITY_OBSERVER_LIMITS.witnessBytes) throw fail('witness-budget');
      } finally {
        ended = true;
        for (const remove of removers) { try { remove(); } catch { latch('cleanup'); } }
      }
      if (failure) throw fail(failure);
    },
    snapshot() { if (failure || !frozen) throw fail(failure ?? 'incomplete'); return frozen; },
  };
}
