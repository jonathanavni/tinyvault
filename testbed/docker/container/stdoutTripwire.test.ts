// Fake process objects exercise instance aliases only; bundle identity and fd bypasses require Job C.
import { PassThrough } from 'node:stream';
import importedProcessAlias from 'node:process';
import { expect, it, vi } from 'vitest';
import { installStdoutTripwire } from './stdoutTripwire';

// The aliased import resolves to a fake process; the runner's real streams are never patched.
vi.mock('node:process', () => ({ default: {} }));

function setup() {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const fakeConsole = { log: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() };
  const processLike = { stdout, console: fakeConsole };
  const exit = vi.fn();
  const bound = installStdoutTripwire(processLike, stderr, exit);
  return { processLike, stdout, stderr, fakeConsole, exit, bound };
}
it('aliased node:process writer trips the patched instance', () => {
  const p = setup();
  Object.assign(importedProcessAlias, p.processLike);
  const { stdout } = importedProcessAlias;
  const write = stdout.write.bind(stdout);
  expect(() => write('synthetic payload')).toThrow('bridge-closed');
  expect(p.exit).toHaveBeenCalledWith(1);
  expect(p.stderr.read().toString()).toBe('bridge-closed\n');
  expect(p.stdout.read()).toBeNull();
});
it('console.debug trips with nonzero exit', () => {
  const p = setup();
  expect(() => p.fakeConsole.debug()).toThrow('bridge-closed');
  expect(p.exit).toHaveBeenCalledWith(1);
});
it('process.stdout.end chunk trips with nonzero exit', () => {
  const p = setup();
  expect(() => p.processLike.stdout.end('synthetic payload')).toThrow('bridge-closed');
  expect(p.exit).toHaveBeenCalledWith(1);
  expect(p.stdout.read()).toBeNull();
});
it('bound original writer still forwards exact bytes', () => {
  const p = setup();
  const bytes = Buffer.from([0, 0, 0, 1, 123]);
  p.bound(bytes);
  expect(p.stdout.read()).toEqual(bytes);
  expect(p.exit).not.toHaveBeenCalled();
  expect(p.stderr.read()).toBeNull();
});
