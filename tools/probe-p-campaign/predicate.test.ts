import { describe, expect, it } from 'vitest';

import { competingJobs } from './predicate.mjs';

const process = (pid: number, ppid: number, pcpu: number, command: string) => ({
  pid, ppid, pcpu, etimes: 30, command,
});

describe('competingJobs', () => {
  it('matches every frozen command branch', () => {
    const processes = [
      process(10, 1, 2, '/usr/local/bin/codex app-server'),
      process(11, 1, 2, 'node /repo/scripts/claude-review.mjs qa packet'),
      process(12, 1, 2, 'node /other/node_modules/vitest/vitest.mjs run'),
      process(13, 1, 2, '/Applications/Google Chrome for Testing --headless'),
      process(14, 1, 2, 'make -C /other test'),
      process(15, 1, 2, 'docker compose up'),
      process(16, 1, 2, '/repo/node_modules/.bin/tsc --noEmit'),
      process(17, 1, 2, '/repo/node_modules/.bin/esbuild app.ts'),
      process(18, 1, 2, 'npm run eval'),
      process(19, 1, 2, 'npx vitest run'),
      process(20, 1, 2, 'node /plugins/codex-companion.mjs task'),
    ];
    const result = competingJobs({ processes }, { ownPid: 99, checkoutRoot: '/repo' });
    expect(result.competing.map(({ pid }) => pid)).toEqual(processes.map(({ pid }) => pid));
  });

  it('keeps desktop apps and idle MCP helpers observed but makes a busy helper competing', () => {
    const processes = [
      process(20, 1, 8, 'Claude'),
      process(21, 1, 8, 'Code Helper'),
      process(22, 1, 8, 'Obsidian'),
      process(23, 1, 0.9, 'node @modelcontextprotocol/server-filesystem'),
      process(24, 1, 1, 'node playwright-mcp server'),
      process(25, 1, 0, '/usr/bin/login'),
    ];
    const result = competingJobs({ processes }, { ownPid: 99, checkoutRoot: '/repo' });
    expect(result.competing.map(({ pid }) => pid)).toEqual([24]);
    expect(result.observed.map(({ pid }) => pid)).toEqual([20, 21, 22, 23, 25]);
  });

  it('excludes the harness process and all descendants', () => {
    const processes = [
      process(30, 1, 2, '/bin/bash tools/probe-p-campaign/run.sh'),
      process(31, 30, 50, 'make test'),
      process(32, 31, 50, 'npx vitest run'),
      process(33, 1, 50, 'npx vitest run /other/checkout'),
    ];
    const result = competingJobs({ processes }, { ownPid: 30, checkoutRoot: '/repo' });
    expect(result.competing.map(({ pid }) => pid)).toEqual([33]);
    expect(result.observed.map(({ pid }) => pid)).toEqual([30, 31, 32]);
  });
});
