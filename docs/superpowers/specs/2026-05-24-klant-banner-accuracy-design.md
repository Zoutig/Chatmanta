# Klantendashboard — accurate, klikbare banners op het Overzicht

**Datum:** 2026-05-24
**Branch:** `feat/seb/klant-banners`
**Type:** fix + kleine feature (V0 klantendashboard)

## What

De waarschuwings-banners bovenaan het Overzicht-scherm (`app/klantendashboard/page.tsx`)
toonden onbetrouwbare aantallen — met name "Er zijn X onbeantwoorde vragen". Het getal
klopte vaak niet met wat je zag als je doorklikte, omdat "onbeantwoord" op vier plekken
vier verschillende dingen telde (zie Achtergrond). Deze wijziging maakt één bron van
waarheid: het aantal onbeantwoorde **gesprekken van de laatste 30 dagen**, identiek aan
het Gesprekken-scherm. De banner verschijnt alleen wanneer er echt iets te doen is, de
knop brengt je naar exact de bijbehorende lijst, en je kunt een banner wegklikken — hij
komt terug zodra er een nieuwe gap bijkomt.

## Achtergrond — waarom het misging

"Onbeantwoorde vragen" werd op vier plekken anders geteld:

| Plek | Telde | Probleem |
|------|-------|----------|
| Overzicht-banner | alle `query_log`-rijen `kind='fallback'`, all-time, geen dedup | telt eigen test/admintool-vragen mee; daalt nooit |
| Overzicht-metriccard | zelfde getal | linkte naar `/kennisbank` i.p.v. de gesprekken |
| Overzicht-lijst eronder | gegroepeerd per unieke vraag | weer een ander getal |
| Gesprekken-scherm (klikdoel) | unieke **threads** met onbeantwoorde laatste vraag, laatste 30 dagen | andere eenheid + ander venster |

Resultaat: banner zegt "14", je klikt → lijst van 30-daagse threads toont er 2 of "geen".

Belangrijke meevaller: de **test-pagina** maakt geen `v0_threads` en logt niet naar
`query_log` (`app/klantendashboard/test/actions.ts` roept `runRagQueryStreaming` direct
aan). Door op threads te tellen, vallen test-pagina-vragen automatisch buiten de telling.

## Ontwerp

**1. Eén bron van waarheid.** Nieuwe server-functie
`countUnansweredThreads(orgSlug, days = 30)` in
`lib/v0/klantendashboard/server/conversations.ts`. Hergebruikt exact de status-afleiding
van `listConversations` (threads in venster, max 100, laatste assistant-`response.kind`
=== `'fallback'`). Retourneert `{ count, latestUnansweredAt }`. `getOverviewMetrics`
gebruikt deze i.p.v. `countFallbacksAllTime` voor `unansweredCount`, en geeft
`latestUnansweredAt` mee voor de dismiss-signature.

**2. Knoppen die kloppen.**
- Banner-CTA → `/klantendashboard/gesprekken?filter=unanswered` (al correct).
- Metriccard "Onbeantwoorde vragen" → van `/kennisbank` naar
  `/klantendashboard/gesprekken?filter=unanswered`.
- De lijst "Veelvoorkomende onbeantwoorde vragen" (`getUnansweredQuestions`) krijgt een
  30-dagen-venster zodat alle getallen op het scherm dezelfde kant op wijzen.

**3. Wegklikbaar, komt terug bij nieuwe gaps.** Nieuw client-component
`DismissibleBanner` (`app/klantendashboard/components/dismissible-banner.tsx`) rond de
bestaande `WarningBanner` (die een optionele ✕-knop krijgt). Per banner een `dismissId`
en een `signature` in `localStorage` onder key `klant-banner-dismiss:<dismissId>`:
- onbeantwoord: `signature = "${count}:${latestUnansweredAt}"` → verandert bij nieuwe gap → banner komt terug.
- geen-bronnen / widget: `signature = "active"` (binair; dismiss = weg tot de status om-en-weer flipt).
Render-strategie: client-component start verborgen, bepaalt zichtbaarheid in `useEffect`
na `localStorage`-read (voorkomt flash van een al-weggeklikte banner). `localStorage`
onbereikbaar (private mode / SSR) → banner gewoon tonen, in `try/catch`.

## Acceptance criteria

- [ ] Het getal in de onbeantwoorde-banner is gelijk aan het aantal rijen dat
      `/klantendashboard/gesprekken?filter=unanswered` toont (zelfde org, zelfde moment).
- [ ] De metriccard "Onbeantwoorde vragen" toont hetzelfde getal als de banner en linkt
      naar `/klantendashboard/gesprekken?filter=unanswered`.
- [ ] Bij 0 onbeantwoorde gesprekken (laatste 30 dagen) verschijnt er geen
      onbeantwoorde-banner en geen waarschuwingstoon op de metriccard.
- [ ] Vragen gesteld via de test-pagina verhogen het bannergetal niet.
- [ ] Een banner heeft een ✕-knop; wegklikken verbergt 'm en hij blijft weg na reload.
- [ ] Komt er ná het wegklikken een nieuwe onbeantwoorde vraag bij (count of
      `latestUnansweredAt` verandert), dan verschijnt de banner opnieuw.
- [ ] "geen bronnen"- en "widget niet geplaatst"-banner werken en zijn ook wegklikbaar.
- [ ] `npm run typecheck` slaagt.

## Out of scope

- **NIET** een `channel`-kolom toevoegen om widget-bezoekers van admintool-playground-
  threads te scheiden. In V0 tellen admintool-testgesprekken nog mee als "echt"
  (test-pagina niet). Vereist migration + telemetrie-wijziging → V1-concern.
- **NIET** de negatieve-feedback-banner naar het Overzicht halen (blijft op Gesprekken).
- **NIET** een server-side / per-user dismiss-state (V0 heeft geen per-user identiteit;
  client-side `localStorage` is hier het juiste niveau).
- **NIET** snooze-met-timer; dismiss = "weg tot nieuwe gap".
- **NIET** de Gesprekken-pagina-banners herontwerpen (alleen het Overzicht).

## Edge cases

- **0 onbeantwoord** → geen banner (`count === 0`).
- **`localStorage` onbereikbaar** → banner tonen, geen crash (`try/catch`).
- **Venster-grens** → exact gelijk aan Gesprekken: laatste 30 dagen, max 100 threads, zodat
  banner-getal == zichtbare lijst.
- **Dismiss daarna nieuwe gap** → signature verschilt van opgeslagen waarde → banner terug.
- **Org-switch** → `dismissId` is per banner-type, niet per org; switch je van org dan kan
  een eerder weggeklikte banner-signature niet matchen (ander count/timestamp) → toont
  gewoon opnieuw. Acceptabel voor V0.
- **SSR/hydration** → client-component rendert niets tot `useEffect`; geen banner-flash.

## Bestanden

- `lib/v0/klantendashboard/server/conversations.ts` — nieuwe `countUnansweredThreads`.
- `lib/v0/klantendashboard/server/metrics.ts` — `getOverviewMetrics` gebruikt nieuwe count.
- `lib/v0/klantendashboard/types.ts` — `OverviewMetrics` uitgebreid met `latestUnansweredAt`.
- `app/klantendashboard/components/warning-banner.tsx` — optionele ✕-knop.
- `app/klantendashboard/components/dismissible-banner.tsx` — **nieuw**, client.
- `app/klantendashboard/page.tsx` — banners wrappen, metriccard-href, lijst-venster.
