import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Leads-dashboard e2e (draait onder het 'v1'-project). Gebruikt member@example.com
// (seed-admin op V1-prod) en outsider@example.com (geen admin). Alle testleads hebben
// bron = 'test' en niche = 'e2e-test-niche' en worden na afloop opgeruimd.

const db = createClient(process.env.NEXT_PUBLIC_V1_SUPABASE_URL!, process.env.V1_SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const NICHE = 'e2e-test-niche';
const MEMBER_PW = process.env.V1_SEED_MEMBER_PW ?? '';
const OUTSIDER_PW = process.env.V1_SEED_OUTSIDER_PW ?? '';

let memberId = '';
let outsiderId = '';
/** true = de test heeft de lead_afzenders-rij zelf aangemaakt en ruimt hem op. */
let afzenderAangemaakt = false;

async function login(page: Page, email: string, pw: string) {
  await page.goto('/v1/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', pw);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/v1\/(app|admin)/);
}

/** Zet beide testleads terug naar een schone beginstand. */
async function resetLeads() {
  await db
    .from('lead_activiteiten')
    .delete()
    .in('lead_id', ((await db.from('leads').select('id').eq('bron', 'test')).data ?? []).map((r) => r.id));
  const { error } = await db
    .from('leads')
    .update({
      status: 'open',
      status_reden: null,
      geclaimd_door: null,
      geclaimd_tot: null,
      volgende_actie_op: null,
      pogingen_niet_opgenomen: 0,
      opvolgmail_gestuurd_op: null,
      opvolgmail_situatie: null,
    })
    .eq('bron', 'test');
  if (error) throw error;
}

