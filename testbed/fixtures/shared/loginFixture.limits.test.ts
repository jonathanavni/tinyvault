import { mkdtemp, rm, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Server } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import { startLookalikeOriginFixture } from '../lookalike-origin';
import { startLoginFixture } from './loginFixture';
import type { FixtureTransport } from '../transport';

vi.mock('node:fs/promises', async (original) => ({
  ...await original<typeof import('node:fs/promises')>(), appendFile: vi.fn(async () => {}),
}));
const roots: string[] = []; const fixtures: FixtureTransport[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const fixture of fixtures.splice(0)) await fixture.close().catch(() => {});
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  vi.mocked(appendFile).mockReset().mockResolvedValue(undefined);
});
const MiB = 1024 * 1024;
const setup = (runId: string) => ({ runId, scenarioId: 'test', nonce: 'nonce', canaryId: 'canary', canary: 'secret' });
const body = (runId: string) => {
  const prefix = `runId=${runId}&username=fixture-user&password=secret&padding=`;
  return prefix + 'x'.repeat(MiB - 1 - prefix.length); // Each authorized JSON-free record, including LF, is exactly 1 MiB.
};
async function start(lookalike = false) {
  vi.spyOn(Server.prototype, 'listen').mockImplementation(function (this: Server) {
    queueMicrotask(() => this.emit('error', Object.assign(new Error('listen'), { code: 'EPERM' }))); return this;
  });
  const root = await mkdtemp(join(tmpdir(), 'tv-limits-')); roots.push(root);
  const fixture = lookalike ? await startLookalikeOriginFixture(root) : await startLoginFixture(root, { fixtureId: 'benign-login', fixtureVersion: '2', pages: { '/': 'page' }, routes: {} });
  fixtures.push(fixture); return fixture;
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

it('authorized stream independently accepts exactly 8 MiB and rejects the next byte before writing; failure is terminal through finalize and close', async () => {
  const fixture = await start(); await fixture.registerRun(setup('A'));
  for (let i = 0; i < 8; i++) expect(await fixture.submitLogin(body('A'))).toBe(i === 0 ? 303 : 409);
  expect(vi.mocked(appendFile)).toHaveBeenCalledTimes(8);
  await expect(fixture.submitLogin(body('A'))).rejects.toMatchObject({ code: 'control-limit' });
  expect(vi.mocked(appendFile)).toHaveBeenCalledTimes(8);
  await expect(fixture.finalizeRun('A')).rejects.toMatchObject({ code: 'control-limit' });
  await expect(fixture.takeReceipt('A')).rejects.toMatchObject({ code: 'control-limit' });
  await expect(fixture.close()).rejects.toMatchObject({ code: 'control-limit' });
});

it('unauthorized UTF8 JSONL stream has its own independent 8 MiB bound', async () => {
  const fixture = await start(); await fixture.registerRun(setup('A'));
  const wrong = 'runId=A&password=bad&padding=' + 'é'.repeat(250000);
  const recordBytes = Buffer.byteLength(JSON.stringify({ route: '/login', body: wrong }) + '\n');
  const accepted = Math.floor(8 * MiB / recordBytes);
  for (let i = 0; i < accepted; i++) expect(await fixture.submitLogin(wrong)).toBe(401);
  expect(vi.mocked(appendFile)).toHaveBeenCalledTimes(accepted);
  await expect(fixture.submitLogin(wrong)).rejects.toMatchObject({ code: 'control-limit' });
  expect(vi.mocked(appendFile)).toHaveBeenCalledTimes(accepted);
  await expect(fixture.finalizeRun('A')).rejects.toMatchObject({ code: 'control-limit' });
});

it('aggregate exhaustion is independent of stream exhaustion and includes authorized plus unauthorized payload across runs', async () => {
  const fixture = await start();
  // Nine runs, each stream <=4 MiB: no individual stream approaches its 8 MiB bound.
  let retained = 0; let count = 0;
  for (let index = 0; index < 9; index++) {
    const runId = `run-${index}`; await fixture.registerRun(setup(runId));
    const wrong = `runId=${runId}&password=bad&padding=` + 'y'.repeat(900000);
    for (const value of [body(runId), body(runId), body(runId), body(runId), wrong, wrong, wrong, wrong]) {
      const bytes = value === wrong ? Buffer.byteLength(JSON.stringify({ route: '/login', body: value }) + '\n') : MiB;
      if (retained + bytes > 64 * MiB) {
        await expect(fixture.submitLogin(value)).rejects.toMatchObject({ code: 'control-limit' });
        expect(vi.mocked(appendFile)).toHaveBeenCalledTimes(count);
        await expect(fixture.finalizeRun('run-0')).rejects.toMatchObject({ code: 'control-limit' });
        await expect(fixture.close()).rejects.toMatchObject({ code: 'control-limit' });
        return;
      }
      expect([303, 409, 401]).toContain(await fixture.submitLogin(value)); retained += bytes; count++;
    }
    await fixture.finalizeRun(runId);
  }
  throw new Error('Aggregate exhaustion was never exercised');
});

it('pending writes reserve the budget before any filesystem completion and drain propagates the terminal overflow', async () => {
  const fixture = await start(); await fixture.registerRun(setup('A'));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  vi.mocked(appendFile).mockImplementation(async () => gate);
  const pending = Array.from({ length: 8 }, () => fixture.submitLogin(body('A')).catch((error: unknown) => error));
  await tick(); expect(vi.mocked(appendFile)).toHaveBeenCalledTimes(1); // The stream's other seven writes are queued.
  let refusal: unknown;
  const overflow = fixture.submitLogin(body('A')).catch((error: unknown) => { refusal = error; });
  await tick();
  try { expect(refusal).toMatchObject({ code: 'control-limit' }); }
  finally { release(); await overflow; await Promise.all(pending); }
  await expect(fixture.finalizeRun('A')).rejects.toMatchObject({ code: 'control-limit' });
  await expect(fixture.close()).rejects.toMatchObject({ code: 'control-limit' });
});

it('filesystem append failure never becomes a successful dropped capture or receipt, and propagates through close', async () => {
  const fixture = await start(); await fixture.registerRun(setup('A'));
  vi.mocked(appendFile).mockRejectedValueOnce(new Error('private diagnostic must not escape'));
  await expect(fixture.submitLogin(body('A'))).rejects.toMatchObject({ code: 'control-limit', message: 'control-limit' });
  await expect(fixture.takeReceipt('A')).rejects.toMatchObject({ code: 'control-limit' });
  await expect(fixture.finalizeRun('A')).rejects.toMatchObject({ code: 'control-limit' });
  await expect(fixture.close()).rejects.toMatchObject({ code: 'control-limit' });
});

it.each([false, true])('close rejects the second admission synchronously while preserving pre-close success (lookalike=%s)', async (lookalike) => {
  const fixture = await start(lookalike); await fixture.registerRun(setup('A')); await fixture.registerRun(setup('B'));
  let releaseA!: () => void; let rejectB: (error: Error) => void = () => {};
  const gateA = new Promise<void>((resolve) => { releaseA = resolve; });
  vi.mocked(appendFile).mockImplementation(async (path) => {
    if (String(path).endsWith('/A.requests')) return gateA;
    return new Promise<void>((_, reject) => { rejectB = reject; });
  });
  // Both direct entry and close execute before the admitted body's processing continuation.
  const accepted = fixture.submitLogin(body('A')).catch((error: unknown) => error);
  let closeResult: unknown;
  const close = fixture.close().then(() => { closeResult = 'closed'; }, (error: unknown) => { closeResult = error; });
  let lateResult: unknown;
  const late = fixture.submitLogin(body('B')).then((status) => { lateResult = status; }, (error: unknown) => { lateResult = error; });
  await tick();
  try {
    expect(lateResult).toMatchObject({ code: 'run-state' });
    expect(appendFile).toHaveBeenCalledTimes(1);
    expect(closeResult).toBeUndefined();
  } finally {
    releaseA(); await tick(); rejectB(new Error('late append failed'));
    await late; await close;
  }
  expect(await accepted).toBe(303);
  expect(closeResult).toBe('closed');
});

it('close waits for both accepted writes and propagates a later pending I/O failure', async () => {
  const fixture = await start(); await fixture.registerRun(setup('A')); await fixture.registerRun(setup('B'));
  let releaseA!: () => void; let rejectB!: (error: Error) => void;
  const gateA = new Promise<void>((resolve) => { releaseA = resolve; });
  const gateB = new Promise<void>((_, reject) => { rejectB = reject; });
  void gateB.catch(() => {}); // A deletion mutant may refuse the work before it reaches the mocked writer.
  vi.mocked(appendFile).mockImplementation(async (path) => String(path).endsWith('/A.requests') ? gateA : gateB);
  const acceptedA = fixture.submitLogin(body('A')).catch((error: unknown) => error);
  const acceptedB = fixture.submitLogin(body('B')).catch((error: unknown) => error);
  let closeResult: unknown;
  const close = fixture.close().then(() => { closeResult = 'closed'; }, (error: unknown) => { closeResult = error; });
  await tick();
  releaseA();
  try {
    expect(await acceptedA).toBe(303);
    expect(await fixture.takeReceipt('A')).toBeTypeOf('string');
    expect(appendFile).toHaveBeenCalledTimes(2);
    await tick(); expect(closeResult).toBeUndefined();
  } finally { rejectB(new Error('accepted pending write failed')); }
  expect(await acceptedB).toMatchObject({ code: 'control-limit' });
  await close; expect(closeResult).toMatchObject({ code: 'control-limit' });
  await expect(fixture.close()).rejects.toMatchObject({ code: 'control-limit' });
});
