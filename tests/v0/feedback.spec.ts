import { test, expect } from '@playwright/test';

// E2E voor het feedbacksysteem (migratie 0043): klant dient een melding in →
// bedank-paneel; operator ziet hem in het Admin Dashboard → opent detail →
// wijzigt status → historie + status-pill verversen. Auth via storageState
// (global-setup). Schrijft een test-rij in de dev-org (sandbox) van de gedeelde
// Supabase — acceptabel V0-gedrag.

// 1x1 transparante PNG om het bijlage-/upload-pad te raken zonder een echt
// bestand op schijf nodig te hebben.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test('klant dient feedback in en operator wijzigt de status', async ({ page }) => {
  const token = `E2E-${Date.now()}`;
  const description = `${token} — testmelding: de chatbot gaf een verkeerd antwoord op de openingstijden.`;

  // ── Klant: melding indienen ──────────────────────────────────────────────
  await page.goto('/klantendashboard/feedback');
  await expect(page.getByRole('heading', { name: /Feedback/i })).toBeVisible();

  await page.selectOption('select[name="type"]', 'bug');
  await page.check('input[name="urgency"][value="high"]');
  await page.fill('textarea[name="description"]', description);
  await page.setInputFiles('input[name="attachment"]', {
    name: 'screenshot.png',
    mimeType: 'image/png',
    buffer: PNG_1x1,
  });
  await page.check('input[name="privacy"]');

  const submit = page.getByRole('button', { name: 'Feedback versturen' });
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page.getByText('Bedankt voor je melding.')).toBeVisible({ timeout: 15_000 });

  // ── Operator: melding terugvinden in de inbox ────────────────────────────
  await page.goto('/admindashboard/feedback');
  const row = page.locator('a', { hasText: token }).first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();

  // Detailpagina: status wijzigen naar "In behandeling". Ruime timeout: de zwaardere
  // [id]-route compileert bij de eerste hit onder Turbopack (cold dev-server).
  await expect(page.getByText('Melding ingediend')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'In behandeling' }).click();

  // Na refresh: historie toont de statuswijziging en de status-pill volgt.
  await expect(page.getByText(/Status:.*In behandeling/)).toBeVisible({ timeout: 10_000 });

  // ── Fase 2: Copy-for-Claude (alleen type=bug), prioriteit + notitie ─────────
  await expect(page.getByRole('button', { name: 'Kopieer voor Claude Code' })).toBeVisible();

  // Prioriteit "Hoog" zetten → komt in de historie als internal_note.
  await page.getByRole('button', { name: 'Hoog' }).click();
  await expect(page.getByText(/Prioriteit:.*Hoog/)).toBeVisible({ timeout: 10_000 });

  // Interne notitie toevoegen → verschijnt in de historie.
  const noteText = `${token}-notitie repro-stap`;
  await page.getByPlaceholder('Schrijf een notitie of reactie…').fill(noteText);
  await page.getByRole('button', { name: 'Toevoegen' }).click();
  await expect(page.getByText(noteText)).toBeVisible({ timeout: 10_000 });

  // ── Fase 2: zoeken in de inbox ──────────────────────────────────────────────
  await page.goto('/admindashboard/feedback');
  await page.fill('input[name="q"]', token);
  await page.getByRole('button', { name: 'Zoek' }).click();
  await expect(page.locator('a', { hasText: token }).first()).toBeVisible({ timeout: 10_000 });
});
