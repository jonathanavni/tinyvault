import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  launchChromium,
  type Browser,
  type ChromiumLauncher,
} from './playwright';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe('launchChromium', () => {
  it('reports the exact install instruction when PLAYWRIGHT_BROWSERS_PATH is empty', async () => {
    const emptyBrowserDirectory = await mkdtemp(
      path.join(tmpdir(), 'tinyvault-empty-playwright-browsers-'),
    );
    temporaryDirectories.push(emptyBrowserDirectory);
    const moduleUrl = pathToFileURL(path.resolve('src/browser/playwright.ts')).href;
    const childSource = `
      import { launchChromium } from ${JSON.stringify(moduleUrl)};
      try {
        await launchChromium();
        process.exitCode = 2;
      } catch (error) {
        if (!(error instanceof Error)) process.exitCode = 3;
        else process.stdout.write(error.message);
      }
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', childSource], {
      encoding: 'utf8',
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: emptyBrowserDirectory },
      timeout: 30_000,
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('Chromium is not installed; run make browsers');
  });

  it('launches the real browser, evaluates a page expression, and closes', async () => {
    const browser = await launchChromium();
    try {
      const page = await browser.newPage();
      expect(await page.evaluate(() => 1 + 1)).toBe(2);
    } finally {
      await browser.close();
    }
  });

  it('passes the BFCache-disable flag to Chromium', async () => {
    const browser = {} as Browser;
    const launch = vi.fn(async () => browser);
    const launcher: ChromiumLauncher = { launch };

    await expect(launchChromium(launcher)).resolves.toBe(browser);
    expect(launch).toHaveBeenCalledExactlyOnceWith({
      headless: true,
      args: ['--disable-back-forward-cache'],
    });
  });
});
