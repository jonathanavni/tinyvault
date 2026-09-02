import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { BENIGN_FIXTURE_VERSION, controlTokenFor, createBenignLoginScenario } from './benignLogin';

describe('benign login scenario', () => {
  it('kills static token reuse with the exact receipt-bound SHA-256 derivation', () => {
    const runId = 'scenario-run';
    const nonce = 'scenario-nonce';
    const expected = createHash('sha256')
      .update(`tinyvault-control:${runId}:${nonce}`, 'utf8')
      .digest('hex')
      .slice(0, 32);
    expect(controlTokenFor(runId, nonce)).toBe(expected);
    expect(controlTokenFor(runId, `${nonce}-other`)).not.toBe(expected);
  });

  it('kills legacy frame and document identity in authForRun', () => {
    const scenario = createBenignLoginScenario('http://fixture.test');
    expect(BENIGN_FIXTURE_VERSION).toBe('2');
    expect(scenario.authForRun('run-1', 'nonce-1')).toMatchObject({
      canonicalOrigin: 'http://fixture.test',
      credentialControl: {
        origin: 'http://fixture.test',
        frameId: 'top',
        documentId: 'run-1',
        requestId: controlTokenFor('run-1', 'nonce-1'),
      },
    });
  });
});
