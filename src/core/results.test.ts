import { describe, expect, it } from 'vitest';

import { Secret } from './redaction';
import {
  createFailedResult,
  createFilledResult,
  createSetupResult,
  INVALID_RESULT_PROVENANCE_MESSAGE,
  type FilledResultProvenance,
} from './results';

const secret = new Secret('TVC_result_secret');

// Mutation caught: constructor signatures growing a secret-bearing or unnamed extra provenance field.
if (false) {
  // @ts-expect-error Secret is not a caller-requested role list.
  createFilledResult({ requestedRoles: secret });
  // @ts-expect-error Secret-bearing fields are not accepted provenance.
  createFilledResult({ requestedRoles: ['password'], secret });
  // @ts-expect-error Extra provenance properties are rejected.
  createFilledResult({ requestedRoles: ['password'], policyRoles: ['username'] });
  // @ts-expect-error Failure constructors accept only the closed reason union.
  createFailedResult({ reason: 'secret-dependent-error' });
  // @ts-expect-error Setup constructors accept no free-text or secret field.
  createSetupResult({ reason: 'missing_item', detail: secret });
  // @ts-expect-error The named provenance shape itself cannot carry an extra secret field.
  const _leakyProvenance: FilledResultProvenance = { requestedRoles: ['password'], secret };
  void _leakyProvenance;
}

describe('exact model-visible result constructors', () => {
  it('catches mutation of caller-role ordering, dedup, own keys, or serialized success bytes', () => {
    const result = createFilledResult({
      requestedRoles: ['password', 'username', 'password', 'totp', 'username'],
    });
    expect(Reflect.ownKeys(result)).toEqual(['ok', 'filled']);
    expect(Reflect.ownKeys(result.filled)).toEqual(['0', '1', '2', 'length']);
    expect(result).toEqual({ ok: true, filled: ['password', 'username', 'totp'] });
    expect(JSON.stringify(result)).toBe('{"ok":true,"filled":["password","username","totp"]}');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.filled)).toBe(true);
  });

  it('catches exact runtime FieldRole-set mutation that echoes arbitrary caller strings', () => {
    const result = createFilledResult({
      requestedRoles: ['password', 'attacker-controlled', 'totp', 'x'.repeat(10_000)] as never,
    });
    expect(result.filled).toEqual(['password', 'totp']);
    expect(JSON.stringify(result)).not.toContain('attacker-controlled');
    expect(JSON.stringify(result)).not.toContain('x'.repeat(100));
  });

  it.each([
    'origin-not-authorized',
    'handle-unavailable',
    'locked-field',
    'no-password-control',
    'cross-origin-frame',
    'session-unknown',
    'backend-error',
  ] as const)('catches mutation of closed failure %s shape or bytes', (reason) => {
    const result = createFailedResult({ reason });
    expect(Reflect.ownKeys(result)).toEqual(['ok', 'reason']);
    expect(JSON.stringify(result)).toBe(`{"ok":false,"reason":"${reason}"}`);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([
    ['missing_item', 'Set up the requested credential in TinyVault, then retry.'],
    ['backend_locked', 'Unlock the TinyVault credential backend, then retry.'],
    ['backend_unavailable', 'Restore the TinyVault credential backend, then retry.'],
  ] as const)('catches mutation of fixed setup text for %s', (reason, instruction) => {
    const result = createSetupResult({ reason });
    expect(Reflect.ownKeys(result)).toEqual(['instruction']);
    expect(JSON.stringify(result)).toBe(JSON.stringify({ instruction }));
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each(['__proto__', 'constructor', 'toString', 'secret-dependent-error'])(
    'catches exact own-lookup mutation accepting setup reason %s',
    (reason) => {
      expect(() => createSetupResult({ reason } as never)).toThrow(INVALID_RESULT_PROVENANCE_MESSAGE);
    },
  );

  it('catches exact closed-failure-set mutation accepting arbitrary runtime reasons', () => {
    expect(() => createFailedResult({ reason: 'secret-dependent-error' } as never))
      .toThrow(INVALID_RESULT_PROVENANCE_MESSAGE);
  });

  it('catches exact mutation deleting Object.freeze from any closed result shape', () => {
    const filled = createFilledResult({ requestedRoles: ['password'] });
    const failed = createFailedResult({ reason: 'backend-error' });
    const setup = createSetupResult({ reason: 'backend_locked' });
    expect([
      Object.isFrozen(filled),
      Object.isFrozen(filled.filled),
      Object.isFrozen(failed),
      Object.isFrozen(setup),
    ]).toEqual([true, true, true, true]);
  });

  it('states the structural limit: M2 does not claim the M4 secret differential', () => {
    // This proves exact shapes and public provenance only. With no fill service in M2, it cannot prove
    // differing secret values/lengths produce identical real caller outcomes; that differential is M4.
    expect(JSON.stringify(createFilledResult({ requestedRoles: ['password'] })))
      .toBe('{"ok":true,"filled":["password"]}');
  });
});
