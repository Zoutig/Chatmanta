# Widget threads + dashboard-customisation — design

**Date:** 2026-05-21
**Branch:** `feat/seb/widget-threads-customisation`
**Scope-marker:** V0 (widget runtime + klantendashboard `widget`-instellingen)

## What

Twee onafhankelijke uitbreidingen aan de publieke chat-widget en het bijbehorende klantendashboard:

1. **Multi-thread support in de widget.** Bezoekers krijgen een "Nieuw gesprek"-knop en een lijst van eerdere gesprekken binnen dezelfde browser. Threads worden lokaal opgeslagen (localStorage) en zijn per `orgSlug + botVersion` geïsoleerd, zodat een v0.7-demo niet vermengt met v0.6.
2. **Meer customisation in het klantendashboard.** De klant kan (a) de pulse-ring aan/uit zetten, (b) de positie-knoppen staan visueel-logisch in volgorde (Linksonder | Rechtsonder), en (c) kleur kiezen via een 9-preset-grid met "Meer kleuren"-uitklap voor de native color-picker.

Geen wijzigingen aan het RAG-pad, geen migrations, geen nieuwe API-routes.

## Acceptance criteria

### Threads

- [ ] Widget-paneel toont een `☰`-knop linksboven in de header.
- [ ] Klik op `☰` opent een drawer-overlay binnen het paneel; chat-area + input worden gemaskeerd.
- [ ] Drawer toont bovenaan een primary "+ Nieuw gesprek"-knop.
- [ ] Drawer toont eronder alle eerdere threads, gesorteerd op `updatedAt` desc.
- [ ] Elke thread-rij toont titel (auto-gegenereerd, ≤40 chars) + relatief tijdstip + delete-icoon.
- [ ] Klik op een thread laadt z'n messages en sluit de drawer.
- [ ] Klik op delete-icoon vraagt `window.confirm('Gesprek verwijderen?')`; bij ja: thread weg, drawer ververst.
- [ ] "+ Nieuw gesprek" wist messages, sluit drawer, focust input. Thread wordt pas écht aangemaakt bij het eerste user-bericht (geen lege spook-threads in de lijst).
- [ ] Threads overleven page-reload binnen dezelfde browser.
- [ ] Eerste user-bericht in een fresh session creëert automatisch thread #1 (geen knop-klik nodig).
- [ ] Bij 20+ threads wordt de oudste stilletjes geprund bij `create()`.
- [ ] Geen threads ooit gehad? Drawer toont alleen "+ Nieuw gesprek" + lege-state-tekst.
- [ ] localStorage `quota_exceeded` faalt zonder UI-toast: console.warn + de huidige sessie blijft in-memory werken.

### Dashboard polish

- [ ] Positie-knoppen in `widget-form` staan in volgorde `[Linksonder | Rechtsonder]` (visuele logica matcht label).
- [ ] Nieuwe `pulseEnabled: boolean` op `WidgetSettings`, default `true`. Backwards-compat: `undefined === true`.
- [ ] Pulse-customisation-blok in dashboard toont een aan/uit-toggle naast de kleur-picker. Bij uit: color-picker grijs/disabled.
- [ ] Widget runtime verbergt de pulse-ring wanneer `pulseEnabled === false`.
- [ ] Alle 4 kleur-velden (logo / achtergrond / pulse / header) gebruiken een nieuwe `<PresetColorPicker>` met 3×3 swatch-grid.
- [ ] Geselecteerde swatch krijgt een 2px-ring in `var(--klant-accent)`.
- [ ] Onder de grid: "▾ Meer kleuren"-knop die de native `<input type="color">` + hex-tekstveld toont.
- [ ] Wanneer de huidige waarde geen preset is, opent de picker direct in "Meer kleuren"-state.
- [ ] Preset-set leeft in `lib/widget/color-presets.ts` (één bron-van-waarheid).

## Out of scope

