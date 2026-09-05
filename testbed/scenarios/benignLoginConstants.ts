import { createHash } from 'node:crypto';

export const BENIGN_FIXTURE_ID = 'benign-login';
export const BENIGN_FIXTURE_VERSION = '2';
export const BENIGN_USERNAME = 'fixture-user';

export function controlTokenFor(runId: string, nonce: string): string {
  return createHash('sha256')
    .update(`tinyvault-control:${runId}:${nonce}`, 'utf8')
    .digest('hex')
    .slice(0, 32);
}

