// Integrator-only observers. Bootstrap copies remain in test memory and are erased after all scans.
import { readFile, realpath, stat } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FrameDecoder } from './frames';
import { dockerPreflight } from './preflight';
import { createDockerProcessRunner, type DockerHandle, type DockerResult, type DockerSpawn,
  type ProcessHandle, type DockerProcessRunner } from './exec';
import { observeStderr, SecretScanner, StreamSecretScanner, secretScan } from './secretScan';
import type { Frame } from './protocol';
import { validateTopology } from './topology.mjs';
const topology = validateTopology(JSON.parse(readFileSync(new URL('./topology.json', import.meta.url), 'utf8')));

export async function localPin() {
  return dockerPreflight({ env: process.env, realpath, stat, files: { readFile: async (path) => {
    try { return await readFile(path, 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  } } });
}
export function commandKind(s: DockerSpawn): string {
  if (s.args[0] === 'ps') return 'ps-project';
  if (s.args[0] !== 'compose') return s.args[0];
  const args = s.args.slice(s.args.indexOf('-p') + 2);
  return args[0] === 'ps' ? `ps-${args[1]}` : args[0];
}
export function assertClean(surface: string | Uint8Array, secrets: readonly Buffer[]): void {
  // Assertion failures contain booleans, never a bootstrap value or a possibly contaminated surface.
  assert.equal(secrets.some((secret) => secretScan(surface, secret)), false, 'bootstrap secret exposed');
}
export function assertMarker(surface: string | Uint8Array, marker: string): void {
  assert.equal(secretScan(surface, Buffer.from(marker)), true, `missing ${marker}`);
}
type ObservedBridge = {
  handle: DockerHandle; requests: string[]; responses: Frame[]; errors: string[];
  stderr: ReturnType<typeof observeStderr>; id: string; exited(): boolean;
};
export class IntegrationEvidence {
  readonly handles: ProcessHandle[] = [];
  readonly spawns: DockerSpawn[] = [];
  readonly results: { spawn: DockerSpawn; result: DockerResult }[] = [];
  readonly bridges: ObservedBridge[] = [];
  readonly secrets: Buffer[] = [];
  readonly exports: { marker: StreamSecretScanner; tar: MetafileFromTar; errors: string[] }[] = [];
  readonly controls: SecretScanner[] = [];
  readonly native = createDockerProcessRunner({ register: (h) => this.handles.push(h) });
  readonly runner: DockerProcessRunner = {
    run: async (spawn) => {
      this.spawns.push(spawn);
      const result = await this.native.run(spawn);
      this.results.push({ spawn, result });
      return result;
    },
    spawnLongLived: (spawn) => {
      this.spawns.push(spawn);
      const handle = this.native.spawnLongLived(spawn);
      if (spawn.args[0] === 'exec') return this.observeBridge(handle, spawn).handle;
      if (spawn.args[0] === 'export') this.observeExport(handle);
      return handle;
    },
  };
  observeBridge(handle: DockerHandle, spawn: DockerSpawn): ObservedBridge {
    const input = new PassThrough(); input.pipe(handle.stdin);
    const requests: string[] = []; const responses: Frame[] = []; const errors: string[] = [];
    const decoder = new FrameDecoder((frame) => {
      requests.push(`${frame.id}:${frame.op}`);
      if (frame.kind === 'req' && frame.op === 'bootstrap') {
        this.secrets.push(Buffer.from(frame.body.secret as string, 'base64url'));
      }
    }, (code) => errors.push(code));
    input.on('data', (chunk: Buffer) => decoder.feed(chunk));
    const output = new FrameDecoder((frame) => responses.push(frame), (code) => errors.push(code));
    handle.stdout.on('data', (chunk: Buffer) => output.feed(chunk));
    handle.stdout.on('end', () => output.end());
    const stderr = observeStderr(handle.stderr, []);
    let exited = false;
    void handle.exited.finally(() => { exited = true; input.destroy(); }).catch(() => {});
    const result = { handle: { ...handle, stdin: input }, requests, responses, errors, stderr,
      id: spawn.args[2], exited: () => exited };
    this.bridges.push(result);
    return result;
  }
  observeExport(handle: DockerHandle): void {
    const control = new SecretScanner(Buffer.from(topology.markers.EXPORT_MARKER));
    this.controls.push(control);
    const marker = new StreamSecretScanner([control]);
    const tar = new MetafileFromTar();
    const errors: string[] = [];
    handle.stdout.on('data', (chunk: Buffer) => {
      marker.feed(chunk);
      try { if (!errors.length) tar.feed(chunk); } catch { errors.push('export-tar'); }
    });
    this.exports.push({ marker, tar, errors });
  }
  get project(): string {
    const spawn = this.spawns.find((s) => s.args[0] === 'compose')!;
    return spawn.args[spawn.args.indexOf('-p') + 1];
  }
  get epoch(): string { return this.spawns.find((s) => s.env.TV_EVAL_EPOCH !== undefined)!.env.TV_EVAL_EPOCH; }
  async finish(): Promise<void> {
    this.handles.forEach((h) => h.kill());
    await Promise.allSettled(this.handles.map((h) => h.exited));
    this.secrets.forEach((secret) => secret.fill(0));
    this.bridges.forEach((b) => b.stderr.destroy());
    this.exports.forEach((e) => e.marker.destroy());
    this.controls.forEach((c) => c.destroy());
  }
}

// Minimal streaming reader of one regular file in Docker's tar export. No extraction or path writes.
export class MetafileFromTar {
  #pending = Buffer.alloc(0);
  #remaining = 0;
  #padding = 0;
  #wanted = false;
  #parts: Buffer[] = [];
  text = '';
  feed(chunk: Buffer): void {
    this.#pending = Buffer.concat([this.#pending, chunk]);
    while (this.#pending.length) {
      if (this.#remaining) { this.#body(); continue; }
      if (this.#padding) {
        const count = Math.min(this.#padding, this.#pending.length);
        this.#padding -= count; this.#pending = this.#pending.subarray(count); continue;
      }
      if (this.#pending.length < 512) return;
      this.#header();
    }
  }
  #header(): void {
    const header = this.#pending.subarray(0, 512); this.#pending = this.#pending.subarray(512);
    const field = (start: number, end: number) => header.subarray(start, end).toString('utf8').split('\0')[0];
    const name = [field(345, 500), field(0, 100)].filter(Boolean).join('/').replace(/^\.\//, '');
    this.#remaining = Number.parseInt(field(124, 136).trim() || '0', 8);
    if (!Number.isSafeInteger(this.#remaining) || this.#remaining < 0) throw new Error('export-tar-size');
    this.#padding = (512 - this.#remaining % 512) % 512;
    this.#wanted = name === 'app/meta.json';
    if (this.#wanted && this.#remaining > 1024 * 1024) throw new Error('metafile-size');
  }
  #body(): void {
    const count = Math.min(this.#remaining, this.#pending.length);
    if (this.#wanted) this.#parts.push(Buffer.from(this.#pending.subarray(0, count)));
    this.#remaining -= count; this.#pending = this.#pending.subarray(count);
    if (!this.#remaining && this.#wanted) this.text = Buffer.concat(this.#parts).toString('utf8');
  }
}