- Geen cross-device thread-sync (komt eventueel in V1 met Supabase Auth).
- Geen "wis alle threads"-knop in widget — alleen per-thread delete.
- Geen klantendashboard-zichtbaarheid op widget-bezoeker-gesprekken (PR #78 deed dashboard-zijde, dat staat los).
- Geen thread-search / filter / hernoem-functie.
- Geen export-naar-email of transcript-download.
- Geen schema-migration of nieuwe `v0_org_settings.widget`-tabel-kolom — `pulseEnabled` zit gewoon in de jsonb-blob.
- Geen wijziging aan de pulse-animatie-kromme / timing — alleen on/off.

## Edge cases

- **SSR/hydratatie.** `localStorage` is niet beschikbaar tijdens SSR. Store wordt pas in `useEffect` geïnitialiseerd; initial render = geen thread-state, geen flicker.
- **Quota-exceeded** (`localStorage.setItem` gooit `QuotaExceededError`). Catch silent, console.warn, in-memory state blijft werken. Toekomstige writes proberen het opnieuw.
- **Stale `activeId`.** localStorage heeft `activeId` maar de thread is weg (handmatig storage-clear). → val terug op meest-recente thread; geen activeId? → wait-for-first-message-flow.
- **Mobile fullscreen.** Drawer-overlay werkt 1-op-1 in mobile fullscreen-mode (zelfde flexbox-paneel). Geen aparte mobile-layout nodig.
- **Migration van bestaande in-memory chat.** Bezoeker had vóór deploy al gechat (state in browser-memory, niet persistent). Bij eerste laden post-deploy: store is leeg, eerste nieuwe bericht maakt thread #1 aan. Geen pogingen om oude memory te recoveren — die was er al niet meer na refresh.
- **`pulseEnabled` migration.** Bestaande `v0_org_settings.widget`-rows hebben geen `pulseEnabled` — type-laag moet `pulseEnabled ?? true` doen bij read.
- **Custom hex buiten preset-set.** Bezoeker bezit `#5e8c61` (mintige tint, geen preset). Picker opent in "Meer kleuren"-state, native picker toont huidige waarde. Geen "9 preset alleen"-lockdown.
- **Per-bot-versie key-collisie.** Storage-key bevat `botVersion` — wisselen v0.6 ↔ v0.7 toont aparte thread-sets. Bewust gedrag (anders verwarrend tijdens demo's).

## Architecture

```
lib/widget/
  thread-types.ts         ← Thread + ThreadMessage types
  thread-store.ts         ← ThreadStore interface + LocalStorageThreadStore
  color-presets.ts        ← 9-color hex array

app/widget/components/
  chatmanta-widget.tsx    ← +threadStore wiring, +pulseEnabled gate
  thread-drawer.tsx       ← drawer-overlay (new)

app/klantendashboard/widget/components/
  widget-form.tsx         ← positie-swap, pulseEnabled-toggle, vervang ColorPicker
  preset-color-picker.tsx ← 3×3 grid + 'Meer kleuren' (new)

lib/v0/klantendashboard/types.ts  ← +pulseEnabled?: boolean
lib/v0/klantendashboard/widget.ts ← default-merge: pulseEnabled ?? true
```

## Data flow

### Threads

1. Widget mounts → `useEffect` initialiseert `LocalStorageThreadStore(orgSlug, botVersion)`.
2. Store leest `activeId` uit localStorage. Aanwezig + thread bestaat → laad messages in component state.
3. Bezoeker typt → `send()`:
   - Geen `activeId`? → `store.create()` + setActiveId.
   - Append user+assistant messages naar component state én naar `store.update(activeId, { messages, updatedAt: Date.now(), title: deriveTitle(messages) })`.
4. Bezoeker klikt `☰` → drawer toont `store.list()`.
5. Bezoeker klikt thread → setActiveId + laad messages uit store + sluit drawer.
6. Bezoeker klikt "+ Nieuw gesprek" → setActiveId(null) + clear messages + sluit drawer. Geen `create()` tot eerste send.

### Customisation

1. Klant past positie / pulse-toggle / kleur aan in dashboard → `update()` in component-state.
2. Save-knop of per-veld-direct-persist (volgt huidige patroon) → `saveWidgetSettingsAction(patch)`.
3. Action persist naar `v0_org_settings.widget` jsonb.
4. Widget runtime leest settings via bestaande pipe (`/widget/[slug]/layout.tsx`) — geen wijziging.

## Error handling

- localStorage quota → catch, console.warn, in-memory continue.
- `JSON.parse` op corrupt localStorage → catch, behandel als lege store, log naar console.
- Geen netwerk-errors voor threads (volledig client-side).
- Bestaande chat-stream-error-handling blijft ongewijzigd.

## Testing

Geen test-suite in deze repo voor widget (`__tests__/` is RAG-only). Verificatie:

- **Type-check:** `npm run typecheck` (of next build).
- **Manual desktop:**
  1. Open `/widget` op een test-org, chat een keer, refresh → thread is er.
  2. Klik `☰`, klik "+ Nieuw gesprek", chat opnieuw → twee threads in lijst.
  3. Klik delete → thread weg, lijst refresht.
  4. Wissel naar andere bot-versie in skin → andere thread-set (lege als nooit gechat met die versie).
- **Manual mobile:** zelfde flow in fullscreen-paneel (<640px viewport).
- **Dashboard:**
  1. Positie-knoppen tonen `[Linksonder | Rechtsonder]`, klik wisselt correct.
  2. Pulse-toggle uit → preview-mockup verbergt pulse-ring (mockup is statisch, dus dit verifieert via live `/widget`-demo).
  3. Klik 9 preset-swatches → kleur slaat op, widget toont nieuwe kleur.
  4. Custom hex `#5e8c61` ingesteld → picker opent direct in "Meer kleuren"-state.

## Open questions

Geen — alle beslissingen vastgelegd in clarifying-questions (zie chat-transcript 2026-05-21).
