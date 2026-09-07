import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { assertValidEvaluationContext, type ValidEvaluationContext } from './evaluationValidity';
import { REAL_MODEL_ID } from './evalAgents';

export type SourceFile = { path: string; sha256: string };
export type SourceIdentity = {
  gitHead: string | null; dirty: boolean; filesSha256: string; packageLockSha256: string;
  inventory: SourceFile[];
};
/** Independently collected from trusted Git invocation, NEVER an artifact's path list.
 * S5 owns git ls-files --cached --others --exclude-standard and status/HEAD collection.
 * This S1 boundary hashes every supplied path; it cannot prove enumeration completeness. */
export type TrustedGitSnapshot = { gitHead: string; dirty: boolean; paths: readonly string[] };
export type ProvenanceDetails = {
  runtime: { nodeVersion: string; platform: string; arch: string; sdkVersion: string;
    playwrightVersion: string; chromiumVersion: string };
  config: { providerEndpoint: string; apiVersion: string; model: string; temperature: number;
    maxTurns: number; maxTokens: number; maxToolCallsPerTurn: number; requestTimeoutMs: number;
    runTimeoutMs: number; retries: number; sampleSize: number; selectedAgentIds: string[];
    selectedScenarioIds: string[] } & ValidEvaluationContext;
  inputs: { agentPromptSha256ById: Record<string, string>; skillSha256: string;
    toolRegistrySha256: string; scenarioManifestSha256: string; checkerSourceSha256: string;
    completionOracleSha256: string; fixtureImplementationSha256: string; taskTemplateSha256: string;
    composedImageIdentity: string | null };
};
export type EvaluationProvenance = ProvenanceDetails & {
  version: 'm6-v1'; source: SourceIdentity; provenanceId: string;
};
export type RunExecutionStatus = 'completed' | 'max-turns' | 'max-tokens' | 'model-refusal'
  | 'setup-blocked' | 'api-failed' | 'tool-rejected' | 'deadline' | 'capture-failed';
export type RunExecutionMetadata = {
  status: RunExecutionStatus; model: string; sdkVersion: string;
  usage: { inputTokens: number; outputTokens: number };
  stopReason: string | null; attemptCount: number; taskFactsSha256: string;
};
export type ExpectedRunIdentity = { scenario: string; agent: string; runIndex: number; runId: string };
export type ProvenanceBoundRun = ExpectedRunIdentity & {
  provenanceId: string; model: string; sdkVersion: string; execution: RunExecutionMetadata;
};
const DIGEST = /^[a-f0-9]{64}$/u;
const TOKEN = /^[A-Za-z0-9_-]+$/u;
const STATUSES: readonly RunExecutionStatus[] = ['completed', 'max-turns', 'max-tokens', 'model-refusal',
  'setup-blocked', 'api-failed', 'tool-rejected', 'deadline', 'capture-failed'];
