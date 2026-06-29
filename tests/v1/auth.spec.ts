import { test, expect } from '@playwright/test';

// V1-auth end-to-end (§4 fundament-bewijs + M1 org-resolutie-shift). Draait onder
// het 'v1'-Playwright-project (geen V0-storageState). De seed (npm run v1:seed +
// v1:seed:chunks) maakt:
//   - member@example.com   → lid van seed-org A (chatbot "Manta Demo")
//   - outsider@example.com → lid van seed-org B (chatbot "Org B Demo")
// M1: /v1/app resolveert de org uit de SESSIE (getSessionOrg), niet uit env. Dus
// member ziet org A, outsider ziet org B — elk z'n EIGEN org (niet de seed-env-org).
// De échte deny-path (lid van GEEN org → "Geen toegang") staat in onboarding.spec.ts.
// Wachtwoorden komen uit .env.local (V1_SEED_*), geladen via playwright.config.ts.

const MEMBER = { email: 'member@example.com', password: process.env.V1_SEED_MEMBER_PW ?? '' };
const OUTSIDER = { email: 'outsider@example.com', password: process.env.V1_SEED_OUTSIDER_PW ?? '' };

test('onge-authenticeerd → redirect naar /v1/login', async ({ page }) => {
  await page.goto('/v1/app');
  await expect(page).toHaveURL(/\/v1\/login/);
});

test('lid van org A logt in → ziet de eigen org (Manta Demo)', async ({ page }) => {
  await page.goto('/v1/login');
  await page.fill('input[name="email"]', MEMBER.email);
  await page.fill('input[name="password"]', MEMBER.password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/v1\/app/);
  await expect(page.getByText(/ingelogd/i)).toBeVisible();
  await expect(page.getByText('Manta Demo')).toBeVisible();
});

test('lid van org B logt in → ziet de EIGEN org (Org B Demo), niet de seed-env-org', async ({ page }) => {
  await page.goto('/v1/login');
  await page.fill('input[name="email"]', OUTSIDER.email);
  await page.fill('input[name="password"]', OUTSIDER.password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/v1\/app/);
  // getSessionOrg resolveert outsider → org B; hij ziet B's chatbot, NIET A's.
  await expect(page.getByText('Org B Demo')).toBeVisible();
  await expect(page.getByText('Manta Demo')).toHaveCount(0);
});
