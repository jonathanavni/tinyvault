import * as crypto from 'node:crypto';

import {
  MAX_SECRET_CODE_UNITS,
  SessionHostError,
  type FillDestinationPort,
  type InjectOutcome,
  type PinOutcome,
  type PinnedDestination,
  type SessionHost,
  type TopObservation,
} from '../core/browserPort';
import type {
  ControlIdentity,
  ControlIdentityMintAuthority,
  LockdownLifecycle,
  LockdownRegistry,
} from '../core/lockdown';
import { validateBareOrigin } from '../core/originGuard';
import type { Secret } from '../core/redaction';
import { MUTEX_CLOSED_MESSAGE, MUTEX_REENTRANT_MESSAGE, SessionMutex } from '../core/sessionMutex';
import type { MaskedSnapshot, Origin } from '../core/types';
import { ASSIGN_SOURCE, SNAPSHOT_SOURCE, TYPE_SOURCE, VERIFY_DESTINATION_SOURCE } from './inRealm';
import type { BrowserContext, CDPSession, Page } from './playwright';

export type BrowserSessionHostOptions = Readonly<{
  newContext: () => Promise<BrowserContext>;
  authority: ControlIdentityMintAuthority;
  registry: LockdownRegistry;
  lifecycle: LockdownLifecycle;
}>;

export type SessionPage = Readonly<{
  navigate(url: string): Promise<void>;
  click(selector: string): Promise<void>;
  type(selector: string, text: string): Promise<'ok' | 'locked-field'>;
  snapshot(): Promise<MaskedSnapshot>;
}>;

export interface BrowserSessionHost extends SessionHost {
  openSession(): Promise<{ sessionId: string }>;
  closeSession(sessionId: string): Promise<boolean>;
  runControl<T>(sessionId: string, op: (page: SessionPage) => Promise<T>): Promise<T>;
  openSessionCount(): number;
  closeAll(): Promise<void>;
}

type TaintEntry = { identity: ControlIdentity; backendNodeId: number; epoch: number };
type SessionState = {
  sessionId: string;
  context: BrowserContext;
  page: Page;
  cdp: CDPSession;
  epoch: number;
  frameId: string;
  loaderId: string;
  world?: { epoch: number; executionContextId: number };
  taint: TaintEntry[];
  pinnedObjects: Set<string>;
  closing: boolean;
  pageClosed: boolean;
  closeLifecycleSent: boolean;
};

type RemoteArgument = Readonly<{ value: unknown }> | Readonly<{ objectId: string }>;

const MISSING_CONTROL_MESSAGE = 'Missing browser control';
const CLICK_TIMEOUT_MS = 5_000;
const NAVIGATION_SETTLE_TIMEOUT_MS = 2_000;

class BrowserSessionHostImpl implements BrowserSessionHost {
  readonly #sessions = new Map<string, SessionState>();
  readonly #mutex = new SessionMutex();
  readonly #options: BrowserSessionHostOptions;

  constructor(options: BrowserSessionHostOptions) {
    this.#options = options;
  }

