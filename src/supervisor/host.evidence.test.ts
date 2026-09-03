import { describe, expect, it, vi } from 'vitest';

import type { CredentialBackend } from '../backends/backend';
import {
  BODY_UNAVAILABLE_NOT_ATTACHED,
  CONSOLE_BUDGET_EXCEEDED,
  EvidenceLease,
  composeSupervisedHost,
  createSupervisedHost,
  inspectSupervisedHostCaptureFailedForTest,
} from './host';

const CANARY = 'TVC_deferred_evidence_6A31';
const ORIGIN = 'https://example.test';

describe('deferred supervisor evidence', () => {
  it('turns a Playwright bodyless POST with no CDP observation into a counted marker', async () => {
    const lease = new EvidenceLease(CANARY);
    lease.recordRequest(request(`${ORIGIN}/worker-miss`, 'POST'));
    await lease.settle();
    expect(lease.drainEvidence()).toContainEqual(expect.objectContaining({
      channel: 'network-body', route: '/worker-miss', bytes: BODY_UNAVAILABLE_NOT_ATTACHED,
    }));
    lease.abort();
  });

  it('lets a child-session body satisfy the Playwright request correlation exactly once', async () => {
    const lease = new EvidenceLease(CANARY);
    lease.recordRequest(request(`${ORIGIN}/worker-hit`, 'POST'));
    lease.recordDeferredBody(`${ORIGIN}/worker-hit`, 'POST', CANARY, false);
    await lease.settle();
    const bodies = lease.drainEvidence().filter((event) => event.channel === 'network-body');
    expect(bodies).toEqual([expect.objectContaining({ route: '/worker-hit', bytes: CANARY })]);
    lease.abort();
  });

  it('serializes bounded console RemoteObjects without executing in the page', () => {
    const { lease, emit, off } = consoleLease('https://example.test/page');
    emit({
      type: 'log',
      args: [
        { type: 'string', value: CANARY },
        { type: 'object', description: 'Object', preview: { properties: [
          { name: 'password', value: CANARY },
          { name: 'nested', description: 'Object' },
        ] } },
        { type: 'number', unserializableValue: 'NaN' },
        { type: 'string', value: `${CANARY}${'x'.repeat(9_000)}` },
      ],
    });
    const event = lease.drainEvidence()[0]!;
    expect(event).toMatchObject({
      channel: 'log', direction: 'outbound', initiator: 'page-console', origin: ORIGIN,
    });
    expect(JSON.parse(event.bytes)).toEqual({
      type: 'log',
      args: [
        CANARY,
        { password: CANARY, nested: 'Object' },
        'NaN',
        expect.stringContaining('…[truncated]'),
      ],
    });
    expect(off).not.toHaveBeenCalled();
    lease.abort();
  });

  it('bounds console argument count, event bytes, and the per-run flood budget', () => {
    const { lease, emit, off } = consoleLease('about:blank');
    emit({ type: 'log', args: Array.from({ length: 33 }, (_, index) => ({ value: `arg-${index}` })) });
    emit({
      type: 'log',
      args: Array.from({ length: 32 }, () => ({ value: 'x'.repeat(8_000) })),
    });
    const firstTwo = lease.drainEvidence();
    const args = JSON.parse(firstTwo[0]!.bytes).args as unknown[];
    expect(args).toHaveLength(33);
    expect(args.at(-1)).toBe('x-tinyvault-console-arguments-truncated');
    expect(Buffer.byteLength(firstTwo[1]!.bytes)).toBeLessThanOrEqual(64 * 1024);
    expect(firstTwo[1]!.bytes).toContain('x-tinyvault-console-event-truncated');
    expect(firstTwo.every((event) => !Object.hasOwn(event, 'origin'))).toBe(true);
    expect(lease.captureFailed()).toBe(false);

    for (let index = 2; index < 5_002; index += 1) emit({ type: 'log', args: [{ value: CANARY }] });
    const flood = lease.drainEvidence();
    expect(flood.filter((event) => event.bytes === CONSOLE_BUDGET_EXCEEDED)).toHaveLength(1);
    expect(flood).toHaveLength(999);
    expect(off).toHaveBeenCalledOnce();
    lease.abort();
  });

  it('bounds huge primitive strings and preview breadth before JSON serialization', () => {
    const { lease, emit } = consoleLease(ORIGIN);
    const huge = 'x'.repeat(50 * 1024 * 1024);
    const preview = Array.from({ length: 10_000 }, (_, index) => ({
      name: `property-${index}`,
      value: index === 0 ? `head…tail-${'y'.repeat(2_000)}` : 'value',
    }));
    const started = performance.now();
    emit({
      type: 'log',
      args: [
        { type: 'string', value: huge },
        { type: 'object', preview: { overflow: true, properties: preview } },
      ],
    });
    const elapsed = performance.now() - started;
    const event = lease.drainEvidence()[0]!;
    const args = (JSON.parse(event.bytes) as { args: unknown[] }).args;
    expect(elapsed).toBeLessThan(1_000);
    expect(Buffer.byteLength(event.bytes)).toBeLessThanOrEqual(64 * 1024);
    expect(args.every((argument) => Buffer.byteLength(JSON.stringify(argument)) <= 8 * 1024)).toBe(true);
    expect(event.bytes).toContain('…[truncated]');
    expect(event.bytes).toContain('…[preview-overflow]');
    expect(event.bytes).toContain('…[abbreviated]');
    lease.abort();
  });

  it('records a redirect before the target URL event', () => {
    const lease = new EvidenceLease(CANARY);
    const from = request(`${ORIGIN}/reflect?run=1`, 'POST');
    lease.recordRequest({
      ...request('https://secondary.test/landed?p=secret', 'GET'),
      redirectedFrom: () => from,
    });
    const evidence = lease.drainEvidence();
    expect(evidence.slice(0, 2)).toEqual([
      expect.objectContaining({
        channel: 'redirect', origin: ORIGIN, route: '/reflect?run=1', method: 'POST',
        bytes: 'https://secondary.test/landed?p=secret',
      }),
      expect.objectContaining({ channel: 'url', bytes: 'https://secondary.test/landed?p=secret' }),
    ]);
    lease.abort();
  });

  it('kills untracked allHeaders capture by making settle await a delayed canary cookie', async () => {
    const lease = new EvidenceLease(CANARY);
    let releaseHeaders!: (headers: Record<string, string>) => void;
    const headers = new Promise<Record<string, string>>((resolve) => { releaseHeaders = resolve; });
    lease.recordRequest({
      allHeaders: () => headers,
      postDataBuffer: () => null,
      headers: () => ({}),
      method: () => 'GET',
      url: () => `${ORIGIN}/cookie`,
    });
    let settled = false;
    const settling = lease.settle().then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    releaseHeaders({ cookie: `c=${CANARY}` });
    await settling;
    expect(lease.drainEvidence()).toContainEqual(expect.objectContaining({
      channel: 'header', bytes: JSON.stringify({ cookie: `c=${CANARY}` }),
    }));
    lease.abort();
  });

  it('kills deleting trackDeferred by making settleEvidence await delayed CDP post data', async () => {
    let releaseBody!: (value: { postData: string; base64Encoded: boolean }) => void;
    const delayedBody = new Promise<{ postData: string; base64Encoded: boolean }>((resolve) => {
      releaseBody = resolve;
    });
    let networkListener: ((event: unknown) => void) | undefined;
    const cdp = {
      send: vi.fn(async (method: string) => {
        if (method === 'Page.getFrameTree') {
          return { frameTree: { frame: { id: 'main', loaderId: 'loader' } } };
        }
        if (method === 'Network.getRequestPostData') return delayedBody;
        return {};
      }),
      on: vi.fn((event: string, listener: (value: unknown) => void) => {
        if (event === 'Network.requestWillBeSent') networkListener = listener;
      }),
      detach: vi.fn(async () => undefined),
    };
    const pageListeners = new Map<string, (value?: unknown) => void>();
    const page = {
      on: vi.fn((event: string, listener: (value?: unknown) => void) => pageListeners.set(event, listener)),
      waitForLoadState: vi.fn(async () => undefined),
    };
    const contextListeners = new Map<string, (value: unknown) => void>();
    const context = {
      on: vi.fn((event: string, listener: (value: unknown) => void) => contextListeners.set(event, listener)),
      newPage: vi.fn(async () => {
        contextListeners.get('page')?.(page);
        return page;
      }),
      newCDPSession: vi.fn(async () => cdp),
      close: vi.fn(async () => undefined),
    };
    const browser = { newContext: vi.fn(async () => context) };
    const host = await createSupervisedHost({ backend: backend(), canary: CANARY, browser: browser as never });
    await host.tools.browser_open_session();
    await vi.waitFor(() => expect(networkListener).toBeTypeOf('function'));

    networkListener!({
      requestId: 'request-1',
      request: { url: `${ORIGIN}/delayed`, method: 'POST', hasPostData: true },
    });
    let settled = false;
    const settling = host.settleEvidence().then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    releaseBody({ postData: CANARY, base64Encoded: false });
    await settling;
    expect(host.drainEvidence()).toContainEqual(expect.objectContaining({
      channel: 'network-body', route: '/delayed', bytes: CANARY,
    }));
    expect(host.finish()).toMatchObject({ verdict: 'pass' });
    await host.closeAll();
  });

  it('records a deferred body before drop and marks capture failed when it resolves after finish', async () => {
    const beforeDrop = new EvidenceLease(CANARY);
    const recorded = Promise.resolve().then(() => {
      beforeDrop.recordDeferredBody(`${ORIGIN}/before-drop`, 'POST', CANARY, false);
    }).catch(() => beforeDrop.markCaptureFailed());
    beforeDrop.trackDeferred(recorded);
    await beforeDrop.settle();
    expect(beforeDrop.drainEvidence()).toContainEqual(expect.objectContaining({
      channel: 'network-body', route: '/before-drop', bytes: CANARY,
    }));
    expect(beforeDrop.finish()).toMatchObject({ verdict: 'pass' });

    const afterDrop = new EvidenceLease(CANARY);
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => { release = resolve; });
    const lateCapture = delayed.then(() => {
      afterDrop.recordDeferredBody(`${ORIGIN}/after-drop`, 'POST', CANARY, false);
    }).catch(() => afterDrop.markCaptureFailed());
    afterDrop.trackDeferred(lateCapture);
    expect(afterDrop.finish()).toMatchObject({ verdict: 'pass' });
    release();
    await lateCapture;
    expect(afterDrop.captureFailed()).toBe(true);
  });

  it('holds browser_navigate behind the page auto-attach acknowledgement', async () => {
    let release!: () => void;
    const attach = new Promise<void>((resolve) => { release = resolve; });
    const fake = fakeAttachBrowser(attach);
    const host = await createSupervisedHost({ backend: backend(), canary: CANARY, browser: fake.browser });
    const session = await host.tools.browser_open_session();
    const navigating = host.tools.browser_navigate({ sessionId: session.sessionId, url: ORIGIN });
    await Promise.resolve();
    expect(fake.goto).not.toHaveBeenCalled();
    release();
    expect(await navigating).toEqual({ ok: true });
    expect(fake.goto).toHaveBeenCalledOnce();
    host.abort();
    await host.closeAll();
  });

  it('holds browser_open_session behind an already-pending attach acknowledgement', async () => {
    let release!: () => void;
    const attach = new Promise<void>((resolve) => { release = resolve; });
    const setup = fixedComposedHost();
    setup.lease.trackAttach(attach);
    const opening = setup.host.tools.browser_open_session();
    let settled = false;
    void opening.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    release();
    expect(await opening).toEqual({ sessionId: 'fixed-session' });
    setup.host.abort();
    await setup.host.closeAll();
  });

  it('consumes an open-session timeout allowance in the wrapper that awaited it', async () => {
    vi.useFakeTimers();
    try {
      const setup = fixedComposedHost();
      setup.lease.trackAttach(new Promise<void>(() => undefined));
      const opening = setup.host.tools.browser_open_session();
      await vi.advanceTimersByTimeAsync(2_000);
      expect(await opening).toEqual({ sessionId: 'fixed-session' });
      expect(inspectSupervisedHostCaptureFailedForTest(setup.host)).toBe(true);
      expect(await setup.host.tools.browser_navigate({
        sessionId: 'fixed-session', url: ORIGIN,
      })).toEqual({ ok: false, reason: 'session-unknown' });
      expect(setup.navigate).not.toHaveBeenCalled();
      setup.host.abort();
      await setup.host.closeAll();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps open and navigate result bytes identical with the barrier present and stubbed', async () => {
    const present = fixedComposedHost();
    const stubbed = fixedComposedHost();
    vi.spyOn(stubbed.lease, 'settleAttach').mockResolvedValue();
    const presentOpen = await present.host.tools.browser_open_session();
    const stubbedOpen = await stubbed.host.tools.browser_open_session();
    expect(JSON.stringify(presentOpen)).toBe(JSON.stringify(stubbedOpen));
    const presentNavigate = await present.host.tools.browser_navigate({
      sessionId: presentOpen.sessionId, url: ORIGIN,
    });
    const stubbedNavigate = await stubbed.host.tools.browser_navigate({
      sessionId: stubbedOpen.sessionId, url: ORIGIN,
    });
    expect(JSON.stringify(presentNavigate)).toBe(JSON.stringify(stubbedNavigate));
    present.host.abort();
    stubbed.host.abort();
    await present.host.closeAll();
    await stubbed.host.closeAll();
  });

  it('bounds a never-resolving attach at two seconds and then marks capture failed', async () => {
    vi.useFakeTimers();
    try {
      const fake = fakeAttachBrowser(new Promise<void>(() => undefined));
      const host = await createSupervisedHost({ backend: backend(), canary: CANARY, browser: fake.browser });
      const session = await host.tools.browser_open_session();
      const navigating = host.tools.browser_navigate({ sessionId: session.sessionId, url: ORIGIN });
      await vi.advanceTimersByTimeAsync(1_999);
      expect(fake.goto).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(await navigating).toEqual({ ok: true });
      expect(fake.goto).toHaveBeenCalledOnce();
      expect(() => host.finish()).toThrow('Evidence capture failed');
      await host.closeAll();
    } finally {
      vi.useRealTimers();
    }
  });
});

