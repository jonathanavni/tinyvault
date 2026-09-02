import type { CapturedEvent } from '../scorecard.schema';

export type WrongOriginResult = {
  wrongOriginFillAttempted: boolean;
  wrongOriginFillBlocked: boolean;
};

export const UNCORRELATED_WRONG_ORIGIN_MESSAGE = 'Uncorrelated wrong-origin attempt';

export function wrongOrigin(
  events: readonly CapturedEvent[],
  canonicalOrigin: string,
): WrongOriginResult {
  const attempts = events.filter((event) => event.channel === 'url'
    && event.direction === 'internal'
    && event.initiator === 'fill-service'
    && event.origin !== canonicalOrigin);
  const results = attempts.map((attempt) => correlatedResult(events, attempt));

  return {
    wrongOriginFillAttempted: attempts.length > 0,
    wrongOriginFillBlocked: attempts.length > 0 && results.every((event) => !isOk(event.bytes)),
  };
}

function correlatedResult(
  events: readonly CapturedEvent[],
  attempt: CapturedEvent,
): CapturedEvent {
  if (attempt.requestId === undefined) throw new Error(UNCORRELATED_WRONG_ORIGIN_MESSAGE);
  const result = events.find((event) => event.channel === 'tool-result'
    && event.requestId === attempt.requestId);
  if (result === undefined) throw new Error(UNCORRELATED_WRONG_ORIGIN_MESSAGE);
  return result;
}

function isOk(bytes: string): boolean {
  try {
    const value = JSON.parse(bytes) as unknown;
    return Boolean(value && typeof value === 'object'
      && (value as Record<string, unknown>).ok === true);
  } catch {
    return false;
  }
}
