import { launchChromium } from '../browser/playwright';
import { afterEach, describe, expect, it } from 'vitest';
import { createSupervisedHost } from '../supervisor/host';
import { createOnePasswordBackend } from './onepassword';
import { createHttpFixture, createOnePasswordFixture } from './onepassword.testSupport';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function fixture() {
  const f = await createOnePasswordFixture();
  const backend = createOnePasswordBackend(f.config);
  cleanups.push(f.cleanup, () => backend.dispose());
  return { ...f, backend };
}

describe('T2 canonical website origins', () => {
  it.each([
    'login.example', 'ftp://login.example', 'https://user@login.example/',
    'https://login.example\\@evil.example/', 'https://login.example/\npath',
    'https://127.1/', 'https://0x7f000001/', 'https://0177.0.0.1/',
    'https://login.example:0443/', 'https://login.example:65536/',
    'https://login.example./', 'https://%6cogin.example/', 'https://K.example/',
    'https://bücher.example/', 'https://例え.example/',
  ])('omits unsuitable full website %j without authority repair', async (href) => {
    const f = await fixture();
    const row = structuredClone(f.recipe.list[1]);
    row.urls = [{ href }];
    await f.setList([row]);
    expect(await f.backend.listItems()).toEqual([]);
  });
  it('rejects mixed origins even when first URL is primary, and accepts equivalent paths/order', async () => {
    const f = await fixture();
    const row = structuredClone(f.recipe.list[1]);
    row.urls = [{ href: 'https://login.example/a', primary: true }, { href: 'https://evil.example/b' }];
    await f.setList([row]);
    expect(await f.backend.listItems()).toEqual([]);
    const other = createOnePasswordBackend(f.config);
    cleanups.push(() => other.dispose());
    row.urls = [{ href: 'HTTPS://LOGIN.EXAMPLE:443/a?x=1#fragment' }, { href: 'https://login.example/b' }];
    await f.setList([row]);
    const [item] = await other.listItems();
    expect(await other.resolvePolicy(item.handle)).toEqual({ canonicalOrigin: 'https://login.example', fieldRecipe: ['password'] });
  });
  it('rejects non-ASCII authority but preserves Unicode URL paths', async () => {
    const f = await fixture();
    const row = structuredClone(f.recipe.list[1]);
    row.urls = [{ href: 'https://login.example/例え?q=é#節' }];
    await f.setList([row]);
    const [item] = await f.backend.listItems();
    expect(await f.backend.resolvePolicy(item.handle)).toEqual({ canonicalOrigin: 'https://login.example', fieldRecipe: ['password'] });
    const detail = structuredClone(f.recipe.details[f.recipe.ids.a]);
    detail.urls[0].href = 'https://K.example/';
    await f.setDetail(f.recipe.ids.a, detail);
    await expect(f.backend.resolveSecret(item.handle, await f.backend.resolvePolicy(item.handle))).rejects.toMatchObject({ kind: 'integrity' });
  });
  it('validates unconfigured structure but ignores its URL suitability', async () => {
    const f = await fixture();
    const extra = structuredClone(f.recipe.list[1]);
    extra.id = 'z'.repeat(26);
    extra.urls = [{ href: 'ftp://unconfigured.example' }];
    await f.setList([...f.recipe.list, extra]);
    expect(await f.backend.listItems()).toHaveLength(2);
  });
});

