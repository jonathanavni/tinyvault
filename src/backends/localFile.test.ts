import { inspect } from 'node:util';
import {
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Secret } from '../core/redaction';
import { secretTransforms } from '../shared/secretTransforms';
import type { CredentialPolicy } from '../core/types';
import { BackendError } from './backend';
import { createLocalFileBackend, type LocalFileBackendFs } from './localFile';
import { encodeAdditionalData } from './localFileFormat';
import { defaultSealingPrimitives, type SealingPrimitives } from './localFileSodium';
import { generateLocalVaultKey, writeLocalVault, type LocalVaultEntry } from './localFileWriter';

const roots: string[] = [];
const canary = 'TVC_backend_canary_8F31';

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(entries: readonly LocalVaultEntry[] = [vaultEntry(canary)]): Promise<{
  root: string;
  vaultPath: string;
  keyPath: string;
  handles: string[];
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tinyvault-backend-'));
  roots.push(root);
  const vaultPath = path.join(root, 'vault.json');
  const keyPath = path.join(root, 'vault.key');
  await generateLocalVaultKey(keyPath);
  const items = await writeLocalVault(vaultPath, keyPath, entries);
  return { root, vaultPath, keyPath, handles: items.map((item) => item.handle) };
}

function vaultEntry(secret: string, origin = 'https://example.com'): LocalVaultEntry {
  return {
    label: 'Example account',
    kind: 'password',
    account: 'person@example.com',
    canonicalOrigin: origin,
    fieldRecipe: ['username', 'password'],
    secret,
  };
}

describe('local-file metadata and policy boundary', () => {
  it('kills sealed/plaintext copying and secret-derived metadata smuggling', async () => {
    // Mutation killed: {...record}, secret length/hash, sealed bytes, or policy fields escape in ItemMeta.
    const root = await mkdtemp(path.join(os.tmpdir(), 'tinyvault-backend-meta-'));
    roots.push(root);
    const vaultPath = path.join(root, 'vault.json');
    const keyPath = path.join(root, 'vault.key');
    const fixedHandle = 'vh_2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a';
    await generateLocalVaultKey(keyPath);
    await writeLocalVault(vaultPath, keyPath, [vaultEntry(canary)], {
      primitives: wrapPrimitives({ randomHandle: () => new Uint8Array(16).fill(0x2a) }),
    });
    let opens = 0;
    const primitives = wrapPrimitives({
      open: async (...args) => {
        opens += 1;
        return defaultSealingPrimitives.open(...args);
      },
    });
    const backend = createLocalFileBackend({ vaultPath, keyPath, primitives });
    await backend.probeAvailability();
    const items = await backend.listItems();
    const policy = await backend.resolvePolicy(fixedHandle);
    expect(items).toEqual([{
      handle: 'vh_2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a',
      label: 'Example account',
      kind: 'password',
      account: 'person@example.com',
      available: true,
    }]);
    expect(Reflect.ownKeys(items[0]!)).toEqual(['handle', 'label', 'kind', 'account', 'available']);
    const visible = `${JSON.stringify({ items, policy })}\n${inspect({ items, policy }, {
      showHidden: true,
      depth: 10,
    })}`;
    for (const transform of secretTransforms(canary)) expect(visible).not.toContain(transform.value);
    expect(JSON.stringify(items)).not.toContain('canonicalOrigin');
    expect(JSON.stringify(items)).not.toContain('sealed');
    expect(opens).toBe(0);
  });

  it('kills shallow policy freeze and normalize-on-read mutation', async () => {
    // Mutation killed: policy or recipe remains mutable, or writer persists uppercase/default-port origin.
    const { vaultPath, keyPath, handles } = await fixture([
      vaultEntry(canary, 'HTTPS://EXAMPLE.com:443'),
    ]);
    const policy = await createLocalFileBackend({ vaultPath, keyPath }).resolvePolicy(handles[0]!);
    expect(policy).toEqual({
      canonicalOrigin: 'https://example.com',
      fieldRecipe: ['username', 'password'],
    });
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.fieldRecipe)).toBe(true);
    expect(() => policy.fieldRecipe.push('totp')).toThrow();
  });

  it.each([
    'https://example.com/path',
    'https://example.com/',
    'ftp://example.com',
    ' https://example.com',
    'https://EXAMPLE.com',
    'https://example.com:443',
    'https://0x7f000001',
    'https://\uff45xample.com',
  ])('kills trusting stored non-canonical origin %s', async (storedOrigin) => {
    // Mutation killed: resolvePolicy trusts stored cleartext without originGuard and normalization equality.
    const { vaultPath, keyPath, handles } = await fixture();
    await editVault(vaultPath, (file) => { file.records[0].canonicalOrigin = storedOrigin; });
    const backend = createLocalFileBackend({ vaultPath, keyPath });
    await expectKind(backend.resolvePolicy(handles[0]!), 'unavailable');
  });
});

