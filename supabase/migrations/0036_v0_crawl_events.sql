-- =============================================================================
-- Migration 0036 — V0 Crawl-events (diagnostiek-laag rond de website-crawler)
--
-- Doel: een crawl die "0 pagina's" oplevert of mislukt terwijl Firecrawl wél
-- succesvol was, moet verklaarbaar worden. Deze append-only audit-tabel legt per
-- poll/beslissing de RAUWE Firecrawl-status vast (status-string, completed/total,
-- has_next paginatie-cursor, credits, per-pagina foutjes) plus de beslissing die
-- de job-verwerker nam. Geen gedrag-wijziging — puur inzicht (zie SPEC_CRAWL_OBS).
--
-- Ontwerpkeuzes:
--   * V1-VORM (blueprint hard rule): organization_id NOT NULL + RLS aan +
--     SELECT-policy via organization_members. Mutaties lopen in V0 via
--     service-role (geen INSERT/UPDATE/DELETE-policy), net als 0032.
--   * processing_job_id NULLABLE: een start-fout gebeurt vóór de job bestaat;
--     dan willen we het event tóch kunnen vastleggen.
--   * payload jsonb is een GETRIMDE snapshot (per pagina url/statusCode/error/
--     markdownLength) — nooit de volledige markdown, gecapt in code op 60 rijen.
--   * Append-only: nooit updaten/verwijderen behalve via CASCADE als de job of
--     org verdwijnt.
-- =============================================================================

create table public.crawl_events (
  id                  uuid        primary key default gen_random_uuid(),
  organization_id     uuid        not null references public.organizations(id) on delete cascade,
  processing_job_id   uuid        references public.processing_jobs(id) on delete cascade,
  knowledge_source_id uuid        references public.knowledge_sources(id) on delete set null,
  external_job_id     text,                          -- Firecrawl batch-ID
  event_type          text        not null,
  firecrawl_status    text,                          -- rauwe status-string van Firecrawl
  completed           int,
  total               int,
  data_count          int,                           -- pagina's in déze respons
  has_next            boolean,                        -- paginatie-cursor aanwezig?
  credits_used        int,
  decision            text,                          -- genomen branch in de verwerker
  message             text,                          -- mensleesbare detail / foutmelding
  payload             jsonb       not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  constraint crawl_events_event_type_chk
    check (event_type in ('start', 'poll', 'ingest', 'complete', 'fail'))
);

create index crawl_events_job_idx
  on public.crawl_events (processing_job_id, created_at);

create index crawl_events_org_created_idx
  on public.crawl_events (organization_id, created_at desc);

alter table public.crawl_events enable row level security;

create policy "crawl_events_select_org_members"
  on public.crawl_events
  for select
  to authenticated
  using (
    organization_id in (
      select organization_id
      from public.organization_members
      where user_id = (select auth.uid())
    )
  );
-- Geen INSERT/UPDATE/DELETE-policy: mutaties via service-role-wrappers.
