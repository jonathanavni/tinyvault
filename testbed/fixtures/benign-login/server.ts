import type { FixtureListenOptions } from '../shared/bindServer';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startLoginFixture } from '../shared/loginFixture';
import type { FixtureRunSetup, FixtureTransport } from '../transport';
import {
  BENIGN_FIXTURE_ID,
  BENIGN_FIXTURE_VERSION,
} from '../../scenarios/benignLoginConstants';

export type BenignLoginFixture = FixtureTransport;
export type { FixtureRunSetup };
export { verifyEventsDigest } from '../shared/loginFixture';

export async function startBenignLoginFixture(
  captureDirectory: string,
  options: FixtureListenOptions = {},
): Promise<BenignLoginFixture> {
  const indexPath = join(dirname(fileURLToPath(import.meta.url)), 'index.html');
  const page = options.page ?? await readFile(indexPath, 'utf8');
  return startLoginFixture(captureDirectory, {
    fixtureId: BENIGN_FIXTURE_ID,
    fixtureVersion: BENIGN_FIXTURE_VERSION,
    pages: {
      '/': { body: page, contentType: 'text/html; charset=utf-8' },
      '/success': 'authenticated',
    },
    routes: {},
  }, options);
}
