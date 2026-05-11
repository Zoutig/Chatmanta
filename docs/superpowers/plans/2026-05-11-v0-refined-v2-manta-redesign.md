# Refined v2 "Manta" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vervang Refined v1 (token-tuning) door v2 "Manta" — een aparte visuele identiteit met cinematic glass surfaces, gradient-glow blobs als bg, pill-knoppen en gradient AI-avatar, in Bioluminescent Abyss (dark) en Reef Pop (light) palet.

**Architecture:** Pure CSS-extensie van het bestaande `html[data-style="refined"]`-patroon in `app/globals.css`. Eén minimale component-wijziging (`msg-ai-bubble`-class op `.msg-body` in `AssistantMessage`). Geen hook-wijzigingen, geen toggle-UI-wijzigingen, geen nieuwe deps.

**Tech Stack:** Next.js 16 App Router, Tailwind v4, CSS custom properties, Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-05-11-v0-refined-v2-manta-redesign.md`

**Reference:** v1 spec `docs/superpowers/specs/2026-05-11-v0-abyss-refined-style-toggle-design.md` (superseded by visuals only — toggle/hook/storage blijven).

---

## Files

- **Modify**: `app/globals.css` (lines 71–167 worden weggegooid en herschreven; nieuwe regels onder `html[data-style="refined"]`).
- **Modify**: `app/components/messages.tsx:428` (add `msg-ai-bubble` class to `.msg-body` in `AssistantMessage`).
- **Modify**: `tests/v0/style-mode-toggle.spec.ts` (uitbreiden met v2-asserts).
- **Create**: niets.
- **Delete**: niets.

---

## Pre-flight

- [ ] **Verify clean state**

Run:
```
git status
git rev-parse --abbrev-ref HEAD
```
Expected: `On branch feat/seb/abyss-refined-toggle`, working tree clean.

- [ ] **Start dev server (background) for visual checks**

Run in background:
```
npm run dev
```
Note URL (port 3001 or whatever Next assigns). Used for manual smoke tests in Task 8.

---

## Task 1: Add `msg-ai-bubble` wrapper class

**Why first:** Het is de enige niet-CSS wijziging. Klein, geïsoleerd, geeft de CSS-targeting voor latere taken.

**Files:**
- Modify: `app/components/messages.tsx:428`
- Modify: `tests/v0/style-mode-toggle.spec.ts`

- [ ] **Step 1.1: Write the failing test**

In `tests/v0/style-mode-toggle.spec.ts`, voeg toe na de bestaande tests (vóór `});` op regel 60):

```typescript
  test('AI message body krijgt msg-ai-bubble class', async ({ page }) => {
    await page.goto('/');
    // Trigger een AI-respons zodat AssistantMessage rendert.
    // Aanname: home-pagina toont een seeded conversation óf composer-input werkt direct.
    // Als geen AI-message zichtbaar is, faalt deze test — pas seed/setup aan.
    const aiBody = page.locator('.msg-assistant .msg-body').first();
    await expect(aiBody).toBeVisible();
    await expect(aiBody).toHaveClass(/msg-ai-bubble/);
  });
