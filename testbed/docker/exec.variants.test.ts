// Exact argv assertions exercise the real builder before an inert runner. No Docker operation runs here.
import { afterEach, expect, it, vi } from 'vitest';
import { buildDockerSpawn, COMMAND_KINDS, COMMAND_TIMEOUT_MS, COMPOSE_FILE, containerId, runDockerCommand,
  type DockerCommand } from './exec';
import { imageId, mintPin } from './compose.testkit';

const id = containerId('a'.repeat(64));
const project = 'tinyvault-123'; const epoch = '1788600000000-' + 'b'.repeat(32);
const prefix = ['compose', '--env-file', '/dev/null', '--progress', 'quiet', '--ansi', 'never', '-f', COMPOSE_FILE, '-p', project];
const rows: [DockerCommand, string[]][] = [
  [{ kind: 'ps-project', project, epoch }, ['ps', '-aq', '--filter', `label=com.docker.compose.project=${project}`]],
  [{ kind: 'compose-build', project, epoch }, [...prefix, 'build']],
  [{ kind: 'compose-up', project, epoch }, [...prefix, 'up', '-d', '--wait', '--wait-timeout', '60', '--no-build']],
  [{ kind: 'compose-ps', project, epoch, service: 'benign-login' }, [...prefix, 'ps', '-q', 'benign-login']],
  [{ kind: 'compose-stop', project, epoch }, [...prefix, 'stop', '--timeout', '10']],
  [{ kind: 'compose-down', project, epoch }, [...prefix, 'down', '--remove-orphans']],
  [{ kind: 'image-inspect' }, ['image', 'inspect', 'tinyvault-fixture:local']],
  [{ kind: 'image-history', id: imageId }, ['history', '--no-trunc', '--format', '{{json .}}', imageId]],
  [{ kind: 'inspect', id }, ['inspect', '--type', 'container', id]],
  [{ kind: 'logs', id }, ['logs', id]],
  [{ kind: 'export', id }, ['export', id]],
  [{ kind: 'exec-bridge', id }, ['exec', '-i', id, 'node', '/app/bridge.mjs']],
];
afterEach(() => vi.unstubAllEnvs());
it('snapshots cover exactly the closed variant inventory', () => {
  expect(rows.map(([c]) => c.kind)).toEqual(COMMAND_KINDS);
  // @ts-expect-error A service selector is not a validated immutable container id.
  const forbidden: DockerCommand = { kind: 'exec-bridge', id: 'benign-login' };
  expect(forbidden.kind).toBe('exec-bridge');
});
it.each(rows)('R2-4 exact argv for %j', async (command, args) => {
  const pin = await mintPin();
  vi.stubEnv('COMPOSE_ENV_FILES', '/evil'); vi.stubEnv('TV_EVAL_EPOCH', 'ambient');
  vi.stubEnv('DOCKER_HOST', 'tcp://evil'); vi.stubEnv('DOCKER_CONTEXT', 'evil');
  vi.stubEnv('DOCKER_CONFIG', '/evil'); vi.stubEnv('DOCKER_BUILDKIT', '0');
  vi.stubEnv('DOCKER_DEFAULT_PLATFORM', 'evil'); vi.stubEnv('TV_SECRET', 'private');
  const expected = buildDockerSpawn(pin, command);
  expect(expected.args).toEqual(args);
  expect(Object.keys(expected.env).sort()).toEqual([
    ...['PATH', 'HOME', 'TMPDIR'].filter((k) => process.env[k] !== undefined), 'DOCKER_HOST',
    ...('epoch' in command ? ['TV_EVAL_EPOCH'] : []),
  ].sort());
  expect(expected.env.DOCKER_HOST).toBe('unix:///injected/canonical.sock');
  if ('epoch' in command) expect(expected.env.TV_EVAL_EPOCH).toBe(epoch);
  const runner = { run: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })), spawnLongLived: vi.fn(() => ({} as never)) };
  await runDockerCommand(pin, command, runner);
  expect(command.kind === 'export' || command.kind === 'exec-bridge' ? runner.spawnLongLived : runner.run)
    .toHaveBeenCalledExactlyOnceWith(expected);
});
it.each(['benign-login', '-H', 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), 'a'.repeat(64) + '\n'])(
  'rejects noncanonical id %j before spawn', async (bad) => {
    const runner = { run: vi.fn(), spawnLongLived: vi.fn() };
    await expect(runDockerCommand(await mintPin(), { kind: 'exec-bridge', id: bad as never }, runner))
      .rejects.toMatchObject({ code: 'command-invalid' });
    expect(runner.spawnLongLived).not.toHaveBeenCalled(); expect(runner.run).not.toHaveBeenCalled();
  },
);
it.each(['-H', '--host', '--host=tcp://evil:2375', '-c', '--context=evil', 'tcp://evil:2375',
  'unix:///evil.sock', 'tinyvault-fixture:local', 'f'.repeat(64), 'sha256:' + 'F'.repeat(64),
  'sha256:' + 'f'.repeat(63), 'sha256:' + 'f'.repeat(65), imageId + '\n', imageId + ' --host tcp://evil'])(
  'image-history rejects endpoint tokens and noncanonical image id %j before runner', async (bad) => {
    const runner = { run: vi.fn(), spawnLongLived: vi.fn() };
    await expect(runDockerCommand(await mintPin(), { kind: 'image-history', id: bad }, runner))
      .rejects.toMatchObject({ code: 'command-invalid' });
    expect(runner.run).not.toHaveBeenCalled(); expect(runner.spawnLongLived).not.toHaveBeenCalled();
  },
);
it.each([rows[0][0], { kind: 'image-history', id: imageId }] as const)(
  '%j run is bounded and reports its command on timeout', async (command) => {
    const pin = await mintPin();
    let timeout!: () => void;
    const clock = { setTimeout: vi.fn((cb: () => void) => { timeout = cb; return cb; }), clearTimeout: vi.fn() };
    const runner = { run: vi.fn(() => new Promise<never>(() => {})), spawnLongLived: vi.fn() };
    const result = runDockerCommand(pin, command, runner, clock);
    const assertion = expect(result).rejects.toMatchObject({ code: 'command-timeout', command: command.kind });
    await Promise.resolve(); timeout(); await assertion;
    expect(clock.setTimeout).toHaveBeenCalledWith(expect.any(Function), COMMAND_TIMEOUT_MS);
    expect(clock.clearTimeout).toHaveBeenCalledWith(timeout);
    expect(runner.run).toHaveBeenCalledOnce(); expect(runner.spawnLongLived).not.toHaveBeenCalled();
  },
);
it('image-history emits the same immutable id value it validated', async () => {
  let reads = 0;
  const command: DockerCommand = { kind: 'image-history', get id() { return ++reads === 1 ? imageId : '--host'; } };
  const runner = { run: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })), spawnLongLived: vi.fn() };
  await runDockerCommand(await mintPin(), command, runner);
  expect(reads).toBe(1);
  expect(runner.run.mock.calls[0]).toEqual([expect.objectContaining({
    args: ['history', '--no-trunc', '--format', '{{json .}}', imageId],
  })]);
});
it.each(['-H', '--host', '--host=tcp://evil:2375', '-c', '--context=evil', '-p', 'Upper', 'a'.repeat(64), 'with space', 'valid\n'])(
  'rejects malformed project or service %j before spawn', async (bad) => {
    const pin = await mintPin(); const runner = { run: vi.fn(), spawnLongLived: vi.fn() };
    for (const command of [
      { kind: 'ps-project', project: bad, epoch },
      { kind: 'compose-build', project: bad, epoch },
      { kind: 'compose-ps', project, epoch, service: bad },
    ] as const) await expect(runDockerCommand(pin, command, runner)).rejects.toMatchObject({ code: 'command-invalid' });
    expect(runner.run).not.toHaveBeenCalled();
  },
);

it.each([{ entry: '/tmp/x.mjs' }, { service: 'lookalike-origin' }])(
  'caller fields %j cannot alter exec-bridge argv', async (extra) => {
    const spawn = buildDockerSpawn(await mintPin(), { kind: 'exec-bridge', id, ...extra } as never);
    expect(spawn.args).toEqual(['exec', '-i', id, 'node', '/app/bridge.mjs']);
  },
);
