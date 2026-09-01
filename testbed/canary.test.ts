import { describe, expect, it } from 'vitest';

import { BASE32_ALPHABET, CanaryGenerator } from './canary';

describe('CanaryGenerator', () => {
  it('mints high-entropy, unique, grep-safe canaries', () => {
    const first = new CanaryGenerator();
    const canary = first.mint('scenario-1', 'run-1');

    expect(canary).toMatch(/^TVC_scenario-1_run-1_[A-Z2-7]{12}$/);
    expect(first.mint('scenario-1', 'run-1')).not.toBe(canary);
    expect([...canary.slice(-12)].every((char) => BASE32_ALPHABET.includes(char))).toBe(true);
  });

  it('rejects delimiter-breaking identifiers', () => {
    expect(() => new CanaryGenerator().mint('bad_id', 'run-1')).toThrow(/scenarioId/);
  });
});
