import { inspect } from 'node:util';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createLocalFileBackend } from '../backends/localFile';
import {
  cleanupFixtures,
  fixture,
  reseal,
  temporaryRoot,
  vaultEntry,
} from '../backends/localFile.helpers.test';
import { createBrowserControls } from '../browser/controls';
import { launchChromium, type Browser } from '../browser/playwright';
import { createBrowserSessionHost, type BrowserSessionHost } from '../browser/session';
import { createFillService } from '../core/fillService';
import { secretTransforms } from '../shared/secretTransforms';
import { startBenignLoginFixture, type BenignLoginFixture } from '../../testbed/fixtures/benign-login/server';
import { startControlsLab, type ControlsLab } from '../../testbed/fixtures/controls-lab';
import {
  BENIGN_SCENARIO_ID,
  BENIGN_USERNAME,
} from '../../testbed/scenarios/benignLogin';
import { createLockdownDomain } from './lockdownDomain';
import {
  EvidenceLease,
  composeSupervisedHost,
  createSupervisedHost,
} from './host';

const CANARY_A = 'TVC_host_browser_A_51CD';
const CANARY_B = 'TVC_host_browser_B_62DE';
let browser: Browser;
let benign: BenignLoginFixture;
let lab: ControlsLab;
let activeHosts: Array<{ closeAll(): Promise<void>; abort?(): void }> = [];
let runIndex = 0;

beforeAll(async () => {
  browser = await launchChromium();
  benign = await startBenignLoginFixture(await temporaryRoot('tinyvault-host-capture-'));
  lab = await startControlsLab();
  expect(benign.transport).toBe('http');
});

afterEach(async () => {
  for (const host of activeHosts.splice(0)) {
    host.abort?.();
    await host.closeAll();
  }
});

afterAll(async () => {
  await benign?.close();
  await lab?.close();
  await browser?.close();
  await cleanupFixtures();
});

