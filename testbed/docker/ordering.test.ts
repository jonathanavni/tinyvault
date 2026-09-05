import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import type { Browser } from '../../src/browser/playwright';
import * as fixtureModule from '../fixtures';
import { capturePersistedRuns, runEval, type EvalOptions } from '../runner';
import { dockerPreflight, DockerPreflightError, type PinnedDockerEndpoint } from './preflight';

// Observe filesystem boundaries even for direct capture, which has no artifact lifecycle options.
// These mocks never perform filesystem I/O, bind sockets, or launch a process.
vi.mock('node:fs/promises', async (original) => ({
  ...await original<typeof fs>(),
  rm: vi.fn(), mkdir: vi.fn(), writeFile: vi.fn(),
  readFile: vi.fn(), realpath: vi.fn(), stat: vi.fn(),
}));

function mintPin(): Promise<PinnedDockerEndpoint> {
  return dockerPreflight({
    env: { DOCKER_HOST: 'unix:///injected/docker.sock' },
    files: { readFile: async () => undefined },
    realpath: async (path) => path,
    stat: async () => ({ isSocket: () => true }),
  });
}

function lifecycle() {
  const events: string[] = [];
  const closeBrowser = vi.fn(async () => { events.push('close-browser'); });
  const browser = { close: closeBrowser } as unknown as Browser;
  const launch = vi.fn(async () => { events.push('launch'); return browser; });
  const fixtures = vi.fn(async () => { throw new Error('in-process starter reached'); });
  const closeLab = vi.fn(async () => { events.push('close-lab'); });
  const options: EvalOptions = {
    artifactDirectory: '/injected/artifacts',
    architecture: 'composed',
    dockerRunner: { run: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 1 })), spawnLongLived: vi.fn() },
    probeOrigin: vi.fn(async () => true),
    dockerPreflight: vi.fn(async () => { events.push('preflight'); return mintPin(); }),
    runMetaGate: vi.fn(() => { events.push('meta'); return { passed: true, failures: [], plantedCases: 0, negativeControls: 0 }; }),
    removeArtifactDirectory: vi.fn(async () => { events.push('rm'); }),
    createArtifactDirectory: vi.fn(async () => { events.push('mkdir'); return undefined; }),
    launchChromium: launch,
    startFixtures: fixtures,
    startControlsLab: vi.fn(async () => {
      events.push('controls');
      return { primaryOrigin: 'http://lab.invalid', secondaryOrigin: 'http://secondary.invalid',
        secondaryRequests: () => [], close: closeLab };
    }),
    runHarnessGate: vi.fn(async () => { events.push('harness'); return []; }),
  };
  return { options, events, browser, launch, fixtures, closeBrowser, closeLab };
}

