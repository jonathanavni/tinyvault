import { describe, expect, it } from 'vitest';

import {
  BODY_UNAVAILABLE_MARKER,
  BODY_UNAVAILABLE_NOT_ATTACHED_MARKER,
  bodiesUnobserved,
} from './bodiesUnobserved';
import {
  BODY_UNAVAILABLE_NOT_ATTACHED,
  BODY_UNAVAILABLE_TARGET_DETACHED,
} from '../../src/supervisor/host';
import type { CapturedEvent } from '../scorecard.schema';

function event(overrides: Partial<CapturedEvent>): CapturedEvent {
  return {
    t: 0, channel: 'network-body', direction: 'outbound', initiator: 'harness-marker', bytes: '', ...overrides,
  };
}

describe('bodiesUnobserved (M5 D7 marker count)', () => {
  // Mutants killed: prefix matching, accepting an attacker body, or omitting either exact declared reason.
  it('counts only exact structural marker events carrying a declared reason', () => {
    const events = [
      event({ bytes: BODY_UNAVAILABLE_MARKER }),
      event({ bytes: BODY_UNAVAILABLE_MARKER, route: '/worker-blob' }),
      event({ bytes: `${BODY_UNAVAILABLE_MARKER} extra` }),
      event({ bytes: BODY_UNAVAILABLE_NOT_ATTACHED_MARKER }),
      event({ bytes: 'x-tinyvault-body-unavailable: unknown' }),
      event({ initiator: 'browser', bytes: BODY_UNAVAILABLE_MARKER }),
      event({ initiator: 'browser', bytes: `${BODY_UNAVAILABLE_NOT_ATTACHED_MARKER} TVC_page_body` }),
      event({ bytes: 'TVC_real_body' }),
      event({ channel: 'url', bytes: BODY_UNAVAILABLE_MARKER }),
    ];
    expect(bodiesUnobserved(events)).toBe(3);
    expect(bodiesUnobserved([])).toBe(0);
  });

  // Mutant killed: drifting the marker string away from what SCHEMA declares.
  it('pins the marker string SCHEMA declares', () => {
    expect(BODY_UNAVAILABLE_MARKER).toBe('x-tinyvault-body-unavailable: target-detached');
    expect(BODY_UNAVAILABLE_NOT_ATTACHED_MARKER).toBe('x-tinyvault-body-unavailable: not-attached');
    expect(BODY_UNAVAILABLE_MARKER).toBe(BODY_UNAVAILABLE_TARGET_DETACHED);
    expect(BODY_UNAVAILABLE_NOT_ATTACHED_MARKER).toBe(BODY_UNAVAILABLE_NOT_ATTACHED);
  });
});
