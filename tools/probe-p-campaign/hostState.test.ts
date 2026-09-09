import { describe, expect, it } from 'vitest';

import {
  optionalCapture, parseChromiumIdentity, parseInteger, parseLoadAverage, parsePackageVersion,
  parsePs, processCapture,
} from './hostState.mjs';

describe('parsePs', () => {
  it('parses the fixed ps columns and preserves command arguments', () => {
    const fixture = `  PID  PPID  %CPU ELAPSED COMMAND
  101     1   0.0   86400 /Applications/Claude
  202   101  12.5      42 node /repo/node_modules/vitest/vitest.mjs run tools/
invalid row
`;
    expect(parsePs(fixture)).toEqual([
      { pid: 101, ppid: 1, pcpu: 0, etimes: 86400, command: '/Applications/Claude' },
      { pid: 202, ppid: 101, pcpu: 12.5, etimes: 42, command: 'node /repo/node_modules/vitest/vitest.mjs run tools/' },
    ]);
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
    expect(processCapture(' 12 1 0.0 3 /usr/bin/login\ntruncated row\n', 0).status).toBe('unparseable');
    expect(processCapture(' 12 1 0.0 3 /usr/bin/login\n', 0)).toMatchObject({ status: 'ok', exit: 0 });
  });
});
