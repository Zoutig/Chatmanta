-- =============================================================================
-- Migration 0027 — Command Center: check-ins, decisions, test customers (PR 3/3)
--
-- Volgt het cc_-prefix patroon uit migratie 0025/0026: deze tabellen bevatten
-- bewust GEEN organization_id en geen RLS. Het is interne founder-cockpit data
-- (Sebastiaan + Niels), niet klant-data. Toegang loopt uitsluitend via de
-- service-role wrappers in lib/commandcenter/server/* en is achter het V0
-- demo-password gate (proxy.ts).
--
-- Schema's spiegelen exact de TS-types in lib/commandcenter/types.ts.
-- CHECK-constraints op enum-velden moeten bij elke enum-wijziging meegroeien.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. cc_checkins — wekelijkse retros / planning sessions (goal-prompt §12)
-- ----------------------------------------------------------------------------
create table if not exists public.cc_checkins (
  id uuid primary key default gen_random_uuid(),
  week_label text not null check (char_length(week_label) between 1 and 40),
  date date not null,
  attendees text[] not null default '{}',
  completed text not null default '',
  not_completed text not null default '',
  reasons text not null default '',
  sebastiaan_next_tasks text[] not null default '{}',
  niels_next_tasks text[] not null default '{}',
  shared_next_tasks text[] not null default '{}',
  next_priorities text[] not null default '{}',
  blockers text not null default '',
  decisions text not null default '',
  created_task_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists cc_checkins_date_idx on public.cc_checkins (date desc);

-- ----------------------------------------------------------------------------
-- 2. cc_decisions — beslissingenlogboek (goal-prompt §13)
-- ----------------------------------------------------------------------------
create table if not exists public.cc_decisions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  title text not null check (char_length(title) between 1 and 200),
  decision text not null default '',
  context text,
  impact text check (impact in ('Hoog','Middel','Laag')),
  decided_by text[] not null default '{}',
  review_date date,
  status text not null check (status in ('Actief','Te herzien','Vervangen','Geannuleerd')) default 'Actief',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cc_decisions_status_idx on public.cc_decisions (status);
create index if not exists cc_decisions_date_idx   on public.cc_decisions (date desc);

create or replace function public.cc_decisions_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cc_decisions_touch_updated_at on public.cc_decisions;
create trigger cc_decisions_touch_updated_at
  before update on public.cc_decisions
  for each row
  execute function public.cc_decisions_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 3. cc_test_customers — sales/testklanten pipeline (goal-prompt §14)
-- ----------------------------------------------------------------------------
create table if not exists public.cc_test_customers (
  id uuid primary key default gen_random_uuid(),
  company_name text not null check (char_length(company_name) between 1 and 200),
  contact_person text,
  website text,
  company_type text,
  status text not null check (status in (
    'Idee / mogelijke klant',
    'Nog benaderen',
    'Benaderd',
    'Gesprek gepland',
    'Demo gegeven',
    'Testklant actief',
    'Betaalde klant',
    'Afgewezen / later'
  )) default 'Idee / mogelijke klant',
  owner text not null check (owner in ('Sebastiaan','Niels','Samen','Nog toe te wijzen')) default 'Niels',
  last_contact_date date,
  next_action text,
  notes text,
  main_problems text,
  case_study_potential boolean not null default false,
  linked_task_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cc_test_customers_status_idx on public.cc_test_customers (status);
create index if not exists cc_test_customers_owner_idx  on public.cc_test_customers (owner);

create or replace function public.cc_test_customers_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cc_test_customers_touch_updated_at on public.cc_test_customers;
create trigger cc_test_customers_touch_updated_at
  before update on public.cc_test_customers
  for each row
  execute function public.cc_test_customers_touch_updated_at();
