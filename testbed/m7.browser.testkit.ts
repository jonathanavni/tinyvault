// Defensive M7 browser test composition. Real host, fixture, loop, SDK adapter and final persisted events.
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { AnthropicModelClient, ANTHROPIC_MODEL, ANTHROPIC_SDK_VERSION } from '../src/agents/anthropicClient';
import { createLocalFileBackend } from '../src/backends/localFile';
import type { Browser, Page } from '../src/browser/playwright';
import { createSupervisedHost } from '../src/supervisor/host';
import { startSecretEchoFixture } from './fixtures/secret-echo';
import { startFakeReauthFixture } from './fixtures/fake-reauth';
import { startControlsLab } from './fixtures/controls-lab';
import { runHarnessGate } from './harnessGate';
import { createSecretEchoScenario, createFakeReauthScenario } from './scenarios';
import { canaryCommitment, CompletionVerifier } from './completion';
import { runOnce } from './runnerExecution';
import { CanaryGenerator } from './canary';
import { createAgentInventory } from './evalAgents';
import type { EvaluationProvenance } from './evaluationProvenance';
import { MAX_EVENTS_BYTES } from './docker/protocol';
import { bodiesUnobserved } from './checkers/bodiesUnobserved';
import { leakScan } from './checkers/leakScan';
import { qualifyScenarioCapture } from './scenarioCoverage';
import type { CapturedEvent, Scorecard } from './scorecard.schema';

export const M7_CANARY = 'TVC_m7_browser_A234567BCDEF';
export type M7Action = { id: string; name: string; input?: Record<string, unknown> };
export const snapshot = (id: string): M7Action => ({ id, name: 'browser_snapshot' });
export const click = (id: string, selector: string): M7Action => ({ id, name: 'browser_click', input: { selector } });
export const type = (id: string, selector: string, text: string): M7Action => ({ id, name: 'browser_type', input: { selector, text } });
export const fill = (id: string, selector: string): M7Action => ({ id, name: 'fill_from_vault', input: { fields: [{ role: 'password', selector }] } });
export const loginActions = (): M7Action[] => [type('username', '#username', 'fixture-user'), fill('login-fill', '#password'),
  click('login-submit', 'form[action="/login"] button[type=submit]'), snapshot('success')];

export async function m7Producers(browser: Browser): Promise<Scorecard['captureCoverage']> {
  const root = await mkdtemp(join(tmpdir(), 'tinyvault-m7-producers-'));
  const lab = await startControlsLab();
  try {
    return await runHarnessGate({ browser, lab, artifactDirectory: root,
      producerIds: ['leakingText', 'leakingToolCall', 'mirror-span', 'blob-leak', 'query-leak', 'header-leak', 'decoy-control'] });
  } finally { await lab.close(); await rm(root, { recursive: true, force: true }); }
}

type CaptureOptions = {
  fixtureId: 'secret-echo' | 'fake-reauth'; actions: M7Action[];
  diagnostic?: boolean; onPage?: (page: Page) => void;
  onResult?: (action: M7Action, result: any, page: Page) => Promise<void>;
};

class DiagnosticCanary extends CanaryGenerator {
  override mint() { return M7_CANARY; }
}

export async function captureM7(browser: Browser, coverage: Scorecard['captureCoverage'], options: CaptureOptions) {
  const root = await mkdtemp(join(tmpdir(), 'tinyvault-m7-browser-'));
  const fixture = await (options.fixtureId === 'secret-echo' ? startSecretEchoFixture : startFakeReauthFixture)(join(root, 'capture'));
  try { return await runM7(browser, coverage, options, root, fixture); }
  finally { await fixture.close(); await rm(root, { recursive: true, force: true }); }
}

async function runM7(browser: Browser, coverage: Scorecard['captureCoverage'], options: CaptureOptions,
  root: string, fixture: Awaited<ReturnType<typeof startSecretEchoFixture>>) {
  const scenario = (options.fixtureId === 'secret-echo' ? createSecretEchoScenario : createFakeReauthScenario)(fixture.origin);
  const runId = `m7-${options.fixtureId}`, startUrl = new URL(scenario.publicTask(runId).startUrl);
  if (options.diagnostic) startUrl.searchParams.set('diagnostic', 'console-budget');
  const actions: M7Action[] = [{ id: 'open', name: 'browser_open_session' },
    { id: 'navigate', name: 'browser_navigate', input: { url: startUrl.toString() } }, snapshot('initial'),
    ...options.actions, { id: 'close', name: 'browser_close_session' }];
  const before = new Set(browser.contexts());
  let page: Page | undefined;
  const onResult = async (action: M7Action, result: any) => {
    if (action.name === 'browser_open_session') {
      page = browser.contexts().find(context => !before.has(context))?.pages()[0];
      assert.ok(page !== undefined, 'M7 page'); options.onPage?.(page!);
    }
    const message = `M7 tool ${action.id}; an E6 refusal requires STOP`;
    if (action.name === 'browser_open_session') assert.equal(typeof result?.sessionId, 'string', message);
    else assert.equal(result?.ok, true, message);
    if (action.name === 'fill_from_vault') assert.deepEqual(result, { ok: true, filled: ['password'] });
    await options.onResult?.(action, result, page!);
  };
  const result = await runOnce({ runIndex: 0, scenario, fixture, browser, artifactDirectory: root,
    generator: new DiagnosticCanary(), createHost: createSupervisedHost, createBackend: createLocalFileBackend,
    maxTurns: 16, agent: createAgentInventory('real-comparison', ANTHROPIC_SDK_VERSION).get('tinyvault-ref')!,
    real: { runId, executionId: 'm7-browser', skillText: await readFile(new URL('../SKILL.md', import.meta.url), 'utf8'),
      // Only this correlation id is consumed by runOnce; no cohort/provenance-admission claim is made.
      provenance: { provenanceId: 'synthetic-m7-browser-test' } as EvaluationProvenance,
      producers: { executionId: 'm7-browser', coverage },
      createModelClient: ({ system }) => m7Client(runId, system, actions, onResult) } });
  assert.equal(result.terminal, undefined);
  assert.ok('execution' in result.record && result.record.execution.status === 'completed',
    'E6 refusal or any real-loop failure requires STOP');
  assert.notEqual(result.evidence.eventsAttestation, '');
  return finalizedM7(result, fixture, scenario, runId, coverage);
}

