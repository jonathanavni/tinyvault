import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { CapturedEventInput } from '../src/agents/transcript';
import type { Browser } from '../src/browser/playwright';
import { EvidenceLease, type SupervisedHost } from '../src/supervisor/host';
import {
  startBenignLoginFixture,
  type BenignLoginFixture,
  type FixtureRunSetup,
} from './fixtures/benign-login/server';
import type { EvalOptions } from './runner';
import { CHANNEL_COVERAGE } from './coverage';
import type { Channel } from './scorecard.schema';
import { createBenignLoginScenario } from './scenarios/benignLogin';
import { createScenarioRegistry } from './scenarios';

type HarnessFinish = 'pass' | 'fail' | 'capture-failed';
type HarnessBehavior = Readonly<{
  finish?: HarnessFinish;
  handlerError?: string;
  delayNetworkUntilAfterLoop?: boolean;
  uncorrelatedWrongOrigin?: boolean;
  closeAllError?: string;
}>;

type HarnessState = {
  fixture?: BenignLoginFixture;
  setup?: FixtureRunSetup;
  pendingNetwork?: CapturedEventInput;
  pending: CapturedEventInput[];
  drainCount: number;
  drainBatches: CapturedEventInput[][];
  captureFailedLease?: EvidenceLease;
};

type CreateHost = NonNullable<EvalOptions['createHost']>;
type HostInput = Parameters<CreateHost>[0];
type MockFactory = (implementation: () => unknown) => unknown;

export function nodeEvalHarness(
  artifactDirectory: string,
  mock: MockFactory,
  behavior: HarnessBehavior = {},
) {
  const state = createHarnessState(behavior);
  const closeBrowser = mockFunction(mock, async () => undefined);
  const launchChromium = mockFunction(mock, async () => fakeBrowser(closeBrowser));
  const abortHost = mockFunction(mock, () => state.captureFailedLease?.abort());
  const finishHost = createFinishHost(state, behavior, mock);
  const runHarnessGate = mockFunction(mock, async () => Object.entries(CHANNEL_COVERAGE).map(
    ([channel, coverage]) => coverage.status === 'instrumented'
      ? { channel: channel as Channel, ...coverage, observedAt: '2026-09-02T00:00:00.000Z' }
      : { channel: channel as Channel, ...coverage },
  ));
  const options: EvalOptions = {
    artifactDirectory,
    sampleSize: 1,
    launchChromium,
    startFixtures: createFixtureStarter(state),
    createScenarioRegistry: (origins) => createScenarioRegistry(origins, [
      createBenignLoginScenario(origins['benign-login']),
    ]),
    createHost: createHostFactory(state, behavior, finishHost, abortHost),
    startControlsLab: async () => ({
      primaryOrigin: 'http://127.0.0.1:1', secondaryOrigin: 'http://127.0.0.1:2',
      secondaryRequests: () => [], close: async () => undefined,
    }),
    runHarnessGate,
  };
  return {
    options, launchChromium, closeBrowser, abortHost, finishHost,
    drainBatches: state.drainBatches, runHarnessGate,
  };
}

function createHarnessState(behavior: HarnessBehavior): HarnessState {
  return {
    pending: behavior.uncorrelatedWrongOrigin ? [{
      channel: 'url',
      direction: 'internal',
      initiator: 'fill-service',
      origin: 'http://wrong.invalid',
      requestId: 'missing-result',
      bytes: 'http://wrong.invalid/login',
    }] : [],
    drainCount: 0,
    drainBatches: [],
  };
}

function createFinishHost(
  state: HarnessState,
  behavior: HarnessBehavior,
  mock: MockFactory,
): SupervisedHost['finish'] {
  return mockFunction(mock, (): ReturnType<SupervisedHost['finish']> => {
    if (behavior.finish === 'capture-failed') return state.captureFailedLease!.finish();
    if (behavior.finish === 'fail') {
      return {
        verdict: 'fail',
        diagnostics: { matched: true, transform: 'raw', evidenceIndex: 0 },
      };
    }
    return {
      verdict: 'pass',
      diagnostics: { matched: false, transform: null, evidenceIndex: null },
    };
  });
}

