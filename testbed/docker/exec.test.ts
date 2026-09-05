import cp, { spawn } from 'node:child_process';
import { request } from 'node:http';
import net from 'node:net';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDockerSpawn, createDockerProcessRunner, COMMAND_TIMEOUT_MS, runDockerCommand, type DockerCommand } from './exec';
import { dockerPreflight, DockerPreflightError, type PinnedDockerEndpoint } from './preflight';

const noCommand: DockerCommand = { kind: 'image-inspect' };
const runner = { run: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })), spawnLongLived: vi.fn() };
const forbidden = /Docker access forbidden during tests:/;
const forbiddenConnection = /Unix socket access forbidden during Docker-free tests\./;

function mintPin() {
  return dockerPreflight({
    env: {}, files: { readFile: async () => undefined },
    realpath: async () => '/injected/canonical.sock',
    stat: async () => ({ isSocket: () => true }),
  });
}

afterEach(() => vi.unstubAllEnvs());

describe('slice 2 Docker choke point', () => {
  it('has executable closed command variants at compile time', () => {
    const empty: [DockerCommand] extends [never] ? true : false = false;
    expect(empty).toBe(false);
  });

  it.each([undefined, null, 'unix:///tmp/forged.sock', { dockerHost: 'unix:///tmp/forged.sock' }])(
    'checks pin provenance first in both entry points: %j', async (forgery) => {
      const pin = forgery as PinnedDockerEndpoint;
      expect(() => buildDockerSpawn(pin, noCommand)).toThrow(DockerPreflightError);
      expect(() => buildDockerSpawn(pin, noCommand)).toThrow(expect.objectContaining({ code: 'unpinned' }));
      await expect(runDockerCommand(pin, noCommand, runner)).rejects.toMatchObject({ code: 'unpinned' });
    },
  );

  it('rejects a reflection clone at the executor boundary', async () => {
    const real = await mintPin();
    const clone = Object.create(Object.getPrototypeOf(real), Object.getOwnPropertyDescriptors(real));
    expect(() => buildDockerSpawn(clone, noCommand)).toThrow(expect.objectContaining({ code: 'unpinned' }));
    await expect(runDockerCommand(clone, noCommand, runner)).rejects.toMatchObject({ code: 'unpinned' });
  });

  it('checks provenance before reading any supplied endpoint property', () => {
    const dockerHost = vi.fn(() => { throw new Error('must not read forgery'); });
    const forgery = Object.create(null, { dockerHost: { get: dockerHost } });
    expect(() => buildDockerSpawn(forgery, noCommand)).toThrow(expect.objectContaining({ code: 'unpinned' }));
    expect(dockerHost).not.toHaveBeenCalled();
  });
});

describe('slice 2 Docker command construction', () => {
  it('pins the child environment and removes both ambient selectors without mutating the parent', async () => {
    vi.stubEnv('DOCKER_HOST', 'tcp://attacker:2375');
    vi.stubEnv('DOCKER_CONTEXT', 'attacker');
    vi.stubEnv('DOCKER_CONFIG', '/injected/attacker');
    vi.stubEnv('TINYVAULT_EXEC_CONTROL', 'retained');
    const result = buildDockerSpawn(await mintPin(), noCommand);
    expect(result).toMatchObject({ file: 'docker', args: ['image', 'inspect', 'tinyvault-fixture:local'], env: {
      DOCKER_HOST: 'unix:///injected/canonical.sock',
    } });
    expect(Object.hasOwn(result.env, 'TINYVAULT_EXEC_CONTROL')).toBe(false);
    expect(Object.hasOwn(result.env, 'DOCKER_CONTEXT')).toBe(false);
    expect(Object.hasOwn(result.env, 'DOCKER_CONFIG')).toBe(false);
    expect(process.env.DOCKER_HOST).toBe('tcp://attacker:2375');
    expect(process.env.DOCKER_CONTEXT).toBe('attacker');
    expect(process.env.DOCKER_CONFIG).toBe('/injected/attacker');
  });

  it('does not consume an erased caller command as global argv', async () => {
    const supplied = ['-H', 'tcp://attacker:2375', '--context=attacker'];
    const pin = await mintPin();
    expect(() => buildDockerSpawn(pin, supplied as never)).toThrow(expect.objectContaining({ code: 'command-invalid' }));
    // This proves no argv pass-through, NOT the deferred endpoint-token assertion mutant.
  });

  it('executes a closed command with a genuine pin through an injected runner', async () => {
    await expect(runDockerCommand(await mintPin(), noCommand, runner)).resolves.toMatchObject({ exitCode: 0 });
  });
});

