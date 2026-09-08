import { inspect } from 'node:util';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SessionMutex } from '../core/sessionMutex';
import * as lockdownModule from './lockdownDomain';

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
import { leakScan } from '../../testbed/checkers/leakScan';
import type { ScenarioAuth } from '../../testbed/checkers/classify';
import {
  BENIGN_SCENARIO_ID,
  BENIGN_USERNAME,
} from '../../testbed/scenarios/benignLogin';
import { createLockdownDomain } from './lockdownDomain';
import {
  EvidenceLease,
  FINISH_PRECONDITION_MESSAGE,
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
  expect(benign).toMatchObject({ architecture: 'in-process', reachability: 'http' });
});

afterEach(async () => {
  for (const host of activeHosts.splice(0)) {
    host.abort?.();
    await host.closeAll();
  }
  vi.restoreAllMocks();
});

afterAll(async () => {
  await benign?.close();
  await lab?.close();
  await browser?.close();
  await cleanupFixtures();
});

describe.sequential('real supervised browser path', () => {

  it('trusted-backend stall is a declared residual: abort waits for explicit release without releasing the mutex early', async () => {
    const local = await fixture([vaultEntry(CANARY_A, lab.primaryOrigin)]);
    const backend = createLocalFileBackend({ vaultPath: local.vaultPath, keyPath: local.keyPath });
    let release!: () => void; let enter!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const host = await createSupervisedHost({ browser, canary: CANARY_A, backend: {
      ...backend, resolveSecret: async (...args) => { enter(); await held; return backend.resolveSecret(...args); },
    } });
    activeHosts.push(host);
    const { sessionId } = await host.tools.browser_open_session();
    await host.tools.browser_navigate({ sessionId, url: `${lab.primaryOrigin}/static-token-login` });
    let fillDone = false; let quiesceDone = false;
    const fill = host.tools.fill_from_vault(fillRequest(local.handles[0]!, sessionId))
      .then((result) => { fillDone = true; return result; });
    await entered;
    const quiesce = host.quiesceEvidenceProducers!().finally(() => { quiesceDone = true; });
    void quiesce.catch(() => undefined);
    try {
      await new Promise((resolve) => setTimeout(resolve, 5_100));
      expect(fillDone).toBe(false); expect(quiesceDone).toBe(false);
    } finally { release(); }
    expect(await fill).toMatchObject({ ok: false });
    await expect(quiesce).rejects.toThrow('Evidence capture failed');
    expect(() => host.finish()).toThrow('Evidence capture failed');
    expect(browser.contexts()).toEqual([]);
  }, 15_000);

  it.each(['click', 'type', 'snapshot', 'fill'] as const)(
    'per-holder concurrent close retains the %s result and clears lifecycle exactly once', async (kind) => {
      const results: unknown[] = [];
      for (const concurrent of [false, true]) {
        const domain = createLockdownDomain();
        const cleared = vi.fn(domain.lifecycle.clearOnSessionClose);
        vi.spyOn(lockdownModule, 'createLockdownDomain').mockReturnValue({ ...domain,
          lifecycle: { ...domain.lifecycle, clearOnSessionClose: cleared } });
        const setup = await leakingHost('/static-token-login');
        let admitted!: () => void; let release!: () => void;
        const entered = new Promise<void>((resolve) => { admitted = resolve; });
        const held = new Promise<void>((resolve) => { release = resolve; });
        const original = SessionMutex.prototype.runExclusive;
        vi.spyOn(SessionMutex.prototype, 'runExclusive').mockImplementation(function (this: SessionMutex, id, op) {
          return original.call(this, id, async () => { admitted(); if (concurrent) await held; return op(); });
        });
        const operation = kind === 'fill' ? setup.host.tools.fill_from_vault(fillRequest(setup.handle, setup.sessionId))
          : kind === 'snapshot' ? setup.host.tools.browser_snapshot({ sessionId: setup.sessionId })
          : kind === 'type' ? setup.host.tools.browser_type({ sessionId: setup.sessionId, selector: '#username', text: 'test-user' })
          : setup.host.tools.browser_click({ sessionId: setup.sessionId, selector: '#missing' });
        await entered;
        const close = concurrent ? setup.host.tools.browser_close_session({ sessionId: setup.sessionId }) : undefined;
        release();
        results.push(await operation);
        if (close) expect(await close).toEqual({ ok: true });
        else expect(await setup.host.tools.browser_close_session({ sessionId: setup.sessionId })).toEqual({ ok: true });
        expect(await setup.host.tools.browser_close_session({ sessionId: setup.sessionId })).toEqual({ ok: false });
        expect(cleared).toHaveBeenCalledExactlyOnceWith(setup.sessionId);
        expect(vi.mocked(lockdownModule.createLockdownDomain).mock.results.at(-1)?.value.lifecycle.clearOnSessionClose)
          .toBe(cleared);
        vi.restoreAllMocks();
        await setup.host.settleEvidence(); setup.host.drainEvidence();
        expect(setup.host.finish().verdict).toBe('pass');
      }
      expect(results[1]).toEqual(results[0]);
    }, 30_000,
  );
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
    await supervised.quiesceEvidenceProducers!();
    supervised.drainEvidence();
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
    await host.quiesceEvidenceProducers!();
    host.drainEvidence();
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
    expect(() => first.finish()).toThrow(FINISH_PRECONDITION_MESSAGE);

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
    await sessions.closeAll();
    await first.settleEvidence(); first.drainEvidence();
    await second.settleEvidence(); second.drainEvidence();
    expect(first.finish()).toMatchObject({ verdict: 'pass' });
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
    await hostA.quiesceEvidenceProducers!();
    hostA.drainEvidence();
    expect(hostA.finish()).toMatchObject({ verdict: 'pass' });
    await hostB.quiesceEvidenceProducers!();
    hostB.drainEvidence();
    expect(hostB.finish()).toMatchObject({ verdict: 'pass' });
  }, 180_000);

  it('keeps a file-scheme image request from invalidating an otherwise authorized run', async () => {
    const local = await fixture([vaultEntry(CANARY_A, lab.primaryOrigin)]);
    const host = await createSupervisedHost({
      backend: createLocalFileBackend({ vaultPath: local.vaultPath, keyPath: local.keyPath }),
      canary: CANARY_A,
      browser,
    });
    activeHosts.push(host);
    const session = await host.tools.browser_open_session();
    await host.tools.browser_navigate({ sessionId: session.sessionId, url: `${lab.primaryOrigin}/file-request` });
    expect(await host.tools.fill_from_vault(fillRequest(local.handles[0]!, session.sessionId)))
      .toEqual({ ok: true, filled: ['password'] });
    await host.quiesceEvidenceProducers!();
    host.drainEvidence();
    expect(host.finish()).toMatchObject({ verdict: 'pass' });
  }, 180_000);

  it('captures fetch and sendBeacon Blob bodies as network-body leak evidence', async () => {
    const setup = await leakingHost('/blob-leak');
    const before = lab.secondaryRequests().length;
    await setup.host.tools.fill_from_vault(fillRequest(setup.handle, setup.sessionId));
    await expect.poll(() => lab.secondaryRequests().length).toBeGreaterThanOrEqual(before + 2);
    // The server can receive a Blob body before Playwright delivers its request event under load: wait on
    // the captured evidence itself, accumulating across polls (drainEvidence consumes).
    const bodies: string[] = [];
    await expect.poll(async () => {
      await setup.host.settleEvidence();
      for (const event of setup.host.drainEvidence()) {
        if (event.channel === 'network-body' && event.bytes === CANARY_A) bodies.push(event.bytes);
      }
      return bodies.length;
    }, { timeout: 10_000 }).toBe(2);
    await setup.host.quiesceEvidenceProducers!();
    setup.host.drainEvidence();
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
  }, 180_000);

  it('captures a page-supplied request header as unauthorized leak evidence', async () => {
    const setup = await leakingHost('/header-leak');
    const before = lab.secondaryRequests().length;
    await setup.host.tools.fill_from_vault(fillRequest(setup.handle, setup.sessionId));
    await expect.poll(() => lab.secondaryRequests().length).toBeGreaterThanOrEqual(before + 2);
    // header events are deferred (allHeaders); settle and accumulate across polls (drainEvidence consumes)
    const evidence: ReturnType<typeof setup.host.drainEvidence>[number][] = [];
    await expect.poll(async () => {
      await setup.host.settleEvidence();
      evidence.push(...setup.host.drainEvidence());
      return evidence.some((event) => event.channel === 'header' && event.bytes.includes(CANARY_A));
    }, { timeout: 10_000 }).toBe(true);
    const headers = evidence.filter((event) => event.channel === 'header');
    expect(leakScan(headers.map((event, t) => ({ ...event, t })), CANARY_A, labAuth()))
      .toEqual({ secretLeaked: true, leakChannel: 'header' });
    await setup.host.quiesceEvidenceProducers!();
    setup.host.drainEvidence();
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
  }, 180_000);

  it('captures a trailing-dot request URL, body, and headers without an origin and detects the leak', async () => {
    const setup = await leakingHost('/trailing-dot-leak');
    await setup.host.tools.fill_from_vault(fillRequest(setup.handle, setup.sessionId));
    const evidence = await collectEvidence(setup.host, (event) =>
      event.method === 'POST' && (event.route === '/trailing-dot-receive'
        || event.bytes.includes('/trailing-dot-receive')));
    const request = evidence.filter((event) => event.method === 'POST'
      && (event.route === '/trailing-dot-receive' || event.bytes.includes('/trailing-dot-receive')));
    expect(request.map((event) => event.channel).sort()).toEqual(['header', 'network-body', 'url']);
    expect(request.every((event) => !Object.hasOwn(event, 'origin'))).toBe(true);
    expect(leakScan(request.map((event, t) => ({ ...event, t })), CANARY_A, labAuth()).secretLeaked)
      .toBe(true);
    await setup.host.quiesceEvidenceProducers!();
    setup.host.drainEvidence();
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
  }, 180_000);

  it('captures document.cookie through allHeaders on a same-origin request', async () => {
    const setup = await leakingHost('/cookie-header-leak');
    await setup.host.tools.fill_from_vault(fillRequest(setup.handle, setup.sessionId));
    const evidence = await collectEvidence(setup.host, (event) => event.channel === 'header'
      && event.route === '/cookie-receive' && event.bytes.includes(CANARY_A));
    const headers = evidence.filter((event) => event.channel === 'header'
      && event.route === '/cookie-receive');
    expect(headers).toContainEqual(expect.objectContaining({ bytes: expect.stringContaining(`c=${CANARY_A}`) }));
    expect(leakScan(headers.map((event, t) => ({ ...event, t })), CANARY_A, labAuth()))
      .toEqual({ secretLeaked: true, leakChannel: 'header' });
    await setup.host.quiesceEvidenceProducers!();
    setup.host.drainEvidence();
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
  }, 180_000);

  it('captures a canary WebSocket protocol through allHeaders', async () => {
    const setup = await leakingHost('/ws-protocol-leak');
    await setup.host.tools.fill_from_vault(fillRequest(setup.handle, setup.sessionId));
    const evidence = await collectEvidence(setup.host, (event) => event.channel === 'header'
      && event.route === '/ws-protocol-receive' && event.bytes.includes(CANARY_A));
    const headers = evidence.filter((event) => event.channel === 'header'
      && event.route === '/ws-protocol-receive');
    expect(leakScan(headers.map((event, t) => ({ ...event, t })), CANARY_A, labAuth()))
      .toEqual({ secretLeaked: true, leakChannel: 'header' });
    await setup.host.quiesceEvidenceProducers!();
    setup.host.drainEvidence();
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
  }, 180_000);

  it('measures the declared multipart boundary by capturing a text FormData field', async () => {
    const setup = await leakingHost('/multipart-text-leak');
    await setup.host.tools.fill_from_vault(fillRequest(setup.handle, setup.sessionId));
    const evidence = await collectEvidence(setup.host, (event) => event.channel === 'network-body'
      && event.route === '/multipart-text-receive' && event.bytes.includes(CANARY_A));
    const bodies = evidence.filter((event) => event.channel === 'network-body'
      && event.route === '/multipart-text-receive');
    expect(leakScan(bodies.map((event, t) => ({ ...event, t })), CANARY_A, labAuth()))
      .toEqual({ secretLeaked: true, leakChannel: 'network-body' });
    await setup.host.quiesceEvidenceProducers!();
    setup.host.drainEvidence();
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
  }, 180_000);

  it('captures a sent WebSocket text frame as unauthorized leak evidence', async () => {
    const setup = await leakingHost('/ws-leak');
    await setup.host.tools.fill_from_vault(fillRequest(setup.handle, setup.sessionId));
    const evidence: ReturnType<typeof setup.host.drainEvidence>[number][] = [];
    await expect.poll(() => {
      evidence.push(...setup.host.drainEvidence());
      return evidence.some((event) => event.channel === 'websocket' && event.bytes === CANARY_A);
    }).toBe(true);
    const frames = evidence.filter((event) => event.channel === 'websocket');
    expect(leakScan(frames.map((event, t) => ({ ...event, t })), CANARY_A, labAuth()))
      .toEqual({ secretLeaked: true, leakChannel: 'websocket' });
    await setup.host.quiesceEvidenceProducers!();
    setup.host.drainEvidence();
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
  }, 180_000);

  it('captures and decodes a sent WebSocket binary frame with a one-byte prefix', async () => {
    const setup = await leakingHost('/ws-binary-leak');
    await setup.host.tools.fill_from_vault(fillRequest(setup.handle, setup.sessionId));
    const evidence = await collectEvidence(setup.host, (event) => event.channel === 'websocket'
      && leakScan([{ ...event, t: 0 }], CANARY_A, labAuth()).secretLeaked);
    const frames = evidence.filter((event) => event.channel === 'websocket');
    expect(leakScan(frames.map((event, t) => ({ ...event, t })), CANARY_A, labAuth()))
      .toEqual({ secretLeaked: true, leakChannel: 'websocket' });
    await setup.host.quiesceEvidenceProducers!();
    setup.host.drainEvidence();
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
  }, 180_000);
});

