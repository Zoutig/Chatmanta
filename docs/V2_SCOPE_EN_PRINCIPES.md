# V2-scope & leidende principes (gedistilleerd uit blueprint + bouwplan)

> **Herkomst.** Dit document distilleert wat nog leidend is uit de *Concept Blueprint v4.0* en het *Bouwplan v2.0 (8 fases)*, beide geschreven in mei 2026 vóór de eerste regel code. Gedistilleerd op **2026-10-05**. Zo'n 75% van de blueprint is inmiddels achterhaald: de code is de waarheid geworden. De originelen blijven als **historisch archief buiten de repo** (machine-lokaal bij Sebastiaan). Agents hoeven ze niet te lezen; dit document vervangt ze als referentie.
>
> **Rangorde bij conflict** (hoogste eerst):
> 1. **Code + migraties** (`supabase/migrations-v1/`, `lib/v1`, `app/v1`, `lib/rag`)
> 2. **`docs/V1_STATUS_EN_PLAN.md` → "Besliste keuzes 2026-06-29"** (de rest van dat document is een momentopname van juni en grotendeels ingehaald)
> 3. **Dit document**
>
> De operatieve hard rules (multi-tenancy, RLS, SA-1..SA-5, vector-isolatie, geen secrets in de client, anti-hallucinatie) staan in `AGENTS.md`. Valkuilen staan in `docs/AGENT_LANDMIJNEN.md`. Wat er nog vóór de launch moet gebeuren (ops/legal) staat in `docs/V1_LAUNCH_TODO.md`.
>
> **Legenda:** ✅ = in code aangetoond · ◐ = deels · ⛔ = (nog) niet gebouwd · ⚠️ verifiëren = kon niet hard bevestigd worden, niet op vertrouwen overnemen.

---

## 1. Wat dit document wel en niet is

- **Wel:** de scope-grens tussen V1 en V2/V3, de V2/V3-backlog, de principes voor billing, AVG en security-hardening, de nog open beslissingen, en een overzicht van waar we bewust van de blueprint zijn afgeweken.
- **Niet:** een bouwhandleiding, een datamodel (dat staat in de migraties) of een prijslijst. **Prijzen en marges: zie privé zakelijke documenten (niet in repo).**

---

## 2. V1-scope zoals hij werkelijk is