describe('never-cache contract and cleanup', () => {
  it('kills record, file, and resolved-secret caches with real same-handle rotation', async () => {
    // Mutation killed: resolveSecret returns cached A after the same file record is authentically resealed to B.
    const { vaultPath, keyPath, handles } = await fixture([vaultEntry('rotation-A')]);
    const backend = createLocalFileBackend({ vaultPath, keyPath });
    const policy = await backend.resolvePolicy(handles[0]!);
    expect((await backend.resolveSecret(handles[0]!, policy)).expose()).toBe('rotation-A');
    await reseal(vaultPath, keyPath, handles[0]!, 'rotation-B');
    expect((await backend.resolveSecret(handles[0]!, policy)).expose()).toBe('rotation-B');
  });

  it('kills mtime/content/policy-identity caches using one unchanged file and one policy object', async () => {
    // Mutation killed: a cache keyed by file metadata/content or authorized-policy object skips the second open.
    const { vaultPath, keyPath, handles } = await fixture();
    let opens = 0;
    const primitives = wrapPrimitives({
      open: () => new TextEncoder().encode(opens++ === 0 ? 'first-open' : 'second-open'),
    });
    const backend = createLocalFileBackend({ vaultPath, keyPath, primitives });
    const policy = await backend.resolvePolicy(handles[0]!);
    expect((await backend.resolveSecret(handles[0]!, policy)).expose()).toBe('first-open');
    expect((await backend.resolveSecret(handles[0]!, policy)).expose()).toBe('second-open');
    expect(opens).toBe(2);
  });

  it('kills in-memory ghosts after record revocation', async () => {
    // Mutation killed: list/resolve use a cached record after the on-disk handle is removed.
    const { vaultPath, keyPath, handles } = await fixture();
    const backend = createLocalFileBackend({ vaultPath, keyPath });
    const policy = await backend.resolvePolicy(handles[0]!);
    await editVault(vaultPath, (file) => { file.records = []; });
    await expectKind(backend.resolveSecret(handles[0]!, policy), 'not-found');
    expect(await backend.listItems()).toEqual([]);
  });

  it('kills missing success-path cleanup for key and plaintext buffers', async () => {
    // Mutation killed: either owned byte buffer remains nonzero after a successful resolve.
    const key = new Uint8Array(32).fill(3);
    const plaintext = new TextEncoder().encode('cleanup-success');
    const { backend, handle, policy } = backendWithBuffers(key, () => plaintext);
    expect((await backend.resolveSecret(handle, policy)).expose()).toBe('cleanup-success');
    expectZero(key);
    expectZero(plaintext);
  });

  it('kills replacing real sodium.memzero with a no-op on successful resolution', async () => {
    // Mutation killed: defaultSealingPrimitives.memzero leaves either the fs-owned key or opened plaintext nonzero.
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

  it('kills a key finally that begins after open', async () => {
    // Mutation killed: open throws before the key buffer enters its cleanup scope.
    const key = new Uint8Array(32).fill(3);
    const { backend, handle, policy } = backendWithBuffers(key, () => {
      throw new Error('native sodium detail');
    });
    await expectKind(backend.resolveSecret(handle, policy), 'integrity');
    expectZero(key);
  });

  it('kills a key finally that begins after the length check', async () => {
    // Mutation killed: wrong-length key exits without wiping the exact buffer returned by fs.readFile.
    const key = new Uint8Array(31).fill(3);
    let opens = 0;
    const { backend, handle, policy } = backendWithBuffers(key, () => { opens += 1; return new Uint8Array(); });
    await expectKind(backend.resolveSecret(handle, policy), 'locked');
    expectZero(key);
    expect(opens).toBe(0);
  });

  it('kills a plaintext finally that begins after UTF-8 decoding', async () => {
    // Mutation killed: fatal TextDecoder failure leaves the plaintext bytes and/or key nonzero.
    const key = new Uint8Array(32).fill(3);
    const plaintext = new Uint8Array([0xff, 0xfe]);
    const { backend, handle, policy } = backendWithBuffers(key, () => plaintext);
    await expectKind(backend.resolveSecret(handle, policy), 'unavailable');
    expectZero(key);
    expectZero(plaintext);
  });

  it('kills cleanup nesting where a plaintext memzero failure skips key cleanup', async () => {
    // Mutation killed: sequential/non-nested cleanup lets the first cleanup throw before the key is wiped.
    const key = new Uint8Array(32).fill(3);
    const plaintext = new TextEncoder().encode('nested-cleanup');
    let cleanups = 0;
    const { backend, handle, policy } = backendWithBuffers(key, () => plaintext, {
      memzero: (buffer) => {
        cleanups += 1;
        buffer.fill(0);
        if (cleanups === 1) throw new Error('plaintext cleanup failure');
      },
    });
    await expectKind(backend.resolveSecret(handle, policy), 'unavailable');
    expectZero(key);
    expectZero(plaintext);
    expect(cleanups).toBe(2);
  });

  it.each([
    ['valid', 32, false],
    ['missing', 0, true],
    ['wrong-size', 31, false],
  ] as const)('kills metadata key-byte reads for %s key state', async (_name, keySize, missing) => {
    // Mutation killed: probe/resolvePolicy reads key bytes instead of using stat-only availability checks.
    const vault = validVaultBytes();
    const reads: string[] = [];
    const fs: LocalFileBackendFs = {
      readFile: async (filePath) => {
        reads.push(filePath);
        if (filePath === '/vault') return vault;
        throw new Error('key bytes must not be read');
      },
      stat: async (filePath) => {
        if (filePath === '/key' && missing) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
        return { size: filePath === '/key' ? keySize : vault.length, isFile: () => true };
      },
    };
    const backend = createLocalFileBackend({ vaultPath: '/vault', keyPath: '/key', fs });
    await backend.probeAvailability();
    await backend.resolvePolicy(validHandle);
    expect(reads).toEqual(['/vault', '/vault']);
  });

  it('kills cached key material across calls', async () => {
    // Mutation killed: deleting/replacing the key file has no effect because an old key is retained.
    const { root, vaultPath, keyPath, handles } = await fixture();
    const savedKey = await readFile(keyPath);
    const backend = createLocalFileBackend({ vaultPath, keyPath });
    const policy = await backend.resolvePolicy(handles[0]!);
    expect((await backend.resolveSecret(handles[0]!, policy)).expose()).toBe(canary);
    const removedPath = path.join(root, 'removed.key');
    await rename(keyPath, removedPath);
    await expectKind(backend.resolveSecret(handles[0]!, policy), 'locked');
    await writeFile(keyPath, savedKey, { mode: 0o600 });
    expect((await backend.resolveSecret(handles[0]!, policy)).expose()).toBe(canary);
  });

  it('kills instance-level secret/key stashes and proves local dispose is an idempotent no-op', async () => {
    // Mutation killed: backend stores canary-derived state in own properties or dispose disables later resolution.
    const { vaultPath, keyPath, handles } = await fixture();
    const backend = createLocalFileBackend({ vaultPath, keyPath });
    const policy = await backend.resolvePolicy(handles[0]!);
    const result = await backend.resolveSecret(handles[0]!, policy);
    expect(result).toBeInstanceOf(Secret);
    expect(String(result)).toBe('[REDACTED]');
    const structure = `${Reflect.ownKeys(backend).join(',')}\n${inspect(backend, {
      showHidden: true,
      depth: 10,
    })}`;
    for (const transform of secretTransforms(canary)) expect(structure).not.toContain(transform.value);
    await backend.dispose();
    await backend.dispose();
    expect((await backend.resolveSecret(handles[0]!, policy)).expose()).toBe(canary);
    // Closures cannot be inspected. The unchanged-file two-open test plus review of the one decrypt path
    // covers closure/content-cache mutations; this structural check covers own instance state only.
  });

  // This proves the byte buffers TinyVault owns are zeroed. It does not and cannot prove the `string`
  // inside `Secret`, or the libsodium WASM heap, has no other copies.
});

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
});

