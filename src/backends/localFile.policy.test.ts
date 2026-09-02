import { readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';

import type { CredentialPolicy } from '../core/types';
import { createLocalFileBackend, type LocalFileBackendFs } from './localFile';
import { defaultSealingPrimitives, type SealingPrimitives } from './localFileSodium';
import {
  backendWithBuffers,
  cleanupFixtures,
  editVault,
  expectKind,
  expectZero,
  fixture,
  memoryBackendFs,
  reseal,
  validHandle,
  validPolicy,
  validVaultBytes,
  vaultEntry,
  wrapPrimitives,
} from './localFile.helpers.test';

afterEach(cleanupFixtures);

describe('policy binding and error ordering', () => {
  it('kills open-before-compare and stale-authorized-policy release after a legitimate re-point', async () => {
    // Mutation killed: rewritten policy+secret is opened before checking the exact authorized policy.
    const { vaultPath, keyPath, handles } = await fixture([vaultEntry('policy-A')]);
    let opens = 0;
    const backend = createLocalFileBackend({
      vaultPath,
      keyPath,
      primitives: wrapPrimitives({
        open: async (...args) => { opens += 1; return defaultSealingPrimitives.open(...args); },
      }),
    });
    const authorized = await backend.resolvePolicy(handles[0]!);
    await reseal(vaultPath, keyPath, handles[0]!, 'policy-B', {
      canonicalOrigin: 'https://other.example',
      fieldRecipe: ['password'],
    });
    await expectKind(backend.resolveSecret(handles[0]!, authorized), 'integrity');
    expect(opens).toBe(0);
  });

  it.each(['origin', 'recipe'] as const)(
    'kills missing pre-open compare and missing AD binding after metadata-only %s edit',
    async (edit) => {
      // Mutation killed: metadata edit is accepted under old policy or ciphertext opens under edited policy.
      const { vaultPath, keyPath, handles } = await fixture([vaultEntry('bound-secret')]);
      await editVault(vaultPath, (file) => {
        if (edit === 'origin') file.records[0].canonicalOrigin = 'https://other.example';
        else file.records[0].fieldRecipe = ['password'];
      });
      let opens = 0;
      const backend = createLocalFileBackend({
        vaultPath,
        keyPath,
        primitives: wrapPrimitives({
          open: async (...args) => { opens += 1; return defaultSealingPrimitives.open(...args); },
        }),
      });
      const oldPolicy: CredentialPolicy = {
        canonicalOrigin: 'https://example.com',
        fieldRecipe: ['username', 'password'],
      };
      const editedPolicy = await backend.resolvePolicy(handles[0]!);
      await expectKind(backend.resolveSecret(handles[0]!, oldPolicy), 'integrity');
      expect(opens).toBe(0);
      await expectKind(backend.resolveSecret(handles[0]!, editedPolicy), 'integrity');
      expect(opens).toBe(1);
    },
  );

  it('kills sealed-blob swapping between handles', async () => {
    // Mutation killed: AEAD additional data omits the handle and allows cross-record ciphertext swapping.
    const { vaultPath, keyPath, handles } = await fixture([
      vaultEntry('first-secret'),
      { ...vaultEntry('second-secret'), label: 'Second' },
    ]);
    await editVault(vaultPath, (file) => {
      [file.records[0].sealed, file.records[1].sealed]
        = [file.records[1].sealed, file.records[0].sealed];
    });
    let opens = 0;
    const backend = createLocalFileBackend({
      vaultPath,
      keyPath,
      primitives: wrapPrimitives({
        open: async (...args) => { opens += 1; return defaultSealingPrimitives.open(...args); },
      }),
    });
    const policy = await backend.resolvePolicy(handles[0]!);
    await expectKind(backend.resolveSecret(handles[0]!, policy), 'integrity');
    expect(opens).toBe(1);
  });

  it('kills wrong-key acceptance', async () => {
    // Mutation killed: wrong-key AEAD failure is mapped as locked/success instead of integrity.
    const { vaultPath, keyPath, handles } = await fixture();
    const backend = createLocalFileBackend({ vaultPath, keyPath });
    const policy = await backend.resolvePolicy(handles[0]!);
    await writeFile(keyPath, Buffer.alloc(32, 99));
    await expectKind(backend.resolveSecret(handles[0]!, policy), 'integrity');
  });

  it.each(['truncate', 'bitflip'] as const)('kills %s ciphertext acceptance', async (mutation) => {
    // Mutation killed: corrupt-ciphertext AEAD failure escapes or is mapped as success instead of integrity.
    const { vaultPath, keyPath, handles } = await fixture();
    const backend = createLocalFileBackend({ vaultPath, keyPath });
    const policy = await backend.resolvePolicy(handles[0]!);
    await editVault(vaultPath, (file) => {
      const bytes = Buffer.from(file.records[0].sealed.ciphertext, 'base64');
      const changed = mutation === 'truncate' ? bytes.subarray(0, bytes.length - 1) : Buffer.from(bytes);
      if (mutation === 'bitflip') changed[0] ^= 1;
      file.records[0].sealed.ciphertext = changed.toString('base64');
    });
    await expectKind(backend.resolveSecret(handles[0]!, policy), 'integrity');
  });

  it('kills key lookup before handle and policy checks', async () => {
    // Mutation killed: missing key changes unknown-handle/mismatched-policy errors and reads key too early.
    const { vaultPath, keyPath, handles } = await fixture();
    await unlink(keyPath);
    const backend = createLocalFileBackend({ vaultPath, keyPath });
    await expectKind(backend.resolveSecret('vh_ffffffffffffffffffffffffffffffff', {
      canonicalOrigin: 'https://example.com', fieldRecipe: ['password'],
    }), 'not-found');
    await expectKind(backend.resolveSecret(handles[0]!, {
      canonicalOrigin: 'https://other.example', fieldRecipe: ['password'],
    }), 'integrity');
  });

  it('kills a second vault read between policy compare and open', async () => {
    // Mutation killed: compare and open operate on different parsed snapshots.
    const vault = validVaultBytes();
    const key = new Uint8Array(32).fill(1);
    let vaultReads = 0;
    const fs: LocalFileBackendFs = {
      readFile: async (filePath) => {
        if (filePath === '/vault') { vaultReads += 1; return vault; }
        return key;
      },
      stat: async () => ({ size: 32, isFile: () => true }),
    };
    const backend = createLocalFileBackend({
      vaultPath: '/vault', keyPath: '/key', fs,
      primitives: wrapPrimitives({ open: () => new TextEncoder().encode('once') }),
    });
    await backend.resolveSecret(validHandle, validPolicy);
    expect(vaultReads).toBe(1);
  });

  it('kills deriving AEAD additional data from a changing policy argument', async () => {
    // Mutation killed: encodeAdditionalData(handle, authorizedPolicy) re-reads a getter after comparison.
    let originReads = 0;
    const changingPolicy = {
      get canonicalOrigin(): string {
        originReads += 1;
        return originReads === 1 ? 'https://example.com' : 'https://argument.example';
      },
      fieldRecipe: ['password'],
    } as CredentialPolicy;
    let observed = '';
    const backend = createLocalFileBackend({
      vaultPath: '/vault',
      keyPath: '/key',
      fs: memoryBackendFs(validVaultBytes(), new Uint8Array(32).fill(1)),
      primitives: wrapPrimitives({
        open: (_ciphertext, additionalData) => {
          observed = new TextDecoder().decode(additionalData);
          return new TextEncoder().encode('argument-bound');
        },
      }),
    });
    expect((await backend.resolveSecret(validHandle, changingPolicy)).expose()).toBe('argument-bound');
    expect(observed).toBe(JSON.stringify([
      validHandle, 'https://example.com', ['password'],
    ]));
    expect(originReads).toBe(1);
  });

  it('kills metadata-only origin edits released through a changing policy getter', async () => {
    // Mutation killed: argument-derived AD lets getter read B for compare, then sealed origin A for open.
    const { vaultPath, keyPath, handles } = await fixture([vaultEntry('origin-getter-secret')]);
    await editVault(vaultPath, (file) => {
      file.records[0].canonicalOrigin = 'https://edited.example';
    });
    let originReads = 0;
    let opens = 0;
    let releases = 0;
    const policy = {
      get canonicalOrigin(): string {
        originReads += 1;
        return originReads === 1 ? 'https://edited.example' : 'https://example.com';
      },
      fieldRecipe: ['username', 'password'],
    } as CredentialPolicy;
    const backend = createLocalFileBackend({
      vaultPath,
      keyPath,
      primitives: wrapPrimitives({
        open: async (...args) => {
          opens += 1;
          return defaultSealingPrimitives.open(...args);
        },
      }),
    });
    const attempt = backend.resolveSecret(handles[0]!, policy).then((secret) => {
      releases += 1;
      return secret;
    });
    await expectKind(attempt, 'integrity');
    expect({ originReads, opens, releases }).toEqual({ originReads: 1, opens: 1, releases: 0 });
  });

  it('kills metadata-only recipe edits released through Proxy toJSON', async () => {
    // Mutation killed: argument-derived AD invokes Proxy.toJSON and authenticates the pre-edit recipe.
    const { vaultPath, keyPath, handles } = await fixture([vaultEntry('recipe-proxy-secret')]);
    await editVault(vaultPath, (file) => { file.records[0].fieldRecipe = ['password']; });
    let toJsonReads = 0;
    let releases = 0;
    const fieldRecipe = new Proxy(['password'] as CredentialPolicy['fieldRecipe'], {
      get(target, property, receiver) {
        if (property === 'toJSON') {
          toJsonReads += 1;
          return () => ['username', 'password'];
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const backend = createLocalFileBackend({ vaultPath, keyPath });
    const attempt = backend.resolveSecret(handles[0]!, {
      canonicalOrigin: 'https://example.com',
      fieldRecipe,
    }).then((secret) => {
      releases += 1;
      return secret;
    });
    await expectKind(attempt, 'integrity');
    expect({ toJsonReads, releases }).toEqual({ toJsonReads: 0, releases: 0 });
  });

  it('kills any second read of either authorized-policy field', async () => {
    // Mutation killed: comparison or decryption reads canonicalOrigin or fieldRecipe more than once.
    let originReads = 0;
    let recipeReads = 0;
    const policy = {
      get canonicalOrigin(): string { originReads += 1; return 'https://example.com'; },
      get fieldRecipe(): CredentialPolicy['fieldRecipe'] { recipeReads += 1; return ['password']; },
    } as CredentialPolicy;
    const backend = createLocalFileBackend({
      vaultPath: '/vault',
      keyPath: '/key',
      fs: memoryBackendFs(validVaultBytes(), new Uint8Array(32).fill(1)),
      primitives: wrapPrimitives({ open: () => new TextEncoder().encode('read-once') }),
    });
    expect((await backend.resolveSecret(validHandle, policy)).expose()).toBe('read-once');
    expect({ originReads, recipeReads }).toEqual({ originReads: 1, recipeReads: 1 });
  });

  it('kills recipe comparison through JSON/string helpers instead of length and indices', async () => {
    // Mutation killed: JSON.stringify(fieldRecipe) or iteration performs an extra Proxy property read.
    const policyReads: PropertyKey[] = [];
    const recipeReads: PropertyKey[] = [];
    const fieldRecipe = new Proxy(['username', 'password'] as CredentialPolicy['fieldRecipe'], {
      get(target, property, receiver) {
        recipeReads.push(property);
        return Reflect.get(target, property, receiver);
      },
    });
    const policy = new Proxy({
      canonicalOrigin: 'https://example.com',
      fieldRecipe,
    } as CredentialPolicy, {
      get(target, property, receiver) {
        policyReads.push(property);
        return Reflect.get(target, property, receiver);
      },
    });
    const { backend, handle } = await fixture([vaultEntry('proxy-read-shape')]).then(
      ({ vaultPath, keyPath, handles }) => ({
        backend: createLocalFileBackend({
          vaultPath,
          keyPath,
          primitives: wrapPrimitives({ open: () => new TextEncoder().encode('proxy-read-shape') }),
        }),
        handle: handles[0]!,
      }),
    );
    expect((await backend.resolveSecret(handle, policy)).expose()).toBe('proxy-read-shape');
    expect(policyReads).toEqual(['canonicalOrigin', 'fieldRecipe']);
    expect(recipeReads).toEqual(['length', '0', '1']);
  });
});

describe('cleanup ordering', () => {
  it('kills replacing real sodium.memzero with a no-op on successful resolution', async () => {
    // Mutation killed: defaultSealingPrimitives.memzero leaves either retained key or plaintext bytes nonzero.
    const { vaultPath, keyPath, handles } = await fixture([vaultEntry('real-memzero-success')]);
    let retainedKey: Uint8Array | undefined;
    let retainedPlaintext: Uint8Array | undefined;
    const fs: LocalFileBackendFs = {
      readFile: async (filePath) => {
        const bytes = await readFile(filePath);
        if (filePath === keyPath) retainedKey = bytes;
        return bytes;
      },
      stat,
    };
    const primitives: SealingPrimitives = {
      ...defaultSealingPrimitives,
      open: async (...args) => {
        retainedPlaintext = await defaultSealingPrimitives.open(...args);
        return retainedPlaintext;
      },
    };
    const backend = createLocalFileBackend({ vaultPath, keyPath, fs, primitives });
    const policy = await backend.resolvePolicy(handles[0]!);
    expect((await backend.resolveSecret(handles[0]!, policy)).expose()).toBe('real-memzero-success');
    expect(retainedKey).toBeDefined();
    expect(retainedPlaintext).toBeDefined();
    expectZero(retainedKey!);
    expectZero(retainedPlaintext!);
  });

  it('kills swapping the plaintext and key cleanup scopes when key memzero throws', async () => {
    // Mutation killed: key cleanup throws before the successfully wiped plaintext cleanup can run.
    const key = new Uint8Array(32).fill(7);
    const plaintext = new TextEncoder().encode('key-cleanup-throws');
    const cleanupOrder: string[] = [];
    const { backend, handle, policy } = backendWithBuffers(key, () => plaintext, {
      memzero: (buffer) => {
        buffer.fill(0);
        if (buffer === key) {
          cleanupOrder.push('key');
          throw new Error('key cleanup failure');
        }
        cleanupOrder.push('plaintext');
      },
    });
    await expectKind(backend.resolveSecret(handle, policy), 'unavailable');
    expect(cleanupOrder).toEqual(['plaintext', 'key']);
    expectZero(plaintext);
    expectZero(key);
  });
});
