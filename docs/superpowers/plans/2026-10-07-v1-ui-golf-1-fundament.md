# V1 UI-redesign: Golf 1 (Fundament) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De V1-ontwerplaag "Diepzee" neerzetten, het klantendashboard een nieuwe schil geven (donkere zijbalk, mobiel menu, geen bovenbalk), elke `/v1/app`-route direct laten reageren met een laadskelet, en de login-/auth-pagina's in de nieuwe stijl zetten.

**Architecture:** Nieuwe map `app/v1/_ui/` met één stylesheet (`ui.css`: tokens + componentklassen, alles onder de scope-class `.v1-ui`) en kleine React-bouwstenen. Een nieuwe `app/v1/layout.tsx` laadt die laag voor heel V1 en forceert de lichte modus. De `/v1/app`-pagina's zelf blijven in deze golf op `klant.css` draaien (die wordt nog wél geïmporteerd); alleen de schil eromheen is nieuw. `klant.css` en alle V0-bestanden blijven ongewijzigd.

**Tech Stack:** Next.js 16 App Router (`loading.tsx`, `template.tsx`, `next/font`), React 19, plain CSS (geen Tailwind-classes in de nieuwe laag i.v.m. de Tailwind-v4-valkuil), `lucide-react`-iconen, Supabase browser-client voor auth, `node:test` + `tsx` voor unit-tests, Playwright voor visuele verificatie.

**Spec:** `docs/superpowers/specs/2026-10-07-v1-ui-redesign-design.md` (§2, §4, §5, §7.1, §7.8, §9 golf 1).

**Bewuste afwijkingen van de spec (YAGNI, binnen golf 1):**
- Alleen de bouwstenen die golf 1 gebruikt worden nu gebouwd (`Button`, `Field`-klassen, `Skeleton`/`PageSkeleton`, `Sidebar`/`NavItem`, `AuthCard`, `BrandMark`). `Card`, `Tabs`, `Toast`, `Drawer` enz. ontstaan in de golf waarin ze voor het eerst nodig zijn.
- Het organisatieblok in de zijbalk toont **naam + chatbotstatus** i.p.v. naam + domein: het domein zit niet in de bestaande shell-query, en de status vervangt de badge uit de vervallen bovenbalk.
- De **stippen** in de zijbalk (rood bij Widget/Kennisbank/Account, quiz-stip bij Kennisbank) komen in golf 3, samen met het `AttentionBlock`: ze hebben gegevens nodig die de huidige shell-query niet ophaalt. Golf 1 toont alleen de bestaande tellers (Gesprekken, Contactverzoeken).
- Er komt een **Uitloggen**-knop in de zijbalk. V1 heeft nu nergens een uitlogmogelijkheid; zonder bovenbalk is dit de logische plek.

---

## Bestandsoverzicht

| Bestand | Actie | Verantwoordelijkheid |
|---|---|---|
| `app/v1/_ui/ui.css` | nieuw | Tokens, basis, alle `v1-*`-componentklassen, beweging, reduced-motion |
| `app/v1/_ui/fonts.ts` | nieuw | Plus Jakarta Sans 400–700 als `--font-v1` (los van de root-font, die alleen 600–800 laadt) |
| `app/v1/_ui/nav.ts` | nieuw | Pure helpers: actief-check, actieve index, teller-format, initialen, statuslabels |
| `app/v1/_ui/auth-messages.ts` | nieuw | Supabase-auth-foutteksten → Nederlands |
| `app/v1/_ui/button.tsx` | nieuw | `Button` + `buttonClass()` |
| `app/v1/_ui/brand-mark.tsx` | nieuw | ChatManta-beeldmerk (gemaskeerd logo op accentvlak) |
| `app/v1/_ui/skeleton.tsx` | nieuw | `Skeleton` + `PageSkeleton` (varianten per paginatype) |
| `app/v1/_ui/auth-card.tsx` | nieuw | Gecentreerde kaart voor login/auth-pagina's |
| `app/v1/_ui/force-light.tsx` | nieuw | Inline script dat `html.dark` weghaalt (alleen lichte modus in V1) |
| `app/v1/_ui/__tests__/nav.test.ts` | nieuw | Unit-tests nav-helpers |
| `app/v1/_ui/__tests__/auth-messages.test.ts` | nieuw | Unit-tests foutteksten |
| `app/v1/_ui/__tests__/button.test.tsx` | nieuw | Render-test `Button` |
| `app/v1/layout.tsx` | nieuw | Laadt `ui.css` + font + `ForceLight` voor heel `/v1` |
| `app/v1/app/_shell/sidebar.tsx` | herschrijven | Donkere zijbalk: merk, org-blok, zoeken, 2 navgroepen met glijdende markering, voet met Feedback + Uitloggen |
| `app/v1/app/_shell/shell-frame.tsx` | nieuw | Client-schil: mobiele balk, uitschuifmenu-state, backdrop, `<main>` |
| `app/v1/app/_shell/sign-out-button.tsx` | nieuw | Uitloggen via Supabase-client |
| `app/v1/app/_shell/search-trigger.tsx` | wijzigen | Knop in donkere stijl; routelabels bijgewerkt |
| `app/v1/app/_shell/topbar.tsx` | verwijderen | Bovenbalk vervalt (spec §7.1) |
| `app/v1/app/layout.tsx` | wijzigen | Nieuwe schil; geen topbar/TweaksPanel meer |
| `app/v1/app/template.tsx` | nieuw | Zachte inkomst-animatie per navigatie |
| `app/v1/app/**/loading.tsx` (11×) | nieuw | Laadskelet per route |
| `app/v1/login/v1-sign-in-card.tsx` | herschrijven | Nieuwe stijl, logica ongewijzigd (+ NL-foutteksten) |
| `app/v1/auth/forgot-password/forgot-password-form.tsx` | herschrijven | idem |
| `app/v1/auth/set-password/set-password-form.tsx` | herschrijven | idem |

Niet aanraken: `app/klantendashboard/**`, `app/admindashboard/**`, `app/v1/admin/**` (golf 4), `app/embed*/**` (golf 2), `app/layout.tsx`, `app/globals.css`.

---

### Task 0: Worktree klaarzetten

**Files:** geen codewijziging.

- [ ] **Step 1: Controleer branch en status**

Run (Git Bash, in `C:/Users/solys/Documents/Code/chatmanta-ui-redesign`):
```bash
git rev-parse --abbrev-ref HEAD && git status --short
```
Expected: `feat/seb/v1-ui-redesign` en geen wijzigingen.

- [ ] **Step 2: Upstream goedzetten** (de branch is aangemaakt met `origin/main` als upstream)

```bash
git branch --unset-upstream
```

- [ ] **Step 3: Env kopiëren en checken dat de sleutels actief zijn**

```bash
cp ../chatmanta/.env.local .env.local
grep -c -E "^(NEXT_PUBLIC_V1_SUPABASE_URL|NEXT_PUBLIC_V1_SUPABASE_ANON_KEY|V1_SEED_MEMBER_PW)=" .env.local
```
Expected: `3`. Lager: een sleutel ontbreekt of is uitgecommentarieerd (`#`); stop en meld het.

- [ ] **Step 4: Dependencies installeren** (echte `npm ci`, geen junction: Turbopack-dev faalt anders)

```bash
npm ci
```
Expected: eindigt zonder `ERR!`.

- [ ] **Step 5: Baseline**

```bash
npm run typecheck && npm run test:unit
```
Expected: beide groen. Faalt er al iets vóór onze wijzigingen: noteer exact wat en ga door (niet zelf repareren buiten scope).

---

### Task 1: Nav-helpers (TDD)

**Files:**
- Create: `app/v1/_ui/nav.ts`
- Test: `app/v1/_ui/__tests__/nav.test.ts`

- [ ] **Step 1: Schrijf de falende test**

