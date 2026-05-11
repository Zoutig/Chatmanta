# V0 Abyss Refined — visuele identiteit + Classic/Refined style-toggle

**Datum:** 2026-05-11
**Status:** Goedgekeurd, klaar voor implementatieplan
**Scope:** alleen V0 demo-pagina (`app/page.tsx` en componenten daaronder)

## Doel

ChatManta heeft een werkende V0 sandbox-UI ("Abyss" — donker navy + cyan accent), maar voelt nog wat generiek. We willen het merk een rustige, professionele identiteit geven (Linear/Stripe/Vercel-territory) zonder de structuur om te gooien.

Tegelijk wil Sebastiaan tijdens testen kunnen wisselen tussen de **huidige** opmaak ("Classic") en de **nieuwe** opmaak ("Refined") om side-by-side te vergelijken. De toggle blijft minimaal één RAG-tuning-cyclus aanwezig zodat we de keuze kunnen valideren.

Doelgroep: Sebastiaan + Niels intern. Niet voor klanten.

## Beslissing

Eén codebase, twee co-existerende visuele systemen die op token-niveau verschillen. Geen JSX-branches, geen componentforks.

Toggle in Settings-tab: **Klassiek (huidig)** / **Refined (nieuw)**. Dark/light toggle blijft in topbar zoals nu.

Default: **Classic** (huidig). Refined is opt-in via Settings zodat we 'm bewust naast Classic kunnen ervaren tijdens de A/B-test.

## Buiten scope

Bewust níet in deze iteratie:

- **Geen layout-wijzigingen** — sidebar (272px) + main + right panel (380px) grid blijft.
- **Geen nieuwe componenten of features** — empty state, sources view, evals, latency, prompt etc. blijven functioneel identiek.
- **Geen wijziging aan logo/wordmark** — bestaande `public/logo/*` assets blijven.
- **Geen widget-werk** — widget krijgt eigen design (V1 fase 6, blueprint).
- **Geen marketing-site** — `chatmanta.nl` blijft de V0 sandbox.
- **Geen multi-tenant policy of auth-wijziging** — V0 sandbox-disclaimer blijft van kracht.
- **Geen ‘refined’ doortrekken naar `app/login/`** — login keeps current Abyss tokens.

## Architectuur

### Style-mechanisme

Tweede dimensie naast theme. Twee waardes: `'classic' | 'refined'`.

`<html>` krijgt twee attributen:

```html
<html data-theme="dark|light" data-style="classic|refined" class="dark?">
```

- `:root` in `globals.css` blijft *Classic* (huidige tokens). Niets verandert voor Classic-users.
- Nieuwe block `[data-style="refined"]` (+ `[data-style="refined"]:not(.dark)` voor light) overschrijft alléén tokens en regels die veranderen.

Resolve-volgorde elke render:

1. Lees `localStorage['chatmanta-style']` → fallback `'refined'` (de default).
2. Zet `document.documentElement.setAttribute('data-style', resolved)`.
3. Sync via inline boot-script in `app/layout.tsx` zodat het attribuut vóór paint staat (zelfde patroon als bestaande `chatmanta-theme` boot).

### Persistentie

- LocalStorage key: `chatmanta-style`
- Waardes: `'classic' | 'refined'`
- Default: `'classic'`
- Geen server-state, geen org-binding (V0 sandbox-discipline). Per browser-profiel.

### Hook

Nieuw bestand `lib/v0/hooks/use-style-mode.ts` — mirror van bestaande `lib/v0/hooks/use-theme.ts` qua patroon:

```ts
type StyleMode = 'classic' | 'refined';

export function useStyleMode(): { mode: StyleMode; set: (m: StyleMode) => void };
```

Implementatie-detail: zelfde `useSyncExternalStore`-stijl of state-mirror als `useTheme`, met SSR-fallback naar de default. Bij `set()`:

1. Schrijf naar localStorage.
2. Mutate `document.documentElement` `data-style` attribute direct (zonder reload).
3. Dispatch state-update zodat consumenten re-renderen indien nodig.

### Boot-script uitbreiding

`app/layout.tsx` `themeBootScript` wordt uitgebreid met een zusje voor style-mode. Twee onafhankelijke try-blocks zodat één failure niet de andere blokkeert:

```js
// Bestaand: theme
(function() { /* … bestaande theme-resolve … */ })();
// Nieuw: style
(function() {
  try {
    var k = 'chatmanta-style';
    var s = localStorage.getItem(k);
    if (s !== 'classic' && s !== 'refined') s = 'classic';
    document.documentElement.setAttribute('data-style', s);
  } catch (e) {}
})();
```

### CSS-overrides (Refined)

Nieuwe sectie in `app/globals.css` na de bestaande `:root` + `html:not(.dark)` blocks. Bevat alleen overrides; alles anders erft van Classic.

Concrete deltas op token-niveau (richting, exacte hex-waardes worden tijdens implementatie afgestemd op een eval-screenshot):

