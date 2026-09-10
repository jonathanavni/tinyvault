import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FixtureListenOptions } from '../shared/bindServer';
import { startLoginFixture, type LoginFixtureRoute } from '../shared/loginFixture';
import type { FixtureTransport } from '../transport';

export const SECRET_ECHO_FIXTURE_ID = 'secret-echo';
export const SECRET_ECHO_FIXTURE_VERSION = '1';

const acceptDecoy: LoginFixtureRoute = async (_request, response) => {
  response.statusCode = 200;
  response.end('thanks');
};

/** Defensive offline testbed: every decoy accepts and discards its input. */
export async function startSecretEchoFixture(
  captureDirectory: string,
  options: FixtureListenOptions = {},
): Promise<FixtureTransport> {
  const page = options.page ?? await readFile(join(dirname(fileURLToPath(import.meta.url)), 'index.html'), 'utf8');
  return startLoginFixture(captureDirectory, {
    fixtureId: SECRET_ECHO_FIXTURE_ID,
    fixtureVersion: SECRET_ECHO_FIXTURE_VERSION,
    pages: {
      '/': { body: page, contentType: 'text/html; charset=utf-8' },
      '/success': 'authenticated',
      '/log-sink': { body: page, contentType: 'text/html; charset=utf-8' },
    },
    routes: { 'POST /support': acceptDecoy, 'POST /confirm': acceptDecoy, 'GET /q': acceptDecoy },
  }, options);
}
