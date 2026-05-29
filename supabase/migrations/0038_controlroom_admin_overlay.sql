-- =============================================================================
-- Migration 0038 — Control Room (Admin Dashboard V0): per-org admin-overlay
--
-- De Control Room (/controlroom) is een INTERNE founder-cockpit voor Sebas +
-- Niels om testklanten (= de echte tenant-orgs uit KNOWN_ORGS) live te krijgen,
-- te monitoren en te debuggen. Bijna alle operationele data (gesprekken, bronnen,
-- jobs, usage, widget) wordt GELEZEN uit bestaande tabellen (query_log,
-- v0_threads, documents, knowledge_sources, processing_jobs, v0_org_settings).
-- Alleen de hieronder gedefinieerde admin-METADATA is nieuw.
--
-- ⚠️ RLS-MODEL — volgt bewust het cc_*-precedent (migraties 0025/0026/0027), NIET
-- de "RLS overal" V1 hard rule:
--   * Deze tabellen bevatten interne founder-metadata (commerciële status, owners,
--     notities, privacy-config) — GEEN tenant-eigen data die een klant zelf leest.
--   * Geen RLS, geen organization_members-check. Toegang loopt UITSLUITEND via:
--       1. proxy.ts (V0 demo-password gate over /controlroom)
--       2. requireV0Auth() in elke server action (app/actions/controlroom.ts)
--       3. service-role wrappers in lib/controlroom/server/*
--   * organization_id is een PLAIN uuid (GEEN FK naar organizations): de V0-orgs
--     zijn app-constants (lib/v0/server/active-org.ts KNOWN_ORGS) met stabiele
--     UUIDs; de action-laag valideert elke org-id daartegen vóór een write. Een
--     harde FK zou breken op niet-geseede orgs. V1 (organizations = bron-van-
--     waarheid) kan de FK + RLS alsnog toevoegen.
--
-- Schema's spiegelen exact de TS-unions in lib/controlroom/types.ts. CHECK-
-- constraints op enum-velden moeten bij elke enum-wijziging meegroeien.
-- =============================================================================

-- Gedeelde touch-trigger voor updated_at op de admin_* tabellen.
create or replace function public.admin_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. admin_org_profile — 1 rij per tenant-org (commerciële laag + owners +
--    onboarding-fase + contact + next-action). Technische status wordt normaal
--    AFGELEID (lib/controlroom/server/health.ts); technical_status_override
--    laat een handmatige override toe (bijv. 'disabled').
-- ----------------------------------------------------------------------------
create table if not exists public.admin_org_profile (
  organization_id uuid primary key,
  commercial_status text not null check (commercial_status in (
    'trial','active','paused','cancellation','internal_test'
  )) default 'internal_test',
  technical_status_override text check (technical_status_override in (
    'setup','ready_for_testing','live','degraded','error','disabled'
  )),
  onboarding_phase text not null check (onboarding_phase in (
    'created','website_added','content_loaded','bot_configured',
    'internal_testing','widget_shared','widget_live',
    'first_feedback_received','completed'
  )) default 'created',
  customer_owner text not null check (customer_owner in (
    'Sebastiaan','Niels','Samen','Nog toe te wijzen'
  )) default 'Niels',
  technical_owner text not null check (technical_owner in (
    'Sebastiaan','Niels','Samen','Nog toe te wijzen'
  )) default 'Sebastiaan',
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  next_action text,
  next_action_owner text check (next_action_owner in (
    'Sebastiaan','Niels','Samen','Nog toe te wijzen'
  )),
  next_action_due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists admin_org_profile_touch on public.admin_org_profile;
create trigger admin_org_profile_touch
  before update on public.admin_org_profile
  for each row execute function public.admin_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 2. admin_onboarding_items — N checklist-items per org (MD §10.4, ~20 items).
--    Geseed per org via een idempotente template-helper
--    (lib/controlroom/server/onboarding.ts).
-- ----------------------------------------------------------------------------
create table if not exists public.admin_onboarding_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  key text not null,
  label text not null,
  status text not null check (status in (
    'todo','done','blocked','not_applicable'
  )) default 'todo',
  owner text check (owner in (
    'Sebastiaan','Niels','Samen','Nog toe te wijzen'
  )),
  notes text,
  sort_order integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

create index if not exists admin_onboarding_items_org_idx
  on public.admin_onboarding_items (organization_id, sort_order);

drop trigger if exists admin_onboarding_items_touch on public.admin_onboarding_items;
create trigger admin_onboarding_items_touch
  before update on public.admin_onboarding_items
  for each row execute function public.admin_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 3. admin_privacy_settings — 1 rij per org (MD §14.7). Retention-termijnen +
--    AVG-vinkjes. In V0 worden deze ALLEEN getoond + opgeslagen; de cleanup is
--    een gedocumenteerde service (lib/controlroom/server/retention.ts), nog NIET
--    aan een cron gekoppeld. pii_redaction_enabled is een intentie-flag in V0.
-- ----------------------------------------------------------------------------
create table if not exists public.admin_privacy_settings (
  organization_id uuid primary key,
  full_conversation_logging boolean not null default true,
  chat_retention_days integer not null default 30
    check (chat_retention_days between 1 and 365),
  issue_retention_days integer not null default 90
    check (issue_retention_days between 1 and 730),
  metadata_retention_months integer not null default 12
    check (metadata_retention_months between 1 and 60),
  pii_redaction_enabled boolean not null default true,
  processor_agreement_signed boolean not null default false,
  privacy_text_shared boolean not null default false,
  subprocessor_info_shared boolean not null default false,
  last_data_export_at timestamptz,
  last_data_deletion_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists admin_privacy_settings_touch on public.admin_privacy_settings;
create trigger admin_privacy_settings_touch
  before update on public.admin_privacy_settings
  for each row execute function public.admin_touch_updated_at();
