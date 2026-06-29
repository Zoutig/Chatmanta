import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// V1 M1 — onboarding e2e (Playwright --project=v1, self-login, geen V0-storageState).
//
// ⚠️ NIET nu draaien: vereist migratie 0004 (audit_logs) LIVE op het V1-project + een
// Jorion-admin-seedgebruiker (users.is_jorion_admin=true) met creds in env. De org-
// resolutie-shift zelf (member ziet eigen org) is migratie-onafhankelijk en staat in
// auth.spec.ts. Dit bestand bewijst createClientOrganization (DB-effect) + de echte
// deny-path (lid van GEEN org). Skip-guarded zodat het niet faalt zolang die er niet zijn.
//
// Benodigde env (allen optioneel; ontbreekt er één → skip):
//   NEXT_PUBLIC_V1_SUPABASE_URL, NEXT_PUBLIC_V1_SUPABASE_ANON_KEY,
//   V1_SUPABASE_SERVICE_ROLE_KEY, V1_SEED_ADMIN_EMAIL, V1_SEED_ADMIN_PW

const URL = process.env.NEXT_PUBLIC_V1_SUPABASE_URL;
const SERVICE_KEY = process.env.V1_SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.V1_SEED_ADMIN_EMAIL;
const ADMIN_PW = process.env.V1_SEED_ADMIN_PW;

const haveAdmin = Boolean(URL && SERVICE_KEY && ADMIN_EMAIL && ADMIN_PW);

function svc(): SupabaseClient {
  return createClient(URL as string, SERVICE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function adminLogin(page: import('@playwright/test').Page) {
  await page.goto('/v1/login');
  await page.fill('input[name="email"]', ADMIN_EMAIL as string);
  await page.fill('input[name="password"]', ADMIN_PW as string);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/v1\/(app|admin)/);
}

test.describe('V1 M1 onboarding', () => {
  test.skip(!haveAdmin, 'V1-env / V1_SEED_ADMIN_* ontbreken (of migratie 0004 niet live)');

  test('admin maakt klant aan → org + owner-member + chatbot(v1.0) + audit-rij', async ({ page }) => {
    test.setTimeout(60_000);
    const stamp = Date.now();
    const company = `E2E Klant ${stamp}`;
    const ownerEmail = `e2e-owner-${stamp}@example.com`;
    const sb = svc();

    await adminLogin(page);
    await page.goto('/v1/admin/organizations/new');
    await page.fill('input[name="company_name"]', company);
    await page.fill('input[name="owner_email"]', ownerEmail);
    await page.click('button[type="submit"]');
    await expect(page.getByRole('status')).toContainText(/aangemaakt/i, { timeout: 40_000 });

    // assert DB-state via service-role
    const { data: org } = await sb
      .from('organizations')
      .select('id, slug')
      .eq('name', company)
      .is('deleted_at', null)
      .maybeSingle();
    expect(org, 'organizations-rij').toBeTruthy();
    const orgId = (org as { id: string }).id;

    try {
      const { data: members } = await sb
        .from('organization_members')
        .select('user_id, role')
        .eq('organization_id', orgId);
      expect(members?.some((m) => m.role === 'owner'), 'owner-membership').toBe(true);
      const ownerUserId = members?.find((m) => m.role === 'owner')?.user_id as string | undefined;

      const { data: bots } = await sb
        .from('chatbots')
        .select('id, bot_version')
        .eq('organization_id', orgId)
        .is('deleted_at', null);
      expect(bots?.length, 'precies één chatbot').toBe(1);
      expect(bots?.[0].bot_version, 'V1-default bot_version').toBe('v1.0');

      const { data: audit } = await sb
        .from('audit_logs')
        .select('action, target_id')
        .eq('organization_id', orgId)
        .eq('action', 'org.create');
      expect((audit ?? []).length, 'org.create audit-rij').toBeGreaterThan(0);
      expect(audit?.[0].target_id, 'audit target = org').toBe(orgId);

      // cleanup: audit (org_id wordt anders SET NULL bij org-delete) + org-cascade + owner auth-user
      await sb.from('audit_logs').delete().eq('organization_id', orgId);
      await sb.from('organizations').delete().eq('id', orgId); // cascade → members + chatbots
      if (ownerUserId) await sb.auth.admin.deleteUser(ownerUserId);
    } finally {
      // best-effort: laat geen org achter als een assert faalde vóór de cleanup
      await sb.from('organizations').delete().eq('id', orgId);
    }
  });

  test('gebruiker zonder org-membership → "Geen toegang"', async ({ page }) => {
    const sb = svc();
    const email = `e2e-noorg-${Date.now()}@example.com`;
    const password = `Pw-${Math.random().toString(36).slice(2)}-9!`;
    const { data: created, error } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !created?.user) test.skip(true, `kon geen no-org user maken: ${error?.message}`);
    const userId = (created as { user: { id: string } }).user.id;

    try {
      await page.goto('/v1/login');
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', password);
      await page.click('button[type="submit"]');
      // getSessionOrg → geen membership → AUTH_FORBIDDEN → "Geen toegang"
      await expect(page.getByText(/geen toegang/i)).toBeVisible({ timeout: 20_000 });
    } finally {
      await sb.auth.admin.deleteUser(userId);
    }
  });
});
