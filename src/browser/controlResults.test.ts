import { describe, expect, it } from 'vitest';

import {
  createBrowserFailure,
  createBrowserOk,
  createSnapshotResult,
} from './controlResults';

describe('closed browser result constructors', () => {
  it('kills mutable or extra-key operation results while retaining every legitimate reason', () => {
    const ok = createBrowserOk();
    expect(ok).toEqual({ ok: true });
    expect(Object.isFrozen(ok)).toBe(true);
    for (const reason of [
      'session-unknown', 'invalid-url', 'navigation-failed', 'no-such-element', 'locked-field',
    ] as const) {
      const failure = createBrowserFailure(reason);
      expect(failure).toEqual({ ok: false, reason });
      expect(Reflect.ownKeys(failure)).toEqual(['ok', 'reason']);
      expect(Object.isFrozen(failure)).toBe(true);
    }
  });

  it('kills shallow snapshot freezing and masked-node field retention', () => {
    const result = createSnapshotResult({
      url: 'https://example.test/path',
      nodes: [
        { tag: 'input', masked: true, value: 'must-strip' } as any,
        { tag: 'input', masked: false, value: 'visible' },
      ],
    });
    expect(result).toEqual({
      ok: true,
      snapshot: {
        url: 'https://example.test/path',
        nodes: [{ tag: 'input', masked: true }, { tag: 'input', masked: false, value: 'visible' }],
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    if (result.ok) {
      expect(Object.isFrozen(result.snapshot)).toBe(true);
      expect(Object.isFrozen(result.snapshot.nodes)).toBe(true);
      expect(result.snapshot.nodes.every(Object.isFrozen)).toBe(true);
    }
    expect(createSnapshotResult()).toEqual({ ok: false, reason: 'session-unknown' });
  });
});
