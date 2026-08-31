export const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function seedToUint32(seed: number | string): number {
  if (typeof seed === 'number') {
    return (seed >>> 0) || 0x6d2b79f5;
  }

  let hash = 2166136261;
  for (const byte of Buffer.from(seed, 'utf8')) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 0x6d2b79f5;
}

function assertIdentifier(value: string, label: string): void {
  if (!/^[A-Za-z0-9-]+$/.test(value)) {
    throw new Error(`${label} must contain only letters, digits, or hyphens`);
  }
}

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let buffer = 0;
  let encoded = '';

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += BASE32_ALPHABET[(buffer >>> bits) & 31];
    }
  }
  if (bits > 0) {
    encoded += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  }
  return encoded;
}

/** Seeded only for reproducible offline evals; canaries are never real credentials. */
export class CanaryGenerator {
  private state: number;
  private readonly minted = new Set<string>();

  constructor(seed: number | string = Math.floor(Math.random() * 0xffff_ffff)) {
    this.state = seedToUint32(seed);
  }

  mint(scenarioId: string, runId: string): string {
    assertIdentifier(scenarioId, 'scenarioId');
    assertIdentifier(runId, 'runId');

    let canary: string;
    do {
      let suffix = '';
      for (let index = 0; index < 12; index += 1) {
        suffix += BASE32_ALPHABET[this.nextUint32() & 31];
      }
      canary = `TVC_${scenarioId}_${runId}_${suffix}`;
    } while (this.minted.has(canary));

    this.minted.add(canary);
    return canary;
  }

  private nextUint32(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }
}
