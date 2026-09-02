import { SessionHostError } from '../core/browserPort';
import { validateBareOrigin } from '../core/originGuard';
import type { BrowserControls, BrowserOpResult } from '../core/types';
import {
  createBrowserFailure,
  createBrowserOk,
  createSnapshotResult,
  type BrowserFailureReason,
} from './controlResults';
import type { BrowserSessionHost } from './session';

export const BROWSER_OPEN_FAILURE_MESSAGE = 'Browser session could not be opened';

export function createBrowserControls(sessions: BrowserSessionHost): BrowserControls {
  const controls: BrowserControls = {
    async browser_open_session() {
      try {
        return Object.freeze(await sessions.openSession());
      } catch {
        throw new Error(BROWSER_OPEN_FAILURE_MESSAGE);
      }
    },
    async browser_close_session({ sessionId }) {
      try {
        return Object.freeze({ ok: await sessions.closeSession(sessionId) });
      } catch {
        return Object.freeze({ ok: false });
      }
    },
    browser_navigate: ({ sessionId, url }) => navigate(sessions, sessionId, url),
    browser_click: ({ sessionId, selector }) => click(sessions, sessionId, selector),
    browser_type: ({ sessionId, selector, text }) => type(sessions, sessionId, selector, text),
    browser_snapshot: ({ sessionId }) => snapshot(sessions, sessionId),
  };
  return Object.freeze(controls);
}

async function navigate(
  sessions: BrowserSessionHost,
  sessionId: string,
  url: string,
): Promise<BrowserOpResult> {
  let valid = false;
  try {
    return await sessions.runControl(sessionId, async (page) => {
      valid = isValidNavigationUrl(url);
      if (!valid) return createBrowserFailure('invalid-url');
      await page.navigate(url);
      return createBrowserOk();
    });
  } catch (error) {
    return createBrowserFailure(mapFailure(error, valid ? 'navigation-failed' : 'invalid-url'));
  }
}

async function click(
  sessions: BrowserSessionHost,
  sessionId: string,
  selector: string,
): Promise<BrowserOpResult> {
  try {
    return await sessions.runControl(sessionId, async (page) => {
      await page.click(selector);
      return createBrowserOk();
    });
  } catch (error) {
    return createBrowserFailure(mapFailure(error, 'no-such-element'));
  }
}

async function type(
  sessions: BrowserSessionHost,
  sessionId: string,
  selector: string,
  text: string,
): Promise<BrowserOpResult> {
  try {
    return await sessions.runControl(sessionId, async (page) => {
      const result = await page.type(selector, text);
      return result === 'locked-field' ? createBrowserFailure('locked-field') : createBrowserOk();
    });
  } catch (error) {
    return createBrowserFailure(mapFailure(error, 'no-such-element'));
  }
}

async function snapshot(sessions: BrowserSessionHost, sessionId: string) {
  try {
    return await sessions.runControl(sessionId, async (page) => createSnapshotResult(await page.snapshot()));
  } catch {
    return createSnapshotResult();
  }
}

function isValidNavigationUrl(input: string): boolean {
  try {
    const parsed = new URL(input);
    validateBareOrigin(parsed.origin);
    return true;
  } catch {
    return false;
  }
}

function mapFailure(error: unknown, fallback: BrowserFailureReason): BrowserFailureReason {
  if (!(error instanceof SessionHostError)) return fallback;
  if (error.kind === 'unknown-session' || error.kind === 'closing') return 'session-unknown';
  return fallback;
}
