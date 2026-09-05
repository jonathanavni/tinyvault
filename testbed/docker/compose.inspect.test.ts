// One wrong daemon field per row; these assertions test trusted-boundary hygiene, not isolation.
import { afterEach, expect, it, vi } from 'vitest';
import { capturePersistedRuns } from '../runner';
import * as fixtures from '../fixtures';
import { INSPECT_FIELDS } from './compose';
import { startComposedFixtureSet } from './composedFixtures';
import { fakeProject, kindOf } from './compose.testkit';

const rows = [
  ['.State.Running', 'not-running', 'State.Running', false],
  ['.State.Health.Status', 'not-healthy', 'State.Health.Status', 'starting'],
  ['.Image', 'image-mismatch', 'Image', 'sha256:' + 'e'.repeat(64)],
  ['.Created', 'created-before-epoch', 'Created', '2000-01-01T00:00:00Z'],
  [".Config.Labels['com.tinyvault.fixture']", 'label-fixture', ['Config', 'Labels', 'com.tinyvault.fixture'], 'lookalike-origin'],
  [".Config.Labels['com.tinyvault.epoch']", 'label-epoch', ['Config', 'Labels', 'com.tinyvault.epoch'], 'other'],
  [".Config.Labels['com.docker.compose.project']", 'label-compose-project', ['Config', 'Labels', 'com.docker.compose.project'], 'other'],
  [".Config.Labels['com.docker.compose.service']", 'label-compose-service', ['Config', 'Labels', 'com.docker.compose.service'], 'other'],
  ['.Config.Hostname', 'hostname-mismatch', 'Config.Hostname', 'f'.repeat(12)],
  ['.Config.User', 'user-mismatch', 'Config.User', '0'],
  ['.Config.Env', 'env-unexpected', 'Config.Env', ['EVIL=yes']],
  ['.Config.Cmd,.Config.Entrypoint', 'command-overridden', 'Config.Cmd', ['other']],
  ['.HostConfig.NetworkMode', 'network-mode', 'HostConfig.NetworkMode', 'host'],
  ['.HostConfig.Privileged', 'privileged', 'HostConfig.Privileged', true],
  ['.HostConfig.PidMode,.HostConfig.IpcMode', 'namespace-shared', 'HostConfig.PidMode', 'host'],
  ['.HostConfig.CapAdd', 'capability-added', 'HostConfig.CapAdd', ['SYS_ADMIN']],
  ['.HostConfig.Devices', 'device-added', 'HostConfig.Devices', [{}]],
  ['.HostConfig.Binds', 'bind-present', 'HostConfig.Binds', ['/tmp:/tmp']],
  ['.Mounts', 'mount-present', 'Mounts', [{}]],
  ['.NetworkSettings.Networks', 'network-membership', 'NetworkSettings.Networks', { other: {} }],
  ['.NetworkSettings.Ports', 'port-mismatch', 'NetworkSettings.Ports', { '8080/tcp': [{ HostIp: '0.0.0.0', HostPort: '47110' }] }],
] as const;
const disposals: (() => Promise<void>)[] = [];
afterEach(async () => { for (const dispose of disposals.splice(0)) await dispose(); vi.restoreAllMocks(); });
it('test field inventory equals the exported verifier inventory in both directions', () => {
  expect(rows.map(([field]) => field)).toEqual(INSPECT_FIELDS);
});
it.each(rows)('rejects inspect field %s with %s', async (_field, code, path, value) => {
  const h = await fakeProject(vi.fn, { inspect(doc) {
    doc.Created = new Date().toISOString();
    const parts = typeof path === 'string' ? path.split('.') : [...path];
    let object: any = doc;
    for (const key of parts.slice(0, -1)) object = object[key];
    object[parts.at(-1)!] = value;
  } });
  disposals.push(h.dispose);
  const fallback = vi.spyOn(fixtures, 'startFixtures').mockRejectedValue(new Error('fallback'));
  const injectedFallback = vi.fn();
  await expect(capturePersistedRuns(h.root, 1, undefined, { architecture: 'composed',
    dockerPreflight: async () => h.options.pin, dockerRunner: h.runner, probeOrigin: h.options.probeOrigin,
    launchChromium: async () => ({ close: vi.fn() }) as never, startFixtures: injectedFallback,
  })).rejects.toMatchObject({ code });
  expect(fallback).not.toHaveBeenCalled(); expect(injectedFallback).not.toHaveBeenCalled();
  expect(h.runner.spawnLongLived.mock.calls.some(([spawn]) => kindOf(spawn) === 'exec-bridge')).toBe(false);
  expect(h.spawns.filter((s) => kindOf(s) === 'compose-down')).toHaveLength(1);
});
it.each([
  ['entrypoint', 'command-overridden'], ['ipc', 'namespace-shared'], ['null-port', 'port-mismatch'], ['extra-port', 'port-mismatch'],
] as const)('checks the secondary member of %s', async (field, code) => {
  const h = await fakeProject(vi.fn, { inspect(doc) {
    if (field === 'entrypoint') doc.Config.Entrypoint = ['other'];
    if (field === 'ipc') doc.HostConfig.IpcMode = 'host';
    if (field === 'null-port') (doc.NetworkSettings.Ports as any)['8080/tcp'] = null;
    if (field === 'extra-port') doc.NetworkSettings.Ports['9000/tcp'] = [{ HostIp: '127.0.0.1', HostPort: '9000' }];
  } });
  disposals.push(h.dispose);
  await expect(startComposedFixtureSet(h.options)).rejects.toMatchObject({ code });
});
it.each(['', 'private'])('accepts Docker IPC mode %j with empty PID mode', async (mode) => {
  const h = await fakeProject(vi.fn, { inspect(doc) { doc.HostConfig.IpcMode = mode; } });
  disposals.push(h.dispose);
  const set = await startComposedFixtureSet(h.options);
  expect(Object.keys(set)).toHaveLength(3);
  await set['benign-login']!.close();
});
it.each(['shareable', 'container:' + 'a'.repeat(64)])('rejects shared IPC mode %s', async (mode) => {
  const h = await fakeProject(vi.fn, { inspect(doc) { doc.HostConfig.IpcMode = mode; } });
  disposals.push(h.dispose);
  await expect(startComposedFixtureSet(h.options)).rejects.toMatchObject({ code: 'namespace-shared' });
});
