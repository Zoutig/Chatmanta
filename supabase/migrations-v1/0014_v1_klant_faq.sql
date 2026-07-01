-- 0014_v1_klant_faq.sql
-- V1 "Meest gestelde vragen" (Gesprekken → Top-Vragen-tab). Port van V0 0051.
--
-- Twee tabellen:
--   1. klant_faq_snapshot -- periodiek herberekende, semantisch-geclusterde
--      snapshot van de meest gestelde vragen per org+chatbot. Geschreven door de
--      V1 FAQ-cron (app/api/v1/cron/faq-snapshot) via service-role.
--   2. klant_faq_config   -- per-org+chatbot klant-instelling (minCount/topN) voor
--      welke vragen in de lijst komen. Port van V0's TopQuestionsConfig (leefde in
--      v0_org_settings JSONB); in V1 een eigen tabel.
--
-- Anders dan V0 0051: chatbot_id NOT NULL toegevoegd (V1-per-bot-scoping), en de
-- cadans-config leeft NIET in een RLS-off admin_config maar is in V1 hardcoded
-- weekly in de cron (geen operator-config-laag in V1-scope).
--
-- Hard rules: org+chatbot NOT NULL + FK; RLS aan + org-leden-SELECT; GEEN
-- write-policy -> service-role-only writes (cron + klant-config-action).

-- ===========================================================================
-- 1. klant_faq_snapshot -- version-agnostic snapshot per org+chatbot.
--    Append-only: nieuwste rij per (org, chatbot) telt.
-- ===========================================================================
create table if not exists public.klant_faq_snapshot (
  id              uuid          primary key default gen_random_uuid(),
  organization_id uuid          not null references public.organizations(id) on delete cascade,
  chatbot_id      uuid          not null references public.chatbots(id) on delete cascade,
  generated_at    timestamptz   not null default now(),
  -- items jsonb: [{ rank, question, count, last_asked, last_status, member_questions }]
  items           jsonb         not null,
  total_unique    int           not null default 0,
  total_queries   int           not null default 0,
  embed_cost_usd  numeric(10,6) not null default 0
);

create index if not exists klant_faq_snapshot_org_chatbot_generated_idx
  on public.klant_faq_snapshot (organization_id, chatbot_id, generated_at desc);

alter table public.klant_faq_snapshot enable row level security;
create policy "klant_faq_snapshot_select_org_members"
  on public.klant_faq_snapshot for select to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = (select auth.uid())
    )
  );
-- Geen write-policy: de FAQ-cron schrijft via service-role.

-- ===========================================================================
-- 2. klant_faq_config -- per org+chatbot: minCount/topN (klant-instelling).
--    Eén rij per (org, chatbot). Defaults = V0's TOP_QUESTIONS_DEFAULT.
-- ===========================================================================
create table if not exists public.klant_faq_config (
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  chatbot_id      uuid        not null references public.chatbots(id) on delete cascade,
  -- Vraag pas tonen vanaf X keer gesteld (V0-default 2, range 1..50).
  min_count       int         not null default 2,
  -- Maximum aantal vragen in de lijst (V0-default 10, range 1..100).
  top_n           int         not null default 10,
  updated_at      timestamptz not null default now(),
  primary key (organization_id, chatbot_id),
  constraint klant_faq_config_min_count_chk check (min_count between 1 and 50),
  constraint klant_faq_config_top_n_chk     check (top_n between 1 and 100)
);

drop trigger if exists klant_faq_config_touch on public.klant_faq_config;
create trigger klant_faq_config_touch
  before update on public.klant_faq_config
  for each row execute function public.v1_touch_updated_at();

alter table public.klant_faq_config enable row level security;
create policy "klant_faq_config_select_org_members"
  on public.klant_faq_config for select to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = (select auth.uid())
    )
  );
-- Geen write-policy: de klant-config-action schrijft via service-role (requireOrgMember).
