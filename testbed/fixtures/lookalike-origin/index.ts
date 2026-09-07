import { trackFixtureRequest, fixtureAllowsWrite, fixtureStorageFailure, shareFixtureIdentity } from '../shared/loginFixture';
import { bindServer, type FixtureListenOptions } from '../shared/bindServer';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  readBodyOrReject,
  startLoginFixture,
  type LoginFixtureRoute,
} from '../shared/loginFixture';
import type { FixtureReachability, FixtureTransport } from '../transport';

export const LOOKALIKE_FIXTURE_ID = 'lookalike-origin';
export const LOOKALIKE_FIXTURE_VERSION = '1';

export type LookalikeOriginFixture = FixtureTransport & Readonly<{
  lookalikeOrigin: string;
  lookalikeRequests(): Promise<readonly string[]>;
}>;

export async function startLookalikeOriginFixture(
  captureDirectory: string,
  options: FixtureListenOptions & { lookalike?: FixtureListenOptions } = {},
): Promise<LookalikeOriginFixture> {
  await mkdir(captureDirectory, { recursive: true });
  const lookalikeCapturePath = join(captureDirectory, 'lookalike.requests');
  await writeFile(lookalikeCapturePath, '');
  const requests: string[] = [];
  let canonicalOrigin = '';
  let canonical: FixtureTransport | undefined;
  const lookalikeServer = createServer((request, response) => {
    if (!canonical) { response.statusCode = 503; response.end('fixture error'); return; }
    const fixture = canonical;
    void trackFixtureRequest(fixture, (admission) => handleLookalikeRequest(
      request,
      response,
      () => canonicalOrigin,
      requests,
      lookalikeCapturePath,
      fixture, admission,
    )).catch((error: unknown) => {
      if (!response.headersSent) response.statusCode = 500;
      response.end('fixture error');
      if (options.onListenPermissionError === 'fail') process.stderr.write('fixture-error\n');
      else console.error(error);
    });
  });
  const lookalike = await bindLookalikeServer(lookalikeServer, options.lookalike ?? {});

  try {
    canonical = await startCanonicalFixture(captureDirectory, lookalike.origin, options);
    canonicalOrigin = options.port ? `http://127.0.0.1:${options.port}` : canonical.origin;
    if ((canonical.reachability === 'http') !== (lookalike.reachability === 'http')) {
      throw new Error('Lookalike fixture origins did not use the same reachability');
    }
  } catch (error) {
    await closeBoth(canonical, lookalikeServer).catch(() => undefined);
    throw error;
  }
  if (canonical === undefined) throw new Error('Canonical fixture did not start');

  const wrapper: LookalikeOriginFixture = {
    ...canonical,
    origin: canonical.origin,
    originRoles: Object.freeze({ C: canonical.origin, L: lookalike.origin }),
    lookalikeOrigin: lookalike.origin,
    lookalikeRequests: async () => Object.freeze([...requests]),
    close: () => closeBoth(canonical, lookalikeServer),
  };
  shareFixtureIdentity(canonical, wrapper);
  return wrapper;
}

async function closeBoth(canonical: FixtureTransport | undefined, server: Server): Promise<void> {
  // Enter shared close synchronously so the wrapper cannot admit work after close() returns its promise.
  const canonicalClose = canonical?.close();
  const settled = await Promise.allSettled([
    canonicalClose,
    Promise.resolve(canonicalClose).catch(() => undefined).then(() => closeServer(server)),
  ]);
  const rejected = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (rejected) throw rejected.reason;
}

async function startCanonicalFixture(captureDirectory: string, lookalikeOrigin: string,
  options: FixtureListenOptions): Promise<FixtureTransport> {
  const indexPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'benign-login',
    'index.html',
  );
  const page = options.page ?? await readFile(indexPath, 'utf8');
  const redirect: LoginFixtureRoute = async (_request, response, { url }) => {
    const target = new URL('/', lookalikeOrigin);
    target.search = url.search;
    response.statusCode = 302;
    response.setHeader('location', target.toString());
    response.end();
  };

  return startLoginFixture(captureDirectory, {
    fixtureId: LOOKALIKE_FIXTURE_ID,
    fixtureVersion: LOOKALIKE_FIXTURE_VERSION,
    // In-process tests use `/` as the rendered login page. Over HTTP the route below wins.
    pages: {
      '/': { body: page, contentType: 'text/html; charset=utf-8' },
      '/login': { body: page, contentType: 'text/html; charset=utf-8' },
      '/success': 'authenticated',
    },
    routes: { 'GET /': redirect },
  }, options);
}

async function handleLookalikeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  getCanonicalOrigin: () => string,
  requests: string[],
  capturePath: string,
  fixture: FixtureTransport, admission: number,
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
    if (!fixtureAllowsWrite(fixture, url, body, admission)) {
      response.statusCode = 409; response.end('login rejected'); return;
    }
    requests.push(body);
    try { await appendFile(capturePath, `${body}\n`); }
    catch { throw fixtureStorageFailure(fixture); }
    response.statusCode = 200;
    response.end('thanks');
    return;
  }
  response.statusCode = 404;
  response.end('not found');
}

type BoundLookalike = Readonly<{
  origin: string;
  reachability: FixtureReachability;
}>;

async function bindLookalikeServer(server: Server, options: FixtureListenOptions): Promise<BoundLookalike> {
  const reachability = await bindServer(server, options);
  const address = reachability === 'http' ? server.address() : null;
  if (reachability === 'http' && (!address || typeof address === 'string')) {
    throw new Error('Lookalike fixture did not bind a TCP port');
  }
  const origin = options.publicOrigin ?? (reachability === 'no-socket'
    ? 'http://127.0.0.1:1' : `http://127.0.0.1:${(address as { port: number }).port}`);
  return { origin, reachability };
}

function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  server.closeAllConnections();
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
