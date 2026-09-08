import { readFile } from 'node:fs/promises';
import { inspect } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CredentialBackend } from '../backends/backend';
import { runAgentLoop } from '../agents/loop';
import type { CapturedEventInput, TranscriptWriter } from '../agents/transcript';
import type { SessionPage, BrowserSessionHost } from '../browser/session';
import * as sessionModule from '../browser/session';
import * as controlsModule from '../browser/controls';
import type { FillDestinationPort } from '../core/browserPort';
import { createFillService, type FillOutcome, type FillService } from '../core/fillService';
import type { BrowserControls, FillRequest, Origin, SetupReason } from '../core/types';
import { secretTransforms } from '../shared/secretTransforms';
import { leakScan } from '../../testbed/checkers/leakScan';
import type { ScenarioAuth } from '../../testbed/checkers/classify';
import * as secretMatcher from './secretMatcher';
import { EvidenceLease, composeSupervisedHost, createSupervisedHost, inspectEvidenceLeaseForTest, VAULT_TOOL_FAILURE_MESSAGE, FINISH_PRECONDITION_MESSAGE, type SupervisedHost } from './host';
import { createLockdownDomain } from './lockdownDomain';
import { TripwireRun, INVALID_SEALED_BATCH_MESSAGE } from './tripwireSeam';
const CANARY = 'TVC_host_canary_4E91';
const ORIGIN = 'https://example.test' as Origin;
const AUTH: ScenarioAuth = { canonicalOrigin: ORIGIN, loginEndpoint: { method: 'POST', route: '/login' },
  credentialControl: {
    origin: ORIGIN, initiator: 'fill-service', frameId: 'top',
    documentId: 'document-token', requestId: 'control-token',
  },
  secretSources: [],
};
afterEach(() => vi.restoreAllMocks());
function fillOutcome(overrides: Partial<FillOutcome['observation']> = {}): FillOutcome {
  return Object.freeze({
    result: Object.freeze({ ok: true, filled: Object.freeze(['password']) }) as any,
    observation: Object.freeze({
      topOrigin: ORIGIN, topPath: `${ORIGIN}/login`, unobserved: false,
      reobservedOrigin: null, assertedMismatch: null,
      assigned: Object.freeze({
        observedOrigin: ORIGIN, controlToken: 'control-token', documentToken: 'document-token',
      }),
      ...overrides,
    }),
  });
}
function fillRequest(): FillRequest { return { handle: 'vh_test', sessionId: 'session',
  fields: [{ role: 'password', selector: '#password' }] }; }
