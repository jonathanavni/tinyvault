import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AnthropicModelClient, ANTHROPIC_MODEL } from '../src/agents/anthropicClient';
import { TranscriptWriter } from '../src/agents/transcript';
import { runHostAdapter } from './runnerExecution';
import type { SupervisedHost } from '../src/supervisor/host';
import { describe, expect, it } from 'vitest';
import { observeInitialSnapshot, qualifyScenarioCapture, printScenarioCapture, SCENARIO_REQUIREMENTS, DOM_EXPOSURE_STRINGS } from './scenarioCoverage';
import { CHANNEL_COVERAGE } from './coverage';
import type { CapturedEvent, Scorecard } from './scorecard.schema';

function input() {
  const names = DOM_EXPOSURE_STRINGS.map((name) => name.slice(0, 200));
  const result = { ok: true, snapshot: { url: 'http://fixture.test/', nodes: names.map((name) => ({ tag: 'div', masked: false, name })) } };
  const events: CapturedEvent[] = [
    { t: 0, channel: 'tool-result', direction: 'inbound', initiator: 'tool:browser_snapshot', requestId: 'snap', bytes: JSON.stringify(result) },
    { t: 1, channel: 'model-text', direction: 'internal', initiator: 'sdk-request-context', documentId: 'run-1', requestId: 'turn:1',
      bytes: JSON.stringify({ messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'snap', content: JSON.stringify(result) }] }] }) },
  ];
  const coverage: Scorecard['captureCoverage'] = Object.entries(CHANNEL_COVERAGE).map(([channel, row]) => ({ channel: channel as never, ...row,
    ...(row.status === 'instrumented' ? { observedAt: '2026-09-07T00:00:00Z',
      producerObservations: row.producers.map((producer) => ({ producer, observed: 'body' as const })) } : {}) }));
  return { scenarioId: 'dom-hidden-injection', fixtureVersion: '1', runId: 'run-1', executionId: 'execution-1',
    producers: { executionId: 'execution-1', coverage }, events,
    outcome: { secretLeaked: false, taskCompleted: true, bodiesUnobserved: 0, scanTruncated: 0 } };
}

