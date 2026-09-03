import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  readBodyOrReject,
  startLoginFixture,
  type LoginFixture,
  type LoginFixtureRoute,
} from '../shared/loginFixture';

export const LOOKALIKE_FIXTURE_ID = 'lookalike-origin';
export const LOOKALIKE_FIXTURE_VERSION = '1';

export type LookalikeOriginFixture = LoginFixture & Readonly<{
  lookalikeOrigin: string;
  lookalikeRequests(): readonly string[];
}>;

export async function startLookalikeOriginFixture(
  captureDirectory: string,
): Promise<LookalikeOriginFixture> {
  await mkdir(captureDirectory, { recursive: true });
  const lookalikeCapturePath = join(captureDirectory, 'lookalike.requests');
  await writeFile(lookalikeCapturePath, '');
  const requests: string[] = [];
  let canonicalOrigin = '';
  const lookalikeServer = createServer((request, response) => {
    void handleLookalikeRequest(
      request,
      response,
      () => canonicalOrigin,
      requests,
      lookalikeCapturePath,
    ).catch((error: unknown) => {
      if (!response.headersSent) response.statusCode = 500;
      response.end('fixture error');
      console.error(error);
    });
  });
  const lookalike = await bindLookalikeServer(lookalikeServer);
  const indexPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'benign-login',
    'index.html',
  );
  const page = await readFile(indexPath, 'utf8');
  const redirect: LoginFixtureRoute = async (_request, response, { url }) => {
    const target = new URL('/', lookalike.origin);
    target.search = url.search;
    response.statusCode = 302;
    response.setHeader('location', target.toString());
    response.end();
  };

  let canonical: LoginFixture | undefined;
  try {
    canonical = await startLoginFixture(captureDirectory, {
      fixtureId: LOOKALIKE_FIXTURE_ID,
      fixtureVersion: LOOKALIKE_FIXTURE_VERSION,
      // In-process tests use `/` as the rendered login page. Over HTTP the route below wins.
      pages: {
        '/': { body: page, contentType: 'text/html; charset=utf-8' },
        '/login': { body: page, contentType: 'text/html; charset=utf-8' },
        '/success': 'authenticated',
      },
      routes: { 'GET /': redirect },
    });
    canonicalOrigin = canonical.origin;
    if ((canonical.transport === 'http') !== (lookalike.transport === 'http')) {
      throw new Error('Lookalike fixture origins did not use the same transport');
    }
  } catch (error) {
    await Promise.allSettled([
      Promise.resolve().then(() => canonical?.close()),
      Promise.resolve().then(() => closeServer(lookalikeServer)),
    ]);
    throw error;
  }
  if (canonical === undefined) throw new Error('Canonical fixture did not start');

  return {
    ...canonical,
    origin: canonical.origin,
    lookalikeOrigin: lookalike.origin,
    lookalikeRequests: () => Object.freeze([...requests]),
    close: async () => {
      const settled = await Promise.allSettled([
        Promise.resolve().then(() => canonical.close()),
        Promise.resolve().then(() => closeServer(lookalikeServer)),
      ]);
      const rejected = settled.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      if (rejected !== undefined) throw rejected.reason;
    },
  };
}

async function handleLookalikeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  getCanonicalOrigin: () => string,
  requests: string[],
  capturePath: string,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://lookalike.invalid');
  const method = request.method ?? 'GET';
  if (method === 'GET' && url.pathname === '/') {
    // M4 Y2-4: identity tokens are page-readable and never authorize an origin. The
    // lookalike deliberately copies the canonical rendering, including those tokens.
    const canonical = new URL('/login', getCanonicalOrigin());
    canonical.search = url.search;
    const rendered = await fetch(canonical);
    response.statusCode = rendered.status;
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(await rendered.text());
    return;
  }
  if (method === 'POST' && url.pathname === '/login') {
    const body = await readBodyOrReject(request, response);
    if (body === undefined) return;
    requests.push(body);
    await appendFile(capturePath, `${body}\n`);
    response.statusCode = 200;
    response.end('thanks');
    return;
  }
  response.statusCode = 404;
  response.end('not found');
}

type BoundLookalike = Readonly<{
  origin: string;
  transport: LoginFixture['transport'];
}>;

async function bindLookalikeServer(server: Server): Promise<BoundLookalike> {
  try {
    const origin = await listen(server);
    return { origin, transport: 'http' };
  } catch (error) {
    if (!isNodeError(error) || error.code !== 'EPERM') throw error;
    return { origin: 'http://127.0.0.1:1', transport: 'in-process' };
  }
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Lookalike fixture did not bind a TCP port'));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  server.closeAllConnections();
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}
