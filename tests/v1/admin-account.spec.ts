import { test, expect } from '@playwright/test';

// Admin-zijbalk toont wie er ingelogd is (draait onder het 'v1'-project).
// member@example.com = seed-admin die ook lid is van seed-org A, dus hij ziet
// ook de link naar het klantendashboard.

const MEMBER = { email: 'member@example.com', password: process.env.V1_SEED_MEMBER_PW ?? '' };

test('admin-zijbalk toont het ingelogde account', async ({ page }) => {
  test.skip(!MEMBER.password, 'V1_SEED_MEMBER_PW ontbreekt');
  await page.goto('/v1/login');
  await page.fill('input[name="email"]', MEMBER.email);
  await page.fill('input[name="password"]', MEMBER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/v1\/(app|admin)/);

  await page.goto('/v1/admin/organizations');
  const account = page.locator('.v1-adm-account');
  await expect(account).toContainText('Ingelogd als');
  await expect(account).toContainText(MEMBER.email);
  await expect(page.getByRole('link', { name: 'Naar klantendashboard' })).toBeVisible();
});
