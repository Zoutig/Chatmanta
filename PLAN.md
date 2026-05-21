# PLAN — Klantendashboard gesprekken-reload + top-vragen drempel

Tasks zijn sequentieel: latere tasks importeren artifacts van eerdere. Eén commit
per task; na elke task `npm run typecheck` + visuele check waar UI verandert.

## Task 1: Migration 0030 — visitor_id + top_questions kolommen

- **Files:** `supabase/migrations/0030_v0_widget_threads_and_top_questions.sql`
- **Approach:**
  - `ALTER TABLE public.v0_threads ADD COLUMN visitor_id text NULL;`
  - Index `(organization_id, visitor_id, updated_at DESC) WHERE visitor_id IS NOT NULL`
    voor de 24-uur-window lookup.
  - `ALTER TABLE public.v0_org_settings ADD COLUMN top_questions jsonb NOT NULL
    DEFAULT '{"minCount": 2, "topN": 10}'::jsonb;` — niet-nullable met default
    zodat bestaande rijen automatisch de waarde krijgen, geen backfill nodig.
  - CHECK constraint op de jsonb-structuur (best-effort: `jsonb_typeof(... -> 'minCount') = 'number'`).
- **Commit:** `feat(klant): migration 0030 — visitor_id op v0_threads + top_questions op v0_org_settings`
- **Tests:** `npm run migrate` lokaal; verifieer met `npm run migrate:status` dat 0030 op `applied` staat. Spot-check de twee tabellen via Supabase.

## Task 2: Types + settings-laag voor topQuestions

- **Files:**
  - `lib/v0/klantendashboard/types.ts` — nieuw type `TopQuestionsConfig`
  - `lib/v0/klantendashboard/server/settings.ts` — `OrgSettings.topQuestions`
    lezen, defaults `{minCount: 2, topN: 10}`, defensieve parser bij corrupte
    jsonb (val terug op defaults, console.warn).
  - `lib/v0/klantendashboard/server/settings.ts` — nieuwe writer
    `saveTopQuestionsConfig(orgSlug, config)` met validatie (minCount ∈ [1,50],
    topN ∈ [1,100]) — gooit AppError bij overschrijding.
- **Approach:** Patroon volgen van `saveChatbotSettings`: read-current →
  merge → upsert. Helper `writeOrgSettings` accepteert `top_questions?` veld.
- **Commit:** `feat(klant): top_questions config in v0_org_settings layer`
- **Tests:** `npm run typecheck`. Geen UI verandering nog.

## Task 3: `getTopQuestions` past config toe

- **Files:**
  - `lib/v0/klantendashboard/server/top-questions.ts` — signature wordt
    `getTopQuestions(orgSlug, config: TopQuestionsConfig)`. Filter
    `count >= config.minCount`, slice tot `config.topN`. `limit` parameter
    verwijderen, `TOP_N_DEFAULT` constante weg.
  - `app/klantendashboard/gesprekken/page.tsx` — laad settings parallel met
    listConversations + getTopQuestions, pass `settings.topQuestions` naar
    `getTopQuestions`. Gebruik diezelfde config voor de empty-state-tekst
    in `TopQuestionsTab` (pass via prop).
- **Commit:** `feat(klant): top-vragen filteren op minCount + topN uit settings`
- **Tests:** typecheck. Handmatig: laad /klantendashboard/gesprekken?view=top-questions, zie alleen vragen met >=2 voorkomen, max 10.

## Task 4: Empty-state en helper-tekst in TopQuestionsTab

- **Files:**
  - `app/klantendashboard/gesprekken/components/top-questions-tab.tsx` — nieuwe
    prop `config: TopQuestionsConfig`. Empty-state-tekst onderscheidt
    "Nog geen vragen geteld" (corpus echt leeg) van "Nog geen vragen met
    minimaal {config.minCount}× herhaling" (corpus heeft items maar geen
    haalt de drempel). Onderscheid maken we via een tweede prop
    `totalRawQuestions: number` (= aantal unieke vragen vóór filteren).
  - `lib/v0/klantendashboard/server/top-questions.ts` — bij computation
    onthoud `map.size` als `totalUnique`, return als 2e veld of in een
    wrapper-object `{ items, totalUnique }`. (Backwards-incompatible
    return-shape: callers updaten.)
  - Helper-tekst boven de tabel wordt: "Top {config.topN} vragen die ≥{config.minCount}× zijn gesteld — vandaag bijgewerkt".
- **Commit:** `feat(klant): top-vragen empty-state en helper-tekst tonen drempel`
- **Tests:** typecheck. Handmatig: test met drempel=50 om geforceerd lege staat te krijgen, dan terugzetten naar 2.

## Task 5: UI — settings-form sectie "Meest gestelde vragen"

- **Files:**
  - `app/klantendashboard/actions.ts` — nieuwe `saveTopQuestionsAction(config)`
    server action. Validatie ranges + actionTry-wrapper.
  - `app/klantendashboard/instellingen/page.tsx` — laad `settings.topQuestions`
    en geef door aan een nieuwe component.
  - `app/klantendashboard/instellingen/components/top-questions-config-card.tsx`
    — nieuwe client component met twee number-inputs, save-knop, "Opgeslagen ✓"-flash.
    Volgt de patroon van `SettingsForm` (useState + useTransition).
  - Renderen in `app/klantendashboard/instellingen/page.tsx` onder of boven
    de bestaande chatbot-settings-form (kort overleg: ik kies onder, want het
    voelt als sub-instelling).
- **Commit:** `feat(klant): instellingen-UI voor top-vragen drempel`
- **Tests:** typecheck. Handmatig: open /klantendashboard/instellingen, wijzig waarden, klik save, refresh, zie nieuwe waarden. Klik save met ongeldig (e.g. minCount=999) → foutmelding.

