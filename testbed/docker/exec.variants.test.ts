// Exact argv assertions exercise the real builder before an inert runner. No Docker operation runs here.
import { afterEach, expect, it, vi } from 'vitest';
import { buildDockerSpawn, COMMAND_KINDS, COMPOSE_FILE, containerId, runDockerCommand,
  type DockerCommand } from './exec';
import { mintPin } from './compose.testkit';

const id = containerId('a'.repeat(64));
const project = 'tinyvault-123'; const epoch = '1788600000000-' + 'b'.repeat(32);
const prefix = ['compose', '--env-file', '/dev/null', '--progress', 'quiet', '--ansi', 'never', '-f', COMPOSE_FILE, '-p', project];
const rows: [DockerCommand, string[]][] = [
  [{ kind: 'compose-ps-all', project, epoch }, [...prefix, 'ps', '-aq']],
  [{ kind: 'compose-build', project, epoch }, [...prefix, 'build']],
  [{ kind: 'compose-up', project, epoch }, [...prefix, 'up', '-d', '--wait', '--wait-timeout', '60', '--no-build']],
  [{ kind: 'compose-ps', project, epoch, service: 'benign-login' }, [...prefix, 'ps', '-q', 'benign-login']],
  [{ kind: 'compose-stop', project, epoch }, [...prefix, 'stop', '--timeout', '10']],
  [{ kind: 'compose-down', project, epoch }, [...prefix, 'down', '--remove-orphans']],
  [{ kind: 'image-inspect' }, ['image', 'inspect', 'tinyvault-fixture:local']],
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
it.each(['-p', 'Upper', 'a'.repeat(64), 'with space', 'valid\n'])(
  'rejects malformed project or service %j before spawn', async (bad) => {
    const pin = await mintPin(); const runner = { run: vi.fn(), spawnLongLived: vi.fn() };
    for (const command of [
      { kind: 'compose-build', project: bad, epoch },
      { kind: 'compose-ps', project, epoch, service: bad },
    ] as const) await expect(runDockerCommand(pin, command, runner)).rejects.toMatchObject({ code: 'command-invalid' });
    expect(runner.run).not.toHaveBeenCalled();
  },
);
