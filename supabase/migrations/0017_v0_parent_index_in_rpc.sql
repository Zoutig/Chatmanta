-- =============================================================================
-- Migration 0016 — parent_index toegevoegd aan match_chunks_with_parents RPC
--
-- Doel: de bron-tab in de UI kan straks "Sectie N" als positionele context
-- tonen per opgehaalde chunk. parent_chunks.parent_index bestaat sinds 0008
-- maar werd niet door de RPC teruggegeven. We breiden alleen de RETURNS-table
-- uit met parent_index int (NULL als chunk geen parent_chunk_id heeft).
--
-- Drop+recreate is nodig omdat Postgres een wijziging van de RETURNS-shape
-- via CREATE OR REPLACE niet accepteert.
--
-- Security blijft ongewijzigd: security invoker, dezelfde SELECT-policy op
-- parent_chunks (0008) regelt tenant-isolation.
-- =============================================================================


drop function if exists public.match_chunks_with_parents(uuid, vector(1536), int);

create function public.match_chunks_with_parents(
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
  parent_content  text,
  parent_index    int
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
    p.content       as parent_content,
    p.parent_index  as parent_index
  from public.document_chunks c
  left join public.documents d on d.id = c.document_id
  left join public.parent_chunks p on p.id = c.parent_chunk_id
  where c.organization_id = p_organization_id
    and (c.document_id is null or d.deleted_at is null)
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
