# V0 UI refresh — light/dark theme + visuele verfijning

**Datum:** 2026-05-09
**Status:** Goedgekeurd, klaar voor implementatieplan
**Scope:** alleen V0 demo-pagina (`app/page.tsx` en componenten daaronder)

## Doel

V0 is op dit moment een interne test-bench voor RAG-tweaks. Functioneel werkt het, maar visueel is het *saai en krap* (gebruikersfeedback). De refresh maakt V0 prettiger om in te werken bij lange test-sessies, zonder functionaliteit te wijzigen.

Doelgroep: alleen Sebastiaan/Jorion intern. Niet voor klanten of demo's.

## Beslissing

Twee samenhangende thema's in één codebase, met een expliciete switch:

- **Light = "Refined Zinc"** — zelfde palet als nu, beter uitgevoerd: meer ademruimte, scherpere typografische hiërarchie (uppercase tracking-labels), subtiel zwart-wit accent (border-left op antwoord-blok).
- **Dark = "Dev-tool donker"** — zinc-950 achtergrond, mono-accenten voor metrics, kleur-gecodeerde status-borders (emerald=hit, amber=fallback, red=error), Linear/Raycast-aanvoelen.

Toggle (System / Light / Dark) zit rechtsboven naast de version switcher. Voorkeur opgeslagen in `localStorage`. Eerste bezoek volgt OS-voorkeur.

## Buiten scope

Bewust níet in deze refresh:

- **Geen layout-restructure** — chat 2/3 + sources-panel 1/3 blijft. Ingest + doc-list eronder blijft. Component-grenzen (`ChatBox`, `IngestForm`, `DocList`, `VersionSwitcher`) blijven.
- **Geen nieuwe functionaliteit** — geen side-by-side bot-vergelijk, geen query-history, geen full-chunk-modal, geen keyboard shortcuts.
- **Geen branding** — geen logo, geen Jorion-marketing. Interne tool blijft interne tool.
- **Geen widget-voorbereiding** — widget krijgt eigen design (Fase 6, blueprint).
- **Geen V1-vooruitwerk** — auth-pagina (`app/login/`) blijft ongewijzigd.

## Architectuur

### Theme-mechanisme

Drie waarden: `'system' | 'light' | 'dark'`. Standaard `'system'` op eerste bezoek.

Resolve-volgorde elke render:

1. Lees `localStorage.theme` → fallback `'system'`
2. Als `'system'`: kijk `window.matchMedia('(prefers-color-scheme: dark)').matches` → resolve naar `'light'` of `'dark'`
3. Zet `<html data-theme="light|dark">` én Tailwind's `class="dark"` (voor `dark:` variants)

### FOUC-preventie

Een blocking inline-script in `<head>` zet `data-theme` en `class="dark"` op `<html>` vóórdat React hydrateert. Het script is < 500 bytes, leest alleen `localStorage` en `matchMedia`. Geen FOUC bij hard-reload.

### Tailwind config

`tailwind.config.ts`: `darkMode: 'class'` (i.p.v. de huidige `'media'`-default). Bestaande `dark:` utility-classes blijven werken; ze triggeren nu op `class="dark"` op `<html>` i.p.v. OS-preference.

### Theme-hook

**Geen externe library** (`next-themes` of vergelijkbaar). Een eigen hook is ~30 regels en voorkomt een dependency voor pure UX-state.

Klein React hook in `lib/v0/hooks/use-theme.ts` (~30 regels):

```ts
type ThemeChoice = 'system' | 'light' | 'dark'
type ResolvedTheme = 'light' | 'dark'

useTheme(): {
  choice: ThemeChoice
  resolved: ResolvedTheme
  set: (c: ThemeChoice) => void
}
```

State leeft in `<html data-theme>` + localStorage. Hook luistert naar `prefers-color-scheme` change-events zodat OS-mode wisselen direct doorwerkt als choice = `'system'`.

## Componenten — wat wijzigt

### `app/layout.tsx`
- Inline FOUC-script in `<head>`
- `<html data-theme>` initial value (server: leeg, client: gezet door FOUC-script)
- Body styling onveranderd qua structuur, alleen iets verfijnd qua bg/text

### `app/components/theme-switch.tsx` *(nieuw)*
- Drie-stop segmented control: System / ☀ Light / ☾ Dark
- Visueel klein, past in header naast version switcher
- Gebruikt `useTheme` hook
- Toetsenbord-toegankelijk (radio-groep semantiek)

### `app/components/chat-box.tsx`
Visuele wijzigingen, geen logica:
- Vraag-textarea: uppercase tracking-label boven het veld i.p.v. inline `Vraag` font-medium
- Threshold-slider: label en waarde meer prominent, waarde in mono
- Submit-button: hoogte-consistent met andere inputs
- AnswerPanel: border-left accent (zwart light, emerald dark) i.p.v. dunne all-around border alleen
- Stats-regel: mono, kleinere font, secondaire kleur
- SourcesPanel: per chunk een border-left ipv all-around (kleur-gecodeerd op similarity ≥ threshold)
- SessionStats: card met meer ademruimte, kostbedrag in mono prominent

### `app/components/ingest-form.tsx`
- Section-header met uppercase tracking-label
- File-input verfijnd (custom button styling consistent met submit)
- Status-meldingen: border-left accent (emerald success, red error)

