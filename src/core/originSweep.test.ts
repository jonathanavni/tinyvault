import { describe, expect, it } from 'vitest';

import { validateBareOrigin } from './originGuard';
import { sweepOrigins } from './originSweep';

describe('origin sweep', () => {
  it('finds no UTS-46 collapse or collision through U+2FFF', () => {
    const result = sweepOrigins({ max: 0x2fff, validate: validateBareOrigin });
    const counts = `accepted=${result.accepted}, distinct=${result.distinct}`;
    expect(result.collapses, counts).toBe(0);
    expect(result.collisions, counts).toBe(0);
  }, 45_000);

  it('fires the collision oracle when a non-ASCII code point maps onto ASCII', () => {
    const offendingCharacter = '\u2024';
    const offendingInput = `https://example${offendingCharacter}com`;
    const result = sweepOrigins({
      max: 0x2024,
      validate: (input) => validateBareOrigin(input.replaceAll(offendingCharacter, '.')),
    });

    expect(result.collapses + result.collisions).toBeGreaterThan(0);
    expect(result.collisions).toBeGreaterThan(0);
    expect(result.collisionExamples.some(({ distinct }) => distinct.includes(offendingInput)))
      .toBe(true);
  }, 45_000);

  it('rejects invalid bounds and validators', () => {
    expect(() => sweepOrigins({ max: 0x1f, validate: validateBareOrigin })).toThrow(RangeError);
    expect(() => sweepOrigins({ max: 0x110000, validate: validateBareOrigin })).toThrow(RangeError);
    expect(() => sweepOrigins({
      max: 0x20,
      // @ts-expect-error runtime validation protects JavaScript callers.
      validate: 'not-a-function',
    })).toThrow(TypeError);
  });
});