```

- [ ] **Step 1.2: Run test to verify it fails**

Run:
```
npm run test:e2e -- tests/v0/style-mode-toggle.spec.ts -g "msg-ai-bubble"
```
Expected: FAIL — "Expected element to have class msg-ai-bubble".

> Als de test niet faalt op de class-assertie maar op "element not found" (geen AI-bericht zichtbaar op `/`), check of de pagina een seeded conversation toont. Zo niet: pas de test aan om eerst een vraag te sturen via de composer (`await page.fill('.composer textarea', 'test'); await page.press('.composer textarea', 'Enter'); await page.waitForSelector('.msg-assistant');`).

- [ ] **Step 1.3: Add the class to the component**

In `app/components/messages.tsx`, regel 428, wijzig:
```jsx
<div className="msg-body">
```
naar:
```jsx
<div className="msg-body msg-ai-bubble">
```

- [ ] **Step 1.4: Run test to verify it passes**

Run:
```
npm run test:e2e -- tests/v0/style-mode-toggle.spec.ts -g "msg-ai-bubble"
```
Expected: PASS.

- [ ] **Step 1.5: Commit**

```
git add app/components/messages.tsx tests/v0/style-mode-toggle.spec.ts
git commit -m "feat(v0): msg-ai-bubble wrapper class voor Refined v2 styling"
```

---

## Task 2: Wipe v1 CSS + add v2 dark token block

**Why:** v1 tokens + component rules moeten weg vóór we v2 erin zetten — anders krijg je cascadering-conflicten. Daarna direct dark-tokens om foundation te leggen.

**Files:**
- Modify: `app/globals.css` (lines 71–167 verwijderen)
- Modify: `tests/v0/style-mode-toggle.spec.ts` (nieuwe assertion)

- [ ] **Step 2.1: Write the failing test**

Voeg toe aan `tests/v0/style-mode-toggle.spec.ts` vóór `});` op regel 60:

```typescript
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
```

- [ ] **Step 2.2: Run test to verify it fails**

```
npm run test:e2e -- tests/v0/style-mode-toggle.spec.ts -g "Bioluminescent Abyss"
```
Expected: FAIL — `--bg-base` is leeg of mismatch.

- [ ] **Step 2.3: Verwijder v1 Refined CSS-block**

In `app/globals.css`, verwijder ALLES tussen regel 71 t/m 167 (inclusief de comment-headers `/* ============== Style mode: REFINED ===== */` en alle `html[data-style="refined"]` regels uit v1). Resultaat: na regel 70 (sluithaakje van `:root[light]`) volgt direct `@theme inline {` (was regel 169).

> Sanity-check na verwijdering: `grep -n "data-style" app/globals.css` mag alleen nog matches geven uit v2 die je hierna toevoegt. Voor nu: 0 matches.

- [ ] **Step 2.4: Voeg v2 dark token block toe**

Plak op de positie waar v1 stond (na de huidige `:root[light]`-sluithaakje, vóór `@theme inline`):

```css
/* ==========================================================================
   Style mode: REFINED v2 "Manta" — opt-in via Settings-tab.
   Aparte visuele identiteit: cinematic glass + ocean palette.
   Dark = Bioluminescent Abyss, Light = Reef Pop.
   Zie docs/superpowers/specs/2026-05-11-v0-refined-v2-manta-redesign.md
   ========================================================================== */

/* Refined + dark — Bioluminescent Abyss tokens. */
html.dark[data-style="refined"] {
  --bg-base: #02050d;
  --glow-1-color: rgba(8, 145, 178, 0.55);
  --glow-2-color: rgba(244, 114, 182, 0.32);
  --glow-3-color: rgba(34, 211, 238, 0.30);
  --bg: var(--bg-base);
  --fg: #e8f4ff;
  --fg-muted: rgba(180, 220, 255, 0.55);
  --fg-faint: rgba(180, 220, 255, 0.35);
  --accent: #5fe1f0;
  --accent-2: #f0abfc;
  --accent-glow: rgba(95, 225, 240, 0.30);
  --accent-soft: rgba(95, 225, 240, 0.14);
  --glass-tint: rgba(180, 220, 255, 0.06);
  --glass-tint-2: rgba(255, 255, 255, 0.12);
  --glass-blur: blur(40px) saturate(1.6);
  --glass-border: rgba(180, 220, 255, 0.16);
  --shadow-soft: 0 8px 32px rgba(0, 0, 0, 0.35);
  --r-bubble: 18px;
  --r-anchor: 4px;
  --r-pill: 999px;
}
```

- [ ] **Step 2.5: Run test to verify it passes**

```
npm run test:e2e -- tests/v0/style-mode-toggle.spec.ts -g "Bioluminescent Abyss"
```
Expected: PASS.

- [ ] **Step 2.6: Commit**

```
git add app/globals.css tests/v0/style-mode-toggle.spec.ts
git commit -m "feat(v0): vervang Refined v1 CSS door v2 dark tokens (Bioluminescent Abyss)"
```

---

## Task 3: Add v2 light token block (Reef Pop)

**Files:**
- Modify: `app/globals.css`
- Modify: `tests/v0/style-mode-toggle.spec.ts`

- [ ] **Step 3.1: Write the failing test**

Voeg toe vóór `});`:

```typescript
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
```

- [ ] **Step 3.2: Run test to verify it fails**

```
npm run test:e2e -- tests/v0/style-mode-toggle.spec.ts -g "Reef Pop"
```
Expected: FAIL — `--bg-base` is undefined or different value.

- [ ] **Step 3.3: Voeg v2 light token block toe**

Direct ná het dark token block uit Task 2.4, plak:

```css
/* Refined + light — Reef Pop tokens (vibrant aqua/teal met frosted glass). */
html:not(.dark)[data-style="refined"] {
  --bg-base: #a7f3d0;
  --glow-1-color: rgba(34, 211, 238, 0.85);
  --glow-2-color: rgba(20, 184, 166, 0.80);
  --glow-3-color: rgba(95, 225, 240, 0.70);
  --glow-4-color: rgba(167, 243, 208, 0.45);
  --bg: var(--bg-base);
  --fg: #042f2e;
  --fg-muted: rgba(4, 47, 46, 0.55);
  --fg-faint: rgba(4, 47, 46, 0.35);
  --accent: #0e7c9a;
  --accent-2: #0f766e;
  --accent-glow: rgba(14, 124, 154, 0.30);
  --accent-soft: rgba(14, 124, 154, 0.10);
  --glass-tint: rgba(255, 255, 255, 0.30);
  --glass-tint-2: rgba(255, 255, 255, 0.55);
  --glass-blur: blur(24px) saturate(1.4);
  --glass-blur-strong: blur(28px) saturate(1.4);
  --glass-border: rgba(255, 255, 255, 0.55);
  --shadow-soft: 0 8px 28px rgba(8, 90, 90, 0.18);
  --r-bubble: 18px;
  --r-anchor: 4px;
  --r-pill: 999px;
}
```

- [ ] **Step 3.4: Run test to verify it passes**

```
npm run test:e2e -- tests/v0/style-mode-toggle.spec.ts -g "Reef Pop"
```
Expected: PASS.

- [ ] **Step 3.5: Commit**

```
git add app/globals.css tests/v0/style-mode-toggle.spec.ts
git commit -m "feat(v0): Refined v2 light tokens (Reef Pop)"
```

---

## Task 4: Body gradient-blob background

**Why:** De gradient-blobs zijn de DNA van het cinematic-glass-effect. Eerst de bg vóór we glass-surfaces erop leggen, anders zie je het glas niet werken.

**Files:**
- Modify: `app/globals.css`
- Modify: `tests/v0/style-mode-toggle.spec.ts`

- [ ] **Step 4.1: Write the failing test**

```typescript
  test('refined body bg gebruikt radial-gradient blobs', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-style', 'refined');
    });
    const bgImage = await page.evaluate(() => getComputedStyle(document.body).backgroundImage);
    expect(bgImage).toContain('radial-gradient');
  });
