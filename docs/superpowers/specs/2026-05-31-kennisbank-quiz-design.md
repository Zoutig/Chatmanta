# Ontwerpspec — Kennisbank-Quiz Systeem

> **Status:** intake-spec (via `/intake`) · **Datum:** 2026-05-31 · **Bron:** `ChatManta_Quiz_Systeem.md` (Niels)
> **Route-advies:** `big-ship` (multi-subsysteem) · **Scope:** V0-nu, géén V1-dependency
> **Volgende migratie:** reserveer via `check-migration` bij build (lokaal hoogste = `0043`, vermoedelijk `0044` — verifiëren)

Dit is de gegronde, bouwbare vertaling van Niels' productplan, getoetst aan de echte ChatManta-codebase (15-agent intake-kritiek: recon + overlap-radar + 6 lenzen + judge). Niels' MD is **context, geen kookboek** — hieronder staat wat we daadwerkelijk bouwen en waarom dat afwijkt.

---

## 1. Intake-preamble

### 1.1 Niels-diff — voorgesteld → wat we bouwen & waarom

| # | Niels stelt voor | Wat we bouwen | Waarom anders |
|---|---|---|---|
| 1 | AI leest de **hele** kennisbank in één prompt om gaten te vinden | Bewuste **map-reduce** over de al-gechunkte `document_chunks` (per-doc samenvatting → gecombineerde gap-analyse) met **harde char/token-budget** | V0 heeft géén whole-KB-primitive (alleen top-K ~4-6 chunks, `MAX_CONTEXT_CHARS=12000`). Een verbatim full-KB-prompt riskeert context-window-fail, stille truncatie én ongebreidelde kosten op precies de grote KB's waar dit voor bedoeld is. |
| 2 | "geen maximum aan vragen" | **Harde cap** op gegenereerd aantal vragen; Niels voegt handmatig toe via de approval-UI | Ongebonden generatie is een kosten-/UX-knop zonder meerwaarde — de goedkeuringsstap bestaat al. |
| 3 | Antwoord → KB als nieuwe bron met **`source = quiz-antwoord`** | Hergebruik `ingestText()` met `source` op `'v0_local'`; provenance in `documents.metadata` jsonb (`{origin:'quiz', quiz_id, question_id}`) + sprekende `filename` | **VETO:** `documents.source` is CHECK-constrained tot `upload\|website\|v0_local` (`0002_v0_rag.sql:46`). `quiz-antwoord` als source-waarde = harde DB-crash bij de eerste ingest. |
| 4 | "Niels keurt goed" als bevoorrechte approval-gate | In-app **workflow-stap** in de admin-namespace, expliciet gedocumenteerd als **niet-afgedwongen in V0** | `requireV0Auth()` verifieert alleen het gedeelde `V0_DEMO_PASSWORD`-cookie — er is geen operator-vs-klant-rol. Approval is een conventie, geen security-grens. Echte handhaving = V1-dependency. |
| 5 | "klant ziet melding bij inloggen", "eenmalig per klant" | Org-scoped **DismissibleBanner** op `/klantendashboard` (signature = quizId+status); voltooiing = één rij per `organization_id` | V0 heeft geen per-user-identiteit en geen per-klant-login-event. "De klant" = de hele org. Sluit aan op het bestaande feedback-banner-patroon. |
| 6 | Antwoorden "direct" aan de KB | Nieuwe, dedicated **klant-side server action** die `ingestText()` aanroept — from scratch | De klant-documents-tab is een client-side **mock** (1500ms setTimeout) en manual-Q&A is óók een mock; er is géén bestaand klant-ingest-pad om op te leunen. |
| 7 | Niels triggert analyse, krijgt notificatie (impliciet synchroon) | **Async job:** trigger schrijft quiz-rij in `concept`, keert direct terug; 2 LLM-calls draaien in de achtergrond (`after()` / job-rij), daarna status-flip + sidebar-badge | Whole-KB-analyse kan tientallen seconden duren → Vercel-timeout / hangende admin-klik. |
| 8 | Vrije-tekst antwoorden, géén tekenlimiet | **Lengte-cap** + PII-handling (`redactPii` / `detectPossiblePii`) + consent-notice ("dit wordt zichtbaar voor bezoekers") + retentie-verhaal consistent met `admin_privacy_settings` | Antwoorden bevatten voorspelbaar PII (de fysio/advocaat-branche-prompts vragen om medische/juridische context) en stromen verbatim+permanent in de **publieke** widget-KB, langs het bestaande per-org privacy-model heen. |

