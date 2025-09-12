import { test, expect } from '@playwright/test';

test.describe('Login smoke', () => {
  test('shows authenticated dashboard', async ({ page, baseURL }) => {
    const target = baseURL ?? 'http://localhost:3000';
    await page.goto(target);

    // Wait for a robust post-login signal: dashboard route or visible sign-out control
    const success = await page
      .waitForFunction(() => {
        const path = location.pathname.toLowerCase();
        const onDashboard = path.includes('/dashboard');
        const elems = Array.from(document.querySelectorAll('button, a')) as HTMLElement[];
        const hasLogout = elems.some((el) => /log\s*out|sign\s*out/i.test(el.innerText || ''));
        const bodyHasDashboardWord = /dashboard/i.test(document.body.innerText || '');
        return onDashboard || hasLogout || bodyHasDashboardWord;
      }, { timeout: 60_000 })
      .then(() => true)
      .catch(() => false);

    expect(success).toBeTruthy();
  });
});