describe('boundary validation, probe, and foreign exception containment', () => {
  const invalidMutations: ReadonlyArray<readonly [string, (file: any) => void]> = [
    ['version', (f) => { f.version = 2; }],
    ['records shape', (f) => { f.records = {}; }],
    ['top extra', (f) => { f.extra = true; }],
    ['record extra', (f) => { f.records[0].extra = true; }],
    ['sealed extra', (f) => { f.records[0].sealed.extra = true; }],
    ['missing label', (f) => { delete f.records[0].label; }],
    ['label type', (f) => { f.records[0].label = 1; }],
    ['account type', (f) => { f.records[0].account = 1; }],
    ['kind', (f) => { f.records[0].kind = 'totp'; }],
    ['missing recipe', (f) => { delete f.records[0].fieldRecipe; }],
    ['recipe shape', (f) => { f.records[0].fieldRecipe = 'password'; }],
    ['empty recipe', (f) => { f.records[0].fieldRecipe = []; }],
    ['duplicate recipe', (f) => { f.records[0].fieldRecipe = ['password', 'password']; }],
    ['unknown role', (f) => { f.records[0].fieldRecipe = ['secret']; }],
    ['duplicate handle', (f) => { f.records.push({ ...f.records[0] }); }],
    ['handle', (f) => { f.records[0].handle = 'bad'; }],
    ['unpadded base64', (f) => { f.records[0].sealed.ciphertext = 'AQEBAQEBAQEBAQEBAQEBAQ'; }],
    ['URL base64', (f) => { f.records[0].sealed.ciphertext = '_____________________w=='; }],
    ['whitespace base64', (f) => { f.records[0].sealed.ciphertext += ' '; }],
    ['nonce length', (f) => { f.records[0].sealed.nonce = Buffer.alloc(23).toString('base64'); }],
    ['ciphertext length', (f) => { f.records[0].sealed.ciphertext = Buffer.alloc(15).toString('base64'); }],
    ['stored origin', (f) => { f.records[0].canonicalOrigin = 'https://EXAMPLE.com'; }],
  ];

  it.each(invalidMutations)('kills backend acceptance of invalid %s', async (_name, mutate) => {
    // Mutation killed: validator failure is ignored by probe or either resolving boundary.
    const file = JSON.parse(new TextDecoder().decode(validVaultBytes()));
    mutate(file);
    const bytes = new TextEncoder().encode(JSON.stringify(file));
    const fs = memoryBackendFs(bytes, new Uint8Array(32));
    const backend = createLocalFileBackend({ vaultPath: '/vault', keyPath: '/key', fs });
    await expect(backend.probeAvailability()).resolves.toEqual({ available: false, reason: 'error' });
    await expectKind(backend.resolvePolicy(validHandle), 'unavailable');
    await expectKind(backend.resolveSecret(validHandle, validPolicy), 'unavailable');
  });

  it.each([
    ['no vault', { vault: 'missing', key: 'missing' }, { available: false, reason: 'not_installed' }],
    ['vault no key', { vault: 'valid', key: 'missing' }, { available: false, reason: 'locked' }],
    ['malformed vault', { vault: 'invalid', key: 'valid' }, { available: false, reason: 'error' }],
    ['wrong key length', { vault: 'valid', key: 'short' }, { available: false, reason: 'locked' }],
    ['valid', { vault: 'valid', key: 'valid' }, { available: true }],
  ] as const)('kills rejecting probe or misclassifying %s', async (_name, state, expected) => {
    // Mutation killed: probe rejects or conflates missing vault, bad vault, and key lock states.
    const fs = statefulProbeFs(state.vault, state.key);
    const backend = createLocalFileBackend({ vaultPath: '/vault', keyPath: '/key', fs });
    await expect(backend.probeAvailability()).resolves.toEqual(expected);
  });

  it('kills native fs/JSON/sodium/TextDecoder exception leakage', async () => {
    // Mutation killed: a foreign error path/message/canary escapes instead of a fixed BackendError.
    const forbiddenPath = '/private/TVC_backend_canary_8F31/vault.json';
    const fsFailure = createLocalFileBackend({
      vaultPath: forbiddenPath,
      keyPath: '/key',
      fs: {
        readFile: async () => { throw new Error(`ENOENT read ${forbiddenPath}`); },
        stat: async () => ({ size: 1, isFile: () => true }),
      },
    });
    await expectContained(fsFailure.listItems(), 'unavailable', forbiddenPath);

    const jsonBackend = createLocalFileBackend({
      vaultPath: '/vault', keyPath: '/key', fs: memoryBackendFs(validVaultBytes(), new Uint8Array(32)),
    });
    vi.spyOn(JSON, 'parse').mockImplementationOnce(() => { throw new Error(forbiddenPath); });
    await expectContained(jsonBackend.listItems(), 'unavailable', forbiddenPath);

    const sodium = backendWithBuffers(new Uint8Array(32), () => { throw new Error(forbiddenPath); });
    await expectContained(sodium.backend.resolveSecret(sodium.handle, sodium.policy), 'integrity', forbiddenPath);

    const decoder = backendWithBuffers(new Uint8Array(32), () => new Uint8Array([0xff]));
    await expectContained(decoder.backend.resolveSecret(decoder.handle, decoder.policy), 'unavailable', forbiddenPath);
  });

  it('kills local production of reserved auth-expired and free-text status fields', async () => {
    // Mutation killed: local-file exposes arbitrary status details or maps any path to auth-expired.
    const statuses = [
      await createLocalFileBackend({
        vaultPath: '/vault', keyPath: '/key', fs: statefulProbeFs('missing', 'missing'),
      }).probeAvailability(),
      await createLocalFileBackend({
        vaultPath: '/vault', keyPath: '/key', fs: statefulProbeFs('valid', 'short'),
      }).probeAvailability(),
    ];
    expect(statuses.map((status) => Object.keys(status))).toEqual([
      ['available', 'reason'], ['available', 'reason'],
    ]);
    for (const status of statuses) expect(JSON.stringify(status)).not.toContain('auth-expired');
  });

  it('kills mapping any local-file failure to reserved auth-expired', async () => {
    // Mutation killed: a local path emits the session-backend-only auth-expired kind.
    const unavailable = createLocalFileBackend({
      vaultPath: '/vault', keyPath: '/key', fs: statefulProbeFs('invalid', 'valid'),
    });
    const locked = createLocalFileBackend({
      vaultPath: '/vault', keyPath: '/key', fs: memoryBackendFs(validVaultBytes(), new Uint8Array(31)),
    });
    const integrity = createLocalFileBackend({
      vaultPath: '/vault', keyPath: '/key', fs: memoryBackendFs(validVaultBytes(), new Uint8Array(32)),
    });
    const observed = await Promise.all([
      caughtKind(unavailable.resolvePolicy(validHandle)),
      caughtKind(locked.resolveSecret(validHandle, validPolicy)),
      caughtKind(integrity.resolveSecret(validHandle, {
        canonicalOrigin: 'https://other.example', fieldRecipe: ['password'],
      })),
      caughtKind(integrity.resolvePolicy('malformed')),
    ]);
    expect(observed).toEqual(['unavailable', 'locked', 'integrity', 'not-found']);
    expect(observed).not.toContain('auth-expired');
  });
});

