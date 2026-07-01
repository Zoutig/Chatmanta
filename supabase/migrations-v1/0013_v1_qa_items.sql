-- 0013_v1_qa_items.sql
-- V1 handmatige Q&A (Kennisbank → Q&A-tab). Port van V0's ManualQA, dat in V0
-- als JSONB-array in v0_org_settings.qa leefde. In V1 een echte tabel:
-- org+chatbot NOT NULL + FK, RLS aan met org-leden-SELECT, writes service-role.
--
-- Side-effect (in de action-laag, niet hier): elk actief Q&A-item wordt via de
-- V1-ingest als document (metadata.origin = 'manual_qa') de kennisbank in gezet;
-- de resulterende documents-id komt in ingested_document_id (plain uuid, GEEN FK —
-- het doc kan soft-deleted worden, net als admin_quiz_answer in V0 0044).
--
-- Hard rules: org+chatbot NOT NULL + FK op elke klantdata-tabel; RLS aan bij
-- creatie met een SELECT-policy die het 0001-membership-patroon spiegelt; GEEN
-- INSERT/UPDATE/DELETE-policy -> writes zijn service-role-only.

-- Gedeelde updated_at-touch-trigger voor de V1-dashboard-tabellen (0013-0016).
-- create or replace = idempotent; latere migraties hergebruiken 'm.
create or replace function public.v1_touch_updated_at()
returns trigger language plpgsql
set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.org_qa_items (
  id                   uuid        primary key default gen_random_uuid(),
  organization_id      uuid        not null references public.organizations(id) on delete cascade,
  chatbot_id           uuid        not null references public.chatbots(id) on delete cascade,
  question             text        not null,
  answer               text        not null,
  category             text,
  active               boolean     not null default true,
  -- Link naar het via ingest aangemaakte documents-record (plain uuid, geen FK).
  ingested_document_id uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint org_qa_items_question_chk check (char_length(question) between 1 and 2000),
  constraint org_qa_items_answer_chk   check (char_length(answer) between 1 and 8000),
  constraint org_qa_items_category_chk check (category is null or char_length(category) <= 120)
);

-- Dashboard: Q&A-lijst van deze org+bot, nieuwste eerst.
create index if not exists org_qa_items_org_chatbot_created_idx
  on public.org_qa_items (organization_id, chatbot_id, created_at desc);

drop trigger if exists org_qa_items_touch on public.org_qa_items;
create trigger org_qa_items_touch
  before update on public.org_qa_items
  for each row execute function public.v1_touch_updated_at();

alter table public.org_qa_items enable row level security;
-- CREATE POLICY kent geen IF NOT EXISTS; plain create matcht 0010/0012.
create policy "org_qa_items_select_org_members"
  on public.org_qa_items for select to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = (select auth.uid())
    )
  );
-- Geen INSERT/UPDATE/DELETE policy: mutations via service-role (requireOrgMember).
