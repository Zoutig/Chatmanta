# Security-audit ChatManta (V1 en publieke delen), 19 okt 2026

Alleen gelezen: er is niets gewijzigd, niets naar productie geschreven en er zijn geen betaalde calls gedaan. Elke bevinding is door twee onafhankelijke controleurs nagelopen. Waar die de ernst hebben bijgesteld, staat hier de bijgestelde ernst.

## Samenwerking in 5 regels
1. Er is geen lek gevonden waarmee de ene klant data van een andere klant kan zien. RLS, de service-role-wrappers, de vector-search en de widget-slug houden de klanten goed van elkaar gescheiden.
2. Het grootste directe risico ligt lokaal. Het wachtwoord van het seed-admin-account op V1-prod staat in platte tekst in een handoff-bestand dat nog niet gecommit is. Eén `git add docs/` en het staat in de publieke repo.
3. De publieke widget stuurt meer naar de browser dan hij laat zien: stukken tekst uit de kennisbank (ook als de bot weigert), bestandsnamen en kosten.
4. AVG: de belofte "na 90 dagen verwijderd" voor contactverzoeken in V1 wordt niet nagekomen, omdat de cron die dat doet nergens draait. Daarnaast missen de consenttekst en de privacyverklaring onderdelen (voor de widget en voor de leads).
5. Iedereen kan de widget van een klant platleggen, door de vragenlimiet op te maken of de klant met mails te bestoken. De widget-token-route controleert alleen een header, en die kan een script zelf invullen.

## Top 3: eerst doen (zelf nog een keer in de code gecontroleerd)

1. **Wachtwoord uit het handoff-bestand halen en daarna wijzigen.** `docs/handoffs/HANDOFF_2026-10-09_v1-ui-golf-2-en-4.md:110` bevat het e-mailadres en wachtwoord van de seed-admin op V1-prod. Ik heb dat bevestigd. Het bestand is untracked en wordt niet door `.gitignore` tegengehouden.
2. **De V1-widgetstream filteren.** In `app/api/v1/chat/route.ts:161-166` gaat elk event ongefilterd naar de bezoeker (`JSON.stringify(enriched)`). Ook dat heb ik bevestigd.
3. **De V1-retentie-cron laten draaien.** `vercel.json` bevat alleen de V0-crons. Ik heb bevestigd dat `/api/v1/cron/retention` er niet in staat.

---

## Bevindingen die de controle overleefden

### 1. Admin-wachtwoord in platte tekst in een handoff-bestand
- **Ernst:** middel. Nu nog latent, maar het wordt hoog/kritiek zodra het bestand gecommit wordt.
- **Bestand:** `docs/handoffs/HANDOFF_2026-10-09_v1-ui-golf-2-en-4.md:110`
- **Wat er mis kan gaan:** de andere handoffs in die map zijn wél gecommit. Als dit bestand meegaat, staat het wachtwoord van een **Jorion-admin op productie** in de publieke repo. Het e-mailadres staat er al meer dan 40 keer publiek in. Wie dit vindt, kan inloggen en alle klantgesprekken, contactverzoeken en 1387 leads lezen. De git-historie is nog schoon.
- **Fix:** haal de regel weg en verwijs naar `V1_SEED_MEMBER_PW` in `.env.local`. Wijzig het wachtwoord op V1-prod toch, want het staat ook in lokale notities en memory. Bekijk ook of een seed-account met een publiek bekend e-mailadres admin moet blijven.

