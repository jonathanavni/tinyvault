declare const controlIdentityBrand: unique symbol;

export type ControlIdentity = Readonly<{ [controlIdentityBrand]: true }>;

export type ControlIdentityCoordinates = Readonly<{
  sessionId: string;
  documentId: string;
  frameId: string;
  elementId: string;
}>;

export type ControlIdentityMintAuthority = Readonly<{
  mint(coordinates: ControlIdentityCoordinates): ControlIdentity;
}>;

export const INVALID_CONTROL_IDENTITY_MESSAGE = 'Invalid or stale control identity';

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

// Runtime provenance is held here, not on the branded token. Tokens expose no identity coordinates.
const identityRecords = new WeakMap<object, IdentityRecord>();

export class LockdownRegistry {
  readonly #domain: DomainState;

  constructor(domain: DomainState, token: typeof registryConstructorToken) {
    if (token !== registryConstructorToken) throw new Error(INVALID_CONTROL_IDENTITY_MESSAGE);
    this.#domain = domain;
  }

  lock(identity: ControlIdentity): void {
    const record = this.#attest(identity);
    if (!this.#domain.locked.some((candidate) => equalRecords(candidate, record))) {
      this.#domain.locked.push(record);
    }
  }

  isLocked(identity: ControlIdentity): boolean {
    const record = this.#attest(identity);
    return this.#domain.locked.some((candidate) => equalRecords(candidate, record));
  }

  isSameIdentity(left: ControlIdentity, right: ControlIdentity): boolean {
    return equalRecords(this.#attest(left), this.#attest(right));
  }

  /** The only navigation clear: it invalidates every prior token for the session by generation. */
  clearOnTrustedTopLevelNavigation(sessionId: string): void {
    if (this.#domain.closedSessions.has(sessionId)) return;
    const session = this.#domain.sessions.get(sessionId) ?? { generation: 0 };
    session.generation += 1;
    this.#domain.sessions.set(sessionId, session);
    this.#domain.locked = this.#domain.locked.filter((record) => record.sessionId !== sessionId);
  }

  /** The only terminal clear: the session cannot mint or accept identities afterward. */
  clearOnSessionClose(sessionId: string): void {
    this.#domain.sessions.delete(sessionId);
    this.#domain.closedSessions.add(sessionId);
    this.#domain.locked = this.#domain.locked.filter((record) => record.sessionId !== sessionId);
  }

  #attest(identity: ControlIdentity): IdentityRecord {
    if (typeof identity !== 'object' || identity === null) return invalidIdentity();
    const record = identityRecords.get(identity);
    if (record === undefined || record.domain !== this.#domain) return invalidIdentity();
    const session = this.#domain.sessions.get(record.sessionId);
    if (session === undefined || session.generation !== record.generation) return invalidIdentity();
    return record;
  }
}

const registryConstructorToken = Object.freeze({});

/**
 * Creates a trusted domain as separate registry and mint capabilities. Branding is only friction;
 * the module-private WeakMap is the runtime control. Arbitrary hostile trusted-host code is out of scope.
 */
export function createLockdownDomain(): Readonly<{
  registry: LockdownRegistry;
  authority: ControlIdentityMintAuthority;
}> {
  const domain: DomainState = {
    sessions: new Map(),
    closedSessions: new Set(),
    locked: [],
  };
  const registry = new LockdownRegistry(domain, registryConstructorToken);
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
  return Object.freeze({ registry, authority });
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
  throw new Error(INVALID_CONTROL_IDENTITY_MESSAGE);
}