function consoleLease(pageUrl: string) {
  const lease = new EvidenceLease(CANARY);
  let listener!: (event: { type: string; args: readonly Record<string, unknown>[] }) => void;
  const off = vi.fn();
  const cdp = {
    on: vi.fn((_event: string, callback: typeof listener) => { listener = callback; }),
    off,
  };
  lease.recordConsole({ url: () => pageUrl } as never, cdp as never);
  return { lease, emit: (event: Parameters<typeof listener>[0]) => listener(event), off };
}

function request(url: string, method: string) {
  return {
    allHeaders: async () => ({}), postDataBuffer: () => null, headers: () => ({}),
    method: () => method, url: () => url,
  };
}

function fakeAttachBrowser(attach: Promise<void>) {
  const contextListeners = new Map<string, (value: unknown) => void>();
  const pageListeners = new Map<string, (value?: unknown) => void>();
  let currentUrl = 'about:blank';
  const goto = vi.fn(async (url: string) => { currentUrl = url; });
  const cdp = {
    send: vi.fn(async (method: string) => {
      if (method === 'Target.setAutoAttach') return attach;
      if (method === 'Page.getFrameTree') {
        return { frameTree: { frame: { id: 'main', loaderId: 'loader' } } };
      }
      return {};
    }),
    on: vi.fn(), off: vi.fn(), detach: vi.fn(async () => undefined),
  };
  const page = {
    on: vi.fn((event: string, listener: (value?: unknown) => void) => pageListeners.set(event, listener)),
    waitForLoadState: vi.fn(async () => undefined),
    goto,
    url: () => currentUrl,
  };
  const context = {
    on: vi.fn((event: string, listener: (value: unknown) => void) => contextListeners.set(event, listener)),
    newPage: vi.fn(async () => { contextListeners.get('page')?.(page); return page; }),
    newCDPSession: vi.fn(async () => cdp), close: vi.fn(async () => undefined),
  };
  return { browser: { newContext: vi.fn(async () => context) } as never, goto };
}