```

- [ ] **Step 4.2: Run test to verify it fails**

```
npm run test:e2e -- tests/v0/style-mode-toggle.spec.ts -g "radial-gradient blobs"
```
Expected: FAIL — backgroundImage is `none` or a solid color.

- [ ] **Step 4.3: Voeg body bg-regels toe**

Direct ná het light token block (Task 3.3), plak:

```css
/* Refined v2 — body gradient-blob background (dark). */
html.dark[data-style="refined"] body {
  background:
    radial-gradient(circle 600px at 12% 22%, var(--glow-1-color), transparent 65%),
    radial-gradient(circle 500px at 92% 80%, var(--glow-2-color), transparent 65%),
    radial-gradient(circle 700px at 65% 0%, var(--glow-3-color), transparent 65%),
    var(--bg-base);
  background-attachment: fixed;
}

/* Refined v2 — body gradient-blob background (light). */
html:not(.dark)[data-style="refined"] body {
  background:
    radial-gradient(circle 600px at 12% 22%, var(--glow-1-color), transparent 65%),
    radial-gradient(circle 500px at 92% 80%, var(--glow-2-color), transparent 65%),
    radial-gradient(circle 700px at 65% 0%, var(--glow-3-color), transparent 65%),
    radial-gradient(circle 380px at 50% 50%, var(--glow-4-color), transparent 70%),
    var(--bg-base);
  background-attachment: fixed;
}
```

- [ ] **Step 4.4: Run test to verify it passes**

```
npm run test:e2e -- tests/v0/style-mode-toggle.spec.ts -g "radial-gradient blobs"
```
Expected: PASS.

- [ ] **Step 4.5: Commit**

```
git add app/globals.css tests/v0/style-mode-toggle.spec.ts
git commit -m "feat(v0): Refined v2 body gradient-blob bg (dark + light)"
```

---

## Task 5: Glass treatment op topbar + sidebar + composer

**Files:**
- Modify: `app/globals.css`
- Modify: `tests/v0/style-mode-toggle.spec.ts`

- [ ] **Step 5.1: Write the failing test**

```typescript
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
```

- [ ] **Step 5.2: Run test to verify it fails**

```
npm run test:e2e -- tests/v0/style-mode-toggle.spec.ts -g "frosted glass"
```
Expected: FAIL — backdrop-filter is `none` op tenminste één van de surfaces.

- [ ] **Step 5.3: Voeg glass-surface regels toe**

Direct ná de body-bg regels uit Task 4.3, plak:

```css
/* Refined v2 — topbar als frosted glass panel. */
html[data-style="refined"] .topbar {
  background: var(--glass-tint-2);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-bottom: 1px solid var(--glass-border);
}

