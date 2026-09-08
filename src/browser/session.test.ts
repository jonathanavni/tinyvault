import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import { INVALID_CONTROL_IDENTITY_MESSAGE } from '../core/lockdown';
import { Secret } from '../core/redaction';
import { SessionMutex } from '../core/sessionMutex';
import { createLockdownDomain } from '../supervisor/lockdownDomain';
import { ASSIGN_SOURCE, SNAPSHOT_SOURCE } from './inRealm';
import type { BrowserContext, CDPSession, Page } from './playwright';
import { createBrowserSessionHost } from './session';

class FakeCdp extends EventEmitter {
  readonly calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  fail = false;
  queryNodeId = 2;
  worldCreations = 0;
  failTaintedResolution = false;
  taintedResolutionsBeforeFailure: number | undefined;
  snapshotValue: unknown = { url: 'https://example.test/login', nodes: [] };
  callFunctionResponse: unknown;

  constructor(readonly order: string[] = []) {
    super();
  }

  async send(method: string, params?: Record<string, unknown>): Promise<any> {
    this.calls.push({ method, params });
    if (method === 'Runtime.releaseObject') this.order.push('taint/cdp-drop');
    if (this.fail) throw new Error('fake CDP failure');
    if (method === 'Page.getFrameTree') {
      return { frameTree: { frame: { id: 'main', loaderId: 'loader-0' } } };
    }
    if (method === 'DOM.getDocument') return { root: { nodeId: 1 } };
    if (method === 'DOM.querySelector') return { nodeId: this.queryNodeId };
    if (method === 'DOM.describeNode') return { node: { backendNodeId: 7 } };
    if (method === 'Page.createIsolatedWorld') {
      this.worldCreations += 1;
      return { executionContextId: 40 + this.worldCreations };
    }
    if (method === 'DOM.resolveNode') {
      if (this.failTaintedResolution && params?.backendNodeId === 7) {
        throw new Error('forced tainted resolution failure');
      }
      if (this.taintedResolutionsBeforeFailure !== undefined && params?.backendNodeId === 7) {
        if (this.taintedResolutionsBeforeFailure === 0) throw new Error('forced tainted resolution failure');
        this.taintedResolutionsBeforeFailure -= 1;
      }
      return { object: { objectId: `object-${this.calls.length}` } };
    }
    if (method === 'Runtime.callFunctionOn') {
      if (this.callFunctionResponse !== undefined) return this.callFunctionResponse;
      return { result: { value: params?.functionDeclaration === SNAPSHOT_SOURCE ? this.snapshotValue : true } };
    }
    return {};
  }

  async detach(): Promise<void> { this.order.push('cdp.detach'); }
}

class FakePage extends EventEmitter {
  currentUrl = 'https://example.test/login?secret=query#fragment';
  waitCalls = 0;
  settleWaits = 0;
  gotoFailures = 0;
  readonly gotoCalls: string[] = [];
  readonly locatorCalls: string[] = [];
  readonly clickOptions: unknown[] = [];

  constructor(readonly order: string[] = []) {
    super();
  }

  url(): string { return this.currentUrl; }
  async waitForLoadState(_state: string, options: { timeout: number }): Promise<void> {
    expect(options.timeout).toBeGreaterThan(0);
    expect(options.timeout).toBeLessThanOrEqual(2_000);
    this.waitCalls += 1;
  }
  async waitForEvent(event: string, options: { timeout: number; predicate?: unknown }): Promise<void> {
    expect(event).toBe('framenavigated');
    expect(options.timeout).toBe(2_000);
    this.settleWaits += 1;
  }
  mainFrame(): any { return {}; }
  frames(): any[] { return [this.mainFrame()]; }
  locator(selector: string): any {
    this.locatorCalls.push(selector);
    return {
      click: async (options: unknown) => { this.clickOptions.push(options); },
      count: async () => 0,
    };
  }
  async goto(url: string): Promise<void> {
    this.gotoCalls.push(url);
    if (this.gotoFailures > 0) {
      this.gotoFailures -= 1;
      throw new Error('fake navigation failure');
    }
    this.currentUrl = url;
  }
}

