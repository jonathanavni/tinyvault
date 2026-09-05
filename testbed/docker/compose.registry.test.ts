// Registry cleanup is tested with inert process handles; production registration is covered in exec.test.ts.
import { expect, it, vi } from 'vitest';
import { HandleRegistry } from './compose';
import { KILL_TIMEOUT_MS } from './exec';
it('registry kills every registered short-lived handle exactly once', async () => {
  const registry = new HandleRegistry();
  const handles = Array.from({ length: 3 }, () => ({ kill: vi.fn(), exited: Promise.resolve(0) }));
  for (const handle of handles) registry.register(handle);
  registry.register(handles[0]);
  const clock = { setTimeout: (cb: () => void, ms: number) => setTimeout(cb, ms),
    clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
  await registry.close(clock); await registry.close(clock);
  for (const handle of handles) expect(handle.kill).toHaveBeenCalledOnce();
});
it('registry bounds the wait for a handle that never exits', async () => {
  const registry = new HandleRegistry(); const kill = vi.fn();
  registry.register({ kill, exited: new Promise(() => {}) });
  let timeout!: () => void;
  const clock = { setTimeout: vi.fn((cb: () => void) => { timeout = cb; return cb; }), clearTimeout: vi.fn() };
  const closing = registry.close(clock);
  const assertion = expect(closing).rejects.toMatchObject({ code: 'handle-timeout' });
  timeout(); await assertion;
  expect(kill).toHaveBeenCalledOnce(); expect(clock.setTimeout).toHaveBeenCalledWith(expect.any(Function), KILL_TIMEOUT_MS);
});

it('export timeout kills the handle and completes remaining scans before down', async () => {
  const { fakeProject, kindOf } = await import('./compose.testkit');
  const { createComposedProject } = await import('./compose');
  const { PassThrough } = await import('node:stream');
  const { COMMAND_TIMEOUT_MS } = await import('./exec');
  const h = await fakeProject(vi.fn);
  const p = await createComposedProject(h.options);
  const events: string[] = [];
  const originalRun = h.runner.run.getMockImplementation()!;
  h.runner.run.mockImplementation(async (spawn) => { events.push(kindOf(spawn)); return originalRun(spawn); });
  const originalSpawn = h.runner.spawnLongLived.getMockImplementation()!;
  const kill = vi.fn(); let first = true;
  h.runner.spawnLongLived.mockImplementation((spawn) => {
    events.push(kindOf(spawn));
    if (!first) return originalSpawn(spawn);
    first = false;
    return { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
      kill, exited: new Promise(() => {}) };
  });
  vi.useFakeTimers();
  try {
    const closing = p.closer.close();
    const assertion = expect(closing).rejects.toMatchObject({ code: 'command-timeout' });
    await vi.advanceTimersByTimeAsync(COMMAND_TIMEOUT_MS);
    await assertion;
    expect(kill).toHaveBeenCalledOnce();
    expect(events.filter((event) => event === 'export' || event === 'compose-down'))
      .toEqual(['export', 'export', 'export', 'compose-down']);
  } finally { vi.useRealTimers(); await h.dispose(); }
});
