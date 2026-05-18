-- =============================================================================
-- Migration 0026 — Command Center milestones + roadmap-phase status (PR 2/3)
--
-- Voegt cc_milestones toe + een lichte cc_phase_status tabel waarin we de
-- handmatige fase-status (Niet gestart / Actief / Bijna klaar / Afgerond /
-- Gepauzeerd) bewaren. De fase-defaults (titel, doel, beschrijving) zijn
-- niet in de DB maar in lib/commandcenter/roadmap-phases.ts — dat is statische
-- product-info uit goal-prompt §10.1, niet runtime-data.
--
-- Linked-tasks: opgeslagen als uuid[] op cc_milestones zodat we GEEN aparte
-- join-tabel hoeven te onderhouden voor PR 2. Bij PR 3 of later kunnen we
-- alsnog normaliseren als querying complex wordt.
-- =============================================================================

create table if not exists public.cc_milestones (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  description text,
  roadmap_phase text not null,
  owner text not null check (owner in ('Sebastiaan','Niels','Samen','Nog toe te wijzen')) default 'Nog toe te wijzen',
  status text not null check (status in ('Niet gestart','Bezig','Geblokkeerd','Afgerond')) default 'Niet gestart',
  deadline date,
  acceptance_criteria text[] not null default '{}',
  linked_task_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cc_milestones_phase_idx  on public.cc_milestones (roadmap_phase);
create index if not exists cc_milestones_status_idx on public.cc_milestones (status);

create or replace function public.cc_milestones_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cc_milestones_touch_updated_at on public.cc_milestones;
create trigger cc_milestones_touch_updated_at
  before update on public.cc_milestones
  for each row
  execute function public.cc_milestones_touch_updated_at();

-- Fase-status: één rij per roadmap_phase, alleen UPSERT vanuit de UI.
create table if not exists public.cc_phase_status (
  phase text primary key,
  status text not null check (status in ('Niet gestart','Actief','Bijna klaar','Afgerond','Gepauzeerd')) default 'Niet gestart',
  updated_at timestamptz not null default now()
);

create or replace function public.cc_phase_status_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cc_phase_status_touch_updated_at on public.cc_phase_status;
create trigger cc_phase_status_touch_updated_at
  before update on public.cc_phase_status
  for each row
  execute function public.cc_phase_status_touch_updated_at();
