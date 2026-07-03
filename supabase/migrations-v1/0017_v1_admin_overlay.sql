-- =============================================================================
-- Migration 0017 (V1) — admin-overlay: per-org admin-metadata voor /v1/admin.
--
-- Faithful port van V0 migr 0038 (admin_org_profile / admin_onboarding_items /
-- admin_privacy_settings). Bijna alle operationele data (gesprekken, bronnen,
-- jobs, usage) wordt GELEZEN uit bestaande V1-tabellen; alleen deze admin-
-- METADATA is nieuw.
--
-- V1-HARDENING t.o.v. V0:
--   * organization_id krijgt een echte FK -> organizations(id) on delete cascade
--     (V1: organizations = bron-van-waarheid; geen KNOWN_ORGS-app-constants).
--   * RLS AAN, GEEN policy: interne admin-metadata die een klant NOOIT leest.
--     Toegang uitsluitend via getJorionAdminClient() (service-role, RLS-bypass,
--     na requireJorionAdmin). Fail-closed voor session-clients. Spiegelt de
--     RLS-aan-geen-policy-keuze van v1_feedback_ticket (migr 0016).
--   * updated_at-touch via de bestaande v1_touch_updated_at() (migr 0013,
--     search_path='') i.p.v. een aparte admin_touch_updated_at().
--
-- CHECK-enums spiegelen exact lib/controlroom/types.ts; bij elke enum-wijziging
-- moeten beide meegroeien.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. admin_org_profile — 1 rij per org (commerciele laag + owners + onboarding-
--    fase + contact + next-action). Technische status wordt AFGELEID
--    (lib/controlroom/server/health.ts); technical_status_override = handmatige
--    override.
-- ----------------------------------------------------------------------------
create table if not exists public.admin_org_profile (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
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

alter table public.admin_org_profile enable row level security;

drop trigger if exists admin_org_profile_touch on public.admin_org_profile;
create trigger admin_org_profile_touch
  before update on public.admin_org_profile
  for each row execute function public.v1_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 2. admin_onboarding_items — N checklist-items per org (~20, geseed via
--    lib/controlroom/onboarding-template.ts). unique(org,key) -> idempotente seed.
-- ----------------------------------------------------------------------------
create table if not exists public.admin_onboarding_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
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

alter table public.admin_onboarding_items enable row level security;

drop trigger if exists admin_onboarding_items_touch on public.admin_onboarding_items;
create trigger admin_onboarding_items_touch
  before update on public.admin_onboarding_items
  for each row execute function public.v1_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 3. admin_privacy_settings — 1 rij per org. Retention-termijnen + AVG-vinkjes.
--    In V0 alleen getoond + opgeslagen; cleanup-cron is V2-werk.
-- ----------------------------------------------------------------------------
create table if not exists public.admin_privacy_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
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

alter table public.admin_privacy_settings enable row level security;

drop trigger if exists admin_privacy_settings_touch on public.admin_privacy_settings;
create trigger admin_privacy_settings_touch
  before update on public.admin_privacy_settings
  for each row execute function public.v1_touch_updated_at();
