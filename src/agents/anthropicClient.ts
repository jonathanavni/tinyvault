import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages';
import { serializeExact, type CapturedEventInput } from './transcript';
import type { ModelClient, ModelContentBlock, ModelMessage, ModelTurn, ModelTurnContext, ToolDefinition } from './loop';

export const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
export const ANTHROPIC_SDK_VERSION = '0.124.0';
export const PROVIDER_ATTEMPT_TIMEOUT_MS = 60_000;
export const MAX_OUTPUT_TOKENS = 1024;
const PROVIDER_ENDPOINT = 'https://api.anthropic.com/v1/messages';

export class AgentTransportError extends Error {
  constructor(readonly category: 'configuration' | 'request' | 'transport' | 'response' | 'deadline') {
    super(`Agent SDK ${category} failure`);
    this.name = 'AgentTransportError';
  }
}

/** Only trusted factory inputs enter here; the evaluated model controls message data. */
export class AnthropicModelClient implements ModelClient {
  readonly system: string;
  readonly runId: string;
  private readonly sdk: Anthropic;
  private activeContext?: ModelTurnContext;

  constructor(options: { apiKey: string; system: string; runId: string; fetch?: typeof globalThis.fetch }) {
    if (typeof options.apiKey !== 'string' || !options.apiKey || typeof options.system !== 'string'
      || typeof options.runId !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(options.runId)) throw new AgentTransportError('configuration');
    this.system = options.system;
    this.runId = options.runId;
    const transport = options.fetch ?? globalThis.fetch;
    this.sdk = new Anthropic({
      apiKey: options.apiKey, authToken: null, baseURL: 'https://api.anthropic.com',
      maxRetries: 0, timeout: PROVIDER_ATTEMPT_TIMEOUT_MS, logLevel: 'off',
      fetch: (url, init) => this.captureFetch(transport, url, init),
    });
  }

  async nextTurn(messages: readonly ModelMessage[], tools: readonly ToolDefinition[], context?: ModelTurnContext): Promise<ModelTurn> {
    if (!context || context.runId !== this.runId || !Number.isSafeInteger(context.turnIndex)
      || context.turnIndex < 0 || context.turnIndex >= 16 || this.activeContext) throw new AgentTransportError('configuration');
    this.activeContext = context;
    try {
      if (context.signal.aborted) throw new AgentTransportError('deadline');
      const result = await this.sdk.messages.create({
        model: ANTHROPIC_MODEL, max_tokens: MAX_OUTPUT_TOKENS, temperature: 0, system: this.system,
        messages: nativeMessages(messages), tools: tools.map(({ name, description, inputSchema }) => ({
          name, description, input_schema: inputSchema,
        })) as Tool[],
      }, { signal: context.signal });
      if (context.signal.aborted) throw new AgentTransportError('deadline');
      const validated: unknown = result;
      validateResponse(validated);
      // Keep only supported native blocks; every unknown field already exists in the raw wire record.
      return { content: validated.content.map(block => block.type === 'text'
        ? { type: 'text', text: block.text }
        : { type: 'tool_use', id: block.id, name: block.name, input: block.input }) };
    } catch (error) {
      if (error instanceof AgentTransportError) throw error;
      // SDK errors can contain provider bodies/headers. Those bodies are already in the protected sink.
      throw new AgentTransportError(context.signal.aborted ? 'deadline' : 'response');
    } finally { this.activeContext = undefined; }
  }