describe('runtime Docker interceptor installed by Vitest setup', () => {
  afterEach(() => vi.restoreAllMocks());
  it('rejects a literal named-export spawn before native execution', () => {
    expect(() => spawn('docker', ['-H', 'tcp://attacker:2375', 'info'])).toThrow(forbidden);
  });

  it('rejects the computed-import and base64-executable bypass (R2-2)', async () => {
    guardProbe('', `
      const computed = await import('node:' + 'child_process');
      const exe = Buffer.from('ZG9ja2Vy', 'base64').toString();
      throws(() => computed.spawn(exe, ['-H', 'tcp://attacker:2375', 'info']), /Docker access forbidden during tests:/);
    `);
  });

  it.each(['spawn', 'spawnSync', 'execFile', 'execFileSync'] as const)(
    'guards %s for absolute executable paths and compose', (method) => {
      const downstream = vi.spyOn(spawnPrototype, 'spawn').mockImplementation(() => {
        throw new Error('unguarded downstream spawn reached');
      });
      expect(() => cp[method]('/injected/bin/docker', [])).toThrow(forbidden);
      expect(() => cp[method]('docker-compose', [])).toThrow(forbidden);
      expect(downstream).not.toHaveBeenCalled();
    },
  );

  it.each(['exec', 'execSync'] as const)('guards shell API %s', (method) => {
    const downstream = vi.spyOn(cp, 'execFile').mockImplementation(() => {
      throw new Error('unguarded downstream execFile reached');
    });
    for (const command of ['docker info', "'/injected/docker' info", '"/injected/docker-compose" version']) {
      expect(() => cp[method](command)).toThrow(forbidden);
    }
    expect(downstream).not.toHaveBeenCalled();
  });
});

