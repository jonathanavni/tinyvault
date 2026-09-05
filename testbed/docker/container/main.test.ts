// Execute the entry with inert server/fixture dependencies; verify real parent-directory permissions.
import { mkdtemp, mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it, vi } from 'vitest';
import topology from '../topology.json';

const state = vi.hoisted(() => ({ parent: '', ready: false, socket: '' }));
vi.mock('./topology', () => ({ containerTopology: { ...topology,
  get controlSocket() { return join(state.parent, 'control.sock'); },
} }));
vi.mock('./stdoutTripwire', () => ({ installStdoutTripwire: vi.fn() }));
vi.mock('./control', () => ({ createControlServer: vi.fn() }));
vi.mock('./fixture', () => ({
  containerConfig: () => ({}), controlConfigForFixture: () => ({}),
  startContainerFixture: async () => {
    // Reproduce the real fixture's recursive capture-directory creation, with its default mode.
    await mkdir(join(state.parent, 'captures'), { recursive: true });
    return { close: async () => {} };
  },
}));
vi.mock('node:net', () => ({ createServer: () => ({
  on() {}, once() {}, off() {},
  listen(path: string, ready: () => void) { state.socket = path; ready(); state.ready = true; },
}) }));
it('socket parent is mode 0700 before fixture capture creation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tinyvault-main-'));
  state.parent = join(root, 'tinyvault');
  const once = vi.spyOn(process, 'once').mockReturnValue(process);
  const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  try {
    await import('./main');
    await vi.waitFor(() => expect(state.ready).toBe(true));
    expect((await stat(state.parent)).mode & 0o777).toBe(0o700);
    expect((await stat(join(state.parent, 'captures'))).isDirectory()).toBe(true);
    expect(state.socket).toBe(join(state.parent, 'control.sock'));
  } finally { once.mockRestore(); stderr.mockRestore(); await rm(root, { recursive: true, force: true }); }
});
