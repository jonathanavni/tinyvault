import { describe, expect, it } from 'vitest';

import type { FillResult, ItemMeta } from '../src/core/types';
import type { CapturedEvent, RunRecord } from './scorecard.schema';

// --- Compile-time contract guards (round: M0 review, both channels) ---
// `make test` runs `tsc --noEmit` before vitest, so a @ts-expect-error that STOPS
// erroring (i.e. the illegal shape became legal) fails the build. These give the
// frozen contract teeth that positive-value examples cannot: they assert the
// model-visible surface has NOT grown a trusted-only field or an out-of-enum value.

// FillResult reason is a CLOSED union of exactly the eight locked members.
// @ts-expect-error — 'not-a-real-reason' is not a locked FillResult reason.
const _badReason: FillResult = { ok: false, reason: 'not-a-real-reason' };

// The success arm carries ONLY `filled` — no secret/acceptance oracle field.
// @ts-expect-error — a FillResult success must not carry a `secret` field.
const _leakySuccess: FillResult = { ok: true, filled: ['password'], secret: 'x' };

// ItemMeta is model-visible: it must NOT surface the trusted-only canonicalOrigin.
// @ts-expect-error — canonicalOrigin is trusted-side only; not part of ItemMeta.
const _leakyMeta: ItemMeta = { handle: 'vh_x', label: 'x', kind: 'password', available: true, canonicalOrigin: 'https://e.com' };

// CapturedEvent is RAW: classification is offline-only, so no `sink` field exists.
// @ts-expect-error — CapturedEvent must not carry a pre-computed `sink`.
const _preClassified: CapturedEvent = { t: 0, channel: 'log', direction: 'internal', bytes: '', sink: 'authorized-sink' };

void _badReason; void _leakySuccess; void _leakyMeta; void _preClassified;

describe('M0 contracts', () => {
  it('accepts representative contract values', () => {
    const fillResult: FillResult = {
      ok: false,
      reason: 'session-unknown',
    };
    const runRecord: RunRecord = {
      scenario: 'contract-smoke-test',
      attackClass: 'lookalike-origin',
      agent: 'tinyvault-ref',
      model: 'pinned-model-id',
      sdkVersion: '0.0.0',
      runIndex: 0,
      transcriptPath: 'artifacts/transcript.jsonl',
      eventsPath: 'artifacts/events.json',
      checkerVersion: '0.0.0',
      completionOracleVersion: '0.0.0',
      outcome: {
        secretLeaked: false,
        wrongOriginFillAttempted: true,
        wrongOriginFillBlocked: true,
        unobserved: 0,
        bodiesUnobserved: 0, scanTruncated: 0,
        approvalBypassed: false,
        taskCompleted: false,
      },
    };

    expect(fillResult.reason).toBe('session-unknown');
    expect(runRecord.outcome.wrongOriginFillBlocked).toBe(true);
  });
});
