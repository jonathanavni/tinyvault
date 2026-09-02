import type { CredentialBackend } from '../backends/backend';
import { BROWSER_OPEN_FAILURE_MESSAGE, createBrowserControls } from '../browser/controls';
import { createBrowserFailure } from '../browser/controlResults';
import {
  launchChromium,
  type Browser,
  type BrowserContext,
  type ChromiumLauncher,
  type Page,
} from '../browser/playwright';
import {
  createBrowserSessionHost,
  type BrowserSessionHost,
} from '../browser/session';
import {
  createFillService,
  type FillOutcome,
  type FillService,
} from '../core/fillService';
import { validateBareOrigin } from '../core/originGuard';
import type { BrowserControls, FillRequest, Origin, VaultTools } from '../core/types';
import type { CapturedEventInput } from '../agents/transcript';
import { serializeExact } from '../agents/transcript';
import { createLockdownDomain } from './lockdownDomain';
import {
  TripwireRun,
} from './tripwireSeam';

type TripwireVerdict = ReturnType<TripwireRun['adjudicate']>;

type RequestLike = Readonly<{
  allHeaders(): Promise<Record<string, string>>;
  postData?(): string | null;
  postDataBuffer(): Buffer | null;
  headers(): Record<string, string>;
  method(): string;
  url(): string;
}>;

const ALL_HEADERS_TIMEOUT_MS = 2_000;

function boundedAllHeaders(request: RequestLike): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      // Provisional fallback (no cookies): marked in the evidence so a reader can tell it from allHeaders().
      try {
        resolve({ ...request.headers(), 'x-tinyvault-provisional-headers': 'true' });
      } catch (error: unknown) { reject(error); }
    }, ALL_HEADERS_TIMEOUT_MS);
    request.allHeaders().then((headers) => { clearTimeout(timer); resolve(headers); },
      (error: unknown) => { clearTimeout(timer); reject(error); });
  });
}

/** The subset of CDP `Network.requestWillBeSent` the deferred-body capture reads. */
type RequestWillBeSentLike = Readonly<{
  requestId: string;
  request: Readonly<{ url: string; method: string; hasPostData?: boolean; postData?: string }>;
}>;

type WebSocketLike = Readonly<{
  on(event: 'framesent', listener: (event: { payload: string | Buffer }) => void): void;
}>;

export const CAPTURE_FAILED_MESSAGE = 'Evidence capture failed';
export const VAULT_TOOL_FAILURE_MESSAGE = 'Vault operation failed';
const leaseEvidence = new WeakMap<EvidenceLease, CapturedEventInput[]>();

export class EvidenceLease {
  readonly #run: TripwireRun;
  readonly #tripwireEvidence: ReturnType<TripwireRun['captureTrusted']>[] = [];
  #canary: string | null;
  #captureFailed = false;
  #active = true;
  readonly #pending = new Set<Promise<void>>();

  constructor(canary: string) {
    this.#run = new TripwireRun(canary);
    this.#canary = canary;
    leaseEvidence.set(this, []);
    this.recordRequest = this.recordRequest.bind(this);
    this.recordWebSocket = this.recordWebSocket.bind(this);
  }

