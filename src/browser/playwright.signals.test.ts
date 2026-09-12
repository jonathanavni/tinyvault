import { describe, expect, it, vi } from 'vitest';
import { launchChromium, type Browser } from './playwright';

describe('M8-C5 browser signal ownership', () => {
  it('preserves the exact default launch options for existing callers', async () => {
    const browser = {} as Browser; const launch = vi.fn(async () => browser);
    expect(await launchChromium({ launch }, ['--test-argument'])).toBe(browser);
    expect(launch).toHaveBeenCalledExactlyOnceWith({
      headless: true, args: ['--disable-back-forward-cache', '--test-argument'],
    });
  });
  it('disables all three Playwright handlers only for explicit false', async () => {
    const browser = {} as Browser; const launch = vi.fn(async () => browser);
    expect(await launchChromium({ launch }, [], false)).toBe(browser);
    expect(launch).toHaveBeenCalledExactlyOnceWith({
      headless: true, args: ['--disable-back-forward-cache'],
      handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
    });
  });
});