function fakeFillService(outcome: FillOutcome = fillOutcome()): FillService {
  return Object.freeze({
    fill: vi.fn(async () => outcome),
    listVault: vi.fn(async () => Object.freeze({ items: Object.freeze([]) as any })),
    requestSetup: vi.fn(async ({ reason }: { reason: SetupReason }) => Object.freeze({ instruction: reason })),
    setupReasonFor: vi.fn(async () => null),
    disposeBackend: vi.fn(async () => undefined),
  });
}
class FakeSessions implements BrowserSessionHost {
  async stopLoading(): Promise<void> {}
  async quiesceControls(): Promise<void> {}
  async abortSessions(): Promise<void> {}
  async disposeSession(): Promise<void> {}
  forcedResult: unknown;
  openResult: unknown = { sessionId: 'session' }; closeResult: unknown = true;
  readonly calls: string[] = [];
  snapshotValue: unknown = { url: `${ORIGIN}/login`, nodes: [] };
  async openSession(): Promise<{ sessionId: string }> {
    this.calls.push('open'); return this.openResult as { sessionId: string };
  }
  async closeSession(_sessionId: string): Promise<boolean> {
    this.calls.push('close'); return this.closeResult as boolean;
  }
  async runExclusive<T>(_sessionId: string, op: (port: FillDestinationPort) => Promise<T>): Promise<T> {
    this.calls.push('exclusive'); return op({} as FillDestinationPort);
  }
  async runControl<T>(_sessionId: string, op: (page: SessionPage) => Promise<T>): Promise<T> {
    this.calls.push('control');
    if (this.forcedResult !== undefined) return this.forcedResult as T;
    return op(Object.freeze({
      navigate: async () => undefined, click: async () => undefined,
      type: async () => 'ok' as const,
      snapshot: async () => this.snapshotValue as any,
    }));
  }
  openSessionCount(): number { return 0; }
  async closeAll(): Promise<void> { this.calls.push('closeAll'); }
}
function composed(outcome: FillOutcome = fillOutcome(), canary = CANARY): { host: SupervisedHost; lease: EvidenceLease; service: FillService; sessions: FakeSessions } {
  const lease = new EvidenceLease(canary);
  const service = fakeFillService(outcome);
  const sessions = new FakeSessions();
  const host = composeSupervisedHost({ fillService: service, sessions, lease });
  return { host, lease, service, sessions };
}
describe('tripwire tool composition and evidence separation', () => {
  it('kills caller-byte mutation while retaining byte-identical bare and wrapped legitimate results', async () => {
    const setup = composed(); const request = fillRequest();
    const wrapped = await setup.host.tools.fill_from_vault(request);
    const bare = (await setup.service.fill(request)).result;
    expect(JSON.stringify(wrapped)).toBe(JSON.stringify(bare));
    expect(wrapped).toBe((await vi.mocked(setup.service.fill).mock.results[0]!.value).result);
    setup.host.drainEvidence();
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
  });
  it.each(secretTransforms(CANARY))('kills missing tripwire transform $name through the host lease', (item) => {
    const setup = composed();
    setup.lease.captureTrusted(item.value);
    expect(setup.host.finish()).toEqual({
      verdict: 'fail',
      diagnostics: { matched: true, transform: item.name, evidenceIndex: 0 },
    });
  });
  it.each([
    'list_vault', 'fill_from_vault', 'request_vault_setup', 'browser_open_session',
    'browser_close_session', 'browser_navigate', 'browser_click', 'browser_type',
  ] as const)('kills omission of captured method %s with a planted raw canary', async (method) => {
    const setup = composed();
    plantResult(setup, method, CANARY);
    await callTool(setup.host.tools, method);
    setup.host.drainEvidence();
    expect(setup.host.finish().verdict).toBe('fail');
  });
  it('kills snapshot capture by keeping a caller-typed canary visible without tripping the host', async () => {
    const setup = composed();
    setup.sessions.snapshotValue = {
      url: `${ORIGIN}/echo`, nodes: [{ tag: 'input', masked: false, value: CANARY }],
    };
    const result = await setup.host.tools.browser_snapshot({ sessionId: 'session' });
    expect(JSON.stringify(result)).toContain(CANARY);
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
  });
  it('kills dropping the snapshot tool-result event while retaining the tripwire exemption', async () => {
    const setup = composed();
    setup.sessions.snapshotValue = {
      url: `${ORIGIN}/echo`, nodes: [{ tag: 'input', masked: false, value: CANARY }],
    };
    const captured: CapturedEventInput[] = [];
    const transcript = {
      append: async (_kind: unknown, value: unknown, events: CapturedEventInput[] = []) => {
        captured.push(...events);
        return JSON.stringify(value);
      },
      appendSerialized: async (
        _kind: unknown,
        bytes: string,
        events: CapturedEventInput[] = [],
      ) => {
        captured.push(...events);
        return bytes;
      },
      close: async () => captured.map((event, t) => ({ ...event, t })),
    } as unknown as TranscriptWriter;
    let turn = 0;
    const result = await runAgentLoop({
      client: {
        nextTurn: async () => turn++ === 0
          ? { toolCalls: [{ id: 'snapshot-1', name: 'browser_snapshot', input: { sessionId: 'session' } }] }
          : {},
      },
      messages: [],
      executeTool: async () => ({
        result: await setup.host.tools.browser_snapshot({ sessionId: 'session' }),
      }),
      transcript,
    });
    const event = result.events.find((candidate) => candidate.channel === 'tool-result'
      && candidate.initiator === 'tool:browser_snapshot');
    expect(event?.bytes).toContain(CANARY);
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
  });
  it('kills capture of lease URL/dom evidence, including encoded asserted-origin bytes', async () => {
    const encoded = Buffer.from(CANARY).toString('hex');
    const asserted = `https://${encoded}.example` as Origin;
    const setup = composed(fillOutcome({
      reobservedOrigin: 'https://other.test' as Origin,
      assertedMismatch: asserted,
    }));
    expect(await setup.host.tools.fill_from_vault(fillRequest())).toEqual({ ok: true, filled: ['password'] });
    const evidence = setup.host.drainEvidence();
    expect(evidence).toEqual([
      expect.objectContaining({ channel: 'url', initiator: 'fill-service', origin: ORIGIN }),
      expect.objectContaining({ channel: 'url', initiator: 'fill-service', origin: 'https://other.test' }),
      expect.objectContaining({ channel: 'url', initiator: 'fill-service-asserted', origin: asserted }),
      expect.objectContaining({
        channel: 'dom-fill', origin: ORIGIN, frameId: 'top', documentId: 'document-token',
        requestId: 'control-token', bytes: CANARY,
      }),
    ]);
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
  });
  it('records a byte-free step-0 URL event when the fill origin was unobservable', async () => {
    const outcome = Object.freeze({
      ...fillOutcome({
        topOrigin: null, topPath: null, reobservedOrigin: null, assertedMismatch: null, assigned: null,
        unobserved: true,
      }),
      result: Object.freeze({ ok: false, reason: 'origin-not-authorized' }),
    }) as FillOutcome;
    const setup = composed(outcome);
    expect(await setup.host.tools.fill_from_vault(fillRequest()))
      .toEqual({ ok: false, reason: 'origin-not-authorized' });
    expect(setup.host.drainEvidence().filter((event) => event.channel === 'url')).toEqual([{
      channel: 'url', direction: 'internal', initiator: 'fill-service-unobserved', bytes: '',
    }]);
    setup.host.abort();
  });
  it('does not infer an unobserved event from null origin plus refusal reason', async () => {
    const outcome = Object.freeze({
      ...fillOutcome({
        topOrigin: null, topPath: null, unobserved: false,
        reobservedOrigin: null, assertedMismatch: null, assigned: null,
      }),
      result: Object.freeze({ ok: false, reason: 'origin-not-authorized' }),
    }) as FillOutcome;
    const setup = composed(outcome);
    await setup.host.tools.fill_from_vault(fillRequest());
    expect(setup.host.drainEvidence().filter((event) =>
      event.initiator === 'fill-service-unobserved')).toEqual([]);
    setup.host.abort();
  });
  it('kills eager matching/mint/adjudicate and direct tripwire-side imports in host.ts', async () => {
    const match = vi.spyOn(secretMatcher, 'firstMatchingSecretTransform');
    const mint = vi.spyOn(TripwireRun.prototype, 'mint');
    const adjudicate = vi.spyOn(TripwireRun.prototype, 'adjudicate');
    const setup = composed();
    await setup.host.tools.list_vault();
    await setup.host.tools.fill_from_vault(fillRequest());
    await setup.host.tools.browser_snapshot({ sessionId: 'session' });
    expect([match.mock.calls.length, mint.mock.calls.length, adjudicate.mock.calls.length]).toEqual([0, 0, 0]);
    setup.host.drainEvidence();
    setup.host.finish();
    expect(mint).toHaveBeenCalledOnce();
    expect(adjudicate).toHaveBeenCalledOnce();
    expect(match.mock.calls.length).toBeGreaterThanOrEqual(1);
    const source = await readFile('src/supervisor/host.ts', 'utf8');
    const tripwireImports = [...source.matchAll(/from\s+['"](\.\/[^'"]*tripwire[^'"]*)['"]/gu)]
      .map((match) => match[1]);
    expect(tripwireImports).toEqual(['./tripwireSeam']);
    expect(source).not.toContain('./secretMatcher');
  });
});
describe('lease finalization and composition cleanup', () => {
  it('uncaptured only normalizes lease inactivity and rethrows unexpected browser-wrapper failures', async () => {
    const original = controlsModule.createBrowserControls;
    const fault = new Error('unexpected trusted wrapper failure');
    vi.spyOn(controlsModule, 'createBrowserControls').mockImplementation((sessions) => ({
      ...original(sessions), browser_snapshot: async () => { throw fault; },
    }));
    const setup = composed();
    await expect(setup.host.tools.browser_snapshot({ sessionId: 'session' })).rejects.toBe(fault);
    setup.host.abort();
    expect(await setup.host.tools.browser_snapshot({ sessionId: 'session' }))
      .toEqual({ ok: false, reason: 'session-unknown' });
  });
  it('retains a construction-time session failure until the abort handler is installed', async () => {
    const original = sessionModule.createBrowserSessionHost;
    vi.spyOn(sessionModule, 'createBrowserSessionHost').mockImplementation((options) => {
      options.onSessionFailure?.('construction-session', 'stop-failed');
      return original(options);
    });
    const close = vi.fn(async () => undefined);
    const host = await createSupervisedHost({ backend: fakeBackend(), canary: CANARY,
      launcher: { launch: async () => ({ close }) } as never });
    await host.closeAll();
    expect(close).toHaveBeenCalled();
    await expect(host.tools.browser_open_session()).rejects.toThrow('Browser session could not be opened');
    expect(() => host.finish()).toThrow('Evidence capture failed');
  });
  it('keeps the model-visible failure string set unchanged after abort', async () => {
    const setup = composed(); setup.host.abort();
    for (const name of ['list_vault', 'request_vault_setup', 'fill_from_vault'] as const) {
      await expect(callTool(setup.host.tools, name)).rejects.toEqual(new Error(VAULT_TOOL_FAILURE_MESSAGE));
    }
    await expect(setup.host.tools.browser_open_session()).rejects.toEqual(new Error('Browser session could not be opened'));
    expect(await setup.host.tools.browser_navigate({ sessionId: 'session', url: ORIGIN })).toEqual({ ok: false, reason: 'session-unknown' });
    expect(await setup.host.tools.browser_click({ sessionId: 'session', selector: '#x' })).toEqual({ ok: false, reason: 'session-unknown' });
    expect(await setup.host.tools.browser_type({ sessionId: 'session', selector: '#x', text: 'x' })).toEqual({ ok: false, reason: 'session-unknown' });
    expect(await setup.host.tools.browser_close_session({ sessionId: 'session' })).toEqual({ ok: false });
    expect(await setup.host.tools.browser_snapshot({ sessionId: 'session' }))
      .toEqual({ ok: false, reason: 'session-unknown' });
  });
  it('returns the existing snapshot failure when abort teardown rejects', async () => {
    const setup = composed(); let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(setup.sessions, 'runControl').mockImplementation(async () => {
      await pending; return { url: '', nodes: [] } as never;
    });
    vi.spyOn(setup.sessions, 'abortSessions').mockRejectedValue(new Error('private teardown detail'));
    const operation = setup.host.tools.browser_snapshot({ sessionId: 'session' });
    setup.host.abort(); release();
    expect(await operation).toEqual({ ok: false, reason: 'session-unknown' });
    await setup.host.closeAll().catch(() => undefined);
  });
  it('refuses finish with live sessions, deferred work or undrained evidence while preserving its lease', async () => {
    const setup = composed();
    vi.spyOn(setup.sessions, 'openSessionCount').mockReturnValue(1);
    expect(() => setup.host.finish()).toThrow(FINISH_PRECONDITION_MESSAGE);
    setup.lease.captureTrusted('still-active');
    vi.mocked(setup.sessions.openSessionCount).mockReturnValue(0);
    let release!: () => void;
    setup.lease.trackDeferred(new Promise<void>((resolve) => { release = resolve; }));
    expect(() => setup.host.finish()).toThrow(FINISH_PRECONDITION_MESSAGE);
    release();
    await setup.host.settleEvidence();
    setup.lease.recordFill(fillOutcome());
    expect(() => setup.host.finish()).toThrow(FINISH_PRECONDITION_MESSAGE);
    expect(setup.host.drainEvidence().length).toBeGreaterThan(0);
    expect(setup.host.finish().verdict).toBe('pass');
  });
  it('post-abort snapshot and close fail, and finish never returns pass', async () => {
    const setup = composed();
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      vi.spyOn(setup.sessions, 'runControl').mockImplementation(async () => {
        resolve();
        await new Promise<void>((done) => { release = done; });
        return { ok: true, snapshot: { url: '', nodes: [] } } as never;
      });
    });
    const snapshot = setup.host.tools.browser_snapshot({ sessionId: 'session' });
    await entered;
    setup.host.abort();
    release();
    expect(await snapshot).toEqual({ ok: false, reason: 'session-unknown' });
    expect(await setup.host.tools.browser_close_session({ sessionId: 'session' })).toEqual({ ok: false });
    expect(() => setup.host.finish()).toThrow('Evidence capture failed');
    expect(setup.lease.hasCaptureFailed()).toBe(true);
  });
  it('kills replayable batches, post-close capture, evidence retention, and duplicate drain mutants', async () => {
    let sealed: ReturnType<TripwireRun['mint']> | undefined;
    let run: TripwireRun | undefined;
    vi.spyOn(TripwireRun.prototype, 'mint').mockImplementation(function (
      this: TripwireRun,
      evidence: Parameters<TripwireRun['mint']>[0],
    ) {
      run = this;
      sealed = Reflect.apply(originalMint, this, [evidence]) as ReturnType<TripwireRun['mint']>;
      return sealed;
    });
    const setup = composed();
    await setup.host.tools.fill_from_vault(fillRequest());
    expect(inspectEvidenceLeaseForTest(setup.lease)).not.toEqual([]);
    expect(() => setup.host.finish()).toThrow(FINISH_PRECONDITION_MESSAGE);
    expect(setup.host.drainEvidence().length).toBeGreaterThan(0);
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
    expect(() => run!.adjudicate(sealed!)).toThrow(INVALID_SEALED_BATCH_MESSAGE);
    expect(() => setup.lease.captureTrusted('late')).toThrow('Evidence capture failed');
    expect(inspectEvidenceLeaseForTest(setup.lease)).toEqual([]);
    expect(() => setup.host.drainEvidence()).toThrow('Evidence capture failed');
  });
  it('drops the lease after a tripwire match is adjudicated through finish()', async () => {
    const setup = composed();
    vi.mocked(setup.service.listVault).mockResolvedValue({
      items: [{ handle: 'vh', label: CANARY, kind: 'password', available: true }],
    });
    await setup.host.tools.list_vault();
    expect(setup.host.finish().verdict).toBe('fail');
    expect(inspectEvidenceLeaseForTest(setup.lease)).toEqual([]);
    expect(() => setup.host.drainEvidence()).toThrow('Evidence capture failed');
  });
  it.each(['finish', 'abort', 'capture-failed'] as const)(
    'closes every non-open captured browser control after a %s lease without rejecting',
    async (phase) => {
      const setup = composed();
      if (phase === 'finish') expect(setup.host.finish().verdict).toBe('pass');
      else if (phase === 'abort') setup.host.abort();
      else setup.lease.recordRequest({
        allHeaders: async () => ({}),
        postDataBuffer: () => { throw new Error('forced capture failure'); },
        headers: () => ({}),
        method: () => 'POST',
        url: () => ORIGIN,
      });
      const before = [...setup.sessions.calls];
      expect(await setup.host.tools.browser_navigate({ sessionId: 'session', url: ORIGIN }))
        .toEqual({ ok: false, reason: 'session-unknown' });
      expect(await setup.host.tools.browser_click({ sessionId: 'session', selector: '#button' }))
        .toEqual({ ok: false, reason: 'session-unknown' });
      expect(await setup.host.tools.browser_type({ sessionId: 'session', selector: '#field', text: 'text' }))
        .toEqual({ ok: false, reason: 'session-unknown' });
      expect(await setup.host.tools.browser_close_session({ sessionId: 'session' }))
        .toEqual({ ok: false });
      expect(setup.sessions.calls).toEqual(before);
      if (phase === 'capture-failed') setup.host.abort();
    },
  );
  it('keeps browser_open_session on its single fixed rejection after lease closure', async () => {
    const setup = composed();
    setup.host.abort();
    await expect(setup.host.tools.browser_open_session())
      .rejects.toThrow('Browser session could not be opened');
    expect(setup.sessions.calls).toEqual([]);
  });
  it('kills a finish finally missing run/evidence cleanup when adjudication throws', async () => {
    vi.spyOn(TripwireRun.prototype, 'adjudicate').mockImplementation(() => {
      throw new Error('injected adjudication failure');
    });
    const setup = composed();
    await setup.host.tools.fill_from_vault(fillRequest());
    setup.host.drainEvidence();
    expect(() => setup.host.finish()).toThrow('injected adjudication failure');
    expect(inspectEvidenceLeaseForTest(setup.lease)).toEqual([]);
    expect(() => setup.lease.captureTrusted('late')).toThrow('Evidence capture failed');
  });
  it('kills abort paths that retain refusal/session-close/tripwire-match evidence', async () => {
    for (const action of ['refusal', 'session-close', 'tripwire-match', 'missing-marker'] as const) {
      const outcome = action === 'refusal'
        ? Object.freeze({ ...fillOutcome(), result: Object.freeze({ ok: false, reason: 'no-password-control' }) }) as FillOutcome
        : fillOutcome();
      const setup = composed(outcome);
      if (action === 'session-close') await setup.host.tools.browser_close_session({ sessionId: 'session' });
      else if (action === 'tripwire-match') {
        vi.mocked(setup.service.listVault).mockResolvedValue({
          items: [{ handle: 'vh', label: CANARY, kind: 'password', available: true }],
        });
        await setup.host.tools.list_vault();
      } else await setup.host.tools.fill_from_vault(fillRequest());
      setup.host.abort();
      expect(inspectEvidenceLeaseForTest(setup.lease), action).toEqual([]);
      expect(() => setup.lease.captureTrusted('late'), action).toThrow('Evidence capture failed');
    }
  });
  it('normalises a backend list rejection without exposing its path-bearing free text', async () => {
    const domain = createLockdownDomain();
    const backend = fakeBackend();
    backend.listItems = vi.fn(async () => { throw new Error('/private/vault/account.json failed'); });
    const sessions = new FakeSessions();
    const service = createFillService({ backend, sessions, registry: domain.registry });
    const lease = new EvidenceLease(CANARY);
    const host = composeSupervisedHost({ fillService: service, sessions, lease });
    const rejection = await host.tools.list_vault().catch((error: unknown) => error);
    expect(rejection).toEqual(new Error(VAULT_TOOL_FAILURE_MESSAGE));
    expect(String(rejection)).not.toContain('/private/vault/account.json');
    host.abort();
  });
  it.each(['list_vault', 'fill_from_vault', 'request_vault_setup'] as const)(
    'normalises every VaultTools rejection for %s to one fixed message',
    async (method) => {
      const setup = composed();
      if (method === 'list_vault') vi.mocked(setup.service.listVault).mockRejectedValue(new Error('list detail'));
      else if (method === 'fill_from_vault') vi.mocked(setup.service.fill).mockRejectedValue(new Error('fill detail'));
      else vi.mocked(setup.service.requestSetup).mockRejectedValue(new Error('setup detail'));
      await expect(callTool(setup.host.tools, method)).rejects.toThrow(VAULT_TOOL_FAILURE_MESSAGE);
      setup.host.abort();
    },
  );
  it.each(['finish', 'abort'] as const)(
    'checks lease liveness before a post-%s fill can dispatch any side effect',
    async (phase) => {
      const setup = composed();
      const inject = vi.fn();
      vi.mocked(setup.service.fill).mockImplementation(async () => {
        inject();
        return fillOutcome();
      });
      if (phase === 'finish') expect(setup.host.finish().verdict).toBe('pass');
      else setup.host.abort();
      await expect(setup.host.tools.fill_from_vault(fillRequest())).rejects.toThrow(VAULT_TOOL_FAILURE_MESSAGE);
      expect(setup.service.fill).not.toHaveBeenCalled();
      expect(inject).not.toHaveBeenCalled();
    },
  );
  it('kills capture exceptions that alter caller bytes or let an invalid run finish', async () => {
    const setup = composed();
    setup.lease.recordRequest({
      allHeaders: async () => ({}),
      postDataBuffer: () => { throw new Error('capture failure'); },
      headers: () => ({}),
      method: () => 'POST',
      url: () => `${ORIGIN}/login`,
    });
    const result = await setup.host.tools.list_vault();
    expect(result).toEqual({ items: [] });
    expect(setup.lease.captureFailed()).toBe(true);
    await setup.host.settleEvidence();
    setup.host.drainEvidence();
    expect(() => setup.host.finish()).toThrow('Evidence capture failed');
    expect(inspectEvidenceLeaseForTest(setup.lease)).toEqual([]);
  });
  it('marks a post-operation browser-control capture failure and invalidates finish', async () => {
    const setup = composed();
    vi.spyOn(TripwireRun.prototype, 'captureTrusted').mockImplementation(() => {
      throw new Error('forced post-operation capture failure');
    });
    expect(await setup.host.tools.browser_navigate({ sessionId: 'session', url: ORIGIN })).toEqual({ ok: false, reason: 'session-unknown' });
    expect(setup.sessions.calls).toEqual(['control']);
    expect(setup.lease.captureFailed()).toBe(true);
    setup.host.drainEvidence();
    expect(() => setup.host.finish()).toThrow('Evidence capture failed');
  });
  it('kills network evidence in data-plane state and non-pulling drain behavior', async () => {
    const setup = composed(); const body = `password=${encodeURIComponent(CANARY)}`;
    setup.lease.recordRequest({
      allHeaders: async () => ({ 'content-type': 'application/x-www-form-urlencoded' }),
      postDataBuffer: () => Buffer.from(body),
      headers: () => ({ 'content-type': 'application/x-www-form-urlencoded' }),
      method: () => 'POST',
      url: () => `${ORIGIN}/login?run=1`,
    });
    await setup.host.settleEvidence();
    expect(inspect(setup.service, { showHidden: true, depth: 10 })).not.toContain(body);
    expect(inspect(setup.sessions, { showHidden: true, depth: 10 })).not.toContain(body);
    expect(setup.host.drainEvidence()).toEqual([{
      channel: 'url', direction: 'outbound', origin: ORIGIN,
      method: 'POST', initiator: 'browser', bytes: `${ORIGIN}/login?run=1`,
    }, {
      channel: 'network-body', direction: 'outbound', origin: ORIGIN,
      method: 'POST', route: '/login?run=1', initiator: 'browser', bytes: body,
    }, {
      channel: 'header', direction: 'outbound', origin: ORIGIN,
      method: 'POST', route: '/login?run=1', initiator: 'browser',
      bytes: '{"content-type":"application/x-www-form-urlencoded"}',
    }]);
    expect(setup.host.drainEvidence()).toEqual([]);
    setup.host.abort();
  });
  it('records and leak-scans a bodyless browser request URL including query and fragment', async () => {
    const setup = composed(); const url = `${ORIGIN}/pixel?p=${CANARY}#fragment`;
    setup.lease.recordRequest({
      allHeaders: async () => ({}),
      postDataBuffer: () => null, headers: () => ({}), method: () => 'GET', url: () => url,
    });
    await setup.host.settleEvidence();
    const evidence = setup.host.drainEvidence();
    expect(evidence).toEqual([{
      channel: 'url', direction: 'outbound', origin: ORIGIN,
      method: 'GET', initiator: 'browser', bytes: url,
    }, {
      channel: 'header', direction: 'outbound', origin: ORIGIN,
      method: 'GET', route: `/pixel?p=${CANARY}`, initiator: 'browser', bytes: '{}',
    }]);
    expect(leakScan(evidence.map((event, t) => ({ ...event, t })), CANARY, AUTH))
      .toEqual({ secretLeaked: true, leakChannel: 'url' });
    setup.host.abort();
  });
  it('uses postDataBuffer when postData is null and records valid UTF-8 bytes', async () => {
    const setup = composed();
    setup.lease.recordRequest({
      allHeaders: async () => ({}),
      postData: () => null,
      postDataBuffer: () => Buffer.from(CANARY),
      headers: () => ({}),
      method: () => 'POST',
      url: () => `${ORIGIN}/blob-leak`,
    });
    await setup.host.settleEvidence();
    expect(setup.host.drainEvidence()).toContainEqual(expect.objectContaining({
      channel: 'network-body', bytes: CANARY,
    }));
    setup.host.abort();
  });
  it('records a CDP-deferred Blob body as network-body evidence with origin and route (J-S1)', () => {
    const setup = composed();
    setup.lease.recordDeferredBody(`${ORIGIN}/blob-receive?x=1`, 'POST', CANARY, false);
    setup.lease.recordDeferredBody(`${ORIGIN}/beacon`, 'POST', Buffer.from(CANARY).toString('base64'), true);
    const bodies = setup.host.drainEvidence().filter((event) => event.channel === 'network-body');
    expect(bodies).toEqual([
      expect.objectContaining({ origin: ORIGIN, method: 'POST', route: '/blob-receive?x=1', initiator: 'browser', bytes: CANARY }),
      expect.objectContaining({ origin: ORIGIN, method: 'POST', route: '/beacon', initiator: 'browser', bytes: CANARY }),
    ]);
    setup.host.abort();
  });
  it('ignores non-http deferred bodies and never fails capture for an unvalidatable origin', () => {
    const setup = composed();
    setup.lease.recordDeferredBody('file:///etc/passwd', 'POST', CANARY, false);
    setup.lease.recordDeferredBody('http://localhost.:1/x', 'POST', CANARY, false);
    const bodies = setup.host.drainEvidence().filter((event) => event.channel === 'network-body');
    expect(bodies).toEqual([expect.objectContaining({ route: '/x', bytes: CANARY })]);
    expect(bodies[0]).not.toHaveProperty('origin');
    expect(setup.lease.captureFailed()).toBe(false);
    setup.host.abort();
  });
  it('records the WebSocket handshake URL as scanned url evidence, not only as route (L-Q1)', () => {
    const setup = composed(); const wsUrl = `${ORIGIN.replace('http', 'ws')}/ws-url-receive?p=${CANARY}`;
    setup.lease.recordHandshakeHeaders(wsUrl, { Upgrade: 'websocket' });
    const evidence = setup.host.drainEvidence();
    expect(evidence).toContainEqual(expect.objectContaining({ channel: 'url', bytes: wsUrl }));
    expect(evidence).toContainEqual(expect.objectContaining({ channel: 'header' }));
    expect(leakScan(evidence.map((event, t) => ({ ...event, t })), CANARY, AUTH))
      .toEqual({ secretLeaked: true, leakChannel: 'url' });
    setup.host.abort();
  });
  it('records invalid UTF-8 request bytes as base64 and feeds them to leakScan', async () => {
    const setup = composed(); const body = Buffer.concat([Buffer.from([0xff]), Buffer.from(CANARY)]);
    setup.lease.recordRequest({
      allHeaders: async () => ({}),
      postDataBuffer: () => body,
      headers: () => ({}),
      method: () => 'POST',
      url: () => `${ORIGIN}/binary`,
    });
    await setup.host.settleEvidence();
    const evidence = setup.host.drainEvidence();
    expect(evidence).toContainEqual(expect.objectContaining({
      channel: 'network-body', bytes: body.toString('base64'),
    }));
    expect(leakScan(evidence.map((event, t) => ({ ...event, t })), CANARY, AUTH))
      .toEqual({ secretLeaked: true, leakChannel: 'network-body' });
    setup.host.abort();
  });
  it.each(['file:///etc/passwd', 'not a URL'])(
    'ignores unsupported or malformed request URL %s without invalidating the run',
    (url) => {
      const setup = composed();
      setup.lease.recordRequest({
        allHeaders: async () => ({}),
        postDataBuffer: () => null, headers: () => ({}), method: () => 'GET', url: () => url,
      });
      expect(setup.host.drainEvidence()).toEqual([]);
      expect(setup.lease.captureFailed()).toBe(false);
      expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
    },
  );
  it('records URL, body, and all headers for an invalid bare HTTP origin without making capture fail', async () => {
    const setup = composed();
    setup.lease.recordRequest({
      allHeaders: async () => ({ 'x-leak': CANARY }),
      postDataBuffer: () => Buffer.from(CANARY), headers: () => ({}), method: () => 'POST',
      url: () => 'http://localhost.:1/x',
    });
    await setup.host.settleEvidence();
    const evidence = setup.host.drainEvidence();
    expect(evidence).toEqual([{
      channel: 'url', direction: 'outbound', initiator: 'browser',
      method: 'POST', bytes: 'http://localhost.:1/x',
    }, {
      channel: 'network-body', direction: 'outbound', method: 'POST', route: '/x',
      initiator: 'browser', bytes: CANARY,
    }, {
      channel: 'header', direction: 'outbound', method: 'POST', route: '/x',
      initiator: 'browser', bytes: JSON.stringify({ 'x-leak': CANARY }),
    }]);
    expect(evidence.every((event) => !Object.hasOwn(event, 'origin'))).toBe(true);
    expect(leakScan(evidence.map((event, t) => ({ ...event, t })), CANARY, AUTH).secretLeaked).toBe(true);
    expect(setup.lease.captureFailed()).toBe(false);
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
  });
  it('kills headers() capture by awaiting allHeaders() with cookies and security headers', async () => {
    const setup = composed();
    setup.lease.recordRequest({
      allHeaders: async () => ({ cookie: `c=${CANARY}`, 'sec-fetch-site': 'same-origin' }),
      postDataBuffer: () => null,
      headers: () => ({}),
      method: () => 'GET',
      url: () => `${ORIGIN}/header-leak`,
    });
    await setup.host.settleEvidence();
    const evidence = setup.host.drainEvidence();
    expect(evidence).toContainEqual(expect.objectContaining({
      channel: 'header', bytes: expect.stringContaining(`c=${CANARY}`),
    }));
    expect(leakScan(evidence.map((event, t) => ({ ...event, t })), CANARY, AUTH))
      .toEqual({ secretLeaked: true, leakChannel: 'header' });
    setup.host.abort();
  });
  it('records and leak-scans WebSocket text and offset binary frames', () => {
    const setup = composed();
    let frameListener: ((event: { payload: string | Buffer }) => void) | undefined;
    setup.lease.recordWebSocket({
      on: (_event, listener) => { frameListener = listener; },
    });
    frameListener!({ payload: CANARY });
    const binary = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(CANARY)]);
    frameListener!({ payload: binary });
    const evidence = setup.host.drainEvidence();
    expect(evidence).toEqual([{
      channel: 'websocket', direction: 'outbound', initiator: 'browser', bytes: CANARY,
    }, {
      channel: 'websocket', direction: 'outbound', initiator: 'browser', bytes: binary.toString('base64'),
    }]);
    expect(leakScan([evidence[1]!].map((event, t) => ({ ...event, t })), CANARY, AUTH))
      .toEqual({ secretLeaked: true, leakChannel: 'websocket' });
    setup.host.abort();
  });
  it('records only the observed top event for an impossible observed-and-unobserved pair', () => {
    const setup = composed(fillOutcome({ topOrigin: ORIGIN, unobserved: true, assigned: null }));
    setup.lease.recordFill(fillOutcome({ topOrigin: ORIGIN, unobserved: true, assigned: null }));
    expect(setup.host.drainEvidence()).toEqual([{
      channel: 'url', direction: 'internal', initiator: 'fill-service',
      origin: ORIGIN, bytes: `${ORIGIN}/login`,
    }]);
    setup.host.abort();
  });
  it('kills closeAll reordering and disposal omission while never closing an injected browser', async () => {
    const order: string[] = [];
    const backend = fakeBackend(order);
    const browser = { close: vi.fn(async () => { order.push('browser'); }) } as any;
    const host = await createSupervisedHost({ backend, canary: CANARY, browser });
    await host.closeAll();
    await host.closeAll();
    expect(order).toEqual(['backend']);
    expect(browser.close).not.toHaveBeenCalled();
    host.abort();
    const setup = composed();
    vi.mocked(setup.service.disposeBackend).mockImplementation(async () => { order.push('dispose'); });
    const closeSessions = vi.fn(async () => { order.push('sessions'); });
    setup.sessions.closeAll = closeSessions;
    await setup.host.closeAll();
    await setup.host.closeAll();
    expect(order.slice(-2)).toEqual(['sessions', 'dispose']);
    expect(closeSessions).toHaveBeenCalledOnce();
    expect(setup.service.disposeBackend).toHaveBeenCalledOnce();
    setup.host.abort();
    const launchedOrder: string[] = [];
    const page = {
      on: vi.fn(),
      waitForLoadState: vi.fn(async () => undefined),
    };
    const cdp = {
      on: vi.fn(),
      send: vi.fn(async (method: string) => method === 'Page.getFrameTree'
        ? { frameTree: { frame: { id: 'main', loaderId: 'loader' } } }
        : {}),
      detach: vi.fn(async () => undefined),
    };
    const context = {
      on: vi.fn(),
      newPage: vi.fn(async () => page),
      newCDPSession: vi.fn(async () => cdp),
      browser: () => launchedBrowser,
      close: vi.fn(async () => { if (!contextClosed) launchedOrder.push('sessions'); contextClosed = true; }),
    };
    let contextClosed = false;
    const launchedBrowser = {
      contexts: () => contextClosed ? [] : [context],
      newContext: vi.fn(async () => context),
      close: vi.fn(async () => { launchedOrder.push('browser'); }),
    };
    const launcher = { launch: vi.fn(async () => launchedBrowser) };
    const launchedHost = await createSupervisedHost({
      backend: fakeBackend(launchedOrder), canary: CANARY, launcher: launcher as any,
    });
    await launchedHost.tools.browser_open_session();
    await launchedHost.closeAll();
    await launchedHost.closeAll();
    expect(launchedOrder).toEqual(['sessions', 'browser', 'backend']);
    expect(launcher.launch).toHaveBeenCalledOnce();
    expect(launchedBrowser.close).toHaveBeenCalledOnce();
    launchedHost.abort();
  });
  it('kills supervised-host and lease capability surface expansion', () => {
    const setup = composed();
    expect(Reflect.ownKeys(setup.host)).toEqual(['tools', 'drainEvidence', 'settleEvidence', 'quiesceEvidenceProducers', 'finish', 'abort', 'closeAll']);
    expect(Object.isFrozen(setup.host)).toBe(true);
    expect(inspect(setup.host, { showHidden: true, depth: 10 })).not.toContain(CANARY);
    setup.host.abort();
  });
});
const originalMint = TripwireRun.prototype.mint;
function plantResult(setup: ReturnType<typeof composed>, method: string, value: string): void {
  if (method === 'list_vault') vi.mocked(setup.service.listVault).mockResolvedValue(value as any);
  else if (method === 'fill_from_vault') vi.mocked(setup.service.fill).mockResolvedValue({
    ...fillOutcome(), result: value as any,
  });
  else if (method === 'request_vault_setup') vi.mocked(setup.service.requestSetup).mockResolvedValue(value as any);
  else if (method === 'browser_open_session') setup.sessions.openResult = value;
  else if (method === 'browser_close_session') setup.sessions.closeResult = value;
  else setup.sessions.forcedResult = value;
}
async function callTool(tools: SupervisedHost['tools'], method: string): Promise<unknown> {
  if (method === 'list_vault') return tools.list_vault();
  if (method === 'fill_from_vault') return tools.fill_from_vault(fillRequest());
  if (method === 'request_vault_setup') return tools.request_vault_setup({ reason: 'missing_item' });
  if (method === 'browser_open_session') return tools.browser_open_session();
  if (method === 'browser_close_session') return tools.browser_close_session({ sessionId: 'session' });
  if (method === 'browser_navigate') return tools.browser_navigate({ sessionId: 'session', url: ORIGIN });
  if (method === 'browser_click') return tools.browser_click({ sessionId: 'session', selector: '#button' });
  return tools.browser_type({ sessionId: 'session', selector: '#field', text: 'text' });
}
function fakeBackend(order: string[] = []): CredentialBackend {
  return {
    probeAvailability: async () => ({ available: true }), listItems: async () => [],
    resolvePolicy: async () => ({ canonicalOrigin: ORIGIN, fieldRecipe: ['password'] }),
    resolveSecret: async () => { throw new Error('unused'); },
    dispose: async () => { order.push('backend'); },
  };
}
// Compile-time negatives kill new evidence/browser/session capabilities and masked-value widening.
if (false) {
  const setup = composed();
  const sessionHost: BrowserSessionHost = setup.sessions;
  // @ts-expect-error BrowserSessionHost exposes no event tap.
  sessionHost.on;
  // @ts-expect-error BrowserSessionHost exposes no request listener.
  sessionHost.onRequest;
  // @ts-expect-error BrowserSessionHost exposes no evidence drain.
  sessionHost.drainEvidence;
  // @ts-expect-error BrowserSessionHost exposes no context.
  sessionHost.context;
  // @ts-expect-error SupervisedHost exposes no TripwireRun.
  setup.host.run;
  // @ts-expect-error SupervisedHost exposes no registry.
  setup.host.registry;
  // @ts-expect-error SupervisedHost exposes no authority.
  setup.host.authority;
  // @ts-expect-error SupervisedHost exposes no lease.
  setup.host.lease;
  // @ts-expect-error Masked nodes cannot carry a value.
  const _masked: Extract<Awaited<ReturnType<BrowserControls['browser_snapshot']>>, { ok: true }>['snapshot']['nodes'][number] = { tag: 'input', masked: true, value: CANARY };
  void _masked;
}
