/**
 * Local-file provisioning helpers.
 *
 * A non-EEXIST failure during exclusive key creation can leave a partial key file behind. Operators
 * must inspect or remove that path before retrying; the writer never overwrites an existing key file.
 * Secrets containing CR or LF are refused because HTML value sanitisation would otherwise strip those
 * code units silently before form submission.
 */
import { randomUUID } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';
import { open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { MAX_SECRET_CODE_UNITS } from '../core/browserPort';
import type { FieldRole, ItemMeta, Origin } from '../core/types';
import { validateBareOrigin } from '../core/originGuard';
import {
  encodeAdditionalData,
  isValidFieldRecipe,
  type LocalVaultRecord,
} from './localFileFormat';
import {
  defaultSealingPrimitives,
  LOCAL_HANDLE_BYTES,
  LOCAL_KEY_BYTES,
  LOCAL_NONCE_BYTES,
  type Awaitable,
  type SealingPrimitives,
} from './localFileSodium';

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
    const { records, metadata } = await sealEntries(validatedEntries, key, primitives);
    const bytes = new TextEncoder().encode(JSON.stringify({ version: 1, records }));
    await replaceAtomically(vaultPath, bytes, fs);
    return Object.freeze(metadata);
  } finally {
    if (key !== undefined) await primitives.memzero(key);
  }
}

type ValidatedEntry = Readonly<{
  label: string;
  kind: 'password';
  account?: string;
  canonicalOrigin: Origin;
  fieldRecipe: readonly FieldRole[];
  secret: string;
}>;

async function sealEntries(
  entries: readonly ValidatedEntry[],
  key: Uint8Array,
  primitives: SealingPrimitives,
): Promise<{ records: LocalVaultRecord[]; metadata: ItemMeta[] }> {
  const records: LocalVaultRecord[] = [];
  const metadata: ItemMeta[] = [];
  const handles = new Set<string>();
  for (const entry of entries) {
    const sealed = await sealEntry(entry, key, handles, primitives);
    records.push(sealed.record);
    metadata.push(sealed.metadata);
  }
  return { records, metadata };
}

async function sealEntry(
  entry: ValidatedEntry,
  key: Uint8Array,
  handles: Set<string>,
  primitives: SealingPrimitives,
): Promise<{ record: LocalVaultRecord; metadata: ItemMeta }> {
  const handleBytes = await primitives.randomHandle();
  if (handleBytes.length !== LOCAL_HANDLE_BYTES) throw new Error(INVALID_RANDOM_MESSAGE);
  const handle: `vh_${string}` = `vh_${Buffer.from(handleBytes).toString('hex')}`;
  if (handles.has(handle)) throw new Error(INVALID_RANDOM_MESSAGE);
  handles.add(handle);
  const nonce = await primitives.randomNonce();
  if (nonce.length !== LOCAL_NONCE_BYTES) throw new Error(INVALID_RANDOM_MESSAGE);

  let plaintext: Uint8Array | undefined;
  try {
    plaintext = new TextEncoder().encode(entry.secret);
    const ciphertext = await primitives.seal(
      plaintext,
      encodeAdditionalData(handle, entry),
      nonce,
      key,
    );
    return buildSealedEntry(entry, handle, nonce, ciphertext);
  } finally {
    if (plaintext !== undefined) await primitives.memzero(plaintext);
  }
}

function buildSealedEntry(
  entry: ValidatedEntry,
  handle: `vh_${string}`,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
): { record: LocalVaultRecord; metadata: ItemMeta } {
  const account = entry.account === undefined ? {} : { account: entry.account };
  return {
    record: Object.freeze({
      handle,
      label: entry.label,
      kind: 'password',
      ...account,
      canonicalOrigin: entry.canonicalOrigin,
      fieldRecipe: entry.fieldRecipe,
      sealed: Object.freeze({
        nonce: Buffer.from(nonce).toString('base64'),
        ciphertext: Buffer.from(ciphertext).toString('base64'),
      }),
    }),
    metadata: Object.freeze({
      handle,
      label: entry.label,
      kind: 'password',
      ...account,
      available: true,
    }),
  };
}

function validateEntry(input: LocalVaultEntry): ValidatedEntry {
  if (input === null
    || typeof input !== 'object'
    || typeof input.label !== 'string'
    || input.kind !== 'password'
    || (input.account !== undefined && typeof input.account !== 'string')
    || typeof input.canonicalOrigin !== 'string'
    || !isValidFieldRecipe(input.fieldRecipe)
    || typeof input.secret !== 'string'
    || /[\n\r]/u.test(input.secret)
    || input.secret.length > MAX_SECRET_CODE_UNITS) throw new Error(INVALID_ENTRY_MESSAGE);

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
