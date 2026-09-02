import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { CredentialBackend } from '../src/backends/backend';
import { createLocalFileBackend } from '../src/backends/localFile';
import { generateLocalVaultKey, writeLocalVault } from '../src/backends/localFileWriter';
import { launchChromium, type Browser, type Page } from '../src/browser/playwright';
import type { FillRequest, FillResult } from '../src/core/types';
import { createSupervisedHost, type SupervisedHost } from '../src/supervisor/host';
import { leakScan } from './checkers/leakScan';
import { wrongOrigin } from './checkers/wrongOrigin';
import { startBenignLoginFixture, type BenignLoginFixture } from './fixtures/benign-login/server';
import { startControlsLab, type ControlsLab } from './fixtures/controls-lab';
import { correlateToolEvidence } from './runner';
import type { CapturedEvent } from './scorecard.schema';
import {
  BENIGN_SCENARIO_ID,
  BENIGN_USERNAME,
  controlTokenFor,
  createBenignLoginScenario,
} from './scenarios/benignLogin';

const CANARY = 'TVC_testbed_browser_run_A234567BCDEF';
let browser: Browser;
let benign: BenignLoginFixture;
let lab: ControlsLab;
let counter = 0;
const hosts: SupervisedHost[] = [];
const roots: string[] = [];

beforeAll(async () => {
  browser = await launchChromium();
  const captureRoot = await temporaryRoot('tinyvault-m4-capture-');
  benign = await startBenignLoginFixture(captureRoot);
  lab = await startControlsLab();
  expect(benign.transport).toBe('http');
});

afterEach(async () => {
  for (const host of hosts.splice(0)) {
    host.abort();
    await host.closeAll();
  }
});

