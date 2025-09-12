import { chromium, expect, FullConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import os from 'os';

async function globalSetup(config: FullConfig) {
  const baseURL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const useFresh = process.env.PLAYWRIGHT_FRESH_PROFILE === '1';
  const userDataDir = useFresh
    ? fs.mkdtempSync(path.join(os.tmpdir(), 'pw-fresh-'))
    : path.resolve('.playwright-profile');
  if (!useFresh) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  // Launch a persistent context using system Chrome with fewer automation hints.
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chrome',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check'
    ]
  });

  const page = await context.newPage();
  await page.goto(baseURL);

  // If already authenticated, skip.
  // Adjust selector below to a reliable post-login indicator in your app.
  const baseHost = new URL(baseURL).host;

  // Ask the user to complete login manually in the opened Chrome.
  console.log('\n[Playwright] Please sign in with Google in the opened Chrome window.');
  console.log('[Playwright] Waiting until you are back on the app and logged in (up to 5 minutes)...');

  // Wait until we're back on our app host AND we detect either a dashboard route or a logout/sign-out control.
  await page
    .waitForFunction(
      (expectedHost) => {
        const onAppHost = location.host === expectedHost && !location.hostname.endsWith('accounts.google.com');
        const path = location.pathname.toLowerCase();
        const hasDashboardPath = path.includes('/dashboard');
        const controls = Array.from(document.querySelectorAll('button, a')) as HTMLElement[];
        const hasLogout = controls.some((el) => /log\s*out|sign\s*out/i.test(el.innerText || ''));
        return onAppHost && (hasDashboardPath || hasLogout);
      },
      baseHost,
      { timeout: 300_000 }
    )
    .catch(() => {});

  // Save storage state for tests
  fs.mkdirSync('tests/.auth', { recursive: true });
  await context.storageState({ path: 'tests/.auth/storageState.json' });
  await context.close();
}

export default globalSetup;


