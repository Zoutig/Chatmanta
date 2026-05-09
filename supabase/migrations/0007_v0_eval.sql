-- =============================================================================
-- Migration 0007 — V0 eval framework (v0.4 feature 1)
--
-- Doel: empirische vergelijking tussen bot-versies via een vaste set
-- gold-vragen + LLM-as-judge. Twee tabellen:
--   * eval_questions — gold corpus (vraag + referentieantwoord + key facts +
--     tags + difficulty). Bewust idempotent via unieke `slug` zodat re-seeden
--     bestaande rijen kan upserten zonder duplicates.
--   * eval_runs      — append-only resultaten van één bot+versie+vraag run,
--     incl. de bot-output snapshot (answer + sources + cost + latency) en
--     drie scores van de judge (correctness/completeness/grounding 0-5)
--     plus reasoning + judge cost/latency.
--
-- V0-specifiek (organization_id = DEV_ORG_ID via service-role). RLS-patroon
-- volgt query_log/v0_threads: SELECT-policy voor org-members, geen
-- INSERT/UPDATE/DELETE-policy → mutations alleen via service-role wrappers
-- (eval-runner draait als CLI-script zonder user-context).
-- =============================================================================


-- =============================================================================
-- TABLE: eval_questions
-- =============================================================================
create table public.eval_questions (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  slug            text        not null,
  question        text        not null,
  gold_answer     text        not null,
  gold_facts      text[]      not null default '{}',
  tags            text[]      not null default '{}',
  difficulty      text        not null default 'medium',
  created_at      timestamptz not null default now(),
  constraint eval_questions_difficulty_chk
    check (difficulty in ('easy', 'medium', 'hard')),
  constraint eval_questions_question_len_chk
    check (char_length(question) between 1 and 1000),
  constraint eval_questions_gold_answer_len_chk
    check (char_length(gold_answer) between 1 and 4000),
  -- Idempotente re-seed: zelfde slug + org overschrijft.
  constraint eval_questions_org_slug_unique unique (organization_id, slug)
);

create index eval_questions_org_difficulty_idx
  on public.eval_questions (organization_id, difficulty);

alter table public.eval_questions enable row level security;

create policy "eval_questions_select_org_members"
  on public.eval_questions
  for select
  to authenticated
  using (
    organization_id in (
      select organization_id
      from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- Geen INSERT/UPDATE/DELETE policy: seed via service-role.


-- =============================================================================
-- TABLE: eval_runs
-- =============================================================================
-- Append-only. Een "run" = één moment waarop de runner alle vragen × versies
-- afwerkt; runs worden gegroepeerd op created_at-bucket in de UI/report.
create table public.eval_runs (
  id                  uuid        primary key default gen_random_uuid(),
  organization_id     uuid        not null references public.organizations(id) on delete cascade,
  question_id         uuid        not null references public.eval_questions(id) on delete cascade,
  bot_version         text        not null,
  judge_model         text        not null,

  -- Bot-output snapshot — zodat we runs kunnen vergelijken zonder de bot
  -- opnieuw te draaien tegen oudere versies/configs.
  bot_kind            text        not null,
  bot_answer          text        not null,
  bot_sources         jsonb       not null default '[]'::jsonb,
  bot_cost_usd        numeric(10,6) not null default 0,
  bot_latency_ms      int         not null default 0,

  -- Judge scores (0-5 per dimensie). NULL = judge faalde (parse-error,
  -- API-error). Score-velden in dat geval nul gelaten in app-code, niet hier
  -- via constraint, zodat de runner door blijft draaien.
  score_correctness   smallint,
  score_completeness  smallint,
  score_grounding     smallint,
  judge_reasoning     text,
  judge_parse_error   boolean     not null default false,
  judge_cost_usd      numeric(10,6) not null default 0,
  judge_latency_ms    int         not null default 0,

  created_at          timestamptz not null default now(),

  constraint eval_runs_bot_kind_chk
    check (bot_kind in ('answer', 'fallback', 'smalltalk')),
  constraint eval_runs_correctness_range_chk
    check (score_correctness is null or score_correctness between 0 and 5),
  constraint eval_runs_completeness_range_chk
    check (score_completeness is null or score_completeness between 0 and 5),
  constraint eval_runs_grounding_range_chk
    check (score_grounding is null or score_grounding between 0 and 5)
);

-- Sortering nieuwste-eerst per org (UI-default).
create index eval_runs_org_created_idx
  on public.eval_runs (organization_id, created_at desc);

-- Filters per (vraag, versie) voor de detail-view.
create index eval_runs_org_question_idx
  on public.eval_runs (organization_id, question_id);

create index eval_runs_org_version_idx
  on public.eval_runs (organization_id, bot_version);

alter table public.eval_runs enable row level security;

create policy "eval_runs_select_org_members"
  on public.eval_runs
  for select
  to authenticated
  using (
    organization_id in (
      select organization_id
      from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- Geen INSERT/UPDATE/DELETE policy: writes via service-role (eval-runner CLI).
