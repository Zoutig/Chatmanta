-- 0012_v1_feedback.sql
-- V1 antwoord-feedback: thumbs up/down op bot-antwoorden (port V0 0030/0031).
--
-- Doel: bezoeker/klant geeft up/down op een antwoord, optioneel met toelichting.
-- Klantendashboard toont negatieve feedback voor kwaliteitsbewaking.
--
-- Her-gemodelleerd naar V1: chatbot_id NOT NULL toegevoegd; query_log_id is
-- NULLABLE + ON DELETE SET NULL (V0 had NOT NULL + CASCADE) zodat de feedback
-- bewaard blijft als de bijbehorende query_log-rij is opgeruimd.
--
-- Hard rules: org+chatbot NOT NULL + FK; RLS aan + SELECT-policy (0001-patroon);
-- GEEN INSERT/UPDATE/DELETE-policy -> service-role-only writes (append-only).

create table if not exists public.feedback (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  chatbot_id      uuid        not null references public.chatbots(id) on delete cascade,
  query_log_id    uuid        references public.query_log(id) on delete set null,
  rating          text        not null,
  comment         text,
  created_at      timestamptz not null default now(),
  constraint feedback_rating_chk      check (rating in ('up','down')),
  constraint feedback_comment_len_chk check (comment is null or char_length(comment) <= 2000)
);

-- Dashboard: negatieve-feedback-tab + lijst -- org -> rating -> recent eerst.
create index if not exists feedback_org_rating_created_idx
  on public.feedback (organization_id, rating, created_at desc);

alter table public.feedback enable row level security;
-- CREATE POLICY kent geen IF NOT EXISTS; plain create matcht 0002/0003.
create policy "feedback_select_org_members"
  on public.feedback for select to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = (select auth.uid())
    )
  );
-- Geen INSERT/UPDATE/DELETE policy: mutations via service-role.

-- ponytail: V0's UNIQUE (query_log_id, rating) dedup-guard weggelaten -- query_log_id
-- is nu nullable (NULLs zijn distinct in een unique-index), dus die constraint dekt
-- de dubbel-submit-case niet meer betrouwbaar. Upgrade-pad als dubbele submits
-- opduiken: app-laag-dedup, of een partial unique WHERE query_log_id IS NOT NULL.