/* Refined v2 — sidebar als frosted glass panel. */
html[data-style="refined"] .sidebar {
  background: var(--glass-tint-2);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-right: 1px solid var(--glass-border);
}

/* Refined v2 — composer als frosted glass panel. */
html[data-style="refined"] .composer {
  background: var(--glass-tint-2);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
}
html[data-style="refined"] .composer:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
```

- [ ] **Step 5.4: Run test to verify it passes**

```
npm run test:e2e -- tests/v0/style-mode-toggle.spec.ts -g "frosted glass"
```
Expected: PASS.

- [ ] **Step 5.5: Commit**

```
git add app/globals.css tests/v0/style-mode-toggle.spec.ts
git commit -m "feat(v0): Refined v2 frosted glass op topbar/sidebar/composer"
```

---

## Task 6: Glass treatment op bubbles + asymmetric border-radius

**Files:**
- Modify: `app/globals.css`
- Modify: `tests/v0/style-mode-toggle.spec.ts`

- [ ] **Step 6.1: Write the failing test**

```typescript
  test('refined: user + AI bubbles hebben frosted glass + asymmetric radius', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.documentElement.setAttribute('data-style', 'refined'));
    const userBf = await page.evaluate(() => {
      const el = document.querySelector('.msg-user-bubble');
      return el ? getComputedStyle(el).backdropFilter : '';
    });
    expect(userBf).toContain('blur');
    const aiBf = await page.evaluate(() => {
      const el = document.querySelector('.msg-ai-bubble');
      return el ? getComputedStyle(el).backdropFilter : '';
    });
    expect(aiBf).toContain('blur');
  });
