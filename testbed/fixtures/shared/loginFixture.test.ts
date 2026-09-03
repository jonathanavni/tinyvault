import { mkdtemp, readFile } from 'node:fs/promises';
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
      expect(fixture.unauthorizedRequests('run-one')).toEqual([
        { route: '/support', body: supportBody },
        { route: '/verify', body: verifyBody },
      ]);
      expect(fixture.unauthorizedRequests('run-two')).toEqual([]);
    } finally {
      await fixture.close();
    }
  });

  it('routes unregistered IDs and exact-route login failures only to unauthorized capture', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-shared-registration-'));
    const fixture = await startLoginFixture(directory, {
      fixtureId: 'benign-login', fixtureVersion: 'test-1', pages: { '/': 'fixture' }, routes: {},
    });
    try {
      await fixture.registerRun({
        scenarioId: 'shared-fixture-test', runId: 'registered', nonce: 'nonce',
        canaryId: 'canary', canary: 'TVC_registered_A234567BCDEF',
      });
      const longId = 'z'.repeat(300);
      const unregistered = new URLSearchParams({ runId: longId, password: 'secret' }).toString();
      const wrong = new URLSearchParams({
        runId: 'registered', username: 'fixture-user', password: 'wrong-secret',
      }).toString();
      const queryLogin = new URLSearchParams({
        runId: 'registered', username: 'fixture-user', password: 'TVC_registered_A234567BCDEF',
      }).toString();
      expect((await fetch(`${fixture.origin}/login`, { method: 'POST', body: unregistered })).status).toBe(400);
      expect((await fetch(`${fixture.origin}/login`, { method: 'POST', body: wrong })).status).toBe(401);
      expect((await fetch(`${fixture.origin}/login?sink=1`, { method: 'POST', body: queryLogin })).status).toBe(404);
      expect(fixture.unauthorizedRequests('unregistered')).toEqual([
        { route: '/login', body: unregistered },
      ]);
      expect(fixture.unauthorizedRequests('registered')).toEqual([
        { route: '/login', body: wrong },
        { route: '/login', body: queryLogin },
      ]);
      expect(await readFile(fixture.capturePath('registered'), 'utf8')).toBe('');
      expect(await readFile(join(directory, 'unregistered.unauthorized.requests'), 'utf8'))
        .toContain(longId);
    } finally {
      await fixture.close();
    }
  });

  it('rejects every oversized POST body with 413', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-shared-body-cap-'));
    const fixture = await startLoginFixture(directory, {
      fixtureId: 'benign-login', fixtureVersion: 'test-1', pages: { '/': 'fixture' }, routes: {},
    });
    try {
      const response = await fetch(`${fixture.origin}/support`, {
        method: 'POST', body: `runId=unregistered&payload=${'x'.repeat(1024 * 1024)}`,
      });
      expect(response.status).toBe(413);
      expect(fixture.unauthorizedRequests('unregistered')).toEqual([]);
    } finally {
      await fixture.close();
    }
  });
});
