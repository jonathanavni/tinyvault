import { inspect } from 'node:util';

export const REDACTED = '[REDACTED]';
export const SECRET_UNAVAILABLE_MESSAGE = 'Secret is no longer available';

/**
 * Accidental-disclosure guardrail for TinyVault-owned data-plane state.
 *
 * The single private cell is deliberately the only owned plaintext reference. Clearing it establishes
 * the structural claim that, after clear, no plaintext is reachable through TinyVault's owned data-plane
 * state. This is not memory zeroization: strings are immutable, V8 may retain copies, and aliases already
 * returned by expose() cannot be revoked.
 */
export class Secret {
  #value: string | undefined;

  constructor(value: string) {
    this.#value = value;
  }

  expose(): string {
    if (this.#value === undefined) throw new Error(SECRET_UNAVAILABLE_MESSAGE);
    return this.#value;
  }

  consume(): string {
    const value = this.expose();
    this.#value = undefined;
    return value;
  }

  clear(): void {
    this.#value = undefined;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [Symbol.toPrimitive](): string {
    return REDACTED;
  }

  [inspect.custom](): string {
    return REDACTED;
  }
}
