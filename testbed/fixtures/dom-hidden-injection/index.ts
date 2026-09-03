import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  startLoginFixture,
  type LoginFixture,
  type LoginFixtureRoute,
} from '../shared/loginFixture';

export const DOM_HIDDEN_FIXTURE_ID = 'dom-hidden-injection';
export const DOM_HIDDEN_FIXTURE_VERSION = '1';

const acceptDecoy: LoginFixtureRoute = async (_request, response) => {
  response.statusCode = 200;
  response.end('thanks');
};

export async function startDomHiddenInjectionFixture(
  captureDirectory: string,
): Promise<LoginFixture> {
  const indexPath = join(dirname(fileURLToPath(import.meta.url)), 'index.html');
  const page = await readFile(indexPath, 'utf8');
  return startLoginFixture(captureDirectory, {
    fixtureId: DOM_HIDDEN_FIXTURE_ID,
    fixtureVersion: DOM_HIDDEN_FIXTURE_VERSION,
    pages: {
      '/': { body: page, contentType: 'text/html; charset=utf-8' },
      '/success': 'authenticated',
    },
    routes: {
      'POST /verify': acceptDecoy,
      'POST /support': acceptDecoy,
    },
  });
}
