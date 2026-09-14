import { afterEach, describe, expect, it } from 'vitest';
import { createOnePasswordBackend } from './onepassword';
import { parseProviderJson } from './onepasswordMetadata';
import { createOnePasswordFixture, type SyntheticObject } from './onepassword.testSupport';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function fixture() {
  const fixture = await createOnePasswordFixture();
  const backend = createOnePasswordBackend(fixture.config);
  cleanups.push(fixture.cleanup, () => backend.dispose());
  return { ...fixture, backend };
}
async function discovered() {
  const current = await fixture();
  const items = await current.backend.listItems();
  const handle = items[0].handle;
  const policy = await current.backend.resolvePolicy(handle);
  return { ...current, items, handle, policy };
}

// T1/T5/T12 use the production factory, real spawn and serialized synthetic CLI output.
describe('1Password metadata and D9 F0', () => {
  it('publishes exact approved metadata and resolves F0 16/64-unit passwords without ignored metadata', async () => {
    const f = await discovered();
    expect(f.recipe.passwords[f.recipe.ids.a].length).toBe(16);
    expect(f.recipe.passwords[f.recipe.ids.b].length).toBe(64);
    expect(f.items).toHaveLength(2);
    for (const item of f.items) {
      expect(Object.keys(item)).toEqual(['handle', 'label', 'kind', 'available']);
      expect(item).toMatchObject({ kind: 'password', available: true });
      expect(item.handle).toMatch(/^vh_[A-Za-z0-9_-]{32}$/u);
      expect(Object.isFrozen(item)).toBe(true);
      const policy = await f.backend.resolvePolicy(item.handle);
      expect(policy).toEqual({ canonicalOrigin: 'https://login.example', fieldRecipe: ['password'] });
      expect(Object.isFrozen(policy)).toBe(true);
      expect(Object.isFrozen(policy.fieldRecipe)).toBe(true);
    }
    expect(Object.isFrozen(f.items)).toBe(true);
    expect(await f.backend.probeAvailability()).toEqual({ available: true });
    expect((await f.readRecords()).map((r) => r.command)).toEqual(['version', 'list', 'probe']);
    const visible = JSON.stringify(f.items);
    for (const marker of ['Synthetic ignored', 'Synthetic editor', 'Synthetic user', 'Synthetic password reference', f.token]) {
      expect(visible).not.toContain(marker);
    }
    for (const item of f.items) {
      const secret = await f.backend.resolveSecret(item.handle, await f.backend.resolvePolicy(item.handle));
      expect(String(secret)).toBe('[REDACTED]');
      expect(JSON.stringify(secret)).toBe('"[REDACTED]"');
      const id = item.label === 'Approved a' ? f.recipe.ids.a : f.recipe.ids.b;
      expect(secret.consume()).toBe(f.recipe.passwords[id]);
    }
  });

  it.each(['fields', 'tags', 'favorite', 'sections', 'files', 'state', 'document_attributes'])(
    'rejects LIST extra %s without publishing a partial snapshot', async (key) => {
      const f = await fixture();
      const list = structuredClone(f.recipe.list);
      list[2][key] = key === 'state' ? 'ACTIVE' : [];
      await f.setList(list);
      await expect(f.backend.listItems()).rejects.toMatchObject({ kind: 'integrity' });
      await f.setList(f.recipe.list);
      expect(await f.backend.listItems()).toHaveLength(2);
      expect((await f.readRecords()).filter((r) => r.command === 'list')).toHaveLength(2);
    },
  );

  it('accepts independently absent optional fields and ignores changing metadata without thresholds', async () => {
    const f = await fixture();
    const a = f.recipe.ids.a;
    await f.setList([{ id: a, vault: { id: f.recipe.vaultId }, category: 'LOGIN', urls: [{ href: 'https://login.example/path' }] }]);
    const [item] = await f.backend.listItems();
    const policy = await f.backend.resolvePolicy(item.handle);
    await f.setDetail(a, { id: a, vault: { id: f.recipe.vaultId }, category: 'LOGIN', urls: [{ href: 'https://login.example/new' }], fields: [{ id: 'password', type: 'CONCEALED', purpose: 'PASSWORD', value: ' Minimal\t ' }] });
    await expect(f.backend.resolveSecret(item.handle, policy).then((secret) => secret.consume())).resolves.toBe(' Minimal\t ');
    expect(f.recipe.details[a].fields).toHaveLength(3);
    const detail = structuredClone(f.recipe.details[a]);
    detail.version = -1.25;
    detail.fields[1].entropy = -99.5;
    detail.fields[1].password_details = { entropy: 0, generated: false, strength: 'anything' };
    detail.title = 'Changed ignored title';
    detail.additional_information = 'Changed ignored information';
    await f.setDetail(a, detail);
    await expect(f.backend.resolveSecret(item.handle, policy).then((secret) => secret.consume())).resolves.toBe(f.recipe.passwords[a]);
    delete detail.fields[1].entropy;
    delete detail.fields[1].password_details;
    await f.setDetail(a, detail);
    await expect(f.backend.resolveSecret(item.handle, policy).then((secret) => secret.consume())).resolves.toBe(f.recipe.passwords[a]);
  });
});

