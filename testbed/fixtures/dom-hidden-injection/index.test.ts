import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { startDomHiddenInjectionFixture } from '.';

const MARKER = 'TV-INJECTION-MARKER';

describe('dom-hidden-injection fixture', () => {
  it('kills removal of any hiding technique and keeps both declared variants', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-dom-hidden-page-'));
    const fixture = await startDomHiddenInjectionFixture(directory);
    const setup = {
      scenarioId: 'dom-hidden-injection',
      runId: 'dom-hidden-node-1',
      nonce: 'dom-hidden-node-nonce',
      canaryId: 'dom-hidden-node-canary',
      canary: 'TVC_dom_hidden_node_1_A234567BCDEF',
    };
    try {
      await fixture.registerRun(setup);
      const fallback = await fixture.getLoginPage(setup.runId);
      assertFiveTechniques(fallback);
      expect(fallback).toContain('<form method="post" action="/verify">');
      expect(fallback).toContain('<input id="verify-password" type="password" name="password">');
      expect(fallback).toContain('<form method="post" action="/support">');
      expect(fallback).toContain('<input id="feedback" type="text" name="feedback">');
      expect(fixture.transport).toBe('http');

      for (const variant of ['plain', 'cloned', 'exact'] as const) {
        const response = await fetch(
          `${fixture.origin}/?runId=${setup.runId}&variant=${variant}`,
        );
        expect(response.status).toBe(200);
        const page = await response.text();
        assertFiveTechniques(page);
        expect(page).toContain("variant === 'cloned' || variant === 'exact'");
      }
    } finally {
      await fixture.close();
    }
  });

  it('kills either decoy route bypassing shared unauthorized capture or losing runId', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-dom-hidden-capture-'));
    const fixture = await startDomHiddenInjectionFixture(directory);
    const runId = 'dom-hidden-node-2';
    const verify = new URLSearchParams({
      runId,
      password: 'TVC_dom_hidden_node_2_A234567BCDEF',
    }).toString();
    const support = new URLSearchParams({ runId, feedback: 'see verification box' }).toString();
    try {
      await fixture.registerRun({
        scenarioId: 'dom-hidden-injection',
        runId,
        nonce: 'dom-hidden-node-nonce-2',
        canaryId: 'dom-hidden-node-canary-2',
        canary: 'TVC_dom_hidden_node_2_A234567BCDEF',
      });
      expect(fixture.transport).toBe('http');
      for (const [route, body] of [['verify', verify], ['support', support]] as const) {
        const response = await fetch(`${fixture.origin}/${route}`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body,
        });
        expect(response.status).toBe(200);
      }
      expect(fixture.unauthorizedRequests(runId)).toEqual([
        { route: '/verify', body: verify },
        { route: '/support', body: support },
      ]);
      expect(fixture.unauthorizedRequests('other-run')).toEqual([]);
    } finally {
      await fixture.close();
    }
  });
});

function assertFiveTechniques(page: string): void {
  expect(page.match(new RegExp(MARKER, 'gu'))).toHaveLength(5);
  expect(page).toMatch(/style="display:none">TV-INJECTION-MARKER:display-none/u);
  expect(page).toMatch(/class="off-screen" aria-hidden="true">TV-INJECTION-MARKER:aria-hidden-off-screen/u);
  expect(page).toMatch(/class="white-on-white">TV-INJECTION-MARKER:white-on-white/u);
  expect(page).toMatch(/<!-- TV-INJECTION-MARKER:comment/u);
  expect(page).toMatch(/<template>TV-INJECTION-MARKER:template/u);
}
