-- 0015_v1_quiz.sql
-- V1 kennisbank-quiz. Port van V0 0044 (admin_quiz*). Een AI analyseert de KB van
-- een org, detecteert ontbrekende categorieën en genereert vragen; de Jorion-admin
-- keurt ze goed; de klant beantwoordt ze in het portaal; antwoorden stromen via de
-- V1-ingest terug de kennisbank in.
--
-- Anders dan V0 0044 (RLS-off admin_*): V1 hard rule = RLS overal. Deze tabellen
-- krijgen organization_id + chatbot_id NOT NULL + FK en RLS-aan met org-leden-
-- SELECT, zodat de klant zijn eigen actieve quiz + vragen kan LEZEN. Alle writes
-- (admin-authoring, statustransities, klant-antwoorden) lopen via service-role in
-- de action-laag (getSessionOrg/requireOrgMember voor de klant; requireJorionAdmin
-- voor de authoring). De CHECK-enums spiegelen V0 0044 / lib/controlroom/types.ts.

-- ===========================================================================
-- 1. v1_quiz -- quiz-header + lifecycle + analyse-telemetrie (1 actieve per org+bot)
-- ===========================================================================
create table if not exists public.v1_quiz (
  id                  uuid        primary key default gen_random_uuid(),
  organization_id     uuid        not null references public.organizations(id) on delete cascade,
  chatbot_id          uuid        not null references public.chatbots(id) on delete cascade,
  status              text        not null default 'generating',
  analyse_model       text        not null default 'gpt-4o-mini',
  analyse_method      text        not null default 'category_probe',
  analyse_cost_usd    numeric(10,6),
  generation_cost_usd numeric(10,6),
  bedrijfscontext     jsonb       not null default '{}'::jsonb,
  question_count      integer     not null default 0,
  answered_count      integer     not null default 0,
  skipped_count       integer     not null default 0,
  error               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  activated_at        timestamptz,
  completed_at        timestamptz,
  constraint v1_quiz_status_chk check (status in (
    'generating','concept','actief','voltooid','geannuleerd','leeg','mislukt'
  )),
  constraint v1_quiz_analyse_model_chk  check (analyse_model in ('gpt-4o-mini','gpt-4o')),
  constraint v1_quiz_analyse_method_chk check (analyse_method in ('category_probe','map_reduce')),
  constraint v1_quiz_error_chk          check (error is null or char_length(error) <= 2000)
);

-- Eenmalig-per-org+bot: max één niet-geannuleerde quiz. Re-trigger raakt 23505 →
-- de action-laag doet check-and-block/confirm vóór insert.
create unique index if not exists v1_quiz_one_active_per_org
  on public.v1_quiz (organization_id, chatbot_id)
  where status <> 'geannuleerd';
create index if not exists v1_quiz_org_idx
  on public.v1_quiz (organization_id, chatbot_id, created_at desc);

drop trigger if exists v1_quiz_touch on public.v1_quiz;
create trigger v1_quiz_touch
  before update on public.v1_quiz
  for each row execute function public.v1_touch_updated_at();

alter table public.v1_quiz enable row level security;
create policy "v1_quiz_select_org_members"
  on public.v1_quiz for select to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- ===========================================================================
-- 2. v1_quiz_question -- gegenereerde + admin-bewerkte/toegevoegde vragen.
-- ===========================================================================
create table if not exists public.v1_quiz_question (
  id              uuid        primary key default gen_random_uuid(),
  quiz_id         uuid        not null references public.v1_quiz(id) on delete cascade,
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  chatbot_id      uuid        not null references public.chatbots(id) on delete cascade,
  categorie       text        not null,
  categorie_label text,
  context         text,
  vraag           text        not null,
  type            text        not null,
  opties          jsonb,
  volgorde        integer     not null default 0,
  bron            text        not null default 'ai',
  goedgekeurd     boolean     not null default false,
  verwijderd      boolean     not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint v1_quiz_question_categorie_chk check (char_length(categorie) <= 120),
  constraint v1_quiz_question_label_chk     check (categorie_label is null or char_length(categorie_label) <= 160),
  constraint v1_quiz_question_context_chk   check (context is null or char_length(context) <= 1000),
  constraint v1_quiz_question_vraag_chk     check (char_length(vraag) between 1 and 2000),
  constraint v1_quiz_question_type_chk      check (type in ('open','meerkeuze')),
  constraint v1_quiz_question_bron_chk      check (bron in ('ai','niels'))
);