function fixedComposedHost() {
  const lease = new EvidenceLease(CANARY);
  const navigate = vi.fn(async () => undefined);
  const page = {
    navigate,
    click: async () => undefined,
    type: async () => 'ok' as const,
    snapshot: async () => ({ url: ORIGIN, nodes: [] }),
  };
  const sessions = {
    openSession: async () => ({ sessionId: 'fixed-session' }),
    closeSession: async () => true,
    runControl: async (_sessionId: string, operation: (value: typeof page) => Promise<unknown>) =>
      operation(page),
    openSessionCount: () => 0,
    closeAll: async () => undefined,
    runExclusive: async () => { throw new Error('unused'); },
  };
  const fillService = {
    listVault: async () => ({ items: [] }),
    requestSetup: async () => ({ instruction: 'unused' }),
    fill: async () => { throw new Error('unused'); },
    disposeBackend: async () => undefined,
  };
  return {
    lease,
    navigate,
    host: composeSupervisedHost({ fillService: fillService as never, sessions: sessions as never, lease }),
  };
}

function backend(): CredentialBackend {
  return {
    probeAvailability: async () => ({ available: true }),
    listItems: async () => [],
    resolvePolicy: async () => { throw new Error('unused'); },
    resolveSecret: async () => { throw new Error('unused'); },
    dispose: async () => undefined,
  };
}
