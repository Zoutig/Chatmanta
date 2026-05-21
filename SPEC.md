# SPEC — Klantendashboard: gesprekken-reload + top-vragen drempel

## What

Het Klantendashboard / Gesprekken-scherm krijgt twee verbeteringen:

1. **Widget-gesprekken landen voortaan in "Alle gesprekken".** Vandaag schrijft de
   widget alleen naar `query_log` en niet naar `v0_threads`, dus widget-vragen
   verschijnen wel in "Meest gestelde vragen" maar nooit in "Alle gesprekken".
   We sluiten dat gat door in `/api/v0/chat` server-side een thread te
   committen na elke widget-turn. Een anonieme `visitor_id`-cookie groepeert
   opvolgende vragen van dezelfde bezoeker in één thread (binnen 30 minuten
   inactiviteit), zodat de klant geen wirwar aan single-turn-threads ziet.
   Daarnaast krijgt het scherm een handmatige herlaadknop voor het geval er
   tijdens een gesprek nieuwe data binnenkomt.

2. **"Meest gestelde vragen" wordt streng en kort.** Vragen tonen we pas als ze
   minstens N× gevraagd zijn, en de lijst is gemaximeerd tot top M. N en M
   zijn configureerbaar per organisatie via /klantendashboard/instellingen
   (defaults: N=2, M=10).

## Acceptance criteria

### Feature 1 — Widget-threads + reload-knop

- [ ] Een vraag stellen via de widget op /widget/<slug> resulteert in een
      nieuwe rij in `v0_threads` (zichtbaar via SQL of via Klantendashboard /
      Gesprekken / Alle gesprekken).
- [ ] Drie opvolgende vragen van dezelfde bezoeker in dezelfde browser
      verschijnen als **één** thread met drie user-messages en drie
      assistant-messages in `v0_thread_messages`.
- [ ] Wanneer dezelfde bezoeker > 24 uur geen vraag heeft gesteld en
      daarna opnieuw begint, ontstaat een nieuwe thread.
- [ ] De `v0_widget_visitor`-cookie is HttpOnly=true, Path=/, SameSite=Lax,
      Max-Age=30 dagen, value = anonieme UUID v4. Geen PII. Server-only:
      browser-JS hoeft hem niet te lezen omdat hij automatisch meegaat met
      elke fetch naar /api/v0/chat.
- [ ] Bestaande testtool-gesprekken (via `chat-shell.tsx` → `commitTurnAction`)
      blijven werken zoals voorheen — geen regressie in
      /klantendashboard/test of de admintool-sidebar.
- [ ] Op /klantendashboard/gesprekken staat rechtsboven (naast of vóór de
      filterbar) een **Herlaad**-knop met een refresh-icoon. Klikken roept
      `router.refresh()` aan; geen full page reload. Knop is zichtbaar op
      beide tabs (Alle gesprekken én Meest gestelde vragen).
- [ ] Tijdens het herladen toont de knop een loading-state (spinner of disabled).

### Feature 2 — Top-vragen drempel configureerbaar

- [ ] `v0_org_settings` heeft een nieuwe `top_questions` jsonb-kolom met
      default `{"minCount": 2, "topN": 10}`. Migration 0030.
- [ ] `getTopQuestions(orgSlug)` filtert vragen op `count >= minCount` en
      slice't tot `topN`, beide afgeleid uit de org-settings (niet meer
      hard-coded `limit = 20`).
- [ ] /klantendashboard/instellingen heeft een nieuwe sectie "Meest gestelde
      vragen" met twee number-inputs: "Toon vragen vanaf X keer gesteld" en
      "Maximum aantal in lijst". Save via een nieuwe server-action
      `saveTopQuestionsAction`.
- [ ] Invoer validatie: `minCount` ∈ [1, 50], `topN` ∈ [1, 100]. Server
      weigert waarden daarbuiten met een duidelijke foutmelding.
