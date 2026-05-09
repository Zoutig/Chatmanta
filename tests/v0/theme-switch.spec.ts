import { test, expect } from '@playwright/test';
import * as path from 'node:path';

const authState = path.resolve(__dirname, '../.auth-state.json');

test.describe('V0 theme switch', () => {
  test.beforeEach(async ({ page }) => {
    // Wis alleen localStorage (theme keuze), maar behoud de auth-cookie.
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
  });

  test('icon-toggle wisselt html.dark en blijft over reload', async ({ page }) => {
    await page.goto('/');

    const html = page.locator('html');
    const toggle = page.getByRole('switch', { name: /Schakel naar (dark|light) mode/ });
    await expect(toggle).toBeVisible();

    // Bepaal huidige stand. We klikken altijd naar dark als startpunt.
    const isDarkNow = await html.evaluate((el) => el.classList.contains('dark'));
    if (!isDarkNow) {
      // Eerste klik → dark
      await toggle.click();
    }
    await expect(html).toHaveClass(/(?:^| )dark(?: |$)/);
    await expect(html).toHaveAttribute('data-theme', 'dark');

    // Reload — dark moet blijven
    await page.reload();
    await expect(html).toHaveClass(/(?:^| )dark(?: |$)/);
    await expect(html).toHaveAttribute('data-theme', 'dark');

    // Klik nog eens → light
    await page.getByRole('switch', { name: /Schakel naar light mode/ }).click();
    await expect(html).not.toHaveClass(/(?:^| )dark(?: |$)/);
    await expect(html).toHaveAttribute('data-theme', 'light');
  });

  test('no FOUC on hard reload — initial paint matches stored choice', async ({ page }) => {
    // Stel dark in via een eerste bezoek
    await page.goto('/');
    const html = page.locator('html');
    const isDarkNow = await html.evaluate((el) => el.classList.contains('dark'));
    if (!isDarkNow) {
      await page.getByRole('switch', { name: /Schakel naar dark mode/ }).click();
    }

    // Hard-reload met cache-bust en check dat <html> al class='dark' heeft
    // VOORDAT React hydrateert. Het inline FOUC-script staat synchroon in <head>.
    await page.goto('/', { waitUntil: 'commit' });
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
