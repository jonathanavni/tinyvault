import type {
  ModelClient,
  ModelMessage,
  ModelTurn,
  ToolDefinition,
} from './loop';

export type StubStep = ModelTurn | ((turnIndex: number, messages: readonly ModelMessage[]) => ModelTurn);

/** Deterministic, offline client. Its script may intentionally leak canaries. */
export class StubClient implements ModelClient {
  private turnIndex = 0;

  constructor(private readonly script: readonly StubStep[]) {}

  async nextTurn(
    messages: readonly ModelMessage[],
    _tools: readonly ToolDefinition[],
  ): Promise<ModelTurn> {
    const step = this.script[this.turnIndex] ?? { text: 'Stub script complete.' };
    const turn = typeof step === 'function' ? step(this.turnIndex, messages) : step;
    this.turnIndex += 1;
    return structuredClone(turn);
  }

  static safeLogin(input: { loginPage: string; username: string; selector: string }): StubClient {
    return new StubClient([
      toolCall('open-1', 'browser_open_session', {}),
      (_turnIndex, messages) => toolCall('navigate-1', 'browser_navigate', {
        sessionId: priorString(messages, 'sessionId'), url: input.loginPage,
      }),
      (_turnIndex, messages) => toolCall('type-1', 'browser_type', {
        sessionId: priorString(messages, 'sessionId'), selector: '#username', text: input.username,
      }),
      (_turnIndex, messages) => toolCall('fill-1', 'fill_from_vault', {
        handle: priorString(messages, 'handle'),
        sessionId: priorString(messages, 'sessionId'),
        fields: [{ role: 'password', selector: input.selector }],
      }),
      (_turnIndex, messages) => toolCall('click-1', 'browser_click', {
        sessionId: priorString(messages, 'sessionId'), selector: 'button[type=submit]',
      }),
      (_turnIndex, messages) => toolCall('close-1', 'browser_close_session', {
        sessionId: priorString(messages, 'sessionId'),
      }),
      {
        text: 'Login completed using the opaque vault handle.',
      },
    ]);
  }

  static leakingToolCall(canary: string): StubClient {
    return new StubClient([{
      toolCalls: [{
        id: 'leak-1',
        name: 'send_debug_log',
        input: { message: canary },
      }],
    }]);
  }

  static leakingText(canary: string): StubClient {
    return new StubClient([{ text: `debug credential: ${canary}` }]);
  }
}

function toolCall(id: string, name: string, input: unknown): ModelTurn {
  return { toolCalls: [{ id, name, input }] };
}

function priorString(messages: readonly ModelMessage[], field: string): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role !== 'tool') continue;
    const value = messages[index]?.content;
    if (!isRecord(value) || !isRecord(value.result)) continue;
    const direct = value.result[field];
    if (typeof direct === 'string') return direct;
    if (!Array.isArray(value.result.items)) continue;
    const item = value.result.items.find((candidate) => isRecord(candidate)
      && typeof candidate[field] === 'string');
    if (isRecord(item)) return item[field] as string;
  }
  throw new Error(`Stub script missing prior ${field} tool result`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
