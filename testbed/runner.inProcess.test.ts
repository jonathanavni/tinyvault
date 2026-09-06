import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { capturePersistedRuns, runEval } from './runner';
import { fakeBrowser, nodeEvalHarness } from './runner.testkit';

const binding = vi.hoisted(() => ({ listen: vi.fn() }));
// Exercise the existing in-process EPERM substitution without attempting a socket bind.
// This is an in-process compatibility control, not the required composed EPERM proof.
vi.mock('node:http', async (original) => ({
  ...await original(),
  createServer: () => {
    const server = new EventEmitter();
    return Object.assign(server, {
      listening: false,
      closeAllConnections: () => {},
      listen: () => {
        binding.listen();
        queueMicrotask(() => server.emit('error', Object.assign(new Error('denied'), { code: 'EPERM' })));
        return server;
      },
    });
  },
}));

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  vi.clearAllMocks();
});

async function harness() {
  const directory = await mkdtemp(join(tmpdir(), 'tinyvault-in-process-ordering-'));
  directories.push(directory);
  const h = nodeEvalHarness(directory, vi.fn);
  const dockerPreflight = vi.fn(async () => { throw new Error('Docker must remain untouched'); });
  h.options.dockerPreflight = dockerPreflight;
  return { ...h, directory, dockerPreflight };
}

it.each([undefined, 'in-process'] as const)('completes the in-process eval with architecture=%s', async (architecture) => {
  const h = await harness();
  h.options.architecture = architecture;
  const result = await runEval(h.options);
  expect(result.runs.length).toBeGreaterThan(0);
  expect(result.runs.every((run) => run.outcome.taskCompleted && !run.outcome.secretLeaked)).toBe(true);
  expect(h.dockerPreflight).not.toHaveBeenCalled();
  expect(binding.listen).toHaveBeenCalled();
  expect(h.launchChromium).toHaveBeenCalledOnce();
  expect(h.closeBrowser).toHaveBeenCalledOnce();
});

it('keeps supplied-browser capture working through the in-process EPERM transport', async () => {
  const h = await harness();
  const close = vi.fn(async () => undefined);
  const trust = await capturePersistedRuns(h.directory, 1, fakeBrowser(close), h.options);
  expect(trust.scenarioRegistry.size).toBeGreaterThan(0);
  expect(binding.listen).toHaveBeenCalled();
  expect(h.dockerPreflight).not.toHaveBeenCalled();
  expect(h.launchChromium).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});
