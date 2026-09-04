import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { BUILT_IN_DEFAULT_ENDPOINT, type DockerEnvironment } from './context';
import { assertPinned, dockerPreflight, DockerPreflightError, PinnedDockerEndpoint, type PreflightDeps } from './preflight';

const root = '/injected/docker';
const original = '/var/run/docker.sock';
const canonical = '/private/run/docker.sock';
const workMeta = `${root}/contexts/meta/${createHash('sha256').update('work').digest('hex')}/meta.json`;

function dependencies(env: DockerEnvironment = {}, entries: Record<string, string> = {}) {
  return {
    env,
    files: { readFile: vi.fn(async (path: string) => entries[path]) },
    realpath: vi.fn(async (_path: string) => canonical),
    stat: vi.fn(async (_path: string): Promise<{ isSocket(): boolean }> => ({ isSocket: () => true })),
  };
}

function contextFiles(raw: string) {
  return { [workMeta]: JSON.stringify({ Endpoints: { docker: { Host: raw } } }) };
}

async function expectFailure(deps: PreflightDeps, code: string): Promise<void> {
  await expect(dockerPreflight(deps)).rejects.toMatchObject({ name: 'DockerPreflightError', code });
}

describe('dockerPreflight', () => {
  it('uses the built-in default with zero explicit sources (AP-2)', async () => {
    const deps = dependencies();
    const pin = await dockerPreflight(deps);
    expect(deps.realpath.mock.calls).toEqual([[original]]);
    expect(deps.stat.mock.calls).toEqual([[canonical]]);
    expect(deps.files.readFile).not.toHaveBeenCalled();
    expect(pin.dockerHost).toBe(`unix://${canonical}`);
    expect(pin.socketPath).toBe(canonical);
    expect(() => assertPinned(pin)).not.toThrow();
  });

  it('pins the realpath of a single explicit path without comparing the default (AP-2)', async () => {
    const deps = dependencies({ DOCKER_HOST: 'unix:///tmp/link.sock' });
    deps.realpath.mockImplementation(async (path) => path === '/tmp/link.sock' ? '/tmp/rootless.sock' : canonical);
    const pin = await dockerPreflight(deps);
    expect(pin.dockerHost).toBe('unix:///tmp/rootless.sock');
    expect(pin.socketPath).toBe('/tmp/rootless.sock');
    expect(deps.realpath.mock.calls).toEqual([['/tmp/link.sock']]);
    expect(deps.stat.mock.calls).toEqual([['/tmp/rootless.sock']]);
  });

  it.each(['DOCKER_CONTEXT', 'active-context'])('accepts explicitly named default via %s (A1)', async (source) => {
    const env = { DOCKER_CONFIG: root, DOCKER_CONTEXT: source === 'DOCKER_CONTEXT' ? 'default' : undefined };
    const entries: Record<string, string> = source === 'active-context'
      ? { [`${root}/config.json`]: '{"currentContext":"default"}' } : {};
    const deps = dependencies(env, entries);
    expect((await dockerPreflight(deps)).dockerHost).toBe(`unix://${canonical}`);
    expect(deps.realpath.mock.calls).toEqual([[original]]);
    expect(deps.files.readFile.mock.calls).toEqual([[`${root}/config.json`]]);
  });

  it('accepts a lone active context on a different socket (A4)', async () => {
    const deps = dependencies({ DOCKER_CONFIG: root }, {
      [`${root}/config.json`]: '{"currentContext":"work"}', ...contextFiles('unix:///tmp/operator.sock'),
    });
    deps.realpath.mockImplementation(async (path) => path);
    expect((await dockerPreflight(deps)).socketPath).toBe('/tmp/operator.sock');
  });

  it('rejects different realpaths before stat (AP-3)', async () => {
    const deps = dependencies({ DOCKER_CONFIG: root, DOCKER_HOST: BUILT_IN_DEFAULT_ENDPOINT, DOCKER_CONTEXT: 'work' },
      contextFiles('unix:///tmp/other.sock'));
    deps.realpath.mockImplementation(async (path) => path);
    await expectFailure(deps, 'ambiguous');
    expect(deps.realpath.mock.calls).toEqual([[original], ['/tmp/other.sock']]);
    expect(deps.stat).not.toHaveBeenCalled();
  });

  it('accepts different explicit paths resolving to the same socket (AP-3)', async () => {
    const deps = dependencies({ DOCKER_CONFIG: root, DOCKER_HOST: BUILT_IN_DEFAULT_ENDPOINT, DOCKER_CONTEXT: 'work' },
      contextFiles('unix:///tmp/alias.sock'));
    expect((await dockerPreflight(deps)).socketPath).toBe(canonical);
    expect(deps.realpath.mock.calls).toEqual([[original], ['/tmp/alias.sock']]);
    expect(deps.stat.mock.calls).toEqual([[canonical]]);
  });

  it('compares the active context too, even if host and selected context agree', async () => {
    const deps = dependencies({ DOCKER_CONFIG: root, DOCKER_HOST: BUILT_IN_DEFAULT_ENDPOINT, DOCKER_CONTEXT: 'default' }, {
      [`${root}/config.json`]: '{"currentContext":"work"}', ...contextFiles('unix:///tmp/third.sock'),
    });
    deps.realpath.mockImplementation(async (path) => path);
    await expectFailure(deps, 'ambiguous');
    expect(deps.stat).not.toHaveBeenCalled();
  });

  it.each([
    ['tcp://attacker:2375', 'scheme'], ['unix://host/x', 'authority'],
    ['unix:///x?y', 'query-or-fragment'], ['unix:///x%', 'percent-escape'],
    ['unix:///a//x', 'redundant-slash'], ['unix:///a/../x', 'dot-segment'],
    ['unix:///x/', 'trailing-slash'], ['unix://', 'empty-path'], ['unix:///x\u0000', 'control-character'],
  ])('preserves the isolated rejection code for %s before filesystem checks', async (raw, reason) => {
    const deps = dependencies({ DOCKER_HOST: raw });
    await expectFailure(deps, `endpoint-${reason}`);
    expect(deps.realpath).not.toHaveBeenCalled();
    expect(deps.stat).not.toHaveBeenCalled();
  });

  it('parses every source before starting realpath', async () => {
    const deps = dependencies({ DOCKER_CONFIG: root, DOCKER_HOST: BUILT_IN_DEFAULT_ENDPOINT, DOCKER_CONTEXT: 'work' },
      contextFiles('tcp://attacker:2375'));
    await expectFailure(deps, 'endpoint-scheme');
    expect(deps.realpath).not.toHaveBeenCalled();
    expect(deps.stat).not.toHaveBeenCalled();
  });

  it.each([[undefined, 'context-missing'], ['{', 'context-json'], ['{}', 'context-host']] as const)(
    'rejects context failure %s despite a usable host', async (meta, reason) => {
      const deps = dependencies({ DOCKER_CONFIG: root, DOCKER_HOST: BUILT_IN_DEFAULT_ENDPOINT, DOCKER_CONTEXT: 'work' },
        meta === undefined ? {} : { [workMeta]: meta });
      await expectFailure(deps, `source-${reason}`);
      expect(deps.realpath).not.toHaveBeenCalled();
      expect(deps.stat).not.toHaveBeenCalled();
    },
  );

  it('rejects an absent path during realpath', async () => {
    const deps = dependencies();
    deps.realpath.mockRejectedValue(Object.assign(new Error('absent'), { code: 'ENOENT' }));
    await expectFailure(deps, 'realpath-failed');
    expect(deps.stat).not.toHaveBeenCalled();
  });

  it('rejects a path that disappears before stat', async () => {
    const deps = dependencies();
    deps.stat.mockRejectedValue(Object.assign(new Error('absent'), { code: 'ENOENT' }));
    await expectFailure(deps, 'stat-failed');
  });

  it('rejects an existing non-socket', async () => {
    const deps = dependencies();
    deps.stat.mockResolvedValue({ isSocket: () => false });
    await expectFailure(deps, 'not-socket');
  });
});

