import type { CapturedEvent } from '../../testbed/scorecard.schema';
import {
  serializeExact,
  serializeModelResponseEnvelope,
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

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type ToolCall = {
  id: string;
  name: string;
  input: unknown;
};

export type ModelTurn = {
  text?: string;
  toolCalls?: ToolCall[];
};

/** M6 implements the real SDK client behind this seam; the loop stays unchanged. */
export interface ModelClient {
  nextTurn(messages: readonly ModelMessage[], tools: readonly ToolDefinition[]): Promise<ModelTurn>;
}

export type ToolExecution = {
  result: unknown;
  events?: CapturedEventInput[];
};

export type ToolHandler = (
  input: unknown,
  call: ToolCall,
) => Promise<ToolExecution> | ToolExecution;

export type AgentLoopOptions = {
  client: ModelClient;
  messages: ModelMessage[];
  tools: ToolDefinition[];
  handlers: Record<string, ToolHandler>;
  transcript: TranscriptWriter;
  secretSources?: readonly EventIdentity[];
  maxTurns?: number;
  afterLoop?: () => Promise<readonly CapturedEventInput[]>;
};

export type AgentLoopResult = {
  messages: ModelMessage[];
  turns: number;
  stopReason: 'complete' | 'max-turns';
  events: CapturedEvent[];
};

export const DUPLICATE_TOOL_CALL_ID_MESSAGE = 'Duplicate tool call id';

type LoopCompletion = Omit<AgentLoopResult, 'events'>;

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
  const maxTurns = options.maxTurns ?? 8;
  const messages = [...options.messages];
  const callIds = new Set<string>();
  await options.transcript.append('meta', { event: 'loop-start', maxTurns });

  for (let turnIndex = 0; turnIndex < maxTurns; turnIndex += 1) {
    const request = { messages, tools: options.tools };
    const requestBytes = serializeExact(request);
    await options.transcript.append('request', request, [{
      channel: 'model-text',
      direction: 'internal',
      initiator: 'model-context',
      bytes: requestBytes,
    }]);

    const turn = await options.client.nextTurn(messages, options.tools);
    const responseEvents = responseEventsFor(turn);
    rejectSelfDeclaredSecretSources(responseEvents, options.secretSources ?? []);
    await captureResponse(options.transcript, turn, responseEvents);
    messages.push({ role: 'assistant', content: turn });

    const calls = turn.toolCalls ?? [];
    if (calls.length === 0) {
      await options.transcript.append('meta', { event: 'loop-complete', turns: turnIndex + 1 });
      return { messages, turns: turnIndex + 1, stopReason: 'complete' };
    }

    for (const call of calls) {
      if (callIds.has(call.id)) throw new Error(DUPLICATE_TOOL_CALL_ID_MESSAGE);
      callIds.add(call.id);
      const execution = await dispatchTool(call, options.handlers);
      const resultEvent = toolResultEvent(call, execution.result);
      rejectSelfDeclaredSecretSources(
        [...(execution.events ?? []), resultEvent],
        options.secretSources ?? [],
      );
      await captureToolExecution(options.transcript, call, execution, resultEvent);
      messages.push({
        role: 'tool',
        content: { toolCallId: call.id, name: call.name, result: execution.result },
      });
    }
  }

  await options.transcript.append('meta', { event: 'loop-max-turns', turns: maxTurns });
  return { messages, turns: maxTurns, stopReason: 'max-turns' };
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

function responseEventsFor(turn: ModelTurn): CapturedEventInput[] {
  const events: CapturedEventInput[] = [];
  if (turn.text !== undefined) {
    events.push({
      channel: 'model-text', direction: 'outbound', initiator: 'model-client', bytes: turn.text,
    });
  }
  for (const call of turn.toolCalls ?? []) {
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
    bytes: serializeModelResponseEnvelope(turn),
  });
  return events;
}

async function captureResponse(
  transcript: TranscriptWriter,
  turn: ModelTurn,
  events: CapturedEventInput[],
): Promise<void> {
  await transcript.append('response', turn, events);
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
  handlers: Record<string, ToolHandler>,
): Promise<ToolExecution> {
  const handler = handlers[call.name];
  if (!handler) throw new Error(`No handler registered for tool: ${call.name}`);
  return handler(call.input, call);
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
