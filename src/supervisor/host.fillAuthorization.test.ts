import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Browser } from '../browser/playwright';
import type { CredentialBackend } from '../backends/backend';
import type { BrowserSessionHost, SessionPage } from '../browser/session';
import type { FillDestinationPort } from '../core/browserPort';
import { createFillService } from '../core/fillService';
import { Secret } from '../core/redaction';
import { createFillAuthorizationDomain } from './fillAuthorizationDomain';
import { createLockdownDomain } from './lockdownDomain';
import { createSupervisedHost, composeSupervisedHost, EvidenceLease, OP_TIMEOUT_MS } from './host';

const ORIGIN = 'https://runtime.test';
function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
class FillSessions implements BrowserSessionHost {
  constructor(readonly port: (id: string) => FillDestinationPort) {}
  async runExclusive<T>(id: string, op: (port: FillDestinationPort) => Promise<T>): Promise<T> { return op(this.port(id)); }
  async runControl<T>(_id: string, _op: (page: SessionPage) => Promise<T>): Promise<T> { throw new Error('unused'); }
  async openSession() { return { sessionId: 'session' }; }
  async closeSession() { return true; }
  async stopLoading() {}
  async quiesceControls() {}
  async abortSessions() {}
  async disposeSession() {}
  openSessionCount() { return 0; }
  async closeAll() {}
}
function composition(beforePin: () => Promise<void> = async () => {}) {
  const domain = createLockdownDomain(), authority = createFillAuthorizationDomain();
  const sessions = new FillSessions(id => ({
    documentEpoch: () => 0,
    observeTop: async () => ({ origin: ORIGIN, path: `${ORIGIN}/login` }),
    pinPasswordDestination: async () => {
      await beforePin();
      return { kind: 'pinned', destination: {
        identity: domain.authority.mint({ sessionId: id, documentId: 'doc', frameId: 'top', elementId: 'password' }),
        inject: async secret => {
          secret.consume();
          return { assigned: true, observedOrigin: ORIGIN, documentToken: null, controlToken: null };
        },
      } };
    },
  }));
  const backend: CredentialBackend = {
    probeAvailability: async () => ({ available: true }), listItems: async () => [],
    resolvePolicy: async () => ({ canonicalOrigin: ORIGIN, fieldRecipe: ['password'] }),
    resolveSecret: vi.fn(async () => new Secret('synthetic-password')), dispose: async () => {},
  };
  const service = createFillService({ backend, sessions, registry: domain.registry, authorization: authority.authorization });
  const host = composeSupervisedHost({ fillService: service, sessions, lease: new EvidenceLease('TVC_runtime_123456789') });
  return { host, service, backend, sessions };
}
function request(sessionId: string) {
  return { sessionId, handle: 'handle', fields: [{ role: 'password' as const, selector: '#password' }] };
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('T-RC-6b Fake-port concurrency and expiry', () => {
  it('two fills parked at the pin gate receive exactly one assigned result', async () => {
    const held = gate(), entered = gate(); let pins = 0;
    const setup = composition(async () => { if (++pins === 2) entered.release(); await held.promise; });
    const first = setup.host.tools.fill_from_vault(request('first'));
    const second = setup.host.tools.fill_from_vault(request('second'));
    try {
      await entered.promise; held.release();
      const results = await Promise.all([first, second]);
      expect(results.filter(result => result.ok)).toHaveLength(1);
      expect(results.filter(result => !result.ok)).toEqual([{ ok: false, reason: 'handle-exhausted' }]);
      expect(setup.backend.resolveSecret).toHaveBeenCalledOnce();
    } finally { held.release(); await Promise.allSettled([first, second]); setup.host.abort(); await setup.host.closeAll(); }
  });
  it('bounded expiry after assignment returns no-password-control but consumes the handle', async () => {
    vi.useFakeTimers();
    const setup = composition(), held = gate(), assigned = gate();
    const fill = setup.service.fill;
    // Keep the actual fill outcome/settlement; hold only delivery to the bounded host wrapper.
    const wrapped = { ...setup.service, fill: async (...args: Parameters<typeof fill>) => {
      const outcome = await fill(...args); assigned.release(); await held.promise; return outcome;
    } };
    const host = composeSupervisedHost({ fillService: wrapped, sessions: setup.sessions,
      lease: new EvidenceLease('TVC_runtime_123456789') });
    const operation = host.tools.fill_from_vault(request('first'));
    try {
      await assigned.promise;
      await vi.advanceTimersByTimeAsync(OP_TIMEOUT_MS + 1);
      held.release();
      expect(await operation).toEqual({ ok: false, reason: 'no-password-control' });
      expect(await host.tools.fill_from_vault(request('fresh'))).toEqual({ ok: false, reason: 'handle-exhausted' });
      expect(setup.backend.resolveSecret).toHaveBeenCalledOnce();
    } finally { held.release(); await operation; host.abort(); setup.host.abort(); await host.closeAll(); await setup.host.closeAll(); }
  });
});

describe('Throwing fill-authorization hook cleanup', () => {
  it.each([false, true])('closes only an owned browser (caller supplied: %s)', async supplied => {
    const close = vi.fn(async () => {}), browser = { close } as unknown as Browser;
    const launch = vi.fn(async () => browser), error = new Error('hook failed');
    await expect(createSupervisedHost({ backend: {} as CredentialBackend, canary: 'TVC_hook_123456789',
      launcher: { launch }, ...(supplied ? { browser } : {}),
      onFillAuthorization: () => { throw error; },
    })).rejects.toBe(error);
    expect(launch).toHaveBeenCalledTimes(supplied ? 0 : 1);
    expect(close).toHaveBeenCalledTimes(supplied ? 0 : 1);
  });
  it('awaits a rejected async hook and closes the owned browser once', async () => {
    const error = new Error('async hook failed'), close = vi.fn(async () => {});
    await expect(createSupervisedHost({ backend: {} as CredentialBackend, canary: 'TVC_hook_123456789',
      launcher: { launch: async () => ({ close }) as unknown as Browser },
      onFillAuthorization: async () => { throw error; },
    })).rejects.toBe(error);
    expect(close).toHaveBeenCalledOnce();
  });
  it('preserves the hook error when owned-browser close rejects', async () => {
    const error = new Error('hook failed'), close = vi.fn(async () => { throw new Error('close failed'); });
    await expect(createSupervisedHost({ backend: {} as CredentialBackend, canary: 'TVC_hook_123456789',
      launcher: { launch: async () => ({ close }) as unknown as Browser },
      onFillAuthorization: () => { throw error; },
    })).rejects.toBe(error);
    expect(close).toHaveBeenCalledOnce();
  });
});
