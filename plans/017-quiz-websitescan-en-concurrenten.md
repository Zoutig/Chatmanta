# 017 — Kennisbankquiz zonder vragengeschiedenis: websitescan, concurrenten en quizrondes

**Status:** PLAN (19 okt 2026). Er is nog niets gebouwd. Fase 1 en fase 3 bevatten een migratie, dus
Sebastiaan moet het plan eerst goedkeuren (beslistabel in `AGENTS.md`). Fase 3 en fase 5 vragen ook een
scopebesluit (hard rule 1).
**Basis:** het recon-onderzoek van vanavond (quizrapport + completeness-critic), daarna in de bron
nagelezen op HEAD `5fa22b4` (worktree `chatmanta-nacht-plannen`). De bouwbranches van vannacht
(`chatmanta-nacht-*`) hadden op het moment van schrijven nog geen wijzigingen. Fase 0 kan daardoor deels
overlappen met `feat/seb/snelle-verbeteringen`: controleer dat vóór je begint.

---

## Samenvatting en aanbeveling

**Het probleem.** Een nieuwe klant heeft nog geen bezoekersvragen. Juist dan wil je weten wat er in zijn
kennisbank (KB, de verzameling teksten waaruit de bot antwoordt) ontbreekt. De huidige quiz werkt al
zonder vragengeschiedenis, maar hij kijkt alleen naar een kleine steekproef: 12 documenten met elk 2
fragmenten. Een admin kan hem maar één keer per klant draaien, en de antwoorden komen deels verminkt in de
KB.

**Wat dit plan toevoegt.**
1. **Websitescan.** De bot leest elke gecrawlde pagina apart (de *map*-stap: per pagina een korte
   analyse). Daarna combineert één call al die uitkomsten tot vragen (de *reduce*-stap). Vergelijk het met
   een accountant die eerst elke map apart doorbladert en daarna één lijst met ontbrekende stukken maakt.
   De paginateksten staan al in de database (`parent_chunks`), dus er komen **geen nieuwe
   Firecrawl-kosten** bij. Een run kost met `gpt-6-luna` ongeveer **$0,03**.
2. **Quizrondes.** Na een voltooide quiz kan er een nieuwe komen, bijvoorbeeld na een hercrawl. Dat vraagt
   een kleine migratie op de unieke index.
3. **Vragengeschiedenis als extra bron**, alleen als die er is: vragen waarop de bot geen of een zwak
   antwoord gaf.
4. **Optioneel: 2-3 concurrenten.** De admin bepaalt de niche en zoekt uit wat concurrenten noemen dat de
   klant mist. Daarvoor zijn ongeveer 21 Firecrawl-credits per run nodig, via het bestaande loket. De tekst
   van concurrenten komt **nooit** in de KB van de klant.

**Aanbeveling: bouw fase 0 → 1 → 2 (websitescan + rondes, alleen admin) nu, en zet concurrenten (fase 3)
en de sales-kennisscan (fase 5) pas daarna op de agenda.**
Reden:
- De websitescan levert het meeste op voor elke nieuwe klant en kost bijna niets.
- Hij heeft geen externe of juridische afhankelijkheden.
- Hij hergebruikt de bestaande review-gate: de admin keurt de vragen goed vóór de klant ze ziet.

Concurrentvergelijking staat nergens in de scope-documenten. Ze raakt auteursrecht en AVG en kost
Firecrawl-credits. Dat is een apart besluit, en de waarde ervan kun je pas goed inschatten als de
websitescan bij echte klanten heeft bewezen dat de vragen bruikbaar zijn. Self-service door de klant
(fase 4) komt pas als rondes en limieten werken.

---

## Besluiten die Sebastiaan moet nemen

| # | Besluit | Aanbeveling | Reden |
|---|---|---|---|
| B1 | Akkoord op **fase 0 + 1 + 2** (incl. de migratie "quizrondes", fase 1) | **Ja** | Kleine migratie zonder datalek-risico. Het eenmalige-quizslot (`0015:45-47`) blokkeert anders elke vervolgronde. |
| B2 | Mogen e-mail en telefoon **van de ondernemer zelf** ongeredigeerd uit quiz-antwoorden de KB in? | **Ja, maar blijf IBAN/BSN redigeren** | De handmatige Q&A redigeert ook niet (`qa-actions.ts:131-137`). Nu wordt "Bel ons op 010-…" in de KB "Bel ons op [telefoon]". Restrisico: een antwoord kan ook een privénummer van een medewerker bevatten; dat is hetzelfde risico als bij handmatige Q&A en de klant schrijft het zelf. Techniek: een nieuwe optie `redactPii(text, { keep: ['phone','email'] })`, de bestaande aanroep (alles-of-niets, `redact.ts:18`) blijft ongewijzigd voor andere callers. |
| B3 | Model voor de scan | **`gpt-6-luna` voor map én reduce** (standaard-tier, geen priority). Een schakelaar "grondig" (`gpt-6-sol` voor reduce) mag alleen als een kleine A/B op de eval-orgs dat rechtvaardigt | Luna is het goedkoopste model in `MODEL_COSTS_USD` en het V1-hoofdmodel. Sol kost bij reduce ongeveer $0,11 extra per run. |
| B4 | **Scope:** valt concurrentvergelijking in V1? (hard rule 1) | **Ja, maar pas na fase 2, alleen voor de admin, en met de AVG/auteursrecht-vangrails uit §4.6** | Sterk verkoopargument en goedkoop. Het juridische risico blijft klein zolang er alleen afgeleide onderwerpen worden opgeslagen. |
| B5 | Wie start een scan? | **Fase 1-3: alleen een V1-admin** (Sebastiaan/Niels). **Fase 4: de klant mag zelf een websitescan starten (max 1 per 7 dagen), met een lichte admin-gate (auto-actief na 24 uur). Concurrenten blijven altijd admin-only** | Een websitescan kost geen Firecrawl en minder dan $0,05. Concurrenten kosten credits en vragen een juridische afweging. Zonder admin-review vervalt de mitigatie tegen onzin- en "staat er al"-vragen en tegen prompt-injectie; de gate helemaal loslaten is een apart, bewust besluit dat pas mag als het kwaliteitsdoel van fase 2 is gehaald. |
| B6 | Noemen we concurrenten **bij naam** in een vraag aan de klant? | **Nee.** "Andere aanbieders in jouw branche noemen X. Hoe zit dat bij jou?" De admin ziet wel welke concurrent het was | Voorkomt dat een vergelijkende claim de KB of de bot in lekt. |
| B7 | Gratis **kennisscan in de sales-flow** (fase 5) | **Ja als richting, bouwen na fase 2-3** | Een gepersonaliseerde haak voor de opvolgmail. Hij kost wel credits per lead, dus alleen handmatig per lead te starten, niet in bulk. |
| B7a | Mag `lead_kennisscan` **zonder `organization_id`** (uitzondering op hard rule 2)? | **Ja, mits apart akkoord** en met migratiecommentaar dat ernaar verwijst | Het leads-akkoord (`0032:5-7`) dekt alleen de drie leads-tabellen. Het is eigen salesdata, net als `leads`, maar een nieuwe tabel vraagt een nieuw akkoord. Inclusief aanpassing privacyverklaring (nieuw doel: prospect-sites crawlen). |
| B8 | Juridische check van het scrapen van concurrenten (robots.txt, TDM-voorbehoud) | **Laat het één keer bevestigen** (bv. door de jurist van de DPA-ronde) vóór fase 3 live gaat | Zie §4.6. Ik ben geen jurist. |

