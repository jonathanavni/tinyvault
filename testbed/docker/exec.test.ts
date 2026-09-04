import cp, { spawn } from 'node:child_process';
import { request } from 'node:http';
import net from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDockerSpawn, runDockerCommand, type DockerCommand } from './exec';
import { dockerPreflight, DockerPreflightError, type PinnedDockerEndpoint } from './preflight';

const noCommand = undefined as never;
const forbidden = /Docker access forbidden during tests:/;

function mintPin() {
  return dockerPreflight({
    env: {}, files: { readFile: async () => undefined },
    realpath: async () => '/injected/canonical.sock',
    stat: async () => ({ isSocket: () => true }),
  });
}

afterEach(() => vi.unstubAllEnvs());

describe('slice 2 Docker choke point', () => {
  it('keeps the command vocabulary empty at compile time', () => {
    const empty: [DockerCommand] extends [never] ? true : false = true;
    expect(empty).toBe(true);
  });

  it.each([undefined, null, 'unix:///tmp/forged.sock', { dockerHost: 'unix:///tmp/forged.sock' }])(
    'checks pin provenance first in both entry points: %j', async (forgery) => {
      const pin = forgery as PinnedDockerEndpoint;
      expect(() => buildDockerSpawn(pin, noCommand)).toThrow(DockerPreflightError);
      expect(() => buildDockerSpawn(pin, noCommand)).toThrow(expect.objectContaining({ code: 'unpinned' }));
      await expect(runDockerCommand(pin, noCommand)).rejects.toMatchObject({ code: 'unpinned' });
    },
  );

  it('rejects a reflection clone at the executor boundary', async () => {
    const real = await mintPin();
    const clone = Object.create(Object.getPrototypeOf(real), Object.getOwnPropertyDescriptors(real));
    expect(() => buildDockerSpawn(clone, noCommand)).toThrow(expect.objectContaining({ code: 'unpinned' }));
    await expect(runDockerCommand(clone, noCommand)).rejects.toMatchObject({ code: 'unpinned' });
  });

  it('checks provenance before reading any supplied endpoint property', () => {
    const dockerHost = vi.fn(() => { throw new Error('must not read forgery'); });
    const forgery = Object.create(null, { dockerHost: { get: dockerHost } });
    expect(() => buildDockerSpawn(forgery, noCommand)).toThrow(expect.objectContaining({ code: 'unpinned' }));
    expect(dockerHost).not.toHaveBeenCalled();
  });

  it('pins the child environment and removes both ambient selectors without mutating the parent', async () => {
    vi.stubEnv('DOCKER_HOST', 'tcp://attacker:2375');
    vi.stubEnv('DOCKER_CONTEXT', 'attacker');
    vi.stubEnv('DOCKER_CONFIG', '/injected/attacker');
    vi.stubEnv('TINYVAULT_EXEC_CONTROL', 'retained');
    const result = buildDockerSpawn(await mintPin(), noCommand);
    expect(result).toMatchObject({ file: 'docker', args: [], env: {
      DOCKER_HOST: 'unix:///injected/canonical.sock', TINYVAULT_EXEC_CONTROL: 'retained',
    } });
    expect(Object.hasOwn(result.env, 'DOCKER_CONTEXT')).toBe(false);
    expect(Object.hasOwn(result.env, 'DOCKER_CONFIG')).toBe(false);
    expect(process.env.DOCKER_HOST).toBe('tcp://attacker:2375');
    expect(process.env.DOCKER_CONTEXT).toBe('attacker');
    expect(process.env.DOCKER_CONFIG).toBe('/injected/attacker');
  });

  it('does not consume an erased caller command as global argv', async () => {
    const supplied = ['-H', 'tcp://attacker:2375', '--context=attacker'];
    expect(buildDockerSpawn(await mintPin(), supplied as never).args).toEqual([]);
    // This proves no argv pass-through, NOT the deferred endpoint-token assertion mutant.
  });

  it('rejects execution even with a genuine pin', async () => {
    await expect(runDockerCommand(await mintPin(), noCommand)).rejects.toMatchObject({
      code: 'not-implemented', message: 'Docker execution is not implemented until slice 3.',
    });
  });
});

describe('runtime Docker interceptor installed by Vitest setup', () => {
  it('rejects a literal named-export spawn before native execution', () => {
    expect(() => spawn('docker', ['-H', 'tcp://attacker:2375', 'info'])).toThrow(forbidden);
  });

  it('rejects the computed-import and base64-executable bypass (R2-2)', async () => {
    const computed = await import('node:' + 'child_process');
    const exe = Buffer.from('ZG9ja2Vy', 'base64').toString();
    expect(() => computed.spawn(exe, ['-H', 'tcp://attacker:2375', 'info'])).toThrow(forbidden);
  });

  it.each(['spawn', 'spawnSync', 'execFile', 'execFileSync'] as const)(
    'guards %s for absolute executable paths and compose', (method) => {
      expect(() => cp[method]('/injected/bin/docker', [])).toThrow(forbidden);
      expect(() => cp[method]('docker-compose', [])).toThrow(forbidden);
    },
  );

  it.each(['exec', 'execSync'] as const)('guards shell API %s', (method) => {
    for (const command of ['docker info', "'/injected/docker' info", '"/injected/docker-compose" version']) {
      expect(() => cp[method](command)).toThrow(forbidden);
    }
  });

  it.each(['connect', 'createConnection'] as const)('guards socket and port overloads of %s', (method) => {
    expect(() => net[method]('/injected/docker.sock')).toThrow(forbidden);
    expect(() => net[method]({ path: '/injected/docker.sock' })).toThrow(forbidden);
    expect(() => net[method](2375, '127.0.0.1')).toThrow(forbidden);
    expect(() => net[method]({ port: 2376, host: '127.0.0.1' })).toThrow(forbidden);
    expect(() => Reflect.apply(net[method], net, ['2375', '127.0.0.1'])).toThrow(forbidden);
  });

  it('guards Socket.connect as used internally by HTTP clients', () => {
    const socket = new net.Socket();
    try { expect(() => socket.connect({ port: 2375 })).toThrow(forbidden); }
    finally { socket.destroy(); }
    expect(() => request({ port: 2375, path: '/v1.51/info' })).toThrow(forbidden);
    expect(() => request({ socketPath: '/injected/docker.sock', path: '/info' })).toThrow(forbidden);
  });

  it('allows an ordinary non-Docker subprocess with Docker-looking arguments', async () => {
    const child = cp.spawn(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', 'docker']);
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    expect(code).toBe(0);
    expect(output).toBe('docker');
  });

  it('preserves ordinary synchronous and shell subprocess results', () => {
    expect(cp.spawnSync(process.execPath, ['-e', 'process.stdout.write("ok")'], { encoding: 'utf8' }))
      .toMatchObject({ status: 0, stdout: 'ok' });
    expect(cp.execSync('printf docker', { encoding: 'utf8' })).toBe('docker');
  });
});
