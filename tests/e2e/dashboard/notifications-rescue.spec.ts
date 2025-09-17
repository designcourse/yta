import { test, expect } from '@playwright/test';

test.describe('Dashboard - Notifications and Rescue Flow', () => {
  test('shows rescue notification toast and opens Next Experiment', async ({ page, baseURL }) => {
    const target = baseURL ?? 'http://localhost:3000';

    // Navigate to dashboard
    await page.goto(`${target}/dashboard`);
    await page.waitForFunction(() => /\/dashboard/i.test(location.pathname), { timeout: 60_000 });

    // Method 1: Inject a test notification via browser storage/state
    await page.evaluate(() => {
      // Simulate notification state that would come from API
      window.dispatchEvent(new CustomEvent('test-inject-notification', {
        detail: {
          id: 'test-rescue-1',
          type: 'rescue_prompt',
          title: 'Rescue opportunity: packaging underperforming',
          body: 'Early velocity is below comparable P25 without AVD penalty.',
          metadata: { vph: 45.2, vph_p25: 52.1, hours_since: 1.2 },
          is_read: false
        }
      }));
    });

    // Look for notification toast
    const toast = page.locator('[role="status"]').filter({ hasText: 'Rescue opportunity' });
    await expect(toast).toBeVisible({ timeout: 10_000 });

    // Verify toast content
    await expect(toast).toContainText('packaging underperforming');
    await expect(toast).toContainText('VPH 45.2 vs P25 52.1');

    // Click "Open Next Experiment" button
    const openBtn = toast.getByRole('button', { name: /open next experiment/i });
    await expect(openBtn).toBeVisible();
    await openBtn.click();

    // Verify toast disappears
    await expect(toast).not.toBeVisible({ timeout: 5_000 });

    // Verify Neria opens and shows Next Experiment panel
    const neriaContainer = page.locator('.neria-loading-border, [style*="313344"]').first();
    await expect(neriaContainer).toBeVisible({ timeout: 10_000 });
    
    // Look for Next Experiment panel
    const experimentPanel = page.locator('text=Next Experiment').first();
    await expect(experimentPanel).toBeVisible({ timeout: 15_000 });
  });

  test('dismisses notification without opening Neria', async ({ page, baseURL }) => {
    const target = baseURL ?? 'http://localhost:3000';
    await page.goto(`${target}/dashboard`);
    await page.waitForFunction(() => /\/dashboard/i.test(location.pathname), { timeout: 60_000 });

    // Inject test notification
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('test-inject-notification', {
        detail: {
          id: 'test-rescue-2',
          type: 'rescue_prompt',
          title: 'Rescue opportunity',
          body: 'Test notification body',
          is_read: false
        }
      }));
    });

    const toast = page.locator('[role="status"]').filter({ hasText: 'Rescue opportunity' });
    await expect(toast).toBeVisible({ timeout: 10_000 });

    // Click dismiss
    const dismissBtn = toast.getByRole('button', { name: /dismiss/i });
    await dismissBtn.click();

    // Verify toast disappears
    await expect(toast).not.toBeVisible({ timeout: 5_000 });
  });

  test('respects prefers-reduced-motion', async ({ page, baseURL }) => {
    // Set reduced motion preference
    await page.emulateMedia({ reducedMotion: 'reduce' });
    
    const target = baseURL ?? 'http://localhost:3000';
    await page.goto(`${target}/dashboard`);
    await page.waitForFunction(() => /\/dashboard/i.test(location.pathname), { timeout: 60_000 });

    // Check that transitions are disabled when reduced motion is preferred
    const layout = page.locator('.dashboard-layout').first();
    await expect(layout).toBeVisible();
    
    // Toast should still appear but without transitions
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('test-inject-notification', {
        detail: { id: 'test-3', type: 'info', title: 'Test', is_read: false }
      }));
    });

    const toast = page.locator('[role="status"]');
    await expect(toast).toBeVisible({ timeout: 10_000 });
    
    // Verify no transition style is applied
    const toastStyle = await toast.locator('> div').first().getAttribute('style');
    expect(toastStyle).not.toContain('transition');
  });
});