  recordRequest(request: RequestLike): void {
    let rawUrl: string;
    try {
      rawUrl = request.url();
    } catch {
      this.#captureFailed = true;
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
    try {
      let origin: Origin | undefined;
      try {
        origin = validateBareOrigin(parsed.origin);
      } catch {
        origin = undefined;
      }
      const method = request.method();
      this.#record(Object.freeze({
        channel: 'url', direction: 'outbound',
        ...(origin === undefined ? {} : { origin }),
        method, initiator: 'browser', bytes: parsed.href,
      }));
      const body = request.postDataBuffer();
      if (body !== null) {
        this.#record(Object.freeze({
          channel: 'network-body', direction: 'outbound',
          ...(origin === undefined ? {} : { origin }),
          method, route: `${parsed.pathname}${parsed.search}`,
          initiator: 'browser', bytes: requestBodyBytes(body),
        }));
      }
      // allHeaders() never resolves for a WebSocket upgrade (no requestWillBeSentExtraInfo), so it is bounded:
      // after ALL_HEADERS_TIMEOUT_MS the provisional headers() are recorded instead (never a missing event).
      const capture = boundedAllHeaders(request).then((headers) => {
        this.#record(Object.freeze({
          channel: 'header', direction: 'outbound',
          ...(origin === undefined ? {} : { origin }),
          method, route: `${parsed.pathname}${parsed.search}`,
          initiator: 'browser', bytes: JSON.stringify(headers),
        }));
      }).catch(() => this.markCaptureFailed());
      this.trackDeferred(capture);
    } catch {
      this.#captureFailed = true;
    }
  }

  /**
   * Bodies Playwright's request event omits (Blob and sendBeacon bodies — Chromium reports `hasPostData`
   * without inline `postData`; register J-S1) are fetched through CDP `Network.getRequestPostData` and
   * recorded here with the same origin/route shape as `recordRequest`. Interception is NOT used: an active
   * route suppresses CORS preflights and would change what the page can reach.
   */
  recordDeferredBody(rawUrl: string, method: string, postData: string, base64Encoded: boolean): void {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
    let origin: Origin | undefined;
    try {
      origin = validateBareOrigin(parsed.origin);
    } catch {
      origin = undefined;
    }
    const bytes = base64Encoded ? requestBodyBytes(Buffer.from(postData, 'base64')) : postData;
    this.#record(Object.freeze({
      channel: 'network-body', direction: 'outbound', ...(origin === undefined ? {} : { origin }),
      method, route: `${parsed.pathname}${parsed.search}`, initiator: 'browser', bytes,
    }));
  }

  /** WebSocket handshakes raise no Playwright request event; their headers arrive through CDP
   *  `Network.webSocketWillSendHandshakeRequest` (register K-X2 follow-up: the subprotocol header). */
  recordHandshakeHeaders(rawUrl: string, headers: Readonly<Record<string, string>>): void {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return;
    }
    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') return;
    let origin: Origin | undefined;
    try {
      origin = validateBareOrigin(parsed.origin.replace(/^ws/u, 'http'));
    } catch {
      origin = undefined;
    }
    // The handshake URL (query string included) is evidence too: `route` is never scanned (register L-Q1).
    this.#record(Object.freeze({
      channel: 'url', direction: 'outbound', ...(origin === undefined ? {} : { origin }),
      method: 'GET', route: `${parsed.pathname}${parsed.search}`, initiator: 'browser', bytes: parsed.href,
    }));
    this.#record(Object.freeze({
      channel: 'header', direction: 'outbound', ...(origin === undefined ? {} : { origin }),
      method: 'GET', route: `${parsed.pathname}${parsed.search}`, initiator: 'browser',
      bytes: JSON.stringify(headers),
    }));
  }

  markCaptureFailed(): void {
    this.#captureFailed = true;
  }

  /** A deferred capture (CDP round trip) in flight; `settle()` awaits every one before a drain. */
  trackDeferred(capture: Promise<void>): void {
    this.#pending.add(capture);
    void capture.finally(() => this.#pending.delete(capture));
  }

  async settle(): Promise<void> {
    while (this.#pending.size > 0) await Promise.allSettled([...this.#pending]);
  }

  recordWebSocket(socket: WebSocketLike): void {
    try {
      socket.on('framesent', ({ payload }) => {
        try {
          this.#record(Object.freeze({
            channel: 'websocket', direction: 'outbound', initiator: 'browser',
            bytes: typeof payload === 'string' ? payload : payload.toString('base64'),
          }));
        } catch {
          this.#captureFailed = true;
        }
      });
    } catch {
      this.#captureFailed = true;
    }
  }

  recordFill(outcome: FillOutcome): void {
    try {
      this.#recordTop(outcome);
      this.#recordAsserted(outcome);
      this.#recordAssigned(outcome);
    } catch {
      this.#captureFailed = true;
    }
  }

  captureTrusted(bytes: string): void {
    this.#assertActive();
    try {
      this.#tripwireEvidence.push(this.#run.captureTrusted(bytes));
    } catch (error) {
      this.#captureFailed = true;
      throw error;
    }
  }

  drainEvidence(): readonly CapturedEventInput[] {
    this.#assertActive();
    const evidence = this.#evidence();
    const drained = Object.freeze([...evidence]);
    evidence.length = 0;
    return drained;
  }

  finish(): TripwireVerdict {
    this.#assertActive();
    const captureFailed = this.#captureFailed;
    try {
      const batch = this.#run.mint(this.#tripwireEvidence);
      const verdict = this.#run.adjudicate(batch);
      if (captureFailed) throw new Error(CAPTURE_FAILED_MESSAGE);
      return verdict;
    } finally {
      this.#drop();
    }
  }

  abort(): void {
    this.#drop();
  }

  captureFailed(): boolean {
    return this.#captureFailed;
  }

  #recordTop(outcome: FillOutcome): void {
    const { topOrigin, topPath, unobserved, reobservedOrigin } = outcome.observation;
    if (topOrigin !== null) this.#record(Object.freeze({
      channel: 'url', direction: 'internal', initiator: 'fill-service',
      origin: topOrigin, bytes: topPath ?? '',
    }));
    if (unobserved && topOrigin === null) {
      this.#record(Object.freeze({
        channel: 'url', direction: 'internal', initiator: 'fill-service-unobserved', bytes: '',
      }));
    }
    if (reobservedOrigin !== null) this.#record(Object.freeze({
      channel: 'url', direction: 'internal', initiator: 'fill-service',
      origin: reobservedOrigin, bytes: reobservedOrigin,
    }));
  }

  #recordAsserted(outcome: FillOutcome): void {
    const { assertedMismatch } = outcome.observation;
    if (assertedMismatch === null) return;
    this.#record(Object.freeze({
      channel: 'url', direction: 'internal', initiator: 'fill-service-asserted',
      origin: assertedMismatch, bytes: 'asserted',
    }));
  }

  #recordAssigned(outcome: FillOutcome): void {
    const assigned = outcome.observation.assigned;
    const canary = this.#canary;
    if (assigned === null || canary === null) return;
    this.#record(Object.freeze({
      channel: 'dom-fill', direction: 'internal', origin: assigned.observedOrigin,
      frameId: 'top', documentId: assigned.documentToken ?? 'none',
      requestId: assigned.controlToken ?? 'none', initiator: 'fill-service', bytes: canary,
    }));
  }

  #record(event: CapturedEventInput): void {
    this.#assertActive();
    this.#evidence().push(event);
  }

  #evidence(): CapturedEventInput[] {
    const evidence = leaseEvidence.get(this);
    if (evidence === undefined) throw new Error(CAPTURE_FAILED_MESSAGE);
    return evidence;
  }

  #assertActive(): void {
    if (!this.#active) throw new Error(CAPTURE_FAILED_MESSAGE);
  }

  #drop(): void {
    if (!this.#active) return;
    this.#active = false;
    this.#run.close();
    this.#tripwireEvidence.length = 0;
    this.#canary = null;
    const evidence = leaseEvidence.get(this);
    if (evidence !== undefined) evidence.length = 0;
    leaseEvidence.delete(this);
  }
}

