import type { Page } from '../browser/playwright';
import type { FillOutcome } from '../core/fillService';
import { validateBareOrigin } from '../core/originGuard';
import type { Origin } from '../core/types';
import type { CapturedEventInput } from '../agents/transcript';
import { CONSOLE_BUDGET_EXCEEDED, consoleEventBytes, type RemoteObjectLike } from './consoleSerialization';
import { TripwireRun } from './tripwireSeam';
import { BodyCorrelation, PROVISIONAL_HEADERS_MARKER, mayCarryBody, type RequestWillBeSentLike } from './bodyCorrelation';

type TripwireVerdict = ReturnType<TripwireRun['adjudicate']>;

type RequestLike = Readonly<{
  allHeaders(): Promise<Record<string, string>>;
  postData?(): string | null;
  postDataBuffer(): Buffer | null;
  headers(): Record<string, string>;
  method(): string;
  redirectedFrom?(): RequestLike | null;
  url(): string;
}>;

const ALL_HEADERS_TIMEOUT_MS = 2_000;
const ATTACH_TIMEOUT_MS = 2_000;
const CONSOLE_EVENT_LIMIT = 1_000;
export const POPUP_ATTACH_TIMEOUT_DIAGNOSTIC = 'x-tinyvault-popup-attach-timeout';

function boundedAllHeaders(request: RequestLike): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      // Provisional fallback (no cookies): marked in the evidence so a reader can tell it from allHeaders().
      try {
        resolve({ ...request.headers(), [PROVISIONAL_HEADERS_MARKER]: 'true' });
      } catch (error: unknown) { reject(error); }
    }, ALL_HEADERS_TIMEOUT_MS);
    request.allHeaders().then((headers) => { clearTimeout(timer); resolve(headers); },
      (error: unknown) => {
        clearTimeout(timer);
        // A target that closed before its headers resolved (a self-closing popup's keepalive POST) is the page's
        // doing, not a harness fault: the provisional set is recorded, marked, and the body counted as unobserved
        // (register C-B2f2). Any other rejection still invalidates the run.
        if (!isClosedTargetError(error)) { reject(error); return; }
        try {
          resolve({ ...request.headers(), [PROVISIONAL_HEADERS_MARKER]: 'true' });
        } catch (fallbackError: unknown) { reject(fallbackError); }
      });
  });
}

function isClosedTargetError(error: unknown): boolean {
  return error instanceof Error && /Target page, context or browser has been closed/u.test(error.message);
}

/** Playwright resolves allHeaders() with the provisional set itself when a request finishes without
 *  requestWillBeSentExtraInfo (a target gone before the network layer reported — a self-closing popup's keepalive
 *  POST). Such a set is indistinguishable from resolved headers by content, so it is marked here by identity:
 *  resolved headers always add to the provisional ones (register C-B2f2, integrator pass). */
function markUnresolvedHeaders(request: RequestLike, resolved: Record<string, string>): Record<string, string> {
  if (resolved[PROVISIONAL_HEADERS_MARKER] === 'true') return resolved;
  let provisional: Record<string, string>;
  try { provisional = request.headers(); } catch { return resolved; }
  const resolvedKeys = Object.keys(resolved);
  const unchanged = resolvedKeys.length === Object.keys(provisional).length
    && resolvedKeys.every((name) => provisional[name] === resolved[name]);
  return unchanged ? { ...resolved, [PROVISIONAL_HEADERS_MARKER]: 'true' } : resolved;
}

type WebSocketLike = Readonly<{
  on(event: 'framesent', listener: (event: { payload: string | Buffer }) => void): void;
}>;

export const CAPTURE_FAILED_MESSAGE = 'Evidence capture failed';
export class InactiveEvidenceLeaseError extends Error {
  constructor() { super(CAPTURE_FAILED_MESSAGE); }
}
export const FINISH_PRECONDITION_MESSAGE = 'Evidence producers are not quiescent';
export const STRICT_CAPTURE_GENERATIONS = 3;
export type QuiesceDeadline = Readonly<{ expiresAt?: number; expired: Promise<void>; abort(): void; isExpired(): boolean }>;
const leaseEvidence = new WeakMap<EvidenceLease, CapturedEventInput[]>();

