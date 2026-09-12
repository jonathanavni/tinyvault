import { SessionHostError } from '../core/browserPort';
import type { CredentialBackend } from '../backends/backend';
import { BROWSER_OPEN_FAILURE_MESSAGE, createBrowserControls } from '../browser/controls';
import { createBrowserFailure, createSnapshotResult } from '../browser/controlResults';
import { createFailedResult } from '../core/results';
import {
  launchChromium,
  type Browser,
  type BrowserContext,
  type ChromiumLauncher,
  type Page,
  type CDPSession,
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
import type { FillAuthorizationLifecycle } from '../core/fillAuthorization';
import { createFillAuthorizationDomain } from './fillAuthorizationDomain';
import { createLockdownDomain } from './lockdownDomain';
import {
  TripwireRun,
} from './tripwireSeam';
import type { RequestWillBeSentLike } from './bodyCorrelation';
import { WorkerAttachRouter } from './workerAttach';

type TripwireVerdict = ReturnType<TripwireRun['adjudicate']>;
export const OP_TIMEOUT_MS = 10_000;
// Leave room for the existing two-second navigation settle after stop.
export const OP_STOP_GRACE_MS = 3_000;
export const QUIESCE_TIMEOUT_MS = 5_000;
export const VAULT_TOOL_FAILURE_MESSAGE = 'Vault operation failed';
const supervisedHostLeases = new WeakMap<object, EvidenceLease>();
export { BROWSER_OPEN_FAILURE_MESSAGE } from '../browser/controls';
export { CONSOLE_BUDGET_EXCEEDED } from './consoleSerialization';
export { BODY_UNAVAILABLE_NOT_ATTACHED, BODY_UNAVAILABLE_TARGET_DETACHED } from './bodyCorrelation';
import { EvidenceLease, CAPTURE_FAILED_MESSAGE, FINISH_PRECONDITION_MESSAGE,
  InactiveEvidenceLeaseError, assertLeaseActive, type QuiesceDeadline } from './evidenceLease';
export { EvidenceLease, CAPTURE_FAILED_MESSAGE, FINISH_PRECONDITION_MESSAGE,
  POPUP_ATTACH_TIMEOUT_DIAGNOSTIC, inspectEvidenceLeaseForTest } from './evidenceLease';

export type QuiesceHooks = Readonly<{ settleTimeoutMs?: number; beforeClose?(): Promise<void>; afterClose?(): Promise<void> }>;

export type SupervisedHost = Readonly<{
  tools: VaultTools & BrowserControls;
  setupReasonFor: FillService['setupReasonFor'];
  abortedEvidence(): readonly CapturedEventInput[];
  drainEvidence(): readonly CapturedEventInput[];
  /** Awaits in-flight deferred captures (Blob bodies via CDP); call before a post-loop drain or finish. */
  settleEvidence(): Promise<void>;
  quiesceEvidenceProducers?(hooks?: QuiesceHooks): Promise<void>;
  finish(): TripwireVerdict;
  abort(): void;
  closeAll(): Promise<void>;
}>;

export async function createSupervisedHost(options: Readonly<{
  backend: CredentialBackend;
  canary: string;
  browser?: Browser;
  launcher?: ChromiumLauncher;
  onFillAuthorization?(lifecycle: FillAuthorizationLifecycle): void;
}>): Promise<SupervisedHost> {
  const browser = options.browser ?? await launchChromium(options.launcher);
  const launchedHere = options.browser === undefined;
  const lease = new EvidenceLease(options.canary);
  const domain = createLockdownDomain();
  const { authorization, lifecycle } = createFillAuthorizationDomain();
  try { await options.onFillAuthorization?.(lifecycle); }
  catch (error) {
    if (launchedHere) { try { await browser.close(); } catch { /* Preserve the hook error. */ } }
    throw error;
  }
  const failures: { abort?: () => void; pending: boolean } = { pending: false };
  const sessions = createBrowserSessionHost({
    newContext: capturingContextFactory(browser, lease),
    authority: domain.authority,
    registry: domain.registry,
    lifecycle: domain.lifecycle,
    onSessionFailure: (_id, kind) => {
      lease.markCaptureFailed();
      if (kind === 'browser-missing' || kind === 'operation-timeout') return;
      failures.pending = true; failures.abort?.();
    },
  });
  const fillService = createFillService({ backend: options.backend, sessions, registry: domain.registry, authorization });
  const host = compose(parts(fillService, sessions, lease), launchedHere ? browser : undefined);
  failures.abort = host.abort;
  if (failures.pending) failures.abort();
  return host;
}

/** Test composition seam: it carries no network-body capture because no browser request listener is attached. */
export function composeSupervisedHost(parts: Readonly<{
  fillService: FillService;
  sessions: BrowserSessionHost;
  lease: EvidenceLease;
}>): SupervisedHost {
  return compose(parts, undefined);
}

export function inspectSupervisedHostCaptureFailedForTest(host: SupervisedHost): boolean {
  return supervisedHostLeases.get(host)?.hasCaptureFailed() ?? false;
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
      const wrapperOwned = attachTimeoutInvalidates(page, lease);
      const attach = attachDeferredBodyCapture(context, page, lease);
      lease.trackAttach(attach, wrapperOwned);
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
    await cdp.send('Runtime.enable');
    lease.recordConsole(page, cdp);
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
      const identity = `page:${event.requestId}`;
      lease.recordRequestWillBeSent(identity, event);
      if (event.request.hasPostData !== true || event.request.postData !== undefined) return;
      const capture = cdp.send('Network.getRequestPostData', { requestId: event.requestId })
        .then((result) => lease.recordDeferredBody(
          event.request.url, event.request.method, result.postData, result.base64Encoded === true, identity,
        ))
        // The body is gone before it is fetched (the page navigated at once, or Chromium evicted a ≥ ~24 MiB
        // body): counted as unobserved through the correlated marker, never a capture failure the page can
        // trigger (register C-B2f2, integrator pass).
        .catch(() => lease.recordUnavailableBody(identity));
      lease.trackDeferred(capture);
    });
    await attachChildRouter(cdp, lease);
  } catch (error) {
    if (pageClosed(page) || isMissingPageTargetError(error)) return;
    lease.markCaptureFailed();
  }
}


