// Intro-melding 'Dit is een fictief voorbeeld' op de publieke demo (/voorbeeld).
// Alleen-lezen: openen, sluiten en de rondleiding starten (geen chat, geen formulieren).

import { expect, test } from '@playwright/test';

const NOTICE = 'Dit is een fictief voorbeeld';

test('melding: modal met focus, Esc sluit, één keer per sessie, daarna rondleiding', async ({ page }) => {
  await page.goto('/voorbeeld');

  const dialog = page.getByRole('dialog', { name: NOTICE });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bekijk het voorbeeld' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Zelfde tab-sessie: na een reload geen melding meer.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Rondleiding' }).first()).toBeVisible();
  await expect(page.getByRole('dialog', { name: NOTICE })).toHaveCount(0);

  // De rondleiding start pas na het sluiten, via de knop.
  await page.getByRole('button', { name: 'Rondleiding' }).first().click();
  // De tour-wrapper zelf heeft geen afmeting (alleen fixed kinderen), dus check de stap-tekst.
  const tour = page.getByRole('dialog', { name: 'Rondleiding' });
  await expect(tour.getByText(/Stap 1 van \d+/)).toBeVisible();
});

test('melding: klik op de kaart sluit niet, klik op de achtergrond wel', async ({ page }) => {
  await page.goto('/voorbeeld/website');

  const dialog = page.getByRole('dialog', { name: NOTICE });
  await expect(dialog).toBeVisible();

  await page.getByRole('heading', { name: NOTICE }).click();
  await expect(dialog).toBeVisible();

  // Linksboven in de viewport ligt buiten de kaart: dat is de backdrop.
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();
});