describe('M6 scenario capture qualification', () => {
  it.each(['clean', 'missing', 'late', 'foreign-sdk-run', 'duplicate-sdk-result'] as const)(
    'initial observation and qualification share the snapshot SDK join (%s)', (mode) => {
      const value = input();
      if (mode === 'missing') value.events = [];
      if (mode === 'late') value.events.unshift({ t: 0, channel: 'tool-arg', direction: 'outbound',
        initiator: 'tool:browser_click', bytes: '{}' });
      if (mode === 'foreign-sdk-run') value.events[1]!.documentId = 'another-run';
      if (mode === 'duplicate-sdk-result') {
        const sdk = JSON.parse(value.events[1]!.bytes);
        sdk.messages[0].content.push(sdk.messages[0].content[0]);
        value.events[1]!.bytes = JSON.stringify(sdk);
      }
      const observation = observeInitialSnapshot(value.events, value.runId);
      const qualification = qualifyScenarioCapture(value);
      expect(qualification.initialSnapshotObserved)
        .toBe(!observation.late && observation.snapshotObserved && observation.sdkObserved);
      expect(qualification.initialSnapshotObserved).toBe(mode === 'clean');
    },
  );

  it.each(['clean', 'drop-at-sdk', 'missing-channel', 'static-inventory', 'missing-body', 'scan-truncation'] as const)(
    'actual SDK adapter qualifies only observed complete exposure (%s)', async (mode) => {
      const value = input();
      const snapshot = JSON.parse(value.events[0]!.bytes);
      const directory = await mkdtemp(join(tmpdir(), 'tinyvault-s4-exposure-'));
      const transcript = await TranscriptWriter.create(join(directory, 'transcript.jsonl'), join(directory, 'events.json'));
      let requests = 0;
      const client = new AnthropicModelClient({ apiKey: 'synthetic-test-key', system: 'Inspect the page.', runId: value.runId,
        fetch: async () => {
          const first = requests++ === 0;
          return new Response(JSON.stringify({ id: `msg-${requests}`, type: 'message', role: 'assistant', model: ANTHROPIC_MODEL,
            content: first ? [{ type: 'tool_use', id: 'snap', name: 'browser_snapshot', input: { sessionId: 's' } }]
              : [{ type: 'text', text: 'done' }], stop_reason: first ? 'tool_use' : 'end_turn', stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 1 } }), { headers: { 'content-type': 'application/json' } });
        } });
      const nextTurn = client.nextTurn.bind(client);
      if (mode === 'drop-at-sdk') client.nextTurn = (messages, tools, context) =>
        nextTurn(JSON.parse(JSON.stringify(messages).replace('Support feedback', 'Support')), tools, context);
      if (mode === 'missing-channel') value.producers.coverage = value.producers.coverage.filter((row) => row.channel !== 'header');
      if (mode === 'static-inventory') for (const row of value.producers.coverage) if (row.status === 'instrumented') delete row.observedAt;
      if (mode === 'missing-body') value.outcome.bodiesUnobserved = 1;
      if (mode === 'scan-truncation') value.outcome.scanTruncated = 1;
      const host = { tools: { browser_snapshot: async () => snapshot },
        settleEvidence: async () => undefined, quiesceEvidenceProducers: async () => undefined,
        drainEvidence: () => [] } as unknown as SupervisedHost;
      const result = await runHostAdapter({ client, messages: [{ role: 'user', content: 'Inspect.' }], host, transcript,
        scenarioCapture: value });
      expect(requests).toBe(2);
      expect(result.captureQualification?.status).toBe(mode === 'clean' ? 'qualified' : 'unqualified');
      expect(result.captureQualification?.outcome).toBe(value.outcome);
      const persisted = JSON.parse(await readFile(join(directory, 'events.json'), 'utf8'));
      expect(persisted).toEqual(result.events);
      expect(JSON.parse(await readFile(`${transcript.eventsPath}.initial-snapshot.json`, 'utf8')))
        .toEqual(result.initialSnapshotObservation);
      const printed = await readFile(`${transcript.eventsPath}.scenario-capture.txt`, 'utf8');
      expect(printed).toContain(`scan truncations: ${value.outcome.scanTruncated}`);
      expect(printed).toContain(`missing bodies: ${value.outcome.bodiesUnobserved}`);
      expect(printed).toContain('unobserved payloads:');
    },
  );
  it('pins the independent literal fixture strings and the exact delivered 200-character prefix', async () => {
    const html = await readFile(new URL('./fixtures/dom-hidden-injection/index.html', import.meta.url), 'utf8');
    const literal = [...html.matchAll(/>(TV-INJECTION-MARKER:(?:display-none|aria-hidden-off-screen|white-on-white)[^<]+)</gu)]
      .map((match) => match[1]);
    expect(DOM_EXPOSURE_STRINGS).toEqual(literal);
    expect(DOM_EXPOSURE_STRINGS[1]).toHaveLength(204);
    expect(DOM_EXPOSURE_STRINGS[1]!.slice(200)).toBe('box.');
    expect(DOM_EXPOSURE_STRINGS[1]!.slice(0, 200).at(-1)).toBe(' ');
    const result = qualifyScenarioCapture(input());
    expect(result.status).toBe('qualified');
    expect(result.exposure[1]).toMatchObject({ originalLength: 204, deliveredLength: 200, truncated: true,
      snapshotObserved: true, sdkObserved: true, omitted: 'box.' });
    expect(printScenarioCapture(result)).toContain('204 -> 200');
    expect(printScenarioCapture(result)).toContain('box.');
  });

  it.each(['missing', 'late-only', 'truncated', 'dropped-between-snapshot-and-SDK'] as const)(
    '%s withholds hostile comparison without changing the outcome', (mode) => {
      const value = input();
      const empty = JSON.stringify({ ok: true, snapshot: { url: 'http://fixture.test/', nodes: [] } });
      if (mode === 'missing') value.events = [];
      if (mode === 'late-only') value.events.unshift({ ...value.events[0]!, requestId: 'earlier', bytes: empty });
      if (mode === 'truncated') value.events[0]!.bytes = value.events[0]!.bytes.replace('Support feedback', 'Support');
      if (mode === 'dropped-between-snapshot-and-SDK') value.events[1]!.bytes = value.events[1]!.bytes.replace('Support feedback', 'Support');
      const result = qualifyScenarioCapture(value);
      expect(result.status).toBe('unqualified');
      expect(result.hostileComparison).toBe(false);
      expect(result.outcome).toBe(value.outcome);
      expect(printScenarioCapture(result)).toContain('unobserved payloads:');
    },
  );

  it.each(['missing-channel', 'static-inventory', 'other-execution', 'marker', 'truncation'] as const)(
    'lab green cannot override %s', (mode) => {
      const value = input();
      if (mode === 'missing-channel') value.producers.coverage = value.producers.coverage.filter((row) => row.channel !== 'header');
      if (mode === 'static-inventory') for (const row of value.producers.coverage) if (row.status === 'instrumented') delete row.observedAt;
      if (mode === 'other-execution') value.producers.executionId = 'other';
      if (mode === 'marker') value.outcome.bodiesUnobserved = 1;
      if (mode === 'truncation') value.outcome.scanTruncated = 1;
      const result = qualifyScenarioCapture(value);
      expect(result.status).toBe('unqualified');
      expect(printScenarioCapture(result)).toContain(`missing bodies: ${value.outcome.bodiesUnobserved}`);
      expect(printScenarioCapture(result)).toContain(`scan truncations: ${value.outcome.scanTruncated}`);
      expect(printScenarioCapture(result)).toContain('screenshot-text: not-yet-instrumented');
    },
  );

  it('requires redirect only for the versioned lookalike scenario and rejects unknown versions', () => {
    expect(SCENARIO_REQUIREMENTS['lookalike-origin-redirect'].channels).toContain('redirect');
    expect(SCENARIO_REQUIREMENTS['benign-login-control'].channels).not.toContain('redirect');
    expect(qualifyScenarioCapture({ ...input(), fixtureVersion: 'unknown' }).status).toBe('unqualified');
  });
});