```

- [ ] **Step 6.2: Run test to verify it fails**

```
npm run test:e2e -- tests/v0/style-mode-toggle.spec.ts -g "bubbles hebben frosted glass"
```
Expected: FAIL.

- [ ] **Step 6.3: Voeg bubble glass-regels toe**

Direct ná Task 5.3, plak:

```css
/* Refined v2 — user message bubble als frosted glass. */
html[data-style="refined"] .msg-user-bubble {
  background: var(--glass-tint-2);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  color: var(--fg);
  border-radius: var(--r-bubble) var(--r-bubble) var(--r-anchor) var(--r-bubble);
  box-shadow: var(--shadow-soft);
  padding: 10px 14px;
}

/* Refined v2 — AI message bubble als zachtere frosted glass. */
html[data-style="refined"] .msg-ai-bubble {
  background: var(--glass-tint);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  color: var(--fg);
  border-radius: var(--r-bubble) var(--r-bubble) var(--r-bubble) var(--r-anchor);
  box-shadow: var(--shadow-soft);
  padding: 12px 16px;
}

/* Refined v2 — wat meer ademruimte tussen turns. */
html[data-style="refined"] .conversation-inner { gap: 48px; }
```

- [ ] **Step 6.4: Run test to verify it passes**

```
npm run test:e2e -- tests/v0/style-mode-toggle.spec.ts -g "bubbles hebben frosted glass"
```
Expected: PASS.

- [ ] **Step 6.5: Commit**

```
git add app/globals.css tests/v0/style-mode-toggle.spec.ts
git commit -m "feat(v0): Refined v2 bubble glass + asymmetric radius"
```

---

## Task 7: AI avatar gradient + brand-mark glow

**Files:**
- Modify: `app/globals.css`
- Modify: `tests/v0/style-mode-toggle.spec.ts`

- [ ] **Step 7.1: Write the failing test**

```typescript
  test('refined: AI avatar krijgt radial gradient + glow', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.documentElement.setAttribute('data-style', 'refined'));
    const av = await page.evaluate(() => {
      const el = document.querySelector('.msg-avatar');
      return el
        ? { bg: getComputedStyle(el).backgroundImage, shadow: getComputedStyle(el).boxShadow }
        : null;
    });
    expect(av?.bg).toContain('radial-gradient');
    expect(av?.shadow).not.toBe('none');
  });
