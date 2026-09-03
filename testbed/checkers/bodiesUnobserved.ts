import type { CapturedEvent } from '../scorecard.schema';

/** The marker the evidence lease records when a worker's request body could not be retrieved before the
 *  target detached (M5 D7). Counted per run as `outcome.bodiesUnobserved`; never read as "not delivered". */
export const BODY_UNAVAILABLE_MARKER = 'x-tinyvault-body-unavailable: target-detached';
export const BODY_UNAVAILABLE_PREFIX = 'x-tinyvault-body-unavailable:';

export function bodiesUnobserved(events: readonly CapturedEvent[]): number {
  return events.filter((event) => event.channel === 'network-body'
    && event.bytes.startsWith(BODY_UNAVAILABLE_PREFIX)).length;
}
