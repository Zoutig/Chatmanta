-- =============================================================================
-- Migration 0020 (V1) — Maandelijkse Recap: admin_monthly_recaps + _signals.
--
-- Faithful port van V0 migr 0047. Per klant per maand een recap: maandstats
-- (LIVE berekend uit threads/thread_messages/query_log, NIET opgeslagen), een
-- AI-prozasamenvatting (gpt-4o-mini), deterministische signaleringen, en
-- notities. Deze tabellen slaan ALLEEN de bewerk-/genereer-artefacten op.
--
-- V1-HARDENING t.o.v. V0:
--   * organization_id -> FK organizations(id) ON DELETE CASCADE.
--   * RLS AAN, GEEN policy: interne rapportage, geen tenant-leespad. Toegang via
--     getJorionAdminClient() (service-role). Spiegelt v1_feedback_ticket.
--   * Touch via de bestaande v1_touch_updated_at() (migr 0013).
--
-- CHECK-enums spiegelen lib/controlroom/types.ts.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. admin_monthly_recaps — 1 rij per (org, kalendermaand). Stats staan hier
--    BEWUST NIET in (live berekend). unique(org, period_month) -> upsert bij
--    (her)genereren: ai_summary + generated_at overschrijven, niels_notes blijft.
-- ----------------------------------------------------------------------------
create table if not exists public.admin_monthly_recaps (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Kalendermaand als 'YYYY-MM' (bv. '2026-05'). Tekst -> natuurlijke uniciteit.
  period_month    text not null check (period_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  ai_summary      text check (ai_summary is null or char_length(ai_summary) <= 4000),
  niels_notes     text check (niels_notes is null or char_length(niels_notes) <= 8000),
  recap_status    text not null check (recap_status in ('draft','gepubliceerd')) default 'draft',
  generated_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, period_month)
);

create index if not exists admin_monthly_recaps_org_idx
  on public.admin_monthly_recaps (organization_id, period_month desc);

alter table public.admin_monthly_recaps enable row level security;

drop trigger if exists admin_monthly_recaps_touch on public.admin_monthly_recaps;
create trigger admin_monthly_recaps_touch
  before update on public.admin_monthly_recaps
  for each row execute function public.v1_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 2. admin_recap_signals — triage-status per deterministisch signaal per recap.
--    Signaleringen zelf worden LIVE berekend; deze tabel bewaart enkel de
--    operator-triage (nieuw/genegeerd/behandeld) over (her)generaties heen.
-- ----------------------------------------------------------------------------
create table if not exists public.admin_recap_signals (
  id          uuid primary key default gen_random_uuid(),
  recap_id    uuid not null references public.admin_monthly_recaps(id) on delete cascade,
  signal_type text not null check (signal_type in (
    'kennisbank_incompleet','ontbrekende_info','gebruik_buiten_kantooruren','geen_gebruik'
  )),
  status      text not null check (status in ('nieuw','genegeerd','behandeld')) default 'nieuw',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (recap_id, signal_type)
);

create index if not exists admin_recap_signals_recap_idx
  on public.admin_recap_signals (recap_id);

alter table public.admin_recap_signals enable row level security;

drop trigger if exists admin_recap_signals_touch on public.admin_recap_signals;
create trigger admin_recap_signals_touch
  before update on public.admin_recap_signals
  for each row execute function public.v1_touch_updated_at();
