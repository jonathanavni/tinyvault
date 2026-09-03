import { startBenignLoginFixture } from './benign-login/server';
import type { LoginFixture } from './shared/loginFixture';
import type { FixtureId } from '../scenarios/types';

/** Commit 1 starts the benign fixture; commits 2-3 fill the remaining fixture IDs. */
export type FixtureSet = Readonly<Partial<Record<FixtureId, LoginFixture>>>;
export type FixtureStarter = (captureDirectory: string) => Promise<LoginFixture>;

export async function startFixtures(
  captureDirectory: string,
  starters: readonly (readonly [FixtureId, FixtureStarter])[] = [
    ['benign-login', startBenignLoginFixture],
  ],
): Promise<FixtureSet> {
  const fixtures: Partial<Record<FixtureId, LoginFixture>> = {};
  try {
    for (const [fixtureId, start] of starters) fixtures[fixtureId] = await start(captureDirectory);
    return fixtures;
  } catch (error) {
    await Promise.allSettled(Object.values(fixtures).map((fixture) => fixture.close()));
    throw error;
  }
}

export type { LoginFixture } from './shared/loginFixture';