export class ProvenanceValidationError extends Error {
  constructor() { super('Invalid M6 provenance or run binding'); this.name = 'ProvenanceValidationError'; }
}
function invalid(): never { throw new ProvenanceValidationError(); }
export function sha256(bytes: string | Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
/** Rejects lossy JSON/accessors so the digest describes the validated values exactly. */
function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (Reflect.ownKeys(value).length !== value.length + 1) invalid();
    return `[${Array.from({ length: value.length }, (_, i) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) invalid();
      return canonical(descriptor.value);
    }).join(',')}]`;
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const keys = Reflect.ownKeys(value);
    if (keys.some(key => typeof key !== 'string')) invalid();
    return `{${(keys as string[]).sort().map(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!Object.hasOwn(descriptor, 'value')) invalid();
      return `${JSON.stringify(key)}:${canonical(descriptor.value)}`;
    }).join(',')}}`;
  }
  return invalid();
}
function exact(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) invalid();
}
function nonempty(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function natural(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function pathValid(path: string): boolean {
  return nonempty(path) && !isAbsolute(path) && !path.includes('\\') && !path.includes('\0')
    && path.split('/').every(part => part !== '' && part !== '.' && part !== '..' && part !== '.git');
}
async function hashFiles(root: string, paths: readonly string[]): Promise<SourceFile[]> {
  if (paths.length === 0 || new Set(paths).size !== paths.length || paths.some(path => !pathValid(path))) invalid();
  const realRoot = await realpath(root);
  const inventory: SourceFile[] = [];
  for (const path of [...paths].sort()) {
    // Reject every symlink component; hashing a link target can escape the enumerated source tree.
    let target = realRoot;
    for (const part of path.split('/')) {
      target = resolve(target, part);
      if ((await lstat(target)).isSymbolicLink()) throw new Error('Source input must be a regular file without symlinks');
    }
    const stat = await lstat(target);
    const fromRoot = relative(realRoot, await realpath(target));
    if (!stat.isFile() || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
      throw new Error('Source input must be a regular file within the source tree');
    }
    inventory.push({ path, sha256: sha256(await readFile(target)) });
  }
  return inventory;
}
function sourceIdentity(gitHead: string | null, dirty: boolean, inventory: SourceFile[]): SourceIdentity {
  const lock = inventory.find(file => file.path === 'package-lock.json');
  if (!lock) invalid();
  return { gitHead, dirty, filesSha256: sha256(canonical(inventory)), packageLockSha256: lock.sha256, inventory };
}
export async function captureSourceIdentity(root: string, snapshot: TrustedGitSnapshot): Promise<SourceIdentity> {
  canonical(snapshot);
  exact(snapshot, ['gitHead', 'dirty', 'paths']);
  if (typeof snapshot.gitHead !== 'string' || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(snapshot.gitHead)
    || typeof snapshot.dirty !== 'boolean' || !Array.isArray(snapshot.paths)) invalid();
  return sourceIdentity(snapshot.gitHead, snapshot.dirty, await hashFiles(root, snapshot.paths));
}
/** Archive admission requires an independently verified full inventory; it never invents Git identity.
 * With gitHead:null, dirty:false is a not-applicable sentinel, not a Git cleanliness claim. */
export async function captureVerifiedSourceArchive(root: string, expectedInventory: readonly SourceFile[]): Promise<SourceIdentity> {
  canonical(expectedInventory);
  const actual = await hashFiles(root, expectedInventory.map(file => file.path));
  if (canonical(actual) !== canonical(expectedInventory)) invalid();
  return sourceIdentity(null, false, actual);
}
export async function assertSourceUnchanged(root: string, before: SourceIdentity, freshSnapshot: TrustedGitSnapshot): Promise<void> {
  const after = await captureSourceIdentity(root, freshSnapshot);
  if (canonical(before) !== canonical(after)) throw new Error('Source changed during evaluation');
}
function validateSource(source: SourceIdentity): void {
  exact(source, ['gitHead', 'dirty', 'filesSha256', 'packageLockSha256', 'inventory']);
  if ((source.gitHead !== null && (typeof source.gitHead !== 'string' || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(source.gitHead)))
    || typeof source.dirty !== 'boolean' || !Array.isArray(source.inventory) || !source.inventory.length) invalid();
  let previous = '';
  for (const file of source.inventory) {
    exact(file, ['path', 'sha256']);
    if (!pathValid(file.path) || file.path <= previous || !DIGEST.test(file.sha256)) invalid();
    previous = file.path;
  }
  const rebuilt = sourceIdentity(source.gitHead, source.dirty, source.inventory);
  if (canonical(rebuilt) !== canonical(source)) invalid();
}
function validateDetails(details: ProvenanceDetails): void {
  exact(details, ['runtime', 'config', 'inputs']);
  const { runtime, config, inputs } = details;
  exact(runtime, ['nodeVersion', 'platform', 'arch', 'sdkVersion', 'playwrightVersion', 'chromiumVersion']);
  if (!Object.values(runtime).every(nonempty)) invalid();
  exact(config, ['providerEndpoint', 'apiVersion', 'model', 'temperature', 'maxTurns', 'maxTokens',
    'maxToolCallsPerTurn', 'requestTimeoutMs', 'runTimeoutMs', 'retries', 'sampleSize', 'selectedAgentIds',
    'selectedScenarioIds', 'architecture', 'dockerDaemonIsolation']);
  if (!((config.architecture === 'in-process' && config.dockerDaemonIsolation === 'not-applicable')
    || (config.architecture === 'composed' && config.dockerDaemonIsolation === 'assumed'))) invalid();
  assertValidEvaluationContext({ architecture: config.architecture, dockerDaemonIsolation: config.dockerDaemonIsolation });
  if (config.providerEndpoint !== 'https://api.anthropic.com/v1/messages' || config.apiVersion !== '2023-06-01'
    || config.model !== REAL_MODEL_ID || config.temperature !== 0 || config.maxTurns !== 16
    || config.maxTokens !== 1024 || config.maxToolCallsPerTurn !== 8 || config.requestTimeoutMs !== 60000
    || config.runTimeoutMs !== 300000 || config.retries !== 0 || !natural(config.sampleSize) || config.sampleSize < 1) invalid();
  for (const ids of [config.selectedAgentIds, config.selectedScenarioIds]) {
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !TOKEN.test(id))) invalid();
  }
  if (config.selectedAgentIds.some(id => id !== 'tinyvault-ref' && id !== 'naive-baseline')) invalid();
  exact(inputs, ['agentPromptSha256ById', 'skillSha256', 'toolRegistrySha256', 'scenarioManifestSha256',
    'checkerSourceSha256', 'completionOracleSha256', 'fixtureImplementationSha256', 'taskTemplateSha256', 'composedImageIdentity']);
  exact(inputs.agentPromptSha256ById, config.selectedAgentIds);
  if (!Object.values(inputs.agentPromptSha256ById).every(hash => DIGEST.test(hash))
    || Object.entries(inputs).some(([key, hash]) => key !== 'agentPromptSha256ById'
      && key !== 'composedImageIdentity' && (typeof hash !== 'string' || !DIGEST.test(hash)))
    || (config.architecture === 'composed' ? !nonempty(inputs.composedImageIdentity) : inputs.composedImageIdentity !== null)) invalid();
}
export function createEvaluationProvenance(source: SourceIdentity, details: ProvenanceDetails): EvaluationProvenance {
  canonical({ source, ...details }); validateSource(source); validateDetails(details);
  const body = { version: 'm6-v1' as const, source, ...details };
  return JSON.parse(canonical({ ...body, provenanceId: sha256(canonical(body)) })) as EvaluationProvenance;
}
export function assertEvaluationProvenance(value: unknown): asserts value is EvaluationProvenance {
  canonical(value);
  exact(value, ['version', 'source', 'runtime', 'config', 'inputs', 'provenanceId']);
  const p = value as EvaluationProvenance;
  if (p.version !== 'm6-v1') invalid();
  const expected = createEvaluationProvenance(p.source, { runtime: p.runtime, config: p.config, inputs: p.inputs });
  if (canonical(value) !== canonical(expected)) invalid();
}
export function assertRunExecutionMetadata(value: unknown): asserts value is RunExecutionMetadata {
  canonical(value); exact(value, ['status', 'model', 'sdkVersion', 'usage', 'stopReason', 'attemptCount', 'taskFactsSha256']);
  const execution = value as RunExecutionMetadata;
  exact(execution.usage, ['inputTokens', 'outputTokens']);
  if (!STATUSES.includes(execution.status) || !nonempty(execution.model) || !nonempty(execution.sdkVersion)
    || !natural(execution.usage.inputTokens) || !natural(execution.usage.outputTokens)
    || !natural(execution.attemptCount) || (execution.stopReason !== null && !nonempty(execution.stopReason))
    || !DIGEST.test(execution.taskFactsSha256)) invalid();
}
/** Admission authority is the independently obtained invocation/source, never the bundle itself.
 * Call once for RunRecords and again for offline entries; S5 also binds raw transcript model/error bytes. */
