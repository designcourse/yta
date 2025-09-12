import { test, expect } from '@playwright/test';
import fs from 'fs';

// One-time manual login to capture authenticated storage state.
// This opens a headed browser. Complete Google sign-in manually, wait until the app shows you as logged in,
// then the script will save cookies/localStorage for reuse by other tests.
test('authenticate and save storage state', async ({ page, context, baseURL }) => {
  const target = baseURL ?? 'http://localhost:3000';
  await page.goto(target);

  // Adjust selector to your login entry point if needed.
  // This tries common text variants for a Google sign-in button.
  const possibleButtons = [
    page.getByRole('button', { name: /sign in with google/i }),
    page.getByRole('button', { name: /continue with google/i }),
    page.getByText(/google/i)
  ];

  for (const locator of possibleButtons) {
    if (await locator.count()) {
      await locator.first().click().catch(() => {});
      break;
    }
  }

  // Give ample time to complete Google OAuth manually if needed.
  await page.waitForTimeout(180_000);

  // Heuristic: consider login complete when URL is back on our site.
  // Extend timeout for OAuth flows.
  await page.waitForURL(/^(?!https?:\/\/accounts\.google\.com).+$/, {
    timeout: 180_000
  }).catch(() => {});

  // If your app shows user-specific UI (e.g., avatar, dashboard), wait for that element here for reliability.
  // Example: await page.getByText(/dashboard/i).waitFor({ timeout: 60_000 });

  // Ensure target directory exists before writing storage state
  fs.mkdirSync('tests/.auth', { recursive: true });
  await context.storageState({ path: 'tests/.auth/storageState.json' });
});


