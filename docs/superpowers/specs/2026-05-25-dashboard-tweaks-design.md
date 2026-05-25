# Klantendashboard — twee Overzicht-tweaks

**Datum:** 2026-05-25
**Branch:** `feat/seb/dashboard-tweaks`
**Status:** ontwerp (goedgekeurd door Sebastiaan)

## What

Twee onafhankelijke verbeteringen aan het Overzicht-scherm van het klantendashboard
(`/klantendashboard`):

1. **"Aan de slag"-checklist verdwijnt bij voltooiing.** Zolang er nog setup-stappen
   open staan, blijft de checklist zichtbaar zoals nu. Zodra alle 6 stappen op
   `completed` staan, verdwijnt het hele paneel — de klant heeft geen nudge meer nodig.

2. **De "Behulpzaam"-metric meet voortaan gesprek-succes i.p.v. feedback-ratio.**
   Vandaag is het `% duimpjes-omhoog over alle stemmen`. Dat wordt:
   `% succesvolle gesprekken deze maand`, waarbij een gesprek niet succesvol is als
   het laatste antwoord een fallback was óf het een duim-omlaag kreeg.

## Achtergrond / waarom

- De oude behulpzaamheidsmetric meet alleen gesprekken waar een bezoeker actief
  op 👍/👎 klikte — een kleine, vertekende steekproef (1 duim-omlaag op 2 stemmen = 50%).
  Sebastiaan wil een maat die de hele gespreksuitkomst weergeeft, niet alleen de
  expliciete stemmen.
- De setup-checklist is een onboarding-nudge; als de onboarding klaar is, is het
  ruis op een verder schoon overzicht.

## Beslissingen (vastgelegd met Sebastiaan)

- **Fallback-regel:** een gesprek telt als niet-succesvol als het **laatste**
  assistant-antwoord een `fallback` was. Dit sluit exact aan op het bestaande
  "onbeantwoorde vragen"-getal (dat ook naar het laatste antwoord kijkt) zodat de
  dashboard-cijfers op elkaar reconciliëren.
- **Periode:** deze **kalendermaand** (zelfde venster als de "Gesprekken deze maand"-
  kaart) — zo deelt de succesratio dezelfde noemer als die kaart.
- **Label blijft "Behulpzaam"** ook al verandert de betekenis (Sebastiaan akkoord).
- **Gesprek zonder bot-antwoord** (alleen een vraag) telt als succesvol — consistent
  met de bestaande status-afleiding in `listConversations`.

## Acceptatiecriteria

### Tweak 1 — checklist verdwijnt
- [ ] Als minstens één setup-stap niet `completed` is: Overzicht toont `TopQuestionsBars`
      + `SetupChecklist` naast elkaar in de bestaande 2-koloms-layout (ongewijzigd).
- [ ] Als alle 6 stappen `completed` zijn: het `SetupChecklist`-paneel wordt niet
      gerenderd.
- [ ] In dat geval rendert `TopQuestionsBars` **full-width** (geen lege rechterkolom,
      geen halfbreed kaartje).
- [ ] Onder 880px (mobiel) blijft het gestapeld gedrag intact in beide gevallen.

### Tweak 2 — succesratio
- [ ] De "Behulpzaam"-kaart toont `round(succesvolle gesprekken / alle gesprekken deze
      maand × 100)%`.
- [ ] Een gesprek is niet-succesvol als (laatste assistant-antwoord = `fallback`) OF
      (gesprek heeft ≥1 `v0_feedback`-rij met `rating='down'`).
- [ ] Een gesprek dat aan beide voldoet wordt één keer geteld (geen dubbeltelling).
- [ ] Bij 0 gesprekken deze maand: kaart toont `—` + sub-regel "nog geen gesprekken".
- [ ] Sub-regel bij ≥1 gesprek: "op N gesprek(ken)" (enkelvoud/meervoud correct).
- [ ] De noemer is dezelfde set als `conversationsThisMonth.threads` (niet-verwijderde
      threads, `created_at` ≥ begin van de maand).

## Architectuur / waar de code landt

**Tweak 1** — alleen `app/klantendashboard/page.tsx`:
- Bereken `allStepsDone = checklist.every((s) => s.status === 'completed')`.
- Conditioneel renderen: bij `!allStepsDone` de huidige `<section className="grid-2col-stack">`
  met beide kinderen; bij `allStepsDone` alleen `<TopQuestionsBars>` in een full-width
  container (geen `grid-2col-stack`).