---

## 1. Huidige situatie (geverifieerd in de bron)

### 1.1 Wat er al staat
- **Datamodel** `supabase/migrations-v1/0015_v1_quiz.sql`: `v1_quiz`, `v1_quiz_question`, `v1_quiz_answer` en
  `v1_quiz_event`. Op alle vier staan `organization_id` en `chatbot_id` op NOT NULL, RLS staat aan, en
  org-leden mogen alleen lezen (SELECT). Schrijven gaat alleen via service-role.
  - `0015:38`: CHECK `analyse_model in ('gpt-4o-mini','gpt-4o')`, dus luna is niet toegestaan.
  - `0015:39`: CHECK `analyse_method in ('category_probe','map_reduce')`. `map_reduce` is al als naad
    voorzien.
  - `0015:45-47`: unieke index `v1_quiz_one_active_per_org … where status <> 'geannuleerd'`. **Een voltooide
    quiz blokkeert voorgoed** elke volgende quiz.
  - `v1_quiz_question.bron` mag alleen `'ai','niels'` zijn. `type` mag alleen `'open','meerkeuze'` zijn
    (één keuze).
  - Org-leden mogen `v1_quiz.bedrijfscontext` en alle vraagkolommen **lezen**. Wat daarin staat, kan de
    klant dus zien. Dat is belangrijk voor de concurrent-data (§4.6).
- **Genereren:** `app/v1/admin/quiz/actions.ts:62-115` (`generateQuizForOrgAction`). Die gebruikt
  `getJorionAdminClient()` (`lib/supabase/admin.ts:38-41`, doet intern `requireJorionAdmin`). Daarna
  draait `analyzeKnowledgeBase` synchroon (`lib/v1/quiz/analysis.ts:364-439`).
  - Er staat `maxDuration = 120` op `app/v1/admin/quiz/[orgId]/page.tsx:14`.
  - `QUIZ_RETRIGGERABLE` (`actions.ts:41`) bevat `concept/leeg/mislukt/generating`. `actief` en
    `voltooid` zijn finaal.
- **Analyse-engine** (`lib/v1/quiz/analysis.ts`):
  - de steekproef (`:45-47`, `:121-159`) beslaat 12 documenten × 2 willekeurige chunks, met een plafond van
    16k tekens;
  - 8 vaste probes plus dynamische categorieën, beoordeeld op de top-1-similarity (`:227-268`);
  - `chatJson` (`:77-93`) stuurt `temperature`/`max_tokens` direct mee. GPT-6 geeft daarop een 400, zie
    `lib/ai/llm.ts` `openaiChatParams`.
- **Beantwoorden** (klant): `app/v1/app/quiz/actions.ts:48-171`.
  - Auth via `getSessionOrg` + `requireOrgMember` (`:56-57`), daarna de check vraag → quiz → org (`:66-70`).
  - `redactPii` op het antwoord (`:99-102`), daarna `ingestDocument` met `metadata.origin='quiz'`.
  - **Er volgt geen `purgeAnswerCache`.** Ernst volgens de critic: middel. Alleen eerder gecachete
    *antwoorden* blijven hangen, fallbacks staan niet in de cache (`lib/rag/run-rag-query.ts:3499-3515`).
- **Crawl-data:** een gecrawlde pagina is een `documents`-rij met `source='website'` (migr `0003:166-168`)
  en `metadata.source_url/source_title` (`lib/v1/crawler/processCrawl.ts:61,83`).
  - De volledige tekst staat in `parent_chunks` (`0002:66-76`), oplopend `parent_index`, 3200 tekens per
    parent met 400 tekens overlap (`lib/rag/chunker.ts:6-7`).
  - Er gaan maximaal 50 pagina's per crawl (`lib/v1/crawler/limits.ts:8`). Door meerdere bronnen of
    "aanvullen" kan een KB er meer hebben.