```

- [ ] **Step 7.2: Run test to verify it fails**

```
npm run test:e2e -- tests/v0/style-mode-toggle.spec.ts -g "AI avatar"
```
Expected: FAIL.

- [ ] **Step 7.3: Voeg avatar + brand-mark regels toe**

Direct ná Task 6.3, plak:

```css
/* Refined v2 — AI avatar als gradient orb met glow (dark). */
html.dark[data-style="refined"] .msg-avatar {
  background: radial-gradient(circle at 30% 30%, #f0abfc 0%, #5fe1f0 50%, #0c4a6e 100%);
  box-shadow: 0 0 14px rgba(244, 114, 182, 0.45);
  border-radius: 50%;
  filter: none;
}

/* Refined v2 — AI avatar als gradient orb met glow (light). */
html:not(.dark)[data-style="refined"] .msg-avatar {
  background: radial-gradient(circle at 30% 30%, #5fe1f0 0%, #0e7c9a 60%, #042f2e 100%);
  box-shadow: 0 0 14px rgba(14, 124, 154, 0.40);
  border-radius: 50%;
  filter: none;
}

/* Refined v2 — brand-mark: subtle bioluminescent glow in dark. */
html.dark[data-style="refined"] .brand-mark {
  filter: drop-shadow(0 0 12px rgba(244, 114, 182, 0.40));
}

/* Refined v2 — brand-mark: frosted tile in light. */
html:not(.dark)[data-style="refined"] .brand-mark {
  background: var(--glass-tint-2);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  padding: 2px 4px;
  filter: none;
}
```

> Note: De `<Image src="/logo/mark.png">` blijft ongewijzigd; deze CSS-regels styled alleen de wrapper-div `.brand-mark`. Het logo-bestand zelf wordt nooit aangeraakt.

- [ ] **Step 7.4: Run test to verify it passes**

```
npm run test:e2e -- tests/v0/style-mode-toggle.spec.ts -g "AI avatar"
```
Expected: PASS.

- [ ] **Step 7.5: Commit**

```
git add app/globals.css tests/v0/style-mode-toggle.spec.ts
git commit -m "feat(v0): Refined v2 AI avatar gradient + brand-mark glow"
```

---

## Task 8: Knoppen — primary (pill) + ghost

**Files:**
- Modify: `app/globals.css`
- Modify: `tests/v0/style-mode-toggle.spec.ts`

**Approach:** V0 heeft geen design-system button-class. We targetten de bestaande button-classes (`.btn-new`, `.composer-send`, `.msg-action`, `.followup-chip`) individueel met v2-styling. Geen component-refactor.

- [ ] **Step 8.1: Write the failing test**

```typescript
  test('refined: primary actie-knoppen zijn pill-shaped', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.documentElement.setAttribute('data-style', 'refined'));
    const br = await page.evaluate(() => {
      const el = document.querySelector('.btn-new');
      return el ? getComputedStyle(el).borderRadius : '';
    });
    // 999px wordt door browser teruggegeven als grote pixel-waarde (bv. "999px")
    expect(br).toMatch(/^9?\d{2,}px$|^999px$/);
  });
```

- [ ] **Step 8.2: Run test to verify it fails**

```
npm run test:e2e -- tests/v0/style-mode-toggle.spec.ts -g "pill-shaped"
```
Expected: FAIL.

- [ ] **Step 8.3: Voeg knop-regels toe**

Direct ná Task 7.3, plak:

```css
/* Refined v2 — primary button (dark): witte frosted pill. */
html.dark[data-style="refined"] .btn-new,
html.dark[data-style="refined"] .composer-send {
  background: rgba(255, 255, 255, 0.18);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid rgba(180, 220, 255, 0.28);
  color: #ffffff;
  border-radius: var(--r-pill);
  box-shadow: none;
  transition: transform 180ms cubic-bezier(0.4, 0, 0.2, 1),
              filter 180ms cubic-bezier(0.4, 0, 0.2, 1);
}
html.dark[data-style="refined"] .btn-new:hover,
html.dark[data-style="refined"] .composer-send:hover {
  filter: brightness(1.08);
  transform: translateY(-1px);
}

/* Refined v2 — primary button (light): teal gradient pill. */
html:not(.dark)[data-style="refined"] .btn-new,
html:not(.dark)[data-style="refined"] .composer-send {
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border: none;
  color: #ffffff;
  border-radius: var(--r-pill);
  box-shadow: 0 4px 16px var(--accent-glow);
  transition: transform 180ms cubic-bezier(0.4, 0, 0.2, 1),
              filter 180ms cubic-bezier(0.4, 0, 0.2, 1);
}
html:not(.dark)[data-style="refined"] .btn-new:hover,
html:not(.dark)[data-style="refined"] .composer-send:hover {
  filter: brightness(1.06);
  transform: translateY(-1px);
}