export type SupervisedHost = Readonly<{
  tools: VaultTools & BrowserControls;
  drainEvidence(): readonly CapturedEventInput[];
  /** Awaits in-flight deferred captures (Blob bodies via CDP); call before a post-loop drain or finish. */
  settleEvidence(): Promise<void>;
  finish(): TripwireVerdict;
  abort(): void;
  closeAll(): Promise<void>;
}>;

export async function createSupervisedHost(options: Readonly<{
  backend: CredentialBackend;
  canary: string;
  browser?: Browser;
  launcher?: ChromiumLauncher;
}>): Promise<SupervisedHost> {
  const browser = options.browser ?? await launchChromium(options.launcher);
  const launchedHere = options.browser === undefined;
  const lease = new EvidenceLease(options.canary);
  const domain = createLockdownDomain();
  const sessions = createBrowserSessionHost({
    newContext: capturingContextFactory(browser, lease),
    authority: domain.authority,
    registry: domain.registry,
    lifecycle: domain.lifecycle,
  });
  const fillService = createFillService({ backend: options.backend, sessions, registry: domain.registry });
  return compose(parts(fillService, sessions, lease), launchedHere ? browser : undefined);
}

/** Test composition seam: it carries no network-body capture because no browser request listener is attached. */
export function composeSupervisedHost(parts: Readonly<{
  fillService: FillService;
  sessions: BrowserSessionHost;
  lease: EvidenceLease;
}>): SupervisedHost {
  return compose(parts, undefined);
}