export class EvidenceLease {
  readonly #run: TripwireRun;
  readonly #tripwireEvidence: ReturnType<TripwireRun['captureTrusted']>[] = [];
  #canary: string | null;
  #captureFailed = false;
  #allowTimedOutAttachOperation = false;
  #active = true;
  #aborted = false;
  #needsSettle = false;
  readonly #pending = new Set<Promise<void>>();
  readonly #pendingAttach = new Map<Promise<void>, boolean | Promise<boolean>>();
  readonly #interactiveTimedOut = new Set<Promise<void>>();
  readonly #nonGatingAttach = new Set<Promise<void>>();
  readonly #bodyCorrelation = new BodyCorrelation();
  #consoleEvents = 0;
  readonly #consoleDetachers = new Set<() => void>();

  constructor(canary: string) {
    this.#run = new TripwireRun(canary);
    this.#canary = canary;
    leaseEvidence.set(this, []);
    this.recordRequest = this.recordRequest.bind(this);
    this.recordWebSocket = this.recordWebSocket.bind(this);
  }

  recordRequest(request: RequestLike): void {
    if (this.#aborted) return;
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
    this.#needsSettle = true;
    try {
      const redirectedFrom = request.redirectedFrom?.();
      if (redirectedFrom !== null && redirectedFrom !== undefined) {
        this.#recordRedirect(redirectedFrom, rawUrl);
      }
      let origin: Origin | undefined;
      try {
        origin = validateBareOrigin(parsed.origin);
      } catch {
        origin = undefined;
      }
      this.#captureRequest(request, rawUrl, parsed, origin);
    } catch {
      this.#captureFailed = true;
    }
  }

  #captureRequest(request: RequestLike, rawUrl: string, parsed: URL, origin: Origin | undefined): void {
    const method = request.method();
    this.#record(Object.freeze({
      channel: 'url', direction: 'outbound',
      ...(origin === undefined ? {} : { origin }),
      method, initiator: 'browser', bytes: parsed.href,
    }));
    const body = request.postDataBuffer();
    if (body !== null) {
      this.#recordNetworkBody(rawUrl, method, requestBodyBytes(body));
    } else {
      this.#bodyCorrelation.observePlaywrightRequest(request, rawUrl, method, request.headers());
    }
    // allHeaders() never resolves for a WebSocket upgrade (no requestWillBeSentExtraInfo), so it is bounded:
    // after ALL_HEADERS_TIMEOUT_MS the provisional headers() are recorded instead (never a missing event).
    const capture = boundedAllHeaders(request).then((resolved) => {
      if (this.#aborted) return;
      // Only a request whose body Playwright did not hold needs the unresolved-headers judgement.
      const headers = body === null && mayCarryBody(method) ? markUnresolvedHeaders(request, resolved) : resolved;
      if (body === null) this.#bodyCorrelation.observeHeaders(request, headers);
      this.#record(Object.freeze({
        channel: 'header', direction: 'outbound',
        ...(origin === undefined ? {} : { origin }),
        method, route: `${parsed.pathname}${parsed.search}`,
        initiator: 'browser', bytes: JSON.stringify(headers),
      }));
    }).catch(() => this.markCaptureFailed());
    this.trackDeferred(capture);
  }

  #recordRedirect(redirectedFrom: RequestLike, targetUrl: string): void {
    const parsed = new URL(redirectedFrom.url());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
    let origin: Origin | undefined;
    try { origin = validateBareOrigin(parsed.origin); } catch { origin = undefined; }
    this.#record(Object.freeze({
      channel: 'redirect', direction: 'outbound', ...(origin === undefined ? {} : { origin }),
      route: `${parsed.pathname}${parsed.search}`, method: redirectedFrom.method(),
      initiator: 'browser', bytes: targetUrl,
    }));
  }

  /**
   * Bodies Playwright's request event omits (Blob and sendBeacon bodies — Chromium reports `hasPostData`
   * without inline `postData`; register J-S1) are fetched through CDP `Network.getRequestPostData` and
   * recorded here with the same origin/route shape as `recordRequest`. Interception is NOT used: an active
   * route suppresses CORS preflights and would change what the page can reach.
   */
  recordRequestWillBeSent(identity: string, event: RequestWillBeSentLike): void {
    if (this.#aborted) return;
    this.#needsSettle = true;
    this.#bodyCorrelation.observeCdpRequest(identity, event);
  }

  recordDeferredBody(
    rawUrl: string,
    method: string,
    postData: string,
    base64Encoded: boolean,
    identity?: string,
  ): void {
    if (this.#aborted) return;
    if (!this.#bodyCorrelation.recordBody(identity)) return;
    this.#recordNetworkBody(
      rawUrl,
      method,
      base64Encoded ? requestBodyBytes(Buffer.from(postData, 'base64')) : postData,
    );
  }

  #recordNetworkBody(
    rawUrl: string,
    method: string,
    bytes: string,
    initiator: 'browser' | 'harness-marker' = 'browser',
  ): void {
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
    this.#record(Object.freeze({
      channel: 'network-body', direction: 'outbound', ...(origin === undefined ? {} : { origin }),
      method, route: `${parsed.pathname}${parsed.search}`, initiator, bytes,
    }));
  }

  recordUnavailableBody(identity: string): void {
    if (this.#aborted) return;
    this.#needsSettle = true;
    this.#bodyCorrelation.recordUnavailable(identity);
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

  recordChildStopDiagnostic(attempted: number, unconfirmed: number): void {
    this.#record(Object.freeze({ channel: 'url', direction: 'internal', initiator: 'harness-diagnostic',
      bytes: `x-tinyvault-child-stop attempted=${attempted} unconfirmed=${unconfirmed}` }));
  }

  markCaptureFailed(): void {
    this.#captureFailed = true;
  }

  /** A deferred capture (CDP round trip) in flight; `settle()` awaits every one before a drain. */
  trackDeferred(capture: Promise<void>): void {
    if (this.#aborted) { void capture.catch(() => undefined); return; }
    this.#pending.add(capture);
    void capture.then(() => this.#pending.delete(capture), () => {
      this.#pending.delete(capture); this.markCaptureFailed();
    });
  }

  trackAttach(attach: Promise<void>, invalidateOnTimeout: boolean | Promise<boolean> = true): void {
    if (this.#aborted) { void attach.catch(() => undefined); return; }
    this.#pendingAttach.set(attach, invalidateOnTimeout);
    void attach.then(() => {
      this.#pendingAttach.delete(attach); this.#interactiveTimedOut.delete(attach); this.#nonGatingAttach.delete(attach);
    }, () => {
      this.#pendingAttach.delete(attach); this.#interactiveTimedOut.delete(attach); this.#nonGatingAttach.delete(attach); this.markCaptureFailed();
    });
  }

  async settleAttach(): Promise<void> {
    const pending = [...this.#pendingAttach.entries()].filter(([attach]) => !this.#interactiveTimedOut.has(attach));
    await Promise.all(pending.map(async ([attach, invalidateOnTimeout]) => {
      let timer: NodeJS.Timeout | undefined;
      const timedOut = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), ATTACH_TIMEOUT_MS);
      });
      const result = await Promise.race([attach.then(() => 'settled' as const), timedOut]);
      if (timer !== undefined) clearTimeout(timer);
      if (result === 'timeout') {
        this.#interactiveTimedOut.add(attach);
        if (await invalidateOnTimeout) {
          this.markCaptureFailed();
          this.#allowTimedOutAttachOperation = true;
        } else {
          this.#nonGatingAttach.add(attach);
          this.#record(Object.freeze({
            channel: 'url', direction: 'internal', initiator: 'harness-diagnostic',
            bytes: POPUP_ATTACH_TIMEOUT_DIAGNOSTIC,
          }));
        }
      }
    }));
  }

  async settle(deadline?: QuiesceDeadline): Promise<void> {
    let generation = 0;
    while (this.#pending.size > 0 && generation < STRICT_CAPTURE_GENERATIONS) {
      await this.#awaitCaptures([...this.#pending], deadline);
      generation += 1;
    }
    this.#finalizeBodies();
  }

  async settleStrict(deadline?: QuiesceDeadline, final = false): Promise<void> {
    let generation = 0;
    do {
      const attaches = [...this.#pendingAttach.keys()].filter((attach) => final || !this.#nonGatingAttach.has(attach));
      await this.#awaitCaptures([...attaches, ...this.#pending], deadline);
      generation += 1;
    } while (this.#hasCaptures() && generation < STRICT_CAPTURE_GENERATIONS);
    this.#finalizeBodies();
    if (final && this.#hasCaptures()) {
      this.markCaptureFailed();
      deadline?.abort();
      await Promise.allSettled([...this.#pendingAttach.keys(), ...this.#pending]);
      throw new Error(CAPTURE_FAILED_MESSAGE);
    }
  }

  async #awaitCaptures(captures: readonly Promise<void>[], deadline?: QuiesceDeadline): Promise<void> {
    const settled = Promise.allSettled(captures);
    if (deadline === undefined) { await settled; return; }
    const result = await Promise.race([settled.then(() => 'settled'), deadline.expired.then(() => 'expired')]);
    if (result !== 'expired' && !deadline.isExpired()) return;
    this.markCaptureFailed();
    deadline.abort();
    // Disposal must settle browser work. Non-cancellable trusted producers remain an explicit residual:
    // await their actual settlement once, even when that exceeds the deadline; never abandon a capture.
    await Promise.allSettled([...captures, ...this.#pendingAttach.keys(), ...this.#pending]);
    throw new Error(CAPTURE_FAILED_MESSAGE);
  }

  #hasCaptures(): boolean {
    return this.#pendingAttach.size > 0 || this.#pending.size > 0;
  }

  #finalizeBodies(): void {
    for (const marker of this.#bodyCorrelation.finalize()) {
      this.#recordNetworkBody(marker.rawUrl, marker.method, marker.reason, 'harness-marker');
    }
    this.#needsSettle = false;
  }

  pendingEvidence(): boolean {
    const gatingAttach = [...this.#pendingAttach.keys()].some((attach) => !this.#nonGatingAttach.has(attach));
    return this.#needsSettle || this.#pending.size > 0 || gatingAttach || (leaseEvidence.get(this)?.length ?? 0) > 0;
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

  recordConsole(page: Page, cdp: import('../browser/playwright').CDPSession): void {
    if (this.#consoleEvents > CONSOLE_EVENT_LIMIT) return;
    const listener = (event: Readonly<{ type: string; args: readonly RemoteObjectLike[] }>) => {
      try {
        if (this.#consoleEvents >= CONSOLE_EVENT_LIMIT) {
          if (this.#consoleEvents === CONSOLE_EVENT_LIMIT) {
            this.#record(Object.freeze({
              channel: 'log', direction: 'outbound', initiator: 'page-console',
              ...pageOrigin(page), bytes: CONSOLE_BUDGET_EXCEEDED,
            }));
            this.#consoleEvents += 1;
            for (const detach of this.#consoleDetachers) detach();
            this.#consoleDetachers.clear();
          }
          return;
        }
        this.#consoleEvents += 1;
        this.#record(Object.freeze({
          channel: 'log', direction: 'outbound', initiator: 'page-console',
          ...pageOrigin(page), bytes: consoleEventBytes(event.type, event.args),
        }));
      } catch {
        this.markCaptureFailed();
      }
    };
    cdp.on('Runtime.consoleAPICalled', listener);
    this.#consoleDetachers.add(() => cdp.off('Runtime.consoleAPICalled', listener));
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
    if (this.pendingEvidence()) throw new Error(FINISH_PRECONDITION_MESSAGE);
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
    this.#aborted = true;
    this.markCaptureFailed();
    this.#drop();
  }

  captureFailed(): boolean {
    // A timed-out readiness handshake invalidates finish, but the operation waiting on that bounded
    // barrier must still proceed once. All other capture failures remain fail-closed for controls.
    if (this.#allowTimedOutAttachOperation) {
      this.#allowTimedOutAttachOperation = false;
      return false;
    }
    return this.#captureFailed;
  }

  hasCaptureFailed(): boolean {
    return this.#captureFailed;
  }

  consumeTimedOutAttachOperation(): void {
    this.#allowTimedOutAttachOperation = false;
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
    if (this.#aborted) return;
    this.#assertActive();
    this.#evidence().push(event);
  }

  #evidence(): CapturedEventInput[] {
    const evidence = leaseEvidence.get(this);
    if (evidence === undefined) throw new Error(CAPTURE_FAILED_MESSAGE);
    return evidence;
  }

  #assertActive(): void {
    if (!this.#active) throw new InactiveEvidenceLeaseError();
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
    this.#bodyCorrelation.clear();
  }
}

function pageOrigin(page: Page): Readonly<{ origin?: Origin }> {
  try {
    const parsed = new URL(page.url());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return {};
    return { origin: validateBareOrigin(parsed.origin) };
  } catch {
    return {};
  }
}

function requestBodyBytes(body: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    return body.toString('base64');
  }
}

export function inspectEvidenceLeaseForTest(lease: EvidenceLease): readonly CapturedEventInput[] {
  return Object.freeze([...(leaseEvidence.get(lease) ?? [])]);
}

export function assertLeaseActive(lease: EvidenceLease): void {
  if (!leaseEvidence.has(lease)) throw new InactiveEvidenceLeaseError();
}