const childQuiescers = new WeakMap<EvidenceLease, Set<() => Promise<void>>>();

async function attachChildRouter(cdp: CDPSession, lease: EvidenceLease): Promise<void> {
  registerChildQuiescer(cdp, lease);
  const router = new WorkerAttachRouter(cdp, {
      observeRequest: (identity, event) => lease.recordRequestWillBeSent(identity, event),
      recordBody: (identity, url, method, postData, base64Encoded) => {
        lease.recordDeferredBody(url, method, postData, base64Encoded, identity);
      },
      recordUnavailable: (identity) => lease.recordUnavailableBody(identity),
      track: (capture) => lease.trackDeferred(capture),
      fail: () => lease.markCaptureFailed(),
    });
  await router.enable();
}

// Observe the same nested target transport consumed by WorkerAttachRouter. No unrelated browser targets
// are closed: each id came from this owned page's attached child tree, including nested worker targets.
function registerChildQuiescer(cdp: CDPSession, lease: EvidenceLease): void {
  const targets = new Set<string>(); let quiescing = false; let attempted = 0; let unconfirmed = 0;
  const stop = async (targetId: string) => {
    attempted += 1;
    try {
      const result = await cdp.send('Target.closeTarget', { targetId });
      if (result.success !== true) unconfirmed += 1;
    } catch (error) {
      unconfirmed += 1;
      if (!isMissingPageTargetError(error)) lease.markCaptureFailed();
    }
    lease.recordChildStopDiagnostic(attempted, unconfirmed);
  };
  const observe = (method: string, params: Record<string, any>) => {
    const found = childTargetIds(method, params);
    for (const id of found) {
      targets.add(id);
      if (quiescing) lease.trackDeferred(stop(id));
    }
  };
  cdp.on('Target.attachedToTarget', (event) => observe('Target.attachedToTarget', event));
  cdp.on('Target.receivedMessageFromTarget', (event) => observe('Target.receivedMessageFromTarget', event));
  const callbacks = childQuiescers.get(lease) ?? new Set<() => Promise<void>>();
  callbacks.add(async () => { quiescing = true; await Promise.all([...targets].map(stop)); });
  childQuiescers.set(lease, callbacks);
}

function childTargetIds(method: string, params: Record<string, any>): string[] {
  if (method === 'Target.attachedToTarget') {
    return ['worker', 'shared_worker', 'service_worker', 'iframe'].includes(params.targetInfo?.type)
      && typeof params.targetInfo?.targetId === 'string' ? [params.targetInfo.targetId] : [];
  }
  if (method !== 'Target.receivedMessageFromTarget' || typeof params.message !== 'string') return [];
  try {
    const child = JSON.parse(params.message);
    return childTargetIds(child.method, child.params ?? {});
  } catch { return []; } // The owning WorkerAttachRouter reports invalid envelopes as capture failure.
}

async function quiesceChildTargets(lease: EvidenceLease): Promise<void> {
  await Promise.all([...(childQuiescers.get(lease) ?? [])].map((stop) => stop()));
}

function attachTimeoutInvalidates(page: Page, lease: EvidenceLease): Promise<boolean> {
  try {
    return page.opener().then((opener) => opener === null).catch(() => {
      lease.markCaptureFailed();
      return true;
    });
  } catch {
    // Structural browser fakes pre-dating popup classification represent wrapper-owned pages.
    return Promise.resolve(true);
  }
}