## Task 6: Reload-knop op gesprekken-pagina

- **Files:**
  - `app/klantendashboard/gesprekken/components/reload-button.tsx` — nieuwe
    client component. `useTransition` + `router.refresh()`. Lucide-icoon
    `RefreshCw`. Tijdens transition: knop disabled + spinner-animatie op
    icoon (CSS `animation: spin 1s linear infinite`).
  - `app/klantendashboard/gesprekken/page.tsx` — render `<ReloadButton />`
    in de PageHeader-actions of net onder de TabsNav, beide views zichtbaar.
- **Approach:** Knop alleen client-side. Geen body-change nodig. `router.refresh()`
  triggert server-side re-render van deze route (force-dynamic is al gezet).
- **Commit:** `feat(klant): herlaadknop op gesprekken-scherm`
- **Tests:** typecheck. Handmatig: klik op /klantendashboard/gesprekken, zie spinner ~1s, data ververst.

## Task 7: `/api/v0/chat` — visitor-cookie + server-side commitTurn

Grootste task. Splits in subcommits als de diff te groot wordt.

- **Files:**
  - `lib/v0/server/visitor.ts` — nieuw bestand. `readVisitorId(req)` parsed
    cookie + UUID-regex check; `serializeSetCookie(visitorId)` produceert de
    `Set-Cookie` header-value met de SPEC-eigenschappen (HttpOnly, SameSite=Lax,
    Path=/, Max-Age=2592000). Helper `newVisitorId()` voor UUID v4
    (gebruik `crypto.randomUUID()` — beschikbaar in nodejs runtime).
  - `lib/v0/server/threads.ts` — nieuwe helper
    `findRecentThreadByVisitor(orgId, visitorId, idleHours = 24)`: query
    `v0_threads` waar `organization_id = orgId AND visitor_id = visitorId
    AND deleted_at IS NULL AND updated_at >= now() - interval` — return
    threadId of null. Bonus: `commitTurn` accepteert een nieuwe optionele
    `visitorId` param die op de insert van een nieuwe thread mee gaat
    (alleen relevant voor het new-thread-pad).
  - `app/api/v0/chat/route.ts`:
    - Vóór de response: lees visitor-id via `readVisitorId`. Bij ontbrekend/ongeldig: genereer.
    - Set-Cookie altijd in response headers (idempotent — overschrijft eventueel oude waarde met dezelfde, geen byzondere kosten).
    - In de `after()` na `logQuery`: tweede `after()`-block dat `commitTurn`
      aanroept. ThreadId resolven via `findRecentThreadByVisitor` (null →
      nieuwe thread). Niet blokkerend voor de chat-response.
    - botVersion = `bot.version` (zelfde als logQuery gebruikt).
    - Foutpad: `try/catch` met `console.error('[commitTurn widget]', requestId, err)`.
- **Approach:**
  - commitTurn loopt **na** logQuery via aparte `after()` zodat een fout in
    threads-laag de query_log-tracking niet sloopt.
  - We committen ook bij `kind === 'fallback'` en `kind === 'smalltalk'`
    (per SPEC). Code-pad heeft `finalResponse` al beschikbaar — gewoon doorgeven.
  - Set-Cookie header gaat mee in zowel de NDJSON-stream-response als de
    blocked-response branch. (Twee plekken; refactor naar een helper
    `withVisitorCookie(headers, visitorId)`.)
- **Commit:** `feat(widget): server-side commitTurn naar v0_threads met visitor-cookie`
- **Tests:**
  - Typecheck.
  - Lokaal: start dev op port 3001. Open /widget/demo in incognito. Stel
    vraag 1. Check Supabase: er staat een nieuwe rij in `v0_threads` met een
    visitor_id. Stel vraag 2. Check: dezelfde thread heeft nu 4 messages.
    Verwijder de cookie, stel vraag 3: nieuwe thread. /klantendashboard/gesprekken
    toont de threads.
  - Edge: blokkeer cookies in DevTools → check dat het pad nog steeds een
    nieuwe thread per request maakt (defensieve fallback).

## Task 8: Verify end-to-end + screenshots

- **Files:** geen code wijzigingen tenzij ik regressies vind.
- **Approach:**
  - Doorloop alle acceptance criteria uit SPEC.md.
  - Screenshots: instellingen-sectie, top-questions-tab met drempel actief,
    reload-knop, gesprekken-lijst met widget-rijen erbij.
  - Eval-pipeline niet draaien — deze PR raakt geen RAG-pad of judge-logic.
- **Commit:** geen commit; alleen verificatie. Bij gevonden bugs: extra commit
  in de relevante task.

## Risico's en beslismomenten

- **Migration nummer-collision**: vóór ik 0030 push, snel checken of er een
  open PR is met 0030. Zo ja: hernoem naar 0031.
- **Bestaande threads van testtool krijgen `visitor_id = NULL`** — wens of
  bug? Wens: NULL = "had geen visitor-id, dus admintool of vroege widget".
  Geen achteraf-vulling nodig.
- **Set-Cookie + NDJSON-stream**: cookie moet in response-headers staan
  vóór de stream begint. Next.js Response-API laat dit toe — verifieer
  in dev.
- **Cookie in development vs prod**: SameSite=Lax werkt cross-origin
  alleen als `Secure` ook aan staat in prod. Toevoegen via
  `process.env.NODE_ENV === 'production' ? '; Secure' : ''` in de header.
- **commitTurn faalt bij hoge load**: er is al een race-retry-loop. Voor
  V0 schaal is dit ruim genoeg.
