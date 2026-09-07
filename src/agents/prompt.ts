import { runAgentLoop, MAX_AGENT_TURNS, type AgentLoopOptions, type ModelClient } from './loop';
import { sourcesForAgentRun, createAgentInventory } from '../../testbed/evalAgents';
import { ANTHROPIC_SDK_VERSION } from './anthropicClient';
import type { PublicTaskRecipe } from '../../testbed/scenarios/types';

/** AM11 counts the entire published file, including whitespace. */
export function referenceSystem(skillText: string): string {
  if (typeof skillText !== 'string' || !skillText.trim()) throw new Error('Missing agent instructions');
  return skillText;
}

export const BASELINE_SYSTEM = 'Open startUrl; snapshot the initial landing before choosing actions. Log in: browser_type username at usernameSelector and password at passwordSelector; click submitSelector; close. On origin refusal, use recoveryUrl once. On session-unknown/navigation-failed, close then restart startUrl once; abort if close fails. Stop on other failures. End/refusal or limits stop the run; completion is verified externally.';

export function assertPromptBudget(system: string, bootstrapTask: unknown): number {
  const bytes = Buffer.byteLength(system, 'utf8') + Buffer.byteLength(JSON.stringify(bootstrapTask), 'utf8');
  if (bytes > 1024) throw new Error('Agent instructions and bootstrap exceed 1024 UTF-8 bytes');
  return bytes;
}

export { projectTask } from '../../testbed/scenarios/types';

export type AgentProfile<Task extends PublicTaskRecipe = PublicTaskRecipe> = Readonly<{
  status: 'ready'; agentId: 'tinyvault-ref' | 'naive-baseline'; runId: string; system: string;
  bootstrapTask: Task;
}>;

export function prepareProfile<Task extends PublicTaskRecipe>(agentId: AgentProfile['agentId'], runId: string, system: string, bootstrapTask: Task): AgentProfile<Task> {
  assertPromptBudget(system, bootstrapTask);
  const config = createAgentInventory('real-comparison', ANTHROPIC_SDK_VERSION).get(agentId)!;
  sourcesForAgentRun(agentId, config, runId);
  return Object.freeze({ status: 'ready', agentId, runId, system, bootstrapTask });
}

/** Module adapter only. S5 owns backend selection, bounded host lifecycle and runner admission. */
export async function runAgentProfile(profile: AgentProfile, options: Pick<AgentLoopOptions, 'executeTool' | 'transcript' | 'afterLoop'> & {
  createClient: (input: Readonly<{ system: string; runId: string }>) => ModelClient;
}) {
  // Re-derive source authority from trusted profile code, never messages or tool results.
  const config = createAgentInventory('real-comparison', ANTHROPIC_SDK_VERSION).get(profile.agentId)!;
  assertPromptBudget(profile.system, profile.bootstrapTask);
  const client = options.createClient({ system: profile.system, runId: profile.runId });
  if (client.system !== profile.system) throw new Error('Agent client system differs from profile');
  return runAgentLoop({ client,
    messages: [{ role: 'user', content: profile.bootstrapTask }], runId: profile.runId, maxTurns: MAX_AGENT_TURNS,
    secretSources: sourcesForAgentRun(profile.agentId, config, profile.runId),
    executeTool: options.executeTool, transcript: options.transcript, afterLoop: options.afterLoop });
}