`app/v1/_ui/__tests__/nav.test.ts`:
```ts
// Run: node --import tsx --test app/v1/_ui/__tests__/nav.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isNavActive,
  activeIndex,
  formatCount,
  initials,
  STATUS_LABEL,
  NAV_ITEM_PITCH,
} from '../nav';

test('isNavActive: exact match alleen op het pad zelf', () => {
  assert.equal(isNavActive('/v1/app', '/v1/app', true), true);
  assert.equal(isNavActive('/v1/app/kennisbank', '/v1/app', true), false);
});

test('isNavActive: niet-exact matcht ook subpaden', () => {
  assert.equal(isNavActive('/v1/app/gesprekken/abc', '/v1/app/gesprekken'), true);
  assert.equal(isNavActive('/v1/app/gesprekken', '/v1/app/gesprekken'), true);
  assert.equal(isNavActive('/v1/app/gesprekkenx', '/v1/app/gesprekken'), false);
});

test('activeIndex: index van het actieve item, -1 als geen', () => {
  const items = [
    { href: '/v1/app', exact: true },
    { href: '/v1/app/gesprekken' },
    { href: '/v1/app/kennisbank' },
  ];
  assert.equal(activeIndex('/v1/app', items), 0);
  assert.equal(activeIndex('/v1/app/kennisbank', items), 2);
  assert.equal(activeIndex('/v1/app/account', items), -1);
});

test('formatCount: null bij 0/undefined, 99+ boven 99', () => {
  assert.equal(formatCount(undefined), null);
  assert.equal(formatCount(0), null);
  assert.equal(formatCount(3), '3');
  assert.equal(formatCount(100), '99+');
});

test('initials: twee letters uit de naam', () => {
  assert.equal(initials('Manta Demo'), 'MD');
  assert.equal(initials('bakkerij'), 'BA');
  assert.equal(initials('   '), 'CM');
});

test('STATUS_LABEL dekt alle chatbotstatussen', () => {
  assert.deepEqual(STATUS_LABEL, {
    concept: 'Concept',
    testing: 'Testmodus',
    live: 'Live',
    paused: 'Gepauzeerd',
  });
});

test('NAV_ITEM_PITCH = itemhoogte 40 + gap 2', () => {
  assert.equal(NAV_ITEM_PITCH, 42);
});
```

- [ ] **Step 2: Draai en zie hem falen**

Run: `node --import tsx --test app/v1/_ui/__tests__/nav.test.ts`
Expected: FAIL met `Cannot find module '../nav'`.

- [ ] **Step 3: Implementeer**

`app/v1/_ui/nav.ts`:
```ts
// Pure helpers voor de V1-schil (zijbalk). Geen React, zodat ze los testbaar zijn.
import type { ChatbotStatus } from '@/lib/v0/klantendashboard/types';

/** Hoogte van een nav-item (40px) + gap (2px): de stapgrootte van de glijdende markering. */
export const NAV_ITEM_PITCH = 42;

export function isNavActive(pathname: string, href: string, exact = false): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function activeIndex(
  pathname: string,
  items: ReadonlyArray<{ href: string; exact?: boolean }>,
): number {
  return items.findIndex((i) => isNavActive(pathname, i.href, i.exact));
}

/** Tellertekst voor een menu-item; null = geen teller tonen. */
export function formatCount(n: number | undefined): string | null {
  if (!n || n < 1) return null;
  return n > 99 ? '99+' : String(n);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'CM';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export const STATUS_LABEL: Record<ChatbotStatus, string> = {
  concept: 'Concept',
  testing: 'Testmodus',
  live: 'Live',
  paused: 'Gepauzeerd',
};
```

- [ ] **Step 4: Draai en zie hem slagen**

Run: `node --import tsx --test app/v1/_ui/__tests__/nav.test.ts`
Expected: alle 7 tests `ok`.

- [ ] **Step 5: Commit**

```bash
git add app/v1/_ui/nav.ts app/v1/_ui/__tests__/nav.test.ts
git commit -m "feat(v1-ui): nav-helpers voor de nieuwe schil"
```

---

### Task 2: Auth-foutteksten (TDD)

**Files:**
- Create: `app/v1/_ui/auth-messages.ts`
- Test: `app/v1/_ui/__tests__/auth-messages.test.ts`

- [ ] **Step 1: Schrijf de falende test**

`app/v1/_ui/__tests__/auth-messages.test.ts`:
```ts
// Run: node --import tsx --test app/v1/_ui/__tests__/auth-messages.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authErrorMessage } from '../auth-messages';

test('bekende Supabase-meldingen worden Nederlands', () => {
  assert.equal(authErrorMessage('Invalid login credentials'), 'E-mailadres of wachtwoord klopt niet.');
  assert.equal(
    authErrorMessage('Email not confirmed'),
    'Je e-mailadres is nog niet bevestigd. Kijk in je inbox.',
  );
});

test('rate-limit-varianten', () => {
  assert.equal(
    authErrorMessage('email rate limit exceeded'),
    'Te veel pogingen. Wacht even en probeer het opnieuw.',
  );
  assert.equal(
    authErrorMessage('Too many requests'),
    'Te veel pogingen. Wacht even en probeer het opnieuw.',
  );
});

test('verlopen sessie bij wachtwoord zetten', () => {
  assert.equal(
    authErrorMessage('Auth session missing!'),
    'Je link is verlopen. Vraag een nieuwe link aan.',
  );
});

test('zelfde wachtwoord als het oude', () => {
  assert.equal(
    authErrorMessage('New password should be different from the old password.'),
    'Kies een ander wachtwoord dan je huidige.',
  );
});

test('onbekende melding blijft ongewijzigd', () => {
  assert.equal(authErrorMessage('Iets heel anders'), 'Iets heel anders');
});
```

- [ ] **Step 2: Draai en zie hem falen**

Run: `node --import tsx --test app/v1/_ui/__tests__/auth-messages.test.ts`
Expected: FAIL met `Cannot find module '../auth-messages'`.

- [ ] **Step 3: Implementeer**

`app/v1/_ui/auth-messages.ts`:
```ts
// Supabase Auth geeft Engelse foutteksten terug. Dit vertaalt de bekende
// gevallen naar Nederlands; onbekende teksten gaan ongewijzigd door.
const EXACT: Record<string, string> = {
  'Invalid login credentials': 'E-mailadres of wachtwoord klopt niet.',
  'Email not confirmed': 'Je e-mailadres is nog niet bevestigd. Kijk in je inbox.',
};

export function authErrorMessage(raw: string): string {
  if (EXACT[raw]) return EXACT[raw];
  if (/rate limit|too many/i.test(raw)) return 'Te veel pogingen. Wacht even en probeer het opnieuw.';
  if (/session missing|session not found|expired/i.test(raw)) {
    return 'Je link is verlopen. Vraag een nieuwe link aan.';
  }
  if (/different from the old/i.test(raw)) return 'Kies een ander wachtwoord dan je huidige.';
  return raw;
}
```

- [ ] **Step 4: Draai en zie hem slagen**

Run: `node --import tsx --test app/v1/_ui/__tests__/auth-messages.test.ts`
Expected: 5 tests `ok`.

- [ ] **Step 5: Commit**

```bash
git add app/v1/_ui/auth-messages.ts app/v1/_ui/__tests__/auth-messages.test.ts
git commit -m "feat(v1-ui): Nederlandse auth-foutteksten"
```

---

### Task 3: Ontwerplaag: stylesheet, font, V1-layout, lichte modus

**Files:**
- Create: `app/v1/_ui/ui.css`, `app/v1/_ui/fonts.ts`, `app/v1/_ui/force-light.tsx`, `app/v1/layout.tsx`

- [ ] **Step 1: Schrijf `app/v1/_ui/ui.css`**