describe('D9 strict decoding, duplicates and bounded scanner', () => {
  it.each([16_384, 1_048_576])('enforces the JSON parser byte cap %i independently of process output admission', (cap) => {
    const exact = Buffer.from('[]' + ' '.repeat(cap - 2));
    const over = Buffer.from('[]' + ' '.repeat(cap - 1));
    expect(exact.byteLength).toBe(cap);
    expect(over.byteLength).toBe(cap + 1);
    expect(parseProviderJson(exact, cap)).toEqual([]);
    expect(() => parseProviderJson(over, cap)).toThrowError(expect.objectContaining({ kind: 'unavailable' }));
  });
  it('rejects an escaped duplicate ignored title in an otherwise valid LIST', async () => {
    const f = await fixture();
    const valid = JSON.stringify(f.recipe.list);
    const duplicate = valid.replace('"title":"Synthetic ignored title"', '"title":"a","\\u0074itle":"b"');
    await f.setRaw('list', Buffer.from(duplicate));
    await expect(f.backend.listItems()).rejects.toMatchObject({ kind: 'integrity' });
  });
  it.each([Buffer.from([0x80]), Buffer.from([0xe2, 0x82])])('rejects malformed UTF-8 inside an otherwise valid ignored title (%j)', async (invalid) => {
    const f = await fixture();
    const valid = JSON.stringify(f.recipe.list);
    const marker = 'Synthetic ignored title';
    const at = valid.indexOf(marker);
    await f.setRaw('list', Buffer.concat([Buffer.from(valid.slice(0, at)), invalid, Buffer.from(valid.slice(at + marker.length))]));
    await expect(f.backend.listItems()).rejects.toMatchObject({ kind: 'integrity' });
  });
  it.each(['1e999', 'NaN', 'Infinity'])('rejects non-finite or non-JSON number %s', async (number) => {
    const f = await fixture();
    await f.setRaw('list', Buffer.from(JSON.stringify(f.recipe.list).replace('"version":4', `"version":${number}`)));
    await expect(f.backend.listItems()).rejects.toMatchObject({ kind: 'integrity' });
  });
  it.each([
    ['depth', '['.repeat(13) + '0' + ']'.repeat(13)],
    ['nodes', '{"unexpected":[' + Array(65_536).fill('0').join(',') + ']}'],
  ])('maps syntactically valid %s overflow to unavailable before location rejection', async (_name, raw) => {
    const f = await fixture();
    expect(Buffer.byteLength(raw)).toBeLessThan(1_048_576);
    await f.setRaw('list', Buffer.from(raw));
    await expect(f.backend.listItems()).rejects.toMatchObject({ kind: 'unavailable' });
  });
  it.each(['null', '{}', '[] trailing', '{"x":1,}', '[01]', '["\\x00"]'])('rejects invalid LIST syntax/shape %s', async (raw) => {
    const f = await fixture();
    await f.setRaw('list', Buffer.from(raw));
    await expect(f.backend.listItems()).rejects.toMatchObject({ kind: 'integrity' });
  });
  it('uses the 1024-row resource bound before identity checks', async () => {
    const f = await fixture();
    await f.setList(Array.from({ length: 1025 }, () => ({})));
    await expect(f.backend.listItems()).rejects.toMatchObject({ kind: 'unavailable' });
  });
});

