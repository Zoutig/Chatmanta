-- =============================================================================
-- Migration 0003 — V0 query log
--
-- Doel: elke chat-interactie loggen voor empirische analyse:
-- welke prompts werken, welke versies zijn beter, waar gaat retrieval mis.
--
-- V0-specifiek (organization_id=dev-org). In V1 wordt dit een echte usage_logs
-- tabel met chatbot_id-scope (blueprint sectie 24). Voor V0 is dit een
-- leeranalyse-tool, niet productie-logging.
--
-- Bewust APPEND-only: geen UPDATE/DELETE policies. Logs zijn historie,
-- corrigeren kan niet. Hard-delete via service-role (admin opruim).
-- =============================================================================

create table public.query_log (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  bot_version     text        not null,
  kind            text        not null,
  question        text        not null,
  rewritten       text,                          -- null als geen rewrite gebeurd is
  threshold       numeric(4,2),                  -- null voor smalltalk (geen retrieval)
  top_similarity  numeric(6,4),                  -- null voor smalltalk
  source_count    int         not null default 0,
  answer          text        not null,
  embed_tokens    int         not null default 0,
  chat_in_tokens  int         not null default 0,
  chat_out_tokens int         not null default 0,
  pre_in_tokens   int         not null default 0,
  pre_out_tokens  int         not null default 0,
  cost_usd        numeric(10,6) not null default 0,
  created_at      timestamptz not null default now(),
  constraint query_log_kind_chk check (kind in ('smalltalk', 'answer', 'fallback'))
);

create index query_log_org_created_idx
  on public.query_log (organization_id, created_at desc);

create index query_log_org_version_idx
  on public.query_log (organization_id, bot_version);

alter table public.query_log enable row level security;

create policy "query_log_select_org_members"
  on public.query_log
  for select
  to authenticated
  using (
    organization_id in (
      select organization_id
      from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- No INSERT/UPDATE/DELETE policy: writes via service-role only (V0 server
-- action wrapper heeft geen user-context).
