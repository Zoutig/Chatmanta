-- 0003_v1_website_cache.sql
-- V1 PR-3 (milestone 3a) — website crawler (pages-as-documents) + answer_cache → V1.
--
-- Adds: knowledge_sources, processing_jobs, crawl_events, firecrawl_credit_log, answer_cache.
-- Extends: documents (+knowledge_source_id, +included; widen source/status CHECKs).
-- Redesigns: match_chunks_with_parents (drop+recreate → surface source_url + filter included).
--
-- Hard rules: every customer-data table carries organization_id + chatbot_id NOT NULL,
-- RLS on at creation with a SELECT policy mirroring 0001_core_tenancy membership; NO
-- INSERT/UPDATE/DELETE policies → mutations are service-role-only. firecrawl_credit_log is
-- the lone exception (account-broad internal cost telemetry, organization_id nullable, no RLS —
-- mirrors V0 0040), consistent with the audit_logs/credit-log precedent.
--
-- Pages-as-documents: a crawled page is a `documents` row (source='website',
-- metadata.source_url/source_title, knowledge_source_id). source_url is surfaced by the RPC
-- from documents.metadata — there is NO website_pages table, so NO website JOIN.
--
-- Applied to the V1 project (ref tfijdnxqdvwzwgxdioqo) via Supabase MCP apply_migration
-- + a manual public._migrations ledger row (dev-machine pooler is blocked).

-- vector lives in the extensions schema in V1 (see 0002). Pin search_path so DDL +
-- the <=> operator in the RPCs resolve deterministically.
set search_path = public, extensions, pg_temp;

-- ===========================================================================
-- 1. knowledge_sources — crawl grouping / dedup / status (port V0 0032/0037)
-- ===========================================================================
create table public.knowledge_sources (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  chatbot_id      uuid        not null references public.chatbots(id) on delete cascade,
  type            text        not null default 'website',
  name            text        not null,
  root_url        text,
  normalized_host text,
  status          text        not null default 'pending',
  disabled_at     timestamptz,
  metadata        jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint knowledge_sources_type_chk   check (type in ('website')),
  constraint knowledge_sources_status_chk check (status in ('pending','crawling','ready','failed'))
);
create index knowledge_sources_org_idx
  on public.knowledge_sources (organization_id) where deleted_at is null;
-- one active website source per (org, chatbot, host); re-crawl reuses the winner (23505 race)
create unique index knowledge_sources_host_unique
  on public.knowledge_sources (organization_id, chatbot_id, normalized_host)
  where type = 'website' and deleted_at is null and normalized_host is not null;