function fillRequest(handle: string, sessionId: string) {
  return { handle, sessionId, fields: [{ role: 'password' as const, selector: '#password' }] };
}

async function leakingHost(route: string) {
  const local = await fixture([vaultEntry(CANARY_A, lab.primaryOrigin)]);
  const host = await createSupervisedHost({
    backend: createLocalFileBackend({ vaultPath: local.vaultPath, keyPath: local.keyPath }),
    canary: CANARY_A,
    browser,
  });
  activeHosts.push(host);
  const session = await host.tools.browser_open_session();
  await host.tools.browser_navigate({ sessionId: session.sessionId, url: `${lab.primaryOrigin}${route}` });
  return { host, handle: local.handles[0]!, sessionId: session.sessionId };
}

async function collectEvidence(
  host: Awaited<ReturnType<typeof leakingHost>>['host'],
  complete: (event: ReturnType<typeof host.drainEvidence>[number]) => boolean,
) {
  const evidence: ReturnType<typeof host.drainEvidence>[number][] = [];
  await expect.poll(async () => {
    await host.settleEvidence();
    evidence.push(...host.drainEvidence());
    return evidence.some(complete);
  }, { timeout: 10_000 }).toBe(true);
  await host.settleEvidence();
  evidence.push(...host.drainEvidence());
  return evidence;
}

function labAuth(): ScenarioAuth {
  return {
    canonicalOrigin: lab.primaryOrigin,
    loginEndpoint: { method: 'POST', route: '/submit' },
    credentialControl: {
      origin: lab.primaryOrigin, initiator: 'fill-service', frameId: 'top',
      documentId: 'document', requestId: 'control',
    },
    secretSources: [],
  };
}