```css
/* V1-ontwerplaag "Diepzee" (spec 2026-10-07 §2, §4, §5).
 * Alles hangt onder .v1-ui (gezet in app/v1/layout.tsx) zodat V0 er nooit door
 * geraakt wordt. Bewust een los bestand en NIET in app/globals.css: Tailwind v4
 * dropt daar soms stil nieuwe properties (zie AGENTS.md). */

.v1-ui {
  /* Kleur */
  --v1-navy: #0c1e2e;
  --v1-navy-2: #16314a;
  --v1-accent: #0d9488;
  --v1-accent-ink: #0f766e;
  --v1-bg: #f3f6f9;
  --v1-surface: #ffffff;
  --v1-surface-2: #eef2f6;
  --v1-ink: #0c1e2e;
  --v1-ink-2: #44566a;
  --v1-muted: #5b6b7b;
  --v1-line: rgba(12, 30, 46, 0.08);
  --v1-line-strong: rgba(12, 30, 46, 0.14);
  --v1-ok: #15803d;
  --v1-ok-soft: rgba(22, 163, 74, 0.1);
  --v1-warn: #9a5200;
  --v1-warn-soft: rgba(217, 119, 6, 0.12);
  --v1-danger: #b42318;
  --v1-danger-soft: rgba(217, 45, 32, 0.1);
  --v1-on-navy: #ffffff;
  --v1-on-navy-2: rgba(255, 255, 255, 0.7);
  --v1-on-navy-3: rgba(255, 255, 255, 0.45);

  /* Vorm */
  --v1-r-sm: 10px;
  --v1-r-md: 12px;
  --v1-r-lg: 20px;
  --v1-r-xl: 22px;
  --v1-shadow-1: 0 1px 2px rgba(12, 30, 46, 0.05), 0 8px 24px rgba(12, 30, 46, 0.05);
  --v1-shadow-2: 0 1px 2px rgba(12, 30, 46, 0.06), 0 16px 36px rgba(12, 30, 46, 0.1);
  --v1-shadow-pop: 0 1px 2px rgba(12, 30, 46, 0.06), 0 12px 24px rgba(12, 30, 46, 0.1),
    0 32px 64px rgba(12, 30, 46, 0.12);
  --v1-focus: 0 0 0 3px rgba(13, 148, 136, 0.35);

  /* Type */
  --v1-font: var(--font-v1), 'Helvetica Neue', Arial, sans-serif;

  /* Beweging */
  --v1-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --v1-spring: cubic-bezier(0.34, 1.3, 0.64, 1);
  --v1-fast: 150ms;
  --v1-base: 220ms;
  --v1-slow: 340ms;

  font-family: var(--v1-font);
  color: var(--v1-ink);
}

@keyframes v1-enter {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
@keyframes v1-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes v1-shimmer {
  from { background-position: 100% 0; }
  to { background-position: -100% 0; }
}
@keyframes v1-spin {
  to { transform: rotate(360deg); }
}

.v1-sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}

/* ── Knoppen ─────────────────────────────────────────────── */
.v1-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  height: 40px; padding: 0 18px; border: 0; border-radius: var(--v1-r-md);
  font: 600 14px/1 var(--v1-font); text-decoration: none; white-space: nowrap; cursor: pointer;
  transition: transform var(--v1-fast) var(--v1-ease), box-shadow var(--v1-base) var(--v1-ease),
    background-color var(--v1-fast) ease;
}
.v1-btn:hover { transform: translateY(-1px); }
.v1-btn:active { transform: scale(0.97); transition-duration: 80ms; }
.v1-btn:focus-visible { outline: none; box-shadow: var(--v1-focus); }
.v1-btn:disabled { opacity: 0.55; cursor: default; transform: none; }
.v1-btn--primary { background: var(--v1-navy); color: #fff; box-shadow: 0 1px 2px rgba(12, 30, 46, 0.2); }
.v1-btn--primary:hover:not(:disabled) { background: var(--v1-navy-2); box-shadow: 0 6px 16px rgba(12, 30, 46, 0.22); }
.v1-btn--secondary {
  background: var(--v1-surface); color: var(--v1-ink);
  box-shadow: 0 0 0 1px var(--v1-line-strong), 0 1px 2px rgba(12, 30, 46, 0.05);
}
.v1-btn--secondary:hover:not(:disabled) { box-shadow: 0 0 0 1px rgba(12, 30, 46, 0.18), 0 6px 14px rgba(12, 30, 46, 0.08); }
.v1-btn--ghost { background: transparent; color: var(--v1-ink-2); }
.v1-btn--ghost:hover:not(:disabled) { background: var(--v1-surface-2); transform: none; }
.v1-btn--sm { height: 34px; padding: 0 14px; font-size: 13px; border-radius: var(--v1-r-sm); }
.v1-btn--block { width: 100%; }
.v1-spinner {
  width: 16px; height: 16px; border-radius: 50%; border: 2px solid currentColor;
  border-right-color: transparent; animation: v1-spin 0.7s linear infinite;
}

/* ── Formulieren ─────────────────────────────────────────── */
.v1-form { display: flex; flex-direction: column; gap: 16px; }
.v1-field { display: flex; flex-direction: column; gap: 6px; }
.v1-label { font-size: 13px; font-weight: 600; color: var(--v1-ink); }
.v1-hint { margin: 0; font-size: 12px; color: var(--v1-muted); }
.v1-input {
  width: 100%; box-sizing: border-box; height: 44px; padding: 0 14px; border: 0;
  border-radius: var(--v1-r-md); background: var(--v1-surface-2); color: var(--v1-ink);
  font: 400 15px var(--v1-font); outline: none;
  transition: box-shadow var(--v1-fast) ease, background-color var(--v1-fast) ease;
}
.v1-input::placeholder { color: #8796a5; }
.v1-input:hover { background: #e7edf3; }
.v1-input:focus { background: var(--v1-surface); box-shadow: inset 0 0 0 1px var(--v1-accent), var(--v1-focus); }
.v1-input-wrap { position: relative; }
.v1-input-wrap .v1-input { padding-right: 46px; }
.v1-input-action {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  width: 34px; height: 34px; border: 0; border-radius: var(--v1-r-sm); background: transparent;
  color: var(--v1-muted); display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
}
.v1-input-action:hover { background: var(--v1-line); color: var(--v1-ink); }
.v1-input-action:focus-visible { outline: none; box-shadow: var(--v1-focus); }
.v1-alert { margin: 0; font-size: 13px; line-height: 1.5; padding: 10px 12px; border-radius: var(--v1-r-sm); animation: v1-enter var(--v1-base) var(--v1-ease) both; }
.v1-alert--error { background: var(--v1-danger-soft); color: var(--v1-danger); }
.v1-alert--ok { background: var(--v1-ok-soft); color: var(--v1-ok); }
.v1-link { color: var(--v1-accent-ink); font-size: 13px; font-weight: 600; text-decoration: none; }
.v1-link:hover { text-decoration: underline; text-underline-offset: 3px; }
.v1-link:focus-visible { outline: none; box-shadow: var(--v1-focus); border-radius: 4px; }

/* ── Merk ────────────────────────────────────────────────── */
.v1-mark {
  width: 30px; height: 30px; border-radius: 9px; background: var(--v1-accent); flex-shrink: 0;
  display: inline-grid; place-items: center;
}
.v1-mark > span {
  width: 18px; height: 12px; background-color: #fff;
  -webkit-mask: url('/logo/mono-mark.png') center / contain no-repeat;
  mask: url('/logo/mono-mark.png') center / contain no-repeat;
}

/* ── Laadskelet ──────────────────────────────────────────── */
.v1-skel {
  border-radius: 8px;
  background: linear-gradient(90deg, #e6ebf0 0%, #f3f6f9 50%, #e6ebf0 100%);
  background-size: 200% 100%; animation: v1-shimmer 1.2s linear infinite;
}
.v1-skel-page { display: flex; flex-direction: column; gap: 24px; animation: v1-fade var(--v1-base) ease both; }
.v1-skel-card { background: var(--v1-surface); border-radius: var(--v1-r-lg); box-shadow: var(--v1-shadow-1); padding: 22px 24px; display: flex; flex-direction: column; gap: 14px; }
.v1-skel-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }

/* ── Schil ───────────────────────────────────────────────── */
.v1-shell { display: flex; min-height: 100dvh; background: var(--v1-bg); color: var(--v1-ink); font-family: var(--v1-font); }
.v1-main { flex: 1; min-width: 0; padding: 32px clamp(16px, 4vw, 48px) 56px; }
.v1-main-inner { max-width: 1200px; margin: 0 auto; }
.v1-page-enter { animation: v1-enter var(--v1-slow) var(--v1-ease) both; }

.v1-sidebar {
  width: 248px; flex-shrink: 0; box-sizing: border-box; position: sticky; top: 0; height: 100dvh;
  overflow-y: auto; background: var(--v1-navy); color: var(--v1-on-navy);
  padding: 20px 14px 16px; display: flex; flex-direction: column; gap: 20px;
}
.v1-brand { display: flex; align-items: center; gap: 10px; padding: 0 8px; color: var(--v1-on-navy); text-decoration: none; font-size: 16px; font-weight: 700; letter-spacing: -0.01em; }
.v1-brand:focus-visible { outline: none; box-shadow: var(--v1-focus); border-radius: 8px; }
.v1-org { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--v1-r-md); background: rgba(255, 255, 255, 0.07); }
.v1-org-avatar { width: 28px; height: 28px; border-radius: 8px; background: rgba(255, 255, 255, 0.14); display: grid; place-items: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
.v1-org-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.v1-org-name { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v1-org-status { font-size: 11px; color: var(--v1-on-navy-2); display: flex; align-items: center; gap: 6px; }
.v1-status-dot { width: 6px; height: 6px; border-radius: 3px; background: #94a3b8; }
.v1-status-dot[data-status='live'] { background: #4ade80; }
.v1-status-dot[data-status='testing'] { background: #fbbf24; }
.v1-status-dot[data-status='paused'] { background: #f97066; }
.v1-search {
  display: flex; align-items: center; gap: 10px; width: 100%; height: 36px; padding: 0 12px;
  border: 0; border-radius: var(--v1-r-sm); background: transparent; color: var(--v1-on-navy-3);
  font: 500 13px var(--v1-font); cursor: pointer; transition: background-color var(--v1-fast) ease, color var(--v1-fast) ease;
}
.v1-search:hover { background: rgba(255, 255, 255, 0.05); color: var(--v1-on-navy); }
.v1-search:focus-visible { outline: none; box-shadow: var(--v1-focus); }
.v1-search kbd { margin-left: auto; font: 500 11px var(--v1-font); color: var(--v1-on-navy-3); border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 5px; padding: 1px 5px; }

.v1-nav-section { display: flex; flex-direction: column; gap: 6px; }
.v1-nav-label { font-size: 11px; font-weight: 600; color: var(--v1-on-navy-3); padding: 0 12px; }
.v1-nav-group { position: relative; display: flex; flex-direction: column; gap: 2px; }
.v1-nav-pill {
  position: absolute; left: 0; right: 0; top: 0; height: 40px; border-radius: var(--v1-r-sm);
  background: rgba(255, 255, 255, 0.11); pointer-events: none;
  transition: transform var(--v1-slow) var(--v1-spring), opacity var(--v1-fast) ease;
}
.v1-nav-item {
  position: relative; z-index: 1; display: flex; align-items: center; gap: 12px; height: 40px; padding: 0 12px;
  border-radius: var(--v1-r-sm); color: var(--v1-on-navy-2); text-decoration: none; font-size: 14px; font-weight: 500;
  transition: color var(--v1-fast) ease, background-color var(--v1-fast) ease;
}
.v1-nav-item:hover { color: var(--v1-on-navy); background: rgba(255, 255, 255, 0.05); }
.v1-nav-item[aria-current='page'] { color: var(--v1-on-navy); font-weight: 600; background: transparent; }
.v1-nav-item:focus-visible { outline: none; box-shadow: var(--v1-focus); }
.v1-nav-count { margin-left: auto; min-width: 20px; box-sizing: border-box; padding: 1px 7px; border-radius: 999px; background: var(--v1-accent); color: #fff; font-size: 11px; font-weight: 700; text-align: center; }
.v1-sidebar-foot { margin-top: auto; display: flex; flex-direction: column; gap: 2px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.08); }
.v1-nav-item--quiet { height: 36px; font-size: 13px; color: var(--v1-on-navy-3); width: 100%; border: 0; background: transparent; font-family: var(--v1-font); cursor: pointer; text-align: left; }

.v1-mobilebar { display: none; }
.v1-backdrop { display: none; }

@media (max-width: 900px) {
  .v1-shell { flex-direction: column; }
  .v1-mobilebar {
    display: flex; align-items: center; gap: 12px; position: sticky; top: 0; z-index: 20;
    height: calc(56px + var(--safe-top, 0px)); padding: var(--safe-top, 0px) 16px 0;
    background: var(--v1-navy); color: var(--v1-on-navy);
  }
  .v1-iconbtn {
    width: 40px; height: 40px; border: 0; border-radius: var(--v1-r-sm); background: rgba(255, 255, 255, 0.08);
    color: #fff; display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
    transition: transform var(--v1-fast) var(--v1-ease);
  }
  .v1-iconbtn:active { transform: scale(0.94); }
  .v1-iconbtn:focus-visible { outline: none; box-shadow: var(--v1-focus); }
  .v1-sidebar {
    position: fixed; left: 0; top: 0; bottom: 0; z-index: 1000; width: min(86vw, 300px); height: 100dvh;
    transform: translateX(-100%); transition: transform var(--v1-slow) var(--v1-ease);
    box-shadow: 0 0 64px rgba(0, 0, 0, 0.35); padding-top: calc(20px + var(--safe-top, 0px));
  }
  .v1-shell[data-nav-open='true'] .v1-sidebar { transform: none; }
  .v1-shell[data-nav-open='true'] .v1-backdrop {
    display: block; position: fixed; inset: 0; z-index: 999; border: 0; padding: 0;
    background: rgba(12, 30, 46, 0.4); animation: v1-fade var(--v1-base) ease both;
  }
  .v1-main { padding: 20px 16px 48px; }
}

/* ── Auth-pagina's ───────────────────────────────────────── */
.v1-auth {
  min-height: 100dvh; box-sizing: border-box; display: flex; align-items: center; justify-content: center;
  padding: calc(32px + var(--safe-top, 0px)) 16px calc(32px + var(--safe-bottom, 0px)); background: var(--v1-bg);
}
.v1-auth-card {
  width: 100%; max-width: 400px; box-sizing: border-box; background: var(--v1-surface); border-radius: var(--v1-r-xl);
  box-shadow: var(--v1-shadow-pop); padding: 36px 32px 32px; display: flex; flex-direction: column; gap: 24px;
  animation: v1-enter var(--v1-slow) var(--v1-ease) both;
}
.v1-auth-brand { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 700; letter-spacing: -0.01em; }
.v1-auth-title { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.02em; text-wrap: balance; }
.v1-auth-sub { margin: 6px 0 0; font-size: 14px; line-height: 1.5; color: var(--v1-muted); }
.v1-auth-foot { display: flex; justify-content: center; font-size: 13px; color: var(--v1-muted); }
.v1-row-between { display: flex; justify-content: space-between; align-items: center; gap: 12px; }

@media (prefers-reduced-motion: reduce) {
  .v1-ui *, .v1-ui *::before, .v1-ui *::after {
    animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 2: Schrijf `app/v1/_ui/fonts.ts`**

```ts
import { Plus_Jakarta_Sans } from 'next/font/google';

