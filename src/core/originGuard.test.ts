import { describe, expect, it } from 'vitest';

import { INVALID_ORIGIN_MESSAGE, validateBareOrigin } from './originGuard';

const accepted: ReadonlyArray<readonly [string, string]> = [
  ['https://example.com', 'https://example.com'],
  ['http://example.com', 'http://example.com'],
  ['https://example.com:8443', 'https://example.com:8443'],
  ['https://example.com:443', 'https://example.com'],
  ['http://example.com:80', 'http://example.com'],
  ['https://example.com:0', 'https://example.com:0'],
  ['https://EXAMPLE.com', 'https://example.com'],
  ['HTTPS://example.com', 'https://example.com'],
  // host is `ex` + U+00E4 (a-diaeresis) + `mple.com`; IDNA -> xn--exmple-cua.com.
  // Spec Appendix A originally carried a mojibake form of this host (UTF-8 read as
  // MacRoman), which IDNA-encodes to a DIFFERENT name. Keep the literal below correct.
  ['https://ex\u00e4mple.com', 'https://xn--exmple-cua.com'],
  ['https://[2001:db8::1]:8443', 'https://[2001:db8::1]:8443'],
];

const rejected = [
  'https://example.com/',
  'https://example.com/path',
  'https://example.com?q',
  'https://example.com#f',
  'https://example.com?',
  'https://example.com#',
  'https://user:pw@example.com',
  'https://example.com.',
  'ftp://example.com',
  'file:///tmp/example',
  'data:text/plain,example',
  'custom://example.com',
  'https://example.com:99999',
  'https://example.com:',
  ' https://example.com ',
  'https://exa mple.com',
  'https://exa%20mple.com',
  'https://192.168.001.1',
  'example.com',
  '',
  '   ',
] as const;

describe('bare-origin validator normative table', () => {
  it.each(accepted)('catches mutation of accepted normalization for %s', (input, expected) => {
    expect(validateBareOrigin(input)).toBe(expected);
  });

  it.each(rejected)('catches mutation that admits forbidden syntax in %j', (input) => {
    expect(() => validateBareOrigin(input)).toThrow(INVALID_ORIGIN_MESSAGE);
  });

  it.each([
    'https://0x7f000001',
    'https://0x7f.0x0.0x0.0x1',
    'https://0xc0a80101',
    'https://0177.0.0.1',
    'https://2130706433',
    'https://[::ffff:127.0.0.1]',
  ])('catches exact canonical-host idempotence mutation for %s', (input) => {
    expect(() => validateBareOrigin(input)).toThrow(INVALID_ORIGIN_MESSAGE);
  });

  it('catches exact trailing-backslash delimiter mutation', () => {
    expect(() => validateBareOrigin('https://example.com\\')).toThrow(INVALID_ORIGIN_MESSAGE);
  });

  it.each([
    'https://example.com\u0000',
    'https://example.com\u0001',
    'https://example.com\u001f',
    'https://example.com\u0020',
    'https://example.com\u007f',
  ])('catches exact pre-parse C0-or-DEL rejection mutation for %j', (input) => {
    expect(() => validateBareOrigin(input)).toThrow(INVALID_ORIGIN_MESSAGE);
  });

  it.each([
    'https://example.com:0443',
    'http://example.com:00080',
    'https://example.com:00',
  ])('catches exact canonical-decimal-port mutation for %s', (input) => {
    expect(() => validateBareOrigin(input)).toThrow(INVALID_ORIGIN_MESSAGE);
  });

  it('catches exact encoded-host percent-guard mutation independently of URL parse rejection', () => {
    expect(() => validateBareOrigin('https://exa%2Emple.com')).toThrow(INVALID_ORIGIN_MESSAGE);
  });
});
