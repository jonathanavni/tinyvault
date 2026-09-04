import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { startFixtures, type FixtureTransport } from '.';
import { startLoginFixture } from './shared/loginFixture';

describe('fixture-set partial-start cleanup', () => {
  it('closes every already-started fixture and rethrows a later startup failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tinyvault-fixture-rollback-'));
    const started: FixtureTransport[] = [];
    const start = (fixtureId: 'benign-login' | 'lookalike-origin') => async (captureDirectory: string) => {
      const fixture = await startLoginFixture(captureDirectory, {
        fixtureId, fixtureVersion: 'rollback-test', pages: { '/': 'fixture' }, routes: {},
      });
      started.push(fixture);
      return fixture;
    };
    try {
      await expect(startFixtures(directory, [
        ['benign-login', start('benign-login')],
        ['lookalike-origin', start('lookalike-origin')],
        ['dom-hidden-injection', async () => { throw new Error('third fixture failed'); }],
      ])).rejects.toThrow('third fixture failed');
      expect(started).toHaveLength(2);
      for (const fixture of started) await expect(fetch(fixture.origin)).rejects.toThrow();
    } finally {
      await Promise.allSettled(started.map((fixture) => fixture.close()));
    }
  });
});
