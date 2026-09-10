import { describe, expect, it } from 'vitest';

import { competingJobs, PREDICATE_VERSION } from './predicate.mjs';

const CHECKOUT_ROOT = '/Users/jonathanavni/Documents/Coding/tinyvault';
const OTHER_CHECKOUT = '/private/tmp/claude-501/-Users-jonathanavni-Documents-Coding-tinyvault/session/wt/other';

const proc = (pid: number, ppid: number, pcpu: number, command: string) => ({
  pid, ppid, pcpu, etimes: 30, command,
});

const classify = (processes: ReturnType<typeof proc>[], ownPid = 999) =>
  competingJobs({ processes }, { ownPid, checkoutRoot: CHECKOUT_ROOT });

describe('competingJobs predicate v2.3', () => {
  it('exports predicate version 5', () => {
    expect(PREDICATE_VERSION).toBe(5);
  });

  it.each([
    ['direct vitest runner', '/repo/node_modules/.bin/vitest run'],
    ['node vitest runner', 'node /repo/node_modules/vitest/vitest.mjs run'],
    ['npx vitest runner', 'npx vitest run'],
    ['vitest runner with incidental MCP filename', 'vitest run mcp-integration.test.ts'],
    ['direct playwright test runner', '/repo/node_modules/.bin/playwright test'],
    ['node scoped playwright runner', 'node /repo/node_modules/@playwright/test/cli.js test'],
    ['npx playwright runner', 'npx playwright test'],
    ['playwright-core CLI test runner', 'node /repo/node_modules/playwright-core/lib/cli/program.js test'],
    ['node playwright CLI run', 'node /repo/node_modules/playwright/cli.js run'],
  ])('rule A classifies %s at zero CPU', (_label, command) => {
    expect(classify([proc(10, 1, 0, command)]).competing.map(({ pid }) => pid)).toEqual([10]);
  });

  it.each([
    ['make test', `make -C ${CHECKOUT_ROOT} test`],
    ['make eval', 'make eval'],
    ['make baseline', 'make baseline'],
    ['make test-docker', 'make test-docker'],
  ])('rule A classifies %s at zero CPU', (_label, command) => {
    expect(classify([proc(10, 1, 0, command)]).competing.map(({ pid }) => pid)).toEqual([10]);
  });

  it.each([
    ['npm test', 'npm test'],
    ['npm run test', 'npm run test'],
    ['npm run eval', 'npm run eval'],
    ['npm run baseline', 'npm run baseline'],
    ['npm run test:docker', 'npm run test:docker'],
    ['npx test', 'npx test'],
    ['npx run test', 'npx run test'],
    ['npx run eval', 'npx run eval'],
    ['npx run baseline', 'npx run baseline'],
    ['npx run test:docker', 'npx run test:docker'],
  ])('rule A classifies %s at zero CPU without requiring a checkout path', (_label, command) => {
    expect(classify([proc(10, 1, 0, command)]).competing.map(({ pid }) => pid)).toEqual([10]);
  });

  it.each([
    ['direct tsc', '/repo/node_modules/.bin/tsc --noEmit'],
    ['direct esbuild', '/repo/node_modules/.bin/esbuild app.ts'],
    ['npx tsc', 'npx tsc --noEmit'],
    ['npx esbuild', 'npx esbuild app.ts'],
    ['node TypeScript tsc', 'node node_modules/typescript/bin/tsc --noEmit'],
    ['node esbuild', 'node node_modules/esbuild/bin/esbuild app.ts'],
  ])('rule A classifies %s at zero CPU', (_label, command) => {
    expect(classify([proc(10, 1, 0, command)]).competing.map(({ pid }) => pid)).toEqual([10]);
  });

  it.each([
    ['Codex task', '/usr/local/bin/codex task packet'],
    ['Codex task with incidental MCP path', '/usr/local/bin/codex task /tmp/mcp-review.md'],
    ['codex-cli exec', '/usr/local/bin/codex-cli exec packet'],
    ['Codex review', '/usr/local/bin/codex review packet'],
    ['Codex adversarial review', '/usr/local/bin/codex adversarial-review packet'],
    ['direct Codex companion', '/plugins/codex-companion.mjs task packet'],
    ['node Codex companion', 'node /plugins/codex-companion.mjs task packet'],
  ])('rule A classifies %s at zero CPU', (_label, command) => {
    expect(classify([proc(10, 1, 0, command)]).competing.map(({ pid }) => pid)).toEqual([10]);
  });

  it.each([
    ['node', `node ${OTHER_CHECKOUT}/tools/helper.mjs`],
    ['npm', `npm --prefix ${OTHER_CHECKOUT} run docs`],
    ['npx', `npx --prefix=${OTHER_CHECKOUT} eslint .`],
    ['make', `make -C ${OTHER_CHECKOUT} docs`],
  ])('rule A classifies %s referencing another TinyVault checkout at zero CPU', (_label, command) => {
    expect(classify([proc(10, 1, 0, command)]).competing.map(({ pid }) => pid)).toEqual([10]);
  });

  it.each([
    ['docker build', 'docker build .'],
    ['docker buildx build', 'docker buildx build .'],
    ['docker compose', 'docker compose up'],
    ['docker-compose', 'docker-compose up'],
    ['cached Chromium', '/Users/test/Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium --headless'],
    ['Google Chrome for Testing', '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'],
    ['Google Chrome for Testing helper', '/Applications/Google Chrome for Testing.app/Contents/Frameworks/Google Chrome for Testing Framework.framework/Helpers/Google Chrome for Testing Helper (Renderer)'],
    ['chrome-headless-shell', '/cache/chrome-headless-shell --headless'],
    ['Claude review', `node ${CHECKOUT_ROOT}/scripts/claude-review.mjs qa packet`],
  ])('rule A classifies %s at zero CPU', (_label, command) => {
    expect(classify([proc(10, 1, 0, command)]).competing.map(({ pid }) => pid)).toEqual([10]);
  });

  it.each([
    ['test runner counterpart', 'node /repo/node_modules/vite/bin/vite.js build'],
    ['make counterpart', 'make docs'],
    ['compiler counterpart', 'node /repo/node_modules/esbuild-register/index.js'],
    ['Codex app-server', '/usr/local/bin/codex app-server'],
    ['Codex broker', 'node /Applications/ChatGPT.app/app-server-broker.mjs'],
    ['Codex sandbox host', '/usr/local/bin/codex sandbox macos --log-denials'],
    ['same-checkout node', `node ${CHECKOUT_ROOT}/tools/helper.mjs`],
    ['same-checkout npm', `npm --prefix ${CHECKOUT_ROOT} run docs`],
    ['same-checkout npx', `npx --prefix=${CHECKOUT_ROOT} eslint .`],
    ['unrelated node', 'node /Applications/Example.app/Contents/Resources/worker.mjs'],
    ['unrelated make', 'make -C /tmp/unrelated-project docs'],
    ['Docker run', 'docker run image'],
    ['Google Chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
    ['Safari', '/Applications/Safari.app/Contents/MacOS/Safari'],
    ['Arc', '/Applications/Arc.app/Contents/MacOS/Arc'],
    ['Firefox', '/Applications/Firefox.app/Contents/MacOS/firefox'],
    ['Microsoft Edge', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
    ['Chrome crashpad', '/Applications/Google Chrome.app/Contents/Frameworks/chrome_crashpad_handler --monitor-self'],
    ['Claude server', '/Applications/Visual Studio Code.app/extensions/claude/bin/claude server'],
    ['Playwright MCP via npm exec', 'npm exec @playwright/mcp -- --browser chrome'],
    ['Playwright MCP via node', 'node /plugins/playwright-mcp/cli.js --browser chrome'],
    ['Chrome DevTools MCP via node', 'node /plugins/chrome-devtools-mcp/build/src/index.js'],
  ])('keeps the zero-CPU %s under rule B', (_label, command) => {
    expect(classify([proc(10, 1, 0, command)])).toMatchObject({ competing: [], observed: [{ pid: 10 }] });
  });

  it.each([
    ['cua_node helper', '/Applications/ChatGPT.app/cua_node helper'],
    ['chrome-devtools-mcp watchdog', 'node /plugins/chrome-devtools-mcp/build/src/index.js'],
    ['generic MCP helper', 'node /plugins/another-mcp/server.js'],
    ['crashpad handler', '/Applications/ChatGPT.app/Contents/Frameworks/crashpad_handler --monitor-self'],
  ])('keeps idle %s observed and classifies the same process at 10.0 CPU', (_label, command) => {
    expect(classify([proc(10, 1, 0, command)])).toMatchObject({ competing: [], observed: [{ pid: 10 }] });
    expect(classify([proc(10, 1, 10, command)]).competing.map(({ pid }) => pid)).toEqual([10]);
  });

  it('uses an inclusive per-process 10.0 CPU boundary for otherwise-unmatched processes', () => {
    const result = classify([
      proc(10, 1, 9.9, '/usr/bin/ordinary-helper'),
      proc(11, 1, 10, '/usr/bin/ordinary-helper'),
    ]);
    expect(result.competing.map(({ pid }) => pid)).toEqual([11]);
    expect(result.observed.map(({ pid }) => pid)).toEqual([10]);
  });

  it('keeps a user Google Chrome helper under rule B', () => {
    const command = '/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Helpers/Google Chrome Helper (Renderer) --type=renderer';
    expect(classify([proc(10, 1, 0, command)])).toMatchObject({ competing: [], observed: [{ pid: 10 }] });
    expect(classify([proc(10, 1, 12, command)]).competing.map(({ pid }) => pid)).toEqual([10]);
  });

  it('exempts ancestors from rule A only while rule B still classifies busy ancestors', () => {
    const processes = [
      proc(1, 0, 50, '/sbin/launchd'),
      proc(30, 1, 20, '/Applications/Terminal.app/Contents/MacOS/Terminal'),
      proc(31, 30, 0, `node ${OTHER_CHECKOUT}/node_modules/vitest/vitest.mjs run`),
      proc(32, 31, 50, '/bin/bash tools/probe-p-campaign/run.sh'),
      proc(33, 32, 50, 'make test'),
      proc(34, 33, 50, 'npx vitest run'),
      proc(35, 1, 10, '/usr/bin/unrelated-work'),
    ];
    const result = classify(processes, 32);
    expect(result.competing.map(({ pid }) => pid)).toEqual([1, 30, 35]);
    expect(result.observed.map(({ pid }) => pid)).toEqual([31, 32, 33, 34]);
  });

  it('exempts a descendant Playwright-managed browser but classifies an unrelated one at zero CPU', () => {
    const processes = [
      proc(40, 1, 0, '/bin/bash tools/probe-p-campaign/run.sh'),
      proc(41, 40, 0, '/Users/test/Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium --headless'),
      proc(42, 1, 0, '/Users/test/Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium --headless'),
    ];
    const result = classify(processes, 40);
    expect(result.competing.map(({ pid }) => pid)).toEqual([42]);
    expect(result.observed.map(({ pid }) => pid)).toEqual([40, 41]);
  });
});