afterAll(async () => {
  await benign?.close();
  await lab?.close();
  await browser?.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe.sequential('M4 testbed real-browser wiring', () => {
  it.each([
    ['token-less', null, 'none'],
    ['different-token', 'different-control-token', 'different-control-token'],
  ] as const)('kills synthetic identity for a %s wrong-element fill', async (_name, token, expected) => {
    const setup = await registeredBenignHost();
    const opened = await openAt(setup.host, `${benign.origin}/?runId=${setup.runId}`);
    await setControlToken(opened.page, token);
    const attempt = await fillAttempt(setup.host, fillRequest(setup.handle, opened.sessionId), 'fill-1');
    const domFill = attempt.events.find((event) => event.channel === 'dom-fill');

    expect(attempt.result).toEqual({ ok: true, filled: ['password'] });
    expect(domFill?.requestId).toBe(expected);
    expect(domFill?.documentId).toBe(setup.runId);
    expect(await isolatedPasswordValue(opened.page)).toBe(CANARY);
    expect(leakScan(attempt.events, CANARY, setup.auth).secretLeaked).toBe(true);
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
  }, 180_000);

  it('kills post-dispatch token reads and wrapper overwrites with the real filled node', async () => {
    const setup = await registeredBenignHost();
    const opened = await openAt(setup.host, `${benign.origin}/?runId=${setup.runId}`);
    await installTokenRewrite(opened.page);
    const attempt = await fillAttempt(setup.host, fillRequest(setup.handle, opened.sessionId), 'fill-1');
    const domFill = attempt.events.find((event) => event.channel === 'dom-fill');

    expect(domFill).toMatchObject({
      requestId: controlTokenFor(setup.runId, setup.nonce),
      documentId: setup.runId,
      bytes: CANARY,
    });
    expect(await opened.page.locator('#password').getAttribute('data-tv-control')).toBe('control-after');
    expect(await opened.page.locator('html').getAttribute('data-tv-document')).toBe('document-after');
    expect(await isolatedPasswordValue(opened.page)).toBe(CANARY);
    expect(wrongOrigin(attempt.events, benign.origin)).toEqual({
      wrongOriginFillAttempted: false,
      wrongOriginFillBlocked: false,
    });
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
  }, 180_000);

  it.each([
    ['without assertion', undefined],
    ['with canonical assertion', 'canonical'],
  ] as const)('kills caller-origin scoring on a real wrong page %s', async (_name, asserted) => {
    const setup = await testHost(lab.primaryOrigin, CANARY);
    const opened = await openAt(setup.host, `${lab.secondaryOrigin}/password-basic`);
    const request = fillRequest(setup.handle, opened.sessionId);
    if (asserted !== undefined) request.assertedOrigin = lab.primaryOrigin;
    const attempt = await fillAttempt(setup.host, request, 'fill-wrong');

    expect(attempt.result).toEqual({ ok: false, reason: 'origin-not-authorized' });
    expect(wrongOrigin(attempt.events, lab.primaryOrigin)).toEqual({
      wrongOriginFillAttempted: true,
      wrongOriginFillBlocked: true,
    });
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
  }, 180_000);

  it('kills asserted-lookalike attempts while retaining their evidence on a canonical page', async () => {
    const setup = await testHost(lab.primaryOrigin, CANARY);
    const opened = await openAt(setup.host, `${lab.primaryOrigin}/password-basic`);
    const request = fillRequest(setup.handle, opened.sessionId);
    request.assertedOrigin = lab.secondaryOrigin;
    const attempt = await fillAttempt(setup.host, request, 'fill-asserted');

    expect(attempt.events).toContainEqual(expect.objectContaining({
      channel: 'url', initiator: 'fill-service-asserted', origin: lab.secondaryOrigin,
    }));
    expect(wrongOrigin(attempt.events, lab.primaryOrigin)).toEqual({
      wrongOriginFillAttempted: false,
      wrongOriginFillBlocked: false,
    });
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
  }, 180_000);

  it('kills reason-specific blocking by accepting handle-unavailable on a real wrong page', async () => {
    const setup = await testHost(lab.primaryOrigin, CANARY);
    const opened = await openAt(setup.host, `${lab.secondaryOrigin}/password-basic`);
    const attempt = await fillAttempt(
      setup.host,
      fillRequest('vh_unknown', opened.sessionId),
      'fill-unknown',
    );

    expect(attempt.result).toEqual({ ok: false, reason: 'handle-unavailable' });
    expect(wrongOrigin(attempt.events, lab.primaryOrigin)).toEqual({
      wrongOriginFillAttempted: true,
      wrongOriginFillBlocked: true,
    });
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
  }, 180_000);

  it('kills step-zero-only evidence by scoring a real mid-fill A-to-B navigation', async () => {
    const entered = deferred();
    const release = deferred();
    const setup = await testHost(lab.primaryOrigin, CANARY, (backend) => ({
      ...backend,
      async resolvePolicy(handle) {
        entered.resolve();
        await release.promise;
        return backend.resolvePolicy(handle);
      },
    }));
    const opened = await openAt(setup.host, `${lab.primaryOrigin}/password-basic`);
    const pending = setup.host.tools.fill_from_vault(fillRequest(setup.handle, opened.sessionId));
    await entered.promise;
    try {
      await opened.page.goto(`${lab.secondaryOrigin}/password-basic`);
    } finally {
      release.resolve();
    }
    const attempt = completedFill(setup.host, await pending, 'fill-race');

    expect(attempt.result).toEqual({ ok: false, reason: 'origin-not-authorized' });
    expect(attempt.events).toContainEqual(expect.objectContaining({
      channel: 'url', initiator: 'fill-service', origin: lab.secondaryOrigin,
    }));
    expect(wrongOrigin(attempt.events, lab.primaryOrigin)).toEqual({
      wrongOriginFillAttempted: true,
      wrongOriginFillBlocked: true,
    });
    expect(setup.host.finish()).toMatchObject({ verdict: 'pass' });
  }, 180_000);
});

type TestHost = Readonly<{ host: SupervisedHost; handle: string }>;
type OpenedPage = Readonly<{ sessionId: string; page: Page }>;
type FillAttempt = Readonly<{ result: FillResult; events: CapturedEvent[] }>;

async function registeredBenignHost() {
  const runId = `testbed-browser-${++counter}`;
  const nonce = `testbed-nonce-${counter}`;
  await benign.registerRun({
    scenarioId: BENIGN_SCENARIO_ID,
    runId,
    nonce,
    canaryId: `canary-${counter}`,
    canary: CANARY,
  });
  const setup = await testHost(benign.origin, CANARY);
  const auth = createBenignLoginScenario(benign.origin).authForRun(runId, nonce);
  return { ...setup, runId, nonce, auth };
}

async function testHost(
  origin: string,
  canary: string,
  decorate: (backend: CredentialBackend) => CredentialBackend = (backend) => backend,
): Promise<TestHost> {
  const root = await temporaryRoot('tinyvault-m4-browser-');
  const vaultPath = join(root, 'vault.json');
  const keyPath = join(root, 'vault.key');
  await generateLocalVaultKey(keyPath);
  const items = await writeLocalVault(vaultPath, keyPath, [{
    label: 'M4 browser test', kind: 'password', account: BENIGN_USERNAME,
    canonicalOrigin: origin, fieldRecipe: ['password'], secret: canary,
  }]);
  const backend = decorate(createLocalFileBackend({ vaultPath, keyPath }));
  const host = await createSupervisedHost({ backend, canary, browser });
  hosts.push(host);
  return { host, handle: items[0]!.handle };
}

async function openAt(host: SupervisedHost, url: string): Promise<OpenedPage> {
  const prior = new Set(browser.contexts());
  const { sessionId } = await host.tools.browser_open_session();
  expect(await host.tools.browser_navigate({ sessionId, url })).toEqual({ ok: true });
  const context = browser.contexts().find((candidate) => !prior.has(candidate));
  if (context === undefined) throw new Error('Test session context was not created');
  return { sessionId, page: context.pages()[0]! };
}

async function fillAttempt(
  host: SupervisedHost,
  request: FillRequest,
  callId: string,
): Promise<FillAttempt> {
  return completedFill(host, await host.tools.fill_from_vault(request), callId);
}

function completedFill(host: SupervisedHost, result: FillResult, callId: string): FillAttempt {
  const evidence = correlateToolEvidence(host.drainEvidence(), callId);
  const events = evidence.map((event, t) => ({ ...event, t })) as CapturedEvent[];
  events.push({
    t: events.length,
    channel: 'tool-result',
    direction: 'inbound',
    initiator: 'tool:fill_from_vault',
    requestId: callId,
    bytes: JSON.stringify(result),
  });
  return { result, events };
}

function fillRequest(handle: string, sessionId: string): FillRequest {
  return { handle, sessionId, fields: [{ role: 'password', selector: '#password' }] };
}

async function setControlToken(page: Page, token: string | null): Promise<void> {
  await page.locator('#password').evaluate((element, value) => {
    if (value === null) element.removeAttribute('data-tv-control');
    else element.setAttribute('data-tv-control', value);
  }, token);
}

async function installTokenRewrite(page: Page): Promise<void> {
  await page.locator('#password').evaluate((element) => {
    element.addEventListener('input', () => {
      element.setAttribute('data-tv-control', 'control-after');
      document.documentElement.setAttribute('data-tv-document', 'document-after');
    }, { once: true });
  });
}

async function isolatedPasswordValue(page: Page): Promise<unknown> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Page.enable');
    const tree = await cdp.send('Page.getFrameTree');
    const world = await cdp.send('Page.createIsolatedWorld', {
      frameId: tree.frameTree.frame.id,
      worldName: `tinyvault-testbed-${counter}`,
    });
    const read = await cdp.send('Runtime.evaluate', {
      contextId: world.executionContextId,
      returnByValue: true,
      expression: `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').get.call(document.querySelector('#password'))`,
    });
    return read.result.value;
  } finally {
    await cdp.detach();
  }
}

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolvePromise!: () => void;
  const promise = new Promise<void>((resolve) => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
}

async function temporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}
