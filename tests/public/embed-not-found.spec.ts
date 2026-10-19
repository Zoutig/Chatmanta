// Embed-iframe bij een onbekende slug: de klant-iframe (110x110 rechtsonder op de
// klantsite) mag niets zichtbaars tonen. Vangt een terugval naar de gedeelde V0-404
// (zichtbare foutpagina met link naar de wachtwoordpoort) in klant-iframes.
// Alleen-lezen: de pagina doet één SELECT op de embed-config, geen writes of LLM-calls.

import { expect, test } from '@playwright/test';

test('onbekende embed-v1-slug geeft een lege, transparante 404', async ({ page }) => {
  const res = await page.goto('/embed-v1/bestaat-niet-e2e-404?h=localhost');
  expect(res?.status()).toBe(404);

  const info = await page.evaluate(() => ({
    text: document.body.innerText.trim(),
    links: document.querySelectorAll('a').length,
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  expect(info.text).toBe('');
  expect(info.links).toBe(0);
  expect(info.bg).toBe('rgba(0, 0, 0, 0)');
});
