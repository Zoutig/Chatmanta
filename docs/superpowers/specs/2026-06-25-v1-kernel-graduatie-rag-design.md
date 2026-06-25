# V1 — Kernel-graduatie + V1-RAG-pad achter auth (big-ship milestone)

**Datum:** 2026-06-25
**Status:** Ontwerp — wacht op gebruiker-review vóór `writing-plans`.
**Beslisser:** Sebastiaan (solo).
**Branch / worktree:** `feat/seb/v1-kernel` · `C:\Users\solys\Documents\Code\chatmanta-v1-kernel`
**Vervolg op:** de V1-fundament-ronde (PR-1 #208 … PR-4 #211, allemaal live op `main`). Dit is de **volgende mijlpaal** die het strategie-spec (`docs/superpowers/specs/2026-05-25-v1-codebase-strategie-design.md`, sectie kernel-graduatie) en de §3+§4-spec (`2026-06-24-v1-fundament-s3-s4-design.md` §9) als "latere mijlpaal" benoemden.

---

## 0. Samenvatting in gewone taal

De "antwoordmotor" van ChatManta (de RAG-code die chunks opzoekt en een gegrond antwoord schrijft) zit nu vastgeschroefd in de V0-oefenbak — inclusief de keuze wélke database hij gebruikt. We halen die motor eruit en zetten hem in een **neutrale gereedschapskamer** (`lib/rag/`), zó gebouwd dat je hem bij gebruik de database-sleuteltjes én de instellingen *aanreikt* (in plaats van dat hij ze zelf uit de V0-kast pakt). V0 blijft daarna gewoon op die motor draaien — V0 plugt z'n eigen sleutel erin.

Daarna laten we het **echte gebouw (V1)** voor het eerst écht een vraag beantwoorden: inloggen → check of je lid bent → echte zoekopdracht in de echte database (met de muren door de database zélf afgedwongen) → gegrond antwoord. Dat vereist dat de retrieval-tabellen (documenten, chunks, logboek) óók in de V1-database komen, mét muren (RLS) en `organization_id NOT NULL` in dezelfde migratie.

Eindbestemming = **volledige RAG-pariteit met V0** in V1 (scope C). We bouwen dat als één **big-ship-milestone in drie opeenvolgende, los-reviewbare PR's**, omdat het de eerste keer is dat structuren voor echte klantdata in de echte database landen — klein en zorgvuldig, niet groot en gehaast.

---

## 1. Vastgelegde beslissingen (deze ronde)

| # | Beslissing | Keuze | Waarom |
|---|---|---|---|
| 1 | **Scope** | **C — volledige RAG-pariteit**, uitgevoerd als big-ship in **3 gesequencete PR's** met checkpoint ertussen. | Bestemming = compleet, maar veilig in plakjes i.p.v. één onreviewbare brok op echte data. |
| 2 | **Kernel-vorm** | Motor → neutraal `lib/rag/` met **database-client én instellingen/persoonlijkheid aangereikt** (dependency injection). V0 blijft draaien via een dun vertaalstukje, **test-eerst**. | "Eén motor, twee werelden" werkt alleen als de motor niets meer van V0 weet (anders trekt V1 via een verborgen import-keten V0-code mee en valt de grep-gate). |
| 3 | **chatbot-model** | Echte **`chatbots`-tabel** in V1, met `chatbot_id` op de retrieval-data én in de zoekfunctie (verplicht). Operationeel: **één chatbot per org, automatisch aangemaakt.** | Harde regel: vector-search-isolatie op `orgId` **én** `chatbotId`. V0 kent geen chatbot-entiteit; dit is de enige plek waar "kopiëren" niet genoeg is. |
| 4 | **Beveiligingsmodel** | **Verdediging in de diepte:** lezen door de ingelogde gebruiker via de **persoonlijke sleutel** (session-client, RLS door de DB afgedwongen) + org/chatbot expliciet meegegeven; **systeemklussen** (seeden, ingest, crawler, log-schrijven) via de **V1-hoofdsleutel** (service-role) met expliciete org/chatbot. | Harde regels SA-1/SA-5 + "RLS overal". Een codebug kan dan niet lekken tussen klanten — de database weigert het. |
| 5 | **LLM** | Blijft **OpenAI-direct** (gedeelde globale `OPENAI_API_KEY`); `callLLM`/`streamLLM` blijven stubs. **Buiten scope.** | Recon bevestigt: de motor importeert `callLLM` niet; geen V0/V1-env-split nodig voor het LLM-pad. Eigen mijlpaal later. |

---

## 2. Doel & niet-doel

**Het doel van déze mijlpaal:** een neutrale, herbruikbare RAG-motor (`lib/rag/`) + een bewezen, beveiligd V1-RAG-pad achter echte auth, opgebouwd tot volledige V0-pariteit.

**De constante (niet onderhandelbaar, in alle PR's):** de motor wordt client-geïnjecteerd met `orgId` + `chatbotId` als **verplichte, niet-optionele** isolatie-parameters; V0 mag niet breken (gedrag identiek, test-eerst geverifieerd).

**Bewust buiten scope (latere mijlpalen):** `callLLM`/Anthropic-abstractie + modelkeuze + her-eval · DPA/juridisch · Supabase Pro/PITR-upgrade · MX-records chatmanta.com · widget-hardening (per-chatbot key, origin-allowlist, domeinverificatie) · klant-onboarding/provisioning-UI · meervoudig-chatbot-beheer-UI · de Vercel↔Supabase-integratie-var-cluster ([[vercel_deployment]]).

---

## 3. Architectuur — de gegradueerde kernel (`lib/rag/`)

### 3.1 Uitgangssituatie (Explore-recon, 2026-06-25, tegen `main`)

- **`runRagQueryStreaming`** = async generator in `lib/v0/server/rag.ts:1275`, één plat options-object. `organizationId` is al **verplicht** (PR-1 #208 schrapte de DEV_ORG-fallback, geconsumeerd op `:1348`). Er is **geen `chatbotId`** — scoping is org-only.
- **Client wordt NIET geïnjecteerd:** `getServiceRoleClient` geïmporteerd op `rag.ts:15`; de bare calls zitten in de helpers `retrieveChunksHybrid` (:431), `retrieveChunks` (:817), `lookupCachedAnswer` (:505), `writeCachedAnswer` (:549), `hydrateParentContent` (:861), plus `:449`/`:582` (+ ingest `:2973/3030/3094`).
- **Al schoon** van request-context: geen `cookies()`, `KNOWN_ORGS`, `getActiveOrgFromCookies`, `getOrgSettings`. De énige resterende V0-identiteit-koppeling binnen de functie is `getPersonaById(orgId)` (`:1355`, met "onbekende org → demo-persona"-fallback).
- **LLM = OpenAI-direct:** inline `openai()`-singleton (`rag.ts:97-104`), globale `OPENAI_API_KEY`. `callLLM`/`streamLLM` (`lib/ai/llm.ts:103-110`) zijn ongebruikte stubs; alleen `costForModelUsd` wordt geïmporteerd. → geen V0/V1-LLM-split nodig.
- **Loggen zit NIET in de motor:** de route persisteert `query_log` ná de stream (`app/api/v0/chat/route.ts:544`, in `after(...)`). De generator emit `answer-done`/`metrics-done` met de volledige `ChatResponse` + timings.
- **5 V0-aanroepers**, geen enkele geeft een client of `chatbotId` mee: `app/api/v0/chat/route.ts:393`, `app/klantendashboard/test/actions.ts:64`, `lib/v0/server/eval.ts:863`, `scripts/v0-test-org-isolation.ts:63`, `scripts/v0-hard-eval-run.ts:146`.

### 3.2 Doel — neutrale, geïnjecteerde motor

Nieuwe publieke vorm (conceptueel):

```ts
// lib/rag/  (neutraal; importeert NIETS uit lib/v0/**)
export async function* runRagQuery(
  client: SupabaseClient,                 // aangereikt: V0 = service-role, V1 = session-client (lezen)
  input: {
    question: string;
    organizationId: string;               // VERPLICHT (al zo)
    chatbotId: string;                    // VERPLICHT (nieuw) → p_chatbot_id in de RPC
    config: RagConfig;                    // neutrale instellingen: threshold, topK, modelnamen, vlaggen
    persona: RagPersona;                  // aangereikte persoonlijkheid (geen getPersonaById-lookup meer)
    history?; tone?; length?; disableCache?; …  // bestaande optionele velden, additief
  }
): AsyncGenerator<StreamEvent, void, void>
```

**Vier naden die veranderen:**

1. **Client-injectie.** Eén `client`-parameter door `runRagQuery` → alle helpers die nu `getServiceRoleClient()` bare aanroepen. *De vorm die V0 onveranderd houdt:* maak de injectie verplicht aan de bron, maar lever de V0-aanroepers via een dunne wrapper (zie 3.3) die de V0 service-role-client injecteert — V0-gedrag identiek.
2. **Config-injectie.** Een neutraal **`RagConfig`-type** (woont in `lib/rag/`) draagt threshold (0.4-default uit blueprint §1.5), topK (5), modelnamen, en de gedrags-vlaggen. V0 bouwt dit uit z'n `BotConfig`; V1 uit de `chatbots`-rij (of een default). **PR-1 V1-config is bewust beperkt:** `hybridSearch: false` (de keyword-/FTS-RPC `match_chunks_hybrid` komt pas in PR-3 met gevulde `content_tsv`) en `parentDocumentRetrieval: true` (de seed vult `parent_chunks`). Zo kan de motor in V1 niet stil terugvallen op een nog-niet-bestaande RPC — zie §4 PR-1 item 6.
3. **Persona-injectie.** `RagPersona` aangereikt i.p.v. `getPersonaById(orgId)` — schrapt de "onbekende org → demo-persona"-V0-tic uit de neutrale motor.
4. **`chatbotId` verplicht** en doorgedraad naar de retrieval-RPC (nieuw `p_chatbot_id`-argument + `c.chatbot_id = p_chatbot_id`-predicaat).

**Neutrale helpers mee verhuizen** (pure logica, nu onder `lib/v0/`): `rag-decision`, `reclassify`, `claims`, `history-entities`, `persona` (rendering), `manual-qa`, `source-links`, `hard-facts`, `preprocess-parse`, plus de stijl-helpers (`buildSystemPrompt`). Mechanisch maar raakt elke dynamische `import('./...')` in de functie → met tests afdekken.

### 3.3 V0 blijft draaien — het vertaalstukje (test-eerst)

`lib/v0/server/` houdt een dunne **adapter** die:
- de bestaande `BotConfig` → `RagConfig` vertaalt,
- de V0-persona (`getPersonaById`) → `RagPersona` levert,
- de V0 service-role-client injecteert,
- en zo de 5 V0-aanroepers **byte-voor-byte gelijk gedrag** geeft.

Verificatie van "V0 ongebroken" is **test-eerst, gedragsbehoudend**: een smoke via `v0:chat` + een korte `hard-eval`-run (gratis, deterministisch) die bewijst dat de antwoorden identiek blijven vóór merge. (Zie [[eval_cache_and_run_gotchas]] voor cache-discipline.)

### 3.4 Grep-gate uitbreiden

De bestaande CI-gate (`lib/supabase/__tests__/no-adhoc-service-client.test.ts`) krijgt een regel: **`lib/rag/**` mag NIET importeren uit `lib/v0/**`** (en niet uit `lib/supabase/v1/**` of `lib/supabase/service-role.ts` direct — de motor krijgt z'n client aangereikt). Dit is de mechanische borging dat de motor echt neutraal is.

---

## 4. Datamodel — V1-migraties (`supabase/migrations-v1/`, start `0002`)

> Elke nieuwe tabel: **RLS aan in dezelfde migratie**, `organization_id NOT NULL` (FK → V1 `organizations`, CASCADE), en `chatbot_id NOT NULL` waar de harde regel per-chatbot-isolatie eist. Toepassen via Supabase **MCP `apply_migration`** (dev-machine pooler-block, [[migrate_network_block_prod]]) + ledger-rij in `public._migrations`. **pgvector-extensie aanzetten** in het V1-project vóór `document_chunks`.

**Verdeeld over de 3 PR's:**

### PR-1 — `0002_v1_rag_core.sql` (minimaal retrieval + log)
1. **`chatbots`** *(nieuw in V1)* — `id`, `organization_id NOT NULL` FK, naam/versie/config-velden, `deleted_at`. RLS: SELECT via `organization_members`; mutaties service-role-only.
2. **`documents`** — port van V0 `0002:34`. `organization_id NOT NULL`, **`chatbot_id NOT NULL`** FK, `deleted_at` soft-delete, `source` CHECK. RLS aan.
3. **`document_chunks`** — port van V0 `0002:79` (+ `parent_chunk_id` uit `0008`, `content_tsv` FTS uit `0004`). `organization_id NOT NULL`, **`chatbot_id NOT NULL`**, `embedding vector(1536)`, HNSW cosine-index. RLS aan.
4. **`parent_chunks`** — port van V0 `0008:33`. `organization_id NOT NULL`, `chatbot_id NOT NULL`. RLS aan.
5. **`query_log`** — port van V0 `0003:15` + de ~25 telemetrie-kolommen (ALTERs uit `0006/0008/0009/0010/0011/0012/0014/0016/0018/0019/0022/0023/0041/0044`) **samengevouwen tot één CREATE**. `organization_id NOT NULL`, **`chatbot_id NOT NULL`** toevoegen. RLS: SELECT-only via `organization_members`; **geen** INSERT/UPDATE/DELETE-policy → service-role append-only (parity V0).
6. **Match-RPC** — port `match_chunks_with_parents` (V0 `0042:24`, de rijkste enkel-pad-variant), **document-only variant voor PR-1**. Wijzigingen, **vastgepind** (geen open keuze meer):
   - **`security invoker`** behouden (zodat RLS geldt onder de session-client);
   - **`p_chatbot_id`-parameter toevoegen** + `c.chatbot_id = p_chatbot_id`-predicaat;
   - soft-delete-JOIN behouden (`d.deleted_at is null`);
   - **de `website_pages`-JOIN + `wp.included`-filter + `source_url`/`source_title` WEGLATEN** (die tabel bestaat pas in PR-3). PR-3 doet een **drop+recreate** van deze RPC mét de website-tak terug — exact het 0042/0035-drop+recreate-precedent. Zo wijzigt de RETURNS-shape éénmalig per PR, niet heen-en-weer.
   - **Niet** `match_chunks_hybrid` porten in PR-1 (V1-config heeft `hybridSearch: false`, zie §3.2) — die komt in PR-3.
7. **Defense-in-depth SELECT-policies** op `chatbots`/`documents`/`document_chunks`/`parent_chunks`: leden van de org mogen SELECT. **Bron-van-waarheid voor het policy-patroon = de V1-baseline `migrations-v1/0001_core_tenancy.sql` (`organizations_select_own`/`organization_members_select_own`)**, niet het V0-`query_log`-patroon — voorkomt een subtiel afwijkende policy op de eerste V1-retrieval-tabellen. Dit is wat het lezen-onder-de-session-client mogelijk maakt.

### PR-2 — `0003_v1_*` (indien nodig voor ingest)
Ingest schrijft naar dezelfde tabellen; mogelijk een extra index/kolom. Detail bij het PR-2-plan.

### PR-3 — `0004_v1_website.sql` + `0005_v1_cache.sql`
8. **`website_pages`** (+ `knowledge_sources`, `included`-kolom) — port V0 `0032`/`0035`. RLS aan; `organization_id`/`chatbot_id NOT NULL`. De match-RPC krijgt de `website_pages`-JOIN terug.
9. **`answer_cache`** (+ `lookup_cached_answer`-RPC) — port V0 `0004`. ⚠️ **Landmijn:** `answer_cache` is sinds #198 óók de FAQ-pre-cache-deliverystore ([[answer_cache_removal_analysis]]) — bij het porten meenemen dat de cache twee rollen heeft.

**Volgende veilige nummers (geverifieerd 2026-06-25):** V0 → `0054`; V1 → `0002`.

---

## 5. Beveiligingsmodel — verdediging in de diepte

| Pad | Sleutel | Afdwinging |
|---|---|---|
| **Lezen** (retrieval voor een ingelogde gebruiker) | **session-client** (`lib/supabase/v1/server.ts`) | DB dwingt RLS af (membership-policy) **+** RPC filtert expliciet op `p_organization_id` + `p_chatbot_id` |
| **Systeem-schrijven** (seed, ingest, crawler, `query_log`) | **V1 service-role** (`getV1ServiceRoleClient`) | Code geeft org/chatbot expliciet mee; geen user-sessie betrokken |
| **Autorisatie van de pagina** | session-client | `requireAuth()` → `requireOrgMember(orgId)` (gooit `AUTH_FORBIDDEN`) |

Mapping naar de harde regels: **SA-1** (object-level access via `requireOrgMember` op de getrouwde org), **SA-5** (service-role alleen via de V1-factory-wrapper), **vector-search-isolatie** (`orgId`+`chatbotId` verplichte RPC-params), **RLS overal** (policies in dezelfde migratie). De `orgId` in V1 komt uit het ingelogde lidmaatschap, niet uit rauwe client-input.

---

## 6. Org/chatbot-resolutie in V1

- **Org:** uit het lidmaatschap van de ingelogde gebruiker. Voor de eerste keten (PR-1) blijft `/v1/app` `V1_SEED_ORG_ID` gebruiken (provisioneel, zoals nu); echte resolutie (org uit membership/route) is een kleine vervolgstap.
- **Chatbot:** de **enige** `chatbots`-rij van die org (één-per-org-automatisch). Resolveer = "selecteer de chatbot van deze org". **Auto-create is seed/ingest-only** (niet op het lees-pad). Heeft een org op het lees-pad (`/v1/app`) géén chatbot-rij, dan faalt de pagina met een nette "geen chatbot geconfigureerd"-toestand — **nooit** een lege/`null` `chatbotId` die de NOT-NULL-RPC-parameter zou ondermijnen.
- De motor krijgt `{ orgId, chatbotId }` dus altijd volledig ingevuld aangereikt, of het pad faalt expliciet vóór de motor.

---

## 7. Big-ship-opdeling — 3 PR's met checkpoints

### PR-1 — Kernel-graduatie + dunne retrieval-keten bewezen achter login
- `lib/rag/` extractie: client + `RagConfig` + `RagPersona` geïnjecteerd; `chatbotId` verplicht; neutrale helpers verhuisd; grep-gate uitgebreid.
- V0-adapter + **test-eerst bewijs dat V0 identiek blijft** (smoke + hard-eval).
- Klein opruimpunt: de stale comment in `lib/auth.ts:11` (wijst service-role-werk nog naar `admin.ts`) uitlijnen op de V1-service-role-factory (`getV1ServiceRoleClient`).
- V1-migratie `0002_v1_rag_core.sql` (chatbots + documents + document_chunks + parent_chunks + query_log + match-RPC + SELECT-policies), via MCP.
- **Seed-script** (`scripts/v1-seed-chunks.*`) dat via de V1 service-role een handvol echte chunks + één chatbot voor de seed-org neerzet.
- `/v1/app` draait de **volledige generator** met `disableCache: true` (geen `answer_cache`/`website_pages` nog), via de **session-client** voor het lezen; toont een gegrond antwoord voor de ingelogde org.
- **Playwright e2e** (project `v1`): lid stelt vraag → krijgt gegrond antwoord uit z'n eigen chunks; niet-lid geweigerd; org-isolatie (org A ziet org B's chunks niet) bewezen.
- **DoD PR-1:** neutrale motor live, V0 aantoonbaar ongewijzigd, V1-retrieval-keten bewezen achter auth onder RLS, grep-gate groen in CI, typecheck/test:unit/build groen.

### PR-2 — Ingest naar V1
- `ingestText` (V0 `rag.ts:3012`) gegradueerd naar client-injectie zodat een V1-org eigen documenten kan inladen (chunks + parents schrijven via de V1 service-role).
- **DoD PR-2:** een V1-org kan via een (admin/seed-)pad eigen documentinhoud inladen en daarop bevraagd worden; V0-ingest ongewijzigd.

### PR-3 — Crawler + antwoord-cache (volledige pariteit)
- `website_pages`/`knowledge_sources` + crawler-pad naar V1; match-RPC krijgt de website-JOIN terug.
- `answer_cache` + `lookup_cached_answer` naar V1 (let op de FAQ-dubbelrol-landmijn).
- **DoD PR-3:** V1-RAG op pariteit met V0 (cache aan, website-bron, crawler), alles onder RLS + isolatie.

**Checkpoint na elke PR:** V0 ongewijzigd · grep-gate groen · migraties toegepast + advisors clean · e2e groen. Pas dán de volgende PR.

---

## 8. Te verifiëren tijdens de bouw (geen aanname)

1. **pgvector aan** in het V1-project (`list_extensions`) vóór `document_chunks`.
2. **Security-invoker-RPC onder de session-client** geeft correct alleen de org-eigen chunks terug (RLS + HNSW samen), met aanvaardbare latency.
3. **V0 produceert identieke antwoorden** na de graduatie (hard-eval diff + smoke).
4. **`chatbot_id NOT NULL`** is bij seed/ingest altijd vulbaar (één-per-org).
5. **Grep-gate** vangt een per ongeluk `lib/v0/`-import vanuit `lib/rag/`.
6. **Migratienummers** opnieuw checken (lokaal + open PR's) vlak vóór elke migratie ([[check-migration]]).

---

## 9. Risico's / caveats

1. **Eerste echte-klantdata-structuren in de echte DB** → RLS moet exact kloppen; daarom defense-in-depth + per-PR review (incl. `chatmanta-reviewer` + `/code-review`).
2. **Een ~3000-regel-bestand graduëren** → test-eerst, gedragsbehoudend; de adapter is de risicovolste regel.
3. **Verborgen import-ketens** (de PR-2-fundament-landmijn: `admin.ts → lib/auth → next/navigation` brak tsx-scripts + client-bundle). `lib/rag/` moet vrij blijven van `next/*`-en server-only-ketens die de eval-/audit-scripts breken → draai `audit:retrieval` + `build` bij de extractie.
4. **Gratis V1-tier pauzeert na 7 dagen inactiviteit**, geen PITR — ok zolang er geen echte data in zit; Pro is een harde gate vóór de eerste klant.
5. **`answer_cache` heeft een dubbelrol** (FAQ-pre-cache) — meenemen in PR-3.
6. **Migratie via MCP** (pooler-block) — DDL + ledger-insert handmatig, advisors checken.

---

## 10. Definition of Done — mijlpaal

1. PR-1 + PR-2 + PR-3 gemerged.
2. Neutrale, client-geïnjecteerde `lib/rag/`-motor; V0 draait er aantoonbaar ongewijzigd op.
3. V1-RAG op volledige pariteit met V0, **achter echte auth**, onder RLS + `orgId`+`chatbotId`-isolatie.
4. Grep-gate (V0/V1 + `lib/rag/`-neutraliteit) groen in CI.
5. e2e bewijst: lid krijgt gegrond antwoord uit eigen content; niet-lid geweigerd; cross-org-isolatie.
6. Statusnotitie in `docs/` + memory-update ([[project_v1_strategy]]).

Daarna: **stop & herplan** (waarschijnlijke volgende mijlpaal: `callLLM` uit de stub + modelkeuze + her-eval; en de pre-klant-gates: Pro/PITR, DPA, MX, widget-hardening).

---

## 11. Recon-referenties (bron voor het implementatieplan)

- Kernel: `lib/v0/server/rag.ts` — generator `:1275`, client-import `:15`, bare-client-calls `:431/449/505/549/582/817/861` (+ ingest `:2973/3030/3094`), persona-koppeling `:1355`, OpenAI-singleton `:97-104`, streaming-answer `:2256`.
- Retrieval-RPC's: `match_chunks` (V0 `0002:127`), `match_chunks_with_parents` (V0 `0042:24`, huidig), `match_chunks_hybrid` (V0 `0046:25`, huidig). Threshold 0.4 in TS op `rag.ts:1825` (`bot.similarityThreshold`, `bots.ts:380`).
- Tabellen: `documents`/`document_chunks` (`0002`), `parent_chunks` (`0008`), `content_tsv` (`0004`), `website_pages` (`0032`/`0035`), `query_log` (`0003` + ~25 ALTERs).
- Logger: `logQuery` (`lib/v0/server/log.ts:171`, service-role), enige prod-call `app/api/v0/chat/route.ts:544`.
- V1-scaffolding: `lib/supabase/v1/{service-role,server,client,middleware}.ts`; `lib/auth.ts` (`requireAuth`/`requireOrgMember`); `proxy.ts` /v1-branch; `app/v1/app/page.tsx` (`V1_SEED_ORG_ID`).
- Migratienummers: V0 hoogste `0053`, V1 alleen `0001_core_tenancy`.