test.describe.serial('leads-dashboard', () => {
  test.beforeAll(async () => {
    await db.from('leads').delete().eq('bron', 'test');
    const { error } = await db.from('leads').insert([
      { bedrijfsnaam: 'E2E Bouw Alfa', domein: 'e2e-alfa.invalid', telefoon: '+31600000001', niche: NICHE, plaats: 'Teststad', score: 12, bron: 'test', contactpersoon: 'Jan', email: 'jan@e2e-alfa.invalid' },
      { bedrijfsnaam: 'E2E Bouw Beta', domein: 'e2e-beta.invalid', telefoon: '+31600000002', niche: NICHE, plaats: 'Teststad', score: 8, bron: 'test' },
    ]);
    if (error) throw error;

    const { data: m } = await db.from('users').select('id').eq('email', 'member@example.com').single();
    const { data: o } = await db.from('users').select('id').eq('email', 'outsider@example.com').single();
    memberId = m!.id;
    outsiderId = o!.id;

    // Afzenderprofiel voor member: alleen aanmaken (en straks opruimen) als het er niet al was.
    const { data: bestaand } = await db.from('lead_afzenders').select('user_id').eq('user_id', memberId).maybeSingle();
    if (!bestaand) {
      const { error: e2 } = await db.from('lead_afzenders').insert({
        user_id: memberId,
        naam: 'Test Admin',
        voornaam: 'Test',
        functie: 'Tester',
        telefoon: '0600000000',
        email: 'member@example.com',
      });
      if (e2) throw e2;
      afzenderAangemaakt = true;
    }
  });

  test.afterAll(async () => {
    const { data: ids } = await db.from('leads').select('id').eq('bron', 'test');
    const lijst = (ids ?? []).map((r) => r.id);
    if (lijst.length) await db.from('lead_activiteiten').delete().in('lead_id', lijst);
    await db.from('leads').delete().eq('bron', 'test');
    if (afzenderAangemaakt) await db.from('lead_afzenders').delete().eq('user_id', memberId);
  });

  test('niet-admin krijgt geen toegang', async ({ page }) => {
    await login(page, 'outsider@example.com', OUTSIDER_PW);
    await page.goto('/v1/leads');
    await expect(page.getByRole('heading', { name: 'Geen toegang' })).toBeVisible();
  });

  test('belmodus: hoogste score eerst, niet opgenomen, ongedaan maken via knop', async ({ page }) => {
    await resetLeads();
    await login(page, 'member@example.com', MEMBER_PW);
    await page.goto(`/v1/leads/bellen?niche=${NICHE}`);
    await expect(page.getByRole('heading', { name: 'E2E Bouw Alfa' })).toBeVisible();
    await page.keyboard.press('1');
    await expect(page.getByRole('heading', { name: 'E2E Bouw Beta' })).toBeVisible();
    await page.getByRole('button', { name: /Ongedaan maken/ }).click();
    await expect(page.getByRole('heading', { name: 'E2E Bouw Alfa' })).toBeVisible();
    const { data } = await db.from('leads').select('pogingen_niet_opgenomen').eq('domein', 'e2e-alfa.invalid').single();
    expect(data!.pogingen_niet_opgenomen).toBe(0);
  });

  test('belmodus: Ctrl+Z maakt de laatste uitkomst ongedaan', async ({ page }) => {
    await resetLeads();
    await login(page, 'member@example.com', MEMBER_PW);
    await page.goto(`/v1/leads/bellen?niche=${NICHE}`);
    await expect(page.getByRole('heading', { name: 'E2E Bouw Alfa' })).toBeVisible();
    await page.keyboard.press('1');
    await expect(page.getByRole('heading', { name: 'E2E Bouw Beta' })).toBeVisible();
    await expect(page.getByRole('status').getByText(/E2E Bouw Alfa: opgeslagen/)).toBeVisible();
    await page.keyboard.press('Control+z');
    await expect(page.getByRole('heading', { name: 'E2E Bouw Alfa' })).toBeVisible();
    const { data } = await db.from('leads').select('pogingen_niet_opgenomen').eq('domein', 'e2e-alfa.invalid').single();
    expect(data!.pogingen_niet_opgenomen).toBe(0);
  });

  test('belmodus: derde keer niet opgenomen toont de keuzedialoog (archiveren)', async ({ page }) => {
    await resetLeads();
    const { error } = await db.from('leads').update({ pogingen_niet_opgenomen: 2 }).eq('domein', 'e2e-alfa.invalid');
    expect(error).toBeNull();
    await login(page, 'member@example.com', MEMBER_PW);
    await page.goto(`/v1/leads/bellen?niche=${NICHE}`);
    await expect(page.getByRole('heading', { name: 'E2E Bouw Alfa' })).toBeVisible();
    await expect(page.getByText('Poging 3 van 3')).toBeVisible();
    await page.keyboard.press('1');
    const dialoog = page.getByRole('dialog');
    await expect(dialoog.getByRole('heading', { name: 'Derde keer niet opgenomen' })).toBeVisible();
    await dialoog.getByRole('button', { name: 'Archiveren' }).click();
    await expect(page.getByRole('heading', { name: 'E2E Bouw Beta' })).toBeVisible();
    const { data } = await db.from('leads').select('status').eq('domein', 'e2e-alfa.invalid').single();
    expect(data!.status).toBe('archief');
  });

  test('interesse met mail opent de mail-pop-up en legt de mail vast', async ({ page, context }) => {
    await resetLeads();
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await login(page, 'member@example.com', MEMBER_PW);
    await page.goto(`/v1/leads/bellen?niche=${NICHE}`);
    await expect(page.getByRole('heading', { name: 'E2E Bouw Alfa' })).toBeVisible();
    await page.keyboard.press('4');
    await page.getByRole('dialog').getByRole('button', { name: 'Opslaan' }).click();
    const popup = page.getByRole('dialog', { name: 'Opvolgmail' });
    await expect(popup).toBeVisible();
    await popup.getByRole('button', { name: 'Kopieer mail' }).click();
    await popup.getByRole('button', { name: 'Verstuurd', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'E2E Bouw Beta' })).toBeVisible();
    const { data } = await db.from('leads').select('status, opvolgmail_situatie').eq('domein', 'e2e-alfa.invalid').single();
    expect(data).toEqual({ status: 'kans', opvolgmail_situatie: 'info' });
  });

  test('overzicht: lead staat onder Kansen; inzicht laadt', async ({ page }) => {
    await login(page, 'member@example.com', MEMBER_PW);
    await page.goto(`/v1/leads?tab=kansen&niche=${NICHE}`);
    await expect(page.getByRole('link', { name: 'E2E Bouw Alfa' })).toBeVisible();
    await page.goto('/v1/leads/inzicht?periode=vandaag');
    await expect(page.getByText('Cold calls')).toBeVisible();
  });

  test('een door een ander geclaimde lead komt niet in jouw belmodus', async ({ page }) => {
    await resetLeads();
    // Outsider (een ander account; FK geclaimd_door → users) heeft Alfa geclaimd.
    const { error } = await db
      .from('leads')
      .update({ geclaimd_door: outsiderId, geclaimd_tot: new Date(Date.now() + 10 * 60_000).toISOString() })
      .eq('domein', 'e2e-alfa.invalid');
    expect(error).toBeNull();
    await login(page, 'member@example.com', MEMBER_PW);
    await page.goto(`/v1/leads/bellen?niche=${NICHE}`);
    await expect(page.getByRole('heading', { name: 'E2E Bouw Beta' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'E2E Bouw Alfa' })).toHaveCount(0);
  });

  test('twee bellers krijgen niet dezelfde lead (atomaire claim)', async ({ browser }) => {
    await resetLeads();
    const a = await browser.newPage();
    try {
      await login(a, 'member@example.com', MEMBER_PW);
      await a.goto(`/v1/leads/bellen?niche=${NICHE}`);
      await expect(a.getByRole('heading', { name: 'E2E Bouw Alfa' })).toBeVisible();
      const { data: claim, error } = await db.rpc('leads_claim_volgende', { p_user: outsiderId, p_niche: NICHE });
      expect(error).toBeNull();
      expect((claim as { bedrijfsnaam: string }[])[0]?.bedrijfsnaam).toBe('E2E Bouw Beta');
    } finally {
      await a.close();
    }
  });

  test('opvolgen: twee groepen en een herinneringsknop na 3 werkdagen', async ({ page }) => {
    await resetLeads();
    const weekGeleden = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const { error: e1 } = await db.from('leads').update({ status: 'opvolgen', volgende_actie_op: weekGeleden }).eq('domein', 'e2e-alfa.invalid');
    const { error: e2 } = await db
      .from('leads')
      .update({ status: 'opvolgen', opvolgmail_gestuurd_op: weekGeleden, opvolgmail_situatie: 'info', volgende_actie_op: weekGeleden })
      .eq('domein', 'e2e-beta.invalid');
    expect(e1).toBeNull();
    expect(e2).toBeNull();
    await login(page, 'member@example.com', MEMBER_PW);
    await page.goto(`/v1/leads?tab=opvolgen&niche=${NICHE}`);
    const tabel = page.getByRole('table', { name: 'Leads' });
    await expect(tabel.getByRole('columnheader', { name: /Mail nog sturen/ })).toBeVisible();
    await expect(tabel.getByRole('columnheader', { name: /Gemaild, nabellen/ })).toBeVisible();
    // Alfa (nog geen mail) staat boven Beta (gemaild); alleen Beta krijgt de herinneringsknop.
    const rijen = tabel.getByRole('row');
    const namen = await rijen.getByRole('link', { name: /E2E Bouw/ }).allTextContents();
    expect(namen).toEqual(['E2E Bouw Alfa', 'E2E Bouw Beta']);
    await expect(tabel.getByRole('button', { name: 'Herinnering sturen' })).toHaveCount(1);
    await expect(rijen.filter({ hasText: 'E2E Bouw Beta' }).getByRole('button', { name: 'Herinnering sturen' })).toBeVisible();
    await tabel.getByRole('button', { name: 'Herinnering sturen' }).click();
    const popup = page.getByRole('dialog', { name: /Opvolgmail/ });
    await expect(popup).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Korte herinnering' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
  });
});
