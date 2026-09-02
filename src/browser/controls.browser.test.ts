import { createServer } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createLockdownDomain } from '../supervisor/lockdownDomain';
import { startControlsLab, type ControlsLab } from '../../testbed/fixtures/controls-lab';
import { BROWSER_OPEN_FAILURE_MESSAGE, createBrowserControls } from './controls';
import { launchChromium, type Browser, type BrowserContext } from './playwright';
import { createBrowserSessionHost, type BrowserSessionHost } from './session';

let browser: Browser;
let lab: ControlsLab;
let host: BrowserSessionHost | undefined;
let contexts: BrowserContext[] = [];
let browserClosed = false;

beforeAll(async () => {
  browser = await launchChromium();
  lab = await startControlsLab();
});

afterEach(async () => {
  await host?.closeAll();
  host = undefined;
  contexts = [];
});

afterAll(async () => {
  await lab?.close();
  if (!browserClosed) await browser?.close();
});

function newControls() {
  const domain = createLockdownDomain();
  host = createBrowserSessionHost({
    newContext: async () => {
      const context = await browser.newContext();
      contexts.push(context);
      return context;
    },
    ...domain,
  });
  return createBrowserControls(host);
}

async function openControlsPage() {
  const controls = newControls();
  const { sessionId } = await controls.browser_open_session();
  expect(await controls.browser_navigate({ sessionId, url: `${lab.primaryOrigin}/controls` }))
    .toEqual({ ok: true });
  return { controls, sessionId };
}

async function closedLoopbackUrl(): Promise<string> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Test server did not bind');
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  });
  return `http://127.0.0.1:${address.port}/unreachable`;
}

describe.sequential('E-controls closed exception matrix', () => {
  it('kills missing-selector throws while retaining valid click and type traffic', async () => {
    const { controls, sessionId } = await openControlsPage();
    expect(await controls.browser_click({ sessionId, selector: '#button' })).toEqual({ ok: true });
    expect(await controls.browser_type({ sessionId, selector: '#username', text: 'person' }))
      .toEqual({ ok: true });
    expect(await controls.browser_click({ sessionId, selector: '#missing' }))
      .toEqual({ ok: false, reason: 'no-such-element' });
    expect(await controls.browser_type({ sessionId, selector: '#missing', text: 'person' }))
      .toEqual({ ok: false, reason: 'no-such-element' });
  });

  it('kills open URL parsing and foreign navigation exception leaks', async () => {
    const { controls, sessionId } = await openControlsPage();
    for (const url of ['ftp://example.test/file', 'not a URL']) {
      const result = await controls.browser_navigate({ sessionId, url });
      expect(result).toEqual({ ok: false, reason: 'invalid-url' });
      expect(Object.isFrozen(result)).toBe(true);
    }
    const unreachable = await controls.browser_navigate({ sessionId, url: await closedLoopbackUrl() });
    expect(unreachable).toEqual({ ok: false, reason: 'navigation-failed' });
    expect(await controls.browser_navigate({ sessionId, url: `${lab.primaryOrigin}/controls` }))
      .toEqual({ ok: true });
  });

  it('settles an unsafe-port error page before the next two navigations', async () => {
    const { controls, sessionId } = await openControlsPage();
    expect(await controls.browser_navigate({ sessionId, url: 'http://127.0.0.1:1/unsafe' }))
      .toEqual({ ok: false, reason: 'navigation-failed' });
    expect(await controls.browser_navigate({ sessionId, url: `${lab.primaryOrigin}/controls` }))
      .toEqual({ ok: true });
    expect(await controls.browser_navigate({ sessionId, url: `${lab.primaryOrigin}/password-basic` }))
      .toEqual({ ok: true });
  });

  it('kills destroyed-context snapshot throws while retaining the prior legitimate snapshot', async () => {
    const { controls, sessionId } = await openControlsPage();
    const before = await controls.browser_snapshot({ sessionId });
    expect(before).toMatchObject({ ok: true, snapshot: { url: `${lab.primaryOrigin}/controls` } });
    await contexts[0]!.close();
    const after = await controls.browser_snapshot({ sessionId });
    expect(after).toEqual({ ok: true, snapshot: { url: '', nodes: [] } });
    expect(Object.isFrozen(after)).toBe(true);
  });

  it('kills non-idempotent or throwing close results', async () => {
    const { controls, sessionId } = await openControlsPage();
    const first = await controls.browser_close_session({ sessionId });
    const second = await controls.browser_close_session({ sessionId });
    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: false });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(second)).toBe(true);
  });

  it('kills unknown-session free-text mapping with exact frozen failures', async () => {
    const controls = newControls();
    const live = await controls.browser_open_session();
    expect(await controls.browser_navigate({ sessionId: live.sessionId, url: `${lab.primaryOrigin}/controls` }))
      .toEqual({ ok: true });
    const missing = '0'.repeat(32);
    const results = await Promise.all([
      controls.browser_navigate({ sessionId: missing, url: `${lab.primaryOrigin}/controls` }),
      controls.browser_click({ sessionId: missing, selector: '#button' }),
      controls.browser_type({ sessionId: missing, selector: '#username', text: 'person' }),
      controls.browser_snapshot({ sessionId: missing }),
    ]);
    expect(results).toEqual([
      { ok: false, reason: 'session-unknown' },
      { ok: false, reason: 'session-unknown' },
      { ok: false, reason: 'session-unknown' },
      { ok: false, reason: 'session-unknown' },
    ]);
    expect(results.every(Object.isFrozen)).toBe(true);
  });

  it('kills browser-open foreign errors with the single fixed dead-browser message', async () => {
    const controls = newControls();
    const live = await controls.browser_open_session();
    expect(live.sessionId).toMatch(/^[0-9a-f]{32}$/u);
    await controls.browser_close_session(live);
    await browser.close();
    browserClosed = true;
    await expect(controls.browser_open_session()).rejects.toThrow(BROWSER_OPEN_FAILURE_MESSAGE);
  });
});