  async openSession(): Promise<{ sessionId: string }> {
    const sessionId = this.#newSessionId();
    let context: BrowserContext | undefined;
    try {
      context = await this.#options.newContext();
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      const state = newSessionState(sessionId, context, page, cdp);
      attachLifecycle(state, this.#options.lifecycle);
      await initializeCdp(state);
      this.#sessions.set(sessionId, state);
      return { sessionId };
    } catch (error) {
      await context?.close().catch(() => undefined);
      throw error;
    }
  }

  async closeSession(sessionId: string): Promise<boolean> {
    const state = this.#sessions.get(sessionId);
    if (state === undefined || state.closing) return false;
    state.closing = true;
    await waitForLoad(state.page);
    try {
      await this.#mutex.close(sessionId);
    } finally {
      await disposeState(state, this.#options.lifecycle);
      this.#sessions.delete(sessionId);
    }
    return true;
  }

  runExclusive<T>(sessionId: string, op: (port: FillDestinationPort) => Promise<T>): Promise<T> {
    return this.#withSession(sessionId, (state) => op(createFillPort(state, this.#options)));
  }

  runControl<T>(sessionId: string, op: (page: SessionPage) => Promise<T>): Promise<T> {
    return this.#withSession(sessionId, (state) => op(createSessionPage(state, this.#options)));
  }

  openSessionCount(): number {
    return this.#sessions.size;
  }

  async closeAll(): Promise<void> {
    const ids = [...this.#sessions.keys()];
    await Promise.all(ids.map((id) => this.closeSession(id).catch(() => false)));
  }

  #newSessionId(): string {
    let id: string;
    do id = crypto.randomBytes(16).toString('hex'); while (this.#sessions.has(id));
    return id;
  }

  async #withSession<T>(sessionId: string, op: (state: SessionState) => Promise<T>): Promise<T> {
    const state = this.#sessions.get(sessionId);
    if (state === undefined) throw new SessionHostError('unknown-session');
    if (state.closing) throw new SessionHostError('closing');
    try {
      return await this.#mutex.runExclusive(sessionId, () => op(state));
    } catch (error) {
      if (error instanceof Error && error.message === MUTEX_CLOSED_MESSAGE) {
        throw new SessionHostError('closing');
      }
      if (error instanceof Error && error.message === MUTEX_REENTRANT_MESSAGE) {
        throw new SessionHostError('reentrant');
      }
      throw error;
    }
  }
}

export function createBrowserSessionHost(options: BrowserSessionHostOptions): BrowserSessionHost {
  return new BrowserSessionHostImpl(options);
}

function newSessionState(
  sessionId: string,
  context: BrowserContext,
  page: Page,
  cdp: CDPSession,
): SessionState {
  return {
    sessionId, context, page, cdp, epoch: 0, frameId: '', loaderId: '',
    taint: [], pinnedObjects: new Set(), closing: false, pageClosed: false,
    closeLifecycleSent: false,
  };
}

function attachLifecycle(state: SessionState, lifecycle: LockdownLifecycle): void {
  state.cdp.on('Page.frameNavigated', (event: unknown) => {
    const frame = eventFrame(event);
    if (frame !== undefined && isMainFrame(state, frame)) resetDocument(state, lifecycle, frame);
  });
  state.cdp.on('Page.documentOpened', (event: unknown) => {
    const frame = eventFrame(event);
    if (frame !== undefined && isMainFrame(state, frame)) resetDocument(state, lifecycle, frame);
  });
  state.page.on('close', () => closePageState(state, lifecycle));
}

async function initializeCdp(state: SessionState): Promise<void> {
  await state.cdp.send('Page.enable');
  await state.cdp.send('DOM.enable');
  await state.cdp.send('Runtime.enable');
  const response = await state.cdp.send('Page.getFrameTree') as Record<string, any>;
  const frame = response.frameTree?.frame as Record<string, unknown> | undefined;
  if (frame !== undefined && state.frameId === '') {
    state.frameId = String(frame.id ?? '');
    state.loaderId = String(frame.loaderId ?? '');
  }
}

function eventFrame(event: unknown): Record<string, unknown> | undefined {
  if (typeof event !== 'object' || event === null || !('frame' in event)) return undefined;
  const frame = (event as { frame: unknown }).frame;
  return typeof frame === 'object' && frame !== null ? frame as Record<string, unknown> : undefined;
}

function isMainFrame(state: SessionState, frame: Record<string, unknown>): boolean {
  const id = String(frame.id ?? '');
  if (state.frameId !== '') return id === state.frameId;
  if (frame.parentId !== undefined) return false;
  state.frameId = id;
  return true;
}

function resetDocument(
  state: SessionState,
  lifecycle: LockdownLifecycle,
  frame: Record<string, unknown>,
): void {
  state.epoch += 1;
  state.loaderId = String(frame.loaderId ?? '');
  lifecycle.clearOnTrustedTopLevelNavigation(state.sessionId);
  state.world = undefined;
  state.taint.length = 0;
  void releasePinnedObjects(state);
}

function closePageState(state: SessionState, lifecycle: LockdownLifecycle): void {
  if (state.pageClosed) return;
  state.pageClosed = true;
  state.epoch += 1;
  sendCloseLifecycle(state, lifecycle);
  state.world = undefined;
  state.taint.length = 0;
  void releasePinnedObjects(state);
}

function sendCloseLifecycle(state: SessionState, lifecycle: LockdownLifecycle): void {
  if (state.closeLifecycleSent) return;
  state.closeLifecycleSent = true;
  lifecycle.clearOnSessionClose(state.sessionId);
}

async function waitForLoad(page: Page): Promise<void> {
  await page.waitForLoadState('load', { timeout: 2_000 }).catch(() => undefined);
}

async function disposeState(state: SessionState, lifecycle: LockdownLifecycle): Promise<void> {
  try {
    sendCloseLifecycle(state, lifecycle);
  } finally {
    state.world = undefined;
    state.taint.length = 0;
    await releasePinnedObjects(state);
    try {
      await state.cdp.detach();
    } catch {
      // The page may already have detached its CDP target.
    } finally {
      await state.context.close().catch(() => undefined);
    }
  }
}

async function releasePinnedObjects(state: SessionState): Promise<void> {
  const objectIds = [...state.pinnedObjects];
  state.pinnedObjects.clear();
  await Promise.all(objectIds.map((objectId) => releaseObject(state.cdp, objectId)));
}

function createFillPort(state: SessionState, options: BrowserSessionHostOptions): FillDestinationPort {
  return Object.freeze({
    documentEpoch: () => state.epoch,
    observeTop: () => observeTop(state),
    pinPasswordDestination: (selector: string) => pinDestination(state, options, selector),
  });
}

async function observeTop(state: SessionState): Promise<TopObservation> {
  if (state.pageClosed) return Object.freeze({ origin: null, path: null });
  try {
    const parsed = new URL(state.page.url());
    const origin = validateBareOrigin(parsed.origin);
    return Object.freeze({ origin, path: `${origin}${parsed.pathname}` });
  } catch {
    return Object.freeze({ origin: null, path: null });
  }
}

async function pinDestination(
  state: SessionState,
  options: BrowserSessionHostOptions,
  selector: string,
): Promise<PinOutcome> {
  if (state.pageClosed) return Object.freeze({ kind: 'no-password-control' });
  let objectId: string | undefined;
  try {
    const node = await resolveMainNode(state, selector);
    if (node === undefined) return reasonFromChildFrames(state.page, selector);
    const executionContextId = await isolatedWorld(state);
    objectId = await resolveObject(state.cdp, node.backendNodeId, executionContextId);
    state.pinnedObjects.add(objectId);
    const verified = await callFunctionOn<boolean>(state.cdp, objectId, VERIFY_DESTINATION_SOURCE, []);
    if (!verified) {
      await disposePinnedObject(state, objectId);
      return Object.freeze({ kind: 'no-password-control' });
    }
    return pinnedOutcome(state, options, node.backendNodeId, objectId);
  } catch {
    if (objectId !== undefined) await disposePinnedObject(state, objectId);
    return Object.freeze({ kind: 'no-password-control' });
  }
}

async function resolveMainNode(
  state: SessionState,
  selector: string,
): Promise<{ backendNodeId: number } | undefined> {
  const document = await state.cdp.send('DOM.getDocument', { depth: 0, pierce: false }) as Record<string, any>;
  const nodeId = Number((await state.cdp.send('DOM.querySelector', {
    nodeId: document.root.nodeId, selector,
  }) as Record<string, unknown>).nodeId ?? 0);
  if (nodeId === 0) return undefined;
  const described = await state.cdp.send('DOM.describeNode', { nodeId }) as Record<string, any>;
  const backendNodeId = Number(described.node?.backendNodeId ?? 0);
  if (!Number.isSafeInteger(backendNodeId) || backendNodeId <= 0) return undefined;
  return { backendNodeId };
}

async function reasonFromChildFrames(page: Page, selector: string): Promise<PinOutcome> {
  const main = page.mainFrame();
  const topOrigin = await frameOrigin(main);
  for (const frame of page.frames()) {
    if (frame === main || await frame.locator(selector).count() === 0) continue;
    const origin = await frameOrigin(frame);
    if (origin !== null && origin !== topOrigin) {
      return Object.freeze({ kind: 'cross-origin-frame' });
    }
  }
  return Object.freeze({ kind: 'no-password-control' });
}

async function frameOrigin(frame: ReturnType<Page['mainFrame']>): Promise<string | null> {
  try {
    // Main-world location.origin is an unforgeable platform read used only to select a refusal reason;
    // both same-origin and cross-origin child-frame branches refuse to pin or fill the subframe.
    return await frame.evaluate(() => location.origin);
  } catch {
    return null;
  }
}

function pinnedOutcome(
  state: SessionState,
  options: BrowserSessionHostOptions,
  backendNodeId: number,
  objectId: string,
): PinOutcome {
  const identity = options.authority.mint({
    sessionId: state.sessionId,
    documentId: String(state.loaderId),
    frameId: 'top',
    elementId: String(backendNodeId),
  });
  const destination: PinnedDestination = Object.freeze({
    identity,
    inject: (secret: Secret, expectedOrigin: Origin) =>
      injectDestination(state, identity, backendNodeId, objectId, secret, expectedOrigin),
  });
  return Object.freeze({ kind: 'pinned', destination });
}

async function injectDestination(
  state: SessionState,
  identity: ControlIdentity,
  backendNodeId: number,
  objectId: string,
  secret: Secret,
  expectedOrigin: Origin,
): Promise<InjectOutcome> {
  const value = secret.consume();
  try {
    if (value.length > MAX_SECRET_CODE_UNITS) return tooLongOutcome();
    const hex = toFixedHex(value);
    const lengthDigits = String(value.length).padStart(4, '0');
    state.taint.push({ identity, backendNodeId, epoch: state.epoch });
    let out: unknown;
    try {
      out = await callFunctionOn<unknown>(state.cdp, objectId, ASSIGN_SOURCE, [
        { value: expectedOrigin }, { value: hex }, { value: lengthDigits },
      ]);
    } catch {
      return Object.freeze({ assigned: false, reason: 'transport' });
    }
    const normalized = normalizeInjectOutcome(out);
    if (!normalized.assigned && normalized.reason !== 'transport') removeTaint(state, identity);
    return normalized;
  } finally {
    await disposePinnedObject(state, objectId);
  }
}

function tooLongOutcome(): InjectOutcome {
  return Object.freeze({ assigned: false, reason: 'too-long' });
}

function toFixedHex(value: string): string {
  const padded = value.padEnd(MAX_SECRET_CODE_UNITS, 'A');
  let hex = '';
  for (let index = 0; index < MAX_SECRET_CODE_UNITS; index += 1) {
    hex += padded.charCodeAt(index).toString(16).padStart(4, '0');
  }
  return hex;
}

function normalizeInjectOutcome(value: unknown): InjectOutcome {
  if (!isRecord(value) || typeof value.assigned !== 'boolean') return transportOutcome();
  if (value.assigned) {
    if (typeof value.observedOrigin !== 'string') return transportOutcome();
    try {
      const observedOrigin = validateBareOrigin(value.observedOrigin);
      const controlToken = nullableString(value.controlToken);
      const documentToken = nullableString(value.documentToken);
      if (controlToken === undefined || documentToken === undefined) return transportOutcome();
      return Object.freeze({ assigned: true, observedOrigin, controlToken, documentToken });
    } catch {
      return transportOutcome();
    }
  }
  if (value.reason === 'identity') return Object.freeze({ assigned: false, reason: 'identity' });
  if (value.reason !== 'origin') return transportOutcome();
  return originOutcome(value.observedOrigin);
}

function originOutcome(value: unknown): InjectOutcome {
  if (typeof value !== 'string') return Object.freeze({ assigned: false, reason: 'origin', observedOrigin: null });
  try {
    return Object.freeze({ assigned: false, reason: 'origin', observedOrigin: validateBareOrigin(value) });
  } catch {
    return Object.freeze({ assigned: false, reason: 'origin', observedOrigin: null });
  }
}

function transportOutcome(): InjectOutcome {
  return Object.freeze({ assigned: false, reason: 'transport' });
}

function nullableString(value: unknown): string | null | undefined {
  return value === null || typeof value === 'string' ? value : undefined;
}

function removeTaint(state: SessionState, identity: ControlIdentity): void {
  state.taint = state.taint.filter((entry) => entry.identity !== identity);
}

function createSessionPage(state: SessionState, options: BrowserSessionHostOptions): SessionPage {
  return Object.freeze({
    navigate: (url: string) => navigatePage(state, url),
    click: (selector: string) => clickOnPage(state, selector),
    type: (selector: string, text: string) => typeOnPage(state, options, selector, text),
    snapshot: () => snapshotPage(state),
  });
}

async function navigatePage(state: SessionState, url: string): Promise<void> {
  try {
    await state.page.goto(url);
  } catch (error) {
    // A failed navigation commits a Chromium error page as a pending main-frame navigation that would
    // interrupt the next goto. Wait for that commit (probed: waitForLoadState does not observe it).
    await state.page.waitForEvent('framenavigated', {
      timeout: NAVIGATION_SETTLE_TIMEOUT_MS,
      predicate: (frame) => frame === state.page.mainFrame(),
    }).catch(() => undefined);
    throw error;
  }
}

async function clickOnPage(state: SessionState, selector: string): Promise<void> {
  if (await resolveMainNode(state, selector) === undefined) throw new Error(MISSING_CONTROL_MESSAGE);
  await state.page.locator(selector).click({ timeout: CLICK_TIMEOUT_MS });
  await waitForLoad(state.page);
}

async function typeOnPage(
  state: SessionState,
  options: BrowserSessionHostOptions,
  selector: string,
  text: string,
): Promise<'ok' | 'locked-field'> {
  const node = await resolveMainNode(state, selector);
  if (node === undefined) throw new Error(MISSING_CONTROL_MESSAGE);
  const identity = options.authority.mint({
    sessionId: state.sessionId, documentId: state.loaderId, frameId: 'top',
    elementId: String(node.backendNodeId),
  });
  if (isTainted(state, node.backendNodeId) || options.registry.isLocked(identity)) return 'locked-field';
  const executionContextId = await isolatedWorld(state);
  const objectId = await resolveObject(state.cdp, node.backendNodeId, executionContextId);
  try {
    const assigned = await callFunctionOn<boolean>(state.cdp, objectId, TYPE_SOURCE, [{ value: text }]);
    if (!assigned) throw new Error(MISSING_CONTROL_MESSAGE);
    return 'ok';
  } finally {
    await releaseObject(state.cdp, objectId);
  }
}

async function snapshotPage(state: SessionState): Promise<MaskedSnapshot> {
  const temporaryObjects: string[] = [];
  try {
    const executionContextId = await isolatedWorld(state);
    const document = await state.cdp.send('DOM.getDocument', { depth: 0 }) as Record<string, any>;
    const rootId = await resolveNodeId(state.cdp, document.root.nodeId, executionContextId);
    temporaryObjects.push(rootId);
    const taintedIds = await resolveTaintedObjects(state, executionContextId);
    temporaryObjects.push(...taintedIds);
    const value = await callFunctionOn<unknown>(state.cdp, rootId, SNAPSHOT_SOURCE,
      taintedIds.map((objectId) => ({ objectId })));
    return normalizeSnapshot(value);
  } catch {
    return Object.freeze({ url: '', nodes: Object.freeze([]) }) as unknown as MaskedSnapshot;
  } finally {
    await Promise.all(temporaryObjects.map((objectId) => releaseObject(state.cdp, objectId)));
  }
}

async function resolveTaintedObjects(state: SessionState, executionContextId: number): Promise<string[]> {
  const objectIds: string[] = [];
  for (const entry of state.taint) {
    if (entry.epoch !== state.epoch) continue;
    try {
      objectIds.push(await resolveObject(state.cdp, entry.backendNodeId, executionContextId));
    } catch {
      // Keep the provenance entry; a later re-insertion of this node must remain masked.
    }
  }
  return objectIds;
}

function normalizeSnapshot(value: unknown): MaskedSnapshot {
  if (!isRecord(value) || typeof value.url !== 'string' || !Array.isArray(value.nodes)) {
    return Object.freeze({ url: '', nodes: Object.freeze([]) }) as unknown as MaskedSnapshot;
  }
  const nodes = value.nodes.flatMap((node) => normalizeSnapshotNode(node));
  return Object.freeze({ url: value.url, nodes: Object.freeze(nodes) }) as MaskedSnapshot;
}

function normalizeSnapshotNode(value: unknown): MaskedSnapshot['nodes'] {
  if (!isRecord(value) || typeof value.tag !== 'string' || typeof value.masked !== 'boolean') return [];
  if (value.masked) return [Object.freeze({ tag: value.tag, masked: true })];
  const node: Record<string, unknown> = { tag: value.tag, masked: false };
  for (const field of ['role', 'name', 'value'] as const) {
    if (typeof value[field] === 'string') node[field] = value[field];
  }
  return [Object.freeze(node) as MaskedSnapshot['nodes'][number]];
}

function isTainted(state: SessionState, backendNodeId: number): boolean {
  return state.taint.some((entry) => entry.epoch === state.epoch && entry.backendNodeId === backendNodeId);
}

async function isolatedWorld(state: SessionState): Promise<number> {
  if (state.world?.epoch === state.epoch) return state.world.executionContextId;
  const epoch = state.epoch;
  const response = await state.cdp.send('Page.createIsolatedWorld', {
    frameId: state.frameId, worldName: 'tinyvault',
  }) as Record<string, unknown>;
  const executionContextId = Number(response.executionContextId);
  if (!Number.isSafeInteger(executionContextId) || state.epoch !== epoch) {
    throw new Error('Browser document changed');
  }
  state.world = { epoch, executionContextId };
  return executionContextId;
}

async function resolveObject(
  cdp: CDPSession,
  backendNodeId: number,
  executionContextId: number,
): Promise<string> {
  const response = await cdp.send('DOM.resolveNode', {
    backendNodeId, executionContextId,
  }) as Record<string, any>;
  const objectId = response.object?.objectId;
  if (typeof objectId !== 'string') throw new Error('Browser node could not be resolved');
  return objectId;
}

async function resolveNodeId(
  cdp: CDPSession,
  nodeId: number,
  executionContextId: number,
): Promise<string> {
  const response = await cdp.send('DOM.resolveNode', {
    nodeId, executionContextId,
  }) as Record<string, any>;
  const objectId = response.object?.objectId;
  if (typeof objectId !== 'string') throw new Error('Browser document could not be resolved');
  return objectId;
}

async function callFunctionOn<T>(
  cdp: CDPSession,
  objectId: string,
  functionDeclaration: string,
  args: readonly RemoteArgument[],
): Promise<T> {
  const response = await cdp.send('Runtime.callFunctionOn', {
    objectId, functionDeclaration, arguments: [...args],
    returnByValue: true, awaitPromise: false,
  }) as Record<string, any>;
  if (response.exceptionDetails !== undefined || !Object.hasOwn(response.result ?? {}, 'value')) {
    throw new Error('Browser function failed');
  }
  return response.result.value as T;
}

async function disposePinnedObject(state: SessionState, objectId: string): Promise<void> {
  state.pinnedObjects.delete(objectId);
  await releaseObject(state.cdp, objectId);
}

async function releaseObject(cdp: CDPSession, objectId: string): Promise<void> {
  await cdp.send('Runtime.releaseObject', { objectId }).catch(() => undefined);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