class FakeContext extends EventEmitter {
  readonly page: FakePage;
  readonly cdp: FakeCdp;
  newPageCalls = 0;
  cdpCalls = 0;
  closeCalls = 0;
  readonly owner = { contexts: () => this.closeCalls === 0 ? [this] : [] };
  browser() { return this.owner; }

  constructor(readonly order: string[] = []) {
    super();
    this.page = new FakePage(order);
    this.cdp = new FakeCdp(order);
  }

  async newPage(): Promise<Page> { this.newPageCalls += 1; return this.page as unknown as Page; }
  async newCDPSession(page: Page): Promise<CDPSession> {
    expect(page).toBe(this.page);
    this.cdpCalls += 1;
    return this.cdp as unknown as CDPSession;
  }
  async close(): Promise<void> {
    this.closeCalls += 1;
    this.order.push('context.close');
    this.page.emit('close');
    this.emit('close');
  }
}

function setup() {
  const order: string[] = [];
  const context = new FakeContext(order);
  const domain = createLockdownDomain();
  const lifecycleCalls: string[] = [];
  const host = createBrowserSessionHost({
    newContext: async () => context as unknown as BrowserContext,
    authority: domain.authority,
    registry: domain.registry,
    lifecycle: {
      clearOnTrustedTopLevelNavigation(sessionId) {
        lifecycleCalls.push(`navigate:${sessionId}`);
        domain.lifecycle.clearOnTrustedTopLevelNavigation(sessionId);
      },
      clearOnSessionClose(sessionId) {
        lifecycleCalls.push(`close:${sessionId}`);
        order.push('lifecycle.clearOnSessionClose');
        domain.lifecycle.clearOnSessionClose(sessionId);
      },
    },
  });
  return { context, domain, lifecycleCalls, order, host };
}

