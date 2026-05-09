-- =============================================================================
-- Migration 0007 — V0.4 retrieval upgrade
--
-- Drie wijzigingen die samen het parent-document retrieval pattern enablen
-- + de selective-HyDE telemetry:
--
--   1. NEW TABLE: public.parent_chunks
--      Grotere "context" chunks (~3200 chars / ~800 tokens) die naar de LLM
--      gestuurd worden ALS de match (kleine chunk) een parent heeft. Geen
--      embeddings hier — parents worden alleen via parent_chunk_id JOIN
--      opgehaald, niet zelf doorzocht.
--
--   2. NIEUWE KOLOM: document_chunks.parent_chunk_id (nullable)
--      Backwards-compatible: bestaande chunks zonder parent blijven werken
--      door zichzelf naar de LLM te sturen (oude gedrag). Nieuwe ingest via
--      v0:reingest-parents-script vult parent_chunk_id voor alle chunks.
--      ON DELETE SET NULL: parent dropt → small chunk verliest verwijzing
--      maar blijft bestaan (re-ingest atomic-ish).
--
--   3. QUERY_LOG-KOLOMMEN voor selective-HyDE/rerank telemetry:
--      - top1_sim       : top-1 cosine similarity vóór threshold-filter
--      - hyde_triggered : werd HyDE daadwerkelijk gebruikt deze query?
--      - rerank_scores  : array van { chunk_id, score, source } na rerank
--
-- Plus een nieuwe RPC match_chunks_with_parents die in één call zowel de
-- small-chunk metadata als de parent_content levert (NULL bij geen parent).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- TABLE: parent_chunks
-- -----------------------------------------------------------------------------
create table public.parent_chunks (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  document_id     uuid        not null references public.documents(id) on delete cascade,
  parent_index    int         not null,
  content         text        not null,
  metadata        jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  constraint parent_chunks_index_chk check (parent_index >= 0),
  -- Volgorde + uniek per (document, index) zodat re-ingest idempotent kan
  -- werken via ON CONFLICT in plaats van delete-and-recreate.
  constraint parent_chunks_doc_idx_unique unique (document_id, parent_index)
);

create index parent_chunks_org_doc_idx
  on public.parent_chunks (organization_id, document_id);

alter table public.parent_chunks enable row level security;

create policy "parent_chunks_select_org_members"
  on public.parent_chunks
  for select
  to authenticated
  using (
    organization_id in (
      select organization_id
      from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- Geen INSERT/UPDATE/DELETE policy: writes via service-role (re-ingest script).


-- -----------------------------------------------------------------------------
-- ALTER: document_chunks.parent_chunk_id (nullable, backward compatible)
-- -----------------------------------------------------------------------------
alter table public.document_chunks
  add column if not exists parent_chunk_id uuid references public.parent_chunks(id) on delete set null;

create index if not exists document_chunks_parent_chunk_idx
  on public.document_chunks (parent_chunk_id)
  where parent_chunk_id is not null;


-- -----------------------------------------------------------------------------
-- ALTER: query_log selective-HyDE/rerank telemetry
-- -----------------------------------------------------------------------------
alter table public.query_log
  add column if not exists top1_sim       numeric(6,4),
  add column if not exists hyde_triggered boolean not null default false,
  add column if not exists rerank_scores  jsonb;


-- -----------------------------------------------------------------------------
-- RPC: match_chunks_with_parents
--
-- Vector match op document_chunks.embedding, joined met parent_chunks om
-- parent_content er meteen bij te leveren. Caller kan parent_content gebruiken
-- als die niet NULL is, anders content (de small chunk zelf — backward compat).
--
-- Sluit deleted_at-documents uit op SQL-niveau (zoals match_chunks /
-- match_chunks_hybrid).
-- -----------------------------------------------------------------------------
create or replace function public.match_chunks_with_parents(
  p_organization_id uuid,
  query_embedding   vector(1536),
  match_count       int default 5
)
returns table (
  id              uuid,
  document_id     uuid,
  website_page_id uuid,
  content         text,
  metadata        jsonb,
  similarity      float,
  parent_chunk_id uuid,
  parent_content  text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    c.id,
    c.document_id,
    c.website_page_id,
    c.content,
    c.metadata,
    (1 - (c.embedding <=> query_embedding))::float as similarity,
    c.parent_chunk_id,
    p.content as parent_content
  from public.document_chunks c
  left join public.documents d on d.id = c.document_id
  left join public.parent_chunks p on p.id = c.parent_chunk_id
  where c.organization_id = p_organization_id
    and (c.document_id is null or d.deleted_at is null)
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
