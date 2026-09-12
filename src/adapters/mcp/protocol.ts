import type { Readable, Writable } from 'node:stream';

export const MAX_LINE_BYTES = 1024 * 1024;
export const MAX_QUEUED_REQUESTS = 64;

type Id = string | number;
type JsonObject = Record<string, unknown>;
type Request = { id: Id; method: string; params: JsonObject; cancelled: boolean;
  beforeLegacyReady: boolean; connection: Connection };
export type ServeReason = 'eof' | 'framing' | 'output-error';
export type ToolDefinition = Readonly<{ name: string; description: string; inputSchema: Readonly<JsonObject> }>;

export type ProtocolOptions = {
  version: string;
  tools: readonly ToolDefinition[];
  dispatch: (name: string, args: JsonObject) => Promise<JsonObject> | JsonObject;
  matchesSchema: (args: JsonObject, schema: Readonly<JsonObject>) => boolean;
  onInternalError?: () => void;
  onOutputError?: () => void;
};

type Connection = {
  output: Writable;
  finish: (reason: ServeReason) => void;
  failed: boolean;
  closed: boolean;
  cleanup: () => void;
  writes: Promise<void>;
};

function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validId(value: unknown): value is Id {
  return typeof value === 'string' || (typeof value === 'number' && Number.isInteger(value));
}

function key(id: Id): string {
  return `${typeof id}:${id}`;
}

function validParams(params: JsonObject, allowed: readonly string[]): boolean {
  return Object.keys(params).every(name => allowed.includes(name)) &&
    (params._meta === undefined || object(params._meta));
}

