# V0 Abyss Refined — style-toggle (Classic / Refined) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Voeg een opt-in *Refined* visuele stijl toe naast de bestaande *Classic*-stijl, met een toggle in de Settings-tab en persistentie via localStorage. Default blijft Classic.

**Architecture:** Tweede dimensie naast theme. `<html data-style="classic|refined">` wordt vóór paint gezet door een inline boot-script en is reactief via een nieuwe `useStyleMode`-hook. CSS-overrides leven in één `[data-style="refined"]` block in `app/globals.css`; componenten ongewijzigd.

**Tech Stack:** Next.js 14 App Router, React client components, vanilla CSS (Tailwind v4 layer), localStorage, Playwright voor e2e.

**Branch:** `feat/seb/abyss-refined-toggle` (al actief — spec staat erop).

**Spec:** [`docs/superpowers/specs/2026-05-11-v0-abyss-refined-style-toggle-design.md`](../specs/2026-05-11-v0-abyss-refined-style-toggle-design.md)

---

## File Map

| File | Action | Verantwoordelijkheid |
|---|---|---|
| `lib/v0/hooks/use-style-mode.ts` | **Create** | Client-side hook: leest/schrijft `chatmanta-style` localStorage, mute `<html data-style>` |
| `app/layout.tsx` | **Modify** | Boot-script uitbreiden met `data-style` block; default `'classic'` |
| `app/globals.css` | **Modify** | Nieuwe sectie `[data-style="refined"]` met token + selectieve regelovrrides |
| `app/components/settings-view.tsx` | **Modify** | Nieuwe sectie "Opmaak (A/B-test)" bovenaan met radio Classic/Refined |
| `tests/v0/style-mode-toggle.spec.ts` | **Create** | Playwright: default-classic, toggle wijzigt `data-style`, persists over reload, FOUC-check |

---

## Task 1: Maak `useStyleMode`-hook

**Files:**
- Create: `lib/v0/hooks/use-style-mode.ts`

- [ ] **Step 1: Maak het hook-bestand**

Schrijf exact:

```ts
'use client';

import { useCallback, useEffect, useState } from 'react';

export type StyleMode = 'classic' | 'refined';

export const DEFAULT_STYLE_MODE: StyleMode = 'classic';
const STORAGE_KEY = 'chatmanta-style';
const VALID: readonly StyleMode[] = ['classic', 'refined'];

function isStyleMode(v: unknown): v is StyleMode {
  return typeof v === 'string' && (VALID as readonly string[]).includes(v);
}

function readStored(): StyleMode | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return isStyleMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeStored(value: StyleMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // negeer write-fouten in private browsing
  }
}

function applyToDom(mode: StyleMode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-style', mode);
}

export function useStyleMode(): {
  mode: StyleMode;
  set: (m: StyleMode) => void;
} {
  // SSR: start met default. Boot-script in app/layout.tsx heeft data-style al
  // op de DOM gezet voor de eerste paint, dus geen FOUC.
  const [state, setState] = useState<StyleMode>(DEFAULT_STYLE_MODE);

  /* eslint-disable react-hooks/set-state-in-effect -- zelfde SSR-safe patroon als use-theme.ts / use-hyde-mode.ts: lazy initializer zou hydration-mismatch geven op aria-checked state in de SettingsView segmented control. */
  useEffect(() => {
    const stored = readStored();
    if (stored) setState(stored);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const set = useCallback((m: StyleMode) => {
    setState(m);
    writeStored(m);
    applyToDom(m);
  }, []);

  return { mode: state, set };
}
```

- [ ] **Step 2: Lint-check**

Run: `npm run lint -- lib/v0/hooks/use-style-mode.ts`
Expected: geen errors.

- [ ] **Step 3: Commit**

```bash
git add lib/v0/hooks/use-style-mode.ts
git commit -m "feat(v0): useStyleMode hook voor classic/refined toggle"
```

---

## Task 2: Boot-script in `app/layout.tsx` uitbreiden

**Files:**
- Modify: `app/layout.tsx` (lines 21–36)

- [ ] **Step 1: Vervang `themeBootScript` met versie die ook style-mode zet**

Open `app/layout.tsx`. Vervang het hele `themeBootScript` const-blok door:

