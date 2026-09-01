import { Console } from 'node:console';
import { Writable } from 'node:stream';
import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';

import { REDACTED, SECRET_UNAVAILABLE_MESSAGE, Secret } from './redaction';

const plaintext = 'TVC_unique_secret_8B9D';

function expectNoOwnedSecretStructure(secret: Secret): void {
  // Mutation caught: replacing #value with an enumerable/symbol/string-keyed property exposes plaintext.
  expect(Object.keys(secret)).toEqual([]);
  expect(Object.entries(secret)).toEqual([]);
  expect({ ...secret }).toEqual({});
  expect(Object.getOwnPropertyNames(secret)).toEqual([]);
  expect(Object.getOwnPropertySymbols(secret)).toEqual([]);
  expect(Reflect.ownKeys(secret)).toEqual([]);
  expect(Object.getOwnPropertyDescriptors(secret)).toEqual({});
  expect(inspect(Object.getPrototypeOf(secret), { showHidden: true })).not.toContain(plaintext);
}

describe('Secret structural redaction guardrail', () => {
  it('catches mutation of every value-producing route away from fixed redaction', () => {
    const secret = new Secret(plaintext);
    expect(String(secret)).toBe(REDACTED);
    expect(`${secret}`).toBe(REDACTED);
    expect(secret.toString()).toBe(REDACTED);
    expect(secret.toJSON()).toBe(REDACTED);
    expect(JSON.stringify(secret)).toBe(JSON.stringify(REDACTED));
    expect(inspect(secret)).toBe(REDACTED);
    expect(inspect(secret, { showHidden: true })).toBe(REDACTED);

    let output = '';
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    new Console(sink, sink).log(secret);
    expect(output.trim()).toBe(REDACTED);

    const error = new Error(`operation failed for ${secret}`);
    expect(error.message).toBe(`operation failed for ${REDACTED}`);
    expect(error.stack).not.toContain(plaintext);
  });

  it('catches mutation that exposes secret-bearing own structure before or after clear', () => {
    const secret = new Secret(plaintext);
    expectNoOwnedSecretStructure(secret);
    secret.clear();
    expectNoOwnedSecretStructure(secret);
    expect(String(secret)).toBe(REDACTED);
    expect(JSON.stringify(secret)).toBe(JSON.stringify(REDACTED));
    expect(inspect(secret)).toBe(REDACTED);
  });

  it('catches mutation of repeated expose, one-shot consume, and idempotent clear semantics', () => {
    const exposed = new Secret(plaintext);
    expect(exposed.expose()).toBe(plaintext);
    expect(exposed.expose()).toBe(plaintext);
    exposed.clear();
    exposed.clear();

    const consumed = new Secret(plaintext);
    expect(consumed.consume()).toBe(plaintext);
    consumed.clear();
    expect(() => consumed.consume()).toThrow(SECRET_UNAVAILABLE_MESSAGE);
  });

  it('catches secret-dependent post-clear error bytes on every thrown access path', () => {
    for (const lifecycle of ['clear', 'consume'] as const) {
      const secret = new Secret(plaintext);
      if (lifecycle === 'clear') secret.clear();
      else expect(secret.consume()).toBe(plaintext);

      for (const access of [() => secret.expose(), () => secret.consume()]) {
        try {
          access();
          throw new Error('expected access to fail');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toBe(SECRET_UNAVAILABLE_MESSAGE);
          expect((error as Error).message).not.toContain(plaintext);
        }
      }
    }
  });

  it('documents structural review of the single owned cell; API tests do not prove non-retention', () => {
    // B1 slice 1/3 is structural, not absolute: this test catches adding an own secret-bearing property,
    // while review of redaction.ts verifies clear/consume overwrite the sole #value cell. A mutation that
    // gates expose() behind a boolean while retaining a different private cell cannot be disproved by the
    // post-clear API. This is not heap inspection, memory zeroization, or revocation of returned aliases.
    const secret = new Secret(plaintext);
    const alias = secret.expose();
    secret.clear();
    expect(() => secret.expose()).toThrow(SECRET_UNAVAILABLE_MESSAGE);
    expect(alias).toBe(plaintext);
    expectNoOwnedSecretStructure(secret);
  });
});