Blueprint §1.5 had een bindende lijst "Expliciet NIET in V1". Via V0-pariteit (de V1-dashboards zijn op de V0-dashboards gelijkgetrokken, PR #230/#233/#234/#236 en de dashboard-gaps-golven #239-#249) is een deel daarvan **toch in V1 gebouwd**. Het onderscheid hieronder is de nieuwe operatieve scope-regel.

**Nieuwe scope-regel voor agents:**
- Staat een feature in **2a**: het is V1. Onderhoud en verbeter hem gewoon.
- Staat een feature in **2b** (of in §3): het is **V2/V3**. Bouw hem niet zonder expliciete opdracht van Sebastiaan, ook niet "snel even".
- Staat hij nergens: vraag het eerst.

### 2a. Bewust tóch in V1 gebouwd (bewijs = migratie / code-pad)

| Blueprint zei "niet in V1" | Status | Bewijs |
|---|---|---|
| Lead capture in widget (`leads`-tabel) | ✅ als **contactverzoeken** (geen `leads`-tabel) | migr `0011_v1_contact_requests`; `app/api/v1/contact-request`; `app/v1/app/contactverzoeken/` (default uit per org) |
| Conversation viewer voor klant | ✅ | migr `0010_v1_conversations` (threads + thread_messages); `app/v1/app/gesprekken/` |
| Bronnen bij een antwoord (voor de klant) | ✅ **alleen in het dashboard**, niet in de widget | migr `0024_v1_thread_message_sources`; `app/v1/app/gesprekken/[id]/components/sources-panel.tsx` |
| Thumbs up/down in widget | ✅ | migr `0012_v1_feedback`; `app/api/v1/feedback` |
| Conversation export naar CSV | ✅ | `app/v1/app/gesprekken/export/route.ts`, `app/v1/app/contactverzoeken/export/route.ts` |
| Manual text als kennisbron | ◐ als **handmatige Q&A** (wordt als document geïngest) | migr `0013_v1_qa_items`; `app/v1/app/kennisbank/qa/` |
| Per-chatbot custom system prompts | ◐ **gestructureerd**: toon, lengte, `extraInstructions`, fallbacktekst (geen vrije system prompt) | migr `0005_v1_chatbot_settings`; `app/v1/app/instellingen/settings-config.ts` |
| Team-functionaliteit | ◐ meerdere leden met rol `owner/admin/member`, **uitgenodigd door de Jorion-admin** | migr `0001` (role-CHECK); `app/v1/admin/organizations/[id]/members-manager.tsx`. ⚠️ verifiëren of een klant zelf kan uitnodigen (lijkt alleen admin) |
| Custom branding | ◐ widget-kleuren, icoon, positie, teksten, chatbotnaam | `app/v1/app/widget/widget-form.tsx` (settings-jsonb `0005`) |
| Usage-grafieken | ◐ admin: bot-prestaties en overzicht; klant: top-vragen-balken (geen Recharts) | `app/v1/admin/bot-prestaties/`, `app/v1/app/_overview/top-questions-bars.tsx` |
| Taal | ✅ prompt-gebaseerd (`primaryLanguage` + `autoDetectLanguage`), **geen** `franc-min` | `lib/rag/run-rag-query.ts` (taal-instelling) |

**Extra V1-features die nergens in §1.5 stonden** (V0-pariteit, allemaal V1):
- "Meest gestelde vragen" (FAQ-snapshot + cron): migr `0014`, `app/api/v1/cron/faq-snapshot`
- Kennisbank-quiz (AI vindt gaten, klant vult aan): migr `0015`
- Klant-meldingen / feedback-tickets: migr `0016`, `0022`
- Admin-cockpit: overlay/onboarding/privacy (`0017`), operator-config (`0018`), Issues-foutstore (`0019`), maandelijkse recap + PDF (`0020`)
- Widget-levenscyclus (klant kan pauzeren + heartbeat): migr `0023`
- Operator-suspend van een org: migr `0025`
- Per-org dag-budget in EUR: migr `0009` (zie §9)

### 2b. Nog steeds buiten V1 → V2/V3-backlog

| Item | Waarom nog buiten | Doel |
|---|---|---|
| Bronvermelding **zichtbaar in de widget** | Bewuste keuze 2026-06-30: `sourceLinksEnabled: false` in `app/v1/app/rag-config.ts` | V2 |
| `/api/widget/history`-endpoint / 30-dagen-history | Geschiedenis reist mee in de chat-body binnen één sessie; geen server-endpoint | V2 |
| Klant beheert eigen `allowed_domains` | Read-only in de klant-UI, Jorion beheert (migr `0008`) | V2 |
| Klant kiest AI-provider/model | Eén model (gpt-4o-mini) | V2 |
| Klant stelt eigen gesprekken-cap in / `limits_override` | Cap is een constante (`MONTHLY_CONVERSATION_LIMIT`), budget is admin-instelbaar | V2 |
| Pay-as-you-go + tiers (trial/starter/pro/business) | Geen tier-code; handmatige facturatie | V2 (§4) |
| Usage-warning e-mails (80% / 100%) | Niet gevonden in `lib/v1/limits` of `lib/notifications` | V2 |
| Self-service AVG export/delete door de klant | Bestaat alleen als admin-actie (`app/v1/admin/organizations/[id]/export`, delete-org-form) | V2 |
| Multi-language dashboard-UI | Alleen NL | V2 |
| Notification preferences | — | V2 |
| 2FA voor klantaccounts | Alleen admin (AAL2-check, wordt actief zodra MFA enrolled is) | V2 |
| Geautomatiseerde RAG-evaluatie **als product-feature** | Bestaat alleen als interne tooling (`eval:*`, `v1:eval`) | V2 |
| Cohere Rerank | V0.10 gebruikt adaptieve **LLM-rerank** (gpt-4o-mini) | V2, alleen als eval het rechtvaardigt |
| LlamaParse / OCR / Excel / PowerPoint | Upload = PDF/DOCX/TXT/MD, max 10MB (migr `0006`) | V2 |
| Hybrid search (vector + keyword) | `hybridSearch: false` in V1-overrides (V0 heeft het wél) | V2/V3 |
| Dedicated vector-DB, edge-runtime-experimenten | pgvector volstaat | V3 / pas bij schaalprobleem |
| Meer dan één chatbot per org (in de UI) | Unieke index `chatbots_one_active_per_org` (migr `0002`) | V2 |
| API-toegang voor klanten, webhooks | — | V3 |
| Admin-impersonation | Niet gevonden | V3 |
| Widget-versioning, geavanceerd postMessage-protocol | Huidige embed = `widget-v1.js` | V2 |
| Uitgebreide `/api/health` met AI-ping, DB-CPU-alerts, publieke statuspagina, supporttooling | — | V2 |
| Aparte staging-Supabase | Er zijn twee projecten (V0 en V1-prod), maar geen V1-staging | V2 |
| Maandelijkse backup-restore-test | Eén keer vóór de launch volstaat | V2 |

---

## 3. V2/V3-productscope (backlog)

Dit komt uit blueprint §2, met wat al in V1 zit (§2a) weggestreept. Dit is **backlog, geen planning**. Volgorde en timing hangen af van feedback van de testklanten (zie §10, Pad A).

**V2: self-service en commercieel**
- Mollie-billing (abonnementen, webhooks, automatische facturatie, toegang stoppen bij wanbetaling). Zie §4.
- Self-service signup met onboarding-wizard (nu: invite-only via de Jorion-admin)
- Lead capture uitbreiden: contactverzoeken staan er al; V2 = koppelen aan tiers en notificaties verfijnen
- Branding uitbreiden: logo/avatar-upload bovenop de huidige kleuren/icoon
- Automatische periodieke hercrawl (frequentie per tier). Nu: handmatig opnieuw scannen.
- AVG-self-service: export en verwijderverzoek vanuit het klantdashboard
- Cohere Rerank / LlamaParse: alleen als de eval aantoont dat ze winst opleveren
- Dashboard in NL + EN, notification preferences, 2FA voor klanten (verplicht op de hoogste tier)
- Teams volledig self-service (klant nodigt zelf collega's uit)
- Vrije per-chatbot system prompts (nu gestructureerd)
- **LLM-provider-laag:** `callLLM`/`streamLLM` echt implementeren (nu een stub in `lib/ai/llm.ts`), Claude Haiku als backup, automatische fallback, **plus een her-eval** (de pipeline is getuned op gpt-4o-mini)
- Zichtbare bronnen in de widget (als de testklanten erom vragen)
- V2 Security Hardening SA-6 t/m SA-14 (§6)

**V3: action layer**
- Reserveringen, afspraken (Cal.com/Calendly/Google Calendar), offerte-intake, orderstatus via geverifieerde acties
- Live-chat-handover naar een mens
- API-toegang en webhooks voor klanten, CRM-integraties (HubSpot, Pipedrive)
- Realtime dashboard (Supabase Realtime), funnel- en attributie-analytics
- Hybrid search (BM25) en een eigen vector-DB zodra pgvector knelt

---

## 4. Tiers en billing (Mollie): structuur en principes

**Prijzen en marges: zie privé zakelijke documenten (niet in repo).** Hier staan alleen de structuur en de principes.

**Stand V1:**
- Geen tier-code en geen `subscriptions`-tabel. Facturatie gaat handmatig door Jorion Solutions.
- Kostenbeheersing gebeurt met drie runtime-poorten in `lib/v1/limits/chat-gates.ts`:
  1. operator-suspend (`organizations.suspended_at`, migr `0025`)
  2. maand-cap van 300 **turns** (query_log-rijen per org per kalendermaand; let op: niet het aantal unieke gesprekken)
  3. per-org dag-budget in EUR (`organizations.daily_budget_eur`, migr `0009`; som van `query_log.cost_eur`, migr `0007`)
- Een klant betaalt niet? Dan gebruik je **suspend** (eerlijke "tijdelijk niet beschikbaar"-melding), niet budget=0.

**Principes voor V2:**
- **Tiers leven in code** (een `TIER_LIMITS`-achtige constante), niet in de DB. De DB bewaart alleen welke tier een org heeft.
- **Eén telling-eenheid kiezen en consequent gebruiken.** De blueprint telde unieke gesprekken (24-uursregel); V1 telt turns. Beslis dit vóór de tiers live gaan. Threads (migr `0010`) maken unieke gesprekken nu telbaar.
- **Twee caps los van elkaar houden:** de commerciële cap (inbegrepen volume per tier, eventueel overage) en de abuse/kosten-cap (per-org EUR-dagbudget, rate-limits). De eerste is een contract, de tweede een vangnet. Het per-org EUR-dagbudget blijft verplicht voor productie.
- **Mollie boven Stripe** voor NL-MKB (iDEAL/SEPA, EU-btw). Stripe pas als internationale verkoop prioriteit krijgt. Webhook-signatuur verifiëren via de SDK.
- **Statusmachine:** `active` → `past_due` (mislukte betaling, korte grace) → blok. `cancelled` → grace → blok. Blokkeren betekent pauzeren (widget laadt nog, toont een nette melding), niet de embed laten verdwijnen.
- **Overage alleen met een klant-ingestelde cap.** De klant kiest zelf een plafond en wordt nooit verrast.
- Duurdere modellen alleen op tiers waar het inbegrepen volume ze dekt.
- **EUR-billing echt maken:** live FX en echte EUR-rates in plaats van de vaste `USD_EUR_RATE` (nu alleen een backstop).
- **Btw:** boekhouder raadplegen bij de eerste betalende klant (B2B is meestal verlegd, OSS bij B2C in de EU).

---

## 5. AVG, retentie, back-ups en monitoring

**AVG-principes (blueprint §26):**
- **IP-adressen nooit plat opslaan.** V1 slaat in `query_log.ip_hash` een gezouten SHA-256-hash op (getrunceerd, migr `0007`). Let op: dat wijkt af van de blueprint ("alleen in Redis"). `IP_HASH_SALT` moet gezet zijn → `V1_LAUNCH_TODO` #2.
- **Bezoekers-PII** (contactverzoeken): consent verplicht, harde verwijdering na 90 dagen (`lib/v1/observability/retention.ts`).
- **DPA's met alle sub-verwerkers** + privacyverklaring + lijst van sub-verwerkers online → `V1_LAUNCH_TODO` #10/#11 (🔴, open).
- **Data residency:** EU-regio voor Supabase. VS-providers mét DPA zijn acceptabel voor MKB-data. Een EU-only optie is een mogelijke V2-premiumfeature, alleen op klantvraag.
- **Rechten van betrokkenen in V1 = handmatig via de admin:** export (`app/v1/admin/organizations/[id]/export`, JSON) en verwijderen (org-delete met cascade + Storage-opruiming). Self-service = V2.
- **Geen PII in logs.** Sentry `beforeSend` scrubt met dezelfde redactor als de DB-error-sink (`lib/observability/sentry.ts`).
- Uploads: het origineel wordt na de ingest verwijderd; de chunks zijn de bron (migr `0006`).
- ⚠️ verifiëren: cookie/localStorage-notice in de widget en de juridische check of functionele localStorage zonder banner volstaat.

**Retentie:**

| Data | Blueprint-doel | V1-werkelijkheid |
|---|---|---|
| Contactverzoeken (bezoekers-PII) | — | 90 dagen hard delete. Code klaar, **pinger bewust uitgesteld** → `V1_LAUNCH_TODO` #7c |
| Gesprekken / query_log | 90 dagen (V2: langer per tier) | ⚠️ **geen automatische retentie in V1** (expliciet weggelaten in `retention.ts`). Open punt vóór echte volumes |
| Audit-logs | 365 dagen | ⚠️ geen cleanup gevonden |
| Soft delete → hard delete na 30 dagen | Algemeen patroon | `deleted_at` op orgs/chatbots/documents (migr `0001-0003`). ⚠️ verifiëren: er bestaat geen generieke cleanup-cron |

**Principe:** soft delete en hard delete strikt gescheiden houden. Elke query op een tabel met `deleted_at` filtert erop (vector search via JOIN). Een AVG-verwijderverzoek slaat de grace-periode over (art. 17).

**Back-ups:**
- Supabase Pro (dagelijkse back-ups) zodra er onvervangbare data is → `V1_LAUNCH_TODO` #9 (met trigger).
- PITR = V2 (#9-bis).
- Eén restore-test vóór de launch. Maandelijks = V2.
- Een restore-test draait in een geïsoleerd project zonder productie-secrets (SA-10).
- **GitHub is de enige bron van code-waarheid.**

**Monitoring:**
- Sentry is bedraad, maar inert tot `SENTRY_DSN` gezet is → #1.
- De Issues-foutstore (migr `0019`) vervangt de `error_logs` uit de blueprint. Audit-trail = migr `0004`.
- UptimeRobot → #14 (🟢).
- ⚠️ verifiëren: **er is geen `/api/health`-endpoint** gevonden (blueprint: DB-ping voor UptimeRobot). UptimeRobot pingt dus een gewone pagina.
- **Foutafhandelingsprincipes (tijdloos):** geen klantdata of bestandsnamen in foutmeldingen. Bij een AI-fout volgt een nette fallback-tekst, nooit de ruwe fout. Rate-limit geeft 429 met `Retry-After`.

---

## 6. Security Addendum: V2-hardening (SA-6 t/m SA-14)

SA-1..SA-5 (object-level authorisatie, SSRF, upload-hardening, LLM-grenzen, service-role-discipline) zijn V1-core en staan in `AGENTS.md`. De punten hieronder zijn **verplicht vóór self-service of een publieke launch**, niet vóór de begeleide testklanten.

| # | Kern-eis | Waarom | Stand nu |
|---|---|---|---|
| **SA-6** Abuse-limits | Extra rate-caps naast per-IP: per chatbot (berichten/uur, token-calls/min), per org (berichten/dag, uploads/dag, crawls/dag), max 1 actieve crawl per URL. Overschrijding → 429 + audit-entry | Gedistribueerde aanvallen, misbruik via meerdere bots en klant-loops worden niet door per-IP-limieten gedekt | ◐ per-IP/per-org rate-limit op chat/contact/feedback + EUR-dagbudget. ⚠️ verifiëren: Upstash actief op V1-prod (`V1_LAUNCH_TODO` #5) |
| **SA-7** Volledige security headers | CSP, `frame-ancestors 'none'` op dashboard/admin, smallere `frame-ancestors` voor het embed, HSTS, nosniff, Referrer- en Permissions-Policy | Standaard browser-hardening tegen XSS en clickjacking | ⚠️ **alleen `nosniff` op de chat-route gevonden**. Geen globale headers in `next.config.ts`/`proxy.ts`/`vercel.json`. Ook de V1-basis (SA-7-basis) lijkt dus open |
| **SA-8** Volledige log-redaction | Sentry `beforeSend`: auth-headers, cookies, tokens, signed URLs en API-keys strippen, chat-content trunceren, chunks nooit loggen. Geen complete request-bodies in console-logs | AI-apps lekken snel PII en secrets via logging | ◐ `beforeSend` + redactor bestaan. Volledigheid ⚠️ verifiëren (sample-check van de eerste events) |
| **SA-9** CSRF | Mutaties nooit via GET, Origin-check op expliciete POST-routes, admin-mutaties altijd achter `requireJorionAdmin`, step-up auth voor gevoelige acties | Server Actions zijn beschermd, losse API-routes niet automatisch | ⚠️ verifiëren per route |
| **SA-10** Backup-toegang | Back-ups alleen voor admins met 2FA. Restore-tests in een apart project met eigen secrets. Nooit een productie-back-up aan een AI-agent geven (gebruik geanonimiseerde samples) | Een back-up is een complete datalek-kopie | Procedure, geen code |
| **SA-11** Supply chain | `npm audit` vóór de deploy (CI), Dependabot aan, lockfile gecommit. Elke nieuwe dependency onderbouwen (waarom, onderhoud, alternatief). Populair boven obscuur, geen vertrouwen in onbekende `postinstall`-scripts | npm is een veelgebruikte aanvalsvector | ⚠️ `.github/` bevat alleen `build.yml`: geen Dependabot, geen audit-stap |
| **SA-12** Secrets-rotatie + incidentrespons | Bij een lek: direct roteren, Vercel-env vervangen, redeployen, logs doorzoeken, incident-log schrijven, getroffenen **binnen 72 uur** informeren (AVG-meldplicht). Zonder incident: jaarlijks roteren (embed-token-secret, `CRON_SECRET`, service-role, provider-keys) | Een geoefend playbook voorkomt paniekwerk | Procedure, geen code |
| **SA-13** Error-message policy | Publieke endpoints geven alleen generieke teksten (401/403/404/429/500). De diagnose gaat naar de Issues-store + Sentry | Geen interne ID's, provider-fouten, SQL of stacktraces naar bezoekers | ◐ basis in V1. Volledige audit ⚠️ verifiëren |
| **SA-14** Security-testchecklist | V1-kern: cross-tenant-toegang (UI, directe URL, vector search), token/origin-weigering, geen CORS `*`, magic-bytes, SSRF-blocklist, cron zonder secret → 401, geen losse service-role-imports. V2-uitbreiding: cross-org tokenmisbruik, prompt-injection-leak, Sentry-sample, CSP/CSRF/HSTS-test, malware-scan op uploads, DNS-verificatie voor `allowed_domains`, geïsoleerde restore, Dependabot | Aantoonbaar in plaats van aangenomen veilig | ⚠️ verifiëren welke V1-kernpunten formeel afgevinkt zijn. Er is een injection-redteam (`docs/SECURITY_INJECTION_REDTEAM_2026-07.md`) |

---

## 7. Open beslissingen (blueprint §34/§35)

**Nog echt open:**
1. **Fallback bij een uitval van de AI-provider (V2):** wanneer schakelt de automatische switch, direct of na N retries? Hangt aan de `callLLM`-mijlpaal.
2. **Migratie van pgvector naar een dedicated vector-DB:** drempel (orde ~1M chunks of te hoge zoeklatency) en concreet plan pas wanneer dat dichterbij komt.
3. **Onboarding bij V2-self-service:** wizard, of de klant doorloopt het dashboard zelf? Laat dit informeren door de testklanten.
4. **Pricing-structuur en definitieve prijzen:** valideren met de eerste klanten (privé documenten).
5. **EU-only data residency:** alleen op concrete klantvraag.
6. **API-rate-limiting voor klant-API (V3).**
7. **Samenvatten van lange gesprekken:** nu wordt de history getrunceerd tot de engine-limiet; een echte strategie ontbreekt.
8. **Telling-eenheid voor de maand-cap:** turns (nu) of unieke gesprekken (blueprint)? Zie §4.
9. **Chat-retentie V1/V2:** termijn en mechanisme voor `query_log`/threads (§5).
10. **Stripe vs Mollie:** voorkeur Mollie (§4). Definitief bij de V2-start.
11. Marketing-site, logo/huisstijl-afronding, Engelse dashboard-UI, LlamaParse, CRM/webhooks/API-design: allemaal V2/V3 en zonder haast.

**Beslist (eruit):**
- Chunk size: beslist, parent-child **3200/400 + 800/100 tekens** (`lib/rag/chunker.ts`), niet 500/50 tokens. Blijft een tunable.
- Bronvermelding in de widget: beslist, **uit in V1** (`sourceLinksEnabled: false`, 2026-06-30). Bronnen zijn alleen zichtbaar in het klantdashboard (migr `0024`).
- Reranking: beslist voor nu, **adaptieve LLM-rerank** (gpt-4o-mini) in de v0.10-config. Cohere alleen als de eval winst aantoont.
- Formaat lead capture: beslist, contactformulier (naam, e-mail/telefoon, voorkeur, onderwerp, bericht, consent), migr `0011`.
- LLM in V1: beslist, gpt-4o-mini, geen fallback (V1_STATUS "Besliste keuzes" #1/#2).
- Usage-log: beslist, `query_log` hergebruiken (geen aparte `usage_logs`), met `cost_eur` (migr `0007`).
- Team-functionaliteit V1: beslist, meerdere leden via een admin-invite (§2a).
- Productnaam: de facto ChatManta (domeinen, code). ⚠️ verifiëren of dit formeel definitief is.

---

## 8. Tijdloze principes (blueprint §32/§33, gecondenseerd)

- **Een multi-tenant-lek is catastrofaal.** Elke nieuwe tabel krijgt `organization_id` + RLS in dezelfde migratie. Vector search filtert altijd verplicht op org (+ chatbot). Code-review richt zich hier bewust op.
- **Kostenexplosie is een reëel risico.** Spending caps bij de providers, rate-limits op elke publieke route, een per-org dagbudget en een harde page-cap op crawls (`MAX_CRAWL_PAGES = 50`).
- **Liever geen antwoord dan een fout antwoord.** Similarity-drempel, fallback zonder LLM-call, testset per klant en meten via eval vóór je iets wijzigt.
- **De widget mag de klantsite nooit breken.** Iframe-isolatie, en bij een fout graceful degraderen.
- **Secrets alleen server-side.** Nooit in `NEXT_PUBLIC_*` of in git. Een gelekte key geldt als gelekt: roteren.
- **Geen PII in logs.** Geen publieke Storage-buckets. Geen CORS `*`.
- **Zware verwerking niet synchroon in een request** als die de timeout kan raken (crawls lopen via `processing_jobs` + een pinger).
- **Cascade-regels expliciet op elke FK.** Soft en hard delete gescheiden houden. HNSW-index op vectoren.
- **Nooit direct naar `main`.** Feature-branches, PR's, build groen.
- **Admin-2FA vóór echte klantdata.** Eén gestolen adminwachtwoord kan alle orgs raken.
- **Onboard geen klant op een product dat niet werkt.** Vertrouwen is in één keer weg.
- **Solo-risico:** gefaseerd werken, klein committen en pauzes nemen. Bouw V2-features pas als klanten erom vragen.

---

## 9. "Blueprint zei X → we doen Y"

| Onderwerp | Blueprint zei | We doen | Waarom / bewijs |
|---|---|---|---|
| Similarity threshold | 0.7 | **0.4** | Empirisch: 0.7 is te streng voor `text-embedding-3-small` + NL. `similarityThreshold: 0.4` in `app/v1/app/rag-config.ts` |
| Chat-LLM | Claude Haiku 4.5 via `callLLM()`, OpenAI als fallback | **gpt-4o-mini direct** (`openai()`), géén fallback. Provider-abstractie = V2 | Pipeline is op gpt-4o-mini getuned en geëvalueerd. `callLLM` gooit nog "not implemented" (`lib/ai/llm.ts`). Besliste keuze 2026-06-29 |
| Usage-tracking | `usage_logs`-tabel per event | **`query_log`** met `cost_usd` + `cost_eur` + `ip_hash` | Geen duplicatie. Migr `0002` + `0007` |
| Kosten-cap | `subscriptions` + tier `conversations_per_month: 300` (unieke gesprekken) | **Maand-cap van 300 turns** + **per-org EUR-dagbudget** + **suspend**. Geen `subscriptions`-tabel | `lib/v1/limits/usage-limits.ts`, `chat-gates.ts`; migr `0009`, `0025` |
| RAG-pipeline | Chunk 500/50 → top-K 5 → één prompt | **v0.10-config geërfd**: parent-child-chunks, (selectieve) HyDE, query-decompositie, adaptieve LLM-rerank, claim-verificatie + regeneratie, deterministische hard-fact-weigering, low-confidence-cascade naar gpt-4o, answer_cache, latency-budget. Retrieval top-K 8 → max 5 contextchunks | `V1_RAG_DEFAULTS = {...resolveBot('v0.10'), ...V1_OVERRIDES}`. In V1 uit: hybrid search, algemene kennis, bronlinks |
| Answer cache | Niet voorzien | **`answer_cache`** (chatbot-scoped) + epoch tegen een stale-write-race | Migr `0003`, `0021`. Let op: de cache is ook de opslag voor FAQ-pre-cache (zie `AGENT_LANDMIJNEN`) |
| Achtergrondverwerking | `processing_jobs` voor document, crawl, reprocess en delete, gestart met `waitUntil()` | `processing_jobs` **alleen voor crawls** (`job_type in ('crawl_website')`), verwerkt door een cron-route + externe pinger. Uploads worden **synchroon** geïngest in de server-action | Migr `0003` CHECK; `app/v1/app/kennisbank/actions.ts`; `V1_LAUNCH_TODO` #7 |
| Widget-sessietoken | HMAC, 1 uur | HMAC embed-token, **30 min** default (`EMBED_TOKEN_TTL_SEC`) | `lib/v1/widget/embed-token.ts`. Geflagd ter review in `V1_LAUNCH_TODO` #13 |
| `allowed_domains` | Aparte tabel + DNS-verificatie (V2) | `text[]` op `chatbots`. Leeg = fail-open. Jorion-beheerd | Migr `0008`, `lib/v1/widget/origin-lock.ts` |
| IP-hashes | Alleen in Upstash met TTL, nooit in Postgres | Gezouten + getrunceerde hash **ook in `query_log`** | Migr `0007`. Gepseudonimiseerd, niet plat |
| Error-logs | `error_logs`-tabel | **Fingerprint-gegroepeerde Issues-store** (`admin_error_groups`) + Sentry | Migr `0019` |
| Omgevingen | Eén Supabase + later staging | **Twee gescheiden Supabase-projecten** (V0-sandbox en V1-prod, fysieke PII-scheiding) met **twee migratie-ledgers** | `AGENTS.md` (Migrations) |
| Dev-tooling en kosten | Cursor als IDE. Anthropic-API als hoofd-LLM-kost | Ontwikkeling via **Claude Code** (`AGENTS.md`/`CLAUDE.md`). **Runtime-LLM-kosten = alleen OpenAI**. Anthropic SDK staat in `package.json` maar is ongebruikt | `AGENTS.md` (Stack). Kostentabellen: privé documenten |
| Bronvermelding | Intern opslaan, zichtbaar = V2 | Zichtbaar voor de **klant in het dashboard**, niet voor de bezoeker | Migr `0024`; `sourceLinksEnabled: false` |
| Onboarding | Invite-only via `/admin/organizations/new` | Zelfde, onder `/v1/admin/organizations/new`, met token-hash-invite-flow | `app/v1/admin/organizations/new/`, `app/v1/auth/confirm/route.ts` |

---

## 10. Na de launch: welk pad? (bouwplan "Na Fase 8")

- **Pad A: polish + 2-3 extra klanten** (aanbevolen in het bouwplan, en nog steeds de beste keuze). Verwerk de feedback van de eerste klant, onboard klant #2/#3, maak de onboarding herhaalbaar, en begin pas serieus aan V2 als er 3-5 klanten draaien.
- **Pad B: direct V2.** Billing (Mollie) + tiers, self-service signup, branding, klant-cap, history-endpoint, Resend-SMTP voor auth-mails, SA-6..SA-14. Let op: lead capture, gesprekkenviewer en export uit de oorspronkelijke Pad-B-lijst zitten **al in V1** (§2a).
- **Pad C: pauze + reflectie** (~1 week). Niets bouwen, de klanten observeren, en product-market-fit en prijsrealisme toetsen.

**Aanbeveling: Pad A.** Reden: V1 heeft al méér dan de oorspronkelijke scope (§2a). Het grootste onbekende is nu niet de functionaliteit, maar of echte klanten er waarde uit halen en wat ze willen betalen. V2-features bouwen zonder die signalen betekent bouwen voor jezelf.
