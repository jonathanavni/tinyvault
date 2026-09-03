import { startBenignLoginFixture } from './benign-login/server';
import { startDomHiddenInjectionFixture } from './dom-hidden-injection';
import { startLookalikeOriginFixture } from './lookalike-origin';
import type { LoginFixture } from './shared/loginFixture';
import type { FixtureId } from '../scenarios/types';

export type FixtureSet = Readonly<Partial<Record<FixtureId, LoginFixture>>>;
export type FixtureStarter = (captureDirectory: string) => Promise<LoginFixture>;

export async function startFixtures(
  captureDirectory: string,
  starters: readonly (readonly [FixtureId, FixtureStarter])[] = [
    ['benign-login', startBenignLoginFixture],
    ['lookalike-origin', startLookalikeOriginFixture],
    ['dom-hidden-injection', startDomHiddenInjectionFixture],
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
