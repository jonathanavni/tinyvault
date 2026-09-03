import { describe, expect, it, vi } from 'vitest';

import { WorkerAttachRouter } from './workerAttach';

describe('WorkerAttachRouter nested command settlement', () => {
  it('installs Network and recursive auto-attach on every nested child', async () => {
    const fake = fakeSession('child-success');
    const tracked: Promise<void>[] = [];
    const fail = vi.fn();
    new WorkerAttachRouter(fake.cdp, callbacks(tracked, fail));

    fake.emitNested('Target.attachedToTarget', { sessionId: 'inner', waitingForDebugger: false });
    await Promise.allSettled(tracked);

    expect(fake.childMethods).toEqual(expect.arrayContaining(['Network.enable', 'Target.setAutoAttach']));
    expect(fail).not.toHaveBeenCalled();
  });

  it('treats a nested detach that arrives before setup sends as benign', async () => {
    const fake = fakeSession('wrapper-success');
    const tracked: Promise<void>[] = [];
    const fail = vi.fn();
    new WorkerAttachRouter(fake.cdp, callbacks(tracked, fail));

    fake.emitNested('Target.detachedFromTarget', { sessionId: 'inner' });
    fake.emitNested('Target.attachedToTarget', { sessionId: 'inner', waitingForDebugger: true });
    await Promise.allSettled(tracked);

    expect(fail).not.toHaveBeenCalled();
  });

  it('rejects an inner command when its parent wrapper replies with an error', async () => {
    const fake = fakeSession('wrapper-error');
    const tracked: Promise<void>[] = [];
    const fail = vi.fn();
    new WorkerAttachRouter(fake.cdp, callbacks(tracked, fail));

    fake.emitNested('Target.attachedToTarget', { sessionId: 'inner', waitingForDebugger: false });
    await Promise.allSettled(tracked);

    expect(fail).toHaveBeenCalledOnce();
  });

  it('bounds an inner command whose wrapper succeeds but child never replies', async () => {
    vi.useFakeTimers();
    try {
      const fake = fakeSession('wrapper-success');
      const tracked: Promise<void>[] = [];
      const fail = vi.fn();
      new WorkerAttachRouter(fake.cdp, callbacks(tracked, fail));

      fake.emitNested('Target.attachedToTarget', { sessionId: 'inner', waitingForDebugger: false });
      let settled = false;
      const settlement = Promise.allSettled(tracked).then(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(4_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await settlement;

      expect(fail).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('settles a child body command that never replies through the unavailable marker path', async () => {
    vi.useFakeTimers();
    try {
      const fake = fakeSession('wrapper-success');
      const tracked: Promise<void>[] = [];
      const recordUnavailable = vi.fn<() => void>();
      const fail = vi.fn<() => void>();
      new WorkerAttachRouter(fake.cdp, {
        recordBody: vi.fn<() => void>(),
        recordUnavailable,
        track: (capture) => { tracked.push(capture); },
        fail,
      });

      fake.emitNested('Target.receivedMessageFromTarget', {
        sessionId: 'inner',
        message: JSON.stringify({
          method: 'Network.requestWillBeSent',
          params: {
            requestId: 'request-1',
            request: { url: 'https://example.test/never', method: 'POST', hasPostData: true },
          },
        }),
      });
      await vi.advanceTimersByTimeAsync(5_000);
      await Promise.allSettled(tracked);

      expect(recordUnavailable).toHaveBeenCalledWith('https://example.test/never', 'POST');
      expect(fail).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

function callbacks(tracked: Promise<void>[], fail: () => void) {
  return {
    recordBody: vi.fn<() => void>(),
    recordUnavailable: vi.fn<() => void>(),
    track: (capture: Promise<void>) => { tracked.push(capture); },
    fail,
  };
}

function fakeSession(mode: 'wrapper-success' | 'wrapper-error' | 'child-success') {
  const listeners = new Map<string, (event: Record<string, unknown>) => void>();
  const childMethods: string[] = [];
  const emitReceived = (sessionId: string, message: Record<string, unknown>) => {
    listeners.get('Target.receivedMessageFromTarget')?.({
      sessionId,
      message: JSON.stringify(message),
    });
  };
  const cdp = {
    on: vi.fn((event: string, listener: (value: Record<string, unknown>) => void) => {
      listeners.set(event, listener);
    }),
    send: vi.fn(async (method: string, params?: Record<string, unknown>) => {
      if (method !== 'Target.sendMessageToTarget') return {};
      const wrapper = JSON.parse(String(params?.message)) as {
        id: number;
        params?: { message?: string; sessionId?: string };
      };
      queueMicrotask(() => {
        emitReceived(String(params?.sessionId), mode === 'wrapper-error'
          ? { id: wrapper.id, error: { message: 'wrapper rejected command' } }
          : { id: wrapper.id, result: {} });
        if (mode === 'child-success' && wrapper.params?.message !== undefined) {
          const child = JSON.parse(wrapper.params.message) as { id: number; method: string };
          childMethods.push(child.method);
          emitReceived(String(params?.sessionId), {
            method: 'Target.receivedMessageFromTarget',
            params: {
              sessionId: wrapper.params.sessionId,
              message: JSON.stringify({ id: child.id, result: {} }),
            },
          });
        }
      });
      return {};
    }),
  };
  return {
    cdp: cdp as never,
    childMethods,
    emitNested(method: string, params: Record<string, unknown>) {
      emitReceived('outer', { method, params });
    },
  };
}
