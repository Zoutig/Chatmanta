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
  '/admindashboard/jobs',
  '/admindashboard/issues',
  '/admindashboard/usage',
  '/admindashboard/instellingen',
];

const DETAIL_TABS = ['botinstellingen', 'gesprekken', 'bronnen', 'jobs', 'usage', 'widget', 'onboarding', 'privacy', 'notities'];

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

  test('globale Gesprekken/Bronnen staan niet meer in de nav', async ({ page }) => {
    await page.goto('/admindashboard');
    // Gesprekken + bronnen zijn voortaan alléén per klant bereikbaar.
    await expect(page.locator('a[href="/admindashboard/gesprekken"]')).toHaveCount(0);
    await expect(page.locator('a[href="/admindashboard/bronnen"]')).toHaveCount(0);
  });

  test('oude globale routes redirecten naar de klantenlijst', async ({ page }) => {
    await page.goto('/admindashboard/gesprekken');
    await expect(page).toHaveURL(/\/admindashboard\/klanten$/);
    await page.goto('/admindashboard/bronnen');
    await expect(page).toHaveURL(/\/admindashboard\/klanten$/);
  });

  test('herlaadknop aanwezig op overview', async ({ page }) => {
    await page.goto('/admindashboard');
    await expect(page.getByRole('button', { name: 'Herlaad' }).first()).toBeVisible();
  });

  test('gesprek-detail opent vanuit de klant-gesprekkentab', async ({ page }) => {
    await page.goto('/admindashboard/klanten/acme-corp?tab=gesprekken');
    const open = page.getByRole('link', { name: /Bekijk/ }).first();
    test.skip((await open.count()) === 0, 'geen gesprekken in de laatste 30 dagen voor acme-corp');
    await open.click();
    await expect(page.getByRole('heading', { name: 'Gesprek' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: /Terug naar gesprekken/ })).toBeVisible();
    // org-scoping: het detail zit onder de klant-slug in de URL
    await expect(page).toHaveURL(/\/admindashboard\/klanten\/acme-corp\/gesprek\//);
  });

  test('gesprek-detail: onbekend gesprek → not-found', async ({ page }) => {
    await page.goto('/admindashboard/klanten/acme-corp/gesprek/00000000-0000-0000-0000-000000000000');
    await expect(page.getByRole('heading', { name: 'Gesprek' })).toHaveCount(0);
  });

  test('botinstellingen: opslaan persisteert via de bound admin-action', async ({ page }) => {
    await page.goto('/admindashboard/klanten/globex-inc?tab=botinstellingen');
    const toggle = page.getByRole('button', { name: 'Mag chatbot prijzen noemen?' });
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    const before = await toggle.getAttribute('aria-pressed');
    await toggle.click();
    await page.getByRole('button', { name: /Instellingen opslaan/ }).click();
    await expect(page.getByText('Opgeslagen').first()).toBeVisible({ timeout: 15_000 });
    await page.reload();
    const after = await page
      .getByRole('button', { name: 'Mag chatbot prijzen noemen?' })
      .getAttribute('aria-pressed');
    expect(after).not.toBe(before);
    // herstel naar de oorspronkelijke waarde zodat de demo-seed intact blijft
    await page.getByRole('button', { name: 'Mag chatbot prijzen noemen?' }).click();
    await page.getByRole('button', { name: /Instellingen opslaan/ }).click();
    await expect(page.getByText('Opgeslagen').first()).toBeVisible({ timeout: 15_000 });
  });

  test('bronnen: SourcesManager rendert met document-toevoegen', async ({ page }) => {
    await page.goto('/admindashboard/klanten/acme-corp?tab=bronnen');
    await expect(page.getByText('Websites', { exact: false }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Document toevoegen/ })).toBeVisible();
    // Nieuwe-website-crawlen-knop hoort er ook te zijn (taak 2: bronnen toevoegen).
    await expect(page.getByRole('button', { name: /^Crawlen/ })).toBeVisible();
  });

  test('bronnen: website deactiveren → heractiveren (retrieval-toggle)', async ({ page }) => {
    // demo-nieuw heeft een actieve website-bron (acme/globex/initech draaien op docs/Q&A).
    await page.goto('/admindashboard/klanten/demo-nieuw?tab=bronnen');
    const deact = page.getByRole('button', { name: 'Inactief zetten' }).first();
    test.skip((await deact.count()) === 0, 'geen actieve website-bron voor demo-nieuw');
    await deact.click();
    // Na deactiveren verschijnt de heractiveer-knop (disabled_at gezet + pagina's included=false).
    await expect(page.getByRole('button', { name: 'Heractiveren' }).first()).toBeVisible({ timeout: 15_000 });
    // Herstel zodat de demo-bron weer actief is voor de bot.
    await page.getByRole('button', { name: 'Heractiveren' }).first().click();
    await expect(page.getByRole('button', { name: 'Inactief zetten' }).first()).toBeVisible({ timeout: 15_000 });
  });

  test('crawl & jobs: operationeel overzicht rendert', async ({ page }) => {
    await page.goto('/admindashboard/jobs');
    await expect(page.getByRole('heading', { name: 'Crawls & Jobs' })).toBeVisible({ timeout: 15_000 });
    // De operator-knop om openstaande crawls te verwerken hoort er te zijn.
    await expect(page.getByRole('button', { name: /Verwerk openstaande crawls/ })).toBeVisible();
    // Rollup-metric aanwezig.
    await expect(page.getByText('Slagingspercentage').first()).toBeVisible();
  });

  test('overview toont Firecrawl-credits van deze maand', async ({ page }) => {
    await page.goto('/admindashboard');
    await expect(page.getByText('Firecrawl-credits').first()).toBeVisible({ timeout: 15_000 });
    // Waarde-formaat "X / 1000" hoort er te staan.
    await expect(page.getByText(/\/\s*\d+/).first()).toBeVisible();
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