### 1.2 Overlap-verdict — **CLEAR** (geen duplicaat, wél hergebruiken)

De quiz is een echt nieuwe feature, **geen** duplicaat van het feedback-systeem (PR #151). Maar de operator-helft (notify → approve → status-workflow → in-app klant-banner) is een bijna-exacte kloon van de feedback-template. **Bouw die helft door de feedback-module file-for-file te hergebruiken**, niet door een parallel notificatie-primitive te verzinnen:

- `lib/controlroom/server/quiz.ts` spiegelt `feedback.ts` (`createQuiz`/`listQuizzes`/`setQuizStatus`/`getQuizSummary` met goedkope COUNT voor de badge)
- sidebar-badge via `getQuizSummary().pendingApproval` (zoals `getFeedbackSummary().open`)
- de Stap-8-overzichtstabel = het filterbare-inbox-patroon van `app/admindashboard/feedback/page.tsx`
- klant-notificatie = `app/klantendashboard/components/dismissible-banner.tsx`

De antwoord-naar-KB-helft **hergebruikt** `ingestText()` + de documents-pipeline. Het enige genuine net-nieuwe stuk (geen primitive) is de **whole-KB-analyse-call**.

> ⚠️ Bevestig bij build dat er geen collision is met in-flight feedback-Fase-2/3-werk (`feat/seb/feedback-fase23` is een actieve worktree) vóór je migratie `0044` claimt.

### 1.3 Scope-verdict — **V0-NU** (geen V1-auth nodig)

Dit is de centrale scope-vraag, en het antwoord is beslist **nee, geen V1-dependency**. Elke identiteit-klinkende zin lost op naar org-scope, precies zoals het feedback-systeem leeft:

- "gekoppeld aan de klant" = `organization_id`
- "eenmalig per klant" = één voltooiings-rij per `organization_id` (org-breed; elke org-member met het wachtwoord ziet dezelfde state)
- "melding bij inloggen" = org-scoped DismissibleBanner (per-browser localStorage-dismiss, géén login-hook)

Geen e-mail-trigger, geen user-record, geen sessie-gebonden voortgang. **Expliciet in de spec:** de Niels-approval is een niet-afgedwongen workflow-stap in V0; échte operator-only-handhaving + échte per-klant one-shot zijn V1-dependencies.

### 1.4 Kosten & effort

**Kosten** (operator-getriggerd, one-shot-per-org, lage volume):
- Per analyse-generatie (2 LLM-calls): **gpt-4o-mini ~€0,01** (typische KB) tot **~€0,03** (grote KB). Met gpt-4o/Claude Sonnet ~€0,19–0,50 (ruwweg 17×).
- Per-antwoord re-embedding via `text-embedding-3-small`: afrondingsfout (~€0,0002 voor 50 antwoorden).
- **Echte kostenrisico** is niet de ruwe euro maar de ongebonden whole-KB-prompt zonder token-cap — die de must-fix budget-guard wegneemt. Maandtotaal blijft enkele euro's tenzij gpt-4o + frequente re-runs.
- Alle quiz-kosten via `costForModelUsd` (USD) op de quiz-rij gelogd, **nooit** in `query_log`.

**Effort:** Medium — multi-subsysteem maar zwaar getemplated. ~4 milestones, ~6 werkdagen (zie §7).

### 1.5 Pitch-scorecard (volledigheid Niels' MD)

| Dimensie | Cijfer | Toelichting |
|---|---|---|
| **Datamodel** | D (zwak) | 5 goede statussen genoemd, maar geen table-class, RLS, FK, soft-delete, migratienummer, state-machine of org-scope. Twee stiltes zijn veto-niveau (source-CHECK, RLS-op-klantdata). |
| **Edge cases** | C (gemengd) | Goede dekking van lege-KB, 0-vragen, analyse-fail-retry, skip. Maar: welke STATE bij 0 vragen, re-trigger-tijdens-bezig, mid-quiz-abandon/resume, en `Anders, namelijk`-serialisatie ontbreken/spreken zichzelf tegen. |
| **Auth** | D (zwak) | Modelleert Niels als bevoorrechte approver — een misvatting. V0 heeft geen per-user-identiteit. "Per klant"/"bij inloggen"/"eenmalig" nemen een identiteitsmodel aan dat niet bestaat. |
| **Kosten** | C (gemengd) | Flag't context-limiet ("overweeg chunking") en defert model naar Sebastiaan — kostenbewust. Maar laat de grootste lever onbeslist, "geen maximum" ongebonden, en zegt niets over cost-logging. |
| **Overall** | **C** | Sterk productverhaal van een niet-technische auteur, identificeert een echte waardevolle niet-duplicaat-feature, flag't zelf 2 van de zwaarste risico's. Verliest punten op 3 mis-groundings (source-enum, geen-per-user, geen-wired-ingest) die elk de build zouden breken bij letterlijke implementatie. Een goede pitch, nog geen spec. |

> **NIELS_PITCH_TEMPLATE-signaal:** terugkerende gaten = (1) table-class/RLS-onbewustheid, (2) per-user-identiteit aannemen die V0 mist, (3) bestaande primitives (source-enum, ingest-pad) niet kennen. De pitch-template kan een sectie "welke data leest/schrijft dit, en is het per-org of per-persoon?" toevoegen.

---

## 2. Veto's & must-fixes (bindend vóór build)

| # | Sev | Wat | Fix |
|---|---|---|---|
| V1 | **VETO** | `quiz-antwoord` als `documents.source`-waarde crasht de eerste ingest (CHECK violation) | `source` blijft `'v0_local'`; provenance in `documents.metadata` jsonb + sprekende filename. Geen nieuwe enum-waarde. |
| V2 | **VETO** | Gemengde/foute table-class: klantdata mag niet stil RLS-off worden, admin-tabel mag geen FK naar `organizations` krijgen | Quiz-lifecycle = **Class B admin-overlay** (`admin_quiz*`, `organization_id` plain uuid **GEEN FK**, **RLS OFF**, `admin_touch_updated_at()`-trigger, status-CHECK spiegelt TS-union+LABELS), in één migratie — template `0043`. Klant-zichtbare record = het resulterende RAG-document (al org-scoped). Géén tweede permanente vrije-tekst-kopie in een RLS-off-klant-tabel. |
| M1 | must-fix | Vrije-tekst-antwoorden stromen verbatim+permanent in de publieke KB zonder PII-handling, langs het per-org privacy-model | (a) `redactPii` (`lib/observability/redact.ts`) of minstens `detectPossiblePii`-flag vóór `ingestText`; (b) lengte-cap; (c) consent-notice "antwoorden worden zichtbaar voor bezoekers"; (d) retentie consistent met `admin_privacy_settings` (`chatRetentionDays=30`, `piiRedactionEnabled=true`) — dekken door export/deletion-flows, geen permanente onwisbare blob. |
| M2 | must-fix | Whole-KB-in-één-prompt heeft geen token-budget/context-guard | Map-reduce-samenvatting = **harde eis**, niet "overweeg". Hergebruik `document_chunks`; map (per-doc samenvatting) → reduce (alleen samenvattingen in analyse-prompt) onder vaste char/token-ceiling; "KB te groot → N docs samengevat"-tak; harde cap op aantal vragen. |
| M3 | must-fix | RLS/policies, migratienummer, status-state-machine, service-role-discipline allemaal onbenoemd | (a) RLS-beslissing (OFF voor admin-overlay, mét 0043-stijl rechtvaardigende header-comment) in DEZELFDE migratie; (b) nummer via `check-migration` (let op: `0040` heeft al een dubbel-file-collision lokaal — bewijs dat de check nodig is); (c) 5 statussen als bewaakte state-machine (zie §3.2); (d) alle mutaties via service-role-wrappers binnen `actionTry → requireV0Auth/requireKnownOrgId → org-uit-route/cookie`. |
| M4 | must-fix | Quiz/analyse-LLM-kosten mogen NIET in `query_log` en moeten `costForModelUsd` gebruiken | Log op de quiz-rij (`analyse_cost_usd` + `generation_cost_usd numeric(10,6)`) of aparte admin-overlay-store — nooit `query_log` (PR #150 scheidde klant-chatbot-verbruik bewust). Best-effort/never-throws zoals `logQuery`. Gekozen model MOET in `MODEL_COSTS_USD` staan (onbekend = 0 + warn = stille onder-tracking). |

---

## 3. Datamodel

### 3.1 Tabellen — Class B admin-overlay (RLS OFF, plain-uuid org_id, GEEN FK)

Template: `0043_admin_feedback.sql` + `0038_controlroom_admin_overlay.sql`. Migratie reserveren via `check-migration` (vermoedelijk `0044_admin_quiz.sql`).

**`admin_quiz`** — één rij per org (quiz-header + lifecycle):
- `id uuid pk default gen_random_uuid()`
- `organization_id uuid not null` (plain, GEEN FK)
- `status text not null default 'generating'` — CHECK spiegelt `QUIZ_STATUSES`
- `analyse_model text` — Niels' keuze (`gpt-4o-mini` | `gpt-4o`); stuurt de generatie-call
- `analyse_method text default 'category_probe'` — A/B-seam (CHECK `category_probe`|`map_reduce`), zie §5
- `bedrijfscontext jsonb` — `{branche?, beschrijving?, doelgroep?, probes:[{categorie, top1_similarity, verdict}]}` (maakt elke gap auditbaar)
- `analyse_cost_usd numeric(10,6)`, `generation_cost_usd numeric(10,6)` (nullable, best-effort)
- `question_count int`, `answered_count int`, `skipped_count int`, `error text`
- `created_at`, `updated_at` (trigger), `activated_at`, `completed_at`
- **UNIQUE `(organization_id)`** waar `status <> 'geannuleerd'` (idempotentie: één actieve/voltooide quiz per org — sluit aan op de UNIQUE-voor-idempotentie-conventie van `0031`)
- index `(status, created_at)`, `(organization_id, created_at)`

**`admin_quiz_question`** — gegenereerde + Niels-bewerkte vragen:
- `id uuid pk`, `quiz_id uuid not null references admin_quiz(id)`, `organization_id uuid not null` (plain)
- `categorie text`, `categorie_label text`, `context text`, `vraag text`
- `type text not null` — CHECK `('open','meerkeuze')`
- `opties jsonb` (null bij open)
- `volgorde int`, `bron text` — CHECK `('ai','niels')` (provenance: AI-gegenereerd of handmatig toegevoegd)
- `goedgekeurd boolean not null default false`, `verwijderd boolean not null default false` (review-soft-flag; quiz is nog concept)
- `created_at`, `updated_at`

**`admin_quiz_answer`** — klant-antwoorden (zie §4 voor de retentie-/PII-discussie):
- `id uuid pk`, `quiz_id uuid not null`, `question_id uuid not null`, `organization_id uuid not null` (plain)
- `antwoord text` (null = overgeslagen), `meerkeuze_optie text`, `anders_tekst text`
- `ingested_document_id uuid` (link naar het resulterende `documents`-record), `redacted boolean`
- `created_at`

**`admin_quiz_event`** *(append-only, gebouwd in M1)* — diagnostiek (analyse-fases) + Niels' edit/approve/delete-tijdlijn, zoals `admin_feedback_events`. `recordQuizEvent` is best-effort (gooit nooit) — de async analyse-job leunt hierop voor debugbaarheid.

> **Resolutie van de Class-A/B-spanning** (2 lenzen lazen `answer` als Class A): we houden **géén** permanente vrije-tekst-kopie als klant-zichtbare RLS-off-tabel. De permanente thuisbasis van het antwoord is het (al org-scoped, RLS-beschermde) `documents`-record via `ingestText`. `admin_quiz_answer` houdt minimaal wat Stap 8 nodig heeft (counts + link) en valt onder hetzelfde retentie-verhaal als M1.

### 3.2 Status-state-machine (bewaakt server-side)

`QUIZ_STATUSES` (TS-union + `QUIZ_STATUS_LABELS` in `lib/controlroom/types.ts`, exact spiegelend met SQL-CHECK):

```
generating   analyse-job draait (transient)
concept      vragen gegenereerd, wacht op Niels
actief       Niels heeft goedgekeurd, zichtbaar voor klant
voltooid     klant heeft afgerond — TERMINAL
geannuleerd  Niels verwijderde zonder activatie — TERMINAL
leeg         AI vond 0 gaten — TERMINAL, nooit activeerbaar
mislukt      analyse-fout — user-initiated retry re-runt op dezelfde rij
```

Toegestane transities (afgedwongen in de action-laag, niet alleen DB):
```
(geen) → generating → concept → actief → voltooid   (happy path)
generating → leeg            (0 gaten)
generating → mislukt         (fout; retry → generating)
concept → geannuleerd
voltooid / geannuleerd / leeg = terminal
```

> **`in_review` geschrapt:** met één operator (Niels) is "bezig met beoordelen" impliciet tijdens `concept`. (Beslist 2026-05-31.)

### 3.3 Conventies (hard rules)

- Enum-wijzigingen: SQL-CHECK + TS-union + LABELS-map **samen** in één migratie/PR.
- Soft-delete: quiz-niveau verwijderen = status `geannuleerd` (geen rij-delete, audit blijft). Vraag-niveau `🗑️` tijdens review = `verwijderd`-flag (quiz is nog concept). Voeg `deleted_at` + partial index toe als quiz-rijen ooit echt hard-deleted kunnen worden.
- Service-role: uitsluitend via `lib/controlroom/server/db.ts` `sb()` / `lib/supabase/admin.ts`. Geen losse `supabaseAdmin`-imports.

---

## 4. Security & AVG (must-fix M1)

De antwoord-pijplijn is het gevoeligste deel. De branche-prompts vragen actief om medische (fysio) en juridische (advocaat) context — klanten plakken voorspelbaar namen, telefoon, e-mail, BSN, bijzondere-categorie-data. Die stromen via `ingestText` → `document_chunks` → `match_chunks` → de **publieke widget** (`/api/v0/chat`) naar anonieme bezoekers.

**Verplicht vóór een klant-zichtbare quiz live gaat:**
1. **PII-redactie/-flag:** elk antwoord door `redactPii` (`lib/observability/redact.ts`) vóór `ingestText`, of minstens `detectPossiblePii` (`lib/controlroom/pii.ts`: EMAIL/IBAN/BSN/PHONE) → flag op `admin_quiz_answer.redacted`.
2. **Lengte-cap:** ongebonden textarea = PII- én kosten-/abuse-vector. Stel een redelijke cap (bv. 2000 tekens, sluit aan op `CHUNK_CHARS`).
3. **Consent-notice:** expliciete regel in de quiz-UI dat antwoorden bot-retrievable content worden die aan bezoekers getoond wordt.
4. **Retentie:** consistent met `admin_privacy_settings` (`PRIVACY_DEFAULTS`: `chatRetentionDays=30`, `piiRedactionEnabled=true`). Quiz-antwoorden moeten onder de org-data-export/deletion-flows vallen — geen permanente onwisbare KB-blob. *(Open vraag — zie §8.)*

**Approval is geen security-grens in V0:** `requireV0Auth()` verifieert alleen het gedeelde wachtwoord. Documenteer expliciet dat iedereen met het wachtwoord analyse/activatie kan triggeren. Houd de trigger/activate-actions niettemin in de admin-namespace (`app/actions/controlroom.ts`, `requireV0Auth + requireKnownOrgId`) zodat de intentie gedocumenteerd is, ook al is hij niet afgedwongen.

---

## 5. Analyse-pijplijn (M2) — hybride probe (ontwerp-tournament 2026-05-31 + hybride-uitbreiding)

Het net-nieuwe stuk. Een design-tournament (3 strategieën + judge) koos **category-probe-via-RAG** (8,2/10) als basis boven map-reduce-summarize (6,9) en chunk-budget-truncate (7,0): het hergebruikt de bestaande `match_chunks` vector-search i.p.v. een whole-KB-primitive te bouwen, en kost **constant ongeacht KB-grootte**. Op die basis bouwen we een **hybride in 3 lagen** die map-reduce's twee sterke punten (bedrijfs-specifieke gaten + "aanwezig ≠ voldoende") meeneemt zónder de hele KB te lezen — kosten blijven ~€0,02–0,05 i.p.v. ~€0,40. `analyse_method='map_reduce'` blijft als **A/B-seam** voor een volledig open variant (migratie-vrij).

**De 3 lagen:**
- **Laag 1 — vaste probes:** 8 categorie-probes (Niels' lijst) via `match_chunks`, top-1-similarity gescoord.
- **Laag 2 — dynamische categorieën:** één goedkope `gpt-4o-mini`-call op een *begrensde steekproef* (~10 stukjes, niet de hele KB) leidt branche + 2–4 bedrijfs-specifieke categorieën af, die óók geprobed worden.
- **Laag 3 — voldoende-check:** voor categorieën die `gedekt` scoren leest één goedkope call de al-opgehaalde evidence-chunks en markeert stubs ("bel ons voor prijzen") alsnog als gat.

**Async job**, getriggerd door Niels vanuit het admin-dashboard:

1. **Trigger** (admin server action, `actionTry → requireV0Auth → requireKnownOrgId`): valideer ≥1 niet-deleted document via `listDocs(orgId)` (anders "Kennisbank is leeg", geen rij). Annuleer een herbruikbare bestaande quiz (incl. `generating` na een afgebroken run) zodat de `UNIQUE(org) WHERE status<>'geannuleerd'`-slot vrijkomt; blokkeer op `actief`/`voltooid` (eenmalig). Insert `admin_quiz` in `generating`. **Beslist: synchrone uitvoering** — de analyse draait binnen de action (geen async job/`after()`), gekozen i.p.v. de oorspronkelijke async-opzet omdat de quiz 1-per-org + laagfrequent is en dit simpeler is; **`maxDuration=120`** op de route dekt de ~15–60s call (gpt-4o-generatie kan 30–60s; chat's 60 is te krap). Een afgebroken run (timeout/navigatie) is herstelbaar: `generating` staat in `QUIZ_RETRIGGERABLE`, dus opnieuw triggeren annuleert de vastgelopen rij en start vers.
2. **Analyse** (background, 3 lagen): (a) **dynamische categorieën** — `gpt-4o-mini`-call op een begrensde steekproef → branche + beschrijving + doelgroep + 2–4 extra categorieën; (b) **probes** — embed de 8 vaste + de dynamische categorieën in één `embedTexts()`-call, draai per categorie `match_chunks(orgId, vec, 8)` via `Promise.all`, score top-1-similarity: `<0.4` = `ontbreekt`, `0.4–0.55` = `zwak`, `≥0.55` = `gedekt`; (c) **voldoende-check** — één `gpt-4o-mini`-call leest de evidence-chunks van de `gedekt`-categorieën en degradeert stubs naar gat. De 0.4/0.55-banden zijn startwaarden, te valideren (§8). Aux-calls (a)+(c) draaien **altijd op gpt-4o-mini** (goedkoop, begrensd); alleen de generatie-call (stap 3) gebruikt Niels' modelkeuze.
3. **Generatie-call:** alléén de zwakke/lege categorieën (label + verdict + top-1-sim + 1 evidence-excerpt ~700 chars) → Niels' Stap-3-prompt-2, onder een harde 8000-char-ceiling. **Skip de call volledig bij 0 zwakke categorieën** → status `leeg` (spaar de call). Harde cap op aantal vragen.
4. Persisteer vragen in `admin_quiz_question` (bron=`ai`); sla `bedrijfscontext` (incl. probe-audit) op; flip status → `concept` (of `leeg`); log kosten op de quiz-rij; surface de sidebar-badge.
5. **Kosten-correctie (verified bug):** `chatComplete` hardcodet gpt-4o-mini-tarieven → zijn `costUsd` is ~16× onderteld op het gpt-4o-pad. **Herbereken** `generation_cost_usd = costForModelUsd(analyse_model, inTokens, outTokens)` uit de teruggegeven token-counts; valideer `analyse_model ∈ MODEL_COSTS_USD` in de trigger-action. Nooit in `query_log`.
6. **Fail-pad:** any throw → status `mislukt` + `error`; **user-initiated** retry (geen auto-retry-loop) re-runt op dezelfde rij.
7. **Honesty-graft:** bij >6 van 8 categorieën `ontbreekt` → signaleer "kennisbank lijkt erg dun" i.p.v. 8× diepe vragen. `leeg` boodschappen als "lijkt volledig" (mogelijke false-negative van de vaste taxonomie, geen bewezen-volledige KB).

> **Productbeslissing (BESLIST 2026-05-31 — hybride):** de hybride dekt bedrijfs-specifieke gaten (laag 2) én "aanwezig ≠ voldoende" (laag 3) tegen ~€0,02–0,05. De enige restbeperking: een gat dat bij géén enkele (vaste óf dynamische) categorie past, blijft onzichtbaar — daarvoor staat de volledige map-reduce achter de `analyse_method`-seam klaar mocht het ooit nodig zijn.

**Model — BESLIST:** per-klant keuze tussen **`gpt-4o-mini`** (default) en **`gpt-4o`**. Niels kiest het model bij het triggeren van de analyse (model-dropdown in de trigger-UI, §6.1); de keuze wordt opgeslagen in `admin_quiz.analyse_model`. Beide modellen staan al in `MODEL_COSTS_USD` (geen plumbing nodig). Bij `gpt-4o` is de async job (§5) extra belangrijk ivm latency. Claude blijft buiten scope (Anthropic-pad bestaat niet in V0). **NB:** Niels' modelkeuze stuurt alléén de generatie-call; de twee aux-calls (laag 2 + laag 3) draaien altijd op `gpt-4o-mini` zodat de kosten begrensd blijven.

---

## 6. UI & flows

### 6.1 Operator (Niels) — hergebruik feedback-module + nieuwe Quiz-tab
- **Trigger + overzicht:** nieuwe **`Quiz`-tab** op de bestaande `klanten/[orgSlug]` tab-hub (`TABS`-array), met de gedeelde UI-kit (Card, Pill, StatusBadge, PageHead, TabsNav) op `klant.css`-tokens. De trigger-knop bevat een **model-dropdown (`gpt-4o-mini` / `gpt-4o`)** zodat Niels per klant het model kiest; de keuze gaat naar `admin_quiz.analyse_model`.
- **Approval-scherm:** per-vraag goedkeuren/bewerken/verwijderen/toevoegen, gemodelleerd op `FeedbackStatusActions` + (optioneel) append-only event-tijdlijn voor auditbaarheid.
- **"Quiz activeren"-knop:** transitie `concept` → `actief`.
- **Notificatie:** in-app sidebar-badge via `getQuizSummary().pendingApproval` (zoals `getFeedbackSummary().open`). **Geen e-mail** (geen per-user-identiteit).
- **Stap-8-overzicht:** filterbare lijst (status/org) = het `app/admindashboard/feedback/page.tsx`-patroon.

### 6.2 Klant (portaal)
- **Banner:** org-scoped `DismissibleBanner` op `/klantendashboard` (signature = `quizId+status+answered-count` → herverschijnt bij state-change, verdwijnt bij `voltooid`). **Geen** login-hook.
- **Quiz-scherm:** één-vraag-per-keer, voortgangsbalk ("Vraag 3 van 8"), context-zin in lichtgrijs, sectieheader per categorie, "Sla over" + "Volgende". Bouw met `klant-*`-classes + lucide-icons; nieuwe styling **inline/lokaal `<style>`** (Tailwind v4 globals.css-quirk). Erft de ≤900px off-canvas drawer-shell.
- **Resume-cursor:** persisteer per-vraag-antwoord-rijen + cursor zodat een afgebroken quiz hervat bij de eerste onbeantwoorde vraag.
- **Antwoord-submit:** klant-side action (`app/klantendashboard/actions.ts`, `actionTry + requireV0Auth + getActiveOrgFromCookies`) → PII-redactie → lengte-check → `ingestText({filename:'Quiz-antwoord · <categorie>', text:'<vraag>\n<antwoord>', metadata:{origin:'quiz',...}})` → update counts. Tolereer de niet-transactionele orphan-risk van `ingestText`.
- **Afsluiting:** bedankmelding, status → `voltooid` (terminal).

### 6.3 Edge cases (§6 must-resolve, zie ook §8)
- **0 vragen:** quiz wordt nooit `concept`; status `leeg`, toon Niels "Kennisbank lijkt volledig", geen activeerbare quiz.
- **Re-trigger tijdens concept/in_review:** blokkeer óf vereis expliciete "opnieuw genereren (vervangt huidige vragen)"-bevestiging; tijdens `actief`/`voltooid` geblokkeerd (eenmalig-regel).
- **Mid-quiz-abandon:** banner komt terug (signature = answered-count) tot status `voltooid`.
- **Meerkeuze "Anders, namelijk":** definieer serialisatie — precedentie wanneer zowel radio áls vrije-tekst gevuld zijn (of geen van beide); skipped-null-regel dekt ook "niets geselecteerd".
- **Alles overgeslagen:** quiz alsnog `voltooid`.

---

## 7. Milestones (route: `big-ship`)

| M | Inhoud | ~Effort | Risico |
|---|---|---|---|
| **M1** | Migratie `0044` (`admin_quiz`/`_question`/`_answer`, Class-B RLS-off) + TS-unions/LABELS + `lib/controlroom/server/quiz.ts` (mirror `feedback.ts`) | ~1 dag | Laag (getemplated) |
| **M2** | Async whole-KB-analyse-job: map-reduce over `document_chunks` + token-budget + 2 LLM-calls + cost-logging + status-transities | ~2 dagen | **Hoog** (net-nieuw — design + eval-aandacht hier) |
| **M3** | Operator approval-UI: Quiz-tab op `klanten/[orgSlug]` + inbox/detail (feedback-kit) + per-vraag approve/edit/delete/add + sidebar `getQuizSummary`-badge | ~1,5 dag | Laag (getemplated) |
| **M4** | Klant quiz-portaal (one-at-a-time, progress, skip, resume, Anders-serialisatie) + DismissibleBanner + antwoord-submit-action met PII-redactie/lengte-cap/consent | ~1,5 dag | Midden (PII-pad) |

**Totaal ~6 werkdagen.** M1/M3 zijn straight clones van de feedback-module → de big-ship design-front-end moet vooral op **M2** (analyse token-budget/map-reduce) en het **privacy/retentie-verhaal** scopen, niet op de clone-delen (anders over-proces).

---

## 8. Open vragen — opgelost (sign-off 2026-05-31)

1. ✅ **Model-keuze:** per-klant keuze **`gpt-4o-mini` / `gpt-4o`**, Niels kiest bij trigger (zie §5, §6.1). Beide in `MODEL_COSTS_USD`.
2. ✅ **Approval-gate:** **niet-afgedwongen V0-workflow-stap** (gedocumenteerd; iedereen met het wachtwoord kan triggeren/activeren). Échte operator-only-handhaving = V1-Supabase-Auth-dependency, niet in deze build.
3. ✅ **Retentie quiz-antwoorden:** **permanente KB-content** (het doel is blijvende bot-verbetering), mét **PII-redactie + consent-notice aan de poort** (vóór `ingestText`) en **wisbaar via de org-deletion/export-flow** (recht op vergetelheid). Géén 30-dagen-sweep.
4. **Re-trigger-semantiek** + `in_review`: *default toegepast* — re-trigger tijdens `concept`/`in_review` blokkeren/bevestigen; `in_review` geschrapt (één operator). Wijzigbaar in big-ship-plan.
5. **0-vragen-uitkomst:** *default toegepast* — status `leeg`, nooit activeerbaar.
6. **Resume-cursor + `Anders, namelijk`-serialisatie:** *default toegepast* — hervat bij eerste onbeantwoorde; precedentie-regels in M4.
7. **Migratie-collision:** verifieer ik via `check-migration` vlak vóór `0044` claimen (in M1).

---

## 9. Handoff

Op `go`: hand off naar **`big-ship`** (by reference), met **deze spec als de SPEC** (big-ship slaat zijn eigen spec-derivatie over). De build-skill brengt zijn eigen review-gates mee (Codex-review-loop, schone prod-build, eval-gate). `/intake` herhaalt die niet. Branch `feat/seb/<slug>` via een eigen worktree (locatie-keuze aan Sebastiaan).
