import {
  chromium,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Page,
} from 'playwright';

export type { Browser, BrowserContext, CDPSession, Page };

export type ChromiumLauncher = Pick<typeof chromium, 'launch'>;

export async function launchChromium(
  launcher: ChromiumLauncher = chromium,
  additionalArgs: readonly string[] = [],
  handleSignals?: false,
): Promise<Browser> {
  try {
    return await launcher.launch({
      headless: true,
      args: ['--disable-back-forward-cache', ...additionalArgs],
      ...(handleSignals === false ? { handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false } : {}),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Executable doesn\'t exist')) {
      throw new Error('Chromium is not installed; run make browsers');
    }
    throw error;
  }
}
