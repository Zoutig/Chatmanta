-- =============================================================================
-- Migration 0025 — ChatManta Command Center (PR 1 / MVP)
--
-- Interne founder-cockpit voor Sebastiaan & Niels. Tabel cc_tasks bewaart
-- alle taken (data-model uit goal-prompt §18.1).
--
-- Scope:
--   * Geen RLS (past bij V0-sandbox-disclaimer — service-role-only access via
--     lib/commandcenter/server/storage.ts).
--   * Geen organization_id — dit is een interne tool voor twee founders, geen
--     klantdata. V0 hard rule "elke klantdata-tabel = org-scoped" is hier niet
--     van toepassing.
--   * cc_* prefix bewust gekozen om duidelijk te maken dat dit GEEN klantdata
--     is — een snelle grep '^cc_' is genoeg om te checken dat geen RLS-laag
--     wordt gemist.
--
-- Vervolg-PRs voegen cc_milestones, cc_checkins, cc_decisions, cc_customers
-- toe (zelfde patroon).
-- =============================================================================

create table if not exists public.cc_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  description text,
  project_area text not null,
  roadmap_phase text not null,
  owner text not null check (owner in ('Sebastiaan','Niels','Samen','Nog toe te wijzen')),
  status text not null check (status in ('Backlog','Deze week','Bezig','Review','Geblokkeerd','Klaar')),
  priority text not null check (priority in ('P1','P2','P3')),
  deadline date,
  impact text not null check (impact in ('Hoog','Middel','Laag')),
  effort text not null check (effort in ('Klein','Middel','Groot')),
  blocker_reason text,
  next_action text,
  labels text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists cc_tasks_owner_idx    on public.cc_tasks (owner);
create index if not exists cc_tasks_status_idx   on public.cc_tasks (status);
create index if not exists cc_tasks_priority_idx on public.cc_tasks (priority);
create index if not exists cc_tasks_deadline_idx on public.cc_tasks (deadline) where deadline is not null;

-- Auto-update updated_at on every row update.
create or replace function public.cc_tasks_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  -- completed_at sync: status -> Klaar zet completedAt, andersom leegt het.
  if new.status = 'Klaar' and (old.status is distinct from 'Klaar') then
    new.completed_at = now();
  elsif new.status <> 'Klaar' and old.status = 'Klaar' then
    new.completed_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists cc_tasks_touch_updated_at on public.cc_tasks;
create trigger cc_tasks_touch_updated_at
  before update on public.cc_tasks
  for each row
  execute function public.cc_tasks_touch_updated_at();
