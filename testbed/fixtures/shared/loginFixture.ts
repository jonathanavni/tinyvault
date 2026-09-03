import {
  createHash,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
  type KeyObject,
} from 'node:crypto';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';

import {
  canaryCommitment,
  CompletionVerifier,
  signCompletionReceipt,
  type CompletionBinding,
  type CompletionVerification,
  type SignedCompletionReceipt,
} from '../../completion';
import type { CompletionReceipt } from '../../scorecard.schema';
import { BENIGN_USERNAME, controlTokenFor } from '../../scenarios/benignLogin';
import type { FixtureId } from '../../scenarios/types';

export type FixtureRunSetup = {
  scenarioId: string;
  runId: string;
  nonce: string;
  canaryId: string;
  canary: string;
};

export type LoginFixture = {
  origin: string;
  transport: 'http' | 'in-process';
  /** Trusted in-process verification anchor; the private signing key never leaves this fixture. */
  verificationPublicKey: KeyObject;
  registerRun(setup: FixtureRunSetup): Promise<void>;
  getLoginPage(runId: string): Promise<string>;
  submitLogin(body: string): Promise<number>;
  takeReceipt(runId: string): string | undefined;
  verifyCompletion(
    receipt: string | undefined,
    expected: CompletionBinding,
    nowMs?: number,
  ): CompletionVerification;
  attestEvents(runId: string, eventsBytes: Uint8Array): string;
  capturePath(runId: string): string;
  unauthorizedRequests(runId: string): readonly string[];
  close(): Promise<void>;
};

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
): Promise<LoginFixture> {
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
  };
  const server = createFixtureServer(state);
  const transport = await bindFixtureServer(server, state);
  return createFixtureApi(server, state, publicKey, completionVerifier, transport);
}

function createFixtureApi(
  server: ReturnType<typeof createServer>,
  state: RequestState,
  publicKey: KeyObject,
  completionVerifier: CompletionVerifier,
  transport: LoginFixture['transport'],
): LoginFixture {
  return {
    origin: state.origin,
    transport,
    verificationPublicKey: publicKey,
    registerRun: (setup) => registerFixtureRun(state, setup),
    getLoginPage: (runId) => getFixtureLoginPage(state, transport, runId),
    submitLogin: (body) => submitFixtureLogin(state, transport, body),
    takeReceipt: (runId) => takeFixtureReceipt(state, runId),
    verifyCompletion: (receipt, expected, nowMs) =>
      completionVerifier.verify(receipt, expected, nowMs),
    attestEvents: (runId, eventsBytes) => attestFixtureEvents(state, runId, eventsBytes),
    capturePath: (runId) => checkedCapturePath(state.captureDirectory, runId),
    unauthorizedRequests: (runId) => fixtureUnauthorizedRequests(state, runId),
    close: () => closeServer(server),
  };
}

function createFixtureServer(state: RequestState): ReturnType<typeof createServer> {
  return createServer((request, response) => {
    void handleRequest(request, response, state).catch((error: unknown) => {
      response.statusCode = 500;
      response.end('fixture error');
      console.error(error);
    });
  });
}

async function bindFixtureServer(
  server: ReturnType<typeof createServer>,
  state: RequestState,
): Promise<LoginFixture['transport']> {
  try {
    await listen(server);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Fixture did not bind a TCP port');
    state.origin = `http://127.0.0.1:${address.port}`;
    return 'http';
  } catch (error) {
    if (!isListenPermissionError(error)) throw error;
    state.origin = 'http://127.0.0.1:0';
    return 'in-process';
  }
}

async function registerFixtureRun(state: RequestState, setup: FixtureRunSetup): Promise<void> {
  assertRunId(setup.runId);
  if (state.runs.has(setup.runId)) throw new Error(`Duplicate fixture run: ${setup.runId}`);
  state.runs.set(setup.runId, setup);
  await Promise.all([
    writeFile(capturePath(state.captureDirectory, setup.runId), ''),
    writeFile(unauthorizedCapturePath(state.captureDirectory, setup.runId), ''),
  ]);
  state.unauthorizedRequests.set(setup.runId, []);
}

function getFixtureLoginPage(
  state: RequestState,
  transport: LoginFixture['transport'],
  runId: string,
): Promise<string> {
  if (transport === 'in-process') {
    return Promise.resolve(renderPage(pageBody(state.pages['/']), state.runs.get(runId)));
  }
  return fetch(`${state.origin}/?runId=${encodeURIComponent(runId)}`)
    .then((response) => response.text());
}

