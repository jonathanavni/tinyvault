import { describe, expect, it } from 'vitest';
import { createFillAuthorizationDomain } from './fillAuthorizationDomain';

describe('T-RC-4 Domain unit tests', () => {
  it('reserves one default unit, releases, commits, and renews exactly one unit', () => {
    const { authorization, lifecycle } = createFillAuthorizationDomain();
    const first = authorization.reserve('handle')!;
    expect(first).not.toBeNull();
    expect(authorization.reserve('handle')).toBeNull();
    first.release();
    const second = authorization.reserve('handle')!;
    expect(second).not.toBeNull();
    second.commit();
    expect(authorization.reserve('handle')).toBeNull();
    lifecycle.renew('handle');
    const renewed = authorization.reserve('handle')!;
    expect(renewed).not.toBeNull();
    expect(authorization.reserve('handle')).toBeNull();
    renewed.commit();
    expect(authorization.reserve('handle')).toBeNull();
  });
  it.each(['commit', 'release'] as const)('settlement is total and one-shot when %s wins', first => {
    const { authorization } = createFillAuthorizationDomain();
    const reservation = authorization.reserve('handle')!;
    expect(() => { reservation[first](); reservation.commit(); reservation.release(); reservation[first](); }).not.toThrow();
    const next = authorization.reserve('handle');
    if (first === 'commit') expect(next).toBeNull();
    else {
      expect(next).not.toBeNull();
      expect(authorization.reserve('handle')).toBeNull();
      next!.commit();
      expect(authorization.reserve('handle')).toBeNull();
    }
  });
  it('keeps two ordinary and hostile handle strings independent', () => {
    const { authorization, lifecycle } = createFillAuthorizationDomain();
    for (const handle of ['first', 'second', '__proto__', 'constructor']) {
      const reservation = authorization.reserve(handle);
      expect(reservation).not.toBeNull();
      reservation!.commit();
    }
    lifecycle.renew('__proto__');
    for (const handle of ['first', 'second', 'constructor']) expect(authorization.reserve(handle)).toBeNull();
    expect(authorization.reserve('__proto__')).not.toBeNull();
    expect(authorization.reserve('__proto__')).toBeNull();
  });
  it('preserves reservations when renewed and supports renewal before first use', () => {
    const { authorization, lifecycle } = createFillAuthorizationDomain();
    lifecycle.renew('handle');
    const first = authorization.reserve('handle')!, second = authorization.reserve('handle')!;
    expect(first).not.toBeNull(); expect(second).not.toBeNull();
    expect(authorization.reserve('handle')).toBeNull();
    lifecycle.renew('handle'); first.commit(); second.release();
    authorization.reserve('handle')!.commit(); authorization.reserve('handle')!.commit();
    expect(authorization.reserve('handle')).toBeNull();
  });
  it('exposes only frozen capabilities and no counter', () => {
    const domain = createFillAuthorizationDomain();
    const reservation = domain.authorization.reserve('handle')!;
    expect(Reflect.ownKeys(domain)).toEqual(['authorization', 'lifecycle']);
    expect(Reflect.ownKeys(domain.authorization)).toEqual(['reserve']);
    expect(Reflect.ownKeys(domain.lifecycle)).toEqual(['renew']);
    expect(Reflect.ownKeys(reservation)).toEqual(['commit', 'release']);
    for (const value of [domain, domain.authorization, domain.lifecycle, reservation]) expect(Object.isFrozen(value)).toBe(true);
  });
});
