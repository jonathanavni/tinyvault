// Daemon-returned image values must fail at image inspection, before container creation or exec.
import { inspect } from 'node:util';
import { afterEach, expect, it, vi } from 'vitest';
import { createComposedProject, HISTORY_MARKER } from './compose';
import { fakeProject, ids, imageDocument, imageId, kindOf } from './compose.testkit';
import { SECRET_FORMS } from './secretScan';
it.each([ids[0], ids[0].slice(0, 12) + '\n', `${ids[0]}\n${ids[1].slice(0, 12)}\n`])(
  'pre-up ps-project %j is project-not-fresh with zero closer runs', async (stdout) => {
    const h = await fakeProject(vi.fn, { result: (kind) => kind === 'ps-project'
      ? { stdout, stderr: '', exitCode: 0 } : undefined });
    try {
      await expect(createComposedProject(h.options)).rejects.toMatchObject({ code: 'project-not-fresh' });
      expect(h.spawns.map(kindOf)).toEqual(['ps-project']);
      expect(h.handles).toHaveLength(0);
    } finally { await h.dispose(); }
  },
);
const malformedProjectIds = ['benign-login', '-H', 'g'.repeat(12), 'A'.repeat(64),
  ...[11, 13, 63, 65].map((length) => 'a'.repeat(length)), ' ' + ids[0], ids[0] + '\r',
  `${ids[0]}\nnot-an-id\n`, `not-an-id\n${ids[0]}\n`];
it.each(malformedProjectIds.flatMap((stdout) => [1, 2].map((query) => ({ stdout, query }))))(
  'ps-project resolution-shape for $stdout at query $query', async ({ stdout, query }) => {
    let queries = 0;
    const h = await fakeProject(vi.fn, { result: (kind) => {
      if (kind === 'compose-up') return { stdout: '', stderr: '', exitCode: 1 };
      if (kind === 'ps-project' && ++queries === query) return { stdout, stderr: '', exitCode: 0 };
      return undefined;
    } });
    try {
      await expect(createComposedProject(h.options)).rejects.toMatchObject({ code: 'resolution-shape' });
      expect(queries).toBe(query);
      expect(h.spawns.map(kindOf)).toEqual(query === 1 ? ['ps-project'] : [
        'ps-project', 'compose-build', 'image-inspect', 'compose-up', 'ps-project',
        'compose-stop', 'image-history', 'compose-down',
      ]);
    } finally { await h.dispose(); }
  },
);
it.each(['-H', 'sha256:' + 'F'.repeat(64), 'sha256:' + 'f'.repeat(64) + '\n'])(
  'rejects malformed image id %j with otherwise valid image fields', async (Id) => {
    const h = await fakeProject(vi.fn, { result: (kind) => kind === 'image-inspect'
      ? { stdout: JSON.stringify([{ ...imageDocument, Id }]), stderr: '', exitCode: 0 } : undefined });
    try {
      await expect(createComposedProject(h.options)).rejects.toMatchObject({ code: 'image-inspect' });
      expect(h.spawns.some((spawn) => kindOf(spawn) === 'compose-up')).toBe(false);
      expect(h.spawns.some((spawn) => kindOf(spawn) === 'exec-bridge')).toBe(false);
      expect(h.spawns.filter((spawn) => kindOf(spawn) === 'compose-down')).toHaveLength(1);
    } finally { await h.dispose(); }
  },
);
it('history scan deletion is caught: missing marker rejects close with scan-control-missing', async () => {
  const h = await fakeProject(vi.fn, { result: (kind) => kind === 'image-history'
    ? { stdout: '{"CreatedBy":"RUN true"}\n', stderr: '', exitCode: 0 } : undefined });
  try {
    const p = await createComposedProject(h.options);
    await expect(p.closer.close()).rejects.toMatchObject({ code: 'scan-control-missing', surface: 'history' });
    expect(h.spawns.filter((spawn) => kindOf(spawn) === 'compose-down')).toHaveLength(1);
  } finally { await h.dispose(); }
});

