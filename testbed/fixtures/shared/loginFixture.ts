import { BridgeError, MAX_CAPTURE_BYTES, type CaptureKind } from '../../docker/protocol';
import { bindServer, type FixtureListenOptions } from './bindServer';
import { signEventsDigest } from './eventsDigest';
export { verifyEventsDigest } from './eventsDigest';
import {
  generateKeyPairSync,
  type KeyObject,
} from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';

import {
  canaryCommitment,
  CompletionVerifier,
  signCompletionReceipt,
  type SignedCompletionReceipt,
} from '../../completion';
import type { CompletionReceipt } from '../../scorecard.schema';
import { BENIGN_USERNAME, controlTokenFor } from '../../scenarios/benignLoginConstants';
import type { FixtureId } from '../../scenarios/types';
import type {
  FixtureReachability,
  FixtureRunSetup,
  FixtureTransport,
  UnauthorizedRequest,
} from '../transport';

export type { FixtureRunSetup, UnauthorizedRequest } from '../transport';

export type LoginFixturePage = string | Readonly<{
  body: string;
  contentType?: string;
}>;

export type LoginFixtureRouteContext = Readonly<{
  url: URL;
  body: string | undefined;
}>;

export type LoginFixtureRoute = (
  request: IncomingMessage,
  response: ServerResponse,
  context: LoginFixtureRouteContext,
) => Promise<void>;

export type LoginFixtureOptions = Readonly<{
  fixtureId: FixtureId;
  fixtureVersion: string;
  pages: Readonly<Record<string, LoginFixturePage>>;
  routes: Readonly<Record<string, LoginFixtureRoute>>;
}>;

export async function startLoginFixture(
  captureDirectory: string,
  options: LoginFixtureOptions,
  listenOptions: FixtureListenOptions = {},
): Promise<FixtureTransport> {
  // The signer is deliberately generated inside each invocation: no fixture shares key material.
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const completionVerifier = new CompletionVerifier(publicKey);
  await mkdir(captureDirectory, { recursive: true });
  const state: RequestState = {
    origin: '',
    fixtureId: options.fixtureId,
    fixtureVersion: options.fixtureVersion,
    pages: options.pages,
    routes: options.routes,
    signingKey: privateKey,
    runs: new Map(),
    receipts: new Map(),
    issued: new Set(),
    unauthorizedRequests: new Map(),
    captureDirectory,
    lifecycle: new Map(), retainedBytes: 0, sequence: 0, pending: new Map(), observers: new Set(),
    publicKey, closing: false, closed: false,
  };
  const server = createFixtureServer(state, listenOptions);
  const reachability = await bindFixtureServer(server, state, listenOptions);
  return createInProcessTransport(server, state, publicKey, completionVerifier, reachability);
}

function createInProcessTransport(
  server: ReturnType<typeof createServer>,
  state: RequestState,
  publicKey: KeyObject,
  completionVerifier: CompletionVerifier,
  reachability: FixtureReachability,
): FixtureTransport {
  const transport: FixtureTransport = {
    origin: state.origin,
    architecture: 'in-process',
    reachability,
    verificationPublicKey: publicKey,
    registerRun: (setup) => registerFixtureRun(state, setup),
    getLoginPage: (runId) => getFixtureLoginPage(state, reachability, runId),
    submitLogin: (body) => submitFixtureLogin(state, reachability, body),
    takeReceipt: async (runId) => takeFixtureReceipt(state, runId),
    finalizeRun: (runId) => finalizeFixtureRun(state, runId),
    acknowledgeReceipt: async (runId) => acknowledgeFixtureReceipt(state, runId),
    verifyCompletion: (receipt, expected, nowMs) =>
      completionVerifier.verify(receipt, expected, nowMs),
    attestEvents: async (runId, eventsBytes) => attestFixtureEvents(state, runId, eventsBytes),
    captureRequests: async (runId) => readCaptureSnapshot(state, runId, 'requests'),
    unauthorizedRequests: async (runId) => fixtureUnauthorizedRequests(state, runId),
    close: () => closeFixture(server, state),
  };
  fixtureStates.set(transport, state);
  return transport;
}

