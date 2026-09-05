// Real synthetic 32-byte secrets prove each advertised encoding and each filesystem traversal leg.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { inspect } from 'node:util';
import { afterEach, expect, it, vi } from 'vitest';
import { capturePersistedRuns } from '../runner';
import { ARTIFACT_MARKER, createComposedProject } from './compose';
import { fakeProject, kindOf } from './compose.testkit';
import { scanArtifactTree, scanSpawns, scanStream, SECRET_FORMS, SecretScanner, secretScan, observeStderr } from './secretScan';

const secret = Buffer.from(Array.from({ length: 32 }, (_, i) => (i * 37 + 128) % 256));
const forms = [
  ['raw', secret], ['hex', Buffer.from(secret.toString('hex'))],
  ['buffer-inspect', Buffer.from(inspect(secret))], ['decimal-array', Buffer.from(JSON.stringify(secret))],
  ['base64url', Buffer.from(secret.toString('base64url'))],
] as const;
const disposals: (() => Promise<void>)[] = [];
afterEach(async () => { for (const dispose of disposals.splice(0)) await dispose(); });
it('test forms equal the advertised form inventory', () => expect(forms.map(([name]) => name)).toEqual(SECRET_FORMS));
it.each(forms)('finds actual bytes as %s on latin1-read surfaces', (_name, bytes) => {
  expect(secretScan(Buffer.concat([Buffer.from('prefix'), bytes, Buffer.from('suffix')]), secret)).toBe(true);
  expect(secretScan(bytes.toString('latin1'), secret)).toBe(true);
  expect(secretScan(Buffer.from('safe surface'), secret)).toBe(false);
});
it.each(forms)('stream overlap catches %s across every split', async (_name, bytes) => {
  const scanner = new SecretScanner(secret);
  try {
    for (let split = 1; split < bytes.length; split++) {
      expect(await scanStream(Readable.from([bytes.subarray(0, split), bytes.subarray(split)]), [scanner])).toBe(true);
    }
  } finally { scanner.destroy(); }
});
it('scans every actual fake-construction spawn with the real stdin-delivered secrets', async () => {
  const h = await fakeProject(vi.fn); disposals.push(h.dispose);
  const p = await createComposedProject(h.options); await p.closer.close();
  expect(h.secrets).toHaveLength(3);
  for (const bytes of h.secrets) {
    const scanner = new SecretScanner(bytes);
    expect(scanSpawns(h.spawns, scanner)).toBe(false);
    for (let i = 0; i < h.spawns.length; i++) {
      const planted = [...h.spawns];
      planted[i] = { ...planted[i], args: [...planted[i].args, bytes.toString('base64url')] };
      expect(scanSpawns(planted, scanner)).toBe(true);
      planted[i] = { ...h.spawns[i], env: { ...h.spawns[i].env, NEEDLE: inspect(bytes) } };
      expect(scanSpawns(planted, scanner)).toBe(true);
    }
    scanner.destroy();
  }
});
it.each(['manifest', 'nested', 'last'] as const)('walks %s artifact with its actual raw bytes', async (site) => {
  const h = await fakeProject(vi.fn); disposals.push(h.dispose);
  await mkdir(join(h.root, 'nested'));
  await writeFile(join(h.root, '0-manifest.json'), site === 'manifest' ? secret : 'safe');
  await writeFile(join(h.root, 'nested', 'artifact'), site === 'nested' ? secret : 'safe');
  await writeFile(join(h.root, 'z-last'), site === 'last' ? secret : 'safe');
  const scanner = new SecretScanner(secret);
  expect(await scanArtifactTree(h.root, [scanner])).toBe(true); scanner.destroy();
});
it('closer writes a dedicated nested marker last and verifies it with the artifact scanner', async () => {
  const h = await fakeProject(vi.fn); disposals.push(h.dispose);
  const p = await createComposedProject(h.options); await p.closer.close();
  expect(await readFile(join(h.root, 'composed-scan', 'close.marker'), 'utf8')).toBe(ARTIFACT_MARKER);
  for (const secret of h.secrets) {
    const scanner = new SecretScanner(secret);
    expect(await scanArtifactTree(h.root, [scanner])).toBe(false); scanner.destroy();
  }
  const marker = new SecretScanner(Buffer.from(ARTIFACT_MARKER));
  expect(await scanArtifactTree(h.root, [marker])).toBe(true); marker.destroy();
});
it('artifact traversal omission fails the closer marker positive control', async () => {
  const h = await fakeProject(vi.fn); disposals.push(h.dispose);
  h.options.scanners = { artifacts: async () => false };
  const p = await createComposedProject(h.options);
  await expect(p.closer.close()).rejects.toMatchObject({ code: 'scan-failed' });
});
it('scans shutdown-only artifact leakage after stop', async () => {
  const h = await fakeProject(vi.fn); disposals.push(h.dispose);
  const p = await createComposedProject(h.options);
  const run = h.runner.run.getMockImplementation()!;
  h.runner.run.mockImplementation(async (spawn) => {
    if (spawn.args.includes('stop')) await writeFile(join(h.root, 'shutdown'), h.secrets[0]);
    return run(spawn);
  });
  await expect(p.closer.close()).rejects.toMatchObject({ code: 'secret-exposed' });
  expect(h.spawns.at(-1)!.args).toContain('down');
});
it('stderr is scanned before a bounded ring can discard an early leak', async () => {
  const scanner = new SecretScanner(secret); const stream = Readable.from([secret, Buffer.alloc(100000, 1)]);
  const observer = observeStderr(stream, [scanner], 64);
  await new Promise<void>((resolve) => stream.on('end', resolve));
  expect(observer.exposed()).toBe(true); expect(observer.snapshot()).toHaveLength(64);
  expect(observer.snapshot().includes(secret)).toBe(false); observer.destroy(); scanner.destroy();
});
it('public capture scans artifacts outside fixture-captures and preserves the construction cause', async () => {
  const h = await fakeProject(vi.fn); disposals.push(h.dispose);
  const fallback = vi.fn();
  await expect(capturePersistedRuns(h.root, 1, undefined, { architecture: 'composed',
    dockerPreflight: async () => h.options.pin, dockerRunner: h.runner,
    launchChromium: async () => ({ close: vi.fn() }) as never, startFixtures: fallback,
    probeOrigin: async () => { await writeFile(join(h.root, 'outside-fixture-captures'), h.secrets[0]); return false; },
  })).rejects.toMatchObject({ code: 'origin-unreachable', teardownCode: 'secret-exposed' });
  expect(fallback).not.toHaveBeenCalled();
});
it.each(['export-stderr', 'down-output', 'after-down'] as const)(
  'closer scans actual bootstrap bytes on %s and still runs down once', async (site) => {
    const h = await fakeProject(vi.fn); disposals.push(h.dispose);
    const p = await createComposedProject(h.options);
    const run = h.runner.run.getMockImplementation()!;
    const spawn = h.runner.spawnLongLived.getMockImplementation()!;
    h.runner.run.mockImplementation(async (description) => {
      const result = await run(description); const kind = kindOf(description);
      if (site === 'down-output' && kind === 'compose-down') result.stdout = JSON.stringify(h.secrets[0]);
      if (site === 'after-down' && kind === 'compose-down') await writeFile(join(h.root, 'last'), h.secrets[0]);
      return result;
    });
    h.runner.spawnLongLived.mockImplementation((description) => {
      const handle = spawn(description);
      if (kindOf(description) === 'export' && site === 'export-stderr') handle.stderr.push(h.secrets[0]);
      return handle;
    });
    await expect(p.closer.close()).rejects.toMatchObject({ code: 'secret-exposed' });
    expect(h.spawns.filter((s) => kindOf(s) === 'compose-down')).toHaveLength(1);
    expect(h.spawns.filter((s) => kindOf(s) === 'export')).toHaveLength(3);
  },
);
it('closer invokes the injected spawn scanner on its complete construction and teardown inventory', async () => {
  const h = await fakeProject(vi.fn); disposals.push(h.dispose);
  const scanned: string[][] = [];
  h.options.scanners = { spawns: (spawns) => { scanned.push(spawns.map(kindOf)); return true; } };
  const p = await createComposedProject(h.options);
  await expect(p.closer.close()).rejects.toMatchObject({ code: 'secret-exposed' });
  expect(scanned.at(-1)).toEqual(h.spawns.map(kindOf));
});