- `SetupChecklist`-component blijft ongewijzigd (de interne "alle stappen voltooid"-tak
  wordt op deze pagina onbereikbaar maar blijft als defensieve/herbruikbare code staan).

**Tweak 2:**
- **Nieuw:** `getConversationSuccessRate(orgSlug)` in
  `lib/v0/klantendashboard/server/conversations.ts` (zit al op `v0_threads` +
  `v0_thread_messages` + heeft de fallback-afleiding). Splitst in:
  - een **pure helper** `computeSuccessRate({ total, unsuccessful })` (of die de ruwe
    sets verwerkt) — losgekoppeld van Supabase zodat de rekenlogica triviaal te
    redeneren is.
  - de DB-laag die threads van deze maand ophaalt, hun laatste-antwoord-kind afleidt
    (zelfde patroon als `listConversations`), de down-vote-`thread_id`s ophaalt uit
    `v0_feedback`, en de twee samenvoegt.
- **Hergebruik:** de last-response-`kind`-afleiding uit `listConversations`
  (`v0_thread_messages` → laatste assistant-`response.kind === 'fallback'`).
- **Type:** `HelpfulnessRate` in `lib/v0/klantendashboard/types.ts` hervormd van
  `{ rate, up, down, total }` → `{ rate: number | null, successful: number, total: number }`.
  JSDoc bijgewerkt naar de nieuwe betekenis. Naam blijft `HelpfulnessRate` / veld blijft
  `helpfulness` (continuïteit; label blijft "Behulpzaam").
- **Swap:** `lib/v0/klantendashboard/server/metrics.ts` (`getOverviewMetrics`) roept
  `getConversationSuccessRate` aan i.p.v. `getHelpfulnessRate`.
- **Verwijderen:** `getHelpfulnessRate` uit `feedback.ts` (geen andere gebruikers —
  geverifieerd via grep; `listNegativeFeedback` / `countRecentNegativeFeedback` blijven).
- **UI:** `app/klantendashboard/components/overview/metric-strip.tsx` — sub-regel
  "op N gesprek(ken)" en lege staat "nog geen gesprekken".

## Datamodel (relevant)

- `v0_threads` — gesprekken. `id, organization_id, created_at, updated_at, deleted_at`.
- `v0_thread_messages` — `thread_id, role, content, position, response (jsonb met .kind)`.
- `v0_feedback` — `thread_id (nullable), query_log_id, rating ('up'|'down'),
  organization_id, created_at`.
- `query_log` heeft **geen** `thread_id` — daarom wordt fallback per gesprek afgeleid uit
  `v0_thread_messages.response.kind`, niet uit `query_log`.

## Randgevallen

- **0 gesprekken deze maand** → `rate = null` → `—` + "nog geen gesprekken".
- **Gesprek zonder assistant-antwoord** → geen fallback → telt als succesvol
  (consistent met `listConversations`).
- **Duim-omlaag met `thread_id = null`** → niet toe te wijzen aan een gesprek → genegeerd.
- **Fallback + duim-omlaag in één gesprek** → één keer als niet-succesvol geteld (set-union).
- **Meer threads in een maand dan de scan-cap** → V0-volumes zijn klein; cap ruim
  (≥1000) zetten en als V0-limitatie documenteren in de functie. Bij V1 → SQL-aggregatie.

## Out of scope (bewust niet)

- Geen tooltip / info-icoon bij de metric (de herdefinitie verving dat idee).
- Geen herlabeling van "Behulpzaam".
- `listNegativeFeedback`, het "onbeantwoorde vragen"-getal, de Gesprekken-pagina en de
  setup-checklist-afleiding (`getSetupChecklist`) blijven ongemoeid.
- Geen nieuwe unit-test-runner: het project heeft alleen Playwright (e2e). De pure helper
  wordt geverifieerd via typecheck + visuele check op demo-data.

## Verificatie

1. `npx tsc --noEmit` — schoon.
2. `npm run build` — slaagt (vangt Next.js-route/metadata-valkuilen die dev verbergt).
3. Dev server (`next dev -p 3001`) → `/klantendashboard`:
   - **Tweak 2:** "Behulpzaam"-kaart toont een percentage met "op N gesprekken". Kruis-
     check tegen een handmatige telling op de demo-org (Dev Org): succesvolle gesprekken /
     totaal deze maand.
   - **Tweak 1:** een org met openstaande stappen toont de checklist; een org met alle
     stappen voltooid toont hem niet (TopQuestionsBars full-width). Eventueel via een
     org met complete setup of door tijdelijk de afgeleide state te bekijken.
