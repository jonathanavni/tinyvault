import {
  createHash,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
  type KeyObject,
} from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  canaryCommitment,
  CompletionVerifier,
  signCompletionReceipt,
  type CompletionBinding,
  type CompletionVerification,
  type SignedCompletionReceipt,
} from '../../completion';
import type { CompletionReceipt } from '../../scorecard.schema';
import {
  BENIGN_FIXTURE_ID,
  BENIGN_FIXTURE_VERSION,
  BENIGN_USERNAME,
  controlTokenFor,
} from '../../scenarios/benignLogin';

export type FixtureRunSetup = {
  scenarioId: string;
  runId: string;
  nonce: string;
  canaryId: string;
  canary: string;
};

export type BenignLoginFixture = {
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
  close(): Promise<void>;
};

export async function startBenignLoginFixture(captureDirectory: string): Promise<BenignLoginFixture> {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const completionVerifier = new CompletionVerifier(publicKey);
  const indexPath = join(dirname(fileURLToPath(import.meta.url)), 'index.html');
  const page = await readFile(indexPath, 'utf8');
  await mkdir(captureDirectory, { recursive: true });
  const state: RequestState = {
    origin: '', page, signingKey: privateKey,
    runs: new Map(), receipts: new Map(), issued: new Set(), captureDirectory,
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
  transport: BenignLoginFixture['transport'],
): BenignLoginFixture {
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
): Promise<BenignLoginFixture['transport']> {
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
  await writeFile(capturePath(state.captureDirectory, setup.runId), '');
}

function getFixtureLoginPage(
  state: RequestState,
  transport: BenignLoginFixture['transport'],
  runId: string,
): Promise<string> {
  if (transport === 'in-process') {
    return Promise.resolve(renderLoginPage(state.page, state.runs.get(runId)));
  }
  return fetch(`${state.origin}/?runId=${encodeURIComponent(runId)}`)
    .then((response) => response.text());
}

async function submitFixtureLogin(
  state: RequestState,
  transport: BenignLoginFixture['transport'],
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
  if (!state.runs.has(runId)) throw new Error(`Cannot attest unknown fixture run: ${runId}`);
  return signEventsDigest(runId, eventsBytes, state.signingKey);
}

function checkedCapturePath(directory: string, runId: string): string {
  assertRunId(runId);
  return capturePath(directory, runId);
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
  page: string;
  signingKey: KeyObject;
  runs: Map<string, FixtureRunSetup>;
  receipts: Map<string, string>;
  issued: Set<string>;
  captureDirectory: string;
};

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  state: RequestState,
): Promise<void> {
  const url = new URL(request.url ?? '/', state.origin);
  if (request.method === 'GET' && url.pathname === '/') {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(renderLoginPage(state.page, state.runs.get(url.searchParams.get('runId') ?? '')));
    return;
  }
  if (request.method === 'GET' && url.pathname === '/success') {
    response.end('authenticated');
    return;
  }
  if (request.method !== 'POST' || url.pathname !== '/login') {
    response.statusCode = 404;
    response.end('not found');
    return;
  }

  const status = await processLoginBody(await readBody(request), state);
  response.statusCode = status;
  if (status === 303) response.setHeader('location', '/success');
  response.end(status === 303 ? undefined : 'login rejected');
}

function renderLoginPage(page: string, setup: FixtureRunSetup | undefined): string {
  const documentAttribute = setup === undefined ? '' : ` data-tv-document="${setup.runId}"`;
  const controlAttribute = setup === undefined
    ? ''
    : ` data-tv-control="${controlTokenFor(setup.runId, setup.nonce)}"`;
  return page
    .replace('{{TV_DOCUMENT_ATTRIBUTE}}', documentAttribute)
    .replace('{{TV_CONTROL_ATTRIBUTE}}', controlAttribute);
}

async function processLoginBody(body: string, state: RequestState): Promise<number> {
  const form = new URLSearchParams(body);
  const runId = form.get('runId') ?? '';
  const setup = state.runs.get(runId);
  if (!setup) return 400;
  await appendFile(capturePath(state.captureDirectory, runId), `${body}\n`);
  if (form.get('username') !== BENIGN_USERNAME || form.get('password') !== setup.canary) {
    return 401;
  }
  if (state.issued.has(runId)) return 409;

  const payload: CompletionReceipt = {
    fixtureId: BENIGN_FIXTURE_ID,
    fixtureVersion: BENIGN_FIXTURE_VERSION,
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
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function capturePath(directory: string, runId: string): string {
  return join(directory, `${runId}.requests`);
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
  return error instanceof Error && 'code' in error && error.code === 'EPERM';
}
