import { describe, expect, it } from 'vitest';

import { optionalCapture, parseInteger, parseLoadAverage, parsePackageVersion, parsePs } from './hostState.mjs';

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
  });
});