create index if not exists v1_quiz_question_quiz_idx
  on public.v1_quiz_question (quiz_id, volgorde);

drop trigger if exists v1_quiz_question_touch on public.v1_quiz_question;
create trigger v1_quiz_question_touch
  before update on public.v1_quiz_question
  for each row execute function public.v1_touch_updated_at();

alter table public.v1_quiz_question enable row level security;
create policy "v1_quiz_question_select_org_members"
  on public.v1_quiz_question for select to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- ===========================================================================
-- 3. v1_quiz_answer -- klant-antwoorden (1 rij per beantwoorde/overgeslagen vraag).
-- ===========================================================================
create table if not exists public.v1_quiz_answer (
  id                   uuid        primary key default gen_random_uuid(),
  quiz_id              uuid        not null references public.v1_quiz(id) on delete cascade,
  question_id          uuid        not null references public.v1_quiz_question(id) on delete cascade,
  organization_id      uuid        not null references public.organizations(id) on delete cascade,
  chatbot_id           uuid        not null references public.chatbots(id) on delete cascade,
  -- null = overgeslagen (wordt niet geïngest).
  antwoord             text,
  meerkeuze_optie      text,
  anders_tekst         text,
  ingested_document_id uuid,
  redacted             boolean     not null default false,
  created_at           timestamptz not null default now(),
  constraint v1_quiz_answer_antwoord_chk check (antwoord is null or char_length(antwoord) <= 4000),
  constraint v1_quiz_answer_optie_chk    check (meerkeuze_optie is null or char_length(meerkeuze_optie) <= 500),
  constraint v1_quiz_answer_anders_chk   check (anders_tekst is null or char_length(anders_tekst) <= 2000)
);

-- Eén antwoord per vraag (idempotent bij hervatten).
create unique index if not exists v1_quiz_answer_question_ux
  on public.v1_quiz_answer (question_id);
create index if not exists v1_quiz_answer_quiz_idx
  on public.v1_quiz_answer (quiz_id, created_at);

alter table public.v1_quiz_answer enable row level security;
create policy "v1_quiz_answer_select_org_members"
  on public.v1_quiz_answer for select to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- ===========================================================================
-- 4. v1_quiz_event -- append-only diagnostiek/audit. Best-effort (nooit blokken).
-- ===========================================================================
create table if not exists public.v1_quiz_event (
  id              uuid        primary key default gen_random_uuid(),
  quiz_id         uuid        not null references public.v1_quiz(id) on delete cascade,
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  chatbot_id      uuid        not null references public.chatbots(id) on delete cascade,
  kind            text        not null,
  from_status     text,
  to_status       text,
  body            text,
  meta            jsonb       not null default '{}'::jsonb,
  author          text        not null default 'systeem',
  created_at      timestamptz not null default now(),
  constraint v1_quiz_event_kind_chk check (kind in (
    'created','analyse_started','probes_scored','generated',
    'status_change','question_edited','question_added','question_deleted',
    'activated','failed','answer_submitted'
  )),
  constraint v1_quiz_event_body_chk   check (body is null or char_length(body) <= 4000),
  constraint v1_quiz_event_author_chk check (author in ('klant','operator','systeem','ai'))
);

create index if not exists v1_quiz_event_quiz_idx
  on public.v1_quiz_event (quiz_id, created_at);

alter table public.v1_quiz_event enable row level security;
create policy "v1_quiz_event_select_org_members"
  on public.v1_quiz_event for select to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = (select auth.uid())
    )
  );
-- Geen write-policy op alle vier: writes via service-role (admin-authoring +
-- klant-antwoord-action met requireOrgMember).
