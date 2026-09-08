import { AgentTransportError } from '../src/agents/anthropicClient';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createReferenceProfile } from '../src/agents/reference';
import { createNaiveBaselineProfile } from '../src/agents/naiveBaseline';
import { projectTask, type AgentProfile, type runAgentProfile } from '../src/agents/prompt';
import { TranscriptWriter, type CapturedEventInput, type TranscriptRecord } from '../src/agents/transcript';
import type { createLocalFileBackend } from '../src/backends/localFile';
import type { SupervisedHost, createSupervisedHost } from '../src/supervisor/host';
import type { CapturedEvent } from './scorecard.schema';
import type { Browser } from '../src/browser/playwright';
import type { Scenario } from './scenarios/types';
import type { AgentConfig } from './evalAgents';
import { sha256, type RunExecutionMetadata } from './evaluationProvenance';
import { assertHostFinished, runHostAdapter } from './runnerExecution';
import { observeInitialSnapshot } from './scenarioCoverage';

export type CreateModelClient = Parameters<typeof runAgentProfile>[1]['createClient'];
export type RealRunOptions = {
  runId: string; canary: string; vaultPath: string; keyPath: string;
  transcriptPath: string; eventsPath: string; scenario: Scenario; agent: AgentConfig;
  browser: Browser; skillText: string; createModelClient: CreateModelClient;
  createHost: typeof createSupervisedHost; createBackend: typeof createLocalFileBackend;
};

/** Trusted composition: discovery, availability, setup mapping and filling share the host backend. */
export async function executeRealAgentRun(input: RealRunOptions) {
  const transcript = await TranscriptWriter.create(input.transcriptPath, input.eventsPath);
  const backend = input.createBackend({ vaultPath: input.vaultPath, keyPath: input.keyPath });
  const task = projectTask(input.scenario.publicTask(input.runId), input.runId);
  let host: SupervisedHost | undefined;
  let status: RunExecutionMetadata['status'] = 'capture-failed';
  let intact = false;
  let diagnostic: unknown = null;
  try {
    host = await input.createHost({ backend, canary: input.canary, browser: input.browser });
    const profile = input.agent.id === 'tinyvault-ref' ? await createReferenceProfile({
      runId: input.runId, task, skillText: input.skillText,
      vault: {
        list_vault: async () => {
          await transcript.append('meta', { event: 'vault-discovery', runId: input.runId });
          return host!.tools.list_vault();
        },
        request_vault_setup: request => host!.tools.request_vault_setup(request),
      },
      probeAvailability: () => backend.probeAvailability(),
      setupReasonFor: result => host!.setupReasonFor(result),
    }) : createNaiveBaselineProfile({ runId: input.runId, task, password: input.canary });
    if (profile.status === 'setup-blocked') {
      status = 'setup-blocked'; diagnostic = profile;
      if (!host.quiesceEvidenceProducers) throw new Error('Missing real host quiescence');
      await host.quiesceEvidenceProducers();
      host.drainEvidence();
      assertHostFinished(host.finish(), input.runId);
    } else {
      const result = await runPreparedProfile(profile, input, transcript, host);
      assertHostFinished(host.finish(), input.runId);
      status = result.stopReason === 'max-turns' ? 'max-turns' : 'completed';
      intact = true;
    }
  } catch (error) {
    if (error instanceof AgentTransportError) status = error.category === 'deadline' ? 'deadline' : 'api-failed';
    diagnostic = { event: 'real-agent-execution-failed', runId: input.runId };
    host?.abort();
  } finally {
    if (host) {
      const snapshot = host.abortedEvidence();
      if (snapshot.length > 0) await writeFile(resolve(dirname(input.eventsPath), 'events.aborted.json'),
        `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
      try { await host.closeAll(); } catch { intact = false; status = 'capture-failed'; }
    } else await backend.dispose().catch(() => undefined);
    await transcript.close().catch(error => {
      if (!(error instanceof Error) || error.message !== 'TranscriptWriter is closed') throw error;
    });
  }
  const events: CapturedEvent[] = JSON.parse(await readFile(input.eventsPath, 'utf8'));
  await writeFile(`${input.eventsPath}.initial-snapshot.json`,
    `${JSON.stringify(observeInitialSnapshot(events, input.runId))}\n`, { mode: 0o600 });
  const records: TranscriptRecord[] = (await readFile(input.transcriptPath, 'utf8')).trim().split('\n')
    .filter(Boolean).map(line => JSON.parse(line));
  if (intact && !completeTranscript(records, status)) { intact = false; status = 'capture-failed'; }
  const metadata = executionMetadata(records, input.agent, status, sha256(JSON.stringify(task)));
  if (!intact && metadata.stopReason === 'max_tokens') metadata.status = 'max-tokens';
  if (!intact && metadata.stopReason === 'refusal') metadata.status = 'model-refusal';
  if (!intact) await writeFile(resolve(dirname(input.eventsPath), 'execution-failure.json'),
    `${JSON.stringify({ status: metadata.status, acceptedOutcome: null, diagnostic })}\n`, { mode: 0o600 });
  return { intact, events, execution: metadata };
}

async function runPreparedProfile(profile: AgentProfile, input: RealRunOptions, transcript: TranscriptWriter, host: SupervisedHost) {
  // This adapter receives the real class through the invocation closure. The client is constructed once.
  const client = input.createModelClient({ system: profile.system, runId: profile.runId });
  return runHostAdapter({ client, messages: [], profile, createClient: () => client, transcript, host });
}

function executionMetadata(records: TranscriptRecord[], agent: AgentConfig,
  status: RunExecutionMetadata['status'], taskFactsSha256: string): RunExecutionMetadata {
  const metadata = records.filter(row => row.kind === 'sdk-meta').map(row => JSON.parse(row.bytes));
  const responses = metadata.filter(row => row.usage !== undefined);
  const model = responses.length ? responses[responses.length - 1].model : agent.model;
  const usage = responses.reduce((sum, row) => ({ inputTokens: sum.inputTokens + (row.usage?.input_tokens ?? 0),
    outputTokens: sum.outputTokens + (row.usage?.output_tokens ?? 0) }), { inputTokens: 0, outputTokens: 0 });
  return { status, model, sdkVersion: agent.sdkVersion, usage,
    stopReason: responses.at(-1)?.stopReason ?? null,
    attemptCount: records.filter(row => row.kind === 'sdk-request').length, taskFactsSha256 };
}

function completeTranscript(records: TranscriptRecord[], status: RunExecutionMetadata['status']): boolean {
  const meta = records.filter(row => row.kind === 'meta').map(row => JSON.parse(row.bytes));
  const requests = records.filter(row => row.kind === 'sdk-request');
  const responses = records.filter(row => row.kind === 'sdk-response');
  const inbound = records.filter(row => row.kind === 'sdk-meta').map(row => JSON.parse(row.bytes))
    .filter(row => row.transportDirection === 'inbound');
  return meta.some(row => row.event === (status === 'max-turns' ? 'loop-max-turns' : 'loop-complete'))
    && meta.some(row => row.event === 'post-loop-drain') && requests.length > 0
    && requests.length === responses.length && requests.length === inbound.length
    && inbound.every(row => row.complete === true);
}
