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
import { deriveExecutionEvidence } from './executionEvidence';
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
  let errorDetails = { name: 'Error', message: 'Incomplete real-agent execution' };
  let adapterStarted = false;
  let failureCaught = false;
  let sidecarError: ReturnType<typeof executionErrorDetails> | undefined;
  const onInitialSnapshotError = (error: unknown) => { sidecarError = executionErrorDetails(error); };
  const finish = () => {
    const verdict = host!.finish();
    if (verdict.verdict !== 'pass') diagnostic = { event: 'trusted-output-tripwire', runId: input.runId,
      verdict: { transform: verdict.diagnostics.transform, evidenceIndex: verdict.diagnostics.evidenceIndex } };
    assertHostFinished(verdict, input.runId);
  };
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
      finish();
    } else {
      const result = await runPreparedProfile(profile, input, transcript, host, () => { adapterStarted = true; }, onInitialSnapshotError);
      finish();
      status = result.stopReason === 'max-turns' ? 'max-turns' : 'completed';
      intact = true;
    }
  } catch (error) {
    failureCaught = true;
    status = error instanceof AgentTransportError ? (error.category === 'deadline' ? 'deadline' : 'api-failed') : 'capture-failed';
    errorDetails = executionErrorDetails(error);
    if ((diagnostic as { event?: string } | null)?.event !== 'trusted-output-tripwire') {
      diagnostic = { event: 'real-agent-execution-failed', runId: input.runId };
    }
    host?.abort();
  } finally {
    if (host) {
      const snapshot = host.abortedEvidence();
      if (snapshot.length > 0) await writeFile(resolve(dirname(input.eventsPath), 'events.aborted.json'),
        `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
      try { await host.closeAll(); } catch (error) {
        if (!failureCaught) {
          errorDetails = executionErrorDetails(error);
          diagnostic = { event: 'real-agent-execution-failed', runId: input.runId };
        }
        intact = false; status = 'capture-failed';
      }
    } else await backend.dispose().catch(() => undefined);
    await transcript.close().catch(error => {
      if (!(error instanceof Error) || error.message !== 'TranscriptWriter is closed') throw error;
    });
  }
  const events: CapturedEvent[] = JSON.parse(await readFile(input.eventsPath, 'utf8'));
  if (!adapterStarted) {
    try { await writeFile(`${input.eventsPath}.initial-snapshot.json`,
      `${JSON.stringify(observeInitialSnapshot(events, input.runId))}\n`, { mode: 0o600 }); }
    catch (error) { onInitialSnapshotError(error); }
  }
  if (sidecarError) await writeFile(`${input.eventsPath}.initial-snapshot-error.json`,
    `${JSON.stringify({ sidecarError })}\n`, { mode: 0o600 }).catch(() => undefined); // A secondary diagnostic write cannot replace the loop failure.
  const records: TranscriptRecord[] = (await readFile(input.transcriptPath, 'utf8')).trim().split('\n')
    .filter(Boolean).map(line => JSON.parse(line));
  if (intact && !completeTranscript(records, status)) { intact = false; status = 'capture-failed'; }
  const metadata = executionMetadata(events, input.runId, input.agent, status, sha256(JSON.stringify(task)));
  if (!intact && metadata.stopReason === 'max_tokens') metadata.status = 'max-tokens';
  if (!intact && metadata.stopReason === 'refusal') metadata.status = 'model-refusal';
  if (!intact) await writeFile(resolve(dirname(input.eventsPath), 'execution-failure.json'),
    `${JSON.stringify({ status: metadata.status, acceptedOutcome: null, diagnostic, error: errorDetails, ...(sidecarError ? { sidecarError } : {}) })}\n`, { mode: 0o600 });
  return { intact, events, execution: metadata };
}

async function runPreparedProfile(profile: AgentProfile, input: RealRunOptions, transcript: TranscriptWriter, host: SupervisedHost, onAdapterStart: () => void, onInitialSnapshotError: (error: unknown) => void) {
  // This adapter receives the real class through the invocation closure. The client is constructed once.
  const client = input.createModelClient({ system: profile.system, runId: profile.runId });
  onAdapterStart();
  return runHostAdapter({ client, messages: [], profile, createClient: () => client, transcript, host, onInitialSnapshotError });
}

function executionMetadata(events: CapturedEvent[], runId: string, agent: AgentConfig,
  status: RunExecutionMetadata['status'], taskFactsSha256: string): RunExecutionMetadata {
  return { status, model: agent.model, sdkVersion: agent.sdkVersion,
    ...deriveExecutionEvidence(events, runId), taskFactsSha256 };
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

export function executionErrorDetails(error: unknown): { name: string; message: string } {
  return error instanceof Error ? { name: error.name, message: error.message.slice(0, 512) }
    : { name: 'Error', message: 'Non-Error execution failure' };
}
