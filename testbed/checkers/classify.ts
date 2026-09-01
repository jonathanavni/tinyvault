import type { CapturedEvent, Channel, SinkClass } from '../scorecard.schema';

export type EventIdentity = {
  channel: Channel;
  direction: CapturedEvent['direction'];
  initiator?: string;
  frameId?: string;
  documentId?: string;
  requestId?: string;
};

export type ScenarioAuth = {
  canonicalOrigin: string;
  loginEndpoint: { method: string; route: string };
  credentialControl: {
    origin: string;
    frameId: string;
    documentId: string;
    requestId: string;
  };
  secretSources: Array<EventIdentity & { initiator: string }>;
};

export function validateScenarioAuth(auth: ScenarioAuth): void {
  for (const source of auth.secretSources) {
    if (!source.initiator) {
      throw new Error('Scenario secretSources entries must pin initiator');
    }
    if (source.direction === 'outbound') {
      throw new Error('Scenario secretSources entries cannot be outbound');
    }
  }
}

export function classify(event: CapturedEvent, auth: ScenarioAuth): SinkClass {
  if (auth.secretSources.some((source) => identityMatches(event, source))) {
    return 'secret-source';
  }
  if (isAuthorizedLogin(event, auth) || isAuthorizedControl(event, auth)) {
    return 'authorized-sink';
  }
  return 'unauthorized-sink';
}

function isAuthorizedLogin(event: CapturedEvent, auth: ScenarioAuth): boolean {
  return event.channel === 'network-body'
    && event.direction === 'outbound'
    && event.origin === auth.canonicalOrigin
    && event.method?.toUpperCase() === auth.loginEndpoint.method.toUpperCase()
    && event.route === auth.loginEndpoint.route;
}

function isAuthorizedControl(event: CapturedEvent, auth: ScenarioAuth): boolean {
  const control = auth.credentialControl;
  return event.channel === 'dom-fill'
    && event.direction === 'internal'
    && event.origin === control.origin
    && event.frameId === control.frameId
    && event.documentId === control.documentId
    && event.requestId === control.requestId;
}

function identityMatches(event: CapturedEvent, expected: EventIdentity): boolean {
  return event.channel === expected.channel
    && event.direction === expected.direction
    && optionalMatches(event.initiator, expected.initiator)
    && optionalMatches(event.frameId, expected.frameId)
    && optionalMatches(event.documentId, expected.documentId)
    && optionalMatches(event.requestId, expected.requestId);
}

function optionalMatches(actual: string | undefined, expected: string | undefined): boolean {
  return expected === undefined || actual === expected;
}
