import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Secret } from '../core/redaction';
import { createLockdownDomain } from '../supervisor/lockdownDomain';
import { startControlsLab, type ControlsLab } from '../../testbed/fixtures/controls-lab';
import { createBrowserControls } from './controls';
import { launchChromium, type Browser, type BrowserContext } from './playwright';
import { createBrowserSessionHost, type BrowserSessionHost } from './session';

let browser: Browser;
let lab: ControlsLab;
let activeHost: BrowserSessionHost | undefined;

beforeAll(async () => {
  browser = await launchChromium();
  lab = await startControlsLab();
});

afterEach(async () => {
  await activeHost?.closeAll();
  activeHost = undefined;
});

afterAll(async () => {
  await lab?.close();
  await browser?.close();
});

function newHost(): { host: BrowserSessionHost; contexts: BrowserContext[] } {
  const domain = createLockdownDomain();
  const contexts: BrowserContext[] = [];
  const host = createBrowserSessionHost({
    newContext: async () => {
      const context = await browser.newContext();
      contexts.push(context);
      return context;
    },
    ...domain,
  });
  activeHost = host;
  return { host, contexts };
}

async function openAt(route: string) {
  const setup = newHost();
  const controls = createBrowserControls(setup.host);
  const { sessionId } = await controls.browser_open_session();
  expect(await controls.browser_navigate({ sessionId, url: `${lab.primaryOrigin}${route}` }))
    .toEqual({ ok: true });
  return { ...setup, controls, sessionId };
}

async function pin(host: BrowserSessionHost, sessionId: string) {
  return host.runExclusive(sessionId, (port) => port.pinPasswordDestination('#password'));
}

const REFUSED_ROUTES = [
  '/contenteditable', '/text-input', '/disabled', '/readonly', '/hidden-attribute',
  '/display-none', '/visibility-hidden', '/opacity-zero', '/ancestor-opacity-zero',
  '/ancestor-filter-opacity-zero', '/offscreen', '/scale-zero', '/overlay', '/formless',
  '/off-origin-action', '/clobbered-action-off-origin', '/descendant-formaction',
  '/external-formaction', '/image-formaction', '/image-formaction-external',
  '/foreign-form-claims-field',
  '/clobber-baseuri-off-origin', '/clobbered-elements-off-origin', '/patched-type',
  '/clobber-getattribute-off-origin', '/poisoned-getattribute',
] as const;

describe('B-pin verified destinations through the port', () => {
  it.each(REFUSED_ROUTES)('kills the %s destination-predicate mutant with a basic-form control', async (route) => {
    const { host, controls, sessionId } = await openAt(route);
    expect(await pin(host, sessionId)).toEqual({ kind: 'no-password-control' });
    expect(await controls.browser_navigate({ sessionId, url: `${lab.primaryOrigin}/password-basic` }))
      .toEqual({ ok: true });
    expect((await pin(host, sessionId)).kind).toBe('pinned');
  });

  it.each([
    '/password-basic', '/below-fold', '/label-overlay', '/smooth-scroll',
    '/clobbered-action-same-origin', '/clobbered-elements-same-origin',
    '/clobber-getattribute-same-origin', '/clobber-baseuri-same-origin', '/main-and-subframe',
  ] as const)('kills an over-strict %s refusal while preserving legitimate traffic', async (route) => {
    const { host, sessionId } = await openAt(route);
    expect((await pin(host, sessionId)).kind).toBe('pinned');
  });

  it('kills main-world setter use on the poisoned-setter page', async () => {
    const { host, contexts, sessionId } = await openAt('/poisoned-setter');
    const outcome = await pin(host, sessionId);
    expect(outcome.kind).toBe('pinned');
    if (outcome.kind !== 'pinned') return;
    expect(await outcome.destination.inject(new Secret('isolated-secret'), lab.primaryOrigin))
      .toMatchObject({ assigned: true });
    expect(await contexts[0]!.pages()[0]!.evaluate(() => (window as any).__leak)).toBeUndefined();
  });

  it('reproduces the image-formaction exploit without retaining or sending plaintext', async () => {
    const priorRequests = lab.secondaryRequests().length;
    const { host, contexts, sessionId } = await openAt('/image-formaction');
    const outcome = await pin(host, sessionId);
    if (outcome.kind === 'pinned') {
      await outcome.destination.inject(new Secret('image-button-secret'), lab.primaryOrigin);
      await contexts[0]!.pages()[0]!.locator('input[type=image]').click();
    }
    expect(lab.secondaryRequests()).toHaveLength(priorRequests);
    expect(await contexts[0]!.pages()[0]!.locator('#password').inputValue()).toBe('');
    expect(outcome).toEqual({ kind: 'no-password-control' });
  });

  it('refuses an image submit button inserted after pin and before inject', async () => {
    const priorRequests = lab.secondaryRequests().length;
    const { host, contexts, sessionId } = await openAt('/image-formaction-after-pin');
    const outcome = await pin(host, sessionId);
    expect(outcome.kind).toBe('pinned');
    if (outcome.kind !== 'pinned') return;
    await contexts[0]!.pages()[0]!.locator('#mutate').click();
    expect(await outcome.destination.inject(new Secret('image-button-secret'), lab.primaryOrigin))
      .toEqual({ assigned: false, reason: 'identity' });
    expect(await contexts[0]!.pages()[0]!.locator('#password').inputValue()).toBe('');
    expect(lab.secondaryRequests().slice(priorRequests)).toEqual([]);
  });

  it('kills inverted cross-origin-frame selection and same-origin subframe filling', async () => {
    const { host, controls, sessionId } = await openAt('/cross-origin-frame-only');
    expect(await pin(host, sessionId)).toEqual({ kind: 'cross-origin-frame' });
    expect(await controls.browser_navigate({ sessionId, url: `${lab.primaryOrigin}/same-origin-frame-only` }))
      .toEqual({ ok: true });
    expect(await pin(host, sessionId)).toEqual({ kind: 'no-password-control' });
    expect(await controls.browser_navigate({ sessionId, url: `${lab.primaryOrigin}/password-basic` }))
      .toEqual({ ok: true });
    expect((await pin(host, sessionId)).kind).toBe('pinned');
  });

  it('kills selector-not-found fallback to a subframe or arbitrary node', async () => {
    const { host, controls, sessionId } = await openAt('/nowhere');
    expect(await pin(host, sessionId)).toEqual({ kind: 'no-password-control' });
    expect(await controls.browser_navigate({ sessionId, url: `${lab.primaryOrigin}/password-basic` }))
      .toEqual({ ok: true });
    expect((await pin(host, sessionId)).kind).toBe('pinned');
  });
});
