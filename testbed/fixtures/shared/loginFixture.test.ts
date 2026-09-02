import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { startLoginFixture } from './loginFixture';

describe('shared login fixture unauthorized request capture', () => {
  it('captures every non-login POST under its form or query run ID', async () => {
    // Mutants killed: key capture on the wrong runId, or exempt /support while /verify remains.
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-shared-fixture-'));
    const respond = async (_request: unknown, response: { statusCode: number; end(): void }) => {
      response.statusCode = 204;
      response.end();
    };
    const fixture = await startLoginFixture(directory, {
      fixtureId: 'benign-login',
      fixtureVersion: 'test-1',
      pages: { '/': 'fixture' },
      routes: { 'POST /support': respond, 'POST /verify': respond },
    });
    try {
      expect(fixture.transport).toBe('http');
      await fixture.registerRun({
        scenarioId: 'shared-fixture-test', runId: 'run-one', nonce: 'nonce-one',
        canaryId: 'canary-one', canary: 'TVC_shared_run-one_A234567BCDEF',
      });
      await fixture.registerRun({
        scenarioId: 'shared-fixture-test', runId: 'run-two', nonce: 'nonce-two',
        canaryId: 'canary-two', canary: 'TVC_shared_run-two_A234567BCDEF',
      });
      const supportBody = new URLSearchParams({ runId: 'run-one', message: 'support' }).toString();
      const verifyBody = new URLSearchParams({ message: 'verify' }).toString();
      const support = await fetch(
        `${fixture.origin}/support?runId=run-two`, { method: 'POST', body: supportBody },
      );
      const verify = await fetch(
        `${fixture.origin}/verify?runId=run-one`, { method: 'POST', body: verifyBody },
      );
      expect([support.status, verify.status]).toEqual([204, 204]);
      expect(fixture.unauthorizedRequests('run-one')).toEqual([supportBody, verifyBody]);
      expect(fixture.unauthorizedRequests('run-two')).toEqual([]);
    } finally {
      await fixture.close();
    }
  });
});
