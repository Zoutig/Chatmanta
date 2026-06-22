# Klantendashboard — fixes & tweaks (2026-06-19)

**Status:** design / awaiting sign-off
**Branch:** `feat/seb/dashboard-fixes` (worktree `../chatmanta-dashfixes`, off `origin/main`)
**Levering:** PR1 = bugs (#1/#2/#3), PR2 = features (#4/#5/#6). PR1 eerst mergen+deployen.

Zes punten uit Sebastiaans punchlist. Drie zijn kapot/ontbrekend (bugs), drie zijn
nieuwe tweaks (features). Alles binnen V0; geen V1 hard rules geraakt (geen nieuwe
multi-tenancy/RLS-tabellen; service-role-reads via bestaande wrappers).

---

## PR1 — Bugs

### #1 — "Mag de chatbot algemene kennisvragen beantwoorden?" doet niets

**Root cause (geverifieerd).** De toggle, save-action, DB-persist (`v0_org_settings.chatbot.answerGeneralKnowledge`)
en cache-purge zijn allemaal correct. Het probleem zit in de pipeline-gate:

```
// lib/v0/server/rag.ts:1374-1375
const enableGeneralKnowledge = input.enableGeneralKnowledge !== false;
const generalKnowledgeActive = bot.generalKnowledgeEnabled && enableGeneralKnowledge;
```

De klant-toggle voedt `enableGeneralKnowledge`, maar de prod-bot **v0.10** heeft
`generalKnowledgeEnabled: false` (alleen v0.5 had `true`). De AND kan dus nooit
waar worden op prod → de toggle is gegarandeerd een no-op. `LATEST_BOT_VERSION = v0.10`
en zowel `/api/v0/chat` (embed/widget) als de test-pagina resolven naar LATEST.

**Beslissing:** org-toggle wint (zonder een bot-versie-snapshot te muteren — append-only blijft intact).

**Fix.** Maak een expliciete org-opt-in autoritatief; val terug op de versie-default
als er géén expliciete waarde is:

```
const generalKnowledgeActive = input.enableGeneralKnowledge ?? bot.generalKnowledgeEnabled;
```

Waarom dit veilig is:
- `/api/v0/chat` levert `enableGeneralKnowledge` altijd als **expliciete boolean**
  (`explicitGeneralKnowledge ?? chatbotOverrides?.answerGeneralKnowledge ?? false`,
  route.ts:369-370). Opt-in org → `true` → GK aan. Niet-opt-in → `false` → GK uit (fail-closed).
- Eval / overige callers die `enableGeneralKnowledge` **niet** meesturen → `undefined`
  → terugval op `bot.generalKnowledgeEnabled` → **eval-baselines blijven exact gelijk**
  (huidige effectieve gedrag voor undefined was óók `bot.generalKnowledgeEnabled`).
- Geen mutatie van v0.10's snapshot; geen nieuwe bot-versie nodig.

**Te checken bij implementatie:** alle referenties naar de lokale `enableGeneralKnowledge`
variabele verderop in `rag.ts` (regel 1374 verdwijnt) — herschrijf naar
`generalKnowledgeActive` waar relevant. Grep `enableGeneralKnowledge` binnen rag.ts.

**Verificatie.** Opt-in org op een echte sandbox-org (bv. via test-pagina of
`npm run v0:chat`): stel een algemene-kennis-vraag binnen het domein waarvoor géén
bron bestaat → bot moet de GENERAL-opening geven ("Even kort: dit valt buiten onze
specifieke documentatie, maar in het algemeen …") i.p.v. de vaste fallback. Toggle
uit → vaste fallback terug.

### #2 — Instellingen niet "gelijk" zichtbaar in de widget

**Status (2026-06-19, na prod-onderzoek):** géén server-side cache-bug gevonden.
Curl op prod toont: `/embed/<slug>` → `Cache-Control: private, no-cache, no-store`
+ `X-Vercel-Cache: MISS` (vers per request, `force-dynamic`); `/widget.js` →
`max-age=0, must-revalidate` (revalideert via ETag). `widget.js` bouwt de iframe
zonder config-caching/localStorage. **De server levert dus al verse config bij elke
host-pagina-load.** Resterende oorzaken zijn client-side: (a) een al-geopende
iframe update niet live (vereist host-pagina-herlaad — inherent aan iframes), of
(b) browser-cache aan klantzijde. **→ Uit PR1 gehaald; wacht op een concrete
reproductie van Sebastiaan** (welke instelling, waar gekeken, host-pagina herladen?).
Geen blinde fix.

**Oorspronkelijke hypothese (behouden voor context):**

Bekend uit de code:
- De echte embed `app/embed/[slug]/page.tsx` is `export const dynamic = 'force-dynamic'`
  en leest `getOrgSettings` vers per request → uiterlijk-config is live bij de
  volgende laad.
- `revalidatePath('/embed…')` wordt **nergens** aangeroepen; de save-actions
  revalideren `/klantendashboard` + `/widget` (dashboard-demo), niet de embed.
- `saveChatbotSettings` purged de answer-cache (antwoord-gedrag), `saveWidgetSettings` niet
  (uiterlijk heeft geen answer-cache-relevantie).

**Plan:**
1. Reproduceer op prod: wijzig een widget-instelling, herlaad de host-pagina met de
   embed, kijk welke laag stale is (iframe-HTML via `/embed/[slug]`, of `widget.js`,
   of browser/CDN-cache). Vergelijk met een harde refresh / incognito.
2. Pin de laag, pas de **minimale** fix toe — waarschijnlijk `Cache-Control: no-store`
   op de embed-respons en/of cache-busting op de iframe-src in `widget.js`. Geen
   bredere herarchitectuur.
3. Verifieer: instelling wijzigen → host-pagina herladen → direct zichtbaar.

Acceptatie: na opslaan is een uiterlijk-wijziging zichtbaar bij de eerstvolgende
host-pagina-load zonder handmatige cache-clear.

### #3 — Preview Chatbot toont geen screenshot van de gescrapte site

**Root cause (waarschijnlijk, 2 sporen).** De screenshot-URL wordt opgelost via
**alleen** het mock-profiel `websiteUrl` (`resolveOrgWebsiteUrl`, actions.ts:163-167).
4 prod-orgs hebben daar een echte URL, dus voor hen zou de Firecrawl-capture moeten
werken — wat wijst op:
- (a) **`FIRECRAWL_API_KEY` niet gezet op Vercel prod** (bekende open check) →
  `screenshotSite` → `null` → mockup-fallback; en/of
- (b) de resolve is te smal: een echt gecrawlde org (of `demo-nieuw`, `websiteUrl: ''`)
  heeft geen mock-URL, terwijl de crawler de **echte root-URL al persisteert** in
  `website_sources.root_url`.

**Fix (twee delen):**
1. **Ops:** verifieer `FIRECRAWL_API_KEY` op Vercel prod (via Vercel-MCP/Vercel-UI);
   ontbreekt 'ie → zetten + redeploy (env-wijziging werkt pas na redeploy).
2. **Durable (geïmplementeerd):** `resolveOrgWebsiteUrl` probeert nu **eerst** de
   gecrawlde `knowledge_sources.root_url` (nieuwe lichte helper `getPrimaryWebsiteRootUrl`),
   en pas daarna het mock-`websiteUrl`. Reden: de mock-URLs van de demo-orgs zijn
   vaak fictieve domeinen (dakwerkendeboer.nl, fysioplus-utrecht.nl, …) die niet
   bestaan → Firecrawl-screenshot faalt. De gecrawlde root-URL is de site die de
   klant écht scrapte ("screenshot van de gescrapte website") en bestaat gegarandeerd.

   **Geverifieerd op prod (read-only):** alleen *Demo Nieuw* (mock-URL leeg, crawl
   `v0-demo1-website.vercel.app`) en *Dev Org* hebben een echte crawl; géén org had
   een gecachte preview (alle `widget_preview` null) — dus niemand kreeg ooit een
   geslaagde capture, consistent met de fictieve mock-URLs. Na deploy levert het
   openen van de Preview-tab voor Demo Nieuw een echte screenshot.

**Verificatie.** Open de Preview-tab voor een org met een gecrawlde site → screenshot
verschijnt (cache-hit op de tweede open, geen extra Firecrawl-call). Prod-check via
Vercel-runtime-logs op `[captureWidgetPreview]`.

---

## PR2 — Features (nieuwe tweaks)

Gemeenschappelijk: drie kleine, **klant-getriggerde** `gpt-4o-mini`-calls. Billable
maar bewust (de klant klikt zelf), elk achter `checkMutationLimit()` (abuse/cost-rem,
zelfde poort als bestaande mutaties). Org server-side uit de cookie. Geen migratie
nodig — nieuwe settings-velden landen in de bestaande `v0_org_settings` jsonb via
partial-merge.

### #4 — Startsuggesties: genereerknop + uit-toggle

- **Genereerknop** naast het Startsuggesties-veld in `instellingen/settings-form.tsx`.
  Nieuwe action `generateStarterQuestionsAction` → gpt-4o-mini. Input: `companyDescription`
  + top-FAQ (`klant_faq_snapshot` / meest-gestelde-vragen) + enkele gecrawlde
  pagina-titels als context. Output: 3–4 korte NL-voorbeeldvragen. **Vervangt** de
  textarea-inhoud (klant kan daarna handmatig bijschaven). Lost meteen "moeilijk tekst
  toevoegen" op.
- **Uit-toggle** "Startsuggesties tonen" (nieuw veld `showStarterQuestions: boolean`,
  default `true`, in `ChatbotSettings`). Bij `false` rendert de widget/embed/preview
  géén suggestie-chips. Consumptie-punten: `app/embed/[slug]` (chips), `preview-widget.tsx:319`
  (`showSuggested && …`), en de echte widget-render.

### #5 — Fallbackbericht: genereerknop

- **Genereerknop** naast het Fallbackbericht-veld. Nieuwe action
  `generateFallbackMessageAction` → gpt-4o-mini. Input: `chatbotName` + `companyDescription`
  + gekozen toon + contactgegevens. Output: één warme, op het bedrijf toegesneden
  fallback-zin (NL, geen markdown). **Vervangt** het veld; klant bevestigt door op te slaan.

### #6 — Autofill contactgegevens + pagina-URL na scrape

- **Knop "Vul contactgegevens automatisch in"** in de Fallback &amp; contact-sectie van
  Instellingen. Nieuwe action `extractContactInfoAction` → gpt-4o-mini. Input: tekst
  van gecrawlde contact-/over-ons-pagina's (`website_pages.content_text`, org-gescopet
  via service-role-read, gefilterd op contact-achtige URLs/titels, anders een
  begrensde sample). Output (JSON): `{ contactEmail, contactPhone, contactPageUrl }`.
- **Apply-mode:** prefilt de form-velden **client-side**; de klant reviewt en slaat
  zelf op (geen stille overschrijving). PII blijft binnen de eigen org (geen redactie
  nodig — het is de eigen publieke contactinfo, terug naar de eigen settings).
- Velden bestaan al in `ChatbotSettings` (`contactEmail`, `contactPhone`, `contactPageUrl`).
  De **website-/root-URL** voor de screenshot wordt in #3 al uit `website_sources.root_url`
  gehaald, dus #6 hoeft geen aparte websiteUrl te persisteren.

---

## Niet-doelen (YAGNI)

- Geen nieuwe bot-versie / eval-run (de #1-fix raakt geen baseline).
- Geen nieuwe DB-tabel of migratie (settings-velden zijn jsonb-merge).
- Geen redesign van de embed-cache-architectuur — alleen de minimale #2-fix na repro.
- Geen automatische (ongevraagde) LLM-calls bij crawl-einde; alles is knop-getriggerd.

## Risico's / aandachtspunten

- **#1** verandert runtime-gedrag voor orgs die GK aanzetten. Mitigatie: opt-in,
  fail-closed default, smoke-test op echte org vóór merge. Historisch eval-gevoelig
  (v0.9 "112"-regressie) — daarom alleen op expliciete opt-in, niet versie-breed.
- **#2** fix pas finaliseren ná prod-repro; spec houdt de fix bewust open.
- **#4/#5/#6** billable: gated op mutation-rate-limit; cheap (gpt-4o-mini).
