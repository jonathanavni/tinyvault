import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { parseLocalVaultBytes, encodeAdditionalData, type LocalVaultFile } from '../../src/backends/localFileFormat';
import { defaultSealingPrimitives as sealing } from '../../src/backends/localFileSodium';
import type { ParityRunSnapshot } from './types';

export function parityFailure(category: string): never { throw new Error(`Parity ${category}`); }
export type ArtifactInventory = Readonly<{
  files: ReadonlyMap<string, Buffer>;
  auxiliary: { lookalike: 'present-empty' | 'not-exported'; unattributed: 'absent' | 'not-exported' };
}>;

/** Closed inventory, including inode aliases. No caller-provided bytes bypass these reads. */
export async function readArtifactInventory(root: string, snapshots: readonly ParityRunSnapshot[],
  architecture: 'in-process' | 'composed'): Promise<ArtifactInventory> {
  if (!snapshots.length || await realpath(root) !== resolve(root)) parityFailure('artifact-root');
  const expected = new Set(['runs.captured.json', 'offline-evidence.json']);
  const add = (path: string) => { if (expected.has(path)) parityFailure('artifact-duplicate'); expected.add(path); };
  const runs = new Set<string>();
  for (const { descriptor: d, unauthorizedRequests } of snapshots) {
    if (runs.has(d.runId) || !/^[A-Za-z0-9_-]+$/.test(d.runId) || !Array.isArray(unauthorizedRequests)) parityFailure('artifact-run');
    runs.add(d.runId);
    const dir = resolve(root, 'runs', d.runId);
    for (const [field, suffix] of [[d.transcriptPath, 'transcript.jsonl'], [d.eventsPath, 'events.json'],
      [d.vaultPath, `vault-${d.nonce}.json`], [d.keyPath, `vault-${d.nonce}.key`]]) {
      if (resolve(field) !== join(dir, suffix) || dirname(field) !== dir) parityFailure('artifact-path');
      add(relative(root, field));
    }
    add(`fixture-captures/${d.runId}.requests`);
    if (architecture === 'in-process') add(`fixture-captures/${d.runId}.unauthorized.requests`);
  }
  if (architecture === 'in-process') add('fixture-captures/lookalike.requests');
  else add('composed-scan/close.marker');
  const files = new Map<string, Buffer>(); const inodes = new Set<string>();
  // Authenticate the exact run identity sets before traversing per-run members.
  for (const member of ['runs.captured.json', 'offline-evidence.json']) {
    const path = join(root, member); const entry = await lstat(path);
    if (!entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1) parityFailure('artifact-root-file');
    const inode = `${entry.dev}:${entry.ino}`;
    if (inodes.has(inode)) parityFailure('artifact-alias');
    inodes.add(inode); files.set(member, await readFile(path));
  }
  const identity = (item: { scenario: string; agent: string; runIndex: number }) => JSON.stringify([item.scenario, item.agent, item.runIndex]);
  for (const values of [JSON.parse(files.get('runs.captured.json')!.toString()),
    JSON.parse(files.get('offline-evidence.json')!.toString()).runs]) {
    if (!Array.isArray(values) || values.length !== snapshots.length
      || new Set(values.map(identity)).size !== snapshots.length
      || snapshots.some(({ descriptor }) => !values.some((item) => identity(item) === identity(descriptor)))) parityFailure('artifact-identity');
  }
  const visit = async (directory: string): Promise<void> => {
    for (const name of await readdir(directory)) {
      const path = join(directory, name); const entry = await lstat(path);
      if (entry.isSymbolicLink()) parityFailure('artifact-symlink');
      if (entry.isDirectory()) {
        const prefix = relative(root, path) + sep;
        if (![...expected].some((member) => member.startsWith(prefix))) parityFailure('artifact-unexpected-directory');
        await visit(path); continue;
      }
      const member = relative(root, path);
      if (files.has(member)) continue;
      const inode = `${entry.dev}:${entry.ino}`;
      if (!entry.isFile() || !expected.has(member) || inodes.has(inode) || entry.nlink !== 1) parityFailure('artifact-unexpected-or-alias');
      inodes.add(inode); files.set(member, await readFile(path));
    }
  };
  await visit(root);
  if (files.size !== expected.size || [...expected].some((name) => !files.has(name))) parityFailure('artifact-missing');
  if (architecture === 'in-process') {
    if (files.get('fixture-captures/lookalike.requests')!.length !== 0) parityFailure('artifact-lookalike-nonempty');
    for (const snapshot of snapshots) {
      const expectedBytes = snapshot.unauthorizedRequests.map((request) => JSON.stringify(request) + '\n').join('');
      if (!files.get(`fixture-captures/${snapshot.descriptor.runId}.unauthorized.requests`)!.equals(Buffer.from(expectedBytes))) parityFailure('artifact-unauthorized');
    }
  }
  return { files, auxiliary: architecture === 'in-process'
    ? { lookalike: 'present-empty', unattributed: 'absent' }
    : { lookalike: 'not-exported', unattributed: 'not-exported' } };
}

export type VerifiedVault = Readonly<{
  vault: LocalVaultFile; key: Buffer; nonce: Buffer; ciphertext: Buffer;
  additionalData: readonly unknown[]; algorithm: 'XChaCha20-Poly1305';
  destroy(): Promise<void>;
}>;
/** Return anchors only after authenticating the actual backend bytes and trusted canary. */
export async function verifyVault(vaultBytes: Uint8Array, keyBytes: Uint8Array,
  expected: { canary: string; handle: string; canonicalOrigin: string }): Promise<VerifiedVault> {
  const key = Buffer.from(keyBytes); let nonce = Buffer.alloc(0); let ciphertext = Buffer.alloc(0);
  let plaintext: Uint8Array | undefined; let additionalData: Uint8Array | undefined;
  const canary = Buffer.from(expected.canary, 'utf8'); let retained = false;
  try {
    let vault: LocalVaultFile;
    try { vault = parseLocalVaultBytes(vaultBytes); } catch { return parityFailure('vault-format'); }
    if (key.length !== 32 || vault.records.length !== 1) parityFailure('vault-inventory');
    const record = vault.records[0];
    if (record.handle !== expected.handle || record.canonicalOrigin !== expected.canonicalOrigin
      || JSON.stringify(record.fieldRecipe) !== '["password"]') parityFailure('vault-policy');
    nonce = Buffer.from(record.sealed.nonce, 'base64'); ciphertext = Buffer.from(record.sealed.ciphertext, 'base64');
    additionalData = encodeAdditionalData(record.handle, record);
    const tuple = [record.handle, record.canonicalOrigin, ['password']];
    if (!Buffer.from(additionalData).equals(Buffer.from(JSON.stringify(tuple)))) parityFailure('vault-additional-data');
    try { plaintext = await sealing.open(ciphertext, additionalData, nonce, key); }
    catch { return parityFailure('vault-opening'); }
    if (plaintext.length !== canary.length || !timingSafeEqual(plaintext, canary)) parityFailure('vault-canary');
    retained = true;
    return { vault, key, nonce, ciphertext, additionalData: tuple, algorithm: 'XChaCha20-Poly1305',
      async destroy() { await Promise.all([key, nonce, ciphertext].map((bytes) => sealing.memzero(bytes))); } };
  } finally {
    await sealing.memzero(canary);
    if (plaintext) await sealing.memzero(plaintext);
    if (additionalData) await sealing.memzero(additionalData);
    if (!retained) await Promise.all([key, nonce, ciphertext].map((bytes) => sealing.memzero(bytes)));
  }
}
