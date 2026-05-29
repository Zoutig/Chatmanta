-- =============================================================================
-- Migration 0039 — admin_error_groups: centrale fout-/error-store (Issues-tab)
--
-- ChatManta had een sterk error-FRAMEWORK (lib/errors/) maar geen error-OPSLAG:
-- fouten werden geclassificeerd en daarna weggegooid (response + console). Deze
-- tabel is de persistente, fingerprint-gegroepeerde store achter de Issues-tab
-- van het Admin Dashboard, gevuld door lib/v0/server/error-capture.ts over alle
-- surfaces (widget / dashboard / chatbot / api / cron / system).
--
-- ⚠️ RLS-MODEL — volgt bewust het admin_*-precedent (migratie 0038), NIET de
-- "RLS overal" V1 hard rule:
--   * Dit is interne founder-observability-metadata, GEEN tenant-leesbare data.
--   * Geen RLS, geen organization_members-check. Toegang loopt UITSLUITEND via
--     proxy.ts (V0-gate) + requireV0Auth() (acties) + service-role wrappers
--     (lib/controlroom/server/db.ts sb(), lib/v0/server/error-capture.ts).
--   * organization_id is een PLAIN nullable uuid (GEEN FK): system/cron/globale
--     fouten hebben geen org; org-waarden worden in de app-laag tegen KNOWN_ORGS
--     gevalideerd. V1 kan FK + RLS additief toevoegen.
--
-- VOLUME: fingerprint-grouping (Sentry-stijl). Identieke fouten collapsen tot
-- één rij met count + first/last_seen. Géén per-event-tabel (bewust, V0-scope).
-- =============================================================================

create table if not exists public.admin_error_groups (
  id              uuid primary key default gen_random_uuid(),
  -- sha256-hex (32 chars) over surface|code|genormaliseerde-topFrame|route|org,
  -- SERVER-side berekend (lib/observability/fingerprint.ts). Drijft de upsert.
  fingerprint     text not null unique,
  organization_id uuid,
  surface         text not null check (surface in (
    'widget','dashboard','chatbot','api','cron','system'
  )),
  severity        text not null check (severity in ('error','warning','info')),
  code            text not null,                 -- AppErrorCode | 'CLIENT_JS' | 'UNKNOWN'
  title           text not null,
  message         text,
  count           integer not null default 1,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  status          text not null check (status in ('open','resolved','ignored')) default 'open',
  resolved_at     timestamptz,
  -- Volledige snapshot van het LAATSTE voorval (last-write-wins). Voedt de
  -- "Kopieer voor Claude Code"-payload: {requestId,stack,topFrame,url,method,
  --  route,botVersion,threadId,inputRedacted,userAgentHash,breadcrumbs?,commit,
  --  env,originSuspect?}.
  last_context    jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Default Issues-view = open + error/warning, nieuwste eerst (info verborgen).
create index if not exists admin_error_groups_triage_idx
  on public.admin_error_groups (status, severity, last_seen_at desc)
  where status = 'open';

-- Per-org detail / filter.
create index if not exists admin_error_groups_org_idx
  on public.admin_error_groups (organization_id, last_seen_at desc);

-- Hergebruik de gedeelde touch-trigger uit 0038 (admin_touch_updated_at()).
drop trigger if exists admin_error_groups_touch on public.admin_error_groups;
create trigger admin_error_groups_touch
  before update on public.admin_error_groups
  for each row execute function public.admin_touch_updated_at();

-- ----------------------------------------------------------------------------
-- admin_error_capture() — ATOMAIRE upsert + teller. supabase-js .upsert() kan
-- `count = count + 1` niet uitdrukken (zet kolommen, telt niet op), dus deze
-- ene SQL-statement is de race-vrije increment + auto-reopen. GEEN security
-- definer nodig: alle calls lopen via de service-role client (RLS is uit op
-- admin_*). Een nieuw voorval op een 'resolved'-groep heropent hem; 'ignored'
-- blijft 'ignored'.
-- ----------------------------------------------------------------------------
create or replace function public.admin_error_capture(
  p_fingerprint     text,
  p_organization_id uuid,
  p_surface         text,
  p_severity        text,
  p_code            text,
  p_title           text,
  p_message         text,
  p_context         jsonb
) returns void
language sql
as $$
  insert into public.admin_error_groups
    (fingerprint, organization_id, surface, severity, code, title, message, last_context)
  values
    (p_fingerprint, p_organization_id, p_surface, p_severity, p_code, p_title,
     p_message, coalesce(p_context, '{}'::jsonb))
  on conflict (fingerprint) do update set
    count        = public.admin_error_groups.count + 1,
    last_seen_at = now(),
    last_context = excluded.last_context,
    message      = excluded.message,
    severity     = excluded.severity,
    title        = excluded.title,
    status       = case when public.admin_error_groups.status = 'resolved'
                        then 'open' else public.admin_error_groups.status end;
$$;