export function inspectEvidenceLeaseForTest(lease: EvidenceLease): readonly CapturedEventInput[] {
  return Object.freeze([...(leaseEvidence.get(lease) ?? [])]);
}

function parts(fillService: FillService, sessions: BrowserSessionHost, lease: EvidenceLease) {
  return Object.freeze({ fillService, sessions, lease });
}

function capturingContextFactory(browser: Browser, lease: EvidenceLease): () => Promise<BrowserContext> {
  return async () => {
    const context = await browser.newContext();
    context.on('request', lease.recordRequest);
    context.on('page', (page) => {
      page.on('websocket', lease.recordWebSocket);
      void attachDeferredBodyCapture(context, page, lease);
    });
    return context;
  };
}

async function attachDeferredBodyCapture(
  context: BrowserContext,
  page: Page,
  lease: EvidenceLease,
): Promise<void> {
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    const socketUrls = new Map<string, string>();
    cdp.on('Network.webSocketCreated', (event: Readonly<{ requestId: string; url: string }>) => {
      socketUrls.set(event.requestId, event.url);
    });
    cdp.on('Network.webSocketWillSendHandshakeRequest', (event: Readonly<{
      requestId: string; request: Readonly<{ headers: Record<string, string> }>;
    }>) => {
      const url = socketUrls.get(event.requestId);
      if (url !== undefined) lease.recordHandshakeHeaders(url, event.request.headers);
    });
    cdp.on('Network.requestWillBeSent', (event: RequestWillBeSentLike) => {
      if (event.request.hasPostData !== true || event.request.postData !== undefined) return;
      const capture = cdp.send('Network.getRequestPostData', { requestId: event.requestId })
        .then((result) => lease.recordDeferredBody(
          event.request.url, event.request.method, result.postData, result.base64Encoded === true,
        ))
        .catch(() => lease.markCaptureFailed());
      lease.trackDeferred(capture);
    });
  } catch {
    lease.markCaptureFailed();
  }
}

function requestBodyBytes(body: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    return body.toString('base64');
  }
}

function compose(
  parts: Readonly<{ fillService: FillService; sessions: BrowserSessionHost; lease: EvidenceLease }>,
  browserToClose: Browser | undefined,
): SupervisedHost {
  const browserTools = createBrowserControls(parts.sessions);
  const tools = createTools(parts.fillService, browserTools, parts.lease);
  let closing: Promise<void> | undefined;
  return Object.freeze({
    tools,
    drainEvidence: () => parts.lease.drainEvidence(),
    settleEvidence: () => parts.lease.settle(),
    finish: () => parts.lease.finish(),
    abort: () => parts.lease.abort(),
    closeAll: () => closing ??= closeAll(parts.sessions, browserToClose, parts.fillService),
  });
}

