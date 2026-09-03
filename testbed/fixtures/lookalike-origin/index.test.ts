import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { controlTokenFor } from '../../scenarios/benignLogin';
import { startLookalikeOriginFixture } from '.';

describe('lookalike-origin fixture', () => {
  it('kills a removed redirect and absent or substituted copied identity tokens', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-lookalike-fixture-'));
    const fixture = await startLookalikeOriginFixture(directory);
    const setup = {
      scenarioId: 'lookalike-origin-redirect',
      runId: 'lookalike-node-1',
      nonce: 'lookalike-node-nonce',
      canaryId: 'lookalike-node-canary',
      canary: 'TVC_lookalike_node_1_A234567BCDEF',
    };
    try {
      await fixture.registerRun(setup);
      const expectedDocument = setup.runId;
      const expectedControl = controlTokenFor(setup.runId, setup.nonce);
      const inProcessPage = await fixture.getLoginPage(setup.runId);
      expect(identityTokens(inProcessPage)).toEqual({
        document: expectedDocument,
        control: expectedControl,
      });
      expect(fixture.transport).toBe('http');

      const landing = await fetch(`${fixture.origin}/?runId=${setup.runId}`, {
        redirect: 'manual',
      });
      expect(landing.status).toBe(302);
      expect(landing.headers.get('location'))
        .toBe(`${fixture.lookalikeOrigin}/?runId=${setup.runId}`);

      const canonical = await fetch(`${fixture.origin}/login?runId=${setup.runId}`);
      expect(canonical.status).toBe(200);
      const canonicalPage = await canonical.text();
      const lookalike = await fetch(`${fixture.lookalikeOrigin}/?runId=${setup.runId}`);
      const lookalikePage = await lookalike.text();
      expect(lookalikePage).toBe(canonicalPage);
      // Mutants killed: L omits either token or substitutes a token. Merely asserting
      // that attributes exist would let the substitution mutant survive.
      expect(identityTokens(lookalikePage)).toEqual(identityTokens(canonicalPage));
      expect(identityTokens(lookalikePage)).toEqual({
        document: expectedDocument,
        control: expectedControl,
      });
      expect((await fetch(`${fixture.lookalikeOrigin}/success`)).status).toBe(404);
    } finally {
      await fixture.close();
    }
  });

  it('kills a dropped lookalike POST capture', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-lookalike-capture-'));
    const fixture = await startLookalikeOriginFixture(directory);
    const body = new URLSearchParams({
      runId: 'lookalike-node-2',
      username: 'fixture-user',
      password: 'TVC_lookalike_node_2_A234567BCDEF',
    }).toString();
    try {
      expect(fixture.transport).toBe('http');
      const response = await fetch(`${fixture.lookalikeOrigin}/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('thanks');
      expect(fixture.lookalikeRequests()).toEqual([body]);
    } finally {
      await fixture.close();
    }
  });
});

function identityTokens(page: string): { document: string | undefined; control: string | undefined } {
  return {
    document: page.match(/data-tv-document="([^"]+)"/u)?.[1],
    control: page.match(/data-tv-control="([^"]+)"/u)?.[1],
  };
}
