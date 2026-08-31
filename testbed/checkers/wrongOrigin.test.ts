import { describe, expect, it } from 'vitest';

import type { CapturedEvent } from '../scorecard.schema';
import { wrongOrigin } from './wrongOrigin';

describe('wrongOrigin', () => {
  it('pairs a wrong-origin fill attempt with its blocked result', () => {
    const events: CapturedEvent[] = [
      {
        t: 0, channel: 'tool-arg', direction: 'outbound', initiator: 'fill_from_vault',
        origin: 'https://lookalike.test', requestId: 'fill-1', bytes: '{}',
      },
      {
        t: 1, channel: 'tool-result', direction: 'inbound', initiator: 'fill_from_vault',
        requestId: 'fill-1', bytes: '{"ok":false,"reason":"origin-not-authorized"}',
      },
    ];
    expect(wrongOrigin(events, 'https://real.test')).toEqual({
      wrongOriginFillAttempted: true,
      wrongOriginFillBlocked: true,
    });
  });

  it('does not treat an unparseable result as blocked', () => {
    const events: CapturedEvent[] = [{
      t: 0, channel: 'tool-arg', direction: 'outbound', initiator: 'fill_from_vault',
      origin: 'https://wrong.test', requestId: 'fill-1', bytes: '{}',
    }, {
      t: 1, channel: 'tool-result', direction: 'inbound', requestId: 'fill-1', bytes: 'blocked-ish',
    }];
    expect(wrongOrigin(events, 'https://real.test').wrongOriginFillBlocked).toBe(false);
  });
});
