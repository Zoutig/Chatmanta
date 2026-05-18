-- =============================================================================
-- Migration 0024 — Eval v2: extra dimensies + pairwise judgments
--
-- Doel: de V0-eval-pipeline meet straks méér dan correctness/completeness/
-- grounding/route_correct/meta_talk. Twee uitbreidingen:
--
--   A) Vier extra absolute-judge dimensies op eval_runs:
--        * production_ready (boolean)   — "zou je dit antwoord versturen naar
--          een betalende klant?". Directe productie-drempel-metric.
--        * answer_length_appropriate (text enum)
--                                       — right_length | too_verbose | too_curt.
--          Vangt verbositeit die in geen huidige score zichtbaar is.
--        * source_citation_binding (boolean)
--                                       — strenger dan score_grounding: élke
--          niet-triviale feit-bewering moet traceerbaar zijn naar een chunk
--          in bot_sources.
--        * score_tone_match (smallint 0-2)
--                                       — matcht antwoord het per-org register
--          (dakwerker=praktisch / fysio=empathisch / accountant=formeel).
--          Persona-spec leeft in eval-fixtures/personas/{slug}.md (zie loader
--          lib/v0/server/eval-personas.ts in dezelfde PR).
--
--   B) Nieuwe tabel public.eval_pairwise_runs voor head-to-head comparison
--      tussen versie A en versie B per vraag. LLM-judges zijn aantoonbaar
--      betrouwbaarder in vergelijken dan in absolute scoren — vooral voor
--      close-runners (v0.5 vs v0.6). Eén pairwise-call per vraag (alleen
--      tussen EVAL_DEFAULT_VERSIONS), niet N×N.
--
-- Alle kolommen nullable: pre-0024 eval_runs houden NULL voor de 4 nieuwe
-- velden, en eval_pairwise_runs is een append-only nieuwe tabel die alleen
-- vanaf de eerstvolgende `npm run eval:run` gevuld wordt. Trend-grafieken
-- splitsen op pre-v2/post-v2 via created_at.
--
-- RLS: pairwise-tabel volgt hetzelfde patroon als eval_runs (SELECT-policy
-- voor org-members, writes uitsluitend via service-role).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A) Extra dimensies op eval_runs
-- -----------------------------------------------------------------------------

alter table public.eval_runs
  add column if not exists production_ready boolean,
  add column if not exists answer_length_appropriate text,
  add column if not exists source_citation_binding boolean,
  add column if not exists score_tone_match smallint;

-- Idempotente constraint-setup (DROP IF EXISTS + ADD) — zelfde patroon als
-- 0021 voor toekomstige re-runs op DBs met eerdere collision-resolve.
alter table public.eval_runs
  drop constraint if exists eval_runs_answer_length_chk;

alter table public.eval_runs
  add constraint eval_runs_answer_length_chk
    check (
      answer_length_appropriate is null
      or answer_length_appropriate in ('right_length', 'too_verbose', 'too_curt')
    );

alter table public.eval_runs
  drop constraint if exists eval_runs_tone_match_chk;

alter table public.eval_runs
  add constraint eval_runs_tone_match_chk
    check (score_tone_match is null or score_tone_match between 0 and 2);

comment on column public.eval_runs.production_ready is
  'V0.7 — judge-oordeel: zou een betalend-klant-channel dit antwoord versturen? Boolean. NULL voor pre-0024 runs.';

comment on column public.eval_runs.answer_length_appropriate is
  'V0.7 — judge-oordeel over verbositeit: right_length | too_verbose | too_curt. NULL voor pre-0024 runs.';

comment on column public.eval_runs.source_citation_binding is
  'V0.7 — judge-oordeel: is élke niet-triviale feit-bewering in bot_answer traceerbaar naar een chunk in bot_sources? Strenger dan score_grounding (dat ook punten geeft voor "meeste feiten gedekt"). NULL voor pre-0024 runs.';

comment on column public.eval_runs.score_tone_match is
  'V0.7 — judge-oordeel of bot het verwachte per-org register matcht. 0=mismatch, 1=neutraal, 2=goede match. Persona-spec in eval-fixtures/personas/{slug}.md. NULL voor pre-0024 runs.';