function error(id: Id | null, code: number, message: string, data?: JsonObject): JsonObject {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

const MESSAGES: Record<number, string> = {
  [-32700]: 'Parse error', [-32600]: 'Invalid request', [-32601]: 'Method not found',
  [-32602]: 'Invalid params', [-32603]: 'tinyvault-mcp: internal error',
  [-32022]: 'Unsupported protocol version',
};

const VERSION_KEY = 'io.modelcontextprotocol/protocolVersion';
const CAPABILITIES_KEY = 'io.modelcontextprotocol/clientCapabilities';
const SERVER_KEY = 'io.modelcontextprotocol/serverInfo';
const MODERN_VERSION = '2026-07-28';
const LEGACY_VERSIONS = ['2025-11-25', '2025-06-18'];

/** One instance is one process-scoped protocol state; serve may attach sequential streams. */
export class Protocol {
  readonly #options: ProtocolOptions;
  readonly #queue: Request[] = [];
  readonly #outstanding = new Map<string, Request>();
  readonly #legacyUsed = new Set<string>();
  readonly #connections = new Set<Connection>();
  #legacyVersion: string | undefined;
  #legacyReady = false;
  #legacyInitialized = false;
  #outputFailed = false;
  #active: Request | undefined;
  #activePromise: Promise<void> | undefined;
  #stopped = false;
  #running = false;

  constructor(options: ProtocolOptions) { this.#options = options; }

  get legacyInitialized(): boolean { return this.#legacyInitialized; }
  get outputFailed(): boolean { return this.#outputFailed; }

  serve(input: Readable, output: Writable): Promise<ServeReason> {
    let pending: Buffer[] = [];
    let size = 0;
    let settled = false;
    let resolve!: (reason: ServeReason) => void;
    const result = new Promise<ServeReason>(done => { resolve = done; });
    const connection: Connection = {
      output, failed: false, closed: false, cleanup: () => undefined, writes: Promise.resolve(),
      finish: reason => {
        if (settled) return;
        settled = true;
        connection.closed = true;
        input.off('data', onData);
        input.off('end', onEnd);
        input.off('error', onInputError);
        if (reason !== 'eof') input.pause();
        resolve(reason);
      },
    };
    this.#connections.add(connection);
    const onOutputError = () => {
      if (connection.failed) return;
      connection.failed = true;
      this.#outputFailed = true;
      this.#options.onOutputError?.();
      this.stopAdmission();
      connection.finish('output-error');
    };
    // An in-flight response may still write after EOF. The listener stays on that stream.
    output.on('error', onOutputError);
    connection.cleanup = () => output.off('error', onOutputError);
    const onInputError = () => connection.finish('framing');
    const onEnd = () => {
      if (size > 0) this.#line(Buffer.concat(pending, size), connection);
      connection.finish('eof');
    };
    const onData = (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      let start = 0;
      while (start < bytes.length) {
        const newline = bytes.indexOf(10, start);
        const end = newline < 0 ? bytes.length : newline;
        const part = bytes.subarray(start, end);
        if (size + part.length > MAX_LINE_BYTES) {
          connection.finish('framing');
          return;
        }
        pending.push(part);
        size += part.length;
        if (newline < 0) return;
        this.#line(Buffer.concat(pending, size), connection);
        if (settled) return;
        pending = [];
        size = 0;
        start = newline + 1;
      }
    };
    input.on('data', onData);
    input.once('end', onEnd);
    input.once('error', onInputError);
    return result;
  }

  stopAdmission(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    for (const request of this.#queue.splice(0)) {
      this.#outstanding.delete(key(request.id));
      if (!request.cancelled) this.#send(request.connection, error(request.id, -32600, MESSAGES[-32600]));
    }
  }

  cancelHandler(): void {
    if (this.#active) this.#active.cancelled = true;
    this.#activePromise?.catch(() => undefined);
  }

  async drainHandler(deadlineMs: number): Promise<boolean> {
    if (!this.#activePromise) return true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.#activePromise.then(() => true),
        new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), deadlineMs); }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
  }

  async idle(): Promise<void> {
    while (this.#activePromise || this.#queue.length) {
      await this.#activePromise;
    }
    await this.flush();
  }

  async flush(): Promise<void> {
    await Promise.all([...this.#connections].map(connection => connection.writes));
    for (const connection of this.#connections) {
      if (connection.closed && ![...this.#outstanding.values()].some(item => item.connection === connection)) {
        connection.cleanup();
        this.#connections.delete(connection);
      }
    }
  }

  #line(bytes: Buffer, connection: Connection): void {
    let value: unknown;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch (cause) {
      if (cause instanceof TypeError) { connection.finish('framing'); return; }
      this.#send(connection, error(null, -32700, MESSAGES[-32700]));
      return;
    }
    if (!object(value)) {
      this.#send(connection, error(null, Array.isArray(value) ? -32600 : -32700,
        MESSAGES[Array.isArray(value) ? -32600 : -32700]));
      return;
    }
    if (typeof value.method !== 'string') {
      if ('result' in value || 'error' in value) return;
      this.#send(connection, error(validId(value.id) ? value.id : null, -32600, MESSAGES[-32600]));
      return;
    }
    const notification = value.method.startsWith('notifications/');
    if (notification) {
      if ('id' in value) return; // M8-C1: invalid notification, no response or action.
      if (value.jsonrpc !== '2.0') return;
      this.#notification(value);
      return;
    }
    const id = validId(value.id) ? value.id : null;
    if (value.jsonrpc !== '2.0' || id === null) {
      this.#send(connection, error(id, -32600, MESSAGES[-32600]));
      return;
    }
    if (this.#outstanding.has(key(id)) || this.#outstanding.size >= MAX_QUEUED_REQUESTS || this.#stopped) {
      this.#send(connection, error(id, -32600, MESSAGES[-32600]));
      return;
    }
    const params = value.params === undefined ? {} : value.params;
    const meta = object(params) && object(params._meta) ? params._meta : undefined;
    if (this.#legacyVersion && !(meta && VERSION_KEY in meta)) {
      if (this.#legacyUsed.has(key(id))) {
        this.#send(connection, error(id, -32600, MESSAGES[-32600]));
        return;
      }
      this.#legacyUsed.add(key(id));
    }
    const request: Request = { id, method: value.method, params: object(params) ? params : { __invalid: true },
      cancelled: false, beforeLegacyReady: !this.#legacyReady, connection };
    this.#outstanding.set(key(id), request);
    this.#queue.push(request);
    this.#run();
  }

  #notification(value: JsonObject): void {
    if (value.method === 'notifications/initialized' && this.#legacyReady) {
      if (value.params !== undefined && (!object(value.params) || !validParams(value.params, ['_meta']))) return;
      this.#legacyInitialized = true;
      return;
    }
    if (value.method !== 'notifications/cancelled') return;
    const params = value.params;
    if (!object(params) || Object.keys(params).some(name => !['_meta', 'requestId', 'reason'].includes(name)) ||
        params._meta !== undefined && !object(params._meta) ||
        params.reason !== undefined && typeof params.reason !== 'string' ||
        !validId(params.requestId)) return;
    const request = this.#outstanding.get(key(params.requestId));
    if (!request) return;
    request.cancelled = true;
    if (request !== this.#active) {
      const index = this.#queue.indexOf(request);
      if (index >= 0) this.#queue.splice(index, 1);
      this.#outstanding.delete(key(request.id));
    }
  }

  #run(): void {
    if (this.#running) return;
    this.#running = true;
    const next = async () => {
      while (this.#queue.length) {
        const request = this.#queue.shift()!;
        if (request.cancelled) continue;
        this.#active = request;
        this.#activePromise = this.#execute(request).catch(async () => {
          this.#options.onInternalError?.();
          await this.#replyError(request, -32603);
        });
        await this.#activePromise;
        this.#active = undefined;
        this.#activePromise = undefined;
        this.#outstanding.delete(key(request.id));
      }
      this.#running = false;
    };
    void next().catch(() => { this.#running = false; this.#options.onInternalError?.(); });
  }

  async #execute(request: Request): Promise<void> {
    const { id, method, params } = request;
    const meta = object(params._meta) ? params._meta : undefined;
    const modern = meta !== undefined && VERSION_KEY in meta;
    let result: JsonObject;
    if (method === 'initialize' && !modern) {
      if (this.#legacyVersion) return this.#replyError(request, -32600);
      if (!validParams(params, ['protocolVersion', 'capabilities', 'clientInfo', '_meta']) ||
          !object(params.capabilities) || !object(params.clientInfo) ||
          typeof params.protocolVersion !== 'string' ||
          typeof params.clientInfo.name !== 'string' || typeof params.clientInfo.version !== 'string') {
        return this.#replyError(request, -32602);
      }
      this.#legacyVersion = LEGACY_VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : LEGACY_VERSIONS[0];
      this.#legacyUsed.add(key(id));
      result = { protocolVersion: this.#legacyVersion, capabilities: { tools: {} },
        serverInfo: { name: 'tinyvault', version: this.#options.version } };
      await this.#reply(request, result);
      this.#legacyReady = true;
      return;
    }
    if (!modern) {
      if (method === 'ping') {
        if (!validParams(params, ['_meta'])) return this.#replyError(request, -32602);
        if (this.#legacyVersion) this.#legacyUsed.add(key(id));
        await this.#reply(request, {}); return;
      }
      if (!this.#legacyVersion) return this.#replyError(request, -32602);
      this.#legacyUsed.add(key(id));
      if (request.beforeLegacyReady) return this.#replyError(request, -32600);
    } else {
      if (typeof meta[VERSION_KEY] !== 'string' || Buffer.byteLength(meta[VERSION_KEY]) > 64 ||
          !object(meta[CAPABILITIES_KEY])) return this.#replyError(request, -32602);
      if (meta[VERSION_KEY] !== MODERN_VERSION) {
        return this.#replyError(request, -32022, { supported: [MODERN_VERSION], requested: meta[VERSION_KEY] });
      }
      if ('inputResponses' in params || 'requestState' in params) return this.#replyError(request, -32602);
    }
    if (modern ? !['server/discover', 'tools/list', 'tools/call'].includes(method) :
        !['tools/list', 'tools/call'].includes(method)) return this.#replyError(request, -32601);
    const allowed = method === 'tools/call' ? ['_meta', 'name', 'arguments'] :
      method === 'tools/list' ? ['_meta', 'cursor'] : ['_meta'];
    if (!validParams(params, allowed) ||
        method === 'tools/list' && params.cursor !== undefined && typeof params.cursor !== 'string') {
      return this.#replyError(request, -32602);
    }
    if (method === 'server/discover') {
      result = { supportedVersions: [MODERN_VERSION], capabilities: { tools: {} }, ttlMs: 0, cacheScope: 'public' };
    } else if (method === 'tools/list') {
      result = { tools: this.#options.tools, ...(modern ? { ttlMs: 0, cacheScope: 'public' } : {}) };
    } else {
      const name = params.name;
      const definition = this.#options.tools.find(tool => tool.name === name);
      const args = params.arguments === undefined ? {} : params.arguments;
      if (!definition || !object(args) || !this.#options.matchesSchema(args, definition.inputSchema)) {
        return this.#replyError(request, -32602);
      }
      try { result = await this.#options.dispatch(definition.name, args); }
      catch {
        this.#options.onInternalError?.();
        result = { content: [{ type: 'text', text: 'tinyvault: internal error' }], isError: true };
      }
    }
    await this.#reply(request, modern ? { ...result, resultType: 'complete', _meta: { [SERVER_KEY]:
      { name: 'tinyvault', version: this.#options.version } } } : result);
  }

  async #replyError(request: Request, code: number, data?: JsonObject): Promise<void> {
    await this.#reply(request, undefined, code, data);
  }

  async #reply(request: Request, result?: JsonObject, code?: number, data?: JsonObject): Promise<void> {
    if (request.cancelled) return;
    await this.#send(request.connection, code === undefined ? { jsonrpc: '2.0', id: request.id, result } :
      error(request.id, code, MESSAGES[code], data), request);
  }

  #send(connection: Connection, response: JsonObject, request?: Request): Promise<void> {
    if (connection.failed) return Promise.resolve();
    const line = `${JSON.stringify(response)}\n`;
    const write = async () => {
      if (connection.failed || request?.cancelled) return;
      await new Promise<void>((resolve, reject) => {
        let callbackDone = false;
        let drained = false;
        let wrote = false;
        const done = () => { if (wrote && callbackDone && drained) resolve(); };
        const onDrain = () => { drained = true; done(); };
        connection.output.once('drain', onDrain);
        try {
          const ready = connection.output.write(line, (failure?: Error | null) => {
            if (failure) { connection.output.off('drain', onDrain); reject(failure); return; }
            callbackDone = true; done();
          });
          wrote = true;
          if (ready) { drained = true; connection.output.off('drain', onDrain); }
          done();
        } catch (failure) { connection.output.off('drain', onDrain); reject(failure); }
      });
    };
    connection.writes = connection.writes.then(write).catch(() => {
      if (!connection.failed) {
        connection.failed = true;
        this.#outputFailed = true;
        this.#options.onOutputError?.();
        this.stopAdmission();
        connection.finish('output-error');
      }
    });
    return connection.writes;
  }
}

export function createProtocol(options: ProtocolOptions): Protocol { return new Protocol(options); }
