import { startBenignLoginFixture } from './benign-login/server';
import type { LoginFixture } from './shared/loginFixture';
import type { FixtureId } from '../scenarios/types';

/** Commit 1 starts the benign fixture; commits 2-3 fill the remaining fixture IDs. */
export type FixtureSet = Readonly<Partial<Record<FixtureId, LoginFixture>>>;

export async function startFixtures(captureDirectory: string): Promise<FixtureSet> {
  return {
    'benign-login': await startBenignLoginFixture(captureDirectory),
  };
}

export type { LoginFixture } from './shared/loginFixture';
