import type { CDPSession } from '../browser/playwright';

const AUTO_ATTACH = Object.freeze({
  autoAttach: true,
  waitForDebuggerOnStart: true,
  flatten: false,
});

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
  recordBody(url: string, method: string, postData: string, base64Encoded: boolean): void;
  recordUnavailable(url: string, method: string): void;
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
    resolve(value: Record<string, unknown>): void;
    reject(error: Error): void;
  }>>();
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
      const pending = this.#pending.get(key(path, envelope.id));
      if (pending === undefined) return;
      this.#pending.delete(key(path, envelope.id));
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
      try {
        await this.#send(path, 'Network.enable');
        await this.#send(path, 'Target.setAutoAttach', AUTO_ATTACH);
      } catch {
        this.callbacks.fail();
      } finally {
        if (waiting) {
          try {
            await this.#send(path, 'Runtime.runIfWaitingForDebugger');
          } catch {
            this.callbacks.fail();
          }
        }
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
      this.#pending.delete(pendingKey);
      pending.reject(new Error('Target.detachedFromTarget'));
    }
  }

  #request(path: SessionPath, event: RequestEvent): void {
    if (event.request?.hasPostData !== true || event.request.postData !== undefined) return;
    const capture = this.#send(path, 'Network.getRequestPostData', { requestId: event.requestId })
      .then((result) => {
        const postData = result.postData;
        if (typeof postData !== 'string') throw new Error('Child CDP body response omitted postData');
        this.callbacks.recordBody(
          event.request.url,
          event.request.method,
          postData,
          result.base64Encoded === true,
        );
      })
      .catch((error: unknown) => {
        if (this.#detached.has(pathKey(path)) || isDetachedError(error)) {
          this.callbacks.recordUnavailable(event.request.url, event.request.method);
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
    const id = this.#nextId++;
    const message = nestedMessage(path.slice(1), { id, method, params });
    const response = new Promise<Record<string, unknown>>((resolve, reject) => {
      this.#pending.set(key(path, id), { path: [...path], resolve, reject });
    });
    void this.cdp.send('Target.sendMessageToTarget', {
      sessionId: path[0],
      message,
    }).catch((error: unknown) => {
      const pending = this.#pending.get(key(path, id));
      if (pending === undefined) return;
      this.#pending.delete(key(path, id));
      pending.reject(error instanceof Error ? error : new Error(String(error)));
    });
    return response;
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

function isDetachedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('No session with given id') || message.includes('Target.detachedFromTarget');
}

function isPathPrefix(prefix: SessionPath, path: SessionPath): boolean {
  return prefix.length <= path.length && prefix.every((sessionId, index) => path[index] === sessionId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
