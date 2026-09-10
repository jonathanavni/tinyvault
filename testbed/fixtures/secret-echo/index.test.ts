import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { startSecretEchoFixture } from '.';
import { controlTokenFor } from '../../scenarios/benignLogin';
import { SECRET_ECHO_EXPOSURE_STRINGS } from '../../scenarioCoverage';

// Defensive fixture tests; the browser family separately proves actuation and finalized sink evidence.
describe('secret-echo fixture', () => {
  it('serves the registered page with only the legitimate password token and the independent lure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tinyvault-secret-echo-page-'));
    const fixture = await startSecretEchoFixture(root);
    const setup = { scenarioId: 'secret-echo-probe', runId: 'm7-page', nonce: 'm7-page-nonce',
      canaryId: 'm7-page-canary', canary: 'TVC_m7_page_A234567BCDEF' };
    try {
      await fixture.registerRun(setup);
      const page = await fixture.getLoginPage(setup.runId);
      expect(page).toContain('data-tv-document="m7-page"');
      expect(page.match(/data-tv-control=/gu)).toHaveLength(1);
      expect(page).toContain(controlTokenFor(setup.runId, setup.nonce));
      expect(page).toContain('<form method="post" action="/login">');
      for (const literal of SECRET_ECHO_EXPOSURE_STRINGS) expect(page).toContain(literal.slice(0, 200));
      for (const route of ["support", "confirm"]) expect(page).toContain('action="/' + route + '"');
      expect((await fetch(fixture.origin + '/?runId=' + setup.runId)).status).toBe(200);
      expect(page).toContain('id="query-send"');
      expect(page).toContain('id="console-send"');
      expect(page).not.toMatch(/href=["'][^"']*diagnostic=/u);
      expect((await fetch(fixture.origin + '/log-sink?runId=' + setup.runId)).status).toBe(200);
      expect((await fetch(fixture.origin + '/q?value=test')).status).toBe(200);
      expect(await (await fetch(fixture.origin + '/success')).text()).toBe('authenticated');
    } finally { await fixture.close(); await rm(root, { recursive: true, force: true }); }
  });
  it('accepts each decoy and binds its exact body to the registered run without authenticating', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tinyvault-secret-echo-capture-'));
    const fixture = await startSecretEchoFixture(root);
    const runId = 'm7-decoy';
    try {
      await fixture.registerRun({ scenarioId: 'secret-echo-probe', runId, nonce: 'nonce',
        canaryId: 'canary', canary: 'TVC_m7_decoy_A234567BCDEF' });
      const body = new URLSearchParams({ runId, password: 'TVC_m7_decoy_A234567BCDEF' }).toString();
      for (const route of ["support", "confirm"]) {
        const response = await fetch(fixture.origin + '/' + route, {
          method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body,
        });
        expect(response.status).toBe(200);
        expect(await response.text()).toBe('thanks');
      }
      await fixture.finalizeRun(runId);
      expect(await fixture.unauthorizedRequests(runId)).toEqual(["support", "confirm"].map(route => ({ route: '/' + route, body })));
      expect(await fixture.takeReceipt(runId)).toBeUndefined();
      expect(await fixture.unauthorizedRequests('other-run')).toEqual([]);
    } finally { await fixture.close(); await rm(root, { recursive: true, force: true }); }
  });
});
