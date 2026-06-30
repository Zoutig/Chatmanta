-- 0010_v1_conversations.sql
-- V1 conversation-transcripten: threads (header) + thread_messages (beurten).
--
-- Doel: gesprekken persistent maken — widget-bezoeker + dashboard-test-chat —
-- zodat de klant gesprekken kan terugzien en feedback/contactverzoeken eraan
-- kunnen hangen. Geport uit V0 0005 (v0_threads / v0_thread_messages), maar
-- her-gemodelleerd naar het V1-patroon: organization_id + chatbot_id NOT NULL op
-- BEIDE tabellen (V0 had org alleen op de thread-header), content+kind ipv de
-- losse response-jsonb, en ordening op created_at.
--
-- Hard rules: org+chatbot NOT NULL + FK op elke tabel; RLS aan bij creatie met
-- een SELECT-policy die het 0001-membership-patroon spiegelt; GEEN
-- INSERT/UPDATE/DELETE-policy -> writes zijn service-role-only.
--
-- /!\ PII: thread_messages.content bevat ECHTE bezoeker-input (vrije tekst).
-- Anders dan in V0 is de org-isolatie hier NIET cosmetisch: V1 heeft per-user
-- auth + gevulde organization_members, dus de RLS-SELECT-policy is de
-- daadwerkelijke grens die org A's transcripten weg houdt van org B.
--
-- Chat-write-path (service-role, V1-toekomst): per chat-sessie 1 threads-rij
-- (visitor-widget-sessie of dashboard-test-chat). Per beurt 2 thread_messages-
-- rijen: role='user' (de vraag) en role='assistant' (het antwoord, kind =
-- smalltalk/answer/fallback/blocked). Elke beurt bumpt message_count +
-- last_message_at op de thread. Alles via service-role (geen write-policy).

-- ===========================================================================
-- 1. threads -- gespreks-header
-- ===========================================================================
create table if not exists public.threads (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  chatbot_id      uuid        not null references public.chatbots(id) on delete cascade,
  status          text        not null default 'open',
  first_question  text,
  message_count   int         not null default 0,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  deleted_at      timestamptz,
  -- ponytail: startset; widen via migratie als de write-path meer statussen kent.
  constraint threads_status_chk        check (status in ('open','closed')),
  constraint threads_message_count_chk check (message_count >= 0)
);

-- Sidebar/lijst: threads van deze org+bot, recent eerst; soft-deleted eruit.
create index if not exists threads_org_chatbot_created_idx
  on public.threads (organization_id, chatbot_id, created_at desc)
  where deleted_at is null;

alter table public.threads enable row level security;
-- CREATE POLICY kent geen IF NOT EXISTS; plain create matcht 0002/0003.
create policy "threads_select_org_members"
  on public.threads for select to authenticated
  using (
    deleted_at is null
    and organization_id in (
      select organization_id from public.organization_members
      where user_id = (select auth.uid())
    )
  );
-- Geen INSERT/UPDATE/DELETE policy: mutations via service-role.

-- ===========================================================================
-- 2. thread_messages -- gespreks-beurten (append-only)
-- ===========================================================================
create table if not exists public.thread_messages (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  chatbot_id      uuid        not null references public.chatbots(id) on delete cascade,
  thread_id       uuid        not null references public.threads(id) on delete cascade,
  role            text        not null,
  content         text        not null,
  kind            text,
  metadata        jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  constraint thread_messages_role_chk check (role in ('user','assistant')),
  -- kind is alleen zinvol op assistant-rijen; user-rijen hebben kind null.
  constraint thread_messages_kind_chk check (
    (role = 'user' and kind is null) or
    (role = 'assistant' and (kind is null or kind in ('smalltalk','answer','fallback','blocked')))
  )
);

-- Read: beurten van een thread op volgorde.
create index if not exists thread_messages_thread_created_idx
  on public.thread_messages (thread_id, created_at);

alter table public.thread_messages enable row level security;
-- thread_messages draagt zelf organization_id (anders dan V0 0005), dus de
-- SELECT-policy doet de directe membership-check ipv een thread-subquery --
-- consistent met alle andere V1-tabellen.
create policy "thread_messages_select_org_members"
  on public.thread_messages for select to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = (select auth.uid())
    )
  );
-- Geen INSERT/UPDATE/DELETE policy: mutations via service-role.
