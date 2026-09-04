import type { AgentLoopOptions } from './loop';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? (<Value>() => Value extends Right ? 1 : 2) extends
      (<Value>() => Value extends Left ? 1 : 2) ? true : false
    : false;

type ExpectedOptionKeys =
  | 'afterLoop'
  | 'client'
  | 'executeTool'
  | 'maxTurns'
  | 'messages'
  | 'secretSources'
  | 'transcript';

const PUBLIC_OPTION_KEYS_ARE_EXACT: Equal<keyof AgentLoopOptions, ExpectedOptionKeys> = true;

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
void PUBLIC_OPTION_KEYS_ARE_EXACT;
