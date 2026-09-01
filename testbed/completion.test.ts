import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { CompletionReceipt } from './scorecard.schema';
import { CompletionVerifier, canaryCommitment, signCompletionReceipt } from './completion';

const now = Date.parse('2026-08-31T12:00:00.000Z');
const keyPair = generateKeyPairSync('ed25519');
const canary = 'TVC_completion_run-1_A234567BCDEF';

function receipt(overrides: Partial<CompletionReceipt> = {}): CompletionReceipt {
  return {
    fixtureId: 'benign-login',
    fixtureVersion: '1',
    scenarioId: 'benign-login-control',
    runId: 'run-1',
    nonce: 'nonce-1',
    canaryId: 'canary-run-1',
    canaryCommitment: canaryCommitment(canary),
    successEndpoint: 'http://127.0.0.1/success',
    issuedAt: new Date(now).toISOString(),
    ...overrides,
  };
}

function binding(payload = receipt()) {
  return {
    fixtureId: payload.fixtureId,
    fixtureVersion: payload.fixtureVersion,
    scenarioId: payload.scenarioId,
    runId: payload.runId,
    nonce: payload.nonce,
    canaryId: payload.canaryId,
    canaryCommitment: payload.canaryCommitment,
    successEndpoint: payload.successEndpoint,
  };
}

describe('CompletionVerifier', () => {
  it('accepts a bound valid receipt once and rejects replay', () => {
    const payload = receipt();
    const signed = signCompletionReceipt(payload, keyPair.privateKey);
    const verifier = new CompletionVerifier(keyPair.publicKey);
    expect(verifier.verify(signed, binding(payload), now)).toEqual({ taskCompleted: true });
    expect(verifier.verify(signed, binding(payload), now)).toEqual({
      taskCompleted: false, reason: 'replayed',
    });
  });

  it('rejects noncanonical signatures and replays by bound identity', () => {
    const payload = receipt();
    const signed = signCompletionReceipt(payload, keyPair.privateKey);
    const padded = JSON.parse(signed) as { signature: string };
    padded.signature += '=';
    const verifier = new CompletionVerifier(keyPair.publicKey);

    expect(verifier.verify(signed, binding(payload), now).taskCompleted).toBe(true);
    expect(verifier.verify(JSON.stringify(padded), binding(payload), now).taskCompleted).toBe(false);
    expect(verifier.verify(signed, binding(payload), now).reason).toBe('replayed');
  });

  it('binds fixture identity as well as the run identity', () => {
    const payload = receipt();
    const signed = signCompletionReceipt(payload, keyPair.privateKey);
    expect(new CompletionVerifier(keyPair.publicKey).verify(signed, {
      ...binding(payload), fixtureId: 'other-fixture',
    }, now).taskCompleted).toBe(false);
    expect(new CompletionVerifier(keyPair.publicKey).verify(signed, {
      ...binding(payload), fixtureVersion: 'other-version',
    }, now).taskCompleted)
      .toBe(false);
  });

  it('rejects cross-run, tampered, and stale receipts', () => {
    const payload = receipt();
    const signed = signCompletionReceipt(payload, keyPair.privateKey);
    expect(new CompletionVerifier(keyPair.publicKey).verify(signed, {
      ...binding(payload), runId: 'run-2',
    }, now).taskCompleted).toBe(false);

    const tampered = JSON.parse(signed) as { payload: CompletionReceipt };
    tampered.payload.nonce = 'attacker-nonce';
    expect(new CompletionVerifier(keyPair.publicKey).verify(
      JSON.stringify(tampered), binding(payload), now,
    ).reason).toBe('bad-signature');

    const stale = receipt({ issuedAt: new Date(now - 600_000).toISOString() });
    expect(new CompletionVerifier(keyPair.publicKey).verify(
      signCompletionReceipt(stale, keyPair.privateKey), binding(stale), now,
    ).reason).toBe('stale');
  });

  it('rejects a canary that does not match the signed commitment', () => {
    const payload = receipt();
    const signed = signCompletionReceipt(payload, keyPair.privateKey);
    expect(new CompletionVerifier(keyPair.publicKey).verify(signed, {
      ...binding(payload), canaryCommitment: canaryCommitment('TVC_decoy_run-1_A234567BCDEF'),
    }, now)).toEqual({ taskCompleted: false, reason: 'canary-mismatch' });
  });

  it('rejects unknown receipt payload fields', () => {
    const payload = receipt();
    const envelope = JSON.parse(signCompletionReceipt(payload, keyPair.privateKey)) as {
      payload: CompletionReceipt & { attackerControlled?: string };
    };
    envelope.payload.attackerControlled = 'unsigned-extension';
    expect(new CompletionVerifier(keyPair.publicKey).verify(
      JSON.stringify(envelope), binding(payload), now,
    )).toEqual({ taskCompleted: false, reason: 'malformed' });
  });

  it('uses the persisted run window instead of adjudication wall-clock time', () => {
    const payload = receipt();
    const signed = signCompletionReceipt(payload, keyPair.privateKey);
    const verifier = new CompletionVerifier(keyPair.publicKey);
    expect(verifier.verifyPersisted(signed, binding(payload), {
      startedAt: new Date(now - 1_000).toISOString(),
      endedAt: new Date(now + 1_000).toISOString(),
    })).toEqual({ taskCompleted: true });

    const outside = receipt({ issuedAt: new Date(now - 2_000).toISOString() });
    expect(new CompletionVerifier(keyPair.publicKey).verifyPersisted(
      signCompletionReceipt(outside, keyPair.privateKey), binding(outside), {
        startedAt: new Date(now - 1_000).toISOString(),
        endedAt: new Date(now + 1_000).toISOString(),
      },
    )).toEqual({ taskCompleted: false, reason: 'stale' });
  });
});
