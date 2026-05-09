import { test, expect } from '@playwright/test';
import * as path from 'node:path';

const authState = path.resolve(__dirname, '../.auth-state.json');

test.describe('V0 theme switch', () => {
  test.beforeEach(async ({ page }) => {
    // Wis alleen localStorage (theme keuze), maar behoud de auth-cookie.
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
  });

  test('toggle switches html class and persists across reload', async ({ page }) => {
    await page.goto('/');

    // Wacht tot ThemeSwitch zichtbaar is
    const switchGroup = page.getByRole('radiogroup', { name: 'Theme' });
    await expect(switchGroup).toBeVisible();

    // Klik Dark
    await switchGroup.getByRole('radio', { name: 'Dark mode' }).click();

    // Verify <html> heeft class="dark" en data-theme="dark"
    const html = page.locator('html');
    await expect(html).toHaveClass(/(?:^| )dark(?: |$)/);
    await expect(html).toHaveAttribute('data-theme', 'dark');

    // Reload — verify dark mode behoudt
    await page.reload();
    await expect(html).toHaveClass(/(?:^| )dark(?: |$)/);
    await expect(html).toHaveAttribute('data-theme', 'dark');

    // Klik Light
    await switchGroup.getByRole('radio', { name: 'Light mode' }).click();
    await expect(html).not.toHaveClass(/(?:^| )dark(?: |$)/);
    await expect(html).toHaveAttribute('data-theme', 'light');
  });

  test('no FOUC on hard reload — initial paint matches stored choice', async ({ page }) => {
    // Stel dark in via een eerste bezoek
    await page.goto('/');
    await page.getByRole('radio', { name: 'Dark mode' }).click();

    // Hard-reload met cache-bust en check dat <html> al class='dark' heeft
    // VOORDAT React hydrateert. We doen dit door de class direct na navigatie te checken.
    await page.goto('/', { waitUntil: 'commit' });

    // 'commit' betekent: navigatie is begonnen maar DOM nog niet volledig geladen.
    // Het inline FOUC-script is op dit moment al gedraaid (synchroon in <head>).
    const htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).toContain('dark');
  });

  test('system mode follows prefers-color-scheme', async ({ browser }) => {
    // Maak een context met dark color-scheme preference + auth cookie
    const darkContext = await browser.newContext({
      colorScheme: 'dark',
      storageState: authState,
    });
    const darkPage = await darkContext.newPage();
    await darkPage.goto('/');
    // Default = system, dus <html> moet class='dark' hebben
    await expect(darkPage.locator('html')).toHaveClass(/(?:^| )dark(?: |$)/);
    await darkContext.close();

    const lightContext = await browser.newContext({
      colorScheme: 'light',
      storageState: authState,
    });
    const lightPage = await lightContext.newPage();
    await lightPage.goto('/');
    await expect(lightPage.locator('html')).not.toHaveClass(/(?:^| )dark(?: |$)/);
    await lightContext.close();
  });
});
