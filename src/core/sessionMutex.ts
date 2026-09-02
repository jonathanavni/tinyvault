import { AsyncLocalStorage } from 'node:async_hooks';

export const MUTEX_REENTRANT_MESSAGE = 'Session mutex acquisition is non-reentrant';
export const MUTEX_CLOSED_MESSAGE = 'Session is closing or closed';

type QueueEntry = { start(): void; reject(error: Error): void };
type SessionState = {
  phase: 'OPEN' | 'CLOSING';
  active: boolean;
  queue: QueueEntry[];
  closePromise?: Promise<void>;
  resolveClose?: () => void;
};

export class SessionMutex {
  readonly #states = new Map<string, SessionState>();
  readonly #closedSessions = new Set<string>();
  readonly #owners = new AsyncLocalStorage<ReadonlySet<string>>();

  activeSessionCount(): number {
    return this.#states.size;
  }

  runExclusive<T>(sessionId: string, operation: () => T | Promise<T>): Promise<T> {
    if (this.#owners.getStore()?.has(sessionId)) {
      return Promise.reject(new Error(MUTEX_REENTRANT_MESSAGE));
    }
    if (this.#closedSessions.has(sessionId)) {
      return Promise.reject(new Error(MUTEX_CLOSED_MESSAGE));
    }

    const state = this.#states.get(sessionId) ?? this.#newState(sessionId);
    if (state.phase !== 'OPEN') return Promise.reject(new Error(MUTEX_CLOSED_MESSAGE));
    const owned = new Set(this.#owners.getStore() ?? []);
    owned.add(sessionId);

    return new Promise<T>((resolve, reject) => {
      const entry: QueueEntry = {
        reject,
        start: () => {
          state.active = true;
          void this.#owners.run(owned, async () => operation())
            .then(resolve, reject)
            .finally(() => this.#release(sessionId, state));
        },
      };
      state.queue.push(entry);
      this.#dispatch(state);
    });
  }

  close(sessionId: string): Promise<void> {
    const existing = this.#states.get(sessionId);
    if (this.#closedSessions.has(sessionId)) return existing?.closePromise ?? Promise.resolve();
    this.#closedSessions.add(sessionId);

    const state = existing;
    if (state === undefined) return Promise.resolve();
    if (state.phase === 'CLOSING') return state.closePromise ?? Promise.resolve();

    state.phase = 'CLOSING';
    for (const queued of state.queue.splice(0)) queued.reject(new Error(MUTEX_CLOSED_MESSAGE));
    state.closePromise = new Promise<void>((resolve) => {
      state.resolveClose = resolve;
    });
    if (!state.active) this.#finalizeClose(sessionId, state);
    return state.closePromise;
  }

  #newState(sessionId: string): SessionState {
    const state: SessionState = { phase: 'OPEN', active: false, queue: [] };
    this.#states.set(sessionId, state);
    return state;
  }

  #dispatch(state: SessionState): void {
    if (state.active || state.phase !== 'OPEN') return;
    state.queue.shift()?.start();
  }

  #release(sessionId: string, state: SessionState): void {
    if (this.#states.get(sessionId) !== state || !state.active) return;
    state.active = false;
    if (state.phase === 'CLOSING') {
      this.#finalizeClose(sessionId, state);
      return;
    }
    this.#dispatch(state);
  }

  #finalizeClose(sessionId: string, state: SessionState): void {
    if (this.#states.get(sessionId) !== state) return;
    this.#states.delete(sessionId);
    state.resolveClose?.();
    state.resolveClose = undefined;
  }
}
