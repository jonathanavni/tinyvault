import { describe, expect, it } from 'vitest';

import { competingJobs, PREDICATE_VERSION } from './predicate.mjs';

const proc = (pid: number, ppid: number, pcpu: number, command: string) => ({
  pid, ppid, pcpu, etimes: 30, command,
});

const classify = (processes: ReturnType<typeof proc>[], ownPid = 999) =>
  competingJobs({ processes }, { ownPid, checkoutRoot: '/repo' });

describe('competingJobs predicate v2', () => {
  it('exports the frozen predicate version', () => {
    expect(PREDICATE_VERSION).toBe(2);
  });

  it.each([
    ['vitest runner', 'node /repo/node_modules/vitest/vitest.mjs run'],
    ['playwright runner', 'node /repo/node_modules/playwright/cli.js test'],
    ['make test', 'make -C /repo test'],
    ['tsc', '/repo/node_modules/.bin/tsc --noEmit'],
    ['esbuild', '/repo/node_modules/.bin/esbuild app.ts'],
    ['npm test command', 'npm run test'],
    ['npx eval command', 'npx vitest run'],
    ['Chromium', '/Applications/Chromium.app/Contents/MacOS/Chromium --headless'],
    ['Google Chrome for Testing', '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'],
    ['chrome-headless-shell', '/cache/chrome-headless-shell --headless'],
    ['docker workload', 'docker compose up'],
    ['codex task', '/usr/local/bin/codex task packet'],
    ['codex exec', '/usr/local/bin/codex exec packet'],
    ['codex review', '/usr/local/bin/codex review packet'],
    ['codex companion task', 'node /plugins/codex-companion.mjs task packet'],
    ['Claude review', 'node /repo/scripts/claude-review.mjs qa packet'],
  ])('classifies %s at zero CPU as a known workload', (_label, command) => {
    expect(classify([proc(10, 1, 0, command)]).competing.map(({ pid }) => pid)).toEqual([10]);
  });

  it.each([
    ['cua_node helper', '/Applications/ChatGPT.app/cua_node helper'],
    ['Codex app-server', '/usr/local/bin/codex app-server'],
    ['Codex broker', 'node /Applications/ChatGPT.app/app-server-broker.mjs'],
    ['Codex sandbox host', '/usr/local/bin/codex sandbox macos --log-denials'],
    ['VS Code Claude binary', '/Applications/Visual Studio Code.app/extensions/claude/bin/claude server'],
    ['chrome-devtools-mcp watchdog', 'node /plugins/chrome-devtools-mcp/build/src/index.js'],
    ['crashpad handler', '/Applications/ChatGPT.app/Contents/Frameworks/crashpad_handler --monitor-self'],
    ['Chrome crashpad handler', '/Applications/Google Chrome for Testing.app/Contents/Frameworks/Google Chrome for Testing Framework.framework/Helpers/chrome_crashpad_handler --monitor-self'],
  ])('keeps idle %s observed and classifies the same process at 10.0 CPU', (_label, command) => {
    expect(classify([proc(10, 1, 0, command)])).toMatchObject({ competing: [], observed: [{ pid: 10 }] });
    expect(classify([proc(10, 1, 10, command)]).competing.map(({ pid }) => pid)).toEqual([10]);
  });

  it('classifies any otherwise-unmatched process at the 10.0 CPU boundary', () => {
    const result = classify([
      proc(10, 1, 9.9, '/usr/bin/ordinary-helper'),
      proc(11, 1, 10, '/usr/bin/ordinary-helper'),
    ]);
    expect(result.competing.map(({ pid }) => pid)).toEqual([11]);
    expect(result.observed.map(({ pid }) => pid)).toEqual([10]);
  });

  it('exempts the harness process, all descendants, and its ancestor chain through pid 1', () => {
    const processes = [
      proc(1, 0, 50, '/sbin/launchd'),
      proc(30, 1, 1.4, '/Applications/Terminal.app/Contents/MacOS/Terminal'),
      proc(31, 30, 20, '/bin/zsh'),
      proc(32, 31, 20, '/bin/bash tools/probe-p-campaign/run.sh'),
      proc(33, 32, 50, 'make test'),
      proc(34, 33, 50, 'npx vitest run'),
      proc(35, 1, 10, '/usr/bin/unrelated-work'),
    ];
    const result = classify(processes, 32);
    expect(result.competing.map(({ pid }) => pid)).toEqual([35]);
    expect(result.observed.map(({ pid }) => pid)).toEqual([1, 30, 31, 32, 33, 34]);
  });

  it('exempts descendant Chromium but classifies unrelated Chromium at zero CPU', () => {
    const processes = [
      proc(40, 1, 0, '/bin/bash tools/probe-p-campaign/run.sh'),
      proc(41, 40, 0, '/cache/chrome-headless-shell --headless'),
      proc(42, 1, 0, '/cache/chrome-headless-shell --headless'),
    ];
    const result = classify(processes, 40);
    expect(result.competing.map(({ pid }) => pid)).toEqual([42]);
    expect(result.observed.map(({ pid }) => pid)).toEqual([40, 41]);
  });
});