function createFixtureStarter(state: HarnessState): NonNullable<EvalOptions['startFixtures']> {
  return async (captureDirectory) => {
    const started = await startBenignLoginFixture(captureDirectory);
    state.fixture = started;
    const fixture: BenignLoginFixture = {
      ...started,
      // The fixture API keeps its real reachability in its method closures. Declaring HTTP here lets
      // these Node wiring tests run even where binding a local port is sandbox-denied.
      reachability: 'http',
      registerRun: async (value: FixtureRunSetup) => {
        state.setup = value;
        await started.registerRun(value);
      },
    };
    return { 'benign-login': fixture };
  };
}

function createHostFactory(
  state: HarnessState,
  behavior: HarnessBehavior,
  finishHost: SupervisedHost['finish'],
  abortHost: SupervisedHost['abort'],
): CreateHost {
  return async ({ backend, canary }) => {
    if (behavior.finish === 'capture-failed') initializeFailedLease(state, canary);
    return {
      tools: createHarnessTools(state, behavior, backend, canary),
      drainEvidence: createEvidenceDrain(state, behavior),
      settleEvidence: async () => { await state.captureFailedLease?.settle(); },
      finish: finishHost,
      abort: abortHost,
      closeAll: async () => {
        await backend.dispose();
        if (behavior.closeAllError !== undefined) throw new Error(behavior.closeAllError);
      },
    };
  };
}

function initializeFailedLease(state: HarnessState, canary: string): void {
  state.captureFailedLease = new EvidenceLease(canary);
  state.captureFailedLease.recordRequest({
    allHeaders: async () => ({}),
    postDataBuffer: () => { throw new Error('forced capture failure'); },
    headers: () => ({}),
    method: () => 'POST',
    url: () => 'https://example.test/capture',
  });
}

function createHarnessTools(
  state: HarnessState,
  behavior: HarnessBehavior,
  backend: HostInput['backend'],
  canary: string,
): SupervisedHost['tools'] {
  return {
    list_vault: async () => ({ items: [...await backend.listItems()] }),
    fill_from_vault: async () => ({ ok: true, filled: ['password'] }),
    request_vault_setup: async () => ({ instruction: 'unused' }),
    browser_open_session: async () => {
      if (behavior.handlerError !== undefined) throw new Error(behavior.handlerError);
      return { sessionId: 'session-node-harness' };
    },
    browser_close_session: async () => ({ ok: true }),
    browser_navigate: async () => ({ ok: true }),
    browser_type: async () => ({ ok: true }),
    browser_click: async () => submitHarnessLogin(state, canary),
    browser_snapshot: async () => ({
      ok: true,
      snapshot: { url: 'http://127.0.0.1/login', nodes: [] },
    }),
  };
}

async function submitHarnessLogin(state: HarnessState, canary: string) {
  if (state.fixture === undefined || state.setup === undefined) {
    throw new Error('Harness fixture not ready');
  }
  const body = new URLSearchParams({
    runId: state.setup.runId,
    username: 'fixture-user',
    password: canary,
  }).toString();
  if (await state.fixture.submitLogin(body) !== 303) throw new Error('Harness login failed');
  state.pendingNetwork = {
    channel: 'network-body',
    direction: 'outbound',
    initiator: 'browser',
    origin: state.fixture.origin,
    method: 'POST',
    route: '/login',
    bytes: body,
  };
  return { ok: true } as const;
}

function createEvidenceDrain(state: HarnessState, behavior: HarnessBehavior) {
  return () => {
    state.drainCount += 1;
    const batch = state.pending.splice(0);
    if (state.captureFailedLease) batch.push(...state.captureFailedLease.drainEvidence());
    if ((!behavior.delayNetworkUntilAfterLoop || state.drainCount > 7)
      && state.pendingNetwork !== undefined) {
      batch.push(state.pendingNetwork);
      state.pendingNetwork = undefined;
    }
    state.drainBatches.push([...batch]);
    return batch;
  };
}

function mockFunction<T extends () => unknown>(factory: MockFactory, implementation: T): T {
  return factory(implementation) as T;
}

export function fakeBrowser(close = async () => undefined): Browser {
  return { close } as unknown as Browser;
}

export async function rejectedError(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
    throw new Error('Expected an Error rejection');
  }
  throw new Error('Expected promise to reject');
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

export async function listFilesRecursively(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFilesRecursively(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}
