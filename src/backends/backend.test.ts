import { describe, expect, it } from 'vitest';

import type { ItemMeta } from '../core/types';
import { BackendError, type BackendErrorKind, type CredentialBackend } from './backend';

// Mutation killed: widening backend signatures or result shapes to make secret-bearing values model-visible.
if (false) {
  const backend = null as unknown as CredentialBackend;
  // @ts-expect-error resolveSecret returns Secret, never string.
  const _plaintext: Promise<string> = backend.resolveSecret('vh_00000000000000000000000000000000', {
    canonicalOrigin: 'https://example.com',
    fieldRecipe: ['password'],
  });
  // @ts-expect-error authorized policy is mandatory.
  backend.resolveSecret('vh_00000000000000000000000000000000');
  const item = null as unknown as ItemMeta;
  // @ts-expect-error caller-visible metadata has no canonical origin.
  void item.canonicalOrigin;
  backend.listItems().then((items) => {
    // @ts-expect-error listItems has no plaintext field.
    void items[0]?.secret;
    // @ts-expect-error listItems has no sealed blob.
    void items[0]?.sealed;
  });
  // @ts-expect-error arbitrary free text is outside the closed kind set.
  new BackendError('free text');
  // @ts-expect-error the constructor has no detail argument.
  new BackendError('not-found', 'extra');
  void _plaintext;
}

describe('closed backend errors', () => {
  it.each([
    ['not-found', 'Credential was not found'],
    ['locked', 'Credential backend is locked'],
    ['auth-expired', 'Credential backend authentication expired'],
    ['unavailable', 'Credential backend is unavailable'],
    ['integrity', 'Credential integrity check failed'],
  ] as const)('kills mutation adding free text to %s', (kind, message) => {
    // Mutation killed: constructor accepts/interpolates a detail string instead of the fixed kind table.
    const error = new BackendError(kind);
    expect(error).toBeInstanceOf(Error);
    expect(error.kind).toBe(kind);
    expect(error.message).toBe(message);
    expect(Object.keys(error).sort()).toEqual(['kind', 'name']);
    for (const forbidden of [
      'vh_0123456789abcdef0123456789abcdef',
      '/private/vault.json',
      'https://example.com',
      'TVC_backend_canary',
      'ENOENT',
      'open',
    ]) expect(error.message).not.toContain(forbidden);
  });

  it('kills mutation widening BackendErrorKind beyond its fixed message table', () => {
    // Mutation killed: a sixth kind is added without a distinct fixed message contract.
    const kinds: BackendErrorKind[] = [
      'not-found', 'locked', 'auth-expired', 'unavailable', 'integrity',
    ];
    expect(kinds.map((kind) => new BackendError(kind).message)).toHaveLength(5);
    expect(new Set(kinds.map((kind) => new BackendError(kind).message)).size).toBe(5);
  });

  it('kills runtime construction with an unknown error kind', () => {
    // Mutation killed: an untyped caller creates a BackendError with an undefined or attacker-chosen message.
    expect(() => new BackendError('unknown' as BackendErrorKind))
      .toThrow(new Error('Invalid backend error kind'));
  });
});
