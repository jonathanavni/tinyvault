/**
 * Sealed local-file backend.
 *
 * Accepted tradeoffs: labels, account hints, origins, and field recipes are cleartext at rest; only secret
 * values are sealed. Restoring an older authentic vault file also restores its older authentic contents.
 * Metadata confidentiality and rollback protection are outside the host-disk threat model for this backend.
 */
import { readFile, stat } from 'node:fs/promises';
import type { Stats } from 'node:fs';

import { Secret } from '../core/redaction';
import type { CredentialPolicy, Handle, ItemMeta } from '../core/types';
import { BackendError, type BackendStatus, type CredentialBackend } from './backend';
import {
  decodeCanonicalBase64,
  encodeAdditionalData,
  isValidLocalHandle,
  parseLocalVaultBytes,
  policyFromRecord,
  type LocalVaultFile,
  type LocalVaultRecord,
} from './localFileFormat';
import {
  defaultSealingPrimitives,
  LOCAL_KEY_BYTES,
  type SealingPrimitives,
} from './localFileSodium';

type Awaitable<T> = T | Promise<T>;

export interface LocalFileBackendFs {
  readFile(filePath: string): Awaitable<Uint8Array>;
  stat(filePath: string): Awaitable<Pick<Stats, 'size' | 'isFile'>>;
}

export type LocalFileBackendOptions = Readonly<{
  vaultPath: string;
  keyPath: string;
  primitives?: SealingPrimitives;
  fs?: LocalFileBackendFs;
}>;

const defaultBackendFs: LocalFileBackendFs = Object.freeze({ readFile, stat });
const AVAILABLE = Object.freeze({ available: true }) satisfies BackendStatus;
const NOT_INSTALLED = Object.freeze({
  available: false,
  reason: 'not_installed',
}) satisfies BackendStatus;
const LOCKED = Object.freeze({ available: false, reason: 'locked' }) satisfies BackendStatus;
const ERROR = Object.freeze({ available: false, reason: 'error' }) satisfies BackendStatus;

export function createLocalFileBackend({
  vaultPath,
  keyPath,
  primitives = defaultSealingPrimitives,
  fs = defaultBackendFs,
}: LocalFileBackendOptions): CredentialBackend {
  async function readVault(): Promise<LocalVaultFile> {
    try {
      return parseLocalVaultBytes(await fs.readFile(vaultPath));
    } catch {
      throw new BackendError('unavailable');
    }
  }

  async function probeAvailability(): Promise<BackendStatus> {
    try {
      let vaultStat: Pick<Stats, 'size' | 'isFile'>;
      try {
        vaultStat = await fs.stat(vaultPath);
      } catch (error) {
        return isMissingError(error) ? NOT_INSTALLED : ERROR;
      }
      if (!vaultStat.isFile()) return ERROR;

      try {
        await readVault();
      } catch {
        return ERROR;
      }

      try {
        const keyStat = await fs.stat(keyPath);
        if (!keyStat.isFile() || keyStat.size !== LOCAL_KEY_BYTES) return LOCKED;
      } catch {
        return LOCKED;
      }
      return AVAILABLE;
    } catch {
      return ERROR;
    }
  }

  async function listItems(): Promise<readonly ItemMeta[]> {
    try {
      const vault = await readVault();
      return Object.freeze(vault.records.map((record) => Object.freeze({
        handle: record.handle,
        label: record.label,
        kind: record.kind,
        ...(record.account === undefined ? {} : { account: record.account }),
        available: true,
      })));
    } catch (error) {
      if (error instanceof BackendError) throw error;
      throw new BackendError('unavailable');
    }
  }

  async function resolvePolicy(handle: Handle): Promise<CredentialPolicy> {
    try {
      const vault = await readVault();
      return policyFromRecord(findRecord(vault, handle));
    } catch (error) {
      if (error instanceof BackendError) throw error;
      throw new BackendError('unavailable');
    }
  }

  async function resolveSecret(
    handle: Handle,
    authorizedPolicy: CredentialPolicy,
  ): Promise<Secret> {
    try {
      const vault = await readVault();
      const record = findRecord(vault, handle);
      if (!policiesEqual(record, authorizedPolicy)) throw new BackendError('integrity');

      let key: Uint8Array | undefined;
      try {
        try {
          key = await fs.readFile(keyPath);
        } catch {
          throw new BackendError('locked');
        }
        if (key.length !== LOCAL_KEY_BYTES) throw new BackendError('locked');

        let plaintext: Uint8Array | undefined;
        try {
          try {
            plaintext = await primitives.open(
              decodeCanonicalBase64(record.sealed.ciphertext),
              encodeAdditionalData(handle, authorizedPolicy),
              decodeCanonicalBase64(record.sealed.nonce),
              key,
            );
          } catch {
            throw new BackendError('integrity');
          }

          let decoded: string;
          try {
            decoded = new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
          } catch {
            throw new BackendError('unavailable');
          }
          return new Secret(decoded);
        } finally {
          if (plaintext !== undefined) await primitives.memzero(plaintext);
        }
      } finally {
        if (key !== undefined) await primitives.memzero(key);
      }
    } catch (error) {
      if (error instanceof BackendError) throw error;
      throw new BackendError('unavailable');
    }
  }

  return Object.freeze({
    probeAvailability,
    listItems,
    resolvePolicy,
    resolveSecret,
    // Local-file holds no auth-session material, so disposal is intentionally a no-op.
    async dispose(): Promise<void> {},
  });
}

function findRecord(vault: LocalVaultFile, handle: Handle): LocalVaultRecord {
  if (!isValidLocalHandle(handle)) throw new BackendError('not-found');
  const record = vault.records.find((candidate) => candidate.handle === handle);
  if (record === undefined) throw new BackendError('not-found');
  return record;
}

function policiesEqual(record: LocalVaultRecord, policy: CredentialPolicy): boolean {
  try {
    return record.canonicalOrigin === policy.canonicalOrigin
      && Array.isArray(policy.fieldRecipe)
      && record.fieldRecipe.length === policy.fieldRecipe.length
      && record.fieldRecipe.every((role, index) => role === policy.fieldRecipe[index]);
  } catch {
    return false;
  }
}

function isMissingError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'ENOENT';
}
