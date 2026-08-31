import type {
  ModelClient,
  ModelMessage,
  ModelTurn,
  ToolDefinition,
} from './loop';

export type StubStep = ModelTurn | ((turnIndex: number) => ModelTurn);

/** Deterministic, offline client. Its script may intentionally leak canaries. */
export class StubClient implements ModelClient {
  private turnIndex = 0;

  constructor(private readonly script: readonly StubStep[]) {}

  async nextTurn(
    _messages: readonly ModelMessage[],
    _tools: readonly ToolDefinition[],
  ): Promise<ModelTurn> {
    const step = this.script[this.turnIndex] ?? { text: 'Stub script complete.' };
    const turn = typeof step === 'function' ? step(this.turnIndex) : step;
    this.turnIndex += 1;
    return structuredClone(turn);
  }

  static safeLogin(input: {
    runId: string;
    origin: string;
    selector: string;
  }): StubClient {
    return new StubClient([
      {
        toolCalls: [{
          id: 'fill-1',
          name: 'fill_from_vault',
          input: {
            handle: 'vh_benign_fixture',
            runId: input.runId,
            origin: input.origin,
            route: '/login',
            method: 'POST',
            selector: input.selector,
          },
        }],
      },
      { text: 'Login completed using the opaque vault handle.' },
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
