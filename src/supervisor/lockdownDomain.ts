import {
  InvalidControlIdentityError,
  type ControlIdentity,
  type ControlIdentityCoordinates,
  type ControlIdentityMintAuthority,
  type LockdownLifecycle,
  type LockdownRegistry,
} from '../core/lockdown';

export type { LockdownLifecycle } from '../core/lockdown';

type SessionState = { generation: number };
type DomainState = {
  sessions: Map<string, SessionState>;
  closedSessions: Set<string>;
  locked: IdentityRecord[];
};
type IdentityRecord = ControlIdentityCoordinates & {
  domain: DomainState;
  generation: number;
};

// Coordinates and runtime provenance are held here, never on the caller-reachable capability token.
const identityRecords = new WeakMap<object, IdentityRecord>();

/** Supervisor-only composition root. M4 assigns lifecycle to the browser/session owner. */
export function createLockdownDomain(): Readonly<{
  registry: LockdownRegistry;
  authority: ControlIdentityMintAuthority;
  lifecycle: LockdownLifecycle;
}> {
  const domain: DomainState = {
    sessions: new Map(),
    closedSessions: new Set(),
    locked: [],
  };

  const attest = (identity: ControlIdentity): IdentityRecord => {
    if (typeof identity !== 'object' || identity === null) return invalidIdentity();
    const record = identityRecords.get(identity);
    if (record === undefined || record.domain !== domain) return invalidIdentity();
    const session = domain.sessions.get(record.sessionId);
    if (session === undefined || session.generation !== record.generation) return invalidIdentity();
    return record;
  };

  const registry: LockdownRegistry = Object.freeze({
    lock(identity: ControlIdentity): void {
      const record = attest(identity);
      if (!domain.locked.some((candidate) => equalRecords(candidate, record))) {
        domain.locked.push(record);
      }
    },
    isLocked(identity: ControlIdentity): boolean {
      const record = attest(identity);
      return domain.locked.some((candidate) => equalRecords(candidate, record));
    },
    isSameIdentity(left: ControlIdentity, right: ControlIdentity): boolean {
      return equalRecords(attest(left), attest(right));
    },
  });

  const authority: ControlIdentityMintAuthority = Object.freeze({
    mint(coordinates: ControlIdentityCoordinates): ControlIdentity {
      if (domain.closedSessions.has(coordinates.sessionId)) return invalidIdentity();
      const session = domain.sessions.get(coordinates.sessionId) ?? { generation: 0 };
      domain.sessions.set(coordinates.sessionId, session);
      const token = Object.freeze({}) as ControlIdentity;
      identityRecords.set(token, { ...coordinates, domain, generation: session.generation });
      return token;
    },
  });

  const lifecycle: LockdownLifecycle = Object.freeze({
    clearOnTrustedTopLevelNavigation(sessionId: string): void {
      if (domain.closedSessions.has(sessionId)) return;
      const session = domain.sessions.get(sessionId) ?? { generation: 0 };
      session.generation += 1;
      domain.sessions.set(sessionId, session);
      domain.locked = domain.locked.filter((record) => record.sessionId !== sessionId);
    },
    clearOnSessionClose(sessionId: string): void {
      domain.sessions.delete(sessionId);
      domain.closedSessions.add(sessionId);
      domain.locked = domain.locked.filter((record) => record.sessionId !== sessionId);
    },
  });

  return Object.freeze({ registry, authority, lifecycle });
}

function equalRecords(left: IdentityRecord, right: IdentityRecord): boolean {
  return left.domain === right.domain
    && left.generation === right.generation
    && left.sessionId === right.sessionId
    && left.documentId === right.documentId
    && left.frameId === right.frameId
    && left.elementId === right.elementId;
}

function invalidIdentity(): never {
  throw new InvalidControlIdentityError();
}
