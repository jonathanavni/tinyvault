import { startSecretEchoFixture } from './secret-echo';
import { startFakeReauthFixture } from './fake-reauth';
import { startBenignLoginFixture } from './benign-login/server';
import { startDomHiddenInjectionFixture } from './dom-hidden-injection';
import { startLookalikeOriginFixture } from './lookalike-origin';
import type { FixtureTransport } from './transport';
import type { FixtureId } from '../scenarios/types';

export type FixtureSet = Readonly<Partial<Record<FixtureId, FixtureTransport>>>;
export type FixtureStarter = (captureDirectory: string) => Promise<FixtureTransport>;

export async function startFixtures(
  captureDirectory: string,
  starters: readonly (readonly [FixtureId, FixtureStarter])[] = [
    ['benign-login', startBenignLoginFixture],
    ['lookalike-origin', startLookalikeOriginFixture],
    ['dom-hidden-injection', startDomHiddenInjectionFixture],
    ['secret-echo', startSecretEchoFixture],
    ['fake-reauth', startFakeReauthFixture],
  ],
): Promise<FixtureSet> {
  const fixtures: Partial<Record<FixtureId, FixtureTransport>> = {};
  try {
    for (const [fixtureId, start] of starters) fixtures[fixtureId] = await start(captureDirectory);
    return fixtures;
  } catch (error) {
    await Promise.allSettled(Object.values(fixtures).map((fixture) => fixture.close()));
    throw error;
  }
}

export type { FixtureTransport } from './transport';
