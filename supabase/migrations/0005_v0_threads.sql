-- =============================================================================
-- Migration 0005 — V0 chat threads (gesprek-historie)
--
-- Doel: gesprekken persistent maken zodat de gebruiker oudere conversations
-- kan terugzien in de sidebar. V0 = single-tenant DEV_ORG via service-role,
-- maar we volgen het V1-schema (organization_id NOT NULL + RLS overal) zodat
-- de migratie naar V1 een rename + scope-uitbreiding wordt, niet een
-- her-modellering.
--
-- Ontwerpkeuzes:
--   * Twee tabellen: v0_threads (header) + v0_thread_messages (turns).
--   * Soft-delete via deleted_at op threads (zelfde patroon als documents).
--     Messages cascaden hard mee bij thread-delete via FK on delete cascade.
--   * `position` (0-based) + UNIQUE (thread_id, position) garandeert volgorde
--     en blokkeert dubbele inserts op dezelfde positie. Race-conditions zijn
--     in V0 onwaarschijnlijk (composer disabled tijdens pending) maar het
--     constraint is goedkoop en sluit een hele klasse bugs uit.
--   * `response` (jsonb) bewaart de volledige ChatResponse voor assistant
--     messages — bronnen, extras, threshold, kind. Bij een reload kunnen we
--     oude antwoorden compleet hydrateren. Voor user-rows is `response` null.
--   * Append-only API: turns worden alleen ingevoegd, nooit gewijzigd.
--     Om die reden geen UPDATE policy.
--   * RLS aan, alleen SELECT-policy voor org-members. Mutations gaan via
--     service-role wrappers in lib/v0/server/threads.ts.
-- =============================================================================


-- =============================================================================
-- TABLE: v0_threads
-- =============================================================================
create table public.v0_threads (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  bot_version     text        not null,
  title           text        not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint v0_threads_title_len_chk check (char_length(title) between 1 and 200)
);

-- Sidebar query: laatste N threads van deze org, gesorteerd op recente activiteit.
create index v0_threads_org_updated_idx
  on public.v0_threads (organization_id, updated_at desc)
  where deleted_at is null;

alter table public.v0_threads enable row level security;

create policy "v0_threads_select_org_members"
  on public.v0_threads
  for select
  to authenticated
  using (
    deleted_at is null
    and organization_id in (
      select organization_id
      from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- Geen INSERT/UPDATE/DELETE policy: mutations via service-role.


-- =============================================================================
-- TABLE: v0_thread_messages
-- =============================================================================
create table public.v0_thread_messages (
  id          uuid        primary key default gen_random_uuid(),
  thread_id   uuid        not null references public.v0_threads(id) on delete cascade,
  position    int         not null,
  role        text        not null,
  content     text        not null,
  response    jsonb,
  created_at  timestamptz not null default now(),
  constraint v0_thread_messages_role_chk check (role in ('user', 'assistant')),
  constraint v0_thread_messages_position_chk check (position >= 0),
  -- response is alleen relevant op assistant-rijen; user-rijen hebben null.
  constraint v0_thread_messages_response_role_chk check (
    (role = 'user' and response is null) or
    (role = 'assistant')
  )
);

-- Volgorde-garantie + gebruikt door reads.
create unique index v0_thread_messages_thread_pos_idx
  on public.v0_thread_messages (thread_id, position);

alter table public.v0_thread_messages enable row level security;

create policy "v0_thread_messages_select_via_thread"
  on public.v0_thread_messages
  for select
  to authenticated
  using (
    thread_id in (
      select id from public.v0_threads
      where deleted_at is null
        and organization_id in (
          select organization_id
          from public.organization_members
          where user_id = (select auth.uid())
        )
    )
  );

-- Geen INSERT/UPDATE/DELETE policy: mutations via service-role.
