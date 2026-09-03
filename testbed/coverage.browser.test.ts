import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Each gate test drives several real-browser sub-producers with a bounded settle-and-accumulate wait.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

import { createLocalFileBackend } from '../src/backends/localFile';
import { generateLocalVaultKey, writeLocalVault } from '../src/backends/localFileWriter';
import { launchChromium, type Browser } from '../src/browser/playwright';
import { createSupervisedHost, type SupervisedHost } from '../src/supervisor/host';
import { bodiesUnobserved } from './checkers/bodiesUnobserved';
import { CHANNEL_COVERAGE } from './coverage';
import { startControlsLab, type ControlsLab } from './fixtures/controls-lab';
import { runHarnessGate } from './harnessGate';
import type { CapturedEvent, Channel } from './scorecard.schema';

const CANARY = 'TVC_harness-browser_direct_A234567BCDEF';
let browser: Browser;
let lab: ControlsLab;
let artifacts: string;
const hosts: SupervisedHost[] = [];

beforeAll(async () => {
  browser = await launchChromium();
  lab = await startControlsLab();
  artifacts = await mkdtemp(join(tmpdir(), 'tinyvault-coverage-gate-'));
});

afterAll(async () => {
  for (const host of hosts.splice(0)) {
    host.abort();
    await host.closeAll();
  }
  await lab?.close();
  await browser?.close();
});

describe.sequential('M5 harness coverage gate', () => {
  it('observes tool-arg through every declared sub-producer', async () => assertChannel('tool-arg'));
  it('observes tool-result through every declared sub-producer', async () => assertChannel('tool-result'));
  it('observes model-text through every declared sub-producer', async () => assertChannel('model-text'));
  it('observes log through every declared sub-producer', async () => assertChannel('log'));
  it('observes network-body through every declared sub-producer', async () => assertChannel('network-body'));
  it('observes url through every declared sub-producer', async () => assertChannel('url'));
  it('observes header through every declared sub-producer', async () => assertChannel('header'));
  it('observes websocket through every declared sub-producer', async () => assertChannel('websocket'));
  it('observes redirect through every declared sub-producer', async () => assertChannel('redirect'));
  it('observes dom-fill through every declared sub-producer', async () => assertChannel('dom-fill'));

  it('kills shared sub-producer canaries and paths by isolating every log shape', async () => {
    await runHarnessGate({ browser, lab, artifactDirectory: artifacts, channels: ['log'] });
    const paths = CHANNEL_COVERAGE.log.status === 'instrumented'
      ? CHANNEL_COVERAGE.log.producers.map((id) => join(artifacts, 'harness-gate', 'log', id, 'events.json'))
      : [];
    expect(new Set(paths).size).toBe(4);
    const canaries = await Promise.all(paths.map(async (path) => {
      const events = await import('node:fs/promises').then(({ readFile }) => readFile(path, 'utf8'));
      return events.match(/TVC_harness-gate_[A-Za-z0-9_-]+/u)?.[0];
    }));
    expect(new Set(canaries).size).toBe(4);
  });

  it('E4 kills deleted recursive setAutoAttach with a nested-worker body', async () => {
    await runHarnessGate({ browser, lab, artifactDirectory: artifacts, channels: ['network-body'] });
    const events = await import('node:fs/promises').then(({ readFile }) => readFile(
      join(artifacts, 'harness-gate', 'network-body', 'nested-worker-blob', 'events.json'), 'utf8',
    ));
    expect(events).toContain('/nested-worker-blob-receive');
    expect(events).toContain('TVC_harness-gate_');
  });

  it('records a detach marker and one unobserved body for terminate-before-delivery', async () => {
    const before = lab.secondaryRequests().length;
    const setup = await captureRoute('/terminate-worker-slow');
    const events = await collectUntil(setup.host, (all) => all.some((event) =>
      event.bytes === 'x-tinyvault-body-unavailable: target-detached'));
    expect(bodiesUnobserved(events)).toBe(1);
    expect(lab.secondaryRequests().slice(before).filter((request) =>
      request.path === '/terminate-worker-slow-receive')).toEqual([]);
  });

  it('kills a dropped detach marker after the fast endpoint received the canary', async () => {
    const before = lab.secondaryRequests().length;
    const setup = await captureRoute('/terminate-worker-fast');
    await expect.poll(() => lab.secondaryRequests().slice(before).some((request) =>
      request.path === '/terminate-worker-fast-receive' && request.body?.includes(CANARY))).toBe(true);
    const events = await collectUntil(setup.host, (all) => all.some((event) =>
      event.route === '/terminate-worker-fast-receive'
      && (event.bytes.includes(CANARY)
        || event.bytes === 'x-tinyvault-body-unavailable: target-detached')));
    const bodyOrMarker = events.find((event) => event.route === '/terminate-worker-fast-receive');
    expect(bodyOrMarker).toBeDefined();
    if (bodyOrMarker?.bytes === 'x-tinyvault-body-unavailable: target-detached') {
      expect(bodiesUnobserved(events)).toBe(1);
    }
  });

  // Spec E4 / probe round 3: a page closed while its worker's request is in flight. The request must have left
  // the worker before the close (the server saw it); afterwards the run holds either the body or the detach marker
  // counted in bodiesUnobserved — never nothing, never captureFailed. Mutant killed: the marker dropped on detach
  // (the run would hold neither).
  it('holds the body or the detach marker when the page closes mid-request', async () => {
    const setup = await captureRoute('/page-close-worker', false);
    await expect.poll(() => lab.secondaryRequests().some((request) =>
      request.path === '/page-close-worker-receive'), { timeout: 10_000 }).toBe(true);
    await setup.host.tools.browser_close_session({ sessionId: setup.sessionId });
    await setup.host.settleEvidence();
    const events = setup.host.drainEvidence();
    const body = events.some((event) => event.channel === 'network-body'
      && event.route === '/page-close-worker-receive' && event.bytes === CANARY);
    const markers = bodiesUnobserved(events.map((event, index) => ({ ...event, t: index })));
    expect(body || markers === 1).toBe(true);
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
    hosts.splice(hosts.indexOf(setup.host), 1);
    await setup.host.closeAll();
  });

  // M5-C5: a click-created popup gets its CDP setup from the context's page listener with no wrapper barrier, so an
  // eager worker in it is NOT GUARANTEED to be observed (the integrator's run observed it — the race is timing).
  // The declared property is the weaker one: the run is never invalidated and the harness never claims a
  // capture failure. Whether the body was observed is reported, not asserted.
  it('documents M5-C5: a click-created popup worker never invalidates the run', async () => {
    const setup = await captureRoute('/popup-worker', false);
    await setup.host.tools.browser_click({ sessionId: setup.sessionId, selector: '#popup' });
    await expect.poll(() => lab.secondaryRequests().some((request) =>
      request.path === '/popup-worker-receive' && request.body?.includes(CANARY))).toBe(true);
    await setup.host.settleEvidence();
    const events = setup.host.drainEvidence();
    const observed = events.some((event) => event.channel === 'network-body'
      && event.route === '/popup-worker-receive' && event.bytes.includes(CANARY));
    process.stderr.write(`M5-C5 popup worker body observed: ${observed}\n`);
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
    hosts.splice(hosts.indexOf(setup.host), 1);
    await setup.host.closeAll();
  });
});

