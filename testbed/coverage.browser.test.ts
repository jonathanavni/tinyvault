import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Each gate test drives several real-browser sub-producers with a bounded settle-and-accumulate wait.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

import { createLocalFileBackend } from '../src/backends/localFile';
import { generateLocalVaultKey, writeLocalVault } from '../src/backends/localFileWriter';
import { launchChromium, type Browser } from '../src/browser/playwright';
import {
  createSupervisedHost,
  inspectSupervisedHostCaptureFailedForTest,
  type SupervisedHost,
} from '../src/supervisor/host';
import {
  BODY_UNAVAILABLE_MARKER,
  bodiesUnobserved,
  isUnavailableBodyMarker,
} from './checkers/bodiesUnobserved';
import { CHANNEL_COVERAGE } from './coverage';
import { startControlsLab, type ControlsLab } from './fixtures/controls-lab';
import { HARNESS_PRODUCERS, runHarnessGate } from './harnessGate';
import { persistOfflineInputs } from './runner';
import type { CapturedEvent, Channel, RunRecord } from './scorecard.schema';
import type { OfflineEvidenceManifest } from './checkers/offline';

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

  it('kills shared sub-producer canaries and paths for every channel', async () => {
    for (const channel of Object.keys(CHANNEL_COVERAGE) as Channel[]) {
      const producers = HARNESS_PRODUCERS.filter((producer) => producer.channel === channel);
      if (producers.length === 0) continue;
      const directories = producers.map(({ id }) => join(artifacts, 'harness-gate', channel, id));
      expect(new Set(directories).size).toBe(producers.length);
      const canaries = await Promise.all(directories.map(async (directory) => {
        const manifest = JSON.parse(await import('node:fs/promises').then(({ readFile }) =>
          readFile(join(directory, 'offline-evidence.json'), 'utf8'))) as OfflineEvidenceManifest;
        return manifest.runs[0]?.canary;
      }));
      expect(canaries.every((canary) => typeof canary === 'string')).toBe(true);
      expect(new Set(canaries).size).toBe(producers.length);
    }
  });

  it('lists only producers that actually passed a filtered gate run', async () => {
    const rows = await runHarnessGate({
      browser, lab, artifactDirectory: artifacts,
      channels: ['network-body'], producerIds: ['blob-leak'],
    });
    expect(rows[0]).toMatchObject({
      producers: ['blob-leak'],
      producerObservations: [{ producer: 'blob-leak', observed: 'body' }],
    });
  });

  it('fails when persistence redirects the stored run to another events file', async () => {
    await expect(runHarnessGate({
      browser, lab, artifactDirectory: artifacts, channels: ['url'],
      persist: async (directory, runs: RunRecord[], manifest: OfflineEvidenceManifest) => {
        const otherEventsPath = join(directory, 'other-events.json');
        await writeFile(otherEventsPath, '[]\n');
        await persistOfflineInputs(directory, [{ ...runs[0]!, eventsPath: otherEventsPath }], manifest);
      },
    })).rejects.toThrow('Harness coverage gate failed: url/query-leak');
  });

  it('requires a body from the nested-worker mechanism producer', async () => {
    const rows = await runHarnessGate({ browser, lab, artifactDirectory: artifacts, channels: ['network-body'] });
    const events = await import('node:fs/promises').then(({ readFile }) => readFile(
      join(artifacts, 'harness-gate', 'network-body', 'nested-worker-blob', 'events.json'), 'utf8',
    ));
    expect(events).toContain('/nested-worker-blob-receive');
    expect(rows[0]).toMatchObject({
      producerObservations: expect.arrayContaining([
        { producer: 'nested-worker-blob', observed: 'body' },
      ]),
    });
  });

  it('counts every one of 200 immediate worker POSTs as a body or marker', async () => {
    const before = lab.secondaryRequests().length;
    const setup = await captureRoute('/workers-200');
    await expect.poll(() => lab.secondaryRequests().slice(before).filter((request) =>
      request.path === '/workers-200-receive').length, { timeout: 20_000 }).toBe(200);
    await setup.host.settleEvidence();
    const events = setup.host.drainEvidence().filter((event) => event.channel === 'network-body'
      && event.route?.startsWith('/workers-200-receive') === true
      && (event.bytes === CANARY || isUnavailableBodyMarker({
        channel: event.channel, initiator: event.initiator, bytes: event.bytes,
      })));
    expect(events).toHaveLength(200);
  });

  it('treats rapid detach during setup as benign while a live worker body is captured', async () => {
    const setup = await captureRoute('/terminate-workers-20');
    const events = await collectUntil(setup.host, (all) => all.some((event) =>
      event.channel === 'network-body'
      && event.route === '/terminate-workers-live-receive'
      && event.bytes === CANARY));
    expect(events).toContainEqual(expect.objectContaining({
      channel: 'network-body', route: '/terminate-workers-live-receive', bytes: CANARY,
    }));
    expect(inspectSupervisedHostCaptureFailedForTest(setup.host)).toBe(false);
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
    hosts.splice(hosts.indexOf(setup.host), 1);
    await setup.host.closeAll();
  });

  it('does not invalidate capture when navigation detaches posting workers during setup', async () => {
    const setup = await captureRoute('/navigate-workers-20');
    await setup.host.settleEvidence();
    const events = setup.host.drainEvidence();
    expect(events.filter((event) => isUnavailableBodyMarker(event))
      .every((event) => event.channel === 'network-body')).toBe(true);
    expect(inspectSupervisedHostCaptureFailedForTest(setup.host)).toBe(false);
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
    hosts.splice(hosts.indexOf(setup.host), 1);
    await setup.host.closeAll();
  });

  it('keeps a busy click-created popup attach timeout diagnostic out of the log channel', async () => {
    const setup = await captureRoute('/busy-popup', false);
    await setup.host.tools.browser_click({ sessionId: setup.sessionId, selector: '#popup' });
    expect(await setup.host.tools.browser_navigate({
      sessionId: setup.sessionId, url: `${lab.primaryOrigin}/nowhere`,
    })).toEqual({ ok: true });
    const events = setup.host.drainEvidence();
    // Whether the popup's attach actually times out inside the 2 s barrier is timing (the busy loop may finish or
    // the acknowledgement may arrive first); the deterministic timeout path is covered by the fake-session test.
    // What must hold every run: the diagnostic, if any, is never on the `log` channel, the run is not invalidated.
    const timedOut = events.some((event) => event.initiator === 'harness-diagnostic'
      && event.bytes === 'x-tinyvault-popup-attach-timeout');
    process.stderr.write(`busy popup: attach timed out=${timedOut}\n`);
    expect(events.some((event) => event.channel === 'log'
      && event.bytes === 'x-tinyvault-popup-attach-timeout')).toBe(false);
    expect(inspectSupervisedHostCaptureFailedForTest(setup.host)).toBe(false);
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
    hosts.splice(hosts.indexOf(setup.host), 1);
    await setup.host.closeAll();
  });

  it('records a detach marker and one unobserved body for terminate-before-delivery', async () => {
    const before = lab.secondaryRequests().length;
    const setup = await captureRoute('/terminate-worker-slow');
    const events = await collectUntil(setup.host, (all) => all.some((event) =>
      event.initiator === 'harness-marker' && event.bytes === BODY_UNAVAILABLE_MARKER));
    expect(bodiesUnobserved(events)).toBe(1);
    expect(lab.secondaryRequests().slice(before).filter((request) =>
      request.path === '/terminate-worker-slow-receive')).toEqual([]);
  });

  it('kills a dropped detach marker after the fast endpoint received the canary', async () => {
    const before = lab.secondaryRequests().length;
    const setup = await captureRoute('/terminate-worker-fast');
    await expect.poll(() => lab.secondaryRequests().slice(before).some((request) =>
      request.path === '/terminate-worker-fast-receive' && request.body?.includes(CANARY))).toBe(true);
    // Either marker reason is a counted miss: `target-detached` (the child session saw the request but the worker
    // went away before the body was fetched) or `not-attached` (Playwright's resume won the attach race and no child
    // session saw it; the miss is correlated from Playwright's own request event — register C-B2). Mutant killed:
    // the marker dropped while the server holds the canary (the run would then hold neither body nor marker).
    const events = await collectUntil(setup.host, (all) => all.some((event) =>
      event.route === '/terminate-worker-fast-receive'
      && (event.bytes.includes(CANARY) || isUnavailableBodyMarker(event))));
    const bodyOrMarker = events.find((event) => event.route === '/terminate-worker-fast-receive'
      && (event.bytes.includes(CANARY) || isUnavailableBodyMarker(event)));
    expect(bodyOrMarker).toBeDefined();
    process.stderr.write(`terminate-fast after delivery: ${bodyOrMarker?.bytes.includes(CANARY) ? 'body' : bodyOrMarker?.bytes}\n`);
    if (bodyOrMarker !== undefined && !bodyOrMarker.bytes.includes(CANARY)) {
      expect(bodiesUnobserved(events)).toBe(1);
    }
  });

  // Spec E4 / probe round 3: a page closed while its worker's request is in flight. The request must have left
  // the worker before the close (the server saw it); afterwards the run must hold the body with no marker.
  it('holds the body when the page closes mid-request after delivery', async () => {
    const setup = await captureRoute('/page-close-worker', false);
    await expect.poll(() => lab.secondaryRequests().some((request) =>
      request.path === '/page-close-worker-receive'), { timeout: 10_000 }).toBe(true);
    await setup.host.tools.browser_close_session({ sessionId: setup.sessionId });
    await setup.host.settleEvidence();
    const events = setup.host.drainEvidence();
    const body = events.some((event) => event.channel === 'network-body'
      && event.route === '/page-close-worker-receive' && event.bytes === CANARY);
    const markers = bodiesUnobserved(events.filter((event) =>
      event.route === '/page-close-worker-receive').map((event, index) => ({ ...event, t: index })));
    // C-B2f1: this delayed mechanism producer must hold the body after confirmed delivery. A marker is a finding.
    process.stderr.write(`page-close after delivery: body=${body} markers=${markers}\n`);
    expect(body).toBe(true);
    expect(markers).toBe(0);
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
    hosts.splice(hosts.indexOf(setup.host), 1);
    await setup.host.closeAll();
  });

  it('counts or captures an eager worker body from a click-created popup', async () => {
    const setup = await captureRoute('/popup-worker', false);
    await setup.host.tools.browser_click({ sessionId: setup.sessionId, selector: '#popup' });
    await expect.poll(() => lab.secondaryRequests().some((request) =>
      request.path === '/popup-worker-receive' && request.body?.includes(CANARY))).toBe(true);
    await setup.host.settleEvidence();
    const events = setup.host.drainEvidence();
    const observed = events.some((event) => event.channel === 'network-body'
      && event.route === '/popup-worker-receive' && event.bytes.includes(CANARY));
    process.stderr.write(`M5-C5 popup worker body observed: ${observed}\n`);
    expect(inspectSupervisedHostCaptureFailedForTest(setup.host)).toBe(false);
    const marker = events.some((event) => event.route === '/popup-worker-receive'
      && isUnavailableBodyMarker(event));
    expect(observed || marker).toBe(true);
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
    hosts.splice(hosts.indexOf(setup.host), 1);
    await setup.host.closeAll();
  });

  it('reports body-or-marker for the immediate page-close race case', async () => {
    const before = lab.secondaryRequests().length;
    const setup = await captureRoute('/page-close-worker-race', false);
    await expect.poll(() => lab.secondaryRequests().slice(before).some((request) =>
      request.path === '/page-close-worker-race-receive' && request.body?.includes(CANARY))).toBe(true);
    await setup.host.tools.browser_close_session({ sessionId: setup.sessionId });
    await setup.host.settleEvidence();
    const events = setup.host.drainEvidence();
    const body = events.some((event) => event.route === '/page-close-worker-race-receive'
      && event.initiator === 'browser' && event.bytes === CANARY);
    const marker = events.some((event) => event.route === '/page-close-worker-race-receive'
      && isUnavailableBodyMarker(event));
    process.stderr.write(`page-close immediate race: observed=${body ? 'body' : 'marker'}\n`);
    expect(body || marker).toBe(true);
  });

  it('counts every one of 200 immediate QUERY worker bodies or exact markers', async () => {
    const before = lab.secondaryRequests().length;
    const setup = await captureRoute('/query-workers-200');
    await expect.poll(() => lab.secondaryRequests().slice(before).filter((request) =>
      request.method === 'QUERY' && request.path === '/query-workers-200-receive').length,
    { timeout: 20_000 }).toBe(200);
    await setup.host.settleEvidence();
    const events = setup.host.drainEvidence().filter((event) =>
      event.channel === 'network-body'
      && event.route?.startsWith('/query-workers-200-receive') === true
      && (event.bytes === CANARY || isUnavailableBodyMarker(event)));
    expect(events).toHaveLength(200);
  });

  it('captures or marks a script-opened popup main-thread Blob POST', async () => {
    const before = lab.secondaryRequests().length;
    const setup = await captureRoute('/popup-blob', false);
    await expect.poll(() => lab.secondaryRequests().slice(before).some((request) =>
      request.path === '/popup-blob-receive' && request.body?.includes(CANARY))).toBe(true);
    await setup.host.settleEvidence();
    const events = setup.host.drainEvidence();
    expect(events.some((event) => event.route === '/popup-blob-receive'
      && (event.bytes === CANARY || isUnavailableBodyMarker(event)))).toBe(true);
    expect(inspectSupervisedHostCaptureFailedForTest(setup.host)).toBe(false);
  });

  it('keeps both self-closing popup shapes benign and the parent session usable', async () => {
    for (const route of ['/close-about-blank', '/self-closing-popup']) {
      const setup = await captureRoute(route, false);
      await setup.host.settleEvidence();
      expect(inspectSupervisedHostCaptureFailedForTest(setup.host)).toBe(false);
      expect(await setup.host.tools.browser_navigate({
        sessionId: setup.sessionId, url: `${lab.primaryOrigin}/nowhere`,
      })).toEqual({ ok: true });
    }
  });

  it('records empty sendBeacon data as an empty body with no marker', async () => {
    const setup = await captureRoute('/empty-beacon', false);
    await setup.host.settleEvidence();
    const events = setup.host.drainEvidence().filter((event) => event.route === '/empty-beacon-receive');
    expect(events).toContainEqual(expect.objectContaining({
      channel: 'network-body', initiator: 'browser', bytes: '',
    }));
    expect(events.some((event) => isUnavailableBodyMarker(event))).toBe(false);
  });

  it('does not mint markers for bodyless POST and DELETE requests', async () => {
    // The bodyless fetches fire synchronously from the fill's input event, so the evidence must be kept (draining
    // right after the fill discarded their url events and the poll below waited for nothing — integrator).
    const setup = await captureRoute('/bodyless-methods');
    const events = await collectUntil(setup.host, (all) => ['/bodyless-post', '/bodyless-delete'].every((route) =>
      all.some((event) => event.channel === 'url' && event.bytes === `${lab.primaryOrigin}${route}`)));
    const bodyEvents = events.filter((event) => event.channel === 'network-body'
      && (event.route === '/bodyless-post' || event.route === '/bodyless-delete'));
    expect(bodyEvents).toEqual([]);
    expect(bodiesUnobserved(events)).toBe(0);
  });
});

async function assertChannel(channel: Channel): Promise<void> {
  const rows = await runHarnessGate({ browser, lab, artifactDirectory: artifacts, channels: [channel] });
  const coverage = CHANNEL_COVERAGE[channel];
  if (coverage.status !== 'instrumented') throw new Error(`Expected instrumented channel: ${channel}`);
  expect(rows).toMatchObject([{
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
