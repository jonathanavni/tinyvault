import { EVALUATED_AGENT_TOOLS } from '../../agents/loop';
import { serializeExact } from '../../agents/transcript';
import { VAULT_TOOL_FAILURE_MESSAGE, BROWSER_OPEN_FAILURE_MESSAGE, type SupervisedHost } from '../../supervisor/host';
import type { ToolDefinition } from './protocol';

const list: ToolDefinition = Object.freeze({ name: 'list_vault',
  description: 'TinyVault supervised list_vault operation.',
  inputSchema: Object.freeze({ type: 'object', properties: Object.freeze({}),
    required: Object.freeze([]), additionalProperties: false }) });
const setup: ToolDefinition = Object.freeze({ name: 'request_vault_setup',
  description: 'TinyVault supervised request_vault_setup operation.',
  inputSchema: Object.freeze({ type: 'object', properties: Object.freeze({ reason: Object.freeze({
    type: 'string', enum: Object.freeze(['missing_item', 'backend_locked', 'backend_unavailable']),
  }) }), required: Object.freeze(['reason']), additionalProperties: false }) });
const registered = (name: string): ToolDefinition => EVALUATED_AGENT_TOOLS.find(tool => tool.name === name)!;
export const TOOLS: readonly ToolDefinition[] = Object.freeze([
  list, registered('fill_from_vault'), setup, registered('browser_open_session'),
  registered('browser_close_session'), registered('browser_navigate'), registered('browser_click'),
  registered('browser_type'), registered('browser_snapshot'),
]);

function invoke(host: SupervisedHost, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'list_vault': return host.tools.list_vault();
    case 'fill_from_vault': return host.tools.fill_from_vault(args as never);
    case 'request_vault_setup': return host.tools.request_vault_setup(args as never);
    case 'browser_open_session': return host.tools.browser_open_session();
    case 'browser_close_session': return host.tools.browser_close_session(args as never);
    case 'browser_navigate': return host.tools.browser_navigate(args as never);
    case 'browser_click': return host.tools.browser_click(args as never);
    case 'browser_type': return host.tools.browser_type(args as never);
    case 'browser_snapshot': return host.tools.browser_snapshot(args as never);
    default: throw new Error('tinyvault: internal error');
  }
}

export async function callTool(host: SupervisedHost, name: string, args: Record<string, unknown>,
  onInternalError: () => void): Promise<Record<string, unknown>> {
  try {
    const result = await invoke(host, name, args);
    const envelope = { content: [{ type: 'text', text: serializeExact(result) }],
      structuredContent: result, isError: false };
    try { await host.drainEvidence(); } catch { /* A dropped lease cannot change a computed result. */ }
    return envelope;
  } catch (failure) {
    const message = failure instanceof Error ? failure.message : undefined;
    const fixed = message === VAULT_TOOL_FAILURE_MESSAGE || message === BROWSER_OPEN_FAILURE_MESSAGE;
    if (!fixed) onInternalError();
    return { content: [{ type: 'text', text: fixed ? message : 'tinyvault: internal error' }], isError: true };
  }
}