// Eigen instantie voor V1 met body-gewichten: de root-layout laadt Jakarta
// alleen in 600-800 (voor het V0-wordmark). Los variabelenaam → V0 ongemoeid.
export const v1Font = Plus_Jakarta_Sans({
  variable: '--font-v1',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});
```

- [ ] **Step 3: Schrijf `app/v1/_ui/force-light.tsx`**

```tsx
// V1 is voor de launch alleen licht (spec §2). Het root-bootscript zet
// html.dark op basis van localStorage; dit inline script draait direct daarna
// tijdens het parsen en haalt het weer weg, vóór de eerste paint van de V1-inhoud.
const SCRIPT =
  "try{var r=document.documentElement;r.classList.remove('dark');r.setAttribute('data-theme','light');}catch(e){}";

export function ForceLight() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
```

- [ ] **Step 4: Schrijf `app/v1/layout.tsx`**

```tsx
// Wrapper voor heel /v1 (app, admin, login, auth): laadt de V1-ontwerplaag,
// het V1-font en forceert lichte modus. V0-routes vallen hier buiten.
import './_ui/ui.css';
import type { Metadata } from 'next';
import { v1Font } from './_ui/fonts';
import { ForceLight } from './_ui/force-light';

export const metadata: Metadata = {
  title: 'ChatManta',
};

export default function V1RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`v1-ui ${v1Font.variable}`}>
      <ForceLight />
      {children}
    </div>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: geen fouten.

- [ ] **Step 6: Commit**

```bash
git add app/v1/_ui/ui.css app/v1/_ui/fonts.ts app/v1/_ui/force-light.tsx app/v1/layout.tsx
git commit -m "feat(v1-ui): ontwerplaag Diepzee (tokens, componentklassen, font, lichte modus)"
```

