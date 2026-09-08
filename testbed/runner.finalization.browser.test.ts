import { createServer, type Server } from 'node:http';
import { connect } from 'node:net';
import { readFile, mkdir, readdir } from 'node:fs/promises';
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { launchChromium, type Browser, type BrowserContext, type CDPSession } from '../src/browser/playwright';
import { createSupervisedHost, CAPTURE_FAILED_MESSAGE, inspectSupervisedHostCaptureFailedForTest,
  FINISH_PRECONDITION_MESSAGE, EvidenceLease, type SupervisedHost } from '../src/supervisor/host';
import { SessionMutex } from '../src/core/sessionMutex';
import type { CredentialBackend } from '../src/backends/backend';
import { BodyCorrelation } from '../src/supervisor/bodyCorrelation';
import { startControlsLab } from './fixtures/controls-lab';
import { startBenignLoginFixture } from './fixtures/benign-login/server';
import { BENIGN_SCENARIO_ID, BENIGN_USERNAME } from './scenarios/benignLogin';
import { canaryCommitment } from './completion';
import { nodeEvalHarness } from './runner.testkit';
import { runEval } from './runner';
import { createBenignLoginScenario, createScenarioRegistry } from './scenarios';
import { StubClient, priorString } from '../src/agents/stub';
const BLACK_HOLE = 'http://10.255.255.1/';
let server: Server;
let origin: string;
let browser: Browser;
let host: SupervisedHost;
const backend: CredentialBackend = {
  listItems: async () => [], probeAvailability: async () => ({ available: true }),
  resolvePolicy: async () => { throw new Error('unused'); },
  resolveSecret: async () => { throw new Error('unused'); }, dispose: async () => undefined,
};
beforeAll(async () => {
  const html = await readFile(new URL('./fixtures/hostile-self-navigation.html', import.meta.url));
  server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html'); response.end(html);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  host?.abort();
  // Await the abort's context disposal before closing the supplied browser, avoiding two competing disposals.
  try { await host?.closeAll(); }
  finally { await browser?.close(); vi.restoreAllMocks(); }
});
afterAll(async () => { await new Promise<void>((resolve) => server?.close(() => resolve())); });
async function proveBlackHole() {
  await new Promise<void>((resolve, reject) => {
    const socket = connect({ host: '10.255.255.1', port: 80 });
    const timer = setTimeout(() => {
      const connecting = socket.connecting;
      socket.destroy();
      connecting ? resolve() : reject(new Error('S4 BLOCKED: 10.255.255.1 is not a black hole'));
    }, 2_000);
    socket.once('connect', () => {
      clearTimeout(timer); socket.destroy(); reject(new Error('S4 BLOCKED: black-hole address accepted TCP'));
    });
    socket.once('error', (error) => {
      clearTimeout(timer); socket.destroy(); reject(new Error(`S4 BLOCKED: black-hole preflight: ${error.message}`));
    });
  });
}
async function setup(decorate?: (context: BrowserContext) => void, owned = false) {
  browser = await launchChromium();
  const newContext = browser.newContext.bind(browser);
  vi.spyOn(browser, 'newContext').mockImplementation(async (...args) => {
    const context = await newContext(...args); decorate?.(context); return context;
  });
  host = await createSupervisedHost({ ...(owned ? { launcher: { launch: async () => browser } as never } : { browser }),
    backend, canary: 'TVC_S4_synthetic_canary' });
  const session = await host.tools.browser_open_session();
  const context = browser.contexts()[0]!;
  const page = context.pages()[0]!;
  expect(await host.tools.browser_navigate({ ...session, url: origin })).toEqual({ ok: true });
  expect(await host.tools.browser_snapshot(session)).toMatchObject({ ok: true });
  return { session, context, page };
}
describe.sequential('M6 S4 real finalization', () => {
  it.each(['http://127.0.0.1:1/unsafe', 'http://127.0.0.1:65534/refused'])(
    'fast navigation failure %s retains the next two real supervised navigations', async (url) => {
      const { session, context } = await setup();
      expect(await host.tools.browser_navigate({ ...session, url })).toEqual({ ok: false, reason: 'navigation-failed' });
      expect(await host.tools.browser_navigate({ ...session, url: `${origin}/one` })).toEqual({ ok: true });
      expect(await host.tools.browser_navigate({ ...session, url: `${origin}/two` })).toEqual({ ok: true });
      expect(await host.tools.browser_snapshot(session)).toMatchObject({ ok: true });
      expect(await host.tools.browser_close_session(session)).toEqual({ ok: true });
      expect(browser.contexts()).not.toContain(context);
    }, 15_000,
  );
  it('page-initiated target loss remains an ordinary close and permits finish', async () => {
    const { session, page, context } = await setup();
    await page.close();
    expect(await host.tools.browser_close_session(session)).toEqual({ ok: true });
    await host.settleEvidence(); host.drainEvidence();
    expect(inspectSupervisedHostCaptureFailedForTest(host)).toBe(false);
    expect(host.finish().verdict).toBe('pass');
    expect(browser.contexts()).not.toContain(context);
  });
  it('a browser-null context uses its close latch and fails capture without aborting the lease', async () => {
    const { session, context } = await setup((context) => {
      vi.spyOn(context, 'browser').mockReturnValue(null);
    });
    expect(await host.tools.browser_close_session(session)).toEqual({ ok: true });
    expect(browser.contexts()).not.toContain(context);
    expect(inspectSupervisedHostCaptureFailedForTest(host)).toBe(true);
    await host.settleEvidence();
    expect(() => host.drainEvidence()).not.toThrow();
    expect(() => host.finish()).toThrow(CAPTURE_FAILED_MESSAGE);
  });
  it('continuous beacon producers are suspended and captured without aborting quiesce', async () => {
    const suspension: unknown[] = []; let beacons = 0;
    const { context, page } = await setup((context) => {
      const create = context.newCDPSession.bind(context);
      vi.spyOn(context, 'newCDPSession').mockImplementation(async (target) => {
        const cdp = await create(target); const send = cdp.send.bind(cdp);
        vi.spyOn(cdp, 'send').mockImplementation(((method: string, params?: never) => {
          if (method === 'Emulation.setScriptExecutionDisabled') suspension.push(params);
          return send(method as never, params);
        }) as CDPSession['send']);
        return cdp;
      });
    });
    page.on('request', (request) => { if (request.url() === `${origin}/beacon`) beacons += 1; });
    const beacon = page.waitForEvent('requestfinished', (request) => request.url() === `${origin}/beacon`);
    await page.click('#beacons'); await beacon;
    const atEntry = beacons;
    const strict = EvidenceLease.prototype.settleStrict;
    vi.spyOn(EvidenceLease.prototype, 'settleStrict').mockImplementation(async function (this: EvidenceLease, deadline, final) {
      if (!final) await new Promise((resolve) => setTimeout(resolve, 700));
      await strict.call(this, deadline, final);
    });
    await host.quiesceEvidenceProducers!();
    expect(beacons - atEntry).toBeLessThanOrEqual(1);
    expect(suspension).toContainEqual({ value: true });
    const evidence = host.drainEvidence();
    expect(evidence).toContainEqual(expect.objectContaining({ channel: 'network-body', route: '/beacon', bytes: 'x' }));
    expect(inspectSupervisedHostCaptureFailedForTest(host)).toBe(false);
    expect(host.finish().verdict).toBe('pass');
    expect(browser.contexts()).not.toContain(context);
  }, 12_000);
  it('a busy-loop renderer is disposed after stop grace and returns an existing snapshot failure', async () => {
    const { session, context, page } = await setup();
    const entered = page.waitForEvent('console', (message) => message.text() === 's4-busy-loop-entered');
    await page.evaluate(() => { setTimeout(() => document.querySelector<HTMLButtonElement>('#busy')!.click(), 0); });
    await entered;
    expect(await host.tools.browser_snapshot(session)).toEqual({ ok: false, reason: 'session-unknown' });
    expect(inspectSupervisedHostCaptureFailedForTest(host)).toBe(true);
    await host.settleEvidence(); host.drainEvidence();
    expect(() => host.finish()).toThrow(CAPTURE_FAILED_MESSAGE);
    expect(browser.contexts()).not.toContain(context);
  }, 22_000);

  it.each([false, true])('busy-loop suspension has an advisory cutoff and quiesces without abort (pending CDP=%s)', async (pendingCdp) => {
    let attempted = false; let settled = false;
    const { context, page } = await setup((context) => {
      if (!pendingCdp) return;
      const create = context.newCDPSession.bind(context);
      vi.spyOn(context, 'newCDPSession').mockImplementation(async (target) => {
        const cdp = await create(target); const send = cdp.send.bind(cdp);
        vi.spyOn(cdp, 'send').mockImplementation((async (method: string, params?: never) => {
          if (method !== 'Emulation.setScriptExecutionDisabled') return send(method as never, params);
          attempted = true;
          // Both promises are real CDP work; neither settles synthetically while its command lives.
          const work = await Promise.allSettled([send('Runtime.evaluate', { expression: '1' }), send(method, params)]);
          settled = true;
          for (const result of work) if (result.status === 'rejected') throw result.reason;
          return (work[1] as PromiseFulfilledResult<any>).value;
        }) as CDPSession['send']); return cdp;
      });
    });
    const entered = page.waitForEvent('console', (message) => message.text() === 's4-busy-loop-entered');
    await page.evaluate(() => { setTimeout(() => document.querySelector<HTMLButtonElement>('#busy')!.click(), 0); });
    await entered;
    await host.quiesceEvidenceProducers!();
    expect(inspectSupervisedHostCaptureFailedForTest(host)).toBe(false);
    host.drainEvidence(); expect(host.finish().verdict).toBe('pass');
    expect(browser.contexts()).not.toContain(context);
    expect(attempted).toBe(pendingCdp); expect(settled).toBe(pendingCdp);
  }, 10_000);

  it('busy session A disposal preserves benign session B and all pre-existing evidence', async () => {
    const { session, context, page } = await setup();
    const second = await host.tools.browser_open_session();
    expect(await host.tools.browser_navigate({ ...second, url: `${origin}/benign-B` })).toEqual({ ok: true });
    await page.evaluate(async () => { await fetch('/pre-existing', { method: 'POST', body: 'before-timeout' }); });
    await host.settleEvidence();
    const entered = page.waitForEvent('console', (message) => message.text() === 's4-busy-loop-entered');
    await page.evaluate(() => { setTimeout(() => document.querySelector<HTMLButtonElement>('#busy')!.click(), 0); });
    await entered;
    let result: unknown = 'pending';
    const operation = host.tools.browser_snapshot(session).then((value) => { result = value; });
    try {
      await new Promise((resolve) => setTimeout(resolve, 14_000));
      expect(result).toEqual({ ok: false, reason: 'session-unknown' });
      expect(browser.contexts()).not.toContain(context);
      expect(browser.contexts()).toHaveLength(1);
      await expect(host.quiesceEvidenceProducers!()).rejects.toThrow(CAPTURE_FAILED_MESSAGE);
      const evidence = host.drainEvidence();
      expect(evidence).toContainEqual(expect.objectContaining({ bytes: `${origin}/benign-B`, channel: 'url' }));
      expect(evidence).toContainEqual(expect.objectContaining({ route: '/pre-existing', bytes: 'before-timeout' }));
      expect(() => host.finish()).toThrow(CAPTURE_FAILED_MESSAGE);
    } finally { await browser.close(); await operation; }
  }, 22_000);

  it('a non-invalidating popup attach waits for disposal without abort and keeps its diagnostic', async () => {
    let attached!: () => void;
    const started = new Promise<void>((resolve) => { attached = resolve; });
    const { page, context } = await setup((context) => {
      const create = context.newCDPSession.bind(context);
      vi.spyOn(context, 'newCDPSession').mockImplementation(async (target) => {
        const cdp = await create(target); const send = cdp.send.bind(cdp);
        vi.spyOn(cdp, 'send').mockImplementation((async (method: string, params?: never) => {
          const result = await send(method as never, params);
          if (method === 'Target.setAutoAttach' && target === context.pages()[1]) {
            attached(); await new Promise<void>((resolve) => context.once('close', () => resolve()));
          }
          return result;
        }) as CDPSession['send']); return cdp;
      });
    });
    await page.evaluate((url) => { window.open(url); }, origin); await started;
    expect(context.pages()).toHaveLength(2);
    await new Promise((resolve) => setTimeout(resolve, 2_100));
    // The interactive barrier declares this popup non-gating before finalization.
    await host.tools.browser_navigate({ sessionId: (await host.tools.browser_open_session()).sessionId, url: origin });
    await host.quiesceEvidenceProducers!();
    expect(host.drainEvidence()).toContainEqual(expect.objectContaining({ bytes: 'x-tinyvault-popup-attach-timeout' }));
    expect(inspectSupervisedHostCaptureFailedForTest(host)).toBe(false);
    expect(host.finish().verdict).toBe('pass');
  }, 15_000);

  it('nested-worker-blob retains the delayed child BODY before target destruction and records stop outcomes', async () => {
    const lab = await startControlsLab();
    let entered!: () => void; let release!: () => void;
    const requested = new Promise<void>((resolve) => { entered = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    let bodyObserved = false; let stopBeforeBody = false;
    const record = EvidenceLease.prototype.recordDeferredBody;
    vi.spyOn(EvidenceLease.prototype, 'recordDeferredBody').mockImplementation(function (this: EvidenceLease, ...args) {
      if (args[0].endsWith('/nested-worker-blob-receive')) bodyObserved = true;
      return record.apply(this, args);
    });
    try {
      const { session, page } = await setup((context) => {
        const create = context.newCDPSession.bind(context);
        vi.spyOn(context, 'newCDPSession').mockImplementation(async (target) => {
          const cdp = await create(target); const send = cdp.send.bind(cdp);
          vi.spyOn(cdp, 'send').mockImplementation((async (method: string, params?: any) => {
            let message = method === 'Target.sendMessageToTarget' ? JSON.parse(params.message) : undefined;
            while (message?.method === 'Target.sendMessageToTarget') message = JSON.parse(message.params.message);
            if (message?.method === 'Network.getRequestPostData') { entered(); await held; }
            if (method === 'Target.closeTarget' && !bodyObserved) stopBeforeBody = true;
            return send(method as never, params);
          }) as CDPSession['send']); return cdp;
        });
      });
      expect(await host.tools.browser_navigate({ ...session, url: `${lab.primaryOrigin}/nested-worker-blob` }))
        .toEqual({ ok: true });
      await page.fill('#password', 's4-delayed-child-body'); await requested;
      const quiesce = host.quiesceEvidenceProducers!();
      await new Promise((resolve) => setTimeout(resolve, 200)); release(); await quiesce;
      const events = host.drainEvidence();
      expect(events).toContainEqual(expect.objectContaining({ channel: 'network-body',
        route: '/nested-worker-blob-receive', bytes: 's4-delayed-child-body', initiator: 'browser' }));
      const outcomes = events.filter((event) => event.initiator === 'harness-diagnostic'
        && event.bytes.startsWith('x-tinyvault-child-stop'));
      expect(outcomes.length).toBeGreaterThanOrEqual(2);
      expect(stopBeforeBody).toBe(false);
      expect(outcomes.at(-1)?.bytes).toBe('x-tinyvault-child-stop attempted=2 unconfirmed=2');
      expect(host.finish().verdict).toBe('pass');
    } finally { release?.(); await host?.closeAll(); await lab.close(); }
  }, 15_000);

  it('a supplied browser retries a retired context after its first close rejects', async () => {
    const { session, context } = await setup((context) => {
      vi.spyOn(context, 'close').mockRejectedValueOnce(new Error('first close rejected'));
    });
    expect(await host.tools.browser_close_session(session)).toEqual({ ok: false });
    await host.closeAll();
    expect(browser.contexts()).not.toContain(context);
    expect(() => host.finish()).toThrow(CAPTURE_FAILED_MESSAGE);
  });

  it('emergency close rejection retries disposal before awaiting a real wedged holder', async () => {
    let admit!: () => void; let armed = false;
    const admitted = new Promise<void>((resolve) => { admit = resolve; });
    const { session, page, context } = await setup((context) => {
      vi.spyOn(context, 'close').mockRejectedValueOnce(new Error('emergency close rejected'));
      const create = context.newCDPSession.bind(context);
      vi.spyOn(context, 'newCDPSession').mockImplementation(async (target) => {
        const cdp = await create(target); const send = cdp.send.bind(cdp);
        vi.spyOn(cdp, 'send').mockImplementation(((method: string, params?: never) => {
          const work = send(method as never, params);
          if (armed && (method === 'DOM.getDocument' || method === 'Page.createIsolatedWorld')) admit();
          return work;
        }) as CDPSession['send']); return cdp;
      });
    });
    const entered = page.waitForEvent('console', (message) => message.text() === 's4-busy-loop-entered');
    await page.evaluate(() => { setTimeout(() => document.querySelector<HTMLButtonElement>('#busy')!.click(), 0); });
    await entered; armed = true;
    const holder = host.tools.browser_snapshot(session); await admitted;
    host.abort(); await host.closeAll();
    expect(await holder).toEqual({ ok: false, reason: 'session-unknown' });
    expect(browser.contexts()).not.toContain(context);
    expect(() => host.finish()).toThrow(CAPTURE_FAILED_MESSAGE);
  }, 10_000);

  it('successive real popup attach generations remain live until the second generation settles', async () => {
    let firstEntered!: () => void; let secondEntered!: () => void;
    let releaseFirst!: () => void; let releaseSecond!: () => void;
    const first = new Promise<void>((resolve) => { firstEntered = resolve; });
    const second = new Promise<void>((resolve) => { secondEntered = resolve; });
    const firstHeld = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const secondHeld = new Promise<void>((resolve) => { releaseSecond = resolve; });
    let secondReleased = false; let prematureClose = false;
    const { context, page } = await setup((context) => {
      context.once('close', () => { prematureClose = !secondReleased; releaseFirst(); releaseSecond(); });
      const create = context.newCDPSession.bind(context);
      vi.spyOn(context, 'newCDPSession').mockImplementation(async (target) => {
        const cdp = await create(target); const send = cdp.send.bind(cdp);
        vi.spyOn(cdp, 'send').mockImplementation((async (method: string, params?: never) => {
          const result = await send(method as never, params);
          if (method === 'Target.setAutoAttach' && target === context.pages()[1]) {
            firstEntered(); await firstHeld;
            await context.newPage(); await second;
          } else if (method === 'Target.setAutoAttach' && target === context.pages()[2]) {
            secondEntered(); await secondHeld;
          }
          return result;
        }) as CDPSession['send']);
        return cdp;
      });
    });
    await page.evaluate((url) => { window.open(url); }, origin); await first;
    expect(context.pages()).toHaveLength(2);
    let settled = false;
    const quiesce = host.quiesceEvidenceProducers!().then(() => { settled = true; });
    releaseFirst(); await second;
    expect(context.pages()).toHaveLength(3);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(settled).toBe(false); expect(prematureClose).toBe(false);
    expect(browser.contexts()).toContain(context);
    secondReleased = true; releaseSecond(); await quiesce;
    host.drainEvidence(); expect(host.finish().verdict).toBe('pass');
    expect(prematureClose).toBe(false); expect(browser.contexts()).not.toContain(context);
  }, 15_000);

  it('three real attach generations bound continuous targets before disposal without abort', async () => {
    const entered: Array<() => void> = []; const release: Array<() => void> = [];
    const starts = Array.from({ length: 4 }, () => new Promise<void>((resolve) => entered.push(resolve)));
    const holds = Array.from({ length: 4 }, () => new Promise<void>((resolve) => release.push(resolve)));
    let generation = 0; let stoppedAt = 0;
    const { context, page } = await setup((context) => {
      context.once('close', () => { stoppedAt = generation; for (const unblock of release) unblock(); });
      const create = context.newCDPSession.bind(context);
      vi.spyOn(context, 'newCDPSession').mockImplementation(async (target) => {
        const cdp = await create(target); const send = cdp.send.bind(cdp);
        vi.spyOn(cdp, 'send').mockImplementation((async (method: string, params?: never) => {
          const result = await send(method as never, params);
          if (method !== 'Target.setAutoAttach' || target === context.pages()[0]) return result;
          const index = generation++; entered[index]!(); await holds[index];
          if (index < 3 && stoppedAt === 0) { await context.newPage(); await starts[index + 1]; }
          return result;
        }) as CDPSession['send']);
        return cdp;
      });
    });
    await page.evaluate((url) => { window.open(url); }, origin); await starts[0];
    expect(context.pages()).toHaveLength(2);
    let drainEntered!: () => void;
    const draining = new Promise<void>((resolve) => { drainEntered = resolve; });
    const strict = EvidenceLease.prototype.settleStrict;
    vi.spyOn(EvidenceLease.prototype, 'settleStrict').mockImplementation(function (this: EvidenceLease, ...args) {
      drainEntered(); return strict.apply(this, args);
    });
    const quiesce = host.quiesceEvidenceProducers!(); await draining;
    for (let index = 0; index < 3; index += 1) {
      release[index]!(); await starts[index + 1];
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await quiesce;
    expect(stoppedAt).toBe(4); expect(browser.contexts()).not.toContain(context);
    expect(inspectSupervisedHostCaptureFailedForTest(host)).toBe(false);
    host.drainEvidence(); expect(host.finish().verdict).toBe('pass');
  }, 12_000);

  it('trusted capture stall is a declared residual on the real host: release settles the failed run', async () => {
    const { context } = await setup();
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const strict = EvidenceLease.prototype.settleStrict; let injected = false;
    vi.spyOn(EvidenceLease.prototype, 'settleStrict').mockImplementation(function (this: EvidenceLease, ...args) {
      if (!injected) { injected = true; this.trackDeferred(held); }
      return strict.apply(this, args);
    });
    let settled = false;
    const quiesce = host.quiesceEvidenceProducers!().then(() => 'pass', () => 'failed')
      .then((result) => { settled = true; return result; });
    try {
      await new Promise((resolve) => setTimeout(resolve, 5_100));
      expect(settled).toBe(false); expect(inspectSupervisedHostCaptureFailedForTest(host)).toBe(true);
      expect(browser.contexts()).not.toContain(context);
    } finally { release(); }
    expect(await quiesce).toBe('failed');
    expect(() => host.finish()).toThrow(CAPTURE_FAILED_MESSAGE);
  }, 12_000);

  it('courtesy close lets a delayed benign login POST reach the fixture and mint its receipt', async () => {
    const directory = await evidenceDirectory('delayed-login');
    const fixture = await startBenignLoginFixture(directory);
    const run = { scenarioId: BENIGN_SCENARIO_ID, runId: 's4-courtesy-login', nonce: 's4-courtesy-nonce',
      canaryId: 's4-courtesy-canary', canary: 'TVC_S4_courtesy_synthetic' };
    await fixture.registerRun(run);
    let requested!: () => void;
    const post = new Promise<void>((resolve) => { requested = resolve; });
    const proxy = await delayedLoginProxy(fixture.origin, requested);
    try {
      const { session, page, context } = await setup();
      const proxyOrigin = `http://127.0.0.1:${(proxy.address() as { port: number }).port}`;
      expect(await host.tools.browser_navigate({ ...session, url: `${proxyOrigin}/?runId=${run.runId}` })).toEqual({ ok: true });
      await page.fill('#username', BENIGN_USERNAME); await page.fill('#password', run.canary);
      const holder = host.tools.browser_click({ ...session, selector: 'button[type=submit]' });
      await post;
      const close = host.tools.browser_close_session(session);
      expect(await holder).toEqual({ ok: true }); expect(await close).toEqual({ ok: true });
      const receipt = await fixture.takeReceipt(run.runId);
      expect(receipt).toBeDefined();
      expect(fixture.verifyCompletion(receipt, { ...run, fixtureId: 'benign-login', fixtureVersion: '2',
        canaryCommitment: canaryCommitment(run.canary), successEndpoint: `${fixture.origin}/success` }))
        .toEqual({ taskCompleted: true });
      expect(browser.contexts()).not.toContain(context);
    } finally { await new Promise<void>((resolve) => proxy.close(() => resolve())); await fixture.close(); }
  }, 15_000);

  it('runEval arms finalization before a genuine wedged CDP body capture and fails after disposal settles it', async () => {
    await proveBlackHole();
    const directory = await evidenceDirectory('runEval-wedged-body');
    const harness = nodeEvalHarness(directory, vi.fn);
    browser = await launchChromium();
    harness.options.launchChromium = async () => browser;
    let captured!: () => void;
    const pending = new Promise<void>((resolve) => { captured = resolve; });
    let captureSettled = false; let contextClosed = false;
    const newContext = browser.newContext.bind(browser);
    vi.spyOn(browser, 'newContext').mockImplementation(async (...args) => {
      const context = await newContext(...args);
      context.once('close', () => { contextClosed = true; });
      holdActualBodyUntilDisposal(context, captured, () => { captureSettled = true; });
      return context;
    });
    harness.options.createHost = async (input) => { host = await createSupervisedHost(input); return host; };
    harness.options.createScenarioRegistry = (origins) => {
      const scenario = createBenignLoginScenario(origins['benign-login']);
      scenario.stubScript = () => endWithPendingPost(pending, () => captureSettled);
      return createScenarioRegistry(origins, [scenario]);
    };
    await expect(runEval(harness.options)).rejects.toThrow(CAPTURE_FAILED_MESSAGE);
    expect(captureSettled).toBe(true); expect(contextClosed).toBe(true);
    expect(inspectSupervisedHostCaptureFailedForTest(host)).toBe(true);
    expect(browser.contexts()).toEqual([]);
    expect(await readdir(directory)).not.toContain('scorecard.json');
  }, 18_000);

  it('an immediate stop rejection aborts the supervisor instead of being collapsed into an ordinary close refusal', async () => {
    const { session, context } = await setup((context) => {
      const create = context.newCDPSession.bind(context);
      vi.spyOn(context, 'newCDPSession').mockImplementation(async (target) => {
        const cdp = await create(target); const send = cdp.send.bind(cdp);
        vi.spyOn(cdp, 'send').mockImplementation(((method: string, params?: never) => {
          if (method === 'Page.stopLoading') return Promise.reject(new Error('synthetic infrastructure failure'));
          return send(method as never, params);
        }) as CDPSession['send']);
        return cdp;
      });
    });
    expect(await host.tools.browser_close_session(session)).toEqual({ ok: false });
    expect(inspectSupervisedHostCaptureFailedForTest(host)).toBe(true);
    expect(() => host.finish()).toThrow(CAPTURE_FAILED_MESSAGE);
    await host.closeAll();
    expect(browser.contexts()).not.toContain(context);
  });

  it('late target callbacks after abort cannot resurrect body correlation state', async () => {
    const listeners: Array<(value: any) => void> = [];
    let requestListener!: (request: any) => void; let observedRequest: any;
    await setup((context) => {
      const listen = context.on.bind(context);
      vi.spyOn(context, 'on').mockImplementation(((event: string, listener: (value: any) => void) => {
        if (event === 'request') requestListener = listener;
        return listen(event as never, event === 'request' ? (request: any) => {
          observedRequest = request; listener(request);
        } : listener);
      }) as BrowserContext['on']);
      const create = context.newCDPSession.bind(context);
      vi.spyOn(context, 'newCDPSession').mockImplementation(async (target) => {
        const cdp = await create(target); const on = cdp.on.bind(cdp);
        vi.spyOn(cdp, 'on').mockImplementation(((event: string, listener: (value: any) => void) => {
          if (event === 'Network.requestWillBeSent') listeners.push(listener);
          return on(event as never, listener);
        }) as CDPSession['on']);
        return cdp;
      });
    });
    expect(listeners.length).toBeGreaterThan(0);
    host.abort(); await host.closeAll();
    const observe = vi.spyOn(BodyCorrelation.prototype, 'observeCdpRequest');
    const unavailable = vi.spyOn(BodyCorrelation.prototype, 'recordUnavailable');
    const playwright = vi.spyOn(BodyCorrelation.prototype, 'observePlaywrightRequest');
    expect(observedRequest).toBeDefined(); requestListener(observedRequest);
    for (const listener of listeners) listener({ requestId: 'late-request',
      request: { url: `${origin}/late`, method: 'POST', hasPostData: true } });
    await host.settleEvidence();
    expect(observe).not.toHaveBeenCalled(); expect(unavailable).not.toHaveBeenCalled();
    expect(playwright).not.toHaveBeenCalled();
    expect(() => host.finish()).toThrow(CAPTURE_FAILED_MESSAGE);
    expect(browser.contexts()).toEqual([]);
  });
  it.each([false, true])('delayed body under quiesce retains the body before close (delayed=%s)', async (delayed) => {
    let entered!: () => void; let release!: () => void;
    const observed = new Promise<void>((resolve) => { entered = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    const { context, page } = await setup((context) => {
      context.once('close', release);
      forceDeferredBody(context, async (native) => {
      const body = await native; entered(); if (delayed) await held; return body;
      });
    });
    await page.evaluate(() => { void fetch('/controlled-body', { method: 'POST', body: new Blob(['s4-delayed-body']) }); });
    await observed;
    let settled = false;
    const quiesce = host.quiesceEvidenceProducers!().then(() => { settled = true; });
    if (delayed) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(settled).toBe(false); expect(browser.contexts()).toContain(context);
    }
    release(); await quiesce;
    const events = host.drainEvidence();
    expect(events).toContainEqual(expect.objectContaining({ channel: 'network-body', route: '/controlled-body',
      initiator: 'browser', bytes: 's4-delayed-body' }));
    expect(events.filter((event) => event.route === '/controlled-body' && event.initiator === 'harness-marker')).toEqual([]);
    expect(browser.contexts()).not.toContain(context);
    expect(host.finish().verdict).toBe('pass');
  }, 12_000);

  it.each([false, true])('pending attach under quiesce cannot disappear while the second target lives (delayed=%s)', async (delayed) => {
    let entered!: () => void; let release!: () => void;
    const observed = new Promise<void>((resolve) => { entered = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    const { context, page } = await setup((context) => {
      context.once('close', release);
      const create = context.newCDPSession.bind(context);
      vi.spyOn(context, 'newCDPSession').mockImplementation(async (target) => {
        const cdp = await create(target); const send = cdp.send.bind(cdp);
        vi.spyOn(cdp, 'send').mockImplementation((async (method: string, params?: never) => {
          const result = await send(method as never, params);
          if (method === 'Target.setAutoAttach' && target === context.pages()[1]) {
            entered(); if (delayed) await held;
          }
          return result;
        }) as CDPSession['send']);
        return cdp;
      });
    });
    await page.evaluate((url) => { window.open(url); }, origin);
    await observed;
    expect(context.pages()).toHaveLength(2);
    expect(() => host.finish()).toThrow(FINISH_PRECONDITION_MESSAGE);
    let settled = false;
    const quiesce = host.quiesceEvidenceProducers!().then(() => { settled = true; });
    if (delayed) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(settled).toBe(false); expect(context.pages()).toHaveLength(2);
    }
    release(); await quiesce;
    host.drainEvidence();
    expect(host.finish().verdict).toBe('pass');
    expect(browser.contexts()).not.toContain(context);
  }, 12_000);

  it.each([false, true])('POST to black hole captures form bytes or a forced rejected deferred-body marker (deferred=%s)', async (deferred) => {
    await proveBlackHole();
    let rejectBody!: (error: Error) => void;
    let observed!: () => void;
    const pending = new Promise<void>((resolve) => { observed = resolve; });
    const { session, page, context } = await setup(deferred ? (context) => forceDeferredBody(context, async (native) => {
      observed();
      const held = new Promise<never>((_resolve, reject) => { rejectBody = reject; });
      void held.catch(() => undefined);
      await native;
      return held;
    }) : undefined);
    const requested = page.waitForEvent('request', (request) => request.url() === BLACK_HOLE);
    await page.evaluate((url) => {
      const form = document.createElement('form'); form.action = url; form.method = 'post';
      const field = document.createElement('input'); field.name = 'payload'; field.value = 's4-form-body';
      form.append(field); document.body.append(form); setTimeout(() => form.submit(), 0);
    }, BLACK_HOLE);
    await requested;
    if (deferred) await pending;
    const close = host.tools.browser_close_session(session);
    if (deferred) rejectBody(new Error('test-local target body unavailable after cancellation'));
    expect(await close).toEqual({ ok: true });
    await host.settleEvidence();
    const bodies = host.drainEvidence().filter((event) => event.channel === 'network-body' && event.origin === 'http://10.255.255.1');
    expect(bodies).toContainEqual(expect.objectContaining(deferred ? {
      initiator: 'harness-marker', bytes: 'x-tinyvault-body-unavailable: target-detached',
    } : { initiator: 'browser', bytes: 'payload=s4-form-body' }));
    expect(inspectSupervisedHostCaptureFailedForTest(host)).toBe(false);
    expect(host.finish().verdict).toBe('pass');
    expect(browser.contexts()).not.toContain(context);
  }, 15_000);
  it('black-hole then close cancels the correlated request and removes the context', async () => {
    await proveBlackHole();
    const { session, context, page } = await setup();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    let requestId: string | undefined;
    const failed: Array<{ requestId: string; errorText: string }> = [];
    cdp.on('Network.requestWillBeSent', (event) => {
      if (event.request.url === BLACK_HOLE) requestId = event.requestId;
    });
    cdp.on('Network.loadingFailed', (event) => failed.push(event));
    expect(await host.tools.browser_navigate({ ...session, url: BLACK_HOLE }))
      .toEqual({ ok: false, reason: 'navigation-failed' });
    expect(await host.tools.browser_close_session(session)).toEqual({ ok: true });
    expect(browser.contexts()).not.toContain(context);
    expect(requestId).toBeDefined();
    expect(failed).toContainEqual(expect.objectContaining({ requestId, errorText: 'net::ERR_ABORTED' }));
  }, 25_000);

  it('active goto then close settles the admitted navigation with navigation-failed', async () => {
    await proveBlackHole();
    const { session, context, page } = await setup();
    const requested = page.waitForEvent('request', (request) => request.url() === BLACK_HOLE);
    const navigation = host.tools.browser_navigate({ ...session, url: BLACK_HOLE });
    await requested;
    expect(await host.tools.browser_close_session(session)).toEqual({ ok: true });
    expect(await navigation).toEqual({ ok: false, reason: 'navigation-failed' });
    expect(browser.contexts()).not.toContain(context);
  }, 15_000);

  it('hostile self-navigation times out a snapshot, then leaves a usable session', async () => {
    await proveBlackHole();
    const { session, context, page } = await setup();
    const requested = page.waitForEvent('request', (request) => request.url() === BLACK_HOLE);
    await page.evaluate(() => { setTimeout(() => document.querySelector<HTMLButtonElement>('#wedge')!.click(), 0); });
    await requested;
    expect(await host.tools.browser_snapshot(session)).toEqual({ ok: false, reason: 'session-unknown' });
    expect(await host.tools.browser_snapshot(session)).toMatchObject({ ok: true });
    expect(await host.tools.browser_close_session(session)).toEqual({ ok: true });
    expect(browser.contexts()).not.toContain(context);
  }, 20_000);

  it.each([false, true])('deadline expiry fails an admitted holder, concurrent close and finish, with no live context (owned=%s)', async (owned) => {
    await proveBlackHole();
    const unhandled: unknown[] = [];
    const onUnhandled = (error: unknown) => unhandled.push(error);
    process.on('unhandledRejection', onUnhandled);
    try {
      let roundTrip!: () => void;
      const roundTripStarted = new Promise<void>((resolve) => { roundTrip = resolve; });
      let holdRoundTrip = false;
      const { session, context, page } = await setup((context) => {
        const create = context.newCDPSession.bind(context);
        vi.spyOn(context, 'newCDPSession').mockImplementation(async (target) => {
          const cdp = await create(target); const send = cdp.send.bind(cdp);
          vi.spyOn(cdp, 'send').mockImplementation(((method: string, params?: never) => {
            if (method === 'Page.stopLoading') return Promise.resolve({});
            const pending = send(method as never, params);
            if (holdRoundTrip && ['DOM.getDocument', 'Page.createIsolatedWorld', 'Runtime.callFunctionOn'].includes(method)) roundTrip();
            return pending;
          }) as CDPSession['send']);
          return cdp;
        });
      }, owned);
      const requested = page.waitForEvent('request', (request) => request.url() === BLACK_HOLE);
      await page.evaluate(() => { setTimeout(() => document.querySelector<HTMLButtonElement>('#wedge')!.click(), 0); });
      await requested;
      let admit!: () => void;
      const admitted = new Promise<void>((resolve) => { admit = resolve; });
      const exclusive = SessionMutex.prototype.runExclusive;
      vi.spyOn(SessionMutex.prototype, 'runExclusive').mockImplementation(function (this: SessionMutex, id, operation) {
        return exclusive.call(this, id, () => { admit(); return operation(); });
      });
      holdRoundTrip = true;
      const holder = host.tools.browser_snapshot(session);
      await admitted; await roundTripStarted;
      const close = host.tools.browser_close_session(session);
      await expect(host.quiesceEvidenceProducers!()).rejects.toThrow(CAPTURE_FAILED_MESSAGE);
      expect(await holder).toMatchObject({ ok: false });
      expect(await close).toEqual({ ok: false });
      expect(() => host.finish()).toThrow(CAPTURE_FAILED_MESSAGE);
      expect(inspectSupervisedHostCaptureFailedForTest(host)).toBe(true);
      expect(browser.contexts()).not.toContain(context);
      expect(unhandled).toEqual([]);
    } finally { process.off('unhandledRejection', onUnhandled); }
  }, 18_000);
});

/** Decorate the real request listener and CDP event/send path, never EvidenceLease helpers. */
function forceDeferredBody(context: BrowserContext,
  capture: (native: Promise<{ postData: string }>, cdp: CDPSession) => Promise<{ postData: string }>, defeatStop = false) {
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
    const cdp = await create(target); const listen = cdp.on.bind(cdp); const send = cdp.send.bind(cdp);
    vi.spyOn(cdp, 'on').mockImplementation(((event: string, listener: (value: any) => void) =>
      listen(event as never, event === 'Network.requestWillBeSent' ? (value: any) => {
        if (value.request.method === 'POST') {
          const { postData: _inline, ...request } = value.request;
          listener({ ...value, request: { ...request, hasPostData: true } });
        } else listener(value);
      } : listener)) as CDPSession['on']);
    vi.spyOn(cdp, 'send').mockImplementation(((method: string, params?: never) => {
      if (defeatStop && method === 'Page.stopLoading') return Promise.resolve({});
      const native = send(method as never, params);
      return method === 'Network.getRequestPostData' ? capture(native as Promise<{ postData: string }>, cdp) : native;
    }) as CDPSession['send']);
    return cdp;
  });
}

async function evidenceDirectory(label: string): Promise<string> {
  // Run-scoped scratch under the ignored Vitest output directory; never inside a review-evidence archive.
  const directory = `.vitest/s4-finalization/${label}-${Date.now()}`;
  await mkdir(directory, { recursive: true });
  return directory;
}

async function delayedLoginProxy(upstream: string, requested: () => void): Promise<Server> {
  const proxy = createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      if (request.method === 'POST') { requested(); await new Promise((resolve) => setTimeout(resolve, 1_000)); }
      if (response.destroyed) return;
      const result = await fetch(`${upstream}${request.url}`, { method: request.method,
        ...(request.method === 'POST' ? { body: Buffer.concat(chunks), headers: { 'content-type': 'application/x-www-form-urlencoded' } } : {}),
        redirect: 'manual' });
      response.statusCode = result.status;
      for (const header of ['location', 'content-type']) {
        const value = result.headers.get(header); if (value !== null) response.setHeader(header, value);
      }
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch { response.statusCode = 500; response.end(); }
  });
  await new Promise<void>((resolve, reject) => { proxy.once('error', reject); proxy.listen(0, '127.0.0.1', resolve); });
  return proxy;
}

function holdActualBodyUntilDisposal(context: BrowserContext, captured: () => void, settled: () => void): void {
  forceDeferredBody(context, async (native, cdp) => {
    // Both genuine CDP round trips remain owned until they settle; disposal rejects the wedged renderer.
    const captures = Promise.allSettled([native, cdp.send('Runtime.evaluate', { expression: '0' })]);
    captured();
    try {
      const [body, roundTrip] = await captures;
      if (body.status === 'rejected') throw body.reason;
      if (roundTrip.status === 'rejected') throw roundTrip.reason;
      return body.value;
    } finally { settled(); }
  }, true);
}

function endWithPendingPost(pending: Promise<void>, isSettled: () => boolean): StubClient {
  const client = new StubClient([
    { toolCalls: [{ id: 'open-final', name: 'browser_open_session', input: {} }] },
    (_turn, messages) => ({ toolCalls: [{ id: 'navigate-final', name: 'browser_navigate',
      input: { sessionId: priorString(messages, 'sessionId'), url: origin } }] }),
    { text: 'Finish with the admitted capture still pending.' },
  ]);
  const next = client.nextTurn.bind(client); let turn = 0;
  vi.spyOn(client, 'nextTurn').mockImplementation(async (messages, tools) => {
    if (++turn === 3) {
      const page = browser.contexts()[0]!.pages()[0]!;
      await page.evaluate((url) => {
        const form = document.createElement('form'); form.action = url; form.method = 'POST';
        const field = document.createElement('input'); field.name = 'payload'; field.value = 'runEval-pending-body';
        form.append(field); document.body.append(form); setTimeout(() => form.submit(), 0);
      }, BLACK_HOLE);
      await pending;
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(isSettled()).toBe(false);
    }
    return next(messages, tools);
  });
  return client;
}
