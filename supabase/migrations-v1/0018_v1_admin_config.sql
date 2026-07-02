-- =============================================================================
-- Migration 0018 (V1) — admin_config: globale key/value operator-config.
--
-- Faithful port van het admin_config-deel van V0 migr 0051. Eerste gebruik:
-- key 'faq_refresh_cadence' -> value '"weekly"' | '"monthly"' (jsonb string),
-- gelezen door de FAQ-cron om de staleness-drempel te bepalen.
--
-- V1-HARDENING: RLS AAN, GEEN policy (interne operator-config, geen tenant-
-- leespad). Writes via getJorionAdminClient() (service-role). Touch via de
-- bestaande v1_touch_updated_at() (migr 0013).
-- =============================================================================

create table if not exists public.admin_config (
  key        text        primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now()
);

alter table public.admin_config enable row level security;

drop trigger if exists admin_config_touch on public.admin_config;
create trigger admin_config_touch
  before update on public.admin_config
  for each row execute function public.v1_touch_updated_at();
