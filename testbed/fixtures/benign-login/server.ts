import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  startLoginFixture,
  type FixtureRunSetup,
  type LoginFixture,
} from '../shared/loginFixture';
import {
  BENIGN_FIXTURE_ID,
  BENIGN_FIXTURE_VERSION,
} from '../../scenarios/benignLogin';

export type BenignLoginFixture = LoginFixture;
export type { FixtureRunSetup };
export { verifyEventsDigest } from '../shared/loginFixture';

export async function startBenignLoginFixture(
  captureDirectory: string,
): Promise<BenignLoginFixture> {
  const indexPath = join(dirname(fileURLToPath(import.meta.url)), 'index.html');
  const page = await readFile(indexPath, 'utf8');
  return startLoginFixture(captureDirectory, {
    fixtureId: BENIGN_FIXTURE_ID,
    fixtureVersion: BENIGN_FIXTURE_VERSION,
    pages: {
      '/': { body: page, contentType: 'text/html; charset=utf-8' },
      '/success': 'authenticated',
    },
    routes: {},
  });
}
