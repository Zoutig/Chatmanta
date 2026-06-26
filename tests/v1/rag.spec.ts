import { test, expect } from '@playwright/test';

// V1 RAG-pad e2e (PR-1b). Draait onder het 'v1'-project (self-login, geen
// storageState). member@example.com is lid van seed-org (V1_SEED_ORG_ID), die in
// v1:seed:chunks een chatbot + Manta-demo-chunks kreeg. Niet-lid + redirect-paden
// zijn al gedekt in tests/v1/auth.spec.ts.
// Doet een ECHTE (billable) OpenAI-call (embed + retrieval + chat).

const MEMBER_EMAIL = 'member@example.com';
const MEMBER_PW = process.env.V1_SEED_MEMBER_PW;

test.describe('V1 RAG-pad', () => {
  test.skip(!MEMBER_PW, 'V1_SEED_MEMBER_PW ontbreekt');

  test('lid stelt vraag en krijgt gegrond antwoord uit eigen chunks', async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto('/v1/login');
    await page.fill('input[name="email"]', MEMBER_EMAIL);
    await page.fill('input[name="password"]', MEMBER_PW as string);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/v1\/app/);

    await page.fill('input[name="question"]', 'Wat zijn de openingstijden op zaterdag?');
    await page.click('button:has-text("Vraag")');

    const answer = page.getByTestId('v1-answer');
    await expect(answer).toBeVisible({ timeout: 80_000 });
    // Gegrond uit de Manta-seed: zaterdag 08:00–16:00.
    await expect(answer).toContainText(/16[:.]?00|16 uur|zaterdag/i, { timeout: 80_000 });
  });
});
