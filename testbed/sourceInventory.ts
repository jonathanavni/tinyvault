import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { TrustedGitSnapshot } from './evaluationProvenance';

const git = promisify(execFile);

/** Only these four read-only commands supply source authority; no bundle controls argv. */
export async function enumerateSource(root: string): Promise<TrustedGitSnapshot> {
  const options = { cwd: root, encoding: 'utf8' as const, maxBuffer: 16 * 1024 * 1024, shell: false as const };
  const [tracked, untracked, head, status] = await Promise.all([
    git('git', ['ls-files', '-z'], options),
    git('git', ['ls-files', '-z', '--others', '--exclude-standard'], options),
    git('git', ['rev-parse', 'HEAD'], options),
    git('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], options),
  ]);
  return { gitHead: head.stdout.trim(), dirty: status.stdout.length > 0,
    paths: [...tracked.stdout.split('\0'), ...untracked.stdout.split('\0')].filter(Boolean).sort() };
}

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANTHROPIC_CLIENT_CONFIG, ANTHROPIC_SDK_VERSION } from '../src/agents/anthropicClient';
import { MAX_AGENT_TURNS, MAX_TOOL_CALLS_PER_TURN, AGENT_EXECUTION_TIMEOUT_MS } from '../src/agents/loop';
import { BASELINE_SYSTEM } from '../src/agents/prompt';
import { captureSourceIdentity, createEvaluationProvenance, sha256, type SourceIdentity } from './evaluationProvenance';
import type { ValidEvaluationContext } from './evaluationValidity';
import type { AgentConfig } from './evalAgents';
import type { ScenarioRegistry } from './scenarios';

export const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));

export async function captureInvocationSource(root = SOURCE_ROOT) {
  const source = await captureSourceIdentity(root, await enumerateSource(root));
  const skillText = await readFile(resolve(root, 'SKILL.md'), 'utf8');
  if (sha256(skillText) !== source.inventory.find(file => file.path === 'SKILL.md')?.sha256) {
    throw new Error('Instruction source changed during capture');
  }
  return { source, skillText };
}

export async function assembleProvenance(input: {
  root: string; source: SourceIdentity; skillText: string; sampleSize: number;
  agents: ReadonlyMap<string, AgentConfig>; scenarios: ScenarioRegistry;
  context: ValidEvaluationContext; chromiumVersion: string; composedImageIdentity: string | null;
}) {
  const { source, skillText, scenarios, agents } = input;
  const digestFiles = (predicate: (path: string) => boolean) => {
    const files = source.inventory.filter(file => predicate(file.path));
    if (files.length === 0) throw new Error('Missing provenance source inputs');
    return sha256(JSON.stringify(files));
  };
  const loopSource = await readFile(resolve(input.root, 'src/agents/loop.ts'), 'utf8');
  const declaration = loopSource.match(/const EVALUATED_AGENT_TOOLS[^=]*= deepFreeze\((\[[\s\S]*?\])\);/u)?.[1];
  if (!declaration) throw new Error('Missing evaluated tool declarations');
  const tools: unknown[] = JSON.parse(declaration);
  if (tools.length !== 7) throw new Error('Invalid evaluated tool declarations');
  const taskTemplates = [...scenarios.values()].map(scenario => ({ id: scenario.id,
    fixtureId: scenario.fixtureId, fixtureVersion: scenario.fixtureVersion,
    recipeVersion: scenario.recipeVersion, task: scenario.publicTask('task-template'),
    successEndpoint: scenario.successEndpoint }));
  const skillSha256 = sha256(skillText);
  return createEvaluationProvenance(source, {
    runtime: { nodeVersion: process.version, platform: process.platform, arch: process.arch,
      sdkVersion: ANTHROPIC_SDK_VERSION,
      playwrightVersion: JSON.parse(await readFile(new URL('../node_modules/playwright/package.json', import.meta.url), 'utf8')).version,
      chromiumVersion: input.chromiumVersion },
    config: { ...ANTHROPIC_CLIENT_CONFIG, maxTurns: MAX_AGENT_TURNS,
      maxToolCallsPerTurn: MAX_TOOL_CALLS_PER_TURN, runTimeoutMs: AGENT_EXECUTION_TIMEOUT_MS,
      sampleSize: input.sampleSize, selectedAgentIds: [...agents.keys()], selectedScenarioIds: [...scenarios.keys()],
      ...input.context },
    inputs: { skillSha256, agentPromptSha256ById: Object.fromEntries([...agents.keys()].map(id =>
      [id, id === 'tinyvault-ref' ? skillSha256 : sha256(BASELINE_SYSTEM)])),
      toolRegistrySha256: sha256(JSON.stringify(tools)), scenarioManifestSha256: sha256(JSON.stringify(taskTemplates)),
      taskTemplateSha256: sha256(JSON.stringify(taskTemplates.map(row => ({ recipeVersion: row.recipeVersion, task: row.task })))),
      checkerSourceSha256: digestFiles(path => path.startsWith('testbed/checkers/')),
      completionOracleSha256: digestFiles(path => path === 'testbed/completion.ts'),
      fixtureImplementationSha256: digestFiles(path => path.startsWith('testbed/fixtures/')),
      composedImageIdentity: input.composedImageIdentity },
  });
}