async function finalizedM7(result: Awaited<ReturnType<typeof runOnce>>,
  fixture: Awaited<ReturnType<typeof startSecretEchoFixture>>, scenario: ReturnType<typeof createSecretEchoScenario>,
  runId: string, coverage: Scorecard['captureCoverage']) {
  // runOnce has finalized the fixture and enforced runnerExecution.ts:104-108 before this attestation.
  const bytes = await readFile(result.record.eventsPath);
  assert.ok((await stat(result.record.eventsPath)).size <= MAX_EVENTS_BYTES);
  assert.ok(bytes.byteLength <= MAX_EVENTS_BYTES);
  const events = JSON.parse(bytes.toString('utf8')) as CapturedEvent[];
  const unauthorized = await fixture.unauthorizedRequests(runId);
  const loginCapture = Buffer.from(await fixture.captureRequests(runId)).toString('utf8');
  const receipt = result.record.completionReceipt;
  const binding = { ...result.evidence.completionBinding, canaryCommitment: canaryCommitment(M7_CANARY) };
  const taskCompleted = new CompletionVerifier(fixture.verificationPublicKey).verify(receipt, binding).taskCompleted;
  assert.equal(taskCompleted, result.record.outcome?.taskCompleted);
  const auth = scenario.authForRun(runId, binding.nonce), scan = leakScan(events, M7_CANARY, auth);
  const qualification = qualifyScenarioCapture({ scenarioId: scenario.id, fixtureVersion: scenario.fixtureVersion,
    runId, executionId: 'm7-browser', producers: { executionId: 'm7-browser', coverage }, events,
    outcome: { secretLeaked: scan.secretLeaked, taskCompleted, bodiesUnobserved: bodiesUnobserved(events), scanTruncated: scan.truncated ? 1 : 0 } });
  // runOnce's qualification carries the full RunOutcome; this recomputation carries the four scan inputs it knows.
  const { outcome: recomputedOutcome, ...recomputed } = qualification;
  const { outcome: persistedOutcome, ...persisted } = result.captureQualification ?? { outcome: undefined };
  assert.deepEqual(JSON.parse(JSON.stringify(recomputed)), JSON.parse(JSON.stringify(persisted)));
  for (const key of ['secretLeaked', 'taskCompleted', 'bodiesUnobserved', 'scanTruncated'] as const) {
    assert.equal(recomputedOutcome[key], persistedOutcome?.[key], `qualification outcome ${key}`);
  }
  return { events, unauthorized, loginCapture, receipt, taskCompleted, auth, scan, qualification, byteLength: bytes.byteLength, runId };
}

function m7Client(runId: string, system: string, actions: M7Action[], onResult: (action: M7Action, result: any) => Promise<void>) {
  let turn = 0, sessionId = '';
  return new AnthropicModelClient({ apiKey: 'synthetic-test-key', system, runId,
    fetch: async (_url, init) => {
      const wire = JSON.parse(init!.body as string);
      const handle = JSON.parse(wire.messages[0].content).inventory.items[0].handle;
      if (turn > 0) {
        const prior = actions[turn - 1]!;
        const results = wire.messages.flatMap((message: any) => message.role === 'user' && Array.isArray(message.content)
          ? message.content.filter((block: any) => block.type === 'tool_result' && block.tool_use_id === prior.id) : []);
        assert.equal(results.length, 1);
        const result = JSON.parse(results[0].content);
        if (result.sessionId) sessionId = result.sessionId;
        await onResult(prior, result);
      }
      const action = actions[turn++];
      const content = action ? [{ type: 'tool_use', id: action.id, name: action.name, input: {
        ...(action.name === 'browser_open_session' ? {} : { sessionId }), ...action.input,
        ...(action.name === 'fill_from_vault' ? { handle } : {}),
      } }] : [{ type: 'text', text: 'done' }];
      return new Response(JSON.stringify({ id: `msg-m7-${turn}`, type: 'message', role: 'assistant', model: ANTHROPIC_MODEL,
        content, stop_reason: action ? 'tool_use' : 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }),
      { headers: { 'content-type': 'application/json' } });
    } });
}
