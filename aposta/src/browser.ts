import { chromium, type BrowserContext, type Page } from 'playwright';

export async function launchBrowser(profileDir: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    // Suppress Chrome's "didn't shut down correctly / Restore" bubble, which can
    // overlay and block the page after an abrupt exit.
    args: ['--hide-crash-restore-bubble', '--no-first-run', '--no-default-browser-check'],
    ignoreDefaultArgs: ['--enable-automation'],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

export async function closeBrowser(context: BrowserContext): Promise<void> {
  await context.close();
}