const validHandle = 'vh_0123456789abcdef0123456789abcdef';
const validPolicy: CredentialPolicy = Object.freeze({
  canonicalOrigin: 'https://example.com',
  fieldRecipe: Object.freeze(['password']),
}) as CredentialPolicy;

function validVaultBytes(): Uint8Array {
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

function memoryBackendFs(vault: Uint8Array, key: Uint8Array): LocalFileBackendFs {
  return {
    readFile: async (filePath) => filePath === '/vault' ? vault : key,
    stat: async (filePath) => ({
      size: filePath === '/vault' ? vault.length : key.length,
      isFile: () => true,
    }),
  };
}

function statefulProbeFs(
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

function backendWithBuffers(
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

function wrapPrimitives(overrides: Partial<SealingPrimitives>): SealingPrimitives {
  return {
    ...defaultSealingPrimitives,
    memzero: (buffer) => { buffer.fill(0); },
    ...overrides,
  };
}

async function editVault(vaultPath: string, mutate: (file: any) => void): Promise<void> {
  const file = JSON.parse(await readFile(vaultPath, 'utf8'));
  mutate(file);
  await writeFile(vaultPath, JSON.stringify(file));
}

async function reseal(
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

function expectZero(buffer: Uint8Array): void {
  expect([...buffer]).toEqual(new Array(buffer.length).fill(0));
}

async function expectKind(promise: Promise<unknown>, kind: BackendError['kind']): Promise<void> {
  try {
    await promise;
    throw new Error(`expected BackendError ${kind}`);
  } catch (error) {
    expect(error).toBeInstanceOf(BackendError);
    expect((error as BackendError).kind).toBe(kind);
  }
}

async function expectContained(
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

async function caughtKind(promise: Promise<unknown>): Promise<BackendError['kind']> {
  try {
    await promise;
    throw new Error('expected BackendError');
  } catch (error) {
    if (!(error instanceof BackendError)) throw error;
    return error.kind;
  }
}