function pageClosed(page: Page): boolean {
  try { return page.isClosed(); } catch { return false; }
}

function isMissingPageTargetError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /No target with given id|No target found for targetId|Target closed|Session closed|Target page, context or browser has been closed/iu
    .test(message);
}

type HostParts = Readonly<{ fillService: FillService; sessions: BrowserSessionHost; lease: EvidenceLease }>;
type HostState = {
  parts: HostParts; browser?: Browser; admitted: Set<Promise<unknown>>;
  quiescing: boolean; aborted: boolean; aborting?: Promise<void>;
  closing?: Promise<void>; quiescence?: Promise<void>; deadline?: QuiesceDeadline;
};

function compose(parts: HostParts, browser: Browser | undefined): SupervisedHost {
  const state: HostState = { parts, browser, admitted: new Set(), quiescing: false, aborted: false };
  const tools = boundedTools(state, createTools(parts.fillService, createBrowserControls(parts.sessions), parts.lease));
  const host: SupervisedHost = Object.freeze({
    tools, drainEvidence: () => parts.lease.drainEvidence(),
    setupReasonFor: parts.fillService.setupReasonFor,
    abortedEvidence: () => parts.lease.abortedEvidence(),
    settleEvidence: () => parts.lease.settle(state.deadline),
    quiesceEvidenceProducers: (hooks) => state.quiescence ??= quiesce(state, hooks),
    finish: () => finishHost(state), abort: () => abortHost(state),
    closeAll: () => state.closing ??= closeHost(state),
  });
  supervisedHostLeases.set(host, parts.lease);
  return host;
}

function finishHost(state: HostState): TripwireVerdict {
  if (state.parts.sessions.openSessionCount() > 0 || state.admitted.size > 0) {
    throw new Error(FINISH_PRECONDITION_MESSAGE);
  }
  return state.parts.lease.finish();
}

function abortHost(state: HostState): void {
  state.aborted = true; state.quiescing = true;
  state.parts.lease.abort();
  state.aborting ??= disposeProducers(state);
  void state.aborting.catch(() => state.parts.lease.markCaptureFailed());
}

async function disposeProducers(state: HostState): Promise<void> {
  let failure: unknown;
  try { await state.browser?.close(); } catch (error) { failure = error; }
  try { await state.parts.sessions.abortSessions(); } catch (error) { failure ??= error; }
  if (failure !== undefined) throw failure;
}

function admit<T>(state: HostState, operation: () => Promise<T>, refused: () => T): Promise<T> {
  if (state.quiescing || state.aborted) return Promise.resolve().then(refused);
  const work = operation();
  state.admitted.add(work);
  void work.then(() => state.admitted.delete(work), () => state.admitted.delete(work));
  return work;
}

type OperationWatch = { expired: boolean; settled: boolean; stopping?: Promise<void>;
  disposing?: Promise<void>; grace?: NodeJS.Timeout };

async function stopExpiredOperation(state: HostState, id: string, watch: OperationWatch): Promise<void> {
  try { await state.parts.sessions.stopLoading(id); } catch (error) {
    if (!(error instanceof SessionHostError && error.kind === 'unknown-session')) abortHost(state);
  }
  if (watch.settled) return;
  watch.grace = setTimeout(() => {
    watch.disposing = state.parts.sessions.disposeSession(id).catch(() => abortHost(state));
  }, OP_STOP_GRACE_MS);
}

async function bounded<T>(state: HostState, id: string, operation: () => Promise<T>, failed: T): Promise<T> {
  const watch: OperationWatch = { expired: false, settled: false };
  const timer = setTimeout(() => {
    watch.expired = true; watch.stopping = stopExpiredOperation(state, id, watch);
  }, OP_TIMEOUT_MS);
  let result: T;
  try { result = await operation(); }
  catch (error) {
    if (!watch.expired && !state.aborted) throw error;
    result = failed;
  } finally {
    watch.settled = true; clearTimeout(timer); clearTimeout(watch.grace);
    await watch.stopping;
    clearTimeout(watch.grace);
    await watch.disposing;
    await state.aborting?.catch(() => undefined);
  }
  return watch.expired || state.aborted ? failed : result;
}

