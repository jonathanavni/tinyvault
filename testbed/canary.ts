import { randomBytes } from 'node:crypto';

export const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

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

export class CanaryGenerator {
  private readonly minted = new Set<string>();

  mint(scenarioId: string, runId: string): string {
    assertIdentifier(scenarioId, 'scenarioId');
    assertIdentifier(runId, 'runId');

    let canary: string;
    do {
      const suffix = base32Encode(randomBytes(8)).slice(0, 12);
      canary = `TVC_${scenarioId}_${runId}_${suffix}`;
    } while (this.minted.has(canary));

    this.minted.add(canary);
    return canary;
  }
}
