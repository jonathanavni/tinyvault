import * as crypto from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { SessionHostError } from '../core/browserPort';
import { SessionMutex } from '../core/sessionMutex';
import { createLockdownDomain } from '../supervisor/lockdownDomain';
import { startControlsLab, type ControlsLab } from '../../testbed/fixtures/controls-lab';
import { createBrowserControls } from './controls';
import { launchChromium, type Browser } from './playwright';
import { createBrowserSessionHost, type BrowserSessionHost } from './session';

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, randomBytes: vi.fn(actual.randomBytes) };
});

let browser: Browser;
let lab: ControlsLab;
let host: BrowserSessionHost | undefined;

beforeAll(async () => {
  browser = await launchChromium();
  lab = await startControlsLab();
});

afterEach(async () => {
  await host?.closeAll();
  host = undefined;
  vi.restoreAllMocks();
});

afterAll(async () => {
  await lab?.close();
  await browser?.close();
});

function newHost(): BrowserSessionHost {
  const domain = createLockdownDomain();
  host = createBrowserSessionHost({ newContext: () => browser.newContext(), ...domain });
  return host;
}

describe('F-isolation session ownership and mutex', () => {
  it('kills shared-context cookie/localStorage state while retaining independent navigation', async () => {
    const sessions = newHost();
    const controls = createBrowserControls(sessions);
    const first = await controls.browser_open_session();
    const second = await controls.browser_open_session();
    expect(await controls.browser_navigate({
      sessionId: first.sessionId, url: `${lab.primaryOrigin}/storage?set=alpha`,
    })).toEqual({ ok: true });
    expect(await controls.browser_navigate({
      sessionId: second.sessionId, url: `${lab.primaryOrigin}/storage`,
    })).toEqual({ ok: true });
    const firstSnapshot = await controls.browser_snapshot(first);
    const secondSnapshot = await controls.browser_snapshot(second);
    expect(firstSnapshot).toMatchObject({
      ok: true, snapshot: { nodes: [{ value: 'alpha' }, { value: 'alpha' }] },
    });
    expect(secondSnapshot).toMatchObject({
      ok: true, snapshot: { nodes: [{ tag: 'input', masked: false }, { tag: 'input', masked: false }] },
    });
    if (secondSnapshot.ok) {
      expect(secondSnapshot.snapshot.nodes.every((node) => !('value' in node))).toBe(true);
    }
  });

  it('kills sequential/predictable ids by spying randomBytes(16) and requiring 100 distinct ids', async () => {
    const random = vi.mocked(crypto.randomBytes);
    random.mockClear();
    const sessions = newHost();
    const controls = createBrowserControls(sessions);
    const ids: string[] = [];
    for (let index = 0; index < 100; index += 1) {
      ids.push((await controls.browser_open_session()).sessionId);
    }
    expect(new Set(ids).size).toBe(100);
    expect(ids.every((id) => /^[0-9a-f]{32}$/u.test(id))).toBe(true);
    expect(random).toHaveBeenCalledTimes(100);
    expect(random.mock.calls.every((call) => call[0] === 16)).toBe(true);
  });

  it('kills control methods that bypass the one per-session mutex', async () => {
    const acquisition = vi.spyOn(SessionMutex.prototype, 'runExclusive');
    const sessions = newHost();
    const controls = createBrowserControls(sessions);
    const session = await controls.browser_open_session();
    await controls.browser_navigate({ sessionId: session.sessionId, url: `${lab.primaryOrigin}/controls` });
    await controls.browser_click({ sessionId: session.sessionId, selector: '#button' });
    await controls.browser_type({ sessionId: session.sessionId, selector: '#username', text: 'person' });
    await controls.browser_snapshot(session);
    expect(acquisition).toHaveBeenCalledTimes(4);
    expect(acquisition.mock.calls.every((call) => call[0] === session.sessionId)).toBe(true);
  });

  it('kills a wider page-bearing fill port by asserting the exact frozen façade', async () => {
    const sessions = newHost();
    const controls = createBrowserControls(sessions);
    const session = await controls.browser_open_session();
    await controls.browser_navigate({ sessionId: session.sessionId, url: `${lab.primaryOrigin}/password-basic` });
    await sessions.runExclusive(session.sessionId, async (port) => {
      expect(Reflect.ownKeys(port)).toEqual([
        'documentEpoch', 'observeTop', 'pinPasswordDestination',
      ]);
      expect(Object.isFrozen(port)).toBe(true);
      expect(await port.observeTop()).toEqual({
        origin: lab.primaryOrigin, path: `${lab.primaryOrigin}/password-basic`,
      });
    });
  });

  it('kills queued self-reentrancy at the port and maps it to the fixed tool result', async () => {
    const sessions = newHost();
    const controls = createBrowserControls(sessions);
    const session = await controls.browser_open_session();
    await controls.browser_navigate({ sessionId: session.sessionId, url: `${lab.primaryOrigin}/controls` });
    await sessions.runExclusive(session.sessionId, async () => {
      await expect(sessions.runExclusive(session.sessionId, async () => undefined))
        .rejects.toMatchObject({ kind: 'reentrant' } satisfies Partial<SessionHostError>);
      expect(await controls.browser_snapshot(session)).toEqual({ ok: false, reason: 'session-unknown' });
    });
    expect(await controls.browser_snapshot(session)).toMatchObject({ ok: true });
  });
});