  private async captureFetch(transport: typeof globalThis.fetch, url: string | URL | Request, init?: RequestInit): Promise<Response> {
    const context = this.activeContext;
    if (!context || context.signal.aborted || String(url) !== PROVIDER_ENDPOINT || init?.method !== 'POST'
      || typeof init.body !== 'string') throw new AgentTransportError('request');
    const requestBody = init.body;
    // Verify the actual serialized body reaching fetch, independently of constructor labels.
    const request = JSON.parse(requestBody);
    if (request.model !== ANTHROPIC_MODEL || request.max_tokens !== MAX_OUTPUT_TOKENS || request.temperature !== 0
      || request.stream === true) throw new AgentTransportError('request');
    const identity = { documentId: context.runId, requestId: `turn:${context.turnIndex}` };
    const requestEvent: CapturedEventInput = { channel: 'model-text', direction: 'internal',
      initiator: 'sdk-request-context', ...identity, bytes: requestBody };
    await context.transcript.appendDurable('sdk-request', requestBody, [requestEvent]);
    await captureMetadata(context, { layer: 'sdk', transportDirection: 'outbound', ...identity,
      model: request.model, attempt: 1, bodyBytes: Buffer.byteLength(requestBody) });
    if (context.signal.aborted) throw new AgentTransportError('deadline');

    const controller = new AbortController();
    const signals = [context.signal, init.signal].filter((signal): signal is AbortSignal => signal != null);
    const abort = () => controller.abort();
    for (const signal of signals) { signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort(); }
    const timer = setTimeout(abort, PROVIDER_ATTEMPT_TIMEOUT_MS);
    const chunks: Uint8Array[] = [];
    let response: Response | undefined;
    let complete = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const cancelReader = () => { void reader?.cancel().catch(() => undefined); };
    controller.signal.addEventListener('abort', cancelReader, { once: true });
    try {
      response = await transport(url, { ...init, signal: controller.signal, redirect: 'manual' });
      reader = response.body?.getReader();
      if (controller.signal.aborted) { await reader?.cancel(); throw new AgentTransportError('deadline'); }
      if (reader) for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        chunks.push(chunk.value);
      }
      complete = !controller.signal.aborted;
    } catch {
      complete = false;
    } finally {
      clearTimeout(timer);
      for (const signal of signals) signal.removeEventListener('abort', abort);
      controller.signal.removeEventListener('abort', cancelReader);
      reader?.releaseLock();
    }
    const bytes = Buffer.concat(chunks);
    const body = bytes.toString('utf8');
    const utf8 = Buffer.from(body).equals(bytes);
    // Base64 retains malformed UTF-8 losslessly; such a response cannot be admitted as model output.
    await context.transcript.appendSerialized('sdk-response', utf8 ? body : bytes.toString('base64'), [{
      channel: 'model-text', direction: 'outbound', initiator: 'sdk-response', ...identity,
      bytes: utf8 ? body : bytes.toString('base64'),
    }]);
    await captureMetadata(context, { layer: 'sdk', transportDirection: 'inbound', ...identity,
      status: response?.status ?? null, providerRequestId: response?.headers.get('request-id') ?? null,
      complete, bodyBytes: bytes.length, encoding: utf8 ? 'utf8' : 'base64' });
    if (!complete || !response) throw new AgentTransportError(controller.signal.aborted ? 'deadline' : 'transport');
    if (!utf8 || !response.ok) throw new AgentTransportError('response');
    // Parsing (including metadata extraction) happens only after full received-byte append succeeds.
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { throw new AgentTransportError('response'); }
    const metadata = parsed as Record<string, unknown> | null;
    await captureMetadata(context, { layer: 'sdk', ...identity, model: metadata?.model ?? null,
      usage: metadata?.usage ?? null, stopReason: metadata?.stop_reason ?? null, attempt: 1 });
    return new Response(bytes, { status: response.status, statusText: response.statusText,
      headers: { 'content-type': 'application/json' } });
  }
}

async function captureMetadata(context: ModelTurnContext, value: unknown): Promise<void> {
  await context.transcript.append('sdk-meta', value, [{ channel: 'model-text', direction: 'outbound',
    initiator: 'sdk-metadata', documentId: context.runId, requestId: `turn:${context.turnIndex}`, bytes: serializeExact(value) }]);
}

function validateResponse(value: unknown): asserts value is { content: ModelContentBlock[] } {
  if (value === null || typeof value !== 'object') throw new AgentTransportError('response');
  const r = value as Record<string, unknown>;
  const usage = r.usage as Record<string, unknown> | null;
  if (r.model !== ANTHROPIC_MODEL || r.type !== 'message' || r.role !== 'assistant' || typeof r.id !== 'string'
    || !r.id || !Array.isArray(r.content) || r.content.length === 0 || !usage
    || !Number.isSafeInteger(usage.input_tokens) || (usage.input_tokens as number) < 0
    || !Number.isSafeInteger(usage.output_tokens) || (usage.output_tokens as number) < 0
    || (usage.output_tokens as number) > MAX_OUTPUT_TOKENS
    || (r.stop_reason !== 'end_turn' && r.stop_reason !== 'tool_use')) throw new AgentTransportError('response');
  for (const block of r.content) {
    if (!block || typeof block !== 'object'
      || (block.type !== 'text' && block.type !== 'tool_use')
      || (block.type === 'text' && typeof block.text !== 'string')
      || (block.type === 'tool_use' && (typeof block.id !== 'string' || !block.id
        || typeof block.name !== 'string' || !block.name || !Object.hasOwn(block, 'input')))) throw new AgentTransportError('response');
  }
  const hasTools = r.content.some(block => block.type === 'tool_use');
  if (hasTools !== (r.stop_reason === 'tool_use')) throw new AgentTransportError('response');
}

function nativeMessages(messages: readonly ModelMessage[]): MessageParam[] {
  const native: MessageParam[] = [];
  let pendingIds: string[] = [];
  for (const message of messages) {
    if (message.role === 'tool') {
      const result = message.content as { toolCallId?: unknown; result?: unknown } | null;
      if (!result || typeof result.toolCallId !== 'string' || result.toolCallId !== pendingIds[0]) throw new AgentTransportError('request');
      pendingIds.shift();
      const block = { type: 'tool_result' as const, tool_use_id: result.toolCallId, content: serializeExact(result.result) };
      const prior = native.at(-1);
      if (prior?.role === 'user' && Array.isArray(prior.content) && prior.content.every(b => b.type === 'tool_result')) prior.content.push(block);
      else native.push({ role: 'user', content: [block] });
    } else {
      if (pendingIds.length) throw new AgentTransportError('request');
      if (message.role === 'user') native.push({ role: 'user', content: typeof message.content === 'string' ? message.content : serializeExact(message.content) });
      else {
        const turn = message.content as ModelTurn;
        const blocks = turn.content;
        if (!Array.isArray(blocks)) throw new AgentTransportError('request');
        pendingIds = blocks.filter(b => b.type === 'tool_use').map(b => b.id);
        native.push({ role: 'assistant', content: blocks as MessageParam['content'] });
      }
    }
  }
  if (pendingIds.length || native[0]?.role !== 'user') throw new AgentTransportError('request');
  return native;
}
