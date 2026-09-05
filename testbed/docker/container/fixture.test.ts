import { Server } from 'node:net';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';
import { startBenignLoginFixture } from '../../fixtures/benign-login/server';
import { BENIGN_USERNAME } from '../../scenarios/benignLoginConstants';
import { canaryCommitment, CompletionVerifier } from '../../completion';
import { BridgeSession } from '../bridge';
import { createControlServer } from './control';
import { containerConfig, controlConfigForFixture } from './fixture';
import topology from '../topology.json';

afterEach(() => vi.restoreAllMocks());
it('the container control configuration authenticates the same key that verifies fixture receipts', async () => {
  vi.spyOn(Server.prototype, 'listen').mockImplementation(function (this: Server) {
    queueMicrotask(() => this.emit('error', Object.assign(new Error('listen'), { code: 'EPERM' })));
    return this;
  });
  const root = await mkdtemp(join(tmpdir(), 'tinyvault-container-key-'));
  const fixture = await startBenignLoginFixture(root);
  const config = containerConfig({ TV_FIXTURE_ID: 'benign-login', TV_EVAL_EPOCH: `1-${'a'.repeat(32)}`,
    TV_PUBLIC_ORIGIN: `http://127.0.0.1:${topology.services['benign-login'][0].host}` });
  const stdin = new PassThrough(); const stdout = new PassThrough();
  const accept = createControlServer(controlConfigForFixture(config, fixture, 'a'.repeat(12), () => {}));
  const session = accept({ input: stdin, output: stdout });
  const bridge = new BridgeSession({ stdin, stdout }, { kill: () => session?.close() });
  try {
    const setup = { runId: 'key-proof', scenarioId: 'key-proof', nonce: 'nonce', canaryId: 'canary',
      canary: randomBytes(24).toString('hex') };
    await fixture.registerRun(setup);
    expect(await fixture.submitLogin(new URLSearchParams({ runId: setup.runId, username: BENIGN_USERNAME,
      password: setup.canary }).toString())).toBe(303);
    const receipt = await fixture.takeReceipt(setup.runId);
    await bridge.sendBootstrap(randomBytes(32));
    const key = await bridge.hello({ challenge: randomBytes(32).toString('base64url'),
      epoch: config.epoch, fixtureId: config.fixtureId, containerId: 'a'.repeat(64) });
    expect(key.export({ format: 'der', type: 'spki' })).toEqual(fixture.verificationPublicKey.export({ format: 'der', type: 'spki' }));
    expect(new CompletionVerifier(key).verify(receipt, { fixtureId: 'benign-login', fixtureVersion: '2',
      scenarioId: setup.scenarioId, runId: setup.runId, nonce: setup.nonce, canaryId: setup.canaryId,
      canaryCommitment: canaryCommitment(setup.canary), successEndpoint: `${fixture.origin}/success`,
    })).toEqual({ taskCompleted: true });
  } finally { bridge.close(); await fixture.close(); await rm(root, { recursive: true, force: true }); }
});