async function submitFixtureLogin(
  state: RequestState,
  transport: LoginFixture['transport'],
  body: string,
): Promise<number> {
  if (transport === 'in-process') return processLoginBody(body, state);
  const response = await fetch(`${state.origin}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    redirect: 'manual',
  });
  return response.status;
}

function takeFixtureReceipt(state: RequestState, runId: string): string | undefined {
  const receipt = state.receipts.get(runId);
  state.receipts.delete(runId);
  return receipt;
}

function attestFixtureEvents(
  state: RequestState,
  runId: string,
  eventsBytes: Uint8Array,
): string {
  assertRunId(runId);
  // These bytes belong to this REGISTERED run; completion is proven only by the receipt.
  if (!state.runs.has(runId)) throw new Error(`Cannot attest unknown fixture run: ${runId}`);
  return signEventsDigest(runId, eventsBytes, state.signingKey);
}

function checkedCapturePath(directory: string, runId: string): string {
  assertRunId(runId);
  return capturePath(directory, runId);
}

function fixtureUnauthorizedRequests(
  state: RequestState,
  runId: string,
): readonly string[] {
  assertRunId(runId);
  return [...(state.unauthorizedRequests.get(runId) ?? [])];
}

type EventsDigestPayload = { runId: string; eventsSha256: string };

type SignedEventsDigest = {
  version: '1';
  payload: EventsDigestPayload;
  signature: string;
};

export function verifyEventsDigest(
  serialized: string,
  expectedRunId: string,
  eventsBytes: Uint8Array,
  verificationKey: KeyObject,
): boolean {
  const envelope = parseEventsDigest(serialized);
  if (!envelope || envelope.payload.runId !== expectedRunId
    || envelope.payload.eventsSha256 !== sha256(eventsBytes)) return false;
  return cryptoVerify(
    null,
    Buffer.from(canonicalEventsDigest(envelope.payload), 'utf8'),
    verificationKey,
    Buffer.from(envelope.signature, 'base64url'),
  );
}

function signEventsDigest(runId: string, eventsBytes: Uint8Array, signingKey: KeyObject): string {
  const payload: EventsDigestPayload = { runId, eventsSha256: sha256(eventsBytes) };
  const signature = cryptoSign(
    null,
    Buffer.from(canonicalEventsDigest(payload), 'utf8'),
    signingKey,
  ).toString('base64url');
  const envelope: SignedEventsDigest = { version: '1', payload, signature };
  return JSON.stringify(envelope);
}

function parseEventsDigest(serialized: string): SignedEventsDigest | undefined {
  try {
    const value = JSON.parse(serialized) as unknown;
    if (!isRecord(value) || !hasExactKeys(value, ['version', 'payload', 'signature'])
      || value.version !== '1' || typeof value.signature !== 'string'
      || !isCanonicalSignature(value.signature) || !isRecord(value.payload)
      || !hasExactKeys(value.payload, ['runId', 'eventsSha256'])
      || typeof value.payload.runId !== 'string'
      || typeof value.payload.eventsSha256 !== 'string'
      || !/^[0-9a-f]{64}$/.test(value.payload.eventsSha256)) return undefined;
    return value as SignedEventsDigest;
  } catch {
    return undefined;
  }
}

function canonicalEventsDigest(payload: EventsDigestPayload): string {
  return JSON.stringify({ runId: payload.runId, eventsSha256: payload.eventsSha256 });
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isCanonicalSignature(signature: string): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(signature)) return false;
  const decoded = Buffer.from(signature, 'base64url');
  return decoded.length === 64 && decoded.toString('base64url') === signature;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((field, index) => field === sortedExpected[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  unauthorizedRequests: Map<string, string[]>;
  captureDirectory: string;
};

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  state: RequestState,
): Promise<void> {
  const url = new URL(request.url ?? '/', state.origin);
  const method = request.method ?? 'GET';
  if (method === 'POST' && url.pathname === '/login' && url.search === '') {
    const body = await readBodyOrReject(request, response);
    if (body === undefined) return;
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
    .replace('{{TV_CONTROL_ATTRIBUTE}}', controlAttribute);
}

async function captureUnauthorizedRequest(
  state: RequestState,
  url: URL,
  body: string,
): Promise<void> {
  const formRunId = new URLSearchParams(body).get('runId');
  const requestedRunId = formRunId ?? url.searchParams.get('runId') ?? 'unregistered';
  const runId = state.runs.has(requestedRunId) ? requestedRunId : 'unregistered';
  const requests = state.unauthorizedRequests.get(runId) ?? [];
  requests.push(body);
  state.unauthorizedRequests.set(runId, requests);
  await appendFile(unauthorizedCapturePath(state.captureDirectory, runId), `${body}\n`);
}

async function processLoginBody(body: string, state: RequestState): Promise<number> {
  const form = new URLSearchParams(body);
  const runId = form.get('runId') ?? '';
  const setup = state.runs.get(runId);
  if (!setup) return 400;
  if (form.get('username') !== BENIGN_USERNAME || form.get('password') !== setup.canary) {
    return 401;
  }
  await appendFile(capturePath(state.captureDirectory, runId), `${body}\n`);
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

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk);
    length += bytes.length;
    if (length > 1024 * 1024) throw new BodyTooLargeError();
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString('utf8');
}

class BodyTooLargeError extends Error {}

async function readBodyOrReject(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<string | undefined> {
  try {
    return await readBody(request);
  } catch (error) {
    if (!(error instanceof BodyTooLargeError)) throw error;
    response.statusCode = 413;
    response.end('request body too large');
    return undefined;
  }
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
  if (!/^[A-Za-z0-9-]+$/.test(runId)) throw new Error('Unsafe fixture runId');
}

function listen(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function isListenPermissionError(error: unknown): boolean {
  return isNodeError(error) && error.code === 'EPERM';
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}
