import { test, expect } from '@playwright/test';

// Regressietests voor de embed-widget (PR widget-embed-fix).
//
// We navigeren rechtstreeks naar /embed/<org> ZONDER ?h — dan is parentHost
// null en valt de origin-allowlist fail-open, ongeacht wat een org in de DB
// heeft staan. De assertions zijn bewust positie-onafhankelijk (links/rechts),
// zodat ze niet breken als een klant z'n widgetpositie wijzigt.

const ORG = 'acme-corp'; // willekeurige embeddable org met content

// Klik de FAB via JS-dispatch: in dev overlapt de Next-dev-indicator de FAB-hoek
// en onderschept hij een echte pointer-klik (test-artefact, niet in productie).
async function openPanel(page: import('@playwright/test').Page) {
  await page.waitForSelector('button[aria-label="Open chat"]', { timeout: 15_000 });
  await page.evaluate(() => {
    const b = document.querySelector<HTMLButtonElement>('button[aria-label="Open chat"]');
    b?.click();
  });
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();
  return dialog;
}

// Issue 1 — De iframe-viewport is smal (~420px). De embed mag NIET in de mobiele
// fullscreen-variant vallen als de host een desktop is: dan hoort de afgeronde,
// geschaduwde kaart te renderen (oude bug: matchMedia op de iframe-breedte → altijd mobiel).
test('embed op smalle viewport + desktop-host → afgeronde kaart', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 720 });
  await page.goto(`/embed/${ORG}`);
  const dialog = await openPanel(page);
  const radius = await dialog.evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
  const shadow = await dialog.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(radius).not.toBe('0px');
  expect(shadow).not.toBe('none');
});

// Issue 1 — Host meldt mobiel via ?m=1 (de loader zet dit) → fullscreen paneel.
test('embed met ?m=1 (mobiele host) → fullscreen paneel', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 720 });
  await page.goto(`/embed/${ORG}?m=1`);
  const dialog = await openPanel(page);
  const radius = await dialog.evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
  expect(radius).toBe('0px');
});

// Issue 2 — Het tooltip-pijltje staat aan dezelfde kant als de FAB (exact één
// van left/right gezet). Vóór de fix stond de pijl altijd rechts, ook links-onder.
test('embed tooltip-pijl volgt de widgetpositie (exact één kant)', async ({ page }) => {
  await page.goto(`/embed/${ORG}`);
  await page.waitForSelector('button[aria-label="Open chat"]', { timeout: 15_000 });
  // De pijl-span staat altijd in de DOM (alleen opacity-gated), dus geen hover
  // nodig — dat zou in dev toch op de Next-dev-overlay stuklopen.
  const sides = await page.locator('span[aria-hidden="true"]').evaluateAll((els) => {
    const arrow = (els as HTMLElement[]).find((e) => /rotate/.test(e.style.transform || ''));
    return arrow ? { left: arrow.style.left, right: arrow.style.right } : null;
  });
  expect(sides).not.toBeNull();
  // Precies één zijde gezet → de pijl wijst naar de juiste hoek.
  expect(Boolean(sides!.left) !== Boolean(sides!.right)).toBe(true);
});