/* Refined v2 — ghost-style action chips (msg-action, followup-chip). */
html[data-style="refined"] .msg-action,
html[data-style="refined"] .followup-chip {
  background: transparent;
  border: 1px solid var(--glass-border);
  color: var(--accent);
  border-radius: var(--r-pill);
  transition: background 180ms cubic-bezier(0.4, 0, 0.2, 1),
              border-color 180ms cubic-bezier(0.4, 0, 0.2, 1);
}
html[data-style="refined"] .msg-action:hover,
html[data-style="refined"] .followup-chip:hover {
  background: var(--accent-soft);
  border-color: var(--accent);
}
```

- [ ] **Step 8.4: Run test to verify it passes**

```
npm run test:e2e -- tests/v0/style-mode-toggle.spec.ts -g "pill-shaped"
```
Expected: PASS.

- [ ] **Step 8.5: Commit**

```
git add app/globals.css tests/v0/style-mode-toggle.spec.ts
git commit -m "feat(v0): Refined v2 pill-knoppen (primary + ghost)"
```

---

## Task 9: Motion + a11y fallbacks

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 9.1: Voeg motion + a11y regels toe**

Direct ná Task 8.3, plak:

```css
/* Refined v2 — subtle pulse op AI avatar tijdens streaming.
   Streaming-state wordt al via .msg-assistant.is-streaming class gemarkeerd?
   Zo niet, voorlopig de animation op msg-avatar in alle msg-assistant states zetten
   met opacity-pulse zodat het zelden opvalt wanneer er geen stream is. */
@keyframes refined-avatar-pulse {
  0%, 100% { transform: scale(1.0); }
  50%      { transform: scale(1.04); }
}
html[data-style="refined"] .msg-assistant.is-streaming .msg-avatar,
html[data-style="refined"] .msg-assistant:has(.streaming-cursor) .msg-avatar {
  animation: refined-avatar-pulse 1.6s ease-in-out infinite;
}

/* a11y — respecteer prefers-reduced-motion: schakel pulse uit. */
@media (prefers-reduced-motion: reduce) {
  html[data-style="refined"] .msg-avatar {
    animation: none !important;
  }
  html[data-style="refined"] .btn-new,
  html[data-style="refined"] .composer-send,
  html[data-style="refined"] .msg-action,
  html[data-style="refined"] .followup-chip {
    transition: none !important;
  }
}

/* a11y — respecteer prefers-reduced-transparency: solid fallback. */
@media (prefers-reduced-transparency: reduce) {
  html[data-style="refined"] .topbar,
  html[data-style="refined"] .sidebar,
  html[data-style="refined"] .composer,
  html[data-style="refined"] .msg-user-bubble,
  html[data-style="refined"] .msg-ai-bubble,
  html[data-style="refined"] .brand-mark {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    background: var(--bg-elev, var(--bg-base)) !important;
  }
}
```

> Note: `:has()` selector werkt in moderne browsers. Streaming-state-detectie via `.streaming-cursor` als directe child. Als V0 een eigen `.is-streaming` of `[data-streaming]` attribute heeft, gebruik dat ipv de :has — voor nu houden we beide selectors.

- [ ] **Step 9.2: Smoke-test in browser**

Open de dev-URL, toggle Refined aan in Settings-tab, stuur een vraag aan een bot. Check:
- Avatar pulst lichtjes tijdens streamen
- Geen JS-errors in console
- Pulse stopt zodra response binnen is

- [ ] **Step 9.3: Commit**

```
git add app/globals.css
git commit -m "feat(v0): Refined v2 motion (avatar pulse) + a11y fallbacks"
```

---

## Task 10: Volledige e2e + visuele smoke + PR-update

**Files:**
- None (alleen verificatie + GitHub-PR-update)

- [ ] **Step 10.1: Run de volledige e2e suite voor style-mode-toggle**

```
npm run test:e2e -- tests/v0/style-mode-toggle.spec.ts
```
Expected: alle 9 tests PASS (4 origineel + 5 nieuwe in v2).

- [ ] **Step 10.2: Visuele smoke-test in browser**

Open dev-URL. Doorloop deze checklist:
- [ ] Classic + dark: ongewijzigd t.o.v. main.
- [ ] Classic + light: ongewijzigd t.o.v. main.
- [ ] Refined + dark: ocean-blobs zichtbaar, glass-bubbles, gradient AI-avatar met roze-cyan glow, pill-knoppen wit-frosted.
- [ ] Refined + light: vibrant aqua-teal bg, witte frosted bubbles popping tegen bg, AI-avatar cyan-teal radial, pill-knoppen teal gradient.
- [ ] Logo zichtbaar in sidebar in alle 4 combinaties (mark.png laadt).
- [ ] Settings-tab: form-controls (toggle, radio's, sliders) blijven functioneel en hebben shadcn-look (niet meegestylt).
- [ ] Toggle Classic ↔ Refined wisselt binnen 1 frame zonder flash.
- [ ] Reload behoudt keuze (localStorage werkt).

Als één punt faalt: log de issue als nieuwe task in de plan-checklist en fix vóór door te gaan.

- [ ] **Step 10.3: Run graphify update**

```
graphify update .
```
Commit de update mee:
```
git add graphify-out/
git commit -m "chore: graphify update na Refined v2 manta-redesign"
```

- [ ] **Step 10.4: Update PR #13 beschrijving**

Run:
```
gh pr edit 13 --body "$(cat <<'EOF'
## Summary
- **Refined v2 "Manta" — full visual redesign.** Vervangt v1 token-tuning door een aparte visuele identiteit: cinematic glass surfaces, gradient-glow blobs, pill-knoppen, gradient AI-avatar.
- **Dark** = Bioluminescent Abyss (deep navy + cyan glow + jellyfish-pink accent).
- **Light** = Reef Pop (vibrant aqua/teal bg + frosted white bubbles).
- Pure CSS-uitbreiding op bestaand `[data-style="refined"]` patroon; één component-wijziging (`msg-ai-bubble` class). Toggle/hook/storage uit v1 ongewijzigd.

