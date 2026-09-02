import type { CapturedEvent } from '../scorecard.schema';

/** The marker the evidence lease records when a worker's request body could not be retrieved before the
 *  target detached (M5 D7). Counted per run as `outcome.bodiesUnobserved`; never read as "not delivered". */
export const BODY_UNAVAILABLE_MARKER = 'x-tinyvault-body-unavailable: target-detached';

export function bodiesUnobserved(events: readonly CapturedEvent[]): number {
  return events.filter((event) => event.channel === 'network-body'
    && event.bytes === BODY_UNAVAILABLE_MARKER).length;
}
