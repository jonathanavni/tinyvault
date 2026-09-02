import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { startBenignLoginFixture, verifyEventsDigest } from './server';
import { canaryCommitment, signCompletionReceipt } from '../../completion';
import type { CompletionReceipt } from '../../scorecard.schema';
import { controlTokenFor } from '../../scenarios/benignLogin';

describe('benign login fixture', () => {
  it('kills static control identity while retaining capture and out-of-band receipt behavior', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-fixture-'));
    const fixture = await startBenignLoginFixture(directory);
    const setup = {
      scenarioId: 'benign-login-control',
      runId: 'fixture-run-1',
      nonce: 'fixture-nonce',
      canaryId: 'fixture-canary-id',
      canary: 'TVC_fixture_fixture-run-1_A234567BCDEF',
    };

    try {
      await fixture.registerRun(setup);
      const loginPage = await fixture.getLoginPage(setup.runId);
      expect(loginPage).toContain('<form method="post" action="/login">');
      expect(loginPage).toContain(`data-tv-document="${setup.runId}"`);
      expect(loginPage).toContain(`data-tv-control="${controlTokenFor(setup.runId, setup.nonce)}"`);
      const unregisteredPage = await fixture.getLoginPage('unregistered-run');
      expect(unregisteredPage).not.toContain('data-tv-document=');
      expect(unregisteredPage).not.toContain('data-tv-control=');
      expect(loginPage).not.toContain('{{TV_');
      const body = new URLSearchParams({
        runId: setup.runId, username: 'fixture-user', password: setup.canary,
      }).toString();
      expect(await fixture.submitLogin(body)).toBe(303);
      const signed = fixture.takeReceipt(setup.runId);
      expect(fixture.verifyCompletion(signed, {
        fixtureId: 'benign-login',
        fixtureVersion: '2',
        scenarioId: setup.scenarioId,
        runId: setup.runId,
        nonce: setup.nonce,
        canaryId: setup.canaryId,
        canaryCommitment: canaryCommitment(setup.canary),
        successEndpoint: `${fixture.origin}/success`,
      }).taskCompleted).toBe(true);
      expect(await readFile(fixture.capturePath(setup.runId), 'utf8')).toContain(setup.canary);
      const eventsBytes = Buffer.from('[{"t":0,"bytes":"fixture-events"}]\n');
      expect(() => fixture.attestEvents('unregistered-run', eventsBytes))
        .toThrow('Cannot attest unknown fixture run: unregistered-run');
      const attestation = fixture.attestEvents(setup.runId, eventsBytes);
      expect(verifyEventsDigest(
        attestation, setup.runId, eventsBytes, fixture.verificationPublicKey,
      )).toBe(true);
      expect(verifyEventsDigest(
        attestation, setup.runId, Buffer.from('[]\n'), fixture.verificationPublicKey,
      )).toBe(false);
      expect(verifyEventsDigest(
        attestation, 'other-run', eventsBytes, fixture.verificationPublicKey,
      )).toBe(false);
    } finally {
      await fixture.close();
    }
  });

  it('kills exposed signing material and runner-forged receipt acceptance', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-fixture-boundary-'));
    const fixture = await startBenignLoginFixture(directory);
    try {
      expect(fixture.verificationPublicKey.type).toBe('public');
      expect(Object.getOwnPropertyNames(fixture).some((name) => /private|signing/i.test(name)))
        .toBe(false);
      const payload: CompletionReceipt = {
        fixtureId: 'benign-login', fixtureVersion: '2', scenarioId: 'benign-login-control',
        runId: 'forged-run', nonce: 'forged-nonce', canaryId: 'forged-canary',
        canaryCommitment: canaryCommitment('TVC_forged_forged-run_A234567BCDEF'),
        successEndpoint: `${fixture.origin}/success`, issuedAt: new Date().toISOString(),
      };
      const attacker = generateKeyPairSync('ed25519');
      const forged = signCompletionReceipt(
        payload,
        attacker.privateKey,
      );
      expect(fixture.verifyCompletion(forged, {
        fixtureId: payload.fixtureId,
        fixtureVersion: payload.fixtureVersion,
        scenarioId: payload.scenarioId,
        runId: payload.runId,
        nonce: payload.nonce,
        canaryId: payload.canaryId,
        canaryCommitment: payload.canaryCommitment,
        successEndpoint: payload.successEndpoint,
      }).taskCompleted).toBe(false);
    } finally {
      await fixture.close();
    }
  });
});