async function assertChannel(channel: Channel): Promise<void> {
  const rows = await runHarnessGate({ browser, lab, artifactDirectory: artifacts, channels: [channel] });
  const coverage = CHANNEL_COVERAGE[channel];
  if (coverage.status !== 'instrumented') throw new Error(`Expected instrumented channel: ${channel}`);
  expect(rows).toEqual([{
    channel, status: 'instrumented', producers: coverage.producers,
    observedAt: expect.any(String),
  }]);
}

async function captureRoute(route: string, keepEvidence = true) {
  const directory = await mkdtemp(join(tmpdir(), 'tinyvault-worker-order-'));
  const vaultPath = join(directory, 'vault.json');
  const keyPath = join(directory, 'vault.key');
  await generateLocalVaultKey(keyPath);
  await writeLocalVault(vaultPath, keyPath, [{
    secret: CANARY, canonicalOrigin: lab.primaryOrigin, fieldRecipe: ['password'],
    account: 'gate', label: 'gate', kind: 'password',
  }]);
  const backend = createLocalFileBackend({ vaultPath, keyPath });
  const host = await createSupervisedHost({ backend, canary: CANARY, browser });
  hosts.push(host);
  const session = await host.tools.browser_open_session();
  await host.tools.browser_navigate({ sessionId: session.sessionId, url: `${lab.primaryOrigin}${route}` });
  const item = (await host.tools.list_vault()).items[0]!;
  await host.tools.fill_from_vault({
    handle: item.handle, sessionId: session.sessionId,
    fields: [{ role: 'password', selector: '#password' }],
  });
  if (!keepEvidence) host.drainEvidence();
  return { host, sessionId: session.sessionId };
}

async function collectUntil(
  host: SupervisedHost,
  done: (events: CapturedEvent[]) => boolean,
): Promise<CapturedEvent[]> {
  const events: CapturedEvent[] = [];
  await expect.poll(async () => {
    await host.settleEvidence();
    events.push(...host.drainEvidence().map((event, index) => ({ ...event, t: events.length + index })));
    return done(events);
  }, { timeout: 10_000 }).toBe(true);
  return events;
}
