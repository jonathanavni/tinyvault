import {
  chromium,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Page,
} from 'playwright';

export type { Browser, BrowserContext, CDPSession, Page };

export async function launchChromium(): Promise<Browser> {
  try {
    return await chromium.launch({
      headless: true,
      args: ['--disable-back-forward-cache'],
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Executable doesn\'t exist')) {
      throw new Error('Chromium is not installed; run make browsers');
    }
    throw error;
  }
}
