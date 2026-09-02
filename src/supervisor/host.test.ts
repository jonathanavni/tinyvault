import { readFile } from 'node:fs/promises';
import { inspect } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CredentialBackend } from '../backends/backend';
import { runAgentLoop } from '../agents/loop';
import type { CapturedEventInput, TranscriptWriter } from '../agents/transcript';
import type { SessionPage, BrowserSessionHost } from '../browser/session';
import type { FillDestinationPort } from '../core/browserPort';
import type { FillOutcome, FillService } from '../core/fillService';
import type { BrowserControls, FillRequest, Origin, SetupReason } from '../core/types';
import { secretTransforms } from '../shared/secretTransforms';
import * as secretMatcher from './secretMatcher';
import {
  EvidenceLease,
  composeSupervisedHost,
  createSupervisedHost,
  inspectEvidenceLeaseForTest,
  type SupervisedHost,
} from './host';
import { TripwireRun, INVALID_SEALED_BATCH_MESSAGE } from './tripwireSeam';

const CANARY = 'TVC_host_canary_4E91';
const ORIGIN = 'https://example.test' as Origin;

afterEach(() => vi.restoreAllMocks());

function fillOutcome(overrides: Partial<FillOutcome['observation']> = {}): FillOutcome {
  return Object.freeze({
    result: Object.freeze({ ok: true, filled: Object.freeze(['password']) }) as any,
    observation: Object.freeze({
      topOrigin: ORIGIN,
      topPath: `${ORIGIN}/login`,
      reobservedOrigin: null,
      assertedMismatch: null,
      assigned: Object.freeze({
        observedOrigin: ORIGIN, controlToken: 'control-token', documentToken: 'document-token',
      }),
      ...overrides,
    }),
  });
}

function fillRequest(): FillRequest {
  return { handle: 'vh_test', sessionId: 'session', fields: [{ role: 'password', selector: '#password' }] };
}

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
  forcedResult: unknown;
  openResult: unknown = { sessionId: 'session' };
  closeResult: unknown = true;
  readonly calls: string[] = [];
  snapshotValue: unknown = { url: `${ORIGIN}/login`, nodes: [] };

  async openSession(): Promise<{ sessionId: string }> {
    this.calls.push('open');
    return this.openResult as { sessionId: string };
  }

  async closeSession(_sessionId: string): Promise<boolean> {
    this.calls.push('close');
    return this.closeResult as boolean;
  }

  async runExclusive<T>(_sessionId: string, op: (port: FillDestinationPort) => Promise<T>): Promise<T> {
    this.calls.push('exclusive');
    return op({} as FillDestinationPort);
  }

  async runControl<T>(_sessionId: string, op: (page: SessionPage) => Promise<T>): Promise<T> {
    this.calls.push('control');
    if (this.forcedResult !== undefined) return this.forcedResult as T;
    return op(Object.freeze({
      navigate: async () => undefined,
      click: async () => undefined,
      type: async () => 'ok' as const,
      snapshot: async () => this.snapshotValue as any,
    }));
  }

  openSessionCount(): number { return 0; }
  async closeAll(): Promise<void> { this.calls.push('closeAll'); }
}

function composed(
  outcome: FillOutcome = fillOutcome(),
  canary = CANARY,
): { host: SupervisedHost; lease: EvidenceLease; service: FillService; sessions: FakeSessions } {
  const lease = new EvidenceLease(canary);
  const service = fakeFillService(outcome);
  const sessions = new FakeSessions();
  const host = composeSupervisedHost({ fillService: service, sessions, lease });
  return { host, lease, service, sessions };
}

