# Bot-dropdown — collapse oudere versies

**Datum:** 2026-05-23
**Scope:** admintool bot-versie-switcher (`app/components/bot-dropdown.tsx`)
**Branch:** `feat/seb/bot-dropdown-collapse`

## What

De admintool toont een dropdown waarmee je tussen bot-versies switcht (`?v=v0.1` t/m `?v=v0.6` op dit moment, en groeiend). Elke versie krijgt een rij met label, model en een 1-regelige description. Bij 6+ versies wordt het paneel een scroll-blok dat dominant in beeld staat — de meeste switches gaan naar de nieuwste 2-3 versies; de oudere zijn historische referentie.

Deze wijziging maakt het paneel compact door alleen de drie nieuwste versies standaard te tonen, met een footer-knop om de rest uit te klappen.

## Acceptance criteria

- [ ] Op `/admintool` bevat de dropdown standaard precies drie versie-rijen (de drie nieuwste, op dit moment v0.6 / v0.5 / v0.4).
- [ ] Onder die drie staat een knop `▾ Toon oudere versies (N)`, waarbij `N` het aantal verborgen versies is (op dit moment 3).
- [ ] Klik op de knop klapt de oudere versies uit; de knop muteert naar `▴ Verberg oudere versies`. Tweede klik klapt weer in.
- [ ] Binnen elke sectie staat de nieuwste versie bovenaan (newest-first). Dit is een gedragswijziging t.o.v. de huidige oldest-first weergave.
- [ ] Sluiten en heropenen van de dropdown reset de collapse-state naar het initiële gedrag (geen persistentie).
- [ ] Als de huidige actieve versie in de "oudere"-bucket valt (bv. URL is `?v=v0.2`), opent de dropdown met de oudere sectie al uitgeklapt, zodat de gebruiker zijn eigen actieve versie en de checkmark direct ziet.
- [ ] Toetsenbord: `Enter` en `Space` op de toggle-knop togglen de state. Bestaande `tabIndex={0}` en `Enter`/`Space` op de versie-rijen blijven werken.
- [ ] Click-outside sluit nog steeds het volledige paneel (bestaand gedrag, niet regressie).
- [ ] Donker thema en licht thema beide visueel acceptabel — knop heeft duidelijke contrast en hover-state.

## Out of scope

- Geen zoekveld / type-ahead binnen de dropdown.
- Geen persistente voorkeur in cookie/localStorage voor "altijd uitgeklapt".
- Geen aparte "compact mode" toggle (description-regel blijft op alle rijen staan).
- Geen wijziging aan `lib/v0/server/bots.ts` — `BOT_VERSIONS_ORDERED` blijft oldest-first; de reorder gebeurt alleen presentation-side.
- Geen wijziging aan `app/admintool/page.tsx` — dezelfde `bots` prop wordt ongewijzigd doorgegeven.
- Geen wijziging aan andere consumers van `BOT_VERSIONS_ORDERED` (eval-runs, scripts, server-side defaults).
- Geen geautomatiseerde tests — geen bestaande test-infra voor dit component; handmatige browser-verificatie volstaat.

## Edge cases

- **Drie of minder versies** (`bots.length <= 3`): geen knop, geen sectie-splitsing — alle versies in één blok, newest-first. Voorkomt een nutteloze "Toon oudere versies (0)" knop in een eventuele reset-state.
- **Huidige versie in oudere-bucket**: dropdown opent direct uitgeklapt (zie acceptance).
- **Onbekende versie** (`?v=v0.99`): `resolveBot` valt al terug op latest; de dropdown markeert dan v0.6 als actief — bestaand gedrag, niet beïnvloed.
- **`bots`-array is leeg**: degeneratie zonder JS-fouten; dropdown rendert label "Bot-versie" en geen items. (Komt in praktijk niet voor maar `[].slice(-3)` mag niet crashen.)
- **Lange description-regels**: bestaand `.bot-dropdown-desc` heeft al z'n eigen wrapping; reorder/collapse mag de bestaande typografie niet wijzigen.

## Files touched

- `app/components/bot-dropdown.tsx` — alle logica
- `app/globals.css` — één nieuwe selector voor de toggle-knop (`.bot-dropdown-toggle`). Bij Tailwind v4 PostCSS-quirk: fallback naar inline `style={{...}}` als de class silent gedropt blijkt na hard reload + `.next/` clear.

Niet aan te raken:
- `lib/v0/server/bots.ts`
- `app/admintool/page.tsx`
- Andere componenten

## Risico

Klein. Geïsoleerde client component, geen server-pad, geen migrations, geen RLS, geen V1 hard rules in het spel. Worst case: lelijke CSS in dark mode → snel te fixen in een follow-up.
