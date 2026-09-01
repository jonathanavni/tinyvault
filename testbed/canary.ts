import { randomBytes } from 'node:crypto';

import { base32Encode } from '../src/shared/secretTransforms';

export { BASE32_ALPHABET, base32Encode } from '../src/shared/secretTransforms';

function assertIdentifier(value: string, label: string): void {
  if (!/^[A-Za-z0-9-]+$/.test(value)) {
    throw new Error(`${label} must contain only letters, digits, or hyphens`);
  }
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
