import { SessionHostError } from '../core/browserPort';
import { describe, expect, it, vi } from 'vitest';
import type { CredentialBackend } from '../backends/backend';
import {
  BODY_UNAVAILABLE_NOT_ATTACHED,
  BODY_UNAVAILABLE_TARGET_DETACHED,
  CONSOLE_BUDGET_EXCEEDED,
  EvidenceLease,
  composeSupervisedHost,
  createSupervisedHost,
  inspectSupervisedHostCaptureFailedForTest,
} from './host';
import { bodiesUnobserved } from '../../testbed/checkers/bodiesUnobserved';
import { FINISH_PRECONDITION_MESSAGE, type QuiesceDeadline } from './evidenceLease';
const CANARY = 'TVC_deferred_evidence_6A31';
const ORIGIN = 'https://example.test';
describe('deferred supervisor evidence', () => {
  it('adds the controlled settle budget to the shared quiesce deadline', async () => {
    vi.useFakeTimers(); const setup = fixedComposedHost();
    let release!: () => void;
    setup.lease.trackDeferred(new Promise<void>((resolve) => { release = resolve; }));
    const quiesce = setup.host.quiesceEvidenceProducers!({ settleTimeoutMs: 3_000,
      beforeClose: () => new Promise((resolve) => setTimeout(resolve, 3_000)) });
    void quiesce.catch(() => undefined);
    try {
      await vi.advanceTimersByTimeAsync(5_500);
      expect(setup.lease.hasCaptureFailed()).toBe(false);
      release(); await quiesce;
      setup.host.drainEvidence(); expect(setup.host.finish().verdict).toBe('pass');
    } finally { release(); await quiesce.catch(() => undefined); vi.useRealTimers(); }
  });
  it('operation expiry after a completed close treats unknown-session as settled without abort', async () => {
    vi.useFakeTimers();
    const setup = fixedComposedHost(); let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(setup.sessions, 'runControl').mockImplementation(async () => { await held; return { url: ORIGIN, nodes: [] }; });
    vi.spyOn(setup.sessions, 'stopLoading').mockRejectedValue(new SessionHostError('unknown-session'));
    setup.lease.recordDeferredBody(`${ORIGIN}/pre-expiry`, 'POST', 'pre-expiry evidence', false);
    const operation = setup.host.tools.browser_snapshot({ sessionId: 'already-closed' });
    try {
      await vi.advanceTimersByTimeAsync(10_000); release();
      expect(await operation).toEqual({ ok: false, reason: 'session-unknown' });
      expect(setup.host.drainEvidence()).toContainEqual(expect.objectContaining({ bytes: 'pre-expiry evidence' }));
      expect(setup.lease.hasCaptureFailed()).toBe(false);
    } finally { release(); await operation; setup.host.abort(); vi.useRealTimers(); }
  });
  it.each(['settle', 'settleStrict'] as const)('%s pre-close drain awaits three generations and retains later evidence for final disposal drain', async (method) => {
    const lease = new EvidenceLease(CANARY);
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let generations = 0;
    function next(): void {
      generations += 1;
      const work = generations === 4 ? held : new Promise<void>((resolve) => setTimeout(resolve, 0));
      lease.trackDeferred(work.then(() => {
        lease.recordDeferredBody(`${ORIGIN}/generation-${generations}`, 'POST', CANARY, false);
        if (generations < 4) next();
      }));
    }
    next();
    let drained = false;
    const drain = lease[method]().then(() => { drained = true; });
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(drained).toBe(true);
      expect(lease.pendingEvidence()).toBe(true);
    } finally { release(); await drain; }
    expect(generations).toBe(4);
    release();
    await lease.settleStrict(undefined, true);
    expect(lease.drainEvidence().filter((event) => event.channel === 'network-body')).toHaveLength(4);
    expect(lease.finish().verdict).toBe('pass');
  });
  it('trusted capture stall is a declared residual: expiry waits for release with no abandoned work', async () => {
    const lease = new EvidenceLease(CANARY);
    let release!: () => void;
    let expire!: () => void;
    let expired = false;
    const capture = new Promise<void>((resolve) => { release = resolve; });
    const deadline: QuiesceDeadline = {
      expired: new Promise<void>((resolve) => { expire = resolve; }),
      isExpired: () => expired,
      abort: () => lease.abort(),
    };
    lease.trackDeferred(capture);
    let settled = false;
    const draining = lease.settleStrict(deadline).then(() => 'pass', () => 'failed')
      .then((result) => { settled = true; return result; });
    expired = true; expire();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);
    expect(lease.hasCaptureFailed()).toBe(true);
    release();
    expect(await draining).toBe('failed');
    expect(() => lease.finish()).toThrow('Evidence capture failed');
  });
  it('strict deadline cancels actual trusted capture work and awaits its rejection once', async () => {
    const lease = new EvidenceLease(CANARY);
    let cancel!: () => void;
    let expire!: () => void;
    let expired = false;
    let alive = true;
    const capture = new Promise<void>((_resolve, reject) => {
      cancel = () => { alive = false; reject(new Error('cancelled actual producer')); };
    });
    const deadline: QuiesceDeadline = {
      expired: new Promise<void>((resolve) => { expire = resolve; }),
      isExpired: () => expired,
      abort: () => { lease.abort(); cancel(); },
    };
    lease.trackDeferred(capture);
    const draining = lease.settleStrict(deadline);
    const failed = expect(draining).rejects.toThrow('Evidence capture failed');
    expired = true; expire();
    await failed;
    expect(alive).toBe(false);
    let releaseAttach!: () => void; let releaseCapture!: () => void;
    lease.trackAttach(new Promise<void>((resolve) => { releaseAttach = resolve; }));
    lease.trackDeferred(new Promise<void>((resolve) => { releaseCapture = resolve; }));
    try { expect(lease.pendingEvidence()).toBe(false); }
    finally { releaseAttach(); releaseCapture(); await lease.settleStrict(); }
  });
  it('timed-out non-invalidating popup attach remains a non-gating diagnostic at finish', async () => {
    vi.useFakeTimers();
    try {
      const setup = fixedComposedHost();
      let release!: () => void;
      setup.lease.trackAttach(new Promise<void>((resolve) => { release = resolve; }), false);
      const barrier = setup.lease.settleAttach();
      await vi.advanceTimersByTimeAsync(2_000);
      await barrier;
      expect(setup.host.drainEvidence()).toContainEqual(expect.objectContaining({ initiator: 'harness-diagnostic' }));
      expect(setup.lease.pendingEvidence()).toBe(false);
      expect(setup.host.finish().verdict).toBe('pass');
      release();
      await setup.host.closeAll();
    } finally { vi.useRealTimers(); }
  });
  it('strict quiesce exempts timed-out attaches but retains gating attach/deferred generations', async () => {
    vi.useFakeTimers();
    try {
      const setup = fixedComposedHost();
      let release!: () => void;
      const attached = new Promise<void>((resolve) => { release = resolve; });
      setup.lease.trackAttach(attached, false);
      const interactive = setup.lease.settleAttach();
      await vi.advanceTimersByTimeAsync(2_000);
      await interactive;
      expect(() => setup.host.finish()).toThrow(FINISH_PRECONDITION_MESSAGE);
      // A separate still-gating attach keeps the pre-close drain live; the expired popup is diagnostic only.
      setup.lease.trackAttach(attached.then(() => undefined));
      let done = false;
      const quiesce = setup.host.quiesceEvidenceProducers!().then(() => { done = true; });
      await vi.advanceTimersByTimeAsync(100);
      expect(done).toBe(false);
      let releaseBody!: () => void;
      let releaseSecondAttach!: () => void;
      const secondAttach = new Promise<void>((resolve) => { releaseSecondAttach = resolve; });
      const body = new Promise<void>((resolve) => { releaseBody = resolve; });
      setup.lease.trackDeferred(body.then(() => {
        setup.lease.trackAttach(secondAttach.then(() => {
          setup.lease.trackDeferred(Promise.resolve().then(() => {
            setup.lease.recordDeferredBody(`${ORIGIN}/second-generation`, 'POST', CANARY, false);
          }));
        }));
      }));
      release(); releaseBody();
      await vi.advanceTimersByTimeAsync(100);
      expect(done).toBe(false);
      expect(setup.closeAll).not.toHaveBeenCalled();
      releaseSecondAttach();
      await quiesce;
      expect(setup.host.drainEvidence()).toContainEqual(expect.objectContaining({
        channel: 'network-body', route: '/second-generation', bytes: CANARY,
      }));
      expect(setup.host.finish().verdict).toBe('pass');
    } finally { vi.useRealTimers(); }
  });
  it('does not mint markers for bodyless POST or DELETE requests', async () => {
    const lease = new EvidenceLease(CANARY);
    const post = request(`${ORIGIN}/bodyless-post`, 'POST');
    const remove = request(`${ORIGIN}/bodyless-delete`, 'DELETE', { 'content-length': '0' });
    lease.recordRequestWillBeSent('page:post', cdpRequest('post', post, false));
    lease.recordRequestWillBeSent('page:delete', cdpRequest('delete', remove, false));
    lease.recordRequest(post);
    lease.recordRequest(remove);
    await lease.settle();
    const evidence = lease.drainEvidence();
    expect(evidence.filter((event) => event.channel === 'network-body')).toEqual([]);
    expect(bodiesUnobserved(withTimes(evidence))).toBe(0);
    lease.abort();
  });
  it('records an empty body as browser evidence and never as a marker', async () => {
    const lease = new EvidenceLease(CANARY);
    lease.recordRequest(request(`${ORIGIN}/empty-beacon`, 'POST', { 'content-length': '0' }, Buffer.alloc(0)));
    await lease.settle();
    const bodies = lease.drainEvidence().filter((event) => event.channel === 'network-body');
    expect(bodies).toEqual([expect.objectContaining({
      route: '/empty-beacon', initiator: 'browser', bytes: '',
    })]);
    expect(bodiesUnobserved(withTimes(bodies))).toBe(0);
    lease.abort();
  });
  it('scans a page body equal to a marker string without counting it as a marker', async () => {
    const lease = new EvidenceLease(CANARY);
    lease.recordRequest(request(
      `${ORIGIN}/marker-shaped-body`, 'POST',
      { 'content-length': String(Buffer.byteLength(BODY_UNAVAILABLE_NOT_ATTACHED)) },
      Buffer.from(BODY_UNAVAILABLE_NOT_ATTACHED),
    ));
    const evidence = lease.drainEvidence();
    expect(evidence).toContainEqual(expect.objectContaining({
      channel: 'network-body', initiator: 'browser', bytes: BODY_UNAVAILABLE_NOT_ATTACHED,
    }));
    expect(bodiesUnobserved(withTimes(evidence))).toBe(0);
    lease.abort();
  });
  it('reconciles a body arriving after the old timer point as body-only at settle', async () => {
    vi.useFakeTimers();
    try {
      const lease = new EvidenceLease(CANARY);
      const observed = request(`${ORIGIN}/late-body`, 'POST', { 'content-length': '24' });
      lease.recordRequestWillBeSent('worker:late', cdpRequest('late', observed, true));
      lease.recordRequest(observed);
      let release!: () => void;
      const late = new Promise<void>((resolve) => { release = resolve; }).then(() => {
        lease.recordDeferredBody(`${ORIGIN}/late-body`, 'POST', CANARY, false, 'worker:late');
      });
      lease.trackDeferred(late);
      const settling = lease.settle();
      await vi.advanceTimersByTimeAsync(400);
      expect(lease.drainEvidence().filter((event) => event.channel === 'network-body')).toEqual([]);
      release();
      await settling;
      const evidence = lease.drainEvidence();
      expect(evidence.filter((event) => event.channel === 'network-body')).toEqual([
        expect.objectContaining({ route: '/late-body', initiator: 'browser', bytes: CANARY }),
      ]);
      expect(bodiesUnobserved(withTimes(evidence))).toBe(0);
      lease.abort();
    } finally {
      vi.useRealTimers();
    }
  });
  it('keeps concurrent same-route bodies bound to their own request identity', async () => {
    const lease = new EvidenceLease(CANARY);
    const decoy = request(`${ORIGIN}/same-route`, 'QUERY', { 'content-length': '5' });
    const canary = request(`${ORIGIN}/same-route`, 'QUERY', { 'content-length': '24' });
    lease.recordRequest(decoy);
    lease.recordRequest(canary);
    lease.recordRequestWillBeSent('worker:decoy', cdpRequest('decoy', decoy, true));
    lease.recordRequestWillBeSent('worker:canary', cdpRequest('canary', canary, true));
    lease.recordDeferredBody(`${ORIGIN}/same-route`, 'QUERY', CANARY, false, 'worker:canary');
    await lease.settle();
    const evidence = lease.drainEvidence();
    expect(evidence.filter((event) => event.channel === 'network-body')).toEqual([
      expect.objectContaining({ initiator: 'browser', bytes: CANARY }),
      expect.objectContaining({ initiator: 'harness-marker', bytes: BODY_UNAVAILABLE_NOT_ATTACHED }),
    ]);
    expect(bodiesUnobserved(withTimes(evidence))).toBe(1);
    lease.abort();
  });
  it('cancels a provisional detach marker when the same request body arrives before settle', async () => {
    const lease = new EvidenceLease(CANARY);
    const observed = request(`${ORIGIN}/detach-then-body`, 'POST', { 'content-length': '24' });
    lease.recordRequest(observed);
    lease.recordRequestWillBeSent('worker:detach', cdpRequest('detach', observed, true));
    lease.recordUnavailableBody('worker:detach');
    lease.recordDeferredBody(`${ORIGIN}/detach-then-body`, 'POST', CANARY, false, 'worker:detach');
    await lease.settle();
    const evidence = lease.drainEvidence();
    expect(evidence.filter((event) => event.channel === 'network-body')).toEqual([
      expect.objectContaining({ initiator: 'browser', bytes: CANARY }),
    ]);
    expect(evidence.some((event) => event.bytes === BODY_UNAVAILABLE_TARGET_DETACHED)).toBe(false);
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
    emit({
      type: 'log',
      args: [
        { type: 'string', value: huge },
        { type: 'object', preview: { overflow: true, properties: preview } },
      ],
    });
    const event = lease.drainEvidence()[0]!;
    const args = (JSON.parse(event.bytes) as { args: unknown[] }).args;
    expect(Buffer.byteLength(event.bytes)).toBeLessThanOrEqual(64 * 1024);
    const stringifiedLengths = args.map((argument) => Buffer.byteLength(JSON.stringify(argument)));
    expect(Math.max(...stringifiedLengths)).toBeLessThanOrEqual(8 * 1024);
    expect(stringifiedLengths[0]).toBeGreaterThan(7 * 1024);
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
  it('records marked provisional headers and an unobserved-body marker when the target closed before allHeaders', async () => {
    // A self-closing popup's keepalive POST: Playwright rejects allHeaders() for the gone target. The page's doing,
    // not a harness fault — the run stays valid and the body is counted as unobserved (register C-B2f2).
    const lease = new EvidenceLease(CANARY);
    lease.recordRequest({
      allHeaders: async () => { throw new Error('request.allHeaders: Target page, context or browser has been closed'); },
      postDataBuffer: () => null,
      headers: () => ({ 'user-agent': 'popup' }),
      method: () => 'POST',
      url: () => `${ORIGIN}/receive`,
    });
    await lease.settle();
    expect(lease.captureFailed()).toBe(false);
    expect(lease.drainEvidence()).toEqual([
      expect.objectContaining({ channel: 'url', bytes: `${ORIGIN}/receive` }),
      expect.objectContaining({
        channel: 'header', route: '/receive',
        bytes: JSON.stringify({ 'user-agent': 'popup', 'x-tinyvault-provisional-headers': 'true' }),
      }),
      expect.objectContaining({
        channel: 'network-body', route: '/receive', initiator: 'harness-marker',
        bytes: 'x-tinyvault-body-unavailable: not-attached',
      }),
    ]);
    lease.abort();
  });
  it('still invalidates the run when allHeaders rejects for any other reason', async () => {
    const lease = new EvidenceLease(CANARY);
    lease.recordRequest({
      allHeaders: async () => { throw new Error('protocol error'); },
      postDataBuffer: () => null,
      headers: () => ({}),
      method: () => 'POST',
      url: () => `${ORIGIN}/receive`,
    });
    await lease.settle();
    expect(lease.captureFailed()).toBe(true);
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
      browser: () => browser,
      close: vi.fn(async () => { closed = true; }),
    };
    let closed = false;
    const browser = { newContext: vi.fn(async () => context), contexts: () => closed ? [] : [context] };
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
    await host.quiesceEvidenceProducers!();
    host.drainEvidence();
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
    expect(() => afterDrop.finish()).toThrow(FINISH_PRECONDITION_MESSAGE);
    afterDrop.abort();
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
    await Promise.resolve();
    expect(setup.openSession).not.toHaveBeenCalled();
    release();
    expect(await opening).toEqual({ sessionId: 'fixed-session' });
    expect(setup.openSession).toHaveBeenCalledOnce();
    setup.host.abort();
    await setup.host.closeAll();
  });
  it('consumes an open-session timeout allowance in the wrapper that awaited it', async () => {
    vi.useFakeTimers();
    try {
      const setup = fixedComposedHost();
      let release!: () => void;
      setup.lease.trackAttach(new Promise<void>((resolve) => { release = resolve; }));
      const opening = setup.host.tools.browser_open_session();
      await vi.advanceTimersByTimeAsync(2_000);
      expect(await opening).toEqual({ sessionId: 'fixed-session' });
      expect(inspectSupervisedHostCaptureFailedForTest(setup.host)).toBe(true);
      expect(await setup.host.tools.browser_navigate({
        sessionId: 'fixed-session', url: ORIGIN,
      })).toEqual({ ok: false, reason: 'session-unknown' });
      expect(setup.navigate).not.toHaveBeenCalled();
      setup.host.abort();
      release();
      await setup.host.closeAll();
    } finally {
      vi.useRealTimers();
    }
  });
  it('uses the popup branch without invalidation when trackAttach times out', async () => {
    vi.useFakeTimers();
    try {
      const setup = fixedComposedHost();
      let release!: () => void;
      setup.lease.trackAttach(new Promise<void>((resolve) => { release = resolve; }), false);
      const navigating = setup.host.tools.browser_navigate({ sessionId: 'fixed-session', url: ORIGIN });
      await vi.advanceTimersByTimeAsync(2_000);
      expect(await navigating).toEqual({ ok: true });
      expect(inspectSupervisedHostCaptureFailedForTest(setup.host)).toBe(false);
      expect(setup.host.drainEvidence()).toContainEqual(expect.objectContaining({
        channel: 'url', initiator: 'harness-diagnostic', bytes: 'x-tinyvault-popup-attach-timeout',
      }));
      setup.host.abort();
      release();
      await setup.host.closeAll();
    } finally {
      vi.useRealTimers();
    }
  });
  it('treats a missing target while attaching an already-closed page as benign', async () => {
    const fake = popupAttachFailureBrowser(
      new Error('Protocol error (Target.attachToTarget): No target with given id found'), true,
    );
    const host = await createSupervisedHost({ backend: backend(), canary: CANARY, browser: fake.browser });
    const session = await host.tools.browser_open_session();
    fake.emitPopup();
    expect(await host.tools.browser_navigate({ sessionId: session.sessionId, url: ORIGIN })).toEqual({ ok: true });
    expect(inspectSupervisedHostCaptureFailedForTest(host)).toBe(false);
    host.abort();
    await host.closeAll();
  });
  it('marks a genuine page-session protocol failure on a live target as capture failed', async () => {
    const fake = popupAttachFailureBrowser(new Error('Protocol error: genuine live failure'), false);
    const host = await createSupervisedHost({ backend: backend(), canary: CANARY, browser: fake.browser });
    const session = await host.tools.browser_open_session();
    fake.emitPopup();
    await host.settleEvidence();
    expect(inspectSupervisedHostCaptureFailedForTest(host)).toBe(true);
    expect(await host.tools.browser_navigate({ sessionId: session.sessionId, url: ORIGIN }))
      .toEqual({ ok: false, reason: 'session-unknown' });
    host.abort();
    await host.closeAll();
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
      let release!: () => void;
      const fake = fakeAttachBrowser(new Promise<void>((resolve) => { release = resolve; }));
      const host = await createSupervisedHost({ backend: backend(), canary: CANARY, browser: fake.browser });
      const session = await host.tools.browser_open_session();
      const navigating = host.tools.browser_navigate({ sessionId: session.sessionId, url: ORIGIN });
      await vi.advanceTimersByTimeAsync(1_999);
      expect(fake.goto).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(await navigating).toEqual({ ok: true });
      expect(fake.goto).toHaveBeenCalledOnce();
      expect(inspectSupervisedHostCaptureFailedForTest(host)).toBe(true);
      expect(() => host.finish()).toThrow(FINISH_PRECONDITION_MESSAGE);
      release();
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
function request(
  url: string,
  method: string,
  headers: Record<string, string> = {},
  body: Buffer | null = null,
) {
  return {
    allHeaders: async () => headers, postDataBuffer: () => body, headers: () => headers,
    method: () => method, url: () => url,
  };
}
function cdpRequest(requestId: string, observed: ReturnType<typeof request>, hasPostData: boolean) {
  return {
    requestId,
    request: { url: observed.url(), method: observed.method(), hasPostData },
  };
}
function withTimes(events: readonly { channel: string; direction: string; initiator?: string; bytes: string }[]) {
  return events.map((event, t) => ({ ...event, t })) as never;
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
    browser: () => browser,
    newCDPSession: vi.fn(async () => cdp), close: vi.fn(async () => { closed = true; }),
  };
  let closed = false;
  const browser = { newContext: vi.fn(async () => context), contexts: () => closed ? [] : [context] };
  return { browser: browser as never, goto };
}

function popupAttachFailureBrowser(error: Error, pageIsClosed: boolean) {
  const contextListeners = new Map<string, (value: unknown) => void>();
  const cdp = {
    send: vi.fn(async (method: string) => method === 'Page.getFrameTree'
      ? { frameTree: { frame: { id: 'main', loaderId: 'loader' } } }
      : {}),
    on: vi.fn(), off: vi.fn(), detach: vi.fn(async () => undefined),
  };
  const main = {
    on: vi.fn(), waitForLoadState: vi.fn(async () => undefined),
    opener: vi.fn(async () => null), isClosed: vi.fn(() => false), url: () => ORIGIN,
    goto: vi.fn(async () => undefined), close: vi.fn(async () => undefined),
  };
  const popup = {
    on: vi.fn(), opener: vi.fn(async () => main), isClosed: vi.fn(() => pageIsClosed), url: () => 'about:blank',
  };
  const context = {
    on: vi.fn((event: string, listener: (value: unknown) => void) => contextListeners.set(event, listener)),
    newPage: vi.fn(async () => { contextListeners.get('page')?.(main); return main; }),
    newCDPSession: vi.fn(async (page: unknown) => {
      if (page === popup) throw error;
      return cdp;
    }),
    browser: () => browser,
    close: vi.fn(async () => { closed = true; }),
  };
  let closed = false;
  const browser = { newContext: vi.fn(async () => context), contexts: () => closed ? [] : [context] };
  return {
    browser: browser as never,
    emitPopup: () => contextListeners.get('page')?.(popup),
  };
}

function fixedComposedHost() {
  const lease = new EvidenceLease(CANARY);
  const closeAll = vi.fn(async () => undefined);
  const navigate = vi.fn(async () => undefined);
  const page = {
    navigate,
    click: async () => undefined,
    type: async () => 'ok' as const,
    snapshot: async () => ({ url: ORIGIN, nodes: [] }),
  };
  const openSession = vi.fn(async () => ({ sessionId: 'fixed-session' }));
  const sessions = {
    stopLoading: async () => undefined,
    quiesceControls: async () => undefined,
    abortSessions: async () => undefined,
    openSession,
    closeSession: async () => true,
    runControl: async (_sessionId: string, operation: (value: typeof page) => Promise<unknown>) =>
      operation(page),
    openSessionCount: () => 0,
    closeAll,
    runExclusive: async () => { throw new Error('unused'); },
  };
  const fillService = {
    listVault: async () => ({ items: [] }),
    requestSetup: async () => ({ instruction: 'unused' }),
    fill: async () => { throw new Error('unused'); },
    disposeBackend: async () => undefined,
  };
  return {
    lease, sessions,
    closeAll,
    openSession,
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
