import { describe, expect, it, vi } from 'vitest';

import type { CredentialBackend } from '../backends/backend';
import { EvidenceLease, createSupervisedHost } from './host';

const CANARY = 'TVC_deferred_evidence_6A31';
const ORIGIN = 'https://example.test';

describe('deferred supervisor evidence', () => {
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
});

function backend(): CredentialBackend {
  return {
    probeAvailability: async () => ({ available: true }),
    listItems: async () => [],
    resolvePolicy: async () => { throw new Error('unused'); },
    resolveSecret: async () => { throw new Error('unused'); },
    dispose: async () => undefined,
  };
}
