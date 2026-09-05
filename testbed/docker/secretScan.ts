// Byte-native Acceptance E checks cover the declared raw and text encodings, not arbitrary transforms.
// Patterns are sensitive harness memory, never diagnostics or artifacts, and are erased after teardown scans.
// Temporary encoding strings, like the bootstrap JSON string, remain GC-bound.
import { createReadStream } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import type { DockerSpawn } from './exec';

export const SECRET_FORMS = ['raw', 'hex', 'buffer-inspect', 'decimal-array', 'base64url'] as const;
export type SecretForm = typeof SECRET_FORMS[number];
export function secretPatterns(secret: Uint8Array): Buffer[] {
  const bytes = Buffer.from(secret);
  return [bytes, Buffer.from(bytes.toString('hex')), Buffer.from([...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ')),
    Buffer.from(JSON.stringify([...bytes])), Buffer.from(bytes.toString('base64url'))];
}
export function secretScan(surface: Uint8Array | string, secret: Uint8Array): boolean {
  const scanner = new SecretScanner(secret);
  try { return scanner.scan(surface); } finally { scanner.destroy(); }
}
export class SecretScanner {
  readonly #patterns: Buffer[];
  constructor(secret: Uint8Array) { this.#patterns = secretPatterns(secret); }
  get overlap(): number { return Math.max(...this.#patterns.map((p) => p.length)) - 1; }
  scan(surface: Uint8Array | string): boolean {
    const bytes = typeof surface === 'string' ? Buffer.from(surface, 'latin1') : Buffer.from(surface);
    return this.#patterns.some((pattern) => pattern.length > 0 && bytes.includes(pattern));
  }
  destroy(): void { for (const pattern of this.#patterns) pattern.fill(0); this.#patterns.length = 0; }
}
export function scanSpawns(spawns: readonly DockerSpawn[], scanner: SecretScanner): boolean {
  return spawns.some((spawn) => [spawn.file, ...spawn.args, ...Object.entries(spawn.env).flat()]
    .some((value) => scanner.scan(value)));
}
export type ScanResult = { exposed: boolean; controls: boolean[] };
export function scanSurface(surface: Uint8Array | string, secrets: readonly SecretScanner[],
  controls: readonly SecretScanner[] = []): ScanResult {
  const hits = [...secrets, ...controls].map((needle) => needle.scan(surface));
  return { exposed: hits.slice(0, secrets.length).some(Boolean), controls: hits.slice(secrets.length) };
}
function mergeScan(target: ScanResult, next: ScanResult): void {
  target.exposed ||= next.exposed;
  next.controls.forEach((hit, i) => { target.controls[i] ||= hit; });
}
export class StreamSecretScanner {
  #tail = Buffer.alloc(0);
  readonly result: ScanResult;
  get found(): boolean { return this.result.exposed; }
  constructor(readonly scanners: readonly SecretScanner[], readonly controls: readonly SecretScanner[] = []) {
    this.result = { exposed: false, controls: controls.map(() => false) };
  }
  feed(chunk: Uint8Array): void {
    const bytes = Buffer.concat([this.#tail, chunk]);
    mergeScan(this.result, scanSurface(bytes, this.scanners, this.controls));
    const overlap = Math.max(0, ...[...this.scanners, ...this.controls].map((scanner) => scanner.overlap));
    this.#tail.fill(0);
    this.#tail = Buffer.from(bytes.subarray(Math.max(0, bytes.length - overlap)));
    bytes.fill(0);
  }
  destroy(): void { this.#tail.fill(0); this.#tail = Buffer.alloc(0); }
}
export async function scanStream(stream: Readable, scanners: readonly SecretScanner[]): Promise<boolean> {
  return (await scanStreamWithControls(stream, scanners)).exposed;
}
export async function scanStreamWithControls(stream: Readable, scanners: readonly SecretScanner[],
  controls: readonly SecretScanner[] = []): Promise<ScanResult> {
  const scan = new StreamSecretScanner(scanners, controls);
  try {
    for await (const chunk of stream) scan.feed(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return scan.result;
  } finally { scan.destroy(); }
}
export async function scanArtifactTree(root: string, scanners: readonly SecretScanner[]): Promise<boolean> {
  return (await scanArtifactsWithControls(root, scanners)).exposed;
}
export async function scanArtifactsWithControls(root: string, scanners: readonly SecretScanner[],
  controls: readonly SecretScanner[] = []): Promise<ScanResult> {
  const pending = [root];
  const result: ScanResult = { exposed: false, controls: controls.map(() => false) };
  while (pending.length) {
    const path = pending.pop()!;
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error('scan-failed');
    if (stat.isDirectory()) {
      for (const name of (await readdir(path)).sort().reverse()) pending.push(join(path, name));
    } else if (stat.isFile()) {
      // Do not short-circuit traversal after a finding: every file remains an observed surface.
      mergeScan(result, await scanStreamWithControls(createReadStream(path), scanners, controls));
    } else throw new Error('scan-failed');
  }
  return result;
}
// Drain immediately, scan every byte with overlap, retain only a bounded diagnostic ring.
export function observeStderr(stream: Readable, scanners: readonly SecretScanner[], limit = 65536,
  controls: readonly SecretScanner[] = []) {
  const scan = new StreamSecretScanner(scanners, controls);
  let ring = Buffer.alloc(0);
  let failed = false;
  stream.on('data', (chunk: Buffer) => {
    scan.feed(chunk);
    const joined = Buffer.concat([ring, chunk]);
    ring.fill(0); ring = Buffer.from(joined.subarray(Math.max(0, joined.length - limit))); joined.fill(0);
  });
  stream.on('error', () => { failed = true; });
  return { result: () => scan.result, exposed: () => scan.found, failed: () => failed, snapshot: () => Buffer.from(ring),
    destroy: () => { scan.destroy(); ring.fill(0); ring = Buffer.alloc(0); } };
}