```ts
// Inline FOUC-prevention: zet <html class="dark"> + data-theme + data-style
// synchroon vóór React hydrateert. Twee onafhankelijke IIFE's zodat een fout
// in de ene block de andere niet blokkeert.
const themeBootScript = `
(function() {
  try {
    var k = 'chatmanta-theme';
    var c = localStorage.getItem(k);
    if (c !== 'light' && c !== 'dark' && c !== 'system') c = 'system';
    var resolved = c;
    if (c === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    var root = document.documentElement;
    if (resolved === 'dark') root.classList.add('dark');
    root.setAttribute('data-theme', resolved);
  } catch (e) {}
})();
(function() {
  try {
    var k = 'chatmanta-style';
    var s = localStorage.getItem(k);
    if (s !== 'classic' && s !== 'refined') s = 'classic';
    document.documentElement.setAttribute('data-style', s);
  } catch (e) {}
})();
`;
```

(De rest van het bestand — `RootLayout`-functie, `<html suppressHydrationWarning>` — blijft ongewijzigd.)

- [ ] **Step 2: Verifieer manueel dat dev-server start**

Run (in een aparte terminal die je laat draaien): `npm run dev`
Open: `http://localhost:3000/`
Inspect het `<html>`-element in DevTools.
Expected: `<html ... data-theme="dark" data-style="classic">` (of `light`, afhankelijk van OS-pref).

- [ ] **Step 3: Verifieer fallback bij corrupte localStorage**

In de DevTools console:
```js
localStorage.setItem('chatmanta-style', 'garbage');
location.reload();
```
Expected: `<html data-style="classic">` (fallback naar default).

Cleanup: `localStorage.removeItem('chatmanta-style');`

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(v0): boot-script zet data-style attribute vóór paint"
```

---

## Task 3: CSS-overrides voor Refined toevoegen

**Files:**
- Modify: `app/globals.css` (nieuwe sectie ná regel 69 `html:not(.dark) { ... }`)

Doel: een eerste werkbare Refined-look die merkbaar verschilt van Classic. Specifieke hex-tuning gebeurt iteratief in deze task.

- [ ] **Step 1: Voeg de Refined-tokens block toe na regel 69**

Zoek in `app/globals.css` regel `}` direct na `html:not(.dark) { ... --accent-fg: #ffffff; }` (rond regel 69). Direct daaronder, vóór de `@theme inline`-block, plaats:

```css
/* ==========================================================================
   Style mode: REFINED — opt-in via Settings-tab.
   Override alleen wat verandert; al het andere erft van Classic (:root /
   html:not(.dark)). Tokens hier; selectieve regelovrrides verderop in deze
   file met dezelfde [data-style="refined"] selector-prefix.
   ========================================================================== */

/* Refined + dark (default theme) — gedempte gradient, rustigere borders,
   minder cyan-glow. */
html.dark[data-style="refined"] {
  --border: rgba(120, 200, 230, 0.06);
  --border-strong: rgba(120, 200, 230, 0.18);
  --accent-glow: rgba(77, 214, 232, 0.20);
  --accent-soft: rgba(77, 214, 232, 0.10);
}

/* Refined + light — zachtere petrol-accent, betere contrast op witte bg. */
html:not(.dark)[data-style="refined"] {
  --accent: #0e7c9a;
  --accent-glow: rgba(14, 124, 154, 0.18);
  --accent-soft: rgba(14, 124, 154, 0.08);
  --border-strong: rgba(20, 60, 90, 0.18);
  --fg-muted: #3f5868;
}

/* Refined — ambient body-gradient gedempt (beide themes). */
html[data-style="refined"] body {
  background:
    radial-gradient(ellipse 70% 50% at 20% 0%, color-mix(in oklab, var(--accent) 5%, transparent), transparent 60%),
    radial-gradient(ellipse 50% 40% at 100% 100%, color-mix(in oklab, var(--accent-2) 4%, transparent), transparent 60%),
    var(--bg);
}

/* Refined — message-styling. AI-avatar zonder glow, user-bubble rustiger. */
html[data-style="refined"] .msg-avatar {
  filter: none;
}
html[data-style="refined"] .msg-user-bubble {
  background: var(--accent-soft);
  border-color: color-mix(in oklab, var(--accent) 22%, transparent);
}
html[data-style="refined"] .brand-mark {
  filter: drop-shadow(0 0 6px var(--accent-glow));
}

/* Refined — meer ruimte tussen turns in de conversatie. */
html[data-style="refined"] .conversation-inner {
  gap: 40px;
}
```

- [ ] **Step 2: Verifieer visueel dat Classic ongewijzigd is**

Met dev-server uit Task 2 nog draaiend:
1. Zorg dat `localStorage['chatmanta-style']` leeg/`classic` is.
2. Reload `http://localhost:3000/`.
3. Inspect: ambient gradient, user-message bubble, AI-avatar glow → moet identiek zijn aan voor deze PR.

- [ ] **Step 3: Verifieer Refined visueel**

In DevTools console:
```js
localStorage.setItem('chatmanta-style', 'refined');
location.reload();
```
Expected: gedempte gradient (subtieler), AI-avatar zonder glow, user-bubble met cyan-tint accent-soft achtergrond, meer ruimte tussen messages.

Test in beide thema's: klik de sun/moon toggle in de topbar en check dat zowel `dark+refined` als `light+refined` werken.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat(v0): Refined style overrides — gedempte gradient + rustigere messages"
```

---

## Task 4: Settings-UI — "Opmaak"-sectie toevoegen

**Files:**
- Modify: `app/components/settings-view.tsx`

Plaats de nieuwe sectie *bovenaan*, vóór Bot-versie, zodat de A/B-toggle prominent is. Gebruikt `useStyleMode` direct (geen prop-drilling) — bewuste afwijking van het bestaande tone/length/hyde-patroon, zoals vermeld in de spec.

- [ ] **Step 1: Import toevoegen**

Open `app/components/settings-view.tsx`. Voeg na de bestaande imports (na regel ~8 `import type { HydeMode } from './use-hyde-mode';`) deze regel toe:

```ts
import { useStyleMode, type StyleMode } from '@/lib/v0/hooks/use-style-mode';
```

- [ ] **Step 2: Constantes toevoegen onder de bestaande HYDE-constantes**

Direct onder regel `const HYDE_HINT = ...;` (rond regel 17–18), voeg toe:

```ts
const STYLE_MODES: readonly StyleMode[] = ['classic', 'refined'];
const STYLE_LABELS: Record<StyleMode, string> = {
  classic: 'Klassiek',
  refined: 'Refined',
};
const STYLE_HINT =
  'Klassiek = huidige opmaak. Refined = de nieuwe rustigere stijl. Wissel om beide te ervaren tijdens de A/B-test.';
```

- [ ] **Step 3: Hook aanroepen in de component**

Direct na regel `const current = bots.find(...)` (rond regel 55), voeg toe:

```ts
const { mode: styleMode, set: setStyleMode } = useStyleMode();
```

- [ ] **Step 4: Render de nieuwe sectie bovenaan**

Vervang het bestaande openings-fragment van het returned JSX:

```tsx
  return (
    <div>
      <div className="settings-section">
        <div className="settings-label">Bot-versie</div>
```

met:

```tsx
  return (
    <div>
      <div className="settings-section">
        <div className="settings-label">Opmaak (A/B-test)</div>
        <div className="threshold-presets" role="radiogroup" aria-label="Opmaak">
          {STYLE_MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={styleMode === m}
              className={`threshold-preset${styleMode === m ? ' active' : ''}`}
              onClick={() => setStyleMode(m)}
            >
              <span className="threshold-preset-label">{STYLE_LABELS[m]}</span>
            </button>
          ))}
        </div>
        <div className="slider-hint" style={{ marginTop: 8 }}>{STYLE_HINT}</div>
      </div>

      <div className="settings-section">
        <div className="settings-label">Bot-versie</div>
```

(De rest van het JSX-blok blijft ongewijzigd.)

- [ ] **Step 5: Verifieer manueel**

Met dev-server nog draaiend:
1. Open `http://localhost:3000/`, klik in topbar op het settings-tab-icoon (tandwiel) in het right-panel.
2. Bovenaan staat nu "Opmaak (A/B-test)" met twee knoppen: Klassiek + Refined.
3. Klassiek is actief (cyan-border + accent text). Klik op Refined → visuele wissel direct, Refined is nu actief.
4. Reload → Refined blijft actief (localStorage).
5. Klik terug naar Klassiek → wisselt direct terug.

- [ ] **Step 6: Lint-check**

Run: `npm run lint -- app/components/settings-view.tsx`
Expected: geen errors.

- [ ] **Step 7: Commit**

```bash
git add app/components/settings-view.tsx
git commit -m "feat(v0): Opmaak-toggle (Classic/Refined) bovenaan Settings-tab"
```

---

## Task 5: Playwright spec — style-toggle gedrag

**Files:**
- Create: `tests/v0/style-mode-toggle.spec.ts`

Mirror van `tests/v0/theme-switch.spec.ts`, maar voor `data-style`.

- [ ] **Step 1: Schrijf de spec**

Maak `tests/v0/style-mode-toggle.spec.ts`:

```ts
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

    // Open Settings-tab (tandwiel-icoon in de right-panel-tabs).
    await page.getByRole('button', { name: /settings/i }).click();

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
    await page.getByRole('button', { name: /settings/i }).click();
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
});
```

- [ ] **Step 2: Run de spec**

Run: `npm run test:e2e -- tests/v0/style-mode-toggle.spec.ts`
Expected: alle 4 tests groen.

Als ze falen op locator (settings-tab knop-naam matched niet): inspecteer in dev de exacte aria-label of role-naam van de settings-tab in `app/components/right-panel.tsx` en pas de locator aan. Documenteer de aanpassing in een vervolg-step.

- [ ] **Step 3: Commit**

```bash
git add tests/v0/style-mode-toggle.spec.ts
git commit -m "test(v0): e2e voor style-mode toggle (Classic/Refined)"
```

---

## Task 6: Visuele QA + graphify update + PR

- [ ] **Step 1: Handmatig visueel inspecteren — 4 combinaties**

Met dev-server draaiend, voor elke combinatie open `http://localhost:3000/` en controleer:

| Combinatie | Verwacht |
|---|---|
| `dark + classic` | Identiek aan vóór deze PR (ambient gradient, glow op avatar, user-bubble surface-3) |
| `dark + refined` | Gedempte gradient, geen avatar-glow, user-bubble cyan-tint, meer ruimte tussen turns |
| `light + classic` | Identiek aan vóór deze PR (light theme, cyan accent) |
| `light + refined` | Zachtere petrol-accent (`#0e7c9a`), zelfde verfijningen als dark+refined |

Wissel via topbar-toggle (sun/moon) + Settings-radio.

- [ ] **Step 2: Run graphify update**

Run: `npx graphify update .`
Expected: graph file updates (nieuwe edges voor use-style-mode hook + SettingsView).

```bash
git add graphify-out/
git commit -m "chore: graphify update voor style-toggle feature"
```

- [ ] **Step 3: Run lint + build**

Run: `npm run lint`
Expected: geen errors.

Run: `npm run build`
Expected: build slaagt zonder type-errors.

- [ ] **Step 4: PR aanmaken**

```bash
git push -u origin feat/seb/abyss-refined-toggle
gh pr create --title "feat(v0): Abyss Refined style — opt-in Classic/Refined toggle" --body "$(cat <<'EOF'
## Summary
- Nieuwe `useStyleMode`-hook + `data-style` attribuut op `<html>`, gezet door inline boot-script (geen FOUC)
- CSS-overrides in `[data-style="refined"]` — gedempte gradient, rustigere borders, AI-avatar zonder glow, meer ruimte tussen turns, zachtere petrol-accent in light
- Settings-tab krijgt "Opmaak (A/B-test)" sectie bovenaan met Klassiek/Refined radio
- Default = Classic (huidig); Refined is opt-in
- Spec: `docs/superpowers/specs/2026-05-11-v0-abyss-refined-style-toggle-design.md`

## Test plan
- [ ] `npm run test:e2e -- tests/v0/style-mode-toggle.spec.ts` groen
- [ ] Visuele inspectie: dark+classic = ongewijzigd
- [ ] Visuele inspectie: dark+refined = verschillen zichtbaar (gradient, avatar, bubble, spacing)
- [ ] Visuele inspectie: light+classic = ongewijzigd
- [ ] Visuele inspectie: light+refined = petrol-accent + verfijningen
- [ ] Reload behoudt keuze in localStorage

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review (uitgevoerd bij plan-schrijven)

**Spec coverage check:**
- ✅ `useStyleMode` hook → Task 1
- ✅ Boot-script + `data-style` default → Task 2
- ✅ CSS-overrides per token + per-component (gradient, avatar, bubble, spacing) → Task 3
- ✅ Settings-UI met segmented radio → Task 4
- ✅ Edge cases (SSR, hydration, corrupte localStorage, snelle wissel) → Task 2 stap 3 + Task 4 stap 5 + Task 5
- ✅ Geen wijziging aan `app/login/` → niet in scope; geen task raakt het
- ✅ Tests voor 4 theme×style combinaties → Task 6 stap 1

**Placeholder scan:** geen TBD/TODO; alle code-blokken bevatten complete code; alle commands bevatten exacte paden.

**Type consistency:** `StyleMode = 'classic' | 'refined'` consistent in hook (Task 1), in SettingsView import (Task 4), en in test-spec values (Task 5). LocalStorage key `'chatmanta-style'` consistent in hook, boot-script (Task 2), en test-spec.

**Bewuste open punten:**
- Exacte hex-waardes voor Refined-tokens zijn een eerste schatting; spec markeert deze als "afstemmen tijdens implementatie op screenshot-eval". Iteratie in vervolg-commit op deze branch is acceptabel.
- Het Playwright-locator-matchen voor de "Settings"-tab kan een aanpassing nodig hebben (Task 5 stap 2 noemt dit) — niet vooraf op te lossen omdat de exact-rendering van de tab-button afhangt van `right-panel.tsx` waar geen wijziging in plan zit.
