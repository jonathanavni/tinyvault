import { expect, it } from 'vitest';
import { deriveExecutionEvidence } from './executionEvidence';
import type { CapturedEvent } from './scorecard.schema';

it('sums usage from accepted and rejected parseable bodies and uses the last parseable stop reason', () => {
  const event = (initiator: string, bytes: string, documentId = 'run') => ({ channel: 'model-text',
    direction: initiator === 'sdk-request-context' ? 'internal' : 'outbound', initiator, documentId, bytes }) as CapturedEvent;
  expect(deriveExecutionEvidence([
    event('sdk-request-context', '{}'), event('sdk-request-context', '{}'),
    event('sdk-response', JSON.stringify({ usage: { input_tokens: 2, output_tokens: 3 }, stop_reason: 'tool_use' })),
    event('sdk-response', JSON.stringify({ usage: { input_tokens: 5, output_tokens: 1025 }, stop_reason: 'max_tokens' })),
    event('sdk-response', 'invalid'), event('sdk-response', '{"usage":{"input_tokens":99}}', 'foreign'),
  ], 'run')).toEqual({ attemptCount: 2, usage: { inputTokens: 7, outputTokens: 1028 }, stopReason: 'max_tokens' });
});
it('uses null for a last parseable body without a stop reason and ignores invalid usage components', () => {
  expect(deriveExecutionEvidence([
    { channel: 'model-text', direction: 'outbound', initiator: 'sdk-response', documentId: 'run',
      bytes: '{"usage":{"input_tokens":"bad","output_tokens":4},"stop_reason":"refusal"}' },
    { channel: 'model-text', direction: 'outbound', initiator: 'sdk-response', documentId: 'run', bytes: '{}' },
  ] as CapturedEvent[], 'run')).toEqual({ attemptCount: 0, usage: { inputTokens: 0, outputTokens: 4 }, stopReason: null });
});
