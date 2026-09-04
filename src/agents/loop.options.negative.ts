import type { AgentLoopOptions } from './loop';

declare const validOptions: AgentLoopOptions;

const callerSuppliedTools: AgentLoopOptions = {
  ...validOptions,
  // @ts-expect-error The evaluated tool registry is runtime-owned and cannot be extended by callers.
  tools: [],
};

const callerSuppliedHandlers: AgentLoopOptions = {
  ...validOptions,
  // @ts-expect-error Callers provide one executor, not a name-to-handler registry.
  handlers: {},
};

void callerSuppliedTools;
void callerSuppliedHandlers;
