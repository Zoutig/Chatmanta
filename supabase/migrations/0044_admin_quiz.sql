-- =============================================================================
-- Migration 0044 — admin_quiz: AI-gegenereerde kennisbank-quiz
--
-- Doel: een AI analyseert de kennisbank van een org, detecteert ontbrekende
-- informatie-categorieën, en genereert quizvragen. Operator Niels keurt ze goed
-- in het Admin Dashboard; de klant beantwoordt ze in het portaal; antwoorden
-- stromen terug de kennisbank in (M4). Eén quiz per org (eenmalig systeem).
--
-- Spec: docs/superpowers/specs/2026-05-31-kennisbank-quiz-design.md
-- Analyse-strategie (M2, design-tournament): category-probe-via-RAG — 8 vaste
-- categorie-probes via match_chunks scoren aanwezigheid; alleen zwakke/lege
-- categorieën gaan naar één generatie-call. analyse_method is de A/B-seam zodat
-- een latere map_reduce-variant migratie-vrij naast deze kan draaien.
--
-- ⚠️ RLS-MODEL — volgt bewust het admin_*-precedent (0038/0043), NIET de
-- "RLS overal" V1 hard rule:
--   * Operator-beheerde workflow-data (Niels triggert/keurt goed). De vraag-/
--     status-laag is operator-gestuurd; de klant-zichtbare bron-van-waarheid is
--     het RESULTERENDE RAG-document (M4, via ingestText → public.documents, dát
--     is wél een RLS-tabel). We houden hier GEEN tweede permanente vrije-tekst-
--     kopie als klant-leesbare RLS-off tabel.
--   * Geen RLS, geen organization_members-check. Toegang loopt UITSLUITEND via
--     proxy.ts (V0-gate) + requireV0Auth()/requireKnownOrgId() (acties) +
--     service-role wrappers (lib/controlroom/server/quiz.ts).
--   * organization_id is een PLAIN uuid (GEEN FK): V0-orgs zijn app-constants
--     (KNOWN_ORGS) met stabiele UUIDs. De acties zetten de org server-side uit
--     de cookie/route (nooit client-payload). V1 kan FK + RLS additief toevoegen.
--
-- De CHECK-enums spiegelen de TS-unions in lib/controlroom/types.ts; bij elke
-- enum-wijziging moeten beide meegroeien.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. admin_quiz — één rij per org (quiz-header + lifecycle + analyse-telemetrie).
--    Status-state-machine (bewaakt in de action-laag, niet alleen DB):
--      (geen) → generating → concept → actief → voltooid   (happy path)
--      generating → leeg            (0 gaten gevonden — terminal)
--      generating → mislukt         (analyse-fout — user-initiated retry)
--      concept   → geannuleerd      (Niels verwijdert zonder activeren)
--      voltooid / geannuleerd / leeg = terminal
--    'in_review' is bewust NIET opgenomen: er is één operator (Niels), dus
--    "bezig met beoordelen" is impliciet tijdens concept.
-- ----------------------------------------------------------------------------
create table if not exists public.admin_quiz (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  status          text not null check (status in (
    'generating','concept','actief','voltooid','geannuleerd','leeg','mislukt'
  )) default 'generating',
  -- Door Niels gekozen model voor de GENERATIE-call (en evt. analyse-call).
  -- Embeddings/probes draaien altijd op het vaste embedding-model.
  analyse_model   text not null check (analyse_model in ('gpt-4o-mini','gpt-4o'))
                    default 'gpt-4o-mini',
  -- A/B-seam: welke analyse-strategie deze rij gebruikte.
  analyse_method  text not null check (analyse_method in ('category_probe','map_reduce'))
                    default 'category_probe',
  -- Kosten gesplitst zoals eval_runs.bot_cost_usd/judge_cost_usd (0007). Nullable
  -- + best-effort geschreven: een mislukte cost-write mag de workflow niet blokken.
  -- LET OP: NOOIT in query_log (PR #150 scheidt klant-chatbot-verbruik).
  analyse_cost_usd     numeric(10,6),
  generation_cost_usd  numeric(10,6),
  -- Afgeleide bedrijfscontext + probe-audit:
  -- { branche?, beschrijving?, doelgroep?,
  --   probes: [{ categorie, top1_similarity, verdict }] }
  -- Maakt elke gedetecteerde gap auditbaar ("waarom prijzen geflagd? top1=0.31").
  bedrijfscontext jsonb not null default '{}'::jsonb,
  question_count  integer not null default 0,
  answered_count  integer not null default 0,
  skipped_count   integer not null default 0,
  -- Laatste foutmelding bij status 'mislukt' (voor de operator-retry-knop).
  error           text check (error is null or char_length(error) <= 2000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  activated_at    timestamptz,
  completed_at    timestamptz
);

-- Eenmalig-per-org: maximaal één niet-geannuleerde quiz per org. Re-trigger
-- tijdens concept/generating raakt deze constraint (23505) → de action-laag
-- moet check-and-block/confirm vóór insert; een geannuleerde quiz geeft de slot
-- vrij voor een nieuwe. (Idempotentie-conventie, vgl. 0031_v0_feedback.)
create unique index if not exists admin_quiz_one_active_per_org
  on public.admin_quiz (organization_id)
  where status <> 'geannuleerd';

-- Operator-inbox: quizzes op status, nieuwste eerst.
create index if not exists admin_quiz_status_idx
  on public.admin_quiz (status, created_at desc);

-- Per-org detail / lookup.
create index if not exists admin_quiz_org_idx
  on public.admin_quiz (organization_id, created_at desc);

drop trigger if exists admin_quiz_touch on public.admin_quiz;
create trigger admin_quiz_touch
  before update on public.admin_quiz
  for each row execute function public.admin_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 2. admin_quiz_question — gegenereerde + door Niels bewerkte/toegevoegde vragen.
--    Tijdens 'concept' bewerkt Niels: goedkeuren (goedgekeurd=true), bewerken
--    (tekstvelden), verwijderen (verwijderd=true, soft — quiz is nog concept),
--    toevoegen (nieuwe rij, bron='niels'). Bij activeren tellen alleen
--    goedgekeurde, niet-verwijderde vragen mee.
-- ----------------------------------------------------------------------------
create table if not exists public.admin_quiz_question (
  id              uuid primary key default gen_random_uuid(),
  quiz_id         uuid not null references public.admin_quiz(id) on delete cascade,
  organization_id uuid not null,
  categorie       text not null check (char_length(categorie) <= 120),
  categorie_label text check (categorie_label is null or char_length(categorie_label) <= 160),
  -- Contextzin die uitlegt waarom de vraag gesteld wordt (klant ziet dit lichtgrijs).
  context         text check (context is null or char_length(context) <= 1000),
  vraag           text not null check (char_length(vraag) between 1 and 2000),
  type            text not null check (type in ('open','meerkeuze')),
  -- Alleen bij type 'meerkeuze': array van optie-strings. Null bij 'open'.
  opties          jsonb,
  volgorde        integer not null default 0,
  bron            text not null check (bron in ('ai','niels')) default 'ai',
  goedgekeurd     boolean not null default false,
  verwijderd      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists admin_quiz_question_quiz_idx
  on public.admin_quiz_question (quiz_id, volgorde);

drop trigger if exists admin_quiz_question_touch on public.admin_quiz_question;
create trigger admin_quiz_question_touch
  before update on public.admin_quiz_question
  for each row execute function public.admin_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 3. admin_quiz_answer — klant-antwoorden. Eén rij per beantwoorde/overgeslagen
--    vraag (UNIQUE op question_id → idempotent bij hervatten). antwoord = null
--    betekent overgeslagen (wordt NIET geïngest). Het permanente, klant-zichtbare
--    record is het RESULTERENDE documents-record (ingested_document_id); deze rij
--    bestaat voor de Stap-8-tellingen + audit (redacted-vlag).
-- ----------------------------------------------------------------------------
create table if not exists public.admin_quiz_answer (
  id                   uuid primary key default gen_random_uuid(),
  quiz_id              uuid not null references public.admin_quiz(id) on delete cascade,
  question_id          uuid not null references public.admin_quiz_question(id) on delete cascade,
  organization_id      uuid not null,
  -- null = overgeslagen. Cap als veiligheidsnet; de UI/action cap't strenger (~2000).
  antwoord             text check (antwoord is null or char_length(antwoord) <= 4000),
  -- Bij meerkeuze: de gekozen optie + evt. vrije "Anders, namelijk"-tekst.
  meerkeuze_optie      text check (meerkeuze_optie is null or char_length(meerkeuze_optie) <= 500),
  anders_tekst         text check (anders_tekst is null or char_length(anders_tekst) <= 2000),
  -- Link naar het via ingestText aangemaakte documents-record (plain uuid, geen FK:
  -- het doc kan soft-deleted worden; admin_* houdt org_id ook FK-loos).
  ingested_document_id uuid,
  -- True als redactPii vóór ingest een PII-match vond en heeft geredacteerd.
  redacted             boolean not null default false,
  created_at           timestamptz not null default now()
);

-- Eén antwoord per vraag (idempotent bij hervatten van een afgebroken quiz).
create unique index if not exists admin_quiz_answer_question_ux
  on public.admin_quiz_answer (question_id);

create index if not exists admin_quiz_answer_quiz_idx
  on public.admin_quiz_answer (quiz_id, created_at);

-- ----------------------------------------------------------------------------
-- 4. admin_quiz_event — append-only diagnostiek + audit (analyse-fases, status-
--    wijzigingen, Niels' edits). Best-effort geschreven (recordQuizEvent gooit
--    nooit) — een ontbrekend event mag de workflow niet blokken. Mirror van
--    crawl_events (0036) / admin_feedback_events (0043).
-- ----------------------------------------------------------------------------
create table if not exists public.admin_quiz_event (
  id          uuid primary key default gen_random_uuid(),
  quiz_id     uuid not null references public.admin_quiz(id) on delete cascade,
  kind        text not null check (kind in (
    'created','analyse_started','probes_scored','generated',
    'status_change','question_edited','question_added','question_deleted',
    'activated','failed','answer_submitted'
  )),
  from_status text,
  to_status   text,
  body        text check (body is null or char_length(body) <= 4000),
  meta        jsonb not null default '{}'::jsonb,
  author      text not null check (author in ('klant','operator','systeem','ai')) default 'systeem',
  created_at  timestamptz not null default now()
);

create index if not exists admin_quiz_event_quiz_idx
  on public.admin_quiz_event (quiz_id, created_at);
