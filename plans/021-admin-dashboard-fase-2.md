# 021 — Admin-dashboard fase 2: support namens de klant

**Status:** PLAN (19 okt 2026), nog niets van gebouwd. Elke fase krijgt een eigen akkoord van Sebastiaan.
**Basis:** het admin-onderzoek van 19 okt (code gelezen, read-only SELECT's op V1-prod), de
completeness-critic van dezelfde avond en een eigen bronlezing van de bestanden hieronder.
**Afbakening:** dit plan gaat over wat er **vannacht niet** gebouwd wordt. De nachtbranch
`feat/seb/admin-herzien` (worktree `chatmanta-nacht-admin`) had bij het schrijven nog geen commit,
maar wel werk in uitvoering. Dat werk staat in §3.1 en wordt hier niet opnieuw gepland.

> **Woordenlijst (kort).**
> - **Service-role**: de "loper" van de database. Die sleutel slaat de toegangsregels (RLS) over.
> - **RLS** (row level security): de database-regel "je ziet alleen rijen van je eigen org".
> - **SA-1 / object-ID-match**: heeft de client een ID gestuurd, dan controleert de server zelf
>   of dat ID bij de juiste org hoort. Vergelijk het met een sleutelbos waarbij je per sleutel
>   checkt of hij bij dit huis hoort.
> - **Audit-log**: het logboek van "wie veranderde wat, wanneer" (tabel `audit_logs`).
> - **Fan-out**: dezelfde set queries opnieuw draaien voor elke org.
> - **Migratie**: een genummerd SQL-bestand dat het databaseschema wijzigt.
> - **RPC**: een databasefunctie die je met één aanroep uitvoert.

---

## 1. Samenvatting en aanbeveling

De admin is technisch netjes, maar Niels kan er een klant nog niet mee **helpen**. Wat de klant zelf
kan (pagina's kiezen en opnieuw crawlen, een pagina aan of uit zetten, een Q&A-correctie toevoegen,
de bot testen, de widget pauzeren) kan de admin niet, op upload na. Bij elke klacht moet Niels dus
de klant vragen het zelf te doen, of Sebastiaan vragen het via Claude Code of SQL te doen.

Dit plan bestaat uit negen fases (§5). Drie hebben een migratie nodig (testchat, lead → klant en
de performance-RPC). De rest hergebruikt bestaande code.

**Voorwaarde:** Sebastiaan bevestigt eerst besluit B0 (dit is V1-scope, geen V2-supporttooling of V3-impersonation).

**Aanbeveling: begin met fase A (gedeelde basis) en fase B (Kennisbank namens de klant, inclusief
Q&A-correctie en "cache legen"). Doe daarna D (testchat) en pas dan de rest.**

Waarom deze volgorde:
1. De meest waarschijnlijke supportklacht is "de bot zegt iets verkeerds" of "de bot weet het niet"
   (zie het playbook, §6, problemen 1, 2, 3 en 8). De oplossing ligt bijna altijd in de kennisbank:
   een pagina opnieuw ophalen, een verouderde pagina uitzetten, een Q&A-paar toevoegen of de cache legen.
2. B heeft **geen migratie** nodig. De klantacties bestaan al en controleren al per ID op org en
   chatbot (`app/v1/app/kennisbank/actions.ts:257-304`). We halen de kern eruit en laten
   klant en admin dezelfde functie aanroepen. Er komt geen tweede kopie die uit de pas kan lopen.
3. Fase A maakt elke latere admin-schrijfactie veilig volgens één vast patroon (§4.1). Daarom eerst.
4. De testchat (D) is de tweede helft van "verkeerd antwoord" (naspelen). Hij vraagt wel een
   migratie en een kostenkeuze, dus apart en na B.

---

## 2. Besluiten die Sebastiaan moet nemen

Bij elk besluit staat mijn aanbeveling. Het zijn eigen keuzes, tenzij er "vastgelegd" bij staat.

| # | Besluit | Aanbeveling | Reden |
|---|---|---|---|
| B0 | **Scope-grens:** valt "admin-acties namens de klant + testchat" onder V1? `docs/V2_SCOPE_EN_PRINCIPES.md` zet "Admin-impersonation" op V3 (`:79`) en "supporttooling" op V2 (`:81`). | **Ja, V1.** Daarna die afbakening vastleggen in `V2_SCOPE_EN_PRINCIPES.md` §2. | Het is geen impersonation: er is geen sessie-overname, alleen admin-acties op `orgId` met de eigen admin-identiteit in de audit-log. De admin doet dit al (upload `:692-786`, limieten, botinstellingen, leden). "Supporttooling" staat in de ops-regel naast health-ping en statuspagina. Toch moet Sebastiaan dit expliciet bevestigen (hard rule 1), anders twijfelt elke reviewer opnieuw. Zonder akkoord op B0 bouwen we geen fase B-D. |
| B1 | Mag Niels zelf acties met kosten starten (crawl, losse pagina, testchat)? Er is maar één rol (`users.is_jorion_admin`). | **Ja, met vaste plafonds** (crawl-bucket per org, testchat max 30 vragen per org per dag). Geen aparte supportrol. | Zonder kosten-acties lost hij de top-3 niet op. Een supportrol vraagt een migratie plus een tweede gate, en dat is nu overkill met twee admins. |
| B2 | Waar loggen we testchat-vragen? (a) kolom `query_log.channel`, (b) aparte tabel `admin_test_log`. | **(b) aparte tabel.** | `query_log` = "één bezoekersvraag" is de definitie van de klantlimieten (`lib/v1/limits/usage-limits.ts:6`) en wordt door ~12 lezers gebruikt (overview, klant-detail, recap, metrics, shell-counts, faq, bot-performance…). Bij (a) moet elke lezer een filter krijgen, en een vergeten filter laat testvragen in de klantstatistiek lekken. Bij (b) is één extra som in de EUR-budgetcheck genoeg. Wordt die vergeten, dan telt alleen de test-kosten niet mee, en die zijn al begrensd door B1. Faalt dus veilig. |
| B3 | Telt een testvraag mee in de **vragen**limiet van de klant (250/dag, 2000/mnd)? | **Nee.** Wel in het **EUR-kostenplafond** (vastgelegd in de opdracht: "kosten tellen mee in budget"). | De klant ziet zijn vragen-teller. Daar horen Niels' tests niet in. Het EUR-vangnet beschermt tegen kosten, daar hoort het wel in. |
| B4 | Mag de admin testen bij een opgeschorte of gepauzeerde org? | **Ja, met een duidelijke banner** ("widget staat uit voor bezoekers"). Het EUR-plafond blijft gelden. | Juist bij "mijn bot doet het niet" wil je kunnen testen. Let op: dit vraagt een kleine wijziging in `prepareV1WidgetChat`, want de pauze-check staat daar vóór en los van `orgGates` (§4.4). |
| B5 | Moet "crawl opnieuw" (admin) de paginaselectie van de klant respecteren? | **Ja.** Dezelfde URL's als de huidige (ingesloten) pagina's. Zonder pagina's: via de Kennisbank-tab ontdekken en selecteren. | De huidige retry ontdekt opnieuw en neemt de eerste 50 URL's (`app/v1/admin/jobs/actions.ts:71-72`). Dat kan andere content in de kennisbank zetten dan de klant koos. |
| B6 | Commerciële status: eenmalig invullen voor alle bestaande orgs (prod-datawrite)? | **Ja**, via het profielformulier in de UI of één SQL-batch met akkoord: interne orgs `internal_test`, de echte testklant `trial`. | `admin_org_profile` heeft 0 rijen. Daardoor vuren de rode gezondheidsregels nooit (`lib/controlroom/server/health.ts:66-71`). |
| B7 | Wat doen we met een org **zonder** profielrij? | Tonen als **"Status onbekend, stel in"** (oranje), niet stil als `internal_test`. De wizard schrijft altijd een rij (`trial`). | Het nachtfilter verbergt orgs met een intern slug-patroon. Een nieuwe echte klant zonder rij moet zichtbaar blijven én opvallen. |
| B8 | Lead ↔ klant: kolom op `leads` of op `organizations`? | **`leads.organization_id`** (nullable, uniek). | `leads` heeft al een gesanctioneerde uitzondering op hard rule 2 (`supabase/migrations-v1/0032_v1_leads.sql:5-7`). `organizations` blijft schoon. |
| B9 | Performance: nu een SQL-functie (migratie), of eerst alleen meten? | **Eerst meten (fase G, stap 1).** Pas bij >1,5 s serverrender de RPC. | Het nachtfilter haalt interne orgs vóór de fan-out weg. Bij een paar echte klanten is het probleem misschien al weg. |
| B10 | Ziet de klant dat ChatManta-support iets namens hem heeft veranderd? | **Nu niet in de UI, wel in de audit-log.** Later eventueel een regel "aangepast door ChatManta-support". | Minimale scope. De audit-log is het bewijs, en de klant heeft zijn eigen kennisbank-UI om het resultaat te zien. |

---

## 3. Huidige situatie (pad:regel)

### 3.1 Wat er vannacht al gebouwd wordt (niet dubbel doen)
Worktree `chatmanta-nacht-admin`, branch `feat/seb/admin-herzien`, bij het schrijven nog niet gecommit:
- **Filter op interne orgs** vóór de fan-out: `lib/v1/admin/internal-orgs.ts` (slug-patronen
  `eval-`, `seed-org`, `testbedrijf`, `test-`, `demo-` en de demo-slug; een expliciete klantstatus wint),
  `lib/v1/admin/org-list.ts` (gedeelde orglijst + profielen), de schakelaar `internal-toggle.tsx`. Aangepast in
  Overzicht, Klanten, Onboarding, Gebruik en Botprestaties.
- Volgens het onderzoek waren daarnaast "veilig vannacht" (alleen lezen, of een kleine
  bestaande schrijfactie): V1-attentiesignalen in de gezondheid, het blok "Wat is er aan de hand" op klant-detail,
  een rijker gespreksdetail (bronnen, fallback, cache-hit), echte modelinfo in Instellingen, kruisverwijzingen
  en issues per klant, contactverzoeken per klant (alleen lezen), een half-automatische onboardingchecklist,
  het menu opschonen (10 → 5 tabs), audit aanvullen en eventueel de knop "cache legen".
- **Eerste stap van fase A is daarom altijd:** lees `git log main` en kijk wat er van deze lijst echt
  gemerged is. Pas daarna de fases hieronder aan. Gaat "cache legen" vannacht niet mee, dan valt hij in fase B.

### 3.2 Bestaande admin-schrijfacties (het patroon dat we volgen)
- `app/v1/admin/organizations/[id]/actions.ts:31-41` `requireAdminActor()`: requireJorionAdmin, actor-id
  en een nette ActionFail, NEXT_REDIRECT gaat door.
- Goede voorbeelden van het object-ID-patroon: `adminResendMemberInviteAction` (`:336-343`, lid moet bij
  deze org horen), `setAllowedDomainsAction` (`:634-638`, `.eq('id').eq('organization_id')`) en
  `adminProcessUploadedDocAction` (`:745`, pad moet in `<orgId>/<chatbotId>/` liggen).
- Upload namens de klant **bestaat al**: `:692-786` (signed URL → magic bytes → ingest → purge → audit).
- Het gat: `setOrgLimitsAction` (`:61-97`) heeft geen auditregel, en `adminRetryCrawlAction`
  (`app/v1/admin/jobs/actions.ts:27-124`) heeft geen audit en negeert de selectie van de klant (`:71-72`).

### 3.3 Klantacties die de admin mist
- Kennisbank: `discoverPagesAction` `:103`, `startSelectedCrawlAction` `:130` (betaald),
  `deleteWebsiteSourceAction` `:204`, `tickCrawlIngestAction` `:242`, `setPageIncludedAction` `:258`,
  `retryPageAction` `:279`, `scrapeSinglePageAction` `:433`, `getDocContentAction` `:468`,
  `getPageContentAction` `:499`, `deleteDocumentAction` `:536`, allemaal in
  `app/v1/app/kennisbank/actions.ts`. Ze krijgen hun context uit `requireV1OrgChatbot()` (`:44-50`, sessie-org).
- Q&A: `upsertQAItemAction` `:84`, `deleteQAItemAction` `:189`, `setQAActiveAction` `:243` in
  `app/v1/app/kennisbank/qa/qa-actions.ts`. **Bekend gebrek:** het oude document wordt al uitgezet
  (`:118-124`) **vóór** de nieuwe ingest (`:129-143`). Faalt die ingest, dan is het antwoord stil weg.
  Dat eerst repareren, dan pas porten (critic §C).
- Widget: `toggleWidgetActiveAction` en `checkWidgetInstallationAction` in `app/v1/app/widget/actions.ts:36-89`;
  de embedcode wordt inline gebouwd in `app/v1/app/widget/install-step.tsx:56`.
- Testen: `/v1/app/preview` (`app/v1/app/preview/page.tsx`) gebruikt `askV1` (`app/v1/app/actions.ts:23-160`).
  **Bijvangst:** `askV1` logt de previewvragen van de klant gewoon in `query_log` (`:143-153`, ipHash null),
  dus die tellen nu al mee in de klantstatistiek en de vragenlimiet. Dat is los op te lossen (open vraag V3).
- De client-componenten importeren de klantacties direct: `kennisbank-view.tsx:23`, `v1-documents.tsx:14`,
  `components/managed-pages.tsx:9`, `single-page-import.tsx:5`, `website-list.tsx:7`, `website-tab.tsx:9`.

### 3.4 Chatpad, kosten en limieten
- Het gedeelde widgetpad: `app/v1/app/widget-chat.ts:85-170` `prepareV1WidgetChat` (pauze, gates, settings,
  config, `runRagQuery`). Het heeft al een `orgGates: 'skip'`-optie en `disableCache` voor de eval (`:63-77`, `:145-154`).
- De gates: `lib/v1/limits/chat-gates.ts:4-11` (suspend → rate-limit → maand → dag → EUR). De EUR-som komt uit
  `getOrgSpendTodayEur` (`lib/v1/limits/usage-limits.ts:124`).
- Transcript: `/api/v1/chat` schrijft `threads`/`thread_messages` alleen met een threadId (`app/api/v1/chat/route.ts:198-216`).

### 3.5 Leads, profiel en prestaties
- `public.leads` heeft status `klant` maar geen verwijzing naar een org (`supabase/migrations-v1/0032_v1_leads.sql:14-63`).
  RLS staat aan zonder policies, dus alleen de service-role kan erbij. Hoogste V1-migratie in de repo: `0037`.
- `admin_org_profile` (`supabase/migrations-v1/0017_v1_admin_overlay.sql:29-59`): standaard `commercial_status`
  = `internal_test`, en die default staat ook in `lib/controlroom/types.ts:139-144` (gedeeld met V0).
- Fan-out: `lib/v1/admin/overview.ts:236-283`, 15 queries per org (o.a. `query_log ... cost_eur .limit(20_000)`
  op `:272`, in JS opgeteld). Het onderzoek telde ~240 queries per pagina bij 17 orgs.
- Mobiel: de schil heeft een drawer onder 900px (`app/v1/_ui/ui.css:167`, `:375-385`), de tabs scrollen horizontaal
  (`ui.css:465`) en tabellen krijgen alleen een negatieve marge (`app/v1/admin/_ui/admin.css:114-117`). **Niet op een
  telefoon getest**, door niemand (critic §D6).

---

## 4. Ontwerp

### 4.1 Het vaste patroon voor elke nieuwe admin-schrijfactie
Eén helper in een nieuw bestand `app/v1/admin/organizations/[id]/_lib/admin-ctx.ts` (server-only):

```ts
// 1) requireJorionAdmin → actorId   2) org bestaat en is niet verwijderd   3) chatbot van díe org
export async function requireAdminOrgCtx(orgId: string):
  Promise<{ ok: true; ctx: { sb; orgId; chatbotId; actorId } } | { ok: false; fail: ActionFail }>
```

Regels, gecontroleerd in de review:
1. **Gate eerst:** `requireAdminOrgCtx(orgId)` vóór elke service-role-call (hard rule 4/5).
2. **Object-ID-match:** elk ID van de client (`pageId`, `docId`, `sourceId`, `qaId`, `jobId`) gaat alleen de
   query in met `.eq('organization_id', orgId).eq('chatbot_id', chatbotId)`. Raakt die 0 rijen, dan
   `NOT_FOUND`. Nooit eerst op ID ophalen en daarna de org afleiden (dat doet `adminRetryCrawlAction` nu wel;
   voor een admin is dat geen lek, maar met de vaste volgorde is het patroon overal gelijk).
3. **Audit:** `writeAuditLog(sb, { organizationId, userId: actorId, action, targetType, targetId, metadata })`
   na elke geslaagde mutatie. Naamgeving `<domein>.<werkwoord>`, met `metadata.via = 'admin'`. Nieuwe namen:
   `kb.discover`, `kb.crawl_start`, `kb.crawl_retry`, `kb.page_include`, `kb.page_exclude`, `kb.page_retry`,
   `kb.page_add`, `kb.source_delete`, `kb.document_delete`, `qa.upsert`, `qa.delete`, `qa.toggle`,
   `cache.purge`, `widget.pause`, `widget.resume`, `admin_test.ask` (alleen een teller per dag, niet per vraag),
   `lead.link`, `lead.unlink`, `profile.update`.
4. **Gedeelde kern, geen kopie:** de logica komt in `lib/v1/kennisbank/ops.ts` (en `lib/v1/kennisbank/qa-ops.ts`)
   met de signatuur `(ctx: { sb, orgId, chatbotId }, …)`. De klantactie wordt dan
   `getSessionOrg → ctx → op()`, de adminactie wordt `requireAdminOrgCtx → op() → writeAuditLog`.
   De object-check zit in `op()` en geldt dus voor beide paden.
5. **Isolatietest:** `npm run v1:test-org-isolation` krijgt per adminactie een negatieve case
   (ID van org B met orgId A → `NOT_FOUND`, geen mutatie).
6. **Een gebonden `orgId` is client-input.** Een server action die met `.bind(null, orgId)` als prop naar een
   client-component gaat, stuurt die `orgId` mee naar de browser, en die komt terug als input die de client kan
   aanpassen. Het binden is dus géén beveiliging. Elke adminactie draait `requireAdminOrgCtx(orgId)` per aanroep
   opnieuw, en de object-ID-match zit in `ops.ts` (regel 2). Voor een Jorion-admin lekt een aangepaste `orgId`
   niets (die mag alle orgs), maar het patroon mag nooit leunen op "de orgId klopt want wij hebben hem gebonden".

### 4.2 Fase B: Kennisbank namens de klant
- **UI:** de Bronnen-tab (alleen lezen, `_tabs/bronnen-tab.tsx:1-2`) wordt de tab "Kennisbank". Die toont dezelfde
  componenten als de klant (paginalijst per bron, ontdekken en selecteren, pagina aan/uit, opnieuw ophalen, losse pagina,
  document bekijken of verwijderen, Q&A). De componenten krijgen hun acties via een prop/context `KennisbankActions`
  in plaats van een directe import. De klant geeft zijn eigen acties door, de admin geeft acties die al aan `orgId`
  gebonden zijn. Upload (bestaat al) komt in dezelfde tab.
- **Rate-limit:** de admin gebruikt dezelfde `crawl:${orgId}`-bucket als de klant (`kennisbank/actions.ts:111`, `:144`).
  Zo kunnen klant en admin samen niet dubbel crawlen. Het Firecrawl-loket per team (PR #285) blijft de buitenste grens.
- **Admin-retry (B5):** `adminRetryCrawlAction` herschrijven. De URL's komen uit
  `documents where knowledge_source_id = :source and source='website' and included and deleted_at is null`
  (`metadata.source_url`), plus pagina's met status mislukt. Zijn er geen: geen Firecrawl-call, maar de melding
  "Kies de pagina's opnieuw in de Kennisbank-tab". Plus audit `kb.crawl_retry`.
- **Q&A:** eerst `qa-actions.ts` repareren (nieuw document ingesten, pas bij succes het oude uitzetten en de rij
  bijwerken). Daarna de kern verplaatsen naar `qa-ops.ts`, en dan de admin-varianten. Q&A-items kosten alleen
  embedding-centen.
- **Cache legen:** `adminPurgeCacheAction(orgId)` → `purgeAnswerCache(sb, orgId, chatbotId)` voor elke chatbot van de
  org (patroon `:580-587`) + audit `cache.purge`. Alle kennisbank-mutaties purgen al zelf. Deze knop is voor
  "oud antwoord" en na een LATEST-promotie.
- **Wat bewust niet:** geen bulk-acties over orgs heen, geen "alles opnieuw crawlen voor iedereen".

### 4.3 Fase C: Widget-tab namens de klant
- **Embedcode:** `buildEmbedSnippet(origin, slug)` uit `install-step.tsx:56` naar `lib/v1/widget/embed-snippet.ts`
  (puur). De klant- en admin-UI gebruiken hem allebei. Knoppen: "Kopieer" en "Mail naar webbouwer" (alleen een `mailto:`-link,
  geen server-mail, dus geen Resend-pad). Alleen lezen.
- **Pauzeren/activeren:** `adminSetWidgetActiveAction(orgId, active)`, `.eq('organization_id').eq('id', chatbotId)`,
  bevestigingsdialoog, audit `widget.pause`/`widget.resume`. In de UI duidelijk anders dan **opschorten**
  (org-niveau, Beheer-tab, `actions.ts:453`). Geen cache-purge nodig (`app/v1/app/widget/actions.ts:8-9`).
- **Installatie controleren:** hergebruik wat de nachtbranch `feat/seb/installatie-sneller` bouwt. Komt er
  niets, dan alleen een verse read van `widget_last_seen_at/origin`. **Let op:** de origin van de heartbeat kan de
  client zelf invullen (critic §A, `v1-widget.tsx:103`). Toon hem als "laatst gemeld vanaf", nooit als bewijs.
- **allowed_domains leeg** wordt een rode regel in dit tabblad (bestaat als editor: `allowed-domains-editor.tsx`).

### 4.4 Fase D: Testchat (admin)
- **Naam:** in UI en code "Testchat (admin)", niet "als klant". Dat voorkomt verwarring met impersonation (B0).
- **Route:** `/v1/admin/organizations/[id]/test`, hergebruikt `PreviewFrame` + `WidgetView`
  (`app/v1/app/preview/*`). Server action `adminAskAction(orgId, question, history, { fresh })`.
- **Pad:** `prepareV1WidgetChat(svc, { organizationId: orgId, question, history, caller: 'admin_test', disableCache })`,
  dus exact het widgetpad (persona, settings, Fast mode, Linkknoppen, cache).
- **Uitbreiding van `V1WidgetChatInput` (nodig, want het huidige contract dekt dit niet):**
  - De klant-pauze (`chatbots.is_active === false`) staat in `widget-chat.ts:100-102` **vóór en los van** `orgGates`.
    `orgGates: 'skip'` slaat alleen `checkOrgChatGates` over (suspend, rate-limit, limieten, EUR). Zonder wijziging
    krijgt de admin bij een gepauzeerde widget dus altijd de terminal `paused`, en werkt B4 niet.
  - `orgGates` is gedocumenteerd als "EVAL-ONLY" (`:63-66`). Het admin-pad mag dat contract niet stil oprekken.
  - Daarom een expliciete vlag `caller?: 'widget' | 'eval' | 'admin_test'` (default `'widget'`). Bij `admin_test`:
    pauze-check overslaan en `checkOrgChatGates` overslaan (de eigen gate hieronder vervangt hem). Plus
    `disableCache?: boolean` naast de bestaande `isEval`-afleiding (`:145`). De doc-comments gaan mee: `orgGates`
    heet niet langer "EVAL-ONLY" óf wordt intern afgeleid van `caller`.
  - Unit-tests in `app/v1/app/__tests__/widget-chat.test.ts`: `admin_test` + `is_active=false` → kind `run`;
    `widget` + `is_active=false` → `paused`; `disableCache: true` komt door tot `runRagQuery`.
- Vóór `prepareV1WidgetChat` een **eigen gate**:
  1. `requireAdminOrgCtx(orgId)`;
  2. de injectie-gate (`v1InjectionBlock`), zoals in de widget;
  3. rate-limit `admintest:${orgId}` (B1: 30 per dag) en `admintest:user:${actorId}`;
  4. **EUR-plafond van de klant** (`getOrgSpendTodayEur` + de nieuwe testsom ≥ budget → "kostenplafond van
     deze klant bereikt"). De vragenlimieten (B3) en de suspend/pauze-gate (B4, banner) worden overgeslagen.
- **Cache:** standaard gelijk aan de bezoeker (lezen en schrijven via svc), zodat Niels ziet wat de bezoeker ziet.
  Een vinkje **"Vers antwoord (cache overslaan)"** zet `disableCache: true` (de nieuwe inputvlag hierboven; nu kan
  dat alleen impliciet via `isEval`, `widget-chat.ts:145`). Zo'n vers antwoord wordt niet in de cache geschreven.
- **Logging (B2):** **geen** `query_log`, **geen** `threads`. Nieuwe tabel:

```sql
create table public.admin_test_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  chatbot_id      uuid not null references public.chatbots(id) on delete cascade,
  actor_id        uuid references public.users(id) on delete set null,
  -- bewust GEEN question-tekst (zie AVG hieronder)
  kind            text not null check (kind in ('smalltalk','answer','fallback','blocked')),
  from_cache      boolean not null default false,
  cost_usd        numeric not null default 0,
  cost_eur        numeric not null default 0,
  total_ms        integer,
  created_at      timestamptz not null default now()
);
create index admin_test_log_org_created_idx on public.admin_test_log (organization_id, created_at desc);
-- backing-indexen voor de FK's (delete van chatbot/user mag deze tabel niet seq-scannen)
create index admin_test_log_chatbot_idx on public.admin_test_log (chatbot_id);
create index admin_test_log_actor_idx on public.admin_test_log (actor_id) where actor_id is not null;
alter table public.admin_test_log enable row level security;
-- Bewust GEEN policies: alleen de service-role (admin-pad) leest en schrijft hier (patroon 0017/0019/0032).
```

  - Hard rule 2/3: `organization_id NOT NULL`, RLS aan in dezelfde migratie. Geen policies is het patroon van 0017/0019/0032,
    en dat staat ook als comment in de migratie-header.
  - **Budget:** `getOrgSpendTodayEur` (`lib/v1/limits/usage-limits.ts:124-137`) telt `admin_test_log.cost_eur` sinds
    UTC-middernacht op bij de `query_log`-som. **Let op de fail-open:** de functie heeft nu één try/catch die bij elke
    fout 0 teruggeeft. Komt de testsom in diezelfde try, dan zet een fout in die tweede query (tabel ontbreekt na een
    gemiste migratie, timeout) de héle dagbudget-check op 0, en valt het EUR-vangnet voor echte bezoekers ook weg.
    Daarom een **eigen** try/catch voor de testsom: `sumQueryLog() + (await sumAdminTest().catch(() => 0))`, met een
    luide log bij de fout. Unit-tests: (1) een testrij telt mee; (2) de `admin_test_log`-query faalt → de `query_log`-som
    komt toch terug. De admin-pagina Gebruik toont "waarvan test" apart.
  - **AVG:** Niels plakt mogelijk een echte bezoekersvraag. Daarom slaan we de vraagtekst **niet** op: alleen kind,
    cache-hit, kosten en latency. Voor het budget en de teller is meer niet nodig, en het antwoord staat toch al op
    Niels' scherm. Zo is er geen PII in deze tabel en hangt fase D niet af van de V1-retentiecron die nu niet draait
    (`vercel.json:3-6` kent alleen V0-crons, critic §A5). Wil Sebastiaan de tekst toch bewaren (voor naspelen), dan
    is een draaiende V1-retentiecron (90 dagen) of een gedateerde opschoon-SQL in `docs/V1_LAUNCH_TODO.md` een
    **voorwaarde om fase D te mergen**, geen vervolgpunt.
- **Klantstatistiek:** blijft vanzelf schoon, want alle lezers lezen `query_log`/`threads`, en daar komt niets bij.

### 4.5 Fase E: Lead → klant koppelen
- **Migratie:**
  ```sql
  alter table public.leads add column organization_id uuid
    references public.organizations(id) on delete set null;
  create unique index leads_organization_uniek on public.leads (organization_id) where organization_id is not null;
  ```
  RLS staat al aan zonder policies (`0032:65`). De bestaande uitzondering op hard rule 2 blijft gelden: de kolom
  is bewust nullable, want een lead is nog geen klant.
- **Flow "Maak klant aan" (vanaf `/v1/leads/[id]`):** de link `/v1/admin/organizations/new?lead=<id>`. De wizard leest
  de lead **server-side** opnieuw op ID (requireJorionAdmin) en vult bedrijfsnaam, website, e-mail en contactpersoon voor.
  De klant doet geen prefill: anders kan een gemanipuleerde querystring de velden overschrijven. Bij opslaan, in
  `createClientOrganization` (`app/v1/admin/organizations/actions.ts:74-140`), komen deze stappen erbij:
  `leads.organization_id` + `status='klant'`, een `lead_activiteiten`-rij (`soort='status'`), een profielrij met `trial`
  (B7) **zonder** contactgegevens, en audit `org.create` met `metadata.lead_id`.
- **"Koppel aan bestaande klant"** op de lead (keuzelijst van orgs) en een link "Lead bekijken" op klant-detail.
  Audit `lead.link`/`lead.unlink`.
- **AVG: één bron.** Het gaat om zakelijke contactgegevens (B2B), maar een kopie naar `admin_org_profile`
  (`contact_name/email/phone`, 0017) zou juist twee bronnen maken die uit elkaar lopen, en een AVG-verwijderverzoek
  zou dan twee tabellen moeten raken. Daarom **niet kopiëren**: klant-detail toont de contactgegevens uit de gekoppelde
  lead (via `leads.organization_id`). Alleen een org zonder gekoppelde lead gebruikt de profielvelden. Een AVG-export of
  -verwijdering van een gekoppelde org neemt de lead mee; dat komt in de beschrijving van de export/delete-flow.

### 4.6 Fase F: Commerciële status echt gebruiken
- **Eenmalige vulling (B6):** een profielrij voor elke bestaande org, met akkoord, via het profielformulier of een
  goedgekeurde SQL-batch. Daarna maakt `isInternalOrg` (nachtwerk) het onderscheid op de status en niet meer alleen op
  de slug.
- **Wizard:** schrijft altijd een profielrij `trial` (en vanaf fase E de leadgegevens).
- **Gezondheid per status** (V1-eigen variant naast `health.ts`, zodat V0 niet verandert, critic §D3):
  - `active` en widget niet gezien of al 7 dagen weg → rood;
  - `trial` en widget 7 dagen weg → oranje;
  - `paused` terwijl de org niet opgeschort is (of omgekeerd) → oranje "status en opschorting lopen uiteen";
  - `cancellation` → oranje met de actie "AVG-export en verwijderen plannen";
  - geen rij → oranje "Status onbekend" (B7).
- **Overzicht:** KPI's "Actief / Proef / Opgezegd" en een statusfilter op Klanten. Audit `profile.update` op de
  overlay-acties (die loggen nu niets, onderzoek §laag).

### 4.7 Fase G: Performance van de cross-org fan-out
1. **Meten:** `console.time`/Sentry-span om `getControlRoomKlanten` en rendertijd van Overzicht/Klanten na het
   nachtfilter. Onder 1,5 s → stoppen, B9.
2. **Goedkoop, zonder migratie:** de maandkosten (`overview.ts:272`) niet meer als 20k rijen ophalen, maar via het
   bestaande `getOrgSpendThisMonthEur` (gepagineerd) óf mee in de RPC; React `cache()` rond de orglijst zodat
   layout en pagina hem delen.
3. **RPC (migratie, alleen als 1 te traag is):** `v1_admin_org_signals(p_month, p_week, p_30d, p_24h)` met
   `returns table(...)`, één CTE per signaal met `group by organization_id`, `security invoker`,
   `set search_path = ''`, `revoke execute ... from public, anon, authenticated; grant execute ... to service_role`.
   Van 15×N queries naar 1. De bestaande indexen (`query_log_org_created_idx` e.d., `0002:173-184`) dekken de filters.
   De RPC levert **ruwe tellingen**. De gezondheidsregels blijven in TypeScript (testbaar).
   Omdat de service-role RLS overslaat, telt deze functie over **alle** orgs. Een latere `grant ... to authenticated`
   zou dus cross-org-tellingen lekken. Daarom: een comment in de migratie die uitlegt waarom er geen grant naar
   `authenticated` is, en een isolatietest-case (authenticated-client roept de RPC aan → permission denied).

### 4.8 Fase H: Admin op mobiel (voor Niels)
1. Playwright-screenshots op 390×844 van Overzicht, Klanten, klant-detail (alle tabs), Gesprekdetail, Kennisbank-tab,
   Testchat en Leads. Dat is de nulmeting.
2. Vaste fixes: `DataTable` toont onder 640px **kaartrijen** (naam, status, één kerncijfer, chevron) in plaats van een
   horizontaal scrollende tabel (`admin.css:114`). Het statusblok "Wat is er aan de hand" staat bovenaan klant-detail.
   Aanraakdoelen ≥ 44px (`ui.css:599` heeft al een `pointer: coarse`-regel). Bevestigingsdialogen worden full-width.
3. Alleen de **supportflow** hoeft mobiel goed te zijn: klant vinden → probleem zien → testchat → cache legen,
   pagina aan/uit, Q&A. Crawlselectie (lange lijsten) mag op mobiel "werkt, maar desktop aanbevolen" blijven.

### 4.9 Fase I: Support-playbook
`docs/SUPPORT_PLAYBOOK.md` (publieke repo: geen klantnamen, geen prijzen) met de tabel uit §6, plus een link vanuit
de admin-zijbalk ("Hulp bij klantproblemen"). Elke rij wijst naar een tab of knop die dan bestaat. Het playbook
wordt bijgewerkt bij elke fase die een knop toevoegt.

### 4.10 Kosten (alleen eenheden, geen tarieven)
| Actie | Kost | Begrenzing |
|---|---|---|
| Pagina's ontdekken | ±1 Firecrawl-credit per ontdekking | `crawl:`-bucket + Firecrawl-loket |
| Crawl met selectie | 1 credit per pagina, max 50 (`MAX_CRAWL_PAGES`) | idem |
| Losse pagina / pagina opnieuw | 1 credit | idem |
| Q&A-item | één embedding-call | geen (verwaarloosbaar) |
| Testchat-vraag | gelijk aan een bezoekersvraag (gpt-6-luna, priority) | 30/dag/org + EUR-plafond van de klant |
| Cache legen | gratis, maar de volgende vragen worden weer betaald gegenereerd | — |

---

## 5. Fasering

| Fase | Inhoud | Grootte | Migratie | Billable/extern | Hangt af van |
|---|---|---|---|---|---|
| **A** | Inventaris van het nachtwerk (§3.1); `requireAdminOrgCtx`; kern van kennisbank- en Q&A-acties naar `lib/v1/kennisbank/*-ops.ts` (klantacties ongewijzigd in gedrag); audit op `setOrgLimitsAction`; isolatietest-uitbreiding | **M** | nee | nee | — |
| **B** | Kennisbank-tab namens de klant (ontdekken/selecteren/starten, aan/uit, opnieuw, losse pagina, verwijderen, bekijken), Q&A-fix + Q&A namens de klant, cache legen, admin-retry respecteert selectie | **L** | nee | ja (Firecrawl, kleine OpenAI-embeds) | A |
| **C** | Widget-tab: embedcode, mailto, pauzeren/activeren, installatie-check (hergebruik nachtbranch), lege allowed_domains rood | **S-M** | nee | nee | A; nachtbranch installatie |
| **D** | Testchat (admin) + `caller`/`disableCache`-vlag in `prepareV1WidgetChat` + `admin_test_log` (zonder vraagtekst) + budgetsom met eigen try/catch | **M** | **ja** | ja (OpenAI) | A, B0, B2-B4 |
| **E** | Lead → klant (kolom, wizard-prefill, koppelen, links heen en terug) | **M** | **ja** | nee | F (profielrij in wizard) |
| **F** | Commerciële status: vulling, wizard-default, V1-gezondheid per status, KPI/filter, audit op profiel | **S** | nee (wel prod-datawrite) | nee | nachtfilter |
| **G** | Performance: meten → goedkope fixes → eventueel RPC | **S** (meten+fix) / **M** (RPC) | alleen bij RPC | nee | nachtfilter |
| **H** | Mobiel: nulmeting, kaartrijen, supportflow | **M** | nee | nee | B, D (de supportflow moet bestaan) |
| **I** | Support-playbook (doc + link) | **S** | nee | nee | groeit mee, definitief na B-D |

Voorgestelde PR-volgorde: **A → B → F → D → C → E → H → G → I.** Klein houden: één PR per fase, en B mag in twee
(B1: aan/uit, opnieuw, verwijderen, Q&A, cache; B2: ontdekken/selecteren/starten + retry-fix).
Elke fase: `npm run verify` + `npm run build` (eerst `.next/` wissen), isolatietest groen, gedrag nagelopen in de
browser op een **interne** org. Een betaalde crawl alleen met akkoord, nooit in een smoke.

---

## 6. Support-playbook voor Niels: 10 waarschijnlijke klantproblemen

"Bestaat" = nu al in de admin. "Nacht" = in de nachtbranch (eerst controleren of hij gemerged is). Een letter = fase uit dit plan.

| # | Klant zegt | Waar zie je het | Wat doe je | Beschikbaar | Naar Sebastiaan als… |
|---|---|---|---|---|---|
| 1 | "De bot gaf een fout of verouderd antwoord." | Klant → Gesprekken → het gesprek (bronnen, cache-hit, fallback) | Juiste info staat op de site → **Cache legen**. Bron verouderd → pagina **uit** of **opnieuw ophalen**. Nergens te vinden → **Q&A-correctie**. Daarna **Testchat** met "vers antwoord". | Gesprekdetail: nacht · knoppen: B · testchat: D | het antwoord fout blijft terwijl de bron klopt (dan RAG-gedrag, mogelijk een eval) |
| 2 | "Hij zegt 'weet ik niet' terwijl het op onze site staat." | Gesprekken (fallback-markering), Kennisbank → staat de pagina erin en is hij **aan**? | Pagina ontbreekt → **losse pagina toevoegen**. Pagina uit → **aanzetten**. Pagina mislukt → **opnieuw ophalen**. Anders een Q&A-paar. | B | de pagina erin staat, aan staat en de bot hem toch niet vindt |
| 3 | "Er staat nieuwe info op onze site, maar de bot weet het niet." | Kennisbank → datum van de laatste crawl per bron | **Pagina opnieuw ophalen** (1 pagina) of **crawl opnieuw met dezelfde selectie**. | B | de crawl blijft mislukken (Crawls en taken toont de melding) |
| 4 | "De chat verschijnt niet op mijn website." | Widget-tab: laatst gezien, toegestane websites, status | Nooit gezien → **embedcode** opnieuw naar de webbouwer (Kopieer/mail). Domein staat niet in de lijst → **toevoegen** (bestaat). Gepauzeerd → **activeren**. Gezien maar nu weg → CMS-cache of de plugin is verwijderd. | domeinen: bestaat · rest: C | de code goed staat en de widget toch niet laadt (embed-fout, Sentry) |
| 5 | "De chat zegt 'tijdelijk niet beschikbaar'." | Klant-detail statusblok, Beheer → opschorten, Widget → status | Opgeschort → bewust? Zo niet: **hervatten** (bestaat). Gepauzeerd door de klant → navragen en eventueel **activeren** (C). | opschorten: bestaat · pauze: C | er geen opschorting of pauze is (dan een storing) |
| 6 | "Er staat 'daglimiet bereikt'." | Beheer → Limieten, Gebruik-tab (vragen vandaag/maand) | Echte drukte → limiet tijdelijk **verhogen** (bestaat, wordt gelogd in A). Verdacht veel vragen → niet verhogen, eerst kijken. | bestaat | het EUR-plafond de oorzaak is, of er misbruik lijkt (patroon in de gesprekken) |
| 7 | "Ik krijg geen leads of contactverzoeken binnen." | Klant → Gesprekken → contactverzoeken (alleen lezen) | Er zijn verzoeken → mailadres voor meldingen bij de klant nalopen. Er zijn geen verzoeken → uitleggen dat de bot contact pas aanbiedt als de bezoeker erom vraagt. | nacht (alleen lezen) | verzoeken wel in de DB staan maar de mail niet aankomt (Resend) |
| 8 | "Die pagina met oude prijzen moet eruit." | Kennisbank → paginalijst | Pagina **uitzetten** (omkeerbaar) of het document **verwijderen**. De cache wordt automatisch geleegd. Testchat ter controle. | B (+D) | de info in meerdere pagina's of documenten verweven zit |
| 9 | "Mijn collega kan niet inloggen / de uitnodiging is niet gekomen." | Beheer → Leden | **Uitnodiging opnieuw**, of lid **toevoegen** met het juiste adres (bestaat). | bestaat | de mail niet aankomt na opnieuw sturen (Supabase-auth/mail) |
| 10 | "De antwoorden zijn te lang / te stijf / in de verkeerde toon." | Botinstellingen-tab | Toon/lengte aanpassen namens de klant (bestaat). Daarna **Testchat**. De cache wordt bij antwoordwijzigingen al geleegd. | bestaat · testchat: D | de klant een gedrag wil dat de instellingen niet bieden (productbesluit) |

Vuistregel voor Niels: **kijken kost niets, schrijven wordt gelogd, crawlen kost credits.** Twijfel je over een
crawl of een verwijdering: pagina eerst **uitzetten** in plaats van verwijderen, want dat is omkeerbaar.

---

## 7. Risico's

| Risico | Kans/impact | Maatregel |
|---|---|---|
| Een vergeten org-check op een nieuwe adminactie geeft cross-org-mutaties | laag / hoog | De check zit in de gedeelde `ops.ts`, niet in de action. Isolatietest per action (§4.1-5). Review met de `chatmanta-reviewer`-agent |
| De refactor van de klantacties breekt het klantendashboard | middel / hoog | Fase A eerst los mergen, met gedrag 1-op-1 gelijk. De bestaande tests op de kennisbank, en de klantflow handmatig nalopen |
| Admin en klant crawlen tegelijk → dubbele credits | laag / middel | Dezelfde `crawl:${orgId}`-bucket, plus de bestaande check op "job nog bezig" |
| Een testchat-antwoord met "vers antwoord" komt toch in de cache | laag / middel | `disableCache` sluit lezen én schrijven af (`run-rag-query.ts:1637-1640`), unit-test op de inputvlag |
| De testkosten vallen buiten het budget door een vergeten som | laag / laag | Faalt veilig (B2). Unit-test op `getOrgSpendTodayEur` met een testrij |
| Een fout in de testsom zet het hele EUR-dagbudget op 0 (fail-open) | laag / hoog | Eigen try/catch voor de testsom, unit-test "admin_test_log faalt → query_log-som blijft" (§4.4) |
| De nachtbranches overlappen (installatie, contactverzoeken, admin) | middel / middel | Fase A begint met de inventaris. C hergebruikt de installatiebranch, contactverzoeken blijven bij de contactbranch |
| De demokopie (`app/voorbeeld/(dashboard)/kennisbank/*`) loopt verder uit de pas | zeker / laag | Bewust niet meegenomen. De demo heeft eigen kopieën; noteren in de PR |
| V0 raakt beschadigd door een wijziging in gedeelde modules (`lib/controlroom/*`) | middel / middel | V1-eigen gezondheid en profiel-default (F). `lib/controlroom/types.ts` niet wijzigen |
| Migratienummers botsen met parallelle branches | middel / laag | Nummer pas kiezen met `/check-migration` op het moment van bouwen |
| PII in `admin_test_log` zonder werkende retentie | laag / middel | Geen vraagtekst opslaan (§4.4). Wil Sebastiaan de tekst wel: retentie is dan een merge-voorwaarde voor D |

---

## 8. Open vragen

- **V1.** Moet de bestaande **klant**-preview (`askV1`) ook uit `query_log` en de vragenlimiet? Nu telt de klant zijn
  eigen tests mee (`app/v1/app/actions.ts:143-153`). Aanbeveling: ja, in dezelfde lijn als D, maar als een aparte
  kleine PR, want het raakt de klantstatistiek.
- **V2.** Is 30 testvragen per org per dag goed als plafond (B1)? Of liever per admin per dag?
- **V3.** Bestaande `query_log`-rijen van de klantpreview (ipHash null) achteraf markeren? Mijn advies: nee. Niet
  betrouwbaar te onderscheiden, en het gaat om weinig rijen.
- **V4.** Moet het support-playbook ook in de admin-UI zelf (contextuele "Hoe los ik dit op?"-links in het statusblok)?
  Of volstaat een document? Aanbeveling: eerst het document (I), links pas als Niels erom vraagt.
- **V5.** Hoe is de echte testklant destijds ingericht (script of SQL)? Dat bepaalt hoe ver de wizard (E/F) moet gaan:
  ook website-URL, allowed_domains en eerste ontdekking? Het onderzoek raadt die uitbreiding aan; dat valt buiten dit
  plan, tenzij Sebastiaan hem toevoegt.
- **V6.** Mag een adminactie "namens de klant" later zichtbaar worden voor de klant (B10)? Dat zou een kolom
  `created_via` op `org_qa_items`/`documents` vragen, dus een migratie.

---

## 9. Review verwerkt (19 okt 2026)

Elke bevinding is tegen de code gecontroleerd. Alle acht klopten en zijn verwerkt, geen enkele is verworpen.

| # | Bevinding | Gecontroleerd | Wat aangepast |
|---|---|---|---|
| 1 | Scope-creep (impersonation V3, supporttooling V2) | `V2_SCOPE_EN_PRINCIPES.md:79,81` klopt | Nieuw besluit **B0** + voorwaarde in §1. Fase D heet nu "Testchat (admin)". Kanttekening: "supporttooling" staat in de ops-regel (health/statuspagina) en de admin doet al acties namens de klant (upload, limieten), dus ik verwacht "ja, V1". De bevestiging blijft Sebastiaans besluit. Het vastleggen in `V2_SCOPE` §2 gebeurt na zijn akkoord, niet nu. |
| 2 | Pauze-check staat los van `orgGates`, en `orgGates` heet "EVAL-ONLY" | `widget-chat.ts:63-67`, `:100-103` klopt | §4.4: vlag `caller: 'widget'\|'eval'\|'admin_test'` + `disableCache`, doc-comments bijwerken, drie unit-tests. Notitie bij B4. |
| 3 | Testsom in dezelfde fail-open try zet het hele EUR-budget op 0 | `usage-limits.ts:124-137` klopt (één try → 0) | §4.4: eigen try/catch voor de testsom + test "testquery faalt → query_log-som blijft". Nieuw risico in §7. |
| 4 | Geen FK-backing-index op `chatbot_id`/`actor_id` | klopt (alleen index op org+created) | Twee indexen + header-comment "geen policies is bewust". |
| 5 | Gebonden `orgId` is client-input | klopt (bound args gaan via de client) | §4.1 regel 6. |
| 6 | Kopie lead → `admin_org_profile` maakt twee AVG-bronnen | klopt, tegenstrijdig met de eigen tekst | §4.5: **niet kopiëren**, klant-detail toont de leadgegevens. Profielvelden alleen voor een org zonder lead. |
| 7 | 90-dagenretentie niet afgedwongen (geen V1-cron) | `vercel.json:3-6`: alleen V0-crons, klopt | Gekozen voor de minimale variant: **geen vraagtekst** in `admin_test_log`. Wil Sebastiaan de tekst wel, dan is retentie een merge-voorwaarde voor D. |
| 8 | RPC via service-role omzeilt RLS; een latere grant zou lekken | klopt | §4.7: migratie-comment + isolatietest "authenticated → permission denied". |
