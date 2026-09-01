import { describe, expect, it } from 'vitest';

import {
  INVALID_CONTROL_IDENTITY_MESSAGE,
  type ControlIdentity,
} from './lockdown';
import { createLockdownDomain } from '../supervisor/lockdownDomain';

const first = { sessionId: 'session-a', documentId: 'doc-1', frameId: 'top', elementId: 'password' };

describe('provenance-keyed lockdown registry', () => {
  it('catches mutation from attested identity to forgeable structural objects', () => {
    const { registry, authority } = createLockdownDomain();
    const real = authority.mint(first);
    const forgeries: unknown[] = [
      {},
      first,
      { ...first },
      structuredClone(real),
      JSON.parse(JSON.stringify(first)),
    ];
    for (const forgery of forgeries) {
      expect(() => registry.lock(forgery as ControlIdentity)).toThrow(INVALID_CONTROL_IDENTITY_MESSAGE);
      expect(() => registry.isLocked(forgery as unknown as ControlIdentity))
        .toThrow(INVALID_CONTROL_IDENTITY_MESSAGE);
    }
  });

  it('catches mutation that stores coordinates or secret-like content on capability tokens', () => {
    const { authority } = createLockdownDomain();
    const identity = authority.mint(first);
    expect(Reflect.ownKeys(identity)).toEqual([]);
    expect(JSON.stringify(identity)).toBe('{}');
    expect(JSON.stringify(identity)).not.toContain(first.elementId);
  });

  it('catches mutation of tuple equality, session isolation, or generation equality', () => {
    const { registry, authority } = createLockdownDomain();
    const sameA = authority.mint(first);
    const sameB = authority.mint({ ...first });
    const otherElement = authority.mint({ ...first, elementId: 'username' });
    const otherFrame = authority.mint({ ...first, frameId: 'child' });
    const otherDocument = authority.mint({ ...first, documentId: 'doc-2' });
    const otherSession = authority.mint({ ...first, sessionId: 'session-b' });

    expect(registry.isSameIdentity(sameA, sameB)).toBe(true);
    for (const different of [otherElement, otherFrame, otherDocument, otherSession]) {
      expect(registry.isSameIdentity(sameA, different)).toBe(false);
    }

    registry.lock(sameA);
    registry.lock(sameB);
    expect(registry.isLocked(sameB)).toBe(true);
    expect(registry.isLocked(otherElement)).toBe(false);
  });

  it('catches exact mutation deleting domain attestation with both domains at the same generation', () => {
    const domainA = createLockdownDomain();
    const domainB = createLockdownDomain();
    const crossDomain = domainA.authority.mint(first);
    domainB.authority.mint(first);
    expect(() => domainB.registry.lock(crossDomain)).toThrow(INVALID_CONTROL_IDENTITY_MESSAGE);
  });

  it('catches mutation that lets stale-navigation or closed-session tokens replay', () => {
    const domainA = createLockdownDomain();

    const stale = domainA.authority.mint(first);
    domainA.registry.lock(stale);
    domainA.lifecycle.clearOnTrustedTopLevelNavigation(first.sessionId);
    expect(() => domainA.registry.isLocked(stale)).toThrow(INVALID_CONTROL_IDENTITY_MESSAGE);
    const nextGeneration = domainA.authority.mint(first);
    expect(domainA.registry.isLocked(nextGeneration)).toBe(false);

    domainA.lifecycle.clearOnSessionClose(first.sessionId);
    domainA.lifecycle.clearOnSessionClose(first.sessionId);
    expect(() => domainA.registry.lock(nextGeneration)).toThrow(INVALID_CONTROL_IDENTITY_MESSAGE);
    expect(() => domainA.authority.mint(first)).toThrow(INVALID_CONTROL_IDENTITY_MESSAGE);
  });

  it('catches exact capability mutation adding any taint-clear operation to the registry surface', () => {
    const { registry, lifecycle } = createLockdownDomain();
    expect(Reflect.ownKeys(registry)).toEqual(['lock', 'isLocked', 'isSameIdentity']);
    expect(Reflect.ownKeys(lifecycle))
      .toEqual(['clearOnTrustedTopLevelNavigation', 'clearOnSessionClose']);
    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(lifecycle)).toBe(true);
  });

  it('catches exact navigation-clear mutation that wipes locks belonging to other sessions', () => {
    const { registry, authority, lifecycle } = createLockdownDomain();
    const sessionA = authority.mint(first);
    const sessionB = authority.mint({ ...first, sessionId: 'session-b' });
    registry.lock(sessionA);
    registry.lock(sessionB);

    lifecycle.clearOnTrustedTopLevelNavigation(first.sessionId);

    expect(() => registry.isLocked(sessionA)).toThrow(INVALID_CONTROL_IDENTITY_MESSAGE);
    expect(registry.isLocked(sessionB)).toBe(true);
  });
});