function createTools(
  fillService: FillService,
  browserTools: BrowserControls,
  lease: EvidenceLease,
): VaultTools & BrowserControls {
  return Object.freeze({
    list_vault: () => capturedVault(lease, () => fillService.listVault()),
    fill_from_vault: (request: FillRequest) => capturedVaultFill(lease, fillService, request),
    request_vault_setup: (args: Parameters<VaultTools['request_vault_setup']>[0]) =>
      capturedVault(lease, () => fillService.requestSetup(args)),
    browser_open_session: () => capturedOpen(lease, () => browserTools.browser_open_session()),
    browser_close_session: (args: Parameters<BrowserControls['browser_close_session']>[0]) =>
      capturedControl(lease, () => browserTools.browser_close_session(args), Object.freeze({ ok: false })),
    browser_navigate: (args: Parameters<BrowserControls['browser_navigate']>[0]) =>
      capturedControl(
        lease, () => browserTools.browser_navigate(args), createBrowserFailure('session-unknown'),
      ),
    browser_click: (args: Parameters<BrowserControls['browser_click']>[0]) =>
      capturedControl(
        lease, () => browserTools.browser_click(args), createBrowserFailure('session-unknown'),
      ),
    browser_type: (args: Parameters<BrowserControls['browser_type']>[0]) =>
      capturedControl(
        lease, () => browserTools.browser_type(args), createBrowserFailure('session-unknown'),
      ),
    browser_snapshot: (args: Parameters<BrowserControls['browser_snapshot']>[0]) =>
      uncaptured(lease, () => browserTools.browser_snapshot(args)),
  });
}

async function captured<T>(lease: EvidenceLease, operation: () => Promise<T>): Promise<T> {
  assertLeaseActive(lease);
  const result = await operation();
  lease.captureTrusted(serializeExact(result));
  return result;
}

async function capturedOpen<T>(lease: EvidenceLease, operation: () => Promise<T>): Promise<T> {
  try {
    return await captured(lease, operation);
  } catch {
    throw new Error(BROWSER_OPEN_FAILURE_MESSAGE);
  }
}

async function capturedControl<T>(lease: EvidenceLease, operation: () => Promise<T>, closed: T): Promise<T> {
  try {
    if (lease.captureFailed()) throw new Error(CAPTURE_FAILED_MESSAGE);
    return await captured(lease, operation);
  } catch {
    return closed;
  }
}

async function capturedVault<T>(lease: EvidenceLease, operation: () => Promise<T>): Promise<T> {
  assertLeaseActive(lease);
  try {
    return await captured(lease, operation);
  } catch {
    throw new Error(VAULT_TOOL_FAILURE_MESSAGE);
  }
}

async function capturedVaultFill(
  lease: EvidenceLease,
  fillService: FillService,
  request: FillRequest,
) {
  assertLeaseActive(lease);
  try {
    const outcome = await fillService.fill(request);
    lease.recordFill(outcome);
    lease.captureTrusted(serializeExact(outcome.result));
    return outcome.result;
  } catch {
    throw new Error(VAULT_TOOL_FAILURE_MESSAGE);
  }
}

function uncaptured<T>(lease: EvidenceLease, operation: () => Promise<T>): Promise<T> {
  assertLeaseActive(lease);
  return operation();
}

function assertLeaseActive(lease: EvidenceLease): void {
  if (!leaseEvidence.has(lease)) throw new Error(CAPTURE_FAILED_MESSAGE);
}

async function closeAll(
  sessions: BrowserSessionHost,
  browser: Browser | undefined,
  fillService: FillService,
): Promise<void> {
  let failure: unknown;
  try { await sessions.closeAll(); } catch (error) { failure = error; }
  try { await browser?.close(); } catch (error) { failure ??= error; }
  try { await fillService.disposeBackend(); } catch (error) { failure ??= error; }
  if (failure !== undefined) throw failure;
}
