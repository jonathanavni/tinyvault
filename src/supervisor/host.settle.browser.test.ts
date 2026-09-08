import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CredentialBackend } from '../backends/backend';
import {
  launchChromium,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Page,
} from '../browser/playwright';
import { startControlsLab, type ControlsLab } from '../../testbed/fixtures/controls-lab';
import { createSupervisedHost, type SupervisedHost } from './host';

const CANARY = 'TVC_host_settle_browser_4D71';
const ROUTE = '/settle-generation';
const backend: CredentialBackend = {
  listItems: async () => [],
  probeAvailability: async () => ({ available: true }),
  resolvePolicy: async () => { throw new Error('unused'); },
  resolveSecret: async () => { throw new Error('unused'); },
  dispose: async () => undefined,
};

let browser: Browser;
let lab: ControlsLab;
let activeHosts: SupervisedHost[] = [];

beforeAll(async () => {
  browser = await launchChromium();
  lab = await startControlsLab();
});

afterEach(async () => {
  for (const host of activeHosts.splice(0)) {
    host.abort();
    await host.closeAll();
  }
  vi.restoreAllMocks();
});

afterAll(async () => {
  await lab?.close();
  await browser?.close();
});

describe.sequential('ordinary real-host evidence settlement', () => {
  it('returns after three deferred-body generations while preserving a held fourth generation', async () => {
    const markers = ['settle-four-1', 'settle-four-2', 'settle-four-3', 'settle-four-4'];
    const producer = generationProducer(markers);
    const setup = await setupHost(producer.decorate);
    await issueBody(setup.page, markers[0]!);
    await producer.started[0]!.promise;

    const settling = setup.host.settleEvidence();
    try {
      await releaseGenerations(producer, 3);
      expect(await settlesBefore(settling, 5_000)).toBe('settled');
      expect(producer.startedCount()).toBe(4);
      expect(producer.completedCount()).toBe(3);
    } finally {
      producer.release[3]!.resolve();
      await settling;
    }

    await producer.completed[3]!.promise;
    expect(await setup.host.tools.browser_close_session(setup.session)).toEqual({ ok: true });
    await setup.host.settleEvidence();
    const evidence = setup.host.drainEvidence();
    const deferredEvidence = evidence.filter((event) => event.channel === 'network-body' && event.route === ROUTE);
    const bodies = bodyMarkers(evidence);
    expect(deferredEvidence).toHaveLength(4);
    expect(bodies).toEqual(expect.arrayContaining(markers.slice(0, 3)));
    expect(bodies.includes(markers[3]!) || evidence.some((event) => event.channel === 'network-body'
      && event.route === ROUTE && event.initiator === 'harness-marker'
      && event.bytes.startsWith('x-tinyvault-body-unavailable:'))).toBe(true);
    expect(setup.host.finish().verdict).toBe('pass');
  }, 15_000);

  it('settles three deferred-body generations fully with every body preserved', async () => {
    const markers = ['settle-three-1', 'settle-three-2', 'settle-three-3'];
    const producer = generationProducer(markers);
    const setup = await setupHost(producer.decorate);
    await issueBody(setup.page, markers[0]!);
    await producer.started[0]!.promise;

    const settling = setup.host.settleEvidence();
    await releaseGenerations(producer, 3);
    await settling;
    expect(producer.startedCount()).toBe(3);
    expect(producer.completedCount()).toBe(3);
    expect(bodyMarkers(setup.host.drainEvidence())).toEqual(expect.arrayContaining(markers));

    expect(await setup.host.tools.browser_close_session(setup.session)).toEqual({ ok: true });
    await setup.host.settleEvidence();
    setup.host.drainEvidence();
    expect(setup.host.finish().verdict).toBe('pass');
  }, 15_000);
});