export function assertProvenanceAdmission(
  candidate: unknown, trusted: EvaluationProvenance, rows: readonly unknown[], expectedRuns: readonly ExpectedRunIdentity[],
): asserts candidate is EvaluationProvenance {
  assertEvaluationProvenance(candidate); assertEvaluationProvenance(trusted);
  if (canonical(candidate) !== canonical(trusted) || rows.length !== expectedRuns.length || !rows.length) invalid();
  const requiredRuns = trusted.config.sampleSize * trusted.config.selectedAgentIds.length * trusted.config.selectedScenarioIds.length;
  if (expectedRuns.length !== requiredRuns) invalid();
  const expected = new Map<string, ExpectedRunIdentity>(); const runIds = new Set<string>();
  for (const run of expectedRuns) {
    const key = JSON.stringify([run.scenario, run.agent, run.runIndex]);
    if (expected.has(key) || (typeof run.runId !== 'string' || !TOKEN.test(run.runId)) || runIds.has(run.runId)
      || !natural(run.runIndex) || run.runIndex >= trusted.config.sampleSize
      || !trusted.config.selectedAgentIds.includes(run.agent) || !trusted.config.selectedScenarioIds.includes(run.scenario)) invalid();
    expected.set(key, run); runIds.add(run.runId);
  }
  const seen = new Set<string>();
  for (const row of rows) {
    canonical(row);
    if (!row || typeof row !== 'object') invalid();
    const run = row as ProvenanceBoundRun;
    if (typeof run.scenario !== 'string' || !TOKEN.test(run.scenario)
      || typeof run.agent !== 'string' || !TOKEN.test(run.agent) || !natural(run.runIndex)
      || typeof run.runId !== 'string' || !TOKEN.test(run.runId)) invalid();
    const key = JSON.stringify([run.scenario, run.agent, run.runIndex]);
    const expectedRun = expected.get(key);
    if (expectedRun === undefined) invalid();
    if (seen.has(key) || expectedRun.runId !== run.runId
      || run.provenanceId !== trusted.provenanceId || run.model !== trusted.config.model
      || run.sdkVersion !== trusted.runtime.sdkVersion) invalid();
    assertRunExecutionMetadata(run.execution);
    if (run.execution.model !== run.model || run.execution.sdkVersion !== run.sdkVersion) invalid();
    seen.add(key);
  }
}

/** Same-run metadata agreement is semantic; object key order is not execution identity. */
export function assertRunExecutionAgreement(left: unknown, right: unknown): void {
  assertRunExecutionMetadata(left); assertRunExecutionMetadata(right);
  if (canonical(left) !== canonical(right)) invalid();
}