function expectNoEffects(h: ReturnType<typeof lifecycle>) {
  expect(h.options.removeArtifactDirectory).not.toHaveBeenCalled();
  expect(h.options.createArtifactDirectory).not.toHaveBeenCalled();
  expect(fs.rm).not.toHaveBeenCalled();
  expect(fs.mkdir).not.toHaveBeenCalled();
  expect(fs.writeFile).not.toHaveBeenCalled();
  expect(h.launch).not.toHaveBeenCalled();
  expect(h.fixtures).not.toHaveBeenCalled();
  expect(fixtureModule.startFixtures).not.toHaveBeenCalled();
  expect(h.options.startControlsLab).not.toHaveBeenCalled();
  expect(h.options.runHarnessGate).not.toHaveBeenCalled();
  expect(h.closeBrowser).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  // Catch accidental calls of the real in-process starter without allowing it to bind.
  vi.spyOn(fixtureModule, 'startFixtures').mockRejectedValue(new Error('default in-process starter reached'));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('public composed capture ordering', () => {
  for (const entry of ['capture', 'eval'] as const) {
    it(`${entry}: rejects an unknown runtime architecture before preflight or effects (R6)`, async () => {
      const h = lifecycle();
      h.options.architecture = 'unknown' as EvalOptions['architecture'];
      const result = entry === 'capture'
        ? capturePersistedRuns('/injected/artifacts', 1, undefined, h.options)
        : runEval(h.options);
      await expect(result).rejects.toThrow('Unknown fixture architecture: unknown');
      expect(h.options.dockerPreflight).not.toHaveBeenCalled();
      expectNoEffects(h);
    });

    it(`${entry}: preflight rejection precedes all observed side effects`, async () => {
      const h = lifecycle();
      const error = new DockerPreflightError('realpath-failed');
      h.options.dockerPreflight = vi.fn(async () => { throw error; });
      const result = entry === 'capture'
        ? capturePersistedRuns('/injected/artifacts', 1, undefined, h.options)
        : runEval(h.options);
      const failure = await result.catch((reason: unknown) => reason);
      expectNoEffects(h);
      expect(h.options.dockerPreflight).toHaveBeenCalledExactlyOnceWith();
      expect(failure).toBe(error);
    });

    it(`${entry}: awaits a pending preflight before any side effect`, async () => {
      const h = lifecycle();
      let reject!: (error: Error) => void;
      h.options.dockerPreflight = vi.fn(() => new Promise<PinnedDockerEndpoint>((_, fail) => { reject = fail; }));
      const result = entry === 'capture'
        ? capturePersistedRuns('/injected/artifacts', 1, undefined, h.options)
        : runEval(h.options);
      expectNoEffects(h);
      const error = new Error('preflight pending then failed');
      reject(error);
      await expect(result).rejects.toBe(error);
      expectNoEffects(h);
    });

    it.each([undefined, {}])(`${entry}: rejects an injected invalid pin %j before effects`, async (pin) => {
      const h = lifecycle();
      h.options.dockerPreflight = vi.fn(async () => pin as PinnedDockerEndpoint);
      const result = entry === 'capture'
        ? capturePersistedRuns('/injected/artifacts', 1, undefined, h.options)
        : runEval(h.options);
      await expect(result).rejects.toMatchObject({ code: 'unpinned' });
      expectNoEffects(h);
    });
  }

  it('rejects a supplied browser even when preflight would succeed', async () => {
    const h = lifecycle();
    const failure = await capturePersistedRuns('/injected/artifacts', 1, h.browser, h.options)
      .catch((reason: unknown) => reason);
    expectNoEffects(h);
    expect(h.options.dockerPreflight).not.toHaveBeenCalled();
    expect(failure).toMatchObject({ message: expect.stringContaining('cannot accept a caller-supplied browser') });
  });

  it('eval keeps the checker meta-gate before preflight and artifact replacement', async () => {
    const h = lifecycle();
    h.options.runMetaGate = vi.fn(() => ({ passed: false, failures: ['injected checker failure'], plantedCases: 0, negativeControls: 0 }));
    await expect(runEval(h.options)).rejects.toThrow('Checker meta-gate failed');
    expect(h.options.dockerPreflight).not.toHaveBeenCalled();
    expectNoEffects(h);
  });

  it('direct capture preflights once, then fails composed construction without fallback', async () => {
    const h = lifecycle();
    const failure = await capturePersistedRuns('/injected/artifacts', 1, undefined, h.options)
      .catch((reason: unknown) => reason);
    expect(h.events).toEqual(['preflight', 'launch', 'close-browser']);
    expect(h.options.dockerPreflight).toHaveBeenCalledExactlyOnceWith();
    expect(h.fixtures).not.toHaveBeenCalled();
    expect(fixtureModule.startFixtures).not.toHaveBeenCalled();
    expect(fs.rm).not.toHaveBeenCalled();
    expect(fs.mkdir).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(failure).toMatchObject({ code: 'daemon-unreachable' });
  });

  it('eval preflights once before replacement and owns its internal browser through failure', async () => {
    const h = lifecycle();
    await expect(runEval(h.options)).rejects.toMatchObject({ code: 'daemon-unreachable' });
    expect(h.events).toEqual([
      'meta', 'preflight', 'rm', 'mkdir', 'launch', 'controls', 'harness', 'close-lab', 'close-browser',
    ]);
    expect(h.options.dockerPreflight).toHaveBeenCalledExactlyOnceWith();
    expect(h.fixtures).not.toHaveBeenCalled();
    expect(fixtureModule.startFixtures).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('uses the real default preflight with mocked configuration and socket metadata', async () => {
    const h = lifecycle();
    delete h.options.dockerPreflight;
    vi.stubEnv('DOCKER_HOST', 'unix:///injected/docker.sock');
    vi.stubEnv('DOCKER_CONTEXT', '');
    vi.stubEnv('DOCKER_CONFIG', '/injected/docker-config');
    vi.mocked(fs.readFile).mockRejectedValue(Object.assign(new Error('absent'), { code: 'ENOENT' }));
    vi.mocked(fs.realpath).mockResolvedValue('/injected/docker.sock');
    vi.mocked(fs.stat).mockResolvedValue({ isSocket: () => true } as Awaited<ReturnType<typeof fs.stat>>);
    await expect(capturePersistedRuns('/injected/artifacts', 1, undefined, h.options))
      .rejects.toMatchObject({ code: 'daemon-unreachable' });
    expect(fs.readFile).toHaveBeenCalledExactlyOnceWith('/injected/docker-config/config.json', 'utf8');
    expect(fs.realpath).toHaveBeenCalledExactlyOnceWith('/injected/docker.sock');
    expect(fs.stat).toHaveBeenCalledExactlyOnceWith('/injected/docker.sock');
    expect(h.fixtures).not.toHaveBeenCalled();
    expect(fixtureModule.startFixtures).not.toHaveBeenCalled();
  });
});

describe('in-process remains Docker-free', () => {
  for (const architecture of [undefined, 'in-process'] as const) {
    for (const supplied of [false, true]) {
      it(`capture architecture=${architecture}, supplied browser=${supplied}`, async () => {
        const h = lifecycle();
        h.options.architecture = architecture;
        const result = capturePersistedRuns('/injected/artifacts', 1, supplied ? h.browser : undefined, h.options);
        await expect(result).rejects.toThrow('in-process starter reached');
        expect(h.options.dockerPreflight).not.toHaveBeenCalled();
        expect(fs.readFile).not.toHaveBeenCalled();
        expect(fs.realpath).not.toHaveBeenCalled();
        expect(fs.stat).not.toHaveBeenCalled();
        expect(h.fixtures).toHaveBeenCalledExactlyOnceWith('/injected/artifacts/fixture-captures');
        expect(h.launch).toHaveBeenCalledTimes(supplied ? 0 : 1);
        expect(h.closeBrowser).toHaveBeenCalledTimes(supplied ? 0 : 1);
      });
    }

    it(`eval architecture=${architecture} never preflights`, async () => {
      const h = lifecycle();
      h.options.architecture = architecture;
      await expect(runEval(h.options)).rejects.toThrow('in-process starter reached');
      expect(h.options.dockerPreflight).not.toHaveBeenCalled();
      expect(fs.readFile).not.toHaveBeenCalled();
      expect(fs.realpath).not.toHaveBeenCalled();
      expect(fs.stat).not.toHaveBeenCalled();
      expect(h.fixtures).toHaveBeenCalledExactlyOnceWith('/injected/artifacts/fixture-captures');
    });
  }
});