-- -----------------------------------------------------------------------------
-- B) Pairwise-judgments tabel
-- -----------------------------------------------------------------------------

create table if not exists public.eval_pairwise_runs (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null references public.organizations(id) on delete cascade,
  question_id uuid not null references public.eval_questions(id) on delete cascade,

  bot_version_a text not null,
  bot_version_b text not null,

  -- Welke versie wint, of een tie. A en B verwijzen naar bot_version_a/b.
  winner text not null,

  -- Hoe zeker is de judge? 1=zwak (kleine voorkeur), 2=duidelijk, 3=geen twijfel.
  confidence smallint,

  -- 2-4 zin NL motivatie waarom de winner won. Hoofdsignaal voor regressie-
  -- analyse: als pairwise zegt "A wint" maar absolute geeft B hogere C/P/G,
  -- dan vertelt de rationale waar dat onderscheid uit komt.
  judge_rationale text,

  -- Judge-metadata (mirror van eval_runs).
  judge_model text,
  judge_cost_usd numeric(10, 6) not null default 0,
  judge_latency_ms integer,
  judge_parse_error boolean not null default false,

  created_at timestamptz not null default now()
);

-- Idempotente check-constraints (DROP IF EXISTS + ADD).
alter table public.eval_pairwise_runs
  drop constraint if exists eval_pairwise_runs_winner_chk;

alter table public.eval_pairwise_runs
  add constraint eval_pairwise_runs_winner_chk
    check (winner in ('A', 'B', 'tie'));

alter table public.eval_pairwise_runs
  drop constraint if exists eval_pairwise_runs_confidence_chk;

alter table public.eval_pairwise_runs
  add constraint eval_pairwise_runs_confidence_chk
    check (confidence is null or confidence between 1 and 3);

-- Versies moeten verschillend zijn (pairwise tegen jezelf = onzin).
alter table public.eval_pairwise_runs
  drop constraint if exists eval_pairwise_runs_distinct_versions_chk;

alter table public.eval_pairwise_runs
  add constraint eval_pairwise_runs_distinct_versions_chk
    check (bot_version_a <> bot_version_b);

comment on table public.eval_pairwise_runs is
  'V0.7 — append-only pairwise comparisons tussen bot-versies. Eén rij = "judge oordeelt welke van twee versies (A vs B) deze vraag beter beantwoordde". Geschreven door scripts/v0-eval-run.ts na alle absolute-judge calls. Wordt door eval-report gebruikt voor win-rate per versie-paar (per org, per question_type).';

comment on column public.eval_pairwise_runs.winner is
  'A | B | tie. A en B verwijzen naar bot_version_a en bot_version_b.';

comment on column public.eval_pairwise_runs.confidence is
  'Judge-zekerheid 1-3. 1=zwak (kleine voorkeur, kon ook tie zijn), 2=duidelijk, 3=geen twijfel. NULL bij tie of judge-parse-error.';

-- Indexes voor de twee meest voorkomende query-patterns in eval-report:
--   1) "geef me alle pairwise rows voor versie-paar X/Y" → version-paar lookup
--   2) "laatste pairwise-batch voor regressie-check" → created_at desc
create index if not exists eval_pairwise_runs_versions_idx
  on public.eval_pairwise_runs (bot_version_a, bot_version_b, created_at desc);

create index if not exists eval_pairwise_runs_org_question_idx
  on public.eval_pairwise_runs (organization_id, question_id);

create index if not exists eval_pairwise_runs_created_at_idx
  on public.eval_pairwise_runs (created_at desc);

-- -----------------------------------------------------------------------------
-- RLS: zelfde patroon als eval_runs / eval_questions (0007).
-- -----------------------------------------------------------------------------

alter table public.eval_pairwise_runs enable row level security;

drop policy if exists "eval_pairwise_runs_select_org_members"
  on public.eval_pairwise_runs;

create policy "eval_pairwise_runs_select_org_members"
  on public.eval_pairwise_runs
  for select
  to authenticated
  using (
    organization_id in (
      select organization_id
      from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- Geen INSERT/UPDATE/DELETE policy: writes via service-role (eval-runner CLI),
-- zelfde discipline als alle V0-eval tabellen.