function boundedTools(state: HostState, raw: VaultTools & BrowserControls): VaultTools & BrowserControls {
  const closed = Object.freeze({ ok: false as const, reason: 'session-unknown' as const });
  return Object.freeze<VaultTools & BrowserControls>({
    list_vault: raw.list_vault, request_vault_setup: raw.request_vault_setup,
    browser_open_session: () => admit(state, raw.browser_open_session,
      () => { throw new Error(BROWSER_OPEN_FAILURE_MESSAGE); }),
    browser_close_session: (args) => admit(state,
      () => bounded(state, args.sessionId, () => raw.browser_close_session(args), Object.freeze({ ok: false })),
      () => Object.freeze({ ok: false })),
    browser_navigate: (args) => admit(state, () => bounded(state, args.sessionId,
      () => raw.browser_navigate(args), createBrowserFailure('navigation-failed')), () => closed),
    browser_click: (args) => admit(state, () => bounded(state, args.sessionId,
      () => raw.browser_click(args), createBrowserFailure('no-such-element')), () => closed),
    browser_type: (args) => admit(state, () => bounded(state, args.sessionId,
      () => raw.browser_type(args), createBrowserFailure('no-such-element')), () => closed),
    browser_snapshot: (args) => admit(state,
      () => bounded(state, args.sessionId, () => raw.browser_snapshot(args), closed), () => closed),
    fill_from_vault: (args) => admit(state, () => bounded(state, args.sessionId,
      () => raw.fill_from_vault(args), createFailedResult({ reason: 'no-password-control' })),
      () => { throw new Error(VAULT_TOOL_FAILURE_MESSAGE); }),
  });
}

function quiesceDeadline(state: HostState, settleTimeoutMs = 0): { deadline: QuiesceDeadline; clear(): void } {
  let expire!: () => void; let expired = false;
  const signal = new Promise<void>((resolve) => { expire = resolve; });
  const abort = () => { expired = true; abortHost(state); expire(); };
  const budget = Math.max(0, settleTimeoutMs) + QUIESCE_TIMEOUT_MS;
  const expiresAt = Date.now() + budget;
  const timer = setTimeout(abort, budget);
  return { deadline: { expiresAt, expired: signal, isExpired: () => expired, abort }, clear: () => clearTimeout(timer) };
}

async function quiesce(state: HostState, hooks: QuiesceHooks = {}): Promise<void> {
  state.quiescing = true;
  const clock = quiesceDeadline(state, hooks.settleTimeoutMs); state.deadline = clock.deadline;
  try {
    await hooks.beforeClose?.();
    await state.parts.sessions.quiesceControls(clock.deadline.expiresAt);
    await Promise.allSettled([...state.admitted]);
    await state.parts.sessions.quiesceControls(clock.deadline.expiresAt);
    await state.parts.lease.settleStrict(clock.deadline);
    await quiesceChildTargets(state.parts.lease);
    if (!state.aborted) await state.parts.sessions.closeAll();
    await state.parts.lease.settleStrict(clock.deadline, true);
    await hooks.afterClose?.();
    if (state.aborted) throw new Error(CAPTURE_FAILED_MESSAGE);
  } catch {
    abortHost(state);
    await state.aborting?.catch(() => undefined);
    await Promise.allSettled([...state.admitted]);
    await state.parts.sessions.closeAll();
    await state.parts.lease.settleStrict(undefined, true);
    throw new Error(CAPTURE_FAILED_MESSAGE);
  } finally { clock.clear(); state.deadline = undefined; }
  if (state.parts.lease.hasCaptureFailed()) throw new Error(CAPTURE_FAILED_MESSAGE);
}

async function closeHost(state: HostState): Promise<void> {
  await state.aborting?.catch(() => undefined);
  if (state.aborted) {
    await Promise.allSettled([...state.admitted]);
    await state.parts.lease.settleStrict(undefined, true);
  }
  await closeAll(state.parts.sessions, state.browser, state.parts.fillService);
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
    browser_open_session: async () => {
      await lease.settleAttach();
      lease.consumeTimedOutAttachOperation();
      return capturedOpen(lease, () => browserTools.browser_open_session());
    },
    browser_close_session: (args: Parameters<BrowserControls['browser_close_session']>[0]) =>
      capturedControl(lease, () => browserTools.browser_close_session(args), Object.freeze({ ok: false })),
    browser_navigate: async (args: Parameters<BrowserControls['browser_navigate']>[0]) => {
      await lease.settleAttach();
      return capturedControl(
        lease, () => browserTools.browser_navigate(args), createBrowserFailure('session-unknown'),
      );
    },
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
  try {
    assertLeaseActive(lease);
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
  try {
    assertLeaseActive(lease);
    const outcome = await fillService.fill(request);
    lease.recordFill(outcome);
    lease.captureTrusted(serializeExact(outcome.result));
    return outcome.result;
  } catch {
    throw new Error(VAULT_TOOL_FAILURE_MESSAGE);
  }
}

async function uncaptured(lease: EvidenceLease,
  operation: () => ReturnType<BrowserControls['browser_snapshot']>): ReturnType<BrowserControls['browser_snapshot']> {
  try {
    assertLeaseActive(lease);
    const result = await operation();
    assertLeaseActive(lease);
    return result;
  } catch (error) {
    if (error instanceof InactiveEvidenceLeaseError) return createSnapshotResult();
    throw error;
  }
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
