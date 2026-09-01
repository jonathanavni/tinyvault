import { randomUUID } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';
import { open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { validateBareOrigin } from '../core/originGuard';
import type { FieldRole, ItemMeta, Origin } from '../core/types';
import { encodeAdditionalData, type LocalVaultRecord } from './localFileFormat';
import {
  defaultSealingPrimitives,
  LOCAL_HANDLE_BYTES,
  LOCAL_KEY_BYTES,
  LOCAL_NONCE_BYTES,
  type SealingPrimitives,
} from './localFileSodium';

type Awaitable<T> = T | Promise<T>;

export type LocalVaultEntry = Readonly<{
  label: string;
  kind: 'password';
  account?: string;
  canonicalOrigin: string;
  fieldRecipe: readonly FieldRole[];
  secret: string;
}>;

export interface AtomicFileHandle {
  writeFile(data: Uint8Array): Awaitable<void>;
  sync(): Awaitable<void>;
  close(): Awaitable<void>;
}

export interface LocalFileWriterFs {
  readFile(filePath: string): Awaitable<Uint8Array>;
  writeFile(
    filePath: string,
    data: Uint8Array,
    options: Readonly<{ flag: 'wx'; mode: number }>,
  ): Awaitable<void>;
  open(filePath: string, flags: 'wx', mode: number): Awaitable<AtomicFileHandle>;
  rename(oldPath: string, newPath: string): Awaitable<void>;
  unlink(filePath: string): Awaitable<void>;
}

export type LocalFileWriterOptions = Readonly<{
  primitives?: SealingPrimitives;
  fs?: LocalFileWriterFs;
}>;

const defaultWriterFs: LocalFileWriterFs = Object.freeze({
  readFile,
  writeFile,
  open: async (filePath: string, flags: 'wx', mode: number): Promise<FileHandle> =>
    open(filePath, flags, mode),
  rename,
  unlink,
});

const FIELD_ROLES = new Set<FieldRole>(['username', 'password', 'totp']);
const INVALID_ENTRY_MESSAGE = 'Invalid local vault entry';
const INVALID_KEY_MESSAGE = 'Invalid local vault key';
const INVALID_RANDOM_MESSAGE = 'Invalid random output';

export async function generateLocalVaultKey(
  keyPath: string,
  { primitives = defaultSealingPrimitives, fs = defaultWriterFs }: LocalFileWriterOptions = {},
): Promise<void> {
  let key: Uint8Array | undefined;
  try {
    key = await primitives.randomKey();
    if (key.length !== LOCAL_KEY_BYTES) throw new Error(INVALID_RANDOM_MESSAGE);
    try {
      await fs.writeFile(keyPath, key, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (isAlreadyExistsError(error)) throw new Error('Key file already exists');
      throw error;
    }
  } finally {
    if (key !== undefined) await primitives.memzero(key);
  }
}

export async function writeLocalVault(
  vaultPath: string,
  keyPath: string,
  entries: readonly LocalVaultEntry[],
  { primitives = defaultSealingPrimitives, fs = defaultWriterFs }: LocalFileWriterOptions = {},
): Promise<readonly ItemMeta[]> {
  const validatedEntries = entries.map(validateEntry);

  let key: Uint8Array | undefined;
  try {
    key = await fs.readFile(keyPath);
    if (key.length !== LOCAL_KEY_BYTES) throw new Error(INVALID_KEY_MESSAGE);

    const records: LocalVaultRecord[] = [];
    const metadata: ItemMeta[] = [];
    const handles = new Set<string>();

    for (const entry of validatedEntries) {
      const handleBytes = await primitives.randomHandle();
      if (handleBytes.length !== LOCAL_HANDLE_BYTES) throw new Error(INVALID_RANDOM_MESSAGE);
      const handle = `vh_${Buffer.from(handleBytes).toString('hex')}`;
      if (handles.has(handle)) throw new Error(INVALID_RANDOM_MESSAGE);
      handles.add(handle);

      const nonce = await primitives.randomNonce();
      if (nonce.length !== LOCAL_NONCE_BYTES) throw new Error(INVALID_RANDOM_MESSAGE);

      let plaintext: Uint8Array | undefined;
      try {
        plaintext = new TextEncoder().encode(entry.secret);
        const policy = Object.freeze({
          canonicalOrigin: entry.canonicalOrigin,
          fieldRecipe: entry.fieldRecipe,
        });
        const ciphertext = await primitives.seal(
          plaintext,
          encodeAdditionalData(handle, policy),
          nonce,
          key,
        );
        const record = Object.freeze({
          handle,
          label: entry.label,
          kind: 'password' as const,
          ...(entry.account === undefined ? {} : { account: entry.account }),
          canonicalOrigin: entry.canonicalOrigin,
          fieldRecipe: entry.fieldRecipe,
          sealed: Object.freeze({
            nonce: Buffer.from(nonce).toString('base64'),
            ciphertext: Buffer.from(ciphertext).toString('base64'),
          }),
        });
        records.push(record);
        metadata.push(Object.freeze({
          handle,
          label: entry.label,
          kind: 'password',
          ...(entry.account === undefined ? {} : { account: entry.account }),
          available: true,
        }));
      } finally {
        if (plaintext !== undefined) await primitives.memzero(plaintext);
      }
    }

    const bytes = new TextEncoder().encode(JSON.stringify({ version: 1, records }));
    await replaceAtomically(vaultPath, bytes, fs);
    return Object.freeze(metadata);
  } finally {
    if (key !== undefined) await primitives.memzero(key);
  }
}

function validateEntry(input: LocalVaultEntry): Readonly<{
  label: string;
  kind: 'password';
  account?: string;
  canonicalOrigin: Origin;
  fieldRecipe: readonly FieldRole[];
  secret: string;
}> {
  if (input === null
    || typeof input !== 'object'
    || typeof input.label !== 'string'
    || input.kind !== 'password'
    || (Object.hasOwn(input, 'account') && typeof input.account !== 'string')
    || typeof input.canonicalOrigin !== 'string'
    || !Array.isArray(input.fieldRecipe)
    || input.fieldRecipe.length === 0
    || !input.fieldRecipe.every((role): role is FieldRole =>
      typeof role === 'string' && FIELD_ROLES.has(role as FieldRole))
    || new Set(input.fieldRecipe).size !== input.fieldRecipe.length
    || typeof input.secret !== 'string') throw new Error(INVALID_ENTRY_MESSAGE);

  let canonicalOrigin: Origin;
  try {
    canonicalOrigin = validateBareOrigin(input.canonicalOrigin);
  } catch {
    throw new Error(INVALID_ENTRY_MESSAGE);
  }
  return Object.freeze({
    label: input.label,
    kind: 'password',
    ...(input.account === undefined ? {} : { account: input.account }),
    canonicalOrigin,
    fieldRecipe: Object.freeze([...input.fieldRecipe]),
    secret: input.secret,
  });
}

async function replaceAtomically(
  vaultPath: string,
  bytes: Uint8Array,
  fs: LocalFileWriterFs,
): Promise<void> {
  const temporaryPath = path.join(
    path.dirname(vaultPath),
    `.${path.basename(vaultPath)}.${randomUUID()}.tmp`,
  );
  let handle: AtomicFileHandle | undefined;
  let closed = false;
  try {
    handle = await fs.open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    closed = true;
    await fs.rename(temporaryPath, vaultPath);
  } catch (error) {
    if (handle !== undefined && !closed) {
      try {
        await handle.close();
      } catch {
        // Cleanup continues so a close failure cannot leave the temp pathname behind.
      }
    }
    try {
      await fs.unlink(temporaryPath);
    } catch {
      // Preserve the original failure; cleanup errors are not more informative to the caller.
    }
    throw error;
  }
}

function isAlreadyExistsError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'EEXIST';
}