it.each(['logs', 'export', 'exec-stderr'] as const)('closer scans real secret bytes from %s', async (surface) => {
  const h = await fakeProject(vi.fn); disposals.push(h.dispose);
  const p = await createComposedProject(h.options);
  if (surface === 'logs') {
    const run = h.runner.run.getMockImplementation()!;
    h.runner.run.mockImplementation(async (spawn) => kindOf(spawn) === 'logs'
      ? { stdout: '', stderr: h.secrets[0].toString('hex'), exitCode: 0 } : run(spawn));
  } else if (surface === 'export') {
    const spawn = h.runner.spawnLongLived.getMockImplementation()!;
    h.runner.spawnLongLived.mockImplementation((description) => kindOf(description) === 'export' ? {
      stdin: new PassThrough(), stdout: Readable.from([h.secrets[0].subarray(0, 9), h.secrets[0].subarray(9)]),
      stderr: Readable.from([]), kill: vi.fn(), exited: Promise.resolve(0),
    } : spawn(description));
  } else (h.handles[0].stderr as PassThrough).write(inspect(h.secrets[0]));
  await expect(p.closer.close()).rejects.toMatchObject({ code: 'secret-exposed' });
  expect(h.spawns.some((spawn) => spawn.args.includes('down'))).toBe(true);
});
