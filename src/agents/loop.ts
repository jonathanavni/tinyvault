import type { CapturedEvent } from '../../testbed/scorecard.schema';
import {
  serializeExact,
  serializeToolCallEnvelope,
  eventIdentityMatches,
  type CapturedEventInput,
  type EventIdentity,
  type TranscriptWriter,
} from './transcript';

export type ModelMessage = {
  role: 'user' | 'assistant' | 'tool';
  content: unknown;
};

export type ToolDefinition = Readonly<{
  name: string;
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
}>;

export type ToolCall = Readonly<{
  id: string;
  name: string;
  input: unknown;
}>;

export type ModelContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown };

export type ModelTurn = {
  /** Real provider blocks in their original order. Legacy stubs use text/toolCalls. */
  content?: ModelContentBlock[];
  text?: string;
  toolCalls?: ToolCall[];
};

export type ModelTurnContext = Readonly<{
  transcript: TranscriptWriter; runId?: string; turnIndex: number; signal: AbortSignal;
}>;

/** Trusted client configuration is independent of model-supplied messages. */
export interface ModelClient {
  readonly system?: string;
  readonly runId?: string;
  nextTurn(messages: readonly ModelMessage[], tools: readonly ToolDefinition[], context?: ModelTurnContext): Promise<ModelTurn>;
}

export type ToolExecution = {
  result: unknown;
  events?: CapturedEventInput[];
};

export type ToolExecutor = (call: ToolCall) => Promise<ToolExecution> | ToolExecution;

export type AgentLoopOptions = {
  client: ModelClient;
  messages: ModelMessage[];
  executeTool: ToolExecutor;
  transcript: TranscriptWriter;
  secretSources?: readonly EventIdentity[];
  maxTurns?: number;
  runId?: string;
  afterLoop?: () => Promise<readonly CapturedEventInput[]>;
};

export type AgentLoopResult = {
  messages: ModelMessage[];
  turns: number;
  stopReason: 'complete' | 'max-turns';
  events: CapturedEvent[];
};

export const DUPLICATE_TOOL_CALL_ID_MESSAGE = 'Duplicate tool call id';
export const SCRIPT_TRUNCATED_MARKER = 'x-tinyvault-script-truncated';

type LoopCompletion = Omit<AgentLoopResult, 'events'>;

export const MAX_AGENT_TURNS = 16;
export const MAX_TOOL_CALLS_PER_TURN = 8;
export const AGENT_EXECUTION_TIMEOUT_MS = 300_000;

const EVALUATED_AGENT_TOOLS: readonly ToolDefinition[] = deepFreeze([
  {
    "name": "browser_open_session",
    "description": "TinyVault supervised browser_open_session operation.",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": [],
      "additionalProperties": false
    }
  },
  {
    "name": "browser_navigate",
    "description": "TinyVault supervised browser_navigate operation.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sessionId": {
          "type": "string"
        },
        "url": {
          "type": "string"
        }
      },
      "required": [
        "sessionId",
        "url"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "browser_type",
    "description": "TinyVault supervised browser_type operation.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sessionId": {
          "type": "string"
        },
        "selector": {
          "type": "string"
        },
        "text": {
          "type": "string"
        }
      },
      "required": [
        "sessionId",
        "selector",
        "text"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "fill_from_vault",
    "description": "TinyVault supervised fill_from_vault operation.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "handle": {
          "type": "string"
        },
        "sessionId": {
          "type": "string"
        },
        "fields": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "role": {
                "type": "string",
                "enum": [
                  "username",
                  "password",
                  "totp"
                ]
              },
              "selector": {
                "type": "string"
              }
            },
            "required": [
              "role",
              "selector"
            ],
            "additionalProperties": false
          }
        },
        "assertedOrigin": {
          "type": "string"
        }
      },
      "required": [
        "handle",
        "sessionId",
        "fields"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "browser_click",
    "description": "TinyVault supervised browser_click operation.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sessionId": {
          "type": "string"
        },
        "selector": {
          "type": "string"
        }
      },
      "required": [
        "sessionId",
        "selector"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "browser_snapshot",
    "description": "TinyVault supervised browser_snapshot operation.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sessionId": {
          "type": "string"
        }
      },
      "required": [
        "sessionId"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "browser_close_session",
    "description": "TinyVault supervised browser_close_session operation.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sessionId": {
          "type": "string"
        }
      },
      "required": [
        "sessionId"
      ],
      "additionalProperties": false
    }
  }
]);

export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  let completion: LoopCompletion | undefined;
  let failure: unknown;
  try {
    completion = await executeLoop(options);
  } catch (error) {
    failure = error;
  }
  try {
    if (options.afterLoop !== undefined) {
      const events = await options.afterLoop();
      await options.transcript.append('meta', { event: 'post-loop-drain' }, [...events]);
    }
  } catch (error) {
    failure ??= error;
  }
  let events: CapturedEvent[] = [];
  try {
    events = await options.transcript.close();
  } catch (error) {
    failure ??= error;
  }
  if (failure !== undefined) throw failure;
  return { ...completion!, events };
}

