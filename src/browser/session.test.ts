import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import { INVALID_CONTROL_IDENTITY_MESSAGE } from '../core/lockdown';
import { Secret } from '../core/redaction';
import { SessionMutex } from '../core/sessionMutex';
import { createLockdownDomain } from '../supervisor/lockdownDomain';
import type { BrowserContext, CDPSession, Page } from './playwright';
import { createBrowserSessionHost } from './session';

class FakeCdp extends EventEmitter {
  readonly calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  fail = false;
  queryNodeId = 2;
  worldCreations = 0;

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
    if (method === 'DOM.resolveNode') return { object: { objectId: `object-${this.calls.length}` } };
    if (method === 'Runtime.callFunctionOn') return { result: { value: true } };
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
    expect(options.timeout).toBe(2_000);
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
    context.cdp.fail = true;
    expect(await host.runExclusive(sessionId, (port) => port.pinPasswordDestination('#password')))
      .toEqual({ kind: 'no-password-control' });
    context.page.currentUrl = 'about:blank';
    expect(await host.runExclusive(sessionId, (port) => port.observeTop()))
      .toEqual({ origin: null, path: null });
    await host.closeAll();
  });

  it('kills unbounded/unordered close and duplicate page-close lifecycle delivery', async () => {
    const { context, lifecycleCalls, host } = setup();
    const { sessionId } = await host.openSession();
    expect(await host.closeSession(sessionId)).toBe(true);
    expect(context.page.waitCalls).toBe(1);
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
      'taint/cdp-drop',
      'cdp.detach',
      'context.close',
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
    expect(context.page.settleWaits).toBe(1);   // the error page commit is awaited via framenavigated, not load state
    expect(context.page.waitCalls).toBe(0);
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