### 2. Widget stuurt kennisbankfragmenten, bestandsnamen en kosten naar anonieme bezoekers
- **Ernst:** middel
- **Bestand:** `app/api/v1/chat/route.ts:161-166` (de bron van de events is `lib/rag/run-rag-query.ts:1186-1217`, 2199, 2391, 2423 en 2464)
- **Wat er mis kan gaan:** een bezoeker stelt een vraag die niets met het bedrijf te maken heeft. De bot weigert netjes, maar in de ruwe netwerkrespons (NDJSON) staan toch alle opgehaalde chunks: per chunk tot ongeveer 800 tekens, ook uit geüploade documenten die niet publiek zijn, plus de bestandsnamen. Daarnaast staan er `totalCostUsd`, de drempelwaarde, de botversie en interne stappen in. Daarmee is de anti-hallucinatie- en weigergrens te omzeilen (hard rule 8), en is je kostprijs per antwoord te zien. Andere klanten worden niet geraakt.
- **Fix:** zet een whitelist per event in de route, vóór `enqueue`. Laat alleen deze velden door: `meta`, `status.phase`, `answer-delta.text`, `{kind, answer}` bij de eindevents, `followUps` en `error` (alleen code + requestId). `finalResponse` blijft voor logging de volledige server-side versie. Voeg een test toe die controleert dat `sources`, `totalCostUsd` en `parentExcerpt` niet in de respons zitten.

### 3. De 90-dagen-verwijdering van V1-contactverzoeken draait niet
- **Ernst:** middel (twee onderzoeksdimensies kwamen hier onafhankelijk op uit; één controleur noemde het "een ops-herinnering, geen codefout")
- **Bestanden:** `app/api/v1/cron/retention/route.ts:6-8`, `vercel.json:3-6`, `docs/V1_LAUNCH_TODO.md:80-83`. De belofte staat in `app/privacy/page.tsx:238-239` en `app/v1/app/instellingen/settings-form.tsx:628`.
- **Wat er mis kan gaan:** de route bestaat en is goed beveiligd, maar er is geen pinger. Die is in juli bewust uitgesteld, met als reden "geen echte klant-PII". Inmiddels draait V1 live bij testklanten. Vanaf ongeveer half januari 2027 blijven contactgegevens langer staan dan de privacyverklaring belooft. Ook "Verwijderen" in het klantdashboard zet alleen een `deleted_at`-markering: daarna ruimt niets de gegevens echt op. De RLS-SELECT-policy (`supabase/migrations-v1/0011_v1_contact_requests.sql:54-61`) filtert niet op `deleted_at`, maar dat is alleen data van de eigen klant.
- **Fix (aanbeveling: optie B, omdat er dan geen extern onderdeel bij komt):** roep `runV1ContactRetention(getV1ServiceRoleClient(), {apply})` aan vanuit de bestaande, dagelijkse `/api/v0/cron/retention`. Optie A is een cron-job.org-pinger op `/api/v1/cron/retention` (eerst testen met `?dryRun=1`). Zet daarnaast `deleted_at is null` in de policy (nieuwe migratie) en werk #7c bij.

### 4. Iedereen kan de dag- en maandlimiet van een klant opmaken (de widget ligt dan plat)
- **Ernst:** middel (van hoog verlaagd: het gaat om beschikbaarheid, geen datalek, en de EUR-cap blijft staan)
- **Bestanden:** `lib/v1/limits/chat-gates.ts:92-129`, `app/api/v1/widget/token/route.ts:23`, `lib/v1/widget/origin-lock.ts:13-22`
- **Wat er mis kan gaan:** `sameOrigin()` vergelijkt alleen de Origin- en Referer-header. Een script (curl) vult die zelf in, en krijgt dus een token voor elke slug. Daarna kan het simpele vragen als "hoi" sturen, en elke beurt telt mee. Vanaf één IP is de daglimiet van 250 in ongeveer 8 minuten op. Met wisselende IP's is de maandlimiet van 2000 in ongeveer 17 minuten op. Daarna ziet elke echte bezoeker van die klant tot de volgende maand "maandlimiet bereikt". Dit geldt ook voor de demo `/voorbeeld`.
- **Fix:** voeg een dagbucket per (org, ipHash) toe, bijvoorbeeld 30-50 vragen per dag via Upstash, met de prefix `org-ip-day:`. Laat de token-route ook `evaluateEmbedAccess` en `is_active`/`suspended` controleren. Overweeg een alert als een klant binnen een uur meer dan 50% van de daglimiet gebruikt.