alter table public.knowledge_sources enable row level security;
create policy "knowledge_sources_select_org_members"
  on public.knowledge_sources for select to authenticated
  using (
    deleted_at is null
    and organization_id in (
      select organization_id from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- ===========================================================================
-- 2. processing_jobs — crawl job lifecycle (port V0 0032; CHECKs narrowed to
--    the values PR-3 actually produces — widen when async doc-processing ships)
-- ===========================================================================
create table public.processing_jobs (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  chatbot_id      uuid        not null references public.chatbots(id) on delete cascade,
  job_type        text        not null,
  target_type     text        not null,
  target_id       uuid,
  status          text        not null default 'pending',
  external_job_id text,
  attempts        int         not null default 0,
  error_message   text,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint processing_jobs_type_chk        check (job_type in ('crawl_website')),
  constraint processing_jobs_target_type_chk check (target_type in ('knowledge_source')),
  constraint processing_jobs_status_chk      check (status in ('pending','processing','completed','failed'))
);
-- partial index drives the open-jobs poll (client-tick + cron)
create index processing_jobs_open_idx
  on public.processing_jobs (status) where status in ('pending','processing');
create index processing_jobs_org_idx
  on public.processing_jobs (organization_id, created_at desc);

alter table public.processing_jobs enable row level security;
create policy "processing_jobs_select_org_members"
  on public.processing_jobs for select to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- ===========================================================================
-- 3. crawl_events — append-only crawl diagnostics (port V0 0036; + chatbot_id)
-- ===========================================================================
create table public.crawl_events (
  id                  uuid        primary key default gen_random_uuid(),
  organization_id     uuid        not null references public.organizations(id) on delete cascade,
  chatbot_id          uuid        not null references public.chatbots(id) on delete cascade,
  processing_job_id   uuid        references public.processing_jobs(id) on delete cascade,
  knowledge_source_id uuid        references public.knowledge_sources(id) on delete set null,
  external_job_id     text,
  event_type          text        not null,
  firecrawl_status    text,
  completed           int,
  total               int,
  data_count          int,
  credits_used        int,
  has_next            boolean,
  decision            text,
  message             text,
  payload             jsonb,
  created_at          timestamptz not null default now(),
  -- matches live V0 0036 union (the 'ingest' value is allowed but never emitted by the code)
  constraint crawl_events_event_type_chk check (event_type in ('start','poll','ingest','complete','fail'))
);
create index crawl_events_job_idx on public.crawl_events (processing_job_id, created_at);
create index crawl_events_org_idx on public.crawl_events (organization_id, created_at desc);

alter table public.crawl_events enable row level security;
create policy "crawl_events_select_org_members"
  on public.crawl_events for select to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- ===========================================================================
-- 4. firecrawl_credit_log — account-broad Firecrawl cost telemetry (port V0 0040)
--    RLS enabled with NO policy → service-role-only. Account-broad internal tooling
--    (organization_id nullable, no per-org reader in V1). Stricter than V0 0040's
--    no-RLS: the V1 hard rule + the rls_disabled_in_public advisor require RLS on
--    every public table; service-role (the only writer + future reader) bypasses it.
-- ===========================================================================
create table public.firecrawl_credit_log (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        references public.organizations(id) on delete set null,
  operation       text        not null,
  credits         int         not null default 0,
  created_at      timestamptz not null default now(),
  constraint firecrawl_credit_log_operation_chk check (operation in ('map','sitemap','scrape','screenshot'))
);
create index firecrawl_credit_log_created_idx on public.firecrawl_credit_log (created_at desc);
-- RLS on, no policy: blocks PostgREST/anon/authenticated reads; service-role bypasses.
alter table public.firecrawl_credit_log enable row level security;

-- ===========================================================================
-- 5. documents — extend for the website source (pages-as-documents)
-- ===========================================================================
alter table public.documents
  add column knowledge_source_id uuid references public.knowledge_sources(id) on delete cascade,
  add column included            boolean not null default true;

-- widen CHECKs: source gains 'website'; status gains 'excluded' (empty-markdown pages)
alter table public.documents drop constraint documents_source_chk;
alter table public.documents add  constraint documents_source_chk
  check (source in ('upload','v0_local','website'));
alter table public.documents drop constraint documents_status_chk;
alter table public.documents add  constraint documents_status_chk
  check (status in ('pending','processing','ready','failed','excluded'));

create index documents_knowledge_source_idx
  on public.documents (knowledge_source_id) where knowledge_source_id is not null;

-- ===========================================================================
-- 6. answer_cache — engine semantic cache (port V0 0004; + chatbot_id in the key)
--    Writes are service-role-only (SELECT policy only); the engine injects a
--    service-role client for INSERT/last_hit_at (the session-client can't write
--    under this RLS). V1 has no FAQ pre-cache, so this table is engine-only.
-- ===========================================================================
create table public.answer_cache (
  id                 uuid         primary key default gen_random_uuid(),
  organization_id    uuid         not null references public.organizations(id) on delete cascade,
  chatbot_id         uuid         not null references public.chatbots(id) on delete cascade,
  bot_version        text         not null,
  question           text         not null,
  question_embedding vector(1536) not null,
  response_json      jsonb        not null,
  hit_count          int          not null default 0,
  created_at         timestamptz  not null default now(),
  last_hit_at        timestamptz
);
create index answer_cache_embedding_idx
  on public.answer_cache using hnsw (question_embedding vector_cosine_ops);
create index answer_cache_org_chatbot_version_idx
  on public.answer_cache (organization_id, chatbot_id, bot_version);

alter table public.answer_cache enable row level security;
create policy "answer_cache_select_org_members"
  on public.answer_cache for select to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- ===========================================================================
-- 7. lookup_cached_answer — cache lookup (port V0 0004; + p_chatbot_id filter,
--    + extensions search_path so the <=> operator resolves in V1)
-- ===========================================================================
create or replace function public.lookup_cached_answer(
  p_organization_id uuid,
  p_chatbot_id      uuid,
  p_bot_version     text,
  query_embedding   vector(1536),
  min_similarity    float default 0.97
)
returns table (
  id            uuid,
  question      text,
  response_json jsonb,
  similarity    float
)
language sql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
  select
    id, question, response_json,
    (1 - (question_embedding <=> query_embedding))::float as similarity
  from public.answer_cache
  where organization_id = p_organization_id
    and chatbot_id = p_chatbot_id
    and bot_version = p_bot_version
    and 1 - (question_embedding <=> query_embedding) >= min_similarity
  order by question_embedding <=> query_embedding
  limit 1;
$$;

-- ===========================================================================
-- 8. match_chunks_with_parents — drop+recreate (RETURNS shape changes)
--    Adds source_url (from documents.metadata) + an `and d.included` filter.
--    Pages-as-documents → NO website_pages JOIN. Keeps p_chatbot_id,
--    security invoker, extensions search_path, defense-in-depth org+chatbot joins.
--    NB: drop targets the V1 4-arg signature, not V0's 3-arg.
-- ===========================================================================
drop function if exists public.match_chunks_with_parents(uuid, uuid, vector(1536), int);
create or replace function public.match_chunks_with_parents(
  p_organization_id uuid,
  p_chatbot_id      uuid,
  query_embedding   vector(1536),
  match_count       int default 5
)
returns table (
  id              uuid,
  document_id     uuid,
  content         text,
  metadata        jsonb,
  similarity      float,
  parent_chunk_id uuid,
  parent_content  text,
  parent_index    int,
  source_url      text
)
language sql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
  select
    c.id,
    c.document_id,
    c.content,
    c.metadata,
    (1 - (c.embedding <=> query_embedding))::float as similarity,
    c.parent_chunk_id,
    p.content      as parent_content,
    p.parent_index as parent_index,
    d.metadata->>'source_url' as source_url
  from public.document_chunks c
  join public.documents d on d.id = c.document_id and d.chatbot_id = c.chatbot_id
  left join public.parent_chunks p
    on p.id = c.parent_chunk_id and p.organization_id = c.organization_id and p.chatbot_id = c.chatbot_id
  where c.organization_id = p_organization_id
    and c.chatbot_id = p_chatbot_id
    and d.deleted_at is null
    and d.included = true
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
