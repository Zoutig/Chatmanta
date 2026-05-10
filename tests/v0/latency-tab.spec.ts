import { test, expect } from '@playwright/test';

test.describe('V0 Latency tab + inline waterfall', () => {
  test('Latency-tab opent en toont window-toggle', async ({ page }) => {
    await page.goto('/');

    // Tab-knop met label "Latency" zit in de right-panel.
    const latencyTab = page.getByRole('tab', { name: /latency/i });
    await expect(latencyTab).toBeVisible();

    await latencyTab.click();

    // Window-toggle: 24u / 7d / all
    await expect(page.getByRole('tab', { name: '24u' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '7d' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'all' })).toBeVisible();

    // 7d is default-actief.
    const sevenDay = page.getByRole('tab', { name: '7d' });
    await expect(sevenDay).toHaveAttribute('aria-selected', 'true');
  });

  test('Window switch triggert nieuwe fetch (geen JS-error)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await page.getByRole('tab', { name: /latency/i }).click();

    await page.getByRole('tab', { name: '24u' }).click();
    // Wacht tot 24u geselecteerd is.
    await expect(page.getByRole('tab', { name: '24u' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.getByRole('tab', { name: 'all' }).click();
    await expect(page.getByRole('tab', { name: 'all' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    expect(errors).toEqual([]);
  });
});