describe('tripwire tool composition and evidence separation', () => {
  it('kills caller-byte mutation while retaining byte-identical bare and wrapped legitimate results', async () => {
    const setup = composed();
    const request = fillRequest();
    const wrapped = await setup.host.tools.fill_from_vault(request);
    const bare = (await setup.service.fill(request)).result;
    expect(JSON.stringify(wrapped)).toBe(JSON.stringify(bare));
    expect(wrapped).toBe((await vi.mocked(setup.service.fill).mock.results[0]!.value).result);
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
      tools: [],
      handlers: {
        browser_snapshot: async () => ({
          result: await setup.host.tools.browser_snapshot({ sessionId: 'session' }),
        }),
      },
      transcript,
    });
    const event = result.events.find((candidate) => candidate.channel === 'tool-result'
      && candidate.initiator === 'browser_snapshot');
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

  it('kills eager matching/mint/adjudicate and direct tripwire-side imports in host.ts', async () => {
    const match = vi.spyOn(secretMatcher, 'firstMatchingSecretTransform');
    const mint = vi.spyOn(TripwireRun.prototype, 'mint');
    const adjudicate = vi.spyOn(TripwireRun.prototype, 'adjudicate');
    const setup = composed();
    await setup.host.tools.list_vault();
    expect([match.mock.calls.length, mint.mock.calls.length, adjudicate.mock.calls.length]).toEqual([0, 0, 0]);
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
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
    expect(() => run!.adjudicate(sealed!)).toThrow(INVALID_SEALED_BATCH_MESSAGE);
    expect(() => setup.lease.captureTrusted('late')).toThrow('Evidence capture failed');
    expect(inspectEvidenceLeaseForTest(setup.lease)).toEqual([]);
    expect(setup.host.drainEvidence()).toEqual([]);
  });

  it('kills a finish finally missing run/evidence cleanup when adjudication throws', async () => {
    vi.spyOn(TripwireRun.prototype, 'adjudicate').mockImplementation(() => {
      throw new Error('injected adjudication failure');
    });
    const setup = composed();
    await setup.host.tools.fill_from_vault(fillRequest());
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

  it('kills a missing tool-throw finally by aborting the lease after the operation rejects', async () => {
    const setup = composed();
    vi.mocked(setup.service.listVault).mockRejectedValue(new Error('tool operation failed'));
    try {
      await setup.host.tools.list_vault();
      throw new Error('expected tool failure');
    } catch (error) {
      expect(error).toEqual(new Error('tool operation failed'));
    } finally {
      setup.host.abort();
    }
    expect(inspectEvidenceLeaseForTest(setup.lease)).toEqual([]);
    expect(() => setup.lease.captureTrusted('late')).toThrow('Evidence capture failed');
  });

  it('kills capture exceptions that alter caller bytes or let an invalid run finish', async () => {
    const setup = composed();
    setup.lease.recordRequest({
      postData: () => { throw new Error('capture failure'); },
      method: () => 'POST',
      url: () => `${ORIGIN}/login`,
    });
    const result = await setup.host.tools.list_vault();
    expect(result).toEqual({ items: [] });
    expect(setup.lease.captureFailed()).toBe(true);
    expect(() => setup.host.finish()).toThrow('Evidence capture failed');
    expect(inspectEvidenceLeaseForTest(setup.lease)).toEqual([]);
  });

  it('kills network evidence in data-plane state and non-pulling drain behavior', () => {
    const setup = composed();
    const body = `password=${encodeURIComponent(CANARY)}`;
    setup.lease.recordRequest({
      postData: () => body,
      method: () => 'POST',
      url: () => `${ORIGIN}/login?run=1`,
    });
    expect(inspect(setup.service, { showHidden: true, depth: 10 })).not.toContain(body);
    expect(inspect(setup.sessions, { showHidden: true, depth: 10 })).not.toContain(body);
    expect(setup.host.drainEvidence()).toEqual([{
      channel: 'network-body', direction: 'outbound', origin: ORIGIN,
      method: 'POST', route: '/login?run=1', initiator: 'browser', bytes: body,
    }]);
    expect(setup.host.drainEvidence()).toEqual([]);
    setup.host.abort();
  });

  it('kills closeAll reordering and disposal omission while never closing an injected browser', async () => {
    const order: string[] = [];
    const backend = fakeBackend(order);
    const browser = { close: vi.fn(async () => { order.push('browser'); }) } as any;
    const host = await createSupervisedHost({ backend, canary: CANARY, browser });
    await host.closeAll();
    expect(order).toEqual(['backend']);
    expect(browser.close).not.toHaveBeenCalled();

    const setup = composed();
    vi.mocked(setup.service.disposeBackend).mockImplementation(async () => { order.push('dispose'); });
    setup.sessions.closeAll = async () => { order.push('sessions'); };
    await setup.host.closeAll();
    expect(order.slice(-2)).toEqual(['sessions', 'dispose']);
  });

  it('kills supervised-host and lease capability surface expansion', () => {
    const setup = composed();
    expect(Reflect.ownKeys(setup.host)).toEqual(['tools', 'drainEvidence', 'finish', 'abort', 'closeAll']);
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
    probeAvailability: async () => ({ available: true }),
    listItems: async () => [],
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
