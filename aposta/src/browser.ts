import { chromium, type BrowserContext, type Page } from 'playwright';

export async function launchBrowser(profileDir: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

export async function closeBrowser(context: BrowserContext): Promise<void> {
  await context.close();
}
