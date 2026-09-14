import { chmod, mkdir, readFile, symlink, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOnePasswordBackend } from './onepassword';
import { createOnePasswordFixture } from './onepassword.testSupport';
import { readServiceToken, validateOnePasswordConfig } from './onepasswordConfig';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { vi.unstubAllEnvs(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function fixture() {
  const f = await createOnePasswordFixture();
  cleanups.push(f.cleanup);
  return f;
}

describe('closed operator configuration and safe external token file', () => {
  it('copies and deeply freezes exactly the configured identity map', async () => {
    const f = await fixture();
    const input = structuredClone(f.config) as { opPath: string; tokenPath: string; vaultId: string; items: Array<{ itemId: string; label: string }> };
    const config = validateOnePasswordConfig(input);
    expect(config).toEqual(input);
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.items)).toBe(true);
    expect(Object.isFrozen(config.items[0])).toBe(true);
    input.items[0] = { itemId: f.recipe.ids.c, label: 'Changed' };
    expect(config.items[0].itemId).toBe(f.recipe.ids.a);
  });
  it.each([
    ['extra token', (c: any) => { c.token = 'synthetic'; }],
    ['extra argv', (c: any) => { c.argv = []; }],
    ['relative op', (c: any) => { c.opPath = 'op'; }],
    ['relative token', (c: any) => { c.tokenPath = 'token'; }],
    ['uppercase vault', (c: any) => { c.vaultId = 'A'.repeat(26); }],
    ['uppercase item', (c: any) => { c.items[0].itemId = 'A'.repeat(26); }],
    ['duplicate item', (c: any) => { c.items.push({ ...c.items[0], label: 'Alias' }); }],
    ['empty items', (c: any) => { c.items = []; }],
    ['too many items', (c: any) => { c.items = Array(65).fill(c.items[0]); }],
    ['empty label', (c: any) => { c.items[0].label = ''; }],
    ['long label', (c: any) => { c.items[0].label = 'x'.repeat(129); }],
    ['control label', (c: any) => { c.items[0].label = 'a\nb'; }],
    ['item selector', (c: any) => { c.items[0].field = 'password'; }],
  ])('factory rejects %s with a fixed diagnostic before any invocation', async (_name, mutate) => {
    const f = await fixture();
    const input = structuredClone(f.config);
    mutate(input);
    expect(() => createOnePasswordBackend(input)).toThrow('Credential backend is unavailable');
    expect(await f.readRecords()).toEqual([]);
  });
  it('factory rejects even empty inherited service token without changing the parent', async () => {
    const f = await fixture();
    vi.stubEnv('OP_SERVICE_ACCOUNT_TOKEN', '');
    expect(() => createOnePasswordBackend(f.config)).toThrow('Credential backend is unavailable');
    expect(process.env.OP_SERVICE_ACCOUNT_TOKEN).toBe('');
    expect(await f.readRecords()).toEqual([]);
  });
  it.each(['', '\n'])('empty token maps locked / not_authenticated', async (value) => {
    const f = await fixture();
    await writeFile(f.config.tokenPath, value);
    const backend = createOnePasswordBackend(f.config);
    cleanups.push(() => backend.dispose());
    expect(await backend.probeAvailability()).toEqual({ available: false, reason: 'not_authenticated' });
    await expect(backend.listItems()).rejects.toMatchObject({ kind: 'locked' });
    expect(await f.readRecords()).toEqual([]);
  });
  it('missing token maps locked and an absent executable maps not_installed', async () => {
    const f = await fixture();
    await unlink(f.config.tokenPath);
    const backend = createOnePasswordBackend(f.config);
    cleanups.push(() => backend.dispose());
    expect(await backend.probeAvailability()).toEqual({ available: false, reason: 'not_authenticated' });
    await unlink(f.config.opPath);
    expect(await backend.probeAvailability()).toEqual({ available: false, reason: 'not_installed' });
  });
  it.each([' space', 'two tokens', 'trailing\n\n', 'tab\ttoken', 'return\r', 'nul\0token', 'x'.repeat(16_385)])('malformed nonempty token has unavailable mapping', async (token) => {
    const f = await fixture();
    await writeFile(f.config.tokenPath, token);
    await expect(readServiceToken(f.config.tokenPath)).rejects.toMatchObject({ kind: 'unavailable' });
  });
  it('rejects a raw UTF-8 BOM token before any version or authenticated spawn', async () => {
    const f = await fixture();
    await writeFile(f.config.tokenPath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(f.token)]));
    await expect(readServiceToken(f.config.tokenPath)).rejects.toMatchObject({ kind: 'unavailable' });
    const backend = createOnePasswordBackend(f.config);
    cleanups.push(() => backend.dispose());
    expect(await backend.probeAvailability()).toEqual({ available: false, reason: 'error' });
    await expect(backend.listItems()).rejects.toMatchObject({ kind: 'unavailable' });
    expect(await f.readRecords()).toEqual([]);
  });
  it('accepts one terminal LF and pins the canonical token fingerprint', async () => {
    const f = await fixture();
    const first = await readServiceToken(f.config.tokenPath);
    await writeFile(f.config.tokenPath, `${f.token}\n`);
    expect(await readServiceToken(f.config.tokenPath)).toEqual(first);
    expect(first.token).toBe(f.token);
    expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
  });
  it('refuses permissive mode, symlink and directory without changing operator files', async () => {
    const f = await fixture();
    const original = await readFile(f.config.tokenPath);
    await chmod(f.config.tokenPath, 0o640);
    await expect(readServiceToken(f.config.tokenPath)).rejects.toMatchObject({ kind: 'unavailable' });
    await chmod(f.config.tokenPath, 0o600);
    const link = join(f.root, 'link');
    await symlink(f.config.tokenPath, link);
    await expect(readServiceToken(link)).rejects.toMatchObject({ kind: 'unavailable' });
    const directory = join(f.root, 'directory');
    await mkdir(directory);
    await expect(readServiceToken(directory)).rejects.toMatchObject({ kind: 'unavailable' });
    expect(await readFile(f.config.tokenPath)).toEqual(original);
  });
});
