import type { CDPSession } from '../browser/playwright';

const AUTO_ATTACH = Object.freeze({
  autoAttach: true,
  waitForDebuggerOnStart: true,
  flatten: false,
});
const CHILD_COMMAND_TIMEOUT_MS = 3_000;

type SessionPath = readonly string[];

type RequestEvent = Readonly<{
  requestId: string;
  request: Readonly<{
    url: string;
    method: string;
    hasPostData?: boolean;
    postData?: string;
  }>;
}>;

type AttachCallbacks = Readonly<{
  observeRequest(identity: string, event: RequestEvent): void;
  recordBody(identity: string, url: string, method: string, postData: string, base64Encoded: boolean): void;
  recordUnavailable(identity: string): void;
  track(capture: Promise<void>): void;
  fail(): void;
}>;

type ProtocolEnvelope = Readonly<{
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: Readonly<{ message?: string }>;
}>;

/** Pure nested-CDP plumbing. Evidence remains owned by EvidenceLease through callbacks. */
export class WorkerAttachRouter {
  readonly #pending = new Map<string, Readonly<{
    path: SessionPath;
    timer: NodeJS.Timeout;
    resolve(value: Record<string, unknown>): void;
    reject(error: Error): void;
  }>>();
  /** A nested command is wrapped in one sendMessageToTarget command at every parent path. */
  readonly #wrappers = new Map<string, string>();
  readonly #detached = new Set<string>();
  #nextId = 1;

  constructor(
    private readonly cdp: CDPSession,
    private readonly callbacks: AttachCallbacks,
  ) {
    cdp.on('Target.attachedToTarget', (event) => this.#attached([], event));
    cdp.on('Target.detachedFromTarget', (event) => this.#detachedEvent([], event));
    cdp.on('Target.receivedMessageFromTarget', (event) => {
      this.#received([], event.sessionId, event.message);
    });
  }

  async enable(): Promise<void> {
    await this.cdp.send('Target.setAutoAttach', AUTO_ATTACH);
  }

  #received(parent: SessionPath, sessionId: string, message: string): void {
    const path = [...parent, sessionId];
    let envelope: ProtocolEnvelope;
    try {
      const parsed = JSON.parse(message) as unknown;
      if (!isRecord(parsed)) throw new Error('Invalid child CDP envelope');
      envelope = parsed as ProtocolEnvelope;
    } catch {
      this.callbacks.fail();
      return;
    }
    if (envelope.id !== undefined) {
      const responseKey = key(path, envelope.id);
      const pending = this.#pending.get(responseKey);
      if (pending === undefined) {
        const innerKey = this.#wrappers.get(responseKey);
        if (innerKey === undefined) return;
        this.#wrappers.delete(responseKey);
        if (envelope.error !== undefined) {
          this.#rejectPending(
            innerKey,
            new Error(envelope.error.message ?? 'Nested CDP wrapper command failed'),
          );
        }
        return;
      }
      this.#deletePending(responseKey);
      if (envelope.error !== undefined) {
        pending.reject(new Error(envelope.error.message ?? 'Child CDP command failed'));
      } else {
        pending.resolve(envelope.result ?? {});
      }
      return;
    }
    if (envelope.method === 'Target.receivedMessageFromTarget') {
      const child = stringField(envelope.params, 'sessionId');
      const nested = stringField(envelope.params, 'message');
      if (child === undefined || nested === undefined) this.callbacks.fail();
      else this.#received(path, child, nested);
      return;
    }
    if (envelope.method === 'Target.attachedToTarget') {
      this.#attached(path, envelope.params ?? {});
      return;
    }
    if (envelope.method === 'Target.detachedFromTarget') {
      this.#detachedEvent(path, envelope.params ?? {});
      return;
    }
    if (envelope.method === 'Network.requestWillBeSent') {
      this.#request(path, envelope.params as RequestEvent);
    }
  }

  #attached(parent: SessionPath, event: Record<string, unknown>): void {
    const sessionId = stringField(event, 'sessionId');
    if (sessionId === undefined) {
      this.callbacks.fail();
      return;
    }
    const waiting = event.waitingForDebugger === true;
    const path = [...parent, sessionId];
    const setup = (async () => {
      const results = await Promise.allSettled([
        this.#send(path, 'Network.enable'),
        this.#send(path, 'Target.setAutoAttach', AUTO_ATTACH),
      ]);
      const failures = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => result.reason as unknown);
      const detached = this.#detached.has(pathKey(path)) || failures.some(isDetachedError);
      if (!detached && failures.length > 0) this.callbacks.fail();
      if (!waiting || detached) return;
      try {
        await this.#send(path, 'Runtime.runIfWaitingForDebugger');
      } catch (error) {
        if (!this.#detached.has(pathKey(path)) && !isDetachedError(error)) this.callbacks.fail();
      }
    })();
    this.callbacks.track(setup);
  }

  #detachedEvent(parent: SessionPath, event: Record<string, unknown>): void {
    const sessionId = stringField(event, 'sessionId');
    if (sessionId === undefined) {
      this.callbacks.fail();
      return;
    }
    const detachedPath = [...parent, sessionId];
    this.#detached.add(pathKey(detachedPath));
    for (const [pendingKey, pending] of this.#pending) {
      if (!isPathPrefix(detachedPath, pending.path)) continue;
      this.#rejectPending(pendingKey, new Error('Target.detachedFromTarget'));
    }
  }

  #request(path: SessionPath, event: RequestEvent): void {
    const identity = `${pathKey(path)}:${event.requestId}`;
    this.callbacks.observeRequest(identity, event);
    if (event.request?.hasPostData !== true || event.request.postData !== undefined) return;
    const capture = this.#send(path, 'Network.getRequestPostData', { requestId: event.requestId })
      .then((result) => {
        const postData = result.postData;
        if (typeof postData !== 'string') throw new Error('Child CDP body response omitted postData');
        this.callbacks.recordBody(
          identity,
          event.request.url,
          event.request.method,
          postData,
          result.base64Encoded === true,
        );
      })
      .catch((error: unknown) => {
        if (this.#detached.has(pathKey(path)) || isDetachedError(error) || isCommandTimeout(error)) {
          this.callbacks.recordUnavailable(identity);
          return;
        }
        this.callbacks.fail();
      });
    this.callbacks.track(capture);
  }

  #send(
    path: SessionPath,
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    if (path.some((_sessionId, index) => this.#detached.has(pathKey(path.slice(0, index + 1))))) {
      return Promise.reject(new Error('Target.detachedFromTarget'));
    }
    const id = this.#nextId++;
    const message = nestedMessage(path.slice(1), { id, method, params });
    const pendingKey = key(path, id);
    const response = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#rejectPending(pendingKey, new Error(`Child CDP command timed out: ${method}`));
      }, CHILD_COMMAND_TIMEOUT_MS);
      this.#pending.set(pendingKey, { path: [...path], timer, resolve, reject });
    });
    for (let depth = 1; depth < path.length; depth += 1) {
      this.#wrappers.set(key(path.slice(0, depth), id), pendingKey);
    }
    void this.cdp.send('Target.sendMessageToTarget', {
      sessionId: path[0],
      message,
    }).catch((error: unknown) => {
      this.#rejectPending(
        pendingKey,
        error instanceof Error ? error : new Error(String(error)),
      );
    });
    return response;
  }

  #deletePending(pendingKey: string): void {
    const pending = this.#pending.get(pendingKey);
    if (pending === undefined) return;
    clearTimeout(pending.timer);
    this.#pending.delete(pendingKey);
    for (const [wrapperKey, innerKey] of this.#wrappers) {
      if (innerKey === pendingKey) this.#wrappers.delete(wrapperKey);
    }
  }

  #rejectPending(pendingKey: string, error: Error): void {
    const pending = this.#pending.get(pendingKey);
    if (pending === undefined) return;
    this.#deletePending(pendingKey);
    pending.reject(error);
  }
}

function nestedMessage(
  remainingPath: SessionPath,
  command: Readonly<{ id: number; method: string; params: Record<string, unknown> }>,
): string {
  if (remainingPath.length === 0) return JSON.stringify(command);
  return JSON.stringify({
    id: command.id,
    method: 'Target.sendMessageToTarget',
    params: {
      sessionId: remainingPath[0],
      message: nestedMessage(remainingPath.slice(1), command),
    },
  });
}

function stringField(value: Record<string, unknown> | undefined, field: string): string | undefined {
  const selected = value?.[field];
  return typeof selected === 'string' ? selected : undefined;
}

function pathKey(path: SessionPath): string {
  return JSON.stringify(path);
}

function key(path: SessionPath, id: number): string {
  return `${pathKey(path)}:${id}`;
}

export function isDetachedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('No session with given id') || message.includes('Target.detachedFromTarget');
}

function isCommandTimeout(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.startsWith('Child CDP command timed out:');
}

function isPathPrefix(prefix: SessionPath, path: SessionPath): boolean {
  return prefix.length <= path.length && prefix.every((sessionId, index) => path[index] === sessionId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
