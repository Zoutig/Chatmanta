import { test, expect } from '@playwright/test';

// V1-auth end-to-end (§4 fundament-bewijs). Draait onder het 'v1'-Playwright-
// project (geen V0-storageState). De seed (npm run v1:seed) maakt:
//   - member@example.com   → lid van seed-org (V1_SEED_ORG_ID)
//   - outsider@example.com → GEEN lid (deny-path)
// Wachtwoorden komen uit .env.local (V1_SEED_*), geladen via playwright.config.ts.

const MEMBER = { email: 'member@example.com', password: process.env.V1_SEED_MEMBER_PW ?? '' };
const OUTSIDER = { email: 'outsider@example.com', password: process.env.V1_SEED_OUTSIDER_PW ?? '' };

test('onge-authenticeerd → redirect naar /v1/login', async ({ page }) => {
  await page.goto('/v1/app');
  await expect(page).toHaveURL(/\/v1\/login/);
});

test('lid logt in → ziet de beschermde pagina', async ({ page }) => {
  await page.goto('/v1/login');
  await page.fill('input[name="email"]', MEMBER.email);
  await page.fill('input[name="password"]', MEMBER.password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/v1\/app/);
  await expect(page.getByText(/ingelogd/i)).toBeVisible();
});

test('niet-lid wordt geweigerd', async ({ page }) => {
  await page.goto('/v1/login');
  await page.fill('input[name="email"]', OUTSIDER.email);
  await page.fill('input[name="password"]', OUTSIDER.password);
  await page.click('button[type="submit"]');
  await expect(page.getByText(/geen toegang/i)).toBeVisible();
});