## Spec & plan
- Spec: `docs/superpowers/specs/2026-05-11-v0-refined-v2-manta-redesign.md`
- Plan: `docs/superpowers/plans/2026-05-11-v0-refined-v2-manta-redesign.md`
- Brainstorm-mockups bewaard in `.superpowers/brainstorm/` (lokaal, niet gecommit).

## Test plan
- [x] `npm run test:e2e -- tests/v0/style-mode-toggle.spec.ts` — alle 9 tests PASS
- [x] Visuele smoke dark+classic = ongewijzigd
- [x] Visuele smoke dark+refined = Bioluminescent Abyss zichtbaar
- [x] Visuele smoke light+classic = ongewijzigd
- [x] Visuele smoke light+refined = Reef Pop zichtbaar met glass
- [x] Logo `/logo/mark.png` blijft in alle 4 combinaties
- [x] Settings form-controls behouden shadcn-look
- [x] Toggle wissel + localStorage persistentie

## Migratie van v1
v1 leverde 8 commits met partial styling (alleen token-tuning). v2 gooit dat CSS-blok weg en bouwt opnieuw. Commits blijven in branch-historie maar de v1-styling is overschreven.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 10.5: Final push**

```
git push
```

PR #13 is nu klaar voor review.

---

## Self-review checklist (uitgevoerd vóór save)

- **Spec coverage:** elke sectie uit de spec (tokens, surface treatment, knoppen, bubbles, avatar, brand-mark, composer, topbar, sidebar, typography, spacing, motion, a11y, scope, test plan) heeft een task. Sectie 7 (typography) wordt impliciet meegenomen — geen font-wijzigingen, dus geen task nodig.
- **Geen placeholders:** elke step heeft exacte code-blocks, commands en expected output.
- **Type-consistency:** CSS-tokens worden in Task 2/3 gedefinieerd en in Task 4-9 gerefereerd via dezelfde namen (`--glass-blur`, `--glass-tint-2`, etc).
- **Open punt — streaming-state detectie (Task 9):** de pulse-selector gebruikt `:has(.streaming-cursor)` als heuristic. Als V0 een betere state-marker heeft (bv. een class op `.msg-assistant`), kan de subagent dat tijdens executie verbeteren.
