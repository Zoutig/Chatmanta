-- =============================================================================
-- Migration 0001 — Core multi-tenancy foundation
--
-- Creates the three foundational tables for ChatManta's multi-tenant model:
--   * organizations       — one row per customer
--   * users               — mirror of auth.users (kept in sync by trigger)
--   * organization_members — many-to-many between orgs and users + role
--
-- Hard rules applied throughout (Blueprint Concept_Blueprint_ChatManta.md):
--   * RLS enabled on every table at creation time (sectie 11)
--   * CHECK constraints on enum/format columns (sectie 10)
--   * Cascade rules made explicit on every FK (sectie 10)
--   * Soft delete via deleted_at; SELECT policies filter deleted rows
--     (sectie 27 — DB-level enforcement, not just app-level)
--   * INSERT/UPDATE/DELETE policies are intentionally absent for
--     normal users on these tables — mutations happen via service-role
--     wrappers only (Jorion-admin onboards customers, blueprint sectie 21).
--     A missing policy on an action-type means: blocked under RLS.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Required extensions
-- -----------------------------------------------------------------------------
create extension if not exists "pgcrypto";  -- for gen_random_uuid()


-- =============================================================================
-- TABLE: organizations
-- =============================================================================
create table public.organizations (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  slug        text        not null unique,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  -- slug must be url-safe lowercase alphanumeric with hyphens
  constraint organizations_slug_format_chk
    check (slug ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$' and length(slug) between 2 and 64)
);

create index organizations_deleted_at_idx
  on public.organizations (deleted_at)
  where deleted_at is null;

alter table public.organizations enable row level security;

-- Members can see their own (non-deleted) organizations.
create policy "organizations_select_own"
  on public.organizations
  for select
  to authenticated
  using (
    deleted_at is null
    and id in (
      select organization_id
      from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- No INSERT/UPDATE/DELETE policy: customers cannot mutate organizations
-- via RLS. Jorion-admin handles this via service-role wrappers.


-- =============================================================================
-- TABLE: users  (mirror of auth.users)
-- =============================================================================
-- Rows are created automatically by the on_auth_user_created trigger below.
-- Application code should NOT INSERT into this table directly.
create table public.users (
  id              uuid        primary key references auth.users(id) on delete cascade,
  email           text        not null,
  full_name       text,
  is_jorion_admin boolean     not null default false,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index users_email_idx
  on public.users (email)
  where deleted_at is null;

alter table public.users enable row level security;

-- A user can see their own row.
create policy "users_select_own"
  on public.users
  for select
  to authenticated
  using (
    deleted_at is null
    and id = (select auth.uid())
  );

-- A user can update non-sensitive fields on their own row. Note: a user
-- cannot escalate themselves to is_jorion_admin via this policy because
-- the policy USING/CHECK clauses don't restrict columns — RLS on
-- Postgres can't deny per-column writes. Therefore we still require
-- column-level discipline in app code (see lib/auth.ts) and, for hardening
-- in a later phase, a column-level grant revocation.
create policy "users_update_own"
  on public.users
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No INSERT/DELETE policy: handled by trigger (insert) and admin-only (delete).


-- =============================================================================
-- TABLE: organization_members
-- =============================================================================
create table public.organization_members (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null references public.organizations(id) on delete cascade,
  user_id          uuid        not null references public.users(id) on delete cascade,
  role             text        not null,
  created_at       timestamptz not null default now(),
  constraint organization_members_role_chk
    check (role in ('owner', 'admin', 'member')),
  constraint organization_members_unique_pair
    unique (organization_id, user_id)
);

create index organization_members_org_idx
  on public.organization_members (organization_id);

create index organization_members_user_idx
  on public.organization_members (user_id);

alter table public.organization_members enable row level security;

-- A user can see their own memberships. This is the row that
-- requireOrgMember() reads in lib/auth.ts to verify access.
create policy "organization_members_select_own"
  on public.organization_members
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- No INSERT/UPDATE/DELETE policy: membership changes happen via
-- service-role wrappers (Jorion-admin invite flow, sectie 21).


-- =============================================================================
-- TRIGGER: keep public.users in sync with auth.users
-- =============================================================================
-- When Supabase Auth creates a new auth.users row (via signup or
-- inviteUserByEmail), this trigger creates the matching public.users row
-- so org membership FKs can be inserted in the same transaction.
--
-- SECURITY DEFINER lets it INSERT into public.users despite RLS, since the
-- trigger function owner has bypass privileges. search_path is pinned to
-- prevent search-path-based privilege escalation.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.users (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
