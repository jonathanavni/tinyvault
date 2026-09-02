import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it, vi } from 'vitest';

import type { CredentialPolicy } from '../core/types';
import { BackendError } from './backend';
import { createLocalFileBackend, type LocalFileBackendFs } from './localFile';
import { encodeAdditionalData } from './localFileFormat';
import { defaultSealingPrimitives, type SealingPrimitives } from './localFileSodium';
import { generateLocalVaultKey, writeLocalVault, type LocalVaultEntry } from './localFileWriter';

const roots: string[] = [];
export const canary = 'TVC_backend_canary_8F31';
export const validHandle = 'vh_0123456789abcdef0123456789abcdef';
export const validPolicy: CredentialPolicy = Object.freeze({
  canonicalOrigin: 'https://example.com',
  fieldRecipe: Object.freeze(['password']),
}) as CredentialPolicy;

export async function cleanupFixtures(): Promise<void> {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
}

export async function temporaryRoot(prefix = 'tinyvault-backend-'): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

export async function fixture(entries: readonly LocalVaultEntry[] = [vaultEntry(canary)]): Promise<{
  root: string;
  vaultPath: string;
  keyPath: string;
  handles: string[];
}> {
  const root = await temporaryRoot();
  const vaultPath = path.join(root, 'vault.json');
  const keyPath = path.join(root, 'vault.key');
  await generateLocalVaultKey(keyPath);
  const items = await writeLocalVault(vaultPath, keyPath, entries);
  return { root, vaultPath, keyPath, handles: items.map((item) => item.handle) };
}

export function vaultEntry(secret: string, origin = 'https://example.com'): LocalVaultEntry {
  return {
    label: 'Example account',
    kind: 'password',
    account: 'person@example.com',
    canonicalOrigin: origin,
    fieldRecipe: ['username', 'password'],
    secret,
  };
}

export function validVaultBytes(): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({
    version: 1,
    records: [{
      handle: validHandle,
      label: 'Fixture',
      kind: 'password',
      canonicalOrigin: validPolicy.canonicalOrigin,
      fieldRecipe: validPolicy.fieldRecipe,
      sealed: {
        nonce: Buffer.alloc(24, 1).toString('base64'),
        ciphertext: Buffer.alloc(16, 2).toString('base64'),
      },
    }],
  }));
}

export function memoryBackendFs(vault: Uint8Array, key: Uint8Array): LocalFileBackendFs {
  return {
    readFile: async (filePath) => filePath === '/vault' ? vault : key,
    stat: async (filePath) => ({
      size: filePath === '/vault' ? vault.length : key.length,
      isFile: () => true,
    }),
  };
}

export function statefulProbeFs(
  vaultState: 'missing' | 'valid' | 'invalid',
  keyState: 'missing' | 'valid' | 'short',
): LocalFileBackendFs {
  const vault = vaultState === 'invalid' ? new TextEncoder().encode('{') : validVaultBytes();
  const key = new Uint8Array(keyState === 'short' ? 31 : 32);
  return {
    readFile: async (filePath) => {
      if (filePath === '/vault') {
        if (vaultState === 'missing') throw Object.assign(new Error('missing vault'), { code: 'ENOENT' });
        return vault;
      }
      if (keyState === 'missing') throw Object.assign(new Error('missing key'), { code: 'ENOENT' });
      return key;
    },
    stat: async (filePath) => {
      if (filePath === '/vault' && vaultState === 'missing') {
        throw Object.assign(new Error('missing vault'), { code: 'ENOENT' });
      }
      if (filePath === '/key' && keyState === 'missing') {
        throw Object.assign(new Error('missing key'), { code: 'ENOENT' });
      }
      return {
        size: filePath === '/vault' ? vault.length : key.length,
        isFile: () => true,
      };
    },
  };
}

