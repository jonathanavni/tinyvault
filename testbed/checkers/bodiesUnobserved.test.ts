import { describe, expect, it } from 'vitest';

import { BODY_UNAVAILABLE_MARKER, bodiesUnobserved } from './bodiesUnobserved';
import type { CapturedEvent } from '../scorecard.schema';

function event(overrides: Partial<CapturedEvent>): CapturedEvent {
  return { t: 0, channel: 'network-body', direction: 'outbound', initiator: 'browser', bytes: '', ...overrides };
}

describe('bodiesUnobserved (M5 D7 marker count)', () => {
  // Mutant killed: counting every network-body event, or omitting the correlated not-attached reason.
  it('counts network-body events carrying any declared unavailable reason', () => {
    const events = [
      event({ bytes: BODY_UNAVAILABLE_MARKER }),
      event({ bytes: BODY_UNAVAILABLE_MARKER, route: '/worker-blob' }),
      event({ bytes: `${BODY_UNAVAILABLE_MARKER} extra` }),
      event({ bytes: 'x-tinyvault-body-unavailable: not-attached' }),
      event({ bytes: 'TVC_real_body' }),
      event({ channel: 'url', bytes: BODY_UNAVAILABLE_MARKER }),
    ];
    expect(bodiesUnobserved(events)).toBe(4);
    expect(bodiesUnobserved([])).toBe(0);
  });

  // Mutant killed: drifting the marker string away from what SCHEMA declares.
  it('pins the marker string SCHEMA declares', () => {
    expect(BODY_UNAVAILABLE_MARKER).toBe('x-tinyvault-body-unavailable: target-detached');
  });
});