---

### Task 4: `Button` (TDD) en `BrandMark`

**Files:**
- Create: `app/v1/_ui/button.tsx`, `app/v1/_ui/brand-mark.tsx`
- Test: `app/v1/_ui/__tests__/button.test.tsx`

- [ ] **Step 1: Schrijf de falende test**

`app/v1/_ui/__tests__/button.test.tsx`:
```tsx
// Run: node --import tsx --test app/v1/_ui/__tests__/button.test.tsx
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button, buttonClass } from '../button';

test('buttonClass: standaard primary/md', () => {
  assert.equal(buttonClass(), 'v1-btn v1-btn--primary');
});

test('buttonClass: varianten, klein en blok', () => {
  assert.equal(
    buttonClass({ variant: 'secondary', size: 'sm', block: true }),
    'v1-btn v1-btn--secondary v1-btn--sm v1-btn--block',
  );
});

test('Button: type=button tenzij anders opgegeven', () => {
  assert.match(renderToStaticMarkup(<Button>Klik</Button>), /type="button"/);
  assert.match(renderToStaticMarkup(<Button type="submit">Ga</Button>), /type="submit"/);
});

test('Button loading: disabled, aria-busy en spinner', () => {
  const html = renderToStaticMarkup(<Button loading>Bezig</Button>);
  assert.match(html, /disabled=""/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /v1-spinner/);
});

test('Button: extra className wordt toegevoegd', () => {
  assert.match(renderToStaticMarkup(<Button className="x">a</Button>), /class="v1-btn v1-btn--primary x"/);
});
```

- [ ] **Step 2: Draai en zie hem falen**

Run: `node --import tsx --test app/v1/_ui/__tests__/button.test.tsx`
Expected: FAIL met `Cannot find module '../button'`.

- [ ] **Step 3: Implementeer `app/v1/_ui/button.tsx`**

```tsx
import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'sm';

export function buttonClass({
  variant = 'primary',
  size = 'md',
  block = false,
}: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean } = {}): string {
  return ['v1-btn', `v1-btn--${variant}`, size === 'sm' && 'v1-btn--sm', block && 'v1-btn--block']
    .filter(Boolean)
    .join(' ');
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** Toont een spinner en blokkeert de knop zolang een actie loopt. */
  loading?: boolean;
};

export function Button({
  variant,
  size,
  block,
  loading = false,
  className,
  disabled,
  type,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[buttonClass({ variant, size, block }), className].filter(Boolean).join(' ')}
    >
      {loading ? <span className="v1-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
```

- [ ] **Step 4: Draai en zie hem slagen**

Run: `node --import tsx --test app/v1/_ui/__tests__/button.test.tsx`
Expected: 5 tests `ok`.

- [ ] **Step 5: Schrijf `app/v1/_ui/brand-mark.tsx`**

```tsx
// ChatManta-beeldmerk: het bestaande mono-logo (public/logo/mono-mark.png) als
// wit masker op het accentvlak. Decoratief naast de tekst "ChatManta".
export function BrandMark() {
  return (
    <span className="v1-mark" aria-hidden="true">
      <span />
    </span>
  );
}
```

- [ ] **Step 6: Unit-suite + typecheck**

Run: `npm run test:unit && npm run typecheck`
Expected: groen (de runner pakt `button.test.tsx` op in de default-pass omdat hij `react-dom/server` importeert).

- [ ] **Step 7: Commit**

```bash
git add app/v1/_ui/button.tsx app/v1/_ui/brand-mark.tsx app/v1/_ui/__tests__/button.test.tsx
git commit -m "feat(v1-ui): Button en BrandMark"
```

---

### Task 5: Laadskeletten (`Skeleton`, `PageSkeleton`) + `loading.tsx` per route

**Files:**
- Create: `app/v1/_ui/skeleton.tsx`
- Create: `app/v1/app/loading.tsx`, `app/v1/app/gesprekken/loading.tsx`, `app/v1/app/gesprekken/[id]/loading.tsx`, `app/v1/app/kennisbank/loading.tsx`, `app/v1/app/contactverzoeken/loading.tsx`, `app/v1/app/widget/loading.tsx`, `app/v1/app/instellingen/loading.tsx`, `app/v1/app/account/loading.tsx`, `app/v1/app/feedback/loading.tsx`, `app/v1/app/preview/loading.tsx`, `app/v1/app/quiz/loading.tsx`

Achtergrond (Next 16-docs `01-app/01-getting-started/04-linking-and-navigating.md`): dynamische routes zonder `loading.tsx` worden niet geprefetcht en tonen niets tot de server klaar is. Met `loading.tsx` wordt het skelet geprefetcht en direct getoond.

- [ ] **Step 1: Schrijf `app/v1/_ui/skeleton.tsx`**

```tsx
import type { CSSProperties } from 'react';

export function Skeleton({ width = '100%', height = 14, style }: { width?: CSSProperties['width']; height?: number; style?: CSSProperties }) {
  return <div className="v1-skel" style={{ width, height, ...style }} />;
}

export type PageSkeletonVariant = 'overview' | 'list' | 'form' | 'detail' | 'chat';

function Lines({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={16} width={i === count - 1 ? '60%' : '100%'} />
      ))}
    </>
  );
}

/** Laadskelet in de vorm van het paginatype; gebruikt door loading.tsx. */
export function PageSkeleton({ variant }: { variant: PageSkeletonVariant }) {
  return (
    <div className="v1-skel-page" role="status" aria-live="polite">
      <span className="v1-sr-only">Pagina laden…</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Skeleton width={120} height={12} />
        <Skeleton width="38%" height={30} />
      </div>

      {variant === 'overview' && (
        <>
          <div className="v1-skel" style={{ height: 132, borderRadius: 22 }} />
          <div className="v1-skel-card" style={{ flexDirection: 'row', gap: 24 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Skeleton width="50%" height={12} />
                <Skeleton width="40%" height={28} />
              </div>
            ))}
          </div>
          <div className="v1-skel-grid">
            <div className="v1-skel-card"><Lines count={5} /></div>
            <div className="v1-skel-card"><Lines count={5} /></div>
          </div>
        </>
      )}

      {variant === 'list' && (
        <>
          <Skeleton width="45%" height={36} />
          <div className="v1-skel-card"><Lines count={7} /></div>
        </>
      )}

      {variant === 'form' && (
        <>
          <div className="v1-skel-card"><Lines count={4} /></div>
          <div className="v1-skel-card"><Lines count={3} /></div>
        </>
      )}

      {variant === 'detail' && (
        <>
          <div className="v1-skel-card"><Lines count={2} /></div>
          <div className="v1-skel-card"><Lines count={8} /></div>
        </>
      )}

      {variant === 'chat' && <div className="v1-skel" style={{ height: 480, borderRadius: 20 }} />}
    </div>
  );
}
```

- [ ] **Step 2: Schrijf de 11 `loading.tsx`-bestanden**

Elk bestand heeft precies deze vorm, met de variant uit de tabel:

```tsx
import { PageSkeleton } from '@/app/v1/_ui/skeleton';

export default function Loading() {
  return <PageSkeleton variant="overview" />;
}
```

| Bestand | variant |
|---|---|
| `app/v1/app/loading.tsx` | `overview` |
| `app/v1/app/gesprekken/loading.tsx` | `list` |
| `app/v1/app/gesprekken/[id]/loading.tsx` | `detail` |
| `app/v1/app/kennisbank/loading.tsx` | `list` |
| `app/v1/app/contactverzoeken/loading.tsx` | `list` |
| `app/v1/app/widget/loading.tsx` | `form` |
| `app/v1/app/instellingen/loading.tsx` | `form` |
| `app/v1/app/account/loading.tsx` | `form` |
| `app/v1/app/feedback/loading.tsx` | `form` |
| `app/v1/app/preview/loading.tsx` | `chat` |
| `app/v1/app/quiz/loading.tsx` | `detail` |

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: geen fouten.

- [ ] **Step 4: Commit**

```bash
git add app/v1/_ui/skeleton.tsx $(git ls-files --others --exclude-standard app/v1/app | grep '/loading\.tsx$')
git diff --cached --name-only | grep -c 'loading\.tsx$'
git commit -m "feat(v1-ui): laadskeletten + loading.tsx voor alle /v1/app-routes"
```
Expected bij de tweede regel: `11`. Anders: ontbrekende bestanden expliciet toevoegen vóór de commit.

