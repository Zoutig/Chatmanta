import { test, expect } from '@playwright/test';

const STORAGE_KEY = 'chatmanta:v0:style';

test.describe('V0 tone/length toggles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate((k) => window.localStorage.removeItem(k), STORAGE_KEY);
  });

  test('composer toont drempel + toon + lengte pills (Rewrite is verdwenen)', async ({
    page,
  }) => {
    await page.goto('/');

    // Composer-rij heeft pills voor drempel/toon/lengte
    const drempel = page.getByRole('button', { name: /drempel/i });
    const toon = page.getByRole('button', { name: /toon/i });
    const lengte = page.getByRole('button', { name: /lengte/i });

    await expect(drempel).toBeVisible();
    await expect(toon).toBeVisible();
    await expect(lengte).toBeVisible();

    // Rewrite-pill mag niet meer in de composer staan.
    const composer = page.locator('.composer');
    await expect(composer.getByText(/^Rewrite$/i)).toHaveCount(0);
  });

  test('tone-popover wijzigt label en persisteert na reload', async ({ page }) => {
    await page.goto('/');

    // Default = neutraal.
    const toon = page.getByRole('button', { name: /toon/i });
    await expect(toon).toContainText(/neutraal/i);

    // Open + kies casual.
    await toon.click();
    await page.getByRole('dialog', { name: /toon/i }).getByRole('button', { name: /^casual$/i }).click();
    await expect(toon).toContainText(/casual/i);

    // localStorage moet de keuze hebben.
    const stored = await page.evaluate(
      (k) => window.localStorage.getItem(k),
      STORAGE_KEY,
    );
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored ?? '{}');
    expect(parsed.tone).toBe('casual');
    expect(parsed.length).toBe('medium');

    // Reload → label nog steeds casual.
    await page.reload();
    const toonAfterReload = page.getByRole('button', { name: /toon/i });
    await expect(toonAfterReload).toContainText(/casual/i);
  });

  test('Settings-tab segmented sync met composer-pill', async ({ page }) => {
    await page.goto('/');

    // Open Settings-tab.
    await page.getByRole('tab', { name: /instellingen/i }).click();

    // Klik op "Formeel" in segmented control.
    await page.getByRole('radiogroup', { name: /toon/i }).getByRole('radio', { name: /^formeel$/i }).click();

    // Composer-pill moet nu "formeel" tonen (state-sync via ChatShell).
    await expect(page.getByRole('button', { name: /toon/i }).first()).toContainText(/formeel/i);
  });

  test('Prompt-tab toont base, suffix en final met huidige stijl', async ({ page }) => {
    await page.goto('/');

    // Zet length op short via composer.
    await page.getByRole('button', { name: /lengte/i }).click();
    await page
      .getByRole('dialog', { name: /lengte/i })
      .getByRole('button', { name: /^kort$/i })
      .click();

    // Open Prompt-tab.
    await page.getByRole('tab', { name: /^prompt$/i }).click();

    // Final-blok bevat de length-instructie.
    const promptContent = page.locator('.right-content');
    await expect(promptContent).toContainText(/STIJL:/);
    await expect(promptContent).toContainText(/maximaal 2 zinnen/);
  });
});
