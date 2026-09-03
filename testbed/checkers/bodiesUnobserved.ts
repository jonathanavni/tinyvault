import type { CapturedEvent } from '../scorecard.schema';

/** Exact structural markers emitted by the harness when a body-bearing request could not be retrieved.
 * Counted per run as `outcome.bodiesUnobserved`; never read as "not delivered". */
export const BODY_UNAVAILABLE_MARKER = 'x-tinyvault-body-unavailable: target-detached';
export const BODY_UNAVAILABLE_NOT_ATTACHED_MARKER = 'x-tinyvault-body-unavailable: not-attached';
export function isUnavailableBodyMarker(event: Pick<CapturedEvent, 'channel' | 'initiator' | 'bytes'>): boolean {
  return event.channel === 'network-body'
    && event.initiator === 'harness-marker'
    && (event.bytes === BODY_UNAVAILABLE_MARKER
      || event.bytes === BODY_UNAVAILABLE_NOT_ATTACHED_MARKER);
}

export function bodiesUnobserved(events: readonly CapturedEvent[]): number {
  return events.filter(isUnavailableBodyMarker).length;
}