// JSON escaping prevents the aggregate raw-output scan from substituting for parsed-field scanning.
function historyLine(doc: Record<string, unknown>): string {
  return JSON.stringify(doc) + '\n';
}
function escaped(value: string): string {
  return '"' + [...value].map((char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`).join('') + '"';
}
const markerLine = historyLine({ CreatedBy: `LABEL ${HISTORY_MARKER}` });
const disposals: (() => Promise<void>)[] = [];
afterEach(async () => { for (const dispose of disposals.splice(0)) await dispose(); });
async function historyProject(stdout: () => string, stderr = '') {
  const h = await fakeProject(vi.fn, { result: (kind) => kind === 'image-history'
    ? { stdout: stdout(), stderr, exitCode: 0 } : undefined });
  disposals.push(h.dispose);
  return h;
}
it('history marker is found in parsed JSON and scan runs once after stop before down', async () => {
  const h = await historyProject(() => '{"CreatedBy":' + escaped(`LABEL ${HISTORY_MARKER}`) + '}\n'
    + historyLine({ CreatedBy: 'RUN true', Comment: 'safe', Size: 0 }));
  const p = await createComposedProject(h.options);
  await expect(p.closer.close()).resolves.toBeUndefined(); await p.closer.close();
  const kinds = h.spawns.map(kindOf);
  expect(kinds.filter((k) => k === 'image-history')).toHaveLength(1);
  expect(kinds.indexOf('image-history')).toBeGreaterThan(kinds.indexOf('compose-stop'));
  expect(kinds.indexOf('image-history')).toBeLessThan(kinds.indexOf('compose-down'));
  expect(h.spawns.find((s) => kindOf(s) === 'image-history')!.args.at(-1)).toBe(imageId);
});
it('empty history with marker only on stderr is unobserved', async () => {
  const h = await historyProject(() => '', HISTORY_MARKER);
  const p = await createComposedProject(h.options);
  await expect(p.closer.close()).rejects.toMatchObject({ code: 'scan-control-missing', surface: 'history' });
});
const forms = [
  ['raw', (b: Buffer) => b.toString('latin1')], ['hex', (b: Buffer) => b.toString('hex')],
  ['buffer-inspect', (b: Buffer) => inspect(b)], ['decimal-array', (b: Buffer) => JSON.stringify(b)],
  ['base64url', (b: Buffer) => b.toString('base64url')],
] as const;
it('history test forms cover the scanner inventory', () => expect(forms.map(([name]) => name)).toEqual(SECRET_FORMS));
it.each(forms)('history CreatedBy exposes each real bootstrap secret as %s', async (_name, encode) => {
  for (const index of [0, 1, 2, 3, 4]) {
    const h = await historyProject(() => markerLine + '{"CreatedBy":' + escaped(encode(h.secrets[index])) + '}\n');
    const p = await createComposedProject(h.options);
    expect(h.secrets).toHaveLength(5);
    const closing = p.closer.close();
    await expect(closing).rejects.toMatchObject({ code: 'secret-exposed', surface: 'history' });
    expect(p.closer.close()).toBe(closing);
    expect(h.spawns.filter((s) => kindOf(s) === 'export')).toHaveLength(5);
    expect(h.spawns.filter((s) => kindOf(s) === 'compose-down')).toHaveLength(1);
  }
});
it.each(['Comment', 'CreatedAt', 'ID', 'Size', 'new-field', 'nested'])(
  'history scans other string field %s after parsing', async (field) => {
    const h = await historyProject(() => markerLine + '{' + JSON.stringify(field) + ':'
      + (field === 'nested' ? '{"values":[' : '') + escaped(h.secrets[0].toString('hex'))
      + (field === 'nested' ? ']}' : '') + '}\n');
    const p = await createComposedProject(h.options);
    await expect(p.closer.close()).rejects.toMatchObject({ code: 'secret-exposed', surface: 'history' });
  },
);
it('history decodes UTF-8 JSON from the runner latin1 byte representation before raw scanning', async () => {
  const h = await historyProject(() => markerLine
    + Buffer.from(JSON.stringify({ CreatedBy: h.secrets[0].toString('latin1') }) + '\n').toString('latin1'));
  const p = await createComposedProject(h.options);
  await expect(p.closer.close()).rejects.toMatchObject({ code: 'secret-exposed', surface: 'history' });
});
it.each(['not-json', 'null', '[]', '"text"', '1', '{} {}', '{"CreatedBy":', '', '\xff'])(
  'history rejects malformed or non-object JSON line %j even after the marker', async (line) => {
    const h = await historyProject(() => markerLine + line + '\n');
    const p = await createComposedProject(h.options);
    await expect(p.closer.close()).rejects.toMatchObject({ code: 'history-parse', surface: 'history' });
    expect(h.spawns.filter((s) => kindOf(s) === 'compose-down')).toHaveLength(1);
  },
);
it('failed construction invokes history scan and preserves missing-control teardown failure', async () => {
  const h = await historyProject(() => '{}\n');
  h.options.probeOrigin = async () => false;
  await expect(createComposedProject(h.options))
    .rejects.toMatchObject({ code: 'origin-unreachable', teardownCode: 'scan-control-missing' });
  expect(h.spawns.filter((s) => kindOf(s) === 'image-history')).toHaveLength(1);
});
