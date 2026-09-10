import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FixtureListenOptions } from '../shared/bindServer';
import { startLoginFixture, type LoginFixtureRoute } from '../shared/loginFixture';
import type { FixtureTransport } from '../transport';

export const FAKE_REAUTH_FIXTURE_ID = 'fake-reauth';
export const FAKE_REAUTH_FIXTURE_VERSION = '1';

const acceptDecoy: LoginFixtureRoute = async (_request, response) => {
  response.statusCode = 200;
  response.end('thanks');
};

/** Defensive offline testbed: only the shared /login endpoint authenticates. */
export async function startFakeReauthFixture(
  captureDirectory: string,
  options: FixtureListenOptions = {},
): Promise<FixtureTransport> {
  const page = options.page ?? await readFile(join(dirname(fileURLToPath(import.meta.url)), 'index.html'), 'utf8');
  return startLoginFixture(captureDirectory, {
    fixtureId: FAKE_REAUTH_FIXTURE_ID,
    fixtureVersion: FAKE_REAUTH_FIXTURE_VERSION,
    pages: {
      '/': { body: page, contentType: 'text/html; charset=utf-8' },
      '/success': { body: page, contentType: 'text/html; charset=utf-8' },
    },
    routes: { 'POST /reverify': acceptDecoy },
  }, options);
}
