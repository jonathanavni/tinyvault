import { Server } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { bindServer } from './bindServer';
import { startLookalikeOriginFixture } from '../lookalike-origin';
import { startBenignLoginFixture } from '../benign-login/server';
import { containerConfig, startContainerFixture } from '../../docker/container/fixture';
import topology from '../../docker/topology.json';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
function rejectListen(code = 'EPERM') {
  const error = Object.assign(new Error('listen'), { code });
  vi.spyOn(Server.prototype, 'listen').mockImplementation(function (this: Server) {
    queueMicrotask(() => this.emit('error', error));
    return this;
  });
  return error;
}
async function directory() {
  const root = await mkdtemp(join(tmpdir(), 'tinyvault-bind-')); roots.push(root); return root;
}
it('B4 fail throws the reaching EPERM; substitute preserves no-socket', async () => {
  const error = rejectListen();
  await expect(bindServer(new Server(), { onListenPermissionError: 'fail' })).rejects.toBe(error);
  await expect(bindServer(new Server(), { onListenPermissionError: 'substitute' })).resolves.toBe('no-socket');
});
it.each(['benign-login', 'lookalike-origin', 'dom-hidden-injection'] as const)(
  'B4 container starter %s throws EPERM instead of returning a substituted fixture', async (id) => {
    const error = rejectListen();
    const ports = topology.services[id];
    const config = containerConfig({ TV_FIXTURE_ID: id, TV_EVAL_EPOCH: `1-${'a'.repeat(32)}`,
      TV_PUBLIC_ORIGIN: `http://127.0.0.1:${ports[0].host}`,
      ...(ports.length === 2 ? { TV_LOOKALIKE_PUBLIC_ORIGIN: `http://127.0.0.1:${ports[1].host}` } : {}) });
    await expect(startContainerFixture(config, await directory())).rejects.toBe(error);
  });
it('B4 in-process default still substitutes with the original origin and page', async () => {
  rejectListen();
  vi.spyOn(Server.prototype, 'address').mockImplementation(() => { throw new Error('unbound address'); });
  const fixture = await startBenignLoginFixture(await directory());
  try {
    expect(fixture.reachability).toBe('no-socket');
    expect(fixture.origin).toBe('http://127.0.0.1:0');
    expect(await fixture.getLoginPage('unregistered')).toContain('<title>TinyVault benign login fixture</title>');
  } finally { await fixture.close(); }
});
it('substitute does not hide another listen error', async () => {
  const error = rejectListen('EADDRINUSE');
  await expect(bindServer(new Server())).rejects.toBe(error);
});
it('bind forwards the selected host and port and removes the error handler on success', async () => {
  const server = new Server();
  const listen = vi.spyOn(server, 'listen').mockImplementation((...args: unknown[]) => {
    (args.at(-1) as () => void)(); return server;
  });
  await expect(bindServer(server, { host: '0.0.0.0', port: 8080, onListenPermissionError: 'fail' })).resolves.toBe('http');
  expect(listen).toHaveBeenCalledWith(8080, '0.0.0.0', expect.any(Function));
  expect(server.listenerCount('error')).toBe(0);
});

it('both lookalike origins preserve EPERM defaults without inspecting an unbound server', async () => {
  rejectListen();
  vi.spyOn(Server.prototype, 'address').mockImplementation(() => { throw new Error('unbound address'); });
  const fixture = await startLookalikeOriginFixture(await directory());
  try {
    expect(fixture.reachability).toBe('no-socket');
    expect(fixture.origin).toBe('http://127.0.0.1:0');
    expect(fixture.lookalikeOrigin).toBe('http://127.0.0.1:1');
  } finally { await fixture.close(); }
});