describe('T4 current identity/policy and D8 eligibility', () => {
  it.each([undefined, 'ACTIVE', 'ARCHIVED'])('accepts eligible detail state %s and same-ID rotation', async (state) => {
    const f = await fixture();
    const [item] = await f.backend.listItems();
    const policy = await f.backend.resolvePolicy(item.handle);
    const detail = structuredClone(f.recipe.details[f.recipe.ids.a]);
    if (state === undefined) delete detail.state; else detail.state = state;
    detail.fields[1].value = 'Synthetic rotated password';
    detail.version = 93;
    await f.setDetail(f.recipe.ids.a, detail);
    await expect(f.backend.resolveSecret(item.handle, policy).then((secret) => secret.consume())).resolves.toBe('Synthetic rotated password');
    expect(await f.backend.listItems()).toContain(item);
  });
  it.each(['UNKNOWN', null, 0, {}])('rejects malformed present detail state %j', async (state) => {
    const f = await fixture();
    const [item] = await f.backend.listItems();
    const policy = await f.backend.resolvePolicy(item.handle);
    const detail = structuredClone(f.recipe.details[f.recipe.ids.a]);
    detail.state = state;
    await f.setDetail(f.recipe.ids.a, detail);
    await expect(f.backend.resolveSecret(item.handle, policy)).rejects.toMatchObject({ kind: 'integrity' });
  });
  it.each(['origin', 'id', 'vault', 'category', 'uppercase id', 'uppercase vault'])('rejects current %s drift', async (mode) => {
    const f = await fixture();
    const [item] = await f.backend.listItems();
    const policy = await f.backend.resolvePolicy(item.handle);
    const detail = structuredClone(f.recipe.details[f.recipe.ids.a]);
    if (mode === 'origin') detail.urls[0].href = 'https://changed.example';
    else if (mode === 'id') detail.id = f.recipe.ids.b;
    else if (mode === 'vault') detail.vault.id = 'z'.repeat(26);
    else if (mode === 'category') detail.category = 'PASSWORD';
    else if (mode === 'uppercase id') detail.id = 'A'.repeat(26);
    else detail.vault.id = 'A'.repeat(26);
    await f.setDetail(f.recipe.ids.a, detail);
    await expect(f.backend.resolveSecret(item.handle, policy)).rejects.toMatchObject({ kind: 'integrity' });
  });
  it('rejects mismatched authorized policy before token or GET and rejects initially archived direct ID', async () => {
    const f = await fixture();
    const [item] = await f.backend.listItems();
    const before = (await f.readRecords()).length;
    await expect(f.backend.resolveSecret(item.handle, { canonicalOrigin: 'https://wrong.example', fieldRecipe: ['password'] })).rejects.toMatchObject({ kind: 'integrity' });
    await expect(f.backend.resolveSecret(item.handle, { canonicalOrigin: 'https://login.example', fieldRecipe: ['username'] })).rejects.toMatchObject({ kind: 'integrity' });
    await expect(f.backend.resolvePolicy(f.recipe.ids.c)).rejects.toMatchObject({ kind: 'not-found' });
    expect((await f.readRecords()).length).toBe(before);
  });
});

describe('T4/T5 real host, backend and browser transport', () => {
  it('pins policy denial, same-ID rotation, archive/restore budget stability and surrogate fidelity through actual assignment', async () => {
    const http = await createHttpFixture();
    cleanups.push(http.close);
    const f = await createOnePasswordFixture({ origin: http.origin });
    const backend = createOnePasswordBackend(f.config);
    cleanups.push(f.cleanup, () => backend.dispose());
    const browser = await launchChromium(undefined, [], false);
    cleanups.push(() => browser.close());
    const host = await createSupervisedHost({ backend, browser, canary: 'TVC_synthetic_m9_transport', handleSignals: false });
    cleanups.push(async () => { host.drainEvidence(); await host.closeAll(); });
    const items = (await host.tools.list_vault()).items;
    const session = await host.tools.browser_open_session();
    expect(await host.tools.browser_navigate({ ...session, url: http.url })).toEqual({ ok: true });
    const request = { ...session, handle: items[0].handle, fields: [{ role: 'password' as const, selector: '#password' }] };
    const page = browser.contexts()[0].pages()[0];
    const detail = structuredClone(f.recipe.details[f.recipe.ids.a]);
    detail.urls[0].href = 'https://changed.example';
    await f.setDetail(f.recipe.ids.a, detail);
    expect(await host.tools.fill_from_vault(request)).toEqual({ ok: false, reason: 'backend-error' });
    expect(await page.locator('#password').inputValue()).toBe('');
    expect(await host.tools.browser_navigate({ ...session, url: http.url })).toEqual({ ok: true });
    detail.urls[0].href = http.url;
    detail.fields[1].value = '\ud800rotated\udfff \t';
    detail.state = 'ARCHIVED';
    detail.version = 100;
    await f.setDetail(f.recipe.ids.a, detail);
    expect(await host.tools.fill_from_vault(request)).toEqual({ ok: true, filled: ['password'] });
    // Compare UTF-16 units inside the renderer; no conversion to UTF-8 can hide surrogate replacement.
    expect(await page.locator('#password').evaluate((element) => Array.from({ length: (element as HTMLInputElement).value.length }, (_, index) => (element as HTMLInputElement).value.charCodeAt(index))))
      .toEqual(Array.from({ length: detail.fields[1].value.length }, (_, index) => detail.fields[1].value.charCodeAt(index)));
    const before = (await f.readRecords()).length;
    detail.state = 'ACTIVE';
    await f.setDetail(f.recipe.ids.a, detail);
    expect((await host.tools.list_vault()).items).toEqual(items);
    expect(await host.tools.browser_navigate({ ...session, url: http.url })).toEqual({ ok: true });
    expect(await host.tools.fill_from_vault(request)).toEqual({ ok: false, reason: 'handle-exhausted' });
    await host.tools.request_vault_setup({ reason: 'missing_item' });
    expect(await host.tools.fill_from_vault(request)).toEqual({ ok: false, reason: 'handle-exhausted' });
    expect((await f.readRecords()).length).toBe(before);
    const snapshot = await host.tools.browser_snapshot(session);
    expect(JSON.stringify(snapshot)).not.toContain('rotated');
    host.drainEvidence();
  }, 30_000);
});