async function executeLoop(options: AgentLoopOptions): Promise<LoopCompletion> {
  const maxTurns = options.maxTurns ?? MAX_AGENT_TURNS;
  if (!Number.isSafeInteger(maxTurns) || maxTurns < 1 || maxTurns > MAX_AGENT_TURNS) throw new Error('Invalid agent turn bound');
  const runId = options.runId ?? options.client.runId;
  if ((runId !== undefined && (typeof runId !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(runId)))
    || (options.runId !== undefined && options.client.runId !== undefined && options.runId !== options.client.runId)) {
    throw new Error('Invalid trusted agent run identity');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AGENT_EXECUTION_TIMEOUT_MS);
  const deadline = Date.now() + AGENT_EXECUTION_TIMEOUT_MS;
  const checkDeadline = () => {
    if (controller.signal.aborted || Date.now() >= deadline) throw new Error('Agent execution deadline exceeded');
  };
  try {
  const messages = [...options.messages];
  const callIds = new Set<string>();
  await options.transcript.append('meta', { event: 'loop-start', maxTurns });
  if (runId !== undefined) {
    const baseline = (options.secretSources ?? []).some(source => source.channel === 'model-text'
      && source.direction === 'internal' && source.initiator === 'baseline-bootstrap'
      && source.documentId === runId && source.requestId === 'bootstrap');
    const bootstrap = messages[0]?.content;
    if (messages[0]?.role !== 'user' || bootstrap === undefined) throw new Error('Missing trusted bootstrap task');
    await options.transcript.append('meta', { event: 'agent-bootstrap' }, [{
      channel: 'model-text', direction: 'internal', initiator: baseline ? 'baseline-bootstrap' : 'reference-bootstrap',
      documentId: runId, requestId: 'bootstrap', bytes: serializeExact(bootstrap),
    }]);
  }

  for (let turnIndex = 0; turnIndex < maxTurns; turnIndex += 1) {
    checkDeadline();
    const request = { ...(options.client.system === undefined ? {} : { system: options.client.system }), messages, tools: EVALUATED_AGENT_TOOLS };
    const requestBytes = serializeExact(request);
    await options.transcript.append('request', request, [{
      channel: 'model-text',
      direction: 'internal',
      initiator: 'model-context',
      ...(runId === undefined ? {} : { documentId: runId, requestId: `turn:${turnIndex}` }),
      bytes: requestBytes,
    }]);

    const rawTurn = await options.client.nextTurn(messages, EVALUATED_AGENT_TOOLS, {
      transcript: options.transcript, runId, turnIndex, signal: controller.signal,
    });
    // The evaluated model controls data, not JavaScript in this process. Serializing immediately
    // still removes accessors as a robustness measure and gives every later consumer one snapshot.
    const { turn, bytes: responseBytes } = snapshotModelTurn(rawTurn);
    const responseEvents = responseEventsFor(turn, responseBytes);
    rejectSelfDeclaredSecretSources(responseEvents, options.secretSources ?? []);
    await captureResponse(options.transcript, responseBytes, responseEvents);
    messages.push({ role: 'assistant', content: turn });

    checkDeadline();
    const calls = toolCallsFor(turn);
    // Validate the entire captured response before admitting its first call.
    if (calls.length > MAX_TOOL_CALLS_PER_TURN) throw new Error('Agent tool call cap exceeded');
    const responseIds = new Set<string>();
    for (const call of calls) {
      if (callIds.has(call.id) || responseIds.has(call.id)) throw new Error(DUPLICATE_TOOL_CALL_ID_MESSAGE);
      responseIds.add(call.id);
      validateToolCall(call);
    }
    if (calls.length === 0) {
      await options.transcript.append('meta', { event: 'loop-complete', turns: turnIndex + 1 });
      return { messages, turns: turnIndex + 1, stopReason: 'complete' };
    }

    for (const call of calls) {
      checkDeadline();
      callIds.add(call.id);
      const execution = await dispatchTool(call, options.executeTool);
      const resultEvent = toolResultEvent(call, execution.result);
      rejectSelfDeclaredSecretSources(
        [...(execution.events ?? []), resultEvent],
        options.secretSources ?? [],
      );
      await captureToolExecution(options.transcript, call, execution, resultEvent);
      checkDeadline();
      messages.push({
        role: 'tool',
        content: { toolCallId: call.id, name: call.name, result: execution.result },
      });
    }
  }

  await options.transcript.append('meta', { event: 'loop-max-turns', turns: maxTurns }, [{
    channel: 'url',
    direction: 'internal',
    initiator: 'harness-diagnostic',
    bytes: SCRIPT_TRUNCATED_MARKER,
  }]);
  return { messages, turns: maxTurns, stopReason: 'max-turns' };
  } finally { clearTimeout(timer); }
}

export function scriptWasTruncated(events: readonly CapturedEventInput[]): boolean {
  return events.some((event) => event.channel === 'url'
    && event.direction === 'internal'
    && event.initiator === 'harness-diagnostic'
    && event.bytes === SCRIPT_TRUNCATED_MARKER);
}

