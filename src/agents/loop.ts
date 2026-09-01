import type { CapturedEvent } from '../../testbed/scorecard.schema';
import {
  serializeExact,
  serializeModelResponseEnvelope,
  serializeToolCallEnvelope,
  type CapturedEventInput,
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
  maxTurns?: number;
};

export type AgentLoopResult = {
  messages: ModelMessage[];
  turns: number;
  stopReason: 'complete' | 'max-turns';
  events: CapturedEvent[];
};

export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const maxTurns = options.maxTurns ?? 8;
  const messages = [...options.messages];
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
    await captureResponse(options.transcript, turn);
    messages.push({ role: 'assistant', content: turn });

    const calls = turn.toolCalls ?? [];
    if (calls.length === 0) {
      await options.transcript.append('meta', { event: 'loop-complete', turns: turnIndex + 1 });
      return finish(options.transcript, messages, turnIndex + 1, 'complete');
    }

    for (const call of calls) {
      const execution = await dispatchTool(call, options.handlers);
      await captureToolExecution(options.transcript, call, execution);
      messages.push({
        role: 'tool',
        content: { toolCallId: call.id, name: call.name, result: execution.result },
      });
    }
  }

  await options.transcript.append('meta', { event: 'loop-max-turns', turns: maxTurns });
  return finish(options.transcript, messages, maxTurns, 'max-turns');
}

async function captureResponse(transcript: TranscriptWriter, turn: ModelTurn): Promise<void> {
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
      initiator: call.name,
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
  await transcript.append('response', turn, events);
}

async function captureToolExecution(
  transcript: TranscriptWriter,
  call: ToolCall,
  execution: ToolExecution,
): Promise<void> {
  const resultEvent: CapturedEventInput = {
    channel: 'tool-result',
    direction: 'inbound',
    initiator: call.name,
    requestId: call.id,
    bytes: serializeExact(execution.result),
  };
  await transcript.append(
    'tool_exec',
    { toolCall: call, result: execution.result },
    [...(execution.events ?? []), resultEvent],
  );
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

async function finish(
  transcript: TranscriptWriter,
  messages: ModelMessage[],
  turns: number,
  stopReason: AgentLoopResult['stopReason'],
): Promise<AgentLoopResult> {
  const events = await transcript.close();
  return { messages, turns, stopReason, events };
}
