import { mkdtemp, lstat, mkdir, open, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { parseUnauthorizedCapture, persistFixtureCapture, receiveCapture } from './captureTransfer';
import { MAX_CAPTURE_BYTES, MAX_CHUNK_BYTES, type Body } from './protocol';

vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof import('node:fs/promises')>();
  return { ...fs, open: vi.fn(fs.open), rename: vi.fn(fs.rename) };
});
const roots: string[] = [];
afterEach(async () => { vi.mocked(open).mockClear(); vi.mocked(rename).mockClear();
  vi.restoreAllMocks(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function root() { const r = await mkdtemp(join(tmpdir(), 'tinyvault-transfer-')); roots.push(r); return r; }
const chunk = (bytes: Buffer, offset: number, total: number): Body => ({ bytes: bytes.toString('base64url'), total: String(total), next: String(offset + bytes.length) });
it.each([0, 1, 65536, 65537, MAX_CAPTURE_BYTES])('receives exact %i bytes in bounded canonical offset order', async (size) => {
  const source = Buffer.alloc(size, 37); const offsets: string[] = [];
  const read = async (offset: string) => { offsets.push(offset); const n = Number(offset);
    return chunk(source.subarray(n, n + MAX_CHUNK_BYTES), n, size); };
  expect((await receiveCapture(read)).equals(source)).toBe(true);
  expect(offsets).toEqual(Array.from({ length: Math.max(1, Math.ceil(size / MAX_CHUNK_BYTES)) }, (_, i) => String(i * MAX_CHUNK_BYTES)));
});
it.each(['reorder', 'drop', 'duplicate', 'early-empty', 'total-change', 'oversize', 'noncanonical', 'invalid-base64'] as const)(
  'transfer refuses %s without requesting a recovery chunk', async (mode) => {
    let calls = 0;
    const read = vi.fn(async () => {
      calls++;
      if (calls === 1) return chunk(Buffer.from('abc'), 0, 9);
      const result = chunk(Buffer.from('def'), 3, 9);
      if (mode === 'reorder' || mode === 'drop') result.next = '9';
      if (mode === 'duplicate') result.next = '3';
      if (mode === 'early-empty') result.bytes = '';
      if (mode === 'total-change') result.total = '10';
      if (mode === 'oversize') result.bytes = Buffer.alloc(65537).toString('base64url');
      if (mode === 'noncanonical') result.total = '09';
      if (mode === 'invalid-base64') result.bytes = 'YWJj=';
      return result;
    });
    await expect(receiveCapture(read)).rejects.toMatchObject({ code: 'body-shape' });
    expect(read).toHaveBeenCalledTimes(2);
  },
);
it('unauthorized JSONL retains order duplicates exact Unicode route/query/body and defensive values', () => {
  const records = [{ route: '/one?q=é', body: 'a\nb' }, { route: '/two', body: '' }, { route: '/one?q=é', body: 'a\nb' }];
  const bytes = Buffer.from(records.map((r) => JSON.stringify(r) + '\n').join(''));
  const first = parseUnauthorizedCapture(bytes);
  expect(first).toEqual(records);
  (first[0] as { body: string }).body = 'changed';
  expect(parseUnauthorizedCapture(bytes)).toEqual(records);
  expect(parseUnauthorizedCapture(Buffer.alloc(0))).toEqual([]);
});
it.each(['\n', '{}\n', '[]\n', '{"route":"/","body":1}\n', '{"route":"/","body":"","x":""}\n',
  '{"route":"/","body":""}', '{"route":"/","body":"","body":""}\n', ' {"route":"/","body":""}\n',
  '{"route":"\\ud800","body":"\\udc00"}\n', '\ufeff{"route":"/","body":""}\n'])(
  'strict unauthorized JSONL rejects %j', (text) => {
    expect(() => parseUnauthorizedCapture(Buffer.from(text))).toThrow('body-shape');
  },
);
it('strict unauthorized JSONL rejects malformed UTF-8', () => {
  expect(() => parseUnauthorizedCapture(Buffer.from([0xff]))).toThrow('body-shape');
});
it.each([Buffer.alloc(0), Buffer.from('line\nbytes\u0000é')])('persists exact snapshot including empty with 0600 exclusive same-directory atomic replacement', async (bytes) => {
  const r = await root(); const path = join(r, 'fixture-captures', 'A.requests');
  await mkdir(join(r, 'fixture-captures')); await writeFile(path, 'prior');
  await persistFixtureCapture(r, 'A', bytes);
  expect(await readFile(path)).toEqual(bytes);
  expect((await lstat(path)).mode & 0o777).toBe(0o600);
  expect(await readdir(join(r, 'fixture-captures'))).toEqual(['A.requests']);
  expect(open).toHaveBeenCalledWith(expect.stringMatching(/fixture-captures\/\.A-[a-f0-9]{32}\.tmp$/), 'wx', 0o600);
  expect(rename).toHaveBeenCalledWith(vi.mocked(open).mock.calls[0][0], path);
});
it.each(['../escape', '', 'a/b', 'a\n', 'a'.repeat(129)])('refuses unsafe runId %j before creating a capture directory', async (runId) => {
  const r = await root(); await expect(persistFixtureCapture(r, runId, Buffer.alloc(0))).rejects.toMatchObject({ code: 'capture-write' });
  expect(await readdir(r)).toEqual([]);
});
it.each(['directory', 'file'])('refuses symlink %s destination without touching its target', async (kind) => {
  const r = await root(); const target = join(r, 'target'); await mkdir(target);
  await writeFile(join(target, 'A.requests'), 'unchanged');
  if (kind === 'directory') await symlink(target, join(r, 'fixture-captures'));
  else { await mkdir(join(r, 'fixture-captures')); await symlink(join(target, 'A.requests'), join(r, 'fixture-captures', 'A.requests')); }
  await expect(persistFixtureCapture(r, 'A', Buffer.from('new'))).rejects.toMatchObject({ code: 'capture-write' });
  expect(await readFile(join(target, 'A.requests'), 'utf8')).toBe('unchanged');
  expect(open).not.toHaveBeenCalled();
});
it.each(['partial', 'zero', 'rename'])('cleans temporary files after %s failure and retains the prior destination', async (mode) => {
  const r = await root(); const dir = join(r, 'fixture-captures'); await mkdir(dir); await writeFile(join(dir, 'A.requests'), 'prior');
  const realOpen = vi.mocked(open).getMockImplementation()!;
  if (mode === 'rename') vi.mocked(rename).mockRejectedValueOnce(new Error('remote detail'));
  else vi.mocked(open).mockImplementationOnce(async (...args: Parameters<typeof open>) => {
    const handle = await realOpen(...args); const write = handle.write.bind(handle);
    let writes = 0;
    handle.write = (async (buffer: Buffer, offset: number, length: number, position: number) => {
      if (mode === 'zero') return { bytesWritten: 0, buffer };
      if (++writes === 1) return write(buffer, offset, 1, position);
      throw new Error('remote detail');
    }) as typeof handle.write;
    return handle;
  });
  await expect(persistFixtureCapture(r, 'A', Buffer.from('replacement'))).rejects.toMatchObject({ code: 'capture-write', message: 'capture-write' });
  expect(await readdir(dir)).toEqual(['A.requests']);
  expect(await readFile(join(dir, 'A.requests'), 'utf8')).toBe('prior');
});

it('caller response validation refuses extra capture fields before accepting even an empty snapshot', async () => {
  await expect(receiveCapture(async () => ({ bytes: '', total: '0', next: '0', path: '/untrusted' })))
    .rejects.toMatchObject({ code: 'body-shape' });
});
