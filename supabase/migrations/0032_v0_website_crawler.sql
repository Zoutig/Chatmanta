-- =============================================================================
-- Migration 0032 — V0 Website Crawler (Phase 5, V1-vorm, service-role-bediend)
--
-- Doel: Firecrawl-crawler-infrastructuur. Een klant voert een website-URL in →
-- Firecrawl crawlt → pagina's worden chunks/embeddings → bot gebruikt website-
-- content via dezelfde match_chunks-RPC als documenten.
--
-- Ontwerpkeuzes (spec docs/superpowers/specs/2026-05-25-firecrawl-website-crawler-design.md):
--   * Volledig V1-VORM: organization_id NOT NULL + RLS aan + SELECT-policy via
--     organization_members op élke tabel (blueprint hard rule). Mutaties lopen
--     in V0 via service-role (geen INSERT/UPDATE/DELETE-policy), net als 0002.
--   * chatbot_id NULLABLE: V0 heeft geen `chatbots`-tabel; V1 voegt de FK later
--     toe zonder migratie-breuk. Enige bewuste afwijking van de blueprint.
--   * document_chunks.website_page_id bestaat al sinds 0002 (kolom + XOR-check);
--     hier scherpen we de FK naar de nu-bestaande website_pages aan. Gecrawlde
--     chunks komen zo via dezelfde match_chunks-vector-search binnen.
--   * Idempotency bij hercrawl: DELETE website_pages WHERE knowledge_source_id=$1
--     → CASCADE ruimt de bijbehorende document_chunks. Nooit dubbele content.
-- =============================================================================


-- =============================================================================
-- TABLE: knowledge_sources — parent: één website-bron per rij
-- =============================================================================
create table public.knowledge_sources (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  chatbot_id      uuid,                         -- V1: FK naar chatbots
  type            text        not null default 'website',
  name            text        not null,
  root_url        text,                         -- start-URL van de crawl
  status          text        not null default 'pending',
  metadata        jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint knowledge_sources_type_chk
    check (type in ('website')),               -- ruimte voor 'document_set' later
  constraint knowledge_sources_status_chk
    check (status in ('pending', 'crawling', 'ready', 'failed'))
);

create index knowledge_sources_org_idx
  on public.knowledge_sources (organization_id)
  where deleted_at is null;

alter table public.knowledge_sources enable row level security;

create policy "knowledge_sources_select_org_members"
  on public.knowledge_sources
  for select
  to authenticated
  using (
    deleted_at is null
    and organization_id in (
      select organization_id
      from public.organization_members
      where user_id = (select auth.uid())
    )
  );
-- Geen INSERT/UPDATE/DELETE-policy: mutaties via service-role-wrappers.


-- =============================================================================
-- TABLE: website_pages — per gecrawlde pagina
-- =============================================================================
create table public.website_pages (
  id                  uuid        primary key default gen_random_uuid(),
  knowledge_source_id uuid        not null references public.knowledge_sources(id) on delete cascade,
  organization_id     uuid        not null references public.organizations(id) on delete cascade,
  url                 text        not null,
  title               text,
  content_text        text,                     -- bron-markdown (debug/rehash)
  content_hash        text,                     -- SHA-256 — diff bij hercrawl
  status              text        not null,
  last_crawled_at     timestamptz,
  created_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  constraint website_pages_status_chk
    check (status in ('crawled', 'failed', 'excluded'))
);

create index website_pages_source_idx
  on public.website_pages (knowledge_source_id)
  where deleted_at is null;

create index website_pages_org_idx
  on public.website_pages (organization_id)
  where deleted_at is null;

alter table public.website_pages enable row level security;

create policy "website_pages_select_org_members"
  on public.website_pages
  for select
  to authenticated
  using (
    deleted_at is null
    and organization_id in (
      select organization_id
      from public.organization_members
      where user_id = (select auth.uid())
    )
  );


-- =============================================================================
-- FK-aanscherping: document_chunks.website_page_id → website_pages
-- =============================================================================
-- Kolom + XOR-check (document_id XOR website_page_id) bestaan al sinds 0002.
-- Nu website_pages bestaat, voegen we de FK + CASCADE toe. CASCADE zorgt dat
-- het idempotency-patroon (delete website_pages) automatisch chunks opruimt.
alter table public.document_chunks
  add constraint document_chunks_website_page_fk
  foreign key (website_page_id) references public.website_pages(id) on delete cascade;


-- =============================================================================
-- TABLE: processing_jobs — achtergrond-jobqueue (cron-poll)
-- =============================================================================
create table public.processing_jobs (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  chatbot_id      uuid,
  job_type        text        not null,
  target_type     text        not null,
  target_id       uuid        not null,
  status          text        not null default 'pending',
  external_job_id text,                          -- Firecrawl crawl-ID
  attempts        int         not null default 0,-- poll-/retry-cap
  error_message   text,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint processing_jobs_job_type_chk
    check (job_type in ('crawl_website', 'process_document', 'reprocess_source', 'delete_source')),
  constraint processing_jobs_target_type_chk
    check (target_type in ('document', 'knowledge_source', 'website_page')),
  constraint processing_jobs_status_chk
    check (status in ('pending', 'processing', 'completed', 'failed'))
);

-- Gefilterde index voor de cron-poller: alleen openstaande jobs.
create index processing_jobs_open_idx
  on public.processing_jobs (status)
  where status in ('pending', 'processing');

create index processing_jobs_org_idx
  on public.processing_jobs (organization_id);

alter table public.processing_jobs enable row level security;

create policy "processing_jobs_select_org_members"
  on public.processing_jobs
  for select
  to authenticated
  using (
    organization_id in (
      select organization_id
      from public.organization_members
      where user_id = (select auth.uid())
    )
  );


-- =============================================================================
-- TABLE: usage_logs — kosten/gebruik
-- =============================================================================
create table public.usage_logs (
  id              uuid          primary key default gen_random_uuid(),
  organization_id uuid          not null references public.organizations(id) on delete cascade,
  chatbot_id      uuid,
  conversation_id uuid,
  event_type      text          not null,
  tokens_input    int           not null default 0,
  tokens_output   int           not null default 0,
  cost_eur        numeric(12,6) not null default 0,  -- best-effort; V0 USD-tracking blijft in query_log
  metadata        jsonb         not null default '{}'::jsonb,
  created_at      timestamptz   not null default now(),
  constraint usage_logs_event_type_chk
    check (event_type in ('chat_message', 'embedding', 'document_processed', 'website_crawled'))
);

create index usage_logs_org_created_idx
  on public.usage_logs (organization_id, created_at desc);

alter table public.usage_logs enable row level security;

create policy "usage_logs_select_org_members"
  on public.usage_logs
  for select
  to authenticated
  using (
    organization_id in (
      select organization_id
      from public.organization_members
      where user_id = (select auth.uid())
    )
  );