### 5. Mailbom via het contactformulier
- **Ernst:** middel
- **Bestanden:** `app/api/v1/contact-request/route.ts:34,61,127` (V0: `app/api/v0/contact-request/route.ts:171,237`)
- **Wat er mis kan gaan:** er zijn alleen limieten per minuut: 10 per IP en 120 per org. Een daggrens is er niet. Elke inzending stuurt een Resend-mail naar de klant. Vanaf één IP komen er zo ongeveer 14.400 mails per dag. Gevolgen: de inbox van de klant loopt vol, echte leads verdwijnen ertussen, en het Resend-quotum en de domeinreputatie van chatmanta.com gaan omlaag (ook je opvolgmails gaan dan mis). Voorwaarde: de klant heeft het contactformulier aan. In V0 komt de idempotentie-sleutel `visitorId` uit de body, dus die werkt niet.
- **Fix:** een dagcap per org (bijvoorbeeld 20-50) en per (org, ipHash) (bijvoorbeeld 3). Boven N mails per uur één digest-mail sturen in plaats van losse mails. In V0 de visitor-id uit de header of cookie halen.

### 6. MFA-controle leest "heeft 2FA" uit een cookie die de gebruiker kan aanpassen
- **Ernst:** middel (nu nog latent, want er is nog geen MFA ingesteld)
- **Bestand:** `lib/auth.ts:86-95`
- **Wat er mis kan gaan:** `getAuthenticatorAssuranceLevel()` zonder argument haalt `user.factors` uit de sessie-cookie. Alleen het access_token in die cookie is ondertekend, het user-object niet. Stel dat je MFA aanzet (launch-TODO 9b) en iemand je wachtwoord heeft. Die persoon logt in, maakt `user.factors` leeg in zijn eigen cookie, en komt dan langs de gate in `/v1/admin` en `/v1/leads`. De tweede factor beschermt dan niets.
- **Fix:** bepaal "heeft MFA" via de geverifieerde user uit `getUser()` (`user.factors?.some(f => f.status === 'verified')`). Roep `getAuthenticatorAssuranceLevel(accessToken)` mét jwt-argument aan, of gebruik `getClaims()`.

### 7. De consenttekst in de V1-widget is niet "geïnformeerd"
- **Ernst:** middel (één controleur zei laag)
- **Bestand:** `lib/v1/widget/widget-strings.ts:84` (EN: `:112`), getoond in `app/embed-v1/_widget/contact-form.tsx:119-122`
- **Wat er mis kan gaan:** de tekst noemt geen bedrijfsnaam, geen bewaartermijn en geen privacylink. V0 deed dat wel (`lib/v0/server/contact-offer.ts:34`). Toestemming is de enige grondslag die je gebruikt (art. 7/13 AVG). Het commentaar in `lib/v1/observability/retention.ts:15-16` dat de tekst de 90 dagen "spiegelt", klopt niet.
- **Fix:** maak de zin dynamisch, zoals in V0: "Ik ga ermee akkoord dat {orgnaam} mijn gegevens gebruikt om contact met me op te nemen. Mijn gegevens worden na 90 dagen verwijderd." Gebruik daarvoor `V1_CONTACT_RETENTION_DAYS`. Zet er een privacylink bij. Doe dit pas nadat bevinding 3 is opgelost.

### 8. Leads (koude acquisitie) staan niet in de privacyverklaring
- **Ernst:** middel
- **Bestanden:** `app/privacy/page.tsx` (§2 A-D), `lib/leads/opvolgmail.ts:247`, `supabase/migrations-v1/0034_v1_leads_opschonen_fix.sql:23-39`
- **Wat er mis kan gaan:** bij eenmanszaken en vof's zijn contactpersoon, e-mail en telefoon persoonsgegevens. De privacyverklaring noemt deze verwerking nergens. De opvolgmail vermeldt niet waar de gegevens vandaan komen en niet hoe je bezwaar maakt. Leads met status open/opvolgen/kans/terugbellen/heeft_chatbot worden nooit opgeschoond. Een ondernemer die vraagt "hoe komen jullie aan mijn gegevens?" kan dat nergens nalezen (art. 14 AVG).
- **Fix:** voeg aan de privacyverklaring sectie "E. Zakelijke acquisitie" toe: bron, welke gegevens, gerechtvaardigd belang als grondslag, bewaartermijn en hoe je bezwaar maakt. Zet een korte regel over herkomst en afmelden in de footer van de opvolgmail. Stel een maximumtermijn in voor open leads, bijvoorbeeld 24 maanden zonder update. Dat is een nieuwe migratie, dus eerst het plan voorleggen.

