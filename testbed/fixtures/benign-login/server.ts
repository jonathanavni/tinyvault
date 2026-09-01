import { generateKeyPairSync, type KeyObject } from 'node:crypto';
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
  capturePath(runId: string): string;
  close(): Promise<void>;
};

export async function startBenignLoginFixture(captureDirectory: string): Promise<BenignLoginFixture> {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const completionVerifier = new CompletionVerifier(publicKey);
  const runs = new Map<string, FixtureRunSetup>();
  const receipts = new Map<string, string>();
  const issued = new Set<string>();
  const indexPath = join(dirname(fileURLToPath(import.meta.url)), 'index.html');
  const page = await readFile(indexPath, 'utf8');
  await mkdir(captureDirectory, { recursive: true });

  let origin = '';
  const server = createServer((request, response) => {
    void handleRequest(request, response, {
      origin, page, signingKey: privateKey, runs, receipts, issued, captureDirectory,
    }).catch((error: unknown) => {
      response.statusCode = 500;
      response.end('fixture error');
      console.error(error);
    });
  });

  let transport: BenignLoginFixture['transport'] = 'http';
  try {
    await listen(server);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Fixture did not bind a TCP port');
    origin = `http://127.0.0.1:${address.port}`;
  } catch (error) {
    if (!isListenPermissionError(error)) throw error;
    transport = 'in-process';
    origin = 'http://127.0.0.1:0';
  }

  const state: RequestState = {
    origin, page, signingKey: privateKey, runs, receipts, issued, captureDirectory,
  };

  return {
    origin,
    transport,
    verificationPublicKey: publicKey,
    async registerRun(setup) {
      assertRunId(setup.runId);
      if (runs.has(setup.runId)) throw new Error(`Duplicate fixture run: ${setup.runId}`);
      runs.set(setup.runId, setup);
      await writeFile(capturePath(captureDirectory, setup.runId), '');
    },
    async getLoginPage(runId) {
      if (transport === 'in-process') return page;
      return fetch(`${origin}/?runId=${encodeURIComponent(runId)}`).then((response) => response.text());
    },
    async submitLogin(body) {
      if (transport === 'in-process') return processLoginBody(body, state);
      const response = await fetch(`${origin}/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        redirect: 'manual',
      });
      return response.status;
    },
    takeReceipt(runId) {
      const receipt = receipts.get(runId);
      receipts.delete(runId);
      return receipt;
    },
    verifyCompletion(receipt, expected, nowMs) {
      return completionVerifier.verify(receipt, expected, nowMs);
    },
    capturePath(runId) {
      assertRunId(runId);
      return capturePath(captureDirectory, runId);
    },
    close: () => closeServer(server),
  };
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
    response.end(state.page);
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
