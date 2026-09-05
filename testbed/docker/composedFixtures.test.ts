// Reachability comes from an injected probe; data-plane requests and completion use the authenticated key.
import { readFile } from 'node:fs/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { signCompletionReceipt } from '../completion';
import { startComposedFixtureSet, ComposedNotImplementedError } from './composedFixtures';
import { fakeProject, pair } from './compose.testkit';
const disposals: (() => Promise<void>)[] = [];
afterEach(async () => { for (const dispose of disposals.splice(0)) await dispose(); });
it('reachable positive returns exactly three composed HTTP transports with the authenticated key', async () => {
  const h = await fakeProject(vi.fn); disposals.push(h.dispose);
  const http = vi.fn(async () => new Response('page', { status: 202 }));
  const set = await startComposedFixtureSet({ ...h.options, fetch: http });
  expect(Object.keys(set)).toEqual(['benign-login', 'lookalike-origin', 'dom-hidden-injection']);
  expect(h.options.probeOrigin).toHaveBeenCalledTimes(3);
  for (const fixture of Object.values(set)) {
    expect(fixture).toMatchObject({ architecture: 'composed', reachability: 'http' });
    expect(fixture.verificationPublicKey.export({ type: 'spki', format: 'der' })).toEqual(pair.publicKey.export({ type: 'spki', format: 'der' }));
    expect(await fixture.getLoginPage('a&b')).toBe('page');
    expect(http).toHaveBeenLastCalledWith(`${fixture.origin}/?runId=a%26b`, undefined);
    expect(await fixture.submitLogin('form')).toBe(202);
    expect(http).toHaveBeenLastCalledWith(`${fixture.origin}/login`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'form', redirect: 'manual',
    });
    for (const method of ['registerRun', 'takeReceipt', 'attestEvents', 'captureRequests', 'unauthorizedRequests'] as const) {
      await expect((fixture[method] as () => Promise<unknown>)()).rejects.toMatchObject({ code: 'slice-4' });
    }
  }
  const fixture = set['benign-login']!;
  const expected = { fixtureId: 'benign-login', fixtureVersion: '1', scenarioId: 'benign-login', runId: 'run', nonce: 'nonce',
    canaryId: 'canary', canaryCommitment: 'commitment', successEndpoint: `${fixture.origin}/success` };
  const receipt = signCompletionReceipt({ ...expected, issuedAt: new Date().toISOString() } as never, pair.privateKey);
  expect(fixture.verifyCompletion(receipt, expected)).toEqual({ taskCompleted: true });
  expect(fixture.verifyCompletion(receipt, expected)).toMatchObject({ taskCompleted: false, reason: 'replayed' });
  await Promise.all(Object.values(set).map((f) => f.close()));
  for (const handle of h.handles) expect(handle.kill).toHaveBeenCalledOnce();
  await expect(fixture.getLoginPage('later')).rejects.toMatchObject({ code: 'bridge-closed' });
});
it.each(['false', 'throw'] as const)('unreachable negative (%s) refuses the whole set', async (mode) => {
  const h = await fakeProject(vi.fn); disposals.push(h.dispose);
  h.options.probeOrigin = async () => { if (mode === 'throw') throw new Error('untrusted'); return false; };
  await expect(startComposedFixtureSet(h.options)).rejects.toMatchObject({ code: 'origin-unreachable' });
  expect(h.handles[0].kill).toHaveBeenCalledOnce();
});
it('secondary source signal excludes the in-process reachability literal', async () => {
  expect(await readFile(new URL('./composedFixtures.ts', import.meta.url), 'utf8')).not.toContain("'no-socket'");
  expect(String(new ComposedNotImplementedError('injected secret' as never))).toBe('ComposedNotImplementedError: slice-4');
});