- [ ] Lege staat van /klantendashboard/gesprekken?view=top-questions toont
      "Nog geen vragen met minimaal {minCount}× herhaling" als er wel queries
      in `query_log` staan maar niemand de drempel haalt — onderscheidend van
      de oude "Nog geen vragen geteld".

## Out of scope

- **Visitor-id grouping over devices/browsers**: cookie is per-browser. Een
  bezoeker die switcht van mobiel naar laptop telt als twee visitors. Voor
  V1 multi-tenant logged-in users niet relevant.
- **Verbergen van eigen testtool-threads uit "Alle gesprekken"**: de testtool
  schrijft al naar `v0_threads`, dus die staan al tussen de gesprekken.
  Filteren op `bot_version != 'admintool'` of vergelijkbaar is een aparte PR.
- **Daterange-aanpassing van "Alle gesprekken"**: de bestaande `last_30_days`
  default blijft. Oudere gesprekken nog steeds onzichtbaar tot je een ander
  filter kiest.
- **Verwijderen / soft-delete vanuit klantendashboard**: blijft admintool-functie.
- **Real-time updates / WebSockets**: de Herlaadknop is bewust handmatig.
  Live-refresh komt eventueel later met SWR/RSC-revalidate-paths.
- **Aantal-kolom op detail-pagina**: detail-pagina voor widget-threads gebruikt
  de bestaande `/gesprekken/[id]/page.tsx` ongewijzigd. Eventuele UI-quirks
  bij widget-threads (geen `bot_version` label?) worden niet aangepakt
  tenzij ze breken.
- **Backfill van bestaande widget-vragen uit query_log naar v0_threads**: te
  ingewikkeld voor V0. Nieuwe widget-vragen verschijnen vanaf merge.

## Edge cases

- **Concurrent commits voor dezelfde visitor**: bestaande `commitTurn`-retry
  loop op `(thread_id, position)`-unique-violation (rag/threads.ts:286) dekt
  dat al. Geen extra werk.
- **`/api/v0/chat` faalt halverwege**: existing `after()`-logQuery patroon
  draaien we ook voor commitTurn. Als commitTurn faalt logt het naar
  console; gebruiker merkt niets. Geen orphan threads (de hele commit-call
  is atomair).
- **Cookie geblokkeerd door browser**: zonder cookie val terug op
  "nieuwe thread per request" (oude default). Klant ziet wat ruis maar
  data is niet verloren.
- **`visitor_id` in cookie is geen valide UUID** (gemanipuleerd): regex-check
  bij read; bij mismatch behandelen als "geen cookie" en nieuwe genereren.
- **`top_questions` jsonb is corrupt** (handmatig DB-edit): val terug op
  defaults `{minCount: 2, topN: 10}` met console.warn.
- **Org heeft <topN vragen die drempel halen**: toon wat er is, géén padding.
  Helper-tekst boven de lijst geeft de drempel weer: "Vragen die ≥{minCount}×
  zijn gesteld — Top {topN}".
- **Smalltalk/blocked queries**: blijven uit `query_log` filter `kind IN
  ('answer', 'fallback')` (geen wijziging). Komen niet in top-questions.
- **Smalltalk via widget**: krijgt nog steeds een thread (zelfde commit-pad).
  Klant ziet "hallo daar" als gesprek staan. Acceptabel voor V0.

## Onbeantwoorde vragen / aannames

- Aanname: anonieme UUID-cookie is acceptabel onder AVG voor V0 (geen
  tracking, geen koppeling aan persoon, korte TTL). Bij twijfel: cookie
  alleen zetten als de klant gekozen heeft voor "gesprekken bewaren" in
  instellingen — uit-scope voor deze PR.
- Aanname: de `bot_version` voor widget-threads = de versie die wordt
  meegestuurd door de widget (body.version) of een vaste string `'widget'`
  als die ontbreekt. Voor MVP gebruiken we body.version (consistent met
  query_log).