---

### Task 6: Zijbalk, uitloggen, zoek-trigger

**Files:**
- Create: `app/v1/app/_shell/sign-out-button.tsx`
- Rewrite: `app/v1/app/_shell/sidebar.tsx`
- Modify: `app/v1/app/_shell/search-trigger.tsx` (ROUTES-lijst en de trigger-`<button>`)

- [ ] **Step 1: Schrijf `app/v1/app/_shell/sign-out-button.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/v1/client';

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await createClient().auth.signOut();
    router.push('/v1/login');
    router.refresh();
  }

  return (
    <button type="button" className="v1-nav-item v1-nav-item--quiet" onClick={signOut} disabled={busy}>
      <LogOut size={16} strokeWidth={1.8} aria-hidden="true" />
      {busy ? 'Uitloggen…' : 'Uitloggen'}
    </button>
  );
}
```

- [ ] **Step 2: Herschrijf `app/v1/app/_shell/sidebar.tsx`** (volledige inhoud)

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  MessagesSquare,
  Library,
  PhoneCall,
  Code2,
  Settings2,
  CircleUserRound,
  MessageSquarePlus,
} from 'lucide-react';
import type { ChatbotStatus } from '@/lib/v0/klantendashboard/types';
import { BrandMark } from '@/app/v1/_ui/brand-mark';
import { activeIndex, formatCount, initials, NAV_ITEM_PITCH, STATUS_LABEL } from '@/app/v1/_ui/nav';
import { V1SearchTrigger } from './search-trigger';
import { SignOutButton } from './sign-out-button';

// Donkere V1-zijbalk (spec §7.1). Puur presentationeel: tellers en status komen
// uit de layout (getShellCounts). Twee groepen, elk met een eigen glijdende
// markering achter het actieve item.

type NavEntry = { href: string; label: string; icon: React.ReactNode; exact?: boolean; count?: number };

const ICON = { size: 18, strokeWidth: 1.8, 'aria-hidden': true } as const;