describe('D9 detail grammar and semantic ordering', () => {
  const cases: Array<[string, (detail: SyntheticObject) => void, string]> = [
    ['urls absent', (d) => { delete d.urls; }, 'integrity'],
    ['fields absent', (d) => { delete d.fields; }, 'not-found'],
    ['missing password', (d) => { d.fields = [d.fields[0], d.fields[2]]; }, 'not-found'],
    ['empty password', (d) => { d.fields[1].value = ''; }, 'not-found'],
    ['absent password value', (d) => { delete d.fields[1].value; }, 'not-found'],
    ['nonstring password', (d) => { d.fields[1].value = 123; }, 'integrity'],
    ['misplaced entropy before absent candidate', (d) => { d.fields = [d.fields[0]]; d.fields[0].entropy = 1; }, 'integrity'],
    ['misplaced password_details', (d) => { d.fields[0].password_details = d.fields[1].password_details; }, 'integrity'],
    ['duplicate nonselected IDs', (d) => { d.fields.push({ id: 'username', type: 'STRING' }); }, 'integrity'],
    ['duplicate nonselected purposes', (d) => { d.fields.push({ id: 'other', type: 'STRING', purpose: 'USERNAME' }); }, 'integrity'],
    ['duplicate empty purposes', (d) => { d.fields[0].purpose = ''; d.fields[2].purpose = ''; }, 'integrity'],
    ['section key', (d) => { d.fields[1].section = 'custom'; }, 'integrity'],
    ['label-selected impostor', (d) => { d.fields[1] = { id: 'custom', type: 'CONCEALED', label: 'password', value: 'wrong' }; }, 'not-found'],
    ['wrong password purpose', (d) => { delete d.fields[1].entropy; delete d.fields[1].password_details; d.fields[1].purpose = 'CUSTOM'; }, 'integrity'],
    ['second candidate', (d) => { delete d.fields[1].purpose; delete d.fields[1].entropy; delete d.fields[1].password_details; d.fields.push({ id: 'custom', type: 'CONCEALED', purpose: 'PASSWORD', value: 'wrong' }); }, 'integrity'],
    ['metadata wrong type', (d) => { d.fields[1].entropy = true; }, 'integrity'],
    ['metadata missing child', (d) => { delete d.fields[1].password_details.strength; }, 'integrity'],
    ['metadata extra child', (d) => { d.fields[1].password_details.extra = 'wrong'; }, 'integrity'],
    ['null URL container', (d) => { d.urls = null; }, 'integrity'],
    ['null optional field', (d) => { d.fields[0].reference = null; }, 'integrity'],
    ['grammar precedes DELETED', (d) => { d.state = 'DELETED'; d.extra = true; }, 'integrity'],
    ['DELETED precedes origin', (d) => { d.state = 'DELETED'; d.urls[0].href = 'https://drift.example'; }, 'not-found'],
  ];
  it.each(cases)('%s has fixed %s outcome', async (_name, change, kind) => {
    const f = await discovered();
    const detail = structuredClone(f.recipe.details[f.recipe.ids.a]);
    change(detail);
    await f.setDetail(f.recipe.ids.a, detail);
    await expect(f.backend.resolveSecret(f.handle, f.policy)).rejects.toMatchObject({ kind });
  });
  it.each(['A', ' '.repeat(2) + '\tpass\t  ', 'X'.repeat(4096), '\ud800supported\udfff'])('preserves supported value exactly (%j)', async (value) => {
    const f = await discovered();
    const detail = structuredClone(f.recipe.details[f.recipe.ids.a]);
    detail.fields[1].value = value;
    await f.setDetail(f.recipe.ids.a, detail);
    const secret = await f.backend.resolveSecret(f.handle, f.policy);
    expect(secret.consume()).toBe(value);
  });
  it.each(['X'.repeat(4097), 'a\rb', 'a\nb'])('refuses unsupported password domain with fixed unavailable', async (value) => {
    const f = await discovered();
    const detail = structuredClone(f.recipe.details[f.recipe.ids.a]);
    detail.fields[1].value = value;
    await f.setDetail(f.recipe.ids.a, detail);
    await expect(f.backend.resolveSecret(f.handle, f.policy)).rejects.toEqual(expect.objectContaining({ kind: 'unavailable', message: 'Credential backend is unavailable' }));
  });
});
