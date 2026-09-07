import { mkdtemp, mkdir, writeFile, rm, symlink, link, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sodium from 'libsodium-wrappers';
import { describe, expect, it } from 'vitest';
import { readArtifactInventory, verifyVault } from './vault';
import type { ParityRunSnapshot } from './types';

async function vector() {
  await sodium.ready;
  const key = Buffer.alloc(32, 17); const nonce = Buffer.alloc(24, 29);
  const expected = { handle: 'vh_' + 'a'.repeat(32), canonicalOrigin: 'http://vector.invalid', canary: 'vector-synthetic-secret' };
  // Independent literal AD tuple; deliberately does not import the backend encoder/sealer.
  const ad = Buffer.from('["vh_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","http://vector.invalid",["password"]]');
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(Buffer.from(expected.canary), ad, null, nonce, key);
  const doc = { version: 1, records: [{ handle: expected.handle, label: 'vector', kind: 'password', canonicalOrigin: expected.canonicalOrigin,
    fieldRecipe: ['password'], sealed: { nonce: nonce.toString('base64'), ciphertext: Buffer.from(ciphertext).toString('base64') } }] };
  return { key, nonce, expected, doc };
}

describe('canonical local vault binding', () => {
  it('K-vault-binding independently sealed exact additional-data tuple opens', async () => {
    const v = await vector(); const verified = await verifyVault(Buffer.from(JSON.stringify(v.doc)), v.key, v.expected);
    expect(verified.additionalData).toEqual(['vh_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'http://vector.invalid', ['password']]);
    expect(verified.key.length).toBe(32); expect(verified.algorithm).toBe('XChaCha20-Poly1305');
    await verified.destroy(); expect(verified.key.every((byte) => byte === 0)).toBe(true);
  });
  it.each(['key', 'ciphertext', 'nonce', 'AD', 'canary', 'handle', 'key-length', 'record-count'])(
    'K-vault-binding rejects altered %s at intended binding', async (mutation) => {
      const v = await vector(); let category = 'vault-opening';
      if (mutation === 'key') v.key[0] ^= 1;
      if (mutation === 'ciphertext' || mutation === 'nonce') {
        const bytes = Buffer.from(v.doc.records[0].sealed[mutation], 'base64'); bytes[0] ^= 1;
        v.doc.records[0].sealed[mutation] = bytes.toString('base64');
      }
      if (mutation === 'AD') { v.doc.records[0].canonicalOrigin = 'http://changed.invalid'; v.expected.canonicalOrigin = 'http://changed.invalid'; }
      if (mutation === 'canary') { v.expected.canary = 'other-synthetic-secret'; category = 'vault-canary'; }
      if (mutation === 'handle') { v.expected.handle = 'vh_' + 'b'.repeat(32); category = 'vault-policy'; }
      if (mutation === 'key-length') { v.key = Buffer.alloc(31); category = 'vault-inventory'; }
      if (mutation === 'record-count') { v.doc.records = []; category = 'vault-inventory'; }
      await expect(verifyVault(Buffer.from(JSON.stringify(v.doc)), v.key, v.expected)).rejects.toThrow(`Parity ${category}`);
    });
  it('K-vault-binding preserves optional metadata presence', async () => {
    const v = await vector(); const first = await verifyVault(Buffer.from(JSON.stringify(v.doc)), v.key, v.expected);
    const withAccount = { ...v.doc, records: [{ ...v.doc.records[0], account: '' }] };
    const second = await verifyVault(Buffer.from(JSON.stringify(withAccount)), v.key, v.expected);
    expect(Object.hasOwn(first.vault.records[0], 'account')).toBe(false);
    expect(Object.hasOwn(second.vault.records[0], 'account')).toBe(true);
    await first.destroy(); await second.destroy();
  });
});

async function inventory() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'parity-inventory-')));
  const run = join(root, 'runs', 'run-0'); await mkdir(run, { recursive: true }); await mkdir(join(root, 'fixture-captures'));
  const descriptor = { scenario: 'vector', agent: 'stub-safe', runIndex: 0, runId: 'run-0', canary: 'synthetic', canaryId: 'canary-0', nonce: 'nonce-0',
    vaultPath: join(run, 'vault-nonce-0.json'), keyPath: join(run, 'vault-nonce-0.key'), transcriptPath: join(run, 'transcript.jsonl'), eventsPath: join(run, 'events.json') };
  const snapshot: ParityRunSnapshot = { descriptor, unauthorizedRequests: [] };
  for (const path of [descriptor.vaultPath, descriptor.keyPath, descriptor.transcriptPath, descriptor.eventsPath,
    join(root, 'fixture-captures/run-0.requests'), join(root, 'fixture-captures/run-0.unauthorized.requests'), join(root, 'fixture-captures/lookalike.requests')]) await writeFile(path, '');
  await writeFile(join(root, 'runs.captured.json'), JSON.stringify([descriptor]));
  await writeFile(join(root, 'offline-evidence.json'), JSON.stringify({ runs: [descriptor] }));
  return { root, snapshot };
}
describe('canonical closed artifact inventory', () => {
  it('K-artifact-inventory retains required present-empty surfaces', async () => {
    const v = await inventory();
    try { const result = await readArtifactInventory(v.root, [v.snapshot], 'in-process');
      expect(result.files.size).toBe(9); expect(result.auxiliary).toEqual({ lookalike: 'present-empty', unattributed: 'absent' });
    } finally { await rm(v.root, { recursive: true, force: true }); }
  });
  it.each(['vault-missing', 'key-missing', 'lookalike-missing', 'lookalike-nonempty', 'unattributed-empty', 'unattributed-nonempty',
    'stale-vault-pair', 'symlink', 'hardlink', 'path-alias', 'missing-snapshot', 'identity', 'unexpected-file'])(
    'K-artifact-inventory rejects %s', async (mutation) => {
      const v = await inventory(); const d = v.snapshot.descriptor;
      try {
        if (mutation === 'vault-missing') await rm(d.vaultPath);
        if (mutation === 'key-missing') await rm(d.keyPath);
        if (mutation === 'lookalike-missing') await rm(join(v.root, 'fixture-captures/lookalike.requests'));
        if (mutation === 'lookalike-nonempty') await writeFile(join(v.root, 'fixture-captures/lookalike.requests'), 'unexpected\n');
        if (mutation.startsWith('unattributed')) await writeFile(join(v.root, 'fixture-captures/unregistered.unauthorized.requests'), mutation.endsWith('nonempty') ? 'unexpected\n' : '');
        if (mutation === 'stale-vault-pair') { await writeFile(join(v.root, 'runs/run-0/vault-stale.json'), ''); await writeFile(join(v.root, 'runs/run-0/vault-stale.key'), ''); }
        if (mutation === 'unexpected-file') await writeFile(join(v.root, 'scorecard.json'), '{}');
        if (mutation === 'symlink' || mutation === 'hardlink') { await rm(d.keyPath); await (mutation === 'symlink' ? symlink : link)(d.vaultPath, d.keyPath); }
        if (mutation === 'path-alias') (d as { keyPath: string }).keyPath = d.vaultPath;
        if (mutation === 'missing-snapshot') (v.snapshot as unknown as { unauthorizedRequests: undefined }).unauthorizedRequests = undefined;
        if (mutation === 'identity') await writeFile(join(v.root, 'runs.captured.json'), '[]');
        const category = { 'vault-missing': 'artifact-missing', 'key-missing': 'artifact-missing', 'lookalike-missing': 'artifact-missing', 'lookalike-nonempty': 'artifact-lookalike-nonempty', 'unattributed-empty': 'artifact-unexpected-or-alias', 'unattributed-nonempty': 'artifact-unexpected-or-alias', 'stale-vault-pair': 'artifact-unexpected-or-alias', symlink: 'artifact-symlink', hardlink: 'artifact-unexpected-or-alias', 'path-alias': 'artifact-path', 'missing-snapshot': 'artifact-run', identity: 'artifact-identity', 'unexpected-file': 'artifact-unexpected-or-alias' }[mutation];
        await expect(readArtifactInventory(v.root, [v.snapshot], 'in-process')).rejects.toThrow(`Parity ${category}`);
      } finally { await rm(v.root, { recursive: true, force: true }); }
    });
});