- **Firecrawl-loket (PR #285):** `lib/v1/crawler/firecrawl-gate.ts`.
  - Eigen plafond per minuut, per endpoint en per **team**: `map 8, scrape 8, batch 10` (`:22-26`).
  - Wacht bij drukte en vangt een 429 op, binnen een deadline.
  - `mapSite` (`firecrawl.ts:181`), `scrapeOne` (`:261`) en `startBatchScrape` (`:275`) lopen er allemaal
    doorheen.
  - Credit-log in `credit-log.ts:15-28`. Let op: `mapSite`/`scrapeOne` geven **geen orgId** mee (`:194,267`),
    en de CHECK op `operation` staat alleen `map/sitemap/scrape/screenshot` toe (`0003:152`).
  - Saldo opvragen: `getFirecrawlAccountUsage` (`firecrawl.ts:119`).
  - Er is **geen robots.txt-controle** in `lib/rag/crawler` of `lib/v1/crawler`.
- **Kosten en budget:**
  - `MODEL_COSTS_USD` in `lib/ai/llm.ts:42-50`: luna $0,10/$0,50, sol $2/$10, 4o-mini $0,15/$0,60 en
    4o $2,50/$10 per M tokens. `costForModelUsd` (`:105-118`) rekent priority-tier ×2. `costUsdToEur`
    gebruikt 0,92 (`:139-143`). Embeddings: `text-embedding-3-small` $0,02/M (`lib/rag/embeddings.ts:24`).
  - Het EUR-dagbudget per org (`lib/v1/limits/usage-limits.ts`, standaard €2) telt **alleen `query_log`**.
    Quizkosten staan in `v1_quiz.analyse_cost_usd/generation_cost_usd` en vallen er dus buiten. Dat is nu
    acceptabel, omdat alleen de admin de quiz start.
- **Vragengeschiedenis (V1):**
  - `query_log` (`0002`) heeft `kind` (`fallback` …), `gap_kind`, `claim_confidence`,
    `hard_fact_supported`, `top1_sim` en `from_cache`.
  - Feedback staat in `0012_v1_feedback`.
  - Het onbeantwoord-rapport van vanavond stelt één gedeelde helper voor de definitie van "onbeantwoord"
    voor (`lib/v1/dashboard/*`). Hergebruik die als hij er komt, en bouw geen zesde definitie.
- **Leads (sales):** `0032_v1_leads.sql`. Dit is een gesanctioneerde uitzondering op hard rule 2, met RLS
  aan en geen policies. Er staan al `website_url`, `niche` en `woorden` in.
- **Marketingsite:** `lib/site/pricing.ts:70` belooft "Kennisgat-quiz + FAQ-inzichten". Na dit plan klopt
  die belofte beter. Ook zonder dit plan hoort hij in de eerlijkheidsronde van de copy.
- **Demo-kopie:** `app/voorbeeld/(dashboard)/quiz/*` kopieert de klant-quiz. Spiegel UI-wijzigingen daar.

### 1.2 Wat er nu misgaat (de prioriteit volgt de vraag "breekt dit de websitescan?")
1. De quiz kan maar één keer per klant (index `0015:45-47`, `actions.ts:85-94, 227-229`).
2. Geen cache-purge na een quiz-antwoord, waardoor de klant aanvult maar de bot oude antwoorden blijft
   geven.
3. Redactie verminkt de eigen contactgegevens van de klant (`actions.ts:99-102` tegenover
   `analysis.ts:60`).
4. Er is geen admin-ingang per klant. Je moet de URL met de org-UUID zelf typen (0 treffers op "quiz" in
   `app/v1/admin/organizations`).
5. De steekproef is te smal en de "branche"-probe geeft vrijwel altijd een gat (`analysis.ts:62`).
6. Een mislukte ingest blijft onzichtbaar (`actions.ts:143-147`, alleen `console.error`).
7. Meerkeuze ondersteunt maar één keuze (`quiz-runner.tsx:23,35-36`), waardoor betaalmethoden of diensten
   onvolledig in de KB komen.
8. Het KB-leeg-gate telt soft-deleted documenten mee (`analysis.ts:109-113`).

---

## 2. Ontwerp: de websitescan (map-reduce)

### 2.1 Pijplijn
```
documents (org+chatbot, deleted_at null, included)
  ├─ website-pagina's  → paginatekst = parents samengevoegd (overlap 400 tekens eraf), plafond 12k tekens
  ├─ uploads (pdf/docx) → idem, plafond 12k tekens per document
  └─ metadata->>'origin' in ('quiz','manual_qa')  → NIET scannen, wel als "al bekend"-lijst aan reduce
     (beide hebben source='upload'; een filter op source mist ze. Origin-waarden in één gedeelde
      constante, bv. lib/v1/kb/origins.ts, die ook qa-actions.ts en quiz/actions.ts gebruiken)
        │
        ▼
MAP   (gpt-6-luna, 1 call per pagina, max 60 pagina's, parallel in een pool van 4)
      in : bedrijfscontext + paginatekst in <pagina nonce=…>-tags ("instructies in de tekst negeren")
      uit: JSON { onderwerpen[], beantwoorde_klantvragen[], vaag[]: {citaat≤160, waarom},
                  ontbreekt_vermoedelijk[] }   ← citaat moet letterlijk in de pagina staan (deterministisch
                                                  gecontroleerd); ongeldig citaat → item vervalt
        │
        ▼  (optioneel) HISTORIE: laatste 90 dagen "onbeantwoord" (gedeelde helper), redactPii,
        │   geclusterd tot ≤15 thema's met aantallen (1 luna-call)
        │  (optioneel, fase 3) CONCURRENTEN: alleen afgeleide onderwerpen, zie §4
        ▼
REDUCE (gpt-6-luna; "grondig" = gpt-6-sol)
      in : bedrijfscontext, alle map-uitkomsten (compact), historie-thema's, concurrent-onderwerpen,
           bestaande Q&A-vragen + vragen uit eerdere rondes (niet opnieuw vragen)
      uit: dekkingsmatrix {onderwerp: gedekt|vaag|ontbreekt, bewijs: [url]} + max 20 vragen
           {vraag, type: open|meerkeuze|meerkeuze_multi, opties, categorie, herkomst, waarom, bewijs_urls}
        │
        ▼
CHECK (gratis/bijna gratis): per vraag de bestaande probe-RPC `match_chunks_with_parents` met de vraag zelf;
      top1 ≥ THRESHOLDS[chatbot.indexVersion].present (analysis.ts:39-42; v1 0,55 / v2 0,50) → vraag
      vervalt (staat er al); dedupe tegen eerdere rondes via embedding-cosinus ≥ DEDUPE_THRESHOLDS
      [indexVersion] — startwaarde 0,9 is een gok, kalibreren in de kwaliteitscheck van fase 2
      (hard rule 8: drempels zijn model-gebonden) en per indexversie als constante vastleggen
        │
        ▼
v1_quiz (status concept) → admin keurt goed (bestaande quiz-manager) → klant beantwoordt
```

- **Bronselectie en isolatie (hard rule 6 in de geest):** de scan leest `parent_chunks` direct, niet via
  een vector-RPC, en `parent_chunks` heeft zelf geen `deleted_at`/`included` (`0002:66-76`). Daarom één
  functie `loadScanPages(client, orgId: string, chatbotId: string)` met verplichte parameters,
  `.eq('organization_id', orgId).eq('chatbot_id', chatbotId)` op `parent_chunks` én een
  `documents!inner`-join met `deleted_at is null` en `included = true` (en dezelfde org/chatbot-filter op
  `documents`). Dit pad gaat mee in `npm run v1:test-org-isolation`.
- **Waarom per pagina en niet alles in één prompt:** 50 pagina's van ongeveer 3k tokens passen technisch
  in één call. Uit het eerdere Luna-onderzoek bleek echter dat meer context niet tot betere antwoorden
  leidt (memory: Luna-pipeline). Een aparte map-call per pagina geeft ook per-pagina-bewijs ("op /tarieven
  staat 'prijs op aanvraag'"), en dat maakt de vraag voor de klant geloofwaardig.
- **Async:** 60 map-calls in een pool van 4 duren 30-90 s. Het voorstel:
  - de action zet de quiz op `generating` en geeft direct antwoord;
  - het werk draait in `after()` (Next 16; lees eerst `node_modules/next/dist/docs/` over `after`);
  - de pagina pollt de status, zoals de crawl-tick.
  - Een harde deadline van 100 s binnen `maxDuration`. Is die op, dan reduce met de pagina's die klaar
    zijn, met een event `partial`.
  - Alternatief bij een te kort plafond: verwerken in stappen per tick, met de staat in een eigen
    tabel (§3).
- **GPT-6-params:** `chatJson` gaat via `openaiChatParams(model, …)` (geen `max_tokens`,
  `reasoning_effort:'none'`) en **zonder** `service_tier:'priority'`. Een scan is niet tijdkritisch, en
  priority verdubbelt de prijs (`costForModelUsd`).
- **Prompt-injectie:** pagina- en concurrenttekst zijn onbetrouwbare data. Daarom: tags met een nonce per
  run, een schema-output (JSON) en een citaatcheck. De output komt alleen als *conceptvraag* bij de admin,
  nooit direct in de KB of bij een bezoeker. Dat volgt de richting van plan 013, maar die grens is hier
  goedkoop te trekken omdat de output geen bezoekersantwoord is.

### 2.2 Wat de klant ziet (UX)
- **Een kaart op de kennisbankpagina** (bestaande melding `kennisbank/page.tsx:83-88`): "Ronde 2 ·
  websitescan · 12 vragen · ±6 min".
- **Per vraag een regel "Waarom vragen we dit?"** met het bewijs, bijvoorbeeld: *"Op je pagina Tarieven
  staat 'prijs op aanvraag'. Bezoekers vragen vaak naar een richtprijs."* De klant mag de URL zien. Dat
  is het dashboard en geen bot-antwoord, dus hard rule 9 geldt hier niet. De **bot** toont nooit
  bronlinks.
- **Meerkeuze met meerdere antwoorden** (`meerkeuze_multi`), plus de bestaande opties "Anders" en
  "Overslaan".
- **De nieuwe knop "Niet van toepassing"** wordt opgeslagen. Die vraag komt in een volgende ronde niet
  terug, en er wordt niets ingelezen.
- **Een eindscherm**: "8 nieuwe feiten toegevoegd. Je chatbot kan nu antwoord geven op: …" met een knop
  "Test het nu" (het bestaande test-patroon van het onbeantwoord-rapport).
- **Dekkingsoverzicht (fase 4):** een eenvoudige lijst met onderwerpen in drie kleuren (gedekt / vaag /
  ontbreekt). Dat is ook het retentie-moment: "zo compleet is je chatbot nu".
- **Copy volgens de rustregels van V1-UI** (memory V1 UI-redesign): geen gamification en geen confetti.
- **Demo-kopie** `app/voorbeeld/(dashboard)/quiz` gelijk trekken.

### 2.3 Wat de admin ziet
- **Een tab "Quiz" op de klantpagina** (`app/v1/admin/organizations/[id]`). Het cross-org-overzicht
  blijft alleen een lijst (keuze van de critic, B3).
- **Een startformulier** met: methode (categorie-probe / websitescan), "historie meenemen" (alleen
  aanklikbaar als er onbeantwoorde vragen zijn), concurrenten (fase 3), model, en een **kostenraming
  vooraf** (§5).
- **Per conceptvraag:** herkomst (website / historie / concurrent / categorie) en bewijs-URL's. Bij een
  concurrent ook welke. Dat staat in de admin-only tabel, zie §3.2.
- **Rondehistorie:** eerdere quizzen met status, kosten en het aantal ingelezen antwoorden. Mislukte
  ingests krijgen een knop "Opnieuw inlezen" (fase 0).

---

## 3. Datamodel, RLS en SA-1

### 3.1 Migratie fase 1: `00NN_v1_quiz_rondes.sql`
Het nummer kies je met `/check-migration`. Op HEAD is de hoogste `0037`, en `0033` ontbreekt lokaal
(mogelijk een open PR). Verwacht dus `0038` of hoger.

```sql
-- 1. Rondes: max één OPEN quiz per org+bot; voltooid/geannuleerd/leeg/mislukt = historie.
drop index if exists public.v1_quiz_one_active_per_org;
create unique index v1_quiz_one_open_per_org
  on public.v1_quiz (organization_id, chatbot_id)
  where status in ('generating','concept','actief');

-- 2. Methoden en modellen verbreden.
alter table public.v1_quiz drop constraint v1_quiz_analyse_method_chk;
alter table public.v1_quiz add constraint v1_quiz_analyse_method_chk
  check (analyse_method in ('category_probe','map_reduce','website_scan'));
alter table public.v1_quiz drop constraint v1_quiz_analyse_model_chk;
alter table public.v1_quiz add constraint v1_quiz_analyse_model_chk
  check (analyse_model in ('gpt-4o-mini','gpt-4o','gpt-6-luna','gpt-6-sol'));

-- 3. Rondenummer + wie startte + welke bronnen (geen PII, geen concurrent-namen).
alter table public.v1_quiz
  add column ronde      integer not null default 1,
  add column gestart_door text  not null default 'admin' check (gestart_door in ('admin','klant')),
  add column bronnen    text[]  not null default '{}'   -- subset van {website,historie,concurrenten}
    check (bronnen <@ array['website','historie','concurrenten']::text[]);

-- 4. Vraag: herkomst, uitleg voor de klant, meervoudige keuze.
alter table public.v1_quiz_question
  add column herkomst text not null default 'categorie'
    check (herkomst in ('categorie','website','historie','concurrent','handmatig')),
  add column waarom   text check (waarom is null or char_length(waarom) <= 500),
  add column bewijs_urls text[] not null default '{}';     -- alleen URL's van de EIGEN site
alter table public.v1_quiz_question drop constraint v1_quiz_question_type_chk;
alter table public.v1_quiz_question add constraint v1_quiz_question_type_chk
  check (type in ('open','meerkeuze','meerkeuze_multi'));

-- Bestaande handmatige vragen (bron='niels') krijgen de juiste herkomst, niet de default.
-- Leidend: `herkomst` beschrijft WAAR de vraag vandaan komt (categorie/website/historie/
-- concurrent/handmatig); `bron` blijft alleen "wie schreef hem" (ai/niels). Invariant:
-- bron='niels' <=> herkomst='handmatig'.
update public.v1_quiz_question set herkomst = 'handmatig' where bron = 'niels';

-- 5. Antwoord: meervoudige keuze + "niet van toepassing" (wordt niet geïngest, voorkomt herhaling).
alter table public.v1_quiz_answer
  add column meerkeuze_opties text[]
    check (meerkeuze_opties is null
           or (cardinality(meerkeuze_opties) between 1 and 12
               and char_length(array_to_string(meerkeuze_opties, '')) <= 2000)),
  add column niet_van_toepassing boolean not null default false;
-- `meerkeuze_optie` (enkelvoud) blijft voor type 'meerkeuze'; 'meerkeuze_multi' schrijft
-- alleen `meerkeuze_opties`. createAnswer + klant-action + ingest-tekst lezen beide.

-- 6. Event-kinds verbreden: ELKE kind die fase 1-4 schrijft moet hier staan, anders faalt de
-- best-effort insert stil met 23514 en verdwijnen precies de vangrail-signalen.
alter table public.v1_quiz_event drop constraint v1_quiz_event_kind_chk;
alter table public.v1_quiz_event add constraint v1_quiz_event_kind_chk check (kind in (
  'created','analyse_started','probes_scored','generated',
  'status_change','question_edited','question_added','question_deleted',
  'activated','failed','answer_submitted',
  'partial','cost_cap_hit','ingest_retry','klant_started','stale_failed','niet_van_toepassing'
));
-- `author` ('klant','operator','systeem','ai') dekt alle nieuwe kinds al.
```
- **Geen nieuwe tabel, dus geen nieuwe policy.** De bestaande SELECT-policies voor org-leden dekken de
  nieuwe kolommen. `bewijs_urls` bevat alleen URL's van de eigen gecrawlde site. Die mag de klant zien.
- **Stale `generating`:** de unieke index telt `generating` als open. Een `after()`-run die door een
  timeout of crash wordt afgekapt, zou anders elke volgende scan blokkeren (in fase 4 zit de klant dan
  vast). Regel in code, geen extra migratie: bij elke start én elke statuspoll wordt een quiz die langer
  dan 10 minuten op `generating` staat (`updated_at`) naar `mislukt` gezet, met event `stale_failed`.
  `mislukt` telt **niet** mee voor de cooldowns uit §6.
- **Rollback:** de oude index kan alleen terug als er geen tweede niet-geannuleerde quiz per org bestaat.
  Noteer dat in het migratiecommentaar.
- **Code die meeverandert:**
  - `getActiveQuizForOrg` (`lib/v1/quiz/data.ts:251-262`) wordt gesplitst in `getOpenQuizForOrg`
    (generating/concept/actief, voor de admin) en `getLiveQuizForOrg` (alleen `actief`, voor klant en
    banner);
  - `QUIZ_RETRIGGERABLE` en `cancelQuizAction` (`admin/quiz/actions.ts:41,85-94,227-229`);
  - `lib/controlroom/types.ts` (`QuizAnalyseMethod/Model`);
  - het rondenummer = `max(ronde)+1` binnen dezelfde insert (de unieke index vangt de race).

### 3.2 Migratie fase 3: admin-only scan-gegevens `v1_quiz_scan_bron`
Concurrent-URL's en hun afgeleide onderwerpen mogen **niet** in `v1_quiz.bedrijfscontext` of in
`v1_quiz_question`, want die zijn via RLS leesbaar voor org-leden.
```sql
create table public.v1_quiz_scan_bron (
  id              uuid primary key default gen_random_uuid(),
  quiz_id         uuid not null references public.v1_quiz(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  chatbot_id      uuid not null references public.chatbots(id) on delete cascade,
  soort           text not null check (soort in ('concurrent')),
  url             text not null check (char_length(url) <= 500),
  label           text check (label is null or char_length(label) <= 160),   -- domeinnaam
  status          text not null default 'pending' check (status in ('pending','klaar','geweigerd_robots','mislukt')),
  onderwerpen     jsonb not null default '[]'::jsonb,  -- ALLEEN afgeleide onderwerpnamen, geen tekst
  credits         integer not null default 0,
  created_at      timestamptz not null default now()
);
-- Backing-indexen voor de cascade-FK's (anders seq-scan bij elke quiz-/org-delete).
create index v1_quiz_scan_bron_quiz_idx on public.v1_quiz_scan_bron (quiz_id);
create index v1_quiz_scan_bron_org_bot_idx on public.v1_quiz_scan_bron (organization_id, chatbot_id);
alter table public.v1_quiz_scan_bron enable row level security;
-- Bewust GEEN policies (patroon 0017/0019/0032): alleen service-role na requireJorionAdmin.
```
- Voldoet aan hard rule 2 (`organization_id NOT NULL`) en hard rule 3 (RLS aan in dezelfde migratie).
  Zonder policies is de tabel voor de klant onzichtbaar.
- Een vraag met `herkomst='concurrent'` verwijst niet naar de bron. De koppeling loopt via
  `v1_quiz_scan_bron.onderwerpen[].vraag_volgorde` en alleen de admin leest die.
- `firecrawl_credit_log` (**onvoorwaardelijk**, nagelezen: `startBatchScrape` logt nu helemaal geen
  credits, `logFirecrawlCredits` kent geen `'batch'` in de TS-union `credit-log.ts:17` noch in de CHECK
  `0003:152`, en `mapSite`/`scrapeOne` geven geen orgId mee `firecrawl.ts:194,267`). In fase 3:
  CHECK + TS-union verbreden met `'batch'`, batch-credits loggen bij afronding (aantal gescrapete
  pagina's), en `orgId` optioneel doorgeven aan `mapSite`/`scrapeOne`/`startBatchScrape`. Dit repareert
  ook de onzichtbare batch-credits van gewone klantcrawls. Kan desgewenst als losse kleine PR vóór fase 3.

### 3.3 SA-1 / service-role (hard rules 4 en 5)
- **Admin-actions:** `getJorionAdminClient()` (de wrapper, SA-5). `requireJorionAdmin` is auth, maar
  geen objectcontrole. Daarom:
  - elke `quizId` of `questionId` uit de client krijgt `.eq('organization_id', orgId)`, waarbij orgId
    uit de route komt (critic §E);
  - `orgId` zelf moet als org bestaan (`getOrgChatbot`).
- **Klant self-service (fase 4):**
  - `getSessionOrg()` + `requireOrgMember(orgId)`, en orgId komt **uit de sessie**, nooit uit de client;
  - de klant geeft geen URL's en geen model op: alleen "start websitescan";
  - service-role via `getV1ServiceRoleClient()` (`lib/supabase/v1/service-role.ts`).
- **Vector search:** de check-stap gebruikt de bestaande `match_chunks_with_parents` met verplichte
  `orgId` + `chatbotId` (hard rule 6).
- **Concurrent-URL's** (alleen admin): eerst `validateCrawlUrl` (SSRF, `lib/rag/crawler/validateCrawlUrl.ts:85`),
  alleen http(s) en maximaal 3. Daarnaast weigeren als de host gelijk is aan de host van de klant (die is
  al gecrawld).
- **Isolatietest:** voeg de nieuwe tabel en de rondes toe aan `npm run v1:test-org-isolation`.

---

## 4. Concurrentvergelijking (fase 3)

### 4.1 Flow
1. **Niche bepalen** (1 luna-call op de bedrijfscontext + de map-uitkomsten): branche, regio,
   kerndiensten. Dit hergebruikt `deriveContext`.
2. **Concurrenten kiezen:** de admin vult 2-3 URL's in. Een optionele knop "stel voor" laat luna namen
   voorstellen, maar die worden **nooit automatisch gecrawld**: de admin moet elk voorstel bevestigen,
   omdat een LLM bedrijven verzint.
3. **Per concurrent:**
   - lees robots.txt (gewone `fetch`, gratis). Is `/` of het pad uitgesloten voor `*` of een TDM-agent,
     dan status `geweigerd_robots`;
   - `mapSite(url, 100)` via het loket (1 credit);
   - kies deterministisch maximaal 6 kernpagina's: home plus pagina's waarvan de URL of titel lijkt op
     prijzen/tarieven, diensten/aanbod, faq/veelgestelde, over-ons, voorwaarden/garantie, werkwijze;
   - `startBatchScrape` (1 batch-call, 6 credits). De status pollt in de quiz-tick
     (`getCrawlJobStatus`, statuspolls lopen niet via het loket).
4. **Direct na binnenkomst:** per pagina één luna-map-call die *alleen* onderwerpnamen geeft
   ("garantietermijn", "gratis offerte", "spoedservice 24/7"), zonder zinnen, prijzen of namen van
   personen. **De ruwe markdown wordt daarna weggegooid** en komt nergens in de DB, de logs of Sentry.
5. **Reduce:** onderwerpen die bij ≥1 concurrent voorkomen en in de dekkingsmatrix van de klant
   `ontbreekt` of `vaag` zijn, worden kandidaatvragen met `herkomst='concurrent'` en een neutrale
   formulering (B6).
   - Reduce krijgt **alleen anonieme onderwerpnamen** (plus "bij N aanbieders"), nooit concurrent-URL's,
     -hosts of -labels. De koppeling onderwerp → concurrent gebeurt ná reduce, in code, in
     `v1_quiz_scan_bron`.
6. **Deterministische nafilter na reduce** (geldt voor élke scan, niet alleen met concurrenten), want
   `vraag`/`context`/`waarom`/`bewijs_urls` zijn via RLS leesbaar voor org-leden en de prompt alleen
   is geen grens:
   - `bewijs_urls` moet een subset zijn van de `documents.metadata.source_url`-set van deze
     org+chatbot (`deleted_at is null`, `included`); andere URL's worden gestript;
   - een vraag waarvan `vraag`, `context`, `waarom` of een optie een concurrent-host of -label uit
     `v1_quiz_scan_bron` (van deze run) bevat, vervalt;
   - unit-test met een reduce-mock die een concurrentnaam en een vreemde URL teruggeeft.

### 4.2 Firecrawl-loket
- Alles gaat via `gate()` in `firecrawl.ts`, dus via dezelfde teller als de crawls van klanten en de MCP.
  Het loket wacht bij drukte.
- `scrapeOne` in een lus kost 18 scrape-slots (meer dan 2 minuten bij 8 per minuut). Batch kost maar 1
  batch-slot, daarom batch.
- Vóór de start: `getFirecrawlAccountUsage()`. Is het resterende saldo onder de 100 credits, dan
  weigeren met een duidelijke melding. Zo kan een scan nooit een echte klantcrawl verdringen.
- **Volgorde:** draait er voor deze org een crawl (`processing_jobs` open), dan wacht de scan. Het
  websitescan-deel heeft de nieuwste paginatekst nodig.

### 4.3 Niet in de KB van de klant (hard)
- Concurrent-tekst wordt **nooit** via `ingestDocument` ingelezen en nooit als chunk, parent of
  answer-cache-entry opgeslagen. Anders kan de bot concurrentfeiten als eigen feiten brengen. Dat botst
  met anti-hallucinatie (hard rule 8) en is misleidend.
- Wat de KB wel in gaat, is uitsluitend **het antwoord van de klant** op de vraag. Dat is eigen tekst van
  de klant, die via het bestaande quiz-pad wordt ingelezen.
- Unit-test: de `competitor-scan`-module importeert geen `lib/rag/ingest`. Daarnaast een grep-gate in
  `verify`.

### 4.4 Kosten per concurrent-run
Zie §5. Ongeveer 21 credits en minder dan $0,01 aan LLM.

### 4.5 Hergebruik
`lib/v1/quiz/competitor-scan.ts` (nieuw), `lib/v1/crawler/firecrawl.ts` (`mapSite`, `startBatchScrape`,
`getCrawlJobStatus`, met `orgId` voor de credit-log), `firecrawl-gate.ts` en `validateCrawlUrl`.

### 4.6 AVG en auteursrecht
- **Auteursrecht:** een concurrentsite is beschermd werk. Feiten en onderwerpen ("biedt 24/7-service")
  zijn dat niet, de formulering wel.
  - We slaan alleen afgeleide onderwerpnamen op en geven nooit tekst door aan de bot of de klant.
  - Tekst- en datamining is in de EU toegestaan, tenzij de rechthebbende het machineleesbaar heeft
    uitgesloten (DSM-richtlijn art. 4, in NL art. 15o Auteurswet). Daarom: robots.txt respecteren, en ook
    een eventuele `tdm-reservation`-header/meta, en bij twijfel overslaan. **Laat dit bevestigen (B8).**
- **Databankenrecht:** 6 pagina's per concurrent is geen "substantieel deel". Houd de cap hard.
- **AVG:** concurrentsites kunnen personeelsnamen of e-mailadressen bevatten.
  - De map-prompt verbiedt personen- en contactgegevens in de output.
  - Een deterministische nafilter met `redactPii` op de onderwerpen, en een onderwerp met een placeholder
    vervalt.
  - De ruwe tekst wordt niet bewaard, dus er is geen bewaartermijn nodig. Grondslag: gerechtvaardigd
    belang, met minimale verwerking.
  - **Privacyverklaring aanpassen is verplicht in fase 3** (en opnieuw in fase 5). Er komt geen nieuwe
    sub-verwerker bij, maar wel een nieuw doel: `app/privacy/page.tsx:294-295` beschrijft Firecrawl nu
    alleen als "het uitlezen van de openbare website van een klant". Dat wordt verbreed naar
    "… en, voor kennisanalyses, openbare websites van andere aanbieders in dezelfde branche" (fase 5:
    "en van potentiële klanten"). OpenAI-regel idem.
- **Ethiek richting de klant:** de UI zegt "andere aanbieders in jouw branche" en noemt geen namen (B6).
  De admin kan de concurrent zien.

---

## 5. Kosten per run (USD, berekend met `MODEL_COSTS_USD`, standaard-tier)

Aannames: 50 pagina's, ±2,5k tokens tekst + 0,6k prompt per map-call, ±350 tokens output per pagina.
Reduce: ±25k in en ±6k uit.

| Onderdeel | Tokens (in / uit) | luna ($0,10/$0,50) | 4o-mini ($0,15/$0,60) | sol ($2/$10) | 4o ($2,50/$10) |
|---|---|---|---|---|---|
| Map, 50 pagina's | 155k / 17,5k | **$0,024** | $0,034 | $0,49 | $0,56 |
| Reduce | 25k / 6k | **$0,006** | $0,007 | $0,11 | $0,12 |
| Historie clusteren (≤200 vragen) | 8k / 1k | $0,001 | $0,002 | — | — |
| Check-stap (embeddings 3-small) | ±5k | <$0,0001 | | | |
| **Websitescan totaal** | | **≈ $0,03** | ≈ $0,04 | ≈ $0,60 | ≈ $0,68 |
| + concurrenten (3 × 6 pagina's map + niche) | 60k / 6,5k | +$0,01 | +$0,01 | | |
| + Firecrawl concurrenten | 3 × (1 map + 6 batch) | **≈ 21 credits** | | | |
| Luna-map + sol-reduce ("grondig") | | ≈ $0,14 | | | |

- In EUR (×0,92) is een standaard-scan ±€0,03. Ter vergelijking: het EUR-vangnet per org is €2/dag.
- Met priority-tier zou alles ×2 zijn. Dat doen we bewust niet.
- **Harde cap per run: $0,25.** Is de raming vooraf hoger, dan downsamplen (minder pagina's). Loopt de
  werkelijke som tijdens de map-stap boven de cap, dan stoppen, met reduce op wat er is en event
  `cost_cap_hit`.
- De kosten komen in `analyse_cost_usd` (map + historie + concurrenten) en `generation_cost_usd` (reduce),
  plus de credits in `v1_quiz_scan_bron.credits` en `firecrawl_credit_log`.
- **Niet in `query_log`.** Een rij daar telt als "vraag" en zou de vragenlimiet van de klant opeten
  (`usage-limits.ts:6`). De admin-gebruikspagina (`lib/v1/admin/usage.ts`) krijgt in fase 2 een regel
  "quizscans deze maand: $X".

---

## 6. Budget- en misbruikvangrails

| Vangrail | Admin (fase 2-3) | Klant self-service (fase 4) |
|---|---|---|
| Wie | `requireJorionAdmin` | `requireOrgMember`, org uit de sessie |
| Methode | alles | alleen websitescan (+ historie automatisch), **geen concurrenten** |
| Cooldown per org | 1 scan per 24 uur | 1 scan per 7 dagen, max 4 per maand |
| Account-breed | max 30 scans per dag (count op `v1_quiz.created_at`), daarboven 429 | telt mee in dezelfde 30 |
| EUR-vangnet | n.v.t. (admin) | start alleen als `getOrgSpendTodayEur + raming ≤ daily_budget_eur`. De scan telt niet in `query_log`, dus de bot zelf blijft altijd online |
| Kosten per run | cap $0,25 | cap $0,10, alleen luna |
| Concurrent-caps | max 3 concurrenten × 6 pagina's, saldo ≥ 100 credits, robots.txt | — |
| Parallel | unieke index "max één open quiz" + status `generating` | idem |
| Dubbelklik | de unieke index geeft 23505, die al als `QuizExistsError` wordt afgevangen (`actions.ts:96-101`) | idem |
| Review | concept → admin keurt goed | **lichte admin-gate:** vragen staan eerst op concept, admin krijgt een event (`klant_started`) en ze worden automatisch actief na 24 uur zonder bezwaar. Volledig loslaten mag pas als fase 2 het kwaliteitsdoel (≥70% terecht, ≤10% "staat er al") aantoonbaar haalt; dat is een bewuste keuze in B5. Concurrent-vragen bestaan in deze modus niet |
| Audit | `v1_quiz_event` + `writeAuditLog` bij het starten | idem |

De cooldowns zijn te checken op bestaande kolommen (`created_at`, `gestart_door`) en vragen dus geen extra
migratie. Upstash (rate-limit) is niet nodig, omdat er hooguit enkele aanvragen per dag zijn.
Fase 4 raakt SA-6 (abuse-limits, `docs/V2_SCOPE_EN_PRINCIPES.md:186`). Dit is geen publieke self-service
signup, maar wel een klant die betaalde calls start. De limieten hierboven zijn daarom verplicht.

---

## 7. Fasering

| Fase | Inhoud | Grootte | Migratie | Gate |
|---|---|---|---|---|
| **0** | Voorwaarden (eerst nagaan wat `feat/seb/snelle-verbeteringen` vannacht al deed): `purgeAnswerCache` na een quiz-ingest; tab "Quiz" op de admin-klantpagina; redactie gelijk aan B2 via een nieuwe `keep`-optie op `redactPii` (IBAN/BSN wel, eigen telefoon/e-mail niet; unit-tests voor IBAN/BSN en voor ongewijzigd gedrag zonder optie); KB-leeg-gate op `deleted_at`; `chatJson` via `openaiChatParams`; "Opnieuw inlezen" bij een mislukte ingest; unit-tests `lib/v1/quiz/__tests__` (OpenAI gemockt) | S-M | nee | staande merge-OK geldt **niet** (V1). Gewone PR |
| **1** | Migratie quizrondes (§3.1) + split `getOpenQuiz`/`getLiveQuiz` + rondenummer in de UI + `meerkeuze_multi` + "Niet van toepassing" (klant-UI + demo-kopie) | S-M | **ja** | planakkoord B1, daarna zelf `migrate:v1` |
| **2** | Websitescan: `lib/v1/quiz/website-scan.ts` (map/reduce/check), async + polling, historie-bron via de gedeelde onbeantwoord-helper, kostenraming + cap, "waarom"-regel per vraag, admin-startformulier, kostenregel op de usage-pagina. **Kwaliteitscheck:** draai de scan op de 3 fictieve eval-orgs (plan 016 fase 1) en op één demo-org, en beoordeel handmatig ±60 vragen op "terecht gat / staat er al / onzin". Doel: ≥70% terecht en ≤10% "staat er al". Daarna de A/B luna vs. sol voor reduce (B3) | L | nee | billable < $1, in de chat akkoord vragen |
| **3** | Concurrenten (§4): migratie `v1_quiz_scan_bron` + credit-log-CHECK/batch-logging, privacyverklaring bijwerken, nafilter na reduce, robots/TDM-check, batch via het loket, nicheanalyse, onderwerpen-only, grep-gate "geen ingest" | L | **ja** | scopebesluit B4 + juridisch B8 + planakkoord |
| **4** | Klant self-service websitescan + dekkingsoverzicht + cooldowns en EUR-check (§6) | M | nee | akkoord B5 |
| **5** | Sales-kennisscan voor leads (§8) + privacyverklaring (prospect-sites) | M | **ja** (`lead_kennisscan`) | besluit B7 + B7a + planakkoord |

**Afhankelijkheden:** 1 vóór 2 (anders kan een bestaande klant met een voltooide quiz geen scan krijgen).
De gedeelde onbeantwoord-helper (van het onbeantwoord-rapport) vóór het historie-deel van 2. Ontbreekt
hij, dan bouwt fase 2 eerst zonder historie. 3 en 5 delen de onderwerpen-only-concurrentmodule.

**Definition of Done per fase:** `npm run verify` + `npm run build` (op Windows eerst `.next/` wissen),
Playwright of de browser op `/v1/admin/organizations/[id]` → Quiz en `/v1/app/quiz`, de isolatietest
(vanaf fase 1) en de demo-kopie gespiegeld.

---

## 8. Verkoopargument: de gratis kennisscan

**Wat het is.** Vanuit het leads-dashboard (`/v1/leads`) start een admin per lead een "kennisscan". De
uitkomst is een kort rapport: "Deze 5 vragen stellen bezoekers waarschijnlijk, en je site beantwoordt ze
niet (of vaag). Andere aanbieders in je branche noemen wél X en Y." Dat wordt een blok in de opvolgmail
(memory: opvolgmail-tool) of een PDF.

**Waarom het werkt.** Het is concreet, gaat over de eigen site van de prospect en laat precies zien wat
ChatManta oplost. Het maakt ook de belofte "Kennisgat-quiz" op de site (`lib/site/pricing.ts:70`)
tastbaar: de prospect krijgt de eerste ronde gratis te zien.

**Hoe, technisch.**
- Een prospect heeft geen org en geen crawl, dus deze scan crawlt zelf. Hij gebruikt dezelfde
  onderwerpen-only-module als fase 3, toegepast op de site van de prospect:
  - `mapSite` (1 credit) + een batch van maximaal 15 pagina's (15 credits);
  - luna-map + reduce ≈ $0,01-0,02.
- **De ruwe tekst wordt niet bewaard.** Alleen het rapport (vragen + onderwerpen) komt in een nieuwe tabel
  `lead_kennisscan` (RLS aan, geen policies, FK naar `leads`).
- **Geen automatische dekking door de leads-uitzondering.** Het akkoord in `0032:5-7` (Sebastiaan,
  2026-10-16) geldt specifiek voor `leads`, `lead_activiteiten` en `lead_afzenders`. Voor
  `lead_kennisscan` zonder `organization_id` is een **eigen akkoord** nodig (sub-besluit B7a); het
  migratiecommentaar verwijst naar dat akkoord.
- Dit is een **nieuw verwerkingsdoel** (sites van prospects crawlen voor acquisitie): privacyverklaring
  aanpassen is onderdeel van fase 5 (zie §4.6), samen met open vraag 5 (koude mail of pas na gesprek).
- Concurrenten bij een lead: optioneel, met dezelfde caps.

**Vangrails.**
- Alleen handmatig per lead, nooit in bulk (≈ 16-37 credits per lead).
- Een tellertje "scans deze maand" in de leads-UI.
- Robots/TDM-check zoals in §4.6.
- Geen persoonsgegevens in het rapport.

**Volgorde.** Pas na fase 2-3, als de kwaliteit bij echte klanten bewezen is. Een slecht rapport naar een
prospect kost meer dan het oplevert.

---

## 9. Risico's

| Risico | Kans | Impact | Mitigatie |
|---|---|---|---|
| De scan stelt vragen waarvan het antwoord al op de site staat, waardoor de klant gaat twijfelen aan het product | middel | hoog | check-stap (probe op de vraag zelf), citaatcheck in map, admin-review in fase 2-3, kwaliteitsdoel in fase 2 |
| Prompt-injectie via de paginatekst (eigen site of concurrent) | laag | middel | nonce-tags, JSON-schema, output alleen als conceptvraag, geen tools |
| Concurrentfeiten lekken in de KB of de bot | laag | hoog | geen ingest-import (grep-gate), ruwe tekst niet bewaren, alleen het klant-antwoord gaat de KB in |
| Een juridische klacht van een concurrent (scrapen) | laag | middel | robots/TDM respecteren, 6 pagina's, onderwerpen-only, juridische check B8 |
| Firecrawl-saldo of -limiet raakt op door scans, waardoor een klantcrawl faalt | laag | middel | loket, saldo-ondergrens van 100, crawl gaat vóór, batch in plaats van losse scrapes |
| Kosten lopen weg (bug in een lus, of veel pagina's) | laag | laag | cap $0,25/run, max 60 pagina's, account-breed max 30/dag |
| De migratie op de unieke index breekt een bestaande open quiz | laag | laag | de nieuwe index is ruimer dan de oude (alleen open statussen), dus bestaande rijen voldoen. Controleer vooraf met een read-only count |
| De klant-banner toont de verkeerde quiz na rondes | middel | laag | expliciete `getLiveQuizForOrg` (alleen `actief`) + test |
| Een `after()`-run wordt afgekapt door de functietimeout | middel | laag | deadline van 100 s, reduce op het deel dat klaar is, event `partial`. Lees de Next 16-docs voor `after` |
| Een oud V0-quizpad en de demo-kopie lopen uit de pas | middel | laag | in elke fase de demo-kopie in de DoD. V0 blijft ongewijzigd (V0 is een leerplatform) |

---

## 10. Open vragen

1. Wordt de V1-quiz op productie al gebruikt? Hoeveel `v1_quiz`-rijen zijn er, en met welke status? Dat
   bepaalt of fase 0 een eenmalige purge en re-ingest voor bestaande voltooide quizzen nodig heeft. Een
   read-only count vóór fase 0 geeft het antwoord.
2. Is `after()` in deze Next-versie bruikbaar voor ±100 s werk binnen `maxDuration` op het huidige
   Vercel-plan, of moet fase 2 meteen stapsgewijs per tick werken (eigen staat-tabel = extra migratie)?
3. Moet "Niet van toepassing" ook iets in de KB zetten ("Wij bieden geen X")? Dat helpt de bot om
   correct te weigeren, maar kan te stellig zijn. Voorstel: optioneel vinkje "laat de chatbot dit zo
   zeggen".
4. Telt een klant-self-service-scan (fase 4) mee in een toekomstig tarief (V2-billing), of is het altijd
   inbegrepen? Dat is relevant voor de copy op de prijzenpagina.
5. Voor de sales-kennisscan: mag het rapport in een koude opvolgmail, of alleen na een gesprek? Dat
   bepaalt de copy en het AVG-kader voor direct marketing. Niels' rol.
6. Hoe gaat de scan om met een site boven 60 pagina's (meerdere bronnen of "aanvullen")? Voorstel:
   home + navigatiepagina's eerst, daarna de pagina's met de meeste tekst. Valideren in fase 2.

---

## Review verwerkt (19 okt 2026)

Alle 13 bevindingen zijn in de bron nagelezen (`0015`, `0002`, `0032`, `credit-log.ts`, `firecrawl.ts`,
`qa-actions.ts`, `redact.ts`, `analysis.ts`, `app/privacy/page.tsx`). Ze bleken allemaal terecht. Er is
geen bevinding verworpen. Twee zijn in een lichtere vorm overgenomen.

**Aangepast:**
- **Event-kinds (§3.1 punt 6):** de schets had alleen een commentaarregel. Nu staan er een echte
  `drop/add constraint v1_quiz_event_kind_chk` in, met alle nieuwe kinds (`partial`, `cost_cap_hit`,
  `ingest_retry`, `klant_started`, `stale_failed`, `niet_van_toepassing`). Zonder die wijziging zouden
  de best-effort inserts stil falen.
- **`meerkeuze_multi` (§3.1 punt 5):** nieuwe kolom `meerkeuze_opties text[]` met een CHECK op aantal
  en lengte. `meerkeuze_optie` blijft bestaan voor enkelvoudige keuze.
- **Concurrent-lek via reduce (§4.1 stap 5-6):** reduce krijgt alleen anonieme onderwerpen. Daarna
  volgt een deterministische nafilter: `bewijs_urls` moet een subset van de eigen `source_url`'s zijn,
  en een vraag met een concurrent-host of -label vervalt. Daar hoort een unit-test bij.
- **`lead_kennisscan` (§8, B7a):** krijgt een eigen sub-besluit in plaats van "valt onder de
  leads-uitzondering". De privacyverklaring aanpassen is nu een verplicht onderdeel van fase 3 en 5. Ik
  heb gecontroleerd dat de huidige tekst (r. 294-295) alleen de eigen site van de klant noemt.
- **Fase 4-review (§6, B5):** in plaats van "meteen actief" geldt nu een lichte admin-gate (automatisch
  actief na 24 uur). Volledig loslaten mag pas als het kwaliteitsdoel uit fase 2 is gehaald.
- **Stale `generating` (§3.1):** een quiz die langer dan 10 minuten op `generating` staat, wordt bij
  een start of poll op `mislukt` gezet. `mislukt` telt niet mee voor de cooldown. Daarvoor is geen
  migratie nodig, want `updated_at` bestaat al.
- **Indexen `v1_quiz_scan_bron`:** op `quiz_id` en op `(organization_id, chatbot_id)`.
- **`herkomst` tegenover `bron`:** backfill `herkomst='handmatig' where bron='niels'`. Ik heb
  vastgelegd welke kolom wat betekent.
- **Origin-filter (§2.1):** expliciet `origin in ('quiz','manual_qa')`, met een gedeelde constante.
  Nagelezen: Q&A gebruikt `manual_qa`, niet `qa`.
- **`loadScanPages` (§2.1):** verplichte `orgId` en `chatbotId`, plus een `documents!inner`-join op
  `deleted_at`/`included`. Deze functie gaat mee in de isolatietest.
- **Drempels (§2.1 CHECK):** de check gebruikt nu `THRESHOLDS[indexVersion].present`. De dedupedrempel
  0,9 is als startwaarde gemarkeerd die in fase 2 nog per indexversie gekalibreerd moet worden.
- **Credit-log (§3.2):** het voorbehoud is eruit en de taak is nu onvoorwaardelijk. Nagelezen:
  `startBatchScrape` logt geen credits, en `'batch'` ontbreekt in zowel de TS-union als de CHECK. Dit
  kan als losse kleine PR.

**In lichtere vorm overgenomen:**
- **B2:** blijft een besluit van Sebastiaan. Ik heb alleen de techniek toegevoegd (een `keep`-optie op
  `redactPii`, en het bestaande gedrag blijft ongewijzigd) en het restrisico van PII van derden
  benoemd. Het Q&A-precedent blijft de onderbouwing.
- **Fase 4-gate:** de review bood twee opties: koppelen aan het kwaliteitsdoel, of een lichte gate. Ik
  heb beide gecombineerd: eerst de lichte gate, en volledig loslaten pas met kwaliteitsbewijs.