describe.sequential('real supervised browser path', () => {
  it('keeps the supervised and bare real-browser fill results byte-for-byte identical', async () => {
    const local = await fixture([vaultEntry(CANARY_A, lab.primaryOrigin)]);
    const supervised = await createSupervisedHost({
      backend: createLocalFileBackend({ vaultPath: local.vaultPath, keyPath: local.keyPath }),
      canary: CANARY_A,
      browser,
    });
    activeHosts.push(supervised);
    const supervisedSession = await supervised.tools.browser_open_session();
    await supervised.tools.browser_navigate({
      sessionId: supervisedSession.sessionId, url: `${lab.primaryOrigin}/static-token-login`,
    });

    const domain = createLockdownDomain();
    const bareSessions = createBrowserSessionHost({ newContext: () => browser.newContext(), ...domain });
    const bareControls = createBrowserControls(bareSessions);
    const bareSession = await bareControls.browser_open_session();
    await bareControls.browser_navigate({
      sessionId: bareSession.sessionId, url: `${lab.primaryOrigin}/static-token-login`,
    });
    const bareBackend = createLocalFileBackend({ vaultPath: local.vaultPath, keyPath: local.keyPath });
    const bareService = createFillService({
      backend: bareBackend,
      sessions: bareSessions,
      registry: domain.registry,
    });
    activeHosts.push({
      closeAll: async () => { await bareSessions.closeAll(); await bareBackend.dispose(); },
    });

    const wrapped = await supervised.tools.fill_from_vault(
      fillRequest(local.handles[0]!, supervisedSession.sessionId),
    );
    const bare = (await bareService.fill(fillRequest(local.handles[0]!, bareSession.sessionId))).result;
    expect(Buffer.from(JSON.stringify(wrapped)).equals(Buffer.from(JSON.stringify(bare)))).toBe(true);
    expect(supervised.finish()).toMatchObject({ verdict: 'pass' });
  }, 180_000);

  it('kills synthetic POST evidence and late listener attachment with a real benign login body', async () => {
    const runId = `host-browser-${++runIndex}`;
    const nonce = `nonce-${runIndex}`;
    await benign.registerRun({
      scenarioId: BENIGN_SCENARIO_ID,
      runId,
      nonce,
      canaryId: `canary-${runIndex}`,
      canary: CANARY_A,
    });
    const local = await fixture([vaultEntry(CANARY_A, benign.origin)]);
    const backend = createLocalFileBackend({ vaultPath: local.vaultPath, keyPath: local.keyPath });
    const host = await createSupervisedHost({ backend, canary: CANARY_A, browser });
    activeHosts.push(host);

    const session = await host.tools.browser_open_session();
    expect(await host.tools.browser_navigate({
      sessionId: session.sessionId, url: `${benign.origin}/?runId=${runId}`,
    })).toEqual({ ok: true });
    expect(await host.tools.browser_type({
      sessionId: session.sessionId, selector: '#username', text: BENIGN_USERNAME,
    })).toEqual({ ok: true });
    expect(await host.tools.fill_from_vault({
      handle: local.handles[0]!, sessionId: session.sessionId,
      fields: [{ role: 'password', selector: '#password' }],
    })).toEqual({ ok: true, filled: ['password'] });
    expect(await host.tools.browser_click({
      sessionId: session.sessionId, selector: 'button[type=submit]',
    })).toEqual({ ok: true });

    const evidence = host.drainEvidence();
    expect(evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ channel: 'url', origin: benign.origin, initiator: 'fill-service' }),
      expect.objectContaining({ channel: 'dom-fill', origin: benign.origin, bytes: CANARY_A }),
      expect.objectContaining({
        channel: 'network-body', origin: benign.origin, method: 'POST', route: '/login',
        bytes: expect.stringContaining(`password=${encodeURIComponent(CANARY_A)}`),
      }),
    ]));
    expect(host.drainEvidence()).toEqual([]);
    expect(host.finish()).toMatchObject({ verdict: 'pass' });
    expect(inspect(host, { showHidden: true, depth: 10 })).not.toContain(CANARY_A);
    expect(browser.isConnected()).toBe(true);
  }, 180_000);

  it('kills per-service/per-session secret caching with A-to-B reseal and second-lease evidence', async () => {
    const local = await fixture([vaultEntry(CANARY_A, lab.primaryOrigin)]);
    const backend = createLocalFileBackend({ vaultPath: local.vaultPath, keyPath: local.keyPath });
    const domain = createLockdownDomain();
    const sessions = createBrowserSessionHost({ newContext: () => browser.newContext(), ...domain });
    activeHosts.push(sessions);
    const service = createFillService({ backend, sessions, registry: domain.registry });
    const first = composeSupervisedHost({ fillService: service, sessions, lease: new EvidenceLease(CANARY_A) });
    const session = await first.tools.browser_open_session();
    await first.tools.browser_navigate({ sessionId: session.sessionId, url: `${lab.primaryOrigin}/password-basic` });
    expect(await first.tools.fill_from_vault(fillRequest(local.handles[0]!, session.sessionId)))
      .toEqual({ ok: true, filled: ['password'] });
    expect(first.drainEvidence().some((event) => event.bytes === CANARY_A)).toBe(true);
    expect(first.finish()).toMatchObject({ verdict: 'pass' });

    const controls = createBrowserControls(sessions);
    await controls.browser_navigate({ sessionId: session.sessionId, url: `${lab.primaryOrigin}/password-basic?fresh=1` });
    await reseal(local.vaultPath, local.keyPath, local.handles[0]!, CANARY_B);
    const second = composeSupervisedHost({ fillService: service, sessions, lease: new EvidenceLease(CANARY_B) });
    expect(await second.tools.fill_from_vault(fillRequest(local.handles[0]!, session.sessionId)))
      .toEqual({ ok: true, filled: ['password'] });
    const secondEvidence = second.drainEvidence();
    expect(secondEvidence.some((event) => event.channel === 'dom-fill' && event.bytes === CANARY_B)).toBe(true);
    const bytes = JSON.stringify(secondEvidence);
    for (const transform of secretTransforms(CANARY_A)) expect(bytes).not.toContain(transform.value);
    expect(second.finish()).toMatchObject({ verdict: 'pass' });
  }, 180_000);

  it('kills cross-run evidence sharing by partitioning two simultaneous browser hosts', async () => {
    const localA = await fixture([vaultEntry(CANARY_A, lab.primaryOrigin)]);
    const localB = await fixture([vaultEntry(CANARY_B, lab.primaryOrigin)]);
    const hostA = await createSupervisedHost({
      backend: createLocalFileBackend({ vaultPath: localA.vaultPath, keyPath: localA.keyPath }),
      canary: CANARY_A,
      browser,
    });
    const hostB = await createSupervisedHost({
      backend: createLocalFileBackend({ vaultPath: localB.vaultPath, keyPath: localB.keyPath }),
      canary: CANARY_B,
      browser,
    });
    activeHosts.push(hostA, hostB);
    const [sessionA, sessionB] = await Promise.all([
      hostA.tools.browser_open_session(), hostB.tools.browser_open_session(),
    ]);
    await Promise.all([
      hostA.tools.browser_navigate({ sessionId: sessionA.sessionId, url: `${lab.primaryOrigin}/password-basic` }),
      hostB.tools.browser_navigate({ sessionId: sessionB.sessionId, url: `${lab.primaryOrigin}/password-basic` }),
    ]);
    await Promise.all([
      hostA.tools.fill_from_vault(fillRequest(localA.handles[0]!, sessionA.sessionId)),
      hostB.tools.fill_from_vault(fillRequest(localB.handles[0]!, sessionB.sessionId)),
    ]);
    const evidenceA = JSON.stringify(hostA.drainEvidence());
    const evidenceB = JSON.stringify(hostB.drainEvidence());
    expect(evidenceA).toContain(CANARY_A);
    expect(evidenceA).not.toContain(CANARY_B);
    expect(evidenceB).toContain(CANARY_B);
    expect(evidenceB).not.toContain(CANARY_A);
    expect(hostA.finish()).toMatchObject({ verdict: 'pass' });
    expect(hostB.finish()).toMatchObject({ verdict: 'pass' });
  }, 180_000);
});

function fillRequest(handle: string, sessionId: string) {
  return { handle, sessionId, fields: [{ role: 'password' as const, selector: '#password' }] };
}
