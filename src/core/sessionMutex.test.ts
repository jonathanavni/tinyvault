import { afterEach, describe, expect, it, vi } from 'vitest';

import { MUTEX_CLOSED_MESSAGE, MUTEX_REENTRANT_MESSAGE, SessionMutex } from './sessionMutex';

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('per-session non-reentrant mutex', () => {
  afterEach(() => vi.restoreAllMocks());

  it('catches mutation that overlaps the active owner or reorders multiple queued operations', async () => {
    const mutex = new SessionMutex();
    const gate = deferred();
    const order: string[] = [];
    const first = mutex.runExclusive('session', async () => {
      order.push('first:start');
      await gate.promise;
      order.push('first:end');
    });
    const second = mutex.runExclusive('session', () => { order.push('second'); });
    const third = mutex.runExclusive('session', () => { order.push('third'); });
    await Promise.resolve();
    expect(order).toEqual(['first:start']);
    gate.resolve();
    await Promise.all([first, second, third]);
    expect(order).toEqual(['first:start', 'first:end', 'second', 'third']);
  });

  it('catches mutation that serializes unrelated sessions together', async () => {
    const mutex = new SessionMutex();
    const gate = deferred();
    const active = mutex.runExclusive('session-a', async () => gate.promise);
    await expect(mutex.runExclusive('session-b', () => 'independent')).resolves.toBe('independent');
    gate.resolve();
    await active;
  });

  it('catches mutation that queues same-session nested acquisition instead of failing fast', async () => {
    const mutex = new SessionMutex();
    await mutex.runExclusive('session', async () => {
      await expect(mutex.runExclusive('session', () => undefined)).rejects
        .toThrow(MUTEX_REENTRANT_MESSAGE);
    });
  });

  it('catches exact queued-owner mutation that loses the acquirer context before dispatch', async () => {
    const mutex = new SessionMutex();
    const releaseB = deferred();
    const holderB = mutex.runExclusive('session-b', async () => releaseB.promise);

    const outerA = mutex.runExclusive('session-a', async () => {
      const queuedB = mutex.runExclusive('session-b', async () => {
        await expect(mutex.runExclusive('session-a', () => undefined)).rejects
          .toThrow(MUTEX_REENTRANT_MESSAGE);
      });
      releaseB.resolve();
      await queuedB;
    });

    await Promise.all([holderB, outerA]);
  });

  it('catches exact fresh-owner-set mutation that deadlocks the A to B to A path', async () => {
    const mutex = new SessionMutex();
    await mutex.runExclusive('session-a', async () => {
      await mutex.runExclusive('session-b', async () => {
        await expect(mutex.runExclusive('session-a', () => undefined)).rejects
          .toThrow(MUTEX_REENTRANT_MESSAGE);
      });
    });
  });

  it('catches exact dispatch-context mutation that over-inherits another caller owner set', async () => {
    const mutex = new SessionMutex();
    const releaseB = deferred();
    let inheritedHolder!: Promise<void>;

    await mutex.runExclusive('session-a', () => {
      inheritedHolder = mutex.runExclusive('session-b', async () => releaseB.promise);
    });

    const unrelated = mutex.runExclusive('session-b', async () =>
      mutex.runExclusive('session-a', () => 'unrelated-owner'));
    releaseB.resolve();
    await inheritedHolder;
    await expect(unrelated).resolves.toBe('unrelated-owner');
  });

  it('catches mutation that fails to release after rejection or throw', async () => {
    const mutex = new SessionMutex();
    await expect(mutex.runExclusive('session', async () => {
      throw new Error('operation failed');
    })).rejects.toThrow('operation failed');
    await expect(mutex.runExclusive('session', () => 'released')).resolves.toBe('released');
  });

  it('catches mutation where close cancels the holder or admits queued/new work', async () => {
    const mutex = new SessionMutex();
    const gate = deferred();
    const holder = mutex.runExclusive('session', async () => {
      await gate.promise;
      return 'holder-finished';
    });
    const queuedA = mutex.runExclusive('session', () => 'queued-a');
    const queuedB = mutex.runExclusive('session', () => 'queued-b');
    const closing = mutex.close('session');
    await expect(queuedA).rejects.toThrow(MUTEX_CLOSED_MESSAGE);
    await expect(queuedB).rejects.toThrow(MUTEX_CLOSED_MESSAGE);
    await expect(mutex.runExclusive('session', () => 'new')).rejects.toThrow(MUTEX_CLOSED_MESSAGE);

    let closeFinished = false;
    void closing.then(() => { closeFinished = true; });
    await Promise.resolve();
    expect(closeFinished).toBe(false);
    gate.resolve();
    await expect(holder).resolves.toBe('holder-finished');
    await closing;
  });

  it('catches mutation that makes repeated close or late release resurrect state', async () => {
    const mutex = new SessionMutex();
    const gate = deferred();
    const holder = mutex.runExclusive('session', async () => gate.promise);
    const closeA = mutex.close('session');
    const closeB = mutex.close('session');
    gate.resolve();
    await holder;
    await Promise.all([closeA, closeB, mutex.close('session')]);
    await expect(mutex.runExclusive('session', () => 'resurrected')).rejects
      .toThrow(MUTEX_CLOSED_MESSAGE);
  });

  it('catches exact mutation deleting the state-map removal at final close', async () => {
    const deleteCall = vi.spyOn(Map.prototype, 'delete');
    const mutex = new SessionMutex();
    const sessionId = 'state-delete-probe-7f75c4c4';
    await mutex.runExclusive(sessionId, () => undefined);
    await mutex.close(sessionId);
    expect(deleteCall).toHaveBeenCalledWith(sessionId);
  });
});
