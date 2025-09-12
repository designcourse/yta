import { test, expect } from '@playwright/test';

test.describe('Dashboard - Neria chat', () => {
  test('user can open Neria and receive a response', async ({ page, baseURL }) => {
    const target = baseURL ?? 'http://localhost:3000';

    // Navigate directly to dashboard root; globalSetup holds the manual login gate.
    await page.goto(`${target}/dashboard`);

    // Ensure we are on a dashboard page before proceeding.
    await page.waitForFunction(() => /\/dashboard/i.test(location.pathname), { timeout: 60_000 });

    // Locate Neria input by its name attribute and send button by aria-label
    const input = page.locator('input[name="neriaInput"]');
    await expect(input).toBeVisible({ timeout: 30_000 });
    await input.fill('Quick test message');
    const sendBtn = page.getByRole('button', { name: 'Send message' });
    await sendBtn.click();

    // Confirm the latest user message appears (avoid strict mode by narrowing to user bubble container)
    await expect(
      page.locator('div.ml-auto').filter({ hasText: 'Quick test message' }).first()
    ).toBeVisible({ timeout: 30_000 });

    // Wait for assistant response container and assert non-empty text
    const response = page.locator('[data-testid="neria-response"]').first();
    await expect(response).toBeVisible({ timeout: 90_000 });
    const text = (await response.innerText()).trim();
    expect(text.length).toBeGreaterThan(0);
  });
});


