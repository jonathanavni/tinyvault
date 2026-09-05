import type { ControlConfig } from './control';
import type { FixtureTransport } from '../../fixtures/transport';
import { startBenignLoginFixture } from '../../fixtures/benign-login/server';
import { startDomHiddenInjectionFixture } from '../../fixtures/dom-hidden-injection';
import { startLookalikeOriginFixture } from '../../fixtures/lookalike-origin';
import type { FixtureListenOptions } from '../../fixtures/shared/bindServer';
import { EPOCH_PATTERN, FIXTURE_IDS, type FixtureId } from '../protocol';
import { containerTopology as topology } from './topology';

export function containerConfig(env: NodeJS.ProcessEnv) {
  const fixtureId = env.TV_FIXTURE_ID as FixtureId;
  if (!FIXTURE_IDS.includes(fixtureId) || !EPOCH_PATTERN.test(env.TV_EVAL_EPOCH ?? '')) {
    throw new Error('fixture-config');
  }
  const ports = topology.services[fixtureId];
  const binding = (index: number, publicOrigin: string | undefined): FixtureListenOptions => {
    const port = ports[index];
    if (publicOrigin !== `http://${port.address}:${port.host}`) throw new Error('fixture-config');
    return { host: '0.0.0.0', port: port.container, publicOrigin, onListenPermissionError: 'fail' };
  };
  return { fixtureId, epoch: env.TV_EVAL_EPOCH!, options: {
    ...binding(0, env.TV_PUBLIC_ORIGIN),
    page: fixtureId === 'dom-hidden-injection'
      ? (typeof TV_HIDDEN_PAGE === 'undefined' ? undefined : TV_HIDDEN_PAGE)
      : (typeof TV_BENIGN_PAGE === 'undefined' ? undefined : TV_BENIGN_PAGE),
    ...(fixtureId === 'lookalike-origin' ? { lookalike: binding(1, env.TV_LOOKALIKE_PUBLIC_ORIGIN) } : {}),
  } };
}
export function startContainerFixture(config: ReturnType<typeof containerConfig>, directory: string) {
  const starters = { 'benign-login': startBenignLoginFixture, 'lookalike-origin': startLookalikeOriginFixture,
    'dom-hidden-injection': startDomHiddenInjectionFixture };
  return starters[config.fixtureId](directory, config.options);
}

export function controlConfigForFixture(config: ReturnType<typeof containerConfig>, fixture: FixtureTransport,
  hostname: string, diagnostics: ControlConfig['diagnostics']): ControlConfig {
  return { fixtureId: config.fixtureId, epoch: config.epoch, hostname, diagnostics,
    keyPairProvider: () => ({ publicKey: fixture.verificationPublicKey }) };
}
