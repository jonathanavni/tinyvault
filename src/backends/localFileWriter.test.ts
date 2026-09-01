import { chmod, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createLocalFileBackend } from './localFile';
import { defaultSealingPrimitives, type SealingPrimitives } from './localFileSodium';
import {
  generateLocalVaultKey,
  writeLocalVault,
  type LocalFileWriterFs,
  type LocalVaultEntry,
} from './localFileWriter';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function paths(): Promise<{ root: string; vaultPath: string; keyPath: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tinyvault-writer-'));
  temporaryRoots.push(root);
  return { root, vaultPath: path.join(root, 'vault.json'), keyPath: path.join(root, 'vault.key') };
}

function entry(secret: string, origin = 'https://EXAMPLE.com:443'): LocalVaultEntry {
  return {
    label: 'Example login',
    kind: 'password',
    account: 'person@example.com',
    canonicalOrigin: origin,
    fieldRecipe: ['username', 'password'],
    secret,
  };
}

describe('local vault writer', () => {
  it('kills non-round-tripping handles, normalization-on-read-only, and loose fresh-file modes', async () => {
    // Mutation killed: writer emits malformed/duplicate handles, stores unnormalized origin, or omits 0600.
    const { vaultPath, keyPath } = await paths();
    await generateLocalVaultKey(keyPath);
    const items = await writeLocalVault(vaultPath, keyPath, [entry('TVC_writer_A'), entry('TVC_writer_B')]);
    expect(items).toHaveLength(2);
    expect(items.every((item) => /^vh_[0-9a-f]{32}$/u.test(item.handle))).toBe(true);
    expect(new Set(items.map((item) => item.handle)).size).toBe(2);

    const backend = createLocalFileBackend({ vaultPath, keyPath });
    const policy = await backend.resolvePolicy(items[0]!.handle);
    expect(policy.canonicalOrigin).toBe('https://example.com');
    expect((await backend.resolveSecret(items[0]!.handle, policy)).expose()).toBe('TVC_writer_A');
    if (process.platform !== 'win32') {
      expect((await stat(keyPath)).mode & 0o777).toBe(0o600);
      expect((await stat(vaultPath)).mode & 0o777).toBe(0o600);
    }
  });

  it('kills constant-nonce and unpersisted-nonce mutations', async () => {
    // Mutation killed: randomNonce is skipped/reused or persisted bytes differ from the seam outputs.
    const { vaultPath, keyPath } = await paths();
    await generateLocalVaultKey(keyPath);
    const emitted: Uint8Array[] = [];
    let next = 1;
    const primitives = wrappingPrimitives({
      randomNonce: () => {
        const nonce = new Uint8Array(24).fill(next++);
        emitted.push(nonce);
        return nonce;
      },
    });
    await writeLocalVault(vaultPath, keyPath, [entry('one'), entry('two')], { primitives });
    const file = JSON.parse(await readFile(vaultPath, 'utf8')) as any;
    expect(emitted).toHaveLength(2);
    expect(file.records.map((record: any) => record.sealed.nonce)).toEqual(
      emitted.map((nonce) => Buffer.from(nonce).toString('base64')),
    );
    expect(file.records[0].sealed.nonce).not.toBe(file.records[1].sealed.nonce);
  });

  it('kills writer AD encoding before origin normalization', async () => {
    // Mutation killed: writer authenticates the caller spelling instead of the normalized stored origin.
    const { vaultPath, keyPath } = await paths();
    await generateLocalVaultKey(keyPath);
    let observedAdditionalData: Uint8Array | undefined;
    const primitives = wrappingPrimitives({
      randomHandle: () => new Uint8Array(16),
      seal: async (plaintext, additionalData, nonce, key) => {
        observedAdditionalData = additionalData;
        return defaultSealingPrimitives.seal(plaintext, additionalData, nonce, key);
      },
    });
    await writeLocalVault(vaultPath, keyPath, [entry('golden', 'HTTPS://EXAMPLE.com:443')], {
      primitives,
    });
    expect(Buffer.from(observedAdditionalData!).toString('hex')).toBe(
      '5b2276685f3030303030303030303030303030303030303030303030303030303030303030222c2268747470733a2f2f6578616d706c652e636f6d222c5b22757365726e616d65222c2270617373776f7264225d5d',
    );
  });

  it('kills key overwrite and generated-key retention on success', async () => {
    // Mutation killed: key creation drops wx, overwrites prior bytes, or omits generated-buffer cleanup.
    const { keyPath } = await paths();
    const generated = new Uint8Array(32).fill(9);
    const primitives = wrappingPrimitives({ randomKey: () => generated });
    await generateLocalVaultKey(keyPath, { primitives });
    expect([...generated]).toEqual(new Array(32).fill(0));
    const prior = await readFile(keyPath);
    await expect(generateLocalVaultKey(keyPath)).rejects.toThrow('Key file already exists');
    expect(await readFile(keyPath)).toEqual(prior);
  });

  it('kills generated-key cleanup that runs only after successful writes', async () => {
    // Mutation killed: write failure bypasses the generateLocalVaultKey finally block.
    const generated = new Uint8Array(32).fill(7);
    const primitives = wrappingPrimitives({ randomKey: () => generated });
    const fs = {
      writeFile: async () => { throw new Error('injected write failure'); },
    } as unknown as LocalFileWriterFs;
    await expect(generateLocalVaultKey('/not-used/key', { primitives, fs })).rejects.toThrow();
    expect([...generated]).toEqual(new Array(32).fill(0));
  });

  it('kills per-record key wiping and missing writer success cleanup', async () => {
    // Mutation killed: key is wiped inside record one or key/plaintext buffers survive a successful write.
    const { vaultPath, keyPath } = await paths();
    const key = new Uint8Array(32).fill(4);
    const plaintexts: Uint8Array[] = [];
    let seals = 0;
    const primitives = wrappingPrimitives({
      seal: (plaintext, _ad, _nonce, activeKey) => {
        seals += 1;
        expect([...activeKey]).toEqual(new Array(32).fill(4));
        plaintexts.push(plaintext);
        return new Uint8Array(16).fill(seals);
      },
    });
    const fs = writerFsWithKey(key);
    await writeLocalVault(vaultPath, keyPath, [entry('first'), entry('second')], { primitives, fs });
    expect(seals).toBe(2);
    expect([...key]).toEqual(new Array(32).fill(0));
    expect(plaintexts).toHaveLength(2);
    for (const plaintext of plaintexts) expect([...plaintext]).toEqual(new Array(plaintext.length).fill(0));
  });

  it.each([1, 2])('kills missing writer cleanup when seal call %i throws', async (throwAt) => {
    // Mutation killed: first/nth seal failure escapes either the inner plaintext or outer key finally.
    const { vaultPath, keyPath } = await paths();
    const key = new Uint8Array(32).fill(6);
    const plaintexts: Uint8Array[] = [];
    let seals = 0;
    const primitives = wrappingPrimitives({
      seal: (plaintext) => {
        plaintexts.push(plaintext);
        seals += 1;
        if (seals === throwAt) throw new Error('injected seal failure');
        return new Uint8Array(16).fill(3);
      },
    });
    await expect(writeLocalVault(
      vaultPath,
      keyPath,
      [entry('first'), entry('second')],
      { primitives, fs: writerFsWithKey(key) },
    )).rejects.toThrow('injected seal failure');
    expect([...key]).toEqual(new Array(32).fill(0));
    for (const plaintext of plaintexts) expect([...plaintext]).toEqual(new Array(plaintext.length).fill(0));
    await expect(stat(vaultPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('kills direct-overwrite, non-exclusive-temp, missing-fsync, and rename-before-close mutations', async () => {
    // Mutation killed: success trace differs from wx temp -> write -> fsync -> close -> rename.
    const { root, vaultPath, keyPath } = await paths();
    await writeFile(keyPath, Buffer.alloc(32, 8), { mode: 0o600 });
    const trace: string[] = [];
    const fs = tracingWriterFs(trace);
    await writeLocalVault(vaultPath, keyPath, [entry('atomic')], { fs });
    expect(trace.map((event) => event.split(':')[0])).toEqual([
      'open', 'write', 'fsync', 'close', 'rename',
    ]);
    const openEvent = trace[0]!;
    const [, temporaryPath, flags, mode] = openEvent.split(':');
    expect(path.dirname(temporaryPath!)).toBe(root);
    expect(temporaryPath).not.toBe(vaultPath);
    expect(flags).toBe('wx');
    expect(mode).toBe(String(0o600));
    expect(trace.at(-1)).toBe(`rename:${temporaryPath}:${vaultPath}`);
  });

  it.each(['write', 'fsync', 'close', 'rename'] as const)(
    'kills atomic replacement that damages prior bytes or leaks a temp on %s failure',
    async (failure) => {
      // Mutation killed: the named failure changes the old vault, renames before close, or leaves a temp.
      const { root, vaultPath, keyPath } = await paths();
      await writeFile(keyPath, Buffer.alloc(32, 5), { mode: 0o600 });
      const prior = Buffer.from('prior-vault-bytes');
      await writeFile(vaultPath, prior, { mode: 0o640 });
      const trace: string[] = [];
      const fs = tracingWriterFs(trace, failure);
      await expect(writeLocalVault(vaultPath, keyPath, [entry('new')], { fs })).rejects.toThrow();
      expect(await readFile(vaultPath)).toEqual(prior);
      const renameIndex = trace.findIndex((event) => event.startsWith('rename:'));
      const successfulCloseIndex = trace.findIndex((event) => event === 'close:ok');
      expect(renameIndex === -1 || (successfulCloseIndex !== -1 && successfulCloseIndex < renameIndex))
        .toBe(true);
      expect((await readdir(root)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    },
  );

  it('kills validation after disk access', async () => {
    // Mutation killed: invalid input reads the key, opens a temp, or otherwise touches disk first.
    const touched: string[] = [];
    const fs = new Proxy({} as LocalFileWriterFs, {
      get: (_target, property) => async () => { touched.push(String(property)); },
    });
    await expect(writeLocalVault('/vault', '/key', [{
      ...entry('bad'),
      fieldRecipe: [],
    }], { fs })).rejects.toThrow('Invalid local vault entry');
    expect(touched).toEqual([]);
  });

  it('kills replacement that preserves a pre-existing loose mode', async () => {
    // Mutation killed: direct overwrite retains 0640 instead of replacing with a 0600 temp inode.
    if (process.platform === 'win32') return;
    const { vaultPath, keyPath } = await paths();
    await generateLocalVaultKey(keyPath);
    await writeFile(vaultPath, 'old', { mode: 0o640 });
    await chmod(vaultPath, 0o640);
    await writeLocalVault(vaultPath, keyPath, [entry('replacement')]);
    expect((await stat(vaultPath)).mode & 0o777).toBe(0o600);
  });
});

function wrappingPrimitives(overrides: Partial<SealingPrimitives>): SealingPrimitives {
  let handleCounter = 1;
  return {
    ...defaultSealingPrimitives,
    randomHandle: () => new Uint8Array(16).fill(handleCounter++),
    ...overrides,
  };
}

function writerFsWithKey(key: Uint8Array): LocalFileWriterFs {
  return {
    readFile: async () => key,
    writeFile: async () => {},
    open: async () => ({ writeFile: async () => {}, sync: async () => {}, close: async () => {} }),
    rename: async () => {},
    unlink: async () => {},
  };
}

function tracingWriterFs(trace: string[], failure?: 'write' | 'fsync' | 'close' | 'rename'):
LocalFileWriterFs {
  return {
    readFile: async (filePath) => {
      return readFile(filePath);
    },
    writeFile: async (filePath, data, options) => {
      trace.push(`pathWrite:${filePath}`);
      await writeFile(filePath, data, options);
    },
    open: async (filePath, flags, mode) => {
      trace.push(`open:${filePath}:${flags}:${mode}`);
      const file = await import('node:fs/promises').then((module) => module.open(filePath, flags, mode));
      return {
        writeFile: async (data) => {
          trace.push('write');
          if (failure === 'write') throw new Error('injected write failure');
          await file.writeFile(data);
        },
        sync: async () => {
          trace.push('fsync');
          if (failure === 'fsync') throw new Error('injected fsync failure');
          await file.sync();
        },
        close: async () => {
          if (failure === 'close') {
            await file.close();
            trace.push('close:failed');
            throw new Error('injected close failure');
          }
          await file.close();
          trace.push(failure === undefined ? 'close' : 'close:ok');
        },
      };
    },
    rename: async (oldPath, newPath) => {
      trace.push(`rename:${oldPath}:${newPath}`);
      if (failure === 'rename') throw new Error('injected rename failure');
      await import('node:fs/promises').then((module) => module.rename(oldPath, newPath));
    },
    unlink: async (filePath) => {
      trace.push(`unlink:${filePath}`);
      await import('node:fs/promises').then((module) => module.unlink(filePath));
    },
  };
}
