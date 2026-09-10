import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  optionalCapture, parseChromiumIdentity, parseInteger, parseLoadAverage, parsePackageVersion,
  parsePs, processCapture,
} from './hostState.mjs';

describe('parsePs', () => {
  it('requests the portable ps etime column from the shell spawner', () => {
    const runner = readFileSync(new URL('./run.sh', import.meta.url), 'utf8');
    expect(runner).toContain('ps -axo pid,ppid,pcpu,etime,command');
    expect(runner).not.toContain('ps -axo pid,ppid,pcpu,etimes,command');
  });

  it('parses every ps etime form into elapsed seconds and preserves command arguments', () => {
    const fixture = `  PID  PPID  %CPU ELAPSED COMMAND
  101     1   0.0      04:05 /Applications/Claude
  202   101  12.5   02:03:04 node /repo/node_modules/vitest/vitest.mjs run tools/
  303     1   1.5 3-02:03:04 /usr/local/bin/codex-app-server
`;
    const expected = [
      { pid: 101, ppid: 1, pcpu: 0, etimes: 245, command: '/Applications/Claude' },
      { pid: 202, ppid: 101, pcpu: 12.5, etimes: 7384, command: 'node /repo/node_modules/vitest/vitest.mjs run tools/' },
      { pid: 303, ppid: 1, pcpu: 1.5, etimes: 266584, command: '/usr/local/bin/codex-app-server' },
    ];
    expect(parsePs(fixture)).toEqual(expected);
    expect(processCapture(fixture, 0)).toMatchObject({ status: 'ok', exit: 0, processes: expected });
  });

  it('parses macOS host-state command output without deciding on failures', () => {
    expect(parseLoadAverage('load averages: 1.25 2.50 3.75')).toEqual([1.25, 2.5, 3.75]);
    expect(parseLoadAverage('load average: 1.25, 2.50, 3.75')).toEqual([1.25, 2.5, 3.75]);
    expect(parseInteger('12\n')).toBe(12);
    expect(parsePackageVersion('{"version":"1.62.1"}')).toBe('1.62.1');
    expect(optionalCapture('command not found', 127)).toBeNull();
    expect(parseChromiumIdentity('{"version":"1.62.1"}', 'chromium-1194\nchromium_headless_shell-1194\n'))
      .toEqual({ playwrightCore: '1.62.1', cacheDirectories: ['chromium-1194', 'chromium_headless_shell-1194'] });
  });

  it('distinguishes failed and unparseable process capture from an empty clean set', () => {
    expect(processCapture('ps: command failed\n', 1)).toMatchObject({ status: 'failed', exit: 1, bytes: 19, processes: [] });
    expect(processCapture('PID PPID %CPU ELAPSED COMMAND\n', 0)).toMatchObject({
      status: 'unparseable', exit: 0, processes: [],
    });
    expect(processCapture(' 12 1 0.0 invalid /usr/bin/login\n', 0)).toMatchObject({
      status: 'unparseable', exit: 0, processes: [],
    });
    expect(processCapture(' 12 1 . 00:03 /usr/bin/login\n', 0)).toMatchObject({
      status: 'unparseable', exit: 0, processes: [],
    });
    expect(processCapture(' 12 1 -0.1 00:03 /usr/bin/login\n', 0)).toMatchObject({
      status: 'unparseable', exit: 0, processes: [],
    });
    expect(processCapture(' 12 1 0.0 00:03 /usr/bin/login\n', 0)).toMatchObject({
      status: 'ok', exit: 0, processes: [{ etimes: 3 }],
    });
  });

  it('makes a whole capture unparseable when any row has malformed CPU', () => {
    const capture = processCapture([
      ' 12 1 0.0 00:03 /usr/bin/login',
      ' 13 1 . 00:03 /usr/bin/other',
      '',
    ].join('\n'), 0);
    expect(capture).toMatchObject({
      status: 'unparseable', processes: [{ pid: 12, pcpu: 0 }],
    });
  });

  it.each(['0x10', '1e1', '-0.0'])('rejects non-decimal %%CPU form %s', (pcpu) => {
    expect(processCapture(` 12 1 ${pcpu} 00:03 /usr/bin/login\n`, 0)).toMatchObject({
      status: 'unparseable', processes: [],
    });
  });

  it.each([
    ['0.0', 0],
    ['12.5', 12.5],
  ])('accepts decimal %%CPU form %s', (pcpu, expected) => {
    expect(processCapture(` 12 1 ${pcpu} 00:03 /usr/bin/login\n`, 0)).toMatchObject({
      status: 'ok', processes: [{ pid: 12, pcpu: expected }],
    });
  });
});