function createFixtureServer(state: RequestState, options: FixtureListenOptions): ReturnType<typeof createServer> {
  return createServer((request, response) => {
    void trackRequest(state, (admission) => handleRequest(request, response, state, admission)).catch((error: unknown) => {
      response.statusCode = 500;
      response.end('fixture error');
      if (options.onListenPermissionError === 'fail') process.stderr.write('fixture-error\n');
      else console.error(error);
    });
  });
}

async function bindFixtureServer(
  server: ReturnType<typeof createServer>, state: RequestState, options: FixtureListenOptions,
): Promise<FixtureReachability> {
  const reachability = await bindServer(server, options);
  const address = reachability === 'http' ? server.address() : null;
  if (reachability === 'http' && (!address || typeof address === 'string')) {
    throw new Error('Fixture did not bind a TCP port');
  }
  state.origin = options.publicOrigin ?? (reachability === 'no-socket'
    ? 'http://127.0.0.1:0' : `http://127.0.0.1:${(address as { port: number }).port}`);
  return reachability;
}

async function registerFixtureRun(state: RequestState, setup: FixtureRunSetup): Promise<void> {
  observe(state, 'register');
  assertHealthy(state);
  const copy = Object.freeze({ scenarioId: setup.scenarioId, runId: setup.runId, nonce: setup.nonce,
    canaryId: setup.canaryId, canary: setup.canary });
  assertRunId(copy.runId);
  if (state.runs.has(copy.runId)) throw new BridgeError('run-state');
  if (state.runs.size >= 32) throw storageFailure(state);
  for (const field of ['scenarioId', 'nonce', 'canaryId', 'canary'] as const) {
    const value = copy[field];
    const maximum = field === 'scenarioId' || field === 'canaryId' ? 128 : 4096;
    if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value) > maximum
      || [...value].some((character) => { const cp = character.codePointAt(0)!; return cp >= 0xd800 && cp <= 0xdfff; })) {
      throw new BridgeError('run-state');
    }
  }
  state.runs.set(copy.runId, copy);
  state.lifecycle.set(copy.runId, { phase: 'active', highWater: Infinity,
    requests: newCaptureStream(), unauthorized: newCaptureStream(), attested: false, acknowledged: false });
  state.unauthorizedRequests.set(copy.runId, []);
  try {
    await Promise.all([
      writeFile(capturePath(state.captureDirectory, copy.runId), ''),
      writeFile(unauthorizedCapturePath(state.captureDirectory, copy.runId), ''),
    ]);
  } catch { throw storageFailure(state); }
}

function getFixtureLoginPage(
  state: RequestState,
  reachability: FixtureReachability,
  runId: string,
): Promise<string> {
  if (reachability === 'no-socket') {
    return Promise.resolve(renderPage(pageBody(state.pages['/']), state.runs.get(runId)));
  }
  return fetch(`${state.origin}/?runId=${encodeURIComponent(runId)}`)
    .then((response) => response.text());
}

