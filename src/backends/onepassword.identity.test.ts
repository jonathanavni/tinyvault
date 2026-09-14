import * as randomness from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOnePasswordBackend } from './onepassword';
import { createOnePasswordFixture } from './onepassword.testSupport';

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, randomBytes: vi.fn(actual.randomBytes) };
});

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { vi.restoreAllMocks(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function fixture() {
  const f = await createOnePasswordFixture();
  const backend = createOnePasswordBackend(f.config);
  cleanups.push(f.cleanup, () => backend.dispose());
  return { ...f, backend };
}

describe('R20 immutable injective handles and discovery snapshot', () => {
  it('shares exactly one initial discovery and one version call across four simultaneous methods', async () => {
    const f = await fixture();
    const results = await Promise.all(Array.from({ length: 4 }, () => f.backend.listItems()));
    expect(results.every((items) => items === results[0])).toBe(true);
    expect(new Set(results[0].map((item) => item.handle)).size).toBe(2);
    expect((await f.readRecords()).map((r) => r.command)).toEqual(['version', 'list']);
  });
  it.each(['empty', 'no eligible'])('freezes valid %s snapshot without retrying discovery', async (kind) => {
    const f = await fixture();
    await f.setList(kind === 'empty' ? [] : [f.recipe.list[0]]);
    const first = await f.backend.listItems();
    expect(first).toEqual([]);
    await f.setList(f.recipe.list);
    expect(await f.backend.listItems()).toBe(first);
    await expect(f.backend.resolvePolicy(f.recipe.ids.a)).rejects.toMatchObject({ kind: 'not-found' });
    expect((await f.readRecords()).map((r) => r.command)).toEqual(['version', 'list']);
  });
  it('rejects aliases, direct IDs, handle variants and undiscovered bindings before token/spawn', async () => {
    const f = await fixture();
    const [item] = await f.backend.listItems();
    const policy = await f.backend.resolvePolicy(item.handle);
    const before = (await f.readRecords()).length;
    await writeFile(f.config.tokenPath, '');
    for (const alias of [f.recipe.ids.a, `op://${f.recipe.vaultId}/${f.recipe.ids.a}/password`, item.handle.toUpperCase(), item.handle.slice(0, -1), ` ${item.handle}`]) {
      await expect(f.backend.resolvePolicy(alias)).rejects.toMatchObject({ kind: 'not-found' });
      await expect(f.backend.resolveSecret(alias, policy)).rejects.toMatchObject({ kind: 'not-found' });
    }
    expect((await f.readRecords()).length).toBe(before);
  });
  it('freezes handles, inventory and policies through title changes, reorder, archive/restore and moved IDs', async () => {
    const f = await fixture();
    const initial = await f.backend.listItems();
    const policies = await Promise.all(initial.map((item) => f.backend.resolvePolicy(item.handle)));
    const changed = structuredClone(f.recipe.list).reverse();
    changed.forEach((row) => { row.title = 'Changed'; row.urls = [{ href: 'https://new.example' }]; });
    changed.push({ ...f.recipe.list[1], id: 'z'.repeat(26) });
    await f.setList(changed);
    for (let index = 0; index < 3; index++) {
      expect(await f.backend.listItems()).toBe(initial);
      expect(await f.backend.resolvePolicy(initial[0].handle)).toBe(policies[0]);
    }
    expect((await f.readRecords()).map((r) => r.command)).toEqual(['version', 'list']);
  });
  it.each(['duplicate', 'wrong vault', 'wrong category', 'uppercase item', 'uppercase vault'])('rejects %s anywhere in LIST including unconfigured rows', async (mode) => {
    const f = await fixture();
    const rows = structuredClone(f.recipe.list);
    if (mode === 'duplicate') rows.push(structuredClone(rows[0]));
    else if (mode === 'wrong vault') rows[0].vault.id = 'z'.repeat(26);
    else if (mode === 'wrong category') rows[0].category = 'PASSWORD';
    else if (mode === 'uppercase item') rows[0].id = 'A'.repeat(26);
    else rows[0].vault.id = 'A'.repeat(26);
    await f.setList(rows);
    await expect(f.backend.listItems()).rejects.toMatchObject({ kind: 'integrity' });
  });
  it('binds token identity before authenticated spawn and latches changed then restored tokens', async () => {
    const f = await fixture();
    const [item] = await f.backend.listItems();
    const policy = await f.backend.resolvePolicy(item.handle);
    await writeFile(f.config.tokenPath, 'synthetic-replacement');
    await expect(f.backend.resolveSecret(item.handle, policy)).rejects.toMatchObject({ kind: 'locked' });
    await writeFile(f.config.tokenPath, f.token);
    expect(await f.backend.probeAvailability()).toEqual({ available: false, reason: 'not_authenticated' });
    await expect(f.backend.resolveSecret(item.handle, policy)).rejects.toMatchObject({ kind: 'locked' });
    expect(await f.backend.listItems()).toHaveLength(2);
    expect((await f.readRecords()).map((r) => r.command)).toEqual(['version', 'list']);
  });
  it('never resolves a reserved but initially archived handle, even with an otherwise valid policy', async () => {
    const f = await createOnePasswordFixture();
    vi.mocked(randomness.randomBytes).mockReturnValueOnce(Buffer.alloc(24, 7) as never);
    const backend = createOnePasswordBackend({ ...f.config, items: [f.config.items[2]] });
    cleanups.push(f.cleanup, () => backend.dispose());
    const handle = `vh_${Buffer.alloc(24, 7).toString('base64url')}`;
    expect(await backend.listItems()).toEqual([]);
    await expect(backend.resolvePolicy(handle)).rejects.toMatchObject({ kind: 'not-found' });
    await expect(backend.resolveSecret(handle, { canonicalOrigin: 'https://login.example', fieldRecipe: ['password'] }))
      .rejects.toMatchObject({ kind: 'not-found' });
    expect((await f.readRecords()).map((record) => record.command)).toEqual(['version', 'list']);
  });
  it('does not turn provider failure into a live inventory refresh or plaintext cache', async () => {
    const f = await fixture();
    const [item] = await f.backend.listItems();
    const policy = await f.backend.resolvePolicy(item.handle);
    expect((await f.backend.resolveSecret(item.handle, policy)).consume()).toBe(f.recipe.passwords[f.recipe.ids.a]);
    await f.setBehavior('detail', { exitCode: 1, stderr: 'synthetic private failure' });
    await expect(f.backend.resolveSecret(item.handle, policy)).rejects.toMatchObject({ kind: 'unavailable' });
    expect(await f.backend.listItems()).toContain(item);
    expect((await f.readRecords()).filter((r) => r.command === 'list')).toHaveLength(1);
  });
});
