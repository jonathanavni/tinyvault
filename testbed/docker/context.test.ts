import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { BUILT_IN_DEFAULT_ENDPOINT, resolveSources, type DockerEnvironment } from './context';

const root = '/injected/docker';
const home = '/injected/home';
const host = 'unix:///tmp/work.sock';

function metaPath(name: string, directory = root): string {
  return `${directory}/contexts/meta/${createHash('sha256').update(name).digest('hex')}/meta.json`;
}

function reader(entries: Record<string, string> = {}) {
  return { readFile: vi.fn(async (path: string) => entries[path]) };
}

function metadata(endpoint = host): string {
  return JSON.stringify({ Endpoints: { docker: { Host: endpoint } } });
}

describe('resolveSources', () => {
  it.each([{}, { DOCKER_HOST: '', DOCKER_CONTEXT: '' }])('uses the default for zero explicit sources: %j', async (env) => {
    const files = reader();
    expect(await resolveSources(env, files)).toEqual({ ok: true, explicit: [], usedBuiltInDefault: true });
    expect(files.readFile).not.toHaveBeenCalled();
  });

  it.each([undefined, '{}', '{"currentContext":""}'])('treats absent or empty active context as absent: %s', async (config) => {
    const files = reader(config === undefined ? {} : { [`${root}/config.json`]: config });
    expect(await resolveSources({ DOCKER_CONFIG: root }, files)).toEqual({
      ok: true, explicit: [], usedBuiltInDefault: true,
    });
    expect(files.readFile.mock.calls).toEqual([[`${root}/config.json`]]);
  });

  it('keeps a lone explicit host without adding a default source (AP-2)', async () => {
    expect(await resolveSources({ DOCKER_HOST: host }, reader())).toEqual({
      ok: true, explicit: [{ source: 'DOCKER_HOST', raw: host }], usedBuiltInDefault: false,
    });
  });

  it('resolves DOCKER_CONTEXT=default without a metadata file (A1)', async () => {
    const files = reader();
    expect(await resolveSources({ DOCKER_CONTEXT: 'default' }, files)).toEqual({
      ok: true, explicit: [{ source: 'DOCKER_CONTEXT', raw: BUILT_IN_DEFAULT_ENDPOINT }], usedBuiltInDefault: false,
    });
    expect(files.readFile).not.toHaveBeenCalled();
  });

  it('resolves currentContext=default with only the config read (A1)', async () => {
    const files = reader({ [`${root}/config.json`]: '{"currentContext":"default"}' });
    expect(await resolveSources({ DOCKER_CONFIG: root }, files)).toEqual({
      ok: true, explicit: [{ source: 'active-context', raw: BUILT_IN_DEFAULT_ENDPOINT }], usedBuiltInDefault: false,
    });
    expect(files.readFile.mock.calls).toEqual([[`${root}/config.json`]]);
  });

  it('retains all three explicit sources, even when the host is set', async () => {
    const files = reader({
      [`${root}/config.json`]: '{"currentContext":"active"}',
      [metaPath('selected')]: metadata('unix:///tmp/selected.sock'),
      [metaPath('active')]: metadata('unix:///tmp/active.sock'),
    });
    expect(await resolveSources({ DOCKER_HOST: host, DOCKER_CONTEXT: 'selected', DOCKER_CONFIG: root }, files)).toEqual({
      ok: true, usedBuiltInDefault: false, explicit: [
        { source: 'DOCKER_HOST', raw: host },
        { source: 'DOCKER_CONTEXT', raw: 'unix:///tmp/selected.sock' },
        { source: 'active-context', raw: 'unix:///tmp/active.sock' },
      ],
    });
  });

  it.each([undefined, ''])('uses only injected HOME when DOCKER_CONFIG is %s', async (config) => {
    const directory = `${home}/.docker`;
    const files = reader({ [`${directory}/config.json`]: '{"currentContext":"work"}', [metaPath('work', directory)]: metadata() });
    expect(await resolveSources({ HOME: home, DOCKER_CONFIG: config }, files)).toEqual({
      ok: true, explicit: [{ source: 'active-context', raw: host }], usedBuiltInDefault: false,
    });
    expect(files.readFile.mock.calls).toEqual([[`${directory}/config.json`], [metaPath('work', directory)]]);
  });

  it('DOCKER_CONFIG overrides HOME, with context names hashed rather than used as paths', async () => {
    const name = '../../a context';
    const files = reader({ [metaPath(name)]: metadata() });
    expect(await resolveSources({ HOME: home, DOCKER_CONFIG: root, DOCKER_CONTEXT: name }, files)).toEqual({
      ok: true, explicit: [{ source: 'DOCKER_CONTEXT', raw: host }], usedBuiltInDefault: false,
    });
    expect(files.readFile.mock.calls).toEqual([[metaPath(name)], [`${root}/config.json`]]);
  });

  const badMetadata = [
    [undefined, 'context-missing'], ['{', 'context-json'], ['null', 'context-shape'],
    ['{}', 'context-host'], ['{"Endpoints":{}}', 'context-host'],
    ['{"Endpoints":{"docker":{}}}', 'context-host'],
    ['{"Endpoints":{"docker":{"Host":""}}}', 'context-host'],
    ['{"Endpoints":{"docker":{"Host":42}}}', 'context-host'],
  ] as const;

  describe.each(['DOCKER_CONTEXT', 'active-context'] as const)('%s failure has no fall-through', (source) => {
    it.each(badMetadata)('rejects metadata %s', async (contents, reason) => {
      const entries: Record<string, string> = {};
      const env: DockerEnvironment = { DOCKER_CONFIG: root, DOCKER_HOST: host,
        DOCKER_CONTEXT: source === 'DOCKER_CONTEXT' ? 'broken' : 'default' };
      if (source === 'active-context') entries[`${root}/config.json`] = '{"currentContext":"broken"}';
      if (contents !== undefined) entries[metaPath('broken')] = contents;
      expect(await resolveSources(env, reader(entries))).toEqual({ ok: false, reason });
    });
  });

  it.each([['{', 'config-json'], ['[]', 'config-shape'], ['{"currentContext":null}', 'config-current-context']])(
    'rejects malformed config %s despite a usable host', async (config, reason) => {
      expect(await resolveSources({ DOCKER_CONFIG: root, DOCKER_HOST: host }, reader({ [`${root}/config.json`]: config })))
        .toEqual({ ok: false, reason });
    },
  );

  it.each([
    [{ DOCKER_CONFIG: root }, 'config-read'],
    [{ DOCKER_CONFIG: root, DOCKER_CONTEXT: 'work' }, 'context-read'],
  ] as const)('returns a failure on injected read errors: %j', async (env, reason) => {
    const files = { readFile: vi.fn(async () => { throw new Error('EACCES'); }) };
    expect(await resolveSources(env, files)).toEqual({ ok: false, reason });
  });

  it('rejects a named file-backed context without an injected config directory', async () => {
    expect(await resolveSources({ DOCKER_CONTEXT: 'work', DOCKER_HOST: host }, reader()))
      .toEqual({ ok: false, reason: 'context-directory' });
  });
});