export function backendWithBuffers(
  key: Uint8Array,
  open: SealingPrimitives['open'],
  overrides: Partial<SealingPrimitives> = {},
): { backend: ReturnType<typeof createLocalFileBackend>; handle: string; policy: CredentialPolicy } {
  const primitives = wrapPrimitives({ open, ...overrides });
  return {
    backend: createLocalFileBackend({
      vaultPath: '/vault',
      keyPath: '/key',
      fs: memoryBackendFs(validVaultBytes(), key),
      primitives,
    }),
    handle: validHandle,
    policy: validPolicy,
  };
}

export function wrapPrimitives(overrides: Partial<SealingPrimitives>): SealingPrimitives {
  return {
    ...defaultSealingPrimitives,
    memzero: (buffer) => { buffer.fill(0); },
    ...overrides,
  };
}

export async function editVault(vaultPath: string, mutate: (file: any) => void): Promise<void> {
  const file = JSON.parse(await readFile(vaultPath, 'utf8'));
  mutate(file);
  await writeFile(vaultPath, JSON.stringify(file));
}

export async function reseal(
  vaultPath: string,
  keyPath: string,
  handle: string,
  secret: string,
  replacementPolicy?: CredentialPolicy,
): Promise<void> {
  const file = JSON.parse(await readFile(vaultPath, 'utf8'));
  const record = file.records.find((candidate: any) => candidate.handle === handle);
  if (replacementPolicy !== undefined) {
    record.canonicalOrigin = replacementPolicy.canonicalOrigin;
    record.fieldRecipe = replacementPolicy.fieldRecipe;
  }
  const policy = {
    canonicalOrigin: record.canonicalOrigin,
    fieldRecipe: record.fieldRecipe,
  };
  const key = await readFile(keyPath);
  const plaintext = new TextEncoder().encode(secret);
  try {
    const nonce = await defaultSealingPrimitives.randomNonce();
    const ciphertext = await defaultSealingPrimitives.seal(
      plaintext,
      encodeAdditionalData(handle, policy),
      nonce,
      key,
    );
    record.sealed = {
      nonce: Buffer.from(nonce).toString('base64'),
      ciphertext: Buffer.from(ciphertext).toString('base64'),
    };
    await writeFile(vaultPath, JSON.stringify(file));
  } finally {
    await defaultSealingPrimitives.memzero(plaintext);
    await defaultSealingPrimitives.memzero(key);
  }
}

export function expectZero(buffer: Uint8Array): void {
  expect([...buffer]).toEqual(new Array(buffer.length).fill(0));
}

export async function expectKind(
  promise: Promise<unknown>,
  kind: BackendError['kind'],
): Promise<void> {
  try {
    await promise;
    throw new Error(`expected BackendError ${kind}`);
  } catch (error) {
    expect(error).toBeInstanceOf(BackendError);
    expect((error as BackendError).kind).toBe(kind);
  }
}

export async function expectContained(
  promise: Promise<unknown>,
  kind: BackendError['kind'],
  forbidden: string,
): Promise<void> {
  try {
    await promise;
    throw new Error(`expected BackendError ${kind}`);
  } catch (error) {
    expect(error).toBeInstanceOf(BackendError);
    expect((error as BackendError).kind).toBe(kind);
    expect((error as BackendError).message).not.toContain(forbidden);
    expect((error as BackendError).stack).not.toContain(forbidden);
  }
}

export async function caughtKind(promise: Promise<unknown>): Promise<BackendError['kind']> {
  try {
    await promise;
    throw new Error('expected BackendError');
  } catch (error) {
    if (!(error instanceof BackendError)) throw error;
    return error.kind;
  }
}

it('keeps the shared fixture handle valid', () => {
  // Mutation killed: the shared helper exports a malformed handle that weakens all dependent tests.
  expect(validHandle).toMatch(/^vh_[0-9a-f]{32}$/u);
});

it('kills rejoining either split local-file suite beyond 400 lines', () => {
  // Mutation killed: policy tests or shared helpers are folded back into an over-limit primary test file.
  for (const relative of ['./localFile.test.ts', './localFile.policy.test.ts']) {
    const source = readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
    const lines = source.length === 0 ? 0 : source.split('\n').length - Number(source.endsWith('\n'));
    expect(lines, relative).toBeLessThanOrEqual(400);
  }
});
