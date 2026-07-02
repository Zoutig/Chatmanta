-- =============================================================================
-- Migration 0019 (V1) — admin_error_groups: centrale fout-/error-store (Issues).
--
-- Faithful port van V0 migr 0039 + 0040 (severity-guard-fix ingevouwen). De
-- persistente, fingerprint-gegroepeerde store achter de Issues-tab van het V1
-- admin-dashboard, gevuld over alle surfaces (widget/dashboard/chatbot/api/
-- cron/system). Fingerprint-grouping (Sentry-stijl): identieke fouten collapsen
-- tot een rij met count + first/last_seen. Geen per-event-tabel (bewust).
--
-- V1-HARDENING t.o.v. V0:
--   * organization_id -> FK organizations(id) ON DELETE SET NULL (nullable:
--     system/cron/globale fouten hebben geen org; org-verwijdering laat de
--     fout-historie staan maar ontkoppelt de org).
--   * RLS AAN, GEEN policy: interne observability-metadata, geen tenant-leespad.
--     Toegang via getJorionAdminClient() (service-role) + de publieke ingest-
--     route valideert de trust-boundary zelf. Spiegelt v1_feedback_ticket.
--   * admin_error_capture() krijgt `set search_path = ''` (schema-qualified refs).
-- =============================================================================

create table if not exists public.admin_error_groups (
  id              uuid primary key default gen_random_uuid(),
  -- sha256-hex (32 chars) over surface|code|genormaliseerde-topFrame|route|org,
  -- SERVER-side berekend (lib/observability/fingerprint.ts). Drijft de upsert.
  fingerprint     text not null unique,
  organization_id uuid references public.organizations(id) on delete set null,
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
  -- "Kopieer voor Claude Code"-payload.
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

alter table public.admin_error_groups enable row level security;

drop trigger if exists admin_error_groups_touch on public.admin_error_groups;
create trigger admin_error_groups_touch
  before update on public.admin_error_groups
  for each row execute function public.v1_touch_updated_at();

-- ----------------------------------------------------------------------------
-- admin_error_capture() — ATOMAIRE upsert + teller (race-vrije increment +
-- auto-reopen). supabase-js .upsert() kan `count = count + 1` niet uitdrukken.
-- Severity mag alleen OMHOOG (info < warning < error) — voorkomt dat een
-- untrusted 'info'-event een echte 'error'-groep verbergt. Auto-reopen van een
-- 'resolved'-groep + resolved_at opschonen; 'ignored' blijft 'ignored'.
-- Alle calls lopen via de service-role client (RLS-bypass).
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
set search_path = ''
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
    title        = excluded.title,
    -- severity mag alleen omhoog (downgrade-hide-guard).
    severity     = case
      when (case excluded.severity when 'error' then 3 when 'warning' then 2 else 1 end)
         > (case public.admin_error_groups.severity when 'error' then 3 when 'warning' then 2 else 1 end)
        then excluded.severity
        else public.admin_error_groups.severity
      end,
    -- auto-reopen van een afgehandelde groep + resolved_at opschonen.
    resolved_at  = case when public.admin_error_groups.status = 'resolved'
                        then null else public.admin_error_groups.resolved_at end,
    status       = case when public.admin_error_groups.status = 'resolved'
                        then 'open' else public.admin_error_groups.status end;
$$;