describe('pin provenance and immutability (R2-1)', () => {
  it.each([null, undefined, 'unix:///x', 42, { dockerHost: 'unix:///x' }])('rejects forged pin %j', (forgery) => {
    expect(() => assertPinned(forgery)).toThrow(DockerPreflightError);
    expect(() => assertPinned(forgery)).toThrow(expect.objectContaining({ code: 'unpinned' }));
  });

  it('rejects a reflection clone with the genuine prototype and every own property and symbol', async () => {
    const pin = await dockerPreflight(dependencies());
    const clone = Object.create(Object.getPrototypeOf(pin));
    for (const key of [...Object.getOwnPropertyNames(pin), ...Object.getOwnPropertySymbols(pin)]) {
      Object.defineProperty(clone, key, Object.getOwnPropertyDescriptor(pin, key)!);
    }
    expect(clone).toBeInstanceOf(PinnedDockerEndpoint);
    expect(() => assertPinned(clone)).toThrow(DockerPreflightError);
    expect(() => assertPinned(pin)).not.toThrow();
  });

  it('cannot mint provenance by calling the erased private constructor', () => {
    const construct = PinnedDockerEndpoint as unknown as new (path: string) => PinnedDockerEndpoint;
    expect(() => assertPinned(new construct('/tmp/unverified.sock'))).toThrow(DockerPreflightError);
  });

  it('keeps socket storage private and rejects mutation or getter shadowing on a genuine pin', async () => {
    const pin = await dockerPreflight(dependencies());
    expect(Object.isFrozen(pin)).toBe(true);
    expect(Reflect.ownKeys(pin)).toEqual([]);
    expect(() => { (pin as any).socketPath = 'tcp://evil'; }).toThrow(TypeError);
    expect(() => { (pin as any).endpoint = 'tcp://evil'; }).toThrow(TypeError);
    expect(() => Object.defineProperty(pin, 'dockerHost', { value: 'tcp://evil' })).toThrow(TypeError);
    expect(pin.socketPath).toBe(canonical);
    expect(pin.dockerHost).toBe(`unix://${canonical}`);
    expect(() => assertPinned(pin)).not.toThrow();
  });

  it('prevents reflective replacement of the shared getters', async () => {
    const pin = await dockerPreflight(dependencies());
    expect(Reflect.defineProperty(Object.getPrototypeOf(pin), 'dockerHost', { get: () => 'tcp://evil' })).toBe(false);
    expect(pin.dockerHost).toBe(`unix://${canonical}`);
  });

  it('checks provenance without repeating filesystem checks', async () => {
    const deps = dependencies();
    const pin = await dockerPreflight(deps);
    deps.realpath.mockRejectedValue(new Error('changed after preflight'));
    deps.stat.mockRejectedValue(new Error('changed after preflight'));
    expect(() => assertPinned(pin)).not.toThrow();
    expect(pin.socketPath).toBe(canonical);
    expect(deps.realpath).toHaveBeenCalledTimes(1);
    expect(deps.stat).toHaveBeenCalledTimes(1);
  });
});
