-- 0002_v1_rag_core.sql
-- V1 RAG retrieval-core: chatbots + documents + parent_chunks + document_chunks + query_log
-- + document-only match_chunks_with_parents-RPC. Alles org+chatbot-geïsoleerd, RLS aan,
-- SELECT-policies spiegelen het 0001_core_tenancy-membership-patroon (service-role schrijft).
-- Geport uit V0 0002/0003/0004/0008/0042, gevouwen tot één migratie + chatbot_id/p_chatbot_id.
-- Document-only (PR-1): geen website_page_id, geen answer_cache, geen hybrid-RPC.

-- Supabase: vector in de `extensions`-schema (pgcrypto staat daar ook). Expliciete
-- search_path zodat de DDL (vector(1536), vector_cosine_ops) én de RPC (<=> operator)
-- deterministisch resolven — vermijdt de extension_in_public-advisor.
set search_path = public, extensions, pg_temp;
create extension if not exists vector with schema extensions;

-- 1. chatbots (net-new in V1; één actieve per org) --------------------------
create table public.chatbots (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  name            text        not null,
  bot_version     text        not null default 'v1.0',
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create unique index chatbots_one_active_per_org
  on public.chatbots (organization_id) where deleted_at is null;

alter table public.chatbots enable row level security;
create policy "chatbots_select_org_members"
  on public.chatbots for select to authenticated
  using (
    deleted_at is null
    and organization_id in (
      select organization_id from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- 2. documents --------------------------------------------------------------
create table public.documents (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  chatbot_id      uuid        not null references public.chatbots(id) on delete cascade,
  filename        text        not null,
  source          text        not null,
  status          text        not null default 'ready',
  metadata        jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint documents_status_chk check (status in ('pending','processing','ready','failed')),
  constraint documents_source_chk check (source in ('upload','v0_local'))
);
create index documents_org_idx     on public.documents (organization_id) where deleted_at is null;
create index documents_chatbot_idx on public.documents (chatbot_id)      where deleted_at is null;

alter table public.documents enable row level security;
create policy "documents_select_org_members"
  on public.documents for select to authenticated
  using (
    deleted_at is null
    and organization_id in (
      select organization_id from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- 3. parent_chunks ----------------------------------------------------------
create table public.parent_chunks (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  chatbot_id      uuid        not null references public.chatbots(id) on delete cascade,
  document_id     uuid        not null references public.documents(id) on delete cascade,
  parent_index    int         not null,
  content         text        not null,
  metadata        jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  constraint parent_chunks_index_chk check (parent_index >= 0),
  constraint parent_chunks_doc_idx_unique unique (document_id, parent_index)
);
create index parent_chunks_org_doc_idx on public.parent_chunks (organization_id, document_id);

alter table public.parent_chunks enable row level security;
create policy "parent_chunks_select_org_members"
  on public.parent_chunks for select to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- 4. document_chunks (document-only: geen website_page_id) -------------------
create table public.document_chunks (
  id              uuid         primary key default gen_random_uuid(),
  organization_id uuid         not null references public.organizations(id) on delete cascade,
  chatbot_id      uuid         not null references public.chatbots(id) on delete cascade,
  document_id     uuid         not null references public.documents(id) on delete cascade,
  content         text         not null,
  embedding       vector(1536) not null,
  content_tsv     tsvector     generated always as (to_tsvector('dutch', content)) stored,
  parent_chunk_id uuid         references public.parent_chunks(id) on delete set null,
  metadata        jsonb        not null default '{}'::jsonb,
  created_at      timestamptz  not null default now()
);
create index document_chunks_org_doc_idx     on public.document_chunks (organization_id, document_id);
create index document_chunks_chatbot_idx      on public.document_chunks (chatbot_id);
create index document_chunks_embedding_idx    on public.document_chunks using hnsw (embedding vector_cosine_ops);
create index document_chunks_content_tsv_idx  on public.document_chunks using gin (content_tsv);
create index document_chunks_parent_chunk_idx on public.document_chunks (parent_chunk_id) where parent_chunk_id is not null;

alter table public.document_chunks enable row level security;
create policy "document_chunks_select_org_members"
  on public.document_chunks for select to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- 5. query_log (44 V0-kolommen gevouwen + chatbot_id; append-only via service-role)
-- NB: in PR-1b wordt query_log nog NIET geschreven (geen logQuery-port) — tabel staat klaar.
create table public.query_log (
  id                       uuid          primary key default gen_random_uuid(),
  organization_id          uuid          not null references public.organizations(id) on delete cascade,
  chatbot_id               uuid          not null references public.chatbots(id) on delete cascade,
  bot_version              text          not null,
  kind                     text          not null,
  question                 text          not null,
  rewritten                text,
  threshold                numeric(4,2),
  top_similarity           numeric(6,4),
  source_count             int           not null default 0,
  answer                   text          not null,
  embed_tokens             int           not null default 0,
  chat_in_tokens           int           not null default 0,
  chat_out_tokens          int           not null default 0,
  pre_in_tokens            int           not null default 0,
  pre_out_tokens           int           not null default 0,
  cost_usd                 numeric(10,6) not null default 0,
  created_at               timestamptz   not null default now(),
  tone                     text,
  length                   text,
  top1_sim                 numeric(6,4),
  hyde_triggered           boolean       not null default false,
  rerank_scores            jsonb,
  claim_confidence         numeric(4,2),
  embedding_ms             int,
  retrieval_ms             int,
  rerank_ms                int,
  generation_ms            int,
  total_ms                 int,
  phase_timings_ms         jsonb,
  injection_detected       boolean       not null default false,
  injection_pattern        text,
  from_cache               boolean       not null default false,
  hyde_mode_requested      text,
  hyde_mode_actual         text,
  hyde_ms                  int,
  hyde_document            text,
  category                 text,
  request_id               text,
  general_knowledge_actual boolean,
  hard_fact_supported      boolean,
  missing_hard_facts       jsonb,
  gap_kind                 text,
  adaptive_decision        jsonb,
  first_token_ms           int,
  constraint query_log_kind_chk   check (kind in ('smalltalk','answer','fallback','blocked')),
  constraint query_log_tone_chk   check (tone is null or tone in ('formal','neutral','casual','persoonlijk')),
  constraint query_log_length_chk check (length is null or length in ('short','medium','detailed')),
  constraint query_log_hyde_mode_requested_chk check (hyde_mode_requested is null or hyde_mode_requested in ('auto','off','upfront','selective')),
  constraint query_log_hyde_mode_actual_chk    check (hyde_mode_actual    is null or hyde_mode_actual    in ('off','upfront','selective'))
);
create index query_log_org_created_idx  on public.query_log (organization_id, created_at desc);
create index query_log_org_version_idx  on public.query_log (organization_id, bot_version);
create index query_log_org_chatbot_idx  on public.query_log (organization_id, chatbot_id, created_at desc);
create index query_log_org_style_idx    on public.query_log (organization_id, tone, length);
create index query_log_injection_idx    on public.query_log (organization_id, created_at desc) where injection_detected = true;
create index query_log_from_cache_idx   on public.query_log (organization_id, from_cache, created_at desc);
create index query_log_org_hyde_idx     on public.query_log (organization_id, bot_version, hyde_mode_actual);
create index query_log_request_id_idx   on public.query_log (request_id) where request_id is not null;
create index query_log_hard_fact_unsupported_idx
  on public.query_log (organization_id, bot_version, created_at desc) where hard_fact_supported = false;
create index query_log_gap_kind_idx
  on public.query_log (organization_id, bot_version, gap_kind, created_at desc) where gap_kind is not null;

alter table public.query_log enable row level security;
create policy "query_log_select_org_members"
  on public.query_log for select to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- 6. match_chunks_with_parents (document-only + p_chatbot_id; security invoker)
create function public.match_chunks_with_parents(
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
  parent_index    int
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
    p.parent_index as parent_index
  from public.document_chunks c
  join public.documents d on d.id = c.document_id
  left join public.parent_chunks p on p.id = c.parent_chunk_id
  where c.organization_id = p_organization_id
    and c.chatbot_id = p_chatbot_id
    and d.deleted_at is null
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

-- ponytail: match_chunks (non-parents) + match_chunks_hybrid NIET geport — V1-config
-- pint parentDocumentRetrieval:true + hybridSearch:false, dus de motor roept alléén
-- match_chunks_with_parents aan. Ceiling: een config-flip naar false zou een
-- ontbrekende-functie-fout geven (faalt closed). Opwaardeerpad: PR-3 (hybrid).