function NavGroup({
  items,
  activeHref,
  onNavigate,
}: {
  items: NavEntry[];
  activeHref: string;
  onNavigate: (href: string) => void;
}) {
  const idx = activeIndex(activeHref, items);
  return (
    <div className="v1-nav-group">
      <div
        className="v1-nav-pill"
        aria-hidden="true"
        style={{ transform: `translateY(${Math.max(idx, 0) * NAV_ITEM_PITCH}px)`, opacity: idx < 0 ? 0 : 1 }}
      />
      {items.map((item, i) => {
        const count = formatCount(item.count);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="v1-nav-item"
            aria-current={i === idx ? 'page' : undefined}
            onClick={() => onNavigate(item.href)}
          >
            {item.icon}
            <span>{item.label}</span>
            {count ? (
              <span className="v1-nav-count" aria-label={`${count} open`}>
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

export function V1Sidebar({
  orgName,
  chatbotStatus,
  unansweredCount = 0,
  showContactRequests = false,
  contactRequestsCount = 0,
  onNavigate,
}: {
  orgName: string;
  chatbotStatus: ChatbotStatus;
  unansweredCount?: number;
  showContactRequests?: boolean;
  contactRequestsCount?: number;
  /** Wordt aangeroepen bij elke menuklik (sluit het mobiele menu). */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  // Optimistisch: de markering verspringt direct bij de klik, nog vóór de
  // navigatie klaar is. `from` onthoudt op welk pad er geklikt is; zodra
  // pathname verandert (navigatie klaar, of weg via een andere link) is de
  // pending-waarde ongeldig en wint pathname weer.
  const [pending, setPending] = useState<{ href: string; from: string } | null>(null);
  const activeHref = pending && pending.from === pathname ? pending.href : pathname;

  const handleNavigate = (href: string) => {
    setPending({ href, from: pathname });
    onNavigate?.();
  };

  const daily: NavEntry[] = [
    { href: '/v1/app', label: 'Overzicht', exact: true, icon: <LayoutDashboard {...ICON} /> },
    { href: '/v1/app/gesprekken', label: 'Gesprekken', count: unansweredCount, icon: <MessagesSquare {...ICON} /> },
    { href: '/v1/app/kennisbank', label: 'Kennisbank', icon: <Library {...ICON} /> },
    ...(showContactRequests
      ? [{ href: '/v1/app/contactverzoeken', label: 'Contactverzoeken', count: contactRequestsCount, icon: <PhoneCall {...ICON} /> }]
      : []),
    { href: '/v1/app/widget', label: 'Widget', icon: <Code2 {...ICON} /> },
  ];
  const settings: NavEntry[] = [
    { href: '/v1/app/instellingen', label: 'Chatbot', icon: <Settings2 {...ICON} /> },
    { href: '/v1/app/account', label: 'Account', icon: <CircleUserRound {...ICON} /> },
  ];

  return (
    <aside className="v1-sidebar" aria-label="Hoofdmenu" id="v1-sidebar">
      <Link href="/v1/app" className="v1-brand" onClick={() => handleNavigate('/v1/app')}>
        <BrandMark />
        ChatManta
      </Link>

      <div className="v1-org">
        <span className="v1-org-avatar" aria-hidden="true">
          {initials(orgName)}
        </span>
        <span className="v1-org-text">
          <span className="v1-org-name">{orgName || 'Je organisatie'}</span>
          <span className="v1-org-status">
            <span className="v1-status-dot" data-status={chatbotStatus} aria-hidden="true" />
            {STATUS_LABEL[chatbotStatus]}
          </span>
        </span>
      </div>

      <V1SearchTrigger />

      <nav aria-label="Dagelijks" className="v1-nav-section">
        <NavGroup items={daily} activeHref={activeHref} onNavigate={handleNavigate} />
      </nav>

      <nav aria-label="Instellingen" className="v1-nav-section">
        <div className="v1-nav-label">Instellingen</div>
        <NavGroup items={settings} activeHref={activeHref} onNavigate={handleNavigate} />
      </nav>

      <div className="v1-sidebar-foot">
        <Link
          href="/v1/app/feedback"
          className="v1-nav-item v1-nav-item--quiet"
          aria-current={pathname.startsWith('/v1/app/feedback') ? 'page' : undefined}
          onClick={() => handleNavigate('/v1/app/feedback')}
        >
          <MessageSquarePlus size={16} strokeWidth={1.8} aria-hidden="true" />
          Feedback geven
        </Link>
        <SignOutButton />
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Pas `app/v1/app/_shell/search-trigger.tsx` aan**

3a. Vervang de `ROUTES`-array (regels 10-20) door:
```ts
const ROUTES: { href: string; label: string; hint: string }[] = [
  { href: '/v1/app', label: 'Overzicht', hint: 'Hoe je chatbot het doet' },
  { href: '/v1/app/gesprekken', label: 'Gesprekken', hint: 'Alle conversaties' },
  { href: '/v1/app/kennisbank', label: 'Kennisbank', hint: "Pagina's, documenten, Q&A" },
  { href: '/v1/app/contactverzoeken', label: 'Contactverzoeken', hint: 'Verzoeken van websitebezoekers' },
  { href: '/v1/app/widget', label: 'Widget', hint: 'Uiterlijk, installatie en status' },
  { href: '/v1/app/preview', label: 'Bekijk chatbot', hint: 'Test je chatbot zoals bezoekers hem zien' },
  { href: '/v1/app/instellingen', label: 'Chatbot-instellingen', hint: 'Toon, antwoorden, contact' },
  { href: '/v1/app/account', label: 'Account', hint: 'Inloggegevens en verbruik' },
  { href: '/v1/app/feedback', label: 'Feedback geven', hint: 'Meld een probleem of doe een voorstel' },
];
```

3b. Vervang de trigger-`<button>` (het eerste element binnen de fragment-return, van `<button` t/m de sluitende `</button>` vóór `{open && (`) door:
```tsx
      <button type="button" onClick={openPalette} className="v1-search">
        <Search size={15} strokeWidth={1.8} aria-hidden="true" />
        <span>Zoeken</span>
        <kbd>⌘K</kbd>
      </button>
```
De palette-dialoog (`{open && (…)}`) blijft ongewijzigd: die gebruikt `--klant-*`-tokens, die beschikbaar blijven doordat de schil `data-klant-scope` draagt (Task 7).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: fouten **alleen** in `app/v1/app/layout.tsx` (die geeft nog de oude props door en importeert de topbar). Die lossen we in Task 7 op. Geen andere fouten.

- [ ] **Step 5: Commit**

```bash
git add app/v1/app/_shell/sidebar.tsx app/v1/app/_shell/sign-out-button.tsx app/v1/app/_shell/search-trigger.tsx
git commit -m "feat(v1-ui): donkere zijbalk met glijdende markering, uitloggen en zoek-trigger"
```

---

### Task 7: Schil-frame, layout, page-template, bovenbalk weg

**Files:**
- Create: `app/v1/app/_shell/shell-frame.tsx`, `app/v1/app/template.tsx`
- Modify: `app/v1/app/layout.tsx` (return-blok + imports)
- Delete: `app/v1/app/_shell/topbar.tsx`

- [ ] **Step 1: Schrijf `app/v1/app/_shell/shell-frame.tsx`**

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import type { ChatbotStatus } from '@/lib/v0/klantendashboard/types';
import { BrandMark } from '@/app/v1/_ui/brand-mark';
import { V1Sidebar } from './sidebar';

// Client-schil: houdt alleen de open/dicht-state van het mobiele menu bij.
// data-klant-scope blijft staan zodat de (nog niet herontworpen) pagina's en de
// zoek-palette hun --klant-*-tokens houden tot golf 3.
export function ShellFrame({
  orgName,
  chatbotStatus,
  unansweredCount,
  showContactRequests,
  contactRequestsCount,
  children,
}: {
  orgName: string;
  chatbotStatus: ChatbotStatus;
  unansweredCount: number;
  showContactRequests: boolean;
  contactRequestsCount: number;
  children: React.ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="v1-shell" data-klant-scope data-nav-open={navOpen ? 'true' : 'false'}>
      <header className="v1-mobilebar">
        <button
          type="button"
          className="v1-iconbtn"
          aria-label="Menu openen"
          aria-controls="v1-sidebar"
          aria-expanded={navOpen}
          onClick={() => setNavOpen(true)}
        >
          <Menu size={20} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <Link href="/v1/app" className="v1-brand" style={{ padding: 0 }}>
          <BrandMark />
          ChatManta
        </Link>
      </header>

      <button
        type="button"
        className="v1-backdrop"
        aria-label="Menu sluiten"
        tabIndex={navOpen ? 0 : -1}
        onClick={() => setNavOpen(false)}
      />

      <V1Sidebar
        orgName={orgName}
        chatbotStatus={chatbotStatus}
        unansweredCount={unansweredCount}
        showContactRequests={showContactRequests}
        contactRequestsCount={contactRequestsCount}
        onNavigate={() => setNavOpen(false)}
      />

      <main className="v1-main">
        <div className="v1-main-inner">{children}</div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Pas `app/v1/app/layout.tsx` aan**

2a. Vervang de imports van sidebar, topbar en TweaksPanel:
```tsx
import { V1Sidebar } from './_shell/sidebar';
import { V1Topbar } from './_shell/topbar';
import { TweaksPanel } from '@/app/klantendashboard/components/tweaks/tweaks-panel';
```
door:
```tsx
import { ShellFrame } from './_shell/shell-frame';
```

2b. Verwijder de variabele `negativeFeedbackCount` (declaratie `let negativeFeedbackCount = 0;` en de toewijzing `negativeFeedbackCount = counts.negativeFeedbackCount;`): negatieve feedback is verborgen (spec bijlage A).

2c. Vervang het hele `return (…)`-blok door:
```tsx
  return (
    <ShellFrame
      orgName={orgName}
      chatbotStatus={chatbotStatus}
      unansweredCount={unansweredCount}
      showContactRequests={contactRequestsEnabled}
      contactRequestsCount={contactRequestsNewCount}
    >
      {children}
    </ShellFrame>
  );
```

De import `import '../../klantendashboard/klant.css';` bovenaan **blijft** (de pagina's gebruiken die klassen nog tot golf 3).

- [ ] **Step 3: Schrijf `app/v1/app/template.tsx`**

```tsx
// Templates remounten bij elke navigatie (layouts niet): zo krijgt elke nieuwe
// pagina een korte fade + 6px-omhoog-inkomst (spec §5).
export default function V1AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="v1-page-enter">{children}</div>;
}
```

- [ ] **Step 4: Verwijder de bovenbalk**

```bash
git rm app/v1/app/_shell/topbar.tsx
grep -rn "_shell/topbar\|V1Topbar" app/v1/app || echo "geen verwijzingen meer"
```
Expected: `geen verwijzingen meer`.

- [ ] **Step 5: Typecheck + lint op de geraakte map**

Run: `npm run typecheck && npx eslint app/v1/app/_shell app/v1/app/layout.tsx app/v1/app/template.tsx app/v1/_ui app/v1/layout.tsx`
Expected: geen fouten.

- [ ] **Step 6: Commit**

```bash
git add app/v1/app/_shell/shell-frame.tsx app/v1/app/template.tsx app/v1/app/layout.tsx
git commit -m "feat(v1-ui): nieuwe schil (mobiel menu, geen bovenbalk) + pagina-inkomst"
```

---

### Task 8: `AuthCard` + login- en auth-pagina's

**Files:**
- Create: `app/v1/_ui/auth-card.tsx`
- Rewrite: `app/v1/login/v1-sign-in-card.tsx`, `app/v1/auth/forgot-password/forgot-password-form.tsx`, `app/v1/auth/set-password/set-password-form.tsx`

Auth-logica blijft exact gelijk (zelfde Supabase-calls, zelfde redirects, zelfde `name`-attributen `email`/`password` zodat `tests/v1/*.spec.ts` blijven werken). Alleen de vormgeving verandert, plus Nederlandse foutteksten via `authErrorMessage`.

- [ ] **Step 1: Schrijf `app/v1/_ui/auth-card.tsx`**

```tsx
import type { ReactNode } from 'react';
import { BrandMark } from './brand-mark';

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="v1-auth">
      <div className="v1-auth-card">
        <div className="v1-auth-brand">
          <BrandMark />
          ChatManta
        </div>
        <div>
          <h1 className="v1-auth-title">{title}</h1>
          {subtitle ? <p className="v1-auth-sub">{subtitle}</p> : null}
        </div>
        {children}
        {footer ? <div className="v1-auth-foot">{footer}</div> : null}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Herschrijf `app/v1/login/v1-sign-in-card.tsx`** (volledige inhoud)

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/v1/client';
import { AuthCard } from '@/app/v1/_ui/auth-card';
import { Button } from '@/app/v1/_ui/button';
import { authErrorMessage } from '@/app/v1/_ui/auth-messages';

// V1-login in de Diepzee-stijl (spec §7.8). Auth-flow ongewijzigd t.o.v. de
// vorige versie: signInWithPassword → /v1/app.
export function V1SignInCard({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) {
      setError(authErrorMessage(signInError.message));
      return;
    }
    router.push('/v1/app');
    router.refresh();
  }

  return (
    <AuthCard title="Welkom terug" subtitle="Log in om je chatbot te beheren.">
      <form onSubmit={onSubmit} className="v1-form" noValidate>
        <div className="v1-field">
          <label htmlFor="v1-login-email" className="v1-label">E-mailadres</label>
          <input
            id="v1-login-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="v1-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="v1-field">
          <div className="v1-row-between">
            <label htmlFor="v1-login-password" className="v1-label">Wachtwoord</label>
            <Link href="/v1/auth/forgot-password" className="v1-link">Wachtwoord vergeten?</Link>
          </div>
          <div className="v1-input-wrap">
            <input
              id="v1-login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              className="v1-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="v1-input-action"
              aria-label={showPassword ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            </button>
          </div>
        </div>
        {error ? <p className="v1-alert v1-alert--error" role="alert">{error}</p> : null}
        <Button type="submit" block loading={busy}>
          {busy ? 'Inloggen…' : 'Inloggen'}
        </Button>
      </form>
    </AuthCard>
  );
}
```

- [ ] **Step 3: Herschrijf `app/v1/auth/forgot-password/forgot-password-form.tsx`** (volledige inhoud)

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/v1/client';
import { AuthCard } from '@/app/v1/_ui/auth-card';
import { Button } from '@/app/v1/_ui/button';
import { authErrorMessage } from '@/app/v1/_ui/auth-messages';

// "Wachtwoord vergeten" in de Diepzee-stijl. Flow ongewijzigd:
// resetPasswordForEmail(email); bij succes altijd dezelfde bevestiging (verraadt
// niet of het adres bestaat).
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email);
    setBusy(false);
    if (resetError) {
      setError(authErrorMessage(resetError.message));
      return;
    }
    setSent(true);
  }

  const backToLogin = <Link href="/v1/login" className="v1-link">Terug naar inloggen</Link>;

  if (sent) {
    return (
      <AuthCard
        title="Check je inbox"
        subtitle="Als dit e-mailadres bij ons bekend is, ontvang je binnen een paar minuten een link om een nieuw wachtwoord te kiezen."
        footer={backToLogin}
      >
        <p className="v1-alert v1-alert--ok" role="status">E-mail verstuurd naar {email}.</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Wachtwoord vergeten"
      subtitle="Vul je e-mailadres in. We sturen je een link om een nieuw wachtwoord te kiezen."
      footer={backToLogin}
    >
      <form onSubmit={onSubmit} className="v1-form" noValidate>
        <div className="v1-field">
          <label htmlFor="v1-forgot-email" className="v1-label">E-mailadres</label>
          <input
            id="v1-forgot-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="v1-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {error ? <p className="v1-alert v1-alert--error" role="alert">{error}</p> : null}
        <Button type="submit" block loading={busy}>
          {busy ? 'Versturen…' : 'Stuur link'}
        </Button>
      </form>
    </AuthCard>
  );
}
```

- [ ] **Step 4: Herschrijf `app/v1/auth/set-password/set-password-form.tsx`** (volledige inhoud)

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/v1/client';
import { AuthCard } from '@/app/v1/_ui/auth-card';
import { Button } from '@/app/v1/_ui/button';
import { authErrorMessage } from '@/app/v1/_ui/auth-messages';

// Wachtwoord instellen na de invite-/reset-link (sessie is gezet door
// /v1/auth/confirm). Validatie + flow ongewijzigd.
export function SetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Wachtwoord moet minstens 8 tekens zijn.');
      return;
    }
    if (password !== confirm) {
      setError('De wachtwoorden komen niet overeen.');
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(authErrorMessage(updateError.message));
      return;
    }
    router.push('/v1/app');
    router.refresh();
  }

  return (
    <AuthCard title="Kies je wachtwoord" subtitle="Minstens 8 tekens. Hiermee log je voortaan in.">
      <form onSubmit={onSubmit} className="v1-form" noValidate>
        <div className="v1-field">
          <label htmlFor="v1-new-password" className="v1-label">Nieuw wachtwoord</label>
          <div className="v1-input-wrap">
            <input
              id="v1-new-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={8}
              className="v1-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="v1-input-action"
              aria-label={showPassword ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            </button>
          </div>
        </div>
        <div className="v1-field">
          <label htmlFor="v1-confirm-password" className="v1-label">Herhaal wachtwoord</label>
          <input
            id="v1-confirm-password"
            name="confirm"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            className="v1-input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {error ? <p className="v1-alert v1-alert--error" role="alert">{error}</p> : null}
        <Button type="submit" block loading={busy}>
          {busy ? 'Opslaan…' : 'Wachtwoord opslaan'}
        </Button>
      </form>
    </AuthCard>
  );
}
```

- [ ] **Step 5: Controleer dat de oude achtergrond nergens meer vanuit V1 gebruikt wordt**

```bash
grep -rn "LoginBackground\|motion/react" app/v1 || echo "V1 schoon"
```
Expected: `V1 schoon`. (`app/components/ui/login-background` zelf blijft bestaan: V0 gebruikt hem.)

- [ ] **Step 6: Typecheck + lint**

Run: `npm run typecheck && npx eslint app/v1/login app/v1/auth app/v1/_ui`
Expected: geen fouten.

- [ ] **Step 7: Commit**

```bash
git add app/v1/_ui/auth-card.tsx app/v1/login/v1-sign-in-card.tsx app/v1/auth/forgot-password/forgot-password-form.tsx app/v1/auth/set-password/set-password-form.tsx
git commit -m "feat(v1-ui): login- en auth-pagina's in de Diepzee-stijl"
```

---

### Task 9: Verificatie (build, gedrag, visueel, V0-regressie)

**Files:** geen codewijziging (alleen fixes als iets faalt, met eigen commit).

- [ ] **Step 1: Volledige checks**

```bash
npm run typecheck && npm run test:unit && npm run lint
```
Expected: alles groen. Lint-fouten in bestanden die we niet raakten: noteren, niet fixen.

- [ ] **Step 2: Productiebuild** (Windows: eerst `.next/` weg)

PowerShell:
```powershell
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npm run build
```
Expected: `✓ Compiled successfully` en geen fouten. Vooral letten op fouten rond `next/font` in `app/v1/_ui/fonts.ts` en `loading.tsx`.

- [ ] **Step 3: Dev-server op een vrije poort** (3000/3001 zijn mogelijk bezet door andere worktrees)

```bash
npx next dev -p 3005
```
(Achtergrond; wacht tot `Ready`.)

- [ ] **Step 4: Gedrag checken met een Playwright-script** (in de scratchpad, niet in de repo)

Script logt in als `member@example.com` (wachtwoord uit `V1_SEED_MEMBER_PW` in `.env.local`) op `http://localhost:3005` en controleert:
1. `/v1/login` toont "Welkom terug"; fout wachtwoord → melding "E-mailadres of wachtwoord klopt niet."
2. Na inloggen: `/v1/app` toont de donkere zijbalk (`.v1-sidebar`, achtergrond `rgb(12, 30, 46)`), géén `.klant-topbar`.
3. Klik op "Kennisbank": binnen 200 ms is het item `aria-current="page"` én is óf `[role=status] .v1-sr-only` (skelet) óf de kennisbank-inhoud zichtbaar.
4. Elke route uit Task 5 laadt zonder console-errors.
5. Viewport 390×844: `.v1-mobilebar` zichtbaar, zijbalk buiten beeld; klik "Menu openen" → zijbalk in beeld; klik een menu-item → menu sluit.
6. "Uitloggen" → terug op `/v1/login`.
7. Met `localStorage.setItem('chatmanta-theme','dark')` + herladen: `/v1/app` heeft géén `dark`-class op `<html>`.

Maak van elke V1-route screenshots op 1440×900 en 390×844 en bekijk ze naast het canvas-bord.

- [ ] **Step 5: V0-regressie**

Screenshots van `/klantendashboard` en `/admindashboard` (V0-demo-login via `V0_DEMO_PASSWORD`) en van `/widget-test.html` op deze branch én op `../chatmanta` (main, eigen dev-server-poort). Vergelijk: ze moeten gelijk zijn.

- [ ] **Step 6: Bestaande V1-e2e**

```bash
npx playwright test tests/v1/auth.spec.ts --project=v1
```
Expected: groen, of exact dezelfde failures als op `main` (draai dezelfde test ook op `../chatmanta` om dat te bewijzen). Nieuwe failures door onze wijziging: fixen.

- [ ] **Step 7: Stop de dev-server en commit eventuele fixes**

```bash
git status --short
```
Expected: schoon (of alleen bewust gecommitte fixes).

---

### Task 10: PR

- [ ] **Step 1: Branch-check en push**

```bash
git rev-parse --abbrev-ref HEAD
git push -u origin feat/seb/v1-ui-redesign
```

- [ ] **Step 2: PR aanmaken met de template**

```bash
gh pr create --title "feat(v1-ui): golf 1, ontwerplaag Diepzee + nieuwe schil + laadschermen + auth" --body-file <bestand>
```
Vul `.github/pull_request_template.md` volledig in (Nederlands, voor iemand die niet bij het gesprek was): wat/waarom, screenshots vóór/na (desktop + mobiel), de drie bewuste afwijkingen uit de kop van dit plan, V0-regressiebewijs, en de checks uit Task 9. Eindig met `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 3: Niet mergen.** Meld de PR-link aan Seb; mergen gebeurt na zijn review.
