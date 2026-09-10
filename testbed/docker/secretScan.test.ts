// Real synthetic 32-byte secrets prove each advertised encoding and each filesystem traversal leg.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { inspect } from 'node:util';
import { afterEach, expect, it, vi } from 'vitest';
import { capturePersistedRuns } from '../runner';
import { ARTIFACT_MARKER, createComposedProject, preferConstructionCode } from './compose';
import { ComposedConstructionError } from './exec';
import { startComposedFixtureSet } from './composedFixtures';
import topology from './topology.json';
import { fakeProject, kindOf } from './compose.testkit';
import { scanArtifactTree, scanArtifactsWithControls, scanSpawns, scanStream, scanStreamWithControls,
  scanSurface, SECRET_FORMS, SecretScanner, secretScan, observeStderr } from './secretScan';

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
  expect(h.secrets).toHaveLength(5);
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
it('blind artifacts scanner cannot satisfy the shared-path control', async () => {
  const h = await fakeProject(vi.fn); disposals.push(h.dispose);
  h.options.scanners = { artifacts: async (root, secrets, controls = []) => secrets.length
    ? { exposed: false, controls: controls.map(() => false) } : scanArtifactsWithControls(root, secrets, controls) };
  const p = await createComposedProject(h.options);
  await expect(p.closer.close()).rejects.toMatchObject({ code: 'scan-control-missing', surface: 'artifacts' });
});
it('draining export scanner cannot satisfy the shared-path control', async () => {
  const h = await fakeProject(vi.fn); disposals.push(h.dispose);
  h.options.scanners = { stream: async (stream, _secrets, controls = []) => {
    for await (const _chunk of stream) { /* Deliberately blind despite draining every byte. */ }
    return { exposed: false, controls: controls.map(() => false) };
  } };
  const p = await createComposedProject(h.options);
  await expect(p.closer.close()).rejects.toMatchObject({ code: 'scan-control-missing', surface: 'export' });
});
it.each(['logs', 'history'] as const)('blind %s scanner cannot satisfy the shared-path control', async (surface) => {
  const h = await fakeProject(vi.fn); disposals.push(h.dispose);
  const marker = topology.markers[surface === 'logs' ? 'BOOT_MARKER' : 'HISTORY_MARKER'];
  h.options.scanners = { surface: (bytes, secrets, controls = []) => controls.some((control) => control.scan(marker))
    ? { exposed: false, controls: controls.map(() => false) } : scanSurface(bytes, secrets, controls) };
  const p = await createComposedProject(h.options);
  await expect(p.closer.close()).rejects.toMatchObject({ code: 'scan-control-missing', surface });
});
it('draining exec-stderr scanner cannot satisfy the shared-path control', async () => {
  const h = await fakeProject(vi.fn); disposals.push(h.dispose);
  h.options.scanners = { stderr: (stream, _secrets, limit, controls = []) => {
    const observer = observeStderr(stream, [], limit);
    return { ...observer, result: () => ({ exposed: false, controls: controls.map(() => false) }) };
  } };
  const p = await createComposedProject(h.options);
  await expect(p.closer.close()).rejects.toMatchObject({ code: 'scan-control-missing', surface: 'exec-stderr' });
});
it.each(['logs', 'export', 'exec-stderr', 'history', 'artifacts'] as const)(
  '%s shared-path marker plus planted secret is secret-exposed', async (surface) => {
    const h = await fakeProject(vi.fn); disposals.push(h.dispose);
    const p = await createComposedProject(h.options);
    const run = h.runner.run.getMockImplementation()!;
    h.runner.run.mockImplementation(async (description) => {
      const result = await run(description);
      if (surface === 'logs' && kindOf(description) === 'logs') result.stderr += h.secrets[0].toString('hex');
      if (surface === 'history' && kindOf(description) === 'image-history') {
        result.stdout += JSON.stringify({ CreatedBy: h.secrets[0].toString('hex') }) + '\n';
      }
      if (surface === 'artifacts' && kindOf(description) === 'compose-down') await writeFile(join(h.root, 'planted'), h.secrets[0]);
      return result;
    });
    const spawn = h.runner.spawnLongLived.getMockImplementation()!;
    h.runner.spawnLongLived.mockImplementation((description) => kindOf(description) === 'export' && surface === 'export' ? {
      stdin: new PassThrough(), stdout: Readable.from([topology.markers.EXPORT_MARKER, h.secrets[0]]),
      stderr: Readable.from([]), kill: vi.fn(), exited: Promise.resolve(0),
    } : spawn(description));
    if (surface === 'exec-stderr') (h.handles[0].stderr as PassThrough).write(h.secrets[0]);
    await expect(p.closer.close()).rejects.toMatchObject({ code: 'secret-exposed' });
  },
);
it.each([true, false])('shared stream pass keeps separate hits with secret first = %s', async (secretFirst) => {
  const scanner = new SecretScanner(secret); const marker = Buffer.from(topology.markers.EXPORT_MARKER);
  const control = new SecretScanner(marker);
  try {
    const parts = secretFirst ? [secret, marker] : [marker, secret];
    const chunks = parts.flatMap((bytes) => [bytes.subarray(0, 7), bytes.subarray(7)]);
    expect(await scanStreamWithControls(Readable.from(chunks), [scanner], [control]))
      .toEqual({ exposed: true, controls: [true] });
    expect(await scanStreamWithControls(Readable.from([marker]), [scanner], [control]))
      .toEqual({ exposed: false, controls: [true] });
    expect(await scanStreamWithControls(Readable.from([secret]), [scanner], [control]))
      .toEqual({ exposed: true, controls: [false] });
  } finally { scanner.destroy(); control.destroy(); }
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
it('stderr retains the early window and fails sticky on overflow', async () => {
  const scanner = new SecretScanner(secret); const stream = Readable.from([secret, Buffer.alloc(100000, 1)]);
  const observer = observeStderr(stream, [scanner], 64);
  await new Promise<void>((resolve) => stream.on('end', resolve));
  expect(observer.exposed()).toBe(true); expect(observer.snapshot()).toHaveLength(64);
  expect(observer.snapshot().includes(secret)).toBe(true); expect(observer.failed()).toBe(true); observer.destroy(); scanner.destroy();
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
    expect(h.spawns.filter((s) => kindOf(s) === 'export')).toHaveLength(5);
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

it.each(['logs', 'logs-stdout', 'export', 'exec-stderr'] as const)('closer scans real secret bytes from %s', async (surface) => {
  const h = await fakeProject(vi.fn); disposals.push(h.dispose);
  const p = await createComposedProject(h.options);
  if (surface === 'logs') {
    const run = h.runner.run.getMockImplementation()!;
    h.runner.run.mockImplementation(async (spawn) => kindOf(spawn) === 'logs'
      ? { stdout: '', stderr: h.secrets[0].toString('hex'), exitCode: 0 } : run(spawn));
  } else if (surface === 'logs-stdout') {
    // The fixture's stdout also reaches `docker logs`; markers stay intact on stderr so only the stdout scan can catch it.
    const run = h.runner.run.getMockImplementation()!;
    h.runner.run.mockImplementation(async (spawn) => {
      const result = await run(spawn);
      return kindOf(spawn) === 'logs' ? { ...result, stdout: `${result.stdout}${h.secrets[0].toString('hex')}` } : result;
    });
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

// Each missing marker must fail at its own closer surface through the secret-scanning pass.
it.each([
  ['BOOT_MARKER', 'logs'], ['SHUTDOWN_MARKER', 'logs'],
  ['EXPORT_MARKER', 'export'], ['BRIDGE_MARKER', 'exec-stderr'],
] as const)('missing %s rejects close on %s', async (omitMarker, surface) => {
  const h = await fakeProject(vi.fn, { omitMarker }); disposals.push(h.dispose);
  const p = await createComposedProject(h.options);
  await expect(p.closer.close()).rejects.toMatchObject({ code: 'scan-control-missing', surface });
  expect(h.spawns.filter((s) => kindOf(s) === 'compose-down')).toHaveLength(1);
});
it('exec window overflow fails close despite all positive controls', async () => {
  const h = await fakeProject(vi.fn); disposals.push(h.dispose);
  const p = await createComposedProject(h.options);
  (h.handles[0].stderr as PassThrough).write(Buffer.alloc(100000, 1));
  await expect(p.closer.close()).rejects.toMatchObject({ code: 'scan-failed' });
});
it.each(['before-down', 'after-down'] as const)('secret-exposed dominates compose-stop on artifacts %s', async (when) => {
  const h = await fakeProject(vi.fn, { result: (kind) => kind === 'compose-stop'
    ? { exitCode: 1, stdout: '', stderr: '' } : undefined }); disposals.push(h.dispose);
  const p = await createComposedProject(h.options);
  const run = h.runner.run.getMockImplementation()!;
  h.runner.run.mockImplementation(async (spawn) => {
    if (kindOf(spawn) === (when === 'before-down' ? 'compose-stop' : 'compose-down')) {
      await writeFile(join(h.root, 'planted'), h.secrets[0]);
    }
    return run(spawn);
  });
  await expect(p.closer.close()).rejects.toMatchObject({ code: 'secret-exposed' });
  expect(h.spawns.filter((s) => kindOf(s) === 'compose-down')).toHaveLength(1);
});
it.each(['BRIDGE_MARKER', undefined] as const)('exec-stderr secret dominates early history-parse (omitted %s)', async (omitMarker) => {
  const h = await fakeProject(vi.fn, { omitMarker, result: (kind) => kind === 'image-history'
    ? { exitCode: 0, stdout: 'not-json', stderr: '' } : undefined }); disposals.push(h.dispose);
  const p = await createComposedProject(h.options);
  (h.handles[0].stderr as PassThrough).write(h.secrets[0]);
  await expect(p.closer.close()).rejects.toMatchObject({ code: 'secret-exposed' });
});
it('scan-control-missing dominates both compose-stop and history-parse', async () => {
  const h = await fakeProject(vi.fn, { omitMarker: 'EXPORT_MARKER', result: (kind) =>
    kind === 'compose-stop' ? { exitCode: 1, stdout: '', stderr: '' } : kind === 'image-history'
      ? { exitCode: 0, stdout: 'not-json', stderr: '' } : undefined }); disposals.push(h.dispose);
  const p = await createComposedProject(h.options);
  await expect(p.closer.close()).rejects.toMatchObject({ code: 'scan-control-missing', surface: 'export' });
});

it.each(['BOOT_MARKER', 'SHUTDOWN_MARKER'] as const)('logs control %s on stdout only is missing', async (marker) => {
  const h = await fakeProject(vi.fn, { result: (kind) => kind === 'logs' ? {
    stdout: topology.markers[marker], stderr: topology.markers[marker === 'BOOT_MARKER' ? 'SHUTDOWN_MARKER' : 'BOOT_MARKER'], exitCode: 0,
  } : undefined }); disposals.push(h.dispose);
  const p = await createComposedProject(h.options);
  await expect(p.closer.close()).rejects.toMatchObject({ code: 'scan-control-missing', surface: 'logs' });
});
it('export control is observed across chunks on stdout, never on stderr alone', async () => {
  for (const onStdout of [true, false]) {
    const h = await fakeProject(vi.fn); disposals.push(h.dispose);
    const p = await createComposedProject(h.options);
    const spawn = h.runner.spawnLongLived.getMockImplementation()!;
    const marker = Buffer.from(topology.markers.EXPORT_MARKER);
    h.runner.spawnLongLived.mockImplementation((description) => kindOf(description) === 'export' ? {
      stdin: new PassThrough(), stdout: Readable.from(onStdout ? [marker.subarray(0, 7), marker.subarray(7)] : ['safe tar']),
      stderr: Readable.from(onStdout ? [] : [marker]), kill: vi.fn(), exited: Promise.resolve(0),
    } : spawn(description));
    if (onStdout) await expect(p.closer.close()).resolves.toBeUndefined();
    else await expect(p.closer.close()).rejects.toMatchObject({ code: 'scan-control-missing', surface: 'export' });
  }
});
it.each(['project', 'fixture-set'] as const)('%s preserves dominant teardown codes and first operational failure', async (entry) => {
  for (const [prior, next, expected] of [
    ['compose-down', 'secret-exposed', 'secret-exposed'],
    ['compose-down', 'scan-control-missing', 'scan-control-missing'],
    ['secret-exposed', 'scan-control-missing', 'secret-exposed'],
    ['compose-stop', 'compose-down', 'compose-stop'],
  ] as const) {
    const h = await fakeProject(vi.fn, { omitMarker: next === 'scan-control-missing' ? 'EXPORT_MARKER' : undefined,
      result: (kind) => kind === 'compose-down' && next === 'compose-down' ? { exitCode: 1, stdout: '', stderr: '' } : undefined });
    disposals.push(h.dispose);
    const cause = new ComposedConstructionError('inspect-shape'); cause.teardownCode = prior;
    const plant = async () => { if (next === 'secret-exposed') await writeFile(join(h.root, 'planted'), h.secrets[0]); };
    if (entry === 'project') {
      const run = h.runner.run.getMockImplementation()!;
      h.runner.run.mockImplementation(async (spawn) => {
        if (kindOf(spawn) === 'inspect' && h.secrets.length === 1) { await plant(); throw cause; }
        return run(spawn);
      });
      await expect(createComposedProject(h.options)).rejects.toBe(cause);
    } else {
      h.options.probeOrigin = async () => { await plant(); return true; };
      let reads = 0;
      await expect(startComposedFixtureSet({ ...h.options, get fetch(): typeof fetch | undefined {
        if (++reads === 1) return undefined; // Context copies options before constructing transports.
        throw cause;
      } })).rejects.toBe(cause);
    }
    expect(cause.teardownCode).toBe(expected);
    expect(h.spawns.filter((s) => kindOf(s) === 'compose-down')).toHaveLength(1);
  }
});

// The two security codes are ranked against each other, not only against operational codes: a missing control on one
// surface must never relabel a real exposure found on a later one.
it('secret-exposed outranks scan-control-missing in both orders', () => {
  expect(preferConstructionCode('scan-control-missing', 'secret-exposed')).toBe('secret-exposed');
  expect(preferConstructionCode('secret-exposed', 'scan-control-missing')).toBe('secret-exposed');
  expect(preferConstructionCode('compose-stop', 'scan-control-missing')).toBe('scan-control-missing');
});

it('live stderr scan preserves secret precedence for a known token beyond the retained bound', async () => {
  const scanner = new SecretScanner(secret); const stream = new PassThrough();
  const observer = observeStderr(stream, [scanner], 64);
  stream.write(Buffer.alloc(64, 1)); stream.write(secret.subarray(0, 9)); stream.write(secret.subarray(9));
  expect(observer.failed()).toBe(true); expect(observer.result().exposed).toBe(true);
  observer.destroy(); scanner.destroy(); stream.destroy();
});
