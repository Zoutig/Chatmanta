// Admin Dashboard — e2e smoke. Draait achter de auth-storageState uit global-setup.
//   PLAYWRIGHT_PORT=3002 npx playwright test tests/controlroom
//
// Dekt: overview rendert, geen dode nav-links, klantdetail + alle tabs, en een
// profiel-edit-round-trip (status wijzigen → opslaan → persisteert na reload).

import { test, expect } from '@playwright/test';

const NAV = [
  '/admindashboard',
  '/admindashboard/klanten',
  '/admindashboard/onboarding',
  '/admindashboard/gesprekken',
  '/admindashboard/bronnen',
  '/admindashboard/jobs',
  '/admindashboard/issues',
  '/admindashboard/usage',
  '/admindashboard/instellingen',
];

const DETAIL_TABS = ['gesprekken', 'bronnen', 'jobs', 'usage', 'widget', 'onboarding', 'privacy', 'notities'];

test.describe('Admin Dashboard', () => {
  test('overview rendert met kaarten', async ({ page }) => {
    await page.goto('/admindashboard');
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await expect(page.getByText('Klanten').first()).toBeVisible();
  });

  test('nav heeft geen dode links', async ({ page }) => {
    for (const href of NAV) {
      const res = await page.goto(href);
      expect(res?.status(), `${href} status`).toBeLessThan(400);
      await expect(page.locator('.klant-page-title'), `${href} titel`).toBeVisible();
    }
  });

  test('klantdetail toont header + alle tabs', async ({ page }) => {
    await page.goto('/admindashboard/klanten/acme-corp');
    await expect(page.getByRole('heading', { name: 'Dakwerken De Boer' })).toBeVisible();
    for (const tab of DETAIL_TABS) {
      await page.goto(`/admindashboard/klanten/acme-corp?tab=${tab}`);
      await expect(page.locator('.klant-tabs'), `tab ${tab}`).toBeVisible();
    }
  });

  test('onbekende org → not-found (geen detail)', async ({ page }) => {
    await page.goto('/admindashboard/klanten/bestaat-niet');
    // notFound() vuurt vóór de detail-render → de tab-balk bestaat niet.
    await expect(page.locator('.klant-tabs')).toHaveCount(0);
  });

  test('profiel-edit persisteert', async ({ page }) => {
    await page.goto('/admindashboard/klanten/globex-inc');
    const sel = page.locator('select').first(); // commerciële status
    await sel.selectOption('paused');
    await page.getByRole('button', { name: /Opslaan/ }).first().click();
    await expect(page.getByText('Opgeslagen ✓').first()).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.locator('select').first()).toHaveValue('paused');
    // herstel naar trial zodat de demo-seed-staat intact blijft
    await page.locator('select').first().selectOption('trial');
    await page.getByRole('button', { name: /Opslaan/ }).first().click();
    await expect(page.getByText('Opgeslagen ✓').first()).toBeVisible({ timeout: 15_000 });
  });
});
