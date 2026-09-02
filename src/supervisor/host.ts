import type { CredentialBackend } from '../backends/backend';
import { BROWSER_OPEN_FAILURE_MESSAGE, createBrowserControls } from '../browser/controls';
import { createBrowserFailure } from '../browser/controlResults';
import {
  launchChromium,
  type Browser,
  type BrowserContext,
  type ChromiumLauncher,
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
import type { BrowserControls, FillRequest, VaultTools } from '../core/types';
import type { CapturedEventInput } from '../agents/transcript';
import { serializeExact } from '../agents/transcript';
import { createLockdownDomain } from './lockdownDomain';
import {
  TripwireRun,
} from './tripwireSeam';

type TripwireVerdict = ReturnType<TripwireRun['adjudicate']>;

type RequestLike = Readonly<{
  postData(): string | null;
  method(): string;
  url(): string;
}>;

const CAPTURE_FAILED_MESSAGE = 'Evidence capture failed';
export const VAULT_TOOL_FAILURE_MESSAGE = 'Vault operation failed';
const leaseEvidence = new WeakMap<EvidenceLease, CapturedEventInput[]>();

export class EvidenceLease {
  readonly #run: TripwireRun;
  readonly #tripwireEvidence: ReturnType<TripwireRun['captureTrusted']>[] = [];
  #canary: string | null;
  #captureFailed = false;
  #active = true;

  constructor(canary: string) {
    this.#run = new TripwireRun(canary);
    this.#canary = canary;
    leaseEvidence.set(this, []);
    this.recordRequest = this.recordRequest.bind(this);
  }

  recordRequest(request: RequestLike): void {
    try {
      // M5 owns bodyless-request capture; v0.1 records only requests with a body.
      const bytes = request.postData();
      if (bytes === null) return;
      const parsed = new URL(request.url());
      const origin = validateBareOrigin(parsed.origin);
      this.#record(Object.freeze({
        channel: 'network-body', direction: 'outbound', origin,
        method: request.method(), route: `${parsed.pathname}${parsed.search}`,
        initiator: 'browser', bytes,
      }));
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
    this.#tripwireEvidence.push(this.#run.captureTrusted(bytes));
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
    const { topOrigin, topPath, reobservedOrigin } = outcome.observation;
    if (topOrigin !== null) this.#record(Object.freeze({
      channel: 'url', direction: 'internal', initiator: 'fill-service',
      origin: topOrigin, bytes: topPath ?? '',
    }));
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
    return context;
  };
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