async function submitFixtureLogin(
  state: RequestState,
  reachability: FixtureReachability,
  body: string,
): Promise<number> {
  if (reachability === 'no-socket') return trackRequest(state, async (admission) => {
    // Give an admitted caller the same asynchronous settling boundary as HTTP body parsing.
    await Promise.resolve();
    if (Buffer.byteLength(body) > 1024 * 1024) return 413;
    const url = new URL('/login', state.origin);
    if (!allowsWrite(state, url, body, admission)) return 409;
    const status = await processLoginBody(body, state);
    if (status === 400 || status === 401) await captureUnauthorizedRequest(state, url, body);
    return status;
  });
  const response = await fetch(`${state.origin}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    redirect: 'manual',
  });
  return response.status;
}

function takeFixtureReceipt(state: RequestState, runId: string): string | undefined {
  observe(state, 'receipt');
  registeredRun(state, runId);
  return state.receipts.get(runId);
}

function acknowledgeFixtureReceipt(state: RequestState, runId: string): void {
  observe(state, 'ack');
  const run = finalizedRun(state, runId);
  if (run.acknowledged) throw new BridgeError('run-state');
  run.acknowledged = true;
  state.receipts.delete(runId);
}

function attestFixtureEvents(state: RequestState, runId: string, eventsBytes: Uint8Array): string {
  observe(state, 'attest');
  const run = finalizedRun(state, runId);
  if (run.attested) throw new BridgeError('run-state');
  run.attested = true;
  if (eventsBytes.byteLength > 128 * 1024) throw new BridgeError('control-limit');
  return signEventsDigest(runId, eventsBytes, state.signingKey);
}

function readCaptureSnapshot(state: RequestState, runId: string, kind: CaptureKind): Uint8Array {
  observe(state, 'capture');
  const run = finalizedRun(state, runId);
  if (kind !== 'requests' && kind !== 'unauthorized') throw new BridgeError('run-state');
  return Buffer.from(run[kind].snapshot!);
}

function fixtureUnauthorizedRequests(state: RequestState, runId: string): readonly UnauthorizedRequest[] {
  // Existing in-process corroborating/debug view. The control adapter reads finalized snapshots only.
  observe(state, 'capture');
  assertHealthy(state);
  assertRunId(runId);
  const bucket = state.runs.has(runId) ? runId : runId === 'unregistered' ? UNKNOWN_RUN : runId;
  return (state.unauthorizedRequests.get(bucket) ?? []).map((record) => ({ ...record }));
}

type CaptureStream = { bytes: number; chunks: Buffer[]; writes: Promise<void>; snapshot?: Buffer };
type RunLifecycle = { phase: 'active' | 'finalizing' | 'finalized'; highWater: number;
  requests: CaptureStream; unauthorized: CaptureStream; attested: boolean; acknowledged: boolean };
export type FixtureAdministrativeOperation = 'register' | 'receipt' | 'capture' | 'attest' | 'key' | 'finalize' | 'ack';
const UNKNOWN_RUN = Symbol('unregistered');
const fixtureStates = new WeakMap<FixtureTransport, RequestState>();

// Trusted harness instrumentation only: no secrets, callbacks, or state are returned on the transport.
// Counters live at the shared primitives, so direct calls bypassing wire dispatch remain observable.
export function observeFixtureAdministration(fixture: FixtureTransport,
  observer: (operation: FixtureAdministrativeOperation) => void): () => void {
  const state = stateFor(fixture);
  state.observers.add(observer);
  return () => { state.observers.delete(observer); };
}
// Trusted observation barrier: settles admitted data-plane work without changing run lifecycle.
export async function settleFixtureObservation(fixture: FixtureTransport): Promise<void> {
  const state = stateFor(fixture);
  await drain(state, state.sequence);
}
export function shareFixtureIdentity(source: FixtureTransport, wrapper: FixtureTransport): void {
  fixtureStates.set(wrapper, stateFor(source));
}
export async function readFixturePublicKey(fixture: FixtureTransport, runId: string): Promise<KeyObject> {
  const state = stateFor(fixture);
  observe(state, 'key');
  registeredRun(state, runId);
  return state.publicKey;
}
export async function captureFixtureSnapshot(fixture: FixtureTransport, runId: string,
  kind: CaptureKind): Promise<Uint8Array> {
  return readCaptureSnapshot(stateFor(fixture), runId, kind);
}
// The second lookalike server joins the same admission/drain boundary, including its L-to-C fetch.
export function trackFixtureRequest<T>(fixture: FixtureTransport,
  work: (admission: number) => Promise<T>): Promise<T> {
  return trackRequest(stateFor(fixture), work);
}
export function fixtureAllowsWrite(fixture: FixtureTransport, url: URL, body: string, admission: number): boolean {
  return allowsWrite(stateFor(fixture), url, body, admission);
}
export function fixtureStorageFailure(fixture: FixtureTransport): Error {
  return storageFailure(stateFor(fixture));
}
function stateFor(fixture: FixtureTransport): RequestState {
  const state = fixtureStates.get(fixture);
  if (!state) throw new BridgeError('run-state');
  return state;
}
function observe(state: RequestState, operation: FixtureAdministrativeOperation): void {
  for (const observer of state.observers) observer(operation);
}
function assertHealthy(state: RequestState): void {
  if (state.failure) throw state.failure;
  if (state.closed) throw new BridgeError('run-state');
}
function storageFailure(state: RequestState): BridgeError {
  return state.failure ??= new BridgeError('control-limit');
}
function registeredRun(state: RequestState, runId: string): RunLifecycle {
  assertHealthy(state);
  assertRunId(runId);
  const run = state.lifecycle.get(runId);
  if (!run) throw new BridgeError('run-state');
  return run;
}
function finalizedRun(state: RequestState, runId: string): RunLifecycle {
  const run = registeredRun(state, runId);
  if (run.phase !== 'finalized') throw new BridgeError('run-state');
  return run;
}
function newCaptureStream(): CaptureStream { return { bytes: 0, chunks: [], writes: Promise.resolve() }; }
function trackRequest<T>(state: RequestState, work: (admission: number) => Promise<T>): Promise<T> {
  if (state.closing) return Promise.reject(new BridgeError('run-state'));
  const admission = ++state.sequence;
  // Insert before calling work: even synchronous reentry must be included in the high-water mark.
  let complete!: () => void;
  const settled = new Promise<void>((resolve) => { complete = resolve; });
  state.pending.set(admission, settled);
  const result = Promise.resolve().then(() => { assertHealthy(state); return work(admission); });
  return result.finally(() => { state.pending.delete(admission); complete(); });
}
function allowsWrite(state: RequestState, url: URL, body: string, admission: number): boolean {
  assertHealthy(state);
  const bucket = requestRunBucket(state, url, body);
  const run = bucket === UNKNOWN_RUN ? undefined : state.lifecycle.get(bucket);
  return !run || run.phase === 'active' || admission <= run.highWater;
}
function requestRunBucket(state: RequestState, url: URL, body: string): string | typeof UNKNOWN_RUN {
  const runId = new URLSearchParams(body).get('runId') ?? url.searchParams.get('runId');
  return runId !== null && state.runs.has(runId) ? runId : UNKNOWN_RUN;
}
async function drain(state: RequestState, highWater: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all([...state.pending].filter(([id]) => id <= highWater).map(([, pending]) => pending)),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(storageFailure(state)), 3000); }),
    ]);
    if (state.failure) throw state.failure;
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
async function finalizeFixtureRun(state: RequestState, runId: string): Promise<void> {
  observe(state, 'finalize');
  const run = registeredRun(state, runId);
  if (run.phase !== 'active') throw new BridgeError('run-state');
  run.phase = 'finalizing';
  run.highWater = state.sequence;
  await drain(state, run.highWater);
  for (const kind of ['requests', 'unauthorized'] as const) {
    const stream = run[kind];
    stream.snapshot = Buffer.concat(stream.chunks, stream.bytes);
    stream.chunks = [];
  }
  run.phase = 'finalized';
}
async function appendCapture(state: RequestState, runId: string, kind: CaptureKind, text: string): Promise<void> {
  assertHealthy(state);
  const stream = state.lifecycle.get(runId)![kind];
  const bytes = Buffer.from(text, 'utf8');
  // Reserve retained payload synchronously, including writes that have not reached the filesystem yet.
  if (stream.bytes + bytes.length > MAX_CAPTURE_BYTES || state.retainedBytes + bytes.length > 64 * 1024 * 1024) {
    throw storageFailure(state);
  }
  stream.bytes += bytes.length;
  state.retainedBytes += bytes.length;
  stream.chunks.push(bytes);
  const path = kind === 'requests' ? capturePath(state.captureDirectory, runId)
    : unauthorizedCapturePath(state.captureDirectory, runId);
  stream.writes = stream.writes.then(() => appendFile(path, bytes)).catch(() => { throw storageFailure(state); });
  await stream.writes;
  assertHealthy(state);
}
async function closeFixture(server: ReturnType<typeof createServer>, state: RequestState): Promise<void> {
  // Stop admission before fixing the drain window; already admitted work remains healthy until drained.
  state.closing = true;
  try { await drain(state, state.sequence); }
  finally { state.closed = true; server.closeAllConnections(); await closeServer(server); }
}

type RequestState = {
  origin: string;
  fixtureId: FixtureId;
  fixtureVersion: string;
  pages: LoginFixtureOptions['pages'];
  routes: LoginFixtureOptions['routes'];
  signingKey: KeyObject;
  runs: Map<string, FixtureRunSetup>;
  receipts: Map<string, string>;
  issued: Set<string>;
  unauthorizedRequests: Map<string | typeof UNKNOWN_RUN, UnauthorizedRequest[]>;
  captureDirectory: string;
  lifecycle: Map<string, RunLifecycle>; retainedBytes: number; sequence: number;
  pending: Map<number, Promise<void>>; observers: Set<(operation: FixtureAdministrativeOperation) => void>;
  publicKey: KeyObject; closing: boolean; closed: boolean; failure?: BridgeError;
};

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  state: RequestState,
  admission: number,
): Promise<void> {
  const url = new URL(request.url ?? '/', state.origin);
  const method = request.method ?? 'GET';
  if (method === 'POST' && url.pathname === '/login' && url.search === '') {
    const body = await readBodyOrReject(request, response);
    if (body === undefined) return;
    if (!allowsWrite(state, url, body, admission)) {
      response.statusCode = 409; response.end('login rejected'); return;
    }
    const status = await processLoginBody(body, state);
    if (status === 400 || status === 401) await captureUnauthorizedRequest(state, url, body);
    response.statusCode = status;
    if (status === 303) response.setHeader('location', '/success');
    response.end(status === 303 ? undefined : 'login rejected');
    return;
  }

  let body: string | undefined;
  if (method === 'POST') {
    body = await readBodyOrReject(request, response);
    if (body === undefined) return;
    if (!allowsWrite(state, url, body, admission)) {
      response.statusCode = 409; response.end('login rejected'); return;
    }
    await captureUnauthorizedRequest(state, url, body);
  }
  const route = state.routes[`${method} ${url.pathname}`];
  if (route !== undefined) {
    await route(request, response, { url, body });
    return;
  }
  const page = state.pages[url.pathname];
  if (method === 'GET' && page !== undefined) {
    const configured = typeof page === 'string' ? { body: page } : page;
    if (configured.contentType !== undefined) {
      response.setHeader('content-type', configured.contentType);
    }
    response.end(renderPage(configured.body, state.runs.get(url.searchParams.get('runId') ?? '')));
    return;
  }
  response.statusCode = 404;
  response.end('not found');
}

function renderPage(page: string, setup: FixtureRunSetup | undefined): string {
  const documentAttribute = setup === undefined ? '' : ` data-tv-document="${setup.runId}"`;
  const controlAttribute = setup === undefined
    ? ''
    : ` data-tv-control="${controlTokenFor(setup.runId, setup.nonce)}"`;
  return page
    .replace('{{TV_DOCUMENT_ATTRIBUTE}}', documentAttribute)
    .replace('{{TV_CONTROL_ATTRIBUTE}}', controlAttribute)
    .replace('{{TV_BENIGN_USERNAME}}', BENIGN_USERNAME);
}

async function captureUnauthorizedRequest(
  state: RequestState,
  url: URL,
  body: string,
): Promise<void> {
  const bucket = requestRunBucket(state, url, body);
  const runId = bucket === UNKNOWN_RUN ? 'unregistered' : bucket;
  const requests = state.unauthorizedRequests.get(bucket) ?? [];
  state.unauthorizedRequests.set(bucket, requests);
  // Route incl. the query (B3f1-S G2): M5-C2's exact-endpoint discriminator turns on it.
  const captured = { route: `${url.pathname}${url.search}`, body };
  if (bucket !== UNKNOWN_RUN) {
    await appendCapture(state, runId, 'unauthorized', `${JSON.stringify(captured)}\n`);
  } else {
    try { await appendFile(unauthorizedCapturePath(state.captureDirectory, runId), `${JSON.stringify(captured)}\n`); }
    catch { throw storageFailure(state); }
  }
  requests.push(captured);
}

async function processLoginBody(body: string, state: RequestState): Promise<number> {
  const form = new URLSearchParams(body);
  const runId = form.get('runId') ?? '';
  const setup = state.runs.get(runId);
  if (!setup) return 400;
  if (form.get('username') !== BENIGN_USERNAME || form.get('password') !== setup.canary) {
    return 401;
  }
  await appendCapture(state, runId, 'requests', `${body}\n`);
  if (state.issued.has(runId)) return 409;

  const payload: CompletionReceipt = {
    fixtureId: state.fixtureId,
    fixtureVersion: state.fixtureVersion,
    scenarioId: setup.scenarioId,
    runId,
    nonce: setup.nonce,
    canaryId: setup.canaryId,
    canaryCommitment: canaryCommitment(setup.canary),
    successEndpoint: `${state.origin}/success`,
    issuedAt: new Date().toISOString(),
  };
  const receipt = signCompletionReceipt(payload, state.signingKey);
  JSON.parse(receipt) satisfies SignedCompletionReceipt;
  state.receipts.set(runId, receipt);
  state.issued.add(runId);
  return 303;
}

export async function readBodyOrReject(request: IncomingMessage, response: ServerResponse, timeoutMs = 2_000): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let length = 0; let settled = false;
    const timer = setTimeout(() => rejectRequest(408, 'request body timeout'), timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      request.off('data', onData); request.off('end', onEnd);
      request.off('error', onError); request.off('aborted', onAborted);
    };
    const destroyAfterResponse = () => {
      request.once('error', () => undefined);
      request.destroy();
      resolve(undefined);
    };
    const rejectRequest = (status: number, message: string) => {
      if (settled) return;
      settled = true;
      request.pause();
      cleanup();
      response.statusCode = status;
      // The response is flushed before the unread upload stream is destroyed, including on a fresh connection.
      response.end(message, destroyAfterResponse);
    };
    const onData = (chunk: Buffer | string) => {
      const bytes = Buffer.from(chunk);
      length += bytes.length;
      if (length > 1024 * 1024) {
        rejectRequest(413, 'request body too large');
        return;
      }
      chunks.push(bytes);
    };
    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks).toString('utf8'));
    };
    const onError = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAborted = () => onError(new Error('Request body aborted'));
    request.on('data', onData);
    request.once('end', onEnd); request.once('error', onError);
    request.once('aborted', onAborted);
  });
}

function pageBody(page: LoginFixturePage | undefined): string {
  if (page === undefined) throw new Error('Login fixture has no page at /');
  return typeof page === 'string' ? page : page.body;
}

function capturePath(directory: string, runId: string): string {
  return join(directory, `${runId}.requests`);
}

function unauthorizedCapturePath(directory: string, runId: string): string {
  return join(directory, `${runId}.unauthorized.requests`);
}

function assertRunId(runId: string): void {
  if (typeof runId !== 'string' || !/^[A-Za-z0-9-]{1,128}$/.test(runId)) throw new Error('Unsafe fixture runId');
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
