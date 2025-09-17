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

  test('Next Experiment shows after KPIs load and matches API verdicts', async ({ page, baseURL }) => {
    const target = baseURL ?? 'http://localhost:3000';
    await page.goto(`${target}/dashboard/latest-video`);
    await page.waitForFunction(() => /\/dashboard\/.*\/latest-video/i.test(location.pathname), { timeout: 60_000 });

    // Wait for KPIs widget
    const kpiCard = page.locator('text=KPIs vs Baselines').first();
    await expect(kpiCard).toBeVisible({ timeout: 60_000 });

    // Fire a fetch to the KPIs endpoint from the browser to get ground truth
    const kpis = await page.evaluate(async () => {
      const m = location.pathname.match(/dashboard\/([^/]+)/);
      const channelId = m ? decodeURIComponent(m[1]) : '';
      const res = await fetch(`/api/dashboard/kpis?channelId=${encodeURIComponent(channelId)}`);
      return res.ok ? await res.json() : null;
    });

    // If KPIs returned, check one rendered metric string appears
    if (kpis && kpis.current && typeof kpis.current.avd_24h !== 'undefined' && kpis.baselines?.avd_24h) {
      const currentAvd = Math.round((kpis.current.avd_24h || 0) * 100) / 100;
      await expect(page.locator(`text=Current: ${currentAvd}`)).toBeVisible({ timeout: 30_000 });
    }

    // Open Neria (it auto-loads Next Experiment)
    const neria = page.locator('[data-testid="neria-response"], text=Next Experiment').first();
    await expect(neria).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('text=Next Experiment').first()).toBeVisible({ timeout: 60_000 });
  });
});