### 9. Padcontrole bij document-upload is met `../` te omzeilen
- **Ernst:** laag (verlaagd van middel; twee dimensies vonden dit)
- **Bestanden:** `app/v1/app/kennisbank/actions.ts:392`, hetzelfde patroon in `app/v1/admin/organizations/[id]/actions.ts:745`
- **Wat er mis kan gaan:** de check is alleen `path.startsWith(`${orgId}/${chatbotId}/`)`. Met `orgA/botA/../../orgB/...` normaliseert fetch het pad naar dat van org B, en de download draait als service-role. Met drie keer `../` kom je ook bij `v1-feedback-attachments`, waar de paden voorspelbaar zijn. Om dit te misbruiken heb je de UUID's van een andere klant nodig, en die worden nergens getoond. Toch klopt de belofte in het commentaar op r.373-374 niet.
- **Fix:** een strikte regex op het formaat dat de server zelf maakt: `^<orgId>/<chatbotId>/<uuid>-[A-Za-z0-9._-]{1,120}$`. Of weiger `..`, `%` en `\`. Voeg een unit-test toe met `../` en met `%2e%2e`.

### 10. Er is geen MFA-inschrijving of -challenge in de app
- **Ernst:** laag
- **Bestanden:** `lib/auth.ts:93-95`, `app/v1/login/v1-sign-in-card.tsx:76-101`
- **Wat er mis kan gaan:** als je launch-TODO 9b letterlijk volgt en MFA instelt via het Supabase-dashboard, sluit je jezelf buiten `/v1/admin` en `/v1/leads`. De app heeft geen stap om de tweede factor in te voeren. Herstel kan alleen door de factor in Supabase weer te verwijderen.
- **Fix:** bouw een kleine `/v1/auth/mfa`-pagina (inschrijven en challenge) **vóór** 9b, en los bevinding 6 tegelijk op.

### 11. Klanten kunnen via de Supabase-API interne kosten- en limietkolommen lezen
- **Ernst:** laag (verlaagd van middel; het gaat alleen om data van de eigen klant)
- **Bestanden:** `supabase/migrations-v1/0001_core_tenancy.sql:143-154`, `0002_v1_rag_core.sql:187-194`
- **Wat er mis kan gaan:** de RLS-policies werken per rij, maar geven alle kolommen vrij. Een ingelogde klant kan met de eigen JWT en de publieke anon-key `cost_eur`, `cost_usd`, `ip_hash` en `daily_budget_eur` lezen. Volgens migratie 0027 is dat laatste "niet zichtbaar voor de klant". Zo kan een klant je marge zien.
- **Fix:** een migratie die `revoke select` uitvoert en daarna kolomsgewijs `grant select` geeft op organizations en query_log (en eventueel op de kostenkolommen in quiz, faq en crawl). Voeg een PostgREST-test toe aan `v1:test-org-isolation`.

### 12. `allowed_domains` is te omzeilen met `Referrer-Policy: no-referrer`
- **Ernst:** laag (verlaagd van middel; dit is al als restrisico vastgelegd in AGENT_LANDMIJNEN:529-534)
- **Bestanden:** `lib/widget/origin-allowlist.ts:54`, `app/embed-v1/[slug]/page.tsx:30`, `lib/v1/widget/load-embed.ts:57`
- **Wat er mis kan gaan:** iemand kan de widget van een klant in een iframe op een vreemde site zetten. Daarvoor zet hij de referrer uit, of geeft hij `?h=klant.nl` mee. De "host-in-token"-oplossing die voor V1 gepland stond, is nooit gebouwd.
- **Fix:** een CSP-header `frame-ancestors` op `/embed-v1/*` op basis van allowed_domains. Dit lost het framen op, maar niet het misbruik van het quotum (dat is bevinding 4).

### 13. De answer-cache kan PII van bezoeker A aan bezoeker B tonen
- **Ernst:** laag (gevonden in twee dimensies)
- **Bestand:** `lib/rag/run-rag-query.ts:556-566, 3512-3521` (de drempel van 0,93 staat op `:468`)
- **Wat er mis kan gaan:** de eerste vraag en het antwoord gaan zonder redactie de cache in. Stel dat bezoeker A zegt "Ik ben Jan..." en de bot antwoordt "Hoi Jan". Een bijna gelijke vraag van bezoeker B kan dan dat antwoord terugkrijgen. Dit is aannemelijk, maar niet bewezen.
- **Fix:** sla de cache-lookup en de cache-write over als `redactPii(original) !== original`, of als de vraag een zelfintroductie bevat zoals "ik ben" of "mijn naam is".

### 14. De admin-privacyinstellingen per klant doen niets
- **Ernst:** laag
- **Bestanden:** `app/v1/admin/organizations/[id]/_components/privacy-form.tsx:55-73`, `app/v1/admin/instellingen/page.tsx:97-101`
- **Wat er mis kan gaan:** bewaartermijn, PII-redactie en logging zijn in te stellen, maar geen enkel codepad gebruikt ze. Als Niels of jij "30 dagen" belooft in een verwerkersovereenkomst, klopt dat niet.
- **Fix:** zet bij deze velden in de UI "nog niet actief in V1", of verberg ze.

### 15. Bijlagen van feedbacktickets blijven staan na het verwijderen van een org
- **Ernst:** laag
- **Bestand:** `app/v1/admin/organizations/[id]/actions.ts:151-171`
- **Wat er mis kan gaan:** alleen de bucket `v1-documents` wordt opgeruimd, en `v1-feedback-attachments` niet. Na het verwijderen zijn de bestanden voor niemand meer bereikbaar, maar ze blijven wel bestaan.
- **Fix:** dezelfde recursieve list en remove ook op `v1-feedback-attachments/<orgId>/`.

### 16. Oude interne prijzen, kosten en marges staan in de publieke repo
- **Ernst:** laag
- **Bestanden:** `docs/evals/2026-05-12-v0.3-v0.4-v0.5-full.md:1116`, `docs/evals/2026-05-12-v0.5-extensie-run3.md:1995-2035`, `eval-fixtures/seed-questions-holdout-dev-org.json:327-356`, `eval-fixtures/seed-questions.json:75`
- **Wat er mis kan gaan:** dit is in strijd met hard rule 10. Iedereen kan de kostenstructuur en de aannames over marges lezen.
- **Fix:** vervang de bedragen door `[intern bedrag]` of door fictieve bedragen. Zoek ook in `plans/016-eval-herziening.md`, `docs/LUNA_ONDERZOEK_RESULTATEN.md` en `lib/evals/__tests__/stats.test.ts`.

---

## Waarschijnlijk vals alarm
Geen enkele bevinding is door beide controleurs weerlegd. De nuances die het meest uitmaken:
- **Retentie (bevinding 3):** één controleur vond het "vals alarm als codefout". Volgens hem blijkt uit de code niet dat er bij een klant echt contactverzoeken binnenkomen (het formulier staat standaard uit), en is het een vastgelegde ops-beslissing. Hij zag het als terechte ops-herinnering, met deadline vóór half januari.
- Bij veel bevindingen is de ernst met een stap verlaagd, omdat er geen data tussen klanten lekt. Dat geldt onder meer voor de RLS-kolommen, de padcontrole, `allowed_domains` en de answer-cache.

## Laag (niet apart door twee controleurs geverifieerd)
- **`upsertQAItemAction` voert de ingest uit vóór de objectcheck** (`app/v1/app/kennisbank/qa/qa-actions.ts:106`). Bij een onbekende id ontstaat een onzichtbaar wees-document dat de bot wel gebruikt. Fix: geef eerst `NOT_FOUND` terug.
- **Het verwijderen van een lid of org kan het account van een andere Jorion-admin wissen** (`app/v1/admin/organizations/[id]/actions.ts:178-198, ±415-430`). Fix: sla users met `is_jorion_admin` over.
- **Het loginscherm toont willekeurige tekst uit `?error=`** (`app/v1/login/page.tsx:20`). Dat is bruikbaar voor phishing-teksten op je echte domein. Fix: toon alleen bekende foutcodes.
- **Twee child-tabellen zonder `organization_id`**: `v1_feedback_ticket_event` (0016) en `admin_recap_signals` (0020). Er lekt nu niets, maar het wijkt af van hard rule 2.
- **Scrape-, retry- en upload-acties hebben geen per-org rate-limit**, en ook een geschorste org kan ze uitvoeren (`app/v1/app/kennisbank/actions.ts:279, 344, 376, 433`).
- **De V0-widget-chat accepteert body-overrides** (threshold, enableGeneralKnowledge, version) van token-callers (`app/api/v0/chat/route.ts:188-229`). Daarmee wordt hij een gratis LLM-proxy, begrensd op $2 per dag per V0-org.
- **De quotumcheck telt `query_log`, dat pas na de stream wordt geschreven** (`lib/v1/limits/chat-gates.ts:124-133`). Gelijktijdige bursts schieten daardoor door de cap heen.
- **Retentie-crons melden `ok:true` als de delete mislukt** (`lib/v1/observability/retention.ts:72-80`, `lib/controlroom/server/retention.ts:76-85`).
- **`audit_logs` bewaart e-mailadressen voor onbepaalde tijd**, en de privacyverklaring noemt een IP-hash die nooit wordt meegegeven.
- **`hashIp` werkt ook zonder `IP_HASH_SALT`** (fail-open). Neem de salt op in `assertProductionEnv`.
- **De SSRF-check mist NAT64/6to4, redirects en DNS-rebinding** (`lib/rag/crawler/validateCrawlUrl.ts`). Het risico is beperkt, omdat de fetch bij Firecrawl draait.
- **`npm audit`** geeft 4 meldingen die in de praktijk niet bereikbaar zijn. `npm audit fix` lost de melding over source-map-js op. Gebruik **geen** `--force`, want dat breekt mammoth.
- **Namen van testklanten met familierelatie en je privé-gmailadres** staan in de docs en seed-scripts (`docs/HERSTART_2026-10.md:26` en andere).

## Gecontroleerd en in orde
- **Scheiding tussen klanten:** alle 38 V1-tabellen hebben RLS aan in dezelfde migratie. Er is geen `using(true)` en geen schrijfpolicy voor klanten. Overal staat `organization_id NOT NULL`, op de twee child-tabellen na.
- **Service-role (SA-5):** alleen de twee wrappers maken een service-role-client, en een grep-test dwingt dat af.
- **Object-level access (SA-1):** elke klant-action haalt de org uit de sessie en beperkt queries tot org (+ chatbot). Elke admin- en leads-action en elke admin- en leads-pagina controleert zelf `requireJorionAdmin`.
- **Vector-search:** `orgId` en `chatbotId` zijn verplicht, er is een soft-delete-JOIN, en de functies zijn security invoker.
- **Publieke widgetroutes:** org en chatbot komen alleen uit de HMAC-gesigneerde slug. `appendTurn` weigert een vreemde threadId.
- **Embed-token:** fail-closed, met een constant-time vergelijking.
- **XSS en postMessage:** geen `dangerouslySetInnerHTML` in de widget, en links worden alleen via de allowlist doorgelaten. De origin-checks in de loaders zijn correct.
- **Secrets:** de git-historie is schoon. `NEXT_PUBLIC_*` bevat alleen URL's en de anon-key. Client components importeren geen servercode.
- **Overig in orde:** de crons (fail-closed en timing-safe), `/v1/auth/confirm` (geen open redirect), CSV-formule-injectie (wordt afgevangen), de Sentry-redactie en de redactie van `query_log`.
- **Leads:** RLS staat aan zonder policies, de RPC's zijn alleen voor service_role, en de view gebruikt `security_invoker`.
- **V0-vangrails voor `v0_contact_requests`:** de slug is aan het token gebonden, consent is verplicht, er is een honeypot en een hard delete na 90 dagen via een Vercel-cron. Eén gat: de retentie-cron meldt `ok` als de delete mislukt (zie "Laag").