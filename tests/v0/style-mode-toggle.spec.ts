import { test, expect } from '@playwright/test';

const STORAGE_KEY = 'chatmanta-style';

test.describe('V0 style mode toggle (Classic/Refined)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate((k) => window.localStorage.removeItem(k), STORAGE_KEY);
  });

  test('default = classic, geen localStorage', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-style', 'classic');
  });

  test('Settings-radio wisselt data-style en persisteert over reload', async ({ page }) => {
    await page.goto('/');

    // Open Instellingen-tab in het right-panel.
    await page.getByRole('tab', { name: 'Instellingen' }).click();

    const radiogroup = page.getByRole('radiogroup', { name: /opmaak/i });
    await expect(radiogroup).toBeVisible();

    const refined = radiogroup.getByRole('radio', { name: /refined/i });
    await refined.click();

    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-style', 'refined');

    // Persistence over reload
    await page.reload();
    await expect(html).toHaveAttribute('data-style', 'refined');

    // Terug naar Klassiek
    await page.getByRole('tab', { name: 'Instellingen' }).click();
    await page.getByRole('radio', { name: /klassiek/i }).click();
    await expect(html).toHaveAttribute('data-style', 'classic');
  });

  test('no FOUC — initial paint matches stored choice', async ({ page }) => {
    // Set refined eerst
    await page.goto('/');
    await page.evaluate(() => window.localStorage.setItem('chatmanta-style', 'refined'));

    // Hard-reload met cache-bust; data-style moet 'refined' zijn vóór React hydrateert.
    await page.goto('/?cb=' + Date.now());
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-style', 'refined');
  });

  test('corrupte localStorage valt terug op classic', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.localStorage.setItem('chatmanta-style', 'garbage'));
    await page.goto('/?cb=' + Date.now());
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-style', 'classic');
  });

  test('AI message body krijgt msg-ai-bubble class', async ({ page }) => {
    await page.goto('/');
    // Trigger een AI-respons zodat AssistantMessage rendert.
    // Home toont geen seeded conversation, dus we sturen eerst een vraag via de composer.
    await page.fill('.composer textarea', 'test');
    await page.press('.composer textarea', 'Enter');
    await page.waitForSelector('.msg-assistant', { timeout: 30_000 });

    const aiBody = page.locator('.msg-assistant .msg-body').first();
    await expect(aiBody).toBeVisible();
    await expect(aiBody).toHaveClass(/msg-ai-bubble/);
  });

  test('dark + refined heeft Bioluminescent Abyss base-bg #02050d', async ({ page }) => {
    await page.goto('/');
    // Zet dark + refined
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-style', 'refined');
      window.localStorage.setItem('chatmanta-style', 'refined');
    });
    // Read computed --bg-base via CSS var op html
    const bgBase = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim()
    );
    expect(bgBase).toBe('#02050d');
  });

  test('light + refined heeft Reef Pop base-bg #a7f3d0', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-style', 'refined');
      window.localStorage.setItem('chatmanta-style', 'refined');
    });
    const bgBase = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim()
    );
    expect(bgBase).toBe('#a7f3d0');
  });

  test('refined body bg gebruikt radial-gradient blobs + fixed attachment', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-style', 'refined');
    });
    const bg = await page.evaluate(() => {
      const s = getComputedStyle(document.body);
      return { image: s.backgroundImage, attachment: s.backgroundAttachment };
    });
    expect(bg.image).toContain('radial-gradient');
    // Multi-layer background → browser returns 'fixed, fixed, fixed, ...' (één keyword per layer).
    // Classic body heeft géén background-attachment, dus die zou 'scroll' teruggeven → toContain discrimineert.
    expect(bg.attachment).toContain('fixed');
  });

  test('refined: topbar/sidebar/composer hebben frosted glass', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.documentElement.setAttribute('data-style', 'refined'));
    for (const sel of ['.topbar', '.sidebar', '.composer']) {
      const bf = await page.evaluate((s) => {
        const el = document.querySelector(s);
        return el ? getComputedStyle(el).backdropFilter : '';
      }, sel);
      expect(bf, `${sel} backdrop-filter`).toContain('blur');
    }
  });
});