describe('browser session lifecycle over the CDP seam', () => {
  it('navigation timeout preserves its original failure when cancellation finds a missing target', async () => {
    const { host, context } = setup(); const { sessionId } = await host.openSession();
    const timeout = new Error('original goto timeout'); timeout.name = 'TimeoutError';
    vi.spyOn(context.page, 'goto').mockRejectedValue(timeout);
    const send = context.cdp.send.bind(context.cdp);
    vi.spyOn(context.cdp, 'send').mockImplementation(async (method, params) => {
      if (method === 'Page.stopLoading') throw new Error('Target closed');
      return send(method, params);
    });
    await expect(host.runControl(sessionId, (page) => page.navigate('https://example.test'))).rejects.toBe(timeout);
    await host.closeAll();
  });
  it('quiesced sessions never repeat stop or suspension and idle sessions never request courtesy', async () => {
    const { host, context } = setup();
    await host.openSession();
    await host.quiesceControls(); await host.quiesceControls(); await host.closeAll();
    expect(context.page.waitCalls).toBe(0);
    expect(context.cdp.calls.filter(({ method }) => method === 'Page.stopLoading')).toHaveLength(1);
    expect(context.cdp.calls.filter(({ method }) => method === 'Emulation.setScriptExecutionDisabled')).toHaveLength(1);
  });
  it('emergency disposal retries a retired context and never re-walks settled failed entries', async () => {
    const { host, context } = setup(); const session = await host.openSession();
    const close = vi.spyOn(context, 'close').mockRejectedValueOnce(new Error('first close rejected'));
    expect(await host.closeSession(session.sessionId)).toBe(false);
    expect(context.owner.contexts()).toContain(context);
    await host.abortSessions();
    expect(context.owner.contexts()).toEqual([]);
    const count = close.mock.calls.length;
    await host.abortSessions(); await host.closeAll();
    expect(close).toHaveBeenCalledTimes(count);
  });
  it('a rejected emergency close still rejects queued work and settles the mutex', async () => {
    const { host, context } = setup(); const { sessionId } = await host.openSession();
    let release!: () => void;
    const holder = host.runControl(sessionId, () => new Promise<void>((resolve) => { release = resolve; }));
    await new Promise<void>((resolve) => setImmediate(resolve));
    const queued = host.runControl(sessionId, async () => 'must not run');
    const rejected = expect(queued).rejects.toMatchObject({ kind: 'closing' });
    vi.spyOn(context, 'close').mockImplementationOnce(async () => { release(); throw new Error('close rejected'); });
    await host.abortSessions(); await holder; await rejected;
    expect(context.owner.contexts()).toEqual([]);
    expect(host.openSessionCount()).toBe(0);
  });
  it('abort disposes an owned context whose session is still initializing', async () => {
    const { context, host } = setup();
    let entered!: () => void;
    const admitted = new Promise<void>((resolve) => { entered = resolve; });
    vi.spyOn(context, 'newPage').mockImplementation(() => new Promise((_resolve, reject) => {
      entered(); context.page.once('close', () => reject(new Error('context disposed')));
    }));
    const opening = host.openSession();
    void opening.catch(() => undefined);
    await admitted;
    await host.abortSessions();
    expect(context.owner.contexts()).toEqual([]);
    await expect(opening).rejects.toThrow('context disposed');
    expect(host.openSessionCount()).toBe(0);
  });
  it('suppresses page-close release promises during owner disposal but retains page-initiated cleanup', async () => {
    for (const ownerDisposal of [false, true]) {
      const { host, context } = setup();
      const session = await host.openSession();
      await host.runExclusive(session.sessionId, (port) => port.pinPasswordDestination('#password'));
      let inCloseListener = false;
      let cleanupPromises = 0;
      const emit = context.page.emit.bind(context.page);
      vi.spyOn(context.page, 'emit').mockImplementation((event, ...args) => {
        if (event !== 'close') return emit(event, ...args);
        inCloseListener = true;
        try { return emit(event, ...args); } finally { inCloseListener = false; }
      });
      const all = Promise.all.bind(Promise);
      vi.spyOn(Promise, 'all').mockImplementation(((values: any) => {
        if (inCloseListener) cleanupPromises += 1;
        return all(values);
      }) as typeof Promise.all);
      if (ownerDisposal) expect(await host.closeSession(session.sessionId)).toBe(true);
      else context.page.emit('close');
      expect(cleanupPromises).toBe(ownerDisposal ? 0 : 1);
      vi.restoreAllMocks();
      await host.closeAll();
    }
  });
  it('stops an admitted holder before waiting for close and observes context removal', async () => {
    const { host, context } = setup();
    const session = await host.openSession();
    let release!: () => void;
    const holder = host.runControl(session.sessionId, () => new Promise<void>((resolve) => { release = resolve; }));
    const send = context.cdp.send.bind(context.cdp);
    vi.spyOn(context.cdp, 'send').mockImplementation(async (method, params) => {
      if (method === 'Page.stopLoading') release();
      return send(method, params);
    });
    expect(await host.closeSession(session.sessionId)).toBe(true);
    await holder;
    expect(context.owner.contexts()).not.toContain(context);
    expect(context.cdp.calls.some(({ method }) => method === 'Page.stopLoading')).toBe(true);
  });

  it.each(['stop-rejected', 'context-retained', 'browser-missing'] as const)(
    'reports %s exactly and removes failed sessions from the live cohort', async (mode) => {
      const context = new FakeContext();
      const failure = vi.fn();
      if (mode === 'browser-missing') vi.spyOn(context, 'browser').mockReturnValue(null as never);
      if (mode === 'context-retained') vi.spyOn(context.owner, 'contexts').mockReturnValue([context]);
      const host = createBrowserSessionHost({ newContext: async () => context as never,
        ...createLockdownDomain(), onSessionFailure: failure });
      const { sessionId } = await host.openSession();
      if (mode === 'stop-rejected') context.cdp.fail = true;
      expect(await host.closeSession(sessionId)).toBe(mode === 'browser-missing');
      expect(failure).toHaveBeenCalledExactlyOnceWith(sessionId,
        mode === 'stop-rejected' ? 'stop-failed' : mode === 'browser-missing' ? 'browser-missing' : 'context-not-removed');
      expect(host.openSessionCount()).toBe(0);
      const stops = context.cdp.calls.filter(({ method }) => method === 'Page.stopLoading').length;
      await host.quiesceControls();
      await host.closeAll();
      expect(context.cdp.calls.filter(({ method }) => method === 'Page.stopLoading')).toHaveLength(stops);
      expect(await host.closeSession('unknown')).toBe(false);
    },
  );
  it('keeps the courtesy load wait before cancellation and suspends scripts only after the holder', async () => {
    const { host, context } = setup();
    const { sessionId } = await host.openSession();
    const sequence: string[] = [];
    let release!: () => void;
    const holder = host.runControl(sessionId, () => new Promise<void>((resolve) => { release = resolve; }));
    vi.spyOn(context.page, 'waitForLoadState').mockImplementation(async () => {
      sequence.push('courtesy'); release(); await holder; sequence.push('holder');
    });
    const send = context.cdp.send.bind(context.cdp);
    vi.spyOn(context.cdp, 'send').mockImplementation(async (method, params) => {
      if (method === 'Page.stopLoading' || method === 'Emulation.setScriptExecutionDisabled') sequence.push(method);
      return send(method, params);
    });
    await host.quiesceControls();
    expect(sequence).toEqual(['courtesy', 'holder', 'Page.stopLoading', 'Emulation.setScriptExecutionDisabled']);
    expect(context.cdp.calls.at(-1)?.params).toEqual({ value: true });
    await host.closeAll();
  });

  it('closes a gone target without reporting infrastructure failure', async () => {
    const context = new FakeContext();
    const failure = vi.fn();
    const host = createBrowserSessionHost({ newContext: async () => context as never,
      ...createLockdownDomain(), onSessionFailure: failure });
    const { sessionId } = await host.openSession();
    context.page.emit('close');
    vi.spyOn(context.cdp, 'send').mockRejectedValue(new Error('Protocol error: Target closed'));
    expect(await host.closeSession(sessionId)).toBe(true);
    expect(failure).not.toHaveBeenCalled();
    expect(host.openSessionCount()).toBe(0);
  });

  it('trusted disposal reports the timeout once and waits for the holder after context removal', async () => {
    const context = new FakeContext();
    const failure = vi.fn();
    const host = createBrowserSessionHost({ newContext: async () => context as never,
      ...createLockdownDomain(), onSessionFailure: failure });
    const { sessionId } = await host.openSession();
    let release!: () => void;
    const holder = host.runControl(sessionId, () => new Promise<void>((resolve) => { release = resolve; }));
    let settled = false;
    const disposal = host.disposeSession(sessionId).then(() => { settled = true; });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(context.owner.contexts()).toEqual([]);
    expect(host.openSessionCount()).toBe(0);
    expect(settled).toBe(false);
    release(); await holder; await disposal;
    expect(failure).toHaveBeenCalledExactlyOnceWith(sessionId, 'operation-timeout');
    await host.abortSessions(); await host.closeAll();
    expect(failure).toHaveBeenCalledTimes(1);
  });

  it('requires a close event to qualify a null-browser context', async () => {
    const context = new FakeContext();
    vi.spyOn(context, 'browser').mockReturnValue(null as never);
    vi.spyOn(context, 'close').mockResolvedValue(undefined);
    const failure = vi.fn();
    const host = createBrowserSessionHost({ newContext: async () => context as never,
      ...createLockdownDomain(), onSessionFailure: failure });
    const { sessionId } = await host.openSession();
    expect(await host.closeSession(sessionId)).toBe(false);
    expect(failure.mock.calls).toEqual([[sessionId, 'browser-missing'], [sessionId, 'context-not-removed']]);
    expect(host.openSessionCount()).toBe(0);
  });

  it('kills multiple-CDP-session and per-pin-world mutations with a legitimate pin control', async () => {
    const { context, host } = setup();
    const { sessionId } = await host.openSession();
    const kinds = await host.runExclusive(sessionId, async (port) => [
      (await port.pinPasswordDestination('#password')).kind,
      (await port.pinPasswordDestination('#password')).kind,
    ]);
    expect(kinds).toEqual(['pinned', 'pinned']);
    expect(context.newPageCalls).toBe(1);
    expect(context.cdpCalls).toBe(1);
    expect(context.cdp.worldCreations).toBe(1);
    await host.closeAll();
    expect(context.cdp.calls.filter((call) => call.method === 'Runtime.releaseObject')).toHaveLength(2);
  });

  it.each(['line\nbreak', 'line\rbreak', 'line\r\nbreak'])(
    'refuses %j before conversion, taint, or CDP assignment and disposes the pin',
    async (secret) => {
    const { context, host } = setup();
    const { sessionId } = await host.openSession();
    const pinned = await host.runExclusive(sessionId, (port) => port.pinPasswordDestination('#password'));
    expect(pinned.kind).toBe('pinned');
    if (pinned.kind !== 'pinned') return;
    const padEnd = vi.spyOn(String.prototype, 'padEnd');

    expect(await pinned.destination.inject(new Secret(secret), 'https://example.test'))
      .toEqual({ assigned: false, reason: 'unplaceable' });
    expect(padEnd).not.toHaveBeenCalled();
    expect(context.cdp.calls.filter((call) => call.method === 'Runtime.callFunctionOn'
      && call.params?.functionDeclaration === ASSIGN_SOURCE)).toHaveLength(0);
    expect(context.cdp.calls.filter((call) => call.method === 'Runtime.releaseObject')).toHaveLength(1);
    await host.runControl(sessionId, (page) => page.snapshot());
    const snapshotCall = context.cdp.calls.filter((call) => call.method === 'Runtime.callFunctionOn'
      && call.params?.functionDeclaration === SNAPSHOT_SOURCE).at(-1);
    expect(snapshotCall?.params?.arguments).toEqual([]);
    padEnd.mockRestore();
    await host.closeAll();
  });

  it('fails a snapshot closed when any tainted node cannot be resolved', async () => {
    const { context, host } = setup();
    const { sessionId } = await host.openSession();
    const pinned = await host.runExclusive(sessionId, (port) => port.pinPasswordDestination('#password'));
    expect(pinned.kind).toBe('pinned');
    if (pinned.kind !== 'pinned') return;
    expect(await pinned.destination.inject(new Secret('must-not-escape'), 'https://example.test'))
      .toEqual({ assigned: false, reason: 'transport' });

    const second = await host.runExclusive(sessionId, (port) => port.pinPasswordDestination('#password'));
    expect(second.kind).toBe('pinned');
    if (second.kind !== 'pinned') return;
    expect(await second.destination.inject(new Secret('must-not-escape'), 'https://example.test'))
      .toEqual({ assigned: false, reason: 'transport' });
    context.cdp.snapshotValue = {
      url: 'https://example.test/login',
      nodes: [{ tag: 'input', masked: false, value: 'must-not-escape' }],
    };
    context.cdp.taintedResolutionsBeforeFailure = 1;
    const releasesBeforeSnapshot = context.cdp.calls.filter(
      (call) => call.method === 'Runtime.releaseObject',
    ).length;
    const snapshot = await host.runControl(sessionId, (page) => page.snapshot());
    expect(snapshot).toEqual({ url: '', nodes: [] });
    expect(JSON.stringify(snapshot)).not.toContain('must-not-escape');
    expect(context.cdp.calls.filter((call) => call.method === 'Runtime.callFunctionOn'
      && call.params?.functionDeclaration === SNAPSHOT_SOURCE)).toHaveLength(0);
    expect(context.cdp.calls.filter((call) => call.method === 'Runtime.releaseObject'))
      .toHaveLength(releasesBeforeSnapshot + 2);
    await host.closeAll();
  });

  it('kills missing main-frame/documentOpened epoch invalidation and subframe over-clearing', async () => {
    const { context, domain, lifecycleCalls, host } = setup();
    const { sessionId } = await host.openSession();
    const pinned = await host.runExclusive(sessionId, (port) => port.pinPasswordDestination('#password'));
    expect(pinned.kind).toBe('pinned');
    if (pinned.kind !== 'pinned') return;
    domain.registry.lock(pinned.destination.identity);
    const epoch0 = await host.runExclusive(sessionId, async (port) => port.documentEpoch());

    context.cdp.emit('Page.frameNavigated', { frame: { id: 'child', parentId: 'main', loaderId: 'sub' } });
    expect(await host.runExclusive(sessionId, async (port) => port.documentEpoch())).toBe(epoch0);
    expect(domain.registry.isLocked(pinned.destination.identity)).toBe(true);

    context.cdp.emit('Page.documentOpened', { frame: { id: 'main', loaderId: 'loader-1' } });
    expect(await host.runExclusive(sessionId, async (port) => port.documentEpoch())).toBe(epoch0 + 1);
    expect(() => domain.registry.isLocked(pinned.destination.identity))
      .toThrow(INVALID_CONTROL_IDENTITY_MESSAGE);
    expect(lifecycleCalls.filter((call) => call.startsWith('navigate:'))).toHaveLength(1);
    await host.closeAll();
  });

  it('kills same-document epoch bumps while retaining a top-level cross-document signal', async () => {
    const { context, lifecycleCalls, host } = setup();
    const { sessionId } = await host.openSession();
    const epoch0 = await host.runExclusive(sessionId, async (port) => port.documentEpoch());
    context.cdp.emit('Page.navigatedWithinDocument', { frameId: 'main' });
    expect(await host.runExclusive(sessionId, async (port) => port.documentEpoch())).toBe(epoch0);
    context.cdp.emit('Page.frameNavigated', { frame: { id: 'main', loaderId: 'loader-2' } });
    expect(await host.runExclusive(sessionId, async (port) => port.documentEpoch())).toBe(epoch0 + 1);
    expect(lifecycleCalls.filter((call) => call.startsWith('navigate:'))).toHaveLength(1);
    await host.closeAll();
  });

  it('kills throwing observeTop/pin paths and query-bearing observations', async () => {
    const { context, host } = setup();
    const { sessionId } = await host.openSession();
    expect(await host.runExclusive(sessionId, (port) => port.observeTop())).toEqual({
      origin: 'https://example.test', path: 'https://example.test/login',
    });
    context.page.currentUrl = 'blob:https://example.test/2b29d1d8-6b2d-4b71-a719-f5a312c8cbaa';
    expect(await host.runExclusive(sessionId, (port) => port.observeTop())).toEqual({
      origin: 'https://example.test', path: null,
    });
    context.cdp.fail = true;
    expect(await host.runExclusive(sessionId, (port) => port.pinPasswordDestination('#password')))
      .toEqual({ kind: 'no-password-control' });
    context.page.currentUrl = 'about:blank';
    expect(await host.runExclusive(sessionId, (port) => port.observeTop()))
      .toEqual({ origin: null, path: null });
    await host.closeAll();
  });

  it.each([
    ['exception details', { exceptionDetails: {}, result: { value: false } }],
    ['missing result value', { result: {} }],
    ['truthy result alongside exception details', { exceptionDetails: {}, result: { value: 'truthy' } }],
  ] as const)('fails pinning closed for a CDP response with %s', async (_name, response) => {
    const { context, host } = setup();
    const { sessionId } = await host.openSession();
    context.cdp.callFunctionResponse = response;
    expect(await host.runExclusive(sessionId, (port) => port.pinPasswordDestination('#password')))
      .toEqual({ kind: 'no-password-control' });
    await host.closeAll();
  });

  it('kills unbounded/unordered close and duplicate page-close lifecycle delivery', async () => {
    const { context, lifecycleCalls, host } = setup();
    const { sessionId } = await host.openSession();
    expect(await host.closeSession(sessionId)).toBe(true);
    expect(context.page.waitCalls).toBe(0);
    expect(context.closeCalls).toBe(1);
    expect(lifecycleCalls.filter((call) => call === `close:${sessionId}`)).toHaveLength(1);
    expect(await host.closeSession(sessionId)).toBe(false);
    expect(host.openSessionCount()).toBe(0);
  });

  it('kills reordered close cleanup across mutex, lifecycle, CDP drop, detach, and context close', async () => {
    const { context, order, host } = setup();
    const close = SessionMutex.prototype.close;
    vi.spyOn(SessionMutex.prototype, 'close').mockImplementation(async function (
      this: SessionMutex,
      sessionId: string,
    ) {
      await close.call(this, sessionId);
      order.push('mutex.close');
    });
    const { sessionId } = await host.openSession();
    const first = await host.runExclusive(sessionId, (port) => port.pinPasswordDestination('#password'));
    expect(first.kind).toBe('pinned');
    if (first.kind !== 'pinned') return;
    expect(await first.destination.inject(new Secret('taint-before-close'), 'https://example.test'))
      .toEqual({ assigned: false, reason: 'transport' });
    await host.runExclusive(sessionId, (port) => port.pinPasswordDestination('#password'));
    order.length = 0;
    expect(await host.closeSession(sessionId)).toBe(true);
    expect(order).toEqual([
      'mutex.close',
      'lifecycle.clearOnSessionClose',
      'context.close',
      'taint/cdp-drop',
      'cdp.detach',
    ]);
    vi.restoreAllMocks();
  });

  it('kills missing-selector waits and unbounded clicks while retaining click traffic', async () => {
    const { context, host } = setup();
    const { sessionId } = await host.openSession();
    await host.runControl(sessionId, (page) => page.click('#button'));
    expect(context.page.locatorCalls).toEqual(['#button']);
    expect(context.page.clickOptions).toEqual([{ timeout: 5_000 }]);
    expect(context.page.waitCalls).toBe(1);

    context.cdp.queryNodeId = 0;
    await expect(host.runControl(sessionId, (page) => page.click('#missing')))
      .rejects.toThrow('Missing browser control');
    await expect(host.runControl(sessionId, (page) => page.type('#missing', 'person')))
      .rejects.toThrow('Missing browser control');
    expect(context.page.locatorCalls).toEqual(['#button']);
    await host.closeAll();
  });

  it('settles a failed navigation before rethrowing and retaining subsequent traffic', async () => {
    const { context, host } = setup();
    const { sessionId } = await host.openSession();
    context.page.gotoFailures = 1;
    await expect(host.runControl(sessionId, (page) => page.navigate('http://127.0.0.1:1/unsafe')))
      .rejects.toThrow('fake navigation failure');
    await host.runControl(sessionId, (page) => page.navigate('https://example.test/one'));
    await host.runControl(sessionId, (page) => page.navigate('https://example.test/two'));
    expect(context.page.gotoCalls).toEqual([
      'http://127.0.0.1:1/unsafe', 'https://example.test/one', 'https://example.test/two',
    ]);
    expect(context.cdp.calls.filter(({ method }) => method === 'Page.stopLoading')).toHaveLength(0);
    expect(context.page.settleWaits).toBe(1);   // the error page commit is awaited via framenavigated, not load state
    expect(context.page.waitCalls).toBe(0);
    await host.closeAll();
  });

  it('cancels a goto TimeoutError before the navigation settle barrier', async () => {
    const { context, host } = setup();
    const { sessionId } = await host.openSession();
    vi.spyOn(context.page, 'goto').mockRejectedValue(Object.assign(new Error('navigation timed out'), { name: 'TimeoutError' }));
    const frameWait = vi.spyOn(context.page, 'waitForEvent');
    await expect(host.runControl(sessionId, (page) => page.navigate('http://10.255.255.1/')))
      .rejects.toThrow('navigation timed out');
    expect(context.cdp.calls.at(-1)?.method).toBe('Page.stopLoading');
    expect(frameWait).toHaveBeenCalledOnce();
    await host.closeAll();
  });

  it('kills last-URL reuse after page close and stales prior identities without deleting the session', async () => {
    const { context, domain, lifecycleCalls, host } = setup();
    const { sessionId } = await host.openSession();
    const pinned = await host.runExclusive(sessionId, (port) => port.pinPasswordDestination('#password'));
    expect(pinned.kind).toBe('pinned');
    if (pinned.kind !== 'pinned') return;
    domain.registry.lock(pinned.destination.identity);
    const epoch0 = await host.runExclusive(sessionId, (port) => Promise.resolve(port.documentEpoch()));
    context.page.emit('close');
    expect(await host.runExclusive(sessionId, (port) => Promise.resolve(port.documentEpoch()))).toBe(epoch0 + 1);
    expect(await host.runExclusive(sessionId, (port) => port.observeTop()))
      .toEqual({ origin: null, path: null });
    expect(await host.runExclusive(sessionId, (port) => port.pinPasswordDestination('#password')))
      .toEqual({ kind: 'no-password-control' });
    expect(() => domain.registry.isLocked(pinned.destination.identity))
      .toThrow(INVALID_CONTROL_IDENTITY_MESSAGE);
    expect(host.openSessionCount()).toBe(1);
    expect(lifecycleCalls.filter((call) => call === `close:${sessionId}`)).toHaveLength(1);
    await host.closeAll();
  });
});