function rejectSelfDeclaredSecretSources(
  events: readonly CapturedEventInput[] | undefined,
  secretSources: readonly EventIdentity[],
): void {
  const forged = events?.find((event) =>
    secretSources.some((source) => eventIdentityMatches(event, source)));
  if (forged) {
    throw new Error('Tool event cannot declare itself as an agent secret source');
  }
}

function snapshotModelTurn(rawTurn: ModelTurn): { turn: ModelTurn; bytes: string } {
  const bytes = serializeExact(rawTurn);
  return { turn: JSON.parse(bytes) as ModelTurn, bytes };
}

function responseEventsFor(turn: ModelTurn, responseBytes: string): CapturedEventInput[] {
  const events: CapturedEventInput[] = [];
  for (const text of turn.content?.filter(block => block.type === 'text').map(block => block.text)
    ?? (turn.text === undefined ? [] : [turn.text])) {
    events.push({
      channel: 'model-text', direction: 'outbound', initiator: 'model-client', bytes: text,
    });
  }
  for (const call of toolCallsFor(turn)) {
    events.push({
      channel: 'tool-arg',
      direction: 'outbound',
      initiator: toolInitiator(call.name),
      requestId: call.id,
      bytes: serializeToolCallEnvelope(call),
      ...eventLocation(call.input),
    });
  }
  events.push({
    channel: 'model-text',
    direction: 'outbound',
    initiator: 'model-client-response',
    bytes: responseBytes,
  });
  return events;
}

async function captureResponse(
  transcript: TranscriptWriter,
  responseBytes: string,
  events: CapturedEventInput[],
): Promise<void> {
  await transcript.appendSerialized('response', responseBytes, events);
}

async function captureToolExecution(
  transcript: TranscriptWriter,
  call: ToolCall,
  execution: ToolExecution,
  resultEvent: CapturedEventInput,
): Promise<void> {
  await transcript.append(
    'tool_exec',
    { toolCall: call, result: execution.result },
    [...(execution.events ?? []), resultEvent],
  );
}

function toolResultEvent(call: ToolCall, result: unknown): CapturedEventInput {
  return {
    channel: 'tool-result',
    direction: 'inbound',
    initiator: toolInitiator(call.name),
    requestId: call.id,
    bytes: serializeExact(result),
  };
}

function toolInitiator(name: string): string {
  return `tool:${name}`;
}

async function dispatchTool(
  call: ToolCall,
  executeTool: ToolExecutor,
): Promise<ToolExecution> {
  // This allowlist assumes an uncompromised harness runtime. The model can supply only data;
  // invokeHostTool retains its own seven-case switch as defence in depth.
  // Read-once consistency comes from snapshotModelTurn, not from this dispatch helper alone.
  const name = call.name;
  if (!EVALUATED_AGENT_TOOLS.some((definition) => definition.name === name)) {
    throw new Error(`No handler registered for tool: ${name}`);
  }
  const validatedCall = Object.freeze({ id: call.id, name, input: call.input });
  return executeTool(validatedCall);
}

export function toolCallsFor(turn: ModelTurn): ToolCall[] {
  return turn.content === undefined ? turn.toolCalls ?? []
    : turn.content.filter((block): block is Extract<ModelContentBlock, { type: 'tool_use' }> => block.type === 'tool_use')
      .map(({ id, name, input }) => ({ id, name, input }));
}

function validateToolCall(call: ToolCall): void {
  const definition = EVALUATED_AGENT_TOOLS.find(tool => tool.name === call.name);
  if (!definition) throw new Error(`No handler registered for tool: ${call.name}`);
  if (typeof call.id !== 'string' || call.id.length === 0 || !matchesSchema(call.input, definition.inputSchema)) {
    throw new Error('Invalid tool call shape');
  }
}

function matchesSchema(value: unknown, schema: Readonly<Record<string, unknown>>): boolean {
  if (schema.type === 'string') return typeof value === 'string'
    && (!Array.isArray(schema.enum) || schema.enum.includes(value));
  if (schema.type === 'array') return Array.isArray(value)
    && value.every(item => matchesSchema(item, schema.items as Record<string, unknown>));
  if (schema.type !== 'object' || value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const object = value as Record<string, unknown>;
  const properties = schema.properties as Record<string, Record<string, unknown>>;
  return (schema.required as string[]).every(key => Object.hasOwn(object, key))
    && Object.keys(object).every(key => Object.hasOwn(properties, key) && matchesSchema(object[key], properties[key]));
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function eventLocation(input: unknown): Pick<CapturedEvent, 'origin' | 'route' | 'method'> {
  if (!input || typeof input !== 'object') return {};
  const value = input as Record<string, unknown>;
  return {
    ...(typeof value.origin === 'string' ? { origin: value.origin } : {}),
    ...(typeof value.route === 'string' ? { route: value.route } : {}),
    ...(typeof value.method === 'string' ? { method: value.method } : {}),
  };
}