describe('runtime Docker interceptor connections and subprocess controls', () => {
  it.each(['connect', 'createConnection'] as const)('guards socket and port overloads of %s', (method) => {
    expect(() => net[method]('/injected/docker.sock')).toThrow(forbiddenConnection);
    expect(() => net[method]({ path: '/injected/docker.sock' })).toThrow(forbiddenConnection);
    expect(() => net[method](2375, '127.0.0.1')).toThrow(forbidden);
    expect(() => net[method]({ port: 2376, host: '127.0.0.1' })).toThrow(forbidden);
    expect(() => Reflect.apply(net[method], net, ['2375', '127.0.0.1'])).toThrow(forbidden);
  });

  it('guards Socket.connect as used internally by HTTP clients', () => {
    const socket = new net.Socket();
    try { expect(() => socket.connect({ port: 2375 })).toThrow(forbidden); }
    finally { socket.destroy(); }
    expect(() => request({ port: 2375, path: '/v1.51/info' })).toThrow(forbidden);
    expect(() => request({ socketPath: '/injected/docker.sock', path: '/info' })).toThrow(forbiddenConnection);
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

  it.each(['spawnSync', 'execFileSync'] as const)('%s preserves benign joined shell arguments', (method) => {
    const options = { shell: true, encoding: 'utf8' } as const;
    const output = method === 'spawnSync'
      ? cp.spawnSync('printf', ['docker'], options).stdout : cp.execFileSync('printf', ['docker'], options);
    expect(output).toBe('docker');
  });
});

const setupPath = fileURLToPath(new URL('./no-docker.setup.ts', import.meta.url));
const spawnPrototype = cp.ChildProcess.prototype as unknown as { spawn(options: unknown): unknown };

function guardProbe(beforeSetup: string, assertion: string): void {
  // Install the real setup in a fresh process, with optional native-boundary test doubles.
  const script = `
    import cp from 'node:child_process';
    import net from 'node:net';
    import { promisify } from 'node:util';
    import { readFileSync } from 'node:fs';
    import { rejects, throws, equal } from 'node:assert/strict';
    import ts from 'typescript';
    ${beforeSetup}
    const source = readFileSync(process.argv[1], 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    });
    await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
    ${assertion}
  `;
  const result = cp.spawnSync(process.execPath, ['--input-type=module', '-e', script, setupPath], {
    encoding: 'utf8', timeout: 10_000,
  });
  expect({ status: result.status, error: result.error, stderr: result.stderr })
    .toEqual({ status: 0, error: undefined, stderr: '' });
}

function promisifiedProbe(method: 'exec' | 'execFile', shell: boolean): void {
  // Remove only the exported execFile wrapper to isolate the shared spawn guard for exec.
  guardProbe('const originalExecFile = cp.execFile;', `
    const invoke = promisify(cp.${method});
    if ('${method}' === 'exec') cp.execFile = originalExecFile;
    const command = ${shell} ? "'/nonexistent/docker' --version" : '/nonexistent/docker';
    await rejects(async () => invoke(command, { shell: ${shell} }), /Docker access forbidden during tests:/);
  `);
}

describe('env launcher guard deletion regressions', () => {
  it.each(['spawn', 'spawnSync', 'execFile', 'execFileSync'] as const)('%s checks the first non-option env argument', (method) => {
    guardProbe(`let calls = 0; cp.${method} = () => { calls++; };`, `
      for (const argv of [['docker', 'info'], ['--', '/nonexistent/docker-compose', 'version']]) {
        throws(() => cp.${method}('/usr/bin/env', argv), /Docker access forbidden during tests:/);
      }
      equal(calls, 0);
      cp.${method}('/usr/bin/env', ['node', 'docker']); equal(calls, 1);
    `);
  });
  it('checks normalized named-export spawn and env shell commands', () => {
    guardProbe('import { spawn as namedSpawn } from "node:child_process"; let calls = 0; cp.ChildProcess.prototype.spawn = () => { calls++; }; cp.execSync = () => { calls++; };', `
      throws(() => namedSpawn('/usr/bin/env', ['docker', 'info']), /Docker access forbidden during tests:/);
      throws(() => cp.execSync('/usr/bin/env -- docker info'), /Docker access forbidden during tests:/);
      equal(calls, 0);
    `);
  });
});

describe('runtime guard deletion regressions', () => {
  afterEach(() => vi.restoreAllMocks());
  it('shared spawn guard rejects promisified execFile (F2)', () => promisifiedProbe('execFile', false));
  it('shared spawn guard rejects promisified exec with exported execFile guard removed (F2)', () => {
    promisifiedProbe('exec', true);
  });
  it('shared spawn guard rejects promisified execFile with shell:true (F2)', () => {
    promisifiedProbe('execFile', true);
  });

  it('rejects direct ChildProcess.prototype.spawn before native execution (F2)', () => {
    const child = new cp.ChildProcess();
    // The missing executable and error handler keep a deleted-guard mutant Docker-free.
    child.on('error', () => {});
    expect(() => Reflect.apply(spawnPrototype.spawn, child, [{
      file: '/nonexistent/docker', args: ['/nonexistent/docker', '--version'],
    }])).toThrow(forbidden);
  });

  it.each(['spawn', 'spawnSync', 'execFile', 'execFileSync'] as const)(
    'exported %s guard rejects shell:true without downstream masking (F2)', (method) => {
      // Async methods must reject above the prototype; sync methods never use it.
      const downstream = vi.spyOn(spawnPrototype, 'spawn').mockImplementation(() => {
        throw new Error('unguarded downstream spawn reached');
      });
      for (const options of [{ shell: true }, { shell: '/bin/sh' }]) {
        expect(() => Reflect.apply(cp[method], cp, ["'/nonexistent/docker' --version", options])).toThrow(forbidden);
        expect(() => Reflect.apply(cp[method], cp, ["'/nonexistent/docker' --version", [], options])).toThrow(forbidden);
        expect(() => Reflect.apply(cp[method], cp, ["'/nonexistent/docker' --version", undefined, options])).toThrow(forbidden);
        expect(() => Reflect.apply(cp[method], cp, ["'/nonexistent/docker' --version", null, options])).toThrow(forbidden);
      }
      expect(downstream).not.toHaveBeenCalled();
    },
  );
});

describe('runtime connection guard deletion regressions', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(['connect', 'createConnection'] as const)(
    'exported net.%s rejects independently of Socket.connect (F5 option b)', (method) => {
      // Deleting either exported wrapper reaches this spy, which cannot dial anything.
      const downstream = vi.spyOn(net.Socket.prototype, 'connect').mockReturnThis();
      expect(() => net[method]('/injected/docker.sock')).toThrow(forbiddenConnection);
      expect(downstream).not.toHaveBeenCalled();
    },
  );

  it.each(['/tmp/engine.sock', '/tmp/engine', '\u0000engine'])(
    'rejects Unix sockets regardless of basename at Socket.connect (F3): %j', (path) => {
      // The native boundary is inert even with the Unix-socket rejection deleted.
      guardProbe('net.Socket.prototype.connect = function () { return this; };', `
        const socket = new net.Socket();
        const path = ${JSON.stringify(path)};
        throws(() => socket.connect(path), /Unix socket access forbidden during Docker-free tests\./);
        throws(() => socket.connect({ path }), /Unix socket access forbidden during Docker-free tests\./);
        throws(() => socket.connect([{ path }]), /Unix socket access forbidden during Docker-free tests\./);
        socket.destroy();
      `);
    },
  );

  it('preserves non-Docker TCP overloads without dialing', () => {
    guardProbe('let calls = 0; net.Socket.prototype.connect = function () { calls++; return this; };', `
      const socket = new net.Socket();
      socket.connect(8080, '127.0.0.1');
      socket.connect('8080', '127.0.0.1');
      socket.connect({ port: 8080 });
      socket.connect([{ port: 8080 }]);
      equal(calls, 4);
      socket.destroy();
    `);
  });
});

describe('synchronous shell normalization deletion regressions (round 2 P1)', () => {
  it.each(['spawnSync', 'execFileSync'] as const)(
    '%s rejects Docker in joined shell argv independently of other guards', (method) => {
      // Stub the original export before setup: deleting this wrapper or its join cannot run Docker.
      guardProbe(`let calls = 0; cp.${method} = () => { calls++; };`, `
        for (const shell of [true, '/bin/sh']) {
          throws(() => cp.${method}(' ', ['docker', '--version'], { shell }),
            /Docker access forbidden during tests:/);
          throws(() => cp.${method}('', ['docker-compose', 'version'], { shell }),
            /Docker access forbidden during tests:/);
        }
        equal(calls, 0);
      `);
    },
  );

  it.each(['spawnSync', 'execFileSync', 'execSync'] as const)(
    '%s rejects a custom Docker shell independently of command inspection', (method) => {
      guardProbe(`let calls = 0; cp.${method} = () => { calls++; };`, `
        for (const shell of ['/injected/bin/docker', '/injected/bin/docker-compose']) {
          throws(() => cp.${method}('printf ok', { shell }), /Docker access forbidden during tests:/);
        }
        equal(calls, 0);
      `);
    },
  );
});

// Stub the native child boundary before calling the sole production runner; no subprocess is created.
it('production run registers its handle synchronously and returns both byte-preserving streams', async () => {
  vi.spyOn(spawnPrototype, 'spawn').mockImplementation(function (this: cp.ChildProcess) {
    this.stdin = new PassThrough(); this.stdout = new PassThrough(); this.stderr = new PassThrough();
    queueMicrotask(() => {
      (this.stdout as PassThrough).end(Buffer.from([0x80, 0xff]));
      (this.stderr as PassThrough).end('stderr'); this.emit('close', 0);
    });
  });
  try {
    const registry = { register: vi.fn() }; const runner = createDockerProcessRunner(registry);
    const description = buildDockerSpawn(await mintPin(), { kind: 'image-inspect' });
    const result = runner.run(description);
    expect(registry.register).toHaveBeenCalledOnce();
    expect(await result).toEqual({ stdout: Buffer.from([0x80, 0xff]).toString('latin1'), stderr: 'stderr', exitCode: 0 });
  } finally { vi.restoreAllMocks(); }
});
it('production run kills its registered child when command-timeout expires', async () => {
  const pin = await mintPin(); vi.useFakeTimers();
  vi.spyOn(spawnPrototype, 'spawn').mockImplementation(function (this: cp.ChildProcess) {
    this.stdin = new PassThrough(); this.stdout = new PassThrough(); this.stderr = new PassThrough();
  });
  const kill = vi.spyOn(cp.ChildProcess.prototype, 'kill').mockReturnValue(true);
  try {
    const registry = { register: vi.fn() }; const runner = createDockerProcessRunner(registry);
    const result = runner.run(buildDockerSpawn(pin, { kind: 'image-inspect' }));
    const assertion = expect(result).rejects.toMatchObject({ code: 'command-timeout' });
    await vi.advanceTimersByTimeAsync(COMMAND_TIMEOUT_MS); await assertion;
    expect(registry.register).toHaveBeenCalledOnce(); expect(kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
  } finally { vi.restoreAllMocks(); vi.useRealTimers(); }
});
