import type { BrowserSessionHost, SessionPage } from '../browser/session';
import type { FillDestinationPort } from '../core/browserPort';
import type { FillOutcome, FillService } from '../core/fillService';
import type { BrowserControls } from '../core/types';

const TIMING_PREFIX = 'timing-prefix:';
const TIMING_SUFFIX = ':timing-suffix';

function timingLabel(payload: string): string {
  const shaped = `${TIMING_PREFIX}${payload}${TIMING_SUFFIX}`;
  return JSON.parse(JSON.stringify(shaped)) as string;
}

function flatCopy(value: string): string {
  return String.fromCharCode(...Array.from(value, (character) => character.charCodeAt(0)));
}

function isFlatCopyBody(source: string): boolean {
  return source.includes('String.fromCharCode(...Array.from(') && !source.includes('return value;');
}

function rotateFinalCharacter(value: string): string {
  const final = value.at(-1);
  if (final === undefined) throw new Error('Timing canary must not be empty');
  const rotated = final === '9' ? '0' : String.fromCharCode(final.charCodeAt(0) + 1);
  return `${value.slice(0, -1)}${rotated}`;
}

function characterClassShape(value: string): string {
  return [...value].map((character) => {
    if (/[A-Z]/u.test(character)) return 'U';
    if (/[a-z]/u.test(character)) return 'L';
    if (/[0-9]/u.test(character)) return 'D';
    return 'P';
  }).join('');
}

function timingService(payload: string): FillService {
  const outcome: FillOutcome = {
    result: { ok: false, reason: 'no-password-control' },
    observation: {
      topOrigin: null, topPath: null, unobserved: false,
      reobservedOrigin: null, assertedMismatch: null, assigned: null,
    },
  };
  return {
    fill: async () => outcome,
    listVault: async () => timingVaultResult(payload),
    requestSetup: async () => ({ instruction: 'fixed' }),
    setupReasonFor: async () => null,
    disposeBackend: async () => undefined,
  };
}

function timingVaultResult(payload: string) {
  return {
    items: [{ handle: 'vh', label: timingLabel(payload), kind: 'password' as const, available: true }],
  };
}

function browserClickTimingService(
  controls: BrowserControls,
  sessionId: string,
  payload: string,
): FillService {
  return {
    ...timingService(payload),
    fill: async () => {
      const clicked = await controls.browser_click({ sessionId, selector: '#button' });
      if (!clicked.ok) throw new Error('Timing probe browser click failed');
      return timingFillOutcome(payload);
    },
  };
}

function timingFillOutcome(payload: string): FillOutcome {
  return {
    result: { ok: true, filled: [timingLabel(payload)] } as unknown as FillOutcome['result'],
    observation: {
      topOrigin: null, topPath: null, unobserved: false,
      reobservedOrigin: null, assertedMismatch: null, assigned: null,
    },
  };
}

class TimingSessions implements BrowserSessionHost {
  async disposeSession(): Promise<void> {}
  async stopLoading(): Promise<void> {}
  async quiesceControls(): Promise<void> {}
  async abortSessions(): Promise<void> {}
  async openSession(): Promise<{ sessionId: string }> { return { sessionId: 'session' }; }
  async closeSession(): Promise<boolean> { return true; }
  async runExclusive<T>(_id: string, op: (port: FillDestinationPort) => Promise<T>): Promise<T> {
    return op({} as FillDestinationPort);
  }
  async runControl<T>(_id: string, op: (page: SessionPage) => Promise<T>): Promise<T> {
    return op({
      navigate: async () => undefined,
      click: async () => undefined,
      type: async () => 'ok',
      snapshot: async () => ({ url: '', nodes: [] }),
    });
  }
  openSessionCount(): number { return 0; }
  async closeAll(): Promise<void> {}
}

export { timingLabel, flatCopy, isFlatCopyBody, rotateFinalCharacter, characterClassShape, timingService, timingVaultResult, browserClickTimingService, timingFillOutcome, TimingSessions };