**Dark + Refined:**
- Ambient body-gradient: ~50% intensity, kleinere ellipsen, minder pront cyan
- `--border` iets gedempter (≈ 6% alpha i.p.v. 8%)
- `--border-strong` iets duidelijker voor sectie-scheidingen
- `--accent-glow` opacity gehalveerd — cyan wordt minder "glowy"
- Nieuwe ruimte-tokens (`--space-msg-gap`, `--space-section`) of directe spacing-tweaks in componentregels — meer ademruimte tussen messages en rond composer

**Light + Refined:**
- `--accent` van `#0891b2` naar iets zachtere petrol-tint (richting `#0e7c9a` of `#0f7894`, valideren in eval)
- Betere contrast op `--fg-muted` voor leesbaarheid op witte bg
- `--surface` iets minder transparant, meer als card

**Typografie (beide themes):**
- Tracking op `.label` / uppercase elementen: `0.06em`–`0.08em`
- Heading scale strakker: 22 / 18 / 15 / 13 in plaats van vrij gebruik
- Lijnhoogte `1.6` op antwoord-body (i.p.v. globale `1.5`)

**Messages (beide themes):**
- User-bubble: cyan-tint zonder `box-shadow` glow
- AI-bericht: geen bubble (alleen tekst + avatar), citaten als kleine inline chip `[1]`
- Spacing tussen user → AI iets ruimer (`32px` i.p.v. `24px`)

> **Belangrijk:** alle Refined-overrides leven binnen `[data-style="refined"]` selectors. Geen wijziging aan Classic-rules. Exacte waardes worden in implementatie-PR vastgelegd na visuele eval.

### Settings-UI

`app/components/settings-view.tsx` krijgt een nieuwe sectie bovenaan (boven Bot-versie), zodat de A/B-test prominent is tijdens deze cyclus:

```
┌────────────────────────────────────┐
│ Opmaak (A/B-test)                  │
│ ┌─────────────┬────────────────┐   │
│ │ Klassiek ✓  │ Refined        │   │
│ └─────────────┴────────────────┘   │
│ Wissel om de nieuwe stijl te       │
│ vergelijken met de huidige.        │
└────────────────────────────────────┘
```

Implementatie: zelfde `threshold-presets`-pattern als HyDE-modus (radio-row als segmented control), om visuele consistentie te houden.

Props-flow: SettingsView krijgt `styleMode` + `onStyleModeChange` via right-panel zoals nu met `hydeMode`. Of: SettingsView roept `useStyleMode()` direct aan — dat is acceptabel omdat het pure UI-state is, geen server-call. **Keuze:** direct in SettingsView, geen prop-drilling (afwijking van het bestaande `useStyle`/`useHydeMode`-patroon dat wél via props gaat — reden: de andere zijn nodig voor query-payloads, deze niet).

### Theme-switch behoud

`app/components/theme-switch.tsx` blijft ongewijzigd. Hij zit in de topbar (`Topbar`) en wordt niet weggewerkt. Geen scope-werk hier; alleen verifiëren dat hij in beide style-modes herkenbaar oogt.

## Edge cases

- **SSR**: `useStyleMode` returneert `'classic'` zonder window (zelfde SSR-fallback als `useTheme`). De `<html data-style>` wordt door het boot-script gezet vóór React hydrateert.
- **Hydration mismatch**: `<html suppressHydrationWarning>` staat al in `app/layout.tsx`; geldt automatisch voor `data-style`.
- **localStorage onbeschikbaar** (private mode/strict cookies): boot-script try-catch'd al; valt terug op default `'classic'`. Setter no-op'd, attribute-mutatie werkt nog wel binnen sessie.
- **Wissel tijdens een actieve stream**: alleen visuele swap, geen impact op `/api/v0/chat`-stream.
- **Light + Refined niet vergeten**: handmatige check van alle 4 combinaties (`dark+classic`, `dark+refined`, `light+classic`, `light+refined`) voor PR-merge.
- **A11y**: segmented control krijgt `role="radiogroup"` + `aria-checked` per knop, kopie als HyDE-modus.

## Testplan (manueel, V0 = sandbox)

1. Default-load: `data-style="classic"` staat op `<html>` vóór eerste paint (geen flash).
2. Switch in Settings: Klassiek → Refined → page swap'd visueel zonder reload. localStorage geüpdatet.
3. Page-refresh: keuze blijft behouden.
4. Theme-toggle (sun/moon) werkt onafhankelijk in beide style-modes.
5. Alle 4 combinaties: visuele inspectie op homepage, één afgeronde chat-turn, sources-tab geopend, settings-tab geopend.
6. private/incognito: default `'classic'`, switch werkt binnen sessie.

## Open vragen / later te beslissen

- **Levensduur van Classic**: na hoeveel tijd / welke validatie schrappen we Classic uit de codebase? Voorstel: na 2 weken actieve test, beslissing aan Sebastiaan. Aparte cleanup-PR.
- **Exacte hex-waardes** voor Refined-light accent en gradient-intensiteit — bepalen tijdens implementatie op basis van screenshot-eval.
- **Eventuele micro-illustraties** (zee-hint, manta-silhouet in empty-state) — bewust uit deze cyclus; aparte spec als we 't willen.
