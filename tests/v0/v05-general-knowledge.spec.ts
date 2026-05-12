import { test, expect } from '@playwright/test';

// V0.5 smoke: GENERAL en OFF_TOPIC paden tonen het juiste gedrag in de UI.
//
// LET OP: deze tests vereisen echte OpenAI-API + Supabase. Run lokaal met
// `npm run test:e2e -- v05-general-knowledge` na `npm run dev` te hebben
// gestart in een aparte terminal. CI overslaan totdat we mock-OpenAI hebben
// (v0.6+).

const V05_URL = '/?v=v0.5';

test.describe('V0.5 — general-knowledge router', () => {
  test('GENERAL: "Wat zijn MKB-bedrijven?" geeft disclaimer-antwoord, geen FALLBACK_MESSAGE', async ({
    page,
  }) => {
    await page.goto(V05_URL);

    // Zorg dat we op v0.5 zitten — bot-dropdown moet het laten zien.
    await expect(page.locator('body')).toContainText(/v0\.5/);

    // Stel de vraag via de composer.
    const composer = page.getByRole('textbox', { name: /stel een vraag|composer|bericht/i }).first();
    await composer.fill('Wat zijn MKB-bedrijven?');
    await composer.press('Enter');

    // Wacht tot het answer-done event de UI heeft bijgewerkt (60s SLA — v0.5
    // doet 1 reclassify + 1 answer-call ~3-5s).
    const assistant = page.locator('.msg-assistant').last();
    await expect(assistant).toBeVisible({ timeout: 60_000 });

    // Het antwoord moet de verplichte disclaimer-zin bevatten.
    await expect(assistant).toContainText(/Even kort.*buiten onze specifieke documentatie.*algemeen/i, {
      timeout: 60_000,
    });

    // Het antwoord mag NIET de FALLBACK_MESSAGE bevatten — dat zou betekenen
    // dat het GENERAL-pad niet getriggerd is.
    await expect(assistant).not.toContainText(/Daar heb ik geen informatie over/i);

    // Eindigt op de uitnodiging.
    await expect(assistant).toContainText(/Wil je weten hoe ChatManta hier specifiek mee omgaat/i);
  });

  test('OFF_TOPIC: "Schrijf een gedicht over zalmen" geeft polite refusal — geen gedicht', async ({
    page,
  }) => {
    await page.goto(V05_URL);
    await expect(page.locator('body')).toContainText(/v0\.5/);

    const composer = page.getByRole('textbox', { name: /stel een vraag|composer|bericht/i }).first();
    await composer.fill('Schrijf een gedicht over zalmen');
    await composer.press('Enter');

    const assistant = page.locator('.msg-assistant').last();
    await expect(assistant).toBeVisible({ timeout: 60_000 });

    // Polite refusal-tekst (vaste string uit handleOffTopic in rag.ts).
    await expect(assistant).toContainText(
      /Ik help met vragen rondom ChatManta.*MKB.*chatbots.*klantcontact/i,
      { timeout: 60_000 },
    );

    // Gién verzonnen gedicht — "zalm" moet niet als poëtische tekst in het
    // antwoord verschijnen.
    const text = (await assistant.innerText()).toLowerCase();
    expect(text).not.toMatch(/in een rivier|zwemmen|schubben|stroomopwaarts/);
  });
});
