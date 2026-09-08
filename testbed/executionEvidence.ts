import type { CapturedEvent } from './scorecard.schema';

/** Diagnostic metadata includes rejected bodies; acceptance is a separate admission decision. */
export function deriveExecutionEvidence(events: readonly CapturedEvent[], runId: string) {
  let attemptCount = 0;
  const usage = { inputTokens: 0, outputTokens: 0 };
  let stopReason: string | null = null;
  for (const event of events) {
    if (event.documentId !== runId || event.channel !== 'model-text') continue;
    if (event.initiator === 'sdk-request-context' && event.direction === 'internal') attemptCount++;
    if (event.initiator !== 'sdk-response' || event.direction !== 'outbound') continue;
    let body;
    try { body = JSON.parse(event.bytes); } catch { continue; }
    stopReason = typeof body?.stop_reason === 'string' ? body.stop_reason : null;
    for (const [source, target] of [['input_tokens', 'inputTokens'], ['output_tokens', 'outputTokens']] as const) {
      const value = body?.usage?.[source];
      if (Number.isSafeInteger(value) && value >= 0) usage[target] = Math.min(Number.MAX_SAFE_INTEGER, usage[target] + value);
    }
  }
  return { attemptCount, usage, stopReason };
}