### `app/components/doc-list.tsx`
- Section-header consistent met ingest
- Per-doc rij: meer ademruimte, naam prominenter, chunk-count + status in mono secondary
- Delete-knop: subtiel tot hover

### `app/components/version-switcher.tsx`
- Padding/border consistent met theme-switch
- Description-tekst onder de dropdown blijft, kleinere font

### `app/page.tsx`
- Header krijgt `<ThemeSwitch />` rechts (naast `VersionSwitcher`)
- Spacing tussen secties iets ruimer (`gap-8` i.p.v. `gap-6`)

### `tailwind.config.ts`
- `darkMode: 'class'`

### `app/globals.css`
- Eventueel CSS-vars voor primary accent (`--accent`) als zinc-defaults niet voldoende contrast geven. Eerst proberen zonder, alleen toevoegen indien nodig.

## Visuele specificaties

### Typografie
- Headings: `text-base font-semibold tracking-tight` (V0-titel = `text-xl`)
- Section-labels: `text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400`
- Body: `text-sm` (huidige default blijft)
- Metrics/code: `font-mono text-[11px]` (Geist Mono al beschikbaar)

### Spacing
- Card padding: `p-4` (huidige) blijft
- Tussen kaarten: `gap-4`
- Tussen secties (header → chat → ingest-rij): `gap-8` (was `gap-6`)
- Binnen formulieren: `gap-3`

### Status-kleuren
| Status | Light border-left | Light bg-tint | Dark border-left | Dark bg-tint |
|---|---|---|---|---|
| Default antwoord | `zinc-900` | `white` | `emerald-500` | `zinc-900` |
| Hit (sim ≥ thresh) | `emerald-500` | `emerald-50` | `emerald-500` | `emerald-950/40` |
| Miss (sim < thresh) | `zinc-300` | `zinc-50` | `zinc-700` | `zinc-950` |
| Fallback | `amber-500` | `amber-50` | `amber-500` | `amber-950/40` |
| Error | `red-500` | `red-50` | `red-500` | `red-950/40` |
| Smalltalk | `sky-500` | `sky-50` | `sky-500` | `sky-950/40` |

### Border-left accent pattern
`border-l-2` met de status-kleur, plus dunne all-around `border` in zinc-200/zinc-800 voor structuur. Vervangt het huidige `border` + `bg-tone` patroon dat nu over de hele rand kleurt.

## Data flow

Theme-state is volledig client-side. Geen server roundtrip, geen Supabase, geen analytics. Het is een UX-instelling.

```
User klikt toggle
  → useTheme().set(choice)
  → localStorage.theme = choice
  → <html data-theme=...> + class="dark" toggle
  → Tailwind dark:-utilities re-evalueren
  → React re-render (CSS doet eigenlijk al het werk)
```

OS-changes triggeren alleen herrendering als `choice === 'system'`.

## Error handling

Theme-toggle kan niet falen op een manier die de user merkt: localStorage write-fouten worden gevangen en stilzwijgend genegeerd (private browsing edge case). Resolved theme valt dan terug op System-default per pageload.

Bestaande error-states in chat-box / ingest-form blijven onveranderd qua logica; alleen de visuele weergave (border-left rood) wijzigt.

## Testen

### Type-check
`npm run typecheck` (of `tsc --noEmit`) — alle nieuwe componenten + hook getypeerd.

### Playwright smoke-tests
We hebben Playwright skill geïnstalleerd. Eén script in `tests/v0/theme-switch.spec.ts`:

1. Laad `/`
2. Verify `<html data-theme>` is `light` of `dark` (volgt OS in test-runner)
3. Klik dark-knop in toggle
4. Verify `<html data-theme="dark"]` en `class="dark"`
5. Reload pagina
6. Verify dark blijft (localStorage)
7. Verify geen FOUC: voor de eerste React-paint heeft `<html>` al de juiste class

### Visuele check (handmatig)
- Light/Dark/System alle drie gestest
- Hard-reload: geen flash naar verkeerde theme
- Alle V0-features werken in beide themes (vraag stellen, ingest, delete, version-switch)

## Risico's en mitigaties

| Risico | Mitigatie |
|---|---|
| FOUC bij eerste paint | Blocking inline-script vóór React-bundle |
| Tailwind `darkMode: 'class'` breekt bestaande `dark:` styles | Bestaande `dark:` classes blijven werken; alleen het trigger-mechanisme wisselt |
| Theme-script laadt niet (CSP) | Geen externe scripts, geen `eval`; pure inline DOM-manipulatie |
| `useTheme` hook in `'use client'` componenten verplicht | Acceptabel — alle V0-componenten zijn al `'use client'` |
| Visuele drift van shadcn-defaults | We blijven binnen Tailwind/Geist; geen extra UI-libraries |

## Acceptatiecriteria

Klaar als:

- [ ] Theme-toggle zichtbaar in header, drie standen (System/Light/Dark) klikbaar
- [ ] Voorkeur persist na hard-reload (zonder FOUC)
- [ ] System-mode wisselt automatisch met OS dark-mode toggle
- [ ] Alle V0-componenten gebruiken nieuwe typografische hiërarchie (uppercase labels, mono metrics)
- [ ] Status-borders (border-left pattern) consistent toegepast op antwoord-blok, sources, ingest-status
- [ ] Playwright smoke-test slaagt
- [ ] Geen TypeScript-fouten
- [ ] V0 functionaliteit (vraag stellen, streaming, ingest, delete, version-switch) onveranderd