type Deferred = Readonly<{ promise: Promise<void>; resolve(): void }>;

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function generationProducer(markers: readonly string[]) {
  const started = markers.map(deferred);
  const release = markers.map(deferred);
  const completed = markers.map(deferred);
  let startedCount = 0;
  let completedCount = 0;
  const capture = async (native: Promise<{ postData: string }>, page: Page) => {
    const index = startedCount++;
    started[index]!.resolve();
    const body = await native;
    await release[index]!.promise;
    if (index + 1 < markers.length) {
      await issueBody(page, markers[index + 1]!);
      await started[index + 1]!.promise;
    }
    completedCount += 1;
    completed[index]!.resolve();
    return body;
  };
  return {
    started, release, completed,
    startedCount: () => startedCount,
    completedCount: () => completedCount,
    decorate: (context: BrowserContext) => forceDeferredBody(context, capture),
  };
}

async function setupHost(decorate: (context: BrowserContext) => void) {
  const newContext = browser.newContext.bind(browser);
  vi.spyOn(browser, 'newContext').mockImplementation(async (...args) => {
    const context = await newContext(...args);
    decorate(context);
    return context;
  });
  const host = await createSupervisedHost({ browser, backend, canary: CANARY });
  activeHosts.push(host);
  const session = await host.tools.browser_open_session();
  const page = browser.contexts()[0]!.pages()[0]!;
  expect(await host.tools.browser_navigate({ ...session, url: `${lab.primaryOrigin}/controls` }))
    .toEqual({ ok: true });
  expect(await host.tools.browser_snapshot(session)).toMatchObject({ ok: true });
  await host.settleEvidence();
  host.drainEvidence();
  return { host, session, page };
}

function forceDeferredBody(
  context: BrowserContext,
  capture: (native: Promise<{ postData: string }>, page: Page) => Promise<{ postData: string }>,
) {
  const on = context.on.bind(context);
  vi.spyOn(context, 'on').mockImplementation(((event: string, listener: (...args: any[]) => void) =>
    on(event as never, event === 'request' ? (request: any) => {
      if (request.method() === 'POST') {
        vi.spyOn(request, 'postData').mockReturnValue(null);
        vi.spyOn(request, 'postDataBuffer').mockReturnValue(null);
      }
      listener(request);
    } : listener)) as BrowserContext['on']);
  const create = context.newCDPSession.bind(context);
  vi.spyOn(context, 'newCDPSession').mockImplementation(async (target) => {
    const cdp = await create(target);
    const listen = cdp.on.bind(cdp);
    const send = cdp.send.bind(cdp);
    vi.spyOn(cdp, 'on').mockImplementation(((event: string, listener: (value: any) => void) =>
      listen(event as never, event === 'Network.requestWillBeSent' ? (value: any) => {
        if (value.request.method === 'POST') {
          const { postData: _inline, ...request } = value.request;
          listener({ ...value, request: { ...request, hasPostData: true } });
        } else listener(value);
      } : listener)) as CDPSession['on']);
    vi.spyOn(cdp, 'send').mockImplementation(((method: string, params?: never) => {
      const native = send(method as never, params);
      return method === 'Network.getRequestPostData'
        ? capture(native as Promise<{ postData: string }>, target as Page)
        : native;
    }) as CDPSession['send']);
    return cdp;
  });
}

async function issueBody(page: Page, marker: string): Promise<void> {
  await page.evaluate(({ route, marker: body }) => {
    void fetch(route, { method: 'POST', body: new Blob([body]) });
  }, { route: ROUTE, marker });
}

async function releaseGenerations(producer: ReturnType<typeof generationProducer>, count: number) {
  for (let index = 0; index < count; index += 1) {
    await producer.started[index]!.promise;
    producer.release[index]!.resolve();
    await producer.completed[index]!.promise;
    if (index + 1 < count) await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function settlesBefore(settling: Promise<void>, timeoutMs: number): Promise<'settled' | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), timeoutMs); });
  const winner = await Promise.race([settling.then(() => 'settled' as const), timeout]);
  if (timer !== undefined) clearTimeout(timer);
  return winner;
}

function bodyMarkers(events: readonly { channel: string; route?: string; initiator?: string; bytes: string }[]) {
  return events.filter((event) => event.channel === 'network-body' && event.route === ROUTE
    && event.initiator === 'browser').map((event) => event.bytes);
}
